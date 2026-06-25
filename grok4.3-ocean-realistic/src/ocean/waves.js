// Gerstner（特罗科伊德）波的纯数学逻辑（Grok 实现）。
// 该模块零依赖 Three.js，可被 Vitest 直接测试。
// CPU 采样（浮标/船只姿态）与 GPU 顶点着色器使用同源参数，保证一致性。

const GRAVITY = 9.81;

// Shader uniform 数组固定长度，两端必须完全一致。
export const MAX_WAVES = 12;

// 轻量确定性 PRNG（mulberry32），同一 seed 产出可复现波谱，便于测试。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 根据风速、风向等生成一组 Gerstner 波。
 * - 主波长 ~ 风速²（深水重力波色散）
 * - 波长几何递减形成长涌 + 短碎浪的自然谱
 * - 方向围绕风向散布，短波更乱
 * - 自动计算 steepness 使 Σ(Q·k·A) ≤ choppiness ≤ 1，防止波形自交
 */
export function createWaveSet(options = {}) {
  const {
    windSpeed = 11,
    windDirection = 128,
    waveCount = MAX_WAVES,
    choppiness = 0.82,
    amplitudeScale = 1.0,
    seed = 202406,
  } = options;

  const count = Math.max(1, Math.min(MAX_WAVES, Math.floor(waveCount)));
  const rand = mulberry32(seed);
  const windRad = (windDirection * Math.PI) / 180;

  // 主波长：与风速平方成正比，范围限制避免极端
  const dominantLength = Math.min(340, Math.max(5.5, (0.68 * windSpeed * windSpeed * 2 * Math.PI) / GRAVITY));
  const slope = 0.028 + 0.03 * Math.min(1.0, windSpeed / 21);

  const waves = [];
  for (let i = 0; i < count; i += 1) {
    const wavelength = dominantLength * Math.pow(0.71, i) * (0.82 + rand() * 0.36);
    const k = (2 * Math.PI) / wavelength;

    const spread = (Math.PI / 3.5) * (0.32 + (i / count) * 0.95);
    const angle = windRad + (rand() * 2 - 1) * spread;

    const amplitude = ((slope * wavelength) / (2 * Math.PI)) * (0.72 + rand() * 0.56) * amplitudeScale;
    const omega = Math.sqrt(GRAVITY * k);
    const phase = rand() * Math.PI * 2;

    waves.push({
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      amplitude,
      wavelength,
      k,
      omega,
      phase,
      steepness: 0, // 稍后统一分配
    });
  }

  // 陡度预算分配：核心安全约束
  const budget = waves.reduce((s, w) => s + w.k * w.amplitude, 0);
  const qScale = budget > 0 ? Math.min(1, choppiness) / budget : 0;
  for (const w of waves) {
    w.steepness = Math.min(1, qScale);
  }

  return waves;
}

/** CPU 端高度采样：给定 waves、在 (x,z) 处 t 时刻的垂直位移。 */
export function sampleHeight(waves, x, z, time) {
  let h = 0;
  for (const w of waves) {
    const f = w.k * (w.dirX * x + w.dirZ * z) - w.omega * time + w.phase;
    h += w.amplitude * Math.sin(f);
  }
  return h;
}

/**
 * 同时采样高度 + 未归一化的表面法线（Gerstner 公式）。
 * 返回 { y, nx, ny, nz }。
 * 调用方负责归一化法线。
 * 这使得浮动物体能正确倾斜、计算入水法线等。
 */
export function sampleHeightNormal(waves, x, z, time) {
  let height = 0;
  let nx = 0, ny = 1, nz = 0;
  for (const w of waves) {
    const f = w.k * (w.dirX * x + w.dirZ * z) - w.omega * time + w.phase;
    const s = Math.sin(f);
    const c = Math.cos(f);
    height += w.amplitude * s;

    const wa = w.k * w.amplitude;
    nx -= w.dirX * wa * c;
    nz -= w.dirZ * wa * c;
    ny -= w.steepness * wa * s;
  }
  return { y: height, nx, ny, nz };
}

/** 总波幅（任意点理论最大上下幅度，用于 bound 检查）。 */
export function sumAmplitude(waves) {
  return waves.reduce((s, w) => s + w.amplitude, 0);
}

/** 当前实际陡度占用 Σ(Q k A)，必须 ≤ 1。 */
export function steepnessBudget(waves) {
  return waves.reduce((s, w) => s + w.steepness * w.k * w.amplitude, 0);
}

const GRID_PRESETS = {
  low: { size: 620, segments: 120 },
  medium: { size: 620, segments: 240 },
  high: { size: 620, segments: 380 },
};

export function gridForQuality(quality) {
  return GRID_PRESETS[quality] ?? GRID_PRESETS.medium;
}

const SEA_STATES = [
  { max: 0.6, text: '无风镜面' },
  { max: 3.3, text: '轻风微波' },
  { max: 7.8, text: '和风小浪' },
  { max: 13.5, text: '强风中浪' },
  { max: 20.5, text: '大风巨浪' },
  { max: 28, text: '狂风怒涛' },
  { max: Infinity, text: '飓风骇浪' },
];

export function seaStateLabel(windSpeed) {
  const v = Math.max(0, windSpeed);
  for (let i = 0; i < SEA_STATES.length; i += 1) {
    if (v <= SEA_STATES[i].max) {
      return { level: i, text: SEA_STATES[i].text };
    }
  }
  return { level: SEA_STATES.length - 1, text: SEA_STATES[SEA_STATES.length - 1].text };
}
