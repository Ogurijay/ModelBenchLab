import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrack } from '../src/track.js';
import { CARS,CHAPTERS } from '../src/data.js';
import { STEP,createVehicle,stepVehicle,createOpponent,stepOpponent,makeSave,completeChapter,wulingBoost,resultFor } from '../src/physics.js';
import { interpolateVehicle } from '../src/motion.js';
const flat={id:'flat',grip:1,slope:0,gutterZones:[],length:10000,straightStart:8000,at:s=>({x:0,z:s,y:0,tx:0,tz:1,s,index:0,k:0}),nearest:(x,z)=>({x:0,y:0,z,px:x,pz:z,tx:0,tz:1,s:z,index:0,k:0,offset:0})};
const gas={throttle:true,steer:0,brake:false,handbrake:false};
function run(v,seconds,i=gas,options={}){for(let n=0;n<Math.round(seconds/STEP);n++)stepVehicle(v,i,flat,STEP,options);return v;}
test('right and left steering follow the driver frame, including a rotated road',()=>{
  for(const heading of [0,Math.PI/2,-Math.PI*.8]){
    const t={...flat,at:s=>({...flat.at(s),tx:Math.sin(heading),tz:Math.cos(heading),x:Math.sin(heading)*s,z:Math.cos(heading)*s})};
    for(const steer of [-1,1]){
      const v=createVehicle(t);v.speed=20;v.vx=Math.sin(heading)*20;v.vz=Math.cos(heading)*20;const x=v.x,z=v.z;
      for(let n=0;n<36;n++)stepVehicle(v,{...gas,steer},t);
      const rightDisplacement=-(v.x-x)*Math.cos(heading)+(v.z-z)*Math.sin(heading);
      assert.ok(rightDisplacement*steer>.2,'movement must follow the pressed direction');
    }
  }
});
test('assist yields during a slide and does not seize steering on handbrake release',()=>{
  const v=createVehicle(flat);run(v,3,gas,{assist:true});run(v,.6,{...gas,steer:1,handbrake:true},{assist:true});
  assert.ok(v.driftIntensity>.4);assert.ok(v.assistWeight<.01);
  const before=v.steering;stepVehicle(v,gas,flat,STEP,{assist:true});assert.ok(Math.abs(v.steering-before)<.1);assert.ok(v.assistDelay>.2);
  run(v,.16,{...gas,steer:-.7},{assist:true});assert.ok(v.steering<-.5,'countersteering must respond within 160ms');
});
test('holding a drift remains bounded and releasing it recovers without an angle snap',()=>{
  const v=createVehicle(flat);run(v,3);run(v,3,{...gas,steer:1,handbrake:true});assert.ok(Math.abs(v.angle)>.3&&Math.abs(v.angle)<.9);
  const before=v.angle;stepVehicle(v,gas,flat);assert.ok(Math.abs(v.angle-before)<.02);run(v,2,gas);assert.ok(Math.abs(v.angle)<.05);
});
test('render interpolation crosses the angle seam by the short route without changing physics',()=>{
  const a=createVehicle(flat),b={...a,x:2,yaw:-Math.PI+.02,angle:-Math.PI+.01};a.yaw=Math.PI-.02;a.angle=Math.PI-.01;
  const pose=interpolateVehicle(a,b,.5);assert.equal(pose.x,1);assert.ok(Math.abs(pose.yaw)>3.13);assert.ok(Math.abs(pose.angle)>3.13);
  assert.equal(a.x,0);assert.equal(b.x,2);
});
test('handbrake decouples heading from velocity and release restores grip gradually',()=>{
  const v=createVehicle(flat);run(v,4);run(v,.7,{...gas,steer:.7,handbrake:true});assert.ok(Math.abs(v.angle)>.18);assert.ok(v.grip<.2);
  const low=v.grip;run(v,.2,{...gas,steer:-.4});assert.ok(v.grip>low&&v.grip<.7);run(v,2,gas);assert.ok(v.grip>.98);assert.ok(Math.abs(v.angle)<.05);
});
test('fixed input replay matches at 30, 60 and 120 rendering frames',()=>{
  const replay=fps=>{const v=createVehicle(flat);let accumulator=0,ticks=0;for(let frame=0;frame<fps*12;frame++){accumulator+=1/fps;while(accumulator+1e-10>=STEP){const time=ticks*STEP;stepVehicle(v,{...gas,steer:time>4&&time<6?.45:time>=6&&time<7?-.4:0,handbrake:time>4&&time<5},flat);ticks++;accumulator-=STEP;}}return {v,ticks};};
  const a=replay(30);for(const fps of [60,120]){const b=replay(fps);assert.equal(a.ticks,b.ticks);for(const key of ['x','z','vx','vz','yaw','water','score'])assert.ok(Math.abs(a.v[key]-b.v[key])<1e-8,key);}
});
test('water stays still on steady straight driving and spills on hard brake / lateral acceleration',()=>{
  const initial=createVehicle(flat);run(initial,4);const calm=structuredClone(initial),rough=structuredClone(initial),brake=structuredClone(initial);
  run(calm,2,gas,{cup:true});run(rough,2,{...gas,steer:.7},{cup:true});run(brake,1,{...gas,throttle:false,brake:true},{cup:true});assert.ok(calm.water>99.9);assert.ok(rough.water<calm.water);assert.ok(brake.water<calm.water);
});
test('water zero is a real failure, not a finish reward',()=>{const r={config:{cup:true,mode:'tofu'},player:{s:100,water:0},opponents:[],elapsed:5};assert.equal(resultFor(r,flat),'spill');});
test('a scripted loss is not triggered at the starting line',()=>{const r={config:{forced:'ae85',mode:'duel'},player:{s:1,water:100},opponents:[],elapsed:1};assert.equal(resultFor(r,flat),null);r.player.s=flat.length;assert.equal(resultFor(r,flat),'scripted-loss');});
test('ordinary duels compare finish times instead of automatically declaring victory',()=>{const r={config:{mode:'duel'},player:{s:flat.length,water:100},opponents:[{finishedAt:30,s:flat.length}],elapsed:40};assert.equal(resultFor(r,flat),'lose');r.opponents[0].finishedAt=null;assert.equal(resultFor(r,flat),'win');});
test('chase uses explicit overtake and separation thresholds',()=>{const r={config:{mode:'chase'},player:{s:120,water:100},opponents:[{s:150,finishedAt:null}],elapsed:12};assert.equal(resultFor(r,flat),null);r.player.s=156;assert.equal(resultFor(r,flat),'win');r.player.s=30;assert.equal(resultFor(r,flat),'lose');});
test('gutter is locked and restricted to inner wheel of designated bends',()=>{
  const track=createTrack(),zone=track.gutterZones.find(z=>z.end-z.start>3),s=(zone.start+zone.end)/2;
  const prepare=offset=>{const v=createVehicle(track,'ae86',s,offset);v.vx=track.at(s).tx*25;v.vz=track.at(s).tz*25;v.speed=25;return v;};
  const v=prepare(zone.side*5.1);stepVehicle(v,gas,track,STEP,{gutter:true});assert.equal(v.gutter,true);
  const locked=prepare(zone.side*5.1);stepVehicle(locked,gas,track,STEP,{gutter:false});assert.equal(locked.gutter,false);
  const outside=prepare(-zone.side*5.1);stepVehicle(outside,gas,track,STEP,{gutter:true});assert.equal(outside.gutter,false);
});
test('story Benz follows fixed sector speeds and is independent of player inputs',()=>{
  const track=createTrack('highway'),a=createOpponent(track,'benz',25),b=createOpponent(track,'benz',25);
  const v=createVehicle(track);for(let n=0;n<600;n++){stepVehicle(v,{...gas,steer:n%4?0:1},track);stepOpponent(a,track,STEP,n*STEP,{finalBoss:true});stepOpponent(b,track,STEP,n*STEP,{finalBoss:true});}assert.deepEqual(a,b);assert.equal(a.speed,20);
  a.s=track.straightStart+1;stepOpponent(a,track,STEP,10,{finalBoss:true});assert.equal(a.speed,80);assert.ok(a.speed>CARS[0].max);
});
test('freeplay Benz can be slower in bends than the 86 and has no forced outcome',()=>{const track=createTrack(),o=createOpponent(track,'benz',300);stepOpponent(o,track,1,10);assert.ok(o.speed<30);const r={config:{mode:'duel'},player:{s:track.length,water:100},opponents:[o],elapsed:50};assert.equal(resultFor(r,track),'win');});
test('Wuling boost scales with opponent strength and is greatest against Benz',()=>{assert.equal(wulingBoost('ae85'),1);assert.ok(wulingBoost('benz')>wulingBoost('gtr'));assert.ok(wulingBoost('benz')<=1.5);});
test('chapter completion unlocks cars even for the two authored defeats; progression is idempotent',()=>{const s=makeSave();assert.equal(s.unlocked.length,3);completeChapter(s,9);completeChapter(s,12);completeChapter(s,12);assert.ok(s.unlocked.includes('evo3'));assert.ok(s.unlocked.includes('benz'));assert.equal(s.completed.filter(id=>id===12).length,1);assert.equal(s.next,13);assert.equal(CHAPTERS.length,14);});
test('rain reduces grip and uphill reduces acceleration',()=>{const a=createVehicle(flat),b=createVehicle(flat);run(a,4);run(b,4);for(let n=0;n<100;n++){stepVehicle(a,{...gas,steer:.7},{...flat,grip:1});stepVehicle(b,{...gas,steer:.7},{...flat,grip:.64});}assert.ok(Math.abs(b.angle)>Math.abs(a.angle));const up=createVehicle(flat),down=createVehicle(flat);for(let n=0;n<500;n++){stepVehicle(up,gas,{...flat,slope:-1});stepVehicle(down,gas,{...flat,slope:1});}assert.ok(down.speed>up.speed);});
test('Wuling charm can save collision speed on any car and uses deterministic 1-percent chance',()=>{
  const t=createTrack(),normal=createVehicle(t,'ae86',80,6.9),lucky=structuredClone(normal);
  let seed=0;while(((seed*1664525+1013904223)>>>0)/4294967296>=.01)seed++;
  lucky.luckSeed=seed;normal.vz=lucky.vz=30;normal.speed=lucky.speed=30;
  stepVehicle(normal,gas,t,STEP,{charm:false});stepVehicle(lucky,gas,t,STEP,{charm:true});assert.equal(normal.luckSaves,0);assert.equal(lucky.luckSaves,1);assert.ok(lucky.speed>normal.speed+8);
});
