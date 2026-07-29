/**
 * @file src/city/streetfurniture.js
 * @description 街道家具（契约 §5.5）—— 路灯 / 红绿灯柱 / 行道树 / 消防栓 / 垃圾桶 /
 * 长椅 / 报刊亭 / 井盖 / 店铺雨棚 / 霓虹招牌。
 *
 * ---------------------------------------------------------------------------
 * 一、渲染预算（契约 §5.5：总实例 ≥ 4000，drawcall ≤ 14）
 * ---------------------------------------------------------------------------
 * 全部走 `InstancedMesh`，每类一个（同类共享一个合并几何 + 一个材质）：
 *   1 lampPost   2 lampLens   3 lampHalo  4 signalPole 5 signalBulb
 *   6 treeTrunk  7 treeCanopy 8 hydrant   9 trashBin  10 bench
 *  11 newsstand 12 manhole   13 awning   14 neonSign
 * 白天光晕（lampHalo）`visible = false`，实际 drawcall 为 13；夜间 14。
 *
 * ---------------------------------------------------------------------------
 * 二、布置规则（"不许长到马路中间或楼里"）
 * ---------------------------------------------------------------------------
 * 候选点一律取"路面半宽 + 若干米"的**人行道带内**，再逐点用
 * `plan.isOnRoad()` / `plan.isWater()` / `plan.isInPark()` 三重否决：
 *   - `isOnRoad` 为真 → 落在车行道（含横街与百老汇的交叉口）→ 丢弃；
 *   - `isWater`  为真 → 落在两条河里 → 丢弃；
 *   - 点在公园矩形内部 2.5m 以上 → 丢弃（公园内部由 sculpt/terrain 雕刻地形，
 *     街道家具贴 y=0.18 的人行道面，放进去会悬空/穿插）。
 * 另用 3.5m 网格占位表（Occupancy）保证任意两件家具中心距 ≥ 3.5m，避免互相穿模。
 * 雨棚/招牌挂在**街区可建矩形的边界线**（= 建筑立面线）上，向人行道外挑出。
 *
 * ---------------------------------------------------------------------------
 * 三、关键算法与参数出处
 * ---------------------------------------------------------------------------
 * - 路灯间距 32m、左右交替：契约 §5.5（对应 NYC DOT 主干道 ~30m 一杆的实际布设）。
 * - 弯颈灯杆：二次贝塞尔曲线 B(t) = (1−t)²P₀ + 2(1−t)tP₁ + t²P₂ 上采样 3 段圆台近似。
 * - 信号灯兜底相位：契约 §6.1 的相位机（南北绿 30s → 黄 4s → 东西绿 24s → 黄 4s，
 *   周期 62s），相位偏移按 z/11.5 m·s⁻¹ 错开形成"绿波"（platoon progression）。
 * - 行道树风摆：整体绕**水平轴**倾斜（轴 = up × wind，右手定则下正角度即顺风倾倒），
 *   幅度 = f(风速) × (0.62 + 0.38·sin(ωt + φ))，φ 由 simplex 噪声按位置取，
 *   保证"同种子同风向 → 每棵树摆动相位固定"。**不做逐顶点动画**，只改实例矩阵，
 *   且以 30Hz 节流刷新（sway 是低频运动，30Hz 足够，省一半 instanceMatrix 上传）。
 * - 灯色：`signalBulb` 用 `MeshBasicMaterial` + `instanceColor`（Three 的 `color_vertex`
 *   会把 `instanceColor` 乘进 `vColor`），亮灯写高亮色、灭灯写近黑色，
 *   `toneMapped=false` 保证红黄绿在 ACES 色调映射下不被压灰。
 *
 * ---------------------------------------------------------------------------
 * 四、契约差异说明（按 §0 要求就地记录，不改契约）
 * ---------------------------------------------------------------------------
 * 1. 契约 §0 规定 `city/*` 之间不互相 import，因此本模块**不 import `city/grid.js`**，
 *    路面半宽等常量按契约 §4.1 的固定数值在本文件内声明（见 ROAD_GEOM），
 *    可从 `plan` 读到的量（大道 X、街道 Z、百老汇几何、公园矩形）一律从 plan 读。
 * 2. 契约 §5.5 的 `signalSlots` 只写了 `{x,z,angleDeg,intersectionId}`，任务书补充了
 *    `lampIndices:{ns:[...],ew:[...]}`，本模块按补充版实现（超集，向下兼容）。
 * 3. main.js 在挂载后无条件把 `handle.signalDriven = true`（只要本模块提供了
 *    `setSignalColor`）。为避免"交通模块构建失败 → 灯色永远不动"，兜底判据放宽为
 *    "signalDriven 为假 **或** 距上次外部调用超过 3s"，两种情况都自行循环灯色。
 *
 * 坐标约定（契约 §0）：Y 上；+X 东、−X 西；+Z 南、−Z 北；1 单位 = 1 米。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/rng.js';
import { makeNoise2D } from '../core/noise.js';
import { clamp, lerp, mod, DEG2RAD } from '../core/mathx.js';
import { patchCityMaterial } from '../render/shaderpatch.js';

/* -------------------------------------------------------------------------- */
/* 常量                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 路面几何常量。数值来自契约 §4.1 的 `CITY`（大道 34m / 横街 20m / 人行道 6m）。
 * 为遵守"city 模块之间不互相 import"的依赖方向，此处复刻常量而非 import grid.js。
 */
const ROAD_GEOM = Object.freeze({
  avenueHalf: 17,
  streetHalf: 10,
  sidewalk: 6,
  landMinX: -800,
  landMaxX: 800,
  bridgeZ: 1900
});

/** 人行道顶面高度（米）：roads.js 把人行道抬高 0.18m（契约 §5.1） */
const SIDEWALK_Y = 0.18;

/** 公园内部判定余量（米）：离公园边界超过此值才算"深入公园"并否决 */
const PARK_MARGIN = 2.5;

/** 占位网格边长（米）：任意两件家具中心距 ≥ 此值 */
const OCCUPY_CELL = 3.5;

/** 信号相位（契约 §6.1）：南北绿 30 → 南北黄 4 → 东西绿 24 → 东西黄 4，周期 62s */
const PHASE = Object.freeze({ nsGreen: 30, nsYellow: 4, ewGreen: 24, ewYellow: 4, total: 62 });

/** 兜底判据：外部驱动超过该秒数没来消息，就认为无人接管，自己循环灯色 */
const SIGNAL_TAKEOVER_TIMEOUT = 3.0;

/** 树摆刷新间隔（秒）——30Hz 节流 */
const SWAY_INTERVAL = 1 / 30;

/** 按画质缩放的布置密度 */
const QUALITY_TUNE = {
  high: { lampStep: 32, treeStep: 52, propScale: 1.0, shopChance: 1.0 },
  medium: { lampStep: 40, treeStep: 66, propScale: 0.72, shopChance: 0.8 },
  low: { lampStep: 56, treeStep: 92, propScale: 0.45, shopChance: 0.55 }
};

/** 世界 Y 轴 */
const UP = new THREE.Vector3(0, 1, 0);

/* -------------------------------------------------------------------------- */
/* 复用临时对象（禁止在 update 里 new 大对象，契约"性能"条款）                     */
/* -------------------------------------------------------------------------- */

const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _quatYaw = new THREE.Quaternion();
const _quatTilt = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();

/* -------------------------------------------------------------------------- */
/* 几何小工具                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 给几何体写入统一顶点色（供 `vertexColors` 材质使用）。
 * 注意：同一次 `mergeGeometries` 的所有片段必须**要么都有 color，要么都没有**。
 * @param {THREE.BufferGeometry} geo 目标几何
 * @param {number} hex 颜色（sRGB 十六进制，THREE.Color 会转到线性工作空间）
 * @returns {THREE.BufferGeometry} 同一个几何，便于链式书写
 */
function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * 合并一组几何为单一几何（不分组，单材质）。失败时回退到第一个片段，保证永不返回 null。
 * @param {THREE.BufferGeometry[]} parts 片段
 * @returns {THREE.BufferGeometry} 合并结果
 */
function mergeParts(parts) {
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts, false);
  if (!merged) return parts[0];
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * 二次贝塞尔取点：B(t) = (1−t)²P₀ + 2(1−t)t·P₁ + t²P₂。
 * @param {number[]} p0 起点 [x,y,z]
 * @param {number[]} p1 控制点 [x,y,z]
 * @param {number[]} p2 终点 [x,y,z]
 * @param {number} t 参数 0..1
 * @param {THREE.Vector3} out 输出
 * @returns {THREE.Vector3} out
 */
function quadBezier(p0, p1, p2, t, out) {
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;
  return out.set(
    a * p0[0] + b * p1[0] + c * p2[0],
    a * p0[1] + b * p1[1] + c * p2[1],
    a * p0[2] + b * p1[2] + c * p2[2]
  );
}

/**
 * 沿二次贝塞尔曲线生成一串圆台，近似"弯颈"灯臂。
 * @param {number[]} p0 起点
 * @param {number[]} p1 控制点
 * @param {number[]} p2 终点
 * @param {number} segments 分段数
 * @param {number} r0 起点半径
 * @param {number} r1 终点半径
 * @param {number} radial 径向分段（4~5 足够，灯臂只有 6~8cm 粗）
 * @returns {THREE.BufferGeometry[]} 片段数组
 */
function buildBentArm(p0, p1, p2, segments, r0, r1, radial) {
  const parts = [];
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    quadBezier(p0, p1, p2, t0, _vecA);
    quadBezier(p0, p1, p2, t1, _vecB);
    _pos.copy(_vecB).sub(_vecA);
    const len = _pos.length();
    if (len < 1e-4) continue;
    _pos.divideScalar(len);
    _quat.setFromUnitVectors(UP, _pos);
    const g = new THREE.CylinderGeometry(lerp(r0, r1, t1), lerp(r0, r1, t0), len, radial, 1, true);
    _scl.set(1, 1, 1);
    _pos.copy(_vecA).add(_vecB).multiplyScalar(0.5);
    _mat4.compose(_pos, _quat, _scl);
    g.applyMatrix4(_mat4);
    parts.push(g);
  }
  return parts;
}

/**
 * 简易盒体片段（中心 + 尺寸），可选顶点色。
 * @param {number} w X 尺寸
 * @param {number} h Y 尺寸
 * @param {number} d Z 尺寸
 * @param {number} x 中心 X
 * @param {number} y 中心 Y
 * @param {number} z 中心 Z
 * @param {number} [hex] 顶点色（省略则不写 color 属性）
 * @returns {THREE.BufferGeometry} 片段
 */
function box(w, h, d, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return hex === undefined ? g : paint(g, hex);
}

/* -------------------------------------------------------------------------- */
/* 占位网格                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 3.5m 均匀网格占位表：`free()` 检查 3×3 邻域，`claim()` 落子。
 * 邻域检查保证任意两件已登记家具的中心距 ≥ 一个格边长，杜绝互相穿模。
 */
class Occupancy {
  /** @param {number} cell 网格边长（米） */
  constructor(cell) {
    this.cell = cell;
    /** @type {Set<number>} */
    this.cells = new Set();
  }

  /**
   * 网格键（把 (ix,iz) 压成单个整数，坐标范围 ±2048 格内不冲突）。
   * @param {number} ix 网格 X 索引
   * @param {number} iz 网格 Z 索引
   * @returns {number} 键
   */
  key(ix, iz) {
    return (ix + 2048) * 4096 + (iz + 2048);
  }

  /**
   * 该点周围是否空闲。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {boolean} 空闲为 true
   */
  free(x, z) {
    const ix = Math.floor(x / this.cell);
    const iz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (this.cells.has(this.key(ix + dx, iz + dz))) return false;
      }
    }
    return true;
  }

  /**
   * 占用该点所在格。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {void}
   */
  claim(x, z) {
    this.cells.add(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
  }
}

/* -------------------------------------------------------------------------- */
/* 工厂主函数                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 创建街道家具系统（契约 §5.5）。
 *
 * @param {{plan: Object, heightField?: Object, rng?: Object, textures?: Object,
 *          env?: Object, quality?: string, seed?: (string|number),
 *          excludeZones?: Array<{x:number,z:number,radius:number}>}} ctx0 构建期上下文
 * @returns {Object} SystemHandle，另带 `signalSlots` / `manholes` / `setSignalColor` / `signalDriven`
 */
export function createStreetFurniture(ctx0) {
  const ctx = ctx0 || {};
  const plan = ctx.plan || null;
  const env = ctx.env || null;
  const tune = QUALITY_TUNE[ctx.quality] || QUALITY_TUNE.high;
  const rootRng =
    ctx.rng && typeof ctx.rng.fork === 'function'
      ? ctx.rng.fork('streetfurniture')
      : makeRng(ctx.seed === undefined ? 'manhattan' : ctx.seed, 'streetfurniture');

  const group = new THREE.Group();
  group.name = 'streetfurniture';

  /** @type {THREE.BufferGeometry[]} */
  const ownedGeometries = [];
  /** @type {THREE.Material[]} */
  const ownedMaterials = [];
  /** @type {THREE.InstancedMesh[]} */
  const meshes = [];

  // plan 缺失时返回一个安全的空句柄（契约 §1：工厂必须同步返回可用句柄）
  if (!plan || !Array.isArray(plan.avenueXs) || !Array.isArray(plan.streetZs)) {
    return {
      object3D: group,
      signalSlots: [],
      manholes: [],
      signalDriven: false,
      /**
       * 空实现（无灯柱可驱动）。
       * @returns {void}
       */
      setSignalColor() {},
      /**
       * 空实现。
       * @returns {void}
       */
      update() {},
      /**
       * 空实现。
       * @returns {void}
       */
      dispose() {},
      stats: { instances: 0, draws: 0 }
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 场地判定                                                                 */
  /* ---------------------------------------------------------------------- */

  const isOnRoad = typeof plan.isOnRoad === 'function' ? plan.isOnRoad.bind(plan) : () => false;
  const isWater = typeof plan.isWater === 'function' ? plan.isWater.bind(plan) : () => false;
  const isInPark = typeof plan.isInPark === 'function' ? plan.isInPark.bind(plan) : () => false;
  const occupancy = new Occupancy(OCCUPY_CELL);

  const bw = plan.broadway || null;
  // 百老汇法线 n = (dirZ, −dirX)，点到中心线的有符号横距 = (p − a)·n（东侧为正）
  const bwNx = bw ? bw.dirZ : 0;
  const bwNz = bw ? -bw.dirX : 0;

  /**
   * 点到百老汇中心线的横向距离（米）；无百老汇数据时返回 Infinity。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {number} 距离绝对值
   */
  function broadwayDist(x, z) {
    if (!bw) return Infinity;
    return Math.abs((x - bw.ax) * bwNx + (z - bw.az) * bwNz);
  }

  const excludeZones = Array.isArray(ctx.excludeZones) ? ctx.excludeZones : [];

  /**
   * 该点是否落在地标禁建圆内（雨棚/招牌需要贴着普通楼群立面，地标处没有沿街店铺）。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @param {number} pad 额外余量（米）
   * @returns {boolean} 在禁建圆内为 true
   */
  function inExcludeZone(x, z, pad) {
    for (let i = 0; i < excludeZones.length; i++) {
      const zone = excludeZones[i];
      if (!zone) continue;
      const r = (zone.radius || 0) + pad;
      const dx = x - zone.x;
      const dz = z - zone.z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /**
   * 候选点是否可放置：必须在人行道带内、不在水里、不深入公园、不压桥引道。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {boolean} 可放置为 true
   */
  function siteOk(x, z) {
    if (isWater(x, z)) return false;
    if (isOnRoad(x, z)) return false;
    // 公园矩形内部（离边界 > PARK_MARGIN）交给 sculpt/terrain，街道家具不进
    if (isInPark(x - PARK_MARGIN, z - PARK_MARGIN) && isInPark(x + PARK_MARGIN, z + PARK_MARGIN)) {
      return false;
    }
    // 东河大桥引道：避免家具插进桥面/引桥
    if (x > 640 && Math.abs(z - ROAD_GEOM.bridgeZ) < 46) return false;
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* 道路表与沿路行走                                                          */
  /* ---------------------------------------------------------------------- */

  const zMin = plan.streetZs[0];
  const zMax = plan.streetZs[plan.streetZs.length - 1];

  /** @type {Array<{sx:number,sz:number,ex:number,ez:number,half:number}>} */
  const roads = [];
  for (let i = 0; i < plan.avenueXs.length; i++) {
    const x = plan.avenueXs[i];
    roads.push({ sx: x, sz: zMin, ex: x, ez: zMax, half: ROAD_GEOM.avenueHalf });
  }
  for (let i = 0; i < plan.streetZs.length; i++) {
    const z = plan.streetZs[i];
    roads.push({
      sx: ROAD_GEOM.landMinX,
      sz: z,
      ex: ROAD_GEOM.landMaxX,
      ez: z,
      half: ROAD_GEOM.streetHalf
    });
  }
  if (bw) {
    roads.push({ sx: bw.ax, sz: bw.az, ex: bw.bx, ez: bw.bz, half: (bw.width || 30) * 0.5 });
  }

  /**
   * 沿每条道路的人行道带行走，左右交替产出候选点。
   * @param {number} step 纵向间距（米）
   * @param {number} phase 起始偏移（米）
   * @param {number} inset 距路面边缘的横向距离（米，向人行道内为正）
   * @param {(x:number, z:number, faceX:number, faceZ:number, alongX:number, alongZ:number) => void} cb
   *        回调；face 为"由该点指向路心"的单位向量，along 为道路走向单位向量
   * @returns {void}
   */
  function walkSidewalks(step, phase, inset, cb) {
    for (let r = 0; r < roads.length; r++) {
      const road = roads[r];
      const dx = road.ex - road.sx;
      const dz = road.ez - road.sz;
      const len = Math.hypot(dx, dz);
      if (len < step) continue;
      const ux = dx / len;
      const uz = dz / len;
      const nx = uz;
      const nz = -ux;
      const offset = road.half + inset;
      let idx = 0;
      for (let t = phase; t <= len - 6; t += step, idx++) {
        const side = idx % 2 === 0 ? 1 : -1;
        const x = road.sx + ux * t + nx * side * offset;
        const z = road.sz + uz * t + nz * side * offset;
        cb(x, z, -side * nx, -side * nz, ux, uz);
      }
    }
  }

  /**
   * 收集一类家具的站位：走人行道 → 三重否决 → 占位登记。
   * @param {number} step 间距
   * @param {number} phase 起始偏移
   * @param {number} inset 横向内缩
   * @param {number} keepRatio 抽样保留比例（按画质缩减数量）
   * @param {Object} rng 随机流
   * @returns {Array<{x:number,z:number,yaw:number}>} 站位（yaw 为朝向路心的 Y 旋转弧度）
   */
  function collectSites(step, phase, inset, keepRatio, rng) {
    const out = [];
    walkSidewalks(step, phase, inset, (x, z, fx, fz) => {
      if (keepRatio < 1 && rng.next() > keepRatio) return;
      if (!siteOk(x, z)) return;
      if (!occupancy.free(x, z)) return;
      occupancy.claim(x, z);
      out.push({ x, z, yaw: Math.atan2(fx, fz) });
    });
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* 1) 信号灯柱站位（优先级最高，先占坑）                                       */
  /* ---------------------------------------------------------------------- */

  const signalRng = rootRng.fork('signals');
  /** 灯柱局部几何参数（下面 buildSignalPoleGeometry 与之严格对应） */
  const SIG = Object.freeze({
    armLen: 5.2,
    headAY: 5.82,
    headBY: 5.32,
    bulbGap: 0.38,
    bulbOut: 0.23
  });

  /** @type {Array<{x:number,z:number,yaw:number,intersectionId:string,angleDeg:number}>} */
  const signalSites = [];
  const intersections = Array.isArray(plan.intersections) ? plan.intersections : [];
  for (let i = 0; i < intersections.length; i++) {
    const ix = intersections[i];
    if (!ix || ix.hasSignal === false) continue;
    const offX = ROAD_GEOM.avenueHalf + 2.6;
    const offZ = (ix.streetIndex === -1 ? ROAD_GEOM.avenueHalf : ROAD_GEOM.streetHalf) + 2.6;
    // 四个街角，按种子打乱后取第一个合法的
    const corners = signalRng.shuffle([
      [1, 1, 0],
      [1, -1, 90],
      [-1, -1, 180],
      [-1, 1, 270]
    ]);
    for (let c = 0; c < corners.length; c++) {
      const sx = corners[c][0];
      const sz = corners[c][1];
      const x = ix.x + sx * offX;
      const z = ix.z + sz * offZ;
      if (!siteOk(x, z) || !occupancy.free(x, z)) continue;
      occupancy.claim(x, z);
      signalSites.push({
        x,
        z,
        yaw: corners[c][2] * DEG2RAD,
        angleDeg: corners[c][2],
        intersectionId: ix.id
      });
      break;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 2) 其余各类站位                                                          */
  /* ---------------------------------------------------------------------- */

  const lampRng = rootRng.fork('lamps');
  const treeRng = rootRng.fork('trees');
  const propRng = rootRng.fork('props');

  const lampSites = collectSites(tune.lampStep, 9, 2.6, 1, lampRng);
  const treeSites = collectSites(tune.treeStep, 24, 2.3, 1, treeRng);
  const hydrantSites = collectSites(196, 41, 1.5, tune.propScale, propRng);
  const binSites = collectSites(174, 96, 1.7, tune.propScale, propRng);
  const benchSites = collectSites(228, 137, 4.3, tune.propScale, propRng);
  const standSites = collectSites(880, 212, 3.0, tune.propScale, propRng);
  const manholeSites = collectSites(238, 63, 1.0, 1, propRng);

  /* ---------------------------------------------------------------------- */
  /* 3) 沿街店铺：雨棚 + 霓虹招牌（挂在街区可建矩形的边界 = 建筑立面线）           */
  /* ---------------------------------------------------------------------- */

  const shopRng = rootRng.fork('shops');
  /** @type {Array<{x:number,z:number,yaw:number}>} */
  const awningSites = [];
  /** @type {Array<{x:number,z:number,yaw:number,color:number}>} */
  const neonSites = [];

  const NEON_COLORS = [0xff2d6f, 0x24e0ff, 0xffd447, 0x7dff5c, 0xff8a1f, 0xc86bff, 0xff4d4d, 0x37ffd0];
  const blocks = Array.isArray(plan.blocks) ? plan.blocks : [];

  for (let b = 0; b < blocks.length; b++) {
    const blk = blocks[b];
    if (!blk || blk.isPark) continue;
    const w = blk.maxX - blk.minX;
    const d = blk.maxZ - blk.minZ;
    if (w < 12 || d < 12) continue;

    // 四条立面线：[沿轴, 固定值, 外法线]
    const edges = [
      { along: 'x', from: blk.minX, to: blk.maxX, fixed: blk.minZ, nx: 0, nz: -1 },
      { along: 'x', from: blk.minX, to: blk.maxX, fixed: blk.maxZ, nx: 0, nz: 1 },
      { along: 'z', from: blk.minZ, to: blk.maxZ, fixed: blk.minX, nx: -1, nz: 0 },
      { along: 'z', from: blk.minZ, to: blk.maxZ, fixed: blk.maxX, nx: 1, nz: 0 }
    ];

    // 中城 + 百老汇沿线霓虹更密（时代广场氛围）
    const glitzy = blk.centerZ > -900 && blk.centerZ < 500;
    const awningP = 0.15 * tune.shopChance;
    const neonP = (glitzy ? 0.26 : 0.1) * tune.shopChance;

    for (let e = 0; e < edges.length; e++) {
      const edge = edges[e];
      const span = edge.to - edge.from;
      if (span < 24) continue;
      const slots = Math.max(1, Math.floor(span / 22));
      const yaw = Math.atan2(edge.nx, edge.nz);
      for (let s = 0; s < slots; s++) {
        const t = edge.from + (span * (s + 0.5)) / slots + shopRng.range(-4, 4);
        const px = edge.along === 'x' ? t : edge.fixed;
        const pz = edge.along === 'x' ? edge.fixed : t;
        // 被百老汇切掉的立面段没有楼，跳过（21m = 百老汇半宽 + 人行道）
        if (broadwayDist(px, pz) < 22) continue;
        if (inExcludeZone(px, pz, 6)) continue;
        if (isWater(px, pz)) continue;
        const wantAwning = shopRng.bool(awningP);
        const wantNeon = shopRng.bool(neonP);
        // 立面点稍微退进楼里 0.5m，避免建筑体块内缩时雨棚悬空
        const ax = px - edge.nx * 0.5;
        const az = pz - edge.nz * 0.5;
        if (wantAwning) awningSites.push({ x: ax, z: az, yaw });
        if (wantNeon) {
          neonSites.push({
            x: ax,
            z: az,
            yaw,
            color: NEON_COLORS[shopRng.int(0, NEON_COLORS.length - 1)]
          });
        }
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 材质                                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * 登记并（可选）注入城市环境材质。
   * @param {THREE.Material} mat 材质
   * @param {Object|null} opts patchCityMaterial 的 opts；null 表示不注入
   * @returns {THREE.Material} 同一材质
   */
  function own(mat, opts) {
    if (opts) patchCityMaterial(mat, env, opts);
    ownedMaterials.push(mat);
    return mat;
  }

  const matPole = own(
    new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.52, metalness: 0.7 }),
    { snowAmount: 0.5, puddles: false }
  );
  const matLens = own(
    new THREE.MeshStandardMaterial({
      color: 0x22201c,
      roughness: 0.35,
      metalness: 0.1,
      emissive: new THREE.Color(0xffd8a0),
      emissiveIntensity: 0.0
    }),
    { snow: false, wetness: false, flash: true }
  );
  const matHalo = own(
    new THREE.MeshBasicMaterial({
      color: 0xffcf92,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false
    }),
    null
  );
  const matBulb = own(
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: true }),
    null
  );
  const matBark = own(
    new THREE.MeshStandardMaterial({ color: 0x5b4736, roughness: 0.94, metalness: 0.02 }),
    { snowAmount: 0.7, puddles: false }
  );
  const matLeaf = own(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.0
    }),
    { snowAmount: 1.0, puddles: false }
  );
  const matHydrant = own(
    new THREE.MeshStandardMaterial({ color: 0xb02a1c, roughness: 0.55, metalness: 0.18 }),
    { snowAmount: 0.9, puddles: false }
  );
  const matBin = own(
    new THREE.MeshStandardMaterial({ color: 0x2c3730, roughness: 0.62, metalness: 0.45 }),
    { snowAmount: 0.9, puddles: false }
  );
  const matBench = own(
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0.2 }),
    { snowAmount: 1.0, puddles: false }
  );
  const matStand = own(
    new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.66, metalness: 0.25 }),
    { snowAmount: 1.0, puddles: false }
  );
  const matManhole = own(
    new THREE.MeshStandardMaterial({ color: 0x3b3b3d, roughness: 0.72, metalness: 0.55 }),
    { snowAmount: 0.35, wetDarken: 0.45, puddles: false }
  );
  const matAwning = own(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.0,
      side: THREE.DoubleSide
    }),
    { snowAmount: 1.0, puddles: false }
  );
  const matNeon = own(
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    { snowAmount: 1.0, wetness: false, puddles: false }
  );

  /* ---------------------------------------------------------------------- */
  /* 几何                                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * 弯颈路灯杆（不含发光灯罩）：柱脚 + 锥形灯杆 + 3 段贝塞尔弯颈 + 灯罩外壳。
   * 局部朝向：灯臂伸向 +Z（放置时用 yaw 转向路心）。
   * @returns {THREE.BufferGeometry} 合并几何（约 60 三角形）
   */
  function buildLampPostGeometry() {
    const parts = [];
    const foot = new THREE.CylinderGeometry(0.22, 0.3, 0.44, 6, 1, true);
    foot.translate(0, 0.22, 0);
    parts.push(foot);
    const shaft = new THREE.CylinderGeometry(0.085, 0.17, 8.3, 6, 1, true);
    shaft.translate(0, 4.35, 0);
    parts.push(shaft);
    parts.push(
      ...buildBentArm([0, 8.42, 0], [0, 9.62, 0.8], [0, 9.02, 3.3], 3, 0.082, 0.058, 4)
    );
    const shade = new THREE.ConeGeometry(0.34, 0.34, 7, 1, true);
    shade.rotateX(Math.PI);
    shade.translate(0, 8.89, 3.3);
    parts.push(shade);
    return mergeParts(parts);
  }

  /**
   * 路灯灯头透镜（夜间 emissive 发光）。
   * @returns {THREE.BufferGeometry} 合并几何（12 三角形）
   */
  function buildLampLensGeometry() {
    const lens = new THREE.ConeGeometry(0.3, 0.26, 6, 1, false);
    lens.rotateX(Math.PI);
    lens.translate(0, 8.71, 3.3);
    lens.computeBoundingSphere();
    return lens;
  }

  /**
   * 灯下锥形光晕 + 地面光斑（加性混合面片，夜间才显示）。
   * @returns {THREE.BufferGeometry} 合并几何（16 三角形）
   */
  function buildLampHaloGeometry() {
    const parts = [];
    const cone = new THREE.ConeGeometry(3.5, 8.4, 8, 1, true);
    cone.translate(0, 4.4, 3.3);
    parts.push(cone);
    const pool = new THREE.CircleGeometry(3.9, 8);
    pool.rotateX(-Math.PI / 2);
    pool.translate(0, 0.035, 3.3);
    parts.push(pool);
    return mergeParts(parts);
  }

  /**
   * 红绿灯柱：立柱 + 两条等长横臂 + 两个三色灯箱。
   * 局部规范姿态对应"东南街角"（sx=+1, sz=+1）：
   *   A 臂沿 −X 伸出（跨大道），灯箱面朝 +Z；
   *   B 臂沿 −Z 伸出（跨横街），灯箱面朝 +X。
   * 两臂等长，因此绕 Y 轴 0/90/180/270° 旋转即可复用到四个街角（两臂角色互换）。
   * @returns {THREE.BufferGeometry} 合并几何（约 70 三角形）
   */
  function buildSignalPoleGeometry() {
    const parts = [];
    const foot = new THREE.CylinderGeometry(0.25, 0.32, 0.5, 6, 1, true);
    foot.translate(0, 0.25, 0);
    parts.push(foot);
    const pole = new THREE.CylinderGeometry(0.13, 0.19, 7.2, 6, 1, true);
    pole.translate(0, 3.6, 0);
    parts.push(pole);

    const armA = new THREE.CylinderGeometry(0.07, 0.1, SIG.armLen, 5, 1, true);
    armA.rotateZ(Math.PI / 2);
    armA.translate(-SIG.armLen * 0.5, 6.42, 0);
    parts.push(armA);
    const armB = new THREE.CylinderGeometry(0.07, 0.1, SIG.armLen, 5, 1, true);
    armB.rotateX(Math.PI / 2);
    armB.translate(0, 5.92, -SIG.armLen * 0.5);
    parts.push(armB);

    // 灯箱 A（面朝 +Z）与顶部遮阳檐
    parts.push(box(0.46, 1.34, 0.36, -SIG.armLen + 0.2, SIG.headAY, 0));
    parts.push(box(0.5, 0.06, 0.2, -SIG.armLen + 0.2, SIG.headAY + 0.7, 0.16));
    // 灯箱 B（面朝 +X）
    parts.push(box(0.36, 1.34, 0.46, 0, SIG.headBY, -SIG.armLen + 0.2));
    parts.push(box(0.2, 0.06, 0.5, 0.16, SIG.headBY + 0.7, -SIG.armLen + 0.2));
    return mergeParts(parts);
  }

  /**
   * 信号灯泡：轴向 +Z 的浅锥（侧面看仍有厚度，正面看是圆灯）。
   * @returns {THREE.BufferGeometry} 12 三角形
   */
  function buildBulbGeometry() {
    const g = new THREE.ConeGeometry(0.16, 0.07, 6, 1, false);
    g.rotateX(Math.PI / 2);
    return g;
  }

  /**
   * 行道树树干（局部原点在地面，顶端 2.6m）。
   * @returns {THREE.BufferGeometry} 12 三角形
   */
  function buildTrunkGeometry() {
    const g = new THREE.CylinderGeometry(0.15, 0.26, 2.6, 6, 1, true);
    g.translate(0, 1.3, 0);
    return g;
  }

  /**
   * 行道树树冠：4 层锥体（下宽上尖），局部原点在**树冠底部**（= 摆动支点）。
   * 顶点色自下而上由深绿过渡到亮绿，实例色再乘一层色调抖动。
   * @returns {THREE.BufferGeometry} 合并几何（52 三角形）
   */
  function buildCanopyGeometry() {
    const layers = [
      { r: 1.86, h: 2.3, y: 0.1, seg: 7, c: 0x3c552a },
      { r: 1.6, h: 2.15, y: 1.2, seg: 7, c: 0x486531 },
      { r: 1.26, h: 1.95, y: 2.3, seg: 6, c: 0x537239 },
      { r: 0.84, h: 1.7, y: 3.3, seg: 6, c: 0x5f8040 }
    ];
    const parts = [];
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      const g = new THREE.ConeGeometry(L.r, L.h, L.seg, 1, false);
      g.rotateY((i * Math.PI) / 7);
      g.translate(0, L.y + L.h * 0.5, 0);
      parts.push(paint(g, L.c));
    }
    return mergeParts(parts);
  }

  /**
   * 消防栓：主体 + 顶盖 + 两侧出水口。
   * @returns {THREE.BufferGeometry} 约 44 三角形
   */
  function buildHydrantGeometry() {
    const parts = [];
    const body = new THREE.CylinderGeometry(0.16, 0.19, 0.66, 6, 1, true);
    body.translate(0, 0.33, 0);
    parts.push(body);
    const dome = new THREE.ConeGeometry(0.17, 0.2, 6, 1, false);
    dome.translate(0, 0.74, 0);
    parts.push(dome);
    const capL = new THREE.CylinderGeometry(0.075, 0.075, 0.16, 4, 1, false);
    capL.rotateZ(Math.PI / 2);
    capL.translate(-0.19, 0.44, 0);
    parts.push(capL);
    const capR = capL.clone();
    capR.translate(0.38, 0, 0);
    parts.push(capR);
    return mergeParts(parts);
  }

  /**
   * 街头垃圾桶：桶身 + 桶口环 + 桶底。
   * @returns {THREE.BufferGeometry} 约 40 三角形
   */
  function buildBinGeometry() {
    const parts = [];
    const body = new THREE.CylinderGeometry(0.33, 0.28, 0.9, 8, 1, true);
    body.translate(0, 0.45, 0);
    parts.push(body);
    const rim = new THREE.CylinderGeometry(0.36, 0.36, 0.08, 8, 1, true);
    rim.translate(0, 0.9, 0);
    parts.push(rim);
    const bottom = new THREE.CircleGeometry(0.28, 8);
    bottom.rotateX(-Math.PI / 2);
    bottom.translate(0, 0.03, 0);
    parts.push(bottom);
    return mergeParts(parts);
  }

  /**
   * 长椅：木条座面 + 靠背 + 两条铸铁腿（顶点色区分木/铁）。局部朝向 +Z（面向马路）。
   * @returns {THREE.BufferGeometry} 48 三角形
   */
  function buildBenchGeometry() {
    const wood = 0x6d4a2c;
    const iron = 0x33383a;
    const parts = [];
    parts.push(box(1.82, 0.09, 0.52, 0, 0.44, 0.02, wood));
    const back = box(1.82, 0.44, 0.08, 0, 0.7, -0.24, wood);
    back.rotateX(0.12);
    parts.push(back);
    parts.push(box(0.09, 0.44, 0.48, -0.8, 0.22, 0, iron));
    parts.push(box(0.09, 0.44, 0.48, 0.8, 0.22, 0, iron));
    return mergeParts(parts);
  }

  /**
   * 报刊亭：主体 + 挑檐 + 售卖台 + 顶部招牌板。局部朝向 +Z（开口面向人行道）。
   * @returns {THREE.BufferGeometry} 48 三角形
   */
  function buildNewsstandGeometry() {
    const bodyC = 0x22452f;
    const roofC = 0x2a2c2e;
    const signC = 0xd8d2c4;
    const parts = [];
    parts.push(box(2.6, 2.3, 1.9, 0, 1.15, 0, bodyC));
    parts.push(box(2.94, 0.14, 2.26, 0, 2.36, 0.1, roofC));
    parts.push(box(2.3, 0.1, 0.5, 0, 1.16, 1.05, signC));
    parts.push(box(2.2, 0.42, 0.08, 0, 2.68, 0.2, signC));
    return mergeParts(parts);
  }

  /**
   * 井盖：略高出人行道面的铸铁圆盘。
   * @returns {THREE.BufferGeometry} 32 三角形
   */
  function buildManholeGeometry() {
    const g = new THREE.CylinderGeometry(0.42, 0.45, 0.07, 8, 1, false);
    return g;
  }

  /**
   * 店铺雨棚：4 条斜面篷布 + 4 条前檐垂片，局部原点在立面根部（y=0），向 +Z 挑出。
   * 顶点色作为**明暗倍率**（1.0 / 2.15）与实例色相乘，得到同色系双色条纹。
   * @returns {THREE.BufferGeometry} 16 三角形
   */
  function buildAwningGeometry() {
    const parts = [];
    const stripes = 4;
    const totalW = 3.2;
    const sw = totalW / stripes;
    const depth = 1.5;
    const yBack = 3.55;
    const yFront = 2.98;
    const slant = Math.hypot(depth, yBack - yFront);
    const pitch = Math.atan2(yBack - yFront, depth);
    for (let i = 0; i < stripes; i++) {
      const cx = -totalW * 0.5 + sw * (i + 0.5);
      const tint = i % 2 === 0 ? 0xffffff : 0x6b6b6b;
      const top = new THREE.PlaneGeometry(sw, slant);
      top.rotateX(-Math.PI / 2 + pitch);
      top.translate(cx, (yBack + yFront) * 0.5, depth * 0.5);
      parts.push(paint(top, tint));
      const skirt = new THREE.PlaneGeometry(sw, 0.34);
      skirt.translate(cx, yFront - 0.17, depth);
      parts.push(paint(skirt, tint));
    }
    return mergeParts(parts);
  }

  /**
   * 霓虹招牌：垂直于立面挑出的"刀旗"灯箱，两面可见。
   * @returns {THREE.BufferGeometry} 12 三角形
   */
  function buildNeonGeometry() {
    return box(0.1, 1.15, 1.5, 0, 4.75, 0.92);
  }

  /* ---------------------------------------------------------------------- */
  /* 实例化装配                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * 建立一个 InstancedMesh 并登记资源。
   * @param {string} name 名称
   * @param {THREE.BufferGeometry} geo 几何
   * @param {THREE.Material} mat 材质
   * @param {number} count 实例数
   * @returns {THREE.InstancedMesh|null} count<=0 时返回 null（并释放几何）
   */
  function makeMesh(name, geo, mat, count) {
    if (count <= 0) {
      geo.dispose();
      return null;
    }
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.name = name;
    ownedGeometries.push(geo);
    meshes.push(mesh);
    group.add(mesh);
    return mesh;
  }

  /**
   * 写入一个实例矩阵（平移 + Y 轴旋转 + 缩放）。
   * @param {THREE.InstancedMesh} mesh 目标
   * @param {number} i 实例下标
   * @param {number} x 世界 X
   * @param {number} y 世界 Y
   * @param {number} z 世界 Z
   * @param {number} yaw Y 轴旋转（弧度）
   * @param {number} sx X 缩放
   * @param {number} sy Y 缩放
   * @param {number} sz Z 缩放
   * @returns {void}
   */
  function setInstance(mesh, i, x, y, z, yaw, sx, sy, sz) {
    _pos.set(x, y, z);
    _quatYaw.setFromAxisAngle(UP, yaw);
    _scl.set(sx, sy, sz);
    _mat4.compose(_pos, _quatYaw, _scl);
    mesh.setMatrixAt(i, _mat4);
  }

  // —— 路灯 ——
  const lampCount = lampSites.length;
  const lampPostMesh = makeMesh('lamp-post', buildLampPostGeometry(), matPole, lampCount);
  const lampLensMesh = makeMesh('lamp-lens', buildLampLensGeometry(), matLens, lampCount);
  const lampHaloMesh = makeMesh('lamp-halo', buildLampHaloGeometry(), matHalo, lampCount);
  for (let i = 0; i < lampCount; i++) {
    const s = lampSites[i];
    const h = lampRng.range(0.94, 1.06);
    if (lampPostMesh) setInstance(lampPostMesh, i, s.x, SIDEWALK_Y, s.z, s.yaw, 1, h, 1);
    if (lampLensMesh) setInstance(lampLensMesh, i, s.x, SIDEWALK_Y, s.z, s.yaw, 1, h, 1);
    if (lampHaloMesh) setInstance(lampHaloMesh, i, s.x, SIDEWALK_Y, s.z, s.yaw, 1, h, 1);
  }

  // —— 红绿灯柱 + 灯泡 ——
  const signalCount = signalSites.length;
  const signalPoleMesh = makeMesh('signal-pole', buildSignalPoleGeometry(), matPole, signalCount);
  const bulbMesh = makeMesh('signal-bulb', buildBulbGeometry(), matBulb, signalCount * 6);

  /** 三色亮灯色（红/黄/绿） */
  const BULB_ON = [new THREE.Color(0xff2a14), new THREE.Color(0xffbe1a), new THREE.Color(0x2bff62)];
  /** 三色灭灯色（保留一点本色，避免纯黑死板） */
  const BULB_OFF = [new THREE.Color(0x2a0a06), new THREE.Color(0x2a2008), new THREE.Color(0x06220f)];

  /**
   * @typedef {Object} SignalSlot
   * @property {number} x 灯柱世界 X
   * @property {number} z 灯柱世界 Z
   * @property {number} angleDeg 灯柱朝向（度，0=东南角规范姿态，逆时针 90 的整数倍）
   * @property {string} intersectionId 对应 plan.intersections[].id
   * @property {{ns:number[], ew:number[]}} lampIndices 灯泡实例下标 [红,黄,绿]
   */

  /** @type {SignalSlot[]} */
  const signalSlots = [];
  /** @type {Map<string, {slot: SignalSlot, offset: number, ns: string, ew: string}>} */
  const slotById = new Map();

  for (let i = 0; i < signalCount; i++) {
    const s = signalSites[i];
    if (signalPoleMesh) setInstance(signalPoleMesh, i, s.x, SIDEWALK_Y, s.z, s.yaw, 1, 1, 1);

    const cos = Math.cos(s.yaw);
    const sin = Math.sin(s.yaw);
    // 局部 → 世界：rotY(θ) 下 (lx,lz) → (lx·cosθ + lz·sinθ, −lx·sinθ + lz·cosθ)
    const heads = [
      { lx: -SIG.armLen + 0.2, ly: SIG.headAY, lz: SIG.bulbOut, fx: 0, fz: 1 },
      { lx: SIG.bulbOut, ly: SIG.headBY, lz: -SIG.armLen + 0.2, fx: 1, fz: 0 }
    ];
    const idx = { ns: null, ew: null };
    for (let h = 0; h < 2; h++) {
      const head = heads[h];
      const wfx = head.fx * cos + head.fz * sin;
      const wfz = -head.fx * sin + head.fz * cos;
      const bulbYaw = Math.atan2(wfx, wfz);
      const trio = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const bi = i * 6 + h * 3 + k;
        const ly = head.ly + SIG.bulbGap * (1 - k);
        const wx = s.x + head.lx * cos + head.lz * sin;
        const wz = s.z - head.lx * sin + head.lz * cos;
        if (bulbMesh) {
          setInstance(bulbMesh, bi, wx, SIDEWALK_Y + ly, wz, bulbYaw, 1, 1, 1);
          bulbMesh.setColorAt(bi, BULB_OFF[k]);
        }
        trio[k] = bi;
      }
      // 面朝 ±Z 的灯箱管南北向车流，面朝 ±X 的管东西向
      if (Math.abs(wfz) > 0.5) idx.ns = trio;
      else idx.ew = trio;
    }

    const slot = {
      x: s.x,
      z: s.z,
      angleDeg: s.angleDeg,
      intersectionId: s.intersectionId,
      lampIndices: { ns: idx.ns || [], ew: idx.ew || [] }
    };
    signalSlots.push(slot);
    // 绿波：沿 +Z 方向按 11.5 m/s 的车队速度线性错开相位
    slotById.set(slot.intersectionId, {
      slot,
      offset: mod(s.z / 11.5 + s.x * 0.02, PHASE.total),
      ns: '',
      ew: ''
    });
  }

  // —— 行道树 ——
  const treeCount = treeSites.length;
  const trunkMesh = makeMesh('tree-trunk', buildTrunkGeometry(), matBark, treeCount);
  const canopyMesh = makeMesh('tree-canopy', buildCanopyGeometry(), matLeaf, treeCount);
  if (canopyMesh) canopyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  /** 每棵树 8 个浮点：x, y(树冠支点), z, scaleXZ, scaleY, yaw, phase, ampScale */
  const treeData = new Float32Array(treeCount * 8);
  const treeNoise = makeNoise2D(rootRng.fork('tree-noise').seed);
  const leafTint = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const s = treeSites[i];
    const sxz = treeRng.range(0.82, 1.22);
    const sy = treeRng.range(0.86, 1.3);
    const trunkScale = treeRng.range(0.9, 1.15);
    const yaw = treeRng.range(0, Math.PI * 2);
    if (trunkMesh) setInstance(trunkMesh, i, s.x, SIDEWALK_Y, s.z, yaw, trunkScale, trunkScale, trunkScale);
    const o = i * 8;
    treeData[o] = s.x;
    treeData[o + 1] = SIDEWALK_Y + 2.55 * trunkScale;
    treeData[o + 2] = s.z;
    treeData[o + 3] = sxz;
    treeData[o + 4] = sy;
    treeData[o + 5] = yaw;
    treeData[o + 6] = (treeNoise(s.x * 0.035, s.z * 0.035) + 1) * Math.PI;
    treeData[o + 7] = treeRng.range(0.7, 1.35);
    if (canopyMesh) {
      const g = treeRng.range(0.86, 1.14);
      leafTint.setRGB(g * treeRng.range(0.9, 1.06), g, g * treeRng.range(0.86, 1.02));
      canopyMesh.setColorAt(i, leafTint);
      setInstance(canopyMesh, i, treeData[o], treeData[o + 1], treeData[o + 2], yaw, sxz, sy, sxz);
    }
  }

  // —— 小件 ——
  const hydrantMesh = makeMesh('hydrant', buildHydrantGeometry(), matHydrant, hydrantSites.length);
  for (let i = 0; i < hydrantSites.length; i++) {
    const s = hydrantSites[i];
    setInstance(hydrantMesh, i, s.x, SIDEWALK_Y, s.z, s.yaw, 1, 1, 1);
  }

  const binMesh = makeMesh('trash-bin', buildBinGeometry(), matBin, binSites.length);
  for (let i = 0; i < binSites.length; i++) {
    const s = binSites[i];
    setInstance(binMesh, i, s.x, SIDEWALK_Y, s.z, s.yaw + propRng.range(-0.3, 0.3), 1, 1, 1);
  }

  const benchMesh = makeMesh('bench', buildBenchGeometry(), matBench, benchSites.length);
  for (let i = 0; i < benchSites.length; i++) {
    const s = benchSites[i];
    setInstance(benchMesh, i, s.x, SIDEWALK_Y, s.z, s.yaw, 1, 1, 1);
  }

  const standMesh = makeMesh('newsstand', buildNewsstandGeometry(), matStand, standSites.length);
  for (let i = 0; i < standSites.length; i++) {
    const s = standSites[i];
    setInstance(standMesh, i, s.x, SIDEWALK_Y, s.z, s.yaw, 1, 1, 1);
  }

  const manholeMesh = makeMesh('manhole', buildManholeGeometry(), matManhole, manholeSites.length);
  /** @type {Array<{x:number, z:number}>} */
  const manholes = [];
  for (let i = 0; i < manholeSites.length; i++) {
    const s = manholeSites[i];
    setInstance(manholeMesh, i, s.x, SIDEWALK_Y + 0.01, s.z, propRng.range(0, Math.PI), 1, 1, 1);
    manholes.push({ x: s.x, z: s.z });
  }

  // —— 雨棚 / 霓虹 ——
  const AWNING_COLORS = [0x8f2026, 0x1d4d30, 0x1e3a6b, 0x6d4a1c, 0x33343a, 0x76265c];
  const awningMesh = makeMesh('awning', buildAwningGeometry(), matAwning, awningSites.length);
  const tmpColor = new THREE.Color();
  for (let i = 0; i < awningSites.length; i++) {
    const s = awningSites[i];
    const w = shopRng.range(0.85, 1.15);
    setInstance(awningMesh, i, s.x, 0, s.z, s.yaw, w, 1, 1);
    tmpColor.set(AWNING_COLORS[shopRng.int(0, AWNING_COLORS.length - 1)]);
    awningMesh.setColorAt(i, tmpColor);
  }

  const neonMesh = makeMesh('neon-sign', buildNeonGeometry(), matNeon, neonSites.length);
  for (let i = 0; i < neonSites.length; i++) {
    const s = neonSites[i];
    const sy = shopRng.range(0.8, 1.5);
    setInstance(neonMesh, i, s.x, shopRng.range(-0.6, 2.4), s.z, s.yaw, 1, sy, shopRng.range(0.8, 1.3));
    tmpColor.set(s.color);
    neonMesh.setColorAt(i, tmpColor);
  }

  // 实例属性上传
  for (let i = 0; i < meshes.length; i++) {
    const m = meshes[i];
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }

  /**
   * 阴影策略：发光/透明面片不投影（否则灯光会投出黑锥），
   * 细杆与贴地圆盘也关闭投影以省下一整趟阴影绘制。
   * main.js 在 mount() 里会统一把 castShadow 置真，因此首帧 update 再执行一次。
   * @returns {void}
   */
  function applyShadowPolicy() {
    const noCast = [lampHaloMesh, lampLensMesh, bulbMesh, neonMesh, manholeMesh, lampPostMesh];
    for (let i = 0; i < noCast.length; i++) {
      if (noCast[i]) noCast[i].castShadow = false;
    }
    if (lampHaloMesh) lampHaloMesh.receiveShadow = false;
    if (bulbMesh) bulbMesh.receiveShadow = false;
    if (neonMesh) neonMesh.receiveShadow = false;
  }
  applyShadowPolicy();

  /* ---------------------------------------------------------------------- */
  /* 灯色驱动                                                                  */
  /* ---------------------------------------------------------------------- */

  let bulbDirty = false;
  let lastExternalSet = -1e9;
  let lastElapsed = 0;

  /**
   * 把一个灯箱设成指定颜色（内部改 InstancedMesh 的 instanceColor）。
   * @param {number[]} trio 三个灯泡实例下标 [红,黄,绿]
   * @param {string} color 'red' | 'yellow' | 'green' | 其他（全灭）
   * @returns {void}
   */
  function paintHead(trio, color) {
    if (!bulbMesh || !trio || trio.length < 3) return;
    const on = color === 'red' ? 0 : color === 'yellow' ? 1 : color === 'green' ? 2 : -1;
    for (let k = 0; k < 3; k++) {
      bulbMesh.setColorAt(trio[k], k === on ? BULB_ON[k] : BULB_OFF[k]);
    }
    bulbDirty = true;
  }

  /**
   * 供 `sim/traffic.js` 调用：驱动某路口某方向的灯色（契约 §5.5 / §6.1）。
   * @param {string} intersectionId 路口 id（plan.intersections[].id）
   * @param {'ns'|'ew'} axis 方向轴（ns = 沿大道的南北向车流）
   * @param {'red'|'yellow'|'green'|'off'} color 目标灯色
   * @returns {boolean} 是否命中一个灯柱
   */
  function setSignalColor(intersectionId, axis, color) {
    const rec = slotById.get(intersectionId);
    if (!rec) return false;
    const key = axis === 'ew' ? 'ew' : 'ns';
    const c = typeof color === 'string' ? color.toLowerCase() : 'off';
    lastExternalSet = lastElapsed;
    if (rec[key] === c) return true;
    rec[key] = c;
    paintHead(rec.slot.lampIndices[key], c);
    if (bulbMesh && bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
    bulbDirty = false;
    return true;
  }

  /**
   * 兜底相位机（契约 §6.1 的时序）：南北绿 30s → 南北黄 4s → 东西绿 24s → 东西黄 4s。
   * @param {number} p 周期内相位（0..62）
   * @param {string[]} out 长度 2 的输出数组 [ns, ew]
   * @returns {void}
   */
  function fallbackState(p, out) {
    if (p < PHASE.nsGreen) {
      out[0] = 'green';
      out[1] = 'red';
    } else if (p < PHASE.nsGreen + PHASE.nsYellow) {
      out[0] = 'yellow';
      out[1] = 'red';
    } else if (p < PHASE.nsGreen + PHASE.nsYellow + PHASE.ewGreen) {
      out[0] = 'red';
      out[1] = 'green';
    } else {
      out[0] = 'red';
      out[1] = 'yellow';
    }
  }

  const _fallbackOut = ['', ''];

  /**
   * 无人接管时自行循环灯色（只在状态变化的灯箱上写色，避免每帧上传整条色缓冲）。
   * @param {number} timeSec 当前时间（秒）
   * @returns {void}
   */
  function runFallbackSignals(timeSec) {
    slotById.forEach((rec) => {
      fallbackState(mod(timeSec + rec.offset, PHASE.total), _fallbackOut);
      if (rec.ns !== _fallbackOut[0]) {
        rec.ns = _fallbackOut[0];
        paintHead(rec.slot.lampIndices.ns, rec.ns);
      }
      if (rec.ew !== _fallbackOut[1]) {
        rec.ew = _fallbackOut[1];
        paintHead(rec.slot.lampIndices.ew, rec.ew);
      }
    });
  }

  // 构建期先跑一次，保证首帧灯色不是全灭
  runFallbackSignals(0);
  if (bulbMesh && bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
  bulbDirty = false;

  /* ---------------------------------------------------------------------- */
  /* 每帧更新                                                                  */
  /* ---------------------------------------------------------------------- */

  let swayAccum = 0;
  let swayTime = 0;
  let shadowFixed = false;

  /**
   * 每帧更新：夜间发光、光晕、霓虹亮度、树冠风摆、信号灯兜底循环。
   * @param {Object} frameCtx FrameContext（契约 §2）
   * @returns {void}
   */
  function update(frameCtx) {
    if (!frameCtx) return;
    const dt = typeof frameCtx.dt === 'number' ? frameCtx.dt : 0;
    lastElapsed = typeof frameCtx.elapsed === 'number' ? frameCtx.elapsed : lastElapsed + dt;
    const night = clamp(typeof frameCtx.nightFactor === 'number' ? frameCtx.nightFactor : 0, 0, 1);
    const params = frameCtx.weather && frameCtx.weather.params ? frameCtx.weather.params : null;
    const rain = params ? clamp(params.rainIntensity || 0, 0, 1) : 0;
    const fogAmt = params ? clamp((params.fogDensity || 0) / 0.0035, 0, 1) : 0;

    // main.js 在 mount 时把整棵子树的 castShadow 置真，首帧纠正回来
    if (!shadowFixed) {
      applyShadowPolicy();
      shadowFixed = true;
    }

    // 路灯：夜间点亮，雨雾天略微增强（湿空气散射）
    matLens.emissiveIntensity = 0.02 + night * (2.2 + rain * 0.5);
    if (lampHaloMesh) {
      const op = night * (0.1 + 0.12 * fogAmt + 0.06 * rain);
      matHalo.opacity = op;
      lampHaloMesh.visible = op > 0.012;
    }
    // 霓虹：白天像涂装面板，夜间提亮（instanceColor 提供各自色相，这里只给全局倍率）
    matNeon.color.setScalar(lerp(0.38, 1.25, night));

    // 行道树整体风摆（30Hz 节流，只改树冠实例矩阵）
    if (canopyMesh && treeCount > 0) {
      swayAccum += dt;
      swayTime += dt;
      if (swayAccum >= SWAY_INTERVAL) {
        swayAccum = 0;
        const wind = frameCtx.wind || null;
        let wx = 0;
        let wz = 0;
        let speed = 0;
        if (wind && wind.vector) {
          wx = wind.vector.x;
          wz = wind.vector.z;
          speed = Math.hypot(wx, wz);
        } else if (wind && typeof wind.dirDeg === 'number') {
          const r = wind.dirDeg * DEG2RAD;
          speed = wind.speed || 0;
          wx = Math.sin(r) * speed;
          wz = -Math.cos(r) * speed;
        }
        if (speed < 1e-4) {
          wx = 0;
          wz = -1;
          speed = 0;
        } else {
          wx /= speed;
          wz /= speed;
        }
        // 倾斜轴 = up × windDir，绕它正向旋转即"顺风倒"
        _axis.set(0, 1, 0).cross(_vecA.set(wx, 0, wz));
        if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0);
        else _axis.normalize();
        // 幅度：15 m/s 左右接近满摆（约 9.7°），再叠加正弦呼吸
        const amp = clamp(speed / 15, 0, 1.15) * 0.17;
        const omega = 0.85 + clamp(speed, 0, 20) * 0.055;
        for (let i = 0; i < treeCount; i++) {
          const o = i * 8;
          const ang = amp * treeData[o + 7] * (0.62 + 0.38 * Math.sin(swayTime * omega + treeData[o + 6]));
          _quatTilt.setFromAxisAngle(_axis, ang);
          _quatYaw.setFromAxisAngle(UP, treeData[o + 5]);
          _quat.multiplyQuaternions(_quatTilt, _quatYaw);
          _pos.set(treeData[o], treeData[o + 1], treeData[o + 2]);
          _scl.set(treeData[o + 3], treeData[o + 4], treeData[o + 3]);
          _mat4.compose(_pos, _quat, _scl);
          canopyMesh.setMatrixAt(i, _mat4);
        }
        canopyMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // 信号灯兜底：没人接管，或外部驱动断流超过 3s，就自己循环
    const driven = handle.signalDriven === true && lastElapsed - lastExternalSet < SIGNAL_TAKEOVER_TIMEOUT;
    if (!driven) runFallbackSignals(lastElapsed);
    if (bulbDirty) {
      if (bulbMesh && bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
      bulbDirty = false;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 释放                                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * 释放本模块自建的全部 geometry / material（不碰 ctx.textures 的共享贴图）。
   * @returns {void}
   */
  function dispose() {
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      m.dispose();
      if (m.parent) m.parent.remove(m);
    }
    meshes.length = 0;
    for (let i = 0; i < ownedGeometries.length; i++) ownedGeometries[i].dispose();
    ownedGeometries.length = 0;
    for (let i = 0; i < ownedMaterials.length; i++) ownedMaterials[i].dispose();
    ownedMaterials.length = 0;
    group.clear();
    slotById.clear();
    signalSlots.length = 0;
    manholes.length = 0;
  }

  let instances = 0;
  for (let i = 0; i < meshes.length; i++) instances += meshes[i].count;

  const handle = {
    object3D: group,
    update,
    dispose,
    /** @type {SignalSlot[]} 供 sim/traffic.js 驱动灯色 */
    signalSlots,
    /** @type {Array<{x:number,z:number}>} 供蒸汽粒子取位 */
    manholes,
    /** 交通模块接管后由 main.js 置真；本模块据此关闭兜底循环 */
    signalDriven: false,
    setSignalColor,
    stats: {
      instances,
      draws: meshes.length,
      lamps: lampCount,
      trees: treeCount,
      signals: signalCount,
      manholes: manholes.length
    }
  };

  return handle;
}
