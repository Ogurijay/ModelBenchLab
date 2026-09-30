// 碰撞世界 —— UE 侧 `UWorld::SweepSingleByChannel` / `LineTraceSingleByChannel` 的替身。
// 这是整个移植里精度要求最高的一层:状态图全靠 |normal.z| 与 dot(dir, -normal) 判定
// (docs/PORT_SPEC.md §3.1 / §7),法线偏一点点,「墙 / 地面 / 矮台」就会互相误判,系统直接散掉。
//
// 三个设计决定,都是为了「不穿墙」+「法线准」这两件事:
//
// 1) 一切都归约成「线段 + 半径」。
//    角色胶囊的轴恒沿世界 Z(接口不收 quat —— 角色不会躺下),探针球则是零长线段。
//    于是胶囊查询和球查询共用同一条代码路径;而 OBB 也只是「把线段变换到盒局部空间」,
//    旋转盒不需要第二套几何代码。Angle_* 三块带 pitch,这条路径是最省事也最稳的办法。
//
// 2) 扫掠用**保守推进(conservative advancement)**,不用子步长。
//    子步长必须按最薄的盒定(Glide_LandingPad 只有 50 cm),而自检里有传送和 6000 cm
//    高空自由落体(末速 ~4800 cm/s ⇒ 单步 40 cm,单次查询长度更是能到几千厘米),
//    25 cm 一步要走上百步 —— 又慢,而且仍然只是「大概不会穿」。
//    保守推进有严格保证:设当前间隙 d > 0,最近点对给出单位分离方向 n(盒 → 胶囊),
//    则沿 n 的分离量随位移以**恒定速率** c = dot(dir, -n) 减小,
//    要接触至少得前进 d / c。所以「前进 d / c」永远落在真正的首次接触之前,
//    单调逼近而绝不越过。盒多厚多薄都一样,不存在穿透,也不需要为薄板调参。
//    附带一个好处:c <= 0 时那条分离轴永远有效 ⇒ 该盒沿这条射线**永不可达**,可以立刻剔除。
//    「贴着地面平移」就是这种情形 —— 地板法线与运动方向垂直,自动被剔除,
//    不需要另写「忽略脚下地面」的特例规则。
//
// 3) 线段-盒最近点用精确解,不用迭代(三分搜索 / GJK)。
//    平方距离沿线段是**凸**的分段二次函数,折点只出现在某个坐标穿过 ±half 的地方(每轴 2 个),
//    所以把 [0,1] 按折点切成至多 7 段、逐段求二次顶点,就得到全局最优。
//    没有收敛容差,也就没有「法线在容差里抖」这种最难查的病。
//
// 单位:厘米、Z-up、X 前 / Y 右 / Z 上,与 UE 一致,不做任何换算。
// 本文件必须能在 node 里跑:只用 three 的数学类,不碰 window / document / 渲染器。

import * as THREE from 'three';
import { STRUCTURES } from '../levels/protoCourse.js';

/** 接触容差(cm)。间隙收敛到此以内即判命中;比场地最小特征(50 cm)小四个数量级。 */
const CONTACT_TOL = 1e-3;
/** 起始就嵌进去多深才算「初始穿透」(下游需要先解穿透),浅于此按普通接触处理。 */
const PENETRATION_SLOP = 0.1;
/** 保守推进的迭代上限。盒是平面体,正常 2~5 次收敛;留足余量给掠射角。 */
const MAX_ADVANCE_ITER = 64;
/** dot(dir, -n) 不超过此值即视为不接近 —— 分离轴永久有效,该盒可剔除。 */
const CLOSING_EPS = 1e-9;
/** 判「最近点已经落在盒面上」的距离下限,低于此走深穿透分支。 */
const DEGENERATE_DIST = 1e-9;

// ---------------------------------------------------------------------------
// 模块级临时对象:仿真每帧几十次查询,热路径上一次分配都不做
// ---------------------------------------------------------------------------

/** 折点缓冲:两端点 + 每轴 2 个,最多 8 个。 */
const _knots = new Float64Array(8);

/** 线段-AABB 最近点结果(盒局部空间)。 */
const _near = {
  sx: 0, sy: 0, sz: 0, // 线段上的最近点
  qx: 0, qy: 0, qz: 0, // 盒上的最近点
  dist: 0,
  outCount: 0, // 越界(被 clamp)的轴数:1 = 命中面,2 = 棱,3 = 角
  outAxis: -1,
  outSign: 0,
};

/** 胶囊-盒查询结果(世界空间)。dist 是带符号间隙,负数表示穿透。 */
const _q = { dist: 0, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0 };

// ---------------------------------------------------------------------------
// 输入归一化:允许 [x,y,z] 或任何有 .x/.y/.z 的东西,下游各模块风格不必统一
// ---------------------------------------------------------------------------

// 两个独立的落点:一次查询最多同时要 start 与 end,不能共用一个
const _pa = [0, 0, 0];
const _pb = [0, 0, 0];

function readVec3(v, out) {
  if (Array.isArray(v)) {
    out[0] = v[0]; out[1] = v[1]; out[2] = v[2];
  } else {
    out[0] = v.x; out[1] = v.y; out[2] = v.z;
  }
  return out;
}

/**
 * 四元数 → 行主序 3×3(世界 = R · 局部)。
 * 单位四元数返回 null,让轴对齐盒走免变换的快路径 —— 17 个盒里 14 个是轴对齐的。
 */
function rotationRowMajor(quat) {
  if (!quat) return null;
  const x = Array.isArray(quat) ? quat[0] : quat.x;
  const y = Array.isArray(quat) ? quat[1] : quat.y;
  const z = Array.isArray(quat) ? quat[2] : quat.z;
  const w = Array.isArray(quat) ? quat[3] : quat.w;
  if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 1e-12) return null;
  // three 的 Matrix4.elements 是列主序,这里转成行主序方便写 Rᵀ(世界 → 局部)。
  const e = new THREE.Matrix4()
    .makeRotationFromQuaternion(new THREE.Quaternion(x, y, z, w))
    .elements;
  return Float64Array.of(e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]);
}

// ---------------------------------------------------------------------------
// 精确的线段-AABB 最近点(盒局部空间,盒以原点为心、半长 h)
// ---------------------------------------------------------------------------

/**
 * f(t) = |clamp 越界量|² 是 t 的凸分段二次函数,折点即某坐标穿过 ±h 之处。
 * 逐段求顶点 → 全局最优,无迭代无容差。见文件头设计决定 (3)。
 */
function closestSegmentAabbLocal(ax, ay, az, bx, by, bz, hx, hy, hz, out) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;

  let n = 0;
  _knots[n++] = 0;
  _knots[n++] = 1;
  if (dx !== 0) {
    let t = (-hx - ax) / dx; if (t > 0 && t < 1) _knots[n++] = t;
    t = (hx - ax) / dx; if (t > 0 && t < 1) _knots[n++] = t;
  }
  if (dy !== 0) {
    let t = (-hy - ay) / dy; if (t > 0 && t < 1) _knots[n++] = t;
    t = (hy - ay) / dy; if (t > 0 && t < 1) _knots[n++] = t;
  }
  if (dz !== 0) {
    let t = (-hz - az) / dz; if (t > 0 && t < 1) _knots[n++] = t;
    t = (hz - az) / dz; if (t > 0 && t < 1) _knots[n++] = t;
  }
  // n <= 8,插入排序比 Array.prototype.sort 便宜且不分配
  for (let i = 1; i < n; i++) {
    const v = _knots[i];
    let j = i - 1;
    while (j >= 0 && _knots[j] > v) { _knots[j + 1] = _knots[j]; j--; }
    _knots[j + 1] = v;
  }

  let bestF = Infinity;
  let bestT = 0;
  for (let k = 0; k + 1 < n; k++) {
    const t0 = _knots[k];
    const t1 = _knots[k + 1];
    if (t1 <= t0) continue;
    const tm = 0.5 * (t0 + t1);
    // 区间内每轴的越界量都是同一条直线 p + q·t(折点已把分支切开)
    let A = 0, B = 0, C = 0;
    let p, q, pm;
    pm = ax + tm * dx;
    if (pm < -hx) { p = -hx - ax; q = -dx; A += q * q; B += 2 * p * q; C += p * p; }
    else if (pm > hx) { p = ax - hx; q = dx; A += q * q; B += 2 * p * q; C += p * p; }
    pm = ay + tm * dy;
    if (pm < -hy) { p = -hy - ay; q = -dy; A += q * q; B += 2 * p * q; C += p * p; }
    else if (pm > hy) { p = ay - hy; q = dy; A += q * q; B += 2 * p * q; C += p * p; }
    pm = az + tm * dz;
    if (pm < -hz) { p = -hz - az; q = -dz; A += q * q; B += 2 * p * q; C += p * p; }
    else if (pm > hz) { p = az - hz; q = dz; A += q * q; B += 2 * p * q; C += p * p; }

    let t = t0;
    if (A > 0) {
      t = -B / (2 * A);
      if (t < t0) t = t0; else if (t > t1) t = t1;
    }
    const f = (A * t + B) * t + C;
    if (f < bestF) { bestF = f; bestT = t; }
  }

  const sx = ax + bestT * dx;
  const sy = ay + bestT * dy;
  const sz = az + bestT * dz;

  let outCount = 0, outAxis = -1, outSign = 0;
  let qx = sx, qy = sy, qz = sz;
  if (sx < -hx) { qx = -hx; outCount++; outAxis = 0; outSign = -1; }
  else if (sx > hx) { qx = hx; outCount++; outAxis = 0; outSign = 1; }
  if (sy < -hy) { qy = -hy; outCount++; outAxis = 1; outSign = -1; }
  else if (sy > hy) { qy = hy; outCount++; outAxis = 1; outSign = 1; }
  if (sz < -hz) { qz = -hz; outCount++; outAxis = 2; outSign = -1; }
  else if (sz > hz) { qz = hz; outCount++; outAxis = 2; outSign = 1; }

  const ex = sx - qx, ey = sy - qy, ez = sz - qz;
  out.sx = sx; out.sy = sy; out.sz = sz;
  out.qx = qx; out.qy = qy; out.qz = qz;
  out.dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
  out.outCount = outCount;
  out.outAxis = outAxis;
  out.outSign = outSign;
  return out;
}

// ---------------------------------------------------------------------------
// 胶囊(竖直线段 + 半径)对单个盒的带符号间隙 + 接触法线 / 接触点
// ---------------------------------------------------------------------------

/**
 * `halfLen` 是**轴线**半长(胶囊 halfHeight − radius),不是总半高;球传 0。
 * 返回值写进 out:dist < 0 即穿透,-dist 就是最小平移量(MTD)的长度。
 *
 * 为什么 MTD 方向就是最近点方向:对凸盒 B 与线段 S,取最近点对 (a∈S, b∈B)、
 * n = (a−b)/|a−b|,则 S 全体满足 (p−b)·n >= d、B 全体满足 (q−b)·n <= 0,
 * 于是沿 n 平移 T 后距离 >= d + T;取 T = radius − d 即刚好分离,且 |T| 不可能更小。
 */
function boxCapsuleQuery(box, cx, cy, cz, radius, halfLen, out) {
  const wx = cx - box.cx;
  const wy = cy - box.cy;
  const wzT = cz + halfLen - box.cz;
  const wzB = cz - halfLen - box.cz;
  const R = box.rot;

  let a0, a1, a2, b0, b1, b2;
  if (R === null) {
    a0 = wx; a1 = wy; a2 = wzT;
    b0 = wx; b1 = wy; b2 = wzB;
  } else {
    // 局部 = Rᵀ · 世界
    a0 = R[0] * wx + R[3] * wy + R[6] * wzT;
    a1 = R[1] * wx + R[4] * wy + R[7] * wzT;
    a2 = R[2] * wx + R[5] * wy + R[8] * wzT;
    b0 = R[0] * wx + R[3] * wy + R[6] * wzB;
    b1 = R[1] * wx + R[4] * wy + R[7] * wzB;
    b2 = R[2] * wx + R[5] * wy + R[8] * wzB;
  }

  closestSegmentAabbLocal(a0, a1, a2, b0, b1, b2, box.hx, box.hy, box.hz, _near);

  let dist, lnx, lny, lnz, lpx, lpy, lpz;
  if (_near.dist > DEGENERATE_DIST) {
    dist = _near.dist - radius;
    lpx = _near.qx; lpy = _near.qy; lpz = _near.qz;
    if (_near.outCount === 1) {
      // 只越了一个轴 ⇒ 最近点落在那个**面**的内部,法线就是该面法线。
      // 直接取轴向精确值而不做归一化,免掉浮点抖动 —— |normal.z| 判定对此敏感。
      lnx = _near.outAxis === 0 ? _near.outSign : 0;
      lny = _near.outAxis === 1 ? _near.outSign : 0;
      lnz = _near.outAxis === 2 ? _near.outSign : 0;
    } else {
      // 命中棱或角:法线是径向,这对胶囊是正确答案(不是面法线,也不该是)
      const inv = 1 / _near.dist;
      lnx = (_near.sx - _near.qx) * inv;
      lny = (_near.sy - _near.qy) * inv;
      lnz = (_near.sz - _near.qz) * inv;
    }
  } else {
    // 轴线本身已经进到盒里,最近点退化。改问「整条线段沿六个面方向推出去,哪个最便宜」,
    // 这就是深穿透下唯一稳定的答案,也正是 overlapCapsule 要的「最浅推出方向」。
    const loX = a0 < b0 ? a0 : b0, hiX = a0 > b0 ? a0 : b0;
    const loY = a1 < b1 ? a1 : b1, hiY = a1 > b1 ? a1 : b1;
    const loZ = a2 < b2 ? a2 : b2, hiZ = a2 > b2 ? a2 : b2;
    let bestT = Infinity, axis = 0, sign = 1;
    let t = box.hx + radius - loX; if (t < bestT) { bestT = t; axis = 0; sign = 1; }
    t = box.hx + radius + hiX; if (t < bestT) { bestT = t; axis = 0; sign = -1; }
    t = box.hy + radius - loY; if (t < bestT) { bestT = t; axis = 1; sign = 1; }
    t = box.hy + radius + hiY; if (t < bestT) { bestT = t; axis = 1; sign = -1; }
    t = box.hz + radius - loZ; if (t < bestT) { bestT = t; axis = 2; sign = 1; }
    t = box.hz + radius + hiZ; if (t < bestT) { bestT = t; axis = 2; sign = -1; }
    dist = -bestT;
    lnx = axis === 0 ? sign : 0;
    lny = axis === 1 ? sign : 0;
    lnz = axis === 2 ? sign : 0;
    // 接触点:轴线中点投到被选中的那个面上
    lpx = 0.5 * (a0 + b0); lpy = 0.5 * (a1 + b1); lpz = 0.5 * (a2 + b2);
    if (axis === 0) lpx = sign * box.hx;
    else if (axis === 1) lpy = sign * box.hy;
    else lpz = sign * box.hz;
  }

  out.dist = dist;
  if (R === null) {
    out.nx = lnx; out.ny = lny; out.nz = lnz;
    out.px = box.cx + lpx; out.py = box.cy + lpy; out.pz = box.cz + lpz;
  } else {
    out.nx = R[0] * lnx + R[1] * lny + R[2] * lnz;
    out.ny = R[3] * lnx + R[4] * lny + R[5] * lnz;
    out.nz = R[6] * lnx + R[7] * lny + R[8] * lnz;
    out.px = box.cx + R[0] * lpx + R[1] * lpy + R[2] * lpz;
    out.py = box.cy + R[3] * lpx + R[4] * lpy + R[5] * lpz;
    out.pz = box.cz + R[6] * lpx + R[7] * lpy + R[8] * lpz;
  }
  return out;
}

// ---------------------------------------------------------------------------
// CollisionWorld
// ---------------------------------------------------------------------------

export class CollisionWorld {
  constructor() {
    /**
     * 盒列表。场地只有 17 个,粗筛用一遍 AABB 线性扫描就够 —— 上 BVH 是纯负收益
     * (建树成本 + 缓存不友好),而且这层的瓶颈从来是每盒的精确解不是候选数。
     */
    this.boxes = [];
  }

  /**
   * 加一个盒。`center` / `halfSize` 单位 cm;`quat` 为 null 或单位四元数时按轴对齐处理。
   * `tags` 原样带回给命中结果 —— §3.1 的 `unclimbable` 拒绝规则靠它。
   */
  addBox({ id, center, halfSize, quat = null, tags = [] }) {
    const c = readVec3(center, [0, 0, 0]);
    const h = readVec3(halfSize, [0, 0, 0]);
    const rot = rotationRowMajor(quat);

    // 粗筛用的世界 AABB。旋转盒的外接半长 = |R| · half(逐行取绝对值再点乘)。
    let ex = h[0], ey = h[1], ez = h[2];
    if (rot) {
      ex = Math.abs(rot[0]) * h[0] + Math.abs(rot[1]) * h[1] + Math.abs(rot[2]) * h[2];
      ey = Math.abs(rot[3]) * h[0] + Math.abs(rot[4]) * h[1] + Math.abs(rot[5]) * h[2];
      ez = Math.abs(rot[6]) * h[0] + Math.abs(rot[7]) * h[1] + Math.abs(rot[8]) * h[2];
    }

    const box = {
      id,
      tags: tags.slice(),
      cx: c[0], cy: c[1], cz: c[2],
      hx: h[0], hy: h[1], hz: h[2],
      rot,
      minX: c[0] - ex, maxX: c[0] + ex,
      minY: c[1] - ey, maxY: c[1] + ey,
      minZ: c[2] - ez, maxZ: c[2] + ez,
    };
    this.boxes.push(box);
    return box;
  }

  /** 按 id 取盒。给关卡审计与调试用,仿真本身不需要。 */
  getBox(id) {
    for (const b of this.boxes) if (b.id === id) return b;
    return null;
  }

  /**
   * 胶囊扫掠。`start` / `end` 是**胶囊中心**,胶囊立式(轴沿世界 Z)。
   * 返回 null 或 { time, point, normal, id, tags, distance, startPenetrating, depth }:
   *   time   ∈ [0,1] 的命中参数
   *   normal 指向胶囊一侧(从墙指向角色),已归一化
   *   point  盒表面上的接触点
   * 命中位置(start 到 end 的 time 处)保证不穿透 —— 保守推进只落在真正接触之前。
   */
  capsuleSweep(start, end, radius, halfHeight) {
    return this._sweep(start, end, radius, Math.max(0, halfHeight - radius));
  }

  /** 球扫掠(墙探针用,半径 25.2)。球 = 零长轴线的胶囊,与上面同一条路径。 */
  sphereSweep(start, end, radius) {
    return this._sweep(start, end, radius, 0);
  }

  /**
   * 竖直向下的线检测(`MeasureHeightAboveFloor` 用)。
   * 返回 { distance, point, normal, id, tags } 或 null;`distance` 从 `start` 量起。
   * 起点已在盒内时按 UE 的初始穿透语义处理:distance 0、法线 = −射线方向 = +Z。
   */
  lineTraceDown(start, maxDist) {
    const s = readVec3(start, _pa);
    const sx = s[0], sy = s[1], sz = s[2];
    const loZ = sz - maxDist;

    let bestT = Infinity;
    let bestBox = null;
    let bnx = 0, bny = 0, bnz = 0;

    for (const box of this.boxes) {
      if (box.maxZ < loZ || box.minZ > sz) continue;
      if (box.maxX < sx || box.minX > sx) continue;
      if (box.maxY < sy || box.minY > sy) continue;

      const R = box.rot;
      const wx = sx - box.cx, wy = sy - box.cy, wz = sz - box.cz;
      let ox, oy, oz, dx, dy, dz;
      if (R === null) {
        ox = wx; oy = wy; oz = wz;
        dx = 0; dy = 0; dz = -1;
      } else {
        ox = R[0] * wx + R[3] * wy + R[6] * wz;
        oy = R[1] * wx + R[4] * wy + R[7] * wz;
        oz = R[2] * wx + R[5] * wy + R[8] * wz;
        // 方向也要转:局部 = Rᵀ · (0,0,-1) = −(R 的第三行)
        dx = -R[6]; dy = -R[7]; dz = -R[8];
      }

      // 板块法(slab test)。tmin 保持 0 说明起点在盒内。
      let tmin = 0;
      let tmax = maxDist;
      let axis = -1;
      let sign = 0;
      let miss = false;
      for (let i = 0; i < 3; i++) {
        const o = i === 0 ? ox : i === 1 ? oy : oz;
        const d = i === 0 ? dx : i === 1 ? dy : dz;
        const h = i === 0 ? box.hx : i === 1 ? box.hy : box.hz;
        if (d > -1e-12 && d < 1e-12) {
          if (o < -h || o > h) { miss = true; break; }
          continue;
        }
        const t1 = (-h - o) / d;
        const t2 = (h - o) / d;
        const enter = t1 < t2 ? t1 : t2;
        const exit = t1 < t2 ? t2 : t1;
        if (enter > tmin) { tmin = enter; axis = i; sign = d > 0 ? -1 : 1; }
        if (exit < tmax) tmax = exit;
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || tmin > maxDist || tmin >= bestT) continue;

      bestT = tmin;
      bestBox = box;
      if (axis < 0) {
        // 起点就在盒内 —— 与 UE 的 bStartPenetrating 一致,法线取 −射线方向
        bnx = 0; bny = 0; bnz = 1;
      } else if (R === null) {
        bnx = axis === 0 ? sign : 0;
        bny = axis === 1 ? sign : 0;
        bnz = axis === 2 ? sign : 0;
      } else {
        // 世界法线 = R 的第 axis 列 × sign
        bnx = R[axis] * sign;
        bny = R[3 + axis] * sign;
        bnz = R[6 + axis] * sign;
      }
    }

    if (!bestBox) return null;
    return {
      distance: bestT,
      point: new THREE.Vector3(sx, sy, sz - bestT),
      normal: new THREE.Vector3(bnx, bny, bnz),
      id: bestBox.id,
      tags: bestBox.tags,
    };
  }

  /**
   * 静态重叠查询。返回**最深**穿透的那个盒:{ normal, depth, id, tags, point } 或 null。
   * `normal` 是该盒的最浅推出方向,`depth` 是沿该方向推到刚好分离所需的距离,
   * 也就是 `position += normal * depth` 即可解穿透。
   */
  overlapCapsule(center, radius, halfHeight) {
    const c = readVec3(center, _pa);
    const halfLen = Math.max(0, halfHeight - radius);
    const exZ = halfLen + radius;

    let bestDepth = 0;
    let best = null;
    for (const box of this.boxes) {
      if (box.maxX < c[0] - radius || box.minX > c[0] + radius) continue;
      if (box.maxY < c[1] - radius || box.minY > c[1] + radius) continue;
      if (box.maxZ < c[2] - exZ || box.minZ > c[2] + exZ) continue;

      boxCapsuleQuery(box, c[0], c[1], c[2], radius, halfLen, _q);
      if (_q.dist >= 0) continue;
      const depth = -_q.dist;
      if (depth > bestDepth) {
        bestDepth = depth;
        best = {
          normal: new THREE.Vector3(_q.nx, _q.ny, _q.nz),
          depth,
          id: box.id,
          tags: box.tags,
          point: new THREE.Vector3(_q.px, _q.py, _q.pz),
        };
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  /** 胶囊 / 球共用的扫掠体。`halfLen` 是轴线半长(球传 0)。 */
  _sweep(start, end, radius, halfLen) {
    const s = readVec3(start, _pa);
    const sx = s[0], sy = s[1], sz = s[2];
    const e = readVec3(end, _pb);
    const dx = e[0] - sx, dy = e[1] - sy, dz = e[2] - sz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-9) return this._zeroLengthHit(sx, sy, sz, radius, halfLen);

    const ix = dx / len, iy = dy / len, iz = dz / len;

    // 粗筛:整条路径的胶囊包络
    const exR = radius + CONTACT_TOL;
    const exZ = radius + halfLen + CONTACT_TOL;
    const loX = (sx < e[0] ? sx : e[0]) - exR, hiX = (sx > e[0] ? sx : e[0]) + exR;
    const loY = (sy < e[1] ? sy : e[1]) - exR, hiY = (sy > e[1] ? sy : e[1]) + exR;
    const loZ = (sz < e[2] ? sz : e[2]) - exZ, hiZ = (sz > e[2] ? sz : e[2]) + exZ;

    let bestT = -1;
    let bestBox = null;
    let bestGap = 0;
    let bnx = 0, bny = 0, bnz = 0, bpx = 0, bpy = 0, bpz = 0;

    for (const box of this.boxes) {
      if (box.maxX < loX || box.minX > hiX) continue;
      if (box.maxY < loY || box.minY > hiY) continue;
      if (box.maxZ < loZ || box.minZ > hiZ) continue;

      const limit = bestT < 0 ? len : bestT;
      const t = advanceToContact(box, sx, sy, sz, ix, iy, iz, limit, radius, halfLen);
      if (t < 0) continue;
      // 同一时刻多个盒都命中时取更深的那个,免得解穿透方向选错
      if (bestT < 0 || t < bestT || (t === bestT && _q.dist < bestGap)) {
        bestT = t;
        bestBox = box;
        bestGap = _q.dist;
        bnx = _q.nx; bny = _q.ny; bnz = _q.nz;
        bpx = _q.px; bpy = _q.py; bpz = _q.pz;
      }
    }

    if (!bestBox) return null;
    return {
      time: bestT / len,
      distance: bestT,
      point: new THREE.Vector3(bpx, bpy, bpz),
      normal: new THREE.Vector3(bnx, bny, bnz),
      id: bestBox.id,
      tags: bestBox.tags,
      startPenetrating: bestT === 0 && bestGap < -PENETRATION_SLOP,
      depth: bestGap < 0 ? -bestGap : 0,
    };
  }

  /** 零位移扫掠:没有运动方向可谈,只能报「起点是否已经嵌进去了」。 */
  _zeroLengthHit(cx, cy, cz, radius, halfLen) {
    let bestDist = -PENETRATION_SLOP;
    let bestBox = null;
    let bnx = 0, bny = 0, bnz = 0, bpx = 0, bpy = 0, bpz = 0;
    for (const box of this.boxes) {
      boxCapsuleQuery(box, cx, cy, cz, radius, halfLen, _q);
      if (_q.dist < bestDist) {
        bestDist = _q.dist;
        bestBox = box;
        bnx = _q.nx; bny = _q.ny; bnz = _q.nz;
        bpx = _q.px; bpy = _q.py; bpz = _q.pz;
      }
    }
    if (!bestBox) return null;
    return {
      time: 0,
      distance: 0,
      point: new THREE.Vector3(bpx, bpy, bpz),
      normal: new THREE.Vector3(bnx, bny, bnz),
      id: bestBox.id,
      tags: bestBox.tags,
      startPenetrating: true,
      depth: -bestDist,
    };
  }
}

/**
 * 单盒保守推进,返回首次接触的位移(cm),没有命中返回 -1。
 * 返回时 `_q` 里留着该位置的法线与接触点,调用方紧接着读。
 */
function advanceToContact(box, sx, sy, sz, ix, iy, iz, limit, radius, halfLen) {
  let t = 0;
  for (let it = 0; it < MAX_ADVANCE_ITER; it++) {
    boxCapsuleQuery(box, sx + ix * t, sy + iy * t, sz + iz * t, radius, halfLen, _q);
    const closing = -(ix * _q.nx + iy * _q.ny + iz * _q.nz);
    // 分离方向上不再接近 ⇒ 这条分离轴对所有后续位移都成立 ⇒ 该盒永不可达。
    // 「贴地平移不被地板挡住」「已嵌入但正在往外走不算阻挡」都由这一句顺带解决。
    if (closing <= CLOSING_EPS) return -1;
    if (_q.dist <= CONTACT_TOL) return t;
    // 沿分离轴的间隙以恒定速率 closing 减小 ⇒ 至少要走 dist/closing 才可能接触
    t += _q.dist / closing;
    if (t > limit) return -1;
  }
  // 极端掠射角下迭代耗尽:按当前位置当成命中。宁可多报一次阻挡,也不放过穿透。
  boxCapsuleQuery(box, sx + ix * t, sy + iy * t, sz + iz * t, radius, halfLen, _q);
  return t <= limit ? t : -1;
}

// ---------------------------------------------------------------------------
// 关卡装载
// ---------------------------------------------------------------------------

/**
 * 把 protoCourse 的 STRUCTURES 灌进碰撞世界。数据是那边的事,这里只负责 addBox。
 * 返回同一个 world,方便链式写法。
 */
export function loadCourse(world, structures = STRUCTURES) {
  for (const s of structures) {
    world.addBox({
      id: s.id,
      center: s.center,
      halfSize: s.halfSize,
      quat: s.quat,
      tags: s.tags,
    });
  }
  return world;
}

/** 建好并装满关卡的碰撞世界。sim/world.js 直接用这个。 */
export function createCourseWorld() {
  return loadCourse(new CollisionWorld());
}
