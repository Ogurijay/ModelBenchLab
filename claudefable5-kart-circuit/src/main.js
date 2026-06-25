import * as THREE from 'three';
import { createTrack, isOnTrack } from './sim/track.js';
import { createKart, stepKart } from './sim/kart.js';
import { createRace, updateRace, raceProgress, compareProgress } from './sim/race.js';
import { createItems, updateItems, useItem } from './sim/items.js';
import { createAiController } from './sim/ai.js';
import { createScene, updateChaseCamera } from './render/scene.js';
import { buildTrackVisuals } from './render/trackMesh.js';
import { createKartModel } from './render/kartModel.js';
import { createDriftSparks } from './render/effects.js';
import { createHud } from './ui/hud.js';
import { createMinimap } from './ui/minimap.js';

const HARD_BOUNDARY = 6; // 路缘到围栏的距离，与 trackMesh.js 的 FENCE_OFFSET 一致
const COUNTDOWN_SECONDS = 3.5;

const container = document.getElementById('app');
const { renderer, scene, camera } = createScene(container);
const track = createTrack();
const items = createItems(track);

// ---- 选手配置：玩家从最后一排出发 ----
const ROSTER = [
  { name: 'AI 蓝', color: 0x3c6fd2, cssColor: '#5d8be0', isPlayer: false, maxSpeed: 30 },
  { name: 'AI 绿', color: 0x3cb054, cssColor: '#54c46d', isPlayer: false, maxSpeed: 28.5 },
  { name: 'AI 紫', color: 0x9b59b6, cssColor: '#b07cc6', isPlayer: false, maxSpeed: 27 },
  { name: '玩家', color: 0xd23c3c, cssColor: '#ff6b5d', isPlayer: true, maxSpeed: 32 },
];

function spawnPose(slot) {
  const row = Math.floor(slot / 2);
  const lane = (slot % 2 === 0 ? -1 : 1) * 2.8;
  const p = track.pointAt(track.total - (5 + row * 5.5));
  const heading = track.headingAt(p.index);
  // 左向量 = (cos h, -sin h)
  return {
    x: p.x + Math.cos(heading) * lane,
    z: p.z - Math.sin(heading) * lane,
    heading,
  };
}

const racers = ROSTER.map((cfg, slot) => ({
  ...cfg,
  slot,
  kart: createKart({ ...spawnPose(slot), maxSpeed: cfg.maxSpeed }),
  race: createRace(track),
  ai: cfg.isPlayer ? null : createAiController(track, { lookahead: 13 + slot * 1.5 }),
  model: createKartModel(cfg.color),
  lastInput: {},
}));
for (const racer of racers) scene.add(racer.model.group);
const player = racers.find((r) => r.isPlayer);

const trackVisuals = buildTrackVisuals(scene, track, player.race, items);
const sparks = createDriftSparks(scene);
const hud = createHud(container);
const minimap = createMinimap(container, track);

// ---- 输入 ----
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  keys.add(e.code);
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') && phase === 'racing') {
    useItem(player.kart);
  }
  if (e.code === 'KeyR') resetGame();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function readPlayerInput() {
  const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
    - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const steer = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)
    - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
  return { throttle, steer, drift: keys.has('Space') };
}

// ---- 状态机 ----
let phase = 'countdown';
let countdown = COUNTDOWN_SECONDS;
let goTimer = 0;

function resetGame() {
  for (const racer of racers) {
    racer.kart = createKart({ ...spawnPose(racer.slot), maxSpeed: racer.maxSpeed });
    racer.race = createRace(track);
    racer.lastInput = {};
  }
  for (const box of items.boxes) box.cooldown = 0;
  phase = 'countdown';
  countdown = COUNTDOWN_SECONDS;
  hud.hideResults();
  hud.showMessage('');
}

// ---- 简单的车车分离，避免互相穿模 ----
function separateKarts() {
  for (let i = 0; i < racers.length; i += 1) {
    for (let j = i + 1; j < racers.length; j += 1) {
      const a = racers[i].kart;
      const b = racers[j].kart;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001 && dist < 2.1) {
        const push = (2.1 - dist) / 2;
        const nx = dx / dist;
        const nz = dz / dist;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        a.speed *= 0.97;
        b.speed *= 0.97;
      }
    }
  }
}

// 围栏硬边界：超出即推回并损失速度。
function clampToFence(kart) {
  const near = track.nearest(kart.x, kart.z);
  const maxDist = track.halfWidth + HARD_BOUNDARY - 0.6;
  if (near.dist > maxDist) {
    const p = track.points[near.index];
    const nx = (kart.x - p.x) / near.dist;
    const nz = (kart.z - p.z) / near.dist;
    kart.x = p.x + nx * maxDist;
    kart.z = p.z + nz * maxDist;
    kart.speed *= 0.55;
  }
}

// ---- 主循环 ----
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (phase === 'countdown') {
    countdown -= dt;
    if (countdown <= 0) {
      phase = 'racing';
      goTimer = 0.9;
      hud.showMessage('GO!');
    } else {
      hud.showMessage(String(Math.ceil(countdown - 0.5) || 'GO!'));
    }
  } else if (goTimer > 0) {
    goTimer -= dt;
    if (goTimer <= 0) hud.showMessage('');
  }

  if (phase !== 'countdown') {
    for (const racer of racers) {
      const input = racer.isPlayer
        ? (phase === 'racing' || !racer.race.finished ? readPlayerInput() : {})
        : racer.ai(racer.kart);
      racer.lastInput = input;
      const onTrack = isOnTrack(track, racer.kart.x, racer.kart.z);
      stepKart(racer.kart, input, dt, { onTrack });
      clampToFence(racer.kart);
      // AI 拾到蘑菇立即使用
      if (!racer.isPlayer && racer.kart.items.length > 0) useItem(racer.kart);
    }
    separateKarts();
    updateItems(items, racers.map((r) => r.kart), dt);
    for (const racer of racers) {
      updateRace(racer.race, racer.kart, dt);
    }
    sparks.emitFrom(player.kart);
  }

  // 排名
  const order = [...racers].sort((a, b) =>
    compareProgress(raceProgress(a.race, a.kart), raceProgress(b.race, b.kart)));
  const playerPosition = order.indexOf(player);

  if (phase === 'racing' && player.race.finished) {
    phase = 'finished';
    hud.showResults({ race: player.race, position: playerPosition });
  }

  for (const racer of racers) racer.model.update(racer.kart, racer.lastInput, dt);
  trackVisuals.update(dt);
  sparks.update(dt);
  updateChaseCamera(camera, player.kart, dt);
  hud.update({ kart: player.kart, race: player.race, position: playerPosition });
  minimap.draw(racers);

  renderer.render(scene, camera);
}

camera.position.set(player.kart.x, 5, player.kart.z - 10);
frame();
