// 程序化像素美术:所有贴图都在运行时以代码绘制,不依赖任何外部图片。
// 泰拉瑞亚式“2 倍像素”:方块以 8×8 美术像素绘制,每个美术像素占 2×2 内部像素(格子 16px)。
// 实心方块按 4 邻接掩码预生成 16 种“边框”版本(暴露面描暗边、外角削圆),实现与邻居自然拼接。
import { BLOCKS, B, WALLS, SPECIES_KEYS } from './blocks.js';
import { ITEMS, ITEM_LIST, TIERS, ARMOR_TIERS } from './items.js';
import { mulberry32, hash32, hash2 } from './rng.js';

// ———————————————————————————— 颜色与像素缓冲
export const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const sh = (c, k) => [Math.min(255, c[0] * k) | 0, Math.min(255, c[1] * k) | 0, Math.min(255, c[2] * k) | 0];
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
export const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export class Pix {
  constructor(w = 8, h = 8) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : a;
  }
  get(x, y) { const i = (y * this.w + x) * 4, d = this.d; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
  a(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  clear(x, y) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[(y * this.w + x) * 4 + 3] = 0; }
  rect(x, y, w, h, c, a) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a); }
  shade(x, y, k) { if (this.a(x, y)) { const p = this.get(x, y); this.set(x, y, sh(p, k), p[3]); } }
  clone() { const p = new Pix(this.w, this.h); p.d.set(this.d); return p; }
  canvas(scale = 2) {
    const c = document.createElement('canvas');
    c.width = this.w * scale; c.height = this.h * scale;
    const g = c.getContext('2d'), img = g.createImageData(c.width, c.height);
    blitScaled(img.data, c.width, 0, 0, this, scale);
    g.putImageData(img, 0, 0);
    return c;
  }
}
function blitScaled(dst, dw, ox, oy, p, s) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const si = (y * p.w + x) * 4;
    if (!p.d[si + 3]) continue;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const di = ((oy + y * s + j) * dw + ox + x * s + i) * 4;
      dst[di] = p.d[si]; dst[di + 1] = p.d[si + 1]; dst[di + 2] = p.d[si + 2]; dst[di + 3] = p.d[si + 3];
    }
  }
}

// 用字符模板绘制(icon 等);'.' 为透明
export function tpl(rows, pal) {
  const p = new Pix(rows[0].length, rows.length);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const ch = r[x]; if (ch !== '.' && ch !== ' ' && pal[ch]) p.set(x, y, pal[ch]); } });
  return p;
}

function noiseFill(p, base, amt, r) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, sh(base, 1 + (r() - 0.5) * amt));
}
function dots(p, c, n, r, x0 = 0, y0 = 0, w = p.w, h = p.h) {
  for (let i = 0; i < n; i++) p.set(x0 + (r() * w | 0), y0 + (r() * h | 0), c);
}
// 迷你 Voronoi:圆石、沙砾、石头的块状纹理
function cells(p, r, n, base, crack, opt = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([r() * 8, r() * 8, 0.82 + r() * 0.3]);
  const thr = opt.thr ?? 0.55;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let d1 = 1e9, d2 = 1e9, bi = 0;
    for (let i = 0; i < n; i++) {
      let dx = Math.abs(x + 0.5 - pts[i][0]), dy = Math.abs(y + 0.5 - pts[i][1]);
      dx = Math.min(dx, 8 - dx); dy = Math.min(dy, 8 - dy);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; bi = i; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 < thr) p.set(x, y, crack);
    else {
      let k = pts[bi][2];
      const dx = x + 0.5 - pts[bi][0], dy = y + 0.5 - pts[bi][1];
      if (opt.hl && dx < -0.4 && dy < -0.4 && d1 > 0.9) k *= 1.12;
      if (opt.hl && dx > 0.6 && dy > 0.6) k *= 0.92;
      p.set(x, y, sh(base, k * (1 + (r() - 0.5) * (opt.grain ?? 0.06))));
    }
  }
}

// ———————————————————————————— 方块基础纹理(8×8 美术像素)
const COL = {
  dirt: hex('#976b4b'), stone: hex('#80808a'), sand: hex('#dcc48a'), mud: hex('#5c4a42'),
};
const GRASS_SEASON = [hex('#5cc23e'), hex('#3fa23a'), hex('#b8a63a'), hex('#e8f0f6')];
const LEAF_SEASON = {
  0: [hex('#5bb83c'), hex('#3c9a34'), hex('#d8702a'), hex('#7a5a3a')],
  1: [hex('#92d05a'), hex('#6cb048'), hex('#f0c030'), hex('#8a7048')],
  2: [hex('#2f7040'), hex('#2a6a3a'), hex('#2d6a3c'), hex('#2d6a3c')],
  3: [hex('#2fa02c'), hex('#2fa02c'), hex('#2fa02c'), hex('#2fa02c')],
  4: [hex('#4cb03c'), hex('#4cb03c'), hex('#4cb03c'), hex('#4cb03c')],
};

function paintDirt(p, r, base = COL.dirt) {
  noiseFill(p, base, 0.1, r);
  dots(p, sh(base, 0.72), 4, r);
  dots(p, sh(base, 1.22), 2, r);
}
function paintOre(p, r, base, c, hl) {
  cells(p, r, 3, base, sh(base, 0.68), { thr: 0.5, hl: true });
  const n = 2 + (r() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const x = 1 + (r() * 5 | 0), y = 1 + (r() * 5 | 0);
    p.set(x, y, c); p.set(x + 1, y, sh(c, 0.8)); p.set(x, y + 1, sh(c, 0.7));
    if (r() < 0.6) p.set(x + 1, y + 1, sh(c, 0.6));
    p.set(x, y, hl);
  }
}

const PAINT = {
  dirt: (p, r) => paintDirt(p, r),
  grass: (p, r) => paintDirt(p, r),
  snow_grass: (p, r) => paintDirt(p, r),
  jungle_grass: (p, r) => paintDirt(p, r, COL.mud),
  mushroom_grass: (p, r) => paintDirt(p, r, COL.mud),
  farmland: (p, r, v) => {
    const base = v === 2 ? hex('#3e2716') : hex('#5b3b22');
    noiseFill(p, base, 0.08, r);
    for (let x = 0; x < 8; x++) { p.set(x, 0, sh(base, 1.25)); p.set(x, 3, sh(base, 1.2)); p.set(x, 2, sh(base, 0.8)); p.set(x, 5, sh(base, 0.82)); }
  },
  stone: (p, r) => cells(p, r, 3, COL.stone, sh(COL.stone, 0.74), { thr: 0.42, hl: true }),
  cobblestone: (p, r) => cells(p, r, 5, hex('#76767c'), hex('#47474c'), { thr: 0.62, hl: true, grain: 0.1 }),
  sand: (p, r) => { noiseFill(p, COL.sand, 0.08, r); dots(p, hex('#c4aa70'), 4, r); dots(p, hex('#f0dca8'), 3, r); },
  sandstone: (p, r) => {
    const b = hex('#cdb27a');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(b, (y % 3 === 2 ? 0.84 : 1) * (1 + (r() - 0.5) * 0.06)));
    dots(p, hex('#e2cc98'), 2, r);
  },
  gravel: (p, r) => cells(p, r, 6, hex('#8a8580'), hex('#5e5854'), { thr: 0.5, hl: true, grain: 0.18 }),
  clay: (p, r) => { noiseFill(p, hex('#9ea6b6'), 0.06, r); dots(p, hex('#8a92a4'), 3, r); dots(p, hex('#b4bccb'), 2, r); },
  snow: (p, r) => { noiseFill(p, hex('#eef4f8'), 0.04, r); dots(p, hex('#cfdeea'), 4, r); },
  mud: (p, r) => { noiseFill(p, COL.mud, 0.1, r); dots(p, hex('#46362f'), 4, r); dots(p, hex('#6e5a50'), 2, r); },
  ice: (p, r) => {
    noiseFill(p, hex('#a6d6f2'), 0.04, r);
    for (let i = 0; i < 8; i++) { const a = [205, 205, 205, 205]; p.d[((i) * 8 + i) * 4 + 3] = 200; }
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.d[(y * 8 + x) * 4 + 3] = 205;
    p.set(5, 1, hex('#ffffff'), 230); p.set(6, 1, hex('#e8f8ff'), 220); p.set(4, 2, hex('#e8f8ff'), 220); p.set(2, 5, hex('#ffffff'), 220);
  },
  deepslate: (p, r) => {
    const b = hex('#4c4d57');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(b, 1 + (r() - 0.5) * 0.12));
    for (let i = 0; i < 3; i++) { const y = r() * 8 | 0, x = r() * 5 | 0; for (let k = 0; k < 3; k++) p.set(x + k, y, sh(b, 0.72)); }
  },
  cobbled_deepslate: (p, r) => cells(p, r, 5, hex('#4a4b55'), hex('#2c2c33'), { thr: 0.6, hl: true }),
  bedrock: (p, r) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const t = r(); p.set(x, y, t < 0.3 ? hex('#1a1a1c') : t < 0.75 ? hex('#3a3a3f') : hex('#5a5a62')); } },
  obsidian: (p, r) => { noiseFill(p, hex('#1e1530'), 0.12, r); dots(p, hex('#3a2a5a'), 5, r); dots(p, hex('#6a5aa0'), 2, r); },
  ash: (p, r) => { noiseFill(p, hex('#5b4a46'), 0.16, r); dots(p, hex('#3e302c'), 5, r); dots(p, hex('#7a605a'), 2, r); },
  coal_ore: (p, r) => paintOre(p, r, COL.stone, hex('#26262a'), hex('#5a5a62')),
  copper_ore: (p, r) => paintOre(p, r, COL.stone, hex('#c87a3e'), hex('#f4a868')),
  iron_ore: (p, r) => paintOre(p, r, COL.stone, hex('#d6b294'), hex('#f6dcc6')),
  gold_ore: (p, r) => paintOre(p, r, COL.stone, hex('#eec236'), hex('#fff28a')),
  diamond_ore: (p, r) => paintOre(p, r, hex('#5e5f6a'), hex('#46d8dc'), hex('#d2ffff')),
  hellstone_ore: (p, r) => paintOre(p, r, hex('#5b4a46'), hex('#e0461e'), hex('#ffc050')),
  glowstone: (p, r) => {
    noiseFill(p, hex('#b88a3a'), 0.12, r);
    for (let i = 0; i < 6; i++) { const x = r() * 7 | 0, y = r() * 7 | 0; p.set(x, y, hex('#ffe890')); p.set(x + 1, y, hex('#ffd060')); p.set(x, y + 1, hex('#f0b040')); }
  },
  cloud: (p, r) => { noiseFill(p, hex('#f4f8ff'), 0.03, r); for (let x = 0; x < 8; x++) { p.set(x, 7, hex('#d4def0')); if (r() < 0.5) p.set(x, 6, hex('#e2eaf8')); } },
  log: (p, r) => {
    const b = hex('#7a5530');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(b, (x % 3 === 0 ? 0.78 : 1) * (1 + (r() - 0.5) * 0.08)));
    dots(p, hex('#946a40'), 3, r);
  },
  planks: (p, r) => {
    const b = hex('#b4844f');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(b, (1 + (r() - 0.5) * 0.06) * (y % 4 === 0 ? 1.08 : 1)));
    for (let x = 0; x < 8; x++) { p.set(x, 3, hex('#7a5430')); p.set(x, 7, hex('#7a5430')); }
    const s1 = 1 + (r() * 6 | 0), s2 = 1 + (r() * 6 | 0);
    for (let y = 0; y < 3; y++) p.set(s1, y, hex('#86603a'));
    for (let y = 4; y < 7; y++) p.set(s2, y, hex('#86603a'));
    p.set((s1 + 3) % 8, 1, hex('#9c7044'));
  },
  glass: (p) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, hex('#cfe8f4'), 34);
    p.set(5, 1, hex('#ffffff'), 200); p.set(6, 2, hex('#ffffff'), 160); p.set(2, 4, hex('#ffffff'), 140); p.set(3, 5, hex('#ffffff'), 140);
  },
  bricks: (p, r) => {
    const br = hex('#a84c38'), mo = hex('#c8b8a6');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const row = y >> 1, off = row % 2 ? 2 : 0;
      const mortar = y % 2 === 1 && false || y === 3 || y === 7 || ((x + off) % 4 === 3 && y !== 3 && y !== 7);
      p.set(x, y, mortar ? mo : sh(br, 1 + (r() - 0.5) * 0.18));
    }
  },
  stone_bricks: (p, r) => {
    const b = hex('#7c7c84'), m = hex('#55555c');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const mortar = y === 3 || y === 7 || (y < 3 && x === 7) || (y > 3 && y < 7 && x === 3);
      p.set(x, y, mortar ? m : sh(b, (1 + (r() - 0.5) * 0.08) * (y === 0 || y === 4 ? 1.1 : 1)));
    }
  },
  wool: (p, r) => { noiseFill(p, hex('#ecebe6'), 0.04, r); for (let i = 0; i < 5; i++) { const x = r() * 7 | 0, y = r() * 7 | 0; p.set(x, y, hex('#d2d0c8')); p.set(x + 1, y + 1, hex('#d8d6ce')); } },
  iron_block: (p, r) => metalBlock(p, hex('#d6d6da')),
  gold_block: (p, r) => metalBlock(p, hex('#f2cc3a')),
  diamond_block: (p, r) => { metalBlock(p, hex('#62e8e0')); p.set(2, 2, hex('#e8ffff')); p.set(5, 4, hex('#e8ffff')); },
  // 联盟石砖:蓝灰色大块石砖,金色嵌线
  alliance_bricks: (p, r) => {
    const b = hex('#8a96b8'), m = hex('#4a5270');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const mortar = y === 3 || y === 7 || (y < 3 && x === 4) || (y > 3 && y < 7 && x === 0);
      p.set(x, y, mortar ? m : sh(b, (1 + (r() - 0.5) * 0.08) * (y === 0 || y === 4 ? 1.12 : 1)));
    }
    if (r() < 0.5) { p.set(2, 1, hex('#e8c860')); p.set(6, 5, hex('#e8c860')); }
  },
  // 部落硬木:深红褐色粗木,横向铁箍
  horde_wood: (p, r) => {
    const b = hex('#8a3a26');
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(b, (x % 4 === 0 ? 0.72 : 1) * (1 + (r() - 0.5) * 0.12)));
    for (let x = 0; x < 8; x++) p.set(x, 5, hex('#3a3434'));
    p.set(2, 5, hex('#8a8a90')); p.set(6, 5, hex('#8a8a90'));
  },
  // 背景/底层岩幕
  backdrop: (p, r) => cells(p, r, 4, hex('#2a221c'), hex('#1a1511'), { thr: 0.5, grain: 0.1 }),
};
function metalBlock(p, c) {
  p.rect(0, 0, 8, 8, c);
  for (let i = 0; i < 8; i++) { p.set(i, 0, sh(c, 1.15)); p.set(0, i, sh(c, 1.1)); p.set(i, 7, sh(c, 0.7)); p.set(7, i, sh(c, 0.75)); }
  p.set(1, 1, sh(c, 0.6)); p.set(6, 1, sh(c, 0.6)); p.set(1, 6, sh(c, 0.6)); p.set(6, 6, sh(c, 0.6));
  p.set(3, 3, sh(c, 1.18)); p.set(4, 3, sh(c, 1.1));
}

// 树干与树叶
function paintTrunk(p, r, sp) {
  if (sp === 1) { // 白桦
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(hex('#e4ded2'), 1 + (r() - 0.5) * 0.06));
    for (let i = 0; i < 3; i++) { const y = r() * 8 | 0, x = r() * 6 | 0; p.set(x, y, hex('#2e2a26')); p.set(x + 1, y, hex('#4a4440')); }
    return;
  }
  const base = [hex('#6b4a2b'), null, hex('#4e3622'), hex('#6a4e2e'), hex('#9a7a50')][sp];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let k = x === 1 || x === 5 ? 0.76 : x === 3 ? 1.12 : 1;
    if (sp === 4 && y % 3 === 0) k *= 0.82;
    p.set(x, y, sh(base, k * (1 + (r() - 0.5) * 0.1)));
  }
  if (sp === 3) dots(p, hex('#5a8a3a'), 2, r);
}
function paintCactus(p, r) {
  const b = hex('#4c9a3a');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(b, x === 2 || x === 5 ? 0.78 : x === 3 ? 1.12 : 1));
  for (let i = 0; i < 3; i++) p.set(r() * 8 | 0, r() * 8 | 0, hex('#e8e0a0'));
}
function paintLeaves(p, r, sp, season) {
  const base = LEAF_SEASON[sp][season];
  const winterBare = (sp === 0 || sp === 1) && season === 3;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(base, 0.86 + (r() - 0.5) * 0.12));
  for (let i = 0; i < 5; i++) {
    const x = r() * 7 | 0, y = r() * 7 | 0;
    p.set(x, y, sh(base, 1.22)); p.set(x + 1, y, sh(base, 1.08)); p.set(x, y + 1, sh(base, 1.04)); p.set(x + 1, y + 1, sh(base, 0.78));
  }
  if (sp === 0 && season === 2) dots(p, hex('#c8402a'), 3, r);
  if (sp === 0 && season === 0) dots(p, hex('#f8b0d0'), 2, r);
  if (sp === 2 && season === 3) for (let x = 0; x < 8; x++) if (r() < 0.6) p.set(x, r() * 3 | 0, hex('#f0f6fa'));
  if (winterBare) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (r() < 0.55) p.clear(x, y);
}

// ———————————————————————————— 边框(掩码:1 上 2 右 4 下 8 左 暴露)
function frame(src, mask, style, border, r) {
  const p = src.clone();
  const T = mask & 1, Rt = mask & 2, Bt = mask & 4, L = mask & 8;
  const organic = style === 'organic' || style === 'leaves';
  // 外角削圆
  if (T && L) p.clear(0, 0);
  if (T && Rt) p.clear(7, 0);
  if (Bt && L) p.clear(0, 7);
  if (Bt && Rt) p.clear(7, 7);
  if (style === 'leaves') {
    if (T && L) { p.clear(1, 0); p.clear(0, 1); }
    if (T && Rt) { p.clear(6, 0); p.clear(7, 1); }
    if (Bt && L) { p.clear(1, 7); p.clear(0, 6); }
    if (Bt && Rt) { p.clear(6, 7); p.clear(7, 6); }
  }
  // 自然方块边缘的少量凹凸
  if (organic) {
    const bump = style === 'leaves' ? 0.4 : 0.18;
    for (let i = 1; i < 7; i++) {
      if (T && r() < bump) p.clear(i, 0);
      if (Bt && r() < bump) p.clear(i, 7);
      if (L && r() < bump) p.clear(0, i);
      if (Rt && r() < bump) p.clear(7, i);
    }
  }
  // 描边:不透明像素若在暴露方向邻接透明 → 暗边
  const out = p.clone();
  const transparentAt = (x, y) => {
    if (y < 0) return !!T; if (y > 7) return !!Bt; if (x < 0) return !!L; if (x > 7) return !!Rt;
    return p.a(x, y) < 40;
  };
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (p.a(x, y) < 40) continue;
    const edge = transparentAt(x, y - 1) || transparentAt(x + 1, y) || transparentAt(x, y + 1) || transparentAt(x - 1, y);
    if (edge) { const c = p.get(x, y); out.set(x, y, mix(c, border, 0.72), Math.max(c[3], 220)); }
    else if (style !== 'flat' && transparentAt(x, y - 2) && y < 7) out.shade(x, y, 1.12);
  }
  return out;
}

// 草地:在暴露面覆盖一层草皮
function grassOver(src, mask, col, r, snowy) {
  const p = src.clone();
  const dark = sh(col, 0.72), light = sh(col, 1.15);
  if (mask & 1) for (let x = 0; x < 8; x++) {
    const d = 2 + (r() < 0.45 ? 1 : 0) - (snowy && r() < 0.3 ? 1 : 0);
    for (let y = 0; y < d; y++) p.set(x, y, y === 0 ? light : col);
    p.set(x, d, dark);
  }
  const side = (xs, dir) => {
    for (let y = (mask & 1) ? 2 : 0; y < 8; y++) {
      const d = 1 + (r() < 0.35 ? 1 : 0);
      for (let k = 0; k < d; k++) p.set(xs + dir * k, y, col);
      if (r() < 0.5) p.set(xs + dir * d, y, dark);
    }
  };
  if (mask & 8) side(0, 1);
  if (mask & 2) side(7, -1);
  if (mask & 4) for (let x = 0; x < 8; x++) { p.set(x, 7, col); if (r() < 0.5) p.set(x, 6, dark); }
  return p;
}

// ———————————————————————————— 精灵方块(8×8,透明底)
function spriteFrames(key, season) {
  const fr = [];
  const P = () => new Pix(8, 8);
  const R = mulberry32(hash32(key.length * 7919 + season * 31));
  switch (key) {
    case 'crafting_table': {
      const p = P();
      p.rect(0, 1, 8, 2, hex('#b4844f')); p.rect(0, 0, 8, 1, hex('#d0a06a'));
      p.rect(1, 3, 6, 4, hex('#7a5430')); p.rect(1, 7, 1, 1, hex('#5a3c20')); p.rect(6, 7, 1, 1, hex('#5a3c20'));
      p.rect(1, 3, 1, 5, hex('#5a3c20')); p.rect(6, 3, 1, 5, hex('#5a3c20'));
      p.set(2, 0, hex('#9a9aa2')); p.set(3, 0, hex('#9a9aa2')); p.set(5, 0, hex('#c0c0c8')); p.set(5, 1, hex('#6a4a2a'));
      p.rect(2, 4, 4, 1, hex('#9a6a3a')); p.set(3, 5, hex('#b0b0b8')); p.set(4, 5, hex('#b0b0b8'));
      fr.push(p); break;
    }
    case 'furnace': for (let lit = 0; lit < 2; lit++) {
      const p = P();
      cells(p, R, 4, hex('#7a7a80'), hex('#4c4c52'), { thr: 0.5 });
      for (let i = 0; i < 8; i++) { p.set(i, 0, hex('#9a9aa0')); p.set(i, 7, hex('#3e3e44')); }
      p.rect(2, 3, 4, 3, hex('#1e1e22'));
      if (lit) { p.rect(2, 4, 4, 2, hex('#f08020')); p.set(3, 4, hex('#ffd040')); p.set(4, 5, hex('#ffe070')); p.set(2, 3, hex('#c04010')); }
      p.rect(2, 2, 4, 1, hex('#5a5a60'));
      fr.push(p);
    } break;
    case 'chest': {
      const p = P();
      p.rect(0, 1, 8, 7, hex('#a8742c')); p.rect(0, 1, 8, 1, hex('#c89048'));
      p.rect(0, 3, 8, 1, hex('#5a3a18')); p.rect(0, 7, 8, 1, hex('#6a4420'));
      p.rect(0, 1, 1, 7, hex('#7a5020')); p.rect(7, 1, 1, 7, hex('#7a5020'));
      p.rect(3, 3, 2, 2, hex('#f0c840')); p.set(3, 4, hex('#a07818'));
      fr.push(p); break;
    }
    case 'torch': {
      const p = P();
      p.rect(3, 3, 2, 5, hex('#7a5430')); p.set(3, 3, hex('#9a6c40'));
      p.rect(3, 1, 2, 2, hex('#ffb030')); p.set(3, 0, hex('#ff8020')); p.set(4, 1, hex('#fff0a0')); p.set(3, 2, hex('#ffe070'));
      fr.push(p); break;
    }
    case 'lantern': {
      const p = P();
      p.set(3, 0, hex('#3a3a40')); p.set(4, 0, hex('#3a3a40'));
      p.rect(2, 1, 4, 1, hex('#4a4a52')); p.rect(2, 2, 4, 4, hex('#ffd070')); p.rect(3, 3, 2, 2, hex('#fff4c0'));
      p.set(2, 2, hex('#4a4a52')); p.set(5, 2, hex('#4a4a52')); p.set(2, 5, hex('#4a4a52')); p.set(5, 5, hex('#4a4a52'));
      p.rect(2, 6, 4, 1, hex('#3a3a40'));
      fr.push(p); break;
    }
    case 'platform': for (let f = 0; f < 4; f++) {
      const p = P();
      p.rect(0, 0, 8, 2, hex('#b4844f')); p.rect(0, 0, 8, 1, hex('#d0a06a')); p.rect(0, 2, 8, 1, hex('#6a4a2a'));
      if (f === 1 || f === 3) { p.rect(0, 2, 1, 3, hex('#6a4a2a')); }
      if (f === 2 || f === 3) { p.rect(7, 2, 1, 3, hex('#6a4a2a')); }
      if (f === 0) { p.set(3, 3, hex('#7a5430')); p.set(4, 3, hex('#7a5430')); }
      fr.push(p);
    } break;
    case 'ladder': {
      const p = P();
      p.rect(1, 0, 1, 8, hex('#8a6034')); p.rect(6, 0, 1, 8, hex('#8a6034'));
      for (const y of [1, 4, 7]) p.rect(2, y, 4, 1, hex('#a87a46'));
      fr.push(p); break;
    }
    case 'door': for (let f = 0; f < 12; f++) {
      // f = 部位(0 底 / 1 中 / 2 顶) + 3×打开 + 6×朝左
      const p = P(), part = f % 3, open = Math.floor(f / 3) % 2, left = f >= 6;
      const wood = hex('#9a6a38'), dk = hex('#5e3e1e');
      if (!open) {
        p.rect(1, 0, 6, 8, wood);
        p.rect(1, 0, 1, 8, dk); p.rect(6, 0, 1, 8, dk);
        if (part === 0) { p.rect(1, 7, 6, 1, dk); p.rect(3, 1, 2, 4, sh(wood, 0.82)); }
        if (part === 1) { p.rect(3, 0, 2, 8, sh(wood, 0.82)); p.set(left ? 2 : 5, 4, hex('#e0c040')); p.set(left ? 2 : 5, 5, hex('#a08020')); }
        if (part === 2) { p.rect(1, 0, 6, 1, dk); p.rect(2, 2, 4, 3, hex('#a8d0e8')); p.rect(4, 2, 1, 3, dk); p.rect(2, 3, 4, 1, dk); }
      } else {
        const x = left ? 6 : 0;
        p.rect(x, 0, 2, 8, wood); p.rect(x + (left ? 1 : 0), 0, 1, 8, dk);
      }
      fr.push(p);
    } break;
    case 'bed': for (let f = 0; f < 4; f++) {
      // f: bit0 床尾, bit1 朝左
      const p = P(), foot = f & 1, left = f & 2;
      const headSide = foot ? false : true;
      p.rect(0, 4, 8, 2, hex('#c03030')); p.rect(0, 4, 8, 1, hex('#e04848'));
      p.rect(0, 6, 8, 1, hex('#7a5430'));
      const outer = (left ? !foot : foot) ? 0 : 7;
      if (headSide) {
        const px = left ? 0 : 5;
        p.rect(px, 3, 3, 2, hex('#f0f0f0')); p.rect(outer, 1, 1, 7, hex('#7a5430'));
      } else { p.rect(outer, 3, 1, 5, hex('#7a5430')); }
      p.set(0, 7, hex('#5a3c20')); p.set(7, 7, hex('#5a3c20'));
      fr.push(p);
    } break;
    case 'tnt': {
      const p = P();
      p.rect(0, 0, 8, 8, hex('#d03028')); for (let x = 0; x < 8; x += 2) p.rect(x, 0, 1, 8, hex('#b02420'));
      p.rect(0, 3, 8, 2, hex('#f0ece0')); p.set(1, 3, hex('#202020')); p.set(3, 3, hex('#202020')); p.set(5, 3, hex('#202020')); p.set(2, 4, hex('#202020')); p.set(6, 4, hex('#202020'));
      p.rect(0, 0, 8, 1, hex('#e86058'));
      fr.push(p); break;
    }
    case 'gravestone': {
      const p = P();
      p.rect(2, 1, 4, 6, hex('#9a9aa2')); p.rect(3, 0, 2, 1, hex('#9a9aa2'));
      p.rect(1, 7, 6, 1, hex('#6a6a72')); p.rect(3, 2, 2, 1, hex('#5a5a62')); p.rect(3, 2, 1, 3, hex('#5a5a62')); p.set(4, 2, hex('#5a5a62'));
      p.rect(2, 1, 1, 6, hex('#b8b8c0'));
      fr.push(p); break;
    }
    case 'tall_grass': for (let f = 0; f < 3; f++) {
      const p = P(), col = season === 3 ? hex('#b0a070') : season === 2 ? hex('#c0a640') : GRASS_SEASON[season];
      const r = mulberry32(f * 77 + 3);
      for (let i = 0; i < 4 + f; i++) {
        const x = 1 + (r() * 6 | 0), h = 3 + (r() * (3 + f) | 0);
        for (let y = 0; y < h; y++) p.set(x + (y > h - 2 && r() < 0.5 ? (r() < 0.5 ? -1 : 1) : 0), 7 - y, y > h - 2 ? sh(col, 1.2) : sh(col, 0.9));
      }
      fr.push(p);
    } break;
    case 'flower': for (let f = 0; f < 3; f++) {
      const p = P(), c = [hex('#e83a3a'), hex('#f6d23a'), hex('#5a7af0')][f];
      p.rect(3, 3, 1, 5, hex('#3a8a2a')); p.set(2, 5, hex('#3a8a2a')); p.set(4, 6, hex('#3a8a2a'));
      p.set(3, 1, c); p.set(2, 2, c); p.set(4, 2, c); p.set(3, 3, f === 1 ? hex('#e08a20') : hex('#f6e070')); p.set(2, 1, sh(c, 0.8)); p.set(4, 1, sh(c, 1.1)); p.set(3, 2, sh(c, 1.15));
      fr.push(p);
    } break;
    case 'sapling': for (let sp = 0; sp < 5; sp++) {
      const p = P(), lc = LEAF_SEASON[sp][1], tc = [hex('#6b4a2b'), hex('#d8d2c4'), hex('#4e3622'), hex('#6a4e2e'), hex('#9a7a50')][sp];
      p.rect(3, 4, 1, 4, tc);
      if (sp === 2) { p.rect(2, 1, 3, 1, lc); p.rect(1, 3, 5, 1, lc); p.set(3, 0, lc); p.rect(2, 2, 3, 1, sh(lc, 0.85)); }
      else if (sp === 4) { p.set(1, 2, lc); p.set(2, 3, lc); p.set(5, 2, lc); p.set(4, 3, lc); p.set(3, 3, lc); p.set(0, 3, lc); p.set(6, 3, lc); }
      else { p.rect(2, 1, 3, 3, lc); p.set(1, 2, lc); p.set(5, 2, lc); p.set(2, 1, sh(lc, 1.2)); p.set(4, 3, sh(lc, 0.8)); }
      fr.push(p);
    } break;
    case 'wheat': for (let st = 0; st < 8; st++) {
      const p = P(), h = 1 + Math.round(st * 6 / 7), ripe = st === 7;
      const c = ripe ? hex('#d8b440') : mix(hex('#4aa83a'), hex('#a8b040'), st / 7);
      for (const x of [1, 3, 5, 6]) for (let y = 0; y < h; y++) p.set(x, 7 - y, sh(c, y === h - 1 ? 1.2 : 0.95));
      if (st >= 5) for (const x of [1, 3, 5, 6]) { p.set(x, 7 - h, ripe ? hex('#f0d060') : sh(c, 1.25)); }
      fr.push(p);
    } break;
    case 'dead_bush': {
      const p = P(), c = hex('#8a6a3a');
      p.rect(3, 3, 1, 5, c); p.set(2, 2, c); p.set(1, 1, c); p.set(4, 2, c); p.set(5, 1, c); p.set(6, 3, c); p.set(5, 4, c); p.set(1, 4, c); p.set(2, 5, c);
      fr.push(p); break;
    }
    case 'mushroom': for (let f = 0; f < 2; f++) {
      const p = P(), c = f ? hex('#d83030') : hex('#a8784a');
      p.rect(3, 5, 2, 3, hex('#e8e0d0')); p.rect(1, 3, 6, 2, c); p.rect(2, 2, 4, 1, c);
      if (f) { p.set(2, 3, hex('#ffffff')); p.set(5, 3, hex('#ffffff')); p.set(4, 2, hex('#ffffff')); } else { p.set(2, 2, sh(c, 1.2)); }
      fr.push(p);
    } break;
    case 'glow_mushroom': {
      const p = P(), c = hex('#5a8aff');
      p.rect(3, 4, 2, 4, hex('#a0c8ff')); p.rect(1, 2, 6, 2, c); p.rect(2, 1, 4, 1, c);
      p.set(2, 2, hex('#d0f0ff')); p.set(5, 1, hex('#d0f0ff')); p.set(4, 3, hex('#b0e0ff'));
      fr.push(p); break;
    }
    case 'snow_layer': {
      const p = P(); p.rect(0, 6, 8, 2, hex('#f4f8fb')); p.rect(0, 6, 8, 1, hex('#ffffff')); p.set(2, 5, hex('#f4f8fb')); p.set(5, 5, hex('#eef4f8'));
      fr.push(p); break;
    }
    case 'vine': {
      const p = P(), c = hex('#2f8a2a');
      for (const x of [1, 4, 6]) for (let y = 0; y < 8; y++) if ((x + y) % 5 !== 4) p.set(x + (y % 3 === 2 ? 1 : 0), y, y % 2 ? c : sh(c, 1.2));
      fr.push(p); break;
    }
    case 'berry_bush': for (let st = 0; st < 4; st++) {
      const p = P(), c = hex('#3c7a34');
      const h = st === 0 ? 3 : 5;
      for (let y = 8 - h; y < 8; y++) for (let x = 1; x < 7; x++) if (R() < 0.85) p.set(x, y, sh(c, 0.85 + R() * 0.3));
      if (st >= 2) for (let i = 0; i < 4; i++) p.set(1 + (R() * 6 | 0), 8 - h + (R() * h | 0), st === 3 ? hex('#e02838') : hex('#7ab040'));
      fr.push(p);
    } break;
    case 'cactus': { const p = P(); paintCactus(p, R); fr.push(p); break; }
    case 'alliance_banner': case 'horde_banner': {
      const p = P(), A = key === 'alliance_banner';
      const c = A ? hex('#2a5ad8') : hex('#c02a20'), e = A ? hex('#f2c84a') : hex('#1a1a1a'), pole = A ? hex('#d8c070') : hex('#5a3a22');
      p.rect(1, 0, 1, 8, pole); p.set(1, 0, A ? hex('#fff0a0') : hex('#c8c8c8'));
      p.rect(2, 1, 5, 5, c); p.set(2, 6, c); p.set(4, 6, c); p.set(6, 6, c);
      p.rect(2, 1, 5, 1, sh(c, 1.25));
      if (A) { p.set(4, 2, e); p.set(3, 3, e); p.set(4, 3, e); p.set(5, 3, e); p.set(4, 4, e); }
      else { p.set(3, 2, e); p.set(5, 2, e); p.set(4, 3, e); p.set(3, 4, e); p.set(5, 4, e); p.set(4, 4, e); }
      fr.push(p); break;
    }
    case 'brazier': {
      const p = P();
      p.rect(1, 4, 6, 2, hex('#4a4a52')); p.rect(2, 6, 4, 1, hex('#3a3a40')); p.set(2, 7, hex('#3a3a40')); p.set(5, 7, hex('#3a3a40'));
      p.rect(2, 2, 4, 2, hex('#ff9030')); p.set(3, 1, hex('#ffd060')); p.set(4, 1, hex('#ffb040')); p.set(4, 0, hex('#fff0a0')); p.set(3, 3, hex('#fff0a0'));
      p.rect(1, 4, 6, 1, hex('#6a6a74'));
      fr.push(p); break;
    }
    default: { const p = P(); p.rect(0, 0, 8, 8, hex('#ff00ff')); fr.push(p); }
  }
  return fr;
}

// ———————————————————————————— 图集
export const atlas = { canvas: null, base: new Int32Array(BLOCKS.length), seasonal: new Uint8Array(BLOCKS.length), frames: new Uint8Array(BLOCKS.length) };
export const wallAtlas = { canvas: null };
export const VARIANTS = 3;
let slots = [];
function addSlot(p) { slots.push(p); return slots.length - 1; }

function styleOf(b) {
  if (b.render === 'leaves') return 'leaves';
  if (b.render === 'trunk') return 'flat';
  if (['planks', 'bricks', 'stone_bricks', 'glass', 'iron_block', 'gold_block', 'diamond_block', 'log', 'wool', 'alliance_bricks', 'horde_wood'].includes(b.key)) return 'clean';
  return 'organic';
}

export function buildAtlas() {
  slots = [];
  for (const b of BLOCKS) {
    if (b.render === 'none') { atlas.base[b.id] = -1; continue; }
    const seasons = b.seasonal ? 4 : 1;
    atlas.seasonal[b.id] = seasons;
    atlas.base[b.id] = slots.length;
    if (b.render === 'sprite') {
      let n = 0;
      for (let s = 0; s < seasons; s++) { const fr = spriteFrames(b.key, s); n = fr.length; fr.forEach(addSlot); }
      atlas.frames[b.id] = n;
      continue;
    }
    atlas.frames[b.id] = VARIANTS * 16;
    for (let s = 0; s < seasons; s++) for (let v = 0; v < VARIANTS; v++) {
      const r = mulberry32(hash32(b.id * 131 + v * 17 + 5));
      const base = new Pix(8, 8);
      if (b.render === 'trunk') { if (b.key === 'cactus') paintCactus(base, r); else paintTrunk(base, r, b.species); }
      else if (b.render === 'leaves') paintLeaves(base, r, b.species, s);
      else (PAINT[b.key] || PAINT.stone)(base, r, v);
      const map = hex(b.map || '#808080');
      const border = b.render === 'leaves' ? sh(LEAF_SEASON[b.species][s], 0.5) : sh(map, 0.42);
      for (let m = 0; m < 16; m++) {
        const rr = mulberry32(hash32(b.id * 7 + v * 3 + m * 101 + s));
        let src = base;
        if (b.key === 'grass') src = grassOver(base, m, GRASS_SEASON[s], rr, s === 3);
        else if (b.key === 'snow_grass') src = grassOver(base, m, hex('#eef4f8'), rr, true);
        else if (b.key === 'jungle_grass') src = grassOver(base, m, hex('#4fc23a'), rr);
        else if (b.key === 'mushroom_grass') { src = grassOver(base, m, hex('#4a5bd0'), rr); if (m & 1) { src.set(2, 0, hex('#a0d0ff')); src.set(6, 1, hex('#a0d0ff')); } }
        let bc = border;
        if (b.key === 'grass') bc = sh(GRASS_SEASON[s], 0.5);
        if (b.key === 'jungle_grass') bc = hex('#246a1c');
        if (b.key === 'mushroom_grass') bc = hex('#22285a');
        addSlot(frame(src, m, styleOf(b), bc, rr));
      }
    }
  }
  // 背景岩幕(无墙地下)
  atlas.backdrop = slots.length;
  for (let v = 0; v < VARIANTS; v++) { const p = new Pix(8, 8); PAINT.backdrop(p, mulberry32(900 + v)); addSlot(p); }
  // 挖掘裂纹 8 阶段
  atlas.crack = slots.length;
  for (let st = 0; st < 8; st++) addSlot(crackPix(st));
  atlas.canvas = packSlots(slots);
  slots = [];
  buildWalls();
}

function packSlots(list) {
  const rows = Math.ceil(list.length / 16);
  const c = document.createElement('canvas');
  c.width = 256; c.height = rows * 16;
  const g = c.getContext('2d'), img = g.createImageData(c.width, c.height);
  list.forEach((p, i) => blitScaled(img.data, 256, (i & 15) * 16, (i >> 4) * 16, p, 2));
  g.putImageData(img, 0, 0);
  return c;
}

function crackPix(stage) {
  const p = new Pix(8, 8), r = mulberry32(4242);
  const n = 2 + stage * 3;
  let x = 4, y = 4;
  for (let i = 0; i < n; i++) {
    p.set(x, y, [20, 14, 10], 200);
    const d = r() * 4 | 0;
    x = Math.max(0, Math.min(7, x + [1, -1, 0, 0][d] * (r() < 0.8 ? 1 : 0)));
    y = Math.max(0, Math.min(7, y + [0, 0, 1, -1][d]));
    if (i % 4 === 3) { x = 4 + (r() * 3 | 0) - 1; y = 4 + (r() * 3 | 0) - 1; }
  }
  return p;
}

const WALL_PAINT = {
  dirt: (p, r) => paintDirt(p, r, hex('#4e3826')),
  stone: (p, r) => cells(p, r, 3, hex('#3e3e44'), hex('#2c2c31'), { thr: 0.45 }),
  deepslate: (p, r) => cells(p, r, 3, hex('#2a2a32'), hex('#1c1c22'), { thr: 0.45 }),
  sandstone: (p, r) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, sh(hex('#7a6a48'), y % 3 === 2 ? 0.8 : 1 + (r() - 0.5) * 0.06)); },
  mud: (p, r) => paintDirt(p, r, hex('#382c27')),
  ash: (p, r) => { noiseFill(p, hex('#3a2a26'), 0.15, r); },
  planks: (p, r) => { PAINT.planks(p, r); dim(p, 0.55); },
  brick: (p, r) => { PAINT.bricks(p, r); dim(p, 0.52); },
  stone_brick: (p, r) => { PAINT.stone_bricks(p, r); dim(p, 0.55); },
  glass: (p) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) p.set(x, y, hex('#a8c8d8'), (x === 0 || y === 0) ? 110 : 40); p.set(5, 2, hex('#ffffff'), 120); },
  cobble: (p, r) => { PAINT.cobblestone(p, r); dim(p, 0.5); },
};
function dim(p, k) { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.shade(x, y, k); }

function buildWalls() {
  const list = [];
  wallAtlas.base = new Int32Array(WALLS.length);
  for (const w of WALLS) {
    if (!w.id) { wallAtlas.base[0] = -1; continue; }
    wallAtlas.base[w.id] = list.length;
    for (let v = 0; v < 2; v++) {
      const base = new Pix(8, 8);
      (WALL_PAINT[w.key] || WALL_PAINT.stone)(base, mulberry32(w.id * 97 + v));
      for (let m = 0; m < 16; m++) {
        const p = base.clone();
        const bc = sh(hex(w.map), 0.55);
        if (!w.transparent) {
          if (m & 1) for (let x = 0; x < 8; x++) p.set(x, 0, mix(p.get(x, 0), bc, 0.6));
          if (m & 4) for (let x = 0; x < 8; x++) p.set(x, 7, mix(p.get(x, 7), bc, 0.6));
          if (m & 8) for (let y = 0; y < 8; y++) p.set(0, y, mix(p.get(0, y), bc, 0.6));
          if (m & 2) for (let y = 0; y < 8; y++) p.set(7, y, mix(p.get(7, y), bc, 0.6));
        }
        list.push(p);
      }
    }
  }
  wallAtlas.canvas = packSlots(list);
}

// 方块帧槽位(渲染时调用)
export function slotOf(id, mask, variant, season) {
  const s = atlas.seasonal[id] > 1 ? season : 0;
  return atlas.base[id] + (s * VARIANTS + variant) * 16 + mask;
}
export function spriteSlot(id, frame, season) {
  const s = atlas.seasonal[id] > 1 ? season : 0;
  return atlas.base[id] + s * atlas.frames[id] + frame;
}
export function wallSlot(w, mask, variant) { return wallAtlas.base[w] + variant * 16 + mask; }

// ———————————————————————————— 物品图标(16×16 美术像素)
const ICON_TPL = {
  spear: [
    '.............oo.',
    '............oLLo',
    '...........oLmMo',
    '..........oLmMo.',
    '.........ohoMo..',
    '........ohho....',
    '.......ohho.....',
    '......ohho......',
    '.....ohho.......',
    '....ohho........',
    '...ohho.........',
    '..ohho..........',
    '.ohho...........',
    '.oo.............',
    '................',
    '................'],
  staff: [
    '...........ooo..',
    '..........oggLo.',
    '..........ogggo.',
    '.........ohoMo..',
    '........ohho....',
    '.......ohho.....',
    '.......ohho.....',
    '......ohho......',
    '.....ohho.......',
    '.....ohho.......',
    '....ohho........',
    '...ohho.........',
    '...ohho.........',
    '..ohho..........',
    '..ooo...........',
    '................'],
  pickaxe: [
    '................',
    '.....oooooo.....',
    '...ooLmmmmMMoo..',
    '..oLmmooooommMo.',
    '..oMo..ohho.oMo.',
    '..oo...ohho..oo.',
    '.......ohho.....',
    '......ohho......',
    '......ohho......',
    '.....ohho.......',
    '.....ohho.......',
    '....ohho........',
    '....ohho........',
    '...ohho.........',
    '...ooo..........',
    '................'],
  axe: [
    '................',
    '........oooo....',
    '.......oLmmMo...',
    '......ohoLmmMo..',
    '.....ohhommmMo..',
    '.....ohhoMmMMo..',
    '....ohho.oMMo...',
    '....ohho..oo....',
    '...ohho.........',
    '...ohho.........',
    '..ohho..........',
    '..ohho..........',
    '.ohho...........',
    '.ooo............',
    '................',
    '................'],
  shovel: [
    '................',
    '..........ooo...',
    '.........oLmMo..',
    '........oLmmMo..',
    '........ommMMo..',
    '.......ohoMMo...',
    '......ohho.o....',
    '.....ohho.......',
    '....ohho........',
    '...ohho.........',
    '..ohho..........',
    '.ohho...........',
    '.ooo............',
    '................',
    '................',
    '................'],
  sword: [
    '..............oo',
    '.............oLo',
    '............oLmo',
    '...........oLmo.',
    '..........oLmo..',
    '.........oLmo...',
    '........oLmo....',
    '...oo..oLmo.....',
    '...oMooLmo......',
    '....oMMmo.......',
    '.....oMMo.......',
    '....ohoMMo......',
    '...ohho.oMo.....',
    '..ohho...oo.....',
    '..ooo...........',
    '................'],
  hoe: [
    '................',
    '.....oooooo.....',
    '....oLmmmmMo....',
    '....oMMooohho...',
    '.....oo..ohho...',
    '........ohho....',
    '........ohho....',
    '.......ohho.....',
    '.......ohho.....',
    '......ohho......',
    '......ohho......',
    '.....ohho.......',
    '.....ohho.......',
    '....ooo.........',
    '................',
    '................'],
  hammer: [
    '................',
    '...ooooooo......',
    '..oLmmmmmMo.....',
    '..oLmmmmmMo.....',
    '..oMMMhMMMo.....',
    '...oooohho......',
    '.......ohho.....',
    '.......ohho.....',
    '......ohho......',
    '......ohho......',
    '.....ohho.......',
    '.....ohho.......',
    '....ohho........',
    '....ooo.........',
    '................',
    '................'],
};
const ARMOR_TPL = [
  ['................', '................', '....oooooooo....', '...oLmmmmmmMo...', '..oLmmmmmmmmMo..', '..oLmmmmmmmmMo..', '..oMmooooooMMo..', '..oMo......oMo..', '..oMo......oMo..', '..ooo......ooo..', '................', '................', '................', '................', '................', '................'],
  ['................', '..oooo....oooo..', '.oLmmMo..oLmmMo.', '.oLmmMooooLmmMo.', '.oLmmmmmmmmmmMo.', '..ooLmmmmmmMoo..', '....oLmmmmMo....', '....oLmmmmMo....', '....oLmmmmMo....', '....oLmmmmMo....', '....oMMMMMMo....', '.....oooooo.....', '................', '................', '................', '................'],
  ['................', '................', '...oooooooooo...', '...oLmmmmmmMo...', '...oLmmMMmmMo...', '...oLmMooMmMo...', '...oLmMo.oLmMo..', '...oLMo..oLmMo..', '...oLMo..oLMMo..', '...oLMo...oLMo..', '...oMMo...oMMo..', '...oooo...oooo..', '................', '................', '................', '................'],
  ['................', '................', '................', '................', '................', '...oooo..oooo...', '...oLMo..oLMo...', '...oLMo..oLMo...', '..oLmMo..oLmMo..', '.oLmmMo..oLmmMo.', '.oMMMMo..oMMMMo.', '.oooooo..oooooo.', '................', '................', '................', '................'],
];

function iconMisc(key) {
  const T = (rows, pal) => tpl(rows, pal);
  const o = hex('#2a1e14');
  switch (key) {
    case 'stick': return T(['................', '................', '............oo..', '...........oho..', '..........oho...', '.........oho....', '........oho.....', '.......oho......', '......oho.......', '.....oho........', '....oho.........', '...oho..........', '...oo...........', '................', '................', '................'], { o, h: hex('#9a6c3c') });
    case 'coal': case 'charcoal': return T(['................', '................', '.....oooo.......', '....oLmmmoo.....', '...oLmmmmmmo....', '...oLmmMmmmMo...', '..oLmmmmmMmMo...', '..oMmmmmmmmMo...', '..oMMmmmMmMMo...', '...oMMMMMMMo....', '....ooooooo.....', '................', '................', '................', '................', '................'], key === 'coal' ? { o: hex('#0e0e10'), L: hex('#5a5a62'), m: hex('#2a2a2e'), M: hex('#1a1a1c') } : { o: hex('#1a1008'), L: hex('#6a4a30'), m: hex('#3a2818'), M: hex('#24180e') });
    case 'raw_copper': case 'raw_iron': case 'raw_gold': case 'raw_hellstone': {
      const c = { raw_copper: hex('#c8743a'), raw_iron: hex('#d0aa8a'), raw_gold: hex('#eec236'), raw_hellstone: hex('#e04a20') }[key];
      return T(['................', '................', '......ooo.......', '....ooLmmoo.....', '...oLmmLmmmo....', '...oLmmmmMmo....', '..oLmmMmmmmMo...', '..oMmmmmmLmMo...', '...oMmmmmmMMo...', '...oMMMMMMMo....', '....oooooooo....', '................', '................', '................', '................', '................'], { o: sh(c, 0.35), L: sh(c, 1.3), m: c, M: sh(c, 0.72) });
    }
    case 'copper_ingot': case 'iron_ingot': case 'gold_ingot': case 'hellstone_ingot': {
      const c = { copper_ingot: hex('#d8803c'), iron_ingot: hex('#dcdce0'), gold_ingot: hex('#f6d24a'), hellstone_ingot: hex('#ff6a2a') }[key];
      return T(['................', '................', '................', '................', '.....oooooooo...', '....oLLLLLLLMo..', '...oLmmmmmmmMMo.', '..oLmmmmmmmMMMo.', '..oMMMMMMMMMMo..', '..ooooooooooo...', '................', '................', '................', '................', '................', '................'], { o: sh(c, 0.35), L: sh(c, 1.25), m: c, M: sh(c, 0.7) });
    }
    case 'diamond': return T(['................', '................', '.....oooooo.....', '....oLLmmmMo....', '...oLLmmmmmMo...', '..oLmmmmmmmmMo..', '..oooooooooooo..', '...oMmmmmmmMo...', '....oMmmmmMo....', '.....oMmmMo.....', '......oMMo......', '.......oo.......', '................', '................', '................', '................'], { o: hex('#1a5a5a'), L: hex('#e0ffff'), m: hex('#5ae6e0'), M: hex('#2aa0a0') });
    case 'flint': return T(['................', '................', '......ooo.......', '.....oLmmo......', '....oLmmmMo.....', '....oLmmmmMo....', '...oLmmmmmMo....', '...oMmmmmMMo....', '...oMMmmMMo.....', '....oMMMMo......', '.....oooo.......', '................', '................', '................', '................', '................'], { o: hex('#101014'), L: hex('#6a6a74'), m: hex('#3a3a42'), M: hex('#24242a') });
    case 'string': return T(['................', '................', '...........oo...', '..........oLo...', '.........oLo....', '........oLo.....', '.......oLo......', '......oLo.......', '.....oLo........', '....oLo.........', '...oLo..........', '...oo...........', '................', '................', '................', '................'], { o: hex('#8a8a8a'), L: hex('#f4f4f4') });
    case 'feather': return T(['................', '...........oo...', '..........oLLo..', '.........oLmLo..', '........oLmmLo..', '.......oLmmLo...', '......oLmmLo....', '.....oLmmLo.....', '....oLmmLo......', '....oLmLo.......', '...ohoo.........', '..oho...........', '..oo............', '................', '................', '................'], { o: hex('#8a8a90'), L: hex('#ffffff'), m: hex('#dadae2'), h: hex('#a0a0a8') });
    case 'leather': return T(['................', '................', '...oooooooooo...', '..oLmmmmmmmmMo..', '..oLmmmmmmmmMo..', '...oLmmmmmmMo...', '...oLmmmmmmMo...', '..oLmmmmmmmmMo..', '..oMmmmmmmmmMo..', '...oooooooooo...', '................', '................', '................', '................', '................', '................'], { o: hex('#4a2a14'), L: hex('#c08050'), m: hex('#9a6236'), M: hex('#744424') });
    case 'bone': return T(['................', '................', '...........oo...', '..........oLLo..', '.........oLLLo..', '........oLLMo...', '.......oLLo.....', '......oLLo......', '.....oLLo.......', '...oLLMo........', '..oLLLo.........', '..oLLo..........', '...oo...........', '................', '................', '................'], { o: hex('#7a7a6a'), L: hex('#f4f0e0'), M: hex('#c8c4b0') });
    case 'gunpowder': return T(['................', '................', '................', '.......oo.......', '.....ooLMoo.....', '....oLmmmmMo....', '...oLmmMmmmMo...', '..oLmmmmmMmmMo..', '..oMmMmmmmmMMo..', '...oooooooooo...', '................', '................', '................', '................', '................', '................'], { o: hex('#202020'), L: hex('#8a8a8a'), m: hex('#5a5a5a'), M: hex('#3a3a3a') });
    case 'wheat_item': return T(['................', '..........o.o...', '.........oLoLo..', '........oLmLmo..', '.......oLmLmo...', '......oLmLmo....', '.....oLmLmo.....', '....ohmLmo......', '...ohhoo........', '..ohho..........', '.ohho...........', '.oo.............', '................', '................', '................', '................'], { o: hex('#6a5418'), L: hex('#fff0a0'), m: hex('#e0c050'), h: hex('#c0a040') });
    case 'seeds': return T(['................', '................', '................', '................', '.....o...o......', '....oLo.oLo..o..', '....oMo.oMo.oLo.', '.....o...o..oMo.', '...o...o.....o..', '..oLo.oLo.......', '..oMo.oMo.......', '...o...o........', '................', '................', '................', '................'], { o: hex('#2a4a1a'), L: hex('#9ad860'), M: hex('#5a9a3a') });
    case 'gel': return T(['................', '................', '................', '......oooo......', '....ooLLmmoo....', '...oLLmmmmmMo...', '..oLmmmmmmmmMo..', '..oLmmmmmmmmMo..', '..oMmmmmmmmMMo..', '...oMMMMMMMMo...', '....oooooooo....', '................', '................', '................', '................', '................'], { o: hex('#1a3a8a'), L: hex('#c8e0ff'), m: hex('#5a90f0'), M: hex('#3a60c0') });
    case 'lens': return T(['................', '................', '.....oooooo.....', '....oLLmmmmo....', '...oLmmmmmmMo...', '...oLmmooommMo..', '..oLmmoKKomMo...', '..oLmmoKKomMo...', '..oMmmmoommMo...', '...oMmmmmmMMo...', '....oMMMMMMo....', '.....oooooo.....', '................', '................', '................', '................'], { o: hex('#5a1a1a'), L: hex('#ffffff'), m: hex('#e8e0e0'), M: hex('#c0a0a0'), K: hex('#202040') });
    case 'clay_ball': return T(['................', '................', '................', '.....oooo.......', '....oLLmmo......', '...oLmmmmMo.....', '...oLmmmmMo.....', '...oMmmmMMo.....', '....oMMMMo......', '.....oooo.......', '................', '................', '................', '................', '................', '................'], { o: hex('#4a5060'), L: hex('#c8d0e0'), m: hex('#9ea6b6'), M: hex('#7a8294') });
    case 'brick': return T(['................', '................', '................', '................', '....oooooooo....', '...oLLLLLLLMo...', '..oLmmmmmmmMMo..', '..oMMMMMMMMMo...', '..oooooooooo....', '................', '................', '................', '................', '................', '................', '................'], { o: hex('#3a1a10'), L: hex('#d07058'), m: hex('#a84c38'), M: hex('#7a3020') });
    case 'bone_meal': return T(['................', '................', '................', '................', '......oooo......', '....ooLLmmoo....', '...oLLmmmmmMo...', '..oLmmmLmmmmMo..', '..oMmmmmmmmMMo..', '...oooooooooo...', '................', '................', '................', '................', '................', '................'], { o: hex('#8a8a7a'), L: hex('#ffffff'), m: hex('#eceadc'), M: hex('#c8c6b8') });
    case 'egg': return T(['................', '................', '.......oo.......', '......oLmo......', '.....oLmmmo.....', '....oLmmmmMo....', '....oLmmmmMo....', '....oLmmmmMo....', '....oMmmmMMo....', '.....oMMMMo.....', '......oooo......', '................', '................', '................', '................', '................'], { o: hex('#8a7a5a'), L: hex('#fffaf0'), m: hex('#f0e2c4'), M: hex('#d0c0a0') });
    case 'apple': case 'golden_apple': {
      const c = key === 'apple' ? hex('#e03030') : hex('#f6d24a');
      return T(['................', '.......o........', '.......ohoo.....', '.....oohoggo....', '....oLmmhmmmo...', '...oLLmmmmmmMo..', '...oLmmmmmmmMo..', '...oLmmmmmmmMo..', '...oMmmmmmmMMo..', '....oMmmmmMMo...', '.....oMoooMo....', '......o...o.....', '................', '................', '................', '................'], { o: sh(c, 0.35), L: sh(c, 1.4), m: c, M: sh(c, 0.7), h: hex('#6a4a2a'), g: hex('#4aa83a') });
    }
    case 'bread': return T(['................', '................', '................', '.....oooooo.....', '...ooLLmmmmoo...', '..oLmmLmmLmmMo..', '.oLmmmmmmmmmmMo.', '.oMmmmmmmmmmmMo.', '.oMMmmmmmmmmMMo.', '..ooMMMMMMMMoo..', '....oooooooo....', '................', '................', '................', '................', '................'], { o: hex('#5a3410'), L: hex('#f0c070'), m: hex('#d09048'), M: hex('#a06a30') });
    case 'berries': return T(['................', '................', '........g.......', '.......ggg......', '......o.g.o.....', '.....oLo.oLo....', '....oLmMooLmo...', '....oMMMooMMo...', '.....ooo.oooo...', '......oLo.......', '.....oLmMo......', '.....oMMMo......', '......ooo.......', '................', '................', '................'], { o: hex('#5a0a14'), L: hex('#ff8090'), m: hex('#e02838'), M: hex('#a01828'), g: hex('#3a8a2a') });
    case 'raw_pork': case 'cooked_pork': case 'raw_beef': case 'steak': case 'raw_mutton': case 'cooked_mutton': {
      const cooked = key.startsWith('cooked') || key === 'steak';
      const c = cooked ? hex('#a0582a') : key.includes('pork') ? hex('#f0a0a0') : key.includes('beef') ? hex('#d04040') : hex('#e06060');
      return T(['................', '................', '.....oooooo.....', '...ooLLmmmmoo...', '..oLmmmmmmmmMo..', '.oLmmmFFmmmmMo..', '.oLmmmFFmmmmMo..', '.oMmmmmmmmmMMo..', '..oMMmmmmMMMo...', '...ooMMMMMoo....', '.....ooooo......', '................', '................', '................', '................', '................'], { o: sh(c, 0.35), L: sh(c, 1.25), m: c, M: sh(c, 0.75), F: cooked ? hex('#e8c080') : hex('#fff0e8') });
    }
    case 'raw_chicken': case 'cooked_chicken': {
      const c = key === 'raw_chicken' ? hex('#f4c8b0') : hex('#c87838');
      return T(['................', '................', '......oooo......', '....ooLmmmoo....', '...oLmmmmmmMo...', '...oLmmmmmmMo...', '...oMmmmmmmMo...', '....oMmmmmMo....', '.....oMMMMo.....', '......oBBo......', '......oBBo......', '.....oBooBo.....', '.....oo..oo.....', '................', '................', '................'], { o: sh(c, 0.35), L: sh(c, 1.2), m: c, M: sh(c, 0.75), B: hex('#f0ece0') });
    }
    case 'rotten_flesh': return T(['................', '................', '......oooo......', '....ooLmmMoo....', '...oLmmGmmmMo...', '...oLmGGmmmMo...', '..oLmmmmmGmMo...', '..oMmmmmmmMMo...', '...oMMmGmMMo....', '....ooMMMoo.....', '......ooo.......', '................', '................', '................', '................', '................'], { o: hex('#3a1a10'), L: hex('#c07050'), m: hex('#9a5038'), M: hex('#6a3424'), G: hex('#6a8a3a') });
    case 'bow': return T(['................', '..........ooo...', '.........ohhLo..', '........ohho.s..', '.......oho...s..', '......oho....s..', '......oho....s..', '......oho....s..', '......oho....s..', '......oho....s..', '.......oho...s..', '........ohho.s..', '.........ohhLo..', '..........ooo...', '................', '................'], { o: hex('#3a2410'), h: hex('#9a6a38'), L: hex('#c8c8c8'), s: hex('#e8e8e8') });
    case 'arrow': return T(['................', '............ooo.', '...........oLLo.', '..........oLLo..', '.........ohoo...', '........oho.....', '.......oho......', '......oho.......', '.....oho........', '..o.oho.........', '..ofoho.........', '..offo..........', '..offfo.........', '..oooo..........', '................', '................'], { o: hex('#2a2a2a'), L: hex('#b0b0b8'), h: hex('#9a6a38'), f: hex('#f0f0f0') });
    case 'bucket': case 'water_bucket': case 'lava_bucket': {
      const f = key === 'water_bucket' ? hex('#3a6ae0') : key === 'lava_bucket' ? hex('#ff7a1a') : hex('#4a4a52');
      return T(['................', '................', '...oooooooooo...', '..oLffffffffMo..', '..oLmffffffmMo..', '..oLmmmmmmmmMo..', '...oLmmmmmmMo...', '...oLmmmmmmMo...', '...oLmmmmmmMo...', '....oMmmmmMo....', '....oMMMMMMo....', '.....oooooo.....', '................', '................', '................', '................'], { o: hex('#2a2a30'), L: hex('#f0f0f4'), m: hex('#c8c8d0'), M: hex('#8a8a94'), f });
    }
    case 'flint_and_steel': return T(['................', '................', '...ooooo........', '..oLmmmMo.......', '..oMooomo.......', '..oo...oo.......', '..........ooo...', '.........oFFFo..', '........oFfffo..', '........offfFo..', '.........ofFo...', '..........oo....', '................', '................', '................', '................'], { o: hex('#202024'), L: hex('#f0f0f4'), m: hex('#b0b0b8'), M: hex('#70707a'), F: hex('#5a5a62'), f: hex('#3a3a42') });
    case 'shears': return T(['................', '................', '..........oo....', '.........oLo....', '........oLo.....', '...oo..oLo......', '..oLLooLo.......', '...ooLLo........', '....oLLoo.......', '...oRRoLLo......', '..oRo.oo.o......', '..oRo..oRRo.....', '...oo..oRoRo....', '........ooo.....', '................', '................'], { o: hex('#202024'), L: hex('#e8e8ee'), R: hex('#c03030') });
    case 'copper_watch': case 'gold_watch': {
      const c = key === 'copper_watch' ? hex('#d8803c') : hex('#f6d24a');
      return T(['................', '.......oo.......', '......oLLo......', '.....oooooo.....', '....oLmmmmMo....', '...oLwwwwwwMo...', '...omwwkwwwmo...', '...omwwkwwwmo...', '...omwwkkkwmo...', '...oMwwwwwwMo...', '....oMMMMMMo....', '.....oooooo.....', '................', '................', '................', '................'], { o: sh(c, 0.35), L: sh(c, 1.3), m: c, M: sh(c, 0.7), w: hex('#f8f6ee'), k: hex('#202020') });
    }
    case 'almanac': return T(['................', '................', '...oooooooooo...', '..oLRRRRRRRRMo..', '..oRRyyRRRRRMo..', '..oRyyyyRRRRMo..', '..oRRyyRRRRRMo..', '..oRRRRRRRRRMo..', '..oRRRRRRRRRMo..', '..oMMMMMMMMMMo..', '..owwwwwwwwwwo..', '...oooooooooo...', '................', '................', '................', '................'], { o: hex('#2a1010'), L: hex('#d06048'), R: hex('#a03828'), M: hex('#702418'), y: hex('#f6d24a'), w: hex('#f0e8d0') });
    case 'barometer': return T(['................', '.......oo.......', '......oLLo......', '......oggo......', '......oggo......', '......oggo......', '......oRgo......', '......oRgo......', '.....ooRRoo.....', '....oLRRRRMo....', '....oRRRRRRo....', '.....oRRRRo.....', '......oooo......', '................', '................', '................'], { o: hex('#3a2a14'), L: hex('#f0f0f8'), g: hex('#c8e0f0'), R: hex('#d83030'), M: hex('#902020') });
    case 'coin_copper': case 'coin_silver': case 'coin_gold': {
      const c = { coin_copper: hex('#d8823c'), coin_silver: hex('#d8dce6'), coin_gold: hex('#f6d24a') }[key];
      return T(['................', '................', '................', '.........oooo...', '........oLLmMo...', '.......oLmmmMo..', '...oooooLmmmMo..', '..oLLmMooMMMo...', '.oLmmmmMooooo...', '.oLmmmmmMo......', '.oLmmmmmMo......', '.oMmmmmMMo......', '..oMMMMMo.......', '...ooooo........', '................', '................'], { o: sh(c, 0.35), L: sh(c, 1.3), m: c, M: sh(c, 0.72) });
    }
    case 'alliance_insignia': return T(['................', '...oooooooooo...', '..oBBBBBBBBBBo..', '..oBBBBggBBBBo..', '..oBBBggggBBBo..', '..oBBBBggBBBBo..', '..oBBggggggBBo..', '..oBBBBggBBBBo..', '...oBBBggBBBo...', '....oBBggBBo....', '.....oBBBBo.....', '......oBBo......', '.......oo.......', '................', '................', '................'], { o: hex('#10183a'), B: hex('#2a5ad8'), g: hex('#f2c84a') });
    case 'horde_insignia': return T(['................', '..oo........oo..', '..oRo......oRo..', '..oRRo....oRRo..', '...oRRooooRRo...', '...oRRRRRRRRo...', '..oRRkRRRRkRRo..', '..oRRRkRRkRRRo..', '..oRRRRkkRRRRo..', '...oRRRkkRRRo...', '....oRRRRRRo....', '.....oRRRRo.....', '......oooo......', '................', '................', '................'], { o: hex('#2a0806'), R: hex('#c02a20'), k: hex('#1a1a1a') });
    case 'linen_cloth': case 'wool_cloth': {
      const c = key === 'linen_cloth' ? hex('#e6dcc4') : hex('#b89a7a');
      return T(['................', '................', '................', '...oooooooooo...', '..oLLmmmmmmmMo..', '..oLmmmmmmmmMo..', '..oLmMmmMmmmMo..', '..oLmmmmmmmmMo..', '..oLmmmMmmmmMo..', '..oMMMMMMMMMMo..', '...oooooooooo...', '................', '................', '................', '................', '................'], { o: sh(c, 0.4), L: sh(c, 1.15), m: c, M: sh(c, 0.78) });
    }
    case 'darnassus_bow': return T(['................', '..........ooo...', '.........ohhLo..', '........ohho.s..', '.......oho...s..', '......oho....s..', '......ogo....s..', '......oho....s..', '......ogo....s..', '......oho....s..', '.......oho...s..', '........ohho.s..', '.........ohhLo..', '..........ooo...', '................', '................'], { o: hex('#1a1a3a'), h: hex('#c8c8f0'), L: hex('#ffffff'), s: hex('#e8f0ff'), g: hex('#a070ff') });
    case 'alliance_tabard': case 'horde_tabard': {
      const A = key === 'alliance_tabard', c = A ? hex('#2a5ad8') : hex('#c02a20'), e = A ? hex('#f2c84a') : hex('#1a1a1a');
      return T(['................', '..oooo....oooo..', '.oLmmMo..oLmmMo.', '.oLmmMooooLmmMo.', '.oLmmmmmmmmmmMo.', '..ooLmmmEmmMoo..', '....oLmEEEmMo...', '....oLmmEmmMo...', '....oLmmmmmMo...', '....oLmmmmmMo...', '....oMMMMMMMo...', '.....ooooooo....', '................', '................', '................', '................'], { o: sh(c, 0.3), L: sh(c, 1.25), m: c, M: sh(c, 0.7), E: e });
    }
    case 'mining_helmet': return T(['................', '................', '.......oo.......', '......oYYo......', '....oooYYooo....', '...oLmmooomMo...', '..oLmmmmmmmmMo..', '..oLmmmmmmmmMo..', '..oMmooooooMMo..', '..oMo......oMo..', '..ooo......ooo..', '................', '................', '................', '................', '................'], { o: hex('#3a3010'), L: hex('#f0e070'), m: hex('#d0b030'), M: hex('#907010'), Y: hex('#fff8c0') });
    default: return null;
  }
}

const iconCache = new Map();
// 返回图标画布(32×32 像素)
export function iconCanvas(key) {
  if (iconCache.has(key)) return iconCache.get(key);
  const it = ITEMS[key];
  let c;
  const ic = it ? it.icon : 'item:' + key;
  const [kind, a, b] = ic.split(':');
  if (kind === 'block' || kind === 'wall') {
    c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    let src, sx, sy;
    if (kind === 'block') {
      const id = B[a], bd = BLOCKS[id];
      const slot = bd.render === 'sprite' ? spriteSlot(id, id === B.sapling ? +b : 0, 1) : slotOf(id, 15, 0, 1);
      src = atlas.canvas; sx = (slot & 15) * 16; sy = (slot >> 4) * 16;
    } else {
      const slot = wallSlot(WALLS.findIndex(w => w.key === a), 15, 0);
      src = wallAtlas.canvas; sx = (slot & 15) * 16; sy = (slot >> 4) * 16;
    }
    g.drawImage(src, sx, sy, 16, 16, 4, 4, 24, 24);
    if (kind === 'wall') { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(4, 4, 24, 3); }
  } else {
    let p = null;
    if (kind === 'tool') {
      const tier = TIERS.find(t => t.key === b);
      const c0 = hex(tier ? tier.color : WEAPON_COL[b] || '#c0c0c8');
      const handle = b === 'orgrimmar' ? hex('#5a2a1a') : b === 'stormwind' ? hex('#3a4a8a') : hex('#9a6a38');
      if (a === 'axe' || a === 'hammer' || a === 'hoe' || a === 'waraxe') p = toolPix(a === 'waraxe' ? 'axe' : a, c0, a === 'waraxe');
      else p = tpl(ICON_TPL[a], { o: sh(c0, 0.3), L: sh(c0, 1.25), m: c0, M: sh(c0, 0.7), h: handle, g: hex(b === 'stormwind' ? '#f2c84a' : b === 'totem' ? '#e05030' : '#a070ff') });
    } else if (kind === 'armor') {
      const t = ARMOR_TIERS.find(t => t.key === b), c0 = hex(t.color);
      p = tpl(ARMOR_TPL[+a], { o: sh(c0, 0.32), L: sh(c0, 1.25), m: c0, M: sh(c0, 0.7) });
    } else p = iconMisc(key);
    if (!p) { p = new Pix(16, 16); p.rect(3, 3, 10, 10, hex('#ff00ff')); }
    c = p.canvas(2);
  }
  iconCache.set(key, c);
  return c;
}
const WEAPON_COL = { stormwind: '#c8d4ee', orgrimmar: '#8a8a92', darkspear: '#7ac8a8', apprentice: '#c8a060', arcane: '#b080ff', totem: '#c88a50' };
// 参数化工具图标:手柄沿左下→右上对角线,工具头垂直于手柄
function toolPix(type, c0, big = false) {
  const p = new Pix(16, 16);
  const cx = 11.2, cy = 4.8, R2 = Math.SQRT1_2;
  const kind = new Int8Array(256); // 0 空 1 柄 2 头 3 刃/高光 4 暗面
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const u = (dx + dy) * R2;      // 垂直于手柄(正向为右下)
    const v = (dx - dy) * R2;      // 沿手柄(正向为右上)
    let k = 0;
    if (Math.abs(u) <= 0.78 && v >= -13 && v <= 1.2) k = 1;
    if (type === 'hammer') {
      if (Math.abs(u) <= 4.4 && v >= -1.6 && v <= 1.9) k = v > 1.1 ? 3 : v < -0.9 ? 4 : 2;
    } else if (type === 'axe') {
      const uu = big ? Math.abs(u) : -u;
      if (uu >= -0.4 && uu <= 5.4 && Math.abs(v - 0.2) <= 1.3 + Math.max(0, uu) * 0.42) k = uu > 4.2 ? 3 : v < -1.2 ? 4 : 2;
    } else if (type === 'hoe') {
      if (u <= 0.4 && u >= -4.6 && v >= -0.2 && v <= 1.5) k = u < -3.6 ? 3 : 2;
    }
    kind[y * 16 + x] = k;
  }
  const col = { 1: hex('#9a6a38'), 2: c0, 3: sh(c0, 1.3), 4: sh(c0, 0.72) };
  for (let i = 0; i < 256; i++) if (kind[i]) p.set(i & 15, i >> 4, col[kind[i]]);
  // 外轮廓
  const out = p.clone();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (kind[y * 16 + x]) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => (x + a >= 0 && x + a < 16 && y + b >= 0 && y + b < 16 ? kind[(y + b) * 16 + x + a] : 0));
    if (nb.some(k => k)) out.set(x, y, nb.some(k => k > 1) ? sh(c0, 0.3) : hex('#3a2410'));
  }
  // 手柄纹理
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (kind[y * 16 + x] === 1 && (x + y) % 3 === 0) out.set(x, y, hex('#7a5028'));
  return out;
}

const urlCache = new Map();
export function iconURL(key) {
  if (!urlCache.has(key)) urlCache.set(key, iconCanvas(key).toDataURL());
  return urlCache.get(key);
}

// ———————————————————————————— HUD 小图标(心、鸡腿、护甲、气泡)
export function hudIcon(kind, state) {
  const k = kind + state;
  if (urlCache.has(k)) return urlCache.get(k);
  let rows, pal;
  const heart = ['.oo.oo..', 'oLmoLmo.', 'oLmmmmo.', 'ommmmMo.', '.ommMo..', '..oMo...', '...o....', '........'];
  if (kind === 'heart') {
    rows = heart;
    pal = state === 2 ? { o: hex('#3a0808'), L: hex('#ff9090'), m: hex('#e02020'), M: hex('#a01010') }
      : state === 1 ? { o: hex('#3a0808'), L: hex('#ff9090'), m: hex('#e02020'), M: hex('#a01010') } : { o: hex('#200808'), L: hex('#4a2a2a'), m: hex('#3a1a1a'), M: hex('#2a1010') };
  } else if (kind === 'food') {
    rows = ['....oo..', '...oLmo.', '..oLmmo.', '.oLmmMo.', '.ommMo..', 'obo.o...', 'oo......', '........'];
    pal = state ? { o: hex('#3a1a08'), L: hex('#f0a060'), m: hex('#c06a30'), M: hex('#8a4418'), b: hex('#f0ece0') } : { o: hex('#201008'), L: hex('#4a3020'), m: hex('#3a2418'), M: hex('#2a1a10'), b: hex('#5a5048') };
  } else if (kind === 'armor') {
    rows = ['oo..oo..', 'oLooMo..', 'oLmmMo..', '.oLmMo..', '.oLmMo..', '.oMMMo..', '.ooooo..', '........'];
    pal = state ? { o: hex('#2a2a30'), L: hex('#ffffff'), m: hex('#c8c8d0'), M: hex('#8a8a94') } : { o: hex('#1a1a1e'), L: hex('#3a3a40'), m: hex('#2a2a30'), M: hex('#222228') };
  } else {
    rows = ['..oo....', '.oLmo...', 'oLmmmo..', 'ommmMo..', '.oMMo...', '..oo....', '........', '........'];
    pal = { o: hex('#1a3a8a'), L: hex('#ffffff'), m: hex('#7ab0ff'), M: hex('#3a70d0') };
  }
  let p = tpl(rows, pal);
  if (kind === 'heart' && state === 1) for (let y = 0; y < 8; y++) for (let x = 4; x < 8; x++) if (p.a(x, y)) p.set(x, y, hex(y === 0 || x === 6 || y >= 5 ? '#200808' : '#3a1a1a'));
  if (kind === 'food' && state === 1) for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++) if (p.a(x, y)) p.set(x, y, hex('#3a2418'));
  const url = p.canvas(2).toDataURL();
  urlCache.set(k, url);
  return url;
}

// ———————————————————————————— 角色与生物精灵
// 其它生物:返回帧数组(画布)
const mobCache = new Map();
export function mobFrames(kind) {
  if (mobCache.has(kind)) return mobCache.get(kind);
  const fr = [];
  const P = (w, h) => new Pix(w, h);
  // 德鲁伊变形:'bear:#色' / 'cat:#色'
  if (kind.startsWith('bear:') || kind.startsWith('cat:')) {
    const bear = kind.startsWith('bear'), c = hex(kind.split(':')[1]), d = sh(c, 0.7), l = sh(c, 1.2);
    for (let f = 0; f < 4; f++) {
      const sw = [0, 1, 0, -1][f];
      if (bear) {
        const p = P(18, 13);
        p.rect(2, 3, 11, 6, c); p.rect(3, 2, 9, 1, c); p.rect(2, 3, 11, 1, l);
        p.rect(12, 2, 5, 5, c); p.set(13, 1, d); p.set(15, 1, d); p.rect(16, 4, 2, 2, l); p.set(17, 4, hex('#202020')); p.set(14, 3, hex('#101010'));
        p.rect(3 + sw, 9, 2, 4, d); p.rect(6 - sw, 9, 2, 4, d); p.rect(9 + sw, 9, 2, 4, d); p.rect(11 - sw, 9, 2, 4, d);
        fr.push(p.canvas(2));
      } else {
        const p = P(18, 9);
        p.rect(3, 3, 10, 3, c); p.rect(3, 3, 10, 1, l); p.rect(12, 1, 4, 3, c); p.set(12, 0, d); p.set(15, 0, d); p.set(14, 2, hex('#d0f040')); p.set(16, 2, c);
        p.rect(0, 2, 3, 1, c); p.set(0, 1, c);
        for (let i = 0; i < 3; i++) p.set(5 + i * 3, 4, d);
        p.rect(4 + sw * 2, 6, 1, 3, d); p.rect(6 - sw, 6, 1, 3, d); p.rect(10 + sw, 6, 1, 3, d); p.rect(12 - sw * 2, 6, 1, 3, d);
        fr.push(p.canvas(2));
      }
    }
    mobCache.set(kind, fr);
    return fr;
  }
  switch (kind) {
    case 'pig': case 'cow': case 'sheep': {
      for (let f = 0; f < 4; f++) {
        const w = kind === 'cow' ? 14 : 12, h = kind === 'cow' ? 10 : 8, p = P(w, h);
        const body = kind === 'pig' ? hex('#f0a0a8') : kind === 'cow' ? hex('#5a3a28') : hex('#ecebe4');
        const bodyY = kind === 'cow' ? 2 : 1;
        p.rect(1, bodyY, w - 4, h - bodyY - 3, body);
        p.rect(1, bodyY, w - 4, 1, sh(body, 1.12));
        if (kind === 'cow') { p.rect(3, 3, 3, 2, hex('#f0f0ec')); p.rect(7, 4, 2, 2, hex('#f0f0ec')); p.rect(w - 5, h - 4, 2, 1, hex('#f0b0b0')); }
        if (kind === 'sheep') { for (let i = 0; i < 6; i++) p.set(1 + i * 1.4 | 0, bodyY, sh(body, 0.9)); }
        // 头
        const hc = kind === 'sheep' ? hex('#8a7a6a') : body;
        const hx = w - 4, hy = kind === 'cow' ? 0 : 0;
        p.rect(hx, hy, 4, kind === 'cow' ? 5 : 4, hc);
        p.set(hx + 2, hy + 1, hex('#202020'));
        if (kind === 'pig') { p.rect(hx + 2, hy + 2, 2, 2, hex('#e07080')); p.set(hx + 3, hy + 2, hex('#902030')); }
        if (kind === 'cow') { p.rect(hx + 1, hy + 3, 3, 2, hex('#d8a8a0')); p.set(hx, hy, hex('#e8e0c8')); p.set(hx + 3, hy, hex('#e8e0c8')); }
        if (kind === 'sheep') p.rect(hx, hy, 1, 4, hex('#ecebe4'));
        // 腿
        const ly = h - 3, lc = kind === 'sheep' ? hex('#8a7a6a') : sh(body, 0.8);
        const sw = [0, 1, 0, -1][f];
        p.rect(2 + sw, ly, 2, 3, lc); p.rect(w - 6 - sw, ly, 2, 3, lc);
        if (kind === 'pig') p.set(0, bodyY + 1, hex('#e07080'));
        if (kind === 'cow') p.set(0, bodyY + 1, hex('#3a2418'));
        fr.push(p.canvas(2));
      }
      break;
    }
    case 'chicken': for (let f = 0; f < 4; f++) {
      const p = P(7, 8);
      p.rect(1, 2, 5, 4, hex('#f4f4f0')); p.rect(4, 0, 3, 3, hex('#f4f4f0'));
      p.set(6, 3, hex('#f0a020')); p.set(5, 1, hex('#202020')); p.set(5, 0, hex('#e02020')); p.set(6, 2, hex('#e02020'));
      p.rect(1, 3, 3, 2, hex('#d8d8d0'));
      const sw = [0, 1, 0, -1][f];
      p.rect(2 + sw, 6, 1, 2, hex('#f0a020')); p.rect(4 - sw, 6, 1, 2, hex('#f0a020'));
      fr.push(p.canvas(2));
    } break;
    case 'wolf': for (let f = 0; f < 4; f++) {
      const p = P(14, 9), c = hex('#8a8a92'), d = hex('#5a5a62');
      p.rect(2, 3, 8, 3, c); p.rect(2, 3, 8, 1, sh(c, 1.15)); p.rect(9, 1, 4, 3, c); p.set(13, 2, d); p.set(13, 3, hex('#202020'));
      p.set(10, 0, d); p.set(12, 0, d); p.set(11, 2, hex('#f0d040')); p.rect(0, 2, 2, 1, c); p.set(0, 1, c);
      const sw = [0, 1, 0, -1][f];
      p.rect(3 + sw, 6, 1, 3, d); p.rect(5 - sw, 6, 1, 3, d); p.rect(8 + sw, 6, 1, 3, d); p.rect(9 - sw, 6, 1, 3, d);
      fr.push(p.canvas(2));
    } break;
    case 'imp': for (let f = 0; f < 4; f++) {
      const p = P(9, 13), c = hex('#d05030'), d = hex('#8a2a1a');
      p.rect(2, 1, 5, 4, c); p.set(2, 0, d); p.set(6, 0, d); p.set(5, 2, hex('#ffe040')); p.set(6, 2, hex('#ffe040'));
      p.rect(3, 5, 4, 4, c); p.rect(3, 5, 1, 4, d); p.set(7, 6, c); p.set(8, 7, hex('#ffb030'));
      const sw = [0, 1, 0, -1][f];
      p.rect(3 + sw, 9, 1, 4, d); p.rect(5 - sw, 9, 1, 4, d); p.set(1, 8, d); p.set(0, 9, d);
      fr.push(p.canvas(2));
    } break;
    case 'totem': {
      const p = P(7, 13), w = hex('#8a5a32');
      p.rect(1, 2, 5, 11, w); p.rect(1, 2, 1, 11, sh(w, 0.7));
      p.rect(0, 1, 7, 2, hex('#c03a20')); p.set(2, 4, hex('#ffd040')); p.set(4, 4, hex('#ffd040')); p.rect(2, 6, 3, 1, hex('#3a2010'));
      p.rect(0, 8, 7, 1, hex('#e8c060')); p.set(3, 0, hex('#ff8030'));
      fr.push(p.canvas(2)); break;
    }
    case 'creeper': for (let f = 0; f < 4; f++) {
      const p = P(8, 21), g = hex('#4ab04a');
      const r = mulberry32(55);
      for (let y = 0; y < 17; y++) for (let x = 1; x < 7; x++) p.set(x, y, sh(g, 0.8 + r() * 0.4));
      p.rect(1, 0, 6, 1, sh(g, 1.2));
      p.rect(2, 2, 1, 2, hex('#101010')); p.rect(5, 2, 1, 2, hex('#101010'));
      p.rect(3, 4, 2, 2, hex('#101010')); p.set(2, 6, hex('#101010')); p.set(5, 6, hex('#101010')); p.rect(2, 5, 1, 2, hex('#101010')); p.rect(5, 5, 1, 2, hex('#101010'));
      const sw = [0, 1, 0, -1][f];
      p.rect(1 + sw, 17, 2, 4, sh(g, 0.7)); p.rect(5 - sw, 17, 2, 4, sh(g, 0.7));
      fr.push(p.canvas(2));
    } break;
    case 'spider': for (let f = 0; f < 4; f++) {
      const p = P(16, 7), b = hex('#2a2626');
      p.rect(3, 1, 7, 4, b); p.rect(10, 1, 4, 3, sh(b, 1.2)); p.set(12, 2, hex('#e02020')); p.set(13, 2, hex('#e02020')); p.set(12, 1, hex('#e02020'));
      for (let i = 0; i < 4; i++) {
        const x = 2 + i * 3, ph = (i + f) % 2;
        p.set(x, 5, b); p.set(x - 1 + ph, 6, b); p.set(x + 1, 0 + ph, b);
      }
      p.rect(4, 1, 5, 1, sh(b, 1.5));
      fr.push(p.canvas(2));
    } break;
    case 'slime': case 'lava_slime': for (let f = 0; f < 2; f++) {
      const p = P(10, 8), c = kind === 'slime' ? hex('#4a90f0') : hex('#f05a20');
      const top = f ? 2 : 1;
      for (let y = top; y < 8; y++) for (let x = (y === top ? 2 : y === top + 1 ? 1 : 0); x < (y === top ? 8 : y === top + 1 ? 9 : 10); x++) p.set(x, y, c, 200);
      p.rect(2, top + 1, 2, 1, hex('#ffffff'), 220); p.set(2, top + 2, hex('#ffffff'), 200);
      p.set(6, top + 3, hex('#102040')); p.set(8, top + 3, hex('#102040'));
      p.rect(0, 7, 10, 1, sh(c, 0.6), 220);
      fr.push(p.canvas(2));
    } break;
    case 'demon_eye': for (let f = 0; f < 2; f++) {
      const p = P(14, 9);
      p.rect(5, 1, 8, 7, hex('#f0ece8')); p.rect(6, 0, 6, 9, hex('#f0ece8')); p.rect(5, 1, 1, 7, hex('#d0c8c0'));
      p.rect(9, 3, 3, 3, hex('#3a70d0')); p.set(10, 4, hex('#101010')); p.set(9, 3, hex('#90c0ff'));
      p.set(7, 2, hex('#d02020')); p.set(6, 5, hex('#d02020')); p.set(8, 7, hex('#d02020'));
      for (let x = 0; x < 5; x++) { p.set(x, 3 + (x + f) % 2, hex('#a01818')); p.set(x, 6 - (x + f) % 2, hex('#a01818')); }
      fr.push(p.canvas(2));
    } break;
    case 'bat': for (let f = 0; f < 2; f++) {
      const p = P(12, 6), c = hex('#4a3a4a');
      p.rect(5, 1, 2, 3, c); p.set(5, 0, c); p.set(6, 0, c); p.set(5, 2, hex('#ff4040')); p.set(6, 2, hex('#ff4040'));
      if (f) { p.rect(0, 1, 5, 1, c); p.rect(7, 1, 5, 1, c); p.rect(1, 2, 3, 1, c); p.rect(8, 2, 3, 1, c); }
      else { p.rect(1, 3, 4, 1, c); p.rect(7, 3, 4, 1, c); p.rect(0, 4, 2, 1, c); p.rect(10, 4, 2, 1, c); }
      fr.push(p.canvas(2));
    } break;
  }
  mobCache.set(kind, fr);
  return fr;
}
