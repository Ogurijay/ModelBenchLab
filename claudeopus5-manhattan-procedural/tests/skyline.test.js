/**
 * @file tests/skyline.test.js
 * @description city/skyline.js 单元测试（契约 §4.2 / §10）。
 *
 * 覆盖：常量结构、同种子逐点一致、不同种子不同、双峰中心显著高于城市边缘、
 *       公园/水域返回 0、值域 [0,330]、非零高度必须是 3.5m 层高的整数倍、
 *       styleAt 返回值合法且不是整片同材质、densityAt ∈ [0,1] 且峰心高于边缘、
 *       天际线参差性（高度分布有足够方差与取值多样性）。
 *
 * 注：热循环内不逐样本调用 expect（开销大），改为累积极值/计数后统一断言。
 */

import { describe, it, expect } from 'vitest';
import { SKYLINE_PEAKS, createHeightField } from '../src/city/skyline.js';
import { CITY } from '../src/city/grid.js';

/** 标准层高（米） */
const FLOOR = 3.5;
/** 合法材质集合 */
const STYLES = ['limestone', 'brick', 'glass', 'deco'];

/**
 * 测试内部用的独立 PRNG（mulberry32），生成互不相关的散点采样坐标，
 * 避免规则网格与噪声网格共振。不依赖被测模块。
 * @param {number} seed uint32 种子
 * @returns {() => number} [0,1)
 */
function prng(seed) {
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
 * 在曼哈顿陆地范围内随机撒点。
 * @param {number} count 点数
 * @param {number} seed PRNG 种子
 * @returns {Array<[number, number]>} [x, z] 数组
 */
function landSamples(count, seed) {
  const rand = prng(seed);
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push([
      CITY.minX + rand() * (CITY.maxX - CITY.minX),
      CITY.minZ + rand() * (CITY.maxZ - CITY.minZ)
    ]);
  }
  return pts;
}

/**
 * 判断是否为 FLOOR 的整数倍（容差 1e-6 层）。
 * @param {number} h 高度
 * @returns {boolean} 结果
 */
function isFloorMultiple(h) {
  const k = h / FLOOR;
  return Math.abs(k - Math.round(k)) < 1e-6;
}

describe('SKYLINE_PEAKS 常量', () => {
  it('应为契约规定的中城/下城双峰及其数值', () => {
    expect(SKYLINE_PEAKS).toHaveLength(2);
    expect(SKYLINE_PEAKS[0]).toMatchObject({ name: 'midtown', x: 0, z: -560, amp: 300, sigma: 430 });
    expect(SKYLINE_PEAKS[1]).toMatchObject({ name: 'downtown', x: 100, z: 1750, amp: 265, sigma: 390 });
  });
});

describe('createHeightField 句柄形状', () => {
  it('应导出三个采样函数与 peaks/maxHeight', () => {
    const hf = createHeightField('shape');
    expect(typeof hf.heightAt).toBe('function');
    expect(typeof hf.densityAt).toBe('function');
    expect(typeof hf.styleAt).toBe('function');
    expect(hf.peaks).toBe(SKYLINE_PEAKS);
    expect(hf.maxHeight).toBe(330);
  });
});

describe('确定性', () => {
  it('同种子两次创建应逐点完全一致（高度/密度/材质）', () => {
    const a = createHeightField('manhattan-42');
    const b = createHeightField('manhattan-42');
    const pts = landSamples(500, 0x1234abcd);
    let mismatches = 0;
    for (const [x, z] of pts) {
      if (a.heightAt(x, z) !== b.heightAt(x, z)) mismatches++;
      if (a.densityAt(x, z) !== b.densityAt(x, z)) mismatches++;
      if (a.styleAt(x, z) !== b.styleAt(x, z)) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it('数字种子与其等价字符串种子一致，且重复调用同一点结果稳定', () => {
    const hf = createHeightField(7);
    const pts = landSamples(120, 0x777);
    let unstable = 0;
    for (const [x, z] of pts) {
      const first = hf.heightAt(x, z);
      hf.heightAt(x + 13.7, z - 9.1); // 打断内部记忆化缓存
      if (hf.heightAt(x, z) !== first) unstable++;
    }
    expect(unstable).toBe(0);
  });

  it('不同种子应给出不同的高度场', () => {
    const a = createHeightField('seed-A');
    const b = createHeightField('seed-B');
    const pts = landSamples(400, 0x55aa55aa);
    let diff = 0;
    for (const [x, z] of pts) {
      if (a.heightAt(x, z) !== b.heightAt(x, z)) diff++;
    }
    // 同一套高斯骨架下不会 100% 不同（边缘会一起被 clamp），但差异必须显著
    expect(diff).toBeGreaterThan(pts.length * 0.5);
  });
});

describe('heightAt 形态与值域', () => {
  const hf = createHeightField('skyline-shape');

  it('双峰中心应显著高于城市边缘', () => {
    const midtown = hf.heightAt(SKYLINE_PEAKS[0].x, SKYLINE_PEAKS[0].z);
    const downtown = hf.heightAt(SKYLINE_PEAKS[1].x, SKYLINE_PEAKS[1].z);
    const fringeNorth = hf.heightAt(700, -2300);
    const fringeSouth = hf.heightAt(-600, 2350);

    expect(midtown).toBeGreaterThan(fringeNorth);
    expect(downtown).toBeGreaterThan(fringeNorth);
    expect(midtown).toBeGreaterThan(fringeSouth);
    expect(downtown).toBeGreaterThan(fringeSouth);
    // “显著”：峰心至少是边缘的 3 倍
    expect(midtown).toBeGreaterThan(fringeNorth * 3);
    expect(downtown).toBeGreaterThan(fringeSouth * 3);
    // 双峰之间的村区（苏活一带）应明显塌陷
    expect(hf.heightAt(0, 800)).toBeLessThan(Math.min(midtown, downtown) * 0.75);
  });

  it('公园范围内一律返回 0', () => {
    const p = CITY.park;
    const probes = [
      [(p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2],
      [p.minX + 5, p.minZ + 5],
      [p.maxX - 5, p.maxZ - 5],
      [-140, -1400],
      [0, -900]
    ];
    let nonZero = 0;
    for (const [x, z] of probes) {
      if (hf.heightAt(x, z) !== 0) nonZero++;
    }
    expect(nonZero).toBe(0);
  });

  it('水域（两河与陆地范围外）一律返回 0', () => {
    const probes = [
      [CITY.river.hudsonX - 40, 0],
      [CITY.river.eastX + 40, 500],
      [-1500, 2200],
      [1200, 1900],
      [0, CITY.minZ - 60],
      [0, CITY.maxZ + 60]
    ];
    let nonZero = 0;
    for (const [x, z] of probes) {
      if (hf.heightAt(x, z) !== 0) nonZero++;
    }
    expect(nonZero).toBe(0);
  });

  it('全城采样：值域在 [0,330] 且非零高度必为 3.5 的整数倍', () => {
    const pts = landSamples(3000, 0xc0ffee);
    let min = Infinity;
    let max = -Infinity;
    let badMultiple = 0;
    let nonFinite = 0;
    for (const [x, z] of pts) {
      const h = hf.heightAt(x, z);
      if (!Number.isFinite(h)) {
        nonFinite++;
        continue;
      }
      if (h < min) min = h;
      if (h > max) max = h;
      if (h !== 0 && !isFloorMultiple(h)) badMultiple++;
    }
    expect(nonFinite).toBe(0);
    expect(badMultiple).toBe(0);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(330);
    // 双峰中心附近必须真的很高，否则说明高斯项没生效
    expect(max).toBeGreaterThan(240);
  });

  it('天际线应参差不齐（高度取值多样、方差足够）', () => {
    const pts = landSamples(1200, 0xbeef01);
    const values = [];
    for (const [x, z] of pts) {
      const h = hf.heightAt(x, z);
      if (h > 0) values.push(h);
    }
    expect(values.length).toBeGreaterThan(400);

    const unique = new Set(values);
    // 若整片一样高，唯一值会寥寥无几
    expect(unique.size).toBeGreaterThan(40);

    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
    expect(Math.sqrt(variance)).toBeGreaterThan(15);
  });

  it('非有限输入安全返回 0', () => {
    expect(hf.heightAt(Number.NaN, 0)).toBe(0);
    expect(hf.heightAt(0, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('densityAt', () => {
  const hf = createHeightField('density-check');

  it('全城采样恒在 [0,1]', () => {
    const pts = landSamples(2000, 0xd00d);
    let min = Infinity;
    let max = -Infinity;
    let nonFinite = 0;
    for (const [x, z] of pts) {
      const d = hf.densityAt(x, z);
      if (!Number.isFinite(d)) {
        nonFinite++;
        continue;
      }
      if (d < min) min = d;
      if (d > max) max = d;
    }
    expect(nonFinite).toBe(0);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('峰心接近 1、城市边缘约 0.45，公园/水域为 0', () => {
    const midtown = hf.densityAt(SKYLINE_PEAKS[0].x, SKYLINE_PEAKS[0].z);
    const downtown = hf.densityAt(SKYLINE_PEAKS[1].x, SKYLINE_PEAKS[1].z);
    const fringe = hf.densityAt(700, -2350);

    expect(midtown).toBeGreaterThan(0.85);
    expect(downtown).toBeGreaterThan(0.85);
    expect(fringe).toBeLessThan(0.62);
    expect(fringe).toBeGreaterThan(0.3);
    expect(hf.densityAt(-140, -1400)).toBe(0);
    expect(hf.densityAt(CITY.river.eastX + 100, 0)).toBe(0);
  });
});

describe('styleAt', () => {
  const hf = createHeightField('style-check');

  it('返回值恒为四种合法材质之一（含公园/水域/越界点）', () => {
    const pts = landSamples(2000, 0x5741e);
    pts.push([-140, -1400], [-2000, 0], [0, 9999], [Number.NaN, 0]);
    let illegal = 0;
    for (const [x, z] of pts) {
      if (!STYLES.includes(hf.styleAt(x, z))) illegal++;
    }
    expect(illegal).toBe(0);
  });

  it('四种材质都应出现，且不被单一材质垄断', () => {
    const pts = landSamples(2400, 0x5741f);
    const counts = { limestone: 0, brick: 0, glass: 0, deco: 0 };
    for (const [x, z] of pts) counts[hf.styleAt(x, z)]++;
    for (const key of STYLES) {
      expect(counts[key]).toBeGreaterThan(pts.length * 0.05);
      expect(counts[key]).toBeLessThan(pts.length * 0.7);
    }
  });

  it('村区偏砖、上城/公园周边偏石灰岩、中城高层偏玻璃或装饰艺术', () => {
    const tallyLine = (zFixed, xs) => {
      const counts = { limestone: 0, brick: 0, glass: 0, deco: 0 };
      for (const x of xs) counts[hf.styleAt(x, zFixed)]++;
      return counts;
    };
    const xs = [];
    for (let x = -760; x <= 760; x += 17) xs.push(x);

    const village = tallyLine(760, xs);
    expect(village.brick).toBeGreaterThan(village.glass);

    const uptown = tallyLine(-2000, xs);
    expect(uptown.limestone).toBeGreaterThan(uptown.glass);

    const midtownXs = [];
    for (let x = -220; x <= 220; x += 7) midtownXs.push(x);
    const midtown = tallyLine(-560, midtownXs);
    expect(midtown.glass + midtown.deco).toBeGreaterThan(midtown.brick);
  });
});
