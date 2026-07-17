import * as THREE from 'three';
import { PROJECT, WEATHER_KINDS } from './config.js';
import { createCityPlan } from './world/plan.js';
import { createWorld } from './world/index.js';
import { createTrafficSystem, createAmbientAgents } from './sim/index.js';
import { createWeatherSystem } from './weather/index.js';
import { createSkySystem } from './render/sky.js';
import { createCameraRig } from './render/camera.js';
import { createInterface } from './ui/panel.js';
import './ui/styles.css';

const canvas = document.querySelector('#scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071116);

const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, 0.2, 1800);
camera.position.set(-245, 172, -286);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
});
renderer.setSize(innerWidth, innerHeight, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = true;

const sky = createSkySystem(scene);
const cameraRig = createCameraRig(camera, canvas);
let previousFrameTime = performance.now();

const runtime = {
  seed: PROJECT.defaultSeed,
  timeHours: 8,
  elapsed: 0,
  autoTime: true,
  autoWeather: true,
  weather: 'clear',
  wind: { x: 6, z: -1.8 },
  ready: false,
  fps: 0,
};

let plan = null;
let world = null;
let traffic = null;
let agents = null;
let weather = null;
let frameCount = 0;
let fpsElapsed = 0;
let uiElapsed = 0;
let animationFrame = 0;

const interfaceApi = createInterface({
  onWeather: (kind) => setWeather(kind, 5.5),
  onTime: (hours) => { runtime.timeHours = normalizedHour(hours); },
  onAutoTime: (enabled) => { runtime.autoTime = enabled; },
  onAutoWeather: (enabled) => { runtime.autoWeather = enabled; },
  onWind: (speed) => setWind(speed, -speed * 0.3),
  onSeed: async (seed) => {
    interfaceApi.toast(`按种子 ${seed} 重建城市…`);
    await reset(seed);
    interfaceApi.toast(`城市已重建 · ${plan.hash}`);
  },
  onCamera: (mode) => {
    cameraRig.setMode(mode);
    interfaceApi.setCamera(mode);
  },
  onAudio: async () => {
    const enabled = await weather?.unlockAudio?.();
    interfaceApi.setAudioEnabled(Boolean(enabled));
    interfaceApi.toast(enabled ? '程序化雷声已解锁' : '当前浏览器无法启用 WebAudio');
  },
});

function normalizedHour(value) {
  return ((Number(value) % 24) + 24) % 24;
}

function normalizedSeed(value) {
  const number = Number(value);
  if (Number.isFinite(number)) return Math.abs(Math.trunc(number)) >>> 0;
  return PROJECT.defaultSeed;
}

function scheduledWeather(hours) {
  const hour = normalizedHour(hours);
  if (hour >= 4 && hour < 8) return 'fog';
  if (hour >= 8 && hour < 13.5) return 'clear';
  if (hour >= 13.5 && hour < 15) return 'rain';
  if (hour >= 15 && hour < 17) return 'storm';
  if (hour >= 17 && hour < 20) return 'snow';
  return 'clear';
}

function disposeCitySystems() {
  weather?.dispose?.();
  agents?.dispose?.();
  traffic?.dispose?.();
  world?.dispose?.();
  weather = null;
  agents = null;
  traffic = null;
  world = null;
}

function buildCity(seed) {
  disposeCitySystems();
  plan = createCityPlan(seed);
  world = createWorld(scene, plan, { cloudCount: 20 });
  world.group.traverse((object) => {
    if (object.isMesh && !object.isInstancedMesh) object.castShadow = false;
  });
  renderer.shadowMap.needsUpdate = true;
  previousFrameTime = performance.now();
  traffic = createTrafficSystem(scene, plan, { seed, vehicleCount: 144 });
  agents = createAmbientAgents(scene, { seed, birdCount: 28, boatCount: 3 });
  weather = createWeatherSystem(scene, camera, {
    seed,
    roadMaterial: world.roadMaterial,
    buildingMaterials: world.buildingMaterials,
    snowSurfaces: world.snowSurfaces,
    highestTarget: world.highestTarget,
  });
  weather.setWind(runtime.wind.x, runtime.wind.z);
  interfaceApi.setSeed(seed);
}

function setWeather(kind, duration = 5.5) {
  if (!WEATHER_KINDS.includes(kind)) throw new RangeError(`未知天气: ${kind}`);
  runtime.weather = kind;
  interfaceApi.setWeather(kind);
  if (!weather) return;
  const transition = duration <= 0 ? 4 : duration;
  weather.setWeather(kind, transition);
  if (duration <= 0) weather.step(PROJECT.fixedStep, Math.ceil(transition / PROJECT.fixedStep));
}

function setWind(x, z = 0) {
  runtime.wind.x = THREE.MathUtils.clamp(Number(x) || 0, -35, 35);
  runtime.wind.z = THREE.MathUtils.clamp(Number(z) || 0, -35, 35);
  weather?.setWind?.(runtime.wind.x, runtime.wind.z);
}

async function reset(seed = runtime.seed) {
  runtime.ready = false;
  bench.ready = false;
  runtime.seed = normalizedSeed(seed);
  runtime.elapsed = 0;
  runtime.timeHours = 8;
  runtime.weather = 'clear';
  buildCity(runtime.seed);
  setWeather('clear', 0);
  cameraRig.reset();
  updateSimulation(0);
  runtime.ready = true;
  bench.ready = true;
  return plan.signature;
}

function updateSimulation(dt) {
  const safeDt = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.25);
  runtime.elapsed += safeDt;
  if (runtime.autoTime) runtime.timeHours = normalizedHour(runtime.timeHours + safeDt * 0.35);
  if (runtime.autoWeather) {
    const requested = scheduledWeather(runtime.timeHours);
    if (requested !== runtime.weather) setWeather(requested, 5.5);
  }

  const solar = sky.update(runtime.timeHours);
  traffic?.update?.(safeDt);
  agents?.update?.(safeDt);
  weather?.update?.(safeDt);
  const weatherState = weather?.getState?.() ?? {};
  world?.setDaylight?.(solar.daylight);
  world?.setWeatherResponse?.({
    wetness: weatherState.wetness ?? 0,
    snow: weatherState.snowCover ?? 0,
    cloudCover: weatherState.cloudCover ?? 0,
  });
  world?.update?.(safeDt, runtime.elapsed);
  return { solar, weatherState };
}

function countSemanticRoles() {
  const roles = {};
  scene.traverse((object) => {
    const role = object.userData?.benchRole;
    if (role) roles[role] = (roles[role] ?? 0) + 1;
  });
  return roles;
}

function getMetrics() {
  const trafficMetrics = traffic?.getMetrics?.() ?? {};
  const agentMetrics = agents?.getMetrics?.() ?? {};
  const weatherState = weather?.getState?.() ?? {};
  const render = renderer.info.render;
  const worldInstances = world?.instanceCount ?? 0;
  const trafficInstances = traffic?.instanceCount ?? 0;
  const agentInstances = (agentMetrics.birdCount ?? 0) + (agentMetrics.boatCount ?? 0) + (agentMetrics.helicopterCount ?? 0);
  return {
    version: PROJECT.version,
    ready: runtime.ready,
    seed: runtime.seed,
    cityHash: plan?.signature ?? null,
    timeHours: runtime.timeHours,
    elapsed: runtime.elapsed,
    fps: runtime.fps,
    drawCalls: render.calls,
    triangles: render.triangles,
    points: render.points,
    lines: render.lines,
    instances: worldInstances + trafficInstances + agentInstances,
    worldInstances,
    trafficInstances,
    cars: trafficMetrics.vehicleCount ?? 0,
    targetFps: 60,
    drawCallBudget: 180,
    solar: sky.solar,
    plan: plan?.stats ?? null,
    traffic: trafficMetrics,
    agents: agentMetrics,
    weather: weatherState,
    memory: { ...renderer.info.memory },
    roles: countSemanticRoles(),
  };
}

function updateInterface() {
  const metrics = getMetrics();
  interfaceApi.update({
    timeHours: runtime.timeHours,
    fps: runtime.fps,
    drawCalls: metrics.drawCalls,
    triangles: metrics.triangles,
    instances: metrics.instances,
    cars: metrics.cars,
    solarAltitude: sky.solar.altitudeDeg,
    cityHash: plan?.signature,
  });
}

function renderFrame(frameTime = performance.now()) {
  const dt = Math.min(Math.max(0, (frameTime - previousFrameTime) / 1000), 0.1);
  const { weatherState } = updateSimulation(dt);
  cameraRig.update(dt);
  previousFrameTime = frameTime;
  renderer.toneMappingExposure = THREE.MathUtils.lerp(0.74, 1.08, weatherState.lightLevel ?? 1);
  renderer.render(scene, camera);
  if (runtime.elapsed - (renderer.shadowMap.userData?.lastUpdate ?? -Infinity) >= 1.5) {
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.userData = { lastUpdate: runtime.elapsed };
  }

  frameCount += 1;
  fpsElapsed += dt;
  uiElapsed += dt;
  if (fpsElapsed >= 0.5) {
    runtime.fps = frameCount / fpsElapsed;
    frameCount = 0;
    fpsElapsed = 0;
  }
  if (uiElapsed >= 0.2) {
    updateInterface();
    uiElapsed = 0;
  }
  animationFrame = requestAnimationFrame(renderFrame);
}

function showFatalError(error) {
  console.error(error);
  const loading = document.querySelector('#loading');
  if (!loading) return;
  loading.innerHTML = `<div><strong>场景初始化失败</strong><small>${String(error?.message ?? error)}</small></div>`;
}

const bench = {
  version: PROJECT.version,
  ready: false,
  scene,
  camera,
  renderer,
  async reset(seed) { return reset(seed); },
  setTime(hours) {
    runtime.timeHours = normalizedHour(hours);
    runtime.autoTime = false;
    return sky.update(runtime.timeHours);
  },
  setWeather(kind, duration = 6) {
    setWeather(kind, duration);
    return weather.getState();
  },
  setWind(x, z) {
    setWind(x, z);
    return { ...runtime.wind };
  },
  step(dt = PROJECT.fixedStep, iterations = 1) {
    const count = THREE.MathUtils.clamp(Math.floor(iterations), 0, 36000);
    for (let index = 0; index < count; index += 1) updateSimulation(dt);
    return getMetrics();
  },
  getMetrics,
  getCityHash() { return plan?.signature ?? null; },
  forceLightning() { return weather?.forceLightning?.() ?? null; },
};
window.__BENCH__ = bench;

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(1);
}
addEventListener('resize', resize, { passive: true });

try {
  await reset(PROJECT.defaultSeed);
  renderer.render(scene, camera);
  interfaceApi.setReady();
  updateInterface();
  animationFrame = requestAnimationFrame(renderFrame);
} catch (error) {
  showFatalError(error);
}

addEventListener('beforeunload', () => {
  cancelAnimationFrame(animationFrame);
  disposeCitySystems();
  sky.dispose();
  cameraRig.dispose();
  renderer.dispose();
}, { once: true });
