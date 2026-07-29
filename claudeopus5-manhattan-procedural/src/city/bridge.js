/**
 * @file src/city/bridge.js
 * @module city/bridge
 * @description
 * 东河悬索桥（布鲁克林桥原型）—— 契约 §5.4 `createBridge(ctx0) -> SystemHandle`。
 *
 * ===========================================================================
 * 一、主缆的真实悬链线（本模块的计算核心）
 * ===========================================================================
 * 均质柔索在自重下的平衡曲线是**悬链线**（Bernoulli / Huygens / Leibniz, 1691）：
 *
 *     y(x) = a · cosh(x / a) − a          （已平移到最低点 y(0) = 0）
 *
 * 其中 a = H / w（H 为水平张力，w 为单位长度自重），是曲线的唯一形状参数。
 * 已知半跨 L 与垂度 f 反求 a，需解超越方程
 *
 *     F(a) = a · ( cosh(L / a) − 1 ) − f = 0
 *     F'(a) = cosh(u) − 1 − u · sinh(u) ,  u = L / a      （在 a > 0 上恒为负）
 *
 * **牛顿迭代式**： a_{k+1} = a_k − F(a_k) / F'(a_k)
 * **初值**（把 cosh 展开到二阶得抛物线近似 f ≈ L²/(2a)）： a_0 = L² / (2f)
 *
 * 本桥参数：半跨 L = 260 m（主跨 520 m），垂度 f = 58 m。由 `core/mathx.js` 的
 * `solveCatenaryA(260, 58)`（牛顿 + 二分兜底）实际求得：
 *
 *     ▶ a = 592.180493 m        （抛物线初值 a₀ = 260² / 116 = 582.758621 m）
 *     ▶ 回代校验 a·(cosh(260/a) − 1) = 58.000000000 m，残差 < 1e-9
 *     ▶ 主缆弧长 catenaryLength(260, a) = 2a·sinh(260/a) = 536.8685 m / 根
 *       （两根主缆合计 1073.737 m；弦长 520 m，垂度使其增长 3.24%）
 *     ▶ 缆最低点 y = 44.90 m，塔顶索鞍 y = 102.90 m，桥面 y = 40 m
 *       ⇒ 跨中最短吊索 4.90 m；最靠塔的一根（让开塔身后位于 dx = ±240 m）54.20 m
 *
 * **边缆（塔外至锚碇）** 同样是真实悬链线：同一根缆索水平张力 H 不变 ⇒ 参数 a 相同，
 * 只是两端不等高。设端点 (x₁,y₁)（塔顶）、(x₂,y₂)（锚碇），d = x₁−x₂，h = y₁−y₂，
 * m = (x₁+x₂)/2，由 a·cosh((x₁−x₀)/a) − a·cosh((x₂−x₀)/a) = h 并用和差化积
 * cosh A − cosh B = 2·sinh((A+B)/2)·sinh((A−B)/2) 得顶点位置的**解析解**：
 *
 *     x₀ = m − a · asinh( h / ( 2a · sinh( d / (2a) ) ) )
 *     y(x) = a · cosh((x − x₀)/a) + c ,  c 由 y(x₁) = y₁ 定出
 *
 * 本桥边缆：塔顶 (900, 102.90) → 锚碇扶壁 (684, 47.00)，解得 x₀ = 641.226 m
 * （顶点落在锚碇之外 ⇒ 边缆全程单调下降），
 * 弧长 a·[sinh((x₁−x₀)/a) − sinh((x₂−x₀)/a)] = 224.277 m，相对弦线最大下垂 10.20 m。
 *
 * **竖直吊索**：沿主缆每 12 m 一根，长度**逐根由 `catenaryY(dx, a)` 求值**：
 *     len(dx) = [ CABLE_LOW_Y + catenaryY(dx, a) ] − DECK_Y
 * 绝无手写数组或线性近似（见 `buildHangerMatrices`）。
 *
 * ===========================================================================
 * 二、契约缺陷说明（按契约 §0 要求就地记录，不修改契约）
 * ===========================================================================
 * 契约 §5.4 同时要求「主塔高 84 m」「桥面高 40 m」「垂度 58 m」。三者在几何上不相容：
 * 缆索最低点必须高于桥面，故塔顶索鞍至少要 40 + 58 = 98 m，> 84 m。
 * 兜底方案（保留全部计算量，不改任何数值）：**84 m 理解为石砌塔身本身的高度**——
 * 塔身自花岗岩沉箱墩台顶面 y = 14 m 起算，至 y = 98 m 收顶，净高恰为 84 m；
 * 其上 3.5 m 檐帽 + 索鞍把缆索抬到 102.90 m，跨中缆底 44.90 m 恰好高出桥面 4.9 m
 * （与布鲁克林桥「主缆在跨中几乎贴近桥面」的实貌一致）。主跨 520 m、桥面 40 m、
 * 垂度 58 m 三个硬指标全部严格保留。
 *
 * 另：契约 §0 规定 `city/*` 之间不得互相 import，故 `CITY.bridge`
 * （z:1900, startX:760, endX:1560）在本文件以常量镜像声明，不 import `city/grid.js`。
 *
 * ===========================================================================
 * 三、渲染预算
 * ===========================================================================
 * 11 个 drawcall：石作 / 桥面 / 标线 / 木步道 / 钢构合并各 1，
 * 吊索 / 斜拉索 / 桁架斜撑 / 灯杆 / 灯头 / 障碍灯 各 1 个 InstancedMesh。
 * update() 只做「障碍灯 1 Hz 闪烁 + 路灯夜间点亮」两个标量写入，零分配、零几何重建。
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { makeRng } from '../core/rng.js';
import { solveCatenaryA, catenaryY, catenaryPoints, catenaryLength, clamp, lerp } from '../core/mathx.js';
import { patchCityMaterial, CITY_MATERIAL_DEFAULTS } from '../render/shaderpatch.js';

/* =========================================================================
 * 尺寸常量（单位：米；+X 东，+Z 南，Y 向上；水面 y = 0）
 * ========================================================================= */

/** 桥轴所在的 Z（镜像 CITY.bridge.z）。 */
const BRIDGE_Z = 1900;
/** 跨河段起点 X（镜像 CITY.bridge.startX，曼哈顿侧岸线）。 */
const SPAN_START_X = 760;
/** 跨河段终点 X（镜像 CITY.bridge.endX，布鲁克林侧）。 */
const SPAN_END_X = 1560;
/** 主跨中点 X。 */
const CENTER_X = (SPAN_START_X + SPAN_END_X) * 0.5; // 1160
/** 主跨（两塔中心距）。 */
const MAIN_SPAN = 520;
/** 半跨（悬链线求解输入）。 */
const HALF_SPAN = MAIN_SPAN * 0.5; // 260
/** 主缆垂度（悬链线求解输入）。 */
const SAG = 58;
/** 西塔（曼哈顿侧）中心 X。 */
const TOWER_W_X = CENTER_X - HALF_SPAN; // 900
/** 东塔（布鲁克林侧）中心 X。 */
const TOWER_E_X = CENTER_X + HALF_SPAN; // 1420

/** 桥面（车行道）标高。 */
const DECK_Y = 40;
/** 桥面板底面标高。 */
const DECK_BOTTOM_Y = 38.2;
/** 桥面半宽。 */
const DECK_HALF_W = 14;
/** 主缆 / 吊索所在的 Z 偏移（桥面两侧边梁上方）。 */
const CABLE_DZ = 12.4;
/** 塔顶索鞍处缆索中心标高 = DECK_Y + SAG + 跨中净空 4.9。 */
const CABLE_TOP_Y = 102.9;
/** 主缆最低点标高。 */
const CABLE_LOW_Y = CABLE_TOP_Y - SAG; // 44.9
/** 主缆半径。 */
const CABLE_RADIUS = 0.5;
/** 吊索半径（契约要求 0.09）。 */
const HANGER_RADIUS = 0.09;
/** 吊索间距（契约要求 12 m）。 */
const HANGER_SPACING = 12;

/** 引桥/桥面板西端 X（曼哈顿锚碇西缘）。 */
const DECK_START_X = 598;
/** 引桥/桥面板东端 X（布鲁克林锚碇东缘）。 */
const DECK_END_X = 1722;

/** 西侧锚碇块（含地面以下）。 */
const ANCHOR_W = { x0: 598, x1: 680 };
/** 东侧锚碇块。 */
const ANCHOR_E = { x0: 1640, x1: 1722 };
/** 锚碇扶壁上缆索锚固点标高。 */
const ANCHOR_ATTACH_Y = 47;
/** 西锚碇缆索锚固点 X。 */
const ANCHOR_W_ATTACH_X = 684;
/** 东锚碇缆索锚固点 X。 */
const ANCHOR_E_ATTACH_X = 1636;

/** 塔身（石砌，含双尖拱）基底标高。 */
const SHAFT_BASE_Y = 14;
/** 塔身顶标高：14 + 84 = 98（契约「塔高 84 m」= 塔身净高）。 */
const SHAFT_TOP_Y = 98;
/** 塔身沿桥轴方向的厚度。 */
const SHAFT_DEPTH = 14;
/** 塔身横桥向半宽。 */
const SHAFT_HALF_W = 17;
/** 尖拱洞口：靠外侧边缘 |z| 上限。 */
const ARCH_OUTER_DZ = 14.2;
/** 尖拱洞口：中央墩半宽。 */
const ARCH_INNER_DZ = 1.6;
/** 尖拱洞口起拱线标高。 */
const ARCH_BASE_Y = 30;
/** 尖拱起拱点（拱脚圆心）标高。 */
const ARCH_SPRING_Y = 52;
/** 檐帽顶标高。 */
const CAP_TOP_Y = 101.5;
/** 塔顶航空障碍灯标高。 */
const BEACON_Y = 105.2;

/** 车行道内缘（中央步道侧）|z|。 */
const ROAD_INNER_DZ = 4.6;
/** 车行道外缘 |z|。 */
const ROAD_OUTER_DZ = 11.6;
/** 中央木步道半宽。 */
const WALK_HALF_W = 4;
/** 木步道面标高。 */
const WALK_TOP_Y = 43.6;
/** 木步道板厚。 */
const WALK_THICK = 0.5;
/** 边梁顶面标高（吊索落点）。 */
const EDGE_BEAM_TOP_Y = 40.3;

/** 加劲桁架下弦标高。 */
const TRUSS_BOTTOM_Y = 33.2;
/** 桁架节间长度。 */
const TRUSS_BAY = 12;

/** 曼哈顿侧引桥落地点 X 与标高。 */
const RAMP_W_END = { x: 280, y: 0.6 };
/** 布鲁克林侧引桥落地点 X 与标高。 */
const RAMP_E_END = { x: 2040, y: 3.4 };
/** 引桥半宽。 */
const RAMP_HALF_W = 11;

/** 对岸（布鲁克林）石砌岸台。 */
const SHORE = { x0: 1596, x1: 2320, z0: 1600, z1: 2200, top: 3.0, bottom: -6 };

/** 尖拱每段圆弧的采样段数。 */
const ARCH_SEGS = 14;
/** 石材贴图铺贴尺寸（米）。 */
const STONE_TILE = 6;

/* =========================================================================
 * 通用几何工具
 * ========================================================================= */

/** 复用的临时对象（构建期使用，避免在循环里 new）。 */
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _UP = new THREE.Vector3(0, 1, 0);

/**
 * 按世界尺寸重写 BoxGeometry 的 UV，使贴图密度与实际面积一致（避免大面被拉伸）。
 * BoxGeometry(1,1,1 段) 的顶点顺序固定为 +X, −X, +Y, −Y, +Z, −Z，每面 4 个顶点。
 * @param {THREE.BufferGeometry} geo 盒体几何
 * @param {number} w X 向尺寸
 * @param {number} h Y 向尺寸
 * @param {number} d Z 向尺寸
 * @param {number} tile 贴图铺贴边长（米）
 * @returns {THREE.BufferGeometry} 同一个几何
 */
function applyBoxUv(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  if (!uv || uv.count !== 24 || !(tile > 0)) return geo;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const su = spans[f][0] / tile;
    const sv = spans[f][1] / tile;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * 生成一个已平移到指定中心的盒体，并按世界尺寸铺 UV。
 * @param {number} w X 向尺寸
 * @param {number} h Y 向尺寸
 * @param {number} d Z 向尺寸
 * @param {number} cx 中心 X
 * @param {number} cy 中心 Y
 * @param {number} cz 中心 Z
 * @param {number} [tile=STONE_TILE] 贴图铺贴边长
 * @returns {THREE.BufferGeometry}
 */
function box(w, h, d, cx, cy, cz, tile = STONE_TILE) {
  const g = new THREE.BoxGeometry(w, h, d);
  applyBoxUv(g, w, h, d, tile);
  g.translate(cx, cy, cz);
  return g;
}

/**
 * 生成一段沿 X 倾斜的板（引桥车道板 / 栏板）：两端点给定，绕 Z 轴旋转到坡度。
 * @param {number} x0 起点 X
 * @param {number} y0 起点顶面 Y
 * @param {number} x1 终点 X
 * @param {number} y1 终点顶面 Y
 * @param {number} width Z 向宽度
 * @param {number} thick 板厚（沿法向）
 * @param {number} cz 中心 Z
 * @param {number} tile 贴图铺贴边长
 * @returns {THREE.BufferGeometry}
 */
function slopedSlab(x0, y0, x1, y1, width, thick, cz, tile) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const g = new THREE.BoxGeometry(len, thick, width);
  applyBoxUv(g, len, thick, width, tile);
  g.rotateZ(Math.atan2(dy, dx));
  g.translate((x0 + x1) * 0.5, (y0 + y1) * 0.5 - thick * 0.5, cz);
  return g;
}

/**
 * 把非索引几何转成索引几何，以便与 BoxGeometry 等一起 `mergeGeometries`
 * （该函数要求所有输入的索引状态一致）。
 * @param {THREE.BufferGeometry} geo
 * @returns {THREE.BufferGeometry}
 */
function toIndexed(geo) {
  if (geo.index) return geo;
  const merged = mergeVertices(geo, 1e-4);
  geo.dispose();
  return merged;
}

/**
 * 合并一组几何为单个几何，并释放源几何。
 * @param {THREE.BufferGeometry[]} list 源几何数组
 * @returns {THREE.BufferGeometry|null} 合并结果；空数组返回 null
 */
function mergeAndFree(list) {
  if (!list.length) return null;
  const indexed = list.map(toIndexed);
  const merged = mergeGeometries(indexed, false);
  for (const g of indexed) g.dispose();
  list.length = 0;
  return merged;
}

/**
 * 计算「一根沿 from→to 的圆柱」的实例矩阵（基准几何为半径 1、高 1、原点居中的圆柱）。
 * @param {THREE.Matrix4} out 输出矩阵
 * @param {THREE.Vector3} from 起点
 * @param {THREE.Vector3} to 终点
 * @param {number} radius 半径
 * @returns {THREE.Matrix4} out
 */
function strutMatrix(out, from, to, radius) {
  _dir.subVectors(to, from);
  const len = _dir.length() || 1e-4;
  _dir.multiplyScalar(1 / len);
  _quat.setFromUnitVectors(_UP, _dir);
  _pos.addVectors(from, to).multiplyScalar(0.5);
  _scale.set(radius, len, radius);
  return out.compose(_pos, _quat, _scale);
}

/* =========================================================================
 * 石作：带尖拱洞口的墙体
 * ========================================================================= */

/**
 * 构造一个**等边尖拱**洞口路径（哥特双心拱）：
 * 跨度 w 的尖拱由两段半径同为 w 的圆弧构成，圆心分别位于对侧起拱点，
 * 交于拱顶，拱高 = w·√3/2。这是 13 世纪哥特石作的标准两心拱作法，
 * 布鲁克林桥主塔的双拱洞口即取此形。
 *
 * 路径顺序为顺时针（与外轮廓逆时针相反），符合 Shape.holes 的绕向约定。
 *
 * @param {number} z0 洞口左缘（立面局部横坐标）
 * @param {number} z1 洞口右缘
 * @param {number} yBase 洞口底标高（立面局部纵坐标）
 * @param {number} ySpring 起拱线标高
 * @returns {THREE.Path}
 */
function pointedArchHole(z0, z1, yBase, ySpring) {
  const w = z1 - z0;
  const p = new THREE.Path();
  p.moveTo(z0, yBase);
  p.lineTo(z0, ySpring);
  // 左弧：圆心 (z1, ySpring)，半径 w，θ: π → 2π/3（终点即拱顶）
  for (let i = 1; i <= ARCH_SEGS; i++) {
    const th = Math.PI * (1 - i / (3 * ARCH_SEGS));
    p.lineTo(z1 + w * Math.cos(th), ySpring + w * Math.sin(th));
  }
  // 右弧：圆心 (z0, ySpring)，半径 w，θ: π/3 → 0
  for (let i = 1; i <= ARCH_SEGS; i++) {
    const th = (Math.PI / 3) * (1 - i / ARCH_SEGS);
    p.lineTo(z0 + w * Math.cos(th), ySpring + w * Math.sin(th));
  }
  p.lineTo(z1, yBase);
  p.closePath();
  return p;
}

/**
 * 生成「立面开洞的石墙」：在 (z, y) 立面上构造 Shape + 洞口，沿桥轴 X 挤出。
 *
 * 挤出后做 rotateY(−π/2)：(sx, sy, sz) → (−sz, sy, sx)，
 * 即 shape 的横坐标 → 世界 Z，shape 的纵坐标 → 世界 Y，挤出深度 → 世界 X。
 *
 * @param {Object} p 参数
 * @param {number} p.centerX 墙体中心 X
 * @param {number} p.centerZ 墙体中心 Z
 * @param {number} p.baseY 墙底标高
 * @param {number} p.height 墙高
 * @param {number} p.halfWidth 横桥向半宽
 * @param {number} p.depth 沿桥轴厚度
 * @param {Array<{z0:number,z1:number,yBase:number,ySpring:number}>} p.openings 洞口（Y 为世界标高）
 * @returns {THREE.BufferGeometry}
 */
function makeArchWall(p) {
  const shape = new THREE.Shape();
  shape.moveTo(-p.halfWidth, 0);
  shape.lineTo(p.halfWidth, 0);
  shape.lineTo(p.halfWidth, p.height);
  shape.lineTo(-p.halfWidth, p.height);
  shape.closePath();
  for (const o of p.openings) {
    shape.holes.push(pointedArchHole(o.z0, o.z1, o.yBase - p.baseY, o.ySpring - p.baseY));
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: p.depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1
  });
  // ExtrudeGeometry 的默认 UV 生成器直接以几何坐标为 UV（单位：米），按石材尺度缩放
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) / STONE_TILE, uv.getY(i) / STONE_TILE);
  }
  uv.needsUpdate = true;

  geo.rotateY(-Math.PI / 2);
  geo.translate(p.centerX + p.depth * 0.5, p.baseY, p.centerZ);
  return geo;
}

/* =========================================================================
 * 木步道贴图（程序化生成，不加载任何外部文件）
 * ========================================================================= */

/**
 * 创建离屏画布（浏览器用 document，Worker/测试环境退化为 OffscreenCanvas；都没有则返回 null）。
 * @param {number} w 宽
 * @param {number} h 高
 * @returns {HTMLCanvasElement|OffscreenCanvas|null}
 */
function createCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

/**
 * 程序化木板贴图：横向铺板（沿 U 方向排列板缝），每块板色调用种子 RNG 抖动，
 * 叠加纵向木纹条与钉孔，供中央步道使用。
 * @param {Object} rng 种子 RNG（core/rng.js）
 * @returns {THREE.CanvasTexture|null}
 */
function makeWoodTexture(rng) {
  const size = 256;
  const canvas = createCanvas(size, size);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  if (!g) return null;

  const planks = 8;
  const pw = size / planks;
  for (let i = 0; i < planks; i++) {
    const tone = rng.range(-0.12, 0.12);
    const r = clamp(0.55 + tone, 0, 1);
    const gr = clamp(0.38 + tone * 0.9, 0, 1);
    const b = clamp(0.24 + tone * 0.7, 0, 1);
    g.fillStyle = `rgb(${(r * 255) | 0}, ${(gr * 255) | 0}, ${(b * 255) | 0})`;
    g.fillRect(i * pw, 0, pw, size);

    // 木纹：沿板长方向（V）的细长条
    const grains = 10 + ((rng.next() * 8) | 0);
    for (let k = 0; k < grains; k++) {
      const gx = i * pw + rng.range(1.5, pw - 1.5);
      g.strokeStyle = `rgba(40, 24, 12, ${rng.range(0.05, 0.16).toFixed(3)})`;
      g.lineWidth = rng.range(0.6, 1.8);
      g.beginPath();
      g.moveTo(gx, 0);
      for (let s = 1; s <= 6; s++) {
        g.lineTo(gx + rng.range(-1.2, 1.2), (size * s) / 6);
      }
      g.stroke();
    }

    // 板缝
    g.fillStyle = 'rgba(22, 13, 6, 0.55)';
    g.fillRect(i * pw, 0, 1.4, size);

    // 钉帽
    g.fillStyle = 'rgba(28, 26, 24, 0.6)';
    for (let n = 0; n < 4; n++) {
      g.beginPath();
      g.arc(i * pw + pw * 0.5 + rng.range(-1, 1), (size * (n + 0.5)) / 4, 1.3, 0, Math.PI * 2);
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 克隆共享贴图并设为独立平铺参数。
 * 共享库里的贴图 repeat 由 `roads.js` 等模块按自己的需要改写，
 * 直接引用会互相污染，因此这里克隆一份自用（克隆体由本模块 dispose）。
 * @param {THREE.Texture|null|undefined} tex 源贴图
 * @param {boolean} color 是否颜色贴图（决定 colorSpace）
 * @returns {THREE.Texture|null}
 */
function cloneTiled(tex, color) {
  if (!tex || typeof tex.clone !== 'function') return null;
  const t = tex.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = tex.anisotropy || 4;
  t.needsUpdate = true;
  return t;
}

/* =========================================================================
 * 悬链线：主缆与边缆
 * ========================================================================= */

/**
 * 主缆参数（模块加载时求解一次，全程复用）。
 * `a` 由 `solveCatenaryA(260, 58)` 牛顿迭代求得，见文件头注释。
 * @type {{a:number, length:number}}
 */
const MAIN_CATENARY = (() => {
  const a = solveCatenaryA(HALF_SPAN, SAG);
  return { a, length: catenaryLength(HALF_SPAN, a) };
})();

/**
 * 主缆在主跨内任意 X 处的标高：CABLE_LOW_Y + a·cosh(dx/a) − a。
 * @param {number} x 世界 X
 * @returns {number} 缆索中心标高（米）
 */
function mainCableY(x) {
  return CABLE_LOW_Y + catenaryY(x - CENTER_X, MAIN_CATENARY.a);
}

/**
 * 构造**两端不等高**的边缆（塔顶 → 锚碇）悬链线求值器。
 *
 * 同一根缆索水平张力 H 不变 ⇒ 与主缆共用参数 a；顶点位置由解析解给出：
 *   x₀ = m − a·asinh( h / (2a·sinh(d/(2a))) )，  d = x₁−x₂，h = y₁−y₂，m = (x₁+x₂)/2
 * 竖向常数 c 由 y(x₁) = y₁ 定出。
 *
 * @param {number} x1 塔顶 X
 * @param {number} y1 塔顶 Y
 * @param {number} x2 锚碇 X
 * @param {number} y2 锚碇 Y
 * @returns {{ y:(x:number)=>number, x0:number, length:number }} 求值器、顶点 X、弧长
 */
function makeSideCatenary(x1, y1, x2, y2) {
  const a = MAIN_CATENARY.a;
  const d = x1 - x2;
  const h = y1 - y2;
  const m = (x1 + x2) * 0.5;
  const denom = 2 * a * Math.sinh(d / (2 * a));
  const x0 = m - a * Math.asinh(h / denom);
  const c = y1 - a * Math.cosh((x1 - x0) / a);
  const len = Math.abs(a * (Math.sinh((x1 - x0) / a) - Math.sinh((x2 - x0) / a)));
  return {
    /**
     * 边缆标高。
     * @param {number} x 世界 X
     * @returns {number} 标高（米）
     */
    y: (x) => a * Math.cosh((x - x0) / a) + c,
    x0,
    length: len
  };
}

/* =========================================================================
 * 引桥坡道
 * ========================================================================= */

/**
 * 引桥坡道求值：给定端点线性插值出车道面标高（坡道为直线纵坡）。
 * @param {number} x 世界 X
 * @param {number} xTop 桥面端 X
 * @param {number} yTop 桥面端标高
 * @param {number} xEnd 落地端 X
 * @param {number} yEnd 落地端标高
 * @returns {number} 标高
 */
function rampY(x, xTop, yTop, xEnd, yEnd) {
  const t = clamp((x - xTop) / (xEnd - xTop), 0, 1);
  return lerp(yTop, yEnd, t);
}

/* =========================================================================
 * 石作构件
 * ========================================================================= */

/**
 * 一座石砌哥特双拱主塔：花岗岩沉箱墩台 → 84 m 塔身（两个尖拱洞口）→ 檐帽 → 角饰。
 * @param {THREE.BufferGeometry[]} out 石作几何收集数组
 * @param {number} tx 塔中心 X
 * @returns {void}
 */
function buildTower(out, tx) {
  // 沉箱墩台（水下 −8 → 水上 14，两级放脚）
  out.push(box(24, 10, 42, tx, -3, BRIDGE_Z));
  out.push(box(20, 12, 37, tx, 8, BRIDGE_Z));

  // 塔身：净高 84 m（14 → 98），两个等边尖拱洞口
  out.push(makeArchWall({
    centerX: tx,
    centerZ: BRIDGE_Z,
    baseY: SHAFT_BASE_Y,
    height: SHAFT_TOP_Y - SHAFT_BASE_Y,
    halfWidth: SHAFT_HALF_W,
    depth: SHAFT_DEPTH,
    openings: [
      { z0: -ARCH_OUTER_DZ, z1: -ARCH_INNER_DZ, yBase: ARCH_BASE_Y, ySpring: ARCH_SPRING_Y },
      { z0: ARCH_INNER_DZ, z1: ARCH_OUTER_DZ, yBase: ARCH_BASE_Y, ySpring: ARCH_SPRING_Y }
    ]
  }));

  // 拱肩水平线脚（拱顶之上的一道束带层）
  const archApexY = ARCH_SPRING_Y + (ARCH_OUTER_DZ - ARCH_INNER_DZ) * Math.sqrt(3) / 2;
  out.push(box(SHAFT_DEPTH + 1.2, 1.1, SHAFT_HALF_W * 2 + 1.2, tx, archApexY + 3.2, BRIDGE_Z));

  // 檐口 + 檐帽
  out.push(box(SHAFT_DEPTH + 3, 1.6, SHAFT_HALF_W * 2 + 3, tx, SHAFT_TOP_Y + 0.8, BRIDGE_Z));
  out.push(box(SHAFT_DEPTH + 1.4, CAP_TOP_Y - SHAFT_TOP_Y - 1.6, SHAFT_HALF_W * 2 + 1.4,
    tx, (SHAFT_TOP_Y + 1.6 + CAP_TOP_Y) * 0.5, BRIDGE_Z));

  // 四角小尖饰 + 中央灯座
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(box(3, 3.6, 3, tx + sx * 5.6, CAP_TOP_Y + 1.8, BRIDGE_Z + sz * 15.2));
    }
  }
  out.push(box(1.1, 3.4, 1.1, tx, CAP_TOP_Y + 1.7, BRIDGE_Z));
}

/**
 * 一座锚碇：巨型石砌块体（顶面即引桥车道面）+ 两道缆索扶壁。
 * @param {THREE.BufferGeometry[]} out 石作几何收集数组
 * @param {number} x0 块体西缘 X
 * @param {number} x1 块体东缘 X
 * @param {number} buttressX0 扶壁西缘 X
 * @param {number} buttressX1 扶壁东缘 X
 * @returns {void}
 */
function buildAnchorage(out, x0, x1, buttressX0, buttressX1) {
  const w = x1 - x0;
  const cx = (x0 + x1) * 0.5;
  // 放脚 + 主体（顶面 40 m 与桥面齐平）
  out.push(box(w + 7, 8, 96, cx, 0, BRIDGE_Z));
  out.push(box(w, DECK_Y + 4, 88, cx, (DECK_Y - 4) * 0.5, BRIDGE_Z));
  // 檐口束带
  out.push(box(w + 2.4, 1.3, 90.4, cx, 36.5, BRIDGE_Z));
  // 缆索扶壁（左右各一，位于缆索平面上，让开中央车行道）
  const bw = buttressX1 - buttressX0;
  const bcx = (buttressX0 + buttressX1) * 0.5;
  for (const sz of [-1, 1]) {
    const z = BRIDGE_Z + sz * CABLE_DZ;
    out.push(box(bw, 10.5, 5.6, bcx, DECK_Y + 5.25, z));
    out.push(box(bw + 1.2, 1.2, 6.8, bcx, DECK_Y + 11.1, z));
  }
}

/**
 * 引桥：倾斜车道板 + 石栏板 + 沿途拱墩（避开大道中心线，不砸在路面上）。
 * @param {Object} p 参数
 * @param {THREE.BufferGeometry[]} p.stone 石作收集数组
 * @param {THREE.BufferGeometry[]} p.deck 车道面收集数组
 * @param {number} p.xTop 桥面端 X
 * @param {number} p.xEnd 落地端 X
 * @param {number} p.yEnd 落地端标高
 * @param {number} p.groundY 墩台起算标高（曼哈顿街面 0 / 对岸岸台 3）
 * @param {number[]} p.avoidXs 需避让的大道中心线 X
 * @param {Object} p.rng 种子 RNG
 * @returns {void}
 */
function buildApproach(p) {
  const { stone, deck, xTop, xEnd, yEnd, groundY, avoidXs, rng } = p;
  const dirSign = Math.sign(xEnd - xTop);

  // 车道板（沥青面）与两侧石栏板
  deck.push(slopedSlab(
    Math.min(xTop, xEnd), rampY(Math.min(xTop, xEnd), xTop, DECK_Y, xEnd, yEnd),
    Math.max(xTop, xEnd), rampY(Math.max(xTop, xEnd), xTop, DECK_Y, xEnd, yEnd),
    RAMP_HALF_W * 2, 1.8, BRIDGE_Z, 8
  ));
  for (const sz of [-1, 1]) {
    stone.push(slopedSlab(
      Math.min(xTop, xEnd), rampY(Math.min(xTop, xEnd), xTop, DECK_Y, xEnd, yEnd) + 1.15,
      Math.max(xTop, xEnd), rampY(Math.max(xTop, xEnd), xTop, DECK_Y, xEnd, yEnd) + 1.15,
      1.1, 1.15, BRIDGE_Z + sz * (RAMP_HALF_W - 0.55), STONE_TILE
    ));
  }

  // 拱墩：沿坡每 ~40 m 一座，落在大道上的跳过
  const total = Math.abs(xEnd - xTop);
  const count = Math.max(1, Math.round(total / 40) - 1);
  for (let i = 1; i <= count; i++) {
    const jitter = rng.range(-3.5, 3.5);
    const px = xTop + dirSign * ((total * i) / (count + 1) + jitter);
    let blocked = false;
    for (const ax of avoidXs) {
      if (Math.abs(px - ax) < 24) { blocked = true; break; }
    }
    if (blocked) continue;
    const topY = rampY(px, xTop, DECK_Y, xEnd, yEnd) - 1.8;
    const h = topY - groundY;
    if (h < 3) continue;
    stone.push(box(9, h, 20, px, groundY + h * 0.5, BRIDGE_Z));
    stone.push(box(12, 2.2, 23, px, topY - 1.1, BRIDGE_Z));
    stone.push(box(11, 3, 22, px, groundY + 1.5, BRIDGE_Z));
  }
}

/* =========================================================================
 * 桥面板 / 缘石 / 标线 / 木步道
 * ========================================================================= */

/** 主塔处桥面板让开中央墩的半窗口长度。 */
const TOWER_GAP_HALF_X = 10;
/** 中央墩两侧桥面板的让开半宽。 */
const TOWER_GAP_HALF_Z = 1.75;
/** 木步道在塔区分岔的半窗口长度。 */
const WALK_SPLIT_HALF_X = 20;

/**
 * 桥面板：主跨段连续，主塔处沿中央墩劈开两片让开石墩。
 * @param {THREE.BufferGeometry[]} deckOut 沥青面几何数组
 * @param {THREE.BufferGeometry[]} stoneOut 石作几何数组（边梁与缘石）
 * @returns {void}
 */
function buildDeck(deckOut, stoneOut) {
  const thick = DECK_Y - DECK_BOTTOM_Y;
  const cy = (DECK_Y + DECK_BOTTOM_Y) * 0.5;

  /**
   * 压一段整幅桥面板。
   * @param {number} x0 段起点
   * @param {number} x1 段终点
   * @returns {void}
   */
  const full = (x0, x1) => {
    if (x1 - x0 < 0.2) return;
    deckOut.push(box(x1 - x0, thick, DECK_HALF_W * 2, (x0 + x1) * 0.5, cy, BRIDGE_Z, 8));
  };

  /**
   * 压一段被中央墩劈开的桥面板。
   * @param {number} x0 段起点
   * @param {number} x1 段终点
   * @returns {void}
   */
  const split = (x0, x1) => {
    const w = (DECK_HALF_W - TOWER_GAP_HALF_Z) * 0.5;
    for (const sz of [-1, 1]) {
      deckOut.push(box(x1 - x0, thick, (DECK_HALF_W - TOWER_GAP_HALF_Z), (x0 + x1) * 0.5, cy,
        BRIDGE_Z + sz * (TOWER_GAP_HALF_Z + w), 8));
    }
  };

  full(DECK_START_X, TOWER_W_X - TOWER_GAP_HALF_X);
  split(TOWER_W_X - TOWER_GAP_HALF_X, TOWER_W_X + TOWER_GAP_HALF_X);
  full(TOWER_W_X + TOWER_GAP_HALF_X, TOWER_E_X - TOWER_GAP_HALF_X);
  split(TOWER_E_X - TOWER_GAP_HALF_X, TOWER_E_X + TOWER_GAP_HALF_X);
  full(TOWER_E_X + TOWER_GAP_HALF_X, DECK_END_X);

  // 两侧边梁（吊索落点与栏杆基座）与中央步道缘石
  const len = DECK_END_X - DECK_START_X;
  const mx = (DECK_START_X + DECK_END_X) * 0.5;
  for (const sz of [-1, 1]) {
    const beamW = DECK_HALF_W - ROAD_OUTER_DZ;
    stoneOut.push(box(len, EDGE_BEAM_TOP_Y - DECK_Y + 0.5, beamW, mx,
      DECK_Y + (EDGE_BEAM_TOP_Y - DECK_Y - 0.5) * 0.5, BRIDGE_Z + sz * (ROAD_OUTER_DZ + beamW * 0.5), STONE_TILE));
    const curbW = ROAD_INNER_DZ - WALK_HALF_W;
    stoneOut.push(box(len, 1.1, curbW, mx, DECK_Y, BRIDGE_Z + sz * (WALK_HALF_W + curbW * 0.5), STONE_TILE));
  }
}

/**
 * 车道标线：双向各一条虚线中心线 + 实线边线（几何全部代码生成，不用贴图）。
 * 用 `polygonOffset` 压在沥青面之上，避免 z-fighting。
 * @param {THREE.BufferGeometry[]} out 标线几何数组
 * @returns {void}
 */
function buildMarkings(out) {
  const y = DECK_Y + 0.012;
  const x0 = ANCHOR_W.x1;
  const x1 = ANCHOR_E.x0;

  /**
   * 一条贴地长条。
   * @param {number} ax 起点 X
   * @param {number} bx 终点 X
   * @param {number} z 中心 Z
   * @param {number} w 线宽
   * @returns {void}
   */
  const strip = (ax, bx, z, w) => {
    const g = new THREE.PlaneGeometry(bx - ax, w);
    g.rotateX(-Math.PI / 2);
    g.translate((ax + bx) * 0.5, y, z);
    out.push(g);
  };

  for (const sz of [-1, 1]) {
    const mid = BRIDGE_Z + sz * (ROAD_INNER_DZ + ROAD_OUTER_DZ) * 0.5;
    // 虚线中心线：5 m 线 + 7 m 空
    for (let x = x0 + 4; x < x1 - 6; x += 12) strip(x, x + 5, mid, 0.34);
    // 内外实线边线
    strip(x0, x1, BRIDGE_Z + sz * (ROAD_INNER_DZ + 0.35), 0.28);
    strip(x0, x1, BRIDGE_Z + sz * (ROAD_OUTER_DZ - 0.35), 0.28);
  }
}

/**
 * 中央高起木质步道：主段整幅，主塔处分岔为两条窄道绕过中央石墩。
 * @param {THREE.BufferGeometry[]} woodOut 木作几何数组
 * @param {THREE.BufferGeometry[]} steelOut 钢构几何数组（支柱与横托梁）
 * @returns {void}
 */
function buildPromenade(woodOut, steelOut) {
  const cy = WALK_TOP_Y - WALK_THICK * 0.5;

  /**
   * 整幅步道段。
   * @param {number} x0 段起点
   * @param {number} x1 段终点
   * @returns {void}
   */
  const full = (x0, x1) => {
    if (x1 - x0 < 0.2) return;
    woodOut.push(box(x1 - x0, WALK_THICK, WALK_HALF_W * 2, (x0 + x1) * 0.5, cy, BRIDGE_Z, 2.4));
  };

  /**
   * 塔区分岔的两条窄道。
   * @param {number} x0 段起点
   * @param {number} x1 段终点
   * @returns {void}
   */
  const branch = (x0, x1) => {
    const w = WALK_HALF_W - TOWER_GAP_HALF_Z;
    for (const sz of [-1, 1]) {
      woodOut.push(box(x1 - x0, WALK_THICK, w, (x0 + x1) * 0.5, cy,
        BRIDGE_Z + sz * (TOWER_GAP_HALF_Z + w * 0.5), 2.4));
    }
  };

  full(DECK_START_X, TOWER_W_X - WALK_SPLIT_HALF_X);
  branch(TOWER_W_X - WALK_SPLIT_HALF_X, TOWER_W_X + WALK_SPLIT_HALF_X);
  full(TOWER_W_X + WALK_SPLIT_HALF_X, TOWER_E_X - WALK_SPLIT_HALF_X);
  branch(TOWER_E_X - WALK_SPLIT_HALF_X, TOWER_E_X + WALK_SPLIT_HALF_X);
  full(TOWER_E_X + WALK_SPLIT_HALF_X, DECK_END_X);

  // 支柱与横托梁
  for (let x = DECK_START_X + 6; x < DECK_END_X; x += TRUSS_BAY) {
    const nearTower = Math.abs(x - TOWER_W_X) < WALK_SPLIT_HALF_X || Math.abs(x - TOWER_E_X) < WALK_SPLIT_HALF_X;
    if (!nearTower) {
      steelOut.push(box(0.5, WALK_TOP_Y - WALK_THICK - DECK_Y, WALK_HALF_W * 2 - 0.4, x,
        (DECK_Y + WALK_TOP_Y - WALK_THICK) * 0.5, BRIDGE_Z, 4));
    }
    for (const sz of [-1, 1]) {
      steelOut.push(box(0.34, WALK_TOP_Y - WALK_THICK - DECK_Y, 0.34, x,
        (DECK_Y + WALK_TOP_Y - WALK_THICK) * 0.5, BRIDGE_Z + sz * (WALK_HALF_W - 0.5), 4));
    }
  }
}

/**
 * 一段栏杆（两道横杆 + 立柱），沿桥轴方向。
 * @param {THREE.BufferGeometry[]} out 钢构几何数组
 * @param {number} x0 起点 X
 * @param {number} x1 终点 X
 * @param {number} z 中心 Z
 * @param {number} baseY 底标高
 * @param {number} height 栏杆高
 * @param {number} postStep 立柱间距
 * @returns {void}
 */
function buildRailing(out, x0, x1, z, baseY, height, postStep) {
  if (x1 - x0 < 1) return;
  const len = x1 - x0;
  const mx = (x0 + x1) * 0.5;
  out.push(box(len, 0.12, 0.12, mx, baseY + height, z, 4));
  out.push(box(len, 0.09, 0.09, mx, baseY + height * 0.52, z, 4));
  for (let x = x0 + postStep * 0.5; x < x1; x += postStep) {
    out.push(box(0.11, height, 0.11, x, baseY + height * 0.5, z, 4));
  }
}

/* =========================================================================
 * 加劲桁架
 * ========================================================================= */

/** 桁架上弦标高。 */
const TRUSS_TOP_Y = DECK_BOTTOM_Y - 0.35;

/**
 * 桥面下加劲桁架的上下弦、竖杆与横向楼面梁（斜撑另用 InstancedMesh，见 createBridge）。
 * @param {THREE.BufferGeometry[]} out 钢构几何数组
 * @returns {void}
 */
function buildTrussChords(out) {
  const x0 = ANCHOR_W.x1;
  const x1 = ANCHOR_E.x0;
  const len = x1 - x0;
  const mx = (x0 + x1) * 0.5;
  for (const sz of [-1, 1]) {
    const z = BRIDGE_Z + sz * CABLE_DZ;
    out.push(box(len, 0.7, 0.5, mx, TRUSS_TOP_Y, z, 4));
    out.push(box(len, 0.85, 0.6, mx, TRUSS_BOTTOM_Y, z, 4));
    for (let x = x0; x <= x1 + 0.01; x += TRUSS_BAY) {
      if (Math.abs(x - TOWER_W_X) < 9 || Math.abs(x - TOWER_E_X) < 9) continue;
      out.push(box(0.34, TRUSS_TOP_Y - TRUSS_BOTTOM_Y, 0.34, x, (TRUSS_TOP_Y + TRUSS_BOTTOM_Y) * 0.5, z, 4));
    }
  }
  for (let x = x0; x <= x1 + 0.01; x += TRUSS_BAY) {
    if (Math.abs(x - TOWER_W_X) < TOWER_GAP_HALF_X || Math.abs(x - TOWER_E_X) < TOWER_GAP_HALF_X) continue;
    out.push(box(0.42, 0.8, CABLE_DZ * 2 + 1.4, x, TRUSS_BOTTOM_Y + 1.9, BRIDGE_Z, 4));
  }
}

/* =========================================================================
 * 工厂函数
 * ========================================================================= */

/**
 * 创建东河悬索桥系统（契约 §5.4）。
 *
 * @param {{plan?:Object, rng?:Object, textures?:Object, env?:Object, quality?:string, tallStructures?:Array}} ctx0
 *   构建期上下文（契约 §5）
 * @returns {{object3D: THREE.Group, update: (ctx:Object)=>void, dispose: ()=>void, stats: Object, catenary: Object}}
 *   SystemHandle
 */
export function createBridge(ctx0) {
  const ctx = ctx0 || {};
  const rng = ctx.rng && typeof ctx.rng.fork === 'function'
    ? ctx.rng.fork('bridge')
    : makeRng('bridge', 'bridge');
  const quality = ctx.quality === 'low' ? 'low' : ctx.quality === 'medium' ? 'medium' : 'high';
  const tex = ctx.textures || {};
  const env = ctx.env || null;

  const LOD = {
    high: { tubular: 128, radial: 7, stays: 13, diagPerBay: 2, lampStep: 24, postStep: 5 },
    medium: { tubular: 96, radial: 6, stays: 11, diagPerBay: 2, lampStep: 28, postStep: 6 },
    low: { tubular: 56, radial: 5, stays: 7, diagPerBay: 1, lampStep: 36, postStep: 9 }
  }[quality];

  const root = new THREE.Group();
  root.name = 'bridge';

  /** @type {THREE.Texture[]} 本模块自建/克隆的贴图，dispose 时释放 */
  const ownTextures = [];
  /** @type {THREE.Material[]} */
  const materials = [];
  /** @type {THREE.BufferGeometry[]} */
  const geometries = [];

  /* ---------------- 材质 ---------------- */

  const stoneMap = cloneTiled(tex.limestone, true);
  const asphaltMap = cloneTiled(tex.asphalt, true);
  const asphaltRough = cloneTiled(tex.asphaltRough, false);
  const woodMap = makeWoodTexture(rng.fork('wood'));
  for (const t of [stoneMap, asphaltMap, asphaltRough, woodMap]) if (t) ownTextures.push(t);

  /**
   * 建材质并登记（统一走 patchCityMaterial 接入全城积雪/湿滑/闪电）。
   * @param {Object} params MeshStandardMaterial 参数
   * @param {Object} patchOpts patchCityMaterial 的 opts
   * @returns {THREE.MeshStandardMaterial}
   */
  const mat = (params, patchOpts) => {
    const m = new THREE.MeshStandardMaterial(params);
    if (patchOpts) patchCityMaterial(m, env, patchOpts);
    materials.push(m);
    return m;
  };

  const stoneMat = mat(
    { map: stoneMap || null, color: 0xc9c0b2, roughness: 0.93, metalness: 0.02 },
    { snow: true, snowAmount: 1.0, wetness: true, wetDarken: 0.32, puddles: false }
  );
  const deckMat = mat(
    { map: asphaltMap || null, roughnessMap: asphaltRough || null, color: 0x8b8b8d, roughness: 0.95, metalness: 0.03 },
    { snow: true, snowAmount: 0.9, wetness: true, wetDarken: 0.38, puddles: true }
  );
  const markMat = mat(
    {
      color: 0xe3dfcd, roughness: 0.7, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    },
    { snow: true, snowAmount: 0.9, wetness: true, wetDarken: 0.3, puddles: false }
  );
  const woodMat = mat(
    { map: woodMap || null, color: woodMap ? 0xffffff : 0x9a6f47, roughness: 0.87, metalness: 0.02 },
    { snow: true, snowAmount: 0.95, wetness: true, wetDarken: 0.42, puddles: false }
  );
  const steelMat = mat(
    { color: 0x71767c, roughness: CITY_MATERIAL_DEFAULTS.roughness * 0.6, metalness: 0.74 },
    { snow: true, snowAmount: 0.35, wetness: true, wetDarken: 0.25, puddles: false }
  );
  const lampMat = mat(
    { color: 0x141414, emissive: 0xffd9a4, emissiveIntensity: 0, roughness: 0.32, metalness: 0.1 },
    null
  );
  const beaconMat = mat(
    { color: 0x230606, emissive: 0xff2e22, emissiveIntensity: 0, roughness: 0.42, metalness: 0.1 },
    null
  );

  /* ---------------- 静态几何收集 ---------------- */

  /** @type {THREE.BufferGeometry[]} */
  const stone = [];
  /** @type {THREE.BufferGeometry[]} */
  const deck = [];
  /** @type {THREE.BufferGeometry[]} */
  const marks = [];
  /** @type {THREE.BufferGeometry[]} */
  const wood = [];
  /** @type {THREE.BufferGeometry[]} */
  const steel = [];

  // 对岸岸台（布鲁克林一侧的石砌驳岸，供引桥落地）
  stone.push(box(SHORE.x1 - SHORE.x0, SHORE.top - SHORE.bottom, SHORE.z1 - SHORE.z0,
    (SHORE.x0 + SHORE.x1) * 0.5, (SHORE.top + SHORE.bottom) * 0.5, (SHORE.z0 + SHORE.z1) * 0.5));
  stone.push(box(2.4, 2.2, SHORE.z1 - SHORE.z0 + 2.4, SHORE.x0 + 1.2, SHORE.top - 0.4,
    (SHORE.z0 + SHORE.z1) * 0.5));

  buildTower(stone, TOWER_W_X);
  buildTower(stone, TOWER_E_X);
  buildAnchorage(stone, ANCHOR_W.x0, ANCHOR_W.x1, 612, ANCHOR_W_ATTACH_X);
  buildAnchorage(stone, ANCHOR_E.x0, ANCHOR_E.x1, ANCHOR_E_ATTACH_X, 1708);

  const avenueXs = ctx.plan && Array.isArray(ctx.plan.avenueXs) ? ctx.plan.avenueXs : [];
  buildApproach({
    stone, deck, xTop: DECK_START_X, xEnd: RAMP_W_END.x, yEnd: RAMP_W_END.y,
    groundY: 0, avoidXs: avenueXs, rng: rng.fork('rampW')
  });
  buildApproach({
    stone, deck, xTop: DECK_END_X, xEnd: RAMP_E_END.x, yEnd: RAMP_E_END.y,
    groundY: SHORE.top, avoidXs: [], rng: rng.fork('rampE')
  });

  buildDeck(deck, stone);
  buildMarkings(marks);
  buildPromenade(wood, steel);
  buildTrussChords(steel);

  // 栏杆：桥面外缘（避开主塔石墩窗口）与中央步道两侧
  const railSegs = [
    [DECK_START_X, TOWER_W_X - TOWER_GAP_HALF_X],
    [TOWER_W_X + TOWER_GAP_HALF_X, TOWER_E_X - TOWER_GAP_HALF_X],
    [TOWER_E_X + TOWER_GAP_HALF_X, DECK_END_X]
  ];
  const walkSegs = [
    [DECK_START_X, TOWER_W_X - WALK_SPLIT_HALF_X],
    [TOWER_W_X + WALK_SPLIT_HALF_X, TOWER_E_X - WALK_SPLIT_HALF_X],
    [TOWER_E_X + WALK_SPLIT_HALF_X, DECK_END_X]
  ];
  for (const sz of [-1, 1]) {
    for (const [a, b] of railSegs) {
      buildRailing(steel, a, b, BRIDGE_Z + sz * (DECK_HALF_W - 0.35), EDGE_BEAM_TOP_Y, 1.15, LOD.postStep);
    }
    for (const [a, b] of walkSegs) {
      buildRailing(steel, a, b, BRIDGE_Z + sz * (WALK_HALF_W - 0.25), WALK_TOP_Y, 1.05, LOD.postStep * 1.4);
    }
  }

  /* ---------------- 主缆与边缆（真实悬链线） ---------------- */

  const sideW = makeSideCatenary(TOWER_W_X, CABLE_TOP_Y, ANCHOR_W_ATTACH_X, ANCHOR_ATTACH_Y);
  const sideE = makeSideCatenary(TOWER_E_X, CABLE_TOP_Y, ANCHOR_E_ATTACH_X, ANCHOR_ATTACH_Y);

  for (const sz of [-1, 1]) {
    const z = BRIDGE_Z + sz * CABLE_DZ;

    // 主跨：catenaryPoints 采样 → CatmullRomCurve3 → TubeGeometry
    const mainPts = catenaryPoints(MAIN_SPAN, SAG, 33)
      .map((p) => new THREE.Vector3(CENTER_X + p.x, CABLE_LOW_Y + p.y, z));
    steel.push(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(mainPts, false, 'catmullrom', 0.5),
      LOD.tubular, CABLE_RADIUS, LOD.radial, false
    ));

    // 边缆：塔顶 → 锚碇扶壁，两端不等高的同参数悬链线
    for (const side of [
      { fn: sideW, x1: TOWER_W_X, x2: ANCHOR_W_ATTACH_X },
      { fn: sideE, x1: TOWER_E_X, x2: ANCHOR_E_ATTACH_X }
    ]) {
      const n = 17;
      const pts = new Array(n);
      for (let i = 0; i < n; i++) {
        const x = lerp(side.x1, side.x2, i / (n - 1));
        pts[i] = new THREE.Vector3(x, side.fn.y(x), z);
      }
      steel.push(new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5),
        Math.max(24, LOD.tubular >> 2), CABLE_RADIUS, LOD.radial, false
      ));
    }

    // 塔顶索鞍
    for (const tx of [TOWER_W_X, TOWER_E_X]) {
      steel.push(box(3.6, 1.4, 2.8, tx, CABLE_TOP_Y - 0.95, z, 4));
    }
  }

  /* ---------------- 实例化构件 ---------------- */

  /** @type {THREE.Matrix4[]} */
  const hangerMats = [];
  /** @type {THREE.Matrix4[]} */
  const stayMats = [];
  /** @type {THREE.Matrix4[]} */
  const diagMats = [];
  /** @type {THREE.Matrix4[]} */
  const lampPostMats = [];
  /** @type {THREE.Matrix4[]} */
  const lampHeadMats = [];
  /** @type {THREE.Matrix4[]} */
  const beaconMats = [];

  /**
   * 记录一根圆柱构件的实例矩阵。
   * @param {THREE.Matrix4[]} list 目标数组
   * @param {THREE.Vector3} from 起点
   * @param {THREE.Vector3} to 终点
   * @param {number} radius 半径
   * @returns {void}
   */
  const pushStrut = (list, from, to, radius) => {
    list.push(strutMatrix(new THREE.Matrix4(), from, to, radius));
  };

  // (1) 竖直吊索：主跨每 12 m 一根，长度 = 悬链线求值 − 桥面标高
  let hangerMin = Infinity;
  let hangerMax = 0;
  for (const sz of [-1, 1]) {
    const z = BRIDGE_Z + sz * CABLE_DZ;

    for (let dx = 0; dx <= HALF_SPAN; dx += HANGER_SPACING) {
      if (HALF_SPAN - dx < SHAFT_DEPTH) continue; // 让开塔身
      for (const s of dx === 0 ? [0] : [-1, 1]) {
        const x = CENTER_X + s * dx;
        const len = mainCableY(x) - DECK_Y; // ← catenaryY 求值 − 桥面高度
        if (len < 0.6) continue;
        hangerMin = Math.min(hangerMin, len);
        hangerMax = Math.max(hangerMax, len);
        _v1.set(x, DECK_Y, z);
        _v2.set(x, DECK_Y + len, z);
        pushStrut(hangerMats, _v1, _v2, HANGER_RADIUS);
      }
    }

    // 边跨吊索（同样由悬链线求值定长）
    for (const side of [
      { fn: sideW, tower: TOWER_W_X, dir: -1, limit: ANCHOR_W_ATTACH_X + 10 },
      { fn: sideE, tower: TOWER_E_X, dir: 1, limit: ANCHOR_E_ATTACH_X - 10 }
    ]) {
      for (let k = 2; k < 40; k++) {
        const x = side.tower + side.dir * k * HANGER_SPACING;
        if (side.dir < 0 ? x < side.limit : x > side.limit) break;
        const len = side.fn.y(x) - DECK_Y;
        if (len < 3) break;
        hangerMax = Math.max(hangerMax, len);
        _v1.set(x, DECK_Y, z);
        _v2.set(x, DECK_Y + len, z);
        pushStrut(hangerMats, _v1, _v2, HANGER_RADIUS);
      }
    }
  }

  // (2) 放射状斜拉索：塔顶扇形拉至桥面，与吊索织成网
  for (const tx of [TOWER_W_X, TOWER_E_X]) {
    for (const sz of [-1, 1]) {
      const z = BRIDGE_Z + sz * CABLE_DZ;
      for (const dir of [-1, 1]) {
        for (let k = 0; k < LOD.stays; k++) {
          const anchorX = tx + dir * (24 + k * 13);
          if (anchorX < ANCHOR_W.x1 - 4 || anchorX > ANCHOR_E.x0 + 4) continue;
          _v1.set(tx + dir * (SHAFT_DEPTH * 0.5 + 0.4), 94 - k * 0.55, z);
          _v2.set(anchorX, EDGE_BEAM_TOP_Y, z);
          pushStrut(stayMats, _v1, _v2, 0.075);
        }
      }
    }
  }

  // (3) 加劲桁架斜撑（X 形交叉网格）
  for (const sz of [-1, 1]) {
    const z = BRIDGE_Z + sz * CABLE_DZ;
    for (let x = ANCHOR_W.x1; x + TRUSS_BAY <= ANCHOR_E.x0 + 0.01; x += TRUSS_BAY) {
      if (Math.abs(x + TRUSS_BAY * 0.5 - TOWER_W_X) < 10) continue;
      if (Math.abs(x + TRUSS_BAY * 0.5 - TOWER_E_X) < 10) continue;
      _v1.set(x, TRUSS_BOTTOM_Y, z);
      _v2.set(x + TRUSS_BAY, TRUSS_TOP_Y, z);
      pushStrut(diagMats, _v1, _v2, 0.13);
      if (LOD.diagPerBay > 1) {
        _v1.set(x, TRUSS_TOP_Y, z);
        _v2.set(x + TRUSS_BAY, TRUSS_BOTTOM_Y, z);
        pushStrut(diagMats, _v1, _v2, 0.13);
      }
    }
  }

  // (4) 步道路灯（灯杆 + 灯头，两侧交替）
  let lampFlip = false;
  for (let x = ANCHOR_W.x1 + 12; x < ANCHOR_E.x0; x += LOD.lampStep) {
    if (Math.abs(x - TOWER_W_X) < WALK_SPLIT_HALF_X + 4) continue;
    if (Math.abs(x - TOWER_E_X) < WALK_SPLIT_HALF_X + 4) continue;
    lampFlip = !lampFlip;
    const z = BRIDGE_Z + (lampFlip ? 1 : -1) * (WALK_HALF_W - 0.6);
    _v1.set(x, WALK_TOP_Y, z);
    _v2.set(x, WALK_TOP_Y + 4.4, z);
    pushStrut(lampPostMats, _v1, _v2, 0.1);
    lampHeadMats.push(new THREE.Matrix4().compose(
      _pos.set(x, WALK_TOP_Y + 4.62, z),
      _quat.identity(),
      _scale.set(0.34, 0.42, 0.34)
    ));
  }

  // (5) 塔顶航空障碍灯
  for (const tx of [TOWER_W_X, TOWER_E_X]) {
    beaconMats.push(new THREE.Matrix4().compose(
      _pos.set(tx, BEACON_Y, BRIDGE_Z),
      _quat.identity(),
      _scale.set(0.95, 0.95, 0.95)
    ));
  }

  /* ---------------- 装配（合并几何 + 实例化，共 11 个 drawcall） ---------------- */

  /**
   * 合并一组几何为一个 Mesh 挂到根节点。
   * @param {THREE.BufferGeometry[]} list 几何数组（合并后被释放）
   * @param {THREE.Material} material 材质
   * @param {string} name 节点名
   * @returns {THREE.Mesh|null}
   */
  const addMerged = (list, material, name) => {
    const g = mergeAndFree(list);
    if (!g) return null;
    g.computeBoundingSphere();
    geometries.push(g);
    const m = new THREE.Mesh(g, material);
    m.name = name;
    root.add(m);
    return m;
  };

  /**
   * 建一个 InstancedMesh 挂到根节点。
   * @param {THREE.BufferGeometry} geo 基准几何
   * @param {THREE.Material} material 材质
   * @param {THREE.Matrix4[]} mats 实例矩阵
   * @param {string} name 节点名
   * @returns {THREE.InstancedMesh|null}
   */
  const addInstanced = (geo, material, mats, name) => {
    if (!mats.length) {
      geo.dispose();
      return null;
    }
    geometries.push(geo);
    const im = new THREE.InstancedMesh(geo, material, mats.length);
    for (let i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
    im.instanceMatrix.needsUpdate = true;
    im.name = name;
    im.computeBoundingSphere();
    root.add(im);
    return im;
  };

  addMerged(stone, stoneMat, 'bridge-masonry');
  addMerged(deck, deckMat, 'bridge-deck');
  addMerged(marks, markMat, 'bridge-markings');
  addMerged(wood, woodMat, 'bridge-promenade');
  addMerged(steel, steelMat, 'bridge-steel');

  // 基准圆柱：半径 1、高 1、原点居中，靠实例矩阵缩放成缆索/杆件
  const strutGeo = () => new THREE.CylinderGeometry(1, 1, 1, quality === 'low' ? 4 : 6, 1, false);
  addInstanced(strutGeo(), steelMat, hangerMats, 'bridge-hangers');
  addInstanced(strutGeo(), steelMat, stayMats, 'bridge-stays');
  addInstanced(strutGeo(), steelMat, diagMats, 'bridge-truss-diagonals');
  addInstanced(strutGeo(), steelMat, lampPostMats, 'bridge-lamp-posts');
  addInstanced(new THREE.SphereGeometry(1, 8, 6), lampMat, lampHeadMats, 'bridge-lamp-heads');
  addInstanced(new THREE.SphereGeometry(1, 8, 6), beaconMat, beaconMats, 'bridge-beacons');

  /* ---------------- 登记高结构（供闪电模块打击） ---------------- */

  if (Array.isArray(ctx.tallStructures)) {
    ctx.tallStructures.push({ x: TOWER_W_X, y: BEACON_Y, z: BRIDGE_Z, name: '东河大桥·西塔' });
    ctx.tallStructures.push({ x: TOWER_E_X, y: BEACON_Y, z: BRIDGE_Z, name: '东河大桥·东塔' });
  }

  /* ---------------- 每帧更新 ---------------- */

  /** 上一帧障碍灯的开关状态（−1 表示尚未初始化），避免每帧重复写 uniform。 */
  let beaconState = -1;
  /** 上一帧路灯亮度，做同样的节流。 */
  let lampLevel = -1;

  /**
   * 每帧更新：塔顶航空障碍灯 1 Hz 闪烁 + 步道路灯随夜色点亮。
   * 只写两个标量 uniform，无分配、无几何重建。
   * @param {Object} frameCtx FrameContext（契约 §2）
   * @returns {void}
   */
  function update(frameCtx) {
    const t = frameCtx && typeof frameCtx.elapsed === 'number' ? frameCtx.elapsed : 0;
    // 1 Hz：每周期前 0.42 s 亮（民航障碍灯的典型占空比）
    const phase = t - Math.floor(t);
    const on = phase < 0.42 ? 1 : 0;
    if (on !== beaconState) {
      beaconState = on;
      beaconMat.emissiveIntensity = on ? 7.5 : 0.06;
    }
    const night = clamp(frameCtx && typeof frameCtx.nightFactor === 'number' ? frameCtx.nightFactor : 0, 0, 1);
    const level = Math.round(night * 20) / 20;
    if (level !== lampLevel) {
      lampLevel = level;
      lampMat.emissiveIntensity = level * 3.6;
    }
  }

  /**
   * 释放本模块自建的全部 geometry / material / texture（共享贴图库不动）。
   * @returns {void}
   */
  function dispose() {
    for (const g of geometries) g.dispose();
    geometries.length = 0;
    for (const m of materials) m.dispose();
    materials.length = 0;
    for (const t of ownTextures) t.dispose();
    ownTextures.length = 0;
    hangerMats.length = 0;
    stayMats.length = 0;
    diagMats.length = 0;
    lampPostMats.length = 0;
    lampHeadMats.length = 0;
    beaconMats.length = 0;
    root.clear();
  }

  const instances = hangerMats.length + stayMats.length + diagMats.length +
    lampPostMats.length + lampHeadMats.length + beaconMats.length;

  return {
    object3D: root,
    update,
    dispose,
    stats: {
      instances,
      draws: root.children.length,
      hangers: hangerMats.length,
      stays: stayMats.length,
      trussDiagonals: diagMats.length
    },
    /** 悬链线求解结果（供调试/测试核对，见文件头注释） */
    catenary: {
      a: MAIN_CATENARY.a,
      halfSpan: HALF_SPAN,
      sag: SAG,
      mainCableLength: MAIN_CATENARY.length,
      sideCableLengthWest: sideW.length,
      sideCableVertexX: sideW.x0,
      hangerMin: Number.isFinite(hangerMin) ? hangerMin : 0,
      hangerMax
    }
  };
}
