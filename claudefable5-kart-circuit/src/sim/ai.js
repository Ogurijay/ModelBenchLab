// AI 驾驶控制器：朝中心线前瞻点转向，弯道角差过大时收油。

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function createAiController(track, { lookahead = 14, steerGain = 2.4 } = {}) {
  return function control(kart) {
    const near = track.nearest(kart.x, kart.z);
    const target = track.pointAt(near.s + lookahead);
    const desired = Math.atan2(target.x - kart.x, target.z - kart.z);
    const diff = normalizeAngle(desired - kart.heading);
    const steer = clamp(diff * steerGain, -1, 1);
    // 弯道角差越大越收油，避免冲出赛道。
    const throttle = Math.abs(diff) > 0.85 ? 0.3 : 1;
    return { throttle, steer, drift: false };
  };
}
