// 暴风城还原 — 装配流水线 + 主循环 + 调试钩子
import * as THREE from 'three';
import GUI from 'lil-gui';
import * as coords from './world/coords.js';
import { createMaterials } from './core/materials.js';
import { CollisionWorld } from './core/collision.js';
import { Builder } from './core/builder.js';
import { Player, makeOverviewControls, makeTour } from './player/controls.js';
import { Hud } from './ui/hud.js';
import { installSceneHook } from './debug/scene-hook.js';
import { createArtDirectorPanel } from './debug/art-director-panel.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const params = new URLSearchParams(location.search);
const BLOCKOUT = params.has('blockout');
const DEBUG = params.has('debug');

// ---------- 渲染器 ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.2, 4000);

// 后处理：GTAO 给白石叠白石补上 AO 与接触阴影（Critic R1：墙根、台阶、底座都"摆在地上"而不是"长在地上"）
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.blendIntensity = 1.0;
gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.5, thickness: 2.0, scale: 1.1, samples: 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 9, rings: 3, samples: 16 }); // R3：近景颗粒噪点 → 加大降噪
// 半分辨率计算 AO（降噪后上采样混合），1080p 下省掉约 3/4 的 AO 开销
const gtaoSetSize = gtao.setSize.bind(gtao);
gtao.setSize = (w, h) => gtaoSetSize(Math.ceil(w / 2), Math.ceil(h / 2));
gtao.setSize(innerWidth, innerHeight);
composer.addPass(gtao);
composer.addPass(new OutputPass());

// ---------- 共享上下文（各模块唯一的依赖入口）----------
const updates = [];
const ctx = {
  THREE,
  scene,
  camera,
  renderer,
  coords,
  mat: createMaterials(),
  collision: new CollisionWorld(),
  rng: coords.rngFor,
  builder: (opts) => new Builder(ctx, opts),
  // 光源登记：{ x,y,z, color, intensity, range, kind:'lamp'|'fire'|'forge'|'arcane'|'window'|'candle', nightOnly, flicker }
  lights: { list: [], add(l) { this.list.push(l); return l; }, active: 0 },
  // 室内 LOD：group 默认隐藏，相机靠近才显示
  interiors: { list: [], add(group, x, z, r = 42) { group.visible = false; this.list.push({ group, x, z, r }); }, on: 0 },
  // 特效发射点登记（烟囱、喷泉等），由大气模块消费
  fx: { smoke: [], sparks: [] },
  hollowCount: 0, // 可进入建筑计数（民居模块累加）
  onUpdate(fn) { updates.push(fn); },
  // 昼夜环境（大气模块每帧写入；其他模块只读）
  env: { hour: 15.5, night: 0, sunDir: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  // 美术总监参数：模块可以往 panelSchema 里追加条目
  settings: { hour: 15.5, daySpeed: 0, exposure: 1.0, fog: 1.0, ao: params.has('noao') ? 0 : 1 },
  panelSchema: [
    { key: 'hour', label: '时间（时）', min: 0, max: 24, step: 0.05, folder: '昼夜' },
    { key: 'daySpeed', label: '一天时长（分钟，0 = 暂停）', min: 0, max: 30, step: 0.5, folder: '昼夜' },
    { key: 'exposure', label: '曝光', min: 0.3, max: 2.5, step: 0.01, folder: '画面' },
    { key: 'fog', label: '雾浓度倍率', min: 0, max: 3, step: 0.01, folder: '画面' },
    { key: 'ao', label: '环境光遮蔽（GTAO）强度', min: 0, max: 1.5, step: 0.01, folder: '画面' },
  ],
  mode: 'walk',
  player: null,
  indoor: false,
  views: null, // 评审机位表（模块可追加：ctx.views.myView = ctx.viewAt([...], [...])）
  viewAt: null,
};
window.__ctx = ctx; // 调试用
if (params.has('hour')) ctx.settings.hour = +params.get('hour');

// ---------- 装配 ----------
const player = (ctx.player = new Player(ctx));
const overview = makeOverviewControls(camera, canvas);
const tour = makeTour();
let tourT = 0;
const hud = new Hud();

const loading = document.getElementById('loading-text');
async function assemble() {
  const found = import.meta.glob('./world/*/index.js');
  const all = ['terrain', 'walls', 'houses', 'landmarks', 'atmosphere'];
  const only = params.get('only')?.split(',').filter(Boolean);
  const order = BLOCKOUT ? ['blockout'] : only || all;
  const t0 = performance.now();
  for (const name of order) {
    const loader = found[`./world/${name}/index.js`];
    if (!loader) {
      console.warn(`模块 ${name} 不存在，跳过`);
      continue;
    }
    loading.textContent = `正在建造：${name}…`;
    await new Promise((r) => setTimeout(r, 0)); // 让进度文字刷新
    const mod = await loader();
    const t = performance.now();
    await mod.build(ctx);
    if (mod.update) updates.push(mod.update);
    console.info(`[build] ${name} ${(performance.now() - t).toFixed(0)} ms`);
  }
  // 单模块自测时的兜底：没有地形就铺一块平地，没有大气就给基础天光
  if (!BLOCKOUT && !order.includes('terrain') && !order.includes('blockout')) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a9a6a }));
    g.position.y = -0.02;
    g.receiveShadow = true;
    g.userData.ground = true;
    scene.add(g);
  }
  if (!BLOCKOUT && !order.includes('atmosphere') && !order.includes('blockout')) {
    scene.background = new THREE.Color(0xa9c8e8);
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b5a45, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d8, 3);
    sun.position.set(-300, 420, 260);
    sun.target.position.set(40, 0, -60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -450, right: 450, top: 450, bottom: -450, near: 10, far: 1400 });
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);
  }
  console.info(`[build] 全部完成 ${(performance.now() - t0).toFixed(0)} ms，碰撞盒 ${ctx.collision.boxes.length}`);
}

// ---------- 模式切换 ----------
function setMode(m) {
  ctx.mode = m;
  overview.enabled = m === 'overview';
  camera.near = m === 'walk' ? 0.2 : 1.5;
  camera.updateProjectionMatrix();
  if (m === 'overview') {
    camera.position.set(560, 380, 420);
    overview.target.set(40, 0, -60);
    overview.update();
    document.exitPointerLock?.();
  }
  if (m === 'tour') {
    tourT = 0;
    document.exitPointerLock?.();
  }
}

// ---------- 输入 ----------
let locked = false;
document.addEventListener('pointerlockchange', () => (locked = document.pointerLockElement === canvas));
canvas.addEventListener('click', () => ctx.mode === 'walk' && !locked && canvas.requestPointerLock());
document.getElementById('enter').addEventListener('click', () => canvas.requestPointerLock());
document.addEventListener('mousemove', (e) => locked && player.look(e.movementX, e.movementY));
addEventListener('keydown', (e) => {
  if (e.target.closest?.('.lil-gui')) return;
  player.keys.add(e.code);
  if (e.code === 'KeyV') setMode(ctx.mode === 'walk' ? 'overview' : 'walk');
  if (e.code === 'KeyT') setMode(ctx.mode === 'tour' ? 'overview' : 'tour');
  if (e.code === 'KeyF') player.fly = !player.fly;
  if (e.code === 'KeyR') ctx.settings.daySpeed = ctx.settings.daySpeed ? 0 : 4;
  if (e.code === 'KeyH') document.getElementById('help').classList.toggle('hidden');
  if (e.code === 'Space' && ctx.mode === 'walk') e.preventDefault();
});
addEventListener('keyup', (e) => player.keys.delete(e.code));
addEventListener('blur', () => player.keys.clear());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- 主循环 ----------
let simTime = 0;
let lodTimer = 0;
const _v = new THREE.Vector3();

function updateInteriors(force) {
  let on = 0;
  const cx = camera.position.x;
  const cz = camera.position.z;
  const near = ctx.mode === 'walk' || hook.captureMode;
  for (const it of ctx.interiors.list) {
    const vis = force === 'all' || (near && Math.hypot(it.x - cx, it.z - cz) < it.r && camera.position.y < 80);
    it.group.visible = vis;
    if (vis) on++;
  }
  ctx.interiors.on = on;
}

function step(dt) {
  simTime += dt;
  const s = ctx.settings;
  if (s.daySpeed > 0) s.hour = (s.hour + (dt / (s.daySpeed * 60)) * 24) % 24;
  renderer.toneMappingExposure = s.exposure;

  if (!hook.captureMode) {
    if (ctx.mode === 'walk') {
      player.update(dt);
      player.applyTo(camera);
    } else if (ctx.mode === 'overview') {
      overview.update();
    } else if (ctx.mode === 'tour') {
      tourT = (tourT + dt / tour.duration) % 1;
      camera.position.copy(tour.pos.getPointAt(tourT));
      camera.lookAt(tour.tgt.getPointAt(tourT));
    }
  }
  camera.updateMatrixWorld();
  ctx.indoor = ctx.mode === 'walk' && ctx.collision.ceilingAt(camera.position.x, camera.position.z, 0.2, camera.position.y, 30) < Infinity;
  for (const fn of updates) fn(dt, simTime, ctx);
  lodTimer -= dt;
  if (lodTimer <= 0 || hook.captureMode) {
    updateInteriors();
    lodTimer = 0.2;
  }
}

renderer.info.autoReset = false; // 后处理一帧里有多次 render：手动清零，统计才是整帧的
function render() {
  renderer.info.reset();
  gtao.enabled = ctx.settings.ao > 0;
  gtao.blendIntensity = ctx.settings.ao;
  composer.render();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  render();
  const info = renderer.info.render;
  hud.update(dt, {
    region: player.region,
    indoor: ctx.indoor,
    hour: ctx.settings.hour,
    night: ctx.env.night,
    mode: ctx.mode,
    fly: player.fly,
    calls: info.calls,
    tris: info.triangles,
    hollow: ctx.hollowCount,
    interiorsOn: ctx.interiors.on,
    lightsOn: ctx.lights.active,
    lightsTotal: ctx.lights.list.length,
    locked,
    capture: hook.captureMode,
  });
}

// ---------- 调试钩子（ModelBenchLab 约定 __bench + 3d-scene-builder 截图钩子）----------
const bench = (window.__bench = {
  ready: false,
  stepFrame(n = 1) {
    for (let i = 0; i < n; i++) step(1 / 60);
    render();
    return this.getState();
  },
  getState() {
    const p = player.pos;
    return {
      mode: ctx.mode,
      pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
      onGround: player.onGround,
      region: player.region,
      indoor: ctx.indoor,
      hour: +ctx.settings.hour.toFixed(2),
      night: +ctx.env.night.toFixed(2),
      hollowBuildings: ctx.hollowCount,
      colliders: ctx.collision.boxes.length,
      interiorsLoaded: ctx.interiors.on,
      lights: { active: ctx.lights.active, registered: ctx.lights.list.length },
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  },
  teleport(x, y, z, yaw, pitch) {
    setMode('walk');
    player.teleport(x, y, z, yaw, pitch);
    player.applyTo(camera);
  },
  key(code, frames = 30) {
    player.keys.add(code);
    this.stepFrame(frames);
    player.keys.delete(code);
    return this.getState();
  },
  setHour(h) {
    ctx.settings.hour = h;
    step(0);
  },
  setMode,
  probe: (x, z) => ctx.collision.probe(x, z),
  lights: () => ctx.lights.list.filter((l) => l._slot != null).map((l) => ({ kind: l.kind, x: l.x, z: l.z })),
  setSize(w, h) {
    renderer.setSize(w, h);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  },
});

// 评审机位：函数形式，自己摆相机、定时间，保证每张图条件一致
const at = (pos, target, hour = 15.5, fov = 60) => ({ camera }) => {
  ctx.settings.hour = hour;
  camera.fov = fov;
  camera.position.set(...pos);
  camera.lookAt(...target);
  camera.near = pos[1] > 60 ? 1.5 : 0.2;
  camera.updateProjectionMatrix();
};
const gate = coords.valleyToWorld(0, 166);
const gateT = coords.valleyToWorld(0, 60);
const lot0 = coords.LOTS.find((l) => l.district === 'trade' && l.face === 'S');
const views = {
  overview: at([560, 380, 420], [40, 0, -60], 15.5, 50),
  closeup: at([-30, 2.2, 26], [-46, 4, 36]),
  low: at([-25, 0.5, -26], [10, 2, -40]),
  gate: at([gate[0], 1.7, gate[1]], [gateT[0], 8, gateT[1]]),
  cathedral: at([-36, 2, -104], [-55, 17, -168]), // 偏离中轴，免得广场喷泉挡住正门
  keep: at([240, 1.8, -74], [262, 18, -170]),
  nave: at([-55, 1.7, -158], [-55, 8, -210]),
  interior: lot0 ? at([(lot0.r[0] + lot0.r[2]) / 2 - 2, 1.7, (lot0.r[1] + lot0.r[3]) / 2], [(lot0.r[0] + lot0.r[2]) / 2 + 3, 1.6, (lot0.r[1] + lot0.r[3]) / 2 + 3]) : at([0, 2, 0], [1, 2, 1]),
  night: at([560, 380, 420], [40, 0, -60], 22, 50),
  nightStreet: at([-30, 2.2, 26], [10, 3, 0], 21.5),
};
ctx.views = views;
ctx.viewAt = at;
const hook = installSceneHook({
  THREE, renderer, scene, camera, views, target: bench,
  render: () => { step(0); render(); },
});

// ---------- 启动 ----------
try {
  await assemble();
} catch (e) {
  console.error(e);
  loading.textContent = `建造失败：${e.message}`;
  throw e;
}
document.getElementById('loading').classList.add('done');

const panel = createArtDirectorPanel({
  GUI,
  settings: ctx.settings,
  schema: ctx.panelSchema,
  onChange: () => {},
  title: '暴风城 · 参数',
});
if (!DEBUG) panel.close();

setMode(params.get('mode') === 'overview' ? 'overview' : 'walk');
player.applyTo(camera);
step(0);
render();
hook.markReady(); // 同步标记：隐藏 tab 里 rAF 不跑
renderer.setAnimationLoop(frame);
