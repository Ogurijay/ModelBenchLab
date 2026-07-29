// 怀疑者#2:把蓝门重打到「同一块地面白板的另一处」,看是否封死
import { Game } from './src/sim/game.js';
import { FIXED_DT } from './src/sim/motion.js';

globalThis.localStorage = { getItem: () => '4', setItem: () => {} };
const mk = () => { const g = new Game({}); g.load(3, true); return g; };
const fx = (a) => JSON.stringify(a.map((v) => +v.toFixed(4)));

function setup() {
  const g = mk();
  const p = g.player;
  p.ent.pos = [-1, 0.9, 14]; p.ent.vel = [0, 0, 0]; p.yaw = 0; p.pitch = -1.5; p.keys = {};
  g.shoot('blue');
  return g;
}

// 朝地板白板上的目标点开枪
function shootAt(g, target) {
  const p = g.player;
  const e = p.eye();
  const d = [target[0] - e[0], target[1] - e[1], target[2] - e[2]];
  const L = Math.hypot(...d);
  p.yaw = Math.atan2(-d[0], -d[2]);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, d[1] / L)));
  g.shoot('blue');
  return g.portals.blue.frame.P;
}

let trapped = 0; const notes = [];
for (let k = 0; k < 200; k++) {
  const g = setup(); const p = g.player;
  for (let i = 0; i < k; i++) g.update(1 / 60);
  const yBefore = p.ent.pos[1];
  const before = fx(p.ent.pos);
  const P = shootAt(g, [0.3, 0, 15.6]);
  // 新门口范围
  const dead = Math.abs(P[0] - (-1)) < 0.05 && Math.abs(P[2] - 14) < 0.05;
  p.keys = { KeyW: true };
  for (let i = 0; i < 60 * 6; i++) { if (i % 10 === 0) p.queueJump(); g.update(1 / 60); }
  const after = fx(p.ent.pos);
  if (before === after) {
    trapped++;
    if (notes.length < 10) notes.push(`k=${k} y0=${yBefore.toFixed(4)} 新门P=${fx(P)} 卡死于 ${after} vel=${fx(p.ent.vel)} onGround=${p.ent.onGround} deaths=${g.stats.deaths} dead=${dead}`);
  }
}
console.log('[dt=1/60] 卡死 / 200 =', trapped);
for (const n of notes) console.log('  ', n);

// 卡死后:能否靠「朝脚下再开一次门」自救?
{
  const g = setup(); const p = g.player;
  let k = 0;
  while (k < 400 && !(p.ent.pos[1] < 0.011)) { g.update(1 / 60); k++; }
  console.log('\n找到 y=', p.ent.pos[1].toFixed(4), 'at frame', k);
  shootAt(g, [0.3, 0, 15.6]);
  const stuck = fx(p.ent.pos);
  p.keys = { KeyW: true };
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  console.log('2 秒后 pos=', fx(p.ent.pos), '(卡死?', stuck === fx(p.ent.pos), ')');
  // 自救:朝脚下白板再开一枪
  p.keys = {};
  const P2 = shootAt(g, [-1, 0, 14]);
  console.log('朝脚下重开门 P=', fx(P2), 'pos 立刻=', fx(p.ent.pos));
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  console.log('再 2 秒 pos=', fx(p.ent.pos), 'vel=', fx(p.ent.vel), 'onGround=', p.ent.onGround);
}
