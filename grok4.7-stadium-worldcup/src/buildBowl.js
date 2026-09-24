import * as THREE from "three";
import { locate, makeLoop, sampleRadial } from "./bowlMath.js";
import { addBeam, addQuadDir, createBuffer, meshFrom } from "./meshlib.js";

const CONCRETE = [0.78, 0.74, 0.68];
const RISER = [0.55, 0.52, 0.48];
const GANG = [0.64, 0.63, 0.6];
const STEEL = [0.55, 0.6, 0.66];

function xz(pts, i) {
  return [pts[i * 3], pts[i * 3 + 2]];
}

function gapAt(nx, z) {
  return nx < -0.9 && Math.abs(z) < 4.6;
}

function buildShell(tier, program, base, withGap) {
  const buf = createBuffer();
  const nos = tier.nosings;
  const lip = sampleRadial(base, tier.backOffset, program.samples, tier.backY);
  const rings = nos.map((n) => n.pts);
  rings.push(lip.pts);
  const norms = nos.map((n) => n.nrm);
  norms.push(lip.nrm);
  const ys = nos.map((n) => n.y);
  ys.push(tier.backY);
  const n = program.samples;
  let minRise = Infinity;
  for (let i = 1; i < tier.profile.risers.length; i++) minRise = Math.min(minRise, tier.profile.risers[i]);
  const slab = Math.min(0.28, Math.max(0.18, minRise * 0.72));
  const { bay, gang } = program.bays;

  const gangHit = (i) => {
    const dist = (i / n) * base.total;
    const f = (dist % bay) / bay;
    return f >= 1 - gang / bay;
  };

  for (let row = 0; row < ys.length - 1; row++) {
    const inner = rings[row];
    const outer = rings[row + 1];
    const y = ys[row];
    const yb = y - slab;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ni = norms[row][i * 2];
      const zi = inner[i * 3 + 2];
      const nj = norms[row][j * 2];
      const zj = inner[j * 3 + 2];
      if (withGap && row < 8 && (gapAt(ni, zi) || gapAt(nj, zj))) continue;
      const a = [inner[i * 3], y, zi];
      const b = [inner[j * 3], y, zj];
      const c = [outer[j * 3], y, outer[j * 3 + 2]];
      const d = [outer[i * 3], y, outer[i * 3 + 2]];
      const col = gangHit(i) ? GANG : CONCRETE;
      addQuadDir(buf, a, b, c, d, [0, 1, 0], col);
      addQuadDir(
        buf,
        [a[0], yb, a[2]],
        [d[0], yb, d[2]],
        [c[0], yb, c[2]],
        [b[0], yb, b[2]],
        [0, -1, 0],
        [0.62, 0.58, 0.53],
      );
      if (row === ys.length - 2) {
        const nx = norms[row + 1][i * 2];
        const nz = norms[row + 1][i * 2 + 1];
        addQuadDir(
          buf,
          d,
          c,
          [c[0], yb, c[2]],
          [d[0], yb, d[2]],
          [nx, 0, nz],
          RISER,
        );
      }
    }
  }

  for (let row = 1; row < ys.length - 1; row++) {
    const ring = rings[row];
    const nrm = norms[row];
    const y0 = ys[row - 1];
    const y1 = ys[row];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ni = nrm[i * 2];
      const zi = ring[i * 3 + 2];
      if (withGap && row < 8 && (gapAt(ni, zi) || gapAt(nrm[j * 2], ring[j * 3 + 2]))) continue;
      const inward = [-ni, 0, -nrm[i * 2 + 1]];
      addQuadDir(
        buf,
        [ring[i * 3], y0, zi],
        [ring[j * 3], y0, ring[j * 3 + 2]],
        [ring[j * 3], y1, ring[j * 3 + 2]],
        [ring[i * 3], y1, zi],
        inward,
        RISER,
      );
    }
  }

  // 首排前缘挡墙，落到场地
  const front = rings[0];
  const fn = norms[0];
  const yTop = ys[0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (withGap && (gapAt(fn[i * 2], front[i * 3 + 2]) || gapAt(fn[j * 2], front[j * 3 + 2]))) continue;
    const x0 = front[i * 3];
    const z0 = front[i * 3 + 2];
    const x1 = front[j * 3];
    const z1 = front[j * 3 + 2];
    const nx = fn[i * 2];
    const nz = fn[i * 2 + 1];
    const t = 0.5;
    const a = [x0 - nx * 0.02, 0, z0 - nz * 0.02];
    const b = [x1 - nx * 0.02, 0, z1 - nz * 0.02];
    const c = [x1 - nx * 0.02, yTop, z1 - nz * 0.02];
    const d = [x0 - nx * 0.02, yTop, z0 - nz * 0.02];
    const e = [x0 - nx * t, 0, z0 - nz * t];
    const f = [x1 - nx * t, 0, z1 - nz * t];
    const g = [x1 - nx * t, yTop, z1 - nz * t];
    const h = [x0 - nx * t, yTop, z0 - nz * t];
    addQuadDir(buf, a, b, c, d, [-nx, 0, -nz], RISER);
    addQuadDir(buf, e, h, g, f, [nx, 0, nz], CONCRETE);
    addQuadDir(buf, d, c, g, h, [0, 1, 0], CONCRETE);
    addQuadDir(buf, a, e, f, b, [0, -1, 0], CONCRETE);
    // 栏板
    addQuadDir(
      buf,
      [x0, yTop, z0],
      [x1, yTop, z1],
      [x1, yTop + 0.72, z1],
      [x0, yTop + 0.72, z0],
      [-nx, 0, -nz],
      [0.7, 0.66, 0.6],
    );
  }
  return { buf, slab };
}

function seatGeometry() {
  const buf = createBuffer();
  const steel = [0.35, 0.36, 0.38];
  const shell = [1, 1, 1];
  addBeam(buf, -0.16, 0.2, 0.02, -0.16, 0.2, 0.02, 0.035, 0.4, steel);
  // addBeam with zero length is unsafe. Use finite posts.
  return null;
}

function buildSeatGeo() {
  const buf = createBuffer();
  const metal = [0.72, 0.73, 0.75];
  addBeam(buf, -0.155, 0, 0.04, -0.155, 0.4, 0.04, 0.028, 0.22, metal);
  addBeam(buf, 0.155, 0, 0.04, 0.155, 0.4, 0.04, 0.028, 0.22, metal);
  addBeam(buf, 0, 0.4, 0.05, 0, 0.4, 0.05, 0.44, 0.05, [1, 1, 1]);
  // zero-length beam collapses. Build the pan as a short beam along X.
  return buf;
}

function solidSeat() {
  const buf = createBuffer();
  const metal = [0.78, 0.79, 0.8];
  const body = [1, 1, 1];
  // 两条支腿
  addBeam(buf, -0.16, 0.0, 0.02, -0.16, 0.39, 0.02, 0.03, 0.2, metal);
  addBeam(buf, 0.16, 0.0, 0.02, 0.16, 0.39, 0.02, 0.03, 0.2, metal);
  // 座板，沿 X
  addBeam(buf, -0.215, 0.415, 0.06, 0.215, 0.415, 0.06, 0.34, 0.048, body);
  // 靠背
  addBeam(buf, -0.21, 0.66, -0.1, 0.21, 0.66, -0.1, 0.045, 0.4, body);
  // 靠背与座板的连接板
  addBeam(buf, 0, 0.5, -0.06, 0, 0.5, 0.02, 0.4, 0.04, metal);
  return buf;
}

function wheelGeo() {
  const buf = createBuffer();
  addBeam(buf, -0.38, 0.06, 0.05, 0.38, 0.06, 0.05, 0.7, 0.08, [1, 1, 1]);
  addBeam(buf, 0, 0.28, -0.22, 0, 0.28, -0.22, 0.62, 0.36, [1, 1, 1]);
  // the second beam is zero length if start===end. Fix by giving the back a width along X via the beam's width/depth and a tiny run.
  return buf;
}

function wheelSolid() {
  const buf = createBuffer();
  addBeam(buf, -0.36, 0.05, 0.08, 0.36, 0.05, 0.08, 0.62, 0.07, [1, 1, 1]);
  addBeam(buf, -0.28, 0.32, -0.18, 0.28, 0.32, -0.18, 0.05, 0.42, [1, 1, 1]);
  return buf;
}

function makeInstances(geo, material, seats, program, accept) {
  let count = 0;
  for (let i = 0; i < seats.count; i++) if (accept(i)) count++;
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, count));
  mesh.userData.matKey = "seat";
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let k = 0;
  for (let i = 0; i < seats.count; i++) {
    if (!accept(i)) continue;
    const nx = seats.nx[i];
    const nz = seats.nz[i];
    dummy.position.set(seats.x[i], seats.y[i], seats.z[i]);
    dummy.rotation.set(0, Math.atan2(-nx, -nz), 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(k, dummy.matrix);
    color.setRGB(seats.r[i] / 255, seats.g[i] / 255, seats.b[i] / 255);
    mesh.setColorAt(k, color);
    k++;
  }
  mesh.count = count;
  if (count === 0) mesh.visible = false;
  return mesh;
}

function addRakers(group, tier, program, base, mats, yDrop) {
  const buf = createBuffer();
  const n = 28;
  for (let i = 0; i < n; i++) {
    const dist = ((i + 0.5) / n) * base.total;
    const a = sampleRadial(base, tier.frontOffset + 0.6, 1, 0);
    // sampleRadial with n=1 only gives the first point. Use radial via locate's loop.
    void a;
    void dist;
  }
  // 直接用基准环上的点
  const { makePoint } = { makePoint: null };
  void makePoint;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const inner = pointRadial(base, t, tier.frontOffset + 1.2);
    const outer = pointRadial(base, t, tier.backOffset - 0.4);
    addBeam(
      buf,
      inner.x,
      tier.frontY - yDrop,
      inner.z,
      outer.x,
      tier.backY - yDrop - 0.4,
      outer.z,
      0.55,
      1.15,
      STEEL,
    );
  }
  const mesh = meshFrom(buf, mats.lib.steel, "steel");
  mesh.castShadow = true;
  group.add(mesh);
}

function pointRadial(base, t, offset) {
  const p = base.pieces ? null : null;
  void p;
  const dist = t * base.total;
  let d = dist % base.total;
  if (d < 0) d += base.total;
  for (const piece of base.pieces) {
    if (d <= piece.end + 1e-6) {
      const u = piece.len < 1e-8 ? 0 : Math.min(1, Math.max(0, (d - piece.start) / piece.len));
      const q = piece.at(u);
      return { x: q.x + q.nx * offset, z: q.z + q.nz * offset };
    }
  }
  const q = base.pieces[0].at(0);
  return { x: q.x + q.nx * offset, z: q.z + q.nz * offset };
}

export function buildBowl(program, mats) {
  const base = makeLoop(program.bowl0.hx, program.bowl0.hz, program.bowl0.cr);
  const root = new THREE.Group();
  root.name = "bowl";
  const tiers = {
    lower: program.lower,
    club: program.club,
    upper: program.upper,
  };
  const groups = {};
  for (const id of ["lower", "club", "upper"]) {
    const tier = tiers[id];
    const g = new THREE.Group();
    g.name = id;
    const shell = buildShell(tier, program, base, id === "lower");
    g.add(meshFrom(shell.buf, mats.lib.concrete, "concrete"));
    addRakers(g, tier, program, base, mats, id === "upper" ? 1.5 : 1.35);
    groups[id] = g;
    root.add(g);
  }

  const seatGeo = solidSeatGeo(solidSeat());
  const wheel = solidSeatGeo(wheelSolid());
  const seats = program.seats;
  const bowl0 = program.bowl0;
  const which = (i) => {
    const kind = seats.kind[i];
    if (kind === 0) return "lower";
    if (kind === 1 || kind === 3 || kind === 4) return "club";
    if (kind === 2) return "upper";
    const hit = locate(seats.x[i], seats.z[i], bowl0.hx, bowl0.hz, bowl0.cr);
    if (hit.offset < program.lower.backOffset + 0.5) return "lower";
    if (hit.offset >= program.club.frontOffset - 0.4 && seats.y[i] < program.club.backY + 0.6) return "club";
    return "upper";
  };
  for (const id of ["lower", "club", "upper"]) {
    groups[id].add(makeInstances(seatGeo, mats.lib.seat, seats, program, (i) => which(i) === id && seats.kind[i] !== 5));
    groups[id].add(makeInstances(wheel, mats.lib.seat, seats, program, (i) => which(i) === id && seats.kind[i] === 5));
  }
  return { group: root, parts: groups };
}

function solidSeatGeo(buf) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(buf.p.subarray(0, buf.n), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(buf.m.subarray(0, buf.n), 3));
  return geo;
}
