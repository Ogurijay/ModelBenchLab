import { Game } from './src/sim/game.js';
import { FIXED_DT } from './src/sim/motion.js';
globalThis.localStorage = { getItem: () => '4', setItem: () => {} };
const fx = (a) => JSON.stringify(a.map((v) => +v.toFixed(4)));

const g = new Game({});
g.load(3, true); // C4
const p = g.player;
p.ent.pos = [-1, 0.9, 15.0]; p.ent.vel=[0,0,0]; p.yaw = 0; p.pitch = -1.0; p.keys = {};
g.shoot('blue');
console.log('blue frame', g.portals.blue.frame && fx(g.portals.blue.frame.P), 'N', g.portals.blue.frame.N, 'U', g.portals.blue.frame.U);
console.log('activePortals', g.activePortals.length, 'plugs', g.world.plugs.map(b=>({min:b.min.map(v=>+v.toFixed(3)),max:b.max.map(v=>+v.toFixed(3))})));
p.keys = { KeyW: true };
let minY=1e9, maxY=-1e9, ground=0;
for (let i=0;i<1200;i++){ p.queueJump(); g.update(FIXED_DT); const y=p.ent.pos[1]; if(i>120){minY=Math.min(minY,y);maxY=Math.max(maxY,y);} if(p.ent.onGround) ground++; }
console.log('after 10s W+jump pos', fx(p.ent.pos), 'vel', fx(p.ent.vel), 'onGround frames', ground, 'yRange', minY.toFixed(3), maxY.toFixed(3), 'deaths', g.stats.deaths);
