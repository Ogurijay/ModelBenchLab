import * as THREE from 'three';
import {BLUEPRINTS} from './blueprints.js';
import {paintCar,addMechanicalDetails} from './model-details';

type Row=number[];
const v=(a:number[])=>new THREE.Vector3(...a);
export function material(color:string,roughness=.3,metalness=0){return new THREE.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:metalness>.5?.2:.3,clearcoatRoughness:.32,envMapIntensity:.72,side:THREE.DoubleSide});}
export function mesh(parent:THREE.Object3D,name:string,g:THREE.BufferGeometry,m:THREE.Material){const obj=new THREE.Mesh(g,m);obj.name=name;obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;}
export function box(parent,name,x,y,z,w,h,d,mat){const o=mesh(parent,name,new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);return o;}
export function cylinder(parent,name,x,y,z,r,h,mat,axis='x',segments=40){const g=new THREE.CylinderGeometry(r,r,h,segments);if(axis==='x')g.rotateZ(Math.PI/2);if(axis==='z')g.rotateX(Math.PI/2);const o=mesh(parent,name,g,mat);o.position.set(x,y,z);return o;}

export function surfacePoint(rows:Row[],u:number,vv:number,side=1,lift=0){
  const f=Math.max(0,Math.min(.999999,vv))*(rows.length-1),i=Math.floor(f),t=f-i,a=rows[i],b=rows[i+1];
  const p=a.map((x,j)=>THREE.MathUtils.lerp(x,b[j],t));
  return new THREE.Vector3(side*THREE.MathUtils.lerp(p[1],p[2],u),THREE.MathUtils.lerp(p[3],p[4],u)+p[5]*Math.sin(Math.PI*u)+lift,p[0]);
}
function surface(parent,name,rows,side,mat){
  const nx=12,nz=(rows.length-1)*8,pos=[],idx=[],uv=[];
  const depth=/shoulder|cowl|block|outrigger|cockpit-base/.test(name)?5:2;
  for(let layer=0;layer<2;layer++)for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
    const p=surfacePoint(rows,i/nx,j/nz,side,layer?-depth:0);pos.push(p.x,p.y,p.z);uv.push(i/nx,j/nz);
  }
  const plane=(nx+1)*(nz+1);
  function quad(a,b,c,d,rev=false){if(rev)idx.push(a,c,b,a,d,c);else idx.push(a,b,c,a,c,d);}
  for(let l=0;l<2;l++)for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const a=l*plane+j*(nx+1)+i;quad(a,a+1,a+nx+2,a+nx+1,(l===1)!==(side<0));
  }
  const ring=[];for(let i=0;i<nx;i++)ring.push(i);for(let j=0;j<nz;j++)ring.push(j*(nx+1)+nx);for(let i=nx;i>0;i--)ring.push(nz*(nx+1)+i);for(let j=nz;j>0;j--)ring.push(j*(nx+1));
  for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];quad(a,a+plane,b+plane,b,side<0);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
  const m=mesh(parent,name,g,mat);m.userData.surface={rows,side};return m;
}
function canopy(parent,rows,mat){
  const pos=[],idx=[];
  for(const [z,w,base,top] of rows)for(const [x,y] of [[-w,base],[-w*.64,top],[w*.64,top],[w,base]])pos.push(x,y,z);
  for(let j=0;j<rows.length-1;j++)for(let k=0;k<4;k++){const a=j*4+k,b=j*4+(k+1)%4,c=(j+1)*4+(k+1)%4,d=(j+1)*4+k;idx.push(a,b,c,a,c,d);}
  idx.push(0,2,1,0,3,2);const a=(rows.length-1)*4;idx.push(a,a+1,a+2,a,a+2,a+3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return mesh(parent,'canopy-glazing',g,mat);
}
function fin(parent,name,side,points,mat){
  const shape=new THREE.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y));shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:1.3,bevelEnabled:true,bevelThickness:.2,bevelSize:.3,bevelSegments:1,steps:1});
  const p=g.getAttribute('position');for(let i=0;i<p.count;i++){const z=p.getX(i),y=p.getY(i),x=p.getZ(i);p.setXYZ(i,x+side-.65,y,z);}g.computeVertexNormals();return mesh(parent,name,g,mat);
}

export function createCarModel(car,options:{painted?:boolean,detail?:number,build?:any}={}){
 const bp=BLUEPRINTS[car.baseId||car.id];
 const root=new THREE.Group();root.name=car.id;const parts:any={};const panelMeshes:any={};
 function part(id){const group=new THREE.Group();group.name=id;group.userData.part=id;group.userData.rest=new THREE.Vector3();root.add(group);parts[id]=group;return group;}
 const shell=part('shell'),chassis=part('chassis'),glazing=part('canopy'),wing=part('wing');
 const body=material(options.painted?car.body:'#9ca5a9',options.painted?.26:.8),dark=material(options.painted?'#14191d':'#434b50',.82),glass=material(options.painted?car.canopy:'#727b7e',.22),silver=material('#a6afb4',.3,.8);
 const guideZ=car.chassis==='SUPER TZ'?67:car.family==='real'?66:60;
 box(chassis,'chassis-bed',0,7,0,39,4,108,dark);box(chassis,'front-bumper',0,8,guideZ,79,3,6,dark);box(chassis,'rear-bumper',0,8,-guideZ,79,3,5,dark);
 for(const x of [-19,19])box(chassis,'battery-bay-side-'+x,x,15,-2,1.3,14,56,dark);
 for(const p of bp.panels)for(const sign of (p.mirror?[-1,1]:[1])){
   const id=p.name+(p.mirror?(sign<0?'-left':'-right'):'');panelMeshes[id]=surface(shell,id,p.rows,sign,body);
 }
 canopy(glazing,(car.baseId||car.id)==='gigant'?bp.canopy.slice(0,3):bp.canopy,glass);
 if((car.baseId||car.id)==='gigant')canopy(shell,bp.canopy.slice(2),body).name='red-rear-cockpit-housing';
 if(bp.wing){
   box(wing,'wing-plane',0,bp.wing[2],bp.wing[3],bp.wing[0],1.3,bp.wing[1],body);
   for(const x of [-16,16])box(wing,'wing-support-'+x,x,(bp.wing[2]+23)/2,bp.wing[3]+3,2,bp.wing[2]-23,4,body);
 }
 for(const f of bp.fins)for(const sign of (f.side===0?[1]:[-1,1]))fin(wing,f.name+(sign<0?'-left':'-right'),f.side*sign,f.points,body);
 const wheels=[];
 for(let i=0;i<4;i++){
   const wh=part('wheel-'+i);wh.position.set((i%2?1:-1)*bp.track/2,13,i<2?bp.axle:-bp.axle);wh.userData.rest.copy(wh.position);wheels.push(wh);
   cylinder(wh,'tire',0,0,0,13,i<2?8:10,dark);
 }
 const motor=part('motor'),battery=part('battery'),gear=part('gear'),rollers=part('rollers'),brake=part('brake');
 cylinder(motor,'motor-can',0,13,car.family==='front'?27:-29,7.5,23,silver);
 cylinder(battery,'cell-left',-8,11,0,6.5,47,silver,'z');cylinder(battery,'cell-right',8,11,0,6.5,47,silver,'z');
 cylinder(gear,'drive-gear',13,13,car.family==='front'?41:-41,6,3,dark);
 box(brake,'sponge',0,3,-61,26,3,6,dark);
 if(!car.adaptation)for(const z of [guideZ,-guideZ])for(const x of [-38.5,38.5])cylinder(rollers,`guide-${x}-${z}`,x,10,z,6.5,2.7,dark,'y');
 root.userData={parts,wheels,panelMeshes,carId:car.id,blueprint:bp,guideZ,sculptRuntime:{rootMotionNode:root,parts,colliders:[{type:'box',dimensions:[.09,.041,.147]}],sockets:Object.fromEntries(Object.keys(parts).map(k=>[k,k+'-mount']))}};
 if(options.painted){paintCar(root,car);addMechanicalDetails(root,car,options.build);}
 root.traverse((o:any)=>{if(o.isMesh){o.userData.explodeWithParent=true;let p=o.parent;while(p&&p!==root&&!p.userData.part)p=p.parent;if(p?.userData.part)o.userData.part=p.userData.part;}});
 root.scale.setScalar(.001);return root;
}

export function explodeModel(root,amount){
 const parts=root.userData.parts;
 for(const [id,g] of Object.entries(parts) as any){
  const rest=g.userData.rest||new THREE.Vector3();g.position.copy(rest);
  if(id.startsWith('wheel-'))g.position.x=rest.x*(1+amount*.75);
  else if(id==='shell')g.position.y=amount*55;
  else if(id==='canopy')g.position.y=amount*79;
  else if(id==='wing')g.position.set(0,amount*60,-amount*26);
  else if(id==='battery')g.position.y=amount*18;
  else if(id==='motor')g.position.set(0,amount*27,-amount*14);
  else if(id==='gear')g.position.set(amount*20,amount*22,0);
  else if(id==='rollers')g.position.y=-amount*12;
  else if(id==='brake')g.position.y=-amount*20;
 }
}
