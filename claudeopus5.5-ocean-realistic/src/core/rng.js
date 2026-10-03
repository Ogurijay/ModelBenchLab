// 确定性随机数：同一种子永远生成同一片海，便于复现与对比。

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller，一次产出两个独立标准正态数
export function gaussianPair(rand) {
  let u = rand();
  if (u < 1e-12) u = 1e-12;
  const v = rand();
  const r = Math.sqrt(-2 * Math.log(u));
  const a = 2 * Math.PI * v;
  return [r * Math.cos(a), r * Math.sin(a)];
}
