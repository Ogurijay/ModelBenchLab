import * as THREE from 'three';
import { box, cylinder, material, sign, batchStatic } from './models.js';
import { LANE_WIDTH, START } from './track.js';

function ribbon(track,offset,width,height,mat) {
  const pos=[],idx=[],n=1000;
  for(let i=0;i<=n;i++) {
    const q=i/n,c=track.point(q),a=track.point(q-.0005),b=track.point(q+.0005),t=b.sub(a).normalize(),normal=new THREE.Vector3(-t.z,0,t.x).normalize();
    for(const edge of [-1,1]) {const p=c.clone().addScaledVector(normal,offset+edge*width/2);pos.push(p.x,p.y+height,p.z);}
    if(i<n){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,mat);mesh.receiveShadow=true;return mesh;
}
function barrier(track,offset,mat) {
  const pos=[],idx=[],n=1000;
  for(let i=0;i<=n;i++) {
    const q=i/n,c=track.point(q),a=track.point(q-.0005),b=track.point(q+.0005),t=b.sub(a).normalize(),normal=new THREE.Vector3(-t.z,0,t.x).normalize();
    const h=(Math.abs(offset)<1.8&&q>=.065&&q<=.205)?.02:.31;
    for(const [w,y] of [[-.035,-.08],[.035,-.08],[-.035,h],[.035,h]]) {const p=c.clone().addScaledVector(normal,offset+w);pos.push(p.x,p.y+y,p.z);}
    if(i<n){const k=i*4;idx.push(k,k+4,k+2,k+2,k+4,k+6,k+1,k+3,k+5,k+3,k+7,k+5,k+2,k+6,k+3,k+3,k+6,k+7);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
export function buildCircuit(track) {
  const root=new THREE.Group(), ivory=material('#dddcd2',.39), red=material('#d74e41',.37), blue=material('#438298',.37), asphalt=material('#626e6c',.7);
  root.add(ribbon(track,0,4*LANE_WIDTH+.16,-.09,asphalt));
  for(let i=0;i<4;i++)root.add(ribbon(track,(i-1.5)*LANE_WIDTH,LANE_WIDTH-.045,0,i%2===0?material('#929b93',.55):material('#85928d',.55)));
  for(let i=0;i<=4;i++)root.add(barrier(track,(i-2)*LANE_WIDTH,i===0?blue:i===4?red:ivory));
  // Modular seams, the start checkerboard, and the visible lane-change zone.
  const seamMat=material('#63746e',.8), stripe=material('#e8e3cb',.8);
  for(let j=0;j<88;j++) {
    const q=j/88,p=track.point(q),t=track.point(q+.001).sub(track.point(q-.001)).normalize();
    const seam=box(root,3.7,.008,.022,p.x,p.y+.012,p.z,seamMat);seam.rotation.y=Math.atan2(t.x,t.z);
  }
  for(let i=0;i<16;i++)for(let j=0;j<3;j++) {
    const q=START+(j-1)*.0023,center=track.point(q),t=track.point(q+.001).sub(track.point(q-.001)).normalize();
    center.addScaledVector(new THREE.Vector3(-t.z,0,t.x).normalize(),(i-7.5)*LANE_WIDTH/4);
    const tile=box(root,LANE_WIDTH/4,.014,.245,center.x,center.y+.022,center.z,(i+j)%2===0?ivory:material('#283432'));
    tile.rotation.y=Math.atan2(t.x,t.z);
  }
  for(let i=0;i<4;i++)for(let j=0;j<4;j++) {
    const q=.11+j*.024,p=track.point(q,i),t=track.point(q+.001,i).sub(track.point(q-.001,i)).normalize();
    for(const side of [-1,1]) {const arrow=box(root,.055,.01,.32,p.x+side*.075,p.y+.017,p.z,stripe);arrow.rotation.y=Math.atan2(t.x,t.z)+side*.55;}
  }
  for(let j=0;j<40;j++) {
    const p=track.point(j/40);
    if(p.y>.48) { const t=track.point(j/40+.001).sub(track.point(j/40-.001)).normalize();for(const side of [-1,1]){const v=p.clone().addScaledVector(new THREE.Vector3(-t.z,0,t.x),side*1.55);box(root,.28,p.y-.12,.44,v.x,(p.y-.12)/2,v.z,red);} }
  }
  const start=track.point(START),t=track.point(START+.001).sub(track.point(START-.001)).normalize();
  const arch=new THREE.Group();arch.position.copy(start);arch.rotation.y=Math.atan2(t.x,t.z);root.add(arch);
  box(arch,.21,2.45,.28,-2.09,1.15,0,blue);box(arch,.21,2.45,.28,2.09,1.15,0,red);
  box(arch,4.42,.56,.26,0,2.22,0,material('#263d3d'));
  sign(arch,'MINI 4WD  /  START',4.12,.43,0,2.24,.141,'#263d3d','#f5ead3');
  for(let i=0;i<3;i++) {const light=cylinder(arch,.09,.045,(i-1)*.32,1.81,.06,material('#e96c3d'));light.rotation.x=Math.PI/2;}
  batchStatic(root);return root;
}

function plant(parent,x,z,size=1) {
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(size);parent.add(g);
  cylinder(g,.55,.8,0,.4,0,material('#c07855'));
  cylinder(g,.48,.04,0,.82,0,material('#493d32'));
  const green=material('#4e715b',.9);
  for(let i=0;i<9;i++) {
    const leaf=new THREE.Mesh(new THREE.SphereGeometry(.5,7,5),green),a=i*2.4;
    leaf.scale.set(.48,1.7,.48);leaf.position.set(Math.cos(a)*.4,1.35+(i%3)*.22,Math.sin(a)*.4);leaf.rotation.z=Math.cos(a)*.5;leaf.rotation.x=Math.sin(a)*.5;leaf.castShadow=true;g.add(leaf);
  }
}
export function buildRoom(venue) {
  const g=new THREE.Group(), night=venue.id==='night', wall=material(venue.wall,.95), floor=material(venue.floor,.87), dark=material('#354743'), wood=material('#aa8058'), cream=material('#e5dbc2');
  box(g,44,.35,33,0,-.27,0,floor);
  const seam=material(night?'#38414a':'#a78058',.95);
  for(let x=-22;x<=22;x+=1.5)box(g,.025,.008,33,x,-.087,0,seam);
  for(let x=-21.25;x<22;x+=1.5)for(let z=-16;z<16;z+=6)box(g,1.47,.008,.021,x,-.08,z+((Math.round(x*2)%2)?3:0),seam);
  box(g,44,11,.28,0,5.3,-16.5,wall);box(g,.28,11,33,-22,5.3,0,wall);
  box(g,44,.32,.12,0,.15,-16.25,wood);box(g,.12,.32,33,-21.75,.15,0,wood);
  // Sunlit window, framed recess and small skyline visible through the glass.
  box(g,8.5,5.7,.15,-10,6.15,-16.21,cream);
  const windowMat=new THREE.MeshBasicMaterial({color:night?'#26465f':'#cbdedd'});
  box(g,7.95,5.12,.17,-10,6.15,-16.1,windowMat);
  const skyline=material(night?'#1a3045':'#96b3af');
  for(let i=0;i<10;i++)box(g,.7,1+(i%4)*.4,.06,-13.55+i*.8,4.15+(i%4)*.2,-15.99,skyline);
  box(g,.16,5.12,.18,-10,6.15,-15.94,cream);box(g,7.95,.16,.18,-10,6.15,-15.94,cream);box(g,8.8,.15,.55,-10,3.32,-15.9,cream);
  for(const side of [-1,1])for(let i=0;i<4;i++)box(g,.28,6.1,.32,-10+side*(4.5+i*.18),6.05,-15.77,material(night?'#3f555e':'#c5b58e'));
  // Workbench with pegboard, tools, spare tires, a lamp and model boxes.
  const desk=new THREE.Group();desk.position.set(9,0,-13.3);g.add(desk);
  box(desk,12,.32,3.45,0,2.65,0,wood);
  for(const x of [-5.25,5.25])for(const z of [-1.25,1.25])box(desk,.24,2.6,.24,x,1.3,z,dark);
  box(desk,10,3.3,.13,0,5,-2.84,material(night?'#263a40':'#7c9185'));
  for(let x=-4.5;x<5;x+=.42)for(let y=3.7;y<6.6;y+=.43)cylinder(desk,.025,.09,x,y,-2.74,dark,6).rotation.x=Math.PI/2;
  for(let i=0;i<6;i++){box(desk,.13,.8,.12,-3+i*.5,4.7,-2.62,material(i%2?'#b34736':'#dfad4d'));box(desk,.08,.55,.08,-3+i*.5,5.35,-2.62,cream);}
  box(desk,4.5,.035,2.4,0,2.84,.1,material('#4c7c6b'));
  for(let i=0;i<3;i++){box(desk,2,.65,1.5,3.8,3.12+i*.65,-.3,material(['#c36642','#627f89','#d4b46f'][i]));sign(desk,['FULL COWL','RACING PARTS','MINI 4WD'][i],1.9,.38,3.8,3.14+i*.65,.46,['#c36642','#627f89','#d4b46f'][i],'#efe4ce');}
  for(let i=0;i<4;i++)cylinder(desk,.28,.2,-1+i*.65,2.94,.4,material('#2d3438'));
  cylinder(desk,.45,.12,-4.6,2.91,.25,dark);box(desk,.1,1.7,.1,-4.6,3.8,.25,dark);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(.67,.48,16,1,true),material('#dfab52'));shade.position.set(-4.6,4.62,.25);desk.add(shade);
  // A compact sofa/bench establishes the human room scale.
  const sofa=new THREE.Group();sofa.position.set(-19,0,7.5);g.add(sofa);
  box(sofa,3.7,.75,7.5,0,.74,0,material(night?'#4b5263':'#657d71'));
  box(sofa,.6,1.8,7.5,-1.7,1.8,0,material(night?'#535e70':'#748a7b'));
  for(const z of [-3.5,3.5])box(sofa,3.7,1.25,.45,0,1.35,z,material(night?'#535e70':'#748a7b'));
  for(const z of [-2.2,0,2.2])box(sofa,2.9,.35,2.08,.1,1.3,z,material(night?'#62727c':'#899b86'));
  box(sofa,.8,.6,1.2,.1,1.83,-2,material('#d1a760')).rotation.z=.2;
  plant(g,-19,-11,1.7);plant(g,19,-11,1.4);
  // Club posters and a wall clock, all locally generated surfaces.
  sign(g,'LET’S & GO!!',7.4,2.1,1.5,8,-16.29,venue.accent,'#f8eddb');
  sign(g,'小さなマシン、大きな夢。',7.4,.75,1.5,6.42,-16.28,venue.wall,'#edf0d9');
  const clock=cylinder(g,.88,.09,18,7.8,-16.2,cream,32);clock.rotation.x=Math.PI/2;
  box(g,.06,.65,.06,18,8,-16.1,dark).rotation.z=-.4;box(g,.05,.46,.06,18.17,7.75,-16.1,dark).rotation.z=1.3;
  // Crates, race cones and a pit mat around the circuit.
  box(g,7,.04,2.3,2,-.06,13.5,material('#3b5651'));
  sign(g,'PIT AREA  /  01–08',5.8,.65,2,-.03,13.5,'#3b5651','#d6d4b2').rotation.x=-Math.PI/2;
  for(let i=0;i<4;i++){const x=-11+i*2.7;box(g,.55,.08,.55,x,.03,12.3,cream);const cone=new THREE.Mesh(new THREE.ConeGeometry(.22,.58,12),material('#de703f'));cone.position.set(x,.37,12.3);cone.castShadow=true;g.add(cone);}
  if(night){box(g,43,.08,.08,0,2.3,-16.25,new THREE.MeshBasicMaterial({color:'#e47861'}));box(g,.08,.08,31,-21.75,2.3,0,new THREE.MeshBasicMaterial({color:'#5dacc2'}));}
  batchStatic(g);return g;
}
