// 城墙、角楼、狮王之门、水门,以及可以真的走上去的马道(城墙顶环城一圈)。
import * as THREE from 'three';
import {
  boxOn, cyl, spireRoof, crenellation, archedWall, archRing,
  stairs, aabbOn, transformBox, lathe,
} from '../core/geom.js';
import { Collector } from './interior.js';
import { CITY, CANALS } from './plan.js';

const WALL_H = 10.2;        // 马道标高
const WALL_T = 5.0;
const PARAPET_H = 1.7;

/** 水门:运河穿墙处 */
const WATER_GATES = [
  { x: -200, z: 21, ry: Math.PI / 2, span: 22 },
  { x: 200, z: 21, ry: Math.PI / 2, span: 22 },
];

function splitEdge(a, b, step = 11) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / step));
  // 墙体的长度方向是局部 +X;rotateY(θ) 把 (1,0,0) 映射到 (cosθ, 0, -sinθ),
  // 所以要让它对齐段方向 (ux,uz),必须 θ = atan2(-uz, ux)。写成 atan2(dx,dz) 会整段转 90°。
  const yaw = Math.atan2(-dz / len, dx / len);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    out.push({ cx: a[0] + dx * t, cz: a[1] + dz * t, len: len / n, yaw });
  }
  return out;
}

function crossesWater(cx, cz, len, yaw) {
  const hx = Math.abs(Math.sin(yaw)) * len / 2 + 3;
  const hz = Math.abs(Math.cos(yaw)) * len / 2 + 3;
  for (const c of CANALS) {
    if (cx - hx < c[2] && cx + hx > c[0] && cz - hz < c[3] && cz + hz > c[1]) return true;
  }
  return false;
}

export function buildWalls(M, rng) {
  const C = new Collector();
  const boxes = [];
  const pts = CITY.wall;
  const gate = CITY.gate;

  const addCrenel = (cx, cz, len, yaw, y) => {
    const cren = crenellation(len, 1.1, 1.7, 1.15, PARAPET_H, { x: 0, y, z: -WALL_T / 2 + 0.55 });
    for (const g of cren.geos) { g.rotateY(yaw); g.translate(cx, 0, cz); C.add('stone', g); }
    for (const b of cren.boxes) boxes.push(transformBox(b, cx, 0, cz, yaw));
    const cor = boxOn(len, 0.5, WALL_T + 1.0, 0, y - 0.5, 0);
    cor.rotateY(yaw); cor.translate(cx, 0, cz);
    C.add('stoneTrim', cor);
    const inner = boxOn(len, 0.95, 0.5, 0, y, WALL_T / 2 - 0.25);
    inner.rotateY(yaw); inner.translate(cx, 0, cz);
    C.add('stoneTrim', inner);
    boxes.push(transformBox(aabbOn(0, y, WALL_T / 2 - 0.25, len, 0.95, 0.5), cx, 0, cz, yaw));
  };

  /* ---------------- 墙身 ---------------- */
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (const seg of splitEdge(a, b)) {
      const { cx, cz, len, yaw } = seg;
      if (Math.abs(cz - gate.z) < 3 && Math.abs(cx) < gate.width / 2 + len) continue;  // 城门口
      if (crossesWater(cx, cz, len, yaw)) continue;                                     // 水门口
      const g = boxOn(len, WALL_H, WALL_T, 0, 0, 0);
      g.rotateY(yaw); g.translate(cx, 0, cz);
      C.add('stone', g);
      boxes.push(transformBox(aabbOn(0, 0, 0, len, WALL_H, WALL_T), cx, 0, cz, yaw));
      addCrenel(cx, cz, len, yaw, WALL_H);
    }
  }

  /* ---------------- 水门 ---------------- */
  for (const wg of WATER_GATES) {
    const width = wg.span + 16;
    const aw = archedWall(width, WALL_H, WALL_T, wg.span - 2, 8.4, wg.ry, wg.x, 0, wg.z);
    C.add('stone', aw.geo);
    boxes.push(...aw.boxes);
    const ring = archRing((wg.span - 2) / 2, 1.0, WALL_T + 1.2, 0, 8.4 - (wg.span - 2) / 2, 0, 0);
    ring.rotateY(wg.ry); ring.translate(wg.x, 0, wg.z);
    C.add('stoneTrim', ring);
    addCrenel(wg.x, wg.z, width, wg.ry, WALL_H);
    // 闸栅
    for (let i = 0; i <= 8; i++) {
      const g = boxOn(0.2, 4.0, 0.2, -8 + i * 2, 4.4, -WALL_T / 2 + 0.4);
      g.rotateY(wg.ry); g.translate(wg.x, 0, wg.z);
      C.add('ironDark', g);
    }
  }

  /* ---------------- 角楼 ---------------- */
  pts.forEach((p, idx) => {
    const [x, z] = p;
    const r = 7.2, h = 15.5;
    C.add('stone', cyl(r, r * 1.12, h, 16, x, h / 2, z));
    C.add('stoneTrim', cyl(r + 0.7, r + 0.7, 0.6, 16, x, h - 0.3, z));
    boxes.push(aabbOn(x, 0, z, r * 2.0, h, r * 2.0));
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      C.add('stone', boxOn(1.5, 1.5, 1.1, x + Math.sin(a) * (r + 0.2), h, z + Math.cos(a) * (r + 0.2), a));
    }
    const roof = spireRoof(r + 1.5, 9.5, 16);
    roof.translate(x, h + 1.5, z);
    C.add('roofBlue', roof);
    C.add('ironDark', cyl(0.12, 0.12, 5, 6, x, h + 13, z));
    const flag = new THREE.PlaneGeometry(2.6, 1.7);
    flag.translate(x + 1.35, h + 14.4, z);
    C.add(idx % 2 ? 'bannerRoyal' : 'bannerCrimson', flag);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      C.add('ironDark', boxOn(0.5, 1.7, 0.4, x + Math.sin(a) * r, 8.5, z + Math.cos(a) * r, a));
    }
  });

  /* ---------------- 狮王之门 ---------------- */
  {
    const gz = gate.z;
    const aw = archedWall(gate.width + 18, WALL_H + 5, WALL_T + 1.4, 12.5, 9.6, 0, 0, 0, gz);
    C.add('stone', aw.geo);
    boxes.push(...aw.boxes);
    C.add('stoneTrim', archRing(6.25, 1.0, WALL_T + 2.8, 0, 9.6 - 6.25, gz, 0));

    const cren = crenellation(gate.width + 18, 1.2, 1.8, 1.2, 1.9, { x: 0, y: WALL_H + 5, z: gz - 0.5 });
    for (const g of cren.geos) C.add('stone', g);
    for (const b of cren.boxes) boxes.push(b);
    C.add('stoneTrim', boxOn(gate.width + 20, 0.7, WALL_T + 3.6, 0, WALL_H + 4.3, gz));
    boxes.push(aabbOn(0, WALL_H + 4.3, gz, gate.width + 20, 0.7, WALL_T + 3.6));

    // 半升起的闸门
    for (let i = 0; i <= 9; i++) C.add('ironDark', boxOn(0.22, 5.2, 0.22, -5.6 + i * 1.25, 6.6, gz - 1.8));
    for (let i = 0; i < 3; i++) C.add('ironDark', boxOn(12.4, 0.2, 0.24, 0, 7.0 + i * 1.7, gz - 1.8));

    for (const s of [-1, 1]) {
      const tx = s * (gate.width / 2 + 11);
      const r = 8.4, h = 24;
      C.add('stone', cyl(r, r * 1.1, h, 18, tx, h / 2, gz));
      C.add('stoneTrim', cyl(r + 0.8, r + 0.8, 0.7, 18, tx, h - 0.35, gz));
      boxes.push(aabbOn(tx, 0, gz, r * 2.0, h, r * 2.0));
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        C.add('stone', boxOn(1.6, 1.6, 1.15, tx + Math.sin(a) * (r + 0.25), h, gz + Math.cos(a) * (r + 0.25), a));
      }
      const roof = spireRoof(r + 1.7, 13, 18);
      roof.translate(tx, h + 1.6, gz);
      C.add('roofBlue', roof);
      C.add('gold', lathe([[0.5, 0], [0.22, 0.7], [0.1, 1.5], [0, 1.9]], 8, tx, h + 14.4, gz));

      // 幡要贴在塔身正面(z = 圆心 + 半径),偏到侧面会被圆柱自身挡掉只剩一条边
      const ban = new THREE.PlaneGeometry(3.6, 11);
      ban.translate(tx, h - 7, gz + r + 0.3);
      C.add('bannerRoyal', ban);

      // 门楼火盆(入夜点亮)
      C.add('ironDark', lathe([[0.9, 0], [0.5, 0.5], [0.55, 1.2], [1.05, 1.5], [1.05, 1.65], [0, 1.65]], 10, tx, WALL_H + 5.2, gz - 5));
      C.add('emberGlow', cyl(0.85, 0.6, 0.4, 10, tx, WALL_H + 6.6, gz - 5));
      C.emit({ x: tx, y: WALL_H + 7.4, z: gz - 5, color: 0xff8a30, intensity: 3.4, distance: 28, flicker: 1.6, night: true });
    }
  }

  /* ---------------- 登城马道 ---------------- */
  for (const s of [
    { x: -36, z: 187, ry: Math.PI / 2 },
    { x: 36, z: 187, ry: -Math.PI / 2 },
    { x: -186, z: -70, ry: 0 },
    { x: 186, z: 80, ry: Math.PI },
  ]) {
    const n = 48, rise = WALL_H / n, run = 0.44;
    const st = stairs(n, 3.4, rise, run, { x: s.x, y: 0, z: s.z, ry: s.ry });
    for (const g of st.geos) C.add('stoneDark', g);
    boxes.push(...st.boxes);
    // 扶手墙
    for (const side of [-1, 1]) {
      const g = boxOn(0.4, 1.0, n * run, side * 1.9, 0, n * run / 2);
      g.rotateY(s.ry); g.translate(s.x, WALL_H - 0.6, s.z);
      C.add('stoneTrim', g);
    }
  }

  void M; void rng;
  return { collector: C, boxes };
}
