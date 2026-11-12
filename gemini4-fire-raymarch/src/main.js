// 炽渊 · PYRE SANCTUARY — 实体火焰模拟主入口 (main.js)
// Three.js r186 + WebGL2 双阶段 HDR 体积光线步进管线

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { params, QUALITY_PRESETS, onParamChange, windVec } from './params.js';
import { buildSanctuaryScene } from './scene.js';
import { FireLightRig } from './firelight.js';
import { SparksSystem, SmokePlumeSystem } from './particles.js';
import { FireComposite } from './fireComposite.js';
import { mountFireUI } from './ui.js';
import { installBench } from './bench.js';

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);

const DEFAULT_CAM_POS = new THREE.Vector3(2.05, 1.38, 2.72);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.72, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 1.65;
controls.maxDistance = 7.8;
controls.minPolarAngle = 0.14;
controls.maxPolarAngle = Math.PI * 0.485;

function resetView() {
  camera.position.copy(DEFAULT_CAM_POS);
  controls.target.copy(DEFAULT_TARGET);
  controls.update();
  camera.updateMatrixWorld();
}

/** 按水平方位角(度)、仰角(度)与距离精确设置相机，供 360° 环绕体积检验 */
function setView(azDeg = 37, elevDeg = 14, dist = 3.45) {
  const az = (azDeg * Math.PI) / 180;
  const el = (elevDeg * Math.PI) / 180;
  const rHoriz = dist * Math.cos(el);
  controls.target.copy(DEFAULT_TARGET);
  camera.position.set(
    DEFAULT_TARGET.x + Math.sin(az) * rHoriz,
    DEFAULT_TARGET.y + Math.sin(el) * dist,
    DEFAULT_TARGET.z + Math.cos(az) * rHoriz
  );
  controls.update();
  camera.updateMatrixWorld();
}

resetView();

// 构建三维场景、动态火光、火星与高空烟羽、全屏体积光线步进合成器
const world = buildSanctuaryScene(scene);
const fireLights = new FireLightRig(scene);
const sparks = new SparksSystem(scene);
const smoke = new SmokePlumeSystem(scene);
const composite = new FireComposite(renderer);

let simTime = 0;
let stokeBoost = 0;

function triggerStoke() {
  stokeBoost = Math.min(1.0, stokeBoost + 0.75);
  sparks.triggerBurst(60);
}

// 视口尺寸与质量档位自适应（隐藏标签页 innerWidth=0 时自动回退 1920×1080）
function getViewportSize() {
  const w = window.innerWidth > 0 ? window.innerWidth : 1920;
  const h = window.innerHeight > 0 ? window.innerHeight : 1080;
  return { w, h };
}

function applyQualityAndSize() {
  const preset = QUALITY_PRESETS[params.quality] || QUALITY_PRESETS.high;
  const dpr = Math.min(window.devicePixelRatio || 1, preset.dprCap);
  const { w, h } = getViewportSize();

  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composite.setSize(Math.round(w * dpr), Math.round(h * dpr));
  composite.setSteps(preset.steps);
  sparks.setPixelRatio(dpr);
  smoke.setPixelRatio(dpr);
  fireLights.setShadowResolution(preset.shadowMapSize);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

applyQualityAndSize();
window.addEventListener('resize', applyQualityAndSize);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) applyQualityAndSize();
});

onParamChange((key) => {
  if (key === 'quality') applyQualityAndSize();
});

const ui = mountFireUI({
  onResetView: resetView,
  onStokeFire: triggerStoke,
});

// FPS 滑动平均统计
let smoothFps = 60;
let lastPerfNow = performance.now();

function advanceAndRender(dt, forceAdvance = false) {
  const stepDt = Math.min(Math.max(dt, 0.001), 0.05);

  if (!params.paused || forceAdvance) {
    simTime += stepDt;
    stokeBoost = Math.max(0, stokeBoost - stepDt * 0.65);

    const wind = windVec();
    fireLights.update(simTime, {
      intensity: params.intensity,
      turbulence: params.turbulence,
      wind,
      stokeBoost,
      spectrum: params.spectrum,
    });

    sparks.update(stepDt, simTime, {
      intensity: params.intensity,
      turbulence: params.turbulence,
      wind,
      stokeBoost,
      spectrum: params.spectrum,
    });

    smoke.update(stepDt, simTime, {
      intensity: params.intensity + stokeBoost * 0.45,
      turbulence: params.turbulence,
      wind,
      flicker: fireLights.flicker,
    });

    world.update(simTime, fireLights.flicker, params.intensity, stokeBoost);
  } else {
    // 暂停时仍响应参数滑条对静态火光和光谱的调整
    const wind = windVec();
    fireLights.update(simTime, {
      intensity: params.intensity,
      turbulence: params.turbulence,
      wind,
      stokeBoost,
      spectrum: params.spectrum,
    });
    world.update(simTime, fireLights.flicker, params.intensity, stokeBoost);
  }

  if (params.autoOrbit && !params.paused) {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), stepDt * 0.32);
    camera.position.copy(controls.target).add(offset);
  }

  controls.update();

  composite.update(camera, simTime, {
    intensity: params.intensity,
    turbulence: params.turbulence,
    wind: windVec(),
    flicker: fireLights.flicker,
    stokeBoost,
    spectrum: params.spectrum,
  });

  composite.render(scene, camera);

  ui.updateHUD({
    fps: smoothFps,
    steps: composite.steps,
    sparks: sparks.aliveCount,
    stokeBoost,
  });
}

function stepFrameFixed(n = 1) {
  for (let i = 0; i < n; i++) {
    advanceAndRender(1 / 60, true);
  }
}

const bench = installBench({
  getTime: () => simTime,
  renderer,
  camera,
  controls,
  composite,
  sparks,
  smoke,
  getFps: () => smoothFps,
  stepFrame: stepFrameFixed,
  resetView,
  setView,
  triggerStoke,
});

// 预热模拟 45 帧（0.75 秒），使首帧即呈现充分升腾的火舌、火星与烟羽，并同步置位 ready
stepFrameFixed(45);
bench.ready = true;

function onAnimationFrame(now) {
  const elapsedMs = now - lastPerfNow;
  lastPerfNow = now;
  if (elapsedMs > 0 && elapsedMs < 250) {
    const instFps = 1000 / elapsedMs;
    smoothFps = smoothFps * 0.9 + instFps * 0.1;
  }
  advanceAndRender(elapsedMs / 1000, false);
  requestAnimationFrame(onAnimationFrame);
}

requestAnimationFrame(onAnimationFrame);
