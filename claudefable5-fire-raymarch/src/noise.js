// CPU 侧程序化噪声:确定性 PRNG(定种可复现)+ 一维/三维 value noise。
// 用途:火光闪烁、火星湍流、几何顶点扰动。与 GPU 噪声无需逐值一致,只需统计特征相符。

/** mulberry32:定种伪随机序列,项目内所有随机几何/粒子共用,保证多次加载画面一致。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash1(n) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

/** 一维 value noise,输出 0–1。 */
export function noise1(x) {
  const i = Math.floor(x);
  const f = smooth(x - i);
  return hash1(i) * (1 - f) + hash1(i + 1) * f;
}

/** 一维 FBM(2 倍频):火光呼吸曲线用。输出约 0–1。 */
export function fbm1(x) {
  return noise1(x) * 0.65 + noise1(x * 2.13 + 7.7) * 0.35;
}

function hash3(x, y, z) {
  return hash1(x * 73856093 ^ y * 19349663 ^ z * 83492791);
}

/** 三维 value noise,输出 0–1:火星湍流采样用。 */
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c00 = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx);
  const c10 = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx);
  const c01 = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx);
  const c11 = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx);
  return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz);
}
