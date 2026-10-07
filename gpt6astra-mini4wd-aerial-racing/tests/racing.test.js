import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {CARS,COURSES,standardBuild,recommendedBuild,resolveBuild} from '../src/catalog.js';
import {Course} from '../src/track.js';
import {Race,supportAcceleration} from '../src/physics.js';

const entries=(n=8,config=standardBuild())=>CARS.slice(0,n).map(car=>({car,build:{...config}}));
function run(race,seconds,dt=1/60,input={throttle:1,brake:0}){for(let i=0;i<Math.round(seconds/dt);i++)race.update(dt,input);return race;}
const aerial=new Course('aerial',8);

test('all courses are long, closed, continuous at lane changes, with finite orthonormal frames',()=>{
 for(const {id} of COURSES){
  const course=id==='aerial'?aerial:new Course(id,8);
  assert.ok(course.length>95&&course.length<130);
  for(let lane=0;lane<8;lane++){
   const data=course.lanes[lane],last=data.path.at(-1),next=course.sample((lane+1)%8,0);
   assert.ok(last.p.distanceTo(next.p)<.04,`${id} lane ${lane}: seam position`);
   assert.ok(last.t.dot(next.t)>.999,`${id} lane ${lane}: seam tangent`);
   for(let s=0;s<data.length;s+=.2){
    const f=course.sample(lane,s);
    assert.ok([...f.p,...f.q,...f.curvature].every(Number.isFinite));
    for(const axis of [f.t,f.u,f.r])assert.ok(Math.abs(axis.length()-1)<1e-5);
    assert.ok(Math.abs(f.t.dot(f.u))<.002);
    assert.ok(new Vector3(0,1,0).applyQuaternion(f.q).dot(f.u)>.9999);
   }
  }
 }
});

test('the wrap lane has a real elevated bridge and every 8 laps covers the same distance',()=>{
 const p=aerial.lanes[7].path.find(f=>f.baseS>4.9);
 assert.ok(p.p.y>.7);
 assert.equal(p.label,'机械换道桥');
 const lengths=aerial.lanes.map(l=>l.length);
 const full=lengths.reduce((a,b)=>a+b,0);
 for(let first=0;first<8;first++)assert.ok(Math.abs(Array.from({length:8},(_,i)=>lengths[(first+i)%8]).reduce((a,b)=>a+b,0)-full)<1e-9);
});

test('360 degree loops invert the contact normal and need sufficient speed to maintain support',()=>{
 assert.equal(aerial.loopCount,2);
 const top=aerial.lanes[0].path.find(f=>f.loop&&f.u.y<-.995);
 assert.ok(top);
 assert.ok(supportAcceleration(top,0)<-9.7);
 assert.ok(supportAcceleration(top,6)>0);
 assert.ok(new Vector3(0,1,0).applyQuaternion(top.q).y<-.99);
});

for(const {id} of COURSES)test(`${id}: all eight standard cars finish eight laps with real lane rotation`,()=>{
 const course=id==='aerial'?aerial:new Course(id,8),race=new Race(course,entries());race.start();run(race,200);
 assert.equal(race.status,'finished');assert.equal(race.results.length,8);
 for(const car of race.cars){
  assert.equal(car.status,'finished',`${car.id} ${car.fault}`);assert.equal(car.lap,8);
  assert.equal(car.lane,car.initialLane);assert.equal(car.lapTimes.length,8);
  assert.ok(car.finishTime>80&&car.finishTime<200);
  assert.ok(Math.abs(car.distance-course.length*8)<.04);
 }
 const order=race.standings();assert.deepEqual(order.map(c=>c.finishTime),order.map(c=>c.finishTime).sort((a,b)=>a-b));
});

test('low power loses contact and starts a gravity-driven flight, rather than staying glued to the loop',()=>{
 const race=new Race(aerial,entries(8,{...standardBuild(),motor:0}));race.start();
 for(let i=0;i<2000&&!race.cars.some(c=>c.status==='dnf');i++)race.update(1/120,{throttle:1,brake:0});
 const car=race.cars.find(c=>c.status==='dnf');assert.ok(car);assert.equal(car.fault,'环道失去支撑');
 const start=car.frame.p.clone(),vy=car.airVelocity.y;run(race,.1,1/120);
 assert.ok(car.airTime>0);assert.ok(car.frame.p.distanceTo(start)>.01);assert.ok(car.airVelocity.y<vy);
});

test('physics is deterministic across 60 Hz and 120 Hz presentation frames',()=>{
 const a=new Race(aerial,entries()),b=new Race(aerial,entries());a.start();b.start();run(a,35,1/60);run(b,35,1/120);
 assert.equal(a.elapsed,b.elapsed);
 for(let i=0;i<8;i++){assert.equal(a.cars[i].distance,b.cars[i].distance);assert.equal(a.cars[i].v,b.cars[i].v);assert.equal(a.cars[i].lane,b.cars[i].lane);}
});

test('retired cars finish falling even when the last entrant retires and race time stops',()=>{
 const race=new Race(aerial,entries(8,{...standardBuild(),motor:0}));race.start();run(race,18);
 assert.equal(race.status,'finished');assert.ok(race.cars.every(c=>c.status==='dnf'));
 const time=race.elapsed;run(race,4);assert.equal(race.elapsed,time);
 for(const c of race.cars){assert.ok(c.airTime>=2.5);assert.ok(Math.abs(c.frame.p.y-.02)<.001);}
});

test('manual control cuts power and brakes only the player car; paused simulation does not advance',()=>{
 const race=new Race(aerial,entries(),{manual:true,player:0});race.start();run(race,4,1/120,{throttle:0,brake:0});
 assert.equal(race.cars[0].v,0);assert.ok(race.cars[1].v>1);
 run(race,.7,1/120,{throttle:1,brake:0});const speed=race.cars[0].v;assert.ok(speed>1);
 run(race,.25,1/120,{throttle:0,brake:1});assert.ok(race.cars[0].v<speed);
 race.status='paused';const distance=race.cars[1].distance;run(race,5);assert.equal(race.cars[1].distance,distance);
});

test('upgrades alter force-related parameters and race configuration is snapshotted',()=>{
 const basic=resolveBuild(CARS[0],standardBuild()),stable=resolveBuild(CARS[0],recommendedBuild());
 const fast=resolveBuild(CARS[0],{...standardBuild(),motor:2,gear:2});
 assert.ok(stable.tire.grip>basic.tire.grip);assert.ok(stable.roller.drag<basic.roller.drag);assert.ok(stable.mass>basic.mass);assert.ok(fast.vFree>basic.vFree);
 const items=entries(),race=new Race(aerial,items);items[0].build.motor=0;
 assert.equal(race.cars[0].config.motor,1);assert.equal(race.cars[0].build.motor.rpm,23200);
 race.start();race.start();assert.equal(race.countdown,3);
});

test('two- and four-car layouts finish and emit the correct grid count',()=>{
 for(const count of [2,4]){
  const race=new Race(new Course('aerial',count),entries(count),{laps:1});race.start();run(race,45);
  assert.equal(race.results.length,count);assert.ok(race.events.some(e=>e.text.includes(`${count} 车同时发车`)));
 }
});
