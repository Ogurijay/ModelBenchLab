// 实体运动 —— 固定步长 + 分块扫掠 + 逐轴滑动 + 穿门变换。
//
// 每个物理子步再按位移切成 ≤9cm 的小块推进,好处有二:
//   ① 高速穿门(飞跃出口 15 m/s 级)不会一步跨过门面而漏检;
//   ② 传送发生在真实的越面时刻,剩余位移在门另一侧继续走完,视觉上完全连续。
import { APERTURE } from './world.js';
import { localizePoint, throughPoint, throughDir } from '../core/transform.js';

export const FIXED_DT = 1 / 120;
export const GRAVITY = 18;
export const STEP_UP = 0.5;
const MAX_CHUNK = 0.09;
const SKIN = 1e-3;
const MAX_CLAMP = 0.8; // 单次轴向钳制的位移上限;超过就判定为异常嵌入,回退而不是瞬移

export function makeEntity(pos, half, probeOffset = [0, 0, 0]) {
  return {
    pos: [pos[0], pos[1], pos[2]],
    vel: [0, 0, 0],
    half: [half[0], half[1], half[2]],
    probeOffset: [probeOffset[0], probeOffset[1], probeOffset[2]],
    onGround: false,
  };
}

export const probePoint = (e) => [
  e.pos[0] + e.probeOffset[0],
  e.pos[1] + e.probeOffset[1],
  e.pos[2] + e.probeOffset[2],
];

export const entityBox = (e) => ({
  min: [e.pos[0] - e.half[0], e.pos[1] - e.half[1], e.pos[2] - e.half[2]],
  max: [e.pos[0] + e.half[0], e.pos[1] + e.half[1], e.pos[2] + e.half[2]],
});

function firstOverlap(e, brushes) {
  const p = e.pos;
  const h = e.half;
  for (let i = 0; i < brushes.length; i++) {
    const b = brushes[i];
    if (
      p[0] - h[0] < b.max[0] && p[0] + h[0] > b.min[0] &&
      p[1] - h[1] < b.max[1] && p[1] + h[1] > b.min[1] &&
      p[2] - h[2] < b.max[2] && p[2] + h[2] > b.min[2]
    ) return b;
  }
  return null;
}

export const isOverlapping = (e, brushes) => firstOverlap(e, brushes) !== null;

/** 已嵌入实体时沿「最小平移轴」温和推出(带上限,绝不横跨整块墙) */
export function resolvePenetration(e, brushes, maxPush = 0.6) {
  for (let iter = 0; iter < 4; iter++) {
    const hit = firstOverlap(e, brushes);
    if (!hit) return true;
    let bestAxis = 1;
    let bestPush = Infinity;
    for (let a = 0; a < 3; a++) {
      const pushPos = hit.max[a] - (e.pos[a] - e.half[a]);
      const pushNeg = (e.pos[a] + e.half[a]) - hit.min[a];
      const p = Math.min(pushPos, pushNeg);
      if (p < Math.abs(bestPush)) {
        bestAxis = a;
        bestPush = pushPos < pushNeg ? p : -p;
      }
    }
    if (!Number.isFinite(bestPush) || Math.abs(bestPush) > maxPush) return false;
    e.pos[bestAxis] += bestPush + Math.sign(bestPush) * SKIN;
    if (Math.sign(e.vel[bestAxis]) === -Math.sign(bestPush)) e.vel[bestAxis] = 0;
  }
  return !firstOverlap(e, brushes);
}

/** 沿指定方向逐步挤出(传送落点贴墙时用),失败再退回最小平移轴 */
export function pushOutAlong(e, brushes, dirs, maxDist = 1.2) {
  if (!firstOverlap(e, brushes)) return true;
  const origin = [e.pos[0], e.pos[1], e.pos[2]];
  for (const d of dirs) {
    for (let s = 0.05; s <= maxDist; s += 0.05) {
      e.pos[0] = origin[0] + d[0] * s;
      e.pos[1] = origin[1] + d[1] * s;
      e.pos[2] = origin[2] + d[2] * s;
      if (!firstOverlap(e, brushes)) return true;
    }
  }
  e.pos[0] = origin[0];
  e.pos[1] = origin[1];
  e.pos[2] = origin[2];
  return resolvePenetration(e, brushes);
}

function sweepAxis(e, axis, delta, brushes, allowStep, grounded) {
  if (delta === 0) return;
  const before = e.pos[axis];
  e.pos[axis] += delta;
  for (let iter = 0; iter < 4; iter++) {
    const hit = firstOverlap(e, brushes);
    if (!hit) return;
    const half = e.half[axis];
    if (axis === 1) {
      const target = delta < 0 ? hit.max[1] + half + SKIN : hit.min[1] - half - SKIN;
      if (Math.abs(target - e.pos[1]) > MAX_CLAMP) { e.pos[1] = before; e.vel[1] = 0; return; }
      if (delta < 0) e.onGround = true;
      e.pos[1] = target;
      e.vel[1] = 0;
      continue;
    }
    // 水平受阻:着地状态下先尝试上台阶(空中不救援,跳跃距离不会被地形白送)
    if (allowStep && grounded) {
      const feet = e.pos[1] - e.half[1];
      const rise = hit.max[1] - feet;
      if (rise > 0 && rise <= STEP_UP) {
        const savedY = e.pos[1];
        e.pos[1] = hit.max[1] + e.half[1] + SKIN;
        if (!firstOverlap(e, brushes)) return;
        e.pos[1] = savedY;
      }
    }
    const target = delta > 0 ? hit.min[axis] - half - SKIN : hit.max[axis] + half + SKIN;
    if (Math.abs(target - e.pos[axis]) > MAX_CLAMP) { e.pos[axis] = before; e.vel[axis] = 0; return; }
    e.pos[axis] = target;
    e.vel[axis] = 0;
  }
}

/** 脚下探针:比依赖竖直碰撞更稳(静止站立时竖直位移几乎为 0) */
export function groundProbe(e, brushes) {
  if (e.vel[1] > 0.05) return false;
  const p = e.pos;
  const h = e.half;
  const min = [p[0] - h[0] + 0.02, p[1] - h[1] - 0.06, p[2] - h[2] + 0.02];
  const max = [p[0] + h[0] - 0.02, p[1] - h[1] + 0.02, p[2] + h[2] - 0.02];
  for (const b of brushes) {
    if (
      min[0] < b.max[0] && max[0] > b.min[0] &&
      min[1] < b.max[1] && max[1] > b.min[1] &&
      min[2] < b.max[2] && max[2] > b.min[2]
    ) return true;
  }
  return false;
}

function crossingPortal(portals, p0, p1) {
  for (const p of portals) {
    if (!p.link) continue;
    const z0 = localizePoint(p.frame, p0)[2];
    const z1 = localizePoint(p.frame, p1)[2];
    if (!(z0 > 0 && z1 <= 0)) continue;
    const denom = z0 - z1;
    const t = denom > 1e-9 ? z0 / denom : 0;
    const at = [
      p0[0] + (p1[0] - p0[0]) * t,
      p0[1] + (p1[1] - p0[1]) * t,
      p0[2] + (p1[2] - p0[2]) * t,
    ];
    const l = localizePoint(p.frame, at);
    if (Math.abs(l[0]) <= APERTURE.hx && Math.abs(l[1]) <= APERTURE.hy) return p;
  }
  return null;
}

/** 穿门:位置与速度按冻结变换映射(模长不变) */
export function teleportEntity(e, from, to) {
  e.pos = throughPoint(from.frame, to.frame, e.pos);
  e.vel = throughDir(from.frame, to.frame, e.vel);
}

/**
 * 推进一个物理子步。
 * ctx = { brushes, portals, grounded, allowStep, onTeleport(from,to) }
 */
export function stepEntity(e, dt, ctx) {
  const brushes = ctx.brushes;
  const speed = Math.hypot(e.vel[0], e.vel[1], e.vel[2]);
  const chunks = Math.min(16, Math.max(1, Math.ceil((speed * dt) / MAX_CHUNK)));
  const h = dt / chunks;
  let teleports = 0;
  for (let i = 0; i < chunks; i++) {
    const p0 = probePoint(e);
    sweepAxis(e, 0, e.vel[0] * h, brushes, ctx.allowStep, ctx.grounded);
    sweepAxis(e, 2, e.vel[2] * h, brushes, ctx.allowStep, ctx.grounded);
    sweepAxis(e, 1, e.vel[1] * h, brushes, false, false);
    if (ctx.portals && ctx.portals.length && teleports < 4) {
      const hitPortal = crossingPortal(ctx.portals, p0, probePoint(e));
      if (hitPortal) {
        teleports++;
        const to = hitPortal.link;
        teleportEntity(e, hitPortal, to);
        if (ctx.onTeleport) ctx.onTeleport(hitPortal, to);
      }
    }
  }
  return teleports;
}
