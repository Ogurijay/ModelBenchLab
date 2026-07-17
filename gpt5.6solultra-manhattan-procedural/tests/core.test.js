import { describe, expect, it } from 'vitest';
import { PROJECT } from '../src/config.js';
import {
  catenaryBetweenTowers,
  catenaryY,
  skylineHeight,
  skylinePeaks,
  solarPosition,
  solveCatenaryA,
} from '../src/core/math.js';
import { fbm2D, valueNoise2D, valueNoise3D } from '../src/core/noise.js';
import { createRandom, hashString } from '../src/core/random.js';

describe('确定性哈希与随机子流', () => {
  it('同输入的哈希与随机序列逐项相同', () => {
    expect(hashString('曼哈顿')).toBe(hashString('曼哈顿'));
    const a = createRandom(2026);
    const b = createRandom(2026);
    expect(Array.from({ length: 128 }, () => a.next()))
      .toEqual(Array.from({ length: 128 }, () => b.next()));
  });

  it('fork（命名子流）不受父流消费顺序影响', () => {
    const first = createRandom(42);
    const second = createRandom(42);
    first.next();
    first.next();
    second.fork('unrelated').next();
    const a = first.fork('buildings');
    const b = second.fork('buildings');
    expect(Array.from({ length: 32 }, () => a.next()))
      .toEqual(Array.from({ length: 32 }, () => b.next()));
    expect(a.seed).not.toBe(first.fork('trees').seed);
  });
});

describe('程序化噪声', () => {
  it('2D/3D value noise 可复现且保持在 [-1, 1]', () => {
    for (let index = 0; index < 80; index += 1) {
      const x = index * 0.137;
      const y = index * -0.091;
      const a = valueNoise2D(x, y, 1337);
      const b = valueNoise3D(x, y, index * 0.03, 1337);
      expect(a).toBe(valueNoise2D(x, y, 1337));
      expect(a).toBeGreaterThanOrEqual(-1);
      expect(a).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(-1);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('fBm（分形布朗运动噪声）同种子稳定、异种子变化', () => {
    const a = fbm2D(3.2, -7.1, { seed: 2026, octaves: 6 });
    expect(a).toBe(fbm2D(3.2, -7.1, { seed: 2026, octaves: 6 }));
    expect(a).not.toBe(fbm2D(3.2, -7.1, { seed: 42, octaves: 6 }));
  });
});

describe('真实公式', () => {
  it('纽约春分正午太阳高度约为 90° - 纬度，方位在正南', () => {
    const noon = solarPosition(12, { dayOfYear: 80, latitudeDeg: PROJECT.latitude });
    expect(noon.altitudeDeg).toBeCloseTo(90 - PROJECT.latitude, 0);
    expect(noon.azimuthDeg).toBeCloseTo(180, 5);
    expect(noon.direction.y).toBeGreaterThan(0);
  });

  it('上午太阳在东侧、下午在西侧，午夜位于地平线下', () => {
    const morning = solarPosition(8, { dayOfYear: 172 });
    const afternoon = solarPosition(16, { dayOfYear: 172 });
    const midnight = solarPosition(0, { dayOfYear: 172 });
    expect(morning.azimuthDeg).toBeGreaterThan(0);
    expect(morning.azimuthDeg).toBeLessThan(180);
    expect(afternoon.azimuthDeg).toBeGreaterThan(180);
    expect(afternoon.azimuthDeg).toBeLessThan(360);
    expect(midnight.altitudeDeg).toBeLessThan(0);
  });

  it('悬链线参数精确满足跨中垂度与两端塔高', () => {
    const span = 180;
    const sag = 36;
    const towerY = 72;
    const a = solveCatenaryA(span, sag);
    expect(catenaryY(span / 2, a)).toBeCloseTo(sag, 8);
    expect(catenaryBetweenTowers(0, span, sag, towerY)).toBeCloseTo(towerY - sag, 8);
    expect(catenaryBetweenTowers(-span / 2, span, sag, towerY)).toBeCloseTo(towerY, 8);
    expect(catenaryBetweenTowers(span / 2, span, sag, towerY)).toBeCloseTo(towerY, 8);
  });

  it('双峰天际线在下城与中城均高于两峰之间的谷地', () => {
    const { downtownZ, valleyZ, midtownZ } = skylinePeaks();
    const downtown = skylineHeight(0, downtownZ);
    const valley = skylineHeight(0, valleyZ);
    const midtown = skylineHeight(0, midtownZ);
    expect(downtown).toBeGreaterThan(valley * 1.5);
    expect(midtown).toBeGreaterThan(valley * 1.9);
    expect(midtown).toBeGreaterThan(downtown);
  });
});
