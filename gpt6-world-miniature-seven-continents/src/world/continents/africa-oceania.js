// Local, grounded procedural landmark models. Geographic placement is owned by coords.
export function build(ctx, landmark) {
  const { THREE: T, kit: k } = ctx;
  const g = new T.Group();
  g.name = `landmark-${landmark.id}`;
  const mat = (c, options = {}) => k.material(c, options);
  const sand = mat('#d5ad72'), limestone = mat('#dfc58e');
  const snow = mat('#f4f8f4'), ice = mat('#bce4e9'), dark = mat('#334748');

  // Ring surfaces preserve irregular silhouettes instead of scaling primitive cones.
  function ringMass(rings, colors, n = 48, phase = 0, flat = true) {
    const positions = [], indices = [];
    rings.forEach(([rx, rz, y, wobble = 0], j) => {
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const f = 1 + wobble * (Math.sin(3 * a + phase) * .43 + Math.sin(7 * a + phase * 2) * .31 + Math.cos(11 * a) * .18);
        positions.push(Math.cos(a) * rx * f, y + (j === 0 ? 0 : wobble * .65 * Math.sin(a * 5 + phase)), Math.sin(a) * rz * f);
      }
    });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
      const a = j * n + i, b = j * n + (i + 1) % n, c = a + n, d = b + n;
      indices.push(a, c, b, b, c, d);
    }
    const mass = new T.Group();
    g.add(mass);
    // Single material per band keeps the coordinator's static mesh merger compatible.
    for (let j = 0; j < rings.length - 1; j++) {
      const bandPositions = positions.slice(j * n * 3, (j + 2) * n * 3);
      const bandIndices = indices.slice(j * n * 6, (j + 1) * n * 6).map(i => i - j * n);
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(bandPositions, 3));
      geo.setIndex(bandIndices);
      const finalGeo = flat ? geo.toNonIndexed() : geo;
      finalGeo.computeVertexNormals();
      k.mesh(mass, finalGeo, colors[Math.min(j, colors.length - 1)]);
      if (flat) geo.dispose();
    }
    return mass;
  }
  function torus(radius, tube, color, x, y, z) {
    const m = k.mesh(g, new T.TorusGeometry(radius, tube, 6, 48), color, x, y, z);
    m.rotation.x = Math.PI / 2;
    return m;
  }
  function pyramid(x, z, size, height) {
    const courses = 31;
    // Closely spaced masonry courses make the square face read as stonework.
    for (let i = 0; i < courses; i++) {
      const lower = size * (1 - i / courses), upper = size * (1 - (i + 1) / courses);
      const part = k.cylinder(g, upper / Math.SQRT2, lower / Math.SQRT2, height / courses,
        i % 4 === 0 ? '#d9bb83' : '#d1af75', x, .22 + (i + .5) * height / courses, z, 4);
      part.geometry.rotateY(Math.PI / 4);
    }
    k.box(g, size + .6, .22, size + .6, '#ba945a', x, .11, z);
    // Remnant pale casing near summit.
    const cap = k.cone(g, size * .105, height * .145, limestone, x, .22 + height * .928, z, 4);
    cap.geometry.rotateY(Math.PI / 4);
  }
  function penguin(x, z, scale, turn) {
    const p = new T.Group(); p.position.set(x, .2, z); p.rotation.y = turn; p.scale.setScalar(scale); g.add(p);
    k.sphere(p, .45, '#20323b', 0, .76, 0, .82, 1.45, .78);
    k.sphere(p, .31, '#faf9ed', 0, .72, .19, .86, 1.4, .58);
    k.sphere(p, .27, '#20323b', 0, 1.3, 0, 1, 1, .94);
    k.sphere(p, .065, '#f1c66b', -.17, 1.28, .19, .7, 1.6, .6);
    k.sphere(p, .065, '#f1c66b', .17, 1.28, .19, .7, 1.6, .6);
    const beak = k.cone(p, .1, .29, '#d68d35', 0, 1.23, .32, 4); beak.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      const flipper = k.sphere(p, .18, '#20323b', s * .36, .7, -.01, .45, 2.1, .7); flipper.rotation.z = s * .28;
      k.sphere(p, .14, '#c88537', s * .16, .08, .15, .9, .45, 1.5);
    }
  }

  switch (String(landmark.id)) {
    case '10': {
      k.box(g, 42, .18, 30, '#dbc18d', 0, .09, 0);
      pyramid(-7.1, -1.7, 21, 20.8);
      pyramid(10.5, -6.6, 13, 12.7);
      pyramid(15.5, 6.6, 7, 6.5);
      // Sphinx: reclining lion, long forepaws, upright human head and striped nemes.
      const sx = 4.8, sz = 7.5;
      k.box(g, 7.4, .35, 12.4, '#c39d63', sx, .35, sz);
      k.sphere(g, 1, sand, sx, 1.55, sz, 2.05, 1.45, 3.45);
      for (const side of [-1, 1]) {
        k.box(g, .95, .72, 4.7, sand, sx + side * 1.23, .82, sz + 2.8);
        k.sphere(g, .55, sand, sx + side * 1.23, .9, sz + 4.85, 1, .7, .8);
      }
      k.sphere(g, 1, sand, sx, 3, sz + 1.5, 1.55, 1.8, 1.2);
      k.box(g, 2.65, 2.25, .95, '#b99156', sx, 4, sz + 1.7);
      k.sphere(g, 1, limestone, sx, 4.25, sz + 2.24, .73, 1.08, .6);
      for (const s of [-1, 1]) {
        const cheek = k.box(g, .62, 2.9, .72, '#c5a46c', sx + s * .95, 3.9, sz + 2); cheek.rotation.z = -s * .16;
        for (let j = 0; j < 6; j++) k.box(g, .63, .055, .74, '#a78854', sx + s * .95, 2.85 + j * .43, sz + 2.02);
        k.box(g, .26, .11, .08, '#7f6946', sx + s * .3, 4.58, sz + 2.81);
      }
      k.box(g, .22, .44, .27, '#c6a26b', sx, 4.28, sz + 2.86);
      k.box(g, .58, .1, .09, '#a08051', sx, 3.94, sz + 2.83);
      k.box(g, .3, .7, .28, '#b28e56', sx, 3.55, sz + 2.62);
      // Small subsidiary tombs near the eastern perimeter.
      for (let i = 0; i < 3; i++) pyramid(-15.5 + i * 3.1, 11.5, 2.4, 1.9);
      break;
    }
    case '11': {
      // An eroded heightfield replaces rotational bands. Kibo sits off-center,
      // while the separate Mawenzi mass interrupts the mountain's eastern silhouette.
      const heightAt=(x,z)=>{
        const edge=Math.hypot(x/14.8,z/14.8);
        if(edge>=1) return 0;
        const dx=(x+2.6)/.94,dz=(z+1.5)/1.04,r=Math.hypot(dx,dz),a=Math.atan2(dz,dx);
        const profile=29.9*Math.pow(Math.max(0,1-Math.pow(r/18,1.48)),1.18);
        const shoulders=Math.sin(a*7+r*.23)*1.4+Math.sin(a*13-r*.13)*.65;
        const gullies=Math.pow(.5+.5*Math.sin(a*11+r*.2),6)*3.3;
        const flanks=Math.min(1,r/4.5)*Math.max(0,1-r/21);
        const crater=3.9*Math.exp(-Math.pow(r/2.05,4));
        const kibo=profile+(shoulders-gullies)*flanks-crater;
        const secondaryR=Math.hypot((x-8.1)/1.05,z-2.4),secondaryA=Math.atan2(z-2.4,x-8.1);
        const mawenzi=Math.max(0,20.1-secondaryR*3.5+Math.sin(secondaryA*5)*.85)*Math.max(0,1-secondaryR/12);
        return Math.max(0,Math.max(kibo,mawenzi)*Math.min(1,(1-edge)*7.5));
      };
      const palette=['#8b9666','#929577','#96917d','#8d887b','#a6a294','#b8b7ab','#e3e7e0','#fafbf3'];
      const buckets=palette.map(()=>({p:[],n:[]})),n=112,step=29.6/n;
      const vertex=(i,j)=>{
        const x=-14.8+i*step,z=-14.8+j*step,y=heightAt(x,z),eps=.055;
        const normal=new T.Vector3(heightAt(x-eps,z)-heightAt(x+eps,z),2*eps,heightAt(x,z-eps)-heightAt(x,z+eps)).normalize();
        return {p:[x,y,z],n:normal.toArray()};
      };
      const grid=Array.from({length:n+1},(_,i)=>Array.from({length:n+1},(_,j)=>vertex(i,j)));
      const triangle=(a,b,c)=>{
        const x=(a.p[0]+b.p[0]+c.p[0])/3,y=(a.p[1]+b.p[1]+c.p[1])/3,z=(a.p[2]+b.p[2]+c.p[2])/3;
        if(y<.006) return;
        const angle=Math.atan2(z+1.5,x+2.6),patch=Math.sin(x*1.25+z*.8)*.65+Math.cos(z*1.7-x*.6)*.6;
        const snowLine=23.7+Math.sin(angle*5)*1.1+Math.cos(angle*11)*.7+patch*.8;
        let shade=y>snowLine?(y>snowLine+1.05?7:6):Math.min(5,Math.max(0,Math.floor((y+patch*2.1)/5.4)));
        // Exposed dark rock breaks the snow rim rather than forming a white annulus.
        if(shade>=6&&Math.sin(angle*9+.7)>.68&&Math.hypot(x+2.6,z+1.5)>2) shade=4;
        const bucket=buckets[shade];for(const v of [a,b,c]){bucket.p.push(...v.p);bucket.n.push(...v.n);}
      };
      for(let i=0;i<n;i++) for(let j=0;j<n;j++){
        const a=grid[i][j],b=grid[i+1][j],c=grid[i][j+1],d=grid[i+1][j+1];triangle(a,c,b);triangle(b,c,d);
      }
      buckets.forEach((b,i)=>{if(b.p.length){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(b.p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(b.n,3));k.mesh(g,geo,palette[i]);}});
      // Individual angular outcrops follow the actual ground profile.
      for(let i=0;i<19;i++) {
        const a=i*2.399,r=7.3+(i%4)*1.35,x=Math.cos(a)*r,z=Math.sin(a)*r;
        const rock=k.mesh(g,new T.DodecahedronGeometry(.45+(i%3)*.13,0),i%3?'#918b79':'#a5a08c',x,heightAt(x,z)-.22,z);
        rock.scale.set(1.1,1.3+(i%3)*.3,.8);rock.rotation.set(i*.4,a,.2);
      }
      break;
    }
    case '12': {
      // Elongated, nearly rectangular plateau: lobed buttresses, ledges and deep
      // vertical clefts replace the former circular wall and uniformly green lid.
      const n=144,levels=52,colors=['#8a8a77','#a6a18d','#b9b39f','#a39f8b','#949c81'];
      const buckets=colors.map(()=>[]),ring=[];
      for(let j=0;j<=levels;j++) {
        const t=j/levels,y=t*18.25;
        ring[j]=[];
        for(let i=0;i<n;i++) {
          const a=i/n*Math.PI*2,co=Math.cos(a),si=Math.sin(a);
          const outline=.94+.035*Math.sin(a*5+.4)+.025*Math.cos(a*9-1.2);
          const cleft=Math.pow(.5+.5*Math.sin(a*23+.3),7),buttress=Math.pow(.5+.5*Math.cos(a*11-.4),3);
          const foothill=(1-t)*(1-t)*(1.25+.6*Math.sin(a*7));
          const ledge=.11*Math.sin(t*39+a*3)+.09*Math.sin(t*71+a*5);
          const radius=1+foothill*.085+buttress*.055-cleft*.085*Math.sin(t*Math.PI*.8)+ledge*.12;
          const x=Math.sign(co)*Math.pow(Math.abs(co),.38)*11.6*outline*radius;
          const z=Math.sign(si)*Math.pow(Math.abs(si),.61)*6.55*outline*radius;
          const yy=j===0?0:y+(j===levels?.14:Math.sin(t*Math.PI)*.46)*Math.sin(a*7+.4);
          ring[j].push([x,yy,z]);
        }
      }
      function tri(a,b,c,color){buckets[color].push(...a,...b,...c);}
      for(let j=0;j<levels;j++) for(let i=0;i<n;i++){
        const next=(i+1)%n,a=ring[j][i],b=ring[j][next],c=ring[j+1][i],d=ring[j+1][next];
        const layer=j/levels,weather=Math.sin(i*.35+j*.18)+Math.cos(i*.71-j*.25)*.5;
        const shade=layer<.17?0:weather>1?1:weather<-.65?3:2;
        tri(a,c,b,shade);tri(b,c,d,shade);
      }
      // Flat, irregular plateau with small turf patches and exposed sandstone.
      for(let i=0;i<n;i++) {
        const next=(i+1)%n,a=ring[levels][i],b=ring[levels][next],center=[-1.2,18.35,.1];
        const ma=[a[0]*.58,18.4+Math.sin(i*.19)*.09,a[2]*.58],mb=[b[0]*.58,18.4+Math.sin(next*.19)*.09,b[2]*.58];
        const shade=i%13<5?4:2;tri(a,ma,b,shade);tri(b,ma,mb,shade);tri(ma,center,mb,shade);
      }
      buckets.forEach((p,i)=>{if(p.length){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.computeVertexNormals();k.mesh(g,geo,colors[i]);}});
      // Angular talus and detached cliff shoulders break the perimeter into foothills.
      for(let i=0;i<21;i++) {
        const a=i/21*Math.PI*2,co=Math.cos(a),si=Math.sin(a);
        const x=Math.sign(co)*Math.pow(Math.abs(co),.42)*11.6,z=Math.sign(si)*Math.pow(Math.abs(si),.68)*7.1;
        const height=1.1+(i%4)*.47,rock=k.mesh(g,new T.DodecahedronGeometry(1,0),i%3?'#9b9985':'#b1aa97',x,height,z);
        rock.scale.set(1.1+(i%3)*.25,height,1.05);rock.rotation.y=a*.8;
      }
      break;
    }
    case '16': {
      k.box(g,29.6,.55,22.5,'#aa8e71',0,.275,0);
      for(let i=0;i<5;i++) k.box(g,28.7-i*.7,.26,20.9-i*.7,'#c4af91',0,.68+i*.26,0);
      k.box(g,23,1.1,16.3,'#b99e7d',0,2.05,-.7);
      const roofmat=mat('#fff9e9',{roughness:.5,side:T.DoubleSide});
      const ribmat=mat('#ded6bc',{roughness:.64});
      const glass=mat('#243e47',{roughness:.2,metalness:.32,side:T.DoubleSide});
      // A roof is a spherical-looking fan that widens towards its high, open arch.
      // Its tall edge remains broad; only the grounded rear heel converges to a point.
      function sail(cx,cz,width,length,height,heading=0) {
        const y0=3.05,nu=32,nv=36,pos=[],idx=[],ca=Math.cos(heading),sa=Math.sin(heading);
        const rotate=(x,y,z)=>[cx+x*ca+z*sa,y,cz+z*ca-x*sa];
        const point=(u,v)=>{
          const sweep=Math.sin(u*Math.PI/2),span=width*Math.pow(sweep,.77);
          const arch=Math.pow(Math.max(0,Math.cos(v*Math.PI/2)),.76);
          // The outward sweep of the open lip is strongest along the high center.
          return rotate(v*span,y0+height*Math.pow(sweep,.87)*arch,
            (u-.5)*length+.88*u*u*arch);
        };
        for(let i=0;i<=nu;i++) for(let j=0;j<=nv;j++) pos.push(...point(i/nu,j/nv*2-1));
        for(let i=0;i<nu;i++) for(let j=0;j<nv;j++) {
          const a=i*(nv+1)+j,b=a+nv+1;idx.push(a,b,a+1,a+1,b,b+1);
        }
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();k.mesh(g,geo,roofmat);
        function curvedRib(points,radius=.035) {
          k.mesh(g,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),30,radius,5,false),ribmat);
        }
        // Ribs radiate from the rear support to the fan edge rather than forming cones.
        for(const v of [-1,-.73,-.45,0,.45,.73,1]) curvedRib(Array.from({length:21},(_,i)=>point(i/20,v)),Math.abs(v)===1?.075:.027);
        curvedRib(Array.from({length:49},(_,i)=>point(1,i/24-1)),.085);
        // Curved glass curtain beneath the full arch, split by visible slender mullions.
        const glazing=[];
        for(let j=0;j<nv;j++) {
          const a=point(1,j/nv*2-1),b=point(1,(j+1)/nv*2-1);
          const aa=[a[0],2.52,a[2]-.035],bb=[b[0],2.52,b[2]-.035];
          glazing.push(...aa,...a,...bb,...bb,...a,...b);
        }
        const gg=new T.BufferGeometry();gg.setAttribute('position',new T.Float32BufferAttribute(glazing,3));gg.computeVertexNormals();k.mesh(g,gg,glass);
        for(let j=1;j<12;j++) {
          const v=j/6-1,top=point(1,v);k.beam(g,[top[0],2.56,top[2]-.06],[top[0],top[1]-.08,top[2]-.06],.041,ribmat,5);
        }
        // Both open sides stand on a continuous dark glass hall with concrete frames.
        for(const side of [-1,1]) {
          const ps=Array.from({length:17},(_,i)=>point(i/16,side));
          const verts=[];
          for(let i=0;i<ps.length-1;i++) {const a=ps[i],b=ps[i+1],aa=[a[0],2.5,a[2]],bb=[b[0],2.5,b[2]];verts.push(...aa,...a,...bb,...bb,...a,...b);}
          const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(verts,3));sg.computeVertexNormals();k.mesh(g,sg,glass);
        }
      }
      // Two offset halls read as long, overlapping roof sequences. The end sail faces
      // the opposite harbor, while the stepped front sails open towards the promenade.
      k.box(g,8.8,1.2,17.7,glass,-5.2,2.97,-.2);
      k.box(g,7.2,1.2,16.7,glass,5.15,2.97,.2);
      for(const x of [-9.6,-.8,1.55,8.75]) for(let i=0;i<12;i++) k.box(g,.12,1.2,.12,'#c7b89b',x,3,-8+i*1.4);
      sail(-5.2,-3.8,4.3,8.7,12.25,.035);
      sail(-5.2,1.3,4.1,7.7,9.2,-.025);
      sail(-5.1,5.9,3.7,5.3,5.7,-.06);
      sail(-5.35,-6.6,3.25,5.8,7.8,Math.PI+.035);
      sail(5.25,-3.2,3.6,8,10.3,-.065);
      sail(5.15,1.8,3.5,7.2,7.4,.025);
      sail(5,5.9,3.1,5.1,4.8,.08);
      sail(5.3,-6.5,2.7,5.6,6.3,Math.PI-.05);
      // Podium colonnade and broad harbor-facing stair.
      for(let i=0;i<13;i++) k.box(g,.24,1.05,.28,'#9c866d',-11.5+i*1.9,2.05,7.65);
      for(let i=0;i<7;i++) k.box(g,15,.15,1.8-i*.15,'#d1bda1',0,.32+i*.15,10.1-i*.21);
      k.box(g,18,.65,.12,glass,0,2.2,7.7);
      break;
    }
    case '17': {
      // One continuous, low sandstone mass: broad offset crown, asymmetric shoulders
      // and deeply eroded vertical drainage channels. There are no horizontal rings.
      const around=192,up=76,positions=[],colors=[],indices=[];
      const red=new T.Color('#be6240'),darkRed=new T.Color('#85432d'),warmRed=new T.Color('#cf8256');
      for(let j=0;j<=up;j++) {
        const v=j/up;
        for(let i=0;i<=around;i++) {
          const a=i/around*Math.PI*2,co=Math.cos(a),si=Math.sin(a);
          const shoulder=2.35+.52*Math.sin(a*2+.8)+.22*Math.cos(a*5);
          const radial=Math.sqrt(Math.max(0,1-Math.pow(v,shoulder)));
          const gully=Math.pow(.5+.5*Math.sin(a*19+v*.8+Math.sin(a*4)*1.7),8);
          const fineGully=Math.pow(.5+.5*Math.sin(a*43-v*.3),12);
          const erosion=(.048*gully+.016*fineGully)*Math.pow(Math.sin(v*Math.PI),.65);
          const outline=1+.023*Math.sin(a*3+.4)+.016*Math.cos(a*7);
          const r=Math.max(0,radial*(outline-erosion));
          const x=15.2*Math.sign(co)*Math.pow(Math.abs(co),.91)*r-2.05*Math.pow(v,1.7);
          const z=9.65*Math.sign(si)*Math.pow(Math.abs(si),.94)*r+.68*Math.pow(v,1.4);
          const y=j===0?0:10.45*(1-Math.pow(1-v,2.5))+
            (.57*Math.sin(a*2+.2)+.24*Math.cos(a*5))*Math.sin(v*Math.PI)-gully*.23*Math.sin(v*Math.PI);
          positions.push(x,y,z);
          const mottle=.5+.22*Math.sin(x*.61+Math.sin(z*.8))+.15*Math.cos(z*1.2-x*.27);
          const color=red.clone().lerp(warmRed,Math.max(0,Math.min(.55,mottle*.48)))
            .lerp(darkRed,(gully*.37+fineGully*.1)*Math.pow(Math.sin(v*Math.PI),.45));
          color.multiplyScalar(.96+.035*Math.sin(x*2.8+z*2.1));
          colors.push(color.r,color.g,color.b);
        }
      }
      for(let j=0;j<up;j++) for(let i=0;i<around;i++) {
        const a=j*(around+1)+i,b=a+1,c=a+around+1,d=c+1;
        indices.push(a,c,b);
        if(j<up-1) indices.push(b,c,d);
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      // Join the parametric seam smoothly; the crown converges to one flat low point.
      const normals=geometry.attributes.normal;
      for(let j=0;j<=up;j++) {
        const first=j*(around+1),last=first+around;
        const n=new T.Vector3().fromBufferAttribute(normals,first).add(new T.Vector3().fromBufferAttribute(normals,last)).normalize();
        normals.setXYZ(first,n.x,n.y,n.z);normals.setXYZ(last,n.x,n.y,n.z);
      }
      // Keep natural rock outside the architectural masonry-grain material helper.
      k.mesh(g,geometry,new T.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:.94}));
      break;
    }
    case '18': {
      k.cylinder(g,4.2,5.4,.32,'#b2b7ac',0,.16,0,32);
      k.cylinder(g,2.6,3.4,.75,'#d9d6c4',0,.65,0,24);
      k.cylinder(g,.59,1.1,21.2,'#d3d0bd',0,11.55,0,20);
      // Slender concrete ribs converge below the circular viewing decks.
      for(let i=0;i<4;i++) { const a=i*Math.PI/2+.4; k.beam(g,[Math.cos(a)*1.72,.9,Math.sin(a)*1.72],[Math.cos(a)*.8,19.7,Math.sin(a)*.8],.12,'#b4b8ac'); }
      k.cylinder(g,2.15,.7,1.45,'#c9ccbd',0,21.7,0,40);
      k.cylinder(g,2.15,2.15,.88,'#3e6671',0,22.86,0,48);
      k.cylinder(g,2.37,2.37,.18,'#e3dfc8',0,23.36,0,48);
      k.cylinder(g,1.6,2.25,.55,'#bfc3b8',0,23.7,0,40);
      k.cylinder(g,1.53,1.53,.72,'#3d626f',0,24.31,0,40);
      k.cylinder(g,.88,1.8,.38,'#d6d9ce',0,24.85,0,40);
      torus(2.17,.065,'#e8e5d4',0,22.46,0);
      for(let i=0;i<24;i++) { const a=i/24*Math.PI*2;k.box(g,.045,.79,.045,'#d6d7ca',Math.cos(a)*2.16,22.86,Math.sin(a)*2.16); }
      k.cylinder(g,.25,.62,4.4,'#c5cbbf',0,27.2,0,16);
      k.cylinder(g,.08,.2,2.4,'#d9e1d5',0,30.4,0,12);
      k.cone(g,.09,.8,'#f0eee2',0,31.6,0,12);
      torus(.32,.05,'#a84e3e',0,28.7,0);
      break;
    }
    case 'A': {
      ringMass([[13.8,7.7,0,.025],[13.7,7.5,1.4,.045],[13.3,7.4,5.5,.06],[12.9,7.1,6.8,.06],[9.4,5.2,7.1,.03],[0,0,7.3,0]],['#83c5d4','#a4d7e0','#d0edf0','#f3f8f6','#f5f9f7'],48,1.1).scale.x=.98;
      for(let i=0;i<20;i++) {const a=i/20*Math.PI*2; k.beam(g,[Math.cos(a)*13.54,.7,Math.sin(a)*7.4],[Math.cos(a)*13.21,5.85,Math.sin(a)*7.26],.045,'#a0ced7',4);}
      // Cracks in the top surface, thin and blue rather than black outlines.
      for(let i=0;i<4;i++) k.beam(g,[-7+i*4,7.25,-3.8],[-5+i*3.6,7.29,2.4],.035,'#b5d9e1',4);
      break;
    }
    case 'B': {
      g.userData.intentionalFloating = true;
      // Flat blue meltwater basin at local ground level; asymmetric icebergs sit within it.
      k.box(g,27.7,.12,17.7,mat('#4fa3b6',{roughness:.27,metalness:.2}),0,.06,0);
      const main=ringMass([[6.8,4.5,0,.075],[6.2,4.3,2.6,.12],[4.8,3.6,6.9,.13],[1.7,1.6,9.6,.1],[0,0,9.8,0]],['#8fcedd','#b8e3e9','#e0f2f3','#fafbf7'],11,.8);main.position.set(-4.8,.12,-1.3);
      const other=ringMass([[4.2,3.2,0,.07],[3.6,2.8,3.7,.11],[1.5,1.4,6.1,.1],[0,0,5.6,0]],['#9cd7e0','#d3eef0','#f5faf5'],9,2);other.position.set(7.1,.12,2.2);other.rotation.y=.5;
      for(let i=0;i<7;i++) {const a=i*2.3;k.sphere(g,.6,ice,Math.cos(a)*10,.27,Math.sin(a)*6.5,1.3,.4,.7);}
      break;
    }
    case 'C': {
      k.box(g,23.6,.22,15.6,'#dfeeed',0,.11,0);
      for(let i=0;i<8;i++) {const a=i*2.399;k.sphere(g,.7,'#c0dce1',Math.cos(a)*8.9,.39,Math.sin(a)*5.8,1.2,.55,.9);}
      // Station is deliberately generic, on piers, with a short access stair.
      for(const x of [3.3,9]) for(const z of [-4.5,-.3]) k.cylinder(g,.13,.16,1.1,'#768d90',x,.75,z,8);
      k.box(g,7.4,.24,5.5,'#546e75',6.1,1.4,-2.4);
      k.box(g,6.7,2.15,4.4,'#ca683f',6.1,2.59,-2.4);
      k.box(g,7.3,.25,5.1,'#f5f3e6',6.1,3.78,-2.4);
      for(let i=0;i<3;i++) {k.box(g,1,.78,.06,'#f0ddba',4+i*2,2.78,-.17);k.box(g,.84,.61,.07,'#3e687b',4+i*2,2.79,-.12);}
      k.box(g,.08,1.7,1.1,'#465e66',2.72,2.33,-2.4);
      for(let i=0;i<4;i++) k.box(g,.82,.25,1.5,'#a8b7b5',1.2+i*.35,.24+i*.27,-2.4);
      k.beam(g,[8,3.9,-3.8],[8,4.9,-3.8],.045,'#6a7e7d');
      const dish=k.sphere(g,.46,'#ede9db',8,4.59,-3.8,1,.3,1);dish.rotation.z=.45;
      for(let i=0;i<12;i++) {const x=-9.5+(i%4)*2.5,z=1+Math.floor(i/4)*2.25;penguin(x,z,.68+(i%3)*.1,(i*.7)%3-1.5);}
      // A small pool and low snowy bank belong to the habitat, not an extra monument.
      const pool=k.cylinder(g,2.5,2.5,.1,mat('#78bac9',{roughness:.23}),6.9,.26,4.2,32);pool.scale.z=.65;
      break;
    }
    default: return null;
  }
  return g;
}

// Unnamed Antarctic scenery uses world XZ, mounted once by the world at GROUND_Y.
export function buildPolarLandscape(ctx) {
  const { THREE: T, kit: k, coords } = ctx;
  const root = new T.Group();
  root.name = 'antarctic-fractured-coast';
  root.userData.obstacles = [];
  root.userData.floatingBlocks = [];
  const zone = coords.layout.zones.find(v => v.id === 'antarctica');
  const exclusion = zone.landmarks.map(v => ({ x: v[2], z: v[3], width: v[4] + 6, depth: v[5] + 6 }));
  const inside = (x, z) => coords.inPolygon(x, z, zone.polygon);
  const safe = (x, z) => inside(x, z) && !coords.onPath(x, z, 3) &&
    !exclusion.some(r => Math.abs(x-r.x) <= r.width/2 && Math.abs(z-r.z) <= r.depth/2);
  function safeRectangle(x, z, width, depth) {
    const nx = Math.ceil(width/.65), nz = Math.ceil(depth/.65);
    for(let ix=0;ix<=nx;ix++) for(let iz=0;iz<=nz;iz++) {
      if(!safe(x-width/2+ix*width/nx,z-depth/2+iz*depth/nz)) return false;
    }
    return true;
  }
  function shelf(x, z, width, depth, height, seed, floating = false) {
    const group = new T.Group();
    group.name = floating ? `floating-pack-ice-${seed}` : `polar-snow-ridge-${seed}`;
    group.position.set(x, floating ? (coords.WATER_Y ?? 0) - (coords.GROUND_Y ?? 1.2) - .25 : 0, z);
    group.userData.intentionalFloating = floating;
    root.add(group);
    const n = 28;
    const rings = [[1,0],[.99,.19],[.92,.29],[.91,.63],[.76,.74],[.62,.94],[.12,.97],[0,.89]];
    const colors = floating ? ['#74baca','#9fd3de','#b2dce3','#c3e6e8','#e7f5f3','#f6faf6','#eef7f4'] :
      ['#6d9da9','#83b8c5','#b0d5dc','#c7e3e5','#e5efec','#f5f8ee','#eef5ed'];
    const points = rings.map(([radius, level], ring) => Array.from({length:n},(_,i)=>{
      const a=i/n*Math.PI*2;
      const irregular=.94+.035*Math.sin(5*a+seed)+.025*Math.cos(9*a-seed);
      const crown=ring===rings.length-1 ? 0 : ring>3 ? .09*Math.sin(3*a+seed)+.065*Math.cos(a*5+seed*.5) : .03*Math.sin(a*6+seed);
      return [Math.cos(a)*width/2*radius*irregular,
        ring===0?0:Math.max(.03,height*Math.min(1.06,level+crown)),
        Math.sin(a)*depth/2*radius*irregular];
    }));
    for(let j=0;j<rings.length-1;j++) {
      const vertices=[];
      for(let i=0;i<n;i++) {
        const next=(i+1)%n,a=points[j][i],b=points[j][next],c=points[j+1][i],d=points[j+1][next];
        vertices.push(...a,...c,...b);
        if(j<rings.length-2) vertices.push(...b,...c,...d);
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
      k.mesh(group,geo,colors[j]);
    }
    if(!floating) {
      // Exposed blue fracture wedges cut the snow lip; vertical veins interrupt the face.
      for(let i=0;i<4;i++) {
        const a=(i/4*Math.PI*1.5)+seed*.21,co=Math.cos(a),si=Math.sin(a);
        k.beam(group,[co*width*.43,height*.29,si*depth*.43],
          [co*width*.34,height*.78,si*depth*.34],.055,'#77aebb',4);
      }
      if(seed%3===1) {
        const rock=k.mesh(group,new T.DodecahedronGeometry(.65,0),'#71858a',width*.24,.9,-depth*.18);
        rock.scale.set(1.7,1.3,1);
      }
    }
    return group;
  }

  // Search a deterministic southern coastal band, so changing paths cannot strand visitors.
  const candidates=[-111,-58,-42,-23,-6,10,57,75,94,108,145,165,-100,-72,126];
  for(let i=0;i<candidates.length&&root.userData.obstacles.length<13;i++) {
    const x=candidates[i],width=11+(i%3)*2.3,depth=5.3+(i%2)*1.5;
    let placed=false;
    for(let z=151;z>=132&&!placed;z-=.6) {
      if(!safeRectangle(x,z,width,depth)) continue;
      if(root.userData.obstacles.some(r=>Math.abs(x-r.x)<(width+r.width)/2+1.5 && Math.abs(z-r.z)<(depth+r.depth)/2+1.5)) continue;
      const height=2.7+(i%5)*.9;
      shelf(x,z,width,depth,height,i);
      root.userData.obstacles.push({id:`polar-ridge-${i}`,x,z,width,depth});
      placed=true;
    }
  }
  // Small detached pack-ice fragments sit offshore; they are scenery outside walking land.
  for(let i=0;i<7;i++) {
    const x=-107+i*42;
    let coast=154;
    for(let z=143;z<=157;z+=.25) if(inside(x,z)) coast=z;
    const z=Math.min(158.7,coast+3.4+(i%2)*1.6),width=3.1+(i%3)*.8,depth=2.2;
    if(inside(x,z)||coords.onPath(x,z,3)) continue;
    shelf(x,z,width,depth,.9+(i%3)*.38,i+20,true);
    root.userData.floatingBlocks.push({id:`floating-pack-ice-${i+20}`,x,z,width,depth,intentionalFloating:true});
  }
  root.userData.pathClearance = 3;
  root.userData.landmarkClearance = 3;
  return root;
}
