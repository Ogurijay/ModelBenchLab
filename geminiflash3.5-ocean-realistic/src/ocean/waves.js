// 仿真配置与范围限制
export const SETTINGS_LIMITS = {
  windSpeed: [2, 42],
  swellHeight: [0.1, 3.5],
  choppiness: [0.2, 2.2],
  foamAmount: [0, 1]
};

export const DEFAULT_OCEAN_SETTINGS = {
  windSpeed: 18,
  windDirection: 35, // 角度度数
  swellHeight: 1.8,
  choppiness: 1.25,
  foamAmount: 0.5,
  timeOfDay: 0.25 // 0=清晨, 0.25=正午, 0.5=黄昏, 0.75=深夜
};

// 5重波预设参数 (振幅系数, 波长, 相速度系数, 偏角)
const WAVE_PRESETS = [
  { amplitudeScale: 1.0, wavelength: 38.0, speedScale: 1.0, angleOffset: 0 },
  { amplitudeScale: 0.45, wavelength: 19.0, speedScale: 1.2, angleOffset: 25 },
  { amplitudeScale: 0.25, wavelength: 9.0, speedScale: 1.5, angleOffset: -35 },
  { amplitudeScale: 0.15, wavelength: 4.5, speedScale: 2.0, angleOffset: 65 },
  { amplitudeScale: 0.08, wavelength: 2.2, speedScale: 2.5, angleOffset: -75 }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

// 角度转二维朝向向量
function degreesToVector2(degrees) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians)
  };
}

// 约束设置并合并默认值
export function sanitizeOceanSettings(settings = {}) {
  const merged = { ...DEFAULT_OCEAN_SETTINGS, ...settings };
  return {
    windSpeed: clamp(merged.windSpeed, ...SETTINGS_LIMITS.windSpeed),
    windDirection: Number.isFinite(merged.windDirection) ? merged.windDirection : DEFAULT_OCEAN_SETTINGS.windDirection,
    swellHeight: clamp(merged.swellHeight, ...SETTINGS_LIMITS.swellHeight),
    choppiness: clamp(merged.choppiness, ...SETTINGS_LIMITS.choppiness),
    foamAmount: clamp(merged.foamAmount, ...SETTINGS_LIMITS.foamAmount),
    timeOfDay: clamp(merged.timeOfDay, 0, 1)
  };
}

// 基于当前物理配置生成多重波参数
export function createWaveSet(settings = {}) {
  const opts = sanitizeOceanSettings(settings);
  const waveCount = WAVE_PRESETS.length;
  
  // 随着风速增大，波浪的传播相速度成比例增加
  const speedFactor = 0.5 + opts.windSpeed / 30;

  return WAVE_PRESETS.map((preset) => {
    const angle = opts.windDirection + preset.angleOffset;
    const dirVec = degreesToVector2(angle);
    
    // 波数 k = 2 * PI / L
    const k = (2 * Math.PI) / preset.wavelength;
    
    // 陡度因子 Qi (控制波峰尖锐度)，确保合位移 Qi * Ai * k <= 1 以免顶点交叉重叠
    // 我们设定 Qi = choppiness / (k * waveCount)
    const amplitude = opts.swellHeight * preset.amplitudeScale;
    const q = opts.choppiness / (k * waveCount);

    return {
      amplitude: Number(amplitude.toFixed(4)),
      wavelength: preset.wavelength,
      speed: Number((preset.speedScale * speedFactor * 3.5).toFixed(4)), // 物理相速度
      direction: dirVec,
      k,
      q
    };
  });
}

// 给定原始顶点位置，求 Gerstner 波位移及偏导数
function evaluateWaves(x, z, time, waves) {
  let dx = 0;
  let dy = 0;
  let dz = 0;

  // 偏导数累加项
  // Tangent = d(Position)/dx = (1 - sum(q * A * k * dx*dx * sin), sum(A * k * dx * cos), -sum(q * A * k * dx * dz * sin))
  // Bitangent = d(Position)/dz = (-sum(q * A * k * dx * dz * sin), sum(A * k * dz * cos), 1 - sum(q * A * k * dz*dz * sin))
  let tx_x = 0; // sum(q * A * k * dx * dx * sin)
  let tx_y = 0; // sum(A * k * dx * cos)
  let tx_z = 0; // sum(q * A * k * dx * dz * sin)
  
  let tz_y = 0; // sum(A * k * dz * cos)
  let tz_z = 0; // sum(q * A * k * dz * dz * sin)

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    const dx_dir = wave.direction.x;
    const dz_dir = wave.direction.y; // 2D y 对应 3D z
    
    // dot(p, dir) * k + omega * t
    const phase = (x * dx_dir + z * dz_dir) * wave.k + time * wave.speed;
    const cosVal = Math.cos(phase);
    const sinVal = Math.sin(phase);

    const qAk = wave.q * wave.amplitude * wave.k;
    const Ak = wave.amplitude * wave.k;

    // 顶点物理位移
    dx += wave.q * wave.amplitude * dx_dir * cosVal;
    dz += wave.q * wave.amplitude * dz_dir * cosVal;
    dy += wave.amplitude * sinVal;

    // 导数累加项
    tx_x += qAk * dx_dir * dx_dir * sinVal;
    tx_y += Ak * dx_dir * cosVal;
    tx_z += qAk * dx_dir * dz_dir * sinVal;

    tz_y += Ak * dz_dir * cosVal;
    tz_z += qAk * dz_dir * dz_dir * sinVal;
  }

  // 构筑切向量与副切向量
  const tangent = {
    x: 1 - tx_x,
    y: tx_y,
    z: -tx_z
  };

  const bitangent = {
    x: -tx_z,
    y: tz_y,
    z: 1 - tz_z
  };

  // 叉乘求得解析法线 Normal = Bitangent x Tangent
  const nx = bitangent.y * tangent.z - bitangent.z * tangent.y;
  const ny = bitangent.z * tangent.x - bitangent.x * tangent.z;
  const nz = bitangent.x * tangent.y - bitangent.y * tangent.x;

  // 归一化法线
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1.0;

  return {
    position: {
      x: x + dx,
      y: dy,
      z: z + dz
    },
    normal: {
      x: nx / len,
      y: ny / len,
      z: nz / len
    }
  };
}

/**
 * 核心接口：获取给定世界水平坐标 (xWorld, zWorld) 处，水面的高度 Y 和解析法线
 * 采用定点迭代法 (Fixed-point iteration) 逆解海浪横向位移
 */
export function sampleWavePositionAndNormal(xWorld, zWorld, time, settings = {}) {
  const waves = createWaveSet(settings);
  
  // 初始化原始坐标
  let xOrig = xWorld;
  let zOrig = zWorld;

  // 进行 3 次反向迭代，精度已非常高
  for (let iter = 0; iter < 3; iter++) {
    const result = evaluateWaves(xOrig, zOrig, time, waves);
    const errX = xWorld - result.position.x;
    const errZ = zWorld - result.position.z;
    xOrig += errX;
    zOrig += errZ;
  }

  // 用解出的原始坐标算得最终位移和精确法线
  return evaluateWaves(xOrig, zOrig, time, waves);
}

// 返回水面网格几何体的段数配置
export function getOceanGeometryConfig(quality = 'high') {
  const configs = {
    low: { size: 200, segments: 100 },
    medium: { size: 200, segments: 160 },
    high: { size: 200, segments: 240 }
  };
  return configs[quality] || configs.high;
}
