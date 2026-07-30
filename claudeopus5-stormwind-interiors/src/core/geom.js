// 几何工具箱。两条贯穿全场景的约定:
//  1) 所有 UV 以「米」为单位 —— 材质用 repeat = 1/贴图物理尺寸,任何构件贴图密度一致,不会出现拉伸。
//  2) 任何生成墙体的函数同时返回 boxes(碰撞盒,[x0,y0,z0,x1,y1,z1]),门窗洞口天然不产生碰撞盒,
//     所以"能走进去"不是额外做的开关,而是几何本身的结果。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();

/* ---------------- 合并与变换 ---------------- */

/** 归一化:统一转非索引 + 只保留 position/normal/uv,保证 mergeGeometries 不会因属性不一致炸掉。 */
export function norm(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const key of Object.keys(g.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
  }
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

/** 合并一组几何为一个 BufferGeometry(空数组返回 null)。 */
export function merge(list) {
  const arr = list.filter(Boolean).map(norm);
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  return mergeGeometries(arr, false);
}

export function meshOf(list, material, { cast = true, receive = true } = {}) {
  const g = merge(list);
  if (!g) return null;
  const m = new THREE.Mesh(g, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function xform(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _m4.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  _m4.scale(new THREE.Vector3(sx, sy, sz));
  _m4.setPosition(x, y, z);
  geo.applyMatrix4(_m4);
  return geo;
}

/* ---------------- UV(米制) ---------------- */

/** 把 BoxGeometry 的 0..1 UV 换算成米,使不同尺寸的构件贴图密度一致。 */
function uvMeters(geo, w, h, d) {
  const uv = geo.attributes.uv;
  // BoxGeometry 顶点顺序: +x, -x, +y, -y, +z, -z,每面 4 顶点
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = spans[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** 圆柱/圆锥类:按周长与高度换算 UV。 */
function uvMetersRadial(geo, circumference, height) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circumference, uv.getY(i) * height);
  uv.needsUpdate = true;
  return geo;
}

/* ---------------- 基础体 ---------------- */

/** 中心在 (x,y,z) 的长方体。 */
export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0) {
  const g = uvMeters(new THREE.BoxGeometry(w, h, d), w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** 底面贴地的长方体:(x,z) 为中心,y 为底高。 */
export function boxOn(w, h, d, x, y, z, ry = 0) {
  return box(w, h, d, x, y + h / 2, z, ry);
}

export function cyl(rTop, rBot, h, seg, x = 0, y = 0, z = 0, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  uvMetersRadial(g, 2 * Math.PI * Math.max(rTop, rBot), h);
  g.translate(x, y, z);
  return g;
}

export function cone(r, h, seg, x = 0, y = 0, z = 0) {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  uvMetersRadial(g, 2 * Math.PI * r, h);
  g.translate(x, y, z);
  return g;
}

export function sphere(r, wSeg = 12, hSeg = 8, x = 0, y = 0, z = 0) {
  const g = new THREE.SphereGeometry(r, wSeg, hSeg);
  uvMetersRadial(g, 2 * Math.PI * r, Math.PI * r);
  g.translate(x, y, z);
  return g;
}

/** 车削件(柱础/柱头/栏杆瓶/喷泉盆)。points: [[r,y],…] */
export function lathe(points, seg = 14, x = 0, y = 0, z = 0) {
  const pts = points.map(([r, py]) => new THREE.Vector2(Math.max(r, 0.0001), py));
  const g = new THREE.LatheGeometry(pts, seg);
  let maxR = 0, maxY = 0;
  for (const [r, py] of points) { maxR = Math.max(maxR, r); maxY = Math.max(maxY, py); }
  uvMetersRadial(g, 2 * Math.PI * maxR, maxY);
  g.translate(x, y, z);
  return g;
}

/** 由 Shape 拉伸(用于拱、山墙、花窗、桥拱等曲线构件)。UV 天然是米制。 */
export function extrude(shape, depth, { bevel = 0, curveSegments = 12 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** 三角形山墙(等腰),厚度沿 Z。 */
export function gableEnd(w, h, t, x = 0, y = 0, z = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = extrude(s, t);
  g.translate(x, y, z);
  return g;
}

/* ---------------- 洞口与墙体 ---------------- */

/**
 * 带门窗洞的墙。局部坐标: X ∈ [-w/2, w/2],Y ∈ [0, h],厚度沿 Z 居中。
 * openings: { x(中心), y(下沿), w, h, arch?(顶部半圆) }
 * 返回 { geo, boxes, openings } —— boxes 为墙实体部分的碰撞盒(洞口处天然缺口)。
 */
export function wallWithOpenings({ width, height, thickness, openings = [] }) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();

  const ops = openings
    .filter((o) => o.w > 0.05 && o.h > 0.05)
    .map((o) => ({ ...o }))
    .sort((a, b) => (a.x - a.w / 2) - (b.x - b.w / 2));

  for (const o of ops) {
    const p = new THREE.Path();
    const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2;
    const y0 = o.y, y1 = o.y + o.h;
    if (o.round) {
      // 圆形洞口(玫瑰窗):不开洞的话彩窗会被埋在实墙里
      p.absellipse(o.x, y0 + o.h / 2, o.w / 2, o.h / 2, 0, Math.PI * 2, true);
      p.closePath();
    } else if (o.arch) {
      const r = o.w / 2;
      const yTop = y1 - r;
      p.moveTo(x0, y0);
      p.lineTo(x0, yTop);
      p.absarc(o.x, yTop, r, Math.PI, 0, true);
      p.lineTo(x1, y0);
      p.closePath();
    } else {
      p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, y1); p.lineTo(x0, y1); p.closePath();
    }
    shape.holes.push(p);
  }

  const geo = extrude(shape, thickness, { curveSegments: 10 });

  // ---- 碰撞盒:按 X 切条,洞口下方留槛、上方留过梁 ----
  // 只有"人够得着"的洞口参与切分:高窗/玫瑰窗一律按实墙处理。
  // 否则高洞口与门洞在 X 上重叠时,切条算法会在门口生成一整块实心盒把门堵死。
  const boxes = [];
  const t2 = thickness / 2;
  const walkOps = ops.filter((o) => o.y < 2.6);
  let cursor = -width / 2;
  for (const o of walkOps) {
    const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2;
    if (x0 > cursor + 0.01) boxes.push([cursor, 0, -t2, x0, height, t2]);
    if (o.y > 0.01) boxes.push([x0, 0, -t2, x1, o.y, t2]);           // 窗下墙
    const top = o.y + o.h;
    if (top < height - 0.01) boxes.push([x0, top, -t2, x1, height, t2]); // 过梁(高于头顶,不挡人)
    cursor = Math.max(cursor, x1);
  }
  if (cursor < width / 2 - 0.01) boxes.push([cursor, 0, -t2, width / 2, height, t2]);
  if (walkOps.length === 0) boxes.push([-width / 2, 0, -t2, width / 2, height, t2]);

  return { geo, boxes, openings: ops };
}

/** 拱券洞口的独立券脸(城门/桥洞用):半圆券环。 */
export function archRing(innerR, ringT, depth, x = 0, y = 0, z = 0, ry = 0) {
  const s = new THREE.Shape();
  s.absarc(0, 0, innerR + ringT, Math.PI, 0, true);
  s.lineTo(innerR, 0);
  s.absarc(0, 0, innerR, 0, Math.PI, false);
  s.closePath();
  const g = extrude(s, depth, { curveSegments: 16 });
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** 桥/城门的实心拱腹(带拱洞的墙面),返回 geo + 碰撞盒(拱洞不产生碰撞)。 */
export function archedWall(width, height, thickness, archW, archH, ry = 0, x = 0, y = 0, z = 0) {
  const w = wallWithOpenings({
    width, height, thickness,
    openings: [{ x: 0, y: 0, w: archW, h: archH, arch: true }],
  });
  if (ry) w.geo.rotateY(ry);
  w.geo.translate(x, y, z);
  const boxes = w.boxes.map((b) => transformBox(b, x, y, z, ry));
  return { geo: w.geo, boxes };
}

/* ---------------- 屋顶 ---------------- */

/** 双坡屋顶(山形)。脊沿 X 轴,返回带厚度的两块坡板 + 脊瓦。 */
export function gableRoof(w, d, h, over = 0.45, thick = 0.22) {
  const W = w + over * 2, D = d + over * 2;
  const slope = Math.atan2(h, D / 2);
  const len = Math.sqrt(h * h + (D / 2) * (D / 2));
  const parts = [];
  for (const s of [-1, 1]) {
    const g = box(W, thick, len, 0, 0, 0);
    g.rotateX(-s * slope);
    g.translate(0, h / 2, (s * D) / 4);
    parts.push(g);
  }
  parts.push(box(W + 0.1, thick * 1.5, thick * 2.6, 0, h + thick * 0.2, 0));
  return parts;
}

/** 四坡(庑殿)屋顶,自建顶点,返回单个几何。 */
export function hipRoof(w, d, h, over = 0.4, ridgeRatio = 0.42) {
  const W = w / 2 + over, D = d / 2 + over;
  const rx = (w / 2) * ridgeRatio;
  const v = [];
  const uv = [];
  const push = (a, b, c) => {
    v.push(...a, ...b, ...c);
    // 简易米制 UV:用 XZ 投影 + 坡长
    uv.push(a[0], a[2], b[0], b[2], c[0], c[2]);
  };
  const bl = [-W, 0, -D], br = [W, 0, -D], fr = [W, 0, D], fl = [-W, 0, D];
  const r0 = [-rx, h, 0], r1 = [rx, h, 0];
  push(bl, r1, br); push(bl, r0, r1);          // 后坡
  push(fr, r0, fl); push(fr, r1, r0);          // 前坡
  push(br, r1, fr);                            // 右坡
  push(fl, r0, bl);                            // 左坡
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** 圆锥尖顶(塔楼),带外张的檐口曲线。 */
export function spireRoof(r, h, seg = 12, flare = 1.18) {
  const pts = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const rr = r * flare * Math.pow(1 - t, 1.35);
    pts.push([rr, t * h]);
  }
  pts.push([0.001, h]);
  return lathe(pts, seg);
}

/* ---------------- 台阶 / 栏杆 / 雉堞 ---------------- */

/** 直跑楼梯。沿 +Z 上行,底面在 y=0。返回 { geos, boxes }(每级踏步都是碰撞盒,可真正走上去)。 */
export function stairs(steps, width, rise, run, { x = 0, y = 0, z = 0, ry = 0, solid = true } = {}) {
  const geos = [], boxes = [];
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) * rise;
    const g = solid
      ? boxOn(width, h, run, 0, 0, (i + 0.5) * run)
      : boxOn(width, rise, run, 0, i * rise, (i + 0.5) * run);
    const yy = solid ? 0 : i * rise;
    const hh = solid ? h : rise;
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    geos.push(g);
    boxes.push(transformBox([-width / 2, yy, (i) * run, width / 2, yy + hh, (i + 1) * run], x, y, z, ry));
  }
  return { geos, boxes };
}

/** 雉堞(城垛):沿 X 排布的墙齿。 */
export function crenellation(len, t, merlonW = 1.5, gapW = 1.0, mh = 1.05, { x = 0, y = 0, z = 0, ry = 0 } = {}) {
  const geos = [], boxes = [];
  const unit = merlonW + gapW;
  const n = Math.max(1, Math.floor(len / unit));
  const start = -len / 2 + (len - n * unit + gapW) / 2;
  for (let i = 0; i < n; i++) {
    const cx = start + i * unit + merlonW / 2;
    const g = boxOn(merlonW, mh, t, cx, 0, 0);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    geos.push(g);
    boxes.push(transformBox([cx - merlonW / 2, 0, -t / 2, cx + merlonW / 2, mh, t / 2], x, y, z, ry));
  }
  return { geos, boxes };
}

/** 栏杆:柱 + 上下横档 + 瓶式栏杆柱。 */
export function balustrade(len, h = 1.05, { x = 0, y = 0, z = 0, ry = 0, spacing = 0.62 } = {}) {
  const geos = [];
  const n = Math.max(2, Math.round(len / spacing));
  for (let i = 0; i <= n; i++) {
    const cx = -len / 2 + (i / n) * len;
    geos.push(xformAll(lathe([[0.07, 0], [0.11, 0.08], [0.06, 0.3], [0.12, 0.52], [0.07, 0.8], [0.09, h - 0.16]], 8, cx, 0, 0), x, y, z, ry));
  }
  geos.push(xformAll(boxOn(len, 0.16, 0.34, 0, h - 0.16, 0), x, y, z, ry));
  geos.push(xformAll(boxOn(len, 0.14, 0.34, 0, 0, 0), x, y, z, ry));
  return geos;
}

function xformAll(geo, x, y, z, ry) {
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}

/* ---------------- 碰撞盒工具 ---------------- */

/** 把局部 AABB 经 (rotY, 平移) 变换后重新求包围盒(90° 倍数时完全精确)。 */
export function transformBox(b, x, y, z, ry = 0) {
  if (!ry) return [b[0] + x, b[1] + y, b[2] + z, b[3] + x, b[4] + y, b[5] + z];
  const c = Math.cos(ry), s = Math.sin(ry);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const px of [b[0], b[3]]) {
    for (const pz of [b[2], b[5]]) {
      const nx = px * c + pz * s;
      const nz = -px * s + pz * c;
      minX = Math.min(minX, nx); maxX = Math.max(maxX, nx);
      minZ = Math.min(minZ, nz); maxZ = Math.max(maxZ, nz);
    }
  }
  return [minX + x, b[1] + y, minZ + z, maxX + x, b[4] + y, maxZ + z];
}

export function boxesTransform(boxes, x, y, z, ry = 0) {
  return boxes.map((b) => transformBox(b, x, y, z, ry));
}

/** 由中心+尺寸生成碰撞盒。 */
export function aabb(cx, cy, cz, w, h, d) {
  return [cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2];
}

/** 底面贴地版本。 */
export function aabbOn(cx, y, cz, w, h, d) {
  return [cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2];
}

/* ---------------- 其它小件 ---------------- */

/** 古典柱式(柱础 + 收分柱身 + 柱头)。 */
export function column(r, h, seg = 12) {
  return lathe([
    [r * 1.34, 0], [r * 1.34, 0.14], [r * 1.12, 0.22], [r * 1.05, 0.34],
    [r, 0.5], [r * 0.93, h * 0.62], [r * 0.88, h - 0.62],
    [r * 1.06, h - 0.42], [r * 1.2, h - 0.26], [r * 1.3, h - 0.12], [r * 1.3, h],
  ], seg);
}

/** 圆形拱廊(教堂/回廊):n 个拱券沿 X 排布。 */
export function arcade(count, spanW, pierW, h, depth, archH) {
  const geos = [], boxes = [];
  const unit = spanW + pierW;
  const total = count * unit + pierW;
  for (let i = 0; i <= count; i++) {
    const cx = -total / 2 + pierW / 2 + i * unit;
    geos.push(boxOn(pierW, h, depth, cx, 0, 0));
    boxes.push(aabbOn(cx, 0, 0, pierW, h, depth));
  }
  for (let i = 0; i < count; i++) {
    const cx = -total / 2 + pierW + spanW / 2 + i * unit;
    const s = new THREE.Shape();
    s.moveTo(-spanW / 2 - 0.02, archH - spanW / 2);
    s.lineTo(-spanW / 2 - 0.02, h);
    s.lineTo(spanW / 2 + 0.02, h);
    s.lineTo(spanW / 2 + 0.02, archH - spanW / 2);
    s.absarc(0, archH - spanW / 2, spanW / 2, 0, Math.PI, false);
    s.closePath();
    const g = extrude(s, depth, { curveSegments: 12 });
    g.translate(cx, 0, 0);
    geos.push(g);
  }
  return { geos, boxes, width: total };
}

export { _v3 };
