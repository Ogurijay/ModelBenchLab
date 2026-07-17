// 装配:渲染器 / 输入 / 主循环 / __bench 调试钩子
import * as THREE from 'three';
import { buildMaterials } from './textures.js';
import { CHAMBERS } from './levels.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { runPortalTests } from './portal-test.js';
import { unlockAudio } from './audio.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d0e);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 120);

const mats = buildMaterials();
const ui = new UI();
const game = new Game(scene, camera, mats, ui);

// 选关 chips(开始/暂停面板共用)
function rebuildSelect() {
  ui.buildChamberSelect(CHAMBERS, game.unlocked, game.chamberIndex, (i) => {
    if (game.mode === 'transition') return; // 过场中不接受选关(排队回调会覆盖)
    ui.cancelTransition();
    game.stats.time = 0;
    game.loadChamber(i);
    enterPlay();
  });
}
const origLoad = game.loadChamber.bind(game);
game.loadChamber = (i, silent) => {
  origLoad(i, silent);
  rebuildSelect();
};

game.loadChamber(0, true);

// ── 指针锁 / 输入 ──
let started = false;

function requestLock() {
  // unadjustedMovement 不被支持时回落普通锁定;两级都可能失败(如自动化环境),全部吞掉
  let p;
  try { p = canvas.requestPointerLock({ unadjustedMovement: true }); } catch { p = null; }
  if (p && p.catch) {
    p.catch(() => {
      let q;
      try { q = canvas.requestPointerLock(); } catch { q = null; }
      if (q && q.catch) q.catch(() => {});
    });
  }
}

function enterPlay() {
  started = true;
  unlockAudio();
  ui.hideStart();
  ui.hidePause();
  ui.hideComplete();
  requestLock();
}

document.getElementById('btn-start').addEventListener('click', enterPlay);
document.getElementById('btn-resume').addEventListener('click', enterPlay);
document.getElementById('btn-restart').addEventListener('click', () => {
  game.restart();
  enterPlay();
});
document.getElementById('btn-again').addEventListener('click', () => {
  game.stats = { portals: 0, teleports: 0, time: 0, deaths: 0 };
  game.loadChamber(0);
  enterPlay();
});

const isLocked = () => document.pointerLockElement === canvas;

document.addEventListener('pointerlockchange', () => {
  if (!isLocked() && started && game.mode !== 'complete') {
    ui.showPause();
  }
});
document.addEventListener('pointerlockerror', () => {
  if (started && game.mode !== 'complete') ui.showPause();
});

document.addEventListener('mousemove', (e) => {
  if (isLocked()) game.player.onMouseMove(e.movementX, e.movementY);
});

document.addEventListener('mousedown', (e) => {
  if (!isLocked()) return;
  if (e.button === 0) game.shoot(0);
  else if (e.button === 2) game.shoot(2);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  game.player.keys[e.code] = true;
  if (!isLocked()) return;
  if (e.code === 'Space') { game.player.queueJump(); e.preventDefault(); }
  else if (e.code === 'KeyE') game.interact();
  else if (e.code === 'KeyR') game.restart();
});
document.addEventListener('keyup', (e) => { game.player.keys[e.code] = false; });

// 尺寸同步:不能只依赖 resize 事件(嵌入式窗格可能以 0×0 初始化且不触发 resize)
const _sizeV = new THREE.Vector2();
function syncSize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return false;
  renderer.getSize(_sizeV);
  if (_sizeV.x !== w || _sizeV.y !== h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  return true;
}
syncSize();
window.addEventListener('resize', syncSize);

// ── 渲染一帧(先渲染两扇门的 RT 视野,再渲染主场景) ──
function renderFrame() {
  const gunVisible = game.player.gunMode !== 'none';
  game.player.gun.visible = false; // 视图模型不进传送门视野
  game.portals.renderViews(renderer, scene, camera);
  game.player.gun.visible = gunVisible;
  renderer.render(scene, camera);
}

// ── 主循环 ──
let last = performance.now();
let fpsEma = 60;
let fpsTimer = 0;

function loop(now) {
  requestAnimationFrame(loop);
  syncSize();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (dt > 0) fpsEma += (1 / dt - fpsEma) * 0.06;
  fpsTimer += dt;
  if (fpsTimer > 0.25) { ui.setFps(fpsEma); fpsTimer = 0; }

  if (isLocked() || game.mode === 'transition') game.update(dt);
  renderFrame();
}

// ── __bench 调试钩子(初始化末尾同步置位;隐藏标签页用 stepFrame 驱动) ──
window.__bench = {
  ready: false,
  stepFrame(n = 1) {
    for (let i = 0; i < n; i++) game.update(1 / 60);
    renderFrame();
    return this.getState();
  },
  getState() {
    const s = game.getState();
    s.fps = Math.round(fpsEma);
    return s;
  },
  portalTest() {
    const r = runPortalTests();
    return { passed: r.passed, total: r.total };
  },
  game,
};

renderFrame(); // 同步首帧
ui.hideLoading();
ui.showStart();
window.__bench.ready = true;
requestAnimationFrame(loop);
