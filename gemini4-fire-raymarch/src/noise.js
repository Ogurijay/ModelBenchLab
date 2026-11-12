// 确定性伪随机数、三维连续噪声、分形布朗运动(FBM)与旋度场工具。
// 供程序化几何雕刻、纹理生成、CPU 火光呼吸曲线与火星/烟羽湍流共享。

/** 定种 32 位 PRNG (Mulberry32)，确保每次加载布景与粒子序列完全可复现 */
export function mulberry32(seed = 20261110) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(ix, iy, iz) {
  let n = Math.imul(ix, 1597334677) ^ Math.imul(iy, 3812015801) ^ Math.imul(iz, 2798796415);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** 三维三线性平滑 Value Noise，返回值范围 [0, 1] */
export function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;

  // Quintic Hermite 曲线消除二阶导数不连续
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = n000 + (n100 - n000) * ux;
  const nx10 = n010 + (n110 - n010) * ux;
  const nx01 = n001 + (n101 - n001) * ux;
  const nx11 = n011 + (n111 - n011) * ux;

  const nxy0 = nx00 + (nx10 - nx00) * uy;
  const nxy1 = nx01 + (nx11 - nx01) * uy;

  return nxy0 + (nxy1 - nxy0) * uz;
}

/** 三维 4 阶分形噪声 (FBM)，返回值约 [0, 1] */
export function fbm3(x, y, z, octaves = 4) {
  let value = 0;
  let amp = 0.52;
  let freq = 1.0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * noise3(x * freq, y * freq, z * freq);
    norm += amp;
    freq *= 2.03;
    amp *= 0.49;
  }
  return value / norm;
}

/**
 * 近似无散度三维湍流速度扰动，用于火星与烟羽的旋转上升对流
 */
export function curlFlow3(x, y, z, time) {
  const t = time * 0.85;
  const vx = (noise3(x * 1.3 + 3.1, y * 1.1 - t, z * 1.3 + 7.4) - 0.5) * 2.0;
  const vy = (noise3(x * 1.2 + 11.7, y * 1.2 - t * 1.2, z * 1.2 + 2.3) - 0.42) * 1.6;
  const vz = (noise3(x * 1.3 + 19.2, y * 1.1 - t, z * 1.3 + 13.8) - 0.5) * 2.0;
  return [vx, vy, vz];
}

/**
 * 计算与体积火焰同源的动态呼吸与摇曳信号：
 * 返回 { flicker, swayX, swayZ }
 */
export function evaluateFireFlicker(time, turbulence = 1.0) {
  const turbScale = 0.55 + 0.45 * Math.min(2.0, Math.max(0.0, turbulence));
  const slow = fbm3(time * 0.95, 1.7, 4.3, 3) - 0.5;
  const mid = fbm3(time * 2.85, 8.2, 3.1, 3) - 0.5;
  const fast = (noise3(time * 7.6, 5.4, 9.8) - 0.5) * 0.45;

  const flicker = Math.max(
    0.58,
    Math.min(1.42, 1.0 + (slow * 0.34 + mid * 0.24 + fast * 0.16) * turbScale)
  );
  const swayX = (fbm3(time * 1.75 + 13.1, 2.4, 6.7, 3) - 0.5) * 0.18 * turbScale;
  const swayZ = (fbm3(time * 1.65 + 29.4, 7.1, 1.9, 3) - 0.5) * 0.18 * turbScale;
  return { flicker, swayX, swayZ };
}
