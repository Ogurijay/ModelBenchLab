// 全程序化贴图：可平铺值噪声 + fBm，高度图转法线。零外部资源。

import * as THREE from 'three';
import { RNG, clamp, smoothstep } from '../core/util.js';

const S = 512;

function valueNoise(size, period, rng) {
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
  const out = new Float32Array(size * size);
  const k = period / size;
  for (let y = 0; y < size; y++) {
    const fy = y * k;
    const iy = Math.floor(fy);
    let ty = fy - iy;
    ty = ty * ty * (3 - 2 * ty);
    const y0 = (iy % period) * period, y1 = ((iy + 1) % period) * period;
    for (let x = 0; x < size; x++) {
      const fx = x * k;
      const ix = Math.floor(fx);
      let tx = fx - ix;
      tx = tx * tx * (3 - 2 * tx);
      const x0 = ix % period, x1 = (ix + 1) % period;
      const a = lat[y0 + x0], b = lat[y0 + x1], c = lat[y1 + x0], d = lat[y1 + x1];
      out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
  }
  return out;
}

function fbm(size, basePeriod, octaves, rng, persistence = 0.5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, Math.min(period, size), rng);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= persistence;
    period *= 2;
  }
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < out.length; i++) {
    out[i] /= total;
    if (out[i] < mn) mn = out[i];
    if (out[i] > mx) mx = out[i];
  }
  const r = 1 / (mx - mn || 1);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) * r;
  return out;
}

class Fields {
  constructor(seed) {
    const rng = new RNG(seed);
    this.rng = rng;
    this.low = fbm(S, 4, 6, rng);
    this.mid = fbm(S, 8, 5, rng);
    this.high = fbm(S, 32, 4, rng);
    this.fine = valueNoise(S, 256, rng);
    this.cell = fbm(S, 16, 3, rng);
  }
  s(f, x, y) {
    x = ((x % S) + S) % S;
    y = ((y % S) + S) % S;
    return f[(y | 0) * S + (x | 0)];
  }
}

function makeCanvas(w, h = w) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

/** 像素级生成器：fn(x,y) → 写入 col(r,g,b in 0..1)、hgt */
function generate(w, h, fn) {
  const col = new Float32Array(w * h * 3);
  const hgt = new Float32Array(w * h);
  const out = { r: 0, g: 0, b: 0, h: 0, a: 1 };
  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out.a = 1;
      fn(x, y, out);
      const i = y * w + x;
      col[i * 3] = out.r;
      col[i * 3 + 1] = out.g;
      col[i * 3 + 2] = out.b;
      hgt[i] = out.h;
      alpha[i] = out.a;
    }
  }
  return { w, h, col, hgt, alpha };
}

function toCanvas(img, withAlpha = false) {
  const c = makeCanvas(img.w, img.h);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(img.w, img.h);
  const d = id.data;
  for (let i = 0; i < img.w * img.h; i++) {
    d[i * 4] = clamp(img.col[i * 3], 0, 1) * 255;
    d[i * 4 + 1] = clamp(img.col[i * 3 + 1], 0, 1) * 255;
    d[i * 4 + 2] = clamp(img.col[i * 3 + 2], 0, 1) * 255;
    d[i * 4 + 3] = withAlpha ? clamp(img.alpha[i], 0, 1) * 255 : 255;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function normalCanvas(img, strength = 2) {
  const { w, h, hgt } = img;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(w, h);
  const d = id.data;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const dx = (hgt[y * w + xp] - hgt[y * w + xm]) * strength;
      const dy = (hgt[yp + x] - hgt[ym + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = 1 / Math.hypot(nx, ny, nz);
      nx *= l; ny *= l; nz *= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

/** 粗糙度图（G 通道） */
function roughCanvas(img, fn) {
  const { w, h } = img;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(w, h);
  const d = id.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = clamp(fn(x, y), 0, 1) * 255;
      const i = (y * w + x) * 4;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

/** 在图上打点（坑洞、螺栓、碎石） */
function stampDots(img, count, rng, rMin, rMax, fn) {
  const { w, h } = img;
  for (let n = 0; n < count; n++) {
    const cx = rng.next() * w, cy = rng.next() * h;
    const r = rMin + (rMax - rMin) * rng.next();
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        const x = (((cx + dx) | 0) % w + w) % w, y = (((cy + dy) | 0) % h + h) % h;
        fn(y * w + x, 1 - d, n);
      }
    }
  }
}

function tex(canvas, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function stencil(canvas, lines, { color = 'rgba(235,230,210,0.85)', font = 'bold 72px "Microsoft YaHei","PingFang SC",sans-serif', y = 0.5, x = 0.5, align = 'center', spacing = 1.25, rotate = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width * x, canvas.height * y);
  ctx.rotate(rotate);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const size = parseInt(/(\d+)px/.exec(font)[1], 10);
  lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * size * spacing));
  ctx.restore();
}

/**
 * 生成全部贴图。返回 { key: { map, normalMap?, roughnessMap?, emissiveMap? } }
 */
export function generateTextures(aniso = 8, seed = 7) {
  const F = new Fields(seed);
  const rng = new RNG(seed * 31 + 5);
  const T = {};
  const O = { aniso };
  const put = (key, img, { normal = 0, rough = null, alpha = false } = {}) => {
    const entry = { map: tex(toCanvas(img, alpha), O) };
    if (normal > 0) entry.normalMap = tex(normalCanvas(img, normal), { ...O, srgb: false });
    if (rough) entry.roughnessMap = tex(roughCanvas(img, rough), { ...O, srgb: false });
    entry.img = img;
    T[key] = entry;
    return entry;
  };
  const { low, mid, high, fine, cell } = F;
  const s = (f, x, y) => F.s(f, x, y);

  // ── 浇筑混凝土（墙） ──
  {
    const img = generate(S, S, (x, y, o) => {
      const n = s(low, x, y) * 0.55 + s(mid, x + 97, y + 31) * 0.3 + s(fine, x, y) * 0.15;
      let v = 0.46 + (n - 0.5) * 0.26;
      const stain = smoothstep(0.6, 0.85, s(mid, x * 0.5 + 200, y * 0.25 + 50));
      v -= stain * 0.09;
      // 垂直雨痕
      v -= smoothstep(0.62, 0.9, s(high, x, y * 0.08 + 300)) * 0.06;
      let hh = n * 0.6;
      const sx = x % 256, sy = y % 256;
      if (sx < 2 || sy < 2) { v -= 0.08; hh -= 0.5; }
      // 对拉螺栓孔
      const tx = ((x + 64) % 128) - 64, ty = ((y + 64) % 128) - 64;
      const td = Math.hypot(tx, ty);
      if (td < 5) { v -= 0.12 * (1 - td / 5); hh -= 0.4 * (1 - td / 5); }
      o.r = v * 1.02; o.g = v; o.b = v * 0.96; o.h = hh;
    });
    stampDots(img, 2600, rng, 0.6, 2.2, (i, k) => { img.hgt[i] -= 0.3 * k; img.col[i * 3] *= 1 - 0.25 * k; img.col[i * 3 + 1] *= 1 - 0.25 * k; img.col[i * 3 + 2] *= 1 - 0.25 * k; });
    put('concrete', img, { normal: 3.5, rough: (x, y) => 0.82 + s(mid, x, y) * 0.15 });
  }
  // ── 庭院路面：2m 预制板 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const slab = ((x / 256) | 0) + ((y / 256) | 0) * 2;
      const tone = [0.0, 0.035, -0.03, 0.02][slab];
      const n = s(low, x + 50, y + 80) * 0.5 + s(high, x, y) * 0.3 + s(fine, x + 7, y) * 0.2;
      let v = 0.42 + tone + (n - 0.5) * 0.22;
      v -= smoothstep(0.62, 0.92, s(mid, x + 300, y + 120)) * 0.13; // 油污
      v -= smoothstep(0.7, 0.95, s(cell, x * 2, y * 2)) * 0.05;
      let hh = n * 0.5;
      const sx = x % 256, sy = y % 256;
      if (sx < 3 || sy < 3) { v *= 0.55; hh -= 0.8; }
      o.r = v * 1.0; o.g = v * 0.99; o.b = v * 0.97; o.h = hh;
    });
    // 裂纹：随机游走
    for (let c = 0; c < 26; c++) {
      let x = rng.next() * S, y = rng.next() * S, a = rng.next() * Math.PI * 2;
      const len = 40 + rng.next() * 140;
      for (let i = 0; i < len; i++) {
        a += (rng.next() - 0.5) * 0.7;
        x += Math.cos(a);
        y += Math.sin(a);
        const ix = ((x | 0) % S + S) % S, iy = ((y | 0) % S + S) % S;
        const k = iy * S + ix;
        img.col[k * 3] *= 0.6; img.col[k * 3 + 1] *= 0.6; img.col[k * 3 + 2] *= 0.6;
        img.hgt[k] -= 0.6;
      }
    }
    put('pave', img, { normal: 3, rough: (x, y) => 0.75 + s(high, x, y) * 0.2 - smoothstep(0.62, 0.92, s(mid, x + 300, y + 120)) * 0.35 });
  }
  // ── 峡谷泥土碎石 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const n = s(low, x + 11, y + 400) * 0.5 + s(mid, x, y) * 0.3 + s(fine, x, y + 9) * 0.2;
      const wet = smoothstep(0.55, 0.8, s(low, x + 260, y + 33));
      const v = 0.36 + (n - 0.5) * 0.3 - wet * 0.1;
      o.r = v * 1.12; o.g = v * 0.98; o.b = v * 0.82; o.h = n;
    });
    stampDots(img, 5000, rng, 0.8, 3.2, (i, k, n) => {
      const t = n % 3 === 0 ? 1.35 : 0.72;
      img.hgt[i] += 0.5 * k;
      img.col[i * 3] *= t; img.col[i * 3 + 1] *= t; img.col[i * 3 + 2] *= t;
    });
    put('ground', img, { normal: 4, rough: () => 0.95 });
  }
  // ── 沥青 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const n = s(high, x, y) * 0.4 + s(fine, x + 3, y + 1) * 0.6;
      let v = 0.15 + (n - 0.5) * 0.08 + (s(low, x, y) - 0.5) * 0.06;
      // 中心黄线残迹（沿 v）
      const lx = (x + 256) % S;
      if (lx > 248 && lx < 264 && (y % 128) < 80) {
        const wear = s(mid, x, y);
        if (wear > 0.38) { o.r = 0.62; o.g = 0.5; o.b = 0.12; o.h = n; return; }
      }
      o.r = v; o.g = v; o.b = v * 1.03; o.h = n * 0.6;
    });
    put('asphalt', img, { normal: 2.5, rough: () => 0.88 });
  }
  // ── 室内地砖（75cm 方砖） ──
  {
    const img = generate(S, S, (x, y, o) => {
      const tx = (x / 128) | 0, ty = (y / 128) | 0;
      const tone = (((tx * 7 + ty * 13) % 5) - 2) * 0.012;
      const n = s(high, x, y) * 0.5 + s(fine, x, y) * 0.5;
      let v = 0.56 + tone + (n - 0.5) * 0.05 - smoothstep(0.65, 0.9, s(mid, x + 77, y)) * 0.08;
      let hh = 0.5;
      if (x % 128 < 2 || y % 128 < 2) { v = 0.3; hh = 0; }
      o.r = v * 0.95; o.g = v * 0.98; o.b = v * 1.02; o.h = hh;
    });
    put('floor', img, { normal: 1.5, rough: (x, y) => 0.45 + s(mid, x, y) * 0.3 });
  }
  // ── 反应堆地板：防滑钢板 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const px = x % 256, py = y % 256;
      const n = s(mid, x + 13, y + 99) * 0.6 + s(fine, x, y) * 0.4;
      let v = 0.24 + (n - 0.5) * 0.1;
      let hh = 0.4;
      if (px < 3 || py < 3) { v = 0.08; hh = 0; }
      for (const [bx, by] of [[14, 14], [242, 14], [14, 242], [242, 242]]) {
        const d = Math.hypot(px - bx, py - by);
        if (d < 6) { v = 0.34 - d * 0.02; hh = 0.9 - d * 0.1; }
      }
      v -= smoothstep(0.6, 0.85, s(low, x + 31, y + 7)) * 0.08;
      o.r = v * 0.96; o.g = v; o.b = v * 1.05; o.h = hh;
    });
    put('plateFloor', img, { normal: 2.5, rough: (x, y) => 0.4 + s(mid, x, y) * 0.35 });
  }
  // ── 墙面金属板（2m×1m） ──
  {
    const img = generate(S, S, (x, y, o) => {
      const px = x % 256, py = y % 128;
      const n = s(mid, x, y) * 0.5 + s(fine, x, y) * 0.2 + s(high, x, y) * 0.3;
      let v = 0.36 + (n - 0.5) * 0.08;
      v -= smoothstep(0.55, 0.85, s(high, x * 0.7, y * 0.06 + 40)) * 0.08; // 竖向污渍
      v += ((((x / 256) | 0) + ((y / 128) | 0)) % 2) * 0.02;
      let hh = 0.5;
      if (px < 3 || py < 3) { v *= 0.45; hh = 0; }
      if ((px > 6 && px < 9) || (py > 6 && py < 9)) hh = 0.65;
      // 铆钉
      const onEdgeX = px < 14 || px > 242, onEdgeY = py < 14 || py > 114;
      if (onEdgeX || onEdgeY) {
        const rx = onEdgeX ? (px < 14 ? 9 : 249) : (Math.round((px - 9) / 32) * 32 + 9);
        const ry = onEdgeY ? (py < 14 ? 9 : 121) : (Math.round((py - 9) / 32) * 32 + 9);
        const d = Math.hypot(px - rx, py - ry);
        if (d < 3.2) { hh = 1; v += 0.06; }
      }
      o.r = v * 0.92; o.g = v * 0.98; o.b = v * 1.08; o.h = hh;
    });
    put('metal', img, { normal: 3, rough: (x, y) => 0.5 + s(mid, x + 40, y) * 0.35 });
  }
  // ── 控制中心浅色墙板 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const px = x % 256, py = y % 256;
      const n = s(high, x, y) * 0.6 + s(fine, x, y) * 0.4;
      let v = 0.68 + (n - 0.5) * 0.04;
      let hh = 0.5;
      if (px < 2 || py < 2) { v = 0.42; hh = 0; }
      if (py > 230 && py < 238) { v = 0.5; hh = 0.3; }
      o.r = v * 1.0; o.g = v * 1.0; o.b = v * 0.97; o.h = hh;
    });
    put('panel', img, { normal: 1.5, rough: () => 0.6 });
  }
  // ── 深色结构钢（划痕） ──
  {
    const img = generate(S, S, (x, y, o) => {
      const n = s(mid, x, y) * 0.6 + s(fine, x, y) * 0.4;
      const v = 0.16 + (n - 0.5) * 0.06;
      o.r = v; o.g = v * 1.02; o.b = v * 1.07; o.h = n * 0.3;
    });
    for (let c = 0; c < 220; c++) {
      let x = rng.next() * S, y = rng.next() * S;
      const a = rng.next() * Math.PI, len = 6 + rng.next() * 50;
      for (let i = 0; i < len; i++) {
        x += Math.cos(a); y += Math.sin(a);
        const k = ((((y | 0) % S) + S) % S) * S + ((((x | 0) % S) + S) % S);
        img.col[k * 3] += 0.08; img.col[k * 3 + 1] += 0.08; img.col[k * 3 + 2] += 0.09;
      }
    }
    put('metalDark', img, { normal: 1.5, rough: (x, y) => 0.45 + s(mid, x, y) * 0.3 });
  }
  // ── 花纹防滑板（走廊） ──
  {
    const img = generate(S, S, (x, y, o) => {
      const n = s(mid, x, y) * 0.7 + s(fine, x, y) * 0.3;
      const cx = x % 32, cy = y % 32;
      const flip = (((x / 32) | 0) + ((y / 32) | 0)) % 2;
      // 菱形凸纹
      let u = cx - 16, w = cy - 16;
      if (flip) { const t = u; u = w; w = -t; }
      const a = (u + w) * 0.7071, b = (u - w) * 0.7071;
      const lozenge = Math.max(0, 1 - Math.hypot(a / 10, b / 2.4));
      const v = 0.3 + (n - 0.5) * 0.12 + lozenge * 0.08;
      o.r = v * 0.97; o.g = v; o.b = v * 1.04; o.h = lozenge;
    });
    put('plate', img, { normal: 5, rough: (x, y) => 0.38 + s(mid, x, y) * 0.3 });
  }
  // ── 警示条纹 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const stripe = ((x + y) % 128) < 64;
      const wear = s(mid, x, y) * 0.6 + s(fine, x, y) * 0.4;
      const chip = wear > 0.72;
      let r, g, b;
      if (chip) { r = g = b = 0.3; }
      else if (stripe) { r = 0.86; g = 0.62; b = 0.06; }
      else { r = g = b = 0.05; }
      const dirt = 1 - s(low, x, y) * 0.25;
      o.r = r * dirt; o.g = g * dirt; o.b = b * dirt; o.h = chip ? 0 : 0.5;
    });
    put('hazard', img, { normal: 1.5, rough: (x, y) => (s(mid, x, y) > 0.72 ? 0.45 : 0.65) });
  }
  // ── 集装箱瓦楞（四色） ──
  const corrugated = (key, base) => {
    const img = generate(S, S, (x, y, o) => {
      const ridge = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 24);
      const shade = 0.8 + 0.2 * ridge;
      const rust = smoothstep(0.62, 0.82, s(mid, x + 20, y + 300) * 0.7 + s(fine, x, y) * 0.3);
      const streak = smoothstep(0.55, 0.9, s(high, x * 0.8, y * 0.05 + 10)) * 0.25;
      const n = 0.9 + (s(low, x, y) - 0.5) * 0.2;
      let r = base[0] * shade * n, g = base[1] * shade * n, b = base[2] * shade * n;
      r = r * (1 - rust) + 0.36 * rust * shade; g = g * (1 - rust) + 0.17 * rust * shade; b = b * (1 - rust) + 0.08 * rust * shade;
      r *= 1 - streak; g *= 1 - streak; b *= 1 - streak;
      o.r = r; o.g = g; o.b = b; o.h = ridge;
    });
    put(key, img, { normal: 6, rough: (x, y) => 0.55 + s(mid, x + 20, y + 300) * 0.35 });
  };
  corrugated('cont_red', [0.55, 0.13, 0.08]);
  corrugated('cont_blue', [0.1, 0.24, 0.42]);
  corrugated('cont_green', [0.2, 0.33, 0.2]);
  corrugated('cont_orange', [0.82, 0.4, 0.09]);
  // 屋面（深色瓦楞）
  {
    const img = generate(S, S, (x, y, o) => {
      const ridge = 0.5 + 0.5 * Math.sin((x / S) * Math.PI * 2 * 12);
      const v = (0.2 + ridge * 0.06) * (0.9 + s(low, x, y) * 0.2);
      o.r = v; o.g = v; o.b = v * 1.05; o.h = ridge;
    });
    put('roof', img, { normal: 4, rough: () => 0.7 });
  }
  // ── 军用箱（单面 0..1） ──
  const crateTex = (key, base, text) => {
    const img = generate(256, 256, (x, y, o) => {
      const n = s(mid, x * 2, y * 2) * 0.5 + s(fine, x * 2, y * 2) * 0.5;
      let v = 1;
      let hh = 0.5;
      const edge = Math.min(x, y, 255 - x, 255 - y);
      if (edge < 18) { v = 0.75; hh = 1; }
      else if (edge < 21) { v = 0.5; hh = 0.2; }
      else if ((y - 21) % 54 < 2) { v = 0.62; hh = 0.3; }
      if (edge < 18 && ((x < 30 || x > 225) && (y < 30 || y > 225))) { v = 0.45; hh = 1.2; }
      const wear = smoothstep(0.65, 0.9, n) * 0.25;
      o.r = base[0] * v * (1 - wear * 0.5) + wear * 0.2; o.g = base[1] * v * (1 - wear * 0.5) + wear * 0.18; o.b = base[2] * v * (1 - wear * 0.5) + wear * 0.14; o.h = hh;
    });
    const e = put(key, img, { normal: 2.5, rough: () => 0.75 });
    const c = e.map.image;
    stencil(c, text, { font: 'bold 34px "Microsoft YaHei",sans-serif', color: 'rgba(230,225,200,0.78)', y: 0.52 });
    e.map.needsUpdate = true;
  };
  crateTex('crate', [0.27, 0.31, 0.19], ['军需 07', '▲ 此面朝上']);
  crateTex('crateTan', [0.56, 0.48, 0.33], ['7.62×39', 'AMMO']);
  {
    const img = generate(256, 256, (x, y, o) => {
      const n = s(fine, x * 2, y * 2) * 0.3 + s(mid, x, y) * 0.7;
      let v = 0.48 + (n - 0.5) * 0.1;
      if (Math.abs(y - 128) < 14) v = 0.62;
      o.r = v * 1.1; o.g = v * 0.86; o.b = v * 0.6; o.h = 0.5;
    });
    put('cardboard', img, { normal: 0, rough: () => 0.9 });
  }
  // ── 岩石 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const n = s(low, x, y) * 0.45 + s(mid, x + 3, y + 7) * 0.35 + s(high, x, y) * 0.2;
      const strata = Math.sin(y * 0.045 + s(mid, x, y) * 7) * 0.5 + 0.5;
      const v = 0.33 + (n - 0.5) * 0.35 + strata * 0.05;
      o.r = v * 1.1; o.g = v * 0.98; o.b = v * 0.86; o.h = n + strata * 0.2;
    });
    put('rock', img, { normal: 6, rough: () => 0.92 });
  }
  // ── 沙袋 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const row = (y / 64) | 0;
      const off = (row % 2) * 64;
      const bx = ((x + off) % 128) - 64, by = (y % 64) - 32;
      const d = Math.hypot(bx / 62, by / 30);
      const bump = Math.max(0, 1 - d * d);
      const weave = ((x + y) % 4 < 2 ? 0.03 : -0.03) + (s(fine, x, y) - 0.5) * 0.08;
      const v = (0.45 + bump * 0.12 + weave) * (d > 0.97 ? 0.55 : 1);
      o.r = v * 1.08; o.g = v * 0.98; o.b = v * 0.72; o.h = bump;
    });
    put('sandbag', img, { normal: 4, rough: () => 0.95 });
  }
  // ── 储罐涂装 ──
  {
    const img = generate(S, S, (x, y, o) => {
      let v = 0.72 + (s(low, x, y) - 0.5) * 0.08;
      let hh = 0.5;
      if (y % 256 < 3) { v -= 0.15; hh = 0.9; }
      if ((x + ((y / 256) | 0) * 128) % 256 < 3) { v -= 0.12; hh = 0.9; }
      const streak = smoothstep(0.55, 0.85, s(high, x, y * 0.05 + 70)) * smoothstep(0, 140, (y % 256));
      o.r = v - streak * 0.18; o.g = v - streak * 0.24; o.b = v * 0.98 - streak * 0.3; o.h = hh;
    });
    put('tank', img, { normal: 2, rough: (x, y) => 0.5 + s(mid, x, y) * 0.3 });
  }
  // ── 通用涂装金属（叉车、卡车、扶手等，靠材质颜色着色） ──
  {
    const img = generate(S, S, (x, y, o) => {
      const n = s(mid, x, y) * 0.6 + s(fine, x, y) * 0.4;
      const chip = smoothstep(0.7, 0.8, n);
      const dirt = smoothstep(0.4, 0.9, s(low, x + 5, y + 5)) * 0.25;
      const v = (1 - chip * 0.6) * (1 - dirt);
      o.r = v; o.g = v; o.b = v; o.h = chip ? 0 : 0.5;
    });
    put('paint', img, { normal: 1, rough: (x, y) => 0.5 + smoothstep(0.7, 0.8, s(mid, x, y) * 0.6 + s(fine, x, y) * 0.4) * 0.4 });
  }
  // ── 服务器机柜（前面板 + LED 自发光） ──
  {
    const img = generate(256, 256, (x, y, o) => {
      const u = y % 16;
      let v = 0.1;
      if (u < 1) v = 0.03;
      else if (x > 20 && x < 236 && u > 4 && u < 12 && x % 6 < 3) v = 0.05;
      if (x < 10 || x > 246) v = 0.16;
      o.r = v; o.g = v; o.b = v * 1.1; o.h = v;
    });
    const e = put('server', img, { normal: 0, rough: () => 0.4 });
    const em = makeCanvas(256, 256);
    const ctx = em.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 256, 256);
    const colors = ['#29ff6a', '#2ac8ff', '#ffb02a', '#29ff6a', '#29ff6a'];
    for (let y = 8; y < 256; y += 16) {
      for (let k = 0; k < 4; k++) {
        if (rng.next() < 0.25) continue;
        ctx.fillStyle = rng.pick(colors);
        ctx.fillRect(14 + k * 7, y - 2, 3, 3);
      }
      if (rng.next() < 0.3) {
        ctx.fillStyle = '#ff3b2a';
        ctx.fillRect(232, y - 2, 3, 3);
      }
    }
    e.emissiveMap = tex(em, O);
  }
  // ── 屏幕 ──
  const screenCanvas = (w, h, big) => {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04131e');
    g.addColorStop(1, '#021019');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(80,220,255,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = 'rgba(120,230,255,0.9)';
    ctx.font = `bold ${big ? 28 : 18}px Consolas, monospace`;
    ctx.fillText(big ? 'VEGA CORE // 数据节点' : 'BLACKSTONE', 16, big ? 40 : 28);
    ctx.strokeStyle = 'rgba(80,220,255,0.8)';
    ctx.beginPath();
    for (let i = 0; i < 40; i++) {
      const x = 16 + i * ((w - 32) / 40);
      const y = h * 0.62 + Math.sin(i * 0.7) * h * 0.08 + (rng.next() - 0.5) * h * 0.08;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(80,220,255,0.35)';
    for (let i = 0; i < 6; i++) ctx.fillRect(16, (big ? 60 : 40) + i * (big ? 18 : 10), (w - 40) * rng.next(), big ? 8 : 4);
    return c;
  };
  T.screen = { map: tex(screenCanvas(256, 128, false), O) };
  {
    const c = screenCanvas(512, 320, true);
    T.screenBig = { map: tex(c, O), canvas: c };
  }
  // ── 铁丝网（alpha） ──
  {
    const img = generate(128, 128, (x, y, o) => {
      const a = ((x + y) % 32 + 32) % 32, b = ((x - y) % 32 + 32) % 32;
      const wire = Math.min(a, 32 - a) < 1.6 || Math.min(b, 32 - b) < 1.6;
      o.r = o.g = o.b = 0.55;
      o.h = 0;
      o.a = wire ? 1 : 0;
    });
    T.fence = { map: tex(toCanvas(img, true), O) };
  }
  // ── 大门（本地 UV 4m×7.3m） ──
  {
    const W2 = 256, H2 = 512;
    const img = generate(W2, H2, (x, y, o) => {
      const n = s(mid, x * 2, y) * 0.6 + s(fine, x, y) * 0.4;
      let r = 0.42, g = 0.4, b = 0.33;
      let hh = 0.5;
      if (x % 42 < 4) { r *= 0.7; g *= 0.7; b *= 0.7; hh = 1; }
      if (y > H2 - 70) {
        const st = ((x + y) % 48) < 24;
        if (st) { r = 0.85; g = 0.6; b = 0.07; } else { r = g = b = 0.06; }
        hh = 0.5;
      }
      if (y < 12 || y > H2 - 12 || x < 8 || x > W2 - 8) { r = g = b = 0.15; hh = 0.8; }
      const wear = smoothstep(0.7, 0.85, n) * 0.4;
      o.r = r * (1 - wear) + 0.18 * wear; o.g = g * (1 - wear) + 0.17 * wear; o.b = b * (1 - wear) + 0.16 * wear; o.h = hh;
    });
    const e = put('gate', img, { normal: 3, rough: () => 0.6 });
    stencil(e.map.image, ['黑石', 'BLACKSTONE'], { font: 'bold 40px "Microsoft YaHei",sans-serif', y: 0.32, color: 'rgba(20,20,20,0.75)' });
    stencil(e.map.image, ['危险 · 闸门运动区'], { font: 'bold 20px "Microsoft YaHei",sans-serif', y: 0.72, color: 'rgba(240,210,60,0.85)' });
    e.map.needsUpdate = true;
  }
  // ── 卷帘门 ──
  {
    const img = generate(256, 256, (x, y, o) => {
      const slat = y % 12;
      let v = 0.42 + (slat < 2 ? -0.18 : slat > 9 ? 0.06 : 0) + (s(mid, x, y) - 0.5) * 0.1;
      let r = v, g = v, b = v * 1.03;
      if (y > 226) {
        const st = ((x + y) % 40) < 20;
        if (st) { r = 0.85; g = 0.6; b = 0.07; } else { r = g = b = 0.06; }
      }
      o.r = r; o.g = g; o.b = b; o.h = slat < 2 ? 0 : 0.6;
    });
    put('shutter', img, { normal: 3, rough: () => 0.55 });
  }
  // ── 停机坪 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const n = s(high, x, y) * 0.5 + s(fine, x, y) * 0.5;
      let v = 0.2 + (n - 0.5) * 0.06;
      let r = v, g = v, b = v;
      const cx = x - 256, cy = y - 256;
      const d = Math.hypot(cx, cy);
      if (d > 200 && d < 216) { r = 0.85; g = 0.65; b = 0.1; }
      // H
      const inH = (Math.abs(cx + 60) < 18 || Math.abs(cx - 60) < 18) && Math.abs(cy) < 110;
      const bar = Math.abs(cx) < 60 && Math.abs(cy) < 16;
      if (inH || bar) { r = g = b = 0.85; }
      if (x < 10 || y < 10 || x > S - 10 || y > S - 10) { r = 0.85; g = 0.65; b = 0.1; }
      const wear = smoothstep(0.7, 0.9, s(mid, x, y));
      o.r = r * (1 - wear * 0.4); o.g = g * (1 - wear * 0.4); o.b = b * (1 - wear * 0.4); o.h = 0.5;
    });
    put('helipad', img, { normal: 0, rough: () => 0.8 });
  }
  // ── 柜子 ──
  {
    const img = generate(128, 256, (x, y, o) => {
      let v = 0.38;
      if (y > 20 && y < 50 && x > 30 && x < 98 && (y % 6) < 3) v = 0.2;
      if (y > 200 && y < 230 && x > 30 && x < 98 && (y % 6) < 3) v = 0.2;
      if (x > 100 && x < 108 && y > 110 && y < 150) v = 0.6;
      if (x < 4 || x > 123) v = 0.2;
      const n = (s(fine, x, y) - 0.5) * 0.05;
      o.r = (v + n) * 0.82; o.g = (v + n) * 0.95; o.b = (v + n) * 0.88; o.h = v;
    });
    put('locker', img, { normal: 2, rough: () => 0.55 });
  }
  // ── 木纹 / 布面 ──
  {
    const img = generate(S, S, (x, y, o) => {
      const grain = Math.sin((x + s(mid, x, y) * 60) * 0.12) * 0.5 + 0.5;
      const v = 0.36 + grain * 0.08 + (s(fine, x, y) - 0.5) * 0.04;
      o.r = v * 1.2; o.g = v * 0.92; o.b = v * 0.66; o.h = grain;
    });
    put('wood', img, { normal: 0.6, rough: () => 0.55 });
  }
  {
    const img = generate(256, 256, (x, y, o) => {
      const weave = ((x % 4) < 2) !== ((y % 4) < 2) ? 0.04 : -0.04;
      const v = 0.3 + weave + (s(fine, x * 2, y * 2) - 0.5) * 0.06;
      o.r = v; o.g = v; o.b = v; o.h = weave;
    });
    put('fabric', img, { normal: 1, rough: () => 0.95 });
  }

  // ── 文字标识 ──
  const signCanvas = (w, h, draw) => {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    return c;
  };
  const plate = (ctx, w, h, bg = '#1c2228', border = '#d9a21a') => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(4, h * 0.05);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  };
  T.sign_logo = {
    map: tex(signCanvas(1024, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.86;
      // 六边形标志
      ctx.fillStyle = '#e8e4da';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#20252b';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        ctx.lineTo(128 + Math.cos(a) * 62, 128 + Math.sin(a) * 62);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8e4da';
      ctx.font = 'bold 120px "Microsoft YaHei",sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('黑石', 260, 104);
      ctx.font = 'bold 54px Consolas, "Arial Black", sans-serif';
      ctx.fillText('B L A C K S T O N E', 264, 200);
    }), { ...O, repeat: false }),
    transparent: true,
  };
  const textSign = (key, lines, w = 1024, h = 256, accent = '#d9a21a') => {
    T[key] = {
      map: tex(signCanvas(w, h, (ctx) => {
        plate(ctx, w, h, '#1b2026', accent);
        ctx.fillStyle = '#f0ece0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach((l, i) => {
          ctx.font = l.font;
          ctx.fillStyle = l.color || '#f0ece0';
          ctx.fillText(l.text, w / 2, h * l.y);
        });
      }), { ...O, repeat: false }),
    };
  };
  textSign('sign_warning', [
    { text: '⚠ 警告 · 高压电网', font: 'bold 64px "Microsoft YaHei",sans-serif', y: 0.36, color: '#ffcc33' },
    { text: 'WARNING · LETHAL DEFENSE ZONE', font: 'bold 40px Consolas, monospace', y: 0.72 },
  ], 1024, 512);
  textSign('sign_armory', [{ text: '军械库  ARMORY', font: 'bold 120px "Microsoft YaHei",sans-serif', y: 0.52 }]);
  textSign('sign_warehouse', [
    { text: 'A1  仓库  WAREHOUSE', font: 'bold 110px "Microsoft YaHei",sans-serif', y: 0.52 },
  ]);
  textSign('sign_control', [{ text: 'C2  控制中心  CONTROL', font: 'bold 100px "Microsoft YaHei",sans-serif', y: 0.52 }]);
  textSign('sign_reactor', [
    { text: 'R · 反应堆  REACTOR', font: 'bold 110px "Microsoft YaHei",sans-serif', y: 0.42 },
    { text: '未经授权禁止进入 / AUTHORIZED PERSONNEL ONLY', font: 'bold 40px "Microsoft YaHei",sans-serif', y: 0.8, color: '#ffcc33' },
  ]);

  // ── 反应堆芯体纹理（能量流） ──
  {
    const img = generate(256, 256, (x, y, o) => {
      const n = s(mid, x * 2, y * 2);
      const band = Math.sin(y * 0.15 + n * 8) * 0.5 + 0.5;
      const v = 0.4 + band * 0.6;
      o.r = v * 0.5; o.g = v; o.b = v; o.h = 0;
    });
    T.reactorCore = { map: tex(toCanvas(img), O) };
  }

  for (const k of Object.keys(T)) delete T[k].img;
  return T;
}

/** 重绘机房大屏（下载进度） */
export function drawServerScreen(entry, progress, status) {
  const c = entry.canvas;
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  ctx.fillStyle = '#03111b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(80,220,255,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = 'rgba(140,235,255,0.95)';
  ctx.font = 'bold 30px Consolas, monospace';
  ctx.fillText('VEGA CORE // 数据上传', 20, 46);
  ctx.font = 'bold 22px "Microsoft YaHei", Consolas, monospace';
  ctx.fillStyle = progress >= 1 ? '#7dff9a' : '#ffd25a';
  ctx.fillText(status, 20, 96);
  ctx.strokeStyle = 'rgba(80,220,255,0.9)';
  ctx.strokeRect(20, 130, w - 40, 46);
  ctx.fillStyle = progress >= 1 ? 'rgba(90,255,140,0.85)' : 'rgba(80,220,255,0.75)';
  ctx.fillRect(24, 134, (w - 48) * clamp(progress, 0, 1), 38);
  ctx.fillStyle = '#e8fbff';
  ctx.font = 'bold 48px Consolas, monospace';
  ctx.fillText(`${Math.floor(clamp(progress, 0, 1) * 100)}%`, 20, 250);
  ctx.font = '16px Consolas, monospace';
  ctx.fillStyle = 'rgba(120,230,255,0.6)';
  for (let i = 0; i < 4; i++) {
    const hex = Math.floor((progress * 9973 + i * 7919) % 65535).toString(16).padStart(4, '0').toUpperCase();
    ctx.fillText(`0x${hex}  BLK-${String(Math.floor(progress * 4096) + i).padStart(4, '0')}  OK`, 230, 222 + i * 20);
  }
  entry.map.needsUpdate = true;
}
