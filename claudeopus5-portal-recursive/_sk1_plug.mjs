// 怀疑者#1 复现:C4 只放一扇地面门(未配对),玩家走上去
import { Game } from './src/sim/game.js';
import { FIXED_DT } from './src/sim/motion.js';
import { makeFrame, localizePoint } from './src/core/transform.js';
import { aperturePrism } from './src/sim/world.js';

globalThis.localStorage = { getItem: () => '4', setItem: () => {} };

const g = new Game({});
g.load(3, true); // C4
const P = [-1, 0, 14];
const frame = makeFrame(P, [0, 1, 0], [0, 0, -1]);

// 1) 几何:depth / plug 范围
const prism = aperturePrism(frame, g.world.baseSolids);
console.log('depth =', prism.depth);
console.log('cut   =', JSON.stringify(prism.cut));
console.log('plug  =', JSON.stringify(prism.plug));

// 2) 只放蓝门(未配对)
g.placeFrame('blue', frame);
console.log('portals linked?', !!g.portals.blue.link, 'activePortals=', g.activePortals.length);
console.log('plugs =', g.world.plugs.length);

// 3) 玩家站到门口上方,自由落体
const p = g.player;
p.ent.pos = [-1, 1.6, 14];
p.ent.vel = [0, 0, 0];
p.keys = {};
const ys = [];
for (let i = 0; i < 120 * 5; i++) {
  g.update(FIXED_DT);
  if (i % 6 === 0) ys.push(+p.ent.pos[1].toFixed(3));
}
console.log('y 采样(每 0.05s):');
console.log(ys.join(' '));
const st = g.getState();
console.log('末态 pos=', st.pos.map((v) => +v.toFixed(3)), 'vel=', st.vel.map((v) => +v.toFixed(2)),
  'onGround=', st.onGround, 'deaths=', st.stats.deaths, 'teleports=', st.stats.teleports);
console.log('local z of center =', +localizePoint(frame, p.ent.pos)[2].toFixed(3));

// 4) 能不能跳出来 / 走出来
p.keys = { KeyW: true };
p.yaw = 0;
let escaped = false;
for (let i = 0; i < 120 * 6; i++) {
  p.queueJump();
  g.update(FIXED_DT);
  if (Math.abs(p.ent.pos[0] - P[0]) > 1.3 || Math.abs(p.ent.pos[2] - P[2]) > 1.7) { escaped = true; break; }
}
console.log('按住 W + 一直跳 6s → 逃出门口?', escaped, 'pos=', p.ent.pos.map((v) => +v.toFixed(2)),
  'onGround=', p.ent.onGround);
