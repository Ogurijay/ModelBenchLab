/**
 * @file src/sculpt/terrain.js
 * @description 中央公园地形雕刻（契约 §5.6）。用 `PlaneGeometry` 细分后**逐顶点位移**雕出
 *              低频丘陵 / 中频起伏 / 高频细节 / 岩脊，挖出一处不规则岸线的下凹水塘，
 *              并保证公园外圈 25m 与街面（y = 0）无缝衔接。地表用顶点色着色，
 *              灌木与树丛用 `InstancedMesh` 布置。
 *
 * ---------------------------------------------------------------------------
 * 一、高程场（heightAtPark 与网格顶点使用**同一套解析函数**）
 * ---------------------------------------------------------------------------
 *   h(x,z) = edge(x,z) · [ blendBasin( base + hills + mid + fine + ridges ) + pondDepth(x,z) ]
 *
 *   - `hills`  分形布朗运动 fBm（Mandelbrot & Van Ness 1968；实现见 Ebert et al.
 *              《Texturing & Modeling: A Procedural Approach》第 16 章），
 *              波长 ≈ 265m，振幅由另一支超低频噪声在 6~9m 之间调制（契约要求 6~9m）。
 *              负向做 0.55 压缩 —— 真实公园里"缓丘多、深坑少"。
 *   - `mid`    波长 ≈ 74m 的三倍频 fBm，振幅 2.5m（契约要求 2~3m）。
 *   - `fine`   波长 ≈ 8.5m 的单倍频噪声，振幅 0.4m（契约要求 0.4m）。
 *   - `ridges` 脊状多重分形 ridged multifractal（F. K. Musgrave，同书 §16.5，
 *              signal = (1−|noise|)^sharpness），在 5 处露头带内以径向 smootherstep
 *              遮罩抬起 4.5~8.5m，模拟曼哈顿片岩基岩露头。
 *   - `pond`   椭圆盆地（长轴 260m）用 smootherstep 平滑下凹 4.5m；
 *              半径先被一支 fBm 扰动 ±0.19（≈ ±25m），因此岸线**不是正椭圆**。
 *   - `edge`   `smootherstep(25, 117, d)`，d = 到公园矩形边界的距离。
 *
 * ---------------------------------------------------------------------------
 * 二、边缘缝合（契约硬性要求）
 * ---------------------------------------------------------------------------
 * 契约要求"公园外圈 25m 内高度收敛到 0.0 ± 0.05"。这里取**最强保证**：
 * `edge` 的下沿正好落在 25m，故 d ≤ 25m 的整圈高度**恒等于 0**（误差 0，远优于 ±0.05），
 * 与街面绝对齐平，不可能出现悬空边或穿插；再往里用 smootherstep 在 92m 内过渡到完整起伏
 * （smootherstep 一阶、二阶导在两端均为 0，所以接缝处连曲率都是连续的，不会出现折角高光）。
 *
 * ---------------------------------------------------------------------------
 * 三、契约缺陷记录（按契约 §0 要求就地说明，不修改契约）
 * ---------------------------------------------------------------------------
 * 契约 §5.6 同时写了"约 220×140 段"与"边长 ≈ 4m"，二者互相矛盾：
 * 公园进深 1360m ÷ 220 段 = 6.18m，宽 560m ÷ 140 段 = 4.0m。
 * 这里以"边长"为准并略微加密（high = 200×400 段 ⇒ 2.80m × 3.40m），
 * 因为 4m 顶点间距无法解析出契约同样要求的"宽约 4m 的小径"色带；
 * low 画质回落到 110×220 段（5.09m × 6.18m），即契约标称的段数量级。
 *
 * ---------------------------------------------------------------------------
 * 四、依赖方向（契约 §0）
 * ---------------------------------------------------------------------------
 * 本模块只 import `core/*` 与 `render/shaderpatch.js`，**不 import `city/*`**。
 * 公园范围从 `ctx0.plan.parkPolygon` 的包围盒取得，缺失时回落到契约 §4.1 的 `CITY.park` 数值。
 *
 * 性能：地形 1 个 mesh + 水面 1 个 mesh + 灌木 1 个 InstancedMesh + 树丛 1 个 InstancedMesh
 * = **4 个 drawcall**（契约上限 5）。`update()` 只写 uniform 与贴图 offset，不碰几何。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng, hash2D } from '../core/rng.js';
import { makeNoise2D, makeNoise3D, fbm2D, fbm3D, ridged2D } from '../core/noise.js';
import { clamp, lerp, smoothstep, smootherstep, DEG2RAD } from '../core/mathx.js';
import { patchCityMaterial } from '../render/shaderpatch.js';

/* -------------------------------------------------------------------------- */
/* 常量                                                                        */
/* -------------------------------------------------------------------------- */

/** 公园范围兜底值（契约 §4.1 的 `CITY.park`，本模块不 import city/grid.js） */
const PARK_FALLBACK = Object.freeze({ minX: -420, maxX: 140, minZ: -2080, maxZ: -720 });

/** 外圈**完全平坦**带宽度（米）：此带内高度恒为 0，与街面缝合 */
const EDGE_FLAT = 25;
/** 由平坦带过渡到完整起伏所用的距离（米） */
const EDGE_RAMP = 92;

/** 地形基准抬高（米）——让公园整体略高于街面，排水合理 */
const BASE_LIFT = 2.2;
/** 低频丘陵波长（米） */
const HILL_WAVELENGTH = 265;
/** 中频起伏波长（米） */
const MID_WAVELENGTH = 74;
/** 高频细节波长（米） */
const FINE_WAVELENGTH = 8.5;
/** 中频起伏振幅（米，契约 2~3m） */
const MID_AMPLITUDE = 2.5;
/** 高频细节振幅（米，契约 0.4m） */
const FINE_AMPLITUDE = 0.4;
/** 丘陵负向压缩系数（缓丘多、深坑少） */
const HILL_NEG_SQUASH = 0.55;

/** fBm / ridged 参数 */
const HILL_OPTS = Object.freeze({ octaves: 4, lacunarity: 2.03, gain: 0.5 });
const MID_OPTS = Object.freeze({ octaves: 3, lacunarity: 2.11, gain: 0.55 });
const SHORE_OPTS = Object.freeze({ octaves: 3, lacunarity: 2.05, gain: 0.55 });
const RIDGE_OPTS = Object.freeze({ octaves: 4, lacunarity: 2.07, gain: 0.52, sharpness: 2.2 });

/** 水塘几何参数：中心 (−150, −1500)，长轴 2a = 260m（契约 §5.6） */
const POND_X = -150;
const POND_Z = -1500;
const POND_A = 130;
const POND_B = 78;
/** 椭圆长轴相对 +X 的旋转角（弧度），让水塘走向不与街网平行 */
const POND_ROT = 0.42;
const POND_COS = Math.cos(POND_ROT);
const POND_SIN = Math.sin(POND_ROT);
/** 岸线噪声扰动幅度（归一化半径单位；0.19 × 130 ≈ ±25m） */
const POND_SHORE_JITTER = 0.19;
/** 盆地最大下凹深度（米，契约 4.5m） */
const POND_DEPTH = 4.5;
/** 盆地外围地形被压平到的岸边基准高程（米） */
const SHORE_LEVEL = 1.7;
/** 压平强度（0..1）；保证水面四周永远高于水位，水不会漫出 */
const SHORE_FLATTEN = 0.94;
/** 水面高程（米） */
const WATER_LEVEL = 0.3;
/** 水面网格最外圈的归一化半径（此处地形必定高于水位，多余部分被地形遮住） */
const WATER_RIM_R = 1.02;

/** 岩脊露头锚点（世界坐标，已避开水塘与主园路走廊） */
const RIDGE_ANCHORS = Object.freeze([
  [-200, -900],
  [-60, -1250],
  [-300, -2000],
  [100, -1700],
  [-230, -1650]
]);

/** 园路中心线控制点（世界坐标 [x, z]），会再叠加种子抖动 */
const PATH_DEFS = Object.freeze([
  // 西侧主园路（南北纵贯）
  [[-352, -742], [-318, -905], [-350, -1085], [-312, -1268], [-346, -1452],
    [-306, -1640], [-338, -1826], [-300, -1985], [-318, -2062]],
  // 东侧主园路
  [[62, -742], [28, -908], [66, -1092], [24, -1276], [58, -1462],
    [20, -1648], [54, -1832], [16, -1990], [36, -2062]],
  // 北横道（连通东西两侧街面）
  [[-418, -1102], [-300, -1064], [-176, -1128], [-52, -1070], [74, -1112], [138, -1088]],
  // 南横道
  [[-418, -1848], [-296, -1806], [-168, -1872], [-44, -1808], [80, -1856], [138, -1830]]
]);

/** 环湖小径所在的归一化半径（1.0 = 名义岸线） */
const LAKE_LOOP_R = 1.4;
/** 小径半宽（米）：核心 2m ⇒ 宽 4m（契约要求） */
const PATH_HALF_WIDTH = 2.0;
/** 小径色带软化到 0 的半宽（米） */
const PATH_FADE_WIDTH = 3.6;
/** 园路距离查询的最大关心半径（米） */
const PATH_MAX_DIST = 7.0;
/** 园路距离加速网格的格边长（米） */
const PATH_CELL = 12;

/** 按画质分档的地形细分段数 */
const RESOLUTION = Object.freeze({
  high: { sx: 200, sz: 400 },
  medium: { sx: 150, sz: 300 },
  low: { sx: 110, sz: 220 }
});

/** 按画质分档的植被实例数（契约要求 ≥ 400） */
const FOLIAGE_COUNT = Object.freeze({
  high: { trees: 230, bushes: 350 },
  medium: { trees: 190, bushes: 300 },
  low: { trees: 150, bushes: 262 }
});

/** 地表调色板（sRGB 十六进制，THREE.Color 会自动转到线性工作空间） */
const COL_GRASS_DEEP = 0x33501f;
const COL_GRASS_MID = 0x50702c;
const COL_GRASS_DRY = 0x7f8c46;
const COL_SOIL = 0x5e4c35;
const COL_ROCK = 0x7d7a70;
const COL_PATH = 0xa39a86;
const COL_WETLAND = 0x3d4a24;
const COL_SILT = 0x2a3326;

/* -------------------------------------------------------------------------- */
/* 可平铺程序化贴图（全部代码生成，禁止外部资产）                                  */
/* -------------------------------------------------------------------------- */

/**
 * 生成一层**可无缝平铺**的 value-noise 晶格（周期为 `period` 的整数格）。
 * 先把晶格值一次性算好，后续双线性采样只做数组读取，避免在每像素上重复散列。
 * @param {number} period 晶格周期（整数）
 * @param {number} seed 种子
 * @returns {Float32Array} 长度 period²，行主序
 */
function buildLattice(period, seed) {
  const out = new Float32Array(period * period);
  for (let y = 0; y < period; y++) {
    for (let x = 0; x < period; x++) {
      out[y * period + x] = hash2D(x, y, seed);
    }
  }
  return out;
}

/**
 * 在周期晶格上做双线性 + Perlin 平滑插值（f²(3−2f)）采样，天然无缝。
 * @param {Float32Array} lat 晶格
 * @param {number} period 周期
 * @param {number} x 采样点（晶格单位）
 * @param {number} y 采样点（晶格单位）
 * @returns {number} [0,1]
 */
function sampleLattice(lat, period, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const ix0 = ((x0 % period) + period) % period;
  const iy0 = ((y0 % period) + period) % period;
  const ix1 = (ix0 + 1) % period;
  const iy1 = (iy0 + 1) % period;
  const a = lat[iy0 * period + ix0];
  const b = lat[iy0 * period + ix1];
  const c = lat[iy1 * period + ix0];
  const d = lat[iy1 * period + ix1];
  return (a + (b - a) * ux) + ((c - a) + (a - b - c + d) * ux) * uy;
}

/**
 * 生成一张可平铺的 fBm 高度图（供法线贴图使用）。
 * @param {number} size 边长（像素）
 * @param {number} basePeriod 首倍频晶格周期（整数）
 * @param {number} octaves 倍频数
 * @param {number} seed 种子
 * @returns {Float32Array} size² 的高度，值域约 [0,1]
 */
function tileableFbmImage(size, basePeriod, octaves, seed) {
  const lattices = [];
  let period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    lattices.push({ lat: buildLattice(period, seed + o * 7919), period });
    period *= 2;
  }
  const img = new Float32Array(size * size);
  const inv = 1 / size;
  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      let amp = 1;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        const L = lattices[o];
        sum += amp * sampleLattice(L.lat, L.period, u * L.period, v * L.period);
        norm += amp;
        amp *= 0.5;
      }
      img[y * size + x] = sum / norm;
    }
  }
  return img;
}

/**
 * 把高度图用中心差分转成切线空间法线贴图（DataTexture，RGBA8）。
 * 法线约定：n = normalize(−dh/du, −dh/dv, 1/strength)，OpenGL 绿通道朝上。
 * @param {Float32Array} img 高度图
 * @param {number} size 边长
 * @param {number} strength 起伏强度
 * @returns {THREE.DataTexture} 数据类贴图（保持 NoColorSpace）
 */
function heightToNormalTexture(img, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const wrap = (i) => ((i % size) + size) % size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hl = img[y * size + wrap(x - 1)];
      const hr = img[y * size + wrap(x + 1)];
      const hd = img[wrap(y - 1) * size + x];
      const hu = img[wrap(y + 1) * size + x];
      const dx = (hr - hl) * strength;
      const dy = (hu - hd) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const o = (y * size + x) * 4;
      data[o] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 生成水面涟漪法线贴图：几组**整数频率**的方向正弦波（保证无缝）叠加一层可平铺 fBm。
 * @param {number} size 边长
 * @param {number} seed 种子
 * @returns {THREE.DataTexture} 水面法线贴图
 */
function createWaterNormalTexture(size, seed) {
  const fbmImg = tileableFbmImage(size, 4, 4, seed + 313);
  const img = new Float32Array(size * size);
  const TAU = Math.PI * 2;
  // 4 组整数频率的行波：频率为整数 ⇒ 在 [0,1) 上首尾相接，平铺无缝
  const waves = [
    { fx: 3, fy: 1, amp: 0.34, phase: 0.0 },
    { fx: -2, fy: 3, amp: 0.26, phase: 1.1 },
    { fx: 5, fy: -4, amp: 0.15, phase: 2.4 },
    { fx: -7, fy: -6, amp: 0.09, phase: 0.7 }
  ];
  const inv = 1 / size;
  for (let y = 0; y < size; y++) {
    const v = y * inv;
    for (let x = 0; x < size; x++) {
      const u = x * inv;
      let h = 0;
      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        h += w.amp * Math.sin(TAU * (w.fx * u + w.fy * v) + w.phase);
      }
      img[y * size + x] = h * 0.5 + 0.5 + (fbmImg[y * size + x] - 0.5) * 0.35;
    }
  }
  return heightToNormalTexture(img, size, 2.6);
}

/* -------------------------------------------------------------------------- */
/* 园路：样条 → 折线 → 均匀网格加速的最近距离查询                                 */
/* -------------------------------------------------------------------------- */

/**
 * 点到线段的最短距离平方。
 * @param {number} px 点 X
 * @param {number} pz 点 Z
 * @param {number} ax 段起点 X
 * @param {number} az 段起点 Z
 * @param {number} bx 段终点 X
 * @param {number} bz 段终点 Z
 * @returns {number} 距离平方
 */
function distSqToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 1e-12 ? (wx * vx + wz * vz) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = wx - vx * t;
  const dz = wz - vz * t;
  return dx * dx + dz * dz;
}

/**
 * 建立园路折线的均匀网格索引，提供 O(1) 近邻距离查询。
 *
 * 每条线段被登记进"其包围盒外扩 `PATH_MAX_DIST` 后所覆盖的全部格子"，
 * 因此查询时只需看采样点**所在的那一个格子**即可保证不漏（若点距某段 ≤ 7m，
 * 该点必然落在该段外扩包围盒内，也就必然在被登记的格子里）。
 *
 * @param {Array<Float64Array>} polylines 折线数组，每条为 [x0,z0,x1,z1,...]
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} bounds 公园范围
 * @returns {(x:number,z:number)=>number} 距离查询函数（上限 PATH_MAX_DIST）
 */
function buildPathField(polylines, bounds) {
  const segs = [];
  for (let p = 0; p < polylines.length; p++) {
    const pts = polylines[p];
    for (let i = 0; i + 3 < pts.length; i += 2) {
      segs.push(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
    }
  }
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / PATH_CELL) + 1);
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / PATH_CELL) + 1);
  /** @type {Array<number[]|null>} */
  const grid = new Array(cols * rows).fill(null);

  const segCount = segs.length / 4;
  for (let s = 0; s < segCount; s++) {
    const ax = segs[s * 4];
    const az = segs[s * 4 + 1];
    const bx = segs[s * 4 + 2];
    const bz = segs[s * 4 + 3];
    const x0 = Math.min(ax, bx) - PATH_MAX_DIST;
    const x1 = Math.max(ax, bx) + PATH_MAX_DIST;
    const z0 = Math.min(az, bz) - PATH_MAX_DIST;
    const z1 = Math.max(az, bz) + PATH_MAX_DIST;
    const c0 = clamp(Math.floor((x0 - bounds.minX) / PATH_CELL), 0, cols - 1);
    const c1 = clamp(Math.floor((x1 - bounds.minX) / PATH_CELL), 0, cols - 1);
    const r0 = clamp(Math.floor((z0 - bounds.minZ) / PATH_CELL), 0, rows - 1);
    const r1 = clamp(Math.floor((z1 - bounds.minZ) / PATH_CELL), 0, rows - 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * cols + c;
        if (grid[k] === null) grid[k] = [];
        grid[k].push(s);
      }
    }
  }

  const maxSq = PATH_MAX_DIST * PATH_MAX_DIST;

  /**
   * 查询某点到最近园路中心线的距离。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {number} 距离（米），超过 PATH_MAX_DIST 时直接返回 PATH_MAX_DIST
   */
  return function pathDistance(x, z) {
    const c = Math.floor((x - bounds.minX) / PATH_CELL);
    const r = Math.floor((z - bounds.minZ) / PATH_CELL);
    if (c < 0 || c >= cols || r < 0 || r >= rows) return PATH_MAX_DIST;
    const bucket = grid[r * cols + c];
    if (bucket === null) return PATH_MAX_DIST;
    let best = maxSq;
    for (let i = 0; i < bucket.length; i++) {
      const s = bucket[i] * 4;
      const d = distSqToSegment(x, z, segs[s], segs[s + 1], segs[s + 2], segs[s + 3]);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
}

/* -------------------------------------------------------------------------- */
/* 植被几何                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 把几何转成非索引形式（已是非索引则原样返回，避免 three 打印"already non-indexed"警告）。
 * @param {THREE.BufferGeometry} geo 输入
 * @returns {THREE.BufferGeometry} 非索引几何
 */
function toNonIndexedSafe(geo) {
  return geo.index ? geo.toNonIndexed() : geo;
}

/**
 * 给几何写入顶点色属性。
 * @param {THREE.BufferGeometry} geo 目标几何（非索引）
 * @param {(x:number,y:number,z:number,out:THREE.Color)=>void} fn 逐顶点着色回调
 * @returns {THREE.BufferGeometry} 同一个几何
 */
function paintGeometry(geo, fn) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * 用 3D fBm 把球面几何逐顶点位移成蓬松的树冠/灌木团块（"雕刻"手法）。
 * 位移只沿顶点方向缩放，因此**同位置的重复顶点得到完全相同的结果**，非索引几何不会撕裂。
 * @param {THREE.BufferGeometry} geo 球面几何（IcosahedronGeometry）
 * @param {(x:number,y:number,z:number)=>number} noise3 3D 噪声采样器
 * @param {number} radius 名义半径
 * @param {number} amount 位移幅度（相对半径）
 * @param {number[]} offset 噪声域偏移 [ox, oy, oz]，让每个团块形态不同
 * @returns {THREE.BufferGeometry} 同一个几何
 */
function sculptBlob(geo, noise3, radius, amount, offset) {
  const pos = geo.attributes.position;
  const inv = 1 / radius;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = x * inv;
    const ny = y * inv;
    const nz = z * inv;
    const d = fbm3D(
      noise3,
      nx * 2.2 + offset[0],
      ny * 2.2 + offset[1],
      nz * 2.2 + offset[2],
      { octaves: 3, gain: 0.55, lacunarity: 2.1 }
    );
    const s = 1 + amount * d;
    pos.setXYZ(i, nx * radius * s, ny * radius * s, nz * radius * s);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * 构建一棵树的合并几何（树干 + 3 团树冠），已烘焙顶点色。
 * @param {import('../core/rng.js').Rng} rng 子流 RNG
 * @param {(x:number,y:number,z:number)=>number} noise3 3D 噪声
 * @returns {THREE.BufferGeometry} 单一非索引几何
 */
function buildTreeGeometry(rng, noise3) {
  const barkTop = new THREE.Color(0x594634);
  const barkBottom = new THREE.Color(0x38291d);
  const leafLow = new THREE.Color(0x2f4a1c);
  const leafHigh = new THREE.Color(0x6d8c38);

  const trunk = toNonIndexedSafe(new THREE.CylinderGeometry(0.24, 0.48, 5.2, 7, 1, false));
  trunk.translate(0, 2.6, 0);
  paintGeometry(trunk, (x, y, z, out) => {
    out.copy(barkBottom).lerp(barkTop, clamp(y / 5.2, 0, 1));
  });

  const blobDefs = [
    { r: 2.7, detail: 1, pos: [0, 6.4, 0], flat: 0.86 },
    { r: 2.15, detail: 1, pos: [1.05, 7.9, -0.55], flat: 0.9 },
    { r: 1.85, detail: 1, pos: [-1.1, 7.4, 0.85], flat: 0.92 }
  ];
  const parts = [trunk];
  for (let i = 0; i < blobDefs.length; i++) {
    const d = blobDefs[i];
    const g = toNonIndexedSafe(new THREE.IcosahedronGeometry(d.r, d.detail));
    sculptBlob(g, noise3, d.r, 0.3, [rng.range(-40, 40), rng.range(-40, 40), rng.range(-40, 40)]);
    g.scale(1, d.flat, 1);
    g.translate(d.pos[0], d.pos[1], d.pos[2]);
    g.computeVertexNormals();
    const hue = rng.range(-0.05, 0.05);
    paintGeometry(g, (x, y, z, out) => {
      const t = clamp((y - 4.2) / 5.4, 0, 1);
      out.copy(leafLow).lerp(leafHigh, t * t);
      out.offsetHSL(hue * 0.4, 0, 0);
    });
    parts.push(g);
  }

  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  return merged;
}

/**
 * 构建一丛灌木的合并几何（3 个低模团块），已烘焙顶点色。
 * @param {import('../core/rng.js').Rng} rng 子流 RNG
 * @param {(x:number,y:number,z:number)=>number} noise3 3D 噪声
 * @returns {THREE.BufferGeometry} 单一非索引几何
 */
function buildBushGeometry(rng, noise3) {
  const low = new THREE.Color(0x2c4419);
  const high = new THREE.Color(0x5f7c32);
  const defs = [
    { r: 1.35, detail: 1, pos: [0, 0.95, 0], flat: 0.74 },
    { r: 0.95, detail: 0, pos: [1.05, 0.72, 0.42], flat: 0.8 },
    { r: 0.86, detail: 0, pos: [-0.88, 0.66, -0.55], flat: 0.8 }
  ];
  const parts = [];
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    const g = toNonIndexedSafe(new THREE.IcosahedronGeometry(d.r, d.detail));
    sculptBlob(g, noise3, d.r, 0.34, [rng.range(-40, 40), rng.range(-40, 40), rng.range(-40, 40)]);
    g.scale(1, d.flat, 1);
    g.translate(d.pos[0], d.pos[1], d.pos[2]);
    g.computeVertexNormals();
    paintGeometry(g, (x, y, z, out) => {
      out.copy(low).lerp(high, clamp(y / 2.1, 0, 1));
    });
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  return merged;
}

/* -------------------------------------------------------------------------- */
/* 工厂                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 创建中央公园地形系统（契约 §5.6）。
 *
 * @param {{plan?:Object, rng?:Object, env?:Object, quality?:string, seed?:(string|number), textures?:Object}} ctx0
 *        构建期上下文（契约 §5）
 * @returns {{
 *   object3D: THREE.Group,
 *   update: (ctx: Object) => void,
 *   dispose: () => void,
 *   heightAtPark: (x: number, z: number) => number,
 *   isInPond: (x: number, z: number) => boolean,
 *   waterLevel: number,
 *   stats: { instances: number, draws: number }
 * }} 系统句柄
 */
export function createParkTerrain(ctx0) {
  const ctx = ctx0 && typeof ctx0 === 'object' ? ctx0 : {};
  const env = ctx.env || null;
  const quality = RESOLUTION[ctx.quality] ? ctx.quality : 'high';
  const rng = ctx.rng && typeof ctx.rng.fork === 'function'
    ? ctx.rng.fork('parkTerrain')
    : makeRng(ctx.seed === undefined ? 'manhattan' : ctx.seed, 'parkTerrain');

  /* ---------------- 公园范围（从 plan.parkPolygon 取包围盒，不 import city/*）--------- */
  const bounds = { ...PARK_FALLBACK };
  const poly = ctx.plan && Array.isArray(ctx.plan.parkPolygon) ? ctx.plan.parkPolygon : null;
  if (poly && poly.length >= 3) {
    let mnX = Infinity;
    let mxX = -Infinity;
    let mnZ = Infinity;
    let mxZ = -Infinity;
    let ok = true;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) { ok = false; break; }
      if (p[0] < mnX) mnX = p[0];
      if (p[0] > mxX) mxX = p[0];
      if (p[1] < mnZ) mnZ = p[1];
      if (p[1] > mxZ) mxZ = p[1];
    }
    if (ok && mxX - mnX > 120 && mxZ - mnZ > 120) {
      bounds.minX = mnX;
      bounds.maxX = mxX;
      bounds.minZ = mnZ;
      bounds.maxZ = mxZ;
    }
  }
  const parkW = bounds.maxX - bounds.minX;
  const parkD = bounds.maxZ - bounds.minZ;
  const parkCX = (bounds.minX + bounds.maxX) * 0.5;
  const parkCZ = (bounds.minZ + bounds.maxZ) * 0.5;

  /* ---------------- 噪声与岩脊分带 ---------------- */
  const S = rng.seed >>> 0;
  const noiseHill = makeNoise2D(S + 11);
  const noiseAmp = makeNoise2D(S + 23);
  const noiseMid = makeNoise2D(S + 37);
  const noiseFine = makeNoise2D(S + 51);
  const noiseRidge = makeNoise2D(S + 67);
  const noiseShore = makeNoise2D(S + 83);
  const noiseColor = makeNoise2D(S + 97);
  const noise3 = makeNoise3D(S + 131);

  const ridgeRng = rng.fork('ridges');
  const ridgeZones = RIDGE_ANCHORS.map((a) => {
    const r = ridgeRng.range(62, 104);
    return {
      x: a[0] + ridgeRng.range(-16, 16),
      z: a[1] + ridgeRng.range(-24, 24),
      r,
      r2: r * r,
      amp: ridgeRng.range(4.5, 8.5),
      f: 1 / ridgeRng.range(58, 92)
    };
  });
  /** 岩脊归一化用的最大振幅（着色时判断"裸岩"） */
  const ridgeAmpMax = ridgeZones.reduce((m, z) => Math.max(m, z.amp), 1);

  /* ---------------- 高程解析函数（网格与 heightAtPark 共用） ---------------- */

  /** 采样结果的复用容器，避免每顶点 new 对象 */
  const sample = { h: 0, relief: 0, ridge: 0, rEff: 99, edge: 0 };

  /**
   * 公园地形解析求值：写入 `sample` 并返回它。
   *
   * 公式详见文件头注释。范围外返回 h = 0（与街面齐平）。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {{h:number,relief:number,ridge:number,rEff:number,edge:number}} 采样结果（复用对象）
   */
  function sampleTerrain(x, z) {
    sample.h = 0;
    sample.relief = 0;
    sample.ridge = 0;
    sample.rEff = 99;
    sample.edge = 0;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return sample;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return sample;

    const dEdge = Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
    const edge = smootherstep(EDGE_FLAT, EDGE_FLAT + EDGE_RAMP, dEdge);
    sample.edge = edge;
    // 外圈 25m：高度恒为 0，与街面绝对缝合
    if (edge <= 0) return sample;

    // —— 水塘局部坐标（世界 → 椭圆局部，逆旋转）——
    const dx = x - POND_X;
    const dz = z - POND_Z;
    const u = dx * POND_COS - dz * POND_SIN;
    const v = dx * POND_SIN + dz * POND_COS;
    const ua = u / POND_A;
    const vb = v / POND_B;
    const rBase = Math.sqrt(ua * ua + vb * vb);
    let rEff = rBase;
    if (rBase < 3.2) {
      const jitter = fbm2D(noiseShore, x * 0.011, z * 0.011, SHORE_OPTS);
      rEff = Math.max(0, rBase + POND_SHORE_JITTER * jitter);
    }
    sample.rEff = rEff;

    // —— 低频丘陵（振幅 6~9m，负向压缩）——
    // fbm 是多倍频归一化后的结果，实测极值只到 ±0.72 左右，先除以该值再 clamp，
    // 才能让"振幅"真正落到契约要求的 6~9m，而不是被稀释成 4~5m。
    const ampVar = 7.5 + 1.5 * noiseAmp(x * 0.00115, z * 0.00115);
    let hills = clamp(fbm2D(noiseHill, x / HILL_WAVELENGTH, z / HILL_WAVELENGTH, HILL_OPTS) / 0.72, -1, 1);
    hills = (hills >= 0 ? hills : hills * HILL_NEG_SQUASH) * ampVar;

    // —— 中频起伏 + 高频细节 ——
    const mid = clamp(fbm2D(noiseMid, x / MID_WAVELENGTH, z / MID_WAVELENGTH, MID_OPTS) / 0.7, -1, 1)
      * MID_AMPLITUDE;
    const fine = noiseFine(x / FINE_WAVELENGTH, z / FINE_WAVELENGTH) * FINE_AMPLITUDE;

    // —— 岩脊（ridged multifractal 抬起）——
    let ridge = 0;
    for (let i = 0; i < ridgeZones.length; i++) {
      const rz = ridgeZones[i];
      const ddx = x - rz.x;
      const ddz = z - rz.z;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 >= rz.r2) continue;
      const mask = 1 - smootherstep(0, rz.r, Math.sqrt(d2));
      // ridged2D 的均值约 0.55，直接用会得到一片"馒头"；先用 smoothstep 把中低段压掉，
      // 只保留脊线附近的高值，才能雕出片岩露头那种窄而硬的棱脊。
      const rr = smoothstep(0.38, 0.95, ridged2D(noiseRidge, x * rz.f, z * rz.f, RIDGE_OPTS));
      ridge += rz.amp * mask * rr;
    }
    sample.ridge = ridge;

    let relief = BASE_LIFT + hills + mid + fine + ridge;

    // —— 水塘周边压平到岸边基准高程，保证水不会从侧面漫出 ——
    if (rEff < 2.6) {
      const bi = 1 - smootherstep(1.0, 2.6, rEff);
      relief = lerp(relief, SHORE_LEVEL, bi * SHORE_FLATTEN);
    }
    sample.relief = relief;

    // —— 盆地下凹 ——
    let depth = 0;
    if (rEff < WATER_RIM_R) {
      depth = -POND_DEPTH * (1 - smootherstep(0.25, WATER_RIM_R, rEff));
    }

    sample.h = (relief + depth) * edge;
    return sample;
  }

  /**
   * 公园地形高度查询（契约 §5.6 要求导出）。与实际网格顶点使用同一解析函数，
   * 因此在网格顶点上**数值完全一致**；公园范围外返回 0。
   * @param {number} x 世界 X（米）
   * @param {number} z 世界 Z（米）
   * @returns {number} 地表高度（米）
   */
  function heightAtPark(x, z) {
    return sampleTerrain(x, z).h;
  }

  /**
   * 判断某点是否落在水面之下（供其他模块避让水塘）。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @returns {boolean} true = 在水下
   */
  function isInPond(x, z) {
    const s = sampleTerrain(x, z);
    return s.rEff < WATER_RIM_R && s.h < WATER_LEVEL;
  }

  /* ---------------- 园路样条 ---------------- */
  const pathRng = rng.fork('paths');
  /** @type {Array<Float64Array>} */
  const polylines = [];

  /**
   * 把控制点数组转成折线采样（CatmullRom 平滑）。
   * @param {Array<[number,number]>} pts 控制点
   * @param {boolean} closed 是否闭合
   * @param {number} samples 采样段数
   * @returns {Float64Array} [x0,z0,x1,z1,...]
   */
  function splineToPolyline(pts, closed, samples) {
    const v = pts.map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(v, closed, 'catmullrom', 0.5);
    const out = new Float64Array((samples + 1) * 2);
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= samples; i++) {
      curve.getPoint(i / samples, tmp);
      out[i * 2] = tmp.x;
      out[i * 2 + 1] = tmp.z;
    }
    return out;
  }

  for (let i = 0; i < PATH_DEFS.length; i++) {
    const jittered = PATH_DEFS[i].map((p) => [
      clamp(p[0] + pathRng.range(-9, 9), bounds.minX + 4, bounds.maxX - 4),
      clamp(p[1] + pathRng.range(-9, 9), bounds.minZ + 4, bounds.maxZ - 4)
    ]);
    polylines.push(splineToPolyline(jittered, false, 150));
  }
  // 环湖小径：沿椭圆等角取点、半径带抖动，天然绕开水面
  const loopPts = [];
  for (let k = 0; k < 12; k++) {
    const th = (k / 12) * Math.PI * 2;
    const rr = LAKE_LOOP_R + pathRng.range(-0.1, 0.14);
    const lu = POND_A * rr * Math.cos(th);
    const lv = POND_B * rr * Math.sin(th);
    loopPts.push([
      POND_X + lu * POND_COS + lv * POND_SIN,
      POND_Z - lu * POND_SIN + lv * POND_COS
    ]);
  }
  polylines.push(splineToPolyline(loopPts, true, 180));

  const pathDistance = buildPathField(polylines, bounds);

  /* ---------------- 地形网格 ---------------- */
  const res = RESOLUTION[quality];
  const groundGeo = new THREE.PlaneGeometry(parkW, parkD, res.sx, res.sz);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(parkCX, 0, parkCZ);

  const gPos = groundGeo.attributes.position;
  const vCount = gPos.count;
  const gArr = gPos.array;
  // 逐顶点位移雕刻
  for (let i = 0; i < vCount; i++) {
    const o = i * 3;
    gArr[o + 1] = sampleTerrain(gArr[o], gArr[o + 2]).h;
  }
  gPos.needsUpdate = true;
  groundGeo.computeVertexNormals();

  // 逐顶点着色（草地深浅 / 裸土 / 岩脊裸岩 / 湿地 / 淤泥 / 小径）
  const gNor = groundGeo.attributes.normal.array;
  const colArr = new Float32Array(vCount * 3);
  const cGrassDeep = new THREE.Color(COL_GRASS_DEEP);
  const cGrassMid = new THREE.Color(COL_GRASS_MID);
  const cGrassDry = new THREE.Color(COL_GRASS_DRY);
  const cSoil = new THREE.Color(COL_SOIL);
  const cRock = new THREE.Color(COL_ROCK);
  const cPath = new THREE.Color(COL_PATH);
  const cWet = new THREE.Color(COL_WETLAND);
  const cSilt = new THREE.Color(COL_SILT);
  const cTmp = new THREE.Color();

  for (let i = 0; i < vCount; i++) {
    const o = i * 3;
    const x = gArr[o];
    const y = gArr[o + 1];
    const z = gArr[o + 2];
    const s = sampleTerrain(x, z);
    const ny = gNor[o + 1];

    const n1 = noiseColor(x * 0.021, z * 0.021);
    const n2 = noiseColor(x * 0.083, z * 0.083);
    const mott = clamp(0.5 + 0.5 * (0.66 * n1 + 0.34 * n2), 0, 1);

    // 草地深浅：高处更干黄，低处更深绿
    cTmp.copy(cGrassDeep).lerp(cGrassMid, mott);
    const dry = clamp((y - 1.0) / 9, 0, 1) * 0.6 * (0.4 + 0.6 * mott);
    cTmp.lerp(cGrassDry, dry);

    // 裸土：坡度越陡草越站不住。阈值按实测坡度分位数选（p90 ≈ 0.034、p99 ≈ 0.085），
    // 使裸土恰好出现在最陡的约 10% 地表上，而不是全绿或全土。
    const soil = smoothstep(0.030, 0.095, 1 - clamp(ny, 0, 1)) * (0.5 + 0.5 * mott);
    cTmp.lerp(cSoil, clamp(soil, 0, 0.88));

    // 岩脊裸岩
    if (s.ridge > 0.1) {
      cTmp.lerp(cRock, smoothstep(0.10, 0.55, s.ridge / ridgeAmpMax) * 0.88);
    }

    // 水边湿地 + 水下淤泥
    if (s.rEff < 1.7) {
      cTmp.lerp(cWet, (1 - smoothstep(1.02, 1.62, s.rEff)) * 0.7);
      cTmp.lerp(cSilt, 1 - smoothstep(0.5, 0.98, s.rEff));
    }

    // 小径：低饱和度色带（核心 4m 宽，外沿柔化）
    const pd = pathDistance(x, z);
    if (pd < PATH_FADE_WIDTH) {
      const pm = (1 - smoothstep(PATH_HALF_WIDTH, PATH_FADE_WIDTH, pd)) * (0.82 + 0.18 * mott);
      cTmp.lerp(cPath, clamp(pm, 0, 1));
    }

    colArr[o] = cTmp.r;
    colArr[o + 1] = cTmp.g;
    colArr[o + 2] = cTmp.b;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  groundGeo.computeBoundingSphere();

  // 细微法线扰动贴图（20m 一个平铺周期，代码生成、可无缝平铺）
  const detailHeightImg = tileableFbmImage(256, 6, 5, S + 401);
  const detailNormalTex = heightToNormalTexture(detailHeightImg, 256, 3.4);
  detailNormalTex.repeat.set(Math.round(parkW / 20), Math.round(parkD / 20));

  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0.0,
    normalMap: detailNormalTex,
    normalScale: new THREE.Vector2(0.6, 0.6),
    dithering: true
  });
  patchCityMaterial(groundMat, env, { snowAmount: 1.0, puddles: true, wetDarken: 0.32 });

  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.name = 'parkGround';

  /* ---------------- 水面 ---------------- */
  const waterSegs = 84;
  const waterRings = 6;
  const wVerts = 1 + waterSegs * waterRings;
  const wPos = new Float32Array(wVerts * 3);
  const wNor = new Float32Array(wVerts * 3);
  const wUv = new Float32Array(wVerts * 2);

  /**
   * 椭圆局部坐标 → 世界坐标（与 sampleTerrain 里的逆变换严格互逆）。
   * @param {number} lu 局部长轴分量
   * @param {number} lv 局部短轴分量
   * @param {number[]} out 输出 [x, z]
   * @returns {void}
   */
  function pondLocalToWorld(lu, lv, out) {
    out[0] = POND_X + lu * POND_COS + lv * POND_SIN;
    out[1] = POND_Z - lu * POND_SIN + lv * POND_COS;
  }

  const w2 = [0, 0];
  pondLocalToWorld(0, 0, w2);
  wPos[0] = w2[0];
  wPos[1] = WATER_LEVEL;
  wPos[2] = w2[1];
  wNor[1] = 1;
  wUv[0] = 0.5;
  wUv[1] = 0.5;
  for (let ring = 1; ring <= waterRings; ring++) {
    const rr = (ring / waterRings) * WATER_RIM_R;
    for (let seg = 0; seg < waterSegs; seg++) {
      const th = (seg / waterSegs) * Math.PI * 2;
      pondLocalToWorld(POND_A * rr * Math.cos(th), POND_B * rr * Math.sin(th), w2);
      const idx = 1 + (ring - 1) * waterSegs + seg;
      wPos[idx * 3] = w2[0];
      wPos[idx * 3 + 1] = WATER_LEVEL;
      wPos[idx * 3 + 2] = w2[1];
      wNor[idx * 3 + 1] = 1;
      // 6m 一个涟漪平铺周期
      wUv[idx * 2] = (w2[0] - POND_X) / 6;
      wUv[idx * 2 + 1] = (w2[1] - POND_Z) / 6;
    }
  }
  const wIdx = [];
  for (let seg = 0; seg < waterSegs; seg++) {
    const a = 1 + seg;
    const b = 1 + ((seg + 1) % waterSegs);
    wIdx.push(0, b, a);
  }
  for (let ring = 1; ring < waterRings; ring++) {
    const base0 = 1 + (ring - 1) * waterSegs;
    const base1 = 1 + ring * waterSegs;
    for (let seg = 0; seg < waterSegs; seg++) {
      const s0 = seg;
      const s1 = (seg + 1) % waterSegs;
      wIdx.push(base0 + s0, base1 + s1, base1 + s0);
      wIdx.push(base0 + s0, base0 + s1, base1 + s1);
    }
  }
  const waterGeo = new THREE.BufferGeometry();
  waterGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
  waterGeo.setAttribute('normal', new THREE.BufferAttribute(wNor, 3));
  waterGeo.setAttribute('uv', new THREE.BufferAttribute(wUv, 2));
  waterGeo.setIndex(wIdx);
  waterGeo.computeBoundingSphere();

  const waterNormalTex = createWaterNormalTexture(256, S + 517);
  const uWaterTime = { value: 0 };
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x21454e,
    roughness: 0.075,
    metalness: 0.42,
    transparent: true,
    opacity: 0.84,
    depthWrite: false,
    normalMap: waterNormalTex,
    normalScale: new THREE.Vector2(0.38, 0.38)
  });
  // 轻微波动：3 组正弦行波叠加，纯 GPU 计算，不触碰 CPU 端几何
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = uWaterTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWaterTime;')
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '\ttransformed.y += sin( transformed.x * 0.16 + uWaterTime * 1.15 ) * 0.055;',
          '\ttransformed.y += sin( transformed.z * 0.21 - uWaterTime * 0.83 ) * 0.045;',
          '\ttransformed.y += sin( ( transformed.x + transformed.z ) * 0.33 + uWaterTime * 1.9 ) * 0.02;'
        ].join('\n')
      );
  };
  patchCityMaterial(waterMat, env, { snowAmount: 0.4, wetness: false, flash: true });

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.name = 'parkWater';
  waterMesh.renderOrder = 1;

  /* ---------------- 植被实例化 ---------------- */
  const foliageRng = rng.fork('foliage');
  const counts = FOLIAGE_COUNT[quality];
  const treeGeo = buildTreeGeometry(foliageRng.fork('treeShape'), noise3);
  const bushGeo = buildBushGeometry(foliageRng.fork('bushShape'), noise3);

  const uSwayTime = { value: 0 };
  const uSwayWind = { value: new THREE.Vector2(0, 0) };
  const foliageMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.0
  });
  /**
   * 风中轻摆：在物体空间按"世界风向 × 高度平方"位移。
   * 由于实例矩阵 = 旋转 R × 均匀缩放 s，其逆等于 transpose(M)/s²，
   * 故用 `swayWorld * mat3(instanceMatrix) / s²` 把世界位移换算回物体空间，
   * 保证所有实例朝**同一个世界风向**摆动。GLSL 中 `vec3 * mat3` 即 transpose(M) * v。
   */
  foliageMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayTime = uSwayTime;
    shader.uniforms.uSwayWind = uSwayWind;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uSwayTime;\nuniform vec2 uSwayWind;'
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '\tvec3 swayOrigin = vec3( 0.0 );',
          '\t#ifdef USE_INSTANCING',
          '\t\tswayOrigin = instanceMatrix[ 3 ].xyz;',
          '\t#endif',
          '\tfloat swayF = clamp( position.y * 0.1, 0.0, 1.0 );',
          '\tswayF *= swayF;',
          '\tfloat swayPh = uSwayTime * 1.4 + swayOrigin.x * 0.09 + swayOrigin.z * 0.11;',
          '\tvec2 swayXZ = uSwayWind * ( 0.16 + 0.10 * sin( swayPh ) ) * swayF;',
          '\tvec3 swayWorld = vec3( swayXZ.x, 0.0, swayXZ.y );',
          '\t#ifdef USE_INSTANCING',
          '\t\tmat3 swayM = mat3( instanceMatrix );',
          '\t\tfloat swayS2 = max( dot( swayM[ 0 ], swayM[ 0 ] ), 1e-4 );',
          '\t\ttransformed += ( swayWorld * swayM ) / swayS2;',
          '\t#else',
          '\t\ttransformed += swayWorld;',
          '\t#endif'
        ].join('\n')
      );
  };
  patchCityMaterial(foliageMat, env, { snowAmount: 0.7, puddles: false, wetDarken: 0.25 });

  /** 植被最小间距占用网格（避免扎堆） */
  const occupancy = new Map();
  /**
   * 检查并占用一个位置（简易泊松盘：查 3×3 邻域）。
   * @param {number} x 世界 X
   * @param {number} z 世界 Z
   * @param {number} minDist 最小间距（米）
   * @returns {boolean} true = 可放置（并已登记）
   */
  function tryOccupy(x, z, minDist) {
    const cs = 6;
    const cx = Math.floor(x / cs);
    const cz = Math.floor(z / cs);
    const md2 = minDist * minDist;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const arr = occupancy.get((cx + dx) + ',' + (cz + dz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 2) {
          const ex = arr[i] - x;
          const ez = arr[i + 1] - z;
          if (ex * ex + ez * ez < md2) return false;
        }
      }
    }
    const key = cx + ',' + cz;
    let cell = occupancy.get(key);
    if (!cell) { cell = []; occupancy.set(key, cell); }
    cell.push(x, z);
    return true;
  }

  /**
   * 按约束随机采样植被落点：避开水塘、小径、陡坡与裸岩，并保持最小间距。
   * @param {number} target 目标数量
   * @param {number} minDist 最小间距（米）
   * @param {number} pathClear 与园路中心线的最小距离（米）
   * @param {number} margin 距公园边界的最小距离（米）
   * @returns {Array<{x:number,y:number,z:number}>} 落点
   */
  function scatter(target, minDist, pathClear, margin) {
    const out = [];
    const maxTries = target * 24;
    for (let t = 0; t < maxTries && out.length < target; t++) {
      const x = foliageRng.range(bounds.minX + margin, bounds.maxX - margin);
      const z = foliageRng.range(bounds.minZ + margin, bounds.maxZ - margin);
      if (pathDistance(x, z) < pathClear) continue;
      const s = sampleTerrain(x, z);
      if (s.rEff < 1.12) continue;
      if (s.ridge > ridgeAmpMax * 0.62) continue;
      const y = s.h;
      // 坡度过陡不长树：用解析中心差分估计法线
      const hx = sampleTerrain(x + 2.5, z).h - sampleTerrain(x - 2.5, z).h;
      const hz = sampleTerrain(x, z + 2.5).h - sampleTerrain(x, z - 2.5).h;
      const slope = Math.sqrt(hx * hx + hz * hz) / 5;
      if (slope > 0.55) continue;
      if (!tryOccupy(x, z, minDist)) continue;
      out.push({ x, y, z });
    }
    return out;
  }

  const treeSpots = scatter(counts.trees, 11, 3.8, 14);
  const bushSpots = scatter(counts.bushes, 5.5, 3.2, 10);

  /**
   * 构建一批实例化植被。
   * @param {THREE.BufferGeometry} geo 共享几何
   * @param {Array<{x:number,y:number,z:number}>} spots 落点
   * @param {number} sMin 最小缩放
   * @param {number} sMax 最大缩放
   * @param {number} tilt 最大随机倾斜（弧度）
   * @param {string} name 对象名
   * @returns {THREE.InstancedMesh|null} 实例网格
   */
  function buildInstances(geo, spots, sMin, sMax, tilt, name) {
    if (spots.length === 0) return null;
    const mesh = new THREE.InstancedMesh(geo, foliageMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      const s = foliageRng.range(sMin, sMax);
      e.set(foliageRng.range(-tilt, tilt), foliageRng.range(0, Math.PI * 2), foliageRng.range(-tilt, tilt));
      q.setFromEuler(e);
      p.set(sp.x, sp.y - 0.18, sp.z);
      sc.set(s, s, s);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
      // 逐实例色调微扰，避免整片同色
      const k = foliageRng.range(0.82, 1.16);
      col.setRGB(k * foliageRng.range(0.94, 1.06), k, k * foliageRng.range(0.9, 1.02));
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = name;
    mesh.computeBoundingSphere();
    return mesh;
  }

  const treeMesh = buildInstances(treeGeo, treeSpots, 0.78, 1.5, 0.05, 'parkTrees');
  const bushMesh = buildInstances(bushGeo, bushSpots, 0.62, 1.55, 0.09, 'parkBushes');

  /* ---------------- 组装 ---------------- */
  const group = new THREE.Group();
  group.name = 'terrain';
  group.add(groundMesh);
  group.add(waterMesh);
  if (bushMesh) group.add(bushMesh);
  if (treeMesh) group.add(treeMesh);

  let waterScrollX = 0;
  let waterScrollY = 0;
  let disposed = false;

  /**
   * 每帧更新：只写 uniform 与贴图偏移，不重建任何几何。
   * @param {Object} frameCtx FrameContext（契约 §2）
   * @returns {void}
   */
  function update(frameCtx) {
    if (disposed || !frameCtx) return;
    const t = Number.isFinite(frameCtx.elapsed) ? frameCtx.elapsed : 0;
    const dt = Number.isFinite(frameCtx.dt) ? clamp(frameCtx.dt, 0, 0.1) : 0;
    uWaterTime.value = t;
    uSwayTime.value = t;

    // 取水平风矢量
    let wx = 0;
    let wz = 0;
    const wind = frameCtx.wind;
    if (wind && wind.vector && Number.isFinite(wind.vector.x) && Number.isFinite(wind.vector.z)) {
      wx = wind.vector.x;
      wz = wind.vector.z;
    } else if (wind && Number.isFinite(wind.dirDeg) && Number.isFinite(wind.speed)) {
      const rad = wind.dirDeg * DEG2RAD;
      wx = Math.sin(rad) * wind.speed;
      wz = -Math.cos(rad) * wind.speed;
    }
    const sp = Math.sqrt(wx * wx + wz * wz);
    if (sp > 1e-4) {
      const k = clamp(sp / 11, 0.12, 1) / sp;
      uSwayWind.value.set(wx * k, wz * k);
      waterScrollX = (waterScrollX + (wx / sp) * dt * 0.012) % 1;
      waterScrollY = (waterScrollY + (wz / sp) * dt * 0.012) % 1;
    } else {
      uSwayWind.value.set(0, 0);
      waterScrollY = (waterScrollY + dt * 0.004) % 1;
    }
    waterNormalTex.offset.set(waterScrollX, waterScrollY);
  }

  /**
   * 释放本模块自建的全部 GPU 资源（共享贴图库不在此释放）。
   * @returns {void}
   */
  function dispose() {
    if (disposed) return;
    disposed = true;
    if (treeMesh) treeMesh.dispose();
    if (bushMesh) bushMesh.dispose();
    groundGeo.dispose();
    waterGeo.dispose();
    treeGeo.dispose();
    bushGeo.dispose();
    groundMat.dispose();
    waterMat.dispose();
    foliageMat.dispose();
    detailNormalTex.dispose();
    waterNormalTex.dispose();
    occupancy.clear();
    group.clear();
  }

  return {
    object3D: group,
    update,
    dispose,
    heightAtPark,
    isInPond,
    waterLevel: WATER_LEVEL,
    stats: {
      instances: treeSpots.length + bushSpots.length,
      draws: 2 + (treeMesh ? 1 : 0) + (bushMesh ? 1 : 0)
    }
  };
}
