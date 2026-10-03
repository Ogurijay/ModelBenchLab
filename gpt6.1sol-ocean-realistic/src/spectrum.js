// Deterministic directional JONSWAP-shaped quadrature, shared by CPU and GPU.
// Units: metres, seconds, radians; +Y up, north is -Z.
export const COUNT = 24;
export const GRAVITY = 9.81;
export const PRESETS = {
  calm: { wind: 2, height: 0.35, direction: 110, sun: 38, cloud: 0.12, azimuth: -28, number: '01', title: '海，也有安静的时候。', description: '微风掠过，一切都慢了下来。' },
  swell: { wind: 9, height: 2.4, direction: 125, sun: 24, cloud: 0.30, azimuth: -22, number: '02', title: '风起，潮生。', description: '长浪越过海面，驶向看不见的岸。' },
  sunset: { wind: 5.5, height: 1.5, direction: 145, sun: 6, cloud: 0.25, azimuth: -16, number: '03', title: '把最后一束光，留给海。', description: '金色的航迹，延伸到日落尽头。' },
  storm: { wind: 22, height: 5.2, direction: 155, sun: 16, cloud: 0.92, azimuth: -35, number: '04', title: '深蓝之下，暗涌不息。', description: '风压低了云，海抬起了身。' },
};
export function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function createSpectrum(seed = 61) {
  const random = randomGenerator(seed);
  return Array.from({ length: COUNT }, (_, i) => {
    const omega = 0.51 * Math.pow(9.6, i / (COUNT - 1));
    return { omega, k: omega * omega / GRAVITY, phase: random() * Math.PI * 2, spread: (random() - 0.5) * (0.55 + i / COUNT * 1.4), amplitude: 0, dx: 0, dz: 0 };
  });
}
export function peakPeriod(wind) { return 4.8 + wind * 0.24; }
export function updateSpectrum(waves, parameters) {
  const peak = Math.PI * 2 / peakPeriod(parameters.wind);
  const direction = parameters.direction * Math.PI / 180;
  let variance = 0, slope = 0;
  for (const w of waves) {
    const sigma = w.omega <= peak ? 0.07 : 0.09;
    const bump = Math.exp(-0.5 * Math.pow((w.omega - peak) / (sigma * peak), 2));
    const jonswap = Math.pow(w.omega, -5) * Math.exp(-1.25 * Math.pow(peak / w.omega, 4)) * Math.pow(3.3, bump);
    const swell = Math.exp(-0.5 * Math.pow((w.omega - 0.68) / 0.16, 2)) * 0.42;
    const energy = (jonswap + swell) * w.omega;
    w.amplitude = Math.sqrt(2 * energy);
    variance += w.amplitude * w.amplitude / 2;
    w.dx = Math.sin(direction + w.spread); w.dz = -Math.cos(direction + w.spread);
  }
  const scale = parameters.height / (4 * Math.sqrt(Math.max(variance, 1e-10)));
  for (const w of waves) { w.amplitude *= scale; slope += w.amplitude * w.k; }
  // Bound total horizontal derivative to avoid Gerstner folds at extreme settings.
  return Math.min(1.65, 0.78 / Math.max(slope, 1e-8));
}
export function sampleParametric(x, z, time, waves, chop) {
  let px = x, y = 0, pz = z, tx = 1, ty = 0, tz = 0, bx = 0, by = 0, bz = 1;
  for (const w of waves) {
    const phase = w.k * (w.dx * x + w.dz * z) - w.omega * time + w.phase;
    const s = Math.sin(phase), c = Math.cos(phase), a = w.amplitude, q = chop * a;
    px += q * w.dx * c; y += a * s; pz += q * w.dz * c;
    tx -= q*w.k*w.dx*w.dx*s; ty += a*w.k*w.dx*c; tz -= q*w.k*w.dx*w.dz*s;
    bx -= q*w.k*w.dx*w.dz*s; by += a*w.k*w.dz*c; bz -= q*w.k*w.dz*w.dz*s;
  }
  const nx = by*tz-bz*ty, ny = bz*tx-bx*tz, nz = bx*ty-by*tx, length = Math.hypot(nx, ny, nz);
  return { x: px, y, z: pz, normal: [nx/length, ny/length, nz/length], jacobian: tx*bz-tz*bx };
}
// Invert horizontal displacement so float samples correspond to WORLD coordinates.
export function sampleWorld(x, z, time, waves, chop) {
  let baseX = x, baseZ = z;
  for (let i = 0; i < 7; i++) {
    const p = sampleParametric(baseX, baseZ, time, waves, chop);
    baseX += x - p.x; baseZ += z - p.z;
  }
  return sampleParametric(baseX, baseZ, time, waves, chop);
}
export function maximumElevation(waves) { return waves.reduce((sum, w) => sum + w.amplitude, 0); }
export function stepSpring(position, velocity, target, delta, frequency = 3.5) {
  // Exact critically damped integration for a piecewise constant target.
  const offset = position-target, c = velocity+frequency*offset, decay = Math.exp(-frequency*delta);
  return { position: target+(offset+c*delta)*decay, velocity: (velocity-frequency*c*delta)*decay };
}
export function finiteParam(value, fallback, min, max) {
  if (value === null || value === '') return fallback;
  const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
