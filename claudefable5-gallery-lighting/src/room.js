// ============================================================
// room.js — 展厅建筑:反射地面 / 墙体 / 天窗 / 隔断 / 长凳 / 入口
//   房间坐标:x ∈ [-13, 13],z ∈ [-7, 7],层高 5m
//   动线:入口(西)→ 一区 → 绕隔断 A → 二区 → 绕隔断 B → 三区(金色回响)
// ============================================================
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

export const ROOM = { W: 26, D: 14, H: 5 };

export function buildRoom(scene, tex) {
  const g = new THREE.Group();
  g.name = 'room';
  scene.add(g);
  const boxColliders = [];

  // ---------- 共用材质 ----------
  const wallMat = new THREE.MeshStandardMaterial({
    map: tex.plaster.map, bumpMap: tex.plaster.bumpMap, bumpScale: 0.4, roughness: 0.94,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x232326, roughness: 0.4, metalness: 0.5 });
  const woodTrimMat = new THREE.MeshStandardMaterial({ map: tex.wood.map, color: 0xcbbba6, roughness: 0.5 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.95 });
  const aoMat = new THREE.MeshBasicMaterial({ map: tex.ao, transparent: true, opacity: 0.5, depthWrite: false });

  function box(w, h, d, x, y, z, mat, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    g.add(m);
    return m;
  }

  // ---------- 地面:实时镜面 + 半透明磨石层(真实反射感) ----------
  const reflector = new Reflector(new THREE.PlaneGeometry(ROOM.W - 0.1, ROOM.D - 0.1), {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0xa2a2aa,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = 0;
  g.add(reflector);

  const floorMat = new THREE.MeshStandardMaterial({
    map: tex.floor.map,
    roughnessMap: tex.floor.roughnessMap,
    roughness: 1.0,
    metalness: 0.08,
    envMapIntensity: 0.7,
    transparent: true,
    opacity: 0.74,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.W, ROOM.D), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  g.add(floor);

  // ---------- 四面墙 ----------
  box(ROOM.W + 0.7, ROOM.H, 0.3, 0, 2.5, -7.15, wallMat);
  box(ROOM.W + 0.7, ROOM.H, 0.3, 0, 2.5, 7.15, wallMat);
  box(0.3, ROOM.H, ROOM.D + 0.7, -13.15, 2.5, 0, wallMat);
  box(0.3, ROOM.H, ROOM.D + 0.7, 13.15, 2.5, 0, wallMat);

  // 踢脚线
  box(ROOM.W, 0.14, 0.06, 0, 0.09, -6.96, darkMetalMat, { cast: false });
  box(ROOM.W, 0.14, 0.06, 0, 0.09, 6.96, darkMetalMat, { cast: false });
  box(0.06, 0.14, ROOM.D, -12.96, 0.09, 0, darkMetalMat, { cast: false });
  box(0.06, 0.14, ROOM.D, 12.96, 0.09, 0, darkMetalMat, { cast: false });

  // ---------- 隔断墙(制造 S 形动线) ----------
  function partition(x, zc) {
    box(0.36, 3.6, 6, x, 1.8, zc, wallMat);
    box(0.46, 0.09, 6.12, x, 3.65, zc, woodTrimMat);          // 木压顶
    box(0.44, 0.14, 6.04, x, 0.09, zc, darkMetalMat, { cast: false }); // 踢脚
    boxColliders.push(new THREE.Box3(
      new THREE.Vector3(x - 0.18, 0, zc - 3),
      new THREE.Vector3(x + 0.18, 3.6, zc + 3),
    ));
    // 底部烘焙感接触阴影
    const ao = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6.8), aoMat);
    ao.rotation.x = -Math.PI / 2;
    ao.position.set(x, 0.03, zc);
    ao.renderOrder = 2;
    g.add(ao);
  }
  partition(-4, -4); // 隔断 A:贴北墙,南侧留通道
  partition(4, 4);   // 隔断 B:贴南墙,北侧留通道
  box(0.46, 3.6, 0.12, -4, 1.8, -1.0, woodTrimMat); // A 端头木封边
  box(0.46, 3.6, 0.12, 4, 1.8, 1.0, woodTrimMat);   // B 端头木封边

  // ---------- 吊顶(中部留天窗洞口)----------
  // 洞口:x ∈ [-6.2, 6.2],z ∈ [-1.5, 1.5]
  box(7.2, 0.25, 14.7, -9.8, 5.13, 0, ceilMat);
  box(7.2, 0.25, 14.7, 9.8, 5.13, 0, ceilMat);
  box(12.4, 0.25, 5.85, 0, 5.13, -4.425, ceilMat);
  box(12.4, 0.25, 5.85, 0, 5.13, 4.425, ceilMat);

  // 天窗井壁(浅色,反弹天光)
  box(12.4, 0.6, 0.12, 0, 5.3, -1.44, wallMat);
  box(12.4, 0.6, 0.12, 0, 5.3, 1.44, wallMat);
  box(0.12, 0.6, 3.0, -6.14, 5.3, 0, wallMat);
  box(0.12, 0.6, 3.0, 6.14, 5.3, 0, wallMat);

  // 天穹面板(颜色随昼夜过渡,由 lighting.js 驱动)
  const skyPanelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const skyPanel = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 3.0), skyPanelMat);
  skyPanel.rotation.x = Math.PI / 2; // 面朝下
  skyPanel.position.set(0, 5.58, 0);
  g.add(skyPanel);

  // 天窗金属分格条(白昼在地面投下条状光影)
  const mullMat = new THREE.MeshStandardMaterial({ color: 0x2c2e33, metalness: 0.6, roughness: 0.5 });
  for (let i = 0; i <= 7; i++) {
    box(0.08, 0.07, 2.96, -5.6 + i * 1.6, 5.45, 0, mullMat, { receive: false });
  }
  box(12.4, 0.07, 0.09, 0, 5.45, 0, mullMat, { receive: false });

  // ---------- 檐口发光灯带(与 RectArea 补光对应的可见光源) ----------
  const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.75, 1.2) });
  const stripN = new THREE.Mesh(new THREE.BoxGeometry(19, 0.05, 0.05), stripMat);
  stripN.position.set(0, 4.62, -6.88);
  g.add(stripN);
  const stripS = stripN.clone();
  stripS.position.set(0, 4.62, 6.88);
  g.add(stripS);

  // ---------- 入口(西墙,叙事细节) ----------
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x1f1d1b, roughness: 0.55, metalness: 0.15 });
  box(0.1, 2.6, 1.6, -12.94, 1.3, 3.4, doorMat, { cast: false });        // 门扇
  box(0.14, 2.75, 0.14, -12.9, 1.375, 2.52, woodTrimMat, { cast: false }); // 门套
  box(0.14, 2.75, 0.14, -12.9, 1.375, 4.28, woodTrimMat, { cast: false });
  box(0.14, 0.14, 1.9, -12.9, 2.68, 3.4, woodTrimMat, { cast: false });

  // 入口主题墙字(西墙北段)
  const titleMat = new THREE.MeshStandardMaterial({ map: tex.wallTitle, transparent: true, roughness: 0.9 });
  const title = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), titleMat);
  title.position.set(-12.98, 2.55, -3.0);
  title.rotation.y = Math.PI / 2;
  g.add(title);

  // ---------- 观展长凳(木 + 金属,含 AO) ----------
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.09, 0.55),
    new THREE.MeshStandardMaterial({ map: tex.wood.map, roughness: 0.45 }));
  bench.position.set(0, 0.47, 4.35);
  bench.castShadow = true;
  bench.receiveShadow = true;
  g.add(bench);
  box(0.07, 0.44, 0.5, -0.98, 0.21, 4.35, darkMetalMat);
  box(0.07, 0.44, 0.5, 0.98, 0.21, 4.35, darkMetalMat);
  boxColliders.push(new THREE.Box3(
    new THREE.Vector3(-1.25, 0, 4.0),
    new THREE.Vector3(1.25, 0.7, 4.7),
  ));
  const benchAO = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.15), aoMat);
  benchAO.rotation.x = -Math.PI / 2;
  benchAO.position.set(0, 0.028, 4.35);
  benchAO.renderOrder = 2;
  g.add(benchAO);

  return {
    bounds: { minX: -13, maxX: 13, minZ: -7, maxZ: 7 },
    boxColliders,
    skyPanelMat,
    aoMat, // 供展品复用同款接触阴影
  };
}
