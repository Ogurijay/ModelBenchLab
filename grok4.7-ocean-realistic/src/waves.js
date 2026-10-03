/** JONSWAP 形状的离散谱，再归一化到目标有效波高，最后叠一组交叉涌浪。 */

export const MAX_WAVES = 20;
export const GRAVITY = 9.81;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jonswap(omega, omegaP) {
  const sigma = omega <= omegaP ? 0.07 : 0.09;
  const r = Math.exp(-((omega - omegaP) ** 2) / (2 * sigma * sigma * omegaP * omegaP));
  const alpha = 0.0081;
  const gamma = 3.3;
  return (alpha * GRAVITY * GRAVITY) / omega ** 5
    * Math.exp(-1.25 * (omegaP / omega) ** 4)
    * gamma ** r;
}

function emptyWave() {
  return { amplitude: 0, k: 1, omega: 1, dirX: 1, dirZ: 0, phase: 0, Q: 0 };
}

/**
 * @param {object} input
 * @param {number} input.windSpeed 风速 m/s
 * @param {number} input.windDirection 风吹去的方向，弧度
 * @param {number} input.steepness 0–1，控制尖浪，总和被限制在不翻卷
 * @param {number} input.swellHeight 涌浪尺度，米
 * @param {number} input.swellDirection 涌浪方向，弧度
 * @param {number} input.seed
 */
export function buildSea(input = {}) {
  const windSpeed = Math.max(0.8, input.windSpeed ?? 8);
  const windDirection = input.windDirection ?? 0.4;
  const steepness = Math.min(1, Math.max(0, input.steepness ?? 0.6));
  const swellHeight = Math.max(0, input.swellHeight ?? 0.4);
  const swellDirection = input.swellDirection ?? windDirection + 1.1;
  const rand = mulberry32((input.seed ?? 1) >>> 0);

  const peakPeriod = Math.min(16, Math.max(3.2, 2.35 + 0.58 * windSpeed));
  const omegaP = (2 * Math.PI) / peakPeriod;
  const targetHs = Math.min(8.5, Math.max(0.06, 0.0175 * windSpeed * windSpeed));
  const m0 = (targetHs / 4) ** 2;

  const freqCount = 6;
  const dirCount = 3;
  const omegas = [];
  for (let i = 0; i < freqCount; i++) {
    const u = (i + 0.5) / freqCount;
    const log0 = Math.log(0.52);
    const log1 = Math.log(3.3);
    omegas.push(omegaP * Math.exp(log0 + u * (log1 - log0)));
  }

  const parts = [];
  for (let i = 0; i < freqCount; i++) {
    const omega = omegas[i];
    const dOmega = i === 0
      ? omegas[1] - omegas[0]
      : i === freqCount - 1
        ? omegas[i] - omegas[i - 1]
        : (omegas[i + 1] - omegas[i - 1]) * 0.5;
    const spectrum = jonswap(omega, omegaP);
    const spread = 0.16 + 0.62 * Math.min(1.4, omega / omegaP);
    for (let j = 0; j < dirCount; j++) {
      const centered = (j - (dirCount - 1) / 2) / ((dirCount - 1) / 2);
      const theta = windDirection + centered * spread;
      const spreading = Math.cos(centered * Math.PI * 0.5) ** 2;
      parts.push({
        omega,
        theta,
        weight: Math.max(0, spectrum * dOmega * spreading)
      });
    }
  }

  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0) || 1;
  const waves = parts.map((part) => {
    const variance = m0 * (part.weight / weightSum);
    const amplitude = Math.sqrt(Math.max(0, variance * 2));
    const omega = part.omega;
    return {
      amplitude,
      k: (omega * omega) / GRAVITY,
      omega,
      dirX: Math.cos(part.theta),
      dirZ: Math.sin(part.theta),
      phase: rand() * Math.PI * 2,
      Q: 0
    };
  });

  const swellPeriod = 11.5 + Math.min(4.5, swellHeight * 1.6);
  for (let s = 0; s < 2; s++) {
    const omega = (2 * Math.PI) / (swellPeriod * (1 + s * 0.12));
    const theta = swellDirection + (s === 0 ? 0 : 0.16);
    waves.push({
      amplitude: swellHeight * (s === 0 ? 0.27 : 0.16),
      k: (omega * omega) / GRAVITY,
      omega,
      dirX: Math.cos(theta),
      dirZ: Math.sin(theta),
      phase: rand() * Math.PI * 2,
      Q: 0
    });
  }

  while (waves.length < MAX_WAVES) waves.push(emptyWave());
  const active = waves.reduce((count, wave) => count + (wave.amplitude > 1e-5 ? 1 : 0), 0) || 1;
  for (const wave of waves) {
    wave.Q = wave.amplitude > 1e-5 && wave.k > 1e-5
      ? steepness / (wave.k * wave.amplitude * active)
      : 0;
  }

  return {
    waves: waves.slice(0, MAX_WAVES),
    peakPeriod,
    windHs: targetHs,
    hs: significantHeight(waves)
  };
}

export function cloneWaves(waves) {
  return waves.map((wave) => ({ ...wave }));
}

/** 相位立刻对齐，其余分量指数逼近，避免切海况时海面跳变。 */
export function approachWaves(live, target, alpha) {
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    const b = target[i];
    a.amplitude += (b.amplitude - a.amplitude) * alpha;
    a.k += (b.k - a.k) * alpha;
    a.omega += (b.omega - a.omega) * alpha;
    a.dirX += (b.dirX - a.dirX) * alpha;
    a.dirZ += (b.dirZ - a.dirZ) * alpha;
    a.phase = b.phase;
    a.Q += (b.Q - a.Q) * alpha;
    const len = Math.hypot(a.dirX, a.dirZ) || 1;
    a.dirX /= len;
    a.dirZ /= len;
  }
}

export function significantHeight(waves) {
  let variance = 0;
  for (const wave of waves) variance += wave.amplitude * wave.amplitude * 0.5;
  return 4 * Math.sqrt(variance);
}

/** 在静止水平坐标 (x, z) 上求 Gerstner 位移、法线和雅可比。 */
export function evaluateRest(waves, x, z, time) {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let dPxdx = 1;
  let dPxdz = 0;
  let dPydx = 0;
  let dPydz = 0;
  let dPzdx = 0;
  let dPzdz = 1;
  let vx = 0;
  let vy = 0;
  let vz = 0;

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    if (wave.amplitude === 0) continue;
    const theta = wave.k * (wave.dirX * x + wave.dirZ * z) - wave.omega * time + wave.phase;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const { amplitude: A, k, omega, dirX, dirZ, Q } = wave;
    dx += Q * A * dirX * c;
    dz += Q * A * dirZ * c;
    dy += A * s;
    const kQAs = k * Q * A * s;
    const kAc = k * A * c;
    dPxdx -= kQAs * dirX * dirX;
    dPxdz -= kQAs * dirX * dirZ;
    dPzdx -= kQAs * dirZ * dirX;
    dPzdz -= kQAs * dirZ * dirZ;
    dPydx += kAc * dirX;
    dPydz += kAc * dirZ;
    vx += Q * A * dirX * s * omega;
    vz += Q * A * dirZ * s * omega;
    vy -= A * omega * c;
  }

  let nx = dPydz * dPzdx - dPzdz * dPydx;
  let ny = dPzdz * dPxdx - dPxdz * dPzdx;
  let nz = dPxdz * dPydx - dPydz * dPxdx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  return {
    dx,
    dy,
    dz,
    y: dy,
    normal: { x: nx, y: ny, z: nz },
    jacobian: dPxdx * dPzdz - dPxdz * dPzdx,
    velocity: { x: vx, y: vy, z: vz }
  };
}

/** 反求水平位移，得到世界水平位置上的海面。 */
export function sampleSurface(waves, x, z, time) {
  let restX = x;
  let restZ = z;
  let sample = evaluateRest(waves, restX, restZ, time);
  for (let i = 0; i < 4; i++) {
    restX = x - sample.dx;
    restZ = z - sample.dz;
    sample = evaluateRest(waves, restX, restZ, time);
  }
  return {
    height: sample.y,
    normal: sample.normal,
    jacobian: sample.jacobian,
    velocity: sample.velocity,
    dx: sample.dx,
    dz: sample.dz
  };
}
