// 入口：装配模拟器 / 渲染器 / UI，主循环，调试钩子
import { W, H } from './const.js';
import { E, NAME, SYM } from './elements.js';
import { Sim } from './engine.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { buildDemo } from './demo.js';

const canvas = document.getElementById('view');
canvas.width = W;
canvas.height = H;

const sim = new Sim();
const renderer = new Renderer(canvas, sim);
const ui = new UI(sim, renderer, canvas, () => buildDemo(sim));

buildDemo(sim);

let fps = 60;
let lastT = performance.now();

function frame(now) {
  // 工具持续施放（暂停时也允许绘制）
  ui.tick();
  if (!ui.paused) {
    for (let k = 0; k < ui.speed; k++) sim.step();
  } else if (ui.stepOnce) {
    sim.step();
    ui.stepOnce = false;
  }
  renderer.draw();
  renderer.overlay((ctx) => ui.drawOverlay(ctx));

  const dt = now - lastT;
  lastT = now;
  if (dt > 0) fps += (1000 / dt - fps) * 0.06;
  ui.updateStatus(fps);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// —— 调试/验证钩子（供自动化测试使用，不影响游戏）——
const nameToId = (v) => typeof v === 'string' ? E[v] : v;
window.__pg = {
  sim, renderer, ui,
  ready: true,
  step(n = 1) { for (let k = 0; k < n; k++) sim.step(); renderer.draw(); },
  pause(b = true) { if (ui.paused !== b) ui.togglePause(); },
  paint(x, y, key, r = 3) { sim.paint(x, y, r, nameToId(key)); renderer.draw(); },
  read(x, y) {
    const i = y * W + x;
    const t = sim.cells[i];
    return { id: t, key: Object.keys(E).find(k => E[k] === t), name: NAME[t], sym: SYM[t], temp: sim.temp[i], life: sim.life[i], aux: sim.aux[i] };
  },
  count(key) {
    if (key === undefined) return renderer.particleCount;
    const id = nameToId(key);
    let c = 0;
    for (let i = 0; i < W * H; i++) if (sim.cells[i] === id) c++;
    return c;
  },
  pixel(x, y) {
    const d = renderer.ctx.getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2]];
  },
  demo() { buildDemo(sim); renderer.draw(); },
  clear() { sim.clear(); renderer.draw(); },
};
console.log('[粉末实验室] 引擎就绪：' + W + '×' + H + ' 网格，元素 ' + Object.keys(E).length + ' 种');
