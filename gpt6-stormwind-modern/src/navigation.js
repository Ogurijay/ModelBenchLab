import * as THREE from 'three';
export function collectNavigation(root){
 root.updateMatrixWorld(true);const floors=[],colliders=[];const interiors=[];
 root.traverse(o=>{if(o.userData.interiors)interiors.push(...o.userData.interiors);if(!o.isMesh)return;if(o.userData.walkable)floors.push(o);
  if(o.userData.collider){o.geometry.computeBoundingBox();colliders.push({local:o.geometry.boundingBox.clone(),inverse:o.matrixWorld.clone().invert(),world:new THREE.Box3().setFromObject(o)});}
 });return {floors,colliders,interiors};
}
const p=new THREE.Vector3();
export function blockedAt(x,z,feet,colliders,radius=.32){
 for(const c of colliders){const b=c.world;if(x+radius<b.min.x||x-radius>b.max.x||z+radius<b.min.z||z-radius>b.max.z||feet+1.65<b.min.y||feet+.25>b.max.y)continue;
  p.set(x,feet+.9,z).applyMatrix4(c.inverse);const l=c.local;
  const scaleX=Math.hypot(c.inverse.elements[0],c.inverse.elements[1],c.inverse.elements[2]);
  const scaleZ=Math.hypot(c.inverse.elements[8],c.inverse.elements[9],c.inverse.elements[10]);
  if(p.x+radius*scaleX>l.min.x&&p.x-radius*scaleX<l.max.x&&p.z+radius*scaleZ>l.min.z&&p.z-radius*scaleZ<l.max.z)return true;
 }return false;
}
export function makeGroundQuery(floors){const ray=new THREE.Raycaster();ray.ray.direction.set(0,-1,0);return (x,z,ceiling=200)=>{ray.ray.origin.set(x,ceiling,z);ray.far=ceiling+10;const hits=ray.intersectObjects(floors,false);return hits.length?hits[0].point.y:null;};}
export function makeWalker(camera,canvas,nav,onLock){
 const query=makeGroundQuery(nav.floors),keys=new Set();let enabled=false,yaw=0,pitch=0,feet=8,vy=0,onGround=true,drag=false;
 const euler=new THREE.Euler(0,0,0,'YXZ');
 const reset=()=>{keys.clear();drag=false;};addEventListener('blur',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)&&enabled)e.preventDefault();keys.add(e.code);if(e.code==='Space'&&enabled&&onGround){vy=7;onGround=false;}});
 addEventListener('keyup',e=>keys.delete(e.code));
 canvas.addEventListener('click',()=>{if(enabled)canvas.requestPointerLock?.()?.catch(()=>{});});
 canvas.addEventListener('pointerdown',()=>{if(enabled)drag=true;});addEventListener('pointerup',()=>drag=false);
 document.addEventListener('pointerlockchange',()=>{reset();onLock?.(document.pointerLockElement===canvas);});
 addEventListener('mousemove',e=>{if(!enabled||(!drag&&document.pointerLockElement!==canvas))return;yaw-=e.movementX*.0022;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.35,1.35);});
 function place(x,z,target){feet=query(x,z)??8;camera.position.set(x,feet+1.75,z);if(target){camera.lookAt(...target);euler.setFromQuaternion(camera.quaternion,'YXZ');yaw=euler.y;pitch=euler.x;}vy=0;onGround=true;}
 return {query,get feet(){return feet;},get enabled(){return enabled;},get locked(){return document.pointerLockElement===canvas;},place,
  enable(value){enabled=value;reset();if(!value)document.exitPointerLock?.();else{euler.setFromQuaternion(camera.quaternion,'YXZ');yaw=euler.y;pitch=euler.x;feet=camera.position.y-1.75;}},
  update(dt){if(!enabled)return;const f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),s=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
   const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?13:6.3)*dt/Math.max(1,Math.hypot(f,s));let dx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed;
   const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.16));dx/=steps;dz/=steps;
   for(let i=0;i<steps;i++){for(const axis of ['x','z']){const x=camera.position.x+(axis==='x'?dx:0),z=camera.position.z+(axis==='z'?dz:0);const h=query(x,z,feet+.55);if(h!==null&&!blockedAt(x,z,Math.max(feet,h),nav.colliders))camera.position[axis]=axis==='x'?x:z;}}
   const h=query(camera.position.x,camera.position.z,feet+.6);vy-=24*dt;feet+=vy*dt;if(h!==null&&feet<=h){feet=h;vy=0;onGround=true;}camera.position.y=feet+1.75;camera.quaternion.setFromEuler(euler.set(pitch,yaw,0,'YXZ'));
  }
 };
}
