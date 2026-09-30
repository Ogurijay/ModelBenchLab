// Shared deterministic coefficients for GPU displacement and CPU buoy sampling.
export const PRESETS = {
  calm: { wind: 2.4, height: 0.4, direction: 105, sun: 26, cloud: 0.12, number: '01', title: '平静海面', description: '微风拂过，细小的波纹缓缓展开。' },
  swell: { wind: 8, height: 1.8, direction: 135, sun: 12, cloud: 0.32, number: '02', title: '远海涌浪', description: '长浪行进，光落在起伏之间。' },
  squall: { wind: 17, height: 3.6, direction: 160, sun: 7, cloud: 0.92, number: '03', title: '风暴前夕', description: '天色沉下，风把海面推向远方。' },
};

const weights = [0.34, 0.23, 0.15, 0.10, 0.075, 0.05, 0.033, 0.021];
const norm = 4 * Math.sqrt(weights.reduce((sum, w) => sum + w * w / 2, 0));
const wavelengths = [120, 67, 37, 21, 12, 7, 4, 2.4];
const spreads = [0, -0.31, 0.4, -0.56, 0.68, -0.8, 0.92, -1.08];
export const WAVE_COUNT = weights.length;

export function makeWaves(seed = 71) {
  let state = seed >>> 0;
  return weights.map((weight, i) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return { k: Math.PI * 2 / wavelengths[i], amplitude: weight / norm, spread: spreads[i], phase: state / 4294967296 * Math.PI * 2 };
  });
}

export function sampleSurface(x, z, time, parameters, waves) {
  const p = { x, y: 0, z };
  const tangent = { x: 1, y: 0, z: 0 };
  const binormal = { x: 0, y: 0, z: 1 };
  const angle = parameters.direction * Math.PI / 180;
  for (const wave of waves) {
    // 0 degrees points north (-Z); angles increase clockwise.
    const dx = Math.sin(angle + wave.spread), dz = -Math.cos(angle + wave.spread);
    const a = wave.amplitude * parameters.height;
    const phase = wave.k * (dx * x + dz * z) - Math.sqrt(9.81 * wave.k) * time + wave.phase;
    const s = Math.sin(phase), c = Math.cos(phase), qa = a * 0.62;
    p.x += qa * dx * c; p.y += a * s; p.z += qa * dz * c;
    tangent.x -= qa * wave.k * dx * dx * s;
    tangent.y += a * wave.k * dx * c;
    tangent.z -= qa * wave.k * dx * dz * s;
    binormal.x -= qa * wave.k * dx * dz * s;
    binormal.y += a * wave.k * dz * c;
    binormal.z -= qa * wave.k * dz * dz * s;
  }
  const nx = binormal.y * tangent.z - binormal.z * tangent.y;
  const ny = binormal.z * tangent.x - binormal.x * tangent.z;
  const nz = binormal.x * tangent.y - binormal.y * tangent.x;
  const length = Math.hypot(nx, ny, nz);
  return { ...p, normal: { x: nx / length, y: ny / length, z: nz / length } };
}

export function maximumElevation(height, waves) {
  return waves.reduce((sum, w) => sum + w.amplitude * height, 0);
}

export function periodForWind(wind, waves) {
  return Math.PI * 2 / (Math.sqrt(9.81 * waves[0].k) * (0.65 + wind * 0.045));
}
