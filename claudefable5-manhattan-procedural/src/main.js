// 入口:渲染器 / 相机 / 场景装配与主循环。
// 城市 = f(种子):重建即整组销毁重生成,天空/天气/降水/动画体常驻。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Rng } from './core/prng.js';
import { globalUniforms } from './core/shaderpatch.js';
import { buildPlan } from './city/plan.js';
import { buildGround } from './city/ground.js';
import { buildBuildings } from './city/buildings.js';
import { buildLandmarks } from './city/landmarks.js';
import { buildPark } from './city/park.js';
import { buildStatue } from './city/statue.js';
import { buildBridge } from './city/bridge.js';
import { buildProps } from './city/props.js';
import { createSky } from './sky/sky.js';
import { createWeather, WEATHERS } from './weather/weather.js';
import { createPrecipitation } from './weather/precip.js';
import { createLightning } from './weather/lightning.js';
import { buildTraffic } from './sim/traffic.js';
import { buildAgents } from './sim/agents.js';
import { createPanel } from './ui/panel.js';
import { createHud } from './ui/hud.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 2, 4200);
camera.position.set(430, 300, 540);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 40, -80);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 15;
controls.maxDistance = 1400;

const state = {
  seed: 1337, hours: 10.3, auto: true, speed: 240,
  weather: '晴', wind: WEATHERS['晴'].wind, tour: false,
};

const sky = createSky(scene);
const weather = createWeather(scene, new Rng(4242));
const precip = createPrecipitation(scene);
const lightning = createLightning(scene, sky);
const agents = buildAgents(scene, []);

// ---------- 城市构建 / 销毁 ----------
let city = null;
function buildCity(seed) {
  if (city) {
    scene.remove(city.group);
    city.traffic.dispose();
    for (const d of city.disposables) d.dispose && d.dispose();
  }
  const t0 = performance.now();
  const plan = buildPlan(seed);
  const rng = new Rng(seed);
  const disposables = [];
  const group = new THREE.Group();
  const ground = buildGround(plan, rng.fork('ground'), disposables);
  const buildings = buildBuildings(plan, sky.envMap, rng.fork('bld'), disposables);
  const landmarks = buildLandmarks(plan, sky.envMap, rng.fork('lmk'), disposables);
  const park = buildPark(plan, rng.fork('park'), disposables);
  const statue = buildStatue(plan, rng.fork('sta'), disposables);
  const bridge = buildBridge(plan, rng.fork('brg'), disposables);
  const props = buildProps(plan, rng.fork('props'), disposables);
  group.add(ground.group, buildings.group, landmarks.group, park.group, statue.group, bridge.group, props.group);
  scene.add(group);
  const traffic = buildTraffic(plan, scene, disposables);
  lightning.setTargets(() => landmarks.targets);
  city = {
    plan, group, ground, buildings, landmarks, park, statue, bridge, props, traffic, disposables,
    buildMs: performance.now() - t0,
  };
}
buildCity(state.seed);

// ---------- 自动环游 ----------
const TOUR = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-70, 85, 800),
  new THREE.Vector3(-430, 130, 330),
  new THREE.Vector3(-400, 160, -240),
  new THREE.Vector3(-130, 120, -540),
  new THREE.Vector3(130, 90, -420),
  new THREE.Vector3(90, 190, -230),
  new THREE.Vector3(330, 150, -20),
  new THREE.Vector3(430, 110, 200),
  new THREE.Vector3(150, 95, 380),
], true, 'catmullrom', 0.42);
const TOUR_LEN = TOUR.getLength();
const FOCUS = new THREE.Vector3(0, 85, -110);
let tourU = 0;
const tourPos = new THREE.Vector3(), tourAhead = new THREE.Vector3(), tourLook = new THREE.Vector3();
const precipFocus = new THREE.Vector3();

// ---------- UI ----------
const hud = createHud();
const panel = createPanel({
  weathers: Object.keys(WEATHERS),
  state,
  onWeather: (n) => {
    state.weather = n;
    weather.setWeather(n);
    state.wind = WEATHERS[n].wind;
    panel.syncWind(state.wind);
  },
  onTime: (h) => { state.hours = h; },
  onAuto: (b) => { state.auto = b; },
  onSpeed: (v) => { state.speed = v; },
  onWind: (v) => { state.wind = v; weather.setWind(v); },
  onRegen: (s) => { state.seed = s; buildCity(s); },
  onTour: (b) => {
    state.tour = b;
    controls.enabled = !b;
    if (!b) {
      controls.target.copy(tourLook.lengthSq() ? tourLook : FOCUS);
      controls.update();
    }
  },
  onShadow: (b) => { sky.sun.castShadow = b; },
  onHud: (b) => hud.setVisible(b),
});

renderer.domElement.addEventListener('pointerdown', () => lightning.initAudio(), { once: true });

// 调试/评测钩子:控制台可直接驱动场景(如 __manhattan.strike() 强制闪电)
window.__manhattan = {
  state, camera, controls,
  strike: () => lightning.update(10, 1, camera),
  stats: () => ({ ...city.buildings.stats, plan: city.plan.stats, buildMs: city.buildMs }),
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- 主循环 ----------
let lastNow = performance.now();
let simTime = 0, avgFps = 60, firstFrame = true;
const fmtTime = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  simTime += dt;
  globalUniforms.uTime.value = simTime;
  avgFps = avgFps * 0.98 + (1 / Math.max(dt, 1e-4)) * 0.02;

  if (state.auto) {
    state.hours = (state.hours + (dt * state.speed) / 3600) % 24;
    panel.syncTime(state.hours);
  }

  const wx = weather.update(dt);
  const skyState = sky.update(state.hours, wx, camera, simTime);
  const night = skyState.night;

  city.buildings.setNight(night);
  for (const m of city.landmarks.nightMats) m.emissiveIntensity = night * (m.userData.nightGain || 1);
  city.landmarks.update(dt, night);
  city.statue.update(dt, night);
  city.bridge.update(night);
  city.ground.update(dt, wx.wind, wx.wet);
  city.props.update(dt, simTime, camera, night, wx.wet, wx.wind);
  city.traffic.update(dt, city.props, night);
  agents.update(dt, simTime, night);
  // 降水以相机与观察点之间为中心,近景远景都可见
  precipFocus.copy(camera.position).lerp(state.tour ? tourLook : controls.target, 0.42);
  precip.update(dt, precipFocus, wx.rain, wx.snow, wx.wind);
  lightning.update(dt, wx.bolt, camera);

  if (state.tour) {
    tourU = (tourU + (dt * 26) / TOUR_LEN) % 1;
    TOUR.getPointAt(tourU, tourPos);
    camera.position.copy(tourPos);
    TOUR.getPointAt((tourU + 0.05) % 1, tourAhead);
    tourLook.copy(tourAhead).multiplyScalar(0.42).addScaledVector(FOCUS, 0.58);
    camera.lookAt(tourLook);
  } else {
    controls.update();
  }

  hud.frame(dt);
  hud.update(dt, renderer, {
    buildings: city.buildings.stats.buildings,
    windows: city.buildings.stats.windows,
    waterTowers: city.buildings.stats.waterTowers,
    trees: city.park.treeCount,
    cars: city.traffic.stats.cars,
    signals: city.traffic.stats.signals,
    lanes: city.traffic.stats.lanes,
    time: fmtTime(state.hours),
    sunDeg: skyState.elevationDeg,
    weather: `${weather.name}`,
    wind: wx.wind,
    seed: state.seed,
    buildMs: city.buildMs,
    avgFps,
  });

  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    document.getElementById('loading').classList.add('hidden');
  }
}
tick();
