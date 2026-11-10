// 非周期宽频海浪谱 + 波群空间包络 + 波脊弯曲相位调制 (CPU & GPU 同源确定性数学核)
// 彻底消除传统少量正弦/Gerstner 波叠加产生的“固定宽度、固定间距、平行条纹感”

export const WAVE_COUNT = 32;
export const GRAVITY = 9.81;
export const LOOP_PERIOD = 600.0;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 与 GLSL 完全一致的波群空间包络与波脊弯曲调制函数
 * 作用：
 * 1. groupEnv: 模拟真实海面的“波群现象”（几道大浪夹杂平缓区，空间上高低错落，无固定振幅）
 * 2. phaseWarp: 沿波峰线方向引入非周期弯曲与波长伸缩，打破无限长平行直线波脊
 */
export function evaluateSpatialModulation(rx, rz, time) {
  const t = time * 0.18;
  const g1 = Math.sin(rx * 0.017 + rz * 0.013 - t * 1.1) * Math.cos(rx * 0.011 - rz * 0.019 + t * 0.7);
  const g2 = Math.sin(rx * 0.037 - rz * 0.029 + t * 1.6) * Math.sin(rx * 0.023 + rz * 0.041 - t * 1.3);
  const g3 = Math.cos(rx * 0.071 + rz * 0.053 - t * 2.1);

  // 波群包络在 0.58 ~ 1.38 之间无规律起伏
  const groupEnv = 0.96 + 0.28 * g1 + 0.16 * g2 + 0.08 * g3;

  // 空间相位扭曲场（让波峰线弯曲、分叉、宽窄不一）
  const warpX = 1.65 * Math.sin(rx * 0.029 + rz * 0.037 + t) + 0.95 * Math.cos(rx * 0.067 - rz * 0.051 - t * 1.4);
  const warpZ = 1.65 * Math.cos(rx * 0.033 - rz * 0.027 - t * 0.9) + 0.95 * Math.sin(rx * 0.059 + rz * 0.073 + t * 1.2);

  return { groupEnv, warpX, warpZ };
}

/**
 * 构建 32 组宽频、广角交叉、非谐波比例的确定性波分量
 * 严格满足有效波高关系：Hs_total = 4 * sqrt(sum(a_i^2) / 2)
 */
export function createWaveSpectrum(params = {}) {
  const {
    seed = 4072,
    windSpeed = 10.2,
    windDirDeg = 25,
    hs = 2.05,
    swellHeight = 0.78,
    swellDirDeg = -18,
    choppiness = 1.22
  } = params;

  const rng = mulberry32(seed);
  const windRad = (windDirDeg * Math.PI) / 180;
  const swellRad = (swellDirDeg * Math.PI) / 180;

  // 黄金分割低差异序列，确保波长与方向绝不扎堆成单一周期
  const GOLDEN_RATIO = 0.61803398875;

  const rawWindWaves = [];
  const windCount = 24;

  // 覆盖从 2.4m 短碎浪到 68m 远洋大风浪的宽广波长区间
  const minWavelength = Math.max(2.2, 1.8 + windSpeed * 0.08);
  const maxWavelength = Math.min(88.0, 18.0 + windSpeed * 2.4);

  let windEnergySum = 0;
  for (let i = 0; i < windCount; i++) {
    // 非均匀无理数间隔采样波长，彻底杜绝固定间距谐波共振
    const jitter = (rng() - 0.5) * 0.65;
    const frac = Math.min(0.995, Math.max(0.005, (i + 0.5 + jitter) / windCount));
    const wl = minWavelength * Math.pow(maxWavelength / minWavelength, Math.pow(frac, 1.12));
    const kRaw = (2.0 * Math.PI) / wl;
    const omegaRaw = Math.sqrt(GRAVITY * kRaw);

    // 宽频谱包络（避免单一峰频率垄断能量导致等宽条纹）
    const peakWl = minWavelength * 0.35 + maxWavelength * 0.48;
    const logRatio = Math.log(wl / peakWl);
    const broadWeight = Math.exp(-logRatio * logRatio * 0.72) * (0.68 + 0.64 * rng());

    // 广角双峰交叉方向分布（±68° 扇面交错），使波峰相互切割成不规则三维短峰波包
    const quasi = ((i * GOLDEN_RATIO) % 1.0) * 2.0 - 1.0;
    const crossLobe = (i % 3 === 0 ? 1 : -1) * (0.28 + 0.45 * rng());
    const angleOffset = quasi * 0.72 + crossLobe * 0.48;
    const dir = windRad + angleOffset;

    const unnormAmp = broadWeight;
    windEnergySum += unnormAmp * unnormAmp;

    rawWindWaves.push({
      omegaRaw,
      dir,
      unnormAmp,
      phase: rng() * Math.PI * 2
    });
  }

  const targetWindRmsSq = (hs * hs) / 8.0;
  const windScale = windEnergySum > 0 ? Math.sqrt(targetWindRmsSq / windEnergySum) : 0;

  // 8 组多方向非通约长涌浪（来自不同远洋风暴源区，互相斜交）
  const rawSwellWaves = [];
  const swellCount = WAVE_COUNT - windCount;
  const swellWavelengths = [74.0, 58.5, 46.2, 37.8, 30.5, 24.3, 19.4, 15.2];
  const swellDirOffsets = [-0.62, 0.48, -0.25, 0.78, -0.88, 0.18, -0.42, 0.58];
  const swellWeights = [1.0, 0.92, 0.84, 0.76, 0.68, 0.60, 0.52, 0.45];
  let swellEnergySum = 0;

  for (let i = 0; i < swellCount; i++) {
    const w = swellWeights[i] * (0.82 + 0.36 * rng());
    swellEnergySum += w * w;
    const wl = swellWavelengths[i] * (0.9 + 0.2 * rng());
    const omegaRaw = Math.sqrt((2.0 * Math.PI * GRAVITY) / wl);
    const dir = swellRad + swellDirOffsets[i] + (rng() - 0.5) * 0.22;
    rawSwellWaves.push({
      omegaRaw,
      dir,
      unnormAmp: w,
      phase: rng() * Math.PI * 2
    });
  }

  const targetSwellRmsSq = (swellHeight * swellHeight) / 8.0;
  const swellScale = swellEnergySum > 0 ? Math.sqrt(targetSwellRmsSq / swellEnergySum) : 0;

  const combined = [
    ...rawWindWaves.map((w) => ({ ...w, amp: w.unnormAmp * windScale, isSwell: false })),
    ...rawSwellWaves.map((w) => ({ ...w, amp: w.unnormAmp * swellScale, isSwell: true }))
  ];

  // 按波长从长到短排序
  combined.sort((a, b) => a.omegaRaw - b.omegaRaw);

  const waves = [];
  const maxTotalSteepness = 0.74;
  const rawSteepnessList = [];
  let steepnessSum = 0;

  for (let i = 0; i < combined.length; i++) {
    const item = combined[i];
    const quantStep = (2 * Math.PI) / LOOP_PERIOD;
    const omega = Math.max(quantStep * 10, Math.round(item.omegaRaw / quantStep) * quantStep);
    const k = (omega * omega) / GRAVITY;
    const baseQ = item.isSwell ? 0.58 * choppiness : 0.88 * choppiness;
    const s = baseQ * k * item.amp;
    rawSteepnessList.push({ omega, k, s, baseQ, item });
    steepnessSum += s;
  }

  const steepScale = steepnessSum > maxTotalSteepness ? maxTotalSteepness / steepnessSum : 1.0;

  for (let i = 0; i < rawSteepnessList.length; i++) {
    const { omega, k, baseQ, item } = rawSteepnessList[i];
    const dx = Math.cos(item.dir);
    const dz = Math.sin(item.dir);
    const amp = item.amp;
    const steepness = k * amp > 1e-6 ? Math.min(0.95, baseQ * steepScale) : 0.0;

    waves.push({
      dx,
      dz,
      k,
      omega,
      amp,
      phase: item.phase,
      steepness,
      wavelength: (2 * Math.PI) / k
    });
  }

  let totalAmpSq = 0;
  let maxCrestHeight = 0;
  for (const w of waves) {
    totalAmpSq += w.amp * w.amp;
    maxCrestHeight += w.amp;
  }
  const effectiveHs = 4.0 * Math.sqrt(totalAmpSq / 2.0);

  return {
    waves,
    effectiveHs,
    maxCrestHeight,
    windRad,
    windSpeed,
    choppiness
  };
}

/**
 * 将波谱打包为着色器 Uniform 数组：
 * uWaveA[i] = vec4(dx, dz, k, omega)
 * uWaveB[i] = vec4(amp, phase, steepness, wavelength)
 */
export function packSpectrumUniforms(spectrum) {
  const waveA = new Float32Array(WAVE_COUNT * 4);
  const waveB = new Float32Array(WAVE_COUNT * 4);
  for (let i = 0; i < WAVE_COUNT; i++) {
    const w = spectrum.waves[i];
    const idx = i * 4;
    waveA[idx + 0] = w.dx;
    waveA[idx + 1] = w.dz;
    waveA[idx + 2] = w.k;
    waveA[idx + 3] = w.omega;

    waveB[idx + 0] = w.amp;
    waveB[idx + 1] = w.phase;
    waveB[idx + 2] = w.steepness;
    waveB[idx + 3] = w.wavelength;
  }
  return { waveA, waveB };
}

/**
 * 给定参考坐标 (rx, rz) 与时间 t，计算带波群包络与波脊相位扭曲的 Gerstner 位移与导数
 */
export function evaluateGerstnerAtReference(spectrum, rx, rz, time, maxWaves = WAVE_COUNT) {
  const t = ((time % LOOP_PERIOD) + LOOP_PERIOD) % LOOP_PERIOD;
  const waves = spectrum.waves;
  const count = Math.min(maxWaves, waves.length);

  const { groupEnv, warpX, warpZ } = evaluateSpatialModulation(rx, rz, t);

  let dispX = 0;
  let dispY = 0;
  let dispZ = 0;

  let dXdX = 1.0;
  let dXdZ = 0.0;
  let dZdX = 0.0;
  let dZdZ = 1.0;

  let dYdX = 0.0;
  let dYdZ = 0.0;

  let velX = 0.0;
  let velY = 0.0;
  let velZ = 0.0;

  for (let i = 0; i < count; i++) {
    const w = waves[i];
    if (w.amp < 1e-5) continue;

    // 不同频段受不同程度的波群包络与相位扭曲调制，彻底打破固定波长周期感
    const warpScale = Math.min(0.65, 0.12 + w.k * 1.4);
    const wx = rx + warpX * warpScale;
    const wz = rz + warpZ * warpScale;

    // 每个分量有独立的局部包络偏置，使大浪和小浪在不同空间区域交替出现
    const localGroup = groupEnv * (0.85 + 0.25 * Math.sin(rx * 0.019 * (i % 5 + 1) - rz * 0.017 * (i % 3 + 1) + w.phase));
    const a = w.amp * localGroup;

    const theta = w.k * (w.dx * wx + w.dz * wz) - w.omega * t + w.phase;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const qa = w.steepness * a;
    const ka = w.k * a;
    const qka = w.steepness * ka;

    dispX -= w.dx * qa * s;
    dispZ -= w.dz * qa * s;
    dispY += a * c;

    dXdX -= w.dx * w.dx * qka * c;
    dXdZ -= w.dx * w.dz * qka * c;
    dZdX -= w.dz * w.dx * qka * c;
    dZdZ -= w.dz * w.dz * qka * c;

    dYdX -= w.dx * ka * s;
    dYdZ -= w.dz * ka * s;

    const omegaA = w.omega * a;
    const omegaQA = w.omega * qa;
    velX += w.dx * omegaQA * c;
    velZ += w.dz * omegaQA * c;
    velY += omegaA * s;
  }

  const nx = dYdZ * dZdX - dZdZ * dYdX;
  const ny = dZdZ * dXdX - dXdZ * dZdX;
  const nz = dXdZ * dYdX - dYdZ * dXdX;
  const nLen = Math.hypot(nx, ny, nz) || 1.0;

  const jacobian = dXdX * dZdZ - dXdZ * dZdX;

  return {
    dispX,
    dispY,
    dispZ,
    normal: {
      x: nx / nLen,
      y: Math.max(0.05, ny / nLen),
      z: nz / nLen
    },
    jacobian,
    velocity: { x: velX, y: velY, z: velZ }
  };
}

/**
 * 采样世界坐标 (wx, wz) 处的真实海面状态
 */
export function sampleOceanSurface(spectrum, wx, wz, time, tornado = null) {
  let rx = wx;
  let rz = wz;

  for (let iter = 0; iter < 3; iter++) {
    const sample = evaluateGerstnerAtReference(spectrum, rx, rz, time, 20);
    rx = wx - sample.dispX;
    rz = wz - sample.dispZ;
  }

  const res = evaluateGerstnerAtReference(spectrum, rx, rz, time, WAVE_COUNT);
  let height = res.dispY;
  let { x: nx, y: ny, z: nz } = res.normal;
  let { x: vx, y: vy, z: vz } = res.velocity;
  let foam = Math.max(0, Math.min(1, (0.85 - res.jacobian) * 2.2));

  if (tornado && tornado.strength > 0.001) {
    const dx = wx - tornado.x;
    const dz = wz - tornado.z;
    const r2 = dx * dx + dz * dz;
    const r = Math.sqrt(r2) + 1e-4;
    const radius = tornado.radius || 22.0;
    const normR = r / radius;

    const outerMound = 2.4 * Math.exp(-normR * normR * 0.35);
    const coreDip = -3.2 * Math.exp(-normR * normR * 2.8);
    const spiralAngle = Math.atan2(dz, dx) * 3.0 - time * 6.5 + normR * 2.6;
    const spiralWave = 0.65 * Math.sin(spiralAngle) * Math.exp(-normR * 0.65);

    const deltaH = tornado.strength * (outerMound + coreDip + spiralWave);
    height += deltaH;

    const swirlSpeed = tornado.strength * 14.0 * (normR / (1.0 + normR * normR));
    vx += (-dz / r) * swirlSpeed;
    vz += (dx / r) * swirlSpeed;
    foam = Math.min(1.0, foam + tornado.strength * Math.exp(-normR * 0.85) * 0.9);
  }

  const nLen = Math.hypot(nx, ny, nz) || 1.0;
  return {
    height,
    normal: { x: nx / nLen, y: ny / nLen, z: nz / nLen },
    jacobian: res.jacobian,
    foam,
    velocity: { x: vx, y: vy, z: vz },
    reference: { x: rx, z: rz }
  };
}
