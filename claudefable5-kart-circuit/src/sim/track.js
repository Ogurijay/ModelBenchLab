// 纯逻辑赛道模块：不依赖 three.js，便于单元测试。
// 赛道由闭合 Catmull-Rom 样条采样而成，坐标在 XZ 平面，单位为米。

export const DEFAULT_CONTROL_POINTS = [
  { x: 0, z: 70 },
  { x: 42, z: 62 },
  { x: 66, z: 30 },
  { x: 52, z: -4 },
  { x: 74, z: -34 },
  { x: 56, z: -68 },
  { x: 12, z: -72 },
  { x: -18, z: -50 },
  { x: -54, z: -70 },
  { x: -84, z: -40 },
  { x: -68, z: -6 },
  { x: -80, z: 30 },
  { x: -50, z: 62 },
];

export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z:
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

export function createTrack({
  controlPoints = DEFAULT_CONTROL_POINTS,
  samplesPerSegment = 14,
  halfWidth = 9,
} = {}) {
  const n = controlPoints.length;
  const points = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = controlPoints[(i - 1 + n) % n];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % n];
    const p3 = controlPoints[(i + 2) % n];
    for (let j = 0; j < samplesPerSegment; j += 1) {
      points.push(catmullRom(p0, p1, p2, p3, j / samplesPerSegment));
    }
  }

  const count = points.length;
  const cumulative = new Array(count).fill(0);
  let total = 0;
  for (let i = 1; i <= count; i += 1) {
    const a = points[i - 1];
    const b = points[i % count];
    total += Math.hypot(b.x - a.x, b.z - a.z);
    if (i < count) cumulative[i] = total;
  }

  const track = { points, cumulative, total, halfWidth };

  // 第 index 个采样点处的单位切线方向。
  track.directionAt = (index) => {
    const a = points[((index % count) + count) % count];
    const b = points[(((index + 1) % count) + count) % count];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  };

  // 朝向角：0 表示 +Z，与 three.js 的 rotation.y 约定一致。
  track.headingAt = (index) => {
    const d = track.directionAt(index);
    return Math.atan2(d.x, d.z);
  };

  // 沿赛道里程 s（米）取中心线上的点，s 自动取模。
  track.pointAt = (s) => {
    let dist = ((s % total) + total) % total;
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cumulative[mid] <= dist) lo = mid;
      else hi = mid - 1;
    }
    const a = points[lo];
    const b = points[(lo + 1) % count];
    const segLen = (lo + 1 < count ? cumulative[lo + 1] : total) - cumulative[lo] || 1;
    const t = (dist - cumulative[lo]) / segLen;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, index: lo };
  };

  // 最近采样点查询（采样数 ~200，线性扫描足够快）。
  track.nearest = (x, z) => {
    let best = 0;
    let bestSq = Infinity;
    for (let i = 0; i < count; i += 1) {
      const dx = x - points[i].x;
      const dz = z - points[i].z;
      const sq = dx * dx + dz * dz;
      if (sq < bestSq) {
        bestSq = sq;
        best = i;
      }
    }
    return { index: best, dist: Math.sqrt(bestSq), s: cumulative[best] };
  };

  return track;
}

export function isOnTrack(track, x, z, margin = 0.5) {
  return track.nearest(x, z).dist <= track.halfWidth + margin;
}
