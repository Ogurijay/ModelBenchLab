import type { PowderSimulation } from "../simulation/PowderSimulation";
import type { BrushSelection, ProbeReading } from "../simulation/types";

interface PainterOptions {
  getSelection: () => BrushSelection;
  getRadius: () => number;
  onProbe: (reading: ProbeReading) => void;
  onStrokeStart: () => void;
  onStrokeEnd: () => void;
}

export class PointerPainter {
  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private lastClientX = 0;
  private lastClientY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly simulation: PowderSimulation,
    private readonly options: PainterOptions
  ) {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.drawing = true;
    this.options.onStrokeStart();
    const [x, y] = this.toGrid(event);
    this.lastX = x;
    this.lastY = y;
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
    this.paintPoint(x, y, event, 0, 0);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const [x, y] = this.toGrid(event);
    this.options.onProbe(this.simulation.getProbe(x, y));
    if (!this.drawing) return;
    event.preventDefault();
    const dragX = (event.clientX - this.lastClientX) * this.simulation.width / Math.max(1, this.canvas.clientWidth);
    const dragY = (event.clientY - this.lastClientY) * this.simulation.height / Math.max(1, this.canvas.clientHeight);
    this.paintLine(this.lastX, this.lastY, x, y, event, dragX, dragY);
    this.lastX = x;
    this.lastY = y;
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.options.onStrokeEnd();
  };

  private readonly onPointerLeave = (): void => {
    if (!this.drawing) this.options.onProbe(this.simulation.getProbe(-1, -1));
  };

  private toGrid(event: PointerEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [
      Math.floor((event.clientX - rect.left) / Math.max(1, rect.width) * this.simulation.width),
      Math.floor((event.clientY - rect.top) / Math.max(1, rect.height) * this.simulation.height)
    ];
  }

  private paintLine(fromX: number, fromY: number, toX: number, toY: number, event: PointerEvent, dragX: number, dragY: number): void {
    const distance = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY), 1);
    for (let step = 1; step <= distance; step += 1) {
      const amount = step / distance;
      const x = Math.round(fromX + (toX - fromX) * amount);
      const y = Math.round(fromY + (toY - fromY) * amount);
      this.paintPoint(x, y, event, dragX, dragY);
    }
  }

  private paintPoint(x: number, y: number, event: PointerEvent, dragX: number, dragY: number): void {
    const selection = event.button === 2 || event.buttons === 2 ? { kind: "tool" as const, id: "erase" as const } : this.options.getSelection();
    this.simulation.paintDisc(x, y, selection, this.options.getRadius(), event.pointerType === "pen" && event.pressure > 0 ? event.pressure : 0.82, dragX, dragY);
  }
}

