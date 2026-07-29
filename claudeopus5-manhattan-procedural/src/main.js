/**
 * 3D 曼哈顿 · 程序化活城 —— 集成主循环
 *
 * 职责：渲染器/场景/相机装配、按种子构建全部子系统、每帧组装 FrameContext、
 *       相机模式与预设、城市重建、无头测试接口 window.__bench。
 *
 * 所有子系统遵循 docs/CONTRACT.md 的 SystemHandle 约定：
 *   { object3D, update?(ctx), dispose?() }
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { makeRng, hashString } from './core/rng.js';
import { clamp, damp, lerp, smoothstep } from './core/mathx.js';
import { solarPosition, sunDirection, moonPosition, moonPhase, NYC } from './core/solar.js';
import { createTextureLib, disposeTextureLib } from './core/textures.js';
import { createAudioBus } from './core/audio.js';
import { createEnvUniforms, updateEnvUniforms } from './render/shaderpatch.js';

import { buildCityPlan, CITY } from './city/grid.js';
import { createHeightField } from './city/skyline.js';
import { createRoads } from './city/roads.js';
import { createBuildings } from './city/buildings.js';
import { createLandmarks, LANDMARK_LOTS_HINT } from './city/landmarks.js';
import { createBridge } from './city/bridge.js';
import { createStreetFurniture } from './city/streetfurniture.js';

import { createParkTerrain } from './sculpt/terrain.js';
import { createRocks } from './sculpt/rocks.js';
import { createStatue } from './sculpt/statue.js';
import { createClouds } from './sculpt/clouds.js';

import { createTraffic } from './sim/traffic.js';
import { createAgents } from './sim/agents.js';

import { createWeather, WEATHER_LABELS } from './weather/weather.js';
import { createPrecipitation } from './weather/precipitation.js';
import { createLightning } from './weather/lightning.js';

import { createSky } from './sky/sky.js';
import { createPanel } from './ui/panel.js';
import { createHud } from './ui/hud.js';

/* ------------------------------------------------------------------ *
 * 相机预设与环游路径
 * ------------------------------------------------------------------ */

const CAMERA_PRESETS = {
  skyline: { pos: [-1620, 505, 2900], target: [0, 165, 780] },
  empire: { pos: [-345, 302, -108], target: [-60, 252, -430] },
  park: { pos: [-138, 268, -1150], target: [-152, 32, -1520] },
  bridge: { pos: [1155, 128, 2285], target: [1160, 48, 1902] },
  liberty: { pos: [-1638, 96, 2338], target: [-1500, 62, 2202] },
  street: { pos: [-140, 13, 132], target: [-140, 11, -320] }
};

/** 自动环游关键点（位置 + 注视点），用 CatmullRom 平滑串联 */
const TOUR_KEYS = [
  { pos: [-1680, 470, 2820], target: [-200, 150, 1400] },
  { pos: [-980, 250, 2180], target: [200, 120, 1800] },
  { pos: [420, 165, 2360], target: [1150, 70, 1930] },
  { pos: [1180, 210, 1560], target: [200, 180, 1200] },
  { pos: [640, 320, 420], target: [-60, 260, -430] },
  { pos: [-420, 380, -260], target: [140, 240, -560] },
  { pos: [-520, 300, -1180], target: [-150, 40, -1520] },
  { pos: [-880, 420, -2020], target: [0, 200, -700] },
  { pos: [-1500, 520, -560], target: [0, 180, 200] }
];

const QUALITY = {
  high: { pixelRatio: 2, shadows: true, shadowSize: 2048, shadowRadius: 760, envRefresh: 1.6 },
  medium: { pixelRatio: 1.5, shadows: true, shadowSize: 1024, shadowRadius: 520, envRefresh: 3.0 },
  low: { pixelRatio: 1, shadows: false, shadowSize: 512, shadowRadius: 380, envRefresh: 0 }
};

/* ------------------------------------------------------------------ *
 * 应用状态
 * ------------------------------------------------------------------ */

const state = {
  seed: '1337',
  quality: 'high',
  simMinutes: 17 * 60,
  timeScale: 120,
  dayOfYear: 172,
  cameraMode: 'orbit',
  userWind: { dirDeg: 215, speed: 6 },
  audioOn: false,
  tourT: 0,
  streetT: 0,
  building: false
};

const container = document.getElementById('canvas-root');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.high.pixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
// 注意：Three 0.185 已废弃 PCFSoftShadowMap（内部回退到 PCF 并打警告），此处直接用 PCF
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9fb4cc, 0.00016);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 1.2, 22000);
camera.position.set(...CAMERA_PRESETS.skyline.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...CAMERA_PRESETS.skyline.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.497;
controls.minDistance = 12;
controls.maxDistance = 6500;
controls.update();

/* ---------------- 光照 ---------------- */

const sunLight = new THREE.DirectionalLight(0xfff2df, 2.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 20;
sunLight.shadow.camera.far = 4200;
sunLight.shadow.bias = -0.0006;
sunLight.shadow.normalBias = 1.4;
scene.add(sunLight);
scene.add(sunLight.target);

const moonLight = new THREE.DirectionalLight(0x9ab4e8, 0.0);
scene.add(moonLight);
scene.add(moonLight.target);

const hemiLight = new THREE.HemisphereLight(0xbcd4f0, 0x2b2b28, 0.6);
scene.add(hemiLight);

/* ---------------- 共享资源 ---------------- */

const env = createEnvUniforms();
const audio = createAudioBus();
let textures = null;
let pmrem = null;
let envRT = null;
let envRefreshTimer = 0;
let lastEnvSunElev = -999;

/** 场景系统表：{ key, handle } */
let systems = [];
let plan = null;
let heightField = null;
let tallStructures = [];
let weather = null;
let cityRoot = null;

const panel = createPanel({
  onWeather: (name) => weather && weather.set(name),
  onTime: (minutes) => { state.simMinutes = minutes; },
  onTimeScale: (x) => { state.timeScale = x; },
  onSeason: (day) => { state.dayOfYear = day; },
  onSeed: (seedStr) => rebuildCity(seedStr),
  onRandomSeed: () => {},
  onCameraMode: (mode) => setCameraMode(mode),
  onCameraPreset: (name) => applyPreset(name),
  onWind: ({ dirDeg, speed }) => { state.userWind.dirDeg = dirDeg; state.userWind.speed = speed; },
  onAudioToggle: (on) => {
    state.audioOn = on;
    if (on) audio.enable(); else audio.disable();
  },
  onHudToggle: (on) => hud.setVisible(on),
  onQuality: (level) => setQuality(level)
});

const hud = createHud();

/* ------------------------------------------------------------------ *
 * 城市构建 / 释放
 * ------------------------------------------------------------------ */

function disposeCity() {
  for (const { handle } of systems) {
    try {
      if (handle && handle.object3D && handle.object3D.parent) handle.object3D.parent.remove(handle.object3D);
      if (handle && typeof handle.dispose === 'function') handle.dispose();
    } catch (err) {
      console.warn('[dispose]', err);
    }
  }
  systems = [];
  if (cityRoot) {
    scene.remove(cityRoot);
    cityRoot = null;
  }
  tallStructures = [];
}

/** 把系统句柄挂进场景，并按类型配置阴影 */
function mount(key, handle, castShadow, receiveShadow) {
  if (!handle) return null;
  systems.push({ key, handle });
  if (handle.object3D) {
    handle.object3D.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh) {
        obj.castShadow = castShadow;
        obj.receiveShadow = receiveShadow;
      }
    });
    cityRoot.add(handle.object3D);
  }
  return handle;
}

/** 安全构建：单个系统抛错不应让整座城市白屏 */
function build(key, factory) {
  try {
    return factory();
  } catch (err) {
    console.error('[构建失败] ' + key, err);
    return null;
  }
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 构建期间又收到的重建请求（只保留最后一个，构建结束后补跑） */
let pendingSeed = null;

/**
 * 重建入口：串行化 + 失败兜底。
 * 任何子系统构建异常都不能让 `state.building` 永久卡住（那会冻结整个主循环），
 * 故用 try/finally 保证复位，并在结束后补跑期间排队的最后一次请求。
 */
async function rebuildCity(seedStr) {
  // 构建中不能重入（会把两套系统混进同一个 cityRoot），但也不能静默丢弃请求。
  if (state.building) {
    pendingSeed = String(seedStr ?? state.seed);
    return;
  }
  state.building = true;
  try {
    await buildCity(seedStr);
  } catch (err) {
    console.error('[重建城市失败]', err);
    panel.setLoading(false, '生成失败，请重试', 1);
  } finally {
    state.building = false;
  }
  if (pendingSeed !== null) {
    const next = pendingSeed;
    pendingSeed = null;
    await rebuildCity(next);
  }
}

async function buildCity(seedStr) {
  state.seed = String(seedStr ?? state.seed);

  panel.setLoading(true, '正在生成路网…', 0.02);
  await nextTick();

  disposeCity();
  cityRoot = new THREE.Group();
  cityRoot.name = 'city';
  scene.add(cityRoot);

  const rootRng = makeRng(state.seed, 'city');
  const q = QUALITY[state.quality];

  if (!textures) textures = createTextureLib(rootRng.fork('textures'));

  plan = buildCityPlan(state.seed);
  heightField = createHeightField(state.seed);
  tallStructures = [];

  const ctx0 = {
    plan,
    heightField,
    rng: rootRng,
    textures,
    env,
    quality: state.quality,
    seed: state.seed,
    tallStructures,
    audio,
    excludeZones: Array.isArray(LANDMARK_LOTS_HINT) ? LANDMARK_LOTS_HINT : []
  };

  const steps = [
    ['sky', 0.08, '生成天空与星空…', () => mount('sky', build('sky', () => createSky(ctx0)), false, false)],
    ['roads', 0.18, '铺设路网与人行道…', () => mount('roads', build('roads', () => createRoads(ctx0)), false, true)],
    ['terrain', 0.28, '雕刻中央公园地形…', () => mount('terrain', build('terrain', () => createParkTerrain(ctx0)), false, true)],
    ['buildings', 0.48, '生成楼群与屋顶细节…', () => mount('buildings', build('buildings', () => createBuildings(ctx0)), true, true)],
    ['landmarks', 0.60, '建造地标建筑…', () => mount('landmarks', build('landmarks', () => createLandmarks(ctx0)), true, true)],
    ['bridge', 0.66, '架设悬索桥…', () => mount('bridge', build('bridge', () => createBridge(ctx0)), true, true)],
    ['furniture', 0.74, '布置路灯与街道家具…', () => mount('furniture', build('furniture', () => createStreetFurniture(ctx0)), true, true)],
    ['statue', 0.80, '雕刻自由女神像…', () => mount('statue', build('statue', () => createStatue(ctx0)), true, true)],
    ['clouds', 0.86, '堆积云层…', () => mount('clouds', build('clouds', () => createClouds(ctx0)), false, false)],
    ['precip', 0.90, '准备降水系统…', () => mount('precip', build('precip', () => createPrecipitation(ctx0)), false, false)],
    ['lightning', 0.93, '准备雷电系统…', () => mount('lightning', build('lightning', () => createLightning(ctx0)), false, false)],
    ['agents', 0.97, '放飞鸟群与船只…', () => mount('agents', build('agents', () => createAgents(ctx0)), true, false)]
  ];

  for (const [, progress, text, run] of steps) {
    panel.setLoading(true, text, progress);
    await nextTick();
    run();
  }

  // 岩石依赖公园地形高度函数
  const terrainHandle = systems.find((s) => s.key === 'terrain');
  const parkHeightFn =
    terrainHandle && typeof terrainHandle.handle.heightAtPark === 'function'
      ? terrainHandle.handle.heightAtPark
      : () => 0;
  panel.setLoading(true, '雕刻公园岩石…', 0.985);
  await nextTick();
  mount('rocks', build('rocks', () => createRocks(ctx0, parkHeightFn)), true, true);

  // 交通依赖街道家具的信号灯位
  const furniture = systems.find((s) => s.key === 'furniture');
  ctx0.signalSlots = furniture ? furniture.handle.signalSlots || [] : [];
  ctx0.setSignalColor = furniture && typeof furniture.handle.setSignalColor === 'function'
    ? furniture.handle.setSignalColor.bind(furniture.handle)
    : null;
  if (furniture && ctx0.setSignalColor) furniture.handle.signalDriven = true;
  ctx0.manholes = furniture ? furniture.handle.manholes || [] : [];

  panel.setLoading(true, '启动交通仿真…', 0.995);
  await nextTick();
  mount('traffic', build('traffic', () => createTraffic(ctx0)), true, false);

  if (!weather) weather = createWeather(ctx0);

  applyQualitySettings();
  refreshEnvironmentMap(true);

  panel.setLoading(false, '完成', 1);
  panel.setSeed(state.seed);
}

/* ------------------------------------------------------------------ *
 * 画质 / 环境贴图
 * ------------------------------------------------------------------ */

function applyQualitySettings() {
  const q = QUALITY[state.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.shadowMap.enabled = q.shadows;
  sunLight.castShadow = q.shadows;
  if (q.shadows) {
    sunLight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (sunLight.shadow.map) {
      sunLight.shadow.map.dispose();
      sunLight.shadow.map = null;
    }
  }
  scene.traverse((obj) => {
    if (obj.isMesh || obj.isInstancedMesh) obj.material && (obj.material.needsUpdate = false);
  });
}

function setQuality(level) {
  if (!QUALITY[level] || level === state.quality) return;
  state.quality = level;
  applyQualitySettings();
  rebuildCity(state.seed);
}

/** 用当前天空生成 PMREM 环境贴图，让玻璃幕墙有可信反射 */
function refreshEnvironmentMap(force) {
  const q = QUALITY[state.quality];
  if (!q.envRefresh) {
    scene.environment = null;
    return;
  }
  const skySystem = systems.find((s) => s.key === 'sky');
  if (!skySystem || !skySystem.handle.object3D) return;

  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  const skyObj = skySystem.handle.object3D;
  const prevParent = skyObj.parent;
  const envScene = new THREE.Scene();
  envScene.add(skyObj);
  try {
    const rt = pmrem.fromScene(envScene, 0.04, 10, 20000);
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
    scene.environmentIntensity = 1.0;
  } catch (err) {
    console.warn('[环境贴图]', err);
  } finally {
    if (prevParent) prevParent.add(skyObj);
    envScene.clear();
  }
  envRefreshTimer = 0;
  void force;
}

/* ------------------------------------------------------------------ *
 * 相机
 * ------------------------------------------------------------------ */

const tourPosCurve = new THREE.CatmullRomCurve3(
  TOUR_KEYS.map((k) => new THREE.Vector3(...k.pos)),
  true,
  'catmullrom',
  0.4
);
const tourTargetCurve = new THREE.CatmullRomCurve3(
  TOUR_KEYS.map((k) => new THREE.Vector3(...k.target)),
  true,
  'catmullrom',
  0.4
);

const camTmp = new THREE.Vector3();
const targetTmp = new THREE.Vector3();
let presetBlend = null; // { pos, target, t }

function applyPreset(name) {
  const p = CAMERA_PRESETS[name];
  if (!p) return;
  if (state.cameraMode !== 'orbit') setCameraMode('orbit');
  presetBlend = {
    pos: new THREE.Vector3(...p.pos),
    target: new THREE.Vector3(...p.target),
    t: 0
  };
}

function setCameraMode(mode) {
  state.cameraMode = mode;
  controls.enabled = mode === 'orbit';
  panel.setCameraMode(mode);
  if (mode === 'tour') state.tourT = 0.0;
  if (mode === 'street') state.streetT = 0;
}

function updateCamera(dt) {
  if (state.cameraMode === 'orbit') {
    if (presetBlend) {
      presetBlend.t = Math.min(1, presetBlend.t + dt * 0.85);
      const k = smoothstep(0, 1, presetBlend.t);
      camera.position.lerp(presetBlend.pos, k * 0.16 + 0.02);
      controls.target.lerp(presetBlend.target, k * 0.16 + 0.02);
      if (presetBlend.t >= 1 && camera.position.distanceTo(presetBlend.pos) < 4) presetBlend = null;
    }
    controls.update();
    return;
  }

  if (state.cameraMode === 'tour') {
    state.tourT = (state.tourT + dt * 0.0075) % 1;
    tourPosCurve.getPointAt(state.tourT, camTmp);
    tourTargetCurve.getPointAt(state.tourT, targetTmp);
    camera.position.lerp(camTmp, 1 - Math.exp(-3.5 * dt));
    controls.target.lerp(targetTmp, 1 - Math.exp(-2.2 * dt));
    camera.lookAt(controls.target);
    return;
  }

  // 街道漫游：沿第三大道向北巡航
  state.streetT += dt * 13.5;
  const z = 1400 - (state.streetT % 3400);
  camera.position.set(-140 + Math.sin(state.streetT * 0.02) * 3.5, 11.5, z);
  controls.target.set(-140, 10.5, z - 220);
  camera.lookAt(controls.target);
}

/* ------------------------------------------------------------------ *
 * 帧上下文
 * ------------------------------------------------------------------ */

const ctx = {
  dt: 0,
  elapsed: 0,
  simMinutes: state.simMinutes,
  simHours: state.simMinutes / 60,
  dayOfYear: state.dayOfYear,
  sun: {
    direction: new THREE.Vector3(0, 1, 0),
    elevationDeg: 45,
    azimuthDeg: 180,
    intensity: 2.4,
    color: new THREE.Color(0xfff2df)
  },
  moon: { direction: new THREE.Vector3(0, 1, 0), elevationDeg: 0, illumination: 0.5, intensity: 0 },
  nightFactor: 0,
  weather: { current: 'clear', params: null, flash: 0 },
  wind: { dirDeg: 215, speed: 6, vector: new THREE.Vector3() },
  camera,
  scene,
  renderer,
  quality: state.quality,
  plan: null,
  heightField: null,
  rng: null,
  textures: null,
  env,
  tallStructures: [],
  audio
};

const DAY_COLOR = new THREE.Color(0xfff4e2);
const DUSK_COLOR = new THREE.Color(0xff9d54);
const fogColorTmp = new THREE.Color();

function updateContext(dt) {
  ctx.dt = dt;
  ctx.elapsed += dt;

  // 时间推进：timeScale 为倍速（120× 表示 1 真实秒 = 120 仿真秒）
  if (state.timeScale > 0) {
    state.simMinutes = (state.simMinutes + (dt * state.timeScale) / 60) % 1440;
    panel.setTime(state.simMinutes);
  }
  ctx.simMinutes = state.simMinutes;
  ctx.simHours = state.simMinutes / 60;
  ctx.dayOfYear = state.dayOfYear;
  ctx.quality = state.quality;
  ctx.plan = plan;
  ctx.heightField = heightField;
  ctx.textures = textures;
  ctx.tallStructures = tallStructures;
  ctx.audio = state.audioOn ? audio : null;

  // 太阳（NOAA 算法）
  const sp = solarPosition(ctx.dayOfYear, ctx.simHours, NYC.lat, NYC.lon, NYC.tzOffsetHours);
  const sd = sunDirection(sp.elevationDeg, sp.azimuthDeg);
  ctx.sun.direction.set(sd.x, sd.y, sd.z);
  ctx.sun.elevationDeg = sp.elevationDeg;
  ctx.sun.azimuthDeg = sp.azimuthDeg;

  ctx.nightFactor = 1 - smoothstep(-8, 4, sp.elevationDeg);

  // 月亮
  const mp = moonPosition(ctx.dayOfYear, ctx.simHours, NYC.lat, NYC.lon, NYC.tzOffsetHours);
  const md = sunDirection(mp.elevationDeg, mp.azimuthDeg);
  ctx.moon.direction.set(md.x, md.y, md.z);
  ctx.moon.elevationDeg = mp.elevationDeg;
  const phase = moonPhase(ctx.dayOfYear, ctx.simHours);
  ctx.moon.illumination = phase.illumination;

  // 天气（先推进状态机，再写进 ctx）
  if (weather) {
    ctx.wind.dirDeg = state.userWind.dirDeg;
    ctx.wind.speed = state.userWind.speed;
    weather.update(dt, ctx);
    ctx.weather.current = weather.current;
    ctx.weather.params = weather.params;
  }
  const wp = ctx.weather.params;

  // 风：以用户设定为基准，天气系统叠加阵风
  const windDir = wp && wp.windDirActual != null ? wp.windDirActual : state.userWind.dirDeg;
  const windSpeed = wp && wp.windSpeedActual != null ? wp.windSpeedActual : state.userWind.speed;
  ctx.wind.dirDeg = windDir;
  ctx.wind.speed = windSpeed;
  const wr = (windDir * Math.PI) / 180;
  ctx.wind.vector.set(Math.sin(wr) * windSpeed, 0, -Math.cos(wr) * windSpeed);

  // 光照强度与颜色
  const sunUp = clamp(smoothstep(-5, 12, sp.elevationDeg), 0, 1);
  const warm = 1 - clamp(smoothstep(2, 26, sp.elevationDeg), 0, 1);
  ctx.sun.color.copy(DAY_COLOR).lerp(DUSK_COLOR, warm * 0.85);
  const dim = wp ? 1 - clamp(wp.sunDim || 0, 0, 1) : 1;
  ctx.sun.intensity = sunUp * 3.0 * dim;

  sunLight.color.copy(ctx.sun.color);
  sunLight.intensity = ctx.sun.intensity;
  sunLight.visible = ctx.sun.intensity > 0.01;
  const shadowRadius = QUALITY[state.quality].shadowRadius;
  sunLight.position.copy(camera.position).addScaledVector(ctx.sun.direction, 2200);
  sunLight.target.position.copy(camera.position);
  sunLight.target.updateMatrixWorld();
  const sc = sunLight.shadow.camera;
  if (sc.left !== -shadowRadius) {
    sc.left = -shadowRadius;
    sc.right = shadowRadius;
    sc.top = shadowRadius;
    sc.bottom = -shadowRadius;
    sc.updateProjectionMatrix();
  }

  const moonUp = clamp(smoothstep(-4, 10, mp.elevationDeg), 0, 1);
  ctx.moon.intensity = moonUp * ctx.nightFactor * 0.22 * ctx.moon.illumination;
  moonLight.intensity = ctx.moon.intensity;
  moonLight.visible = ctx.moon.intensity > 0.005;
  moonLight.position.copy(camera.position).addScaledVector(ctx.moon.direction, 2200);
  moonLight.target.position.copy(camera.position);
  moonLight.target.updateMatrixWorld();

  // 环境光：白天随天空、夜间保留城市辉光底光
  const ambientBoost = wp ? wp.ambientBoost || 0 : 0;
  hemiLight.intensity = lerp(0.22, 0.85, sunUp) + ambientBoost * 0.4 + ctx.nightFactor * 0.12;
  hemiLight.color.setHSL(0.58, lerp(0.05, 0.42, sunUp), lerp(0.22, 0.72, sunUp));
  hemiLight.groundColor.setHSL(0.09, 0.18, lerp(0.06, 0.26, sunUp));

  // 雾：颜色取自天空，密度来自天气
  const sky = systems.find((s) => s.key === 'sky');
  if (sky && typeof sky.handle.getSkyColorAt === 'function') {
    try {
      const dir = camera.getWorldDirection(camTmp).clone();
      dir.y = 0.03;
      dir.normalize();
      const c = sky.handle.getSkyColorAt(dir);
      if (c && c.isColor) fogColorTmp.copy(c);
    } catch (err) {
      void err;
    }
  } else {
    fogColorTmp.setRGB(0.62, 0.71, 0.82).multiplyScalar(lerp(0.12, 1, sunUp));
  }
  if (wp && wp.fogColor) {
    const wc = wp.fogColor;
    const blend = clamp((wp.cloudCover || 0) * 0.7 + (wp.fogDensity || 0) * 160, 0, 0.9);
    fogColorTmp.lerp(new THREE.Color(wc[0], wc[1], wc[2]).multiplyScalar(lerp(0.15, 1, sunUp)), blend);
  }
  scene.fog.color.copy(fogColorTmp);
  scene.fog.density = wp ? wp.fogDensity : 0.00016;
  renderer.setClearColor(fogColorTmp, 1);

  // 闪电闪光（由 lightning 系统写入）
  const lightning = systems.find((s) => s.key === 'lightning');
  ctx.weather.flash = lightning && typeof lightning.handle.flash === 'number' ? lightning.handle.flash : 0;

  updateEnvUniforms(env, ctx);
}

/* ------------------------------------------------------------------ *
 * 主循环
 * ------------------------------------------------------------------ */

let lastTime = performance.now();
let lastFrameStamp = performance.now();
let instanceTotal = 0;
let instanceTimer = 0;

function frame(dtRaw) {
  const dt = clamp(dtRaw, 0, 0.1);
  updateContext(dt);
  updateCamera(dt);

  for (const { key, handle } of systems) {
    if (typeof handle.update === 'function') {
      try {
        handle.update(ctx);
      } catch (err) {
        console.error('[update] ' + key, err);
        handle.update = null;
      }
    }
  }

  if (audio && state.audioOn) {
    const wp = ctx.weather.params;
    audio.rainLevel(wp ? wp.rainIntensity || 0 : 0);
    audio.windLevel(clamp(ctx.wind.speed / 22, 0, 1));
    audio.cityAmbience(clamp(1 - ctx.nightFactor * 0.55, 0.2, 1) * 0.5);
    audio.update(dt);
  }

  // 环境贴图按太阳移动幅度节流刷新
  const q = QUALITY[state.quality];
  if (q.envRefresh) {
    envRefreshTimer += dt;
    if (envRefreshTimer > q.envRefresh && Math.abs(ctx.sun.elevationDeg - lastEnvSunElev) > 0.8) {
      lastEnvSunElev = ctx.sun.elevationDeg;
      refreshEnvironmentMap(false);
    }
  }

  renderer.render(scene, camera);

  // 实例统计每秒汇总一次
  instanceTimer += dt;
  if (instanceTimer > 1) {
    instanceTimer = 0;
    instanceTotal = 0;
    for (const { handle } of systems) {
      if (handle.stats && typeof handle.stats.instances === 'number') instanceTotal += handle.stats.instances;
    }
  }

  const traffic = systems.find((s) => s.key === 'traffic');
  hud.update(ctx, renderer, {
    cars: traffic && traffic.handle.stats ? traffic.handle.stats.cars : 0,
    instances: instanceTotal,
    seed: state.seed
  });
}

function animate(now) {
  requestAnimationFrame(animate);
  lastFrameStamp = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  if (state.building) return;
  frame(dt);
}

// 标签页隐藏时 rAF 会停摆；用低频兜底循环保证无头测试可推进
setInterval(() => {
  const now = performance.now();
  if (now - lastFrameStamp > 500 && !state.building) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    lastFrameStamp = now;
    frame(dt);
  }
}, 120);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  console.warn('WebGL 上下文丢失，等待恢复…');
});

/* ------------------------------------------------------------------ *
 * 无头测试接口
 * ------------------------------------------------------------------ */

window.__bench = {
  ready: false,
  step(seconds) {
    const dt = clamp(seconds || 1 / 60, 0, 0.1);
    if (!state.building) frame(dt);
  },
  setWeather(name) {
    if (weather) weather.set(name);
    panel.setWeather(name);
  },
  setTime(hours) {
    state.simMinutes = clamp(hours, 0, 24) * 60;
    panel.setTime(state.simMinutes);
  },
  setTimeScale(x) {
    state.timeScale = x;
  },
  setSeed(str) {
    return rebuildCity(str);
  },
  setCameraPreset(name) {
    applyPreset(name);
  },
  setQuality(level) {
    setQuality(level);
  },
  stats() {
    const traffic = systems.find((s) => s.key === 'traffic');
    return {
      fps: hud.fps || 0,
      draws: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      instances: instanceTotal,
      cars: traffic && traffic.handle.stats ? traffic.handle.stats.cars : 0,
      simHours: ctx.simHours,
      weather: ctx.weather.current,
      weatherLabel: WEATHER_LABELS ? WEATHER_LABELS[ctx.weather.current] : '',
      sunElevationDeg: ctx.sun.elevationDeg,
      seed: state.seed,
      building: state.building,
      systems: systems.map((s) => s.key)
    };
  },
  /** 取某个子系统句柄（QA / 调试用，如 __bench.sys('traffic')） */
  sys(key) {
    const found = systems.find((s) => s.key === key);
    return found ? found.handle : null;
  },
  /** 城市几何摘要：用于验证同种子确定性 */
  cityHash() {
    if (!plan || !heightField) return '';
    let acc = 2166136261 >>> 0;
    const mix = (v) => {
      acc = (acc ^ (Math.round(v * 1000) >>> 0)) >>> 0;
      acc = Math.imul(acc, 16777619) >>> 0;
    };
    mix(plan.blocks.length);
    mix(plan.triangleLots.length);
    mix(plan.intersections.length);
    for (const b of plan.blocks) {
      mix(b.lots.length);
      mix(b.centerX);
      mix(b.centerZ);
    }
    for (let x = -780; x <= 780; x += 60) {
      for (let z = -2380; z <= 2380; z += 120) {
        mix(heightField.heightAt(x, z));
      }
    }
    return (acc >>> 0).toString(16).padStart(8, '0') + ':' + hashString(state.seed).toString(16);
  }
};

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

(async function boot() {
  await rebuildCity(state.seed);
  setCameraMode('orbit');
  lastTime = performance.now();
  requestAnimationFrame(animate);
  window.__bench.ready = true;
})();
