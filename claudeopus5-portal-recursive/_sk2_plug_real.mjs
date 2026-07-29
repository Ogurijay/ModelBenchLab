// 怀疑者#2:端到端真实操作复现(不手改坐标):C4 里转身瞄地面白板开蓝门,再走上去
import { Game } from './src/sim/game.js';
import { FIXED_DT } from './src/sim/motion.js';

globalThis.localStorage = { getItem: () => '4', setItem: () => {} };
const g = new Game({});
g.load(3, true); // C4
const p = g.player;
console.log('spawn', p.ent.pos, 'gun', p.gun);

// 转身面向 +Z(地面白板 x∈[-3,1] z∈[12,16]),略微俯视开一枪
p.yaw = Math.PI;
p.pitch = -0.32;
g.shoot('blue');
console.log('blue placed?', g.portals.blue.placed, 'P=', g.portals.blue.frame && g.portals.blue.frame.P,
  'N=', g.portals.blue.frame && g.portals.blue.frame.N, 'U=', g.portals.blue.frame && g.portals.blue.frame.U);
console.log('orange placed?', g.portals.orange.placed, 'linked?', !!g.portals.blue.link);

// 只按 W 往门口走(yaw=π ⇒ 前向 +Z)
p.keys = { KeyW: true };
p.pitch = 0;
const trail = [];
for (let i = 0; i < 120 * 8; i++) {
  g.update(FIXED_DT);
  if (i % 12 === 0) trail.push(`${(i / 120).toFixed(1)}s y=${p.ent.pos[1].toFixed(3)} z=${p.ent.pos[2].toFixed(2)} g=${p.ent.onGround ? 1 : 0}`);
}
console.log(trail.join('\n'));
const s = g.getState();
console.log('末态', s.pos.map((v) => +v.toFixed(3)), 'onGround', s.onGround, 'deaths', s.stats.deaths, 'teleports', s.stats.teleports);

// 松开 W 后是否还在弹
p.keys = {};
let lo = 9, hi = -9, flips = 0, prev = 0;
for (let i = 0; i < 120 * 4; i++) {
  const before = p.ent.pos[1];
  g.update(FIXED_DT);
  const d = Math.sign(p.ent.pos[1] - before);
  if (d && prev && d !== prev) flips++;
  if (d) prev = d;
  lo = Math.min(lo, p.ent.pos[1]);
  hi = Math.max(hi, p.ent.pos[1]);
}
console.log('松手静置 4s: y∈[', lo.toFixed(3), ',', hi.toFixed(3), '] 方向反转次数=', flips, 'onGround=', p.ent.onGround);

// 试着跳出去
p.keys = { KeyW: true };
let jumps = 0;
for (let i = 0; i < 120 * 5; i++) { p.queueJump(); g.update(FIXED_DT); if (p.ent.vel[1] > 5) jumps++; }
console.log('狂跳 5s: 起跳次数=', jumps, 'pos=', p.ent.pos.map((v) => +v.toFixed(2)));
