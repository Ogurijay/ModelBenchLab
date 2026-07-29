// 数码宝贝大乱斗 — three.js 复刻 PS2《Digimon Rumble Arena 2》
// 全局状态机:title → select → loading → battle → victory
import * as THREE from 'three';
import { ROSTER, KEYMAP_P1 } from './config.js';
import { loadModel, instantiate, renderThumbnail } from './assets.js';
import { buildArena } from './arena.js';
import { FxSystem } from './fx.js';
import { Fighter } from './fighter.js';
import { AiController } from './ai.js';
import { Battle } from './battle.js';
import { Ui, SelectScreen } from './ui.js';
import { sfx, startBgm, stopBgm, toggleMute, unlockAudio } from './audio.js';

// ============ 渲染基础 ============
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 3.2, 11);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const arena = buildArena(scene);
const fx = new FxSystem(scene);
const ui = new Ui(camera, canvas);

// ============ 输入 ============
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  onKeyPressed(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ============ 全局状态 ============
let mode = 'title';           // title | select | loading | battle | victory
let battle = null;
let fighters = [];            // [p1, p2]
let ai = null;
let select = null;
let previewToken = 0;
let previewRig = null;        // { root, mixer } 选人台上的预览模型
let orbitT = 0;
let victoryT = 0;
const clock = new THREE.Clock();

// ============ 选人界面 ============
function enterSelect() {
  mode = 'select';
  ui.showScreen('select');
  if (!select) {
    select = new SelectScreen(ROSTER, startLoadingBattle);
    // 后台生成缩略图(逐个,避免卡顿)
    (async () => {
      for (let i = 0; i < ROSTER.length; i++) {
        try {
          const asset = await loadModel(ROSTER[i].model);
          select.setThumb(i, renderThumbnail(asset));
        } catch (err) { console.error('thumb failed', ROSTER[i].id, err); }
      }
    })();
  } else {
    select.reset();
  }
  select.refresh();
  updatePreviewModel();
}

async function updatePreviewModel() {
  const token = ++previewToken;
  const cfg = ROSTER[select.cursor];
  try {
    const asset = await loadModel(cfg.model);
    if (token !== previewToken || mode !== 'select') return;
    clearPreview();
    const inst = instantiate(asset, cfg.height * 1.6);
    inst.root.position.x = 0; // 模型原朝 +Z,正对选人镜头
    scene.add(inst.root);
    const clip = inst.clips.get('fe01') || inst.clips.get('bn01');
    if (clip) { inst.mixer.clipAction(clip).play(); }
    previewRig = inst;
  } catch (err) { console.error('preview failed', err); }
}

function clearPreview() {
  if (previewRig) {
    scene.remove(previewRig.root);
    previewRig = null;
  }
}

// ============ 战斗装配 ============
async function startLoadingBattle(idxP1, idxP2) {
  mode = 'loading';
  ui.showScreen('loading');
  clearPreview();
  const cfg1 = ROSTER[idxP1];
  const cfg2 = ROSTER[idxP2];

  const need = [cfg1.model, cfg2.model];
  if (cfg1.mega) need.push(cfg1.mega.model);
  if (cfg2.mega) need.push(cfg2.mega.model);

  let done = 0;
  const assets = {};
  await Promise.all(need.map((m) => loadModel(m).then((a) => {
    assets[m] = a;
    ui.setLoading(++done / need.length);
  })));

  // 清理旧战斗
  disposeFight();

  const mk = (cfg, side) => {
    const base = instantiate(assets[cfg.model], cfg.height);
    const mega = cfg.mega ? instantiate(assets[cfg.mega.model], cfg.mega.height) : null;
    return new Fighter(cfg, base, mega, scene, side);
  };
  fighters = [mk(cfg1, 0), mk(cfg2, 1)];
  ai = new AiController(fighters[1], fighters[0], 1);

  // HUD 头像(base + mega 两张)
  const portraits = [cfg1, cfg2].map((cfg) => ({
    base: renderThumbnail(assets[cfg.model], 160, '#0a1440'),
    mega: cfg.mega ? renderThumbnail(assets[cfg.mega.model], 160, '#0a3018') : '',
  }));
  ui.bindFighters(fighters, portraits);

  battle = new Battle({
    scene, camera, fighters, fx, ui,
    onMatchEnd: (winner, loser) => {
      mode = 'victory';
      victoryT = 0;
      winner.pos.set(0, 0, 0); // 台中央领奖,避开浮台遮挡
      winner.vel.set(0, 0, 0);
      if (loser) { loser.pos.set(7.5, 0, 0); loser.vel.set(0, 0, 0); }
      winner.playVictory();
      ui.showVictory(winner.displayName);
      ui.showScreen('victory');
      stopBgm();
      sfx.victory();
    },
  });

  mode = 'battle';
  ui.showScreen('battle');
  startBgm();
}

function disposeFight() {
  if (battle) { battle.dispose(); battle = null; }
  for (const f of fighters) {
    for (const inst of [f.baseInst, f.megaInst]) {
      if (!inst) continue;
      scene.remove(inst.root);
      // 材质是实例化时 clone 的,需释放;几何与贴图共享原资产,保留
      inst.root.traverse((o) => { if (o.material?.dispose) o.material.dispose(); });
    }
  }
  fighters = [];
  ai = null;
}

// ============ 按键分发 ============
function onKeyPressed(code) {
  unlockAudio();
  if (code === 'KeyM') { toggleMute(); return; }

  if (mode === 'title') {
    if (code === 'Enter' || code === 'Space') {
      sfx.confirm();
      enterSelect();
    }
    return;
  }
  if (mode === 'select') {
    const before = select.cursor;
    if (code === 'ArrowLeft' || code === 'KeyA') select.move(-1, 0);
    else if (code === 'ArrowRight' || code === 'KeyD') select.move(1, 0);
    else if (code === 'ArrowUp' || code === 'KeyW') select.move(0, -1);
    else if (code === 'ArrowDown' || code === 'KeyS') select.move(0, 1);
    else if (code === 'Enter' || code === 'KeyJ') { sfx.confirm(); select.confirm(); return; }
    else if (code === 'Escape') {
      sfx.cancel();
      if (!select.back()) { mode = 'title'; ui.showScreen('title'); clearPreview(); }
      return;
    }
    if (select.cursor !== before) { sfx.select(); updatePreviewModel(); }
    return;
  }
  if (mode === 'battle') {
    if (code === 'Escape') {
      stopBgm();
      disposeFight();
      enterSelect();
    }
    return;
  }
  if (mode === 'victory') {
    if (code === 'Enter') {
      // 同阵容再战
      sfx.confirm();
      ui.hideVictory();
      fighters.forEach((f) => { f.roundsWon = 0; });
      battle.round = 1;
      battle.phase = 'intro';
      battle._startRound();
      mode = 'battle';
      ui.showScreen('battle');
      startBgm();
    } else if (code === 'Escape') {
      sfx.cancel();
      ui.hideVictory();
      disposeFight();
      enterSelect();
    }
  }
}

// ============ 主循环 ============
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  arena.update(dt, t);
  fx.update(dt);

  if (mode === 'title') {
    // 环绕镜头
    orbitT += dt * 0.12;
    const r = 26;
    camera.position.set(Math.sin(orbitT) * r, 8.5 + Math.sin(orbitT * 0.7) * 2, Math.cos(orbitT) * r);
    camera.lookAt(0, 0.5, 0);
  } else if (mode === 'select') {
    // 台前小幅摆动 + 预览模型转台
    orbitT += dt * 0.3;
    camera.position.set(Math.sin(orbitT * 0.5) * 1.2, 2.6, 7.5);
    camera.lookAt(0, 1.4, 0);
    if (previewRig) {
      previewRig.root.rotation.y += dt * 0.6;
      previewRig.mixer.update(dt);
    }
  } else if (mode === 'battle' && battle) {
    // P1 键盘输入
    const inp = fighters[0].input;
    inp.left = keys.has(KEYMAP_P1.left) ? 1 : 0;
    inp.right = keys.has(KEYMAP_P1.right) ? 1 : 0;
    inp.up = keys.has(KEYMAP_P1.up) ? 1 : 0;
    inp.down = keys.has(KEYMAP_P1.down) ? 1 : 0;
    inp.attack = keys.has(KEYMAP_P1.attack) ? 1 : 0;
    inp.special = keys.has(KEYMAP_P1.special) ? 1 : 0;
    inp.guard = keys.has(KEYMAP_P1.guard) ? 1 : 0;
    inp.evolve = keys.has(KEYMAP_P1.evolve) ? 1 : 0;
    ai.update(dt);
    battle.update(dt);
  } else if (mode === 'victory' && fighters.length) {
    victoryT += dt;
    const winner = fighters.find((f) => f.roundsWon >= 2) || fighters[0];
    winner.inst.mixer.update(dt);
    const c = winner.center;
    const a = Math.sin(victoryT * 0.35) * 0.9; // 缓慢左右摇臂,不绕背后
    const r = 4.2 + winner.height * 1.1;
    camera.position.set(c.x + Math.sin(a) * r, c.y + winner.height * 0.55, Math.cos(a) * r);
    camera.lookAt(c.x, c.y + winner.height * 0.1, 0);
  }

  renderer.render(scene, camera);
}

// 调试/评测接口(benchmark 惯例)
window.__DIGIMON__ = {
  get mode() { return mode; },
  get fighters() { return fighters; },
  get battle() { return battle; },
};

ui.showScreen('title');
tick();
