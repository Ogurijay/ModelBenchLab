import { describe, it, expect } from 'vitest';
import {
  MAX_WAVES,
  createWaveSet,
  sampleHeight,
  sumAmplitude,
  steepnessBudget,
  gridForQuality,
  seaStateLabel,
} from '../src/ocean/waves.js';

describe('createWaveSet 波谱生成', () => {
  it('返回请求数量的波，且方向为单位向量', () => {
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

  it('波数不会超过 MAX_WAVES（shader uniform 数组上限）', () => {
    const waves = createWaveSet({ windSpeed: 10, waveCount: 99, seed: 1 });
    expect(waves.length).toBeLessThanOrEqual(MAX_WAVES);
  });

  it('同一种子结果确定，不同种子结果不同', () => {
    const a = createWaveSet({ windSpeed: 12, seed: 7 });
    const b = createWaveSet({ windSpeed: 12, seed: 7 });
    const c = createWaveSet({ windSpeed: 12, seed: 8 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('风速越大，总波幅越大（同一种子）', () => {
    const calm = sumAmplitude(createWaveSet({ windSpeed: 4, seed: 3 }));
    const storm = sumAmplitude(createWaveSet({ windSpeed: 20, seed: 3 }));
    expect(storm).toBeGreaterThan(calm);
  });

  it('平均传播方向贴近风向', () => {
    const deg = 130;
    const waves = createWaveSet({ windSpeed: 10, windDirection: deg, seed: 5 });
    const mx = waves.reduce((s, w) => s + w.dirX, 0) / waves.length;
    const mz = waves.reduce((s, w) => s + w.dirZ, 0) / waves.length;
    const meanDeg = (Math.atan2(mz, mx) * 180) / Math.PI;
    const diff = Math.abs(((meanDeg - deg + 540) % 360) - 180);
    expect(diff).toBeLessThan(30);
  });

  it('陡度预算 Σ Q·k·A 不超过 1，避免波形自交打结', () => {
    for (const windSpeed of [5, 12, 25]) {
      const waves = createWaveSet({ windSpeed, choppiness: 1, seed: 9 });
      expect(steepnessBudget(waves)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('amplitudeScale 线性缩放波幅', () => {
    const base = createWaveSet({ windSpeed: 10, seed: 11, amplitudeScale: 1 });
    const doubled = createWaveSet({ windSpeed: 10, seed: 11, amplitudeScale: 2 });
    expect(sumAmplitude(doubled)).toBeCloseTo(sumAmplitude(base) * 2, 6);
  });
});

describe('sampleHeight 高度采样', () => {
  it('零波幅时高度为 0', () => {
    const waves = createWaveSet({ windSpeed: 10, seed: 2, amplitudeScale: 0 });
    expect(sampleHeight(waves, 12.3, -4.5, 6.7)).toBe(0);
  });

  it('任意采样点的高度被总波幅约束', () => {
    const waves = createWaveSet({ windSpeed: 15, seed: 13 });
    const bound = sumAmplitude(waves) + 1e-9;
    for (let i = 0; i < 200; i += 1) {
      const h = sampleHeight(waves, i * 1.7 - 100, i * -0.9 + 40, i * 0.13);
      expect(Math.abs(h)).toBeLessThanOrEqual(bound);
    }
  });

  it('海面随时间运动（两个时刻高度不同）', () => {
    const waves = createWaveSet({ windSpeed: 10, seed: 21 });
    const h0 = sampleHeight(waves, 5, 5, 0);
    const h1 = sampleHeight(waves, 5, 5, 2.5);
    expect(h0).not.toBeCloseTo(h1, 6);
  });
});

describe('gridForQuality 网格配置', () => {
  it('提供 low/medium/high 三档，分段数递增', () => {
    const low = gridForQuality('low');
    const medium = gridForQuality('medium');
    const high = gridForQuality('high');
    expect(low.segments).toBeLessThan(medium.segments);
    expect(medium.segments).toBeLessThan(high.segments);
    for (const g of [low, medium, high]) {
      expect(g.size).toBeGreaterThan(0);
    }
  });

  it('未知档位回退到 medium', () => {
    expect(gridForQuality('???')).toEqual(gridForQuality('medium'));
  });
});

describe('seaStateLabel 海况描述', () => {
  it('风速越大，海况等级单调不减', () => {
    let prev = -1;
    for (let v = 0; v <= 30; v += 1) {
      const { level } = seaStateLabel(v);
      expect(level).toBeGreaterThanOrEqual(prev);
      prev = level;
    }
  });

  it('返回中文描述文本', () => {
    expect(seaStateLabel(2).text).toMatch(/[一-龥]/);
    expect(seaStateLabel(28).text).toMatch(/[一-龥]/);
  });
});
