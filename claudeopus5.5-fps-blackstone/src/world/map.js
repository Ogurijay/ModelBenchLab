// 黑石前哨站布局。坐标单位米，y 向上，-z 为北。
// 南侧峡谷（渗透区）→ 南墙闸门 → 中央庭院；西侧 A1 仓库（上层环形走廊 + 军械库）；
// 东侧 C2 控制中心（安保室/大厅/机房/办公室）；北侧 R 反应堆大厅（三座冷却塔 + 北侧高架走廊）；
// 西北燃料库，东北停机坪（铁丝网闸门）。

import * as THREE from 'three';
import { MOVE, SOLID } from './collision.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

/** 区域：用于脚步材质、室内混响、HUD 地点名 */
export const ZONES = [
  { id: 'armory', name: 'A1 军械库', x0: -35, x1: -28, z0: 22.5, z1: 29.4, indoor: true, surface: 'tile' },
  { id: 'warehouse', name: 'A1 仓库', x0: -40, x1: -18, z0: -12, z1: 29.4, indoor: true, surface: 'concrete' },
  { id: 'server', name: 'C2 机房', x0: 28, x1: 40, z0: 0, z1: 14, indoor: true, surface: 'tile' },
  { id: 'office', name: 'C2 办公区', x0: 28, x1: 40, z0: 14, z1: 29.4, indoor: true, surface: 'tile' },
  { id: 'security', name: 'C2 安保室', x0: 18, x1: 28, z0: 0, z1: 10, indoor: true, surface: 'tile' },
  { id: 'lobby', name: 'C2 大厅', x0: 18, x1: 28, z0: 10, z1: 29.4, indoor: true, surface: 'tile' },
  { id: 'reactor', name: 'R 反应堆大厅', x0: -14, x1: 24, z0: -44, z1: -16, indoor: true, surface: 'concrete' },
  { id: 'helipad', name: '东北停机坪', x0: 24, x1: 40, z0: -44, z1: -16, indoor: false, surface: 'concrete' },
  { id: 'depot', name: '西北燃料库', x0: -40, x1: -14, z0: -44, z1: -12, indoor: false, surface: 'concrete' },
  { id: 'canyon', name: '南侧峡谷', x0: -40, x1: 40, z0: 29.4, z1: 70, indoor: false, surface: 'dirt' },
  { id: 'courtyard', name: '中央庭院', x0: -41, x1: 41, z0: -45, z1: 29.4, indoor: false, surface: 'concrete' },
];

export function zoneAt(x, z) {
  for (const zn of ZONES) if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
  return ZONES[ZONES.length - 1];
}

export const WORLD_BOUNDS = { minX: -46, minZ: -50, maxX: 46, maxZ: 68 };

export function buildFacility(B) {
  const W = B.world;
  const markers = {
    playerSpawn: { x: 0, y: 0, z: 50, yaw: 0 },
    spawns: {},
    lights: [],
    barrels: [],
    supplies: [],
    weaponPickups: [],
    doors: {},
    interact: {},
    pylons: [],
    props: [],
    hum: [],
  };

  // ───────── 小工具 ─────────
  const box = (x0, y0, z0, x1, y1, z1, mat, o) => B.box(x0, y0, z0, x1, y1, z1, mat, o);
  const deco = (x0, y0, z0, x1, y1, z1, mat, o = {}) => B.box(x0, y0, z0, x1, y1, z1, mat, { collide: false, ...o });
  const rbox = (cx, cy, cz, w, h, d, rx, ry, rz, mat, o = {}) => {
    const g = new THREE.BoxGeometry(w, h, d);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(cx, cy, cz);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    B.geo(g, mat, { uvMode: o.uvMode ?? 'project', ...o });
  };
  /** 水平圆柱（管道），axis: 'x' | 'z' */
  const hpipe = (axis, a0, a1, y, c, r, mat, o = {}) => {
    const len = a1 - a0;
    const g = new THREE.CylinderGeometry(r, r, len, o.seg ?? 12, 1, false);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, (uv.getY(i) * len) / 2);
    if (axis === 'x') {
      g.rotateZ(Math.PI / 2);
      g.translate((a0 + a1) / 2, y, c);
    } else {
      g.rotateX(Math.PI / 2);
      g.translate(c, y, (a0 + a1) / 2);
    }
    B.geo(g, mat, { uvMode: 'keep', ao: false, ...o });
    if (o.collide) {
      if (axis === 'x') W.addBox(a0, y - r, c - r, a1, y + r, c + r, { surface: 'metal' });
      else W.addBox(c - r, y - r, a0, c + r, y + r, a1, { surface: 'metal' });
    }
  };

  /**
   * 沿 X 的墙：x0..x1，中心 z=zc，厚 t。openings: {a,b,top,bottom?}（x 坐标）。
   * lining: {mat, side(+1/-1)} 在室内一侧贴一层装饰面板。
   */
  function wallX(x0, x1, zc, t, y0, y1, mat, openings = [], o = {}) {
    const z0 = zc - t / 2, z1 = zc + t / 2;
    const ops = [...openings].sort((p, q) => p.a - q.a);
    let cur = x0;
    const seg = (a, b, ya, yb) => {
      if (b - a < 1e-3 || yb - ya < 1e-3) return;
      box(a, ya, z0, b, yb, z1, mat, o);
      if (o.lining) {
        const lz = o.lining.side > 0 ? z1 : z0 - 0.06;
        deco(a, ya, lz, b, yb, lz + 0.06, o.lining.mat, { cast: false });
      }
    };
    for (const op of ops) {
      seg(cur, op.a, y0, y1);
      cur = op.b;
    }
    seg(cur, x1, y0, y1);
    for (const op of ops) {
      // 上楣、窗台
      if (op.top < y1) {
        box(op.a, op.top, z0, op.b, y1, z1, mat, o);
        if (o.lining) {
          const lz = o.lining.side > 0 ? z1 : z0 - 0.06;
          deco(op.a, op.top, lz, op.b, y1, lz + 0.06, o.lining.mat, { cast: false });
        }
      }
      if ((op.bottom ?? 0) > y0) {
        box(op.a, y0, z0, op.b, op.bottom, z1, mat, o);
        deco(op.a, op.bottom, z0 - 0.08, op.b, op.bottom + 0.08, z1 + 0.08, 'metalDark');
      }
      // 门框
      const fb = op.bottom ?? 0;
      deco(op.a - 0.12, fb, z0 - 0.05, op.a, op.top, z1 + 0.05, o.frame ?? 'metalDark');
      deco(op.b, fb, z0 - 0.05, op.b + 0.12, op.top, z1 + 0.05, o.frame ?? 'metalDark');
      deco(op.a - 0.12, op.top, z0 - 0.05, op.b + 0.12, op.top + 0.14, z1 + 0.05, o.frame ?? 'metalDark');
    }
  }
  function wallZ(z0w, z1w, xc, t, y0, y1, mat, openings = [], o = {}) {
    const x0 = xc - t / 2, x1 = xc + t / 2;
    const ops = [...openings].sort((p, q) => p.a - q.a);
    let cur = z0w;
    const seg = (a, b) => {
      if (b - a < 1e-3) return;
      box(x0, y0, a, x1, y1, b, mat, o);
      if (o.lining) {
        const lx = o.lining.side > 0 ? x1 : x0 - 0.06;
        deco(lx, y0, a, lx + 0.06, y1, b, o.lining.mat, { cast: false });
      }
    };
    for (const op of ops) {
      seg(cur, op.a);
      cur = op.b;
    }
    seg(cur, z1w);
    for (const op of ops) {
      if (op.top < y1) {
        box(x0, op.top, op.a, x1, y1, op.b, mat, o);
        if (o.lining) {
          const lx = o.lining.side > 0 ? x1 : x0 - 0.06;
          deco(lx, op.top, op.a, lx + 0.06, y1, op.b, o.lining.mat, { cast: false });
        }
      }
      if ((op.bottom ?? 0) > y0) {
        box(x0, y0, op.a, x1, op.bottom, op.b, mat, o);
        deco(x0 - 0.08, op.bottom, op.a, x1 + 0.08, op.bottom + 0.08, op.b, 'metalDark');
      }
      const fb = op.bottom ?? 0;
      deco(x0 - 0.05, fb, op.a - 0.12, x1 + 0.05, op.top, op.a, o.frame ?? 'metalDark');
      deco(x0 - 0.05, fb, op.b, x1 + 0.05, op.top, op.b + 0.12, o.frame ?? 'metalDark');
      deco(x0 - 0.05, op.top, op.a - 0.12, x1 + 0.05, op.top + 0.14, op.b + 0.12, o.frame ?? 'metalDark');
    }
  }

  /** 1.2m 军用箱 */
  const crate = (x, z, y = 0, s = 1.2, mat = 'crate') => {
    box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, mat, { uvMode: 'local', surface: 'wood', tint: 0.9 + ((x * 7.3 + z * 3.1) % 1 + 1) % 1 * 0.2 });
  };

  /** 集装箱：起点 (x,z)，沿 X 或 Z，长 6.06 宽 2.44 高 2.6 */
  const container = (x, z, alongX, mat, y = 0) => {
    const L = 6.06, Wd = 2.44, H = 2.6;
    const x1 = alongX ? x + L : x + Wd;
    const z1 = alongX ? z + Wd : z + L;
    box(x, y, z, x1, y + H, z1, mat, { uv: 2.6, surface: 'metal' });
    // 角柱
    const k = 0.14;
    for (const [cx, cz] of [[x, z], [x1, z], [x, z1], [x1, z1]]) {
      deco(cx - k / 2, y, cz - k / 2, cx + k / 2, y + H + 0.02, cz + k / 2, 'metalDark', { ao: false });
    }
    // 端门竖杆
    const endA = alongX ? x1 : z1;
    for (let i = 0; i < 4; i++) {
      const off = 0.35 + i * 0.58;
      if (alongX) deco(endA, y + 0.15, z + off - 0.03, endA + 0.06, y + H - 0.15, z + off + 0.03, 'metalDark', { ao: false, cast: false });
      else deco(x + off - 0.03, y + 0.15, endA, x + off + 0.03, y + H - 0.15, endA + 0.06, 'metalDark', { ao: false, cast: false });
    }
  };

  const sandbags = (x0, z0, x1, z1, h = 1.1) => {
    box(x0, 0, z0, x1, h, z1, 'sandbag', { uv: 1.2, surface: 'dirt' });
    deco(x0 + 0.05, h, z0 + 0.05, x1 - 0.05, h + 0.12, z1 - 0.05, 'sandbag', { uv: 1.2 });
  };
  const jersey = (x0, z0, x1, z1) => {
    box(x0, 0, z0, x1, 1.0, z1, 'jersey', { uv: 2 });
    deco(x0 - 0.12, 0, z0 - 0.12, x1 + 0.12, 0.25, z1 + 0.12, 'jersey', { uv: 2 });
  };
  const barrel = (x, z) => markers.barrels.push({ x, z });
  const point = (x, y, z, color, intensity, distance, o = {}) =>
    markers.lights.push({ type: 'point', x, y, z, color, intensity, distance, ...o });
  const lampFixture = (x, y, z, w = 1.6, d = 0.35, mat = 'glowWarm') => {
    deco(x - w / 2 - 0.06, y, z - d / 2 - 0.06, x + w / 2 + 0.06, y + 0.12, z + d / 2 + 0.06, 'metalDark', { cast: false, ao: false });
    deco(x - w / 2, y - 0.03, z - d / 2, x + w / 2, y, z + d / 2, mat, { cast: false, ao: false });
  };
  const railing = (axis, a0, a1, c, y, h = 1.05, collide = true) => {
    // axis: 'x' 沿 x 方向延伸的栏杆，c 为 z；'z' 同理
    const t = 0.05;
    if (collide) {
      if (axis === 'x') W.addBox(a0, y, c - 0.05, a1, y + h, c + 0.05, { flags: MOVE, surface: 'metal' });
      else W.addBox(c - 0.05, y, a0, c + 0.05, y + h, a1, { flags: MOVE, surface: 'metal' });
    }
    const top = (u0, u1, yy, th) => {
      if (axis === 'x') deco(u0, yy, c - t, u1, yy + th, c + t, 'rail', { ao: false, cast: false });
      else deco(c - t, yy, u0, c + t, yy + th, u1, 'rail', { ao: false, cast: false });
    };
    top(a0, a1, y + h - 0.08, 0.08);
    top(a0, a1, y + h * 0.5, 0.05);
    const n = Math.max(1, Math.round((a1 - a0) / 1.8));
    for (let i = 0; i <= n; i++) {
      const u = a0 + ((a1 - a0) * i) / n;
      if (axis === 'x') deco(u - 0.04, y, c - 0.04, u + 0.04, y + h, c + 0.04, 'rail', { ao: false, cast: false });
      else deco(c - 0.04, y, u - 0.04, c + 0.04, y + h, u + 0.04, 'rail', { ao: false, cast: false });
    }
  };
  const sign = (mat, x, y, z, w, h, facing) => {
    // facing: 方向向量对应的 yaw（0=+z）
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateY(facing);
    g.translate(x, y, z);
    B.geo(g, mat, { uvMode: 'keep', ao: false, cast: false });
  };
  const rock = (x, y, z, r, sx = 1, sy = 1, sz = 1, seed = 1) => {
    const g = new THREE.DodecahedronGeometry(r, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const n = Math.sin(px * 3.1 + seed) * Math.cos(pz * 2.7 + seed * 1.7) * 0.18 + Math.sin(py * 4.3 + seed * 0.3) * 0.1;
      pos.setXYZ(i, px * (1 + n) * sx, py * (1 + n) * sy, pz * (1 + n) * sz);
    }
    g.computeVertexNormals();
    _e.set(seed * 0.7, seed * 1.3, seed * 0.4);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    B.geo(g, 'rock', { uvMode: 'project', uv: 3, ao: false });
  };

  // ───────── 地面 ─────────
  deco(-90, -0.4, -90, 90, -0.02, 90, 'ground', { uv: 8, ao: false, cast: false });
  deco(-40, -0.3, -44, 40, 0, 29.4, 'pave', { uv: 4, ao: false, cast: false });
  deco(-4.5, -0.3, 29.4, 4.5, -0.006, 58, 'asphalt', { uv: 4, ao: false, cast: false });
  // 闸门前警示地标
  deco(-4, -0.3, 30.6, 4, -0.003, 31.6, 'hazard', { uv: 2, ao: false, cast: false });
  deco(-4, -0.3, 27.8, 4, 0.003, 28.8, 'hazard', { uv: 2, ao: false, cast: false });

  // ───────── 外围墙 ─────────
  const PW = { surface: 'concrete', uv: 4 };
  box(-41.2, 0, 29.4, -4, 7, 30.6, 'concrete', PW);
  box(4, 0, 29.4, 41.2, 7, 30.6, 'concrete', PW);
  box(-41.2, 0, -45.2, -40, 7, 30.6, 'concrete', PW);
  box(40, 0, -45.2, 41.2, 7, 30.6, 'concrete', PW);
  box(-41.2, 0, -45.2, 41.2, 7, -44, 'concrete', PW);
  // 墙帽
  deco(-41.4, 7, 29.25, -4, 7.25, 30.75, 'concreteDark', { ao: false });
  deco(4, 7, 29.25, 41.4, 7.25, 30.75, 'concreteDark', { ao: false });
  deco(-41.4, 7, -45.4, -39.85, 7.25, 30.75, 'concreteDark', { ao: false });
  deco(39.85, 7, -45.4, 41.4, 7.25, 30.75, 'concreteDark', { ao: false });
  deco(-41.4, 7, -45.4, 41.4, 7.25, -43.85, 'concreteDark', { ao: false });
  // 闸门门柱与横梁
  box(-5.4, 0, 29.1, -4, 9, 30.9, 'concreteDark', PW);
  box(4, 0, 29.1, 5.4, 9, 30.9, 'concreteDark', PW);
  box(-5.4, 7.6, 29.1, 5.4, 9, 30.9, 'concreteDark', PW);
  deco(-4, 7.3, 29.0, 4, 7.6, 31.0, 'hazard', { ao: false });
  // 闸门（动态）
  const gateCol = W.addBox(-4, 0, 29.7, 4, 7.6, 30.3, { surface: 'metal' });
  markers.doors.gate = {
    collider: gateCol,
    nav: [-4.5, 28.6, 4.5, 31.4],
    panels: [
      { box: [-4, 0, 29.72, 0, 7.3, 30.28], mat: 'gate', slide: [-3.95, 0, 0] },
      { box: [0, 0, 29.72, 4, 7.3, 30.28], mat: 'gate', slide: [3.95, 0, 0] },
    ],
    duration: 4.5,
  };
  markers.interact.gateTerminal = { x: 6.6, y: 1.25, z: 31.5, r: 2.2 };
  box(6.1, 0, 30.6, 7.1, 1.45, 31.05, 'metalDark', { surface: 'metal' });
  deco(6.2, 0.75, 31.05, 7.0, 1.35, 31.07, 'screen', { ao: false, cast: false, uvMode: 'local' });
  deco(6.0, 1.45, 30.6, 7.2, 1.55, 31.15, 'hazard', { ao: false });
  // 外墙标识
  sign('sign_logo', -14, 4.4, 30.62, 9, 2.25, 0);
  sign('sign_warning', 12, 2.6, 30.62, 2.6, 1.3, 0);

  // ───────── 南侧峡谷（渗透区） ─────────
  const rockWall = (x0, z0, x1, z1, h) => box(x0, 0, z0, x1, h, z1, 'rock', { uv: 5, surface: 'dirt' });
  rockWall(-36, 30.6, -24, 38, 10);
  rockWall(-36, 38, -23, 46, 9);
  rockWall(-36, 46, -25, 54, 11);
  rockWall(-36, 54, -24, 62, 10);
  rockWall(24, 30.6, 36, 38, 9.5);
  rockWall(23, 38, 36, 46, 10.5);
  rockWall(25, 46, 36, 54, 9);
  rockWall(24, 54, 36, 62, 11);
  rockWall(-36, 56, 36, 66, 10);
  // 碎岩打破直边
  const rocks = [
    [-23.4, 1.2, 33, 2.2], [-22.6, 0.8, 41, 1.8], [-24.2, 2.5, 49, 2.6], [-23.2, 0.6, 52.5, 1.5], [-22.9, 4, 44, 1.9],
    [23.6, 1.4, 34, 2.4], [22.4, 0.9, 42.5, 1.7], [24.4, 2.4, 50, 2.5], [23.4, 0.7, 55, 1.4], [22.6, 4.5, 39, 2],
    [-14, 1.5, 56.3, 2.6], [-6, 0.9, 55.6, 1.8], [7, 1.6, 56.2, 2.4], [16, 1, 55.5, 2], [0, 6, 56.4, 3],
  ];
  rocks.forEach(([x, y, z, r], i) => rock(x, y, z, r, 1, 0.8, 1, i + 1));
  // 沿峡谷的散落小石（可踩上）
  [[-18, 44], [-20, 36], [17, 50], [19, 37], [-7, 53], [10, 52]].forEach(([x, z], i) => {
    rock(x, 0.2, z, 0.7, 1.2, 0.55, 1, i + 20);
    W.addBox(x - 0.6, 0, z - 0.6, x + 0.6, 0.45, z + 0.6, { surface: 'dirt' });
  });
  // 废弃卡车
  box(-11.2, 0.5, 37.6, -8.6, 3.0, 42.6, 'truck', { uv: 2.5, surface: 'metal' });
  box(-11.0, 0.5, 42.8, -8.8, 2.6, 45.2, 'truck', { uv: 2.5, surface: 'metal' });
  deco(-10.9, 1.9, 45.18, -8.9, 2.45, 45.22, 'glass', { ao: false, cast: false });
  W.addBox(-11.2, 0, 37.6, -8.6, 0.5, 45.2, { surface: 'metal' });
  for (const z of [38.6, 41.4, 44.2]) {
    for (const x of [-11.35, -8.45]) {
      const g = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 16);
      g.rotateZ(Math.PI / 2);
      g.translate(x, 0.55, z);
      B.geo(g, 'rubber', { uvMode: 'keep', ao: false });
    }
  }
  jersey(3, 41, 6, 41.6);
  jersey(-3, 36, 0, 36.6);
  jersey(9, 46.4, 12, 47);
  jersey(-16, 47, -13, 47.6);
  // 哨岗沙袋
  sandbags(10, 33, 14, 33.8);
  sandbags(10, 33.8, 10.8, 37);
  sandbags(13.2, 33.8, 14, 37);
  crate(-15, 33.2);
  crate(-15, 34.5);
  crate(-16.3, 33.2);
  crate(-15.6, 33.8, 1.2, 0.8, 'crateTan');
  crate(17, 44);
  crate(18.3, 44.2);
  crate(17.6, 44.1, 1.2, 0.8, 'crateTan');
  crate(-19, 50.2, 0, 1.2, 'crateTan');
  // 灯杆
  const lightPole = (x, z, dirX, dirZ, spot) => {
    B.cylinder(x, 0, z, 0.14, 8.6, 'metalDark', { seg: 10, colliderScale: 1.3 });
    const hx = x + dirX * 0.6, hz = z + dirZ * 0.6;
    deco(Math.min(x, hx) - 0.1, 8.4, Math.min(z, hz) - 0.1, Math.max(x, hx) + 0.1, 8.55, Math.max(z, hz) + 0.1, 'metalDark');
    deco(hx - 0.45, 8.15, hz - 0.3, hx + 0.45, 8.45, hz + 0.3, 'metalDark');
    deco(hx - 0.38, 8.12, hz - 0.24, hx + 0.38, 8.15, hz + 0.24, 'glowWarm', { cast: false, ao: false });
    if (spot) markers.lights.push({ type: 'spot', x: hx, y: 8.0, z: hz, tx: hx + dirX * 6, ty: 0, tz: hz + dirZ * 6, color: 0xffd6a0, intensity: 260, distance: 34, angle: 0.85 });
  };
  lightPole(-7.5, 32, 0.3, 1, true);
  lightPole(19, 40, -1, 0, false);

  // ───────── 中央庭院 ─────────
  container(-12, 16.8, true, 'cont_red');
  container(7.8, 15, false, 'cont_blue');
  container(7.8, 15, false, 'cont_orange', 2.6);
  container(-4, 4.8, true, 'cont_green');
  container(6, -3, true, 'cont_red');
  container(-13.2, -8, false, 'cont_blue');
  container(26, -9, true, 'cont_orange');
  container(26, -9, true, 'cont_green', 2.6);
  // 攀爬用箱
  crate(11, 19.2);
  crate(-5.2, 18);
  crate(1.6, 20.6);
  crate(2.9, 20.6);
  crate(1.8, 20.6, 1.2, 0.8, 'crateTan');
  crate(-8, 10.4);
  crate(-8, 9.1, 0, 1.2, 'crateTan');
  crate(14.6, 5.6);
  crate(15.9, 5.6, 0, 1.2, 'crateTan');
  crate(14.6, 4.3);
  crate(-3, -12.5);
  crate(-1.7, -12.5, 0, 1.2, 'crateTan');
  crate(12, -11.5);
  crate(33.5, -3);
  crate(34.8, -3, 0, 1.2, 'crateTan');
  crate(33.5, -3, 1.2, 0.8);
  crate(-15.3, 11.8);
  crate(-15.3, 13.1, 0, 1.2, 'crateTan');
  jersey(-2, 12, 1, 12.6);
  jersey(13, 8, 13.6, 11);
  jersey(20, -12, 23, -11.4);
  jersey(-16, 2, -13, 2.6);
  jersey(5, 24.6, 8, 25.2);
  // 庭院中央沙袋工事
  sandbags(-3, -8.8, 3, -8);
  sandbags(-3, -8, -2.2, -4.5);
  sandbags(2.2, -8, 3, -4.5);
  // 油桶
  barrel(-6.6, 11.6);
  barrel(-5.8, 12.3);
  barrel(4.6, -10.4);
  barrel(15.4, 12.6);
  barrel(22.5, -4.2);
  barrel(-15.6, -10.4);
  barrel(31.6, 26.6);
  lightPole(-15.6, 27.4, 0.7, -0.7, true);
  lightPole(15.4, -14.6, -0.6, 0.8, true);
  lightPole(37.8, -13.6, -1, 0.2, false);
  // 墙面标识
  sign('sign_logo', 11.5, 4.6, 29.38, 8, 2, Math.PI);

  // ───────── A1 仓库 ─────────
  const WH = { surface: 'concrete', uv: 4 };
  // 东墙（朝庭院），内衬金属板
  wallZ(-12.3, 29.4, -18, 0.6, 0, 9, 'concrete', [
    { a: 9, b: 11.5, top: 3 },
    { a: 15, b: 20, top: 5 },
  ], { ...WH, lining: { mat: 'metal', side: -1 }, frame: 'hazard' });
  // 北墙
  wallX(-40, -17.7, -12, 0.6, 0, 9, 'concrete', [{ a: -30, b: -27.5, top: 3 }], { ...WH, lining: { mat: 'metal', side: 1 } });
  // 外围墙加高段 + 内衬
  box(-41.2, 7, -12.3, -40, 9.4, 30.6, 'concrete', WH);
  box(-41.2, 7, 29.4, -17.7, 9.4, 30.6, 'concrete', WH);
  deco(-40, 0, -11.7, -39.94, 9, 29.4, 'metal', { cast: false });
  deco(-40, 0, 29.34, -18.3, 9, 29.4, 'metal', { cast: false });
  // 屋顶 + 桁架 + 天窗灯
  box(-41.2, 9, -12.3, -17.7, 9.5, 30.6, 'roof', { uv: 4 });
  for (const z of [-8, -2, 4, 10, 16, 22, 28]) {
    deco(-40, 8.25, z - 0.15, -18.3, 8.55, z + 0.15, 'metalDark', { cast: false, ao: false });
    deco(-40, 7.6, z - 0.06, -18.3, 7.7, z + 0.06, 'metalDark', { cast: false, ao: false });
  }
  for (const z of [-5, 7, 19]) lampFixture(-29, 8.2, z, 6, 0.5, 'glowCool');
  point(-29, 7.4, 1, 0xcfe4ff, 70, 26);
  point(-29, 7.4, 19, 0xcfe4ff, 70, 26);
  // 卷帘门导轨（装饰）
  deco(-17.6, 5, 14.7, -17.4, 5.6, 20.3, 'metalDark');
  // 西、北侧高架走廊
  box(-40, 3.9, -11.7, -36.5, 4.2, 29.4, 'plate', { surface: 'metal', uv: 2 });
  box(-36.5, 3.9, -11.7, -18.3, 4.2, -8.2, 'plate', { surface: 'metal', uv: 2 });
  railing('z', -8.2, 29.4, -36.5, 4.2);
  railing('x', -36.5, -21.5, -8.2, 4.2);
  // 坡道（东墙内侧，向北升到走廊）
  B.ramp(-21.5, 0, -8.2, -18.3, 4.2, 7, 'z', -1, 'plate', { surface: 'metal', uv: 2 });
  W.addBox(-21.62, 0, -8.2, -21.5, 5.3, 7, { flags: MOVE, surface: 'metal' });
  {
    // 斜扶手
    const len = Math.hypot(15.2, 4.2);
    const ang = Math.atan2(4.2, 15.2);
    rbox(-21.56, 2.1 + 1.0, -0.6, 0.07, 0.08, len, ang, 0, 0, 'rail', { ao: false, cast: false });
    rbox(-21.56, 2.1 + 0.5, -0.6, 0.05, 0.05, len, ang, 0, 0, 'rail', { ao: false, cast: false });
    for (let i = 0; i <= 6; i++) {
      const z = 7 - (15.2 * i) / 6;
      const y = (4.2 * i) / 6;
      deco(-21.6, y, z - 0.04, -21.52, y + 1.05, z + 0.04, 'rail', { ao: false, cast: false });
    }
  }
  // 走廊支柱
  for (const z of [-8, -2, 4, 10, 16, 22, 28]) box(-36.95, 0, z - 0.15, -36.65, 3.9, z + 0.15, 'metalDark', { surface: 'metal' });
  for (const x of [-33, -25]) box(x - 0.15, 0, -8.65, x + 0.15, 3.9, -8.35, 'metalDark', { surface: 'metal' });
  // 走廊下的工业灯
  for (const z of [0, 14]) lampFixture(-38.2, 3.75, z, 0.4, 1.4, 'glowWarm');
  // 军械库
  wallX(-35, -28, 22.5, 0.3, 0, 3.6, 'metal', [{ a: -32.5, b: -30.5, top: 2.6 }], { surface: 'metal', uv: 2, frame: 'hazard' });
  box(-35.15, 0, 22.65, -34.85, 3.6, 29.4, 'metal', { surface: 'metal', uv: 2 });
  box(-28.15, 0, 22.65, -27.85, 3.6, 29.4, 'metal', { surface: 'metal', uv: 2 });
  box(-35.15, 3.6, 22.35, -27.85, 3.8, 29.4, 'metalDark', { surface: 'metal' });
  deco(-34.85, 0, 22.65, -28.15, 0.02, 29.34, 'floor', { uv: 2, ao: false, cast: false });
  box(-33.6, 0, 27, -30.8, 0.92, 28.3, 'metalDark', { surface: 'metal' });
  // 武器架（装饰）
  for (let i = 0; i < 4; i++) {
    const z = 23.6 + i * 1.3;
    deco(-28.75, 0.6, z - 0.5, -28.2, 2.2, z + 0.5, 'metalDark', { cast: false });
    rbox(-28.65, 1.4, z, 0.08, 1.0, 0.12, 0, 0, 0.25, 'gun', { ao: false, cast: false });
  }
  lampFixture(-31.5, 3.45, 25.5, 2, 0.4, 'glowCool');
  point(-31.5, 3.1, 25.8, 0xffe2b8, 18, 9);
  markers.weaponPickups.push({ weapon: 'shotgun', x: -32.2, top: 0.93, z: 27.6, yaw: 0.4 });
  markers.supplies.push({ x: -29.4, z: 24.2, yaw: Math.PI / 2 });
  sign('sign_armory', -31.5, 3.0, 22.33, 2.4, 0.6, Math.PI);
  // 货架
  const rack = (x0, z0, x1, z1) => {
    box(x0, 0, z0, x1, 4.5, z1, null, { surface: 'metal' });
    const posts = Math.round((z1 - z0) / 2.5);
    for (let i = 0; i <= posts; i++) {
      const z = z0 + ((z1 - z0) * i) / posts;
      deco(x0, 0, z - 0.06, x0 + 0.12, 4.5, z + 0.06, 'rail', { ao: false });
      deco(x1 - 0.12, 0, z - 0.06, x1, 4.5, z + 0.06, 'rail', { ao: false });
    }
    for (const y of [0.15, 1.6, 3.0, 4.35]) deco(x0, y, z0, x1, y + 0.08, z1, 'metalDark', { ao: false });
    // 货物
    let s = Math.abs(Math.floor(x0 * 13 + z0 * 7));
    for (const y of [0.23, 1.68, 3.08]) {
      for (let z = z0 + 0.3; z < z1 - 0.9; z += 1.15) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        if (s % 5 === 0) continue;
        const h = 0.6 + (s % 7) * 0.1;
        const mat = s % 3 === 0 ? 'crateTan' : s % 3 === 1 ? 'cardboard' : 'crate';
        deco(x0 + 0.1, y, z, x1 - 0.1, y + Math.min(h, 1.25), z + 0.95, mat, { uvMode: 'local', ao: false });
      }
    }
  };
  rack(-32, -5, -30.8, 5);
  rack(-26, -5, -24.8, 5);
  rack(-32, 8, -30.8, 16);
  rack(-26, 8, -24.8, 16);
  // 叉车
  box(-23.2, 0, 21.6, -21.2, 1.5, 24.4, 'forklift', { surface: 'metal', uv: 1.5 });
  deco(-23.0, 1.5, 22.4, -21.4, 2.6, 24.2, 'metalDark', { ao: false });
  deco(-22.9, 0, 20.2, -22.75, 3.4, 20.35, 'metalDark');
  deco(-21.65, 0, 20.2, -21.5, 3.4, 20.35, 'metalDark');
  deco(-23.0, 0.12, 19.0, -21.4, 0.18, 21.6, 'metalDark');
  crate(-27.6, 20.4);
  crate(-26.3, 20.4, 0, 1.2, 'crateTan');
  crate(-27, 20.4, 1.2);
  crate(-38.2, 11.5);
  crate(-38.2, 12.8, 0, 1.2, 'crateTan');
  crate(-23.6, -3.5);
  crate(-23.6, -2.2);
  crate(-35.2, -4.4, 0, 1.2, 'crateTan');
  barrel(-24.2, 26.6);
  barrel(-38.2, -6.2);
  sign('sign_warehouse', -17.65, 6.6, 17.5, 4.2, 1.05, Math.PI / 2);

  // ───────── C2 控制中心 ─────────
  const CB = { surface: 'concrete', uv: 3 };
  wallZ(-0.3, 29.4, 18, 0.6, 0, 5, 'concrete', [
    { a: 3, b: 7, top: 2.4, bottom: 1.1 },
    { a: 12, b: 14.5, top: 3 },
    { a: 17, b: 21, top: 2.4, bottom: 1.1 },
    { a: 24, b: 26.5, top: 3 },
  ], { ...CB, lining: { mat: 'panel', side: 1 } });
  wallX(17.7, 40, 0, 0.6, 0, 5, 'concrete', [
    { a: 21, b: 25, top: 2.4, bottom: 1.1 },
    { a: 33, b: 35.5, top: 3 },
  ], { ...CB, lining: { mat: 'panel', side: 1 } });
  deco(39.94, 0, 0.3, 40, 5, 29.4, 'panel', { cast: false });
  deco(18.3, 0, 29.34, 40, 5, 29.4, 'panel', { cast: false });
  box(17.7, 5, -0.3, 40, 5.4, 29.4, 'roof', { uv: 4 });
  deco(17.5, 5.4, -0.5, 40, 5.75, -0.3, 'concreteDark', { ao: false });
  deco(17.5, 5.4, -0.5, 17.7, 5.75, 29.4, 'concreteDark', { ao: false });
  deco(18.3, -0.1, 0.3, 39.94, 0.015, 29.34, 'floor', { uv: 3, ao: false, cast: false });
  // 屋顶空调机组
  for (const [x, z] of [[23, 6], [33, 20], [24, 23]]) deco(x - 1.2, 5.4, z - 0.9, x + 1.2, 6.6, z + 0.9, 'metal', { uv: 2 });
  const IW = { surface: 'metal', uv: 2 };
  wallZ(0.3, 29.4, 28, 0.3, 0, 5, 'panel', [
    { a: 5, b: 7.5, top: 2.8 },
    { a: 20, b: 22.5, top: 2.8 },
  ], IW);
  wallX(28.15, 39.94, 14, 0.3, 0, 5, 'panel', [{ a: 33, b: 35.5, top: 2.8 }], IW);
  wallX(18.3, 27.85, 10, 0.3, 0, 5, 'panel', [{ a: 22, b: 24.5, top: 2.8 }], IW);
  // 机房
  for (const z of [3, 6.8, 10.4]) {
    box(30, 0, z, 36.5, 2.3, z + 0.9, 'server', { surface: 'metal', uv: 2.3 });
    deco(29.9, 2.3, z - 0.05, 36.6, 2.42, z + 0.95, 'metalDark', { ao: false });
  }
  box(38.6, 0, 6, 39.94, 1.15, 8.4, 'metalDark', { surface: 'metal' });
  deco(38.7, 1.15, 6.1, 39.3, 1.2, 8.3, 'screen', { ao: false, cast: false, uvMode: 'local' });
  {
    const g = new THREE.PlaneGeometry(2.4, 1.5);
    g.rotateY(-Math.PI / 2);
    g.translate(39.88, 2.4, 7.2);
    B.geo(g, 'screenBig', { uvMode: 'keep', ao: false, cast: false });
  }
  markers.interact.serverTerminal = { x: 38.0, y: 1.2, z: 7.2, r: 2.4 };
  // 线槽
  for (const z of [3.45, 7.25, 10.85]) deco(30, 4.6, z - 0.15, 36.5, 4.7, z + 0.15, 'metalDark', { ao: false, cast: false });
  lampFixture(33, 4.85, 5, 3, 0.35, 'glowCyan');
  lampFixture(33, 4.85, 9, 3, 0.35, 'glowCyan');
  point(34, 4.3, 7, 0x7fd8ff, 34, 14);
  // 安保室
  box(19.5, 0, 6.6, 23.5, 0.85, 7.6, 'metalDark', { surface: 'metal' });
  for (let i = 0; i < 3; i++) {
    deco(19.8 + i * 1.25, 0.85, 7.25, 20.85 + i * 1.25, 1.55, 7.35, 'metalDark', { ao: false });
    deco(19.85 + i * 1.25, 0.9, 7.22, 20.8 + i * 1.25, 1.5, 7.25, 'screen', { ao: false, cast: false, uvMode: 'local' });
  }
  for (let i = 0; i < 5; i++) box(18.5 + i * 0.62, 0, 9.15, 19.08 + i * 0.62, 2.1, 9.7, 'locker', { surface: 'metal', uvMode: 'local' });
  lampFixture(23, 4.85, 5, 2.4, 0.4, 'glowCool');
  markers.supplies.push({ x: 26.6, z: 1.6, yaw: 0 });
  // 大厅
  box(22, 0, 17.8, 26, 1.1, 18.8, 'counter', { surface: 'wood', uv: 2 });
  deco(21.9, 1.1, 17.7, 26.1, 1.18, 18.9, 'metalDark', { ao: false });
  for (const [x, z] of [[20.5, 27.5], [26.5, 27.5]]) {
    box(x - 1.1, 0, z - 0.5, x + 1.1, 0.5, z + 0.5, 'sofa', { surface: 'wood', uv: 1.5 });
    deco(x - 1.1, 0.5, z + 0.25, x + 1.1, 0.95, z + 0.5, 'sofa', { uv: 1.5 });
  }
  for (const [x, z] of [[19, 11], [27.2, 16]]) {
    B.cylinder(x, 0, z, 0.35, 0.7, 'planter', { seg: 14, uv: 1 });
    rock(x, 1.0, z, 0.42, 1, 1.1, 1, x + z); // 盆栽灌木（低模）
  }
  sign('sign_control', 17.65, 3.9, 16, 3.6, 0.9, -Math.PI / 2);
  lampFixture(23, 4.85, 15, 2.4, 0.4, 'glowCool');
  lampFixture(23, 4.85, 24, 2.4, 0.4, 'glowCool');
  point(23, 4.2, 20, 0xe9f1ff, 30, 14);
  // 办公区
  const desk = (x, z, rot) => {
    if (rot) box(x - 0.45, 0, z - 0.9, x + 0.45, 0.78, z + 0.9, 'desk', { surface: 'wood', uv: 1.5 });
    else box(x - 0.9, 0, z - 0.45, x + 0.9, 0.78, z + 0.45, 'desk', { surface: 'wood', uv: 1.5 });
    deco(x - 0.25, 0.78, z - 0.06, x + 0.25, 1.15, z + 0.0, 'metalDark', { ao: false, cast: false });
  };
  desk(31, 18.5); desk(33.2, 18.5); desk(31, 21.5); desk(33.2, 21.5);
  desk(37, 18); desk(36.5, 26, false); desk(30.5, 26.5);
  box(39.3, 0, 15, 39.94, 2.2, 19, 'locker', { surface: 'metal', uvMode: 'local' });
  markers.weaponPickups.push({ weapon: 'sniper', x: 36.5, top: 0.79, z: 26, yaw: 1.2 });
  lampFixture(34, 4.85, 19, 2.4, 0.4, 'glowCool');
  lampFixture(34, 4.85, 25, 2.4, 0.4, 'glowCool');
  point(34, 4.2, 22, 0xfff2e0, 26, 13);

  // ───────── R 反应堆大厅 ─────────
  const RH = { surface: 'concrete', uv: 4 };
  wallX(-14.4, 24.4, -16, 0.8, 0, 12, 'concrete', [{ a: 2, b: 8, top: 6 }], { ...RH, lining: { mat: 'metal', side: -1 }, frame: 'hazard' });
  wallZ(-44, -15.6, -14, 0.8, 0, 12, 'concrete', [{ a: -22, b: -19, top: 3.5 }], { ...RH, lining: { mat: 'metal', side: 1 } });
  wallZ(-44, -15.6, 24, 0.8, 0, 12, 'concrete', [{ a: -24, b: -21, top: 3.5 }], { ...RH, lining: { mat: 'metal', side: -1 } });
  box(-14.4, 7, -45.2, 24.4, 12.5, -44, 'concrete', RH);
  deco(-13.6, 0, -44, 23.6, 12, -43.94, 'metal', { cast: false });
  box(-14.4, 12, -45.2, 24.4, 12.5, -15.6, 'roof', { uv: 4 });
  deco(-13.6, -0.1, -43.94, 23.6, 0.015, -16.4, 'plateFloor', { uv: 3, ao: false, cast: false });
  for (const x of [-6, 2, 10, 18]) deco(x - 0.2, 11.3, -44, x + 0.2, 11.9, -16.4, 'metalDark', { cast: false, ao: false });
  sign('sign_reactor', 5, 8.4, -15.58, 7, 1.75, 0);
  // 反应堆主体
  B.cylinder(5, 0, -30, 3.6, 1.4, 'metalDark', { seg: 8, colliderScale: 0.97, uv: 2 });
  deco(1.2, 1.4, -30.15, 8.8, 1.48, -29.85, 'hazard', { ao: false, cast: false });
  W.addBox(3.1, 1.4, -31.9, 6.9, 11.2, -28.1, { surface: 'metal' });
  markers.reactor = { x: 5, y: 1.4, z: -30, r: 2.0, h: 9.8 };
  for (const y of [3.2, 5.8, 8.4]) {
    const g = new THREE.TorusGeometry(2.45, 0.16, 8, 32);
    g.rotateX(Math.PI / 2);
    g.translate(5, y, -30);
    B.geo(g, 'metalDark', { uvMode: 'keep', ao: false });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = 5 + Math.cos(a) * 2.5, z = -30 + Math.sin(a) * 2.5;
    deco(x - 0.12, 1.4, z - 0.12, x + 0.12, 11.4, z + 0.12, 'metalDark', { ao: false });
  }
  B.cylinder(5, 11.2, -30, 3.0, 0.8, 'metalDark', { seg: 16, collide: false });
  hpipe('x', 5, 23.6, 11.6, -30, 0.5, 'pipe');
  hpipe('x', -13.6, 5, 11.6, -30, 0.5, 'pipe');
  markers.hum.push({ x: 5, y: 4, z: -30, kind: 'reactor' });
  // 冷却塔
  const pylon = (x, z, id) => {
    B.cylinder(x, 0, z, 1.1, 0.6, 'metalDark', { seg: 12, colliderScale: 1.0 });
    B.cylinder(x, 0.6, z, 0.85, 7.4, 'tank', { seg: 16, colliderScale: 1.0, uv: 2 });
    for (const y of [2.0, 4.2, 6.4]) {
      const g = new THREE.TorusGeometry(0.92, 0.09, 6, 24);
      g.rotateX(Math.PI / 2);
      g.translate(x, y, z);
      B.geo(g, 'glowCyan', { uvMode: 'keep', ao: false, cast: false });
    }
    B.cylinder(x, 8, z, 0.5, 4, 'pipe', { seg: 10, collide: false });
    markers.pylons.push({ id, x, z, r: 2.4 });
  };
  pylon(-4, -24, 0);
  pylon(14, -24, 1);
  pylon(5, -37.5, 2);
  // 北侧高架走廊 + 两侧坡道
  box(-13.6, 4.2, -43.94, 23.6, 4.5, -40.4, 'plate', { surface: 'metal', uv: 2 });
  railing('x', -10.6, 20.6, -40.4, 4.5);
  B.ramp(-13.6, 0, -40.4, -10.6, 4.5, -26, 'z', -1, 'plate', { surface: 'metal', uv: 2 });
  B.ramp(20.6, 0, -40.4, 23.6, 4.5, -26, 'z', -1, 'plate', { surface: 'metal', uv: 2 });
  W.addBox(-10.6, 0, -40.4, -10.48, 5.6, -26, { flags: MOVE, surface: 'metal' });
  W.addBox(20.48, 0, -40.4, 20.6, 5.6, -26, { flags: MOVE, surface: 'metal' });
  for (const xr of [-10.54, 20.54]) {
    const len = Math.hypot(14.4, 4.5);
    const ang = Math.atan2(4.5, 14.4);
    rbox(xr, 2.25 + 1.0, -33.2, 0.07, 0.08, len, ang, 0, 0, 'rail', { ao: false, cast: false });
    rbox(xr, 2.25 + 0.5, -33.2, 0.05, 0.05, len, ang, 0, 0, 'rail', { ao: false, cast: false });
  }
  for (const x of [-6, 0, 10, 16]) box(x - 0.15, 0, -40.9, x + 0.15, 4.2, -40.6, 'metalDark', { surface: 'metal' });
  // 立柱
  for (const [x, z] of [[-8, -20], [18, -20], [-8, -34], [18, -34]]) {
    box(x - 0.6, 0, z - 0.6, x + 0.6, 12, z + 0.6, 'concrete', { surface: 'concrete', uv: 3 });
    deco(x - 0.65, 0, z - 0.65, x + 0.65, 1.2, z + 0.65, 'hazard', { ao: false });
  }
  // 控制台与掩体
  const consoleBox = (x0, z0, x1, z1) => {
    box(x0, 0, z0, x1, 1.05, z1, 'metalDark', { surface: 'metal' });
    deco(x0 + 0.08, 1.05, z0 + 0.08, x1 - 0.08, 1.09, z1 - 0.08, 'screen', { ao: false, cast: false, uvMode: 'local' });
  };
  consoleBox(-1.5, -20.6, 1.5, -19.6);
  consoleBox(9, -21.4, 12, -20.4);
  consoleBox(-7.6, -31, -6.9, -28);
  hpipe('x', -5.5, 0, 0.4, -33.2, 0.4, 'pipeYellow', { collide: true });
  hpipe('z', -38, -33, 0.4, 13, 0.4, 'pipeYellow', { collide: true });
  crate(15.8, -29.4);
  crate(17.1, -29.4, 0, 1.2, 'crateTan');
  crate(-6.2, -38.6);
  crate(-4.9, -38.6, 0, 1.2, 'crateTan');
  crate(-6.2, -38.6, 1.2, 0.8);
  barrel(11.6, -17.6);
  barrel(-12, -17.6);
  barrel(21.4, -42);
  for (const x of [-10, 0, 10, 20]) lampFixture(x, 11.25, -24, 3, 0.5, 'glowCool');
  for (const x of [-10, 0, 10, 20]) lampFixture(x, 11.25, -36, 3, 0.5, 'glowCool');
  point(5, 7, -30, 0x6fe8ff, 180, 30, { core: true });
  point(-6, 9, -22, 0xffd8a8, 40, 22);
  point(17, 9, -38, 0xffd8a8, 40, 22);
  // 正门卷帘（动态）
  const rdCol = W.addBox(2, 0, -16.35, 8, 6, -15.65, { surface: 'metal' });
  markers.doors.reactor = {
    collider: rdCol,
    nav: [1.5, -17, 8.5, -15],
    panels: [{ box: [2, 0, -16.3, 8, 6, -15.7], mat: 'shutter', slide: [0, 5.8, 0], scaleY: true }],
    duration: 3.5,
  };

  // ───────── 东北停机坪 ─────────
  const fence = (x0, x1) => {
    W.addBox(x0, 0, -16.06, x1, 3.2, -15.94, { flags: MOVE, surface: 'metal' });
    deco(x0, 0, -16.02, x1, 3.0, -15.98, 'fence', { ao: false, cast: true, uvMode: 'project', uv: 1.5 });
    deco(x0, 3.0, -16.05, x1, 3.08, -15.95, 'metalDark', { ao: false });
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 2.5))) {
      deco(x - 0.05, 0, -16.05, x + 0.05, 3.3, -15.95, 'metalDark', { ao: false });
    }
  };
  fence(24.4, 30);
  fence(34, 40);
  const fgCol = W.addBox(30, 0, -16.06, 34, 3.2, -15.94, { flags: MOVE, surface: 'metal' });
  markers.doors.fence = {
    collider: fgCol,
    nav: [29.5, -16.8, 34.5, -15.2],
    panels: [
      { box: [30, 0, -16.03, 34, 3.0, -15.97], mat: 'fence', slide: [3.9, 0, 0] },
      { box: [30, 2.95, -16.05, 34, 3.08, -15.95], mat: 'metalDark', slide: [3.9, 0, 0] },
      { box: [30, 0, -16.05, 30.1, 3.08, -15.95], mat: 'metalDark', slide: [3.9, 0, 0] },
    ],
    duration: 2.5,
  };
  box(26.5, 0, -37.5, 37.5, 0.2, -26.5, 'helipad', { uvMode: 'local', surface: 'metal' });
  markers.helipad = { x: 32, y: 0.2, z: -32, r: 5 };
  for (const [x, z] of [[26.7, -37.3], [37.3, -37.3], [26.7, -26.7], [37.3, -26.7], [32, -37.4], [32, -26.6], [26.6, -32], [37.4, -32]]) {
    deco(x - 0.12, 0.2, z - 0.12, x + 0.12, 0.32, z + 0.12, 'glowGreen', { ao: false, cast: false });
  }
  // 雷达桅杆（动态天线由 main 驱动）
  B.cylinder(39, 0, -39.5, 0.25, 7, 'metalDark', { seg: 8 });
  markers.props.push({ kind: 'radar', x: 39, y: 7.2, z: -39.5 });
  crate(26.5, -20);
  crate(27.8, -20, 0, 1.2, 'crateTan');
  crate(26.5, -21.3);
  crate(38.4, -24.5);
  barrel(36, -18.2);
  container(33, -43.8, true, 'cont_blue');
  point(32, 6, -32, 0xffe0b0, 0, 18, { heli: true });

  // ───────── 西北燃料库 ─────────
  for (const [x, z] of [[-33, -37], [-24.5, -37]]) {
    B.cylinder(x, 0, z, 2.7, 0.5, 'concreteDark', { seg: 20, colliderScale: 0.95 });
    B.cylinder(x, 0.5, z, 2.5, 6.4, 'tank', { seg: 24, colliderScale: 0.93, uv: 3 });
    const g = new THREE.SphereGeometry(2.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, 0.35, 1);
    g.translate(x, 6.9, z);
    B.geo(g, 'tank', { uvMode: 'project', uv: 3, ao: false });
    deco(x + 2.45, 0.5, z - 0.3, x + 2.6, 7.0, z + 0.3, 'rail', { ao: false });
    deco(x - 2.7, 3.2, z - 0.4, x - 2.45, 3.5, z + 0.4, 'hazard', { ao: false });
  }
  markers.hum.push({ x: -34, y: 1.4, z: -23, kind: 'generator' });
  box(-37, 0, -25, -31, 2.8, -21, 'generator', { surface: 'metal', uv: 2 });
  deco(-36.6, 2.8, -24.2, -35.4, 3.6, -23.0, 'metalDark');
  B.cylinder(-32.2, 2.8, -22, 0.25, 2.2, 'metalDark', { seg: 8, collide: false });
  hpipe('x', -33, -14.4, 3.6, -33.6, 0.4, 'pipe');
  hpipe('x', -24.5, -14.4, 3.0, -32.6, 0.3, 'pipeYellow');
  for (const x of [-20, -16]) deco(x - 0.12, 0, -34.0, x + 0.12, 3.6, -32.2, 'metalDark', { ao: false });
  W.addBox(-20.15, 0, -34.0, -19.85, 3.6, -32.2, { surface: 'metal' });
  W.addBox(-16.15, 0, -34.0, -15.85, 3.6, -32.2, { surface: 'metal' });
  container(-38.8, -19.5, false, 'cont_red');
  crate(-27, -25);
  crate(-25.7, -25, 0, 1.2, 'crateTan');
  crate(-27, -26.3);
  crate(-19, -29);
  crate(-17.7, -29.4, 0, 1.2, 'crateTan');
  sandbags(-24, -17.8, -20, -17);
  barrel(-29.6, -30.8);
  barrel(-30.3, -30.1);
  barrel(-17.8, -21);
  lightPole(-21, -42.8, 0.3, 1, true);
  point(-34, 3.2, -26.2, 0xffb070, 12, 7);
  lampFixture(-34, 2.85, -25.3, 1.4, 0.3, 'glowWarm');

  // ───────── 刷怪点 ─────────
  const sp = (id, x, z, y = 0) => (markers.spawns[id] = { x, y, z });
  sp('out_guard', 12, 35.6);
  sp('out_truck', -13, 40);
  sp('out_road', 2, 39);
  sp('out_rocks', -18, 47);
  sp('court_sw', -10, 24);
  sp('court_se', 12, 25);
  sp('court_mid', 0, 9);
  sp('court_n', 0, -12.5);
  sp('court_e', 30, -12);
  sp('court_w', -16, -6);
  sp('court_c2', 14, 14);
  sp('wh_mid', -28, 6.5);
  sp('wh_n', -28, -10);
  sp('wh_s', -27, 25.5);
  sp('wh_cat', -38.2, 10, 4.2);
  sp('wh_catn', -28, -10, 4.2);
  sp('ctrl_lobby', 22, 21);
  sp('ctrl_sec', 21, 4);
  sp('ctrl_office', 34, 24);
  sp('ctrl_server', 33, 12.6);
  sp('depot', -28, -29);
  sp('depot_w', -34.5, -15);
  sp('depot_n', -20, -42);
  sp('reac_w', -10, -22);
  sp('reac_e', 20, -30);
  sp('reac_s', 5, -19);
  sp('reac_walk_w', -8, -42, 4.5);
  sp('reac_walk_e', 16, -42, 4.5);
  sp('reac_walk_c', 5, -42, 4.5);
  sp('ne_yard', 32, -22);
  sp('ne_far', 30, -41);

  return markers;
}
