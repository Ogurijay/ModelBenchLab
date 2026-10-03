import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildVehicleLights } from './vehicle-lights.js';

import { VEHICLE_PROFILES } from "./vehicle-profiles.js";
export { VEHICLE_PROFILES } from "./vehicle-profiles.js";

const bindings = new WeakMap();
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;

function reverseWinding(geometry) {
  const index=geometry.index?.array || Uint32Array.from({length:geometry.attributes.position.count},(_,i)=>i);
  for(let i=0;i<index.length;i+=3){const b=index[i+1];index[i+1]=index[i+2];index[i+2]=b;}
  geometry.setIndex(new T.BufferAttribute(index,1));
}

function polygon(points) {
  const g=new T.BufferGeometry(),index=[];
  for(let i=1;i<points.length-1;i++)index.push(0,i,i+1);
  g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));
  g.setIndex(index);g.computeVertexNormals();return g;
}

function sideGeometry(profile,points,side,thickness=.042) {
  const shape=new T.Shape(points.map(([z,y])=>new T.Vector2(z,y)));
  const geometry=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,steps:1,curveSegments:1});
  const pos=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<pos.count;i++){
    const z=pos.getX(i),y=pos.getY(i),depth=pos.getZ(i);
    const lower=.030*clamp((.58-y)/.37,0,1),upper=.016*clamp((y-profile.deck+.15)/.15,0,1);
    pos.setXYZ(i,side*(halfWidth(profile,z)-lower-upper-thickness+depth),y,z);
    uv.setXY(i,(z+profile.length/2)/profile.length,y/profile.deck);
  }
  if(side>0)reverseWinding(geometry);
  geometry.computeVertexNormals();return geometry;
}

function halfWidth(p,z) {
  const end=Math.abs(z)/(p.length*.5);
  const t=clamp((end-.65)/.35,0,1),taper=p.panda?t:t*t*(3-2*t);
  return p.width*.5*(1-taper*(p.van?.035:p.chrome?.045:.075));
}

function deckHeight(p,z) {
  if(z>p.glassFront)return lerp(p.deck,p.nose,clamp((z-p.glassFront)/(p.length*.5-p.glassFront),0,1));
  if(z<p.glassRear)return lerp(p.deck,p.tail,clamp((p.glassRear-z)/(p.length*.5+p.glassRear),0,1));
  return p.deck;
}

// Static pieces are welded by material, instead of paying one draw call per seam/spoke.
class Parts {
  constructor(root){this.root=root;this.meshes=[];this.segments=[];}
  add(geometry,material,x=0,y=0,z=0,rotation=null){
    const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);
    if(rotation)mesh.rotation.set(...rotation);
    this.meshes.push(mesh);return mesh;
  }
  box(material,w,h,d,x=0,y=0,z=0){return this.add(new T.BoxGeometry(w,h,d),material,x,y,z);}
  face(material,points){return this.add(polygon(points),material);}
  line(points,closed=false){
    for(let i=1;i<points.length;i++)this.segments.push(...points[i-1],...points[i]);
    if(closed)this.segments.push(...points.at(-1),...points[0]);
  }
  finish(ink,vertexPaint,vertexLamp){
    const batches=new Map();
    for(const mesh of this.meshes){
      mesh.updateMatrix();const geometry=mesh.geometry;
      geometry.applyMatrix4(mesh.matrix);
      if(!geometry.attributes.uv)geometry.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
      let material=mesh.material;
      // Bake flat paint/chrome/rubber colours into the vertices. Dozens of colour
      // variants then share one toon draw; mapped decals and glass stay separate.
      const merged=material.isMeshToonMaterial&&!material.map?vertexPaint:material.isMeshBasicMaterial&&!material.map&&!material.transparent?vertexLamp:null;
      if(merged){
        const colours=new Float32Array(geometry.attributes.position.count*3),c=material.color;
        for(let i=0;i<colours.length;i+=3){colours[i]=c.r;colours[i+1]=c.g;colours[i+2]=c.b;}
        geometry.setAttribute('color',new T.BufferAttribute(colours,3));material=merged;
      }
      if(!batches.has(material))batches.set(material,[]);
      // One index convention for every primitive (ExtrudeGeometry is non-indexed).
      const flat=geometry.index?geometry.toNonIndexed():geometry;
      if(flat!==geometry)geometry.dispose();
      batches.get(material).push(flat);
    }
    for(const [material,geometries] of batches){
      const geometry=mergeGeometries(geometries,false);
      if(!geometry)throw new Error('Vehicle geometry attributes do not match');
      geometry.computeBoundingSphere();
      const mesh=new T.Mesh(geometry,material);mesh.name='batch:'+material.name;this.root.add(mesh);
      geometries.forEach(g=>g.dispose());
    }
    if(this.segments.length){
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(this.segments,3));
      this.root.add(new T.LineSegments(geometry,ink));
    }
  }
}

export class VehicleModelFactory {
  constructor(gradient=null){
    this.gradient=gradient||new T.DataTexture(new Uint8Array([62,155,255]),3,1,T.RedFormat);
    this.gradient.minFilter=T.NearestFilter;this.gradient.magFilter=T.NearestFilter;this.gradient.needsUpdate=true;
    this.materials=new Map();this.wheelCache=new Map();this.textureCache=new Map();
    this.vertexPaint=new T.MeshToonMaterial({gradientMap:this.gradient,vertexColors:true,side:T.DoubleSide});
    this.vertexPaint.name='vertex-paint';
    this.vertexLamp=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
    this.vertexLamp.name='vertex-lamps';
    this.ink=new T.LineBasicMaterial({color:'#10151b'});
    this.glass=new T.MeshPhongMaterial({color:'#526873',specular:'#afdbec',shininess:110,transparent:true,opacity:.53,depthWrite:false,side:T.DoubleSide});
    this.glass.name='glass';
    this.glass.forceSinglePass=true;
    this.shine=new T.MeshBasicMaterial({color:'#b0d8e5',transparent:true,opacity:.23,depthWrite:false,side:T.DoubleSide});
    this.shine.name='glass-reflection';
    this.shine.forceSinglePass=true;
  }
  mat(color,unlit=false){
    const key=color+(unlit?':unlit':':toon');
    if(!this.materials.has(key)){
      const mat=unlit?new T.MeshBasicMaterial({color,side:T.DoubleSide}):new T.MeshToonMaterial({color,gradientMap:this.gradient,side:T.DoubleSide});
      mat.name=key;this.materials.set(key,mat);
    }
    return this.materials.get(key);
  }
  sidePaint(car,p){
    if(!p.panda)return this.mat(car.color);
    const key='panda:'+car.color;
    if(!this.materials.has(key)){
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=256;
      const ctx=canvas.getContext('2d');ctx.fillStyle=car.color;ctx.fillRect(0,0,64,256);
      ctx.fillStyle='#20272b';ctx.fillRect(0,Math.round((1-.605/p.deck)*256),64,256);
      ctx.fillRect(0,Math.round((1-.704/p.deck)*256),64,9);
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
      texture.magFilter=T.NearestFilter;
      const mat=new T.MeshToonMaterial({map:texture,gradientMap:this.gradient,side:T.DoubleSide});
      mat.name=key;this.materials.set(key,mat);
    }
    return this.materials.get(key);
  }
  decal(key,draw,width=1024,height=256,transparent=true){
    if(!this.textureCache.has(key)){
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      draw(canvas.getContext('2d'),width,height);
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
      const material=new T.MeshBasicMaterial({map:texture,transparent,alphaTest:transparent?.025:0,depthWrite:!transparent,side:T.DoubleSide});
      material.name='decal:'+key;this.textureCache.set(key,material);
    }
    return this.textureCache.get(key);
  }
  wheel(p){
    const key=[p.radius,p.tire,p.rim].join(':');
    if(this.wheelCache.has(key))return this.wheelCache.get(key).clone();
    const spin=new T.Group();spin.name='wheel-spin';const parts=new Parts(spin),r=p.radius,w=p.tire;
    const tireProfile=[[r*.67,-w*.5],[r*.86,-w*.5],[r*.97,-w*.40],[r,-w*.27],[r,w*.27],[r*.97,w*.40],[r*.86,w*.5],[r*.67,w*.5],[r*.67,-w*.5]];
    const tire=new T.LatheGeometry(tireProfile.map(v=>new T.Vector2(...v)),24);
    tire.rotateZ(Math.PI/2);parts.add(tire,this.mat('#111820'));
    const count=p.rim==='eight'?8:p.rim==='six'?6:5;
    const metal=this.mat(p.rim==='white'?'#d3d7d4':p.rim==='eight'?'#43484d':'#a5aeb2');
    for(const side of [-1,1]){
      const outer=side*(w*.5+.006);
      const disc=new T.CylinderGeometry(r*.59,r*.59,.012,20);
      disc.rotateZ(Math.PI/2);parts.add(disc,this.mat('#4d565c'),side*w*.30);
      const lip=new T.TorusGeometry(r*.685,.011,5,24);lip.rotateY(Math.PI/2);
      parts.add(lip,this.mat('#a3acb1'),outer);
      const innerLip=new T.RingGeometry(r*.61,r*.66,24);innerLip.rotateY(side*Math.PI/2);
      parts.add(innerLip,metal,outer);
      if(p.rim==='steel'){
        const rim=new T.CylinderGeometry(r*.63,r*.63,.012,20);rim.rotateZ(Math.PI/2);parts.add(rim,metal,outer-side*.007);
        for(let i=0;i<8;i++){
          const a=i*Math.PI/4,vent=new T.CircleGeometry(r*.075,8);vent.rotateY(side*Math.PI/2);
          parts.add(vent,this.mat('#252c31'),outer+side*.012,Math.cos(a)*r*.43,Math.sin(a)*r*.43);
        }
      }else{
        for(let i=0;i<count;i++){
          const a=i*Math.PI*2/count,spoke=parts.box(metal,p.rim==='eight'?.039:.026,r*.49,p.rim==='luxury'?.085:p.rim==='eight'?.066:.042,outer-side*.024,Math.cos(a)*r*.36,Math.sin(a)*r*.36);
          spoke.rotation.x=a;
        }
      }
      const hub=new T.CylinderGeometry(r*.16,r*.18,.035,16);hub.rotateZ(Math.PI/2);parts.add(hub,metal,outer);
      const cap=new T.CircleGeometry(r*.09,12);cap.rotateY(side*Math.PI/2);parts.add(cap,this.mat('#232c34'),outer+side*.022);
      for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5,bolt=new T.CylinderGeometry(.009,.009,.012,6);bolt.rotateZ(Math.PI/2);
        parts.add(bolt,this.mat('#cbd2d1'),outer+side*.019,Math.cos(a)*r*.12,Math.sin(a)*r*.12);
      }
      // A sidewall bead leaves a readable separation between the rim and the rubber.
      const bead=new T.TorusGeometry(r*.87,.005,4,24);bead.rotateY(Math.PI/2);
      parts.add(bead,this.mat('#222b32'),side*w*.495);
    }
    parts.finish(this.ink,this.vertexPaint,this.vertexLamp);this.wheelCache.set(key,spin);return spin.clone();
  }
  create(car){return buildVehicle(this,car);}
}

function archBoundary(p,bottom) {
  const points=[[-p.length/2,bottom]],r=p.radius+.045,cy=p.radius+.012;
  for(const z of [-p.wheelbase/2,p.wheelbase/2]){
    const delta=Math.asin(clamp((cy-bottom)/r,-.95,.95));
    for(let i=0;i<=18;i++){
      const a=lerp(Math.PI+delta,-delta,i/18);
      points.push([z+Math.cos(a)*r,cy+Math.sin(a)*r]);
    }
  }
  points.push([p.length/2,bottom]);return points;
}

function buildShell(factory,parts,p,paint,car) {
  const hingeZ=p.length/2-.68,lampWidth=car.id==='fc'?.465:.45;
  const stations=[-p.length/2,-p.length*.40,-p.wheelbase/2,p.glassRear,p.glassFront,p.wheelbase/2,p.length*.40,p.length/2,...(p.popup?[hingeZ,hingeZ+.46]:[])].sort((a,b)=>a-b);
  const top=stations.map(z=>[z,deckHeight(p,z)-.055]);
  for(const side of [-1,1]){
    // The lower boundary goes around both tires: there is no cuboid behind the wheel openings.
    const outline=[...archBoundary(p,.21),...top.toReversed()];
    parts.add(sideGeometry(p,outline,side),factory.sidePaint(car,p));
    for(const axle of [-p.wheelbase/2,p.wheelbase/2]){
      const r=p.radius+.045,cy=p.radius+.012,delta=Math.asin((cy-.21)/r);
      const seam=[];
      for(let i=0;i<18;i++){
        const a=lerp(Math.PI+delta,-delta,i/18),b=lerp(Math.PI+delta,-delta,(i+1)/18);
        const vertex=(angle,radius)=>{const z=axle+Math.cos(angle)*radius;return [side*(halfWidth(p,z)+.004),cy+Math.sin(angle)*radius,z];};
        parts.face(p.panda?factory.mat('#20272b'):paint,[vertex(a,r),vertex(b,r),vertex(b,r+.018),vertex(a,r+.018)]);
        seam.push(vertex(a,r));
      }
      seam.push([side*(halfWidth(p,axle+r)+.005),cy+Math.sin(-delta)*r,axle+Math.cos(delta)*r]);
      parts.line(seam);
    }
    parts.line(top.map(([z,y])=>[side*(halfWidth(p,z)+.002),y,z]));
    // A sill exists between the wheel openings, not across the tires.
    parts.box(p.panda?factory.mat('#20272b'):paint,.065,.11,p.wheelbase-p.radius*2-.14,side*(p.width*.5-.022),.25,0);
  }
  for(let i=1;i<stations.length;i++){
    const z0=stations[i-1],z1=stations[i],h0=deckHeight(p,z0),h1=deckHeight(p,z1),w0=halfWidth(p,z0),w1=halfWidth(p,z1);
    if(p.popup&&z0>=hingeZ-.001&&z1<=hingeZ+.461){
      const x=p.width*.305,r=lampWidth/2+.008;
      for(const [left,right] of [[-w0*.93,-x-r],[-x+r,x-r],[x+r,w0*.93]])
        parts.face(paint,[[left,h0,z0],[right,h0,z0],[Math.min(right,w1*.93),h1,z1],[Math.max(left,-w1*.93),h1,z1]]);
    }else if(!p.panda&&(z0>=p.glassFront||z1<=p.glassRear)){
      const crown=car.id==='gtr'?.021:.013,points=[-1,-.63,0,.63,1];
      for(let j=1;j<points.length;j++){
        const l=points[j-1],r=points[j],y=t=>crown*(1-t*t);
        parts.face(paint,[[w0*.93*l,h0+y(l),z0],[w0*.93*r,h0+y(r),z0],[w1*.93*r,h1+y(r),z1],[w1*.93*l,h1+y(l),z1]]);
      }
    }else parts.face(paint,[[-w0*.93,h0,z0],[w0*.93,h0,z0],[w1*.93,h1,z1],[-w1*.93,h1,z1]]);
    for(const side of [-1,1])parts.face(paint,[[side*w0,h0-.055,z0],[side*w1,h1-.055,z1],[side*w1*.93,h1,z1],[side*w0*.93,h0,z0]]);
  }
  parts.box(factory.mat('#151d24'),p.width*.58,.24,p.length*.85,0,.34,0);
  for(const end of [-1,1]){
    const z=end*p.length/2,y=deckHeight(p,z),w=halfWidth(p,z);
    parts.face(paint,[[-w,.42,z],[w,.42,z],[w*.93,y,z],[-w*.93,y,z]]);
  }
}

function glassPanel(factory,parts,points) {
  const center=points.reduce((v,p)=>v.add(new T.Vector3(...p)),new T.Vector3()).multiplyScalar(1/points.length);
  const normal=new T.Vector3().subVectors(new T.Vector3(...points[1]),new T.Vector3(...points[0])).cross(new T.Vector3().subVectors(new T.Vector3(...points[2]),new T.Vector3(...points[0]))).normalize();
  // Winding differs between sides; offset toward the nearest outside of the cabin.
  const expected=new T.Vector3(center.x,center.y-.7,center.z*.25).normalize();
  if(normal.dot(expected)<0)normal.negate();
  const shrink=(amount,offset)=>points.map(p=>new T.Vector3(...p).sub(center).multiplyScalar(amount).add(center).addScaledVector(normal,offset).toArray());
  const inner=shrink(.93,.003);
  for(let i=0;i<points.length;i++){const next=(i+1)%points.length;parts.face(factory.mat('#111e27'),[points[i],points[next],inner[next],inner[i]]);}
  parts.face(factory.glass,shrink(.93,.007));
  parts.line(points,true);
  // Hand-drawn reflection bands, kept restrained so the glass still reads as glass at night.
  if(points.length===4){
    const mix=(a,b,t)=>new T.Vector3(...a).lerp(new T.Vector3(...b),t).addScaledVector(normal,.013).toArray();
    parts.face(factory.shine,[mix(points[0],points[1],.08),mix(points[0],points[1],.17),mix(points[3],points[2],.42),mix(points[3],points[2],.33)]);
  }
}

function buildCabin(factory,parts,p,paint) {
  const base=p.deck+.008,roof=p.height-.025,bw=p.width*.455,rw=p.width*p.roofWidth*.5;
  const sidePoint=(side,z,y,offset=0)=>[side*(lerp(bw,rw,clamp((y-base)/(roof-base),0,1))+offset),y,z];
  for(const side of [-1,1]){
    const exterior=[[p.glassRear,base],[p.roofRear,roof],[p.roofFront,roof],[p.glassFront,base]];
    const outer=exterior.map(([z,y])=>sidePoint(side,z,y)),center=outer.reduce((v,p)=>v.add(new T.Vector3(...p)),new T.Vector3()).multiplyScalar(.25);
    const inside=outer.map(p=>new T.Vector3(...p).sub(center).multiplyScalar(.89).add(center).toArray());
    for(let i=0;i<4;i++)parts.face(paint,[outer[i],outer[(i+1)%4],inside[(i+1)%4],inside[i]]);
    const top=roof-.055,low=base+.045;
    if(p.van){
      const panes=[
        [[.50,low],[.50,top],[p.roofFront-.055,top],[p.glassFront-.13,low]],
        [[-.47,low],[-.47,top],[.39,top],[.39,low]],
        [[-1.36,low],[-1.36,top],[-.57,top],[-.57,low]],
        [[p.glassRear+.11,low],[p.roofRear+.055,top],[-1.46,top],[-1.46,low]]
      ];
      panes.forEach(points=>glassPanel(factory,parts,points.map(([z,y])=>sidePoint(side,z,y,.008))));
    }else{
      const split=p.doors===4?-.18:-.48;
      glassPanel(factory,parts,[[split+.035,low],[split+.035,top],[p.roofFront-.07,top],[p.glassFront-.12,low]].map(([z,y])=>sidePoint(side,z,y,.008)));
      glassPanel(factory,parts,[[p.glassRear+.18,low],[p.roofRear+.10,top],[split-.045,top],[split-.045,low]].map(([z,y])=>sidePoint(side,z,y,.008)));
      parts.face(factory.mat('#151d23'),[[split-.039,low],[split-.039,top],[split+.029,top],[split+.029,low]].map(([z,y])=>sidePoint(side,z,y,.011)));
    }
  }
  // Roof crown and sloping windscreens replace the old rectangular window block.
  parts.face(paint,[[-rw,roof,p.roofRear],[rw,roof,p.roofRear],[rw,roof,p.roofFront],[-rw,roof,p.roofFront]]);
  parts.box(paint,rw*1.88,.025,p.roofFront-p.roofRear,0,roof+.012,(p.roofFront+p.roofRear)/2);
  const front=[[-bw,base,p.glassFront],[bw,base,p.glassFront],[rw,roof,p.roofFront],[-rw,roof,p.roofFront]];
  const rear=[[bw,base,p.glassRear],[-bw,base,p.glassRear],[-rw,roof,p.roofRear],[rw,roof,p.roofRear]];
  glassPanel(factory,parts,front);glassPanel(factory,parts,rear);
  if(p.hatch||p.chrome){
    for(let i=1;i<8;i++){
      const t=i/10,y=lerp(base,roof,t),z=lerp(p.glassRear,p.roofRear,t)-.014,w=lerp(bw,rw,t)*.91;
      parts.line([[-w,y,z],[w,y,z]]);
    }
    if(p.hatch){const y=lerp(base,roof,.10),z=lerp(p.glassRear,p.roofRear,.10)-.02;parts.line([[-.04,y,z],[.30,y+.03,z+.03]]);}
  }
  parts.line([[-rw,roof+.028,p.roofRear],[rw,roof+.028,p.roofRear],[rw,roof+.028,p.roofFront],[-rw,roof+.028,p.roofFront]],true);
  // Wipers follow the windshield plane instead of floating above the bonnet.
  const wiperY=base+.044,wiperZ=lerp(p.glassFront,p.roofFront,.08)+.012;
  for(const x of [-bw*.43,bw*.32])parts.line([[x-.22,wiperY,wiperZ],[x+.18,wiperY+.035,wiperZ-.05]]);
  if(p.chrome){
    for(const side of [-1,1])parts.box(factory.mat('#b6c4c8'),.018,.018,p.glassFront-p.glassRear,side*bw,base+.009,(p.glassFront+p.glassRear)/2);
  }
  // Subdued interior gives the windows depth without animated 3D faces.
  const interior=factory.mat('#15212a');
  parts.box(interior,p.width*.75,.16,.30,0,base-.03,p.glassFront-.25);
  for(const x of [-p.width*.23,p.width*.23]){
    const seat=parts.box(interior,.38,.39,.13,x,base+.05,p.van?.12:-.31);seat.rotation.x=-.08;
    parts.box(interior,.24,.12,.11,x,base+.29,p.van?.10:-.32);
  }
  const steering=new T.TorusGeometry(.13,.014,5,16);steering.rotateX(Math.PI*.35);
  parts.add(steering,factory.mat('#2d3740'),p.width*.23,base+.10,p.glassFront-.30);
  const driver=new T.SphereGeometry(.083,8,6);parts.add(driver,factory.mat('#142029'),p.width*.23,base+.25,p.van?.17:-.28);
}

function buildTrim(factory,parts,p,car) {
  const paint=factory.mat(car.color),black=factory.mat('#19232c'),silver=factory.mat('#a9b9c0'),z=p.length/2;
  for(const end of [-1,1]){
    const w=p.width*.96,h=car.id==='evo3'?.215:.19,r=p.panda?.012:.029,shape=new T.Shape();
    shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
    shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);
    shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
    const bumperGeo=new T.ExtrudeGeometry(shape,{depth:.155,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.009,bevelThickness:.009,curveSegments:3});bumperGeo.translate(0,0,-.0775);
    const bumper=parts.add(bumperGeo,p.panda?black:paint,0,.40,end*(z-.03));
    const geo=bumper.geometry.attributes.position;
    for(let i=0;i<geo.count;i++){const x=geo.getX(i);geo.setX(i,x*(geo.getZ(i)*end>0?.95:1));}
    bumper.geometry.computeVertexNormals();
    parts.box(black,p.width*.92,.032,.17,0,.295,end*(z-.02));
    parts.line([[-p.width*.465,.505,end*(z+.059)],[p.width*.465,.505,end*(z+.059)]]);
  }
  const hoodFront=z-.10,hoodRear=p.glassFront+.035,hoodWidth=p.width*(p.popup?.245:.33);
  for(const side of [-1,1]){
    parts.line([[side*hoodWidth,deckHeight(p,hoodRear)+.008,hoodRear],[side*hoodWidth,deckHeight(p,hoodFront)+.008,hoodFront]]);
    const belt=[];for(let i=0;i<13;i++){const q=-z+.04+i*(p.length-.08)/12;belt.push([side*(halfWidth(p,q)+.008),p.deck-.15,q]);}parts.line(belt);
    if(p.panda)for(const axle of [-p.wheelbase/2,p.wheelbase/2])parts.box(black,.205,.23,.026,side*(p.width*.5-.11),.23,axle-p.radius-.085);
    if(car.id==='gtr'||car.id.startsWith('evo')){
      parts.box(paint,.075,.075,p.wheelbase-p.radius*2-.15,side*(p.width*.5-.013),.246,0);
      if(car.id==='evo3')parts.box(paint,.07,.17,.24,side*(p.width*.5-.05),.317,-z+.26);
    }
  }
  parts.line([[-hoodWidth,deckHeight(p,hoodRear)+.008,hoodRear],[hoodWidth,deckHeight(p,hoodRear)+.008,hoodRear]]);
  if(car.id==='fc'||car.id.startsWith('evo')){
    const scoopZ=car.id==='fc'?1.04:.98,scoopWidth=car.id==='fc'?.42:.39;
    parts.box(paint,scoopWidth,.055,.32,0,deckHeight(p,scoopZ)+.029,scoopZ);
    parts.box(black,scoopWidth-.07,.025,.018,0,deckHeight(p,scoopZ)+.033,scoopZ+.168);
    if(car.id.startsWith('evo'))for(const side of [-1,1]){
      parts.box(black,.26,.012,.29,side*.34,deckHeight(p,1.32)+.010,1.32);
      for(let i=0;i<5;i++)parts.box(paint,.255,.009,.016,side*.34,deckHeight(p,1.32)+.019,1.20+i*.06);
    }
  }
  for(const side of [-1,1]){
    const outer=side*(p.width*.5+.009),front=p.glassFront-.05,b= p.van?.44:p.doors===4?-.20:-.52;
    const doorEnd=p.van?-.46:p.doors===4?-1.02:b;
    const seams=[front,b,...(p.doors===4?[doorEnd]:[])];
    for(const s of seams){
      const lower=Math.abs(s)>p.wheelbase/2-p.radius?.68:.31;
      parts.line([[side*(halfWidth(p,s)+.01),p.deck-.035,s],[side*(halfWidth(p,s)+.012),lower,s]]);
    }
    for(const s of p.doors===4?[b+.14,doorEnd+.15]:[b+.18]){
      parts.box(black,.018,.036,.18,outer,p.deck-.11,s);
      parts.box(p.chrome?silver:paint,.025,.022,.115,outer+side*.012,p.deck-.101,s);
    }
    const mirrorZ=p.glassFront-.21,mirrorY=p.deck+.19;
    const stem=parts.box(black,.16,.035,.085,side*p.width*.49,mirrorY-.045,mirrorZ);
    stem.rotation.z=side*.13;
    const mirror=parts.box(p.chrome?paint:black,.185,.10,.14,side*p.width*.555,mirrorY,mirrorZ);
    const rear=parts.box(silver,.14,.065,.008,side*p.width*.555,mirrorY,mirrorZ-.073);
    mirror.rotation.y=side*.11;rear.rotation.y=side*.11;
    // Side indicators, fuel flap and small model-specific crease.
    parts.box(factory.mat('#d79b3d',true),.009,.04,.09,outer,p.deck-.13,p.wheelbase/2+.16);
    if(side===-1)parts.line([[outer,.73,-p.wheelbase/2+.12],[outer,.85,-p.wheelbase/2+.12],[outer,.85,-p.wheelbase/2+.30],[outer,.73,-p.wheelbase/2+.30]],true);
  }
  const exhaust=new T.CylinderGeometry(.047,.047,.20,12);exhaust.rotateX(Math.PI/2);
  parts.add(exhaust,silver,-p.width*.32,.25,-z-.025);
  const tip=new T.CircleGeometry(.035,12);tip.rotateY(Math.PI);parts.add(tip,black,-p.width*.32,.25,-z-.129);
  if(p.wing){
    const wingZ=-z+.33,wingWidth=p.width*.91;
    parts.box(paint,wingWidth,.06,.25,0,p.wing,wingZ);
    for(const side of [-1,1]){
      parts.box(black,.065,p.wing-p.tail-.035,.15,side*p.width*.32,(p.wing+p.tail)/2,wingZ);
      if(car.id==='evo3')parts.box(paint,.035,.16,.28,side*(wingWidth/2),p.wing+.035,wingZ);
    }
    if(car.id==='fc')parts.box(paint,p.width*.88,.045,.18,0,p.tail+.045,-z+.18);
  }
}

function buildDecals(factory,parts,p,car) {
  if(car.id==='ae86'||car.id==='ae85'||p.van){
    const label=factory.decal(car.id+'-door',(ctx,w,h)=>{
      ctx.textAlign='center';ctx.fillStyle=p.van?'#c83c30':'#171c22';
      if(p.van){
        ctx.font='900 128px "Microsoft YaHei",sans-serif';ctx.fillText('专业防水补漏',w/2,142);
        ctx.font='bold 48px sans-serif';ctx.fillText('000-0000 · 秋名营业所',w/2,222);
      }else if(car.id==='ae86'){
        ctx.font='900 121px "Yu Gothic","Microsoft YaHei",sans-serif';ctx.fillText('藤原とうふ店',w/2,145);
        ctx.font='bold 46px serif';ctx.fillText('（自家用）',w/2,224);
      }else{
        ctx.font='900 156px sans-serif';ctx.fillText('85',w/2,166);
        ctx.font='bold 38px sans-serif';ctx.fillText('ITSUKI / NOT 86',w/2,225);
      }
    });
    for(const side of [-1,1]){
      const labelWidth=p.van?1.95:car.id==='ae85'?.48:1.21,labelHeight=p.van?.41:car.id==='ae85'?.19:.215;
      const decal=parts.add(new T.PlaneGeometry(labelWidth,labelHeight),label,side*(p.width*.5+.013),p.van?.79:.761,p.van?-.21:car.id==='ae85'?.14:.16);
      decal.rotation.y=side*Math.PI/2;
    }
  }
  const plate=factory.decal('plate:'+car.id,(ctx,w,h)=>{
    ctx.fillStyle=car.id==='ae85'?'#e1c55c':'#e3e4d4';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#445044';ctx.lineWidth=8;ctx.strokeRect(7,7,w-14,h-14);
    ctx.fillStyle='#273d36';ctx.textAlign='center';ctx.font='bold 38px sans-serif';ctx.fillText('秋名  55',w/2,53);
    ctx.font='bold 79px sans-serif';ctx.fillText(car.id==='ae86'?'13-954':car.id==='ae85'?'・・85':'20-05',w/2,139);
  },512,160,false);
  for(const side of [-1,1]){
    const mesh=parts.add(new T.PlaneGeometry(p.van?.32:.34,.105),plate,0,.465,side*(p.length/2+.105));if(side<0)mesh.rotation.y=Math.PI;
  }
  const badge=factory.decal('badge:'+car.id,(ctx,w,h)=>{
    ctx.fillStyle='#bec8c9';ctx.font='bold 80px sans-serif';ctx.textAlign='center';
    ctx.fillText(car.id==='gtr'?'GT-R':car.id==='fc'?'RX-7':car.id==='ae86'?'TRUENO':car.id==='ae85'?'LEVIN':car.id.startsWith('evo')?'LANCER':'',w/2,h*.67);
  },512,128);
  const mesh=parts.add(new T.PlaneGeometry(car.id==='ae86'?.34:.25,.068),badge,car.id==='ae86'?0:-p.width*.28,p.tail-.09,-p.length/2-.033);mesh.rotation.y=Math.PI;
  if(car.id==='ae86'){
    const frontBadge=factory.decal('trueno-front',(ctx,w,h)=>{ctx.fillStyle='#bbc2bd';ctx.font='bold 88px sans-serif';ctx.textAlign='center';ctx.fillText('TRUENO',w/2,h*.73);},512,128);
    parts.add(new T.PlaneGeometry(.25,.048),frontBadge,p.width*.19,p.nose-.134,p.length/2+.041);
  }
  if(car.id==='gtr'){
    const skyline=factory.decal('skyline-rear',(ctx,w,h)=>{ctx.fillStyle='#727f83';ctx.font='bold 68px sans-serif';ctx.textAlign='center';ctx.fillText('S K Y L I N E',w/2,h*.75);},512,128);
    const s=parts.add(new T.PlaneGeometry(.37,.040),skyline,0,p.tail-.014,-p.length/2-.039);s.rotation.y=Math.PI;
  }
}

function buildVehicle(factory,car) {
  const p=VEHICLE_PROFILES[car.id]||VEHICLE_PROFILES.ae86;
  const root=new T.Group();root.name='vehicle:'+car.id;
  root.userData.vehicle={id:car.id,version:3,...p};
  const body=new T.Group();body.name='vehicle-body';root.add(body);
  const shell=new T.Group();shell.name='vehicle-shell';body.add(shell);
  const parts=new Parts(shell),paint=factory.mat(car.color);
  buildShell(factory,parts,p,paint,car);
  buildCabin(factory,parts,p,paint);
  buildTrim(factory,parts,p,car);
  buildVehicleLights(factory,parts,body,p,car,Parts,deckHeight);
  buildDecals(factory,parts,p,car);
  parts.finish(factory.ink,factory.vertexPaint,factory.vertexLamp);
  for(const side of [-1,1])for(const front of [false,true]){
    const pivot=new T.Group();pivot.name='wheel:'+side+':'+(front?'front':'rear');
    pivot.userData.front=front;pivot.position.set(side*(p.width/2-p.tire/2-.025),p.radius+.012,(front?1:-1)*p.wheelbase/2);
    pivot.add(factory.wheel(p));root.add(pivot);
    const caliper=new T.Mesh(new T.BoxGeometry(.047,.095,.05),factory.mat(car.id==='ae86'?'#434d55':'#a95b44'));
    caliper.position.set(side*(p.tire*.32),.06,-p.radius*.47);pivot.add(caliper);
  }
  const charm=new T.Group();charm.name='vehicle-charm';charm.position.set(-p.width*.31,p.tail-.10,-p.length/2-.061);
  const emblem=new Parts(charm),red=factory.mat('#d64a3a',true);
  for(const side of [-1,1])emblem.face(red,[[0,.03,0],[side*.025,.065,0],[side*.047,.017,0],[side*.022,-.004,0]]);
  emblem.finish(factory.ink,factory.vertexPaint,factory.vertexLamp);charm.visible=false;body.add(charm);
  const passengers=new T.Group();passengers.name='vehicle-passengers';passengers.visible=false;
  for(const x of [-p.width*.22,p.width*.22]){
    const head=new T.Mesh(new T.SphereGeometry(.105,8,6),factory.mat('#101b24'));
    head.position.set(x,p.van?1.50:1.11,p.van?-.97:-.67);passengers.add(head);
    const torso=new T.Mesh(new T.BoxGeometry(.25,.25,.14),factory.mat('#101b24'));
    torso.position.copy(head.position);torso.position.y-=.17;passengers.add(torso);
  }
  body.add(passengers);
  const shadow=factory.decal('contact-shadow',(ctx,w,h)=>{
    const gradient=ctx.createRadialGradient(w/2,h/2,w*.07,w/2,h/2,w*.5);
    gradient.addColorStop(0,'rgba(4,11,19,.64)');gradient.addColorStop(.68,'rgba(4,11,19,.33)');gradient.addColorStop(1,'rgba(4,11,19,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  },256,256);
  const ground=new T.Mesh(new T.PlaneGeometry(p.width*1.35,p.length*1.15),shadow);
  ground.name='contact-shadow';ground.rotation.x=-Math.PI/2;ground.position.y=.008;root.add(ground);
  bindVehicle(root);return root;
}

function bindVehicle(model) {
  const wheels=[];model.traverse(node=>{if(node.name.startsWith('wheel:'))wheels.push({pivot:node,spin:node.getObjectByName('wheel-spin'),front:node.userData.front});});
  const refs={body:model.getObjectByName('vehicle-body'),wheels,charm:model.getObjectByName('vehicle-charm'),passengers:model.getObjectByName('vehicle-passengers'),lamps:[],lampMaterials:new Set(),beams:[]};
  model.traverse(node=>{if(node.name.startsWith('headlamp:'))refs.lamps.push({pivot:node,lens:node.getObjectByName('headlamp-lens')});});
  model.traverse(node=>{if(node.name.startsWith('beam-anchor:'))refs.beams.push(node);if(node.material?.userData.vehicleLampRole)refs.lampMaterials.add(node.material);});
  bindings.set(model,refs);return refs;
}

export function cloneVehicleModel(model) {
  const clone=model.clone(true),materials=new Map();
  clone.traverse(node=>{if(node.material?.userData.vehicleLampRole){if(!materials.has(node.material))materials.set(node.material,node.material.clone());node.material=materials.get(node.material);}});
  const refs=bindVehicle(clone);
  refs.body.rotation.set(0,0,0);refs.body.position.y=0;refs.charm.visible=false;refs.passengers.visible=false;
  refs.wheels.forEach(({pivot,spin})=>{pivot.rotation.set(0,0,0);spin.rotation.set(0,0,0);});
  return clone;
}

export function animateVehicleModel(model,state={},dt=0,time=0) {
  const refs=bindings.get(model)||bindVehicle(model),speed=state.speed||0,steering=state.steering||0;
  const ease=dt>0?1-Math.exp(-dt*10):1;
  const roll=clamp((state.lateralAccel??-steering*speed*.35)*.0045,-.075,.075);
  const pitch=clamp((state.longitudinalAccel??((state.throttle?4:0)-(state.brake?10:0)))*.0025,-.035,.025);
  refs.body.rotation.z=lerp(refs.body.rotation.z,roll,ease);
  refs.body.rotation.x=lerp(refs.body.rotation.x,pitch,ease);
  refs.body.position.y=lerp(refs.body.position.y,(state.driftIntensity||0)*Math.sin(time*27)*.008,ease);
  refs.charm.visible=!!state.charm;refs.passengers.visible=!!state.passengers;
  refs.passengers.rotation.z=steering*.045+Math.sin(time*6)*speed*.0005;
  for(const {pivot,spin,front} of refs.wheels){
    // Steering is around Y, tire spin is around its own X axle; the two must not share a pivot.
    pivot.rotation.y=front?-steering*.43:0;
    spin.rotation.x=(spin.rotation.x+speed*dt/model.userData.vehicle.radius)%(Math.PI*2);
  }
  for(const {pivot,lens} of refs.lamps){
    pivot.rotation.x=lerp(pivot.rotation.x,state.lights?pivot.userData.openAngle:0,dt>0?1-Math.exp(-dt*9):1);
    lens.visible=pivot.rotation.x<-.12;
  }
  for(const material of refs.lampMaterials){
    const role=material.userData.vehicleLampRole;
    if(role==='glow')material.opacity=state.lights?.55:0;
    else if(role==='head'){material.emissive.set('#fff1c8');material.emissiveIntensity=state.lights?1.25:0;}
    else if(role==='tail'){material.emissive.set('#f13b26');material.emissiveIntensity=state.brake?1.9:state.lights?.26:0;}
    else if(role==='signal'){material.emissive.set('#cd6a18');material.emissiveIntensity=state.lights?.13:0;}
  }
}

export function vehicleLightState(model){
  const refs=bindings.get(model)||bindVehicle(model),intensity={};
  for(const material of refs.lampMaterials)intensity[material.userData.vehicleLampRole]=material.emissiveIntensity??material.opacity;
  return {intensity,popups:refs.lamps.map(({pivot,lens})=>({angle:pivot.rotation.x,visible:lens.visible})),anchors:refs.beams.map(a=>a.getWorldPosition(new T.Vector3()).toArray())};
}

export function vehicleBeamPositions(model){const refs=bindings.get(model)||bindVehicle(model);return refs.beams.map(a=>a.getWorldPosition(new T.Vector3()));}

export function vehicleModelStats(model) {
  let triangles=0,drawCalls=0;
  model.traverse(node=>{if(node.isMesh){triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;drawCalls+=Array.isArray(node.material)?node.material.length:1;}else if(node.isLine)drawCalls++;});
  return {id:model.userData.vehicle.id,triangles,drawCalls,wheels:(bindings.get(model)||bindVehicle(model)).wheels.length};
}
