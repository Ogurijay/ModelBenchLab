import {Track} from './track.js';
import {getSetup,inspectCar,normalizeBuild} from './data.js';
const STEP=1/240,G=9.81;
export class Race{
 constructor({cars,builds={},playerId,track,venue,count=8,laps=1,laneCount=8}){
  this.track=new Track(track,laneCount);this.venue=venue;this.rounds=Math.max(1,Math.min(3,laps|0));this.laps=laneCount*this.rounds;this.mode='auto';this.time=0;this.state='ready';this.events=[];this.accumulator=0;
  const player=cars.find(c=>c.id===playerId)||cars[0],grid=[player,...cars.filter(c=>c.id!==player.id)].slice(0,Math.min(laneCount,Math.max(1,count|0)));
  this.racers=grid.map((car,i)=>({car,player:i===0,initialLane:i,lane:i,setup:getSetup(car,builds[car.id]),build:normalizeBuild(builds[car.id]),progress:0,distance:0,completed:0,speed:0,battery:100,heat:venue.ambient,finish:null,bestLap:null,lastLap:0,status:'ready',reason:null,air:null,airOffset:0,bounceCount:0,wobble:0,boost:false,turnLoad:0}));this.player=this.racers[0];
 }
 start(){if(this.state!=='ready')return false;for(const r of this.racers){const inspection=inspectCar(r.car,r.build);if(!inspection.legal){this.events.push({type:'warning',text:r.car.name+'未通过车检：'+inspection.reasons.join('、')});return false;}}this.countdown=3;this.state='countdown';return true;}
 pause(){if(this.state==='paused')this.state=this.resumeState;else if(['running','countdown'].includes(this.state)){this.resumeState=this.state;this.state='paused';}}
 changeLane(){return false;}
 retire(r,reason){if(r.status!=='running')return;r.status='dnf';r.reason=reason;r.speed=0;if(r.player)this.events.push({type:'warning',text:'退赛：'+reason+'。回工坊调整刹车、轮胎或阻尼器。'});}
 update(dt,input={}){
  if(!Number.isFinite(dt)||dt<=0||['ready','paused','finished'].includes(this.state))return;this.accumulator+=Math.min(dt,.1);
  while(this.accumulator>=STEP){this.accumulator-=STEP;if(this.state==='countdown'){this.countdown-=STEP;if(this.countdown<=0){this.state='running';for(const r of this.racers)r.status='running';}}else if(this.state==='running')this.step(STEP,input);}
 }
 step(dt,input){
  this.time+=dt;
  for(const r of this.racers){
   if(r.status!=='running')continue;const s=r.setup,pose=this.track.pose(r.progress,r.initialLane),manual=r.player&&this.mode==='manual';
   // Competition motors stay on. No AI throttle, active steering, boost or mid-race tuning.
   const throttle=manual?(input.throttle?1:0):1,voltageFactor=.94+.06*r.battery/100,thermal=Math.max(.7,1-Math.max(0,r.heat-60)*.007),maxSpeed=s.topSpeed*voltageFactor*thermal;
   const motor=s.acceleration*throttle*Math.max(0,1-r.speed/maxSpeed),rolling=s.parts.tires.rolling*G;
   r.turnLoad=r.speed*r.speed*pose.curvature;const rollerLoss=r.turnLoad*s.cornerLoss,rampBrake=pose.slope>.075?s.brake*4:0;
   const acceleration=r.air?0:motor-rolling-rollerLoss-G*pose.slope-rampBrake-(manual&&input.brake?12:0);
   r.speed=Math.max(0,r.speed+acceleration*dt);r.boost=false;
   const ds=r.speed*dt,old=r.progress;r.progress+=ds/this.track.length/Math.max(.35,pose.scale);r.distance+=ds;r.lane=this.track.laneAt(r.progress,r.initialLane);
   r.battery=Math.max(0,r.battery-s.current*1000/3600/s.capacity*100*dt*(.6+throttle*.4));r.heat+=(s.current*1.3-(r.heat-this.venue.ambient)*.035)*dt;
   if(!r.air)for(const jump of this.track.jumps){const lap=Math.floor(old),launch=lap+jump.launch/this.track.length;if(old<launch&&r.progress>=launch){const origin=this.track.rawPoint(launch,r.initialLane),p=this.track.pose(launch-.000001,r.initialLane);r.air={origin,heading:p.tangent.clone().setY(0).normalize(),time:0,vy:r.speed*(jump.height/(jump.launch-jump.start)),horizontal:0};break;}}
   if(r.air){
    const a=r.air;a.time+=dt;a.horizontal+=ds;const floor=this.track.rawPoint(r.progress,r.initialLane),height=a.origin.y+a.vy*a.time-G*a.time*a.time/2;
    r.airOffset=Math.max(0,height-floor.y);r.airPosition=a.origin.clone().addScaledVector(a.heading,a.horizontal);r.airPosition.y=height;
    if(a.time>.015&&height<=floor.y){
     const lateral=Math.hypot(r.airPosition.x-floor.x,r.airPosition.z-floor.z);
     if(lateral>this.track.laneWidth*.48){this.retire(r,'跳台落地越过护墙 / 串道');continue;}
     const impact=Math.abs(a.vy-G*a.time),bounce=impact*s.bounce;r.air=null;r.airOffset=0;r.airPosition=null;r.bounceCount++;
     if(bounce>.3)r.air={origin:floor,heading:this.track.pose(r.progress,r.initialLane).tangent.clone().setY(0).normalize(),time:0,vy:bounce,horizontal:0};
    }
   }else if(r.turnLoad>s.cornerLimit){this.retire(r,'高速弯道倾翻冲出赛道');continue;}
   r.wobble=Math.max(0,r.turnLoad/s.cornerLimit-.65);
   if(Math.floor(r.progress)>r.completed){
    r.completed=Math.floor(r.progress);const crossing=this.time-dt+(r.completed-old)/(r.progress-old)*dt,lapTime=crossing-r.lastLap;r.bestLap=r.bestLap===null?lapTime:Math.min(r.bestLap,lapTime);r.lastLap=crossing;
    if(r.player)this.events.push({type:'lap',lap:r.completed,time:lapTime});
    if(r.completed>=this.laps){r.finish=crossing;r.status='finished';r.progress=this.laps;r.speed=0;}
   }
   r.stalled=r.speed<.025&&throttle>0?(r.stalled||0)+dt:0;
   if(r.stalled>4)this.retire(r,'坡道失速 / 阻塞赛道，刹车过强或扭矩不足');
   if(r.battery<=0)this.retire(r,'电池耗尽');
  }
  if(this.racers.every(r=>['finished','dnf'].includes(r.status)))this.state='finished';
  else if(this.time>600){for(const r of this.racers)this.retire(r,'达到十分钟练习赛时限');this.state='finished';}
 }
 get standings(){return [...this.racers].sort((a,b)=>a.finish!==null&&b.finish!==null?a.finish-b.finish:a.finish!==null?-1:b.finish!==null?1:a.status==='dnf'&&b.status!=='dnf'?1:b.status==='dnf'&&a.status!=='dnf'?-1:b.progress-a.progress);}
}
