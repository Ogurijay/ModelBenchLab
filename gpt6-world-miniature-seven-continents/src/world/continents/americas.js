// Static, asset-free architectural miniatures. All dimensions use park metres.
export function build(ctx, landmark) {
  const { THREE, kit: k } = ctx;
  const g = new THREE.Group();
  g.name = `americas-${landmark.id}`;
  g.userData.grounded = true;
  const add = (geo, mat, x=0,y=0,z=0) => k.mesh(g,geo,mat,x,y,z);
  const stone = '#c6ba9d', darkStone = '#726f5d', greenery = '#647a42';
  const water = k.material('#459eac', {roughness:.22,metalness:.12});

  function liberty() {
    const bronze=k.material('#79b7a3',{roughness:.7,metalness:.24});
    const shade='#579783', light='#95c6b3';
    // A low, eleven-point star fort anchors the square masonry pedestal.
    const star = new THREE.Shape();
    for(let i=0;i<22;i++) {
      const a=i*Math.PI/11, r=i%2?5.35:8.3;
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(!i)star.moveTo(x,z);else star.lineTo(x,z);
    }
    star.closePath();
    const fort=new THREE.ExtrudeGeometry(star,{depth:.65,bevelEnabled:false});
    fort.rotateX(-Math.PI/2);
    add(fort,'#a5a58c');
    k.box(g,7.8,.4,7.8,stone,0,.85,0);
    k.box(g,5.4,3.8,5.4,'#bdaf91',0,2.95,0);
    k.box(g,6.1,.45,6.1,'#e4d8bc',0,5.05,0);
    k.box(g,4.5,1.35,4.5,stone,0,5.95,0);
    k.box(g,5.2,.45,5.2,'#e1d7b9',0,6.85,0);
    for(const z of [-2.72,2.72])for(let x=-1.7;x<=1.7;x+=1.7)k.box(g,.65,1.7,.08,'#8a826f',x,3.2,z);
    // Sculpted robe: an asymmetric taper with separate folds and visible feet.
    k.sphere(g,1,bronze,-.68,7.28,1.1,.55,.28,.88);
    k.sphere(g,1,shade,.7,7.28,1.03,.55,.28,.88);
    const robe=k.cylinder(g,1.0,2.1,6.5,bronze,0,10.3,0,12);
    robe.scale.z=.76;
    k.sphere(g,1,bronze,0,13.75,0,1.3,1.7,.82);
    for(let i=0;i<9;i++) {
      const a=-Math.PI*.9+i*Math.PI*.225;
      k.beam(g,[Math.sin(a)*1.8,7.2,Math.cos(a)*1.3],[Math.sin(a)*.75,13.75,Math.cos(a)*.66],.105,i%2?shade:light);
    }
    k.beam(g,[-.9,14.25,0],[-2.05,12.8,.6],.48,bronze);
    k.beam(g,[-2.05,12.8,.6],[-1.25,11.6,1.35],.38,bronze);
    const tablet=k.box(g,1.45,2.1,.36,shade,-1.35,12.1,1.22);tablet.rotation.z=-.18;
    k.box(g,1.04,.07,.05,light,-1.35,12.6,1.43);
    k.box(g,.8,.07,.05,light,-1.35,12.35,1.43);
    // Raised right arm, wrist, torch bowl and gold flame.
    k.beam(g,[1,14.25,0],[1.85,16.4,0],.47,bronze);
    k.beam(g,[1.85,16.4,0],[2.25,19.15,.1],.29,bronze);
    k.sphere(g,.36,bronze,2.25,19.05,.1);
    k.cylinder(g,.18,.2,1.2,shade,2.25,19.7,.1,10);
    k.cylinder(g,.65,.18,.55,bronze,2.25,20.5,.1,12);
    const gold=k.material('#ffce55',{emissive:'#ff941e',emissiveIntensity:.55,metalness:.35,roughness:.38});
    k.sphere(g,.45,gold,2.25,21.12,.1,.7,1.3,.7);
    k.cone(g,.32,.85,gold,2.35,21.55,.1,8);
    k.cylinder(g,.32,.4,.62,bronze,0,15.18,0,12);
    k.sphere(g,1,bronze,0,16.1,0,.7,.95,.64);
    k.sphere(g,.16,light,0,16.07,.65,.65,.8,.9);
    for(const x of [-.28,.28])k.box(g,.18,.075,.035,shade,x,16.3,.59);
    k.cylinder(g,.73,.71,.27,shade,0,16.77,0,14);
    // Seven rays lie in a vertical fan rather than a flat sun hat.
    for(let i=0;i<7;i++) {
      const a=Math.PI*.12+i*Math.PI*.76/6;
      k.beam(g,[Math.cos(a)*.65,16.65+Math.sin(a)*.45,-.05],[Math.cos(a)*1.55,16.65+Math.sin(a)*1.55,-.05],.085,light);
    }
    k.sphere(g,.75,shade,0,16.05,-.35,.85,1.1,.7);
  }

  function goldenGate() {
    const red=k.material('#bf4935',{roughness:.62,metalness:.18});
    const cable='#d76e4b', deck='#706c60';
    // The local water inlet reads as a canal within the miniature park.
    k.box(g,7,.11,57,water,0,.055,0);
    for(const x of [-3.4,3.4])k.box(g,.2,.2,61,'#b5b39a',x,.1,0);
    k.box(g,5.4,.6,64,deck,0,2.5,0);
    for(const x of [-2.85,2.85]) {
      k.box(g,.23,.75,64,red,x,2.65,0);
      k.box(g,.12,.12,64,cable,x,3.35,0);
      for(let z=-31;z<=31;z+=2)k.box(g,.09,.5,.09,cable,x,3.07,z);
    }
    for(const z of [-18,18]) {
      for(const x of [-2.7,2.7]) {
        k.box(g,1.18,1.45,2.15,'#a9aaa0',x,.73,z);
        k.box(g,.68,16.2,1.2,red,x,9.4,z);
        k.box(g,.95,.4,1.5,cable,x,17.55,z);
      }
      for(const y of [5.5,9.3,13.1,16.35])k.box(g,5.3,.55,.9,red,0,y,z);
      for(const y of [6.2,10,13.8]) {
        k.beam(g,[-2.35,y,z],[2.35,y+2.3,z],.12,cable);
        k.beam(g,[2.35,y,z],[-2.35,y+2.3,z],.12,cable);
      }
    }
    const cableY=z=>Math.abs(z)<=18?6+11*(z/18)**2:17-13*(Math.abs(z)-18)/14;
    for(const x of [-2.7,2.7]) {
      for(let z=-32;z<32;z+=1)k.beam(g,[x,cableY(z),z],[x,cableY(z+1),z+1],.115,cable);
      for(let z=-30;z<=30;z+=2)k.beam(g,[x,3.15,z],[x,cableY(z),z],.045,red);
    }
    for(let z=-29;z<31;z+=4)k.box(g,.09,.025,1.8,'#e8dca9',0,2.815,z);
    for(const z of [-31,31])for(const x of [-2.65,2.65])k.box(g,.95,2.25,1.6,stone,x,1.125,z);
  }

  function chichenItza() {
    const limestone='#b7ad8d', trim='#d6ccaa';
    k.box(g,23,.3,23,'#a8ab79',0,.15,0);
    for(let i=0;i<9;i++) {
      const w=22-i*1.65,y=.3+i*1.23;
      k.box(g,w,1.23,w,i%2?limestone:'#c2b796',0,y+.615,0);
      k.box(g,w+.2,.15,w+.2,trim,0,y+1.15,0);
      // Dark mortar joints across the visible stepped facades.
      for(const s of [-1,1])for(let p=-w/2+1;p<w/2;p+=2.4) {
        k.box(g,.045,.65,.025,'#948c74',p,y+.55,s*(w/2+.016));
        k.box(g,.025,.65,.045,'#948c74',s*(w/2+.016),y+.55,p);
      }
    }
    for(let face=0;face<4;face++) {
      const stair=new THREE.Group();stair.rotation.y=face*Math.PI/2;g.add(stair);
      for(let i=0;i<31;i++) {
        const h=.35+i*.365,z=10.8-i*.275;
        k.box(stair,3.25,h,.3,trim,0,h/2+.3,z);
      }
      for(const x of [-1.82,1.82])k.beam(stair,[x,.6,11],[x,11.7,2.5],.18,limestone);
      for(const x of [-1.85,1.85]) {
        k.sphere(stair,.36,limestone,x,.55,11,.85,.7,1.5);
        k.box(stair,.28,.1,.12,'#746d58',x,.58,11.48);
      }
    }
    k.box(g,6.7,.5,6.7,trim,0,11.62,0);
    k.box(g,5.9,3.6,5.9,limestone,0,13.65,0);
    for(const s of [-1,1]) {
      k.box(g,1.5,2.5,.05,'#4b4c3d',0,13.2,s*2.96);
      k.box(g,.05,2.5,1.5,'#4b4c3d',s*2.96,13.2,0);
    }
    for(const x of [-2.6,2.6])for(const z of [-2.6,2.6])k.box(g,.35,3.5,.35,trim,x,13.6,z);
    k.box(g,6.6,.48,6.6,trim,0,15.66,0);
  }

  function christRedeemer() {
    const hill=k.cylinder(g,3.8,14,23.2,greenery,0,11.6,0,11);hill.scale.z=.91;
    for(let i=0;i<9;i++) {
      const a=i*Math.PI*2/9,r=6.9;
      const rock=add(new THREE.DodecahedronGeometry(3.6,0),i%2?'#788478':'#899181',Math.cos(a)*r,10.5+Math.sin(i*2)*1.2,Math.sin(a)*r);
      rock.scale.set(.8,2.4,.9);rock.rotation.y=i;
    }
    k.cylinder(g,3.7,4.4,.65,'#a6a591',0,23.3,0,16);
    k.cylinder(g,2.2,2.5,.8,'#b3afa1',0,23.95,0,8);
    const soapstone='#d5dbd3', shade='#afbcb5';
    const robe=k.cylinder(g,.65,1.35,6.25,soapstone,0,27.48,0,10);robe.scale.z=.6;
    k.sphere(g,1,soapstone,0,30.14,0,1.15,1.4,.6);
    for(let i=-3;i<=3;i++)k.beam(g,[i*.32,24.4,.68],[i*.17,30,.43],.05,shade);
    // Broad sleeves narrow gradually into recognisable outstretched hands.
    for(const s of [-1,1]) {
      k.beam(g,[s*.7,30.5,0],[s*3.15,30.7,0],.52,soapstone,8);
      k.beam(g,[s*3.1,30.7,0],[s*5.2,30.8,0],.32,soapstone,8);
      k.sphere(g,.38,soapstone,s*5.45,30.8,0,1.15,.45,.7);
      for(let f=0;f<3;f++)k.beam(g,[s*5.45,30.83,-.18+f*.16],[s*5.88,30.84,-.18+f*.16],.045,soapstone);
      k.box(g,.52,.24,.75,shade,s*.5,24.4,.42);
    }
    k.cylinder(g,.22,.28,.65,soapstone,0,31.48,0,10);
    k.sphere(g,1,soapstone,0,32.25,0,.51,.79,.49);
    k.sphere(g,.13,shade,0,32.13,.49,.6,.85,.8);
    k.sphere(g,.54,'#9faeaa',0,32.52,-.17,.93,1,.8);
    // The park scale uses a 24 m hill plus a 12 m figure envelope.
    // Raise statue proportions coherently from the pedestal to the planned summit.
    for(const m of g.children.slice())if(m.isMesh && m.position.y>=24.35) {
      m.position.y=24.35+(m.position.y-24.35)*1.35;
      m.scale.y*=1.35;
    }
    for(let i=0;i<21;i++) {
      const a=-1+i*.09,r=13-i*.49,y=.12+i*1.05;
      const step=k.box(g,1.5,.2,1.5,stone,Math.cos(a)*r,y,Math.sin(a)*r);step.rotation.y=-a;
    }
  }

  function machuPicchu() {
    // Layered ridge and cultivated terraces, with the Huayna Picchu-like summit behind.
    const ridge=k.cone(g,15,12,'#68785a',0,6,0,9);ridge.scale.z=.8;
    const peak=add(new THREE.DodecahedronGeometry(5,0),'#62745c',2,11.5,-5.5);peak.scale.set(1,1.3,.9);
    const peak2=add(new THREE.DodecahedronGeometry(3,0),'#7d896b',-5,9.1,-5);peak2.scale.set(1,1.35,.9);
    k.box(g,28,.2,20,'#90957b',0,.1,1.2);
    for(let i=0;i<7;i++) {
      const w=28-i*2.3,d=20-i*1.9,y=.75+i*1.18;
      k.box(g,w,1.17,d,'#90957b',0,y,1.2);
      k.box(g,w,.16,d,'#8c9c62',0,y+.63,1.2);
      for(const x of [-w/2+.25,w/2-.25])k.box(g,.3,.7,d,'#aaa991',x,y+.36,1.2);
      for(let x=-w/2+1;x<w/2;x+=1.7)k.box(g,.05,.32,.03,'#6f7560',x,y,1.2+d/2+.02);
    }
    k.box(g,11,.25,7,'#82915c',0,8.65,1.6);
    function ruin(x,z,w,d,h,roof=false) {
      const wall='#b0ad8e';
      k.box(g,w,h,.3,wall,x,8.8+h/2,z-d/2);
      k.box(g,.3,h,d,wall,x-w/2,8.8+h/2,z);
      k.box(g,.3,h,d,wall,x+w/2,8.8+h/2,z);
      k.box(g,w*.27,h,.3,wall,x-w*.36,8.8+h/2,z+d/2);
      k.box(g,w*.27,h,.3,wall,x+w*.36,8.8+h/2,z+d/2);
      k.box(g,w,.3,.36,wall,x,8.8+h-.15,z+d/2);
      if(roof) {
        const geo=new THREE.ConeGeometry(w*.76,h*.6,4);geo.rotateY(Math.PI/4);
        const m=add(geo,'#8b8066',x,8.8+h+h*.3,z);m.scale.z=d/w;
      }
    }
    for(const x of [-3.9,0,3.9])for(const z of [.3,4])ruin(x,z,2.8,2.4,1.5+((x+z+10)%2)*.25,x===-3.9);
    ruin(-6.2,-1.5,2.6,2.6,2.3);
    for(let i=0;i<18;i++)k.box(g,1,.2,.6,stone,6.6,1.2+i*.43,10-i*.52);
    // Sun temple and sacred boulder sit at the high end of the central plaza.
    k.cylinder(g,1.4,1.4,.9,'#a9a88e',4,9.25,-2,10);
    add(new THREE.DodecahedronGeometry(.8,0),'#c0bea2',4,10,-2);
  }

  function iguazu() {
    const foam=k.material('#e1f4e8',{roughness:.48});
    const falls=k.material('#9bd5ce',{roughness:.23,metalness:.04});
    k.box(g,26,.14,24,water,0,.07,0);
    // Horseshoe-shaped escarpment opens south toward the visitor.
    const segments=28, start=-.92*Math.PI,end=.92*Math.PI;
    for(let i=0;i<segments;i++) {
      const a=start+(end-start)*i/segments,b=start+(end-start)*(i+1)/segments;
      // Circle parametrisation opens around +Z, leaving a viewing gorge.
      const point=t=>[Math.sin(t)*9.5, -Math.cos(t)*8.1-1];
      const p=point(a),q=point(b),x=(p[0]+q[0])/2,z=(p[1]+q[1])/2;
      const tangent=Math.atan2(q[0]-p[0],q[1]-p[1]);
      const h=8.7+.5*Math.sin(i*1.71),w=Math.hypot(q[0]-p[0],q[1]-p[1])+.1;
      const cliff=k.box(g,w,h,3.4,i%3?'#7b856d':'#8c9177',x,h/2,z);cliff.rotation.y=tangent+Math.PI/2;
      const top=k.box(g,w,.25,3.65,'#677f4d',x,h+.1,z);top.rotation.y=cliff.rotation.y;
      // Radial inside face carries a cluster of separate water curtains.
      const rx=x*.86,rz=(z+1)*.86-1;
      for(let j=0;j<3;j++) {
        const f=(j+.5)/3,xx=p[0]+(q[0]-p[0])*f,zz=p[1]+(q[1]-p[1])*f;
        const flow=k.box(g,w/3*.91,h-.15,.18,j===1?foam:falls,xx*.856,h/2+.1,(zz+1)*.856-1);
        flow.rotation.y=cliff.rotation.y;
      }
      const lip=k.box(g,w,.13,1.8,water,rx,h+.3,rz);lip.rotation.y=cliff.rotation.y;
      k.sphere(g,.8,foam,rx*.91,.33,(rz+1)*.91-1,1.15,.21,.65);
    }
    // Foreground gorge extends away from the horseshoe; rails frame the overlook.
    for(const x of [-11.8,11.8]) {
      k.box(g,2.1,3.1,9,'#899276',x,1.55,7);
      k.box(g,2.2,.2,9,'#71854f',x,3.15,7);
    }
    k.box(g,9,.35,2.8,'#b6ad8c',0,.48,10.15);
    for(const x of [-4.2,4.2])k.box(g,.1,.9,2.7,'#716b54',x,1.1,10.15);
    k.box(g,8.5,.1,.12,'#716b54',0,1.6,8.85);
    for(let x=-4;x<=4;x+=1)k.box(g,.08,.9,.08,'#716b54',x,1.1,8.85);
  }

  const builders={'01':liberty,'02':goldenGate,'03':chichenItza,'04':christRedeemer,'05':machuPicchu,'06':iguazu};
  if(!builders[landmark.id])throw new Error(`Unsupported Americas landmark: ${landmark.id}`);
  builders[landmark.id]();
  return g;
}
