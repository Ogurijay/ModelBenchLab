export const FIGHTER_SCALE=.8;
// Tunable 60 Hz move data. These are this remake's values, not extracted BVN frame data.
const profiles={naruto:[5,3,11],sasuke:[6,3,12],sakura:[8,4,16],kakashi:[5,3,12],ichigo:[7,4,14],rukia:[6,3,12],byakuya:[7,4,14],renji:[9,5,17]};
export function moveData(r,kind,dir='neutral',chain=1,cost=0){
  const normal=kind==='normal',ultimate=kind==='ultimate',heavy=ultimate||normal&&(chain===4||dir==='down');
  const [startup,active,recovery]=profiles[r.id];
  const move={startup:normal?startup:ultimate?10:8,active:normal?active:ultimate?12:10,recovery:normal?recovery:ultimate?28:20,
    damage:normal?(32+chain*8)*r.power:(ultimate?(cost===300?420:cost===200?290:205):105)*r.power,
    hitstun:normal?18:ultimate?32:25,blockstun:normal?9:ultimate?21:15,hitstop:heavy?9:normal?5:7,blockstop:heavy?5:3,
    push:heavy?380:normal?170:260,blockPush:heavy?180:100,guardDamage:ultimate?55:heavy?38:22,
    launch:dir==='up'?580:normal?chain===4?320:0:ultimate?450:180,
    knockdown:ultimate||dir==='up'||normal&&chain===4,hardKnockdown:ultimate,
    reach:normal?r.reach+(chain===4?30:0):r.range,height:normal?98:140,bottom:normal?25:10,
    type:normal?'melee':r.kind,heavy,sound:['sasuke','ichigo','rukia','byakuya','renji'].includes(r.id)?'blade':'fist',
    cancelHit:normal?['normal','skill','ultimate']:ultimate?[]:['ultimate'],cancelBlock:normal&&chain<4?['normal']:[],
    cancelStart:normal?startup+1:9,chip:normal?0:.06};
  if(normal&&chain===4){move.startup+=3;move.recovery+=8;move.cancelHit=['skill','ultimate'];}
  if(dir==='up'){move.bottom=45;move.height=195;}
  if(dir==='down'){move.bottom=0;move.height=65;if(normal){move.damage*=1.15;move.reach+=20;}}
  if(dir==='air'){move.bottom=-45;move.height=165;move.damage*=1.1;}
  if(!normal){
    if(!ultimate&&dir==='neutral'&&['naruto','sasuke','kakashi'].includes(r.id)){move.type=r.id==='sasuke'?'fire':r.id==='naruto'?'shuriken':'kunai';move.damage=r.id==='sasuke'?95:70;move.launch=0;move.knockdown=false;}
    if(!ultimate&&dir==='down'&&r.id==='naruto'){move.type='clone';move.damage=120;move.launch=250;}
    if(!ultimate&&dir==='down'&&r.id==='sasuke'){move.type='ground-lightning';move.damage=115;move.launch=270;}
    if(!ultimate&&dir==='down'&&r.id==='kakashi'){move.type='counter';move.active=36;move.recovery=18;move.cancelHit=[];}
    if(['rush','lightning','warp'].includes(move.type)){move.reach=125;move.active=ultimate?16:14;move.speed=ultimate?1700:1450;move.travel=ultimate?600:r.range;}
    if(move.type==='quake'){move.reach=ultimate?540:dir==='down'?300:205;move.height=ultimate?330:dir==='up'?230:120;move.launch=ultimate?580:dir==='up'?580:0;move.guardDamage=55;}
    if(move.type==='whip'){move.reach=ultimate?700:dir==='up'?250:370;move.height=dir==='up'?300:120;}
  }
  if(normal){move.reach*=FIGHTER_SCALE;move.height*=FIGHTER_SCALE;move.bottom*=FIGHTER_SCALE;}
  move.total=move.startup+move.active+move.recovery;
  move.cancelEnd=move.startup+move.active+Math.min(8,move.recovery);
  return move;
}
export function hurtBox(f){return {x:f.x-24*FIGHTER_SCALE,y:f.y+4*FIGHTER_SCALE,w:48*FIGHTER_SCALE,h:(f.state==='down'?35:f.state==='block'||f.state==='blockstun'?116:132)*FIGHTER_SCALE};}
export function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
export function attackBox(f){
  const a=f.attack;if(!a||a.frame<a.move.startup||a.frame>=a.move.startup+a.move.active||!['melee','rush','lightning','warp','quake','whip'].includes(a.move.type))return null;
  const m=a.move,range=m.reach;
  return {x:a.face>0?f.x+10:f.x-range-10,y:f.y+m.bottom,w:range,h:m.height};
}
