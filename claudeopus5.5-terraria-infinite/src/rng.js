// 确定性随机与噪声:世界生成必须是 (x, y, seed) 的纯函数,才能在无限地图上按需重建任意区块。
// 梯度全部由整数哈希选取(不用 256 置换表),因此噪声在 x 方向不会出现周期性重复。

export function hash32(a) {
  a |= 0;
  a = (a ^ 61) ^ (a >>> 16);
  a = (a + (a << 3)) | 0;
  a ^= a >>> 4;
  a = Math.imul(a, 0x27d4eb2d);
  a ^= a >>> 15;
  return a >>> 0;
}

export function hash2(x, y, s) {
  return hash32(Math.imul(x | 0, 0x1f123bb5) ^ hash32((Math.imul(y | 0, 0x5f356495) + (s | 0)) | 0));
}
export function hash3(x, y, z, s) {
  return hash2(x, hash2(y, z, s), s ^ 0x9e3779b9);
}
// [0,1)
export const rand2 = (x, y, s) => hash2(x, y, s) / 4294967296;
export const rand1 = (x, s) => hash2(x, 0x7a3d, s) / 4294967296;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(str) {
  if (/^-?\d+$/.test(str.trim())) return (parseInt(str, 10) | 0) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

// 1D 梯度噪声,输出约 [-1, 1]
export function noise1(x, s) {
  const i = Math.floor(x), f = x - i;
  const g0 = (hash2(i, 0x51, s) / 2147483648) - 1;
  const g1 = (hash2(i + 1, 0x51, s) / 2147483648) - 1;
  const u = fade(f);
  return (g0 * f * (1 - u) + g1 * (f - 1) * u) * 2;
}

export function fbm1(x, s, oct = 4, lac = 2, gain = 0.5) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += noise1(x * f, s + o * 1013) * a;
    norm += a; a *= gain; f *= lac;
  }
  return sum / norm;
}

// 2D 单纯形噪声(哈希梯度),输出约 [-1, 1]
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
const GXn = GX.map((v, i) => v / Math.hypot(v, GY[i])), GYn = GY.map((v, i) => v / Math.hypot(GX[i], v));
export function noise2(xin, yin, s) {
  const sk = (xin + yin) * F2;
  const i = Math.floor(xin + sk), j = Math.floor(yin + sk);
  const t = (i + j) * G2;
  const x0 = xin - (i - t), y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  let n = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) { const g = hash2(i, j, s) & 7; t0 *= t0; n += t0 * t0 * (GXn[g] * x0 + GYn[g] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) { const g = hash2(i + i1, j + j1, s) & 7; t1 *= t1; n += t1 * t1 * (GXn[g] * x1 + GYn[g] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) { const g = hash2(i + 1, j + 1, s) & 7; t2 *= t2; n += t2 * t2 * (GXn[g] * x2 + GYn[g] * y2); }
  return 70 * n;
}

export function fbm2(x, y, s, oct = 3, lac = 2, gain = 0.5) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += noise2(x * f, y * f, s + o * 7919) * a;
    norm += a; a *= gain; f *= lac;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
