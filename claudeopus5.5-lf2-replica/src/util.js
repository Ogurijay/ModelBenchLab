// 通用小工具:数学、颜色、随机数。
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
export const DEG = Math.PI / 180;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 游戏逻辑用的全局随机源(可重置,保证无头测试可复现)
let _rng = mulberry32(20261010);
export const rnd = () => _rng();
export const seedRandom = (s) => { _rng = mulberry32(s); };
export const rndInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// 颜色:#rrggbb → [r,g,b]
const _cc = new Map();
export function hex2rgb(h) {
  let c = _cc.get(h);
  if (c) return c;
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((x) => x + x).join('');
  c = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  _cc.set(h, c);
  return c;
}
export const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
export function shade(h, k) {
  // k>0 提亮(向白),k<0 压暗(向黑)
  const [r, g, b] = hex2rgb(h);
  if (k >= 0) return rgb2hex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
  return rgb2hex(r * (1 + k), g * (1 + k), b * (1 + k));
}
export function mix(h1, h2, t) {
  const a = hex2rgb(h1), b = hex2rgb(h2);
  return rgb2hex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
