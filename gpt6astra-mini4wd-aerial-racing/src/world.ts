import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {material} from './models';

export function disposeGroup(group){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const mat of (Array.isArray(o.material)?o.material:[o.material]))if(mat){materials.add(mat);if(mat.map)textures.add(mat.map);}if(o.shadow)o.shadow.dispose();});
 geometries.forEach((g:any)=>g.dispose());textures.forEach((t:any)=>t.dispose());materials.forEach((m:any)=>m.dispose());group.removeFromParent();
}
function cube(parent,name,pos,size,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.name=name;m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function tube(parent,points,r,mat){const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(8,points.length*2),r,6,false);const m=new THREE.Mesh(g,mat);parent.add(m);return m;}
function textPlane(text,w,h,color='#ffffff',background='#152731'){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.round(1024*h/w);const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`italic 900 ${Math.round(canvas.height*.58)}px Impact, sans-serif`;ctx.fillText(text,512,canvas.height*.52,970);
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}));
}
export function makeEnvironment(renderer){
 const pmrem=new THREE.PMREMGenerator(renderer);const env=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();return env;
}
export function buildRoom(scene,venue='club'){
 const group=new THREE.Group();group.name='room';const night=venue==='night',wood=venue==='workshop';
 scene.background=new THREE.Color(night?'#131f32':'#cad1d2');scene.fog=new THREE.Fog(night?'#17283b':'#d2d9d8',38,78);scene.environmentIntensity=night?.45:.65;
 const floor=material(night?'#27313b':wood?'#8e7461':'#b9c2bd',.87);const wall=material(night?'#263043':'#e5e6de',.9);const frame=material('#364e59',.55,.3),dark=material('#21323a',.7),metal=material('#b0b9b6',.5,.6),orange=material('#e76530',.5);
 cube(group,'floor',[0,-.1,-2],[32,.2,36],floor);
 // Oversized room fixtures retain the scale contrast of a real miniature race.
 const grid=new THREE.GridHelper(32,32,night?0x53606c:0x939f97,night?0x384956:0xa9b6ac);grid.position.set(0,.002,-2);group.add(grid);
 cube(group,'back-wall',[0,2.5,-19],[32,5,.18],wall);cube(group,'left-wall',[-16,2.5,-2],[.18,5,34],wall);
 for(let x=-14;x<=14;x+=7){cube(group,'wall-rib',[x,2.7,-18.84],[.1,4.6,.1],frame);cube(group,'ceiling-light',[x,4.8,-6],[3.7,.05,.13],new THREE.MeshBasicMaterial({color:0xfff9dc}));}
 for(let i=0;i<5;i++){cube(group,'window-frame',[-15.82,3.2,-13+i*6],[.08,1.7,4.2],frame);cube(group,'window',[-15.76,3.2,-13+i*6],[.07,1.5,4],new THREE.MeshBasicMaterial({color:night?'#314972':'#d8ebed'}));}
 const sign=textPlane('ASTRA / MINI 4WD',10,1.4,'#f5ede0');sign.position.set(1,3.35,-18.87);group.add(sign);
 const sub=textPlane('GRAVITY LAB   —   RACING CLUB',9,.35,'#afc1c7');sub.position.set(1,2.35,-18.86);group.add(sub);
 for(const x of [-11,10]){
   cube(group,'workbench',[x,.95,-17],[5,.16,1.1],wood?floor:metal);
   for(const s of [-1,1])cube(group,'table-leg',[x+s*2,.45,-17],[.08,.9,.7],frame);
   for(let i=0;i<3;i++)cube(group,'parts-box',[x-1.3+i*1.2,1.2,-17],[.8,.4,.6],i%2?orange:dark);
 }
 for(let z=-12;z<10;z+=7){cube(group,'storage-unit',[14,.7,z],[1.1,1.4,3],dark);for(let j=0;j<4;j++)cube(group,'tool-drawer',[13.42,.3+j*.29,z],[.035,.025,2.5],metal);}
 const hemi=new THREE.HemisphereLight(night?0xa2c7ee:0xe8f3ff,night?0x253444:0x69735c,night?1:1.4);group.add(hemi);
 const sun=new THREE.DirectionalLight(night?0xd8eaff:0xfff4dc,night?2.1:2.7);sun.position.set(-11,18,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.camera.near=.1;sun.shadow.camera.far=65;sun.shadow.bias=-.0005;sun.shadow.normalBias=.02;group.add(sun);
 if(night){const glow=new THREE.PointLight(0xff723c,50,25,2);glow.position.set(5,5,-8);group.add(glow);}
 scene.add(group);return group;
}

export function buildTrack(scene,course){
 const group=new THREE.Group();group.name='track';const railMat=material('#e2e4dc',.4),under=material('#263940',.55,.2),support=material('#e59646',.48,.45);
 const colors=['#e1ddd1','#315b7a','#d16149','#e1ddd1','#315b7a','#d16149','#e1ddd1','#315b7a'];
 const n=course.base.length;
 for(let lane=0;lane<course.laneCount;lane++){
   const path=course.lanes[lane].path,points=[];
   for(let i=0;i<n;i+=3)points.push(path[i]);
   const next=course.lanes[(lane+1)%course.laneCount].path[0];points.push({...next});
   const road=[],walls=[],base=[],ri=[],wi=[],bi=[];
   for(let i=0;i<points.length;i++){
     const f=points[i];
     for(const x of [-course.width/2,course.width/2]){
       const p=f.p.clone().addScaledVector(f.r,x);road.push(...p.toArray());
       base.push(...p.clone().addScaledVector(f.u,-.023).toArray());
       walls.push(...p.toArray(),...p.clone().addScaledVector(f.u,course.wallHeight).toArray());
     }
     if(i<points.length-1){const k=i*2;ri.push(k,k+2,k+3,k,k+3,k+1);bi.push(k,k+3,k+2,k,k+1,k+3);for(const side of [0,1]){const a=i*4+side*2;wi.push(a,a+1,a+5,a,a+5,a+4);}}
   }
   function add(pos,index,mat,name){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(index);g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.name=name;m.castShadow=true;m.receiveShadow=true;group.add(m);}
   add(road,ri,material(colors[lane],.45),`lane-${lane}-surface`);add(walls,wi,railMat,`lane-${lane}-guide-walls`);add(base,bi,under,`lane-${lane}-underside`);
 }
 const legs=[],bars=[];
 let previousS=-5;
 for(const f of course.base){
   if(f.loop||f.s-previousS<1.7)continue;previousS=f.s;
   const g=new THREE.CylinderGeometry(.034,.045,Math.max(.07,f.p.y-.04),8);g.translate(f.p.x,f.p.y/2-.02,f.p.z);legs.push(g);
   const beam=new THREE.BoxGeometry(course.laneCount*course.width+.09,.04,.065);beam.applyMatrix4(new THREE.Matrix4().makeBasis(f.r,f.u,f.t));beam.translate(f.p.x,f.p.y-.04,f.p.z);bars.push(beam);
 }
 for(const array of [legs,bars])if(array.length){const m=new THREE.Mesh(mergeGeometries(array),support);m.castShadow=true;group.add(m);array.forEach(g=>g.dispose());}
 let loop=[];const loops=[];for(const f of course.base){if(f.loop)loop.push(f);else if(loop.length){loops.push(loop);loop=[];}}if(loop.length)loops.push(loop);
 for(const ring of loops)for(const sign of [-1,1]){
   const pts=ring.filter((_,i)=>i%6===0).map(f=>f.p.clone().addScaledVector(f.r,sign*(course.laneCount*course.width/2+.045)).addScaledVector(f.u,-.055));tube(group,pts,.025,support);
 }
 const start=course.sample(0,.35);const stripe=new THREE.Group();stripe.position.copy(start.p).addScaledVector(start.r,(course.laneCount-1)*course.width/2);stripe.quaternion.copy(start.q);
 for(let i=0;i<course.laneCount*4;i++)for(let z=0;z<2;z++)cube(stripe,'checker',[((i+.5)/(course.laneCount*4)-.5)*course.width*course.laneCount,.002,(z-.5)*.045],[.0288,.003,.045],new THREE.MeshBasicMaterial({color:(i+z)%2?0x152731:0xf8f6e8}));
 group.add(stripe);
 const arch=new THREE.Group();arch.position.copy(stripe.position).addScaledVector(start.t,-.16);arch.quaternion.copy(start.q);for(const s of [-1,1])cube(arch,'gantry-upright',[s*(course.laneCount*.115/2+.06),.23,0],[.035,.46,.05],under);cube(arch,'gantry-crossbar',[0,.47,0],[course.laneCount*.115+.17,.08,.05],under);const label=textPlane('START / FINISH',course.laneCount*.115,.075,'#ffc979');label.position.set(0,.47,.029);arch.add(label);group.add(arch);
 scene.add(group);return group;
}

export function optimizeCar(root){
 root.updateMatrixWorld(true);
 for(const part of Object.values(root.userData.parts) as THREE.Group[]){
   const collected=[];part.traverse((o:any)=>{if(o.isMesh&&o.visible)collected.push(o);});
   const inverse=new THREE.Matrix4().copy(part.matrixWorld).invert(),opaque=new Map(),decals=[];
   for(const m of collected){
     if(m.material.map||m.material.transparent){continue;}
     const geometry=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone());geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,m.matrixWorld));geometry.deleteAttribute('uv');
     if(m.userData.paintRegion){
       const n=geometry.getAttribute('position').count,c=m.material.color,colors=new Float32Array(n*3);for(let i=0;i<n;i++)colors.set([c.r,c.g,c.b],i*3);geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));decals.push({g:geometry,order:m.renderOrder});
     }else{
       const k=[m.material.color.getHex(),m.material.roughness,m.material.metalness,m.material.clearcoat].join('/');if(!opaque.has(k))opaque.set(k,{geoms:[],material:m.material});opaque.get(k).geoms.push(geometry);
     }
     m.visible=false;
   }
   for(const {geoms,material} of opaque.values()){const m=new THREE.Mesh(mergeGeometries(geoms),material);m.name=part.name+'-batched';m.castShadow=true;m.receiveShadow=true;m.userData.part=part.name;part.add(m);geoms.forEach(g=>g.dispose());}
   if(decals.length){decals.sort((a,b)=>a.order-b.order);const m=new THREE.Mesh(mergeGeometries(decals.map(d=>d.g)),new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.37,clearcoat:.3,clearcoatRoughness:.32,envMapIntensity:.72,side:THREE.DoubleSide,depthWrite:false}));m.name=part.name+'-livery';m.renderOrder=10;m.userData.part=part.name;part.add(m);decals.forEach(d=>d.g.dispose());}
 }
 return root;
}
