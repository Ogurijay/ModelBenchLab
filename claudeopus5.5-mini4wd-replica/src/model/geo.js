// 程序化几何工具。单位毫米；车身坐标：+x 车头、+y 向上、+z 车身右侧。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth01 = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const smoothstep = (a, b, v) => smooth01((v - a) / (b - a));

// 单调三次插值曲线：pts=[[x,y],...]（自动按 x 排序）；第三项为 'k' 时该点为折点（两侧单边切线）。
// 越界取端点值，不外推。
export function curve(pts) {
  pts = [...pts].sort((a, b) => a[0] - b[0]);
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  if (n === 1) return () => ys[0];
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / ((xs[i + 1] - xs[i]) || 1e-9));
  const mL = new Array(n), mR = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) { mL[i] = mR[i] = d[0]; continue; }
    if (i === n - 1) { mL[i] = mR[i] = d[n - 2]; continue; }
    if (pts[i][2] === 'k') { mL[i] = d[i - 1]; mR[i] = d[i]; continue; }
    const m = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    mL[i] = mR[i] = m;
  }
  // Fritsch–Carlson：限制切线避免过冲
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(d[i]) < 1e-12) { mR[i] = 0; mL[i + 1] = 0; continue; }
    const a = mR[i] / d[i], b = mL[i + 1] / d[i], s = a * a + b * b;
    if (a < 0) mR[i] = 0;
    if (b < 0) mL[i + 1] = 0;
    if (s > 9) { const t = 3 / Math.sqrt(s); mR[i] = t * a * d[i]; mL[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const h = xs[hi] - xs[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * mR[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * mL[hi];
  };
}

// 分段线性
export function linear(pts) {
  pts = [...pts].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  return x => {
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0; while (x > pts[i + 1][0]) i++;
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return lerp(pts[i][1], pts[i + 1][1], t);
  };
}

// 采样站位：[a,b] 均匀步长并并入断点（保证折线处有截面）
export function stations(a, b, step, extra = []) {
  const n = Math.max(1, Math.ceil((b - a) / step));
  const s = new Set();
  for (let i = 0; i <= n; i++) s.add(+(a + (b - a) * i / n).toFixed(4));
  for (const e of extra) if (e > a && e < b) s.add(+e.toFixed(4));
  return [...s].sort((p, q) => p - q);
}

// 多边形圆角。r 为数字或逐点数组；某点 r 为 0/假值即保持尖角。
// 圆角点输出 seg+1 个点、尖角点输出 1 个点，点数只取决于 r 的“是否为 0”，保证放样拓扑稳定。
export function fillet(pts, r, { closed = true, seg = 3 } = {}) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], R = Array.isArray(r) ? r[i] : r;
    if (!R || (!closed && (i === 0 || i === n - 1))) { out.push([p[0], p[1]]); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    let ok = la > 1e-6 && lb > 1e-6, ang = 0;
    if (ok) {
      ax /= la; ay /= la; bx /= lb; by /= lb;
      ang = Math.acos(clamp(ax * bx + ay * by, -1, 1));
      ok = ang < Math.PI - 1e-3 && ang > 1e-3;
    }
    if (!ok) { for (let k = 0; k <= seg; k++) out.push([p[0], p[1]]); continue; }
    const t = Math.min(R / Math.tan(ang / 2), la * 0.5, lb * 0.5);
    const p1 = [p[0] + ax * t, p[1] + ay * t], p2 = [p[0] + bx * t, p[1] + by * t];
    for (let k = 0; k <= seg; k++) {
      const s = k / seg, q = (1 - s) * (1 - s), w = 2 * (1 - s) * s, e = s * s;
      out.push([q * p1[0] + w * p[0] + e * p2[0], q * p1[1] + w * p[1] + e * p2[1]]);
    }
  }
  return out;
}

// 将半截面（从中线顶部 z=0 向外、向下）镜像成完整闭合截面，方向满足 loftX 外法线要求。
// half: [[z,y],...]，z≥0；结果从左下经顶部到右下。
export function mirrorHalf(half, r = 0, seg = 3) {
  const center = Math.abs(half[0][0]) < 1e-6;
  const left = half.slice(center ? 1 : 0).reverse().map(([z, y]) => [-z, y]);
  const pts = [...left, ...half];
  if (!r) return pts;
  const rr = Array.isArray(r) ? r : half.map(() => r);
  const radii = [...rr.slice(center ? 1 : 0).reverse(), ...rr];
  return fillet(pts, radii, { seg });
}

// 截面多边形朝向（u=z 水平, v=y 垂直）面积符号
function signedArea2(pts) {
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

// 环列放样：rings 为 [[x,y,z],...] 的数组，各环点数相同。
export function loftRings(rings, { closed = true, capStart = true, capEnd = true } = {}) {
  const nr = rings.length, np = rings[0].length;
  const pos = [], uv = [], idx = [];
  // 沿环弧长作 u，沿站位作 v
  for (let i = 0; i < nr; i++) {
    const ring = rings[i];
    let L = 0; const acc = [0];
    for (let j = 1; j < np; j++) { L += Math.hypot(ring[j][0] - ring[j - 1][0], ring[j][1] - ring[j - 1][1], ring[j][2] - ring[j - 1][2]); acc.push(L); }
    for (let j = 0; j < np; j++) { pos.push(ring[j][0], ring[j][1], ring[j][2]); uv.push(L > 0 ? acc[j] / L : 0, nr > 1 ? i / (nr - 1) : 0); }
  }
  const segs = closed ? np : np - 1;
  for (let i = 0; i < nr - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % np;
      const a = i * np + j, b = i * np + j2, c = (i + 1) * np + j2, d = (i + 1) * np + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  // 外法线校正：用每环中心判断朝向
  let score = 0;
  const P = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
  const centers = rings.map(r => { const c = [0, 0, 0]; for (const p of r) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return c.map(v => v / r.length); });
  for (let t = 0; t < idx.length; t += 6) {
    const A = P(idx[t]), B = P(idx[t + 1]), C = P(idx[t + 2]);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ci = centers[Math.floor(idx[t] / np)];
    score += nx * (A[0] - ci[0]) + ny * (A[1] - ci[1]) + nz * (A[2] - ci[2]);
  }
  if (score < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  const flip = score < 0;
  // 端盖：独立顶点，保持硬边
  const addCap = (ring, dirSign) => {
    const pts = dedupe(ring);
    if (pts.length < 3) return;
    const nrm = newell(pts);
    if (Math.hypot(...nrm) < 1e-6) return;
    const [ex, ey] = basis(nrm);
    const c2 = pts.map(p => new THREE.Vector2(dot(p, ex), dot(p, ey)));
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(c2, []); } catch { return; }
    const base = pos.length / 3;
    for (const p of pts) { pos.push(p[0], p[1], p[2]); uv.push(0, 0); }
    // 盖面法线应沿放样方向的 dirSign
    const axis = sub(centers[dirSign > 0 ? nr - 1 : 0], centers[dirSign > 0 ? Math.max(0, nr - 2) : Math.min(nr - 1, 1)]);
    let want = norm(axis);
    if (Math.hypot(...want) < 1e-6) want = nrm;
    for (const f of faces) {
      const A = pts[f[0]], B = pts[f[1]], C = pts[f[2]];
      const n = cross(sub(B, A), sub(C, A));
      if (dot(n, want) >= 0) idx.push(base + f[0], base + f[1], base + f[2]);
      else idx.push(base + f[0], base + f[2], base + f[1]);
    }
  };
  if (capStart && nr > 1) addCap(rings[0], -1);
  if (capEnd && nr > 1) addCap(rings[nr - 1], +1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.flipped = flip;
  return g;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function newell(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm(n);
}
function basis(n) {
  const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const ex = norm(cross(t, n)), ey = cross(n, ex);
  return [ex, ey];
}
function dedupe(ring) {
  const out = [];
  for (const p of ring) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-4) out.push(p); }
  if (out.length > 2) { const a = out[0], b = out[out.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-4) out.pop(); }
  return out;
}

// 沿 x 放样：section(x) → [[z,y],...]
export function loftX(xs, section, opts) {
  return loftRings(xs.map(x => section(x).map(([z, y]) => [x, y, z])), opts);
}
// 沿 z 放样（翼面等横向件）：section(z) → [[x,y],...]
export function loftZ(zs, section, opts) {
  return loftRings(zs.map(z => section(z).map(([x, y]) => [x, y, z])), opts);
}
// 沿 y 放样（立柱、尾鳍）：section(y) → [[x,z],...]
export function loftY(ys, section, opts) {
  return loftRings(ys.map(y => section(y).map(([x, z]) => [x, y, z])), opts);
}

// 顶面雕刻截面：俯视外缘 zl..zr，顶面高度 top(z)，底 bottom；顶角倒圆 r。
// 返回 loftX 用的闭合 [[z,y]]（左下→顶→右下）。zsTop 可传入顶面采样 z（含折线位置）。
export function topSection({ zl, zr, top, bottom, n = 14, r = 1, seg = 2, draftL = 0, draftR = 0, zsTop = null, rBottom = 0 }) {
  const zs = zsTop || Array.from({ length: n + 1 }, (_, i) => lerp(zl, zr, i / n));
  const pts = [[zl + draftL, bottom]];
  for (const z of zs) pts.push([z, top(z)]);
  pts.push([zr - draftR, bottom]);
  const radii = pts.map((_, i) => (i === 1 || i === pts.length - 2) ? r : ((i === 0 || i === pts.length - 1) ? rBottom : 0));
  return fillet(pts, radii, { seg });
}

// 椭圆/超椭圆截面：中心 (cz, cy)，半宽 a、半高 b，指数 p（2=椭圆，越大越方），点数 n
export function superEllipse(cz, cy, a, b, p = 2.5, n = 32, { yMin = -Infinity } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = -Math.PI / 2 - (i / n) * Math.PI * 2; // 顺时针（z 右、y 上）
    const c = Math.cos(t), s = Math.sin(t);
    const z = cz + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / p);
    const y = cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / p);
    out.push([z, Math.max(yMin, y)]);
  }
  return out;
}

// 平面挤出：shape 点 [[u,v]] 在给定平面内，沿法线挤出 depth（居中），可选倒角
// plane: 'xy'（沿 z 挤出）| 'xz'（沿 y 挤出）| 'zy'（沿 x 挤出）
export function extrude(shapePts, depth, { plane = 'xy', offset = 0, bevel = 0, bevelSeg = 2, holes = [], curveSeg = 12 } = {}) {
  const shape = new THREE.Shape(shapePts.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9,
    bevelOffset: -bevel * 0.9, bevelSegments: bevelSeg, curveSegments: curveSeg, steps: 1,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2 + offset);
  if (plane === 'xz') g.rotateX(Math.PI / 2);          // (u,v)->(x,z)，沿 y 挤出
  else if (plane === 'zy') g.rotateY(-Math.PI / 2);    // (u,v)->(z,y)，沿 x 挤出
  return g;
}

// 管道扫掠：path 为 THREE.Curve，radius(t)，可做波纹软管
export function sweep(path, radius, { segments = 64, radial = 10, closed = false } = {}) {
  const frames = path.computeFrenetFrames(segments, closed);
  const rings = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = path.getPointAt(t), N = frames.normals[i], B = frames.binormals[i], r = typeof radius === 'function' ? radius(t) : radius;
    const ring = [];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      ring.push([p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z)]);
    }
    rings.push(ring);
  }
  return loftRings(rings, { closed: true, capStart: !closed, capEnd: !closed });
}

// z 镜像（左右对称件），翻转三角形绕序
export function mirrorZ(geo) {
  const g = geo.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -p.getZ(i));
  if (g.attributes.normal) { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setZ(i, -n.getZ(i)); }
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }
  else {
    const flipAttr = attr => { const s = attr.itemSize, arr = attr.array; for (let i = 0; i < attr.count; i += 3) for (let k = 0; k < s; k++) { const t = arr[(i + 1) * s + k]; arr[(i + 1) * s + k] = arr[(i + 2) * s + k]; arr[(i + 2) * s + k] = t; } attr.needsUpdate = true; };
    for (const k of Object.keys(g.attributes)) flipAttr(g.attributes[k]);
  }
  return g;
}

// 自身 + 镜像合并
export function withMirror(geo) { return merge([geo, mirrorZ(geo)]); }

// 合并几何（统一为非索引或索引、统一属性）
export function merge(list) {
  const geos = list.filter(Boolean).map(g => {
    let h = g.index ? g.toNonIndexed() : g.clone();
    if (!h.attributes.uv) h.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(h.attributes.position.count * 2), 2));
    if (!h.attributes.normal) h.computeVertexNormals();
    for (const k of Object.keys(h.attributes)) if (!['position', 'normal', 'uv'].includes(k)) h.deleteAttribute(k);
    h.morphAttributes = {};
    return h;
  });
  if (!geos.length) return new THREE.BufferGeometry();
  return mergeGeometries(geos, false);
}

// 变换几何（平移/旋转/缩放）便捷函数
export function xf(g, { t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], order = 'XYZ' } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...t), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], order)), new THREE.Vector3(...s));
  g.applyMatrix4(m);
  return g;
}

// 圆柱（轴向 x/y/z），可选倒角端面
export function cyl(r1, r2, len, { axis = 'y', seg = 24, at = [0, 0, 0], open = false } = {}) {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, open);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(...at);
  return g;
}

export function box(w, h, d, at = [0, 0, 0]) { const g = new THREE.BoxGeometry(w, h, d); g.translate(...at); return g; }

// 圆角盒：用 topSection 放样，较 BoxGeometry 更像注塑件
export function roundBox(x0, x1, z0, z1, y0, y1, r = 0.6, step = 0) {
  const xs = step ? stations(x0, x1, step) : [x0, x0 + Math.min(r, (x1 - x0) / 3), x1 - Math.min(r, (x1 - x0) / 3), x1];
  return loftX(xs, x => {
    const k = Math.min(1, Math.min(x - x0, x1 - x) / Math.max(r, 1e-3));
    const inset = r * (1 - Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k))));
    return fillet([[z0 + inset, y0], [z0 + inset, y1 - inset], [z1 - inset, y1 - inset], [z1 - inset, y0]], [0, r, r, 0], { seg: 2 });
  });
}

// 车轮用旋转体：profile [[r, x],...]（半径, 轴向位置），绕 z 轴（车轮轴）旋转
export function lathe(profile, { seg = 40 } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.rotateX(Math.PI / 2); // 旋转轴 y→z
  return g;
}
