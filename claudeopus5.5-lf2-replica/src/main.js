// 入口:固定 30 TU/s 逻辑 + rAF 渲染(标签页隐藏时 setInterval 兜底),场景管理,评测钩子。
import { W, H, TPS } from './config.js';
import { installKeyboard, uiEvents, clearUiQueue, keyboard } from './input.js';
import audio from './audio.js';
import { scenes, setScene, getScene } from './scenes.js';
import './roster.js';
import './roster-ex.js';
import { session } from './session.js';
import { battleScene } from './battle.js';
import { seedRandom } from './util.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const k = s >= 1 ? Math.floor(s * 4) / 4 : s;
  document.documentElement.style.setProperty('--sw', `${Math.floor(W * k)}px`);
}
window.addEventListener('resize', fit);
fit();

installKeyboard(canvas, () => { audio.init(); audio.unlock(); });

let acc = 0, last = performance.now(), frames = 0, fps = 0, fpsT = 0;
const STEP = 1000 / TPS;
let speed = 1;

function tick() {
  const sc = getScene();
  const evs = uiEvents();
  clearUiQueue();
  if (sc) {
    for (const e of evs) if (sc.onUi) sc.onUi(e);
    sc.update();
  }
}
function render() {
  const sc = getScene();
  ctx.imageSmoothingEnabled = false;
  if (sc) sc.render(ctx);
  if (showFps) { ctx.font = '10px monospace'; ctx.fillStyle = '#ff0'; ctx.fillText(`${fps} fps`, W - 50, H - 4); }
}
let showFps = false;
window.addEventListener('keydown', (e) => { if (e.code === 'F10') showFps = !showFps; if (e.code === 'F5') { speed = speed === 1 ? 2 : 1; } });

function frame(now) {
  const dt = Math.min(250, now - last);
  last = now;
  acc += dt * speed;
  let n = 0;
  if (window.__bench && window.__bench.manual) acc = 0;
  while (acc >= STEP && n < 8) { tick(); acc -= STEP; n++; }
  if (n >= 8) acc = 0;
  render();
  frames++;
  if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now; }
  lastRaf = now;
  requestAnimationFrame(frame);
}
let lastRaf = performance.now();
requestAnimationFrame(frame);
// 标签页隐藏 / rAF 停摆时的兜底
setInterval(() => {
  const now = performance.now();
  if (now - lastRaf > 300) { frame(now); }
}, 100);

setScene(scenes.title);

// ---------------------------------------------------------------- 评测钩子(无头确定性驱动)
window.__bench = {
  manual: false,   // true 时暂停实时循环,只由 step() 推进
  get scene() { return getScene()?.name; },
  get world() { return getScene()?.world; },
  get mode() { return getScene()?.mode; },
  scenes,
  setScene,
  step(n = 1) { for (let i = 0; i < n; i++) tick(); render(); return getScene()?.name; },
  key(code, down = true) { if (down) { keyboard.down.add(code); keyboard.pressedQ.push(code); } else keyboard.down.delete(code); },
  tap(code, after = 2) { this.key(code, true); this.step(1); this.key(code, false); return this.step(after); },
  snapshot() { render(); return canvas.toDataURL('image/png'); },
  // 直接开局:quick({ p: ['rex'], c: ['tora','jet'], mode:'vs', bg:'forest', difficulty:1, teams:[...] })
  quick(o = {}) {
    if (o.seed !== undefined) seedRandom(o.seed);
    const p = o.p || ['rex'], c = o.c || ['tora'];
    session.humans = [0, 1, 2, 3].map((i) => ({ active: i < p.length, charId: p[i] || null, team: (o.pt && o.pt[i]) || 0 }));
    session.coms = c.map((id, i) => ({ charId: id, team: (o.ct && o.ct[i]) || 0 }));
    setScene(battleScene, { mode: o.mode || 'vs', bg: o.bg || 'random', difficulty: o.difficulty ?? 1, stage: o.stage || 1 });
    return getScene().name;
  },
  render,
  canvas,
};
