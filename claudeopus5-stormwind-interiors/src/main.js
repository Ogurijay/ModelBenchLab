// 入口:装配整座王都并驱动主循环。
// 装配顺序 = 城市的建造顺序:地形 → 城墙 → 运河与桥 → 街区房屋(含内景) → 地标 → 配景 → 天空与人。
import * as THREE from 'three';
import { Rng } from './core/prng.js';
import { createMaterials } from './core/materials.js';
import { Collision } from './core/collider.js';
import { buildPlan, districtAt, CITY, inWater } from './world/plan.js';
import { buildTerrain, makeHeightField, waterPartition, WATER_Y } from './world/terrain.js';
import { buildWalls } from './world/walls.js';
import { buildCathedral, buildKeep } from './world/landmarks.js';
import { buildProps, buildTrees } from './world/props.js';
import { buildCity, meshesFrom } from './world/buildings.js';
import { createWater } from './world/water.js';
import { createSky } from './world/sky.js';
import { createCitizens } from './world/npc.js';
import { createLightPool, createSmoke } from './world/effects.js';
import { createController } from './player/controls.js';
import { createHud } from './ui/hud.js';
import { createMinimap } from './ui/minimap.js';
import { createPanel } from './ui/panel.js';

const SEED = 20260727;

/* ---------------- 渲染器 ---------------- */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
// 预览面板未显示时 innerWidth 为 0,直接 setSize(0,0) 会得到一张空画布
renderer.setSize(innerWidth || 1600, innerHeight || 900);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // 0.185 起 PCFSoft 已废弃,用它会打一条控制台警告
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 4000);
camera.position.set(0, 215, 440);
camera.lookAt(0, 20, 0);

/* ---------------- 载入进度 ---------------- */
const loadingEl = document.getElementById('loading');
const loadingSub = document.getElementById('loading-sub');
const loadingBar = document.getElementById('loading-bar-fill');
// 让帧:优先等一帧好让进度条真的刷新;但标签页隐藏时 rAF 会停摆,
// 所以同时挂一个定时器兜底 —— 否则后台标签里整个装配流程会卡死在第一步。
const nextFrame = () => new Promise((r) => {
  let done = false;
  const fin = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(fin);
  setTimeout(fin, 50);
});
async function phase(text, pct, fn) {
  loadingSub.textContent = text;
  loadingBar.style.width = pct + '%';
  await nextFrame();
  return fn();
}

/* ---------------- 世界 ---------------- */
const rng = new Rng(SEED);
const collision = new Collision(8);
const M = createMaterials();
const heightAt = makeHeightField(SEED % 1000);
const plan = buildPlan(SEED);

const world = { emitters: [] };
let city = null, sky = null, citizens = null, water = null, smoke = null, lightPool = null;

async function assemble() {
  await phase('铺设地基与街道…', 8, () => {
    const t = buildTerrain(M, heightAt);
    scene.add(t.group);
    collision.addMany(t.boxes);
  });

  await phase('垒砌城墙与狮王之门…', 20, () => {
    const w = buildWalls(M, rng);
    const g = new THREE.Group();
    g.name = 'walls';
    for (const m of meshesFrom(w.collector.parts, M)) g.add(m);
    scene.add(g);
    collision.addMany(w.boxes);
    world.emitters.push(...w.collector.emitters);
  });

  await phase('营造圣光大教堂…', 34, () => {
    const c = buildCathedral(rng);
    const g = new THREE.Group();
    g.name = 'cathedral';
    for (const m of meshesFrom(c.collector.parts, M)) g.add(m);
    scene.add(g);
    collision.addMany(c.boxes);
    world.emitters.push(...c.collector.emitters);
  });

  await phase('修建王座城堡…', 46, () => {
    const k = buildKeep(rng);
    const g = new THREE.Group();
    g.name = 'keep';
    for (const m of meshesFrom(k.collector.parts, M)) g.add(m);
    scene.add(g);
    collision.addMany(k.boxes);
    world.emitters.push(...k.collector.emitters);
  });

  await phase('起造民居、店铺与工坊(含全部内景)…', 66, () => {
    city = buildCity(plan, M);
    scene.add(city.group);
    collision.addMany(city.boxes);
    world.emitters.push(...city.emitters);
  });

  await phase('架桥、立灯、摆摊、泊船…', 80, () => {
    const p = buildProps(plan, rng);
    const g = new THREE.Group();
    g.name = 'props';
    for (const m of meshesFrom(p.collector.parts, M)) g.add(m);
    scene.add(g);
    collision.addMany(p.boxes);
    world.emitters.push(...p.collector.emitters);

    // 树:城内 + 城外森林
    const spots = p.treeSpots.slice();
    const forest = rng.fork(999);
    for (let i = 0; i < 620; i++) {
      const a = forest.next() * Math.PI * 2;
      const d = 250 + forest.next() * 780;
      const x = Math.sin(a) * d, z = Math.cos(a) * d;
      if (Math.abs(z - 21) < 42) continue;             // 河谷不种树
      const y = heightAt(x, z);
      if (y < -1 || y > 70) continue;
      spots.push({ x, y, z, s: 0.9 + forest.next() * 0.9, collide: false });
    }
    const trees = buildTrees(M, spots, rng.fork(31), heightAt);
    scene.add(trees.group);
    collision.addMany(trees.boxes);
  });

  await phase('引水入城…', 88, () => {
    water = createWater(waterPartition(), WATER_Y, [
      [-1400, 10, -206, 32], [206, 10, 1400, 32],
    ]);
    scene.add(water.mesh);
  });

  await phase('点亮天光与炊烟…', 95, () => {
    sky = createSky(scene, renderer);
    lightPool = createLightPool(scene, 10);
    lightPool.setEmitters(world.emitters);
    smoke = createSmoke(city.smoke.length ? city.smoke : [{ x: 0, y: 20, z: 0, rate: 1 }], 7);
    scene.add(smoke.points);
    citizens = createCitizens(M, 64, rng.fork(555));
    scene.add(citizens.group);
  });

  await phase('城门开启', 100, () => {
    collision.build();
  });
}

/* ---------------- 传送点 ---------------- */
const SPOTS = {
  gate: { x: 0, z: 176, y: 6, yaw: 0, name: '狮王之门', sub: 'THE LION GATE' },
  plaza: { x: 0, z: 104, y: 6, yaw: 0, name: '交易广场', sub: 'TRADE SQUARE' },
  bridge: { x: 0, z: 30, y: 8, yaw: 0, name: '英雄桥', sub: "HEROES' BRIDGE" },
  cathedral: { x: -122, z: -28, y: 4, yaw: 0, name: '圣光大教堂 · 中殿', sub: 'THE CATHEDRAL NAVE' },
  throne: { x: 0, z: -136, y: 14, yaw: 0, name: '王座厅', sub: 'THE THRONE HALL' },
  wall: { x: 72, z: 195, y: 13, yaw: Math.PI / 2, name: '城墙马道', sub: 'THE RAMPARTS' },
  harbor: { x: -166, z: 64, y: 4, yaw: Math.PI / 2, name: '西港栈桥', sub: 'WESTQUAY PIER' },
  garden: { x: 133, z: -112, y: 6, yaw: 0, name: '王家花园', sub: "KING'S GARDEN" },
  forge: { x: -100, z: 97, y: 6, yaw: 0, name: '熔炉工坊区', sub: 'THE FORGE WARD' },
  oldtown: { x: 120, z: 141, y: 6, yaw: 0, name: '旧城民居', sub: 'OLD TOWN' },
};

function groundAt(x, z) {
  return heightAt(x, z);
}

function dropTo(x, z, startY) {
  const s = collision.supportY(x, z, startY, 0, 0.3);
  const g = groundAt(x, z);
  return Math.max(isFinite(s) ? s : -Infinity, g);
}

/* ---------------- 主循环与交互 ---------------- */
let controls = null, hud = null, minimap = null, panel = null;
let autoDay = false, xray = false, elapsed = 0;
const placeName = document.getElementById('place-name');
const placeSub = document.getElementById('place-sub');
const placeBox = document.getElementById('place');
const hintEl = document.getElementById('hint');
const crosshair = document.getElementById('crosshair');
let lastPlace = '';
let hintTimer = 0;

function showPlace(name, sub) {
  if (name === lastPlace) return;
  lastPlace = name;
  placeName.textContent = name;
  placeSub.textContent = sub || '';
  placeBox.style.opacity = '1';
  clearTimeout(showPlace._t);
  showPlace._t = setTimeout(() => { placeBox.style.opacity = '0.0'; }, 2600);
}

function teleport(key) {
  if (key === 'random-house') {
    const list = city.interiors.filter((i) => i.kind !== 'warehouse');
    const it = list[Math.floor(Math.random() * list.length)];
    const y = dropTo(it.x, it.z, 1.2);        // 落在一层地板,不要被二层楼板接住
    controls.setMode('walk');
    controls.teleport(it.x, Math.max(y, 0.34), it.z, Math.PI);
    const d = districtAt(it.x, it.z);
    showPlace(`${d.name} · 民居内`, 'INSIDE A HOUSE');
    return;
  }
  const s = SPOTS[key];
  if (!s) return;
  const y = dropTo(s.x, s.z, s.y);
  controls.setMode('walk');
  controls.teleport(s.x, y, s.z, s.yaw);
  showPlace(s.name, s.sub);
}

function setMode(mode) {
  controls.setMode(mode);
  panel.setMode(mode);
  crosshair.classList.toggle('hidden', mode === 'orbit');
  hintEl.classList.remove('hidden');
  hintTimer = 0;
  if (mode === 'orbit') showPlace('王都上空', 'STORMHOLD FROM ABOVE');
}

function setXray(on) {
  xray = on;
  city.setXray(on);
  panel.setXray(on);
}

function bindUi() {
  hud = createHud(document.getElementById('hud'));
  minimap = createMinimap(document.getElementById('minimap'), plan);
  panel = createPanel(document.getElementById('panel'), {
    setMode, teleport, setXray,
    setTime: (h) => { sky.setTime(h); panel.setTime(h); },
    setAutoDay: (v) => { autoDay = v; },
    setAutoOrbit: (v) => { controls.state.autoOrbit = v; },
    setShadow: (v) => { renderer.shadowMap.enabled = v; scene.traverse((o) => { if (o.isMesh) o.material.needsUpdate = true; }); },
    setNpc: (v) => { citizens.group.visible = v; },
    setResolution: (v) => renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * v),
  });
  panel.setMode('orbit');
  panel.setTime(sky.state.hours);

  renderer.domElement.addEventListener('click', () => {
    if (controls.mode === 'orbit') setMode('walk');
    else controls.requestLock();
  });

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') setMode(controls.mode === 'fly' ? 'walk' : 'fly');
    else if (e.code === 'KeyR') setXray(!xray);
    else if (e.code === 'KeyM') setMode('orbit');
  });
}

const camPos = new THREE.Vector3();
let visibleInteriors = 0;

function frame(dt) {
  elapsed += dt;
  if (autoDay) { sky.setTime(sky.state.hours + dt * 0.22); panel.setTime(sky.state.hours); }
  M.setNight(sky.night);

  controls.update(dt);
  camera.getWorldPosition(camPos);
  sky.focusShadow(camPos);
  sky.update(dt, elapsed);
  water.update(elapsed, sky);
  smoke.update(dt, 0.55);
  if (citizens.group.visible) citizens.update(dt, elapsed);
  lightPool.update(dt, camPos, sky.night, elapsed);
  visibleInteriors = city.updateVisibility(camPos, xray);

  if (controls.mode !== 'orbit') {
    const d = districtAt(camPos.x, camPos.z);
    showPlace(d.name, d.sub);
    hintTimer += dt;
    if (hintTimer > 9) hintEl.classList.add('hidden');
  }

  minimap.update(camPos, controls.mode === 'orbit' ? Math.atan2(camPos.x, camPos.z) + Math.PI : controls.state.yaw);
  renderer.render(scene, camera);
  hud.update(dt, renderer, camPos, { orbit: '全景巡游', walk: '第一人称', fly: '自由飞行' }[controls.mode], visibleInteriors);
}

function resize() {
  if (innerWidth < 2 || innerHeight < 2) return;   // 面板未显示时不要把画布缩成 0
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
// 面板从隐藏变为显示时窗口尺寸才真正确定下来,补一次同步
addEventListener('visibilitychange', () => { if (!document.hidden) resize(); });

/* ---------------- 启动 ---------------- */
let raf = 0, prev = performance.now();
function loop(now) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  frame(dt);
}

(async function start() {
  try {
    await assemble();
    controls = createController(camera, renderer.domElement, collision, groundAt);
    controls.onUnlock = () => { hintEl.classList.remove('hidden'); hintTimer = 0; };
    bindUi();
    renderer.render(scene, camera);
    loadingEl.classList.add('hidden');
    showPlace('暴风王都', 'STORMHOLD');
    prev = performance.now();
    raf = requestAnimationFrame(loop);
    exposeBench();
  } catch (err) {
    loadingSub.textContent = '构建失败: ' + (err && err.message);
    loadingSub.style.color = '#e88';
    console.error(err);
  }
})();

/* ---------------- 评测钩子 ---------------- */
function exposeBench() {
  window.__BENCH__ = {
    ready: true,
    seed: SEED,
    project: 'claudeopus5-stormwind-interiors',
    stats() {
      const r = renderer.info.render;
      return {
        fps: Math.round(hud.fps),
        drawCalls: r.calls,
        triangles: r.triangles,
        buildings: city.stats.buildings,
        interiorTriangles: city.stats.interiorTris,
        visibleInteriors,
        colliders: collision.count,
        emitters: world.emitters.length,
        hours: +sky.state.hours.toFixed(2),
        mode: controls.mode,
        position: camPos.toArray().map((v) => +v.toFixed(2)),
      };
    },
    spots: Object.keys(SPOTS),
    /** 光源池现状(排障用:看 8~10 盏动态灯当前派到了哪里)。 */
    lights() {
      return lightPool.lights.map((s) => ({
        on: s.light.visible,
        i: +s.light.intensity.toFixed(2),
        d: s.light.distance,
        p: s.light.position.toArray().map((v) => +v.toFixed(1)),
        night: !!s.src?.night,
      }));
    },
    teleport: (k) => teleport(k),
    setMode,
    setTime: (h) => { sky.setTime(h); panel.setTime(h); },
    setXray,
    /** 手动推进一帧(隐藏标签页 / 自动化测试用)。 */
    step(dt = 1 / 60) { frame(dt); return { pos: camPos.toArray().map((v) => +v.toFixed(2)), grounded: controls.state.grounded }; },
    /** 模拟按键,用来跑"走进屋 / 上楼梯"这类端到端验证。 */
    key(code, down = true) {
      dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    },
    /** 隐藏标签页里 rAF 会停摆,取证时用它强制出一帧(含室内显隐与光源改派)。 */
    renderNow() {
      camera.updateMatrixWorld(true);
      camera.getWorldPosition(camPos);
      sky.focusShadow(camPos);
      M.setNight(sky.night);
      visibleInteriors = city.updateVisibility(camPos, xray);
      lightPool.update(1, camPos, sky.night, elapsed);   // dt=1 强制立刻改派光源
      water.update(elapsed, sky);
      renderer.render(scene, camera);
      return true;
    },
    /** 面板未显示时窗口尺寸为 0,取证前先给画布一个确定的分辨率。 */
    setSize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      return [w, h];
    },
    /** 从指定位置看向指定点,用于稳定取景。 */
    setView(pos, target) {
      controls.setMode('fly', { at: new THREE.Vector3(pos[0], pos[1], pos[2]) });
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.lookAt(target[0], target[1], target[2]);
      controls.state.yaw = Math.atan2(-(target[0] - pos[0]), -(target[2] - pos[2]));
      const dy = target[1] - pos[1];
      const dh = Math.hypot(target[0] - pos[0], target[2] - pos[2]);
      controls.state.pitch = Math.atan2(dy, dh);
      camera.updateMatrixWorld(true);
      return true;
    },
    inWater,
    cityBounds: CITY,
    scene,          // 排障用:可按 name 逐组隐藏定位穿帮几何
    /** 排障:某点脚下都压着哪些碰撞盒。 */
    probe(x, z) {
      return { ground: groundAt(x, z), support: collision.supportY(x, z, 400, 0, 0.3), boxes: collision.debugAt(x, z) };
    },
  };
}

addEventListener('beforeunload', () => {
  cancelAnimationFrame(raf);
  controls?.dispose();
  sky?.dispose();
  citizens?.dispose();
  smoke?.dispose();
  renderer.dispose();
}, { once: true });
