import { GRID_WIDTH, GRID_HEIGHT, CELL_SIZE } from '../simulation/constants';
import { SimulationEngine } from '../simulation/engine';

export interface RendererOptions {
  showGlow: boolean;
  showGrid: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export class CanvasRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageData: ImageData;
  pixels: Uint32Array;
  glowCanvas: HTMLCanvasElement;
  glowCtx: CanvasRenderingContext2D;
  options: RendererOptions;
  engine: SimulationEngine;
  private animationId: number | null = null;
  private lastTime: number = 0;
  private fps: number = 60;
  private frameCount: number = 0;
  private fpsUpdateTime: number = 0;
  public onFpsUpdate?: (fps: number) => void;
  public onParticleCount?: (count: number) => void;
  public onMousePos?: (x: number, y: number, temp: number) => void;

  constructor(canvas: HTMLCanvasElement, engine: SimulationEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.engine = engine;
    
    this.canvas.width = GRID_WIDTH * CELL_SIZE;
    this.canvas.height = GRID_HEIGHT * CELL_SIZE;
    
    this.imageData = this.ctx.createImageData(GRID_WIDTH, GRID_HEIGHT);
    this.pixels = new Uint32Array(this.imageData.data.buffer);
    
    this.glowCanvas = document.createElement('canvas');
    this.glowCanvas.width = GRID_WIDTH;
    this.glowCanvas.height = GRID_HEIGHT;
    this.glowCtx = this.glowCanvas.getContext('2d')!;
    
    this.options = {
      showGlow: true,
      showGrid: false,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };
  }

  start() {
    this.lastTime = performance.now();
    this.fpsUpdateTime = this.lastTime;
    this.frameCount = 0;
    this.loop();
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private loop = () => {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    
    this.fps = Math.round(1000 / delta);
    this.frameCount++;
    
    if (now - this.fpsUpdateTime >= 500) {
      if (this.onFpsUpdate) this.onFpsUpdate(this.fps);
      if (this.onParticleCount) this.onParticleCount(this.engine.getParticleCount());
      this.fpsUpdateTime = now;
    }
    
    this.engine.update();
    this.render();
    
    this.animationId = requestAnimationFrame(this.loop);
  };

  render() {
    const grid = this.engine.grid;
    const w = GRID_WIDTH;
    const h = GRID_HEIGHT;
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const type = grid.pmap[i];
        
        if (type === 0) {
          this.pixels[i] = 0xff000000;
        } else {
          let col = grid.color[i];
          
          const flags = grid.flags[i];
          if (flags & 32) {
            const t = grid.temp[i];
            const heatGlow = Math.min(1, (t - 300) / 1000);
            if (heatGlow > 0) {
              col = this.addGlow(col, heatGlow, 0xff, 0x40, 0x00);
            }
          }
          if (flags & 64) {
            const t = grid.temp[i];
            const coldGlow = Math.min(1, (273 - t) / 100);
            if (coldGlow > 0) {
              col = this.addGlow(col, coldGlow * 0.3, 0x80, 0xc0, 0xff);
            }
          }
          
          this.pixels[i] = col;
        }
      }
    }
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(this.imageData, 0, 0);
    
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(tempCanvas, 0, 0, w, h, 0, 0, this.canvas.width, this.canvas.height);
    
    if (this.options.showGlow) {
      this.renderGlow(tempCanvas);
    }
    
    if (this.options.showGrid) {
      this.renderGrid();
    }
  }

  private addGlow(col: number, intensity: number, r: number, g: number, b: number): number {
    const a = (col >> 24) & 0xff;
    const cr = (col) & 0xff;
    const cg = (col >> 8) & 0xff;
    const cb = (col >> 16) & 0xff;
    
    const nr = Math.min(255, Math.round(cr + (r - cr) * intensity));
    const ng = Math.min(255, Math.round(cg + (g - cg) * intensity));
    const nb = Math.min(255, Math.round(cb + (b - cb) * intensity));
    
    return (a << 24) | (nb << 16) | (ng << 8) | nr;
  }

  private renderGlow(tempCanvas: HTMLCanvasElement) {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'screen';
    this.ctx.filter = 'blur(4px)';
    this.ctx.globalAlpha = 0.4;
    this.ctx.drawImage(tempCanvas, 0, 0, GRID_WIDTH, GRID_HEIGHT, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.filter = 'blur(8px)';
    this.ctx.globalAlpha = 0.2;
    this.ctx.drawImage(tempCanvas, 0, 0, GRID_WIDTH, GRID_HEIGHT, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
  }

  private renderGrid() {
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 1;
    const cs = CELL_SIZE;
    
    for (let x = 0; x <= GRID_WIDTH; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * cs, 0);
      this.ctx.lineTo(x * cs, this.canvas.height);
      this.ctx.stroke();
    }
    
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * cs);
      this.ctx.lineTo(this.canvas.width, y * cs);
      this.ctx.stroke();
    }
  }

  screenToGrid(screenX: number, screenY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.floor((screenX - rect.left) * scaleX / CELL_SIZE);
    const y = Math.floor((screenY - rect.top) * scaleY / CELL_SIZE);
    return { x, y };
  }

  setScale(scale: number) {
    this.options.scale = Math.max(0.5, Math.min(4, scale));
  }

  setShowGlow(show: boolean) {
    this.options.showGlow = show;
  }

  setShowGrid(show: boolean) {
    this.options.showGrid = show;
  }

  resize(width: number, height: number) {
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }
}
