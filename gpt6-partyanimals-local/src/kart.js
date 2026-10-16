import { ANIMALS, clamp, EMPTY_INPUT, rng } from './catalog.js';
import { mapLayout, kartPath } from './maps.js';
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export class KartRace {
  constructor(options={}){
    this.options={map:'coast',count:8,localPlayers:1,animal:'corgi',costume:'classic',laps:3,seed:42,...options,mode:'kart'};
    this.layout=mapLayout(this.options.map);this.map=this.layout.map;this.path=kartPath(this.map.id);this.random=rng(this.options.seed);this.phase='countdown';this.time=0;this.phaseTime=3;this.events=[];this.eventSeq=0;this.projectiles=[];this.round=1;this.scores=[];this.finishOrder=[];this.matchStats=[];
    const p=this.path[0],q=this.path[1],heading=Math.atan2(q.x-p.x,q.z-p.z);
    this.actors=Array.from({length:clamp(this.options.count,2,8)},(_,i)=>({id:i,animal:i<this.options.localPlayers?(this.options.animals?.[i]||this.options.animal):ANIMALS[(i*3+1)%ANIMALS.length].id,costume:i===0?this.options.costume:'classic',name:i<this.options.localPlayers?`玩家 ${i+1}`:ANIMALS[(i*3+1)%ANIMALS.length].name,team:i,x:p.x+(i%2-.5)*2,z:p.z-Math.floor(i/2)*1.7,y:.45,yaw:heading,vx:0,vz:0,speed:0,checkpoint:1,progress:0,lap:0,boost:0,drift:0,drifting:false,item:null,itemWait:0,shield:0,stun:0,input:EMPTY_INPUT(),lastInput:EMPTY_INPUT(),alive:true,finished:false,stats:{hits:0,kos:0,throws:0,goals:0}}));
  }
  emit(type,data={}){this.events.push({id:++this.eventSeq,type,...data});if(this.events.length>180)this.events.shift();}
  setInput(id,input){if(this.actors[id])this.actors[id].input={...EMPTY_INPUT(),...input};}
  tick(dt=1/60){
    if(this.phase==='finished')return;this.phaseTime-=dt;if(this.phase==='countdown'){if(this.phaseTime<=0){this.phase='playing';this.emit('go');}else return;}this.time+=dt;
    for(const a of this.actors){if(a.finished)continue;let i=a.input;
      if(a.id>=this.options.localPlayers){const target=this.path[a.checkpoint],err=angle(a.yaw,Math.atan2(target.x-a.x,target.z-a.z));i={...EMPTY_INPUT(),x:clamp(err*1.5,-1,1),z:-1,grab:Math.abs(err)>.4&&a.speed>11,punch:a.item&&this.random()<dt*.3};}
      a.boost=Math.max(0,a.boost-dt);a.shield=Math.max(0,a.shield-dt);a.stun=Math.max(0,a.stun-dt);a.itemWait=Math.max(0,a.itemWait-dt);
      const throttle=clamp(-i.z,-.6,1),steer=clamp(i.x,-1,1),drifting=i.grab&&a.speed>7&&Math.abs(steer)>.12;
      if(drifting){a.drift=Math.min(3,a.drift+dt);a.drifting=true;}else if(a.drifting){if(a.drift>.55){a.boost=clamp(a.drift,0,2.3);this.emit('boost',{actor:a.id});}a.drift=0;a.drifting=false;}
      a.speed=clamp(a.speed+(throttle*15-(i.run?14:0)-a.speed*.42)*dt,-5,(a.boost?30:20)*(a.stun?.32:1));
      if(a.boost)a.speed=Math.max(a.speed,25);if(a.stun)a.speed*=1-dt*2;
      a.yaw+=steer*dt*(1.35+(drifting?.5:0))*Math.min(1,Math.abs(a.speed)/4)*Math.sign(a.speed||1);
      const traction=drifting?2.4:7.5;a.vx+=(Math.sin(a.yaw)*a.speed-a.vx)*Math.min(1,dt*traction);a.vz+=(Math.cos(a.yaw)*a.speed-a.vz)*Math.min(1,dt*traction);a.x+=a.vx*dt;a.z+=a.vz*dt;
      let nearest=null,dist=Infinity;
      for(let n=0;n<this.path.length;n++){const p=this.path[n],q=this.path[(n+1)%this.path.length],dx=q.x-p.x,dz=q.z-p.z,t=clamp(((a.x-p.x)*dx+(a.z-p.z)*dz)/(dx*dx+dz*dz),0,1),x=p.x+dx*t,z=p.z+dz*t,d=Math.hypot(x-a.x,z-a.z);if(d<dist){dist=d;nearest={x,z};}}
      if(dist>3.1){a.speed*=1-dt*2.5;if(dist>4.5){a.x+=(nearest.x-a.x)*dt*4;a.z+=(nearest.z-a.z)*dt*4;}}
      const next=this.path[a.checkpoint];if(Math.hypot(a.x-next.x,a.z-next.z)<4.5){a.checkpoint=(a.checkpoint+1)%this.path.length;a.progress++;if(a.checkpoint===1){a.lap++;this.emit('lap',{actor:a.id,lap:a.lap});if(a.lap>=this.options.laps){a.finished=true;a.finishTime=this.time;this.finishOrder.push(a.id);this.emit('finish',{actor:a.id,place:this.finishOrder.length});}}}
      if(!a.item&&a.itemWait===0&&this.layout.nodes.some(n=>Math.hypot(a.x-n.x,a.z-n.z)<2.8)){a.item=['rocket','boost','banana','shield','freeze'][Math.floor(this.random()*5)];a.itemWait=5;this.emit('pickup',{actor:a.id});}
      if(i.punch&&!a.lastInput.punch&&a.item)this.useItem(a);a.lastInput={...i};
    }
    for(let x=0;x<this.actors.length;x++)for(let y=x+1;y<this.actors.length;y++){const a=this.actors[x],b=this.actors[y],d=Math.hypot(a.x-b.x,a.z-b.z);if(d<1.35&&d>.001){const push=(1.35-d)*.5,dx=(a.x-b.x)/d,dz=(a.z-b.z)/d;a.x+=dx*push;a.z+=dz*push;b.x-=dx*push;b.z-=dz*push;}}
    for(const p of this.projectiles){p.life-=dt;if(p.type==='rocket'||p.type==='freeze'){p.x+=p.vx*dt;p.z+=p.vz*dt;}for(const a of this.actors){if(a.id!==p.owner&&Math.hypot(a.x-p.x,a.z-p.z)<1.3){if(!a.shield){a.stun=p.type==='freeze'?3:1.7;a.speed*=.35;this.actors[p.owner].stats.hits++;this.emit('hit',{actor:a.id,x:a.x,y:1,z:a.z});}p.life=0;break;}}}this.projectiles=this.projectiles.filter(p=>p.life>0);
    if(this.finishOrder.length&&this.actors.slice(0,this.options.localPlayers).every(a=>a.finished)||this.time>240){this.phase='finished';this.ranking=this.rank();this.winner=this.ranking[0].id;this.matchStats=this.actors.map(a=>a.stats);this.emit('win',{team:this.winner,finished:true});}
  }
  useItem(a){
    const type=a.item;a.item=null;if(type==='boost')a.boost=3;else if(type==='shield')a.shield=7;else{const back=type==='banana'?-1:1;this.projectiles.push({type,owner:a.id,x:a.x+Math.sin(a.yaw)*2*back,y:.6,z:a.z+Math.cos(a.yaw)*2*back,vx:Math.sin(a.yaw)*35,vz:Math.cos(a.yaw)*35,life:type==='banana'?20:3});}this.emit('shoot',{actor:a.id,kind:type});
  }
  rank(){return [...this.actors].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress||Math.hypot(a.x-this.path[a.checkpoint].x,a.z-this.path[a.checkpoint].z)-Math.hypot(b.x-this.path[b.checkpoint].x,b.z-this.path[b.checkpoint].z));}
  snapshot(){return{mode:'kart',map:this.map.id,phase:this.phase,time:this.time,winner:this.winner,actors:this.actors.map(a=>({id:a.id,position:{x:a.x,y:a.y,z:a.z},speed:a.speed,lap:a.lap,checkpoint:a.checkpoint,progress:a.progress,item:a.item,drift:a.drift,finished:a.finished})),ranking:this.rank().map(a=>a.id)};}
  dispose(){}
}
