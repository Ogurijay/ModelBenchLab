// 室内家具：占用网格摆放 + 程序化家具库 + 按业态的楼层布局。
// 每栋房子的家具进一个独立 Builder（parent = 该栋的室内 Group，castShadow:false），由室内 LOD 按距离显隐。
// 摆放规则：楼梯区、楼梯前走道、门口通道、壁炉前都先在网格里封掉，保证"推门 → 走到楼梯 → 上楼"一路畅通。
import * as THREE from 'three';
import { boxGeo, cylGeo, coneGeo } from '../../core/geom.js';
import { mat4, wallsOf } from './shell.js';
import { wallPieces } from '../../core/geom.js';
import { STAIR, SLAB, WIN, STEP0, pick } from './styles.js';

const NC = { collide: false };
const PI = Math.PI;

// ---------- 几何缓存（Builder.add 会 clone，缓存只省构造开销）----------
const _geo = new Map();
const G = (key, make) => {
  let g = _geo.get(key);
  if (!g) _geo.set(key, (g = make()));
  return g;
};
const cyl = (r, h, seg = 10, rTop = r) => G(`c${r},${h},${seg},${rTop}`, () => cylGeo(r, h, seg, rTop));
const cylC = (r, h, seg = 10) => G(`cc${r},${h},${seg}`, () => cylGeo(r, h, seg).translate(0, -h / 2, 0));
const cone = (r, h, seg = 6) => G(`k${r},${h},${seg}`, () => coneGeo(r, h, seg));
const sphere = (r, a = 8, b = 6) => G(`s${r},${a},${b}`, () => new THREE.SphereGeometry(r, a, b));
const plane = (w, h) => G(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h));

// ---------- 壁炉火焰：Canvas 画的火舌 alpha 贴图 + 三片交叉面片，加色混合，update 里抖动 ----------
let _flame = null;
function flameAssets() {
  if (_flame) return _flame;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const tongue = (cx, w, h, a) => {
    const grd = g.createRadialGradient(cx, 236, 4, cx, 236 - h * 0.45, h * 0.75);
    grd.addColorStop(0, `rgba(255,250,210,${a})`);
    grd.addColorStop(0.35, `rgba(255,190,70,${a * 0.9})`);
    grd.addColorStop(0.7, `rgba(240,90,20,${a * 0.5})`);
    grd.addColorStop(1, 'rgba(200,40,10,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(cx - w, 246);
    g.quadraticCurveTo(cx - w * 1.1, 246 - h * 0.45, cx, 246 - h);
    g.quadraticCurveTo(cx + w * 1.1, 246 - h * 0.45, cx + w, 246);
    g.closePath();
    g.fill();
  };
  g.globalCompositeOperation = 'lighter';
  tongue(64, 44, 210, 0.85);
  tongue(38, 22, 140, 0.6);
  tongue(92, 24, 160, 0.6);
  tongue(64, 22, 120, 0.9);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  mat.name = 'houseFlame';
  const parts = [0, PI / 3, (2 * PI) / 3].map((a) => new THREE.PlaneGeometry(0.9, 0.9).translate(0, 0.45, 0).rotateY(a));
  const pos = [];
  const uv = [];
  const nor = [];
  for (const q of parts.map((x) => x.toNonIndexed())) {
    pos.push(...q.attributes.position.array);
    uv.push(...q.attributes.uv.array);
    nor.push(...q.attributes.normal.array);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  _flame = { mat, geo };
  return _flame;
}
export const FLAMES = [];
export function animateFlames(t) {
  for (const f of FLAMES) {
    if (!f.mesh.parent?.visible) continue;
    const n = Math.sin(t * 9.1 + f.ph) * 0.5 + Math.sin(t * 13.7 + f.ph * 2.3) * 0.3 + Math.sin(t * 23.3 + f.ph * 0.7) * 0.2;
    f.mesh.scale.set(f.sx * (1 + 0.06 * n), f.sy * (1 + 0.2 * n), f.sx * (1 - 0.05 * n));
    f.mesh.rotation.y = f.ry + 0.08 * Math.sin(t * 5.3 + f.ph);
  }
}

// ---------- 占用网格 ----------
class Room {
  constructor(x0, z0, x1, z1, cell = 0.25) {
    Object.assign(this, { x0, z0, x1, z1, c: cell });
    this.nx = Math.max(1, Math.ceil((x1 - x0) / cell));
    this.nz = Math.max(1, Math.ceil((z1 - z0) / cell));
    this.g = new Uint8Array(this.nx * this.nz);
    this.win = { front: [], back: [], left: [], right: [] };
  }
  _r(x0, z0, x1, z1) {
    const c = this.c;
    return [
      Math.max(0, Math.floor((x0 - this.x0) / c + 1e-6)),
      Math.max(0, Math.floor((z0 - this.z0) / c + 1e-6)),
      Math.min(this.nx - 1, Math.ceil((x1 - this.x0) / c - 1e-6) - 1),
      Math.min(this.nz - 1, Math.ceil((z1 - this.z0) / c - 1e-6) - 1),
    ];
  }
  block(x0, z0, x1, z1) {
    const [a, b, c, d] = this._r(x0, z0, x1, z1);
    for (let k = b; k <= d; k++) for (let i = a; i <= c; i++) this.g[k * this.nx + i] = 1;
  }
  free(x0, z0, x1, z1) {
    if (x0 < this.x0 - 1e-6 || z0 < this.z0 - 1e-6 || x1 > this.x1 + 1e-6 || z1 > this.z1 + 1e-6) return false;
    const [a, b, c, d] = this._r(x0, z0, x1, z1);
    for (let k = b; k <= d; k++) for (let i = a; i <= c; i++) if (this.g[k * this.nx + i]) return false;
    return true;
  }
}

// 贴墙摆放：返回 { x, z, ry }（房屋局部坐标；物件局部 +Z 朝室内）
function placeWall(room, R, w, d, { tall = false, walls, clear = 0.55 } = {}) {
  const order = walls || shuffle(R, ['back', 'left', 'right', 'front']);
  for (const wall of order) {
    const ns = wall === 'back' || wall === 'front';
    const lo = (ns ? room.x0 : room.z0) + w / 2 + 0.05;
    const hi = (ns ? room.x1 : room.z1) - w / 2 - 0.05;
    if (hi < lo) continue;
    const n = Math.floor((hi - lo) / 0.25) + 1;
    const start = Math.floor(R() * n);
    for (let j = 0; j < n; j++) {
      const a = lo + ((start + j) % n) * 0.25;
      if (tall && room.win[wall].some((wa) => Math.abs(wa - a) < (w + WIN.w) / 2 + 0.08)) continue;
      let rect;
      let front;
      let pos;
      if (wall === 'back') {
        rect = [a - w / 2, room.z0, a + w / 2, room.z0 + d];
        front = [rect[0], rect[3], rect[2], rect[3] + clear];
        pos = { x: a, z: room.z0 + d / 2 + 0.01, ry: 0 };
      } else if (wall === 'front') {
        rect = [a - w / 2, room.z1 - d, a + w / 2, room.z1];
        front = [rect[0], rect[1] - clear, rect[2], rect[1]];
        pos = { x: a, z: room.z1 - d / 2 - 0.01, ry: PI };
      } else if (wall === 'left') {
        rect = [room.x0, a - w / 2, room.x0 + d, a + w / 2];
        front = [rect[2], rect[1], rect[2] + clear, rect[3]];
        pos = { x: room.x0 + d / 2 + 0.01, z: a, ry: PI / 2 };
      } else {
        rect = [room.x1 - d, a - w / 2, room.x1, a + w / 2];
        front = [rect[0] - clear, rect[1], rect[0], rect[3]];
        pos = { x: room.x1 - d / 2 - 0.01, z: a, ry: -PI / 2 };
      }
      if (!room.free(...rect)) continue;
      if (clear > 0 && !room.free(...clampRect(room, front))) continue;
      room.block(...rect);
      if (clear > 0) room.block(...clampRect(room, front));
      pos.wall = wall;
      return pos;
    }
  }
  return null;
}

function clampRect(room, [a, b, c, d]) {
  return [Math.max(room.x0, a), Math.max(room.z0, b), Math.min(room.x1, c), Math.min(room.z1, d)];
}

// 室内空地摆放（桌椅组、铁砧、地毯……）
function placeFree(room, R, w, d, { margin = 0.45, rotate = true, block = true } = {}) {
  for (let t = 0; t < 70; t++) {
    const rot = rotate && R() < 0.5;
    const ww = rot ? d : w;
    const dd = rot ? w : d;
    const lx = room.x0 + ww / 2 + margin;
    const hx = room.x1 - ww / 2 - margin;
    const lz = room.z0 + dd / 2 + margin;
    const hz = room.z1 - dd / 2 - margin;
    if (hx < lx || hz < lz) continue;
    // 前几次尽量靠房间中部
    const k = t < 25 ? 0.5 : 1;
    const x = (lx + hx) / 2 + (R() - 0.5) * (hx - lx) * k;
    const z = (lz + hz) / 2 + (R() - 0.5) * (hz - lz) * k;
    if (!room.free(x - ww / 2 - margin, z - dd / 2 - margin, x + ww / 2 + margin, z + dd / 2 + margin)) continue;
    if (block) room.block(x - ww / 2 - margin * 0.4, z - dd / 2 - margin * 0.4, x + ww / 2 + margin * 0.4, z + dd / 2 + margin * 0.4);
    return { x, z, ry: rot ? PI / 2 : 0 };
  }
  return null;
}

function shuffle(R, a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// ======================================================================
// 家具库：fn(F, M, R, o, L)；F 是物件局部帧（原点 = 占地中心、y = 地板顶，+Z 朝室内），L = 光源收集器
// ======================================================================
const fabric = (M, R) => (R() < 0.5 ? M.fabricRed : M.fabricBlue);

function chair(F, M) {
  F.box(M.planks, 0, 0.42, 0, 0.44, 0.05, 0.44, NC);
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) F.box(M.timber, x, 0, z, 0.05, 0.42, 0.05, NC);
  F.box(M.timber, 0, 0.47, -0.2, 0.44, 0.55, 0.05, NC);
}
function stool(F, M) {
  F.add(M.planks, cyl(0.2, 0.06, 10), mat4(0, 0.44, 0));
  F.box(M.timber, 0, 0, 0, 0.09, 0.44, 0.09, NC);
  F.box(M.timber, 0, 0, 0, 0.32, 0.04, 0.06, NC);
}
function tableTop(F, M, R, w, d, h = 0.74, deco = true) {
  F.box(M.planks, 0, h, 0, w, 0.06, d, NC);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) F.box(M.timber, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08), 0.08, h, 0.08, NC);
  F.collider(0, 0, 0, w, h + 0.06, d);
  if (!deco) return;
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const x = (R() - 0.5) * (w - 0.3);
    const z = (R() - 0.5) * (d - 0.25);
    const t = R();
    if (t < 0.35) F.add(M.iron, cyl(0.05, 0.12, 8), mat4(x, h + 0.06, z)); // 杯
    else if (t < 0.6) F.add(M.plaster, cyl(0.13, 0.02, 10), mat4(x, h + 0.06, z)); // 盘
    else if (t < 0.8) F.box(M.planks, x, h + 0.06, z, 0.25, 0.1, 0.14, NC); // 面包 / 木匣
    else F.add(M.gold, cyl(0.06, 0.16, 8, 0.04), mat4(x, h + 0.06, z)); // 金杯
  }
}

const ITEMS = {
  bed: {
    w: 1.25, d: 2.1,
    fn(F, M, R, o) {
      const w = o.w || 1.25;
      const d = o.d || 2.1;
      F.box(M.timber, 0, 0, 0, w, 0.4, d, NC);
      F.box(M.plaster, 0, 0.4, 0.02, w - 0.1, 0.16, d - 0.16, NC);
      F.box(o.fab || fabric(M, R), 0, 0.5, d / 2 - d * 0.33, w - 0.04, 0.09, d * 0.62, NC);
      F.box(M.plaster, 0, 0.56, -d / 2 + 0.3, w * 0.7, 0.13, 0.32, NC);
      F.box(M.timber, 0, 0, -d / 2 + 0.04, w + 0.06, 1.1, 0.08, NC);
      F.box(M.timber, 0, 0, d / 2 - 0.04, w + 0.06, 0.65, 0.08, NC);
      F.collider(0, 0, 0, w, 0.6, d);
    },
  },
  cot: { w: 0.9, d: 1.8, fn: (F, M, R) => ITEMS.bed.fn(F, M, R, { w: 0.9, d: 1.8 }) },
  cupboard: {
    w: 1.2, d: 0.55, tall: true,
    fn(F, M, R) {
      F.box(M.timber, 0, 0, 0, 1.2, 2.0, 0.55);
      for (const s of [-1, 1]) {
        F.box(M.planks, s * 0.29, 0.15, 0.285, 0.52, 1.7, 0.03, NC);
        F.box(M.gold, s * 0.06, 1.0, 0.31, 0.04, 0.14, 0.03, NC);
      }
      F.box(M.timber, 0, 2.0, 0, 1.3, 0.08, 0.62, NC);
      if (R() < 0.6) F.add(M.plaster, cyl(0.1, 0.2, 8), mat4(0.3, 2.08, 0));
    },
  },
  chest: {
    w: 0.9, d: 0.52,
    fn(F, M, R) {
      F.box(M.planks, 0, 0, 0, 0.9, 0.4, 0.52, NC);
      F.box(M.timber, 0, 0.4, 0, 0.93, 0.14, 0.55, NC);
      for (const s of [-1, 1]) F.box(M.iron, s * 0.3, 0, 0, 0.06, 0.56, 0.56, NC);
      F.box(M.gold, 0, 0.32, 0.28, 0.1, 0.12, 0.03, NC);
      void R;
    },
  },
  shelf: {
    w: 1.6, d: 0.45, tall: true,
    fn(F, M, R, o) {
      shelfFrame(F, M, 1.6, 0.45, 2.0);
      const levels = [0.12, 0.62, 1.12, 1.62];
      for (const y of levels) shelfGoods(F, M, R, 1.6, y + 0.04, o.goods || 'mixed');
    },
  },
  bookshelf: {
    w: 1.6, d: 0.4, tall: true,
    fn(F, M, R) {
      shelfFrame(F, M, 1.6, 0.4, 2.2);
      const mats = [M.fabricRed, M.fabricBlue, M.timber, M.planks, M.fabricRed, M.fabricBlue, M.gold];
      for (const y of [0.12, 0.64, 1.16, 1.68]) {
        let x = -0.72;
        while (x < 0.66) {
          const bw = 0.12 + R() * 0.24;
          if (x + bw > 0.72) break;
          const bh = 0.24 + R() * 0.14;
          F.box(pick(R, mats), x + bw / 2, y + 0.04, 0.02, bw - 0.015, bh, 0.26, NC);
          x += bw + (R() < 0.15 ? 0.1 : 0.005);
        }
      }
    },
  },
  barrel: {
    w: 0.7, d: 0.7,
    fn(F, M) {
      F.add(M.planks, cyl(0.33, 0.9, 12), mat4(0, 0, 0));
      for (const y of [0.12, 0.74]) F.add(M.iron, cyl(0.345, 0.05, 12), mat4(0, y, 0));
      F.collider(0, 0, 0, 0.66, 0.9, 0.66);
    },
  },
  barrels: {
    w: 1.5, d: 0.75,
    fn(F, M, R) {
      for (const x of [-0.37, 0.37]) {
        F.sub(x, 0, 0).add(M.planks, cyl(0.33, 0.9, 12));
        for (const y of [0.12, 0.74]) F.add(M.iron, cyl(0.345, 0.05, 12), mat4(x, y, 0));
      }
      if (R() < 0.5) F.add(M.planks, cyl(0.25, 0.6, 10), mat4(0, 0.9, 0));
      F.collider(0, 0, 0, 1.45, 0.9, 0.7);
    },
  },
  crate: {
    w: 0.75, d: 0.75,
    fn(F, M, R) {
      crate(F, M, 0, 0, 0, 0.7);
      if (R() < 0.5) crate(F, M, (R() - 0.5) * 0.1, 0.7, (R() - 0.5) * 0.1, 0.5);
      F.collider(0, 0, 0, 0.7, 0.7, 0.7);
    },
  },
  crates: {
    w: 1.6, d: 0.8,
    fn(F, M, R) {
      crate(F, M, -0.4, 0, 0, 0.75);
      crate(F, M, 0.42, 0, 0.02, 0.7);
      crate(F, M, -0.35, 0.75, 0, 0.55);
      if (R() < 0.5) sack(F, M, 0.4, 0.7, 0, 0.8);
      F.collider(0, 0, 0, 1.55, 0.75, 0.75);
    },
  },
  sacks: {
    w: 1.2, d: 0.7,
    fn(F, M) {
      sack(F, M, -0.3, 0, 0.02, 1);
      sack(F, M, 0.3, 0, -0.03, 0.95);
      sack(F, M, 0.02, 0, 0.22, 0.75);
    },
  },
  rug: {
    w: 2.4, d: 1.6,
    fn(F, M, R, o) {
      F.box(o.mat || M.carpet, 0, 0.005, 0, o.w || 2.4, 0.015, o.d || 1.6, NC);
    },
  },
  tableSet: {
    w: 1.6, d: 2.2,
    fn(F, M, R, o) {
      const w = o.tw || 1.5;
      const d = 0.85;
      tableTop(F, M, R, w, d);
      const n = o.chairs ?? 4;
      const xs = n >= 4 ? [-w / 4, w / 4] : [0];
      for (const x of xs) {
        for (const s of [-1, 1]) {
          const C = F.sub(x, 0, s * (d / 2 + 0.3), s > 0 ? PI : 0);
          if (o.stools) stool(C, M);
          else chair(C, M);
        }
      }
      if (o.candle !== false && R() < 0.7) candle(F, M, 0, 0.8, 0, o.L, 0.35);
    },
  },
  roundTable: {
    w: 2.0, d: 2.0,
    fn(F, M, R, o) {
      F.add(M.planks, cyl(0.6, 0.06, 14), mat4(0, 0.72, 0));
      F.add(M.timber, cyl(0.08, 0.72, 8), mat4(0, 0, 0));
      F.add(M.timber, cyl(0.3, 0.05, 10), mat4(0, 0, 0));
      F.collider(0, 0, 0, 1.0, 0.78, 1.0);
      const n = 3 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2 + R() * 0.3;
        stool(F.sub(Math.sin(a) * 0.88, 0, Math.cos(a) * 0.88, a), M);
      }
      for (let i = 0; i < 3; i++) {
        const a = R() * PI * 2;
        F.add(M.iron, cyl(0.05, 0.13, 8), mat4(Math.sin(a) * 0.35, 0.78, Math.cos(a) * 0.35));
      }
      if (o.L && R() < 0.5) candle(F, M, 0, 0.78, 0, o.L, 0.3);
    },
  },
  counter: {
    w: 2.4, d: 1.75,
    fn(F, M, R, o) {
      // 后墙货架 + 0.6 m 柜台后通道 + 柜台（朝室内）
      const w = o.cw || 2.4;
      shelfFrame(F.sub(0, 0, -0.65), M, w, 0.45, 2.0);
      for (const y of [0.12, 0.62, 1.12, 1.62]) shelfGoods(F.sub(0, 0, -0.65), M, R, w, y + 0.04, o.goods || 'mixed');
      const C = F.sub(0, 0, 0.52);
      C.box(M.planks, 0, 0, 0, w, 0.95, 0.62);
      C.box(M.timber, 0, 0.95, 0.02, w + 0.1, 0.06, 0.72, NC);
      for (let x = -w / 2 + 0.3; x < w / 2 - 0.2; x += 0.6) C.box(M.timber, x, 0.1, 0.315, 0.08, 0.75, 0.02, NC);
      const top = o.top || 'shop';
      if (top === 'gold') {
        for (let i = 0; i < 4; i++) goldStack(C, M, -w / 2 + 0.4 + i * ((w - 0.8) / 3), 1.01, 0);
      } else if (top === 'mugs') {
        for (let i = 0; i < 6; i++) C.add(M.iron, cyl(0.05, 0.13, 8), mat4(-w / 2 + 0.3 + R() * (w - 0.6), 1.01, (R() - 0.5) * 0.4));
      } else {
        C.add(M.gold, cyl(0.12, 0.03, 10), mat4(-w / 2 + 0.4, 1.01, 0));
        C.box(M.gold, -w / 2 + 0.4, 1.04, 0, 0.03, 0.3, 0.03, NC);
        C.box(M.plaster, w / 2 - 0.5, 1.01, 0, 0.35, 0.04, 0.25, NC);
        C.add(M.gold, cyl(0.04, 0.05, 8), mat4(0.1, 1.01, 0.1));
      }
    },
  },
  bar: {
    w: 3.4, d: 1.85,
    fn(F, M, R, o) {
      const w = o.cw || 3.4;
      // 后架：下层横放酒桶，上层酒瓶
      const S = F.sub(0, 0, -0.65);
      S.box(M.timber, 0, 0, -0.2, w, 2.1, 0.05, NC);
      S.box(M.planks, 0, 0.95, 0, w, 0.05, 0.45, NC);
      S.box(M.planks, 0, 1.5, 0.05, w, 0.04, 0.35, NC);
      S.collider(0, 0, 0, w, 2.1, 0.45);
      const nk = Math.floor(w / 0.8);
      for (let i = 0; i < nk; i++) {
        const x = -w / 2 + 0.4 + i * ((w - 0.8) / Math.max(1, nk - 1));
        S.add(M.planks, cylC(0.27, 0.42, 12), mat4(x, 0.3, 0.02, PI / 2, 0, 0));
        S.add(M.iron, cylC(0.28, 0.04, 12), mat4(x, 0.3, 0.12, PI / 2, 0, 0));
      }
      for (let i = 0; i < w / 0.18; i++) {
        const x = -w / 2 + 0.12 + i * 0.18;
        const m = pick(R, [M.fabricBlue, M.fabricRed, M.gold, M.iron]);
        S.add(m, cyl(0.045, 0.24, 6), mat4(x, 1.0, 0.05));
        if (R() < 0.6) S.add(m, cyl(0.04, 0.2, 6), mat4(x + 0.05, 1.54, 0.08));
      }
      // 吧台
      const C = F.sub(0, 0, 0.52);
      C.box(M.timber, 0, 0, 0, w, 1.0, 0.62);
      C.box(M.planks, 0, 1.0, 0.02, w + 0.12, 0.07, 0.75, NC);
      C.box(M.iron, 0, 0.08, 0.33, w, 0.05, 0.05, NC);
      for (let i = 0; i < 6; i++) C.add(M.iron, cyl(0.055, 0.14, 8), mat4(-w / 2 + 0.3 + R() * (w - 0.6), 1.07, (R() - 0.5) * 0.4));
      // 吧台凳
      for (let x = -w / 2 + 0.5; x < w / 2 - 0.3; x += 0.85) stool(F.sub(x, 0, 1.15), M);
    },
  },
  anvil: {
    w: 1.0, d: 0.8,
    fn(F, M) {
      F.add(M.timber, cyl(0.3, 0.48, 8), mat4(0, 0, 0));
      F.box(M.iron, 0, 0.48, 0, 0.3, 0.24, 0.22, NC);
      F.box(M.iron, -0.05, 0.72, 0, 0.62, 0.15, 0.25, NC);
      F.add(M.iron, cone(0.08, 0.3, 6), mat4(0.4, 0.795, 0, 0, 0, -PI / 2));
      F.box(M.iron, -0.1, 0.87, 0.05, 0.3, 0.04, 0.05, NC); // 锤
      F.box(M.timber, 0.1, 0.87, 0.05, 0.3, 0.03, 0.03, NC);
      F.collider(0, 0, 0, 0.62, 0.87, 0.4);
    },
  },
  forge: {
    w: 1.7, d: 1.3, tall: true,
    fn(F, M, R, o) {
      F.box(M.stoneDark, 0, 0, 0, 1.6, 0.85, 1.2);
      F.box(M.fire, 0, 0.85, 0.05, 1.1, 0.05, 0.8, NC);
      for (const [x, z] of [[-0.25, 0], [0.2, 0.15], [0.05, -0.15]]) F.add(M.fire, cone(0.14, 0.4, 6), mat4(x, 0.88, z));
      F.box(M.stoneGrey, 0, 1.9, -0.05, 1.7, 0.6, 1.3, NC); // 炉罩
      const ceil = o.ceil ?? 3.1;
      F.box(M.stoneGrey, 0, 2.5, -0.25, 0.7, Math.max(0.2, ceil - 2.5), 0.7, NC); // 烟道
      for (const s of [-1, 1]) F.box(M.stoneDark, s * 0.75, 0.85, -0.45, 0.12, 1.05, 0.12, NC);
      F.box(M.planks, 1.05, 0.5, 0.2, 0.4, 0.18, 0.7, NC); // 风箱
      F.box(M.fabricRed, 1.05, 0.68, 0.2, 0.34, 0.12, 0.6, NC);
      o.L?.(0, 1.3, 0.7, { color: 0xff6a20, intensity: 1.3, range: 10, kind: 'forge', flicker: true });
    },
  },
  toolrack: {
    w: 1.5, d: 0.2, tall: true,
    fn(F, M, R) {
      F.box(M.timber, 0, 0.9, -0.07, 1.5, 1.0, 0.05, NC);
      for (let i = 0; i < 5; i++) {
        const x = -0.55 + i * 0.28;
        const kind = R();
        F.box(M.timber, x, 1.0, -0.02, 0.035, 0.5, 0.035, NC);
        if (kind < 0.5) F.box(M.iron, x, 1.45, -0.02, 0.14, 0.07, 0.07, NC);
        else F.box(M.iron, x, 1.2, -0.02, 0.08, 0.35, 0.02, NC);
      }
    },
  },
  workbench: {
    w: 1.8, d: 0.75,
    fn(F, M, R) {
      tableTop(F, M, R, 1.8, 0.75, 0.86, false);
      F.box(M.planks, 0, 0.2, 0, 1.6, 0.04, 0.65, NC);
      F.box(M.iron, -0.55, 0.92, 0.1, 0.25, 0.12, 0.15, NC); // 台钳
      F.box(M.iron, 0.3, 0.92, -0.1, 0.4, 0.02, 0.25, NC);
      F.box(M.timber, 0.6, 0.92, 0.12, 0.3, 0.04, 0.04, NC);
      crate(F, M, -0.4, 0.24, 0, 0.4);
    },
  },
  weaponrack: {
    w: 1.7, d: 0.5, tall: true,
    fn(F, M, R) {
      F.box(M.timber, 0, 0, 0, 1.6, 0.1, 0.45, NC);
      F.box(M.timber, 0, 1.3, -0.12, 1.6, 0.07, 0.07, NC);
      for (const s of [-1, 1]) F.box(M.timber, s * 0.77, 0, -0.12, 0.07, 1.4, 0.07, NC);
      for (let i = 0; i < 5; i++) {
        const x = -0.6 + i * 0.3;
        const spear = R() < 0.3;
        F.box(spear ? M.timber : M.iron, x, 0.1, 0.02, 0.05, spear ? 1.7 : 1.05, 0.015, { collide: false, rx: -0.12 });
        if (spear) F.add(M.iron, cone(0.04, 0.2, 4), mat4(x, 1.78, -0.18));
        else F.box(M.gold, x, 1.12, -0.11, 0.22, 0.04, 0.04, NC);
      }
      F.collider(0, 0, 0, 1.6, 1.5, 0.45);
      // 墙上的盾
      for (const s of [-1, 1]) F.add(pick(R, [M.fabricRed, M.fabricBlue]), cylC(0.3, 0.05, 12), mat4(s * 0.45, 1.85, -0.2, PI / 2, 0, 0));
    },
  },
  armorstand: {
    w: 0.7, d: 0.6,
    fn(F, M, R) {
      F.box(M.timber, 0, 0, 0, 0.5, 0.06, 0.5, NC);
      F.box(M.timber, 0, 0.06, 0, 0.06, 1.2, 0.06, NC);
      F.add(M.iron, cyl(0.2, 0.62, 10, 0.27), mat4(0, 0.95, 0));
      F.box(R() < 0.5 ? M.gold : M.iron, 0, 1.5, 0, 0.72, 0.12, 0.3, NC);
      F.add(M.iron, sphere(0.15, 10, 8), mat4(0, 1.75, 0));
      F.add(M.fabricBlue, plane(0.4, 0.55), mat4(0, 0.95, 0.28));
      F.collider(0, 0, 0, 0.5, 1.8, 0.5);
    },
  },
  dummy: {
    w: 0.9, d: 0.7,
    fn(F, M) {
      F.box(M.timber, 0, 0, 0, 0.5, 0.08, 0.5, NC);
      F.box(M.timber, 0, 0, 0, 0.08, 1.5, 0.08, NC);
      F.add(M.planks, cyl(0.2, 0.7, 8, 0.22), mat4(0, 0.8, 0));
      F.add(M.plaster, sphere(0.16, 8, 6), mat4(0, 1.65, 0));
      F.box(M.timber, 0, 1.32, 0, 0.85, 0.08, 0.08, NC);
      F.collider(0, 0, 0, 0.45, 1.8, 0.45);
    },
  },
  desk: {
    w: 1.4, d: 1.3,
    fn(F, M, R, o) {
      const D = F.sub(0, 0, -0.25);
      tableTop(D, M, R, 1.3, 0.7, 0.76, false);
      D.box(M.plaster, -0.2, 0.82, 0.02, 0.32, 0.01, 0.22, NC);
      D.box(M.plaster, 0.1, 0.82, -0.05, 0.28, 0.01, 0.2, { collide: false, ry: 0.3 });
      D.add(M.iron, cyl(0.04, 0.07, 6), mat4(0.4, 0.82, -0.15));
      D.box(M.timber, -0.45, 0.82, -0.15, 0.22, 0.3, 0.16, NC);
      candle(D, M, 0.45, 0.82, 0.12, o.L, 0.4);
      chair(F.sub(0, 0, 0.35, PI), M);
    },
  },
  orb: {
    w: 0.7, d: 0.7,
    fn(F, M, R, o) {
      F.box(M.stoneTrim, 0, 0, 0, 0.5, 0.1, 0.5, NC);
      F.box(M.stoneTrim, 0, 0.1, 0, 0.3, 0.95, 0.3, NC);
      F.add(M.gold, cyl(0.2, 0.05, 12), mat4(0, 1.05, 0));
      F.add(M.arcane, sphere(0.18, 14, 10), mat4(0, 1.25, 0));
      F.collider(0, 0, 0, 0.4, 1.2, 0.4);
      o.L?.(0, 1.3, 0, { color: 0xa070ff, intensity: 0.8, range: 7, kind: 'arcane', flicker: false });
    },
  },
  lectern: {
    w: 0.8, d: 0.7,
    fn(F, M) {
      F.box(M.timber, 0, 0, 0, 0.45, 0.06, 0.4, NC);
      F.box(M.timber, 0, 0.06, 0, 0.12, 1.0, 0.12, NC);
      F.box(M.planks, 0, 1.02, 0, 0.55, 0.05, 0.42, { collide: false, rx: 0.35 });
      F.box(M.plaster, 0, 1.08, 0.0, 0.46, 0.03, 0.32, { collide: false, rx: 0.35 });
      F.collider(0, 0, 0, 0.45, 1.1, 0.4);
    },
  },
  candlestand: {
    w: 0.5, d: 0.5,
    fn(F, M, R, o) {
      F.box(M.iron, 0, 0, 0, 0.32, 0.04, 0.32, NC);
      F.box(M.iron, 0, 0.04, 0, 0.04, 1.36, 0.04, NC);
      F.add(M.iron, cyl(0.12, 0.03, 8), mat4(0, 1.4, 0));
      candle(F, M, 0, 1.43, 0, o.L, 0.6);
    },
  },
  sconce: {
    w: 0.4, d: 0.12, tall: true,
    fn(F, M, R, o) {
      F.box(M.iron, 0, 1.75, -0.04, 0.14, 0.24, 0.04, NC);
      F.box(M.iron, 0, 1.8, 0.04, 0.04, 0.04, 0.14, NC);
      candle(F, M, 0, 1.84, 0.1, o.L, 0.7);
    },
  },
  cauldron: {
    w: 1.2, d: 1.2,
    fn(F, M, R, o) {
      F.add(M.iron, cyl(0.42, 0.5, 12, 0.48), mat4(0, 0.22, 0));
      F.add(M.arcane, cyl(0.43, 0.02, 12), mat4(0, 0.66, 0));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        F.box(M.iron, Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32, 0.06, 0.25, 0.06, NC);
      }
      F.box(M.stoneDark, 0, 0, 0, 0.5, 0.08, 0.5, NC);
      F.add(M.fire, cone(0.12, 0.2, 5), mat4(0, 0.06, 0));
      F.collider(0, 0, 0, 0.9, 0.75, 0.9);
      o.L?.(0, 1.0, 0, { color: 0xb070ff, intensity: 0.7, range: 6, kind: 'arcane', flicker: true });
    },
  },
  alchemyTable: {
    w: 1.6, d: 0.8,
    fn(F, M, R) {
      tableTop(F, M, R, 1.6, 0.75, 0.8, false);
      for (let i = 0; i < 7; i++) {
        const m = pick(R, [M.arcane, M.fabricRed, M.fabricBlue, M.gold, M.arcane]);
        const x = -0.65 + i * 0.21;
        const z = (R() - 0.5) * 0.4;
        const r = 0.05 + R() * 0.04;
        F.add(m, sphere(r, 8, 6), mat4(x, 0.86 + r * 0.6, z));
        F.add(M.plaster, cyl(0.018, 0.12, 5), mat4(x, 0.86 + r * 1.4, z));
      }
      F.box(M.iron, 0.55, 0.86, -0.25, 0.04, 0.4, 0.04, NC);
    },
  },
  vault: {
    w: 1.5, d: 1.0, tall: true,
    fn(F, M) {
      F.box(M.iron, 0, 0, 0, 1.4, 1.9, 0.9);
      F.add(M.gold, cylC(0.32, 0.05, 16), mat4(0, 1.0, 0.47, PI / 2, 0, 0));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI;
        F.box(M.gold, 0, 0.98, 0.5, 0.7, 0.04, 0.04, { collide: false, rz: a });
      }
      for (const x of [-0.6, 0.6]) for (const y of [0.2, 1.7]) F.add(M.gold, sphere(0.05, 6, 4), mat4(x, y, 0.46));
    },
  },
  wallBanner: {
    w: 1.1, d: 0.1, tall: true,
    fn(F, M) {
      F.box(M.gold, 0, 2.6, -0.02, 1.1, 0.05, 0.05, NC);
      F.add(M.banner, plane(0.95, 2.0), mat4(0, 1.6, 0.0));
    },
  },
  mannequin: {
    w: 0.7, d: 0.6,
    fn(F, M, R) {
      F.add(M.timber, cyl(0.22, 0.05, 10), mat4(0, 0, 0));
      F.box(M.timber, 0, 0.05, 0, 0.05, 0.85, 0.05, NC);
      F.add(fabric(M, R), cyl(0.22, 0.75, 10, 0.17), mat4(0, 0.85, 0));
      F.add(R() < 0.5 ? M.fabricBlue : M.plaster, cyl(0.38, 0.45, 12, 0.22), mat4(0, 0.45, 0));
      F.add(M.planks, sphere(0.08, 6, 4), mat4(0, 1.65, 0));
      F.collider(0, 0, 0, 0.5, 1.6, 0.5);
    },
  },
  clothTable: {
    w: 1.8, d: 0.9,
    fn(F, M, R) {
      tableTop(F, M, R, 1.8, 0.9, 0.8, false);
      for (let i = 0; i < 5; i++) {
        F.add(pick(R, [M.fabricRed, M.fabricBlue, M.plaster, M.carpet]), cylC(0.09, 0.8, 10), mat4(-0.7 + i * 0.35, 0.95, (R() - 0.5) * 0.2, PI / 2, 0, 0));
      }
      F.box(M.iron, 0.4, 0.86, 0.3, 0.25, 0.02, 0.06, NC); // 剪刀
    },
  },
  mapTable: {
    w: 2.2, d: 1.4,
    fn(F, M, R) {
      tableTop(F, M, R, 2.0, 1.2, 0.8, false);
      F.box(M.plaster, 0, 0.86, 0, 1.8, 0.01, 1.0, NC);
      F.box(M.fabricBlue, -0.3, 0.87, 0.1, 0.7, 0.005, 0.5, NC);
      for (let i = 0; i < 6; i++) F.add(i % 2 ? M.gold : M.fabricRed, cyl(0.03, 0.08, 6), mat4((R() - 0.5) * 1.6, 0.87, (R() - 0.5) * 0.8));
      for (const s of [-1, 1]) chair(F.sub(s * 0.6, 0, s * 0.95, s > 0 ? PI : 0), M);
    },
  },
  longTable: {
    w: 3.6, d: 2.3,
    fn(F, M, R, o) {
      const w = 3.4;
      tableTop(F, M, R, w, 1.0, 0.76, true);
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) chair(F.sub(-w / 2 + 0.45 + i * ((w - 0.9) / 3), 0, s * 0.82, s > 0 ? PI : 0), M);
      candle(F, M, -0.6, 0.82, 0, o.L, 0.35);
      candle(F, M, 0.6, 0.82, 0, null);
    },
  },
  gear: {
    w: 1.2, d: 0.15, tall: true,
    fn(F, M) {
      const g = F.sub(0, 1.7, -0.02);
      g.add(M.iron, cylC(0.45, 0.1, 14), mat4(0, 0, 0, PI / 2, 0, 0));
      g.add(M.gold, cylC(0.12, 0.14, 8), mat4(0, 0, 0, PI / 2, 0, 0));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * PI * 2;
        g.box(M.iron, Math.cos(a) * 0.5, Math.sin(a) * 0.5 - 0.06, 0, 0.14, 0.12, 0.1, { collide: false, rz: a });
      }
    },
  },
  bench: {
    w: 1.8, d: 0.45,
    fn(F, M) {
      F.box(M.planks, 0, 0.42, 0, 1.8, 0.06, 0.4, NC);
      for (const s of [-1, 1]) F.box(M.timber, s * 0.75, 0, 0, 0.08, 0.42, 0.36, NC);
    },
  },
  arcaneCircle: {
    w: 2.4, d: 2.4,
    fn(F, M, R, o) {
      F.add(M.stoneDark, cyl(1.1, 0.02, 24), mat4(0, 0, 0));
      F.add(M.arcane, cyl(1.0, 0.025, 24), mat4(0, 0, 0));
      F.add(M.stoneDark, cyl(0.85, 0.03, 24), mat4(0, 0, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2;
        candle(F, M, Math.sin(a) * 1.15, 0, Math.cos(a) * 1.15, i === 0 ? o.L : null, 0.4);
      }
    },
  },
};

// 麻袋：鼓形袋身（上口收窄）+ 扎口 + 系绳
function sack(F, M, x, y, z, s) {
  const mat = M.burlap || M.plaster;
  F.add(mat, cyl(0.25 * s, 0.42 * s, 10, 0.2 * s), mat4(x, y, z));
  F.add(mat, cyl(0.2 * s, 0.08 * s, 10, 0.1 * s), mat4(x, y + 0.42 * s, z));
  F.add(mat, cyl(0.07 * s, 0.1 * s, 8, 0.1 * s), mat4(x, y + 0.5 * s, z));
  F.add(M.timber, cyl(0.075 * s, 0.03 * s, 8), mat4(x, y + 0.51 * s, z));
}

function crate(F, M, x, y, z, s) {
  F.box(M.planks, x, y, z, s, s, s, NC);
  for (const a of [-1, 1]) for (const b of [-1, 1]) F.box(M.timber, x + a * (s / 2 - 0.03), y, z + b * (s / 2 - 0.03), 0.065, s + 0.005, 0.065, NC);
  F.box(M.timber, x, y + s * 0.45, z, s + 0.02, 0.08, s + 0.02, NC);
}
function goldStack(F, M, x, y, z) {
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 3 - r; i++) F.box(M.gold, x + (i - (2 - r) / 2) * 0.13, y + r * 0.055, z, 0.11, 0.055, 0.22, NC);
  }
}
function shelfFrame(F, M, w, d, h) {
  for (const s of [-1, 1]) F.box(M.timber, s * (w / 2 - 0.03), 0, 0, 0.06, h, d, NC);
  F.box(M.planks, 0, 0, -d / 2 + 0.015, w, h, 0.03, NC);
  for (const y of [0.08, 0.6, 1.12, 1.64]) F.box(M.planks, 0, y, 0, w - 0.1, 0.04, d - 0.03, NC);
  F.box(M.timber, 0, h - 0.06, 0, w + 0.06, 0.06, d + 0.04, NC);
  F.collider(0, 0, 0, w, h, d);
}
function shelfGoods(F, M, R, w, y, kind) {
  let x = -w / 2 + 0.12;
  while (x < w / 2 - 0.2) {
    const t = R();
    if (kind === 'arcane' && t < 0.5) {
      F.add(M.arcane, sphere(0.09, 8, 6), mat4(x + 0.1, y + 0.1, 0));
      x += 0.25;
    } else if (kind === 'cloth' && t < 0.6) {
      F.add(pick(R, [M.fabricRed, M.fabricBlue, M.plaster, M.carpet]), cylC(0.08, 0.36, 8), mat4(x + 0.1, y + 0.09, 0, 0, PI / 2, PI / 2));
      x += 0.2;
    } else if (t < 0.3) {
      const r = 0.07 + R() * 0.05;
      F.add(pick(R, [M.plaster, M.fabricRed, M.fabricBlue, M.iron]), cyl(r, 0.18 + R() * 0.12, 8), mat4(x + r, y, 0));
      x += r * 2 + 0.05;
    } else if (t < 0.55) {
      const s = 0.18 + R() * 0.12;
      F.box(pick(R, [M.planks, M.fabricRed, M.fabricBlue]), x + s / 2, y, 0, s, s * 0.8, 0.28, NC);
      x += s + 0.05;
    } else if (t < 0.65) {
      goldStack(F, M, x + 0.15, y, 0);
      x += 0.35;
    } else x += 0.12 + R() * 0.15;
  }
}
// 蜡烛（可选登记光源）
function candle(F, M, x, y, z, L, intensity = 0.5) {
  F.add(M.plaster, cyl(0.035, 0.14, 6), mat4(x, y, z));
  F.add(M.fire, cone(0.03, 0.08, 5), mat4(x, y + 0.14, z));
  L?.(x, y + 0.3, z, { color: 0xffb060, intensity, range: 7, kind: 'candle', flicker: true });
}

// ======================================================================
// 楼层布局：每个业态 = 一串摆放指令
// ['w', 物件, 选项] 贴墙；['c', 物件, 选项] 空地；['w?', …] 50% 概率
// ======================================================================
const LAYOUT = {
  home: [['w', 'cupboard'], ['c', 'tableSet'], ['w', 'shelf', { goods: 'mixed' }], ['w', 'chest'], ['w', 'barrel'], ['w?', 'crate'], ['c', 'rug']],
  shop: [['cw', 'counter', { top: 'shop' }], ['w', 'shelf'], ['w', 'shelf'], ['w', 'crates'], ['w', 'barrels'], ['w?', 'crate'], ['c?', 'tableSet', { chairs: 0, candle: false, tw: 1.4 }]],
  tavern: [['w', 'bar', { walls: ['left', 'right', 'back', 'front'] }], ['c', 'roundTable'], ['c', 'roundTable'], ['c', 'roundTable'], ['c?', 'roundTable'], ['w', 'barrels'], ['w', 'barrels'], ['w?', 'bench'], ['w', 'wallBanner']],
  workshop: [['w', 'forge'], ['c', 'anvil'], ['w', 'toolrack'], ['w', 'workbench'], ['w', 'barrel'], ['w', 'crates'], ['w?', 'gear']],
  mage: [['w', 'bookshelf'], ['w', 'bookshelf'], ['c', 'desk'], ['c', 'orb'], ['w?', 'bookshelf'], ['w', 'lectern'], ['c', 'rug', { mat: 'fabricBlue' }], ['w', 'candlestand']],
  bank: [['cw', 'counter', { top: 'gold', cw: 3.2, goods: 'mixed' }], ['w', 'vault'], ['w', 'vault'], ['w', 'wallBanner'], ['w', 'wallBanner'], ['w', 'chest'], ['w', 'chest'], ['c', 'rug', { w: 3.2, d: 2.0 }], ['w', 'candlestand']],
  auction: [['c', 'lectern'], ['w', 'counter', { cw: 3.0 }], ['w', 'crates'], ['w', 'crates'], ['w', 'shelf'], ['w', 'wallBanner'], ['c', 'rug', { w: 3.0, d: 2.0 }], ['w', 'chest'], ['w', 'barrels']],
  weapons: [['cw', 'counter', { goods: 'mixed' }], ['w', 'weaponrack'], ['w', 'weaponrack'], ['c', 'armorstand'], ['c', 'armorstand'], ['c', 'anvil'], ['w?', 'weaponrack'], ['w', 'crates']],
  tailor: [['w', 'counter', { goods: 'cloth' }], ['c', 'clothTable'], ['c', 'mannequin'], ['c', 'mannequin'], ['c?', 'mannequin'], ['w', 'shelf', { goods: 'cloth' }], ['w', 'shelf', { goods: 'cloth' }], ['c', 'rug']],
  arcaneShop: [['cw', 'counter', { goods: 'arcane' }], ['w', 'shelf', { goods: 'arcane' }], ['w', 'bookshelf'], ['c', 'orb'], ['c', 'orb'], ['w', 'shelf', { goods: 'arcane' }], ['c', 'rug', { mat: 'fabricBlue' }]],
  alchemy: [['c', 'cauldron'], ['w', 'alchemyTable'], ['w', 'alchemyTable'], ['w', 'shelf', { goods: 'arcane' }], ['w', 'bookshelf'], ['w', 'barrels'], ['w', 'candlestand']],
  si7: [['c', 'mapTable'], ['w', 'weaponrack'], ['w', 'bookshelf'], ['w', 'wallBanner'], ['w', 'chest'], ['c', 'dummy'], ['w', 'candlestand']],
  warriors: [['c', 'dummy'], ['c', 'dummy'], ['c?', 'dummy'], ['w', 'weaponrack'], ['w', 'weaponrack'], ['c', 'armorstand'], ['c', 'armorstand'], ['w', 'wallBanner'], ['w', 'bench'], ['w', 'wallBanner']],
  orphanage: [['c', 'longTable'], ['w', 'cupboard'], ['w', 'chest'], ['w', 'chest'], ['w', 'bench'], ['c', 'rug'], ['w', 'barrel']],
  cityhall: [['c', 'longTable'], ['w', 'wallBanner'], ['w', 'wallBanner'], ['w', 'bookshelf'], ['w', 'bookshelf'], ['c', 'lectern'], ['w', 'candlestand'], ['w', 'wallBanner']],
  dwarfShop: [['cw', 'counter', { goods: 'mixed' }], ['w', 'barrels'], ['w', 'barrels'], ['w', 'crates'], ['w', 'crates'], ['c', 'anvil'], ['w', 'shelf'], ['w', 'gear']],
  // 上层
  bedroom: [['w', 'bed', { walls: ['back', 'left', 'right', 'front'] }], ['w', 'chest'], ['w', 'cupboard'], ['w?', 'bed'], ['c', 'tableSet', { chairs: 2, tw: 1.0 }], ['c', 'rug'], ['w', 'sconce']],
  inn: [['w', 'bed'], ['w', 'bed'], ['w', 'bed'], ['w', 'chest'], ['w', 'chest'], ['c', 'tableSet', { chairs: 2, stools: true, tw: 1.0 }], ['w', 'sconce'], ['w', 'sconce']],
  study: [['w', 'bookshelf'], ['w', 'bookshelf'], ['c', 'desk'], ['w', 'bed'], ['c', 'orb'], ['c', 'rug', { mat: 'fabricBlue' }], ['w', 'sconce']],
  storage: [['w', 'crates'], ['w', 'crates'], ['w', 'barrels'], ['w', 'sacks'], ['w', 'shelf'], ['w?', 'crates'], ['w', 'sconce']],
  office: [['c', 'desk'], ['w', 'bookshelf'], ['w', 'bookshelf'], ['w', 'chest'], ['w', 'wallBanner'], ['c', 'rug'], ['w', 'candlestand'], ['c?', 'desk']],
  dorm: [['w', 'cot'], ['w', 'cot'], ['w', 'cot'], ['w', 'cot'], ['w?', 'cot'], ['w', 'chest'], ['w', 'chest'], ['c', 'rug'], ['w', 'sconce']],
  barracks: [['w', 'cot'], ['w', 'cot'], ['w', 'cot'], ['w', 'weaponrack'], ['w', 'chest'], ['w', 'chest'], ['w', 'sconce']],
  coven: [['c', 'arcaneCircle'], ['w', 'bookshelf'], ['w', 'bed'], ['w', 'chest'], ['w', 'sconce']],
};

function upperRole(p, k, R) {
  const b = p.biz;
  if (b === 'tavern') return p.nm?.arcaneTavern && k === p.F - 1 ? 'coven' : 'inn';
  if (b === 'mage' || b === 'arcaneShop' || b === 'alchemy') return k === 1 ? 'study' : 'bedroom';
  if (b === 'bank' || b === 'auction' || b === 'cityhall' || b === 'si7') return k === 1 ? 'office' : 'storage';
  if (b === 'orphanage') return 'dorm';
  if (b === 'warriors') return 'barracks';
  if (b === 'workshop' || b === 'dwarfShop' || b === 'weapons') return k === 1 ? 'bedroom' : 'storage';
  if (b === 'shop' || b === 'tailor') return k === 1 && R() < 0.35 ? 'storage' : 'bedroom';
  return k === p.F - 1 && p.F > 2 && R() < 0.5 ? 'storage' : 'bedroom';
}

// 内墙饰面：贴在墙内侧的薄板 —— 1.0 m 木护墙板 + 压顶木条，上面灰泥；与外墙用同一套洞口切分
function lining(p, I, M, k) {
  const y0 = k === 0 ? p.base : p.top(k);
  const fl = p.top(k); // 地板顶
  const y1 = p.top(k + 1) - SLAB;
  const wy = fl - y0;
  const z = -p.T / 2 - 0.012;
  const wainTop = fl + WIN.sill; // 护墙板顶 = 窗台
  for (const w of wallsOf(p, I, k)) {
    const wins = p.win[k][w.name].map((a) => w.toL(a));
    const ops = wins.map((lx) => ({ x: lx + w.L / 2, y: wy + WIN.sill, w: WIN.w, h: WIN.h }));
    if (k === 0 && w.name === 'front') ops.push({ x: p.dx + w.L / 2, y: 0, w: p.dw, h: STEP0 + p.dh });
    // 灰泥：护墙板以上
    const hP = y1 - wainTop;
    for (const q of wallPieces(w.L, hP, ops.map((o) => ({ ...o, y: o.y - (wainTop - y0) })))) {
      w.F.box(M.plaster, (q.x0 + q.x1) / 2 - w.L / 2, wainTop + q.y0, z, q.x1 - q.x0, q.y1 - q.y0, 0.02, NC);
    }
    // 木护墙板：地板到窗台（只有门洞需要断开）
    const door = ops.filter((o) => o.y < wy + 0.01);
    for (const q of wallPieces(w.L, wainTop - fl, door.map((o) => ({ ...o, y: 0 })))) {
      const cx = (q.x0 + q.x1) / 2 - w.L / 2;
      if (q.y0 > 0.01) continue; // 门洞上方那一截不属于护墙板
      w.F.box(M.planks, cx, fl, z, q.x1 - q.x0, q.y1, 0.025, NC);
      w.F.box(M.timber, cx, fl + q.y1 - 0.04, z - 0.02, q.x1 - q.x0, 0.08, 0.05, NC);
    }
  }
}

// 天花木梁：沿 X 横跨，梁下 2.9 m；楼梯井所在的车道里断开
function ceilingBeams(p, I, M, k) {
  const yb = p.top(k + 1) - SLAB - 0.22;
  const z1 = p.iz1(k);
  const hole = p.stair && k < p.F - 1 ? { lane: p.stair.lanes[k % 2], x0: p.stair.x0 - 0.15, x1: p.stair.x1 + 0.15 } : null;
  for (let z = p.iz0 + 0.9; z < z1 - 0.4; z += 1.75) {
    const segs = hole && z > hole.lane[0] - 0.15 && z < hole.lane[1] + 0.15 ? [[p.ix0, hole.x0], [hole.x1, p.ix1]] : [[p.ix0, p.ix1]];
    for (const [a, b] of segs) if (b - a > 0.3) I.box(M.timber, (a + b) / 2, yb, z, b - a, 0.22, 0.2, NC);
  }
}

// 一层的占用网格：封掉楼梯区 / 走道 / 门口通道 / 壁炉
function makeRoom(p, k) {
  const room = new Room(p.ix0, p.iz0, p.ix1, p.iz1(k));
  const s = p.stair;
  if (s) {
    const u0 = s.ua - 1.3;
    const u1 = p.W / 2 - p.T;
    room.block(Math.min(p.sx * u0, p.sx * u1), p.iz0, Math.max(p.sx * u0, p.sx * u1), p.iz0 + STAIR.width * 2);
    room.block(p.ix0, p.iz0 + STAIR.width * 2, p.ix1, p.iz0 + STAIR.width * 2 + 0.95);
  }
  if (k === 0) {
    const zFrom = s ? p.iz0 + STAIR.width * 2 : p.iz1(0) - 2.4;
    room.block(p.dx - p.dw / 2 - 0.35, zFrom, p.dx + p.dw / 2 + 0.35, p.iz1(0));
  }
  const f = p.fire;
  const depth = k === 0 ? f.d + 0.75 : 0.7;
  const fx0 = f.side < 0 ? p.ix0 : p.ix1 - depth;
  room.block(fx0, f.z - f.w / 2 - 0.1, fx0 + depth, f.z + f.w / 2 + 0.1);
  const W = p.win[k];
  room.win = { front: W.front, back: W.back, left: W.left, right: W.right };
  if (k === 0) room.win.front = [...W.front, p.dx];
  return room;
}

// ======================================================================
// 填充：主布局摆完后按面积再补几件（大房间不至于空荡荡）
const FILLER = {
  home: ['chest', 'barrel', 'crate', 'candlestand', 'bench', 'shelf', 'sacks'],
  shop: ['crates', 'barrels', 'shelf', 'crate', 'sacks', 'chest'],
  tavern: ['roundTable', 'barrels', 'bench', 'barrel', 'candlestand'],
  workshop: ['crates', 'barrel', 'workbench', 'toolrack', 'sacks', 'anvil'],
  mage: ['bookshelf', 'orb', 'candlestand', 'lectern', 'chest'],
  bank: ['chest', 'candlestand', 'vault', 'wallBanner', 'bench'],
  auction: ['crates', 'chest', 'barrels', 'armorstand', 'mannequin', 'crate'],
  weapons: ['armorstand', 'crates', 'weaponrack', 'barrel'],
  tailor: ['mannequin', 'chest', 'shelf', 'clothTable'],
  arcaneShop: ['orb', 'bookshelf', 'candlestand', 'chest'],
  alchemy: ['barrel', 'crate', 'candlestand', 'sacks'],
  si7: ['dummy', 'chest', 'crate', 'weaponrack'],
  warriors: ['dummy', 'bench', 'chest', 'barrel'],
  orphanage: ['bench', 'chest', 'cot', 'tableSet'],
  cityhall: ['bench', 'candlestand', 'chest', 'bookshelf'],
  dwarfShop: ['barrels', 'crates', 'barrel', 'sacks'],
  bedroom: ['chest', 'candlestand', 'crate', 'cupboard'],
  inn: ['bed', 'chest', 'bench'],
  study: ['bookshelf', 'candlestand', 'chest'],
  storage: ['crates', 'barrels', 'sacks', 'crate', 'barrel'],
  office: ['bookshelf', 'chest', 'candlestand'],
  dorm: ['cot', 'chest', 'bench'],
  barracks: ['cot', 'chest', 'dummy'],
  coven: ['bookshelf', 'candlestand', 'orb'],
};

export function furnish(p, ctx, M, group) {
  const ib = ctx.builder({ parent: group, castShadow: false, tag: 'furniture' });
  const I = ib.frame(p.cx, 0, p.cz, p.ry);
  const R = ctx.rng(`interior:${p.id}`);
  const lights = [];
  const counts = {};
  p.items = [];

  // 该层房间的世界 AABB（墙内侧），挂到这一层登记的每盏灯上，供大气模块判断"相机在不在这间房"
  const roomBox = (k) => {
    const pts = [[p.ix0, p.iz0], [p.ix1, p.iz0], [p.ix0, p.iz1(k)], [p.ix1, p.iz1(k)]].map(([x, z]) => I.toWorld(x, 0, z));
    return {
      x0: Math.min(...pts.map((v) => v.x)), x1: Math.max(...pts.map((v) => v.x)),
      z0: Math.min(...pts.map((v) => v.z)), z1: Math.max(...pts.map((v) => v.z)),
      y0: p.top(k), y1: p.top(k + 1) - SLAB,
    };
  };
  for (let k = 0; k < p.F; k++) {
    const l0 = lights.length;
    const room = makeRoom(p, k);
    const role = k === 0 ? p.biz : upperRole(p, k, R);
    const y = p.top(k);
    const ceil = p.top(k + 1) - SLAB - y;
    let placed = 0;
    let candles = 0; // 每层最多登记 1 盏烛光（炉火 / 熔炉 / 法球另计），蜡烛几何照摆
    const put = (mode, name, opts = {}) => {
      const it = ITEMS[name];
      const o = { ...opts };
      if (o.mat && typeof o.mat === 'string') o.mat = M[o.mat];
      const w = o.w || o.cw || it.w;
      const d = name === 'rug' ? o.d || it.d : it.d;
      let pos = null;
      if (mode === 'cw') pos = placeFree(room, R, w, d, { margin: 0.6, rotate: false });
      if (!pos && (mode === 'w' || mode === 'cw')) pos = placeWall(room, R, w, d, { tall: it.tall, walls: o.walls, clear: name === 'sconce' || name === 'wallBanner' ? 0 : 0.55 });
      else if (!pos && name === 'rug') pos = placeFree(room, R, w, d, { margin: 0.1, block: false });
      else if (!pos && mode === 'c') pos = placeFree(room, R, w, d, { margin: name === 'tableSet' || name === 'longTable' ? 0.35 : 0.45 });
      if (!pos) return false;
      const F = I.sub(pos.x, y, pos.z, pos.ry);
      o.ceil = ceil;
      o.L = (lx, ly, lz, spec) => {
        if (spec.kind === 'candle' && candles++ >= 1) return;
        const wp = F.toWorld(lx, ly, lz);
        lights.push({ x: wp.x, y: wp.y, z: wp.z, ...spec });
      };
      it.fn(F, M, R, o);
      counts[name] = (counts[name] || 0) + 1;
      p.items.push({ k, name, x: pos.x, z: pos.z });
      if (name !== 'rug' && name !== 'sconce' && name !== 'wallBanner') placed++;
      return true;
    };
    for (const [mode, name, opts] of LAYOUT[role] || LAYOUT.home) {
      if (mode.endsWith('?') && R() < 0.5) continue;
      put(mode.replace('?', ''), name, opts);
    }
    // 按面积补件：约每 8 m² 一件
    const area = (room.x1 - room.x0) * (room.z1 - room.z0);
    const fill = FILLER[role] || FILLER.home;
    for (let t = 0; t < 14 && placed < area / 8; t++) {
      const name = pick(R, fill);
      put(name === 'roundTable' || name === 'tableSet' || name === 'orb' || name === 'dummy' || name === 'armorstand' || name === 'mannequin' || name === 'anvil' || name === 'clothTable' ? 'c' : 'w', name, name === 'tableSet' ? { chairs: 4 } : {});
    }
    // 天花木梁（避开楼梯井）+ 内墙灰泥 / 护墙板
    ceilingBeams(p, I, M, k);
    lining(p, I, M, k);
    // 每层至少一处光源：没摆出烛台 / 壁灯的上层，挂一盏壁灯
    if (k > 0 && !lights.some((l) => l.y > y + 0.3 && l.y < y + 3.3)) {
      const pos = placeWall(room, R, 0.4, 0.12, { tall: true, clear: 0 }) || { x: 0, z: p.iz1(k) - 0.06, ry: PI };
      const F = I.sub(pos.x, y, pos.z, pos.ry);
      ITEMS.sconce.fn(F, M, R, { L: (lx, ly, lz, spec) => { const wp = F.toWorld(lx, ly, lz); lights.push({ x: wp.x, y: wp.y, z: wp.z, ...spec }); } });
    }
    const rb = roomBox(k);
    for (let i = l0; i < lights.length; i++) lights[i].room = rb;
  }

  // ---- 壁炉里的火（室内组，随 LOD 显隐）+ 主光源 ----
  const f = p.fire;
  const Fi = I.sub(f.xFace, p.top(0), f.z, f.side < 0 ? PI / 2 : -PI / 2);
  const fa = flameAssets();
  const fl = new THREE.Mesh(fa.geo, fa.mat);
  fl.position.copy(Fi.toWorld(0, 0.06, 0.36));
  const fry = p.ry + (f.side < 0 ? PI / 2 : -PI / 2);
  fl.rotation.y = fry;
  const fsx = f.w / 1.6;
  const fsy = f.big ? 1.25 : 0.95;
  fl.scale.set(fsx, fsy, fsx);
  fl.renderOrder = 2;
  group.add(fl);
  FLAMES.push({ mesh: fl, sx: fsx, sy: fsy, ry: fry, ph: R() * 10 });
  Fi.add(M.fire, cone(0.3 * fsx, 0.08, 8), mat4(0, 0.04, 0.36)); // 炭床
  Fi.add(M.timber, cylC(0.07, 0.8, 6), mat4(0, 0.08, 0.35, 0, 0.4, PI / 2));
  Fi.add(M.timber, cylC(0.07, 0.75, 6), mat4(0, 0.08, 0.4, 0, -0.5, PI / 2));
  Fi.add(M.iron, cylC(0.25, 0.04, 8), mat4(0, 0.02, 0.35));
  const lp = Fi.toWorld(0, 0.8, f.d + 0.6);
  lights.unshift({ x: lp.x, y: lp.y, z: lp.z, color: 0xffa040, intensity: 1, range: f.big ? 13 : 10, kind: 'fire', flicker: true, room: roomBox(0) });

  ib.finish();
  return { lights, counts };
}
