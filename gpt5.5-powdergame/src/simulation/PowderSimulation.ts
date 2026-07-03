import {
  ELEMENTS,
  ElementId,
  isConductive
} from "./elements";
import type {
  AmbientSettings,
  BrushSelection,
  ElementDefinition,
  SimulationStats
} from "./types";

const NEIGHBORS_4: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
];

const NEIGHBORS_8: Array<[number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
];

export class PowderSimulation {
  readonly width: number;
  readonly height: number;
  readonly size: number;
  readonly ids: Uint8Array;
  readonly temp: Float32Array;
  readonly pressure: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Uint16Array;
  readonly ctype: Uint8Array;

  ambient: AmbientSettings = {
    gravity: 1,
    windX: 0,
    windY: 0,
    ambientPressure: 0,
    vorticity: 0.12,
    airHeatConvection: true
  };

  frame = 0;
  private seed = 0x5eed1234;
  private readonly updated: Uint32Array;
  private readonly scratchPressure: Float32Array;
  private readonly scratchVx: Float32Array;
  private readonly scratchVy: Float32Array;

  constructor(width = 240, height = 160) {
    this.width = width;
    this.height = height;
    this.size = width * height;
    this.ids = new Uint8Array(this.size);
    this.temp = new Float32Array(this.size);
    this.pressure = new Float32Array(this.size);
    this.vx = new Float32Array(this.size);
    this.vy = new Float32Array(this.size);
    this.life = new Uint16Array(this.size);
    this.ctype = new Uint8Array(this.size);
    this.updated = new Uint32Array(this.size);
    this.scratchPressure = new Float32Array(this.size);
    this.scratchVx = new Float32Array(this.size);
    this.scratchVy = new Float32Array(this.size);
    this.temp.fill(22);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getElement(x: number, y: number): ElementId {
    if (!this.inBounds(x, y)) {
      return ElementId.Wall;
    }
    return this.ids[this.index(x, y)] as ElementId;
  }

  setElement(x: number, y: number, id: ElementId, temp?: number, ctype = ElementId.Empty): void {
    if (!this.inBounds(x, y)) {
      return;
    }
    this.setCell(this.index(x, y), id, temp, ctype);
  }

  clear(): void {
    this.ids.fill(ElementId.Empty);
    this.temp.fill(22);
    this.pressure.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    this.life.fill(0);
    this.ctype.fill(0);
  }

  paintDisc(
    cx: number,
    cy: number,
    radius: number,
    brush: BrushSelection,
    vector = { x: 0, y: 0 }
  ): void {
    const r = Math.max(1, Math.floor(radius));
    const r2 = r * r;
    for (let y = cy - r; y <= cy + r; y += 1) {
      for (let x = cx - r; x <= cx + r; x += 1) {
        if (!this.inBounds(x, y)) {
          continue;
        }
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r2) {
          continue;
        }
        const i = this.index(x, y);
        if (brush.type === "element") {
          this.setCell(i, brush.element);
        } else {
          this.applyTool(i, brush.tool, vector, Math.max(0.2, 1 - Math.hypot(dx, dy) / (r + 0.01)));
        }
      }
    }
  }

  step(iterations = 1): void {
    for (let i = 0; i < iterations; i += 1) {
      this.frame = (this.frame + 1) >>> 0;
      if (this.frame === 0) {
        this.updated.fill(0);
        this.frame = 1;
      }
      this.relaxAirFields();
      this.conductHeat();
      this.updateParticles();
    }
  }

  stats(): SimulationStats {
    let particles = 0;
    let tempSum = 0;
    let pressureSum = 0;
    let maxTemp = -Infinity;
    for (let i = 0; i < this.size; i += 1) {
      if (this.ids[i] !== ElementId.Empty) {
        particles += 1;
        tempSum += this.temp[i];
        maxTemp = Math.max(maxTemp, this.temp[i]);
      }
      pressureSum += this.pressure[i];
    }
    return {
      frame: this.frame,
      particles,
      avgTemp: particles ? tempSum / particles : 22,
      avgPressure: pressureSum / this.size,
      maxTemp: Number.isFinite(maxTemp) ? maxTemp : 22
    };
  }

  toJSON(): string {
    return JSON.stringify({
      version: 1,
      width: this.width,
      height: this.height,
      ids: Array.from(this.ids),
      temp: Array.from(this.temp, (v) => Math.round(v * 10) / 10),
      pressure: Array.from(this.pressure, (v) => Math.round(v * 100) / 100),
      vx: Array.from(this.vx, (v) => Math.round(v * 100) / 100),
      vy: Array.from(this.vy, (v) => Math.round(v * 100) / 100),
      life: Array.from(this.life),
      ctype: Array.from(this.ctype),
      ambient: this.ambient
    });
  }

  loadJSON(payload: string): void {
    const data = JSON.parse(payload) as {
      width: number;
      height: number;
      ids: number[];
      temp: number[];
      pressure: number[];
      vx: number[];
      vy: number[];
      life: number[];
      ctype: number[];
      ambient?: AmbientSettings;
    };
    if (data.width !== this.width || data.height !== this.height || data.ids.length !== this.size) {
      throw new Error("保存尺寸与当前画布不一致");
    }
    this.ids.set(data.ids);
    this.temp.set(data.temp);
    this.pressure.set(data.pressure);
    this.vx.set(data.vx);
    this.vy.set(data.vy);
    this.life.set(data.life);
    this.ctype.set(data.ctype);
    if (data.ambient) {
      this.ambient = { ...this.ambient, ...data.ambient };
    }
  }

  createPreset(name: "volcano" | "reactor" | "circuit" | "garden" | "storm"): void {
    this.clear();
    const groundY = Math.floor(this.height * 0.76);
    for (let x = 0; x < this.width; x += 1) {
      for (let y = groundY; y < this.height; y += 1) {
        const edge = y === groundY && this.random() < 0.35;
        this.setElement(x, y, edge ? ElementId.Sand : ElementId.Stone);
      }
    }

    if (name === "volcano") {
      for (let x = 78; x < 162; x += 1) {
        const peak = groundY - Math.floor(42 - Math.abs(x - 120) * 0.75);
        for (let y = Math.max(20, peak); y < groundY; y += 1) {
          this.setElement(x, y, Math.abs(x - 120) < 10 ? ElementId.Lava : ElementId.Stone);
        }
      }
      for (let x = 10; x < 74; x += 1) {
        for (let y = groundY - 22; y < groundY - 1; y += 1) {
          this.setElement(x, y, ElementId.Water);
        }
      }
      this.paintDisc(120, groundY - 58, 9, { type: "element", element: ElementId.Plasma });
    }

    if (name === "reactor") {
      for (let x = 62; x < 178; x += 1) {
        this.setElement(x, groundY - 50, ElementId.Metal);
        this.setElement(x, groundY - 8, ElementId.Metal);
      }
      for (let y = groundY - 50; y <= groundY - 8; y += 1) {
        this.setElement(62, y, ElementId.Metal);
        this.setElement(177, y, ElementId.Metal);
      }
      for (let x = 74; x < 166; x += 1) {
        for (let y = groundY - 46; y < groundY - 11; y += 1) {
          this.setElement(x, y, y > groundY - 25 ? ElementId.Water : ElementId.Uranium);
        }
      }
      this.setElement(118, groundY - 58, ElementId.Neutron);
      this.setElement(122, groundY - 58, ElementId.Neutron);
    }

    if (name === "circuit") {
      for (let x = 38; x < 202; x += 1) {
        this.setElement(x, 62, x % 16 < 8 ? ElementId.Wire : ElementId.Copper);
      }
      for (let y = 62; y < 122; y += 1) {
        this.setElement(38, y, ElementId.Wire);
        this.setElement(201, y, ElementId.Wire);
      }
      this.setElement(38, 62, ElementId.Battery);
      for (let x = 90; x < 150; x += 1) {
        this.setElement(x, 96, ElementId.Semiconductor);
      }
      this.paintDisc(120, 90, 12, { type: "element", element: ElementId.Hydrogen });
      this.paintDisc(122, 90, 8, { type: "element", element: ElementId.Oxygen });
    }

    if (name === "garden") {
      for (let x = 18; x < 92; x += 1) {
        for (let y = groundY - 18; y < groundY - 1; y += 1) {
          this.setElement(x, y, ElementId.Water);
        }
      }
      for (let x = 110; x < 180; x += 6) {
        this.setElement(x, groundY - 1, ElementId.Seed);
      }
      for (let x = 190; x < 220; x += 1) {
        for (let y = groundY - 30; y < groundY - 1; y += 1) {
          this.setElement(x, y, ElementId.Wood);
        }
      }
    }

    if (name === "storm") {
      for (let x = 20; x < 220; x += 1) {
        for (let y = 104; y < 136; y += 1) {
          this.setElement(x, y, ElementId.Water);
        }
      }
      this.paintDisc(70, 36, 18, { type: "element", element: ElementId.Hydrogen });
      this.paintDisc(126, 42, 20, { type: "element", element: ElementId.Oxygen });
      this.paintDisc(164, 48, 8, { type: "element", element: ElementId.Plasma });
      this.ambient.windX = 0.9;
      this.ambient.windY = -0.15;
      this.ambient.ambientPressure = 0.4;
    }
  }

  private setCell(i: number, id: ElementId, temp?: number, ctype = ElementId.Empty): void {
    const definition = ELEMENTS[id];
    this.ids[i] = id;
    this.temp[i] = temp ?? definition.defaultTemp ?? (id === ElementId.Empty ? 22 : this.temp[i] || 22);
    this.life[i] = this.defaultLife(id);
    this.ctype[i] = ctype;
    if (id === ElementId.Empty) {
      this.pressure[i] *= 0.92;
      this.vx[i] *= 0.5;
      this.vy[i] *= 0.5;
      this.ctype[i] = 0;
    }
    if (id === ElementId.Photon && ctype === ElementId.Empty) {
      this.ctype[i] = this.random() < 0.5 ? 1 : 255;
    }
  }

  private defaultLife(id: ElementId): number {
    switch (id) {
      case ElementId.Fire:
        return 18 + this.randomInt(20);
      case ElementId.Plasma:
        return 10 + this.randomInt(14);
      case ElementId.Spark:
        return 4;
      case ElementId.Smoke:
        return 280 + this.randomInt(180);
      case ElementId.Neutron:
      case ElementId.Photon:
        return 100 + this.randomInt(80);
      default:
        return 0;
    }
  }

  private applyTool(i: number, tool: string, vector: { x: number; y: number }, falloff: number): void {
    switch (tool) {
      case "ERASE":
        this.setCell(i, ElementId.Empty);
        break;
      case "HEAT":
        this.temp[i] += 42 * falloff;
        this.pressure[i] += 0.07 * falloff;
        break;
      case "COOL":
        this.temp[i] -= 48 * falloff;
        this.pressure[i] -= 0.04 * falloff;
        break;
      case "WIND":
        this.vx[i] += (vector.x * 0.28 + this.ambient.windX * 0.08) * falloff;
        this.vy[i] += (vector.y * 0.28 + this.ambient.windY * 0.08) * falloff;
        break;
      case "VAC":
        this.pressure[i] -= 0.55 * falloff;
        this.vx[i] *= 0.7;
        this.vy[i] *= 0.7;
        break;
      case "PRES":
        this.pressure[i] += 0.65 * falloff;
        break;
      case "MIX":
        this.temp[i] += (this.random() - 0.5) * 10;
        this.tryMoveIndex(i, this.randomNeighborIndex(i));
        break;
      default:
        break;
    }
  }

  private updateParticles(): void {
    for (let y = this.height - 1; y >= 0; y -= 1) {
      const leftToRight = (y + this.frame) % 2 === 0;
      for (let scanX = 0; scanX < this.width; scanX += 1) {
        const x = leftToRight ? scanX : this.width - 1 - scanX;
        const i = this.index(x, y);
        if (this.ids[i] === ElementId.Empty || this.updated[i] === this.frame) {
          continue;
        }
        this.updateCell(i, x, y);
      }
    }
  }

  private updateCell(i: number, x: number, y: number): void {
    const id = this.ids[i] as ElementId;
    if (id === ElementId.BlackHole) {
      this.updateBlackHole(i, x, y);
      return;
    }
    if (this.applyPhaseTransitions(i, id)) {
      this.updated[i] = this.frame;
      return;
    }
    if (this.applyNeighborhoodReactions(i, x, y)) {
      this.updated[i] = this.frame;
      return;
    }

    const current = this.ids[i] as ElementId;
    const definition = ELEMENTS[current];
    switch (current) {
      case ElementId.Spark:
        this.updateSpark(i, x, y);
        break;
      case ElementId.Neutron:
      case ElementId.Photon:
        this.updateRayParticle(i, x, y, current);
        break;
      case ElementId.Fire:
      case ElementId.Plasma:
        this.updateFlame(i, x, y, current);
        break;
      case ElementId.Battery:
        this.updateBattery(i, x, y);
        break;
      default:
        if (definition.state === "powder") {
          this.updatePowder(i, x, y);
        } else if (definition.state === "liquid") {
          this.updateLiquid(i, x, y, definition);
        } else if (definition.state === "gas") {
          this.updateGas(i, x, y, definition);
        } else {
          this.updated[i] = this.frame;
        }
    }
  }

  private applyPhaseTransitions(i: number, id: ElementId): boolean {
    const definition = ELEMENTS[id];
    const t = this.temp[i];

    if (id === ElementId.Lava && t < 640) {
      const original = this.ctype[i] as ElementId;
      const cooled =
        original === ElementId.Glass || original === ElementId.Sand
          ? ElementId.Glass
          : original === ElementId.Metal ||
              original === ElementId.Copper ||
              original === ElementId.Gold ||
              original === ElementId.Wire ||
              original === ElementId.Semiconductor
            ? ElementId.Metal
            : ElementId.Stone;
      this.setCell(i, cooled, Math.max(120, t));
      return true;
    }

    if (id === ElementId.Steam && t < 92) {
      this.setCell(i, ElementId.Water, Math.max(25, t));
      return true;
    }

    if (id === ElementId.Smoke && this.life[i] > 0) {
      this.life[i] -= 1;
      if (this.life[i] === 0 && this.random() < 0.35) {
        this.setCell(i, ElementId.Empty);
        return true;
      }
    }

    if (definition.boilPoint !== undefined && definition.boilsTo !== undefined && t >= definition.boilPoint) {
      this.setCell(i, definition.boilsTo, t + 15);
      this.pressure[i] += 1.1;
      return true;
    }

    if (definition.freezePoint !== undefined && definition.freezesTo !== undefined && t <= definition.freezePoint) {
      this.setCell(i, definition.freezesTo, t);
      return true;
    }

    if (definition.meltPoint !== undefined && definition.meltsTo !== undefined && t >= definition.meltPoint) {
      const target = definition.meltsTo;
      this.setCell(i, target, t, target === ElementId.Lava ? id : ElementId.Empty);
      if (target === ElementId.Lava) {
        this.pressure[i] += 0.3;
      }
      return true;
    }

    return false;
  }

  private applyNeighborhoodReactions(i: number, x: number, y: number): boolean {
    const id = this.ids[i] as ElementId;
    const definition = ELEMENTS[id];
    let touchedWater = false;
    let touchedOxygen = false;
    let touchedFire = false;

    for (const [dx, dy] of this.shuffledNeighbors()) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) {
        continue;
      }
      const ni = this.index(nx, ny);
      const nid = this.ids[ni] as ElementId;
      const neighbor = ELEMENTS[nid];

      if (nid === ElementId.Water || nid === ElementId.SaltWater) {
        touchedWater = true;
      }
      if (nid === ElementId.Oxygen) {
        touchedOxygen = true;
      }
      if (nid === ElementId.Fire || nid === ElementId.Plasma || nid === ElementId.Spark) {
        touchedFire = true;
      }

      if ((id === ElementId.Acid && nid === ElementId.Base) || (id === ElementId.Base && nid === ElementId.Acid)) {
        this.setCell(i, ElementId.Water, Math.max(35, (this.temp[i] + this.temp[ni]) * 0.5));
        this.setCell(ni, ElementId.Salt, 45);
        this.pressure[i] += 0.7;
        return true;
      }

      if (id === ElementId.Acid && nid !== ElementId.Empty && nid !== ElementId.Acid) {
        const resistance = neighbor.acidResistance ?? 0.5;
        if (!neighbor.immovable && nid !== ElementId.Gold && this.random() > resistance + 0.08) {
          this.setCell(ni, this.random() < 0.78 ? ElementId.Empty : ElementId.Smoke, this.temp[i] + 20);
          this.temp[i] += 6;
          this.pressure[i] += 0.08;
          if (this.random() < 0.08) {
            this.setCell(i, ElementId.Empty);
          }
          return true;
        }
      }

      if (id === ElementId.Base && nid !== ElementId.Empty && nid !== ElementId.Base) {
        const organic = nid === ElementId.Wood || nid === ElementId.Plant || nid === ElementId.Seed || nid === ElementId.Dust;
        if (organic && this.random() < 0.025) {
          this.setCell(ni, ElementId.Smoke, this.temp[i] + 10);
          return true;
        }
      }

      if ((id === ElementId.Salt && nid === ElementId.Water) || (id === ElementId.Water && nid === ElementId.Salt)) {
        this.setCell(i, ElementId.SaltWater, Math.max(this.temp[i], this.temp[ni]));
        this.setCell(ni, ElementId.SaltWater, Math.max(this.temp[i], this.temp[ni]));
        return true;
      }

      if (id === ElementId.Lava && (nid === ElementId.Water || nid === ElementId.SaltWater || nid === ElementId.Ice)) {
        this.setCell(ni, ElementId.Steam, 135);
        this.setCell(i, this.random() < 0.35 ? ElementId.Glass : ElementId.Stone, 260);
        this.pressure[i] += 2.5;
        this.pressure[ni] += 2.5;
        return true;
      }

      if (id === ElementId.LiquidNitrogen && this.temp[ni] > 70 && nid !== ElementId.Empty) {
        this.temp[ni] -= 120;
        this.setCell(i, ElementId.Smoke, -80);
        this.pressure[i] += 0.6;
        return true;
      }

      if (id === ElementId.Fire || id === ElementId.Plasma) {
        this.temp[ni] += id === ElementId.Plasma ? 120 : 42;
        if (nid === ElementId.Oxygen) {
          this.setCell(ni, ElementId.Fire, 760);
          this.life[i] = Math.min(90, this.life[i] + 7);
          this.pressure[i] += 0.65;
          return true;
        }
        if (nid === ElementId.Hydrogen) {
          this.explode(x, y, 7 + this.randomInt(6), id === ElementId.Plasma ? 3.6 : 2.4);
          return true;
        }
        if (neighbor.combustible && this.random() < (id === ElementId.Plasma ? 0.55 : 0.23)) {
          this.setCell(ni, ElementId.Fire, Math.max(this.temp[ni], 520));
          return true;
        }
      }

      if (id === ElementId.Neutron && nid === ElementId.Uranium) {
        this.temp[ni] += 520;
        this.pressure[ni] += 2.2;
        if (this.random() < 0.35) {
          this.setCell(ni, ElementId.Plasma, 1900);
        }
        this.scatterNeutrons(nx, ny, 2 + this.randomInt(3));
        return true;
      }

      if (id === ElementId.Uranium && (nid === ElementId.Neutron || this.pressure[i] > 4)) {
        this.temp[i] += 260;
        this.pressure[i] += 1.4;
        if (this.random() < 0.22) {
          this.scatterNeutrons(x, y, 2);
        }
      }
    }

    if (id === ElementId.Seed && touchedWater && this.supported(x, y)) {
      this.growPlant(x, y);
      return true;
    }

    if (id === ElementId.Plant && touchedWater && this.random() < 0.035) {
      this.growPlant(x, y);
      return true;
    }

    if (definition.combustible && (touchedFire || (touchedOxygen && this.temp[i] > (definition.burnTemp ?? 300)))) {
      if (this.random() < 0.12 || this.temp[i] > (definition.burnTemp ?? 300) + 120) {
        this.setCell(i, ElementId.Fire, Math.max(this.temp[i], 480));
        return true;
      }
    }

    return false;
  }

  private updatePowder(i: number, x: number, y: number): void {
    const down = this.ambient.gravity >= 0 ? 1 : -1;
    const dir = this.random() < 0.5 ? -1 : 1;
    if (
      this.tryMove(i, x, y, x, y + down) ||
      this.tryMove(i, x, y, x + dir, y + down) ||
      this.tryMove(i, x, y, x - dir, y + down)
    ) {
      return;
    }
    if (Math.abs(this.vx[i] + this.ambient.windX) > 0.55) {
      const windDir = this.vx[i] + this.ambient.windX > 0 ? 1 : -1;
      if (this.tryMove(i, x, y, x + windDir, y)) {
        return;
      }
    }
    this.updated[i] = this.frame;
  }

  private updateLiquid(i: number, x: number, y: number, definition: ElementDefinition): void {
    const down = this.ambient.gravity >= 0 ? 1 : -1;
    const dir = this.random() < 0.5 ? -1 : 1;
    if (
      this.tryMove(i, x, y, x, y + down) ||
      this.tryMove(i, x, y, x + dir, y + down) ||
      this.tryMove(i, x, y, x - dir, y + down)
    ) {
      return;
    }

    const flow = Math.max(1, Math.floor(definition.viscosity ?? 2));
    const pressureBias = this.pressure[i] + this.ambient.windX;
    const firstDir = pressureBias > 0.08 ? 1 : pressureBias < -0.08 ? -1 : dir;
    for (let step = 1; step <= flow; step += 1) {
      if (this.tryMove(i, x, y, x + firstDir * step, y)) {
        return;
      }
      if (this.tryMove(i, x, y, x - firstDir * step, y)) {
        return;
      }
    }
    this.updated[i] = this.frame;
  }

  private updateGas(i: number, x: number, y: number, definition: ElementDefinition): void {
    const up = this.ambient.gravity >= 0 ? -1 : 1;
    const buoyancy = Math.max(0.2, (120 - definition.density) / 120);
    this.vx[i] += this.ambient.windX * 0.025 + (this.random() - 0.5) * 0.18;
    this.vy[i] += up * 0.06 * buoyancy + this.ambient.windY * 0.025;
    const dx = Math.abs(this.vx[i]) > 0.4 ? Math.sign(this.vx[i]) : this.random() < 0.5 ? -1 : 1;
    const dy = Math.abs(this.vy[i]) > 0.25 ? Math.sign(this.vy[i]) : up;

    if (
      this.tryMove(i, x, y, x + dx, y + dy) ||
      this.tryMove(i, x, y, x, y + up) ||
      this.tryMove(i, x, y, x + dx, y) ||
      this.tryMove(i, x, y, x - dx, y + up)
    ) {
      return;
    }
    this.updated[i] = this.frame;
  }

  private updateFlame(i: number, x: number, y: number, id: ElementId): void {
    this.pressure[i] += id === ElementId.Plasma ? 0.35 : 0.12;
    this.temp[i] -= id === ElementId.Plasma ? 16 : 9;
    if (this.life[i] > 0) {
      this.life[i] -= 1;
    }
    if (this.life[i] === 0 || this.temp[i] < 160) {
      this.setCell(i, id === ElementId.Plasma ? ElementId.Fire : ElementId.Smoke, Math.max(60, this.temp[i]));
      this.updated[i] = this.frame;
      return;
    }
    this.updateGas(i, x, y, ELEMENTS[id]);
  }

  private updateSpark(i: number, x: number, y: number): void {
    this.temp[i] += 18;
    this.pressure[i] += 0.04;
    for (const [dx, dy] of this.shuffledNeighbors()) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) {
        continue;
      }
      const ni = this.index(nx, ny);
      const nid = this.ids[ni] as ElementId;
      if (nid !== ElementId.Spark && nid !== ElementId.Battery && isConductive(nid)) {
        const passChance = nid === ElementId.Semiconductor && this.temp[ni] < 45 ? 0.2 : 0.72;
        if (this.random() < passChance) {
          this.setCell(ni, ElementId.Spark, Math.max(260, this.temp[i]), nid);
          this.updated[ni] = this.frame;
        }
      } else if (ELEMENTS[nid].combustible) {
        this.temp[ni] += 50;
      }
    }

    if (this.life[i] > 0) {
      this.life[i] -= 1;
    }
    if (this.life[i] === 0) {
      const original = (this.ctype[i] || ElementId.Metal) as ElementId;
      this.setCell(i, original, Math.max(80, this.temp[i] - 80));
    }
    this.updated[i] = this.frame;
  }

  private updateBattery(i: number, x: number, y: number): void {
    this.temp[i] += 0.2;
    if (this.frame % 3 === 0) {
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) {
          continue;
        }
        const ni = this.index(nx, ny);
        const nid = this.ids[ni] as ElementId;
        if (nid !== ElementId.Spark && isConductive(nid)) {
          this.setCell(ni, ElementId.Spark, 320, nid);
          this.updated[ni] = this.frame;
        }
      }
    }
    this.updated[i] = this.frame;
  }

  private updateRayParticle(i: number, x: number, y: number, id: ElementId): void {
    if (this.life[i] > 0) {
      this.life[i] -= 1;
    }
    if (this.life[i] === 0) {
      this.setCell(i, ElementId.Empty);
      this.updated[i] = this.frame;
      return;
    }

    let dx = 0;
    let dy = 0;
    if (id === ElementId.Photon) {
      dx = this.ctype[i] === 255 ? -1 : 1;
      dy = this.random() < 0.12 ? (this.random() < 0.5 ? -1 : 1) : 0;
    } else {
      dx = this.randomInt(3) - 1;
      dy = this.randomInt(3) - 1;
      if (dx === 0 && dy === 0) {
        dx = 1;
      }
    }
    const ni = this.inBounds(x + dx, y + dy) ? this.index(x + dx, y + dy) : -1;
    if (ni < 0) {
      this.setCell(i, ElementId.Empty);
      return;
    }
    const target = this.ids[ni] as ElementId;
    if (target === ElementId.Empty || ELEMENTS[target].state === "gas") {
      this.swapCells(i, ni);
      return;
    }
    if (target === ElementId.Glass && id === ElementId.Photon) {
      this.swapCells(i, ni);
      return;
    }
    this.temp[ni] += id === ElementId.Neutron ? 55 : 12;
    this.setCell(i, ElementId.Empty);
    this.updated[ni] = this.frame;
  }

  private updateBlackHole(i: number, x: number, y: number): void {
    this.pressure[i] -= 1.2;
    for (const [dx, dy] of NEIGHBORS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) {
        continue;
      }
      const ni = this.index(nx, ny);
      const nid = this.ids[ni] as ElementId;
      if (nid !== ElementId.Empty && nid !== ElementId.Wall && nid !== ElementId.BlackHole && this.random() < 0.58) {
        this.setCell(ni, ElementId.Empty);
        this.pressure[ni] -= 1.8;
      } else {
        this.vx[ni] -= dx * 0.4;
        this.vy[ni] -= dy * 0.4;
      }
    }
    this.updated[i] = this.frame;
  }

  private tryMove(i: number, x: number, y: number, nx: number, ny: number): boolean {
    if (!this.inBounds(nx, ny)) {
      return false;
    }
    return this.tryMoveIndex(i, this.index(nx, ny), x, y, nx, ny);
  }

  private tryMoveIndex(i: number, ni: number, x?: number, y?: number, nx?: number, ny?: number): boolean {
    const from = this.ids[i] as ElementId;
    const to = this.ids[ni] as ElementId;
    if (!this.canDisplace(from, to)) {
      return false;
    }
    if (x !== undefined && y !== undefined && nx !== undefined && ny !== undefined) {
      const pi = Math.max(-6, Math.min(6, this.pressure[i]));
      this.vx[ni] += (nx - x) * 0.04 + pi * 0.004;
      this.vy[ni] += (ny - y) * 0.04;
    }
    this.swapCells(i, ni);
    return true;
  }

  private canDisplace(from: ElementId, to: ElementId): boolean {
    if (to === ElementId.Empty) {
      return true;
    }
    const fromDef = ELEMENTS[from];
    const toDef = ELEMENTS[to];
    if (toDef.immovable || toDef.state === "solid") {
      return false;
    }
    if (fromDef.state === "gas" && toDef.state === "liquid") {
      return true;
    }
    if (fromDef.state === "energy" && (toDef.state === "gas" || toDef.state === "energy")) {
      return true;
    }
    return fromDef.density > toDef.density + 8;
  }

  private swapCells(a: number, b: number): void {
    this.swap(this.ids, a, b);
    this.swapFloat(this.temp, a, b);
    this.swapFloat(this.pressure, a, b);
    this.swapFloat(this.vx, a, b);
    this.swapFloat(this.vy, a, b);
    this.swap(this.life, a, b);
    this.swap(this.ctype, a, b);
    this.updated[a] = this.frame;
    this.updated[b] = this.frame;
  }

  private relaxAirFields(): void {
    const ambient = this.ambient.ambientPressure;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const i = this.index(x, y);
        let sum = 0;
        let count = 0;
        let left = this.pressure[i];
        let right = this.pressure[i];
        let up = this.pressure[i];
        let down = this.pressure[i];
        for (const [dx, dy] of NEIGHBORS_4) {
          const nx = x + dx;
          const ny = y + dy;
          if (!this.inBounds(nx, ny)) {
            continue;
          }
          const n = this.index(nx, ny);
          const p = this.pressure[n];
          if (dx === -1) left = p;
          if (dx === 1) right = p;
          if (dy === -1) up = p;
          if (dy === 1) down = p;
          sum += p;
          count += 1;
        }
        const p = this.pressure[i];
        const diffuse = count ? (sum / count - p) * 0.22 : 0;
        const curl = ((down - up) - (right - left)) * this.ambient.vorticity * 0.015;
        this.scratchPressure[i] = (p + diffuse + (ambient - p) * 0.012) * 0.992;
        this.scratchVx[i] = (this.vx[i] + (left - right) * 0.028 + this.ambient.windX * 0.008 + curl) * 0.965;
        this.scratchVy[i] = (this.vy[i] + (up - down) * 0.028 + this.ambient.windY * 0.008 - curl) * 0.965;
      }
    }
    this.pressure.set(this.scratchPressure);
    this.vx.set(this.scratchVx);
    this.vy.set(this.scratchVy);
  }

  private conductHeat(): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const i = this.index(x, y);
        const id = this.ids[i] as ElementId;
        const defA = ELEMENTS[id];
        if (id === ElementId.Empty && !this.ambient.airHeatConvection) {
          continue;
        }
        if (x + 1 < this.width) {
          this.exchangeHeat(i, this.index(x + 1, y), defA);
        }
        if (y + 1 < this.height) {
          this.exchangeHeat(i, this.index(x, y + 1), defA);
        }
        if (id === ElementId.Empty) {
          this.temp[i] += (22 - this.temp[i]) * 0.002;
        } else if (defA.state === "gas" && this.ambient.airHeatConvection) {
          this.temp[i] += this.vy[i] * -0.025;
        }
      }
    }
  }

  private exchangeHeat(a: number, b: number, defA: ElementDefinition): void {
    const idB = this.ids[b] as ElementId;
    const defB = ELEMENTS[idB];
    const conduct = Math.min(defA.conductivity, defB.conductivity) * 0.018;
    if (conduct <= 0) {
      return;
    }
    const diff = (this.temp[b] - this.temp[a]) * conduct;
    const capA = Math.max(0.2, defA.heatCapacity);
    const capB = Math.max(0.2, defB.heatCapacity);
    this.temp[a] += diff / capA;
    this.temp[b] -= diff / capB;
  }

  private supported(x: number, y: number): boolean {
    const below = y + 1;
    if (below >= this.height) {
      return true;
    }
    const id = this.getElement(x, below);
    return id !== ElementId.Empty && ELEMENTS[id].state !== "gas" && ELEMENTS[id].state !== "energy";
  }

  private growPlant(x: number, y: number): void {
    const options: Array<[number, number, ElementId]> = [
      [0, -1, ElementId.Plant],
      [-1, -1, ElementId.Plant],
      [1, -1, ElementId.Plant],
      [0, 0, ElementId.Wood],
      [-1, 0, ElementId.Plant],
      [1, 0, ElementId.Plant]
    ];
    for (const [dx, dy, id] of options) {
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny) && this.getElement(nx, ny) === ElementId.Empty && this.random() < 0.62) {
        this.setElement(nx, ny, id, 24);
        break;
      }
    }
  }

  private explode(cx: number, cy: number, radius: number, power: number): void {
    const r2 = radius * radius;
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if (!this.inBounds(x, y)) {
          continue;
        }
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) {
          continue;
        }
        const i = this.index(x, y);
        const falloff = 1 - Math.sqrt(d2) / (radius + 0.001);
        this.pressure[i] += power * falloff;
        this.temp[i] += 620 * falloff;
        this.vx[i] += dx * 0.07 * power;
        this.vy[i] += dy * 0.07 * power;
        const id = this.ids[i] as ElementId;
        if (id === ElementId.Empty && this.random() < falloff * 0.45) {
          this.setCell(i, this.random() < 0.55 ? ElementId.Fire : ElementId.Smoke, 520 + falloff * 400);
        } else if (ELEMENTS[id].combustible && this.random() < falloff * 0.5) {
          this.setCell(i, ElementId.Fire, 680);
        }
      }
    }
  }

  private scatterNeutrons(cx: number, cy: number, count: number): void {
    for (let n = 0; n < count; n += 1) {
      const dx = this.randomInt(7) - 3;
      const dy = this.randomInt(7) - 3;
      const x = cx + dx;
      const y = cy + dy;
      if (this.inBounds(x, y) && this.getElement(x, y) === ElementId.Empty) {
        this.setElement(x, y, ElementId.Neutron, 100 + this.random() * 300);
      }
    }
  }

  private randomNeighborIndex(i: number): number {
    const x = i % this.width;
    const y = Math.floor(i / this.width);
    const [dx, dy] = NEIGHBORS_8[this.randomInt(NEIGHBORS_8.length)];
    const nx = Math.max(0, Math.min(this.width - 1, x + dx));
    const ny = Math.max(0, Math.min(this.height - 1, y + dy));
    return this.index(nx, ny);
  }

  private shuffledNeighbors(): Array<[number, number]> {
    const start = this.randomInt(NEIGHBORS_8.length);
    const result: Array<[number, number]> = [];
    for (let i = 0; i < NEIGHBORS_8.length; i += 1) {
      result.push(NEIGHBORS_8[(start + i) % NEIGHBORS_8.length]);
    }
    return result;
  }

  private random(): number {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  private randomInt(max: number): number {
    return Math.floor(this.random() * max);
  }

  private swap<T extends Uint8Array | Uint16Array>(array: T, a: number, b: number): void {
    const temp = array[a];
    array[a] = array[b];
    array[b] = temp;
  }

  private swapFloat(array: Float32Array, a: number, b: number): void {
    const temp = array[a];
    array[a] = array[b];
    array[b] = temp;
  }
}
