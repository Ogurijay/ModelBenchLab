import test from 'node:test';
import assert from 'node:assert/strict';
import {CARS,PARTS,TRACKS,VENUES,getSetup,inspectCar,defaultBuild,normalizeBuild,validateCustomCar} from '../src/data.js';
import {Track,LANE_WIDTH,WALL_HEIGHT} from '../src/track.js';
import {Race} from '../src/race.js';
const make=(o={})=>new Race({cars:CARS,playerId:'cyclone',track:TRACKS[0],venue:VENUES[0],count:8,laneCount:8,laps:1,...o});
function run(r,seconds,input={}){for(let i=0;i<Math.ceil(seconds*10)&&r.state!=='finished';i++)r.update(.1,input);return r;}
test('physical course scale, continuous lane rotation and full-cycle closure',()=>{
 assert.equal(LANE_WIDTH,.115);assert.equal(WALL_HEIGHT,.05);
 for(const def of TRACKS)for(const n of [3,5,8]){
  const t=new Track(def,n);assert.ok(t.length>=64&&t.length<=85);assert.ok(t.totalLength>t.length*n*.98);
  for(let lane=0;lane<n;lane++){
   for(let lap=0;lap<n;lap++){
    const end=t.rawPoint(lap+1-1e-7,lane),begin=t.rawPoint(lap+1+1e-7,lane);assert.ok(end.distanceTo(begin)<.001);
    assert.equal(t.laneAt(lap+.9,lane),(lane+lap+1)%n);
   }
   assert.ok(t.rawPoint(n,lane).distanceTo(t.rawPoint(0,lane))<1e-8);
   for(let i=0;i<200;i++){const p=t.pose(i/200,lane);assert.ok(p.scale>.3&&p.scale<4);assert.ok(Number.isFinite(p.curvature));}
  }
 }
});
test('rollover lane clears the other cars and wall at its crossing',()=>{
 for(const n of [3,5,8]){const t=new Track(TRACKS[0],n),q=(t.change.start+t.change.end)/2/t.length,p=t.rawPoint(q,n-1);
  for(let l=0;l<n-1;l++)assert.ok(p.y-t.rawPoint(q,l).y>WALL_HEIGHT+.07);
 }
});
test('all eight stock cars finish all three long courses and visit every lane',()=>{
 for(const track of TRACKS){const r=make({track});r.start();run(r,260);assert.equal(r.state,'finished',track.id);
  assert.equal(r.racers.length,8);assert.ok(r.racers.every(x=>x.status==='finished'&&x.completed===8&&x.finish>100&&x.bestLap>10),track.id);
  for(let i=1;i<8;i++)assert.ok(r.standings[i].finish>=r.standings[i-1].finish);
  const distances=r.racers.map(x=>x.distance);assert.ok(Math.max(...distances)-Math.min(...distances)<1.5);
 }
});
test('three/five lane races cap simultaneous entrants and run full lane cycles',()=>{
 for(const n of [3,5]){const r=make({laneCount:n,count:8,laps:2});assert.equal(r.racers.length,n);assert.equal(r.laps,n*2);r.start();run(r,200);assert.ok(r.racers.every(x=>x.status==='finished'&&x.completed===n*2));}
});
test('standard racing ignores driver throttle, steering request and boost',()=>{
 const a=make({count:1,laneCount:3}),b=make({count:1,laneCount:3});a.start();b.start();run(a,9,{});run(b,9,{throttle:false,brake:true,boost:true});
 assert.equal(a.player.progress,b.player.progress);assert.equal(a.player.speed,b.player.speed);assert.equal(b.changeLane(1),false);assert.equal(b.player.boost,false);
});
test('manual experience actually controls power and braking; pause freezes simulation',()=>{
 const r=make({count:1,laneCount:3});r.mode='manual';r.start();run(r,4);assert.equal(r.player.speed,0);run(r,1,{throttle:true});assert.ok(r.player.speed>2);
 run(r,1,{brake:true});assert.equal(r.player.speed,0);r.pause();const time=r.time,progress=r.player.progress;run(r,2,{throttle:true});assert.equal(r.time,time);assert.equal(r.player.progress,progress);r.pause();run(r,1,{throttle:true});assert.ok(r.player.progress>progress);
});
test('high RPM alone courses out; brake plus landing setup finishes the same track',()=>{
 const unsafe=make({count:1,laneCount:3,builds:{cyclone:{motor:1}}});unsafe.start();run(unsafe,80);
 assert.equal(unsafe.player.status,'dnf');assert.match(unsafe.player.reason,/跳台/);assert.equal(unsafe.player.finish,null);
 const safe=make({count:1,laneCount:3,builds:{cyclone:{motor:1,brake:2,tires:1,rollers:2,dampers:2}}});safe.start();run(safe,80);assert.equal(safe.player.status,'finished');assert.ok(safe.player.finish<40);
});
test('too much brake retires a stalled car instead of leaving a race hung',()=>{
 const r=make({count:1,laneCount:3,track:TRACKS[2],builds:{cyclone:{motor:1,brake:2,tires:1,rollers:2,dampers:2}}});r.start();run(r,90);assert.equal(r.player.status,'dnf');assert.match(r.player.reason,/失速/);assert.equal(r.state,'finished');
});
test('gear ratio, wheel diameter and mass have tradeoffs rather than universal upgrades',()=>{
 const stock=getSetup(CARS[0]),torque=getSetup(CARS[0],{gears:2}),large=getSetup(CARS[0],{tires:2}),heavy=getSetup(CARS[0],{dampers:2});
 assert.ok(torque.topSpeed<stock.topSpeed&&torque.acceleration>stock.acceleration);
 assert.ok(large.topSpeed>stock.topSpeed&&large.acceleration<stock.acceleration);
 assert.ok(heavy.mass>stock.mass&&heavy.acceleration<stock.acceleration&&heavy.bounce<stock.bounce);
 for(const c of CARS)assert.ok(inspectCar(c).legal);
});
test('fixed timestep makes equivalent frame schedules deterministic',()=>{
 const a=make({count:1,laneCount:3}),b=make({count:1,laneCount:3});a.start();b.start();
 for(let i=0;i<300;i++)a.update(.1);for(let i=0;i<600;i++)b.update(.05);
 assert.ok(Math.abs(a.time-b.time)<.00001);assert.ok(Math.abs(a.player.progress-b.player.progress)<.00001);
});
test('custom files cannot import arbitrary performance or illegal chassis',()=>{
 const c=validateCustomCar({name:'自定义测试',color:'#4273ab',shape:'devil',weight:1,gear:.1,stats:[999,999,999,999]});
 assert.equal(c.en,'CUSTOM MACHINE');assert.equal(c.gear,4);assert.equal(c.weight,CARS[7].weight);assert.ok(inspectCar(c).legal);
 assert.throws(()=>validateCustomCar({name:'x',color:'red'}));assert.throws(()=>validateCustomCar([]));
 assert.deepEqual(normalizeBuild({motor:999,brake:-1}),defaultBuild());assert.deepEqual(normalizeBuild(null),defaultBuild());assert.equal(Object.keys(PARTS).length,9);
});
