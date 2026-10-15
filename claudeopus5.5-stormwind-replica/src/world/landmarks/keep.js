// 暴风要塞：高台王城（岛顶面 y = KEEP_Y = 12）。世界坐标直接建造。
// 南缘阶梯槽里的大台阶（y 0 → 12，40 级 × 0.3 m）→ 门楼拱 → 庭院（铺装 / 花坛 / 国王雕像）
// → 王座厅（26 × 52，真空心，可进入）+ 前角塔 ×4、翼楼 ×2、翼端大塔 ×2、主塔（≈ 96 m 尖顶）。
// 岛边一圈垛口女儿墙（台阶槽顶开口处断开）+ 七座蓝锥角堡，远看是"高台王城"的剪影。
import * as THREE from 'three';
import { cylGeo, coneGeo, prismGeo } from '../../core/geom.js';
import {
  archWall, archBandGeo, archPaneGeo, triGeo, ringOfBoxes, parapet, carpetGeo, gableRoof,
  lionStatue, hangBanner, brazier, trs, finishInto,
} from './kit.js';

export function buildKeep(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const Y = C.KEEP_Y;
  const D = C.DISTRICTS.keep;
  const K = C.LANDMARKS.keep;

  const B = shared.B; // 外观几何并入模块级合批 Builder（index.js 统一 finish）
  const glass = { glass: shared.glassIn || M.stained, glassOut: M.stainedOutside || M.stained };

  // ---------- 大台阶（阶梯槽内，南低北高）----------
  const [sx0, sz0, sx1, sz1] = D.stairs.rect;
  const { fromY, toY } = D.stairs;
  const N = Math.round((toY - fromY) / 0.3);
  const rise = (toY - fromY) / N;
  const run = (sz1 - sz0) / N;
  const xc = (sx0 + sx1) / 2;
  // 踢面（台阶体）用压暗 18% 的石材，踏面另铺一层原色石板，前缘一条亮色压边——
  // 白石叠白石时靠明度差读出"一级一级"，而不是一整条斜坡
  const riser = M.stoneTrim.clone();
  riser.color.multiplyScalar(0.8);
  riser.name = 'lmStairRiser';
  const nosing = M.stoneTrim.clone();
  nosing.color.setRGB(1.18, 1.16, 1.1);
  nosing.name = 'lmStairNosing';
  shared.stairMats = [riser, nosing];
  const sw = sx1 - sx0;
  for (let i = 0; i < N; i++) {
    const top = fromY + rise * (i + 1);
    const zc = sz1 - run * (i + 0.5);
    B.box(riser, xc, -3, zc, sw, top + 3 - 0.06, run + 0.002);
    B.box(M.stoneTrim, xc, top - 0.06, zc - 0.03, sw - 1.8, 0.06, run - 0.06, { collide: false });
    B.box(nosing, xc, top - 0.07, zc + run / 2 - 0.05, sw - 1.8, 0.075, 0.1, { collide: false });
    B.collider(xc, top - 0.06, zc, sw, 0.06, run);
  }
  // 两侧石栏：每 4 级一段，阶梯状压顶
  for (let j = 0; j < N / 4; j++) {
    const zS = sz1 - run * 4 * j;
    const zN = sz1 - run * 4 * (j + 1);
    const top = fromY + rise * 4 * (j + 1) + 1.0;
    for (const x of [sx0 + 0.45, sx1 - 0.45]) {
      B.box(M.stoneWhite, x, -3, (zS + zN) / 2, 0.9, top + 3, zS - zN + 0.01);
      B.box(M.stoneTrim, x, top, (zS + zN) / 2, 1.15, 0.2, zS - zN + 0.04, { collide: false });
    }
  }
  // 台阶脚下的望柱 + 金球
  for (const x of [sx0 + 0.45, sx1 - 0.45]) {
    B.box(M.stoneTrim, x, -3, sz1 - 0.6, 1.3, 3 + 1.9, 1.3);
    B.add(M.gold, new THREE.SphereGeometry(0.42, 10, 8), trs(x, 1.9 + 0.35, sz1 - 0.6));
  }

  // ---------- 门楼拱（台阶顶端）----------
  const gz = sz0 - 4; // 门楼中心 z（厚 8：z -124 → -132）
  archWall(B, M.stoneWhite, xc, Y, gz, 0, 24, 14, 8, [{ x: 0, y0: 0, w: 10, spring: 6, kind: 'round' }]);
  B.add(M.stoneTrim, archBandGeo(11.8, 10, 6, 'round', 0.45), trs(xc, Y, sz0));
  B.add(M.gold, archBandGeo(10.3, 10, 6, 'round', 0.5), trs(xc, Y, sz0));
  B.add(M.gold, new THREE.BoxGeometry(1.2, 1.6, 0.6), trs(xc, Y + 11.2, sz0 + 0.3));
  parapet(B, M.stoneWhite, xc - 12, sz0 - 0.35, xc + 12, sz0 - 0.35, Y + 14, { capMat: M.stoneTrim });
  parapet(B, M.stoneWhite, xc - 12, sz0 - 7.65, xc + 12, sz0 - 7.65, Y + 14, { capMat: M.stoneTrim });
  B.box(M.stoneTrim, xc, Y + 13.6, gz, 24.8, 0.5, 8.8, { collide: false });
  for (const s of [-1, 1]) {
    hangBanner(B, M, xc + s * 8.6, Y + 11.5, sz0 + 0.06, 0, 2.6, 4, 1.4);
    roundTower(B, M, xc + s * 12, gz, -3, Y + 20, 4, { capR: 4.9, capH: 10, ring: [Y, Y + 12] });
    const fy = brazier(B, M, xc + s * 4.2, Y, sz0 - 9.5, { scale: 0.9 });
    ctx.lights.add({ x: xc + s * 4.2, y: fy, z: sz0 - 9.5, color: 0xff9a40, intensity: 1.0, range: 14, kind: 'fire', flicker: true });
  }

  // ---------- 高台女儿墙（沿岛边，台阶槽顶开口处断开）+ 角堡 ----------
  const P = D.poly;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    if (a[1] === sz0 && b[1] === sz0) continue; // 台阶槽顶边 = 开口
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / len;
    let nz = (b[0] - a[0]) / len;
    if (!C.pointInPoly((a[0] + b[0]) / 2 + nx, (a[1] + b[1]) / 2 + nz, P)) {
      nx = -nx;
      nz = -nz;
    }
    parapet(B, M.stoneWhite, a[0], a[1], b[0], b[1], Y, { off: 0.45, nx, nz, capMat: M.stoneTrim });
  }
  const bastions = [[228, -330], [370, -330], [370, -98], [228, -98], [370, -214], [228, -214], [299, -330]];
  for (const [x, z] of bastions) roundTower(B, M, x, z, -3, Y + 10, 4.5, { capR: 5.4, capH: 10 });

  // ---------- 庭院：铺装、花坛、国王雕像 ----------
  const [cx0, cz0, cx1, cz1] = K.courtyard;
  // 整个高台铺冷灰石（比白墙暗两档），让白色主楼 / 塔从地面上"跳"出来
  const pave = M.plaza.clone();
  pave.color.setRGB(0.6, 0.64, 0.7);
  pave.name = 'lmKeepPave';
  shared.keepPave = pave;
  B.add(pave, prismGeo(D.poly, Y + 0.03, 0.05));
  // 石板路：门楼 → 东西向横路 → 中轴大道 → 王座厅
  // 检阅大道：12 m 宽浅色石板 + 两侧深色路缘，旗杆阵列夹道
  B.box(M.stoneTrim, 300, Y, (cz0 + cz1) / 2, 12, 0.06, cz1 - cz0, { collide: false });
  for (const s of [-1, 1]) B.box(M.stoneGrey, 300 + s * 6.3, Y, (cz0 + cz1) / 2, 0.6, 0.08, cz1 - cz0, { collide: false });
  B.box(M.stoneTrim, (240 + 300) / 2, Y, -136, 60, 0.06, 7, { collide: false });
  for (const z of [-142, -151, -160, -169]) { // 旗杆列（前院；内院让给门厅与石狮）
    for (const s of [-1, 1]) {
      const x = 300 + s * 8;
      B.box(M.stoneGrey, x, Y, z, 0.9, 0.7, 0.9);
      B.add(M.iron, cylGeo(0.11, 11.5, 6), trs(x, Y + 0.7, z));
      B.add(M.gold, new THREE.SphereGeometry(0.22, 8, 6), trs(x, Y + 12.3, z));
      hangBanner(B, M, x + s * -0.18, Y + 11.2, z, -s * Math.PI / 2, 1.5, 3.4, 1.2);
    }
  }
  // 前院 / 内院花坛（避开兵营、图书馆、内墙与行走路线）
  const beds = [[236, -172, 254, -160], [278, -172, 291, -150], [312, -208, 324, -190], [276, -208, 288, -190], [236, -208, 250, -182]];
  for (const r of beds) flowerBed(B, M, shared, r, Y);
  // 国王雕像（中轴线上，四周圆形花坛）
  {
    const sx = 266; // 前院西侧，让出中轴大道
    const sz = -156;
    ringOfBoxes(B, M.stoneTrim, sx, Y, sz, 6.2, 28, 1.45, 0.45, 0.4, { collide: true });
    const fg = new THREE.CircleGeometry(6.05, 28).rotateX(-Math.PI / 2);
    const p = fg.attributes.position;
    for (let i = 0; i < p.count; i++) fg.attributes.uv.setXY(i, p.getX(i), p.getZ(i));
    B.add(shared.flowers, fg, trs(sx, Y + 0.32, sz));
    B.box(M.stoneTrim, sx, Y, sz, 4.4, 0.6, 4.4);
    B.box(M.stoneWhite, sx, Y + 0.6, sz, 3.2, 3.4, 3.2);
    B.box(M.gold, sx, Y + 3.0, sz, 3.3, 0.25, 3.3, { collide: false });
    B.box(M.stoneTrim, sx, Y + 4.0, sz, 3.6, 0.4, 3.6, { collide: false });
    kingStatue(B, M, sx, Y + 4.4, sz);
  }
  innerWall(B, M, Y);
  courtBuildings(B, M, shared, Y);
  keepGrounds(B, M, shared, Y);

  // ---------- 王座厅（真空心）----------
  const [hx, hz] = K.center;
  const [hw, hd] = K.size;
  const hx0 = hx - hw / 2;
  const hx1 = hx + hw / 2;
  const hzS = hz + hd / 2; // -212
  const hzN = hz - hd / 2; // -264
  const H = 30; // 墙高（原 22，加高 36%）
  const FL = 0.6;
  B.box(M.plaza, hx, Y - 0.4, hz, hw, FL + 0.4, hd);
  B.box(M.stoneTrim, hx, Y, hzS + 2.25, 15, 0.3, 1.5);
  B.box(M.stoneTrim, hx, Y, hzS + 0.75, 15, FL, 1.5);
  // 南立面：大门 6 × 7+ 尖拱 + 圆窗
  archWall(B, M.stoneWhite, hx, Y, hzS - 0.6, 0, hw, H, 1.2, [
    { x: 0, y0: 0, w: 6, spring: FL + 7, kind: 'pointed' },
    { x: 0, y0: 23, r: 3, kind: 'circle' },
  ], glass);
  B.add(M.stoneTrim, archBandGeo(7.6, 6.0, FL + 7, 'pointed', 0.45), trs(hx, Y, hzS));
  B.add(M.gold, archBandGeo(6.3, 6.0, FL + 7, 'pointed', 0.55), trs(hx, Y, hzS));
  B.add(M.gold, new THREE.TorusGeometry(3.25, 0.16, 5, 28), trs(hx, Y + 23, hzS + 0.05));
  // 两侧墙：七跨高窗（彩窗）
  const winZ = [0, 1, 2, 3, 4, 5, 6].map((k) => hzS - 6.25 - 6.5 * k);
  for (const s of [-1, 1]) {
    archWall(B, M.stoneWhite, hx + s * (hw / 2 - 0.6), Y, hz, Math.PI / 2, hd, H, 1.2,
      winZ.map((z) => ({ x: hz - z, y0: 16, w: 2.4, spring: 21, kind: 'pointed' })), { ...glass, outside: s });
    B.box(M.stoneTrim, hx + s * (hw / 2 - 0.5), Y + H - 0.2, hz, 1.8, 0.6, hd + 0.4, { collide: false });
    for (const z of [hzS - 3, hzS - 9.5, hzS - 16, hzN + 16, hzN + 9.5, hzN + 3]) {
      B.box(M.stoneWhite, hx + s * (hw / 2 + 0.7), Y, z, 1.4, 24, 1.8);
      B.add(M.stoneTrim, coneGeo(0.7, 4.5, 4).rotateY(Math.PI / 4), trs(hx + s * (hw / 2 + 0.7), Y + 24, z));
      B.add(M.gold, new THREE.SphereGeometry(0.2, 6, 4), trs(hx + s * (hw / 2 + 0.7), Y + 28.6, z));
    }
  }
  // 北墙：王座背后的玫瑰窗 + 两扇尖窗
  archWall(B, M.stoneWhite, hx, Y, hzN + 0.6, 0, hw, H, 1.2, [
    { x: 0, y0: 22, r: 3.6, kind: 'circle' },
    { x: -7.5, y0: 14, w: 2.2, spring: 19.5, kind: 'pointed' },
    { x: 7.5, y0: 14, w: 2.2, spring: 19.5, kind: 'pointed' },
  ], { ...glass, outside: -1 });
  // 山墙 + 屋顶 + 金脊
  for (const z of [hzS - 0.6, hzN + 0.6]) {
    B.add(M.stoneWhite, triGeo(hw + 2.6, 17.6, 1.2), trs(hx, Y + H, z));
    B.box(M.stoneTrim, hx, Y + H - 0.3, z, hw + 1, 0.6, 1.8, { collide: false });
  }
  for (const g of gableRoof(hd - 1.6, hw + 0.8, 16, 0.8, 0.35)) B.add(M.roofBlue, g, trs(hx, Y + H, hz, 0, Math.PI / 2));
  B.box(M.gold, hx, Y + H + 16, hz, 0.4, 0.6, hd - 1, { collide: false });
  // 三段式墙面：深色勒脚 + 腰线 + 金色檐饰
  {
    const t = 0.35;
    const seg = (x0, x1, z, h, y, mat) => B.box(mat, (x0 + x1) / 2, y, z, x1 - x0, h, t, { collide: false });
    for (const [mat, y, h] of [[M.stoneGrey, Y, 2.4], [M.stoneTrim, Y + 14.2, 0.55], [M.gold, Y + H + 0.35, 0.3]]) {
      if (mat === M.stoneGrey) {
        seg(hx0, hx - 3.3, hzS + t / 2, h, y, mat);
        seg(hx + 3.3, hx1, hzS + t / 2, h, y, mat);
      } else seg(hx0, hx1, hzS + t / 2, h, y, mat);
      seg(hx0, hx1, hzN - t / 2, h, y, mat);
      for (const s of [-1, 1]) B.box(mat, hx + s * (hw / 2 + t / 2), y, hz, t, h, hd, { collide: false });
    }
  }
  for (const z of [hzS - 0.6, hzN + 0.6]) {
    B.add(M.gold, new THREE.SphereGeometry(0.7, 8, 6), trs(hx, Y + H + 18.2, z));
    B.add(M.gold, coneGeo(0.18, 3, 6), trs(hx, Y + H + 18.6, z));
  }
  B.collider(hx, Y + H - 0.6, hz, hw - 2, 0.4, hd - 2); // 室内判定用的顶
  // 正门两侧的旗帜与石狮
  foreHall(B, M, shared, { hx, hzS, Y, FL }); // 门厅（前殿）+ 门前石狮 / 旗帜

  // ---------- 塔群 ----------
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    roundTower(B, M, hx + sx * 15, hz + sz * 26.6, Y, Y + 40, 3.8, { capR: 4.6, capH: 13, ring: [Y + 14.2, Y + 30] });
  }
  for (const s of [-1, 1]) {
    // 翼楼：低于王座厅高窗
    const wx = hx + s * (hw / 2 + 10.5);
    B.box(M.stoneWhite, wx, Y, hz, 21, 8, 16);
    B.box(M.stoneTrim, wx, Y + 8, hz, 21.6, 0.5, 16.6, { collide: false });
    for (const g of gableRoof(21, 16, 3.5, 0.5, 0.3)) B.add(M.roofBlue, g, trs(wx, Y + 8.5, hz));
    for (let k = 0; k < 4; k++) {
      for (const fz of [8.03, -8.03]) {
        const f = B.frame(wx - 7.5 + k * 5, Y, hz + fz, fz > 0 ? 0 : Math.PI);
        f.add(M.windowGlow, archPaneGeo(1.3, 2.4, 4.8, 'round'), null);
        f.add(M.stoneTrim, new THREE.BoxGeometry(1.8, 0.25, 0.3), trs(0, 2.3, 0.1));
      }
    }
    // 翼端大塔
    roundTower(B, M, hx + s * 38, hz, Y, Y + 48, 6.5, { capR: 7.6, capH: 19, ring: [Y + 14.2, Y + 32], windows: 3 });
  }
  // 主塔（最高）
  // 主塔：东北角制高点（塔身 82 m + 尖顶 30 m，原 56 + 24）
  roundTower(B, M, hx, hzN - 12, Y, Y + 82, 9.5, { capR: 10.8, capH: 30, ring: [Y + 14.2, Y + 34, Y + 56, Y + 72], windows: 4, finial: 2 });
  hangBanner(B, M, hx, Y + 66, hzN - 12 + 9.62, 0, 4, 7, 2.4);


  buildThroneInterior(ctx, { hx, hz, hw, hd, hzS, hzN, Y, FL, H });
  ctx.hollowCount += 1;
}

// 圆塔：塔身（无缝圆柱）+ 碰撞方盒 + 腰线 + 檐口 + 垛口 + 蓝锥顶 + 金尖
function roundTower(B, M, x, z, y0, y1, r, { capR = r * 1.15, capH = r * 2.2, ring = [], windows = 0, finial = 1 } = {}) {
  B.add(M.stoneWhite, cylGeo(r, y1 - y0, 16), trs(x, y0, z));
  B.collider(x, y0, z, r * 1.5, y1 - y0, r * 1.5);
  // 深色勒脚（从水里升起的角堡一直包到高台面以上）+ 金色檐饰
  const pTop = y0 < 0 ? 12.8 : y0 + 2.4;
  B.add(M.stoneGrey, cylGeo(r + 0.18, pTop - y0, 16, r + 0.12), trs(x, y0, z));
  B.add(M.gold, cylGeo(r + 0.72, 0.28, 16), trs(x, y1 + 0.45, z));
  for (const y of ring) B.add(M.stoneTrim, cylGeo(r + 0.18, 0.45, 16), trs(x, y, z));
  B.add(M.stoneTrim, cylGeo(r + 0.55, 1.1, 16, r + 0.65), trs(x, y1 - 0.6, z));
  ringOfBoxes(B, M.stoneWhite, x, y1 + 0.5, z, r + 0.3, Math.max(8, Math.round(r * 2.2)), 0.9, 1.1, 0.5);
  B.add(M.roofBlue, coneGeo(capR, capH, 16), trs(x, y1 + 0.5, z));
  B.add(M.gold, new THREE.SphereGeometry(0.35 * finial, 8, 6), trs(x, y1 + 0.5 + capH, z));
  B.add(M.gold, coneGeo(0.12 * finial, 2.5 * finial, 6), trs(x, y1 + 0.6 + capH, z));
  for (let i = 0; i < windows; i++) {
    const a = (i / windows) * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const y = y0 + (y1 - y0) * (0.35 + k * 0.22);
      B.add(M.stainedOutside || M.stained, archPaneGeo(1.4, 0, 2.6, 'pointed'), trs(x + Math.sin(a) * (r + 0.04), y, z + Math.cos(a) * (r + 0.04), 0, a));
    }
  }
}

// 花坛：石砌矮沿（可踩上）+ 花面 + 几丛修剪过的灌木
function flowerBed(B, M, shared, [x0, z0, x1, z1], Y) {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  B.box(M.stoneTrim, cx, Y, z0 + 0.2, w, 0.45, 0.4);
  B.box(M.stoneTrim, cx, Y, z1 - 0.2, w, 0.45, 0.4);
  B.box(M.stoneTrim, x0 + 0.2, Y, cz, 0.4, 0.45, d - 0.8);
  B.box(M.stoneTrim, x1 - 0.2, Y, cz, 0.4, 0.45, d - 0.8);
  B.box(shared.flowers, cx, Y, cz, w - 0.8, 0.35, d - 0.8, { collide: false });
  const n = Math.max(2, Math.floor(Math.max(w, d) / 5));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = w > d ? x0 + w * t : cx;
    const z = w > d ? cz : z0 + d * t;
    const r = 0.9 + ((i * 37) % 5) * 0.12;
    B.add(M.leaves, new THREE.IcosahedronGeometry(r, 1), trs(x, Y + 0.35 + r * 0.8, z, 0, 0, 0, 1, 1.15, 1));
  }
}

// 国王雕像：长袍、披风、高举的金剑
function kingStatue(B, M, x, y, z) {
  const f = B.frame(x, y, z, 0);
  f.add(M.statue, cylGeo(1.05, 2.8, 12, 0.5), trs(0, 0, 0));
  f.add(M.statue, cylGeo(0.55, 1.1, 10, 0.5), trs(0, 2.8, 0));
  f.add(M.statue, new THREE.SphereGeometry(0.62, 10, 8), trs(0, 3.85, 0, 0, 0, 0, 1.3, 0.6, 1));
  f.add(M.statue, new THREE.SphereGeometry(0.4, 12, 10), trs(0, 4.35, 0.05));
  f.add(M.gold, new THREE.CylinderGeometry(0.36, 0.32, 0.25, 10, 1, true), trs(0, 4.72, 0.05));
  f.add(M.statue, new THREE.CylinderGeometry(0.15, 0.17, 1.5, 6), trs(0.6, 4.5, 0.1, 0, 0, -0.35));
  f.add(M.statue, new THREE.CylinderGeometry(0.15, 0.17, 1.3, 6), trs(-0.55, 3.3, 0.35, 0.6, 0, 0.3));
  f.add(M.gold, new THREE.BoxGeometry(0.16, 3.0, 0.06), trs(1.05, 6.4, 0.1, 0, 0, -0.18));
  f.add(M.gold, new THREE.BoxGeometry(0.8, 0.14, 0.14), trs(0.88, 5.15, 0.1, 0, 0, -0.18));
  f.add(M.fabricBlue, new THREE.CylinderGeometry(0.75, 1.25, 3.3, 10, 1, true, Math.PI * 0.6, Math.PI * 0.8), trs(0, 1.7, -0.1));
}

// ---------- 王座厅室内（距离 LOD）----------
function buildThroneInterior(ctx, { hx, hz, hw, hd, hzS, hzN, Y, FL, H }) {
  const { mat: M } = ctx;
  const gi = new THREE.Group();
  gi.name = '王座厅·室内';
  ctx.scene.add(gi);
  const B = ctx.builder({ parent: gi, tag: 'throne-interior', chunk: 1000 });
  const fy = Y + FL;

  // 木藻井天花 + 横梁
  B.box(M.planks, hx, Y + H - 0.6, hz, hw - 2.4, 0.3, hd - 2.4, { collide: false });
  for (let k = 0; k < 8; k++) B.box(M.timber, hx, Y + H - 1.4, hzS - 3 - k * 6.5, hw - 2.4, 0.8, 0.6, { collide: false });
  for (const s of [-1, 1]) B.box(M.timber, hx + s * 6.5, Y + H - 1.6, hz, 0.7, 0.9, hd - 2.4, { collide: false });
  // 两排巨柱
  const colZ = [0, 1, 2, 3, 4, 5].map((k) => hzS - 7 - 6.5 * k);
  for (const s of [-1, 1]) {
    for (const z of colZ) {
      const x = hx + s * 6.5;
      B.box(M.stoneTrim, x, fy, z, 2.4, 0.8, 2.4);
      B.add(M.stoneWhite, cylGeo(0.9, H - FL - 0.8 - 1.6, 14), trs(x, fy + 0.8, z));
      B.add(M.gold, cylGeo(0.92, 0.35, 14), trs(x, fy + 4, z));
      B.add(M.gold, cylGeo(1.25, 0.8, 14, 0.95).rotateX(Math.PI), trs(x, Y + H - 1.6, z));
      B.collider(x, fy, z, 1.8, H - 2, 1.8);
    }
  }
  // 红地毯：大门 → 王座台
  B.add(M.carpet, carpetGeo(3.6, hzS - (hzN + 11) - 0.3, 2), trs(hx, fy + 0.015, (hzS - 0.3 + hzN + 11) / 2));
  // 三级王座台
  const tiers = [[18, 10], [14, 8.5], [10, 7]];
  tiers.forEach(([w, d], i) => {
    const zc = hzN + 1.2 + d / 2;
    B.box(M.stoneTrim, hx, fy + 0.3 * i, zc, w, 0.3, d);
    B.box(M.gold, hx, fy + 0.3 * i + 0.24, zc + d / 2 + 0.01, w, 0.06, 0.04, { collide: false });
    B.add(M.carpet, carpetGeo(3.6, 1.5, 2), trs(hx, fy + 0.3 * (i + 1) + 0.012, zc + d / 2 - 0.75));
  });
  // 金色王座
  {
    const ty = fy + 0.9;
    const tz = hzN + 4.2;
    B.box(M.gold, hx, ty, tz, 2.6, 1.0, 2.0);
    B.box(M.gold, hx, ty, tz - 1.15, 2.6, 4.6, 0.45);
    for (const s of [-1, 1]) {
      B.box(M.gold, hx + s * 1.35, ty + 1.0, tz, 0.35, 0.6, 2.0, { collide: false });
      B.add(M.gold, new THREE.SphereGeometry(0.28, 8, 6), trs(hx + s * 1.35, ty + 1.75, tz + 0.9));
      B.add(M.gold, coneGeo(0.22, 1.2, 6), trs(hx + s * 1.15, ty + 4.6, tz - 1.15));
    }
    B.box(M.fabricRed, hx, ty + 1.0, tz + 0.1, 2.0, 0.2, 1.6, { collide: false });
    B.box(M.fabricRed, hx, ty + 1.3, tz - 0.9, 1.7, 2.8, 0.06, { collide: false });
    B.add(M.gold, new THREE.TorusGeometry(0.8, 0.12, 6, 18), trs(hx, ty + 5.2, tz - 1.15));
    B.add(M.gold, new THREE.SphereGeometry(0.35, 8, 6), trs(hx, ty + 5.2, tz - 1.15));
  }
  // 两侧墙上的旗帜、王座背后的大旗
  const banZ = [0, 1, 2, 3, 4, 5].map((k) => hzS - 9.5 - 6.5 * k);
  for (const s of [-1, 1]) {
    for (const z of banZ) hangBanner(B, M, hx + s * (hw / 2 - 1.25), Y + 11.2, z, -s * Math.PI / 2, 2.6, 4, 1.4);
    hangBanner(B, M, hx + s * 4.2, Y + 14, hzN + 1.27, 0, 3.2, 5.2, 1.8);
  }
  // 火盆：地毯两侧 + 王座台两侧（火光闪烁）
  const braz = [[-3.2, hzS - 12], [3.2, hzS - 12], [-3.2, hzS - 31], [3.2, hzS - 31], [-7.6, hzN + 8.6], [7.6, hzN + 8.6]];
  for (const [dx, z] of braz) {
    const y = Math.abs(dx) > 5 ? fy + 0.3 : fy;
    const top = brazier(B, M, hx + dx, y, z);
    ctx.lights.add({ x: hx + dx, y: top, z, color: 0xff9a40, intensity: 1.6, range: 18, kind: 'fire', flicker: true });
  }
  // 两盏铁环吊灯
  for (const z of [hzS - 17, hzS - 36]) {
    const y = Y + 13;
    B.add(M.iron, cylGeo(0.05, Y + H - 1 - y, 4), trs(hx, y, z));
    B.add(M.iron, new THREE.TorusGeometry(2.2, 0.1, 5, 22), trs(hx, y, z, Math.PI / 2));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      B.add(M.lampGlow, cylGeo(0.08, 0.4, 5), trs(hx + Math.cos(a) * 2.2, y + 0.08, z + Math.sin(a) * 2.2));
      B.add(M.fire, coneGeo(0.07, 0.18, 5), trs(hx + Math.cos(a) * 2.2, y + 0.5, z + Math.sin(a) * 2.2));
    }
    ctx.lights.add({ x: hx, y: y - 0.4, z, color: 0xffc77a, intensity: 5, range: 24, kind: 'candle', flicker: true });
  }
  finishInto(B, { noShadow: [M.gold, M.carpet, M.fire, M.lampGlow, M.fabricRed, M.fabricBlue, M.banner, M.iron] });
  ctx.interiors.add(gi, hx, hz, 70);
}

// 内墙：把高台庭院切成前院（台阶 / 门楼一侧）与内院（王座厅前），中轴开一道拱门，两端小塔
function innerWall(B, M, Y, z = -176) {
  const x0 = 233.5;
  const x1 = 366.5;
  const gx = 300;
  const gw = 9; // 门洞宽
  const H = 7;
  for (const [a, b] of [[x0, gx - gw / 2 - 2], [gx + gw / 2 + 2, x1]]) {
    B.box(M.stoneGrey, (a + b) / 2, Y, z, b - a, 1.6, 1.8); // 深色勒脚
    B.box(M.stoneWhite, (a + b) / 2, Y + 1.6, z, b - a, H - 1.6, 1.6);
    parapet(B, M.stoneWhite, a, z, b, z, Y + H, { t: 1.6, h: 0.01, capMat: M.stoneTrim });
  }
  // 中门：两侧方墩 + 拱 + 金饰
  archWall(B, M.stoneWhite, gx, Y, z, 0, gw + 4, H + 3, 2.4, [{ x: 0, y0: 0, w: gw, spring: 5, kind: 'round' }]);
  B.add(M.gold, archBandGeo(gw + 0.5, gw, 5, 'round', 2.6), trs(gx, Y, z - 1.3));
  for (const s of [-1, 1]) {
    roundTower(B, M, gx + s * (gw / 2 + 3.6), z, Y, Y + 13, 2.2, { capR: 2.8, capH: 6 });
    hangBanner(B, M, gx + s * (gw / 2 + 1.0), Y + 9.5, z + 1.25, 0, 1.6, 3.2, 1.0);
  }
  for (const x of [x0, x1]) roundTower(B, M, x, z, Y, Y + 11, 2.6, { capR: 3.2, capH: 6.5 });
}

// 庭院体块建筑（不可进入，实心带碰撞）：前院东侧兵营、内院西侧皇家图书馆；行道树列
function courtBuildings(B, M, shared, Y) {
  const block = (x0, z0, x1, z1, h, rise, ridgeAlongX, winMat) => {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = x1 - x0;
    const d = z1 - z0;
    B.box(M.stoneGrey, cx, Y, cz, w + 0.3, 1.8, d + 0.3);
    B.box(M.stoneWhite, cx, Y + 1.8, cz, w, h - 1.8, d);
    B.box(M.stoneTrim, cx, Y + h, cz, w + 0.6, 0.45, d + 0.6, { collide: false });
    B.box(M.gold, cx, Y + h + 0.45, cz, w + 0.62, 0.12, d + 0.62, { collide: false });
    const roof = gableRoof(ridgeAlongX ? w : d, ridgeAlongX ? d : w, rise, 0.6, 0.3);
    for (const g of roof) B.add(M.roofBlue, g, trs(cx, Y + h + 0.45, cz, 0, ridgeAlongX ? 0 : Math.PI / 2));
    for (const sgn of [-1, 1]) {
      const gx = ridgeAlongX ? cx + sgn * (w / 2) : cx;
      const gz = ridgeAlongX ? cz : cz + sgn * (d / 2);
      B.add(M.stoneWhite, triGeo(ridgeAlongX ? d + 0.4 : w + 0.4, rise, 0.5), trs(gx, Y + h + 0.45, gz, 0, ridgeAlongX ? Math.PI / 2 : 0));
    }
    // 窗：长边两侧一排
    const long = ridgeAlongX ? w : d;
    const n = Math.floor(long / 4.5);
    for (let i = 0; i < n; i++) {
      const t = -long / 2 + (i + 0.5) * (long / n);
      for (const sgn of [-1, 1]) {
        const f = ridgeAlongX ? B.frame(cx + t, Y, cz + sgn * (d / 2 + 0.03), sgn > 0 ? 0 : Math.PI) : B.frame(cx + sgn * (w / 2 + 0.03), Y, cz + t, sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
        f.add(winMat, archPaneGeo(1.3, 3, 5.4, 'pointed'), null);
        if (h > 11) f.add(winMat, archPaneGeo(1.3, 8.2, 10, 'pointed'), null);
      }
    }
  };
  // 兵营：前院东侧长条两层，屋脊沿 x
  block(318, -168, 360, -142, 9, 5, true, M.windowGlow);
  for (const x of [324, 336, 348]) B.add(M.stoneGrey, cylGeo(0.7, 4, 8), trs(x, Y + 9 + 3.2, -155)); // 烟囱
  // 皇家图书馆：内院西侧，高窗彩窗，中央小穹顶
  block(236, -262, 252, -214, 14, 6, false, M.stainedOutside || M.stained);
  B.add(M.stoneWhite, cylGeo(3.2, 3, 16), trs(244, Y + 14 + 4.5, -238));
  B.add(M.roofBlue, new THREE.SphereGeometry(3.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), trs(244, Y + 14 + 7.5, -238));
  B.add(M.gold, coneGeo(0.25, 2.2, 6), trs(244, Y + 14 + 10.8, -238));
  // 行道树：门楼横路两侧、内院沿内墙
  const tree = (x, z, s = 1) => {
    B.add(M.bark, cylGeo(0.22 * s, 2.6 * s, 6), trs(x, Y, z));
    B.add(M.leaves, new THREE.IcosahedronGeometry(1.7 * s, 1), trs(x, Y + 3.6 * s, z, 0, 0, 0, 1, 1.15, 1));
    B.collider(x, Y, z, 0.6, 2.6, 0.6);
  };
  for (let x = 260; x <= 284; x += 8) { // 门楼（x≤256）以东、旗杆（x=292）以西
    tree(x, -130.2, 0.9);
    tree(x, -142.5, 0.9);
  }
  for (let x = 314; x <= 360; x += 9) tree(x, -181, 1);
  for (let x = 258; x <= 286; x += 9) tree(x, -181, 1);
}

// 门厅（前殿）：贴在王座厅南门外，20 m 纵深、自带蓝坡顶，把主殿拉成"门厅 → 大殿 → 主塔"的纵深长条体量；
// 正门朝南正对内院中门与大台阶方向。真空心：前门洞 + 后接王座厅大门，碰撞同源。
function foreHall(B, M, shared, { hx, hzS, Y, FL }) {
  const L = 20;
  const W = 14;
  const H = 18;
  const zF = hzS + L; // 门厅南立面
  const glass = { glass: shared.glassIn || M.stained, glassOut: M.stainedOutside || M.stained };
  B.box(M.plaza, hx, Y - 0.4, hzS + L / 2, W, FL + 0.4, L);
  B.box(M.stoneTrim, hx, Y, zF + 0.75, 12, 0.3, 1.5);
  archWall(B, M.stoneWhite, hx, Y, zF - 0.6, 0, W, H, 1.2, [
    { x: 0, y0: 0, w: 6, spring: FL + 7, kind: 'pointed' },
    { x: 0, y0: 15.2, r: 1.6, kind: 'circle' },
  ], glass);
  B.add(M.stoneTrim, archBandGeo(7.6, 6.0, FL + 7, 'pointed', 0.5), trs(hx, Y, zF));
  B.add(M.gold, archBandGeo(6.3, 6.0, FL + 7, 'pointed', 0.6), trs(hx, Y, zF));
  for (const s of [-1, 1]) {
    archWall(B, M.stoneWhite, hx + s * (W / 2 - 0.6), Y, hzS + L / 2 - 0.3, Math.PI / 2, L - 0.6, H, 1.2,
      [-4.5, 4.5].map((x) => ({ x, y0: 8, w: 2.2, spring: 12.5, kind: 'pointed' })), { ...glass, outside: s });
    // 三段式：勒脚 + 腰线 + 金檐
    B.box(M.stoneGrey, hx + s * (W / 2 + 0.17), Y, hzS + L / 2, 0.35, 2.4, L, { collide: false });
    B.box(M.stoneTrim, hx + s * (W / 2 + 0.17), Y + 14.2, hzS + L / 2, 0.35, 0.55, L, { collide: false });
    B.box(M.gold, hx + s * (W / 2 + 0.17), Y + H + 0.1, hzS + L / 2, 0.35, 0.3, L, { collide: false });
    B.box(M.stoneGrey, hx + s * 5.1, Y, zF + 0.17, 3.8, 2.4, 0.35, { collide: false });
    hangBanner(B, M, hx + s * 4.8, Y + 13, zF + 0.06, 0, 2.6, 4.4, 1.6);
    // 门前石狮
    B.box(M.stoneTrim, hx + s * 8.6, Y, zF + 3.6, 2.4, 1.5, 4.2);
    lionStatue(B, M, hx + s * 8.6, Y + 1.5, zF + 3.4, 0, 0.95);
  }
  B.box(M.stoneTrim, hx, Y + 14.2, zF + 0.17, W, 0.55, 0.35, { collide: false });
  for (const g of gableRoof(L, W + 0.4, 8, 0.6, 0.32)) B.add(M.roofBlue, g, trs(hx, Y + H, hzS + L / 2, 0, Math.PI / 2));
  B.add(M.stoneWhite, triGeo(W + 1.4, 8.8, 1.2), trs(hx, Y + H, zF - 0.6));
  B.box(M.gold, hx, Y + H + 8, hzS + L / 2, 0.35, 0.5, L, { collide: false });
  B.add(M.gold, new THREE.SphereGeometry(0.6, 8, 6), trs(hx, Y + H + 9.2, zF - 0.6));
  B.collider(hx, Y + H - 0.6, hzS + L / 2, W - 2.4, 0.4, L - 1.2); // 室内判定
}

// 高台空地的填充：南沿长条（z -98..-124）西段树篱园林、东段校场；前院东北旗杆列；内院东侧树篱园
function keepGrounds(B, M, shared, Y) {
  // 树篱方块 + 花坛：田字格园林
  const hedgeGarden = (x0, z0, x1, z1, cell = 9) => {
    for (let x = x0; x + cell <= x1 + 0.01; x += cell) {
      for (let z = z0; z + cell <= z1 + 0.01; z += cell) {
        const cx = x + cell / 2;
        const cz = z + cell / 2;
        const w = cell - 2.2; // 树篱之间留 2.2 m 小径
        for (const [dx, dz, ww, dd] of [[0, -w / 2 + 0.4, w, 0.8], [0, w / 2 - 0.4, w, 0.8], [-w / 2 + 0.4, 0, 0.8, w - 1.6], [w / 2 - 0.4, 0, 0.8, w - 1.6]]) {
          B.box(M.leaves, cx + dx, Y, cz + dz, ww, 1.1, dd);
        }
        B.box(shared.flowers, cx, Y, cz, w - 1.6, 0.3, w - 1.6, { collide: false });
        B.add(M.leaves, new THREE.IcosahedronGeometry(0.9, 1), trs(cx, Y + 1.0, cz, 0, 0, 0, 1, 1.4, 1));
      }
    }
  };
  hedgeGarden(252, -122, 297, -104);
  hedgeGarden(330, -209, 366, -191);
  // 校场：沙土地面 + 木栅 + 木桩靶 + 箭靶 + 兵器架
  const [tx0, tz0, tx1, tz1] = [306, -121.5, 364, -101];
  B.box(M.dirt, (tx0 + tx1) / 2, Y, (tz0 + tz1) / 2, tx1 - tx0, 0.07, tz1 - tz0, { collide: false });
  for (let x = tx0; x <= tx1; x += 2.9) {
    for (const z of [tz0, tz1]) B.box(M.timber, x, Y, z, 0.18, 1.1, 0.18, { collide: false });
  }
  for (const z of [tz0, tz1]) for (const y of [0.45, 0.95]) B.box(M.timber, (tx0 + tx1) / 2, Y + y, z, tx1 - tx0, 0.1, 0.08, { collide: false });
  for (let i = 0; i < 6; i++) {
    const x = tx0 + 5 + i * 4;
    const z = -108;
    B.box(M.timber, x, Y, z, 0.35, 1.9, 0.35); // 木桩
    B.box(M.timber, x, Y + 1.35, z, 1.3, 0.15, 0.15, { collide: false }); // 横臂
    B.add(M.planks, new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10).rotateX(Math.PI / 2), trs(x, Y + 1.75, z + 0.2));
  }
  for (const x of [tx1 - 14, tx1 - 8]) {
    // 箭靶：草垛圆盘 + 金色靶心
    B.add(M.planks, new THREE.CylinderGeometry(0.9, 0.9, 0.35, 16).rotateX(Math.PI / 2), trs(x, Y + 1.2, -116, -0.25));
    B.add(M.gold, new THREE.CylinderGeometry(0.25, 0.25, 0.37, 10).rotateX(Math.PI / 2), trs(x, Y + 1.2, -116, -0.25));
    B.box(M.timber, x, Y, -115.6, 1.4, 0.8, 0.2, { collide: false });
    B.collider(x, Y, -116, 1.8, 1.8, 0.8);
  }
  B.box(M.timber, tx1 - 3, Y, -104.5, 3.2, 1.6, 0.4); // 兵器架
  for (let i = 0; i < 6; i++) B.box(M.iron, tx1 - 4.4 + i * 0.55, Y + 0.3, -104.25, 0.06, 1.9, 0.05, { collide: false });
  // 前院东北：旗杆列
  for (let x = 316; x <= 362; x += 9.2) {
    B.box(M.stoneGrey, x, Y, -132, 0.9, 0.7, 0.9);
    B.add(M.iron, cylGeo(0.11, 10.5, 6), trs(x, Y + 0.7, -132));
    B.add(M.gold, new THREE.SphereGeometry(0.2, 8, 6), trs(x, Y + 11.3, -132));
    hangBanner(B, M, x, Y + 10.2, -131.8, 0, 1.4, 3.0, 1.1);
  }
}
