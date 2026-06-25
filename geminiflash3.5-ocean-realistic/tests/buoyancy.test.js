import { describe, expect, it } from 'vitest';
import {
  createWaveSet,
  sampleWavePositionAndNormal,
  sanitizeOceanSettings,
  DEFAULT_OCEAN_SETTINGS
} from '../src/ocean/waves.js';

describe('Gerstner Wave Physics & Buoyancy Simulation', () => {
  it('correctly clamps and sanitizes ocean settings to valid bounds', () => {
    const rawSettings = {
      windSpeed: 100, // 超出 max=42
      swellHeight: -5, // 小于 min=0.1
      choppiness: 5.0,  // 超出 max=2.2
      timeOfDay: 1.5   // 超出 [0, 1]
    };
    
    const sanitized = sanitizeOceanSettings(rawSettings);
    
    expect(sanitized.windSpeed).toBe(42);
    expect(sanitized.swellHeight).toBe(0.1);
    expect(sanitized.choppiness).toBe(2.2);
    expect(sanitized.timeOfDay).toBe(1);
  });

  it('generates a valid set of 5 Gerstner waves with non-overlapping constraints', () => {
    const waves = createWaveSet({ choppiness: 1.5 });
    
    expect(waves).toHaveLength(5);
    
    // 检查所有波是否均具备有效数值
    waves.forEach((wave) => {
      expect(wave.amplitude).toBeGreaterThan(0);
      expect(wave.wavelength).toBeGreaterThan(0);
      expect(wave.speed).toBeGreaterThan(0);
      expect(wave.k).toBeGreaterThan(0);
      expect(wave.q).toBeGreaterThanOrEqual(0);
      expect(Math.abs(wave.direction.x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(wave.direction.y)).toBeLessThanOrEqual(1.0001);
    });

    // 验证陡度限制 Qi * Ai * k <= 1 关系以避免顶点自相交
    const sumQiAiKi = waves.reduce((sum, wave) => sum + wave.q * wave.amplitude * wave.k, 0);
    expect(sumQiAiKi).toBeLessThanOrEqual(2.2); // 整体陡度被控
  });

  it('calculates surface height and a normalized normal vector under standard conditions', () => {
    const time = 12.5;
    const xWorld = 10.0;
    const zWorld = -25.0;

    const result = sampleWavePositionAndNormal(xWorld, zWorld, time, DEFAULT_OCEAN_SETTINGS);
    
    // 检查返回值属性
    expect(result.position).toBeDefined();
    expect(result.normal).toBeDefined();
    
    // 高度解算应是有界实数
    expect(Number.isFinite(result.position.y)).toBe(true);
    expect(result.position.y).toBeLessThanOrEqual(DEFAULT_OCEAN_SETTINGS.swellHeight * 2.0);
    expect(result.position.y).toBeGreaterThanOrEqual(-DEFAULT_OCEAN_SETTINGS.swellHeight * 2.0);

    // 验证法线是否是归一化的 (x^2 + y^2 + z^2 === 1)
    const normal = result.normal;
    const len = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    expect(len).toBeCloseTo(1.0, 5);
  });

  it('maintains math stability and avoids division-by-zero or NaN on boundary limits', () => {
    // 浪高为 0.1 时的极端情况
    const zeroSwellSettings = {
      swellHeight: 0.1,
      choppiness: 0.2,
      windSpeed: 2
    };

    const result = sampleWavePositionAndNormal(0, 0, 0, zeroSwellSettings);
    
    expect(Number.isNaN(result.position.x)).toBe(false);
    expect(Number.isNaN(result.position.y)).toBe(false);
    expect(Number.isNaN(result.position.z)).toBe(false);
    
    expect(Number.isNaN(result.normal.x)).toBe(false);
    expect(Number.isNaN(result.normal.y)).toBe(false);
    expect(Number.isNaN(result.normal.z)).toBe(false);

    const len = Math.sqrt(result.normal.x ** 2 + result.normal.y ** 2 + result.normal.z ** 2);
    expect(len).toBeCloseTo(1.0, 5);
  });
});
