// 入口:固定 60 帧逻辑 + rAF 渲染(隐藏标签页时 setInterval 兜底)、画布按窗口与 DPR 缩放、场景调度、评测钩子。
import { W, H, FPS, settings } from './config.js';
import { installKeyboard, takeMenuKeys, menuAction, endTick, injectKey, KeyPad } from './input.js';
import { SM, titleScene, startBattle, battleScene, selectScene } from './scenes.js';
import { regions } from './ui.js';
import { txt } from './hud.js';
import { seedRandom } from './util.js';
import audio from './audio.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
let scale = 1;
function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cssW = Math.floor(W * s), cssH = Math.floor(H * s);
  document.documentElement.style.setProperty('--sw', `${cssW}px`);
  document.documentElement.style.setProperty('--sh', `${cssH}px`);
  scale = Math.min(2.5, Math.max(1, s * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
}
window.addEventListener('resize', () => { fit(); if (manual) render(); });
fit();

installKeyboard(canvas, () => { audio.init(); audio.setVolumes({ master: settings.master, bgm: settings.bgm, sfx: settings.sfx }); });
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  for (let i = regions.length - 1; i >= 0; i--) { const g = regions[i]; if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) { g.act(); break; } }
});
canvas.focus();

const pads = { p1: new KeyPad('p1'), p2: new KeyPad('p2') };
SM.pads = pads;

let manual = false;
function tick() {
  for (const code of takeMenuKeys()) {
    const sc = SM.cur; // 场景可能在本帧的上一个按键中切换
    const a = menuAction(code);
    if (sc?.onKey && (a || code === 'Escape' || code === 'KeyP' || code === 'F1')) sc.onKey(a?.a ?? null, a?.player ?? -1, code);
  }
  if (SM.cur) SM.cur.update();
  SM.t++;
  if (SM.fade > 0) SM.fade--;
  endTick();
}
let fps = 0, frames = 0, fpsT = 0, logicMs = 0, drawMs = 0;
function render() {
  regions.length = 0;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const t0 = performance.now();
  if (SM.cur) SM.cur.draw(ctx);
  if (SM.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${SM.fade / 14})`; ctx.fillRect(0, 0, W, H); }
  drawMs = drawMs * 0.9 + (performance.now() - t0) * 0.1;
  if (settings.showFps) txt(ctx, `${fps} fps · 逻辑 ${logicMs.toFixed(2)}ms · 绘制 ${drawMs.toFixed(2)}ms`, W - 8, H - 6, { size: 11, align: 'right', color: '#9f9', lw: 3 });
}

const STEP = 1000 / FPS;
let acc = 0, last = performance.now(), lastRaf = last;
function frame(now) {
  const dt = Math.min(250, now - last);
  last = now; lastRaf = now;
  if (!manual) {
    acc += dt;
    let n = 0;
    const t0 = performance.now();
    while (acc >= STEP && n < 5) { tick(); acc -= STEP; n++; }
    if (n >= 5) acc = 0;
    if (n) logicMs = logicMs * 0.9 + (performance.now() - t0) / n * 0.1;
    render();
  }
  frames++;
  if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => { const now = performance.now(); if (now - lastRaf > 300) frame(now); }, 100);

SM.go(titleScene, {});

// ---------------------------------------------------------------- 评测钩子(无头确定性驱动)
window.__bench = {
  get scene() { return SM.cur?.name; },
  get battle() { return SM.cur?.B || null; },
  SM, pads,
  set manual(v) { manual = !!v; }, get manual() { return manual; },
  step(n = 1) { for (let i = 0; i < n; i++) tick(); render(); return SM.cur?.name; },
  key(code, down = true) { injectKey(code, down); },
  tap(code, after = 2) { this.key(code, true); this.step(1); this.key(code, false); return this.step(after); },
  snapshot() { render(); return canvas.toDataURL('image/png'); },
  // 直接开局:quick({ p1:'shippu', p2:'souga', a1:'suiei', a2:'messhi', cpu2:true, stage:'leaf_village', seed:1, training })
  quick(o = {}) {
    if (o.seed !== undefined) seedRandom(o.seed);
    startBattle({
      mode: o.mode || 'vs', stage: o.stage || 'leaf_village', seed: o.seed, training: o.training || null, winsNeeded: o.wins, time: o.time,
      sides: [
        { chars: [].concat(o.p1 || 'shippu'), assist: o.a1 ?? 'suiei', cpu: !!o.cpu1, diff: o.diff ?? 2 },
        { chars: [].concat(o.p2 || 'souga'), assist: o.a2 ?? 'messhi', cpu: o.cpu2 ?? true, diff: o.diff ?? 2 },
      ],
    });
    return SM.cur.name;
  },
  scenes: { titleScene, battleScene, selectScene },
  render,
};
