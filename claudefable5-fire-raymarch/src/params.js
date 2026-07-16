// 中央参数状态:UI、__bench、渲染管线共用同一份,单向数据流。
// setParam() 是唯一写入口,订阅者(shader uniform / 灯光 / 粒子 / UI 回显)按 key 响应。

export const QUALITY_PRESETS = {
  low:    { label: '低',  steps: 28, dprCap: 1.0,  shadow: 0    },
  medium: { label: '中',  steps: 40, dprCap: 1.25, shadow: 512  },
  high:   { label: '高',  steps: 56, dprCap: 1.5,  shadow: 1024 },
  ultra:  { label: '极',  steps: 88, dprCap: 2.0,  shadow: 2048 },
};

export const params = {
  intensity: 1.0,      // 火势 0.3–1.8:火焰高度/密度/亮度、火光强度、火星量
  turbulence: 1.0,     // 湍流 0–2:域扭曲幅度与细节增益
  windAngle: 25,       // 风向 -180–180(度,0 = +X 方向)
  windStrength: 0.25,  // 风力 0–1:火焰倾斜、烟羽漂移、火星横移
  quality: 'high',     // 渲染质量档:单调改变步进数 / 像素比 / 阴影分辨率
  paused: false,       // 暂停:冻结模拟时间,渲染与环绕视角照常
};

const RANGES = {
  intensity:    [0.3, 1.8],
  turbulence:   [0, 2],
  windAngle:    [-180, 180],
  windStrength: [0, 1],
};

const listeners = new Set();

/** 订阅参数变化;回调收到 (key, value)。返回退订函数。 */
export function onParamChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 唯一写入口:钳制取值范围,广播变更。返回实际生效值。 */
export function setParam(key, value) {
  if (!(key in params)) throw new Error(`未知参数: ${key}`);
  if (key === 'quality') {
    if (!(value in QUALITY_PRESETS)) throw new Error(`未知质量档: ${value}`);
  } else if (key === 'paused') {
    value = !!value;
  } else {
    value = Number(value);
    if (!Number.isFinite(value)) throw new Error(`参数 ${key} 需为数值`);
    const [lo, hi] = RANGES[key];
    value = Math.min(hi, Math.max(lo, value));
  }
  if (params[key] === value) return value;
  params[key] = value;
  for (const cb of listeners) cb(key, value);
  return value;
}

/** 风向量(XZ 平面单位向量 × 风力),shader 与粒子共用同一定义。 */
export function windVec() {
  const a = (params.windAngle * Math.PI) / 180;
  return [Math.cos(a) * params.windStrength, Math.sin(a) * params.windStrength];
}
