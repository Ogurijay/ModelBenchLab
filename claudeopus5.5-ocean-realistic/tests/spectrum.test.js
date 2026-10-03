import { describe, it, expect } from 'vitest';
import {
  CASCADE_LAYOUT, buildSpectrumModel, generateH0, cascadeVariance, spreadNorm, cos2s,
  integrateOmega, windSeaPeak, beaufort, quantizedOmega, OMEGA_LOOP_PERIOD
} from '../src/ocean/spectrum.js';
import { ifft2D } from '../src/ocean/fft.js';

describe('方向分布', () => {
  for (const s of [1, 4, 12, 40]) {
    it(`cos^{2s} 归一化 s=${s}`, () => {
      let sum = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        const t = -Math.PI + ((i + 0.5) / n) * 2 * Math.PI;
        sum += cos2s(t, s) * ((2 * Math.PI) / n);
      }
      expect(sum).toBeCloseTo(1, 4);
    });
  }
  it('Γ 归一化系数随 s 单调增', () => {
    expect(spreadNorm(10)).toBeGreaterThan(spreadNorm(2));
  });
});

describe('JONSWAP', () => {
  it('风速越大峰周期越长、Hs 越大', () => {
    const a = buildSpectrumModel({ windSpeed: 6, swellHeight: 0 });
    const b = buildSpectrumModel({ windSpeed: 18, swellHeight: 0 });
    expect(b.peakPeriod).toBeGreaterThan(a.peakPeriod);
    expect(b.significantHeight).toBeGreaterThan(a.significantHeight * 3);
  });

  it('充分成长海况 Hs 接近经验值 0.21·U²/g', () => {
    const U = 12;
    const m = buildSpectrumModel({ windSpeed: U, fetch: 5000, swellHeight: 0 });
    const pm = (0.21 * U * U) / 9.81;
    expect(m.significantHeight / pm).toBeGreaterThan(0.8);
    expect(m.significantHeight / pm).toBeLessThan(1.25);
  });

  it('涌浪按给定 Hs 定标', () => {
    const m = buildSpectrumModel({ windSpeed: 0.5, swellHeight: 2, swellPeriod: 12 });
    expect(m.significantHeight).toBeGreaterThan(1.9);
    expect(m.significantHeight).toBeLessThan(2.15);
  });

  it('峰频不低于 PM 极限', () => {
    const { omegaP } = windSeaPeak(10, 100000);
    expect(omegaP).toBeCloseTo((0.855 * 9.81) / 10, 6);
  });

  it('积分器对解析函数准确', () => {
    expect(integrateOmega((w) => w, 1, 3)).toBeCloseTo(4, 3);
  });
});

describe('离散初始谱 h0', () => {
  const N = 64;
  const model = buildSpectrumModel({ windSpeed: 10, swellHeight: 0.8 });

  it('三级 cascade 波数区间首尾相接', () => {
    for (let i = 1; i < CASCADE_LAYOUT.length; i++) {
      expect(CASCADE_LAYOUT[i].kMin).toBe(CASCADE_LAYOUT[i - 1].kMax);
    }
  });

  it('h0 打包的 conj(h0(-k)) 与对称位置一致', () => {
    const h0 = generateH0(model, CASCADE_LAYOUT[1], N, 7);
    for (const [m, n] of [[1, 2], [5, 60], [33, 17]]) {
      const i = (m * N + n) * 4;
      const j = (((N - m) % N) * N + ((N - n) % N)) * 4;
      expect(h0[i + 2]).toBeCloseTo(h0[j], 6);
      expect(h0[i + 3]).toBeCloseTo(-h0[j + 1], 6);
    }
  });

  it('时域高度场为实数，且方差与谱一致（统计意义）', () => {
    // 多个种子平均，验证 E[η²] = Σ S·Δk²
    const cascade = CASCADE_LAYOUT[0];
    const expected = cascadeVariance(model, cascade, N);
    let acc = 0;
    const seeds = 24;
    for (let s = 0; s < seeds; s++) {
      const h0 = generateH0(model, cascade, N, 100 + s);
      const re = new Float64Array(N * N);
      const im = new Float64Array(N * N);
      for (let i = 0; i < N * N; i++) {
        re[i] = h0[i * 4] + h0[i * 4 + 2];
        im[i] = h0[i * 4 + 1] + h0[i * 4 + 3];
      }
      ifft2D(re, im, N);
      let v = 0;
      let maxIm = 0;
      for (let i = 0; i < N * N; i++) {
        v += re[i] * re[i];
        maxIm = Math.max(maxIm, Math.abs(im[i]));
      }
      expect(maxIm).toBeLessThan(1e-4);
      acc += v / (N * N);
    }
    const ratio = acc / seeds / expected;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  it('同一种子不同参数相位一致（参数切换可平滑插值）', () => {
    const a = generateH0(buildSpectrumModel({ windSpeed: 6 }), CASCADE_LAYOUT[1], N, 3);
    const b = generateH0(buildSpectrumModel({ windSpeed: 14 }), CASCADE_LAYOUT[1], N, 3);
    const i = (4 * N + 3) * 4;
    expect(Math.sign(a[i])).toBe(Math.sign(b[i]));
  });
});

describe('ω 量化', () => {
  it('所有频率是 2π/T 的整数倍', () => {
    const w0 = (2 * Math.PI) / OMEGA_LOOP_PERIOD;
    for (const k of [0.01, 0.3, 2.5, 30]) {
      const w = quantizedOmega(k);
      expect(Math.abs(w / w0 - Math.round(w / w0))).toBeLessThan(1e-3);
      expect(Math.abs(w - Math.sqrt(9.81 * k))).toBeLessThanOrEqual(w0 + 1e-6);
    }
  });
});

describe('蒲福风级', () => {
  it('分级', () => {
    expect(beaufort(0.2).force).toBe(0);
    expect(beaufort(9).force).toBe(5);
    expect(beaufort(40).force).toBe(12);
  });
});
