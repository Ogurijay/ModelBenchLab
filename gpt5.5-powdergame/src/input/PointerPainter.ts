import type { PowderSimulation } from "../simulation/PowderSimulation";
import type { BrushSelection } from "../simulation/types";

export class PointerPainter {
  private drawing = false;
  private lastPoint: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly simulation: PowderSimulation,
    private readonly getBrush: () => BrushSelection,
    private readonly getBrushSize: () => number,
    private readonly onPaint?: () => void
  ) {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.drawing = true;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.toGrid(event);
    this.lastPoint = point;
    this.paint(point, { x: 0, y: 0 });
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.drawing) {
      return;
    }
    const point = this.toGrid(event);
    const previous = this.lastPoint ?? point;
    const vector = { x: point.x - previous.x, y: point.y - previous.y };
    this.paintLine(previous, point, vector);
    this.lastPoint = point;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.drawing = false;
    this.lastPoint = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private paintLine(from: { x: number; y: number }, to: { x: number; y: number }, vector: { x: number; y: number }): void {
    const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
    const steps = Math.ceil(distance / Math.max(1, this.getBrushSize() * 0.55));
    for (let i = 0; i <= steps; i += 1) {
      const t = steps === 0 ? 1 : i / steps;
      const x = Math.round(from.x + (to.x - from.x) * t);
      const y = Math.round(from.y + (to.y - from.y) * t);
      this.paint({ x, y }, vector);
    }
  }

  private paint(point: { x: number; y: number }, vector: { x: number; y: number }): void {
    this.simulation.paintDisc(point.x, point.y, this.getBrushSize(), this.getBrush(), vector);
    this.onPaint?.();
  }

  private toGrid(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * this.simulation.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * this.simulation.height);
    return {
      x: Math.max(0, Math.min(this.simulation.width - 1, x)),
      y: Math.max(0, Math.min(this.simulation.height - 1, y))
    };
  }
}
