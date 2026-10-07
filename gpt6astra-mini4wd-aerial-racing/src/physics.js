import {Vector3} from 'three';
import {resolveBuild} from './catalog.js';
export const STEP=1/240;
const GRAVITY=new Vector3(0,-9.81,0);
export function supportAcceleration(frame,speed,downforce=0){return frame.curvature.dot(frame.u)*speed*speed-GRAVITY.dot(frame.u)+downforce;}

export class Race {
  constructor(course,entries,{laps=8,manual=false,player=0}={}){
    this.course=course;this.laps=laps;this.manual=manual;this.player=player;
    this.elapsed=0;this.countdown=3;this.status='ready';this.accumulator=0;this.events=[];this.results=[];
    this.cars=entries.map((entry,i)=>({id:entry.car.id,car:entry.car,build:resolveBuild(entry.car,entry.build),config:{...entry.build},lane:i,initialLane:i,s:0,lap:0,v:0,distance:0,energy:1,temperature:22,throttle:1,status:'ready',frame:course.sample(i,0),support:1,lateralG:0,grip:1,lastLap:0,lapTimes:[],stallTime:0,finishTime:null,fault:'',airTime:0,airVelocity:new Vector3(),spin:0}));
  }
  start(){if(this.status==='ready'){this.status='countdown';this.cars.forEach(c=>c.status='countdown');}}
  event(text,kind='info'){this.events.unshift({t:this.elapsed,text,kind});this.events.length=Math.min(18,this.events.length);}
  update(dt,input={throttle:0,brake:0}){
    if(this.status==='ready'||this.status==='paused')return;
    this.accumulator+=Math.min(.12,Math.max(0,dt));
    while(this.accumulator>=STEP){this.step(STEP,input);this.accumulator-=STEP;}
  }
  step(dt,input){
    if(this.status==='finished'){for(const c of this.cars)if(c.status==='dnf')this.advanceFlight(c,dt);return;}
    if(this.status==='countdown'){
      this.countdown-=dt;
      if(this.countdown<=0){this.status='running';this.cars.forEach(c=>c.status='running');this.event(`信号放行 · ${this.cars.length} 车同时发车`);}
      return;
    }
    if(this.status!=='running')return;
    this.elapsed+=dt;
    for(let i=0;i<this.cars.length;i++){
      const c=this.cars[i];
      if(c.status==='dnf'){
        this.advanceFlight(c,dt);
        continue;
      }
      if(c.status!=='running')continue;
      const f=this.course.sample(c.lane,c.s),b=c.build;
      const throttle=this.manual && i===this.player?Math.max(0,Math.min(1,input.throttle)):1;
      const brake=this.manual && i===this.player?Math.max(0,Math.min(1,input.brake)):0;
      c.throttle=throttle;c.frame=f;
      const aero=c.v*c.v*.005*b.body.downforce;
      const normal=supportAcceleration(f,c.v,aero),side=Math.abs(f.curvature.dot(f.r)*c.v*c.v-GRAVITY.dot(f.r));
      c.support=normal/9.81;c.lateralG=side/9.81;
      if(normal<-.8&&c.v>.8){this.derail(c,f.loop?'环道失去支撑':'坡顶腾空脱轨');continue;}
      if(side>155*b.roller.stability*b.chassis.stiffness){this.derail(c,'弯道侧翻');continue;}
      const voltageSag=.93+.07*c.energy;
      const thermal=c.temperature>65?Math.max(.65,1-(c.temperature-65)*.007):1;
      const free=b.vFree*voltageSag*thermal;
      const motorForce=throttle*b.motor.torque*b.gear.ratio*.62/b.tire.radius*Math.max(0,1-c.v/free);
      const tractionLimit=b.tire.grip*Math.max(0,normal)*b.mass;
      const drive=Math.min(motorForce,tractionLimit);
      c.grip=motorForce>0?Math.min(1,tractionLimit/motorForce):1;
      const resistance=b.tire.roll*Math.max(0,normal)+b.roller.drag*side+.016*c.v*c.v+.09;
      // Brake sponge only scrapes on sharp pitch changes; it is not an automatic cornering controller.
      const pitchContact=Math.max(0,-f.curvature.dot(f.u)-.22)*Math.min(1,c.v/2);
      const brakeAcceleration=brake*(4+b.brake.force*14)+pitchContact*b.brake.force*3.2;
      const acceleration=drive/b.mass+GRAVITY.dot(f.t)-resistance-brakeAcceleration;
      c.v=Math.max(0,c.v+acceleration*dt);
      c.energy=Math.max(.5,c.energy-dt*throttle*(.000035+.000009*c.v));
      c.temperature+=dt*((drive*c.v*1.9)*b.motor.heat-(c.temperature-22)*.065);
      const travelled=c.v*dt;c.s+=travelled;c.distance+=travelled;
      c.stallTime=c.v<.08?c.stallTime+dt:0;
      if(c.stallTime>7){this.derail(c,'动力不足 / 停车');continue;}
      const length=this.course.lanes[c.lane].length;
      if(c.s>=length){
        c.s-=length;c.lane=(c.lane+1)%this.course.laneCount;c.lap++;
        c.lapTimes.push(this.elapsed-c.lastLap);c.lastLap=this.elapsed;
        if(c.lap>=this.laps){c.status='finished';c.finishTime=this.elapsed;c.v=0;this.results.push(c);this.event(`${c.car.name} · 第 ${this.results.length} 名完赛`,'finish');}
      }
      if(c.status==='running')c.frame=this.course.sample(c.lane,c.s);
    }
    // Guide channels do not permit overtaking. Cars sharing a physical channel lose speed on contact.
    for(let i=0;i<this.cars.length;i++)for(let j=i+1;j<this.cars.length;j++){
      const a=this.cars[i],b=this.cars[j];if(a.status!=='running'||b.status!=='running')continue;
      const delta=b.frame.p.clone().sub(a.frame.p),lateral=Math.abs(delta.dot(a.frame.r));
      if(lateral<.043&&delta.length()<.14&&a.frame.t.dot(b.frame.t)>.8){
        const trailing=delta.dot(a.frame.t)>0?a:b,leading=trailing===a?b:a;
        trailing.v=Math.min(trailing.v,leading.v*.97);
      }
    }
    if(this.elapsed>300){this.cars.filter(c=>c.status==='running').forEach(c=>this.derail(c,'超过比赛时限'));}
    if(this.cars.every(c=>c.status==='finished'||c.status==='dnf')){this.status='finished';this.event(this.results.length?'比赛结束':'所有赛车退赛，请调整配置','finish');}
  }
  advanceFlight(c,dt){
    if(c.airTime>=2.5)return;
    c.airTime+=dt;c.airVelocity.addScaledVector(GRAVITY,dt);c.frame.p.addScaledVector(c.airVelocity,dt);c.spin+=dt*4;
    if(c.frame.p.y<.02){c.frame.p.y=.02;c.airVelocity.multiplyScalar(.92);c.airVelocity.y=Math.abs(c.airVelocity.y)*.18;}
  }
  derail(c,reason){c.status='dnf';c.fault=reason;c.airVelocity.copy(c.frame.t).multiplyScalar(c.v);c.airVelocity.addScaledVector(c.frame.u,.25);this.event(`${c.car.name} · ${reason}`,'fault');}
  standings(){return [...this.cars].sort((a,b)=>{
    if(a.status==='finished'||b.status==='finished')return (a.finishTime??Infinity)-(b.finishTime??Infinity);
    if(a.status==='dnf'&&b.status!=='dnf')return 1;if(b.status==='dnf'&&a.status!=='dnf')return -1;
    return (b.lap+b.s/this.course.lanes[b.lane].length)-(a.lap+a.s/this.course.lanes[a.lane].length);
  });}
}
