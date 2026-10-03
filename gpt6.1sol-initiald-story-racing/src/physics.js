import { RAIL_OFFSET,RAIL_HALF_WIDTH,wrap } from './track.js';
import { CARS,carById } from './data.js';
import { VEHICLE_PROFILES } from './vehicle-profiles.js';
export const STEP=1/120;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function collisionLimit(v,frame){
  const c=VEHICLE_PROFILES[v.id],angle=wrap(v.yaw-Math.atan2(frame.tx,frame.tz));
  const extent=c.width*.5*Math.abs(Math.cos(angle))+c.length*.5*Math.abs(Math.sin(angle));
  const curveMargin=Math.abs(frame.k||0)*(c.length*.5)**2*.5;
  return RAIL_OFFSET-RAIL_HALF_WIDTH-.025-extent-curveMargin;
}
export function createVehicle(track,id='ae86',s=3,offset=0){
  const p=track.at(s);
  return {id,x:p.x+p.tz*offset,z:p.z-p.tx*offset,y:p.y,yaw:Math.atan2(p.tx,p.tz),vx:0,vz:0,grip:1,steering:0,s,index:p.index,offset,angle:0,speed:0,water:100,waterTilt:0,lateralAccel:0,longitudinalAccel:0,driftIntensity:0,handbrake:false,throttle:false,brake:false,assistDelay:0,assistWeight:0,score:0,combo:0,perfect:0,cooldown:0,collisions:0,gutter:false,previousSteer:0,transfer:0,luckSeed:71,luckSaves:0};
}
export function wulingBoost(opponent){return 1+clamp((carById(opponent).strength-1)*.072,0,.5);}
export function stepVehicle(v,input,track,dt=STEP,options={}){
  const c=carById(v.id),oldVx=v.vx,oldVz=v.vz;
  // Driver convention: +1 is right. With a +Z nose, right is local -X and negative yaw.
  let steer=clamp(input.steer||0,-1,1);
  v.handbrake=!!input.handbrake;v.throttle=!!input.throttle;v.brake=!!input.brake;
  v.assistDelay=(steer||input.handbrake)?.3:Math.max(0,v.assistDelay-dt);
  const assistTarget=options.assist&&!v.assistDelay&&!input.handbrake?clamp(1-Math.abs(v.angle)/.6,0,1):0;
  v.assistWeight+=(assistTarget-v.assistWeight)*(1-Math.exp(-dt*8));
  if(options.assist&&!steer&&v.speed>3&&v.assistDelay===0){
    const look=track.at(v.s+Math.max(10,v.speed*.68));
    steer=clamp(-wrap(Math.atan2(look.x-v.x,look.z-v.z)-v.yaw)*2.4,-.7,.7)*v.assistWeight;
  }
  const countersteering=steer*v.steering<0;
  v.steering+=(steer-v.steering)*(1-Math.exp(-dt*(countersteering?26:steer?18:12)));
  if(v.grip>.7&&!input.handbrake&&Math.sign(steer)!==Math.sign(v.previousSteer)&&Math.abs(steer-v.previousSteer)>1.2&&v.speed>16)v.transfer=.32;
  v.previousSteer=steer;v.transfer=Math.max(0,v.transfer-dt);
  const sliding=(input.handbrake&&v.speed>8)||v.transfer>0;
  const targetGrip=sliding?.16:1;
  v.grip+=(targetGrip-v.grip)*(1-Math.exp(-dt*(sliding?12:2.2)));
  const boost=v.id==='wuling'?wulingBoost(options.opponent||'ae86')*(1+(options.passengers||0)*.015):1;
  const maxSpeed=c.max*boost;
  const gtrUndersteer=v.id==='gtr'?1-clamp(v.speed/100,0,.42):1;
  let yawRate=-v.steering*c.turn*gtrUndersteer*1.52*clamp(v.speed/15,0,1)/(1+v.speed/65);
  const motion=v.speed>1?Math.atan2(v.vx,v.vz):v.yaw,slip=wrap(v.yaw-motion);
  // Soften further rotation near a large slide; countersteering retains its full response.
  if(v.grip<.6&&yawRate*slip>0)yawRate*=1-clamp((Math.abs(slip)-.32)/.5,0,.72);
  v.yaw=wrap(v.yaw+yawRate*dt*(.95+(1-v.grip)*.25));
  const fx=Math.sin(v.yaw),fz=Math.cos(v.yaw);
  let speed=Math.hypot(v.vx,v.vz);
  let accel=(input.throttle?c.accel*boost*(1-clamp(speed/maxSpeed,0,1)**2):0)+track.slope*.42;
  if(input.brake)accel-=14;
  if(input.handbrake)accel-=2;
  if(v.engineBroken)accel=-7;
  speed=clamp(speed+(accel-.55-speed*.018)*dt,0,maxSpeed);
  const direction=speed>1?Math.atan2(v.vx,v.vz):v.yaw;
  const angle=wrap(v.yaw-direction);
  const alignment=1-Math.exp(-c.grip*v.grip*track.grip*dt);
  const velocityAngle=direction+angle*alignment;
  v.vx=Math.sin(velocityAngle)*speed;v.vz=Math.cos(velocityAngle)*speed;
  v.x+=v.vx*dt;v.z+=v.vz*dt;
  const p=track.nearest(v.x,v.z,v.index);
  v.index=p.index;v.s=p.s;v.offset=p.offset;v.y=p.y;
  v.cooldown=Math.max(0,v.cooldown-dt);
  const zone=track.gutterZones.find(g=>v.s>=g.start&&v.s<=g.end);
  // Inner front wheel lies 0.9m beyond the chassis centre. The gutter has a narrow entry band.
  const innerWheel=v.offset+(zone?.side||0)*.9;
  v.gutter=!!(options.gutter&&zone&&innerWheel*zone.side>5.6&&innerWheel*zone.side<6.8&&Math.abs(wrap(v.yaw-Math.atan2(p.tx,p.tz)))<.65&&speed>10);
  if(v.gutter){
    const tangent=Math.atan2(p.tx,p.tz),nudge=1-Math.exp(-dt*5);
    v.yaw=wrap(v.yaw+wrap(tangent-v.yaw)*nudge);
    const toward=wrap(tangent-Math.atan2(v.vx,v.vz))*nudge;
    const d=Math.atan2(v.vx,v.vz)+toward;
    v.vx=Math.sin(d)*speed;v.vz=Math.cos(d)*speed;v.score+=dt*30;
  }
  const boundary=collisionLimit(v,p);
  if(Math.abs(v.offset)>boundary){
    let lucky=false;
    if(!v.cooldown&&options.charm){v.luckSeed=(v.luckSeed*1664525+1013904223)>>>0;lucky=v.luckSeed/4294967296<.01;if(lucky)v.luckSaves++;}
    const impact=!v.cooldown,sign=Math.sign(v.offset);
    const retention=v.id==='benz'||lucky?1:impact?.71:Math.exp(-dt*.8);
    const along=Math.max(0,v.vx*p.tx+v.vz*p.tz)*retention,outward=(v.vx*p.tz-v.vz*p.tx)*sign;
    const lateral=outward>0?-Math.min(1.3,outward*.16):outward;
    v.vx=p.tx*along+p.tz*sign*lateral;v.vz=p.tz*along-p.tx*sign*lateral;
    v.yaw=wrap(v.yaw+wrap(Math.atan2(p.tx,p.tz)-v.yaw)*(1-Math.exp(-dt*(impact?10:3))));
    // The impact can rotate the chassis into a wider footprint. Resolve after that rotation.
    const offset=sign*(Math.min(boundary,collisionLimit(v,p))-.015);
    v.x=p.px+p.tz*offset;v.z=p.pz-p.tx*offset;
    const contact=track.nearest(v.x,v.z,p.index);v.index=contact.index;v.s=contact.s;v.y=contact.y;v.offset=contact.offset;v.gutter=false;
    if(impact){v.collisions++;v.cooldown=.65;v.combo=0;}
  }
  v.speed=Math.hypot(v.vx,v.vz);v.angle=wrap(v.yaw-Math.atan2(v.vx,v.vz));
  const ax=(v.vx-oldVx)/dt,az=(v.vz-oldVz)/dt;
  v.lateralAccel=ax*fz-az*fx;v.longitudinalAccel=ax*fx+az*fz;
  const driftTarget=v.speed>8&&!v.cooldown?clamp((Math.abs(v.angle)-.09)/.38,0,1):0;
  v.driftIntensity+=(driftTarget-v.driftIntensity)*(1-Math.exp(-dt*10));
  v.waterTilt+=(clamp(-v.lateralAccel/20,-.65,.65)-v.waterTilt)*(1-Math.exp(-dt*6));
  if(options.cup){
    const braking=Math.max(0,-(ax*fx+az*fz)-5);
    v.water=Math.max(0,v.water-(Math.max(0,Math.abs(v.lateralAccel)-8)*.045+braking*.065)*dt);
  }
  const stable=Math.abs(v.angle)>.15&&Math.abs(v.angle)<.85&&v.speed>14&&!v.cooldown;
  if(stable){v.combo+=dt;v.score+=dt*v.speed*(.45+Math.abs(v.angle));}
  else v.combo=Math.max(0,v.combo-dt*2);
  if(v.combo>2.2&&v.speed>22&&Math.abs(v.angle)<.6){v.perfect++;v.combo=0;}
  return v;
}
export function createOpponent(track,id='gtr',s=22,lane=0){return {id,s,speed:0,lane,offset:lane,finishedAt:null,collisions:0,prevCrash:false};}
export function stepOpponent(o,track,dt,time,options={}){
  const c=carById(o.id),p=track.at(o.s),look=track.at(o.s+30);
  let target;
  if(options.finalBoss){target=o.s<track.straightStart?20:80;}
  else {
    const bend=Math.max(Math.abs(p.k),Math.abs(look.k));
    const base=options.easy?.71:options.technical?.88:.78;
    target=Math.min(c.max*base,Math.sqrt((o.id==='fc'?9.4:7)/(bend+.004)));
    if(o.id==='benz')target=Math.min(target,24); // Freeplay mountain Benz is genuinely beatable.
    if(o.id==='evo')target*=1.12;
    const pushes=(o.id==='gtr'||o.id==='evo')&&bend>.04;
    o.offset=o.lane+(pushes?-Math.sign(p.k)*5.1:Math.sin(time*.65+o.lane)*.6);
    if(pushes){target*=o.id==='evo'?.69:.8;if(!o.prevCrash)o.collisions++;}
    o.prevCrash=pushes;
    const limit=RAIL_OFFSET-RAIL_HALF_WIDTH-.04-VEHICLE_PROFILES[o.id].width*.5-Math.abs(p.k)*(VEHICLE_PROFILES[o.id].length*.5)**2*.5;
    o.offset=clamp(o.offset,-limit,limit);
  }
  o.brake=!options.finalBoss&&target<o.speed-1.5;
  o.speed+=clamp(target-o.speed,-18*dt,c.accel*dt);
  if(options.finalBoss)o.speed=target;
  o.s+=o.speed*dt;
  if(o.s>=track.length&&o.finishedAt===null)o.finishedAt=time;
}
export function makeSave(){return {version:1,next:0,completed:[],unlocked:['ae86','ae85','wuling'],best:{},gutter:false};}
export function completeChapter(save,id){
  if(!save.completed.includes(id))save.completed.push(id);
  save.next=Math.max(save.next,Math.min(14,id+1));
  for(const car of CARS)if(car.unlock===id&&!save.unlocked.includes(car.id))save.unlocked.push(car.id);
  if(id>=6)save.gutter=true;
  return save;
}
export function resultFor(race,track){
  if(race.config.cup&&race.player.water<=0)return 'spill';
  if(race.config.forced&&race.player.s>=track.length-3)return 'scripted-loss';
  const mode=race.config.mode;
  if(mode==='chase'){
    const o=race.opponents[0];
    if(race.player.s>o.s+5)return 'win';
    if(o.s-race.player.s>100&&race.elapsed>8)return 'lose';
  }
  if(race.player.s<track.length-3)return null;
  if(mode==='time'||mode==='tofu'||race.config.practice)return 'win';
  return race.opponents.some(o=>o.finishedAt!==null&&o.finishedAt<race.elapsed)?'lose':'win';
}
