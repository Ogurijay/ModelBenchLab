// 渲染器：把细胞网格画到 ImageData（1 细胞 = 1 像素），支持三种视图
import { W, H, AW, ST_GAS, ST_LIQUID } from './const.js';
import { E, BASE_RGB, STATE } from './elements.js';

export const VIEW_NORMAL = 0;
export const VIEW_TEMP = 1;
export const VIEW_PRESSURE = 2;
export const VIEW_NAMES = ['常规', '温度', '气压'];

const BG = [11, 13, 18];

export class Renderer {
  constructor(canvas, sim) {
    this.sim = sim;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer); // 小端 ABGR
    this.view = VIEW_NORMAL;
    this.particleCount = 0;
  }

  draw() {
    const { sim, buf } = this;
    const { cells, temp, life, noise } = sim;
    const fr = sim.frame;
    let count = 0;

    if (this.view === VIEW_TEMP) {
      for (let i = 0; i < W * H; i++) {
        if (cells[i]) count++;
        buf[i] = tempColor(temp[i]);
      }
    } else if (this.view === VIEW_PRESSURE) {
      for (let y = 0; y < H; y++) {
        const arow = (y >> 2) * AW;
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (cells[i]) count++;
          const p = sim.ap[arow + (x >> 2)];
          // 正压红、负压蓝
          const v = Math.max(-10, Math.min(10, p)) / 10;
          const r = v > 0 ? 30 + v * 225 : 30;
          const b = v < 0 ? 30 - v * 225 : 30;
          const g = 24 + Math.abs(sim.avx[arow + (x >> 2)]) * 18;
          buf[i] = 0xff000000 | (Math.min(255, b) << 16) | (Math.min(255, g | 0) << 8) | Math.min(255, r | 0);
        }
      }
    } else {
      for (let i = 0; i < W * H; i++) {
        const t = cells[i];
        if (t === E.EMPTY) {
          // 空气：低温处结霜感，其余纯背景
          const tc = temp[i];
          if (tc < -40) {
            const f = Math.min(1, (-40 - tc) / 200) * 60;
            buf[i] = rgb(BG[0] + f * 0.4, BG[1] + f * 0.7, BG[2] + f);
          } else buf[i] = rgb(BG[0], BG[1], BG[2]);
          continue;
        }
        count++;
        let r = BASE_RGB[t * 3], g = BASE_RGB[t * 3 + 1], b = BASE_RGB[t * 3 + 2];
        const n = noise[i];

        if (t === E.FIRE) {
          // 火焰按剩余寿命 + 温度渐变：白→黄→橙→红
          const lf = Math.min(1, life[i] / 90);
          const hot = temp[i] > 1800 ? 1 : 0;
          r = 220 + lf * 35;
          g = 90 + lf * 150 + hot * 80;
          b = 30 + lf * 60 + hot * 190;
          const flick = (n + fr * 13) & 31;
          g = Math.max(0, g - flick * 2);
        } else if (t === E.SPARK) {
          const ph = (fr + n) & 3;
          r = 180 + ph * 20; g = 240; b = 255;
        } else if (t === E.VIRUS) {
          const pulse = 40 * Math.sin((fr + n) * 0.2);
          r += pulse; b += pulse;
        } else if (STATE[t] === ST_LIQUID) {
          // 液体微光波动
          const s = ((n + fr * 2) & 15) - 8;
          r += s; g += s; b += s;
        } else {
          // 静态颗粒噪声
          const s = (n & 15) - 8;
          r += s; g += s; b += s;
        }

        // 气体与背景做透明混合
        if (STATE[t] === ST_GAS) {
          const a = 0.4;
          r = r * a + BG[0] * (1 - a);
          g = g * a + BG[1] * (1 - a);
          b = b * a + BG[2] * (1 - a);
        }

        // 高温辉光（金属烧红、岩浆发亮）
        const tc = temp[i];
        if (tc > 400 && t !== E.FIRE && t !== E.SPARK) {
          const gl = Math.min(1, (tc - 400) / 1800);
          r = r + (255 - r) * gl;
          g = g + (140 - g) * gl * 0.85 + (tc > 2000 ? (255 - g) * Math.min(1, (tc - 2000) / 1500) : 0);
          b = b + (tc > 2400 ? (240 - b) * Math.min(1, (tc - 2400) / 1600) : 0);
        }

        buf[i] = rgb(r, g, b);
      }
    }
    this.particleCount = count - (2 * (W + H) - 4); // 扣掉边框墙
    this.ctx.putImageData(this.img, 0, 0);
  }

  // 画笔光标 / 工具预览（在 putImageData 之后叠加矢量层）
  overlay(fn) { fn(this.ctx); }
}

function rgb(r, g, b) {
  r = r < 0 ? 0 : r > 255 ? 255 : r;
  g = g < 0 ? 0 : g > 255 ? 255 : g;
  b = b < 0 ? 0 : b > 255 ? 255 : b;
  return 0xff000000 | (b << 16) | (g << 8) | (r | 0);
}

// 温度色标：-250 深蓝 → 0 青 → 25 深灰 → 400 暗红 → 1200 橙 → 2500 黄 → 4000 白
function tempColor(t) {
  let r, g, b;
  if (t <= 0) {
    const k = Math.min(1, -t / 250);
    r = 20; g = 60 + k * 80; b = 120 + k * 135;
  } else if (t <= 50) {
    const k = t / 50;
    r = 20 + k * 20; g = 60 - k * 25; b = 120 - k * 80;
  } else if (t <= 400) {
    const k = (t - 50) / 350;
    r = 40 + k * 120; g = 35; b = 40 + k * 10;
  } else if (t <= 1200) {
    const k = (t - 400) / 800;
    r = 160 + k * 95; g = 35 + k * 105; b = 50 - k * 30;
  } else if (t <= 2500) {
    const k = (t - 1200) / 1300;
    r = 255; g = 140 + k * 100; b = 20 + k * 60;
  } else {
    const k = Math.min(1, (t - 2500) / 1500);
    r = 255; g = 240 + k * 15; b = 80 + k * 175;
  }
  return 0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
}
