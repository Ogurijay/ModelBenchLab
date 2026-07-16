// 装配与主循环。
// 渲染管线:主场景(实体 + 火光 + 火星)→ HDR RT → 体积火焰合成 pass → 画布。
// 模拟时间统一走 SimClock:暂停冻结火焰,环绕视角照常;__bench.stepFrame 固定步长回放。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { params, setParam, onParamChange, windVec, QUALITY_PRESETS } from './params.js';
import { SimClock } from './clock.js';
import { buildWorld } from './scene.js';
import { FireLight } from './firelight.js';
import { Sparks } from './sparks.js';
import { FireComposite } from './fireComposite.js';
import { buildUI } from './ui.js';
import { installBench } from './bench.js';

const INIT_POS = new THREE.Vector3(3.3, 2.05, 4.35);
const INIT_TARGET = new THREE.Vector3(0, 0.85, 0);

// ---- 渲染器:场景渲染进线性 HDR RT,色调映射在合成 shader 手动完成
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false; // 每帧手动 reset,让 drawCalls 统计覆盖两个 pass
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 130);
camera.position.copy(INIT_POS);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(INIT_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.8;
controls.maxDistance = 11;
controls.maxPolarAngle = 1.53; // ≈ 87.7°,不钻入地下
controls.update();

const clock = new SimClock();
const world = buildWorld(scene);
const firelight = new FireLight(scene);
const sparks = new Sparks(scene);
const composite = new FireComposite(renderer);

// ---- 尺寸与质量档
function syncSize() {
  // 隐藏标签页 / headless 场景下 innerWidth 可能为 0:兜底评测目标分辨率 1080p,
  // 待标签页可见触发 resize / visibilitychange 时再按真实视口覆盖
  const w = window.innerWidth || 1920;
  const h = window.innerHeight || 1080;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const db = renderer.getDrawingBufferSize(new THREE.Vector2());
  composite.setSize(db.x, db.y);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncSize();
});

function applyQuality() {
  const q = QUALITY_PRESETS[params.quality];
  composite.setSteps(q.steps);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprCap));
  firelight.setShadow(q.shadow);
  sparks.setPixelRatio(renderer.getPixelRatio());
  syncSize();
}

window.addEventListener('resize', syncSize);
onParamChange((key) => {
  if (key === 'quality') applyQuality();
  else if (key === 'paused') clock.setPaused(params.paused);
});

// ---- 每帧模拟 + 渲染
function update(dt) {
  const wind = windVec();
  firelight.update(clock.time, params.intensity, wind);
  const flicker = firelight.flicker;
  sparks.update(dt, clock.time, { intensity: params.intensity, turbulence: params.turbulence, wind });
  world.update(clock.time, flicker, params.intensity);
  composite.update(camera, clock.time, {
    intensity: params.intensity,
    turbulence: params.turbulence,
    wind,
    flicker,
  });
}

function render() {
  renderer.info.reset();
  composite.render(scene, camera);
}

// ---- 帧率统计(EMA,真实 rAF 间隔)
let fps = 60;
let lastRaf = performance.now();
function getFps() { return fps; }

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const raw = (now - lastRaf) / 1000;
  lastRaf = now;
  if (raw > 0) fps = fps * 0.92 + (1 / raw) * 0.08;
  controls.update();
  const dt = clock.tick();
  update(dt);
  render();
}

// ---- __bench 支撑
function stepFrame(n) {
  for (let i = 0; i < n; i++) {
    clock.advance(1 / 60);
    update(1 / 60);
    render();
  }
}

function resetView() {
  camera.position.copy(INIT_POS);
  controls.target.copy(INIT_TARGET);
  controls.update();
}

// ---- 启动:同步首帧(不等 rAF,隐藏标签页也能 ready)
buildUI({
  onTogglePause: () => setParam('paused', !params.paused),
  onResetView: resetView,
  getStats: () => ({
    fps,
    width: renderer.domElement.width,
    height: renderer.domElement.height,
    steps: composite.steps,
    sparks: sparks.aliveCount,
    drawCalls: renderer.info.render.calls,
  }),
});

const bench = installBench({ clock, renderer, composite, sparks, getFps, stepFrame, resetView });

applyQuality();
update(0);
render();
bench.ready = true;

requestAnimationFrame(loop);
