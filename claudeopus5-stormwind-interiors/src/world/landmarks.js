// 两处重头地标:圣光大教堂 与 王座城堡。两者都是"可走进去"的完整内景 —— 中殿、柱列、
// 筒形拱顶、彩窗、祭坛;以及王座厅、御座台、旗幔、火盆。
import * as THREE from 'three';
import {
  box, boxOn, cyl, cone, sphere, lathe, column, spireRoof, gableRoof, gableEnd,
  wallWithOpenings, archRing, crenellation, stairs, aabbOn, transformBox, extrude, balustrade,
} from '../core/geom.js';
import { Collector, placer, bench, chandelier } from './interior.js';
import { CITY } from './plan.js';

/* ================================================================== *
 *  圣光大教堂
 * ================================================================== */

export function buildCathedral(rng) {
  const C = new Collector();
  const boxes = [];
  const { x: cx, z: cz } = CITY.cathedral;
  const P = placer(C, cx, 0, cz, 0);   // 正面朝 +Z(南)

  const W = 42, D = 70, T = 1.3;
  const NAVE_H = 24;
  const FLOOR = 0.6;

  const put = (mat, geo) => P.add(mat, geo);
  const col = (b) => P.box(b);

  /* ---- 地坪与台基 ---- */
  put('stoneDark', boxOn(W + 6, FLOOR + 1.2, D + 6, 0, -1.2, 0));
  col(aabbOn(0, -1.2, 0, W + 6, FLOOR + 1.2, D + 6));
  put('marble', boxOn(W - T * 2, 0.1, D - T * 2, 0, FLOOR - 0.1, 0));
  // 门前踏步
  const st = stairs(3, 16, 0.2, 0.9, { x: 0, y: 0, z: D / 2 + 3.7, ry: Math.PI });
  for (const g of st.geos) put('stoneTrim', g);
  for (const b of st.boxes) col(b);

  /* ---- 四面墙 ---- */
  const sideWin = [];
  for (let i = 0; i < 6; i++) sideWin.push({ x: -22 + i * 8.8, y: 9.5, w: 3.4, h: 10, arch: true });
  for (const s of [-1, 1]) {
    const wall = wallWithOpenings({ width: D - T * 2, height: NAVE_H, thickness: T, openings: sideWin });
    const g = wall.geo;
    g.translate(0, FLOOR, 0);
    g.rotateY(s * Math.PI / 2);
    g.translate(s * (W / 2 - T / 2), 0, 0);
    put('stoneWarm', g);
    for (const b of wall.boxes) {
      col(transformBox([b[0], b[1] + FLOOR, b[2], b[3], b[4] + FLOOR, b[5]], s * (W / 2 - T / 2), 0, 0, s * Math.PI / 2));
    }
    // 彩窗玻璃
    for (const o of sideWin) {
      const glass = boxOn(o.w - 0.1, o.h - 0.25, 0.1, o.x, FLOOR + o.y, 0);
      glass.rotateY(s * Math.PI / 2);
      glass.translate(s * (W / 2 - T / 2), 0, 0);
      put('stainedLancet', glass);
      // 扶壁
      const bt = boxOn(1.6, NAVE_H * 0.86, 2.6, s * (W / 2 + 1.0), FLOOR, o.x);
      put('stoneWarm', bt);
      col(aabbOn(s * (W / 2 + 1.0), FLOOR, o.x, 1.6, NAVE_H * 0.86, 2.6));
      const cap = cone(1.5, 2.2, 4, s * (W / 2 + 1.0), FLOOR + NAVE_H * 0.86 + 1.1, o.x);
      put('roofTeal', cap);
    }
  }

  // 北墙(祭坛背后):三联高窗
  {
    const openings = [
      { x: -6.5, y: 10, w: 3.4, h: 9.5, arch: true },
      { x: 0, y: 11.5, w: 4.0, h: 11, arch: true },
      { x: 6.5, y: 10, w: 3.4, h: 9.5, arch: true },
    ];
    const wall = wallWithOpenings({ width: W, height: NAVE_H, thickness: T, openings });
    const g = wall.geo;
    g.translate(0, FLOOR, 0);
    g.rotateY(Math.PI);
    g.translate(0, 0, -(D / 2 - T / 2));
    put('stoneWarm', g);
    for (const b of wall.boxes) col(transformBox([b[0], b[1] + FLOOR, b[2], b[3], b[4] + FLOOR, b[5]], 0, 0, -(D / 2 - T / 2), Math.PI));
    for (const o of openings) {
      const glass = boxOn(o.w - 0.1, o.h - 0.25, 0.1, -o.x, FLOOR + o.y, 0);
      glass.rotateY(Math.PI);
      glass.translate(0, 0, -(D / 2 - T / 2));
      put('stainedLancet', glass);
    }
  }

  // 南墙(正立面):大门 + 玫瑰窗
  {
    const openings = [
      { x: 0, y: 0, w: 7.0, h: 11.5, arch: true },
      { x: -13, y: 5, w: 3.0, h: 7.5, arch: true },
      { x: 13, y: 5, w: 3.0, h: 7.5, arch: true },
      { x: 0, y: 11.9, w: 9.2, h: 9.2, round: true },   // 玫瑰窗洞口(中心对齐 roseY)
    ];
    const wall = wallWithOpenings({ width: W, height: NAVE_H, thickness: T, openings });
    const g = wall.geo;
    g.translate(0, FLOOR, 0);
    g.translate(0, 0, D / 2 - T / 2);
    put('stoneWarm', g);
    for (const b of wall.boxes) col(transformBox([b[0], b[1] + FLOOR, b[2], b[3], b[4] + FLOOR, b[5]], 0, 0, D / 2 - T / 2, 0));
    for (const o of openings.slice(1)) {
      put('stainedLancet', boxOn(o.w - 0.1, o.h - 0.25, 0.1, o.x, FLOOR + o.y, D / 2 - T / 2));
    }
    // 玫瑰窗:先在原点建好再整体搬过去(先平移后旋转会把构件甩飞)
    const roseY = FLOOR + 16.5, roseZ = D / 2 - T / 2;
    const rose = cyl(4.6, 4.6, 0.16, 24);
    rose.rotateX(Math.PI / 2); rose.translate(0, roseY, roseZ);
    put('stainedRose', rose);
    const roseFrame = lathe([[4.6, 0], [5.6, 0], [5.6, 0.5], [4.6, 0.5]], 24);
    roseFrame.rotateX(Math.PI / 2); roseFrame.translate(0, roseY, roseZ);
    put('stoneTrim', roseFrame);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      const spoke = box(0.3, 9.2, 0.32);
      spoke.rotateZ(a);
      spoke.translate(0, roseY, roseZ + 0.1);
      put('stoneTrim', spoke);
    }
    // 门洞券脸 + 双开木门
    put('stoneTrim', archRing(3.5, 0.9, 2.2, 0, FLOOR + 11.5 - 3.5, D / 2 + 0.4, 0));
    for (const s of [-1, 1]) {
      const leaf = boxOn(3.4, 10.4, 0.22, 1.7, 0, 0);
      leaf.rotateY(-s * 1.25);
      leaf.translate(s * 3.4, FLOOR, D / 2 - T / 2 - 0.3);
      put('plankDark', leaf);
    }
  }

  /* ---- 双塔 ---- */
  for (const s of [-1, 1]) {
    const tx = s * (W / 2 + 4.5), tz = D / 2 - 6;
    const h = 44;
    put('stoneWarm', boxOn(13, h, 13, tx, 0, tz));
    col(aabbOn(tx, 0, tz, 13, h, 13));
    for (let i = 1; i <= 3; i++) put('stoneTrim', boxOn(13.8, 0.5, 13.8, tx, i * 11, tz));
    // 钟层拱窗
    for (const dz of [-1, 1]) {
      put('ironDark', boxOn(3.4, 6.4, 0.4, tx, h - 9, tz + dz * 6.4));
      put('ironDark', boxOn(0.4, 6.4, 3.4, tx + dz * 6.4, h - 9, tz));
    }
    const cren = crenellation(13, 1.2, 1.5, 1.1, 1.6, { x: tx, y: h, z: tz - 6.4 });
    for (const g of cren.geos) put('stoneWarm', g);
    const cren2 = crenellation(13, 1.2, 1.5, 1.1, 1.6, { x: tx, y: h, z: tz + 6.4 });
    for (const g of cren2.geos) put('stoneWarm', g);
    const roof = spireRoof(9.6, 26, 4, 1.0);
    roof.rotateY(Math.PI / 4);
    roof.translate(tx, h + 1.4, tz);
    put('roofTeal', roof);
    put('gold', lathe([[0.6, 0], [0.3, 1.0], [0.14, 2.2], [0, 3.0]], 8, tx, h + 27, tz));
  }

  /* ---- 主体屋顶 ---- */
  {
    // 出檐取小值:山墙面出檐过大时,悬空那条屋面在正立面上会变成一道"飘着的刀片"
    for (const g of gableRoof(D, W, 11, 0.18, 0.4)) {
      g.rotateY(Math.PI / 2);
      g.translate(0, FLOOR + NAVE_H, 0);
      put('roofTeal', g);
    }
    for (const s of [-1, 1]) {
      const ge = gableEnd(W, 11, T);
      ge.translate(0, FLOOR + NAVE_H, s * (D / 2 - T / 2));
      put('stoneWarm', ge);
    }
    // 交叉处小尖塔
    const fleche = spireRoof(3.2, 16, 8);
    fleche.translate(0, FLOOR + NAVE_H + 10.6, -6);
    put('roofTeal', fleche);
    put('gold', lathe([[0.4, 0], [0.2, 0.8], [0, 1.6]], 8, 0, FLOOR + NAVE_H + 26.4, -6));
  }

  /* ---- 内部:柱列 + 筒拱 + 侧廊天花 ---- */
  const colX = 9.5, colH = 13.5;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const z = -24 + i * 8;
      const g = column(1.15, colH, 12);
      g.translate(s * colX, FLOOR, z);
      put('marble', g);
      col(aabbOn(s * colX, FLOOR, z, 2.6, colH, 2.6));
    }
    // 柱顶联系梁与拱券
    put('stoneTrim', boxOn(2.0, 1.0, 60, s * colX, FLOOR + colH, -2));
    for (let i = 0; i < 6; i++) {
      const z = -20 + i * 8;
      const ring = archRing(3.4, 0.8, 1.6, s * colX, FLOOR + colH, z, Math.PI / 2);
      put('stoneTrim', ring);
    }
    // 侧廊平顶
    put('stoneWarm', boxOn(W / 2 - colX - T, 0.5, D - T * 2, s * (colX + (W / 2 - colX - T) / 2 + 0.6), FLOOR + colH + 1.0, 0));
  }
  // 中殿筒形拱顶
  {
    const vault = archRing(colX, 0.9, D - T * 2 - 1, 0, FLOOR + colH + 1.0, 0, 0);
    put('stoneWarm', vault);
    // 拱肋:比拱壳内收,才凸出在拱面之下
    for (let i = 0; i < 8; i++) {
      const z = -26 + i * 7.5;
      put('stoneTrim', archRing(colX - 0.45, 0.5, 0.9, 0, FLOOR + colH + 1.0, z, 0));
    }
  }

  /* ---- 内部陈设 ---- */
  {
    const IP = placer(C, cx, FLOOR, cz, 0);
    // 长椅
    for (let i = 0; i < 11; i++) {
      const z = 26 - i * 3.4;
      for (const s of [-1, 1]) {
        const bp = IP.at(s * 4.6, 0, z);
        bp.add('plankDark', boxOn(7.2, 0.12, 0.44, 0, 0.47, 0));
        bp.add('plankDark', boxOn(7.2, 0.7, 0.1, 0, 0.62, -0.24));
        for (const sx of [-1, 1]) bp.add('plankDark', boxOn(0.16, 0.47, 0.4, sx * 3.4, 0, 0));
        bp.box(aabbOn(0, 0, 0, 7.2, 0.95, 0.5));
      }
    }
    // 中央红毯
    IP.add('carpet', boxOn(3.6, 0.03, 56, 0, 0.02, 0));

    // 祭坛台(北端三级)
    const dais = stairs(3, 22, 0.28, 1.1, { x: 0, y: 0, z: -22, ry: Math.PI });
    for (const g of dais.geos) IP.add('marble', g);
    for (const b of dais.boxes) IP.box(b);
    IP.add('marble', boxOn(22, 0.84, 8, 0, 0, -26.2));
    IP.box(aabbOn(0, 0, -26.2, 22, 0.84, 8));
    IP.add('marble', boxOn(4.4, 1.15, 1.8, 0, 0.84, -27));
    IP.add('gold', boxOn(4.8, 0.16, 2.1, 0, 1.99, -27));
    IP.box(aabbOn(0, 0.84, -27, 4.4, 1.3, 1.8));
    // 圣光柱(祭坛后的金色立像)
    IP.add('gold', lathe([[1.5, 0], [1.0, 0.6], [0.7, 3.0], [1.1, 4.0], [0.5, 5.2], [0.25, 6.4], [0, 7.0]], 12, 0, 0.84, -29.5));
    // 烛台
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const bx = s * (2.6 + i * 1.5), bz = -25.6 - i * 0.4;
        IP.add('gold', lathe([[0.34, 0], [0.14, 0.3], [0.1, 1.4], [0.3, 1.55], [0.1, 1.7]], 8, bx, 0.84, bz));
        IP.add('candle', cyl(0.08, 0.09, 0.5, 6, bx, 2.7, bz));
        IP.add('fireCore', cone(0.06, 0.18, 5, bx, 3.05, bz));
      }
    }
    IP.emit({ x: 0, y: 3.2, z: -26, color: 0xffd79a, intensity: 3.0, distance: 26, flicker: 0.5 });

    // 吊灯
    for (let i = 0; i < 4; i++) chandelier(IP.at(0, 0, 18 - i * 12), 11.5, 2.4, 10);
    // 侧廊壁灯
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = -18 + i * 12;
        IP.add('ironDark', boxOn(0.5, 0.16, 0.5, s * (W / 2 - T - 0.4), 3.4, z));
        IP.add('lampGlass', boxOn(0.4, 0.5, 0.4, s * (W / 2 - T - 0.4), 3.6, z));
        IP.emit({ x: s * (W / 2 - T - 0.6), y: 3.8, z, color: 0xffc98a, intensity: 1.6, distance: 14, night: false });
      }
    }
    // 旗幔
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const g = new THREE.PlaneGeometry(2.4, 6.4);
        g.rotateY(-s * Math.PI / 2);
        g.translate(s * (colX - 1.4), 6.5, -12 + i * 12);
        IP.add(i % 2 ? 'bannerRoyal' : 'bannerCrimson', g);
      }
    }
  }

  void rng;
  return { collector: C, boxes: [...C.boxes, ...boxes], name: '圣光大教堂' };
}

/* ================================================================== *
 *  王座城堡
 * ================================================================== */

export function buildKeep(rng) {
  const C = new Collector();
  const t = CITY.keep.terrace, H = CITY.keep.height;
  const cx = (t[0] + t[2]) / 2, cz = (t[1] + t[3]) / 2 - 4;
  const P = placer(C, cx, H, cz, 0);
  const put = (m, g) => P.add(m, g);

  const W = 52, D = 58, T = 1.6, HALL_H = 17;

  /* ---- 墙体 ---- */
  const sideWin = [];
  for (let i = 0; i < 5; i++) sideWin.push({ x: -20 + i * 10, y: 6.5, w: 2.6, h: 6.5, arch: true });
  for (const s of [-1, 1]) {
    const wall = wallWithOpenings({ width: D - T * 2, height: HALL_H, thickness: T, openings: sideWin });
    const g = wall.geo;
    g.rotateY(s * Math.PI / 2);
    g.translate(s * (W / 2 - T / 2), 0, 0);
    put('stone', g);
    for (const b of wall.boxes) P.box(transformBox(b, s * (W / 2 - T / 2), 0, 0, s * Math.PI / 2));
    for (const o of sideWin) {
      const glass = boxOn(o.w - 0.1, o.h - 0.2, 0.1, o.x, o.y, 0);
      glass.rotateY(s * Math.PI / 2);
      glass.translate(s * (W / 2 - T / 2), 0, 0);
      put('stainedLancet', glass);
    }
  }
  // 北墙(王座背后)
  {
    const openings = [{ x: 0, y: 8, w: 5, h: 8, arch: true }];
    const wall = wallWithOpenings({ width: W, height: HALL_H, thickness: T, openings });
    wall.geo.rotateY(Math.PI);
    wall.geo.translate(0, 0, -(D / 2 - T / 2));
    put('stone', wall.geo);
    for (const b of wall.boxes) P.box(transformBox(b, 0, 0, -(D / 2 - T / 2), Math.PI));
    put('stainedRose', boxOn(4.9, 7.8, 0.12, 0, 8, -(D / 2 - T / 2)));
  }
  // 南墙(入口)
  {
    const openings = [
      { x: 0, y: 0, w: 6.4, h: 9.5, arch: true },
      { x: -14, y: 6, w: 2.6, h: 6, arch: true },
      { x: 14, y: 6, w: 2.6, h: 6, arch: true },
    ];
    const wall = wallWithOpenings({ width: W, height: HALL_H, thickness: T, openings });
    wall.geo.translate(0, 0, D / 2 - T / 2);
    put('stone', wall.geo);
    for (const b of wall.boxes) P.box(transformBox(b, 0, 0, D / 2 - T / 2, 0));
    for (const o of openings.slice(1)) put('stainedLancet', boxOn(o.w - 0.1, o.h - 0.2, 0.1, o.x, o.y, D / 2 - T / 2));
    put('stoneTrim', archRing(3.2, 0.9, 2.4, 0, 9.5 - 3.2, D / 2 + 0.5, 0));
    for (const s of [-1, 1]) {
      const leaf = boxOn(3.1, 8.6, 0.24, 1.55, 0, 0);
      leaf.rotateY(-s * 1.2);
      leaf.translate(s * 3.1, 0, D / 2 - T / 2 - 0.3);
      put('plankDark', leaf);
    }
  }

  /* ---- 地面 / 天花 / 屋顶 ---- */
  put('flagstone', boxOn(W - T * 2, 0.14, D - T * 2, 0, -0.14, 0));
  put('timberDark', boxOn(W - T * 2, 0.5, D - T * 2, 0, HALL_H - 0.5, 0));
  for (let i = 0; i < 9; i++) {
    put('timberDark', boxOn(W - T * 2, 0.7, 0.8, 0, HALL_H - 1.2, -D / 2 + 4 + i * 6.4));
  }
  for (const g of gableRoof(D, W, 13, 0.25, 0.4)) {
    g.rotateY(Math.PI / 2);
    g.translate(0, HALL_H, 0);
    put('roofBlue', g);
  }
  for (const s of [-1, 1]) {
    const ge = gableEnd(W, 13, T);
    ge.translate(0, HALL_H, s * (D / 2 - T / 2));
    put('stone', ge);
  }

  /* ---- 四角塔 + 主塔 ---- */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tx = sx * (W / 2 - 1), tz = sz * (D / 2 - 1);
      const r = 6.4, h = 30;
      put('stone', cyl(r, r * 1.08, h, 16, tx, h / 2, tz));
      P.box(aabbOn(tx, 0, tz, r * 2, h, r * 2));
      put('stoneTrim', cyl(r + 0.7, r + 0.7, 0.6, 16, tx, h - 0.3, tz));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        put('stone', boxOn(1.4, 1.4, 1.0, tx + Math.sin(a) * (r + 0.2), h, tz + Math.cos(a) * (r + 0.2), a));
      }
      const roof = spireRoof(r + 1.4, 15, 16);
      roof.translate(tx, h + 1.4, tz);
      put('roofBlue', roof);
      put('ironDark', cyl(0.1, 0.1, 4, 5, tx, h + 18, tz));
      const flag = new THREE.PlaneGeometry(2.4, 1.6);
      flag.translate(tx + 1.25, h + 19.3, tz);
      put('bannerRoyal', flag);
    }
  }
  {
    const r = 9.5, h = 46;
    put('stone', cyl(r, r * 1.06, h, 20, 0, h / 2, -D / 2 - 6));
    P.box(aabbOn(0, 0, -D / 2 - 6, r * 2, h, r * 2));
    put('stoneTrim', cyl(r + 0.9, r + 0.9, 0.8, 20, 0, h - 0.4, -D / 2 - 6));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      put('stone', boxOn(1.6, 1.6, 1.1, Math.sin(a) * (r + 0.3), h, -D / 2 - 6 + Math.cos(a) * (r + 0.3), a));
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      put('stainedLancet', boxOn(1.8, 5, 0.3, Math.sin(a) * r, h - 12, -D / 2 - 6 + Math.cos(a) * r, a));
    }
    const roof = spireRoof(r + 1.8, 24, 20);
    roof.translate(0, h + 1.6, -D / 2 - 6);
    put('roofBlue', roof);
    put('gold', lathe([[0.8, 0], [0.4, 1.2], [0.18, 2.8], [0, 3.8]], 10, 0, h + 25.4, -D / 2 - 6));
  }

  /* ---- 王座厅内景 ---- */
  {
    const IP = placer(C, cx, H, cz, 0);
    // 柱列
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const z = -18 + i * 7.4;
        const g = column(1.3, 12.5, 12);
        g.translate(s * 13, 0, z);
        IP.add('marble', g);
        IP.box(aabbOn(s * 13, 0, z, 2.9, 12.5, 2.9));
        // 柱间旗幔
        const ban = new THREE.PlaneGeometry(2.8, 8);
        ban.rotateY(-s * Math.PI / 2);
        ban.translate(s * (W / 2 - T - 0.3), 9, z);
        IP.add(i % 2 ? 'bannerRoyal' : 'bannerCrimson', ban);
      }
      IP.add('stoneTrim', boxOn(2.4, 1.1, D - 8, s * 13, 12.5, 0));
    }
    // 红毯(压在地面之上一点,避免与地板共面闪烁)
    IP.add('carpet', boxOn(6, 0.05, D - 10, 0, 0.005, 2));
    // 御座台
    const dais = stairs(4, 20, 0.34, 1.2, { x: 0, y: 0, z: -16, ry: Math.PI });
    for (const g of dais.geos) IP.add('marble', g);
    for (const b of dais.boxes) IP.box(b);
    IP.add('marble', boxOn(20, 1.36, 9, 0, 0, -23.5));
    IP.box(aabbOn(0, 0, -23.5, 20, 1.36, 9));
    // 王座
    const TP = IP.at(0, 1.36, -23.5);
    TP.add('gold', boxOn(2.6, 0.35, 2.2, 0, 0.62, 0));
    TP.add('gold', boxOn(2.9, 4.6, 0.4, 0, 0.62, -1.1));
    for (const s of [-1, 1]) TP.add('gold', boxOn(0.35, 1.5, 2.2, s * 1.3, 0.62, 0));
    for (const s of [-1, 1]) TP.add('gold', boxOn(0.4, 0.62, 0.4, s * 1.1, 0, 0.9));
    TP.add('clothRed', boxOn(2.3, 0.16, 1.9, 0, 0.98, 0.05));
    TP.add('gold', sphere(0.34, 10, 8, 0, 5.35, -1.1));
    TP.box(aabbOn(0, 0, -0.4, 3.2, 1.2, 2.6));
    // 御座后大旗
    const big = new THREE.PlaneGeometry(9, 12);
    big.translate(0, 8.4, -26.6);
    IP.add('bannerRoyal', big);
    // 火盆
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const bx = s * 8.5, bz = -12 + i * 11;
        IP.add('ironDark', lathe([[1.0, 0], [0.5, 0.7], [0.55, 1.6], [1.15, 2.0], [1.15, 2.2], [0, 2.2]], 10, bx, 0, bz));
        IP.add('emberGlow', cyl(0.9, 0.7, 0.42, 10, bx, 2.05, bz));
        IP.add('fireCore', cone(0.44, 0.95, 8, bx, 2.4, bz));
        IP.emit({ x: bx, y: 2.6, z: bz, color: 0xff9d45, intensity: 5.5, distance: 30, flicker: 1.5 });
      }
    }
    // 吊灯
    for (let i = 0; i < 3; i++) chandelier(IP.at(0, 0, 14 - i * 13), 10, 2.0, 8);
    // 长桌
    for (const s of [-1, 1]) {
      const tp = IP.at(s * 6.6, 0, 12);
      tp.add('plankDark', boxOn(2.2, 0.14, 7, 0, 0.86, 0));
      for (const q of [-1, 1]) tp.add('plankDark', boxOn(0.4, 0.86, 0.4, 0, 0, q * 3));
      tp.box(aabbOn(0, 0, 0, 2.2, 1.0, 7));
      for (let i = 0; i < 3; i++) bench(tp.at(1.6, 0, -2.4 + i * 2.4, Math.PI / 2), 1.8, 'plankDark');
    }
  }

  /* ---- 台地栏杆(南侧中间留出大台阶的入口) ---- */
  {
    const TP = placer(C, 0, H, 0, 0);
    const tcx = (t[0] + t[2]) / 2, tcz = (t[1] + t[3]) / 2;
    const tw = t[2] - t[0], td = t[3] - t[1];
    for (const g of balustrade(tw - 4, 1.2, { x: tcx, y: 0, z: t[1] + 1.2 })) TP.add('stoneTrim', g);
    for (const s of [-1, 1]) {
      for (const g of balustrade(td - 4, 1.2, { x: tcx + s * (tw / 2 - 1.2), y: 0, z: tcz, ry: Math.PI / 2 })) TP.add('stoneTrim', g);
      const side = (tw - 28) / 2;
      for (const g of balustrade(side, 1.2, { x: tcx + s * (28 / 2 + side / 2), y: 0, z: t[3] - 1.2 })) TP.add('stoneTrim', g);
    }
  }

  void rng;
  return { collector: C, boxes: C.boxes, name: '王座城堡' };
}
