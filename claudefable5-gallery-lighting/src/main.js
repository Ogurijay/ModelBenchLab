// ============================================================
// main.js — 回声画廊:装配渲染器 / 场景 / 系统模块 / 帧循环
//   渲染:WebGL2 + ACESFilmic + PCF 阴影 + PMREM 程序化环境
// ============================================================
import * as THREE from 'three';
import { createTextures } from './textures.js';
import { buildRoom } from './room.js';
import { buildExhibits } from './exhibits.js';
import { setupLighting } from './lighting.js';
import { createPlayer } from './controls.js';
import { createUI } from './ui.js';
import { installBench } from './bench.js';

// ---------- 渲染器 ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('fatal').classList.remove('hidden');
  document.getElementById('overlay').classList.add('hidden');
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // three 0.185 已弃用 PCFSoft(会告警并回退 PCF)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0b0e);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.05, 100);

// ---------- 程序化纹理与 PMREM 环境(地面/金属反射层次) ----------
const textures = createTextures(renderer.capabilities.getMaxAnisotropy());
const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromEquirectangular(textures.envMap);
scene.environment = envRT.texture;
scene.environmentIntensity = 0.6;
pmrem.dispose();

// ---------- 场景装配 ----------
const room = buildRoom(scene, textures);
const exhibits = buildExhibits(scene, textures);
const lighting = setupLighting(scene, renderer, exhibits.list, room);

const player = createPlayer(camera, {
  bounds: room.bounds,
  boxes: [...room.boxColliders, ...exhibits.boxColliders],
  cylinders: exhibits.cylColliders,
});

const ui = createUI({
  controls: player.controls,
  onToggleSky: () => ui.setSky(lighting.toggle()),
});
ui.setSky(lighting.isOn());

// ---------- 展品说明浮层(距离 + 朝向触发) ----------
const _dv = new THREE.Vector3();
const _fwd = new THREE.Vector3();
function updateCaption() {
  camera.getWorldDirection(_fwd);
  let best = null;
  let bestScore = 0;
  for (const e of exhibits.list) {
    _dv.subVectors(e.focus, camera.position);
    const dist = _dv.length();
    if (dist > 4.2) continue;
    _dv.normalize();
    const dot = _dv.dot(_fwd);
    if (dot < 0.45) continue;
    const score = dot / (0.6 + dist);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  ui.setCaption(best);
}

// ---------- 帧循环与调试钩子 ----------
const timer = new THREE.Timer();
let fps = 0;
let fpsFrames = 0;
let fpsTime = 0;

function update(dt) {
  player.update(dt);
  exhibits.update(dt);
  lighting.update(dt);
  updateCaption();
}
function render() {
  renderer.render(scene, camera);
}

function getState() {
  const p = camera.position;
  const dir = camera.getWorldDirection(new THREE.Vector3());
  return {
    ready: benchApi.ready,
    time: Math.round(timer.getElapsed() * 1000) / 1000,
    fps,
    player: {
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      dirX: +dir.x.toFixed(3), dirY: +dir.y.toFixed(3), dirZ: +dir.z.toFixed(3),
      locked: player.controls.isLocked,
    },
    skylight: lighting.getState(),
    lights: lighting.getCounts(),
    exhibitCount: exhibits.list.length,
    exhibits: exhibits.list.map((e) => ({ id: e.id, kind: e.kind, title: e.title })),
    renderInfo: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    },
  };
}

const benchApi = installBench({
  update,
  render,
  getState,
  setSkylight: (on) => {
    const state = lighting.setSkylight(!!on);
    ui.setSky(state);
    return state;
  },
});

renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  update(dt);
  render();
  if (!benchApi.ready) benchApi.ready = true;
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
    ui.setFps(fps);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
