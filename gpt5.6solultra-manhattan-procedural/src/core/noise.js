import { hashParts } from './random.js';

const smoothstep5 = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const lattice = (seed, ...coords) => hashParts(seed, ...coords) / 0xffffffff;

export function valueNoise2D(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep5(x - x0);
  const ty = smoothstep5(y - y0);
  const a = lerp(lattice(seed, x0, y0), lattice(seed, x0 + 1, y0), tx);
  const b = lerp(lattice(seed, x0, y0 + 1), lattice(seed, x0 + 1, y0 + 1), tx);
  return lerp(a, b, ty) * 2 - 1;
}

export function valueNoise3D(x, y, z, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smoothstep5(x - x0);
  const ty = smoothstep5(y - y0);
  const tz = smoothstep5(z - z0);
  const plane = (dz) => {
    const a = lerp(lattice(seed, x0, y0, z0 + dz), lattice(seed, x0 + 1, y0, z0 + dz), tx);
    const b = lerp(lattice(seed, x0, y0 + 1, z0 + dz), lattice(seed, x0 + 1, y0 + 1, z0 + dz), tx);
    return lerp(a, b, ty);
  };
  return lerp(plane(0), plane(1), tz) * 2 - 1;
}

function normalizeOptions(optionsOrSeed) {
  return typeof optionsOrSeed === 'object' && optionsOrSeed !== null
    ? optionsOrSeed
    : { seed: optionsOrSeed };
}

export function fbm2D(x, y, optionsOrSeed = {}) {
  const {
    seed = 0,
    octaves = 5,
    frequency = 1,
    lacunarity = 2,
    gain = 0.5,
    amplitude = 1,
  } = normalizeOptions(optionsOrSeed);
  let sum = 0;
  let weight = 1;
  let normalizer = 0;
  let scale = frequency;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise2D(x * scale, y * scale, hashParts(seed, octave)) * weight;
    normalizer += weight;
    weight *= gain;
    scale *= lacunarity;
  }
  return normalizer ? (sum / normalizer) * amplitude : 0;
}

export function fbm3D(x, y, z, optionsOrSeed = {}) {
  const {
    seed = 0,
    octaves = 5,
    frequency = 1,
    lacunarity = 2,
    gain = 0.5,
    amplitude = 1,
  } = normalizeOptions(optionsOrSeed);
  let sum = 0;
  let weight = 1;
  let normalizer = 0;
  let scale = frequency;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise3D(x * scale, y * scale, z * scale, hashParts(seed, octave)) * weight;
    normalizer += weight;
    weight *= gain;
    scale *= lacunarity;
  }
  return normalizer ? (sum / normalizer) * amplitude : 0;
}

export function ridgedFbm2D(x, y, optionsOrSeed = {}) {
  const options = normalizeOptions(optionsOrSeed);
  const value = fbm2D(x, y, options);
  return 1 - Math.min(1, Math.abs(value));
}
