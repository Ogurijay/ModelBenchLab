// 数学、随机与颜色工具。
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : 1);
export const D2R = Math.PI / 180;
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;

// 确定性 PRNG(mulberry32),对战逻辑全部使用它,保证评测可复现。
let seed = 0x9e3779b9;
export function seedRandom(s) { seed = (s >>> 0) || 1; }
export function rand() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rnd = (a, b) => a + (b - a) * rand();
export const rndi = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];
export const chance = (p) => rand() < p;
// 纯视觉随机(粒子),不影响逻辑可复现性
export const vr = (a = 0, b = 1) => a + (b - a) * Math.random();

const shadeCache = new Map();
export function shade(hex, amt) {
  const k = hex + amt;
  let v = shadeCache.get(k);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  v = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(k, v);
  return v;
}
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// 色相旋转(同角色对战时 2P 换色)
export function hueShift(hex, deg) {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  h = (h + deg / 360 + 1) % 1;
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + to(f(p, q, h + 1 / 3)) + to(f(p, q, h)) + to(f(p, q, h - 1 / 3));
}
export function altLook(look) {
  const L = { ...look };
  for (const k of ['top', 'top2', 'pants', 'hair', 'sleeveColor', 'shoe', 'sash', 'belt', 'highCollar', 'eye']) if (L[k]) L[k] = hueShift(L[k], 150);
  if (L.coat) L.coat = { ...L.coat, color: hueShift(L.coat.color, 150) };
  if (L.cloak) L.cloak = { ...L.cloak, pattern: hueShift(L.cloak.pattern, 150) };
  if (L.headband) L.headband = { ...L.headband, band: hueShift(L.headband.band, 150) };
  return L;
}
export function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
