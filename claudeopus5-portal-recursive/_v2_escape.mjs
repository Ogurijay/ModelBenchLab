import { Game } from './src/sim/game.js';
import { FIXED_DT } from './src/sim/motion.js';
globalThis.localStorage = { getItem: () => '4', setItem: () => {} };
const fx = (a) => a.map((v) => +v.toFixed(3)).join(',');
function trapped(level=3){
  const g=new Game({}); g.load(level,true); const p=g.player;
  p.ent.pos=[-1,0.9,15.0]; p.ent.vel=[0,0,0]; p.yaw=0; p.pitch=-1.0; p.keys={}; g.shoot('blue');
  p.keys={KeyW:true};
  for(let i=0;i<300;i++) g.update(FIXED_DT);
  p.keys={};
  return g;
}
function aim(p,target){ const e=p.eye(); const d=[target[0]-e[0],target[1]-e[1],target[2]-e[2]];
  const L=Math.hypot(...d); p.yaw=Math.atan2(-d[0],-d[2]); p.pitch=Math.asin(Math.max(-1,Math.min(1,d[1]/L))); }

// 0) 确认卡死 + 各种键位/朝向 + 跳跃是否救得出来
{
  const g=trapped(); const p=g.player;
  console.log('trapped at', fx(p.ent.pos), 'onGround', p.ent.onGround, 'kill', g.level.killY);
  const combos=[{KeyW:1},{KeyS:1},{KeyA:1},{KeyD:1},{KeyW:1,KeyA:1},{KeyS:1,KeyD:1}];
  let best=null;
  for(const c of combos){ for(let yi=0;yi<8;yi++){
    const g2=trapped(); const q=g2.player; q.yaw=yi/8*Math.PI*2; q.keys=c;
    for(let i=0;i<1200;i++){ q.queueJump(); g2.update(FIXED_DT); }
    const out = q.ent.pos[1]>0.5;
    if(out) best=[c,yi,fx(q.ent.pos)];
  }}
  console.log('任何键位+狂跳 10s 逃出?', best? JSON.stringify(best):'否（全部仍在洞里）');
}
// 1) 自救 A:朝发射墙白板打橙门 → 配对后被传走
{
  const g=trapped(); const p=g.player;
  console.log('\n[自救A] 站在洞里朝发射墙白板(z=2.2, y≈6.5)打橙门');
  aim(p,[0,6.5,2.16]);
  const before=fx(p.ent.pos);
  g.shoot('orange');
  console.log('  orange placed?', g.portals.orange.placed, g.portals.orange.frame&&fx(g.portals.orange.frame.P), 'link?', g.activePortals.length);
  for(let i=0;i<240;i++) g.update(FIXED_DT);
  console.log('  2s 后 pos', fx(p.ent.pos), 'vel', fx(p.ent.vel), 'teleports', g.stats.teleports, '(原', before, ')');
}
// 2) 自救 B:把蓝门重打到同一块地板白板别处 → 洞被填 → 被顶回地面
{
  const g=trapped(); const p=g.player;
  console.log('\n[自救B] 朝脚边地板白板别处重打蓝门');
  aim(p,[0.2,0,15.5]);
  g.shoot('blue');
  console.log('  new blue P', fx(g.portals.blue.frame.P), 'pos 立刻', fx(p.ent.pos));
  for(let i=0;i<240;i++) g.update(FIXED_DT);
  console.log('  2s 后 pos', fx(p.ent.pos), 'onGround', p.ent.onGround);
}
// 3) C5 同样场景
{
  const g=trapped(4); const p=g.player;
  console.log('\n[C5] trapped at', fx(p.ent.pos));
  aim(p,[0,6.5,2.16]); g.shoot('orange');
  for(let i=0;i<240;i++) g.update(FIXED_DT);
  console.log('  打橙门后 2s:', fx(p.ent.pos), 'teleports', g.stats.teleports);
}
