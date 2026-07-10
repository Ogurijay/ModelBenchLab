import { ElementId, getElement } from "./elements";
import type { EnvironmentSettings } from "./types";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const blocksAir = (id: number): boolean => {
  if (id === ElementId.Empty) return false;
  const element = getElement(id);
  return element.immovable && element.state === "solid";
};

export class AirField {
  readonly pressure: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly heat: Float32Array;

  private readonly nextPressure: Float32Array;
  private readonly nextVx: Float32Array;
  private readonly nextVy: Float32Array;
  private readonly nextHeat: Float32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    ambientTemp = 22
  ) {
    const size = width * height;
    this.pressure = new Float32Array(size);
    this.vx = new Float32Array(size);
    this.vy = new Float32Array(size);
    this.heat = new Float32Array(size);
    this.nextPressure = new Float32Array(size);
    this.nextVx = new Float32Array(size);
    this.nextVy = new Float32Array(size);
    this.nextHeat = new Float32Array(size);
    this.heat.fill(ambientTemp);
    this.nextHeat.fill(ambientTemp);
  }

  clear(settings: EnvironmentSettings): void {
    this.pressure.fill(settings.ambientPressure);
    this.vx.fill(settings.ambientVx);
    this.vy.fill(settings.ambientVy);
    this.heat.fill(settings.ambientTemp);
  }

  update(ids: Uint8Array, particleTemp: Float32Array, settings: EnvironmentSettings): void {
    const { width, height } = this;
    const ambientP = settings.ambientPressure;

    for (let y = 1; y < height - 1; y += 1) {
      const row = y * width;
      for (let x = 1; x < width - 1; x += 1) {
        const i = row + x;
        if (blocksAir(ids[i] ?? ElementId.Empty)) {
          this.nextPressure[i] = ambientP;
          this.nextVx[i] = 0;
          this.nextVy[i] = 0;
          this.nextHeat[i] = particleTemp[i] ?? settings.ambientTemp;
          continue;
        }

        const left = i - 1;
        const right = i + 1;
        const up = i - width;
        const down = i + width;
        const p = this.pressure[i] ?? ambientP;
        const averageP = ((this.pressure[left] ?? ambientP) + (this.pressure[right] ?? ambientP) + (this.pressure[up] ?? ambientP) + (this.pressure[down] ?? ambientP)) * 0.25;
        const divergence = ((this.vx[right] ?? 0) - (this.vx[left] ?? 0) + (this.vy[down] ?? 0) - (this.vy[up] ?? 0)) * 0.5;
        const pressure = clamp(p + (averageP - p) * 0.19 - divergence * 0.07 + (ambientP - p) * 0.003, -24, 24);

        const gradientX = ((this.pressure[left] ?? ambientP) - (this.pressure[right] ?? ambientP)) * 0.055;
        const gradientY = ((this.pressure[up] ?? ambientP) - (this.pressure[down] ?? ambientP)) * 0.055;
        const averageVx = ((this.vx[left] ?? 0) + (this.vx[right] ?? 0) + (this.vx[up] ?? 0) + (this.vx[down] ?? 0)) * 0.25;
        const averageVy = ((this.vy[left] ?? 0) + (this.vy[right] ?? 0) + (this.vy[up] ?? 0) + (this.vy[down] ?? 0)) * 0.25;

        const curl = ((this.vy[right] ?? 0) - (this.vy[left] ?? 0)) - ((this.vx[down] ?? 0) - (this.vx[up] ?? 0));
        const vortexX = -Math.sign(curl) * settings.vorticity * 0.012;
        const vortexY = Math.sign(curl) * settings.vorticity * 0.012;

        this.nextPressure[i] = pressure;
        this.nextVx[i] = clamp(((this.vx[i] ?? 0) * 0.72 + averageVx * 0.24 + gradientX + vortexX + settings.ambientVx * 0.004) * 0.994, -6, 6);
        this.nextVy[i] = clamp(((this.vy[i] ?? 0) * 0.72 + averageVy * 0.24 + gradientY + vortexY + settings.ambientVy * 0.004) * 0.994, -6, 6);

        if (settings.airHeat) {
          const averageHeat = ((this.heat[left] ?? settings.ambientTemp) + (this.heat[right] ?? settings.ambientTemp) + (this.heat[up] ?? settings.ambientTemp) + (this.heat[down] ?? settings.ambientTemp)) * 0.25;
          const source = ids[i] === ElementId.Empty ? averageHeat : particleTemp[i] ?? averageHeat;
          this.nextHeat[i] = clamp((this.heat[i] ?? settings.ambientTemp) + (averageHeat - (this.heat[i] ?? settings.ambientTemp)) * 0.08 + (source - (this.heat[i] ?? settings.ambientTemp)) * 0.018 + (settings.ambientTemp - (this.heat[i] ?? settings.ambientTemp)) * 0.0008, -273, 5_000);
        } else {
          this.nextHeat[i] = settings.ambientTemp;
        }
      }
    }

    this.copyEdges(settings);
    this.pressure.set(this.nextPressure);
    this.vx.set(this.nextVx);
    this.vy.set(this.nextVy);
    this.heat.set(this.nextHeat);
  }

  inject(x: number, y: number, pressure: number, vx: number, vy: number, radius = 2, heat?: number): void {
    const r2 = radius * radius;
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        const d2 = ox * ox + oy * oy;
        if (d2 > r2) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (nx <= 0 || nx >= this.width - 1 || ny <= 0 || ny >= this.height - 1) continue;
        const i = ny * this.width + nx;
        const falloff = 1 - Math.sqrt(d2) / (radius + 0.5);
        this.pressure[i] = clamp((this.pressure[i] ?? 0) + pressure * falloff, -24, 24);
        this.vx[i] = clamp((this.vx[i] ?? 0) + vx * falloff, -6, 6);
        this.vy[i] = clamp((this.vy[i] ?? 0) + vy * falloff, -6, 6);
        if (heat !== undefined) this.heat[i] = clamp((this.heat[i] ?? 22) + (heat - (this.heat[i] ?? 22)) * falloff * 0.35, -273, 5_000);
      }
    }
  }

  private copyEdges(settings: EnvironmentSettings): void {
    const { width, height } = this;
    for (let x = 0; x < width; x += 1) {
      this.setEdge(x, 0, settings);
      this.setEdge(x, height - 1, settings);
    }
    for (let y = 1; y < height - 1; y += 1) {
      this.setEdge(0, y, settings);
      this.setEdge(width - 1, y, settings);
    }
  }

  private setEdge(x: number, y: number, settings: EnvironmentSettings): void {
    const i = y * this.width + x;
    this.nextPressure[i] = settings.ambientPressure;
    this.nextVx[i] = settings.ambientVx;
    this.nextVy[i] = settings.ambientVy;
    this.nextHeat[i] = settings.ambientTemp;
  }
}

