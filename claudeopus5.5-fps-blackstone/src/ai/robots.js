// 敌方机器人模型（程序化）与骨骼式关节动画。模型正面朝 +z。

import * as THREE from 'three';

const geoCache = new Map();
function G(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const boxG = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylG = (r0, r1, h, s = 10) => G(`c${r0},${r1},${h},${s}`, () => new THREE.CylinderGeometry(r1, r0, h, s));
const sphG = (r, d = 1) => G(`s${r},${d}`, () => new THREE.IcosahedronGeometry(r, d));

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}
function grp(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** 每种机器人一套基础材质，实例克隆机身材质以实现受击闪白 */
export function createRobotMaterials(T) {
  const paint = T?.paint;
  const base = {
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.75, roughness: 0.42, map: T?.metalDark?.map, normalMap: T?.metalDark?.normalMap, envMapIntensity: 0.9 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.8, roughness: 0.5 }),
    sentinel: new THREE.MeshStandardMaterial({ color: 0x8c8f84, metalness: 0.55, roughness: 0.55, map: paint?.map, normalMap: paint?.normalMap, envMapIntensity: 0.8 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xd06a1c, metalness: 0.4, roughness: 0.55, map: paint?.map, envMapIntensity: 0.7 }),
    hound: new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.7, roughness: 0.45, map: paint?.map, normalMap: paint?.normalMap, envMapIntensity: 0.9 }),
    drone: new THREE.MeshStandardMaterial({ color: 0x3d4752, metalness: 0.7, roughness: 0.4, map: paint?.map, envMapIntensity: 1.0 }),
    heavy: new THREE.MeshStandardMaterial({ color: 0x3b3a36, metalness: 0.7, roughness: 0.5, map: paint?.map, normalMap: paint?.normalMap, envMapIntensity: 0.9 }),
    heavyAccent: new THREE.MeshStandardMaterial({ color: 0x9c2a1c, metalness: 0.4, roughness: 0.5, map: paint?.map, envMapIntensity: 0.8 }),
    rotor: new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.6, transparent: true, opacity: 0.45, depthWrite: false }),
    eyeRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.6, 0.25) }),
    eyeOrange: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 1.8, 0.3) }),
    eyeCyan: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3.2, 5) }),
    eyeMagenta: new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 0.6, 4) }),
    vent: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 1.2, 0.3) }),
  };
  return base;
}

function cloneMats(M, keys) {
  const out = { ...M, _cloned: [] };
  for (const k of keys) {
    out[k] = M[k].clone();
    out._cloned.push(out[k]);
  }
  return out;
}

// ───────────────────────── 哨兵（人形步兵） ─────────────────────────
export function buildSentinel(Mbase) {
  const M = cloneMats(Mbase, ['sentinel', 'accent', 'eyeOrange']);
  const root = new THREE.Group();
  const J = {};
  J.pelvis = grp(root, 0, 1.0, 0);
  mesh(J.pelvis, boxG(0.34, 0.16, 0.22), M.dark);
  J.torso = grp(J.pelvis, 0, 0.08, 0);
  mesh(J.torso, cylG(0.12, 0.14, 0.24, 10), M.joint, 0, 0.12, 0);
  mesh(J.torso, boxG(0.5, 0.36, 0.3), M.sentinel, 0, 0.4, 0);
  mesh(J.torso, boxG(0.42, 0.22, 0.06), M.accent, 0, 0.42, 0.16);
  mesh(J.torso, boxG(0.14, 0.12, 0.04), M.dark, 0.12, 0.3, 0.17);
  mesh(J.torso, boxG(0.36, 0.3, 0.16), M.dark, 0, 0.4, -0.22);
  mesh(J.torso, boxG(0.24, 0.04, 0.02), M.vent, 0, 0.36, -0.305);
  mesh(J.torso, boxG(0.24, 0.04, 0.02), M.vent, 0, 0.46, -0.305);
  J.head = grp(J.torso, 0, 0.6, 0.02);
  mesh(J.head, cylG(0.06, 0.06, 0.08, 8), M.joint, 0, -0.04, 0);
  mesh(J.head, boxG(0.24, 0.2, 0.26), M.sentinel, 0, 0.1, 0);
  mesh(J.head, boxG(0.26, 0.08, 0.12), M.dark, 0, 0.1, 0.1);
  J.visor = mesh(J.head, boxG(0.21, 0.05, 0.02), M.eyeOrange, 0, 0.11, 0.165);
  mesh(J.head, cylG(0.008, 0.008, 0.2, 5), M.joint, 0.09, 0.28, -0.06);
  for (const side of [-1, 1]) {
    const sh = grp(J.torso, side * 0.31, 0.5, 0);
    mesh(sh, boxG(0.16, 0.12, 0.2), M.accent, side * 0.02, 0.04, 0);
    mesh(sh, sphG(0.07), M.joint);
    mesh(sh, boxG(0.1, 0.28, 0.11), M.sentinel, 0, -0.16, 0);
    const el = grp(sh, 0, -0.31, 0);
    mesh(el, sphG(0.055), M.joint);
    mesh(el, boxG(0.09, 0.26, 0.1), M.dark, 0, -0.13, 0);
    const hand = grp(el, 0, -0.28, 0);
    mesh(hand, boxG(0.08, 0.08, 0.1), M.joint);
    J[side > 0 ? 'shL' : 'shR'] = sh;
    J[side > 0 ? 'elL' : 'elR'] = el;
    J[side > 0 ? 'handL' : 'handR'] = hand;
  }
  // 步枪（右手）
  const gun = grp(J.handR, 0, -0.02, 0.12);
  mesh(gun, boxG(0.07, 0.1, 0.5), M.dark, 0, 0, 0.08);
  mesh(gun, boxG(0.05, 0.14, 0.06), M.dark, 0, -0.08, -0.04);
  mesh(gun, cylG(0.02, 0.02, 0.22, 8), M.joint, 0, 0.01, 0.42, Math.PI / 2, 0, 0);
  mesh(gun, boxG(0.03, 0.03, 0.06), M.eyeOrange, 0, 0.01, 0.55);
  J.gun = gun;
  J.muzzle = grp(gun, 0, 0.01, 0.6);
  for (const side of [-1, 1]) {
    const hip = grp(J.pelvis, side * 0.12, -0.06, 0);
    mesh(hip, sphG(0.07), M.joint);
    mesh(hip, boxG(0.14, 0.4, 0.16), M.sentinel, 0, -0.21, 0);
    const knee = grp(hip, 0, -0.42, 0);
    mesh(knee, sphG(0.065), M.joint);
    mesh(knee, boxG(0.12, 0.42, 0.14), M.dark, 0, -0.21, 0);
    mesh(knee, boxG(0.13, 0.16, 0.05), M.accent, 0, -0.08, 0.08);
    const foot = grp(knee, 0, -0.44, 0.03);
    mesh(foot, boxG(0.15, 0.07, 0.28), M.joint, 0, 0, 0.03);
    J[side > 0 ? 'hipL' : 'hipR'] = hip;
    J[side > 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  return { root, J, M, flashMats: [M.sentinel, M.accent], eyeMat: M.eyeOrange };
}

// ───────────────────────── 猎犬（四足突击） ─────────────────────────
export function buildHound(Mbase) {
  const M = cloneMats(Mbase, ['hound', 'eyeRed']);
  const root = new THREE.Group();
  const J = {};
  J.body = grp(root, 0, 0.62, 0);
  mesh(J.body, boxG(0.4, 0.28, 0.86), M.hound);
  mesh(J.body, boxG(0.3, 0.08, 0.7), M.dark, 0, 0.17, -0.02);
  for (let i = 0; i < 4; i++) mesh(J.body, boxG(0.22, 0.06, 0.12), M.joint, 0, 0.22, -0.28 + i * 0.17, -0.3, 0, 0);
  mesh(J.body, boxG(0.3, 0.05, 0.02), M.vent, 0, 0.02, -0.44);
  J.head = grp(J.body, 0, 0.1, 0.48);
  mesh(J.head, boxG(0.26, 0.2, 0.32), M.hound, 0, 0.02, 0.1);
  mesh(J.head, boxG(0.22, 0.06, 0.12), M.dark, 0, 0.1, 0.06);
  J.jaw = grp(J.head, 0, -0.07, 0.0);
  mesh(J.jaw, boxG(0.2, 0.06, 0.3), M.dark, 0, -0.02, 0.14);
  for (let i = 0; i < 4; i++) mesh(J.jaw, boxG(0.02, 0.04, 0.02), M.joint, -0.07 + i * 0.047, 0.025, 0.27);
  mesh(J.head, boxG(0.05, 0.035, 0.02), M.eyeRed, 0.075, 0.05, 0.265);
  mesh(J.head, boxG(0.05, 0.035, 0.02), M.eyeRed, -0.075, 0.05, 0.265);
  J.tail = grp(J.body, 0, 0.08, -0.44);
  mesh(J.tail, cylG(0.03, 0.015, 0.4, 6), M.joint, 0, 0.12, -0.12, -0.9, 0, 0);
  J.legs = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const hip = grp(J.body, sx * 0.21, -0.06, sz * 0.32);
    mesh(hip, sphG(0.07), M.joint);
    mesh(hip, boxG(0.09, 0.3, 0.12), M.hound, 0, -0.15, 0);
    const knee = grp(hip, 0, -0.3, 0);
    mesh(knee, sphG(0.05), M.joint);
    mesh(knee, boxG(0.07, 0.28, 0.08), M.dark, 0, -0.14, 0);
    mesh(knee, boxG(0.09, 0.04, 0.14), M.joint, 0, -0.28, 0.03);
    J.legs.push({ hip, knee, front: sz > 0, side: sx });
  }
  return { root, J, M, flashMats: [M.hound], eyeMat: M.eyeRed };
}

// ───────────────────────── 黄蜂无人机 ─────────────────────────
export function buildDrone(Mbase) {
  const M = cloneMats(Mbase, ['drone', 'eyeMagenta']);
  const root = new THREE.Group();
  const J = {};
  J.body = grp(root, 0, 0, 0);
  const core = mesh(J.body, sphG(0.26, 1), M.drone);
  core.scale.set(1, 0.7, 1.15);
  mesh(J.body, boxG(0.5, 0.08, 0.18), M.dark, 0, 0.02, -0.05);
  const ring = mesh(J.body, G('droneRing', () => new THREE.TorusGeometry(0.17, 0.025, 6, 18)), M.eyeMagenta, 0, 0, 0.26);
  ring.castShadow = false;
  mesh(J.body, sphG(0.07, 0), M.eyeMagenta, 0, 0, 0.27);
  J.rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const ax = Math.cos(a) * 0.42, az = Math.sin(a) * 0.42;
    mesh(J.body, boxG(0.4, 0.04, 0.05), M.dark, ax / 2, 0.04, az / 2, 0, -a, 0);
    mesh(J.body, cylG(0.05, 0.05, 0.08, 8), M.joint, ax, 0.06, az);
    const rot = mesh(J.body, cylG(0.17, 0.17, 0.01, 16), M.rotor, ax, 0.11, az);
    rot.castShadow = false;
    J.rotors.push(rot);
  }
  J.gun = grp(J.body, 0, -0.17, 0.08);
  mesh(J.gun, boxG(0.08, 0.08, 0.2), M.dark);
  mesh(J.gun, cylG(0.025, 0.025, 0.16, 8), M.joint, 0, 0, 0.14, Math.PI / 2, 0, 0);
  J.muzzle = grp(J.gun, 0, 0, 0.24);
  const thr = mesh(J.body, G('droneThr', () => new THREE.CircleGeometry(0.09, 12)), M.eyeMagenta, 0, -0.19, -0.05, Math.PI / 2, 0, 0);
  thr.castShadow = false;
  return { root, J, M, flashMats: [M.drone], eyeMat: M.eyeMagenta };
}

// ───────────────────────── 重装（主宰者） ─────────────────────────
export function buildHeavy(Mbase) {
  const M = cloneMats(Mbase, ['heavy', 'heavyAccent', 'eyeRed']);
  const root = new THREE.Group();
  const J = {};
  J.pelvis = grp(root, 0, 1.32, 0);
  mesh(J.pelvis, boxG(0.6, 0.28, 0.42), M.dark);
  J.torso = grp(J.pelvis, 0, 0.12, 0);
  mesh(J.torso, cylG(0.22, 0.26, 0.3, 10), M.joint, 0, 0.14, 0);
  mesh(J.torso, boxG(1.05, 0.72, 0.68), M.heavy, 0, 0.62, 0);
  mesh(J.torso, boxG(0.8, 0.45, 0.1), M.heavyAccent, 0, 0.66, 0.36);
  mesh(J.torso, boxG(0.2, 0.2, 0.05), M.vent, 0, 0.55, 0.42);
  mesh(J.torso, boxG(0.7, 0.5, 0.3), M.dark, 0, 0.68, -0.44);
  for (let i = 0; i < 3; i++) mesh(J.torso, boxG(0.5, 0.05, 0.02), M.vent, 0, 0.55 + i * 0.12, -0.6);
  mesh(J.torso, boxG(1.2, 0.18, 0.5), M.heavyAccent, 0, 1.0, 0);
  J.head = grp(J.torso, 0, 1.12, 0.12);
  mesh(J.head, boxG(0.32, 0.26, 0.34), M.heavy, 0, 0.1, 0);
  J.visor = mesh(J.head, boxG(0.26, 0.06, 0.02), M.eyeRed, 0, 0.12, 0.175);
  mesh(J.head, boxG(0.36, 0.08, 0.3), M.dark, 0, 0.24, -0.02);
  // 右臂：转管机枪
  J.shR = grp(J.torso, -0.66, 0.85, 0);
  mesh(J.shR, sphG(0.16), M.joint);
  mesh(J.shR, boxG(0.3, 0.26, 0.4), M.heavyAccent, -0.04, 0.08, 0);
  mesh(J.shR, boxG(0.2, 0.42, 0.22), M.heavy, 0, -0.26, 0);
  J.elR = grp(J.shR, 0, -0.5, 0);
  mesh(J.elR, sphG(0.12), M.joint);
  J.minigun = grp(J.elR, 0, -0.1, 0.25);
  mesh(J.minigun, boxG(0.3, 0.3, 0.45), M.dark, 0, 0, -0.05);
  mesh(J.minigun, cylG(0.18, 0.18, 0.18, 12), M.heavy, 0, -0.18, -0.1, 0, 0, Math.PI / 2);
  J.barrels = grp(J.minigun, 0, 0, 0.2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    mesh(J.barrels, cylG(0.025, 0.025, 0.6, 6), M.joint, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.3, Math.PI / 2, 0, 0);
  }
  mesh(J.barrels, cylG(0.11, 0.11, 0.05, 12), M.dark, 0, 0, 0.5, Math.PI / 2, 0, 0);
  J.muzzle = grp(J.minigun, 0, 0, 0.82);
  // 左臂：火箭巢 + 拳
  J.shL = grp(J.torso, 0.66, 0.85, 0);
  mesh(J.shL, sphG(0.16), M.joint);
  mesh(J.shL, boxG(0.22, 0.42, 0.24), M.heavy, 0, -0.26, 0);
  J.elL = grp(J.shL, 0, -0.5, 0);
  mesh(J.elL, sphG(0.12), M.joint);
  mesh(J.elL, boxG(0.22, 0.42, 0.24), M.dark, 0, -0.22, 0.04);
  mesh(J.elL, boxG(0.26, 0.2, 0.26), M.heavyAccent, 0, -0.48, 0.06);
  J.pod = grp(J.torso, 0.45, 1.22, -0.1);
  mesh(J.pod, boxG(0.42, 0.34, 0.5), M.heavyAccent);
  for (let i = 0; i < 4; i++) mesh(J.pod, cylG(0.055, 0.055, 0.04, 8), M.joint, -0.1 + (i % 2) * 0.2, -0.07 + Math.floor(i / 2) * 0.14, 0.255, Math.PI / 2, 0, 0);
  J.podMuzzle = grp(J.pod, 0, 0, 0.3);
  for (const side of [-1, 1]) {
    const hip = grp(J.pelvis, side * 0.24, -0.1, 0);
    mesh(hip, sphG(0.13), M.joint);
    mesh(hip, boxG(0.28, 0.6, 0.3), M.heavy, 0, -0.3, 0);
    const knee = grp(hip, 0, -0.6, 0);
    mesh(knee, sphG(0.12), M.joint);
    mesh(knee, boxG(0.24, 0.56, 0.28), M.dark, 0, -0.28, -0.02);
    mesh(knee, boxG(0.26, 0.3, 0.06), M.heavyAccent, 0, -0.15, 0.14);
    const foot = grp(knee, 0, -0.6, 0.04);
    mesh(foot, boxG(0.32, 0.12, 0.5), M.joint, 0, 0, 0.06);
    J[side > 0 ? 'hipL' : 'hipR'] = hip;
    J[side > 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  root.scale.setScalar(1.0);
  return { root, J, M, flashMats: [M.heavy, M.heavyAccent], eyeMat: M.eyeRed };
}

export const BUILDERS = { sentinel: buildSentinel, hound: buildHound, drone: buildDrone, heavy: buildHeavy };

/** 释放实例克隆的材质 */
export function disposeInstanceMats(model) {
  for (const m of model.M._cloned) m.dispose();
}
