// 像素渲染底层:240×160 逻辑画布、GBA 调色板、3×5 点阵数字字体、
// 中文字形二值化缓存(把系统 12px 字体阈值化成硬边像素字)、窗口框与小工具。
export const W = 240, H = 160;

export const canvas = document.getElementById('screen');
canvas.width = W; canvas.height = H;
export const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}

// GBA 15 位色感的有限调色板(每通道 8 级量化后的观感)
export const P = {
  ink: '#181828', ink2: '#2c2c48', white: '#f8f8f0', cream: '#f0e8c8',
  grey: '#9898a8', grey2: '#686880', grey3: '#c8c8d0',
  red: '#d83838', red2: '#982828', pink: '#f088a8', orange: '#f08830', yellow: '#f8d838', gold: '#c89818',
  green: '#48c048', green2: '#288028', green3: '#90e070', teal: '#38a8a0',
  blue: '#3870d8', blue2: '#204898', sky: '#78b8f0', navy: '#182858', purple: '#8858c8',
  brown: '#a06830', brown2: '#704018', brown3: '#c89058', tan: '#e0b880',
  ui: '#203c88', ui2: '#2c58b8', uiHi: '#78a8f0', uiSel: '#f8e070',
};

export function rect(x, y, w, h, c, g = ctx) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
export function px(x, y, c, g = ctx) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); }
export function frame(x, y, w, h, c, g = ctx) {
  g.fillStyle = c;
  g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
}

// 确定性随机(程序化贴图与地图装饰用)
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
  return (h ^ (h >> 16)) / 4294967296;
}

// 颜色工具
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  const q = (v) => Math.max(0, Math.min(255, Math.round(v / 8) * 8));
  return '#' + ((1 << 24) | (q(r) << 16) | (q(g) << 8) | q(b)).toString(16).slice(1);
}

// 给精灵加 1px 深色描边(GBA 精灵的典型轮廓)
export function outline(c, color = P.ink) {
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = g.getImageData(0, 0, w, h);
  const a = d.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out.push(x, y);
  }
  g.fillStyle = color;
  for (let i = 0; i < out.length; i += 2) g.fillRect(out[i], out[i + 1], 1, 1);
  return c;
}

// ---------- 3×5 点阵字体(数字、时钟、金钱、英文标签) ----------
const G = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  ':': '000010000010000', '/': '001001010100100', '§': '011110101011110', '+': '000010111010000',
  '-': '000000111000000', '.': '000000000000010', '!': '010010010000010', '?': '111001010000010',
  '%': '101001010100101', ' ': '000000000000000', 'x': '000101010101000', '>': '100010001010100',
  '<': '001010100010001', '(': '010100100100010', ')': '010001001001010', '=': '000111000111000',
  '*': '000101010101000', ',': '000000000010100', "'": '010010000000000', '#': '101111101111101',
  '^': '010101000000000', '_': '000000000000111',
};
export function ptext(str, x, y, c = P.white, g = ctx) {
  str = String(str).toUpperCase();
  g.fillStyle = c;
  let cx = x | 0;
  for (const ch of str) {
    const gl = G[ch] || G['?'];
    for (let i = 0; i < 15; i++) if (gl.charCodeAt(i) === 49) g.fillRect(cx + (i % 3), (y | 0) + ((i / 3) | 0), 1, 1);
    cx += 4;
  }
  return cx - x;
}
export const pwidth = (str) => String(str).length * 4 - 1;
// 带 1px 阴影的点阵字
export function ptextS(str, x, y, c = P.white, sh = P.ink, g = ctx) {
  ptext(str, x + 1, y + 1, sh, g); return ptext(str, x, y, c, g);
}

// ---------- 中文字形:系统字体渲染 → 阈值化 → 缓存 ----------
const FONT_STACK = '"SimSun","宋体","NSimSun","Songti SC","STSong","Noto Sans CJK SC","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
const [mc, mx] = mk(32, 32);
const glyphCache = new Map();
const widthCache = new Map();
export const LINE = 13;

function fontFor(size, bold) { return `${bold ? 'bold ' : ''}${size}px ${FONT_STACK}`; }

export function charW(ch, size = 12) {
  const k = size + ch;
  let w = widthCache.get(k);
  if (w === undefined) {
    if (ch.charCodeAt(0) > 0x2e80) w = size;
    else { mx.font = fontFor(size); w = Math.max(3, Math.round(mx.measureText(ch).width)); }
    widthCache.set(k, w);
  }
  return w;
}
export function textW(str, size = 12) {
  let w = 0;
  for (const ch of str) w += charW(ch, size);
  return w;
}

function bakeText(str, color, size, bold) {
  const key = `${size}${bold ? 'b' : ''}|${color}|${str}`;
  let c = glyphCache.get(key);
  if (c) return c;
  const w = Math.max(1, textW(str, size) + 2), h = size + 4;
  const [cv, g] = mk(w, h);
  g.font = fontFor(size, bold);
  g.textBaseline = 'top';
  g.fillStyle = '#fff';
  let x = 0;
  for (const ch of str) { g.fillText(ch, x, 1); x += charW(ch, size); }
  const d = g.getImageData(0, 0, w, h);
  const n = parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const a = d.data;
  const th = size >= 16 ? 120 : 96;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] >= th) { a[i] = r; a[i + 1] = gg; a[i + 2] = b; a[i + 3] = 255; }
    else a[i + 3] = 0;
  }
  g.putImageData(d, 0, 0);
  if (glyphCache.size > 1600) glyphCache.clear();
  glyphCache.set(key, cv);
  return cv;
}

export function text(str, x, y, color = P.white, opt = {}) {
  if (!str) return 0;
  const size = opt.size || 12;
  const g = opt.g || ctx;
  if (opt.shadow) g.drawImage(bakeText(str, opt.shadow, size, opt.bold), (x | 0) + 1, (y | 0) + 1);
  if (opt.outline) {
    const o = bakeText(str, opt.outline, size, opt.bold);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(o, (x | 0) + dx, (y | 0) + dy);
  }
  g.drawImage(bakeText(str, color, size, opt.bold), x | 0, y | 0);
  return textW(str, size);
}
export function textC(str, cx, y, color, opt = {}) {
  return text(str, Math.round(cx - textW(str, opt.size || 12) / 2), y, color, opt);
}

// 按像素宽度折行(支持 \n)
export function wrap(str, maxW, size = 12) {
  const lines = [];
  for (const para of String(str).split('\n')) {
    let line = '', w = 0;
    for (const ch of para) {
      const cw = charW(ch, size);
      if (w + cw > maxW && line) { lines.push(line); line = ''; w = 0; }
      line += ch; w += cw;
    }
    lines.push(line);
  }
  return lines;
}

// ---------- GBA 风窗口 ----------
export function panel(x, y, w, h, style = 'blue') {
  const S = {
    blue: [P.ink, P.uiHi, P.ui2, P.ui],
    cream: [P.ink, P.white, P.cream, '#e0d0a8'],
    dark: [P.ink, '#5868a0', '#283058', '#1c2244'],
    green: [P.ink, '#a8f088', '#309838', '#207028'],
  }[style];
  rect(x + 1, y, w - 2, h, S[0]); rect(x, y + 1, w, h - 2, S[0]);
  rect(x + 1, y + 1, w - 2, h - 2, S[1]);
  rect(x + 2, y + 2, w - 4, h - 4, S[2]);
  // 底部渐变条纹,模仿 GBA 窗口的抖动阴影
  ctx.fillStyle = S[3];
  for (let yy = y + 2 + ((h - 4) >> 1); yy < y + h - 2; yy += 2) ctx.fillRect(x + 2, yy, w - 4, 1);
}

// 选择光标:小绿钻
export function cursor(x, y, t = 0) {
  const o = Math.round(Math.sin(t * 8) * 1);
  const xx = x + o;
  rect(xx + 2, y, 1, 1, P.green3);
  rect(xx + 1, y + 1, 3, 1, P.green3);
  rect(xx, y + 2, 5, 3, P.green);
  rect(xx + 1, y + 5, 3, 1, P.green2);
  rect(xx + 2, y + 6, 1, 1, P.green2);
  px(xx + 1, y + 2, P.white);
}

export function bar(x, y, w, h, v, colOverride) {
  v = Math.max(0, Math.min(1, v));
  rect(x, y, w, h, P.ink);
  const c = colOverride || (v > 0.6 ? P.green : v > 0.35 ? P.yellow : v > 0.15 ? P.orange : P.red);
  rect(x + 1, y + 1, Math.round((w - 2) * v), h - 2, c);
  if (h > 3) rect(x + 1, y + 1, Math.round((w - 2) * v), 1, shade(c, 0.35));
}
