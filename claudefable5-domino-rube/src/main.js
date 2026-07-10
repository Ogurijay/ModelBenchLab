// ============================================================
// main.js — 装配与主循环
// 物理:固定 1/120 步长 + 累加器,与渲染帧率完全解耦
// 确定性:触发前物理冻结;复位 = 整个 World 重建
// ============================================================
import { Machine } from './machine.js';
import { createScenery } from './scenery.js';
import { MachineVisuals } from './visuals.js';
import { CameraDirector } from './cameraDirector.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { FIXED_DT, MAX_SUBSTEPS, SLOW_SCALE, STAGE_NAMES } from './config.js';

const container = document.getElementById('app');
const { renderer, scene, mats, bellSpot, resize } = createScenery(container);
const director = new CameraDirector(renderer.domElement);
const visuals = new MachineVisuals(scene, mats, bellSpot);
const audio = new AudioEngine();

let machine = null;
let slowMotion = false;
let accumulator = 0;

const hooks = {
  onImpact: (info) => audio.impact(info),
  onBell: () => {
    audio.bell();
    visuals.ringBell();
    ui.showBanner();
  },
  onStage: () => {},
};

function buildMachine() {
  machine = new Machine(hooks);
  visuals.bind(machine);
  director.bind(machine);
  accumulator = 0;
}

const ui = new UI({
  onTrigger: () => {
    audio.ensure();                 // 用户手势解锁音频
    if (machine.triggered) return;
    machine.trigger();
    ui.setTriggered(true);
  },
  onReset: () => {
    buildMachine();                 // 完全重建物理世界 → 逐比特一致
    ui.reset();
  },
  onCamera: () => ui.setCameraMode(director.toggle()),
  onSlow: () => {
    slowMotion = !slowMotion;
    ui.setSlow(slowMotion);
  },
});

buildMachine();
ui.setCameraMode('auto');
ui.setSlow(false);

// ---------- 主循环 ----------
let lastT = performance.now();
let fpsEma = 60;

function advance(frameDt) {
  // 物理:固定步长推进(触发前 machine.step 内部直接返回,世界冻结)
  accumulator += frameDt * (slowMotion ? SLOW_SCALE : 1);
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    machine.step();
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps >= MAX_SUBSTEPS) accumulator = 0;   // 后台切回:丢弃积压,防追帧卡顿

  visuals.update(frameDt);
  director.update(frameDt);
  renderer.render(scene, director.camera);
}

function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min((now - lastT) / 1000, 0.25);   // clamp 大间隔
  lastT = now;
  fpsEma = fpsEma * 0.95 + (1 / Math.max(rawDt, 1e-4)) * 0.05;
  advance(rawDt);
  ui.refresh(machine.getState(), fpsEma);
}
requestAnimationFrame((t) => { lastT = t; loop(t); });

// 切后台回来:重置时钟,避免一次性大 dt
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastT = performance.now();
});

window.addEventListener('resize', () => {
  resize(window.innerWidth, window.innerHeight);
  director.resize(window.innerWidth, window.innerHeight);
});

// ---------- 调试钩子(工程要求) ----------
window.__bench = {
  ready: true,
  /** 手动推进 n 个渲染帧(每帧 1/60 s,含物理与画面),RAF 暂停时也可用 */
  stepFrame(n = 1) {
    for (let i = 0; i < n; i++) advance(1 / 60);
    ui.refresh(machine.getState(), fpsEma, true);   // force:跳过 HUD 降频,立即反映状态
    return machine.getState();
  },
  getState() {
    const s = machine.getState();
    return {
      triggered: s.triggered,
      currentStage: s.currentStage,
      bellRung: s.bellRung,
      stageName: STAGE_NAMES[s.currentStage],
      bellRungAt: s.bellRungAt,
      simTime: s.simTime,
      tick: s.tick,
      stageTimes: s.stageTimes,
      cameraMode: director.mode,
      slowMotion,
      fps: Math.round(fpsEma),
    };
  },
  /** 便捷调试:触发 / 复位 */
  trigger() {
    if (!machine.triggered) { machine.trigger(); ui.setTriggered(true); }
    return machine.getState();
  },
  reset() {
    buildMachine();
    ui.reset();
    return machine.getState();
  },
  /** 物理探针:骨牌倾角(°)与各球位置,定位断链点 */
  probe() {
    const tilt = (b) => {
      const { x, z } = b.quaternion;
      const upY = 1 - 2 * (x * x + z * z);   // 旋转后 up 向量的 y 分量
      return Math.round(Math.acos(Math.max(-1, Math.min(1, upY))) * 180 / Math.PI);
    };
    const d = machine.dyn;
    const p = (b) => ({ x: +b.position.x.toFixed(3), y: +b.position.y.toFixed(3), z: +b.position.z.toFixed(3) });
    return {
      dominoTilts: d.dominoes.map(tilt),
      bigBall: p(d.bigBall),
      smallBall: p(d.smallBall),
      bob: p(d.bob),
      plankQz: +d.plank.quaternion.z.toFixed(4),
    };
  },
};
