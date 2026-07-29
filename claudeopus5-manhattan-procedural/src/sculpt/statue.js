/**
 * @file src/sculpt/statue.js
 * @description 自由岛 + 自由女神像（契约 §5.8）。整座结构完全由代码雕刻生成，
 *              不加载任何外部资产，随机全部来自 `core/rng.js` 的种子流。
 *
 * ---------------------------------------------------------------------------
 * 一、总体尺寸（1 世界单位 = 1 米，Y 轴向上）
 * ---------------------------------------------------------------------------
 *   水面 y = 0
 *   星形要塞（Fort Wood，11 角星）y = -3.5 → 7.6，内部草坪台面 y = 5.5
 *   花岗岩台座 y = 6.3 → 53.3（高 47 m，带线脚、拱廊、齿饰、女儿墙）
 *   铜像       y = 53.3 → 99.3（高 46 m，火炬尖端为最高点）
 *   → 台座底到火炬尖 = 93 m，与真实自由女神像（46 m 像 + 47 m 台座）一致。
 *
 * ---------------------------------------------------------------------------
 * 二、雕刻手法（本模块的核心考点）
 * ---------------------------------------------------------------------------
 * 1. **长袍**：先用 `LatheGeometry` 车削出脚→肩的侧影曲线（下摆外张、腰部收进、
 *    胸部微鼓、肩部急收），轮廓关键点经 Catmull-Rom（Catmull & Rom 1974，见
 *    `core/mathx.js#catmullRom`）重采样成 89 个母线点，得到有收放的剪影。
 *    再对车削结果**逐顶点做径向衣褶位移**：
 *      d(θ, y) = A(y) · [ sgn(s)·|s|^0.66 + 0.23·sin(N₂θ + 1.85σy + 2.1·n_w) ] + sash
 *      s      = sin( N₁θ + σ·y + 1.30·n_w )        N₁ = 17 道主褶，N₂ = 41 道次褶
 *      σ      = 0.105 rad/m                          （沿高度的**螺旋偏移**，模拟垂坠）
 *      n_w    = simplex3( cosθ·1.75, sinθ·1.75, 0.052y )  （**周向噪声调制** → 褶皱宽窄不均）
 *      A(y)   = [0.70·(1 − smoothstep(0,25.5,y)) + 0.15] · (0.78 + 0.34·n_a)
 *               下摆 A ≈ 0.8 m（谷深 0.8 m），胸口 A ≈ 0.15 m，肩部收敛到 0
 *      sash   = 高斯带状凸起，沿 θ + 0.085y 呈斜向缠绕，模拟斜披的希玛纯长袍
 *    噪声按 (cosθ, sinθ) 在单位圆上采样、主褶数取整数，保证 θ=0 与 θ=2π 完全一致，
 *    车削接缝无裂。位移后 `computeVertexNormals()` 并**手工焊接 UV 接缝法线**，
 *    否则接缝处会出现一条硬边。
 * 2. **右臂高举火炬**：肩/肘/腕三点定位（肩部外展、肘部微屈、前臂近垂直上举），
 *    上臂与前臂用分段圆锥（`CylinderGeometry` 上下不同半径）+ 关节球连接，
 *    肩部套一段带褶皱的喇叭袖（同一套褶皱公式，8 道褶）。
 * 3. **左臂抱法典石板**：石板用 `ExtrudeGeometry` + bevel 得到四周斜面，
 *    正面加 7 道浅浮雕刻痕（"JULY IV MDCCLXXVI" 的抽象表达）。
 * 4. **头部**：球体逐顶点位移雕出下巴、鼻梁、鼻头、眉弓、眼窝、嘴唇、颧骨与脑后发髻；
 *    冠冕 = 环带 + 7 道长度不等的放射状尖芒（四棱锥）。
 * 5. **脚下断裂的锁链**：环面链节交替 90° 串接，含一枚断口开环。
 *
 * ---------------------------------------------------------------------------
 * 三、材质
 * ---------------------------------------------------------------------------
 * 铜像用**顶点色**混出铜绿 #4e9b86 与深铜 #7a5c3e：以褶皱位移的相对高低作为
 * "凹凸因子"（谷=0 / 脊=1），叠加两级噪声斑驳与朝上程度（雨水冲刷），
 * 凹处偏绿并额外压暗（AO 感），脊线与外凸边缘露出深铜色；
 * metalness 0.35 / roughness 0.7，另乘一张程序生成的细粒锈斑 DataTexture。
 * 花岗岩用程序生成的颗粒 DataTexture + 三平面投影 UV，保证各面纹理密度一致。
 * 所有实体材质均调用 `patchCityMaterial` 接入全局积雪 / 湿滑 / 闪电响应。
 *
 * ---------------------------------------------------------------------------
 * 四、性能
 * ---------------------------------------------------------------------------
 * 全部几何按材质合并为 5 个 drawcall（花岗岩 / 草坪 / 青铜 / 鎏金 / 火焰），
 * 三角形约 7 万（预算 180k）。`update()` 每帧只改 4 个标量与 2 个灯光强度，
 * 不新建任何对象、不重建几何。
 *
 * 契约差异说明（按 §0 要求就地记录，不改契约）：契约 §5.8 只写了位置 (-1500, 2200)
 * 与"自建岛屿基座地形"，未规定岛屿海拔；本模块取水面 y=0、草坪 y=5.5，
 * 并把 `tallStructures` 的 y 记为火炬尖端 99.3 m。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/rng.js';
import { makeNoise2D, makeNoise3D, fbm2D } from '../core/noise.js';
import { TWO_PI, clamp, lerp, smoothstep, mod, catmullRom } from '../core/mathx.js';
import { patchCityMaterial } from '../render/shaderpatch.js';

/* ==================================================================== *
 * 常量
 * ==================================================================== */

/** 自由岛中心（世界坐标 X） */
const SITE_X = -1500;
/** 自由岛中心（世界坐标 Z） */
const SITE_Z = 2200;

/** 星堡草坪台面高度（水面为 0） */
const GRASS_Y = 5.5;
/** 台座底面高度（草坪上再加一级宽台阶） */
const PEDESTAL_BASE_Y = 6.3;
/** 台座高度（契约 §5.8：花岗岩台座 47 m） */
const PEDESTAL_H = 47;
/** 台座顶面高度 = 铜像脚底 */
const PEDESTAL_TOP_Y = PEDESTAL_BASE_Y + PEDESTAL_H;
/** 铜像高度（脚底 → 火炬尖端） */
const STATUE_H = 46;
/** 火炬尖端世界高度 */
const TOP_Y = PEDESTAL_TOP_Y + STATUE_H;

/**
 * 雕像朝向（绕 Y 轴偏航角，弧度）。模型局部 +Z 为"正面"，
 * −0.78 rad ≈ −44.7° 使正面朝西南，正对 main.js 的 `liberty` 相机预设
 * （相机位于 (−1638, 96, 2338)，恰在雕像西南方）。
 */
const YAW = -0.78;

/** 星堡角数（真实 Fort Wood 为 11 角星） */
const FORT_POINTS = 11;

/** 主衣褶道数（必须为整数，保证车削接缝 θ=0 与 θ=2π 相位一致） */
const FOLD_MAIN = 17;
/** 次级细褶道数（同样必须为整数） */
const FOLD_FINE = 41;
/** 衣褶沿高度的螺旋偏移率（rad/m） */
const FOLD_SPIRAL = 0.105;

/** 铜绿（氧化铜锈） */
const C_PATINA = new THREE.Color(0x4e9b86);
/** 深铜（未氧化 / 磨蚀露出的铜面） */
const C_COPPER = new THREE.Color(0x7a5c3e);
/** 鎏金（火炬） */
const C_GOLD = new THREE.Color(0xd8a33c);
/** 台座花岗岩 */
const C_GRANITE = new THREE.Color(0x9c9890);
/** 要塞花岗岩（更暗更冷，饱经风浪） */
const C_FORT = new THREE.Color(0x7e7b76);
/** 铺装花岗岩 */
const C_PAVING = new THREE.Color(0x8d8a83);
/** 拱廊内壁（背光深色，衬托拱洞进深） */
const C_ARCH_IN = new THREE.Color(0x5d5b57);
/** 草地基色 */
const C_GRASS_A = new THREE.Color(0x486a30);
/** 草地亮色 */
const C_GRASS_B = new THREE.Color(0x6f8c46);
/** 枯草 / 土径 */
const C_GRASS_C = new THREE.Color(0x7b7146);

/** 复用色对象，避免在循环里 new */
const _c = new THREE.Color();
/** 复用向量 */
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
/** +Y 单位向量（肢体定向用） */
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/**
 * 平方。
 * @param {number} v 输入
 * @returns {number} v²
 */
function sq(v) {
  return v * v;
}

/* ==================================================================== *
 * 几何工具
 * ==================================================================== */

/**
 * 保证几何体带索引（`ExtrudeGeometry` 生成的是无索引几何，
 * 而 `mergeGeometries` 要求所有输入的索引状态一致）。
 * @param {THREE.BufferGeometry} geo 几何体
 * @returns {THREE.BufferGeometry} 同一个几何体
 */
function ensureIndexed(geo) {
  if (geo.index === null) {
    const n = geo.attributes.position.count;
    const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    geo.setIndex(new THREE.BufferAttribute(arr, 1));
  }
  return geo;
}

/**
 * 统一属性集合：只保留 position / normal / uv / color，补齐缺失项、清除分组与形变目标。
 * `mergeGeometries` 要求所有几何体的属性名集合完全一致。
 * @param {THREE.BufferGeometry} geo 几何体
 * @returns {THREE.BufferGeometry} 同一个几何体
 */
function normalizeGeo(geo) {
  geo.morphAttributes = {};
  geo.clearGroups();
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') {
      geo.deleteAttribute(name);
    }
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) {
    const n = geo.attributes.position.count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return ensureIndexed(geo);
}

/**
 * 写入统一顶点色。
 * @param {THREE.BufferGeometry} geo 几何体
 * @param {THREE.Color} color 颜色（线性工作色彩空间）
 * @returns {THREE.BufferGeometry} 同一个几何体
 */
function paintUniform(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * 按回调逐顶点写入顶点色。
 * @param {THREE.BufferGeometry} geo 几何体
 * @param {(i:number, pos:THREE.BufferAttribute, nrm:THREE.BufferAttribute, out:THREE.Color)=>void} fn 着色回调
 * @returns {THREE.BufferGeometry} 同一个几何体
 */
function paintByFn(geo, fn) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    fn(i, pos, nrm, _c);
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * 三平面投影 UV：按主法线轴选择投影平面，让盒体 / 车削体 / 挤出体
 * 共用一张平铺贴图时纹理密度完全一致（避免 BoxGeometry 的 0..1 拉伸）。
 * @param {THREE.BufferGeometry} geo 几何体（须已在最终局部坐标下）
 * @param {number} scale 每米对应的 UV 单位数
 * @returns {THREE.BufferGeometry} 同一个几何体
 */
function applyTriplanarUV(geo, scale) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = x * scale;
      v = z * scale;
    } else if (ax >= az) {
      u = z * scale;
      v = y * scale;
    } else {
      u = x * scale;
      v = y * scale;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * 把几何体规范化、着色、投影 UV、施加变换后收进合并列表。
 * @param {THREE.BufferGeometry[]} list 目标列表
 * @param {THREE.BufferGeometry} geo 几何体
 * @param {Object} [opts] 选项
 * @param {number} [opts.uvScale] 三平面 UV 密度（每米 UV 数）
 * @param {THREE.Color} [opts.color] 统一顶点色
 * @param {Function} [opts.colorFn] 逐顶点着色回调（优先于 color）
 * @param {THREE.Matrix4} [opts.matrix] 最终变换
 * @returns {void}
 */
function addPart(list, geo, opts = {}) {
  normalizeGeo(geo);
  if (opts.uvScale) applyTriplanarUV(geo, opts.uvScale);
  if (opts.colorFn) paintByFn(geo, opts.colorFn);
  else if (opts.color) paintUniform(geo, opts.color);
  else if (!geo.attributes.color) paintUniform(geo, C_PATINA);
  if (opts.matrix) geo.applyMatrix4(opts.matrix);
  list.push(geo);
}

/**
 * 焊接一对顶点的法线（用于车削 / 球体的 UV 接缝：位置重合但索引不同，
 * `computeVertexNormals` 只能各自累加半边邻面，直接渲染会出现硬接缝）。
 * @param {THREE.BufferAttribute} nrm 法线属性
 * @param {number} a 顶点索引 A
 * @param {number} b 顶点索引 B
 * @returns {void}
 */
function weldNormalPair(nrm, a, b) {
  let nx = nrm.getX(a) + nrm.getX(b);
  let ny = nrm.getY(a) + nrm.getY(b);
  let nz = nrm.getZ(a) + nrm.getZ(b);
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-8) return;
  nx /= l;
  ny /= l;
  nz /= l;
  nrm.setXYZ(a, nx, ny, nz);
  nrm.setXYZ(b, nx, ny, nz);
}

/**
 * 焊接 `LatheGeometry` 的环向接缝法线。
 * 顶点排布（three r185 `LatheGeometry`）：index = i·pointCount + j，i∈[0,segments]。
 * @param {THREE.BufferGeometry} geo 车削几何体
 * @param {number} segments 环向分段
 * @param {number} pointCount 母线点数
 * @returns {void}
 */
function weldLatheSeam(geo, segments, pointCount) {
  const nrm = geo.attributes.normal;
  const base = segments * pointCount;
  for (let j = 0; j < pointCount; j++) weldNormalPair(nrm, j, base + j);
  nrm.needsUpdate = true;
}

/**
 * 焊接 `SphereGeometry` / 开口 `CylinderGeometry` 的经线接缝法线。
 * 顶点排布：index = row·(cols+1) + col，接缝为 col=0 与 col=cols。
 * @param {THREE.BufferGeometry} geo 几何体
 * @param {number} cols 环向分段（widthSegments / radialSegments）
 * @param {number} rows 纵向分段（heightSegments）
 * @returns {void}
 */
function weldGridSeam(geo, cols, rows) {
  const nrm = geo.attributes.normal;
  const stride = cols + 1;
  for (let r = 0; r <= rows; r++) weldNormalPair(nrm, r * stride, r * stride + cols);
  nrm.needsUpdate = true;
}

/**
 * 用 Catmull-Rom 样条把 [高度, 半径] 关键点重采样成车削母线。
 * @param {Array<[number, number]>} keys 关键点 [y, r]，按 y 递增
 * @param {number} subdiv 每段细分数
 * @returns {THREE.Vector2[]} 母线点（x = 半径，y = 高度）
 */
function resampleProfile(keys, subdiv) {
  const out = [];
  const n = keys.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = keys[Math.max(0, i - 1)];
    const p1 = keys[i];
    const p2 = keys[i + 1];
    const p3 = keys[Math.min(n - 1, i + 2)];
    for (let s = 0; s < subdiv; s++) {
      const t = s / subdiv;
      const r = catmullRom(p0[1], p1[1], p2[1], p3[1], t);
      const y = catmullRom(p0[0], p1[0], p2[0], p3[0], t);
      out.push(new THREE.Vector2(Math.max(0, r), y));
    }
  }
  out.push(new THREE.Vector2(Math.max(0, keys[n - 1][1]), keys[n - 1][0]));
  return out;
}

/**
 * 四棱台（正方形收分体）。用 4 边形柱体后转平面着色，得到锐利的石材棱角。
 * @param {number} hwBottom 底面半宽（米）
 * @param {number} hwTop 顶面半宽（米）
 * @param {number} y0 底面高度
 * @param {number} y1 顶面高度
 * @returns {THREE.BufferGeometry} 几何体
 */
function squareFrustum(hwBottom, hwTop, y0, y1) {
  const h = y1 - y0;
  const SQ2 = Math.SQRT2;
  const src = new THREE.CylinderGeometry(hwTop * SQ2, hwBottom * SQ2, h, 4, 1, false, Math.PI / 4);
  const g = src.toNonIndexed();
  src.dispose();
  g.computeVertexNormals();
  g.translate(0, y0 + h / 2, 0);
  return g;
}

/**
 * 轴对齐方盒（按上下高度指定）。
 * @param {number} hw 半宽（X/Z 方向）
 * @param {number} y0 底面高度
 * @param {number} y1 顶面高度
 * @param {number} [hd=hw] Z 方向半宽（默认与 X 相同）
 * @param {number} [cx=0] 中心 X
 * @param {number} [cz=0] 中心 Z
 * @returns {THREE.BufferGeometry} 几何体
 */
function slabBox(hw, y0, y1, hd = hw, cx = 0, cz = 0) {
  const g = new THREE.BoxGeometry(hw * 2, y1 - y0, hd * 2);
  g.translate(cx, (y0 + y1) / 2, cz);
  return g;
}

/**
 * 分段圆锥肢体：沿 p0→p1 生成上下不同半径的锥台。
 * @param {THREE.Vector3} p0 起点（半径 r0）
 * @param {THREE.Vector3} p1 终点（半径 r1）
 * @param {number} r0 起点半径
 * @param {number} r1 终点半径
 * @param {number} seg 环向分段
 * @returns {THREE.BufferGeometry} 几何体
 */
function limbGeo(p0, p1, r0, r1, seg) {
  _v0.subVectors(p1, p0);
  const len = _v0.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  _v0.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(AXIS_Y, _v0);
  g.applyQuaternion(q);
  g.translate(p0.x, p0.y, p0.z);
  return g;
}

/**
 * 关节球。
 * @param {THREE.Vector3} p 球心
 * @param {number} r 半径
 * @param {number} seg 分段
 * @returns {THREE.BufferGeometry} 几何体
 */
function jointGeo(p, r, seg) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)));
  g.translate(p.x, p.y, p.z);
  return g;
}

/* ==================================================================== *
 * 程序化贴图（DataTexture，无 DOM、无外部文件）
 * ==================================================================== */

/**
 * 生成可无缝平铺的 2D 值：把噪声在瓦片四角做双线性交叉淡化
 * （经典 seamless-tile blend），保证 u=0 与 u=1、v=0 与 v=1 完全对齐。
 * @param {(x:number,y:number)=>number} n2 simplex 采样器
 * @param {number} x 像素 X
 * @param {number} y 像素 Y
 * @param {number} size 瓦片尺寸（像素）
 * @param {number} freq 频率（每像素）
 * @param {number} octaves 倍频数
 * @returns {number} [-1,1]
 */
function tileableFbm(n2, x, y, size, freq, octaves) {
  const o = { octaves, lacunarity: 2, gain: 0.5, frequency: freq };
  const u = x / size;
  const v = y / size;
  const a = fbm2D(n2, x, y, o);
  const b = fbm2D(n2, x - size, y, o);
  const c = fbm2D(n2, x, y - size, o);
  const d = fbm2D(n2, x - size, y - size, o);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/**
 * 整数像素格哈希（天然按瓦片周期，无缝）。
 * @param {number} x 像素 X
 * @param {number} y 像素 Y
 * @param {number} seed 种子
 * @returns {number} [0,1)
 */
function pixelHash(x, y, seed) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * 通用 DataTexture 构造（sRGB 颜色贴图，各向异性 4，重复平铺 + mipmap）。
 * @param {Uint8Array} data RGBA 数据
 * @param {number} size 边长
 * @returns {THREE.DataTexture} 贴图
 */
function makeColorTexture(data, size) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 花岗岩颗粒贴图：中频斑纹（无缝 fBm）+ 高频石英颗粒（像素哈希）。
 * @param {(x:number,y:number)=>number} n2 噪声采样器
 * @param {number} seed 颗粒哈希种子
 * @param {number} [size=256] 边长
 * @returns {THREE.DataTexture} 贴图
 */
function makeGraniteTexture(n2, seed, size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const band = tileableFbm(n2, x, y, size, 0.028, 4);
      const grain = pixelHash(x, y, seed);
      const spot = pixelHash(x + 977, y + 313, seed ^ 0x5bd1) > 0.965 ? -0.22 : 0;
      let v = 0.70 + 0.11 * band + 0.17 * (grain - 0.5) + spot;
      v = clamp(v, 0.08, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(v * 255);
      data[i + 1] = Math.round(v * 252);
      data[i + 2] = Math.round(v * 245);
      data[i + 3] = 255;
    }
  }
  return makeColorTexture(data, size);
}

/**
 * 铜锈细粒贴图：接近中性（均值 ≈ 0.92）以免压过顶点色，
 * 只提供近距离观察时的锈斑与麻点细节，带轻微绿偏。
 * @param {(x:number,y:number)=>number} n2 噪声采样器
 * @param {number} seed 颗粒哈希种子
 * @param {number} [size=256] 边长
 * @returns {THREE.DataTexture} 贴图
 */
function makePatinaTexture(n2, seed, size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const blob = tileableFbm(n2, x, y, size, 0.020, 4);
      const fine = tileableFbm(n2, x + 512, y - 128, size, 0.11, 2);
      const grain = pixelHash(x, y, seed);
      const v = clamp(0.92 + 0.10 * blob + 0.05 * fine + 0.055 * (grain - 0.5), 0.55, 1);
      const g = clamp(v + 0.035 * blob, 0.55, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(v * 249);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(v * 244);
      data[i + 3] = 255;
    }
  }
  return makeColorTexture(data, size);
}

/* ==================================================================== *
 * 星形要塞（Fort Wood）
 * ==================================================================== */

/**
 * 星形多边形在给定极角上的半径（顶点半径按边线性插值）。
 * @param {number} a 极角（弧度，形状平面）
 * @param {number} points 角数
 * @param {number} rOut 外接半径
 * @param {number} rIn 内接半径
 * @returns {number} 半径（米）
 */
function starRadiusAt(a, points, rOut, rIn) {
  const n = points * 2;
  const seg = TWO_PI / n;
  const k = mod(a, TWO_PI) / seg;
  const i = Math.floor(k);
  const f = k - i;
  const ra = i % 2 === 0 ? rOut : rIn;
  const rb = i % 2 === 0 ? rIn : rOut;
  return lerp(ra, rb, f);
}

/**
 * 生成星形轮廓路径点。
 * @param {number} points 角数
 * @param {number} rOut 外接半径
 * @param {number} rIn 内接半径
 * @param {number} rot 起始旋转（弧度）
 * @returns {Array<[number, number]>} XY 平面点列
 */
function starPoints(points, rOut, rIn, rot) {
  const n = points * 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TWO_PI;
    const r = i % 2 === 0 ? rOut : rIn;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/**
 * 星形 `THREE.Shape`（可选内孔，用于胸墙环）。
 * @param {number} points 角数
 * @param {number} rOut 外接半径
 * @param {number} rIn 内接半径
 * @param {number} rot 起始旋转
 * @param {?{rOut:number, rIn:number}} hole 内孔星形半径（null 表示实心）
 * @returns {THREE.Shape} 形状
 */
function starShape(points, rOut, rIn, rot, hole) {
  const shape = new THREE.Shape();
  const pts = starPoints(points, rOut, rIn, rot);
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  if (hole) {
    const hp = starPoints(points, hole.rOut, hole.rIn, rot);
    const path = new THREE.Path();
    path.moveTo(hp[0][0], hp[0][1]);
    for (let i = 1; i < hp.length; i++) path.lineTo(hp[i][0], hp[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

/**
 * 把 XY 平面的形状挤出成一段水平石砌体（形状平面 → XZ，挤出方向 → +Y）。
 * 旋转 −90°(X) 后：形状 (sx, sy) → 世界 (sx, 0, −sy)，挤出 +Z → +Y。
 * @param {THREE.Shape} shape 形状
 * @param {number} y0 底面高度
 * @param {number} y1 顶面高度
 * @returns {THREE.BufferGeometry} 几何体
 */
function extrudeSlab(shape, y0, y1) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: y1 - y0,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 6
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/* ==================================================================== *
 * 衣褶（本模块核心）
 * ==================================================================== */

/**
 * 长袍衣褶径向位移（公式见文件头注释）。
 *
 * 设计要点：
 * - 主褶 `FOLD_MAIN` 与次褶 `FOLD_FINE` 均取整数 → sin 对 θ 以 2π 为周期，
 *   车削接缝（θ=0 / θ=2π）完全重合；
 * - 噪声按 (cosθ, sinθ) 在单位圆上采样 → 天然周期，用来**扰动相位**（褶皱宽窄不均）
 *   与**调制幅度**（褶皱深浅不均）；
 * - `sgn(s)·|s|^0.66` 让褶谷更尖、褶脊更圆，接近真实布料的折痕断面；
 * - 相位随高度线性偏移 `FOLD_SPIRAL·y` → 褶皱沿高度轻微螺旋，模拟垂坠扭转。
 *
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {number} theta 环向角（rad）
 * @param {number} y 局部高度（m）
 * @returns {{disp:number, amp:number}} disp = 径向位移（m），amp = 当前局部幅度（用于归一化着色）
 */
function robeFold(n3, theta, y) {
  const cx = Math.cos(theta);
  const sz = Math.sin(theta);
  // 相位扰动噪声 → 褶皱宽窄不均
  const nWarp = n3(cx * 1.75, sz * 1.75, y * 0.052);
  // 幅度调制噪声 → 褶皱深浅不均
  const nAmp = n3(cx * 2.6 + 9.7, sz * 2.6 - 5.3, y * 0.086);
  const spiral = FOLD_SPIRAL * y;

  const s = Math.sin(FOLD_MAIN * theta + spiral + 1.30 * nWarp);
  const primary = Math.sign(s) * Math.pow(Math.abs(s), 0.66);
  const fine = Math.sin(FOLD_FINE * theta + spiral * 1.85 + 2.1 * nWarp);

  // 下摆 ≈ 0.85 m，胸口 ≈ 0.15 m，肩部收敛到 0
  let amp = (0.70 * (1 - smoothstep(0, 25.5, y)) + 0.15) * (0.78 + 0.34 * nAmp);
  amp *= 1 - smoothstep(25.6, 28.8, y);

  // 斜披（himation）：沿 θ + 0.085y 缠绕的高斯凸带
  const sashPhase = mod(theta + 0.085 * y - 2.05 + Math.PI, TWO_PI) - Math.PI;
  const sash =
    0.42 * Math.exp(-sq(sashPhase) / (2 * 0.40 * 0.40)) *
    smoothstep(1.2, 7.0, y) * (1 - smoothstep(19, 26.5, y));

  return { disp: amp * (primary + 0.23 * fine) + sash, amp: Math.max(amp * 1.23, 1e-4) };
}

/**
 * 青铜表面着色：铜绿 ↔ 深铜混合 + AO 感压暗。
 * 凹处（ridge→0）更绿更暗，凸脊与朝上磨蚀面露出深铜色。
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {number} x 局部 X
 * @param {number} y 局部 Y
 * @param {number} z 局部 Z
 * @param {number} ny 法线 Y 分量（朝上程度）
 * @param {number} ridge 凹凸因子 0(谷)..1(脊)
 * @param {THREE.Color} out 输出颜色
 * @returns {void}
 */
function bronzeColor(n3, x, y, z, ny, ridge, out) {
  const blotch = 0.5 + 0.5 * n3(x * 0.17, y * 0.17, z * 0.17);
  const fine = 0.5 + 0.5 * n3(x * 0.62, y * 0.62, z * 0.62);
  // 竖向水痕：Y 频率远低于 XZ → 形成顺流而下的条纹
  const streak = 0.5 + 0.5 * n3(x * 0.55 + 21.7, y * 0.035, z * 0.55 - 8.4);
  const exposure = 0.5 + 0.5 * ny;

  let t = 0.46 * ridge + 0.20 * blotch + 0.12 * fine + 0.16 * exposure + 0.14 * streak - 0.44;
  t = smoothstep(0.02, 0.46, t);
  out.copy(C_PATINA).lerp(C_COPPER, t);

  // AO 感：褶谷压暗，脊线提亮
  const shade = (0.70 + 0.34 * ridge) * (0.93 + 0.14 * blotch);
  out.multiplyScalar(shade * 1.08);
}

/* ==================================================================== *
 * 主工厂
 * ==================================================================== */

/**
 * 创建自由岛与自由女神像（契约 §5.8）。
 * @param {{plan?:Object, heightField?:Object, rng?:Object, textures?:Object, env?:Object, quality?:string, seed?:(string|number), tallStructures?:Array}} ctx0 构建期上下文
 * @returns {{object3D: THREE.Group, torchLight: THREE.PointLight, update: Function, dispose: Function, stats: Object}} 系统句柄
 */
export function createStatue(ctx0) {
  const cfg = ctx0 || {};
  const rng =
    cfg.rng && typeof cfg.rng.fork === 'function'
      ? cfg.rng.fork('statue')
      : makeRng(cfg.seed === undefined ? 'liberty' : cfg.seed, 'statue');
  const quality = cfg.quality === 'low' || cfg.quality === 'medium' ? cfg.quality : 'high';
  const env = cfg.env || null;

  const noiseSeed = rng.int(1, 0x7ffffffe);
  const n3 = makeNoise3D(noiseSeed);
  const n2 = makeNoise2D(noiseSeed ^ 0x51ab);

  /** 环向分段（衣褶清晰度的关键：每道主褶至少 8 段） */
  const robeSegments = quality === 'low' ? 128 : quality === 'medium' ? 192 : 256;
  const limbSeg = quality === 'low' ? 10 : 16;
  const headSeg = quality === 'low' ? 24 : quality === 'medium' ? 32 : 44;

  /** 站址总变换：先绕 Y 偏航，再平移到自由岛中心 */
  const M = new THREE.Matrix4().makeRotationY(YAW);
  M.setPosition(SITE_X, 0, SITE_Z);

  /** 各材质的几何收集列表 */
  const graniteGeos = [];
  const grassGeos = [];
  const bronzeGeos = [];
  const goldGeos = [];

  /**
   * 把"铜像局部坐标"（脚底为 y=0）的几何抬到岛屿坐标后收集。
   * @param {THREE.BufferGeometry[]} list 目标列表
   * @param {THREE.BufferGeometry} geo 几何体
   * @param {Object} [opts] addPart 选项
   * @returns {void}
   */
  const addStatuePart = (list, geo, opts = {}) => {
    geo.translate(0, PEDESTAL_TOP_Y, 0);
    addPart(list, geo, Object.assign({ matrix: M }, opts));
  };

  buildIsland(graniteGeos, grassGeos, n2, rng);
  buildPedestal(graniteGeos, rng);
  const robeTop = buildRobe(bronzeGeos, n3, robeSegments, addStatuePart);
  buildHeadAndCrown(bronzeGeos, n3, headSeg, rng, addStatuePart, robeTop);
  const torch = buildRightArm(bronzeGeos, goldGeos, n3, limbSeg, addStatuePart);
  buildLeftArm(bronzeGeos, n3, limbSeg, addStatuePart);
  buildChains(bronzeGeos, n3, rng, addStatuePart);

  /* ---------------- 材质 ---------------- */

  const graniteTex = makeGraniteTexture(n2, rng.int(1, 0x7ffffffe));
  const patinaTex = makePatinaTexture(n2, rng.int(1, 0x7ffffffe));

  const graniteMat = new THREE.MeshStandardMaterial({
    map: graniteTex,
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.02
  });
  const grassMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    map: patinaTex,
    vertexColors: true,
    roughness: 0.70,
    metalness: 0.35
  });
  const goldMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.28,
    metalness: 0.95,
    emissive: new THREE.Color(0x6b4a12),
    emissiveIntensity: 0.0
  });
  // 火焰：加性混合的自发光壳体，不接入城市天气注入（火焰不该积雪 / 反湿）
  const flameMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    // 加性混合下若参与雾计算，会把雾色整片加到火焰轮廓上形成亮斑，故关闭
    fog: false
  });

  if (env) {
    patchCityMaterial(graniteMat, env, { snowAmount: 1.0, wetDarken: 0.34, puddles: false });
    patchCityMaterial(grassMat, env, { snowAmount: 1.0, wetDarken: 0.30, puddles: true });
    patchCityMaterial(bronzeMat, env, { snowAmount: 0.45, wetDarken: 0.22, puddles: false });
    patchCityMaterial(goldMat, env, { snow: false, wetDarken: 0.15, puddles: false });
  }

  /* ---------------- 合并与网格 ---------------- */

  const root = new THREE.Group();
  root.name = 'statue';

  const meshes = [];
  const geometries = [];

  /**
   * 合并一组几何体并生成网格。
   * @param {THREE.BufferGeometry[]} list 几何列表
   * @param {THREE.Material} material 材质
   * @param {string} name 节点名
   * @returns {?THREE.Mesh} 网格（列表为空时返回 null）
   */
  const buildMesh = (list, material, name) => {
    if (list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    list.length = 0;
    if (!merged) return null;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    root.add(mesh);
    meshes.push(mesh);
    geometries.push(merged);
    return mesh;
  };

  buildMesh(graniteGeos, graniteMat, 'statue-granite');
  buildMesh(grassGeos, grassMat, 'statue-grass');
  buildMesh(bronzeGeos, bronzeMat, 'statue-bronze');
  buildMesh(goldGeos, goldMat, 'statue-gold');

  /* ---------------- 火焰（独立变换，便于摇曳动画） ---------------- */

  // 火焰几何以火盆口为原点，网格自身带位置/旋转/缩放：
  // 若把火焰烘进世界坐标，update 里的 rotation/scale 会绕世界原点作用。
  const flameGeo = normalizeGeo(torch.flameGeo);
  geometries.push(flameGeo);
  const flameMesh = new THREE.Mesh(flameGeo, flameMat);
  flameMesh.name = 'statue-flame';
  _v0.copy(torch.flameLocal);
  _v0.y += PEDESTAL_TOP_Y;
  _v0.applyMatrix4(M);
  flameMesh.position.copy(_v0);
  flameMesh.rotation.y = YAW;
  flameMesh.matrixAutoUpdate = true;
  // 透明加性材质若参与阴影会投出实心黑影；用 alphaTest=1 的深度材质彻底跳过。
  // （main.js 的 mount() 会把所有 Mesh 的 castShadow 置 true，无法从外部关闭。）
  const flameDepthMat = new THREE.MeshDepthMaterial({ opacity: 0, transparent: true, alphaTest: 1 });
  flameMesh.customDepthMaterial = flameDepthMat;
  root.add(flameMesh);
  meshes.push(flameMesh);

  /* ---------------- 灯光 ---------------- */

  /** 火炬点光源（契约要求导出 handle.torchLight） */
  const torchLight = new THREE.PointLight(0xffb160, 0, 340, 2);
  torchLight.position.copy(_v0);
  torchLight.position.y += 1.5;
  torchLight.name = 'statue-torch-light';
  root.add(torchLight);

  // 夜间泛光灯：立于雕像正前方的草坪上，向上照亮正面
  _v1.set(0, 0, 1).applyAxisAngle(AXIS_Y, YAW); // 世界空间"正面"方向
  const floodLight = new THREE.SpotLight(0xfff0d2, 0, 260, 0.40, 0.62, 2);
  floodLight.position.set(
    SITE_X + _v1.x * 46,
    GRASS_Y + 2.2,
    SITE_Z + _v1.z * 46
  );
  floodLight.name = 'statue-flood-light';
  const floodTarget = new THREE.Object3D();
  floodTarget.position.set(SITE_X, PEDESTAL_TOP_Y + 20, SITE_Z);
  floodLight.target = floodTarget;
  root.add(floodLight);
  root.add(floodTarget);

  /* ---------------- 登记高结构（供闪电模块打击） ---------------- */

  if (Array.isArray(cfg.tallStructures)) {
    cfg.tallStructures.push({ x: SITE_X, y: TOP_Y, z: SITE_Z, name: '自由女神像' });
  }

  /* ---------------- 统计 ---------------- */

  let triangles = 0;
  for (const g of geometries) {
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  const stats = { draws: meshes.length, triangles: Math.round(triangles) };

  /* ---------------- 每帧更新 ---------------- */

  const flameBase = new THREE.Color(1, 1, 1);
  let disposed = false;

  /**
   * 每帧更新：火焰摇曳（缩放 / 颜色微动）、火炬与泛光灯随昼夜变化。
   * 只做标量与两个灯光强度的写入，不新建对象、不重建几何。
   * @param {{elapsed:number, nightFactor:number}} ctx 帧上下文（契约 §2）
   * @returns {void}
   */
  const update = (ctx) => {
    if (disposed || !ctx) return;
    const t = typeof ctx.elapsed === 'number' ? ctx.elapsed : 0;
    const night = clamp(typeof ctx.nightFactor === 'number' ? ctx.nightFactor : 0, 0, 1);

    // 三路不同频正弦叠加 → 非周期观感的火苗抖动
    const w = 0.50 * Math.sin(t * 3.10 + 0.7) + 0.30 * Math.sin(t * 5.70 + 2.1) +
      0.20 * Math.sin(t * 11.30 + 4.3);
    flameMesh.scale.set(1 + 0.06 * Math.sin(t * 4.3), 1 + 0.10 * w, 1 + 0.06 * Math.cos(t * 3.7 + 1.1));
    flameMesh.rotation.y = YAW + 0.13 * Math.sin(t * 1.7);
    flameMesh.rotation.z = 0.05 * Math.sin(t * 2.3 + 0.9);

    // 材质基色微动（乘在顶点色上）：夜间更亮、白天收敛以免过曝
    const glow = lerp(0.72, 1.30, night) * (0.90 + 0.13 * w);
    flameBase.setRGB(glow, glow * 0.965, glow * 0.90);
    flameMat.color.copy(flameBase);

    torchLight.intensity = lerp(110, 780, night) * (0.88 + 0.14 * w);
    floodLight.intensity = 4200 * night;
    goldMat.emissiveIntensity = 0.35 * night;
  };

  /**
   * 释放本模块自建的全部几何 / 材质 / 贴图。
   * @returns {void}
   */
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const g of geometries) g.dispose();
    geometries.length = 0;
    graniteMat.dispose();
    grassMat.dispose();
    bronzeMat.dispose();
    goldMat.dispose();
    flameMat.dispose();
    flameDepthMat.dispose();
    graniteTex.dispose();
    patinaTex.dispose();
    torchLight.dispose();
    floodLight.dispose();
    root.clear();
    meshes.length = 0;
  };

  return { object3D: root, torchLight, update, dispose, stats };
}

/* ==================================================================== *
 * §1 自由岛：星形要塞 + 草坪
 * ==================================================================== */

/**
 * 建造自由岛（Fort Wood 星形要塞基座 + 内部草坪 + 铺装广场）。
 *
 * 要塞按三级收分砌体叠砌（模拟海防炮台的收分墙体），顶部再加一圈
 * 沿星形轮廓的胸墙（`Shape` + 星形内孔挤出）。草坪用极坐标网格生成，
 * 外边界半径直接取星形轮廓函数，因此草坪严丝合缝地填满堡垒内院。
 *
 * @param {THREE.BufferGeometry[]} graniteGeos 花岗岩几何收集列表
 * @param {THREE.BufferGeometry[]} grassGeos 草坪几何收集列表
 * @param {(x:number,y:number)=>number} n2 2D simplex 采样器
 * @param {Object} rng 种子 RNG
 * @returns {void}
 */
function buildIsland(graniteGeos, grassGeos, n2, rng) {
  const M = new THREE.Matrix4().makeRotationY(YAW);
  M.setPosition(SITE_X, 0, SITE_Z);
  const rot = rng.range(0, TWO_PI / (FORT_POINTS * 2));
  const P = FORT_POINTS;

  // 三级收分砌体：海堤 → 中段 → 顶层（顶面即草坪台面）
  addPart(graniteGeos, extrudeSlab(starShape(P, 66.5, 46.5, rot, null), -3.5, 1.0), {
    uvScale: 0.14, color: C_FORT, matrix: M
  });
  addPart(graniteGeos, extrudeSlab(starShape(P, 64.5, 45.0, rot, null), 1.0, 3.2), {
    uvScale: 0.14, color: C_FORT, matrix: M
  });
  addPart(graniteGeos, extrudeSlab(starShape(P, 63.0, 43.8, rot, null), 3.2, GRASS_Y), {
    uvScale: 0.14, color: C_FORT, matrix: M
  });

  // 胸墙：沿星形轮廓的环带（外星形 − 内星形孔）
  addPart(
    graniteGeos,
    extrudeSlab(starShape(P, 62.0, 43.0, rot, { rOut: 56.0, rIn: 37.4 }), GRASS_Y, 7.6),
    { uvScale: 0.16, color: C_FORT, matrix: M }
  );

  // 中央铺装广场 + 台座下的一级宽台阶
  const plaza = new THREE.CylinderGeometry(19.5, 19.8, 0.28, 40, 1, false);
  plaza.translate(0, GRASS_Y + 0.14, 0);
  addPart(graniteGeos, plaza, { uvScale: 0.20, color: C_PAVING, matrix: M });
  addPart(graniteGeos, slabBox(14.0, GRASS_Y + 0.2, PEDESTAL_BASE_Y), {
    uvScale: 0.20, color: C_PAVING, matrix: M
  });

  // 草坪（极坐标网格，外边界贴合星形内院）
  const grass = buildGrassGeometry(
    n2,
    (a) => starRadiusAt(a, P, 54.5, 35.8) - 0,
    9,
    P * 8,
    18.8,
    rot
  );
  addPart(grassGeos, grass, {
    matrix: M,
    colorFn: (i, pos, nrm, out) => {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const patch = 0.5 + 0.5 * fbm2D(n2, x * 0.035, z * 0.035, { octaves: 3 });
      const fine = 0.5 + 0.5 * fbm2D(n2, x * 0.42, z * 0.42, { octaves: 2 });
      out.copy(C_GRASS_A).lerp(C_GRASS_B, clamp(patch * 0.85 + fine * 0.25 - 0.12, 0, 1));
      // 环绕广场的踩踏土径：半径 21~25 m 的一圈
      const r = Math.hypot(x, z);
      const path = smoothstep(20.5, 22.5, r) * (1 - smoothstep(24.5, 26.8, r));
      out.lerp(C_GRASS_C, path * 0.75);
      out.multiplyScalar(0.88 + 0.20 * fine);
    }
  });
}

/**
 * 极坐标草坪网格：从内半径到星形外边界均匀铺 rings×sectors 个四边形，
 * 顶点高度由两级 fBm 起伏，靠近胸墙时收敛回台面高度以免穿插。
 * @param {(x:number,y:number)=>number} n2 2D simplex 采样器
 * @param {(a:number)=>number} radiusFn 外边界半径函数（形状平面极角）
 * @param {number} rings 径向环数
 * @param {number} sectors 环向段数
 * @param {number} rInner 内半径（广场边缘）
 * @param {number} rot 星形起始旋转
 * @returns {THREE.BufferGeometry} 几何体
 */
function buildGrassGeometry(n2, radiusFn, rings, sectors, rInner, rot) {
  const positions = new Float32Array((rings + 1) * (sectors + 1) * 3);
  const uvs = new Float32Array((rings + 1) * (sectors + 1) * 2);
  const indices = [];
  let p = 0;
  let q = 0;
  for (let i = 0; i <= rings; i++) {
    const fr = i / rings;
    for (let j = 0; j <= sectors; j++) {
      const a = rot + (j / sectors) * TWO_PI;
      const rr = lerp(rInner, radiusFn(a), fr);
      const x = Math.cos(a) * rr;
      const z = -Math.sin(a) * rr;
      // 偏置到全正，保证草坪永不低于要塞顶面（否则会沉进花岗岩里露出石面）
      const h =
        0.50 +
        0.34 * fbm2D(n2, x * 0.032, z * 0.032, { octaves: 3 }) +
        0.11 * fbm2D(n2, x * 0.15, z * 0.15, { octaves: 2 });
      // 内外两端各收敛回台面，避免与铺装 / 胸墙穿插
      const fade = smoothstep(0, 0.16, fr) * (1 - smoothstep(0.86, 1, fr));
      positions[p++] = x;
      positions[p++] = GRASS_Y + 0.08 + h * fade;
      positions[p++] = z;
      uvs[q++] = x * 0.06;
      uvs[q++] = z * 0.06;
    }
  }
  const stride = sectors + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ==================================================================== *
 * §2 花岗岩台座（47 m，带装饰线脚与拱门）
 * ==================================================================== */

/**
 * 建造 Richard Morris Hunt 式的方锥形花岗岩台座（局部高 47 m）。
 *
 * 层次（相对台座底面）：
 *   0.0–3.2   基座方台        3.2–4.0   过渡线脚
 *   4.0–12.6  下段收分墙      12.6–13.5 挑檐线脚
 *   13.5–27.6 **拱廊段**：4 面各 3 个半圆拱洞（`Shape` 挖孔 + `ExtrudeGeometry`
 *             倒角挤出，得到真实的拱券进深与斜面），内衬深色核心墙、四角设隅石墩
 *   26.9–27.6 齿饰（dentil）小方块阵列
 *   27.6–28.9 上层挑檐        28.9–40.2 直筒柱身（每面 3 条壁柱）
 *   40.2–41.8 主檐口          41.8–44.6 女儿墙（四面薄墙围合的观景平台）
 *   44.6–47.0 顶部收分承台（承接铜像下摆）
 *
 * @param {THREE.BufferGeometry[]} out 花岗岩几何收集列表
 * @param {Object} rng 种子 RNG
 * @returns {void}
 */
function buildPedestal(out, rng) {
  const M = new THREE.Matrix4().makeRotationY(YAW);
  M.setPosition(SITE_X, 0, SITE_Z);
  const B = PEDESTAL_BASE_Y;
  const tint = new THREE.Color();
  /**
   * 收集一块花岗岩构件。每块石材按种子做 ±6% 的明度抖动，
   * 让砌体呈现逐块风化色差，而不是一整片死板的同色。
   * @param {THREE.BufferGeometry} g 几何体
   * @param {THREE.Color} [color] 覆盖基色
   * @returns {void}
   */
  const push = (g, color) => {
    tint.copy(color || C_GRANITE).multiplyScalar(rng.range(0.94, 1.06));
    addPart(out, g, { uvScale: 0.16, color: tint, matrix: M });
  };

  // —— 基座与下段 ——
  push(slabBox(12.4, B + 0.0, B + 3.2));
  push(slabBox(11.7, B + 3.2, B + 4.0));
  push(squareFrustum(11.2, 9.9, B + 4.0, B + 12.6));
  push(slabBox(10.35, B + 12.6, B + 13.5));

  // —— 拱廊段 ——
  push(slabBox(8.1, B + 13.5, B + 27.6), C_ARCH_IN);
  const panelProto = buildArchPanel();
  for (let f = 0; f < 4; f++) {
    const g = panelProto.clone();
    const ang = (f * Math.PI) / 2;
    if (ang !== 0) g.rotateY(ang);
    const dx = Math.sin(ang) * 8.2;
    const dz = Math.cos(ang) * 8.2;
    g.translate(dx, B + 13.5, dz);
    push(g);
  }
  panelProto.dispose();
  for (let f = 0; f < 4; f++) {
    const sx = f === 0 || f === 3 ? 8.75 : -8.75;
    const sz = f === 0 || f === 1 ? 8.75 : -8.75;
    push(slabBox(1.15, B + 13.3, B + 28.2, 1.15, sx, sz));
  }

  // —— 齿饰：檐口下的小方块阵列（每面 15 枚） ——
  const dentilN = 15;
  for (let f = 0; f < 4; f++) {
    const ang = (f * Math.PI) / 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let i = 0; i < dentilN; i++) {
      const u = (i - (dentilN - 1) / 2) * 1.22;
      // 面法线方向 (sa, ca)，面内切向 (ca, -sa)
      const cx = sa * 9.75 + ca * u;
      const cz = ca * 9.75 - sa * u;
      const g = new THREE.BoxGeometry(0.44, 0.7, 0.44);
      g.rotateY(ang);
      g.translate(cx, B + 27.25, cz);
      push(g);
    }
  }

  // —— 上层檐口与柱身 ——
  push(slabBox(10.15, B + 27.6, B + 28.9));
  push(slabBox(8.9, B + 28.9, B + 40.2));
  for (let f = 0; f < 4; f++) {
    const ang = (f * Math.PI) / 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let i = -1; i <= 1; i++) {
      const u = i * 5.0;
      const cx = sa * 9.11 + ca * u;
      const cz = ca * 9.11 - sa * u;
      const g = new THREE.BoxGeometry(1.0, 10.1, 0.42);
      g.rotateY(ang);
      g.translate(cx, B + 34.55, cz);
      push(g);
    }
  }

  // —— 主檐口 / 女儿墙 / 顶部承台 ——
  push(slabBox(9.55, B + 40.2, B + 41.8));
  push(slabBox(8.4, B + 41.8, B + 42.3));
  for (let f = 0; f < 4; f++) {
    const ang = (f * Math.PI) / 2;
    const cx = Math.sin(ang) * 8.7;
    const cz = Math.cos(ang) * 8.7;
    const g = new THREE.BoxGeometry(18.2, 2.8, 0.8);
    g.rotateY(ang);
    g.translate(cx, B + 43.2, cz);
    push(g);
  }
  push(squareFrustum(8.2, 7.9, B + 44.6, B + 47.0));
}

/**
 * 生成一块带 3 个半圆拱洞的墙板（`Shape` + 洞 + 倒角挤出）。
 * 板面位于 XY 平面（x∈[-9.6, 9.6]，y∈[0, 14]），沿 +Z 挤出 1.5 m
 * （含两端各 0.1 m 倒角，得到拱券与板缘的斜面）。
 * @returns {THREE.BufferGeometry} 几何体（z∈[-0.1, 1.4]）
 */
function buildArchPanel() {
  const shape = new THREE.Shape();
  shape.moveTo(-9.6, 0);
  shape.lineTo(9.6, 0);
  shape.lineTo(9.6, 14);
  shape.lineTo(-9.6, 14);
  shape.closePath();

  const halfW = 2.05;
  const sill = 2.0;
  const spring = 7.2;
  for (const cx of [-5.4, 0, 5.4]) {
    const hole = new THREE.Path();
    hole.moveTo(cx - halfW, sill);
    hole.lineTo(cx + halfW, sill);
    hole.lineTo(cx + halfW, spring);
    hole.absarc(cx, spring, halfW, 0, Math.PI, false);
    hole.lineTo(cx - halfW, sill);
    shape.holes.push(hole);
  }

  return new THREE.ExtrudeGeometry(shape, {
    depth: 1.30,
    bevelEnabled: true,
    bevelThickness: 0.10,
    bevelSize: 0.10,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 12
  });
}

/* ==================================================================== *
 * §3 长袍：车削 + 逐顶点衣褶雕刻
 * ==================================================================== */

/** 铜像表面的锈斑贴图密度（每米 UV 数） */
const BRONZE_UV = 0.35;

/**
 * 长袍侧影关键点 [高度 m, 半径 m]。
 * 下摆外张 6.3 m → 髋部 4.6 m → 腰部收进 3.62 m → 胸部微鼓 3.88 m → 肩部急收，
 * 经 Catmull-Rom 重采样后得到有收放的车削剪影（不是直筒）。
 * @type {Array<[number, number]>}
 */
const ROBE_PROFILE_KEYS = [
  [-0.25, 0.00], [-0.20, 3.20], [-0.10, 5.40], [0.10, 6.28],
  [0.95, 6.05], [2.40, 5.62], [4.20, 5.18], [6.50, 4.88],
  [9.00, 4.72], [11.50, 4.62], [13.50, 4.36], [15.50, 4.06],
  [17.50, 3.76], [19.20, 3.62], [21.00, 3.72], [23.00, 3.88],
  [24.60, 3.70], [25.90, 3.26], [26.90, 2.56], [27.70, 1.80],
  [28.30, 1.12], [29.00, 0.96], [29.60, 0.00]
];

/**
 * 车削长袍并逐顶点雕刻衣褶（模块核心，公式见 `robeFold` 与文件头）。
 * @param {THREE.BufferGeometry[]} out 青铜几何收集列表
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {number} segments 环向分段（每道主褶 ≥ 8 段才能看清褶皱）
 * @param {(list:THREE.BufferGeometry[], geo:THREE.BufferGeometry, opts?:Object)=>void} push 收集函数
 * @returns {number} 肩顶局部高度（供头部定位）
 */
function buildRobe(out, n3, segments, push) {
  const profile = resampleProfile(ROBE_PROFILE_KEYS, 4);
  const geo = new THREE.LatheGeometry(profile, segments, 0, TWO_PI);
  const pos = geo.attributes.position;
  const count = pos.count;
  /** 每个顶点的凹凸因子：0 = 褶谷，1 = 褶脊（用于顶点色的 AO / 铜绿混合） */
  const ridge = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) {
      ridge[i] = 0.5;
      continue;
    }
    // LatheGeometry 的角参数：x = r·sin φ，z = r·cos φ → φ = atan2(x, z)
    const theta = Math.atan2(x, z);
    const f = robeFold(n3, theta, y);
    // 靠近旋转轴时衰减位移，避免顶/底封口翻面
    const k = Math.min(1, r / 0.75);
    const d = f.disp * k;
    pos.setX(i, x + (x / r) * d);
    pos.setZ(i, z + (z / r) * d);
    ridge[i] = clamp(0.5 + 0.5 * (f.disp / f.amp), 0, 1);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  weldLatheSeam(geo, segments, profile.length);

  paintByFn(geo, (i, p, nrm, c) => {
    bronzeColor(n3, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), ridge[i], c);
  });
  push(out, geo, { uvScale: BRONZE_UV });

  // 颈部（被头部与衣领遮住大半，仅需圆锥过渡）
  const neck = new THREE.CylinderGeometry(0.98, 1.20, 3.0, 20, 1, false);
  neck.translate(0, 28.9, 0);
  paintByFn(neck, (i, p, nrm, c) => {
    bronzeColor(n3, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), 0.42, c);
  });
  push(out, neck, { uvScale: BRONZE_UV });

  return 29.6;
}

/**
 * 带褶皱的喇叭袖 / 披挂筒：沿 +Y 生成锥台后做周向正弦褶皱位移，
 * 再整体定向到 p0→p1，用于袖口与肩部披挂，使四肢与长袍的雕刻语言统一。
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {THREE.Vector3} p0 起点（半径 r0）
 * @param {THREE.Vector3} p1 终点（半径 r1）
 * @param {number} r0 起点半径
 * @param {number} r1 终点半径
 * @param {number} folds 褶皱道数（必须为整数）
 * @param {number} amp 褶皱幅度（米）
 * @param {number} seg 环向分段
 * @param {number} phase 相位偏移（区分左右袖）
 * @returns {THREE.BufferGeometry} 几何体
 */
function drapedSleeve(n3, p0, p1, r0, r1, folds, amp, seg, phase) {
  _v0.subVectors(p1, p0);
  const len = _v0.length();
  const rows = 5;
  const geo = new THREE.CylinderGeometry(r1, r0, len, seg, rows, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const th = Math.atan2(x, z);
    const n = n3(Math.cos(th) * 2.0 + phase, Math.sin(th) * 2.0, y * 0.35);
    const t = (y + len / 2) / len; // 0 = 袖口，1 = 肩侧
    const a = amp * (0.45 + 0.55 * (1 - t));
    const d = a * Math.sin(folds * th + 1.15 * n + phase);
    pos.setX(i, x + (x / r) * d);
    pos.setZ(i, z + (z / r) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  weldGridSeam(geo, seg, rows);

  geo.translate(0, len / 2, 0);
  _v0.normalize();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(AXIS_Y, _v0));
  geo.translate(p0.x, p0.y, p0.z);
  return geo;
}

/* ==================================================================== *
 * §4 头部与七芒冠冕
 * ==================================================================== */

/** 头部球心局部高度 */
const HEAD_Y = 31.3;
/** 头部基准半径（纵向再拉伸 1.30 倍 → 头高约 5.1 m） */
const HEAD_R = 1.95;

/**
 * 头部：球体逐顶点位移雕出五官；冠冕：环带 + 7 道长度不等的放射状尖芒。
 *
 * 各特征均以"单位球方向 (dx, dy, dz)"为定义域，用各向异性高斯核局部加权：
 * 下巴前突、鼻梁长脊、鼻头点凸、眉弓横脊、双眼窝内凹、唇部小凸、颧骨侧凸，
 * 脑后按噪声整体外扩形成发髻体积。正面为 +Z。
 *
 * @param {THREE.BufferGeometry[]} out 青铜几何收集列表
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {number} seg 球体环向分段
 * @param {Object} rng 种子 RNG
 * @param {(list:THREE.BufferGeometry[], geo:THREE.BufferGeometry, opts?:Object)=>void} push 收集函数
 * @param {number} robeTop 长袍车削体顶端高度（用于放置遮住颈部接口的衣领）
 * @returns {void}
 */
function buildHeadAndCrown(out, n3, seg, rng, push, robeTop) {
  // 衣领：环面盖住"长袍车削体收口 ↔ 颈部圆柱"的接缝
  const collar = new THREE.TorusGeometry(1.24, 0.30, 8, 24);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, robeTop - 1.0, 0);
  paintByFn(collar, (i, p, nrm, c) => {
    bronzeColor(n3, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), 0.36, c);
  });
  push(out, collar, { uvScale: BRONZE_UV });

  const rows = Math.max(12, Math.round(seg * 0.75));
  const geo = new THREE.SphereGeometry(HEAD_R, seg, rows);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) / HEAD_R;
    const dy = pos.getY(i) / HEAD_R;
    const dz = pos.getZ(i) / HEAD_R;
    const front = Math.max(0, dz);
    const back = Math.max(0, -dz);

    let X = dx;
    let Y = dy * 1.30;
    let Z = dz * 1.06;

    // 下颌收窄
    const low = smoothstep(0.05, -0.85, dy);
    X *= 1 - 0.30 * low;

    // 下巴前突
    const chin = Math.exp(-sq(dx) / 0.10 - sq(dy + 0.70) / 0.09) * front;
    Z += 0.34 * chin;
    Y -= 0.05 * chin;
    // 鼻梁长脊
    const bridge = Math.exp(-sq(dx) / 0.020) * Math.exp(-sq(dy - 0.06) / 0.22) * Math.pow(front, 1.4);
    Z += 0.24 * bridge;
    // 鼻头
    const tip = Math.exp(-sq(dx) / 0.012 - sq(dy + 0.14) / 0.010) * Math.pow(front, 1.6);
    Z += 0.30 * tip;
    // 眉弓
    const brow = Math.exp(-sq(dy - 0.30) / 0.010) * Math.exp(-sq(dx) / 0.26) * front;
    Z += 0.15 * brow;
    // 眼窝（内凹）
    const eye = Math.exp(-sq(Math.abs(dx) - 0.33) / 0.014 - sq(dy - 0.12) / 0.012) * front;
    Z -= 0.16 * eye;
    // 嘴唇
    const lips = Math.exp(-sq(dx) / 0.07 - sq(dy + 0.42) / 0.0045) * front;
    Z += 0.09 * lips;
    // 颧骨
    const cheek = Math.exp(-sq(Math.abs(dx) - 0.46) / 0.05 - sq(dy + 0.10) / 0.06) * front;
    X += Math.sign(dx) * 0.06 * cheek;
    Z += 0.05 * cheek;

    // 脑后发髻：按噪声整体外扩
    const hair = back * smoothstep(-0.55, 0.10, dy);
    const g = 1 + 0.11 * hair * (0.5 + 0.5 * n3(dx * 3.1, dy * 3.1, dz * 3.1));
    X *= g;
    Y *= g;
    Z *= g;

    pos.setXYZ(i, X * HEAD_R, Y * HEAD_R + HEAD_Y, Z * HEAD_R);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  weldGridSeam(geo, seg, rows);
  paintByFn(geo, (i, p, nrm, c) => {
    const ridge = clamp(0.45 + 0.35 * nrm.getY(i), 0, 1);
    bronzeColor(n3, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), ridge, c);
  });
  push(out, geo, { uvScale: BRONZE_UV });

  // —— 冠冕环带 ——
  const band = new THREE.CylinderGeometry(2.02, 2.24, 1.30, 30, 1, false);
  band.translate(0, 32.55, 0);
  paintByFn(band, (i, p, nrm, c) => {
    bronzeColor(n3, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), 0.78, c);
  });
  push(out, band, { uvScale: BRONZE_UV });

  // —— 七道尖芒：以正面 (+Z) 为中心，跨 250° 放射排列，长度不等 ——
  const spikes = 7;
  for (let i = 0; i < spikes; i++) {
    const a = (-125 + (250 / (spikes - 1)) * i) * (Math.PI / 180);
    const len = rng.range(3.0, 4.4);
    const cone = new THREE.ConeGeometry(0.46, len, 4, 1);
    cone.translate(0, len / 2, 0);
    _v0.set(Math.sin(a) * 0.62, 0.80, Math.cos(a) * 0.62).normalize();
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(AXIS_Y, _v0));
    cone.translate(Math.sin(a) * 2.02, 32.9, Math.cos(a) * 2.02);
    paintByFn(cone, (k, p, nrm, c) => {
      bronzeColor(n3, p.getX(k), p.getY(k), p.getZ(k), nrm.getY(k), 0.85, c);
    });
    push(out, cone, { uvScale: BRONZE_UV });
  }
}

/* ==================================================================== *
 * §5 右臂高举火炬
 * ==================================================================== */

/** 火炬轴线（局部 X/Z），位于右手正上方 */
const TORCH_X = -3.05;
const TORCH_Z = 0.05;
/** 火焰根部局部高度 */
const FLAME_BASE_Y = 42.9;
/** 火焰高度（顶端 = 42.9 + 3.1 = 46.0 m，即铜像总高） */
const FLAME_H = 3.1;

/**
 * 右臂（局部 −X 为人物右侧）：肩部外展 → 肘部微屈 → 前臂近垂直上举，
 * 上臂 / 前臂用分段圆锥，肩、肘、腕三处以关节球衔接，肩上覆带褶喇叭袖。
 * 手部简化为握拳（掌球 + 4 枚指节），握住火炬柄；柄上端接鎏金火盆与火焰。
 *
 * @param {THREE.BufferGeometry[]} bronze 青铜几何收集列表
 * @param {THREE.BufferGeometry[]} gold 鎏金几何收集列表
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {number} seg 肢体环向分段
 * @param {(list:THREE.BufferGeometry[], geo:THREE.BufferGeometry, opts?:Object)=>void} push 收集函数
 * @returns {{flameGeo: THREE.BufferGeometry, flameLocal: THREE.Vector3}} 火焰几何（火盆口为原点）与其局部位置
 */
function buildRightArm(bronze, gold, n3, seg, push) {
  /**
   * 以给定凹凸因子收集一块青铜构件。
   * @param {THREE.BufferGeometry} g 几何体
   * @param {number} ridge 凹凸因子
   * @returns {void}
   */
  const pushBronze = (g, ridge) => {
    paintByFn(g, (i, p, nrm, c) => {
      bronzeColor(n3, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), ridge, c);
    });
    push(bronze, g, { uvScale: BRONZE_UV });
  };
  /**
   * 收集一块鎏金构件。
   * @param {THREE.BufferGeometry} g 几何体
   * @returns {void}
   */
  const pushGold = (g) => push(gold, g, { color: C_GOLD, uvScale: BRONZE_UV });

  const S = new THREE.Vector3(-2.45, 26.3, 0.25);
  const E = new THREE.Vector3(-3.20, 31.6, -0.45);
  const W = new THREE.Vector3(TORCH_X, 37.3, TORCH_Z);

  pushBronze(limbGeo(S, E, 1.28, 0.96, seg), 0.62);
  pushBronze(limbGeo(E, W, 0.96, 0.70, seg), 0.62);
  pushBronze(jointGeo(S, 1.32, seg), 0.55);
  pushBronze(jointGeo(E, 1.00, seg), 0.55);
  pushBronze(jointGeo(W, 0.74, seg), 0.55);

  // 肩部喇叭袖（与长袍同一套褶皱语言，8 道褶）
  pushBronze(
    drapedSleeve(
      n3,
      new THREE.Vector3(-2.86, 29.4, -0.10),
      new THREE.Vector3(-2.25, 25.5, 0.40),
      2.30, 2.85, 8, 0.30, Math.max(12, seg), 1.7
    ),
    0.48
  );

  // 握拳：掌球 + 4 枚指节
  const palm = new THREE.SphereGeometry(0.86, seg, Math.max(8, Math.round(seg * 0.7)));
  palm.scale(1.0, 0.95, 1.15);
  palm.translate(TORCH_X, 38.0, TORCH_Z);
  pushBronze(palm, 0.70);
  for (let k = 0; k < 4; k++) {
    const a = -0.85 + k * 0.52;
    const knuckle = new THREE.SphereGeometry(0.31, 10, 8);
    knuckle.translate(
      TORCH_X + Math.sin(a) * 0.66,
      37.55 + k * 0.34,
      TORCH_Z + Math.cos(a) * 0.66
    );
    pushBronze(knuckle, 0.86);
  }

  // 火炬柄（鎏金）
  const handle = new THREE.CylinderGeometry(0.34, 0.40, 4.9, 16, 1, false);
  handle.translate(TORCH_X, 39.0, TORCH_Z);
  pushGold(handle);
  for (const ry of [37.5, 40.3]) {
    const ring = new THREE.TorusGeometry(0.42, 0.10, 6, 16);
    ring.rotateX(Math.PI / 2);
    ring.translate(TORCH_X, ry, TORCH_Z);
    pushGold(ring);
  }

  // 火盆（车削）
  const bowlProfile = [
    [41.2, 0.40], [41.5, 0.52], [41.9, 0.72], [42.3, 1.05],
    [42.65, 1.38], [42.90, 1.55], [43.05, 1.62], [43.10, 1.48], [42.95, 1.30]
  ].map((p) => new THREE.Vector2(p[1], p[0]));
  const bowl = new THREE.LatheGeometry(bowlProfile, 26, 0, TWO_PI);
  bowl.translate(TORCH_X, 0, TORCH_Z);
  pushGold(bowl);

  // 火焰：内外两层壳体合并成一个几何（加性混合，先后顺序无关）
  const outer = buildFlameShell(n3, FLAME_H, 1.0, 26, 6, 0.20, [1.85, 0.95, 0.28], [0.70, 0.28, 0.06]);
  const inner = buildFlameShell(n3, FLAME_H * 0.76, 0.56, 20, 5, 0.14, [2.60, 2.10, 1.05], [1.55, 1.00, 0.32]);
  const flameGeo = mergeGeometries([outer, inner], false);
  outer.dispose();
  inner.dispose();

  return { flameGeo, flameLocal: new THREE.Vector3(TORCH_X, FLAME_BASE_Y, TORCH_Z) };
}

/** 火焰侧影关键点 [归一化高度, 归一化半径]：底部微收、腰部最宽、顶端收成尖 */
const FLAME_KEYS = [
  [0.00, 0.92], [0.10, 1.20], [0.24, 1.28], [0.40, 1.12], [0.56, 0.88],
  [0.70, 0.62], [0.82, 0.38], [0.92, 0.18], [1.00, 0.00]
];

/**
 * 生成一层火焰壳体：车削出泪滴剖面后，按周向正弦 + 噪声挤出"火舌"，
 * 顶点色沿高度从根部亮金渐变到尖端暗橙（线性色，允许 > 1 以获得发光感）。
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {number} height 高度（米）
 * @param {number} rScale 半径缩放
 * @param {number} seg 环向分段
 * @param {number} tongues 火舌数（整数，保证接缝一致）
 * @param {number} ampFrac 火舌相对幅度
 * @param {number[]} colBase 根部线性 RGB
 * @param {number[]} colTip 尖端线性 RGB
 * @returns {THREE.BufferGeometry} 几何体（原点在火盆口）
 */
function buildFlameShell(n3, height, rScale, seg, tongues, ampFrac, colBase, colTip) {
  const profile = FLAME_KEYS.map((p) => new THREE.Vector2(p[1] * rScale, p[0] * height));
  const geo = new THREE.LatheGeometry(profile, seg, 0, TWO_PI);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const th = Math.atan2(x, z);
    const n = n3(Math.cos(th) * 1.9, Math.sin(th) * 1.9, y * 0.55);
    const d = r * ampFrac * Math.sin(tongues * th + 0.9 * n + y * 0.35);
    pos.setX(i, x + (x / r) * d);
    pos.setZ(i, z + (z / r) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  weldLatheSeam(geo, seg, profile.length);
  paintByFn(geo, (i, p, nrm, c) => {
    const t = clamp(p.getY(i) / height, 0, 1);
    c.setRGB(
      lerp(colBase[0], colTip[0], t),
      lerp(colBase[1], colTip[1], t),
      lerp(colBase[2], colTip[2], t)
    );
  });
  return normalizeGeo(geo);
}

/* ==================================================================== *
 * §6 左臂与法典石板
 * ==================================================================== */

/**
 * 左臂（局部 +X 为人物左侧）：上臂自然下垂并前伸，前臂上抬托住法典石板；
 * 石板为带四周斜面的长方体（`ExtrudeGeometry` + bevel），正面有 7 道浅浮雕刻痕。
 *
 * @param {THREE.BufferGeometry[]} bronze 青铜几何收集列表
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {number} seg 肢体环向分段
 * @param {(list:THREE.BufferGeometry[], geo:THREE.BufferGeometry, opts?:Object)=>void} push 收集函数
 * @returns {void}
 */
function buildLeftArm(bronze, n3, seg, push) {
  /**
   * 以给定凹凸因子收集一块青铜构件。
   * @param {THREE.BufferGeometry} g 几何体
   * @param {number} ridge 凹凸因子
   * @returns {void}
   */
  const pushBronze = (g, ridge) => {
    paintByFn(g, (i, p, nrm, c) => {
      bronzeColor(n3, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), ridge, c);
    });
    push(bronze, g, { uvScale: BRONZE_UV });
  };

  const S = new THREE.Vector3(2.45, 26.1, 0.20);
  const E = new THREE.Vector3(3.35, 21.3, 1.55);
  const W = new THREE.Vector3(2.80, 19.4, 3.40);

  pushBronze(limbGeo(S, E, 1.26, 0.95, seg), 0.62);
  pushBronze(limbGeo(E, W, 0.95, 0.68, seg), 0.62);
  pushBronze(jointGeo(S, 1.30, seg), 0.55);
  pushBronze(jointGeo(E, 0.98, seg), 0.55);

  pushBronze(
    drapedSleeve(
      n3,
      new THREE.Vector3(2.92, 23.6, 0.90),
      new THREE.Vector3(2.25, 25.4, 0.35),
      2.15, 2.70, 8, 0.26, Math.max(12, seg), -2.4
    ),
    0.48
  );

  // 手掌 + 四指（托住石板下缘）
  const palm = new THREE.SphereGeometry(0.80, seg, Math.max(8, Math.round(seg * 0.7)));
  palm.scale(1.15, 0.85, 1.0);
  palm.translate(W.x, W.y + 0.15, W.z);
  pushBronze(palm, 0.70);
  for (let k = 0; k < 4; k++) {
    const finger = new THREE.SphereGeometry(0.28, 10, 8);
    finger.scale(0.85, 0.85, 1.35);
    finger.translate(W.x - 0.55 + k * 0.36, W.y + 0.42, W.z + 0.62);
    pushBronze(finger, 0.86);
  }

  // —— 法典石板 ——
  const T = new THREE.Matrix4().compose(
    new THREE.Vector3(3.35, 20.0, 2.15),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.28, -0.40, 0.26, 'XYZ')),
    new THREE.Vector3(1, 1, 1)
  );

  const halfW = 2.00;
  const halfH = 3.30;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -halfH);
  shape.lineTo(halfW, -halfH);
  shape.lineTo(halfW, halfH);
  shape.lineTo(-halfW, halfH);
  shape.closePath();
  const tablet = new THREE.ExtrudeGeometry(shape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelThickness: 0.10,
    bevelSize: 0.10,
    bevelOffset: 0,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1
  });
  tablet.translate(0, 0, -0.31);
  tablet.applyMatrix4(T);
  pushBronze(tablet, 0.80);

  // 刻痕：7 道浅浮雕横线（"JULY IV MDCCLXXVI" 的抽象表达），
  // 做成 5 cm 高的凸起而非凹槽，避免与板面共面产生 z-fighting。
  for (let k = 0; k < 7; k++) {
    const w = 1.30 - 0.09 * k;
    const bar = new THREE.BoxGeometry(w * 2, 0.15, 0.05);
    bar.translate(0, 2.05 - k * 0.62, 0.235);
    bar.applyMatrix4(T);
    pushBronze(bar, 0.20);
  }
}

/* ==================================================================== *
 * §7 脚下断裂的锁链
 * ==================================================================== */

/**
 * 脚下断裂的锁链：链节交替 90° 串接（相邻环面互相垂直），末端一枚开口断环。
 * 链条从长袍下摆内延伸而出，靠近下摆的部分被衣褶自然遮住。
 *
 * @param {THREE.BufferGeometry[]} bronze 青铜几何收集列表
 * @param {(x:number,y:number,z:number)=>number} n3 3D simplex 采样器
 * @param {Object} rng 种子 RNG
 * @param {(list:THREE.BufferGeometry[], geo:THREE.BufferGeometry, opts?:Object)=>void} push 收集函数
 * @returns {void}
 */
function buildChains(bronze, n3, rng, push) {
  const R = 0.42;
  const TUBE = 0.13;
  const SPACING = 0.62;

  /**
   * 铺设一条链。
   * @param {number} angle 水平方位（相对局部 +Z，弧度）
   * @param {number} startR 起始半径
   * @param {number} links 链节数
   * @param {boolean} breakLast 末节是否为断裂开环
   * @returns {void}
   */
  const layChain = (angle, startR, links, breakLast) => {
    const dir = new THREE.Vector3(Math.sin(angle), 0.028, Math.cos(angle)).normalize();
    const nAxis = new THREE.Vector3().crossVectors(dir, AXIS_Y).normalize();
    const upAxis = new THREE.Vector3().crossVectors(nAxis, dir).normalize();
    const negUp = upAxis.clone().negate();
    const origin = new THREE.Vector3(dir.x * startR, 0.25, dir.z * startR);

    for (let k = 0; k < links; k++) {
      const open = breakLast && k === links - 1;
      const g = new THREE.TorusGeometry(R, TUBE, 6, 14, open ? Math.PI * 1.30 : TWO_PI);
      const basis = new THREE.Matrix4();
      if (k % 2 === 0) basis.makeBasis(dir, upAxis, nAxis);
      else basis.makeBasis(dir, nAxis, negUp);
      basis.setPosition(
        origin.x + dir.x * (k * SPACING),
        origin.y + dir.y * (k * SPACING) + rng.range(-0.03, 0.03),
        origin.z + dir.z * (k * SPACING)
      );
      g.applyMatrix4(basis);
      paintByFn(g, (i, p, nrm, c) => {
        bronzeColor(n3, p.getX(i), p.getY(i), p.getZ(i), nrm.getY(i), 0.30, c);
      });
      push(bronze, g, { uvScale: BRONZE_UV });
    }
  };

  // 链条末端须留在台座顶面（半宽 7.9 m 的方台）之内，避免出现悬空链节
  layChain(-0.60, 5.60, 7, true);
  layChain(2.30, 6.60, 4, false);
}
