// main.js — 引导:画布缩放、固定步长循环、__bench 调试钩子
import { Game } from './game.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { NEEDS } from './sim.js';

const canvas = document.getElementById('game');
Input.init();
const game = new Game(canvas);

// 画布 CSS 尺寸:优先整数倍(240 的倍数),保证像素齐整
function fitCanvas() {
  const availW = Math.max(320, window.innerWidth - 300);
  const availH = Math.max(240, window.innerHeight - 240);
  const scale = Math.max(2, Math.min(Math.floor(availW / 240), Math.floor(availH / 160), 5));
  canvas.style.width = `${240 * scale}px`;
  canvas.style.height = `${160 * scale}px`;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// 固定步长主循环。rAF 为主;标签页隐藏时 rAF 停摆,由 setInterval 兜底继续推进
const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
let lastFrameAt = last;
let fps = 60, fpsAcc = 0, fpsN = 0, fpsT = 0;

function frame(now) {
  lastFrameAt = now;
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  fpsAcc += dt; fpsN += 1; fpsT += dt;
  if (fpsT >= 0.5) {
    fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0; fpsN = 0; fpsT = 0;
    game.fps = fps;
  }

  acc += dt;
  while (acc >= STEP) {
    game.update(STEP);
    Input.update();
    acc -= STEP;
  }
  Audio.update();
  game.draw();
}

function loop(now) {
  requestAnimationFrame(loop);
  frame(now);
}
requestAnimationFrame(loop);
setInterval(() => {
  const now = performance.now();
  if (now - lastFrameAt > 120) frame(now);
}, 50);

// ---------- 评测钩子 ----------
window.__bench = {
  ready: true,
  getState() {
    const S = game.sim.state;
    if (!S) return { state: game.state, fps };
    const needs = {};
    for (const { key } of NEEDS) needs[key] = Math.round(S.needs[key]);
    return {
      state: game.state,
      day: S.day,
      clock: game.sim.clockText(),
      money: S.money,
      mood: game.sim.mood(),
      needs,
      power: S.power,
      billsDue: S.billsDue,
      job: { ...S.job },
      fps,
    };
  },
  game, // 深度调试入口
  // 无头驱动:确定性推进 N 帧(含输入边沿清理)并重绘,供自动化评测
  step(frames = 1) {
    for (let i = 0; i < frames; i++) { game.update(STEP); Input.update(); }
    game.draw();
    return game.state;
  },
  // 模拟一次按键(keydown→2帧→keyup→再走 frames 帧)
  press(code, frames = 4) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    this.step(2);
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    return this.step(frames);
  },
  shot() { return canvas.toDataURL('image/png'); },
};
