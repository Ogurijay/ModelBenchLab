// 自由女神像:车削长袍 + 周期噪声衣褶雕刻(顶点级位移,法线重算),
// 十一角星要塞基座、冠冕七道光芒、火炬(夜间自发光)与泛光灯。
import * as THREE from 'three';
import { makeFbm2D } from '../core/noise.js';
import { applySnowPatch } from '../core/shaderpatch.js';

function sculptRobe(seed) {
  // 车削轮廓:裙摆 → 腰 → 肩 → 颈
  const profile = [
    [0.05, 0], [7.0, 0.2], [6.6, 1.6], [5.8, 4.5], [5.0, 8],
    [4.4, 11], [3.9, 14], [3.6, 16.5], [3.5, 18.5], [2.7, 19.8], [1.25, 21],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 72);

  // 衣褶:θ 方向用 (cosθ, sinθ) 周期采样避免接缝,幅度随高度衰减(肩部平滑、裙摆深褶)
  const fbm = makeFbm2D(seed, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const r = Math.hypot(v.x, v.z);
    if (r < 0.02) continue;
    const ct = v.x / r, st = v.z / r;
    const broad = fbm(ct * 2.3 + 5, st * 2.3 + v.y * 0.28) - 0.5;      // 大褶
    const fine = fbm(ct * 6.5 + 20, st * 6.5 + v.y * 0.55) - 0.5;      // 细褶
    const amp = 0.62 * Math.pow(Math.max(0, 1 - v.y / 21), 1.35);
    const nr = r + (broad * 1.6 + fine * 0.7) * amp;
    pos.setX(i, ct * nr);
    pos.setZ(i, st * nr);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildStatue(plan, rng, disposables) {
  const group = new THREE.Group();
  const { x, z } = plan.landmarks.liberty;
  const D = (...xs) => disposables.push(...xs);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xb3a68e, roughness: 0.9 });
  const patina = new THREE.MeshStandardMaterial({ color: 0x5f9d8b, roughness: 0.58, metalness: 0.14 });
  applySnowPatch(stoneMat);
  applySnowPatch(patina);
  D(stoneMat, patina);

  // 小岛
  const island = new THREE.Mesh(new THREE.CylinderGeometry(30, 36, 5, 26), stoneMat);
  island.position.y = -1.2;
  group.add(island);
  D(island.geometry);

  // 十一角星要塞(Fort Wood)
  const star = new THREE.Shape();
  const N = 11, R = 21, r0 = 14.5;
  for (let i = 0; i < N * 2; i++) {
    const a = (i / (N * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? R : r0;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    i === 0 ? star.moveTo(px, py) : star.lineTo(px, py);
  }
  star.closePath();
  const fortGeo = new THREE.ExtrudeGeometry(star, { depth: 3.4, bevelEnabled: false });
  fortGeo.rotateX(-Math.PI / 2);
  const fort = new THREE.Mesh(fortGeo, stoneMat);
  fort.position.y = 1.3;
  fort.castShadow = fort.receiveShadow = true;
  group.add(fort);
  D(fortGeo);

  // 基座(方形收分)
  const ped1 = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 10.8, 14, 4, 1), stoneMat);
  ped1.rotation.y = Math.PI / 4;
  ped1.position.y = 4.7 + 7;
  const ped2 = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 1.8, 4, 1), stoneMat);
  ped2.rotation.y = Math.PI / 4;
  ped2.position.y = 4.7 + 14 + 0.9;
  const ped3 = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 6.6, 4.6, 4, 1), stoneMat);
  ped3.rotation.y = Math.PI / 4;
  ped3.position.y = 4.7 + 15.8 + 2.3;
  for (const p of [ped1, ped2, ped3]) { p.castShadow = true; group.add(p); D(p.geometry); }

  // ---------- 雕像本体 ----------
  const statue = new THREE.Group();
  const baseY = 4.7 + 15.8 + 4.6;

  const robeGeo = sculptRobe(plan.seed + 404);
  const robe = new THREE.Mesh(robeGeo, patina);
  robe.castShadow = true;
  statue.add(robe);
  D(robeGeo);

  const head = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14), patina);
  head.scale.set(1, 1.22, 1.05);
  head.position.y = 22.4;
  statue.add(head);
  D(head.geometry);

  // 冠冕:环带 + 7 道光芒(面向 -z 的竖直扇面)
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.24, 8, 20), patina);
  band.position.y = 23.2;
  band.rotation.x = Math.PI / 2 - 0.35;
  statue.add(band);
  D(band.geometry);
  const spikeGeo = new THREE.ConeGeometry(0.22, 2.7, 6);
  D(spikeGeo);
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  for (let i = 0; i < 7; i++) {
    const a = (-0.75 + (i / 6) * 1.5); // 弧度扇面 -43°..43°
    dir.set(Math.sin(a), Math.cos(a) * 0.85, -0.5).normalize();
    const spike = new THREE.Mesh(spikeGeo, patina);
    spike.position.copy(dir).multiplyScalar(2.5).add(new THREE.Vector3(0, 23.4, 0));
    spike.quaternion.setFromUnitVectors(up, dir);
    statue.add(spike);
  }

  // 右臂高举火炬
  const armGeo = new THREE.CylinderGeometry(0.62, 0.92, 9.4, 10);
  const arm = new THREE.Mesh(armGeo, patina);
  arm.position.set(3.1, 24.6, 0.1);
  arm.rotation.z = -0.42;
  arm.castShadow = true;
  statue.add(arm);
  D(armGeo);
  const torchHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 2.6, 8), patina);
  torchHandle.position.set(5.05, 29.6, 0.05);
  statue.add(torchHandle);
  D(torchHandle.geometry);
  const balcony = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.18, 8, 16), patina);
  balcony.rotation.x = Math.PI / 2;
  balcony.position.set(5.05, 30.8, 0.05);
  statue.add(balcony);
  D(balcony.geometry);

  const flameGeo = new THREE.IcosahedronGeometry(0.95, 2);
  {
    const fbm = makeFbm2D(plan.seed + 505, 3);
    const p = flameGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      v.multiplyScalar(1 + (fbm(v.x * 2 + 3, v.z * 2 + v.y) - 0.5) * 0.5);
      p.setXYZ(i, v.x * 0.8, v.y * 1.5 + 0.3, v.z * 0.8);
    }
    flameGeo.computeVertexNormals();
  }
  const flameMat = new THREE.MeshStandardMaterial({ color: 0x8a5a20, emissive: 0xffb63e, emissiveIntensity: 0.5 });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(5.05, 31.9, 0.05);
  statue.add(flame);
  D(flameGeo, flameMat);

  // 左臂抱法典
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 5.4, 8), patina);
  arm2.position.set(-2.5, 17.8, -0.9);
  arm2.rotation.z = 0.9;
  arm2.rotation.x = -0.25;
  statue.add(arm2);
  D(arm2.geometry);
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.3, 0.5), patina);
  tablet.position.set(-4.1, 18.9, -0.9);
  tablet.rotation.z = 0.16;
  statue.add(tablet);
  D(tablet.geometry);

  statue.position.y = baseY;
  group.add(statue);

  // 夜间泛光
  const floodMat = new THREE.MeshBasicMaterial({
    color: 0xbfe0d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const floodGeo = new THREE.ConeGeometry(3.2, 24, 12, 1, true);
  D(floodMat, floodGeo);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const f = new THREE.Mesh(floodGeo, floodMat);
    f.position.set(Math.cos(a) * 13, baseY + 10, Math.sin(a) * 13);
    f.rotation.z = Math.cos(a) * 0.32;
    f.rotation.x = -Math.sin(a) * 0.32;
    group.add(f);
  }

  group.position.set(x, 0, z);

  let t = 0;
  return {
    group,
    update(dt, night) {
      t += dt;
      flameMat.emissiveIntensity = 0.45 + night * (2.1 + Math.sin(t * 7.3) * 0.35 + Math.sin(t * 13.7) * 0.2);
      floodMat.opacity = night * 0.22;
    },
  };
}
