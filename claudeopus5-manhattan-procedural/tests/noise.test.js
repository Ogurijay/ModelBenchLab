/**
 * @file tests/noise.test.js
 * @description core/noise.js 单元测试（契约 §3.2 / §10）。
 * 覆盖：确定性、值域边界（大量采样不越界）、连续性（相邻小步长差值有界 → 平滑）、
 *       不同种子输出不同、fbm 归一化、ridged 值域、worley 的 f1 ≤ f2 与格子 id 语义，
 *       以及各向同性（不同方向自相关一致 → 无网格轴向条纹）。
 *
 * 注：热循环里不逐样本调用 expect（开销大），改为累积极值/计数后统一断言。
 */

import { describe, it, expect } from 'vitest';
import {
  makeNoise2D,
  makeNoise3D,
  fbm2D,
  fbm3D,
  ridged2D,
  worley2D
} from '../src/core/noise.js';

/** 采样用的无理步长，避免恰好落在格点上导致测试失真 */
const STEP_X = 0.1373;
const STEP_Y = 0.0917;
const STEP_Z = 0.0719;

/**
 * 测试内部用的独立 PRNG（mulberry32），用于生成互不相关的散点采样，
 * 避免规则网格采样与噪声网格产生共振。不依赖被测模块。
 * @param {number} seed uint32
 * @returns {() => number} [0,1)
 */
function testRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('makeNoise2D', () => {
  it('同种子确定性：两个实例逐点一致', () => {
    const a = makeNoise2D('manhattan');
    const b = makeNoise2D('manhattan');
    let mismatch = 0;
    for (let i = 0; i < 5000; i++) {
      const x = i * STEP_X - 80;
      const y = i * STEP_Y + 17;
      if (a(x, y) !== b(x, y)) mismatch++;
    }
    expect(mismatch).toBe(0);
  });

  it('数字种子与字符串种子都可用且确定', () => {
    expect(makeNoise2D(20240607)(3.14, -2.72)).toBe(makeNoise2D(20240607)(3.14, -2.72));
    expect(makeNoise2D(0)(1.5, 1.5)).toBe(makeNoise2D(0)(1.5, 1.5));
    expect(makeNoise2D('nyc')(1.5, 1.5)).not.toBe(makeNoise2D('nyc2')(1.5, 1.5));
  });

  it('值域严格落在 [-1, 1]（36 万次采样）', () => {
    const n = makeNoise2D('range-2d');
    let min = Infinity;
    let max = -Infinity;
    let nonFinite = 0;
    for (let i = 0; i < 600; i++) {
      for (let j = 0; j < 600; j++) {
        const v = n(i * STEP_X - 40, j * STEP_Y + 13);
        if (!Number.isFinite(v)) nonFinite++;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    expect(nonFinite).toBe(0);
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    // 同时确认没有退化：应真正用满值域，而不是塌在 0 附近
    expect(min).toBeLessThan(-0.8);
    expect(max).toBeGreaterThan(0.8);
  });

  it('均值接近 0（无直流偏置）', () => {
    const n = makeNoise2D('mean-2d');
    let sum = 0;
    let count = 0;
    for (let i = 0; i < 400; i++) {
      for (let j = 0; j < 400; j++) {
        sum += n(i * 0.29 - 30, j * 0.31 + 11);
        count++;
      }
    }
    expect(Math.abs(sum / count)).toBeLessThan(0.02);
  });

  it('连续性：1e-3 步长的采样差有界（平滑，无跳变）', () => {
    const n = makeNoise2D('smooth-2d');
    const h = 1e-3;
    let maxDelta = 0;
    for (let i = 0; i < 500; i++) {
      for (let j = 0; j < 200; j++) {
        const x = i * 0.311 - 60;
        const y = j * 0.237 + 5;
        const base = n(x, y);
        const dxp = Math.abs(n(x + h, y) - base);
        const dyp = Math.abs(n(x, y + h) - base);
        const dxm = Math.abs(n(x - h, y) - base);
        if (dxp > maxDelta) maxDelta = dxp;
        if (dyp > maxDelta) maxDelta = dyp;
        if (dxm > maxDelta) maxDelta = dxm;
      }
    }
    // 经验 Lipschitz 常数约 7.5 → 1e-3 步长的差应远小于 0.05
    expect(maxDelta).toBeLessThan(0.05);
    // 但也不能是常数场
    expect(maxDelta).toBeGreaterThan(0);
  });

  it('连续性：跨单纯形格边界（整数 / 半格坐标）也不跳变', () => {
    const n = makeNoise2D('cross-cell');
    const h = 1e-4;
    let maxJump = 0;
    for (let k = -40; k <= 40; k++) {
      for (const y of [k * 0.5, k * 0.5 + 0.25, k * 0.25 + 0.5]) {
        const x = k * 1.0;
        maxJump = Math.max(
          maxJump,
          Math.abs(n(x + h, y) - n(x - h, y)),
          Math.abs(n(x, y + h) - n(x, y - h))
        );
      }
    }
    expect(maxJump).toBeLessThan(0.01);
  });

  it('不同种子产生明显不同的场', () => {
    const a = makeNoise2D('seed-a');
    const b = makeNoise2D('seed-b');
    let diff = 0;
    let identical = 0;
    for (let i = 0; i < 5000; i++) {
      const x = i * 0.071 - 10;
      const y = i * 0.031 + 4;
      const va = a(x, y);
      const vb = b(x, y);
      diff += Math.abs(va - vb);
      if (va === vb) identical++;
    }
    expect(diff / 5000).toBeGreaterThan(0.2);
    expect(identical).toBeLessThan(50);
  });

  it('各向同性：各方向自相关一致（无轴向网格条纹）', () => {
    const rand = testRandom(0xc0ffee);
    const pts = [];
    for (let i = 0; i < 30000; i++) pts.push([rand() * 600 - 300, rand() * 600 - 300]);
    const lag = 0.2;
    const dirs = [
      [1, 0],
      [0, 1],
      [Math.SQRT1_2, Math.SQRT1_2],
      [Math.SQRT1_2, -Math.SQRT1_2],
      [0.5, Math.sqrt(3) / 2],
      [Math.sqrt(3) / 2, 0.5]
    ];
    for (const seed of ['iso-a', 'iso-b']) {
      const n = makeNoise2D(seed);
      const corrs = dirs.map(([dx, dy]) => {
        let sab = 0;
        let saa = 0;
        let sbb = 0;
        for (let i = 0; i < pts.length; i++) {
          const x = pts[i][0];
          const y = pts[i][1];
          const a = n(x, y);
          const b = n(x + dx * lag, y + dy * lag);
          sab += a * b;
          saa += a * a;
          sbb += b * b;
        }
        return sab / Math.sqrt(saa * sbb);
      });
      const min = Math.min(...corrs);
      const max = Math.max(...corrs);
      // 短距强相关 = 平滑；各方向差异极小 = 各向同性（实测 spread ≈ 0.01）
      expect(min).toBeGreaterThan(0.5);
      expect(max).toBeLessThan(0.75);
      expect(max - min).toBeLessThan(0.06);
    }
  });

  it('非有限输入安全返回 0', () => {
    const n = makeNoise2D('guard');
    expect(n(NaN, 1)).toBe(0);
    expect(n(1, Infinity)).toBe(0);
  });
});

describe('makeNoise3D', () => {
  it('同种子确定性', () => {
    const a = makeNoise3D('city-3d');
    const b = makeNoise3D('city-3d');
    let mismatch = 0;
    for (let i = 0; i < 4000; i++) {
      const x = i * STEP_X - 12;
      const y = i * STEP_Y + 3;
      const z = i * STEP_Z - 7;
      if (a(x, y, z) !== b(x, y, z)) mismatch++;
    }
    expect(mismatch).toBe(0);
  });

  it('值域严格落在 [-1, 1]（约 42 万次采样）', () => {
    const n = makeNoise3D('range-3d');
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 75; i++) {
      for (let j = 0; j < 75; j++) {
        for (let k = 0; k < 75; k++) {
          const v = n(i * 0.21 - 5, j * 0.17 + 2, k * 0.13 - 9);
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    expect(Number.isFinite(min)).toBe(true);
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeLessThan(-0.8);
    expect(max).toBeGreaterThan(0.8);
  });

  it('连续性：1e-3 步长的采样差有界', () => {
    const n = makeNoise3D('smooth-3d');
    const h = 1e-3;
    let maxDelta = 0;
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 40; j++) {
        for (let k = 0; k < 40; k++) {
          const x = i * 0.41 - 5;
          const y = j * 0.33 + 1;
          const z = k * 0.29 - 3;
          const base = n(x, y, z);
          const d1 = Math.abs(n(x + h, y, z) - base);
          const d2 = Math.abs(n(x, y + h, z) - base);
          const d3 = Math.abs(n(x, y, z + h) - base);
          if (d1 > maxDelta) maxDelta = d1;
          if (d2 > maxDelta) maxDelta = d2;
          if (d3 > maxDelta) maxDelta = d3;
        }
      }
    }
    expect(maxDelta).toBeLessThan(0.05);
    expect(maxDelta).toBeGreaterThan(0);
  });

  it('不同种子结果不同；同种子的 2D 与 3D 场互不相关', () => {
    const a = makeNoise3D('s1');
    const b = makeNoise3D('s2');
    let diff = 0;
    for (let i = 0; i < 4000; i++) {
      const x = i * 0.053;
      const y = i * 0.037 - 2;
      const z = i * 0.029 + 5;
      diff += Math.abs(a(x, y, z) - b(x, y, z));
    }
    expect(diff / 4000).toBeGreaterThan(0.2);

    // 注意：梯度噪声在格点处恒为 0（Perlin/Simplex 的固有性质），采样点需避开原点
    const n2 = makeNoise2D('same-seed');
    const n3 = makeNoise3D('same-seed');
    let sameCount = 0;
    for (let i = 0; i < 1000; i++) {
      const x = i * 0.13 + 0.37;
      const y = i * 0.07 - 0.21;
      if (n2(x, y) === n3(x, y, 0.11)) sameCount++;
    }
    expect(sameCount).toBe(0);
  });

  it('非有限输入安全返回 0', () => {
    const n = makeNoise3D('guard3');
    expect(n(NaN, 0, 0)).toBe(0);
    expect(n(0, 0, -Infinity)).toBe(0);
  });
});

describe('fbm2D / fbm3D', () => {
  it('单倍频等价于原始噪声，frequency 参数生效', () => {
    const n = makeNoise2D('fbm-single');
    const x = 3.7;
    const y = -1.9;
    expect(fbm2D(n, x, y, { octaves: 1 })).toBeCloseTo(n(x, y), 12);
    expect(fbm2D(n, x, y, { octaves: 1, frequency: 2.5 })).toBeCloseTo(n(x * 2.5, y * 2.5), 12);
    const n3 = makeNoise3D('fbm-single');
    expect(fbm3D(n3, 1.1, 2.2, 3.3, { octaves: 1 })).toBeCloseTo(n3(1.1, 2.2, 3.3), 12);
  });

  it('归一化：1..10 倍频结果都严格在 [-1,1]', () => {
    const n2 = makeNoise2D('fbm-range');
    const n3 = makeNoise3D('fbm-range');
    for (let oct = 1; oct <= 10; oct++) {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 4000; i++) {
        const x = i * 0.013 - 26;
        const y = i * 0.0071 + 3;
        const v2 = fbm2D(n2, x, y, { octaves: oct });
        const v3 = fbm3D(n3, x, y, i * 0.005 - 10, { octaves: oct });
        min = Math.min(min, v2, v3);
        max = Math.max(max, v2, v3);
      }
      expect(min).toBeGreaterThanOrEqual(-1);
      expect(max).toBeLessThanOrEqual(1);
    }
  });

  it('归一化：极端参数（高 gain / 高 lacunarity / 超多倍频）仍不越界', () => {
    const n = makeNoise2D('fbm-extreme');
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 4000; i++) {
      const v = fbm2D(n, i * 0.017, i * 0.011, {
        octaves: 40, // 会被内部收敛到上限，不应抛错或越界
        gain: 0.95,
        lacunarity: 2.7,
        frequency: 0.4
      });
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(-1);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('确定性 + 缺省 opts 可用', () => {
    const n = makeNoise2D('fbm-det');
    const a = fbm2D(n, 1.234, 5.678);
    expect(fbm2D(n, 1.234, 5.678)).toBe(a);
    expect(Number.isFinite(a)).toBe(true);
    const n3 = makeNoise3D('fbm-det');
    expect(fbm3D(n3, 1.1, 2.2, 3.3)).toBe(fbm3D(n3, 1.1, 2.2, 3.3));
  });

  it('多倍频比单倍频含更多高频细节', () => {
    const n = makeNoise2D('fbm-detail');
    const h = 0.002;
    let rough1 = 0;
    let rough6 = 0;
    for (let i = 0; i < 3000; i++) {
      const x = i * 0.019 - 20;
      const y = i * 0.013 + 6;
      rough1 += Math.abs(fbm2D(n, x + h, y, { octaves: 1 }) - fbm2D(n, x, y, { octaves: 1 }));
      rough6 += Math.abs(fbm2D(n, x + h, y, { octaves: 6 }) - fbm2D(n, x, y, { octaves: 6 }));
    }
    expect(rough6).toBeGreaterThan(rough1 * 1.05);
  });

  it('fbm 保持连续（小步长差有界）', () => {
    const n = makeNoise2D('fbm-smooth');
    const h = 1e-3;
    let maxDelta = 0;
    for (let i = 0; i < 4000; i++) {
      const x = i * 0.037 - 40;
      const y = i * 0.023 + 9;
      const d = Math.abs(
        fbm2D(n, x + h, y, { octaves: 5 }) - fbm2D(n, x, y, { octaves: 5 })
      );
      if (d > maxDelta) maxDelta = d;
    }
    expect(maxDelta).toBeLessThan(0.05);
    expect(maxDelta).toBeGreaterThan(0);
  });
});

describe('ridged2D', () => {
  it('值域严格 [0,1]，脊线（接近 1）与谷底（接近 0）都出现', () => {
    const n = makeNoise2D('ridged');
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 500; i++) {
      for (let j = 0; j < 200; j++) {
        const v = ridged2D(n, i * 0.041 - 10, j * 0.037 + 2, { octaves: 5 });
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
    expect(min).toBeLessThan(0.1);
    expect(max).toBeGreaterThan(0.9);
  });

  it('确定性与缺省参数', () => {
    const n = makeNoise2D('ridged-det');
    expect(ridged2D(n, 2.5, -3.5)).toBe(ridged2D(n, 2.5, -3.5));
    expect(Number.isFinite(ridged2D(n, 0, 0))).toBe(true);
  });

  it('连续性：小步长差有界', () => {
    const n = makeNoise2D('ridged-smooth');
    const h = 1e-3;
    let maxDelta = 0;
    for (let i = 0; i < 5000; i++) {
      const x = i * 0.029 - 30;
      const y = i * 0.019 + 1;
      const d = Math.abs(
        ridged2D(n, x + h, y, { octaves: 4 }) - ridged2D(n, x, y, { octaves: 4 })
      );
      if (d > maxDelta) maxDelta = d;
    }
    expect(maxDelta).toBeLessThan(0.05);
  });

  it('1..8 倍频、不同 gain 下都不越界', () => {
    const n = makeNoise2D('ridged-oct');
    let min = Infinity;
    let max = -Infinity;
    for (let oct = 1; oct <= 8; oct++) {
      for (const gain of [0.3, 0.5, 0.7]) {
        for (let i = 0; i < 500; i++) {
          const v = ridged2D(n, i * 0.053 - 15, i * 0.031 + 7, { octaves: oct, gain });
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('脊线出现在原噪声过零处（ridged ≈ 1 时 |noise| ≈ 0）', () => {
    const n = makeNoise2D('ridged-zero');
    let checked = 0;
    let bad = 0;
    for (let i = 0; i < 20000; i++) {
      const x = i * 0.017 - 60;
      const y = i * 0.023 + 4;
      if (ridged2D(n, x, y, { octaves: 1 }) > 0.99) {
        checked++;
        if (Math.abs(n(x, y)) > 0.11) bad++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(bad).toBe(0);
  });
});

describe('worley2D', () => {
  it('确定性：同参数同结果', () => {
    let mismatch = 0;
    for (let i = 0; i < 1000; i++) {
      const x = i * 0.31 - 20;
      const y = i * 0.17 + 5;
      const a = worley2D(x, y, 'rock', 4);
      const b = worley2D(x, y, 'rock', 4);
      if (a.f1 !== b.f1 || a.f2 !== b.f2 || a.id !== b.id) mismatch++;
    }
    expect(mismatch).toBe(0);
  });

  it('恒有 0 <= f1 <= f2，且都是有限值（9 万次采样）', () => {
    let violations = 0;
    let nonFinite = 0;
    for (let i = 0; i < 300; i++) {
      for (let j = 0; j < 300; j++) {
        const { f1, f2 } = worley2D(i * 0.13 - 19, j * 0.17 + 3, 7, 1);
        if (!(f1 >= 0) || !(f1 <= f2)) violations++;
        if (!Number.isFinite(f1) || !Number.isFinite(f2)) nonFinite++;
      }
    }
    expect(violations).toBe(0);
    expect(nonFinite).toBe(0);
  });

  it('cellSize=1 时 f1 不超过理论上界 √2', () => {
    let maxF1 = 0;
    for (let i = 0; i < 400; i++) {
      for (let j = 0; j < 400; j++) {
        const { f1 } = worley2D(i * 0.077 - 12, j * 0.091 + 6, 'bound', 1);
        if (f1 > maxF1) maxF1 = f1;
      }
    }
    expect(maxF1).toBeLessThanOrEqual(Math.SQRT2);
    expect(maxF1).toBeGreaterThan(0.5);
  });

  it('cellSize 线性缩放距离，格子划分不变', () => {
    let idMismatch = 0;
    for (let i = 0; i < 300; i++) {
      const x = i * 0.37 - 15;
      const y = i * 0.23 + 2;
      const unit = worley2D(x, y, 'scale', 1);
      const scaled = worley2D(x * 8, y * 8, 'scale', 8);
      if (scaled.id !== unit.id) idMismatch++;
      expect(scaled.f1).toBeCloseTo(unit.f1 * 8, 8);
      expect(scaled.f2).toBeCloseTo(unit.f2 * 8, 8);
    }
    expect(idMismatch).toBe(0);
  });

  it('id 只在细胞边界处切换（f1 ≈ f2 时）', () => {
    let maxEdgeAtSwitch = 0;
    let switches = 0;
    for (let j = 0; j < 200; j++) {
      let prev = null;
      for (let i = 0; i < 400; i++) {
        const cur = worley2D(i * 0.01 - 2, j * 0.02 + 1, 'edge', 1);
        if (prev && prev.id !== cur.id) {
          switches++;
          const edge = Math.min(prev.f2 - prev.f1, cur.f2 - cur.f1);
          if (edge > maxEdgeAtSwitch) maxEdgeAtSwitch = edge;
        }
        prev = cur;
      }
    }
    expect(switches).toBeGreaterThan(100);
    // 采样步长 0.01 → 切换处两点都应贴着等距边界
    expect(maxEdgeAtSwitch).toBeLessThan(0.05);
  });

  it('id 覆盖大量不同格子（哈希无退化碰撞）', () => {
    const cellSize = 5;
    const ids = new Set();
    for (let i = 0; i < 40; i++) {
      for (let j = 0; j < 40; j++) {
        ids.add(worley2D(i * cellSize + 2.5, j * cellSize + 2.5, 'id', cellSize).id);
      }
    }
    expect(ids.size).toBeGreaterThan(1200);
  });

  it('不同种子给出不同的细胞图案', () => {
    let diff = 0;
    for (let i = 0; i < 2000; i++) {
      const x = i * 0.19 - 30;
      const y = i * 0.11 + 8;
      diff += Math.abs(worley2D(x, y, 'seedA', 2).f1 - worley2D(x, y, 'seedB', 2).f1);
    }
    expect(diff / 2000).toBeGreaterThan(0.1);
  });

  it('f2 − f1 可作裂纹掩码：存在贴近 0 的边界样本', () => {
    let minEdge = Infinity;
    for (let i = 0; i < 300; i++) {
      for (let j = 0; j < 300; j++) {
        const { f1, f2 } = worley2D(i * 0.021, j * 0.019, 'crack', 1);
        const e = f2 - f1;
        if (e < minEdge) minEdge = e;
      }
    }
    expect(minEdge).toBeLessThan(0.02);
    expect(minEdge).toBeGreaterThanOrEqual(0);
  });

  it('非法 cellSize 与非有限坐标安全兜底', () => {
    expect(() => worley2D(1, 1, 's', 0)).not.toThrow();
    expect(worley2D(1, 1, 's', 0).f1).toBe(worley2D(1, 1, 's', 1).f1);
    expect(worley2D(1, 1, 's', NaN).f1).toBe(worley2D(1, 1, 's', 1).f1);
    const bad = worley2D(NaN, 1, 's', 1);
    expect(bad.f1).toBe(0);
    expect(bad.f2).toBe(0);
    expect(bad.id).toBe(0);
  });
});
