/**
 * @file src/core/noise.js
 * @description 程序化噪声库（契约 §3.2）。提供 2D/3D Simplex 噪声、分形布朗运动（fBm）、
 *              脊状噪声（ridged）与 Worley 细胞噪声。
 *
 * 算法出处：
 *  - Simplex 噪声：Ken Perlin, "Improving Noise" (SIGGRAPH 2002) 提出的单纯形网格思想，
 *    实现骨架参考 Stefan Gustavson, "Simplex noise demystified" (2005) 的公开推导：
 *    偏斜因子 F2 = (√3 − 1)/2、去偏斜 G2 = (3 − √3)/6；三维 F3 = 1/3、G3 = 1/6。
 *    每个角点贡献 = (K − r²)⁴ · (g · d)，二维 K = 0.5、三维 K = 0.6。
 *  - fBm（分形布朗运动）：Mandelbrot & Van Ness (1968)；实现形式见
 *    Ebert et al., "Texturing & Modeling: A Procedural Approach", 第 16 章。
 *  - 脊状多重分形（ridged multifractal）：F. Kenton Musgrave, 同书 §16.5，
 *    signal = (1 − |noise|)^sharpness，并以上一倍频强度作为下一倍频权重。
 *  - Worley 细胞噪声：Steven Worley, "A Cellular Texture Basis Function" (SIGGRAPH 1996)，
 *    此处用每格 1 个特征点的 3×3 邻域近似求 F1/F2。
 *  - 内部 PRNG：mulberry32（Tommy Ettinger 公有领域实现），本模块自包含，不依赖 core/rng.js。
 *
 * 值域保证：makeNoise2D / makeNoise3D 严格返回 [-1, 1]，fbm2D / fbm3D 因除以权重和亦严格
 * 落在 [-1, 1]，ridged2D 严格落在 [0, 1]。缩放常数由“单位长度梯度下的核函数上界”解析求得
 * （见 SIMPLEX_SCALE_2D / SIMPLEX_SCALE_3D 注释），因此不依赖具体梯度表即可保证不越界。
 *
 * 约束：纯函数、确定性、无 Math.random()、无外部资产。
 */

/** 2π 常量 */
const TWO_PI = Math.PI * 2;

/** 二维偏斜因子 F2 = (√3 − 1)/2 */
const F2 = 0.5 * (Math.sqrt(3) - 1);
/** 二维去偏斜因子 G2 = (3 − √3)/6 */
const G2 = (3 - Math.sqrt(3)) / 6;
/** 三维偏斜因子 F3 = 1/3 */
const F3 = 1 / 3;
/** 三维去偏斜因子 G3 = 1/6 */
const G3 = 1 / 6;

/**
 * 二维缩放常数。
 * 数值扫描 Σ (0.5 − rᵢ²)₊⁴ · rᵢ（三个角点，梯度取单位长且与位移完全同向的最坏情况）
 * 得上界 0.01008020，故任何单位梯度表下 |n| ≤ 99.204 分之一，取 99.0 留出安全余量。
 * （与 Gustavson 经典实现的 70 × √2 ≈ 99.0 一致。）
 */
const SIMPLEX_SCALE_2D = 99.0;

/**
 * 三维缩放常数。
 * 同法扫描 Σ (0.6 − rᵢ²)₊⁴ · rᵢ（四个角点）得上界 0.02507416，对应 39.881，
 * 取 39.6 留出安全余量（经典实现的 32 × √2 ≈ 45.3 在极端情形会略微越界，此处不会）。
 */
const SIMPLEX_SCALE_3D = 39.6;

/**
 * mulberry32 伪随机数发生器（32 位状态，周期 2³²）。
 * @param {number} seed uint32 种子
 * @returns {() => number} 返回 [0,1) 的无参函数
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 把任意种子（字符串 / 数字 / 空值）折叠成 uint32。字符串走 FNV-1a 变体。
 * @param {string|number|null|undefined} seed 种子
 * @returns {number} uint32
 */
function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    // 小数种子也要能区分：先放大再取整，避免 0.1 与 0.2 折叠成同一值
    let h = Math.imul(Math.trunc(seed) >>> 0 || 0, 0x9e3779b1) >>> 0;
    const frac = Math.abs(seed - Math.trunc(seed));
    h = (h ^ Math.imul((frac * 4294967296) >>> 0, 0x85ebca6b)) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }
  const str = seed === null || seed === undefined ? '' : String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return h >>> 0;
}

/** 单条目字符串种子缓存，避免 worley2D 在热循环里反复哈希同一字符串 */
let seedCacheKey = Symbol('empty');
let seedCacheVal = 0;

/**
 * 带一级缓存的种子哈希（worley2D 每次调用都要用，避免重复计算字符串哈希）。
 * @param {string|number|null|undefined} seed 种子
 * @returns {number} uint32
 */
function hashSeedCached(seed) {
  if (seed === seedCacheKey) return seedCacheVal;
  seedCacheKey = seed;
  seedCacheVal = hashSeed(seed);
  return seedCacheVal;
}

/**
 * 用 Fisher–Yates 洗出 0..255 的置换表，并复制成 512 长以省去取模。
 * @param {() => number} rand PRNG
 * @returns {Uint8Array} 长度 512 的置换表
 */
function buildPermutation(rand) {
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.min(i, (rand() * (i + 1)) | 0);
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  return perm;
}

/**
 * 生成 256 个单位长二维梯度，交错存放为 [x0,y0,x1,y1,...]。
 *
 * 方向取**等角分布 + 种子随机相位**，再由种子洗牌打乱下标顺序：
 * 纯随机方向在 256 个样本下会有可观的方向性偏差（各向异性），等角集合则天然各向同性，
 * 而"哪个格点拿到哪个方向"仍完全由 seed 决定，满足"梯度表由 seed 生成"的要求。
 * 单位长是值域保证的前提（缩放常数按单位梯度推导）。
 *
 * @param {() => number} rand PRNG
 * @returns {Float64Array} 长度 512
 */
function buildGrad2(rand) {
  const phase = rand() * TWO_PI;
  const dirs = new Float64Array(512);
  for (let i = 0; i < 256; i++) {
    const a = phase + (i * TWO_PI) / 256;
    dirs[i * 2] = Math.cos(a);
    dirs[i * 2 + 1] = Math.sin(a);
  }
  // Fisher–Yates 打乱方向与下标的对应关系
  for (let i = 255; i > 0; i--) {
    const j = Math.min(i, (rand() * (i + 1)) | 0);
    const ax = dirs[i * 2];
    const ay = dirs[i * 2 + 1];
    dirs[i * 2] = dirs[j * 2];
    dirs[i * 2 + 1] = dirs[j * 2 + 1];
    dirs[j * 2] = ax;
    dirs[j * 2 + 1] = ay;
  }
  return dirs;
}

/**
 * 生成 256 个单位长三维梯度。
 *
 * 方向用**球面斐波那契格点**（golden angle 螺旋，见 González 2010 "Measurement of Areas on
 * a Sphere Using Fibonacci..."）保证球面近似均匀，配合种子随机相位与种子洗牌，
 * 兼顾各向同性与种子决定性。
 *
 * @param {() => number} rand PRNG
 * @returns {Float64Array} 长度 768
 */
function buildGrad3(rand) {
  const phase = rand() * TWO_PI;
  const golden = Math.PI * (3 - Math.sqrt(5)); // 黄金角 ≈ 2.39996 rad
  const dirs = new Float64Array(768);
  for (let i = 0; i < 256; i++) {
    const z = 1 - (2 * i + 1) / 256;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = phase + i * golden;
    dirs[i * 3] = r * Math.cos(a);
    dirs[i * 3 + 1] = r * Math.sin(a);
    dirs[i * 3 + 2] = z;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.min(i, (rand() * (i + 1)) | 0);
    for (let c = 0; c < 3; c++) {
      const tmp = dirs[i * 3 + c];
      dirs[i * 3 + c] = dirs[j * 3 + c];
      dirs[j * 3 + c] = tmp;
    }
  }
  return dirs;
}

/**
 * 把数值夹到 [-1, 1]（浮点误差兜底，正常路径不会触发）。
 * @param {number} v 输入
 * @returns {number} [-1,1]
 */
function clampSigned(v) {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/**
 * 把数值夹到 [0, 1]。
 * @param {number} v 输入
 * @returns {number} [0,1]
 */
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 整数格点哈希（Worley 用）。基于 xxHash 风格的乘法 + 异或雪崩。
 * @param {number} ix 格点 X
 * @param {number} iy 格点 Y
 * @param {number} seed uint32 种子
 * @returns {number} uint32
 */
function hashCell(ix, iy, seed) {
  let h = (seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * 创建二维 Simplex 噪声采样器。梯度表与置换表全部由 seed 经内部 mulberry32 生成，
 * 同种子必得同一结果；不同种子结果不同。
 *
 * @param {string|number} [seed=0] 种子（字符串或数字）
 * @returns {(x: number, y: number) => number} 采样函数，返回严格 [-1, 1]
 */
export function makeNoise2D(seed = 0) {
  const rand = mulberry32(hashSeed(seed));
  const perm = buildPermutation(rand);
  const grad = buildGrad2(rand);

  /**
   * 二维 Simplex 采样。
   * @param {number} x 坐标 X
   * @param {number} y 坐标 Y
   * @returns {number} [-1,1]
   */
  return function noise2D(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;

    // 1) 偏斜到单纯形网格，定位所在格
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    // 2) 去偏斜回正交空间，得到到第一个角点的位移
    const x0 = x - (i - t);
    const y0 = y - (j - t);

    // 3) 判断处于上三角还是下三角，确定第二个角点的偏移
    let i1 = 0;
    let j1 = 1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;
    let n = 0;

    // 4) 三个角点的径向衰减核 (0.5 − r²)⁴ 乘梯度点积
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const gi = perm[ii + perm[jj]] << 1;
      t0 *= t0;
      n += t0 * t0 * (grad[gi] * x0 + grad[gi + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const gi = perm[ii + i1 + perm[jj + j1]] << 1;
      t1 *= t1;
      n += t1 * t1 * (grad[gi] * x1 + grad[gi + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const gi = perm[ii + 1 + perm[jj + 1]] << 1;
      t2 *= t2;
      n += t2 * t2 * (grad[gi] * x2 + grad[gi + 1] * y2);
    }

    return clampSigned(SIMPLEX_SCALE_2D * n);
  };
}

/**
 * 创建三维 Simplex 噪声采样器（用于云体、岩石雕刻等）。
 *
 * @param {string|number} [seed=0] 种子
 * @returns {(x: number, y: number, z: number) => number} 采样函数，返回严格 [-1, 1]
 */
export function makeNoise3D(seed = 0) {
  // 与 2D 用不同的派生种子，避免同种子下 3D 与 2D 出现相关性
  const rand = mulberry32((hashSeed(seed) ^ 0x9e3779b9) >>> 0);
  const perm = buildPermutation(rand);
  const grad = buildGrad3(rand);

  /**
   * 三维 Simplex 采样。
   * @param {number} x 坐标 X
   * @param {number} y 坐标 Y
   * @param {number} z 坐标 Z
   * @returns {number} [-1,1]
   */
  return function noise3D(x, y, z) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0;

    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    // 六种排序决定单纯形内部的两个中间角点偏移
    let i1;
    let j1;
    let k1;
    let i2;
    let j2;
    let k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let n = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const gi = perm[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n += t0 * t0 * (grad[gi] * x0 + grad[gi + 1] * y0 + grad[gi + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const gi = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n += t1 * t1 * (grad[gi] * x1 + grad[gi + 1] * y1 + grad[gi + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const gi = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n += t2 * t2 * (grad[gi] * x2 + grad[gi + 1] * y2 + grad[gi + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const gi = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n += t3 * t3 * (grad[gi] * x3 + grad[gi + 1] * y3 + grad[gi + 2] * z3);
    }

    return clampSigned(SIMPLEX_SCALE_3D * n);
  };
}

/**
 * 归一化倍频数（把 octaves 收进合法整数区间）。
 * @param {number} octaves 原始值
 * @returns {number} 1..16 的整数
 */
function normalizeOctaves(octaves) {
  const o = Math.floor(Number.isFinite(octaves) ? octaves : 4);
  if (o < 1) return 1;
  if (o > 16) return 16;
  return o;
}

/**
 * 二维分形布朗运动（fBm）。逐倍频叠加并**除以权重和归一化**，保证多倍频后仍在 [-1,1]。
 *
 * @param {(x:number,y:number)=>number} noise2D makeNoise2D 返回的采样器
 * @param {number} x 坐标 X
 * @param {number} y 坐标 Y
 * @param {{octaves?:number, lacunarity?:number, gain?:number, frequency?:number}} [opts] 参数
 * @returns {number} [-1,1]
 */
export function fbm2D(noise2D, x, y, opts) {
  const o = opts || {};
  const octaves = normalizeOctaves(o.octaves === undefined ? 4 : o.octaves);
  const lacunarity = o.lacunarity === undefined ? 2 : o.lacunarity;
  const gain = o.gain === undefined ? 0.5 : o.gain;
  let freq = o.frequency === undefined ? 1 : o.frequency;

  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq);
    norm += Math.abs(amp);
    freq *= lacunarity;
    amp *= gain;
  }
  if (norm <= 1e-12) return 0;
  return clampSigned(sum / norm);
}

/**
 * 三维分形布朗运动（fBm）。同 fbm2D，除以权重和归一化。
 *
 * @param {(x:number,y:number,z:number)=>number} noise3D makeNoise3D 返回的采样器
 * @param {number} x 坐标 X
 * @param {number} y 坐标 Y
 * @param {number} z 坐标 Z
 * @param {{octaves?:number, lacunarity?:number, gain?:number, frequency?:number}} [opts] 参数
 * @returns {number} [-1,1]
 */
export function fbm3D(noise3D, x, y, z, opts) {
  const o = opts || {};
  const octaves = normalizeOctaves(o.octaves === undefined ? 4 : o.octaves);
  const lacunarity = o.lacunarity === undefined ? 2 : o.lacunarity;
  const gain = o.gain === undefined ? 0.5 : o.gain;
  let freq = o.frequency === undefined ? 1 : o.frequency;

  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3D(x * freq, y * freq, z * freq);
    norm += Math.abs(amp);
    freq *= lacunarity;
    amp *= gain;
  }
  if (norm <= 1e-12) return 0;
  return clampSigned(sum / norm);
}

/**
 * 二维脊状噪声（ridged multifractal，Musgrave）。
 * 单倍频信号 = (1 − |noise|)^sharpness ∈ [0,1]，脊线出现在 noise 过零处；
 * 后续倍频以 weight = clamp(signal × 2 × gain) 调制，模拟“高处更粗糙”的山脊侵蚀感。
 * 结果为各倍频的**加权平均**，因此严格落在 [0,1]。
 *
 * @param {(x:number,y:number)=>number} noise2D makeNoise2D 返回的采样器
 * @param {number} x 坐标 X
 * @param {number} y 坐标 Y
 * @param {{octaves?:number, lacunarity?:number, gain?:number, frequency?:number, sharpness?:number}} [opts] 参数
 * @returns {number} [0,1]
 */
export function ridged2D(noise2D, x, y, opts) {
  const o = opts || {};
  const octaves = normalizeOctaves(o.octaves === undefined ? 4 : o.octaves);
  const lacunarity = o.lacunarity === undefined ? 2 : o.lacunarity;
  const gain = o.gain === undefined ? 0.5 : o.gain;
  const sharpness = o.sharpness === undefined ? 2 : Math.max(1, o.sharpness);
  let freq = o.frequency === undefined ? 1 : o.frequency;

  let amp = 1;
  let weight = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    let signal = 1 - Math.abs(noise2D(x * freq, y * freq));
    if (signal < 0) signal = 0;
    signal = sharpness === 2 ? signal * signal : Math.pow(signal, sharpness);

    const w = Math.abs(amp) * weight;
    sum += w * signal;
    norm += w;

    // 上一倍频越强，下一倍频权重越大（Musgrave 的侵蚀权重）
    weight = clamp01(signal * 2 * gain);
    freq *= lacunarity;
    amp *= gain;
  }
  if (norm <= 1e-12) return 0;
  return clamp01(sum / norm);
}

/**
 * 二维 Worley（细胞 / Voronoi）噪声。每个格子内按哈希抖动放 1 个特征点，
 * 在 3×3 邻域内求最近（F1）与次近（F2）距离。
 *
 * 说明：f1 / f2 单位与输入坐标一致（即已乘回 cellSize），需要归一化时自行除以 cellSize；
 * 3×3 邻域是 Worley 论文的标准近似，边缘极端情形下的次近点误差对视觉无影响。
 *
 * @param {number} x 坐标 X
 * @param {number} y 坐标 Y
 * @param {string|number} [seed=0] 种子
 * @param {number} [cellSize=1] 格子边长（世界单位）
 * @returns {{f1:number, f2:number, id:number}} F1/F2 距离与最近格子的 uint32 id（f1 ≤ f2）
 */
export function worley2D(x, y, seed = 0, cellSize = 1) {
  const cs = Number.isFinite(cellSize) && cellSize > 1e-9 ? cellSize : 1;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { f1: 0, f2: 0, id: 0 };
  }
  const su = hashSeedCached(seed);
  const px = x / cs;
  const py = y / cs;
  const cx = Math.floor(px);
  const cy = Math.floor(py);

  let d1 = Infinity;
  let d2 = Infinity;
  let id = 0;

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      const gy = cy + oy;
      const h = hashCell(gx, gy, su);
      // 用哈希的高低 16 位取两个独立抖动量，特征点落在格子内部
      const jx = (h & 0xffff) / 65536;
      const jy = ((h >>> 16) & 0xffff) / 65536;
      const dx = gx + jx - px;
      const dy = gy + jy - py;
      const d = dx * dx + dy * dy;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = h;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }

  return {
    f1: Math.sqrt(d1) * cs,
    f2: Math.sqrt(d2) * cs,
    id
  };
}
