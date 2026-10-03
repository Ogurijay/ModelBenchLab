// CPU 低频海面副本：取 GPU 前两级 cascade 的低频系数（同一份 h0、同一份 ω），
// 每帧做 64×64 逆 FFT，给浮力、相机防穿水等逻辑提供与画面一致的海面高度与水质点速度。
// 第三级 cascade 只含 ≤3.5 m 的短波（厘米级起伏），CPU 端忽略。

import { ifft2D } from './fft.js';
import { waveVector, quantizedOmega } from './spectrum.js';

const MAX_WATER_SPEED = 12;

function wrapIndex(i, M) {
  return ((i % M) + M) % M;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

class CpuCascade {
  constructor(L, N, M) {
    this.L = L;
    this.N = N;
    this.M = M;
    const size = M * M;
    this.from = new Float32Array(size * 4);
    this.to = new Float32Array(size * 4);
    this.omega = new Float32Array(size);
    this.kx = new Float32Array(size);
    this.kz = new Float32Array(size);
    this.aRe = new Float64Array(size);
    this.aIm = new Float64Array(size);
    this.bRe = new Float64Array(size);
    this.bIm = new Float64Array(size);
    this.dx = new Float32Array(size);
    this.dy = new Float32Array(size);
    this.dz = new Float32Array(size);
    this.pdx = new Float32Array(size);
    this.pdy = new Float32Array(size);
    this.pdz = new Float32Array(size);
    for (let a = 0; a < M; a++) {
      for (let b = 0; b < M; b++) {
        const i = a * M + b;
        this.kz[i] = waveVector(a, M, L);
        this.kx[i] = waveVector(b, M, L);
        this.omega[i] = quantizedOmega(Math.hypot(this.kx[i], this.kz[i]));
      }
    }
  }

  // 从 GPU 分辨率（N×N）的数组里取出 M×M 低频子集（标准 FFT 频率顺序对应）
  extract(fullH0, target) {
    const { N, M } = this;
    for (let a = 0; a < M; a++) {
      const na = a < M / 2 ? a : a - M + N;
      for (let b = 0; b < M; b++) {
        const nb = b < M / 2 ? b : b - M + N;
        const src = na * N + nb;
        const dst = a * M + b;
        target[dst * 4] = fullH0[src * 4];
        target[dst * 4 + 1] = fullH0[src * 4 + 1];
        target[dst * 4 + 2] = fullH0[src * 4 + 2];
        target[dst * 4 + 3] = fullH0[src * 4 + 3];
      }
    }
  }

  update(t, blend, chop) {
    const { M, from, to, omega, kx, kz, aRe, aIm, bRe, bIm } = this;
    this.pdx.set(this.dx);
    this.pdy.set(this.dy);
    this.pdz.set(this.dz);
    const size = M * M;
    for (let i = 0; i < size; i++) {
      const j = i * 4;
      const h0r = from[j] + (to[j] - from[j]) * blend;
      const h0i = from[j + 1] + (to[j + 1] - from[j + 1]) * blend;
      const hmr = from[j + 2] + (to[j + 2] - from[j + 2]) * blend;
      const hmi = from[j + 3] + (to[j + 3] - from[j + 3]) * blend;
      const ph = Math.fround(omega[i]) * t;
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      // h = h0·e^{iωt} + conj(h0(-k))·e^{-iωt}
      const hr = h0r * c - h0i * s + (hmr * c + hmi * s);
      const hi = h0r * s + h0i * c + (hmi * c - hmr * s);
      const k = Math.hypot(kx[i], kz[i]);
      const ux = k > 0 ? kx[i] / k : 0;
      const uz = k > 0 ? kz[i] / k : 0;
      // Dx = -i·(kx/k)·h，Dy = h；打包 A = Dx + i·Dy
      const dxr = ux * hi;
      const dxi = -ux * hr;
      aRe[i] = dxr - hi;
      aIm[i] = dxi + hr;
      bRe[i] = uz * hi;
      bIm[i] = -uz * hr;
    }
    ifft2D(aRe, aIm, M);
    ifft2D(bRe, bIm, M);
    for (let i = 0; i < size; i++) {
      this.dx[i] = aRe[i] * chop;
      this.dy[i] = aIm[i];
      this.dz[i] = bRe[i] * chop;
    }
  }

  // 双线性采样（反求迭代用）
  bilinear(field, x, z) {
    const { M, L } = this;
    const fx = (x / L) * M;
    const fz = (z / L) * M;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const xa = wrapIndex(x0, M);
    const xb = wrapIndex(x0 + 1, M);
    const za = wrapIndex(z0, M) * M;
    const zb = wrapIndex(z0 + 1, M) * M;
    const top = field[za + xa] + (field[za + xb] - field[za + xa]) * tx;
    const bot = field[zb + xa] + (field[zb + xb] - field[zb + xa]) * tx;
    return top + (bot - top) * tz;
  }

  // Catmull-Rom 双三次采样（最终高度用，带限信号插值误差远小于双线性）
  bicubic(field, x, z) {
    const { M, L } = this;
    const fx = (x / L) * M;
    const fz = (z / L) * M;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const rows = [0, 0, 0, 0];
    for (let r = -1; r <= 2; r++) {
      const row = wrapIndex(z0 + r, M) * M;
      rows[r + 1] = catmullRom(
        field[row + wrapIndex(x0 - 1, M)],
        field[row + wrapIndex(x0, M)],
        field[row + wrapIndex(x0 + 1, M)],
        field[row + wrapIndex(x0 + 2, M)],
        tx
      );
    }
    return catmullRom(rows[0], rows[1], rows[2], rows[3], tz);
  }
}

export class OceanCPU {
  constructor({ layout, N, M = 64, cascades = 2 }) {
    this.M = M;
    this.cascades = layout.slice(0, cascades).map((c) => new CpuCascade(c.L, N, M));
    this.time = 0;
    this.prevTime = 0;
    this.blend = 1;
    this.chop = 1;
    this.fieldDt = 1 / 60;
    this.resetVelocity = true;
    this._out = { x: 0, y: 0, z: 0 };
  }

  // 新目标谱：当前混合结果成为起点，平滑过渡到新谱
  setTarget(fullH0List, immediate = false) {
    this.cascades.forEach((c, i) => {
      if (immediate) {
        c.extract(fullH0List[i], c.to);
        c.from.set(c.to);
      } else {
        for (let j = 0; j < c.from.length; j++) c.from[j] += (c.to[j] - c.from[j]) * this.blend;
        c.extract(fullH0List[i], c.to);
      }
    });
    this.blend = immediate ? 1 : 0;
    // 波谱瞬切时海面跳变，下一帧不能把跳变量当作水质点速度
    if (immediate) this.resetVelocity = true;
  }

  update(loopTime, dt, blend, chop) {
    this.blend = blend;
    this.chop = chop;
    this.fieldDt = Math.max(dt, 1e-4);
    for (const c of this.cascades) c.update(loopTime, blend, chop);
    if (this.resetVelocity) {
      for (const c of this.cascades) {
        c.pdx.set(c.dx);
        c.pdy.set(c.dy);
        c.pdz.set(c.dz);
      }
      this.resetVelocity = false;
    }
  }

  displacement(x, z, cubic = false, out = this._out) {
    let dx = 0;
    let dy = 0;
    let dz = 0;
    for (const c of this.cascades) {
      if (cubic) {
        dx += c.bicubic(c.dx, x, z);
        dy += c.bicubic(c.dy, x, z);
        dz += c.bicubic(c.dz, x, z);
      } else {
        dx += c.bilinear(c.dx, x, z);
        dy += c.bilinear(c.dy, x, z);
        dz += c.bilinear(c.dz, x, z);
      }
    }
    out.x = dx;
    out.y = dy;
    out.z = dz;
    return out;
  }

  // 反求：世界坐标 (x,z) 处的水面高度。海面点由 x0 平移到 x0 + D(x0)，迭代求 x0。
  query(x, z, out = {}) {
    let x0 = x;
    let z0 = z;
    const d = this._out;
    for (let i = 0; i < 4; i++) {
      this.displacement(x0, z0, false, d);
      x0 = x - d.x;
      z0 = z - d.z;
    }
    let h = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    const inv = 1 / this.fieldDt;
    for (const c of this.cascades) {
      h += c.bicubic(c.dy, x0, z0);
      // 拉格朗日水质点速度 ∂D/∂t（同一 x0 的前后两帧位移差）
      vx += (c.bilinear(c.dx, x0, z0) - c.bilinear(c.pdx, x0, z0)) * inv;
      vy += (c.bilinear(c.dy, x0, z0) - c.bilinear(c.pdy, x0, z0)) * inv;
      vz += (c.bilinear(c.dz, x0, z0) - c.bilinear(c.pdz, x0, z0)) * inv;
    }
    // 真实深水波水质点速度 ≈ ωa，极端海况也不超过十几 m/s；超出即视为跳变
    const sp = Math.hypot(vx, vy, vz);
    if (sp > MAX_WATER_SPEED) {
      const k = MAX_WATER_SPEED / sp;
      vx *= k;
      vy *= k;
      vz *= k;
    }
    out.height = h;
    out.vx = vx;
    out.vy = vy;
    out.vz = vz;
    return out;
  }

  heightAt(x, z) {
    return this.query(x, z, this._q || (this._q = {})).height;
  }
}

