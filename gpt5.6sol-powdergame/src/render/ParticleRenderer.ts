import { ElementId, getElement } from "../simulation/elements";
import type { ViewMode } from "../simulation/types";
import type { PowderSimulation } from "../simulation/PowderSimulation";

type Rgb = [number, number, number];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const mix = (a: Rgb, b: Rgb, amount: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * amount),
  Math.round(a[1] + (b[1] - a[1]) * amount),
  Math.round(a[2] + (b[2] - a[2]) * amount)
];

const parseHex = (hex: string): Rgb => {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
};

const temperatureColor = (temp: number): Rgb => {
  if (temp <= -100) return mix([29, 18, 82], [36, 187, 235], clamp((temp + 273) / 173, 0, 1));
  if (temp <= 22) return mix([36, 187, 235], [21, 25, 27], clamp((temp + 100) / 122, 0, 1));
  if (temp <= 100) return mix([21, 25, 27], [255, 211, 78], (temp - 22) / 78);
  if (temp <= 900) return mix([255, 211, 78], [242, 63, 35], (temp - 100) / 800);
  if (temp <= 2_500) return mix([242, 63, 35], [246, 92, 226], (temp - 900) / 1_600);
  return mix([246, 92, 226], [245, 251, 255], clamp((temp - 2_500) / 2_500, 0, 1));
};

export class ParticleRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private readonly baseColors: Rgb[];
  private viewMode: ViewMode = "normal";

  constructor(
    canvas: HTMLCanvasElement,
    readonly simulation: PowderSimulation
  ) {
    this.canvas = canvas;
    this.canvas.width = simulation.width;
    this.canvas.height = simulation.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前浏览器无法创建 Canvas 2D 渲染上下文");
    this.context = context;
    this.context.imageSmoothingEnabled = false;
    this.imageData = context.createImageData(simulation.width, simulation.height);
    this.baseColors = Array.from({ length: 256 }, (_, id) => parseHex(getElement(id).color));
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  getViewMode(): ViewMode {
    return this.viewMode;
  }

  render(): void {
    const data = this.imageData.data;
    const { simulation } = this;
    for (let i = 0; i < simulation.size; i += 1) {
      const id = simulation.ids[i] ?? ElementId.Empty;
      const color = this.colorFor(i, id);
      const output = i * 4;
      data[output] = color[0];
      data[output + 1] = color[1];
      data[output + 2] = color[2];
      data[output + 3] = 255;
    }
    this.context.putImageData(this.imageData, 0, 0);
    if (this.viewMode === "air") this.drawAirVectors();
  }

  exportPng(filename = "物质实验场.png"): void {
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  nonEmptyPixelCount(): number {
    let count = 0;
    for (let i = 0; i < this.simulation.size; i += 1) if (this.simulation.ids[i] !== ElementId.Empty) count += 1;
    return count;
  }

  private colorFor(i: number, id: number): Rgb {
    const { simulation } = this;
    if (this.viewMode === "heat") return temperatureColor(simulation.temp[i] ?? simulation.settings.ambientTemp);

    if (this.viewMode === "pressure") {
      const pressure = simulation.air.pressure[i] ?? 0;
      const amount = clamp(Math.abs(pressure) / 10, 0, 1);
      return pressure >= 0 ? mix([12, 15, 18], [246, 84, 47], amount) : mix([12, 15, 18], [43, 151, 239], amount);
    }

    if (this.viewMode === "air") {
      const vx = simulation.air.vx[i] ?? 0;
      const vy = simulation.air.vy[i] ?? 0;
      const speed = clamp(Math.hypot(vx, vy) / 3, 0, 1);
      const angle = Math.atan2(vy, vx);
      const directionColor: Rgb = [
        Math.round(100 + Math.cos(angle) * 85),
        Math.round(125 + Math.sin(angle) * 75),
        Math.round(165 + Math.cos(angle + 2.1) * 75)
      ];
      return mix([10, 13, 15], directionColor, speed);
    }

    const base = this.baseColors[id] ?? [6, 8, 10];
    if (this.viewMode === "electric") {
      const definition = getElement(id);
      if (!definition.conductive && id !== ElementId.Spark && id !== ElementId.Lightning) return mix([5, 7, 8], base, 0.16);
      const charge = (simulation.charge[i] ?? 0) / 255;
      return mix(mix([18, 24, 27], base, 0.48), [255, 239, 133], charge);
    }

    if (id === ElementId.Empty) {
      const grain = ((i * 17 + Math.floor(i / simulation.width) * 31) % 7) - 3;
      return [clamp(5 + grain, 3, 9), clamp(7 + grain, 4, 11), clamp(9 + grain, 6, 13)];
    }

    const element = getElement(id);
    const jitter = ((i * 13 + simulation.tick * (element.state === "energy" ? 5 : 0)) % 9) - 4;
    let color: Rgb = [clamp(base[0] + jitter, 0, 255), clamp(base[1] + jitter, 0, 255), clamp(base[2] + jitter, 0, 255)];
    const temp = simulation.temp[i] ?? element.defaultTemp;
    if (temp > 350) color = mix(color, temperatureColor(temp), clamp((temp - 350) / 1_800, 0, 0.72));
    const charge = (simulation.charge[i] ?? 0) / 255;
    if (charge > 0.08) color = mix(color, [225, 250, 255], charge * 0.72);
    if (element.state === "gas") color = mix([7, 10, 12], color, 0.72);
    return color;
  }

  private drawAirVectors(): void {
    const { simulation } = this;
    this.context.save();
    this.context.lineWidth = 0.45;
    this.context.strokeStyle = "rgba(232, 248, 255, 0.62)";
    for (let y = 6; y < simulation.height; y += 12) {
      for (let x = 6; x < simulation.width; x += 12) {
        const i = simulation.index(x, y);
        const vx = simulation.air.vx[i] ?? 0;
        const vy = simulation.air.vy[i] ?? 0;
        const speed = Math.hypot(vx, vy);
        if (speed < 0.08) continue;
        const scale = Math.min(4.5, speed * 1.5);
        this.context.beginPath();
        this.context.moveTo(x, y);
        this.context.lineTo(x + (vx / speed) * scale, y + (vy / speed) * scale);
        this.context.stroke();
      }
    }
    this.context.restore();
  }
}

