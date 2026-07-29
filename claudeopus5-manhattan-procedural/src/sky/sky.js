/**
 * @file src/sky/sky.js
 * @module sky/sky
 * @description
 * 大气散射天穹 + 星空 + 日月 + 城市光污染（契约 §7.1）。
 *
 * ─────────────────────────── 物理模型来源 ───────────────────────────
 * 1) **单次散射天空辐亮度**（Preetham et al. 1999《A Practical Analytic Model
 *    for Daylight》第 3 节；Nishita et al. 1993 的大气模型同构）。
 *    均匀大气板近似下，视线方向 v 的入射光为
 *
 *        L(v) = E · T_sun · [ (β_R·P_R(θ) + β_M·P_M(θ)) / (β_R + β_M) ]
 *                         · [ 1 − exp(−(β_R H_R + β_M H_M)·m(v)) ]
 *
 *    其中 θ 为视线与太阳的夹角，m(·) 为相对空气质量。
 *
 * 2) **Rayleigh 散射系数**（Bucholtz 1995 / Bruneton & Neyret 2008 常用值，
 *    对应 λ = 680 / 550 / 440 nm）：
 *        β_R = (5.802, 13.558, 33.100) × 10⁻⁶ m⁻¹，标高 H_R = 8000 m
 *    λ⁻⁴ 依赖正是「天空为什么是蓝的」。
 *
 * 3) **Rayleigh 相函数**  P_R(θ) = 3/(16π) · (1 + cos²θ)
 *    **Mie 相函数**（Henyey–Greenstein 1941）
 *        P_M(θ) = (1 − g²) / (4π · (1 + g² − 2g·cosθ)^{3/2})，g = 0.76
 *    气溶胶 β_M 基准 21 × 10⁻⁶ m⁻¹、标高 H_M = 1200 m，随 turbidity 线性增大
 *    （Preetham 的 T 参数：T 越大越灰白、日晕越大）。
 *
 * 4) **相对空气质量**（Kasten & Young 1989）
 *        m(z) = 1 / (cos z + 0.50572 · (96.07995° − z)^(−1.6364))
 *    天顶 m = 1，地平线 m ≈ 38，这是日落变红的根本原因。
 *
 * 5) **臭氧 Chappuis 吸收带**（500–700 nm，天顶光学厚度约
 *    (0.017, 0.031, 0.002)）。臭氧层位于 ~25 km，其倾斜路径用球壳几何
 *        m_O₃(z) = 1 / sqrt(1 − (R/(R+h))²·sin²z)
 *    计算（地平线 ≈ 11.3）。**曙暮时天空之所以呈深蓝/紫，正是因为掠射阳光
 *    穿过极长的臭氧路径，黄绿光被吸收殆尽而红蓝残留。**
 *
 * 6) **有效散射高度修正**：视线越朝天顶，主要散射体所在高度越高（≈ H_R 量级），
 *    其所见太阳光程比地面短，故对太阳透过率的空气质量做密度权重 hF 衰减。
 *    没有这一项，平板模型会让日落时整个天顶被染成橄榄色（物理上错误）。
 *
 * 7) **曝光自适应**：main.js 的直射光强按 smoothstep 给出（黄昏只比正午暗 ~2.4×），
 *    而真实天空亮度会暗 ~30×。为与场景光照匹配，天空对太阳高度角做
 *    一次「相机自动曝光」补偿 adapt(elev)，相当于摄影机随光线开大光圈。
 *
 * 8) **月相**：明暗界线由球面法线与光照方向点乘计算（无贴图）。相位角 α 由
 *    core/solar.js 的 `moonPhase().illumination` 反解：k = (1 + cos α)/2 ⇒
 *    cos α = 2k − 1；亮缘方位由太阳方向在月面切平面的投影给出，因此
 *    「盈亏方向」始终朝向太阳，而「被照亮比例」严格等于契约要求的 illumination。
 *
 * 9) **星空绕天极旋转**：北天极在地平坐标中位于方位角 0°（正北）、高度角 = 当地纬度
 *    φ = 40.7128°，故旋转轴 = (0, sin φ, −cos φ)。恒星日 = 23h56m04s，
 *    一回归年恒星转 366.2422 圈，据此推进旋转角。
 *
 * ─────────────────────────── 渲染约定 ───────────────────────────
 * · drawcall = 2（天穹 1 + 星空 1）；太阳盘、月相、月晕、银河、光污染全部在天穹
 *   片元着色器内解析计算，不额外增加绘制批次。
 * · 天穹半径 9000 m，`BackSide`；天穹与星空均 `depthWrite = false`、
 *   `depthTest = false`、`renderOrder` 最小，永远在最后面且不遮挡任何物体。
 * · 根节点每帧跟随相机位置，避免相机移动穿出天穹。
 * · CPU 版 `getSkyColorAt()` 与 GLSL 版共用同一套公式（见 `skyRadiance` 与
 *   着色器中的 `atmosphere()`，**两者必须同步修改**），供 main.js 取雾色与环境光。
 *
 * 坐标：Y 上；+X 东、−X 西；+Z 南（下城）、−Z 北（上城）；1 单位 = 1 米。
 */

import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { clamp, smoothstep, TWO_PI, DEG2RAD } from '../core/mathx.js';
import { NYC } from '../core/solar.js';

/* ------------------------------------------------------------------ *
 * 物理常数（CPU / GLSL 两侧保持一致）
 * ------------------------------------------------------------------ */

/** Rayleigh 体散射系数 β_R（m⁻¹），λ = 680 / 550 / 440 nm */
const BETA_R = [5.802e-6, 13.558e-6, 33.1e-6];
/** 气溶胶（Mie）体散射系数基准值（m⁻¹），turbidity = 1 时的参考 */
const BETA_M0 = 21e-6;
/** Rayleigh 标高（m） */
const H_R = 8000;
/** Mie 标高（m） */
const H_M = 1200;
/** 臭氧 Chappuis 带天顶光学厚度（无量纲） */
const TAU_O3 = [0.017, 0.031, 0.002];
/** 地球半径（m） */
const EARTH_R = 6371000;
/** 臭氧层等效高度（m） */
const OZONE_H = 25000;
/** Henyey–Greenstein 各向异性因子 */
const MIE_G = 0.76;
/** 太阳辐照度标定系数（与 ACESFilmic + exposure 1.0 联合标定） */
const SUN_E = 6.0;
/** 多次散射强度系数 */
const K_MS = 0.05;
/** 曙暮光（高层大气 + 臭氧滤色）强度系数 */
const K_TW = 0.06;
/** 曙暮低空残余暖光色（掠射阳光被 Rayleigh 滤成橙红） */
const WARM_TW = [1.0, 0.38, 0.13];
/** 曙暮高空紫调偏置（臭氧吸收黄绿 → 红蓝残留） */
const VIOLET_TW = [1.18, 0.9, 1.06];
/** 夜天光基底（气辉 + 银河散射 + 黄道光的合并近似），线性值 */
const NIGHT_BASE = [0.0026, 0.0034, 0.0068];
/** 满月时的月光散射标定系数 */
const MOON_E = 0.35;
/** 城市光污染色（高压钠灯偏暖） */
const CITY_GLOW_COLOR = [1.0, 0.66, 0.36];
/** 城市光污染强度标定 */
const CITY_GLOW_E = 0.016;

/** 北天极方向：方位角 0°（正北 = −Z）、高度角 = 当地纬度 */
const CELESTIAL_POLE = new THREE.Vector3(
  0,
  Math.sin(NYC.lat * DEG2RAD),
  -Math.cos(NYC.lat * DEG2RAD)
).normalize();

/** 银道北极在星空局部坐标系中的方向（决定银河带的走向，任意但固定） */
const GALACTIC_POLE_LOCAL = new THREE.Vector3(0.42, 0.79, -0.45).normalize();

/** 天穹半径（m） */
const DOME_RADIUS = 9000;
/** 星空半径（m），略小于天穹以保证被同一根节点包裹 */
const STAR_RADIUS = 8600;

/** 恒星年/回归年圈数比：一年内天球比太阳多转一圈 */
const SIDEREAL_RATIO = 366.2422 / 365.2422;

/**
 * 恒星光谱型 → 线性 RGB 色温（近似黑体色度，已归一化到最亮通道 1.0）。
 * 权重按肉眼可见恒星的大致比例给（并非真实 IMF，重在观感）。
 */
const STAR_CLASSES = [
  { rgb: [0.62, 0.72, 1.0], w: 0.1 }, // O/B 蓝白
  { rgb: [0.8, 0.86, 1.0], w: 0.18 }, // A 白蓝
  { rgb: [1.0, 0.99, 0.96], w: 0.26 }, // F 白
  { rgb: [1.0, 0.94, 0.8], w: 0.22 }, // G 黄（如太阳）
  { rgb: [1.0, 0.83, 0.6], w: 0.16 }, // K 橙
  { rgb: [1.0, 0.7, 0.48], w: 0.08 } // M 红橙
];

/** 各画质下的恒星数量（契约要求 ≥ 1500） */
const STAR_COUNTS = { high: 3200, medium: 2400, low: 1600 };

/* ------------------------------------------------------------------ *
 * CPU 侧散射（与 GLSL 版 atmosphere() 逐行对应）
 * ------------------------------------------------------------------ */

/**
 * Kasten & Young (1989) 相对空气质量。
 * @param {number} cosZ 天顶角余弦（已 clamp 到 [0,1]）
 * @returns {number} 相对空气质量，天顶 1、地平线 ≈ 38
 */
function airMass(cosZ) {
  const c = clamp(cosZ, 0, 1);
  const zDeg = Math.acos(c) * (180 / Math.PI);
  return 1 / (c + 0.50572 * Math.pow(Math.max(96.07995 - zDeg, 0.02), -1.6364));
}

/**
 * 臭氧层（球壳）倾斜路径因子：m = 1/sqrt(1 − (R/(R+h))²·sin²z)。
 * @param {number} cosZ 天顶角余弦
 * @returns {number} 相对路径长度，天顶 1、地平线 ≈ 11.3
 */
function ozoneMass(cosZ) {
  const c = clamp(cosZ, 0, 1);
  const k = EARTH_R / (EARTH_R + OZONE_H);
  return 1 / Math.sqrt(Math.max(1e-4, 1 - k * k * (1 - c * c)));
}

/**
 * Rayleigh 相函数 P_R(θ) = 3/(16π)(1 + cos²θ)。
 * @param {number} c cosθ
 * @returns {number} 相函数值（sr⁻¹）
 */
function rayleighPhase(c) {
  return 0.0596831 * (1 + c * c);
}

/**
 * Henyey–Greenstein 相函数。
 * @param {number} c cosθ
 * @param {number} g 各向异性因子
 * @returns {number} 相函数值（sr⁻¹）
 */
function hgPhase(c, g) {
  const gg = g * g;
  return (1 - gg) / (4 * Math.PI * Math.pow(Math.max(1e-4, 1 + gg - 2 * g * c), 1.5));
}

/**
 * 天空辐亮度（CPU 版，供 `getSkyColorAt` 与雾色取样使用）。
 * **本函数必须与片元着色器 `atmosphere()` 保持同步。**
 *
 * @param {number} vx 视线方向 x（单位向量）
 * @param {number} vy 视线方向 y
 * @param {number} vz 视线方向 z
 * @param {SkyState} st 当前天空状态
 * @param {number[]} out 长度 3 的输出数组（线性 RGB）
 * @returns {number[]} out
 */
function skyRadiance(vx, vy, vz, st, out) {
  const T = st.turbidity;
  const mie = BETA_M0 * (0.22 + 0.48 * (T - 1));
  const tauM = mie * H_M;
  const sunY = st.sunY;
  const elev = st.sunElevDeg;

  // 日落后直射散射快速消失；同时把相位方向抬回地平线，让余晖贴着天际线
  const fade = Math.exp(Math.min(elev, 0) / 2.6);
  const adapt = 1 / (0.13 + 0.87 * smoothstep(-7, 22, elev));
  const below = smoothstep(0, -0.14, sunY);
  const hLen = Math.hypot(st.sunX, st.sunZ) || 1;
  let gx = st.sunX * (1 - below) + (st.sunX / hLen) * 0.9994 * below;
  let gy = sunY * (1 - below) + 0.035 * below;
  let gz = st.sunZ * (1 - below) + (st.sunZ / hLen) * 0.9994 * below;
  const gLen = Math.hypot(gx, gy, gz) || 1;
  gx /= gLen;
  gy /= gLen;
  gz /= gLen;

  const mSun = airMass(Math.max(sunY, 0));
  const mO3 = ozoneMass(Math.max(sunY, 0)) * (1 + 1.7 * smoothstep(8, -6, elev));
  const hF = 1 - 0.72 * smoothstep(0, 0.65, vy);
  const mView = airMass(clamp(vy, 0, 1));

  const cosT = vx * gx + vy * gy + vz * gz;
  const pr = rayleighPhase(cosT);
  const pm = hgPhase(cosT, MIE_G);

  const cosM = vx * st.moonX + vy * st.moonY + vz * st.moonZ;
  const prM = rayleighPhase(cosM);
  const pmM = hgPhase(cosM, 0.6);
  const moonAmp = MOON_E * st.moonIllum * st.moonUp;

  const E = SUN_E * fade * adapt;
  const twAmp = smoothstep(10, -2, elev) * Math.exp(Math.min(elev, 0) / 3.2);
  const alt = Math.exp(-Math.max(vy, 0) / 0.55);
  const warmW = Math.pow(Math.max(cosT, 0), 2) * Math.exp(-Math.max(vy, 0) / 0.15);

  for (let i = 0; i < 3; i++) {
    const bR = BETA_R[i];
    const tauR = bR * H_R;
    const betaE = bR + mie;
    const tint = bR / betaE;

    const fSun = Math.exp(-(tauR + tauM) * mSun * hF - TAU_O3[i] * mO3);
    const sat = 1 - Math.exp(-(tauR + tauM) * mView);

    const single = E * fSun * ((bR * pr + mie * pm) / betaE) * sat;
    const multi = E * K_MS * Math.pow(fSun, 0.35) * tint * Math.pow(sat, 0.7);
    const fTw = Math.exp(-TAU_O3[i] * mO3 * 2.4 - tauR * 0.35);
    const twilight =
      K_TW * twAmp * (fTw * tint * VIOLET_TW[i] * alt + WARM_TW[i] * warmW * 1.1);
    const moonlight = moonAmp * ((bR * prM + mie * pmM) / betaE) * sat;

    out[i] = single + multi + twilight + moonlight + NIGHT_BASE[i];
  }

  // 城市光污染：地平线附近偏暖辉光，夜间随云量增强（云底反射灯光）
  const hb = Math.pow(clamp(1 - Math.max(vy, 0) / 0.3, 0, 1), 2.4);
  if (hb > 0 && st.cityGlow > 0) {
    const hx = vx;
    const hz = vz;
    const hn = Math.hypot(hx, hz) || 1;
    const toCity = Math.max((hx / hn) * st.cityDirX + (hz / hn) * st.cityDirZ, 0);
    const dirW = 1 + st.cityFocus * (0.3 + 1.05 * Math.pow(toCity, 1.6) - 1);
    const g = CITY_GLOW_E * st.cityGlow * hb * dirW;
    out[0] += CITY_GLOW_COLOR[0] * g;
    out[1] += CITY_GLOW_COLOR[1] * g;
    out[2] += CITY_GLOW_COLOR[2] * g;
  }

  // 阴天：整体压暗 + 去饱和（灰白化）
  if (st.overcast > 0) {
    const dim = 1 - 0.38 * st.overcast;
    out[0] *= dim;
    out[1] *= dim;
    out[2] *= dim;
  }
  if (st.desat > 0) {
    const lum = out[0] * 0.2126 + out[1] * 0.7152 + out[2] * 0.0722;
    for (let i = 0; i < 3; i++) out[i] += (lum - out[i]) * st.desat;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 着色器
 * ------------------------------------------------------------------ */

/** 天穹顶点着色器：把球面顶点（物体空间）直接当作世界方向传给片元 */
const DOME_VERT = /* glsl */ `
varying vec3 vDir;

void main() {
  // 天穹从不旋转，球心即物体原点，故物体空间坐标方向 == 世界方向
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** 天穹片元着色器：大气散射 + 太阳盘 + 月相 + 银河 + 光污染 + 雾一致化 */
const DOME_FRAG = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>

varying vec3 vDir;

uniform vec3  uSunDir;
uniform vec3  uMoonDir;
uniform vec3  uCityDir;
uniform vec3  uFogColor;
uniform vec3  uGalacticPole;
uniform float uSunElevDeg;
uniform float uTurbidity;
uniform float uNight;
uniform float uMoonIllum;
uniform float uMoonUp;
uniform float uCityGlow;
uniform float uCityFocus;
uniform float uFogBlend;
uniform float uDesat;
uniform float uOvercast;
uniform float uMilkyWay;
uniform float uSunDiscGain;

const vec3  BETA_R    = vec3(5.802e-6, 13.558e-6, 33.100e-6);
const float BETA_M0   = 21.0e-6;
const float H_R       = 8000.0;
const float H_M       = 1200.0;
const vec3  TAU_O3    = vec3(0.017, 0.031, 0.002);
const float EARTH_R   = 6371000.0;
const float OZONE_H   = 25000.0;
const float MIE_G     = 0.76;
const float SUN_E     = ${SUN_E.toFixed(4)};
const float K_MS      = ${K_MS.toFixed(4)};
const float K_TW      = ${K_TW.toFixed(4)};
const vec3  WARM_TW   = vec3(${WARM_TW.map((v) => v.toFixed(3)).join(', ')});
const vec3  VIOLET_TW = vec3(${VIOLET_TW.map((v) => v.toFixed(3)).join(', ')});
const vec3  NIGHT_BASE= vec3(${NIGHT_BASE.map((v) => v.toFixed(5)).join(', ')});
const float MOON_E    = ${MOON_E.toFixed(4)};
const vec3  CITY_COL  = vec3(${CITY_GLOW_COLOR.map((v) => v.toFixed(3)).join(', ')});
const float CITY_E    = ${CITY_GLOW_E.toFixed(4)};
/** 太阳视半径（rad），真实值 0.00465；地平线附近按视觉习惯放大 */
const float SUN_ANG_R = 0.00465;
/** 月亮视半径（rad），真实 0.00452，为可辨认相位放大至约 0.66° */
const float MOON_ANG_R = 0.0115;
const float MOON_DISC_E = 2.4;

/**
 * 允许 edge0 > edge1 的平滑阶跃。
 * GLSL 规范规定内建 smoothstep 在 edge0 >= edge1 时结果未定义，故自实现。
 */
float sstep(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

/** Kasten & Young (1989) 相对空气质量 */
float airMass(float cosZ) {
  float c = clamp(cosZ, 0.0, 1.0);
  float zDeg = degrees(acos(c));
  return 1.0 / (c + 0.50572 * pow(max(96.07995 - zDeg, 0.02), -1.6364));
}

/** 臭氧球壳倾斜路径因子 */
float ozoneMass(float cosZ) {
  float c = clamp(cosZ, 0.0, 1.0);
  float k = EARTH_R / (EARTH_R + OZONE_H);
  return 1.0 / sqrt(max(1e-4, 1.0 - k * k * (1.0 - c * c)));
}

/** Rayleigh 相函数 */
float rayleighPhase(float c) {
  return 0.0596831 * (1.0 + c * c);
}

/** Henyey–Greenstein 相函数 */
float hgPhase(float c, float g) {
  float gg = g * g;
  return (1.0 - gg) / (12.5663706 * pow(max(1e-4, 1.0 + gg - 2.0 * g * c), 1.5));
}

/** 3D 哈希（Dave Hoskins 风格整数混合的浮点变体） */
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

/** 三线性插值值噪声，用于银河絮状结构与月海斑纹 */
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

/** 当前 turbidity 对应的 Mie 散射系数 */
float mieCoef() {
  return BETA_M0 * (0.22 + 0.48 * (uTurbidity - 1.0));
}

/**
 * 大气散射主体（与 CPU 版 skyRadiance() 逐行对应，改一处必须同步另一处）。
 */
vec3 atmosphere(vec3 v) {
  float mie = mieCoef();
  float tauM = mie * H_M;
  vec3  tauR = BETA_R * H_R;
  vec3  betaE = BETA_R + mie;
  vec3  tint = BETA_R / betaE;

  float elev = uSunElevDeg;
  float fade = exp(min(elev, 0.0) / 2.6);
  float adapt = 1.0 / (0.13 + 0.87 * sstep(-7.0, 22.0, elev));

  // 太阳沉入地平线后，把散射相位方向抬回地平线，余晖才会贴着天际线而不是钻到地下
  float below = sstep(0.0, -0.14, uSunDir.y);
  vec3 flatSun = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(1e-5, 0.0, 0.0));
  vec3 glowDir = normalize(mix(uSunDir, flatSun * 0.9994 + vec3(0.0, 0.035, 0.0), below));

  float mSun = airMass(max(uSunDir.y, 0.0));
  float mO3  = ozoneMass(max(uSunDir.y, 0.0)) * (1.0 + 1.7 * sstep(8.0, -6.0, elev));
  // 有效散射高度修正：越朝天顶，散射体越高，所见太阳光程越短
  float hF = 1.0 - 0.72 * sstep(0.0, 0.65, v.y);
  float mView = airMass(clamp(v.y, 0.0, 1.0));

  vec3 fSun = exp(-(tauR + tauM) * mSun * hF - TAU_O3 * mO3);
  vec3 sat  = 1.0 - exp(-(tauR + tauM) * mView);

  float cosT = dot(v, glowDir);
  float pr = rayleighPhase(cosT);
  float pm = hgPhase(cosT, MIE_G);

  float E = SUN_E * fade * adapt;
  vec3 single = E * fSun * ((BETA_R * pr + mie * pm) / betaE) * sat;
  vec3 multi  = E * K_MS * pow(fSun, vec3(0.35)) * tint * pow(sat, vec3(0.7));

  // 曙暮光：高层大气散射，经掠射臭氧路径滤成紫蓝；低空残留暖红
  float twAmp = sstep(10.0, -2.0, elev) * exp(min(elev, 0.0) / 3.2);
  vec3  fTw = exp(-TAU_O3 * mO3 * 2.4 - tauR * 0.35);
  float alt = exp(-max(v.y, 0.0) / 0.55);
  float warmW = pow(max(cosT, 0.0), 2.0) * exp(-max(v.y, 0.0) / 0.15);
  vec3  twilight = K_TW * twAmp * (fTw * tint * VIOLET_TW * alt + WARM_TW * warmW * 1.1);

  // 月光散射：夜空整体微亮 + 月周辉光
  float cosM = dot(v, uMoonDir);
  vec3 moonlight = MOON_E * uMoonIllum * uMoonUp *
    ((BETA_R * rayleighPhase(cosM) + mie * hgPhase(cosM, 0.6)) / betaE) * sat;

  return single + multi + twilight + moonlight + NIGHT_BASE;
}

/** 城市光污染：地平线附近偏暖辉光，朝城市方向更强 */
vec3 cityGlow(vec3 v) {
  float hb = pow(clamp(1.0 - max(v.y, 0.0) / 0.30, 0.0, 1.0), 2.4);
  if (hb <= 0.0 || uCityGlow <= 0.0) return vec3(0.0);
  vec2 vh = normalize(v.xz + vec2(1e-6, 0.0));
  float toCity = max(dot(vh, normalize(uCityDir.xz + vec2(1e-6, 0.0))), 0.0);
  float dirW = mix(1.0, 0.30 + 1.05 * pow(toCity, 1.6), uCityFocus);
  return CITY_COL * (CITY_E * uCityGlow * hb * dirW);
}

/** 太阳盘：临边昏暗 + 两级软晕；颜色由整条大气路径的透过率决定 */
vec3 sunDisc(vec3 v) {
  float visible = sstep(-0.9, 0.35, uSunElevDeg);
  if (visible <= 0.0) return vec3(0.0);
  float ang = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  float horiz = sstep(14.0, -1.0, uSunElevDeg);
  float R = SUN_ANG_R * mix(1.35, 2.7, horiz);
  float t = ang / R;
  float disc = 1.0 - sstep(0.88, 1.02, t);
  float tc = min(t, 1.0);
  // Eddington 临边昏暗近似 I(μ)/I(0) ≈ (1 − u + u·μ)，此处用幂函数拟合
  float limb = pow(max(0.0, 1.0 - tc * tc * 0.92), 0.32);

  float mie = mieCoef();
  vec3 fSun = exp(-(BETA_R * H_R + mie * H_M) * airMass(max(uSunDir.y, 0.0))
                  - TAU_O3 * ozoneMass(max(uSunDir.y, 0.0)));
  float adapt = 1.0 / (0.13 + 0.87 * sstep(-7.0, 22.0, uSunElevDeg));
  vec3 base = fSun * (18.0 * adapt * visible * uSunDiscGain);

  float halo = exp(-ang / 0.016) * 0.30 + exp(-ang / 0.060) * 0.026;
  return base * (disc * limb + halo);
}

/** 月亮：球面点乘求明暗界线（相位由 illumination 反解）+ 月海斑纹 + 柔和月晕 */
vec3 moonDisc(vec3 v) {
  if (uMoonUp <= 0.002) return vec3(0.0);
  float cm = clamp(dot(v, uMoonDir), -1.0, 1.0);
  float ang = acos(cm);
  float hazy = 0.75 + 0.06 * (uTurbidity - 1.0);
  vec3 res = vec3(0.70, 0.78, 1.0) *
    ((exp(-ang / 0.045) * 0.085 + exp(-ang / 0.18) * 0.022) *
     uMoonIllum * uMoonUp * hazy * mix(0.25, 1.0, uNight));

  if (ang < MOON_ANG_R * 1.06) {
    // 月面局部正交基：e1/e2 张成视切平面，e3 = −moonDir 指向观察者
    vec3 e1 = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 1e-4));
    vec3 e2 = cross(e1, uMoonDir);
    vec2 p = vec2(dot(v, e1), dot(v, e2)) / sin(MOON_ANG_R);
    float r2 = dot(p, p);
    if (r2 < 1.02) {
      float z = sqrt(max(0.0, 1.0 - r2));
      vec3 n = vec3(p, z);
      // k = (1 + cos α)/2  ⇒  cos α = 2k − 1，保证亮面比例严格等于 illumination
      float cosA = 2.0 * uMoonIllum - 1.0;
      float sinA = sqrt(max(0.0, 1.0 - cosA * cosA));
      vec2 lp = vec2(dot(uSunDir, e1), dot(uSunDir, e2));
      lp = length(lp) > 1e-5 ? normalize(lp) : vec2(1.0, 0.0);
      vec3 L = vec3(lp * sinA, cosA);
      float lam = dot(n, L);
      float lit = sstep(-0.05, 0.10, lam);
      float mare = vnoise3(n * 2.6 + 11.3);
      float albedo = mix(0.60, 1.0, sstep(0.32, 0.78, mare));
      // 地照（earthshine）：新月时暗面仍有地球反照的微光
      float earthshine = 0.013 * (1.0 - uMoonIllum);
      float edge = 1.0 - sstep(0.94, 1.0, sqrt(r2));
      float shade = albedo * (lit * (0.35 + 0.65 * max(lam, 0.0)) + earthshine);
      res += vec3(1.0, 0.975, 0.93) *
        (shade * edge * MOON_DISC_E * uMoonUp * mix(0.30, 1.0, uNight));
    }
  }
  return res;
}

void main() {
  vec3 v = normalize(vDir);
  vec3 col = atmosphere(v);
  col += cityGlow(v);

  // 银河：绕银道面的絮状亮带，只在夜间显现
  if (uMilkyWay > 0.002) {
    float gb = dot(v, uGalacticPole);
    float band = exp(-gb * gb * 16.0);
    float n = 0.35 + 0.45 * vnoise3(v * 9.0) + 0.30 * vnoise3(v * 23.0);
    col += vec3(0.62, 0.66, 0.92) * (band * n * 0.016 * uMilkyWay);
  }

  col += moonDisc(v);
  col += sunDisc(v);

  // 阴雨天：整体压暗 + 灰白化
  col *= 1.0 - 0.38 * uOvercast;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lum), uDesat);

  // 与 scene.fog.color 一致：地平线附近按天气融合，地平线以下完全融合，避免天地割裂
  float fogBelow = sstep(0.02, -0.16, v.y);
  float fogT = clamp(sstep(0.16, -0.03, v.y) * uFogBlend + fogBelow * 0.80, 0.0, 1.0);
  col = mix(col, uFogColor * (1.0 - 0.24 * fogBelow), fogT);

  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;

/** 星空顶点着色器：像素尺寸恒定 + 大气消光 + 闪烁 */
const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aTwinkle;
attribute vec3  aColor;

uniform float uTime;
uniform float uPixel;
uniform float uFade;

varying vec3  vCol;
varying float vAlpha;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 dir = normalize(world.xyz - cameraPosition);

  // 地平线附近大气消光（空气质量增大 → 星光被吸收）
  float ext = smoothstep(-0.01, 0.17, dir.y);
  // 闪烁（scintillation）：低空更剧烈，双频叠加避免机械感
  float amp = mix(0.14, 0.42, 1.0 - clamp(dir.y, 0.0, 1.0));
  float tw = 1.0 + amp * (0.72 * sin(uTime * aTwinkle + aPhase) +
                          0.28 * sin(uTime * aTwinkle * 2.37 + aPhase * 1.7));

  vAlpha = uFade * ext * clamp(tw, 0.25, 1.7);
  vCol = aColor;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixel * (0.86 + 0.28 * tw);
}
`;

/** 星空片元着色器：高斯亮核，加性混合 */
const STAR_FRAG = /* glsl */ `
varying vec3  vCol;
varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d) * 4.0;
  float core = exp(-r2 * 4.2);
  float a = core * vAlpha;
  if (a < 0.004) discard;

  gl_FragColor = vec4(vCol * a, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/* ------------------------------------------------------------------ *
 * 工厂
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} SkyState CPU 侧缓存的天空状态（供 getSkyColorAt 使用）
 * @property {number} sunX @property {number} sunY @property {number} sunZ
 * @property {number} sunElevDeg
 * @property {number} moonX @property {number} moonY @property {number} moonZ
 * @property {number} moonIllum @property {number} moonUp
 * @property {number} turbidity @property {number} desat @property {number} overcast
 * @property {number} cityGlow @property {number} cityFocus
 * @property {number} cityDirX @property {number} cityDirZ
 */

/**
 * 创建天空系统（契约 §7.1）。
 *
 * @param {{rng?:Object, quality?:('high'|'medium'|'low'), seed?:*}} ctx0 构建期上下文
 * @returns {{object3D: THREE.Group, update: Function, dispose: Function,
 *            getSkyColorAt: (dir: {x:number,y:number,z:number}) => THREE.Color,
 *            stats: {draws:number, stars:number}}} SystemHandle
 */
export function createSky(ctx0) {
  const opts = ctx0 || {};
  const quality = STAR_COUNTS[opts.quality] ? opts.quality : 'high';
  const rng =
    opts.rng && typeof opts.rng.fork === 'function'
      ? opts.rng.fork('sky')
      : makeRng(opts.seed != null ? opts.seed : 'sky', 'sky');

  const root = new THREE.Group();
  root.name = 'sky';
  root.matrixAutoUpdate = true;
  root.frustumCulled = false;
  // Group 的 renderOrder 会作为子节点的 groupOrder 参与排序，
  // 取极小值可保证天穹/星空先于任何城市几何绘制
  root.renderOrder = -10000;

  /* ---------------- 天穹 ---------------- */

  const domeGeo = new THREE.SphereGeometry(DOME_RADIUS, 32, 20);
  const domeUniforms = {
    uSunDir: { value: new THREE.Vector3(0.35, 0.6, -0.72).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.35, 0.85).normalize() },
    uCityDir: { value: new THREE.Vector3(0, 0, 1) },
    uFogColor: { value: new THREE.Color(0.42, 0.5, 0.62) },
    uGalacticPole: { value: GALACTIC_POLE_LOCAL.clone() },
    uSunElevDeg: { value: 36 },
    uTurbidity: { value: 2.3 },
    uNight: { value: 0 },
    uMoonIllum: { value: 0.5 },
    uMoonUp: { value: 0 },
    uCityGlow: { value: 0 },
    uCityFocus: { value: 0.5 },
    uFogBlend: { value: 0.03 },
    uDesat: { value: 0 },
    uOvercast: { value: 0 },
    uMilkyWay: { value: 0 },
    uSunDiscGain: { value: 1 }
  };

  const domeMat = new THREE.ShaderMaterial({
    name: 'skyDome',
    uniforms: domeUniforms,
    vertexShader: DOME_VERT,
    fragmentShader: DOME_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    dithering: true, // 抑制大面积渐变的 8bit 色带
    toneMapped: true
  });

  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.name = 'skyDome';
  dome.frustumCulled = false;
  dome.renderOrder = -10000;
  dome.matrixAutoUpdate = false;
  dome.updateMatrix();
  root.add(dome);

  /* ---------------- 星空 ---------------- */

  const starCount = STAR_COUNTS[quality];
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const twinkles = new Float32Array(starCount);

  for (let i = 0; i < starCount; i++) {
    // 球面均匀采样：z 均匀分布 + 方位角均匀分布（面积元 dA = dz·dφ）
    let dy = rng.range(-1, 1);
    const phi = rng.range(0, TWO_PI);
    const s = Math.sqrt(Math.max(0, 1 - dy * dy));
    let dx = s * Math.cos(phi);
    let dz = s * Math.sin(phi);

    // 约 38% 的恒星向银道面聚拢：压缩其沿银极方向的分量
    if (rng.bool(0.38)) {
      const b = dx * GALACTIC_POLE_LOCAL.x + dy * GALACTIC_POLE_LOCAL.y + dz * GALACTIC_POLE_LOCAL.z;
      const k = -b * (1 - rng.range(0.06, 0.32));
      dx += GALACTIC_POLE_LOCAL.x * k;
      dy += GALACTIC_POLE_LOCAL.y * k;
      dz += GALACTIC_POLE_LOCAL.z * k;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
    }

    positions[i * 3] = dx * STAR_RADIUS;
    positions[i * 3 + 1] = dy * STAR_RADIUS;
    positions[i * 3 + 2] = dz * STAR_RADIUS;

    // 星等分布：多数暗弱、少数明亮（幂次偏置模拟累积星数 N(<m) ∝ 10^0.6m）
    const mag = Math.pow(rng.next(), 2.4);
    const cls = rng.weighted(STAR_CLASSES, (c) => c.w) || STAR_CLASSES[2];
    const bright = 0.16 + 1.05 * mag;
    colors[i * 3] = cls.rgb[0] * bright;
    colors[i * 3 + 1] = cls.rgb[1] * bright;
    colors[i * 3 + 2] = cls.rgb[2] * bright;

    sizes[i] = 0.95 + 3.1 * mag;
    phases[i] = rng.range(0, TWO_PI);
    twinkles[i] = rng.range(0.35, 2.3);
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  starGeo.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));
  starGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), STAR_RADIUS * 1.01);

  const starUniforms = {
    uTime: { value: 0 },
    uPixel: { value: 1 },
    uFade: { value: 0 }
  };

  const starMat = new THREE.ShaderMaterial({
    name: 'skyStars',
    uniforms: starUniforms,
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    blending: THREE.AdditiveBlending,
    transparent: false, // 保持在不透明队列，先于城市几何绘制
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true
  });

  const stars = new THREE.Points(starGeo, starMat);
  stars.name = 'skyStars';
  stars.frustumCulled = false;
  stars.renderOrder = -9999;
  stars.visible = false;
  root.add(stars);

  /* ---------------- CPU 状态与临时对象（避免每帧分配） ---------------- */

  /** @type {SkyState} */
  const state = {
    sunX: domeUniforms.uSunDir.value.x,
    sunY: domeUniforms.uSunDir.value.y,
    sunZ: domeUniforms.uSunDir.value.z,
    sunElevDeg: 36,
    moonX: 0,
    moonY: 1,
    moonZ: 0,
    moonIllum: 0.5,
    moonUp: 0,
    turbidity: 2.3,
    desat: 0,
    overcast: 0,
    cityGlow: 0,
    cityFocus: 0.5,
    cityDirX: 0,
    cityDirZ: 1
  };

  const sampleColor = new THREE.Color();
  const radianceBuf = [0, 0, 0];
  const galacticWorld = new THREE.Vector3();
  const starQuat = new THREE.Quaternion();

  /**
   * 取某方向的天空色（线性工作色彩空间），供 main.js 设置雾色 / 环境光。
   *
   * 注意：返回的是**内部复用实例**，调用方请 `copy()` 后再保存。
   * 亮度做了软压缩（超过 1.0 后取对数增长），避免夕阳附近的极高辐亮度
   * 直接当雾色导致远景过曝。
   *
   * @param {{x:number,y:number,z:number}} direction 视线方向（不必归一化）
   * @returns {THREE.Color} 该方向天空色
   */
  function getSkyColorAt(direction) {
    let x = 0;
    let y = 1;
    let z = 0;
    if (direction) {
      x = direction.x || 0;
      y = direction.y || 0;
      z = direction.z || 0;
    }
    const len = Math.hypot(x, y, z);
    if (len > 1e-6) {
      x /= len;
      y /= len;
      z /= len;
    } else {
      x = 0;
      y = 1;
      z = 0;
    }

    skyRadiance(x, y, z, state, radianceBuf);

    const m = Math.max(radianceBuf[0], radianceBuf[1], radianceBuf[2]);
    const k = m > 1 ? (1 + Math.log(m)) / m : 1;
    sampleColor.setRGB(
      Math.max(0, radianceBuf[0] * k),
      Math.max(0, radianceBuf[1] * k),
      Math.max(0, radianceBuf[2] * k)
    );
    return sampleColor;
  }

  /**
   * 每帧更新：天穹跟随相机、写入 uniforms、推进星空周日旋转。
   * @param {Object} ctx FrameContext（契约 §2）
   */
  function update(ctx) {
    if (!ctx) return;
    const cam = ctx.camera;
    if (cam) root.position.copy(cam.position);

    const wp = ctx.weather && ctx.weather.params ? ctx.weather.params : null;
    const turbidity = wp && Number.isFinite(wp.skyTurbidity) ? clamp(wp.skyTurbidity, 1, 12) : 2.3;
    const cloud = wp && Number.isFinite(wp.cloudCover) ? clamp(wp.cloudCover, 0, 1) : 0;
    const fogDensity = wp && Number.isFinite(wp.fogDensity) ? Math.max(wp.fogDensity, 0) : 0.00016;
    const night = clamp(ctx.nightFactor || 0, 0, 1);

    const sun = ctx.sun || {};
    const sunDir = sun.direction;
    if (sunDir) domeUniforms.uSunDir.value.copy(sunDir).normalize();
    const sunElev = Number.isFinite(sun.elevationDeg) ? sun.elevationDeg : 0;
    domeUniforms.uSunElevDeg.value = sunElev;

    const moon = ctx.moon || {};
    if (moon.direction) domeUniforms.uMoonDir.value.copy(moon.direction).normalize();
    const moonIllum = clamp(Number.isFinite(moon.illumination) ? moon.illumination : 0.5, 0, 1);
    const moonUp = smoothstep(-3.5, 6, Number.isFinite(moon.elevationDeg) ? moon.elevationDeg : -90);
    domeUniforms.uMoonIllum.value = moonIllum;
    domeUniforms.uMoonUp.value = moonUp;

    domeUniforms.uTurbidity.value = turbidity;
    domeUniforms.uNight.value = night;

    // 阴雨天灰白化：云量 + 浑浊度共同压低饱和度；云量同时整体压暗天光
    const desat = clamp(cloud * 0.34 + (turbidity - 2) * 0.045, 0, 0.6);
    const overcast = clamp(cloud * 0.9 + (wp && Number.isFinite(wp.cloudDarkness) ? wp.cloudDarkness * 0.2 : 0), 0, 1);
    domeUniforms.uDesat.value = desat;
    domeUniforms.uOvercast.value = overcast;
    // 厚云遮日：日盘几乎消失，只剩弥散亮斑（真正的云体由 sculpt/clouds.js 绘制）
    domeUniforms.uSunDiscGain.value = clamp(1 - cloud * 0.9, 0.06, 1);
    // 与场景雾一致：雾/雨天地平线大幅融入雾色
    domeUniforms.uFogBlend.value = clamp(cloud * 0.3 + fogDensity * 190, 0, 0.92);

    if (ctx.scene && ctx.scene.fog && ctx.scene.fog.color) {
      domeUniforms.uFogColor.value.copy(ctx.scene.fog.color);
    }

    // 城市光污染：夜间随云量增强（云底把灯光反射回来）
    const cityGlowAmount = night * (0.62 + 0.55 * cloud);
    domeUniforms.uCityGlow.value = cityGlowAmount;
    let cdx = 0;
    let cdz = 1;
    let focus = 0;
    if (cam) {
      const dx = -cam.position.x;
      const dz = -cam.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1e-3) {
        cdx = dx / dist;
        cdz = dz / dist;
      }
      focus = smoothstep(350, 2600, dist);
    }
    domeUniforms.uCityDir.value.set(cdx, 0, cdz);
    domeUniforms.uCityFocus.value = focus;

    // 星空：随 nightFactor 与太阳沉降深度渐显（民用曙暮光 −6°、天文曙暮光 −18°），
    // 再被云、雾、月光冲淡
    const starFade =
      night *
      smoothstep(-2, -11, sunElev) *
      (1 - cloud * 0.88) *
      (1 - clamp(fogDensity * 230, 0, 0.9)) *
      (1 - 0.45 * moonIllum * moonUp);
    domeUniforms.uMilkyWay.value = clamp(starFade * 1.1, 0, 1);
    starUniforms.uFade.value = clamp(starFade, 0, 1);
    starUniforms.uTime.value = ctx.elapsed || 0;
    if (ctx.renderer && typeof ctx.renderer.getPixelRatio === 'function') {
      starUniforms.uPixel.value = ctx.renderer.getPixelRatio();
    }
    stars.visible = starFade > 0.004;

    // 周日旋转：天球绕北天极转动，一恒星日一圈（366.2422 圈 / 回归年）
    const dayOfYear = Number.isFinite(ctx.dayOfYear) ? ctx.dayOfYear : 172;
    const simHours = Number.isFinite(ctx.simHours) ? ctx.simHours : 12;
    const turns = (dayOfYear + simHours / 24) * SIDEREAL_RATIO;
    const theta = (turns - Math.floor(turns)) * TWO_PI;
    // 负号：使恒星东升西落（与太阳同向）
    starQuat.setFromAxisAngle(CELESTIAL_POLE, -theta);
    stars.quaternion.copy(starQuat);
    galacticWorld.copy(GALACTIC_POLE_LOCAL).applyQuaternion(starQuat);
    domeUniforms.uGalacticPole.value.copy(galacticWorld);

    // 同步 CPU 状态，供 getSkyColorAt 使用
    const sd = domeUniforms.uSunDir.value;
    state.sunX = sd.x;
    state.sunY = sd.y;
    state.sunZ = sd.z;
    state.sunElevDeg = sunElev;
    const md = domeUniforms.uMoonDir.value;
    state.moonX = md.x;
    state.moonY = md.y;
    state.moonZ = md.z;
    state.moonIllum = moonIllum;
    state.moonUp = moonUp;
    state.turbidity = turbidity;
    state.desat = desat;
    state.overcast = overcast;
    state.cityGlow = cityGlowAmount;
    state.cityFocus = focus;
    state.cityDirX = cdx;
    state.cityDirZ = cdz;
  }

  /** 释放自建的几何 / 材质（无外部贴图依赖） */
  function dispose() {
    root.clear();
    domeGeo.dispose();
    domeMat.dispose();
    starGeo.dispose();
    starMat.dispose();
  }

  // 说明：state 的初值直接取自 domeUniforms 的默认午后太阳，
  // 保证 main.js 在首帧 update 之前生成环境贴图 / 取雾色时不会得到黑色。
  return {
    object3D: root,
    update,
    dispose,
    getSkyColorAt,
    stats: { draws: 2, stars: starCount }
  };
}
