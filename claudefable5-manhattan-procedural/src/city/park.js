// 绿地系统:中央公园雕刻地形(fBm 丘陵 + 下凹水塘 + 蜿蜒步道顶点着色)、
// 曼哈顿片岩露头(噪声位移雕刻)、实例化树木(位移树冠 + 风摇)、炮台公园。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, islandHalfWidth, inPark } from './plan.js';
import { makeFbm2D, makeNoise3D } from '../core/noise.js';
import { applySnowPatch, applySwayPatch } from '../core/shaderpatch.js';

const PARK = CITY.park;
const PONDS = [
  { cx: -42, cz: -518, rx: 46, rz: 27 },
  { cx: 56, cz: -430, rx: 37, rz: 22 },
];
const PATH_X = (z) => Math.sin(((z + 560) / 168) * Math.PI * 2.6) * 96;

function inPond(x, z, k = 1) {
  return PONDS.some((p) => ((x - p.cx) / (p.rx * k)) ** 2 + ((z - p.cz) / (p.rz * k)) ** 2 < 1);
}

function sculptTerrain(plan, disposables) {
  const w = PARK.x1 - PARK.x0, d = PARK.z1 - PARK.z0;
  const geo = new THREE.PlaneGeometry(w, d, 116, 58);
  geo.rotateX(-Math.PI / 2);
  geo.translate((PARK.x0 + PARK.x1) / 2, 0, (PARK.z0 + PARK.z1) / 2);

  const fbm = makeFbm2D(plan.seed + 101, 4);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color(0x49702f), grassB = new THREE.Color(0x71923f);
  const pathC = new THREE.Color(0xb3a278), mudC = new THREE.Color(0x5c523c);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const dEdge = Math.min(x - PARK.x0, PARK.x1 - x, z - PARK.z0, PARK.z1 - z);
    const fade = THREE.MathUtils.smoothstep(dEdge, 0, 26);
    const n = fbm(x * 0.021, z * 0.021);
    let y = 0.5 + Math.pow(n, 1.25) * 8.2 * fade;

    // 水塘下凹
    let pond = 0;
    for (const p of PONDS) {
      const e = ((x - p.cx) / p.rx) ** 2 + ((z - p.cz) / p.rz) ** 2;
      pond = Math.max(pond, THREE.MathUtils.smoothstep(1 - e, 0, 0.45));
    }
    y = y * (1 - pond) - pond * 3.6;

    // 蜿蜒步道:压平 + 换色
    const pd = Math.abs(x - PATH_X(z));
    const onPath = THREE.MathUtils.smoothstep(6 - pd, 0, 4);
    y = THREE.MathUtils.lerp(y, Math.max(0.5, y * 0.6), onPath * (1 - pond));

    pos.setY(i, y);

    tmp.lerpColors(grassA, grassB, fbm(x * 0.09 + 7, z * 0.09));
    if (pond > 0.02) tmp.lerp(mudC, Math.min(1, pond * 1.2));
    if (onPath > 0.02 && pond < 0.3) tmp.lerp(pathC, onPath * 0.9);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  applySnowPatch(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  disposables.push(geo, mat);
  return mesh;
}

// 噪声位移雕刻岩石(曼哈顿片岩)
function makeRockGeo(seed, sx, sy, sz) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const n3 = makeNoise3D(seed);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const n = n3(v.x * 1.5 + 9, v.y * 1.5, v.z * 1.5) - 0.5;
    const n2 = n3(v.x * 4 + 30, v.y * 4, v.z * 4) - 0.5;
    v.multiplyScalar(1 + n * 0.7 + n2 * 0.22);
    p.setXYZ(i, v.x * sx, Math.abs(v.y) * sy * 0.9 + v.y * sy * 0.1, v.z * sz);
  }
  g.computeVertexNormals();
  return g;
}

export function buildPark(plan, rng, disposables) {
  const group = new THREE.Group();
  const treeRng = rng.fork('trees');
  const rockRng = rng.fork('rocks');

  group.add(sculptTerrain(plan, disposables));

  // 水塘水面
  const pondMat = new THREE.MeshStandardMaterial({ color: 0x1c4a44, roughness: 0.12, metalness: 0.5 });
  for (const p of PONDS) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), pondMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(p.rx * 0.96, p.rz * 0.96, 1);
    m.position.set(p.cx, -0.9, p.cz);
    group.add(m);
    disposables.push(m.geometry);
  }
  disposables.push(pondMat);

  // 岩石露头(合批)
  const rockPieces = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const rockSpots = [];
  for (let i = 0; i < 18; i++) {
    const x = rockRng.range(PARK.x0 + 18, PARK.x1 - 18);
    const z = rockRng.range(PARK.z0 + 18, PARK.z1 - 18);
    if (inPond(x, z, 1.3) || Math.abs(x - PATH_X(z)) < 8) continue;
    rockSpots.push({ x, z });
  }
  for (let i = 0; i < 7; i++) {
    const z = rockRng.range(CITY.batteryZ + 14, 590);
    const x = rockRng.range(-islandHalfWidth(z) + 16, islandHalfWidth(z) - 16);
    rockSpots.push({ x, z });
  }
  for (const s of rockSpots) {
    const g = makeRockGeo(rockRng.int(1, 1e6), rockRng.range(3, 9), rockRng.range(1.2, 3.2), rockRng.range(2.5, 7));
    e.set(0, rockRng.range(0, Math.PI * 2), 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(s.x, 0.4, s.z), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m4);
    rockPieces.push(g);
  }
  if (rockPieces.length) {
    const rockGeo = mergeGeometries(rockPieces);
    for (const g of rockPieces) g.dispose();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7f8286, roughness: 0.94 });
    applySnowPatch(rockMat);
    const rocks = new THREE.Mesh(rockGeo, rockMat);
    rocks.castShadow = rocks.receiveShadow = true;
    group.add(rocks);
    disposables.push(rockGeo, rockMat);
  }

  // ---------- 树木(树干 + 位移树冠实例化) ----------
  const spots = [];
  for (let i = 0; i < 300 && spots.length < 240; i++) {
    const x = treeRng.range(PARK.x0 + 8, PARK.x1 - 8);
    const z = treeRng.range(PARK.z0 + 10, PARK.z1 - 10);
    if (inPond(x, z, 1.25) || Math.abs(x - PATH_X(z)) < 7) continue;
    spots.push({ x, z, s: treeRng.range(0.8, 1.5) });
  }
  for (let i = 0; i < 30; i++) {
    const z = treeRng.range(CITY.batteryZ + 10, 596);
    const hw = islandHalfWidth(z) - 14;
    if (hw < 10) continue;
    spots.push({ x: treeRng.range(-hw, hw), z, s: treeRng.range(0.8, 1.3) });
  }
  // 行道树:沿大道两侧
  for (const ax of CITY.aveXs) {
    for (let z = -556; z < 440; z += 38) {
      const zz = z + treeRng.range(-6, 6);
      if (inPark(ax, zz, 14) || !islandHalfWidth(zz) || Math.abs(ax) > islandHalfWidth(zz) - 18) continue;
      const nearStreet = plan.streets.some((sz) => Math.abs(sz - zz) < 11);
      if (nearStreet) continue;
      if (Math.abs(zz - CITY.bridge.z) < 14 && ax > 90) continue;
      for (const side of [-1, 1]) {
        if (treeRng.chance(0.35)) continue;
        spots.push({ x: ax + side * (CITY.aveW / 2 + 4.5), z: zz, s: treeRng.range(0.55, 0.85) });
      }
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 3.4, 6);
  trunkGeo.translate(0, 1.7, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4834, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);

  const canopyGeo = new THREE.IcosahedronGeometry(2.1, 2);
  {
    const n3 = makeNoise3D(plan.seed + 202);
    const p = canopyGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      v.multiplyScalar(1 + (n3(v.x * 1.3, v.y * 1.3, v.z * 1.3) - 0.5) * 0.55);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    canopyGeo.computeVertexNormals();
  }
  const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  applySwayPatch(canopyMat);
  applySnowPatch(canopyMat);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, spots.length);

  const vC = new THREE.Color();
  spots.forEach((t, i) => {
    m4.compose(new THREE.Vector3(t.x, 0.4, t.z), q.identity(), new THREE.Vector3(t.s, t.s, t.s));
    trunks.setMatrixAt(i, m4);
    e.set(0, treeRng.range(0, Math.PI * 2), 0);
    q.setFromEuler(e);
    m4.compose(
      new THREE.Vector3(t.x, 0.4 + 4.1 * t.s, t.z), q,
      new THREE.Vector3(t.s, t.s * treeRng.range(0.8, 1.05), t.s),
    );
    canopies.setMatrixAt(i, m4);
    vC.setHSL(0.26 + treeRng.range(-0.05, 0.06), 0.5, 0.3 + treeRng.range(-0.07, 0.08));
    canopies.setColorAt(i, vC);
    trunks.setColorAt(i, vC.set(0xffffff));
  });
  trunks.castShadow = canopies.castShadow = true;
  group.add(trunks, canopies);
  disposables.push(trunkGeo, trunkMat, canopyGeo, canopyMat);

  return { group, treeCount: spots.length };
}
