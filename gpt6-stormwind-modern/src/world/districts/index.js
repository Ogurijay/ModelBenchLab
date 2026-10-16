/** District architecture uses shared plot rectangles; every numbered home has an open entrance. */
export function build(ctx) {
 const {THREE,coords,materials,kit:k}=ctx;
 const city=new THREE.Group();city.name='District architecture';city.userData.interiors=[];
 const zoneNames={trade:'贸易区商铺',cathedral:'教堂区民居',mage:'法师区书屋',old:'旧城民居',dwarven:'矮人工坊',harbor:'港口仓屋',embassy:'暴风城大使馆',north:'北城民居'};
 const sailMaterial=materials.white.clone();sailMaterial.side=THREE.DoubleSide;
 const agedSail=sailMaterial.clone();agedSail.color.set('#cbbf9e');agedSail.roughness=.96;
 const awningRed=materials.banner.clone();awningRed.color.set('#944d3b');awningRed.map=null;awningRed.roughness=.96;

 function barrel(g,x,y,z,s=1){k.cyl(g,x,y+.58*s,z,.46*s,.48*s,1.16*s,'wood',10);for(const yy of [.14,.96])k.cyl(g,x,y+yy*s,z,.49*s,.49*s,.09*s,'iron',10);}
 function chair(g,x,y,z,rot=0){const c=new THREE.Group();c.position.set(x,y,z);c.rotation.y=rot;g.add(c);k.box(c,0,.66,0,.85,.16,.86,'wood');k.box(c,0,1.2,-.37,.85,1,.12,'timber');for(const a of [-.3,.3])for(const b of [-.3,.3])k.box(c,a,.32,b,.12,.64,.12,'timber');}
 function table(g,x,y,z,w=2,d=1.3){k.box(g,x,y+1.1,z,w,.18,d,'wood',true);for(const dx of [-w*.37,w*.37])for(const dz of [-d*.32,d*.32])k.box(g,x+dx,y+.53,z+dz,.16,1.06,.16,'timber');}
 function crate(g,x,y,z,s=1){k.box(g,x,y+s/2,z,s,s,s,'wood',true);for(const dx of [-s*.43,s*.43])k.box(g,x+dx,y+s/2,z+s*.51,.1,s,.06,'timber');k.beam(g,[x-s*.43,y+.1,z+s*.54],[x+s*.43,y+s-.1,z+s*.54],.07,'timber');}
 function shieldSign(g,x,y,z,variant){
  k.beam(g,[x,y+1,z-.3],[x,y+1,z+1.3],.08,'iron');
  k.beam(g,[x,y+1,z+.8],[x,y+.3,z+.8],.04,'iron');
  const shield=new THREE.Shape();shield.moveTo(-.65,.5);shield.lineTo(.65,.5);shield.lineTo(.58,-.28);shield.lineTo(0,-.82);shield.lineTo(-.58,-.28);shield.closePath();
  const m=k.mesh(g,new THREE.ExtrudeGeometry(shield,{depth:.12,bevelEnabled:false}),'gold',x,y,z+.8);
  k.box(g,x,y,z+.94,.9,.7,.025,variant==='mage'?'purple':variant==='old'?'redRoof':'banner');
  if(variant==='dwarven'){k.box(g,x,y+.1,z+.98,.55,.18,.05,'gold');k.box(g,x,y-.18,z+.98,.12,.5,.05,'gold');}
  else {const mark=k.cyl(g,x,y,z+.99,.22,.22,.04,'gold',variant==='mage'?5:8);mark.rotation.x=Math.PI/2;}
  m.userData.role='Hanging shop sign';
 }
 function foliage(g,x,y,z,width,height,seed,ivy=false){
  // Blade-shaped, folded leaves and branch tubes are accumulated into four meshes.
  // No image planes or per-leaf materials are used, and the decoration has no collider.
  let state=(seed*991+713)>>>0;const rand=()=>{state=(state*1664525+1013904223)>>>0;return state/4294967296;};
  const buckets={leaf:[],leafLight:[],timber:[],flower:[]};
  function triangle(bucket,a,b,c){buckets[bucket].push(...a,...b,...c);}
  function blade(cx,cy,cz,len,angle,tilt,bucket='leaf'){
   const m=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt,angle,angle*.32));
   const v=[[0,-len*.46,0],[-len*.3,0,0],[0,len*.54,0],[len*.3,0,0],[0,0,len*.14]].map(p=>new THREE.Vector3(...p).applyMatrix4(m).add(new THREE.Vector3(cx,cy,cz)).toArray());
   for(let q=0;q<4;q++){triangle(bucket,v[q],v[(q+1)%4],v[4]);triangle(bucket,v[4],v[(q+1)%4],v[q]);}
  }
  function twig(a,b,r=.017){
   const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A).normalize(),u=new THREE.Vector3(0,0,1).cross(d).normalize();if(u.lengthSq()<.1)u.set(1,0,0);const v=d.clone().cross(u);
   for(let q=0;q<5;q++){const t=q/5*Math.PI*2,n=(q+1)/5*Math.PI*2;const off=t=>u.clone().multiplyScalar(Math.cos(t)*r).addScaledVector(v,Math.sin(t)*r);const p=A.clone().add(off(t)).toArray(),s=A.clone().add(off(n)).toArray(),r1=B.clone().add(off(t)).toArray(),r2=B.clone().add(off(n)).toArray();triangle('timber',p,s,r1);triangle('timber',s,r2,r1);}
  }
  if(ivy){
   const points=[];for(let j=0;j<9;j++)points.push([x+Math.sin(j*.9+seed)*width*.2,y+j*height/8,z+.1+Math.cos(j)*.035]);
   for(let j=1;j<points.length;j++){twig(points[j-1],points[j],.024);const p=points[j];for(const side of [-1,1]){const tip=[p[0]+side*width*(.2+rand()*.14),p[1]+.22,p[2]+.13];twig(p,tip,.013);for(let q=0;q<4;q++)blade(tip[0]+(rand()-.5)*.23,tip[1]+(rand()-.5)*.35,tip[2]+rand()*.18,.25+rand()*.14,side*.7+rand(),.5+rand(),q%3?'leaf':'leafLight');}}
  }else{
   for(let j=0;j<42;j++){const px=x+(rand()-.5)*width,py=y+rand()*height,pz=z+(rand()-.5)*.5;blade(px,py,pz,.22+rand()*.2,rand()*Math.PI*2,rand()*1.5,j%3?'leaf':'leafLight');}
   for(let j=0;j<5;j++){const px=x+(j/4-.5)*width*.85;twig([px,y-.1,z],[px+.06,y+height*.65,z+.06]);}
   // A few stems trail below the rim, with paired leaves instead of hanging green spheres.
   for(let j=0;j<3;j++){const px=x+(j-1)*width*.33;let last=[px,y,z+.25];for(let q=1;q<=4;q++){const next=[px+Math.sin(q+j)*.11,y-q*.2,z+.28+q*.025];twig(last,next,.014);for(const side of [-1,1])blade(next[0]+side*.1,next[1],next[2],.24,side*.8+q*.4,.8,q%2?'leaf':'leafLight');last=next;}}
   for(let j=0;j<7;j++){const px=x+(rand()-.5)*width*.9,py=y+height*.58+rand()*.16,pz=z+.18+rand()*.15;for(let q=0;q<5;q++){const t=q/5*Math.PI*2;blade(px+Math.cos(t)*.07,py+Math.sin(t)*.07,pz,.13,t,.3,'flower');}}
  }
  for(const [mat,v] of Object.entries(buckets))if(v.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(v.length/3*2),2));geo.computeVertexNormals();k.mesh(g,geo,mat);}
 }
 function plantBox(g,x,y,z,w=2,rich=false,seed=0){
  k.box(g,x,y+.21,z,w,.42,.62,'wood');
  if(!rich){for(let i=0;i<5;i++){k.sphere(g,x+(i-2)*w/5,y+.62,z,.23,'leaf');k.sphere(g,x+(i-2)*w/5,y+.81,z,.12,'flower');}return;}
  k.box(g,x,y+.43,z,w-.1,.04,.51,'soil');k.box(g,x,y+.39,z+.33,w+.08,.11,.09,'timber');
  for(const side of [-1,1])k.box(g,x+side*w*.42,y+.21,z+.35,.065,.42,.06,'iron');
  foliage(g,x,y+.63,z+.12,w,.45,seed);
 }
 function shopAwning(g,w,front,index){
  const width=w*.76,stripes=8,segments=5,offset=index%3===0?w*.11:0;
  // Curved cloth is draped between the facade and front rail; it is not a solid wedge.
  for(let strip=0;strip<stripes;strip++){
   const v=[],uv=[],ix=[];
   for(let j=0;j<=segments;j++)for(let side=0;side<2;side++){
    const t=j/segments,x=offset-width/2+(strip+side)*width/stripes;
    v.push(x,4.4-t*.72+Math.sin(t*Math.PI)*.12,front+.38+t*1.65);uv.push(side,t);
   }
   for(let j=0;j<segments;j++){const a=j*2;ix.push(a,a+2,a+1,a+1,a+2,a+3);}
   const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();
   const cloth=strip%2?'white':index%3===0?awningRed:'banner';
   k.mesh(g,geo,cloth);
   const x=offset-width/2+(strip+.5)*width/stripes;
   k.box(g,x,3.55,front+2.02,width/stripes-.015,.26,.055,cloth);
  }
  for(const side of [-1,1]){
   const x=offset+side*(width/2-.1);
   k.beam(g,[x,4.4,front+.3],[x,3.68,front+2.02],.065,'iron');
   k.beam(g,[x,3.03,front+.3],[x,3.68,front+2.02],.055,'iron');
  }
  k.beam(g,[offset-width/2,3.68,front+2.02],[offset+width/2,3.68,front+2.02],.065,'timber');
 }
 function tiledRoof(g,w,d,h,rise,material,index){
  const half=(w+1.35)/2,slope=Math.atan2(rise,half),layers=6;
  for(const side of [-1,1]){
   for(let row=1;row<layers;row++){
    const t=row/layers;
    const lip=k.box(g,side*half*(1-t),h+rise*t+.065,0,.28,.12,d+1.25,material);
    lip.rotation.z=-side*slope;
   }
   // The bottom course consists of individual offset, thick clay tiles, visible in close views.
   const count=Math.ceil((d+1.2)/1.15),tileDepth=(d+1.2)/count;
   for(let j=0;j<count;j++){
    const edge=k.box(g,side*(half-.17),h+.12+(j%3)*.018,-(d+1.2)/2+(j+.5)*tileDepth,.47,.14,tileDepth-.035,material);
    edge.rotation.z=-side*slope;
   }
  }
  // Rounded overlapping ridge caps catch light separately from the roof planes.
  const count=Math.ceil((d+1.4)/1.1),length=(d+1.4)/count;
  for(let j=0;j<count;j++){
   const cap=k.cyl(g,0,h+rise+.16,-(d+1.4)/2+(j+.5)*length,.2,.24,length+.07,material,6);cap.rotation.x=Math.PI/2;
  }
  for(const z of [-d/2-.7,d/2+.7]){
   k.cyl(g,0,h+rise+.45,z,.08,.15,.62,'gold',6);
   if(index%3===0)k.sphere(g,0,h+rise+.82,z,.17,'gold');
  }
 }
 function wallWithOpenings(parent,width,height,depth,x,z,rotation,holes,materialAt){
  const wall=new THREE.Group();wall.name='开洞墙体';wall.position.set(x,0,z);wall.rotation.y=rotation;parent.add(wall);
  const openings=holes.map(h=>({l:Math.max(-width/2,h.x-h.w/2),r:Math.min(width/2,h.x+h.w/2),b:Math.max(0,h.y-h.h/2),t:Math.min(height,h.y+h.h/2)})).filter(h=>h.r>h.l&&h.t>h.b);
  const xs=[...new Set([-width/2,width/2,...openings.flatMap(h=>[h.l,h.r])])].sort((a,b)=>a-b);
  const ys=[...new Set([0,height,...openings.flatMap(h=>[h.b,h.t])])].sort((a,b)=>a-b);
  // The holes and wall cells share one 2D partition. Adjacent solid cells in a row
  // are coalesced, so a window does not multiply the number of drawables needlessly.
  for(let row=0;row<ys.length-1;row++){
   const bottom=ys[row],top=ys[row+1],cy=(bottom+top)/2;let start=null,mat=null;
   const emit=end=>{
    if(start===null||end-start<1e-6)return;
    const mesh=k.box(wall,(start+end)/2,cy,0,end-start,top-bottom,depth,mat,true);
    mesh.name='实体窗间墙';mesh.userData.wallSegment=true;
   };
   for(let col=0;col<xs.length-1;col++){
    const cx=(xs[col]+xs[col+1])/2,empty=openings.some(h=>cx>h.l&&cx<h.r&&cy>h.b&&cy<h.t),next=materialAt(cx,cy);
    if(empty){emit(xs[col]);start=null;mat=null;continue;}
    if(start===null){start=xs[col];mat=next;}
    else if(next!==mat){emit(xs[col]);start=xs[col];mat=next;}
   }
   emit(width/2);
  }
  return wall;
 }
 function interior(g,p,i){
  const {w,d,zone}=p;
  k.floor(g,0,.035,0,w-.7,d-.7,'wood');
  k.box(g,0,.065,.1,w*.42,.025,d*.65,zone==='mage'?'purple':'rug');
  const tableX=p.infill?-w*.28:-w*.24,tableZ=p.infill?-d*.05:-d*.17,chairOffset=p.infill?.95:1.2;
  table(g,tableX,0,tableZ,p.infill?1.6:2.3,p.infill?1:1.4);chair(g,tableX,0,tableZ-chairOffset);chair(g,tableX,0,tableZ+chairOffset,Math.PI);
  k.cyl(g,tableX,1.25,tableZ,.24,.2,.12,'gold',12);k.cyl(g,tableX+.55,1.35,tableZ,.09,.09,.25,'iron',8);
  const shelfX=w/2-.95;
  k.box(g,shelfX,1.6,-d*.18,1.05,3.2,3.7,'timber',true);
  for(let yy=.65;yy<3;yy+=.75){k.box(g,shelfX-.53,yy,-d*.18,.08,.12,3.6,'wood');for(let j=0;j<6;j++)k.box(g,shelfX-.55,yy+.28,-d*.18-1.3+j*.48,.24,.42,.28,j%3===0?'redRoof':j%3===1?'purple':'banner');}
  if(zone==='dwarven'){
   k.box(g,-w*.25,.6,-d*.39,2.8,1.2,2.1,'darkStone',true);k.box(g,-w*.25,1.24,-d*.39,2,.14,1.4,'glow');
   k.box(g,0,1,-d*.35,1.5,.5,.7,'iron',true);k.cyl(g,0,.4,-d*.35,.5,.4,.8,'timber',8);
  }else{
   const bedZ=Math.max(-d*.35,-d/2+1.6);
   k.box(g,0,.42,bedZ,2.1,.72,2.4,'timber',true);k.box(g,0,.86,bedZ,1.95,.18,2.2,zone==='mage'?'purple':'white');k.box(g,0,.99,bedZ-.65,1.6,.18,.6,'white');
  }
  barrel(g,w*.26,0,d*.25,.8);k.lamp(g,-w*.38,0,-d*.34);
  // Rafters are above the player, leaving the central entrance-to-room axis clear.
  for(const z of [-d*.3,0,d*.3])k.box(g,0,4.9,z,w-.6,.25,.25,'timber');
 }
 function house(p,i){
  const g=new THREE.Group();g.name=`${zoneNames[p.zone]} ${i+1}`;g.position.set(p.x,p.zone==='harbor'?coords.harborY:coords.cityY,p.z);g.rotation.y=p.rot;g.userData.grounded=true;city.add(g);
  const {w,d,zone}=p,h=p.h??(zone==='embassy'?10:9.4+(i%4)*.85),doorW=zone==='embassy'?4:2.6,doorH=3.65,wall=.55;
  const base=zone==='dwarven'?'darkStone':'stone',top=zone==='old'?'plaster':'stone',roof=zone==='mage'?'purple':zone==='old'?'redRoof':'roof';
  // The facade's door and four principal windows, plus both upper windows on
  // each side, are actual holes through the 0.55 m wall. Attic/dormer windows
  // remain decorative; their roofs are not included in the visitable floor.
  k.box(g,0,h/2,-d/2,w,h,wall,base,true);
  const frontWindows=[-1,1].flatMap(side=>[{x:side*w*.29,y:2.4,w:1.45,h:1.9},{x:side*w*.29,y:6.6,w:1.4,h:2.05}]);
  wallWithOpenings(g,w,h,wall,0,d/2,0,[{x:0,y:doorH/2,w:doorW,h:doorH},...frontWindows],(x,y)=>Math.abs(x)<doorW/2&&y>doorH?top:base);
  g.userData.windowHoles=frontWindows.map(hole=>({x:hole.x,y:hole.y,z:d/2,dx:0,dz:1,w:hole.w,h:hole.h}));
  for(const side of [-1,1]){
   const sideWindows=[-d*.28,d*.25].map(z=>({x:-side*z,y:6.5,w:1.25,h:2}));
   wallWithOpenings(g,d,h,wall,side*(w/2-wall/2),0,side*Math.PI/2,sideWindows,()=>base);
   g.userData.windowHoles.push(...[-d*.28,d*.25].map(z=>({x:side*(w/2-wall/2),y:6.5,z,dx:side,dz:0,w:1.25,h:2})));
  }
  // Upper-storey half-timber framing, corner quoins, and broad cornices give depth at street level.
  for(const side of [-1,1]){
   for(let yy=.5;yy<h;yy+=1.1)k.box(g,side*(w/2-.15),yy,d/2+.12,.75,.48,.8,'trim');
   k.box(g,side*(w/2-.35),h*.52,d/2+.35,.24,h,.25,'timber');
  }
  k.box(g,0,4.5,d/2+.35,w+.25,.3,.35,'timber');k.box(g,0,h-.15,d/2+.32,w+.8,.35,.5,'trim');
  // Separate plinth and weathered stone courses make the street facade meet the paving.
  for(const side of [-1,1]){
   const span=(w-doorW)/2,x=side*(doorW/2+span/2);
   k.box(g,x,.22,d/2+.16,span,.42,.45,'darkStone');
   const count=Math.max(2,Math.floor(span/.9));
   for(let j=0;j<count;j++)k.box(g,x-span/2+(j+.5)*span/count,.79,d/2+.3,span/count-.045,.43,.16+(j%3)*.025,j%3===0?'trim':base);
  }
  for(const side of [-1,1]){k.box(g,side*(doorW/2+.16),doorH/2,d/2+.42,.32,doorH,.6,'trim');k.box(g,side*(doorW/2+.36),.4,d/2+.42,.58,.8,.68,'darkStone');}
  k.box(g,0,doorH+.12,d/2+.4,doorW+.85,.4,.7,'trim');
  // Door is held open against the inside wall, outside the 2.6 m clear opening.
  k.box(g,-doorW/2-.12,1.65,d/2-.9,.16,3.3,1.55,'wood');
  k.floor(g,0,.015,d/2+.5,doorW+.4,1.6,'paving');
  for(const side of [-1,1]){
   const x=side*w*.29;
   k.window(g,x,2.4,d/2+.35,1.45,1.9);k.window(g,x,6.6,d/2+.35,1.4,2.05);
   const greenStreet=zone==='cathedral'||zone==='mage'||zone==='trade';
   plantBox(g,x,5.1,d/2+.68,1.8,greenStreet&&i%2===0,i*3+side+2);
   if((zone==='cathedral'||(zone==='trade'&&i%3===0)||zone==='mage'&&i%4===0)&&w>=8){
    plantBox(g,x,1.01,d/2+.7,w<9?1.1:1.5,true,i*5+side+3);
   }
   for(const z of [-d*.28,d*.25])k.window(g,side*(w/2+.05),6.5,z,1.25,2,side*Math.PI/2);
   if(zone==='old')k.beam(g,[x-1.2,4.65,d/2+.44],[x+1.2,h-.35,d/2+.44],.13,'timber');
  }
  const rh=zone==='dwarven'?3.1:4.1+(i%3)*.55;
  k.roof(g,0,h,0,w+1.35,d+1.2,rh,roof);
  tiledRoof(g,w,d,h,rh,roof,i);
  for(const side of [-1,1]){k.beam(g,[side*(w/2+.8),h+.06,d/2+.7],[0,h+rh+.12,d/2+.7],.17,'trim');k.box(g,side*(w/2+.65),h,0,.32,.28,d+1.7,'timber');}
  k.window(g,0,h+1.2,d/2+.64,1.4,1.7);
  if(i%2===0){const dorm=new THREE.Group();dorm.position.set(w*.27,h+.8,-d*.15);dorm.rotation.y=Math.PI/2;g.add(dorm);k.box(dorm,0,.8,0,2.7,1.9,2.3,'plaster');k.roof(dorm,0,1.7,0,3.2,2.7,1.3,roof);k.window(dorm,0,.7,1.2,.9,1.2);}
  // Chimneys differ in the forge district; all emerge through the roof, never float.
  k.box(g,-w*.27,h+1.4,-d*.26,1.25,4.8,1.3,zone==='dwarven'?'iron':'darkStone');k.box(g,-w*.27,h+3.85,-d*.26,1.6,.35,1.65,'trim');
  if(zone==='dwarven')k.cyl(g,w*.3,h+2,-d*.28,.62,.62,5,'gold',12);
  shieldSign(g,w*.38,4.15,d/2+.4,zone);
  if((zone==='trade'||zone==='cathedral'||zone==='north'||zone==='harbor')&&i%3!==1)shopAwning(g,w,d/2,i);
  if(i%3===0)k.banner(g,-w*.4,6.9,d/2+.6,1.15,2.7);
  interior(g,p,i);
  const front=d/2+1.35;
  const door={id:`home-${i+1}`,name:g.name,zone,x:p.x+Math.sin(p.rot)*front,y:g.position.y,z:p.z+Math.cos(p.rot)*front,heading:p.rot+Math.PI,inside:{x:p.x+Math.sin(p.rot)*(d/2-2),z:p.z+Math.cos(p.rot)*(d/2-2)},width:doorW,height:doorH};
  g.userData.interior=door;city.userData.interiors.push(door);
  if(zone==='embassy'){
   for(const side of [-1,1]){k.cyl(g,side*(w/2-2),6,d/2+1,.35,.45,12,'trim',12);k.banner(g,side*(w/2-2),6,d/2+1.5,2.2,4.3);}
  }
  if(zone==='mage'){k.tree(g,-w/2-1,0,-d/2+1,.65);plantBox(g,w*.34,.05,d/2+1,2.2);}
  if(zone==='harbor'){
   barrel(g,-w*.38,0,d/2+.8);crate(g,w*.38,0,d/2+.8,1.1);crate(g,w*.38,.99,d/2+.8,.8);
   for(let coil=0;coil<4;coil++){
    const rope=k.mesh(g,new THREE.TorusGeometry(.28+coil*.085,.055,5,18),'sand',-w*.29,.16+coil*.018,d/2+1.18);rope.rotation.x=Math.PI/2;
   }
   k.beam(g,[w*.38,0,d/2+1.75],[w*.38,2.2,d/2+1.75],.12,'timber');
   k.beam(g,[w*.38,1.85,d/2+1.75],[w*.38+.9,1.85,d/2+1.75],.1,'timber');
  }
  if(p.infill){
   // Door-side life stays inside the plot's front-corner strip, away from the opening.
   plantBox(g,w*.36,.03,d/2+.55,1.25);
   if(zone==='dwarven'){barrel(g,-w*.36,0,d/2+.6,.65);}
   else if(i%3===0){k.box(g,-w*.34,.55,d/2+.55,1.25,.12,.65,'wood');for(const dx of [-.44,.44])k.box(g,-w*.34+dx,.25,d/2+.55,.12,.5,.45,'timber');}
  }
  if(i%2===0)k.lamp(g,-w/2+.5,0,d/2+1.25);
  if((zone==='cathedral'||zone==='trade')&&i%2===0){
   foliage(g,-w/2+.55,.16,d/2+.36,.65,4.2,i+37,true);
   // Wall-foot greenery is confined to the corner, never the entrance's central strip.
   foliage(g,w/2-.6,.32,d/2+.5,.65,.42,i+81);
  }
  return g;
 }
 coords.plots.forEach(house);

 // Connect selected aligned facades into a street frontage, with an explicit 2.6 m opening
 // through every link. The city layout and all door positions remain unchanged.
 function distanceToSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
 const roadSegments=coords.routes.flatMap(r=>r.slice(1).map((b,i)=>[r[i],b]));
 let frontageLinks=0;
 for(let i=0;i<coords.plots.length;i++)for(let j=i+1;j<coords.plots.length;j++){
  const a=coords.plots[i],b=coords.plots[j];
  if(a.zone!==b.zone||!['trade','cathedral','old','north'].includes(a.zone)||Math.abs(a.rot-b.rot)>.01)continue;
  const dx=b.x-a.x,dz=b.z-a.z,along=dx*Math.cos(a.rot)-dz*Math.sin(a.rot),across=dx*Math.sin(a.rot)+dz*Math.cos(a.rot);
  const gap=Math.abs(along)-(a.w+b.w)/2;if(Math.abs(across)>1||gap<4||gap>10)continue;
  const sign=Math.sign(along),middle=(sign*a.w/2+along-sign*b.w/2)/2,front=Math.min(a.d,b.d)/2+.35;
  const x=a.x+Math.cos(a.rot)*middle+Math.sin(a.rot)*front,z=a.z-Math.sin(a.rot)*middle+Math.cos(a.rot)*front;
  if(roadSegments.some(([u,v])=>distanceToSegment(x,z,u,v)<7))continue;
  const g=new THREE.Group();g.name='街屋花槽与藤架';g.position.set(x,coords.cityY,z);g.rotation.y=a.rot;g.userData.grounded=true;city.add(g);
  const length=(gap-2.6)/2;
  for(const side of [-1,1]){
   const xx=side*(1.3+length/2);
   k.box(g,xx,.35,0,length,.7,.8,'stone',true);k.box(g,xx,.74,0,length+.1,.12,.94,'trim');
   for(let q=0;q<Math.ceil(length/.6);q++){const px=xx-length/2+.3+q*.6;k.sphere(g,px,1.02,0,.3,'leaf');if(q%2===0)k.sphere(g,px,1.2,.1,.12,'flower');}
   k.box(g,side*(gap/2-.2),2,0,.13,4,.13,'timber',true);
  }
  k.box(g,0,4,0,gap+.5,.17,.22,'timber');
  for(let q=0;q<6;q++){const xx=(q/5-.5)*gap;k.box(g,xx,4.14,0,.09,.14,1.1,'timber');if(q%2===0)k.sphere(g,xx,4.18,0,.38,'leaf');}
  frontageLinks++;
 }
 city.userData.frontageLinks=frontageLinks;

 function stall(x,z,rot,style){
  const g=new THREE.Group();g.name='Market stall';g.position.set(x,coords.cityY,z);g.rotation.y=rot;g.userData.grounded=true;city.add(g);
  k.box(g,0,.9,0,3.4,1.8,1.4,'wood',true);
  for(const dx of [-1.7,1.7])for(const dz of [-.7,.7])k.cyl(g,dx,1.8,dz,.07,.09,3.6,'timber',6);
  for(let j=0;j<6;j++){const a=k.box(g,(j-2.5)*.6,3.3,0,.6,.12,2.6,j%2?'white':style);a.rotation.x=-.12;k.box(g,(j-2.5)*.6,3.03,1.25,.6,.5,.08,j%2?'white':style);}
  for(let j=0;j<4;j++){k.box(g,(j-1.5)*.75,1.84,0,.63,.12,.7,'timber');for(let q=0;q<4;q++)k.sphere(g,(j-1.5)*.75+(q%2-.5)*.23,2.05,(Math.floor(q/2)-.5)*.25,.16,j%2?'gold':'flower');}
  barrel(g,2.3,0,0,.8);
 }
 stall(coords.trade.x-11,coords.trade.z+12,.4,'banner');stall(coords.trade.x+11,coords.trade.z-9,-.3,'redRoof');
 stall(coords.old.x-6,coords.old.z+9,Math.PI/2,'redRoof');

 // Deep-run tram: gear crown and recessed tunnel, with a walkable platform.
 function tram(){
  const g=new THREE.Group();g.name='矿道地铁入口';g.position.set(coords.dwarven.x+2,coords.cityY,coords.dwarven.z-35);g.userData.grounded=true;city.add(g);
  k.floor(g,0,.02,-3,10,10,'darkStone');k.arch(g,0,0,0,5.5,4.2,2,'darkStone',1.2);
  k.box(g,0,4,-7,9,8,.8,'darkStone',true);for(const side of [-1,1])k.box(g,side*4.2,3.4,-3.5,.7,6.8,7,'darkStone',true);
  k.box(g,0,6.8,-3.5,8.5,.65,7,'darkStone');k.box(g,0,3.2,-6.55,5.5,5.5,.1,'iron');
  for(const x of [-1.1,1.1])k.box(g,x,.08,-3,.1,.14,7,'iron');for(let z=-6;z<1;z++)k.box(g,0,.04,z,3,.1,.2,'wood');
  const ring=k.mesh(g,new THREE.TorusGeometry(2.7,.43,8,24),'gold',0,7.5,.15);
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;const tooth=k.box(g,Math.sin(a)*3,7.5+Math.cos(a)*3,.15,.72,.85,.6,'iron');tooth.rotation.z=-a;}
  ring.userData.role='Dwarven tram gear';k.lamp(g,-4.4,0,1.4);k.lamp(g,4.4,0,1.4);
 }
 tram();

 function sail(g,width,height,baseY,z,material=sailMaterial,crest=true){
  const vertices=[],uv=[],indices=[],nx=10,ny=7;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const u=i/nx,v=j/ny;vertices.push((u-.5)*width*(.84+.16*v),baseY+v*height+Math.sin(Math.PI*u)*.45*(1-v),z+Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*1.45);uv.push(u,v);}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+nx+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  k.mesh(g,geo,material);k.beam(g,[-width/2,baseY+height,z],[width/2,baseY+height,z],.12,'timber');
  for(const side of [-1,1])k.beam(g,[side*width*.42,baseY,z],[side*width/2,baseY+height,z],.035,'timber');
  if(crest)k.banner(g,0,baseY+height*.54,z+1.5,1.8,2.8);
 }
 function ship(x,z,scale,rot,variant=0){
  const g=new THREE.Group();g.name='联盟远洋帆船';g.position.set(x,coords.seaY,z);g.rotation.y=rot;g.scale.setScalar(scale);g.userData.role='Ship hull intentionally intersects sea level';city.add(g);
  const rings=[[-14,.2],[-11,2.3],[-7,4],[0,4.7],[7,4.1],[11,3],[13,1.6]];
  const profile=[[-1,2.7],[-.9,.6],[-.45,-1.3],[0,-1.7],[.45,-1.3],[.9,.6],[1,2.7]],verts=[],uv=[],idx=[];
  for(let r=0;r<rings.length;r++)for(let s=0;s<profile.length;s++){const [zz,ww]=rings[r],[px,py]=profile[s];verts.push(px*ww,py+(r===0?1:0),zz);uv.push(r/6,s/6);}
  for(let r=0;r<rings.length-1;r++)for(let s=0;s<profile.length-1;s++){const a=r*7+s,b=a+7;idx.push(a,a+1,b,b,a+1,b+1);}
  const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));hull.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));hull.setIndex(idx);hull.computeVertexNormals();k.mesh(g,hull,'timber');
  // Top deck follows the vessel silhouette, avoiding rectangular overhangs at the bow.
  const outline=new THREE.Shape();rings.forEach(([zz,ww],i)=>i?outline.lineTo(-ww,zz):outline.moveTo(-ww,zz));[...rings].reverse().forEach(([zz,ww])=>outline.lineTo(ww,zz));outline.closePath();
  const deck=k.mesh(g,new THREE.ExtrudeGeometry(outline,{depth:.2,bevelEnabled:false}),'wood',0,2.7,0);deck.rotation.x=Math.PI/2;deck.userData.walkable=true;
  for(const side of [-1,1]){
   for(let r=0;r<rings.length-1;r++){const [za,wa]=rings[r],[zb,wb]=rings[r+1];k.beam(g,[side*wa,3.5,za],[side*wb,3.5,zb],.11,'gold');k.beam(g,[side*wa,1.3,za],[side*wb,1.3,zb],.17,'gold');}
   rings.forEach(([zz,ww])=>k.beam(g,[side*ww,2.7,zz],[side*ww,3.5,zz],.07,'iron'));
   for(let j=0;j<7;j++){const port=k.cyl(g,side*4.25,1.8,-6+j*2,.24,.24,.12,'iron',12);port.rotation.z=Math.PI/2;}
  }
  k.box(g,0,4,8,6.5,2.6,6,'banner');k.roof(g,0,5.4,8,7.1,6.4,1.5,'roof');for(const xx of [-2,0,2])k.window(g,xx,4.3,11.1,.9,1.1);
  for(const [zz,hh,ww] of [[-4,22,12],[5,17,9]]){
   k.cyl(g,0,hh/2+2,zz,.16,.32,hh,'timber',10);
   const cloth=variant===0?sailMaterial:agedSail;
   if(variant===1&&zz===5){
    sail(g,ww,2.6,hh-2.6,zz,cloth,false);
    const roll=k.cyl(g,0,hh+5,zz,.23,.3,ww*.66,cloth,8);roll.rotation.z=Math.PI/2;
    for(const xx of [-ww*.25,0,ww*.25]){const tie=k.mesh(g,new THREE.TorusGeometry(.3,.035,5,12),'timber',xx,hh+5,zz);tie.rotation.y=Math.PI/2;}
    k.beam(g,[-ww*.36,hh+5.1,zz],[ww*.36,hh+5.1,zz],.09,'timber');
   }else{sail(g,ww,7,hh-7,zz,cloth);sail(g,ww*.66,4.8,hh+.2,zz,cloth);}
   for(const side of [-1,1]){k.beam(g,[side*4,2.9,zz-4],[0,hh+1,zz],.035,'timber');k.beam(g,[side*4,2.9,zz+4],[0,hh+1,zz],.035,'timber');}
   k.banner(g,0,hh+3.2,zz,1.1,2.6,Math.PI/2);
  }
  k.beam(g,[0,2.8,-10],[0,6,-19],.19,'timber');k.beam(g,[0,6,-19],[0,19,-4],.04,'timber');
  k.sphere(g,0,3.7,-13.6,.55,'gold');barrel(g,-2.5,2.8,1);crate(g,2.2,2.8,-1,1.4);k.lamp(g,-2.6,2.8,9);
 }
 ship(coords.harbor.x-20,coords.harbor.z+29,1,0);ship(coords.harbor.x-22,coords.harbor.z-5,.84,.05,1);ship(coords.harbor.x-20,coords.harbor.z-39,.95,-.04,2);
 city.userData.enterableHouseCount=city.userData.interiors.length;
 city.userData.trueWindowOpeningCount=coords.plots.length*8;
 city.userData.decorativeWindows='阁楼与屋顶老虎窗为装饰面；前立面4窗及两侧各2主窗均为几何洞口。';
 city.userData.shipCount=3;
 return city;
}
