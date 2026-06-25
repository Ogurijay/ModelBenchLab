// Gerstner（特罗科伊德）波的纯数学逻辑。
// 这个模块不依赖 Three.js，CPU 端用它做测试和 HUD 读数，
// GPU 顶点着色器使用同一组参数做位移，保证两边一致。

const GRAVITY = 9.81;

// shader 中 uniform 数组的固定长度，两边必须一致。
export const MAX_WAVES = 12;

// mulberry32：小巧的确定性伪随机数生成器，保证同一种子产出相同波谱。
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
 * 根据风参数生成一组 Gerstner 波。
 * 主波长由风速决定（深水重力波近似 L ∝ v²/g），
 * 其余波按几何级数缩短并围绕风向散开，模拟海浪谱。
 */
export function createWaveSet(options = {}) {
  const {
    windSpeed = 9, // 风速 m/s
    windDirection = 0, // 风向角度，0 表示 +x 方向，逆时针为正
    waveCount = MAX_WAVES,
    choppiness = 0.75, // 0..1，浪尖锐度（水平挤压强度）
    amplitudeScale = 1, // 波幅整体缩放
    seed = 1337,
  } = options;

  const count = Math.max(1, Math.min(MAX_WAVES, Math.floor(waveCount)));
  const rand = mulberry32(seed);
  const windRad = (windDirection * Math.PI) / 180;

  // 主波长：风速越大波越长，限制在 [6, 320] 米避免极端值。
  const dominantLength = Math.min(320, Math.max(6, (0.7 * windSpeed * windSpeed * 2 * Math.PI) / GRAVITY));
  // 整体坡度（波幅/波长比）随风速温和增长，控制海面不至于失真。
  const slope = 0.03 + 0.028 * Math.min(1, windSpeed / 22);

  const waves = [];
  for (let i = 0; i < count; i += 1) {
    // 波长几何递减：长涌浪 + 短碎浪叠加。
    const wavelength = dominantLength * Math.pow(0.72, i) * (0.85 + rand() * 0.3);
    const k = (2 * Math.PI) / wavelength;
    // 长波方向更集中于风向，短波散布更宽。
    const spread = (Math.PI / 3.6) * (0.35 + (i / count) * 0.9);
    const angle = windRad + (rand() * 2 - 1) * spread;
    const amplitude = ((slope * wavelength) / (2 * Math.PI)) * (0.75 + rand() * 0.5) * amplitudeScale;
    const omega = Math.sqrt(GRAVITY * k); // 深水色散关系
    const phase = rand() * Math.PI * 2;

    waves.push({
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      amplitude,
      wavelength,
      k,
      omega,
      phase,
      steepness: 0, // 占位，下面统一按预算分配
    });
  }

  // 陡度安全约束：保证 Σ Q·k·A ≤ choppiness ≤ 1，否则 Gerstner 波会自交打结。
  const budget = waves.reduce((s, w) => s + w.k * w.amplitude, 0);
  const qScale = budget > 0 ? Math.min(1, choppiness) / budget : 0;
  for (const w of waves) {
    w.steepness = Math.min(1, qScale);
  }

  return waves;
}

/** 采样 (x, z) 处 time 时刻的海面高度（只取垂直分量，供测试和浮标类用途）。 */
export function sampleHeight(waves, x, z, time) {
  let height = 0;
  for (const w of waves) {
    const f = w.k * (w.dirX * x + w.dirZ * z) - w.omega * time + w.phase;
    height += w.amplitude * Math.sin(f);
  }
  return height;
}

/** 总波幅，是任意点高度的上界。 */
export function sumAmplitude(waves) {
  return waves.reduce((s, w) => s + w.amplitude, 0);
}

/** 当前陡度预算 Σ Q·k·A，必须 ≤ 1。 */
export function steepnessBudget(waves) {
  return waves.reduce((s, w) => s + w.steepness * w.k * w.amplitude, 0);
}

const GRID_PRESETS = {
  low: { size: 640, segments: 128 },
  medium: { size: 640, segments: 256 },
  high: { size: 640, segments: 400 },
};

/** 海面网格配置；未知档位回退到 medium。 */
export function gridForQuality(quality) {
  return GRID_PRESETS[quality] ?? GRID_PRESETS.medium;
}

const SEA_STATES = [
  { max: 0.5, text: '无风镜面' },
  { max: 3.4, text: '轻风微波' },
  { max: 8, text: '和风小浪' },
  { max: 13.8, text: '强风中浪' },
  { max: 20.8, text: '大风巨浪' },
  { max: 28.5, text: '狂风怒涛' },
  { max: Infinity, text: '飓风骇浪' },
];

/** 按风速给出海况等级和中文描述（粗略对应蒲福风级分段）。 */
export function seaStateLabel(windSpeed) {
  const v = Math.max(0, windSpeed);
  for (let level = 0; level < SEA_STATES.length; level += 1) {
    if (v <= SEA_STATES[level].max) {
      return { level, text: SEA_STATES[level].text };
    }
  }
  return { level: SEA_STATES.length - 1, text: SEA_STATES[SEA_STATES.length - 1].text };
}
