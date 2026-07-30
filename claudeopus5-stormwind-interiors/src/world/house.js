// 程序化民居 / 店铺 / 工坊生成器 —— 本项目的核心。
// 每栋房子都是"真空心"的:墙体由带洞口的 Shape 拉伸而成,门窗洞既是几何缺口也是碰撞缺口,
// 所以推门进屋、上二楼、贴着窗户往外看,全都不是特效,而是几何本身成立。
import * as THREE from 'three';
import {
  box, boxOn, cyl, cone, lathe, gableRoof, hipRoof, gableEnd,
  wallWithOpenings, stairs, aabbOn, boxesTransform, balustrade,
} from '../core/geom.js';
import {
  Collector, placer, table, bench, stool, chair, bed, chest, shelf, barrel, crate, sack,
  fireplace, forgeHearth, anvil, counter, rug, chandelier, wallLantern, tapestry, bookshelf, kitchenClutter,
} from './interior.js';

const BASE = 0.34;           // 室内地坪标高(门口天然形成一级门槛)
const WALL_T = 0.34;
const FLOOR_H = [3.62, 3.18, 3.0];

/** 楼板开洞:把一块板切成最多 4 块矩形,给楼梯留井口。 */
function slabRects(w, d, hole) {
  const full = [[-w / 2, -d / 2, w / 2, d / 2]];
  if (!hole) return full;
  const [hx0, hz0, hx1, hz1] = hole;
  const out = [];
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  if (hz0 > z0) out.push([x0, z0, x1, Math.min(hz0, z1)]);
  if (hz1 < z1) out.push([x0, Math.max(hz1, z0), x1, z1]);
  const mz0 = Math.max(hz0, z0), mz1 = Math.min(hz1, z1);
  if (mz1 > mz0) {
    if (hx0 > x0) out.push([x0, mz0, Math.min(hx0, x1), mz1]);
    if (hx1 < x1) out.push([Math.max(hx1, x0), mz0, x1, mz1]);
  }
  return out.filter((r) => r[2] - r[0] > 0.05 && r[3] - r[1] > 0.05);
}

/** 一扇窗:框 + 中梃 + 玻璃 + 窗台(+ 可选百叶与花箱)。全部生成在墙的局部坐标系。 */
function windowDressing(p, o, t, opts = {}) {
  const { w, h, x, y } = o;
  const fr = 0.09;
  p.add('timberDark', boxOn(w + fr * 2, fr, 0.16, x, y + h, t / 2 + 0.02));
  p.add('timberDark', boxOn(w + fr * 2, fr, 0.16, x, y - fr, t / 2 + 0.02));
  for (const s of [-1, 1]) p.add('timberDark', boxOn(fr, h, 0.16, x + s * (w / 2 + fr / 2), y, t / 2 + 0.02));
  // 玻璃与中梃
  p.add('glass', boxOn(w - 0.04, h - 0.04, 0.05, x, y + 0.02, 0));
  p.add('timberDark', boxOn(0.055, h, 0.1, x, y, 0.02));
  p.add('timberDark', boxOn(w, 0.055, 0.1, x, y + h * 0.55, 0.02));
  // 窗台
  p.add('stoneTrim', boxOn(w + 0.36, 0.1, 0.34, x, y - fr - 0.1, t / 2 + 0.04));
  if (opts.shutters) {
    for (const s of [-1, 1]) {
      const g = boxOn(w * 0.52, h * 0.96, 0.06, 0, 0, 0);
      g.rotateY(s * 1.15);
      g.translate(x + s * (w / 2 + 0.12), y, t / 2 + 0.12);
      p.add(opts.shutterMat || 'plankDark', g);
    }
  }
  if (opts.flowers) {
    p.add('plankDark', boxOn(w * 0.9, 0.22, 0.3, x, y - fr - 0.32, t / 2 + 0.2));
    for (let i = 0; i < 4; i++) {
      const fx = x + (i / 3 - 0.5) * w * 0.7;
      p.add('foliage', cyl(0.1, 0.06, 0.16, 6, fx, y - fr - 0.12, t / 2 + 0.2));
      p.add(i % 2 ? 'clothRed' : 'clothCream', cyl(0.055, 0.03, 0.09, 5, fx, y - fr + 0.02, t / 2 + 0.2));
    }
  }
}

/** 一扇门:门框 + 敞开的门扇 + 门槛石。 */
function doorDressing(p, o, t, rng, arch) {
  const { w, h, x, y } = o;
  const fr = 0.12;
  for (const s of [-1, 1]) p.add('timberDark', boxOn(fr, h, 0.2, x + s * (w / 2 + fr / 2), y, t / 2 + 0.02));
  if (!arch) p.add('timberDark', boxOn(w + fr * 2, fr, 0.2, x, y + h, t / 2 + 0.02));
  else {
    p.add('stoneTrim', boxOn(w + 0.5, 0.16, 0.24, x, y + h + 0.02, t / 2 + 0.03));
  }
  // 门扇:铰接在一侧,朝室内敞开约 78°
  const side = rng.chance(0.5) ? 1 : -1;
  const dw = w - 0.06, dh = h - 0.05;
  const leaf = boxOn(dw, dh, 0.07, dw / 2, 0, 0);
  const planks = [];
  for (let i = 0; i < 3; i++) planks.push(boxOn(dw * 0.9, 0.07, 0.03, dw / 2, 0.35 + i * (dh - 0.9) / 2, -0.05));
  const ang = -side * 1.36;
  for (const g of [leaf, ...planks]) {
    g.rotateY(ang);
    g.translate(x - side * dw / 2, y, -t / 2);
    p.add(g === leaf ? 'plankDark' : 'iron', g);
  }
  // 把手 + 门槛
  p.add('iron', cyl(0.035, 0.035, 0.12, 6, x + side * (w / 2 - 0.18), y + 1.05, -t / 2 - 0.1));
  p.add('stoneTrim', boxOn(w + 0.5, 0.16, 0.5, x, -0.16, t / 2 + 0.14));
}

/** 在一面墙上排布窗洞。 */
function layoutWindows(width, level, rng, { skipCenter = 0, sill = 1.05, wW = 1.08, wH = 1.42 } = {}) {
  const usable = width - 1.4;
  const n = Math.max(0, Math.floor(usable / 2.6));
  if (n <= 0) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = -usable / 2 + (usable / n) * (i + 0.5);
    if (Math.abs(x) < skipCenter) continue;
    out.push({ x, y: sill, w: wW, h: wH });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  室内布置
 * ------------------------------------------------------------------ */

function furnishGround(p, kind, iw, id, rng, ceilY) {
  const bz = -id / 2 + 0.45, fz = id / 2 - 0.5;
  const lx = -iw / 2 + 0.5, rx = iw / 2 - 0.5;
  if (kind !== 'forge' && kind !== 'warehouse') {
    rug(p.at(0.2, 0, 0.4), Math.min(iw - 1.6, 3), Math.min(id - 2.4, 2), rng.chance(0.5) ? 'carpet' : 'clothGreen');
  }

  if (kind === 'forge') {
    forgeHearth(p.at(0, 0, bz + 0.4));
    anvil(p.at(rng.range(-0.6, 0.6), 0, 0.4));
    barrel(p.at(rx - 0.4, 0, fz - 0.6), 0.4, 0.9);
    crate(p.at(lx + 0.4, 0, fz - 0.8), 0.66);
    crate(p.at(lx + 0.45, 0.66, fz - 0.85), 0.5);
    p.at(lx + 0.3, 0, 0).add('ironDark', boxOn(0.1, 1.6, 1.6, 0, 1.0, 0));
    for (let i = 0; i < 4; i++) {
      p.at(lx + 0.45, 0, -0.6 + i * 0.4).add('ironDark', cyl(0.03, 0.03, 0.7, 5, 0, 1.2, 0));
    }
    wallLantern(p.at(rx, 0, bz + 1.2, -Math.PI / 2), 2.1, true);
  } else if (kind === 'tavern') {
    counter(p.at(-0.3, 0, bz + 0.6), Math.min(iw - 2.2, 4.2));
    for (let i = 0; i < 3; i++) barrel(p.at(rx - 0.5, 0, bz + 0.5 + i * 0.9, Math.PI / 2), 0.32, 0.8);
    const rows = id > 8 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const tz = fz - 1.6 - r * 2.6;
      table(p.at(-0.6, 0, tz), 1.6, 0.9);
      stool(p.at(-1.7, 0, tz - 0.2));
      stool(p.at(0.5, 0, tz + 0.3));
      if (iw > 7) { table(p.at(iw / 2 - 2.2, 0, tz), 1.3, 0.85); stool(p.at(iw / 2 - 3.1, 0, tz)); }
    }
    fireplace(p.at(lx + 0.1, 0, 0.6, Math.PI / 2), 1.9, true);
    chandelier(p.at(0, 0, 0.4), Math.min(ceilY - 0.7, 2.9), 0.6, 6);
    kitchenClutter(p.at(lx + 0.9, 0, 0.6), rng);
  } else if (kind === 'shop') {
    counter(p.at(0, 0, 0.6), Math.min(iw - 1.8, 3.6));
    shelf(p.at(0, 0, bz + 0.25), Math.min(iw - 1.6, 2.6), 2.0, rng, true);
    shelf(p.at(rx - 0.05, 0, -0.4, -Math.PI / 2), Math.min(id - 3, 2.2), 1.8, rng, true);
    crate(p.at(lx + 0.5, 0, fz - 0.9), 0.6);
    barrel(p.at(lx + 0.5, 0, fz - 2.0), 0.3, 0.78);
    wallLantern(p.at(lx + 0.06, 0, 0.2, Math.PI / 2), 2.2, false);
    chandelier(p.at(0, 0, -0.2), Math.min(ceilY - 0.8, 2.8), 0.42, 4);
  } else if (kind === 'warehouse') {
    for (let i = 0; i < 7; i++) {
      const cx = rng.range(lx + 0.6, rx - 0.6), cz = rng.range(bz + 0.5, fz - 0.8);
      const s = rng.range(0.55, 0.8);
      crate(p.at(cx, 0, cz, rng.range(0, 1.5)), s);
      if (rng.chance(0.5)) crate(p.at(cx + rng.range(-0.1, 0.1), s, cz), s * 0.85);
    }
    for (let i = 0; i < 4; i++) barrel(p.at(rng.range(lx, rx), 0, rng.range(bz, fz)), 0.34, 0.86);
    for (let i = 0; i < 3; i++) sack(p.at(rng.range(lx, rx), 0, rng.range(bz, fz)), 0.28);
    wallLantern(p.at(0, 0, bz - 0.2), 2.6, false);
  } else {
    // 普通住家:灶间 + 餐桌
    fireplace(p.at(rng.range(-0.6, 0.6), 0, bz + 0.05), Math.min(iw - 1.4, 2.0), true);
    kitchenClutter(p.at(rng.range(-1.4, -0.6), 0, bz + 0.5), rng);
    table(p.at(0.1, 0, 0.5), Math.min(iw - 2.4, 1.8), 0.95);
    bench(p.at(0.1, 0, 1.15), Math.min(iw - 2.6, 1.5));
    if (rng.chance(0.6)) chair(p.at(0.1, 0, -0.25, Math.PI));
    shelf(p.at(rx - 0.1, 0, -0.6, -Math.PI / 2), Math.min(id - 3.4, 1.8), 1.8, rng, true);
    if (rng.chance(0.6)) chest(p.at(lx + 0.4, 0, fz - 0.8));
    if (rng.chance(0.5)) barrel(p.at(lx + 0.45, 0, fz - 1.9), 0.3, 0.78);
    wallLantern(p.at(lx + 0.06, 0, 0.4, Math.PI / 2), 2.2, false);
  }
}

function furnishUpper(p, iw, id, rng, level, ceilY) {
  const bz = -id / 2 + 0.6, fz = id / 2 - 0.6;
  const lx = -iw / 2 + 0.6, rx = iw / 2 - 0.6;
  bed(p.at(rx - 0.7, 0, bz + 0.9, rng.chance(0.5) ? 0 : Math.PI));
  if (iw > 7.5 && rng.chance(0.55)) bed(p.at(lx + 0.7, 0, bz + 0.9), 1.0, 1.9);
  chest(p.at(rng.range(-0.5, 0.5), 0, fz - 0.5, Math.PI));
  if (rng.chance(0.5)) table(p.at(lx + 0.8, 0, 0.4), 1.0, 0.7);
  if (rng.chance(0.45)) chair(p.at(lx + 0.8, 0, 1.2, Math.PI));
  if (rng.chance(0.4)) bookshelf(p.at(lx + 0.3, 0, bz + 0.4), 1.3, Math.min(2.0, ceilY - 0.5), rng);
  if (rng.chance(0.5)) rug(p.at(0, 0, 0.2), Math.min(iw - 2, 2.2), Math.min(id - 2.6, 1.6), 'carpet');
  if (rng.chance(0.55)) tapestry(p.at(0, 1.0, -id / 2 + 0.12), 1.0, 1.5, rng.chance(0.5) ? 'bannerRoyal' : 'bannerCrimson');
  if (rng.chance(0.6)) wallLantern(p.at(rx + 0.5, 0, 0.2, -Math.PI / 2), 2.0, false);
  else chandelier(p.at(0, 0, 0), Math.min(ceilY - 0.7, 2.6), 0.36, 4);
}

/* ------------------------------------------------------------------ *
 *  主生成器
 * ------------------------------------------------------------------ */

export function makeHouse(plot, rng) {
  const shell = new Collector();     // 外壳(墙/门窗/装饰)
  const roofC = new Collector();     // 屋顶(可整体掀开)
  const inner = new Collector();     // 室内(按距离显隐)
  const boxes = [];

  const kind = plot.forge ? 'forge'
    : plot.kind === 'warehouse' ? 'warehouse'
      : plot.shop ? (rng.chance(0.34) ? 'tavern' : 'shop')
        : 'house';

  const floors = Math.max(1, plot.floors);
  const w0 = plot.w, d0 = plot.d;
  const jetty = plot.timber && floors >= 2 ? 0.5 : 0;      // 上层出挑
  const wallMatGround = plot.style === 'harbor' || kind === 'warehouse' ? 'plank' : 'stone';
  const wallMatUpper = plot.plaster;

  const P = placer(shell, plot.x, 0, plot.z, plot.yaw);
  const PI = placer(inner, plot.x, 0, plot.z, plot.yaw);
  const PR = placer(roofC, plot.x, 0, plot.z, plot.yaw);

  const levelY = [BASE];
  for (let i = 0; i < floors; i++) levelY.push(levelY[i] + FLOOR_H[Math.min(i, 2)]);
  const topY = levelY[floors];

  /* ---- 台基 ---- */
  // 碰撞盒必须顶到 BASE(室内地坪),否则人会陷进地板 34cm
  P.add('stoneDark', boxOn(w0 + 0.5, BASE + 0.5, d0 + 0.5, 0, -0.5, 0));
  P.box(aabbOn(0, -0.5, 0, w0 + 0.5, BASE + 0.5, d0 + 0.5));

  /* ---- 逐层墙体 ---- */
  const dims = [];
  for (let lv = 0; lv < floors; lv++) {
    const grow = lv === 0 ? 0 : jetty;
    dims.push({ w: w0 + grow, d: d0 + grow });
  }

  let doorX = 0;
  for (let lv = 0; lv < floors; lv++) {
    const { w, d } = dims[lv];
    const y = levelY[lv];
    const h = FLOOR_H[Math.min(lv, 2)];
    const mat = lv === 0 ? wallMatGround : wallMatUpper;

    // 出挑楼板与牛腿
    if (lv > 0 && jetty > 0) {
      P.add('plankDark', boxOn(w, 0.26, d, 0, y - 0.26, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const g = boxOn(0.16, 0.34, 0.5, sx * (w / 2 - 0.4), y - 0.6, sz * (d / 2 - 0.3));
        P.add('timberDark', g);
      }
    }

    for (let side = 0; side < 4; side++) {
      const front = side === 0;
      const along = side < 2 ? w : d - WALL_T * 2;
      const ry = [0, Math.PI, Math.PI / 2, -Math.PI / 2][side];
      const off = side < 2 ? d / 2 - WALL_T / 2 : w / 2 - WALL_T / 2;
      const ox = side === 2 ? off : side === 3 ? -off : 0;
      const oz = side === 0 ? off : side === 1 ? -off : 0;

      const openings = [];
      let door = null;
      if (front && lv === 0) {
        const dw = 1.42, dh = 2.52;
        doorX = rng.range(-1, 1) * Math.max(0, along / 2 - dw / 2 - 1.5);
        const arch = wallMatGround === 'stone' && rng.chance(0.45);
        door = { x: doorX, y: 0, w: dw, h: dh, arch };
        openings.push(door);
        if (kind === 'shop' || kind === 'tavern') {
          const sx = doorX > 0 ? -1 : 1;
          const bw = Math.min(2.3, along / 2 - 0.9);
          if (bw > 1.2) openings.push({ x: doorX + sx * (dw / 2 + bw / 2 + 0.5), y: 0.92, w: bw, h: 1.5, shop: true });
        } else {
          // 门洞左右才排窗:与门 X 区间相交的一律剔除
          for (const o of layoutWindows(along, lv, rng, {})) {
            if (Math.abs(o.x - doorX) < (o.w + dw) / 2 + 0.55) continue;
            openings.push(o);
          }
        }
      } else if (kind === 'warehouse' && lv === 0 && side === 1) {
        openings.push({ x: 0, y: 0, w: Math.min(3.4, along - 2), h: 3.0, big: true });
      } else {
        const sill = lv === 0 ? 1.05 : 0.92;
        for (const o of layoutWindows(along, lv, rng, { sill, wW: lv === 0 ? 1.05 : 1.12, wH: lv === 0 ? 1.35 : 1.45 })) openings.push(o);
      }

      // 墙:先在局部立起来(y 抬到本层标高),再转到朝向,最后平移到墙位
      const wall = wallWithOpenings({ width: along, height: h, thickness: WALL_T, openings });
      const g = wall.geo;
      g.translate(0, y, 0);
      if (ry) g.rotateY(ry);
      g.translate(ox, 0, oz);
      P.add(mat, g);

      const localBoxes = wall.boxes.map((b) => [b[0], b[1] + y, b[2], b[3], b[4] + y, b[5]]);
      for (const b of boxesTransform(localBoxes, ox, 0, oz, ry)) P.box(b);

      // 门窗构件
      const wp = P.at(ox, y, oz, ry);
      for (const o of openings) {
        if (o === door) doorDressing(wp, o, WALL_T, rng, o.arch);
        else if (o.big) {
          for (const s of [-1, 1]) {
            const leaf = boxOn(o.w / 2 - 0.05, o.h - 0.06, 0.08, 0, 0, 0);
            leaf.rotateY(s * 1.2);
            leaf.translate(o.x + s * (o.w / 2), o.y, -WALL_T / 2 - 0.1);
            wp.add('plank', leaf);
          }
        } else {
          windowDressing(wp, o, WALL_T, {
            shutters: !o.shop && rng.chance(0.42),
            shutterMat: rng.chance(0.5) ? 'plankDark' : 'clothBlue',
            flowers: !o.shop && lv >= 1 && rng.chance(0.36),
          });
        }
      }

      // 半木构架:上层露明木构
      if (lv > 0 && plot.timber) {
        const t = 0.14;
        wp.add('timberDark', boxOn(along, 0.2, t, 0, 0, WALL_T / 2 + t / 2));
        wp.add('timberDark', boxOn(along, 0.2, t, 0, h - 0.2, WALL_T / 2 + t / 2));
        for (const s of [-1, 1]) wp.add('timberDark', boxOn(0.22, h, t, s * (along / 2 - 0.11), 0, WALL_T / 2 + t / 2));
        const posts = Math.max(1, Math.round(along / 2.4));
        for (let i = 1; i < posts; i++) {
          wp.add('timberDark', boxOn(0.18, h, t, -along / 2 + (along / posts) * i, 0, WALL_T / 2 + t / 2));
        }
        if (rng.chance(0.5)) {
          for (let i = 0; i < posts; i++) {
            const cx = -along / 2 + (along / posts) * (i + 0.5);
            const br = boxOn(0.16, h * 0.86, t, 0, 0, 0);
            br.rotateZ((i % 2 ? 1 : -1) * 0.42);
            br.translate(cx, h * 0.08, WALL_T / 2 + t / 2);
            wp.add('timberDark', br);
          }
        }
      }
    }

    /* ---- 楼板 / 天花 ---- */
    const inW = dims[lv].w - WALL_T * 2, inD = dims[lv].d - WALL_T * 2;
    if (lv === 0) {
      PI.add('plank', boxOn(inW, 0.1, inD, 0, BASE - 0.1, 0));
    }
    // 上一层楼板(带楼梯井)
    if (lv < floors - 1) {
      const nxt = dims[lv + 1];
      const runLen = Math.min(inD - 2.6, 4.6);
      const stepN = Math.max(9, Math.round(FLOOR_H[Math.min(lv, 2)] / 0.213));
      const run = runLen / stepN;
      const stairW = 1.06;
      const sx = -inW / 2 + stairW / 2 + 0.12;
      const sz = -inD / 2 + 0.3;
      const st = stairs(stepN, stairW, FLOOR_H[Math.min(lv, 2)] / stepN, run, { x: sx, y: levelY[lv], z: sz });
      for (const g of st.geos) PI.add('plank', g);
      for (const b of st.boxes) PI.box(b);
      const hole = [sx - stairW / 2 - 0.1, sz + runLen - 1.5, sx + stairW / 2 + 0.1, sz + runLen + 0.55];
      for (const r of slabRects(nxt.w - WALL_T * 2, nxt.d - WALL_T * 2, hole)) {
        const cw = r[2] - r[0], cd = r[3] - r[1];
        PI.add('plank', boxOn(cw, 0.24, cd, (r[0] + r[2]) / 2, levelY[lv + 1] - 0.24, (r[1] + r[3]) / 2));
        PI.box(aabbOn((r[0] + r[2]) / 2, levelY[lv + 1] - 0.24, (r[1] + r[3]) / 2, cw, 0.24, cd));
      }
      // 井口护栏
      PI.add('plankDark', boxOn(stairW + 0.2, 0.85, 0.08, sx, levelY[lv + 1], sz + runLen + 0.6));
    } else {
      // 顶层:露明屋架
      const beams = Math.max(2, Math.round(dims[lv].d / 2.2));
      for (let i = 0; i < beams; i++) {
        const bz = -dims[lv].d / 2 + (dims[lv].d / beams) * (i + 0.5);
        PI.add('timberDark', boxOn(inW + 0.2, 0.2, 0.2, 0, topY - 0.2, bz));
      }
    }

    /* ---- 家具 ---- */
    const fp = PI.at(0, levelY[lv], 0);
    const ceil = FLOOR_H[Math.min(lv, 2)];
    if (lv === 0) furnishGround(fp, kind, inW, inD, rng, ceil);
    else furnishUpper(fp, inW, inD, rng, lv, ceil);
  }

  /* ---- 屋顶 ----
   * gableRoof() 的屋脊沿 X、坡面朝 ±Z、山墙在 ±X。
   * ridgeAlongX=false 时整体转 90°:屋脊沿 Z,山墙落在正立面(±Z)—— 街景里最典型的"山墙朝街"。
   */
  const top = dims[floors - 1];
  const ridgeAlongX = rng.chance(top.w >= top.d ? 0.68 : 0.26);
  const rh = Math.max(2.1, Math.min(top.w, top.d) * (plot.roofType === 'hip' ? 0.42 : 0.6));

  if (plot.roofType === 'hip') {
    const g = hipRoof(top.w, top.d, rh, 0.5);
    g.translate(0, topY, 0);
    PR.add(plot.roof, g);
    for (const s of [-1, 1]) PR.add('timberDark', boxOn(top.w + 1.1, 0.2, 0.22, 0, topY - 0.06, s * (top.d / 2 + 0.42)));
  } else if (ridgeAlongX) {
    for (const g of gableRoof(top.w, top.d, rh, 0.5, 0.24)) { g.translate(0, topY, 0); PR.add(plot.roof, g); }
    for (const s of [-1, 1]) {
      const ge = gableEnd(top.d, rh, WALL_T - 0.02);
      ge.rotateY(Math.PI / 2);
      ge.translate(s * (top.w / 2 - WALL_T / 2), topY, 0);
      P.add(wallMatUpper, ge);
      PR.add('timberDark', boxOn(top.w + 1.1, 0.2, 0.22, 0, topY - 0.06, s * (top.d / 2 + 0.44)));
    }
  } else {
    for (const g of gableRoof(top.d, top.w, rh, 0.5, 0.24)) {
      g.rotateY(Math.PI / 2);
      g.translate(0, topY, 0);
      PR.add(plot.roof, g);
    }
    for (const s of [-1, 1]) {
      const ge = gableEnd(top.w, rh, WALL_T - 0.02);
      ge.translate(0, topY, s * (top.d / 2 - WALL_T / 2));
      P.add(wallMatUpper, ge);
      PR.add('timberDark', boxOn(0.22, 0.2, top.d + 1.1, s * (top.w / 2 + 0.44), topY - 0.06, 0));
    }
  }

  /* ---- 老虎窗:只做在朝街那面坡上 ---- */
  if (floors >= 3 && plot.roofType !== 'hip' && ridgeAlongX && rng.chance(0.8)) {
    const n = top.w > 11.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const dx = n === 1 ? rng.range(-1.2, 1.2) : (i - 0.5) * top.w * 0.46;
      const dp = PR.at(dx, topY + rh * 0.3, top.d * 0.16, 0);
      dp.add(wallMatUpper, boxOn(1.35, 1.3, 1.5, 0, 0, 0));
      dp.add('glass', boxOn(0.86, 0.92, 0.06, 0, 0.24, 0.77));
      dp.add('timberDark', boxOn(1.02, 0.09, 0.13, 0, 1.16, 0.79));
      dp.add('timberDark', boxOn(0.08, 0.92, 0.13, 0, 0.24, 0.79));
      // 老虎窗屋脊垂直于坡面(沿 Z),山墙正对街道
      for (const g of gableRoof(1.72, 1.72, 0.86, 0.16, 0.14)) { g.rotateY(Math.PI / 2); g.translate(0, 1.3, 0); dp.add(plot.roof, g); }
      const ge = gableEnd(1.72, 0.86, 0.13);
      ge.translate(0, 1.3, 0.76);
      dp.add(wallMatUpper, ge);
    }
  }

  /* ---- 烟囱 ---- */
  if (plot.chimney) {
    const cx = rng.range(-0.3, 0.3) * top.w;
    const cz = -top.d / 2 + 0.9;
    const chH = topY + rh + rng.range(1.0, 2.0);
    P.add('stoneDark', boxOn(kind === 'forge' ? 1.5 : 1.0, chH, kind === 'forge' ? 1.3 : 0.9, cx, 0, cz));
    P.add('stoneTrim', boxOn(kind === 'forge' ? 1.8 : 1.28, 0.24, kind === 'forge' ? 1.6 : 1.18, cx, chH, cz));
    P.box(aabbOn(cx, topY, cz, 1.0, chH - topY, 0.9));
    plot.smoke = { x: plot.x + (cx * Math.cos(plot.yaw) + cz * Math.sin(plot.yaw)), y: chH + 0.4, z: plot.z + (-cx * Math.sin(plot.yaw) + cz * Math.cos(plot.yaw)), rate: kind === 'forge' ? 1.8 : 1 };
  }

  /* ---- 店招 / 雨棚 / 阳台 ---- */
  if (plot.sign) {
    const sp = P.at(rng.range(-1, 1) * (w0 / 2 - 1.4), levelY[0] + 2.9, d0 / 2);
    sp.add('iron', boxOn(0.08, 0.08, 1.1, 0, 0.3, 0.55));
    sp.add('iron', boxOn(0.06, 0.5, 0.06, 0, 0.05, 1.02));
    const bd = new THREE.PlaneGeometry(1.12, 0.84);
    bd.rotateY(Math.PI / 2);
    bd.translate(0, -0.42, 1.02);
    sp.add('sign:' + plot.sign, bd);
    sp.add('plankDark', boxOn(0.06, 0.9, 1.2, 0, -0.42, 1.02));
  }
  if ((kind === 'shop' || kind === 'tavern') && rng.chance(0.6)) {
    const ap = P.at(0, levelY[0] + 2.72, d0 / 2);
    const aw = w0 * 0.8;
    const g = boxOn(aw, 0.1, 1.5, 0, 0, 0.75);
    g.rotateX(0.28);
    g.translate(0, 0, 0);
    ap.add(rng.chance(0.5) ? 'clothRed' : 'clothGreen', g);
    for (const s of [-1, 1]) ap.add('timberDark', boxOn(0.1, 0.55, 0.1, s * aw * 0.44, -0.2, 1.4));
  }
  if (plot.balcony && floors >= 2) {
    const by = levelY[1];
    const bp = P.at(0, by, dims[1].d / 2);
    const bw = Math.min(dims[1].w * 0.66, 4.2);
    bp.add('plankDark', boxOn(bw, 0.16, 1.15, 0, -0.05, 0.55));
    for (const g of balustrade(bw, 0.95, { z: 1.1 })) bp.add('plankDark', g);
    for (const s of [-1, 1]) {
      for (const g of balustrade(1.1, 0.95, { x: s * bw / 2, z: 0.55, ry: Math.PI / 2 })) bp.add('plankDark', g);
    }
    for (const s of [-1, 1]) bp.add('timberDark', boxOn(0.12, 0.12, 1.2, s * (bw / 2 - 0.1), -0.22, 0.55));
  }

  /* ---- 汇总 ---- */
  boxes.push(...shell.boxes, ...inner.boxes);
  const radius = Math.hypot(w0, d0) * 0.5 + 2;
  return {
    kind, shell, roof: roofC, inner, boxes,
    emitters: [...shell.emitters, ...inner.emitters],
    center: new THREE.Vector3(plot.x, topY * 0.5, plot.z),
    radius, topY,
  };
}
