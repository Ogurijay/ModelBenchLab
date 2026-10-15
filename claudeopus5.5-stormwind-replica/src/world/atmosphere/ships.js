// 港口帆船：程序化船体（按横剖面放样）+ 甲板 + 艉楼 + 双桅 + 横帆 + 旗。
// 3 艘船共享几何，每种材质一个 InstancedMesh（3 实例）→ 5 个批次；update 里随水面起伏、横摇。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const L = 30; // 船长（本地 Z：-L/2 艉 → +L/2 艏）
const B = 4.2; // 半宽
const DEPTH = 4.2; // 中部型深
const DECK_Y = 0.9; // 甲板面（本地，船体原点 = 水线）

function hullHalfBeam(t) {
  // t ∈ [-1, 1]，-1 艉、+1 艏
  return t > 0 ? B * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.62) : B * (1 - 0.3 * t * t);
}
function hullSheer(t) {
  return 1.6 + 0.9 * t * t + (t > 0 ? 0.6 * t * t * t : 0.4 * t * t);
}
function hullKeel(t) {
  return -DEPTH * (t > 0 ? 1 - 0.25 * t * t : 1 - 0.12 * t * t) + 1.0;
}

// 船体外壳：u 沿船长，v 沿横剖面（左舷边 → 龙骨 → 右舷边）
function hullGeo() {
  const NU = 28;
  const NV = 14;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= NU; i++) {
    const t = -1 + (2 * i) / NU;
    const z = (t * L) / 2;
    const hb = Math.max(0.02, hullHalfBeam(t));
    const top = hullSheer(t);
    const keel = hullKeel(t);
    for (let j = 0; j <= NV; j++) {
      const phi = -Math.PI / 2 + (Math.PI * j) / NV;
      const x = hb * Math.sin(phi);
      const c = Math.cos(phi);
      const y = top - (top - keel) * Math.pow(c, 0.55);
      pos.push(x, y, z);
      uv.push(z / 6, (y - keel) / (top - keel)); // v：0 龙骨 → 1 舷边
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      const b = a + NV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 艉板：封住 t = -1 的横剖面
  const sternPts = [];
  const t0 = -1;
  for (let j = 0; j <= NV; j++) {
    const phi = -Math.PI / 2 + (Math.PI * j) / NV;
    sternPts.push(new THREE.Vector2(hullHalfBeam(t0) * Math.sin(phi), hullSheer(t0) - (hullSheer(t0) - hullKeel(t0)) * Math.pow(Math.cos(phi), 0.55)));
  }
  const stern = new THREE.ShapeGeometry(new THREE.Shape(sternPts));
  stern.translate(0, 0, -L / 2);
  const su = stern.attributes.uv;
  const sp = stern.attributes.position;
  for (let i = 0; i < su.count; i++) su.setXY(i, sp.getX(i) / 6, (sp.getY(i) - hullKeel(t0)) / (hullSheer(t0) - hullKeel(t0)));
  return mergeGeometries([g.toNonIndexed(), stern.toNonIndexed()]);
}

// 甲板：按半宽轮廓挤出薄板
function deckGeo() {
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = -0.98 + (1.9 * i) / N;
    pts.push(new THREE.Vector2(hullHalfBeam(t) * 0.94, (t * L) / 2));
  }
  for (let i = N; i >= 0; i--) {
    const t = -0.98 + (1.9 * i) / N;
    pts.push(new THREE.Vector2(-hullHalfBeam(t) * 0.94, (t * L) / 2));
  }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.2, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape y → z
  g.translate(0, DECK_Y, 0);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3);
  return g;
}

// 横帆：鼓起的四边形（PlaneGeometry 分段后沿 +Z 鼓出）
function sailGeo(w, h, belly) {
  const g = new THREE.PlaneGeometry(w, h, 8, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    const y = p.getY(i) / (h / 2);
    p.setZ(i, belly * (1 - x * x) * (1 - 0.6 * y * y));
    p.setX(i, p.getX(i) * (1 - 0.08 * (1 - y))); // 下沿略收
  }
  g.computeVertexNormals();
  return g;
}

function hullTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  // v=0 龙骨（canvas 底） → v=1 舷边（canvas 顶）
  g.fillStyle = '#4a2e1c';
  g.fillRect(0, 0, 256, 512);
  for (let y = 0; y < 512; y += 22) {
    g.fillStyle = `hsl(25, 40%, ${18 + Math.random() * 8}%)`;
    g.fillRect(0, y, 256, 20);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y + 20, 256, 2);
  }
  // 舷边：蓝色漆带 + 金线
  g.fillStyle = '#22408a';
  g.fillRect(0, 0, 256, 90);
  g.fillStyle = '#d8a83a';
  g.fillRect(0, 90, 256, 10);
  g.fillRect(0, 6, 256, 6);
  // 炮窗 / 舷窗
  g.fillStyle = '#1a120c';
  for (let x = 20; x < 256; x += 64) g.fillRect(x, 30, 22, 26);
  // 水线以下：深色防污层
  g.fillStyle = 'rgba(30,25,20,0.6)';
  g.fillRect(0, 380, 256, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function canvasTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#efe6d2';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,100,70,0.35)';
  g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 32) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke();
  }
  // 帆中央的蓝底金狮（简化盾徽）
  g.fillStyle = '#2a4a9a';
  g.beginPath();
  g.moveTo(88, 70); g.lineTo(168, 70); g.lineTo(168, 140); g.quadraticCurveTo(128, 190, 88, 140); g.closePath();
  g.fill();
  g.fillStyle = '#e0b040';
  g.beginPath(); g.arc(128, 115, 18, 0, Math.PI * 2); g.fill();
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(90,70,40,0.25)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const strip = (g) => {
  const o = g.index ? g.toNonIndexed() : g;
  for (const n of Object.keys(o.attributes)) if (!['position', 'normal', 'uv'].includes(n)) o.deleteAttribute(n);
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
  return o;
};

export function buildShips(ctx, group) {
  const C = ctx.coords;
  const W = C.WATER_Y;
  const hullMat = new THREE.MeshStandardMaterial({ map: hullTexture(), roughness: 0.8, side: THREE.DoubleSide, name: 'atmo-hull' });
  const sailMat = new THREE.MeshStandardMaterial({ map: canvasTexture(), roughness: 0.95, side: THREE.DoubleSide, name: 'atmo-sail' });
  const deckMat = ctx.mat.planks;
  const woodMat = ctx.mat.timber;
  const flagMat = ctx.mat.banner;

  // ---- 木结构：甲板 + 艉楼 + 艏楼 ----
  const deck = [deckGeo()];
  const box = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) / 3, uv.getY(i) * h / 3);
    return g;
  };
  deck.push(box(B * 1.32, 2.0, 6.6, 0, DECK_Y, -L / 2 + 4.4)); // 艉楼（比艉部船宽略窄）
  deck.push(box(B * 1.42, 0.2, 7.0, 0, DECK_Y + 2.0, -L / 2 + 4.3)); // 艉楼顶
  deck.push(box(B * 1.0, 1.2, 4, 0, DECK_Y, L / 2 - 4.5)); // 艏楼
  deck.push(box(1.6, 0.9, 1.2, 0, DECK_Y, 2)); // 舱口
  const deckG = mergeGeometries(deck.map(strip));

  // ---- 桅杆 / 帆桁 / 艏斜桅 / 栏杆 ----
  const wood = [];
  const mast = (z, h, r) => wood.push(new THREE.CylinderGeometry(r * 0.7, r, h, 8).translate(0, DECK_Y + h / 2, z));
  mast(1, 21, 0.32);
  mast(-7.5, 16, 0.26);
  const yard = (z, y, w) => wood.push(new THREE.CylinderGeometry(0.12, 0.12, w, 6).rotateZ(Math.PI / 2).translate(0, y, z));
  yard(1.35, 9, 12); yard(1.35, 15.2, 9.5); yard(1.35, 20, 6);
  yard(-7.15, 8.5, 9); yard(-7.15, 13.5, 7);
  wood.push(new THREE.CylinderGeometry(0.12, 0.22, 9, 6).rotateX(Math.PI / 2 - 0.35).translate(0, 3.6, L / 2 + 2.2)); // 艏斜桅
  // 舷边栏杆（艉楼顶）
  for (const sx of [-1, 1]) wood.push(new THREE.BoxGeometry(0.12, 0.7, 6.8).translate(sx * B * 0.68, DECK_Y + 2.55, -L / 2 + 4.3));
  wood.push(new THREE.BoxGeometry(B * 1.36, 0.7, 0.12).translate(0, DECK_Y + 2.55, -L / 2 + 0.95));
  // 桅楼平台
  wood.push(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 10).translate(0, DECK_Y + 13.8, 1));
  const woodG = mergeGeometries(wood.map(strip));

  // ---- 帆 ----
  const sails = [];
  const sail = (w, h, z, yTop, belly) => sails.push(sailGeo(w, h, belly).translate(0, yTop - h / 2, z + 0.25));
  sail(11, 5.6, 1.35, 8.9, 1.2);
  sail(8.8, 4.6, 1.35, 15.1, 0.9);
  sail(5.4, 3.4, 1.35, 19.9, 0.6);
  sail(8.2, 4.8, -7.15, 8.4, 0.9);
  sail(6.4, 4.0, -7.15, 13.4, 0.7);
  // 艏三角帆
  const jib = new THREE.BufferGeometry();
  jib.setAttribute('position', new THREE.Float32BufferAttribute([0, 4.0, L / 2 + 5.2, 0, 14, 2.2, 0, 3.0, L / 2 - 3.5], 3));
  jib.setAttribute('uv', new THREE.Float32BufferAttribute([0.02, 0.02, 0.1, 0.2, 0.02, 0.1], 2)); // 取帆布图的素色角落，不带盾徽
  jib.computeVertexNormals();
  sails.push(jib);
  const sailG = mergeGeometries(sails.map(strip));

  // ---- 桅顶旗 ----
  const flag = new THREE.PlaneGeometry(3.2, 1.6, 6, 1).translate(1.6, 0, 0);
  {
    const p = flag.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 1.6) * 0.25);
    flag.computeVertexNormals();
  }
  flag.rotateY(Math.PI / 2).translate(0, DECK_Y + 21.2, 1); // 旗向艉飘
  const flagG = strip(flag);

  const hullG = hullGeo();

  // ---- 停泊位置：栈桥旁，船艏朝外海（-Z）----
  const piers = C.DISTRICTS.harbor.piers;
  const spots = [
    // 放大到 34–39 m 级（Critic R2：港口在俯瞰里太弱）
    { pier: piers[0], side: 1, z: -342, s: 1.3 },
    { pier: piers[2], side: -1, z: -338, s: 1.15 },
    { pier: piers[3], side: 1, z: -347, s: 1.22 },
  ];
  const ships = spots.map((sp, i) => ({
    x: sp.pier.x + sp.side * (sp.pier.w / 2 + 1.2 + B * sp.s),
    z: sp.z,
    s: sp.s,
    yaw: Math.PI + (i - 1) * 0.02, // 本地 +Z 艏 → 世界 -Z
    ph: i * 1.9,
  }));

  const parts = [
    [hullG, hullMat],
    [deckG, deckMat],
    [woodG, woodMat],
    [sailG, sailMat],
    [flagG, flagMat],
  ];
  const meshes = parts.map(([g, m], k) => {
    const im = new THREE.InstancedMesh(g, m, ships.length);
    im.name = `atmo-ship-${k}`;
    im.castShadow = k !== 4;
    im.receiveShadow = true;
    im.frustumCulled = false; // 实例每帧在动；三艘船在一块，干脆不剔除
    group.add(im);
    return im;
  });

  // 船体碰撞：甲板高度的近似盒，不让玩家从栈桥走进船里
  for (const s of ships) {
    ctx.collision.add({ x: s.x, z: s.z, hx: B * s.s, hz: (L / 2) * s.s, ry: s.yaw, y0: W - 3, y1: W + (DECK_Y + 1.6) * s.s, tag: 'ship' });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  function update(dt, t) {
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i];
      const heave = Math.sin(t * 0.7 + s.ph) * 0.12 + Math.sin(t * 1.3 + s.ph * 2) * 0.05;
      e.set(Math.sin(t * 0.55 + s.ph) * 0.012, s.yaw, Math.sin(t * 0.8 + s.ph * 1.3) * 0.025, 'YXZ');
      q.setFromEuler(e);
      m.compose(p.set(s.x, W + heave, s.z), q, sc.setScalar(s.s));
      for (const im of meshes) im.setMatrixAt(i, m);
    }
    for (const im of meshes) im.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { update, meshes, ships };
}
