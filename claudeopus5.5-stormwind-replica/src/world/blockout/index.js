// 灰盒 blockout（?blockout）：只有体块、主光和相机，用来在写重代码前和用户对齐构图与尺度。
// 和正式场景读同一份 coords.js。正式模块完成后保留作对照。
import * as THREE from 'three';
import { prismGeo, coneGeo, cylGeo } from '../../core/geom.js';

export function build(ctx) {
  const { scene, coords: C } = ctx;
  const B = ctx.builder({ tag: 'blockout' });
  const grey = new THREE.MeshStandardMaterial({ color: 0xbdb7ab, roughness: 1 });
  const light = new THREE.MeshStandardMaterial({ color: 0xe8e3d6, roughness: 1 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x3f62a8, roughness: 1 });
  const purple = new THREE.MeshStandardMaterial({ color: 0x7a4fb0, roughness: 1 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8a4a38, roughness: 1 });
  const green = new THREE.MeshStandardMaterial({ color: 0x6f9a52, roughness: 1 });
  const water = new THREE.MeshStandardMaterial({ color: 0x3f8fb5, roughness: 0.3 });
  const roofMat = { trade: blue, mage: purple, oldtown: blue, cathedral: blue, dwarven: red };

  scene.background = new THREE.Color(0xa9c8e8);
  scene.fog = new THREE.Fog(0xa9c8e8, 600, 2200);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b5a45, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d8, 3.2);
  sun.position.set(-300, 420, 260);
  sun.target.position.set(40, 0, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -450, right: 450, top: 450, bottom: -450, near: 10, far: 1400 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // 城外地面：挖掉城墙多边形与海面
  B.add(green, prismGeo(C.rect(-2000, -2000, 2000, 2000), 0, 2, [C.WALL_POLY, C.rect(...C.SEA_RECT)]));
  B.add(water, prismGeo(C.WATER_POLY, C.WATER_Y, 0.2));
  B.add(water, prismGeo(C.rect(...C.SEA_RECT), C.WATER_Y, 0.2));

  for (const [, d] of Object.entries(C.DISTRICTS)) {
    B.add(d.style === 'park' ? green : light, prismGeo(d.poly, d.top + 0.01, d.top - C.CANAL_BED_Y));
    if (d.plaza) {
      const [x0, z0, x1, z1] = d.plaza.rect;
      B.box(grey, (x0 + x1) / 2, d.top, (z0 + z1) / 2, x1 - x0, 0.05, z1 - z0, { collide: false });
    }
    for (const p of d.piers || []) B.box(grey, p.x, -0.3, (p.z0 + p.z1) / 2, p.w, 0.5, Math.abs(p.z1 - p.z0));
  }

  // 民居体块：层数 × 3.4 m + 坡顶
  for (const lot of C.LOTS) {
    const [x0, z0, x1, z1] = lot.r;
    const w = x1 - x0 - 1.2;
    const d = z1 - z0 - 1.2;
    const h = lot.floors * 3.4;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    B.box(lot.named ? light : grey, cx, 0, cz, w, h, d);
    const roof = new THREE.ConeGeometry(Math.hypot(w, d) / 2, 3.5, 4).rotateY(Math.PI / 4).scale(w / Math.hypot(w, d) * 1.41, 1, d / Math.hypot(w, d) * 1.41);
    roof.translate(cx, h + 1.75, cz);
    B.add(roofMat[lot.style] || blue, roof);
  }
  ctx.hollowCount = C.LOTS.length;

  // 城墙
  const P = C.WALL_POLY;
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[(i + 1) % P.length];
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(-(bz - az), bx - ax);
    const isGate = i === 9; // V2→V3
    if (isGate) {
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const ux = (bx - ax) / len;
      const uz = (bz - az) / len;
      const side = (len - C.GATE.width) / 2;
      for (const s of [-1, 1]) B.box(light, mx + ux * s * (C.GATE.width / 2 + side / 2), -2, mz + uz * s * (C.GATE.width / 2 + side / 2), side, C.WALL.height + 6, C.WALL.thickness, { ry });
      B.box(light, mx, C.GATE.height, mz, C.GATE.width, C.WALL.height + 4 - C.GATE.height, C.WALL.thickness, { ry });
    } else {
      B.box(light, (ax + bx) / 2, C.WATER_Y - 1, (az + bz) / 2, len, C.WALL.height - C.WATER_Y + 1, C.WALL.thickness, { ry });
    }
    B.add(light, cylGeo(7, C.WALL.height + 8, 12).translate(ax, C.WATER_Y, az));
    B.add(blue, coneGeo(8.5, 12, 12).translate(ax, C.WALL.height + 8 + C.WATER_Y, az));
  }

  // 英雄谷：盆地 + 主桥 + 雕像
  const valley = new THREE.Group();
  valley.position.set(C.VALLEY.origin[0], 0, C.VALLEY.origin[1]);
  valley.rotation.y = C.VALLEY.yaw;
  scene.add(valley);
  const V = ctx.builder({ parent: valley, tag: 'valley' });
  const VL = C.VALLEY;
  V.add(green, new THREE.BoxGeometry(VL.halfWidth * 2, 1, VL.length).translate(0, C.VALLEY_FLOOR_Y - 0.5, VL.length / 2));
  for (const s of [-1, 1]) V.add(light, new THREE.BoxGeometry(6, 28, VL.length).translate(s * (VL.halfWidth + 3), C.VALLEY_FLOOR_Y + 14, VL.length / 2));
  V.add(light, new THREE.BoxGeometry(VL.bridge.width, 1.2, VL.bridge.to - VL.bridge.from).translate(0, -0.6, (VL.bridge.from + VL.bridge.to) / 2));
  for (const lz of [20, 55, 90, 125, 160]) V.add(grey, new THREE.BoxGeometry(VL.bridge.width - 2, 14, 4).translate(0, -7.6, lz));
  for (const s of VL.statues) {
    V.add(grey, new THREE.BoxGeometry(5, 3, 5).translate(s.lx, 0, s.lz));
    V.add(light, cylGeo(1.6, 10, 8, 1.1).translate(s.lx, 1.5, s.lz));
    V.add(light, new THREE.SphereGeometry(1.2, 10, 8).translate(s.lx, 12.6, s.lz));
  }
  V.finish();
  ctx.collision.add({ x: (VL.bridge.from + VL.bridge.to) / 2, z: 0, hx: 0, hz: 0, ry: 0, y0: -1, y1: 0 }); // 占位，灰盒不做谷内碰撞

  // 地标体量
  const L = C.LANDMARKS;
  const [cx, cz] = L.cathedral.center;
  B.box(light, cx, 0, cz, L.cathedral.size[0], 26, L.cathedral.size[1]);
  B.box(light, cx, 0, cz - 12, 46, 22, 14);
  B.add(light, new THREE.BoxGeometry(12, 50, 12).translate(cx, 25, cz - 12));
  B.add(blue, coneGeo(9, 22, 4).rotateY(Math.PI / 4).translate(cx, 50, cz - 12));
  for (const s of [-1, 1]) {
    B.add(light, new THREE.BoxGeometry(9, 40, 9).translate(cx + s * 11, 20, cz + 30));
    B.add(blue, coneGeo(6.5, 14, 4).rotateY(Math.PI / 4).translate(cx + s * 11, 40, cz + 30));
  }
  const [kx, kz] = L.keep.center;
  B.box(light, kx, C.KEEP_Y, kz, L.keep.size[0], 24, L.keep.size[1]);
  for (const [tx, tz, h] of [[kx - 20, kz - 30, 46], [kx + 20, kz - 30, 40], [kx - 20, kz + 30, 34], [kx + 20, kz + 30, 34], [kx, kz - 34, 58]]) {
    B.add(light, cylGeo(6, h, 14).translate(tx, C.KEEP_Y, tz));
    B.add(blue, coneGeo(7.5, 14, 14).translate(tx, C.KEEP_Y + h, tz));
  }
  const [sx, sz] = L.sanctum.center;
  B.add(light, cylGeo(L.sanctum.radius, L.sanctum.height, 20, L.sanctum.radius * 0.8).translate(sx, 0, sz));
  B.add(purple, coneGeo(L.sanctum.radius * 1.05, 20, 20).translate(sx, L.sanctum.height, sz));
  for (const k of ['fountain', 'cathedralStatue']) {
    const [fx, fz] = L[k].center;
    B.add(grey, cylGeo(L[k].radius, 0.8, 24).translate(fx, 0, fz));
    B.add(light, cylGeo(1, 5, 10).translate(fx, 0, fz));
  }
  B.box(red, ...[L.greatForge.center[0], 0, L.greatForge.center[1]], L.greatForge.size[0], 9, L.greatForge.size[1]);
  B.box(grey, L.tram.center[0], 0, L.tram.center[1], L.tram.size[0], 10, L.tram.size[1]);
  B.add(light, new THREE.BoxGeometry(3, 20, 3).translate(L.lionsMemorial.center[0], 10, L.lionsMemorial.center[1]));

  // 桥
  for (const b of C.BRIDGES) {
    const len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
    const ry = Math.atan2(-(b.b[1] - b.a[1]), b.b[0] - b.a[0]);
    B.box(grey, (b.a[0] + b.b[0]) / 2, -1.2, (b.a[1] + b.b[1]) / 2, len + 2, 1.2, b.w, { ry });
  }

  // 公园树（体块）
  const rng = ctx.rng('blockout-trees');
  const [px0, pz0, px1, pz1] = [-258, -230, -168, -48];
  for (let i = 0; i < 60; i++) {
    const x = px0 + 6 + rng() * (px1 - px0 - 12);
    const z = pz0 + 6 + rng() * (pz1 - pz0 - 12);
    B.add(green, new THREE.SphereGeometry(3.5, 8, 6).translate(x, 5, z));
  }
  B.finish();
}
