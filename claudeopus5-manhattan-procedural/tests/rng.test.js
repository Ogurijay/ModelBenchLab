/**
 * @file tests/rng.test.js
 * @description `src/core/rng.js` 的单元测试（契约 §3.1 / §10）。
 * 覆盖：同种子序列一致、不同种子不同、fork 独立性与可重现性、
 * range/int 边界与分布、bool(p) 频率、shuffle 排列性与确定性、gauss 均值方差、hash2D 无状态性。
 * 所有统计断言都用固定种子，结果确定，不存在偶发失败。
 */

import { describe, it, expect } from 'vitest';
import { hashString, mulberry32, makeRng, hash2D } from '../src/core/rng.js';

/**
 * 抽取 n 个随机数组成数组。
 * @param {{next: () => number}} rng RNG
 * @param {number} n 个数
 * @returns {number[]} 序列
 */
function take(rng, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next();
  return out;
}

/**
 * 皮尔逊相关系数，用于验证两条子流互不相关。
 * @param {number[]} a 序列 A
 * @param {number[]} b 序列 B
 * @returns {number} [-1,1]
 */
function pearson(a, b) {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db || 1);
}

describe('hashString（FNV-1a 32 位）', () => {
  it('与标准 FNV-1a 参考值一致', () => {
    expect(hashString('')).toBe(2166136261); // offset basis
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('hello')).toBe(0x4f9f2cab);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });

  it('确定性且返回 uint32', () => {
    for (const s of ['manhattan', 'buildings', '帝国大厦', '', 'a'.repeat(500)]) {
      const h = hashString(s);
      expect(h).toBe(hashString(s));
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });

  it('数字输入稳定散列，且与其十进制文本一致', () => {
    expect(hashString(123)).toBe(hashString('123'));
    expect(hashString(-0)).toBe(hashString(0));
    expect(hashString(3.5)).toBe(hashString('3.5'));
    expect(hashString(2026)).toBe(hashString(2026));
  });

  it('不同输入基本不碰撞（1 万个键零碰撞）', () => {
    const set = new Set();
    for (let i = 0; i < 10000; i++) set.add(hashString(`lot-${i}`));
    expect(set.size).toBe(10000);
  });
});

describe('mulberry32', () => {
  it('同种子序列完全一致，不同种子不同', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const c = mulberry32(12346);
    const sa = Array.from({ length: 50 }, () => a());
    const sb = Array.from({ length: 50 }, () => b());
    const sc = Array.from({ length: 50 }, () => c());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('输出恒在 [0,1)', () => {
    const f = mulberry32(7);
    for (let i = 0; i < 20000; i++) {
      const v = f();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('均值接近 0.5（10 万样本）', () => {
    const f = mulberry32(99);
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) sum += f();
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });
});

describe('makeRng 基本行为', () => {
  it('seed 为 uint32，同参数生成同序列', () => {
    const a = makeRng('manhattan');
    const b = makeRng('manhattan');
    expect(a.seed).toBe(b.seed);
    expect(Number.isInteger(a.seed)).toBe(true);
    expect(a.seed).toBeGreaterThanOrEqual(0);
    expect(a.seed).toBeLessThan(2 ** 32);
    expect(take(a, 200)).toEqual(take(b, 200));
  });

  it('不同种子 / 不同流名给出不同序列', () => {
    const s1 = take(makeRng(1), 100);
    const s2 = take(makeRng(2), 100);
    const s3 = take(makeRng(1, 'other'), 100);
    expect(s1).not.toEqual(s2);
    expect(s1).not.toEqual(s3);
  });

  it('数字种子与字符串种子都可用且稳定', () => {
    expect(take(makeRng(2026), 20)).toEqual(take(makeRng(2026), 20));
    expect(take(makeRng('2026'), 20)).toEqual(take(makeRng('2026'), 20));
  });

  it('next 输出恒在 [0,1)', () => {
    const r = makeRng('range-check');
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('fork 独立性与可重现性', () => {
  it('同名同种子必得同一子流', () => {
    const a = makeRng('city').fork('buildings');
    const b = makeRng('city').fork('buildings');
    expect(a.seed).toBe(b.seed);
    expect(take(a, 100)).toEqual(take(b, 100));
  });

  it('同一父流多次 fork 同名，结果一致', () => {
    const parent = makeRng('city');
    const a = parent.fork('roads');
    const b = parent.fork('roads');
    expect(take(a, 50)).toEqual(take(b, 50));
  });

  it('子流抽数不影响父流后续序列', () => {
    const base = makeRng('city');
    const expected = take(base, 100);

    const p = makeRng('city');
    const first = take(p, 10);
    const child = p.fork('traffic');
    take(child, 5000); // 子流大量抽数
    const rest = take(p, 90);
    expect(first.concat(rest)).toEqual(expected);
  });

  it('父流抽数不影响已派生子流（fork 不消耗父状态）', () => {
    const p1 = makeRng('city');
    const c1 = p1.fork('clouds');
    const seq1 = take(c1, 50);

    const p2 = makeRng('city');
    take(p2, 777); // 先把父流推进一大截
    const c2 = p2.fork('clouds');
    expect(take(c2, 50)).toEqual(seq1);
  });

  it('不同名子流互不相关', () => {
    const p = makeRng('city');
    const a = take(p.fork('a'), 4000);
    const b = take(p.fork('b'), 4000);
    const c = take(p.fork('buildings'), 4000);
    expect(a).not.toEqual(b);
    expect(Math.abs(pearson(a, b))).toBeLessThan(0.06);
    expect(Math.abs(pearson(a, c))).toBeLessThan(0.06);
    expect(Math.abs(pearson(b, c))).toBeLessThan(0.06);
  });

  it('多级 fork 可复现且路径敏感', () => {
    const x = makeRng('s').fork('a').fork('b');
    const y = makeRng('s').fork('a').fork('b');
    const z = makeRng('s').fork('b').fork('a');
    expect(take(x, 30)).toEqual(take(y, 30));
    expect(x.seed).not.toBe(z.seed);
  });
});

describe('range / int 边界与分布', () => {
  it('range 结果落在 [min,max) 内', () => {
    const r = makeRng('range');
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 50000; i++) {
      const v = r.range(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // 大样本应基本铺满区间
    expect(min).toBeLessThan(-2.9);
    expect(max).toBeGreaterThan(6.9);
  });

  it('range 支持逆序参数与零宽区间', () => {
    const r = makeRng('range2');
    for (let i = 0; i < 1000; i++) {
      const v = r.range(9, 4);
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThan(9);
    }
    expect(r.range(5, 5)).toBe(5);
  });

  it('range 均值接近区间中点', () => {
    const r = makeRng('range3');
    let sum = 0;
    const n = 60000;
    for (let i = 0; i < n; i++) sum += r.range(10, 30);
    expect(Math.abs(sum / n - 20)).toBeLessThan(0.25);
  });

  it('int 为闭区间且覆盖全部取值', () => {
    const r = makeRng('int');
    const counts = new Map();
    const n = 60000;
    for (let i = 0; i < n; i++) {
      const v = r.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    expect(counts.size).toBe(6);
    // 均匀性：每个面频率与 1/6 相差 < 1.5%
    for (const [, c] of counts) {
      expect(Math.abs(c / n - 1 / 6)).toBeLessThan(0.015);
    }
  });

  it('int 处理单点区间与逆序参数', () => {
    const r = makeRng('int2');
    for (let i = 0; i < 100; i++) {
      expect(r.int(5, 5)).toBe(5);
      const v = r.int(9, 3);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('int 处理负数区间', () => {
    const r = makeRng('int3');
    const seen = new Set();
    for (let i = 0; i < 5000; i++) {
      const v = r.int(-4, -1);
      expect(v).toBeGreaterThanOrEqual(-4);
      expect(v).toBeLessThanOrEqual(-1);
      seen.add(v);
    }
    expect(seen.size).toBe(4);
  });
});

describe('bool / pick / weighted', () => {
  it('bool(p) 频率近似 p', () => {
    for (const p of [0.15, 0.5, 0.85]) {
      const r = makeRng(`bool-${p}`);
      let hits = 0;
      const n = 40000;
      for (let i = 0; i < n; i++) if (r.bool(p)) hits++;
      expect(Math.abs(hits / n - p)).toBeLessThan(0.015);
    }
  });

  it('bool 默认 0.5，且 p<=0 / p>=1 为确定值', () => {
    const r = makeRng('bool-edge');
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (r.bool()) hits++;
    expect(Math.abs(hits / 20000 - 0.5)).toBeLessThan(0.02);
    for (let i = 0; i < 500; i++) {
      expect(r.bool(0)).toBe(false);
      expect(r.bool(1)).toBe(true);
    }
  });

  it('pick 只返回数组内元素，空数组返回 undefined', () => {
    const r = makeRng('pick');
    const arr = ['a', 'b', 'c', 'd'];
    const seen = new Set();
    for (let i = 0; i < 4000; i++) {
      const v = r.pick(arr);
      expect(arr).toContain(v);
      seen.add(v);
    }
    expect(seen.size).toBe(4);
    expect(r.pick([])).toBeUndefined();
    expect(r.pick(undefined)).toBeUndefined();
  });

  it('weighted 按权重比例选取', () => {
    const r = makeRng('weighted');
    const items = [
      { name: 'x', weight: 1 },
      { name: 'y', weight: 3 },
      { name: 'z', weight: 6 }
    ];
    const counts = { x: 0, y: 0, z: 0 };
    const n = 60000;
    for (let i = 0; i < n; i++) counts[r.weighted(items, (it) => it.weight).name]++;
    expect(Math.abs(counts.x / n - 0.1)).toBeLessThan(0.012);
    expect(Math.abs(counts.y / n - 0.3)).toBeLessThan(0.015);
    expect(Math.abs(counts.z / n - 0.6)).toBeLessThan(0.015);
  });

  it('weighted 默认权重函数读 item.weight；零权重元素不会被选中', () => {
    const r = makeRng('weighted2');
    const items = [{ weight: 0, id: 'never' }, { weight: 5, id: 'always' }];
    for (let i = 0; i < 2000; i++) expect(r.weighted(items).id).toBe('always');
    expect(r.weighted([])).toBeUndefined();
  });

  it('weighted 总权重为 0 时退化为均匀选取且不报错', () => {
    const r = makeRng('weighted3');
    const items = ['p', 'q'];
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(r.weighted(items, () => 0));
    expect(seen.size).toBe(2);
  });
});

describe('gauss（Box–Muller）', () => {
  it('大样本均值方差近似给定值', () => {
    const r = makeRng('gauss');
    const n = 200000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = r.gauss(5, 2);
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(mean - 5)).toBeLessThan(0.03);
    expect(Math.abs(Math.sqrt(variance) - 2)).toBeLessThan(0.03);
  });

  it('默认参数为标准正态，且约 68% 落在 ±1σ 内', () => {
    const r = makeRng('gauss2');
    const n = 100000;
    let within = 0;
    for (let i = 0; i < n; i++) if (Math.abs(r.gauss()) <= 1) within++;
    expect(Math.abs(within / n - 0.6827)).toBeLessThan(0.01);
  });

  it('结果有限且可复现', () => {
    const a = makeRng('gauss3');
    const b = makeRng('gauss3');
    for (let i = 0; i < 1000; i++) {
      const v = a.gauss(0, 3);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(b.gauss(0, 3));
    }
  });
});

describe('shuffle', () => {
  it('是原地排列：返回同一引用且元素集合不变', () => {
    const r = makeRng('shuffle');
    const arr = Array.from({ length: 60 }, (_, i) => i);
    const ret = r.shuffle(arr);
    expect(ret).toBe(arr);
    expect([...arr].sort((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, i) => i));
  });

  it('同种子洗牌结果确定，不同种子结果不同', () => {
    const a = makeRng('sh').shuffle(Array.from({ length: 40 }, (_, i) => i));
    const b = makeRng('sh').shuffle(Array.from({ length: 40 }, (_, i) => i));
    const c = makeRng('sh2').shuffle(Array.from({ length: 40 }, (_, i) => i));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('确实打乱顺序（40 元素错位数 > 30）', () => {
    const arr = Array.from({ length: 40 }, (_, i) => i);
    makeRng('sh3').shuffle(arr);
    let moved = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] !== i) moved++;
    expect(moved).toBeGreaterThan(30);
  });

  it('空数组 / 单元素 / 非数组安全返回', () => {
    const r = makeRng('sh4');
    expect(r.shuffle([])).toEqual([]);
    expect(r.shuffle([9])).toEqual([9]);
    expect(r.shuffle(null)).toBeNull();
  });

  it('3 元素全排列覆盖且分布均匀', () => {
    const r = makeRng('sh5');
    const counts = new Map();
    const n = 60000;
    for (let i = 0; i < n; i++) {
      const key = r.shuffle([0, 1, 2]).join('');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const [, c] of counts) {
      expect(Math.abs(c / n - 1 / 6)).toBeLessThan(0.015);
    }
  });
});

describe('hash2D（无状态空间散列）', () => {
  it('确定性且与调用顺序无关', () => {
    const forward = [];
    for (let i = 0; i < 200; i++) forward.push(hash2D(i, i * 2, 77));
    const backward = [];
    for (let i = 199; i >= 0; i--) backward.unshift(hash2D(i, i * 2, 77));
    expect(forward).toEqual(backward);
  });

  it('取值恒在 [0,1)，且大样本均值接近 0.5', () => {
    let sum = 0;
    let n = 0;
    for (let x = -60; x < 60; x++) {
      for (let y = -60; y < 60; y++) {
        const v = hash2D(x, y, 'city');
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
        sum += v;
        n++;
      }
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  it('相邻格子、交换坐标、不同种子都给出不同值', () => {
    expect(hash2D(3, 4, 1)).not.toBe(hash2D(4, 3, 1));
    expect(hash2D(3, 4, 1)).not.toBe(hash2D(3, 5, 1));
    expect(hash2D(3, 4, 1)).not.toBe(hash2D(3, 4, 2));
  });

  it('支持浮点与大坐标（无混叠）', () => {
    expect(hash2D(0.5, -0.25, 5)).toBe(hash2D(0.5, -0.25, 5));
    expect(hash2D(1200.5, -2399.75, 5)).not.toBe(hash2D(1200.5, -2399.5, 5));
    expect(hash2D(0, 0, 5)).toBe(hash2D(-0, -0, 5)); // -0 与 0 归一
    expect(hash2D(1e-7, 0, 5)).not.toBe(hash2D(0, 0, 5));
  });

  it('无碰撞聚集：1 万格散列去重率 > 99%', () => {
    const set = new Set();
    for (let x = 0; x < 100; x++) {
      for (let y = 0; y < 100; y++) set.add(hash2D(x, y, 'grid'));
    }
    expect(set.size).toBeGreaterThan(9900);
  });

  it('默认种子可省略', () => {
    expect(hash2D(2, 3)).toBe(hash2D(2, 3, 0));
  });
});
