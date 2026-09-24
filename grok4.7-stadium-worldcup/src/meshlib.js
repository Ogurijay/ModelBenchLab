import * as THREE from "three";

const UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const BP = UNIT.attributes.position.array;
const BN = UNIT.attributes.normal.array;

export function createBuffer() {
  return {
    n: 0,
    p: new Float32Array(4096 * 9),
    m: new Float32Array(4096 * 9),
    c: new Float32Array(4096 * 9),
  };
}

function grow(buf, extra) {
  const need = buf.n + extra;
  if (need <= buf.p.length) return;
  let len = buf.p.length;
  while (len < need) len *= 2;
  const p = new Float32Array(len);
  const m = new Float32Array(len);
  const c = new Float32Array(len);
  p.set(buf.p);
  m.set(buf.m);
  c.set(buf.c);
  buf.p = p;
  buf.m = m;
  buf.c = c;
}

function triNormal(a, b, c) {
  const ax = b[0] - a[0];
  const ay = b[1] - a[1];
  const az = b[2] - a[2];
  const bx = c[0] - a[0];
  const by = c[1] - a[1];
  const bz = c[2] - a[2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

export function addTri(buf, a, b, c, color) {
  const n = triNormal(a, b, c);
  const col = color || [0.75, 0.75, 0.75];
  grow(buf, 9);
  for (const p of [a, b, c]) {
    buf.p[buf.n] = p[0];
    buf.m[buf.n] = n[0];
    buf.c[buf.n] = col[0];
    buf.n++;
    buf.p[buf.n] = p[1];
    buf.m[buf.n] = n[1];
    buf.c[buf.n] = col[1];
    buf.n++;
    buf.p[buf.n] = p[2];
    buf.m[buf.n] = n[2];
    buf.c[buf.n] = col[2];
    buf.n++;
  }
}

export function addQuadDir(buf, a, b, c, d, dir, color) {
  const n = triNormal(a, b, c);
  const dot = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2];
  if (dot >= 0) {
    addTri(buf, a, b, c, color);
    addTri(buf, a, c, d, color);
  } else {
    addTri(buf, a, d, c, color);
    addTri(buf, a, c, b, color);
  }
}

/** 梁轴从 a 到 b。截面 width × depth，depth 沿截面“上”方向。 */
export function addBeam(buf, ax, ay, az, bx, by, bz, width, depth, color) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  const tx = dx / len;
  const ty = dy / len;
  const tz = dz / len;
  let hx = 0;
  let hy = 1;
  let hz = 0;
  if (Math.abs(ty) > 0.92) {
    hx = 1;
    hy = 0;
  }
  let sx = hy * tz - hz * ty;
  let sy = hz * tx - hx * tz;
  let sz = hx * ty - hy * tx;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl;
  sy /= sl;
  sz /= sl;
  const ux = ty * sz - tz * sy;
  const uy = tz * sx - tx * sz;
  const uz = tx * sy - ty * sx;
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2;
  const cz = (az + bz) / 2;
  const col = color || [0.62, 0.66, 0.7];
  grow(buf, BP.length);
  for (let i = 0; i < BP.length; i += 3) {
    const x = BP[i] * width;
    const y = BP[i + 1] * depth;
    const z = BP[i + 2] * len;
    buf.p[buf.n] = cx + sx * x + ux * y + tx * z;
    buf.m[buf.n] = sx * BN[i] + ux * BN[i + 1] + tx * BN[i + 2];
    buf.c[buf.n] = col[0];
    buf.n++;
    buf.p[buf.n] = cy + sy * x + uy * y + ty * z;
    buf.m[buf.n] = sy * BN[i] + uy * BN[i + 1] + ty * BN[i + 2];
    buf.c[buf.n] = col[1];
    buf.n++;
    buf.p[buf.n] = cz + sz * x + uz * y + tz * z;
    buf.m[buf.n] = sz * BN[i] + uz * BN[i + 1] + tz * BN[i + 2];
    buf.c[buf.n] = col[2];
    buf.n++;
  }
}

export function toGeometry(buf) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf.p.subarray(0, buf.n), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(buf.m.subarray(0, buf.n), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(buf.c.subarray(0, buf.n), 3));
  return geo;
}

export function meshFrom(buf, material, key) {
  const mesh = new THREE.Mesh(toGeometry(buf), material);
  mesh.userData.matKey = key;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
