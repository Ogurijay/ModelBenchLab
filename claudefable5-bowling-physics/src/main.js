/**
 * 入口:装配各子系统 + 主循环 + window.__bench 调试钩子。
 */
import { SceneManager } from './scene.js';
import { BowlingPhysics } from './physics.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { AudioFX } from './audio.js';
import { runScoreTests } from './scoring-test.js';

const canvas = document.getElementById('scene');
const audio = new AudioFX();
const ui = new UI();
const sceneMgr = new SceneManager(canvas);
const physics = new BowlingPhysics({
  onPinHit: (intensity) => audio.pinHit(intensity),
  onGutter: () => audio.gutterThud(),
});
const game = new Game({ physics, sceneMgr, ui, audio });
ui.bind({ game, audio });

// ---------- 主循环(渲染帧驱动,物理内部固定 1/120 步长) ----------
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 60;

function tick(dt) {
  game.update(dt);
  sceneMgr.render();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  tick(dt);

  fpsAcc += dt;
  fpsFrames += 1;
  if (fpsAcc >= 0.5) {
    fps = fpsFrames / fpsAcc;
    ui.setFps(fps);
    fpsAcc = 0;
    fpsFrames = 0;
  }
}

// ---------- 调试钩子 ----------
window.__bench = {
  ready: false,
  /** 手动推进 n 帧(每帧 1/60s),隐藏标签页下也可驱动 */
  stepFrame(n = 1) {
    for (let i = 0; i < n; i++) tick(1 / 60);
    return game.getState();
  },
  getState() {
    return { ...game.getState(), fps: +fps.toFixed(1) };
  },
  /** 计分纯函数 10 组冻结序列自测 */
  scoreTest() {
    const r = runScoreTests();
    return { passed: r.passed, total: r.total };
  },
};

// 初始化完成即同步置 ready(不依赖 rAF:隐藏标签页下 rAF 停摆,
// 评测轮询 ready 不能被卡住;后续可用 stepFrame(n) 驱动)
sceneMgr.render(); // 先同步渲染首帧,保证 WebGL 上下文与画面就绪
ui.hideLoading();
window.__bench.ready = true;

requestAnimationFrame((now) => {
  last = now;
  requestAnimationFrame(frame);
});
