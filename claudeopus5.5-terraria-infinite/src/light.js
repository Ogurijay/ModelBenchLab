// 彩色光照:对视野外扩区域做泰拉瑞亚式“四向扫描传播”(每次进入一格按材质衰减),
// 天光只照射无背景墙、接近天然地表的格子;火把、岩浆、荧石、发光蘑菇等为彩色光源。
// 结果写入一张每格 1 像素的小画布,渲染时双线性放大并以“正片叠底”乘到世界层,得到平滑光照。
import { CS, CSH, CM, ckey, SEA, HELL_Y } from './const.js';
import { BLOCKS, B, WALLS, lightOf } from './blocks.js';

const DECAY_AIR = 0.885, DECAY_SOLID = 0.68, DECAY_WATER = 0.86;
const decayTab = new Float32Array(256), emitR = new Float32Array(256), emitG = new Float32Array(256), emitB = new Float32Array(256);
for (const b of BLOCKS) {
  decayTab[b.id] = b.decay || (b.opaque ? DECAY_SOLID : b.render === 'leaves' ? 0.82 : DECAY_AIR);
  if (b.light) { emitR[b.id] = b.light[0]; emitG[b.id] = b.light[1]; emitB[b.id] = b.light[2]; }
}
const wallTransparent = WALLS.map(w => w.transparent);

export class Lighting {
  constructor(world) {
    this.world = world;
    this.x0 = 0; this.y0 = 0; this.w = 0; this.h = 0;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.cap = 0;
  }
  ensure(n) {
    if (n <= this.cap) return;
    this.cap = n;
    this.R = new Float32Array(n); this.G = new Float32Array(n); this.Bv = new Float32Array(n);
    this.D = new Float32Array(n);
  }

  compute(x0, y0, w, h, sky, extra = []) {
    const world = this.world, gen = world.gen, n = w * h;
    this.ensure(n);
    this.x0 = x0; this.y0 = y0; this.w = w; this.h = h;
    const R = this.R, G = this.G, Bv = this.Bv, D = this.D;
    const [sr, sg, sb] = sky;
    // 采集:按区块整段读取
    for (let cy = y0 >> CSH; cy <= (y0 + h - 1) >> CSH; cy++) for (let cx = x0 >> CSH; cx <= (x0 + w - 1) >> CSH; cx++) {
      const c = world.chunks.get(ckey(cx, cy));
      const tx0 = Math.max(x0, cx * CS), tx1 = Math.min(x0 + w, cx * CS + CS);
      const ty0 = Math.max(y0, cy * CS), ty1 = Math.min(y0 + h, cy * CS + CS);
      for (let ty = ty0; ty < ty1; ty++) {
        let o = (ty - y0) * w + (tx0 - x0);
        for (let tx = tx0; tx < tx1; tx++, o++) {
          if (!c) { R[o] = G[o] = Bv[o] = 0; D[o] = DECAY_SOLID; continue; }
          const i = ((ty & CM) << CSH) | (tx & CM);
          const id = c.fg[i], wl = c.wall[i], fl = c.fluid[i];
          let d = decayTab[id], r = emitR[id], g = emitG[id], bb = emitB[id];
          if (id === B.furnace && (c.meta[i] & 1)) { r = 0.9; g = 0.55; bb = 0.25; }
          if (fl) {
            if ((fl >> 4) === 2) { r = Math.max(r, 1); g = Math.max(g, 0.48); bb = Math.max(bb, 0.16); }
            d = Math.min(d, DECAY_WATER);
          }
          if (!BLOCKS[id].opaque && (!wl || wallTransparent[wl]) && ty < gen.column(tx).s + 7) {
            let k = 1;
            if (fl && (fl >> 4) === 1 && ty >= SEA) k = Math.pow(0.9, ty - SEA + 1);
            if (wl) k *= 0.85;
            if (sr * k > r) r = sr * k;
            if (sg * k > g) g = sg * k;
            if (sb * k > bb) bb = sb * k;
          }
          // 地狱:开阔处弥漫暗红色的岩浆辉光
          if (ty > HELL_Y + 14 && !wl && !BLOCKS[id].opaque) { if (r < 0.34) r = 0.34; if (g < 0.13) g = 0.13; if (bb < 0.07) bb = 0.07; }
          R[o] = r; G[o] = g; Bv[o] = bb; D[o] = d;
        }
      }
    }
    for (const L of extra) {
      const lx = Math.floor(L.x) - x0, ly = Math.floor(L.y) - y0;
      if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
      const o = ly * w + lx;
      R[o] = Math.max(R[o], L.r); G[o] = Math.max(G[o], L.g); Bv[o] = Math.max(Bv[o], L.b);
    }
    // 四向扫描 ×2
    for (let it = 0; it < 2; it++) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = row + 1, e = row + w; x < e; x++) {
          const d = D[x];
          let v = R[x - 1] * d; if (v > R[x]) R[x] = v;
          v = G[x - 1] * d; if (v > G[x]) G[x] = v;
          v = Bv[x - 1] * d; if (v > Bv[x]) Bv[x] = v;
        }
        for (let x = row + w - 2; x >= row; x--) {
          const d = D[x];
          let v = R[x + 1] * d; if (v > R[x]) R[x] = v;
          v = G[x + 1] * d; if (v > G[x]) G[x] = v;
          v = Bv[x + 1] * d; if (v > Bv[x]) Bv[x] = v;
        }
      }
      for (let x = 0; x < w; x++) {
        for (let o = x + w; o < n; o += w) {
          const d = D[o];
          let v = R[o - w] * d; if (v > R[o]) R[o] = v;
          v = G[o - w] * d; if (v > G[o]) G[o] = v;
          v = Bv[o - w] * d; if (v > Bv[o]) Bv[o] = v;
        }
        for (let o = n - w * 2 + x; o >= 0; o -= w) {
          const d = D[o];
          let v = R[o + w] * d; if (v > R[o]) R[o] = v;
          v = G[o + w] * d; if (v > G[o]) G[o] = v;
          v = Bv[o + w] * d; if (v > Bv[o]) Bv[o] = v;
        }
      }
    }
  }

  // 写入小画布(每格 1 像素)
  paint(minLight = 0) {
    const { w, h } = this;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.img = this.ctx.createImageData(w, h);
    }
    const d = this.img.data, R = this.R, G = this.G, Bv = this.Bv;
    for (let o = 0, p = 0; o < w * h; o++, p += 4) {
      d[p] = Math.min(255, (R[o] + minLight) * 255);
      d[p + 1] = Math.min(255, (G[o] + minLight) * 255);
      d[p + 2] = Math.min(255, (Bv[o] + minLight) * 255);
      d[p + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  // 某格亮度 0..1(在计算区域内使用精确值,否则粗略估计)
  at(x, y) {
    const lx = Math.floor(x) - this.x0, ly = Math.floor(y) - this.y0;
    if (lx >= 0 && ly >= 0 && lx < this.w && ly < this.h) {
      const o = ly * this.w + lx;
      return Math.max(this.R[o], this.G[o], this.Bv[o]);
    }
    return this.world.light01(Math.floor(x), Math.floor(y));
  }
  rgb(x, y) {
    const lx = Math.floor(x) - this.x0, ly = Math.floor(y) - this.y0;
    if (lx >= 0 && ly >= 0 && lx < this.w && ly < this.h) { const o = ly * this.w + lx; return [this.R[o], this.G[o], this.Bv[o]]; }
    return [1, 1, 1];
  }
}
