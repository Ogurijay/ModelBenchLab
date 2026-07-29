// 更贴近实操:用枪打地面白板(只打一扇),然后按 W 走过去
import { Game } from './src/sim/game.js';
import { FIXED_DT } from './src/sim/motion.js';
import { makeFrame } from './src/core/transform.js';

globalThis.localStorage = { getItem: () => '4', setItem: () => {} };

function run(idx, label, alsoOrange) {
  const g = new Game({ onEvent: (n, d) => { if (n === 'deny') console.log('  deny:', d.text); } });
  g.load(idx, true);
  const p = g.player;
  // 站在白板北侧(z=16.4 之外?板 z∈[12,16]),从 z=16.5 朝 -Z 走
  p.ent.pos = [-1, 0.9, 16.2];
  p.ent.vel = [0, 0, 0];
  p.yaw = 0;            // 面向 -Z
  p.pitch = -0.75;      // 低头瞄地板
  p.keys = {};
  g.update(FIXED_DT);
  g.shoot('blue');
  if (alsoOrange) g.placeFrame('orange', makeFrame([0, 6.5, 2.12], [0, 0, -1], [0, 1, 0]));
  const b = g.portals.blue;
  console.log(label, 'blue placed=', b.placed, b.placed ? 'P=' + JSON.stringify(b.frame.P.map((v) => +v.toFixed(2))) + ' N=' + JSON.stringify(b.frame.N) : '', 'linked=', !!b.link);
  if (!b.placed) return;
  p.pitch = 0;
  p.keys = { KeyW: true };
  const ys = [];
  let bounces = 0, lastDir = 0;
  let prevY = p.ent.pos[1];
  for (let i = 0; i < 120 * 6; i++) {
    g.update(FIXED_DT);
    const dy = p.ent.pos[1] - prevY;
    if (dy > 0.05 && lastDir <= 0) { bounces++; lastDir = 1; }
    else if (dy < -0.001) lastDir = -1;
    prevY = p.ent.pos[1];
    if (i % 30 === 0) ys.push(+p.ent.pos[1].toFixed(2));
  }
  const st = g.getState();
  console.log('  6s 后 pos=', st.pos.map((v) => +v.toFixed(2)), 'onGround=', st.onGround,
    'teleports=', st.teleports ?? st.stats.teleports, 'deaths=', st.stats.deaths, '突然上弹次数=', bounces);
  console.log('  y(每 0.25s):', ys.join(' '));
}

run(3, 'C4 单门:', false);
run(3, 'C4 双门(配对):', true);
run(4, 'C5 单门:', false);
