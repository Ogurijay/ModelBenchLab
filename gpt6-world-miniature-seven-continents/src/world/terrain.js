import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { layout, paths, GROUND_Y, ROAD_Y, zoneAt, onPath, landmarks,byId,viewpoints } from './coords.js';
import { kit, material, batch } from './kit.js';

function shapeOf(polygon) {
  const s=new THREE.Shape(); polygon.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z)); s.closePath(); return s;
}
export function buildTerrain(scene) {
  const root=new THREE.Group();root.name='seven-continents';
  const colors={'north-america':'#8eaa72','south-america':'#6e9369',europe:'#9bad80',africa:'#c7a774',asia:'#86a475',oceania:'#b7a47f',antarctica:'#e1edeb'};
  for(const zone of layout.zones) {
    const geo=new THREE.ExtrudeGeometry(shapeOf(zone.polygon),{depth:3.8,bevelEnabled:false,curveSegments:12});
    geo.rotateX(-Math.PI/2);
    const land=new THREE.Mesh(geo,[material(colors[zone.id]),material(zone.id==='antarctica'?'#a0c4ce':'#a8a287')]);
    land.position.y=GROUND_Y-3.8;land.receiveShadow=true;land.castShadow=true;land.userData.ground=true;land.name=zone.id;root.add(land);
    // A narrow pale shoreline ties the miniature landforms into the same park.
    const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(zone.polygon.map(([x,z])=>new THREE.Vector3(x,GROUND_Y+.02,z))),new THREE.LineBasicMaterial({color:zone.id==='antarctica'?'#f0fbf7':'#c9c7a2'}));root.add(line);
  }
  const road=new THREE.Group();
  const roadMat=material('#e1d8b9'),edgeMat=material('#aaa68b'), pierMat=material('#a5a38d');
  function roadSegment(a,b,width) {
    const len=Math.hypot(b[0]-a[0],b[1]-a[1]),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,angle=Math.atan2(b[0]-a[0],b[1]-a[1]);
    for(const [w,h,y,mat] of [[width+.45,.25,ROAD_Y-.19,edgeMat],[width,.12,ROAD_Y-.06,roadMat]]) {
      const m=kit.box(road,w,h,len+.12,mat,x,y,z);m.rotation.y=angle;
    }
    // Every across-water span has physical supports and a protective rail.
    for(let dist=0;dist<len;dist+=9) {
      const t=(dist+2)/len,px=a[0]+(b[0]-a[0])*Math.min(1,t),pz=a[1]+(b[1]-a[1])*Math.min(1,t);
      if(!zoneAt(px,pz)) {
        kit.cylinder(road,.32,.4,4.9,pierMat,px,-1.12,pz,8);
        const nx=Math.cos(angle),nz=-Math.sin(angle);
        for(const sign of [-1,1]) {
          const fx=px+nx*(width/2-.13)*sign,fz=pz+nz*(width/2-.13)*sign;
          kit.cylinder(road,.045,.045,1.02,pierMat,fx,ROAD_Y+.5,fz,5);
        }
      }
    }
    if(!zoneAt(x,z)) for(const sign of [-1,1]) {
      const nx=Math.cos(angle)*(width/2-.13)*sign,nz=-Math.sin(angle)*(width/2-.13)*sign;
      kit.beam(road,[a[0]+nx,ROAD_Y+1,a[1]+nz],[b[0]+nx,ROAD_Y+1,b[1]+nz],.035,pierMat,5);
    }
    kit.cylinder(road,width/2,width/2,.12,roadMat,a[0],ROAD_Y-.06,a[1],12);
  }
  paths.forEach(p=>p.points.slice(1).forEach((b,i)=>roadSegment(p.points[i],b,p.width)));
  root.add(batch(road));
  const ramps=new THREE.Group();
  for(const [id,axis,length,top]of [['02','z',8,GROUND_Y+2.8],['09','x',7,GROUND_Y+2.325]])for(const sign of [-1,1]) {
    const l=byId[id],half=(axis==='z'?l.depth:l.width)/2;
    const a=new THREE.Vector3(l.x,ROAD_Y-.1,l.z),b=new THREE.Vector3(l.x,top-.1,l.z);
    a[axis]+=sign*(half+length);b[axis]+=sign*half;
    const delta=b.clone().sub(a),slab=kit.box(ramps,axis==='z'?5.2:4.5,.2,delta.length(),material('#b3aa91'),(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
    slab.rotation.set(-Math.atan2(delta.y,length),Math.atan2(delta.x,delta.z),0,'YXZ');
    const normal=new THREE.Vector3(delta.z,0,-delta.x).normalize();
    for(const side of [-1,1]) {
      const offset=(axis==='z'?2.45:2.1)*side;
      kit.beam(ramps,a.clone().addScaledVector(normal,offset).add(new THREE.Vector3(0,.9,0)).toArray(),b.clone().addScaledVector(normal,offset).add(new THREE.Vector3(0,.9,0)).toArray(),.045,material('#8b927b'));
      for(let i=0;i<=4;i++){const p=a.clone().lerp(b,i/4).addScaledVector(normal,offset);kit.cylinder(ramps,.055,.055,.9,material('#8b927b'),p.x,p.y+.45,p.z,6);}
    }
  }root.add(batch(ramps));
  const overlooks=new THREE.Group();
  for(const p of viewpoints){
    kit.cylinder(overlooks,p.radius,p.radius,3.9,material('#a4a38d'),p.x,ROAD_Y-1.95,p.z,40);
    kit.cylinder(overlooks,p.radius-.25,p.radius-.25,.08,material('#e5dcc3'),p.x,ROAD_Y-.04,p.z,40);
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7,x=p.x+Math.cos(a)*(p.radius-1.1),z=p.z+Math.sin(a)*(p.radius-1.1);if(onPath(x,z,.8))continue;
      const seat=kit.box(overlooks,1.7,.13,.5,material('#9a8666'),x,ROAD_Y+.48,z);seat.rotation.y=-a;
      for(const s of[-1,1])kit.box(overlooks,.12,.42,.35,material('#637466'),x+s*.55,ROAD_Y+.21,z);
    }
  }root.add(batch(overlooks));
  const plaza=new THREE.Group();const [ex,ez]=layout.entrance;
  kit.cylinder(plaza,11,11,1.1,edgeMat,ex,.65,ez,40);
  kit.cylinder(plaza,9.8,9.8,.1,roadMat,ex,1.25,ez,40);
  kit.cylinder(plaza,3,3,.7,material('#c9c8b5'),ex,1.7,ez,32);
  kit.cylinder(plaza,2.65,2.65,.06,material('#67b3b5',{roughness:.2,metalness:.25}),ex,2.08,ez,32);
  kit.cylinder(plaza,.4,.7,2.2,material('#ad9976'),ex,2.6,ez,16);
  kit.sphere(plaza,1.2,material('#978561',{metalness:.65,roughness:.32}),ex,4.2,ez);
  for(let i=-1;i<=1;i++) {
    const px=ex+i*4;kit.box(plaza,.7,5,.8,material('#b8b59c'),px,3.8,ez-8);
  }
  kit.box(plaza,11,.8,1.2,material('#e5ddbf'),ex,6.1,ez-8);root.add(batch(plaza));
  scene.add(root);
  const waterShader={...Reflector.ReflectorShader,
    uniforms:{...THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms),time:{value:0},farColor:{value:new THREE.Color('#f4dcb6')}},
    vertexShader:'varying vec3 waterWorldPosition;\n'+Reflector.ReflectorShader.vertexShader.replace('vUv = textureMatrix * vec4( position, 1.0 );','vUv = textureMatrix * vec4( position, 1.0 ); waterWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;'),
    fragmentShader:Reflector.ReflectorShader.fragmentShader
      .replace('uniform vec3 color;','uniform vec3 color; uniform float time; uniform vec3 farColor; varying vec3 waterWorldPosition;')
      .replace('vec4 base = texture2DProj( tDiffuse, vUv );','vec2 uv = vUv.xy / vUv.w; uv += vec2(sin(uv.y*280.0+time*0.45),cos(uv.x*220.0-time*0.3))*0.0007; vec4 base = texture2D( tDiffuse, uv );')
      .replace('vec4( blendOverlay( base.rgb, color ), 1.0 )','vec4(mix(mix(color,base.rgb,0.13),farColor,smoothstep(750.0,1900.0,length(waterWorldPosition-cameraPosition))),1.0)')};
  const sea=new Reflector(new THREE.PlaneGeometry(18000,18000),{color:'#0e6470',textureWidth:1024,textureHeight:1024,clipBias:.003,multisample:0,shader:waterShader});
  sea.rotation.x=-Math.PI/2;sea.position.y=-.02;sea.name='water';scene.add(sea);
  const taj=byId['14'];
  const pool=new Reflector(new THREE.PlaneGeometry(2.9,17.7),{color:'#79a7ab',textureWidth:512,textureHeight:1024,clipBias:.003,multisample:0});
  pool.rotation.x=-Math.PI/2;pool.position.set(taj.x,GROUND_Y+.321,taj.z+21.5);pool.name='reflecting-pool';pool.visible=false;scene.add(pool);
  const seaPass=sea.onBeforeRender,poolPass=pool.onBeforeRender;
  sea.onBeforeRender=function(...args){const wasVisible=pool.visible;pool.visible=false;try{seaPass.apply(this,args);}finally{pool.visible=wasVisible;}};
  pool.onBeforeRender=function(...args){const wasVisible=sea.visible;sea.visible=false;try{poolPass.apply(this,args);}finally{sea.visible=wasVisible;}};
  const waves=new THREE.Group(),wavePoints=[];
  for(let j=0;j<95;j++) {
    const x=Math.sin(j*7.23)*330,z=Math.cos(j*5.76)*245;
    if(zoneAt(x,z))continue;
    const points=Array.from({length:14},(_,i)=>new THREE.Vector3(x+i*2,.045,z+Math.sin(i*.6+j)*.55));
    for(let i=1;i<points.length;i++)wavePoints.push(points[i-1],points[i]);
  }
  waves.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wavePoints),new THREE.LineBasicMaterial({color:'#c3e5da',transparent:true,opacity:.15})));scene.add(waves);
  return {root,sea,waves,pool};
}

function random(seed=982451653) {return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function buildLandscape(scene) {
  const rand=random(), trees=[],rocks=[];
  for(let i=0;i<14000 && trees.length<1200;i++) {
    const x=rand()*420-210,z=rand()*310-155,zone=zoneAt(x,z);
    if(!zone||zone.id==='antarctica'||onPath(x,z,3.5)) continue;
    if(landmarks.some(l=>Math.abs(l.x-x)<l.width/2+5&&(l.id==='14'?z>l.z-l.depth/2-6&&z<l.z+37:Math.abs(l.z-z)<l.depth/2+6)))continue;
    if(zone.id==='africa'&&rand()>.23)continue;
    const t=rand(),kind=['asia','south-america','oceania'].includes(zone.id)&&t>.76?'palm':['asia','europe'].includes(zone.id)&&t<.2?'cypress':t<.3?'shrub':'broadleaf';
    trees.push({x,z,zone:zone.id,size:2.8+rand()*3.5,t,kind});
  }
  const trunkGeo=new THREE.CylinderGeometry(.17,.28,1,6);
  let crownGeo=new THREE.IcosahedronGeometry(1,3);crownGeo.deleteAttribute('normal');crownGeo.deleteAttribute('uv');crownGeo=mergeVertices(crownGeo);
  const cp=crownGeo.attributes.position;
  for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),r=1+.13*Math.sin(x*11+z*7)*Math.cos(y*13-z*5);cp.setXYZ(i,x*r,y*r,z*r);}crownGeo.computeVertexNormals();
  const trunks=new THREE.InstancedMesh(trunkGeo,material('#796a50'),trees.length), crowns=new THREE.InstancedMesh(crownGeo,material('#57794d'),trees.length);
  const dummy=new THREE.Object3D(),color=new THREE.Color(),palms=[];
  trees.forEach((t,i)=>{
    const palm=t.kind==='palm';
    dummy.position.set(t.x,GROUND_Y+t.size*(palm?.55:.29),t.z);dummy.scale.set(palm?.85:1,t.size*(palm?1.1:.58),palm?.85:1);dummy.rotation.set(0,0,0);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    dummy.position.y=GROUND_Y+t.size*.71;dummy.rotation.set(t.t,.3+t.t,0);dummy.scale.set(t.size*.44,t.size*.49,t.size*.43);
    if(t.zone==='africa')dummy.scale.set(t.size*.7,t.size*.19,t.size*.6);
    if(t.kind==='cypress'){dummy.position.y=GROUND_Y+t.size*.85;dummy.scale.set(t.size*.18,t.size*.72,t.size*.18);}
    if(t.kind==='shrub'){dummy.position.y=GROUND_Y+t.size*.35;dummy.scale.set(t.size*.43,t.size*.3,t.size*.4);}
    if(palm){palms.push(t);dummy.scale.setScalar(0);}
    dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
    color.setHSL(.22+t.t*.075,.14+t.t*.13,.3+t.t*.14);crowns.setColorAt(i,color);
  });
  trunks.castShadow=true;crowns.castShadow=true;crowns.receiveShadow=true;scene.add(trunks,crowns);
  const leafPositions=[],leafIndices=[];
  for(let i=0;i<=9;i++){const t=i/9,x=t*2.6,y=Math.sin(t*Math.PI)*.55-t*t*.6,w=Math.sin(Math.PI*t)*.3;leafPositions.push(x,y,-w,x,y+.025,0,x,y,w);if(i<9){const a=i*3,b=a+3;leafIndices.push(a,b,a+1,b,b+1,a+1,a+1,b+1,a+2,b+1,b+2,a+2);}}
  const leafGeo=new THREE.BufferGeometry();leafGeo.setAttribute('position',new THREE.Float32BufferAttribute(leafPositions,3));leafGeo.setIndex(leafIndices);leafGeo.computeVertexNormals();
  const fronds=new THREE.InstancedMesh(leafGeo,material('#5f7e4b',{side:THREE.DoubleSide}),palms.length*8);
  palms.forEach((t,i)=>{for(let n=0;n<8;n++){dummy.position.set(t.x,GROUND_Y+t.size*1.1,t.z);dummy.rotation.set(0,n*Math.PI/4+t.t*5,(n%2)*.12);dummy.scale.setScalar(t.size*.25);dummy.updateMatrix();fronds.setMatrixAt(i*8+n,dummy.matrix);}});fronds.castShadow=true;scene.add(fronds);
  // Irregular waterline stones soften the diagram-like outline without moving
  // the authoritative land polygon used by walking and route planning.
  const stones=[];
  for(const zone of layout.zones)for(let i=0;i<zone.polygon.length;i++) {
    const a=zone.polygon[i],b=zone.polygon[(i+1)%zone.polygon.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let n=0;n<length;n+=2.4){const t=n/length,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;if(onPath(x,z,2))continue;stones.push({x,z,size:.7+rand()*.9,polar:zone.id==='antarctica',t:rand()});}
  }
  const stoneMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),material('#aaa998'),stones.length);
  stones.forEach((s,i)=>{dummy.position.set(s.x,.45,s.z);dummy.rotation.set(s.t,s.t*6,s.t*.4);dummy.scale.set(s.size,s.size*.65,s.size*.83);dummy.updateMatrix();stoneMesh.setMatrixAt(i,dummy.matrix);stoneMesh.setColorAt(i,color.set(s.polar?'#d7e9ec':s.t>.5?'#b8b7a0':'#929b84'));});stoneMesh.castShadow=true;stoneMesh.receiveShadow=true;scene.add(stoneMesh);
  const lamps=new THREE.Group(), lampsGlow=[];
  let count=0;
  for(const p of paths)for(let j=1;j<p.points.length;j++) {
    const a=p.points[j-1],b=p.points[j],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let k=4;k<length;k+=20) {
      const t=k/length,nx=(b[1]-a[1])/length,nz=-(b[0]-a[0])/length,x=a[0]+(b[0]-a[0])*t+nx*(p.width/2+.35),z=a[1]+(b[1]-a[1])*t+nz*(p.width/2+.35);
      kit.cylinder(lamps,.08,.12,3.1,material('#5f7061'),x,ROAD_Y+1.55,z,6);
      const glow=kit.sphere(lamps,.32,material('#eee4c5',{emissive:'#ffc878',emissiveIntensity:0}),x,ROAD_Y+3.2,z);lampsGlow.push(glow.material);count++;
    }
  }
  scene.add(batch(lamps));
  const garden=new THREE.Group(),taj=byId['14'];
  for(const side of[-1,1])for(const offset of[17,25]){
    const x=taj.x+side*10.2,z=taj.z+offset;
    kit.box(garden,4.8,.18,5.8,material('#cec7ab'),x,GROUND_Y+.2,z);
    kit.box(garden,4.45,.2,5.45,material('#667c4c'),x,GROUND_Y+.29,z);
    for(let j=0;j<24;j++){const fx=x+(j%4-1.5)*.91,fz=z+(Math.floor(j/4)-2.5)*.78;kit.sphere(garden,.15+rand()*.08,material(j%3?'#c78e91':'#e6d9a7'),fx,GROUND_Y+.48+rand()*.12,fz,1,.65,1);}
  }
  for(const z of[14.6,21.5,28.4])for(let i=0;i<6;i++){
    const a=i*Math.PI/3,points=[];
    for(let j=0;j<=12;j++){const t=j/12;points.push(new THREE.Vector3(taj.x+Math.cos(a)*t*.55,GROUND_Y+.48+Math.sin(t*Math.PI)*1.0,taj.z+z+Math.sin(a)*t*.55));}
    kit.mesh(garden,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),14,.018,4,false),material('#d7eef0',{roughness:.15,transparent:true,opacity:.72}));
  }
  scene.add(batch(garden));
  // Small park visitors give the architecture an explicit human scale.
  const people=new THREE.Group();
  for(let i=0;i<100;i++) {
    const p=paths[Math.floor(rand()*paths.length)].points,j=Math.floor(rand()*(p.length-1)),t=rand();
    const x=p[j][0]+(p[j+1][0]-p[j][0])*t,z=p[j][1]+(p[j+1][1]-p[j][1])*t;
    if(landmarks.some(l=>Math.abs(x-l.x)<l.width/2&&Math.abs(z-l.z)<l.depth/2))continue;
    const shirt=material(['#cbba92','#a9b7b2','#8e6856','#e2d2b0','#586c70'][i%5]);
    kit.cylinder(people,.19,.24,.68,shirt,x,ROAD_Y+.9,z,6);
    kit.sphere(people,.18,material('#b99a78'),x,ROAD_Y+1.45,z);
    for(const s of [-1,1])kit.box(people,.12,.52,.15,material('#505e56'),x+s*.12,ROAD_Y+.27,z);
  }scene.add(batch(people));
  return {trees:trees.length,lamps:count,lampsGlow:[...new Set(lampsGlow)]};
}

export function buildRailway(scene) {
  const pts=layout.railwayReserved.map(([x,z])=>new THREE.Vector3(x,2.3,z));
  // A rounded rail path replaces sharp diagram corners.
  const curve=new THREE.CatmullRomCurve3(pts.slice(0,-1),true,'centripetal');
  const g=new THREE.Group(),rail=material('#766b51'),wood=material('#998f71');
  const length=curve.getLength();
  const samples=curve.getSpacedPoints(Math.ceil(length/2));
  for(let i=0;i<samples.length-1;i++) {
    const a=samples[i],b=samples[i+1],dir=b.clone().sub(a).normalize(),n=new THREE.Vector3(dir.z,0,-dir.x);
    for(const sign of [-1,1])kit.beam(g,a.clone().addScaledVector(n,sign*.65).toArray(),b.clone().addScaledVector(n,sign*.65).toArray(),.065,rail);
    if(i%2===0) {const sleeper=kit.box(g,2.1,.12,.25,wood,a.x,a.y-.16,a.z);sleeper.rotation.y=Math.atan2(dir.x,dir.z);}
    if(i%7===0)kit.cylinder(g,.22,.35,5.1,wood,a.x,-.45,a.z,8);
  }
  scene.add(batch(g));
  const train=new THREE.Group();
  const cars=[];
  for(let i=0;i<4;i++) {
    const car=new THREE.Group(),cream=material('#e4d7b2'),green=material(i?'#526d5b':'#9c5845');
    kit.box(car,2.2,.5,4.2,green,0,.65,0);kit.box(car,2.1,.25,4.3,cream,0,2.9,0);
    for(const s of [-1,1])for(const z of [-1.6,1.6]) {kit.cylinder(car,.05,.05,2.1,cream,s,1.75,z,6);const wheel=kit.cylinder(car,.4,.4,.2,material('#394d46'),s*1.15,.4,z*.75,12);wheel.rotation.z=Math.PI/2;}
    if(i===0){kit.box(car,1.8,1.7,1.5,green,0,1.7,.9);kit.cylinder(car,.6,.6,2.6,green,0,1.5,-1,16).rotation.x=Math.PI/2;kit.cylinder(car,.22,.25,.9,material('#2a4138'),0,2.4,-1.6,10);}
    else for(const z of [-1,1])kit.box(car,1.8,.3,.7,material('#b7a482'),0,1.3,z);
    cars.push(batch(car));scene.add(cars.at(-1));
  }
  return {length,update(time){cars.forEach((car,i)=>{const u=((time*3-i*5.3)%length+length)%length/length,p=curve.getPointAt(u),t=curve.getTangentAt(u);car.position.copy(p);car.rotation.y=Math.atan2(t.x,t.z);});}};
}
