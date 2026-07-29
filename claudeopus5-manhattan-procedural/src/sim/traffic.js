/**
 * @file src/sim/traffic.js
 * @description 曼哈顿车流微观仿真（契约 §6.1）——**真仿真，不是循环动画**。
 *
 * ---------------------------------------------------------------------------
 * 一、系统组成
 * ---------------------------------------------------------------------------
 * 1. **车道图（lane graph）**：节点 = 路口（取自 `plan.intersections`），
 *    有向边 = 单条车道。大道每向 2 车道、街道每向 1 车道、百老汇每向 2 车道，
 *    车道中心线由路宽推算（大道 34m ⇒ 每向半幅 17m ⇒ 车道中心 ±4.25 / ±12.75）。
 *    路口区被"修剪"掉：路段车道止于停止线，路口内部由**连接段（link）**接管，
 *    因此车辆在路口不会互相重叠穿模。
 * 2. **信号相位机**：南北绿 30s → 南北黄 4s → 东西绿 24s → 东西黄 4s，周期 62s；
 *    相位偏移按 z 线性错开（`offset = z / 绿波车速`），形成沿大道的"绿波"。
 * 3. **纵向动力学**：IDM（Intelligent Driver Model, Treiber–Hennecke–Helbing,
 *    Phys. Rev. E 62, 1805 (2000)）。红灯 / 黄灯末期把停止线当作"距离 s 处速度为 0
 *    的虚拟前车"，因此减速平滑且不越线。
 * 4. **路口转向**：直行 0.72 / 右转 0.18 / 左转 0.10（掉头仅在无路可走时兜底），
 *    转弯路径为二次贝塞尔，车头朝向跟随路径切线并用指数阻尼平滑。
 *    左转需让行：对向直行车道上有临近来车时等待（带 6s 超时防死锁）。
 * 5. **渲染**：5 类车型各一个 `InstancedMesh`（车身 + 深色车窗 + 车轮合并为单几何，
 *    车漆用 `instanceColor` 逐车着色）；车灯用**一个**加性混合 `InstancedMesh`
 *    承载前灯 / 地面光晕 / 尾灯 / 出租车顶灯（每车 6 个实例位），
 *    **绝不为每辆车创建 PointLight**。合计 6 个 drawcall。
 *
 * ---------------------------------------------------------------------------
 * 二、性能约定
 * ---------------------------------------------------------------------------
 * - 每条车道维护一个**按位置升序**的车辆数组；车道内不允许超车，故顺序天然保持，
 *   前车查找是 O(1)（相邻元素），整帧复杂度 O(车辆数)，260 辆车开销可忽略。
 * - `update()` 内不 new 任何大对象：矩阵 / 向量 / 四元数全部为模块级复用临时量；
 *   路口连接段（link）按需创建并**永久缓存**，热身后不再产生垃圾。
 * - 车灯实例仅在 `ctx.nightFactor > 0.25` 时更新与显示。
 *
 * ---------------------------------------------------------------------------
 * 三、契约差异说明（按契约 §0 要求就地记录，不单方面改接口）
 * ---------------------------------------------------------------------------
 * 契约 §0 规定 `sim/*` 只依赖 `core/*` 与 `render/shaderpatch.js`，**不得 import
 * `city/*`**；而车道中心线又必须由 `CITY` 的路宽推算。因此本文件不 import
 * `city/grid.js`，改为：几何拓扑（大道 X、街道 Z、百老汇端点、路口表）一律从
 * `ctx0.plan` 读取，路宽等标量常量按契约 §4.1 的**给定数值**就地重述（见
 * `ROAD_WIDTH`），数值与 `CITY` 完全一致且契约声明"不得修改"。
 *
 * 坐标约定（契约 §0）：Y 轴向上；+X 东、−X 西；+Z 南（下城）、−Z 北（上城）；1 单位 = 1 米。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, dampAngleDeg, mod, DEG2RAD, RAD2DEG } from '../core/mathx.js';
import { makeRng } from '../core/rng.js';
import { patchCityMaterial } from '../render/shaderpatch.js';

/* ========================================================================== *
 * 常量
 * ========================================================================== */

/**
 * 道路宽度（米）。契约 §4.1 `CITY` 的给定值，因依赖方向限制不 import，就地重述。
 * @type {{avenue: number, street: number, broadway: number, sidewalk: number}}
 */
const ROAD_WIDTH = Object.freeze({ avenue: 34, street: 20, broadway: 30, sidewalk: 6 });

/**
 * 中央公园矩形（契约 §4.1 `CITY.park`）。仅用于剔除穿过公园腹地的大道路段，
 * 避免车辆在公园地形里穿行。
 */
const PARK_RECT = Object.freeze({ minX: -420, maxX: 140, minZ: -2080, maxZ: -720 });

/** 每向车道数：大道 2、街道 1、百老汇 2（契约 §6.1）。 */
const LANES_PER_DIR = Object.freeze({ avenue: 2, street: 1, broadway: 2 });

/** 期望车速 v₀（m/s）：大道 13.4 ≈ 30mph、街道 9、百老汇斜街 12（介于两者）。 */
const V0 = Object.freeze({ avenue: 13.4, street: 9, broadway: 12 });

/** IDM 标定参数（契约 §6.1 给定）。 */
export const IDM_DEFAULTS = Object.freeze({
  aMax: 1.6,
  b: 2.2,
  delta: 4,
  s0: 2.5,
  T: 1.4,
  v0: 13.4
});

/** 紧急制动上限（m/s²）。约 0.9g，防止 gap→0 时加速度发散成 −∞。 */
const MAX_DECEL = 9;

/** gap 的下限，避免除零。 */
const MIN_GAP = 0.05;

/** 雨雪天的跟车时距 T（秒）——契约要求由 1.4 增大到 1.9。 */
const T_WET = 1.9;

/** 雨雪天的期望车速倍率（契约要求 ×0.75）。 */
const V0_WET_SCALE = 0.75;

/** 信号配时（秒）：南北绿 30 → 南北黄 4 → 东西绿 24 → 东西黄 4。 */
export const SIGNAL_TIMING = Object.freeze({ nsGreen: 30, nsYellow: 4, ewGreen: 24, ewYellow: 4 });

/** 信号周期（秒）= 30 + 4 + 24 + 4 = 62。 */
export const SIGNAL_CYCLE =
  SIGNAL_TIMING.nsGreen + SIGNAL_TIMING.nsYellow + SIGNAL_TIMING.ewGreen + SIGNAL_TIMING.ewYellow;

/** 绿波设计车速（m/s）：沿 +Z（南行）以此速度行驶可连续遇绿灯。 */
export const GREEN_WAVE_SPEED = 13.4;

/** 四个相位各自的起始时刻（秒），用于求"本相位已持续多久"。 */
const PHASE_START = Object.freeze([
  0,
  SIGNAL_TIMING.nsGreen,
  SIGNAL_TIMING.nsGreen + SIGNAL_TIMING.nsYellow,
  SIGNAL_TIMING.nsGreen + SIGNAL_TIMING.nsYellow + SIGNAL_TIMING.ewGreen
]);

/**
 * 绿灯启动损失时间（秒）。真实交叉口的启动损失约 2s；这里取 1.3s，
 * 既模拟驾驶员反应，又充当**清空间隔（all-red clearance）**：
 * 上一相位末尾抢黄灯冲进路口的车有时间驶离，避免与刚起步的车辆交叠。
 */
const GREEN_START_DELAY = 1.3;

/** 转向概率（契约 §6.1）：直行 / 右转 / 左转；掉头仅作兜底。 */
const TURN_WEIGHT = Object.freeze({ straight: 0.72, right: 0.18, left: 0.1, uturn: 0.002 });

/** 转向分类阈值（度）。 */
const TURN_ANGLE = Object.freeze({ straightMax: 32, uturnMin: 150 });

/** 左转让行的判定距离（米）与最长等待时间（秒，超时后强行通过，防死锁）。 */
const YIELD_DISTANCE = 46;
const YIELD_TIMEOUT = 12;

/** 停止线相对路段末端的富余量（米）。 */
const STOP_LINE_CLEARANCE = 0.6;

/** 各画质下的车辆总数（契约 §6.1）。 */
const CAR_COUNT = Object.freeze({ high: 260, medium: 160, low: 90 });

/** 车灯 / 光晕：每辆车占用的实例位数量（前灯 ×2、地面光晕 ×1、尾灯 ×2、顶灯 ×1）。 */
const GLOW_SLOTS = 6;

/** 夜间车灯的显示阈值（契约 §6.1：仅在 nightFactor > 0.25 时显示）。 */
const NIGHT_LIGHT_THRESHOLD = 0.25;

/** 判定"刹车"的减速度阈值（m/s²），低于它尾灯变亮。 */
const BRAKE_ACC = -1.2;

/** 车道内两车的最小初始净间距（米）。 */
const SPAWN_MIN_GAP = 7;

/** 仿真子步上限（秒）。dt 更大时拆成多步，保证 IDM 数值稳定。 */
const MAX_SUB_DT = 0.05;

/* ========================================================================== *
 * 纯函数（供 tests/traffic.test.js 直接验证）
 * ========================================================================== */

/**
 * IDM（Intelligent Driver Model）纵向加速度。
 *
 * 公式（Treiber, Hennecke & Helbing, *Congested traffic states in empirical
 * observations and microscopic simulations*, Phys. Rev. E 62, 1805, 2000）：
 *
 *   a = a_max · [ 1 − (v / v₀)^δ − (s* / s)² ]
 *   s* = s₀ + max( 0, v·T + v·Δv / (2·√(a_max·b)) )
 *
 * 其中 `s` 为与前车的**净间距**（车头到前车车尾），`Δv = v − v_前车`（正值表示正在逼近）。
 * 自由流（`gap = Infinity`）时交互项为 0，加速度退化为 `a_max·[1 − (v/v₀)^δ]`，
 * 于是 v → v₀ 时 a → 0；v = 0 时 a = a_max > 0。
 * 前车极近（`gap → 0`）时交互项发散，结果被夹到 `−MAX_DECEL`（0.9g 紧急制动）。
 *
 * @param {Object} [params] 参数对象
 * @param {number} [params.v=0] 当前车速（m/s）
 * @param {number} [params.v0=13.4] 期望车速（m/s）
 * @param {number} [params.gap=Infinity] 与前车净间距（m）；无前车传 Infinity
 * @param {number} [params.dv=0] 速度差 v − v_前车（m/s）
 * @param {number} [params.aMax=1.6] 最大加速度（m/s²）
 * @param {number} [params.b=2.2] 舒适减速度（m/s²）
 * @param {number} [params.s0=2.5] 静止安全间距（m）
 * @param {number} [params.T=1.4] 跟车时距（s）
 * @param {number} [params.delta=4] 自由流加速度指数
 * @returns {number} 加速度（m/s²），夹在 [−9, aMax]
 */
export function idmAcceleration(params = {}) {
  const {
    v = 0,
    v0 = IDM_DEFAULTS.v0,
    gap = Number.POSITIVE_INFINITY,
    dv = 0,
    aMax = IDM_DEFAULTS.aMax,
    b = IDM_DEFAULTS.b,
    s0 = IDM_DEFAULTS.s0,
    T = IDM_DEFAULTS.T,
    delta = IDM_DEFAULTS.delta
  } = params;

  const speed = v > 0 ? v : 0;
  const desired = v0 > 1e-3 ? v0 : 1e-3;
  const free = 1 - Math.pow(speed / desired, delta);

  let interaction = 0;
  if (Number.isFinite(gap)) {
    const sStar = s0 + Math.max(0, speed * T + (speed * dv) / (2 * Math.sqrt(aMax * b)));
    const s = gap > MIN_GAP ? gap : MIN_GAP;
    const ratio = sStar / s;
    interaction = ratio * ratio;
  }

  return clamp(aMax * (free - interaction), -MAX_DECEL, aMax);
}

/**
 * 四相位信号机在给定时刻的灯色。
 *
 * 相位表（周期 62s）：
 * | 区间(s)  | 南北 | 东西 |
 * |----------|------|------|
 * | [0, 30)  | 绿   | 红   |
 * | [30, 34) | 黄   | 红   |
 * | [34, 58) | 红   | 绿   |
 * | [58, 62) | 红   | 黄   |
 *
 * 安全性：任何时刻南北与东西**不可能同时为绿**（表中每行至少一侧为红）。
 * 相位偏移用于绿波：`signalStateAt(offset, t)` 取 `mod(t − offset, 62)`，
 * 因此以设计车速沿 +Z 行驶的车辆看到的相位恒定（见 {@link phaseOffsetForZ}）。
 *
 * @param {number} intersectionPhaseOffset 该路口的相位偏移（秒，可为任意实数）
 * @param {number} timeSec 仿真时刻（秒）
 * @returns {{ns: 'green'|'yellow'|'red', ew: 'green'|'yellow'|'red', phase: number, cycleTime: number}}
 *   `phase` 为 0..3 的相位序号，`cycleTime` 为周期内已过时间
 */
export function signalStateAt(intersectionPhaseOffset, timeSec) {
  const offset = Number.isFinite(intersectionPhaseOffset) ? intersectionPhaseOffset : 0;
  const t = Number.isFinite(timeSec) ? timeSec : 0;
  const c = mod(t - offset, SIGNAL_CYCLE);

  const g1 = SIGNAL_TIMING.nsGreen;
  const y1 = g1 + SIGNAL_TIMING.nsYellow;
  const g2 = y1 + SIGNAL_TIMING.ewGreen;

  if (c < g1) return { ns: 'green', ew: 'red', phase: 0, cycleTime: c };
  if (c < y1) return { ns: 'yellow', ew: 'red', phase: 1, cycleTime: c };
  if (c < g2) return { ns: 'red', ew: 'green', phase: 2, cycleTime: c };
  return { ns: 'red', ew: 'yellow', phase: 3, cycleTime: c };
}

/**
 * 由路口 Z 坐标计算绿波相位偏移。
 *
 * 绿波（green wave / progression band）原理：让相邻路口的相位沿行进方向依次滞后
 * `Δz / v_设计`，则以 `v_设计` 巡航的车队始终处于绿灯窗口内。
 * 这里取 `offset = z / GREEN_WAVE_SPEED`（+Z 南行方向为正），并对周期取模。
 *
 * @param {number} z 路口的世界 Z 坐标（米）
 * @returns {number} 相位偏移（秒，[0, 62)）
 */
export function phaseOffsetForZ(z) {
  return mod(z / GREEN_WAVE_SPEED, SIGNAL_CYCLE);
}

/* ========================================================================== *
 * 车道图：几何与拓扑
 * ========================================================================== */

/**
 * 把 (dirX, dirZ) 方向转成航向角（度）。约定 0° = +Z（正南），90° = +X（正东），
 * 与绕 Y 轴旋转角一致：绕 Y 转 θ 会把局部 +Z 映射到 (sinθ, 0, cosθ)。
 * @param {number} dx X 分量
 * @param {number} dz Z 分量
 * @returns {number} 航向角（度）
 */
function headingDegOf(dx, dz) {
  return Math.atan2(dx, dz) * RAD2DEG;
}

/**
 * 两航向角之差，折算到 (−180, 180]。正值 = 左转方向，负值 = 右转方向。
 * （车头朝 +Z 时右手指向 −X，对应航向角减小。）
 * @param {number} fromDeg 入边航向
 * @param {number} toDeg 出边航向
 * @returns {number} 角差（度）
 */
function angleDeltaDeg(fromDeg, toDeg) {
  return mod(toDeg - fromDeg + 180, 360) - 180;
}

/**
 * 按角差判定转向类型。
 * @param {number} deltaDeg 角差（度）
 * @returns {'straight'|'left'|'right'|'uturn'} 转向类型
 */
function classifyTurn(deltaDeg) {
  const a = Math.abs(deltaDeg);
  if (a <= TURN_ANGLE.straightMax) return 'straight';
  if (a >= TURN_ANGLE.uturnMin) return 'uturn';
  return deltaDeg > 0 ? 'left' : 'right';
}

/**
 * 创建一条**直线路段车道**。中心线由 (ax,az)→(bx,bz) 给出，
 * 两端按路口尺寸修剪，再沿"右手方向"平移 `offset` 得到车道中心线。
 *
 * 右手方向：车头朝 `f = (fx, fz)` 时，右侧单位向量为 `r = (−fz, fx)`
 * （由 `f × up` 得到，up = +Y）。车头朝 +Z（南）时 r = (−1,0)，即西侧，
 * 符合右侧通行：南行车走西半幅。
 *
 * @param {string} id 车道 id
 * @param {Object} fromNode 起点路口
 * @param {Object} toNode 终点路口
 * @param {number} offset 相对中心线的横向偏移（米，右手方向为正）
 * @param {number} trimA 起点侧修剪长度（米）
 * @param {number} trimB 终点侧修剪长度（米）
 * @param {'ns'|'ew'} axis 信号轴（南北 / 东西）
 * @param {'avenue'|'street'|'broadway'} roadType 道路类型
 * @param {number} laneIndex 车道序号（0 = 最内侧，靠中心线）
 * @param {number} laneCount 该方向的车道总数
 * @param {number} v0 期望车速（m/s）
 * @returns {Object|null} 车道对象；修剪后长度不足时返回 null
 */
function makeRoadLane(id, fromNode, toNode, offset, trimA, trimB, axis, roadType, laneIndex, laneCount, v0) {
  const dx = toNode.x - fromNode.x;
  const dz = toNode.z - fromNode.z;
  const raw = Math.hypot(dx, dz);
  if (raw <= trimA + trimB + 6) return null;

  const fx = dx / raw;
  const fz = dz / raw;
  const rx = -fz;
  const rz = fx;

  const x0 = fromNode.x + fx * trimA + rx * offset;
  const z0 = fromNode.z + fz * trimA + rz * offset;
  const x1 = toNode.x - fx * trimB + rx * offset;
  const z1 = toNode.z - fz * trimB + rz * offset;

  return {
    id,
    kind: 'road',
    x0,
    z0,
    x1,
    z1,
    fx,
    fz,
    length: Math.hypot(x1 - x0, z1 - z0),
    headingDeg: headingDegOf(fx, fz),
    axis,
    roadType,
    laneIndex,
    laneCount,
    v0,
    fromNode,
    toNode,
    cars: [],
    turns: [],
    opposing: [],
    feeders: [],
    reverse: null
  };
}

/**
 * 创建一条**路口连接段**（二次贝塞尔）。控制点取入边射线与出边射线的交点，
 * 近似平行时退化为中点，保证曲线始终与两端切向相接（车头朝向连续）。
 *
 * 二次贝塞尔：`B(t) = (1−t)²P₀ + 2(1−t)t·P₁ + t²P₂`，切向 `B'(t) = 2(1−t)(P₁−P₀) + 2t(P₂−P₁)`。
 * 弧长用 12 段折线近似（误差 < 0.3%），仅在创建时算一次。
 *
 * @param {Object} inLane 入边车道
 * @param {Object} outLane 出边车道
 * @param {'straight'|'left'|'right'|'uturn'} turnType 转向类型
 * @returns {Object} 连接段车道对象
 */
function makeLinkLane(inLane, outLane, turnType) {
  const p0x = inLane.x1;
  const p0z = inLane.z1;
  const p2x = outLane.x0;
  const p2z = outLane.z0;

  // 解 P0 + t·dIn = P2 − u·dOut 的交点
  const cross = inLane.fx * outLane.fz - inLane.fz * outLane.fx;
  let p1x = (p0x + p2x) * 0.5;
  let p1z = (p0z + p2z) * 0.5;
  if (Math.abs(cross) > 1e-4) {
    const ex = p2x - p0x;
    const ez = p2z - p0z;
    const t = (ex * outLane.fz - ez * outLane.fx) / cross;
    const chord = Math.hypot(ex, ez);
    const tc = clamp(t, 0, chord * 1.35 + 1);
    p1x = p0x + inLane.fx * tc;
    p1z = p0z + inLane.fz * tc;
  }

  let length = 0;
  let px = p0x;
  let pz = p0z;
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    const mt = 1 - t;
    const qx = mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x;
    const qz = mt * mt * p0z + 2 * mt * t * p1z + t * t * p2z;
    length += Math.hypot(qx - px, qz - pz);
    px = qx;
    pz = qz;
  }

  return {
    id: `${inLane.id}>${outLane.id}`,
    kind: 'link',
    p0x,
    p0z,
    p1x,
    p1z,
    p2x,
    p2z,
    length: Math.max(length, 1),
    axis: inLane.axis,
    roadType: inLane.roadType,
    v0: Math.min(inLane.v0, outLane.v0) * (turnType === 'straight' ? 1 : 0.55),
    turnType,
    inLane,
    outLane,
    fromNode: inLane.toNode,
    toNode: outLane.fromNode,
    cars: []
  };
}

/**
 * 求车道上距起点 `s` 处的世界坐标（写入 `out`）。
 * @param {Object} lane 车道
 * @param {number} s 沿车道的弧长（米）
 * @param {{x: number, z: number}} out 输出对象
 * @returns {{x: number, z: number}} 同 `out`
 */
function lanePoint(lane, s, out) {
  const d = clamp(s, 0, lane.length);
  if (lane.kind === 'road') {
    out.x = lane.x0 + lane.fx * d;
    out.z = lane.z0 + lane.fz * d;
    return out;
  }
  const t = lane.length > 0 ? d / lane.length : 0;
  const mt = 1 - t;
  out.x = mt * mt * lane.p0x + 2 * mt * t * lane.p1x + t * t * lane.p2x;
  out.z = mt * mt * lane.p0z + 2 * mt * t * lane.p1z + t * t * lane.p2z;
  return out;
}

/**
 * 求车道上 `s` 处的切向航向角（度）。
 * @param {Object} lane 车道
 * @param {number} s 沿车道的弧长（米）
 * @returns {number} 航向角（度）
 */
function laneHeadingDeg(lane, s) {
  if (lane.kind === 'road') return lane.headingDeg;
  const t = clamp(lane.length > 0 ? s / lane.length : 0, 0, 1);
  const mt = 1 - t;
  const dx = 2 * mt * (lane.p1x - lane.p0x) + 2 * t * (lane.p2x - lane.p1x);
  const dz = 2 * mt * (lane.p1z - lane.p0z) + 2 * t * (lane.p2z - lane.p1z);
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return headingDegOf(lane.p2x - lane.p0x, lane.p2z - lane.p0z);
  return headingDegOf(dx, dz);
}

/**
 * 判断一段大道是否穿过中央公园腹地（公园内没有路面，需剔除）。
 * @param {number} x 大道中心线 X
 * @param {number} z0 路段起点 Z
 * @param {number} z1 路段终点 Z
 * @returns {boolean} 是否位于公园内部
 */
function segmentInsidePark(x, z0, z1) {
  if (!(x > PARK_RECT.minX + 1 && x < PARK_RECT.maxX - 1)) return false;
  const mid = (z0 + z1) * 0.5;
  return mid > PARK_RECT.minZ && mid < PARK_RECT.maxZ;
}

/**
 * 由 `CityPlan` 构建完整车道图。
 *
 * 步骤：
 * 1. 路口 → 节点（含相位偏移、各方向路口修剪半宽）；百老汇与大道的斜交路口若与
 *    某个"大道×街道"路口重合（< 2m），合并为同一节点。
 * 2. 沿每条大道把节点按 Z 排序，相邻节点间生成南行 / 北行各 2 条车道；
 *    穿过中央公园腹地的路段剔除。
 * 3. 沿每条街道把节点按 X 排序，相邻节点间生成东行 / 西行各 1 条车道。
 * 4. 沿百老汇把斜交节点按 Z 排序，相邻节点间生成两向各 2 条车道。
 * 5. 为每条路段车道预计算：路口出边候选（含转向类型与权重）、对向来车车道（左转让行用）。
 *
 * @param {Object} plan `ctx0.plan`（契约 §4.1）
 * @returns {{nodes: Object[], lanes: Object[], nodeById: Map<string, Object>}} 车道图
 */
function buildLaneGraph(plan) {
  const avenueXs = Array.isArray(plan.avenueXs) ? plan.avenueXs.slice() : [];
  const bw = plan.broadway || null;
  const bwDirX = bw ? bw.dirX : 0;
  const bwDirZ = bw ? bw.dirZ : 1;

  // ---- 1. 节点 ----
  const nodes = [];
  const nodeById = new Map();
  const avenueNodes = avenueXs.map(() => []);

  /**
   * 新建一个节点。
   * @param {Object} ix 路口记录
   * @returns {Object} 节点
   */
  const addNode = (ix) => {
    const node = {
      id: ix.id,
      signalIds: [ix.id],
      x: ix.x,
      z: ix.z,
      hasSignal: ix.hasSignal !== false,
      phaseOffset: phaseOffsetForZ(ix.z),
      avenueIndex: ix.avenueIndex,
      // 路口修剪量 = 横穿道路的半宽 + 1m 富余：停止线正好落在对向路面边缘外
      trimNs: ROAD_WIDTH.street * 0.5,
      trimEw: ROAD_WIDTH.avenue * 0.5,
      trimBw: ROAD_WIDTH.avenue * 0.5 + 1,
      inLanes: [],
      outLanes: [],
      nsColor: 'green',
      ewColor: 'red',
      phaseAge: 0,
      lastNs: '',
      lastEw: ''
    };
    nodes.push(node);
    nodeById.set(node.id, node);
    return node;
  };

  const intersections = Array.isArray(plan.intersections) ? plan.intersections : [];
  for (let i = 0; i < intersections.length; i++) {
    const ix = intersections[i];
    if (ix.kind === 'broadway-avenue') continue;
    const node = addNode(ix);
    if (ix.avenueIndex >= 0 && ix.avenueIndex < avenueNodes.length) avenueNodes[ix.avenueIndex].push(node);
  }

  // 百老汇 × 大道：与既有节点重合则合并，否则插入到该大道的节点链上
  const broadwayNodes = [];
  for (let i = 0; i < intersections.length; i++) {
    const ix = intersections[i];
    if (ix.kind !== 'broadway-avenue') continue;
    const ai = ix.avenueIndex;
    const list = ai >= 0 && ai < avenueNodes.length ? avenueNodes[ai] : null;
    let node = null;
    if (list) {
      for (let k = 0; k < list.length; k++) {
        if (Math.abs(list[k].z - ix.z) < 2) {
          node = list[k];
          break;
        }
      }
    }
    if (node) {
      node.signalIds.push(ix.id);
      node.hasSignal = node.hasSignal || ix.hasSignal !== false;
      nodeById.set(ix.id, node);
    } else {
      node = addNode(ix);
      if (list) list.push(node);
    }
    node.trimNs = Math.max(node.trimNs, ROAD_WIDTH.broadway * 0.5 + 1);
    node.trimBw = ROAD_WIDTH.avenue * 0.5 + 1;
    node.onBroadway = true;
    node.bwAvenue = true;
    broadwayNodes.push(node);
  }

  // 百老汇 × 横街：`plan` 未登记这些斜交路口（契约 §4.1 只登记大道交点），
  // 但百老汇沿途要横穿约 60 条街；不设节点会让车流直接对穿。
  // 这里补建信号路口，并把它插进对应街道的节点链，使双方都在此停车让行。
  /** 因贴近大道而未设节点的百老汇×横街交点：`街道序号 → 交点 X 列表`，这些横街路段整段剔除。 */
  const uncontrolledCrossings = new Map();

  if (bw && Math.abs(bwDirZ) > 1e-6) {
    const slope = bwDirX / bwDirZ;
    const streetZs = Array.isArray(plan.streetZs) ? plan.streetZs : [];
    const xMin = avenueXs.length > 0 ? Math.min(...avenueXs) : 0;
    const xMax = avenueXs.length > 0 ? Math.max(...avenueXs) : 0;
    for (let si = 0; si < streetZs.length; si++) {
      const z = streetZs[si];
      const x = bw.ax + (z - bw.az) * slope;
      if (x < xMin + 1 || x > xMax - 1) continue;
      // 距大道太近时跳过：既避免切出过短的街道路段，也保证与大道斜交口有足够间距
      let tooClose = false;
      for (let ai = 0; ai < avenueXs.length; ai++) {
        if (Math.abs(x - avenueXs[ai]) < 46) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) {
        // 交点离大道太近，塞不下一段合法的横街车道；改为把这段横街整体剔除
        // （广场吞掉横街，与大道阴影带同理），避免出现无信号的斜交冲突点
        if (!uncontrolledCrossings.has(si)) uncontrolledCrossings.set(si, []);
        uncontrolledCrossings.get(si).push(x);
        continue;
      }
      // id 以 `-s{街道序号}` 结尾，正好被下面的街道分组正则收进同一条街
      const node = addNode({
        id: `ix-bws-s${si}`,
        x,
        z,
        avenueIndex: -1,
        hasSignal: true
      });
      node.trimEw = ROAD_WIDTH.broadway * 0.5 + 1;
      node.trimBw = ROAD_WIDTH.street * 0.5 + 1;
      node.onBroadway = true;
      broadwayNodes.push(node);
    }
  }

  // ---- 2~4. 车道 ----
  const lanes = [];
  let laneSerial = 0;

  /**
   * 在两个节点之间铺设双向车道。
   * @param {Object} a 节点 A
   * @param {Object} b 节点 B
   * @param {'avenue'|'street'|'broadway'} roadType 道路类型
   * @param {'ns'|'ew'} axis 信号轴
   */
  const linkNodes = (a, b, roadType, axis) => {
    const perDir = LANES_PER_DIR[roadType];
    const laneWidth = ROAD_WIDTH[roadType] * 0.5 / perDir;
    const trimKey = roadType === 'street' ? 'trimEw' : roadType === 'broadway' ? 'trimBw' : 'trimNs';
    const v0 = V0[roadType];

    const byDir = [[], []];
    for (let dir = 0; dir < 2; dir++) {
      const from = dir === 0 ? a : b;
      const to = dir === 0 ? b : a;
      for (let li = 0; li < perDir; li++) {
        // 右侧通行：车道中心在行进方向的右手侧，第 li 条距中心线 (li + 0.5)·laneWidth
        const offset = laneWidth * (li + 0.5);
        // 百老汇与大道的**斜交口**：百老汇车道挂到"东西相位"上，
        // 才不会和同为南北向的大道车流同时放行（两者在浅交角下共用大片路面）；
        // 百老汇与横街的正常交叉口仍按南北相位，与横街的东西相位互斥。
        const laneAxis =
          roadType === 'broadway' && to.bwAvenue && to.signalIds.length === 1 ? 'ew' : axis;
        const lane = makeRoadLane(
          `L${laneSerial++}`,
          from,
          to,
          offset,
          from[trimKey],
          to[trimKey],
          laneAxis,
          roadType,
          li,
          perDir,
          v0
        );
        if (!lane) continue;
        lanes.push(lane);
        from.outLanes.push(lane);
        to.inLanes.push(lane);
        byDir[dir].push(lane);
      }
    }
    // 同序号的正反向车道互相记名，供掉头兜底使用
    const pairs = Math.min(byDir[0].length, byDir[1].length);
    for (let li = 0; li < pairs; li++) {
      byDir[0][li].reverse = byDir[1][li];
      byDir[1][li].reverse = byDir[0][li];
    }
  };

  // 百老汇斜交口在大道上投下的"阴影带"：浅交角下百老汇路面沿大道方向要占据
  // ±(百老汇半宽 / |dirX|) ≈ ±74m，这段大道实际被广场吞掉（时代广场 / 先驱广场 /
  // 联合广场即如此）。这里把落入阴影带的大道路段整段剔除，避免两条路的车道在
  // 同一块路面上互相穿模；被切断的大道车流会在前一个路口转向街道或汇入百老汇。
  const bwShadow = new Map();
  for (let i = 0; i < broadwayNodes.length; i++) {
    const n = broadwayNodes[i];
    if (n.avenueIndex >= 0) bwShadow.set(n.avenueIndex, n.z);
  }
  const BW_SHADOW_HALF = 70;

  // 大道（南北向）
  for (let ai = 0; ai < avenueNodes.length; ai++) {
    const list = avenueNodes[ai];
    list.sort((p, q) => p.z - q.z);
    const shadowZ = bwShadow.has(ai) ? bwShadow.get(ai) : null;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (segmentInsidePark(a.x, a.z, b.z)) continue;
      if (shadowZ !== null && b.z > shadowZ - BW_SHADOW_HALF && a.z < shadowZ + BW_SHADOW_HALF) {
        continue;
      }
      linkNodes(a, b, 'avenue', 'ns');
    }
  }

  // 街道（东西向）：按 streetIndex 分组
  const streetGroups = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const m = /-s(\d+)$/.exec(n.id);
    if (!m) continue;
    const key = m[1];
    if (!streetGroups.has(key)) streetGroups.set(key, []);
    streetGroups.get(key).push(n);
  }
  for (const [key, list] of streetGroups) {
    list.sort((p, q) => p.x - q.x);
    const cuts = uncontrolledCrossings.get(Number(key));
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (cuts) {
        let cut = false;
        for (let c = 0; c < cuts.length; c++) {
          if (cuts[c] > a.x && cuts[c] < b.x) {
            cut = true;
            break;
          }
        }
        if (cut) continue;
      }
      linkNodes(a, b, 'street', 'ew');
    }
  }

  // 百老汇（斜街，按 Z 串联）
  broadwayNodes.sort((p, q) => p.z - q.z);
  for (let i = 0; i < broadwayNodes.length - 1; i++) {
    linkNodes(broadwayNodes[i], broadwayNodes[i + 1], 'broadway', 'ns');
  }

  // ---- 5. 关灯：只有一个相位轴接入的路口（断头路、被阴影带切断的斜交口）无需信号 ----
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    let hasNs = false;
    let hasEw = false;
    for (let k = 0; k < node.inLanes.length; k++) {
      if (node.inLanes[k].axis === 'ns') hasNs = true;
      else hasEw = true;
    }
    if (!hasNs || !hasEw) node.hasSignal = false;
  }

  // ---- 6. 转向候选与对向车道 ----
  for (let i = 0; i < lanes.length; i++) buildTurnOptions(lanes[i]);

  return { nodes, lanes, nodeById };
}

/**
 * 为一条路段车道预计算路口出边候选与对向来车车道。
 *
 * 出边归并规则：同一"目标道路 + 方向"只保留一条代表车道——
 * 直行取车道序号相同者（不变道），右转取最外侧（靠路缘）车道，左转取最内侧车道。
 * 这样既避免变道穿插，又符合美制路口的车道功能划分。
 *
 * @param {Object} lane 路段车道
 */
function buildTurnOptions(lane) {
  const node = lane.toNode;
  /** @type {Map<string, {outLane: Object, type: string, deltaDeg: number}>} */
  const groups = new Map();

  // 车道功能划分：右转只许从最外侧（靠路缘）车道发起，左转与掉头只许从最内侧车道发起。
  // 否则内侧车辆右转会横切外侧直行车道——这正是多车道路口最主要的穿模来源。
  // 若严格划分后无路可走（断头路等），放宽限制重算一次，保证车辆永远有出路。
  const isCurbLane = lane.laneIndex === lane.laneCount - 1;
  const isInnerLane = lane.laneIndex === 0;

  for (let pass = 0; pass < 2 && groups.size === 0; pass++) {
    const strict = pass === 0;
    for (let i = 0; i < node.outLanes.length; i++) {
      const out = node.outLanes[i];
      const delta = angleDeltaDeg(lane.headingDeg, out.headingDeg);
      const type = classifyTurn(delta);
      // 同一路段的反向车道只允许作为掉头兜底
      if (type === 'uturn' && out !== lane.reverse) continue;
      if (strict) {
        if (type === 'right' && !isCurbLane) continue;
        if ((type === 'left' || type === 'uturn') && !isInnerLane) continue;
      }
      const key = `${out.roadType}|${Math.round(out.headingDeg)}`;
      const prev = groups.get(key);
      if (!prev) {
        groups.set(key, { outLane: out, type, deltaDeg: delta });
        continue;
      }
      let better = false;
      if (type === 'straight') {
        better =
          Math.abs(out.laneIndex - lane.laneIndex) <
          Math.abs(prev.outLane.laneIndex - lane.laneIndex);
      } else if (type === 'right') {
        better = out.laneIndex > prev.outLane.laneIndex;
      } else {
        better = out.laneIndex < prev.outLane.laneIndex;
      }
      if (better) groups.set(key, { outLane: out, type, deltaDeg: delta });
    }
  }

  const turns = [];
  for (const g of groups.values()) {
    // 直行候选可能有两个（大道直行 vs 汇入百老汇），按偏角衰减权重，
    // 使正前方那条获得更大份额
    const base = TURN_WEIGHT[g.type];
    const weight = g.type === 'straight' ? base / (1 + Math.abs(g.deltaDeg) / 12) : base;
    turns.push({ outLane: g.outLane, type: g.type, deltaDeg: g.deltaDeg, weight });
  }
  lane.turns = turns;

  // 对向直行来车（左转让行判定）：终点路口处、航向与本车道相反的入边
  const opposing = [];
  for (let i = 0; i < node.inLanes.length; i++) {
    const other = node.inLanes[i];
    if (other === lane) continue;
    if (Math.abs(angleDeltaDeg(lane.headingDeg, other.headingDeg)) >= TURN_ANGLE.uturnMin) {
      opposing.push(other);
    }
  }
  lane.opposing = opposing;
}

/* ========================================================================== *
 * 车道内的车辆队列维护
 * ========================================================================== */

/**
 * 把车辆插入车道（保持 `s` 升序）。新入车道的车辆 `s` 最小，通常直接落在队首。
 * @param {Object} lane 车道
 * @param {Object} car 车辆
 * @param {Set<Object>} activeLanes 有车车道集合
 */
function insertCar(lane, car, activeLanes) {
  const arr = lane.cars;
  let i = 0;
  while (i < arr.length && arr[i].s < car.s) i++;
  arr.splice(i, 0, car);
  activeLanes.add(lane);
}

/**
 * 把车辆从车道移出。离开的车总在队尾（`s` 最大），故先试 `pop`。
 * @param {Object} lane 车道
 * @param {Object} car 车辆
 * @param {Set<Object>} activeLanes 有车车道集合
 */
function removeCar(lane, car, activeLanes) {
  const arr = lane.cars;
  if (arr.length > 0 && arr[arr.length - 1] === car) {
    arr.pop();
  } else {
    const idx = arr.indexOf(car);
    if (idx >= 0) arr.splice(idx, 1);
  }
  if (arr.length === 0) activeLanes.delete(lane);
}

/* ========================================================================== *
 * 车型几何（全部代码生成，禁止外部资产）
 * ========================================================================== */

/** 车窗玻璃的顶点色（近黑，`instanceColor` 车漆乘上去后仍为深色）。 */
const GLASS_RGB = [0.045, 0.052, 0.062];
/** 轮胎顶点色。 */
const TIRE_RGB = [0.035, 0.035, 0.038];
/** 车身顶点色（纯白，实际颜色由 `instanceColor` 决定）。 */
const BODY_RGB = [1, 1, 1];
/** 保险杠 / 灯罩等中性件顶点色。 */
const TRIM_RGB = [0.32, 0.33, 0.35];
/** 出租车顶灯箱顶点色（偏暖白）。 */
const ROOFLIGHT_RGB = [1, 0.86, 0.42];

/**
 * 给几何体加上统一的顶点色属性。
 * @param {THREE.BufferGeometry} geo 几何体
 * @param {number[]} rgb 线性空间 RGB（0..1）
 * @returns {THREE.BufferGeometry} 同一几何体
 */
function paintGeometry(geo, rgb) {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = rgb[0];
    arr[i * 3 + 1] = rgb[1];
    arr[i * 3 + 2] = rgb[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * 生成一个着色长方体部件（局部坐标：X = 车宽，Y = 高，Z = 车长，+Z 为车头）。
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} d 长
 * @param {number} x 中心 X
 * @param {number} y 中心 Y
 * @param {number} z 中心 Z
 * @param {number[]} rgb 顶点色
 * @returns {THREE.BufferGeometry} 部件几何
 */
function boxPart(w, h, d, x, y, z, rgb) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paintGeometry(g, rgb);
}

/**
 * 生成一只车轮（圆柱绕 Z 旋转 90°，轴向沿 X）。
 * @param {number} radius 半径
 * @param {number} width 胎宽
 * @param {number} x 中心 X
 * @param {number} y 中心 Y
 * @param {number} z 中心 Z
 * @returns {THREE.BufferGeometry} 车轮几何
 */
function wheelPart(radius, width, x, y, z) {
  const g = new THREE.CylinderGeometry(radius, radius, width, 8);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return paintGeometry(g, TIRE_RGB);
}

/**
 * 五类车型的尺寸、外形与配色（契约 §6.1 要求 ≥ 5 类）。
 * 车体原点在**路面上、车长中点**，+Z 指向车头。
 *
 * @returns {Array<Object>} 车型定义数组
 */
function createVehicleTypes() {
  /**
   * 轿车 / 出租车 / SUV 共用的三厢车体构造。
   * @param {number} len 车长
   * @param {number} width 车宽
   * @param {number} bodyH 主车身高度
   * @param {number} cabinH 座舱高度
   * @param {number} wheelR 轮半径
   * @param {boolean} roofLight 是否带顶灯（出租车）
   * @returns {THREE.BufferGeometry[]} 部件列表
   */
  const carParts = (len, width, bodyH, cabinH, wheelR, roofLight) => {
    const base = wheelR * 0.62;
    const parts = [
      boxPart(width, bodyH, len, 0, base + bodyH * 0.5, 0, BODY_RGB),
      boxPart(width * 0.94, cabinH, len * 0.44, 0, base + bodyH + cabinH * 0.5, -len * 0.06, GLASS_RGB),
      boxPart(width * 0.8, cabinH * 0.34, len * 0.3, 0, base + bodyH + cabinH * 0.86, -len * 0.1, BODY_RGB),
      boxPart(width * 0.98, bodyH * 0.34, len * 0.06, 0, base + bodyH * 0.42, len * 0.5, TRIM_RGB),
      boxPart(width * 0.98, bodyH * 0.34, len * 0.06, 0, base + bodyH * 0.42, -len * 0.5, TRIM_RGB),
      wheelPart(wheelR, width * 0.16, width * 0.44, wheelR, len * 0.31),
      wheelPart(wheelR, width * 0.16, -width * 0.44, wheelR, len * 0.31),
      wheelPart(wheelR, width * 0.16, width * 0.44, wheelR, -len * 0.31),
      wheelPart(wheelR, width * 0.16, -width * 0.44, wheelR, -len * 0.31)
    ];
    if (roofLight) {
      parts.push(
        boxPart(width * 0.34, 0.2, 0.46, 0, base + bodyH + cabinH + 0.12, -len * 0.02, ROOFLIGHT_RGB)
      );
    }
    return parts;
  };

  /**
   * 箱式车体（公交 / 货车）。
   * @param {number} len 车长
   * @param {number} width 车宽
   * @param {number} boxH 车厢高
   * @param {number} wheelR 轮半径
   * @param {boolean} isBus 是否公交（公交为通长车窗带，货车为独立驾驶室）
   * @returns {THREE.BufferGeometry[]} 部件列表
   */
  const boxyParts = (len, width, boxH, wheelR, isBus) => {
    const base = wheelR * 0.55;
    const parts = [];
    if (isBus) {
      parts.push(boxPart(width, boxH, len, 0, base + boxH * 0.5, 0, BODY_RGB));
      parts.push(boxPart(width * 1.005, boxH * 0.3, len * 0.9, 0, base + boxH * 0.72, 0, GLASS_RGB));
      parts.push(boxPart(width * 0.9, boxH * 0.34, 0.14, 0, base + boxH * 0.7, len * 0.5, GLASS_RGB));
      parts.push(boxPart(width * 0.98, 0.16, len * 0.98, 0, base + 0.02, 0, TRIM_RGB));
      const axles = [len * 0.36, len * 0.02, -len * 0.34];
      for (let i = 0; i < axles.length; i++) {
        parts.push(wheelPart(wheelR, width * 0.14, width * 0.46, wheelR, axles[i]));
        parts.push(wheelPart(wheelR, width * 0.14, -width * 0.46, wheelR, axles[i]));
      }
    } else {
      const cabD = len * 0.3;
      parts.push(boxPart(width * 0.96, boxH * 0.72, cabD, 0, base + boxH * 0.36, len * 0.5 - cabD * 0.5, BODY_RGB));
      parts.push(
        boxPart(width * 0.9, boxH * 0.26, 0.16, 0, base + boxH * 0.56, len * 0.5 - 0.1, GLASS_RGB)
      );
      parts.push(boxPart(width, boxH, len - cabD, 0, base + boxH * 0.5, -cabD * 0.5, BODY_RGB));
      parts.push(boxPart(width * 0.99, 0.16, len * 0.98, 0, base + 0.02, 0, TRIM_RGB));
      parts.push(wheelPart(wheelR, width * 0.14, width * 0.46, wheelR, len * 0.33));
      parts.push(wheelPart(wheelR, width * 0.14, -width * 0.46, wheelR, len * 0.33));
      parts.push(wheelPart(wheelR, width * 0.14, width * 0.46, wheelR, -len * 0.3));
      parts.push(wheelPart(wheelR, width * 0.14, -width * 0.46, wheelR, -len * 0.3));
    }
    return parts;
  };

  return [
    {
      name: 'sedan',
      share: 0.34,
      length: 4.6,
      width: 1.85,
      height: 1.45,
      parts: () => carParts(4.6, 1.85, 0.72, 0.5, 0.33, false),
      palette: [0xb9bec6, 0x2d3644, 0x8d2b2b, 0xeeeef0, 0x1c2026, 0x3a5a76, 0x6f7b52]
    },
    {
      name: 'taxi',
      share: 0.24,
      length: 4.9,
      width: 1.9,
      height: 1.72,
      parts: () => carParts(4.9, 1.9, 0.76, 0.56, 0.34, true),
      palette: [0xf5b900, 0xf7c216, 0xefae00]
    },
    {
      name: 'suv',
      share: 0.18,
      length: 5.05,
      width: 2.02,
      height: 1.82,
      parts: () => carParts(5.05, 2.02, 0.98, 0.6, 0.38, false),
      palette: [0x333d47, 0x6d7278, 0x232e38, 0xd6d6d0, 0x4a3a2e]
    },
    {
      name: 'bus',
      share: 0.07,
      length: 12,
      width: 2.55,
      height: 3.2,
      parts: () => boxyParts(12, 2.55, 3.2, 0.5, true),
      palette: [0x2f6fb0, 0xd9dde1, 0x36587a]
    },
    {
      name: 'truck',
      share: 0.17,
      length: 7.6,
      width: 2.35,
      height: 3,
      parts: () => boxyParts(7.6, 2.35, 3, 0.48, false),
      palette: [0xe6e6e2, 0x99a2ac, 0x3b4956, 0xa8562f]
    }
  ];
}

/* ========================================================================== *
 * 复用临时量（`update()` 内零分配）
 * ========================================================================== */

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
/** 把朝 +Z 的面片放平（法线朝上），供地面光晕使用。 */
const FLAT_QUAT = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 2);
const ONE_SCALE = new THREE.Vector3(1, 1, 1);

const _pos = new THREE.Vector3();
const _off = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);
const _quat = new THREE.Quaternion();
const _quatFlat = new THREE.Quaternion();
const _mat = new THREE.Matrix4();
const _color = new THREE.Color();
const _pt = { x: 0, z: 0 };

/** 车体原点距路面的高度（米），略微抬起避免与路面贴花 z-fighting。 */
const CAR_BASE_Y = 0.02;

/* ========================================================================== *
 * 仿真步进
 * ========================================================================== */

/**
 * 判断车辆是否必须在本路段末端的停止线前停车。
 * 红灯必停；黄灯按"两难区（dilemma zone）"处理——若剩余距离已不足以舒适刹停则继续通过；
 * 绿灯或无灯时只在**左转让行**条件下停车。
 *
 * @param {Object} car 车辆
 * @param {Object} lane 所在路段车道
 * @returns {boolean} 是否必须停车
 */
function mustStopAtNode(car, lane) {
  const node = lane.toNode;
  if (!node) return false;
  const dist = lane.length - car.s;

  if (node.hasSignal) {
    const color = lane.axis === 'ew' ? node.ewColor : node.nsColor;
    if (color === 'red') return true;
    if (color === 'green') {
      // 绿灯启动损失 / 清空间隔：刚变绿的 1.3s 内先不进路口
      if (node.phaseAge < GREEN_START_DELAY && dist < 12) return true;
    }
    if (color === 'yellow') {
      // 两难区判据：只有"1.2 秒内必然越过停止线"的车才继续通过，其余一律停。
      // 取这么紧的阈值是为了保证**清空**：黄灯 4s + 绿灯启动损失 1.3s ≈ 5.3s，
      // 足够抢入的车（1.2s 越线 + 约 3.5s 穿过路口）驶离冲突区。
      // 该阈值下所需减速度 v²/(2·1.2v) = v/2.4 ≤ 5.6 m/s²，在 9 m/s² 制动上限内，物理上停得住。
      return dist > car.v * 1.2 + 1.5;
    }
  }

  const next = car.nextLane;
  if (next && next.kind === 'link' && next.turnType === 'left' && dist < 26) {
    if (car.waitTimer < YIELD_TIMEOUT && oncomingBlocked(lane)) return true;
  }
  return false;
}

/**
 * 左转冲突检测：对向车道上是否有临近且仍在行进的直行/右转车。
 * 对向同为左转的车辆不构成冲突（两车左转轨迹互不相交）。
 * @param {Object} lane 本车所在路段车道
 * @returns {boolean} 是否需要让行
 */
function oncomingBlocked(lane) {
  const list = lane.opposing;
  for (let i = 0; i < list.length; i++) {
    const other = list[i];
    const arr = other.cars;
    if (arr.length === 0) continue;
    const head = arr[arr.length - 1];
    if (head.v <= 1.2) continue;
    const nxt = head.nextLane;
    if (nxt && nxt.kind === 'link' && nxt.turnType === 'left') continue;
    if (other.length - head.s < YIELD_DISTANCE) return true;
  }
  return false;
}

/**
 * 取（或惰性创建并缓存）两条车道之间的路口连接段。
 * @param {Object} state 仿真状态
 * @param {Object} inLane 入边
 * @param {Object} outLane 出边
 * @param {string} turnType 转向类型
 * @returns {Object} 连接段车道
 */
function getLink(state, inLane, outLane, turnType) {
  const key = `${inLane.id}>${outLane.id}`;
  let link = state.linkCache.get(key);
  if (!link) {
    link = makeLinkLane(inLane, outLane, turnType);
    state.linkCache.set(key, link);
    outLane.feeders.push(link);
  }
  return link;
}

/**
 * 在路口按概率选择出边（直行 0.72 / 右转 0.18 / 左转 0.10，掉头兜底），返回对应连接段。
 * @param {Object} state 仿真状态
 * @param {Object} lane 当前路段车道
 * @returns {Object|null} 连接段车道
 */
function chooseNextLink(state, lane) {
  const turns = lane.turns;
  if (!turns || turns.length === 0) return null;
  const pick = turns.length === 1 ? turns[0] : state.rng.weighted(turns, weightOfTurn);
  if (!pick) return null;
  return getLink(state, lane, pick.outLane, pick.type);
}

/**
 * 转向候选的权重取值函数（提取为具名纯函数，避免每帧创建闭包）。
 * @param {{weight: number}} t 候选
 * @returns {number} 权重
 */
function weightOfTurn(t) {
  return t.weight;
}

/**
 * 目标车道入口是否被占用（防止插入时与已有车辆重叠）。
 * @param {Object} lane 目标车道
 * @param {Object} car 待进入车辆
 * @returns {boolean} 是否被占
 */
function entryBlocked(lane, car) {
  const arr = lane.cars;
  if (arr.length === 0) return false;
  const first = arr[0];
  return first.s < (first.length + car.length) * 0.5 + 0.6;
}

/** {@link mergeConflictGap} 的复用返回体（避免每帧分配）。 */
const _merge = { gap: 0, dv: 0 };

/**
 * 合流冲突检测：同一条出口车道可能被多条连接段同时喂入
 * （典型冲突对：南行右转与北行左转都汇入同一条西行车道，且两者在同一绿灯相位内）。
 * 把"更接近合流点"的那辆车当作虚拟前车，本车即按 IDM 自然减速让出。
 *
 * 距离一律换算到"距合流点（出口车道起点）的剩余里程"，因此连接段上的车与
 * 尚未进入连接段的车可以直接比较。
 *
 * @param {Object} car 本车
 * @param {Object} lane 本车所在车道
 * @param {number} currentGap 已算出的前车间距
 * @returns {{gap: number, dv: number}|null} 更紧的间距；无冲突返回 null
 */
function mergeConflictGap(car, lane, currentGap) {
  const link =
    lane.kind === 'link'
      ? lane
      : car.nextLane && car.nextLane.kind === 'link'
        ? car.nextLane
        : null;
  if (!link) return null;
  const feeders = link.outLane.feeders;
  if (feeders.length < 2) return null;

  const myRemain = lane.kind === 'link' ? lane.length - car.s : lane.length - car.s + link.length;
  let best = currentGap;
  let bestDv = 0;
  let hit = false;

  for (let f = 0; f < feeders.length; f++) {
    const other = feeders[f];
    if (other === link) continue;
    let head = null;
    let remain = 0;
    if (other.cars.length > 0) {
      head = other.cars[other.cars.length - 1];
      remain = other.length - head.s;
    } else {
      // 连接段为空时回看上游路段：只有确实选了这条连接段、且当前允许通行的车才算
      const src = other.inLane;
      const arr = src.cars;
      if (arr.length === 0) continue;
      const cand = arr[arr.length - 1];
      if (cand.nextLane !== other || mustStopAtNode(cand, src)) continue;
      head = cand;
      remain = src.length - cand.s + other.length;
    }
    if (remain >= myRemain) continue;
    const g = myRemain - remain - (head.length + car.length) * 0.5;
    if (g < best) {
      best = g;
      bestDv = car.v - head.v;
      hit = true;
    }
  }

  if (!hit) return null;
  _merge.gap = best;
  _merge.dv = bestDv;
  return _merge;
}

/**
 * 第一阶段：为所有车辆计算 IDM 加速度（只读世界状态，与遍历顺序无关）。
 * @param {Object} state 仿真状态
 */
function computeAccelerations(state) {
  const aMax = IDM_DEFAULTS.aMax;
  const b = IDM_DEFAULTS.b;
  const s0 = IDM_DEFAULTS.s0;
  const delta = IDM_DEFAULTS.delta;
  const T = state.followTime;
  const speedScale = state.speedScale;

  for (const lane of state.activeLanes) {
    const arr = lane.cars;
    for (let i = arr.length - 1; i >= 0; i--) {
      const car = arr[i];
      let gap = Number.POSITIVE_INFINITY;
      let dv = 0;

      if (i + 1 < arr.length) {
        const leader = arr[i + 1];
        gap = leader.s - car.s - (leader.length + car.length) * 0.5;
        dv = car.v - leader.v;
      } else {
        // 跨路口"看穿"：本车道 → 连接段 → 下一路段，最多两跳，
        // 使车辆在进入路口前就能看到出口车道的排队，避免堵在路口中央
        let ahead = lane.length - car.s;
        let probe = car.nextLane;
        for (let hop = 0; hop < 2 && probe; hop++) {
          if (probe.cars.length > 0) {
            const leader = probe.cars[0];
            gap = ahead + leader.s - (leader.length + car.length) * 0.5;
            dv = car.v - leader.v;
            break;
          }
          ahead += probe.length;
          probe = probe.kind === 'link' ? probe.outLane : null;
        }
      }

      const merge = mergeConflictGap(car, lane, gap);
      if (merge !== null) {
        gap = merge.gap;
        dv = merge.dv;
      }

      if (lane.kind === 'road' && mustStopAtNode(car, lane)) {
        // 红灯/让行 = "停止线处速度为 0 的虚拟前车"
        const stopGap = lane.length - car.s - car.length * 0.5 - STOP_LINE_CLEARANCE;
        if (stopGap < gap) {
          gap = stopGap;
          dv = car.v;
        }
      }

      car.acc = idmAcceleration({
        v: car.v,
        v0: lane.v0 * car.speedFactor * speedScale,
        gap,
        dv,
        aMax,
        b,
        s0,
        T,
        delta
      });
    }
  }
}

/**
 * 第二阶段：积分速度与位置，并处理车道 → 连接段 → 车道的移交。
 * @param {Object} state 仿真状态
 * @param {number} dt 步长（秒）
 */
function integrateCars(state, dt) {
  const cars = state.cars;
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    car.v = Math.max(0, car.v + car.acc * dt);
    if (car.v > 0.5) car.waitTimer = 0;
    else car.waitTimer += dt;
    car.s += car.v * dt;

    let guard = 0;
    while (car.s >= car.lane.length && guard++ < 3) {
      const lane = car.lane;
      const next = car.nextLane;
      const blocked =
        !next ||
        (lane.kind === 'road' && mustStopAtNode(car, lane)) ||
        entryBlocked(next, car);
      if (blocked) {
        car.s = Math.max(0, lane.length - 0.05);
        car.v = 0;
        break;
      }
      const rest = car.s - lane.length;
      removeCar(lane, car, state.activeLanes);
      car.lane = next;
      car.s = rest;
      insertCar(next, car, state.activeLanes);
      car.nextLane = next.kind === 'link' ? next.outLane : chooseNextLink(state, next);
    }
  }
}

/**
 * 推进所有信号机，并按"仅在灯色变化时"回调街道家具的灯箱。
 * @param {Object} state 仿真状态
 */
function updateSignals(state) {
  const nodes = state.nodes;
  const emit = state.setSignalColor;
  const filter = state.slotIds;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const st = signalStateAt(node.phaseOffset, state.time);
    node.nsColor = st.ns;
    node.ewColor = st.ew;
    node.phaseAge = st.cycleTime - PHASE_START[st.phase];
    if (!emit) continue;
    const nsChanged = st.ns !== node.lastNs;
    const ewChanged = st.ew !== node.lastEw;
    if (!nsChanged && !ewChanged) continue;
    node.lastNs = st.ns;
    node.lastEw = st.ew;
    for (let k = 0; k < node.signalIds.length; k++) {
      const id = node.signalIds[k];
      if (filter && !filter.has(id)) continue;
      if (nsChanged) emit(id, 'ns', st.ns);
      if (ewChanged) emit(id, 'ew', st.ew);
    }
  }
}

/* ========================================================================== *
 * 工厂：createTraffic
 * ========================================================================== */

/**
 * 创建交通仿真系统（契约 §6.1）。
 *
 * @param {Object} ctx0 构建期上下文 `{ plan, heightField, rng, textures, env, quality, seed,
 *   signalSlots?, setSignalColor? }`
 * @returns {Object} SystemHandle：`{ object3D, update, dispose, stats, signalColorFor }`
 */
export function createTraffic(ctx0) {
  const opts = ctx0 || {};
  const plan = opts.plan || { avenueXs: [], streetZs: [], intersections: [] };
  const rng = opts.rng && typeof opts.rng.fork === 'function'
    ? opts.rng.fork('traffic')
    : makeRng(opts.seed === undefined ? 'manhattan' : opts.seed, 'traffic');

  const root = new THREE.Group();
  root.name = 'traffic';

  const graph = buildLaneGraph(plan);
  const roadLanes = [];
  for (let i = 0; i < graph.lanes.length; i++) {
    if (graph.lanes[i].length > 16) roadLanes.push(graph.lanes[i]);
  }

  const targetCars = CAR_COUNT[opts.quality] || CAR_COUNT.high;
  const types = createVehicleTypes();

  /** 各车型的数量分配：按份额取整，余数补给轿车。 */
  const counts = new Array(types.length).fill(0);
  let assigned = 0;
  for (let i = 1; i < types.length; i++) {
    counts[i] = Math.max(1, Math.round(targetCars * types[i].share));
    assigned += counts[i];
  }
  counts[0] = Math.max(1, targetCars - assigned);

  /* ---------------- 车体 InstancedMesh（每类一个 drawcall） ---------------- */

  const geometries = [];
  const materials = [];
  const meshes = [];

  for (let ti = 0; ti < types.length; ti++) {
    const type = types[ti];
    const parts = type.parts();
    const merged = mergeGeometries(parts, false);
    for (let p = 0; p < parts.length; p++) parts[p].dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.28
    });
    // 车体也接入全局天气注入：雪天车顶挂雪、雨天更亮、闪电补光
    patchCityMaterial(material, opts.env, {
      snow: true,
      snowAmount: 0.35,
      wetness: true,
      wetDarken: 0.18,
      puddles: false,
      flash: true
    });

    const mesh = new THREE.InstancedMesh(merged, material, counts[ti]);
    mesh.name = `traffic-${type.name}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(counts[ti] * 3), 3);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    root.add(mesh);

    geometries.push(merged);
    materials.push(material);
    meshes.push(mesh);
    type.mesh = mesh;
    type.count = counts[ti];
  }

  /* ---------------- 车灯 / 光晕：单个加性混合 InstancedMesh ---------------- */

  const totalCars = counts.reduce((a, b) => a + b, 0);
  const glowGeometry = new THREE.PlaneGeometry(1, 1);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false
  });
  const glowMesh = new THREE.InstancedMesh(glowGeometry, glowMaterial, totalCars * GLOW_SLOTS);
  glowMesh.name = 'traffic-lights';
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(totalCars * GLOW_SLOTS * 3),
    3
  );
  glowMesh.frustumCulled = false;
  glowMesh.castShadow = false;
  glowMesh.receiveShadow = false;
  glowMesh.renderOrder = 4;
  glowMesh.visible = false;
  root.add(glowMesh);

  /* ---------------- 投放车辆 ---------------- */

  /** @type {Object[]} */
  const cars = [];
  const activeLanes = new Set();

  /**
   * 在车道上找一个不与既有车辆冲突的投放位置。
   * @param {Object} lane 车道
   * @param {number} carLen 车长
   * @returns {number} 位置（米）；找不到返回 −1
   */
  const findSpawnS = (lane, carLen) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const s = rng.range(carLen * 0.6 + 1, lane.length - carLen * 0.6 - 1);
      let ok = true;
      for (let i = 0; i < lane.cars.length; i++) {
        const other = lane.cars[i];
        if (Math.abs(other.s - s) < (other.length + carLen) * 0.5 + SPAWN_MIN_GAP) {
          ok = false;
          break;
        }
      }
      if (ok) return s;
    }
    return -1;
  };

  if (roadLanes.length > 0) {
    for (let ti = 0; ti < types.length; ti++) {
      const type = types[ti];
      if (!type.mesh) continue;
      for (let k = 0; k < type.count; k++) {
        // 公交与货车不上百老汇的最内侧车道，其余按长度加权撒点
        let lane = null;
        let s = -1;
        for (let attempt = 0; attempt < 8 && s < 0; attempt++) {
          lane = rng.weighted(roadLanes, laneSpawnWeight);
          if (!lane) break;
          if (type.length > 7 && lane.roadType === 'street' && attempt < 4) continue;
          s = findSpawnS(lane, type.length);
        }
        if (!lane || s < 0) {
          lane = roadLanes[rng.int(0, roadLanes.length - 1)];
          s = Math.min(lane.length * 0.5, Math.max(2, lane.length - type.length));
        }

        const car = {
          typeIndex: ti,
          slot: k,
          lane,
          s,
          v: rng.range(0.35, 0.85) * lane.v0,
          acc: 0,
          headingDeg: lane.headingDeg,
          length: type.length,
          width: type.width,
          height: type.height,
          isTaxi: type.name === 'taxi',
          speedFactor: rng.range(0.9, 1.08),
          waitTimer: 0,
          nextLane: null
        };
        insertCar(lane, car, activeLanes);
        cars.push(car);

        _color.setHex(rng.pick(type.palette));
        type.mesh.setColorAt(k, _color);
      }
      if (type.mesh.instanceColor) type.mesh.instanceColor.needsUpdate = true;
    }
  }

  /* ---------------- 仿真状态 ---------------- */

  const slotIds = new Set();
  if (Array.isArray(opts.signalSlots)) {
    for (let i = 0; i < opts.signalSlots.length; i++) {
      const slot = opts.signalSlots[i];
      if (slot && slot.intersectionId != null) slotIds.add(slot.intersectionId);
    }
  }

  const state = {
    rng,
    nodes: graph.nodes,
    nodeById: graph.nodeById,
    cars,
    activeLanes,
    linkCache: new Map(),
    time: 0,
    followTime: IDM_DEFAULTS.T,
    speedScale: 1,
    setSignalColor: typeof opts.setSignalColor === 'function' ? opts.setSignalColor : null,
    slotIds: slotIds.size > 0 ? slotIds : null
  };

  for (let i = 0; i < cars.length; i++) {
    cars[i].nextLane = chooseNextLink(state, cars[i].lane);
  }
  updateSignals(state);

  /* ---------------- 每帧更新 ---------------- */

  /**
   * 写入所有实例矩阵与车灯颜色。
   * @param {Object} ctx FrameContext
   * @param {number} dt 本帧秒数（用于车头朝向阻尼）
   */
  const updateInstances = (ctx, dt) => {
    const night = typeof ctx.nightFactor === 'number' ? ctx.nightFactor : 0;
    const lightsOn = night > NIGHT_LIGHT_THRESHOLD;
    const lightK = lightsOn ? clamp((night - NIGHT_LIGHT_THRESHOLD) / 0.35, 0.25, 1) : 0;

    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const lane = car.lane;
      lanePoint(lane, car.s, _pt);
      car.headingDeg = dampAngleDeg(car.headingDeg, laneHeadingDeg(lane, car.s), 9, dt);

      _pos.set(_pt.x, CAR_BASE_Y, _pt.z);
      _quat.setFromAxisAngle(UP_AXIS, car.headingDeg * DEG2RAD);
      _mat.compose(_pos, _quat, ONE_SCALE);
      const mesh = types[car.typeIndex].mesh;
      if (mesh) mesh.setMatrixAt(car.slot, _mat);

      if (!lightsOn) continue;

      const base = i * GLOW_SLOTS;
      const hw = car.width * 0.34;
      const front = car.length * 0.5;
      const lampY = Math.min(car.height * 0.55, 1.05);
      const braking = car.acc < BRAKE_ACC || (car.v < 0.3 && car.acc <= 0);
      const tailBright = braking ? 1.45 : 0.55;

      // 前灯 ×2
      _scale.set(0.66, 0.34, 1);
      for (let k = 0; k < 2; k++) {
        _off.set(k === 0 ? -hw : hw, lampY, front + 0.04).applyQuaternion(_quat).add(_pos);
        _mat.compose(_off, _quat, _scale);
        glowMesh.setMatrixAt(base + k, _mat);
        _color.setRGB(1, 0.94, 0.8).multiplyScalar(lightK);
        glowMesh.setColorAt(base + k, _color);
      }

      // 前方地面光晕（放平的面片）
      _quatFlat.copy(_quat).multiply(FLAT_QUAT);
      _scale.set(car.width * 2.4, 9.5, 1);
      _off.set(0, 0.05, front + 4.4).applyQuaternion(_quat).add(_pos);
      _off.y = 0.05;
      _mat.compose(_off, _quatFlat, _scale);
      glowMesh.setMatrixAt(base + 2, _mat);
      _color.setRGB(0.55, 0.5, 0.36).multiplyScalar(lightK);
      glowMesh.setColorAt(base + 2, _color);

      // 尾灯 ×2
      _scale.set(0.5, 0.26, 1);
      for (let k = 0; k < 2; k++) {
        _off.set(k === 0 ? -hw * 1.06 : hw * 1.06, lampY, -front - 0.04)
          .applyQuaternion(_quat)
          .add(_pos);
        _mat.compose(_off, _quat, _scale);
        glowMesh.setMatrixAt(base + 3 + k, _mat);
        _color.setRGB(1, 0.12, 0.05).multiplyScalar(lightK * tailBright);
        glowMesh.setColorAt(base + 3 + k, _color);
      }

      // 出租车顶灯（非出租车缩到 0）
      if (car.isTaxi) {
        _scale.set(0.78, 0.32, 1);
        _off.set(0, car.height + 0.12, 0).applyQuaternion(_quat).add(_pos);
        _mat.compose(_off, _quat, _scale);
        _color.setRGB(1, 0.72, 0.16).multiplyScalar(0.35 + lightK * 0.65);
      } else {
        _scale.set(0, 0, 0);
        _mat.compose(_pos, _quat, _scale);
        _color.setRGB(0, 0, 0);
      }
      glowMesh.setMatrixAt(base + 5, _mat);
      glowMesh.setColorAt(base + 5, _color);
    }

    for (let i = 0; i < meshes.length; i++) meshes[i].instanceMatrix.needsUpdate = true;
    glowMesh.visible = lightsOn;
    if (lightsOn) {
      glowMesh.instanceMatrix.needsUpdate = true;
      if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
    }
  };

  const handle = {
    object3D: root,

    /**
     * 每帧推进：信号相位 → IDM 加速度 → 积分与路口移交 → 实例矩阵与车灯。
     * @param {Object} ctx FrameContext（契约 §2）
     */
    update(ctx) {
      const dt = clamp(ctx && typeof ctx.dt === 'number' ? ctx.dt : 0, 0, 0.1);

      // 雨雪：期望车速 ×0.75、跟车时距增大到 1.9s（按降水强度连续过渡）
      const wp = ctx && ctx.weather ? ctx.weather.params : null;
      const wet = wp
        ? clamp(Math.max(wp.rainIntensity || 0, (wp.snowIntensity || 0) * 1.15), 0, 1)
        : 0;
      state.speedScale = 1 + (V0_WET_SCALE - 1) * wet;
      state.followTime = IDM_DEFAULTS.T + (T_WET - IDM_DEFAULTS.T) * wet;

      if (dt > 0) {
        state.time += dt;
        updateSignals(state);
        const steps = dt > MAX_SUB_DT ? 2 : 1;
        const sub = dt / steps;
        for (let i = 0; i < steps; i++) {
          computeAccelerations(state);
          integrateCars(state, sub);
        }
      }
      updateInstances(ctx || {}, dt > 0 ? dt : 1 / 60);
    },

    /**
     * 供街道家具灯箱取色。
     * @param {string} intersectionId 路口 id
     * @param {'ns'|'ew'} axis 相位轴
     * @returns {'green'|'yellow'|'red'} 灯色
     */
    signalColorFor(intersectionId, axis) {
      const node = graph.nodeById.get(intersectionId);
      if (!node) return 'red';
      return axis === 'ew' ? node.ewColor : node.nsColor;
    },

    /** 释放本模块自建的全部 GPU 资源与仿真状态。 */
    dispose() {
      for (let i = 0; i < meshes.length; i++) {
        meshes[i].dispose();
        root.remove(meshes[i]);
      }
      glowMesh.dispose();
      root.remove(glowMesh);
      for (let i = 0; i < geometries.length; i++) geometries[i].dispose();
      for (let i = 0; i < materials.length; i++) materials[i].dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      geometries.length = 0;
      materials.length = 0;
      meshes.length = 0;
      cars.length = 0;
      roadLanes.length = 0;
      activeLanes.clear();
      state.linkCache.clear();
      graph.lanes.length = 0;
      graph.nodes.length = 0;
      graph.nodeById.clear();
      root.clear();
    },

    stats: { cars: cars.length, instances: cars.length + totalCars * GLOW_SLOTS }
  };

  return handle;
}

/**
 * 车道投放权重：与长度成正比，大道/百老汇略高（主干道车流更密）。
 * @param {Object} lane 车道
 * @returns {number} 权重
 */
function laneSpawnWeight(lane) {
  return lane.length * (lane.roadType === 'street' ? 0.75 : 1.25);
}
