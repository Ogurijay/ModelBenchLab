import * as THREE from "three";
import { crownLift, makeLoop, pointOnLoop } from "./bowlMath.js";
import { addBeam, addQuadDir, createBuffer, meshFrom } from "./meshlib.js";

const STEEL = [0.62, 0.67, 0.72];
const STEEL_D = [0.28, 0.32, 0.38];
const FASCIA = [0.82, 0.78, 0.7];

function at(base, t, offset) {
  const q = pointOnLoop(base, t * base.total);
  return { x: q.x + q.nx * offset, y: 0, z: q.z + q.nz * offset, nx: q.nx, nz: q.nz };
}

export function buildRoof(program, mats) {
  const base = makeLoop(program.bowl0.hx, program.bowl0.hz, program.bowl0.cr);
  const roof = program.roof;
  const count = roof.trusses;
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const inner = at(base, t, -5.2);
    const outer = at(base, t, roof.outerOff);
    const lift = crownLift(inner.x, inner.z, roof.amp);
    nodes.push({
      t,
      ix: inner.x,
      iz: inner.z,
      ox: outer.x,
      oz: outer.z,
      iy: roof.innerY + lift,
      oy: roof.outerY + lift * 0.85,
      nx: outer.nx,
      nz: outer.nz,
    });
  }

  const steel = createBuffer();
  const skin = createBuffer();
  const depth = roof.depth;
  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % count];
    // 径向桁架：上弦、下弦、腹杆
    addBeam(steel, a.ix, a.iy, a.iz, a.ox, a.oy, a.oz, 0.42, 0.55, STEEL);
    addBeam(steel, a.ix, a.iy + depth, a.iz, a.ox, a.oy + depth, a.oz, 0.38, 0.48, STEEL);
    const segs = 4;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      const x0 = a.ix + (a.ox - a.ix) * t0;
      const y0 = a.iy + (a.oy - a.iy) * t0;
      const z0 = a.iz + (a.oz - a.iz) * t0;
      const x1 = a.ix + (a.ox - a.ix) * t1;
      const y1 = a.iy + (a.oy - a.iy) * t1;
      const z1 = a.iz + (a.oz - a.iz) * t1;
      if (s % 2 === 0) addBeam(steel, x0, y0, z0, x1, y1 + depth, z1, 0.18, 0.22, STEEL_D);
      else addBeam(steel, x0, y0 + depth, z0, x1, y1, z1, 0.18, 0.22, STEEL_D);
    }
    addBeam(steel, a.ix, a.iy, a.iz, a.ix, a.iy + depth, a.iz, 0.28, 0.28, STEEL_D);
    addBeam(steel, a.ox, a.oy, a.oz, a.ox, a.oy + depth, a.oz, 0.34, 0.34, STEEL_D);

    // 环梁
    addBeam(steel, a.ix, a.iy, a.iz, b.ix, b.iy, b.iz, 0.7, 1.15, STEEL);
    addBeam(steel, a.ox, a.oy + depth, a.oz, b.ox, b.oy + depth, b.oz, 0.85, 1.35, STEEL);
    // 内圈檐口，盖住看台前缘，本身是一根有厚度的箱梁
    addBeam(steel, a.ix, a.iy - 0.9, a.iz, b.ix, b.iy - 0.9, b.iz, 1.25, 0.7, FASCIA);

    // 膜屋面：落在上弦之上，双向留出桁架的缝
    const inset = 0.08;
    const liftPanel = 0.18;
    const p00 = [a.ix + (a.ox - a.ix) * inset, a.iy + depth + liftPanel, a.iz + (a.oz - a.iz) * inset];
    const p10 = [a.ix + (a.ox - a.ix) * (1 - inset * 0.4), a.oy + depth + liftPanel, a.iz + (a.oz - a.iz) * (1 - inset * 0.4)];
    const p11 = [b.ix + (b.ox - b.ix) * (1 - inset * 0.4), b.oy + depth + liftPanel, b.iz + (b.oz - b.iz) * (1 - inset * 0.4)];
    const p01 = [b.ix + (b.ox - b.ix) * inset, b.iy + depth + liftPanel, b.iz + (b.oz - b.iz) * inset];
    const dn = 0.22;
    const q = (p) => [p[0], p[1] - dn, p[2]];
    addQuadDir(skin, p00, p10, p11, p01, [0, 1, 0], [0.95, 0.93, 0.88]);
    addQuadDir(skin, q(p00), q(p01), q(p11), q(p10), [0, -1, 0], [0.9, 0.86, 0.78]);

    // 桅柱，锚在外环之下，穿过外围
    addBeam(steel, a.ox, 0, a.oz, a.ox, a.oy, a.oz, 0.85, 1.15, STEEL_D);
  }

  const group = new THREE.Group();
  group.name = "roof";
  const steelMesh = meshFrom(steel, mats.lib.steel, "steel");
  const skinMesh = meshFrom(skin, mats.lib.membrane, "membrane");
  skinMesh.castShadow = true;
  skinMesh.receiveShadow = true;
  group.add(steelMesh, skinMesh);

  const floods = [];
  for (let i = 0; i < 8; i++) {
    const node = nodes[Math.round((i / 8) * count) % count];
    const housing = createBuffer();
    addBeam(housing, node.ix, node.iy - 1.6, node.iz, node.ix, node.iy - 0.3, node.iz, 1.8, 0.7, [0.2, 0.22, 0.26]);
    const lamp = meshFrom(housing, mats.lib.lamp, "lamp");
    group.add(lamp);
    floods.push({
      x: node.ix - node.nx * 0.2,
      y: node.iy - 1.2,
      z: node.iz - node.nz * 0.2,
    });
  }

  group.userData.explode = new THREE.Vector3(0, 28, 0);
  return { group, floods };
}
