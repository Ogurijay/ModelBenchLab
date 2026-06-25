/**
 * GPU 实时海面模拟 — Three.js TSL + WebGPURenderer
 * ------------------------------------------------------------------
 * 与 CPU 逐顶点位移的做法不同，这里把整套海面运算交给 GPU：
 *   · Gerstner 多波叠加位移      → 顶点着色器 (positionNode)
 *   · 逐像素解析法线（有限差分） → 片元着色器 (colorNode)
 *   · 菲涅尔反射 / 天空+太阳反照 / 海沫 / 雾 → 片元着色器
 * 所有节点经 TSL 编译为 WGSL，真正运行在 WebGPU 之上。
 */
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, positionLocal, cameraPosition,
  vec2, vec3, vec4, float,
  sin, cos, dot, normalize, mix, pow, clamp, max,
  smoothstep, length, reflect, mx_noise_float
} from 'three/tsl';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './styles.css';

/* ----------------------------- DOM ----------------------------- */
const viewport = document.querySelector('#viewport');
const loading = document.querySelector('#loading');
const gpuStatus = document.querySelector('#gpuStatus');
const statusText = document.querySelector('#statusText');
const statusDot = document.querySelector('#statusDot');
const fpsLabel = document.querySelector('#fps');
const vertCountLabel = document.querySelector('#vertCount');

const ui = {
  height: document.querySelector('#height'),
  wind: document.querySelector('#wind'),
  chop: document.querySelector('#chop'),
  foam: document.querySelector('#foam'),
  sun: document.querySelector('#sun'),
  heightValue: document.querySelector('#heightValue'),
  windValue: document.querySelector('#windValue'),
  chopValue: document.querySelector('#chopValue'),
  foamValue: document.querySelector('#foamValue'),
  sunValue: document.querySelector('#sunValue'),
  pause: document.querySelector('#pause'),
  reset: document.querySelector('#reset'),
  regen: document.querySelector('#regen')
};

/* --------------------------- 参数 / Uniforms --------------------------- */
const params = {
  height: Number(ui.height.value),
  wind: Number(ui.wind.value),
  chop: Number(ui.chop.value),
  foam: Number(ui.foam.value),
  sunElevation: Number(ui.sun.value),
  paused: false
};

const uTime = uniform(0);                       // 自管理时间，便于暂停
const uAmp = uniform(params.height);            // 浪高倍率
const uWind = uniform(params.wind);             // 风速（时间推进倍率）
const uChop = uniform(params.chop);             // Gerstner 陡度（横向位移）
const uFoam = uniform(params.foam);             // 海沫强度
const uSunDir = uniform(new THREE.Vector3());   // 太阳方向（世界空间）

/* --------------------------- 程序化波谱（随机相位 / 谱分布 / 方向散布） --------------------------- */
const GRAVITY = 9.81;
const N_WAVES = 8;

// 确定性伪随机（mulberry32）：同一种子 → 同一片海，可复现
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 按谱生成一组随机波：几何分布波长 + 谱振幅 + 围绕主浪向散布 + 随机相位
function makeWaveBank(seed, count) {
  const rng = mulberry32(seed);
  const windAngle = -0.7 + (rng() - 0.5) * 0.7;      // 主浪向，每个种子略不同
  const Lmax = 170, Lmin = 2.4;
  const raw = [];
  for (let i = 0; i < count; i++) {
    const t = (i + rng() * 0.85) / count;            // 0..1（带抖动，避免分档）
    const len = Lmax * Math.pow(Lmin / Lmax, t);     // 几何分布：少量长波 + 大量短波
    const k = (Math.PI * 2) / len;
    const omega = Math.sqrt(GRAVITY * k) * (0.9 + rng() * 0.25);
    const s = rng() * 2 - 1;
    const ang = windAngle + s * Math.abs(s) * 1.3;   // ±~75°，三次方权重向主浪向集中
    const amp = Math.pow(len / Lmax, 0.62);          // 谱振幅：长波更高，温和衰减
    const phase = rng() * Math.PI * 2;               // ★随机相位——打破“整齐”的关键
    raw.push({ dx: Math.cos(ang), dz: Math.sin(ang), k, omega, amp, phase });
  }
  const total = raw.reduce((acc, w) => acc + w.amp, 0);
  const target = 2.7;                                // 归一化总振幅，浪高手感稳定
  return raw.map((w) => ({
    kx: w.dx * w.k,                                  // 预乘：phase = dot(K, coord) + ωt + φ
    kz: w.dz * w.k,
    omega: w.omega,
    phase: w.phase,
    amp: (w.amp / total) * target,
    hx: w.dx / (w.k * count),                        // 水平位移系数（Q 归一化，防 Gerstner 自交）
    hz: w.dz / (w.k * count)
  }));
}

let waveSeed = 1;
let waveBank = makeWaveBank(waveSeed, N_WAVES);

// 把当前波组展开成 TSL 节点：一次循环里同时累加「位移」与「解析 Gerstner 法线」。
// 必须在 Fn() 作用域内调用（toVar/addAssign 需要栈）。withNormal=false 时省去法线累加。
function fieldNodes(waves, coord, withNormal) {
  const invN = 1 / waves.length;
  const dx = float(0).toVar();
  const dy = float(0).toVar();
  const dz = float(0).toVar();
  const nx = withNormal ? float(0).toVar() : null;
  const ny = withNormal ? float(0).toVar() : null;
  const nz = withNormal ? float(0).toVar() : null;

  for (const w of waves) {
    const phase = dot(vec2(w.kx, w.kz), coord).add(uTime.mul(w.omega).mul(uWind)).add(w.phase);
    const c = cos(phase);
    const s = sin(phase);
    dx.addAssign(uChop.mul(uAmp).mul(c).mul(w.hx)); // Gerstner 横向收拢 → 尖峰平谷
    dz.addAssign(uChop.mul(uAmp).mul(c).mul(w.hz));
    dy.addAssign(uAmp.mul(s).mul(w.amp));           // 垂直起伏
    if (withNormal) {
      // 解析法线（GPU Gems Gerstner 法线公式，与位移同相，免逐像素三次采样）
      nx.addAssign(uAmp.mul(c).mul(w.kx * w.amp));    // Σ Dx·k·A·cos
      nz.addAssign(uAmp.mul(c).mul(w.kz * w.amp));    // Σ Dz·k·A·cos
      ny.addAssign(uChop.mul(uAmp).mul(s).mul(invN)); // Σ Q·k·A·sin
    }
  }

  const offset = vec3(dx, dy, dz);
  const normal = withNormal
    ? normalize(vec3(nx.mul(-1), max(float(1).sub(ny), 0.05), nz.mul(-1)))
    : null;
  return { offset, normal };
}

/* 天空 + 太阳颜色：被天空穹顶与海面反射复用，保证镜面反射里的太阳与天空一致 */
const skyColorFn = Fn(([dir]) => {
  const d = normalize(dir);
  const t = clamp(d.y.mul(0.5).add(0.5), 0, 1);
  const horizon = vec3(0.62, 0.70, 0.78);
  const zenith = vec3(0.05, 0.15, 0.30);
  const base = mix(horizon, zenith, smoothstep(0.0, 0.55, t));
  const sd = max(dot(d, normalize(uSunDir)), 0);
  const glow = pow(sd, 90).mul(2.6).add(pow(sd, 14).mul(0.35)); // 太阳本体 + 大气辉光
  return base.add(vec3(1.0, 0.82, 0.56).mul(glow));
});

/* ----------------------------- 入口 ----------------------------- */
if (!WebGPU.isAvailable()) {
  showWebGPUError();
} else {
  startOcean().catch((err) => {
    console.error(err);
    showWebGPUError(String(err && err.message ? err.message : err));
  });
}

async function startOcean() {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 2200);
  const HOME = new THREE.Vector3(-48, 27, 62);
  camera.position.copy(HOME);

  const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05111d, 1);
  await renderer.init();
  viewport.appendChild(renderer.domElement);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.minDistance = 22;
  orbit.maxDistance = 320;
  orbit.maxPolarAngle = Math.PI * 0.495; // 不穿到水面以下
  orbit.target.set(0, 2, 0);
  orbit.update();

  scene.add(buildSky());
  const ocean = buildOcean();
  scene.add(ocean);

  updateSun();

  // 顶点数读出
  const seg = ocean.geometry.parameters.widthSegments;
  vertCountLabel.textContent = `${((seg + 1) * (seg + 1) / 1000).toFixed(0)}k`;

  loading.classList.add('is-hidden');
  statusText.textContent = 'WebGPU 渲染中 · 拖拽旋转 · 滚轮缩放';

  // FPS / 计时
  let last = performance.now();
  let frames = 0;
  let fpsTimer = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!params.paused) uTime.value += delta;

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

  gpuStatus.textContent = 'WebGPU';
}

/* ----------------------------- 海面材质（按当前波组烘焙节点） ----------------------------- */
// 位移在顶点着色器算；逐像素用解析 Gerstner 法线（一次求值，含全部谱波 → 微观波纹锐利）。
function buildOceanMaterial(waves) {
  const totalAmp = waves.reduce((acc, w) => acc + w.amp, 0);
  const material = new THREE.MeshBasicNodeMaterial();

  // —— 顶点位移（GPU）——
  material.positionNode = Fn(() => {
    const { offset } = fieldNodes(waves, positionLocal.xz, false);
    return vec3(positionLocal.x.add(offset.x), offset.y, positionLocal.z.add(offset.z));
  })();

  // —— 逐像素着色（GPU）——
  material.colorNode = Fn(() => {
    const c = positionLocal.xz;
    const { offset, normal } = fieldNodes(waves, c, true);
    const worldPos = vec3(c.x.add(offset.x), offset.y, c.y.add(offset.z)); // local == world
    const viewDir = normalize(cameraPosition.sub(worldPos));
    const sunDir = normalize(uSunDir);

    // 菲涅尔（Schlick）
    const fresnel = pow(clamp(float(1).sub(max(dot(normal, viewDir), 0)), 0, 1), 5).mul(0.96).add(0.04);

    // 水体颜色：按高度在深水/浅水间过渡
    const hN = clamp(worldPos.y.div(uAmp.mul(totalAmp)).mul(0.5).add(0.5), 0, 1);
    const deep = vec3(0.004, 0.045, 0.095);
    const shallow = vec3(0.02, 0.20, 0.27);
    const water = mix(deep, shallow, hN);

    // 天空 / 太阳反射（沿反射方向采样同一套天空函数 → 物理一致的太阳波光）
    const reflDir = reflect(viewDir.mul(-1), normal);
    const sky = skyColorFn(reflDir);

    // 次表面散射近似：迎着太阳的浪尖透出青绿
    const sss = max(worldPos.y, 0).div(uAmp.mul(totalAmp))
      .mul(max(dot(viewDir, sunDir.mul(-1)), 0).add(0.25)).mul(0.6);
    const sssColor = vec3(0.04, 0.32, 0.26).mul(sss);

    let color = mix(water, sky, fresnel).add(sssColor);

    // 紧致镜面高光（Blinn-Phong），叠加波光闪烁
    const half = normalize(sunDir.add(viewDir));
    const spec = pow(max(dot(normal, half), 0), 220).mul(1.5);
    color = color.add(vec3(1.0, 0.88, 0.66).mul(spec));

    // —— 湍流泡沫：浪尖/陡坡决定“哪里可能起沫”，再用流动的噪声切成不规则斑块（不沿波峰成排） ——
    const fp = vec3(worldPos.x.mul(0.045), worldPos.z.mul(0.045), uTime.mul(0.08));
    const turb = mx_noise_float(fp).mul(0.5).add(0.5);          // [0,1] 湍流场
    const fine = mx_noise_float(fp.mul(3.4)).mul(0.5).add(0.5); // 高频细沫
    const crest = smoothstep(0.52, 0.96, hN);
    const steepFoam = smoothstep(0.5, 0.12, normal.y).mul(0.9);
    const where = clamp(crest.add(steepFoam), 0, 1);
    const patch = smoothstep(0.5, 0.95, where.mul(0.5).add(turb.mul(0.65)));
    const foam = clamp(patch.mul(fine.mul(0.6).add(0.4)), 0, 1).mul(uFoam);
    color = mix(color, vec3(0.9, 0.95, 0.98), foam);

    // 距离雾：远处融入地平线天空色
    const dist = length(cameraPosition.sub(worldPos));
    const fog = smoothstep(160, 760, dist).mul(0.9);
    color = mix(color, vec3(0.42, 0.52, 0.62), fog);

    return vec4(color, 1.0);
  })();

  return material;
}

/* ----------------------------- 海面网格 ----------------------------- */
let oceanMesh = null;

function buildOcean() {
  // 法线为逐像素解析计算（与网格密度无关），故可用较低分段数：顶点更省，着色细节不减
  const geometry = new THREE.PlaneGeometry(900, 900, 320, 320);
  geometry.rotateX(-Math.PI / 2); // 烘焙旋转：local 即 world 的水平面
  oceanMesh = new THREE.Mesh(geometry, buildOceanMaterial(waveBank));
  oceanMesh.frustumCulled = false;
  return oceanMesh;
}

// 🎲 重新生成：换一个种子，重建波组与材质（几何不变，节点图重新编译）
function regenerateWaves() {
  waveSeed = (Math.imul(waveSeed, 1664525) + 1013904223) >>> 0; // LCG 推进，确定且多样
  waveBank = makeWaveBank(waveSeed, N_WAVES);
  const old = oceanMesh.material;
  oceanMesh.material = buildOceanMaterial(waveBank);
  old.dispose();
  statusText.textContent = `已生成新的随机波浪 · 种子 #${waveSeed}`;
}

/* ----------------------------- 天空穹顶 ----------------------------- */
function buildSky() {
  const geometry = new THREE.SphereGeometry(1600, 48, 24);
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  material.colorNode = vec4(skyColorFn(normalize(positionLocal)), 1.0);
  return new THREE.Mesh(geometry, material);
}

/* ----------------------------- 太阳方向 ----------------------------- */
function updateSun() {
  const el = THREE.MathUtils.degToRad(params.sunElevation);
  const az = THREE.MathUtils.degToRad(-34);
  uSunDir.value
    .set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
    .normalize();
}

/* ----------------------------- WebGPU 不可用 ----------------------------- */
function showWebGPUError(detail) {
  loading.classList.add('is-hidden');
  gpuStatus.textContent = '不支持';
  gpuStatus.classList.add('is-cpu');
  statusDot.classList.add('is-error');
  statusText.textContent = 'WebGPU 不可用';
  viewport.innerHTML = `
    <div class="webgpu-error">
      <div class="webgpu-error__card">
        <h2>🌊 WebGPU 不可用</h2>
        <p>
          本示例使用 Three.js 的 <code>WebGPURenderer</code> 与 TSL 着色节点，需要浏览器支持 WebGPU。<br /><br />
          请使用较新版本的 <code>Chrome</code> / <code>Edge</code> 打开，并确认已启用「硬件加速」。
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

bindRange(ui.height, ui.heightValue, (v) => v.toFixed(2), (v) => { params.height = v; uAmp.value = v; });
bindRange(ui.wind, ui.windValue, (v) => v.toFixed(2), (v) => { params.wind = v; uWind.value = v; });
bindRange(ui.chop, ui.chopValue, (v) => v.toFixed(2), (v) => { params.chop = v; uChop.value = v; });
bindRange(ui.foam, ui.foamValue, (v) => v.toFixed(2), (v) => { params.foam = v; uFoam.value = v; });
bindRange(ui.sun, ui.sunValue, (v) => `${v | 0}°`, (v) => { params.sunElevation = v; updateSun(); });

ui.pause.addEventListener('click', () => {
  params.paused = !params.paused;
  ui.pause.textContent = params.paused ? '继续' : '暂停';
  statusText.textContent = params.paused
    ? '模拟已暂停 · 参数仍可调节'
    : 'WebGPU 渲染中 · 拖拽旋转 · 滚轮缩放';
});
