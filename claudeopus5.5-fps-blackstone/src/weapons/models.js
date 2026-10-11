// 程序化枪械与持枪手臂模型（第一人称视角模型 + 世界拾取模型共用）。
// 约定：枪口朝 -z，原点在握把顶部（右手位置）。sight 为瞄准点（ADS 时对准屏幕中心）。

import * as THREE from 'three';

export function createGunMaterials(T) {
  const metal = new THREE.MeshStandardMaterial({
    color: 0x484d55, metalness: 0.55, roughness: 0.42,
    normalMap: T?.metalDark?.normalMap || null, envMapIntensity: 1.2,
  });
  const metalLight = metal.clone();
  metalLight.color.set(0x7d848e);
  const polymer = new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.2, roughness: 0.62, envMapIntensity: 0.9 });
  const tan = new THREE.MeshStandardMaterial({ color: 0x8b7a5b, metalness: 0.05, roughness: 0.78, envMapIntensity: 0.6 });
  const olive = new THREE.MeshStandardMaterial({ color: 0x4f5a3d, metalness: 0.05, roughness: 0.8, envMapIntensity: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a38, metalness: 1, roughness: 0.04, transparent: true, opacity: 0.45, envMapIntensity: 2 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x0c1a2a, metalness: 1, roughness: 0.02, envMapIntensity: 2.5 });
  const reticle = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.3), transparent: true, depthWrite: false });
  const tritium = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3, 0.8) });
  const glove = new THREE.MeshStandardMaterial({ color: 0x3e3934, metalness: 0, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x5b6446, metalness: 0, roughness: 0.92 });
  const watch = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 2.8) });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.95, roughness: 0.3 });
  const shellRed = new THREE.MeshStandardMaterial({ color: 0x8a1c14, metalness: 0.1, roughness: 0.6 });
  return { metal, metalLight, polymer, tan, olive, glass, lens, reticle, tritium, glove, sleeve, watch, brass, shellRed };
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylZ = (r, len, seg = 16, r2 = r) => {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
};

function add(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/** 从 a 到 b 的圆柱（手臂） */
function limb(parent, a, b, r0, r1, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 10);
  g.translate(0, len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(m);
  return m;
}

/**
 * 握持的手：局部 Y 为握把轴向，side=+1 右手（手背在 +x 侧），-1 左手。
 */
function hand(parent, M, pos, rot, side = 1) {
  const h = new THREE.Group();
  h.position.copy(pos);
  h.rotation.set(rot.x, rot.y, rot.z);
  // 手背 / 掌
  add(h, box(0.026, 0.095, 0.088), M.glove, side * 0.033, -0.004, 0.006);
  add(h, box(0.02, 0.06, 0.03), M.sleeve, side * 0.036, -0.004, 0.06);
  // 四指环绕握把前缘
  for (let i = 0; i < 4; i++) {
    const y = 0.032 - i * 0.022;
    add(h, box(0.074, 0.019, 0.024), M.glove, 0, y, -0.036);
    add(h, box(0.018, 0.019, 0.034), M.glove, -side * 0.031, y, -0.02);
  }
  // 拇指
  add(h, box(0.02, 0.022, 0.062), M.glove, -side * 0.026, 0.05, -0.004, 0.25, 0, 0);
  parent.add(h);
  return h;
}

function arms(g, M, rightHand, leftHand, opts = {}) {
  const right = new THREE.Group();
  const rr = opts.rightRot || { x: 0.32, y: 0, z: 0 };
  hand(right, M, rightHand, rr, 1);
  const wristR = rightHand.clone().add(new THREE.Vector3(0.03, -0.035, 0.075));
  const rElbow = rightHand.clone().add(new THREE.Vector3(0.14, -0.2, 0.3));
  limb(right, wristR, rElbow, 0.036, 0.048, M.sleeve);
  limb(right, rElbow, rElbow.clone().add(new THREE.Vector3(0.1, -0.1, 0.32)), 0.055, 0.068, M.sleeve);
  add(right, box(0.07, 0.03, 0.03), M.polymer, rElbow.x - 0.04, rElbow.y + 0.06, rElbow.z - 0.12, 0.6, 0, 0);
  g.add(right);

  const left = new THREE.Group();
  left.position.copy(leftHand);
  hand(left, M, new THREE.Vector3(), opts.leftRot || { x: 0.1, y: 0, z: 0 }, -1);
  const lw = opts.leftWrist || new THREE.Vector3(-0.035, -0.04, 0.06);
  const lElbow = opts.leftElbow || new THREE.Vector3(-0.17, -0.2, 0.28);
  limb(left, lw, lElbow, 0.036, 0.048, M.sleeve);
  limb(left, lElbow, lElbow.clone().add(new THREE.Vector3(-0.08, -0.12, 0.32)), 0.055, 0.068, M.sleeve);
  // 战术手表（发光表盘）
  const wpos = lw.clone().lerp(lElbow, 0.18);
  add(left, box(0.05, 0.045, 0.04), M.polymer, wpos.x, wpos.y, wpos.z);
  add(left, box(0.004, 0.03, 0.026), M.watch, wpos.x - 0.026, wpos.y, wpos.z);
  g.add(left);
  return { right, left };
}

// ───────────────────────── 各枪 ─────────────────────────
function rifle(M, withArms) {
  const g = new THREE.Group();
  const parts = {};
  add(g, box(0.052, 0.062, 0.3), M.metal, 0, 0.036, -0.06);
  add(g, box(0.048, 0.044, 0.2), M.metal, 0, -0.012, -0.035);
  add(g, box(0.06, 0.064, 0.29), M.tan, 0, 0.033, -0.35);
  for (let i = 0; i < 5; i++) {
    add(g, box(0.004, 0.016, 0.032), M.polymer, 0.031, 0.034, -0.25 - i * 0.048);
    add(g, box(0.004, 0.016, 0.032), M.polymer, -0.031, 0.034, -0.25 - i * 0.048);
  }
  add(g, box(0.026, 0.012, 0.46), M.metal, 0, 0.073, -0.18);
  for (let i = 0; i < 16; i++) add(g, box(0.027, 0.003, 0.005), M.metal, 0, 0.0805, 0.02 - i * 0.026);
  add(g, cylZ(0.0095, 0.2), M.metal, 0, 0.034, -0.59);
  add(g, cylZ(0.016, 0.065, 12), M.metal, 0, 0.034, -0.715);
  for (let i = 0; i < 3; i++) add(g, box(0.034, 0.004, 0.008), M.polymer, 0, 0.034, -0.695 - i * 0.016);
  // 枪托
  add(g, box(0.045, 0.072, 0.21), M.tan, 0, 0.012, 0.2);
  add(g, box(0.048, 0.085, 0.022), M.polymer, 0, 0.006, 0.31);
  add(g, cylZ(0.014, 0.12), M.metal, 0, 0.036, 0.1);
  // 握把与扳机护圈
  add(g, box(0.034, 0.105, 0.048), M.polymer, 0, -0.07, 0.03, 0.32, 0, 0);
  add(g, box(0.008, 0.008, 0.07), M.metal, 0, -0.045, -0.035);
  add(g, box(0.006, 0.03, 0.006), M.metal, 0, -0.028, -0.02, 0.4, 0, 0);
  // 弹匣
  const mag = new THREE.Group();
  mag.position.set(0, -0.03, -0.12);
  add(mag, box(0.03, 0.12, 0.066), M.metal, 0, -0.05, 0.004, -0.12, 0, 0);
  add(mag, box(0.03, 0.08, 0.064), M.metal, 0, -0.14, 0.022, -0.3, 0, 0);
  add(mag, box(0.034, 0.012, 0.07), M.polymer, 0, -0.18, 0.037, -0.3, 0, 0);
  add(mag, box(0.012, 0.01, 0.03), M.brass, 0, 0.012, -0.004);
  g.add(mag);
  parts.mag = mag;
  // 拉机柄
  const ch = add(g, box(0.034, 0.012, 0.03), M.metalLight, 0, 0.066, 0.075);
  parts.charge = ch;
  // 垂直握把
  add(g, box(0.03, 0.075, 0.034), M.polymer, 0, -0.018, -0.39);
  // 全息瞄具
  add(g, box(0.038, 0.02, 0.075), M.metal, 0, 0.09, -0.12);
  add(g, box(0.004, 0.05, 0.065), M.metal, 0.023, 0.123, -0.12);
  add(g, box(0.004, 0.05, 0.065), M.metal, -0.023, 0.123, -0.12);
  add(g, box(0.05, 0.005, 0.065), M.metal, 0, 0.149, -0.12);
  add(g, box(0.05, 0.012, 0.012), M.metal, 0, 0.1, -0.084);
  const glass = add(g, new THREE.PlaneGeometry(0.042, 0.044), M.glass, 0, 0.125, -0.125);
  glass.renderOrder = 2;
  const ret = new THREE.Group();
  ret.position.set(0, 0.125, -0.126);
  add(ret, new THREE.RingGeometry(0.0042, 0.0052, 24), M.reticle, 0, 0, 0);
  add(ret, new THREE.CircleGeometry(0.0007, 8), M.reticle, 0, 0, 0);
  ret.children.forEach((c) => (c.renderOrder = 3));
  g.add(ret);
  parts.reticle = ret;
  parts.sight = new THREE.Vector3(0, 0.125, -0.12);
  parts.muzzle = new THREE.Vector3(0, 0.034, -0.76);
  parts.eject = new THREE.Vector3(0.03, 0.04, -0.05);
  parts.hip = new THREE.Vector3(0.26, -0.22, -0.62);
  parts.hipRot = new THREE.Vector3(0.05, 0.09, 0.03);
  parts.adsZ = -0.2;
  if (withArms) {
    const a = arms(g, M, new THREE.Vector3(0.0, -0.062, 0.03), new THREE.Vector3(0.0, -0.03, -0.39), { leftRot: { x: 0.12, y: 0, z: 0 } });
    parts.leftArm = a.left;
    parts.leftBase = a.left.position.clone();
  }
  return { group: g, parts };
}

function pistol(M, withArms) {
  const g = new THREE.Group();
  const parts = {};
  const slide = new THREE.Group();
  add(slide, box(0.032, 0.034, 0.19), M.metal, 0, 0.032, -0.07);
  for (let i = 0; i < 6; i++) add(slide, box(0.034, 0.024, 0.003), M.polymer, 0, 0.03, 0.0 - i * 0.008);
  add(slide, box(0.004, 0.008, 0.004), M.metal, 0.006, 0.053, 0.012);
  add(slide, box(0.004, 0.008, 0.004), M.metal, -0.006, 0.053, 0.012);
  add(slide, box(0.002, 0.003, 0.002), M.tritium, 0.006, 0.056, 0.0145);
  add(slide, box(0.002, 0.003, 0.002), M.tritium, -0.006, 0.056, 0.0145);
  add(slide, box(0.004, 0.009, 0.004), M.metal, 0, 0.053, -0.155);
  add(slide, box(0.0022, 0.003, 0.002), M.tritium, 0, 0.056, -0.157);
  g.add(slide);
  parts.slide = slide;
  add(g, box(0.03, 0.022, 0.17), M.polymer, 0, 0.004, -0.065);
  add(g, cylZ(0.006, 0.02), M.metal, 0, 0.032, -0.168);
  add(g, box(0.03, 0.105, 0.048), M.polymer, 0, -0.052, 0.018, 0.26, 0, 0);
  add(g, box(0.006, 0.006, 0.05), M.polymer, 0, -0.022, -0.03);
  const mag = new THREE.Group();
  mag.position.set(0, -0.06, 0.02);
  add(mag, box(0.026, 0.1, 0.04), M.metal, 0, -0.008, 0.002, 0.26, 0, 0);
  add(mag, box(0.031, 0.012, 0.05), M.polymer, 0, -0.06, 0.017, 0.26, 0, 0);
  g.add(mag);
  parts.mag = mag;
  parts.sight = new THREE.Vector3(0, 0.0555, -0.07);
  parts.muzzle = new THREE.Vector3(0, 0.032, -0.18);
  parts.eject = new THREE.Vector3(0.018, 0.04, -0.04);
  parts.hip = new THREE.Vector3(0.15, -0.14, -0.38);
  parts.hipRot = new THREE.Vector3(0.06, 0.12, 0.04);
  parts.adsZ = -0.27;
  if (withArms) {
    const a = arms(g, M, new THREE.Vector3(0.0, -0.05, 0.022), new THREE.Vector3(-0.012, -0.07, 0.03), { rightRot: { x: 0.26, y: 0, z: 0 }, leftRot: { x: 0.3, y: 0.25, z: 0.15 }, leftElbow: new THREE.Vector3(-0.2, -0.22, 0.24) });
    parts.leftArm = a.left;
    parts.leftBase = a.left.position.clone();
  }
  return { group: g, parts };
}

function shotgun(M, withArms) {
  const g = new THREE.Group();
  const parts = {};
  add(g, box(0.05, 0.068, 0.25), M.metal, 0, 0.022, -0.08);
  add(g, cylZ(0.0125, 0.52), M.metal, 0, 0.045, -0.46);
  add(g, cylZ(0.011, 0.42), M.metal, 0, 0.014, -0.41);
  add(g, cylZ(0.013, 0.02, 10), M.metal, 0, 0.014, -0.62);
  add(g, new THREE.SphereGeometry(0.004, 8, 6), M.brass, 0, 0.061, -0.71);
  add(g, box(0.008, 0.006, 0.18), M.metal, 0, 0.058, -0.6);
  const pump = new THREE.Group();
  pump.position.set(0, 0.014, -0.42);
  add(pump, cylZ(0.022, 0.17, 14), M.polymer, 0, 0, 0);
  for (let i = 0; i < 6; i++) add(pump, cylZ(0.0235, 0.008, 14), M.polymer, 0, 0, -0.07 + i * 0.028);
  g.add(pump);
  parts.pump = pump;
  add(g, box(0.042, 0.08, 0.24), M.polymer, 0, -0.005, 0.17, -0.08, 0, 0);
  add(g, box(0.046, 0.09, 0.02), M.polymer, 0, -0.018, 0.29, -0.08, 0, 0);
  add(g, box(0.034, 0.1, 0.046), M.polymer, 0, -0.065, 0.03, 0.3, 0, 0);
  add(g, box(0.008, 0.008, 0.06), M.metal, 0, -0.025, -0.03);
  // 侧挂弹
  for (let i = 0; i < 4; i++) {
    add(g, cylZ(0.009, 0.05, 10), M.shellRed, -0.03, 0.04 - (i % 2) * 0.022, -0.11 - Math.floor(i / 2) * 0.06, 0, 0, Math.PI / 2).rotation.set(0, 0, 0);
  }
  add(g, box(0.004, 0.05, 0.13), M.polymer, -0.027, 0.03, -0.14);
  parts.sight = new THREE.Vector3(0, 0.0645, -0.4);
  parts.muzzle = new THREE.Vector3(0, 0.045, -0.73);
  parts.eject = new THREE.Vector3(0.028, 0.032, -0.06);
  parts.hip = new THREE.Vector3(0.26, -0.22, -0.6);
  parts.hipRot = new THREE.Vector3(0.05, 0.09, 0.03);
  parts.adsZ = -0.22;
  if (withArms) {
    const a = arms(g, M, new THREE.Vector3(0.0, -0.064, 0.033), new THREE.Vector3(0.0, 0.014, -0.43), { leftRot: { x: -1.5, y: 0, z: 0.35 }, leftWrist: new THREE.Vector3(-0.03, -0.04, 0.06), leftElbow: new THREE.Vector3(-0.16, -0.22, 0.26) });
    parts.leftArm = a.left;
    parts.leftBase = a.left.position.clone();
  }
  return { group: g, parts };
}

function sniper(M, withArms) {
  const g = new THREE.Group();
  const parts = {};
  add(g, box(0.05, 0.06, 0.3), M.metal, 0, 0.026, -0.06);
  add(g, box(0.056, 0.058, 0.36), M.olive, 0, 0.022, -0.39);
  for (let i = 0; i < 4; i++) add(g, box(0.058, 0.01, 0.03), M.polymer, 0, 0.022, -0.27 - i * 0.07);
  add(g, cylZ(0.013, 0.62), M.metal, 0, 0.028, -0.6);
  add(g, box(0.042, 0.03, 0.07), M.metal, 0, 0.028, -0.93);
  for (let i = 0; i < 3; i++) add(g, box(0.046, 0.006, 0.01), M.polymer, 0, 0.028, -0.91 - i * 0.02);
  add(g, box(0.048, 0.092, 0.3), M.olive, 0, 0.004, 0.22);
  add(g, box(0.05, 0.03, 0.14), M.polymer, 0, 0.065, 0.2);
  add(g, box(0.052, 0.1, 0.025), M.polymer, 0, -0.002, 0.37);
  add(g, box(0.034, 0.105, 0.048), M.polymer, 0, -0.07, 0.03, 0.3, 0, 0);
  add(g, box(0.008, 0.008, 0.06), M.metal, 0, -0.03, -0.03);
  // 瞄准镜
  add(g, cylZ(0.018, 0.3, 20), M.metal, 0, 0.105, -0.08);
  add(g, cylZ(0.019, 0.07, 20, 0.027), M.metal, 0, 0.105, -0.262);
  add(g, cylZ(0.027, 0.03, 20), M.metal, 0, 0.105, -0.31);
  add(g, cylZ(0.022, 0.06, 20, 0.018), M.metal, 0, 0.105, 0.09);
  add(g, new THREE.CircleGeometry(0.024, 20), M.lens, 0, 0.105, -0.326);
  const ocular = add(g, new THREE.CircleGeometry(0.02, 20), M.lens, 0, 0.105, 0.121);
  ocular.rotation.y = Math.PI;
  add(g, new THREE.CylinderGeometry(0.009, 0.009, 0.03, 12), M.metal, 0, 0.13, -0.07);
  add(g, new THREE.CylinderGeometry(0.009, 0.009, 0.03, 12), M.metal, 0.03, 0.105, -0.07, 0, 0, Math.PI / 2);
  add(g, box(0.02, 0.03, 0.02), M.metal, 0, 0.075, -0.17);
  add(g, box(0.02, 0.03, 0.02), M.metal, 0, 0.075, 0.02);
  // 枪栓
  const bolt = new THREE.Group();
  bolt.position.set(0.026, 0.04, 0.04);
  add(bolt, new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), M.metalLight, 0.02, 0, 0, 0, 0, Math.PI / 2 - 0.3);
  add(bolt, new THREE.SphereGeometry(0.01, 10, 8), M.polymer, 0.045, -0.012, 0);
  g.add(bolt);
  parts.bolt = bolt;
  const mag = new THREE.Group();
  mag.position.set(0, -0.01, -0.09);
  add(mag, box(0.034, 0.07, 0.08), M.metal, 0, -0.03, 0);
  g.add(mag);
  parts.mag = mag;
  parts.sight = new THREE.Vector3(0, 0.105, 0.12);
  parts.muzzle = new THREE.Vector3(0, 0.028, -0.97);
  parts.eject = new THREE.Vector3(0.03, 0.04, -0.02);
  parts.hip = new THREE.Vector3(0.27, -0.23, -0.66);
  parts.hipRot = new THREE.Vector3(0.05, 0.08, 0.03);
  parts.adsZ = -0.06;
  if (withArms) {
    const a = arms(g, M, new THREE.Vector3(0.0, -0.066, 0.033), new THREE.Vector3(0.0, -0.005, -0.36), { leftRot: { x: -1.5, y: 0, z: 0.4 }, leftWrist: new THREE.Vector3(-0.03, -0.045, 0.06), leftElbow: new THREE.Vector3(-0.17, -0.22, 0.27) });
    parts.leftArm = a.left;
    parts.leftBase = a.left.position.clone();
  }
  return { group: g, parts };
}

const BUILDERS = { rifle, pistol, shotgun, sniper };

export function buildGun(id, M, withArms = true) {
  const r = BUILDERS[id](M, withArms);
  r.group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return r;
}

/** 枪口火焰（十字交叉面片 + 正面星芒），加法混合 */
export function buildMuzzleFlash() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,230,1)');
  gr.addColorStop(0.2, 'rgba(255,200,110,0.95)');
  gr.addColorStop(0.5, 'rgba(255,120,30,0.4)');
  gr.addColorStop(1, 'rgba(255,80,10,0)');
  ctx.fillStyle = gr;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 22 : 64;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const side = document.createElement('canvas');
  side.width = 128;
  side.height = 64;
  const sx = side.getContext('2d');
  const g2 = sx.createLinearGradient(0, 0, 128, 0);
  g2.addColorStop(0, 'rgba(255,240,200,1)');
  g2.addColorStop(0.4, 'rgba(255,160,60,0.7)');
  g2.addColorStop(1, 'rgba(255,80,10,0)');
  sx.fillStyle = g2;
  sx.beginPath();
  sx.moveTo(0, 32);
  sx.quadraticCurveTo(50, 6, 128, 26);
  sx.lineTo(128, 38);
  sx.quadraticCurveTo(50, 58, 0, 32);
  sx.fill();
  const stex = new THREE.CanvasTexture(side);
  stex.colorSpace = THREE.SRGBColorSpace;
  const mFront = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(3, 2.2, 1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mSide = new THREE.MeshBasicMaterial({ map: stex, color: new THREE.Color(3, 2.0, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), mFront);
  g.add(front);
  for (let i = 0; i < 2; i++) {
    // 两片侧焰都包含枪管轴（z），分别位于 YZ 与 XZ 平面
    const geo = new THREE.PlaneGeometry(0.22, 0.09);
    geo.rotateY(Math.PI / 2);
    if (i) geo.rotateZ(Math.PI / 2);
    geo.translate(0, 0, -0.1);
    g.add(new THREE.Mesh(geo, mSide));
  }
  g.traverse((o) => (o.renderOrder = 10));
  g.visible = false;
  return g;
}
