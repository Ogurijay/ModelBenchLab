// 街区岛：驳岸石墙（挤到河床）+ 水线青苔带 + 压顶石 + 滨河矮护栏（桥头 / 主桥登岸点留开口，带碰撞），
// 顶面铺装（街道卵石、广场石板略高 0.05、街块后院土 / 草）；要塞高台（厚墙、扶壁、垛口女儿墙、阶梯槽两侧墙）；
// 雄狮安息地（整岛草地 + 十字碎石路 + 环路）；暴风港（石码头 + 木栈道 + 4 条木栈桥带桩）；运河河床与城墙内侧护脚。
import * as THREE from 'three';
import { DISTRICTS, BRIDGES, VALLEY, valleyToWorld, WATER_POLY, WALL_POLY, WATER_Y, CANAL_BED_Y, VALLEY_FLOOR_Y, LANDMARKS, regionAt } from '../coords.js';
import { cylGeo } from '../../core/geom.js';
import { polyEdges, putEdgeBox, edgeBox, subtractRanges, flatPolyGeo, flatPolyGeoEarcut, slabGeo, rectPoly } from './kit.js';

const STYLE = {
  trade: { wall: 'stoneWhite', trim: 'stoneTrim', rail: 'stoneTrim', top: 'cobble', yards: ['dirt', 'grass'] },
  mage: { wall: 'stoneWhite', trim: 'stoneTrim', rail: 'stoneTrim', top: 'cobble', yards: ['grass'] },
  oldtown: { wall: 'stoneGrey', trim: 'stoneTrim', rail: 'stoneGrey', top: 'cobble', yards: ['dirt', 'grass', 'dirt'] },
  cathedral: { wall: 'stoneWhite', trim: 'stoneTrim', rail: 'stoneTrim', top: 'cobble', yards: ['grass'] },
  dwarven: { wall: 'stoneDark', trim: 'stoneGrey', rail: 'stoneGrey', top: 'cobbleDark', yards: ['dirt'] },
  keep: { wall: 'stoneWhite', trim: 'stoneTrim', rail: null, top: 'plaza' },
  lionsrest: { wall: 'stoneGrey', trim: 'stoneTrim', rail: 'stoneTrim', top: 'grass' },
  harbor: { wall: 'stoneGrey', trim: 'stoneGrey', rail: 'stoneGrey', top: 'cobble' },
};

const BED = CANAL_BED_Y - 0.3;
const WET_Y = WATER_Y - 0.6; // 以下为水下湿石
const HARBOR_BED = -9.2;

// B 模块（walls/citywall.js）从城墙伸到岛岸的结构：3 处登城阶梯栈桥 + 要塞高台平桥（y=12）。
// 参数与 citywall.js 的 stairSpec / buildKeepLink 保持一致：墙段 seg 上距起点 xc 处，沿墙段内法线伸到最近的岛岸，宽 w。
const WALL_LINKS = [
  { seg: 0, xc: 152 + 2.5, w: 5 }, // 北墙 → 大教堂广场北岸
  { seg: 13, xc: 42 + 2.5, w: 5 }, // 南墙 → 法师区东岸
  { seg: 15, xc: 227 - 2.5, w: 5 }, // 西墙 → 雄狮安息地西岸
  { seg: 4, xc: 'mid', w: 5 }, // 东墙 → 要塞高台东缘（平桥）
];

function wallLinkLandings() {
  const P = WALL_POLY;
  const out = [];
  for (const { seg, xc, w } of WALL_LINKS) {
    const [ax, az] = P[seg];
    const [bx, bz] = P[(seg + 1) % P.length];
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    const s = xc === 'mid' ? L / 2 : xc;
    // 墙段局部 +z（= (-uz, ux)）朝城内
    for (let d = 4; d < 60; d += 0.25) {
      const x = ax + ux * s - uz * d;
      const z = az + uz * s + ux * d;
      if (regionAt(x, z).region === 'island') {
        out.push({ p: [x, z], w });
        break;
      }
    }
  }
  return out;
}

// 护栏 / 女儿墙开口：所有运河桥两端 + 英雄谷主桥登岸点 + 城墙伸过来的栈桥 / 平桥
export function bridgeLandings() {
  const out = [];
  for (const b of BRIDGES) {
    out.push({ p: b.a, w: b.w });
    out.push({ p: b.b, w: b.w });
  }
  out.push({ p: valleyToWorld(0, VALLEY.bridge.from), w: VALLEY.bridge.width });
  out.push(...wallLinkLandings());
  return out;
}

function openingsOn(e, landings) {
  const res = [];
  for (const { p, w } of landings) {
    const dx = p[0] - e.a[0];
    const dz = p[1] - e.a[1];
    const s = dx * e.ux + dz * e.uz;
    const o = dx * e.nx + dz * e.nz;
    if (Math.abs(o) < 0.8 && s > -0.5 && s < e.len + 0.5) res.push([s - w / 2, s + w / 2]);
  }
  return res;
}

// 街块后院（地块之间留下的空地）：与 coords.lotsOf 同一套进深规则
function yardRect(b) {
  const [x0, z0, x1, z1] = b.r;
  const s = b.sides;
  const dNS = Math.min(12, s.includes('N') && s.includes('S') ? (z1 - z0) / 2 : z1 - z0);
  const dEW = Math.min(12, s.includes('W') && s.includes('E') ? (x1 - x0) / 2 : x1 - x0);
  const za = s.includes('N') ? z0 + dNS : z0;
  const zb = s.includes('S') ? z1 - dNS : z1;
  const xa = s.includes('W') ? x0 + dEW : x0;
  const xb = s.includes('E') ? x1 - dEW : x1;
  return xb - xa >= 1.5 && zb - za >= 1.5 ? [xa, za, xb, zb] : null;
}

// 滨河矮护栏：立柱每 ~2.4 m，扶手 + 底座通长；桥头端柱加粗；整段一个碰撞盒
function rail(S, M, mat, e, run, y) {
  let { s0, s1 } = run;
  if (!run.openA && e.convexA) s0 += 0.2;
  if (!run.openB && e.convexB) s1 -= 0.2;
  const L = s1 - s0;
  if (L < 0.8) return;
  const n = Math.max(1, Math.round(L / 2.4));
  for (let i = 0; i <= n; i++) {
    const big = (i === 0 && run.openA) || (i === n && run.openB);
    const ps = big ? 0.6 : 0.34;
    const ph = big ? 1.15 : 0.98;
    const sc = Math.min(Math.max(s0 + (L * i) / n, s0 + ps / 2), s1 - ps / 2);
    putEdgeBox(S, mat, e, sc - ps / 2, sc + ps / 2, -0.34 - ps / 2, -0.34 + ps / 2, y, y + ph);
    if (big) putEdgeBox(S, M.stoneTrim, e, sc - 0.38, sc + 0.38, -0.72, 0.04, y + ph, y + ph + 0.14);
  }
  putEdgeBox(S, mat, e, s0, s1, -0.47, -0.21, y + 0.7, y + 0.88); // 扶手
  putEdgeBox(S, mat, e, s0, s1, -0.5, -0.18, y, y + 0.2); // 底座
  const [x, yy, z, w, h, d, ry] = edgeBox(e, s0, s1, -0.56, -0.12, y - 0.06, y + 1.1);
  S.collider(x, yy, z, w, h, d, ry);
}

// 要塞女儿墙：实心 + 压顶 + 垛口
function parapet(S, M, e, run, y) {
  const { s0, s1 } = run;
  putEdgeBox(S, M.stoneWhite, e, s0, s1, -0.85, 0, y, y + 1.05, true);
  putEdgeBox(S, M.stoneTrim, e, s0, s1, -0.95, 0.1, y + 1.05, y + 1.25);
  const n = Math.floor((s1 - s0) / 3.2);
  for (let i = 0; i < n; i++) {
    const s = s0 + (s1 - s0 - n * 3.2) / 2 + 3.2 * (i + 0.5);
    putEdgeBox(S, M.stoneWhite, e, s - 0.75, s + 0.75, -0.8, -0.05, y + 1.25, y + 2.1);
  }
}

export function buildIslands(ctx, F, S, GM) {
  // 返回水下湿石材质，桥模块复用
  const M = ctx.mat;
  const rng = ctx.rng('terrain:islands');
  const landings = bridgeLandings();
  const stairs = DISTRICTS.keep.stairs.rect;
  // 水下湿石：stoneDark 再压暗、偏青
  const underMat = M.stoneDark.clone();
  underMat.name = 'terrainUnderwater';
  underMat.color.set(0x55605a);
  // 要塞高台的暗色基座：灰石压暗 + 更深的压顶线，让 y=12 的高差在全景里读得出来（女儿墙保持白色形成对比）
  const keepBase = M.stoneGrey.clone();
  keepBase.name = 'terrainKeepBase';
  keepBase.color.set(0x8c877f);
  const keepDark = M.stoneDark.clone();
  keepDark.name = 'terrainKeepDark';
  keepDark.color.set(0x77706a);

  for (const [key, d] of Object.entries(DISTRICTS)) {
    const st = STYLE[key] || STYLE.trade;
    const top = d.top;
    const bottom = key === 'harbor' ? HARBOR_BED : BED;
    const isKeep = key === 'keep';
    const wallMat = isKeep ? keepBase : M[st.wall];
    const trimMat = isKeep ? keepDark : M[st.trim];

    for (const e of polyEdges(d.poly)) {
      const harborSouth = key === 'harbor' && e.a[1] === -266 && e.b[1] === -266; // 贴着北城墙外皮
      const harborNorth = key === 'harbor' && e.a[1] === -300 && e.b[1] === -300; // 码头沿：木栈道代替压顶石
      if (harborSouth) continue;
      // 阶梯槽：槽内三条边（两侧 + 顶）
      const notch = isKeep && Math.min(e.a[0], e.b[0]) >= stairs[0] - 0.01 && Math.max(e.a[0], e.b[0]) <= stairs[2] + 0.01 && Math.max(e.a[1], e.b[1]) <= stairs[3] + 0.01 && Math.min(e.a[1], e.b[1]) >= stairs[1] - 0.01;
      const stairTop = notch && e.a[1] === stairs[1] && e.b[1] === stairs[1];
      const xa = e.convexA ? 0.12 : 0;
      const xb = e.convexB ? 0.12 : 0;

      // 驳岸墙（要塞更厚）：水下部分用暗色湿石（否则透过水面看到白墙脚，像一块玻璃）
      const wet = (mat, s0, s1, o0, o1, y0, y1) => {
        putEdgeBox(S, underMat, e, s0, s1, o0, o1, y0, WET_Y);
        putEdgeBox(S, mat, e, s0, s1, o0, o1, WET_Y, y1);
      };
      wet(wallMat, 0, e.len, isKeep ? -2 : -1.2, 0, bottom, top - 0.3);
      // 水线青苔带 / 要塞墙脚斜台
      if (isKeep && !notch) wet(keepDark, -xa * 5, e.len + xb * 5, -0.4, 0.6, bottom, WATER_Y + 0.9);
      else if (!notch) putEdgeBox(S, M.stoneDark, e, -xa, e.len + xb, -0.3, 0.1, WATER_Y - 0.7, WATER_Y + 0.28);
      // 腰线
      if (!notch && !harborNorth) putEdgeBox(S, trimMat, e, -xa, e.len + xb, -0.3, 0.1, top - 0.85, top - 0.6);
      // 压顶石（带碰撞，顶 +0.06）
      if (!harborNorth) putEdgeBox(S, trimMat, e, -xa * 2, e.len + xb * 2, -0.75, 0.22, top - 0.3, top + 0.06, true);

      if (isKeep) {
        // 扶壁
        if (!notch && e.len > 30) {
          const n = Math.floor(e.len / 18);
          for (let i = 0; i < n; i++) {
            const s = (e.len - (n - 1) * 18) / 2 + i * 18;
            wet(keepBase, s - 1.2, s + 1.2, 0, 1.1, bottom, top - 2.2);
            putEdgeBox(S, M.stoneTrim, e, s - 1.35, s + 1.35, -0.1, 1.25, top - 2.2, top - 1.85);
          }
        }
        // 墙顶深色压顶线（外挑 0.35，压在白色女儿墙下方）
        if (!stairTop) putEdgeBox(S, keepDark, e, -xa * 3, e.len + xb * 3, -0.3, 0.35, top - 1.2, top - 0.3);
        if (!stairTop) for (const run of subtractRanges(e.len, openingsOn(e, landings))) parapet(S, M, e, run, top + 0.06);
        continue;
      }
      // 码头侧面木护舷：竖向护木每 4 m + 水线上方一道横向护舷木
      if (key === 'harbor') {
        const o = harborNorth ? 1.45 : 0; // 北沿在木栈道挑檐外侧
        const yTop = harborNorth ? top + 0.02 : top - 0.32;
        for (let s = 2; s < e.len - 1; s += 4) {
          if (harborNorth && (d.piers || []).some((p) => Math.abs(e.a[0] + e.ux * s - p.x) < p.w / 2 + 0.6)) continue;
          putEdgeBox(S, M.timber, e, s - 0.16, s + 0.16, o, o + 0.3, WATER_Y - 0.9, yTop);
        }
        putEdgeBox(S, M.timber, e, 0.3, e.len - 0.3, o + 0.3, o + 0.55, WATER_Y + 0.5, WATER_Y + 0.85);
      }
      if (harborNorth || !st.rail) continue;
      for (const run of subtractRanges(e.len, openingsOn(e, landings))) rail(S, M, M[st.rail], e, run, top + 0.06);
    }

    // ---- 顶面铺装 ----
    if (key === 'harbor') {
      buildHarbor(ctx, F, S, d, GM);
      continue;
    }
    if (key === 'lionsrest') {
      buildLionsRest(ctx, F, d, GM);
      continue;
    }
    const holes = [];
    if (d.plaza) holes.push(rectPoly(d.plaza.rect));
    const yards = [];
    for (const b of d.blocks || []) {
      const y = yardRect(b);
      if (y) {
        holes.push(rectPoly(y));
        yards.push(y);
      }
    }
    F.add(GM[st.top], flatPolyGeo(d.poly, top, holes));
    // 广场石板：略高 0.05，带碰撞
    if (d.plaza) {
      const [x0, z0, x1, z1] = d.plaza.rect;
      F.add(GM.plaza, slabGeo(x0, z0, x1, z1, top - 0.2, top + 0.05));
      F.collider((x0 + x1) / 2, top - 0.2, (z0 + z1) / 2, x1 - x0, 0.25, z1 - z0);
    }
    for (const y of yards) {
      const m = st.yards[Math.floor(rng() * st.yards.length)];
      F.add(GM[m], flatPolyGeo(rectPoly(y), top));
    }
  }

  // ---- 要塞阶梯槽地基：从河床填到 -0.4（顶面留给 D 模块的大台阶）----
  {
    const [x0, z0, x1, z1] = stairs;
    S.box(M.stoneGrey, (x0 + x1) / 2, BED, (z0 + z1) / 2, x1 - x0, -0.4 - BED, z1 - z0, { collide: false });
  }

  // ---- 运河河床 + 城墙内侧水下护脚 + 英雄谷谷口挡水坝 ----
  const bedMat = M.dirt.clone();
  bedMat.name = 'terrainCanalBed';
  bedMat.color.set(0x6e6452);
  bedMat.polygonOffset = true;
  bedMat.polygonOffsetFactor = 1;
  bedMat.polygonOffsetUnits = 2;
  F.add(bedMat, flatPolyGeo(WATER_POLY, CANAL_BED_Y));
  const V1 = valleyToWorld(VALLEY.halfWidth, 0);
  for (const e of polyEdges(WATER_POLY)) {
    const isMouth = Math.hypot(e.a[0] - V1[0], e.a[1] - V1[1]) < 0.01;
    if (isMouth) putEdgeBox(S, underMat, e, -1, e.len + 1, -3.2, 0, VALLEY_FLOOR_Y - 0.5, WATER_Y + 0.6);
    else putEdgeBox(S, underMat, e, 0, e.len, -4.0, -3.0, BED, WATER_Y - 0.2);
  }
  return { underMat };
}

// ---------- 雄狮安息地：整岛草地 + 十字碎石路 + 纪念碑环路 ----------
function buildLionsRest(ctx, F, d, M) {
  const [x0, z0, x1, z1] = [-258, -230, -168, -48];
  const [mx, mz] = LANDMARKS.lionsMemorial.center;
  F.add(M.grass, flatPolyGeo(d.poly, d.top));
  const y0 = d.top - 0.1;
  const y1 = d.top + 0.05;
  // 南北主路（连雄狮—法师桥）、东西主路（连大教堂—雄狮桥）
  F.add(M.dirt, slabGeo(mx - 2.5, z0 + 0.8, mx + 2.5, z1 - 0.8, y0, y1));
  F.add(M.dirt, slabGeo(x0 + 0.8, mz - 2.5 - 1, x1 - 0.8, mz + 2.5 - 1, y0, y1)); // 对齐桥 z = -140
  // 环路
  const circle = (r, n = 48) => Array.from({ length: n }, (_, i) => [mx + Math.cos((i / n) * Math.PI * 2) * r, mz + Math.sin((i / n) * Math.PI * 2) * r]);
  F.add(M.dirt, flatPolyGeoEarcut(circle(17), y1, [circle(14)]));
  // 纪念碑石台
  F.add(M.plaza, slabGeo(mx - 7, mz - 7, mx + 7, mz + 7, y0, d.top + 0.1));
  F.collider(mx, y0, mz, 14, 0.2, 14);
  // 沿岸一圈窄步道
  const ins = 2.4;
  const w = 2.2;
  for (const r of [
    [x0 + ins, z0 + ins, x1 - ins, z0 + ins + w],
    [x0 + ins, z1 - ins - w, x1 - ins, z1 - ins],
    [x0 + ins, z0 + ins, x0 + ins + w, z1 - ins],
    [x1 - ins - w, z0 + ins, x1 - ins, z1 - ins],
  ]) F.add(M.dirt, slabGeo(r[0], r[1], r[2], r[3], y0, y1));
}

// ---------- 暴风港：石码头 + 木栈道 + 木栈桥 ----------
function buildHarbor(ctx, F, S, d, GM) {
  const M = ctx.mat;
  const [x0, z0, x1, z1] = [-300, -300, 140, -266];
  const deckZ = z0 + 8; // 北沿 8 m 是木栈道
  F.add(GM.cobble, flatPolyGeo(rectPoly([x0, deckZ, x1, z1]), d.top));
  // 木栈道：挑出驳岸 1.2 m
  F.box(GM.planks, (x0 + x1) / 2, d.top - 0.3, (z0 - 1.2 + deckZ) / 2, x1 - x0, 0.3, deckZ - (z0 - 1.2));
  S.box(M.timber, (x0 + x1) / 2, d.top - 0.62, z0 - 1.25, x1 - x0, 0.6, 0.4, { collide: false }); // 檐口木梁
  // 系船柱
  const piers = d.piers || [];
  for (let x = x0 + 5; x < x1 - 3; x += 10) {
    if (piers.some((p) => Math.abs(p.x - x) < p.w / 2 + 2)) continue;
    // 系船桩：铸铁桩身 + 外翻桩帽（带碰撞）
    S.add(M.iron, cylGeo(0.3, 0.7, 10, 0.24).translate(x, d.top, z0 - 0.5));
    S.add(M.iron, cylGeo(0.4, 0.14, 10).translate(x, d.top + 0.7, z0 - 0.5));
    S.collider(x, d.top, z0 - 0.5, 0.7, 0.85, 0.7);
  }
  // 木栈桥：桥面 y = 0.3，下有纵梁、横梁、桩（桩头冒出桥面当系船桩）
  for (const p of piers) {
    const len = Math.abs(p.z1 - p.z0);
    const zc = (p.z0 + p.z1) / 2;
    const deckTop = d.top + 0.3;
    S.box(M.planks, p.x, deckTop - 0.3, zc, p.w, 0.3, len);
    for (const sx of [-1, 1]) S.box(M.timber, p.x + sx * (p.w / 2 - 0.6), deckTop - 0.75, zc, 0.4, 0.45, len, { collide: false });
    for (let z = p.z0 - 3; z > p.z1; z -= 6) {
      S.box(M.timber, p.x, deckTop - 0.8, z, p.w + 0.6, 0.5, 0.45, { collide: false });
      for (const sx of [-1, 1]) S.add(M.timber, cylGeo(0.3, deckTop + 0.55 - (HARBOR_BED + 0.2), 8).translate(p.x + sx * (p.w / 2 + 0.05), HARBOR_BED + 0.2, z));
    }
    // 栈桥尽头：横向栏木
    S.box(M.timber, p.x, deckTop, p.z1 + 0.3, p.w, 0.9, 0.3);
  }
}
