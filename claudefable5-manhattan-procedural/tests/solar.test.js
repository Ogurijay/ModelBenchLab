import { describe, it, expect } from 'vitest';
import { sunDirection } from '../src/core/solar.js';

describe('太阳方位(纬度 40.74°N)', () => {
  it('正午高度角为全天最高且为正', () => {
    const noon = sunDirection(12);
    expect(noon.y).toBeGreaterThan(0.5);
    expect(noon.y).toBeGreaterThan(sunDirection(9).y);
    expect(noon.y).toBeGreaterThan(sunDirection(15).y);
  });

  it('午夜在地平线以下', () => {
    expect(sunDirection(0).y).toBeLessThan(0);
  });

  it('早晨太阳在东侧(+x),傍晚在西侧(-x)', () => {
    expect(sunDirection(8).x).toBeGreaterThan(0);
    expect(sunDirection(17).x).toBeLessThan(0);
  });

  it('正午太阳偏南(+z)', () => {
    expect(sunDirection(12).z).toBeGreaterThan(0);
    expect(Math.abs(sunDirection(12).x)).toBeLessThan(0.02);
  });

  it('高度角公式对称:上午/下午等距时刻高度相同', () => {
    expect(sunDirection(10).y).toBeCloseTo(sunDirection(14).y, 10);
  });
});
