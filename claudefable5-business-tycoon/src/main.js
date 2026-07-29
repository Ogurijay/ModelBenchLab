// ============================================================
// 像素大亨 — 启动与主循环：时间推进 / 速度控制 / 存档 / 弹窗调度
// ============================================================
import { newGame, dayTick, resolveChoice } from './sim.js';
import * as game from './game.js';
import { CityRenderer } from './render.js';
import { UI, fmt } from './ui.js';

let state = game.load() || newGame((Date.now() % 900000000) + 12345678);
let speed = 1;                      // 0 暂停 / 1 / 2 / 3
const MS_PER_DAY = [Infinity, 1000, 500, 250];
let acc = 0, lastT = performance.now();
let choiceShown = false, overShown = false, winShown = false;

const canvas = document.getElementById('city');
const renderer = new CityRenderer(canvas, {
  onPlotClick: (i) => ui.selectPlot(i),
  onPlotHover: (i, ev) => ui.tooltip(i, ev),
});

const ui = new UI({
  getState: () => state,
  renderer,
  save: () => game.save(state),
  onChoiceDone: () => { choiceShown = false; setSpeed(pausedBy === 'choice' ? resumeSpd : speed); pausedBy = null; },
  onNewGame: () => askNewGame(true),
});

// ---------- 速度 ----------
let pausedBy = null, resumeSpd = 1;
function setSpeed(n) {
  speed = n;
  for (let i = 0; i < 4; i++) document.getElementById(`spd${i}`).classList.toggle('on', i === n);
}
for (let i = 0; i < 4; i++) document.getElementById(`spd${i}`).addEventListener('click', () => setSpeed(i));
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); setSpeed(speed === 0 ? 1 : 0); }
  if (e.key >= '1' && e.key <= '3') setSpeed(+e.key);
});

document.getElementById('btnSave').addEventListener('click', () => { game.save(state); ui.toast('已存档到浏览器本地'); });
document.getElementById('btnHelp').addEventListener('click', () => ui.showHelp());
document.getElementById('btnNew').addEventListener('click', () => askNewGame(false));

function askNewGame(force) {
  if (!force && !confirm('确定放弃当前进度、重新开局吗？')) return;
  game.wipeSave();
  state = newGame((Date.now() % 900000000) + 12345678);
  choiceShown = overShown = winShown = false;
  ui.sel = null; ui.tab = 'manage'; ui._syncTabBtns();
  ui.closeModal();
  renderer.setView('old');
  setSpeed(1);
  ui.refresh(true);
  ui.toast('新的商业征程开始了！');
}

// ---------- 布局 ----------
function fitCanvas() {
  const w = document.getElementById('canvasWrap').clientWidth || document.getElementById('left').clientWidth;
  renderer.resize(w - 6);
}
window.addEventListener('resize', fitCanvas);
// 刷新/关闭/热重载前落盘，进度零丢失
window.addEventListener('beforeunload', () => game.save(state));

// ---------- 主循环 ----------
// rAF 驱动；页面隐藏时 rAF 被浏览器挂起，由低频 interval 兜底继续模拟
// （养成游戏切后台也在经营，回到前台无缝衔接）。
function tick() {
  const t = performance.now();
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;

  // 页面隐藏时若现金转负则自动暂停：后台挂机不至于破产
  if (document.hidden && state.cash < 0 && speed > 0) setSpeed(0);

  if (!state.over && !state.pending && speed > 0) {
    acc += dt * 1000;
    const ms = MS_PER_DAY[speed];
    let guard = 0;
    while (acc >= ms && guard++ < 8) {
      acc -= ms;
      dayTick(state);
      if (state.autosave) { // 月度：存档 + 各店月利润飘字
        state.autosave = false;
        game.save(state);
        for (const b of state.biz) {
          if (b.dist !== renderer.dist) continue;
          const mp = b.hist.slice(-30).reduce((a, v) => a + v, 0);
          renderer.addPop(b.plot, `${mp >= 0 ? '+' : ''}${fmt(mp)}`, mp >= 0 ? '#9df0a5' : '#ff9d9d');
        }
      }
      if (state.pending) break;
    }
  }

  // 抉择事件 → 暂停并弹窗
  if (state.pending && !choiceShown) {
    choiceShown = true;
    pausedBy = 'choice'; resumeSpd = speed || 1;
    setSpeed(0);
    ui.showChoice(state);
  }
  if (state.over && !overShown) { overShown = true; setSpeed(0); game.save(state); ui.showOver(false); }
  if (state.won && !winShown) { winShown = true; game.save(state); ui.showOver(true); }

  renderer.render(state, ui.sel, dt);
  ui.refresh();
}
function frame() { tick(); requestAnimationFrame(frame); }

// ---------- 启动 ----------
renderer.setView('old');
fitCanvas();
ui.refresh(true);
if (state.day === 1) setTimeout(() => ui.showHelp(), 400);
requestAnimationFrame(frame);
setInterval(() => { if (performance.now() - lastT > 400) tick(); }, 250);

// ---------- 调试/评测接口 ----------
window.__TYCOON__ = {
  getState: () => state,
  // 同步快进 n 天（自动应答抉择事件），用于复核与基准测试
  ff: (n = 30) => {
    for (let i = 0; i < n && !state.over; i++) {
      dayTick(state);
      if (state.pending) resolveChoice(state, 'a');
    }
    game.save(state);
    renderer.render(state, ui.sel, 0.016);
    ui.refresh(true);
    return { day: state.day, cash: Math.round(state.cash), worth: state.stats.worth };
  },
  // 设定昼夜相位（0~120：60≈正午，0/120≈午夜）并立即重绘，供演示/截图
  setVt: (v) => { renderer.vt = v; renderer.render(state, ui.sel, 0.001); return renderer.vt; },
  setDist: (d) => { renderer.setView(d); ui.refresh(true); renderer.render(state, ui.sel, 0.001); return d; },
};

// ---------- 自测（?selftest=1） ----------
if (new URLSearchParams(location.search).has('selftest')) {
  import('./selftest.js').then((m) => m.runSelfTest()).catch((e) => {
    console.error('自测加载失败', e);
  });
}
