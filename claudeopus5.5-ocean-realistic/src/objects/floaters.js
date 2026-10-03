// 浮体：小渔船、航标浮标、木箱、油桶、救生圈。全部程序化建模，
// 每种都给出体素采样点、质量与重心，让浮力自然决定吃水与姿态。

import * as THREE from 'three';
import { FloatingBody, voxelPoints, WATER_DENSITY } from '../physics/buoyancy.js';

export const FLOATER_TYPES = {
  crate: '木箱',
  barrel: '油桶',
  ring: '救生圈',
  buoy: '航标浮标',
  boat: '小渔船'
};

// ---------- 材质与纹理 ----------

function plankTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a5a33';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) {
    const y = i * 64;
    const shade = 120 + ((i * 37) % 40);
    g.fillStyle = `rgb(${shade + 20}, ${shade - 30}, ${shade - 75})`;
    g.fillRect(0, y + 3, 256, 58);
    g.strokeStyle = 'rgba(40,22,10,0.35)';
    for (let k = 0; k < 14; k++) {
      g.beginPath();
      const yy = y + 6 + k * 4 + Math.sin(k * 3.1) * 2;
      g.moveTo(0, yy);
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 1.5);
      g.stroke();
    }
  }
  g.fillStyle = '#2b1a0e';
  for (let i = 0; i <= 4; i++) g.fillRect(0, i * 64 - 2, 256, 4);
  // 四角铁皮
  g.fillStyle = '#4b4f52';
  for (const [x, y] of [[0, 0], [228, 0], [0, 228], [228, 228]]) g.fillRect(x, y, 28, 28);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function stripeTexture(base, stripe, bands) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 4, 256);
  g.fillStyle = stripe;
  for (const [a, b] of bands) g.fillRect(0, a * 256, 4, (b - a) * 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    crate: new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.85 }),
    barrel: new THREE.MeshStandardMaterial({
      map: stripeTexture('#b8361f', '#1d1d1f', [[0.18, 0.24], [0.76, 0.82]]),
      roughness: 0.45,
      metalness: 0.35
    }),
    barrelCap: new THREE.MeshStandardMaterial({ color: 0x8d2a19, roughness: 0.5, metalness: 0.4 }),
    ring: new THREE.MeshStandardMaterial({
      map: (() => {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 4;
        const g = c.getContext('2d');
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? '#f2f0ea' : '#e2471d';
          g.fillRect(i * 32, 0, 32, 4);
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })(),
      roughness: 0.6
    }),
    buoyRed: new THREE.MeshStandardMaterial({ color: 0xc0261b, roughness: 0.55, metalness: 0.1 }),
    buoyGreen: new THREE.MeshStandardMaterial({ color: 0x14824a, roughness: 0.55, metalness: 0.1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x6f767c, roughness: 0.4, metalness: 0.8 }),
    hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 }),
    deck: new THREE.MeshStandardMaterial({ color: 0xa47448, roughness: 0.8 }),
    cabin: new THREE.MeshStandardMaterial({ color: 0xeef0ec, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.08, metalness: 0.6 }),
    rope: new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.9 })
  };
  return MATS;
}

function lamp(color) {
  const m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), m);
  mesh.userData.lampColor = new THREE.Color(color);
  return mesh;
}

function castAll(group) {
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = false;
  });
  return group;
}

// ---------- 各类浮体 ----------

function makeCrate() {
  const size = new THREE.Vector3(1.1, 1.1, 1.1);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mats().crate);
  group.add(mesh);
  const volume = size.x * size.y * size.z;
  return new FloatingBody({
    object: group,
    kind: 'crate',
    mass: volume * WATER_DENSITY * 0.48,
    size,
    volume,
    points: voxelPoints(size, [3, 3, 3]),
    cellHeight: size.y / 3,
    radius: 0.75
  });
}

function makeBarrel() {
  const r = 0.32;
  const h = 0.92;
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true), mats().barrel);
  const capGeo = new THREE.CircleGeometry(r, 28);
  const top = new THREE.Mesh(capGeo, mats().barrelCap);
  top.rotation.x = -Math.PI / 2;
  top.position.y = h / 2;
  const bot = top.clone();
  bot.rotation.x = Math.PI / 2;
  bot.position.y = -h / 2;
  const inner = new THREE.Group();
  inner.add(body, top, bot);
  inner.rotation.z = Math.PI / 2; // 横躺漂浮
  group.add(inner);
  const size = new THREE.Vector3(h, 2 * r, 2 * r);
  const pts = voxelPoints(size, [4, 3, 3], (x, y, z) => y * y + z * z <= r * r * 1.15);
  const volume = Math.PI * r * r * h;
  return new FloatingBody({
    object: group,
    kind: 'barrel',
    mass: volume * WATER_DENSITY * 0.3,
    size,
    volume,
    points: pts,
    cellHeight: (2 * r) / 3,
    radius: 0.5,
    linearDrag: 0.9
  });
}

function makeRing() {
  const R = 0.38;
  const tube = 0.11;
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 16, 40), mats().ring);
  mesh.rotation.x = Math.PI / 2;
  group.add(mesh);
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
  }
  const volume = 2 * Math.PI * R * Math.PI * tube * tube;
  return new FloatingBody({
    object: group,
    kind: 'ring',
    mass: 2.5,
    size: new THREE.Vector3(2 * (R + tube), 2 * tube, 2 * (R + tube)),
    volume,
    points: pts,
    cellHeight: 2 * tube,
    radius: 0.5,
    linearDrag: 0.8,
    angularDamping: 1.2
  });
}

function makeBuoy(colorKey = 'red') {
  const group = new THREE.Group();
  const m = mats();
  const paint = colorKey === 'green' ? m.buoyGreen : m.buoyRed;
  // 重心在原点；浮筒在其上方，形成自扶正力矩
  const lift = 0.35;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.7, 0.9, 32), paint);
  collar.position.y = lift;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 1.0, 16), m.steel);
  skirt.position.y = lift - 0.9;
  const frame = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 8), m.steel);
    leg.position.set(Math.cos(a) * 0.32, lift + 1.4, Math.sin(a) * 0.32);
    leg.rotation.set(Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14);
    frame.add(leg);
  }
  const top = colorKey === 'green'
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 24), paint)
    : new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.9, 24), paint);
  top.position.y = lift + 2.25;
  const light = lamp(colorKey === 'green' ? 0x40ff8a : 0xff3b2e);
  light.position.y = lift + 2.85;
  light.userData.blink = true;
  group.add(collar, skirt, frame, top, light);
  const size = new THREE.Vector3(1.6, 0.9, 1.6);
  const pts = voxelPoints(size, [3, 3, 3], (x, y, z) => x * x + z * z <= 0.75 * 0.75).map((p) => p.setY(p.y + lift));
  const volume = Math.PI * 0.75 * 0.75 * 0.9;
  return new FloatingBody({
    object: castAll(group),
    kind: 'buoy',
    mass: volume * WATER_DENSITY * 0.42,
    size: new THREE.Vector3(1.6, 3.2, 1.6),
    volume,
    points: pts,
    cellHeight: 0.3,
    radius: 1.0,
    angularDamping: 0.9
  });
}

// 小渔船：参数化船壳（尖船首、方艉、舷弧），驾驶舱与桅杆
const BOAT = { L: 5.6, B: 2.1, D: 0.95 };
function halfBeam(s) {
  if (s < 0.65) return (BOAT.B / 2) * (0.82 + 0.18 * Math.sin((s / 0.65) * Math.PI * 0.5));
  const t = (s - 0.65) / 0.35;
  return (BOAT.B / 2) * Math.pow(Math.cos(t * Math.PI * 0.5), 0.75);
}
function deckY(s) {
  return 0.32 + 0.28 * Math.pow(s, 3);
}
function keelDepth(s) {
  return BOAT.D * (0.7 + 0.3 * Math.sin(Math.min(1, s * 1.1) * Math.PI * 0.85));
}

function hullGeometry() {
  const stations = 40;
  const ring = 24;
  const pos = [];
  const col = [];
  const idx = [];
  const cRed = new THREE.Color(0x8e1f1a);
  const cWhite = new THREE.Color(0xf2f1ec);
  const cBlue = new THREE.Color(0x1d4f8c);
  for (let i = 0; i <= stations; i++) {
    const s = i / stations;
    const x = (s - 0.5) * BOAT.L;
    const hb = halfBeam(s);
    const dy = deckY(s);
    const kd = keelDepth(s);
    for (let j = 0; j <= ring; j++) {
      const phi = (j / ring - 0.5) * Math.PI;
      const z = Math.sin(phi) * hb;
      const y = dy - kd * Math.pow(Math.cos(phi), 1.4);
      pos.push(x, y, z);
      const c = y < -0.12 ? cRed : y > dy - 0.14 ? cBlue : cWhite;
      col.push(c.r, c.g, c.b);
    }
  }
  const row = ring + 1;
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // 方艉封板
  const center = pos.length / 3;
  pos.push(-BOAT.L / 2, deckY(0) - keelDepth(0) * 0.5, 0);
  col.push(cWhite.r, cWhite.g, cWhite.b);
  for (let j = 0; j < ring; j++) idx.push(center, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function deckGeometry() {
  const stations = 40;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= stations; i++) {
    const s = i / stations;
    const x = (s - 0.5) * BOAT.L;
    const hb = halfBeam(s) * 0.97;
    const y = deckY(s) - 0.12;
    pos.push(x, y, -hb, x, y, hb);
  }
  for (let i = 0; i < stations; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeBoat() {
  const m = mats();
  const group = new THREE.Group();
  const com = 0.28; // 重心低于船壳原点
  const hull = new THREE.Group();
  hull.position.y = com;
  const hullMesh = new THREE.Mesh(hullGeometry(), m.hull);
  hullMesh.material.side = THREE.DoubleSide;
  const deck = new THREE.Mesh(deckGeometry(), m.deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 1.35), m.cabin);
  cabin.position.set(-0.55, deckY(0.4) + 0.33, 0);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.5), m.cabin);
  roof.position.set(-0.55, deckY(0.4) + 0.84, 0);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 1.1), m.glass);
  win.position.set(0.21, deckY(0.4) + 0.5, 0);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 10), m.steel);
  mast.position.set(-0.75, deckY(0.4) + 2.0, 0);
  const lampTop = lamp(0xfff2c0);
  lampTop.position.set(-0.75, deckY(0.4) + 3.25, 0);
  const portL = lamp(0xff2a1a);
  portL.scale.setScalar(0.5);
  portL.position.set(-0.05, deckY(0.4) + 0.55, -0.7);
  const stbL = lamp(0x2aff6a);
  stbL.scale.setScalar(0.5);
  stbL.position.set(-0.05, deckY(0.4) + 0.55, 0.7);
  // 舷边护舷绳
  const railPts = [];
  for (let i = 0; i <= 30; i++) {
    const s = 0.05 + (i / 30) * 0.9;
    railPts.push(new THREE.Vector3((s - 0.5) * BOAT.L, deckY(s) + 0.02, halfBeam(s)));
  }
  const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 60, 0.035, 6), m.rope);
  const rail2 = rail.clone();
  rail2.scale.z = -1;
  hull.add(hullMesh, deck, cabin, roof, win, mast, lampTop, portL, stbL, rail, rail2);
  group.add(hull);

  const size = new THREE.Vector3(BOAT.L, BOAT.D + 0.6, BOAT.B);
  const res = [14, 5, 6];
  const inside = (x, y, z) => {
    const s = x / BOAT.L + 0.5;
    const hb = halfBeam(s);
    if (Math.abs(z) > hb) return false;
    const phi = Math.asin(Math.min(1, Math.abs(z) / hb));
    const bottom = deckY(s) - keelDepth(s) * Math.pow(Math.cos(phi), 1.4);
    return y >= bottom && y <= deckY(s);
  };
  const box = new THREE.Vector3(BOAT.L, 1.6, BOAT.B);
  const all = voxelPoints(box, res, (x, y, z) => inside(x, y - 0.1, z)).map((p) => p.setY(p.y - 0.1 + com));
  const cellVol = (box.x / res[0]) * (box.y / res[1]) * (box.z / res[2]);
  const volume = all.length * cellVol;
  return new FloatingBody({
    object: castAll(group),
    kind: 'boat',
    mass: volume * WATER_DENSITY * 0.36,
    size,
    volume,
    points: all,
    cellHeight: box.y / res[1],
    radius: 2.6,
    linearDrag: 1.0,
    angularDamping: 0.8
  });
}

export function createFloater(type, opts = {}) {
  switch (type) {
    case 'boat':
      return makeBoat();
    case 'buoy':
      return makeBuoy(opts.color);
    case 'barrel':
      return makeBarrel();
    case 'ring':
      return makeRing();
    default:
      return makeCrate();
  }
}

// 灯光闪烁（航标灯 2 s 周期闪光）
export function animateLamps(root, time) {
  root.traverse((o) => {
    if (!o.userData.blink) return;
    const on = (time % 2.4) < 0.45;
    o.material.color.copy(o.userData.lampColor).multiplyScalar(on ? 8 : 0.15);
  });
}
