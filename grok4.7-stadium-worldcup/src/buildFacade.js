import * as THREE from "three";
import { crownLift, locate, makeLoop, pointOnLoop } from "./bowlMath.js";
import { addBeam, addQuadDir, createBuffer, meshFrom } from "./meshlib.js";

function at(base, dist, offset) {
  const q = pointOnLoop(base, dist);
  return { x: q.x + q.nx * offset, z: q.z + q.nz * offset, nx: q.nx, nz: q.nz };
}

export function buildFacade(program, mats) {
  const base = makeLoop(program.bowl0.hx, program.bowl0.hz, program.bowl0.cr);
  const off = program.roof.outerOff + 3.4;
  const loopLen = (() => {
    const a = at(base, 0, off);
    const b = at(base, 0.5, off);
    // 周长用基准周长加 2π·偏移
    return base.total + Math.PI * 2 * off;
  })();
  void loopLen;
  const spacing = 3.1;
  const count = Math.round((base.total + Math.PI * 2 * off) / spacing);
    const geo = new THREE.BoxGeometry(0.28, 1, 0.72);
  const fins = new THREE.InstancedMesh(geo, mats.lib.ceramic, count);
  fins.userData.matKey = "ceramic";
  fins.castShadow = true;
  fins.receiveShadow = true;
  fins.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const stairHits = program.stairs.map((s) => ({
    ...locate(s.x, s.z, program.bowl0.hx, program.bowl0.hz, program.bowl0.cr),
    width: s.width,
  }));
  const nearStair = (dist) =>
    stairHits.some((h) => {
      let d = Math.abs(h.dist - dist);
      d = Math.min(d, base.total - d);
      return d < h.width * 0.48;
    });
  let kept = 0;
  for (let i = 0; i < count; i++) {
    const dist = (i / count) * base.total;
    if (nearStair(dist)) continue;
    const p = at(base, dist, off);
    const yTop = program.roof.outerY + crownLift(p.x, p.z, program.roof.amp) * 0.85;
    const h = Math.max(8, yTop);
    const depth = 0.85 + 0.45 * (0.5 - 0.5 * Math.cos(4 * Math.atan2(p.z, p.x)));
    dummy.position.set(p.x, h / 2, p.z);
    dummy.rotation.set(0, Math.atan2(p.nx, p.nz), 0);
    dummy.scale.set(1, h, depth);
    dummy.updateMatrix();
    fins.setMatrixAt(kept, dummy.matrix);
    kept++;
  }
  fins.count = kept;

  const girts = createBuffer();
  const samples = 180;
  const girtY = [4.2, 11.5, 19.5];
  for (const y of girtY) {
    for (let i = 0; i < samples; i++) {
      const a = at(base, (i / samples) * base.total, off - 0.15);
      const b = at(base, ((i + 1) / samples) * base.total, off - 0.15);
      addBeam(girts, a.x, y, a.z, b.x, y, b.z, 0.18, 0.42, [0.78, 0.74, 0.68]);
    }
  }
  // 顶部压顶，跟着冠沿走，把鳍片收到屋盖外环上
  for (let i = 0; i < samples; i++) {
    const a = at(base, (i / samples) * base.total, off - 0.2);
    const b = at(base, ((i + 1) / samples) * base.total, off - 0.2);
    const ya = program.roof.outerY + crownLift(a.x, a.z, program.roof.amp) * 0.85;
    const yb = program.roof.outerY + crownLift(b.x, b.z, program.roof.amp) * 0.85;
    addBeam(girts, a.x, ya, a.z, b.x, yb, b.z, 0.55, 0.7, [0.72, 0.68, 0.62]);
  }

  const glassBuf = createBuffer();
  const gOff = off - 1.35;
  const gSamples = 160;
  for (let i = 0; i < gSamples; i++) {
    const a = at(base, (i / gSamples) * base.total, gOff);
    const b = at(base, ((i + 1) / gSamples) * base.total, gOff);
    const blocked = nearStair(((i + 0.5) / gSamples) * base.total);
    if (blocked) continue;
    const y0 = 0.3;
    const y1 = program.levels.lowerConcourse + 3.2;
    addQuadDir(
      glassBuf,
      [a.x, y0, a.z],
      [b.x, y0, b.z],
      [b.x, y1, b.z],
      [a.x, y1, a.z],
      [a.nx, 0, a.nz],
      [0.85, 0.9, 0.88],
    );
  }

  const plinth = createBuffer();
  const p0 = off + 1.1;
  const p1 = off + 7.5;
  for (let i = 0; i < gSamples; i++) {
    if (nearStair(((i + 0.5) / gSamples) * base.total)) continue;
    const a0 = at(base, (i / gSamples) * base.total, p0);
    const b0 = at(base, ((i + 1) / gSamples) * base.total, p0);
    const a1 = at(base, (i / gSamples) * base.total, p1);
    const b1 = at(base, ((i + 1) / gSamples) * base.total, p1);
    addQuadDir(plinth, [a0.x, 0.45, a0.z], [b0.x, 0.45, b0.z], [b1.x, 0.45, b1.z], [a1.x, 0.45, a1.z], [0, 1, 0], [0.72, 0.68, 0.62]);
    addQuadDir(plinth, [a0.x, 0, a0.z], [a1.x, 0, a1.z], [b1.x, 0, b1.z], [b0.x, 0, b0.z], [0, -1, 0], [0.55, 0.52, 0.48]);
    addQuadDir(plinth, [a1.x, 0, a1.z], [a1.x, 0.45, a1.z], [b1.x, 0.45, b1.z], [b1.x, 0, b1.z], [a1.nx, 0, a1.nz], [0.6, 0.56, 0.5]);
  }

  const group = new THREE.Group();
  group.name = "facade";
  group.add(fins);
  group.add(meshFrom(girts, mats.lib.ceramic, "ceramic"));
  const glass = meshFrom(glassBuf, mats.lib.glass, "glass");
  glass.castShadow = false;
  group.add(glass);
  const plinthMesh = meshFrom(plinth, mats.lib.concrete, "concrete");
  group.add(plinthMesh);
  group.userData.explode = new THREE.Vector3(0, 10, 0);
  group.userData.outerOffset = p1;
  return group;
}
