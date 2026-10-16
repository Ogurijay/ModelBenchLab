// Architectural miniatures. All dimensions are local park metres; roots sit on y=0.
export function build(ctx, l) {
  const { THREE, kit: k } = ctx;
  const g = new THREE.Group();
  g.name = `${l.id}-${l.name}`;
  g.userData.grounded = true;
  const stone = k.material('#d6c4a4');
  const pale = k.material('#f4ead6');
  const dark = k.material('#534b41');
  const marble = k.material('#f5f0e6', { roughness: .45 });
  const blue = k.material('#247e9b', { roughness: .3, metalness: .3 });

  function extrude(shape, depth, mat, x=0,y=0,z=0) {
    const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled:false, curveSegments:12 });
    geom.translate(0,0,-depth/2);
    return k.mesh(g,geom,mat,x,y,z);
  }
  function arch(w,h,t,depth,mat,x,y,z,rotation=0,pointed=false) {
    // A structural ring with a true opening, not a black rectangle on a solid wall.
    const s = new THREE.Shape(), r=w/2;
    s.moveTo(-r-t,0); s.lineTo(-r-t,h-r);
    if(pointed) { s.quadraticCurveTo(-r-t,h,0,h+t); s.quadraticCurveTo(r+t,h,r+t,h-r); }
    else s.absarc(0,h-r,r+t,Math.PI,0,true);
    s.lineTo(r+t,0); s.lineTo(r,0); s.lineTo(r,h-r);
    if(pointed) { s.quadraticCurveTo(r,h-.15,0,h); s.quadraticCurveTo(-r,h-.15,-r,h-r); }
    else s.absarc(0,h-r,r,0,Math.PI,false);
    s.lineTo(-r,0); s.closePath();
    const m=extrude(s,depth,mat,x,y,z); m.rotation.y=rotation; return m;
  }
  function ring(rx,rz,width,height,mat,y) {
    const s=new THREE.Shape(), hole=new THREE.Path();
    s.absellipse(0,0,rx,rz,0,Math.PI*2,false,0);
    hole.absellipse(0,0,rx-width,rz-width,0,Math.PI*2,true,0); s.holes.push(hole);
    const geo=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false,curveSegments:64});
    geo.rotateX(-Math.PI/2); return k.mesh(g,geo,mat,0,y,0);
  }
  function onionProfile(r,h) {
    const profile=[[.77,0],[.86,.10],[1,.32],[.94,.50],[.75,.68],[.42,.83],[.12,.95],[0,1]];
    const curve=new THREE.SplineCurve(profile.map(([a,b])=>new THREE.Vector2(a,b)));
    return curve.getPoints(64).map(p=>new THREE.Vector2(Math.max(0,p.x)*r,THREE.MathUtils.clamp(p.y,0,1)*h));
  }
  function onion(x,y,z,r,h,mat=marble) {
    return k.mesh(g,new THREE.LatheGeometry(onionProfile(r,h),64),mat,x,y,z);
  }
  function finial(x,y,z,h=1,mat='#d6b15e') {
    k.cylinder(g,.05,.065,h,mat,x,y+h/2,z,8); k.sphere(g,.15,mat,x,y+h*.45,z);
  }
  function stair(x,z,width,depth,height,steps,mat,rot=0) {
    const sg=new THREE.Group(); g.add(sg); sg.position.set(x,0,z); sg.rotation.y=rot;
    for(let i=0;i<steps;i++) k.box(sg,width,height/steps,depth/steps*(steps-i),mat,0,height/steps*(i+.5),-depth/steps*i/2);
  }

  if(l.id==='07') {
    const steel=k.material('#74594a',{metalness:.68,roughness:.44});
    const trim=k.material('#aa8461',{metalness:.52,roughness:.48});
    k.box(g,20,.25,20,'#c2b59c',0,.125,0);
    const levels=[{y:.3,r:8.3,w:1.3},{y:7.5,r:5.6,w:.75},{y:12.1,r:3.45,w:.57},{y:22.4,r:1.6,w:.35},{y:31.9,r:.62,w:.2}];
    for(const sx of [-1,1]) for(const sz of [-1,1]) {
      k.box(g,3.1,.6,3.1,stone,sx*8.3,.3,sz*8.3);
      for(let j=0;j<levels.length-1;j++) {
        const a=levels[j],b=levels[j+1],sub=Math.ceil((b.y-a.y)/1.5);
        // Four corner chords and cross braces on both visible leg faces.
        for(const ox of [-1,1]) for(const oz of [-1,1]) k.beam(g,[sx*a.r+ox*a.w/2,a.y,sz*a.r+oz*a.w/2],[sx*b.r+ox*b.w/2,b.y,sz*b.r+oz*b.w/2],.105,steel);
        for(let n=0;n<sub;n++) {
          const t=n/sub,u=(n+1)/sub;
          const ar=THREE.MathUtils.lerp(a.r,b.r,t),br=THREE.MathUtils.lerp(a.r,b.r,u),aw=THREE.MathUtils.lerp(a.w,b.w,t),bw=THREE.MathUtils.lerp(a.w,b.w,u);
          const ay=THREE.MathUtils.lerp(a.y,b.y,t),by=THREE.MathUtils.lerp(a.y,b.y,u);
          for(const s of [-1,1]) {
            k.beam(g,[sx*ar-aw/2,ay,sz*ar+s*aw/2],[sx*br+bw/2,by,sz*br+s*bw/2],.065,steel);
            k.beam(g,[sx*ar+aw/2,ay,sz*ar+s*aw/2],[sx*br-bw/2,by,sz*br+s*bw/2],.065,steel);
            k.beam(g,[sx*ar+s*aw/2,ay,sz*ar-aw/2],[sx*br+s*bw/2,by,sz*br+bw/2],.065,steel);
          }
        }
      }
    }
    // The broad first arch and tapering upper shaft establish the famous silhouette.
    for(const y of [7.7,12.3,22.5]) {
      const r=y<10?5.7:y<20?3.8:1.95;
      k.box(g,r*2+.6,.48,r*2+.6,trim,0,y,0);
      for(const s of [-1,1]) for(let i=0;i<=12;i++) {
        const a=-r+i*r/6;
        k.box(g,.055,.65,.055,steel,a,y+.5,s*r);
        k.box(g,.055,.65,.055,steel,s*r,y+.5,a);
      }
      for(const s of [-1,1]) {
        k.beam(g,[-r,y+.8,s*r],[r,y+.8,s*r],.06,steel);
        k.beam(g,[s*r,y+.8,-r],[s*r,y+.8,r],.06,steel);
      }
    }
    for(const side of [-1,1]) {
      let prev;
      for(let n=0;n<=20;n++) {
        const theta=Math.PI-n*Math.PI/20;
        const p=[6.6*Math.cos(theta),1.4+5.5*Math.sin(theta),side*6.6];
        if(prev) {k.beam(g,prev,p,.24,steel); k.beam(g,[prev[2],prev[1],prev[0]],[p[2],p[1],p[0]],.24,steel);}
        prev=p;
      }
    }
    for(let i=0;i<8;i++) {
      const y=14+i*2,r=3.25-i*.34,nr=r-.33;
      for(const s of [-1,1]) {
        k.beam(g,[-r,y,s*r],[nr,y+2,s*nr],.085,steel);
        k.beam(g,[r,y,s*r],[-nr,y+2,s*nr],.085,steel);
        k.beam(g,[s*r,y,-r],[s*nr,y+2,nr],.085,steel);
      }
    }
    k.box(g,1.8,1.25,1.8,steel,0,32.5,0); k.cone(g,.9,1.1,trim,0,33.6,0,4);
    k.cylinder(g,.08,.12,4,steel,0,36,0,8);
  }

  if(l.id==='08') {
    k.cylinder(g,13.5,13.5,.28,stone,0,.14,0,80).scale.z=22/27;
    ring(13.3,10.8,.9,.45,pale,.28);
    // Complete lower arcade; upper sections are broken away to reveal the arena and seating.
    const count=44,rx=12.3,rz=9.8;
    for(let row=0;row<3;row++) for(let i=0;i<count;i++) {
      const a=i/count*Math.PI*2;
      if(row===2 && a>.12 && a<1.7) continue;
      if(row===1 && a>.5 && a<1.35) continue;
      const x=Math.cos(a)*rx,z=Math.sin(a)*rz;
      const tangent=Math.atan2(rz*Math.cos(a),rx*Math.sin(a));
      const width=Math.hypot(rx*Math.sin(a),rz*Math.cos(a))*Math.PI*2/count-.38;
      arch(width,3.05,.32,.8,row===2?pale:stone,x,.75+row*3.75,z,tangent);
      const col=k.cylinder(g,.18,.23,3.2,pale,x+Math.sin(tangent)*.48,.75+row*3.75+1.6,z+Math.cos(tangent)*.48,8);
      col.position.x+=Math.cos(tangent)*(width/2+.25); col.position.z-=Math.sin(tangent)*(width/2+.25);
      k.box(g,.6,.28,.9,pale,col.position.x,1+row*3.75,col.position.z).rotation.y=tangent;
      k.box(g,.6,.25,.9,pale,col.position.x,3.9+row*3.75,col.position.z).rotation.y=tangent;
      const cornice=k.box(g,width+.65,.3,1.1,pale,x,4.3+row*3.75,z); cornice.rotation.y=tangent;
      if(row===2) {
        const attic=k.box(g,width+.5,1.4,.8,stone,x,12.5,z); attic.rotation.y=tangent;
        const window=k.box(g,.45,.7,.12,dark,x+Math.sin(tangent)*.46,12.5,z+Math.cos(tangent)*.46); window.rotation.y=tangent;
      }
    }
    k.cylinder(g,5.6,5.6,.12,'#bba178',0,.54,0,64).scale.z=.75;
    for(let i=0;i<7;i++) ring(6.3+i*.72,4.8+i*.53,.68,.38,i%2?stone:pale,.58+i*.48);
    // Exposed inner masonry on the ruined southeast edge.
    for(let i=0;i<5;i++) {
      const a=.25+i*.25;
      k.box(g,1.1,1+i*.35,1,stone,Math.cos(a)*11.7,4.1+i*.17,Math.sin(a)*9.3);
    }
  }

  if(l.id==='09') {
    const roof=k.material('#476a77',{metalness:.3,roughness:.5});
    const trim=k.material('#b9ae96');
    // Continuous navigable deck. River is a shallow inset, independent of park sea level.
    k.box(g,48,.18,8,'#4c8e9d',0,.09,0);
    k.box(g,48,.55,4.6,'#8d8a7e',0,2.05,0);
    for(const z of [-2.1,2.1]) {
      k.box(g,48,.18,.3,pale,0,2.5,z);
      for(let i=-23;i<=23;i+=1.5) k.box(g,.09,.75,.09,blue,i,2.87,z);
      k.beam(g,[-24,3.25,z],[24,3.25,z],.07,blue);
    }
    for(const x of [-10,10]) {
      k.box(g,6,2.1,7.2,trim,x,1.05,0);
      // Two open gateway piers, cross lintel and corner turrets.
      for(const s of [-1,1]) k.box(g,4.2,9,1.5,stone,x,6.7,s*2.5);
      k.box(g,4.2,2.4,6.5,stone,x,12.4,0);
      arch(2.8,6.4,.45,.6,pale,x+2.15,2.4,0,Math.PI/2,true);
      arch(2.8,6.4,.45,.6,pale,x-2.15,2.4,0,Math.PI/2,true);
      for(const y of [5.4,8.3,11.1,13.7]) k.box(g,4.7,.28,6.8,pale,x,y,0);
      for(const dx of [-1.7,1.7]) for(const dz of [-2.65,2.65]) {
        k.box(g,.9,11.5,.9,pale,x+dx,7.9,dz);
        k.cone(g,.85,2.5,roof,x+dx,15.3,dz,4);
        k.sphere(g,.13,'#c2a861',x+dx,16.65,dz);
      }
      k.cone(g,2.8,2.5,roof,x,15.1,0,4).rotation.y=Math.PI/4;
      for(const z of [-3.3,3.3]) for(const dx of [-.9,.9]) for(const y of [10.4,12.6]) {
        arch(.52,1.25,.12,.15,pale,x+dx,y,z,0,true);
        k.box(g,.4,.8,.08,dark,x+dx,y+.4,z);
      }
    }
    for(const z of [-1.65,1.65]) {
      k.box(g,20,.5,.8,blue,0,12.9,z);
      k.box(g,20,.28,.8,blue,0,14.2,z);
      for(let i=-9;i<=9;i+=1.5) {
        k.box(g,.09,1.1,.09,blue,i,13.55,z);
        k.beam(g,[i,13,z],[i+1.5,14.1,z],.06,blue);
        k.beam(g,[i,14.1,z],[i+1.5,13,z],.06,blue);
      }
    }
    for(const s of [-1,1]) for(const z of [-2.1,2.1]) {
      let prev=[s*10,11.5,z];
      for(let n=1;n<=16;n++) {
        const t=n/16,x=s*(10+14*t),y=3.5+8*(1-t)**2;
        k.beam(g,prev,[x,y,z],.12,blue); k.beam(g,[x,2.5,z],[x,y,z],.045,blue); prev=[x,y,z];
      }
    }
  }

  if(l.id==='13') {
    const earth=k.material('#657f51',{flatShading:true});
    const meadow=k.material('#81915b',{flatShading:true});
    const rock=k.material('#8c897a',{flatShading:true});
    const shale=k.material('#676f61',{flatShading:true});
    const wall=k.material('#b5aa8e');
    const points=[[-30.5,4.8,-1],[-25,10,-4],[-18,15,-2],[-10,18,3],[0,17,0],[10,20,-3],[19,16,2],[25.5,11,3],[30.5,5.5,0]];
    // The narrow summit follows the wall while every footprint edge falls to ground.
    // A nearest-segment ridge avoids the old max-field's broad, sheer-ended plateau.
    const nx=100,nz=40,positions=[];
    function ridge(x,z) {
      let nearest=Infinity, summit=0;
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[2]-a[2];
        const t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz),0,1);
        const dist=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t),h=THREE.MathUtils.lerp(a[1],b[1],t);
        if(dist<nearest) {nearest=dist;summit=h;}
      }
      const shoulder=Math.max(0,nearest-2.05);
      const edge=THREE.MathUtils.smoothstep(Math.min(35-Math.abs(x),13-Math.abs(z)),0,3.8);
      const crags=(Math.sin(x*.63+z*.37)*.7+Math.cos(x*.29-z*.94)*.5+Math.sin(x*1.61+z*.81)*.22)*Math.min(1,shoulder*.65);
      const foothill=Math.max(0,Math.sin(x*.22+z*.54))*1.1*Math.sin(Math.min(1,shoulder/9)*Math.PI);
      return Math.max(0,(summit*Math.max(0,1-shoulder/11)**1.7+crags+foothill)*edge);
    }
    for(let iz=0;iz<=nz;iz++) for(let ix=0;ix<=nx;ix++) {const x=-35+ix*70/nx,z=-13+iz*26/nz; positions.push([x,ridge(x,z),z]);}
    const surfaces=[[],[],[],[]];
    function triangle(ia,ib,ic) {
      const a=positions[ia],b=positions[ib],c=positions[ic],x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3,y=(a[1]+b[1]+c[1])/3;
      const normal=new THREE.Vector3().crossVectors(new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),new THREE.Vector3(...c).sub(new THREE.Vector3(...a))).normalize();
      const slope=1-Math.abs(normal.y),patch=Math.sin(x*.44+z*.31)+Math.cos(x*.23-z*.7);
      const matIndex=0;
      surfaces[matIndex].push(...a,...b,...c);
    }
    for(let iz=0;iz<nz;iz++) for(let ix=0;ix<nx;ix++) {const a=iz*(nx+1)+ix,b=a+nx+1;triangle(a,b,a+1);triangle(b,b+1,a+1);}
    surfaces.filter(vertices=>vertices.length).forEach(vertices=>{
      const geo=new THREE.BufferGeometry(),normals=[],colors=[];
      for(let i=0;i<vertices.length;i+=3){
        const x=vertices[i],z=vertices[i+2],h=.15;
        const n=new THREE.Vector3((ridge(x-h,z)-ridge(x+h,z))/(2*h),1,(ridge(x,z-h)-ridge(x,z+h))/(2*h)).normalize();normals.push(...n.toArray());
        const c=new THREE.Color('#7a8864').lerp(new THREE.Color('#8c897a'),THREE.MathUtils.smoothstep(1-n.y,.25,.68));
        c.multiplyScalar(1+Math.sin(x*.15+z*.21)*.045);colors.push(c.r,c.g,c.b);
      }
      geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
      k.mesh(g,geo,k.material('#ffffff',{vertexColors:true,roughness:.95}));
    });
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[2]-a[2]),steps=Math.ceil(len/1.1),rotation=-Math.atan2(b[2]-a[2],b[0]-a[0]);
      const segment=new THREE.Group(); segment.position.set((a[0]+b[0])/2,(a[1]+b[1])/2+.7,(a[2]+b[2])/2);segment.rotation.y=rotation; g.add(segment);
      const slope=(b[1]-a[1])/len;
      for(let n=0;n<steps;n++) {
        const x=-len/2+(n+.5)*len/steps,y=x*slope;
        k.box(segment,len/steps+.035,1.7,2.15,wall,x,y,0);
        k.box(segment,len/steps+.05,.16,2.35,pale,x,y+.88,0);
        for(const z of [-1,1]) {
          k.box(segment,len/steps+.03,.64,.25,wall,x,y+1.2,z);
          k.box(segment,.48,.55,.4,pale,x,y+1.78,z);
          k.box(segment,.14,.24,.06,dark,x,y+1.17,z*1.14);
        }
        for(let row=0;row<3;row++) for(const z of [-1.081,1.081]) k.box(segment,len/steps-.08,.035,.018,'#968e78',x,y-.6+row*.5,z);
      }
    }
    for(const index of [0,2,4,5,7,8]) {
      const [x,y,z]=points[index];
      k.box(g,4,3.45,3.9,wall,x,y+1.1,z);
      k.box(g,4,.35,4.3,pale,x,y+2.95,z);
      for(const s of [-1,1]) for(let i=-1;i<=1;i++) {
        k.box(g,.7,.75,.55,pale,x+i*1.4,y+3.5,z+s*1.85);
        k.box(g,.55,.75,.7,pale,x+s*1.85,y+3.5,z+i*1.4);
        k.box(g,.65,1,.03,dark,x+i*1.05,y+1.2,z+s*1.96);
      }
    }
    // Layered angular outcrops sit in the slope, rather than disconnected boulders on the lawn.
    for(let i=0;i<25;i++) {
      const x=-27+i*2.25,z=(i%2?1:-1)*(5.4+(i%3)*1.15),base=ridge(x,z),height=1.1+(i%4)*.38;
      if(base<.8) continue;
      for(let layer=0;layer<3;layer++) {
        const m=k.mesh(g,new THREE.DodecahedronGeometry(1,0),layer===1?shale:rock,x+layer*.16,Math.max(height*.6,base+layer*.55),z-layer*.12);
        m.scale.set(1.5-layer*.13,height*.58,1.15-layer*.12);m.rotation.set(.15, i*.71,.18*Math.sin(i));
      }
    }
    // Local hill vegetation follows the height field and leaves the summit route open.
    const leaves=[k.material('#3b633d',{flatShading:true}),k.material('#577b43',{flatShading:true}),k.material('#829557',{flatShading:true})];
    for(let i=0;i<95;i++) {
      const x=-30+(i*17.719%60),z=(i%2?1:-1)*(5.7+(i*2.731%5.1)),y=ridge(x,z),r=.55+(i*.123% .6);
      if(y<.45 || y>18.2) continue;
      k.cylinder(g,.07,.12,1.1,'#6c6147',x,y+.48,z,6);
      for(let j=0;j<3;j++) {
        const m=k.mesh(g,new THREE.IcosahedronGeometry(r,1),leaves[(i+j)%3],x+(j-1)*r*.48,y+.9+j*.2,z+Math.sin(j*2)*r*.35);
        m.scale.set(1,1.1,1);
      }
    }
  }

  if(l.id==='14') {
    const inset=k.material('#746c61');
    const inlay=k.material('#b5a486');
    const seam=k.material('#ded6c7');
    const red=k.material('#ac8067');
    k.box(g,30,.55,24,red,0,.275,0);
    k.box(g,28.6,.75,22.6,marble,0,.925,0);
    k.box(g,19.4,1,17.2,marble,0,1.8,-.6);
    // Chamfered mausoleum footprint; four monumental pointed iwans surround a drum and onion dome.
    const s=new THREE.Shape(); const q=8.1,c=2.5;
    s.moveTo(-q+c,-q);s.lineTo(q-c,-q);s.lineTo(q,-q+c);s.lineTo(q,q-c);s.lineTo(q-c,q);s.lineTo(-q+c,q);s.lineTo(-q,q-c);s.lineTo(-q,-q+c);s.closePath();
    const geo=new THREE.ExtrudeGeometry(s,{depth:7.2,bevelEnabled:false});geo.rotateX(-Math.PI/2);k.mesh(g,geo,marble,0,2.3,-.6);
    for(const rot of [0,Math.PI/2,Math.PI,Math.PI*1.5]) {
      const face=new THREE.Group(); face.position.set(0,2.3,-.6); face.rotation.y=rot;g.add(face);
      k.box(face,5.8,7.6,.7,marble,0,3.8,8.1);
      // Dark recessed opening plus a dimensional marble arch and nested border.
      const hole=new THREE.Shape();hole.moveTo(-1.8,0);hole.lineTo(-1.8,3.3);hole.quadraticCurveTo(-1.8,5.1,0,6.3);hole.quadraticCurveTo(1.8,5.1,1.8,3.3);hole.lineTo(1.8,0);hole.closePath();
      const hm=new THREE.Mesh(new THREE.ExtrudeGeometry(hole,{depth:.06,bevelEnabled:false}),inset);hm.position.set(0,.1,8.48); face.add(hm);
      // The portico is an actual arched outer shell in front of the recessed façade.
      const portal=arch(3.8,6.4,.48,.55,marble,0,2.4,8.7,rot,true);
      portal.position.set(Math.sin(rot)*8.7,2.4,Math.cos(rot)*8.7-.6);
      // Thin nested inlay, projecting rectangular frame and stone calligraphy blocks.
      face.add(arch(3.85,6.4,.065,.09,inlay,0,.1,9.01,0,true));
      for(const x of [-2.65,2.65]) {
        k.box(face,.17,7.55,.2,pale,x,3.8,8.62);
        k.box(face,.065,7.2,.04,inlay,x*.92,3.75,8.74);
        for(let i=0;i<21;i++) {
          const glyph=k.box(face,.13,.11,.05,inlay,x, .28+i*.34,8.76);
          glyph.rotation.z=i%2?.22:-.22;
        }
      }
      k.box(face,5.5,.16,.2,pale,0,7.55,8.62);
      k.box(face,5.2,.055,.055,inlay,0,7.32,8.76);
      for(const x of [-1.1,-.55,0,.55,1.1]) {
        k.box(face,.065,1.65,.09,marble,x,1.0,8.64);
        for(const y of [.35,.8,1.25,1.7]) k.box(face,.42,.045,.08,marble,x,y,8.67);
      }
      for(const x of [-5.5,5.5]) for(const y of [1.8,4.7]) {
        const niche=new THREE.Shape();niche.moveTo(-.77,0);niche.lineTo(-.77,1.05);niche.quadraticCurveTo(-.77,1.58,0,2.04);niche.quadraticCurveTo(.77,1.58,.77,1.05);niche.lineTo(.77,0);niche.closePath();
        const nm=new THREE.Mesh(new THREE.ExtrudeGeometry(niche,{depth:.06,bevelEnabled:false,curveSegments:10}),inset);nm.position.set(x,y-1.03,8.13);face.add(nm);
        face.add(arch(1.55,2.04,.13,.16,marble,x,y-1.03,8.24,0,true));
        face.add(arch(1.58,2.06,.035,.05,inlay,x,y-1.03,8.35,0,true));
        k.box(face,2.14,.14,.27,pale,x,y-1.06,8.23);
        for(const dx of [-.95,.95]) k.box(face,.1,2.48,.17,pale,x+dx,y+.14,8.22);
        k.box(face,1.95,.1,.17,pale,x,y+1.38,8.22);
        // Dimensional jali grille in each lower niche; beams leave genuine diamond openings.
        for(let n=-2;n<=2;n++) {
          const xx=x+n*.23;
          k.box(face,.035,1.06,.06,pale,xx,y-.44,8.37);
          for(const yy of [-.82,-.47,-.12]) {
            k.beam(face,[xx-.11,y+yy,8.38],[xx+.11,y+yy+.22,8.38],.025,pale,4);
            k.beam(face,[xx+.11,y+yy,8.38],[xx-.11,y+yy+.22,8.38],.025,pale,4);
          }
        }
      }
      k.box(face,16.6,.3,.5,pale,0,7.35,8);
      // Marble plinth courses, pilasters, and small floral pietra-dura panels.
      for(const y of [.25,.46,2.58,5.46]) k.box(face,15.8,.055,.06,seam,0,y,8.15);
      for(const x of [-7.65,-3.45,3.45,7.65]) {
        k.box(face,.18,7.1,.18,pale,x,3.55,8.22);
        k.box(face,.35,.2,.32,pale,x,.2,8.24);k.box(face,.35,.2,.32,pale,x,7.08,8.24);
      }
      for(const x of [-4.05,4.05]) for(const y of [1.25,4.2,6.65]) {
        k.beam(face,[x,y-.35,8.23],[x,y+.28,8.23],.021,inlay,4);
        for(const sign of [-1,1]) for(const dy of [-.12,.08]) {
          const leaf=k.box(face,.14,.06,.04,inlay,x+sign*.11,y+dy,8.25);leaf.rotation.z=sign*.7;
        }
        k.sphere(face,.07,inlay,x,y+.32,8.25,1,1,.4);
      }
      for(let i=-7;i<=7;i++) k.box(face,.13,.22,.17,pale,i*1.05,7.62,8.03);
    }
    // The principal dome has its own broad lower belly and pinched neck: it is
    // intentionally much lower in aspect ratio than the little chhatri domes.
    const domeY=10.8,domeHeight=6.6,domeR=4.65;
    const domeCurve=new THREE.SplineCurve([[.74,0],[.78,.07],[.91,.19],[.985,.31],[1,.42],[.94,.58],[.79,.72],[.54,.84],[.27,.93],[.08,.98],[0,1]].map(([r,y])=>new THREE.Vector2(r,y)));
    const domeProfile=domeCurve.getPoints(64).map(p=>new THREE.Vector2(Math.max(0,p.x)*domeR,THREE.MathUtils.clamp(p.y,0,1)*domeHeight));
    k.cylinder(g,3.55,3.55,1.35,marble,0,10.125,-.6,64);
    k.mesh(g,new THREE.LatheGeometry(domeProfile,64),marble,0,domeY,-.6);
    finial(0,domeY+domeHeight,-.6,1.8);
    const domeJoint=k.material('#ece6db');
    function domeRadius(t) {const y=t*domeHeight;for(let i=1;i<domeProfile.length;i++) if(y<=domeProfile[i].y) {const a=domeProfile[i-1],b=domeProfile[i];return THREE.MathUtils.lerp(a.x,b.x,(y-a.y)/(b.y-a.y));}return 0;}
    for(let n=1;n<9;n++) {
      const t=n/10,r=domeRadius(t)+.005;
      const course=k.mesh(g,new THREE.TorusGeometry(r,.006,4,64),domeJoint,0,domeY+t*domeHeight,-.6);course.rotation.x=Math.PI/2;course.castShadow=false;
    }
    for(let n=0;n<12;n++) {
      const a=n*Math.PI/6,points=[];
      for(let i=0;i<=32;i++) {const t=.03+i*.91/32,r=domeRadius(t)+.005;points.push(new THREE.Vector3(Math.cos(a)*r,domeY+t*domeHeight,-.6+Math.sin(a)*r));}
      const joint=k.mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),40,.005,3,false),domeJoint);joint.castShadow=false;
    }
    for(const y of [9.6,10.15,10.75]) k.cylinder(g,3.58,3.58,.045,seam,0,y,-.6,64);
    // Four corner chhatris on the roof, clearly distinct from the four detached minarets.
    for(const x of [-5.6,5.6]) for(const z of [-6.2,5]) {
      k.cylinder(g,1.25,1.35,.4,marble,x,9.7,z,24);
      for(let n=0;n<8;n++) {const a=n*Math.PI/4;k.cylinder(g,.09,.09,1.45,marble,x+Math.cos(a)*.95,10.55,z+Math.sin(a)*.95,8);}
      onion(x,11.3,z,1.5,2.15);finial(x,13.45,z,.7);
    }
    for(const x of [-12.5,12.5]) for(const z of [-9.5,9.5]) {
      k.cylinder(g,1.05,1.3,.65,marble,x,1.62,z,24);
      k.cylinder(g,.63,.92,12.4,marble,x,8.1,z,24);
      for(const y of [5.1,9.1,13.5]) {
        k.cylinder(g,1.05,1.05,.28,marble,x,y,z,24);
        for(let i=0;i<12;i++) {const a=i*Math.PI/6;k.cylinder(g,.045,.045,.6,pale,x+Math.cos(a)*.95,y+.4,z+Math.sin(a)*.95,6);}
        k.cylinder(g,1.03,1.03,.1,pale,x,y+.72,z,24);
      }
      for(let i=0;i<8;i++) {const a=i*Math.PI/4;k.cylinder(g,.08,.08,1.1,marble,x+Math.cos(a)*.63,14.5,z+Math.sin(a)*.63,8);}
      onion(x,15.1,z,1.05,1.8);finial(x,16.9,z,.75);
    }
    // Charbagh garden extends south of the building with a narrow axial reflecting canal.
    k.box(g,27,.16,19,'#a3b778',0,.08,21.5);
    k.box(g,5,.22,19,pale,0,.11,21.5);
    k.box(g,2.9,.08,17.7,'#4e9eaa',0,.27,21.5);
    for(const z of [14.6,21.5,28.4]) k.cylinder(g,.22,.25,.18,pale,0,.4,z,12);
    for(const x of [-7.3,7.3]) for(let i=0;i<6;i++) {
      const z=13.8+i*3.15;
      k.cylinder(g,.1,.14,1,'#6e6046',x,.55,z,8);k.cone(g,.55,2.4,'#38654d',x,2,z,10);
    }
    stair(0,11.2,5,2.5,1.25,6,marble);
  }

  if(l.id==='15') {
    const sandstone=k.material('#746e5b');
    const edge=k.material('#978c73');
    const deep=k.material('#4e5142');
    k.box(g,34,.38,28,'#b9ac8b',0,.19,0);
    for(let i=0;i<4;i++) k.box(g,29-i*3, .55,23-i*2.8,sandstone,0,.65+i*.55,-1);
    // Roofed perimeter galleries have separate columns and dark openings.
    for(const sign of [-1,1]) {
      for(const z of [-9.9,8]) {
        k.box(g,28,.4,2.2,sandstone,0,1.55,z);
        k.box(g,28,.6,2.5,edge,0,4.2,z);
        const roof=k.cylinder(g,1.8,1.8,27.4,sandstone,0,4.8,z,4);roof.rotation.z=Math.PI/2;roof.rotation.x=Math.PI/4;roof.scale.x=.55;
        for(let x=-13;x<=13;x+=1.7) {k.box(g,.38,2.4,.38,edge,x,2.95,z+sign*.8);k.box(g,.58,.17,.58,sandstone,x,4.1,z+sign*.8);}
      }
      k.box(g,2,.4,20,sandstone,sign*13.2,1.55,-1);
      k.box(g,2.5,.6,20,edge,sign*13.2,4.2,-1);
      for(let z=-9;z<=8;z+=1.7) k.box(g,.38,2.4,.38,edge,sign*13.9,2.95,z);
    }
    function lotusTower(x,z,baseY,h,r) {
      // Stacked shrinking stone courses with fluted petal buttresses.
      k.box(g,r*2.4,.65,r*2.4,edge,x,baseY+.325,z);
      k.box(g,r*1.95,h*.28,r*1.95,sandstone,x,baseY+.65+h*.14,z);
      for(const dx of [-1,1]) for(const dz of [-1,1]) k.box(g,r*.42,h*.32,r*.42,edge,x+dx*r*.76,baseY+.65+h*.16,z+dz*r*.76);
      for(let i=0;i<7;i++) {
        const t=i/7,rr=r*(1-.76*t),yy=baseY+.65+h*.28+i*h*.08;
        // Recessed, squarish tiers replace the circular bright stupa-like rings.
        const tier=k.cylinder(g,rr*.87,rr,h*.085,sandstone,x,yy+h*.04,z,8);tier.rotation.y=Math.PI/8;
        const ledge=k.cylinder(g,rr*.97,rr*.99,.065,edge,x,yy+h*.08,z,8);ledge.rotation.y=Math.PI/8;
        for(let n=0;n<8;n++) {
          const a=n*Math.PI/4;
          const petal=k.mesh(g,new THREE.SphereGeometry(rr*.21,10,7),edge,x+Math.cos(a)*rr*.76,yy+h*.04,z+Math.sin(a)*rr*.76);
          petal.scale.set(.58,2.2,.58);petal.rotation.y=-a;
        }
      }
      // Lotus crown has clustered upright petals rather than a single conical spire.
      k.cylinder(g,r*.13,r*.27,h*.14,sandstone,x,baseY+h*.90,z,8);
      for(let n=0;n<8;n++) {
        const a=n*Math.PI/4;
        const bud=k.mesh(g,new THREE.SphereGeometry(r*.13,8,6),edge,x+Math.cos(a)*r*.19,baseY+h*.94,z+Math.sin(a)*r*.19);
        bud.scale.set(.75,2.3,.75);
      }
      k.sphere(g,.16,edge,x,baseY+h*1.02,z);
      // Eastern and southern door niches.
      k.box(g,r*.6,h*.18,.08,deep,x,baseY+h*.17,z+r*.99);
      k.box(g,.08,h*.18,r*.6,deep,x+r*.99,baseY+h*.17,z);
      for(const sign of [-1,1]) {
        k.box(g,.12,h*.22,.16,edge,x+sign*r*.36,baseY+h*.18,z+r);
        k.box(g,.16,h*.22,.12,edge,x+r,baseY+h*.18,z+sign*r*.36);
      }
      k.box(g,r*.9,.2,.24,edge,x,baseY+h*.30,z+r);
      k.box(g,.24,.2,r*.9,edge,x+r,baseY+h*.30,z);
    }
    lotusTower(0,-1,2.75,13.4,2.75);
    for(const x of [-6.2,6.2]) for(const z of [-6,4]) lotusTower(x,z,2.2,9,1.75);
    // Processional front entrance and stairs along the central axis.
    k.box(g,5,3,3,edge,0,2,10.6);arch(2,2.8,.32,.65,edge,0,.5,12.25,0,true);
    k.cone(g,3.2,2,sandstone,0,4.3,10.6,4).rotation.y=Math.PI/4;
    stair(0,12.5,6,2.6,1.2,6,edge);
    for(const x of [-4.5,4.5]) {
      k.box(g,.35,.65,5.5,edge,x,.7,11.1);
      // Naga balustrade finials.
      for(let i=0;i<5;i++) k.sphere(g,.18,edge,x+(i-2)*.16,1.1+Math.sin(i*Math.PI/4)*.45,13.6,.75,1.3,.7);
    }
  }
  return g;
}
