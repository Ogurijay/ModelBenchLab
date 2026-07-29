// 装配:渲染器 / 输入 / 事件路由 / 主循环 / __bench 调试钩子。
import * as THREE from 'three';
import { Game } from './sim/game.js';
import { CHAMBERS } from './levels/index.js';
import { buildMaterials } from './gfx/materials.js';
import { ChamberView, buildGunViewModel } from './gfx/scene.js';
import { PortalRenderer } from './gfx/portals.js';
import { Hud } from './ui/hud.js';
import { SFX, unlock } from './audio/sfx.js';
import { runSelfTest } from './core/selftest.js';
import { EYE_OFFSET } from './sim/player.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.autoClear = true;
// three 默认每次 render() 都重置统计,那样 HUD 只会读到主通道的 draw call,
// 漏掉门内那 4 遍(整整 5 倍)。改成手动重置,读数才对得上「递归 RT 链」的真实开销。
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090b0c);
const camera = new THREE.PerspectiveCamera(78, 1, 0.035, 160);
camera.rotation.order = 'YXZ';
scene.add(camera);

const materials = buildMaterials();
const view = new ChamberView(scene, materials);
const portalGfx = new PortalRenderer(scene);
const gun = buildGunViewModel(camera);
const hud = new Hud();

let started = false;
let pendingBanner = null;

const game = new Game({
  onEvent: (name, data) => {
    switch (name) {
      case 'chamber':
        // 注意:这里不能 cancelFade —— 换关正是过场自己的中场回调触发的,
        // 作废令牌会把后半段(标题卡 + 揭幕)变成死代码。取消由发起方显式调用。
        view.build(game);
        hud.setChamber(data.level);
        hud.buildChips(game.unlocked, game.index, pickChamber);
        gun.group.visible = data.level.gun !== 'none';
        if (!data.silent && data.level.banner) pendingBanner = data.level.banner;
        break;
      case 'shot': SFX.shot(data.color); gun.setColor(data.color); recoil = 1; break;
      case 'portal':
        SFX.portal();
        hud.setPortalState(game.portals.blue.placed, game.portals.orange.placed);
        break;
      case 'deny': SFX.deny(); hud.deny(data.text); break;
      case 'teleport': SFX.teleport(); break;
      case 'pickup': SFX.pickup(); break;
      case 'drop': SFX.drop(); break;
      case 'buttonOn': SFX.buttonOn(); break;
      case 'buttonOff': SFX.buttonOff(); break;
      case 'doorOpen': SFX.doorOpen(); break;
      case 'doorClose': SFX.doorClose(); break;
      case 'fizzle':
        SFX.fizzle();
        hud.setPortalState(game.portals.blue.placed, game.portals.orange.placed);
        break;
      case 'dissolve': SFX.dissolve(); break;
      case 'respawn': SFX.respawn(); hud.banner('检测到实验体跌入检修区 — 已重新部署'); break;
      case 'banner': hud.banner(data.text); break;
      case 'exit':
        SFX.exit();
        hud.fadeThrough(data.next, () => game.finishTransition(data.index));
        break;
      case 'complete': SFX.complete(); hud.showComplete(data.stats); break;
      default: break;
    }
  },
});

game.load(0, true);

function pickChamber(i) {
  hud.cancelFade(); // 过场进行中也接管:先作废排队的换关回调,再装载玩家真正点的那一室
  game.load(i);
  enterPlay();
}

// ── 输入 ────────────────────────────────────────────────────
const isLocked = () => document.pointerLockElement === canvas;

function requestLock() {
  let p;
  try { p = canvas.requestPointerLock({ unadjustedMovement: true }); } catch { p = null; }
  if (p && p.catch) p.catch(() => { try { canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* 无指针锁环境 */ } });
}

function enterPlay() {
  started = true;
  unlock();
  hud.hideStart();
  hud.hidePause();
  hud.hideComplete();
  requestLock();
}

document.getElementById('btn-start').onclick = enterPlay;
document.getElementById('btn-resume').onclick = enterPlay;
document.getElementById('btn-restart').onclick = () => { hud.cancelFade(); game.restart(); enterPlay(); };
document.getElementById('btn-again').onclick = () => {
  hud.cancelFade();
  game.stats = { time: 0, shots: 0, teleports: 0, deaths: 0 };
  game.load(0);
  enterPlay();
};
const depthBtns = [document.getElementById('btn-depth'), document.getElementById('btn-depth2')];
function setDepth(n) {
  portalGfx.setDepth(n);
  for (const b of depthBtns) b.textContent = `门中门:${n} 层`;
}
for (const b of depthBtns) b.onclick = () => setDepth(portalGfx.maxDepth === 2 ? 1 : 2);

document.addEventListener('pointerlockchange', () => {
  if (!isLocked() && started && game.mode !== 'complete') hud.showPause();
});
document.addEventListener('pointerlockerror', () => {
  if (started && game.mode !== 'complete') hud.showPause();
});
document.addEventListener('mousemove', (e) => {
  if (isLocked()) game.player.look(e.movementX, e.movementY);
});
document.addEventListener('mousedown', (e) => {
  if (!isLocked()) return;
  if (e.button === 0) game.shoot('blue');
  else if (e.button === 2) game.shoot('orange');
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  game.player.keys[e.code] = true;
  if (!isLocked()) return;
  if (e.code === 'Space') { game.player.queueJump(); e.preventDefault(); }
  else if (e.code === 'KeyE') game.interact();
  else if (e.code === 'KeyR') { hud.cancelFade(); game.restart(); }
});
document.addEventListener('keyup', (e) => { game.player.keys[e.code] = false; });
// 失焦时收不到 keyup,按键会卡在按下状态,回到游戏后角色自己往前走
const releaseKeys = () => { for (const k in game.player.keys) game.player.keys[k] = false; };
window.addEventListener('blur', releaseKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });

// ── 尺寸(嵌入式窗格可能以 0×0 起步且不触发 resize,故每帧兜底) ──
const sizeV = new THREE.Vector2();
function syncSize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!w || !h) return;
  renderer.getSize(sizeV);
  if (sizeV.x !== w || sizeV.y !== h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
}
window.addEventListener('resize', syncSize);
syncSize();

// ── 渲染 ────────────────────────────────────────────────────
let recoil = 0;
let clockT = 0;

function syncCamera() {
  const p = game.player.ent.pos;
  camera.position.set(p[0], p[1] + EYE_OFFSET, p[2]);
  camera.rotation.set(game.player.pitch, game.player.yaw, game.player.roll);
}

function renderFrame(dt) {
  syncSize();
  renderer.info.reset();
  syncCamera();
  view.update(game, dt, clockT);
  portalGfx.sync(game, game.player.eye(), dt);
  const gunWasVisible = gun.group.visible;
  gun.group.visible = false; // 手中的枪不进门内视图
  portalGfx.renderViews(renderer, scene, camera, game);
  gun.group.visible = gunWasVisible;
  if (recoil > 0) {
    recoil = Math.max(0, recoil - dt / 0.14);
    gun.group.position.z = -0.62 + 0.06 * recoil;
  }
  renderer.render(scene, camera);
}

let last = performance.now();
let fps = 60;
let perfTimer = 0;
let autoDepthTimer = 0;
let lastDrawCalls = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clockT += dt;
  if (dt > 0) fps += (1 / dt - fps) * 0.05;

  const active = isLocked() || game.mode === 'transition';
  if (active) {
    const before = game.player.ent.vel[1];
    game.update(dt);
    if (game.player.ent.onGround && before < -6) SFX.land(-before);
  }
  if (pendingBanner && isLocked()) { hud.banner(pendingBanner); pendingBanner = null; }

  renderFrame(dt);
  lastDrawCalls = renderer.info.render.calls;

  perfTimer += dt;
  if (perfTimer > 0.25) {
    hud.perf(fps, portalGfx.maxDepth, lastDrawCalls);
    perfTimer = 0;
  }
  // 掉帧时自动降到一层门中门(1080p 下 5 遍全场景渲染并非所有 GPU 都吃得住)
  autoDepthTimer += dt;
  if (autoDepthTimer > 2.5) {
    autoDepthTimer = 0;
    if (fps < 42 && portalGfx.maxDepth === 2) setDepth(1);
  }
}

// ── __bench 调试钩子 ────────────────────────────────────────
window.__bench = {
  ready: false,
  stepFrame(n = 1) {
    for (let i = 0; i < n; i++) game.update(1 / 60);
    renderFrame(1 / 60);
    return this.getState();
  },
  getState() {
    const s = game.getState();
    s.fps = Math.round(fps);
    s.portalDepth = portalGfx.maxDepth;
    s.drawCalls = lastDrawCalls || renderer.info.render.calls;
    return s;
  },
  portalTest() {
    const r = runSelfTest();
    return { passed: r.passed, total: r.total };
  },
  game,
  chambers: CHAMBERS,
};

setDepth(2);
renderFrame(0);
hud.hideLoading();
hud.showStart();
hud.buildChips(game.unlocked, game.index, pickChamber);
window.__bench.ready = true;
requestAnimationFrame(loop);
