import * as THREE from 'three';
import { AudioSystem } from './audio/AudioSystem.js';
import { GameSimulation, FIXED_DT, runTeleportSelfTest } from './game/GameSimulation.js';
import { runPortalComplianceTest } from './game/portalCompliance.js';
import { InputController } from './input/InputController.js';
import { PortalSystem } from './render/PortalSystem.js';
import { UIController } from './ui/UIController.js';
import { createFacility, createPhaseCube } from './world/Facility.js';

const app = document.getElementById('app');
const fatal = document.getElementById('fatal');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  fatal.classList.remove('hidden');
  document.getElementById('entry').classList.add('hidden');
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.055, 100);
const audio = new AudioSystem();
const ui = new UIController();
const input = new InputController(renderer.domElement);
// 部分 Chromium 版本的 requestPointerLock 返回 void，覆盖为兼容两种签名的实现。
input.lock = () => {
  const request = renderer.domElement.requestPointerLock({ unadjustedMovement: true });
  request?.catch?.(() => renderer.domElement.requestPointerLock());
};
const facility = createFacility(scene);
const cubeVisual = createPhaseCube(scene);
const portals = new PortalSystem(scene, renderer, camera, audio);
const game = new GameSimulation({ camera, input, facility, portals, cubeVisual, audio, ui });

ui.startBtn.addEventListener('click', () => {
  audio.unlock();
  input.lock();
});
ui.againBtn.addEventListener('click', () => {
  ui.hideComplete();
  game.reset();
  audio.unlock();
  input.lock();
});
input.addEventListener('lock', () => ui.setLocked(true));
input.addEventListener('unlock', () => ui.setLocked(false));
input.addEventListener('lockerror', () => ui.setPointerError());

renderer.domElement.addEventListener('mousedown', (event) => {
  if (!input.isLocked) return;
  if (event.button === 0) game.shoot('cyan');
  else if (event.button === 2) game.shoot('amber');
});
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

let accumulator = 0;
let lastTime = performance.now() / 1000;
let elapsed = 0;
let fpsFrames = 0;
let fpsTime = 0;

function renderFrame(timestampMs) {
  const now = timestampMs / 1000;
  const frameDt = Math.min(Math.max(0, now - lastTime), 0.05);
  lastTime = now;
  elapsed += frameDt;

  if (input.isLocked && !game.completed) {
    accumulator = Math.min(accumulator + frameDt, FIXED_DT * 7);
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 7) {
      game.step(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }
  } else {
    accumulator = 0;
  }

  game.updatePresentation(frameDt, elapsed);
  portals.renderViews(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

  fpsFrames++;
  fpsTime += frameDt;
  if (fpsTime >= 0.5) {
    ui.setFps(Math.round(fpsFrames / Math.max(fpsTime, 0.001)));
    fpsFrames = 0;
    fpsTime = 0;
  }
}

renderer.setAnimationLoop(renderFrame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  lastTime = performance.now() / 1000;
  accumulator = 0;
  input.clear();
});

window.__bench = {
  ready: true,
  stepFrame(n = 1) {
    const steps = Math.max(0, Math.min(20_000, Math.floor(Number(n) || 0)));
    for (let i = 0; i < steps; i++) game.step(FIXED_DT);
    game.syncCamera();
    game.syncVisuals();
    return game.getState();
  },
  getState: () => game.getState(),
  resetLevel: () => game.reset(),
  teleportTest: () => runTeleportSelfTest(),
  portalTest: () => runPortalComplianceTest(),
  setLook(yaw, pitch = 0) { input.sensitivity = 0; input.yaw = Number(yaw); input.pitch = Number(pitch); game.syncCamera(); camera.updateMatrixWorld(true); return game.getState(); },
  firePortal(kind) { return game.shoot(kind); },
};

window.addEventListener('beforeunload', () => {
  renderer.setAnimationLoop(null);
  input.dispose();
  portals.dispose();
  renderer.dispose();
});
