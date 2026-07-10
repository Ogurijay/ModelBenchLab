// 布鲁克林大桥:哥特双尖拱石塔、真实悬链线主缆(牛顿迭代求解)、
// 吊索 + 斜拉索网、夜间"项链灯"。跨东河连接场景东缘的对岸小陆地。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY } from './plan.js';
import { solveCatenaryA } from '../core/catenary.js';
import { applySnowPatch } from '../core/shaderpatch.js';

const X_START = 172, X_END = 806;      // 引道起点 → 对岸
const T1 = 340, T2 = 560;              // 双塔
const DECK_Y = 15, TOWER_TOP = 78;
const SAG = 58;                        // 主缆垂度(低点贴近桥面,布鲁克林桥特征)

function deckY(x) {
  if (x < 250) return THREE.MathUtils.lerp(2.2, DECK_Y, (x - X_START) / (250 - X_START));
  if (x > 730) return THREE.MathUtils.lerp(DECK_Y, 7, (x - 730) / (X_END - 730));
  return DECK_Y;
}

function cableY(x) {
  const half = (T2 - T1) / 2;
  if (x >= T1 && x <= T2) {
    const a = solveCatenaryA(half, SAG);
    const u = x - (T1 + T2) / 2;
    return TOWER_TOP - (SAG - a * (Math.cosh(u / a) - 1));
  }
  // 边跨:两端高差线性 + 抛物线小垂度
  const [xa, ya, xb, yb, sag] = x < T1
    ? [X_START + 6, deckY(X_START + 6) + 2, T1, TOWER_TOP, 9]
    : [T2, TOWER_TOP, X_END - 40, deckY(X_END - 40) + 2, 9];
  const t = THREE.MathUtils.clamp((x - xa) / (xb - xa), 0, 1);
  return THREE.MathUtils.lerp(ya, yb, t) - sag * 4 * t * (1 - t);
}

function makeTower(x, mats, group, disposables) {
  const z0 = CITY.bridge.z;
  const shape = new THREE.Shape();
  shape.moveTo(z0 - 16, -3);
  shape.lineTo(z0 - 16, TOWER_TOP - 12);
  shape.lineTo(z0 - 10, TOWER_TOP + 2);
  shape.lineTo(z0 + 10, TOWER_TOP + 2);
  shape.lineTo(z0 + 16, TOWER_TOP - 12);
  shape.lineTo(z0 + 16, -3);
  shape.closePath();
  for (const side of [-1, 1]) {
    const cz = z0 + side * 6.6;
    const hole = new THREE.Path();
    hole.moveTo(cz - 4.2, 6);
    hole.lineTo(cz - 4.2, 30);
    hole.quadraticCurveTo(cz - 4.2, 42, cz, 47);
    hole.quadraticCurveTo(cz + 4.2, 42, cz + 4.2, 30);
    hole.lineTo(cz + 4.2, 6);
    hole.closePath();
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false });
  const tower = new THREE.Mesh(geo, mats.granite);
  // 几何 (sx,sy,sz) → 世界 (-sz, sy, sx):shape x 即世界 z
  tower.rotation.y = -Math.PI / 2;
  tower.position.x = x + 4.5;
  tower.castShadow = tower.receiveShadow = true;
  group.add(tower);
  disposables.push(geo);
}

export function buildBridge(plan, rng, disposables) {
  const group = new THREE.Group();
  const z0 = CITY.bridge.z;

  const granite = new THREE.MeshStandardMaterial({ color: 0x8a7f70, roughness: 0.92 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.55, metalness: 0.7 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.9 });
  applySnowPatch(granite);
  applySnowPatch(deckMat);
  disposables.push(granite, steel, deckMat);

  makeTower(T1, { granite }, group, disposables);
  makeTower(T2, { granite }, group, disposables);

  // 桥面(分段折线跟随坡度)
  const deckPieces = [];
  const SEG = 24;
  for (let i = 0; i < SEG; i++) {
    const xa = X_START + (i / SEG) * (X_END - X_START);
    const xb = X_START + ((i + 1) / SEG) * (X_END - X_START);
    const ya = deckY(xa), yb = deckY(xb);
    const len = Math.hypot(xb - xa, yb - ya);
    const g = new THREE.BoxGeometry(len, 1.5, 15);
    const m = new THREE.Matrix4()
      .makeRotationZ(Math.atan2(yb - ya, xb - xa))
      .setPosition((xa + xb) / 2, (ya + yb) / 2, z0);
    g.applyMatrix4(m);
    deckPieces.push(g);
  }
  const deckGeo = mergeGeometries(deckPieces);
  for (const g of deckPieces) g.dispose();
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.castShadow = deck.receiveShadow = true;
  group.add(deck);
  disposables.push(deckGeo);

  // 主缆(两根,悬链线采样)
  const cableGeos = [];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let x = X_START + 6; x <= X_END - 30; x += 8) {
      pts.push(new THREE.Vector3(x, cableY(x), z0 + side * 6.6));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    cableGeos.push(new THREE.TubeGeometry(curve, 90, 0.6, 6));
  }
  const cableGeo = mergeGeometries(cableGeos);
  for (const g of cableGeos) g.dispose();
  const cables = new THREE.Mesh(cableGeo, steel);
  cables.castShadow = true;
  group.add(cables);
  disposables.push(cableGeo, steel);

  // 吊索 + 斜拉索(单位圆柱实例化,任意两点对齐)
  const segs = [];
  for (const side of [-1, 1]) {
    const zc = z0 + side * 6.6;
    for (let x = 258; x <= 726; x += 10) {
      if (Math.abs(x - T1) < 7 || Math.abs(x - T2) < 7) continue;
      segs.push([new THREE.Vector3(x, cableY(x), zc), new THREE.Vector3(x, deckY(x) + 0.8, zc)]);
    }
    for (const tx of [T1, T2]) {
      for (const dir of [-1, 1]) {
        for (let k = 1; k <= 5; k++) {
          const x2 = tx + dir * (16 + k * 15);
          if (x2 < X_START + 10 || x2 > X_END - 20) continue;
          segs.push([new THREE.Vector3(tx, TOWER_TOP - 2, zc), new THREE.Vector3(x2, deckY(x2) + 0.8, zc)]);
        }
      }
    }
  }
  const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 5);
  const rods = new THREE.InstancedMesh(rodGeo, steel, segs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const mid = new THREE.Vector3(), dir = new THREE.Vector3();
  segs.forEach(([a, b], i) => {
    mid.addVectors(a, b).multiplyScalar(0.5);
    dir.subVectors(b, a);
    const len = dir.length();
    q.setFromUnitVectors(up, dir.normalize());
    m4.compose(mid, q, new THREE.Vector3(0.09, len, 0.09));
    rods.setMatrixAt(i, m4);
  });
  group.add(rods);
  disposables.push(rodGeo);

  // 项链灯
  const lampPts = [];
  for (const side of [-1, 1]) {
    for (let x = X_START + 10; x <= X_END - 34; x += 9) {
      lampPts.push(new THREE.Vector3(x, cableY(x) + 0.9, z0 + side * 6.6));
    }
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.15, toneMapped: false });
  const lampGeo = new THREE.SphereGeometry(0.55, 6, 5);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampPts.length);
  lampPts.forEach((p, i) => {
    m4.identity().setPosition(p);
    lamps.setMatrixAt(i, m4);
  });
  group.add(lamps);
  disposables.push(lampGeo, lampMat);

  // 对岸(布鲁克林一角):平台 + 低层剪影楼
  const pad = new THREE.Mesh(new THREE.BoxGeometry(190, 8, 220), granite);
  pad.position.set(X_END + 60, 2, z0 + 16);
  group.add(pad);
  disposables.push(pad.geometry);
  const bkRng = rng.fork('bk');
  const bkGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bkMat = new THREE.MeshStandardMaterial({ color: 0x6a625b, roughness: 0.9 });
  applySnowPatch(bkMat);
  const bk = new THREE.InstancedMesh(bkGeo, bkMat, 26);
  for (let i = 0; i < 26; i++) {
    m4.compose(
      new THREE.Vector3(X_END + 20 + bkRng.range(0, 150), 6, z0 - 80 + bkRng.range(0, 190)),
      q.identity(),
      new THREE.Vector3(bkRng.range(14, 26), bkRng.range(10, 42), bkRng.range(12, 24)),
    );
    bk.setMatrixAt(i, m4);
  }
  bk.castShadow = true;
  group.add(bk);
  disposables.push(bkGeo, bkMat);

  return {
    group,
    update(night) {
      lampMat.opacity = 0.12 + night * 0.88;
    },
  };
}
