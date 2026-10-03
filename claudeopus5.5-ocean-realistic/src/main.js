import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { Ocean } from './ocean/ocean.js';
import { createOceanGrid } from './ocean/grid.js';
import { createWaterMaterial, bindOceanTextures } from './ocean/waterMaterial.js';
import { createFoamTexture } from './ocean/foamTexture.js';
import { beaufort } from './ocean/spectrum.js';
import { Sky } from './sky/sky.js';
import { BuoyancyWorld } from './physics/buoyancy.js';
import { createFloater, animateLamps, FLOATER_TYPES } from './objects/floaters.js';
import { Splashes, Rain } from './fx/particles.js';
import { PRESETS, PRESET_ORDER } from './presets.js';
import { createGui } from './ui/gui.js';
import { mulberry32 } from './core/rng.js';

// ---------- 画质档位 ----------
const query = new URLSearchParams(location.search);
const touch = navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 900;
const QUALITY = (query.get('quality') || (touch ? 'low' : 'high')) === 'low'
  ? { name: 'low', N: 128, H: 170, s0: 0.3, n1: 60, cube: 128, samples: 0, dpr: 1.5 }
  : { name: 'high', N: 256, H: 340, s0: 0.18, n1: 110, cube: 256, samples: 4, dpr: 2 };

const root = document.getElementById('canvas-root');
const loading = document.getElementById('loading');

function fatal(msg) {
  loading.innerHTML = `<div class="load-title">无法启动</div><div class="load-sub">${msg}</div>`;
  throw new Error(msg);
}

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
if (!renderer.capabilities.isWebGL2) fatal('需要 WebGL2。');
if (!renderer.extensions.has('EXT_color_buffer_float')) fatal('显卡不支持浮点渲染目标（EXT_color_buffer_float）。');
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.dpr));
renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight), 0.1, 40000);
camera.position.set(13, 4.2, 17);

// ---------- 设置（GUI 绑定） ----------
const START = 'breeze';
const settings = {
  preset: START,
  sea: { ...PRESETS[START].sea, directionality: 1 },
  sky: { ...PRESETS[START].sky },
  water: { ...PRESETS[START].water },
  look: {
    deepColor: '#02111d',
    scatterColor: '#0d6b68',
    sss: 1.0,
    roughness: 0.06,
    foamAmount: 1.0,
    foamThreshold: 0.12
  },
  foam: { bias: 0.8, decay: 0.9, gain: 1.0 },
  fogKm: 9,
  bloom: 0.22,
  timeScale: 1,
  paused: false,
  spawnType: 'crate',
  follow: false,
  cascades: { 0: true, 1: true, 2: true },
  debugView: 0,
  wireframe: false
};
settings.fogKm = Math.round(1 / settings.water.fog / 100) / 10;

// ---------- 海洋 ----------
const ocean = new Ocean(renderer, { N: QUALITY.N, sea: settings.sea });
const sky = new Sky(renderer, { cubeSize: QUALITY.cube });
sky.set(settings.sky);
scene.add(sky.mesh);

const grid = createOceanGrid({ H: QUALITY.H, s0: QUALITY.s0, n1: QUALITY.n1, R: 20000 });
const foamTexture = createFoamTexture(256);
const waterMat = createWaterMaterial({
  ocean,
  foamTexture,
  envTexture: sky.cubeTarget.texture,
  envMaxLod: sky.cubeMaxLod
});
const water = new THREE.Mesh(grid.geometry, waterMat);
water.frustumCulled = false;
scene.add(water);

const sun = new THREE.DirectionalLight(0xffffff, 1);
scene.add(sun, sun.target);

// ---------- 浮体 ----------
const world = new BuoyancyWorld(ocean);
const rand = mulberry32(4242);
const spawned = [];

function addBody(type, x, y, z, opts = {}) {
  const body = createFloater(type, opts);
  body.object.position.set(x, y, z);
  if (opts.yaw !== undefined) body.object.rotation.y = opts.yaw;
  body.object.traverse((o) => (o.userData.body = body));
  scene.add(body.object);
  world.add(body);
  return body;
}

const boat = addBody('boat', 0, ocean.heightAt(0, 0), 0, { yaw: 0.4 });
boat.anchor = { x: 0, z: 0, length: 6, stiffness: 1.2, lowerPoint: -0.3 };
for (const [x, z, color] of [[-16, -9, 'red'], [22, -26, 'green'], [-40, -60, 'green']]) {
  const buoy = addBody('buoy', x, ocean.heightAt(x, z), z, { color });
  buoy.anchor = { x, z, length: 2.5, stiffness: 2.5, lowerPoint: -0.6 };
}
for (const [t, x, z] of [['crate', 7, 6], ['barrel', 4, 10], ['ring', 9, 2], ['crate', -6, 9], ['barrel', -9, 3]]) {
  spawned.push(addBody(t, x, ocean.heightAt(x, z) + 0.2, z, { yaw: rand() * 6 }));
}

const splashes = new Splashes(QUALITY.name === 'low' ? 700 : 1500);
scene.add(splashes.points);
const rain = new Rain(QUALITY.name === 'low' ? 3500 : 9000);
scene.add(rain.lines);

// ---------- 后期 ----------
const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: QUALITY.samples });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)), settings.bloom, 0.35, 6);
// 太阳盘与 GGX 高光峰值可达数千，高通输入做软压缩，避免泛光糊满全屏
bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace(
  'gl_FragColor = mix( outputColor, texel, alpha );',
  `gl_FragColor = mix( outputColor, texel, alpha );
   gl_FragColor.rgb /= 1.0 + max( max( gl_FragColor.r, gl_FragColor.g ), gl_FragColor.b ) / 20.0;`
);
bloom.materialHighPassFilter.needsUpdate = true;
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- 相机 ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 2.5;
controls.maxDistance = 900;
controls.maxPolarAngle = Math.PI * 0.53;
controls.update();

// ---------- 预设与过渡 ----------
let skyTween = null;
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
};

const app = {
  settings,
  applyPreset(name, immediate = false) {
    const p = PRESETS[name];
    if (!p) return;
    settings.preset = name;
    Object.assign(settings.sea, p.sea);
    ocean.setSea(settings.sea, { immediate, duration: 4 });
    const from = { ...settings.sky, ...settings.water, fog: 1 / (settings.fogKm * 1000) };
    const to = { ...p.sky, ...p.water };
    if (immediate) {
      Object.assign(settings.sky, p.sky);
      Object.assign(settings.water, p.water);
      settings.fogKm = Math.round(1 / p.water.fog / 100) / 10;
      sky.set(settings.sky);
      skyTween = null;
    } else skyTween = { from, to, t: 0, duration: 3.5 };
    document.querySelectorAll('#presets button').forEach((b) => b.classList.toggle('active', b.dataset.preset === name));
  },
  onSeaChanged() {
    ocean.setSea(settings.sea, { duration: 1.2 });
  },
  onSkyChanged() {
    skyTween = null;
    sky.set(settings.sky);
  },
  onFogChanged() {
    skyTween = null;
    settings.water.fog = 1 / (settings.fogKm * 1000);
  },
  dropMany(n) {
    const types = Object.keys(FLOATER_TYPES).filter((t) => t !== 'boat' && t !== 'buoy');
    const c = controls.target;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 3 + rand() * 9;
      spawnAt(types[i % types.length], c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
    }
  },
  clearSpawned() {
    for (const b of spawned) {
      world.remove(b);
      scene.remove(b.object);
    }
    spawned.length = 0;
  }
};

function updateSkyTween(dt) {
  if (!skyTween) return;
  skyTween.t += dt;
  const k = Math.min(skyTween.t / skyTween.duration, 1);
  const e = k * k * (3 - 2 * k);
  const { from, to } = skyTween;
  settings.sky.elevation = lerp(from.elevation, to.elevation, e);
  settings.sky.azimuth = lerpAngle(from.azimuth, to.azimuth, e);
  settings.sky.coverage = lerp(from.coverage, to.coverage, e);
  settings.sky.storm = lerp(from.storm, to.storm, e);
  settings.water.rain = lerp(from.rain, to.rain, e);
  settings.water.exposure = lerp(from.exposure, to.exposure, e);
  settings.water.fog = Math.exp(lerp(Math.log(from.fog), Math.log(to.fog), e));
  settings.fogKm = Math.round(1 / settings.water.fog / 100) / 10;
  sky.set(settings.sky);
  if (k >= 1) skyTween = null;
}

// ---------- 交互：投放与拖拽 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerDown = null;
let grabbed = null;
const grabPlane = new THREE.Plane();

function setNdc(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function rayWater(ray) {
  if (ray.direction.y > -1e-3) return null;
  let h = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i < 6; i++) {
    const t = (h - ray.origin.y) / ray.direction.y;
    if (t < 0) return null;
    ray.at(t, p);
    h = ocean.heightAt(p.x, p.z);
  }
  return p;
}

function spawnAt(type, x, z) {
  const h = ocean.heightAt(x, z);
  const body = addBody(type, x, h + 3.5 + rand() * 2.5, z, { yaw: rand() * 6 });
  body.object.rotation.x = (rand() - 0.5) * 0.8;
  body.object.rotation.z = (rand() - 0.5) * 0.8;
  body.velocity.set(0, -1, 0);
  spawned.push(body);
  while (spawned.length > 60) {
    const old = spawned.shift();
    world.remove(old);
    scene.remove(old.object);
  }
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  setNdc(e);
  pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  const hits = raycaster.intersectObjects(world.bodies.map((b) => b.object), true);
  if (hits.length) {
    const body = hits[0].object.userData.body;
    // 抓取点：以重心为原点的物体局部坐标
    const local = body.object.worldToLocal(hits[0].point.clone());
    grabbed = body;
    body.grab = { local, target: hits[0].point.clone().add(new THREE.Vector3(0, 0.6, 0)) };
    grabPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), hits[0].point);
    controls.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
    document.body.classList.add('grabbing');
  }
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!grabbed) return;
  setNdc(e);
  const p = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(grabPlane, p)) {
    const floor = ocean.heightAt(p.x, p.z) + 0.4;
    p.y = Math.max(p.y, floor);
    grabbed.grab.target.copy(p);
  }
});

function endPointer(e) {
  if (grabbed) {
    grabbed.grab = null;
    grabbed = null;
    controls.enabled = true;
    document.body.classList.remove('grabbing');
    pointerDown = null;
    return;
  }
  if (!pointerDown) return;
  const moved = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
  const quick = performance.now() - pointerDown.t < 350;
  pointerDown = null;
  if (moved > 6 || !quick) return;
  setNdc(e);
  const p = rayWater(raycaster.ray);
  if (p && p.distanceTo(camera.position) < 400) spawnAt(settings.spawnType, p.x, p.z);
}
renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointercancel', endPointer);

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const i = Number(e.key) - 1;
  if (i >= 0 && i < PRESET_ORDER.length) app.applyPreset(PRESET_ORDER[i]);
  else if (e.code === 'Space') {
    settings.paused = !settings.paused;
    e.preventDefault();
  } else if (e.key === 'f' || e.key === 'F') settings.follow = !settings.follow;
  else if (e.key === 'c' || e.key === 'C') app.clearSpawned();
  else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('clean');
});

// ---------- HUD ----------
const presetBar = document.getElementById('presets');
PRESET_ORDER.forEach((key, i) => {
  const b = document.createElement('button');
  b.dataset.preset = key;
  b.innerHTML = `<kbd>${i + 1}</kbd>${PRESETS[key].label}`;
  b.addEventListener('click', () => app.applyPreset(key));
  presetBar.appendChild(b);
});
presetBar.querySelector(`[data-preset="${START}"]`).classList.add('active');
const hudStats = document.getElementById('hud-stats');
const gui = createGui(app);

let fps = 60;
let hudTimer = 0;
function updateHud(dt) {
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.25;
  const st = ocean.stats();
  const bf = beaufort(settings.sea.windSpeed);
  const q = ocean.query(boat.position.x, boat.position.z, {});
  hudStats.innerHTML = `
    <div><span>有效波高 H<sub>s</sub></span><b>${st.hs.toFixed(2)} m</b></div>
    <div><span>风浪峰周期 T<sub>p</sub></span><b>${st.tp.toFixed(1)} s</b></div>
    <div><span>峰值波长</span><b>${st.lp.toFixed(0)} m</b></div>
    <div><span>风</span><b>${settings.sea.windSpeed.toFixed(1)} m/s · ${bf.force} 级 ${bf.name}</b></div>
    <div><span>渔船处水面</span><b>${q.height >= 0 ? '+' : ''}${q.height.toFixed(2)} m</b></div>
    <div><span>浮体</span><b>${world.bodies.length}</b></div>
    <div><span>帧率</span><b>${fps.toFixed(0)} fps · ${QUALITY.name === 'low' ? '标准' : '高'}画质</b></div>`;
}

// ---------- 主循环 ----------
const clock = { last: performance.now(), lastFrame: performance.now() };
const PHYS_DT = 1 / 120;
let physAcc = 0;
let simTime = 0;
let frames = 0;
const tmpV = new THREE.Vector3();
const prevTarget = new THREE.Vector3().copy(controls.target);

function simulate(dt) {
  if (!settings.paused) {
    const step = dt * settings.timeScale;
    ocean.update(step);
    simTime += step;
    physAcc += step;
    let n = 0;
    while (physAcc >= PHYS_DT && n < 10) {
      world.step(PHYS_DT);
      physAcc -= PHYS_DT;
      n++;
    }
    if (n === 10) physAcc = 0;
    // 漂远或沉没的投放物回收
    for (let i = spawned.length - 1; i >= 0; i--) {
      const b = spawned[i];
      if (b.position.y < -40 || b.position.distanceTo(controls.target) > 2500) {
        world.remove(b);
        scene.remove(b.object);
        spawned.splice(i, 1);
      }
    }
    for (const ev of world.events) if (ev.type === 'splash') splashes.emit(ev.position, ev.strength);
    world.events.length = 0;
    splashes.update(step, ocean);
  }
}

function applyFrameState(dt) {
  updateSkyTween(dt);
  ocean.foam.bias = settings.foam.bias;
  ocean.foam.decay = settings.foam.decay;
  ocean.foam.gain = settings.foam.gain;
  renderer.toneMappingExposure = settings.water.exposure;
  bloom.strength = settings.bloom;

  // 相机：跟随渔船 + 不穿海面
  if (settings.follow) {
    tmpV.copy(boat.position).setY(boat.position.y + 0.8);
    controls.target.lerp(tmpV, Math.min(1, dt * 3));
  }
  tmpV.subVectors(controls.target, prevTarget);
  camera.position.add(tmpV);
  prevTarget.copy(controls.target);
  controls.update();
  const floor = ocean.heightAt(camera.position.x, camera.position.z) + 1.0;
  if (camera.position.y < floor) camera.position.y = floor;

  sky.update(settings.paused ? 0 : dt, camera, settings.sea.windDir, settings.sea.windSpeed);
  scene.environment = sky.envMap;
  sun.position.copy(sky.sunDir).multiplyScalar(100).add(controls.target);
  sun.target.position.copy(controls.target);
  sun.color.copy(sky.sunColor);
  sun.intensity = 1;

  const snap = grid.snap;
  water.position.set(Math.round(camera.position.x / snap) * snap, 0, Math.round(camera.position.z / snap) * snap);
  const u = waterMat.uniforms;
  bindOceanTextures(waterMat, ocean);
  u.uEnv.value = sky.cubeTarget.texture;
  u.uSunDir.value.copy(sky.sunDir);
  u.uSunColor.value.copy(sky.sunColor);
  // 阴天时云层把太阳打散，高光峰值随能见度平方衰减
  u.uSpecVis.value = Math.pow(sky.sunVisibility, 2);
  u.uDeepColor.value.set(settings.look.deepColor);
  u.uScatterColor.value.set(settings.look.scatterColor);
  u.uSSS.value = settings.look.sss;
  u.uRoughness.value = settings.look.roughness;
  u.uFoamAmount.value = settings.look.foamAmount;
  u.uFoamThreshold.value = settings.look.foamThreshold;
  u.uFoamBias.value = settings.foam.bias - 0.3;
  u.uFogDensity.value = settings.water.fog;
  u.uTime.value = simTime;
  const wa = (settings.sea.windDir * Math.PI) / 180;
  u.uWindDir.value.set(Math.cos(wa), Math.sin(wa));
  u.uWeights.value.set(+settings.cascades[0], +settings.cascades[1], +settings.cascades[2]);
  u.uDebug.value = settings.debugView;
  waterMat.wireframe = settings.wireframe;

  const amb = sky.sunColor.clone().multiplyScalar(0.06).addScalar(0.25 * sky.uniforms.uSunIllum.value / 12);
  splashes.material.uniforms.uLight.value.copy(amb);
  rain.material.color.setRGB(0.55, 0.6, 0.66).multiplyScalar(0.3 + sky.uniforms.uSunIllum.value / 24);
  rain.update(dt, camera, settings.water.rain, settings.sea.windDir, settings.sea.windSpeed);
  animateLamps(scene, simTime);
}

function render() {
  composer.render();
}

function frame(now) {
  const dt = Math.min(Math.max((now - clock.last) / 1000, 0), 1 / 20);
  clock.last = now;
  clock.lastFrame = performance.now();
  simulate(dt);
  applyFrameState(dt);
  render();
  updateHud(dt);
  frames++;
  if (frames === 2) loading.classList.add('done');
}

function loop(now) {
  frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// 后台标签页 rAF 停摆时兜底（无头测试也依赖它）
setInterval(() => {
  if (performance.now() - clock.lastFrame > 500) frame(performance.now());
}, 250);

// 面板/标签页尺寸可能短暂为 0，零尺寸渲染目标会让 WebGL 报 framebuffer 不完整
const viewSize = () => [Math.max(1, window.innerWidth), Math.max(1, window.innerHeight)];
window.addEventListener('resize', () => {
  const [w, h] = viewSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// ---------- 无头测试接口 ----------
window.__bench = {
  get ready() {
    return frames > 0;
  },
  get frames() {
    return frames;
  },
  quality: QUALITY.name,
  ocean,
  world,
  sky,
  camera,
  controls,
  settings,
  app,
  // 确定性推进：固定步长模拟 n 步后渲染一帧
  step(n = 1, dt = 1 / 60) {
    for (let i = 0; i < n; i++) {
      simulate(dt);
      applyFrameState(dt);
    }
    render();
    return { time: simTime, bodies: world.bodies.length };
  },
  setPreset(name) {
    app.applyPreset(name, true);
  },
  view(pos, target) {
    camera.position.set(...pos);
    controls.target.set(...target);
    prevTarget.copy(controls.target);
    controls.update();
  },
  snapshot(type = 'image/jpeg', quality = 0.9) {
    render();
    return renderer.domElement.toDataURL(type, quality);
  },
  // CPU 副本与 GPU 结果比对：返回若干网格点的高度差
  cpuGpuCheck() {
    const out = [];
    for (let c = 0; c < 2; c++) {
      const cc = ocean.cpu.cascades[c];
      const N = ocean.N;
      const stride = N / cc.M;
      for (const [gx, gz] of [[0, 0], [5, 9], [17, 40], [33, 2], [60, 61]]) {
        const gpu = ocean.gpu.readDisplacement(c, gx * stride, gz * stride);
        out.push({ cascade: c, cpu: cc.dy[gz * cc.M + gx], gpu: gpu[1] });
      }
    }
    return out;
  },
  spawn(type, x, z) {
    spawnAt(type, x, z);
  },
  gui
};
