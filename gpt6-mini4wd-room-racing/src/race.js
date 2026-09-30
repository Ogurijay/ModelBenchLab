import { getStats, topSpeed } from './data.js';
import { Track } from './track.js';
export const STEP = 1/120;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

export class Race {
  constructor({cars, builds, playerId, track, venue, count=8, laps=3, seed=42}) {
    this.track = track instanceof Track ? track : new Track(track);
    this.venue=venue; this.laps=clamp(laps,1,9); this.seed=seed>>>0;
    this.state='ready'; this.time=0; this.countdown=3; this.mode='auto'; this.accumulator=0; this.events=[];
    const player=cars.find(car=>car.id===playerId)||cars[0];
    const roster=[player,...cars.filter(car=>car.id!==player.id)].slice(0,clamp(count,1,8));
    this.racers=roster.map((car,i)=>({ car, stats:getStats(car,builds[car.id]), player:i===0, lane:i%4, targetLane:i%4, progress:-.012-Math.floor(i/4)*.018, speed:0, battery:100, heat:venue.ambient, wobble:0, recover:0, cooldown:0, finish:null, bestLap:null, lapStart:0, completed:0, lastNotice:-10, boost:false }));
  }
  get player() { return this.racers[0]; }
  random() { this.seed=(Math.imul(1664525,this.seed)+1013904223)>>>0; return this.seed/4294967296; }
  start() { if (this.state==='ready') this.state='countdown'; }
  pause() { if (this.state==='running'||this.state==='countdown') { this.resumeState=this.state; this.state='paused'; } else if (this.state==='paused') this.state=this.resumeState; }
  changeLane(direction) {
    if (this.mode!=='manual'||this.state!=='running'||this.player.finish!==null) return false;
    const r=this.player, next=clamp(r.targetLane+direction,0,3);
    if (!this.track.canChange(r.progress)) return false;
    if (this.racers.some(o=>o!==r && o.finish===null && Math.abs(o.lane-next)<.6 && Math.abs(o.progress-r.progress)*this.track.length<1.6)) return false;
    r.targetLane=next; return true;
  }
  update(dt,input={}) {
    if (!['running','countdown'].includes(this.state)) { this.accumulator=0; return; }
    this.accumulator+=Math.min(.1,Math.max(0,dt));
    while (this.accumulator>=STEP) { this.step(STEP,input); this.accumulator-=STEP; }
  }
  step(dt,input={}) {
    if (this.state==='countdown') { this.countdown-=dt; if (this.countdown<=0) { this.state='running'; this.events.push({type:'start'}); } return; }
    if (this.state!=='running') return;
    this.time+=dt;
    for (const r of this.racers) {
      if (r.finish!==null) { r.speed=Math.max(0,r.speed-dt*9); continue; }
      const pose=this.track.pose(r.progress,r.lane), manual=r.player&&this.mode==='manual';
      const safe=clamp(Math.sqrt((5.8+r.stats[2]*.085)*this.venue.grip/Math.max(.065,pose.curvature)),6.4,19);
      const thermal=r.heat>85 ? .77 : 1, charge=r.battery<12 ? .72+r.battery/12*.28 : 1;
      const max=topSpeed(r.stats)*thermal*charge;
      const boosting=manual&&input.boost&&r.battery>10&&r.heat<92&&r.recover<=0;
      r.boost=boosting;
      let target=manual ? (input.throttle ? max*(boosting?1.32:1):0) : Math.min(max,safe*.99);
      if (manual&&input.brake) target=0;
      if (r.recover>0) { r.recover-=dt; target=Math.min(target,3.2); }
      if (r.cooldown>0) r.cooldown-=dt;
      if (!manual && this.track.canChange(r.progress) && r.cooldown<=0) {
        const blocker=this.racers.find(o=>o!==r&&o.finish===null&&Math.abs(o.lane-r.lane)<.6&&o.progress>r.progress&&(o.progress-r.progress)*this.track.length<3.5);
        if (blocker) {
          for (const next of [r.targetLane-1,r.targetLane+1]) {
            if(next>=0&&next<4&&!this.racers.some(o=>o!==r&&o.finish===null&&Math.abs(o.lane-next)<.7&&Math.abs(o.progress-r.progress)*this.track.length<2.5)) { r.targetLane=next; break; }
          }
        }
        r.cooldown=.8+this.random()*.4;
      }
      r.lane += clamp(r.targetLane-r.lane,-dt*2.8,dt*2.8);
      const blocker=this.racers.find(o=>o!==r&&o.finish===null&&Math.abs(o.lane-r.lane)<.55&&o.progress>r.progress&&(o.progress-r.progress)*this.track.length<1.5);
      if(blocker) target=Math.min(target,Math.max(0,blocker.speed-.5));
      const accel=(2.6+r.stats[1]*.07)*(100/(80+r.stats[3]*.15));
      r.speed+=clamp(target-r.speed,-dt*(input.brake&&manual?18:7.5),dt*accel);
      r.speed=Math.max(0,r.speed-pose.slope*dt*3.4);
      if(manual&&input.brake&&r.speed<.45)r.speed=0;
      if (r.speed>safe*1.13 && r.recover<=0) {
        r.wobble+=dt*(r.speed/safe-1)*2.6;
        if(r.wobble>.55) { r.recover=.75; r.wobble=0; if(r.player&&this.time-r.lastNotice>3){this.events.push({type:'warning',text:'过弯太快！导轮碰壁减速，入弯前试试刹车。'});r.lastNotice=this.time;} }
      } else r.wobble=Math.max(0,r.wobble-dt);
      r.heat=clamp(r.heat+dt*((r.speed/max)*3.2+(boosting?11:0)-(r.heat-this.venue.ambient)*.17),this.venue.ambient,105);
      r.battery=clamp(r.battery-dt*(r.speed>0?(.28*(85/r.stats[3])+(boosting?2.8:0)):0),0,100);
      const previous=r.progress, next=previous+r.speed*dt/pose.localLength;
      r.progress=next;
      if(previous<0&&next>=0) r.lapStart=this.time-dt+(0-previous)/(next-previous)*dt;
      const crossed=Math.floor(next);
      if(crossed>r.completed) {
        const crossingTime=this.time-dt+(crossed-previous)/(next-previous)*dt;
        const lapTime=crossingTime-r.lapStart; r.bestLap=r.bestLap===null?lapTime:Math.min(r.bestLap,lapTime); r.lapStart=crossingTime; r.completed=crossed;
        if(r.player) this.events.push({type:'lap',lap:crossed,time:lapTime});
      }
      if(next>=this.laps) { r.finish=this.time-dt+(this.laps-previous)/(next-previous)*dt; r.progress=this.laps; r.boost=false; this.events.push({type:'finish',id:r.car.id}); }
    }
    if (this.racers.every(r=>r.finish!==null)) this.state='finished';
    // A stopped manual driver cannot hold the session open forever after the field finishes.
    const firstFinish=Math.min(...this.racers.filter(r=>r.finish!==null).map(r=>r.finish));
    if(Number.isFinite(firstFinish)&&this.time-firstFinish>60) { this.state='finished'; this.events.push({type:'timeout'}); }
  }
  get standings() { return [...this.racers].sort((a,b)=>a.finish!==null&&b.finish!==null ? a.finish-b.finish : a.finish!==null ? -1 : b.finish!==null ? 1 : b.progress-a.progress); }
}
