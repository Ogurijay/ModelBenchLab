// District foundations deliberately remain separate, so the canals are real gaps.
export function build(ctx) {
  const {THREE,coords:c,kit:k,materials}=ctx;
  const world=new THREE.Group();world.name='terrain';world.userData.grounded=true;
  const part=name=>{const g=new THREE.Group();g.name=name;g.userData.grounded=true;world.add(g);return g;};
  const land=part('district-foundations'), bridges=part('canal-bridges'), roads=part('paved-routes');
  const coast=part('harbor-and-coast'), forest=part('elwynn-and-northern-hills'), walls=part('outer-ramparts');
  const detail=part('quayside-life');
  const wetStone=materials.darkStone.clone();wetStone.color.set('#66766c');wetStone.roughness=.96;
  const warmPaving=materials.paving.clone();warmPaving.color.set('#b4aa8c');
  const palePaving=materials.paving.clone();palePaving.color.set('#ded3b4');
  const shallowWater=new THREE.MeshStandardMaterial({color:'#7baf99',metalness:.15,roughness:.43,transparent:true,opacity:.3,depthWrite:false});
  const Y=c.cityY;
  function water(parent,x,y,z,w,d,mat='water') {
    const m=k.mesh(parent,new THREE.PlaneGeometry(w,d,16,16),mat,x,y,z);m.rotation.x=-Math.PI/2;
    m.castShadow=false;m.userData.water=true;return m;
  }
  water(coast,-310,c.seaY,-90,6000,6000,'sea');
  // Elevated fresh-water basin behind the sea wall. Stone plates occlude only land.
  water(land,14,c.waterY,-42,350,286);
  const splitAtLake=([x,z,w,d])=>{
    const l=x-w/2,r=x+w/2,t=z-d/2,b=z+d/2,L=c.lake.x-34,R=c.lake.x+34,T=c.lake.z-22,B=c.lake.z+22;
    if(r<=L||l>=R||b<=T||t>=B)return [[x,z,w,d]];
    const rects=[];const add=(a,q,e,f)=>{if(e-a>.01&&f-q>.01)rects.push([(a+e)/2,(q+f)/2,e-a,f-q]);};
    add(l,t,Math.min(r,L),b);add(Math.max(l,R),t,r,b);
    add(Math.max(l,L),t,Math.min(r,R),Math.min(b,T));add(Math.max(l,L),Math.max(t,B),Math.min(r,R),b);return rects;
  };
  for(const [x,z,w,d] of c.land.flatMap(splitAtLake)) {
    // Keep structural tops below the walkable cap; coplanar faces cause stripes.
    k.box(land,x,3.45,z,w,8.8,d,'darkStone');
    k.floor(land,x,Y,z,w,d,'paving');
    for(const s of [-1,1]) {
      k.box(land,x,6.6,z+s*d/2,w+.2,1.8,.6,'stone');
      k.box(land,x,7.6,z+s*d/2,w+.8,.5,.9,'trim');
      k.box(land,x+s*w/2,6.6,z,.6,1.8,d,'stone');
      k.box(land,x+s*w/2,7.6,z,.9,.5,d+.8,'trim');
    }
  }
  // Connected, non-rectangular streets are actual solids and walkable surfaces.
  // The original plots stay fixed while the former oversized pools become city.
  for(const extension of c.landExtensions||[]) {
    const shape=new THREE.Shape();extension.points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
    const foundation=k.mesh(land,new THREE.ExtrudeGeometry(shape,{depth:Y-.08,bevelEnabled:false}),'darkStone');foundation.rotation.x=-Math.PI/2;
    const floor=k.mesh(land,new THREE.ShapeGeometry(shape),extension.surface,0,Y+.08,0);floor.rotation.x=-Math.PI/2;floor.userData.walkable=true;
    floor.name=extension.id;
    // Coping remains below foot level: it cannot close the connections to old streets.
    for(let i=0;i<extension.points.length;i++) {
      const a=extension.points[i],b=extension.points[(i+1)%extension.points.length];
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),g=new THREE.Group();
      g.position.set((a[0]+b[0])/2,0,(a[1]+b[1])/2);g.rotation.y=Math.atan2(dx,dz);land.add(g);
      k.box(g,0,6.6,0,.65,2.6,length,'stone');k.box(g,0,7.78,0,.9,.32,length+.1,'trim');
    }
  }
  // Water stains, irregular shallow ribbons and projecting buttresses soften the
  // engineered quays without changing the already-tested street boundaries.
  function quay(a,b,normal) {
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/3),angle=Math.atan2(b[0]-a[0],b[1]-a[1]);
    const geo=new THREE.PlaneGeometry(2.3,length,1,steps),p=geo.attributes.position;
    for(let i=0;i<p.count;i++){const q=p.getY(i);if(p.getX(i)>0)p.setX(i,1.15+.4*Math.sin(q*.7)+.2*Math.cos(q*1.7));}
    const ribbon=k.mesh(detail,geo,shallowWater,(a[0]+b[0])/2+normal[0]*1.15,c.waterY+.075,(a[1]+b[1])/2+normal[1]*1.15);
    ribbon.rotation.set(-Math.PI/2,0,-angle);ribbon.userData.water=true;ribbon.castShadow=false;
    for(let i=1;i<length/8;i++) {
      const t=i*8/length,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,g=new THREE.Group();
      g.position.set(x,0,z);g.rotation.y=angle;detail.add(g);
      k.box(g,0,5.8,0,1.2,3.4,1.45,wetStone);k.box(g,0,7.35,0,1.65,.35,1.8,'trim');
      k.box(g,0,4.95,0,1.45,.26,1.6,wetStone);
      if(i%3===1){const outlet=k.mesh(g,new THREE.TorusGeometry(.34,.12,5,12),wetStone,normal[0]*.8,6.1,normal[1]*.8);outlet.rotation.y=normal[0]?Math.PI/2:0;}
    }
  }
  quay([-45,-36],[-45,37],[-1,0]);quay([-116,-118],[-116,-43],[-1,0]);
  quay([-31,-36],[32,-36],[0,-1]);quay([-58,2],[-134,2],[0,-1]);
  quay([38,-77],[38,-5],[-1,0]);quay([-110,-23],[-32,-23],[0,1]);
  // Two water-access stair recesses sit outside the main walking lanes.
  for(const [x,z,rot] of [[-45,22,Math.PI/2],[-91,-23,0]]) {
    const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;detail.add(g);
    for(let i=0;i<7;i++)k.box(g,0,Y-.3-i*.42,1.8+i*.45,3.2,.42,.7,i>3?wetStone:'stone');
    for(const side of [-1,1])k.beam(g,[side*1.7,Y+.6,1.3],[side*1.7,Y-1.8,4.9],.09,'iron');
  }
  function segment(parent,a,b,width,y,mat='paving') {
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    const f=k.floor(parent,(a[0]+b[0])/2,y,(a[1]+b[1])/2,width,len+.15,mat);
    f.rotation.y=Math.atan2(dx,dz);return f;
  }
  function bridge(a,b,width=10,hero=false) {
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),g=new THREE.Group();
    g.position.set((a[0]+b[0])/2,0,(a[1]+b[1])/2);g.rotation.y=Math.atan2(dx,dz);bridges.add(g);
    g.name=hero?'heroes-causeway':'stone-arch-bridge';
    k.floor(g,0,Y+.025,0,width,len+.5,'paving');
    const spans=Math.max(1,Math.round(len/13)),span=len/spans;
    for(let i=0;i<spans;i++) {
      const z=-len/2+(i+.5)*span,r=span*.40,h=3.2;
      const s=new THREE.Shape();s.moveTo(-span/2,0);s.lineTo(-r,0);
      s.bezierCurveTo(-r,h*.9,-r*.45,h,0,h);s.bezierCurveTo(r*.45,h,r,h*.9,r,0);
      s.lineTo(span/2,0);s.lineTo(span/2,h+.45);s.lineTo(-span/2,h+.45);s.closePath();
      const geo=new THREE.ExtrudeGeometry(s,{depth:.65,bevelEnabled:false,curveSegments:10});
      for(const side of [-1,1]) {
        const m=k.mesh(g,geo.clone(),'stone',side*(width/2-.65),Y-h-.7,z);
        m.rotation.y=Math.PI/2;
        k.box(g,side*(width/2-.35),Y+.6,z,.7,1.2,span+.1,'stone',true);
        k.box(g,side*(width/2-.35),Y+1.27,z,.95,.22,span+.15,'trim');
      }
    }
    const nodeSpacing=Math.max(5,len/Math.ceil(len/8));
    for(let node=0,z=-len/2;z<=len/2+.1;node++,z+=nodeSpacing)for(const side of [-1,1]) {
      k.box(g,side*(width/2-.3),Y+.8,z,1,1.6,1,'trim',true);
      if(hero&&node%2===0) {
        const lamp=new THREE.Group();lamp.name='low-hero-lantern';lamp.position.set(side*(width/2-.3),Y+1.6,z);lamp.scale.set(.85,.6,.85);g.add(lamp);
        k.cyl(lamp,0,.18,0,.34,.44,.36,'stone',8);k.cyl(lamp,0,.43,0,.23,.32,.18,'gold',8);
        k.lamp(lamp,0,.45,0);
        k.box(lamp,0,4.58,0,.91,.23,.91,'iron');k.cyl(lamp,0,4.84,0,0,.63,.38,'iron',4);
        k.box(lamp,0,3.84,0,.74,.16,.74,'gold');
        for(const s of [-1,1])k.beam(lamp,[s*.34,4.61,-.34],[s*.34,4.61,.34],.08,'iron');
      }
    }
    return g;
  }
  for(const b of c.bridges)bridge(b.a,b.b,b.w);
  bridge([c.gate.x,c.gate.z-5],[20,36],c.heroes.w,true);
  // The five hero monuments sit on stone bastions tied into the causeway.
  const heroBastions=new THREE.Group();heroBastions.name='hero-statue-bastions';
  heroBastions.position.set(c.heroes.x,0,c.heroes.z);
  heroBastions.rotation.y=Math.atan2(c.gate.x-c.heroes.x,c.gate.z-c.heroes.z);bridges.add(heroBastions);
  for(const [x,z] of [[-12,19],[12,16],[-12,0],[12,-5],[-12,-21]]) {
    k.box(heroBastions,x,3.6,z,6.8,8.2,7.4,'darkStone');
    k.box(heroBastions,x,6.7,z,8,1.4,8.2,'stone');
    k.floor(heroBastions,Math.sign(x)*10.5,Y,z,10,8.5,'trim');
    k.box(heroBastions,x,7.6,z,8.5,.45,8.5,'trim');
  }
  // The entry apron meets the gate opening without a slab across the canal below.
  k.box(land,c.gate.x,3.75,107,35,8.2,38,'darkStone');
  k.floor(land,c.gate.x,Y,107,35,38,'paving');
  for(const [routeIndex,route] of c.routes.entries())for(let i=1;i<route.length;i++)segment(roads,route[i-1],route[i],7.5,Y+(routeIndex>=7?.13:.04));
  segment(roads,[0,-55],[0,-95],7.5,Y+.13);
  segment(roads,[-27,-76],[0,-76],5,Y+.13);
  // The new southern terraces have garden rooms and a smaller neighborhood square.
  // Keep all planting outside the street centre-lines and established door approaches.
  function gardenBed(x,z,rx,rz,trees=0) {
    const g=new THREE.Group();g.position.set(x,Y+.08,z);detail.add(g);g.name='garden-terrace';
    const border=k.cyl(g,0,.12,0,1,1,.24,'trim',32,true);border.scale.set(rx,1,rz);
    const soil=k.cyl(g,0,.25,0,1,1,.07,'soil',32);soil.scale.set(rx-.3,1,rz-.3);
    for(let i=0;i<28;i++) {
      const t=i/28*Math.PI*2,r=.78+(i%3)*.04;
      const plant=k.mesh(g,new THREE.IcosahedronGeometry(.42+(i%2)*.12,0),i%4?'leafLight':'flower',Math.cos(t)*rx*r,.65,Math.sin(t)*rz*r);
      plant.scale.y=.8+(i%3)*.2;
    }
    if(trees)for(let i=0;i<trees;i++)k.tree(g,(i-(trees-1)/2)*rx*.65,.3,0,.6+i*.12);
  }
  gardenBed(-39,84,12,5,2);gardenBed(-39,59,10,3.5,1);gardenBed(-7,88,7,3.5,1);
  gardenBed(113,40,3,3,1);gardenBed(149,47,2.7,7,2);
  const neighborhoodSquare=k.mesh(roads,new THREE.CircleGeometry(10.5,48),warmPaving,113,Y+.115,40);neighborhoodSquare.rotation.x=-Math.PI/2;
  const neighborhoodRing=k.mesh(roads,new THREE.RingGeometry(10,10.5,48),'trim',113,Y+.13,40);neighborhoodRing.rotation.x=-Math.PI/2;
  for(const [x,z,rot] of [[-25,88,Math.PI/2],[-42,75,0],[-5,79,Math.PI/2],[118,48,0],[106,39,Math.PI/2]]) {
    const g=new THREE.Group();g.position.set(x,Y+.08,z);g.rotation.y=rot;detail.add(g);
    k.box(g,0,.65,0,3.2,.16,.85,'wood',true);k.box(g,0,1.15,-.34,3.2,.75,.13,'wood',true);
    for(const side of [-1,1])k.box(g,side*1.1,.3,0,.2,.6,.65,'iron',true);
  }
  for(const [x,z] of [[-27,57],[-52,86],[15,89],[78,30],[133,72],[151,31]])k.lamp(detail,x,Y+.08,z);
  // Circular plaza motifs keep the primary roads readable from above.
  for(const [x,z,r] of [[0,0,18],[-99,49,20],[-66,-53,18]]) {
    const disc=k.mesh(roads,new THREE.CircleGeometry(r,64),palePaving,x,Y+.12,z);disc.rotation.x=-Math.PI/2;disc.userData.walkable=true;
    const ring=k.mesh(roads,new THREE.RingGeometry(r-.55,r,64),'darkStone',x,Y+.145,z);ring.rotation.x=-Math.PI/2;
    for(let band=0;band<4;band++) {
      const inner=2.5+band*3.7,outer=Math.min(r-.9,inner+3.55);
      for(let sector=0;sector<16;sector++){
        const wedge=k.mesh(roads,new THREE.RingGeometry(inner,outer,6,1,sector*Math.PI/8+.006,Math.PI/8-.012),(sector+band)%3===0?warmPaving:palePaving,x,Y+.135,z);
        wedge.rotation.x=-Math.PI/2;
      }
    }
    // Narrow stone drainage slots only on the outer edge, below step height.
    for(let i=0;i<12;i++) {
      const t=i*Math.PI/6,g=new THREE.Group();g.position.set(x+Math.cos(t)*(r-.25),Y+.15,z+Math.sin(t)*(r-.25));g.rotation.y=-t;roads.add(g);
      k.box(g,0,0,0,.35,.025,1.6,'iron');for(let n=-3;n<=3;n++)k.box(g,0,.02,n*.21,.42,.03,.09,'darkStone');
    }
  }
  // Low harbor has room to pass the warehouses on their seaward side.
  k.box(coast,-190,-1.05,-143,42,5,190,'darkStone');k.floor(coast,-190,c.harborY,-143,42,190,'paving');
  k.box(coast,-211,.6,-143,1.4,1.8,190,'stone');
  for(const z of [-105,-140,-174,-208]) {
    k.box(coast,-233,.2,z,48,2.5,5,'darkStone');k.floor(coast,-233,c.harborY,z,48,5,'paving');
    for(let x=-251;x<-214;x+=7)for(const side of [-1,1]) {
      k.cyl(coast,x,.2,z+side*2.3,.6,.75,3.4,'timber',8);
      k.cyl(coast,x,2.05,z+side*2.3,.45,.5,.8,'iron',8);
    }
  }
  // Cargo clusters hug the waterside; the established x=-199 walking lane is clear.
  function crate(g,x,y,z,s=1.2){
    k.box(g,x,y+s*.5,z,s,s,s,'wood',true);
    for(const side of [-1,1])for(const offset of [-.38,.38])k.box(g,x+side*s*.51,y+s*.5,z+offset*s,.08,s,.12,'timber');
    k.beam(g,[x-s*.48,y+.08,z+s*.51],[x+s*.48,y+s-.08,z+s*.51],.08,'timber',4);
    for(const zz of [-.4,.4])k.box(g,x,y+s+.035,z+zz*s,s,.07,.12,'timber');
  }
  function coil(g,x,y,z,r=.7){for(let i=0;i<5;i++){const t=k.mesh(g,new THREE.TorusGeometry(r-i*.1,.035,4,24),'sand',x,y+.05+i*.017,z);t.rotation.x=Math.PI/2;}}
  for(const [n,z] of [-94,-129,-161,-194].entries()) {
    const g=new THREE.Group();g.name='harbor-cargo-cluster';g.position.set(-205.2,c.harborY,z);detail.add(g);
    for(const [x,zz,s] of [[0,0,1.6],[-1.6,1.3,1.25],[1.1,1.5,1.1]])crate(g,x,0,zz,s);
    crate(g,0,1.6,0,1.15);coil(g,-1.4,.03,-1.5,.75);
    for(const [x,zz] of [[1.4,-1],[-1.9,-.2]]) {
      k.cyl(g,x,.7,zz,.42,.48,1.4,'wood',12,true);
      for(const y of [.2,1.15])k.cyl(g,x,y,zz,.46,.46,.1,'iron',12);
    }
    if(n%2===0){
      k.box(g,-2.3,.16,-3.4,1.6,.32,1.8,'stone');k.beam(g,[-2.3,.2,-3.4],[-2.3,6.5,-3.4],.22,'timber');
      k.beam(g,[-2.3,6.5,-3.4],[-7.4,5.9,-3.4],.22,'timber');k.beam(g,[-2.3,2.3,-3.4],[-6.8,5.9,-3.4],.16,'timber');
      k.beam(g,[-7.1,5.9,-3.4],[-7.1,2.4,-3.4],.035,'sand');
      const hook=k.mesh(g,new THREE.TorusGeometry(.24,.065,5,12,Math.PI*1.55),'iron',-7.1,2.25,-3.4);hook.rotation.z=-.8;
      const wheel=k.mesh(g,new THREE.TorusGeometry(.68,.1,5,18),'iron',-2.3,1.4,-2.9);for(let q=0;q<4;q++)k.beam(g,[-2.3,1.4,-2.9],[-2.3+Math.cos(q*Math.PI/2)*.7,1.4+Math.sin(q*Math.PI/2)*.7,-2.9],.055,'timber');
    }
  }
  for(let z=-84;z>=-218;z-=19){
    k.cyl(detail,-209.1,c.harborY+.4,z,.25,.35,.8,'iron',8,true);
    k.box(detail,-209.1,c.harborY+.75,z,.95,.18,.27,'iron');coil(detail,-207.8,c.harborY+.04,z+.4,.48);
  }
  // Continuous 7.3% sloped route from Lion's Rest to harbor, with horizontal landings.
  function slope(a,b,width) {
    const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),horizontal=Math.hypot(d.x,d.z);
    const g=new THREE.Group();g.position.copy(A.clone().add(B).multiplyScalar(.5));g.rotation.y=Math.atan2(d.x,d.z);coast.add(g);
    const m=k.box(g,0,-.18,0,width,.36,d.length(),'paving');m.rotation.x=-Math.atan2(d.y,horizontal);m.userData.walkable=true;
    for(const side of [-1,1]) {
      const rail=k.box(g,side*(width/2-.3),.65,0,.6,1.25,d.length(),'stone',true);rail.rotation.x=m.rotation.x;
      const trim=k.box(g,side*(width/2-.3),1.34,0,.85,.18,d.length(),'trim');trim.rotation.x=m.rotation.x;
    }
  }
  k.floor(coast,-155,Y,-12,12,18,'paving');
  slope([-161,Y,-12],[-192,c.harborY,-72],11);
  k.floor(coast,-191,c.harborY,-72,17,20,'paving');
  // Exterior green land starts beyond the canal banks, not beneath the water surface.
  for(const [x,z,w,d] of [[92,174,330,130],[235,-15,140,470],[-13,-267,390,90]].flatMap(splitAtLake)) {
    k.box(forest,x,2.85,z,w,10,d,'soil');k.floor(forest,x,Y,z,w,d,'grass');
  }
  segment(roads,[63,122],[63,231],13,Y+.06,'paving');
  // Entrance-only landscape finishing. These accents never alter the navigation
  // surface or add colliders: a clear paved centre remains available throughout.
  const shoulder=part('gate-road-shoulders');
  const darkGrass=materials.grass.clone();darkGrass.color.set('#697d47');
  const paleGrass=materials.grass.clone();paleGrass.color.set('#84945c');
  const dustyStone=materials.paving.clone();dustyStone.color.set('#a99f81');
  function vergePatch(x,z,rx,rz,phase,material){
    const shape=new THREE.Shape();for(let i=0;i<11;i++){
      const t=i/11*Math.PI*2,r=1+.17*Math.sin(i*2.7+phase),xx=Math.cos(t)*rx*r,zz=Math.sin(t)*rz*r;
      if(i)shape.lineTo(xx,zz);else shape.moveTo(xx,zz);
    }shape.closePath();
    const mesh=k.mesh(shoulder,new THREE.ShapeGeometry(shape),material,x,Y+.025,z);mesh.rotation.x=-Math.PI/2;
  }
  for(let i=0;i<12;i++)for(const side of [-1,1]) {
    const z=132+i*6.6,x=63+side*(9+(i%4)*1.7),phase=i*1.37+side;
    vergePatch(x,z,3+(i%3),4+(i%4),phase,i%3?darkGrass:paleGrass);
    // Broken gravel shoulders follow the road without becoming a straight border.
    for(let j=0;j<4;j++) {
      const sx=63+side*(6.9+(j%2)*.55+.22*Math.sin(i*1.8)),sz=z+j*.7;
      const rock=k.mesh(shoulder,new THREE.IcosahedronGeometry(.12+(j%3)*.09,0),j%2?'stone':dustyStone,sx,Y+.08,sz);
      rock.scale.set(1.8,.6,1.1);rock.rotation.y=i*.7+j;
    }
    // Individual blade clusters have differing height and lean, with no sphere crowns.
    for(let j=0;j<3;j++) {
      const gx=x+(j-1)*.65,gz=z+Math.sin(i+j)*1.4;
      for(let blade=0;blade<4;blade++) {
        const h=.25+((i+j+blade)%4)*.09;
        const tuft=k.mesh(shoulder,new THREE.ConeGeometry(.055,h,3),blade%2?'grass':'leafLight',gx+(blade-1.5)*.09,Y+h*.48,gz);
        tuft.rotation.z=(blade-1.5)*.18;tuft.rotation.y=i+blade;
      }
    }
  }
  // Broken cart-wheel wear lies near the road margins, never over the clear centre.
  for(const side of [-1,1])for(let i=0;i<15;i++) {
    const z=130+i*5.4,x=63+side*(4.6+.12*Math.sin(i*.75));
    const mark=k.box(shoulder,x,Y+.075,z,.15,.012,2.6+(i%3)*.5,dustyStone);mark.rotation.y=.025*Math.sin(i);
  }
  // North lake cuts through its own shoreline terrace.
  const lake=new THREE.Shape();lake.absellipse(c.lake.x,c.lake.z,32,20,0,Math.PI*2,false,0);
  const lakeMesh=k.mesh(forest,new THREE.ShapeGeometry(lake,48),'water',0,c.waterY,0);lakeMesh.rotation.x=-Math.PI/2;
  // Shape y maps to -world z when rotated onto ground; translate to the intended lake centre.
  lakeMesh.position.z=c.lake.z*2;lakeMesh.userData.water=true;lakeMesh.castShadow=false;
  for(let i=0;i<40;i++) {
    const t=i/40*Math.PI*2,x=c.lake.x+34*Math.cos(t),z=c.lake.z+22*Math.sin(t);
    const rock=k.mesh(forest,new THREE.IcosahedronGeometry(1.7+(i%3)*.3,0),'darkStone',x,4.5,z);rock.scale.set(1.4,1,1.1);
  }
  // Wall segments leave gate, district passages and the harbor descent open.
  function rampart(a,b,h=8) {
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),g=new THREE.Group();
    g.position.set((a[0]+b[0])/2,Y,(a[1]+b[1])/2);g.rotation.y=Math.atan2(dx,dz);walls.add(g);
    k.box(g,0,h/2,0,3,h,len,'stone',true);k.box(g,0,h+.1,0,3.7,.5,len+.5,'trim');
    for(let z=-len/2+1;z<len/2;z+=4)k.box(g,0,h+1,z,3.5,1.7,1.9,'stone');
  }
  for(const [a,b,h] of [ [[-141,98],[43,98],7],[[83,98],[153,65],9],[[153,65],[178,-98],9],[[178,-98],[177,-192],10],[[177,-192],[138,-228],8],[[-143,96],[-154,9],7],[[-158,-30],[-158,-92],8],[[-158,-92],[-140,-156],9] ])rampart(a,b,h);
  for(const [x,z] of [[-142,98],[154,64],[177,-98],[177,-192],[-158,-91],[-140,-155]]) {
    k.cyl(walls,x,Y+6,z,4.4,5.2,12,'stone',12,true);k.cyl(walls,x,Y+12,z,5,5,.8,'trim',12);
    k.cyl(walls,x,Y+15,z,0,5.7,5.5,'roof',12);
  }
  let seed=713;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<230;i++) {
    const band=i%3,x=band===0?-65+rand()*330:band===1?196+rand()*95:-185+rand()*390;
    const z=band===0?128+rand()*105:band===1?-240+rand()*420:-254-rand()*40;
    if(Math.abs(x-63)<12&&z>120)continue;
    const scale=.8+rand()*1.4;
    if(i%4===0) {
      k.cyl(forest,x,Y+2.4*scale,z,.17*scale,.4*scale,4.8*scale,'timber',7,true);
      for(let tier=0;tier<4;tier++)k.cyl(forest,x,Y+(3.5+tier*1.1)*scale,z,.1,(2.9-tier*.55)*scale,3.5*scale,tier%2?'leaf':'leafLight',7);
    }else {
      k.tree(forest,x,Y,z,scale);
      if(i%3===0)for(const side of [-1,1])k.beam(forest,[x,Y+1.9*scale,z],[x+side*1.8*scale,Y+4.2*scale,z+.7*scale],.16*scale,'timber');
    }
  }
  // Varied shoreline rocks mask the rectangular soil cut only outside travel routes.
  for(let i=0;i<24;i++) {
    const x=-75+(i%3)*1.5,z=116+i*4.8,r=3+rand()*2;
    const rock=k.mesh(forest,new THREE.IcosahedronGeometry(r,1),i%3?'soil':'darkStone',x,3.5,z);rock.scale.set(1.2,.85,1.5);
  }
  // Layered northern mountain silhouettes use coarse faceted geometry intentionally.
  for(let i=0;i<22;i++) {
    const x=-230+i*30,z=-335-rand()*65,rad=34+rand()*22;
    const m=k.mesh(forest,new THREE.IcosahedronGeometry(rad,1),'mountain',x,8,z);m.scale.set(1.3,1+rand()*.8,1.3);
  }
  // Lamps mark bridge landings and the safe main approach.
  for(const [x,z] of [[66.4,118.1],[83.6,107.9],[-48,-5],[-48,5],[6,-69],[-6,-69],[-183,-69],[-199,-90],[-199,-136],[-199,-183]])k.lamp(roads,x,x<-169?c.harborY:Y,z);
  world.userData.walkRoutes={heroes:[[63,112],[63,88],[42,58],[20,36],[0,12]],harbor:[[-125,-13],[-155,-12],[-161,-12],[-192,-72],[-199,-112]]};
  return world;
}
