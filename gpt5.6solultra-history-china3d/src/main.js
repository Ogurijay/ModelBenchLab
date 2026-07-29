import * as THREE from 'three';
import { assignFaction } from './core/territory.js';
import { CITIES, formatYear, getCityNameAtYear } from './data/cities.js';
import { ERAS } from './data/eras.js';
import { createCameraRig } from './render/camera.js';
import { createInterface } from './ui/controller.js';
import { createAtmosphere } from './world/atmosphere.js';
import { createCityLayer } from './world/cities.js';
import { createEventLayer } from './world/events.js';
import { createTerrain } from './world/terrain.js';
import { createTerritoryLayer } from './world/territories.js';
import './styles.css';

const PROJECT_VERSION = '0.1.0';
const canvas = document.querySelector('#scene');
if (!canvas) throw new Error('未找到 3D 沙盘画布');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.12, 680);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = false;
renderer.setSize(innerWidth, innerHeight, false);

const QUALITY_PRESETS = [
  { id: 'efficient', label: '流畅', ratio: () => Math.min(devicePixelRatio, 0.8) },
  { id: 'balanced', label: '均衡', ratio: () => Math.min(devicePixelRatio, 1.25) },
  { id: 'high', label: '精细', ratio: () => Math.min(devicePixelRatio, 1.85) },
];

const runtime = {
  ready: false,
  eraIndex: 0,
  elapsed: 0,
  playing: false,
  playAccumulator: 0,
  playInterval: 3.4,
  segment: { start: 0, end: ERAS.length - 1 },
  qualityIndex: 1,
  fps: 0,
  layers: {
    territory: true,
    cities: true,
    events: true,
    labels: true,
  },
  selectedCityId: null,
};

let ui;
let frameHandle = 0;
let previousFrame = performance.now();
let fpsFrames = 0;
let fpsElapsed = 0;
let hudElapsed = 0;

function updateQuality() {
  const quality = QUALITY_PRESETS[runtime.qualityIndex];
  renderer.setPixelRatio(Math.max(0.5, quality.ratio()));
  renderer.setSize(innerWidth, innerHeight, false);
  ui?.setQuality(quality.label);
  return quality;
}

function nextQuality() {
  runtime.qualityIndex = (runtime.qualityIndex + 1) % QUALITY_PRESETS.length;
  return updateQuality();
}

updateQuality();

const cameraRig = createCameraRig(camera, canvas, {
  onModeChange: (mode) => ui?.setMode(mode),
});

const atmosphere = createAtmosphere(scene);
const terrain = createTerrain(scene);
const territoryLayer = createTerritoryLayer(scene, ERAS[0]);
const cityLayer = createCityLayer(scene, CITIES, ERAS[0]);
const eventLayer = createEventLayer(scene, ERAS[0]);

function eraIndexFrom(value) {
  if (typeof value === 'string') {
    const byId = ERAS.findIndex((era) => era.id === value);
    if (byId >= 0) return byId;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return runtime.eraIndex;
  if (Number.isInteger(number) && number >= 0 && number < ERAS.length) return number;

  let closest = 0;
  let closestDistance = Infinity;
  ERAS.forEach((era, index) => {
    const distance = Math.abs(era.year - number);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = index;
    }
  });
  return closest;
}

function setEra(value, { pause = false } = {}) {
  const index = eraIndexFrom(value);
  if (pause) setPlaying(false);
  runtime.eraIndex = index;
  runtime.playAccumulator = 0;
  const era = ERAS[index];

  territoryLayer.setEra(era);
  cityLayer.setEra(era);
  cityLayer.setVisible(runtime.layers.cities);
  cityLayer.setLabelsVisible(runtime.layers.labels);
  eventLayer.setEra(era);
  eventLayer.setVisible(runtime.layers.events);
  atmosphere.setEra(era);
  ui?.setEra(index);

  if (runtime.selectedCityId) {
    const city = CITIES.find((candidate) => candidate.id === runtime.selectedCityId);
    if (city) {
      cityLayer.setFocused(city.id);
      ui?.selectCity(city, era);
    }
  }

  return snapshot();
}

function setPlaying(playing) {
  runtime.playing = Boolean(playing);
  runtime.playAccumulator = 0;
  ui?.setPlaying(runtime.playing);
}

function setSegment({ start, end }) {
  const safeStart = THREE.MathUtils.clamp(Math.trunc(Number(start) || 0), 0, ERAS.length - 1);
  const safeEnd = THREE.MathUtils.clamp(Math.trunc(Number(end) || 0), 0, ERAS.length - 1);
  runtime.segment = {
    start: Math.min(safeStart, safeEnd),
    end: Math.max(safeStart, safeEnd),
  };
  if (runtime.eraIndex < runtime.segment.start || runtime.eraIndex > runtime.segment.end) {
    setEra(runtime.segment.start);
  }
  return { ...runtime.segment };
}

function advanceEra() {
  const { start, end } = runtime.segment;
  const next = runtime.eraIndex < start || runtime.eraIndex >= end
    ? start
    : runtime.eraIndex + 1;
  setEra(next);
}

function setLayer(name, visible) {
  if (!(name in runtime.layers)) throw new RangeError(`未知沙盘图层: ${name}`);
  runtime.layers[name] = Boolean(visible);
  if (name === 'territory') territoryLayer.setVisible(visible);
  if (name === 'cities') cityLayer.setVisible(visible);
  if (name === 'events') eventLayer.setVisible(visible);
  if (name === 'labels') cityLayer.setLabelsVisible(visible);
  return { ...runtime.layers };
}

function selectCity(cityOrId, focus = false) {
  const city = typeof cityOrId === 'string'
    ? CITIES.find((candidate) => candidate.id === cityOrId)
    : cityOrId;
  if (!city) return null;

  runtime.selectedCityId = city.id;
  cityLayer.setFocused(city.id);
  ui?.selectCity(city, ERAS[runtime.eraIndex]);
  if (focus) cameraRig.focusCity(city);
  return citySnapshot(city);
}

function clearCitySelection() {
  runtime.selectedCityId = null;
  cityLayer.setFocused(null);
  ui?.hideCity();
}

function overview() {
  cameraRig.overview();
  cityLayer.setFocused(null);
  runtime.selectedCityId = null;
  ui?.hideCity();
}

function focusEvent(event) {
  cameraRig.focusEvent(event);
}

ui = createInterface({
  eras: ERAS,
  cities: CITIES,
  onEra: (index) => setEra(index, { pause: true }),
  onPlay: (playing) => setPlaying(playing),
  onOverview: overview,
  onEvent: focusEvent,
  onCity: (city, focus) => selectCity(city, focus),
  onFocusCity: (city) => selectCity(city, true),
  onLayer: setLayer,
  onQuality: nextQuality,
  onSegment: setSegment,
});
ui.setMode('overview');
ui.setQuality(QUALITY_PRESETS[runtime.qualityIndex].label);
ui.setLoading('地形完成，正在铺设城市与势力图层…');

const raycaster = new THREE.Raycaster();
raycaster.params.Points.threshold = 1.5;
const pointer = new THREE.Vector2(2, 2);
const pointerState = {
  x: 0,
  y: 0,
  downX: 0,
  downY: 0,
  hovered: null,
};

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
}

function pickScene() {
  raycaster.setFromCamera(pointer, camera);
  const targets = [
    ...(runtime.layers.events ? eventLayer.getPickables() : []),
    ...(runtime.layers.cities ? cityLayer.getPickables() : []),
  ];
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit?.object ?? null;
}

function updateHover() {
  const object = pickScene();
  if (pointerState.hovered === object) return;
  pointerState.hovered = object;
  if (!object) {
    canvas.style.cursor = 'grab';
    ui.hideHover();
    return;
  }
  canvas.style.cursor = 'pointer';
  if (object.userData.type === 'city') {
    ui.showHover({ type: 'city', city: object.userData.city }, pointerState.x, pointerState.y);
  } else if (object.userData.type === 'event') {
    ui.showHover({ type: 'event', event: object.userData.event }, pointerState.x, pointerState.y);
  }
}

canvas.addEventListener('pointermove', (event) => {
  updatePointer(event);
  updateHover();
}, { passive: true });

canvas.addEventListener('pointerdown', (event) => {
  updatePointer(event);
  pointerState.downX = event.clientX;
  pointerState.downY = event.clientY;
}, { passive: true });

canvas.addEventListener('pointerup', (event) => {
  updatePointer(event);
  if (Math.hypot(event.clientX - pointerState.downX, event.clientY - pointerState.downY) > 6) return;
  const object = pickScene();
  if (object?.userData.type === 'city') selectCity(object.userData.city, false);
  if (object?.userData.type === 'event') focusEvent(object.userData.event);
}, { passive: true });

canvas.addEventListener('dblclick', (event) => {
  updatePointer(event);
  const object = pickScene();
  if (object?.userData.type === 'city') selectCity(object.userData.city, true);
}, { passive: true });

canvas.addEventListener('pointerleave', () => {
  pointerState.hovered = null;
  ui.hideHover();
}, { passive: true });

function countSemanticRoles() {
  const roles = {};
  scene.traverse((object) => {
    const role = object.userData?.benchRole;
    if (role) roles[role] = (roles[role] ?? 0) + 1;
  });
  return roles;
}

function citySnapshot(city) {
  const era = ERAS[runtime.eraIndex];
  const faction = assignFaction(era, city.lon, city.lat);
  return {
    id: city.id,
    name: city.name,
    historicalName: getCityNameAtYear(city, era.year),
    region: city.region,
    biome: city.biome,
    signature: city.signature,
    founded: city.founded,
    importance: city.importance,
    factionId: faction?.id ?? null,
    factionName: faction?.name ?? null,
    eraId: era.id,
  };
}

function snapshot() {
  const era = ERAS[runtime.eraIndex];
  const territoryStats = territoryLayer.getStats();
  const cityStats = cityLayer.getStats();
  const render = renderer.info.render;
  return {
    version: PROJECT_VERSION,
    ready: runtime.ready,
    eraIndex: runtime.eraIndex,
    eraId: era.id,
    year: era.year,
    yearLabel: formatYear(era.year),
    eraLabel: era.label,
    factionCount: era.factions.length,
    eventCount: era.events.length,
    externalPowerCount: era.external.length,
    territoryHash: territoryStats.signature,
    territoryTiles: territoryStats.tileCount,
    cityCount: cityStats.cityCount,
    cityStyle: cityStats.style,
    detailCities: cityStats.detailCities,
    midCities: cityStats.midCities,
    markerCities: cityStats.markerCities,
    selectedCityId: runtime.selectedCityId,
    playing: runtime.playing,
    segment: { ...runtime.segment },
    layers: { ...runtime.layers },
    quality: QUALITY_PRESETS[runtime.qualityIndex].id,
    fps: runtime.fps,
    drawCalls: render.calls,
    triangles: render.triangles,
    memory: { ...renderer.info.memory },
    terrain: terrain.stats,
    roles: countSemanticRoles(),
  };
}

function updateSystems(deltaSeconds) {
  const dt = THREE.MathUtils.clamp(Number(deltaSeconds) || 0, 0, 0.1);
  runtime.elapsed += dt;
  if (runtime.playing) {
    runtime.playAccumulator += dt;
    if (runtime.playAccumulator >= runtime.playInterval) {
      runtime.playAccumulator %= runtime.playInterval;
      advanceEra();
    }
  }

  cameraRig.update(dt);
  atmosphere.update(runtime.elapsed, dt);
  territoryLayer.update(dt);
  cityLayer.update(camera, runtime.elapsed, dt);
  eventLayer.update(runtime.elapsed, dt);
}

function renderFrame(now = performance.now()) {
  const deltaSeconds = Math.min(Math.max(0, (now - previousFrame) / 1000), 0.1);
  previousFrame = now;
  updateSystems(deltaSeconds);
  renderer.render(scene, camera);

  fpsFrames += 1;
  fpsElapsed += deltaSeconds;
  hudElapsed += deltaSeconds;
  if (fpsElapsed >= 0.5) {
    runtime.fps = fpsFrames / Math.max(fpsElapsed, 0.001);
    fpsFrames = 0;
    fpsElapsed = 0;
  }
  if (hudElapsed >= 0.35) {
    const cityStats = cityLayer.getStats();
    ui.setStats({
      fps: runtime.fps,
      draws: renderer.info.render.calls,
      cityCount: cityStats.cityCount,
      detailCities: cityStats.detailCities,
    });
    hudElapsed = 0;
  }

  frameHandle = requestAnimationFrame(renderFrame);
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  updateQuality();
}
addEventListener('resize', resize, { passive: true });

const bench = {
  version: PROJECT_VERSION,
  get ready() {
    return runtime.ready;
  },
  scene,
  camera,
  renderer,
  eras: ERAS.map((era) => ({ id: era.id, year: era.year, label: era.label })),
  cities: CITIES.map((city) => ({ id: city.id, name: city.name, region: city.region })),
  setEra(value) {
    return setEra(value, { pause: true });
  },
  focusCity(cityId) {
    return selectCity(cityId, true);
  },
  overview,
  setLayer,
  setQuality(value) {
    const index = typeof value === 'number'
      ? THREE.MathUtils.clamp(Math.trunc(value), 0, QUALITY_PRESETS.length - 1)
      : QUALITY_PRESETS.findIndex((preset) => preset.id === value);
    if (index < 0) throw new RangeError(`未知画质: ${value}`);
    runtime.qualityIndex = index;
    return updateQuality();
  },
  setSegment(start, end) {
    return setSegment({ start, end });
  },
  play(playing = true) {
    setPlaying(playing);
    return runtime.playing;
  },
  step(deltaSeconds = 1 / 60, iterations = 1) {
    const count = THREE.MathUtils.clamp(Math.floor(iterations), 0, 36000);
    for (let index = 0; index < count; index += 1) updateSystems(deltaSeconds);
    return snapshot();
  },
  getTerritoryAt(lon, lat) {
    const faction = assignFaction(ERAS[runtime.eraIndex], Number(lon), Number(lat));
    return faction ? {
      id: faction.id,
      name: faction.name,
      controlType: faction.controlType,
      color: faction.color,
    } : null;
  },
  getCity(cityId) {
    const city = CITIES.find((candidate) => candidate.id === cityId);
    return city ? citySnapshot(city) : null;
  },
  getTerritoryHash() {
    return territoryLayer.signature;
  },
  getMetrics: snapshot,
  reset() {
    setPlaying(false);
    clearCitySelection();
    runtime.segment = { start: 0, end: ERAS.length - 1 };
    setEra(0);
    cameraRig.overview(0.05);
    return snapshot();
  },
};
window.__BENCH__ = bench;

function showFatal(error) {
  console.error(error);
  const loading = document.querySelector('#loading');
  if (!loading) return;
  loading.innerHTML = '';
  const box = document.createElement('div');
  const title = document.createElement('strong');
  const detail = document.createElement('small');
  title.textContent = '沙盘初始化失败';
  detail.textContent = String(error?.message ?? error);
  box.append(title, detail);
  loading.append(box);
}

try {
  atmosphere.setEra(ERAS[0]);
  cityLayer.update(camera, 0, 0);
  territoryLayer.update(0);
  eventLayer.update(0, 0);
  cameraRig.update(0);
  renderer.render(scene, camera);
  runtime.ready = true;
  frameHandle = requestAnimationFrame(renderFrame);
  requestAnimationFrame(() => ui.setLoading('山河卷轴已就绪', true));
} catch (error) {
  showFatal(error);
}

addEventListener('beforeunload', () => {
  cancelAnimationFrame(frameHandle);
  atmosphere.dispose();
  eventLayer.dispose();
  cityLayer.dispose();
  territoryLayer.dispose();
  terrain.dispose();
  cameraRig.dispose();
  renderer.dispose();
}, { once: true });
