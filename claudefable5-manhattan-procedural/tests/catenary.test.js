import { describe, it, expect } from 'vitest';
import { solveCatenaryA, catenaryDrop } from '../src/core/catenary.js';

describe('悬链线求解(大桥主缆)', () => {
  it('解满足 a·(cosh(L/a) − 1) = sag', () => {
    const L = 110, sag = 58;
    const a = solveCatenaryA(L, sag);
    expect(a * (Math.cosh(L / a) - 1)).toBeCloseTo(sag, 6);
  });

  it('塔顶下垂为 0,跨中下垂等于垂度', () => {
    const L = 110, sag = 58;
    expect(catenaryDrop(0, L, sag)).toBeCloseTo(0, 6);
    expect(catenaryDrop(1, L, sag)).toBeCloseTo(0, 6);
    expect(catenaryDrop(0.5, L, sag)).toBeCloseTo(sag, 6);
  });

  it('单调:从塔顶到跨中下垂递增', () => {
    const L = 110, sag = 58;
    let prev = -1;
    for (let t = 0; t <= 0.5; t += 0.05) {
      const d = catenaryDrop(t, L, sag);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('浅垂度接近抛物线近似', () => {
    const L = 100, sag = 5;
    const a = solveCatenaryA(L, sag);
    expect(a).toBeCloseTo((L * L) / (2 * sag), -2); // 数量级一致
  });
});
