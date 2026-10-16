// 入口:初始化物理与渲染,主循环(rAF,标签页隐藏时 setInterval 兜底),评测钩子 window.__bench。
import * as THREE from 'three';
import { Game } from './game.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { DT } from './physics.js';

const ui = new UI();
const game = new Game(document.getElementById('view'), ui);

let last = performance.now();
let lastTick = 0;
function tick(now) {
  const dt = (now - last) / 1000;
  last = now;
  lastTick = now;
  if (window.__bench?.hold) return; // 无头评测时冻结实时循环
  game.frame(dt);
}
function loop(now) { tick(now); requestAnimationFrame(loop); }
setInterval(() => { const now = performance.now(); if (now - lastTick > 250) tick(now); }, 50);

(async () => {
  await game.init();
  ui.bind(game);
  document.getElementById('loading').classList.remove('show');
  ui.show('title');
  audio.music('menu');
  addEventListener('pointerdown', () => audio.init(), { once: true });
  addEventListener('keydown', () => audio.init(), { once: true });
  requestAnimationFrame(loop);
  const q = new URLSearchParams(location.search);
  if (q.has('quick')) {
    ui.startCfg({ mode: q.get('mode') || 'ffa', map: q.get('map') || 'random', rounds: Number(q.get('rounds') || 3), bots: Number(q.get('bots') || 5), difficulty: Number(q.get('diff') || 1), player: ui.playerCfg(), seed: Number(q.get('seed') || 7) });
  }
})();

// ---- 评测/调试钩子 ----
window.__bench = {
  game, ui, THREE,
  // 无头推进 n 个物理步(不依赖 rAF)
  step(n = 60) { for (let i = 0; i < n; i++) game.frame(DT); return this.state(); },
  start(cfg = {}) { ui.startCfg({ mode: 'ffa', map: 'rooftop', rounds: 3, bots: 3, difficulty: 1, player: ui.playerCfg(), seed: 7, ...cfg }); return this.state(); },
  state() {
    return {
      state: game.state, round: game.round, t: +game.roundT.toFixed(2), map: game.mapDef?.id,
      creatures: game.creatures.map((c) => ({ id: c.id, name: c.name, sp: c.species, alive: c.alive, ko: c.ko, consc: +c.consc.toFixed(1), frozen: c.frozen > 0, pos: c.alive ? [c.pos.x, c.pos.y, c.pos.z].map((v) => +v.toFixed(2)) : null, grounded: c.grounded, weapon: c.weapon?.type || null, held: !!c.heldTarget() })),
      items: game.items.length, wins: game.teamWins,
    };
  },
  // 给玩家意图(持续若干步)
  drive(intent, n = 30) { const p = game.player; game.benchDrive = true; for (let i = 0; i < n; i++) { Object.assign(p.intent, intent); game.frame(DT); } return this.state(); },
  shot() { return game.renderer.domElement.toDataURL('image/png'); },
};
