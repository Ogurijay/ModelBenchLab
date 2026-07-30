// 室内陈设工具箱。每件家具直接生成到世界坐标(通过 placer 施加旋转+平移),
// 由外层按建筑合并成 4~6 个 mesh —— 于是"每栋房子都有内景"不会把 drawcall 打爆。
import * as THREE from 'three';
import { box, boxOn, cyl, cone, lathe, sphere, aabbOn, transformBox, extrude } from '../core/geom.js';

/** 几何收集器:按材质分桶。 */
export class Collector {
  constructor() { this.parts = new Map(); this.boxes = []; this.emitters = []; }
  add(mat, geo) {
    if (!geo) return;
    let a = this.parts.get(mat);
    if (!a) { a = []; this.parts.set(mat, a); }
    a.push(geo);
  }
  box(b) { this.boxes.push(b); }
  emit(e) { this.emitters.push(e); }
  merge(other) {
    for (const [k, v] of other.parts) {
      let a = this.parts.get(k);
      if (!a) { a = []; this.parts.set(k, a); }
      a.push(...v);
    }
    this.boxes.push(...other.boxes);
    this.emitters.push(...other.emitters);
  }
}

/** 生成一个"落位器":把局部坐标的构件放到 (ox,oy,oz) 且绕 Y 旋转 ry。 */
export function placer(col, ox = 0, oy = 0, oz = 0, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return {
    col,
    add(mat, geo) {
      if (!geo) return;
      if (ry) geo.rotateY(ry);
      geo.translate(ox, oy, oz);
      col.add(mat, geo);
    },
    box(b) { col.box(transformBox(b, ox, oy, oz, ry)); },
    emit(e) {
      const x = e.x * c + e.z * s, z = -e.x * s + e.z * c;
      col.emit({ ...e, x: x + ox, y: e.y + oy, z: z + oz });
    },
    /** 派生:在当前坐标系里再偏移一层 */
    at(x, y, z, r = 0) { return placer(col, ox + (x * c + z * s), oy + y, oz + (-x * s + z * c), ry + r); },
  };
}

/* ------------------------------------------------------------------ *
 *  家具
 * ------------------------------------------------------------------ */

export function table(p, w = 1.7, d = 0.95, h = 0.78, mat = 'plank') {
  p.add(mat, boxOn(w, 0.09, d, 0, h - 0.09, 0));
  const lx = w / 2 - 0.16, lz = d / 2 - 0.14;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.add(mat, boxOn(0.11, h - 0.09, 0.11, sx * lx, 0, sz * lz));
  }
  p.add(mat, boxOn(w - 0.5, 0.07, 0.09, 0, h * 0.35, 0));
  p.box(aabbOn(0, 0, 0, w, h, d));
}

export function bench(p, len = 1.5, mat = 'plank') {
  p.add(mat, boxOn(len, 0.08, 0.34, 0, 0.44, 0));
  for (const sx of [-1, 1]) p.add(mat, boxOn(0.1, 0.44, 0.3, sx * (len / 2 - 0.14), 0, 0));
  p.box(aabbOn(0, 0, 0, len, 0.52, 0.34));
}

export function stool(p, mat = 'plank') {
  p.add(mat, cyl(0.19, 0.19, 0.07, 8, 0, 0.47, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const g = cyl(0.033, 0.045, 0.44, 6, Math.sin(a) * 0.13, 0.22, Math.cos(a) * 0.13);
    p.add(mat, g);
  }
  p.box(aabbOn(0, 0, 0, 0.42, 0.5, 0.42));
}

export function chair(p, mat = 'plank') {
  p.add(mat, boxOn(0.42, 0.06, 0.4, 0, 0.44, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.add(mat, boxOn(0.06, 0.44, 0.06, sx * 0.16, 0, sz * 0.15));
  }
  p.add(mat, boxOn(0.42, 0.52, 0.06, 0, 0.5, -0.17));
  for (const sx of [-1, 1]) p.add(mat, boxOn(0.05, 0.5, 0.05, sx * 0.16, 0.5, -0.17));
  p.box(aabbOn(0, 0, 0, 0.46, 0.55, 0.44));
}

export function bed(p, w = 1.25, len = 2.05) {
  p.add('plankDark', boxOn(w, 0.3, len, 0, 0.16, 0));
  p.add('plankDark', boxOn(w + 0.1, 0.85, 0.1, 0, 0.16, -len / 2));
  p.add('plankDark', boxOn(w + 0.1, 0.45, 0.1, 0, 0.16, len / 2));
  p.add('clothCream', boxOn(w - 0.1, 0.2, len - 0.24, 0, 0.46, 0));
  p.add('clothBlue', boxOn(w - 0.08, 0.11, len * 0.56, 0, 0.63, len * 0.2));
  p.add('clothCream', boxOn(w * 0.62, 0.13, 0.34, 0, 0.65, -len / 2 + 0.34));
  p.box(aabbOn(0, 0, 0, w + 0.1, 0.68, len));
}

export function chest(p, w = 0.9) {
  p.add('plankDark', boxOn(w, 0.44, 0.5, 0, 0, 0));
  p.add('plankDark', boxOn(w + 0.04, 0.12, 0.54, 0, 0.44, 0));
  p.add('iron', boxOn(0.1, 0.6, 0.54, -w * 0.28, 0, 0));
  p.add('iron', boxOn(0.1, 0.6, 0.54, w * 0.28, 0, 0));
  p.box(aabbOn(0, 0, 0, w, 0.58, 0.52));
}

export function shelf(p, w = 1.6, h = 1.9, rng, goods = true) {
  p.add('plankDark', boxOn(0.08, h, 0.36, -w / 2, 0, 0));
  p.add('plankDark', boxOn(0.08, h, 0.36, w / 2, 0, 0));
  p.add('plankDark', boxOn(w, 0.06, 0.36, 0, h - 0.06, 0));
  const levels = 3;
  for (let i = 0; i < levels; i++) {
    const y = 0.42 + i * (h - 0.6) / levels;
    p.add('plankDark', boxOn(w, 0.05, 0.36, 0, y, 0));
    if (!goods) continue;
    const n = 4 + (rng ? rng.int(0, 3) : 2);
    for (let k = 0; k < n; k++) {
      const r = rng ? rng.next() : (k * 0.37) % 1;
      const gx = -w / 2 + 0.16 + (k / n) * (w - 0.3);
      if (r < 0.34) p.add('clothCream', boxOn(0.13, 0.2, 0.13, gx, y + 0.05, 0));
      else if (r < 0.66) p.add('copper', cyl(0.06, 0.07, 0.22, 7, gx, y + 0.16, 0));
      else p.add('clothRed', boxOn(0.1, 0.16, 0.22, gx, y + 0.05, 0));
    }
  }
  p.box(aabbOn(0, 0, 0, w, h, 0.36));
}

export function barrel(p, r = 0.34, h = 0.86, mat = 'plankDark') {
  p.add(mat, lathe([[r * 0.82, 0], [r, h * 0.28], [r, h * 0.72], [r * 0.82, h], [0, h]], 10));
  p.add('iron', cyl(r * 1.02, r * 1.02, 0.06, 10, 0, h * 0.24, 0));
  p.add('iron', cyl(r * 1.02, r * 1.02, 0.06, 10, 0, h * 0.76, 0));
  p.box(aabbOn(0, 0, 0, r * 2, h, r * 2));
}

export function crate(p, s = 0.62, mat = 'plank') {
  p.add(mat, boxOn(s, s, s, 0, 0, 0));
  p.add('plankDark', boxOn(s + 0.03, 0.06, 0.06, 0, s * 0.5, 0));
  p.add('plankDark', boxOn(0.06, 0.06, s + 0.03, 0, s * 0.5, 0));
  p.box(aabbOn(0, 0, 0, s, s, s));
}

export function sack(p, r = 0.26) {
  p.add('clothCream', lathe([[r * 0.9, 0], [r, r * 0.7], [r * 0.72, r * 1.5], [r * 0.3, r * 1.9], [r * 0.34, r * 2.1], [0, r * 2.1]], 8));
  p.box(aabbOn(0, 0, 0, r * 2, r * 2, r * 2));
}

/** 壁炉:石砌 + 炉膛 + 柴火 + 火光(附带光源发射器)。 */
export function fireplace(p, w = 2.0, lit = true) {
  const h = 2.3, depth = 0.75;
  p.add('stoneWarm', boxOn(0.5, h, depth, -w / 2 + 0.25, 0, 0));
  p.add('stoneWarm', boxOn(0.5, h, depth, w / 2 - 0.25, 0, 0));
  p.add('stoneWarm', boxOn(w, h - 1.5, depth, 0, 1.5, 0));
  p.add('stoneTrim', boxOn(w + 0.24, 0.16, depth + 0.16, 0, 1.42, 0.04));
  p.add('stoneDark', boxOn(w - 1.0, 0.12, depth - 0.1, 0, 0, 0.02));
  p.box(aabbOn(0, 0, 0, w, h, depth));
  if (lit) {
    for (let i = 0; i < 3; i++) {
      const g = cyl(0.05, 0.06, 0.62, 6, (i - 1) * 0.14, 0.16, 0);
      g.rotateZ(0.4 + i * 0.3);
      g.rotateX(0.2);
      p.add('plankDark', g);
    }
    p.add('emberGlow', sphere(0.2, 8, 6, 0, 0.16, 0));
    p.add('fireCore', cone(0.22, 0.5, 7, 0, 0.4, 0));
    p.emit({ x: 0, y: 0.6, z: 0.25, color: 0xff9a42, intensity: 3.4, distance: 13, flicker: 1 });
  }
}

/** 铁匠炉:炭火 + 烟罩 + 风箱。 */
export function forgeHearth(p) {
  p.add('stoneDark', boxOn(2.0, 0.95, 1.4, 0, 0, 0));
  p.add('stoneDark', boxOn(2.2, 0.2, 1.6, 0, 0.95, 0));
  p.add('forgeGlow', boxOn(1.1, 0.12, 0.8, 0, 1.03, 0));
  p.add('emberGlow', sphere(0.32, 8, 6, 0, 1.02, 0));
  p.add('ironDark', boxOn(2.3, 0.1, 1.7, 0, 2.5, 0));
  for (const sx of [-1, 1]) {
    const g = boxOn(0.12, 1.5, 0.12, sx * 1.0, 1.1, -0.7);
    p.add('ironDark', g);
  }
  p.add('plankDark', boxOn(0.9, 0.5, 0.7, -1.6, 0.9, 0));
  p.box(aabbOn(0, 0, 0, 2.2, 1.15, 1.6));
  p.emit({ x: 0, y: 1.3, z: 0, color: 0xff6a1e, intensity: 3.6, distance: 14, flicker: 1.4 });
}

export function anvil(p) {
  p.add('plankDark', cyl(0.24, 0.3, 0.5, 8, 0, 0.25, 0));
  p.add('ironDark', boxOn(0.62, 0.16, 0.26, 0, 0.5, 0));
  p.add('ironDark', boxOn(0.42, 0.14, 0.2, 0, 0.66, 0));
  p.add('ironDark', cone(0.11, 0.36, 7, -0.44, 0.73, 0));
  p.box(aabbOn(0, 0, 0, 0.7, 0.8, 0.36));
}

/** 吧台 / 柜台。 */
export function counter(p, len = 3.2, h = 1.05) {
  p.add('plankDark', boxOn(len, h - 0.08, 0.66, 0, 0, 0));
  p.add('plank', boxOn(len + 0.2, 0.1, 0.82, 0, h - 0.1, 0));
  for (let i = 0; i < Math.floor(len / 0.8); i++) {
    p.add('plank', boxOn(0.06, h - 0.2, 0.02, -len / 2 + 0.4 + i * 0.8, 0.06, 0.34));
  }
  p.box(aabbOn(0, 0, 0, len + 0.2, h, 0.82));
}

export function rug(p, w = 2.4, d = 1.6, mat = 'carpet') {
  p.add(mat, boxOn(w, 0.025, d, 0, 0.001, 0));
}

/** 吊灯(蜡烛环)。 */
export function chandelier(p, y = 2.9, r = 0.55, candles = 6) {
  p.add('ironDark', cyl(0.02, 0.02, 1.0, 5, 0, y + 0.5, 0));
  p.add('ironDark', lathe([[r, 0], [r, 0.07], [r - 0.05, 0.07], [r - 0.05, 0]], 14, 0, y, 0));
  for (let i = 0; i < candles; i++) {
    const a = (i / candles) * Math.PI * 2;
    const cx = Math.sin(a) * r, cz = Math.cos(a) * r;
    p.add('ironDark', cyl(0.02, 0.02, 0.42, 4, cx, y + 0.2, cz));
    p.add('candle', cyl(0.035, 0.04, 0.18, 5, cx, y + 0.48, cz));
    p.add('fireCore', cone(0.03, 0.09, 5, cx, y + 0.6, cz));
  }
  p.emit({ x: 0, y: y + 0.4, z: 0, color: 0xffc271, intensity: 2.7, distance: 12, flicker: 0.4 });
}

/** 壁灯 / 火把(墙上)。 */
export function wallLantern(p, y = 2.2, torch = false) {
  p.add('ironDark', boxOn(0.06, 0.06, 0.3, 0, y, 0.14));
  if (torch) {
    p.add('plankDark', cyl(0.04, 0.05, 0.5, 6, 0, y + 0.16, 0.3));
    p.add('emberGlow', sphere(0.09, 7, 5, 0, y + 0.44, 0.3));
    p.add('fireCore', cone(0.1, 0.3, 6, 0, y + 0.58, 0.3));
    p.emit({ x: 0, y: y + 0.5, z: 0.3, color: 0xff9540, intensity: 3.0, distance: 12, flicker: 1.2 });
  } else {
    p.add('ironDark', boxOn(0.26, 0.04, 0.26, 0, y + 0.36, 0.3));
    p.add('lampGlass', boxOn(0.2, 0.3, 0.2, 0, y + 0.06, 0.3));
    p.add('ironDark', cyl(0.015, 0.015, 0.12, 4, 0, y + 0.42, 0.3));
    p.emit({ x: 0, y: y + 0.2, z: 0.3, color: 0xffbe72, intensity: 2.4, distance: 11, flicker: 0.25 });
  }
}

/** 壁毯 / 画。 */
export function tapestry(p, w = 1.2, h = 1.8, mat = 'bannerRoyal') {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
  g.translate(0, h / 2, 0);
  p.add(mat, g);
  p.add('plankDark', boxOn(w + 0.16, 0.07, 0.07, 0, h, 0));
}

/** 书架(带书脊配色)。 */
export function bookshelf(p, w = 1.5, h = 2.1, rng) {
  p.add('plankDark', boxOn(w, h, 0.32, 0, 0, -0.02));
  for (let i = 0; i < 4; i++) {
    const y = 0.35 + i * (h - 0.5) / 4;
    p.add('plank', boxOn(w - 0.1, 0.05, 0.3, 0, y, 0));
    let bx = -w / 2 + 0.1;
    const cols = ['clothRed', 'clothBlue', 'clothGreen', 'plankDark', 'clothCream'];
    while (bx < w / 2 - 0.14) {
      const bw = 0.04 + (rng ? rng.next() : 0.5) * 0.05;
      const bh = 0.2 + (rng ? rng.next() : 0.5) * 0.12;
      p.add(cols[Math.floor((rng ? rng.next() : 0.4) * cols.length)], boxOn(bw, bh, 0.24, bx, y + 0.05, 0.02));
      bx += bw + 0.012;
    }
  }
  p.box(aabbOn(0, 0, -0.02, w, h, 0.34));
}

/** 悬挂的干草/腊肉/锅具等杂物,给厨房增味。 */
export function kitchenClutter(p, rng) {
  p.add('ironDark', cyl(0.18, 0.16, 0.22, 9, 0, 0.94, 0));
  p.add('copper', cyl(0.13, 0.12, 0.16, 9, 0.34, 0.96, 0.1));
  for (let i = 0; i < 3; i++) {
    const x = -0.3 + i * 0.3;
    p.add('copper', cyl(0.11, 0.1, 0.14, 8, x, 2.06, -0.16));
    p.add('ironDark', cyl(0.008, 0.008, 0.3, 4, x, 2.28, -0.16));
  }
  if (rng && rng.chance(0.6)) {
    p.add('foliageWarm', sphere(0.14, 6, 5, 0.5, 2.1, -0.14));
  }
}

/** 木质楼梯扶手。 */
export function stairRail(p, len, rise, side = 1) {
  const n = Math.max(3, Math.round(len / 0.8));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    p.add('plankDark', boxOn(0.06, 0.9 + t * rise, 0.06, 0, t * rise * 0, t * len - len / 2));
  }
}
