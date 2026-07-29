/**
 * @file src/sculpt/rocks.js
 * @description 中央公园「曼哈顿片岩（Manhattan Schist）」露头群（契约 §5.7）。
 *
 * ---------------------------------------------------------------------------
 * 一、地质原型
 * ---------------------------------------------------------------------------
 * 中央公园里裸露的基岩是 4.5 亿年前变质而成的曼哈顿片岩 —— 一种**强片理化**
 * （foliated）的云母片岩／片麻岩。它的三个可辨识视觉特征，正是本模块要雕刻的三件事：
 *
 *   1. **整体呈被冰川磨圆的低矮丘状**  → fbm3D 做低频轮廓起伏（羊背石 roche moutonnée）
 *   2. **表面沿节理成块状剥落**        → Worley 细胞噪声做「节理裂缝 + 块状剥落坑」
 *   3. **顺片理方向的层状台阶与条带**  → 沿片理面法线做「层理切削」（阶梯量化 + 逐层外伸抖动）
 *
 * ---------------------------------------------------------------------------
 * 二、雕刻管线（每块岩石，全部在构建期一次性完成，运行时零开销）
 * ---------------------------------------------------------------------------
 *   IcosahedronGeometry(1, detail 3~4)
 *     → deleteAttribute('uv') + mergeVertices()  索引化（detail4：15360 → 2562 顶点，省 6× 计算）
 *     → 逐顶点位移：
 *         (1) 低频 fbm3D 沿方向调制半径      —— 整体块状轮廓
 *         (2) 各向异性缩放 (ax, ay, az)      —— 扁平的露头而非圆球
 *         (3) 中频 fbm3D 沿法向凸凹          —— 中等尺度起伏
 *         (4) Worley 双平面细胞场            —— 节理缝（F2−F1）+ 块状剥落坑（按 cell id 抽签）
 *         (5) 层理切削                       —— 沿片理法线 nb 阶梯量化 + 逐层横向外伸抖动
 *         (6) 底部压平                       —— 切平面以下强压缩成近似平底，便于嵌入地形
 *     → computeVertexNormals()（**必须**：位移后原始球面法线已完全失效）
 *     → applyMatrix4(旋转) → 量出真实包围盒 → translate 到贴地位置（下沉 15%~30% 埋入土中）
 *     → 逐顶点色：片岩灰白基调 + 沿层理的黑云母暗色矿脉 + 石英白脉 + 铁染 + 朝上面苔藓
 *
 * 全部露头 + 碎石合并为**一个几何、一个材质 = 1 个 drawcall**（契约要求 ≤ 2）。
 *
 * ---------------------------------------------------------------------------
 * 三、算法出处
 * ---------------------------------------------------------------------------
 *  - fBm（分形布朗运动）：Mandelbrot & Van Ness (1968)；实现见 core/noise.js `fbm3D`
 *  - Worley 细胞噪声：Steven Worley, "A Cellular Texture Basis Function" (SIGGRAPH 1996)。
 *    F2−F1 → 细胞边界距离场，是程序化「节理／裂纹」的标准做法。
 *  - 层理阶梯量化：对片理坐标 s = p·nb 做 `s' = lerp(s, (floor(s/t)+0.5)·t, k)`，
 *    即把顶点吸附向层中面，层间自然拉出陡立的「阶步（riser）」——
 *    这是 Musgrave 在 *Texturing & Modeling* §16 中讨论沉积岩台地时用的量化位移思路。
 *  - 各层横向外伸量取自整数层号的空间散列（core/rng.js `hash2D`），
 *    使每层像一块厚薄不同的板岩，形成悬挑与凹槽。
 *
 * ---------------------------------------------------------------------------
 * 四、契约差异说明（按 §0 要求就地记录，不改契约）
 * ---------------------------------------------------------------------------
 *  - 契约 §5.7 只给了 `parkHeightFn(x, z)`，没有给公园小径与水塘的几何，而 §0 的依赖方向
 *    又禁止 sculpt/* 之间互相 import（拿不到 terrain 的 `isInPond` / `waterLevel`）。
 *    因此本模块按 §5.7 允许的「简单半径排斥」自建了两道防线：
 *      · 几何禁区：自建一套**合理的主路网**（外环路 + 3 条横穿径 + 1 条斜径）做半径排斥，
 *        水塘则用一个**能包住任意朝向长轴的圆**（半径 168m）而非猜朝向的椭圆；
 *      · 高程兜底：用 `parkHeightFn` 实测 footprint 内 17 点高程，最低点必须高于 `MIN_GROUND_Y`，
 *        且起伏 `max−min` 不得超过岩石高度的 `MAX_RELIEF_RATIO`（陡坡会把岩石整个埋掉）。
 *    第二道防线才是权威——即使 terrain 的塘体尺寸/朝向与此处名义值不一致，也不会有岩石泡在水里。
 *  - `parkHeightFn` 缺省时按契约退化为 `() => 0`（此时全场地面为 0，高程兜底自动失效，
 *    这正是契约期望的退化行为）。
 *  - **关于 `detail 3~4`**：Three.js 的 `PolyhedronGeometry` 用的是**线性细分**——`detail`
 *    参数把每个基础面切成 `(detail+1)²` 个三角形，于是 `detail=3` 只有 20×16 = 320 面、
 *    `detail=4` 只有 20×25 = 500 面。放在一块 14m 的露头上顶点间距高达 1.5m，
 *    根本承载不了 fbm / worley / 层理这些逐顶点雕刻（全部会被欠采样成噪点）。
 *    契约里的「detail 3~4」显然是按**递归细分级数**（每级四分面，20×4^L 面）来说的，
 *    那才对应 1280~5120 面的合理网格。两者换算：`(detail+1)² = 4^L → detail = 2^L − 1`。
 *    因此本文件一律按「细分级数 L」组织代码，实际传给 `IcosahedronGeometry` 的参数取 `2^L − 1`
 *    （L=3 → 7，L=4 → 15），几何结果与契约意图一致。见 `ICO_DETAIL_BY_LEVEL`。
 */

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { makeNoise3D, fbm3D, worley2D } from '../core/noise.js';
import { hash2D } from '../core/rng.js';
import { clamp, lerp, smoothstep, TWO_PI, DEG2RAD } from '../core/mathx.js';
import { patchCityMaterial } from '../render/shaderpatch.js';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 公园范围兜底值（与 city/grid.js 的 CITY.park 一致；此处不 import 以遵守 §0 依赖方向） */
const PARK_FALLBACK = Object.freeze({ minX: -420, maxX: 140, minZ: -2080, maxZ: -720 });

/**
 * 水塘禁区，取**圆形**而非椭圆：terrain.js 的塘体是一个带旋转角与岸线噪声抖动的椭圆，
 * 其长轴朝向属于该模块内部实现（本模块按 §0 依赖方向不得 import 它）。
 * 用一个能包住任意朝向长轴的圆，就把"猜朝向"这件事彻底消掉了：
 * 契约 §5.6 的塘体长轴 260m（半长轴 130m），叠加岸线抖动余量后取半径 168m。
 */
const POND = Object.freeze({ x: -150, z: -1500, radius: 168 });

/**
 * 岩石落基面的最低允许高程（米）。
 *
 * terrain.js 的水面**不在 y=0**，而是固定在一个正的水位上（实测 0.3m），塘底 −4.5m。
 * 本模块拿不到那个常量（同为 sculpt/*，不得互相 import），故要求岩石footprint 内的
 * **最低**高程高于水位并留出干舷余量：0.75m 可容忍水位上浮到 0.75 仍不至于把岩石泡进水里。
 * 公园陆地约有七成点位高于此值，配合 420 次重试完全够用。
 */
const MIN_GROUND_Y = 0.75;

/**
 * footprint 内允许的地形起伏上限，表示为岩石总高的倍数。
 * 岩石底面要压到 footprint 的最低点才不悬空，于是坡越陡、埋得越深；
 * 取 0.45 可保证最不利情形下仍有约 1/4 的高度露在地表之上。
 */
const MAX_RELIEF_RATIO = 0.45;

/** 距公园边界的最小退让（米），避免岩石压到街面 */
const EDGE_MARGIN = 46;

/** 距主要小径中心线的基础净空（米），实际还要按岩石半径加码 */
const PATH_CLEARANCE = 9.5;

/** 两块露头之间的最小净间距（米，已扣除各自半径） */
const ROCK_GAP = 11;

/** 每块岩石的最大布点尝试次数 */
const MAX_ATTEMPTS = 420;

/** 各画质下的露头数量（契约要求 ≥ 14，最低档也留了余量） */
const COUNT_BY_QUALITY = Object.freeze({ high: 22, medium: 18, low: 16 });

/**
 * 「细分级数 L」→ `IcosahedronGeometry` 的 `detail` 实参（`2^L − 1`，见文件头说明）。
 * L=2 → 320 面 / 162 顶点（碎石）；L=3 → 1280 面 / 642 顶点；L=4 → 5120 面 / 2562 顶点。
 */
const ICO_DETAIL_BY_LEVEL = Object.freeze({ 2: 3, 3: 7, 4: 15 });

/** 采用 L=4 精雕的最小尺寸（米）——只有大露头值得这个三角形预算 */
const HIGH_DETAIL_SIZE = 10.5;

/**
 * fbm 参数对象一律提升为模块级常量。
 * `fbm3D` 每次调用都会读 opts，若在热循环里传字面量就是**每顶点新建对象**，
 * 3 万顶点 × 5 次调用 = 15 万次分配，GC 压力会让构建耗时翻倍。
 */
const FBM_SHAPE = Object.freeze({ octaves: 4, gain: 0.55, lacunarity: 2.07 });
const FBM_DETAIL = Object.freeze({ octaves: 3, gain: 0.5 });
const FBM_MOTTLE = Object.freeze({ octaves: 3, gain: 0.55 });
const FBM_FINE = Object.freeze({ octaves: 2, gain: 0.5 });
const FBM_MOSS = Object.freeze({ octaves: 2, gain: 0.55 });

/**
 * 细分级数 L 下、索引化后的顶点数：V = 10·4^L + 2（正二十面体细分的欧拉公式结果）。
 * @param {number} level 细分级数
 * @returns {number} 顶点数
 */
function icoVertexCount(level) {
  return 10 * Math.pow(4, level) + 2;
}

/**
 * 片岩调色板（十六进制按 sRGB 书写；`new THREE.Color(hex)` 在 ColorManagement 开启时
 * 会自动转到线性工作空间，而顶点色属性正是按线性解释的，故直接取 r/g/b 即为正确值）。
 */
const PALETTE = Object.freeze({
  /** 石英—长石浅色带（片岩里被压扁的白色条带） */
  light: srgbToLinearTriplet(0xc6cac6),
  /** 片岩基调灰 */
  mid: srgbToLinearTriplet(0x8b8f8c),
  /** 黑云母／角闪石深色矿脉 */
  dark: srgbToLinearTriplet(0x474b4d),
  /** 铁质氧化染色（锈黄） */
  rust: srgbToLinearTriplet(0x8d7450),
  /** 苔藓（只长在朝上面） */
  moss: srgbToLinearTriplet(0x4d7a35),
  /** 地衣（偏黄绿，斑点状） */
  lichen: srgbToLinearTriplet(0x9aa87a)
});

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

/**
 * 把 sRGB 十六进制色转成线性空间的 [r, g, b] 三元组（供顶点色使用）。
 * @param {number} hex sRGB 十六进制
 * @returns {number[]} 线性 [r, g, b]
 */
function srgbToLinearTriplet(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/**
 * 安全调用外部传入的高程函数：异常或非有限值一律退化为 0。
 * @param {(x:number,z:number)=>number} fn 高程函数
 * @param {number} x 世界 X
 * @param {number} z 世界 Z
 * @returns {number} 高程（米）
 */
function safeHeight(fn, x, z) {
  try {
    const h = fn(x, z);
    return Number.isFinite(h) ? h : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * 在以 (x, z) 为心、r 为半径的圆域上采 17 个点（圆心 + 内外两环各 8 向），返回高程统计。
 *
 * - `min` 用作落基面：岩石平底压到该高程以下，斜坡上也绝不会悬空。
 *   **外环必须覆盖岩石的真实水平范围**，否则脚边的地形塌下去就会露出缝隙。
 * - `max − min` 是 footprint 内的地形起伏（relief），用来筛掉太陡的坡：
 *   坡太陡时"底面压到最低点"会把整块岩石埋进山坡里，只剩一点点露头。
 *
 * @param {(x:number,z:number)=>number} fn 高程函数
 * @param {number} x 中心 X
 * @param {number} z 中心 Z
 * @param {number} r 采样半径（米），应取岩石的水平最大半径
 * @returns {{min:number, max:number, center:number}} 高程统计
 */
function sampleGround(fn, x, z, r) {
  const center = safeHeight(fn, x, z);
  let min = center;
  let max = center;
  const ring = 8;
  for (let k = 0; k < 2; k++) {
    const rr = r * (k === 0 ? 0.55 : 1.0);
    for (let i = 0; i < ring; i++) {
      // 内外环错开半格，采样点分布更均匀
      const a = ((i + k * 0.5) / ring) * TWO_PI;
      const h = safeHeight(fn, x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return { min, max, center };
}

/**
 * 点到线段的最短距离（平面 XZ）。
 * @param {number} px 点 X
 * @param {number} pz 点 Z
 * @param {number} ax 段起点 X
 * @param {number} az 段起点 Z
 * @param {number} bx 段终点 X
 * @param {number} bz 段终点 Z
 * @returns {number} 距离（米）
 */
function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  let t = 0;
  if (len2 > 1e-9) t = clamp(((px - ax) * vx + (pz - az) * vz) / len2, 0, 1);
  const dx = px - (ax + vx * t);
  const dz = pz - (az + vz * t);
  return Math.hypot(dx, dz);
}

/**
 * 点到整套小径折线的最短距离。
 * @param {number} x 点 X
 * @param {number} z 点 Z
 * @param {number[][][]} paths 折线数组，每条折线是 [[x,z], ...]
 * @returns {number} 距离（米）
 */
function distToPaths(x, z, paths) {
  let best = Infinity;
  for (let i = 0; i < paths.length; i++) {
    const line = paths[i];
    for (let j = 0; j + 1 < line.length; j++) {
      const d = distToSegment(x, z, line[j][0], line[j][1], line[j + 1][0], line[j + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * 从 CityPlan 的公园多边形取轴对齐包围盒；缺失时退回硬编码值。
 * @param {Object|null} plan CityPlan（契约 §4.1）
 * @returns {{minX:number, maxX:number, minZ:number, maxZ:number}} 公园范围
 */
function parkBounds(plan) {
  const poly = plan && Array.isArray(plan.parkPolygon) ? plan.parkPolygon : null;
  if (!poly || poly.length < 3) return { ...PARK_FALLBACK };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    if (!p || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  }
  if (!Number.isFinite(minX) || maxX - minX < 50 || maxZ - minZ < 50) return { ...PARK_FALLBACK };
  return { minX, maxX, minZ, maxZ };
}

/**
 * 构造一套**合理的公园主路网**用于排斥采样（见文件头「契约差异说明」）。
 * 由一条内缩的环形主路（切角矩形，模拟中央公园 Park Drive）、
 * 3 条横穿小径与 1 条斜向林荫道组成。
 *
 * @param {{minX:number, maxX:number, minZ:number, maxZ:number}} b 公园范围
 * @returns {number[][][]} 折线数组
 */
function buildPathNetwork(b) {
  const inset = 64;
  const x0 = b.minX + inset;
  const x1 = b.maxX - inset;
  const z0 = b.minZ + inset;
  const z1 = b.maxZ - inset;
  const cut = Math.min(78, (x1 - x0) * 0.32, (z1 - z0) * 0.16);

  /** 环形主路：切掉四个直角，近似真实环道的圆角 */
  const loop = [
    [x0 + cut, z0], [x1 - cut, z0],
    [x1, z0 + cut], [x1, z1 - cut],
    [x1 - cut, z1], [x0 + cut, z1],
    [x0, z1 - cut], [x0, z0 + cut],
    [x0 + cut, z0]
  ];

  const paths = [loop];

  // 3 条东西向横穿径（对应真实的 Transverse Road）
  const fractions = [0.22, 0.5, 0.78];
  for (let i = 0; i < fractions.length; i++) {
    const z = lerp(b.minZ, b.maxZ, fractions[i]);
    paths.push([[b.minX, z], [b.maxX, z]]);
  }

  // 1 条斜向林荫道（The Mall）
  paths.push([
    [lerp(b.minX, b.maxX, 0.28), lerp(b.minZ, b.maxZ, 0.86)],
    [lerp(b.minX, b.maxX, 0.55), lerp(b.minZ, b.maxZ, 0.38)]
  ]);

  return paths;
}

/* ------------------------------------------------------------------ *
 * 单块岩石的雕刻参数
 * ------------------------------------------------------------------ */

/**
 * 用一条独立 rng 子流抽出一块岩石的全部形态参数。
 * 「每块岩石用不同的 rng 子流 → 形态、大小、朝向都不同」即由此保证。
 *
 * 所有**空间频率**（层厚、细胞尺寸、中频细节尺寸）都以「顶点平均间距」为单位抽取，
 * 而不是写死米数。这样无论岩石多大、细分几级，雕刻特征始终跨越 2~4 个顶点，
 * 既不会被欠采样成噪点，也不会因为过度平滑而看不出层理。
 *
 * @param {import('../core/rng.js').Rng} rng 该岩石专属子流
 * @param {number} size 目标最大水平尺寸（米，3~14）
 * @param {number} level 细分级数（2~4，见 ICO_DETAIL_BY_LEVEL）
 * @param {boolean} isDebris 是否为附属碎石（碎石更棱角、更少苔藓）
 * @returns {Object} 形态参数
 */
function rollRockParams(rng, size, level, isDebris) {
  // —— 各向异性：露头是被冰川磨平的扁平丘，不是球 ——
  let ax = rng.range(0.80, 1.26);
  let az = rng.range(0.80, 1.26);
  const aMax = Math.max(ax, az);
  ax /= aMax;
  az /= aMax; // 归一化后 max(ax, az) = 1，使 2·radius 即为最大水平尺寸
  const ay = isDebris ? rng.range(0.46, 0.86) : rng.range(0.40, 0.74);

  const radius = size * 0.5;

  // —— 片理面法线 nb：与铅垂线成 8°~46° 倾角（曼哈顿片岩片理陡倾） ——
  const dip = rng.range(8, 46) * DEG2RAD;
  const strike = rng.range(0, TWO_PI);
  const sinD = Math.sin(dip);
  const nb = { x: sinD * Math.cos(strike), y: Math.cos(dip), z: sinD * Math.sin(strike) };

  // —— 顶点平均间距：球面积 4πr² 均摊到 V 个顶点，s ≈ 2r·√(π/V) ——
  const spacing = 2 * radius * Math.sqrt(Math.PI / icoVertexCount(level));

  // —— 层厚 ≈ 2~4 倍顶点间距：阶步刚好能被网格解析出来 ——
  const layerT = spacing * rng.range(2.2, 3.6);

  return {
    radius,
    level,
    icoDetail: ICO_DETAIL_BY_LEVEL[level],
    spacing,
    ax,
    ay,
    az,
    nb,
    /** 低频轮廓起伏幅度（半径的相对量） */
    lump: rng.range(0.18, 0.32),
    /** 中频细节幅度（半径的相对量） */
    detailAmp: rng.range(0.05, 0.10),
    /** 中频细节的特征尺寸（米，≈ 2~3.3 倍顶点间距） */
    detailFeature: spacing * rng.range(2.0, 3.3),
    /** Worley 细胞边长（米，≈ 2.6~4.6 倍顶点间距） */
    cellSize: spacing * rng.range(2.6, 4.6),
    /** 节理缝深度（半径的相对量） */
    chipJoint: rng.range(0.035, 0.078),
    /** 被整块剥落的细胞比例 */
    spallP: rng.range(0.16, 0.34),
    /** 剥落坑深度（半径的相对量） */
    spallDepth: rng.range(0.05, 0.12),
    layerT,
    /** 阶梯量化强度：越大台阶越锐（上限 0.62，再高相邻层会拉扯到自交） */
    layerFlatten: isDebris ? rng.range(0.40, 0.62) : rng.range(0.34, 0.60),
    /** 逐层横向外伸抖动幅度 */
    layerAmp: rng.range(0.035, 0.095),
    /** 层号散列的盐（保证不同岩石层序不同） */
    layerSalt: rng.range(-9000, 9000),
    /** 底部切平面高度（相对 radius·ay） */
    baseCut: rng.range(0.40, 0.62),
    /** 埋入土中的比例（占岩石总高） */
    sinkFrac: isDebris ? rng.range(0.32, 0.55) : rng.range(0.15, 0.30),
    /** 朝向 */
    yaw: rng.range(0, TWO_PI),
    tiltAngle: rng.range(0, isDebris ? 14 : 6.5) * DEG2RAD,
    tiltAzimuth: rng.range(0, TWO_PI),
    /** 噪声域偏移：让每块岩石采样到噪声场的不同区域 */
    off1: [rng.range(-500, 500), rng.range(-500, 500), rng.range(-500, 500)],
    off2: [rng.range(-500, 500), rng.range(-500, 500), rng.range(-500, 500)],
    off3: [rng.range(-500, 500), rng.range(-500, 500), rng.range(-500, 500)],
    /** Worley 双平面的两个独立种子 */
    seedA: rng.int(1, 0x3fffffff),
    seedB: rng.int(1, 0x3fffffff),
    // —— 着色参数 ——
    /** 暗色矿脉的条带间距（米） */
    veinPitch: layerT * rng.range(1.5, 3.4),
    veinStrength: rng.range(0.45, 0.88),
    quartzStrength: rng.range(0.18, 0.55),
    rustAmount: isDebris ? rng.range(0.06, 0.20) : rng.range(0.05, 0.28),
    mossAmount: isDebris ? rng.range(0.05, 0.22) : rng.range(0.18, 0.62),
    lichenAmount: rng.range(0.05, 0.26),
    /** 基调整体明暗偏移 */
    toneBias: rng.range(-0.12, 0.12)
  };
}

/* ------------------------------------------------------------------ *
 * 核心：逐顶点雕刻
 * ------------------------------------------------------------------ */

/**
 * 雕刻一块岩石的**局部空间**几何（原点在岩石中心，+Y 向上，未旋转未平移）。
 *
 * @param {Object} P `rollRockParams` 的输出
 * @param {(x:number,y:number,z:number)=>number} noiseShape 低频轮廓噪声
 * @param {(x:number,y:number,z:number)=>number} noiseDetail 中频细节噪声
 * @returns {{geometry:THREE.BufferGeometry, bedding:Float32Array}}
 *          索引化几何（已 computeVertexNormals）与逐顶点的片理坐标（供矿脉着色）
 */
function sculptRock(P, noiseShape, noiseDetail) {
  // 单位球 → 删除 uv（本模块只用顶点色，不需要 uv，删掉还能让 mergeVertices 完全合并接缝）
  const raw = new THREE.IcosahedronGeometry(1, P.icoDetail);
  raw.deleteAttribute('uv');
  // 索引化：L=4 的 15360 个非索引顶点合并为 2562 个，位移与着色计算量降到 1/6
  const geometry = mergeVertices(raw);
  raw.dispose();

  const pos = geometry.attributes.position;
  const arr = pos.array;
  const count = pos.count;
  const bedding = new Float32Array(count);

  const { radius, ax, ay, az, nb } = P;
  const detailFreq = 1 / Math.max(1e-3, P.detailFeature);
  const baseY = -radius * ay * P.baseCut;
  const invCell = 1 / P.cellSize;
  const spallThreshold = P.spallP;

  // 层号 → 横向外伸倍率的查表。层数是有限的（约 ±radius/layerT，通常十来层），
  // 预先算好即可省掉每顶点一次 hash2D（其内部走 DataView 位提取，在热循环里偏慢）。
  const maxExtent = radius * (1 + P.lump) * 1.35;
  const kMin = Math.floor(-maxExtent / P.layerT) - 2;
  const kMax = Math.ceil(maxExtent / P.layerT) + 2;
  const layerScales = new Float32Array(kMax - kMin + 1);
  for (let k = kMin; k <= kMax; k++) {
    layerScales[k - kMin] = 1 + P.layerAmp * (hash2D(k, P.layerSalt, 0x5c4517) * 2 - 1);
  }

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;

    // 单位方向（IcosahedronGeometry 顶点本就在单位球上，仍归一化以防浮点漂移）
    let dx = arr[i3];
    let dy = arr[i3 + 1];
    let dz = arr[i3 + 2];
    const invLen = 1 / Math.max(1e-9, Math.hypot(dx, dy, dz));
    dx *= invLen;
    dy *= invLen;
    dz *= invLen;

    // ---- (1) 低频 fbm 调制半径：整体块状轮廓 ----
    const n1 = fbm3D(
      noiseShape,
      dx * 1.25 + P.off1[0], dy * 1.25 + P.off1[1], dz * 1.25 + P.off1[2],
      FBM_SHAPE
    );
    const r = radius * (1 + P.lump * n1);

    // ---- (2) 各向异性缩放：扁平的露头 ----
    let px = dx * ax * r;
    let py = dy * ay * r;
    let pz = dz * az * r;

    // ---- (3) 中频 fbm 沿方向凸凹 ----
    const n2 = fbm3D(
      noiseDetail,
      px * detailFreq + P.off2[0], py * detailFreq + P.off2[1], pz * detailFreq + P.off2[2],
      FBM_DETAIL
    );
    const bump = radius * P.detailAmp * n2;
    px += dx * bump;
    py += dy * bump;
    pz += dz * bump;

    // ---- (4) Worley 块状剥落 ----
    // 两个正交平面上的 2D 细胞场取交，等效一个无接缝的伪 3D 节理网络
    // （直接用球面 atan2 参数化会在 ±π 处留下可见的缝合疤痕）。
    const w1 = worley2D(px, pz, P.seedA, P.cellSize);
    const w2 = worley2D(py, (px - pz) * 0.70710678, P.seedB, P.cellSize);
    // 节理缝：F2−F1 → 0 处即细胞边界（Worley 1996 的经典裂纹场）
    const joint = Math.min(w1.f2 - w1.f1, w2.f2 - w2.f1) * invCell;
    const jointCut = (1 - smoothstep(0, 0.30, joint)) * P.chipJoint;
    // 块状剥落：按细胞 id 抽签，中签的整块细胞向内凹成剥落坑
    let spallCut = 0;
    if (((w1.id >>> 9) & 1023) / 1024 < spallThreshold) {
      spallCut = P.spallDepth * (1 - smoothstep(P.cellSize * 0.50, P.cellSize * 0.95, w1.f1));
    }
    const cut = (jointCut + spallCut) * radius;
    px -= dx * cut;
    py -= dy * cut;
    pz -= dz * cut;

    // ---- (5) 层理切削：沿片理法线 nb 做阶梯量化 + 逐层横向外伸抖动 ----
    const s = px * nb.x + py * nb.y + pz * nb.z;
    const k = Math.floor(s / P.layerT);
    // 该层的横向外伸倍率（整数层号的空间散列 → 厚薄不一的板岩堆叠）
    const ki = k - kMin;
    const layerScale = ki >= 0 && ki < layerScales.length
      ? layerScales[ki]
      : 1 + P.layerAmp * (hash2D(k, P.layerSalt, 0x5c4517) * 2 - 1);
    // 垂直于 nb 的分量
    const perpX = px - s * nb.x;
    const perpY = py - s * nb.y;
    const perpZ = pz - s * nb.z;
    // 沿 nb 吸附向层中面：相邻层的顶点被拉开，中间的三角形被拉成陡立的阶步
    const s2 = s + ((k + 0.5) * P.layerT - s) * P.layerFlatten;
    px = perpX * layerScale + s2 * nb.x;
    py = perpY * layerScale + s2 * nb.y;
    pz = perpZ * layerScale + s2 * nb.z;
    bedding[i] = s2;

    // ---- (6) 底部压平：切平面以下强压缩成近似平底 ----
    if (py < baseY) py = baseY + (py - baseY) * 0.10;

    arr[i3] = px;
    arr[i3 + 1] = py;
    arr[i3 + 2] = pz;
  }

  pos.needsUpdate = true;
  // 位移之后原始球面法线完全失效，必须重算，否则光照平坦难看（契约明确要求）
  geometry.computeVertexNormals();

  return { geometry, bedding };
}

/**
 * 给已经变换到**世界空间**的岩石几何写入顶点色。
 *
 * 配方（自下而上叠加）：
 *   基调斑驳（灰↔灰白） → 沿层理的黑云母暗色矿脉 → 石英白脉 → 铁质锈染
 *   → 朝上面苔藓（法线 y 判定） → 侧面地衣斑 → 贴地处环境遮蔽压暗
 *
 * @param {THREE.BufferGeometry} geometry 已应用旋转+平移的几何
 * @param {Float32Array} bedding 逐顶点片理坐标（局部空间，与顶点索引一一对应）
 * @param {Object} P 形态参数
 * @param {number} groundY 该岩石落基面高程（米），用于底部压暗
 * @param {(x:number,y:number,z:number)=>number} noiseShape 低频噪声
 * @param {(x:number,y:number,z:number)=>number} noiseDetail 中频噪声
 * @returns {void}
 */
function paintRock(geometry, bedding, P, groundY, noiseShape, noiseDetail) {
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const count = pos.count;
  const posArr = pos.array;
  const nrmArr = nrm.array;
  const colors = new Float32Array(count * 3);

  const invVein = 1 / Math.max(1e-4, P.veinPitch);
  const { light, mid, dark, rust, moss, lichen } = PALETTE;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const wx = posArr[i3];
    const wy = posArr[i3 + 1];
    const wz = posArr[i3 + 2];
    const ny = nrmArr[i3 + 1];

    // 三次噪声采样撑起全部色彩变化（频率各异，复用以控制构建耗时）
    const nMottle = fbm3D(
      noiseDetail,
      wx * 0.16 + P.off3[0], wy * 0.16 + P.off3[1], wz * 0.16 + P.off3[2],
      FBM_MOTTLE
    );
    const nFine = fbm3D(
      noiseShape,
      wx * 0.62 + P.off2[0], wy * 0.62 + P.off2[1], wz * 0.62 + P.off2[2],
      FBM_FINE
    );
    const nMoss = fbm3D(
      noiseDetail,
      wx * 0.27 + P.off1[0], wy * 0.27 + P.off1[1], wz * 0.27 + P.off1[2],
      FBM_MOSS
    );

    // —— 基调：灰 ↔ 灰白斑驳 ——
    const toneT = clamp(0.5 + 0.5 * nMottle + P.toneBias, 0, 1);
    let cr = lerp(mid[0], light[0], toneT);
    let cg = lerp(mid[1], light[1], toneT);
    let cb = lerp(mid[2], light[2], toneT);

    // —— 黑云母暗色矿脉：沿片理方向的周期条带；|sin| 给出连续带状轮廓，
    //     再用细噪声调制粗细，避免出现机械等距的条纹 ——
    const phase = bedding[i] * invVein;
    const band = Math.abs(Math.sin(Math.PI * phase));
    const veinT = clamp(
      smoothstep(0.52, 0.99, band) * P.veinStrength * (0.55 + 0.75 * (0.5 + 0.5 * nFine)),
      0, 1
    );
    cr = lerp(cr, dark[0], veinT);
    cg = lerp(cg, dark[1], veinT);
    cb = lerp(cb, dark[2], veinT);

    // —— 石英白脉：错开半个相位的窄亮带 ——
    const qBand = Math.abs(Math.sin(Math.PI * (phase * 0.5 + 0.31)));
    const quartzT = clamp(smoothstep(0.94, 1.0, qBand) * P.quartzStrength * (0.4 + 0.6 * (0.5 + 0.5 * nFine)), 0, 1);
    cr = lerp(cr, light[0] * 1.12, quartzT);
    cg = lerp(cg, light[1] * 1.12, quartzT);
    cb = lerp(cb, light[2] * 1.10, quartzT);

    // —— 铁质锈染：低频噪声过阈值成片 ——
    const rustT = smoothstep(0.40, 0.86, 0.5 + 0.5 * nMottle) * P.rustAmount;
    cr = lerp(cr, rust[0], rustT);
    cg = lerp(cg, rust[1], rustT);
    cb = lerp(cb, rust[2], rustT);

    // —— 苔藓：**只长在朝上面**（法线 y 判定），再用噪声打散成斑块 ——
    // 阈值取在 fbm 的实际分布区间内（fbm 极少触及 ±1，落在 0.5±0.35 居多），
    // 否则 smoothstep 会把绝大部分顶点压成 0，苔藓淡到看不见。
    const upMask = smoothstep(0.34, 0.86, ny);
    const mossT = clamp(upMask * smoothstep(0.30, 0.66, 0.5 + 0.5 * nMoss) * P.mossAmount, 0, 1);
    cr = lerp(cr, moss[0], mossT);
    cg = lerp(cg, moss[1], mossT);
    cb = lerp(cb, moss[2], mossT);

    // —— 地衣：不挑朝向的小斑点，压在苔藓之外的区域 ——
    const lichenT = clamp(
      smoothstep(0.72, 0.95, 0.5 + 0.5 * nFine) * P.lichenAmount * (1 - mossT),
      0, 1
    );
    cr = lerp(cr, lichen[0], lichenT);
    cg = lerp(cg, lichen[1], lichenT);
    cb = lerp(cb, lichen[2], lichenT);

    // —— 贴地处的环境遮蔽：草土交界一圈压暗，让岩石"长"在地里而非浮在地上 ——
    const ao = 1 - 0.34 * (1 - smoothstep(groundY - 0.15, groundY + 1.25, wy));
    colors[i3] = cr * ao;
    colors[i3 + 1] = cg * ao;
    colors[i3 + 2] = cb * ao;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/* ------------------------------------------------------------------ *
 * 布点
 * ------------------------------------------------------------------ */

/**
 * 为一块岩石在公园内挑一个合法位置。
 *
 * 硬性排斥（任何时候都不放宽）：公园多边形之外、水塘名义椭圆之内、实测高程低于塘底阈值。
 * 软性排斥（多次失败后逐步放宽）：距主要小径的净空、与已有岩石的间距。
 *
 * @param {import('../core/rng.js').Rng} rng 布点用的 rng
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} b 公园范围
 * @param {number[][][]} paths 主路网
 * @param {Array<{x:number,z:number,r:number}>} placed 已放置的岩石
 * @param {number} estR 本块岩石的估计水平半径（米）
 * @param {(x:number,z:number)=>number} heightFn 地形高程函数
 * @param {((x:number,z:number)=>boolean)|null} isInPark 公园内判定
 * @param {number} minGroundY 落基面最低允许高程（无地形函数时传 -Infinity 以停用该约束）
 * @param {number} estH 岩石的估计总高（米），用于限制可接受的地形起伏
 * @returns {{x:number, z:number, groundY:number}|null} 位置与落基面高程；彻底失败返回 null
 */
function placeRock(rng, b, paths, placed, estR, heightFn, isInPark, minGroundY, estH) {
  const needPath = PATH_CLEARANCE + estR * 0.65;
  let best = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // 迟迟找不到位置就逐步放宽软约束，保证数量一定达标
    const relax = attempt < 200 ? 1 : attempt < 320 ? 0.6 : 0.3;

    const x = rng.range(b.minX + EDGE_MARGIN, b.maxX - EDGE_MARGIN);
    const z = rng.range(b.minZ + EDGE_MARGIN, b.maxZ - EDGE_MARGIN);

    // 硬约束 1：必须在公园多边形内
    if (isInPark && !isInPark(x, z)) continue;

    // 硬约束 2：整个 footprint 都要落在水塘禁区圆之外
    if (Math.hypot(x - POND.x, z - POND.z) < POND.radius + estR) continue;

    // 软约束：距小径净空 + 与已有岩石的间距
    const dPath = distToPaths(x, z, paths);
    let dGap = Infinity;
    for (let i = 0; i < placed.length; i++) {
      const o = placed[i];
      const d = Math.hypot(x - o.x, z - o.z) - (o.r + estR);
      if (d < dGap) dGap = d;
    }
    const accepted = dPath >= needPath * relax && dGap >= ROCK_GAP * relax;
    const score = Math.min(dPath - needPath, dGap - ROCK_GAP);
    // 既不合格又赢不了当前最优的候选直接丢弃，省下昂贵的高程采样
    if (!accepted && score <= bestScore) continue;

    // 硬约束 3：用实测高程兜底，落在洼地（水下）的一律弃用
    const g = sampleGround(heightFn, x, z, estR);
    if (g.min < minGroundY) continue;

    // 硬约束 4：footprint 内地形起伏不得超过岩石高度的一定比例。
    // 否则"底面压到最低点"会把岩石整个埋进山坡，只剩个别顶点露头。
    if (g.max - g.min > estH * MAX_RELIEF_RATIO) continue;

    if (accepted) return { x, z, groundY: g.min };

    bestScore = score;
    best = { x, z, groundY: g.min };
  }

  return best;
}

/* ------------------------------------------------------------------ *
 * 工厂
 * ------------------------------------------------------------------ */

/**
 * 创建中央公园的曼哈顿片岩露头群（契约 §5.7）。
 *
 * @param {{plan?:Object, rng:import('../core/rng.js').Rng, env?:Object, quality?:string, seed?:*}} ctx0
 *        构建期上下文（契约 §5）
 * @param {((x:number,z:number)=>number)|null} [parkHeightFn]
 *        公园地形高程函数（由 main.js 传入 terrain 的 `heightAtPark`）；缺省退化为 y = 0
 * @returns {{object3D: THREE.Object3D|null, dispose: () => void, stats: Object, outcrops: Array}}
 *        SystemHandle（契约 §1）
 */
export function createRocks(ctx0, parkHeightFn) {
  const ctx = ctx0 || {};
  const group = new THREE.Group();
  group.name = 'rocks';

  // 契约 §5.7：parkHeightFn 未提供则退化为 y = 0
  const hasHeightFn = typeof parkHeightFn === 'function';
  const heightFn = hasHeightFn ? parkHeightFn : () => 0;
  // 没有真实地形就没有水塘，高程兜底必须停用——否则处处 y=0 < 0.75，所有候选都会被否掉
  const minGroundY = hasHeightFn ? MIN_GROUND_Y : -Infinity;

  const rootRng = ctx.rng && typeof ctx.rng.fork === 'function'
    ? ctx.rng.fork('rocks')
    : null;
  // ctx.rng 缺失时的兜底：用一条固定种子的内部流，保证模块单独可跑（仍无 Math.random）
  const rng = rootRng || makeFallbackRng();

  const plan = ctx.plan || null;
  const isInPark = plan && typeof plan.isInPark === 'function'
    ? (x, z) => plan.isInPark(x, z)
    : null;
  const bounds = parkBounds(plan);
  const paths = buildPathNetwork(bounds);

  const quality = ctx.quality === 'low' || ctx.quality === 'medium' ? ctx.quality : 'high';
  const count = COUNT_BY_QUALITY[quality];

  // 两套共享噪声场（而不是每块岩石各建一套）：形态差异靠各自的噪声域偏移与参数子流实现，
  // 既保证"每块都不一样"，又避免重复构建置换表/梯度表的开销。
  const noiseSeed = ctx.seed === undefined || ctx.seed === null ? 'rocks' : String(ctx.seed);
  const noiseShape = makeNoise3D(noiseSeed + '|schist-shape');
  const noiseDetail = makeNoise3D(noiseSeed + '|schist-detail');

  // —— 尺寸序列：由大到小的幂律分布，保证既有大露头又有小石包 ——
  const sizeRng = rng.fork('sizes');
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const base = 13.6 - 10.2 * Math.pow(t, 0.72);
    sizes.push(clamp(base * sizeRng.range(0.90, 1.10), 3, 14));
  }

  const geometries = [];
  const placed = [];
  const outcrops = [];
  let debrisCount = 0;

  const rotMatrix = new THREE.Matrix4();
  const rotQuat = new THREE.Quaternion();
  const yawQuat = new THREE.Quaternion();
  const tiltAxis = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  /**
   * 雕刻 + 定位 + 上色一块岩石，成功则把几何压入合并队列。
   * @param {Object} P 形态参数
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @param {number} groundY 落基面高程
   * @returns {{topY:number, height:number}|null} 成功返回尺寸信息
   */
  function bakeRock(P, x, z, groundY) {
    const { geometry, bedding } = sculptRock(P, noiseShape, noiseDetail);

    // 朝向：先绕随机水平轴微倾（模拟岩层整体产状），再绕 Y 偏航
    tiltAxis.set(Math.cos(P.tiltAzimuth), 0, Math.sin(P.tiltAzimuth));
    rotQuat.setFromAxisAngle(tiltAxis, P.tiltAngle);
    yawQuat.setFromAxisAngle(UP, P.yaw);
    rotQuat.premultiply(yawQuat);
    rotMatrix.makeRotationFromQuaternion(rotQuat);
    geometry.applyMatrix4(rotMatrix);

    // 旋转之后才能量到真实的最低点与总高
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (!bb) {
      geometry.dispose();
      return null;
    }
    // 注意：translate 内部会就地刷新 boundingBox，故必须在平移前把极值取出来
    const localMinY = bb.min.y;
    const localMaxY = bb.max.y;
    const height = Math.max(0.2, localMaxY - localMinY);

    // 雕刻+旋转之后才知道真实的水平范围。用它重新量一次地面，
    // 落基面就严格覆盖岩石实际压到的每一寸地皮，不会因为估计半径偏小而露出缝隙。
    const actualR = Math.max(
      Math.abs(bb.min.x), Math.abs(bb.max.x),
      Math.abs(bb.min.z), Math.abs(bb.max.z)
    );
    const baseGroundY = Math.min(groundY, sampleGround(heightFn, x, z, actualR).min);

    // 下沉 15%~30%（碎石更多）埋入土中；底面压在 footprint 最低点之下，斜坡上也不会悬空
    const sink = height * P.sinkFrac;
    geometry.translate(x, baseGroundY - sink - localMinY, z);

    paintRock(geometry, bedding, P, baseGroundY, noiseShape, noiseDetail);

    geometries.push(geometry);
    return { topY: baseGroundY - sink + height, height };
  }

  // —— 主露头 ——
  for (let i = 0; i < count; i++) {
    const rockRng = rng.fork('outcrop-' + i);
    const size = sizes[i];
    // 只有 high 画质下的大露头值得 L=4（5120 面）；其余一律 L=3（1280 面）
    const level = quality === 'high' && size >= HIGH_DETAIL_SIZE ? 4 : 3;
    const P = rollRockParams(rockRng, size, level, false);

    // 估计水平半径（含低频起伏放大），用于布点排斥与地形采样
    const estR = P.radius * (1 + P.lump) * 1.05;
    const estH = 2 * P.radius * P.ay;
    const spot = placeRock(rockRng, bounds, paths, placed, estR, heightFn, isInPark, minGroundY, estH);
    if (!spot) continue;

    const baked = bakeRock(P, spot.x, spot.z, spot.groundY);
    if (!baked) continue;

    placed.push({ x: spot.x, z: spot.z, r: estR });
    outcrops.push({
      x: spot.x,
      z: spot.z,
      radius: P.radius,
      height: baked.height,
      topY: baked.topY
    });

    // —— 附属碎石：大露头周围散落的板状碎块，强化"基岩崩解"的地质叙事 ——
    if (size >= 7) {
      const debrisRng = rockRng.fork('debris');
      const n = debrisRng.int(1, 3);
      for (let d = 0; d < n; d++) {
        // 三个随机量一次抽齐：让每个碎石候选消耗的随机数固定，
        // 流的推进就与"这块碎石有没有被拒"解耦，调参时前后块的形态不会连锁漂移
        const a = debrisRng.range(0, TWO_PI);
        const dist = estR * debrisRng.range(1.15, 1.9);
        const dSize = debrisRng.range(0.55, 2.2);
        const dxp = spot.x + Math.cos(a) * dist;
        const dzp = spot.z + Math.sin(a) * dist;

        if (dxp < bounds.minX + EDGE_MARGIN || dxp > bounds.maxX - EDGE_MARGIN) continue;
        if (dzp < bounds.minZ + EDGE_MARGIN || dzp > bounds.maxZ - EDGE_MARGIN) continue;
        if (isInPark && !isInPark(dxp, dzp)) continue;
        if (Math.hypot(dxp - POND.x, dzp - POND.z) < POND.radius + dSize) continue;
        if (distToPaths(dxp, dzp, paths) < PATH_CLEARANCE * 0.55 + dSize) continue;

        const g = sampleGround(heightFn, dxp, dzp, dSize * 0.5);
        if (g.min < minGroundY) continue;

        const DP = rollRockParams(debrisRng, dSize, 2, true);
        if (bakeRock(DP, dxp, dzp, g.min)) debrisCount++;
      }
    }
  }

  if (geometries.length === 0) {
    return {
      object3D: null,
      dispose() {},
      stats: { rocks: 0, debris: 0, vertices: 0, triangles: 0, draws: 0 },
      outcrops: []
    };
  }

  // —— 合并：全部露头 + 碎石 → 一个几何、一个材质 = 1 个 drawcall（契约要求 ≤ 2）——
  const merged = mergeGeometries(geometries, false);
  for (let i = 0; i < geometries.length; i++) geometries[i].dispose();

  if (!merged) {
    return {
      object3D: null,
      dispose() {},
      stats: { rocks: 0, debris: 0, vertices: 0, triangles: 0, draws: 0 },
      outcrops: []
    };
  }
  merged.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, // 白底，实际颜色完全来自顶点色
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.03,
    dithering: true
  });
  material.name = 'rockSchist';
  // 接受积雪（岩顶是全城最先积雪的地方之一）与雨后湿滑；不生成水洼（那是路面的事）
  patchCityMaterial(material, ctx.env, {
    snow: true,
    snowAmount: 0.9,
    wetness: true,
    wetDarken: 0.42,
    puddles: false,
    flash: true
  });

  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'rockOutcrops';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  group.add(mesh);

  const vertices = merged.attributes.position ? merged.attributes.position.count : 0;
  const triangles = merged.index ? merged.index.count / 3 : vertices / 3;

  return {
    object3D: group,

    /**
     * 释放本模块自建的全部 GPU 资源（不触碰 ctx.textures 里的共享贴图）。
     * @returns {void}
     */
    dispose() {
      group.remove(mesh);
      merged.dispose();
      material.dispose();
    },

    stats: {
      rocks: outcrops.length,
      debris: debrisCount,
      vertices,
      triangles,
      draws: 1
    },

    /** 各露头的位置与尺寸（调试 / 其他模块避让用） */
    outcrops
  };
}

/**
 * ctx.rng 缺失时的内部兜底 RNG（LCG，绝不使用 Math.random）。
 * 正常集成路径下不会走到这里，仅保证模块可被单独 import 与测试。
 * @returns {{range:Function, int:Function, fork:Function}} 精简 Rng
 */
function makeFallbackRng() {
  let state = 0x9e3779b9;
  /** @returns {number} [0,1) */
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const api = {
    /**
     * @param {number} min 下界
     * @param {number} max 上界
     * @returns {number} [min,max)
     */
    range(min, max) {
      return min + (max - min) * next();
    },
    /**
     * @param {number} min 下界（含）
     * @param {number} max 上界（含）
     * @returns {number} 整数
     */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /**
     * @returns {Object} 同一个精简 Rng（兜底路径不要求子流隔离）
     */
    fork() {
      return api;
    }
  };
  return api;
}
