// 确定性伪随机:同一 seed 必然生成同一座城。
// mulberry32 —— 32 位状态,周期 2^32,分布均匀,足够场景生成使用。
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

export class Rng {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.f = mulberry32(this.seed);
  }
  /** [0,1) */
  next() { return this.f(); }
  /** [a,b) 浮点 */
  range(a, b) { return a + (b - a) * this.f(); }
  /** [a,b] 整数 */
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length) % arr.length]; }
  chance(p) { return this.f() < p; }
  /** 近似正态(中心极限),用于尺寸抖动 */
  gauss(mu = 0, sigma = 1) {
    const u = (this.f() + this.f() + this.f() + this.f() + this.f() + this.f() - 3) / 3;
    return mu + u * sigma * 1.732;
  }
  /** 派生一个独立子流,保证局部生成互不串扰 */
  fork(salt = 0) { return new Rng((this.seed ^ (0x9e3779b9 + salt * 2654435761)) >>> 0); }
}

/** 二维值噪声(平滑插值),用于地形起伏与纹理。 */
export function valueNoise2D(seed = 1) {
  const rnd = mulberry32(seed);
  const P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = rnd();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

/** 多倍频 FBM。 */
export function fbm2D(seed = 1, octaves = 4, gain = 0.5, lacunarity = 2) {
  const n = valueNoise2D(seed);
  return function (x, y) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += n(x * f, y * f) * amp;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  };
}
