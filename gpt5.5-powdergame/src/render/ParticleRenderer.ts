import { ELEMENTS, ElementId } from "../simulation/elements";
import type { PowderSimulation } from "../simulation/PowderSimulation";
import type { RenderMode } from "../simulation/types";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const RGB_CACHE = new Map<string, Rgb>();

export class ParticleRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private mode: RenderMode = "normal";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly simulation: PowderSimulation
  ) {
    this.canvas.width = simulation.width;
    this.canvas.height = simulation.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("当前浏览器无法创建 2D Canvas");
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.imageData = ctx.createImageData(simulation.width, simulation.height);
  }

  setMode(mode: RenderMode): void {
    this.mode = mode;
  }

  getMode(): RenderMode {
    return this.mode;
  }

  render(): void {
    const data = this.imageData.data;
    const ids = this.simulation.ids;
    const temp = this.simulation.temp;
    const pressure = this.simulation.pressure;
    const life = this.simulation.life;

    for (let i = 0; i < this.simulation.size; i += 1) {
      const id = ids[i] as ElementId;
      const p = i * 4;
      const rgb =
        this.mode === "thermal"
          ? this.thermalColor(temp[i])
          : this.mode === "pressure"
            ? this.pressureColor(pressure[i])
            : this.mode === "electric"
              ? this.electricColor(id, life[i])
              : this.elementColor(id, i, temp[i]);
      data[p] = rgb.r;
      data[p + 1] = rgb.g;
      data[p + 2] = rgb.b;
      data[p + 3] = 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  private elementColor(id: ElementId, index: number, temp: number): Rgb {
    if (id === ElementId.Empty) {
      const pressure = this.simulation.pressure[index];
      const air = Math.max(0, Math.min(1, Math.abs(pressure) / 5));
      return pressure >= 0
        ? { r: 4 + air * 24, g: 7 + air * 18, b: 12 + air * 8 }
        : { r: 4, g: 8 + air * 8, b: 14 + air * 30 };
    }

    if (id === ElementId.Fire) {
      const hot = Math.max(0, Math.min(1, (temp - 160) / 720));
      return { r: 255, g: 90 + hot * 150, b: 20 + hot * 45 };
    }
    if (id === ElementId.Plasma) {
      const hot = Math.max(0, Math.min(1, (temp - 800) / 2200));
      return { r: 130 + hot * 120, g: 70 + hot * 80, b: 255 };
    }
    if (id === ElementId.Spark || id === ElementId.Photon) {
      return { r: 245, g: 255, b: 255 };
    }

    const base = parseColor(ELEMENTS[id].color);
    const noise = this.noise(index);
    const heatGlow = Math.max(0, Math.min(1, (temp - 260) / 900));
    return {
      r: clampByte(base.r + noise + heatGlow * 85),
      g: clampByte(base.g + noise * 0.7 + heatGlow * 34),
      b: clampByte(base.b + noise * 0.5 - heatGlow * 25)
    };
  }

  private thermalColor(temp: number): Rgb {
    if (temp < -80) {
      return { r: 172, g: 241, b: 255 };
    }
    if (temp < 0) {
      const t = (temp + 80) / 80;
      return { r: 60 + t * 70, g: 150 + t * 70, b: 255 };
    }
    if (temp < 100) {
      const t = temp / 100;
      return { r: 26 + t * 80, g: 64 + t * 130, b: 130 - t * 60 };
    }
    if (temp < 600) {
      const t = (temp - 100) / 500;
      return { r: 106 + t * 149, g: 194 - t * 80, b: 70 - t * 50 };
    }
    const t = Math.min(1, (temp - 600) / 1800);
    return { r: 255, g: 114 + t * 125, b: 20 + t * 190 };
  }

  private pressureColor(pressure: number): Rgb {
    const p = Math.max(-5, Math.min(5, pressure));
    if (p >= 0) {
      const t = p / 5;
      return { r: 32 + t * 220, g: 36 + t * 64, b: 54 + t * 26 };
    }
    const t = Math.abs(p) / 5;
    return { r: 22 + t * 24, g: 38 + t * 72, b: 68 + t * 180 };
  }

  private electricColor(id: ElementId, life: number): Rgb {
    if (id === ElementId.Spark) {
      return { r: 255, g: 255, b: 255 };
    }
    if (ELEMENTS[id].conductive) {
      const pulse = Math.min(1, life / 6);
      return { r: 40 + pulse * 210, g: 160 + pulse * 90, b: 230 };
    }
    if (id === ElementId.Battery) {
      return { r: 90, g: 255, b: 150 };
    }
    const base = parseColor(ELEMENTS[id].color);
    return { r: base.r * 0.28, g: base.g * 0.32, b: base.b * 0.42 };
  }

  private noise(index: number): number {
    let n = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13;
    return ((n & 31) - 15) * 0.9;
  }
}

const parseColor = (color: string): Rgb => {
  const cached = RGB_CACHE.get(color);
  if (cached) {
    return cached;
  }
  const normalized = color.replace("#", "");
  const rgb = {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
  RGB_CACHE.set(color, rgb);
  return rgb;
};

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
