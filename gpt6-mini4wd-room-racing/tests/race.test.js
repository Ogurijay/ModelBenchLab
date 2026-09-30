import test from 'node:test';
import assert from 'node:assert/strict';
import { CARS, PARTS, TRACKS, VENUES, defaultBuild, getStats, validateCustomCar, normalizeBuild } from '../src/data.js';
import { Track } from '../src/track.js';
import { Race, STEP } from '../src/race.js';

const makeRace=(options={})=>new Race({cars:CARS,builds:{},playerId:'cyclone',track:TRACKS[0],venue:VENUES[0],count:8,laps:1,...options});
function run(race,seconds,input={}){for(let i=0;i<Math.round(seconds/STEP);i++)race.step(STEP,input);}

test('all three circuits are continuous, finite and closed in all four lanes',()=>{
  for(const def of TRACKS){const track=new Track(def);assert.ok(track.length>60&&track.length<200);for(let lane=0;lane<4;lane++){
    assert.ok(track.point(.999999,lane).distanceTo(track.point(0,lane))<.01);
    for(let i=0;i<100;i++){const pose=track.pose(i/100,lane);assert.ok(Number.isFinite(pose.localLength)&&pose.localLength>0);assert.ok(pose.p.y>=.1);assert.ok(Number.isFinite(pose.curvature));}
  }}
});
test('eight automatic racers finish a real lap on every track and have finite standings',()=>{
  for(const track of TRACKS){const r=makeRace({track});r.start();run(r,70);assert.equal(r.state,'finished',track.id);assert.equal(r.racers.length,8);assert.ok(r.racers.every(x=>x.finish>3&&x.finish<70&&x.completed===1&&x.bestLap>0));assert.equal(new Set(r.standings.map(x=>x.car.id)).size,8);for(let i=1;i<8;i++)assert.ok(r.standings[i].finish>=r.standings[i-1].finish);}
});
test('manual input accelerates, brakes, boosts and respects pause',()=>{
  const r=makeRace();r.mode='manual';r.start();run(r,3.2);run(r,2);assert.equal(r.player.speed,0);
  run(r,1.2,{throttle:true});assert.ok(r.player.speed>5);const battery=r.player.battery,heat=r.player.heat;
  run(r,.5,{throttle:true,boost:true});assert.ok(r.player.battery<battery-.8);assert.ok(r.player.heat>heat);
  run(r,.8,{brake:true});assert.equal(r.player.speed,0);
  r.pause();const before=r.time;r.update(.1,{throttle:true});assert.equal(r.time,before);r.pause();r.update(.1,{throttle:true});assert.ok(r.time>before);
});
test('lane changes require the switch area and avoid an occupied adjacent lane',()=>{
  const r=makeRace();r.mode='manual';r.state='running';r.player.progress=.4;assert.equal(r.changeLane(1),false);
  r.player.progress=.08;r.racers.slice(1).forEach(o=>o.progress=.5);assert.equal(r.changeLane(1),true);assert.equal(r.player.targetLane,1);
  r.player.targetLane=0;r.racers[1].progress=.081;assert.equal(r.changeLane(1),false);
});
test('motor upgrade changes measured lap time, not only displayed statistics',()=>{
  const base=makeRace({count:1}),pro=makeRace({count:1,builds:{cyclone:{...defaultBuild(),motor:1}}});base.start();pro.start();run(base,60);run(pro,60);
  assert.ok(pro.player.finish<base.player.finish,`${pro.player.finish} vs ${base.player.finish}`);
});
test('lap timing survives a variable render cadence and ranking uses finish timestamps',()=>{
  const a=makeRace({laps:3}),b=makeRace({laps:3});a.start();b.start();
  for(let i=0;i<4800;i++)a.update(1/60);
  for(let i=0;i<1600;i++){b.update(.01);b.update(.04);}
  assert.equal(a.state,'finished');assert.equal(b.state,'finished');
  assert.deepEqual(a.racers.map(r=>r.finish),b.racers.map(r=>r.finish));assert.ok(a.racers.every(r=>r.completed===3&&r.bestLap>0));
});
test('bad custom data and corrupt build slots are rejected or normalized',()=>{
  assert.throws(()=>validateCustomCar({name:'bad',color:'red',stats:[82,82,82,82]}));
  assert.throws(()=>validateCustomCar({name:'bad',color:'#123456',stats:[95,95,95,95]}));
  assert.throws(()=>validateCustomCar({name:'bad',color:'#123456',stats:[NaN,82,82,82]}));
  const custom=validateCustomCar({name:'流星',color:'#e17b22',stats:[82,82,82,82],shape:'devil'});assert.equal(custom.shape,'devil');assert.equal(custom.custom,true);
  assert.deepEqual(normalizeBuild({motor:99,shell:-1,tires:'2'}),defaultBuild());
  for(const slot of Object.keys(PARTS)){const stats=getStats(CARS[0],{[slot]:2});assert.ok(stats.every(Number.isFinite));}
  // Every built-in car's exported base data must also be valid on re-import.
  for(const car of CARS)assert.deepEqual(validateCustomCar(car).stats,car.stats);
});
