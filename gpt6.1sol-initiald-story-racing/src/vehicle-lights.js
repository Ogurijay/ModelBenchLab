import * as T from 'three';

// Lamp housings stay solid; the lens and its reflector are separate surfaces.
// Each car owns its emissive materials, so braking never lights another car.
export function buildVehicleLights(factory,trim,body,p,car,Parts,deckHeight){
  const rig=new T.Group();rig.name='vehicle-lighting';body.add(rig);
  const fronts=new T.Group(),tails=new T.Group();fronts.name='front-lenses';tails.name='rear-lenses';rig.add(fronts,tails);
  const head=new Parts(fronts),rear=new Parts(tails),z=p.length/2;
  const black=factory.mat('#10171c'),paint=factory.mat(car.color),silver=factory.mat('#8e9ea6');
  const lens=(role,color,opacity)=>{
    const mat=new T.MeshPhongMaterial({color,specular:'#ffffff',shininess:120,transparent:opacity<1,opacity,depthWrite:true,side:T.DoubleSide});
    mat.name='lamp-'+role;mat.userData.vehicleLampRole=role;return mat;
  };
  const white=lens('head','#d4d8c6',.86),red=lens('tail','#9f1728',.92),amber=lens('signal','#bd7227',.94),clear=factory.mat('#b7c2bf');
  const reflector=factory.mat('#c3cbd0'),rib=factory.mat('#8e9791'),deepRed=factory.mat('#681724');
  const glow=factory.decal('lamp-halo',(ctx,w,h)=>{
    const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w*.5);
    g.addColorStop(0,'rgba(255,241,198,.75)');g.addColorStop(.18,'rgba(255,224,167,.28)');g.addColorStop(.55,'rgba(255,212,156,.07)');g.addColorStop(1,'rgba(255,212,156,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  },128,128).clone();glow.name='lamp-glow';glow.userData.vehicleLampRole='glow';glow.blending=T.AdditiveBlending;glow.opacity=0;glow.forceSinglePass=true;
  const glowParts=new Parts(fronts),beamAnchors=[];
  function halo(parts,x,y,z,width){parts.add(new T.PlaneGeometry(width,width*.7),glow,x,y,z);}
  function anchor(parent,x,y,z,side){const a=new T.Object3D();a.name='beam-anchor:'+side;a.position.set(x,y,z);parent.add(a);beamAnchors.push(a);}
  function round(parts,mat,r,x,y,z,back=false){
    const dome=new T.SphereGeometry(r,16,8,0,Math.PI*2,0,Math.PI/2);dome.rotateX(Math.PI/2);if(back)dome.rotateY(Math.PI);
    // A shallow convex lens with real depth, not a painted circular disc.
    dome.scale(1,1,.17);return parts.add(dome,mat,x,y,z);
  }
  function disc(parts,mat,r,x,y,z,back=false){const geo=new T.CircleGeometry(r,20);if(back)geo.rotateY(Math.PI);return parts.add(geo,mat,x,y,z);}
  function rectLens(parts,mat,w,h,x,y,z,role='plain'){
    parts.box(black,w+.035,h+.035,.046,x,y,z-.025);parts.box(reflector,w-.012,h-.012,.022,x,y,z-.008);
    parts.box(mat,w,h,.016,x,y,z+.009);
    for(let i=1;i<8;i++)parts.box(rib,.003,h*.90,.003,x-w/2+w*i/8,y,z+.019);
    if(role==='sealed'){
      const ring=new T.TorusGeometry(h*.33,.006,5,20);parts.add(ring,silver,x,y,z+.026);
      disc(parts,reflector,h*.22,x,y,z-.003);parts.box(rib,w*.86,.004,.003,x,y,z+.025);
    }
  }
  const fy=p.nose-.105,ty=p.tail-.155;
  if(p.popup){
    const width=car.id==='fc'?.465:.45,depth=.46,raise=.64;
    for(const side of [-1,1]){
      const x=side*p.width*.305,hingeZ=z-.68,hingeY=deckHeight(p,hingeZ)+.008;
      trim.box(black,width+.018,.018,depth+.018,x,hingeY-.14,hingeZ+depth/2);
      const pod=new T.Group();pod.name='headlamp:'+side;pod.userData.openAngle=-raise;pod.position.set(x,hingeY,hingeZ);body.add(pod);
      const shell=new Parts(pod),slope=(deckHeight(p,hingeZ+depth)-deckHeight(p,hingeZ))/depth;
      const cap=[[-width/2,.008,0],[width/2,.008,0],[width/2,.008+slope*depth,depth],[-width/2,.008+slope*depth,depth]];
      shell.face(paint,cap);shell.line(cap,true);
      for(const s of [-1,1])shell.face(black,[[s*width/2,.008,0],[s*width/2,.008+slope*depth,depth],[s*width/2,-.205,depth],[s*width/2,-.06,0]]);
      shell.face(black,[[-width/2,-.205,depth],[width/2,-.205,depth],[width/2,-.06,0],[-width/2,-.06,0]]);shell.finish(factory.ink,factory.vertexPaint,factory.vertexLamp);
      const face=new T.Group();face.name='headlamp-lens';face.position.set(0,-.078,depth-.025);face.rotation.x=raise;face.visible=false;pod.add(face);
      const beam=new Parts(face);rectLens(beam,white,width-.075,.213,0,0,0,'sealed');beam.finish(factory.ink,factory.vertexPaint,factory.vertexLamp);
      const shine=new Parts(face);halo(shine,0,0,.027,width*1.6);shine.finish(factory.ink,factory.vertexPaint,factory.vertexLamp);anchor(face,0,0,.034,side);
      rectLens(head,amber,.17,.074,side*p.width*.37,.442,z+.08);
    }
    trim.box(black,p.width*.51,.085,.022,0,fy-.023,z+.015);
    trim.box(black,car.id==='fc'?.77:.58,.13,.024,0,.382,z+.082);
    for(let i=0;i<3;i++)trim.box(silver,car.id==='fc'?.69:.50,.008,.005,0,.346+i*.037,z+.099);
    if(car.id==='ae86')for(const side of [-1,1]){
      trim.box(black,.20,.123,.085,side*.35,.352,z+.11);rectLens(head,white,.157,.085,side*.35,.351,z+.16);
    }
    else for(const side of [-1,1])rectLens(head,white,.21,.077,side*.57,.405,z+.096);
  }else if(car.id==='gtr'){
    for(const side of [-1,1]){
      const x=side*.47;trim.box(black,.53,.183,.052,x,fy,z+.024);
      rectLens(head,white,.40,.147,x-side*.04,fy+.005,z+.052);
      for(const dx of [-.085,.085]){
        const cx=x+dx;disc(head,black,.063,cx,fy+.006,z+.066);disc(head,reflector,.055,cx,fy+.006,z+.068);round(head,white,.042,cx,fy+.006,z+.070);
      }
      trim.face(black,[[side*.69,fy-.076,z+.026],[side*.80,fy-.064,z-.025],[side*.80,fy+.086,z-.063],[side*.69,fy+.082,z+.026]]);
      head.face(amber,[[side*.70,fy-.065,z+.035],[side*.786,fy-.054,z-.012],[side*.786,fy+.072,z-.043],[side*.70,fy+.071,z+.035]]);
      for(let i=0;i<2;i++)trim.box(black,.22,.068,.032,side*.52,.345+i*.10,z+.090);
      anchor(rig,x,fy,z+.078,side);halo(glowParts,x,fy,z+.083,.65);
    }
    trim.box(black,.43,.12,.035,0,fy,z+.024);for(let i=0;i<2;i++)trim.box(silver,.41,.014,.007,0,fy-.030+i*.06,z+.046);
    trim.box(black,.62,.185,.03,0,.374,z+.084);for(let i=0;i<6;i++)trim.box(silver,.59,.008,.008,0,.304+i*.025,z+.101);
  }else if(car.id==='benz'){
    trim.box(silver,.68,.36,.035,0,fy-.055,z+.027);trim.box(black,.606,.308,.04,0,fy-.055,z+.048);
    for(let i=0;i<5;i++)trim.box(silver,.59,.015,.02,0,fy-.16+i*.055,z+.075);trim.box(silver,.019,.31,.02,0,fy-.055,z+.079);
    for(const side of [-1,1]){
      rectLens(head,white,.42,.194,side*.603,fy-.05,z+.064);rectLens(head,amber,.070,.194,side*.851,fy-.05,z+.038);
      rectLens(head,white,.25,.074,side*.56,.385,z+.090);anchor(rig,side*.61,fy-.05,z+.087,side);halo(glowParts,side*.61,fy-.05,z+.097,.75);
    }
    const ornament=new T.RingGeometry(.041,.050,20);trim.add(ornament,silver,0,p.nose+.085,z-.28);
    for(let i=0;i<3;i++){const a=Math.PI/2+i*Math.PI*2/3;trim.line([[0,p.nose+.085,z-.28],[Math.cos(a)*.04,p.nose+.085+Math.sin(a)*.04,z-.28]]);}
    for(const end of [-1,1])trim.box(silver,p.width*.91,.022,.022,0,.45,end*(z+.10));
  }else if(p.van){
    trim.box(silver,.76,.18,.025,0,.755,z+.027);trim.box(black,.69,.115,.029,0,.752,z+.044);trim.box(silver,.67,.015,.016,0,.764,z+.068);
    for(const side of [-1,1]){
      trim.face(black,[[side*.42,.76,z+.025],[side*.76,.83,z-.03],[side*.76,1.00,z-.045],[side*.42,.93,z+.025]]);
      head.face(white,[[side*.44,.784,z+.034],[side*.735,.846,z-.021],[side*.735,.97,z-.033],[side*.44,.91,z+.034]]);
      round(head,white,.06,side*.58,.86,z+.035);rectLens(head,amber,.07,.10,side*.73,.86,z+.025);
      disc(head,black,.062,side*.54,.4,z+.098);round(head,white,.04,side*.54,.4,z+.105);
      anchor(rig,side*.58,.86,z+.063,side);halo(glowParts,side*.58,.86,z+.073,.56);
    }
  }else{
    const evo=car.id.startsWith('evo');
    for(const side of [-1,1]){
      const x=side*p.width*.31;rectLens(head,white,evo?.385:.415,.147,x-side*.02,fy+.006,z+.056);
      rectLens(head,amber,.075,.147,x+side*.217,fy+.006,z+.020);
      if(evo){const r=car.id==='evo3'?.105:.085;disc(head,black,r+.033,side*.55,.399,z+.119);disc(head,silver,r+.012,side*.55,.399,z+.123);round(head,white,r,side*.55,.399,z+.130);}
      anchor(rig,x,fy,z+.081,side);halo(glowParts,x,fy,z+.091,.60);
    }
    trim.box(black,evo?.45:.39,.12,.033,0,fy,z+.028);trim.box(black,evo?.70:.57,.17,.025,0,.382,z+.098);
    for(let i=0;i<5;i++)trim.box(silver,evo?.66:.52,.007,.004,0,.321+i*.029,z+.115);
    if(evo){
      for(const x of [-.36,.36])trim.box(paint,.05,.21,.055,x,.394,z+.13);
      const badge=factory.mat('#b42c2d',true);trim.face(badge,[[0,fy+.047,z+.052],[-.026,fy+.002,z+.052],[0,fy-.005,z+.052],[.026,fy+.002,z+.052]]);
      for(const side of [-1,1])trim.face(badge,[[side*.006,fy-.012,z+.052],[side*.032,fy-.013,z+.052],[side*.045,fy-.045,z+.052],[side*.019,fy-.045,z+.052]]);
    }
  }
  // The rear lens zones have actual separators and distinct brake / indicator areas.
  if(car.id==='gtr'||car.id==='fc'){
    const fc=car.id==='fc';trim.box(black,p.width*.91,.246,.024,0,ty,-z-.015);
    for(const side of [-1,1])for(const [x,r] of fc?[[.57,.09],[.345,.086]]:[[.575,.113],[.325,.098]]){
      disc(rear,black,r+.025,side*x,ty,-z-.035,true);disc(rear,deepRed,r+.008,side*x,ty,-z-.039,true);round(rear,red,r,side*x,ty,-z-.045,true);
      const ring=new T.TorusGeometry(r*.70,.004,4,20);rear.add(ring,deepRed,side*x,ty,-z-.065);
      if(!fc)disc(rear,red,r*.29,side*x,ty,-z-.067,true);
    }
    for(const side of [-1,1]){
      rear.box(amber,fc?.054:.078,.042,.023,side*.67,ty-.075,-z-.048);
      rear.box(clear,.084,.035,.024,side*.23,ty-.075,-z-.049);
    }
  }else if(p.van){
    for(const side of [-1,1]){
      trim.box(black,.155,.40,.025,side*.713,.91,-z-.026);
      rear.box(red,.112,.185,.025,side*.713,.98,-z-.044);rear.box(amber,.112,.079,.027,side*.713,.844,-z-.046);rear.box(clear,.112,.057,.027,side*.713,.770,-z-.046);
    }
    trim.box(silver,.31,.025,.035,0,1.04,-z-.025);
  }else{
    const width=car.id==='benz'?.57:car.id.startsWith('evo')?.52:.53;
    for(const side of [-1,1]){
      const x=side*(p.width*.5-width*.5-.06);trim.box(black,width+.038,.192,.029,x,ty,-z-.020);
      rear.box(red,width*.64,.134,.025,x-side*width*.135,ty+.005,-z-.039);
      rear.box(amber,width*.27,.134,.025,x+side*width*.337,ty+.005,-z-.040);
      rear.box(clear,width*.22,.052,.026,x-side*width*.28,ty-.036,-z-.044);
      for(let i=0;i<3;i++)rear.box(deepRed,width*.60,.006,.004,x-side*width*.135,ty-.045+i*.04,-z-.055);
    }
    if(p.panda)trim.box(black,p.width*.25,.163,.024,0,ty,-z-.026);
  }
  if(!p.panda)rear.box(red,.28,.024,.017,0,p.van?1.56:p.deck+(p.height-p.deck)*.12,p.glassRear+(p.roofRear-p.glassRear)*.12-.018);
  // Weld fixed housings / ribs into the shell's existing colour batch. Only
  // movable pods and independently lit lens materials need their own draws.
  for(const parts of [head,rear]){
    const dynamic=[];
    for(const mesh of parts.meshes){if(mesh.material.isMeshToonMaterial)trim.meshes.push(mesh);else dynamic.push(mesh);}parts.meshes=dynamic;
  }
  head.meshes.push(...glowParts.meshes);
  head.finish(factory.ink,factory.vertexPaint,factory.vertexLamp);rear.finish(factory.ink,factory.vertexPaint,factory.vertexLamp);
}
