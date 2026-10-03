import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {getSetup} from './data.js';
export const material=(color,roughness=.5,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
export function box(parent,w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function cylinder(parent,r,h,x,y,z,mat,segments=24){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function plate(parent,outline,depth,y,mat,bevel=.3){
 const s=new THREE.Shape();outline.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();
 const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:bevel>0,bevelSegments:2,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:8});g.rotateX(-Math.PI/2);
 const m=new THREE.Mesh(g,mat);m.position.y=y;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
export function labelTexture(text,bg='#202a2b',fg='#f1ede0',w=512,h=128){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.font='italic 900 '+h*.53+'px Bahnschrift,Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(text,w/2,h*.52,w*.94);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
export function sign(p,text,w,h,x,y,z,bg,fg){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:labelTexture(text,bg,fg),side:THREE.DoubleSide}));m.position.set(x,y,z);p.add(m);return m;}
export function disposeObject(group){const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);if(m.map)ts.add(m.map);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());group.removeFromParent();}
export function batchStatic(group,slot){
 group.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(group.matrixWorld).invert(),batches=new Map(),old=[];
 group.traverse(m=>{if(!m.isMesh||Array.isArray(m.material))return;const a=m.material,key=[a.type,a.color?.getHex(),a.roughness,a.metalness,a.map?.uuid,a.side,a.transparent,a.opacity,Object.keys(m.geometry.attributes).sort()].join('|');let b=batches.get(key);if(!b){b={material:a,geometries:[]};batches.set(key,b);}const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,m.matrixWorld));b.geometries.push(g);old.push(m);});
 old.forEach(m=>{m.removeFromParent();m.geometry.dispose();});
 for(const b of batches.values()){const g=mergeGeometries(b.geometries);b.geometries.forEach(x=>x.dispose());if(!g)continue;const m=new THREE.Mesh(g,b.material);m.castShadow=true;m.receiveShadow=true;m.userData.slot=slot;group.add(m);}
}
function mesh(p,positions,indices,mat,uv=true){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);if(uv){const u=[];for(let i=0;i<positions.length;i+=3)u.push((positions[i]+52)/104,(positions[i+2]+72)/144);g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));}g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;p.add(m);return m;}
// Thin continuous compound surfaces, rather than boxes used as entire body shells.
function loft(p,sections,mat,centerX=0){
 const pos=[],idx=[],nx=12;
 for(const [z,w,y,edge] of sections)for(let j=0;j<=nx;j++){const q=j/nx*2-1;pos.push(centerX+q*w,y-(y-edge)*Math.pow(Math.abs(q),1.75),z);}
 for(let k=0;k<sections.length-1;k++)for(let j=0;j<nx;j++){const a=k*(nx+1)+j,b=a+nx+1;idx.push(a,b,a+1,a+1,b,b+1);}
 const m=mesh(p,pos,idx,mat);m.material.side=THREE.DoubleSide;
 // A 1.2 mm plastic lip makes the shell thickness legible at the openings.
 for(const side of [-1,1]){const ps=[],is=[];sections.forEach(([z,w,y,e],i)=>{ps.push(centerX+side*w,e,z,centerX+side*w,e-1.2,z);if(i<sections.length-1){const a=i*2;is.push(a,a+1,a+2,a+1,a+3,a+2);}});mesh(p,ps,is,mat);}
 return m;
}
function cowl(p,x,z,r,width,mat,a0=0,a1=Math.PI){
 const ps=[],ix=[],ns=22;for(let i=0;i<=ns;i++){const a=a0+(a1-a0)*i/ns;for(let j=0;j<5;j++){const q=j/4;ps.push(x+(q-.5)*width,13+Math.sin(a)*(r+.8+(1-Math.abs(q-.5)*2)*1.2),z+Math.cos(a)*(r+2));}if(i<ns)for(let j=0;j<4;j++){const k=i*5+j;ix.push(k,k+1,k+5,k+1,k+6,k+5);}}
 const m=mesh(p,ps,ix,mat);m.material.side=THREE.DoubleSide;return m;
}
function rod(p,a,b,r,mat){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),v=end.clone().sub(start);const m=cylinder(p,r,v.length(),...(start.clone().add(end).multiplyScalar(.5).toArray()),mat,12);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;}
function fin(p,x,z,y,height,depth,mat){const ps=[x,y,z+depth*.5,x,y+height*.28,z+depth*.5,x,y+height,z-depth*.4,x,y+height*.86,z-depth*.6,x,y,z-depth*.5];const s=new THREE.Shape();s.moveTo(z+depth*.5,y);s.lineTo(z+depth*.5,y+height*.28);s.lineTo(z-depth*.4,y+height);s.lineTo(z-depth*.6,y+height*.86);s.lineTo(z-depth*.5,y);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:1.3,bevelEnabled:true,bevelSize:.35,bevelThickness:.3,bevelSegments:2});g.rotateY(-Math.PI/2);const m=new THREE.Mesh(g,mat);m.position.x=x;m.castShadow=true;p.add(m);return m;}
function topLabel(p,text,w,d,x,y,z,bg,fg){const m=sign(p,text,w,d,x,y,z,bg,fg);m.rotation.x=-Math.PI/2;return m;}
function livery(car){
 const c=document.createElement('canvas');c.width=1024;c.height=1536;const ctx=c.getContext('2d');
 ctx.translate(512,768);ctx.scale(1024/104,-1536/144);
 const poly=(pts,color)=>{ctx.beginPath();pts.forEach(([x,z],i)=>i?ctx.lineTo(x,z):ctx.moveTo(x,z));ctx.closePath();ctx.fillStyle=color;ctx.fill();};
 ctx.fillStyle=car.color;ctx.fillRect(-52,-72,104,144);
 const flame=(x,z,side,color)=>poly([[x,z],[x+side*9,z+4],[x+side*3,z+10],[x+side*12,z+15],[x+side*5,z+20],[x+side*10,z+31],[x-side*1,z+24],[x-side*4,z+14],[x-side*7,z+7]],color);
 if(car.shape==='magnum'){
  poly([[-2.2,63],[-8,16],[-11,-21],[11,-21],[8,16],[2.2,63]],car.accent);
  for(const s of [-1,1]){poly([[s*5,59],[s*12,37],[s*7,40],[s*16,18]],car.trim);poly([[s*21,-58],[s*45,-55],[s*42,-10],[s*25,-22]],car.accent);flame(s*28,-49,s,car.trim);poly([[s*26,27],[s*44,27],[s*44,58],[s*26,58]],car.accent);}
 }else if(car.shape==='sonic'){
  poly([[-5,62],[-17,17],[-19,-65],[19,-65],[17,17],[5,62]],car.accent);
  for(const s of [-1,1]){poly([[s*21,-63],[s*49,-65],[s*48,-5],[s*24,-14]],car.accent);poly([[s*35,-61],[s*49,-58],[s*47,-8],[s*40,-5]],car.trim);poly([[s*24,27],[s*45,27],[s*44,58],[s*23,57]],car.accent);poly([[s*28,31],[s*45,29],[s*45,39],[s*30,42]],car.trim);}
 }else if(['dagger','evo','cobra'].includes(car.shape)){
  for(const s of [-1,1]){flame(s*28,28,s,car.shape==='cobra'||car.shape==='evo'?car.accent:car.trim);flame(s*25,23,s,car.shape==='cobra'?car.trim:car.accent);flame(s*31,-57,s,car.shape==='cobra'||car.shape==='evo'?car.accent:car.trim);flame(s*29,-52,s,car.shape==='cobra'?car.trim:car.accent);}
  if(car.shape==='evo')for(const s of [-1,1]){poly([[s*8,59],[s*14,46],[s*13,35],[s*8,24],[s*11,43]],'#252b37');flame(s*13,31,s,car.accent);}
  if(car.shape==='dagger')for(const s of [-1,1])poly([[s*2,63],[s*14,49],[s*19,17],[s*8,31],[s*4,55]],'#e9362c');
 }else if(car.shape==='spider'){
  const webStroke=()=>{ctx.lineWidth=1.6;ctx.strokeStyle='#e6e8e8';ctx.stroke();ctx.lineWidth=.8;ctx.strokeStyle=car.accent;ctx.stroke();};
  for(let x=-48;x<=48;x+=18){ctx.beginPath();for(let z=-66;z<=68;z+=3){const u=x+Math.sin(z/24)*5;z===-66?ctx.moveTo(u,z):ctx.lineTo(u,z);}webStroke();}
  for(let z=-64;z<70;z+=18){ctx.beginPath();for(let x=-50;x<=50;x+=3){const v=z+Math.cos(x/21)*4;x===-50?ctx.moveTo(x,v):ctx.lineTo(x,v);}webStroke();}
  for(const s of [-1,1])poly([[s*23,-55],[s*45,-44],[s*42,-22],[s*30,-30]],car.trim);
  for(const s of [-1,1])poly([[s*28,55],[s*40,55],[s*40,60],[s*28,60]],car.trim);
 }else if(car.shape==='giant'){
  for(const s of [-1,1]){flame(s*28,-59,s,car.accent);flame(s*29,25,s,car.accent);flame(s*9,4,s,car.accent);}
 }else if(car.shape==='devil'){
  for(const s of [-1,1]){flame(s*29,29,s,car.trim);ctx.strokeStyle=car.accent;ctx.lineWidth=.6;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(s*(25+i*5),-61);ctx.lineTo(s*(23+i*5),-49);ctx.lineTo(s*(29+i*3),-42);ctx.lineTo(s*(25+i*4),-30);ctx.stroke();}}
 }
 // Individual lamp decals: triangular Magnum, swept Sonic, low ZMC strips,
 // EVO yellow panels and the long silver Cobra lenses visible in the references.
 for(const s of [-1,1]){
  const reflect=(pts)=>pts.map(([x,z])=>[s*x,z]);
  if(car.shape==='magnum')poly(reflect([[29,32],[41,40],[38,57],[31,50]]),'#edc83d');
  if(car.shape==='sonic')poly(reflect([[26,36],[40,32],[42,49],[29,54]]),'#e1e5e4');
  if(car.shape==='dagger')poly(reflect([[24,54],[36,56],[39,61],[27,60]]),'#e3b837');
  if(car.shape==='evo'){poly(reflect([[27,42],[40,43],[40,55],[28,56]]),'#272b34');poly(reflect([[29,44],[38,45],[38,53],[30,54]]),'#eacb42');}
  if(car.shape==='cobra'){ctx.fillStyle='#dbe1e4';ctx.beginPath();ctx.ellipse(s*34,46,4.1,10,s*.18,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#303846';ctx.lineWidth=.8;ctx.stroke();}
  if(['magnum','sonic','evo','cobra'].includes(car.shape)){ctx.strokeStyle='#313947';ctx.lineWidth=.45;for(let j=-1;j<=1;j++){ctx.beginPath();ctx.ellipse(s*34,46+j*3.3,2.5,1.6,0,0,Math.PI*2);ctx.stroke();}}
  if(car.shape==='giant'){poly(reflect([[22,54],[37,54],[37,60],[22,60]]),'#242833');poly(reflect([[24,55],[36,55],[36,59],[24,59]]),'#f0cf46');}
 }
 ctx.setTransform(1,0,0,1,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
export function createCar(car,build={}){
 const setup=getSetup(car,build),b=setup.build,root=new THREE.Group(),parts={},wheels=[];
 root.name=car.id;for(const key of Object.keys(setup.parts)){const g=new THREE.Group();g.name=key;g.userData.slot=key;root.add(g);parts[key]=g;}
 const metal=material('#bbc3cc',.28,.76),dark=material('#1d222b',.62),paint=new THREE.MeshPhysicalMaterial({color:'#ffffff',map:livery(car),roughness:.32,metalness:car.shape==='devil'?.28:.08,clearcoat:.55,clearcoatRoughness:.28,side:THREE.DoubleSide});
 const solid=material(car.color,.29,.1),accent=material(car.accent,.34),glass=material(car.glass,.24,car.shape==='evo'?.72:.28),chassis=material(car.shape==='spider'?'#d32e35':car.shape==='cobra'?'#e7e7e2':car.shape==='devil'?'#25335c':setup.parts.chassis.color,.48);
 // All common hardware is built in millimetres. Scale once to metres at the viewer boundary.
 const cp=[[-27,-63],[-39,-48],[-33,-19],[-24,-13],[-24,18],[-39,33],[-41,51],[-29,63],[29,63],[41,51],[39,33],[24,18],[24,-13],[33,-19],[39,-48],[27,-63]];
 plate(parts.chassis,cp,3,5,chassis,.6);
 for(const z of [-40,40])box(parts.chassis,62,8,9,0,9,z,chassis);
 box(parts.chassis,40,4,54,0,8,0,chassis);
 for(const s of [-1,1]){box(parts.chassis,2,8,49,s*23,11,0,chassis);for(let j=0;j<5;j++)box(parts.chassis,3,1,3,s*21,15,-19+j*9,metal);}
 if(b.chassis===2)for(const s of [-1,1])for(let j=0;j<4;j++)box(parts.chassis,1,1,9,s*20,15,-16+j*10,accent);
 // Four wheels, moulded spokes, hubs and shallow tread grooves.
 const radius=setup.diameter/2;
 for(const s of [-1,1])for(const z of [-40,40]){
  const g=new THREE.Group();g.position.set(s*34,radius,z);parts.tires.add(g);g.userData.home=g.position.clone();
  const tireColor=setup.parts.tires.color||(car.shape==='spider'?'#ebe9e2':'#1b1e24'),rubber=material(tireColor,.87),hub=material(car.wheel,.35,.22);
  const profile=[[8,-5],[radius-2,-5],[radius-.6,-4.5],[radius,-3.5],[radius,3.5],[radius-.6,4.5],[radius-2,5],[8,5],[8,-5]].map(([r,y])=>new THREE.Vector2(r,y));
  const tire=new THREE.Mesh(new THREE.LatheGeometry(profile,36),rubber);tire.rotation.z=Math.PI/2;g.add(tire);
  if(car.shape==='spider'&&b.tires===0)for(const face of [-1,1]){const sidewall=new THREE.Mesh(new THREE.RingGeometry(radius*.72,radius-.5,36),rubber);sidewall.rotation.y=face*Math.PI/2;sidewall.position.x=face*5.05;g.add(sidewall);}
  const rim=cylinder(g,radius*.74,10.5,0,0,0,hub,32);rim.rotation.z=Math.PI/2;
  const well=cylinder(g,radius*.57,10.8,0,0,0,dark,28);well.rotation.z=Math.PI/2;
  const spokes=car.shape==='cobra'||car.shape==='spider'?3:car.shape==='evo'?10:5;
  for(let j=0;j<spokes;j++){const a=j*Math.PI*2/spokes;const spoke=box(g,11,3,radius*.65,0,Math.sin(a)*radius*.3,Math.cos(a)*radius*.3,hub);spoke.rotation.x=-a;}
  const pin=cylinder(g,2,11.7,0,0,0,hub,18);pin.rotation.z=Math.PI/2;
  if(car.shape==='dagger'&&z>0){const disc=cylinder(g,radius*.72,.6,s*5.8,0,0,metal,32);disc.rotation.z=Math.PI/2;}
  if(car.shape==='cobra')for(let j=0;j<20;j++){const a=j*Math.PI*2/20;const tread=box(g,9,.24,.65,0,Math.sin(a)*radius,Math.cos(a)*radius,dark);tread.rotation.x=-a;}
  batchStatic(g,'tires');wheels.push(g);
 }
 // Two real AA cells, silver terminals, retainers.
 for(const s of [-1,1]){const cell=cylinder(parts.battery,7.25,50.5,s*9,15,0,material(setup.parts.battery.color,.4,.2),28);cell.rotation.x=Math.PI/2;for(const z of [-25.5,25.5]){const cap=cylinder(parts.battery,7.2,.7,s*9,15,z,metal,24);cap.rotation.x=Math.PI/2;}const button=cylinder(parts.battery,2.8,1.3,s*9,15,26,metal,16);button.rotation.x=Math.PI/2;}
 box(parts.battery,40,1.4,3,0,23,14,chassis);box(parts.battery,40,1.4,3,0,23,-14,chassis);
 const motorZ=car.frontMotor?43:-43;
 const motor=cylinder(parts.motor,10,25,0,15,motorZ,metal,28);motor.rotation.z=Math.PI/2;
 const cap=cylinder(parts.motor,10,4,-14,15,motorZ,material(setup.parts.motor.color,.4),24);cap.rotation.z=Math.PI/2;
 for(const s of [-1,1])box(parts.motor,2,5,3,s*15,16,motorZ+7,metal);
 // Axles, longitudinal driveshaft, pinion and visible crown gear teeth.
 rod(parts.gears,[-30,13,-40],[30,13,-40],1,metal);rod(parts.gears,[-30,13,40],[30,13,40],1,metal);rod(parts.gears,[20,12,-42],[20,12,42],.8,metal);
 for(const z of [-40,40]){const gear=cylinder(parts.gears,7,2.2,21,13,z,material(setup.parts.gears.color,.5),30);gear.rotation.z=Math.PI/2;for(let j=0;j<20;j++){const a=j*Math.PI*2/20;const tooth=box(parts.gears,2.5,1.5,1.5,21,13+Math.sin(a)*7,z+Math.cos(a)*7,gear.material);tooth.rotation.x=-a;}}
 // Roller stays end inside the 165 mm measuring box.
 const rcol=setup.parts.rollers.color||(car.shape==='magnum'?'#3346bb':car.shape==='sonic'||car.shape==='giant'?'#df3038':car.shape==='evo'?'#9e89c9':car.shape==='spider'?'#151820':'#b9c3cc'),roller=material(rcol,.35,.2);
 const stayZ=car.shape==='dagger'&&b.rollers===0?56:67;
 for(const z of [-stayZ,stayZ]){
  plate(parts.rollers,[[-setup.width/2+5,z-5],[-22,z-3],[22,z-3],[setup.width/2-5,z-5],[setup.width/2-5,z+5],[-setup.width/2+5,z+5]],2,7,b.rollers===2?dark:chassis,.25);
  for(const s of [-1,1]){const x=s*(setup.width/2-9.5);cylinder(parts.rollers,3,14,x,14,z,dark,12);cylinder(parts.rollers,9.5,2.2,x,21,z,roller,28);cylinder(parts.rollers,2,2,x,23,z,metal,12);if(b.rollers===2)cylinder(parts.rollers,9.5,2,x,11,z,roller,28);}
 }
 const brakeShift=car.shape==='dagger'&&b.brake===0?10:0;
 plate(parts.brake,[[-26,-70+brakeShift],[26,-70+brakeShift],[24,-55+brakeShift],[-24,-55+brakeShift]],1.5,4,dark,.2);
 box(parts.brake,43,b.brake?b.brake:1,8,0,2.5,-65+brakeShift,material(setup.parts.brake.color,.85));
 if(b.dampers)for(const s of [-1,1])for(const z of b.dampers===2?[-51,51]:[0]){const x=s*24;rod(parts.dampers,[x,10,z],[x,31,z],.8,metal);cylinder(parts.dampers,4.7,7,x,18,z,material('#b49348',.3,.76),24);}
 else {for(const s of [-1,1])cylinder(parts.dampers,1.1,2,s*24,11,0,metal,12);}
 const body=parts.shell;
 const profiles={
  magnum:[[-54,16,27,22],[-36,18,28,22],[-15,19,28,22],[8,17,25,21],[30,13,22,18],[59,3,17,15]],
  sonic:[[-57,19,29,23],[-32,19,29,23],[-14,19,28,21],[12,19,25,20],[34,12,21,17],[57,3,17,15]],
  dagger:[[-53,18,25,20],[-33,18,26,21],[-12,18,27,19],[8,17,22,17],[35,12,18,15],[59,2,16,14]],
  evo:[[-54,18,28,23],[-31,20,29,22],[-8,19,27,22],[17,20,26,21],[37,18,22,17],[60,11,18,15]],
  cobra:[[-54,18,27,23],[-29,20,29,23],[-8,23,29,22],[19,25,26,20],[43,25,22,16],[57,14,18,15]],
  spider:[[-56,18,27,23],[-33,20,29,24],[-8,21,29,22],[20,26,24,20],[47,28,20,17],[59,29,18,16]],
  giant:[[-56,22,24,21],[-32,22,27,23],[-8,24,30,25],[16,22,24,20],[38,21,26,21],[59,19,18,16]],
  devil:[[-53,18,27,22],[-30,18,30,23],[-10,16,29,20],[14,15,25,19],[41,8,19,15],[64,1.5,15,14]],
 };
 loft(body,profiles[car.shape]||profiles.magnum,paint);
 // The character of each front cowl, rear shoulder and silhouette is model-specific.
 for(const s of [-1,1]){
  if(car.shape==='giant'){
   loft(body,[[-57,10,23,21],[-38,11,24,21],[-19,9,26,21]],paint,s*30);
   loft(body,[[22,10,25,20],[40,12,27,22],[58,10,20,17]],paint,s*29);
   loft(body,[[-53,2.5,18,16],[-20,2.5,18,16],[25,2.5,18,16],[52,3,19,16]],solid,s*45);
   rod(body,[s*45,19,-36],[s*45,19,36],1.4,metal);
  }else{
   cowl(body,s*33,-40,radius+1,24,paint);
   if(car.shape==='magnum')cowl(body,s*33,40,radius+1,23,paint,0,Math.PI*.48);
   else if(car.shape==='devil')loft(body,[[26,8,28,19],[39,10,29,18],[64,1,17,14]],paint,s*33);
   else if(car.shape==='dagger')loft(body,[[22,9,29,18],[35,10,29,17],[58,1,19,14]],paint,s*33);
   else cowl(body,s*33,40,radius+1,25,paint);
   loft(body,[[-31,8,26,23],[-14,8,22,17],[15,8,23,17],[26,8,27,22]],paint,s*27);
  }
 }
 if(car.shape==='sonic'){loft(body,[[43,40,19,17],[53,40,18,16]],material('#818890',.42));topLabel(body,'HURRICANE SONIC',52,7,0,19.6,46,'#7d838b','#24282e');}
 if(car.shape==='cobra'){loft(body,[[53,41,18.4,17],[61,39,17,15]],paint);for(const s of [-1,1])loft(body,[[21,9,23,20],[36,12,23,19],[53,12,19,16]],paint,s*30);const badge=topLabel(body,'SPIN COBRA',30,5,0,20.8,49,car.color,'#e5e7e9');badge.rotation.x=-Math.PI/2+.28;}
 if(car.shape==='evo')loft(body,[[36,1.3,23,22],[49,1.5,21,20],[60,1.7,18.4,17.4]],dark);
 if(car.shape==='spider')for(const s of [-1,1]){loft(body,[[42,12,22,18],[58,12,18.5,17]],paint,s*31);for(let j=0;j<3;j++)loft(body,[[36+j*5,3,22-j*.5,22-j*.5],[39+j*5,3,22-j*.5,22-j*.5]],dark,s*16);}
 // Curved canopy has a tapered front and a broader raised rear.
 const canopy=car.shape==='evo'?[[-20,8,29,26],[-13,11,34,28],[0,10,34,27],[13,5,27,24]]:car.shape==='spider'?[[-18,11,31,28],[-10,12,34,29],[3,11,32,28],[18,7,26,24]]:car.shape==='giant'?[[-21,15,29,23],[-14,18,35,27],[2,17,32,24],[17,14,25,22]]:[[-24,10,28,25],[-16,13,36,28],[-7,13,37,28],[6,11,34,26],[22,4,25,23]];
 loft(body,canopy,glass);
 if(car.shape==='dagger')rod(body,[0,27,22],[0,37,-8],.6,metal);
 if(car.shape==='evo'){for(const z of [-11,-1,7])rod(body,[-8,31,z],[8,31,z],.3,dark);for(const s of [-1,1])for(let j=0;j<4;j++)box(body,1.5,7,2,s*25,21,-7+j*3,metal);}
 if(car.shape==='cobra'){for(let i=0;i<4;i++)loft(body,[[28+i*5,13-i,23-i*.5,21-i*.5],[32+i*5,12-i,23.5-i*.5,21-i*.5]],metal);for(const s of [-1,1]){const intake=new THREE.Mesh(new THREE.SphereGeometry(1,20,10),dark);intake.scale.set(7,1.5,10);intake.position.set(s*31,28,-33);body.add(intake);}}
 if(car.shape==='giant'){loft(body,[[21,14,27,24],[32,15,31,24],[44,15,27,24]],solid);for(let i=0;i<7;i++)box(body,28,1.4,1.2,0,30-Math.abs(i-3)*.7,25+i*2,solid);}
 if(car.shape==='devil'){
  for(const s of [-1,1]){
   const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(s*25,20,32),new THREE.Vector3(s*20,21,16),new THREE.Vector3(s*23,22,-7),new THREE.Vector3(s*30,27,-20)]);
   const pipe=new THREE.Mesh(new THREE.TubeGeometry(curve,24,2.7,8,false),metal);body.add(pipe);
   for(const x of [25,35]){const nozzle=cylinder(body,4.3,7,s*x,30,-30,material('#b49855',.3,.8),24);nozzle.rotation.x=Math.PI/2;const hole=cylinder(body,3.1,.8,s*x,30,-26, dark,24);hole.rotation.x=Math.PI/2;}
  }
  fin(body,0,-45,31,12,27,solid);
 }else if(car.shape==='cobra'){
  for(const s of [-1,1]){fin(body,s*34,-51,26,16,35,solid);box(body,3,8,3,s*15,29,-43,solid);}loft(body,[[-61,33,39,38],[-51,33,35,34],[-40,32,32,31]],solid);const badge=topLabel(body,'SPIN COBRA',47,6,0,35.6,-51,car.color,'#e8ecef');badge.rotation.x=-Math.PI/2+.35;
 }else if(car.shape!=='giant'){
  const wingColor=car.shape==='magnum'?car.accent:car.shape==='sonic'?car.accent:car.color;
  const wm=material(car.shape==='evo'?'#252930':wingColor,.3,.1),wy=car.shape==='dagger'?43:39;
  for(const s of [-1,1]){box(body,3,wy-26,3,s*15,(wy+26)/2,-48,solid);fin(body,s*38,-49,27,car.shape==='evo'?18:14,25,solid);}
  const layers=car.shape==='spider'?3:1;
  for(let i=0;i<layers;i++){const z=-44-i*7,y=wy-(layers-1-i)*3.5;loft(body,[[z-5,37,y+1,y],[z+5,37,y,y-1]],wm);if(i===layers-1)topLabel(body,car.shape==='magnum'?'CYCLONE MAGNUM':car.shape==='sonic'?'Hurricane Sonic':car.shape==='evo'?'Proto Saber EVO':car.shape==='dagger'?'TRIDAGGER ZMC':car.shape==='spider'?'BEAK SPIDER':'SPIN COBRA',68,7,0,y+1.3,z,car.shape==='evo'?'#252930':wingColor,car.shape==='magnum'||car.shape==='evo'?'#ffd761':'#e8ecef');}
 }
 topLabel(body,car.number,10,9,0,car.shape==='giant'?26.5:24.5,car.shape==='giant'?17:25,car.color,car.shape==='devil'?'#b32231':'#e8c847');
 // Subassemblies remain independent for inspection, picking and exploded animation.
 for(const [key,p] of Object.entries(parts))if(key!=='tires')batchStatic(p,key);
 root.userData={parts,wheels,car,setup,unit:'mm'};return root;
}
export function animateAssembly(root,amount,dt){
 const offsets={shell:[0,78,0],chassis:[0,0,0],motor:[-69,26,-20],battery:[0,33,0],gears:[66,17,0],tires:[0,0,0],rollers:[0,20,28],brake:[0,-20,-35],dampers:[65,48,-25]},a=dt>=1?1:1-Math.exp(-dt*7);
 for(const [key,p] of Object.entries(root.userData.parts)){const o=offsets[key];p.position.lerp(new THREE.Vector3(...o).multiplyScalar(amount),a);}
 for(const w of root.userData.wheels){const home=w.userData.home,target=home.clone();target.x+=Math.sign(home.x)*30*amount;target.z+=Math.sign(home.z)*12*amount;w.position.lerp(target,a);}
}
