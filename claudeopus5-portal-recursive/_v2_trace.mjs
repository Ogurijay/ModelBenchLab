import { Game } from './src/sim/game.js';
import { FIXED_DT } from './src/sim/motion.js';
globalThis.localStorage = { getItem: () => '4', setItem: () => {} };
const fx = (a) => a.map((v) => +v.toFixed(3)).join(',');
function mk(){ const g=new Game({}); g.load(3,true); const p=g.player;
  p.ent.pos=[-1,0.9,15.0]; p.ent.vel=[0,0,0]; p.yaw=0; p.pitch=-1.0; p.keys={}; g.shoot('blue'); return g; }

// A: 纯 W,不跳
{ const g=mk(); const p=g.player; p.keys={KeyW:true};
  console.log('== A: 只按 W,不跳 ==');
  for(let i=0;i<360;i++){ g.update(FIXED_DT); if(i%10===0||i<40) if(i<160) console.log(i, fx(p.ent.pos), 'v',fx(p.ent.vel), 'g',p.ent.onGround); }
  console.log('final', fx(p.ent.pos), 'deaths', g.stats.deaths);
}
