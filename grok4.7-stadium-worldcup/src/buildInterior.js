import * as THREE from "three";
import { locate, makeLoop, pointOnLoop } from "./bowlMath.js";
import { addBeam, addQuadDir, createBuffer, meshFrom } from "./meshlib.js";

const STONE = [0.78, 0.74, 0.68];
const PLASTER = [0.86, 0.82, 0.74];
const WOOD = [0.62, 0.42, 0.28];

function at(base, dist, offset) {
  const q = pointOnLoop(base, dist);
  return { x: q.x + q.nx * offset, z: q.z + q.nz * offset, nx: q.nx, nz: q.nz, tx: -q.nz, tz: q.nx };
}

function annulus(buf, base, off0, off1, y, samples, skip) {
  const slab = 0.28;
  for (let i = 0; i < samples; i++) {
    const d0 = (i / samples) * base.total;
    const d1 = ((i + 1) / samples) * base.total;
    if (skip && skip((d0 + d1) / 2)) continue;
    const a0 = at(base, d0, off0);
    const b0 = at(base, d1, off0);
    const a1 = at(base, d0, off1);
    const b1 = at(base, d1, off1);
    addQuadDir(buf, [a0.x, y, a0.z], [b0.x, y, b0.z], [b1.x, y, b1.z], [a1.x, y, a1.z], [0, 1, 0], STONE);
    addQuadDir(
      buf,
      [a0.x, y - slab, a0.z],
      [a1.x, y - slab, a1.z],
      [b1.x, y - slab, b1.z],
      [b0.x, y - slab, b0.z],
      [0, -1, 0],
      [0.6, 0.56, 0.5],
    );
  }
}

function flight(buf, nav, ox, oz, nx, nz, tx, tz, steps, riser, tread, width, y0) {
  for (let i = 0; i < steps; i++) {
    const v = (i + 0.5) * tread;
    const y = y0 + (i + 0.5) * riser;
    const yTop = y0 + (i + 1) * riser;
    const cx = ox + nx * v;
    const cz = oz + nz * v;
    addBeam(
      buf,
      cx - tx * width * 0.5,
      y,
      cz - tz * width * 0.5,
      cx + tx * width * 0.5,
      y,
      cz + tz * width * 0.5,
      Math.max(0.08, tread - 0.02),
      Math.max(0.08, riser - 0.015),
      STONE,
    );
    nav.push({
      cx,
      cz,
      tx,
      tz,
      nx,
      nz,
      halfL: width * 0.5,
      halfD: tread * 0.52,
      yTop,
    });
  }
}

function wallRing(buf, base, offset, y0, y1, samples, skip, inward) {
  for (let i = 0; i < samples; i++) {
    const d0 = (i / samples) * base.total;
    const d1 = ((i + 1) / samples) * base.total;
    if (skip && skip((d0 + d1) / 2)) continue;
    const a = at(base, d0, offset);
    const b = at(base, d1, offset);
    const dir = inward ? [-a.nx, 0, -a.nz] : [a.nx, 0, a.nz];
    addQuadDir(buf, [a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z], [a.x, y1, a.z], dir, PLASTER);
  }
}

export function buildInterior(program, mats) {
  const base = makeLoop(program.bowl0.hx, program.bowl0.hz, program.bowl0.cr);
  const bowl = program.bowl0;
  const nav = [];
  const floors = [];
  const buf = createBuffer();
  const wood = createBuffer();
  const glass = createBuffer();

  const lowerIn = program.lower.backOffset + 0.55;
  const lowerOut = program.club.frontOffset - 0.7;
  const clubIn = program.club.backOffset + 0.45;
  const clubOut = program.upper.backOffset + 1.1;
  const upperIn = program.upper.backOffset + 0.45;
  const upperOut = program.roof.outerOff + 0.4;
  const yL = program.levels.lowerConcourse;
  const yC = program.levels.clubConcourse;
  const yU = program.levels.upperConcourse;

  const hits = program.stairs.map((s) => ({
    ...s,
    ...locate(s.x, s.z, bowl.hx, bowl.hz, bowl.cr),
  }));
  const near = (dist, pad) =>
    hits.some((h) => {
      let d = Math.abs(h.dist - dist);
      d = Math.min(d, base.total - d);
      return d < (pad ?? h.width * 0.5);
    });
  const nearMajor = (dist) => near(dist, 7) && hits.some((h) => h.major && Math.min(Math.abs(h.dist - dist), base.total - Math.abs(h.dist - dist)) < 7);

  annulus(buf, base, lowerIn, lowerOut, yL, 140, (d) => near(d, 6));
  annulus(buf, base, clubIn, clubOut, yC, 160, (d) => nearMajor(d));
  annulus(buf, base, upperIn, upperOut, yU, 170, (d) => nearMajor(d));
  floors.push({ kind: "ring", off0: lowerIn, off1: lowerOut, y: yL, holes: hits });
  floors.push({ kind: "ring", off0: clubIn, off1: clubOut, y: yC, holes: hits.filter((h) => h.major) });
  floors.push({ kind: "ring", off0: upperIn, off1: upperOut, y: yU, holes: hits.filter((h) => h.major) });

  // 环廊内墙，通道口留空
  const bay = program.bays.bay;
  const gang = program.bays.gang;
  const door = (dist) => {
    const f = (dist % bay) / bay;
    return f >= 1 - gang / bay - 0.01;
  };
  wallRing(buf, base, lowerIn, yL, yL + 3.4, 150, door, true);
  wallRing(buf, base, clubIn, yC, yC + 3.2, 160, door, true);

  // 天花灯槽
  const lights = createBuffer();
  for (const [off0, off1, y, n] of [
    [lowerIn + 1, lowerOut - 1, yL + 4.15, 80],
    [clubIn + 1, clubOut - 1, yC + 3.8, 90],
  ]) {
    for (let i = 0; i < n; i++) {
      const a = at(base, (i / n) * base.total, (off0 + off1) / 2);
      const b = at(base, ((i + 1) / n) * base.total, (off0 + off1) / 2);
      addBeam(lights, a.x, y, a.z, b.x, y, b.z, 0.28, 0.08, [1, 0.9, 0.75]);
    }
  }

  // 十六座直跑楼梯：环廊外缘降到场坪
  const startOff = lowerOut;
  const endOff = program.roof.outerOff + 3.4 + 8.2;
  for (const h of hits) {
    const rise = yL;
    const run = endOff - startOff;
    const steps = Math.max(12, Math.round(rise / 0.155));
    const origin = at(base, h.dist, startOff);
    flight(buf, nav, origin.x, origin.z, origin.nx, origin.nz, origin.tx, origin.tz, steps, rise / steps, run / steps, h.width - 0.5, 0);
  }

  // 四座主入口再向上：下层环廊 → 俱乐部环廊（向外爬升）
  for (const h of hits.filter((s) => s.major)) {
    const rise = yC - yL;
    const run = Math.max(8, clubIn - lowerOut);
    const steps = Math.max(10, Math.round(rise / 0.16));
    const origin = at(base, h.dist, lowerOut);
    flight(buf, nav, origin.x, origin.z, origin.nx, origin.nz, origin.tx, origin.tz, steps, rise / steps, run / steps, Math.min(h.width, 8) - 0.4, yL);
    // 俱乐部 → 上层，在重叠环带里做折返
    const mid = at(base, h.dist, (upperIn + clubOut) / 2);
    const rise2 = yU - yC;
    const half = Math.max(8, Math.round(rise2 / 2 / 0.16));
    const tread = Math.min(6.2, (h.width - 1.2) / half);
    flight(buf, nav, mid.x - mid.tx * 0.2, mid.z - mid.tz * 0.2, mid.tx, mid.tz, mid.nx, mid.nz, half, rise2 / (half * 2), tread, 3.2, yC);
    const back = {
      x: mid.x - mid.tx * 0.2 + mid.tx * half * tread,
      z: mid.z - mid.tz * 0.2 + mid.tz * half * tread,
    };
    flight(buf, nav, back.x + mid.nx * 2.4, back.z + mid.nz * 2.4, -mid.tx, -mid.tz, -mid.nx, -mid.nz, half, rise2 / (half * 2), tread, 3.2, yC + rise2 / 2);
  }

  // 包厢
  for (const room of program.vipRooms) {
    const y = room.y;
    const h = room.h;
    const x0 = room.xOut;
    const x1 = room.xIn;
    const z0 = room.z0;
    const z1 = room.z1;
    addQuadDir(wood, [x0, y + 0.04, z0], [x0, y + 0.04, z1], [x1 - 0.15, y + 0.04, z1], [x1 - 0.15, y + 0.04, z0], [0, 1, 0], WOOD);
    addQuadDir(buf, [x0, y + h, z1], [x1, y + h, z1], [x1, y + h, z0], [x0, y + h, z0], [0, -1, 0], PLASTER);
    const zMid = (z0 + z1) / 2;
    const doorW = 1.2;
    addQuadDir(buf, [x0, y, z0], [x0, y, zMid - doorW / 2], [x0, y + h, zMid - doorW / 2], [x0, y + h, z0], [-1, 0, 0], PLASTER);
    addQuadDir(buf, [x0, y, zMid + doorW / 2], [x0, y, z1], [x0, y + h, z1], [x0, y + h, zMid + doorW / 2], [-1, 0, 0], PLASTER);
    addQuadDir(buf, [x0, y + 2.15, zMid - doorW / 2], [x0, y + 2.15, zMid + doorW / 2], [x0, y + h, zMid + doorW / 2], [x0, y + h, zMid - doorW / 2], [-1, 0, 0], PLASTER);
    addQuadDir(buf, [x0, y, z0], [x1, y, z0], [x1, y + h, z0], [x0, y + h, z0], [0, 0, -1], PLASTER);
    addQuadDir(buf, [x1, y, z1], [x0, y, z1], [x0, y + h, z1], [x1, y + h, z1], [0, 0, 1], PLASTER);
    addQuadDir(glass, [x1, y + 0.15, z0 + 0.12], [x1, y + 0.15, z1 - 0.12], [x1, y + h - 0.15, z1 - 0.12], [x1, y + h - 0.15, z0 + 0.12], [1, 0, 0], [0.8, 0.9, 0.88]);
    floors.push({ kind: "box", x0: x0 + 0.2, x1: x1 - 0.2, z0: z0 + 0.15, z1: z1 - 0.15, y: y + 0.04 });
  }

  // 球员通道与更衣室、新闻发布厅（西看台下方）
  const mouth = program.tunnel.mouthX;
  const inner = program.tunnel.innerX;
  const half = program.tunnel.halfW;
  const th = program.tunnel.clearH;
  addQuadDir(buf, [inner, 0, -half], [mouth, 0, -half], [mouth, 0, half], [inner, 0, half], [0, 1, 0], [0.45, 0.44, 0.42]);
  addQuadDir(buf, [inner, th, -half], [inner, th, half], [mouth, th, half], [mouth, th, -half], [0, -1, 0], [0.4, 0.4, 0.4]);
  addQuadDir(buf, [inner, 0, -half], [inner, th, -half], [mouth, th, -half], [mouth, 0, -half], [0, 0, -1], [0.5, 0.48, 0.46]);
  addQuadDir(buf, [mouth, 0, half], [mouth, th, half], [inner, th, half], [inner, 0, half], [0, 0, 1], [0.5, 0.48, 0.46]);
  // 灯
  addBeam(lights, inner + 1, th - 0.15, 0, mouth - 1, th - 0.15, 0, 0.18, 0.08, [0.8, 0.88, 1]);
  floors.push({ kind: "box", x0: Math.min(inner, mouth), x1: Math.max(inner, mouth), z0: -half + 0.15, z1: half - 0.15, y: 0.02 });

  const rooms = [
    { name: "主队更衣室", x0: inner + 0.4, x1: inner + 16, z0: half, z1: half + 12 },
    { name: "客队更衣室", x0: inner + 0.4, x1: inner + 16, z0: -half - 12, z1: -half },
    { name: "新闻发布厅", x0: inner + 0.4, x1: inner + 18, z0: half + 14, z1: half + 28 },
  ];
  for (const room of rooms) {
    const y1 = 3.15;
    addQuadDir(
      wood,
      [room.x0, 0.02, room.z0],
      [room.x1, 0.02, room.z0],
      [room.x1, 0.02, room.z1],
      [room.x0, 0.02, room.z1],
      [0, 1, 0],
      room.name.includes("新闻") ? STONE : WOOD,
    );
    addQuadDir(buf, [room.x0, y1, room.z1], [room.x1, y1, room.z1], [room.x1, y1, room.z0], [room.x0, y1, room.z0], [0, -1, 0], PLASTER);
    addQuadDir(buf, [room.x0, 0, room.z0], [room.x0, 0, room.z1], [room.x0, y1, room.z1], [room.x0, y1, room.z0], [-1, 0, 0], PLASTER);
    addQuadDir(buf, [room.x1, 0, room.z1], [room.x1, 0, room.z0], [room.x1, y1, room.z0], [room.x1, y1, room.z1], [1, 0, 0], PLASTER);
    const tunnelSide = room.z0 > 0 ? room.z0 : room.z1;
    const open0 = room.x0 + 1.2;
    const open1 = room.x0 + 3.1;
    const dir = room.z0 > 0 ? -1 : 1;
    addQuadDir(buf, [room.x0, 0, tunnelSide], [open0, 0, tunnelSide], [open0, y1, tunnelSide], [room.x0, y1, tunnelSide], [0, 0, dir], PLASTER);
    addQuadDir(buf, [open1, 0, tunnelSide], [room.x1, 0, tunnelSide], [room.x1, y1, tunnelSide], [open1, y1, tunnelSide], [0, 0, dir], PLASTER);
    addQuadDir(buf, [open0, 2.15, tunnelSide], [open1, 2.15, tunnelSide], [open1, y1, tunnelSide], [open0, y1, tunnelSide], [0, 0, dir], PLASTER);
    const far = room.z0 > 0 ? room.z1 : room.z0;
    addQuadDir(buf, [room.x0, 0, far], [room.x1, 0, far], [room.x1, y1, far], [room.x0, y1, far], [0, 0, -dir], PLASTER);
    const zLo = Math.min(room.z0, room.z1);
    const zHi = Math.max(room.z0, room.z1);
    floors.push({
      kind: "box",
      x0: room.x0 + 0.15,
      x1: room.x1 - 0.15,
      z0: room.z0 > 0 ? tunnelSide - 0.4 : zLo + 0.1,
      z1: room.z0 > 0 ? zHi - 0.1 : tunnelSide + 0.4,
      y: 0.02,
      name: room.name,
    });
  }
  floors.push({ kind: "box", x0: inner + 0.5, x1: inner + 4.2, z0: half + 11.5, z1: half + 14.4, y: 0.02, name: "媒体廊" });
  addBeam(wood, inner + 2, 0.42, -half - 4, inner + 12, 0.42, -half - 4, 0.42, 0.08, WOOD);
  addBeam(wood, inner + 3, 0.76, half + 20, inner + 14, 0.76, half + 20, 1.25, 0.08, WOOD);
  addBeam(buf, inner + 1, 1.7, half + 27.7, inner + 16, 1.7, half + 27.7, 0.12, 2.4, [0.22, 0.24, 0.28]);

  const group = new THREE.Group();
  group.name = "interior";
  group.add(meshFrom(buf, mats.lib.stone, "stone"));
  group.add(meshFrom(wood, mats.lib.wood, "wood"));
  const gmesh = meshFrom(glass, mats.lib.glass, "glass");
  gmesh.castShadow = false;
  group.add(gmesh);
  const lmesh = meshFrom(lights, mats.lib.emitWarm, "emitWarm");
  lmesh.castShadow = false;
  group.add(lmesh);
  group.userData.explode = new THREE.Vector3(0, -8, 0);

  return {
    group,
    nav,
    floors,
    bowl,
    baseTotal: base.total,
    nearDist: (x, z) => locate(x, z, bowl.hx, bowl.hz, bowl.cr),
  };
}

export function interiorFloor(interior, x, z) {
  let best = null;
  for (const step of interior.nav) {
    const dx = x - step.cx;
    const dz = z - step.cz;
    const u = dx * step.tx + dz * step.tz;
    const v = dx * step.nx + dz * step.nz;
    if (Math.abs(u) <= step.halfL && Math.abs(v) <= step.halfD) {
      if (best == null || step.yTop > best) best = step.yTop;
    }
  }
  for (const f of interior.floors) {
    if (f.kind === "box") {
      if (x >= Math.min(f.x0, f.x1) && x <= Math.max(f.x0, f.x1) && z >= Math.min(f.z0, f.z1) && z <= Math.max(f.z0, f.z1)) {
        if (best == null || f.y > best) best = f.y;
      }
    } else if (f.kind === "ring") {
      const hit = locate(x, z, interior.bowl.hx, interior.bowl.hz, interior.bowl.cr);
      if (hit.offset >= f.off0 && hit.offset <= f.off1) {
        const blocked = f.holes.some((h) => {
          let d = Math.abs(h.dist - hit.dist);
          d = Math.min(d, interior.baseTotal - d);
          return d < h.width * 0.42;
        });
        if (!blocked && (best == null || f.y > best)) best = f.y;
      }
    }
  }
  return best;
}
