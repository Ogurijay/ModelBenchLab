// 中央响应式参数存储：UI 面板、window.__bench 与三维体积渲染管线共用唯一数据源。

export const QUALITY_PRESETS = {
  low:    { key: 'low',    index: 0, label: '低 (32步)',  steps: 32,  dprCap: 1.0,  shadowMapSize: 0    },
  medium: { key: 'medium', index: 1, label: '中 (48步)',  steps: 48,  dprCap: 1.25, shadowMapSize: 512  },
  high:   { key: 'high',   index: 2, label: '高 (68步)',  steps: 68,  dprCap: 1.5,  shadowMapSize: 1024 },
  ultra:  { key: 'ultra',  index: 3, label: '极 (104步)', steps: 104, dprCap: 2.0,  shadowMapSize: 2048 },
};

export const QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];

export const SPECTRUM_PRESETS = [
  { id: 0, label: '标准松木', desc: '1450°C 经典黑体辐射三层木柴火' },
  { id: 1, label: '锻炉炽焰', desc: '1750°C 富氧白炽金蓝高温炉火' },
  { id: 2, label: '铜盐青焰', desc: 'Cu²⁺ 离子激发翡翠碧绿奇幻焰' },
  { id: 3, label: '幽冥魂火', desc: '深渊钴蓝与紫罗兰冷冽灵火' },
];

export const params = {
  intensity: 1.05,     // 火势强度 [0.30, 1.80]
  turbulence: 1.00,    // 湍流卷曲 [0.00, 2.00]
  windAngle: 25,       // 风向角度 [-180, 180] 度
  windStrength: 0.24,  // 风力大小 [0.00, 1.00]
  quality: 'high',     // 渲染质量档位: 'low' | 'medium' | 'high' | 'ultra'
  spectrum: 0,         // 焰色光谱: 0 | 1 | 2 | 3
  paused: false,       // 模拟暂停
  autoOrbit: false,    // 自动环绕观察模式
};

const RANGES = {
  intensity:    [0.3, 1.8],
  turbulence:   [0.0, 2.0],
  windAngle:    [-180, 180],
  windStrength: [0.0, 1.0],
  spectrum:     [0, 3],
};

const listeners = new Set();

/** 订阅参数变更，返回取消订阅函数 */
export function onParamChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 归一化质量档位输入（支持 'low'..'ultra' 或数字索引 0..3） */
export function normalizeQuality(val) {
  if (typeof val === 'string' && val in QUALITY_PRESETS) return val;
  if (Number.isInteger(val) && val >= 0 && val < QUALITY_ORDER.length) {
    return QUALITY_ORDER[val];
  }
  return null;
}

/** 唯一参数写入口：校验并钳制范围，通知所有订阅者 */
export function setParam(key, rawValue) {
  // 兼容别名 wind -> windStrength
  const targetKey = key === 'wind' ? 'windStrength' : key;
  if (!(targetKey in params)) {
    throw new Error(`未知参数: ${key}`);
  }

  let value = rawValue;
  if (targetKey === 'quality') {
    const q = normalizeQuality(rawValue);
    if (!q) throw new Error(`未知质量档位: ${rawValue}`);
    value = q;
  } else if (targetKey === 'paused' || targetKey === 'autoOrbit') {
    value = Boolean(rawValue);
  } else if (targetKey === 'spectrum') {
    const idx = Math.round(Number(rawValue));
    if (!Number.isFinite(idx)) throw new Error('spectrum 需为整数');
    value = Math.min(RANGES.spectrum[1], Math.max(RANGES.spectrum[0], idx));
  } else {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) throw new Error(`参数 ${targetKey} 需为有效数值`);
    const [lo, hi] = RANGES[targetKey];
    value = Math.min(hi, Math.max(lo, num));
  }

  if (params[targetKey] === value) return value;
  params[targetKey] = value;
  for (const cb of listeners) {
    cb(targetKey, value);
  }
  return value;
}

/** 批量设置参数（兼容 setParameters({ intensity, turbulence, wind, quality }) 调用） */
export function setParameters(patch = {}) {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      try {
        setParam(k, v);
      } catch {
        // 忽略未知可选字段
      }
    }
  }
  return { ...params };
}

/** 计算当前水平风向量 [wx, wz]（世界 XZ 平面） */
export function windVec() {
  const rad = (params.windAngle * Math.PI) / 180;
  return [
    Math.cos(rad) * params.windStrength,
    Math.sin(rad) * params.windStrength,
  ];
}

/** 获取当前核心估算焰温（摄氏度） */
export function getCoreTemperatureCelsius(boost = 0) {
  const base = params.spectrum === 1 ? 1380 : 1160;
  return Math.round(base + (params.intensity + boost * 0.45) * 240);
}
