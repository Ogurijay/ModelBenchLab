// 真实太阳方位计算(曼哈顿纬度 40.74°N)。
// 高度角 sin(el) = sinφ·sinδ + cosφ·cosδ·cos(H),H 为时角(每小时 15°)。
// 纯函数、无 three 依赖,可单元测试 —— mission 要求的"真实公式"之一。

const D2R = Math.PI / 180;

export function sunDirection(hours, latDeg = 40.74, declDeg = 12) {
  const phi = latDeg * D2R;
  const decl = declDeg * D2R;
  const H = (hours - 12) * 15 * D2R; // 时角:正午为 0,下午为正

  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  // 方位角:自正南向西为正
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi));

  // 世界系:+x 东,+z 南,+y 上;返回指向太阳的单位向量
  const cosEl = Math.cos(el);
  return {
    x: -Math.sin(az) * cosEl,
    y: sinEl,
    z: Math.cos(az) * cosEl,
    elevation: el,
    azimuth: az,
  };
}
