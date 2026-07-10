// ============================================================
// scenery.js — 渲染器 / 场景 / 灯光 / 桌面布景(与物理无关)
// 暖色主光 + 冷色补光 + 程序化环境反射,渐变夜色背景
// ============================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TABLE, MESA, BELL, LANE_Z } from './config.js';
import { woodTexture, mesaTopTexture, backgroundTexture } from './textures.js';

export function createScenery(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;   // 0.185 起 PCFSoftShadowMap 已弃用(会打控制台警告)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const bg = backgroundTexture();
  scene.background = bg;
  scene.backgroundIntensity = 0.9;
  scene.fog = new THREE.Fog(0x241d33, 18, 42);

  // PBR 环境反射(程序化 RoomEnvironment,零外部资产)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();

  // ---------- 灯光 ----------
  // 暖色主光(带阴影)
  const key = new THREE.DirectionalLight(0xffd9a6, 2.6);
  key.position.set(6, 9, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -8; key.shadow.camera.right = 8;
  key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
  key.shadow.camera.near = 2; key.shadow.camera.far = 26;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.015;
  scene.add(key);

  // 冷色补光(逆侧,无阴影)
  const fill = new THREE.DirectionalLight(0x7fa8ff, 0.55);
  fill.position.set(-7, 5, -6);
  scene.add(fill);

  // 环境半球光(夜色底色)
  scene.add(new THREE.HemisphereLight(0x4a4468, 0x2b1d14, 0.5));

  // 铃铛上方的暖色小射灯(视觉焦点,响铃时脉冲)
  const bellSpot = new THREE.PointLight(0xffc878, 0.0, 6, 2);
  bellSpot.position.set(BELL.x, 2.6, LANE_Z);
  scene.add(bellSpot);

  // ---------- 材质库 ----------
  const woodTex = woodTexture({ seed: 7 });
  woodTex.repeat.set(3, 2);
  const mats = {
    tableTop: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.62, metalness: 0.02 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x4a2f1a, roughness: 0.7, metalness: 0.02 }),
    midWood: new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.6, metalness: 0.02 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd9a45b, roughness: 0.32, metalness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.28, metalness: 0.92 }),
    ironDark: new THREE.MeshStandardMaterial({ color: 0x3c3f46, roughness: 0.45, metalness: 0.85 }),
  };

  // ---------- 桌面 ----------
  const group = new THREE.Group();
  scene.add(group);

  const tableTop = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.sizeX, TABLE.thick, TABLE.sizeZ),
    mats.tableTop,
  );
  tableTop.position.y = -TABLE.thick / 2;
  tableTop.receiveShadow = true;
  tableTop.castShadow = true;
  group.add(tableTop);

  // 桌边围栏(与物理围栏一致)
  const rimMat = mats.darkWood;
  const rx = TABLE.sizeX / 2, rz = TABLE.sizeZ / 2, rh = TABLE.rimHeight, rt = TABLE.rimThick;
  const mkRim = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, rh, d), rimMat);
    m.position.set(x, rh / 2, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  };
  mkRim(TABLE.sizeX + rt * 2, rt, 0, rz + rt / 2);
  mkRim(TABLE.sizeX + rt * 2, rt, 0, -rz - rt / 2);
  mkRim(rt, TABLE.sizeZ + rt * 2, rx + rt / 2, 0);
  mkRim(rt, TABLE.sizeZ + rt * 2, -rx - rt / 2, 0);

  // 桌腿 + 下方深色地面(纵深感)
  const legGeo = new THREE.BoxGeometry(0.35, 2.2, 0.35);
  for (const [lx, lz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const leg = new THREE.Mesh(legGeo, mats.darkWood);
    leg.position.set(lx * (rx - 0.5), -TABLE.thick - 1.1, lz * (rz - 0.5));
    leg.castShadow = true;
    group.add(leg);
  }
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(26, 48),
    new THREE.MeshStandardMaterial({ color: 0x17131f, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -TABLE.thick - 2.2;
  floor.receiveShadow = true;
  group.add(floor);

  // ---------- 圆形高台(多米诺舞台) ----------
  const mesaSide = woodTexture({ seed: 13, base: '#6d4526', dark: '#4a2c12', light: '#8a5f38', rings: 40 });
  mesaSide.repeat.set(6, 1);
  const mesa = new THREE.Mesh(
    new THREE.CylinderGeometry(MESA.radius, MESA.radius + 0.08, MESA.height, 48, 1, false),
    [
      new THREE.MeshStandardMaterial({ map: mesaSide, roughness: 0.68 }),          // 侧面
      new THREE.MeshStandardMaterial({ map: mesaTopTexture(), roughness: 0.55 }),  // 顶面
      mats.darkWood,                                                               // 底面
    ],
  );
  mesa.position.set(MESA.cx, MESA.height / 2, MESA.cz);
  mesa.castShadow = mesa.receiveShadow = true;
  group.add(mesa);

  // 高台顶沿黄铜包边
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(MESA.radius + 0.02, 0.025, 10, 64),
    mats.brass,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(MESA.cx, MESA.height - 0.01, MESA.cz);
  group.add(ring);

  function resize(w, h) {
    renderer.setSize(w, h);
  }

  return { renderer, scene, mats, bellSpot, resize };
}
