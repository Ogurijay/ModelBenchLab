import { describe, it, expect } from 'vitest';
import {
  MAX_WAVES,
  createWaveSet,
  sampleHeight,
  sampleHeightNormal,
  sumAmplitude,
  steepnessBudget,
  gridForQuality,
  seaStateLabel,
} from '../src/ocean/waves.js';

describe('createWaveSet 波谱生成 (Grok)', () => {
  it('返回正确数量的波，方向向量接近单位向量', () => {
    const waves = createWaveSet({ windSpeed: 10, waveCount: 8, seed: 42 });
    expect(waves).toHaveLength(8);
    for (const w of waves) {
      const len = Math.hypot(w.dirX, w.dirZ);
      expect(len).toBeCloseTo(1, 6);
      expect(w.amplitude).toBeGreaterThan(0);
      expect(w.wavelength).toBeGreaterThan(0);
      expect(w.k).toBeCloseTo((2 * Math.PI) / w.wavelength, 6);
      expect(w.omega).toBeGreaterThan(0);
    }
  });

  it('波数上限受 MAX_WAVES 保护', () => {
    const waves = createWaveSet({ windSpeed: 10, waveCount: 99, seed: 1 });
    expect(waves.length).toBeLessThanOrEqual(MAX_WAVES);
  });

  it('相同种子结果确定，不同种子结果不同（可复现性）', () => {
    const a = createWaveSet({ windSpeed: 12, seed: 7 });
    const b = createWaveSet({ windSpeed: 12, seed: 7 });
    const c = createWaveSet({ windSpeed: 12, seed: 8 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('风速增大时总波幅单调增加（同种子）', () => {
    const calm = sumAmplitude(createWaveSet({ windSpeed: 4, seed: 3 }));
    const storm = sumAmplitude(createWaveSet({ windSpeed: 20, seed: 3 }));
    expect(storm).toBeGreaterThan(calm);
  });

  it('平均传播方向贴近指定风向（容差 30°）', () => {
    const deg = 130;
    const waves = createWaveSet({ windSpeed: 10, windDirection: deg, seed: 5 });
    const mx = waves.reduce((s, w) => s + w.dirX, 0) / waves.length;
    const mz = waves.reduce((s, w) => s + w.dirZ, 0) / waves.length;
    const meanDeg = (Math.atan2(mz, mx) * 180) / Math.PI;
    const diff = Math.abs(((meanDeg - deg + 540) % 360) - 180);
    expect(diff).toBeLessThan(30);
  });

  it('陡度预算 Σ Q·k·A 永远 ≤ 1（防止波形打结）', () => {
    for (const ws of [5, 12, 25]) {
      const waves = createWaveSet({ windSpeed: ws, choppiness: 1, seed: 9 });
      expect(steepnessBudget(waves)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('amplitudeScale 正确线性缩放波幅', () => {
    const base = createWaveSet({ windSpeed: 10, seed: 11, amplitudeScale: 1 });
    const doubled = createWaveSet({ windSpeed: 10, seed: 11, amplitudeScale: 2 });
    expect(sumAmplitude(doubled)).toBeCloseTo(sumAmplitude(base) * 2, 6);
  });
});

describe('sampleHeight 高度采样', () => {
  it('零振幅时采样高度恒为 0', () => {
    const waves = createWaveSet({ windSpeed: 10, seed: 2, amplitudeScale: 0 });
    expect(sampleHeight(waves, 12.3, -4.5, 6.7)).toBe(0);
  });

  it('任意位置高度被总波幅严格约束', () => {
    const waves = createWaveSet({ windSpeed: 15, seed: 13 });
    const bound = sumAmplitude(waves) + 1e-9;
    for (let i = 0; i < 200; i += 1) {
      const h = sampleHeight(waves, i * 1.7 - 100, i * -0.9 + 40, i * 0.13);
      expect(Math.abs(h)).toBeLessThanOrEqual(bound);
    }
  });

  it('海面随时间演化（t1 != t2 时同点高度不同）', () => {
    const waves = createWaveSet({ windSpeed: 10, seed: 21 });
    const h0 = sampleHeight(waves, 5, 5, 0);
    const h1 = sampleHeight(waves, 5, 5, 2.5);
    expect(h0).not.toBeCloseTo(h1, 6);
  });
});

describe('gridForQuality 网格配置', () => {
  it('low < medium < high（segments 递增）', () => {
    const low = gridForQuality('low');
    const medium = gridForQuality('medium');
    const high = gridForQuality('high');
    expect(low.segments).toBeLessThan(medium.segments);
    expect(medium.segments).toBeLessThan(high.segments);
    [low, medium, high].forEach(g => {
      expect(g.size).toBeGreaterThan(0);
    });
  });

  it('非法 quality 回退到 medium', () => {
    expect(gridForQuality('ultra')).toEqual(gridForQuality('medium'));
  });
});

describe('seaStateLabel 海况中文描述', () => {
  it('风速增大时等级非递减', () => {
    let prev = -1;
    for (let v = 0; v <= 30; v += 1) {
      const { level } = seaStateLabel(v);
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });

  it('返回包含中文的描述', () => {
    expect(seaStateLabel(2).text).toMatch(/[一-龥]/);
    expect(seaStateLabel(27).text).toMatch(/[一-龥]/);
  });
});

describe('sampleHeightNormal 高度+法线采样', () => {
  it('平静时法线接近 (0,1,0)', () => {
    const waves = createWaveSet({ windSpeed: 2, amplitudeScale: 0.01, seed: 99 });
    const n = sampleHeightNormal(waves, 10, -3, 1.2);
    const len = Math.hypot(n.nx, n.ny, n.nz);
    expect(Math.abs(n.y)).toBeLessThan(0.1);
    expect(len).toBeGreaterThan(0.9);
    // 归一化后 y 分量应接近 1
    expect(n.ny / len).toBeGreaterThan(0.85);
  });

  it('有波浪时法线会倾斜，且采样高度与单独 sampleHeight 一致', () => {
    const waves = createWaveSet({ windSpeed: 14, seed: 77 });
    const t = 3.2;
    const h1 = sampleHeight(waves, 5, 8, t);
    const s = sampleHeightNormal(waves, 5, 8, t);
    expect(s.y).toBeCloseTo(h1, 6);

    const len = Math.hypot(s.nx, s.ny, s.nz);
    expect(len).toBeGreaterThan(0.5); // 应该有明显法线扰动
  });
});
