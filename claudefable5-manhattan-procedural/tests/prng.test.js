import { describe, it, expect } from 'vitest';
import { Rng, mulberry32, hashString } from '../src/core/prng.js';

describe('确定性伪随机', () => {
  it('同种子产出完全相同的序列', () => {
    const a = mulberry32(1337), b = mulberry32(1337);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('不同种子序列不同', () => {
    const a = mulberry32(1337), b = mulberry32(42);
    const sa = Array.from({ length: 8 }, a);
    const sb = Array.from({ length: 8 }, b);
    expect(sa).not.toEqual(sb);
  });

  it('fork 派生子流确定且互不干扰', () => {
    const r1 = new Rng(2026), r2 = new Rng(2026);
    const f1 = r1.fork('trees'), g1 = r1.fork('rocks');
    const f2 = r2.fork('trees');
    // 中途消费 r2 的其他流,不影响 trees 流
    r2.fork('rocks').next();
    for (let i = 0; i < 20; i++) expect(f1.next()).toBe(f2.next());
    expect(f1.seed).not.toBe(g1.seed);
  });

  it('hashString 稳定', () => {
    expect(hashString('manhattan')).toBe(hashString('manhattan'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});
