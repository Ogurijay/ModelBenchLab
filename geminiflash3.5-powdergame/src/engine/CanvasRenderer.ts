import type { Sandbox } from './Sandbox';
import { ElementId } from './Types';
import { getElementDef } from './Elements';

export type RenderMode = 'normal' | 'heat' | 'pressure';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  // 用于发光效果的离屏 canvas
  private glowCanvas: HTMLCanvasElement;
  private glowCtx: CanvasRenderingContext2D;

  // 图像数据缓存
  private imgData: ImageData;
  private pixelBuffer: Uint32Array;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = width;
    this.height = height;

    // 关闭平滑缩放，展现像素风质感
    this.ctx.imageSmoothingEnabled = false;

    // 初始化发光离屏 Canvas (下采样以提高性能)
    this.glowCanvas = document.createElement('canvas');
    this.glowCanvas.width = width / 2;
    this.glowCanvas.height = height / 2;
    this.glowCtx = this.glowCanvas.getContext('2d')!;
    this.glowCtx.imageSmoothingEnabled = true; // 发光层需要平滑插值

    // 初始化主帧缓冲区
    this.imgData = this.ctx.createImageData(width, height);
    this.pixelBuffer = new Uint32Array(this.imgData.data.buffer);
  }

  // 16进制颜色转ABGR整数（用于快速操作 ImageData 缓冲区）
  private hexToABGR(hex: string, alpha: number = 255): number {
    let r = 0, g = 0, b = 0;
    if (hex.startsWith('#')) {
      if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
      } else if (hex.length === 4) {
        r = parseInt(hex.substring(1, 2) + hex.substring(1, 2), 16);
        g = parseInt(hex.substring(2, 3) + hex.substring(2, 3), 16);
        b = parseInt(hex.substring(3, 4) + hex.substring(3, 4), 16);
      }
    }
    return (alpha << 24) | (b << 16) | (g << 8) | r;
  }

  // 温度颜色映射板
  private getHeatColor(temp: number): number {
    // 映射范围：-40度（深蓝）到 2000度（亮白）
    let r = 0, g = 0, b = 0;

    if (temp < 0) {
      // 极冷：蓝紫色
      const t = Math.max(-50, temp) / -50; // 0 到 1
      b = Math.floor(100 + 155 * t);
      r = Math.floor(30 * t);
      g = Math.floor(50 * t);
    } else if (temp < 100) {
      // 常温：蓝色到绿色再到黄色
      const t = temp / 100;
      b = Math.floor(255 * (1 - t));
      g = Math.floor(50 + 205 * t);
      r = Math.floor(100 * t);
    } else if (temp < 500) {
      // 温热：黄色到红色
      const t = (temp - 100) / 400;
      r = Math.floor(200 + 55 * t);
      g = Math.floor(200 * (1 - t));
      b = 0;
    } else if (temp < 1200) {
      // 高温：红橙色到明黄色
      const t = (temp - 500) / 700;
      r = 255;
      g = Math.floor(50 + 205 * t);
      b = Math.floor(50 * t);
    } else {
      // 极端超高温：白色
      const t = Math.min(2500, temp - 1200) / 1300;
      r = 255;
      g = 255;
      b = Math.floor(100 + 155 * t);
    }

    return (255 << 24) | (b << 16) | (g << 8) | r;
  }

  // 气压颜色映射板
  private getPressureColor(press: number): number {
    let r = 0, g = 0, b = 0;
    
    if (press > 0) {
      // 正压：红色
      const t = Math.min(50, press) / 50;
      r = Math.floor(50 + 205 * t);
    } else if (press < 0) {
      // 负压：蓝色
      const t = Math.min(30, -press) / 30;
      b = Math.floor(50 + 205 * t);
      g = Math.floor(30 * t);
    }

    return (255 << 24) | (b << 16) | (g << 8) | r;
  }

  // 主渲染入口
  public render(sandbox: Sandbox, mode: RenderMode): void {
    // 清空发光离屏 canvas
    this.glowCtx.fillStyle = 'rgba(0,0,0,1)';
    this.glowCtx.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);

    // 发光离屏 ImageData
    const glowImgData = this.glowCtx.createImageData(this.glowCanvas.width, this.glowCanvas.height);
    const glowBuffer = new Uint32Array(glowImgData.data.buffer);
    glowBuffer.fill(0xFF000000); // 黑色底

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        const type = sandbox.gridType[idx];
        const temp = sandbox.gridTemp[idx];
        const spark = sandbox.gridSpark[idx];

        let color32 = 0xFF0A0A0C; // 默认深黑太空背景

        if (mode === 'normal') {
          if (type !== ElementId.NONE) {
            const def = getElementDef(type);
            
            // 1. 导电火花渲染为耀眼的青白色
            if (spark > 4) {
              color32 = this.hexToABGR('#80e5ff');
            } else if (spark > 0) {
              // 冷却中的导电体带微弱余晖
              color32 = this.hexToABGR('#4d7d8a');
            } else {
              color32 = this.hexToABGR(def.color);
            }

            // 对部分高温粒子，如果温度极高，其颜色向热力颜色倾斜（比如烧红的铜或木炭）
            if (type === ElementId.FIRE) {
              // 火焰颜色随寿命渐变
              const life = sandbox.gridLife[idx];
              if (life < 10) {
                color32 = this.hexToABGR('#ff5500'); // 燃尽红
              } else if (life < 20) {
                color32 = this.hexToABGR('#ffa500'); // 橙色
              } else {
                color32 = this.hexToABGR('#ffe57f'); // 青黄明亮
              }
            } else if (type === ElementId.LAVA) {
              // 熔岩发黄光
              const variation = Math.sin(x * 0.1 + sandbox.frameId * 0.05) * 15;
              color32 = this.hexToABGR(variation > 0 ? '#ff4500' : '#ff7f00');
            } else if (type === ElementId.STONE && temp > 800) {
              color32 = this.hexToABGR('#ff7f50'); // 烧红的石块
            } else if (type === ElementId.WOOD && temp > 150) {
              color32 = this.hexToABGR('#5c4033'); // 焦黑的木炭
            }
          }
        } else if (mode === 'heat') {
          color32 = this.getHeatColor(temp);
        } else if (mode === 'pressure') {
          const pressIdx = sandbox.air.getIndex(x, y);
          const press = pressIdx !== -1 ? sandbox.air.pressure[pressIdx] : 0;
          color32 = this.getPressureColor(press);
        }

        this.pixelBuffer[idx] = color32;

        // 提取发光层数据 (常规模式下)
        if (mode === 'normal' && type !== ElementId.NONE) {
          const def = getElementDef(type);
          const isGlowing = def.glow || spark > 4;
          if (isGlowing) {
            // 将坐标映射到下采样离屏 canvas 上
            const gx = Math.floor(x / 2);
            const gy = Math.floor(y / 2);
            const gWidth = this.glowCanvas.width;
            if (gx >= 0 && gx < gWidth && gy >= 0 && gy < this.glowCanvas.height) {
              const gIdx = gy * gWidth + gx;
              glowBuffer[gIdx] = color32;
            }
          }
        }
      }
    }

    // 1. 将主画面渲染到 Canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.width;
    tempCanvas.height = this.height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(this.imgData, 0, 0);

    // 绘制到实际放大的主 Canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(tempCanvas, 0, 0, this.canvas.width, this.canvas.height);

    // 2. 绘制发光图层
    if (mode === 'normal') {
      this.glowCtx.putImageData(glowImgData, 0, 0);
      
      // 应用 CSS blur 模糊发光特效
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'screen'; // 滤色叠加模式
      this.ctx.filter = 'blur(16px)'; // 大范围平滑虚光
      this.ctx.globalAlpha = 0.8;      // 发光强度
      this.ctx.drawImage(this.glowCanvas, 0, 0, this.canvas.width, this.canvas.height);
      
      this.ctx.filter = 'blur(4px)';  // 近身亮光核心
      this.ctx.globalAlpha = 0.5;
      this.ctx.drawImage(this.glowCanvas, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }

    // 3. 气压/风向矢量渲染模式绘制风向箭头
    if (mode === 'pressure') {
      this.drawWindVectors(sandbox);
    }
  }

  // 在压力图上绘制风力风速线
  private drawWindVectors(sandbox: Sandbox): void {
    const air = sandbox.air;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.lineWidth = 1;

    const scaleX = this.canvas.width / air.aw;
    const scaleY = this.canvas.height / air.ah;

    for (let y = 1; y < air.ah - 1; y += 2) {
      for (let x = 1; x < air.aw - 1; x += 2) {
        const idx = y * air.aw + x;
        const vx = air.vx[idx];
        const vy = air.vy[idx];
        const force = Math.sqrt(vx * vx + vy * vy);

        if (force > 0.5) {
          const cx = (x + 0.5) * scaleX;
          const cy = (y + 0.5) * scaleY;
          
          this.ctx.beginPath();
          this.ctx.moveTo(cx, cy);
          this.ctx.lineTo(cx + vx * scaleX * 0.2, cy + vy * scaleY * 0.2);
          this.ctx.stroke();

          // 绘制箭头的小点点
          this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          this.ctx.fillRect(cx + vx * scaleX * 0.2 - 1, cy + vy * scaleY * 0.2 - 1, 2, 2);
        }
      }
    }
    this.ctx.restore();
  }
}