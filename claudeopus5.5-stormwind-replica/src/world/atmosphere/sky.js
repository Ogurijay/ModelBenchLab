// 天穹 + 昼夜色板。
// 关键约定：天空 ShaderMaterial 不做色调映射，只做 linear→sRGB；three 的雾在 colorspace 之后混合、
// 雾色也按输出色彩空间上传——所以「天空地平线颜色 == scene.fog.color」时远景能无缝融进天空。
import * as THREE from 'three';

// ---------- 色板关键帧（按太阳高度 sunY = sin(仰角)）----------
// 颜色用 sRGB 十六进制书写，Color.setHex 会转到线性工作空间。
const SKY_KEYS = [
  { y: -0.32, zenith: 0x040814, horizon: 0x0d1630, glow: 0x000000, glowK: 0.0, cloud: 0x0e1426 },
  { y: -0.16, zenith: 0x0a1230, horizon: 0x232a52, glow: 0x4a2a52, glowK: 0.5, cloud: 0x1c2038 },
  { y: -0.05, zenith: 0x1e2c64, horizon: 0xa86a7a, glow: 0xff6a48, glowK: 1.0, cloud: 0x8a5a6a },
  { y: 0.03, zenith: 0x3a5ea8, horizon: 0xf0a070, glow: 0xffa050, glowK: 1.0, cloud: 0xf4b890 },
  { y: 0.16, zenith: 0x3672c8, horizon: 0xb8cce0, glow: 0xffd8a0, glowK: 0.45, cloud: 0xfff0dc },
  { y: 0.42, zenith: 0x2a66c8, horizon: 0xa2c4ec, glow: 0xfff0d8, glowK: 0.18, cloud: 0xffffff },
  { y: 1.0, zenith: 0x2862c6, horizon: 0x9ec0ea, glow: 0xfff0d8, glowK: 0.15, cloud: 0xffffff },
];
// 太阳直射光：颜色 + 相对强度（乘 settings.sunIntensity）
const SUN_KEYS = [
  { y: -0.03, color: 0xff6a30, k: 0.0 },
  { y: 0.0, color: 0xff7a3a, k: 0.08 },
  { y: 0.08, color: 0xffa060, k: 0.5 },
  { y: 0.22, color: 0xffd4a0, k: 0.85 },
  { y: 0.5, color: 0xfff0da, k: 1.0 },
  { y: 1.0, color: 0xfff4e4, k: 1.0 },
];
// 半球光（天光）：天色 / 地面反光 / 相对强度
const HEMI_KEYS = [
  // 夜：天色 / 地面色都取冷蓝且接近 → 立面拿到的和地面差不多，不再"地面像积雪、墙面全黑"
  { y: -0.32, sky: 0x3c4a78, ground: 0x323d5c, k: 0.85 },
  { y: -0.1, sky: 0x5a5e98, ground: 0x2e2834, k: 0.7 },
  { y: 0.02, sky: 0xc8a49a, ground: 0x5a4430, k: 0.74 },
  // 地面色压暗：白石墙朝下 / 背光面要和受光面拉开明度差（Critic R1：白石叠白石层次塌掉）
  // Critic R3：背光白石被天光染成冷紫灰 → 天光色降饱和（中性略冷）、强度降一点；地面色改成黄褐暖反弹
  { y: 0.2, sky: 0xc8ccd2, ground: 0x6a5434, k: 0.74 },
  { y: 1.0, sky: 0xd0d4d8, ground: 0x6c5636, k: 0.76 },
];

function prepKeys(keys) {
  return keys.map((k) => {
    const o = { y: k.y };
    for (const [n, v] of Object.entries(k)) o[n] = n === 'y' || typeof v !== 'number' || n.endsWith('K') || n === 'k' ? v : new THREE.Color().setHex(v);
    return o;
  });
}
const SKY = prepKeys(SKY_KEYS);
const SUN = prepKeys(SUN_KEYS);
const HEMI = prepKeys(HEMI_KEYS);

// 在关键帧之间插值，结果写进 out（同名字段：Color 用 lerpColors，数字线性插值）
function sample(keys, y, out) {
  let i = 0;
  while (i < keys.length - 2 && y > keys[i + 1].y) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = THREE.MathUtils.clamp((y - a.y) / (b.y - a.y), 0, 1);
  const s = t * t * (3 - 2 * t);
  for (const n of Object.keys(a)) {
    if (n === 'y') continue;
    if (a[n].isColor) (out[n] ||= new THREE.Color()).lerpColors(a[n], b[n], s);
    else out[n] = a[n] + (b[n] - a[n]) * s;
  }
  return out;
}

// ---------- 太阳 / 月亮轨道 ----------
// hour 6 时太阳在正东（+X）升起，18 时在正西落下；正午在南（+Z）方，高度 60°。
const TILT = THREE.MathUtils.degToRad(60);
export function celestial(hour, out) {
  const th = ((hour - 6) / 12) * Math.PI;
  out.sunDir.set(Math.cos(th), Math.sin(th) * Math.sin(TILT), Math.sin(th) * Math.cos(TILT)).normalize();
  // 月亮：大致与太阳相对，略偏北，避免和太阳严格共线
  out.moonDir.set(-out.sunDir.x * 0.9, -out.sunDir.y, -out.sunDir.z * 0.6 - 0.35).normalize();
  const y = out.sunDir.y;
  // night：太阳仰角 sin 从 0.04 降到 -0.2 时 0 → 1
  const t = THREE.MathUtils.clamp((0.04 - y) / 0.24, 0, 1);
  out.night = t * t * (3 - 2 * t);
  sample(SKY, y, out.sky);
  sample(SUN, y, out.sun);
  sample(HEMI, y, out.hemi);
  return out;
}

export function makeCelestialState() {
  return { sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), night: 0, sky: {}, sun: {}, hemi: {} };
}

// ---------- 天空着色器 ----------
const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uGlow;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uGlowK;
uniform float uNight;
uniform float uTime;
uniform float uSunVis;
uniform float uCloud;
uniform float uInvTone;
uniform float uEnvDesat;
uniform float uExposure;
uniform mat3 uInvIn;
uniform mat3 uInvOut;
varying vec3 vDir;

// ACES（three 的 ACESFilmicToneMapping）的逆：主循环走 EffectComposer，OutputPass 会对整幅画面做色调映射，
// 天空也逃不掉——不预先取逆，钴蓝天顶会被 ACES 压成灰紫。这里让天空最终显示 == 色板里写的颜色。
float invRRT(float y) {
  float A = y * 0.983729 - 1.0;
  float B = y * 0.4329510 - 0.0245786;
  float C = y * 0.238081 + 0.000090537;
  return (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
}
vec3 invACES(vec3 t) {
  vec3 v = max(uInvOut * clamp(t, 0.0, 0.97), 0.0);
  v = vec3(invRRT(v.r), invRRT(v.g), invRRT(v.b));
  return max(uInvIn * v, 0.0) / (uExposure / 0.6);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float hy = max(y, 0.0);
  float hz = pow(1.0 - hy, 5.0);
  vec3 col = mix(uZenith, uHorizon, hz);

  // 太阳一侧的散射辉光（黄昏时最强）
  float sd = dot(d, uSunDir);
  float sdp = max(sd, 0.0);
  col += uGlow * uGlowK * (pow(sdp, 6.0) * (0.3 + 0.7 * hz) + 0.22 * pow(sdp, 1.5) * hz);

  // 云带：把视线投到一张高空平面上
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.08) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv * 1.1);
    float c = smoothstep(0.52, 0.82, n) * uCloud * smoothstep(0.0, 0.12, y) * (1.0 - 0.5 * smoothstep(0.5, 0.95, y));
    vec3 cc = uCloudColor * (0.82 + 0.3 * n) + uGlow * uGlowK * 0.6 * pow(sdp, 4.0);
    col = mix(col, cc, c * 0.85);
  }

  // 星空（只在一个网格单元里放一颗星，星半径小于单元边距，不会被截断）
  if (uNight > 0.01) {
    vec3 p = d * 140.0;
    vec3 c = floor(p);
    vec3 f = fract(p);
    float h = hash13(c);
    if (h > 0.982) {
      vec3 sp = hash33(c) * 0.5 + 0.25;
      float b = (h - 0.982) / 0.018;
      float tw = 0.7 + 0.3 * sin(uTime * (1.5 + b * 4.0) + h * 300.0);
      float star = smoothstep(0.16, 0.0, length(f - sp)) * (0.35 + 1.4 * b * b) * tw;
      vec3 sc = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash13(c + 7.0));
      col += sc * star * uNight * smoothstep(0.03, 0.25, y);
    }
    // 淡淡的银河带
    float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.25, -0.9))) * 3.2, 2.0));
    col += vec3(0.10, 0.11, 0.18) * band * fbm(d.xz * 6.0 + d.y * 3.0) * uNight * smoothstep(0.05, 0.4, y);
  }

  // 月亮：圆盘 + 环形山 + 光晕
  float md = dot(d, uMoonDir);
  if (uNight > 0.01 && md > 0.9) {
    vec3 mu = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 mv = cross(mu, uMoonDir);
    vec2 mp = vec2(dot(d, mu), dot(d, mv)) / 0.03;
    float r = length(mp);
    float disk = smoothstep(1.0, 0.94, r);
    float crater = fbm(mp * 2.2 + 3.0);
    vec3 mcol = vec3(0.92, 0.94, 1.0) * (0.75 + 0.35 * crater) * (1.0 - 0.25 * r * r);
    col = mix(col, mcol * 1.25, disk * uNight);
    col += vec3(0.35, 0.42, 0.6) * (pow(max(md, 0.0), 900.0) * 0.5 + pow(max(md, 0.0), 60.0) * 0.08) * uNight;
  }

  // 太阳圆盘 + 光晕：单独算，放到 ACES 逆变换之后再加（逆变换会把 >0.97 的亮色截断成偏紫的色块——Critic R5 的"紫色光斑"）
  float horizonCut = smoothstep(-0.01, 0.02, y);
  vec3 sunAdd = uSunColor * uSunVis * horizonCut * (smoothstep(0.99955, 0.99972, sd) * 6.0 + pow(sdp, 1600.0) * 0.8);
  col += uSunColor * uSunVis * pow(sdp, 80.0) * 0.12; // 宽光晕仍在色板空间里

  // 地平线以下：渐变到雾色（远景地形在雾里正好接上）
  col = mix(col, uFog, smoothstep(0.02, -0.06, y));

  // 环境贴图用：降饱和 + 微暖，让 IBL 给暗部的是中性暖灰而不是天蓝
  if (uEnvDesat > 0.0) {
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(l) * vec3(1.06, 1.0, 0.9), uEnvDesat);
  }
  if (uInvTone > 0.5) col = invACES(col);
  col += sunAdd * (uInvTone > 0.5 ? 4.0 : 1.0); // HDR：交给 OutputPass 的 ACES 压成暖白
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// ---- ACES 逆变换（CPU 版，给雾色用：雾在色调映射之前混合）----
const ACES_IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777);
const ACES_OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);
const INV_IN = ACES_IN.clone().invert();
const INV_OUT = ACES_OUT.clone().invert();
const _v3 = new THREE.Vector3();
function invRRT(y) {
  const A = y * 0.983729 - 1;
  const B = y * 0.432951 - 0.0245786;
  const C = y * 0.238081 + 0.000090537;
  return (-B - Math.sqrt(Math.max(B * B - 4 * A * C, 0))) / (2 * A);
}
export function invACES(color, exposure, out = color) {
  _v3.set(Math.min(color.r, 0.97), Math.min(color.g, 0.97), Math.min(color.b, 0.97)).applyMatrix3(INV_OUT);
  _v3.set(invRRT(Math.max(_v3.x, 0)), invRRT(Math.max(_v3.y, 0)), invRRT(Math.max(_v3.z, 0))).applyMatrix3(INV_IN);
  const k = 0.6 / exposure;
  return out.setRGB(Math.max(_v3.x, 0) * k, Math.max(_v3.y, 0) * k, Math.max(_v3.z, 0) * k);
}

export function createSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uCloudColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uGlowK: { value: 0 },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uSunVis: { value: 1 },
    uCloud: { value: 0.55 },
    uInvTone: { value: 1 },
    uEnvDesat: { value: 0 },
    uExposure: { value: 1 },
    uInvIn: { value: INV_IN },
    uInvOut: { value: INV_OUT },
  };
  const material = new THREE.ShaderMaterial({
    name: 'atmo-sky',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.setScalar(3000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky-dome';
  mesh.userData.noShadow = true;
  const sky = { mesh, material, uniforms, geo, rtPath: true };
  // 画到离屏目标（EffectComposer）时，最后由 OutputPass 统一做 ACES → 天空需要取逆；直接上屏时不取逆
  mesh.onBeforeRender = (renderer) => {
    sky.rtPath = renderer.getRenderTarget() !== null && renderer.toneMapping !== THREE.NoToneMapping;
    uniforms.uInvTone.value = sky.rtPath ? 1 : 0;
    uniforms.uEnvDesat.value = 0;
    uniforms.uExposure.value = renderer.toneMappingExposure;
  };
  return sky;
}

// 把色板状态写进天空 uniforms，并返回雾色（= 地平线色 + 少量辉光）
export function applySky(sky, st, fogColor, time) {
  const u = sky.uniforms;
  u.uZenith.value.copy(st.sky.zenith);
  u.uHorizon.value.copy(st.sky.horizon);
  u.uGlow.value.copy(st.sky.glow);
  u.uGlowK.value = st.sky.glowK;
  u.uCloudColor.value.copy(st.sky.cloud);
  u.uSunDir.value.copy(st.sunDir);
  u.uMoonDir.value.copy(st.moonDir);
  u.uNight.value = st.night;
  u.uTime.value = time;
  u.uSunColor.value.copy(st.sun.color).multiplyScalar(1.0);
  u.uSunVis.value = THREE.MathUtils.smoothstep(st.sunDir.y, -0.04, 0.02);
  fogColor.copy(st.sky.horizon).lerp(st.sky.glow, 0.12 * st.sky.glowK);
  u.uFog.value.copy(fogColor);
  return fogColor;
}
