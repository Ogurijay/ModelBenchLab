import * as THREE from 'three';

/**
 * 创建边缘与纵向双重平滑衰减的体积光束材质（彻底消除硬边圆锥伪影）
 */
function createVolumetricBeamMaterial(colorHex = 0xffe89e, initialIntensity = 0.0) {
  const uniforms = {
    uColor: { value: new THREE.Color(colorHex) },
    uIntensity: { value: initialIntensity }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        if (uIntensity < 0.005) discard;
        // ConeGeometry 默认 vUv.y=1 为锥顶(灯源)，vUv.y=0 为远端开口
        float distAlong = 1.0 - vUv.y;
        float lengthFade = smoothstep(0.0, 0.08, distAlong) * pow(1.0 - distAlong, 2.2);
        // 掠射角边缘平滑归零，消除圆锥轮廓硬边
        float edgeSoft = pow(abs(dot(normalize(vNormal), normalize(vViewDir))), 2.1);
        float alpha = lengthFade * edgeSoft * uIntensity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });

  return { material, uniforms };
}

/**
 * 1. 远洋科考拖网船 (Research Trawler)
 */
export function createTrawlerVessel() {
  const group = new THREE.Group();

  const hullRedMat = new THREE.MeshStandardMaterial({
    color: 0x992822,
    roughness: 0.48,
    metalness: 0.12
  });
  const hullBlueMat = new THREE.MeshStandardMaterial({
    color: 0x1b3f66,
    roughness: 0.42,
    metalness: 0.18
  });
  const whiteStripeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.35
  });
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x856443,
    roughness: 0.72,
    metalness: 0.05
  });
  const cabinWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.35,
    metalness: 0.08
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.55
  });
  const winGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffe4a0
  });
  const orangeMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.32
  });

  // 船底吃水部
  const lowerHullGeo = new THREE.BoxGeometry(4.5, 1.55, 13.8);
  const lowerPos = lowerHullGeo.attributes.position;
  for (let i = 0; i < lowerPos.count; i++) {
    const z = lowerPos.getZ(i);
    const y = lowerPos.getY(i);
    if (z > 2.5) {
      const t = (z - 2.5) / 4.4;
      lowerPos.setX(i, lowerPos.getX(i) * Math.max(0.08, 1.0 - t * 0.88));
    }
    if (y < 0) {
      lowerPos.setX(i, lowerPos.getX(i) * 0.76);
    }
  }
  lowerHullGeo.computeVertexNormals();
  const lowerHull = new THREE.Mesh(lowerHullGeo, hullRedMat);
  lowerHull.position.y = -0.35;
  group.add(lowerHull);

  // 干舷船壳
  const upperHullGeo = new THREE.BoxGeometry(4.85, 1.38, 14.6);
  const upperPos = upperHullGeo.attributes.position;
  for (let i = 0; i < upperPos.count; i++) {
    const z = upperPos.getZ(i);
    if (z > 2.0) {
      const t = (z - 2.0) / 5.3;
      upperPos.setX(i, upperPos.getX(i) * Math.max(0.05, 1.0 - Math.pow(t, 1.35) * 0.94));
      if (upperPos.getY(i) > 0) {
        upperPos.setY(i, upperPos.getY(i) + t * 0.52);
      }
    }
  }
  upperHullGeo.computeVertexNormals();
  const upperHull = new THREE.Mesh(upperHullGeo, hullBlueMat);
  upperHull.position.y = 0.86;
  group.add(upperHull);

  // 船舷白色吃水装饰线（随船首同步收尖）
  const stripeGeo = new THREE.BoxGeometry(4.92, 0.14, 14.2);
  const sPos = stripeGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const z = sPos.getZ(i);
    if (z > 2.0) {
      const t = (z - 2.0) / 5.1;
      sPos.setX(i, sPos.getX(i) * Math.max(0.05, 1.0 - Math.pow(t, 1.35) * 0.94));
      sPos.setY(i, sPos.getY(i) + t * 0.22);
    }
  }
  stripeGeo.computeVertexNormals();
  const waterlineStripe = new THREE.Mesh(stripeGeo, whiteStripeMat);
  waterlineStripe.position.set(0, 0.36, 0);
  group.add(waterlineStripe);

  // 木质主甲板
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.16, 12.8), deckMat);
  deck.position.set(0, 1.48, -0.3);
  group.add(deck);

  // 驾驶室一层与二层桥楼
  const cabinBase = new THREE.Mesh(new THREE.BoxGeometry(3.55, 1.75, 4.6), cabinWhiteMat);
  cabinBase.position.set(0, 2.38, 0.8);
  group.add(cabinBase);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.25, 1.25, 3.15), cabinWhiteMat);
  bridge.position.set(0, 3.75, 1.15);
  group.add(bridge);

  const bridgeRoof = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.14, 3.35), orangeMat);
  bridgeRoof.position.set(0, 4.42, 1.15);
  group.add(bridgeRoof);

  // 桥楼暖光舷窗
  const frontWin = new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.52, 0.12), winGlowMat);
  frontWin.position.set(0, 3.85, 2.68);
  group.add(frontWin);

  const sideWinL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 2.2), winGlowMat);
  sideWinL.position.set(1.58, 3.85, 1.15);
  group.add(sideWinL);

  const sideWinR = sideWinL.clone();
  sideWinR.position.x = -1.58;
  group.add(sideWinR);

  // 烟囱与主桅杆
  const smokestack = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 2.1, 14), orangeMat);
  smokestack.position.set(0, 4.15, -0.85);
  group.add(smokestack);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 3.6, 10), darkMetalMat);
  mast.position.set(0, 5.75, 1.35);
  group.add(mast);

  const crossArm = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.1), darkMetalMat);
  crossArm.position.set(0, 6.8, 1.35);
  group.add(crossArm);

  // 旋转航海雷达横杆
  const radarBar = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.14, 0.28), cabinWhiteMat);
  radarBar.position.set(0, 4.68, 1.85);
  group.add(radarBar);

  // 后甲板龙门A字架与救生圈挂件
  const gantryL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8), darkMetalMat);
  gantryL.position.set(1.75, 2.9, -5.6);
  gantryL.rotation.x = -0.18;
  group.add(gantryL);

  const gantryR = gantryL.clone();
  gantryR.position.x = -1.75;
  group.add(gantryR);

  const gantryTop = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 0.18), orangeMat);
  gantryTop.position.set(0, 4.35, -5.88);
  group.add(gantryTop);

  // 左红右绿航行舷灯
  const portLightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  );
  portLightMesh.position.set(1.75, 4.2, 1.8);
  group.add(portLightMesh);

  const starboardLightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x22c55e })
  );
  starboardLightMesh.position.set(-1.75, 4.2, 1.8);
  group.add(starboardLightMesh);

  // 船首柔和探照灯束（指向船首前方海面 +Z 方向）
  const beamGeo = new THREE.ConeGeometry(4.2, 24, 24, 1, true);
  beamGeo.translate(0, -12, 0);
  beamGeo.rotateX(Math.PI / 2 + 0.18);
  const { material: beamMat, uniforms: beamUniforms } = createVolumetricBeamMaterial(0xfff3c4, 0.0);
  const searchBeam = new THREE.Mesh(beamGeo, beamMat);
  searchBeam.position.set(0, 4.25, 2.75);
  group.add(searchBeam);

  return {
    group,
    radarBar,
    searchBeam,
    beamUniforms
  };
}

/**
 * 2. 航道观测浮标 (Navigation Buoy)
 */
export function createNavBuoy(colorHex = 0xef4444, beaconHex = 0xff4d4d) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.36,
    metalness: 0.22
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.42,
    metalness: 0.55
  });

  const floatBase = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.92, 1.2, 18), bodyMat);
  floatBase.position.y = 0.2;
  group.add(floatBase);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.78, 2.4, 8, 1, false), bodyMat);
  tower.position.y = 1.85;
  group.add(tower);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.07, 8, 18), metalMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.6;
  group.add(ring);

  const beaconMat = new THREE.MeshBasicMaterial({ color: beaconHex });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 12), beaconMat);
  beacon.position.y = 3.25;
  group.add(beacon);

  const haloMat = new THREE.MeshBasicMaterial({
    color: beaconHex,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 12), haloMat);
  halo.position.y = 3.25;
  group.add(halo);

  return { group, beaconMat, halo, haloMat };
}

/**
 * 3. 远海玄武岩礁石与旋转引航灯塔岛 (Lighthouse Island)
 * 含深水扎根基座、层叠岩壁、守塔人石屋与柔和体积光束
 */
export function createLighthouseIsland(position = new THREE.Vector3(-78, 0, -58)) {
  const group = new THREE.Group();
  group.position.copy(position);

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.85,
    metalness: 0.08,
    flatShading: true
  });

  // 宽阔的水下至水上扎根主岛台，杜绝任何悬空感
  const baseIslandGeo = new THREE.CylinderGeometry(11.5, 22.0, 12.0, 14, 3);
  const bPos = baseIslandGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const vx = bPos.getX(i);
    const vy = bPos.getY(i);
    const vz = bPos.getZ(i);
    const angle = Math.atan2(vz, vx);
    const n = 0.85 + 0.22 * Math.sin(angle * 4.0 + vy * 0.4) * Math.cos(angle * 3.0);
    bPos.setX(i, vx * n);
    bPos.setZ(i, vz * n);
  }
  baseIslandGeo.computeVertexNormals();
  const baseIsland = new THREE.Mesh(baseIslandGeo, rockMat);
  baseIsland.position.y = 1.5; // 从 y = -4.5 延伸至 y = +7.5
  group.add(baseIsland);

  // 环绕副礁石群
  const subRocks = [
    { rTop: 4.5, rBot: 11.0, h: 9.0, x: 11, y: 0.5, z: 6 },
    { rTop: 3.8, rBot: 9.5, h: 8.0, x: -10, y: 0.0, z: 7 },
    { rTop: 5.0, rBot: 10.5, h: 8.5, x: -6, y: 0.2, z: -10 }
  ];
  for (let i = 0; i < subRocks.length; i++) {
    const sr = subRocks[i];
    const geo = new THREE.CylinderGeometry(sr.rTop, sr.rBot, sr.h, 9, 2);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, rockMat);
    m.position.set(sr.x, sr.y, sr.z);
    group.add(m);
  }

  // 红白相间灯塔塔身
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
  const lanternGlassMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });

  const stripeHeights = [4.5, 4.5, 4.5, 4.5];
  let curY = 7.2;
  for (let s = 0; s < stripeHeights.length; s++) {
    const h = stripeHeights[s];
    const rBottom = 3.1 - s * 0.28;
    const rTop = 3.1 - (s + 1) * 0.28;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBottom, h, 20),
      s % 2 === 0 ? whiteMat : redMat
    );
    seg.position.y = curY + h * 0.5;
    curY += h;
    group.add(seg);
  }

  // 守塔人白墙红顶小屋
  const keeperHouse = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.0, 3.8), whiteMat);
  keeperHouse.position.set(5.2, 8.2, 2.2);
  group.add(keeperHouse);

  const keeperRoof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), redMat);
  keeperRoof.position.set(5.2, 10.6, 2.2);
  keeperRoof.rotation.y = Math.PI / 4;
  group.add(keeperRoof);

  // 灯笼室与穹顶
  const gallery = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.1, 0.55, 20),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 })
  );
  gallery.position.y = curY + 0.28;
  group.add(gallery);

  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16), lanternGlassMat);
  lantern.position.y = curY + 1.65;
  group.add(lantern);

  const dome = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.9, 20), redMat);
  dome.position.y = curY + 3.7;
  group.add(dome);

  // 双向柔和体积旋转灯塔光束（使用自定义边缘羽化 ShaderMaterial）
  const beamPivot = new THREE.Group();
  beamPivot.position.y = curY + 1.65;
  group.add(beamPivot);

  const coneGeo = new THREE.ConeGeometry(11, 95, 28, 1, true);
  coneGeo.translate(0, -47.5, 0);
  coneGeo.rotateX(Math.PI / 2);

  const { material: coneMat, uniforms: coneUniforms } = createVolumetricBeamMaterial(0xffe89e, 0.0);

  const beam1 = new THREE.Mesh(coneGeo, coneMat);
  const beam2 = new THREE.Mesh(coneGeo, coneMat);
  beam2.rotation.y = Math.PI;
  beamPivot.add(beam1, beam2);

  return {
    group,
    beamPivot,
    coneUniforms
  };
}

/**
 * 4. 可投放与拖拽抛掷的四类浮体生成函数
 */
export function createFloaterMesh(kind = 'crate') {
  const group = new THREE.Group();

  if (kind === 'crate') {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xc28549,
      roughness: 0.72,
      metalness: 0.05
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x8a5628,
      roughness: 0.78
    });
    const core = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.45, 1.45), woodMat);
    const band1 = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.18, 1.52), frameMat);
    band1.position.y = 0.48;
    const band2 = band1.clone();
    band2.position.y = -0.48;
    group.add(core, band1, band2);
    return {
      mesh: group,
      waterlineOffset: -0.12,
      collisionRadius: 1.05,
      samplePoints: [
        { x: -0.65, y: 0, z: -0.65, weight: 0.25 },
        { x: 0.65, y: 0, z: -0.65, weight: 0.25 },
        { x: -0.65, y: 0, z: 0.65, weight: 0.25 },
        { x: 0.65, y: 0, z: 0.65, weight: 0.25 }
      ]
    };
  }

  if (kind === 'drum') {
    const blueDrumMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.35,
      metalness: 0.35
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.38,
      metalness: 0.25
    });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.65, 20), blueDrumMat);
    cyl.rotation.z = Math.PI / 2;
    const rib1 = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.045, 8, 20), stripeMat);
    rib1.rotation.y = Math.PI / 2;
    rib1.position.x = -0.35;
    const rib2 = rib1.clone();
    rib2.position.x = 0.35;
    group.add(cyl, rib1, rib2);
    return {
      mesh: group,
      waterlineOffset: -0.06,
      collisionRadius: 0.95,
      samplePoints: [
        { x: -0.7, y: 0, z: -0.4, weight: 0.25 },
        { x: 0.7, y: 0, z: -0.4, weight: 0.25 },
        { x: -0.7, y: 0, z: 0.4, weight: 0.25 },
        { x: 0.7, y: 0, z: 0.4, weight: 0.25 }
      ]
    };
  }

  if (kind === 'buoyring') {
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff5722,
      roughness: 0.32,
      metalness: 0.08
    });
    const whiteBandMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35
    });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.24, 14, 28), orangeMat);
    torus.rotation.x = Math.PI / 2;
    group.add(torus);

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.26, 12), whiteBandMat);
      strap.position.set(Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82);
      strap.rotation.z = Math.PI / 2;
      strap.rotation.y = -a;
      group.add(strap);
    }

    return {
      mesh: group,
      waterlineOffset: 0.03,
      collisionRadius: 1.0,
      samplePoints: [
        { x: -0.75, y: 0, z: 0, weight: 0.25 },
        { x: 0.75, y: 0, z: 0, weight: 0.25 },
        { x: 0, y: 0, z: -0.75, weight: 0.25 },
        { x: 0, y: 0, z: 0.75, weight: 0.25 }
      ]
    };
  }

  const yellowMat = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    roughness: 0.28,
    metalness: 0.3
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.72, 20, 16), yellowMat);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.05, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 })
  );
  antenna.position.y = 0.95;
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
  );
  tip.position.y = 1.52;
  group.add(sphere, antenna, tip);

  return {
    mesh: group,
    waterlineOffset: -0.08,
    collisionRadius: 0.85,
    samplePoints: [
      { x: -0.5, y: 0, z: -0.5, weight: 0.25 },
      { x: 0.5, y: 0, z: -0.5, weight: 0.25 },
      { x: -0.5, y: 0, z: 0.5, weight: 0.25 },
      { x: 0.5, y: 0, z: 0.5, weight: 0.25 }
    ]
  };
}

/**
 * 5. 入水水花粒子环管理器
 */
export function createSplashManager(scene) {
  const activeSplashes = [];
  const ringGeo = new THREE.RingGeometry(0.35, 0.85, 24);
  ringGeo.rotateX(-Math.PI / 2);

  function spawnSplash(x, y, z, strength = 1.0) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.set(x, y + 0.08, z);
    const scale = Math.min(2.4, Math.max(0.7, strength * 0.22));
    mesh.scale.setScalar(scale);
    scene.add(mesh);

    activeSplashes.push({
      mesh,
      mat,
      age: 0,
      maxAge: 0.95,
      baseScale: scale
    });
  }

  function update(dt) {
    for (let i = activeSplashes.length - 1; i >= 0; i--) {
      const s = activeSplashes[i];
      s.age += dt;
      const t = s.age / s.maxAge;
      if (t >= 1.0) {
        scene.remove(s.mesh);
        s.mat.dispose();
        activeSplashes.splice(i, 1);
      } else {
        const sc = s.baseScale * (1.0 + t * 3.4);
        s.mesh.scale.setScalar(sc);
        s.mat.opacity = 0.82 * (1.0 - t) * (1.0 - t);
      }
    }
  }

  return { spawnSplash, update };
}
