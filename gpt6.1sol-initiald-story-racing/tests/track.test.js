import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrack,ROAD_HALF,RAIL_OFFSET,RAIL_HALF_WIDTH,SHOULDER_EDGE } from '../src/track.js';
import { createCourseData } from '../src/course-data.js';
import { createMinimap } from '../src/minimap.js';
import { VEHICLE_PROFILES } from '../src/vehicle-profiles.js';
import { STEP,createVehicle,stepVehicle,createOpponent,stepOpponent } from '../src/physics.js';

const ids=['downhill','uphill','rain','highway'];
const gas={throttle:true,steer:0,brake:false,handbrake:false};
function bruteNearest(track,x,z){
  let best=Infinity,s=0;
  for(let i=0;i<track.samples.length-1;i++){
    const a=track.samples[i],b=track.samples[i+1],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    const distance=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
    if(distance<best){best=distance;s=a.s+t*(b.s-a.s);}
  }
  return {distance:best,s};
}
test('non-adjacent switchbacks leave room for both road shoulders',()=>{
  for(const id of ids){
    const track=createTrack(id),a=track.samples.filter((_,i)=>i%4===0);let minimum=Infinity;
    for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)if(a[j].s-a[i].s>55)minimum=Math.min(minimum,Math.hypot(a[j].x-a[i].x,a[j].z-a[i].z));
    assert.ok(minimum>SHOULDER_EDGE*2+20,`${id}: ${minimum}m between separate road sections`);
    assert.ok(track.samples.every(p=>Math.abs(p.k)*SHOULDER_EDGE<.7),'inner shoulder must not fold across itself');
  }
});
test('road height, distance and tangent remain continuous at sample seams and finish',()=>{
  for(const id of ids){
    const t=createTrack(id);assert.ok(t.surfaceLength-t.length>=159.9,'finish needs a safe runoff');
    for(let i=1;i<t.samples.length-1;i+=3){
      const p=t.samples[i],a=t.at(p.s-.001),b=t.at(p.s+.001);
      assert.ok(Math.hypot(b.x-a.x,b.z-a.z)<.0021);assert.ok(Math.abs(b.y-a.y)<.0001);
      assert.ok(Math.hypot(b.tx-a.tx,b.tz-a.tz)<.001);assert.ok(Math.abs(b.s-a.s-.002)<1e-9);
      assert.ok(Math.abs(Math.hypot(a.tx,a.tz)-1)<1e-12);
    }
    assert.equal(t.at(-10).s,0);assert.equal(t.at(t.surfaceLength+10).s,t.surfaceLength);
    assert.ok(t.at(t.length+80).z>t.at(t.length).z+79.9);
  }
});
test('indexed nearest road query agrees with an independent full segment search',()=>{
  let seed=731;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(const id of ids){
    const track=createTrack(id);
    for(let n=0;n<120;n++){
      const x=-500+random()*1250,z=-250+random()*(track.bounds.maxZ+650),actual=track.nearest(x,z),expected=bruteNearest(track,x,z);
      assert.ok(Math.abs(actual.distance-expected.distance)<1e-8);assert.ok(Math.abs(actual.s-expected.s)<1e-7);
    }
  }
});
test('hinted progress follows the current road instead of jumping to another switchback',()=>{
  const t=createTrack();
  for(let s=1;s<t.length-1;s+=.37){
    const p=t.at(s),q=t.nearest(p.x+p.tz*6.8,p.z-p.tx*6.8,p.index);
    assert.ok(Math.abs(q.s-s)<.3,`progress jumped at ${s}`);assert.ok(Math.abs(q.y-p.y)<.012);
  }
});
test('all road surfaces sit above terrain; scenery footprints clear every road branch',()=>{
  for(const id of ids){
    const t=createTrack(id),data=createCourseData(t);assert.equal(data.trees.length,740);assert.equal(createCourseData(t),data);
    for(const p of t.samples)for(const offset of [-ROAD_HALF,0,ROAD_HALF]){
      const y=data.terrain.heightAt(p.x+p.tz*offset,p.z-p.tx*offset);assert.ok(p.y-y>.25,`${id}: terrain pierces road at ${p.s}`);
    }
    for(const tree of data.trees){assert.ok(bruteNearest(t,tree.x,tree.z).distance-tree.radius>SHOULDER_EDGE+2.9);assert.equal(tree.y,data.terrain.heightAt(tree.x,tree.z));}
    for(const mountain of data.mountains)assert.ok(bruteNearest(t,mountain.x,mountain.z).distance-mountain.radius>ROAD_HALF+30);
  }
});
test('rail collision starts at the vehicle footprint, including a sideways slide',()=>{
  const t=createTrack(),s=60;
  const clear=createVehicle(t,'ae86',s,6.4);clear.speed=30;clear.vz=30;stepVehicle(clear,gas,t);
  assert.equal(clear.collisions,0,'old invisible wall at offset 6.1 must be gone');
  for(const id of Object.keys(VEHICLE_PROFILES))for(const heading of [0,.3,-.3,.65,-.65,Math.PI/2])for(const s of [60,350,640,940,1220,1600]){
    const p=t.at(s),v=createVehicle(t,id,s,7.6);v.yaw+=heading;v.vx=Math.sin(v.yaw)*20;v.vz=Math.cos(v.yaw)*20;v.speed=20;
    stepVehicle(v,gas,t);assert.equal(v.collisions,1);
    const profile=VEHICLE_PROFILES[id];
    for(const x of [-profile.width/2,profile.width/2])for(const z of [-profile.length/2,profile.length/2]){
      const wx=v.x+x*Math.cos(v.yaw)+z*Math.sin(v.yaw),wz=v.z-x*Math.sin(v.yaw)+z*Math.cos(v.yaw);
      assert.ok(bruteNearest(t,wx,wz).distance<RAIL_OFFSET-RAIL_HALF_WIDTH+.04,`${id} chassis clips the rail at ${s}m / ${heading}`);
    }
  }
});
test('continued rail contact preserves forward motion instead of applying impact loss every tick',()=>{
  const t=createTrack(),v=createVehicle(t,'ae86',50,7.1);v.vz=30;v.speed=30;stepVehicle(v,gas,t);
  const afterImpact=v.speed,start=v.s;
  for(let n=0;n<24;n++){
    const p=t.at(v.s);v.x=p.x+p.tz*7.1;v.z=p.z-p.tx*7.1;stepVehicle(v,gas,t);
  }
  assert.equal(v.collisions,1);assert.ok(v.speed>afterImpact*.75);assert.ok(v.s-start>3);
});
test('full assisted lap has finite state and no progress or height teleports',()=>{
  for(const id of ids){
    const t=createTrack(id),v=createVehicle(t);let ticks=0;
    while(v.s<t.length-3&&ticks++<240/STEP){
      const s=v.s,y=v.y;stepVehicle(v,gas,t,STEP,{assist:true,cup:true});
      assert.ok(Number.isFinite(v.x+v.y+v.z+v.yaw+v.speed));assert.ok(Math.abs(v.s-s)<.8);assert.ok(Math.abs(v.y-y)<.05);
    }
    assert.ok(v.s>=t.length-3,`${id}: car stuck at ${v.s}`);
  }
});
test('all AI car footprints remain inside rails on a complete lap',()=>{
  const t=createTrack();
  for(const id of Object.keys(VEHICLE_PROFILES)){
    const o=createOpponent(t,id,3,3);let ticks=0;
    while(o.s<t.length&&ticks++<240/STEP){
      stepOpponent(o,t,STEP,ticks*STEP);const profile=VEHICLE_PROFILES[id],p=t.at(o.s);
      assert.ok(Math.abs(o.offset)+profile.width/2+Math.abs(p.k)*(profile.length/2)**2*.5<RAIL_OFFSET-RAIL_HALF_WIDTH);
    }
    assert.ok(o.finishedAt!==null);
  }
});
test('minimap keeps equal scale, driver left/right, heading and the actual finish',()=>{
  for(const id of ids){
    const t=createTrack(id),m=createMinimap(t),p=m.project({x:20,z:30}),right=m.project({x:19,z:30}),forward=m.project({x:20,z:31});
    assert.ok(right.x>p.x&&forward.y<p.y);assert.ok(Math.abs(right.x-p.x-(p.y-forward.y))<1e-12);
    assert.deepEqual(m.finish,m.project(t.at(t.length)));assert.ok(m.project(t.at(t.surfaceLength)).y<m.finish.y);
    assert.ok(m.route.endsWith(`${m.finish.x.toFixed(2)} ${m.finish.y.toFixed(2)}`));
  }
});
