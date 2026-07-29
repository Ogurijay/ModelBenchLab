// 轴对齐盒(brush)几何 —— 纯函数,零依赖。
// 本作的关卡、碰撞、门口开孔全部建立在「盒的布尔减法」上:
// 门洞 / 窗洞 / 传送门开口都是从实体盒里真减掉一块,
// 因此碰撞体与可通行区域天然一致,不需要任何「临时忽略某面墙」的动态特例。

export const EPS = 1e-6;

export const makeBox = (min, max, mat = 'dark', extra = null) => ({
  min: [min[0], min[1], min[2]],
  max: [max[0], max[1], max[2]],
  mat,
  ...(extra || {}),
});

export const isDegenerate = (b) =>
  b.max[0] - b.min[0] <= EPS || b.max[1] - b.min[1] <= EPS || b.max[2] - b.min[2] <= EPS;

export function overlaps(aMin, aMax, bMin, bMax) {
  return (
    aMin[0] < bMax[0] && aMax[0] > bMin[0] &&
    aMin[1] < bMax[1] && aMax[1] > bMin[1] &&
    aMin[2] < bMax[2] && aMax[2] > bMin[2]
  );
}

export const boxesOverlap = (a, b) => overlaps(a.min, a.max, b.min, b.max);

export function intersection(a, b) {
  const min = [
    Math.max(a.min[0], b.min[0]),
    Math.max(a.min[1], b.min[1]),
    Math.max(a.min[2], b.min[2]),
  ];
  const max = [
    Math.min(a.max[0], b.max[0]),
    Math.min(a.max[1], b.max[1]),
    Math.min(a.max[2], b.max[2]),
  ];
  if (max[0] - min[0] <= EPS || max[1] - min[1] <= EPS || max[2] - min[2] <= EPS) return null;
  return { min, max };
}

/**
 * 盒减法 b − hole,返回最多 6 块补集盒(保留 b 的材质与附加字段)。
 * 依次沿 X / Y / Z 切:先切掉 hole 之外的两侧,再在中段继续切下一轴。
 */
export function subtractBox(b, hole) {
  const h = intersection(b, hole);
  if (!h) return [b];
  const rest = { ...b };
  delete rest.min;
  delete rest.max;
  const out = [];
  const push = (min, max) => {
    const piece = { min, max, ...rest };
    if (!isDegenerate(piece)) out.push(piece);
  };
  const { min, max } = b;
  // X 两侧
  push([min[0], min[1], min[2]], [h.min[0], max[1], max[2]]);
  push([h.max[0], min[1], min[2]], [max[0], max[1], max[2]]);
  // X 中段内的 Y 两侧
  const x0 = h.min[0], x1 = h.max[0];
  push([x0, min[1], min[2]], [x1, h.min[1], max[2]]);
  push([x0, h.max[1], min[2]], [x1, max[1], max[2]]);
  // XY 中段内的 Z 两侧
  const y0 = h.min[1], y1 = h.max[1];
  push([x0, y0, min[2]], [x1, y1, h.min[2]]);
  push([x0, y0, h.max[2]], [x1, y1, max[2]]);
  return out;
}

/** 对一组盒依次挖去若干洞 */
export function subtractAll(boxes, holes) {
  let cur = boxes;
  for (const hole of holes) {
    const next = [];
    for (const b of cur) {
      if (boxesOverlap(b, hole)) next.push(...subtractBox(b, hole));
      else next.push(b);
    }
    cur = next;
  }
  return cur;
}

/** 射线 vs 盒(slab 法)。返回 { t, normal } 或 null;只认从外部射入。 */
export function rayBox(origin, dir, box) {
  let tEnter = -Infinity;
  let tExit = Infinity;
  let axis = -1;
  let sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) {
      if (origin[i] <= box.min[i] || origin[i] >= box.max[i]) return null;
      continue;
    }
    const inv = 1 / dir[i];
    let t1 = (box.min[i] - origin[i]) * inv;
    let t2 = (box.max[i] - origin[i]) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tEnter) { tEnter = t1; axis = i; sign = s; }
    if (t2 < tExit) tExit = t2;
    if (tEnter > tExit) return null;
  }
  if (tEnter < 0 || axis < 0) return null;
  const normal = [0, 0, 0];
  normal[axis] = sign;
  return { t: tEnter, normal, axis };
}

/** 在一组盒中取最近命中 */
export function raycast(origin, dir, boxes, maxDist = 500) {
  let best = null;
  for (const box of boxes) {
    const hit = rayBox(origin, dir, box);
    if (hit && hit.t <= maxDist && (!best || hit.t < best.t)) {
      best = { box, t: hit.t, normal: hit.normal, axis: hit.axis };
    }
  }
  if (best) {
    best.point = [
      origin[0] + dir[0] * best.t,
      origin[1] + dir[1] * best.t,
      origin[2] + dir[2] * best.t,
    ];
  }
  return best;
}
