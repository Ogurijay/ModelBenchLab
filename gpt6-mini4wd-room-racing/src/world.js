import * as THREE from 'three';
import {box,cylinder,material,sign,batchStatic,plate} from './models.js';
import {LANE_WIDTH,WALL_HEIGHT} from './track.js';
function laneGeometry(track,lane,type,edge=0){
 const ps=[],idx=[],n=Math.ceil(track.length/.026);
 for(let i=0;i<=n;i++){
  const q=i/n,p=track.rawPoint(q,lane),prev=track.rawPoint(Math.max(0,q-.00005),lane),next=track.rawPoint(q+.00005,lane),t=next.sub(prev).setY(0).normalize(),normal=new THREE.Vector3(-t.z,0,t.x);
  if(type==='floor')for(const s of [-1,1]){const v=p.clone().addScaledVector(normal,s*(LANE_WIDTH/2-.002));ps.push(v.x,v.y,v.z);}
  else for(const [s,h] of [[-1,0],[1,0],[-1,WALL_HEIGHT],[1,WALL_HEIGHT]]){const v=p.clone().addScaledVector(normal,edge*LANE_WIDTH/2+s*.0015);ps.push(v.x,v.y+h,v.z);}
  if(i<n){if(type==='floor'){const k=i*2;idx.push(k,k+2,k+1,k+1,k+2,k+3);}else{const k=i*4;idx.push(k,k+2,k+4,k+2,k+6,k+4,k+1,k+5,k+3,k+3,k+5,k+7,k+2,k+3,k+6,k+3,k+7,k+6);}}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
export function buildCircuit(track){
 const root=new THREE.Group(),white=material('#e4e5e4',.43),red=material('#df3540',.36),blue=material('#2870ae',.36),grey=material('#aab0b5',.55),dark=material('#292e35',.65);
 for(let l=0;l<track.laneCount;l++){
  const floor=new THREE.Mesh(laneGeometry(track,l,'floor'),l%3===0?white:l%3===1?material('#d9e1e6',.45):material('#b7c5d2',.45));floor.receiveShadow=true;root.add(floor);
  for(const e of [-1,1]){const wall=new THREE.Mesh(laneGeometry(track,l,'wall',e),l===0&&e===-1?red:l===track.laneCount-1&&e===1?blue:white);wall.castShadow=true;wall.receiveShadow=true;root.add(wall);}
 }
 // Seams at 54 cm mark plastic course pieces; they are geometry, not racing lanes.
 const seams=new THREE.Group();root.add(seams);
 for(let l=0;l<track.laneCount;l++)for(let d=0;d<track.length;d+=.54){const pose=track.pose(d/track.length,l),m=box(seams,LANE_WIDTH-.009,.0006,.002,pose.p.x,pose.p.y+.001,pose.p.z,grey);m.rotation.set(pose.pitch,pose.yaw,0,'YXZ');}
 for(let l=0;l<track.laneCount;l++){const pose=track.pose(0,l);for(let a=0;a<4;a++)for(let b=0;b<2;b++){const n=new THREE.Vector3(-pose.tangent.z,0,pose.tangent.x),p=pose.p.clone().addScaledVector(n,(a-1.5)*.025).addScaledVector(pose.tangent,b*.026);const m=box(root,.025,.0008,.026,p.x,p.y+.0015,p.z,(a+b)%2?dark:white);m.rotation.y=pose.yaw;}}
 // Uprights support both the rollover lane changer and the central overpass.
 const support=material('#d84343',.4);
 for(let l=0;l<track.laneCount;l++)for(let d=.75;d<track.length;d+=.55){const p=track.rawPoint(d/track.length,l);if(p.y>.09)for(const side of [-1,1]){const pose=track.pose(d/track.length,l),n=new THREE.Vector3(-pose.tangent.z,0,pose.tangent.x),v=p.clone().addScaledVector(n,side*.044);box(root,.012,p.y-.013,.035,v.x,(p.y-.013)/2,v.z,support);}}
 const p=track.point(0),pose=track.pose(0,0),arch=new THREE.Group();arch.position.set(p.x,0,p.z);arch.rotation.y=pose.yaw;root.add(arch);
 const span=track.width+.13;
 for(const s of [-1,1])box(arch,.025,.3,.035,s*span/2,.15,-.045,s===-1?red:blue);
 box(arch,span+.04,.07,.045,0,.31,-.045,dark);sign(arch,'MINI 4WD / START',span,.055,0,.312,-.02,'#292e35','#fff6dc');
 // Colour accents only on the outer edge; lane walls stay continuous through the changer.
 for(const j of track.jumps){const pos=track.point(j.start/track.length);const label=sign(root,'BRAKE / JUMP',.85,.16,pos.x,.15,pos.z+.7,'#e13f3f','#ffffff');label.rotation.x=-Math.PI/4;}
 const cp=track.point((track.change.start+track.change.end)/2/track.length);
 const board=sign(root,'LANE CHANGE',1.1,.16,cp.x,.35,cp.z+.8,'#253c58','#f2eee2');board.rotation.x=-Math.PI/6;
 batchStatic(seams);return root;
}
function chair(p,x,z,mat){const dark=material('#303943',.6);box(p,.47,.065,.47,x,.44,z,mat);box(p,.47,.45,.055,x,.7,z-.22,mat);for(const a of [-1,1])for(const b of [-1,1])box(p,.028,.42,.028,x+a*.19,.21,z+b*.19,dark);}
function table(p,x,z,accent){
 const wood=material('#9d7954',.6),steel=material('#5d6264',.45,.3);
 box(p,1.6,.055,.75,x,.76,z,wood);for(const a of [-1,1])for(const b of [-1,1])box(p,.04,.74,.04,x+a*.68,.37,z+b*.28,steel);
 const mat=material('#263c3c',.8);box(p,.6,.006,.4,x-.3,.794,z,mat);
 box(p,.35,.1,.2,x+.45,.82,z,material(accent,.6));
 for(let i=0;i<4;i++)cylinder(p,.011,.015,x-.45+i*.07,.805,z+.1,steel,12);
 chair(p,x,z+.62,material('#786552',.85));
}
function person(p,x,z,color){
 // Human-scale fixtures establish that the vehicles are 1/32 toys, not full-size RC cars.
 const g=new THREE.Group();g.position.set(x,0,z);p.add(g);const trousers=material('#293a50',.85),shirt=material(color,.85),skin=material('#c69471',.8);
 for(const s of [-1,1]){box(g,.13,.78,.15,s*.11,.39,0,trousers);box(g,.14,.09,.28,s*.11,.045,.07,trousers);}
 const torso=cylinder(g,.23,.55,0,1.08,0,shirt,12);torso.scale.z=.64;
 const head=new THREE.Mesh(new THREE.SphereGeometry(.12,16,12),skin);head.position.set(0,1.52,0);g.add(head);
 for(const s of [-1,1]){const arm=cylinder(g,.055,.58,s*.26,1.05,0,shirt,10);arm.rotation.z=-s*.12;}
}
export function buildRoom(venue){
 const root=new THREE.Group(),night=venue.id==='night',floor=material(venue.floor,.78),wall=material(venue.wall,.9),trim=material('#626768',.7),width=23,depth=17;
 box(root,width,.07,depth,0,-.045,0,floor);box(root,width,3.2,.1,0,1.6,-depth/2,wall);box(root,.1,3.2,depth,-width/2,1.6,0,wall);
 const seam=material(night?'#505861':'#986f48',.85);
 if(venue.id==='bedroom'){for(let x=-11.3;x<11.5;x+=.22)box(root,.001,.002,depth,x,-.008,0,seam);for(let z=-8;z<8.5;z+=1.1)for(let x=-11.1;x<11.5;x+=.44)box(root,.22,.002,.001,x+(Math.round(z/1.1)%2)*.22,-.007,z,seam);}
 else for(let x=-11;x<11.5;x+=1){box(root,.002,.002,depth,x,-.008,0,trim);box(root,width,.002,.002,0,-.008,x/1.4,trim);}
 box(root,width,.065,.055,0,.04,-8.4,trim);box(root,.055,.065,depth,-11.4,.04,0,trim);
 // Windows, workbenches and parts shelves use actual room proportions.
 const windowMat=new THREE.MeshBasicMaterial({color:night?'#425471':'#c7e4ed'});
 for(let x=-7;x<=7;x+=3.6){box(root,2.5,1.55,.04,x,1.95,-8.42,windowMat);for(const a of [-1,0,1])box(root,.025,1.58,.06,x+a*1.24,1.95,-8.37,trim);box(root,2.55,.025,.06,x,1.95,-8.36,trim);}
 for(const x of [-8,-5,5,8])table(root,x,-7.05,venue.accent);
 const shelf=material('#575e63',.5);
 for(const x of [-10,10]){for(const y of [.25,.8,1.35,1.9])box(root,.75,.025,1.65,x,y,-6.2,shelf);for(const z of [-6.95,-5.45])for(const s of [-1,1])box(root,.025,2,.025,x+s*.35,1,z,shelf);for(let j=0;j<10;j++)box(root,.21,.16,.3,x+(j%3-1)*.23,.38+Math.floor(j/3)*.55,-6.2,material(['#e4d0ac','#ad3a3b','#426aa4'][j%3],.8));}
 const banner=sign(root,'AFTER SCHOOL / MINI 4WD CLUB',4.7,.5,0,2.55,-8.35,'#283846','#f1dfb3');
 const accent=material(venue.accent,.55);for(const x of [-6,0,6]){box(root,2,.06,.28,x,2.95,-6.4,material('#e4ded2'));box(root,1.85,.003,.22,x,2.914,-6.4,new THREE.MeshBasicMaterial({color:'#fff4da'}));}
 for(const [x,z,c] of [[-8,6.8,'#cf7b49'],[5,7.2,'#697f99'],[10,-2,'#bd4449']])person(root,x,z,c);
 const bench=material('#74583d',.75);box(root,2.5,.055,.5,0,.44,7.2,bench);for(const x of [-1,1])box(root,.06,.44,.4,x,.22,7.2,trim);
 // Tape keeps people away from the course. No road markings implying free steering.
 for(const x of [-10.45,10.45])box(root,.035,.001,13,x,0,0,accent);
 batchStatic(root);return root;
}
