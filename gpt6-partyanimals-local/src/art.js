import * as T from 'three';
import { ANIMALS, TEAM_COLORS, byId } from './catalog.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sphere=new T.SphereGeometry(1,20,14),boxGeo=new T.BoxGeometry(1,1,1),cylinder=new T.CylinderGeometry(1,1,1,20),cone=new T.ConeGeometry(1,1,20);
for(const geometry of[sphere,boxGeo,cylinder,cone])geometry.userData.shared=true;
let fabric;
const materials=new Map();
function clothTexture(){
  if(fabric)return fabric;
  const n=128,data=new Uint8Array(n*n*4);let seed=317;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){seed=(seed*1664525+1013904223)>>>0;const v=110+(seed%65)+Math.sin(x*2.2+y%2)*14;const i=(y*n+x)*4;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}
  fabric=new T.DataTexture(data,n,n);fabric.wrapS=fabric.wrapT=T.RepeatWrapping;fabric.repeat.set(3,3);fabric.needsUpdate=true;return fabric;
}
export function mat(color,plush=false,metal=0){
  const key=color+'/'+plush+'/'+metal;if(!materials.has(key)){const m=plush?new T.MeshPhysicalMaterial({color,roughness:.95,sheen:.75,sheenColor:new T.Color(color).lerp(new T.Color('#fff0dd'),.4),sheenRoughness:1,bumpMap:clothTexture(),bumpScale:.025}):new T.MeshStandardMaterial({color,roughness:metal?.3:.7,metalness:metal});m.userData.shared=true;materials.set(key,m);}return materials.get(key);
}
export function disposeVisual(root){const geometries=new Set(),mats=new Set();root.traverse(o=>{if(o.geometry&&!o.geometry.userData.shared)geometries.add(o.geometry);if(o.material&&!o.material.userData.shared)mats.add(o.material);if(o.userData.ownedTexture)o.userData.ownedTexture.dispose();});geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());root.removeFromParent();}
export function mesh(parent,geometry,material,pos=[0,0,0],scale=[1,1,1],rotation){
  const m=new T.Mesh(geometry,typeof material==='string'?mat(material):material);m.position.set(...pos);m.scale.set(...scale);if(rotation)m.rotation.set(...rotation);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
export const ball=(parent,color,pos,scale)=>mesh(parent,sphere,color,pos,scale);
export const box=(parent,color,pos,scale,rot)=>mesh(parent,boxGeo,color,pos,scale,rot);
export const cyl=(parent,color,pos,scale,rot)=>mesh(parent,cylinder,color,pos,scale,rot);
function tube(parent,points,r,color){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(parent,new T.TubeGeometry(curve,16,r,7,false),color);}

export function animalModel(id,costume='classic',team=0){
  const a=byId(ANIMALS,id),root=new T.Group(),parts=Array.from({length:6},()=>new T.Group());parts.forEach(p=>root.add(p));
  const fur=mat(a.color,true),cream=mat(a.accent,true),dark=mat('#28303e'),pink=mat('#d69191',true),body=parts[0],head=parts[1],eyes=[],crosses=[];
  ball(body,fur,[0,0,0],[.49,.61,.41]);ball(body,cream,[0,-.04,.325],[.32,.40,.10]);
  ball(head,fur,[0,0,0],[.59,.55,.51]);
  for(let i=2;i<6;i++){ball(parts[i],fur,[0,0,0],i<4?[.24,.30,.24]:[.28,.23,.35]);if(i>=4)ball(parts[i],cream,[0,-.055,.16],[.20,.13,.17]);}
  const kind=a.kind,earColor=['panda','raccoon'].includes(kind)?dark:fur;
  if(['rabbit'].includes(kind))for(const s of[-1,1]){const ear=ball(head,fur,[s*.29,.7,-.06],[.18,.55,.16]);ear.rotation.z=-s*.14;ball(ear,pink,[0,.06,.65],[.5,.75,.2]);}
  else if(['cat','fox','corgi','tiger','unicorn'].includes(kind)||id==='corgi')for(const s of[-1,1]){mesh(head,cone,earColor,[s*.39,.48,-.03],[.25,.5,.25],[0,0,-s*.22]);mesh(head,cone,pink,[s*.39,.48,.125],[.115,.30,.06],[0,0,-s*.22]);}
  else if(['duck','penguin','shark','dino'].includes(kind)){}
  else if(kind==='dog'&&id!=='corgi')for(const s of[-1,1]){ball(head,cream,[s*.53,.14,-.07],[.17,.40,.22]).rotation.z=s*.22;}
  else for(const s of[-1,1]){ball(head,earColor,[s*.41,.44,-.08],[.23,.25,.18]);ball(head,pink,[s*.42,.46,.055],[.12,.13,.065]);}
  if(kind==='panda'||kind==='raccoon')for(const s of[-1,1]){const patch=ball(head,dark,[s*.245,.06,.44],[.175,.21,.10]);patch.rotation.z=-s*.2;}
  if(kind==='duck'||kind==='penguin'){ball(head,mat('#e6a54b'),[0,-.12,.54],[kind==='duck'?.29:.22,.13,.30]);}
  else if(kind==='pig'){
    ball(head,pink,[0,-.10,.51],[.27,.18,.17]);for(const s of[-1,1])ball(head,dark,[s*.095,-.09,.67],[.035,.05,.02]);
  }else{
    for(const s of[-1,1])ball(head,cream,[s*.13,-.17,.445],[.25,.205,.17]);ball(head,dark,[0,-.075,.61],[.105,.075,.07]);
    tube(head,[[-.1,-.265,.578],[0,-.285,.60],[.1,-.265,.578]],.016,'#695348');
  }
  for(const s of[-1,1]){
    const eye=ball(head,mat('#182232',false,.05),[s*.238,.115,.463],[.065,.082,.045]);eyes.push(eye);ball(eye,'#ffffff',[-.22,.30,.74],[.27,.24,.25]);
    ball(head,pink,[s*.36,-.09,.405],[.085,.052,.045]);
    const cross=new T.Group();cross.position.set(s*.235,.11,.51);for(const r of[-.7,.7])box(cross,'#4c3d3e',[0,0,0],[.14,.026,.02],[0,0,r]);cross.visible=false;head.add(cross);crosses.push(cross);
  }
  if(kind==='cat'||kind==='tiger'||kind==='fox')for(const s of[-1,1])for(const y of[-.06,-.14])tube(head,[[s*.29,y,.51],[s*.52,y-.01,.49],[s*.65,y+.03,.42]],.009,'#665657');
  if(kind==='panda'){for(let i=2;i<6;i++)parts[i].children[0].material=dark;}
  if(kind==='tiger'){
    for(const s of[-1,1])for(let j=0;j<3;j++){const stripe=ball(head,dark,[s*(.49-j*.012),.21-j*.15,.20],[.07,.035,.28]);stripe.rotation.z=s*.35;}
    for(let j=0;j<3;j++)ball(body,dark,[0,.18-j*.15,-.385],[.28,.035,.045]);
  }
  if(kind==='shark'){mesh(body,cone,fur,[0,.26,-.47],[.22,.55,.12],[Math.PI/3,0,0]);for(const s of[-1,1])for(let j=0;j<3;j++)box(head,'#4c7092',[s*.53,-.05+j*.10,.1],[.018,.07,.17],[0,0,s*.15]);}
  if(kind==='dino'){for(let j=0;j<5;j++)mesh(body,cone,cream,[0,.6-j*.25,-.39],[.14,.22,.16],[Math.PI*.35,0,0]);tube(body,[[0,-.32,-.32],[0,-.43,-.67],[0,-.30,-1.04]],.16,a.color);}
  else if(kind==='rabbit'||kind==='bear')ball(body,cream,[0,-.3,-.46],[.22,.22,.22]);
  else if(['cat','tiger','otter','raccoon','fox','dog'].includes(kind)){
    tube(body,[[0,-.32,-.3],[.1,-.38,-.65],[.34,-.14,-.85],[.45,.09,-.78]],kind==='fox'?.2:.11,a.color);if(kind==='fox')ball(body,cream,[.44,.08,-.79],[.18,.24,.17]);
  }
  if(kind==='unicorn'){mesh(head,cone,mat('#e7c76e',false,.4),[0,.59,.25],[.13,.6,.13],[-.2,0,0]);for(let j=0;j<4;j++)ball(head,mat(['#e4a7c3','#c6a9e5','#94cdd6','#eecb8a'][j],true),[0,.46-j*.23,-.36],[.23,.20,.16]);}
  // Team ribbon remains recognizable even with different coats.
  cyl(body,mat(TEAM_COLORS[team%8],true),[0,.39,0],[.45,.1,.40]);
  if(costume==='scarf'){box(body,mat(TEAM_COLORS[team%8],true),[.17,.05,.46],[.20,.60,.085],[0,0,.18]);}
  if(costume==='cap'){ball(head,mat('#7396a4',true),[0,.43,-.035],[.53,.28,.49]);box(head,'#587785',[0,.39,.52],[.68,.08,.42]);}
  if(costume==='crown'){cyl(head,mat('#e9c358',false,.45),[0,.53,0],[.34,.12,.32]);for(let j=0;j<5;j++){const r=j/5*Math.PI*2;mesh(head,cone,mat('#e9c358',false,.45),[Math.sin(r)*.28,.70,Math.cos(r)*.28],[.10,.28,.1]);}}
  if(costume==='glasses'){for(const s of[-1,1])box(head,'#222939',[s*.24,.12,.535],[.30,.21,.07],[0,-s*.15,0]);box(head,'#222939',[0,.15,.56],[.2,.03,.04]);}
  if(costume==='flower'){for(let j=0;j<6;j++){const r=j/6*Math.PI*2;ball(head,'#edacae',[-.40+Math.sin(r)*.14,.42+Math.cos(r)*.14,.2],[.10,.1,.07]);}ball(head,'#f4d982',[-.40,.42,.26],[.08,.08,.05]);}
  if(costume==='pirate'){box(head,'#34424e',[0,.52,0],[1,.15,.62]);ball(head,'#34424e',[0,.62,-.05],[.42,.22,.3]);ball(head,'#f1e7c9',[0,.65,.255],[.10,.1,.025]);}
  if(costume==='space'){cyl(body,'#d8e6e7',[0,.3,0],[.53,.16,.46]);box(body,'#738f9f',[0,0,-.47],[.60,.58,.25]);}
  const stars=new T.Group();root.add(stars);for(let i=0;i<3;i++)mesh(stars,new T.OctahedronGeometry(.1),mat('#ffe395'),[Math.cos(i*2.094)*.65,0,Math.sin(i*2.094)*.65]);stars.visible=false;
  return{root,parts,eyes,crosses,stars,setExpression(stun){eyes.forEach(e=>e.visible=!stun);crosses.forEach(e=>e.visible=!!stun);stars.visible=!!stun;},pose(x,y,z,yaw=0,time=0){const offsets=[[0,0,0],[0,.78,0],[-.6,.1,0],[.6,.1,0],[-.23,-.65,.03],[.23,-.65,.03]];parts.forEach((p,i)=>{const o=new T.Vector3(...offsets[i]).applyAxisAngle(new T.Vector3(0,1,0),yaw);p.position.set(x+o.x,y+o.y+(i>1?Math.sin(time*3+i)*.03:0),z+o.z);p.rotation.set(i===2?-.1:i===3?.1:0,yaw,i===2?-.15:i===3?.15:0);});}};
}

export function itemModel(item){
  const g=new T.Group(),kind=item.kind,color=item.def?.color||({ball:'#f1e8cc',football:'#a6764b',basketball:'#d88b48',puck:'#333d4c',candy:'#ee92b2',coal:'#45515d',stone:'#a4a6a1'}[kind]||'#e0bc75');
  if(['ball','football','basketball','candy','coal','stone','bomb'].includes(kind)){
    ball(g,color,[0,0,0],kind==='football'?[.52,.3,.3]:[item.radius||.32,item.radius||.32,item.radius||.32]);
    if(kind==='ball')for(let j=0;j<6;j++){const a=j/6*Math.PI*2;ball(g,'#4f6270',[Math.sin(a)*.42,0,Math.cos(a)*.42],[.14,.14,.03]).rotation.y=a;}
    if(kind==='bomb'){cyl(g,'#c5a165',[0,.3,0],[.08,.13,.08]);tube(g,[[0,.35,0],[.08,.44,0],[.1,.49,0]],.025,'#e9d1a4');}
    if(kind==='candy'){for(const s of[-1,1])mesh(g,cone,'#f4d4df',[s*.5,0,0],[.22,.4,.22],[0,0,s*Math.PI/2]);}
  }else if(kind==='puck')cyl(g,color,[0,0,0],[.4,.24,.4]);
  else if(['freeze','taser','crossbow'].includes(kind)){
    box(g,color,[0,0,.1],[.32,.3,.8]);box(g,'#4d5967',[0,-.23,-.12],[.18,.35,.2],[.25,0,0]);cyl(g,'#dbe3dc',[0,0,.56],[.14,.14,.14],[Math.PI/2,0,0]);if(kind==='crossbow')box(g,'#946f48',[0,0,.35],[.9,.1,.12]);
  }else if(kind==='pan'){
    cyl(g,color,[0,.25,0],[.38,.09,.38],[Math.PI/2,0,0]);box(g,'#856851',[0,-.28,0],[.11,.65,.12]);
  }else if(kind==='hammer'){box(g,color,[0,.35,0],[.78,.38,.4]);cyl(g,'#bd9c65',[0,-.2,0],[.07,.8,.07]);}
  else if(kind==='lollipop'){cyl(g,'#e6d5b6',[0,-.25,0],[.05,.8,.05]);cyl(g,color,[0,.25,0],[.35,.10,.35],[Math.PI/2,0,0]);mesh(g,new T.TorusGeometry(.20,.04,8,22),mat('#fff0de'),[0,.25,.065]);}
  else if(kind==='spinach'){cyl(g,'#90aa79',[0,0,0],[.22,.45,.22]);cyl(g,'#d7ddd1',[0,.23,0],[.22,.025,.22]);}
  else if(kind==='banana'){tube(g,[[-.25,.1,0],[-.16,-.1,0],[.06,-.18,0],[.28,0,0]],.08,'#f5d569');}
  else if(kind==='shovel'){cyl(g,'#ae8d5a',[0,0,0],[.06,1.2,.06]);box(g,color,[0,.5,0],[.36,.42,.09]);}
  else if(kind==='nunchuck'){cyl(g,color,[-.14,0,0],[.06,.62,.06]);cyl(g,color,[.14,0,0],[.06,.62,.06]);tube(g,[[-.14,.31,0],[0,.46,0],[.14,.31,0]],.025,'#767e82');}
  else cyl(g,color,[0,0,0],[.10,1.25,.10]);return g;
}

export function kartModel(animal,costume,team){
  const g=new T.Group(),color=TEAM_COLORS[team%8];box(g,color,[0,.30,0],[1.22,.35,1.8]);ball(g,color,[0,.48,.65],[.6,.28,.65]);box(g,'#384552',[0,.64,-.55],[.85,.8,.20],[.15,0,0]);box(g,'#e6cb87',[0,.31,1.17],[1.28,.15,.2]);
  const wheels=[];for(const x of[-.69,.69])for(const z of[-.65,.7])wheels.push(cyl(g,'#35424c',[x,.19,z],[.26,.24,.26],[0,0,Math.PI/2]));
  const rider=animalModel(animal,costume,team);rider.root.scale.setScalar(.6);rider.pose(0,1.1,0,0);g.add(rider.root);
  const flames=[];for(const x of[-.42,.42]){const flame=ball(g,new T.MeshBasicMaterial({color:'#8ae0f2'}),[x,.25,-1.1],[.15,.13,.38]);flame.visible=false;flames.push(flame);}
  const shield=ball(g,new T.MeshStandardMaterial({color:'#9bdceb',transparent:true,opacity:.22,roughness:.18,depthWrite:false}),[0,1,0],[1.2,1.25,1.35]);shield.visible=false;return{root:g,wheels,rider,flames,shield};
}

export function label(text,color='#354654',size=256){
  const canvas=document.createElement('canvas');canvas.width=size*2;canvas.height=size;const c=canvas.getContext('2d');c.fillStyle=color;c.font=`900 ${size*.33}px "Microsoft YaHei",sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,size,size*.5,size*1.9);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(3,1.5,1);sprite.userData.ownedTexture=texture;return sprite;
}
export function tree(parent,x,z,color='#90af8c',height=4){cyl(parent,'#9b7d5d',[x,height*.28,z],[.18,height*.56,.18]);for(let i=0;i<3;i++)mesh(parent,cone,mat(color),[x,height*.45+i*.65,z],[1.35-i*.24,1.7,1.35-i*.24]);}

export function stadiumDetails(parent,layout){
  const {map,pieces,nodes}=layout,k=map.kind;
  const arenaSign=label(map.name,'#f4ead2');arenaSign.position.set(0,4.5,-map.d/2-1);arenaSign.scale.set(6,3,1);parent.add(arenaSign);
  for(const n of nodes){const teamColor=TEAM_COLORS[n.team||0];
    if(n.type==='fire'){cyl(parent,'#7a817c',[n.x,.10,n.z],[.64,.20,.64]);for(let i=0;i<3;i++)mesh(parent,cone,new T.MeshStandardMaterial({color:'#f2b24e',emissive:'#d97830',emissiveIntensity:.5}),[n.x,.65+i*.15,n.z],[.30-i*.05,.9,.30-i*.05]);}
    if(n.type==='goal'){for(const z of[-2.3,2.3])cyl(parent,teamColor,[n.x,1.15,z],[.1,2.3,.1]);box(parent,teamColor,[n.x,2.3,0],[.13,.13,4.7]);for(let i=-2;i<=2;i++)box(parent,'#e5e8d9',[n.x+Math.sign(n.x)*.35,1.1,i],[.045,2.2,.045]);}
    if(n.type==='hoop'){cyl(parent,teamColor,[n.x,1.6,0],[.14,3.2,.14]);box(parent,'#e4e4dc',[n.x,3.6,0],[.15,1.3,2.2]);mesh(parent,new T.TorusGeometry(.68,.06,8,28),mat(teamColor),[n.x-Math.sign(n.x)*.7,3.15,0],[1,1,1],[Math.PI/2,0,0]);}
    if(['basket','furnace','catapult'].includes(n.type)){box(parent,teamColor,[n.x,.45,n.z],[2.2,.9,2.2]);box(parent,'#4b5961',[n.x,.95,n.z],[1.4,.10,1.4]);if(n.type==='catapult')box(parent,'#bba171',[n.x,1.6,n.z],[.25,2.3,.25],[0,0,n.team===0?-.8:.8]);}
    if(n.type==='arcade'){box(parent,teamColor,[n.x,1.1,n.z],[1.2,2.2,.8]);box(parent,'#314255',[n.x,1.6,n.z+.42],[.9,.75,.08]);const text=label('★ +1','#ebd289',128);text.position.set(n.x,1.65,n.z+.5);text.scale.set(.9,.45,1);parent.add(text);}
    if(n.type==='cannon'){cyl(parent,'#444e59',[n.x,1,n.z],[.30,1.6,.30],[0,0,Math.PI/2]);box(parent,'#ad8d65',[n.x,.40,n.z],[1.3,.5,.8]);}
    if(n.type==='repair'){const l=label('＋','#dce4c8',128);l.position.set(n.x,1.5,n.z);parent.add(l);}
    if(n.type==='terminal'||n.type==='switch'){box(parent,'#3e5665',[n.x,.65,n.z],[.9,1.3,.6]);box(parent,n.type==='switch'?'#efb46e':'#88d8c4',[n.x,.98,n.z+.32],[.65,.35,.05]);}
    if(n.type==='meeting'){cyl(parent,'#d59580',[n.x,.45,n.z],[1,.9,1]);cyl(parent,'#d65f59',[n.x,.96,n.z],[.35,.14,.35]);}
    if(n.type==='fish'){cyl(parent,'#b29878',[n.x+1,.5,n.z],[.14,1,.14]);const l=label('钓鱼码头','#526a71');l.position.set(n.x,2.5,n.z);parent.add(l);}
    if(n.type==='cards'){for(const x of[-1,1])for(const z of[-1.4,1.4])box(parent,'#967b5b',[n.x+x,.5,n.z+z],[.7,1,.7]);const l=label('PAWS','#f4e4c1');l.position.set(n.x,2.3,n.z);parent.add(l);}
    if(n.type==='shop'){box(parent,'#d5bd87',[n.x,.65,n.z],[1.5,1.3,.8]);const l=label('杂货铺','#f4e4c1');l.position.set(n.x,2,n.z);parent.add(l);}
    if(n.type==='radio'){box(parent,'#a6b9bb',[n.x,.5,n.z],[.8,.7,.3]);ball(parent,'#435765',[n.x-.15,.5,n.z+.18],[.18,.18,.03]);}
    if(n.type==='balloon'){cyl(parent,'#aa8971',[0,.5,0],[1.1,1,1.1]);ball(parent,mat('#edcc87'),[0,3,0],[1.7,2,1.7]);for(const x of[-.6,.6])cyl(parent,'#e8d6ab',[x,1.7,0],[.025,2,.025]);}
    if(n.type==='item'){const item=box(parent,mat('#e9cc7d'),[n.x,1.1,n.z],[.8,.8,.8],[0,.4,.2]);item.userData.spin=true;const l=label('?','#795e4d',128);l.position.set(n.x,1.15,n.z);l.scale.set(.8,.4,1);parent.add(l);}
  }
  if(['soccer','hockey','football','basket'].includes(k)){
    mesh(parent,new T.TorusGeometry(2,.04,6,50),mat('#e3e9d7'),[0,.035,0],[1,1,1],[Math.PI/2,0,0]);box(parent,'#e3e9d7',[0,.02,0],[.06,.04,map.d]);
    for(const sign of[-1,1])box(parent,TEAM_COLORS[sign<0?0:1],[sign*(map.w/2-2),.023,0],[3.5,.04,4.4]);
  }
  if(k==='gas'){
    for(const x of[-6,6]){cyl(parent,'#bc785e',[x,1.7,-4],[.2,3.4,.2]);box(parent,'#756b5e',[x,3.4,-4],[2.2,.3,1.2],[0,0,.02]);}
    for(const x of[-5,5])tree(parent,x,-8,'#a3b39b',5);
  }
  if(k==='bridge'){for(const z of[-2,2])tube(parent,[[-10,2,z],[-5,.9,z],[0,.75,z],[5,.9,z],[10,2,z]],.055,'#b6a488');}
  if(k==='wind'){for(const z of[-3,0,3]){const fan=new T.Group();fan.position.set(-7,1.6,z);for(let j=0;j<4;j++)box(fan,'#5b7380',[0,Math.cos(j*Math.PI/2)*.45,Math.sin(j*Math.PI/2)*.45],[.13,1,.2],[j*Math.PI/2,0,0]);fan.userData.fan=true;parent.add(fan);}}
  if(k==='blackhole'){mesh(parent,new T.TorusGeometry(1,.12,12,40),mat('#b296cf',false,.4),[0,.06,0],[1,1,1],[Math.PI/2,0,0]);}
  if(k==='pirate'){for(const x of[-7,7]){cyl(parent,'#a08564',[x,3.3,-3],[.13,6.6,.13]);box(parent,'#f2e7cd',[x,4,-3],[.08,3.1,3.4],[0,0,.05]);}}
  if(k==='cabin'){for(const x of[-8,-6,7,9])for(const z of[-9,9])tree(parent,x,z,map.id==='winter'?'#c2d6d0':map.id==='autumn'?'#ce9563':'#8eaf8c',4+Math.abs(x%2));}
  if(k==='kart'){
    for(let j=0;j<18;j++){const a=j/18*Math.PI*2,x=Math.sin(a)*30,z=Math.cos(a)*26;cyl(parent,'#b4c99c',[x,-.55,z],[2,.9,2]);tree(parent,x,z,j%3?'#93baa3':'#cab597',3+j%3);}
    cyl(parent,map.id==='city'?'#a3a5b7':'#bdcf9a',[0,-.4,0],[11,.8,11]);
    for(let i=0;i<pieces.length;i++){const p=pieces[i];for(const sign of[-1,1])box(parent,i%2?'#e39b83':'#f5e8c8',[p.x+Math.cos(p.angle)*3.35*sign,.06,p.z-Math.sin(p.angle)*3.35*sign],[.28,.12,p.d],[0,p.angle,0]);if(i%2===0)box(parent,'#dbd7c1',[p.x,.012,p.z],[.07,.025,p.d*.48],[0,p.angle,0]);}
    const start=pieces[0];for(let i=0;i<8;i++)box(parent,i%2?'#f7efd9':'#4a5365',[start.x+Math.cos(start.angle)*(i-3.5)*.8,.025,start.z-Math.sin(start.angle)*(i-3.5)*.8],[.8,.05,.7],[0,start.angle,0]);
  }
  // Spectator stands and pennants frame the playable area without hiding it.
  if(!['cabin','kart','station','pirate'].includes(k))for(const sign of[-1,1]){
    box(parent,'#779299',[sign*(map.w/2+3),-.4,-2],[2,.8,map.d+2]);for(let j=0;j<7;j++){const z=(j-3)*1.5;ball(parent,mat(TEAM_COLORS[j%8],true),[sign*(map.w/2+3),.4,z],[.32,.4,.32]);ball(parent,mat(TEAM_COLORS[(j+2)%8],true),[sign*(map.w/2+3),.85,z],[.3,.3,.3]);}
  }
}

export function mergeDecorations(group){
  // Static props can share one draw per material. Animated props and sprites remain independent.
  group.updateMatrixWorld(true);const batches=new Map(),remove=[];
  group.traverse(o=>{if(o.isMesh&&!o.userData.spin&&!o.parent?.userData.fan&&o.material&&!Array.isArray(o.material)){const list=batches.get(o.material)||[];list.push(o.geometry.clone().applyMatrix4(o.matrixWorld));batches.set(o.material,list);remove.push(o);}});
  remove.forEach(o=>{o.removeFromParent();if(!o.geometry.userData.shared)o.geometry.dispose();});for(const[material,geos]of batches){const geometry=mergeGeometries(geos);geos.forEach(g=>g.dispose());if(geometry)mesh(group,geometry,material);}
}
