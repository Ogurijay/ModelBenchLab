/**
 * @file src/core/rng.js
 * @description 全场景唯一随机源（契约 §3.1）。整个项目禁止使用 `Math.random()`，
 * 一切随机必须来自本模块，保证「同种子 → 逐顶点完全一致」的可复现城市。
 *
 * 算法出处：
 * - 字符串散列：FNV-1a 32 位（Fowler–Noll–Vo hash, offset basis 2166136261 / prime 16777619）
 * - 伪随机发生器：mulberry32（Tommy Ettinger, 2017），32 位状态、周期 2^32、通过 gjrand 基本测试
 * - 种子雪崩混合：MurmurHash3 的 fmix32 终结器（Austin Appleby）
 * - 正态分布：Box–Muller 变换（G. E. P. Box & M. E. Muller, 1958）
 * - 洗牌：Fisher–Yates / Knuth shuffle（TAOCP Vol.2, Algorithm P）
 *
 * 本模块不依赖任何其他项目模块，也不 import three（契约 §0 依赖方向）。
 */

/** 2π，供 Box–Muller 使用 */
const TWO_PI = Math.PI * 2;

/** FNV-1a 32 位偏移基准 */
const FNV_OFFSET_BASIS = 0x811c9dc5;
/** FNV-1a 32 位质数 */
const FNV_PRIME = 0x01000193;
/** 2^32，用于把 uint32 归一化到 [0,1) */
const UINT32_SCALE = 4294967296;

/**
 * MurmurHash3 终结器 fmix32：把任意 uint32 打散成高熵 uint32。
 * 用于「相邻种子必须给出完全不相关的序列」这一需求。
 * @param {number} h 输入（按 uint32 解释）
 * @returns {number} 雪崩后的 uint32
 */
function fmix32(h) {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * 把任意值转成用于散列的字符串。
 * 数字走 `String(v)` 归一化：`hashString(123) === hashString('123')`，
 * 且 `-0` 与 `0` 归一到同一字符串，保证数字输入的稳定散列。
 * @param {*} value 任意输入
 * @returns {string} 规范化字符串
 */
function toHashableString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Object.is(value, -0) ? '0' : String(value);
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return String(value);
}

/**
 * FNV-1a 32 位字符串散列。字符串先按 UTF-8 逐字节编码再散列，
 * 因此纯 ASCII 输入与标准 FNV-1a 参考实现结果完全一致（如 `hashString('hello') === 0x4f9f2cab`）。
 * @param {string|number} str 字符串或数字（数字按其十进制文本散列，稳定可复现）
 * @returns {number} uint32 散列值
 */
export function hashString(str) {
  const s = toHashableString(str);
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    // 合并 UTF-16 代理对，保证增补平面字符的 UTF-8 编码正确
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = (cp - 0xd800) * 0x400 + (lo - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (cp < 0x80) {
      h = Math.imul(h ^ cp, FNV_PRIME);
    } else if (cp < 0x800) {
      h = Math.imul(h ^ (0xc0 | (cp >> 6)), FNV_PRIME);
      h = Math.imul(h ^ (0x80 | (cp & 0x3f)), FNV_PRIME);
    } else if (cp < 0x10000) {
      h = Math.imul(h ^ (0xe0 | (cp >> 12)), FNV_PRIME);
      h = Math.imul(h ^ (0x80 | ((cp >> 6) & 0x3f)), FNV_PRIME);
      h = Math.imul(h ^ (0x80 | (cp & 0x3f)), FNV_PRIME);
    } else {
      h = Math.imul(h ^ (0xf0 | (cp >> 18)), FNV_PRIME);
      h = Math.imul(h ^ (0x80 | ((cp >> 12) & 0x3f)), FNV_PRIME);
      h = Math.imul(h ^ (0x80 | ((cp >> 6) & 0x3f)), FNV_PRIME);
      h = Math.imul(h ^ (0x80 | (cp & 0x3f)), FNV_PRIME);
    }
  }
  return h >>> 0;
}

/**
 * mulberry32 伪随机发生器：32 位状态，返回 [0,1) 均匀分布的无参函数。
 * @param {number} seed uint32 种子（非整数/超范围会被规范化）
 * @returns {() => number} 每次调用推进一步，返回 [0,1)
 */
export function mulberry32(seed) {
  let a = normalizeSeed(seed);
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_SCALE;
  };
}

/**
 * 把任意种子输入规范化为 uint32。
 * - 有限整数：取低 32 位（负数按补码，如 -1 → 4294967295）
 * - 其他数字（小数/NaN/Infinity）与字符串：走 `hashString`
 * @param {number|string|undefined|null} seed 种子
 * @returns {number} uint32
 */
function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Number.isInteger(seed) ? seed >>> 0 : hashString(seed);
  }
  if (seed === undefined || seed === null) return hashString('manhattan');
  return hashString(seed);
}

/**
 * 把「父种子」与「流名散列」混合成子流种子。
 * 契约要求以 `hashString(streamName) ^ seed` 重新起链；这里在异或之后再过一次
 * fmix32 雪崩，避免相近名字（如 'a'/'b'）得到高度相关的低位状态。
 * @param {number} baseSeed uint32 父种子
 * @param {string|number} streamName 流名
 * @returns {number} uint32 子流种子
 */
function mixStream(baseSeed, streamName) {
  return fmix32(((baseSeed >>> 0) ^ hashString(streamName)) >>> 0);
}

/**
 * 默认权重函数：优先读对象的 `weight` 字段，否则视为等权 1。
 * @param {*} item 元素
 * @returns {number} 权重
 */
function defaultWeightFn(item) {
  if (item && typeof item === 'object' && typeof item.weight === 'number') return item.weight;
  return 1;
}

/**
 * @typedef {Object} Rng
 * @property {number} seed 实际生效的 uint32 种子
 * @property {() => number} next [0,1)
 * @property {(min: number, max: number) => number} range [min,max)
 * @property {(min: number, maxInclusive: number) => number} int 闭区间整数
 * @property {(p?: number) => boolean} bool 以概率 p 返回 true
 * @property {<T>(arr: T[]) => (T|undefined)} pick 均匀取一个，空数组返回 undefined
 * @property {<T>(items: T[], weightFn?: (item: T, i: number) => number) => (T|undefined)} weighted 按权重取一个
 * @property {(mean?: number, std?: number) => number} gauss 正态分布（Box–Muller）
 * @property {<T>(arr: T[]) => T[]} shuffle 原地洗牌并返回同一数组
 * @property {(streamName: string|number) => Rng} fork 派生独立子流
 */

/**
 * 创建一个种子 RNG。
 *
 * 关键性质：
 * 1. **可复现**：`makeRng(s, name)` 相同 → 序列逐位相同。
 * 2. **子流隔离**：`fork(name)` 只读取父流的 `seed`（不消耗父流状态），
 *    因此子流抽多少数都不会影响父流后续序列；父流抽数也不影响已派生子流。
 * 3. **同名同源**：同一父种子下 `fork('a')` 任意次都得到完全相同的子流。
 *
 * @param {number|string} seed 种子（数字或字符串，字符串走 FNV-1a）
 * @param {string} [stream='root'] 流名
 * @returns {Rng} RNG 对象
 */
export function makeRng(seed, stream = 'root') {
  const effectiveSeed = mixStream(normalizeSeed(seed), stream);
  const core = mulberry32(effectiveSeed);

  /** @type {Rng} */
  const rng = {
    seed: effectiveSeed,

    /**
     * 均匀随机数。
     * @returns {number} [0,1)
     */
    next() {
      return core();
    },

    /**
     * 区间内均匀实数。`min > max` 时自动交换。
     * @param {number} min 下界（含）
     * @param {number} max 上界（不含）
     * @returns {number} [min,max)
     */
    range(min, max) {
      const u = core();
      const lo = min < max ? min : max;
      const hi = min < max ? max : min;
      return lo + (hi - lo) * u;
    },

    /**
     * 闭区间整数 [min, maxInclusive]。非整数边界会向内取整；
     * 无论边界是否合法都恒定消耗一个随机数，保证流推进次数稳定。
     * @param {number} min 下界（含）
     * @param {number} maxInclusive 上界（含）
     * @returns {number} 整数
     */
    int(min, maxInclusive) {
      const u = core();
      const a = min < maxInclusive ? min : maxInclusive;
      const b = min < maxInclusive ? maxInclusive : min;
      const lo = Math.ceil(a);
      const hi = Math.floor(b);
      if (hi < lo) return lo;
      const v = lo + Math.floor(u * (hi - lo + 1));
      return v > hi ? hi : v;
    },

    /**
     * 伯努利采样。
     * @param {number} [p=0.5] 返回 true 的概率（p<=0 恒 false，p>=1 恒 true）
     * @returns {boolean} 结果
     */
    bool(p = 0.5) {
      return core() < p;
    },

    /**
     * 从数组均匀取一个元素。空数组/非数组返回 undefined（且不消耗随机数）。
     * @param {Array} array 候选数组
     * @returns {*} 元素或 undefined
     */
    pick(array) {
      if (!array || array.length === 0) return undefined;
      const idx = Math.floor(core() * array.length);
      return array[idx < array.length ? idx : array.length - 1];
    },

    /**
     * 按权重取一个元素（轮盘赌）。`weightFn` 必须是纯函数（内部会遍历两遍）。
     * 权重为负/NaN 视为 0；总权重为 0 时退化为均匀选取。
     * @param {Array} items 候选数组
     * @param {(item: *, index: number) => number} [weightFn] 权重函数，默认读 `item.weight`，否则 1
     * @returns {*} 元素或 undefined
     */
    weighted(items, weightFn) {
      if (!items || items.length === 0) return undefined;
      const fn = typeof weightFn === 'function' ? weightFn : defaultWeightFn;
      let total = 0;
      for (let i = 0; i < items.length; i++) {
        const w = fn(items[i], i);
        if (Number.isFinite(w) && w > 0) total += w;
      }
      const u = core();
      if (total <= 0) {
        const idx = Math.floor(u * items.length);
        return items[idx < items.length ? idx : items.length - 1];
      }
      let acc = u * total;
      for (let i = 0; i < items.length; i++) {
        const w = fn(items[i], i);
        if (!Number.isFinite(w) || w <= 0) continue;
        acc -= w;
        if (acc < 0) return items[i];
      }
      return items[items.length - 1];
    },

    /**
     * 正态分布采样，Box–Muller 变换：
     * `z = sqrt(-2·ln u1)·cos(2π·u2)`，其中 u1∈(0,1]、u2∈[0,1)。
     * 每次调用恒定消耗 2 个均匀随机数（不缓存第二个正态量，保证流推进可预测）。
     * @param {number} [mean=0] 均值
     * @param {number} [std=1] 标准差
     * @returns {number} 采样值
     */
    gauss(mean = 0, std = 1) {
      const u1 = 1 - core(); // 落在 (0,1]，避免 ln(0)
      const u2 = core();
      return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2);
    },

    /**
     * Fisher–Yates 原地洗牌。
     * @param {Array} array 待洗牌数组（原地修改）
     * @returns {Array} 同一数组引用
     */
    shuffle(array) {
      if (!array || array.length < 2) return array;
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(core() * (i + 1));
        const k = j > i ? i : j;
        const tmp = array[i];
        array[i] = array[k];
        array[k] = tmp;
      }
      return array;
    },

    /**
     * 派生一条独立子流：种子 = fmix32(父种子 ^ hashString(流名))。
     * 只读父流的 `seed`，**不消耗父流状态**，因此父子互不干扰。
     * @param {string|number} streamName 子流名
     * @returns {Rng} 子 RNG
     */
    fork(streamName) {
      return makeRng(effectiveSeed, streamName === undefined ? 'fork' : streamName);
    }
  };

  return rng;
}

/**
 * 浮点比特位提取用的临时视图。仅作为「写入即读出」的暂存区，
 * 不跨调用保存任何状态，因此 `hash2D` 依旧是无状态纯函数。
 */
const _bitsBuffer = new ArrayBuffer(8);
const _bitsView = new DataView(_bitsBuffer);

/**
 * 把一个 double 的全部 64 位比特混入散列，保证大坐标与高精度小数都不会混叠。
 * @param {number} h 当前散列（uint32）
 * @param {number} v 浮点值
 * @returns {number} 新散列（uint32）
 */
function mixFloat(h, v) {
  _bitsView.setFloat64(0, v === 0 ? 0 : v); // 归一化 -0 → 0
  let x = h >>> 0;
  x = (x ^ _bitsView.getUint32(0)) >>> 0;
  x = Math.imul(x, 0x85ebca6b);
  x = ((x << 13) | (x >>> 19)) >>> 0;
  x = (x ^ _bitsView.getUint32(4)) >>> 0;
  x = Math.imul(x, 0xc2b2ae35);
  x = ((x << 15) | (x >>> 17)) >>> 0;
  return x >>> 0;
}

/**
 * 无状态 2D 空间散列：给定 (x, y, seed) 恒定返回同一个 [0,1) 值，
 * 与调用顺序、调用次数无关，可用于并行/乱序的网格采样（value noise、散布点等）。
 * @param {number} x 坐标 X
 * @param {number} y 坐标 Y
 * @param {number|string} [seed=0] 种子（字符串走 FNV-1a）
 * @returns {number} [0,1)
 */
export function hash2D(x, y, seed = 0) {
  let h = (normalizeSeed(seed) ^ FNV_OFFSET_BASIS) >>> 0;
  h = mixFloat(h, x);
  h = mixFloat(h, y);
  return fmix32(h) / UINT32_SCALE;
}
