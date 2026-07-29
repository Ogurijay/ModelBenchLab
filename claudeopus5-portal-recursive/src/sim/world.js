// 碰撞世界 —— 关卡盒 + 传送门「真开孔」。
//
// 本作的核心取舍:传送门不是靠「临时忽略某面墙」实现的,而是在碰撞世界里
// 把门口那块矩形棱柱从墙体真减掉(布尔减法),于是:
//   · 门口以外的墙面任何时刻都是实心的(不会因为窗口切换把实体挤出地图);
//   · 能不能走进门,由门口是否在脚下高度决定(门底高于脚就得跳,与原作一致);
//   · 门的背面用一块「背板」封住,且只对身处背面的实体生效(正面穿越者永远碰不到它),
//     因此开孔不会变成一条可双向步行的免费通道。
import { makeBox, subtractAll, subtractBox, raycast, boxesOverlap, intersection } from '../core/boxes.js';
import { localizePoint } from '../core/transform.js';

export const APERTURE = { hx: 0.6, hy: 1.0 }; // 门口半宽/半高(1.2m × 2.0m)
const MAX_CARVE_DEPTH = 1.25; // 开孔最深贯穿(超过此厚度的墙不再往里挖)
const PLUG_THICK = 0.3;

/** 门框架(轴对齐)在世界系里的门口棱柱与背板 */
export function aperturePrism(frame, baseSolids) {
  const nAxis = frame.N[0] !== 0 ? 0 : frame.N[1] !== 0 ? 1 : 2;
  const s = frame.N[nAxis] > 0 ? 1 : -1;
  const half = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    half[a] = Math.abs(frame.X[a]) * APERTURE.hx + Math.abs(frame.U[a]) * APERTURE.hy;
  }
  const mk = (fromLocalZ, toLocalZ) => {
    const min = [0, 0, 0];
    const max = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      if (a === nAxis) {
        const p1 = frame.P[a] + s * fromLocalZ;
        const p2 = frame.P[a] + s * toLocalZ;
        min[a] = Math.min(p1, p2);
        max[a] = Math.max(p1, p2);
      } else {
        min[a] = frame.P[a] - half[a];
        max[a] = frame.P[a] + half[a];
      }
    }
    return { min, max };
  };

  // 沿 −N 从门面往里步进,遇到第一个「不在任何实体里」的采样点就停:
  // 只挖穿与门面连续的那层材料。若改成「取所有与探针体相交的盒的最深点」,
  // 一块恰好掠过探针体边缘的地板就会把开孔挖到墙背后的空气里,凭空多出一个陷阱。
  const inSolid = (p) => baseSolids.some((b) =>
    p[0] >= b.min[0] - 1e-4 && p[0] <= b.max[0] + 1e-4 &&
    p[1] >= b.min[1] - 1e-4 && p[1] <= b.max[1] + 1e-4 &&
    p[2] >= b.min[2] - 1e-4 && p[2] <= b.max[2] + 1e-4);
  const STEP = 0.04;
  let depth = 0.12;
  for (let d = 0.02; d <= MAX_CARVE_DEPTH; d += STEP) {
    const p = [
      frame.P[0] - frame.N[0] * d,
      frame.P[1] - frame.N[1] * d,
      frame.P[2] - frame.N[2] * d,
    ];
    if (!inSolid(p)) break;
    depth = Math.min(MAX_CARVE_DEPTH, d + STEP);
  }
  return {
    cut: mk(0.06, -depth),
    plug: mk(-depth, -depth - PLUG_THICK),
    depth,
  };
}

export class World {
  constructor(level) {
    this.level = level;
    // 关卡实体盒先减去门洞 / 窗洞:渲染与碰撞用的是同一批盒,不会出现「看着是洞其实撞墙」
    const solids = (level.solids || []).map((b) => makeBox(b.min, b.max, b.mat, b.extra));
    // overlays 在挖洞之后才叠加:白色面板正好嵌在被挖开的缺口里,不能被同一批 cut 再削掉
    const overlays = (level.overlays || []).map((b) => makeBox(b.min, b.max, b.mat, b.extra));
    this.baseSolids = [...subtractAll(solids, level.cuts || []), ...overlays];
    this.portalFrames = [null, null]; // 0=蓝 1=橙
    this.plugs = [];
    this.solids = this.baseSolids;
  }

  /** 放置 / 清除某色门后重建碰撞几何 */
  setPortalFrame(index, frame) {
    this.portalFrames[index] = frame || null;
    this.rebuild();
  }

  rebuild() {
    let solids = this.baseSolids;
    const plugs = [];
    // 只有两扇门都在场时才真开孔。单扇门不成对、穿越逻辑不会触发,
    // 此时若照样把墙挖穿,玩家就能走进一个「进得去出不来、又不会传送」的墙内空腔。
    const paired = this.portalFrames[0] && this.portalFrames[1];
    if (paired) {
      for (const frame of this.portalFrames) {
        const prism = aperturePrism(frame, this.baseSolids);
        solids = subtractAll(solids, [prism.cut]);
        plugs.push({ ...makeBox(prism.plug.min, prism.plug.max, 'metal'), frame });
      }
    }
    this.solids = solids;
    this.plugs = plugs;
  }

  /** 背板只对「已经在门背面」的实体生效(正面穿越者在越过门面的同一子步就被传走) */
  activePlugs(centerPos, out) {
    for (const plug of this.plugs) {
      if (localizePoint(plug.frame, centerPos)[2] < 0) out.push(plug);
    }
    return out;
  }

  /** 传送门枪射线:打在未开孔的原始几何上(不能穿过自己已经打开的洞) */
  shootRay(origin, dir, extraBlockers, maxDist = 200) {
    const hit = raycast(origin, dir, this.baseSolids, maxDist);
    const extra = extraBlockers && extraBlockers.length
      ? raycast(origin, dir, extraBlockers, maxDist)
      : null;
    if (hit && extra) return extra.t < hit.t ? extra : hit;
    return hit || extra;
  }
}

/**
 * 门口正前方是否畅通:在门面前 6cm 处按 3×3 采样,任一点落在实体里就说明门口被
 * 相邻的垂直墙挡了一部分(内角处最典型)。clampToFace 只按命中盒夹取,管不到隔壁的盒。
 */
export function apertureClear(frame, solids) {
  const inSolid = (p) => solids.some((b) =>
    p[0] > b.min[0] + 1e-3 && p[0] < b.max[0] - 1e-3 &&
    p[1] > b.min[1] + 1e-3 && p[1] < b.max[1] - 1e-3 &&
    p[2] > b.min[2] + 1e-3 && p[2] < b.max[2] - 1e-3);
  for (const u of [-0.92, 0, 0.92]) {
    for (const v of [-0.92, 0, 0.92]) {
      const p = [0, 0, 0];
      for (let a = 0; a < 3; a++) {
        p[a] = frame.P[a] + frame.X[a] * (APERTURE.hx * u)
          + frame.U[a] * (APERTURE.hy * v) + frame.N[a] * 0.06;
      }
      if (inSolid(p)) return false;
    }
  }
  return true;
}

/** 两个门口(同一平面上的轴对齐矩形)是否相交 —— 用世界 AABB 判,对称且与各自朝向无关 */
export function aperturesOverlap(a, b) {
  // 沿各自法线给 5cm 厚度,否则共面的两扇门在法线轴上间距恒为 0,会被判成「不相交」
  const halves = (f) => [0, 1, 2].map((i) =>
    Math.abs(f.X[i]) * APERTURE.hx + Math.abs(f.U[i]) * APERTURE.hy + Math.abs(f.N[i]) * 0.05);
  const ha = halves(a);
  const hb = halves(b);
  for (let i = 0; i < 3; i++) {
    const gap = Math.abs(a.P[i] - b.P[i]) - (ha[i] + hb[i]);
    if (gap > -0.02) return false;
  }
  return true;
}

/** 把门心夹回该面允许的范围内;返回 null 表示这面墙装不下一扇门 */
export function clampToFace(box, frame) {
  const nAxis = frame.N[0] !== 0 ? 0 : frame.N[1] !== 0 ? 1 : 2;
  const P = [...frame.P];
  const margin = 0.04;
  for (let a = 0; a < 3; a++) {
    if (a === nAxis) continue;
    const half = Math.abs(frame.X[a]) * APERTURE.hx + Math.abs(frame.U[a]) * APERTURE.hy;
    const lo = box.min[a] + half + margin;
    const hi = box.max[a] - half - margin;
    if (lo > hi) return null;
    P[a] = Math.min(hi, Math.max(lo, P[a]));
  }
  return P;
}

export { subtractBox, boxesOverlap };
