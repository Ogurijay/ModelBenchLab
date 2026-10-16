import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as coords from '../src/world/coords.js';
import {kit,materials,batch} from '../src/world/kit.js';
import {build as ae} from '../src/world/continents/asia-europe.js';
import {build as am} from '../src/world/continents/americas.js';
import {build as ao,buildPolarLandscape} from '../src/world/continents/africa-oceania.js';
const ctx={THREE,kit,materials,coords};
const polar=buildPolarLandscape(ctx);coords.addObstacles(polar.userData.obstacles||[]);

test('all landmark modules produce finite, grounded, batchable 3D geometry',()=>{
  for(const l of coords.landmarks) {
    const build=['07','08','09','13','14','15'].includes(l.id)?ae:Number(l.id)<=6?am:ao;
    const raw=build(ctx,l);let count=0;
    raw.traverse(m=>{if(m.isMesh){count++;const p=m.geometry.attributes.position;assert.ok(p?.count>0,l.name);for(const n of p.array)assert.ok(Number.isFinite(n),l.name+' finite vertices');assert.ok(m.geometry.attributes.normal,l.name+' normals');}});
    assert.ok(count>0,l.name+' modeled geometry');
    const grouped=batch(raw),bounds=new THREE.Box3().setFromObject(grouped),size=bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y)<.12,l.name+' grounded');
    assert.ok(size.y>l.height*.45&&size.y<l.height*1.4,l.name+' height range');
    assert.ok(grouped.children.length<=count,l.name+' batching does not increase draw calls');
    grouped.traverse(m=>{if(m.isMesh){if(m.material.vertexColors){const colors=m.geometry.attributes.color;assert.ok(colors&&colors.count===m.geometry.attributes.position.count,l.name+' batching preserves landscape vertex colors');for(const v of colors.array)assert.ok(Number.isFinite(v),l.name+' finite colors');}m.geometry.dispose();}});
  }
});

test('every continent and every landmark approach is reachable from the park entrance',()=>{
  // Flood fill physical walkable space, independently of the drawn route graph.
  const step=1,cols=421,rows=321,seen=new Uint8Array(cols*rows),queue=new Int32Array(cols*rows);
  const index=(x,z)=>Math.round(z+160)*cols+Math.round(x+210),fromIndex=id=>({x:id%cols-210,z:Math.floor(id/cols)-160});
  let head=0,tail=0;const start=index(...coords.layout.entrance);queue[tail++]=start;seen[start]=1;
  while(head<tail){const id=queue[head++],{x,z}=fromIndex(id);for(const[dx,dz]of[[step,0],[-step,0],[0,step],[0,-step]]){
    const nx=x+dx,nz=z+dz;if(nx < -210||nx>210||nz < -160||nz>160)continue;
    const ni=index(nx,nz);if(!seen[ni]&&coords.walkable(nx,nz)){seen[ni]=1;queue[tail++]=ni;}
  }}
  for(const zone of coords.layout.zones) assert.ok(queue.subarray(0,tail).some(id=>{const p=fromIndex(id);return coords.inPolygon(p.x,p.z,zone.polygon);}),zone.name+' reachable');
  for(const l of coords.landmarks){const p=l.id==='09'?coords.nearestWalkable(l.x-l.width/2-5,l.z):coords.nearestWalkable(l.x,l.z+l.depth/2+4);assert.ok(seen[index(p.x,p.z)],l.name+' approach reachable');}
  assert.ok(tail>15000,'substantial explorable park surface');
});

test('walking cannot tunnel through buildings or cross unbridged water',()=>{
  const start={x:110,z:-24,y:coords.GROUND_Y+1.7};
  assert.ok(coords.walkable(start.x,start.z),'test starts in front of the building');
  const moved=coords.moveWalker(start,0,-70);
  assert.ok(coords.walkable(moved.x,moved.z),'movement remains walkable');
  assert.ok(moved.z>-32,'cannot pass through Taj Mahal');
  const waterStart=coords.nearestWalkable(-10,90),end=coords.moveWalker(waterStart,0,60);
  assert.ok(coords.walkable(end.x,end.z),'large step cannot cross water gap');
  assert.ok(end.z<115,'shoreline blocks jumping the channel');
});

test('auto-tour centerline is physically walkable along its entire length',()=>{
  const points=coords.layout.mainRoute;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);
    for(let j=0;j<=steps;j++){const t=j/steps,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;assert.ok(coords.walkable(x,z),`tour blocked near ${x.toFixed(1)},${z.toFixed(1)}`);}
  }
});

test('landmark bridges have traversable decks and ramps, mountains block entry',()=>{
  for(const id of ['02','09']){
    const l=coords.byId[id];assert.ok(coords.walkable(l.x,l.z),l.name+' center walkable');
    assert.ok(coords.groundHeight(l.x,l.z)>3.4,l.name+' deck height');
    const axis=id==='02'?'z':'x',half=(axis==='z'?l.depth:l.width)/2+6;
    for(let n=-half;n<=half;n+=.3){const x=l.x+(axis==='x'?n:0),z=l.z+(axis==='z'?n:0);assert.ok(coords.walkable(x,z),l.name+' continuous crossing');}
  }
  assert.equal(coords.walkable(135,-107),false,'cannot walk through Great Wall mountain');
});
