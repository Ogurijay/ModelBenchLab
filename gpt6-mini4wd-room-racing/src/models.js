import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARTS, normalizeBuild } from './data.js';

export function material(color, roughness=.55, metalness=0) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
export function box(parent,w,h,d,x,y,z,mat) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
export function cylinder(parent,r,h,x,y,z,mat,segments=16) {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat);
  mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
export function plate(parent,outline,depth,y,mat,bevel=.025) {
  const shape=new THREE.Shape(); outline.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z)); shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSegments:1,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:1});
  geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry,mat); mesh.position.y=y; mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
export function labelTexture(text,background='#202a2b',color='#f1ede0',width=512,height=128) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  ctx.fillStyle=color;ctx.font=`900 ${height*.51}px 'Bahnschrift','Microsoft YaHei',sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height*.54,width*.92);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}
export function sign(parent,text,w,h,x,y,z,bg,fg) {
  const mat=new THREE.MeshBasicMaterial({map:labelTexture(text,bg,fg),side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
export function disposeObject(group) {
  const geometries=new Set(), materials=new Set(), textures=new Set();
  group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{materials.add(m);if(m.map)textures.add(m.map);});});
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();
}

// Preserve movable part groups while batching their static meshes by appearance.
export function batchStatic(group,slot) {
  group.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4().copy(group.matrixWorld).invert(),batches=new Map(),old=[];
  group.traverse(mesh=>{
    if(!mesh.isMesh||Array.isArray(mesh.material))return;
    const m=mesh.material,key=[m.type,m.color?.getHex(),m.roughness,m.metalness,m.map?.uuid,m.side,m.transparent,m.opacity,Object.keys(mesh.geometry.attributes).sort().join(',')].join('|');
    let b=batches.get(key);if(!b){b={material:m,geometries:[],cast:false,receive:false};batches.set(key,b);}
    const copy=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    copy.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));b.geometries.push(copy);b.cast||=mesh.castShadow;b.receive||=mesh.receiveShadow;old.push(mesh);
  });
  old.forEach(mesh=>{mesh.removeFromParent();mesh.geometry.dispose();});
  for(const b of batches.values()){
    const geometry=mergeGeometries(b.geometries);b.geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,b.material);mesh.castShadow=b.cast;mesh.receiveShadow=b.receive;mesh.userData.slot=slot;group.add(mesh);
  }
}

export function createCar(car,rawBuild={}) {
  const build=normalizeBuild(rawBuild), root=new THREE.Group(), parts={}, wheels=[];
  root.name=car.id;
  for(const slot of Object.keys(PARTS)) { const g=new THREE.Group();g.name=slot;g.userData.slot=slot;root.add(g);parts[slot]=g; }
  const dark=material('#222a30',.55,.15), metal=material('#bbc3c4',.3,.72), white=material(car.trim,.28,.08), paint=material(car.color,.25,.22), accent=material(car.accent,.28,.28), glass=material('#173746',.14,.45);
  const chassis=material(PARTS.chassis.options[build.chassis].color,.55,.35), tire=material(PARTS.tires.options[build.tires].color,.95);
  const silhouette={
    magnum:[[-.52,-1.2],[-.76,-.8],[-.6,-.15],[-.81,.58],[-.58,1.23],[-.21,1.46],[.21,1.46],[.58,1.23],[.81,.58],[.6,-.15],[.76,-.8],[.52,-1.2]],
    sonic:[[-.57,-1.2],[-.83,-.85],[-.73,.9],[-.3,1.47],[0,1.1],[.3,1.47],[.73,.9],[.83,-.85],[.57,-1.2]],
    dagger:[[-.62,-1.23],[-.82,-.75],[-.55,.7],[-.22,1.49],[0,.95],[.22,1.49],[.55,.7],[.82,-.75],[.62,-1.23]],
    evo:[[-.57,-1.2],[-.75,-.65],[-.7,.84],[0,1.49],[.7,.84],[.75,-.65],[.57,-1.2]],
    cobra:[[-.5,-1.25],[-.76,-.64],[-.62,.88],[-.23,1.49],[.23,1.49],[.62,.88],[.76,-.64],[.5,-1.25]],
    spider:[[-.64,-1.2],[-.91,-.52],[-.45,-.08],[-.9,.68],[-.31,1.4],[0,.92],[.31,1.4],[.9,.68],[.45,-.08],[.91,-.52],[.64,-1.2]],
    giant:[[-.72,-1.15],[-.86,-.65],[-.86,1.18],[-.65,1.43],[.65,1.43],[.86,1.18],[.86,-.65],[.72,-1.15]],
    devil:[[-.65,-1.2],[-.8,-.65],[-.62,1.4],[-.32,1.52],[-.26,.7],[.26,.7],[.32,1.52],[.62,1.4],[.8,-.65],[.65,-1.2]],
  }[car.shape];
  plate(parts.chassis,[[-.53,-1.36],[-.66,-.8],[-.52,1.36],[.52,1.36],[.66,-.8],[.53,-1.36]],.14,.24,chassis);
  box(parts.chassis,.2,.06,2.35,0,.42,0,metal);
  for(const z of [-.84,.86]) { const axle=cylinder(parts.chassis,.045,1.78,0,.32,z,metal,10);axle.rotation.z=Math.PI/2; }
  for(const side of [-1,1]) for(const z of [-.84,.86]) {
    const wheel=new THREE.Group();wheel.position.set(side*.77,.33,z);wheel.userData.side=side;parts.tires.add(wheel);wheels.push(wheel);
    const tireMesh=cylinder(wheel,car.shape==='giant'?.38:.32,.29,0,0,0,tire,20);tireMesh.rotation.z=Math.PI/2;
    const hub=cylinder(wheel,.22,.301,0,0,0,build.tires===2?white:accent,12);hub.rotation.z=Math.PI/2;
    const cap=cylinder(wheel,.08,.32,0,0,0,metal,12);cap.rotation.z=Math.PI/2;
    for(let j=0;j<3;j++) { const spoke=box(wheel,.325,.047,.4,0,0,0,paint);spoke.rotation.x=j*Math.PI/3; }
  }
  const rollerMat=material(PARTS.rollers.options[build.rollers].color,.25,.7);
  for(const z of [-1.35,1.35]) {
    box(parts.rollers,2.02,.07,.17,0,.23,z,dark);
    for(const x of [-.96,.96]) {
      cylinder(parts.rollers,.17,.1,x,.3,z,rollerMat);
      cylinder(parts.rollers,.055,.14,x,.36,z,metal);
      if(build.rollers===2)cylinder(parts.rollers,.14,.07,x,.47,z,rollerMat);
    }
  }
  const motorMat=material(PARTS.motor.options[build.motor].color,.3,.65);
  const motor=cylinder(parts.motor,.2,.66,0,.57,-.8,motorMat,20);motor.rotation.z=Math.PI/2;
  for(const x of [-.35,.35]) {const cap=cylinder(parts.motor,.19,.075,x,.57,-.8,dark);cap.rotation.z=Math.PI/2;}
  for(const x of [-.21,.21]) {
    const cell=cylinder(parts.battery,.17,1.04,x,.55,.1,material(PARTS.battery.options[build.battery].color,.32,.22));cell.rotation.x=Math.PI/2;
    const tip=cylinder(parts.battery,.14,.08,x,.55,.65,metal);tip.rotation.x=Math.PI/2;
    const stripe=box(parts.battery,.35,.02,.2,x,.718,.03,white);
  }
  plate(parts.shell,silhouette,car.shape==='giant'?.23:.115,.66,car.shape==='magnum'||car.shape==='sonic'?white:paint,.045);
  // Raised, tapered cowling, rear wing, wheel pods and graphics create distinct silhouettes.
  plate(parts.shell,[[-.3,-.61],[-.37,.25],[-.17,1.32],[.17,1.32],[.37,.25],[.3,-.61]],.19,.79,paint,.04);
  const canopy=box(parts.shell,.47,.2,.66,0,1,-.16,glass);canopy.rotation.x=.13;
  for(const side of [-1,1]) {
    plate(parts.shell,[[side*.43,-.64],[side*.73,-.62],[side*.61,.74],[side*.4,1.03]],.08,.82,paint);
    const stripe=box(parts.shell,.06,.035,.75,side*.51,.92,.49,accent);stripe.rotation.y=side*.18;
    box(parts.shell,.12,.25,.16,side*.5,.96,-1.05,dark);
    for(let j=0;j<3;j++)box(parts.shell,.15,.021,.04,side*.44,.966,-.38-j*.11,dark);
  }
  let wing=box(parts.shell,car.shape==='sonic'?1.96:1.8,.12,.38,0,1.13,-1.13,paint);
  wing.rotation.x=-.12;
  for(const x of [-.9,.9])box(parts.shell,.055,.28,.4,x,1.17,-1.13,accent);
  plate(parts.shell,[[-.2,.82],[0,1.29],[.2,.82],[0,1.04]],.02,1.009,accent,0);
  const decal=sign(parts.shell,car.number,.31,.25,0,.998,.48,car.color,'#ffffff');decal.rotation.x=-Math.PI/2;
  if(car.shape==='giant') {
    box(parts.shell,1.8,.3,.44,0,.94,1.1,paint);
    for(const x of [-.56,.56])box(parts.shell,.22,.16,.07,x,1.02,1.35,accent);
  }
  if(car.shape==='cobra') {
    plate(parts.shell,[[-.06,-1],[-.2,.3],[0,1.34],[.2,.3],[.06,-1]],.08,1.03,accent);
  }
  if(car.shape==='spider') {
    for(const side of [-1,1])for(let j=0;j<3;j++) {const web=box(parts.shell,.015,.02,.9,side*(.25+j*.15),.986,.5,white);web.rotation.y=side*(.55-j*.16);}
  }
  if(car.shape==='dagger'||car.shape==='devil') {
    for(const side of [-1,1])plate(parts.shell,[[side*.25,.28],[side*.48,1.42],[side*.67,.95]],.03,.91,accent,0);
  }
  if(build.shell===1)for(const side of [-1,1])for(let j=0;j<3;j++)box(parts.shell,.17,.025,.075,side*.51,1.01,j*.16,glass);
  if(build.shell===2)for(const side of [-1,1]) {const fin=box(parts.shell,.08,.24,.71,side*.63,1.04,.4,accent);fin.rotation.x=.1;}
  root.traverse(o=>{if(o.isMesh){o.userData.slot=o.parent.userData.slot;let p=o.parent;while(p&&!o.userData.slot){o.userData.slot=p.userData.slot;p=p.parent;}}});
  for(const [slot,g]of Object.entries(parts)){if(slot==='tires')for(const wheel of wheels)batchStatic(wheel,slot);else batchStatic(g,slot);}
  root.userData={parts,wheels,car,build};
  return root;
}
export function animateAssembly(root,explode,dt,selected=null) {
  const {parts}=root.userData, k=1-Math.exp(-dt*8);
  const offsets={shell:2.55,chassis:0,motor:1.05,tires:.2,rollers:.6,battery:1.65};
  for(const [slot,g] of Object.entries(parts)) {
    g.position.y=THREE.MathUtils.lerp(g.position.y,explode*offsets[slot],k);
    if(slot==='motor')g.position.z=THREE.MathUtils.lerp(g.position.z,explode*-.6,k);
    if(slot==='battery')g.position.z=THREE.MathUtils.lerp(g.position.z,explode*.35,k);
    if(slot==='tires') for(const w of g.children)w.position.x=THREE.MathUtils.lerp(w.position.x,w.userData.side*(.77+explode*.65),k);
  }
}
