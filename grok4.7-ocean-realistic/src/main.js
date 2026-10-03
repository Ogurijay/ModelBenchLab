import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  atmosphereGradient,
  dayFactor,
  smoothstep,
  sunDirection,
  sunLightColor
} from './atmosphere.js';
import { FloatSim } from './buoyancy.js';
import { createGui, refreshGui } from './gui.js';
import { PRESETS, beaufort, formatHour } from './presets.js';
import {
  BOAT_SAMPLES,
  ISLAND,
  createBarrel,
  createBoat,
  createBuoy,
  createCrate,
  createIsland
} from './props.js';
import { createSky, createStars, syncSky } from './sky.js';
import { createSeaMesh, snapSea, syncWater } from './water.js';
import { approachWaves, buildSea, cloneWaves, sampleSurface, significantHeight } from './waves.js';

const SEED = 20261002;
const HOME = {
  camera: new THREE.Vector3(24, 8.6, 28),
  target: new THREE.Vector3(-2.5, 1.4, -2)
};

const root = document.getElementById('canvas-root');
const statsEl = document.getElementById('hud-stats');
const presetEl = document.getElementById('presets');
const loadingEl = document.getElementById('loading');

const gold = PRESETS.find((preset) => preset.id === 'gold');
const params = {
  preset: gold.id,
  windSpeed: gold.windSpeed,
  windDeg: gold.windDeg,
  steepness: gold.steepness,
  swellHeight: gold.swellHeight,
  swellDeg: gold.swellDeg,
  hour: gold.hour,
  clouds: gold.clouds,
  exposure: gold.exposure,
  foam: 1,
  ripple: 1,
  timeScale: 1,
  wireframe: false,
  paused: false,
  follow: false,
  spawn: 'crate'
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 820 ? 1.25 : 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = params.exposure;
renderer.shadowMap.enabled = window.innerWidth >= 820;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#9eb0be', 0.0055);
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.6, 7000);
camera.position.copy(HOME.camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 6.5;
controls.maxDistance = 150;
controls.maxPolarAngle = Math.PI * 0.492;
controls.update();

const hemi = new THREE.HemisphereLight('#d7e4ee', '#1c3330', 0.55);
scene.add(hemi);
const fill = new THREE.DirectionalLight('#d5e2ea', 0.7);
fill.position.set(-30, 24, 36);
scene.add(fill);
const sun = new THREE.DirectionalLight('#fff0dc', 3);
sun.castShadow = renderer.shadowMap.enabled;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);
scene.add(sun.target);

const sky = createSky();
scene.add(sky);
const stars = createStars();
scene.add(stars);

const mobile = window.innerWidth < 820;
const levels = [
  createSeaMesh(mobile ? 110 : 156, mobile ? 100 : 176, 0, -2),
  createSeaMesh(mobile ? 380 : 540, mobile ? 72 : 116, mobile ? 46 : 66, -1),
  createSeaMesh(mobile ? 1500 : 2000, mobile ? 42 : 58, mobile ? 170 : 240, 0)
];
levels.forEach((mesh, index) => {
  mesh.renderOrder = index;
  scene.add(mesh);
});

const sim = new FloatSim();
sim.island = ISLAND;

const boat = createBoat();
boat.position.set(3.1, 0.05, 1.2);
boat.rotation.y = 0.45;
scene.add(boat);
const boatBody = sim.add(boat, {
  samples: BOAT_SAMPLES,
  mass: 2400,
  inertia: 15000,
  area: 1.05,
  drag: 480,
  righting: 36000,
  moorK: 42,
  moorDamp: 240,
  radius: 4.4,
  kind: 'boat',
  home: { x: 3.1, z: 1.2 }
});

const buoyA = createBuoy('#d4533c');
buoyA.position.set(11.2, 0.45, 7.6);
buoyA.scale.setScalar(1.65);
scene.add(buoyA);
sim.add(buoyA, buoyOptions(90, { x: 11.2, z: 7.6 }));

const buoyB = createBuoy('#2f8f62');
buoyB.position.set(-3.4, 0.45, 10.2);
buoyB.scale.setScalar(1.65);
scene.add(buoyB);
sim.add(buoyB, buoyOptions(86, { x: -3.4, z: 10.2 }));

const crateA = createCrate();
crateA.position.set(8.2, 0.55, 11.4);
crateA.rotation.y = 0.4;
crateA.scale.setScalar(1.45);
scene.add(crateA);
sim.add(crateA, crateOptions({ x: 8.2, z: 11.4 }));

const crateB = createCrate();
crateB.position.set(0.4, 0.55, 12.6);
crateB.rotation.y = -0.5;
crateB.scale.setScalar(1.45);
scene.add(crateB);
sim.add(crateB, crateOptions({ x: 0.4, z: 12.6 }));

const barrel = createBarrel();
barrel.position.set(4.6, 0.6, 14.2);
barrel.scale.setScalar(1.45);
scene.add(barrel);
sim.add(barrel, barrelOptions({ x: 4.6, z: 14.2 }));

const island = createIsland();
scene.add(island);

const spawned = [];
const timer = new THREE.Timer();
timer.connect(document);
let simTime = 0;
let fps = 60;
const shadowAnchor = new THREE.Vector3(-10, 0, -6);
const followOffset = new THREE.Vector3(-11, 6.2, 8);
const followDesired = new THREE.Vector3();
const followLook = new THREE.Vector3();

const sunDir = new THREE.Vector3();
const windDir = new THREE.Vector2(1, 0);
const heading = new THREE.Vector2(1, 0);
const forward = new THREE.Vector3();
const camXZ = new THREE.Vector2();
const state = {
  time: 0,
  ripple: 1,
  clouds: 0.3,
  foam: 1,
  fogDensity: 0.0026,
  boatSpeed: 0,
  center: new THREE.Vector2(),
  cam: camXZ,
  boat: new THREE.Vector2(),
  heading,
  windDir,
  sunDir,
  sunColor: [1, 1, 1],
  island: new THREE.Vector3(ISLAND.x, ISLAND.z, ISLAND.radius),
  waves: null,
  wireframe: false
};

let live = null;

function seaInput() {
  return {
    windSpeed: params.windSpeed,
    windDirection: params.windDeg * Math.PI / 180,
    steepness: params.steepness,
    swellHeight: params.swellHeight,
    swellDirection: params.swellDeg * Math.PI / 180,
    seed: SEED
  };
}

function sampleAt(x, z) {
  const sample = sampleSurface(live, x, z, simTime);
  return { height: sample.height, velocity: sample.velocity };
}

function buoyOptions(mass, home) {
  return {
    samples: [
      { x: 0.22, y: -0.42, z: 0.22 },
      { x: -0.22, y: -0.42, z: 0.22 },
      { x: 0.22, y: -0.42, z: -0.22 },
      { x: -0.22, y: -0.42, z: -0.22 }
    ],
    mass,
    inertia: 80,
    area: 0.045,
    drag: 32,
    righting: 720,
    moorK: 64,
    moorDamp: 36,
    radius: 1.15,
    kind: 'buoy',
    home
  };
}

function crateOptions(home, spawnedFlag = false) {
  return {
    samples: [
      { x: 0.28, y: -0.3, z: 0.28 },
      { x: -0.28, y: -0.3, z: 0.28 },
      { x: 0.28, y: -0.3, z: -0.28 },
      { x: -0.28, y: -0.3, z: -0.28 }
    ],
    mass: 34,
    inertia: 18,
    area: 0.025,
    drag: 18,
    righting: 320,
    moorK: spawnedFlag ? 0 : 8,
    moorDamp: spawnedFlag ? 0 : 6,
    radius: 0.55,
    kind: 'crate',
    spawned: spawnedFlag,
    home
  };
}

function barrelOptions(home, spawnedFlag = false) {
  return {
    samples: [
      { x: 0.3, y: -0.22, z: 0.12 },
      { x: -0.3, y: -0.22, z: -0.12 },
      { x: 0, y: -0.28, z: 0 },
      { x: 0.1, y: -0.16, z: -0.2 }
    ],
    mass: 42,
    inertia: 22,
    area: 0.03,
    drag: 20,
    righting: 280,
    moorK: spawnedFlag ? 0 : 8,
    moorDamp: spawnedFlag ? 0 : 6,
    radius: 0.6,
    kind: 'barrel',
    spawned: spawnedFlag,
    home
  };
}

function removeBody(body) {
  sim.remove(body);
  body.object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
  body.object.removeFromParent();
}

function spawn(kind, x, z) {
  const dist = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  if (dist < ISLAND.radius + 1.5) return null;
  let object;
  let opts;
  if (kind === 'barrel') {
    object = createBarrel();
    opts = barrelOptions({ x, z }, true);
  } else if (kind === 'buoy') {
    object = createBuoy(spawned.length % 2 ? '#2f8f62' : '#d4533c');
    opts = buoyOptions(68, { x, z });
    opts.spawned = true;
    opts.moorK = 0;
    opts.moorDamp = 0;
  } else {
    object = createCrate();
    opts = crateOptions({ x, z }, true);
  }
  const water = sampleAt(x, z);
  object.position.set(x, water.height + 0.35, z);
  object.rotation.y = Math.random() * Math.PI;
  scene.add(object);
  const body = sim.add(object, opts);
  spawned.push(body);
  while (spawned.length > 16) removeBody(spawned.shift());
  return body;
}

function clearSpawned() {
  while (spawned.length) removeBody(spawned.pop());
}

function markPreset() {
  [...presetEl.children].forEach((button) => {
    button.classList.toggle('active', button.dataset.id === params.preset);
  });
}

function applyPreset(preset) {
  params.preset = preset.id;
  params.windSpeed = preset.windSpeed;
  params.windDeg = preset.windDeg;
  params.steepness = preset.steepness;
  params.swellHeight = preset.swellHeight;
  params.swellDeg = preset.swellDeg;
  params.hour = preset.hour;
  params.clouds = preset.clouds;
  params.exposure = preset.exposure;
  renderer.toneMappingExposure = preset.exposure;
  refreshGui(gui);
  markPreset();
}

function resetView() {
  params.follow = false;
  camera.position.copy(HOME.camera);
  controls.target.copy(HOME.target);
  refreshGui(gui);
}

const gui = createGui(params, {
  exposure: (value) => { renderer.toneMappingExposure = value; },
  reset: resetView
});

for (const preset of PRESETS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.id = preset.id;
  button.textContent = `${preset.key} ${preset.name}`;
  button.addEventListener('click', () => applyPreset(preset));
  presetEl.appendChild(button);
}
markPreset();

function syncSea(dt) {
  const built = buildSea(seaInput());
  if (!live) live = cloneWaves(built.waves);
  else approachWaves(live, built.waves, 1 - Math.exp(-dt * 1.6));
  state.waves = live;
  return built;
}

function updateLights() {
  const dir = sunDirection(params.hour);
  sunDir.set(dir.x, dir.y, dir.z);
  state.sunColor = sunLightColor(dir.y);
  const day = dayFactor(dir.y);
  sun.intensity = 0.05 + 3.15 * day;
  sun.color.setRGB(state.sunColor[0], state.sunColor[1], state.sunColor[2], THREE.LinearSRGBColorSpace);
  sun.position.copy(sunDir).multiplyScalar(100).add(shadowAnchor);
  sun.target.position.copy(shadowAnchor);
  hemi.intensity = 0.1 + 0.48 * day;
  fill.intensity = 0.12 + 0.58 * day;
  const skyCol = atmosphereGradient(0.75, dir.y);
  const groundCol = atmosphereGradient(0.02, dir.y);
  hemi.color.setRGB(skyCol[0], skyCol[1], skyCol[2], THREE.LinearSRGBColorSpace);
  hemi.groundColor.setRGB(groundCol[0] * 0.4, groundCol[1] * 0.45, groundCol[2] * 0.4, THREE.LinearSRGBColorSpace);
  scene.fog.color.setRGB(groundCol[0], groundCol[1], groundCol[2], THREE.LinearSRGBColorSpace);
  scene.fog.density = 0.0042 + params.clouds * 0.0045;

  const night = smoothstep(0.16, -0.02, dir.y);
  const blink = ((simTime * 0.22) % 1) < 0.18 ? 1 : 0.12;
  island.userData.lamp.intensity = night * (8 + blink * 26);
  island.userData.lampMat.emissiveIntensity = 0.08 + night * blink * 2.6;
  stars.material.opacity = night * 0.95;
  for (const body of sim.bodies) {
    const lamp = body.object.userData.lamp;
    if (!lamp) continue;
    const phase = body.home.x * 0.3;
    lamp.emissiveIntensity = 0.15 + night * (0.5 + 0.5 * Math.sin(simTime * 2.2 + phase));
  }
}

function paintHud(built) {
  const sea = beaufort(params.windSpeed);
  const hs = significantHeight(live);
  const above = camera.position.y > sampleAt(camera.position.x, camera.position.z).height + 0.4;
  statsEl.innerHTML = [
    ['海况', `${sea.level} 级 ${sea.name}`],
    ['有效波高', `${hs.toFixed(2)} m`],
    ['风速', `${params.windSpeed.toFixed(1)} m/s`],
    ['时刻', formatHour(params.hour)],
    ['帧率', `${Math.round(fps)}`],
    ['相机', above ? '海面之上' : '过低']
  ].map(([name, value]) => `<div><span>${name}</span><b>${value}</b></div>`).join('');
  return { hs, above, builtHs: built.hs };
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hitPoint = new THREE.Vector3();
const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null;
let press = null;

function pointerNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function bodyFrom(object) {
  let node = object;
  while (node) {
    if (node.userData.floater) return node.userData.floater;
    node = node.parent;
  }
  return null;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerNDC(event);
  raycaster.setFromCamera(pointer, camera);
  const roots = sim.bodies.map((body) => body.object);
  const hits = raycaster.intersectObjects(roots, true);
  const body = hits.length ? bodyFrom(hits[0].object) : null;
  press = { x: event.clientX, y: event.clientY, body, moved: 0 };
  if (body) params.follow = false;
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!press) return;
  press.moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
  if (!drag && press.body && press.moved > 5) {
    drag = { body: press.body, x: event.clientX, y: event.clientY, t: performance.now(), vx: 0, vz: 0 };
    drag.body.kinematic = true;
    controls.enabled = false;
  }
  if (!drag) return;
  pointerNDC(event);
  raycaster.setFromCamera(pointer, camera);
  const water = sampleAt(drag.body.object.position.x, drag.body.object.position.z);
  waterPlane.constant = -(water.height + 0.2);
  if (!raycaster.ray.intersectPlane(waterPlane, hitPoint)) return;
  const now = performance.now();
  const dt = Math.max(0.016, (now - drag.t) / 1000);
  drag.vx = (hitPoint.x - drag.body.object.position.x) / dt;
  drag.vz = (hitPoint.z - drag.body.object.position.z) / dt;
  drag.t = now;
  drag.body.object.position.x = hitPoint.x;
  drag.body.object.position.z = hitPoint.z;
  drag.body.object.position.y = water.height + 0.25;
  drag.body.velocity.set(0, 0, 0);
});

function endPointer(event) {
  if (drag) {
    drag.body.velocity.set(
      THREE.MathUtils.clamp(drag.vx, -12, 12),
      0.4,
      THREE.MathUtils.clamp(drag.vz, -12, 12)
    );
    drag.body.kinematic = false;
    controls.enabled = true;
    drag = null;
  } else if (press && press.moved < 6 && !press.body) {
    pointerNDC(event);
    raycaster.setFromCamera(pointer, camera);
    waterPlane.constant = 0;
    if (raycaster.ray.intersectPlane(waterPlane, hitPoint)) {
      if (hitPoint.length() < 280) spawn(params.spawn, hitPoint.x, hitPoint.z);
    }
  }
  press = null;
}

renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointerleave', () => {
  if (drag) {
    drag.body.kinematic = false;
    controls.enabled = true;
    drag = null;
  }
  press = null;
});

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === 'Space') {
    params.paused = !params.paused;
    event.preventDefault();
  } else if (event.key === 'h' || event.key === 'H') {
    document.body.classList.toggle('ui-hidden');
  } else if (event.key === 'f' || event.key === 'F') {
    params.follow = !params.follow;
    refreshGui(gui);
  } else if (event.key === 'c' || event.key === 'C') {
    clearSpawned();
  } else if (event.key >= '1' && event.key <= '5') {
    const preset = PRESETS.find((item) => item.key === event.key);
    if (preset) applyPreset(preset);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (window.innerWidth < 800) gui.close();
});

syncSea(1);
for (let i = 0; i < 150; i++) {
  simTime += 1 / 60;
  sim.step(1 / 60, sampleAt);
}

const bench = {
  ready: false,
  setPreset(id) {
    const preset = PRESETS.find((item) => item.id === id || item.key === String(id));
    if (preset) applyPreset(preset);
  },
  spawn(kind, x = 2, z = 8) { return spawn(kind, x, z); },
  sampleHeight(x, z) { return sampleAt(x, z).height; },
  getState() {
    const water = sampleAt(camera.position.x, camera.position.z);
    return {
      ready: bench.ready,
      preset: params.preset,
      windSpeed: params.windSpeed,
      hour: params.hour,
      clouds: params.clouds,
      hs: significantHeight(live),
      fps,
      paused: params.paused,
      follow: params.follow,
      floaters: sim.bodies.length,
      cameraAboveWater: camera.position.y > water.height + 0.8,
      cameraY: camera.position.y,
      waterY: water.height
    };
  }
};
window.__bench = bench;

function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  fps += ((dt > 0 ? 1 / dt : 60) - fps) * 0.08;
  if (!params.paused) simTime += dt * params.timeScale;

  const built = syncSea(params.paused ? 0 : dt);
  if (!params.paused) sim.step(dt * params.timeScale, sampleAt);

  windDir.set(Math.cos(params.windDeg * Math.PI / 180), Math.sin(params.windDeg * Math.PI / 180));
  updateLights();

  forward.set(1, 0, 0).applyQuaternion(boat.quaternion);
  const headingLen = Math.hypot(forward.x, forward.z) || 1;
  heading.set(forward.x / headingLen, forward.z / headingLen);
  state.time = simTime;
  state.ripple = params.ripple;
  state.clouds = params.clouds;
  state.foam = params.foam;
  state.wireframe = params.wireframe;
  state.boatSpeed = Math.hypot(boatBody.velocity.x, boatBody.velocity.z);
  state.boat.set(boat.position.x, boat.position.z);
  camXZ.set(camera.position.x, camera.position.z);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  syncSky(sky, state);

  for (const mesh of levels) {
    snapSea(mesh, camera);
    state.center.set(mesh.position.x, mesh.position.z);
    syncWater(mesh.material, state);
  }

  controls.enabled = !drag;
  if (params.follow && !drag) {
    followDesired.copy(followOffset).applyQuaternion(boat.quaternion).add(boat.position);
    followLook.copy(boat.position);
    followLook.y += 1.6;
    const blend = 1 - Math.exp(-dt * 3.2);
    camera.position.lerp(followDesired, blend);
    controls.target.lerp(followLook, blend);
  }
  controls.update();

  const under = sampleAt(camera.position.x, camera.position.z);
  const minY = under.height + 1.55;
  if (camera.position.y < minY) camera.position.y = minY;
  const targetWater = sampleAt(controls.target.x, controls.target.z);
  if (controls.target.y < targetWater.height + 0.35) controls.target.y = targetWater.height + 0.35;

  renderer.render(scene, camera);
  const hud = paintHud(built);
  if (!bench.ready) {
    bench.ready = true;
    loadingEl.remove();
  }
  bench._hud = hud;
  requestAnimationFrame(frame);
}

updateLights();
syncSky(sky, state);
requestAnimationFrame(frame);
