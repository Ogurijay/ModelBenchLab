// 海浪波谱：JONSWAP 风浪 + 窄带涌浪，Mitsuyasu 方向分布。
// 输出 Tessendorf 初始频谱 h0(k)，供 GPU FFT 与 CPU 副本共用同一份系数。

import { mulberry32, gaussianPair } from '../core/rng.js';

export const G = 9.81;
const TAU = Math.PI * 2;

// 三级 cascade：每级只负责一段波数，互不重叠，避免同一波长被叠加两次。
// 长度取非整数比，削弱平铺重复感。
export const CASCADE_LAYOUT = [
  { L: 500, kMin: 1e-6, kMax: 0.35 },
  { L: 97, kMin: 0.35, kMax: 1.8 },
  { L: 21, kMin: 1.8, kMax: Infinity }
];

export const DEFAULT_SEA = {
  windSpeed: 9, // m/s，10 m 高处风速
  windDir: 25, // 度，浪的传播方向（自 +X 向 +Z）
  fetch: 150, // km，风区长度
  gamma: 3.3, // JONSWAP 峰值增强因子
  directionality: 1, // 0 = 各向同性，1 = 完整 Mitsuyasu 分布
  swellHeight: 0.6, // m，涌浪有效波高
  swellPeriod: 11, // s，涌浪峰值周期
  swellDir: 70, // 度
  choppiness: 0.9, // 水平位移系数 λ（尖浪程度）
  shortWaveDamping: 0.012 // m，极短波阻尼长度
};

// ---------- 一维谱 ----------

export function windSeaPeak(U, fetchKm) {
  const F = Math.max(1, fetchKm) * 1000;
  const u = Math.max(0.5, U);
  // 风区受限的 JONSWAP 峰频，不低于充分成长（Pierson–Moskowitz）极限
  const fetchOmega = 22 * Math.cbrt((G * G) / (u * F));
  const pmOmega = (0.855 * G) / u;
  const omegaP = Math.max(fetchOmega, pmOmega);
  const alpha = Math.max(0.076 * Math.pow((u * u) / (F * G), 0.22), 0.0081);
  // 越接近充分成长，峰值增强越弱，极限处退化为 PM 谱（γ = 1）
  const maturity = Math.min(Math.max((1 - pmOmega / fetchOmega) / 0.3, 0), 1);
  return { omegaP, alpha, maturity };
}

export function jonswapShape(omega, omegaP, gamma) {
  if (omega <= 0) return 0;
  const sigma = omega <= omegaP ? 0.07 : 0.09;
  const d = omega - omegaP;
  const r = Math.exp(-(d * d) / (2 * sigma * sigma * omegaP * omegaP));
  const ratio = omegaP / omega;
  return ((G * G) / Math.pow(omega, 5)) * Math.exp(-1.25 * ratio * ratio * ratio * ratio) * Math.pow(gamma, r);
}

// ∫ S dω（对数网格梯形积分）
export function integrateOmega(fn, lo = 0.02, hi = 40, steps = 2000) {
  const a = Math.log(lo);
  const b = Math.log(hi);
  let sum = 0;
  let prevW = lo;
  let prevF = fn(lo);
  for (let i = 1; i <= steps; i++) {
    const w = Math.exp(a + ((b - a) * i) / steps);
    const f = fn(w);
    sum += 0.5 * (f + prevF) * (w - prevW);
    prevW = w;
    prevF = f;
  }
  return sum;
}

const swellNormCache = new Map();
function swellAlpha(Hs, Tp, gamma) {
  if (Hs <= 0) return 0;
  const omegaP = TAU / Tp;
  const key = `${Tp.toFixed(3)}|${gamma}`;
  let m0 = swellNormCache.get(key);
  if (m0 === undefined) {
    m0 = integrateOmega((w) => jonswapShape(w, omegaP, gamma));
    swellNormCache.set(key, m0);
  }
  return (Hs / 4) * (Hs / 4) / m0;
}

// ---------- 方向分布 ----------

// Lanczos 近似 ln Γ(x)
export function lgamma(x) {
  const c = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += c[i] / (x + i + 1);
  return 0.5 * Math.log(TAU) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// cos^{2s}(θ/2) 的归一化系数，使 ∫_{-π}^{π} D dθ = 1
export function spreadNorm(s) {
  return Math.exp(lgamma(s + 1) - lgamma(s + 0.5)) / (2 * Math.sqrt(Math.PI));
}

export function cos2s(theta, s) {
  return spreadNorm(s) * Math.pow(Math.abs(Math.cos(theta * 0.5)), 2 * s);
}

// Mitsuyasu：峰频附近最窄，高频逐渐变宽
export function mitsuyasuS(omega, omegaP, U) {
  const sp = 11.5 * Math.pow(G / (omegaP * Math.max(U, 0.5)), 2.5);
  const r = omega / omegaP;
  const s = r <= 1 ? sp * Math.pow(r, 5) : sp * Math.pow(r, -2.5);
  return Math.min(Math.max(s, 0.5), 60);
}

// ---------- 二维谱 ----------

export function buildSpectrumModel(params) {
  const p = { ...DEFAULT_SEA, ...params };
  const wind = windSeaPeak(p.windSpeed, p.fetch);
  const swellOmegaP = TAU / Math.max(2, p.swellPeriod);
  const swellGamma = 5;
  const swellA = swellAlpha(p.swellHeight, Math.max(2, p.swellPeriod), swellGamma);
  const thetaW = (p.windDir * Math.PI) / 180;
  const thetaS = (p.swellDir * Math.PI) / 180;
  const iso = 1 / TAU;

  const gammaEff = 1 + (p.gamma - 1) * wind.maturity;
  const windS = (w) => wind.alpha * jonswapShape(w, wind.omegaP, gammaEff);
  const swellS = (w) => swellA * jonswapShape(w, swellOmegaP, swellGamma);

  // 方向谱 S(ω, θ)
  function directional(w, theta) {
    let total = 0;
    const sw = windS(w);
    if (sw > 0) {
      const s = mitsuyasuS(w, wind.omegaP, p.windSpeed);
      const d = cos2s(theta - thetaW, s);
      total += sw * (iso + (d - iso) * p.directionality);
    }
    if (swellA > 0) {
      const ss = swellS(w);
      if (ss > 0) total += ss * cos2s(theta - thetaS, 40);
    }
    return total;
  }

  // 波数域密度 S(kx, kz)：S(ω,θ)·(dω/dk)/k
  function density(kx, kz) {
    const k = Math.hypot(kx, kz);
    if (k < 1e-9) return 0;
    const w = Math.sqrt(G * k);
    const dwdk = G / (2 * w);
    const damp = Math.exp(-k * k * p.shortWaveDamping * p.shortWaveDamping);
    return (directional(w, Math.atan2(kz, kx)) * dwdk * damp) / k;
  }

  const m0 = integrateOmega((w) => windS(w) + swellS(w));
  return {
    params: p,
    density,
    windOmegaP: wind.omegaP,
    peakPeriod: TAU / wind.omegaP,
    peakWavelength: (TAU * G) / (wind.omegaP * wind.omegaP),
    significantHeight: 4 * Math.sqrt(m0)
  };
}

// ---------- h0 ----------

const noiseCache = new Map();
export function gaussianNoise(N, seed) {
  const key = `${N}|${seed}`;
  let out = noiseCache.get(key);
  if (!out) {
    const rand = mulberry32(seed);
    out = new Float32Array(N * N * 2);
    for (let i = 0; i < N * N; i++) {
      const [a, b] = gaussianPair(rand);
      out[i * 2] = a;
      out[i * 2 + 1] = b;
    }
    noiseCache.set(key, out);
  }
  return out;
}

export function waveVector(index, N, L) {
  const n = index < N / 2 ? index : index - N;
  return (TAU * n) / L;
}

/**
 * 生成一级 cascade 的初始频谱。
 * 返回 RGBA 交错数组：(h0(k).re, h0(k).im, conj(h0(-k)).re, conj(h0(-k)).im)
 * 频率按 FFT 标准顺序排布（0..N/2-1, -N/2..-1），逆变换后无需符号修正。
 */
export function generateH0(model, cascade, N, seed) {
  const noise = gaussianNoise(N, seed);
  const dk = TAU / cascade.L;
  const amp = new Float32Array(N * N * 2);
  for (let m = 0; m < N; m++) {
    const kz = waveVector(m, N, cascade.L);
    for (let n = 0; n < N; n++) {
      const kx = waveVector(n, N, cascade.L);
      const k = Math.hypot(kx, kz);
      const i = m * N + n;
      if (k < cascade.kMin || k >= cascade.kMax) continue;
      // E|h0|² = S·Δk²/2，两分量各取方差 S·Δk²/4
      const c = 0.5 * Math.sqrt(model.density(kx, kz)) * dk;
      amp[i * 2] = noise[i * 2] * c;
      amp[i * 2 + 1] = noise[i * 2 + 1] * c;
    }
  }
  const out = new Float32Array(N * N * 4);
  for (let m = 0; m < N; m++) {
    const mm = (N - m) % N;
    for (let n = 0; n < N; n++) {
      const nn = (N - n) % N;
      const i = m * N + n;
      const j = mm * N + nn;
      out[i * 4] = amp[i * 2];
      out[i * 4 + 1] = amp[i * 2 + 1];
      out[i * 4 + 2] = amp[j * 2];
      out[i * 4 + 3] = -amp[j * 2 + 1];
    }
  }
  return out;
}

// ω 量化到 2π/T 的整数倍：时间可按 T 无缝取模，长时间运行 float32 相位也不失精度。
// GPU 与 CPU 都用 Math.fround 后的同一值。
export const OMEGA_LOOP_PERIOD = 600;
export function quantizedOmega(k) {
  const w0 = TAU / OMEGA_LOOP_PERIOD;
  return Math.fround(Math.floor(Math.sqrt(G * k) / w0) * w0);
}

export function buildOmegaTable(N, L) {
  const out = new Float32Array(N * N * 4);
  for (let m = 0; m < N; m++) {
    const kz = waveVector(m, N, L);
    for (let n = 0; n < N; n++) {
      const kx = waveVector(n, N, L);
      const i = (m * N + n) * 4;
      out[i] = quantizedOmega(Math.hypot(kx, kz));
      out[i + 1] = kx;
      out[i + 2] = kz;
      out[i + 3] = 1;
    }
  }
  return out;
}

// 期望方差 Σ S·Δk²（用于测试离散谱与解析谱是否一致）
export function cascadeVariance(model, cascade, N) {
  const dk = TAU / cascade.L;
  let v = 0;
  for (let m = 0; m < N; m++) {
    const kz = waveVector(m, N, cascade.L);
    for (let n = 0; n < N; n++) {
      const kx = waveVector(n, N, cascade.L);
      const k = Math.hypot(kx, kz);
      if (k < cascade.kMin || k >= cascade.kMax) continue;
      v += model.density(kx, kz) * dk * dk;
    }
  }
  return v;
}

// 蒲福风级（用于 HUD 海况描述）
const BEAUFORT = [
  [0.5, 0, '无风'], [1.6, 1, '软风'], [3.4, 2, '轻风'], [5.5, 3, '微风'], [8.0, 4, '和风'],
  [10.8, 5, '清劲风'], [13.9, 6, '强风'], [17.2, 7, '疾风'], [20.8, 8, '大风'], [24.5, 9, '烈风'],
  [28.5, 10, '狂风'], [32.7, 11, '暴风'], [Infinity, 12, '飓风']
];
export function beaufort(U) {
  for (const [limit, force, name] of BEAUFORT) if (U < limit) return { force, name };
  return { force: 12, name: '飓风' };
}
