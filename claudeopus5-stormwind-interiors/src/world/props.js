// 城市家具与配景:桥梁、喷泉、英雄雕像、路灯、市集摊位、水井、货车、树木、
// 港口(栈桥 / 帆船 / 吊车 / 灯塔)、花园(凉亭 / 绿篱)。
import * as THREE from 'three';
import {
  box, boxOn, cyl, cone, sphere, lathe, column, spireRoof, archRing, gableRoof,
  balustrade, aabbOn, merge,
} from '../core/geom.js';
import { Collector, placer, barrel, crate, table, bench, sack } from './interior.js';
import { CITY, CANALS, LANES, BRIDGES, inWater } from './plan.js';

/* ---------------- 桥 ---------------- */

function buildBridge(P, b) {
  const acrossZ = b.dir === 'z';
  const host = CANALS.find((c) => b.x > c[0] - 2 && b.x < c[2] + 2 && b.z > c[1] - 2 && b.z < c[3] + 2)
    || CANALS[0];
  const span = acrossZ ? host[3] - host[1] : host[2] - host[0];
  const W = b.width;
  const yaw = acrossZ ? 0 : Math.PI / 2;
  const BP = P.at(b.x, 0, b.z, yaw);

  // 拱券按跨度分孔:一孔跨 22m 的半圆拱会高出桥面 9m,必须分成多孔小拱
  const arches = span > 15 ? 3 : span > 8 ? 2 : 1;
  const unit = span / arches;
  const r = unit * 0.42;
  const SPRING = -0.6;                 // 起拱线(略低于水面)
  const crown = SPRING + r;            // 拱顶
  const deckTop = crown + 1.05;        // 桥面标高
  const L = span + 15;
  const segN = 27;
  const centers = [];
  for (let i = 0; i < arches; i++) centers.push((i - (arches - 1) / 2) * unit);
  const inArch = (z) => centers.some((c) => Math.abs(z - c) < r - 0.15);

  const profile = (t) => 0.34 + (deckTop - 0.34) * Math.max(0, Math.min(1, 1 - Math.pow(Math.abs(2 * t), 2) * 1.25));

  for (let i = 0; i < segN; i++) {
    const t = (i + 0.5) / segN - 0.5;
    const z = t * L;
    const h = profile(t);
    const segL = L / segN + 0.02;
    if (inArch(z)) {
      // 拱洞上方只放桥面板,底下透空
      BP.add('stoneWarm', boxOn(W, 0.85, segL, 0, h - 0.85, z));
      BP.box(aabbOn(0, h - 0.85, z, W, 0.85, segL));
    } else {
      // 桥墩 / 桥台:实心落到渠底
      BP.add('stoneWarm', boxOn(W, h + 3.4, segL, 0, -3.4, z));
      BP.box(aabbOn(0, -3.4, z, W, h + 3.4, segL));
    }
    for (const s of [-1, 1]) {
      BP.add('stoneTrim', boxOn(0.5, 0.95, segL, s * (W / 2 - 0.25), h, z));
      BP.box(aabbOn(s * (W / 2 - 0.25), h, z, 0.5, 0.95, segL));
    }
  }
  // 拱券石环
  for (const cz of centers) {
    BP.add('stoneDark', archRing(r, 0.85, W + 0.5, 0, SPRING, cz, Math.PI / 2));
  }
  // 桥头灯 / 雕像
  for (const s of [-1, 1]) {
    for (const q of [-1, 1]) {
      const px = s * (W / 2 - 0.4), pz = q * (L / 2 - 1.2);
      BP.add('stoneTrim', boxOn(1.3, 1.6, 1.3, px, 0.34, pz));
      if (b.grand) {
        BP.add('stoneWarm', lathe([[0.55, 0], [0.45, 0.3], [0.3, 1.4], [0.5, 1.7], [0.3, 2.0]], 8, px, 1.94, pz));
        BP.add('stoneWarm', sphere(0.34, 8, 6, px, 4.15, pz));
      } else {
        BP.add('ironDark', cyl(0.09, 0.11, 2.4, 6, px, 1.94, pz));
        BP.add('lampGlass', boxOn(0.42, 0.55, 0.42, px, 4.2, pz));
        BP.add('ironDark', cone(0.36, 0.34, 4, px, 4.9, pz));
        BP.emit({ x: px, y: 4.4, z: pz, color: 0xffbe72, intensity: 2.0, distance: 16, night: true });
      }
    }
  }
}

/* ---------------- 喷泉 ---------------- */

function buildFountain(P, x, z) {
  const F = P.at(x, 0, z);
  // 八角池
  F.add('stoneWarm', lathe([[7.2, 0], [7.2, 1.0], [6.6, 1.1], [6.6, 0.2], [0, 0.2]], 8));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    F.box(aabbOn(Math.sin(a) * 6.9, 0, Math.cos(a) * 6.9, 3.2, 1.05, 3.2));
  }
  F.add('water', cyl(6.55, 6.55, 0.02, 8, 0, 0.8, 0));
  // 中央柱与上盘
  F.add('stoneTrim', lathe([[2.2, 0], [2.0, 0.4], [1.2, 0.7], [1.0, 2.2], [2.6, 2.7], [2.6, 3.0], [1.0, 3.1], [0.9, 4.4], [0, 4.6]], 12, 0, 0.2, 0));
  F.box(aabbOn(0, 0.2, 0, 4.4, 3.2, 4.4));
  F.add('water', cyl(2.5, 2.5, 0.02, 12, 0, 3.02, 0));
  // 顶部持剑英雄像
  const S = F.at(0, 4.8, 0);
  S.add('copper', cyl(0.55, 0.7, 0.35, 10, 0, 0, 0));
  S.add('copper', boxOn(0.85, 1.5, 0.5, 0, 0.35, 0));
  S.add('copper', boxOn(0.34, 1.2, 0.34, -0.55, 0.4, 0.06));
  S.add('copper', boxOn(0.34, 1.5, 0.34, 0.5, 0.6, -0.1));
  S.add('copper', sphere(0.3, 8, 6, 0, 2.1, 0));
  S.add('copper', boxOn(0.16, 2.2, 0.5, 0.62, 1.5, -0.1));
  S.add('copper', boxOn(0.7, 0.16, 0.24, 0.62, 2.5, -0.1));
  // 水柱
  F.add('water', cyl(0.16, 0.3, 3.2, 6, 0, 3.0, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    F.add('water', cyl(0.07, 0.12, 1.5, 5, Math.sin(a) * 2.2, 2.4, Math.cos(a) * 2.2));
  }
}

/* ---------------- 英雄雕像 ---------------- */

function buildHeroStatue(P, x, z, rng, faceIn) {
  const S = P.at(x, 0, z, faceIn);
  // 基座:三层收分 + 铭牌
  S.add('stoneDark', boxOn(3.3, 0.42, 3.3, 0, 0, 0));
  S.add('stoneWarm', boxOn(2.7, 3.0, 2.7, 0, 0.42, 0));
  S.add('stoneTrim', boxOn(3.0, 0.3, 3.0, 0, 3.42, 0));
  S.add('stoneTrim', boxOn(3.0, 0.26, 3.0, 0, 0.42, 0));
  S.add('gold', boxOn(1.5, 0.7, 0.1, 0, 1.5, 1.36));
  S.box(aabbOn(0, 0, 0, 3.3, 3.72, 3.3));

  const B = S.at(0, 3.72, 0);
  const mat = rng.chance(0.45) ? 'copper' : 'stoneTrim';
  const arm = rng.chance(0.5);
  // 人体:腿 / 甲胄躯干 / 肩甲 / 头盔
  for (const s of [-1, 1]) B.add(mat, boxOn(0.34, 1.15, 0.34, s * 0.2, 0, s > 0 ? 0.06 : -0.04));
  B.add(mat, lathe([[0.44, 0], [0.5, 0.35], [0.46, 0.95], [0.4, 1.2]], 8, 0, 1.15, 0));
  B.add(mat, boxOn(0.92, 0.2, 0.56, 0, 2.35, 0));
  for (const s of [-1, 1]) B.add(mat, sphere(0.24, 8, 6, s * 0.5, 2.36, 0));
  for (const s of [-1, 1]) B.add(mat, boxOn(0.26, 1.05, 0.26, s * 0.5, arm && s < 0 ? 1.5 : 1.28, 0.05));
  B.add(mat, cyl(0.14, 0.17, 0.2, 8, 0, 2.5, 0));
  B.add(mat, sphere(0.25, 10, 8, 0, 2.82, 0));
  B.add(mat, cone(0.27, 0.34, 8, 0, 3.05, 0));
  // 披风:薄板 + 下摆
  B.add(mat, boxOn(1.0, 1.9, 0.09, 0, 0.7, -0.34));
  B.add(mat, boxOn(1.24, 0.3, 0.14, 0, 2.25, -0.3));
  if (arm) {                       // 拄剑
    B.add('iron', boxOn(0.13, 2.1, 0.35, -0.62, 0.02, 0.16));
    B.add('iron', boxOn(0.5, 0.14, 0.2, -0.62, 2.0, 0.16));
    B.add('iron', sphere(0.1, 7, 5, -0.62, 2.28, 0.16));
  } else {                         // 执长枪
    B.add('iron', cyl(0.06, 0.07, 3.4, 6, -0.66, 1.5, 0.16));
    B.add('iron', cone(0.11, 0.5, 6, -0.66, 3.42, 0.16));
  }
  // 盾
  B.add('iron', boxOn(0.6, 0.86, 0.12, 0.64, 0.72, 0.3));
  B.add('iron', boxOn(0.42, 0.3, 0.14, 0.64, 1.58, 0.3));
  B.add('gold', sphere(0.11, 8, 6, 0.64, 1.2, 0.38));
}

/* ---------------- 路灯 ---------------- */

function lamppost(P, x, z) {
  const L = P.at(x, 0, z);
  L.add('stoneDark', boxOn(0.75, 0.35, 0.75, 0, 0, 0));
  L.add('ironDark', cyl(0.1, 0.15, 3.5, 8, 0, 1.9, 0));
  L.add('ironDark', cyl(0.19, 0.19, 0.14, 8, 0, 3.68, 0));
  L.add('lampGlass', boxOn(0.5, 0.66, 0.5, 0, 3.72, 0));
  L.add('ironDark', cone(0.46, 0.4, 4, 0, 4.58, 0));
  for (const s of [-1, 1]) L.add('ironDark', boxOn(0.06, 0.06, 0.62, s * 0.24, 3.9, 0));
  L.box(aabbOn(0, 0, 0, 0.5, 3.6, 0.5));
  // emit 的坐标是 placer 的局部坐标 —— 这里写 (x,z) 会被再变换一次,把灯光甩到两倍远处
  L.emit({ x: 0, y: 3.9, z: 0, color: 0xffb765, intensity: 2.2, distance: 17, night: true, street: true });
}

/* ---------------- 市集摊位 ---------------- */

function marketStall(P, x, z, ry, rng) {
  const S = P.at(x, 0, z, ry);
  const w = 3.4, d = 2.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    S.add('plankDark', boxOn(0.14, 2.5, 0.14, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)));
  }
  const cloth = rng.pick(['clothRed', 'clothBlue', 'clothGreen', 'clothCream']);
  for (let i = 0; i < 5; i++) {
    S.add(i % 2 ? cloth : 'clothCream', boxOn(w / 5, 0.06, d + 0.9, -w / 2 + (i + 0.5) * w / 5, 2.5, 0));
  }
  S.add('plank', boxOn(w, 0.1, d - 0.5, 0, 0.92, 0));
  for (const sx of [-1, 1]) S.add('plankDark', boxOn(0.12, 0.92, 0.12, sx * (w / 2 - 0.3), 0, 0));
  S.box(aabbOn(0, 0, 0, w, 1.0, d - 0.5));
  // 货品
  for (let i = 0; i < 6; i++) {
    const gx = -w / 2 + 0.4 + rng.next() * (w - 0.8);
    const gz = rng.range(-0.5, 0.5);
    const r = rng.next();
    if (r < 0.33) S.add('clothRed', sphere(0.13, 6, 5, gx, 1.12, gz));
    else if (r < 0.66) S.add('foliageWarm', boxOn(0.24, 0.16, 0.2, gx, 1.02, gz));
    else S.add('copper', cyl(0.1, 0.11, 0.24, 7, gx, 1.14, gz));
  }
  if (rng.chance(0.6)) barrel(S.at(w / 2 + 0.5, 0, 0.4), 0.32, 0.82);
  if (rng.chance(0.5)) crate(S.at(-w / 2 - 0.55, 0, -0.3), 0.6);
}

/* ---------------- 树 / 绿篱 ---------------- */

function treeGeos(rng, scale = 1) {
  const h = (5.5 + rng.next() * 4) * scale;
  const trunk = cyl(0.22 * scale, 0.42 * scale, h, 7, 0, h / 2, 0);
  const blobs = [];
  const n = 3 + rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const r = (1.5 + rng.next() * 1.3) * scale;
    const a = (i / n) * Math.PI * 2 + rng.next();
    const rr = i === 0 ? 0 : (0.7 + rng.next() * 0.8) * scale;
    blobs.push(sphere(r, 7, 5, Math.sin(a) * rr, h * (0.82 + rng.next() * 0.28), Math.cos(a) * rr));
  }
  return { trunk, foliage: merge(blobs), h };
}

/* ---------------- 港口 ---------------- */

function buildHarbor(P, rng) {
  const [x0, z0, x1, z1] = CITY.harbor;
  // 栈桥
  for (let k = 0; k < 2; k++) {
    const pz = z0 + 18 + k * 30;
    const len = 26;
    const D = P.at(x1 - len / 2 - 1, 0, pz);
    D.add('plank', boxOn(len, 0.24, 5.2, 0, -0.1, 0));
    D.box(aabbOn(0, -0.1, 0, len, 0.28, 5.2));
    for (let i = 0; i < 7; i++) {
      for (const s of [-1, 1]) {
        D.add('plankDark', cyl(0.2, 0.22, 4.2, 6, -len / 2 + 1.6 + i * (len - 3.2) / 6, -2.2, s * 2.2));
      }
    }
    for (let i = 0; i < 4; i++) {
      D.add('plankDark', cyl(0.26, 0.3, 1.3, 7, -len / 2 + 2 + i * 7, 0.6, 2.9));
    }
    barrel(D.at(-len / 2 + 3, 0.14, -1.4), 0.34, 0.86);
    crate(D.at(-len / 2 + 6, 0.14, 1.2), 0.66);
    crate(D.at(-len / 2 + 6.2, 0.8, 1.1), 0.5);
    sack(D.at(-len / 2 + 9, 0.14, -1.2), 0.3);
  }
  // 吊车(码头岸边)
  {
    const K = P.at(x1 + 2.5, 0, z0 + 8);
    K.add('plankDark', boxOn(3.4, 0.5, 3.4, 0, 0, 0));
    K.add('plankDark', cyl(0.34, 0.4, 7.5, 8, 0, 3.9, 0));
    const armG = boxOn(0.4, 0.4, 7.5, 0, 7.4, 2.6);
    armG.rotateX(0.36);
    K.add('plankDark', armG);
    K.add('ironDark', cyl(0.03, 0.03, 3.4, 4, 0, 6.6, 5.4));
    K.add('ironDark', boxOn(0.7, 0.5, 0.7, 0, 4.7, 5.4));
    K.box(aabbOn(0, 0, 0, 1.2, 7.6, 1.2));
  }
  // 两条帆船(泊在港池里)
  for (let k = 0; k < 2; k++) {
    const sx = x0 + 12 + k * 5;
    const sz = z0 + 20 + k * 22;
    buildShip(P.at(sx, 0, sz, k ? 0.15 : -0.1), rng, k === 0 ? 1.0 : 0.82);
  }
  // 灯塔(西墙内侧)
  {
    const L = P.at(x0 + 3, 0, z1 + 6);
    L.add('stoneDark', cyl(3.4, 4.6, 16, 14, 0, 8, 0));
    L.add('stoneTrim', cyl(4.0, 4.0, 0.7, 14, 0, 16.2, 0));
    L.add('ironDark', cyl(2.6, 2.6, 3.0, 10, 0, 18, 0));
    L.add('lampGlass', cyl(2.2, 2.2, 2.6, 10, 0, 18, 0));
    L.add('emberGlow', sphere(1.1, 10, 8, 0, 18, 0));
    L.add('roofTeal', cone(3.2, 3.2, 10, 0, 21.2, 0));
    L.box(aabbOn(0, 0, 0, 8, 16.5, 8));
    L.emit({ x: 0, y: 18, z: 0, color: 0xffd08a, intensity: 6.0, distance: 55, night: true });
  }
}

function buildShip(S, rng, scale = 1) {
  const L = 22 * scale, W = 6.4 * scale;
  // 船体:用带倒角的拉伸做出收分
  const hull = new THREE.Shape();
  hull.moveTo(0, L / 2);
  hull.bezierCurveTo(W / 2, L / 4, W / 2, -L / 4, W / 2.6, -L / 2);
  hull.lineTo(-W / 2.6, -L / 2);
  hull.bezierCurveTo(-W / 2, -L / 4, -W / 2, L / 4, 0, L / 2);
  const hullGeo = new THREE.ExtrudeGeometry(hull, {
    depth: 3.4 * scale, bevelEnabled: true, bevelSize: 1.1 * scale, bevelThickness: 1.5 * scale,
    bevelSegments: 2, curveSegments: 10,
  });
  hullGeo.rotateX(-Math.PI / 2);
  hullGeo.translate(0, -1.1 * scale, 0);
  S.add('plankDark', hullGeo);
  // 甲板与舷墙
  S.add('plank', boxOn(W * 0.86, 0.2, L * 0.9, 0, 1.6 * scale, 0));
  for (const s of [-1, 1]) S.add('plankDark', boxOn(0.24, 1.0, L * 0.86, s * W * 0.44, 1.7 * scale, 0));
  // 艉楼
  S.add('plankDark', boxOn(W * 0.78, 2.0, L * 0.2, 0, 1.8 * scale, -L * 0.32));
  S.add('plank', boxOn(W * 0.6, 1.3, L * 0.14, 0, 3.8 * scale, -L * 0.32));
  // 桅杆与帆
  for (let m = 0; m < 2; m++) {
    const mz = L * (0.16 - m * 0.34);
    const mh = (16 - m * 3.5) * scale;
    S.add('plankDark', cyl(0.16 * scale, 0.28 * scale, mh, 8, 0, 1.7 * scale + mh / 2, mz));
    for (let y = 0; y < 2; y++) {
      const yy = 1.7 * scale + mh * (0.5 + y * 0.32);
      S.add('plankDark', boxOn(W * 1.5, 0.18, 0.18, 0, yy, mz));
      const sail = new THREE.PlaneGeometry(W * 1.4, mh * 0.26);
      sail.translate(0, yy - mh * 0.14, mz + 0.1);
      S.add('clothCream', sail);
    }
    S.add('ironDark', cyl(0.03, 0.03, mh * 0.7, 4, 0, 1.7 * scale + mh * 0.7, mz + 0.6));
  }
  void rng;
}

/* ---------------- 花园 ---------------- */

function buildGarden(P, rng) {
  const [x0, z0, x1, z1] = CITY.park;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // 凉亭
  {
    const G = P.at(cx + 14, 0, cz + 10);
    G.add('marble', cyl(5.4, 5.8, 0.6, 10, 0, 0.3, 0));
    G.box(aabbOn(0, 0, 0, 10.4, 0.6, 10.4));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = Math.sin(a) * 4.5, pz = Math.cos(a) * 4.5;
      const c = column(0.34, 4.2, 8);
      c.translate(px, 0.6, pz);
      G.add('marble', c);
      G.box(aabbOn(px, 0.6, pz, 0.8, 4.2, 0.8));
    }
    G.add('marble', cyl(5.2, 5.2, 0.5, 10, 0, 5.05, 0));
    const gRoof = spireRoof(5.4, 4.2, 10);
    gRoof.translate(0, 5.3, 0);
    G.add('roofTeal', gRoof);
    G.add('gold', lathe([[0.5, 0], [0.24, 0.9], [0, 1.5]], 8, 0, 9.5, 0));
  }
  // 水池
  {
    const W = P.at(cx - 16, 0, cz - 22);
    W.add('stoneTrim', lathe([[9, 0], [9, 0.5], [8.4, 0.55], [8.4, -1.2], [0, -1.2]], 14, 0, 0.12, 0));
    W.add('water', cyl(8.35, 8.35, 0.02, 14, 0, 0.28, 0));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      W.box(aabbOn(Math.sin(a) * 8.7, 0, Math.cos(a) * 8.7, 3.0, 0.6, 3.0));
    }
  }
  // 绿篱迷宫式花坛
  for (let i = 0; i < 10; i++) {
    const hx = x0 + 14 + rng.next() * (x1 - x0 - 28);
    const hz = z0 + 14 + rng.next() * (z1 - z0 - 28);
    if (Math.hypot(hx - (cx + 14), hz - (cz + 10)) < 14) continue;
    const len = 6 + rng.next() * 12;
    const ry = rng.chance(0.5) ? 0 : Math.PI / 2;
    const H = P.at(hx, 0, hz, ry);
    H.add('foliageDark', boxOn(len, 1.15, 1.3, 0, 0.1, 0));
    H.box(aabbOn(0, 0.1, 0, len, 1.25, 1.3));
  }
  // 长椅
  for (let i = 0; i < 8; i++) {
    const bx = x0 + 12 + rng.next() * (x1 - x0 - 24);
    const bz = z0 + 12 + rng.next() * (z1 - z0 - 24);
    const B = P.at(bx, 0, bz, rng.next() * 6.28);
    B.add('plankDark', boxOn(1.9, 0.1, 0.5, 0, 0.45, 0));
    B.add('plankDark', boxOn(1.9, 0.6, 0.1, 0, 0.55, -0.22));
    for (const s of [-1, 1]) B.add('ironDark', boxOn(0.1, 0.45, 0.44, s * 0.8, 0, 0));
    B.box(aabbOn(0, 0, 0, 1.9, 0.9, 0.5));
  }
}

/* ================================================================== *
 *  总装
 * ================================================================== */

export function buildProps(plan, rng) {
  const C = new Collector();
  const P = placer(C, 0, 0, 0, 0);
  const treeSpots = [];

  /* 桥 */
  for (const b of BRIDGES) buildBridge(P, b);

  /* 喷泉 */
  buildFountain(P, CITY.plaza.x, CITY.plaza.z);

  /* 英雄大道雕像 */
  for (let i = 0; i < 5; i++) {
    const z = 182 - i * 12.5;
    buildHeroStatue(P, -15.5, z, rng.fork(i * 3 + 1), Math.PI / 2);
    buildHeroStatue(P, 15.5, z, rng.fork(i * 3 + 2), -Math.PI / 2);
  }

  /* 路灯:沿街按间距布置 */
  for (const l of LANES) {
    const [ax, az] = l.a, [bx, bz] = l.b;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = uz, nz = -ux;
    const step = 26;
    const n = Math.max(1, Math.floor(len / step));
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * len;
      for (const s of [-1, 1]) {
        const px = ax + ux * t + nx * s * (l.w / 2 + 1.2);
        const pz = az + uz * t + nz * s * (l.w / 2 + 1.2);
        if (inWater(px, pz, 1)) continue;
        lamppost(P, px, pz);
      }
    }
  }

  /* 广场自身的路灯:街道路灯只沿街布,广场中心夜里会全黑 */
  {
    const { x, z, r } = CITY.plaza;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      lamppost(P, x + Math.sin(a) * (r - 5), z + Math.cos(a) * (r - 5));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      lamppost(P, x + Math.sin(a) * 10.5, z + Math.cos(a) * 10.5);
    }
  }

  /* 广场市集 */
  {
    const { x, z, r } = CITY.plaza;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.4;
      const d = r - 12;
      marketStall(P, x + Math.sin(a) * d, z + Math.cos(a) * d, -a, rng.fork(i + 40));
    }
    for (let i = 0; i < 6; i++) {
      const a = rng.next() * 6.28, d = r - 21 - rng.next() * 8;
      const T = P.at(x + Math.sin(a) * d, 0, z + Math.cos(a) * d, rng.next() * 6.28);
      table(T, 1.7, 0.95, 0.78, 'plankDark');
      bench(T.at(0, 0, 0.85), 1.5, 'plankDark');
      bench(T.at(0, 0, -0.85), 1.5, 'plankDark');
    }
  }

  /* 水井 + 货车 + 杂物 */
  {
    const wells = [[95, 112], [-95, 112], [140, 60], [-70, 150], [150, 150]];
    for (const [wx, wz] of wells) {
      const W = P.at(wx, 0, wz);
      W.add('stoneDark', lathe([[1.5, 0], [1.5, 0.9], [1.15, 0.95], [1.15, 0], [0, 0]], 12));
      W.box(aabbOn(0, 0, 0, 3.0, 0.95, 3.0));
      for (const s of [-1, 1]) W.add('plankDark', boxOn(0.18, 2.6, 0.18, s * 1.25, 0.9, 0));
      const axle = cyl(0.16, 0.16, 2.6, 6);       // 先转再移,否则会被甩到别处
      axle.rotateZ(Math.PI / 2);
      axle.translate(0, 3.2, 0);
      W.add('plankDark', axle);
      for (const g of gableRoof(3.4, 2.4, 0.9, 0.2, 0.12)) { g.translate(wx, 3.55, wz); C.add('thatch', g); }
      W.add('ironDark', cyl(0.02, 0.02, 1.2, 4, 0, 2.6, 0));
      W.add('plankDark', cyl(0.28, 0.24, 0.4, 8, 0, 1.9, 0));
    }
    const carts = [[26, 96, 0.4], [-40, 60, 1.9], [60, 130, 3.0], [-150, 90, 0.8], [30, -60, 2.2]];
    for (const [ax, az, ar] of carts) {
      const A = P.at(ax, 0, az, ar);
      A.add('plankDark', boxOn(2.4, 0.5, 4.2, 0, 0.75, 0));
      for (const s of [-1, 1]) A.add('plankDark', boxOn(0.12, 0.8, 4.0, s * 1.15, 1.0, 0));
      A.add('plankDark', boxOn(2.3, 0.8, 0.12, 0, 1.0, -2.0));
      for (const s of [-1, 1]) {
        const wheel = lathe([[0.85, 0], [0.85, 0.16], [0.2, 0.16], [0.2, 0]], 12);
        wheel.rotateZ(Math.PI / 2);
        wheel.translate(s * 1.3, 0.85, 0.9);
        A.add('plankDark', wheel);
      }
      A.add('plankDark', boxOn(0.16, 0.16, 2.6, 0, 1.0, 3.2));
      A.box(aabbOn(0, 0, 0, 2.7, 1.6, 4.4));
      crate(A.at(0, 1.0, -0.6), 0.7);
      barrel(A.at(0.1, 1.0, 0.9), 0.34, 0.8);
    }
  }

  /* 港口 */
  buildHarbor(P, rng.fork(77));

  /* 花园 */
  buildGarden(P, rng.fork(88));

  /* 树木:花园内 + 城内零星 */
  {
    const [px0, pz0, px1, pz1] = CITY.park;
    for (let i = 0; i < 46; i++) {
      const tx = px0 + 8 + rng.next() * (px1 - px0 - 16);
      const tz = pz0 + 8 + rng.next() * (pz1 - pz0 - 16);
      treeSpots.push({ x: tx, y: 0.1, z: tz, s: 0.8 + rng.next() * 0.55 });
    }
    const extra = [[-40, 60], [40, 60], [-52, 150], [52, 150], [-150, 130], [150, 130], [-60, -60], [-60, -20], [-95, -70]];
    for (const [tx, tz] of extra) treeSpots.push({ x: tx, y: 0, z: tz, s: 0.9 + rng.next() * 0.4 });
  }

  void plan;
  return { collector: C, boxes: C.boxes, treeSpots };
}

/** 树:用实例化渲染(城内 + 城外森林共用)。 */
export function buildTrees(M, spots, rng, heightAt) {
  const proto = treeGeos(rng.fork(3), 1);
  const group = new THREE.Group();
  const trunkM = new THREE.InstancedMesh(proto.trunk, M.bark, spots.length);
  const foliM = new THREE.InstancedMesh(proto.foliage, M.foliage, spots.length);
  trunkM.castShadow = true; foliM.castShadow = true; foliM.receiveShadow = true;
  const d = new THREE.Object3D();
  const boxes = [];
  spots.forEach((s, i) => {
    d.position.set(s.x, s.y ?? (heightAt ? heightAt(s.x, s.z) : 0), s.z);
    d.rotation.set(0, rng.next() * 6.28, 0);
    d.scale.setScalar(s.s);
    d.updateMatrix();
    trunkM.setMatrixAt(i, d.matrix);
    foliM.setMatrixAt(i, d.matrix);
    if (s.collide !== false) boxes.push(aabbOn(d.position.x, d.position.y, d.position.z, 0.9 * s.s, proto.h * s.s * 0.6, 0.9 * s.s));
  });
  trunkM.instanceMatrix.needsUpdate = true;
  foliM.instanceMatrix.needsUpdate = true;
  group.add(trunkM, foliM);
  return { group, boxes };
}
