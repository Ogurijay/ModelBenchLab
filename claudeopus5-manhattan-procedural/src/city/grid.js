/**
 * @file src/city/grid.js
 * @description 曼哈顿路网与地块的**纯数据**基座（契约 §4.1）。
 *
 * 本模块只产出可 JSON 序列化的普通对象/数组，**不 import three**、不创建任何 GPU 资源，
 * 供 `city/roads.js`（铺路）、`city/buildings.js`（建楼）、`sim/traffic.js`（车道图）等模块共用。
 *
 * 算法与公式出处：
 * - 网格路网原型：纽约 1811 年委员会规划（Commissioners' Plan of 1811），南北向大道 + 东西向街道的矩形网格。
 * - 多边形面积：高斯鞋带公式（Gauss's shoelace formula）`A = ½|Σ(xᵢ·z_{i+1} − x_{i+1}·zᵢ)|`。
 * - 多边形形心：面积加权形心 `C = 1/(6A)·Σ(pᵢ + p_{i+1})·(xᵢ·z_{i+1} − x_{i+1}·zᵢ)`。
 * - 点在多边形内：交叉数法（crossing number / Jordan 曲线定理，Shimrat 1962 的射线投射实现）。
 * - 多边形裁剪：Sutherland–Hodgman 算法（Sutherland & Hodgman, CACM 1974）逐半平面裁剪。
 *
 * 坐标约定（契约 §0）：Y 轴向上；+X 东、−X 西；+Z 南（下城）、−Z 北（上城）；1 单位 = 1 米。
 * 多边形顶点一律用 `[x, z]`，顺序为**俯视顺时针**（等价于鞋带公式在 (x,z) 平面上为正）。
 */

import { makeRng } from '../core/rng.js';

/**
 * 全城尺寸常量（契约 §4.1 给定，**不得修改数值**）。
 * 视作只读：其他模块只读取，不写入。
 */
export const CITY = {
  minX: -800,
  maxX: 800,
  minZ: -2400,
  maxZ: 2400,
  avenueXs: [-700, -420, -140, 140, 420, 700],
  streetSpacing: 80,
  avenueRoadWidth: 34,
  streetRoadWidth: 20,
  sidewalkWidth: 6,
  park: { minX: -420, maxX: 140, minZ: -2080, maxZ: -720 },
  broadway: { ax: -700, az: -2400, bx: 300, bz: 2400, width: 30 },
  river: { hudsonX: -800, eastX: 800 },
  bridge: { z: 1900, startX: 760, endX: 1560 }
};

/** 地块最小面宽（米）——切分时的硬约束 */
const MIN_FRONTAGE = 18;
/** 残块最小面积（平方米），小于此值直接丢弃 */
const MIN_LOT_AREA = 220;
/** 判定「三角地块」的最小内角阈值（度） */
const TRIANGLE_MIN_ANGLE_DEG = 45;
/** 三角地块数量下限（契约要求 ≥ 8） */
const MIN_TRIANGLE_LOTS = 8;
/** 三角地块不足时，沿百老汇细分地块的最大重试次数 */
const MAX_REFINE_PASSES = 3;
/** 几何容差 */
const GEOM_EPS = 1e-9;
/** 顶点去重容差（米） */
const WELD_EPS = 1e-6;
/** 超过该进深的街区会先沿 Z 切成多排（公园带内没有横街，会出现 1360m 的超级街区） */
const MAX_BLOCK_DEPTH = 140;
/** 超级街区内部排与排之间预留的通道宽度（米），与横街同宽 + 两侧人行道 */
const INNER_ALLEY_WIDTH = CITY.streetRoadWidth + CITY.sidewalkWidth * 2;
/** 超级街区内部每排的目标进深（米） */
const INNER_ROW_TARGET_DEPTH = 78;
/** 桥面半宽（米），用于 isWater 在桥上返回 false */
const BRIDGE_DECK_HALF_WIDTH = 14;

/** 弧度 → 度 */
const RAD2DEG = 180 / Math.PI;

/* -------------------------------------------------------------------------- */
/* 通用多边形工具（导出）                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 鞋带公式的**有符号**两倍面积（内部用）。
 * 在 (x,z) 平面上为正 ⇔ 顶点顺序为「俯视顺时针」（因为俯视时屏幕纵轴是 −Z）。
 * @param {Array<[number, number]>} polygon 顶点数组
 * @returns {number} 2·A（有符号）
 */
function signedDoubleArea(polygon) {
  const n = polygon.length;
  if (n < 3) return 0;
  let acc = 0;
  let prev = polygon[n - 1];
  for (let i = 0; i < n; i++) {
    const cur = polygon[i];
    acc += prev[0] * cur[1] - cur[0] * prev[1];
    prev = cur;
  }
  return acc;
}

/**
 * 多边形面积（高斯鞋带公式），返回**非负**值，与顶点顺序无关。
 * @param {Array<[number, number]>} polygon `[[x,z], ...]`，顶点数 < 3 时返回 0
 * @returns {number} 面积（平方米）
 */
export function polygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  return Math.abs(signedDoubleArea(polygon)) * 0.5;
}

/**
 * 多边形形心（面积加权，非顶点平均）。
 * 公式：`C = 1/(6A)·Σ(pᵢ + p_{i+1})·cross(pᵢ, p_{i+1})`；退化（面积为 0）时回退为顶点平均。
 * @param {Array<[number, number]>} polygon `[[x,z], ...]`
 * @returns {{x: number, z: number}} 形心
 */
export function polygonCentroid(polygon) {
  if (!polygon || polygon.length === 0) return { x: 0, z: 0 };
  if (polygon.length < 3) {
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < polygon.length; i++) {
      sx += polygon[i][0];
      sz += polygon[i][1];
    }
    return { x: sx / polygon.length, z: sz / polygon.length };
  }
  const n = polygon.length;
  let a2 = 0;
  let cx = 0;
  let cz = 0;
  let prev = polygon[n - 1];
  for (let i = 0; i < n; i++) {
    const cur = polygon[i];
    const cross = prev[0] * cur[1] - cur[0] * prev[1];
    a2 += cross;
    cx += (prev[0] + cur[0]) * cross;
    cz += (prev[1] + cur[1]) * cross;
    prev = cur;
  }
  if (Math.abs(a2) < GEOM_EPS) {
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < n; i++) {
      sx += polygon[i][0];
      sz += polygon[i][1];
    }
    return { x: sx / n, z: sz / n };
  }
  const inv = 1 / (3 * a2);
  return { x: cx * inv, z: cz * inv };
}

/**
 * 点是否在多边形内（交叉数 / 射线投射法，支持凸与凹多边形，含自身边界）。
 * 落在边上的点视为「在内部」，便于地块采样与吸附判断。
 * @param {number} px 测试点 X
 * @param {number} pz 测试点 Z
 * @param {Array<[number, number]>} polygon `[[x,z], ...]`
 * @returns {boolean} 是否在多边形内（含边界）
 */
export function pointInPolygon(px, pz, polygon) {
  if (!polygon || polygon.length < 3) return false;
  const n = polygon.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i][0];
    const zi = polygon[i][1];
    const xj = polygon[j][0];
    const zj = polygon[j][1];
    // 边界命中优先返回 true，避免射线穿过顶点时的歧义
    if (pointOnSegment(px, pz, xi, zi, xj, zj)) return true;
    if ((zi > pz) !== (zj > pz)) {
      const t = (pz - zi) / (zj - zi);
      if (px < xi + t * (xj - xi)) inside = !inside;
    }
  }
  return inside;
}

/**
 * 点是否落在线段上（带容差）。
 * @param {number} px 点 X
 * @param {number} pz 点 Z
 * @param {number} x1 端点 A 的 X
 * @param {number} z1 端点 A 的 Z
 * @param {number} x2 端点 B 的 X
 * @param {number} z2 端点 B 的 Z
 * @returns {boolean} 是否共线且落在两端点之间
 */
function pointOnSegment(px, pz, x1, z1, x2, z2) {
  const ex = x2 - x1;
  const ez = z2 - z1;
  const len = Math.hypot(ex, ez);
  if (len < WELD_EPS) return Math.hypot(px - x1, pz - z1) <= WELD_EPS;
  const cross = ex * (pz - z1) - ez * (px - x1);
  if (Math.abs(cross) > 1e-6 * len) return false;
  const dot = (px - x1) * ex + (pz - z1) * ez;
  return dot >= -1e-6 && dot <= len * len + 1e-6;
}

/**
 * Sutherland–Hodgman 单半平面裁剪：用经过 (ax,az)、(bx,bz) 的直线切多边形，保留一侧。
 *
 * 「左侧」的定义：把 (x, z) 当作数学平面的 (x, y)，令 `side(p) = dx·(pz − az) − dz·(px − ax)`
 * （`d = b − a`）。`keepLeft === true` 保留 `side(p) ≥ 0` 的一侧，`false` 保留 `side(p) ≤ 0` 的一侧；
 * 落在直线上的点两种情况都保留。
 *
 * @param {Array<[number, number]>} polygon 输入多边形 `[[x,z], ...]`
 * @param {number} ax 直线上点 A 的 X
 * @param {number} az 直线上点 A 的 Z
 * @param {number} bx 直线上点 B 的 X
 * @param {number} bz 直线上点 B 的 Z
 * @param {boolean} [keepLeft=true] 保留左侧（side ≥ 0）还是右侧（side ≤ 0）
 * @returns {Array<[number, number]>} 裁剪结果（可能为空数组）；输入未被切到时返回等价副本
 */
export function clipPolygonByHalfPlane(polygon, ax, az, bx, bz, keepLeft = true) {
  if (!polygon || polygon.length < 3) return [];
  const dx = bx - ax;
  const dz = bz - az;
  if (Math.abs(dx) < GEOM_EPS && Math.abs(dz) < GEOM_EPS) {
    return polygon.map((p) => [p[0], p[1]]);
  }
  const sign = keepLeft ? 1 : -1;
  /**
   * 到裁剪线的有符号距离（已带 keepLeft 方向），≥ 0 表示保留。
   * @param {[number, number]} p 顶点
   * @returns {number} 有符号量
   */
  const side = (p) => sign * (dx * (p[1] - az) - dz * (p[0] - ax));

  const out = [];
  const n = polygon.length;
  let prev = polygon[n - 1];
  let prevSide = side(prev);
  for (let i = 0; i < n; i++) {
    const cur = polygon[i];
    const curSide = side(cur);
    const prevIn = prevSide >= 0;
    const curIn = curSide >= 0;
    if (curIn) {
      if (!prevIn) {
        const t = prevSide / (prevSide - curSide);
        out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
      }
      out.push([cur[0], cur[1]]);
    } else if (prevIn) {
      const t = prevSide / (prevSide - curSide);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    prev = cur;
    prevSide = curSide;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 内部几何工具                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 合并重合顶点（裁剪后常出现零长边）。
 * @param {Array<[number, number]>} polygon 输入多边形
 * @returns {Array<[number, number]>} 去重后的多边形
 */
function weldPolygon(polygon) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i];
    if (out.length > 0) {
      const q = out[out.length - 1];
      if (Math.abs(p[0] - q[0]) < WELD_EPS && Math.abs(p[1] - q[1]) < WELD_EPS) continue;
    }
    out.push([p[0], p[1]]);
  }
  while (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < WELD_EPS && Math.abs(a[1] - b[1]) < WELD_EPS) out.pop();
    else break;
  }
  return out;
}

/**
 * 把多边形顶点顺序统一为「俯视顺时针」（(x,z) 平面鞋带为正）。
 * @param {Array<[number, number]>} polygon 输入多边形（原地不改，可能返回反转副本）
 * @returns {Array<[number, number]>} 顺时针多边形
 */
function toClockwise(polygon) {
  return signedDoubleArea(polygon) < 0 ? polygon.slice().reverse() : polygon;
}

/**
 * 由轴对齐矩形生成顺时针多边形。
 * @param {number} minX 西边界
 * @param {number} minZ 北边界
 * @param {number} maxX 东边界
 * @param {number} maxZ 南边界
 * @returns {Array<[number, number]>} 4 顶点多边形
 */
function rectPolygon(minX, minZ, maxX, maxZ) {
  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ]
  ];
}

/**
 * 多边形的最小内角（度）。用于识别百老汇切出的「尖角碎块」。
 * @param {Array<[number, number]>} polygon 顺时针简单多边形
 * @returns {number} 最小内角（度）；退化时返回 180
 */
function minInteriorAngleDeg(polygon) {
  const n = polygon.length;
  if (n < 3) return 180;
  let minAngle = 180;
  for (let i = 0; i < n; i++) {
    const p0 = polygon[(i + n - 1) % n];
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const ax = p0[0] - p1[0];
    const az = p0[1] - p1[1];
    const bx = p2[0] - p1[0];
    const bz = p2[1] - p1[1];
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    if (la < WELD_EPS || lb < WELD_EPS) continue;
    let cos = (ax * bx + az * bz) / (la * lb);
    if (cos > 1) cos = 1;
    else if (cos < -1) cos = -1;
    const ang = Math.acos(cos) * RAD2DEG;
    if (ang < minAngle) minAngle = ang;
  }
  return minAngle;
}

/**
 * 主立面朝向：取**最长边**的外法线方位角。
 * 方位角约定与 `core/solar.js` 一致：0° = 正北(−Z)，90° = 正东(+X)，顺时针增大，值域 [0,360)。
 * 顺时针多边形（鞋带为正）的边 `e = p_{i+1} − pᵢ` 的外法线为 `(e.z, −e.x)`。
 * @param {Array<[number, number]>} polygon 顺时针多边形
 * @returns {number} 方位角（度）
 */
function frontAngleFromPolygon(polygon) {
  const n = polygon.length;
  let bestLen = -1;
  let nx = 0;
  let nz = -1;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];
    const ex = p2[0] - p1[0];
    const ez = p2[1] - p1[1];
    const len = Math.hypot(ex, ez);
    if (len > bestLen) {
      bestLen = len;
      nx = ez / len;
      nz = -ex / len;
    }
  }
  let deg = Math.atan2(nx, -nz) * RAD2DEG;
  if (deg < 0) deg += 360;
  if (deg >= 360) deg -= 360;
  return deg;
}

/**
 * 数值取整到 1e-6，抹掉浮点尾巴，保证「同种子 → JSON 完全一致」在不同 V8 版本下也稳定。
 * @param {number} v 输入
 * @returns {number} 规整后的数
 */
function round6(v) {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
}

/**
 * 规整多边形所有坐标。
 * @param {Array<[number, number]>} polygon 多边形
 * @returns {Array<[number, number]>} 新多边形
 */
function roundPolygon(polygon) {
  const out = new Array(polygon.length);
  for (let i = 0; i < polygon.length; i++) out[i] = [round6(polygon[i][0]), round6(polygon[i][1])];
  return out;
}

/* -------------------------------------------------------------------------- */
/* 百老汇斜街几何                                                                */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {Object} BroadwayGeom
 * @property {number} ax 起点 X（上城端）
 * @property {number} az 起点 Z
 * @property {number} bx 终点 X（下城端）
 * @property {number} bz 终点 Z
 * @property {number} width 路面宽度（米）
 * @property {number} angleDeg 中心线与 +Z（正南）的夹角（度）
 * @property {number} dirX 单位方向向量 X
 * @property {number} dirZ 单位方向向量 Z
 * @property {number} nx 单位法线 X（指向东侧为正）
 * @property {number} nz 单位法线 Z
 * @property {number} length 中心线长度（米）
 * @property {Array<[number, number]>} polygon 带状多边形（顺时针）
 */

/**
 * 构造百老汇斜街的中心线、法线与带状多边形。
 * 法线取 `n = (dz, −dx)/|d|`，`d = b − a`；点到中心线的有符号距离 `s = (p − a)·n`，s > 0 为东侧。
 * @returns {BroadwayGeom} 百老汇几何
 */
function buildBroadwayGeom() {
  const { ax, az, bx, bz, width } = CITY.broadway;
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const dirX = dx / length;
  const dirZ = dz / length;
  const nx = dz / length;
  const nz = -dx / length;
  const half = width * 0.5;
  const polygon = roundPolygon([
    [ax + nx * half, az + nz * half],
    [bx + nx * half, bz + nz * half],
    [bx - nx * half, bz - nz * half],
    [ax - nx * half, az - nz * half]
  ]);
  return {
    ax,
    az,
    bx,
    bz,
    width,
    angleDeg: round6(Math.atan2(dirX, dirZ) * RAD2DEG),
    dirX: round6(dirX),
    dirZ: round6(dirZ),
    nx,
    nz,
    length,
    polygon: toClockwise(polygon)
  };
}

/**
 * 点到百老汇中心线的有符号横向距离（东侧为正）。
 * @param {BroadwayGeom} bw 百老汇几何
 * @param {number} x 点 X
 * @param {number} z 点 Z
 * @returns {number} 有符号距离（米）
 */
function broadwayOffset(bw, x, z) {
  return (x - bw.ax) * bw.nx + (z - bw.az) * bw.nz;
}

/* -------------------------------------------------------------------------- */
/* 街道 / 街区                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 生成东西向街道的 Z 序列：`minZ → maxZ` 每 `streetSpacing` 一条，
 * **落在中央公园 Z 区间内部的横街全部跳过**（公园是整块，不被街道穿过；两条边界街保留）。
 * @returns {number[]} 升序 Z 列表
 */
function buildStreetZs() {
  const list = [];
  const count = Math.floor((CITY.maxZ - CITY.minZ) / CITY.streetSpacing);
  for (let i = 0; i <= count; i++) {
    const z = CITY.minZ + i * CITY.streetSpacing;
    if (z > CITY.park.minZ + GEOM_EPS && z < CITY.park.maxZ - GEOM_EPS) continue;
    list.push(z);
  }
  return list;
}

/**
 * 按 Z 判定行政分区（契约 §4.1）。
 * @param {number} z 中心 Z
 * @returns {'uptown'|'midtown'|'village'|'downtown'} 分区名
 */
function districtForZ(z) {
  if (z < -720) return 'uptown';
  if (z < 300) return 'midtown';
  if (z < 1200) return 'village';
  return 'downtown';
}

/**
 * 生成全部街区（不含地块）。
 * 街区外框 = 相邻大道中心线 × 相邻街道中心线；可建矩形 = 外框各边扣除「道路半宽 + 人行道宽」。
 * 公园内的街区使用外框本身（公园不设退线），其并集恰好等于公园矩形。
 * @param {number[]} streetZs 街道 Z 列表
 * @param {number[]} avenueXs 大道 X 列表
 * @param {BroadwayGeom} bw 百老汇几何
 * @returns {Array<Object>} 街区数组
 */
function buildBlocks(streetZs, avenueXs, bw) {
  const blocks = [];
  const avHalf = CITY.avenueRoadWidth * 0.5;
  const stHalf = CITY.streetRoadWidth * 0.5;
  const sw = CITY.sidewalkWidth;
  const park = CITY.park;
  const clipMargin = CITY.broadway.width * 0.5 + sw;

  for (let ci = 0; ci < avenueXs.length - 1; ci++) {
    for (let ri = 0; ri < streetZs.length - 1; ri++) {
      const outerMinX = avenueXs[ci];
      const outerMaxX = avenueXs[ci + 1];
      const outerMinZ = streetZs[ri];
      const outerMaxZ = streetZs[ri + 1];
      const isPark =
        outerMinX >= park.minX - GEOM_EPS &&
        outerMaxX <= park.maxX + GEOM_EPS &&
        outerMinZ >= park.minZ - GEOM_EPS &&
        outerMaxZ <= park.maxZ + GEOM_EPS;

      const minX = isPark ? outerMinX : outerMinX + avHalf + sw;
      const maxX = isPark ? outerMaxX : outerMaxX - avHalf - sw;
      const minZ = isPark ? outerMinZ : outerMinZ + stHalf + sw;
      const maxZ = isPark ? outerMaxZ : outerMaxZ - stHalf - sw;

      // 街区外框与百老汇「路面 + 人行道」带是否相交
      let dMin = Infinity;
      let dMax = -Infinity;
      const cx = [outerMinX, outerMaxX, outerMaxX, outerMinX];
      const cz = [outerMinZ, outerMinZ, outerMaxZ, outerMaxZ];
      for (let k = 0; k < 4; k++) {
        const d = broadwayOffset(bw, cx[k], cz[k]);
        if (d < dMin) dMin = d;
        if (d > dMax) dMax = d;
      }
      const touchesBroadway = dMin <= clipMargin && dMax >= -clipMargin;

      blocks.push({
        id: `b${ci}_${ri}`,
        minX: round6(minX),
        maxX: round6(maxX),
        minZ: round6(minZ),
        maxZ: round6(maxZ),
        centerX: round6((outerMinX + outerMaxX) * 0.5),
        centerZ: round6((outerMinZ + outerMaxZ) * 0.5),
        district: isPark ? 'park' : districtForZ((outerMinZ + outerMaxZ) * 0.5),
        isPark,
        lots: [],
        outerMinX,
        outerMaxX,
        outerMinZ,
        outerMaxZ,
        avenueIndex: ci,
        streetIndex: ri,
        touchesBroadway
      });
    }
  }
  return blocks;
}

/* -------------------------------------------------------------------------- */
/* 地块切分                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 把街区可建矩形沿 Z 切成若干排。
 * 常规街区（进深 48m）只有一排；公园带两侧没有横街，会出现 1360m 的超级街区，
 * 这时按 ~78m 目标进深切排，排间留出 `INNER_ALLEY_WIDTH` 的内部通道，避免出现整块实心楼群。
 * @param {Object} block 街区
 * @returns {Array<{minZ: number, maxZ: number}>} 排数组
 */
function splitRows(block) {
  const depth = block.maxZ - block.minZ;
  if (depth <= MAX_BLOCK_DEPTH) return [{ minZ: block.minZ, maxZ: block.maxZ }];
  const gap = INNER_ALLEY_WIDTH;
  let count = Math.max(2, Math.round((depth + gap) / (INNER_ROW_TARGET_DEPTH + gap)));
  let rowDepth = (depth - gap * (count - 1)) / count;
  while (count > 2 && rowDepth < 34) {
    count--;
    rowDepth = (depth - gap * (count - 1)) / count;
  }
  const rows = new Array(count);
  for (let i = 0; i < count; i++) {
    const minZ = block.minZ + i * (rowDepth + gap);
    rows[i] = { minZ: round6(minZ), maxZ: round6(minZ + rowDepth) };
  }
  return rows;
}

/**
 * 在 [min, max] 上生成 `count` 段切点，带 RNG 抖动并保证每段 ≥ `MIN_FRONTAGE`。
 * 无论抖动幅度是否为 0，都恒定消耗 `count − 1` 个随机数，保证流推进可预测。
 * @param {number} min 左端
 * @param {number} max 右端
 * @param {number} count 段数
 * @param {import('../core/rng.js').Rng} rng 随机流
 * @returns {number[]} 长度 count+1 的升序切点数组
 */
function splitSpan(min, max, count, rng) {
  const span = max - min;
  const step = span / count;
  const jitter = Math.max(0, Math.min(step * 0.28, (step - MIN_FRONTAGE) * 0.5));
  const cuts = new Array(count + 1);
  cuts[0] = min;
  cuts[count] = max;
  for (let i = 1; i < count; i++) {
    cuts[i] = min + step * i + rng.range(-1, 1) * jitter;
  }
  for (let i = 1; i < count; i++) {
    const lo = cuts[i - 1] + MIN_FRONTAGE;
    const hi = max - MIN_FRONTAGE * (count - i);
    if (cuts[i] < lo) cuts[i] = lo;
    if (cuts[i] > hi) cuts[i] = hi;
  }
  return cuts;
}

/**
 * 计算某一排（Z 区间）上「贴合百老汇」的两个地权线锚点。
 *
 * 百老汇带的东西两条边界线在 (x,z) 平面上斜率为 `k = dirX/dirZ ≈ 0.2083`，
 * 一排的进深 D 内横移 `D·k`。把地权线放在：
 * - `anchorA = 东边界线在排南沿的 x`：其西侧地块的**东残块**恰好是底 `D·k`、高 `D` 的直角三角形；
 * - `anchorB = 西边界线在排北沿的 x`：其东侧地块的**西残块**同样是直角三角形。
 *
 * 这正是熨斗大厦一类「楔形地块」的成因（百老汇斜切正交网格），
 * 也保证三角地块数量稳定达标，而不是靠随机抖动碰运气。
 * @param {BroadwayGeom} bw 百老汇几何
 * @param {number} minZ 排北沿 Z
 * @param {number} maxZ 排南沿 Z
 * @returns {number[]} 升序锚点（2 个）
 */
function broadwayCutAnchors(bw, minZ, maxZ) {
  const inset = bw.width * 0.5 + CITY.sidewalkWidth;
  // 解 (x − ax)·nx + (z − az)·nz = ±inset
  const xAt = (z, off) => bw.ax + (off - (z - bw.az) * bw.nz) / bw.nx;
  const anchorB = xAt(minZ, -inset);
  const anchorA = xAt(maxZ, inset);
  return anchorB <= anchorA ? [anchorB, anchorA] : [anchorA, anchorB];
}

/**
 * 生成一排的全部切点：先放入合法的百老汇锚点，再在锚点分出的各段内按目标面宽均分并抖动。
 * 锚点坐标保持精确（不被最小面宽约束推移），因此楔形残块的几何是确定的。
 * @param {number} min 排的西端
 * @param {number} max 排的东端
 * @param {number} count 基准地块数（3~7）
 * @param {number[]} anchors 候选锚点（升序）
 * @param {import('../core/rng.js').Rng} rng 随机流
 * @returns {number[]} 升序切点（含两端）
 */
function buildCuts(min, max, count, anchors, rng) {
  const valid = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!(a > min + MIN_FRONTAGE) || !(a < max - MIN_FRONTAGE)) continue;
    if (valid.length > 0 && a - valid[valid.length - 1] < MIN_FRONTAGE) continue;
    valid.push(a);
  }
  if (valid.length === 0) return splitSpan(min, max, count, rng);

  const targetWidth = (max - min) / count;
  const bounds = [min, ...valid, max];
  const cuts = [min];
  for (let s = 0; s < bounds.length - 1; s++) {
    const lo = bounds[s];
    const hi = bounds[s + 1];
    const len = hi - lo;
    const capacity = Math.max(1, Math.floor(len / MIN_FRONTAGE));
    const k = Math.max(1, Math.min(capacity, Math.round(len / targetWidth)));
    const sub = splitSpan(lo, hi, k, rng);
    for (let i = 1; i <= k; i++) cuts.push(sub[i]);
  }
  return cuts;
}

/**
 * 用百老汇「路面 + 两侧人行道」带切一个地块，返回带外的残块。
 * 裁剪线取中心线两侧各 `width/2 + sidewalkWidth`（= 21m），
 * 这样残块顶点与百老汇路面之间天然留出人行道，`isOnBroadway` 对地块顶点必为 false。
 * @param {Array<[number, number]>} polygon 地块多边形
 * @param {BroadwayGeom} bw 百老汇几何
 * @returns {Array<{polygon: Array<[number, number]>, clipped: boolean}>} 残块列表
 */
function clipAgainstBroadway(polygon, bw) {
  const inset = bw.width * 0.5 + CITY.sidewalkWidth;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const d = broadwayOffset(bw, polygon[i][0], polygon[i][1]);
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }
  if (dMin >= inset - GEOM_EPS || dMax <= -inset + GEOM_EPS) {
    return [{ polygon, clipped: false }];
  }
  // 沿法线平移中心线得到两条裁剪线；side(p) = dx·(pz−az) − dz·(px−ax) 与 d 的关系为 side = −d·|d|
  const ex = bw.nx * inset;
  const ez = bw.nz * inset;
  const east = clipPolygonByHalfPlane(
    polygon,
    bw.ax + ex,
    bw.az + ez,
    bw.bx + ex,
    bw.bz + ez,
    false
  );
  const west = clipPolygonByHalfPlane(
    polygon,
    bw.ax - ex,
    bw.az - ez,
    bw.bx - ex,
    bw.bz - ez,
    true
  );
  const out = [];
  if (east.length >= 3) out.push({ polygon: east, clipped: true });
  if (west.length >= 3) out.push({ polygon: west, clipped: true });
  return out;
}

/**
 * 由多边形组装一个 Lot 记录；面积过小或退化时返回 null。
 * @param {Array<[number, number]>} rawPolygon 多边形（可能含重合点）
 * @param {boolean} clipped 是否被百老汇裁剪过
 * @param {Object} block 所属街区
 * @param {string} id 地块 id
 * @param {boolean} cornerHint 是否位于街区四角
 * @param {BroadwayGeom} bw 百老汇几何
 * @returns {Object|null} Lot 或 null
 */
function makeLot(rawPolygon, clipped, block, id, cornerHint, bw) {
  const welded = weldPolygon(rawPolygon);
  if (welded.length < 3) return null;
  const polygon = roundPolygon(toClockwise(welded));
  const area = polygonArea(polygon);
  if (area < MIN_LOT_AREA) return null;

  let shape = 'rect';
  if (clipped) {
    shape = polygon.length === 3 || minInteriorAngleDeg(polygon) < TRIANGLE_MIN_ANGLE_DEG
      ? 'triangle'
      : 'poly';
  }

  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const d = Math.abs(broadwayOffset(bw, polygon[i][0], polygon[i][1]));
    if (d < nearest) nearest = d;
  }
  const onBroadway = clipped || nearest <= bw.width * 0.5 + CITY.sidewalkWidth + 0.5;

  const c = polygonCentroid(polygon);
  return {
    id,
    polygon,
    centerX: round6(c.x),
    centerZ: round6(c.z),
    area: round6(area),
    shape,
    onBroadway,
    corner: cornerHint,
    frontAngleDeg: round6(frontAngleFromPolygon(polygon))
  };
}

/**
 * 为一个街区生成全部地块。
 * @param {Object} block 街区（非公园）
 * @param {import('../core/rng.js').Rng} rng 该街区专属随机流
 * @param {BroadwayGeom} bw 百老汇几何
 * @param {number} refine 细分级别：0 为常规 3~7 块；>0 时沿百老汇额外细分以切出更多三角地块
 * @returns {Array<Object>} 地块数组
 */
function buildBlockLots(block, rng, bw, refine) {
  const lots = [];
  const width = block.maxX - block.minX;
  if (width < MIN_FRONTAGE) return lots;
  const rows = splitRows(block);
  const maxCount = Math.max(1, Math.floor(width / MIN_FRONTAGE));
  let serial = 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.maxZ - row.minZ < 8) continue;
    let count = rng.int(3, 7);
    if (refine > 0) count = Math.min(9, count + refine + 1);
    count = Math.max(1, Math.min(count, maxCount));
    const anchors = block.touchesBroadway ? broadwayCutAnchors(bw, row.minZ, row.maxZ) : [];
    const cuts = buildCuts(block.minX, block.maxX, count, anchors, rng);
    const lotCount = cuts.length - 1;
    const rowEdge = r === 0 || r === rows.length - 1;

    for (let i = 0; i < lotCount; i++) {
      const rect = rectPolygon(cuts[i], row.minZ, cuts[i + 1], row.maxZ);
      const corner = rowEdge && (i === 0 || i === lotCount - 1);
      const pieces = clipAgainstBroadway(rect, bw);
      const suffixed = pieces.length > 1;
      for (let k = 0; k < pieces.length; k++) {
        const id = `${block.id}-l${serial}${suffixed ? String.fromCharCode(97 + k) : ''}`;
        const lot = makeLot(pieces[k].polygon, pieces[k].clipped, block, id, corner, bw);
        if (lot) lots.push(lot);
      }
      serial++;
    }
  }
  return lots;
}

/**
 * 汇总所有街区中的三角地块。
 * @param {Array<Object>} blocks 街区数组
 * @returns {Array<Object>} 三角地块数组（按面积从大到小，熨斗大厦优先取最大者）
 */
function collectTriangleLots(blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    const lots = blocks[i].lots;
    for (let j = 0; j < lots.length; j++) {
      if (lots[j].shape === 'triangle') out.push(lots[j]);
    }
  }
  out.sort((a, b) => b.area - a.area || (a.id < b.id ? -1 : 1));
  return out;
}

/* -------------------------------------------------------------------------- */
/* 路口                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * 生成所有路口：大道 × 街道，外加百老汇 × 大道的斜交路口。
 * `hasSignal` 规则：默认全部设灯；仅在城市南北端缘（|z| > 2000）以 15% 概率省略，
 * 因此约 96% 以上的路口有信号灯。
 * @param {number[]} avenueXs 大道 X
 * @param {number[]} streetZs 街道 Z
 * @param {BroadwayGeom} bw 百老汇几何
 * @param {import('../core/rng.js').Rng} rng 信号灯随机流
 * @returns {Array<Object>} 路口数组
 */
function buildIntersections(avenueXs, streetZs, bw, rng) {
  const list = [];
  for (let ai = 0; ai < avenueXs.length; ai++) {
    for (let si = 0; si < streetZs.length; si++) {
      const x = avenueXs[ai];
      const z = streetZs[si];
      const fringe = Math.abs(z) > 2000;
      const hasSignal = fringe ? !rng.bool(0.15) : true;
      list.push({
        id: `ix-a${ai}-s${si}`,
        x,
        z,
        avenueIndex: ai,
        streetIndex: si,
        hasSignal,
        kind: 'avenue-street'
      });
    }
  }
  // 百老汇与大道的斜交路口：解 ax + t·dx = avenueX
  const dx = bw.bx - bw.ax;
  const dz = bw.bz - bw.az;
  for (let ai = 0; ai < avenueXs.length; ai++) {
    if (Math.abs(dx) < GEOM_EPS) break;
    const t = (avenueXs[ai] - bw.ax) / dx;
    if (t < 0 || t > 1) continue;
    const z = bw.az + t * dz;
    if (z < CITY.minZ - GEOM_EPS || z > CITY.maxZ + GEOM_EPS) continue;
    list.push({
      id: `ix-bw-a${ai}`,
      x: round6(avenueXs[ai]),
      z: round6(z),
      avenueIndex: ai,
      streetIndex: -1,
      hasSignal: true,
      kind: 'broadway-avenue'
    });
  }
  return list;
}

/* -------------------------------------------------------------------------- */
/* 主入口                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 构建整座城市的路网/地块数据。
 *
 * 流程：
 * 1. 街道 Z 序列（公园内部横街跳过）与大道 X 序列；
 * 2. 百老汇带状多边形（宽 30m，与 +Z 夹角约 11.77°）；
 * 3. 街区 = 相邻大道 × 相邻街道，扣除道路半宽与人行道得可建矩形，公园内街区标记 `isPark` 且不产地块；
 * 4. 每个街区沿东西长边切 3~7 个地块（RNG 抖动，面宽 ≥ 18m）；
 * 5. 与百老汇相交的地块做两次 Sutherland–Hodgman 半平面裁剪，切出带外残块，
 *    面积 < 220m² 丢弃；顶点数 3 或最小内角 < 45° 的残块进 `triangleLots`；
 *    若三角地块不足 8 个，自动沿百老汇提高细分级别重算（最多 3 轮）；
 * 6. 路口 = 大道 × 街道 + 百老汇 × 大道。
 *
 * 结果**纯数据、可 JSON 序列化、同种子完全一致**（`isOnRoad` 等方法在序列化时自然丢失）。
 * 典型规模：220 街区 / 约 1300 地块，构建耗时 < 30ms。
 *
 * @param {number|string} [seed='manhattan'] 城市种子
 * @returns {Object} CityPlan
 */
export function buildCityPlan(seed = 'manhattan') {
  const rng = makeRng(seed, 'city-grid');
  const streetZs = buildStreetZs();
  const avenueXs = CITY.avenueXs.slice();
  const bw = buildBroadwayGeom();
  const blocks = buildBlocks(streetZs, avenueXs, bw);

  const lotRng = rng.fork('lots');
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    block.lots = block.isPark ? [] : buildBlockLots(block, lotRng.fork(`${block.id}#0`), bw, 0);
  }

  let triangleLots = collectTriangleLots(blocks);
  for (let pass = 1; pass <= MAX_REFINE_PASSES && triangleLots.length < MIN_TRIANGLE_LOTS; pass++) {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (block.isPark || !block.touchesBroadway) continue;
      block.lots = buildBlockLots(block, lotRng.fork(`${block.id}#${pass}`), bw, pass);
    }
    triangleLots = collectTriangleLots(blocks);
  }

  const intersections = buildIntersections(avenueXs, streetZs, bw, rng.fork('signals'));
  const park = CITY.park;
  const parkPolygon = rectPolygon(park.minX, park.minZ, park.maxX, park.maxZ);

  const avHalf = CITY.avenueRoadWidth * 0.5;
  const stHalf = CITY.streetRoadWidth * 0.5;
  const bwHalf = CITY.broadway.width * 0.5;
  const bridge = CITY.bridge;

  const plan = {
    seed: typeof seed === 'number' ? seed : String(seed),
    seedValue: rng.seed,
    streetZs,
    avenueXs,
    broadway: {
      ax: bw.ax,
      az: bw.az,
      bx: bw.bx,
      bz: bw.bz,
      width: bw.width,
      angleDeg: bw.angleDeg,
      dirX: bw.dirX,
      dirZ: bw.dirZ,
      polygon: bw.polygon
    },
    blocks,
    triangleLots,
    intersections,
    parkPolygon,

    /**
     * 该点是否落在车行道面上（大道、横街或百老汇；不含人行道）。
     * @param {number} x 世界 X
     * @param {number} z 世界 Z
     * @returns {boolean} 是否在路面上
     */
    isOnRoad(x, z) {
      for (let i = 0; i < avenueXs.length; i++) {
        if (Math.abs(x - avenueXs[i]) <= avHalf) return true;
      }
      for (let i = 0; i < streetZs.length; i++) {
        if (Math.abs(z - streetZs[i]) <= stHalf) return true;
      }
      return plan.isOnBroadway(x, z);
    },

    /**
     * 该点是否落在中央公园内（含边界）。
     * @param {number} x 世界 X
     * @param {number} z 世界 Z
     * @returns {boolean} 是否在公园内
     */
    isInPark(x, z) {
      return x >= park.minX && x <= park.maxX && z >= park.minZ && z <= park.maxZ;
    },

    /**
     * 该点是否是水域（哈德逊河 / 东河）。桥面所在的矩形区域除外。
     * @param {number} x 世界 X
     * @param {number} z 世界 Z
     * @returns {boolean} 是否是水面
     */
    isWater(x, z) {
      if (x >= CITY.river.hudsonX && x <= CITY.river.eastX) return false;
      if (
        x >= bridge.startX &&
        x <= bridge.endX &&
        Math.abs(z - bridge.z) <= BRIDGE_DECK_HALF_WIDTH
      ) {
        return false;
      }
      return true;
    },

    /**
     * 该点是否落在百老汇斜街路面上（中心线两侧各 15m）。
     * 中心线为线段，端点之外按端点截断，不做无限延伸。
     * @param {number} x 世界 X
     * @param {number} z 世界 Z
     * @returns {boolean} 是否在百老汇上
     */
    isOnBroadway(x, z) {
      const t = ((x - bw.ax) * bw.dirX + (z - bw.az) * bw.dirZ) / bw.length;
      if (t < 0 || t > 1) return false;
      return Math.abs(broadwayOffset(bw, x, z)) <= bwHalf;
    }
  };

  return plan;
}
