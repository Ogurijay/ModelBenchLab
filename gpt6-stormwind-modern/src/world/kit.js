import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export function makeKit(materials){
 const M=name=>typeof name==='string'?materials[name]:name;
 function mesh(g,geo,mat,x=0,y=0,z=0,solid=false){
  // Meter-based projection prevents one giant stretched brick texture per wall.
  if(['stone','darkStone','roof','purple','redRoof','paving','wood','timber'].includes(mat)){
   const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv;
   let ancestor=g,monument=false;while(ancestor){if(/圣光大教堂|暴风要塞/.test(ancestor.name))monument=true;ancestor=ancestor.parent;}
   const roofing=['roof','purple','redRoof'].includes(mat),stonework=['stone','darkStone'].includes(mat);
   const sx=mat==='paving'?2:roofing?4:stonework?(monument?3:2.4):4;
   const sy=roofing?3:mat==='paving'?2:stonework?(monument?3:2.4):1.6;
   if(uv&&n)for(let i=0;i<p.count;i++){
    const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    uv.setXY(i,(nx>ny&&nx>nz?p.getZ(i):p.getX(i))/sx,(ny>nx&&ny>nz?p.getZ(i):p.getY(i))/sy);
   }
  }
  const m=new THREE.Mesh(geo,M(mat));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;if(solid)m.userData.collider=true;g.add(m);return m;
 }
 const box=(g,x,y,z,w,h,d,mat='stone',solid=false)=>{
  const bevel=['stone','trim','darkStone'].includes(mat)&&Math.min(w,h,d)>=1&&w>2&&h>1;
  return mesh(g,bevel?new RoundedBoxGeometry(w,h,d,1,.065):new THREE.BoxGeometry(w,h,d),mat,x,y,z,solid);
 };
 const cyl=(g,x,y,z,rt,rb,h,mat='stone',n=16,solid=false)=>mesh(g,new THREE.CylinderGeometry(rt,rb,h,n),mat,x,y,z,solid);
 const sphere=(g,x,y,z,r,mat='stone')=>mesh(g,new THREE.SphereGeometry(r,12,8),mat,x,y,z);
 function roof(g,x,y,z,w,d,h,mat='roof'){
  const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(0,h);s.lineTo(w/2,0);s.closePath();
  const geo=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false});geo.translate(0,0,-d/2);return mesh(g,geo,mat,x,y,z);
 }
 function arch(g,x,y,z,w,h,depth,mat='trim',thick=.65){
  // Open semicircular top: no invisible blocker across the passage.
  box(g,x-w/2-thick/2,y+h/2,z,thick,h,depth,mat,true);box(g,x+w/2+thick/2,y+h/2,z,thick,h,depth,mat,true);
  const shape=new THREE.Shape();const r=w/2;shape.absarc(0,0,r+thick,0,Math.PI,false);shape.absarc(0,0,r,Math.PI,0,true);shape.closePath();
  const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:16});geo.translate(0,0,-depth/2);return mesh(g,geo,mat,x,y+h,z);
 }
 function floor(g,x,y,z,w,d,mat='paving'){const m=box(g,x,y-.12,z,w,.24,d,mat);m.userData.walkable=true;return m;}
 function beam(g,a,b,r,mat='timber',n=8){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),v=B.clone().sub(A);const m=cyl(g,...A.clone().add(B).multiplyScalar(.5).toArray(),r,r,v.length(),mat,n);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return m;}
 function banner(g,x,y,z,w=2,h=4,rot=0){const p=new THREE.Group();p.position.set(x,y,z);p.rotation.y=rot;g.add(p);box(p,0,0,0,w,h,.06,'banner');box(p,0,h/2,0,w+.35,.12,.15,'gold');box(p,0,-h/2+.15,.045,w,.2,.025,'gold');cyl(p,0,0,.1,.32,.32,.08,'gold',6).rotation.x=Math.PI/2;for(const q of [-1,1])beam(p,[q*.15,-.4,.1],[q*.5,.2,.1],.07,'gold');return p;}
 function window(g,x,y,z,w=1.1,h=2,rot=0){const p=new THREE.Group();p.position.set(x,y,z);p.rotation.y=rot;g.add(p);for(const side of [-1,1]){box(p,side*(w/2+.055),0,.015,.11,h+.22,.14,'darkStone');box(p,0,side*(h/2+.055),.015,w+.22,.11,.14,'darkStone');}box(p,0,0,.10,w,h,.035,'glass');for(const dx of [-1,1])box(p,dx*(w/2+.06),0,.19,.15,h+.3,.27,'trim');for(const dy of [-1,1])box(p,0,dy*(h/2+.06),.2,w+.4,.15,.32,'trim');box(p,0,0,.15,.065,h,.09,'timber');box(p,0,.05,.15,w,.065,.09,'timber');box(p,0,-h/2-.16,.28,w+.55,.16,.52,'trim');return p;}
 function tree(g,x,y,z,s=1){cyl(g,x,y+2*s,z,.25*s,.45*s,4*s,'timber',7,true);for(const [dx,dy,dz,r] of [[0,5,0,2.8],[-1.3,4.4,0,2],[1.4,4.8,.8,2]]){const m=mesh(g,new THREE.IcosahedronGeometry(r*s,1),'leaf',x+dx*s,y+dy*s,z+dz*s);m.scale.y=1.1;}}
 function lamp(g,x,y,z){cyl(g,x,y+1.9,z,.08,.15,3.8,'iron',8);box(g,x,y+3.8,z,.45,.7,.45,'glow');for(const dx of [-.28,.28])box(g,x+dx,y+3.8,z,.06,.9,.6,'iron');cyl(g,x,y+4.3,z,0,.48,.4,'iron',4);}
 return {mesh,box,cyl,sphere,roof,arch,floor,beam,banner,window,tree,lamp};
}
