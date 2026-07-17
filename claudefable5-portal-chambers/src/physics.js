// 自写物理:AABB 碰撞 / 射线求交 / 实体运动(固定步长,不引物理库)
import { toLocalPoint, toLocalDir } from './portal-math.js';

export const DT = 1 / 120; // 固定物理步长
export const GRAVITY = 16;
export const WALK_SPEED = 5.0;
export const AIR_CAP = 5.0; // 空中操控速度上限(不吞飞跃动量)
export const JUMP_V = 4.8; // 跳高 0.72m;有效跳距(中心 3.0m + AABB 半宽 0.64 + 土狼 0.4)≈4.04m < 4.5m 裂谷 → 必须飞跃
export const STEP_UP = 0.55; // 自动上台阶高度(台阶 0.45)
export const PLAYER_HW = 0.32; // 玩家半宽
export const PLAYER_HH = 0.9; // 玩家半高
export const PLAYER_EYE = 0.72; // 眼睛相对中心高度(眼高 1.62)

// 传送门开口半径(椭圆半宽/半高),与视觉门面一致
export const PORTAL_HX = 0.55;
export const PORTAL_HY = 0.95;

export function aabbOverlap(amin, amax, bmin, bmax) {
  return (
    amin[0] < bmax[0] && amax[0] > bmin[0] &&
    amin[1] < bmax[1] && amax[1] > bmin[1] &&
    amin[2] < bmax[2] && amax[2] > bmin[2]
  );
}

export function pointInBox(p, box, pad = 0) {
  return (
    p[0] > box.min[0] - pad && p[0] < box.max[0] + pad &&
    p[1] > box.min[1] - pad && p[1] < box.max[1] + pad &&
    p[2] > box.min[2] - pad && p[2] < box.max[2] + pad
  );
}

// 射线 vs AABB(slab 法),返回 {t, normal} 或 null
export function rayBox(o, d, box) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (box.min[i] - o[i]) * inv;
    let t2 = (box.max[i] - o[i]) * inv;
    let s = -1; // 从 min 面进入 → 法线指向负方向
    if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin < 0 || axis === -1) return null;
  const normal = [0, 0, 0];
  normal[axis] = sign;
  return { t: tmin, normal };
}

// 在盒列表中找最近命中:返回 {box, t, point, normal} 或 null
export function raycastBoxes(o, d, boxes, maxDist = 200, ignore = null) {
  let best = null;
  for (const box of boxes) {
    if (ignore && ignore.has(box)) continue;
    const hit = rayBox(o, d, box);
    if (hit && hit.t < maxDist && (!best || hit.t < best.t)) {
      best = { box, t: hit.t, normal: hit.normal };
    }
  }
  if (best) {
    best.point = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
  }
  return best;
}

// 实体(玩家/方块)= 中心 pos + 半宽 hw + 半高 hh 的 AABB
export function makeEntity(pos, hw, hh) {
  return { pos: [...pos], vel: [0, 0, 0], hw, hh, onGround: false };
}

const entMin = (e) => [e.pos[0] - e.hw, e.pos[1] - e.hh, e.pos[2] - e.hw];
const entMax = (e) => [e.pos[0] + e.hw, e.pos[1] + e.hh, e.pos[2] + e.hw];

function overlapsAny(e, solids, ignore) {
  const mn = entMin(e), mx = entMax(e);
  for (const s of solids) {
    if (ignore && ignore.has(s)) continue;
    if (aabbOverlap(mn, mx, s.min, s.max)) return s;
  }
  return null;
}

// 活动门对造成的"穿透":实体位于门开口区内时,宿主盒对它失效
// pairActive: 两扇门都已放置;portals: [{frame, hostBox}]
// hh: 实体半高 — 墙面门的纵向窗口按身高收紧(门底高于脚 → 被墙挡住,需跳入,与原作一致)
// vel: 实体速度 — 门面背侧窗口只在"正在向里穿越"(v·N<0)时生效,堵死从门背面步行穿墙
export function portalIgnoreSet(entityPos, vel, portals, pairActive, hh = 0) {
  const ignore = new Set();
  if (!pairActive) return ignore;
  for (const p of portals) {
    if (!p || !p.hostBox) continue;
    const wall = Math.abs(p.frame.N[1]) < 0.5;
    const limY = wall ? Math.min(PORTAL_HY, PORTAL_HY + 0.3 - hh) : PORTAL_HY;
    const l = toLocalPoint(p.frame, entityPos);
    if (Math.abs(l[0]) >= PORTAL_HX || Math.abs(l[1]) >= limY) continue;
    const front = l[2] > -0.05 && l[2] < 1.2; // 正面窗口(靠近/站在门上/穿出)
    const inTransit = l[2] <= -0.05 && l[2] > -1.0 && toLocalDir(p.frame, vel)[2] < -0.05; // 背侧仅限穿越中
    if (front || inTransit) ignore.add(p.hostBox);
  }
  return ignore;
}

// 子步开始前的温和脱嵌:实体已与实体盒重叠(穿透窗口逐步切换所致)时,
// 沿"最小平移轴"推出——绝不按速度符号横跨整块墙瞬移
export function expelFromSolids(e, solids, ignore) {
  for (let iter = 0; iter < 4; iter++) {
    const mn = [e.pos[0] - e.hw, e.pos[1] - e.hh, e.pos[2] - e.hw];
    const mx = [e.pos[0] + e.hw, e.pos[1] + e.hh, e.pos[2] + e.hw];
    let hit = null;
    for (const s of solids) {
      if (ignore && ignore.has(s)) continue;
      if (aabbOverlap(mn, mx, s.min, s.max)) { hit = s; break; }
    }
    if (!hit) return;
    let bestAxis = 1, bestPush = Infinity;
    for (let a = 0; a < 3; a++) {
      const half = a === 1 ? e.hh : e.hw;
      const pushPos = hit.max[a] - (e.pos[a] - half); // 往 + 方向推出量
      const pushNeg = (e.pos[a] + half) - hit.min[a]; // 往 − 方向推出量
      const p = Math.min(pushPos, pushNeg);
      if (p < Math.abs(bestPush)) {
        bestAxis = a;
        bestPush = pushPos < pushNeg ? p : -p;
      }
    }
    if (Math.abs(bestPush) > 1.0) return; // 异常深嵌不硬推,交给后续帧
    e.pos[bestAxis] += bestPush + Math.sign(bestPush) * 1e-3;
    e.vel[bestAxis] = 0;
  }
}

// 传送后脱困:沿候选方向(出口门上向量/法线)逐步推出,直到不与任何实体重叠
export function depenetrate(e, dirs, solids, ignore) {
  if (!overlapsAny(e, solids, ignore)) return true;
  const orig = [...e.pos];
  for (const d of dirs) {
    for (let s = 0.05; s <= 1.25; s += 0.05) {
      e.pos[0] = orig[0] + d[0] * s;
      e.pos[1] = orig[1] + d[1] * s;
      e.pos[2] = orig[2] + d[2] * s;
      if (!overlapsAny(e, solids, ignore)) return true;
    }
  }
  e.pos[0] = orig[0]; e.pos[1] = orig[1]; e.pos[2] = orig[2];
  return false;
}

// 逐轴移动 + 碰撞钳制;水平被挡时尝试自动上台阶
export function moveEntity(e, dt, solids, ignore, allowStepUp) {
  e.onGround = false;
  for (const axis of [0, 2, 1]) {
    if (e.vel[axis] === 0) continue;
    e.pos[axis] += e.vel[axis] * dt;
    const half = axis === 1 ? e.hh : e.hw;
    // 反复解算(角落可能连撞两个盒)
    for (let iter = 0; iter < 4; iter++) {
      const hitBox = overlapsAny(e, solids, ignore);
      if (!hitBox) break;
      if (axis === 1) {
        if (e.vel[1] <= 0) {
          e.pos[1] = hitBox.max[1] + e.hh + 1e-4;
          e.onGround = true;
        } else {
          e.pos[1] = hitBox.min[1] - e.hh - 1e-4;
        }
        e.vel[1] = 0;
      } else {
        // 台阶助爬:障碍顶离脚底 ≤ STEP_UP 且抬升后无碰撞
        const feet = e.pos[1] - e.hh;
        if (allowStepUp && e.vel[1] <= 0 && hitBox.max[1] - feet <= STEP_UP && hitBox.max[1] - feet > 0) {
          const oldY = e.pos[1];
          e.pos[1] = hitBox.max[1] + e.hh + 1e-3;
          if (!overlapsAny(e, solids, ignore)) {
            e.onGround = true;
            continue; // 爬上台阶,保留水平速度
          }
          e.pos[1] = oldY;
        }
        if (e.vel[axis] > 0) e.pos[axis] = hitBox.min[axis] - half - 1e-4;
        else e.pos[axis] = hitBox.max[axis] + half + 1e-4;
        e.vel[axis] = 0;
        break;
      }
    }
  }
}

// 穿越检测:probe 点(玩家用眼睛,方块用中心)从门正面越过阈值,且横向在开口内、速度朝里
// 返回 true 表示应当执行传送
export function shouldTeleport(portal, probePrev, probeCur, vel, threshold) {
  const f = portal.frame;
  const zPrev = toLocalPoint(f, probePrev)[2];
  const cur = toLocalPoint(f, probeCur);
  if (!(zPrev > threshold && cur[2] <= threshold)) return false;
  if (Math.abs(cur[0]) > PORTAL_HX || Math.abs(cur[1]) > PORTAL_HY + 0.35) return false;
  const vN = toLocalDir(f, vel)[2];
  return vN < -0.05;
}
