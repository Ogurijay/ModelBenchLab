import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {coords,destinations} from '../src/world/coords.js';
import {makeKit} from '../src/world/kit.js';
import {build as terrain} from '../src/world/terrain/index.js';
import {build as landmarks} from '../src/world/landmarks/index.js';
import {build as districts} from '../src/world/districts/index.js';
import {collectNavigation,makeGroundQuery,blockedAt} from '../src/navigation.js';

// This exercises the actual world geometry, independent of canvas textures and WebGL.
const materials=new Proxy({}, {get:(map,key)=>map[key]??(map[key]=new THREE.MeshStandardMaterial())});
const ctx={THREE,coords,materials,kit:makeKit(materials)};
const scene=new THREE.Group();
const terrainRoot=terrain(ctx),districtRoot=districts(ctx);scene.add(terrainRoot,landmarks(ctx),districtRoot);
const nav=collectNavigation(scene),height=makeGroundQuery(nav.floors);
let colliderIndex=0;
scene.traverse(o=>{
 if(!o.isMesh||!o.userData.collider)return;
 const path=[];for(let p=o;p&&p!==scene;p=p.parent)if(p.name)path.unshift(p.name);
 nav.colliders[colliderIndex++].label=path.join(' / ')+` [${o.geometry.type}]`;
});
const rounded=n=>Math.round(n*100)/100;
function blockers(x,z,y){return nav.colliders.filter(c=>blockedAt(x,z,y,[c],.32)).map(c=>c.label);}
function inspectRoute(points,label){
 const failures=[];let feet=height(...points[0]);
 if(feet===null)return [{label,reason:'no starting floor',x:points[0][0],z:points[0][1]}];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.16);
  for(let j=0;j<=n;j++){
   const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n,y=height(x,z,feet+.55);
   if(y===null){failures.push({label,reason:'no reachable floor',x:rounded(x),z:rounded(z),feet:rounded(feet)});continue;}
   const obstacle=blockers(x,z,Math.max(y,feet));
   if(obstacle.length)failures.push({label,reason:'blocked',x:rounded(x),z:rounded(z),y:rounded(y),obstacle});
   if(feet-y>.6)failures.push({label,reason:'uncontrolled drop',x:rounded(x),z:rounded(z),drop:rounded(feet-y)});
   feet=y;
  }
 }
 // Keep one example per distinct reason/obstacle, so a blocked wall does not flood the report.
 return failures.filter((f,i,list)=>list.findIndex(p=>p.reason===f.reason&&JSON.stringify(p.obstacle)===JSON.stringify(f.obstacle))===i);
}
test('every furnished building admits a player with a 0.32 m radius',()=>{
 assert.ok(districtRoot.userData.interiors.length>=36);
 assert.equal(districtRoot.userData.interiors.length,coords.plots.length);
 const failures=districtRoot.userData.interiors.flatMap(d=>inspectRoute([[d.x,d.z],[d.inside.x,d.inside.z]],d.name));
 assert.deepEqual(failures,[]);
});
test('nine district destinations stand on a floor outside solid geometry',()=>{
 assert.equal(destinations.length,9);
 const failures=destinations.flatMap(d=>{
  const y=height(d.x,d.z);if(y===null)return [{destination:d.name,reason:'no floor',x:d.x,z:d.z}];
  const obstacle=blockers(d.x,d.z,y);return obstacle.length?[{destination:d.name,x:d.x,z:d.z,y,obstacle}]:[];
 });
 assert.deepEqual(failures,[]);
});
test('Heroes Valley has a continuous traversable route into the Trade District',()=>{
 assert.deepEqual(inspectRoute(terrainRoot.userData.walkRoutes.heroes,'heroes-to-trade'),[]);
});
test('Lion’s Rest has a continuous descent to the harbor',()=>{
 assert.deepEqual(inspectRoute(terrainRoot.userData.walkRoutes.harbor,'lion-to-harbor'),[]);
});
test('cathedral nave can be entered from its square and approached to the altar',()=>{
 const {x,z}=coords.cathedral;
 assert.deepEqual(inspectRoute([[x,z+39],[x,z+24],[x,z-17]],'cathedral-nave'),[]);
});
test('keep gate, courtyard and throne hall form one traversable passage',()=>{
 const {x,z}=coords.keep;
 assert.deepEqual(inspectRoute([[x,z+40],[x,z+29],[x,z+6],[x,z-20]],'keep-throne-hall'),[]);
});
// Independent A* checks connectivity rather than requiring a straight line through plazas.
// The 1 m grid is finer than the narrowest usable doorway. Edge midpoints prevent
// a graph edge from skipping a thin wall between two otherwise legal endpoints.
const cellCache=new Map();
function cell(x,z){
 const id=`${x},${z}`;if(cellCache.has(id))return cellCache.get(id);
 const y=height(x,z);const c=y!==null&&!blockedAt(x,z,y,nav.colliders,.32)?{id,x,z,y}:null;
 cellCache.set(id,c);return c;
}
function push(heap,n){heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;}
function pop(heap){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;}
function connected(start,goal){
 const origin=cell(...start),target=cell(...goal);if(!origin||!target)return {ok:false,reason:'endpoint not walkable'};
 const heap=[],best=new Map([[origin.id,0]]);push(heap,{...origin,cost:0,f:0});let visited=0;
 while(heap.length&&visited<60000){
  const a=pop(heap);if(a.cost!==best.get(a.id))continue;visited++;
  if(a.id===target.id)return {ok:true,visited,length:a.cost};
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=a.x+dx,z=a.z+dz;if(x< -260||x>185||z< -235||z>135)continue;
   const b=cell(x,z);if(!b||Math.abs(b.y-a.y)>.55)continue;
   const cost=a.cost+1;if((best.get(b.id)??Infinity)<=cost)continue;
   let clear=true;for(const t of [.25,.5,.75]){
    const xx=a.x+dx*t,zz=a.z+dz*t,yy=height(xx,zz,Math.max(a.y,b.y)+.55);
    if(yy===null||Math.abs(yy-a.y)>.55||blockedAt(xx,zz,yy,nav.colliders,.32)){clear=false;break;}
   }
   if(!clear)continue;
   best.set(b.id,cost);push(heap,{...b,cost,f:cost+Math.abs(x-target.x)+Math.abs(z-target.z)});
  }
 }
 return {ok:false,visited,reason:heap.length?'search bound reached':'disconnected floors'};
}
test('all nine district destinations connect to Trade District with legal detours',()=>{
 const failures=[];
 for(const d of destinations){const result=connected([5,15],[d.x,d.z]);if(!result.ok)failures.push({district:d.name,x:d.x,z:d.z,...result});}
 assert.deepEqual(failures,[]);
});
test('every house entrance remains reachable from the city street network',()=>{
 const failures=[];
 for(const d of districtRoot.userData.interiors){
  const result=connected([5,15],[Math.round(d.x),Math.round(d.z)]);
  if(!result.ok)failures.push({house:d.name,x:d.x,z:d.z,...result});
 }
 assert.deepEqual(failures,[]);
});
