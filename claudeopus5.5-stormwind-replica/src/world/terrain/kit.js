// 地形模块内部工具：多边形边、沿边摆盒子、世界米 UV 的平面片。
import * as THREE from 'three';
import { pointInPoly } from '../coords.js';
import { boxGeo, metersUV } from '../../core/geom.js';

// 多边形的边：{ a, b, len, ux, uz（沿边单位向量）, nx, nz（朝外法线）, ry, convexA, convexB }
export function polyEdges(poly) {
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    let nx = uz;
    let nz = -ux;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    if (pointInPoly(mx + nx * 0.3, mz + nz * 0.3, poly)) {
      nx = -nx;
      nz = -nz;
    }
    out.push({ i, a, b, len, ux, uz, nx, nz, ry: Math.atan2(-uz, ux) });
  }
  // 顶点凸 / 凹：两条相邻边的转向与外法线同侧 = 凸
  for (let i = 0; i < n; i++) {
    const e = out[i];
    const prev = out[(i - 1 + n) % n];
    // prev 方向转到 e 方向；若 e 的方向和 prev 的外法线反向（朝内拐）→ 凸角
    const turn = e.ux * prev.nx + e.uz * prev.nz;
    e.convexA = turn < 1e-6;
    prev.convexB = e.convexA;
  }
  return out;
}

/**
 * 沿边摆一个盒子。s0..s1 = 沿边区间；o0..o1 = 法向区间（正 = 岛外 / 水面一侧，负 = 岛内）；y0..y1 高度。
 * 返回 Builder.box 的参数（中心 x,z，底 y，w,h,d，ry）。
 */
export function edgeBox(e, s0, s1, o0, o1, y0, y1) {
  const sc = (s0 + s1) / 2;
  const oc = (o0 + o1) / 2;
  const x = e.a[0] + e.ux * sc + e.nx * oc;
  const z = e.a[1] + e.uz * sc + e.nz * oc;
  return [x, y0, z, s1 - s0, y1 - y0, Math.abs(o1 - o0), e.ry];
}

export function putEdgeBox(B, mat, e, s0, s1, o0, o1, y0, y1, collide = false) {
  const [x, y, z, w, h, d, ry] = edgeBox(e, s0, s1, o0, o1, y0, y1);
  B.box(mat, x, y, z, w, h, d, { ry, collide });
}

// 区间相减：[0,len] 去掉 openings → 剩余的若干段
export function subtractRanges(len, holes) {
  const hs = holes.map(([a, b]) => [Math.max(0, a), Math.min(len, b)]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = 0;
  for (const [a, b] of hs) {
    if (a > cur) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < len) out.push([cur, len]);
  // openA / openB：这一端是开口（桥头）而不是转角
  return out.map(([a, b]) => ({ s0: a, s1: b, openA: a > 1e-6, openB: b < len - 1e-6 }));
}

// 多边形裁到轴对齐矩形（Sutherland–Hodgman，裁剪窗口凸，被裁多边形可凹）
function clipRect(poly, x0, z0, x1, z1) {
  let out = poly;
  const planes = [
    (p) => p[0] - x0,
    (p) => x1 - p[0],
    (p) => p[1] - z0,
    (p) => z1 - p[1],
  ];
  for (const f of planes) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i];
      const b = inp[(i + 1) % inp.length];
      const fa = f(a);
      const fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (!out.length) break;
  }
  return out;
}

// 网格线：每 cell 一条，特殊坐标（洞边）吸附到最近的线上或插入，去掉过近的线
function gridLines(a0, a1, cell, specials) {
  const lines = [];
  for (let v = Math.ceil(a0 / cell) * cell; v < a1; v += cell) lines.push({ v, sp: false });
  for (const c of specials) {
    let best = null;
    for (const l of lines) if (!l.sp && Math.abs(l.v - c) < cell * 0.34 && (!best || Math.abs(l.v - c) < Math.abs(best.v - c))) best = l;
    if (best) Object.assign(best, { v: c, sp: true });
    else lines.push({ v: c, sp: true });
  }
  const vs = [a0, a1, ...lines.map((l) => l.v)].filter((v) => v >= a0 && v <= a1).sort((p, q) => p - q);
  return vs.filter((v, i) => i === 0 || v - vs[i - 1] > 1e-3);
}

/**
 * 水平多边形片（世界米 UV），按 cell 米的规则网格切块后三角化：避免大多边形扇形三角化出细长三角形。
 * holes 的边会成为网格线，洞内格子整格剔除（洞须为轴对齐矩形）。
 */
export function flatPolyGeo(poly, y, holes = [], cell = 24) {
  const xs0 = poly.map((p) => p[0]);
  const zs0 = poly.map((p) => p[1]);
  const xs = gridLines(Math.min(...xs0), Math.max(...xs0), cell, holes.flatMap((h) => h.map((p) => p[0])));
  const zs = gridLines(Math.min(...zs0), Math.max(...zs0), cell, holes.flatMap((h) => h.map((p) => p[1])));
  const pos = [];
  for (let k = 0; k < zs.length - 1; k++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const [x0, x1, z0, z1] = [xs[i], xs[i + 1], zs[k], zs[k + 1]];
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      if (holes.some((h) => pointInPoly(cx, cz, h))) continue;
      const piece = clipRect(poly, x0, z0, x1, z1);
      if (piece.length < 3) continue;
      const v2 = piece.map(([x, z]) => new THREE.Vector2(x, z));
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(v2, [])) {
        const [pa, pb, pc] = [piece[a], piece[b], piece[c]];
        // 法线 y 分量 = (b-a)×(c-a) 的 y；为负就交换，保证朝上
        const ny = (pb[1] - pa[1]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[1] - pa[1]);
        for (const q of ny >= 0 ? [pa, pb, pc] : [pa, pc, pb]) pos.push(q[0], y, q[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return metersUV(g, 'planar-y');
}

// 小多边形（如环形路）直接 earcut：y 处朝上；holes 可选
export function flatPolyGeoEarcut(poly, y, holes = []) {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return metersUV(g, 'planar-y');
}

// 薄板（顶面世界米 UV，便于共面同材质重叠时纹理完全一致）
export function slabGeo(x0, z0, x1, z1, y0, y1) {
  const g = boxGeo(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return metersUV(g, 'planar-y');
}

export const rectPoly = ([x0, z0, x1, z1]) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
