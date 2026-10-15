// 外城墙：普通墙段（勒脚 / 腰线 / 挑檐 / 垛口 / 马道）、角楼（马道穿塔）、登城阶梯、北墙港口隧道。
// 坐标全部来自 coords.js；墙段用「段局部帧」建：x 沿段长 [0, L]，z ∈ [-4, 4]，+z = 城内（运河侧）。
import * as THREE from 'three';
import { wallPieces, cylGeo, coneGeo } from '../../core/geom.js';
import {
  ryFor, extrudeXY, profileAlongZ, archedProfile, evenOpenings, archRingPts, archInfillPts, archPanelPts,
  cylArc, lineCircle, mat4,
} from './shapes.js';

const T = 8; // 墙厚
const HT = T / 2;
const PAR_T = 0.6; // 垛墙厚
const PAR_Z = HT - PAR_T / 2; // 垛墙中心线
const BREAST = 0.9; // 胸墙高
const MERLON = 1.6; // 垛口总高（自马道面）
const PAR_COL = 2.0; // 垛墙碰撞高（略高于视觉，防跳上垛口）
const TOWER_R = 7;
const TOWER_UP = 10; // 角楼高出马道
const DOOR_W = 4;
const DOOR_H = 3.4;
const SHELL = 1.5; // 塔上段壁厚
const STEP_RISE = 0.28;
const STEP_RUN = 0.5;
const STAIR_W = 4;
const LAND_W = 5;

export function buildCityWall(ctx, B, G) {
  const C = ctx.coords;
  const M = ctx.mat;
  const P = C.WALL_POLY;
  const TOP = C.WALL.height;
  const BOT = C.WATER_Y - 1;
  const n = P.length;

  // ---------- 角楼表：每个顶点一座；7/8、11/12 两对顶点太近，合并成谷口大塔 ----------
  const towers = [];
  const towerOfVertex = new Array(n);
  const merge = { 7: 8, 11: 12 };
  const skip = new Set([8, 12]);
  for (let i = 0; i < n; i++) {
    if (skip.has(i)) continue;
    if (merge[i] != null) {
      const j = merge[i];
      const t = { x: (P[i][0] + P[j][0]) / 2, z: (P[i][1] + P[j][1]) / 2, R: 9, base: C.VALLEY_FLOOR_Y, up: 11, doors: [], walls: [] };
      towers.push(t);
      towerOfVertex[i] = towerOfVertex[j] = t;
    } else {
      const valleyV = i >= 8 && i <= 11;
      const t = { x: P[i][0], z: P[i][1], R: TOWER_R, base: valleyV ? C.VALLEY_FLOOR_Y : BOT, up: TOWER_UP, doors: [], walls: [] };
      towers.push(t);
      towerOfVertex[i] = t;
    }
  }

  // ---------- 登城阶梯规格（段局部帧）：x0 = 梯段起点，dir = 上行方向，landing 在 x0 反方向 ----------
  // 第 0 段：避开 x=-110 的港口隧道，平台放在隧道西侧，向西上墙
  // 第 13 段：避开两端角楼，从法师区东岸起步向北上墙
  // 第 15 段：雄狮安息地西岸起步向北
  // 第 4 段：要塞高台（y=12）南缘直接架平桥 + 短梯上墙
  const stairSpec = { 0: { x0: 152, dir: -1 }, 13: { x0: 42, dir: -1 }, 15: { x0: 227, dir: 1 } };
  const keepSeg = 4;

  // 普通墙段（马道 y=14）；7、11 段在合并大塔里，8/9/10 段是英雄谷（valley.js 负责）
  const valleySegs = new Set([7, 8, 9, 10, 11]);
  const segs = [];
  for (let i = 0; i < n; i++) {
    if (valleySegs.has(i)) continue;
    const [ax, az] = P[i];
    const [bx, bz] = P[(i + 1) % n];
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    const seg = { i, ax, az, bx, bz, L, ux, uz, nx: -uz, nz: ux, ry: ryFor(ux, uz), ta: towerOfVertex[i], tb: towerOfVertex[(i + 1) % n], gaps: [], openings: [] };
    segs.push(seg);
    // 门洞方向：墙中心线穿出塔壁的位置
    for (const [t, sign] of [[seg.ta, 1], [seg.tb, -1]]) {
      const hit = lineCircle(ax, az, ux, uz, t.x, t.z, t.R - SHELL / 2);
      if (!hit) continue;
      const tt = sign > 0 ? hit[1] : hit[0];
      t.doors.push(Math.atan2(az + uz * tt - t.z, ax + ux * tt - t.x));
    }
  }
  // 塔身贴墙方向（开窗避让用），包括谷墙
  for (let i = 0; i < n; i++) {
    const t = towerOfVertex[i];
    for (const k of [i - 1, i + 1]) {
      const [ox, oz] = P[(k + n) % n];
      t.walls.push(Math.atan2(oz - t.z, ox - t.x));
    }
  }

  // ---------- 墙段 ----------
  for (const s of segs) {
    const F = B.frame(s.ax, 0, s.az, s.ry);
    const FG = G.frame(s.ax, 0, s.az, s.ry);
    if (s.i === 0) {
      // 北墙港口隧道
      const tx = (C.HARBOR_TUNNEL.x - s.ax) * s.ux + (C.HARBOR_TUNNEL.z - s.az) * s.uz;
      s.openings.push({ x: tx, y0: 0, y1: C.HARBOR_TUNNEL.height, w: C.HARBOR_TUNNEL.width });
    }
    // 马道两侧可用范围（扣掉两端塔身）
    const trim = (zoff, rIn) => {
      const ox = s.ax + s.nx * zoff;
      const oz = s.az + s.nz * zoff;
      let x0 = 0;
      let x1 = s.L;
      const ha = lineCircle(ox, oz, s.ux, s.uz, s.ta.x, s.ta.z, s.ta.R - rIn);
      if (ha) x0 = Math.max(x0, ha[1]);
      const hb = lineCircle(ox, oz, s.ux, s.uz, s.tb.x, s.tb.z, s.tb.R - rIn);
      if (hb) x1 = Math.min(x1, hb[0]);
      return [x0, x1];
    };

    // 登城阶梯
    if (stairSpec[s.i]) buildWallStair(ctx, B, G, s, F, FG, stairSpec[s.i], TOP);
    if (s.i === keepSeg) buildKeepLink(ctx, B, G, s, F, FG, TOP);

    // 墙体（洞口墙切分 → 碰撞与洞口同源）
    const ops = s.openings.map((o) => ({ x: o.x, y: o.y0 - BOT, w: o.w, h: o.y1 - o.y0 }));
    for (const p of wallPieces(s.L, TOP - BOT, ops)) {
      F.box(M.stoneWhite, (p.x0 + p.x1) / 2, BOT + p.y0, 0, p.x1 - p.x0, p.y1 - p.y0, T);
    }
    // 隧道：矩形洞口（碰撞）+ 拱肩填充（视觉拱顶）+ 两面拱券 + 地面铺装
    for (const o of s.openings) {
      const spring = o.y1 - 2.8;
      F.add(M.stoneWhite, extrudeXY(archInfillPts(o.w, spring, 2.6, o.y1), T), mat4(o.x, 0, 0));
      for (const zf of [-HT - 0.1, HT + 0.1]) {
        F.add(M.stoneTrim, extrudeXY(archRingPts(o.w, spring, 2.6, 0.8), 0.6), mat4(o.x, 0, zf));
      }
      FG.box(M.cobble, o.x, -0.03, 0, o.w, 0.03, T + 0.4, { collide: false });
      F.box(M.iron, o.x, o.y1 - 0.5, -HT + 0.6, o.w, 0.5, 0.25, { collide: false }); // 收起的闸门底梁
    }
    // 水平线脚：遇到洞口就断开
    const band = (mat, y0, y1, thick, collide, zc = 0) => {
      for (const [x0, x1] of splitByOpenings(0, s.L, y0, y1, s.openings)) {
        F.box(mat, (x0 + x1) / 2, y0, zc, x1 - x0, y1 - y0, thick, { collide });
      }
    };
    band(M.stoneGrey, BOT, 0.7, T + 1.4, true); // 勒脚
    band(M.stoneTrim, 0.7, 1.05, T + 0.9, false);
    band(M.stoneTrim, 7, 7.35, T + 0.3, false); // 腰线
    band(M.stoneTrim, TOP - 0.75, TOP, T + 1.0, false); // 挑檐
    // 挑檐下的牛腿（外侧）
    {
      const [x0, x1] = trim(-HT, -0.5);
      for (let x = x0 + 1.3; x < x1 - 0.6; x += 2.6) {
        if (s.openings.some((o) => Math.abs(x - o.x) < o.w / 2 + 1)) continue;
        F.box(M.stoneTrim, x, TOP - 1.55, -HT - 0.2, 0.55, 0.8, 0.4, { collide: false });
      }
    }

    // 马道铺装
    {
      const [x0, x1] = trim(0, SHELL);
      FG.box(M.plaza, (x0 + x1) / 2, TOP, 0, x1 - x0, 0.03, T - 2 * PAR_T, { collide: false });
    }
    // 垛墙：外侧通长，内侧在登城口断开
    for (const side of [-1, 1]) {
      const zc = side * PAR_Z;
      const [x0, x1] = trim(zc, SHELL * 0.5);
      const runs = subtractGaps(x0, x1, side > 0 ? s.gaps : []);
      for (const [r0, r1] of runs) parapet(F, M, r0, r1, zc, TOP);
    }

    // 长墙段上的外凸小塔楼（不占马道：圆心在墙外，内缘贴外侧垛墙）
    const cnt = Math.floor(s.L / 95);
    for (let k = 1; k <= cnt; k++) {
      let x = (s.L * k) / (cnt + 1);
      for (const o of s.openings) if (Math.abs(x - o.x) < 14) x = o.x + 18 * Math.sign(x - o.x || 1);
      const p = F.toWorld(x, 0, -(HT + 3.6));
      buildTurret(ctx, B, p.x, p.z, Math.atan2(-s.nz, -s.nx), BOT, TOP);
    }
  }

  // ---------- 角楼 ----------
  for (const t of towers) buildTower(ctx, B, t, TOP);

  return { towers, segs };
}

// 区间 [x0,x1] 被高度相交的洞口切开
function splitByOpenings(x0, x1, y0, y1, openings) {
  const cuts = openings.filter((o) => o.y0 < y1 && o.y1 > y0).map((o) => [o.x - o.w / 2, o.x + o.w / 2]);
  return subtractGaps(x0, x1, cuts);
}
function subtractGaps(x0, x1, gaps) {
  let runs = [[x0, x1]];
  for (const [g0, g1] of gaps) {
    const next = [];
    for (const [a, b] of runs) {
      if (g1 <= a || g0 >= b) next.push([a, b]);
      else {
        if (g0 > a + 0.05) next.push([a, g0]);
        if (g1 < b - 0.05) next.push([g1, b]);
      }
    }
    runs = next;
  }
  return runs.filter(([a, b]) => b - a > 0.3);
}

// 垛墙：胸墙 + 城垛（视觉），通长一个碰撞盒（略高于视觉，防跳上去）
export function parapet(F, M, x0, x1, zc, y, { cap = true } = {}) {
  const len = x1 - x0;
  F.box(M.stoneWhite, (x0 + x1) / 2, y, zc, len, BREAST, PAR_T, { collide: false });
  if (cap) F.box(M.stoneTrim, (x0 + x1) / 2, y + BREAST, zc, len, 0.1, PAR_T + 0.12, { collide: false });
  const period = 2.6;
  const count = Math.max(1, Math.floor((len + 1.1) / period));
  const start = x0 + (len - (count * period - 1.1)) / 2 + 0.75;
  for (let k = 0; k < count; k++) {
    F.box(M.stoneWhite, start + k * period, y + BREAST + 0.1, zc, 1.5, MERLON - BREAST - 0.1, PAR_T, { collide: false });
  }
  F.collider((x0 + x1) / 2, y, zc, len, PAR_COL, PAR_T);
}

// 栏杆（桥 / 梯 / 平台）：实心矮墙 + 压顶 + 望柱；碰撞 1.8 m 高
// 瓶式栏杆柱（共享几何，6 棱回转体，高 0.75）
let BALUSTER = null;
function balusterGeo() {
  if (!BALUSTER) {
    const prof = [[0.001, 0], [0.12, 0], [0.08, 0.12], [0.15, 0.34], [0.07, 0.6], [0.11, 0.75], [0.001, 0.75]];
    BALUSTER = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 6);
  }
  return BALUSTER;
}

export function railing(F, M, ax, az, bx, bz, y, { collider = true, post = 3, open = false } = {}) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.2) return;
  const ry = ryFor(bx - ax, bz - az);
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  if (open) {
    // 镂空栏杆：底座条 + 瓶式栏杆柱 + 扶手，总高 1.1，视线可透过看到桥下
    F.box(M.stoneWhite, cx, y, cz, len, 0.22, 0.4, { ry, collide: false });
    const n = Math.max(1, Math.floor(len / 0.55));
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    for (let i = 0; i < n; i++) {
      const s = ((i + 0.5) / n) * len;
      F.add(M.stoneWhite, balusterGeo(), mat4(ax + ux * s, y + 0.22, az + uz * s));
    }
    F.box(M.stoneTrim, cx, y + 0.97, cz, len + 0.1, 0.13, 0.42, { ry, collide: false });
  } else {
    F.box(M.stoneWhite, cx, y, cz, len, 0.95, 0.35, { ry, collide: false });
    F.box(M.stoneTrim, cx, y + 0.95, cz, len + 0.1, 0.14, 0.5, { ry, collide: false });
  }
  const k = Math.max(1, Math.round(len / post));
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    F.box(M.stoneTrim, ax + (bx - ax) * t, y, az + (bz - az) * t, 0.55, 1.25, 0.55, { collide: false });
  }
  if (collider) F.collider(cx, y - 1, cz, len, 2.8, 0.4, ry);
}

// 斜栏杆（梯段旁）：视觉一条斜压墙；碰撞按台阶分组做成阶梯状竖板
export function slopedRailing(F, M, ax, ay, az, bx, by, bz, baseY) {
  const dh = Math.hypot(bx - ax, bz - az);
  const dy = by - ay;
  const ang = Math.atan2(dy, dh);
  const len = Math.hypot(dh, dy);
  const ry = ryFor(bx - ax, bz - az);
  const h = 1.0 * Math.cos(ang);
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  const cy = (ay + by) / 2 + 0.55;
  F.box(M.stoneWhite, cx, cy - h / 2, cz, len, h, 0.35, { ry, rz: ang, collide: false });
  F.box(M.stoneTrim, cx, cy + 0.5 - 0.07, cz, len + 0.1, 0.14, 0.5, { ry, rz: ang, collide: false });
  // 端头望柱
  F.box(M.stoneTrim, ax, ay, az, 0.6, 1.3, 0.6, { collide: false });
  F.box(M.stoneTrim, bx, by, bz, 0.6, 1.3, 0.6, { collide: false });
  // 阶梯状碰撞：每段 ~2.5 m
  const k = Math.max(1, Math.ceil(dh / 2.5));
  for (let i = 0; i < k; i++) {
    const t0 = i / k;
    const t1 = (i + 1) / k;
    const x0 = ax + (bx - ax) * t0;
    const z0 = az + (bz - az) * t0;
    const x1 = ax + (bx - ax) * t1;
    const z1 = az + (bz - az) * t1;
    const yTop = Math.max(ay + dy * t0, ay + dy * t1) + 1.8;
    F.collider((x0 + x1) / 2, baseY, (z0 + z1) / 2, dh / k + 0.05, yTop - baseY, 0.4, ry);
  }
}

// 直跑石阶：沿局部 x（dir）上行，宽在 z ∈ [z0, z1]；返回顶端 x
export function stairRun(F, M, x0, dir, z0, z1, yBase, yFrom, steps, rise = STEP_RISE, run = STEP_RUN) {
  const w = z1 - z0;
  const zc = (z0 + z1) / 2;
  for (let k = 0; k < steps; k++) {
    const xa = x0 + dir * k * run;
    const top = yFrom + (k + 1) * rise;
    F.box(k % 2 ? M.stoneWhite : M.stoneTrim, xa + (dir * run) / 2, yBase, zc, run, top - yBase, w);
  }
  return x0 + dir * steps * run;
}

// ---------- 普通登城阶梯：岸边栈桥 → 底平台 → 贴墙直跑 → 顶平台（内侧垛墙开口）----------
function buildWallStair(ctx, B, G, s, F, FG, spec, TOP) {
  const C = ctx.coords;
  const M = ctx.mat;
  const BOT = C.WATER_Y - 1;
  const { x0, dir } = spec;
  const zA = HT;
  const zB = HT + STAIR_W;
  const N = Math.round(TOP / STEP_RISE);
  const rise = TOP / N;
  // 底平台（y=0）
  const xl0 = x0 - dir * LAND_W;
  F.box(M.stoneWhite, (x0 + xl0) / 2, BOT, (zA + zB) / 2, LAND_W, -BOT - 0.03, STAIR_W);
  FG.box(M.plaza, (x0 + xl0) / 2, -0.03, (zA + zB) / 2, LAND_W, 0.03, STAIR_W, { collide: false });
  // 梯段
  const xTop = stairRun(F, M, x0, dir, zA, zB, BOT, 0, N, rise);
  // 顶平台
  const xEnd = xTop + dir * 4;
  F.box(M.stoneWhite, (xTop + xEnd) / 2, BOT, (zA + zB) / 2, 4, TOP - BOT, STAIR_W);
  FG.box(M.plaza, (xTop + xEnd) / 2, TOP, (zA + zB) / 2, 4, 0.03, STAIR_W, { collide: false });
  s.gaps.push([Math.min(xTop, xEnd), Math.max(xTop, xEnd)]);
  // 栏杆：梯段外沿斜栏、顶平台外沿与端头、底平台端头
  const zr = zB - 0.2;
  slopedRailing(F, M, x0, 0, zr, xTop, TOP, zr, BOT);
  railing(F, M, xTop, zr, xEnd, zr, TOP);
  railing(F, M, xEnd - dir * 0.2, zr, xEnd - dir * 0.2, zA + 0.1, TOP);
  // 梯段侧面的盲拱（视觉）：拱高跟着台阶线走
  const sideLen = Math.abs(xTop - x0);
  for (let k = 0; k < 4; k++) {
    const xc = x0 + dir * sideLen * (0.3 + k * 0.2);
    const yT = (Math.abs(xc - x0 - dir * 1.4) / sideLen) * TOP;
    const h = yT - 1.6;
    if (h < 2.5) continue;
    F.add(M.stoneGrey, extrudeXY(archPanelPts(2.6, h - 1.3, 1.3), 0.1), mat4(xc, 0.3, zB + 0.03));
  }

  // 栈桥：从底平台垂直墙面伸到最近的岛岸
  let zIsland = zB + 2;
  for (let z = zB; z < zB + 60; z += 0.5) {
    const p = F.toWorld((x0 + xl0) / 2, 0, z);
    if (C.regionAt(p.x, p.z).region === 'island') {
      zIsland = z;
      break;
    }
  }
  const zEnd = zIsland + 1.2;
  const len = zEnd - zB;
  const cnt = Math.max(1, Math.round(len / 11));
  const ops = evenOpenings(zB, zEnd, cnt, 1.6);
  const prof = archedProfile(zB, zEnd, C.CANAL_BED_Y, -0.7, ops, -1.2, 3);
  F.add(M.stoneWhite, profileAlongZ(prof, LAND_W - 0.4), mat4((x0 + xl0) / 2, 0, 0));
  F.box(M.stoneTrim, (x0 + xl0) / 2, -0.7, (zB + zEnd) / 2, LAND_W, 0.67, len);
  F.collider((x0 + xl0) / 2, -0.7, (zB + zEnd) / 2, LAND_W, 0.7, len);
  FG.box(M.plaza, (x0 + xl0) / 2, -0.03, (zB + zIsland) / 2, LAND_W - 0.8, 0.03, zIsland - zB, { collide: false });
  railing(F, M, xl0 + dir * 0.2, zA + 0.1, xl0 + dir * 0.2, zIsland - 0.3, 0); // 平台端头 + 栈桥一侧
  railing(F, M, x0 - dir * 0.2, zB + 0.3, x0 - dir * 0.2, zIsland - 0.3, 0); // 栈桥另一侧
}

// ---------- 第 4 段：要塞高台南缘（y=12）→ 平桥 + 短梯 → 马道 ----------
function buildKeepLink(ctx, B, G, s, F, FG, TOP) {
  const C = ctx.coords;
  const M = ctx.mat;
  const xc = s.L * 0.5;
  const W = 5;
  // 高台边缘：沿内法线找要塞区
  let zK = 16;
  for (let z = HT; z < 40; z += 0.25) {
    const p = F.toWorld(xc, 0, z);
    const r = C.regionAt(p.x, p.z);
    if (r.region === 'island' && r.district === 'keep') {
      zK = z;
      break;
    }
  }
  const deckY = C.KEEP_Y;
  const nSteps = 7;
  const rise = (TOP - deckY) / nSteps;
  const run = 0.75;
  const zStairEnd = HT + nSteps * run; // 梯脚
  const zEnd = zK + 1.5;
  // 拱桥身
  const ops = evenOpenings(HT, zEnd, 1, 1.8);
  const prof = archedProfile(HT, zEnd, C.WATER_Y - 1, deckY - 0.8, ops, deckY - 4, 6);
  F.add(M.stoneWhite, profileAlongZ(prof, W - 0.4), mat4(xc, 0, 0));
  F.collider(xc, C.WATER_Y - 1, (HT + zEnd) / 2, W, deckY - 0.8 - C.WATER_Y + 1, zEnd - HT);
  // 桥面
  F.box(M.stoneTrim, xc, deckY - 0.8, (zStairEnd + zEnd) / 2, W, 0.77, zEnd - zStairEnd);
  FG.box(M.plaza, xc, deckY - 0.03, (zStairEnd + zK) / 2, W - 0.8, 0.03, zK - zStairEnd, { collide: false });
  // 短梯：从梯脚往墙面上行（局部 -z 方向），用一个子帧让 stairRun 沿 x 走
  const S = F.sub(xc, 0, zStairEnd, Math.PI / 2); // 子帧 +x = 父帧 -z
  stairRun(S, M, 0, 1, -W / 2, W / 2, deckY - 0.8, deckY, nSteps, rise, run);
  // 栏杆
  for (const xr of [xc - W / 2 + 0.2, xc + W / 2 - 0.2]) {
    slopedRailing(F, M, xr, deckY, zStairEnd, xr, TOP, HT + 0.3, deckY - 0.8);
    railing(F, M, xr, zStairEnd, xr, zK - 0.3, deckY);
  }
  s.gaps.push([xc - W / 2, xc + W / 2]);
}

// ---------- 角楼：下段实心（顶面 = 马道面），上段环形塔壁，马道方向开门洞 ----------
function buildTower(ctx, B, t, TOP) {
  const M = ctx.mat;
  const { x, z, R, base } = t;
  const top = TOP + t.up;
  const rIn = R - SHELL;
  // 下段
  B.add(M.stoneWhite, cylGeo(R, TOP - base, 36).translate(x, base, z));
  B.add(M.stoneGrey, cylGeo(R + 0.7, 0.7 - base, 36).translate(x, base, z)); // 勒脚
  B.add(M.stoneTrim, cylGeo(R + 0.35, 0.35, 36).translate(x, 7, z)); // 腰线
  const a = R * 0.96;
  for (const ry of [0, Math.PI / 4]) B.collider(x, base, z, 2 * a, TOP - base, 2 * a, ry);

  // 上段：门洞之间的弧墙
  const gaps = t.doors.map((d) => {
    const half = Math.asin(DOOR_W / 2 / (R - SHELL / 2));
    return [d - half, d + half];
  });
  const arcs = arcsBetween(gaps);
  const H = top - TOP;
  const m = mat4(x, TOP, z);
  for (const [a0, a1] of arcs) {
    B.add(M.stoneWhite, cylArc(R, H, a0, a1, 36), m);
    B.add(M.stoneWhite, cylArc(rIn, H, a0, a1, 36, true), m);
    // 碰撞：弧墙切成小段
    const k = Math.ceil((a1 - a0) / 0.3);
    for (let i = 0; i < k; i++) {
      const th = a0 + ((i + 0.5) * (a1 - a0)) / k;
      const dth = (a1 - a0) / k;
      const rc = R - SHELL / 2;
      B.collider(x + Math.cos(th) * rc, TOP, z + Math.sin(th) * rc, 2 * R * Math.tan(dth / 2) + 0.1, H, SHELL, ryFor(-Math.sin(th), Math.cos(th)));
    }
  }
  // 门洞：过梁以上的弧墙 + 门侧壁 + 过梁底
  for (const [g0, g1] of gaps) {
    const mm = mat4(x, TOP + DOOR_H, z);
    B.add(M.stoneWhite, cylArc(R, H - DOOR_H, g0, g1, 36), mm);
    B.add(M.stoneWhite, cylArc(rIn, H - DOOR_H, g0, g1, 36, true), mm);
    const d = (g0 + g1) / 2;
    const rc = R - SHELL / 2;
    const ry = ryFor(-Math.sin(d), Math.cos(d));
    const cx = x + Math.cos(d) * rc;
    const cz = z + Math.sin(d) * rc;
    B.box(M.stoneTrim, cx, TOP + DOOR_H - 0.35, cz, DOOR_W + 0.3, 0.35, SHELL + 0.1, { ry, collide: false });
    B.collider(cx, TOP + DOOR_H, cz, DOOR_W + 0.4, H - DOOR_H, SHELL, ry);
    for (const e of [g0, g1]) {
      const ex = x + Math.cos(e) * rc;
      const ez = z + Math.sin(e) * rc;
      B.box(M.stoneTrim, ex, TOP, ez, 0.4, DOOR_H, SHELL + 0.05, { ry: ryFor(-Math.sin(e), Math.cos(e)), collide: false });
    }
    // 门套（外侧，嵌进弧墙一点）
    const ox = x + Math.cos(d) * (R - 0.2);
    const oz = z + Math.sin(d) * (R - 0.2);
    B.add(M.stoneTrim, extrudeXY(archRingPts(DOOR_W, DOOR_H, 0.01, 0.45, 2), 0.9), mat4(ox, TOP, oz, ryFor(-Math.sin(d), Math.cos(d))));
  }
  // 塔顶：叠涩 + 檐口带（底面当天花板）+ 蓝锥顶 + 金尖饰
  B.add(M.stoneTrim, cylGeo(R, 0.9, 36, R + 0.55).translate(x, top - 2.1, z));
  B.add(M.stoneTrim, cylGeo(R + 0.55, 1.2, 36).translate(x, top - 1.2, z));
  const coneH = R * 1.9;
  B.add(M.roofBlue, coneGeo(R + 1.4, coneH, 36).translate(x, top, z));
  B.add(M.roofBlue, new THREE.CircleGeometry(R + 1.4, 36).rotateX(Math.PI / 2).translate(x, top, z));
  B.add(M.gold, new THREE.SphereGeometry(0.55, 12, 8).translate(x, top + coneH + 0.2, z));
  B.add(M.gold, coneGeo(0.22, 2.6, 8).translate(x, top + coneH + 0.5, z));
  B.add(M.gold, cylGeo(R + 1.45, 0.25, 36).translate(x, top - 0.05, z)); // 檐口金边

  // 窗：避开门洞与墙体方向
  const avoid = [...t.doors, ...t.walls];
  const winRow = (y, h, count, phase) => {
    for (let k = 0; k < count; k++) {
      const th = phase + (k / count) * Math.PI * 2;
      if (avoid.some((d) => Math.abs(angDiff(th, d)) < 0.75)) continue;
      const wx = x + Math.cos(th) * (R - 0.08);
      const wz = z + Math.sin(th) * (R - 0.08);
      const ry = ryFor(-Math.sin(th), Math.cos(th));
      B.box(M.iron, wx, y, wz, 0.75, h, 0.3, { ry, collide: false });
      B.box(M.stoneTrim, x + Math.cos(th) * (R + 0.05), y - 0.2, z + Math.sin(th) * (R + 0.05), 1.1, 0.2, 0.25, { ry, collide: false });
    }
  };
  winRow(4.2, 2.0, 8, 0.2);
  winRow(TOP + 4.2, 2.2, 8, 0.6);
}

// 墙外侧的小塔楼：实心圆塔 + 叠涩檐口 + 蓝锥顶，朝外开三道窄窗
function buildTurret(ctx, B, x, z, thOut, base, TOP) {
  const M = ctx.mat;
  const r = 4.2;
  const top = TOP + 5;
  B.add(M.stoneWhite, cylGeo(r, top - base, 28).translate(x, base, z));
  B.add(M.stoneGrey, cylGeo(r + 0.6, 0.7 - base, 28).translate(x, base, z));
  B.add(M.stoneTrim, cylGeo(r + 0.25, 0.3, 28).translate(x, 7, z));
  B.add(M.stoneTrim, cylGeo(r, 0.8, 28, r + 0.5).translate(x, top - 2, z));
  B.add(M.stoneTrim, cylGeo(r + 0.5, 1.2, 28).translate(x, top - 1.2, z));
  const coneH = 8.5;
  B.add(M.roofBlue, coneGeo(r + 1.1, coneH, 28).translate(x, top, z));
  B.add(M.roofBlue, new THREE.CircleGeometry(r + 1.1, 28).rotateX(Math.PI / 2).translate(x, top, z));
  B.add(M.gold, cylGeo(r + 1.15, 0.22, 28).translate(x, top - 0.05, z));
  B.add(M.gold, new THREE.SphereGeometry(0.4, 10, 6).translate(x, top + coneH + 0.1, z));
  B.add(M.gold, coneGeo(0.16, 1.8, 6).translate(x, top + coneH + 0.35, z));
  const a = r * 0.96;
  for (const ry of [0, Math.PI / 4]) B.collider(x, base, z, 2 * a, top - base, 2 * a, ry);
  for (const d of [-0.9, 0, 0.9]) {
    const th = thOut + d;
    const ry = ryFor(-Math.sin(th), Math.cos(th));
    for (const y of [4.5, 11.5]) {
      B.box(M.iron, x + Math.cos(th) * (r - 0.08), y, z + Math.sin(th) * (r - 0.08), 0.6, 1.8, 0.3, { ry, collide: false });
    }
  }
}

function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// 把 [0, 2π) 去掉门洞后的弧段
function arcsBetween(gaps) {
  if (!gaps.length) return [[0, Math.PI * 2]];
  const g = gaps.map(([a, b]) => [a, b]).sort((p, q) => p[0] - q[0]);
  const out = [];
  for (let i = 0; i < g.length; i++) {
    const a = g[i][1];
    let b = g[(i + 1) % g.length][0];
    if (i === g.length - 1) b += Math.PI * 2;
    if (b - a > 0.02) out.push([a, b]);
  }
  return out;
}

export const WALL_CONST = { T, HT, PAR_T, PAR_Z, MERLON, STEP_RISE, STEP_RUN };
