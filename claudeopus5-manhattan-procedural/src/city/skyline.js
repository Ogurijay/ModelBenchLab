/**
 * @file src/city/skyline.js
 * @description 曼哈顿「双峰天际线」高度场（契约 §4.2）。
 *
 * 真实曼哈顿的天际线是**双峰**形态：中城（Midtown，帝国大厦/克莱斯勒一带）与
 * 下城金融区（Downtown，世贸一号楼一带）两处高楼密集，中间的苏活/村区因 1916 年
 * 分区法与基岩埋深（曼哈顿片岩在中城与下城最浅）而明显低矮。本模块用
 * **两个二维各向同性高斯核**复现这一宏观形态，再叠加多频 fBm 制造楼群参差。
 *
 * 公式（契约 §4.2）：
 *   h = ( Σᵢ ampᵢ·exp(−dᵢ²/(2σᵢ²)) + base ) × (0.45 + 0.75·fbm01) × cornerBonus × spire
 *   最终 clamp 到 [12, 330]，再离散到 3.5m 层高的整数倍。
 *
 * 算法出处：
 *  - 高斯核 exp(−d²/(2σ²))：标准各向同性二维高斯（Gaussian radial basis function）。
 *  - fBm（分形布朗运动）：Mandelbrot & Van Ness (1968)；实现见 Ebert et al.,
 *    "Texturing & Modeling: A Procedural Approach" 第 16 章。此处刻意分成
 *    **中频（≈220m 波长，街区尺度起伏）** 与 **高频（≈60m 波长，单栋差异）** 两层加权，
 *    避免单一频率导致整片楼一样高。
 *  - 「随机塔尖」：无状态空间散列 hash2D（core/rng.js）在 44m 网格上取值，
 *    约 3% 的格子高度额外 ×1.35，模拟真实天际线中偶发的孤立高塔。
 *  - 平滑过渡 smoothstep：Ken Perlin 的 3t²−2t³（core/mathx.js）。
 *
 * 依赖方向（契约 §0）：只 import `core/*` 与 `city/grid.js` 的**常量** `CITY`
 * （不调用 `buildCityPlan`，因此不会与 grid.js 形成循环依赖）。
 *
 * 坐标约定：Y 轴向上；+X 东、−X 西；+Z 南（下城）、−Z 北（上城）；1 世界单位 = 1 米。
 */

import { makeRng, hash2D } from '../core/rng.js';
import { makeNoise2D, fbm2D } from '../core/noise.js';
import { clamp, smoothstep } from '../core/mathx.js';
import { CITY } from './grid.js';

/**
 * 双峰参数（契约 §4.2 硬性数值，不得改动）。
 * `x/z` 为峰心平面坐标，`amp` 为峰值加高（米），`sigma` 为高斯标准差（米）。
 * @type {Array<{name: string, x: number, z: number, amp: number, sigma: number}>}
 */
export const SKYLINE_PEAKS = [
  { name: 'midtown', x: 0, z: -560, amp: 300, sigma: 430 },
  { name: 'downtown', x: 100, z: 1750, amp: 265, sigma: 390 }
];

/** 基底高度（米）：远离双峰的城区仍有约 5~7 层的老楼 */
const BASE_HEIGHT = 22;
/** 高度下限（米，契约 §4.2） */
const MIN_HEIGHT = 12;
/** 高度上限（米，契约 §4.2）；地标另行硬编码，不走本高度场 */
const MAX_HEIGHT = 330;
/** 标准层高（米）：最终高度必须离散到它的整数倍，让楼群有楼层感 */
const FLOOR_HEIGHT = 3.5;

/** fBm 调制下限与幅度：modulation = FBM_FLOOR + FBM_GAIN × fbm01 ∈ [0.45, 1.20] */
const FBM_FLOOR = 0.45;
const FBM_GAIN = 0.75;

/** 中频噪声波长（米）：街区尺度的高低起伏 */
const WAVELENGTH_MID = 220;
/** 高频噪声波长（米）：相邻楼之间的差异 */
const WAVELENGTH_HIGH = 60;
/** 中频层在混合中的权重（其余给高频层） */
const MID_WEIGHT = 0.66;

/** 「随机塔尖」判定网格边长（米），约等于一个典型地块的进深 */
const SPIRE_CELL = 44;
/** 出现塔尖的概率 */
const SPIRE_PROBABILITY = 0.03;
/** 塔尖高度倍率 */
const SPIRE_MULTIPLIER = 1.35;

/** 大道沿线加成（临街塔楼更高） */
const AVENUE_BONUS = 0.25;
/** 百老汇沿线加成 */
const BROADWAY_BONUS = 0.15;
/** 大道红线外仍算「临大道」的进深（米） */
const AVENUE_FRONT_DEPTH = 30;
/** 百老汇红线外仍算「临百老汇」的进深（米） */
const BROADWAY_FRONT_DEPTH = 28;
/** 加成从满值衰减到 0 的过渡带宽度（米），避免出现刀切般的高度台阶 */
const BONUS_FADE = 16;

/** 密度：边缘最低值 */
const DENSITY_FLOOR = 0.45;
/** 密度：峰心相对边缘的增量（0.45 + 0.55 = 1.0） */
const DENSITY_GAIN = 0.55;
/** 密度高斯的 sigma 放大系数：建筑密集区比高度峰摊得更开 */
const DENSITY_SIGMA_SCALE = 1.35;
/** 密度噪声扰动幅度 */
const DENSITY_NOISE_AMP = 0.07;
/** 密度噪声波长（米） */
const DENSITY_WAVELENGTH = 340;

/** 立面材质合法取值（契约 §4.2） */
const STYLES = ['limestone', 'brick', 'glass', 'deco'];
/** 「时代感」噪声波长（米）：平滑地在传统街区与现代街区之间过渡 */
const STYLE_WAVELENGTH = 150;
/** 时代感噪声对材质权重的调制幅度 */
const STYLE_MODULATION = 0.45;
/** 街区级材质散列网格边长（米）：整条街倾向同一风格 */
const STYLE_BLOCK_CELL = 168;
/** 地块级材质散列网格边长（米）：把街区风格打散到单栋 */
const STYLE_CELL = 38;
/** 跟随街区风格的比例，其余地块独立掷点（两个均匀分布的混合仍是均匀分布） */
const STYLE_BLOCK_SHARE = 0.6;
/** 视为「公园周边」的缓冲距离（米） */
const PARK_FRINGE = 150;

/**
 * 读取一个数值型配置，非有限数时回退到默认值。
 * 用于对 `CITY` 常量做兜底（契约 §0：发现缺陷时按契约兜底，不改他人接口）。
 * @param {*} value 待校验值
 * @param {number} fallback 回退值
 * @returns {number} 有限数
 */
function num(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 从 `CITY` 常量派生出的、与地理相关的静态几何参数（模块加载时算一次，
 * 避免 heightAt 每次调用都重复读取与计算）。
 */
const GEO = (() => {
  const city = CITY || {};
  const park = city.park || {};
  const river = city.river || {};
  const broadway = city.broadway || {};

  const avenueXs = Array.isArray(city.avenueXs) && city.avenueXs.length
    ? city.avenueXs.filter((v) => Number.isFinite(v))
    : [-700, -420, -140, 140, 420, 700];

  const avenueHalf = num(city.avenueRoadWidth, 34) * 0.5;
  const sidewalk = num(city.sidewalkWidth, 6);
  const bwHalf = num(broadway.width, 30) * 0.5;

  const ax = num(broadway.ax, -700);
  const az = num(broadway.az, -2400);
  const bx = num(broadway.bx, 300);
  const bz = num(broadway.bz, 2400);
  const dx = bx - ax;
  const dz = bz - az;

  return {
    minX: num(city.minX, -800),
    maxX: num(city.maxX, 800),
    minZ: num(city.minZ, -2400),
    maxZ: num(city.maxZ, 2400),
    parkMinX: num(park.minX, -420),
    parkMaxX: num(park.maxX, 140),
    parkMinZ: num(park.minZ, -2080),
    parkMaxZ: num(park.maxZ, -720),
    hudsonX: num(river.hudsonX, -800),
    eastX: num(river.eastX, 800),
    avenueXs,
    /** 「临大道」判定半宽（米）：路面半宽 + 人行道 + 地块进深 */
    avenueReach: avenueHalf + sidewalk + AVENUE_FRONT_DEPTH,
    /** 「临百老汇」判定半宽（米） */
    broadwayReach: bwHalf + sidewalk + BROADWAY_FRONT_DEPTH,
    bwAx: ax,
    bwAz: az,
    bwDx: dx,
    bwDz: dz,
    /** 百老汇中心线长度的平方，供投影参数 t 使用 */
    bwLen2: dx * dx + dz * dz || 1
  };
})();

/**
 * 点到百老汇中心线（线段）的最短距离。
 * 标准做法：把点向线段方向投影得参数 t，clamp 到 [0,1] 后取欧氏距离。
 * @param {number} x 平面坐标 X
 * @param {number} z 平面坐标 Z
 * @returns {number} 距离（米）
 */
function distanceToBroadway(x, z) {
  let t = ((x - GEO.bwAx) * GEO.bwDx + (z - GEO.bwAz) * GEO.bwDz) / GEO.bwLen2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = GEO.bwAx + t * GEO.bwDx;
  const cz = GEO.bwAz + t * GEO.bwDz;
  const ex = x - cx;
  const ez = z - cz;
  return Math.sqrt(ex * ex + ez * ez);
}

/**
 * 点到中央公园矩形的最短距离（在矩形内部为 0）。
 * @param {number} x 平面坐标 X
 * @param {number} z 平面坐标 Z
 * @returns {number} 距离（米）
 */
function distanceToPark(x, z) {
  const dx = Math.max(GEO.parkMinX - x, 0, x - GEO.parkMaxX);
  const dz = Math.max(GEO.parkMinZ - z, 0, z - GEO.parkMaxZ);
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * 是否落在中央公园矩形内（公园不建楼）。
 * @param {number} x 平面坐标 X
 * @param {number} z 平面坐标 Z
 * @returns {boolean} 结果
 */
function inPark(x, z) {
  return x >= GEO.parkMinX && x <= GEO.parkMaxX && z >= GEO.parkMinZ && z <= GEO.parkMaxZ;
}

/**
 * 是否落在水域或陆地范围之外（哈德逊河 / 东河 / 南北端外海）。
 * @param {number} x 平面坐标 X
 * @param {number} z 平面坐标 Z
 * @returns {boolean} 结果
 */
function inWater(x, z) {
  return x <= GEO.hudsonX || x >= GEO.eastX || z < GEO.minZ || z > GEO.maxZ;
}

/**
 * 按 Z 坐标划分行政/风貌分区（与 grid.js 的 `district` 口径一致，契约 §4.1）。
 * @param {number} z 平面坐标 Z
 * @returns {'uptown'|'midtown'|'village'|'downtown'} 分区名
 */
function districtOf(z) {
  if (z < -720) return 'uptown';
  if (z <= 300) return 'midtown';
  if (z <= 1200) return 'village';
  return 'downtown';
}

/**
 * 把坐标量化到网格中心并取无状态散列，保证「同一格内取值恒等」，
 * 从而让一栋楼整体获得同一个塔尖/材质判定，不会出现同楼半高半低。
 * @param {number} x 平面坐标 X
 * @param {number} z 平面坐标 Z
 * @param {number} cell 网格边长（米）
 * @param {number} seed uint32 种子
 * @returns {number} [0,1)
 */
function cellHash(x, z, cell, seed) {
  return hash2D(Math.floor(x / cell), Math.floor(z / cell), seed);
}

/**
 * 在权重表上按 [0,1) 的采样值取一个材质名（轮盘赌，确定性、无 RNG 状态）。
 * @param {number[]} weights 与 STYLES 等长的非负权重
 * @param {number} u 采样值 [0,1)
 * @returns {string} 'limestone'|'brick'|'glass'|'deco'
 */
function pickStyle(weights, u) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (!(total > 0)) return STYLES[0];
  let acc = u * total;
  for (let i = 0; i < weights.length; i++) {
    acc -= weights[i];
    if (acc < 0) return STYLES[i];
  }
  return STYLES[STYLES.length - 1];
}

/**
 * @typedef {Object} HeightField
 * @property {(x: number, z: number) => number} heightAt 建筑目标高度（米），公园/水域返回 0
 * @property {(x: number, z: number) => number} densityAt 建筑密集度 0..1
 * @property {(x: number, z: number) => string} styleAt 立面材质 'limestone'|'brick'|'glass'|'deco'
 * @property {Array<{name:string,x:number,z:number,amp:number,sigma:number}>} peaks 双峰参数
 * @property {number} maxHeight 高度上限（米）
 */

/**
 * 创建种子化的天际线高度场。
 *
 * 同一 `seed` 必然得到逐点完全一致的结果（内部所有随机性都来自 core/rng.js 的
 * 种子流与无状态散列 hash2D，绝不使用 Math.random）。
 *
 * 性能：所有噪声采样器与几何常量在创建时算好；`heightAt/densityAt/styleAt`
 * 内部零对象分配，可安全地在建楼循环中高频调用。
 *
 * @param {number|string} [seed='manhattan'] 城市种子
 * @returns {HeightField} 高度场句柄
 */
export function createHeightField(seed = 'manhattan') {
  const root = makeRng(seed, 'skyline');

  // 各用途一条独立子流：改动其一不会串味到其它（契约 §3.1 fork 隔离）
  const noiseMid = makeNoise2D(root.fork('height-mid').seed);
  const noiseHigh = makeNoise2D(root.fork('height-high').seed);
  const noiseDensity = makeNoise2D(root.fork('density').seed);
  const noiseStyle = makeNoise2D(root.fork('style-field').seed);
  const spireSeed = root.fork('spire').seed;
  const styleSeed = root.fork('style-hash').seed;

  // 预乘的高斯系数：exp(−d²/(2σ²)) 里的 1/(2σ²)，避免每次采样做除法
  const peakInv2Sigma2 = SKYLINE_PEAKS.map((p) => 1 / (2 * p.sigma * p.sigma));
  const densityInv2Sigma2 = SKYLINE_PEAKS.map((p) => {
    const s = p.sigma * DENSITY_SIGMA_SCALE;
    return 1 / (2 * s * s);
  });

  // 噪声频率 = 1 / 波长
  const freqMid = 1 / WAVELENGTH_MID;
  const freqHigh = 1 / WAVELENGTH_HIGH;
  const freqDensity = 1 / DENSITY_WAVELENGTH;
  const freqStyle = 1 / STYLE_WAVELENGTH;

  const fbmMidOpts = { octaves: 2, lacunarity: 2.1, gain: 0.5, frequency: freqMid };
  const fbmHighOpts = { octaves: 2, lacunarity: 2.3, gain: 0.45, frequency: freqHigh };

  /**
   * 双峰高斯叠加：Σ ampᵢ·exp(−dᵢ²/(2σᵢ²))。
   * @param {number} x 平面坐标 X
   * @param {number} z 平面坐标 Z
   * @returns {number} 加高（米）
   */
  function peakSum(x, z) {
    let sum = 0;
    for (let i = 0; i < SKYLINE_PEAKS.length; i++) {
      const p = SKYLINE_PEAKS[i];
      const dx = x - p.x;
      const dz = z - p.z;
      sum += p.amp * Math.exp(-(dx * dx + dz * dz) * peakInv2Sigma2[i]);
    }
    return sum;
  }

  /**
   * 中频 + 高频两层 fBm 混合，归一化到 [0,1]。
   * 中频（≈220m）负责街区尺度的高低起伏，高频（≈60m）负责单栋楼之间的参差。
   * @param {number} x 平面坐标 X
   * @param {number} z 平面坐标 Z
   * @returns {number} [0,1]
   */
  function fbm01(x, z) {
    const mid = fbm2D(noiseMid, x, z, fbmMidOpts);
    const high = fbm2D(noiseHigh, x, z, fbmHighOpts);
    const mixed = MID_WEIGHT * mid + (1 - MID_WEIGHT) * high; // ∈ [-1,1]
    return clamp(0.5 + 0.5 * mixed, 0, 1);
  }

  /**
   * 临街加成：大道两侧 1.25、百老汇沿线 1.15，取二者较大值。
   * 边界用 smoothstep 做 16m 过渡带，避免高度出现整齐的刀切台阶。
   * @param {number} x 平面坐标 X
   * @param {number} z 平面坐标 Z
   * @returns {number} 倍率 ∈ [1, 1.25]
   */
  function cornerBonus(x, z) {
    let nearestAvenue = Infinity;
    for (let i = 0; i < GEO.avenueXs.length; i++) {
      const d = Math.abs(x - GEO.avenueXs[i]);
      if (d < nearestAvenue) nearestAvenue = d;
    }
    // 距离越小权重越接近 1；超出 reach + 过渡带后归零
    const avenueW = 1 - smoothstep(GEO.avenueReach - BONUS_FADE, GEO.avenueReach, nearestAvenue);
    const bwDist = distanceToBroadway(x, z);
    const broadwayW = 1 - smoothstep(GEO.broadwayReach - BONUS_FADE, GEO.broadwayReach, bwDist);
    const a = 1 + AVENUE_BONUS * avenueW;
    const b = 1 + BROADWAY_BONUS * broadwayW;
    return a > b ? a : b;
  }

  // 单条目记忆化：buildings.js 通常对同一点先问高度再问材质，
  // 缓存住上一次结果可省掉一整轮 fBm 采样（纯函数，缓存不改变语义）。
  let memoX = Number.NaN;
  let memoZ = Number.NaN;
  let memoH = 0;

  /**
   * 建筑目标高度（米）。公园与水域返回 0；其余按契约公式求值并离散到层高。
   *
   * h = (Σ ampᵢ·exp(−dᵢ²/(2σᵢ²)) + 22) × (0.45 + 0.75·fbm01) × cornerBonus × spire
   * → clamp[12, 330] → Math.round(h / 3.5) × 3.5
   *
   * @param {number} x 平面坐标 X（米）
   * @param {number} z 平面坐标 Z（米）
   * @returns {number} 高度（米），3.5 的整数倍；公园/水域为 0
   */
  function heightAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    if (x === memoX && z === memoZ) return memoH;
    memoX = x;
    memoZ = z;

    if (inWater(x, z) || inPark(x, z)) {
      memoH = 0;
      return 0;
    }

    let h = (peakSum(x, z) + BASE_HEIGHT) * (FBM_FLOOR + FBM_GAIN * fbm01(x, z)) * cornerBonus(x, z);

    // 随机塔尖：约 3% 的格子额外拔高，制造天际线参差（而非整片齐平）
    if (cellHash(x, z, SPIRE_CELL, spireSeed) < SPIRE_PROBABILITY) h *= SPIRE_MULTIPLIER;

    h = clamp(h, MIN_HEIGHT, MAX_HEIGHT);
    // 离散到 3.5m 层高：3.5 = 7/2 在二进制浮点中可精确表示，乘积无累积误差
    memoH = Math.round(h / FLOOR_HEIGHT) * FLOOR_HEIGHT;
    return memoH;
  }

  /**
   * 建筑密集度 0..1，影响地块细分粒度与楼间距。
   * 与高度共用双峰高斯（sigma 放大 1.35 倍，密度比高度摊得更开），
   * 峰心接近 1、城市边缘约 0.45，再叠加低频噪声避免同心圆感。
   *
   * @param {number} x 平面坐标 X（米）
   * @param {number} z 平面坐标 Z（米）
   * @returns {number} [0,1]，公园/水域为 0
   */
  function densityAt(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    if (inWater(x, z) || inPark(x, z)) return 0;

    let shape = 0;
    for (let i = 0; i < SKYLINE_PEAKS.length; i++) {
      const p = SKYLINE_PEAKS[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const g = Math.exp(-(dx * dx + dz * dz) * densityInv2Sigma2[i]);
      if (g > shape) shape = g; // 取较大者，避免两峰之间叠加超过 1
    }
    const n = noiseDensity(x * freqDensity, z * freqDensity); // [-1,1]
    return clamp(DENSITY_FLOOR + DENSITY_GAIN * shape + DENSITY_NOISE_AMP * n, 0, 1);
  }

  /** 复用的权重数组，避免 styleAt 每次调用都分配（性能：建楼时逐地块调用） */
  const styleWeights = [0, 0, 0, 0];

  /**
   * 立面材质分区。
   *
   * 规则（贴近真实曼哈顿）：
   *  - 中城/下城的高层：玻璃幕墙（国际式、当代塔楼）与装饰艺术（Art Deco，1930 年代）为主；
   *  - 村区/苏活（village）：19 世纪褐石与铸铁立面 → 砖为主；
   *  - 上城与中央公园周边：战前石灰岩公寓 → limestone 为主。
   *
   * 打散方式分两级：
   *  1. **平滑「时代感」噪声**（波长 150m）调制权重——现代感高的地段玻璃/装饰艺术权重上浮、
   *     砖石下浮，形成渐变而非硬边；因噪声均值约 0，全局比例仍贴近基准权重。
   *  2. **均匀散列抽样**——60% 的地块跟随所在街区（168m 格）的掷点，40% 自己独立掷点
   *     （两个均匀分布的混合仍是均匀分布，故权重比例不被扭曲），
   *     既有「整条街同一风格」的观感，又不会整片一模一样。
   *
   * @param {number} x 平面坐标 X（米）
   * @param {number} z 平面坐标 Z（米）
   * @returns {string} 'limestone' | 'brick' | 'glass' | 'deco'
   */
  function styleAt(x, z) {
    const safeX = Number.isFinite(x) ? x : 0;
    const safeZ = Number.isFinite(z) ? z : 0;
    const district = districtOf(safeZ);
    const h = heightAt(safeX, safeZ);

    // 基准权重，顺序与 STYLES 一致：[limestone, brick, glass, deco]
    let lime;
    let brick;
    let glass;
    let deco;
    if (district === 'midtown' || district === 'downtown') {
      if (h >= 200) { lime = 0.14; brick = 0.05; glass = 0.48; deco = 0.33; }
      else if (h >= 110) { lime = 0.22; brick = 0.10; glass = 0.40; deco = 0.28; }
      else { lime = 0.30; brick = 0.30; glass = 0.24; deco = 0.16; }
    } else if (district === 'village') {
      // 村区/苏活：褐石与铸铁老楼
      if (h >= 120) { lime = 0.20; brick = 0.34; glass = 0.28; deco = 0.18; }
      else { lime = 0.24; brick = 0.50; glass = 0.12; deco = 0.14; }
    } else {
      // uptown：战前石灰岩公寓带
      if (h >= 150) { lime = 0.38; brick = 0.18; glass = 0.26; deco = 0.18; }
      else { lime = 0.44; brick = 0.30; glass = 0.10; deco = 0.16; }
    }

    // 公园周边偏石灰岩（中央公园西 / 第五大道的战前公寓）
    if (distanceToPark(safeX, safeZ) < PARK_FRINGE) {
      lime += 0.35;
      glass *= 0.55;
      deco *= 0.85;
    }

    // 时代感调制：n > 0 更现代（玻璃/装饰艺术），n < 0 更传统（砖/石灰岩）
    const n = noiseStyle(safeX * freqStyle, safeZ * freqStyle); // [-1,1]
    const modern = 1 + STYLE_MODULATION * n;
    const classic = 1 - STYLE_MODULATION * n;
    styleWeights[0] = Math.max(lime * classic, 0.01);
    styleWeights[1] = Math.max(brick * classic, 0.01);
    styleWeights[2] = Math.max(glass * modern, 0.01);
    styleWeights[3] = Math.max(deco * (1 + STYLE_MODULATION * 0.55 * n), 0.01);

    const blockU = cellHash(safeX, safeZ, STYLE_BLOCK_CELL, styleSeed);
    const lotU = cellHash(safeX, safeZ, STYLE_CELL, styleSeed ^ 0x9e3779b9);
    const follow = cellHash(safeX, safeZ, STYLE_CELL, styleSeed ^ 0x51ed270b);
    const u = follow < STYLE_BLOCK_SHARE ? blockU : lotU;
    return pickStyle(styleWeights, u);
  }

  return {
    heightAt,
    densityAt,
    styleAt,
    peaks: SKYLINE_PEAKS,
    maxHeight: MAX_HEIGHT
  };
}
