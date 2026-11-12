// 炽渊祭坛场景构建 (scene.js)：100% 程序化几何、PBR 材质与 DataTexture 纹理，零外部资产。
// 四大类被动态火光照亮的周边实体材质：
//   1. 粗糙石材：内圈玄武岩火塘石 + 外围四座雕刻符文石柱（带青铜箍环）
//   2. 焦裂木质：锥形架设松木柴堆（程序化树皮纹理 + 炭红内端发光贴图）与白热炭床
//   3. 锻铁与青铜金属：镂空锻铁火盆肋骨笼、三脚铁架、铁链与烟熏底青铜鼎釜
//   4. 潮湿砂砾与炭灰地面：顶点噪声起伏 + 程序化粗糙度贴图（碎石微反光与中心炭灰）

import * as THREE from 'three';
import { mulberry32, noise3 } from './noise.js';

const rand = mulberry32(20261110);

function vary(base, spread) {
  return base + (rand() * 2 - 1) * spread;
}

/** 生成程序化树皮漫反射与粗糙度纹理 (128×128) */
function createBarkTextures() {
  const W = 128;
  const H = 128;
  const albedoData = new Uint8Array(W * H * 4);
  const roughData = new Uint8Array(W * H * 4);

  const barkLight = [92, 65, 42];
  const barkDark = [38, 25, 16];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const groove = noise3(x * 0.85, y * 0.065, 2.9);
      const grain = noise3(x * 0.24, y * 0.24, 7.3);
      const t = THREE.MathUtils.clamp(groove * 0.74 + grain * 0.44 - 0.16, 0, 1);

      for (let c = 0; c < 3; c++) {
        albedoData[idx + c] = Math.round(barkLight[c] * t + barkDark[c] * (1 - t));
      }
      albedoData[idx + 3] = 255;

      const rVal = Math.round(196 + 52 * grain);
      roughData[idx] = rVal;
      roughData[idx + 1] = rVal;
      roughData[idx + 2] = rVal;
      roughData[idx + 3] = 255;
    }
  }

  const map = new THREE.DataTexture(albedoData, W, H);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughData, W, H);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.needsUpdate = true;

  return { map, roughnessMap };
}

/** 生成木柴靠火心一端的炭红炽热发光渐变贴图 (128×1) */
function createEmberTipTexture() {
  const N = 128;
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const heat = Math.max(0, (t - 0.52) / 0.48);
    const e = Math.pow(heat, 1.75);
    data[i * 4] = Math.min(255, Math.round(255 * e * 1.65));
    data[i * 4 + 1] = Math.min(255, Math.round(255 * e * e * 0.78));
    data[i * 4 + 2] = Math.min(255, Math.round(255 * e * e * e * 0.30));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 生成地面砂砾粗糙度细节贴图 (128×128)，让中圈黑曜碎石反射出温暖火光亮斑 */
function createGroundRoughnessTexture() {
  const W = 128;
  const H = 128;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const n1 = noise3(x * 0.35, y * 0.35, 1.4);
      const n2 = noise3(x * 0.95, y * 0.95, 5.8);
      const pebble = n1 * 0.6 + n2 * 0.4;
      const rough = Math.round(135 + 110 * (1.0 - Math.pow(pebble, 1.6)));
      data[idx] = rough;
      data[idx + 1] = rough;
      data[idx + 2] = rough;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.needsUpdate = true;
  return tex;
}

/** 1. 地面：黑曜砂砾与炭黑火塘 */
function buildGround() {
  const geo = new THREE.CircleGeometry(11.5, 112);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const cSoil = new THREE.Color('#6e5d49');
  const cOuter = new THREE.Color('#24201b');
  const cAsh = new THREE.Color('#120e0a');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);

    const wave = (noise3(x * 0.52 + 8.0, 0.0, z * 0.52 + 8.0) - 0.5)
               * 0.25
               * THREE.MathUtils.smoothstep(r, 1.15, 3.4);
    pos.setY(i, wave);

    const shade = 0.74 + 0.26 * noise3(x * 2.2, 4.1, z * 2.2);
    tmp.lerpColors(cSoil, cOuter, THREE.MathUtils.smoothstep(r, 2.1, 9.8)).multiplyScalar(shade);

    const ashMask = 1.0 - THREE.MathUtils.smoothstep(r, 0.52, 1.32);
    tmp.lerp(cAsh, ashMask);

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    roughnessMap: createGroundRoughnessTexture(),
    metalness: 0.06,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** 2. 石材：火塘玄武岩石圈 + 外围四方矮石墩/断柱（带青铜装饰环） */
function buildBasaltSanctuary() {
  const group = new THREE.Group();
  const baseStoneColor = new THREE.Color('#867d73');

  // 内圈 10 块火塘围石
  const INNER_COUNT = 10;
  for (let i = 0; i < INNER_COUNT; i++) {
    const angle = (i / INNER_COUNT) * Math.PI * 2 + vary(0, 0.12);
    const radius = vary(0.95, 0.06);
    const size = vary(0.155, 0.045);

    const geo = new THREE.IcosahedronGeometry(size, 1);
    const pos = geo.attributes.position;
    const s1 = rand() * 80;
    const s2 = rand() * 80;
    for (let j = 0; j < pos.count; j++) {
      const vx = pos.getX(j);
      const vy = pos.getY(j);
      const vz = pos.getZ(j);
      const n = noise3(vx * 6.0 + s1, vy * 6.0 + s2, vz * 6.0);
      const scale = 1.0 + (n - 0.5) * 0.52;
      pos.setXYZ(j, vx * scale * vary(1.24, 0.08), vy * scale * 0.72, vz * scale * vary(1.15, 0.08));
    }
    geo.computeVertexNormals();

    const col = baseStoneColor.clone().offsetHSL(vary(0, 0.015), vary(0, 0.03), vary(-0.01, 0.05));
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.92,
      metalness: 0.03,
      flatShading: true,
    });
    const stone = new THREE.Mesh(geo, mat);
    stone.position.set(Math.cos(angle) * radius, size * 0.50, Math.sin(angle) * radius);
    stone.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * 0.35);
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

  // 外围 4 座雕刻玄武岩祭坛矮柱（避开正前方主视角，形成极具层次感的远近光影框景）
  const pillarAngles = [0.42, 2.05, 3.62, 5.28];
  const pillarMat = new THREE.MeshStandardMaterial({
    color: '#766f67',
    roughness: 0.86,
    metalness: 0.05,
    flatShading: true,
  });
  const bronzeBandMat = new THREE.MeshStandardMaterial({
    color: '#b87a40',
    roughness: 0.28,
    metalness: 0.92,
  });

  for (let i = 0; i < pillarAngles.length; i++) {
    const a = pillarAngles[i];
    const dist = 2.45 + (i % 2) * 0.22;
    const h = 0.72 + (i % 3) * 0.24;

    const pGeo = new THREE.CylinderGeometry(0.16, 0.21, h, 7, 4);
    const pos = pGeo.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      const vx = pos.getX(j);
      const vy = pos.getY(j);
      const vz = pos.getZ(j);
      const jitter = 1.0 + (noise3(vx * 5 + i * 9, vy * 4, vz * 5) - 0.5) * 0.16;
      pos.setXYZ(j, vx * jitter, vy, vz * jitter);
    }
    pGeo.computeVertexNormals();

    const pillar = new THREE.Mesh(pGeo, pillarMat);
    pillar.position.set(Math.cos(a) * dist, h * 0.48, Math.sin(a) * dist);
    pillar.rotation.z = vary(0, 0.05);
    pillar.rotation.x = vary(0, 0.05);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);

    // 柱身镶嵌青铜箍环，反射跳动的暖金火光高光
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.014, 8, 18), bronzeBandMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pillar.position.x, h * 0.68, pillar.position.z);
    ring.castShadow = true;
    group.add(ring);
  }

  return group;
}

/** 3. 木柴与白热炭床：中心炽热红炭层 + 锥形松木柴堆 + 外侧备柴 */
function buildLogsAndCoalBed() {
  const group = new THREE.Group();
  const { map, roughnessMap } = createBarkTextures();
  const emberTex = createEmberTipTexture();

  // 中心白热炭床隆起（径向渐变顶点色 + 噪声裂纹，中心炽亮、边缘自然融入焦黑炭灰）
  const coalGeo = new THREE.IcosahedronGeometry(0.38, 3);
  coalGeo.scale(1.12, 0.22, 1.12);
  const coalPos = coalGeo.attributes.position;
  const coalColors = new Float32Array(coalPos.count * 3);
  for (let i = 0; i < coalPos.count; i++) {
    const x = coalPos.getX(i);
    const y = coalPos.getY(i);
    const z = coalPos.getZ(i);
    const n = noise3(x * 9.5, y * 9.5, z * 9.5);
    const crack = noise3(x * 18.0 + 3.1, y * 18.0, z * 18.0 + 7.4);
    coalPos.setXYZ(i, x * (0.92 + 0.18 * n), Math.max(0.0, y * (0.8 + 0.35 * n)), z * (0.92 + 0.18 * n));

    const rNorm = Math.hypot(x, z) / 0.42;
    const radialGlow = Math.max(0, 1.0 - Math.pow(rNorm, 1.65));
    const emberPulse = radialGlow * Math.pow(crack, 1.35);
    coalColors[i * 3] = 0.08 + emberPulse * 1.45;
    coalColors[i * 3 + 1] = 0.05 + emberPulse * 0.42;
    coalColors[i * 3 + 2] = 0.04 + emberPulse * 0.08;
  }
  coalGeo.computeVertexNormals();
  coalGeo.setAttribute('color', new THREE.BufferAttribute(coalColors, 3));
  const coalMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
  });
  const coalMesh = new THREE.Mesh(coalGeo, coalMat);
  coalMesh.position.set(0, 0.012, 0);
  group.add(coalMesh);

  // 7 根锥形交错柴堆
  const logMat = new THREE.MeshStandardMaterial({
    map,
    roughnessMap,
    roughness: 1.0,
    metalness: 0.0,
    emissiveMap: emberTex,
    emissive: new THREE.Color('#ff6c1a'),
    emissiveIntensity: 1.25,
  });

  const LOG_COUNT = 7;
  const LOG_LEN = 0.92;
  for (let i = 0; i < LOG_COUNT; i++) {
    const geo = new THREE.CylinderGeometry(vary(0.038, 0.006), vary(0.055, 0.007), LOG_LEN, 10, 1);
    const mesh = new THREE.Mesh(geo, logMat);
    const angle = (i / LOG_COUNT) * Math.PI * 2 + vary(0, 0.16);
    const footR = vary(0.44, 0.04);
    const tilt = vary(1.07, 0.06);

    const dir = new THREE.Vector3(
      -Math.cos(angle) * Math.sin(tilt),
      Math.cos(tilt),
      -Math.sin(angle) * Math.sin(tilt)
    ).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    const foot = new THREE.Vector3(Math.cos(angle) * footR, 0.045, Math.sin(angle) * footR);
    mesh.position.copy(foot).addScaledVector(dir, LOG_LEN * 0.5);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // 石圈旁横卧的 2 根备柴
  const spareMat = new THREE.MeshStandardMaterial({
    map,
    roughnessMap,
    roughness: 0.96,
    metalness: 0.0,
  });
  for (let i = 0; i < 2; i++) {
    const geo = new THREE.CylinderGeometry(0.048, 0.056, 0.88, 10, 1);
    const mesh = new THREE.Mesh(geo, spareMat);
    mesh.rotation.z = Math.PI / 2;
    mesh.rotation.y = vary(1.85, 0.4);
    mesh.position.set(vary(-1.45, 0.12), 0.085 + i * 0.095, vary(1.12, 0.20));
    if (i === 1) mesh.rotation.x = 0.16;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return { group, logMat, coalMat };
}

/** 4. 金属：镂空锻铁火盆肋条、三脚铁架、锁链与烟熏底青铜鼎釜 */
function buildIronBrazierAndCauldron() {
  const group = new THREE.Group();

  const wroughtIron = new THREE.MeshStandardMaterial({
    color: '#3e4249',
    metalness: 0.88,
    roughness: 0.44,
  });
  const polishedBrass = new THREE.MeshStandardMaterial({
    color: '#d49b4b',
    metalness: 0.95,
    roughness: 0.22,
  });
  const patinatedBronze = new THREE.MeshStandardMaterial({
    color: '#b8763c',
    metalness: 0.92,
    roughness: 0.28,
    vertexColors: true,
  });

  // 环绕柴堆的镂空锻铁火盆束环与 8 根弧形铁肋（环绕观察时可直观验证火焰与铁骨的前后深度遮挡）
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.013, 8, 32), wroughtIron);
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = 0.22;
  rimRing.castShadow = true;
  group.add(rimRing);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.28, 6), wroughtIron);
    rib.position.set(Math.cos(a) * 0.49, 0.14, Math.sin(a) * 0.49);
    rib.rotation.z = -Math.cos(a) * 0.24;
    rib.rotation.x = Math.sin(a) * 0.24;
    rib.castShadow = true;
    group.add(rib);
  }

  // 三脚锻铁高架
  const APEX = new THREE.Vector3(0, 1.62, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.52;
    const foot = new THREE.Vector3(Math.cos(a) * 0.88, 0.02, Math.sin(a) * 0.88);
    const dir = APEX.clone().sub(foot);
    const len = dir.length() + 0.15;
    const poleGeo = new THREE.CylinderGeometry(0.017, 0.022, len, 8);
    const pole = new THREE.Mesh(poleGeo, wroughtIron);
    pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    pole.position.copy(foot).addScaledVector(dir, len * 0.5 - 0.05);
    pole.castShadow = true;
    group.add(pole);
  }

  // 顶部黄铜束环与 3 节挂链
  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.009, 8, 20), polishedBrass);
  crownRing.rotation.x = Math.PI / 2;
  crownRing.position.set(0, 1.56, 0);
  group.add(crownRing);

  for (let i = 0; i < 3; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 14), wroughtIron);
    link.position.set(0, 1.51 - i * 0.05, 0);
    link.rotation.y = (i % 2) * (Math.PI / 2);
    link.rotation.x = Math.PI / 12;
    link.castShadow = true;
    group.add(link);
  }

  // 悬吊青铜鼎釜（底部受烟熏渐变黑，上部青铜高光反射火光）
  const potGeo = new THREE.SphereGeometry(0.19, 28, 20);
  potGeo.scale(1.04, 0.80, 1.04);
  {
    const pos = potGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const brightBronze = new THREE.Color('#ffffff');
    const sootBlack = new THREE.Color('#211710');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      tmp.lerpColors(sootBlack, brightBronze, THREE.MathUtils.smoothstep(y, -0.145, 0.025));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    potGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const pot = new THREE.Mesh(potGeo, patinatedBronze);
  pot.position.set(0, 1.20, 0);
  pot.castShadow = true;
  group.add(pot);

  // 鼎釜黄铜装饰腰线与双耳提梁
  const bellyBand = new THREE.Mesh(new THREE.TorusGeometry(0.192, 0.008, 8, 28), polishedBrass);
  bellyBand.rotation.x = Math.PI / 2;
  bellyBand.position.set(0, 1.23, 0);
  group.add(bellyBand);

  const lidGeo = new THREE.CylinderGeometry(0.092, 0.118, 0.036, 20);
  lidGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lidGeo.attributes.position.count * 3).fill(1), 3));
  const lid = new THREE.Mesh(lidGeo, patinatedBronze);
  lid.position.set(0, 1.355, 0);
  group.add(lid);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 10), polishedBrass);
  knob.position.set(0, 1.385, 0);
  group.add(knob);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.009, 8, 24, Math.PI), wroughtIron);
  handle.position.set(0, 1.275, 0);
  group.add(handle);

  return group;
}

/** 5. 夜空穹顶：冷蓝星空 + 银白冷月 + 远山微光，形成强烈冷暖对比 */
function buildNightSky() {
  const skyMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(-0.46, 0.53, -0.71).normalize() },
    },
    vertexShader: /* glsl */ `
      out vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      in vec3 vDir;
      out vec4 outColor;
      uniform float uTime;
      uniform vec3 uMoonDir;

      float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }

      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);

        // 冷夜天穹渐变（线性 HDR）
        vec3 col = mix(vec3(0.026, 0.035, 0.058), vec3(0.004, 0.006, 0.013), pow(up, 0.56));
        col += vec3(0.013, 0.010, 0.008) * exp(-abs(d.y) * 9.0);

        // 闪烁圆形星辰（取栅格中心距离构造圆点星芒，消除方块感）
        vec3 grid = d * 240.0;
        vec3 cell = floor(grid);
        vec3 frac = fract(grid) - 0.5;
        float h = hash13(cell);
        if (h > 0.9955 && d.y > 0.02) {
          float starDist = length(frac);
          float starSpot = smoothstep(0.38, 0.04, starDist);
          float twinkle = 0.65 + 0.35 * sin(uTime * 2.3 + h * 113.0);
          col += vec3(0.88, 0.94, 1.0) * starSpot * ((h - 0.9955) / 0.0045) * 0.85 * twinkle * smoothstep(0.02, 0.22, d.y);
        }

        // 银月与冷蓝月晕
        float mDot = dot(d, uMoonDir);
        col += vec3(0.88, 0.94, 1.08) * smoothstep(0.99964, 0.99985, mDot) * 2.25;
        col += vec3(0.09, 0.13, 0.21) * pow(clamp(mDot, 0.0, 1.0), 210.0);

        outColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(58, 40, 20), skyMat);
  skyMesh.frustumCulled = false;
  return { skyMesh, skyMat };
}

/** 装配完整祭坛篝火场景 */
export function buildSanctuaryScene(scene) {
  scene.fog = new THREE.FogExp2(0x05070c, 0.072);

  scene.add(buildGround());
  scene.add(buildBasaltSanctuary());

  const { group: logsGroup, logMat, coalMat } = buildLogsAndCoalBed();
  scene.add(logsGroup);

  scene.add(buildIronBrazierAndCauldron());

  const { skyMesh, skyMat } = buildNightSky();
  scene.add(skyMesh);

  // 冷夜半球环境光 + 冷月轮廓方向光（使石头和铜鼎背火面有清冷月光勾边）
  scene.add(new THREE.HemisphereLight(0x263250, 0x0b0906, 0.42));
  const moonLight = new THREE.DirectionalLight(0x94a8d2, 0.46);
  moonLight.position.set(-6, 7.2, -9);
  scene.add(moonLight);

  return {
    update(time, flicker, intensity, stokeBoost = 0) {
      skyMat.uniforms.uTime.value = time;
      const eff = intensity + stokeBoost * 0.55;
      logMat.emissiveIntensity = (0.58 + 0.78 * flicker) * eff;
    },
  };
}
