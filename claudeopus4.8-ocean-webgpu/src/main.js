/**
 * 实时海面模拟 — Three.js WebGLRenderer + GLSL ShaderMaterial
 * ------------------------------------------------------------------
 * 海面整套运算跑在 GPU 着色器里（与 CPU 逐顶点 for 循环不同）：
 *   · Gerstner 多波叠加位移      → 顶点着色器
 *   · 逐像素解析 Gerstner 法线   → 片元着色器（含全部谱波，水面细节锐利）
 *   · 菲涅尔 / 天空+太阳反照 / 海沫 / 雾 → 片元着色器
 * 海盗船用标准 PBR 材质 + 由天空生成的 PMREM 环境贴图 → 真实物理光照反射。
 *
 * 特性：
 *   · 波谱由「风速」按深水重力波 L ∝ v²/g 物理驱动，风越大浪越长越高（且饱和）；
 *   · 波参数走 uniform 数组（vec4[16]），改风/改向/改浪高只更新数值，不重编译着色器；
 *   · 陡度走「预算」：baseQ 使 Σ baseQ·k·A = 1，实时 uChop∈[0,1] 再缩放 → 永不自交；
 *   · 宽方向散布 + 交叉涌浪 + 对数非谐波谱 + 低频域扭曲 → 自然不规整海面；
 *   · 风向 / 日照方位控制、蒲福海况读数、高频微法线波光；
 *   · 🏴‍☠️ 自建海盗船（Blender），CPU 复算 Gerstner 浮力，随浪起伏纵摇横摇。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import shipUrl from '../assets/pirate-ship.glb?url';
import './styles.css';

/* ----------------------------- DOM ----------------------------- */
const viewport = document.querySelector('#viewport');
const loading = document.querySelector('#loading');
const gpuStatus = document.querySelector('#gpuStatus');
const statusText = document.querySelector('#statusText');
const statusDot = document.querySelector('#statusDot');
const fpsLabel = document.querySelector('#fps');
const vertCountLabel = document.querySelector('#vertCount');
const seaStateLabel = document.querySelector('#seaState');

const ui = {
  wind: document.querySelector('#wind'),
  windDir: document.querySelector('#windDir'),
  height: document.querySelector('#height'),
  chop: document.querySelector('#chop'),
  foam: document.querySelector('#foam'),
  sun: document.querySelector('#sun'),
  sunAz: document.querySelector('#sunAz'),
  windValue: document.querySelector('#windValue'),
  windDirValue: document.querySelector('#windDirValue'),
  heightValue: document.querySelector('#heightValue'),
  chopValue: document.querySelector('#chopValue'),
  foamValue: document.querySelector('#foamValue'),
  sunValue: document.querySelector('#sunValue'),
  sunAzValue: document.querySelector('#sunAzValue'),
  pause: document.querySelector('#pause'),
  reset: document.querySelector('#reset'),
  regen: document.querySelector('#regen')
};

/* --------------------------- 参数 --------------------------- */
const params = {
  windSpeed: Number(ui.wind.value),       // 风速 m/s —— 物理驱动波谱
  windDir: Number(ui.windDir.value),      // 风向角度
  waveScale: Number(ui.height.value),     // 浪高比例（整体振幅微调）
  chop: Number(ui.chop.value),            // 陡度（0..1 预算占比，实时）
  foam: Number(ui.foam.value),            // 海沫强度
  sunElevation: Number(ui.sun.value),     // 太阳高度角
  sunAzimuth: Number(ui.sunAz.value),     // 太阳方位角
  paused: false
};

/* --------------------------- 波谱（uniform 数组，随风实时重填） --------------------------- */
const GRAVITY = 9.81;
const N_WAVES = 16;                             // 固定波数：谱在 JS 端按风参数填进 uniform 数组

// 每个 Gerstner 波打包成两个 vec4：
//   waveA = (dirX, dirZ, k, omega)      waveB = (amplitude, phase, baseQ, _)
const waveA = Array.from({ length: N_WAVES }, () => new THREE.Vector4());
const waveB = Array.from({ length: N_WAVES }, () => new THREE.Vector4());

// 共享 uniform：太阳方向被海面与天空两套材质复用（同一引用 → 改一处两边生效）
const uSunDir = { value: new THREE.Vector3() };
const oceanUniforms = {
  uTime: { value: 0 },
  uChop: { value: params.chop },
  uFoam: { value: params.foam },
  uTotalAmp: { value: 0.001 },
  uWarp: { value: 0 },
  uWaveCount: { value: N_WAVES },
  uWaveA: { value: waveA },
  uWaveB: { value: waveB },
  uSunDir
};
const skyUniforms = { uSunDir };

/* --------------------------- 海盗船 --------------------------- */
let ship = null;                                 // GLTF 根节点
let sunLight = null;                             // 方向光（照亮船并投影，方向跟随太阳）
let shipBlob = null;                             // 船底接触阴影（贴海面的暗斑）
const SHIP_POS = new THREE.Vector2(6, -4);       // 船在海面的水平位置 (x, z)
const SHIP_SCALE = 1.35;                         // 整体缩放
const SHIP_HEADING = THREE.MathUtils.degToRad(125); // 船首朝向（绕 Y）—— 对默认机位呈 3/4 侧舷
const SHIP_DRAFT = 1.7;                           // 吃水：模型该高度对齐水面（米·模型单位）

// 确定性伪随机（mulberry32）：同一种子 → 同一片海，可复现
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let waveSeed = 1;

// 蒲福海况分级
const SEA_STATES = [
  { max: 0.5, text: '无风镜面' },
  { max: 3.4, text: '轻风微波' },
  { max: 8.0, text: '和风小浪' },
  { max: 13.8, text: '强风中浪' },
  { max: 20.8, text: '大风巨浪' },
  { max: 28.5, text: '狂风怒涛' },
  { max: Infinity, text: '飓风骇浪' }
];

function updateSeaState() {
  const v = Math.max(0, params.windSpeed);
  let level = SEA_STATES.length - 1;
  for (let i = 0; i < SEA_STATES.length; i++) {
    if (v <= SEA_STATES[i].max) { level = i; break; }
  }
  if (seaStateLabel) seaStateLabel.textContent = `${level} 级 · ${SEA_STATES[level].text}`;
}

/**
 * 按当前风参数 + 种子重填波谱（只更新 uniform 数值）。
 *   · 主波长由风速决定 L ∝ v²/g；其余波对数分布 + 强抖动跨越 [主波长, 2.2m]；
 *   · 方向宽散布（三次方权重向主向集中）+ 约 30% 跟随次涌浪向 → 短峰交叉浪；
 *   · 相对振幅按波长加权，整体归一到随风速增长但饱和的目标总振幅；
 *   · 陡度满预算 Σ baseQ·k·A = 1，实时 uChop 再缩放。
 */
function rebuildWaves() {
  const rng = mulberry32(waveSeed);
  const windRad = THREE.MathUtils.degToRad(params.windDir);
  const dominant = THREE.MathUtils.clamp(
    (0.7 * params.windSpeed * params.windSpeed * 2 * Math.PI) / GRAVITY, 8, 320
  );
  const LMIN = 2.2;
  const swellDir = windRad + (rng() < 0.5 ? 1 : -1) * (0.7 + rng() * 0.7);

  const tmp = [];
  let totalRel = 0;
  for (let i = 0; i < N_WAVES; i++) {
    const t = (i + rng()) / N_WAVES;
    const wavelength = dominant * Math.pow(LMIN / dominant, t) * (0.8 + rng() * 0.4);
    const k = (Math.PI * 2) / wavelength;
    const omega = Math.sqrt(GRAVITY * k);
    const phase = rng() * Math.PI * 2;
    const base = rng() < 0.30 ? swellDir : windRad;
    const s = rng() * 2 - 1;
    const angle = base + s * Math.abs(s) * 1.15;                // 最大 ~±66°
    const relAmp = Math.pow(wavelength, 0.72) * (0.55 + rng() * 0.7);
    tmp.push({ dx: Math.cos(angle), dz: Math.sin(angle), k, omega, phase, relAmp });
    totalRel += relAmp;
  }

  const sea = Math.min(1, params.windSpeed / 24);
  const target = (1.1 + 3.3 * sea) * params.waveScale;
  let totalAmp = 0;
  let budget = 0;
  const amps = tmp.map((w) => {
    const amp = (w.relAmp / totalRel) * target;
    totalAmp += amp;
    budget += w.k * amp;
    return amp;
  });
  const baseQ = budget > 0 ? 1 / budget : 0;                    // Σ baseQ·k·A = 1

  tmp.forEach((w, i) => {
    waveA[i].set(w.dx, w.dz, w.k, w.omega);
    waveB[i].set(amps[i], w.phase, baseQ, 0);
  });
  oceanUniforms.uWarp.value = dominant * 0.03;
  oceanUniforms.uTotalAmp.value = Math.max(totalAmp, 0.001);
  updateSeaState();
}

/* ----------------------------- GLSL 片段 ----------------------------- */
// 值噪声（hash + 双线性平滑），用于域扭曲 / 微法线 / 泡沫
const NOISE_GLSL = /* glsl */`
  float hash21(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float snoise2(vec2 p){ return vnoise(p) * 2.0 - 1.0; }
  // 线性 → sRGB（手动做色彩管理，与标准材质的船保持一致；ShaderMaterial 不走 three 自动色管）
  vec3 lin2srgb(vec3 c){
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
`;

// 天空 + 太阳颜色（海面反射与天空穹顶共用 → 镜面里的太阳与天空一致）。依赖已声明的 uSunDir。
const SKY_GLSL = /* glsl */`
  vec3 skyColor(vec3 dir){
    vec3 d = normalize(dir);
    float t = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizon = vec3(0.62, 0.70, 0.78);
    vec3 zenith  = vec3(0.05, 0.15, 0.30);
    vec3 base = mix(horizon, zenith, smoothstep(0.0, 0.55, t));
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    float glow = pow(sd, 90.0) * 2.6 + pow(sd, 14.0) * 0.35;     // 太阳本体 + 大气辉光
    return base + vec3(1.0, 0.82, 0.56) * glow;
  }
`;

// Gerstner 场：一次循环算位移 + 解析法线 + 浪尖挤压量（含低频域扭曲）。依赖波组 uniform。
const GERSTNER_GLSL = /* glsl */`
  void gerstner(vec2 coord, out vec3 offset, out vec3 nrm, out float crest){
    // 低频域扭曲：把笔直平行的波峰揉成自然蜿蜒的浪线（局部近似平移，不打碎波形）
    vec2 wob = vec2(
      snoise2(coord * 0.013 + vec2(uTime * 0.04, 0.0)),
      snoise2(coord * 0.013 + vec2(7.1, 2.4) + vec2(0.0, uTime * 0.04))
    );
    vec2 wc = coord + wob * uWarp;
    vec3 d = vec3(0.0);
    vec3 n = vec3(0.0);
    float cr = 0.0;
    for (int i = 0; i < MAX_WAVES; i++){
      if (i >= uWaveCount) break;
      vec4 A = uWaveA[i];      // dirX, dirZ, k, omega
      vec4 B = uWaveB[i];      // amp, phase, baseQ, _
      vec2 dir = A.xy;
      float k = A.z, om = A.w;
      float amp = B.x, ph = B.y, q = B.z * uChop;
      float f = dot(dir, wc) * k + uTime * om + ph;
      float c = cos(f), s = sin(f);
      d.x += q * amp * dir.x * c;       // Gerstner 横向收拢 → 尖峰平谷
      d.z += q * amp * dir.y * c;
      d.y += amp * s;                   // 垂直起伏
      n.x += dir.x * k * amp * c;       // 解析法线（GPU Gems）
      n.z += dir.y * k * amp * c;
      n.y += q * k * amp * s;
      cr += q * k * amp * s;            // 浪尖挤压量 → 驱动泡沫
    }
    offset = d;
    nrm = normalize(vec3(-n.x, max(1.0 - n.y, 0.02), -n.z));
    crest = cr;
  }
`;

const OCEAN_VERT = /* glsl */`
  #define MAX_WAVES ${N_WAVES}
  uniform float uTime, uChop, uWarp;
  uniform int uWaveCount;
  uniform vec4 uWaveA[MAX_WAVES];
  uniform vec4 uWaveB[MAX_WAVES];
  varying vec2 vRef;
  ${NOISE_GLSL}
  ${GERSTNER_GLSL}
  void main(){
    vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;   // plane 已 rotateX → base.xz 为水平参考坐标
    vec2 ref = base.xz;
    vec3 offset; vec3 nrm; float crest;
    gerstner(ref, offset, nrm, crest);
    vec3 displaced = base + offset;
    vRef = ref;
    gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  }
`;

const OCEAN_FRAG = /* glsl */`
  precision highp float;
  #define MAX_WAVES ${N_WAVES}
  uniform float uTime, uChop, uWarp, uFoam, uTotalAmp;
  uniform int uWaveCount;
  uniform vec4 uWaveA[MAX_WAVES];
  uniform vec4 uWaveB[MAX_WAVES];
  uniform vec3 uSunDir;
  varying vec2 vRef;
  ${NOISE_GLSL}
  ${SKY_GLSL}
  ${GERSTNER_GLSL}
  void main(){
    vec3 offset; vec3 nrm; float crest;
    gerstner(vRef, offset, nrm, crest);                    // 逐像素重算 → 法线含全部谱波，锐利
    vec3 worldPos = vec3(vRef.x + offset.x, offset.y, vRef.y + offset.z);
    vec3 V = normalize(cameraPosition - worldPos);
    vec3 sunDir = normalize(uSunDir);
    float dist = length(cameraPosition - worldPos);

    // 高频微法线波光，近强远弱随距离淡出避免远处闪烁噪点
    float ripStrength = (1.0 - smoothstep(36.0, 220.0, dist)) * 0.07;
    float rx = snoise2(worldPos.xz * 0.32 + vec2(uTime * 0.45, 0.0));
    float rz = snoise2(worldPos.xz * 0.32 + vec2(31.4, 17.7) + vec2(0.0, uTime * 0.45));
    vec3 N = normalize(nrm + vec3(rx, 0.0, rz) * ripStrength);

    float fres = pow(clamp(1.0 - max(dot(N, V), 0.0), 0.0, 1.0), 5.0) * 0.96 + 0.04;

    float hN = clamp(worldPos.y / uTotalAmp * 0.5 + 0.5, 0.0, 1.0);
    vec3 water = mix(vec3(0.004, 0.045, 0.095), vec3(0.02, 0.20, 0.27), hN);

    vec3 R = reflect(-V, N); R.y = abs(R.y);               // 反射压在海平面以上
    vec3 sky = skyColor(R);

    float sss = max(worldPos.y, 0.0) / uTotalAmp * (max(dot(V, -sunDir), 0.0) + 0.25) * 0.6;
    vec3 color = mix(water, sky, fres) + vec3(0.04, 0.32, 0.26) * sss;

    vec3 H = normalize(sunDir + V);                         // 紧致镜面高光（太阳波光）
    color += vec3(1.0, 0.88, 0.66) * pow(max(dot(N, H), 0.0), 220.0) * 1.5;

    // 湍流泡沫：浪尖挤压量/高度/陡坡定位置，流动噪声切成不规则斑块
    float turb = vnoise(worldPos.xz * 0.045 + vec2(uTime * 0.08, uTime * 0.05));
    float fine = vnoise(worldPos.xz * 0.153 + vec2(-uTime * 0.11, uTime * 0.09));
    float crestF = clamp(crest, 0.0, 1.0);
    float heightF = smoothstep(0.55, 0.96, hN);
    float steepF = (1.0 - smoothstep(0.12, 0.5, N.y)) * 0.7; // N.y 小（陡坡）→ 起沫
    float wF = clamp(crestF + heightF * 0.6 + steepF, 0.0, 1.0);
    float foamPatch = smoothstep(0.5, 0.95, wF * 0.55 + turb * 0.6);
    float foam = clamp(foamPatch * (fine * 0.6 + 0.4), 0.0, 1.0) * uFoam;
    color = mix(color, vec3(0.9, 0.95, 0.98), foam);

    color = mix(color, vec3(0.42, 0.52, 0.62), smoothstep(160.0, 760.0, dist) * 0.9); // 距离雾

    gl_FragColor = vec4(lin2srgb(color), 1.0);
  }
`;

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main(){
    vDir = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SKY_GLSL}
  void main(){
    gl_FragColor = vec4(lin2srgb(skyColor(normalize(vDir))), 1.0);
  }
`;

/* ----------------------------- 入口 ----------------------------- */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

if (!webglAvailable()) {
  showError();
} else {
  try {
    startOcean();
  } catch (err) {
    console.error(err);
    showError(String(err && err.message ? err.message : err));
  }
}

function startOcean() {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 2200);
  const HOME = new THREE.Vector3(-48, 27, 62);
  camera.position.copy(HOME);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05111d, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.minDistance = 22;
  orbit.maxDistance = 320;
  orbit.maxPolarAngle = Math.PI * 0.495; // 不穿到水面以下
  orbit.target.set(0, 2, 0);
  orbit.update();

  // 天空先入场，并据此生成 PMREM 环境贴图供海盗船做物理反射
  const sky = buildSky();
  scene.add(sky);
  updateSun();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(scene, 0, 0.1, 2000);     // 此刻 scene 只有天空 → 纯天空环境
  scene.environment = envRT.texture;
  pmrem.dispose();

  const ocean = buildOcean();
  scene.add(ocean);

  // 方向光（太阳，投影）+ 半球光（天空↓海面）—— 照亮并给海盗船投影；海面/天空是自定义着色
  sunLight = new THREE.DirectionalLight(0xfff2d8, 2.7);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 80;
  sunLight.shadow.camera.far = 620;
  sunLight.shadow.camera.left = -32;
  sunLight.shadow.camera.right = 32;
  sunLight.shadow.camera.top = 36;
  sunLight.shadow.camera.bottom = -28;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.9;          // 缓解低多边形帆/船身的阴影粉刺
  sunLight.target.position.set(SHIP_POS.x, 4, SHIP_POS.y);
  scene.add(sunLight);
  scene.add(sunLight.target);
  scene.add(new THREE.HemisphereLight(0xbcd6e6, 0x0a2433, 0.5));
  updateSun();
  loadShip(scene);
  shipBlob = makeShadowBlob();
  scene.add(shipBlob);

  window.__ocean = { scene, renderer, camera, sunLight, getShip: () => ship };

  const seg = ocean.geometry.parameters.widthSegments;
  vertCountLabel.textContent = `${((seg + 1) * (seg + 1) / 1000).toFixed(0)}k`;

  loading.classList.add('is-hidden');
  statusText.textContent = 'WebGL 渲染中 · 拖拽旋转 · 滚轮缩放';
  gpuStatus.textContent = 'WebGL';

  let last = performance.now();
  let frames = 0;
  let fpsTimer = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!params.paused) oceanUniforms.uTime.value += delta;
    if (ship) updateShip(oceanUniforms.uTime.value);

    orbit.update();
    renderer.render(scene, camera);

    frames += 1;
    fpsTimer += delta;
    if (fpsTimer >= 0.5) {
      fpsLabel.textContent = `${Math.round(frames / fpsTimer)} FPS`;
      frames = 0;
      fpsTimer = 0;
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  ui.reset.addEventListener('click', () => {
    camera.position.copy(HOME);
    orbit.target.set(0, 2, 0);
    orbit.update();
  });

  ui.regen.addEventListener('click', regenerateWaves);
}

/* ----------------------------- 海面 / 天空 / 网格 ----------------------------- */
function buildOceanMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: OCEAN_VERT,
    fragmentShader: OCEAN_FRAG
  });
}

function buildOcean() {
  // 法线逐像素解析（与网格密度无关），可用较低分段数：顶点省、着色细节不减
  const geometry = new THREE.PlaneGeometry(900, 900, 320, 320);
  geometry.rotateX(-Math.PI / 2); // 烘焙旋转：local 即 world 的水平面
  const mesh = new THREE.Mesh(geometry, buildOceanMaterial());
  mesh.frustumCulled = false;
  return mesh;
}

function buildSky() {
  const geometry = new THREE.SphereGeometry(1600, 48, 24);
  const material = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false
  });
  return new THREE.Mesh(geometry, material);
}

// 🎲 重新生成：换一个种子，重填波谱数组
function regenerateWaves() {
  waveSeed = (Math.imul(waveSeed, 1664525) + 1013904223) >>> 0;
  rebuildWaves();
  statusText.textContent = `已生成新的随机波浪 · 种子 #${waveSeed}`;
}

/* ----------------------------- 太阳方向 ----------------------------- */
function updateSun() {
  const el = THREE.MathUtils.degToRad(params.sunElevation);
  const az = THREE.MathUtils.degToRad(params.sunAzimuth);
  uSunDir.value
    .set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
    .normalize();
  if (sunLight) {
    // 方向光从太阳方向照向船（shadow camera 聚焦海盗船）
    sunLight.position.set(
      SHIP_POS.x + uSunDir.value.x * 300,
      4 + uSunDir.value.y * 300,
      SHIP_POS.y + uSunDir.value.z * 300
    );
    sunLight.intensity = 1.3 + 1.6 * Math.max(0.06, Math.sin(el));
  }
}

/* ----------------------------- 海盗船：浮力 + 加载 ----------------------------- */
// CPU 复算 Gerstner 垂直位移（与着色器同一套波组），让船浮在浪上。忽略低频域扭曲（仅水平微扰）。
function sampleWaveY(x, z, t) {
  let y = 0;
  for (let i = 0; i < N_WAVES; i++) {
    const a = waveA[i];   // (dirX, dirZ, k, omega)
    const b = waveB[i];   // (amp, phase, baseQ, _)
    const ph = (a.x * x + a.y * z) * a.z + t * a.w + b.y;
    y += b.x * Math.sin(ph);
  }
  return y;
}

const _xA = new THREE.Vector3(), _yA = new THREE.Vector3(), _zA = new THREE.Vector3();
const _pf = new THREE.Vector3(), _ps = new THREE.Vector3(), _pp = new THREE.Vector3(), _pt = new THREE.Vector3();
const _aL = new THREE.Vector3(), _aB = new THREE.Vector3();
const _basis = new THREE.Matrix4();

// 船首/尾/左/右四点采样浪高：均值定浮沉，四点高差经叉积构造姿态 → 自然纵摇横摇。
function updateShip(t) {
  const L = 9.5 * SHIP_SCALE, B = 3.2 * SHIP_SCALE;
  const fx = Math.cos(SHIP_HEADING), fz = -Math.sin(SHIP_HEADING); // 船首（局部 +X）在世界
  const sx = Math.sin(SHIP_HEADING), sz = Math.cos(SHIP_HEADING);  // 左舷（局部 +Z）在世界
  const px = SHIP_POS.x, pz = SHIP_POS.y;

  const yBow = sampleWaveY(px + fx * L, pz + fz * L, t);
  const yStern = sampleWaveY(px - fx * L, pz - fz * L, t);
  const yPort = sampleWaveY(px + sx * B, pz + sz * B, t);
  const yStar = sampleWaveY(px - sx * B, pz - sz * B, t);
  const h = (yBow + yStern + yPort + yStar) * 0.25;
  ship.position.set(px, h + SHIP_DRAFT * SHIP_SCALE, pz);

  _pf.set(px + fx * L, yBow, pz + fz * L);
  _ps.set(px - fx * L, yStern, pz - fz * L);
  _pp.set(px + sx * B, yPort, pz + sz * B);
  _pt.set(px - sx * B, yStar, pz - sz * B);
  _aL.subVectors(_pf, _ps).normalize();          // 局部 +X（船首）
  _aB.subVectors(_pp, _pt).normalize();           // 局部 +Z（左舷）
  _yA.crossVectors(_aB, _aL).normalize();         // 上
  _zA.crossVectors(_aL, _yA).normalize();         // 重新正交的局部 +Z
  _xA.copy(_aL);
  _basis.makeBasis(_xA, _yA, _zA);
  ship.quaternion.setFromRotationMatrix(_basis);

  if (shipBlob) {
    shipBlob.position.set(px, h + 0.12, pz);   // 接触阴影贴在船底海面，随浪起伏
    shipBlob.rotation.y = SHIP_HEADING;
  }
}

// 船底接触阴影：贴海面的椭圆暗斑（CanvasTexture 径向渐变），让船“坐”进水里
function makeShadowBlob() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0.0, 'rgba(0, 8, 16, 0.5)');
  g.addColorStop(0.55, 'rgba(0, 8, 16, 0.28)');
  g.addColorStop(1.0, 'rgba(0, 8, 16, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(38, 1, 20);          // 椭圆：沿船长更长
  m.renderOrder = 1;
  m.frustumCulled = false;
  return m;
}

function loadShip(scene) {
  new GLTFLoader().load(
    shipUrl,
    (gltf) => {
      ship = gltf.scene;
      ship.scale.setScalar(SHIP_SCALE);
      ship.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          o.castShadow = true;        // 帆/桅杆/船身互相投影 → 立体光影
          o.receiveShadow = true;
          if (o.material) o.material.envMapIntensity = 1.1;   // 强化天空环境反射
        }
      });
      updateShip(oceanUniforms.uTime.value);
      scene.add(ship);
      statusText.textContent = '🏴‍☠️ 海盗船已就位 · 拖拽旋转 · 滚轮缩放';
    },
    undefined,
    (err) => console.error('海盗船加载失败：', err)
  );
}

/* ----------------------------- WebGL 不可用 ----------------------------- */
function showError(detail) {
  loading.classList.add('is-hidden');
  gpuStatus.textContent = '不支持';
  gpuStatus.classList.add('is-cpu');
  statusDot.classList.add('is-error');
  statusText.textContent = 'WebGL 不可用';
  viewport.innerHTML = `
    <div class="webgpu-error">
      <div class="webgpu-error__card">
        <h2>🌊 WebGL 不可用</h2>
        <p>
          本示例使用 Three.js 的 <code>WebGLRenderer</code> 与 GLSL 着色器渲染海面。<br /><br />
          请使用较新版本的浏览器打开，并确认已启用「硬件加速」。
          ${detail ? `<br /><br /><span style="opacity:.6">${detail}</span>` : ''}
        </p>
      </div>
    </div>`;
}

/* ----------------------------- UI 绑定 ----------------------------- */
function fillTrack(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const pct = ((Number(input.value) - min) / (max - min)) * 100;
  input.style.background =
    `linear-gradient(90deg, var(--accent) ${pct}%, rgba(140,200,240,0.18) ${pct}%)`;
}

function bindRange(input, label, fmt, onChange) {
  input.value = input.defaultValue; // 忽略浏览器的表单值恢复，每次加载回到 HTML 默认值
  const apply = () => {
    label.textContent = fmt(Number(input.value));
    fillTrack(input);
    onChange(Number(input.value));
  };
  input.addEventListener('input', apply);
  apply();
}

bindRange(ui.wind, ui.windValue, (v) => `${v.toFixed(1)} m/s`, (v) => { params.windSpeed = v; rebuildWaves(); });
bindRange(ui.windDir, ui.windDirValue, (v) => `${v | 0}°`, (v) => { params.windDir = v; rebuildWaves(); });
bindRange(ui.height, ui.heightValue, (v) => v.toFixed(2), (v) => { params.waveScale = v; rebuildWaves(); });
bindRange(ui.chop, ui.chopValue, (v) => v.toFixed(2), (v) => { params.chop = v; oceanUniforms.uChop.value = v; });
bindRange(ui.foam, ui.foamValue, (v) => v.toFixed(2), (v) => { params.foam = v; oceanUniforms.uFoam.value = v; });
bindRange(ui.sun, ui.sunValue, (v) => `${v | 0}°`, (v) => { params.sunElevation = v; updateSun(); });
bindRange(ui.sunAz, ui.sunAzValue, (v) => `${v | 0}°`, (v) => { params.sunAzimuth = v; updateSun(); });

ui.pause.addEventListener('click', () => {
  params.paused = !params.paused;
  ui.pause.textContent = params.paused ? '继续' : '暂停';
  statusText.textContent = params.paused
    ? '模拟已暂停 · 参数仍可调节'
    : 'WebGL 渲染中 · 拖拽旋转 · 滚轮缩放';
});
