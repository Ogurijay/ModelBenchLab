import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PRESETS, PRESET_ORDER, getBeaufortScale } from './presets.js';
import { createWaveSpectrum, sampleOceanSurface } from './waves.js';
import { computeAtmosphereState } from './atmosphere.js';
import { createSkyDome } from './sky.js';
import { createOceanSurface } from './water.js';
import { createWeatherManager } from './weather.js';
import { BuoyancyWorld } from './buoyancy.js';
import {
  createTrawlerVessel,
  createNavBuoy,
  createLighthouseIsland,
  createFloaterMesh,
  createSplashManager
} from './props.js';
import { createOceanAudio } from './audio.js';
import { createParameterGUI } from './gui.js';

const container = document.getElementById('canvas-container');
const flashOverlay = document.getElementById('lightning-flash');

// 渲染器与场景初始化
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x7cc4f5, 0.00028);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.4, 20000);
camera.position.set(22, 9.5, 30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.maxDistance = 480;
controls.minDistance = 4.5;
controls.maxPolarAngle = Math.PI * 0.492; // 限制俯仰不穿入水底
controls.target.set(0, 1.5, 0);

// 当前运行参数（默认：晴朗信风 trade）
const params = {
  ...PRESETS.trade,
  seed: 4072,
  paused: false,
  timeScale: 1.0,
  shipAutoCruise: true,
  wireframe: false,
  debugMode: 0,
  lightningFlash: 0.0,
  selectedSpawnKind: 'crate',
  cameraMode: 'orbit'
};

// 支持 URL 参数覆盖 (?preset=superstorm&seed=108&paused=1)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('preset') && PRESETS[urlParams.get('preset')]) {
  Object.assign(params, PRESETS[urlParams.get('preset')]);
}
if (urlParams.has('seed')) {
  const s = Number(urlParams.get('seed'));
  if (Number.isFinite(s)) params.seed = s;
}
if (urlParams.get('paused') === '1') {
  params.paused = true;
}

// 灯光系统
const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x163859, 1.35);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff9ed, 2.6);
sunLight.position.set(-80, 120, -90);
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.85);
fillLight.position.set(65, 55, 85);
scene.add(fillLight);

// 波谱、天穹、海面与天气系统
let currentSpectrum = createWaveSpectrum(params);
const skyDome = createSkyDome();
scene.add(skyDome.mesh);

const oceanSurface = createOceanSurface(currentSpectrum);
scene.add(oceanSurface.mesh);

const audio = createOceanAudio();
const splashMgr = createSplashManager(scene);

const weatherMgr = createWeatherManager(scene, (strikeInfo) => {
  audio.playThunder(strikeInfo.distance);
});

function rebuildSpectrum() {
  currentSpectrum = createWaveSpectrum(params);
  oceanSurface.updateSpectrum(currentSpectrum);
}

// 浮力物理世界与场景实体装配
const buoyancy = new BuoyancyWorld();

// 1. 远洋科考拖网船
const trawler = createTrawlerVessel();
trawler.group.position.set(0, 0.2, 0);
scene.add(trawler.group);

const shipBody = buoyancy.addBody({
  id: 'trawler_main',
  kind: 'ship',
  mesh: trawler.group,
  mass: 2800,
  waterlineOffset: -0.05,
  pitchStiffness: 5.2,
  rollStiffness: 5.8,
  normalFollow: 0.58,
  collisionRadius: 4.8,
  yaw: 0.35,
  samplePoints: [
    { x: 0.0, y: 0, z: 5.8, weight: 0.18 },   // 船首
    { x: -1.8, y: 0, z: 2.2, weight: 0.16 },  // 左前舷
    { x: 1.8, y: 0, z: 2.2, weight: 0.16 },   // 右前舷
    { x: -1.8, y: 0, z: -2.6, weight: 0.16 }, // 左后舷
    { x: 1.8, y: 0, z: -2.6, weight: 0.16 },  // 右后舷
    { x: 0.0, y: 0, z: -5.6, weight: 0.18 }   // 船尾
  ]
});

// 2. 红/绿双航道观测浮标（带系泊锚链）
const redBuoyObj = createNavBuoy(0xdc2626, 0xff4d4d);
redBuoyObj.group.position.set(-14, 0, 12);
scene.add(redBuoyObj.group);
const buoy1Body = buoyancy.addBody({
  id: 'nav_buoy_1',
  kind: 'buoy',
  mesh: redBuoyObj.group,
  mass: 360,
  waterlineOffset: -0.15,
  pitchStiffness: 6.8,
  rollStiffness: 6.8,
  normalFollow: 0.72,
  collisionRadius: 1.4,
  mooring: { x: -14, z: 12, slackRadius: 1.4, stiffness: 3.2 },
  samplePoints: [
    { x: -0.9, y: 0, z: 0, weight: 0.25 },
    { x: 0.9, y: 0, z: 0, weight: 0.25 },
    { x: 0, y: 0, z: -0.9, weight: 0.25 },
    { x: 0, y: 0, z: 0.9, weight: 0.25 }
  ]
});

const greenBuoyObj = createNavBuoy(0x16a34a, 0x4ade80);
greenBuoyObj.group.position.set(16, 0, -14);
scene.add(greenBuoyObj.group);
buoyancy.addBody({
  id: 'nav_buoy_2',
  kind: 'buoy',
  mesh: greenBuoyObj.group,
  mass: 360,
  waterlineOffset: -0.15,
  pitchStiffness: 6.8,
  rollStiffness: 6.8,
  normalFollow: 0.72,
  collisionRadius: 1.4,
  mooring: { x: 16, z: -14, slackRadius: 1.4, stiffness: 3.2 },
  samplePoints: [
    { x: -0.9, y: 0, z: 0, weight: 0.25 },
    { x: 0.9, y: 0, z: 0, weight: 0.25 },
    { x: 0, y: 0, z: -0.9, weight: 0.25 },
    { x: 0, y: 0, z: 0.9, weight: 0.25 }
  ]
});

// 3. 远海灯塔岛
const lighthouseIsland = createLighthouseIsland(new THREE.Vector3(-82, 0, -42));
scene.add(lighthouseIsland.group);

let simTime = 0;

// 4. 投放初始浮体（木箱、救生圈、探测球）
function spawnFloater(kind = 'crate', x = 8, z = 8, dropHeightOffset = 0.0, initialVel = null) {
  if (buoyancy.dynamicFloaters.length >= buoyancy.maxDynamicFloaters) {
    const oldest = buoyancy.dynamicFloaters[0];
    buoyancy.removeBody(oldest, scene);
  }

  const def = createFloaterMesh(kind);
  const surf = sampleOceanSurface(currentSpectrum, x, z, simTime, weatherMgr.waterspout.state);
  def.mesh.position.set(x, surf.height + def.waterlineOffset + dropHeightOffset, z);
  def.mesh.rotation.y = Math.random() * Math.PI * 2;
  scene.add(def.mesh);

  return buoyancy.addBody({
    kind,
    mesh: def.mesh,
    isDynamicSpawn: true,
    waterlineOffset: def.waterlineOffset,
    collisionRadius: def.collisionRadius,
    samplePoints: def.samplePoints,
    yaw: def.mesh.rotation.y,
    initialVelocity: initialVel,
    enteredWater: dropHeightOffset <= 0.35
  });
}

spawnFloater('crate', 9.5, 7.5, 0.1);
spawnFloater('buoyring', -7.2, 8.8, 0.1);
spawnFloater('drum', 11.2, -5.5, 0.1);

// 平滑海况过渡状态
let transitionState = null;

function applyPreset(presetId, immediate = false) {
  const target = PRESETS[presetId];
  if (!target) return;

  params.id = target.id;
  params.name = target.name;
  params.weatherLabel = target.weatherLabel;
  params.waterspout = target.waterspout;
  params.lightningAuto = target.lightningAuto;
  params.lightningInterval = target.lightningInterval;

  document.querySelectorAll('.preset-card').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === presetId);
  });
  updateWaterspoutButtonUI();

  if (immediate) {
    Object.assign(params, target);
    weatherMgr.waterspout.setImmediate(Boolean(target.waterspout));
    rebuildSpectrum();
    return;
  }

  const numericKeys = [
    'windSpeed', 'windDirDeg', 'hs', 'swellHeight', 'swellDirDeg', 'choppiness',
    'sunElevation', 'sunAzimuth', 'cloudCover', 'cloudDarkness', 'fogDensity',
    'rainIntensity', 'foamScale', 'sssStrength'
  ];
  const from = {};
  for (const k of numericKeys) from[k] = params[k];
  const fromDeep = new THREE.Color(params.deepColor);
  const fromShallow = new THREE.Color(params.shallowColor);
  const toDeep = new THREE.Color(target.deepColor);
  const toShallow = new THREE.Color(target.shallowColor);

  transitionState = {
    elapsed: 0,
    duration: 1.15,
    numericKeys,
    from,
    to: target,
    fromDeep,
    fromShallow,
    toDeep,
    toShallow
  };

  if (presetId === 'superstorm') {
    weatherMgr.triggerLightning();
  }
}

// 相机机位切换
function setCameraMode(mode) {
  params.cameraMode = mode;
  document.querySelectorAll('#camera-btns .chip-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.cam === mode);
  });

  if (mode === 'orbit') {
    camera.position.set(shipBody.position.x + 22, 10.5, shipBody.position.z + 28);
    controls.target.set(shipBody.position.x, 1.5, shipBody.position.z);
  } else if (mode === 'lighthouse') {
    camera.position.set(-48, 22, -16);
    controls.target.set(-82, 8, -42);
  } else if (mode === 'skim') {
    camera.position.set(shipBody.position.x - 16, 2.4, shipBody.position.z + 18);
    controls.target.set(shipBody.position.x + 8, 1.2, shipBody.position.z - 12);
  }
  controls.update();
}

// 鼠标点击海面投放 & 拖拽浮体抛掷交互
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersect = new THREE.Vector3();

let pointerDownPos = new THREE.Vector2();
let grabbedBody = null;
let grabHeight = 2.6;
let lastGrabWorld = new THREE.Vector3();
let grabVelocity = new THREE.Vector3();

function updatePointerNDC(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  pointerDownPos.set(e.clientX, e.clientY);
  updatePointerNDC(e);
  raycaster.setFromCamera(pointerNDC, camera);

  // 检查是否点中可拖拽的动态浮体
  const dynamicMeshes = buoyancy.dynamicFloaters.map((b) => b.mesh);
  const hits = raycaster.intersectObjects(dynamicMeshes, true);
  if (hits.length > 0) {
    let hitObj = hits[0].object;
    while (hitObj.parent && !dynamicMeshes.includes(hitObj)) {
      hitObj = hitObj.parent;
    }
    const found = buoyancy.dynamicFloaters.find((b) => b.mesh === hitObj);
    if (found) {
      grabbedBody = found;
      grabbedBody.grabbed = true;
      grabbedBody.enteredWater = false;
      controls.enabled = false;
      const surf = sampleOceanSurface(currentSpectrum, found.position.x, found.position.z, simTime, weatherMgr.waterspout.state);
      grabHeight = surf.height + 2.8;
      found.position.y = grabHeight;
      found.mesh.position.copy(found.position);
      lastGrabWorld.copy(found.position);
      grabVelocity.set(0, 0, 0);
    }
  }
});

window.addEventListener('pointermove', (e) => {
  if (!grabbedBody) return;
  updatePointerNDC(e);
  raycaster.setFromCamera(pointerNDC, camera);
  waterPlane.constant = -grabHeight;
  if (raycaster.ray.intersectPlane(waterPlane, planeIntersect)) {
    const dist = Math.hypot(planeIntersect.x - camera.position.x, planeIntersect.z - camera.position.z);
    if (dist < 180) {
      grabVelocity.subVectors(planeIntersect, lastGrabWorld).multiplyScalar(18.0);
      grabVelocity.x = THREE.MathUtils.clamp(grabVelocity.x, -22, 22);
      grabVelocity.z = THREE.MathUtils.clamp(grabVelocity.z, -22, 22);
      grabbedBody.position.set(planeIntersect.x, grabHeight, planeIntersect.z);
      grabbedBody.mesh.position.copy(grabbedBody.position);
      lastGrabWorld.copy(grabbedBody.position);
    }
  }
});

window.addEventListener('pointerup', (e) => {
  if (grabbedBody) {
    grabbedBody.grabbed = false;
    grabbedBody.velocity.set(grabVelocity.x, 2.2, grabVelocity.z);
    grabbedBody = null;
    controls.enabled = true;
    return;
  }

  // 若鼠标几乎未拖动（纯点击），则在点击海面位置投放浮体
  const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (e.target === renderer.domElement && e.button === 0 && moveDist < 5) {
    updatePointerNDC(e);
    raycaster.setFromCamera(pointerNDC, camera);
    waterPlane.constant = 0;
    if (raycaster.ray.intersectPlane(waterPlane, planeIntersect)) {
      const clickDist = Math.hypot(planeIntersect.x - camera.position.x, planeIntersect.z - camera.position.z);
      if (clickDist > 3 && clickDist < 190) {
        spawnFloater(
          params.selectedSpawnKind,
          planeIntersect.x,
          planeIntersect.z,
          2.6,
          new THREE.Vector3(0, -1.8, 0)
        );
      }
    }
  }
});

// 键盘控制（WASD 驾船、1-6 预设、L 闪电、T 水龙卷、C 清空、Space 暂停、H 纯净观海）
const keyState = { forward: false, back: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const k = e.key.toLowerCase();

  if (k >= '1' && k <= '6') {
    const presetId = PRESET_ORDER[Number(k) - 1];
    if (presetId) applyPreset(presetId);
  } else if (k === 'w' || e.key === 'ArrowUp') {
    keyState.forward = true;
  } else if (k === 's' || e.key === 'ArrowDown') {
    keyState.back = true;
  } else if (k === 'a' || e.key === 'ArrowLeft') {
    keyState.left = true;
  } else if (k === 'd' || e.key === 'ArrowRight') {
    keyState.right = true;
  } else if (k === 'l') {
    weatherMgr.triggerLightning();
  } else if (k === 't') {
    params.waterspout = !params.waterspout;
    updateWaterspoutButtonUI();
  } else if (k === 'c') {
    buoyancy.clearDynamicFloaters(scene);
  } else if (k === 'f') {
    setCameraMode(params.cameraMode === 'ship' ? 'orbit' : 'ship');
  } else if (e.code === 'Space') {
    e.preventDefault();
    togglePause();
  } else if (k === 'h') {
    toggleCleanUI();
  } else if (e.key === 'Escape' && document.body.classList.contains('clean-ui')) {
    toggleCleanUI(false);
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || e.key === 'ArrowUp') keyState.forward = false;
  if (k === 's' || e.key === 'ArrowDown') keyState.back = false;
  if (k === 'a' || e.key === 'ArrowLeft') keyState.left = false;
  if (k === 'd' || e.key === 'ArrowRight') keyState.right = false;
});

// UI 事件绑定
const btnWaterspout = document.getElementById('btn-waterspout');
const btnAudio = document.getElementById('btn-audio');
const btnPause = document.getElementById('btn-pause');
const cleanPill = document.getElementById('clean-mode-pill');

function updateWaterspoutButtonUI() {
  if (!btnWaterspout) return;
  btnWaterspout.textContent = `🌪️ 水龙卷: ${params.waterspout ? '开' : '关'}`;
  btnWaterspout.classList.toggle('active', Boolean(params.waterspout));
}

function togglePause() {
  params.paused = !params.paused;
  if (btnPause) {
    btnPause.textContent = params.paused ? '▶ 继续' : '⏸ 暂停';
    btnPause.classList.toggle('active', params.paused);
  }
}

function toggleCleanUI(forceState) {
  const isClean = typeof forceState === 'boolean'
    ? forceState
    : !document.body.classList.contains('clean-ui');
  document.body.classList.toggle('clean-ui', isClean);
  cleanPill.classList.toggle('hidden', !isClean);
}

document.querySelectorAll('.preset-card').forEach((btn) => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
});

document.querySelectorAll('#camera-btns .chip-btn').forEach((btn) => {
  btn.addEventListener('click', () => setCameraMode(btn.dataset.cam));
});

document.querySelectorAll('#spawn-btns .chip-btn[data-spawn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    params.selectedSpawnKind = btn.dataset.spawn;
    document.querySelectorAll('#spawn-btns .chip-btn[data-spawn]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
  });
});

document.getElementById('btn-clear-floaters')?.addEventListener('click', () => {
  buoyancy.clearDynamicFloaters(scene);
});

document.getElementById('btn-lightning')?.addEventListener('click', () => {
  weatherMgr.triggerLightning();
});

btnWaterspout?.addEventListener('click', () => {
  params.waterspout = !params.waterspout;
  updateWaterspoutButtonUI();
});

btnAudio?.addEventListener('click', () => {
  const on = audio.toggle();
  btnAudio.textContent = on ? '🔊 海浪声: 开' : '🔇 开启海浪声';
  btnAudio.classList.toggle('active', on);
});

btnPause?.addEventListener('click', togglePause);
cleanPill?.addEventListener('click', () => toggleCleanUI(false));

document.getElementById('btn-shot')?.addEventListener('click', () => {
  renderer.render(scene, camera);
  const link = document.createElement('a');
  link.download = `pelagic-ocean-${params.id}-${Date.now()}.png`;
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
});

// 初始化 lil-gui 参数面板
createParameterGUI(params, {
  onSpectrumChange: rebuildSpectrum,
  onWaterspoutToggle: updateWaterspoutButtonUI,
  onTriggerLightning: () => weatherMgr.triggerLightning()
});

// 1号航标 30 秒波高示波器曲线绘制
const waveChartCanvas = document.getElementById('wave-chart');
const chartCtx = waveChartCanvas ? waveChartCanvas.getContext('2d') : null;
const waveHistory = new Array(120).fill(0);
let waveSampleAccum = 0;

function drawWaveChart() {
  if (!chartCtx || !waveChartCanvas) return;
  const w = waveChartCanvas.width;
  const h = waveChartCanvas.height;
  chartCtx.clearRect(0, 0, w, h);

  // 零水位基准虚线
  chartCtx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  chartCtx.lineWidth = 1;
  chartCtx.beginPath();
  chartCtx.moveTo(0, h * 0.5);
  chartCtx.lineTo(w, h * 0.5);
  chartCtx.stroke();

  const scaleY = Math.max(1.2, currentSpectrum.effectiveHs * 0.72);
  chartCtx.strokeStyle = '#38bdf8';
  chartCtx.lineWidth = 1.8;
  chartCtx.beginPath();
  for (let i = 0; i < waveHistory.length; i++) {
    const x = (i / (waveHistory.length - 1)) * w;
    const norm = THREE.MathUtils.clamp(waveHistory[i] / scaleY, -1, 1);
    const y = h * 0.5 - norm * (h * 0.42);
    if (i === 0) chartCtx.moveTo(x, y);
    else chartCtx.lineTo(x, y);
  }
  chartCtx.stroke();
}

// HUD 遥测 DOM 引用
const elHs = document.getElementById('val-hs');
const elWind = document.getElementById('val-wind');
const elWeather = document.getElementById('val-weather');
const elFps = document.getElementById('val-fps');
const elEta = document.getElementById('val-eta');

// 主循环状态
let lastFrameTime = performance.now();
let fpsSmooth = 60;
let hudUpdateTimer = 0;
let shipForwardSpeed = 1.6;
let cameraAboveWater = true;

function updateShipHelm(dt) {
  const manualSteer = (keyState.left ? 1 : 0) - (keyState.right ? 1 : 0);
  const manualThrust = (keyState.forward ? 1 : 0) - (keyState.back ? 1 : 0);

  if (manualSteer !== 0 || manualThrust !== 0) {
    shipBody.yaw += manualSteer * 0.68 * dt;
    shipForwardSpeed = THREE.MathUtils.clamp(shipForwardSpeed + manualThrust * 3.8 * dt, -2.5, 6.5);
  } else if (params.shipAutoCruise) {
    // 自动缓慢环形巡航，保持在观察海域中央附近
    shipForwardSpeed += (1.85 - shipForwardSpeed) * Math.min(1, dt * 1.5);
    const distFromOrigin = Math.hypot(shipBody.position.x, shipBody.position.z);
    if (distFromOrigin > 36) {
      const targetYaw = Math.atan2(-shipBody.position.x, -shipBody.position.z);
      let diff = ((targetYaw - shipBody.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      shipBody.yaw += THREE.MathUtils.clamp(diff, -0.45, 0.45) * dt;
    } else {
      shipBody.yaw += 0.055 * dt;
    }
  } else {
    shipForwardSpeed *= 1.0 - Math.min(1, dt * 1.8);
  }

  const fwdX = Math.sin(shipBody.yaw);
  const fwdZ = Math.cos(shipBody.yaw);
  shipBody.position.x += fwdX * shipForwardSpeed * dt;
  shipBody.position.z += fwdZ * shipForwardSpeed * dt;
}

function animate(now) {
  requestAnimationFrame(animate);

  const rawDt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  if (rawDt > 0.001) {
    const instFps = 1.0 / rawDt;
    fpsSmooth = fpsSmooth * 0.92 + instFps * 0.08;
  }

  // 处理预设平滑插值过渡
  if (transitionState) {
    transitionState.elapsed += rawDt;
    const t = Math.min(1.0, transitionState.elapsed / transitionState.duration);
    const ease = t * t * (3.0 - 2.0 * t);
    for (const k of transitionState.numericKeys) {
      params[k] = THREE.MathUtils.lerp(transitionState.from[k], transitionState.to[k], ease);
    }
    const cDeep = transitionState.fromDeep.clone().lerp(transitionState.toDeep, ease);
    const cShallow = transitionState.fromShallow.clone().lerp(transitionState.toShallow, ease);
    params.deepColor = '#' + cDeep.getHexString();
    params.shallowColor = '#' + cShallow.getHexString();

    rebuildSpectrum();
    if (t >= 1.0) transitionState = null;
  }

  const simDt = params.paused ? 0.0 : rawDt * params.timeScale;
  simTime += simDt;

  // 1. 更新天气、雨幕、闪电与水龙卷
  const weatherState = weatherMgr.update(simDt, simTime, camera, params);
  if (flashOverlay) {
    flashOverlay.style.opacity = (weatherState.flash * 0.65).toFixed(3);
  }

  // 2. 更新大气散射与光源
  const atmo = computeAtmosphereState(params);
  sunLight.position.copy(atmo.sunDir).multiplyScalar(200);
  sunLight.color.copy(atmo.sunColor);
  sunLight.intensity = (2.4 * (1.0 - atmo.overcast * 0.72)) + weatherState.flash * 5.5;
  hemiLight.color.copy(atmo.horizonColor);
  hemiLight.groundColor.set(params.deepColor);
  hemiLight.intensity = 0.95 + weatherState.flash * 1.8;
  scene.fog.color.copy(atmo.fogColor);
  scene.fog.density = params.fogDensity;

  // 3. 推进船只航行与多点浮力物理
  if (simDt > 0) {
    updateShipHelm(simDt);
    buoyancy.step(
      simDt,
      simTime,
      currentSpectrum,
      weatherState.tornadoState,
      (sx, sy, sz, vel) => {
        splashMgr.spawnSplash(sx, sy, sz, vel);
        audio.playSplash(vel);
      }
    );
    splashMgr.update(simDt);
  }

  // 4. 船舶雷达、探照灯、航标闪灯与灯塔旋转光束动画
  trawler.radarBar.rotation.y = simTime * 3.6;
  const isLowLight = params.sunElevation < 12 || params.fogDensity > 0.0009 || params.cloudDarkness > 0.45;
  const beamStrength = isLowLight
    ? THREE.MathUtils.clamp((15 - params.sunElevation) * 0.025 + params.fogDensity * 160 + params.cloudDarkness * 0.38, 0.08, 0.52)
    : 0.0;
  trawler.beamUniforms.uIntensity.value = beamStrength * 0.65;

  lighthouseIsland.beamPivot.rotation.y = simTime * 0.75;
  lighthouseIsland.coneUniforms.uIntensity.value = beamStrength * 0.85;

  const buoyBlink = Math.sin(simTime * 4.2) > 0.25 ? 1.0 : 0.15;
  redBuoyObj.haloMat.opacity = 0.42 * buoyBlink;
  greenBuoyObj.haloMat.opacity = 0.42 * (1.15 - buoyBlink);

  // 5. 随船相机与水面防穿模安全高度约束
  if (params.cameraMode === 'ship') {
    const fwdX = Math.sin(shipBody.yaw);
    const fwdZ = Math.cos(shipBody.yaw);
    const targetCamX = shipBody.position.x - fwdX * 19.5 + fwdZ * 4.5;
    const targetCamZ = shipBody.position.z - fwdZ * 19.5 - fwdX * 4.5;
    const targetCamY = shipBody.position.y + 7.2;
    camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), Math.min(1, rawDt * 4.5));
    controls.target.lerp(
      new THREE.Vector3(shipBody.position.x + fwdX * 6, shipBody.position.y + 2.2, shipBody.position.z + fwdZ * 6),
      Math.min(1, rawDt * 6.0)
    );
  }
  controls.update();

  // 强制相机保持在当前局部海浪高度 + 1.45m 之上，绝不穿入水下
  const camSurf = sampleOceanSurface(
    currentSpectrum,
    camera.position.x,
    camera.position.z,
    simTime,
    weatherState.tornadoState
  );
  const minSafeCamY = camSurf.height + 1.45;
  if (camera.position.y < minSafeCamY) {
    camera.position.y = minSafeCamY;
  }
  cameraAboveWater = camera.position.y >= camSurf.height + 0.05;

  // 6. 更新天穹与海面着色器 Uniform
  skyDome.update(simTime, atmo, params, weatherState.lightningPos);
  oceanSurface.update(
    simTime,
    camera,
    atmo,
    params,
    weatherState.tornadoState,
    {
      x: shipBody.position.x,
      z: shipBody.position.z,
      heading: shipBody.yaw,
      speed: shipForwardSpeed
    },
    weatherState.lightningPos
  );

  // 7. 音频与遥测 HUD 更新
  audio.update(simTime, params);

  waveSampleAccum += rawDt;
  if (waveSampleAccum >= 0.25) {
    waveSampleAccum = 0;
    waveHistory.push(buoy1Body.lastWaveHeight);
    if (waveHistory.length > 120) waveHistory.shift();
    drawWaveChart();
  }

  hudUpdateTimer += rawDt;
  if (hudUpdateTimer >= 0.2) {
    hudUpdateTimer = 0;
    const beaufort = getBeaufortScale(params.windSpeed);
    if (elHs) elHs.textContent = `${currentSpectrum.effectiveHs.toFixed(2)} m`;
    if (elWind) elWind.textContent = `${params.windSpeed.toFixed(1)} m/s · ${beaufort}级`;
    if (elWeather) elWeather.textContent = params.name;
    if (elFps) elFps.textContent = `${Math.round(fpsSmooth)} FPS · ${buoyancy.bodies.length}`;
    if (elEta) {
      const v = buoy1Body.lastWaveHeight;
      elEta.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(2)} m`;
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 暴露自动化测试与评测钩子 window.__bench
window.__bench = {
  ready: true,
  getState() {
    return {
      preset: params.id,
      weatherLabel: params.weatherLabel,
      hs: params.hs,
      effectiveHs: Number(currentSpectrum.effectiveHs.toFixed(3)),
      windSpeed: params.windSpeed,
      beaufort: getBeaufortScale(params.windSpeed),
      fps: Math.round(fpsSmooth),
      floaterCount: buoyancy.bodies.length,
      dynamicFloaterCount: buoyancy.dynamicFloaters.length,
      cameraAboveWater,
      cameraMode: params.cameraMode,
      waterspout: Boolean(params.waterspout),
      rainIntensity: params.rainIntensity,
      lightningFlash: Number((params.lightningFlash || 0).toFixed(3))
    };
  },
  setPreset(presetId) {
    const mapped = PRESETS[presetId] ? presetId : PRESET_ORDER[Number(presetId) - 1];
    if (mapped) applyPreset(mapped, true);
    return this.getState();
  },
  triggerLightning() {
    return weatherMgr.triggerLightning();
  },
  spawn(kind = 'crate', x = 6, z = 6) {
    spawnFloater(kind, x, z, 1.5);
    return this.getState();
  },
  sampleHeight(x = 0, z = 0) {
    return sampleOceanSurface(currentSpectrum, x, z, simTime, weatherMgr.waterspout.state).height;
  }
};

drawWaveChart();
requestAnimationFrame(animate);
