/** Stormwind's major landmarks. All openings are real gaps in wall geometry. */
export function build(ctx) {
  const { THREE, coords: C, kit: K } = ctx;
  const root = new THREE.Group();
  root.name = '暴风城 · 地标';
  const { box, cyl, sphere, roof, arch, floor, beam, banner, window, mesh, tree, lamp } = K;
  const TAU = Math.PI * 2;
  const vaultStone = new THREE.MeshStandardMaterial({ color: '#77796f', roughness: .95, map: ctx.materials.stone.map, side: THREE.DoubleSide });
  const vaultRib = new THREE.MeshStandardMaterial({ color: '#b2aa91', roughness: .88 });
  const glassPanes = ['#46677c', '#9c8559', '#67738d', '#7a6284'].map(color => new THREE.MeshStandardMaterial({ color, roughness: .24, metalness: .18, emissive: color, emissiveIntensity: .16 }));
  const flowingWater = new THREE.MeshPhysicalMaterial({ color: '#d7f5ff', roughness: .08, metalness: .08, transparent: true, opacity: .48, depthWrite: false, clearcoat: 1 });
  const foam = new THREE.MeshBasicMaterial({ color: '#e8ffff', transparent: true, opacity: .4, depthWrite: false });
  const sculptureStone = new THREE.MeshStandardMaterial({ color: '#b9b8a6', roughness: .93 });
  const sculptureRecess = new THREE.MeshStandardMaterial({ color: '#858878', roughness: .97 });
  const weavePixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4, thread = ((x % 4 < 2) !== (y % 4 < 2)) ? 9 : -7;
    weavePixels[i] = 177 + thread; weavePixels[i + 1] = 190 + thread; weavePixels[i + 2] = 214 + thread; weavePixels[i + 3] = 255;
  }
  const weaveMap = new THREE.DataTexture(weavePixels, 64, 64, THREE.RGBAFormat);
  weaveMap.colorSpace = THREE.SRGBColorSpace; weaveMap.wrapS = weaveMap.wrapT = THREE.RepeatWrapping; weaveMap.repeat.set(3, 42); weaveMap.needsUpdate = true;
  weaveMap.magFilter = THREE.LinearFilter; weaveMap.minFilter = THREE.LinearMipmapLinearFilter; weaveMap.generateMipmaps = true;
  const ceremonialRug = ctx.materials.rug.clone(); ceremonialRug.map = weaveMap; ceremonialRug.roughness = 1;
  // Small, deterministic baked AO patches anchor furniture without extra shadow lights.
  const aoPixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4, d = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
    aoPixels[i] = 37; aoPixels[i + 1] = 29; aoPixels[i + 2] = 21;
    aoPixels[i + 3] = Math.round(Math.pow(Math.max(0, 1 - d), 1.35) * 130);
  }
  const aoMap = new THREE.DataTexture(aoPixels, 32, 32, THREE.RGBAFormat);
  aoMap.needsUpdate = true; aoMap.magFilter = THREE.LinearFilter; aoMap.minFilter = THREE.LinearFilter;
  const aoMaterial = new THREE.MeshBasicMaterial({ map: aoMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  function contact(g, x, y, z, w, d) {
    const m = mesh(g, new THREE.PlaneGeometry(w, d), aoMaterial, x, y, z);
    m.rotation.x = -Math.PI / 2; m.castShadow = false; return m;
  }

  function group(name, x, z, angle = 0) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, C.cityY, z);
    g.rotation.y = angle;
    g.userData.grounded = true;
    root.add(g);
    return g;
  }
  function ellipsoid(g, x, y, z, sx, sy, sz, material = 'trim') {
    const m = sphere(g, x, y, z, 1, material);
    m.scale.set(sx, sy, sz);
    return m;
  }
  function ring(g, x, y, z, radius, tube, material = 'trim', horizontal = false, arcLength = TAU) {
    const m = mesh(g, new THREE.TorusGeometry(radius, tube, 6, 32, arcLength), material, x, y, z);
    if (horizontal) m.rotation.x = Math.PI / 2;
    return m;
  }
  function shape(g, points, depth, x, y, z, material = 'trim') {
    const s = new THREE.Shape();
    points.forEach((p, i) => i ? s.lineTo(...p) : s.moveTo(...p));
    s.closePath();
    return mesh(g, new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: .06, bevelSize: .08, bevelSegments: 1 }), material, x, y, z);
  }
  function column(g, x, z, height = 12, radius = .65, baseY = 0) {
    box(g, x, baseY + .25, z, radius * 2.7, .5, radius * 2.7, 'trim', true);
    cyl(g, x, baseY + height / 2, z, radius * .85, radius, height - .8, 'stone', 12, true);
    cyl(g, x, baseY + .8, z, radius * 1.15, radius * 1.2, .25, 'trim', 12);
    box(g, x, baseY + height - .5, z, radius * 2.6, .7, radius * 2.6, 'trim');
    cyl(g, x, baseY + height - 1.1, z, radius * 1.2, radius, .45, 'trim', 12);
  }
  function merlons(g, x, y, z, radius, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU;
      const b = box(g, x + Math.sin(a) * radius, y, z + Math.cos(a) * radius, 1.1, 1.6, 1, 'trim');
      b.rotation.y = a;
    }
  }
  function finial(g, x, y, z, scale = 1) {
    cyl(g, x, y + scale * 1.4, z, .1 * scale, .16 * scale, 2.8 * scale, 'gold', 8);
    sphere(g, x, y + scale * 2.4, z, .28 * scale, 'gold');
    const diamond = mesh(g, new THREE.OctahedronGeometry(.4 * scale), 'gold', x, y + scale * 3, z);
    diamond.scale.y = 1.6;
  }
  function tower(g, x, z, radius, height, roofHeight = 10, material = 'roof') {
    cyl(g, x, 1, z, radius + .8, radius + 1.2, 2, 'darkStone', 12, true);
    cyl(g, x, height / 2, z, radius * .95, radius, height, 'stone', 12, true);
    for (const y of [2, height * .45, height * .77, height - 1]) {
      cyl(g, x, y, z, radius + .35, radius + .35, .6, 'trim', 12);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      for (const y of [height * .39, height * .67]) window(g, x + Math.sin(a) * (radius + .03), y, z + Math.cos(a) * (radius + .03), .9, 2.5, a);
    }
    // Aligned octagonal courses replace the intersecting 12-sided cornice/8-sided roof.
    // The roof's open base meets a capped fascia at the exact same ring of vertices.
    const roofRadius = radius + 1.25, roofBase = height + .99;
    cyl(g, x, height + .15, z, radius + .7, radius + .45, .8, 'trim', 8);
    cyl(g, x, height + .6, z, radius + 1.05, radius + .7, .3, 'trim', 8);
    cyl(g, x, height + .87, z, roofRadius, roofRadius, .24, material, 8);
    mesh(g, new THREE.CylinderGeometry(.15, roofRadius, roofHeight, 8, 1, true), material, x, roofBase + roofHeight / 2, z);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      beam(g, [x + Math.sin(a) * roofRadius, roofBase, z + Math.cos(a) * roofRadius], [x, roofBase + roofHeight, z], .11, 'gold');
    }
    cyl(g, x, roofBase + roofHeight, z, .16, .16, .08, 'gold', 8);
    finial(g, x, roofBase + roofHeight + .1, z, .65);
  }
  function shield(g, x, y, z, scale = 1, material = 'banner') {
    const p = new THREE.Group(); p.position.set(x, y, z); p.scale.setScalar(scale); g.add(p);
    shape(p, [[-1, 1.2], [1, 1.2], [.85, -.25], [0, -1.2], [-.85, -.25]], .18, 0, 0, 0, material);
    const boss = sphere(p, 0, .15, .26, .43, 'gold');
    boss.scale.z = .35;
    for (const side of [-1, 1]) {
      beam(p, [side * .16, -.4, .25], [side * .6, .55, .25], .09, 'gold');
    }
    return p;
  }
  function lancet(g, x, y, z, w, h, rot = 0, material = 'glass') {
    const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = rot; g.add(p);
    const pts = [[-w / 2, 0], [-w / 2, h * .72], [0, h], [w / 2, h * .72], [w / 2, 0]];
    shape(p, pts, .14, 0, 0, 0, material === 'glass' ? glassPanes[0] : material);
    if (material === 'glass') {
      // The mullions sit forward of separate dark glass cells, instead of a yellow board.
      for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
        const px = side * w * .245, py = h * (.13 + row * .245);
        shape(p, [[-w * .2, -h * .1], [w * .2, -h * .1], [w * .2, h * .1], [-w * .2, h * .1]], .025, px, py, .16, glassPanes[(row + (side > 0 ? 1 : 0)) % glassPanes.length]);
      }
    }
    for (let i = 0; i < pts.length; i++) beam(p, [...pts[i], .23], [...pts[(i + 1) % pts.length], .23], .14, 'trim');
    beam(p, [0, 0, .25], [0, h * .97, .25], .07, 'gold');
    for (const level of [.26, .54, .74]) beam(p, [-w / 2 + .1, h * level, .25], [w / 2 - .1, h * level, .25], .06, 'gold');
    for (const level of [.14, .4, .65]) {
      const pane = shape(p, [[0, -.3], [.22, 0], [0, .3], [-.22, 0]], .035, 0, h * level, .25, material === 'arcane' ? 'glass' : 'arcane');
      pane.scale.set(w * .7, w * .7, 1);
    }
    return p;
  }
  function rose(g, x, y, z, r, rot = 0) {
    const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = rot; g.add(p);
    cyl(p, 0, 0, 0, r, r, .2, glassPanes[0], 24).rotation.x = Math.PI / 2;
    ring(p, 0, 0, .18, r + .13, .38, 'trim');
    ring(p, 0, 0, .24, r * .36, .11, 'gold');
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      beam(p, [Math.sin(a) * r * .34, Math.cos(a) * r * .34, .25], [Math.sin(a) * r, Math.cos(a) * r, .25], .1, 'gold');
      const petal = ellipsoid(p, Math.sin(a) * r * .67, Math.cos(a) * r * .67, .27, r * .13, r * .28, .035, glassPanes[i % glassPanes.length]);
      petal.rotation.z = -a;
    }
    shield(p, 0, 0, .3, r * .21, 'banner');
  }

  // Continuous carved surfaces replace the original exposed sphere/cylinder joints.
  function hero(parent, x, y, z, type, scale = 1, angle = 0) {
    const names = ['图拉扬', '奥蕾莉亚', '卡德加', '达纳斯', '库德兰', '瓦里安'];
    const stone = sculptureStone, recess = sculptureRecess;
    const p = new THREE.Group(); p.name = '英雄石雕 · ' + names[type];
    p.position.set(x, y, z); p.rotation.y = angle; p.scale.setScalar(scale); parent.add(p);
    const body = new THREE.Group(); body.scale.set(type === 4 ? 1.12 : 1, type === 4 ? .75 : 1, 1); p.add(body);
    const mage = type === 2, ranger = type === 1, armored = !mage && !ranger;

    function geometry(positions, indices) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals();
      return geo;
    }
    function loft(sections, material = stone, flutes = 0, segments = 24) {
      const positions = [], indices = [];
      sections.forEach((s, row) => {
        for (let i = 0; i < segments; i++) {
          const a = i / segments * TAU, fold = 1 + flutes * Math.cos(a * 9 + row * .13);
          positions.push((s.x || 0) + Math.sin(a) * s.rx * fold, s.y, (s.z || 0) + Math.cos(a) * s.rz * fold);
          if (row) { const a0 = (row - 1) * segments + i, b0 = (row - 1) * segments + (i + 1) % segments, a1 = row * segments + i, b1 = row * segments + (i + 1) % segments; indices.push(a0, b0, a1, b0, b1, a1); }
        }
      });
      const bottom = positions.length / 3; positions.push(sections[0].x || 0, sections[0].y, sections[0].z || 0);
      const top = positions.length / 3; const last = sections.at(-1); positions.push(last.x || 0, last.y, last.z || 0);
      for (let i = 0; i < segments; i++) { indices.push(bottom, (i + 1) % segments, i); const offset = (sections.length - 1) * segments; indices.push(top, offset + i, offset + (i + 1) % segments); }
      return mesh(body, geometry(positions, indices), material);
    }
    function limb(points, radii, material = stone, flatten = 1) {
      const curve = new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v))), count = 26, sides = 14;
      const frames = curve.computeFrenetFrames(count, false), positions = [], indices = [];
      for (let j = 0; j <= count; j++) {
        const t = j / count, pos = curve.getPointAt(t), f = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(f));
        const r = THREE.MathUtils.lerp(radii[k], radii[k + 1], f - k);
        for (let i = 0; i < sides; i++) {
          const a = i / sides * TAU, v = pos.clone().addScaledVector(frames.normals[j], Math.cos(a) * r).addScaledVector(frames.binormals[j], Math.sin(a) * r * flatten);
          positions.push(v.x, v.y, v.z);
          if (j) { const a0 = (j - 1) * sides + i, b0 = (j - 1) * sides + (i + 1) % sides, a1 = j * sides + i, b1 = j * sides + (i + 1) % sides; indices.push(a0, b0, a1, b0, b1, a1); }
        }
      }
      const start = positions.length / 3; positions.push(...points[0]); const finish = positions.length / 3; positions.push(...points.at(-1));
      for (let i = 0; i < sides; i++) { indices.push(start, (i + 1) % sides, i); indices.push(finish, count * sides + i, count * sides + (i + 1) % sides); }
      return mesh(body, geometry(positions, indices), material);
    }
    function hand(at, grip = true) {
      const [hx, hy, hz] = at;
      loft([{y:hy-.18,x:hx,z:hz,rx:.17,rz:.12},{y:hy,x:hx,z:hz+.02,rx:.22,rz:.14},{y:hy+.2,x:hx,z:hz,rx:.17,rz:.12}],stone,0,16);
      for (let i = 0; i < 4; i++) {
        const fx = hx - .14 + i * .095;
        const pts = grip ? [[fx,hy+.12,hz+.07],[fx,hy+.08,hz+.27],[fx,hy-.08,hz+.29],[fx,hy-.15,hz+.15]] : [[fx,hy,hz+.08],[fx,hy-.24,hz+.14],[fx,hy-.36,hz+.04]];
        limb(pts,[.055,.055,.045,.035],stone,.85);
      }
      limb([[hx-.2,hy+.05,hz],[hx-.28,hy-.06,hz+.18],[hx-.12,hy-.18,hz+.24]],[.075,.065,.045],stone);
    }
    function cloak() {
      const nx = 24, ny = 16, positions = [], indices = [];
      for (let side = 0; side < 2; side++) for (let j = 0; j <= ny; j++) {
        const v = j / ny, yy = .52 + v * 3.65, width = 1.47 - .42 * v;
        for (let i = 0; i <= nx; i++) {
          const u = i / nx * 2 - 1, zz = -1.08 + .48 * v + Math.cos(u * Math.PI * 5) * (.14 - .055 * v) + Math.sin(v * 4 + u) * .04;
          positions.push(u * width, yy + (1-v) * .08 * Math.cos(u * Math.PI * 5), zz + (side ? .065 : -.065));
        }
      }
      const stride = nx + 1, layer = stride * (ny + 1);
      for (let side = 0; side < 2; side++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = side * layer + j * stride + i, b = a + 1, c = a + stride, d = c + 1;
        if(side)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
      }
      const boundary=[];for(let i=0;i<=nx;i++)boundary.push(i);for(let j=1;j<=ny;j++)boundary.push(j*stride+nx);for(let i=nx-1;i>=0;i--)boundary.push(ny*stride+i);for(let j=ny-1;j>0;j--)boundary.push(j*stride);
      for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];indices.push(a,b,a+layer,b,b+layer,a+layer);}
      mesh(body,geometry(positions,indices),stone);
    }
    cloak();
    // Torso, neck and collar share one continuous silhouette.
    const slim = ranger ? .83 : 1;
    loft([{y:2.35,rx:.69*slim,rz:.4},{y:2.7,rx:.66*slim,rz:.42},{y:3.05,rx:.7*slim,rz:.49},{y:3.62,rx:.94*slim,rz:.56},{y:3.98,rx:1.01*slim,rz:.48},{y:4.18,rx:.82*slim,rz:.38},{y:4.32,rx:.42,rz:.29},{y:4.52,rx:.27,rz:.27}],stone,.012);
    // Shoulder shells blend into the upper arms rather than exposing a spherical joint.
    for(const side of [-1,1]) {
      const sx=side*(ranger?.78:.91);
      loft([{y:3.65,x:sx,rx:.24,rz:.4},{y:3.86,x:sx,rx:armored?.51:.36,rz:.51},{y:4.1,x:sx,rx:armored?.56:.38,rz:.49},{y:4.27,x:sx,rx:.32,rz:.36},{y:4.31,x:sx,rx:.08,rz:.1}],stone,.015);
    }
    if(mage) {
      loft([{y:.12,rx:1.12,rz:.7},{y:.42,rx:1.07,rz:.69},{y:1.2,rx:.97,rz:.6},{y:2.1,rx:.8,rz:.48},{y:2.7,rx:.69,rz:.42}],stone,.065,36);
    } else {
      for(const side of [-1,1]) {
        const dz=side<0?.12:-.2;
        limb([[side*.38,2.65,0],[side*.55,1.55,dz],[side*.49,.55,dz+.1]],[.38,.39,.31,.3,.23],stone,.9);
        loft([{y:.05,x:side*.49,z:dz+.29,rx:.36,rz:.63},{y:.22,x:side*.49,z:dz+.29,rx:.37,rz:.6},{y:.47,x:side*.49,z:dz+.12,rx:.29,rz:.42},{y:.8,x:side*.49,z:dz+.09,rx:.25,rz:.28}],stone,0,20);
        if(armored)shape(body,[[-.24,0],[0,-.34],[.24,0],[.18,.32],[-.18,.32]],.08,side*.55,1.5,dz+.31,stone);
      }
      // Split surcoat overlaps the pelvis and thigh tops, concealing mechanical-looking joints.
      shape(body,[[-.68,0],[.68,0],[.76,-1.3],[.15,-1.45],[0,-1.12],[-.15,-1.45],[-.76,-1.3]],.1,0,2.67,.35,stone);
    }
    // Head has defined chin, jaw, cheek, brow and crown cross-sections.
    loft([{y:4.5,rx:.16,rz:.19,z:.08},{y:4.62,rx:.28,rz:.28,z:.04},{y:4.85,rx:.38,rz:.34},{y:5.12,rx:.4,rz:.35},{y:5.35,rx:.38,rz:.34},{y:5.57,rx:.3,rz:.28},{y:5.67,rx:.13,rz:.15}],stone,0,24);
    const nose=shape(body,[[-.09,.19],[.06,.15],[.12,-.17],[-.07,-.2]],.17,-.015,5.05,.31,stone);nose.rotation.x=-.1;
    for(const side of [-1,1]) {
      limb([[side*.05,5.23,.32],[side*.2,5.25,.35],[side*.33,5.2,.27]],[.055,.065,.035],stone,.55);
      limb([[side*.08,5.15,.337],[side*.22,5.14,.36],[side*.29,5.13,.30]],[.018,.025,.01],recess,.55);
      loft([{y:4.92,x:side*.39,rx:.065,rz:.09},{y:5.08,x:side*.41,rx:.08,rz:.1},{y:5.2,x:side*.39,rx:.03,rz:.05}],stone,0,12);
    }
    limb([[-.13,4.85,.29],[0,4.83,.35],[.13,4.85,.29]],[.018,.022,.018],recess,.6);
    if(mage||type===4) {
      loft([{y:4.15,rx:.035,rz:.035,z:.43},{y:4.4,rx:.18,rz:.13,z:.4},{y:4.68,rx:.32,rz:.22,z:.3},{y:4.92,rx:.32,rz:.16,z:.3}],stone,.09,24);
      for(const side of [-1,1])limb([[side*.11,4.97,.43],[side*.25,4.88,.48],[side*.3,4.72,.42]],[.09,.1,.045],stone,.7);
      // Swept-back hair follows the skull and ends in carved locks.
      for(const side of [-1,1])for(let i=0;i<3;i++)limb([[side*.22,5.54,-.08-i*.06],[side*.39,5.25,-.16-i*.06],[side*.33,4.8,-.25-i*.06]],[.12,.15,.06],stone,.7);
    } else if(ranger) {
      loft([{y:4.45,rx:.48,rz:.3,z:-.2},{y:5.0,rx:.52,rz:.4,z:-.15},{y:5.5,rx:.45,rz:.35,z:-.1},{y:5.78,rx:.12,rz:.14,z:-.05}],stone,.02);
      // Face remains in front of the hood volume.
      for(const side of [-1,1])limb([[side*.3,5.48,.16],[side*.44,5.02,.1],[side*.48,4.38,-.13]],[.11,.13,.06],stone,.7);
    } else {
      loft([{y:5.25,rx:.42,rz:.38},{y:5.49,rx:.43,rz:.38},{y:5.72,rx:.31,rz:.28},{y:5.8,rx:.05,rz:.08}],stone,.015);
      shape(body,[[-.08,0],[.08,0],[.08,.5],[-.08,.5]],.6,0,5.64,-.3,stone);
    }
    // Articulated arms are swept tapered surfaces; fingers wrap around each prop.
    let right;
    if(ranger)right=[[.8,4,0],[1.4,3.65,.05],[2,3.4,.35]];
    else if(type===0||type===5)right=[[1,4,0],[1.35,4.5,.1],[1.35,5.05,.4]];
    else right=[[1,4,0],[1.35,3.5,.05],[1.4,2.95,.4]];
    const left=ranger?[[-.8,4,0],[-.9,3.45,.2],[.65,3.4,.65]]:[[-1,4,0],[-1.25,3.42,.12],[-.9,2.98,.6]];
    for(const points of [left,right])limb(points,[ranger?.28:.35,.33,.26,.31,.19],stone,.85);
    hand(left.at(-1));hand(right.at(-1));
    if(ranger) {
      const bow=new THREE.CatmullRomCurve3([new THREE.Vector3(1.5,1.7,.35),new THREE.Vector3(2,3.4,.35),new THREE.Vector3(1.5,5.2,.35)]);
      mesh(body,new THREE.TubeGeometry(bow,30,.085,8,false),stone);
      beam(body,[1.5,1.7,.35],[.65,3.4,.65],.022,stone);beam(body,[.65,3.4,.65],[1.5,5.2,.35],.022,stone);
      for(const dx of [-.18,0,.18])beam(body,[dx,3.2,-.8],[dx,5.6,-.8],.045,stone);
    } else if(mage) {
      beam(body,[1.4,.05,.4],[1.4,6.25,.4],.11,stone);
      ring(body,1.4,6.08,.4,.42,.11,stone);
      mesh(body,new THREE.OctahedronGeometry(.22),stone,1.4,6.08,.4);
      box(body,-.9,2.96,.74,.72,.85,.18,stone);
      for(const yy of [2.65,2.8,2.95,3.1,3.25])box(body,-.9,yy,.85,.64,.025,.035,recess);
    } else if(type===4) {
      beam(body,[1.4,1.1,.4],[1.4,5.08,.4],.14,stone);
      box(body,1.4,4.95,.4,1.7,.72,.75,stone);
      for(const xx of [.65,2.15])box(body,xx,4.95,.4,.16,.84,.88,stone);
    } else {
      const raised=type===0||type===5, hy=right.at(-1)[1], len=type===5?2.3:2.05;
      const sword=shape(body,[[-.14,0],[.14,0],[.18,len-.35],[0,len],[-.18,len-.35]],.09,1.4,raised?hy+.25:hy-.25,.4,stone);
      if(!raised)sword.rotation.z=Math.PI;
      box(body,1.4,raised?hy+.25:hy-.25,.45,.95,.14,.22,stone);
      if(type===3||type===5) {
        shape(body,[[-.72,.9],[.72,.9],[.62,-.3],[0,-1.1],[-.62,-.3]],.16,-.95,2.87,.83,stone);
        ring(body,-.95,2.95,1.04,.31,.055,recess);
        shape(body,[[-.06,.55],[.06,.55],[.06,-.5],[-.06,-.5]],.05,-.95,2.95,1.01,stone);
      } else box(body,-.9,3.02,.75,.8,.95,.2,stone);
    }
    // Raised breastplate trim reads as carving in one stone, without a brick-textured cuirass.
    if(armored)for(const side of [-1,1])limb([[side*.7,3.85,.4],[side*.5,3.5,.55],[0,3.2,.51]],[.035,.045,.03],recess,.6);
    return p;
  }

  function gate() {
    const c = C.gate, g = group('暴风城大门', c.x, c.z, Math.atan2(c.x - C.heroes.x, c.z - C.heroes.z));
    floor(g, 0, 0, 0, 28, 15);
    tower(g, -13, 0, 6.1, 25, 10.5);
    tower(g, 13, 0, 6.1, 25, 10.5);
    arch(g, 0, 0, 0, 12, 9, 8, 'trim', 1.2);
    for (const x of [-9.7, 9.7]) box(g, x, 9, 0, 5.5, 18, 7, 'stone', true);
    box(g, 0, 19.2, 0, 14.5, 7, 7, 'stone', true);
    for (const y of [18, 22.5]) box(g, 0, y, .1, 17.2, .65, 8, 'trim');
    roof(g, 0, 23, 0, 18, 8.7, 4.4);
    shield(g, 0, 19.6, 4.16, 2.2);
    shield(g, 0, 19.6, -4.16, 2.2).rotation.y = Math.PI;
    for (const x of [-8.9, 8.9]) {
      banner(g, x, 16, 4.1, 2.3, 6);
      banner(g, x, 16, -4.1, 2.3, 6, Math.PI);
      lamp(g, x, 0, 5.1);
    }
    for (let x = -5; x <= 5; x += 1) {
      beam(g, [x, 15.4, 2.4], [x, 17.5, 2.4], .07, 'iron');
      cyl(g, x, 15.2, 2.4, .13, 0, .45, 'iron', 4);
    }
    box(g, 0, 16.6, 2.4, 11, .12, .12, 'iron');
    for (const s of [-1, 1]) {
      // Low gate shoulders leave the central 12 metre passage completely clear.
      box(g, s * 24, 5.5, 0, 10, 11, 4, 'stone', true);
      box(g, s * 24, 11.1, 0, 10.8, .6, 4.7, 'trim');
      for (let k = 0; k < 5; k++) box(g, s * (20 + k * 2), 12, 0, 1, 1.8, 4.7, 'trim');
    }
    g.userData.interior = '贯通城门';
  }

  function heroes() {
    const c = C.heroes, angle = Math.atan2(C.gate.x - c.x, C.gate.z - c.z);
    const g = group('英雄谷五杰', c.x, c.z, angle);
    const placements = [[-12, 19, 0], [12, 16, 1], [-12, 0, 2], [12, -5, 3], [-12, -21, 4]];
    for (const [x, z, type] of placements) {
      box(g, x, .25, z, 6, .5, 6, 'darkStone', true);
      box(g, x, 1.9, z, 4.8, 3, 4.8, 'stone', true);
      box(g, x, 3.6, z, 5.6, .45, 5.6, 'trim', true);
      shield(g, x, 1.9, z + 2.43, .67, 'banner');
      hero(g, x, 3.82, z, type, type === 4 ? 1.35 : 1.18, x < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }

  function vaultedCeiling(g) {
    function profile(left, right, spring, peak) {
      const mid = (left + right) / 2, span = right - left, shoulder = Math.min(3, (peak - spring) * .65);
      const a = new THREE.CubicBezierCurve3(new THREE.Vector3(left, spring, 0), new THREE.Vector3(left + span * .03, spring + shoulder, 0), new THREE.Vector3(mid - span * .14, peak - .65, 0), new THREE.Vector3(mid, peak, 0));
      const b = new THREE.CubicBezierCurve3(new THREE.Vector3(mid, peak, 0), new THREE.Vector3(mid + span * .14, peak - .65, 0), new THREE.Vector3(right - span * .03, spring + shoulder, 0), new THREE.Vector3(right, spring, 0));
      return [...a.getPoints(16), ...b.getPoints(16).slice(1)];
    }
    function shell(points, material) {
      const positions = [], uv = [], index = [];
      let distance = 0;
      for (let i = 0; i < points.length; i++) {
        if (i) distance += points[i].distanceTo(points[i - 1]);
        for (const z of [-26.3, 26.3]) { positions.push(points[i].x, points[i].y, z); uv.push(distance / 3.2, z / 1.6); }
        if (i < points.length - 1) { const j = i * 2; index.push(j, j + 1, j + 2, j + 2, j + 1, j + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(index); geo.computeVertexNormals();
      mesh(g, geo, material).name = '石砌内拱顶';
    }
    const nave = profile(-8.6, 8.6, 17.1, 23.25);
    const aisles = [profile(-14, -8.6, 17.1, 19.4), profile(8.6, 14, 17.1, 19.4)];
    shell(nave, vaultStone); aisles.forEach(p => shell(p, vaultStone));
    const rib = (pts, radius = .22) => mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, radius, 6, false), vaultRib);
    for (const z of [-20, -10, 0, 10, 20]) {
      rib(nave.map(p => new THREE.Vector3(p.x, p.y - .13, z)), .24);
      for (const aisle of aisles) rib(aisle.map(p => new THREE.Vector3(p.x, p.y - .13, z)), .17);
      for (const x of [-8.6, 8.6]) {
        cyl(g, x, 16.4, z, .48, .55, 1.5, vaultRib, 10);
        box(g, x, 17.05, z, 1.4, .3, 1.4, vaultRib);
      }
      const boss = ellipsoid(g, 0, 22.93, z, .47, .25, .47, 'gold'); boss.name = '拱肋花饰';
    }
    // Diagonal ribs connect each bay's four supports to the crown.
    for (const z of [-15, -5, 5, 15]) {
      for (const direction of [-1, 1]) {
        rib(nave.map((p, i) => new THREE.Vector3(p.x, p.y - .2, z + direction * ((i / (nave.length - 1)) * 10 - 5))), .13);
      }
    }
    beam(g, [0, 23.05, -26], [0, 23.05, 26], .12, vaultRib);
    for (const x of [-13.6, 13.6]) for (const z of [-25, -15, -5, 5, 15, 25]) {
      box(g, x, 8.6, z, .6, 17.2, .8, 'stone', true);
      box(g, x, .4, z, 1.3, .8, 1.4, vaultRib, true);
      box(g, x, 17, z, 1.1, .45, 1.3, vaultRib);
    }
  }

  function cathedral() {
    const c = C.cathedral, g = group('圣光大教堂', c.x, c.z);
    const rise = .72;
    g.position.y += rise;
    g.userData.interior = '大教堂中殿、柱廊、长椅与祭坛';
    // Solid foundation reaches the original street level beneath the raised building.
    const foundation = box(g, 0, -rise / 2, -2.5, 47.6, rise, 71, 'darkStone', true);
    foundation.userData.walkable = true;
    // Matching twelve-sided footings support the projecting tower bases without
    // extending the whole slab into the neighboring home's eastern doorway.
    for (const x of [-17.8, 17.8]) {
      const footing = cyl(g, x, -rise / 2, 19, 6.5, 6.5, rise, 'darkStone', 12, true);
      footing.userData.walkable = true;
    }
    floor(g, 0, .006, 29.5, 47.6, 7, 'paving');
    for (let i = 0; i < 4; i++) {
      const height = (i + 1) * .18, z = 37.2 - i * 1.2;
      const step = box(g, 0, -rise + height / 2, z, 24, height, 1.2, 'trim', true);
      step.userData.walkable = true;
      // A narrow nosing stays flush with each walkable tread.
      box(g, 0, -rise + height - .045, z + .55, 24, .09, .1, 'stone');
    }
    for (const x of [-18.5, 18.5]) {
      const platform = box(g, x, -rise / 2, 33.9, 12, rise, 1.8, 'stone', true);
      platform.userData.walkable = true;
      box(g, x, -.04, 34.76, 12.2, .08, .12, 'trim');
    }
    floor(g, 0, .02, 0, 30, 55, 'paving');
    floor(g, 0, .035, 0, 3.3, 51, ceremonialRug);
    for (const x of [-1.52, 1.52]) box(g, x, .043, 0, .06, .012, 50.8, 'gold');
    const front = c.d / 2;
    // Side walls and rear apse: actual entrance gap is seven metres wide.
    box(g, -14.5, 11.5, 0, 1.3, 23, 55, 'stone', true);
    box(g, 14.5, 11.5, 0, 1.3, 23, 55, 'stone', true);
    box(g, 0, 11.5, -27, 30, 23, 1.3, 'stone', true);
    for (const x of [-9.5, 9.5]) box(g, x, 12, front, 12, 24, 1.8, 'stone', true);
    arch(g, 0, 0, front + .45, 7, 5.5, 2.2, 'trim', .85);
    box(g, 0, 17.1, front, 7, 15.8, 1.8, 'stone', true);
    rose(g, 0, 17.4, front + 1.05, 3.6);
    // Layered entry portal and narrow stained-glass bays break up the broad facade.
    arch(g, 0, 0, front + 1.15, 8.6, 5.5, .65, 'stone', .35);
    for (const x of [-5.3, 5.3]) column(g, x, front + 2.1, 10.2, .38);
    roof(g, 0, 10.3, front + 1.6, 12.2, 4.8, 2.6, 'roof');
    shape(g, [[-6.1, 0], [0, 2.6], [6.1, 0]], .28, 0, 10.3, front + 4.02, 'trim');
    for (const s of [-1, 1]) beam(g, [s * 6.2, 10.3, front + 4.38], [0, 13.05, front + 4.38], .15, 'gold');
    shield(g, 0, 11.3, front + 4.4, .63);
    for (const x of [-11.6, 11.6]) {
      box(g, x, .5, front + 1.2, 2.8, 1, 3.3, 'darkStone', true);
      box(g, x, 7, front + 1.2, 1.8, 13, 2.3, 'stone', true);
      box(g, x, 15.2, front + 1, 1.2, 6, 1.8, 'stone', true);
      for (const y of [1.1, 7.3, 13.1, 18.2]) box(g, x, y, front + 1.25, 2.1, .3, 2.5, 'trim');
      cyl(g, x, 19.3, front + 1.2, 0, 1.05, 2, 'trim', 4);
      finial(g, x, 20.2, front + 1.2, .35);
    }
    for (const x of [-8.1, 8.1]) {
      lancet(g, x, 10.6, front + 1.15, 2.3, 8.2);
      box(g, x, 10.4, front + 1.32, 3, .35, .85, 'trim');
      arch(g, x, 10.6, front + 1.1, 2.7, 6.8, .35, 'trim', .24);
    }
    for (const y of [9.8, 22.3]) box(g, 0, y, front + 1, 27.5, .4, .55, 'trim');
    // Roof ridge, carved gable and gold crest frame the great rose window.
    roof(g, 0, 24, -.2, 31.8, 57, 9.7);
    vaultedCeiling(g);
    shape(g, [[-15.5, 0], [0, 9.7], [15.5, 0]], .7, 0, 24, front + .9, 'stone');
    for (const s of [-1, 1]) beam(g, [s * 16, 24.1, front + 1.7], [0, 34.2, front + 1.7], .28, 'trim');
    rose(g, 0, 27.6, front + 1.7, 1.35);
    finial(g, 0, 34.1, front + 1, 1);
    for (const x of [-17.8, 17.8]) {
      tower(g, x, 19, 5.3, 39, 13.2);
      for (const side of [-1, 1]) box(g, x + side * 3.9, 11, 22, .8, 22, 3, 'trim', true);
      banner(g, x, 26, 24.7, 2.7, 7.5);
    }
    // A distinct rear crossing tower gives the cathedral its recognisable skyline.
    tower(g, 0, -32, 4.2, 38, 14);
    for (let z = -20; z <= 20; z += 10) {
      for (const s of [-1, 1]) {
        column(g, s * 8.6, z, 16, .7);
        contact(g, s * 8.6, .028, z, 3.3, 3.3);
        const colArch = new THREE.Group(); colArch.position.set(s * 8.6, 0, z + 5); colArch.rotation.y = Math.PI / 2; g.add(colArch);
        arch(colArch, 0, 10.8, 0, 8.6, 1.2, .55, 'trim', .35);
        lancet(g, s * 15.2, 8.8, z, 3, 8.3, s * Math.PI / 2);
        // Interior glass faces the room as well; no transparent double walls.
        lancet(g, s * 13.8, 8.8, z, 2.7, 8, -s * Math.PI / 2);
        // Reveals project into the aisle and cast short shadows around the recessed glass.
        for (const dz of [-1.65, 1.65]) box(g, s * 13.45, 12.9, z + dz, .7, 8.5, .22, vaultRib);
        box(g, s * 13.45, 8.6, z, .85, .3, 3.5, vaultRib);
        box(g, s * 16.2, 6, z, 2, 12, 2, 'stone', true);
        const brace = beam(g, [s * 19.1, 5, z], [s * 14.3, 18.5, z], .55, 'trim');
        brace.userData.collider = true;
        cyl(g, s * 18.6, 13, z, 0, .8, 3, 'trim', 4);
      }
    }
    for (const z of [-8, -3, 2, 7, 12, 17]) {
      for (const x of [-4.8, 4.8]) {
        contact(g, x, .029, z, 6.7, 2.5);
        box(g, x, .8, z, 5.6, .28, 1.05, 'wood', true);
        box(g, x, 1.36, z + .4, 5.6, 1.05, .2, 'timber', true);
        for (const dx of [-2.2, 2.2]) box(g, x + dx, .4, z, .22, .8, .6, 'timber', true);
        for (const dx of [-2.85, 2.85]) box(g, x + dx, 1.15, z, .18, 1.6, 1.3, 'wood', true);
        for (const dx of [-2.65, 2.65]) {
          ring(g, x + dx, 1.35, z + .51, .18, .045, 'gold');
          box(g, x + dx, 1.77, z + .4, .33, .12, .35, 'timber');
        }
      }
    }
    // The altar has its own low walkable dais and a broad central approach.
    floor(g, 0, .28, -20, 13, 9, 'trim');
    contact(g, 0, .288, -21, 7.5, 4.8);
    box(g, 0, 1.35, -21, 5, 2, 1.8, 'trim', true);
    box(g, 0, 2.46, -21, 5.4, .25, 2.2, 'gold');
    for (const x of [-3.8, 3.8]) {
      cyl(g, x, 1.7, -21, .13, .28, 3, 'gold', 10);
      sphere(g, x, 3.3, -21, .18, 'glow');
    }
    rose(g, 0, 13.5, -26.25, 4.5);
    for (const x of [-10, 10]) banner(g, x, 13, -26.2, 2.2, 8);
    for (const z of [-11, 9]) {
      ring(g, 0, 11, z, 3.3, .1, 'gold', true);
      ring(g, 0, 12.3, z, 1.25, .08, 'gold', true);
      ellipsoid(g, 0, 11.7, z, .35, .6, .35, 'gold');
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; cyl(g, Math.sin(a) * 3.3, 11.4, z + Math.cos(a) * 3.3, .07, .09, .7, 'white', 6); sphere(g, Math.sin(a) * 3.3, 11.85, z + Math.cos(a) * 3.3, .11, 'glow'); }
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, dx = Math.sin(a), dz = Math.cos(a);
        const arm = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 11.6, z), new THREE.Vector3(dx * 1.9, 10.5, z + dz * 1.9), new THREE.Vector3(dx * 3.3, 11, z + dz * 3.3)]);
        mesh(g, new THREE.TubeGeometry(arm, 16, .055, 5, false), 'gold');
        const pendant = mesh(g, new THREE.OctahedronGeometry(.13), glassPanes[1], dx * 3.3, 10.6, z + dz * 3.3); pendant.scale.y = 1.8;
        cyl(g, dx * 3.3, 11.13, z + dz * 3.3, .22, .1, .2, 'gold', 8);
      }
      beam(g, [0, 24, z], [0, 12, z], .045, 'iron');
      for (const x of [-3.3, 3.3]) beam(g, [0, 13.8, z], [x, 11, z], .045, 'gold');
    }
    const chandelierLight = new THREE.PointLight('#ffd494', 90, 29, 2);
    chandelierLight.position.set(0, 10.8, -11); chandelierLight.castShadow = false; g.add(chandelierLight);
    for (const x of [-5.5, 5.5]) { banner(g, x, 6.8, front + 1.3, 1.5, 3.6); lamp(g, x, 0, front + 3); }
  }

  function fountain() {
    const g = group('教堂广场喷泉', C.square.x + 12, C.square.z + 1);
    cyl(g, 0, .3, 0, 4.7, 5, .6, 'trim', 24, true);
    cyl(g, 0, .65, 0, 4.2, 4.2, .15, 'water', 32);
    ring(g, 0, .7, 0, 4.65, .32, 'trim', true);
    cyl(g, 0, 1.8, 0, .6, 1, 3.1, 'stone', 12, true);
    cyl(g, 0, 3.1, 0, 2.2, .7, .8, 'trim', 20);
    cyl(g, 0, 3.56, 0, 2.05, 2.05, .08, 'water', 24);
    ring(g, 0, 3.65, 0, 2.14, .17, 'trim', true);
    cyl(g, 0, 4.2, 0, .2, .45, 1.2, 'trim', 10);
    mesh(g, new THREE.OctahedronGeometry(.6), 'gold', 0, 4.9, 0);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, x = Math.sin(a), z = Math.cos(a);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x * 2, 3.6, z * 2), new THREE.Vector3(x * 2.65, 2.8, z * 2.65), new THREE.Vector3(x * 3, .8, z * 3)]);
      // Thin translucent streams with detached droplets replace opaque turquoise pipes.
      const stream = mesh(g, new THREE.TubeGeometry(curve, 28, .018, 6, false), flowingWater);
      stream.castShadow = false;
      for (let j = 0; j < 8; j++) {
        const t = .23 + j * .095, p = curve.getPoint(t);
        const drop = ellipsoid(g, p.x + Math.sin(j * 2.4 + i) * .045, p.y - .04, p.z + Math.cos(j * 1.8 + i) * .045, .026, .06, .026, flowingWater);
        drop.castShadow = false;
      }
      ring(g, x * 3, .76, z * 3, .19, .016, foam, true);
      for (let j = 0; j < 3; j++) {
        const a2 = j / 3 * TAU + i;
        ellipsoid(g, x * 3 + Math.cos(a2) * .15, .82 + j * .055, z * 3 + Math.sin(a2) * .15, .022, .035, .022, foam);
      }
    }
  }

  function keep() {
    const c = C.keep, g = group('暴风要塞', c.x, c.z);
    g.userData.interior = '要塞庭院与王座厅';
    floor(g, 0, .02, 0, 65, 65);
    for (const x of [-28, 28]) for (const z of [-25, 25]) tower(g, x, z, 6, z < 0 ? 35 : 29, 11);
    for (const x of [-27, 27]) {
      box(g, x, 9, 0, 3, 18, 50, 'stone', true);
      box(g, x, 18.3, 0, 4.2, .6, 50, 'trim');
      for (let z = -21; z <= 21; z += 4.2) box(g, x, 19.4, z, 4.2, 1.8, 1.3, 'trim');
    }
    const front = 32.5;
    arch(g, 0, 0, front, 9, 6, 3, 'trim', 1.1);
    for (const x of [-17, 17]) box(g, x, 8.5, front, 24, 17, 3, 'stone', true);
    box(g, 0, 15, front, 10.6, 8, 3, 'stone', true);
    box(g, 0, 19.1, front, 58, .7, 4.2, 'trim');
    for (let x = -27; x <= 27; x += 3.6) box(g, x, 20.4, front, 1.4, 2, 4.1, 'trim');
    shield(g, 0, 15.3, front + 1.65, 2.1);
    for (const x of [-9, 9]) banner(g, x, 10.5, front + 1.65, 2.5, 7);
    // Inner throne hall opens onto a real courtyard, with no hidden front wall.
    floor(g, 0, .04, -9, 36, 33, 'paving');
    floor(g, 0, .055, 2, 4, 59, ceremonialRug);
    for (const x of [-1.86, 1.86]) box(g, x, .063, 2, .075, .012, 58.8, 'gold');
    box(g, -18, 10.5, -9, 1.3, 21, 34, 'stone', true);
    box(g, 18, 10.5, -9, 1.3, 21, 34, 'stone', true);
    box(g, 0, 10.5, -26, 37.3, 21, 1.4, 'stone', true);
    for (const x of [-11.3, 11.3]) box(g, x, 10.5, 8, 13.4, 21, 1.4, 'stone', true);
    arch(g, 0, 0, 8, 9, 6, 1.7, 'trim', .8);
    box(g, 0, 16, 8, 9, 11, 1.4, 'stone', true);
    roof(g, 0, 21, -9, 39.4, 37, 10.5);
    // Royal hall uses a timber coffered ceiling rather than the cathedral's stone vault.
    // Its continuous backing conceals every part of the exterior blue roof underside.
    box(g, 0, 20.65, -9, 35.6, .45, 33.5, 'timber');
    for (const x of [-17.4, -5.8, 5.8, 17.4]) {
      box(g, x, 20.05, -9, .55, .8, 33.5, 'timber');
      box(g, x, 19.63, -9, .17, .07, 33.5, 'gold');
    }
    for (const z of [-25.4, -14.4, -3.4, 7.4]) {
      box(g, 0, 20.05, z, 35.6, .8, .55, 'timber');
      box(g, 0, 19.63, z, 35.6, .07, .17, 'gold');
    }
    for (const x of [-11.6, 0, 11.6]) for (const z of [-19.9, -8.9, 2]) {
      box(g, x, 20.33, z, 10.6, .18, 10, 'wood');
      for (const side of [-1, 1]) {
        box(g, x + side * 4.6, 20.12, z, .2, .25, 9, 'gold');
        box(g, x, 20.12, z + side * 4.4, 9.3, .25, .2, 'gold');
      }
      const boss = cyl(g, x, 20.05, z, .75, .75, .2, 'gold', 8);
      boss.name = '王室格顶花饰';
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU;
        beam(g, [x + Math.sin(a) * .75, 19.97, z + Math.cos(a) * .75], [x + Math.sin(a) * 1.5, 19.97, z + Math.cos(a) * 1.5], .055, 'gold');
      }
    }
    shape(g, [[-19, 0], [0, 10], [19, 0]], .6, 0, 21, 9, 'stone');
    rose(g, 0, 23.9, 9.7, 1.8);
    shield(g, 0, 16, 9, 1.8);
    tower(g, 0, -32, 5.1, 37, 11.2);
    for (const z of [-19, -9, 1]) {
      for (const x of [-12, 12]) {
        column(g, x, z, 16, 1);
        banner(g, x * 1.4, 13, z, 2.2, 6.5, x > 0 ? -Math.PI / 2 : Math.PI / 2);
        lancet(g, x > 0 ? 17.28 : -17.28, 10, z, 2.5, 7, x > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      for (const side of [-1, 1]) {
        beam(g, [side * 12, 16, z], [side * 7, 19.7, z], .32, 'timber');
        beam(g, [side * 12, 16, z], [side * 16.8, 19.7, z], .24, 'timber');
        box(g, side * 12, 16.2, z, 2.5, .35, 2.2, 'gold');
      }
    }
    // Walkable low dais: two 0.25 m rises, bounded by the throne itself.
    floor(g, 0, .28, -21, 12, 8, 'trim');
    floor(g, 0, .53, -22, 9, 5, 'trim');
    contact(g, 0, .538, -23, 6.4, 4.8);
    for (const [y, z, width] of [[.18, -17, 12], [.43, -19.5, 9]]) {
      box(g, 0, y, z + .025, width, .1, .065, 'gold');
      for (const x of [-width / 2 + .35, width / 2 - .35]) shield(g, x, y, z + .075, .1, 'banner');
    }
    box(g, 0, 1.1, -23, 3.2, 1.2, 2, 'gold', true);
    // Open tracery above the upholstered back has actual gaps between its ribs.
    for (const x of [-1.45, 1.45]) box(g, x, 3.2, -23.8, .25, 4.6, .45, 'gold', true);
    box(g, 0, 2.8, -23.8, 2.65, 2.8, .35, 'gold', true);
    box(g, 0, 2.8, -23.57, 2.3, 2.55, .15, 'rug');
    ring(g, 0, 4.2, -23.75, 1.42, .11, 'gold', false, Math.PI);
    for (const side of [-1, 1]) {
      beam(g, [side * 1.3, 4.2, -23.7], [0, 5.5, -23.7], .075, 'gold');
      ring(g, side * .55, 4.65, -23.69, .3, .055, 'gold');
      box(g, side * .9, 1.3, -21.96, .18, .65, .05, 'banner');
    }
    for (const y of [1.8, 2.7, 3.6]) for (const x of [-.7, 0, .7]) sphere(g, x, y, -23.46, .045, 'gold');
    for (const x of [-1.8, 1.8]) {
      box(g, x, 1.8, -23, .4, 1.5, 2.4, 'gold', true);
      finial(g, x, 3.5, -23.7, .55);
    }
    shield(g, 0, 6.25, -23.8, .68);
    // One visible hanging lantern supplies the throne's warm focal light.
    beam(g, [0, 19.8, -21], [0, 7.8, -21], .045, 'iron');
    ring(g, 0, 7.7, -21, .55, .07, 'gold', true);
    cyl(g, 0, 6.45, -21, .55, .22, .35, 'gold', 8);
    ellipsoid(g, 0, 7.02, -21, .32, .56, .32, 'glow');
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; beam(g, [Math.sin(a) * .5, 6.5, -21 + Math.cos(a) * .5], [Math.sin(a) * .5, 7.7, -21 + Math.cos(a) * .5], .045, 'gold'); }
    const throneLight = new THREE.PointLight('#ffd09a', 110, 18, 2); throneLight.position.set(0, 7, -21); throneLight.castShadow = false; g.add(throneLight);
    banner(g, -6, 11, -25.2, 3.3, 11); banner(g, 6, 11, -25.2, 3.3, 11);
    for (const x of [-20, 20]) for (const z of [14, 25]) {
      cyl(g, x, .35, z, 2.1, 2.4, .7, 'trim', 10, true);
      tree(g, x, .7, z, .6);
    }
    for (const x of [-7, 7]) { lamp(g, x, 0, 27); lamp(g, x, 0, 11); }
  }

  function mage() {
    const c = C.mage, g = group('巫师圣殿', c.x, c.z);
    g.userData.interior = '法师塔底层奥术书房';
    floor(g, 0, .02, 0, 14.5, 14.5, 'paving');
    // Sixteen tangent wall panels, with the southern two omitted for a real door.
    for (let i = 1; i < 16; i++) {
      const a = i / 16 * TAU;
      if (i === 1 || i === 15) continue;
      const m = box(g, Math.sin(a) * 7.3, 3.5, Math.cos(a) * 7.3, 3.1, 7, 1, 'stone', true);
      m.rotation.y = a;
    }
    arch(g, 0, 0, 7.2, 4.5, 3.6, 1.4, 'trim', .65);
    for (const x of [-5.6, 5.6]) box(g, x, 3.5, 6.1, 3.5, 7, 1.2, 'stone', true);
    cyl(g, 0, 8, 0, 7.7, 8.4, 2, 'trim', 16);
    cyl(g, 0, 18, 0, 6, 7.3, 18, 'stone', 16, true);
    for (const y of [10, 18, 27]) {
      cyl(g, 0, y, 0, y === 27 ? 8.1 : 7.6, 7.4, .85, 'trim', 16);
      ring(g, 0, y + .5, 0, 7.1, .15, 'gold', true);
    }
    cyl(g, 0, 29.3, 0, 8.1, 7.3, 4, 'stone', 12, true);
    cyl(g, 0, 36.5, 0, .15, 9.2, 11, 'purple', 12);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      for (const y of [14, 22]) lancet(g, Math.sin(a) * 7, y, Math.cos(a) * 7, 1.5, 3.2, a, 'arcane');
      beam(g, [Math.sin(a) * 9.1, 31, Math.cos(a) * 9.1], [0, 42, 0], .1, 'gold');
    }
    finial(g, 0, 42, 0, .8);
    ring(g, 0, 44, 0, 1.6, .1, 'gold', false);
    const orbit = ring(g, 0, 44, 0, 1.8, .07, 'arcane', false); orbit.rotation.y = Math.PI / 2; orbit.rotation.z = .4;
    sphere(g, 0, 44, 0, .5, 'arcane');
    // Floor sigil, desk, tomes and a clear central path into the chamber.
    ring(g, 0, .07, 0, 3.7, .06, 'gold', true);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; beam(g, [Math.sin(a) * 2, .09, Math.cos(a) * 2], [Math.sin(a + Math.PI / 2) * 2, .09, Math.cos(a + Math.PI / 2) * 2], .028, 'arcane'); }
    box(g, 0, 1.25, -4.3, 4.7, .3, 1.7, 'wood', true);
    for (const x of [-1.8, 1.8]) box(g, x, .6, -4.3, .2, 1.2, 1.3, 'timber', true);
    for (let i = 0; i < 6; i++) box(g, -1.5 + i * .5, 1.55 + (i % 2) * .08, -4.3, .4, .25, .75, i % 2 ? 'banner' : 'redRoof');
    sphere(g, 0, 2.4, -4.3, .6, 'arcane');
    for (const side of [-1, 1]) {
      const bookcase = new THREE.Group(); bookcase.position.set(side * 5.5, 0, -1.6); bookcase.rotation.y = side * Math.PI / 2; g.add(bookcase);
      box(bookcase, 0, 2, 0, 3.2, 4, .45, 'timber', true);
      for (let y = .7; y < 4; y += 1) {
        box(bookcase, 0, y, .3, 3.5, .15, .8, 'wood');
        for (let i = 0; i < 9; i++) box(bookcase, -1.35 + i * .33, y + .35, .35, .22, .55 + (i % 3) * .06, .4, ['banner', 'redRoof', 'purple'][i % 3]);
      }
    }
  }

  function lionRest() {
    const c = C.lion, g = group('狮眠之地', c.x, c.z);
    floor(g, 0, .02, 0, 41, 28, 'paving');
    // Memorial faces the garden and sunset sea; broad avenues remain accessible.
    cyl(g, -3, .3, -3, 6.8, 7.2, .6, 'trim', 16, true);
    cyl(g, -3, 1.6, -3, 5.3, 5.9, 2, 'stone', 12, true);
    cyl(g, -3, 2.85, -3, 5.7, 5.5, .5, 'trim', 12);
    hero(g, -3, 3.1, -3, 5, 1.5, .4);
    shield(g, -3, 1.6, 2.45, 1.3);
    for (const x of [-16, 15]) {
      for (const z of [-9, 9]) {
        box(g, x, .4, z, 6, .8, 5, 'trim', true);
        box(g, x, .84, z, 5.5, .1, 4.5, 'soil');
        tree(g, x, .9, z, .65);
        for (let i = 0; i < 8; i++) sphere(g, x - 2.2 + (i % 4) * 1.4, 1.05, z + (i < 4 ? 1.6 : -1.6), .26, 'flower');
      }
    }
    for (const x of [-10, 7]) {
      box(g, x, .75, 9, 4, .3, 1.3, 'stone', true);
      for (const dx of [-1.4, 1.4]) box(g, x + dx, .35, 9, .5, .7, 1.2, 'trim', true);
    }
    for (const z of [-11, 11]) lamp(g, 10, 0, z);
    // Four metre opening at the southern end connects the garden to the harbor ramp.
    box(g, -20, .25, -2, .8, .5, 24, 'trim', true);
    box(g, -20, 1.8, -2, .8, .3, 24, 'trim');
    for (let z = -13; z <= 9; z += 1.3) cyl(g, -20, 1, z, .18, .25, 1.3, 'stone', 8, true);
  }

  gate(); heroes(); cathedral(); fountain(); keep(); mage(); lionRest();
  root.userData.landmarks = ['暴风城大门', '英雄谷五杰', '圣光大教堂', '暴风要塞', '巫师圣殿', '狮眠之地'];
  root.userData.interiors = [
    { id: 'cathedral-nave', name: '圣光大教堂中殿', zone: 'cathedral', x: C.cathedral.x, y: C.cityY + .72, z: C.cathedral.z + C.cathedral.d / 2 + 1.5, heading: Math.PI, inside: { x: C.cathedral.x, z: C.cathedral.z + 23 }, width: 7, height: 5.5 },
    { id: 'stormwind-keep', name: '暴风要塞庭院与王座厅', zone: 'keep', x: C.keep.x, y: C.cityY, z: C.keep.z + 35, heading: Math.PI, inside: { x: C.keep.x, z: C.keep.z + 28 }, width: 9, height: 6 },
    { id: 'wizard-sanctum', name: '巫师圣殿底层', zone: 'mage', x: C.mage.x, y: C.cityY, z: C.mage.z + 9, heading: Math.PI, inside: { x: C.mage.x, z: C.mage.z + 4 }, width: 4.5, height: 3.6 },
  ];
  return root;
}
