/**
 * @file src/city/roads.js
 * @description 曼哈顿路网、人行道、路面标线、河流水面与中央公园绿化边界（契约 §5.1）。
 *
 * ---------------------------------------------------------------------------
 * 一、这个模块产出什么
 * ---------------------------------------------------------------------------
 * 全部地面层几何，按材质分成 **5 个合并网格（= 5 个 drawcall，契约上限 6）**：
 *
 * | 网格 | 内容 | 材质要点 |
 * |---|---|---|
 * | `roads-asphalt`   | 大道 / 街道 / 路口铺装 / 百老汇斜街车行道 | 沥青，`puddles:true` |
 * | `roads-sidewalk`  | 人行道面（抬高 0.18m）+ 路缘石侧面 + 街区地坪 + 滨水挡墙 + 公园矮墙 | 板材 |
 * | `roads-markings`  | 双黄线 / 车道虚线 / 停止线 / 斑马线（贴花平面） | `polygonOffset` 防 z-fighting |
 * | `roads-water`     | 哈德逊河（x<-800）/ 东河（x>800）/ 南端港湾 / 北端水道 | 自建法线扰动，**不 patch** |
 * | `roads-greenbelt` | 中央公园外围绿化带 | 草地顶点色 |
 *
 * ---------------------------------------------------------------------------
 * 二、几何互不重叠的构造法（避免共面 z-fighting）
 * ---------------------------------------------------------------------------
 * 1. **正交网格**：大道整条纵向铺；横街被大道切成段；路口方块单独一块。
 *    三者严格拼接、不叠加，路口方块因此可以单独给更暗的顶点色（磨损铺装）。
 * 2. **百老汇**：正交网格的每一块都先用 `subtractBandPolys()` 挖掉「百老汇路面带」
 *    （中心线两侧各 15m），再由百老汇自己的带状面填回。于是斜街与网格只拼不叠，
 *    不需要给百老汇单独一个材质/偏移，省下一个 drawcall。
 * 3. **人行道**：以每个「街区地坪矩形」为单位，向外扩 6m 得到一圈环带（4 条）。
 *    相邻街区的环带被车行道隔开，天然不重叠。环带与地坪同样挖掉百老汇带（内缩 21m
 *    = 路面半宽 15 + 人行道 6，与 `city/grid.js` 切地块用的内缩一致），
 *    空出的 15..21m 正好给百老汇自己的人行道。
 * 4. **百老汇人行道**：沿斜街的长条，用 `subtractSlabX/Z()` 精确挖掉与之相交的
 *    大道 / 横街车行道带（否则 0.18m 高的人行道会横跨马路）。
 *
 * ---------------------------------------------------------------------------
 * 三、polygonOffset 说明（任务书要求 factor -1 / units -1）
 * ---------------------------------------------------------------------------
 * 标线与路面**完全共面**（同为 y=0），靠深度偏移而非抬高 y 分层：
 *   - 沥青：`polygonOffset(-1, -1)`  —— 用来压过 `sculpt/terrain.js` 的公园地形边缘。
 *     `CITY.park` 的边界正好落在大道 / 横街的**中心线**上，公园地形必然覆盖半幅路面，
 *     不给路面一级偏移就会与地形共面闪烁。
 *   - 标线：`polygonOffset(-2, -2)` —— **相对沥青恰好是任务书要求的 (-1, -1)**。
 * 水平面上 `polygonOffsetFactor` 乘的是深度斜率（≈0），真正起作用的是 `units`，
 * 两者按同样的阶梯给值，含义清晰。
 *
 * ---------------------------------------------------------------------------
 * 四、契约差异与兜底（按契约 §0 就地记录，不改契约）
 * ---------------------------------------------------------------------------
 * - 契约 §0 规定 `city/*` 之间不得互相 import，因此本文件**不 import `city/grid.js`**，
 *   而是把 `CITY` 中与铺装有关的常量镜像为本文件的 `SPEC`（数值逐项对齐）。
 *   能从 `ctx0.plan` 拿到的（`avenueXs` / `streetZs` / `broadway` / `parkPolygon` /
 *   `intersections`）一律以 plan 为准，`SPEC` 只作缺省兜底。
 * - 契约 §5.1 要求导出 `handle.waterMaterial`；本模块同时导出 `handle.stats`。
 * - 水面材质按任务要求**不调用** `patchCityMaterial`，自带法线扰动与夜间压暗。
 *
 * 坐标约定（契约 §0）：Y 轴向上；+X 东、−X 西；+Z 南（下城）、−Z 北（上城）；1 单位 = 1 米。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/rng.js';
import { makeNoise2D } from '../core/noise.js';
import { clamp } from '../core/mathx.js';
import { patchCityMaterial } from '../render/shaderpatch.js';

/* ==========================================================================
 * 0. 常量
 * ========================================================================*/

/**
 * 铺装尺寸规格。数值镜像自 `city/grid.js` 的 `CITY`（契约 §4.1 给定），
 * 因为契约禁止 `city/*` 之间互相 import。仅作兜底：能从 `ctx0.plan` 读到的一律以 plan 为准。
 */
const SPEC = Object.freeze({
  minX: -800,
  maxX: 800,
  minZ: -2400,
  maxZ: 2400,
  avenueXs: [-700, -420, -140, 140, 420, 700],
  streetSpacing: 80,
  avenueRoadWidth: 34,
  streetRoadWidth: 20,
  sidewalkWidth: 6,
  broadwayWidth: 30,
  park: { minX: -420, maxX: 140, minZ: -2080, maxZ: -720 }
});

/** 路缘石高度（契约 §5.1：人行道抬高 0.18m） */
const CURB_H = 0.18;
/** 公园绿化带草面高度（略高于人行道，形成种植台） */
const BELT_H = 0.30;
/** 公园矮石墙顶高 */
const PARK_WALL_H = 0.62;
/** 公园矮石墙厚度 */
const PARK_WALL_T = 0.5;
/** 绿化带宽度 */
const BELT_W = 7.0;
/** 水面高程（街面以下，形成河岸落差） */
const WATER_Y = -1.1;
/** 滨水挡墙底部高程 */
const BULKHEAD_BOTTOM = -3.2;
/** 滨水挡墙压顶宽度 */
const BULKHEAD_CAP = 0.7;
/** 水域向外延展的范围（米），保证任何视角下地平线都是水 */
const WATER_FAR_X = 6000;
/** 水域南北延展范围 */
const WATER_FAR_Z = 9000;
/** 几何容差 */
const EPS = 1e-7;

/** 标线颜色（顶点色，材质基色为白） */
const COL_WHITE = [0.93, 0.93, 0.89];
/** 双黄线颜色 */
const COL_YELLOW = [0.92, 0.72, 0.11];

/* ==========================================================================
 * 1. 多边形工具（本文件自用；契约禁止 import city/grid.js，故独立实现）
 * ========================================================================*/

/**
 * 半平面裁剪（Sutherland–Hodgman，CACM 1974）：保留 `fn(p) >= 0` 的一侧。
 * @param {Array<[number, number]>} poly 输入多边形 `[[x,z], ...]`
 * @param {(p: [number, number]) => number} fn 有符号距离函数
 * @returns {Array<[number, number]>} 裁剪结果（可能少于 3 个顶点）
 */
function clipByFn(poly, fn) {
  const out = [];
  const n = poly.length;
  if (n < 3) return out;
  let prev = poly[n - 1];
  let prevD = fn(prev);
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const curD = fn(cur);
    if (curD >= 0) {
      if (prevD < 0) {
        const t = prevD / (prevD - curD);
        out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
      }
      out.push([cur[0], cur[1]]);
    } else if (prevD >= 0) {
      const t = prevD / (prevD - curD);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    prev = cur;
    prevD = curD;
  }
  return out;
}

/**
 * 轴对齐矩形 → 多边形（顶点顺序无所谓，`SurfaceBuilder` 会自行定向）。
 * @param {number} x0 西边界
 * @param {number} z0 北边界
 * @param {number} x1 东边界
 * @param {number} z1 南边界
 * @returns {Array<[number, number]>} 4 顶点多边形
 */
function rectPoly(x0, z0, x1, z1) {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

/**
 * 从多边形集合中挖掉「百老汇带」：保留到中心线横向距离 ≥ inset 的两侧残块。
 * @param {Array<Array<[number, number]>>} polys 输入多边形数组
 * @param {Object} bw 百老汇几何（见 `buildBroadway`）
 * @param {number} inset 带半宽（米）
 * @returns {Array<Array<[number, number]>>} 带外残块
 */
function subtractBandPolys(polys, bw, inset) {
  if (!bw) return polys;
  const out = [];
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i];
    if (p.length < 3) continue;
    let mn = Infinity;
    let mx = -Infinity;
    for (let k = 0; k < p.length; k++) {
      const d = bw.offsetAt(p[k][0], p[k][1]);
      if (d < mn) mn = d;
      if (d > mx) mx = d;
    }
    if (mn >= inset - EPS || mx <= -inset + EPS) {
      out.push(p);
      continue;
    }
    const east = clipByFn(p, (q) => bw.offsetAt(q[0], q[1]) - inset);
    const west = clipByFn(p, (q) => -bw.offsetAt(q[0], q[1]) - inset);
    if (east.length >= 3) out.push(east);
    if (west.length >= 3) out.push(west);
  }
  return out;
}

/**
 * 从多边形集合中挖掉一条南北向板带（X 区间）。
 * @param {Array<Array<[number, number]>>} polys 输入
 * @param {number} xMin 板带西界
 * @param {number} xMax 板带东界
 * @returns {Array<Array<[number, number]>>} 板带外残块
 */
function subtractSlabX(polys, xMin, xMax) {
  const out = [];
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i];
    let mn = Infinity;
    let mx = -Infinity;
    for (let k = 0; k < p.length; k++) {
      if (p[k][0] < mn) mn = p[k][0];
      if (p[k][0] > mx) mx = p[k][0];
    }
    if (mn >= xMax - EPS || mx <= xMin + EPS) {
      out.push(p);
      continue;
    }
    const west = clipByFn(p, (q) => xMin - q[0]);
    const east = clipByFn(p, (q) => q[0] - xMax);
    if (west.length >= 3) out.push(west);
    if (east.length >= 3) out.push(east);
  }
  return out;
}

/**
 * 从多边形集合中挖掉一条东西向板带（Z 区间）。
 * @param {Array<Array<[number, number]>>} polys 输入
 * @param {number} zMin 板带北界
 * @param {number} zMax 板带南界
 * @returns {Array<Array<[number, number]>>} 板带外残块
 */
function subtractSlabZ(polys, zMin, zMax) {
  const out = [];
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i];
    let mn = Infinity;
    let mx = -Infinity;
    for (let k = 0; k < p.length; k++) {
      if (p[k][1] < mn) mn = p[k][1];
      if (p[k][1] > mx) mx = p[k][1];
    }
    if (mn >= zMax - EPS || mx <= zMin + EPS) {
      out.push(p);
      continue;
    }
    const north = clipByFn(p, (q) => zMin - q[1]);
    const south = clipByFn(p, (q) => q[1] - zMax);
    if (north.length >= 3) out.push(north);
    if (south.length >= 3) out.push(south);
  }
  return out;
}

/* ==========================================================================
 * 2. 一维区间工具（斜街沿程分段用）
 * ========================================================================*/

/**
 * 合并重叠区间。
 * @param {Array<[number, number]>} list 输入区间（可乱序）
 * @returns {Array<[number, number]>} 升序、互不重叠的区间
 */
function mergeIntervals(list) {
  if (list.length === 0) return [];
  const sorted = list.slice().sort((a, b) => a[0] - b[0]);
  const out = [sorted[0].slice()];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur[0] <= last[1] + EPS) {
      if (cur[1] > last[1]) last[1] = cur[1];
    } else {
      out.push(cur.slice());
    }
  }
  return out;
}

/**
 * 在 [lo, hi] 上求区间集合的补集。
 * @param {Array<[number, number]>} blocked 已合并的被占用区间
 * @param {number} lo 下界
 * @param {number} hi 上界
 * @param {number} [minLen=0.5] 丢弃短于该长度的碎片
 * @returns {Array<[number, number]>} 可用区间
 */
function complementIntervals(blocked, lo, hi, minLen = 0.5) {
  const out = [];
  let cursor = lo;
  for (let i = 0; i < blocked.length; i++) {
    const b = blocked[i];
    if (b[1] <= cursor) continue;
    if (b[0] > hi) break;
    if (b[0] - cursor >= minLen) out.push([cursor, b[0]]);
    if (b[1] > cursor) cursor = b[1];
  }
  if (hi - cursor >= minLen) out.push([cursor, hi]);
  return out;
}

/**
 * 在直线 `x = 常数` 上，求落在百老汇带**之外**的 Z 区间。
 * 横向距离 `off(x,z) = (x−ax)·nx + (z−az)·nz` 对固定 x 是 z 的一次函数。
 * @param {number} x 直线的 X
 * @param {number} z0 起点 Z
 * @param {number} z1 终点 Z
 * @param {Object|null} bw 百老汇几何
 * @param {number} inset 带半宽
 * @returns {Array<[number, number]>} 带外 Z 区间
 */
function zSpansOutsideBand(x, z0, z1, bw, inset) {
  if (!bw || Math.abs(bw.nz) < 1e-9) {
    return bw && Math.abs(bw.offsetAt(x, z0)) < inset ? [] : [[z0, z1]];
  }
  const c = (x - bw.ax) * bw.nx - bw.az * bw.nz;
  const ta = (-inset - c) / bw.nz;
  const tb = (inset - c) / bw.nz;
  const lo = Math.min(ta, tb);
  const hi = Math.max(ta, tb);
  return complementIntervals([[lo, hi]], z0, z1, 0.4);
}

/**
 * 在直线 `z = 常数` 上，求落在百老汇带**之外**的 X 区间。
 * @param {number} z 直线的 Z
 * @param {number} x0 起点 X
 * @param {number} x1 终点 X
 * @param {Object|null} bw 百老汇几何
 * @param {number} inset 带半宽
 * @returns {Array<[number, number]>} 带外 X 区间
 */
function xSpansOutsideBand(z, x0, x1, bw, inset) {
  if (!bw || Math.abs(bw.nx) < 1e-9) {
    return bw && Math.abs(bw.offsetAt(x0, z)) < inset ? [] : [[x0, x1]];
  }
  const c = (z - bw.az) * bw.nz - bw.ax * bw.nx;
  const ta = (-inset - c) / bw.nx;
  const tb = (inset - c) / bw.nx;
  const lo = Math.min(ta, tb);
  const hi = Math.max(ta, tb);
  return complementIntervals([[lo, hi]], x0, x1, 0.4);
}

/* ==========================================================================
 * 3. 几何累加器：分块累加 → mergeGeometries 合并成一个 drawcall
 * ========================================================================*/

/** 单个中间几何块的顶点上限（避免一次性 push 几十万个数导致数组反复扩容） */
const CHUNK_VERTS = 24576;

/**
 * 三角面累加器。
 *
 * 所有块的属性集合完全一致（position / normal / uv / color，且**统一非索引**），
 * 满足 `BufferGeometryUtils.mergeGeometries` 对属性一致性的要求。
 */
class SurfaceBuilder {
  /**
   * @param {string} name 合并后几何的名字
   */
  constructor(name) {
    this.name = name;
    /** @type {number[]} */ this.pos = [];
    /** @type {number[]} */ this.nrm = [];
    /** @type {number[]} */ this.uv = [];
    /** @type {number[]} */ this.col = [];
    /** @type {THREE.BufferGeometry[]} */ this.chunks = [];
    /** @type {((x: number, z: number) => number)|null} 逐顶点亮度扰动（做出斑驳磨损） */
    this.tint = null;
    this.triangles = 0;
  }

  /**
   * 压入一个顶点。
   * @param {number} x 世界 X
   * @param {number} y 世界 Y
   * @param {number} z 世界 Z
   * @param {number} nx 法线 X
   * @param {number} ny 法线 Y
   * @param {number} nz 法线 Z
   * @param {number} u UV.u
   * @param {number} v UV.v
   * @param {number[]} c 颜色 `[r,g,b]`
   * @returns {void}
   */
  vertex(x, y, z, nx, ny, nz, u, v, c) {
    const k = this.tint ? this.tint(x, z) : 1;
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c[0] * k, c[1] * k, c[2] * k);
  }

  /**
   * 水平面多边形（法线 +Y）。自动把顶点定向为「自上而下看逆时针」，扇形三角化。
   * 仅适用于凸多边形——本模块所有面都由矩形经半平面裁剪得到，必凸。
   * @param {Array<[number, number]>} poly 多边形 `[[x,z], ...]`
   * @param {number} y 高程
   * @param {number} uvScale UV 世界尺度（米/贴图周期）
   * @param {number[]} c 颜色
   * @returns {void}
   */
  addTopPoly(poly, y, uvScale, c) {
    const n = poly.length;
    if (n < 3) return;
    // 鞋带面积：> 0 表示「俯视顺时针」，需反向才能得到 +Y 法线
    let s2 = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      s2 += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    }
    if (Math.abs(s2) < 1e-6) return;
    const inv = 1 / uvScale;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = s2 > 0 ? n - 1 - i : i;
    const p0 = poly[idx[0]];
    for (let i = 1; i < n - 1; i++) {
      const p1 = poly[idx[i]];
      const p2 = poly[idx[i + 1]];
      this.vertex(p0[0], y, p0[1], 0, 1, 0, p0[0] * inv, p0[1] * inv, c);
      this.vertex(p1[0], y, p1[1], 0, 1, 0, p1[0] * inv, p1[1] * inv, c);
      this.vertex(p2[0], y, p2[1], 0, 1, 0, p2[0] * inv, p2[1] * inv, c);
      this.triangles++;
    }
    this.maybeFlush();
  }

  /**
   * 轴对齐水平矩形（法线 +Y）。
   * @param {number} x0 西边界
   * @param {number} z0 北边界
   * @param {number} x1 东边界
   * @param {number} z1 南边界
   * @param {number} y 高程
   * @param {number} uvScale UV 世界尺度
   * @param {number[]} c 颜色
   * @returns {void}
   */
  addTopRect(x0, z0, x1, z1, y, uvScale, c) {
    if (x1 - x0 <= EPS || z1 - z0 <= EPS) return;
    const inv = 1 / uvScale;
    // (x0,z0) → (x0,z1) → (x1,z1) → (x1,z0) 自上而下看为逆时针 ⇒ 法线 +Y
    const ax = x0;
    const az = z0;
    const bx = x0;
    const bz = z1;
    const cx = x1;
    const cz = z1;
    const dx = x1;
    const dz = z0;
    this.vertex(ax, y, az, 0, 1, 0, ax * inv, az * inv, c);
    this.vertex(bx, y, bz, 0, 1, 0, bx * inv, bz * inv, c);
    this.vertex(cx, y, cz, 0, 1, 0, cx * inv, cz * inv, c);
    this.vertex(ax, y, az, 0, 1, 0, ax * inv, az * inv, c);
    this.vertex(cx, y, cz, 0, 1, 0, cx * inv, cz * inv, c);
    this.vertex(dx, y, dz, 0, 1, 0, dx * inv, dz * inv, c);
    this.triangles += 2;
    this.maybeFlush();
  }

  /**
   * 竖直四边形（路缘石侧面、挡墙、种植台裙边）。
   * @param {number} x0 起点 X
   * @param {number} z0 起点 Z
   * @param {number} x1 终点 X
   * @param {number} z1 终点 Z
   * @param {number} yB 底高程
   * @param {number} yT 顶高程
   * @param {number} nx 期望外法线 X（水平单位向量）
   * @param {number} nz 期望外法线 Z
   * @param {number} uvScale UV 世界尺度
   * @param {number[]} c 颜色
   * @returns {void}
   */
  addWall(x0, z0, x1, z1, yB, yT, nx, nz, uvScale, c) {
    const ex = x1 - x0;
    const ez = z1 - z0;
    const len = Math.hypot(ex, ez);
    if (len < 1e-4 || yT - yB < 1e-4) return;
    // A→B→C→D（A=(x0,yB) B=(x1,yB) C=(x1,yT) D=(x0,yT)）的法线 ∝ (−ez, 0, ex)
    const flip = -ez * nx + ex * nz < 0;
    const sx = flip ? x1 : x0;
    const sz = flip ? z1 : z0;
    const tx = flip ? x0 : x1;
    const tz = flip ? z0 : z1;
    const inv = 1 / uvScale;
    const u0 = 0;
    const u1 = len * inv;
    const v0 = yB * inv;
    const v1 = yT * inv;
    this.vertex(sx, yB, sz, nx, 0, nz, u0, v0, c);
    this.vertex(tx, yB, tz, nx, 0, nz, u1, v0, c);
    this.vertex(tx, yT, tz, nx, 0, nz, u1, v1, c);
    this.vertex(sx, yB, sz, nx, 0, nz, u0, v0, c);
    this.vertex(tx, yT, tz, nx, 0, nz, u1, v1, c);
    this.vertex(sx, yT, sz, nx, 0, nz, u0, v1, c);
    this.triangles += 2;
    this.maybeFlush();
  }

  /**
   * 顶点数超限时切出一个中间几何块。
   * @returns {void}
   */
  maybeFlush() {
    if (this.pos.length >= CHUNK_VERTS * 3) this.flushChunk();
  }

  /**
   * 把当前累加内容切成一个 `BufferGeometry` 块。
   * @returns {void}
   */
  flushChunk() {
    if (this.pos.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    this.chunks.push(g);
    this.pos.length = 0;
    this.nrm.length = 0;
    this.uv.length = 0;
    this.col.length = 0;
  }

  /**
   * 合并所有块（契约要求使用 `BufferGeometryUtils.mergeGeometries`），并释放中间块。
   * @returns {THREE.BufferGeometry|null} 合并后的几何；无内容时为 null
   */
  build() {
    this.flushChunk();
    if (this.chunks.length === 0) return null;
    const merged = mergeGeometries(this.chunks, false);
    for (let i = 0; i < this.chunks.length; i++) this.chunks[i].dispose();
    this.chunks.length = 0;
    if (!merged) return null;
    merged.name = this.name;
    merged.computeBoundingSphere();
    return merged;
  }
}

/* ==========================================================================
 * 4. 百老汇斜街几何
 * ========================================================================*/

/**
 * 由 plan 构造百老汇中心线的方向 / 法线 / 横向距离函数。
 * 法线取 `n = (dz, −dx)/L`，点的横向有符号距离 `off = (p − a)·n`（东侧为正），
 * 与 `city/grid.js` 裁地块时的定义完全一致，保证两边对得上。
 * @param {Object|null} planBroadway `plan.broadway`
 * @returns {Object|null} 百老汇几何；数据缺失时返回 null
 */
function buildBroadway(planBroadway) {
  const src = planBroadway || null;
  if (!src || !Number.isFinite(src.ax) || !Number.isFinite(src.bz)) return null;
  const ax = src.ax;
  const az = src.az;
  const bx = src.bx;
  const bz = src.bz;
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  if (length < 1) return null;
  const dirX = dx / length;
  const dirZ = dz / length;
  const nx = dz / length;
  const nz = -dx / length;
  const width = Number.isFinite(src.width) ? src.width : SPEC.broadwayWidth;
  return {
    ax,
    az,
    dirX,
    dirZ,
    nx,
    nz,
    length,
    width,
    half: width * 0.5,
    /**
     * 沿程参数 t（米）与横向偏移 s（米）对应的世界坐标。
     * @param {number} t 沿中心线弧长
     * @param {number} s 横向偏移（东侧为正）
     * @returns {[number, number]} `[x, z]`
     */
    pointAt(t, s) {
      return [ax + dirX * t + nx * s, az + dirZ * t + nz * s];
    },
    /**
     * 点到中心线的横向有符号距离。
     * @param {number} x 世界 X
     * @param {number} z 世界 Z
     * @returns {number} 有符号距离（东侧为正）
     */
    offsetAt(x, z) {
      return (x - ax) * nx + (z - az) * nz;
    }
  };
}

/**
 * 求斜街上某条「等横向偏移线」被正交车行道带占用的沿程区间。
 * @param {Object} bw 百老汇几何
 * @param {number} s 横向偏移
 * @param {number[]} avenueXs 大道中心线 X
 * @param {number[]} streetZs 横街中心线 Z
 * @param {number} avHalf 大道半宽
 * @param {number} stHalf 横街半宽
 * @param {number} [margin=0] 额外外扩量
 * @returns {Array<[number, number]>} 已合并的被占用区间
 */
function broadwayBlockedSpans(bw, s, avenueXs, streetZs, avHalf, stHalf, margin = 0) {
  const blocked = [];
  if (Math.abs(bw.dirX) > 1e-6) {
    const cx = bw.ax + bw.nx * s;
    for (let i = 0; i < avenueXs.length; i++) {
      const t0 = (avenueXs[i] - avHalf - margin - cx) / bw.dirX;
      const t1 = (avenueXs[i] + avHalf + margin - cx) / bw.dirX;
      blocked.push(t0 < t1 ? [t0, t1] : [t1, t0]);
    }
  }
  if (Math.abs(bw.dirZ) > 1e-6) {
    const cz = bw.az + bw.nz * s;
    for (let i = 0; i < streetZs.length; i++) {
      const t0 = (streetZs[i] - stHalf - margin - cz) / bw.dirZ;
      const t1 = (streetZs[i] + stHalf + margin - cz) / bw.dirZ;
      blocked.push(t0 < t1 ? [t0, t1] : [t1, t0]);
    }
  }
  return mergeIntervals(blocked);
}

/* ==========================================================================
 * 5. 水面法线贴图（代码生成，可无缝平铺）
 * ========================================================================*/

/**
 * 生成可无缝平铺的水面法线贴图。
 *
 * 高度场用**整数波数的正弦叠加**（离散傅里叶基），因此在贴图边界处严格连续：
 * `h(u,v) = Σ Aₖ·sin(2π(pₖ·u + qₖ·v) + φₖ)`，`pₖ, qₖ ∈ ℤ`。
 * 法线由解析梯度得到：`n = normalize(−∂h/∂u, −∂h/∂v, 1)`，再编码到 `[0,255]`。
 * @param {Object} rng 种子 RNG（契约 §3.1）
 * @param {number} size 贴图边长（像素）
 * @param {number} aniso 各向异性过滤级别
 * @returns {THREE.DataTexture} 切线空间法线图（`NoColorSpace`）
 */
function createWaterNormalTexture(rng, size, aniso) {
  // 整数频率保证贴图可无缝平铺。波数偏多且偏高频：低频分量过强会让
  // 大尺度平铺（260m）在水面上显出油斑状色块。
  const waves = [];
  const count = 26;
  for (let i = 0; i < count; i++) {
    const p = rng.int(-9, 9);
    const q = rng.int(-9, 9);
    if (p === 0 && q === 0) {
      waves.push({ p: 1, q: rng.int(2, 6), amp: 0.32, phase: rng.range(0, Math.PI * 2) });
      continue;
    }
    const freq = Math.hypot(p, q);
    waves.push({
      p,
      q,
      amp: 1 / (1 + Math.pow(freq, 1.8) * 0.35),
      phase: rng.range(0, Math.PI * 2)
    });
  }
  const data = new Uint8Array(size * size * 4);
  const TAU = Math.PI * 2;
  const strength = 0.85;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let du = 0;
      let dv = 0;
      for (let k = 0; k < waves.length; k++) {
        const w = waves[k];
        const ang = TAU * (w.p * u + w.q * v) + w.phase;
        const cosv = Math.cos(ang) * w.amp * TAU;
        du += cosv * w.p;
        dv += cosv * w.q;
      }
      du *= strength / count;
      dv *= strength / count;
      const inv = 1 / Math.sqrt(du * du + dv * dv + 1);
      const o = (y * size + x) * 4;
      data[o] = Math.round((-du * inv * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((-dv * inv * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = aniso;
  // 基础平铺 = UV_WATER（260m）。更细的波纹在着色器内叠加，并随距离淡出，
  // 避免开阔水面在掠射角下出现周期性摩尔纹。
  tex.repeat.set(1, 1);
  tex.needsUpdate = true;
  return tex;
}

/* ==========================================================================
 * 6. 材质
 * ========================================================================*/

/**
 * 建立五组材质。除水面外全部走 `patchCityMaterial`，以获得雨天积水、雪天积雪、闪电补光。
 * @param {Object} textures `ctx0.textures`（契约 §3.5）
 * @param {Object|null} env `ctx0.env`（契约 §3.7）
 * @param {THREE.Texture} waterNormal 自建水面法线图
 * @param {Object} waterUniforms 水面动画 uniforms
 * @returns {Object} 材质集合
 */
function createRoadMaterials(textures, env, waterNormal, waterUniforms) {
  const tex = textures || {};
  const patchOpts = { puddles: true, snowAmount: 0.9 };

  const asphalt = new THREE.MeshStandardMaterial({
    name: 'roads-asphalt',
    color: 0xffffff,
    map: tex.asphalt || null,
    roughnessMap: tex.asphaltRough || null,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.03,
    // 压过中央公园地形边缘（CITY.park 的边界落在道路中心线上，必然与地形共面）
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const sidewalk = new THREE.MeshStandardMaterial({
    name: 'roads-sidewalk',
    color: 0xffffff,
    map: tex.sidewalk || null,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.02
  });

  // 标线：与路面完全共面，仅靠 polygonOffset 分层（相对沥青恰为契约要求的 −1 / −1）
  const markings = new THREE.MeshStandardMaterial({
    name: 'roads-markings',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });

  const greenbelt = new THREE.MeshStandardMaterial({
    name: 'roads-greenbelt',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.98,
    metalness: 0.0
  });

  patchCityMaterial(asphalt, env, patchOpts);
  patchCityMaterial(sidewalk, env, patchOpts);
  patchCityMaterial(markings, env, patchOpts);
  patchCityMaterial(greenbelt, env, patchOpts);

  // 水体按介电质处理：metalness 0 + 极低粗糙度，掠射角靠菲涅尔反射天空，
  // 正视角露出深水本色。不挂颜色贴图——平铺的颜色纹理在开阔水面会形成条纹。
  const water = new THREE.MeshStandardMaterial({
    name: 'roads-water',
    color: 0x11333f,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughness: 0.085,
    metalness: 0.0,
    envMapIntensity: 1.7
  });
  attachWaterShader(water, waterUniforms);

  return { asphalt, sidewalk, markings, greenbelt, water };
}

/**
 * 给水面材质注入双层滚动法线与夜间压暗。
 *
 * 注入点 `#include <normal_fragment_maps>` 之后：此时 `tbn`（由
 * `normal_fragment_begin` 用 `getTangentFrame` 求出）与 `normalScale` 均在作用域内，
 * 用两套不同速度、不同缩放的 UV 采样同一张可平铺法线图并叠加，得到无明显周期感的波纹。
 * 叠加方式为 Whiteout blend：`n = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z))`。
 * @param {THREE.MeshStandardMaterial} material 水面材质
 * @param {Object} uniforms `{ uWaveTime, uWaveAmp, uWaterNight }`
 * @returns {void}
 */
function attachWaterShader(material, uniforms) {
  material.customProgramCacheKey = () => 'roads-water-waves-v2';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaveTime = uniforms.uWaveTime;
    shader.uniforms.uWaveAmp = uniforms.uWaveAmp;
    shader.uniforms.uWaterNight = uniforms.uWaterNight;

    const pars = [
      '#include <common>',
      'uniform float uWaveTime;',
      'uniform float uWaveAmp;',
      'uniform float uWaterNight;'
    ].join('\n');
    if (shader.fragmentShader.indexOf('#include <common>') !== -1) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', () => pars);
    }

    if (shader.fragmentShader.indexOf('#include <color_fragment>') !== -1) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        () => [
          '#include <color_fragment>',
          '\t// 夜间水体压暗（白天靠环境光/天光，夜里只剩城市反光）',
          '\tdiffuseColor.rgb *= mix( 1.0, 0.30, clamp( uWaterNight, 0.0, 1.0 ) );'
        ].join('\n')
      );
    }

    if (shader.fragmentShader.indexOf('#include <normal_fragment_maps>') !== -1) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        () => [
          '#include <normal_fragment_maps>',
          '#ifdef USE_NORMALMAP_TANGENTSPACE',
          '\t{',
          '\t\t// 三个尺度的滚动法线叠加（涌浪 260m / 浪 47m / 细纹 13m）。',
          '\t\t// 细尺度按视距淡出：远处水面收敛为镜面，只反射天空，',
          '\t\t// 从根本上消除掠射角下的平铺摩尔纹。',
          '\t\tfloat wDist = length( vViewPosition );',
          '\t\tfloat wFadeMid = 1.0 - smoothstep( 700.0, 3600.0, wDist );',
          '\t\tfloat wFadeFine = 1.0 - smoothstep( 140.0, 850.0, wDist );',
          '\t\tvec2 wUvA = vNormalMapUv + vec2( uWaveTime * 0.0065, uWaveTime * 0.0041 );',
          '\t\tvec2 wUvB = vNormalMapUv * 5.5 + vec2( -uWaveTime * 0.019, uWaveTime * 0.012 );',
          '\t\tvec2 wUvC = vNormalMapUv * 19.0 + vec2( uWaveTime * 0.043, uWaveTime * 0.031 );',
          '\t\tvec3 wNA = texture2D( normalMap, wUvA ).xyz * 2.0 - 1.0;',
          '\t\tvec3 wNB = texture2D( normalMap, wUvB ).xyz * 2.0 - 1.0;',
          '\t\tvec3 wNC = texture2D( normalMap, wUvC ).xyz * 2.0 - 1.0;',
          '\t\tvec2 wXY = wNA.xy * 0.9 + wNB.xy * 0.5 * wFadeMid + wNC.xy * 0.28 * wFadeFine;',
          '\t\tvec3 wMapN = normalize( vec3( wXY, 1.0 ) );',
          '\t\twMapN.xy *= normalScale * uWaveAmp;',
          '\t\tnormal = normalize( tbn * wMapN );',
          '\t\t// 远水抬高粗糙度，避免镜面高频噪点闪烁',
          '\t\troughnessFactor = mix( roughnessFactor, 0.30, smoothstep( 1500.0, 6000.0, wDist ) );',
          '\t}',
          '#endif'
        ].join('\n')
      );
    }
  };
  material.needsUpdate = true;
}

/* ==========================================================================
 * 7. 布局：由 plan + SPEC 推导出全部铺装分区
 * ========================================================================*/

/**
 * 由 `ctx0.plan` 推导铺装布局。
 * @param {Object|null} plan CityPlan（契约 §4.1）
 * @returns {Object} 布局上下文
 */
function buildLayout(plan) {
  const AV = plan && Array.isArray(plan.avenueXs) && plan.avenueXs.length > 1
    ? plan.avenueXs.slice().sort((a, b) => a - b)
    : SPEC.avenueXs.slice();

  let ST;
  if (plan && Array.isArray(plan.streetZs) && plan.streetZs.length > 1) {
    ST = plan.streetZs.slice().sort((a, b) => a - b);
  } else {
    ST = [];
    for (let z = SPEC.minZ; z <= SPEC.maxZ + EPS; z += SPEC.streetSpacing) ST.push(z);
  }

  // 公园矩形：优先取 plan.parkPolygon 的包围盒
  let park = { ...SPEC.park };
  if (plan && Array.isArray(plan.parkPolygon) && plan.parkPolygon.length >= 3) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of plan.parkPolygon) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < z0) z0 = p[1];
      if (p[1] > z1) z1 = p[1];
    }
    if (Number.isFinite(x0) && x1 > x0 && z1 > z0) park = { minX: x0, maxX: x1, minZ: z0, maxZ: z1 };
  }

  const avHalf = SPEC.avenueRoadWidth * 0.5;
  const stHalf = SPEC.streetRoadWidth * 0.5;
  const sw = SPEC.sidewalkWidth;
  const bw = buildBroadway(plan ? plan.broadway : null);

  // 公园「路缘矩形」R：公园矩形扣掉半幅路面；「可用矩形」P：R 再扣掉一条人行道
  const R = {
    minX: park.minX + avHalf,
    maxX: park.maxX - avHalf,
    minZ: park.minZ + stHalf,
    maxZ: park.maxZ - stHalf
  };
  const P = {
    minX: R.minX + sw,
    maxX: R.maxX - sw,
    minZ: R.minZ + sw,
    maxZ: R.maxZ - sw
  };

  const layout = {
    minX: SPEC.minX,
    maxX: SPEC.maxX,
    minZ: Math.min(SPEC.minZ, ST[0]),
    maxZ: Math.max(SPEC.maxZ, ST[ST.length - 1]),
    AV,
    ST,
    avHalf,
    stHalf,
    sw,
    park,
    R,
    P,
    bw,
    /** 百老汇车行道半宽：正交网格按此内缩，空出的部分由斜街自己填 */
    bandRoad: bw ? bw.half : 0,
    /** 百老汇「车行道 + 两侧人行道」半宽：地坪/人行道按此内缩，与 grid.js 裁地块一致 */
    bandWalk: bw ? bw.half + sw : 0
  };

  /**
   * 判断某条大道的某一纵段是否穿越公园（穿越则不铺）。
   * 只有整幅路面都落在公园内部的大道才会被跳过（公园边界上的大道照铺）。
   * @param {number} x 大道中心线 X
   * @param {number} zc 段中心 Z
   * @returns {boolean} 是否跳过
   */
  layout.avenueInPark = (x, zc) =>
    x > park.minX + avHalf + EPS &&
    x < park.maxX - avHalf - EPS &&
    zc > park.minZ + EPS &&
    zc < park.maxZ - EPS;

  /**
   * 判断某条横街的某一横段是否穿越公园。
   * @param {number} z 横街中心线 Z
   * @param {number} xc 段中心 X
   * @returns {boolean} 是否跳过
   */
  layout.streetInPark = (z, xc) =>
    z > park.minZ + stHalf + EPS &&
    z < park.maxZ - stHalf - EPS &&
    xc > park.minX + EPS &&
    xc < park.maxX - EPS;

  // 大道纵向可铺段（相邻横街之间 + 两端余量），供路面与标线共用
  layout.avenueSpans = AV.map((x) => {
    const spans = [];
    if (ST[0] - stHalf > layout.minZ + 0.5) {
      spans.push([layout.minZ, ST[0] - stHalf]);
    }
    for (let j = 0; j < ST.length - 1; j++) {
      const z0 = ST[j] + stHalf;
      const z1 = ST[j + 1] - stHalf;
      if (z1 - z0 < 0.5) continue;
      if (layout.avenueInPark(x, (z0 + z1) * 0.5)) continue;
      spans.push([z0, z1]);
    }
    if (layout.maxZ - (ST[ST.length - 1] + stHalf) > 0.5) {
      spans.push([ST[ST.length - 1] + stHalf, layout.maxZ]);
    }
    return spans;
  });

  // 横街横向可铺段
  layout.streetSpans = ST.map((z) => {
    const spans = [];
    if (AV[0] - avHalf > layout.minX + 0.5) spans.push([layout.minX, AV[0] - avHalf]);
    for (let i = 0; i < AV.length - 1; i++) {
      const x0 = AV[i] + avHalf;
      const x1 = AV[i + 1] - avHalf;
      if (x1 - x0 < 0.5) continue;
      if (layout.streetInPark(z, (x0 + x1) * 0.5)) continue;
      spans.push([x0, x1]);
    }
    if (layout.maxX - (AV[AV.length - 1] + avHalf) > 0.5) {
      spans.push([AV[AV.length - 1] + avHalf, layout.maxX]);
    }
    return spans;
  });

  // 「街区地坪」网格：相邻道路人行道外沿之间的矩形，与 grid.js 的街区可建矩形一一对应
  const cols = [];
  if (AV[0] - avHalf - sw > layout.minX + 1) cols.push([layout.minX, AV[0] - avHalf - sw]);
  for (let i = 0; i < AV.length - 1; i++) {
    const x0 = AV[i] + avHalf + sw;
    const x1 = AV[i + 1] - avHalf - sw;
    if (x1 - x0 > 1) cols.push([x0, x1]);
  }
  if (layout.maxX - (AV[AV.length - 1] + avHalf + sw) > 1) {
    cols.push([AV[AV.length - 1] + avHalf + sw, layout.maxX]);
  }

  const rows = [];
  if (ST[0] - stHalf - sw > layout.minZ + 1) rows.push([layout.minZ, ST[0] - stHalf - sw]);
  for (let j = 0; j < ST.length - 1; j++) {
    const z0 = ST[j] + stHalf + sw;
    const z1 = ST[j + 1] - stHalf - sw;
    if (z1 - z0 > 1) rows.push([z0, z1]);
  }
  if (layout.maxZ - (ST[ST.length - 1] + stHalf + sw) > 1) {
    rows.push([ST[ST.length - 1] + stHalf + sw, layout.maxZ]);
  }

  layout.blockCells = [];
  for (let ci = 0; ci < cols.length; ci++) {
    for (let ri = 0; ri < rows.length; ri++) {
      const cx = (cols[ci][0] + cols[ci][1]) * 0.5;
      const cz = (rows[ri][0] + rows[ri][1]) * 0.5;
      // 公园所在的格子交给 sculpt/terrain.js，本模块只做它的外围
      if (cx > park.minX && cx < park.maxX && cz > park.minZ && cz < park.maxZ) continue;
      layout.blockCells.push({ x0: cols[ci][0], z0: rows[ri][0], x1: cols[ci][1], z1: rows[ri][1] });
    }
  }

  // 需要铺装的路口（公园内部的十字不存在）
  layout.junctions = [];
  for (let i = 0; i < AV.length; i++) {
    for (let j = 0; j < ST.length; j++) {
      const x = AV[i];
      const z = ST[j];
      if (
        x > park.minX + avHalf + EPS && x < park.maxX - avHalf - EPS &&
        z > park.minZ + stHalf + EPS && z < park.maxZ - stHalf - EPS
      ) {
        continue;
      }
      layout.junctions.push({ x, z, ai: i, si: j });
    }
  }

  return layout;
}

/* ==========================================================================
 * 8. 车行道（沥青）
 * ========================================================================*/

/** 沥青贴图的世界平铺尺度（米） */
const UV_ASPHALT = 10;
/** 人行道贴图的世界平铺尺度（米） */
const UV_WALK = 5;
/** 水面贴图的世界平铺尺度（米） */
const UV_WATER = 260;

/**
 * 把多边形裁到城市陆地矩形内。
 * @param {Array<[number, number]>} poly 输入
 * @param {Object} L 布局
 * @returns {Array<[number, number]>} 裁剪结果
 */
function clipPolyToCity(poly, L) {
  let p = clipByFn(poly, (q) => q[0] - L.minX);
  p = clipByFn(p, (q) => L.maxX - q[0]);
  p = clipByFn(p, (q) => q[1] - L.minZ);
  p = clipByFn(p, (q) => L.maxZ - q[1]);
  return p;
}

/**
 * 铺一块车行道矩形：先裁到陆地范围，再挖掉百老汇车行道带。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @param {number} x0 西边界
 * @param {number} z0 北边界
 * @param {number} x1 东边界
 * @param {number} z1 南边界
 * @param {number[]} col 顶点色
 * @returns {void}
 */
function emitRoadRect(b, L, x0, z0, x1, z1, col) {
  const cx0 = Math.max(x0, L.minX);
  const cx1 = Math.min(x1, L.maxX);
  const cz0 = Math.max(z0, L.minZ);
  const cz1 = Math.min(z1, L.maxZ);
  if (cx1 - cx0 < 0.05 || cz1 - cz0 < 0.05) return;
  const polys = subtractBandPolys([rectPoly(cx0, cz0, cx1, cz1)], L.bw, L.bandRoad);
  for (let i = 0; i < polys.length; i++) b.addTopPoly(polys[i], 0, UV_ASPHALT, col);
}

/**
 * 生成全部车行道：大道纵向条带、横街横向条带、路口方块、百老汇斜街带。
 * 四类互不重叠——横街被大道切断、路口单独成块、正交网格统一挖掉百老汇带。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @returns {void}
 */
function buildAsphalt(b, L) {
  const colAvenue = [1, 1, 1];
  const colStreet = [0.965, 0.965, 0.975];
  const colJunction = [0.86, 0.865, 0.885];
  const colBroadway = [0.995, 0.985, 0.96];

  // 大道
  for (let i = 0; i < L.AV.length; i++) {
    const x = L.AV[i];
    const spans = L.avenueSpans[i];
    for (let k = 0; k < spans.length; k++) {
      emitRoadRect(b, L, x - L.avHalf, spans[k][0], x + L.avHalf, spans[k][1], colAvenue);
    }
  }

  // 横街
  for (let j = 0; j < L.ST.length; j++) {
    const z = L.ST[j];
    const spans = L.streetSpans[j];
    for (let k = 0; k < spans.length; k++) {
      emitRoadRect(b, L, spans[k][0], z - L.stHalf, spans[k][1], z + L.stHalf, colStreet);
    }
  }

  // 路口铺装（略深的磨损色）
  for (let k = 0; k < L.junctions.length; k++) {
    const it = L.junctions[k];
    emitRoadRect(b, L, it.x - L.avHalf, it.z - L.stHalf, it.x + L.avHalf, it.z + L.stHalf, colJunction);
  }

  // 百老汇斜街：正交网格已按 bandRoad 让位，这里整条填回（含所有斜交路口）
  const bw = L.bw;
  if (!bw) return;
  const step = 40;
  const count = Math.max(1, Math.ceil(bw.length / step));
  for (let k = 0; k < count; k++) {
    const t0 = (k / count) * bw.length;
    const t1 = ((k + 1) / count) * bw.length;
    const a = bw.pointAt(t0, -bw.half);
    const bpt = bw.pointAt(t1, -bw.half);
    const c = bw.pointAt(t1, bw.half);
    const d = bw.pointAt(t0, bw.half);
    const poly = clipPolyToCity([a, bpt, c, d], L);
    if (poly.length >= 3) b.addTopPoly(poly, 0, UV_ASPHALT, colBroadway);
  }
}

/* ==========================================================================
 * 9. 人行道 / 路缘石 / 街区地坪 / 滨水挡墙 / 公园矮墙
 * ========================================================================*/

/**
 * 铺一块人行道级（y = 0.18）水平矩形：裁到陆地范围并挖掉「百老汇路面+人行道」带。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @param {number} x0 西边界
 * @param {number} z0 北边界
 * @param {number} x1 东边界
 * @param {number} z1 南边界
 * @param {number} y 高程
 * @param {number[]} col 顶点色
 * @returns {void}
 */
function emitWalkRect(b, L, x0, z0, x1, z1, y, col) {
  // 边界处让出挡墙压顶的宽度，避免与压顶面共面
  const cx0 = Math.max(x0, L.minX + BULKHEAD_CAP);
  const cx1 = Math.min(x1, L.maxX - BULKHEAD_CAP);
  const cz0 = Math.max(z0, L.minZ + BULKHEAD_CAP);
  const cz1 = Math.min(z1, L.maxZ - BULKHEAD_CAP);
  if (cx1 - cx0 < 0.05 || cz1 - cz0 < 0.05) return;
  const polys = subtractBandPolys([rectPoly(cx0, cz0, cx1, cz1)], L.bw, L.bandWalk);
  for (let i = 0; i < polys.length; i++) b.addTopPoly(polys[i], y, UV_WALK, col);
}

/**
 * 沿 X 方向的路缘石侧面（法线朝 ±Z），按百老汇带打断。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @param {number} z 边线 Z
 * @param {number} x0 起点 X
 * @param {number} x1 终点 X
 * @param {number} nz 外法线 Z 分量（+1 / −1）
 * @param {number} yB 底高程
 * @param {number} yT 顶高程
 * @param {number[]} col 顶点色
 * @returns {void}
 */
function emitCurbX(b, L, z, x0, x1, nz, yB, yT, col) {
  const a = Math.max(x0, L.minX);
  const c = Math.min(x1, L.maxX);
  if (c - a < 0.05) return;
  const spans = xSpansOutsideBand(z, a, c, L.bw, L.bandWalk);
  for (let i = 0; i < spans.length; i++) {
    b.addWall(spans[i][0], z, spans[i][1], z, yB, yT, 0, nz, UV_WALK, col);
  }
}

/**
 * 沿 Z 方向的路缘石侧面（法线朝 ±X），按百老汇带打断。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @param {number} x 边线 X
 * @param {number} z0 起点 Z
 * @param {number} z1 终点 Z
 * @param {number} nx 外法线 X 分量（+1 / −1）
 * @param {number} yB 底高程
 * @param {number} yT 顶高程
 * @param {number[]} col 顶点色
 * @returns {void}
 */
function emitCurbZ(b, L, x, z0, z1, nx, yB, yT, col) {
  const a = Math.max(z0, L.minZ);
  const c = Math.min(z1, L.maxZ);
  if (c - a < 0.05) return;
  const spans = zSpansOutsideBand(x, a, c, L.bw, L.bandWalk);
  for (let i = 0; i < spans.length; i++) {
    b.addWall(x, spans[i][0], x, spans[i][1], yB, yT, nx, 0, UV_WALK, col);
  }
}

/**
 * 生成人行道组：街区地坪、四周人行道环带与路缘石、百老汇人行道、
 * 公园外圈人行道与矮石墙、沿岸挡墙。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @returns {void}
 */
function buildSidewalk(b, L) {
  const colWalk = [1, 1, 1];
  const colGround = [0.92, 0.915, 0.9];
  const colCurb = [0.86, 0.85, 0.82];
  const colWall = [0.7, 0.68, 0.63];
  const colBulk = [0.76, 0.755, 0.73];
  const sw = L.sw;

  // --- 街区地坪 + 环形人行道 + 路缘石 ---
  for (let i = 0; i < L.blockCells.length; i++) {
    const c = L.blockCells[i];
    emitWalkRect(b, L, c.x0, c.z0, c.x1, c.z1, CURB_H, colGround);

    const ox0 = Math.max(c.x0 - sw, L.minX);
    const ox1 = Math.min(c.x1 + sw, L.maxX);
    const oz0 = Math.max(c.z0 - sw, L.minZ);
    const oz1 = Math.min(c.z1 + sw, L.maxZ);
    emitWalkRect(b, L, ox0, oz0, ox1, c.z0, CURB_H, colWalk);
    emitWalkRect(b, L, ox0, c.z1, ox1, oz1, CURB_H, colWalk);
    emitWalkRect(b, L, ox0, c.z0, c.x0, c.z1, CURB_H, colWalk);
    emitWalkRect(b, L, c.x1, c.z0, ox1, c.z1, CURB_H, colWalk);

    if (oz0 > L.minZ + EPS) emitCurbX(b, L, oz0, ox0, ox1, -1, 0, CURB_H, colCurb);
    if (oz1 < L.maxZ - EPS) emitCurbX(b, L, oz1, ox0, ox1, 1, 0, CURB_H, colCurb);
    if (ox0 > L.minX + EPS) emitCurbZ(b, L, ox0, oz0, oz1, -1, 0, CURB_H, colCurb);
    if (ox1 < L.maxX - EPS) emitCurbZ(b, L, ox1, oz0, oz1, 1, 0, CURB_H, colCurb);
  }

  // --- 公园外圈：人行道环带 + 路缘石 + 矮石墙 ---
  const R = L.R;
  const P = L.P;
  if (R.maxX - R.minX > 4 && R.maxZ - R.minZ > 4) {
    emitWalkRect(b, L, R.minX, R.minZ, R.maxX, P.minZ, CURB_H, colWalk);
    emitWalkRect(b, L, R.minX, P.maxZ, R.maxX, R.maxZ, CURB_H, colWalk);
    emitWalkRect(b, L, R.minX, P.minZ, P.minX, P.maxZ, CURB_H, colWalk);
    emitWalkRect(b, L, P.maxX, P.minZ, R.maxX, P.maxZ, CURB_H, colWalk);

    emitCurbX(b, L, R.minZ, R.minX, R.maxX, -1, 0, CURB_H, colCurb);
    emitCurbX(b, L, R.maxZ, R.minX, R.maxX, 1, 0, CURB_H, colCurb);
    emitCurbZ(b, L, R.minX, R.minZ, R.maxZ, -1, 0, CURB_H, colCurb);
    emitCurbZ(b, L, R.maxX, R.minZ, R.maxZ, 1, 0, CURB_H, colCurb);

    // 矮石墙：贴着 P 的边界向内 PARK_WALL_T，压顶 + 内外两个立面
    const t = PARK_WALL_T;
    emitWalkRect(b, L, P.minX, P.minZ, P.maxX, P.minZ + t, PARK_WALL_H, colWall);
    emitWalkRect(b, L, P.minX, P.maxZ - t, P.maxX, P.maxZ, PARK_WALL_H, colWall);
    emitWalkRect(b, L, P.minX, P.minZ + t, P.minX + t, P.maxZ - t, PARK_WALL_H, colWall);
    emitWalkRect(b, L, P.maxX - t, P.minZ + t, P.maxX, P.maxZ - t, PARK_WALL_H, colWall);

    emitCurbX(b, L, P.minZ, P.minX, P.maxX, -1, 0, PARK_WALL_H, colWall);
    emitCurbX(b, L, P.minZ + t, P.minX + t, P.maxX - t, 1, 0, PARK_WALL_H, colWall);
    emitCurbX(b, L, P.maxZ, P.minX, P.maxX, 1, 0, PARK_WALL_H, colWall);
    emitCurbX(b, L, P.maxZ - t, P.minX + t, P.maxX - t, -1, 0, PARK_WALL_H, colWall);
    emitCurbZ(b, L, P.minX, P.minZ, P.maxZ, -1, 0, PARK_WALL_H, colWall);
    emitCurbZ(b, L, P.minX + t, P.minZ + t, P.maxZ - t, 1, 0, PARK_WALL_H, colWall);
    emitCurbZ(b, L, P.maxX, P.minZ, P.maxZ, 1, 0, PARK_WALL_H, colWall);
    emitCurbZ(b, L, P.maxX - t, P.minZ + t, P.maxZ - t, -1, 0, PARK_WALL_H, colWall);
  }

  // --- 百老汇两侧人行道（按大道/横街车行道带精确打断，避免横跨马路）---
  const bw = L.bw;
  if (bw) {
    const step = 60;
    const count = Math.max(1, Math.ceil(bw.length / step));
    for (let side = -1; side <= 1; side += 2) {
      const sIn = side * bw.half;
      const sOut = side * (bw.half + sw);
      for (let k = 0; k < count; k++) {
        const t0 = (k / count) * bw.length;
        const t1 = ((k + 1) / count) * bw.length;
        const quad = [bw.pointAt(t0, sIn), bw.pointAt(t1, sIn), bw.pointAt(t1, sOut), bw.pointAt(t0, sOut)];
        let polys = [clipPolyToCity(quad, L)];
        if (polys[0].length < 3) continue;
        for (let i = 0; i < L.AV.length; i++) {
          polys = subtractSlabX(polys, L.AV[i] - L.avHalf, L.AV[i] + L.avHalf);
        }
        for (let j = 0; j < L.ST.length; j++) {
          polys = subtractSlabZ(polys, L.ST[j] - L.stHalf, L.ST[j] + L.stHalf);
        }
        for (let i = 0; i < polys.length; i++) b.addTopPoly(polys[i], CURB_H, UV_WALK, colWalk);
      }
      // 路缘石：沿 s = ±half 的线，按被正交车行道占用的沿程区间打断
      const blocked = broadwayBlockedSpans(bw, sIn, L.AV, L.ST, L.avHalf, L.stHalf, 0);
      const open = complementIntervals(blocked, 0, bw.length, 1.5);
      const nx = -side * bw.nx;
      const nz = -side * bw.nz;
      for (let i = 0; i < open.length; i++) {
        const pa = bw.pointAt(open[i][0], sIn);
        const pb = bw.pointAt(open[i][1], sIn);
        if (pb[1] < L.minZ || pa[1] > L.maxZ) continue;
        b.addWall(pa[0], pa[1], pb[0], pb[1], 0, CURB_H, nx, nz, UV_WALK, colCurb);
      }
    }
  }

  // --- 沿岸挡墙（压顶 + 外立面 + 内立面），把陆地封边，避免看到地面背面 ---
  const cap = BULKHEAD_CAP;
  const seg = 48;
  const edges = [
    { axis: 'z', v: L.minZ, a: L.minX, c: L.maxX, n: -1 },
    { axis: 'z', v: L.maxZ, a: L.minX, c: L.maxX, n: 1 },
    { axis: 'x', v: L.minX, a: L.minZ, c: L.maxZ, n: -1 },
    { axis: 'x', v: L.maxX, a: L.minZ, c: L.maxZ, n: 1 }
  ];
  for (let e = 0; e < edges.length; e++) {
    const ed = edges[e];
    const n = Math.max(1, Math.ceil((ed.c - ed.a) / seg));
    for (let k = 0; k < n; k++) {
      const p0 = ed.a + ((ed.c - ed.a) * k) / n;
      const p1 = ed.a + ((ed.c - ed.a) * (k + 1)) / n;
      if (ed.axis === 'z') {
        const inner = ed.v - ed.n * cap;
        b.addWall(p0, ed.v, p1, ed.v, BULKHEAD_BOTTOM, CURB_H, 0, ed.n, UV_WALK, colBulk);
        b.addTopRect(p0, Math.min(ed.v, inner), p1, Math.max(ed.v, inner), CURB_H, UV_WALK, colBulk);
        b.addWall(p0, inner, p1, inner, 0, CURB_H, 0, -ed.n, UV_WALK, colCurb);
      } else {
        const inner = ed.v - ed.n * cap;
        b.addWall(ed.v, p0, ed.v, p1, BULKHEAD_BOTTOM, CURB_H, ed.n, 0, UV_WALK, colBulk);
        b.addTopRect(Math.min(ed.v, inner), p0, Math.max(ed.v, inner), p1, CURB_H, UV_WALK, colBulk);
        b.addWall(inner, p0, inner, p1, 0, CURB_H, -ed.n, 0, UV_WALK, colCurb);
      }
    }
  }
}

/* ==========================================================================
 * 10. 路面标线（贴花平面，与路面共面，靠 polygonOffset 分层）
 * ========================================================================*/

/** 标线线宽（米） */
const LINE_W = 0.16;
/** 双黄线内侧净距（米） */
const DOUBLE_GAP = 0.2;
/** 虚线段长（米） */
const DASH_LEN = 3.0;
/** 斑马线条带宽（米） */
const ZEBRA_W = 0.55;
/** 斑马线条带净距（米） */
const ZEBRA_GAP = 0.55;
/** 斑马线整体进深（米） */
const ZEBRA_DEPTH = 3.6;
/** 停止线宽度（米） */
const STOP_W = 0.5;

/**
 * 生成全部标线。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @param {Object|null} plan CityPlan（读取 `hasSignal`）
 * @param {{laneDashes: boolean, dashPeriod: number}} detail 画质细节
 * @returns {void}
 */
function buildMarkings(b, L, plan, detail) {
  const bw = L.bw;
  const band = L.bandRoad;
  const half = LINE_W * 0.5;
  const doubleOff = DOUBLE_GAP * 0.5 + half;
  const avLaneOff = L.avHalf * 0.5;

  /**
   * 铺一条标线矩形（裁到陆地范围，避免在岸线处伸出路面）。
   * @param {number} x0 西边界
   * @param {number} z0 北边界
   * @param {number} x1 东边界
   * @param {number} z1 南边界
   * @param {number[]} col 顶点色
   * @returns {void}
   */
  const markRect = (x0, z0, x1, z1, col) => {
    const cx0 = Math.max(x0, L.minX);
    const cx1 = Math.min(x1, L.maxX);
    const cz0 = Math.max(z0, L.minZ);
    const cz1 = Math.min(z1, L.maxZ);
    if (cx1 - cx0 < 0.02 || cz1 - cz0 < 0.02) return;
    b.addTopRect(cx0, cz0, cx1, cz1, 0, 1, col);
  };

  /**
   * 某个坐标是否落在已铺设的道路分段内（用于判断停止线所在的进口道是否存在）。
   * @param {Array<[number, number]>} spans 分段列表
   * @param {number} v 坐标
   * @returns {boolean} 是否在段内
   */
  const inSpans = (spans, v) => {
    for (let i = 0; i < spans.length; i++) {
      if (v >= spans[i][0] && v <= spans[i][1]) return true;
    }
    return false;
  };

  /**
   * 该点是否落在百老汇路面带内（带内的正交标线要让给斜街，否则会透过斜街路面）。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {boolean} 是否在带内
   */
  const inBand = (x, z) => !!bw && Math.abs(bw.offsetAt(x, z)) < band + 0.4;

  // ---- 大道：中央双黄线 + 车道虚线 ----
  for (let i = 0; i < L.AV.length; i++) {
    const x = L.AV[i];
    const spans = L.avenueSpans[i];
    for (let k = 0; k < spans.length; k++) {
      const z0 = spans[k][0] + 1.6;
      const z1 = spans[k][1] - 1.6;
      if (z1 - z0 < 3) continue;

      for (let s = -1; s <= 1; s += 2) {
        const cx = x + s * doubleOff;
        const open = zSpansOutsideBand(cx, z0, z1, bw, band);
        for (let m = 0; m < open.length; m++) {
          markRect(cx - half, open[m][0], cx + half, open[m][1], COL_YELLOW);
        }
      }

      if (!detail.laneDashes) continue;
      for (let s = -1; s <= 1; s += 2) {
        const cx = x + s * avLaneOff;
        for (let z = z0; z + DASH_LEN <= z1; z += detail.dashPeriod) {
          if (inBand(cx, z + DASH_LEN * 0.5)) continue;
          markRect(cx - half, z, cx + half, z + DASH_LEN, COL_WHITE);
        }
      }
    }
  }

  // ---- 横街：中央黄色虚线（单车道对开）----
  for (let j = 0; j < L.ST.length; j++) {
    const z = L.ST[j];
    // 岸线上的边缘街只剩半幅路面，没有「中央」可言，跳过
    if (z - L.stHalf < L.minZ - EPS || z + L.stHalf > L.maxZ + EPS) continue;
    const spans = L.streetSpans[j];
    for (let k = 0; k < spans.length; k++) {
      const x0 = spans[k][0] + 1.6;
      const x1 = spans[k][1] - 1.6;
      if (x1 - x0 < 3) continue;
      for (let x = x0; x + DASH_LEN <= x1; x += detail.dashPeriod) {
        if (inBand(x + DASH_LEN * 0.5, z)) continue;
        markRect(x, z - half, x + DASH_LEN, z + half, COL_YELLOW);
      }
    }
  }

  // ---- 百老汇：双黄线 + 车道虚线（按正交车行道带打断）----
  if (bw) {
    /**
     * 沿斜街铺一段矩形标线。
     * @param {number} t0 起点弧长
     * @param {number} t1 终点弧长
     * @param {number} sc 横向中心偏移
     * @param {number[]} col 颜色
     * @returns {void}
     */
    const bar = (t0, t1, sc, col) => {
      const poly = clipPolyToCity(
        [
          bw.pointAt(t0, sc - half),
          bw.pointAt(t1, sc - half),
          bw.pointAt(t1, sc + half),
          bw.pointAt(t0, sc + half)
        ],
        L
      );
      if (poly.length >= 3) b.addTopPoly(poly, 0, 1, col);
    };

    for (let s = -1; s <= 1; s += 2) {
      const sc = s * doubleOff;
      const open = complementIntervals(
        broadwayBlockedSpans(bw, sc, L.AV, L.ST, L.avHalf, L.stHalf, 1.6),
        0,
        bw.length,
        2
      );
      for (let m = 0; m < open.length; m++) bar(open[m][0], open[m][1], sc, COL_YELLOW);
    }

    if (detail.laneDashes) {
      for (let s = -1; s <= 1; s += 2) {
        const sc = s * (bw.half * 0.5);
        const open = complementIntervals(
          broadwayBlockedSpans(bw, sc, L.AV, L.ST, L.avHalf, L.stHalf, 1.6),
          0,
          bw.length,
          2
        );
        for (let m = 0; m < open.length; m++) {
          for (let t = open[m][0]; t + DASH_LEN <= open[m][1]; t += detail.dashPeriod) {
            bar(t, t + DASH_LEN, sc, COL_WHITE);
          }
        }
      }
    }
  }

  // ---- 路口：斑马线 + 停止线 ----
  const signal = new Map();
  if (plan && Array.isArray(plan.intersections)) {
    for (let i = 0; i < plan.intersections.length; i++) {
      const it = plan.intersections[i];
      signal.set(`${Math.round(it.x)}|${Math.round(it.z)}`, it.hasSignal !== false);
    }
  }

  const avH = L.avHalf;
  const stH = L.stHalf;
  const period = ZEBRA_W + ZEBRA_GAP;
  const zebraCount = Math.max(2, Math.floor(ZEBRA_DEPTH / period));
  // 南北向斑马线要给东西向斑马线让出角部，避免同材质共面重叠
  const xInner = avH - 0.5 - ZEBRA_DEPTH - 0.8;

  for (let k = 0; k < L.junctions.length; k++) {
    const jn = L.junctions[k];
    const jx = jn.x;
    const jz = jn.z;
    if (bw && Math.abs(bw.offsetAt(jx, jz)) < band + 8) continue;
    if (jz - stH < L.minZ || jz + stH > L.maxZ) continue;

    // 跨横街（行人沿 ±Z 走）：条带长轴沿 Z，位于路口西/东两侧
    for (let s = -1; s <= 1; s += 2) {
      const edge = jx + s * avH;
      for (let n = 0; n < zebraCount; n++) {
        const d = 0.5 + n * period;
        const c0 = edge - s * (d + ZEBRA_W);
        const c1 = edge - s * d;
        markRect(Math.min(c0, c1), jz - stH, Math.max(c0, c1), jz + stH, COL_WHITE);
      }
    }
    // 跨大道（行人沿 ±X 走）：条带长轴沿 X，位于路口北/南两侧
    for (let s = -1; s <= 1; s += 2) {
      const edge = jz + s * stH;
      for (let n = 0; n < zebraCount; n++) {
        const d = 0.5 + n * period;
        const c0 = edge - s * (d + ZEBRA_W);
        const c1 = edge - s * d;
        markRect(jx - xInner, Math.min(c0, c1), jx + xInner, Math.max(c0, c1), COL_WHITE);
      }
    }

    if (signal.get(`${Math.round(jx)}|${Math.round(jz)}`) === false) continue;
    // 停止线：右侧通行，每个**实际存在的**进口道半幅车道各一条，位于斑马线之前
    const off = 1.4;
    const avSpans = L.avenueSpans[jn.ai] || [];
    const stSpans = L.streetSpans[jn.si] || [];
    if (inSpans(avSpans, jz - stH - off - STOP_W * 0.5)) {
      markRect(jx - avH + 0.5, jz - stH - off - STOP_W, jx - 0.3, jz - stH - off, COL_WHITE);
    }
    if (inSpans(avSpans, jz + stH + off + STOP_W * 0.5)) {
      markRect(jx + 0.3, jz + stH + off, jx + avH - 0.5, jz + stH + off + STOP_W, COL_WHITE);
    }
    if (inSpans(stSpans, jx - avH - off - STOP_W * 0.5)) {
      markRect(jx - avH - off - STOP_W, jz + 0.3, jx - avH - off, jz + stH - 0.5, COL_WHITE);
    }
    if (inSpans(stSpans, jx + avH + off + STOP_W * 0.5)) {
      markRect(jx + avH + off, jz - stH + 0.5, jx + avH + off + STOP_W, jz - 0.3, COL_WHITE);
    }
  }
}

/* ==========================================================================
 * 11. 公园外围绿化带
 * ========================================================================*/

/**
 * 生成中央公园外圈的抬高绿化带：矮石墙内侧一圈草地 + 朝向园内的裙边。
 * 草地被细分成约 4m 的小块，配合 `builder.tint` 的噪声得到自然的深浅斑驳。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @returns {void}
 */
function buildGreenbelt(b, L) {
  const P = L.P;
  if (P.maxX - P.minX < 4 * PARK_WALL_T + 4 || P.maxZ - P.minZ < 4 * PARK_WALL_T + 4) return;
  const col = [0.3, 0.42, 0.19];
  const colSkirt = [0.24, 0.3, 0.16];

  // 绿化带外框（贴着矮墙内侧）与内框
  const o = {
    minX: P.minX + PARK_WALL_T,
    maxX: P.maxX - PARK_WALL_T,
    minZ: P.minZ + PARK_WALL_T,
    maxZ: P.maxZ - PARK_WALL_T
  };
  const w = Math.min(BELT_W, (o.maxX - o.minX) * 0.25, (o.maxZ - o.minZ) * 0.25);
  const inn = { minX: o.minX + w, maxX: o.maxX - w, minZ: o.minZ + w, maxZ: o.maxZ - w };

  const bands = [
    { x0: o.minX, z0: o.minZ, x1: o.maxX, z1: inn.minZ },
    { x0: o.minX, z0: inn.maxZ, x1: o.maxX, z1: o.maxZ },
    { x0: o.minX, z0: inn.minZ, x1: inn.minX, z1: inn.maxZ },
    { x0: inn.maxX, z0: inn.minZ, x1: o.maxX, z1: inn.maxZ }
  ];
  const tile = 4;
  for (let i = 0; i < bands.length; i++) {
    const bd = bands[i];
    const nx = Math.max(1, Math.round((bd.x1 - bd.x0) / tile));
    const nz = Math.max(1, Math.round((bd.z1 - bd.z0) / tile));
    for (let a = 0; a < nx; a++) {
      for (let c = 0; c < nz; c++) {
        const x0 = bd.x0 + ((bd.x1 - bd.x0) * a) / nx;
        const x1 = bd.x0 + ((bd.x1 - bd.x0) * (a + 1)) / nx;
        const z0 = bd.z0 + ((bd.z1 - bd.z0) * c) / nz;
        const z1 = bd.z0 + ((bd.z1 - bd.z0) * (c + 1)) / nz;
        const polys = subtractBandPolys([rectPoly(x0, z0, x1, z1)], L.bw, L.bandWalk);
        for (let m = 0; m < polys.length; m++) b.addTopPoly(polys[m], BELT_H, 3, col);
      }
    }
  }

  // 朝向园内的裙边（把抬高的种植台封边）
  const skirt = [
    { x0: inn.minX, z0: inn.minZ, x1: inn.maxX, z1: inn.minZ, nx: 0, nz: 1 },
    { x0: inn.minX, z0: inn.maxZ, x1: inn.maxX, z1: inn.maxZ, nx: 0, nz: -1 },
    { x0: inn.minX, z0: inn.minZ, x1: inn.minX, z1: inn.maxZ, nx: 1, nz: 0 },
    { x0: inn.maxX, z0: inn.minZ, x1: inn.maxX, z1: inn.maxZ, nx: -1, nz: 0 }
  ];
  for (let i = 0; i < skirt.length; i++) {
    const s = skirt[i];
    const spans = s.nx === 0
      ? xSpansOutsideBand(s.z0, s.x0, s.x1, L.bw, L.bandWalk)
      : zSpansOutsideBand(s.x0, s.z0, s.z1, L.bw, L.bandWalk);
    for (let m = 0; m < spans.length; m++) {
      if (s.nx === 0) {
        b.addWall(spans[m][0], s.z0, spans[m][1], s.z0, 0, BELT_H, s.nx, s.nz, 3, colSkirt);
      } else {
        b.addWall(s.x0, spans[m][0], s.x0, spans[m][1], 0, BELT_H, s.nx, s.nz, 3, colSkirt);
      }
    }
  }
}

/* ==========================================================================
 * 12. 河流与港湾水面
 * ========================================================================*/

/**
 * 生成水面：哈德逊河（x < minX）、东河（x > maxX）、南端港湾（z > maxZ）与北端水道（z < minZ）。
 * 四块拼成环绕陆地的水域，合并成单个网格（1 drawcall）。
 * @param {SurfaceBuilder} b 累加器
 * @param {Object} L 布局
 * @returns {void}
 */
function buildWater(b, L) {
  const col = [1, 1, 1];
  const rects = [
    { x0: -WATER_FAR_X, z0: -WATER_FAR_Z, x1: L.minX, z1: WATER_FAR_Z },
    { x0: L.maxX, z0: -WATER_FAR_Z, x1: WATER_FAR_X, z1: WATER_FAR_Z },
    { x0: L.minX, z0: -WATER_FAR_Z, x1: L.maxX, z1: L.minZ },
    { x0: L.minX, z0: L.maxZ, x1: L.maxX, z1: WATER_FAR_Z }
  ];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const nx = Math.max(1, Math.min(10, Math.round((r.x1 - r.x0) / 900)));
    const nz = Math.max(1, Math.min(16, Math.round((r.z1 - r.z0) / 900)));
    for (let a = 0; a < nx; a++) {
      for (let c = 0; c < nz; c++) {
        b.addTopRect(
          r.x0 + ((r.x1 - r.x0) * a) / nx,
          r.z0 + ((r.z1 - r.z0) * c) / nz,
          r.x0 + ((r.x1 - r.x0) * (a + 1)) / nx,
          r.z0 + ((r.z1 - r.z0) * (c + 1)) / nz,
          WATER_Y,
          UV_WATER,
          col
        );
      }
    }
  }
}

/* ==========================================================================
 * 13. 对外接口
 * ========================================================================*/

/**
 * 构建整套地面层（契约 §5.1）。
 *
 * @param {Object} ctx0 构建期上下文 `{ plan, heightField, rng, textures, env, quality, seed }`
 * @returns {Object} SystemHandle：`{ object3D, waterMaterial, update, dispose, stats }`
 */
export function createRoads(ctx0) {
  const cfg = ctx0 || {};
  const plan = cfg.plan || null;
  const textures = cfg.textures || {};
  const env = cfg.env || null;
  const quality = cfg.quality === 'low' || cfg.quality === 'medium' ? cfg.quality : 'high';
  const rng = cfg.rng && typeof cfg.rng.fork === 'function'
    ? cfg.rng.fork('roads')
    : makeRng(cfg.seed !== undefined ? cfg.seed : 'roads', 'roads');

  const L = buildLayout(plan);
  const detail = quality === 'low'
    ? { laneDashes: false, dashPeriod: 18 }
    : quality === 'medium'
      ? { laneDashes: true, dashPeriod: 14 }
      : { laneDashes: true, dashPeriod: 11 };

  // 逐顶点亮度扰动：同种子必得同一结果（契约 §0 禁止 Math.random）
  const noiseWear = makeNoise2D(rng.int(0, 0xffffff));
  const noiseGrass = makeNoise2D(rng.int(0, 0xffffff));

  const asphaltB = new SurfaceBuilder('roads-asphalt');
  asphaltB.tint = (x, z) => 0.9 + 0.14 * (noiseWear(x * 0.011, z * 0.011) * 0.5 + 0.5);
  buildAsphalt(asphaltB, L);

  const walkB = new SurfaceBuilder('roads-sidewalk');
  walkB.tint = (x, z) => 0.88 + 0.2 * (noiseWear(x * 0.02 + 91.3, z * 0.02 - 17.7) * 0.5 + 0.5);
  buildSidewalk(walkB, L);

  const markB = new SurfaceBuilder('roads-markings');
  markB.tint = (x, z) => 0.78 + 0.24 * (noiseWear(x * 0.06 - 41.1, z * 0.06 + 63.9) * 0.5 + 0.5);
  buildMarkings(markB, L, plan, detail);

  const beltB = new SurfaceBuilder('roads-greenbelt');
  beltB.tint = (x, z) =>
    0.72 +
    0.34 * (noiseGrass(x * 0.09, z * 0.09) * 0.5 + 0.5) +
    0.12 * (noiseGrass(x * 0.31 + 12.5, z * 0.31 - 8.25) * 0.5 + 0.5);
  buildGreenbelt(beltB, L);

  const waterB = new SurfaceBuilder('roads-water');
  buildWater(waterB, L);

  const waterUniforms = {
    uWaveTime: { value: 0 },
    uWaveAmp: { value: 1 },
    uWaterNight: { value: 0 }
  };
  const anisotropy = quality === 'low' ? 2 : 4;
  const waterNormal = createWaterNormalTexture(rng.fork('water-normal'), 128, anisotropy);
  const mats = createRoadMaterials(textures, env, waterNormal, waterUniforms);

  const group = new THREE.Group();
  group.name = 'roads';

  /** @type {THREE.Mesh[]} */
  const meshes = [];
  let triangles = 0;

  /**
   * 把一个累加器合并成网格并挂到根节点。
   * @param {SurfaceBuilder} builder 累加器
   * @param {THREE.Material} material 材质
   * @param {number} renderOrder 渲染顺序
   * @returns {void}
   */
  const attach = (builder, material, renderOrder) => {
    const geo = builder.build();
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = builder.name;
    mesh.renderOrder = renderOrder;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    meshes.push(mesh);
    triangles += builder.triangles;
  };

  attach(asphaltB, mats.asphalt, 0);
  attach(walkB, mats.sidewalk, 0);
  attach(markB, mats.markings, 1);
  attach(beltB, mats.greenbelt, 0);
  attach(waterB, mats.water, 0);

  let waveTime = 0;
  let disposed = false;

  const handle = {
    object3D: group,

    /** 水面材质（契约 §5.1 要求导出，主循环无需干预） */
    waterMaterial: mats.water,

    stats: { draws: meshes.length, triangles, cells: L.blockCells.length },

    /**
     * 每帧推进水面动画。**不重建任何几何、不分配新对象。**
     * 雨越大波动越强、流速越快；夜间水体压暗。
     * @param {Object} ctx FrameContext（契约 §2）
     * @returns {void}
     */
    update(ctx) {
      if (disposed || !ctx) return;
      const dt = Number.isFinite(ctx.dt) ? ctx.dt : 0;
      const p = ctx.weather && ctx.weather.params ? ctx.weather.params : null;
      const rain = p && Number.isFinite(p.rainIntensity) ? clamp(p.rainIntensity, 0, 1) : 0;
      const snow = p && Number.isFinite(p.snowIntensity) ? clamp(p.snowIntensity, 0, 1) : 0;
      const windSpeed = ctx.wind && Number.isFinite(ctx.wind.speed) ? ctx.wind.speed : 0;

      waveTime += dt * (0.55 + rain * 1.9 + Math.min(windSpeed, 28) * 0.028);
      waterUniforms.uWaveTime.value = waveTime;
      waterUniforms.uWaveAmp.value = 1 + rain * 2.4 + snow * 0.35;
      waterUniforms.uWaterNight.value = Number.isFinite(ctx.nightFactor)
        ? clamp(ctx.nightFactor, 0, 1)
        : 0;
      mats.water.roughness = 0.11 + rain * 0.17;
    },

    /**
     * 释放本模块自建的几何、材质与贴图。
     * `ctx0.textures` 里的共享贴图由 `core/textures.js` 统一释放，这里不动。
     * @returns {void}
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        if (m.geometry) m.geometry.dispose();
      }
      group.clear();
      meshes.length = 0;
      mats.asphalt.dispose();
      mats.sidewalk.dispose();
      mats.markings.dispose();
      mats.greenbelt.dispose();
      mats.water.dispose();
      waterNormal.dispose();
    }
  };

  return handle;
}
