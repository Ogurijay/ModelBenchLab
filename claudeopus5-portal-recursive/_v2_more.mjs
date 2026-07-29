import { Game } from './src/sim/game.js';
import { FIXED_DT } from './src/sim/motion.js';
globalThis.localStorage = { getItem: () => '4', setItem: () => {} };
const fx=(a)=>a.map(v=>+v.toFixed(3)).join(',');
function aim(p,t){const e=p.eye();const d=[t[0]-e[0],t[1]-e[1],t[2]-e[2]];const L=Math.hypot(...d);
  p.yaw=Math.atan2(-d[0],-d[2]);p.pitch=Math.asin(Math.max(-1,Math.min(1,d[1]/L)));}
function trapped(){const g=new Game({});g.load(3,true);const p=g.player;
  p.ent.pos=[-1,0.9,15.0];p.ent.vel=[0,0,0];p.yaw=0;p.pitch=-1.0;p.keys={};g.shoot('blue');
  p.keys={KeyW:true};for(let i=0;i<300;i++)g.update(FIXED_DT);p.keys={};return g;}

// C: 卡在洞里 -> 朝同一块地板白板别处打橙门(配对)
{ const g=trapped(); const p=g.player;
  aim(p,[0.3,0,15.4]); g.shoot('orange');
  console.log('[C] orange placed?',g.portals.orange.placed, g.portals.orange.frame&&fx(g.portals.orange.frame.P),'link',g.activePortals.length);
  for(let i=0;i<240;i++) g.update(FIXED_DT);
  console.log('    2s 后 pos',fx(p.ent.pos),'onGround',p.ent.onGround,'teleports',g.stats.teleports);
}
// D: 从高台冲下、只放了地面门(忘了发射墙那扇)
{ const g=new Game({}); g.load(3,true); const p=g.player;
  p.ent.pos=[-1,0.9,15.0];p.yaw=0;p.pitch=-1.0;g.shoot('blue');
  // 传送到高台顶,朝 -x 冲
  p.ent.pos=[3.8,8.4,14.0]; p.ent.vel=[-4.6,0,0]; p.yaw=Math.PI/2; p.pitch=0; p.keys={KeyW:true};
  let minY=9,maxY=-9;
  for(let i=0;i<900;i++){ g.update(FIXED_DT); if(i>300){minY=Math.min(minY,p.ent.pos[1]);maxY=Math.max(maxY,p.ent.pos[1]);} }
  console.log('[D] 高台跳洞:pos',fx(p.ent.pos),'y范围',minY.toFixed(3),maxY.toFixed(3),'deaths',g.stats.deaths,'onGround',p.ent.onGround);
}
// E: 卡住后每 0.5s 补一次 W + 每帧跳 30 秒
{ const g=trapped(); const p=g.player; p.keys={KeyS:true};
  for(let i=0;i<3600;i++){ p.queueJump(); if(i%200===0) p.yaw+= Math.PI/3; g.update(FIXED_DT);}
  console.log('[E] 30s 乱按后 pos',fx(p.ent.pos),'deaths',g.stats.deaths);
}
