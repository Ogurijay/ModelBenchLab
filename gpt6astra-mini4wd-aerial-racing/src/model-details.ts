import * as THREE from 'three';
import {material,mesh,box,cylinder,surfacePoint} from './models';
const paints=new Map();
const paint=(color)=>{if(!paints.has(color))paints.set(color,material(color,.37,color==='#acb3bc'?.7:0));return paints.get(color);};
function polyOn(surface,points,color,name='paint-region'){
 const {rows,side}=surface.userData.surface;
 const shape=points.map(p=>new THREE.Vector2(...p)),tris=THREE.ShapeUtils.triangulateShape(shape,[]),verts=[],normals=[];
 const nx=12,nz=(rows.length-1)*8,sourcePos=surface.geometry.getAttribute('position'),sourceNormal=surface.geometry.getAttribute('normal');
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 function clip(poly,a,b,orientation){
   const out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p)*orientation,dq=cross(a,b,q)*orientation;
     if(dp>=-1e-9)out.push(p);if((dp>=0)!==(dq>=0))out.push(p.clone().lerp(q,dp/(dp-dq)));
   }return out;
 }
 for(const tr of tris){
   const shapeTri=tr.map(i=>shape[i]);
   const minx=Math.max(0,Math.floor(Math.min(...shapeTri.map(p=>p.x))*nx)),maxx=Math.min(nx-1,Math.floor(Math.max(...shapeTri.map(p=>p.x))*nx));
   const minz=Math.max(0,Math.floor(Math.min(...shapeTri.map(p=>p.y))*nz)),maxz=Math.min(nz-1,Math.floor(Math.max(...shapeTri.map(p=>p.y))*nz));
   for(let j=minz;j<=maxz;j++)for(let i=minx;i<=maxx;i++)for(const ix of [[0,1,2],[0,2,3]]){
     const uv=[new THREE.Vector2(i/nx,j/nz),new THREE.Vector2((i+1)/nx,j/nz),new THREE.Vector2((i+1)/nx,(j+1)/nz),new THREE.Vector2(i/nx,(j+1)/nz)];
     const ids=[j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i];
     const triangle=ix.map(k=>uv[k]),den=cross(...triangle);let clipped=shapeTri;
     for(let k=0;k<3;k++)clipped=clip(clipped,triangle[k],triangle[(k+1)%3],Math.sign(den));
     if(clipped.length<3)continue;
     const vertex=p=>{
       const w=[cross(triangle[1],triangle[2],p)/den,cross(triangle[2],triangle[0],p)/den,cross(triangle[0],triangle[1],p)/den];
       const position=new THREE.Vector3(),normal=new THREE.Vector3();for(let k=0;k<3;k++){position.addScaledVector(new THREE.Vector3().fromBufferAttribute(sourcePos,ids[ix[k]]),w[k]);normal.addScaledVector(new THREE.Vector3().fromBufferAttribute(sourceNormal,ids[ix[k]]),w[k]);}
       normal.normalize();if(normal.y<0)normal.negate();position.addScaledVector(normal,.09);return {position,normal};
     };
     for(let k=1;k<clipped.length-1;k++){
       const face=[vertex(clipped[0]),vertex(clipped[k]),vertex(clipped[k+1])];
       const cross=new THREE.Vector3().crossVectors(face[1].position.clone().sub(face[0].position),face[2].position.clone().sub(face[0].position));
       if(cross.dot(face[0].normal)<0)[face[1],face[2]]=[face[2],face[1]];
       for(const p of face){verts.push(...p.position.toArray());normals.push(...p.normal.toArray());}
     }
   }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
 const pm=paint(color).clone();pm.depthWrite=false;const m=mesh(surface,name,g,pm);m.renderOrder=10+(surface.userData.paintLayer=(surface.userData.paintLayer||0)+1)*.001;m.userData.paintRegion=true;m.userData.explodeWithParent=true;return m;
}
function lineOn(surface,points,color,width=.01,name='linework'){
 for(let i=0;i<points.length-1;i++){
   const a=new THREE.Vector2(...points[i]),b=new THREE.Vector2(...points[i+1]),d=b.clone().sub(a).normalize(),n=new THREE.Vector2(-d.y,d.x).multiplyScalar(width/2);
   polyOn(surface,[a.clone().add(n).toArray(),b.clone().add(n).toArray(),b.clone().sub(n).toArray(),a.clone().sub(n).toArray()],color,name);
 }
}
function pipe(parent,name,points,radius,mat,segments=24){return mesh(parent,name,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,8,false),mat);}
function label(parent,text,x,y,z,w,d,color='#ffffff',background=null,rotation=0){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
 if(background){ctx.fillStyle=background;ctx.fillRect(0,0,1024,256);}ctx.fillStyle=color;ctx.font='italic 900 155px Impact, "Arial Narrow", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
 const tw=ctx.measureText(text).width;ctx.save();ctx.translate(512,140);ctx.scale(Math.min(1,970/tw),1);ctx.fillText(text,0,0);ctx.restore();
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
 const m=mesh(parent,'lettering-'+text,new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));m.rotation.set(-Math.PI/2,0,rotation);m.position.set(x,y,z);return m;
}
const red='#e92135',blue='#003fa2',yellow='#ffca16',white='#f7f5e9',black='#111820',gold='#c7a755';
export function paintCar(root,car){
 const {parts,panelMeshes:ps,blueprint:bp}=root.userData;
 const each=(prefix,fn)=>Object.entries(ps).filter(([id])=>id.startsWith(prefix)).forEach(([id,p]:any)=>fn(p,id));
 const fill=(p,c)=>p.material=paint(c);
 const flame=(p,c=red)=>{
   polyOn(p,[[.05,.1],[.38,.17],[.22,.02],[.67,.28],[.5,.25],[.77,.5],[.73,.63],[.99,.91],[.55,.72],[.48,.92],[.33,.55],[.02,.73],[.23,.37]],c,'flame-major');
   polyOn(p,[[.09,.13],[.32,.21],[.29,.11],[.55,.32],[.41,.3],[.64,.55],[.49,.47],[.4,.67],[.32,.39]],c===yellow?red:yellow,'flame-tip');
 };
 const id=car.baseId||car.id;
 if(id==='cyclone'){
   each('wide-forked',p=>{polyOn(p,[[.39,.02],[.61,.02],[.74,.39],[.64,.65],[.83,.91],[.17,.91],[.36,.65],[.26,.39]],blue,'blue-center');for(const s of [0,1])polyOn(p,[[s?.72:.28,.21],[s?.9:.1,.36],[s?.79:.21,.55],[s?.74:.26,.4]],red,'nose-flash');});
   each('front-wedge',p=>{fill(p,blue);polyOn(p,[[.18,.15],[.8,.15],[.72,.67],[.42,.91]],yellow,'yellow-lamp');polyOn(p,[[.24,.18],[.5,.29],[.44,.74],[.36,.51]],'#ed8f1b','amber-lamp');});
   each('rear-shoulder',p=>{polyOn(p,[[.58,0],[1,0],[1,1],[.45,1],[.6,.75],[.35,.5]],blue,'blue-side');polyOn(p,[[.1,.09],[.62,.05],[.41,.26],[.9,.21],[.65,.43],[.36,.38],[.23,.61],[.75,.59],[.43,.95],[.57,.7],[.03,.8],[.17,.5],[.04,.34]],red,'lightning');});
   if(bp.wing){parts.wing.children.find(x=>x.name==='wing-plane').material=paint(blue);label(parts.wing,'CYCLONE MAGNUM',0,37.8,-56,70,11,yellow);}
   label(parts.shell,'MAGNUM',0,23.3,28,19,5,yellow);label(parts.shell,'豪',0,21.3,41,10,8,yellow);
 }else if(id==='hurricane'){
   each('central-ramp',p=>{polyOn(p,[[.32,0],[.68,0],[.8,.52],[.68,1],[.32,1],[.2,.52]],red,'red-center');lineOn(p,[[.3,.22],[.5,.4],[.7,.22]],yellow,.023);});
   each('front-wedge',p=>{fill(p,red);polyOn(p,[[0,0],[1,0],[1,.18],[.5,.09],[0,.19]],'#08634b','green-skirt');polyOn(p,[[.22,.24],[.84,.2],[.72,.58],[.42,.78]],white,'lamp-outline');polyOn(p,[[.27,.28],[.79,.25],[.62,.5],[.33,.49]],yellow,'lamp-yellow');});
   each('downturned',p=>fill(p,'#34353b'));
   each('wide-rear',p=>{polyOn(p,[[.62,.07],[1,.1],[1,1],[.62,.84]],red,'red-side');polyOn(p,[[.05,.03],[.64,.1],[.25,.43]],black,'triangular-intake');});
   const m=parts.wing.children.find(x=>x.name==='wing-plane');m.material=paint(red);label(parts.wing,'HURRICANE Sonic',0,37.8,-54,72,12,white);
   for(const side of [-1,1])for(let i=0;i<3;i++){box(parts.wing,`orange-flap-${side}-${i}`,side*29,32+i*1.3,-32-i*6,16,1.1,4,paint('#ed8024'));}
   label(parts.shell,'SONIC',0,22.4,33,18,5,white);label(parts.shell,'烈',0,19.6,44,8,7,yellow);
 }else if(id==='dagger'){
   each('outboard-knife',p=>flame(p));each('rear-flared',p=>flame(p));each('front-cross-tip',p=>{polyOn(p,[[0,.03],[1,.03],[1,.18],[0,.18]],yellow,'yellow-strip');});
   each('forebody-channel',p=>{for(const vv of [.13,.27,.41])lineOn(p,[[.04,vv],[.24,vv+.1],[.5,vv+.14],[.76,vv+.1],[.96,vv]],red,.035,'step-red-line');});
   each('fork-step',p=>lineOn(p,[[.06,.02],[.9,.49],[.9,.96]],'#c3c6c9',.018,'silver-pinstripe'));
   label(parts.shell,'Z',0,19.2,19,10,8,red,white);label(parts.wing,'TRIDAGGER  ZMC',0,42.8,-47,68,12,white);
 }else if(id==='evolution'){
   each('split-front',p=>{flame(p);polyOn(p,[[.13,.07],[.83,.07],[.86,.27],[.23,.37]],black,'lamp-recess');for(const u of [.34,.64]){const pts=[];for(let j=0;j<20;j++){const a=j*Math.PI*2/20;pts.push([u+Math.cos(a)*.12,.2+Math.sin(a)*.09]);}polyOn(p,pts,yellow,'round-lamp');}});
   each('trident',p=>lineOn(p,[[.62,.13],[.48,.36],[.56,.64]],red,.1));each('continuous-cockpit',p=>{polyOn(p,[[.57,.45],[.92,.54],[.79,.97],[.34,.88]],red,'side-fire');for(let i=0;i<3;i++)lineOn(p,[[.56+i*.15,.26],[.58+i*.15,.33]],black,.045,'vent-slot');});
   if(bp.wing){parts.wing.children.find(x=>x.name==='wing-plane').material=paint(black);label(parts.wing,'Proto Saber EVO',0,35.8,-53,59,12,yellow);}
   label(parts.shell,'J',0,26.6,8,9,5,yellow);
 }else if(id==='cobra'){
   each('rounded-front',p=>{flame(p,yellow);const ellipse=[];for(let i=0;i<32;i++){const a=i*Math.PI/16;ellipse.push([.52+Math.cos(a)*.28,.23+Math.sin(a)*.18]);}polyOn(p,ellipse,'#d9e8f0','oval-headlight');for(let i=0;i<7;i++)lineOn(p,[[.29+i*.075,.1],[.31+i*.07,.34]],'#667881',.009,'headlight-rib');});
   each('waisted',p=>{flame(p,yellow);polyOn(p,[[.65,.65],[.9,.73],[.7,.82],[.57,.73]],black,'side-intake');});each('cobra-fan',p=>flame(p));
   label(parts.shell,'SPIN COBRA',0,12.8,59,33,7,white);label(parts.wing,'COBRA',0,31.8,-52,35,8,white);
   for(const side of [-1,1])for(let i=0;i<3;i++){const o=box(parts.shell,`silver-louvre-${side}-${i}`,side*(8+i*.6),28-i*1.5,27+i*6,7.5,1.2,5,paint('#acb3bc'));o.rotation.x=-.22;box(parts.shell,`louvre-intake-${side}-${i}`,side*(8+i*.6),27.2-i*1.5,28.3+i*6,6,.7,3,paint(black));}
   for(const side of [-1,1])for(let i=0;i<3;i++)pipe(parts.shell,`fan-rib-${side}-${i}`,[[side*19,24,3],[side*(38-i*2),16,-12+i*6]],.5,paint(car.body),1);
 }else if(id==='spider'){
   for(const p of Object.values(ps) as any){
     if(p.name.startsWith('rear-high')){polyOn(p,[[.12,.08],[.65,.26],[.43,.28],[.95,.85],[.65,.72],[.61,.96],[.39,.48],[.16,.48]],red,'red-shoulder-arrow');continue;}
     for(let u=.12;u<1;u+=.235){const pts=[[u,0],[u-.065,.25],[u+.05,.5],[u-.06,.75],[u,1]];lineOn(p,pts,white,.043,'web-white');lineOn(p,pts,'#2095de',.022,'web-blue');}
     for(let z=.13;z<1;z+=.21){const pts=[[0,z+.04],[.25,z-.02],[.5,z+.04],[.75,z-.02],[1,z+.04]];lineOn(p,pts,white,.036,'web-white');lineOn(p,pts,'#2095de',.018,'web-blue');}
   }
   each('broad-connected',p=>{for(const side of [0,1])polyOn(p,[[side?.76:.08,.025],[side?.95:.24,.025],[side?.92:.3,.13],[side?.73:.12,.12]],red,'red-headlight');});
   label(parts.shell,'BS',0,27,21,12,8,yellow);
   parts.wing.children.find(x=>x.name==='wing-plane').visible=false;
   for(const side of [-1,1])for(let i=0;i<4;i++){const bar=box(parts.wing,`tail-louvre-${side}-${i}`,side*14,34+i*1.4,-33-i*7,25,1.2,4,paint(black));bar.rotation.y=side*.18;}
   label(parts.wing,'BEAK',-16,39.5,-55,22,6,white);label(parts.wing,'SPIDER',16,39.5,-55,22,6,white);
 }else if(id==='gigant'){
   for(const p of Object.values(ps) as any)for(let i=0;i<2;i++)polyOn(p,[[.12+i*.43,0],[.3+i*.4,.03],[.25+i*.4,.18],[.32+i*.36,.3],[.19+i*.4,.45],[.24+i*.4,.56],[.13+i*.4,.75],[.18+i*.4,1],[.08+i*.4,.92],[.05+i*.4,.67],[.14+i*.4,.48],[.12+i*.4,.28]],black,'tiger-stripe');
   each('separated-front',p=>{for(let i=0;i<5;i++)polyOn(p,[[.03,.012+i*.02],[.97,.012+i*.02],[.97,.022+i*.02],[.03,.022+i*.02]],yellow,'grille-line');});
   label(parts.shell,'G',0,15.8,50,15,11,gold);label(parts.shell,'BROCKEN',0,13.8,59,21,4,white);label(parts.shell,'Dr. OGAMI',0,20.9,-44,20,5,white);
 }else if(id==='stinger'){
   each('spear-shaped',p=>{polyOn(p,[[.46,.05],[.54,.05],[.65,.68],[.5,.91],[.35,.68]],'#9b8e76','central-stripe');for(const s of [0,1])polyOn(p,[[s?.57:.18,.025],[s?.8:.43,.025],[s?.76:.46,.17],[s?.55:.24,.12]],red,'red-eye');});
   each('crescent-front',p=>{for(let i=0;i<5;i++)polyOn(p,[[.3+i*.11,.17],[.38+i*.1,.2],[.33+i*.1,.3],[.44+i*.07,.41],[.38+i*.08,.57],[.26+i*.1,.49]],black,'fracture-mark');});
   each('jet-shoulder',p=>{for(let i=0;i<5;i++){const pts=[[i*.2,.59],[.08+i*.18,.7],[i*.2,.82],[.1+i*.17,.96]];lineOn(p,pts,black,.018,'black-fracture');lineOn(p,[[.03,.69],[.28,.76],[.47,.67],[.65,.8],[.91,.7]],black,.02,'cross-fracture');}});
 }
 if(car.customColor){for(const p of Object.values(ps) as any)p.material=paint(car.customColor);}
 // The canopy remains a separate assembly, allowing transparent interiors and exploded inspection.
 const window=parts.canopy.children[0] as THREE.Mesh;
 if(car.adaptation){window.material=new THREE.MeshPhysicalMaterial({color:'#e3edf2',roughness:.08,metalness:0,transparent:true,opacity:.42,transmission:.45,thickness:.7,ior:1.46,depthWrite:false,side:THREE.DoubleSide});}
 else window.material=material(car.canopy,.2,id==='dagger'||id==='spider'?.56:.23);
 window.material.flatShading=true;
 const frameMat=paint(id==='dagger'?'#aeb6bc':car.body);
 for(const side of [-1,1])pipe(parts.canopy,'canopy-edge-'+side,bp.canopy.map(([z,w,base,top])=>[side*w*.66,top+.15,z]),.5,frameMat,18);
}

export function addMechanicalDetails(root,car,build={}){
 const {parts,wheels,blueprint:bp,guideZ}=root.userData,id=car.baseId||car.id;
 const metal=material('#bac4cc',.23,.92),rubber=material('#111619',.91),dark=material('#222b2d',.62),rim=material(car.wheel,.27,car.adaptation?.92:.05),goldMat=material('#c2a75d',.28,.74);
 wheels.forEach((w,i)=>{
   const side=i%2?1:-1,width=i<2?8:10;
   w.children[0].material=rubber;
   const outer=side*(width/2+.12);
   cylinder(w,'rim-dish',outer,0,0,9.6,.7,rim);
   const rearDish=!car.adaptation&&i>=2?material('#'+new THREE.Color(car.wheel).multiplyScalar(.42).getHexString(),.38,.08):dark;
   cylinder(w,'rim-dark-recess',outer+side*.45,0,0,7.9,.2,rearDish);
   const torus=new THREE.TorusGeometry(9.3,.55,8,40);torus.rotateY(Math.PI/2);const ring=mesh(w,'rim-lip',torus,rim);ring.position.x=outer+side*.6;
   const isDeepRear=!car.adaptation&&i>=2;
   cylinder(w,'hub',outer+side*(isDeepRear?.15:.8),0,0,isDeepRear?1.8:2.8,isDeepRear?.3:1.5,rim);
   const spokes=isDeepRear?0:car.adaptation?(id==='cobra'?9:10):3;
   for(let j=0;j<spokes;j++){
     const a=j*Math.PI*2/spokes;
     const spoke=box(w,'spoke-'+j,outer+side*.7,Math.sin(a)*5,Math.cos(a)*5,1,car.adaptation?1.4:2.7,8.4,rim);spoke.rotation.x=-a;
   }
   if(id==='dagger'&&i<2){cylinder(w,'zmc-front-disc',outer+side*1.1,0,0,8.7,.35,material('#626975',.45,.7));}
   if(car.adaptation)for(let j=0;j<36;j++){
     const a=j*Math.PI/18,groove=box(w,'tread-'+j,0,Math.sin(a)*12.95,Math.cos(a)*12.95,width-.6,.3,.25,paint('#465051'));groove.rotation.x=-a;
   }
 });
 for(const z of [bp.axle,-bp.axle])cylinder(parts.chassis,'axle-'+z,0,13,z,1,78,metal);
 cylinder(parts.chassis,'propeller-shaft',15,8,0,.8,91,metal,'z');
 for(const x of [-23,23])box(parts.chassis,'side-frame-'+x,x,7,-17,10,2,29,paint(id==='dagger'||id==='spider'?'#0759b7':'#343b3d'));
 box(parts.gear,'gearbox',0,11,car.family==='front'?41:-41,30,11,13,paint(['dagger','spider','stinger'].includes(id)?'#058276':'#1f2f35'));
 const mz=car.family==='front'?27:-29;parts.motor.children[0].material=metal;cylinder(parts.motor,'motor-cap',13,13,mz,7.5,5,paint('#173b49'));
 for(let i=0;i<3;i++)box(parts.motor,'motor-vent-'+i,-4+i*4,20,mz,1.5,.3,6,dark);
 label(parts.motor,car.family==='front'?'SUPER FM':'POWER',0,20.7,mz,19,7,'#191919','#d9c98e');
 for(const cell of parts.battery.children){cell.material=material('#d1a11b',.33,.48);}for(const x of [-8,8]){cylinder(parts.battery,'cell-contact-'+x,x,11,24,2,1,metal,'z');label(parts.battery,'ASTRA',x,17.7,0,8,29,'#1a2228');}
 // Render guide rollers on an adapted racing chassis, while the gallery explains the Real model difference.
 parts.rollers.clear();
 for(const z of [guideZ,-guideZ])for(const x of [-38.5,38.5]){
   const color=z>0?(id==='stinger'?'#d7dce0':'#125ab8'):'#151b1c';
   cylinder(parts.rollers,'guide-disc',x,10,z,6.5,2.4,material(color,.3,.35),'y');
   cylinder(parts.rollers,'rubber-rim',x,9.7,z,6.6,.6,rubber,'y');cylinder(parts.rollers,'roller-bearing',x,11.5,z,2.1,.6,metal,'y');
   cylinder(parts.rollers,'roller-screw',x,12,z,1.2,.8,dark,'y');
   for(let j=0;j<6;j++){const a=j*Math.PI/3;cylinder(parts.rollers,'roller-hole',x+Math.cos(a)*4,11.3,z+Math.sin(a)*4,.6,.15,dark,'y',8);}
 }
 for(const x of [-40,40]){cylinder(parts.rollers,'side-guide',x,12,-15,4.7,2.1,paint('#07998b'),'y');cylinder(parts.rollers,'side-screw',x,13.5,-15,1.3,.9,metal,'y');}
 if(build.roller===1)for(const z of [guideZ,-guideZ])for(const x of [-38.5,38.5])cylinder(parts.rollers,'upper-bearing-guide',x,17,z,5.7,2,metal,'y');
 if(build.brake){parts.brake.children[0].material=paint(build.brake===2?'#dd3652':'#216fa7');}
 if(car.adaptation){
   const chrome=material('#c9d3db',.16,.93);box(parts.chassis,'display-mechanism',0,22,-1,16,6,45,chrome);
   for(const x of [-5,5]){cylinder(parts.chassis,'optical-lens',x,25,17,3.5,8,chrome,'z');cylinder(parts.chassis,'lens-glass',x,25,21.1,2.6,.3,paint('#153543'),'z');}
   for(let z=-22;z<16;z+=6)box(parts.chassis,'circuit-fin',0,25,z,13,1,1.5,chrome);
   box(parts.chassis,'control-chip',0,26,-20,9,1.1,8,dark);
   for(const x of [-10,10])cylinder(parts.chassis,'rear-exhaust',x,15,-59,3.5,9,chrome,'z');
 }
 if(id==='gigant'){
   for(const s of [-1,1])for(const sign of [-1,1])pipe(parts.shell,'wheel-protection-pipe',[[s*35,16,sign*27],[s*41,16,sign*30],[s*41,16,sign*59],[s*36,16,sign*63]],1.4,metal,12);
   for(const x of [-8,8])pipe(parts.shell,'rear-pipe',[[x,20,-42],[x,15,-57],[x,15,-64]],1.4,metal,12);
   for(const x of [-27,27]){box(parts.shell,'motor-bay-plate',x,23,18,10,1.3,16,metal);for(const z of [13,23])cylinder(parts.shell,'plate-fastener',x,23.8,z,.7,.4,dark,'y');}
   pipe(parts.shell,'front-bullbar',[[-8,14,65],[-8,16,67],[8,16,67],[8,14,65]],1.3,metal,8);
 }else if(id==='stinger'){
   for(const s of [-1,1]){
     const pts=[[s*17,21,5],[s*28,19,-1],[s*29,17,-13],[s*24,23,-25]];
     pipe(parts.shell,'segmented-gold-hose-'+s,pts,2.5,goldMat,32);
     const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)));
     for(let i=0;i<15;i++){const t=i/14,p=curve.getPoint(t),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),curve.getTangent(t));const ring=mesh(parts.shell,'hose-rib',new THREE.TorusGeometry(2.55,.22,5,12),dark);ring.position.copy(p);ring.quaternion.copy(q);}
     for(const x of [21,31]){
       const pod=new THREE.Group();pod.name='gold-nozzle';pod.position.set(s*x,34,-22);pod.rotation.x=-.38;parts.shell.add(pod);
       cylinder(pod,'nozzle-recess',0,0,0,3.9,2.7,dark,'z');const ring=mesh(pod,'gold-nozzle-ring',new THREE.TorusGeometry(3.7,.65,10,32),goldMat);ring.position.z=1.5;
       cylinder(pod,'nozzle-inner',0,0,1,2.8,.3,paint('#171a1b'),'z');
     }
   }
 }
}
