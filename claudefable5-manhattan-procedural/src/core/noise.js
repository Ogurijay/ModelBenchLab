// 基于格点哈希的值噪声(2D/3D)与 fBm,全部由种子决定。
import { hash2 } from './prng.js';

const fade = (t) => t * t * (3 - 2 * t);

export function makeNoise2D(seed) {
  return function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export function makeFbm2D(seed, octaves = 4, lacunarity = 2, gain = 0.5) {
  const n = makeNoise2D(seed);
  return function fbm(x, y) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * n(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm; // [0,1)
  };
}

export function makeNoise3D(seed) {
  return function noise3(x, y, z) {
    const zi = Math.floor(z), zf = z - zi, w = fade(zf);
    // 两层 2D 噪声按 z 插值(哈希混入 z 层号)
    const n0 = makeNoise2D(seed + zi * 7919)(x, y);
    const n1 = makeNoise2D(seed + (zi + 1) * 7919)(x, y);
    return n0 + (n1 - n0) * w;
  };
}
