// 英雄谷：峡谷两侧墙（带台阶护坡 + 盲拱廊）、盆地草地、谷口挡土墙、主桥（连拱 + 雕像平台）、
// 8 尊英雄像、盆地↔桥面石阶、城门楼（门塔 + 门洞拱 + 旗帜）、城门外入口广场与道路。
// 全部在谷局部帧里建：x = lx（横向，+ = 东北侧），z = lz（沿谷轴，0 = 谷口，180 = 城门）。
import * as THREE from 'three';
import { boxGeo, cylGeo, coneGeo } from '../../core/geom.js';
import {
  extrudeXY, profileAlongZ, archedProfile, archRingPts, archInfillPts, archPanelPts, pyramidGeo, bannerGeo, mat4,
} from './shapes.js';
import { parapet, railing, slopedRailing, stairRun } from './citywall.js';
import { heroGeometries } from './statues.js';

const DECK = -0.06; // 桥体结构顶面；铺装 0.06 厚，铺装顶 = 桥面 y=0
const HERO_ORDER = [5, 1, 2, 4, 3, 6, 0, 7]; // 国王 / 大法师 / 圣骑士 / 游侠 / 矮人 / 大主教 / 骑士 / 枪兵

export function buildValley(ctx, B, G) {
  const C = ctx.coords;
  const M = ctx.mat;
  const VL = C.VALLEY;
  const FLOOR = C.VALLEY_FLOOR_Y;
  const [ox, oz] = VL.origin;
  const F = B.frame(ox, 0, oz, VL.yaw);
  const FG = G.frame(ox, 0, oz, VL.yaw);
  const HW = VL.halfWidth; // 28：谷墙中心线
  const GZ = VL.gateZ; // 180
  const WALL_IN = HW - 4; // 24：谷墙内侧面
  const WALL_TOP = 10;
  const BW = VL.bridge.width / 2; // 8
  const Z0 = VL.bridge.from - 1; // 桥头搭上贸易区岸 1 m
  const GATE_IN = GZ - 4; // 176：城门墙内侧面
  const GATE_OUT = GZ + 12; // 192：门塔外侧面
  const pave = (x, z, w, d, y = 0) => FG.box(M.plaza, x, y - 0.06, z, w, 0.06, d);

  // ---------- 盆地草地 ----------
  const grass = new THREE.PlaneGeometry(WALL_IN * 2, GATE_IN - 2).rotateX(-Math.PI / 2);
  scaleUVPlane(grass, WALL_IN * 2, GATE_IN - 2);
  FG.add(M.grass, grass, mat4(0, FLOOR + 0.01, (GATE_IN + 2) / 2));
  // 盆地土路：两组石阶脚沿护坡各有一条
  for (const [lx, z0, z1] of [[-17, 27, 172], [17, 6, 147]]) {
    const path = new THREE.PlaneGeometry(3, z1 - z0).rotateX(-Math.PI / 2);
    scaleUVPlane(path, 3, z1 - z0);
    FG.add(M.dirt, path, mat4(lx, FLOOR + 0.03, (z0 + z1) / 2));
  }

  // ---------- 峡谷两侧墙（第 8 / 10 段）----------
  for (const s of [-1, 1]) {
    const W = F.sub(s * HW, 0, 0, -Math.PI / 2); // 子帧：x = lz，z = s·(向谷内的距离)
    const zi = (d) => s * d;
    const L = GZ;
    const xm = L / 2;
    W.box(M.stoneWhite, xm, FLOOR, 0, L, WALL_TOP - FLOOR, 8); // 墙芯
    W.box(M.stoneGrey, xm, -1, zi(-4.35), L, 1.8, 0.7); // 外侧勒脚（城外地面 y=0）
    W.box(M.stoneTrim, xm, 5, zi(-4.1), L, 0.3, 0.3, { collide: false }); // 外侧腰线
    W.box(M.stoneTrim, xm, WALL_TOP - 0.75, 0, L, 0.75, 9, { collide: false }); // 挑檐
    for (let x = 10; x < L - 8; x += 2.6) W.box(M.stoneTrim, x, WALL_TOP - 1.55, zi(-4.2), 0.55, 0.8, 0.4, { collide: false });
    parapet(W, M, 9, L - 7, zi(-3.7), WALL_TOP);
    parapet(W, M, 9, L - 7, zi(3.7), WALL_TOP);
    // 台阶护坡：A 层（-14 → -8，伸出 5 m）+ B 层（-8 → -1，伸出 2.5 m）
    const x0 = 2;
    const x1 = GATE_IN;
    const lenT = x1 - x0;
    W.box(M.stoneWhite, (x0 + x1) / 2, FLOOR, zi(6.5), lenT, 6, 5);
    W.box(M.stoneTrim, (x0 + x1) / 2, -8, zi(6.6), lenT, 0.3, 5.3, { collide: false });
    W.box(M.stoneWhite, (x0 + x1) / 2, -8, zi(5.25), lenT, 7, 2.5);
    W.box(M.stoneTrim, (x0 + x1) / 2, -1, zi(5.35), lenT, 0.3, 2.75, { collide: false });
    // A 层扶壁 + B 层小盲拱
    for (let x = x0 + 5.5; x < x1 - 2; x += 11) {
      W.box(M.stoneTrim, x, FLOOR, zi(9.25), 1.4, 5.6, 0.5);
      W.add(M.stoneGrey, extrudeXY(archPanelPts(3.2, 3.2, 1.6), 0.1), mat4(x + 5.5, -7.6, zi(6.52), s > 0 ? 0 : Math.PI));
    }
    // 主墙面盲拱廊：壁柱 + 拱券 + 深色拱心
    for (let x = x0; x <= x1 + 0.1; x += 11) {
      W.box(M.stoneTrim, x, -0.7, zi(4.2), 1.3, WALL_TOP - 0.75 + 0.7, 0.5);
      if (x + 11 > x1 + 0.1) break;
      const ry = s > 0 ? 0 : Math.PI;
      W.add(M.stoneGrey, extrudeXY(archPanelPts(7.4, 4.6, 3.3), 0.1), mat4(x + 5.5, -0.5, zi(4.02), ry));
      W.add(M.stoneTrim, extrudeXY(archRingPts(7.4, 4.6, 3.3, 0.55), 0.35), mat4(x + 5.5, -0.5, zi(4.12), ry));
    }
  }

  // ---------- 谷口挡土墙（顶面 y=0 的走道，连接主桥与谷口石阶）----------
  F.box(M.stoneWhite, 0, FLOOR, 0, WALL_IN * 2, DECK - FLOOR, 4);
  pave(0, 0, WALL_IN * 2, 4);
  F.box(M.stoneTrim, 0, DECK - 0.6, 0, WALL_IN * 2, 0.4, 4.6, { collide: false });
  for (const lx of [-11.5, 11.5]) F.add(M.stoneGrey, extrudeXY(archPanelPts(4.4, 6, 2.2), 0.1), mat4(lx, FLOOR + 1.5, 2.03));
  for (const [a, b] of [[-WALL_IN, -BW], [BW, WALL_IN]]) railing(F, M, a, -1.8, b, -1.8, 0, { open: true });
  for (const [a, b] of [[-WALL_IN, -19.2], [-14.8, -BW], [BW, WALL_IN]]) railing(F, M, a, 1.8, b, 1.8, 0, { open: true });

  // ---------- 主桥 ----------
  const PIERS = [30, 65, 100, 135, 160];
  const ops = [];
  let prev = 4;
  for (const p of PIERS) {
    ops.push([prev, p - 2]);
    prev = p + 2;
  }
  ops.push([prev, GATE_IN - 2]);
  F.add(M.stoneWhite, profileAlongZ(archedProfile(2, GATE_IN, FLOOR, -1.2, ops, -3.4, 7), BW * 2 - 1));
  F.add(M.stoneWhite, profileAlongZ(archedProfile(Z0, -2, C.CANAL_BED_Y, -1.2, [[Z0 + 2, -13], [-10, -3.5]], -1.9, 4), BW * 2 - 1));
  for (const p of [...PIERS, 3, GATE_IN - 1]) F.collider(0, FLOOR, p, BW * 2 - 1, -1.2 - FLOOR, p === 3 || p === GATE_IN - 1 ? 2 : 4);
  F.collider(0, C.CANAL_BED_Y, -11.5, BW * 2 - 1, C.CANAL_BED_Y * -1 - 1.2, 3);
  const zMid = (Z0 + GATE_IN) / 2;
  const zLen = GATE_IN - Z0;
  F.box(M.stoneWhite, 0, -1.2, zMid, BW * 2, DECK + 1.2, zLen);
  F.box(M.stoneTrim, 0, -1.35, zMid, BW * 2 + 0.6, 0.55, zLen, { collide: false }); // 桥面檐口
  pave(0, zMid, BW * 2 - 0.8, zLen);
  // 拱墩扶壁（雕像平台的支撑）与桥墩分水尖
  for (const p of PIERS) {
    const big = p !== 160;
    for (const s of [-1, 1]) {
      if (big) {
        F.box(M.stoneWhite, s * 11.2, FLOOR, p, 6.6, -2.4 - FLOOR, 4);
        F.box(M.stoneTrim, s * 11.4, -2.4, p, 7.4, 1.15, 5, { collide: false });
      } else F.box(M.stoneWhite, s * 8.2, FLOOR, p, 1.4, 11, 3);
    }
  }

  // ---------- 雕像平台 + 底座 + 英雄像 ----------
  const bases = [];
  // 底座深色石材：与白色雕像拉开对比（clone 共享贴图，只压暗颜色）
  const baseDark = M.stoneGrey.clone();
  baseDark.color = new THREE.Color(0.5, 0.5, 0.56);
  baseDark.name = 'walls:statueBaseDark';
  VL.statues.forEach((st, i) => {
    const s = Math.sign(st.lx);
    const px = s * 11.6;
    F.box(M.stoneWhite, px, -1.2, st.lz, 7.2, DECK + 1.2, 9);
    F.box(M.stoneTrim, s * 11.8, -1.35, st.lz, 7.6, 0.55, 9.6, { collide: false });
    pave(s * 11.5, st.lz, 6.6, 8.4);
    railing(F, M, s * 14.9, st.lz - 4.3, s * 14.9, st.lz + 4.3, 0, { open: true });
    for (const e of [-1, 1]) railing(F, M, s * 8.1, st.lz + e * 4.3, s * 14.9, st.lz + e * 4.3, 0, { post: 3.4, open: true });
    // 底座：勒脚（实例化，悬浮检测用）→ 收分线脚 → 座身 → 外挑线脚 → 顶板；铭牌嵌在线框里
    bases.push({ lx: st.lx, lz: st.lz });
    const frustum = (b0, b1, y, h) => F.add(baseDark, new THREE.CylinderGeometry((b1 / 2) * Math.SQRT2, (b0 / 2) * Math.SQRT2, h, 4, 1).rotateY(Math.PI / 4), mat4(st.lx, y + h / 2, st.lz));
    frustum(6.0, 5.1, 0.45, 0.32);
    F.box(baseDark, st.lx, 0.77, st.lz, 5.0, 1.68, 5.0, { collide: false });
    frustum(5.0, 5.7, 2.45, 0.3);
    F.box(baseDark, st.lx, 2.75, st.lz, 5.75, 0.25, 5.75, { collide: false });
    const fx = st.lx - s * 2.57;
    F.box(baseDark, fx, 2.0, st.lz, 0.14, 0.18, 3.4, { collide: false });
    F.box(baseDark, fx, 0.88, st.lz, 0.14, 0.18, 3.4, { collide: false });
    for (const e of [-1, 1]) F.box(baseDark, fx, 1.06, st.lz + e * 1.61, 0.14, 0.94, 0.18, { collide: false });
    F.box(M.gold, st.lx - s * 2.515, 1.06, st.lz, 0.03, 0.94, 3.04, { collide: false }); // 比线框低 0.1 m = 嵌入
    F.collider(st.lx, 0, st.lz, 6, 0.45, 6);
    F.collider(st.lx, 0, st.lz, 5, 3, 5);
    const S = F.sub(st.lx, 3, st.lz, s < 0 ? Math.PI / 2 : -Math.PI / 2); // 面朝桥心
    for (const g of heroGeometries(HERO_ORDER[i])) S.add(M.statue, g);
  });

  // 桥栏：在谷口走道、雕像平台、城门石阶平台处断开
  for (const s of [-1, 1]) {
    const gaps = [[-2, 2], ...VL.statues.filter((t) => Math.sign(t.lx) === s).map((t) => [t.lz - 4.5, t.lz + 4.5])];
    if (s > 0) gaps.push([GATE_IN - 4, GATE_IN]);
    gaps.sort((a, b) => a[0] - b[0]);
    let z = Z0 + 0.3;
    for (const [g0, g1] of gaps) {
      if (g0 > z) railing(F, M, s * (BW - 0.2), z, s * (BW - 0.2), g0, 0, { open: true });
      z = Math.max(z, g1);
    }
    if (z < GATE_IN) railing(F, M, s * (BW - 0.2), z, s * (BW - 0.2), GATE_IN, 0, { open: true });
  }

  // ---------- 盆地 ↔ 桥面石阶 ----------
  // 谷口：贴西南侧护坡，从 lz=27 的盆地上行到谷口走道（lz=2）
  {
    const S = F.sub(-17, 0, 27, Math.PI / 2); // 子帧 +x = -lz，+z = +lx
    stairRun(S, M, 0, 1, -2, 2, FLOOR, FLOOR, 50);
    for (const z of [-1.8, 1.8]) slopedRailing(S, M, 0, FLOOR, z, 25, 0, z, FLOOR);
  }
  // 城门：贴东北侧护坡，从 lz=147 上行到门内平台（lz 172–176）
  {
    const S = F.sub(17, 0, 147, -Math.PI / 2); // 子帧 +x = +lz
    stairRun(S, M, 0, 1, -2, 2, FLOOR, FLOOR, 50);
    for (const z of [-1.8, 1.8]) slopedRailing(S, M, 0, FLOOR, z, 25, 0, z, FLOOR);
    F.box(M.stoneWhite, 13.5, FLOOR, GATE_IN - 2, 11, DECK - FLOOR, 4);
    pave(13.5, GATE_IN - 2, 11, 4);
    railing(F, M, BW, GATE_IN - 3.8, 15, GATE_IN - 3.8, 0, { open: true });
    railing(F, M, 18.8, GATE_IN - 4, 18.8, GATE_IN, 0, { open: true });
  }

  // ---------- 城门楼（第 9 段）----------
  const GW = C.GATE.width / 2; // 6
  const GH = C.GATE.height; // 13
  // 门两侧墙身（到角楼）
  for (const s of [-1, 1]) F.box(M.stoneWhite, s * (GW + 11), FLOOR, GZ, 22, C.WALL.height - FLOOR, 8);
  // 门洞地面 + 门楼
  F.box(M.stoneWhite, 0, FLOOR, (GATE_IN + GATE_OUT) / 2, GW * 2, DECK - FLOOR, GATE_OUT - GATE_IN);
  pave(0, (GATE_IN + GATE_OUT) / 2, GW * 2, GATE_OUT - GATE_IN);
  F.box(M.stoneWhite, 0, GH, (GATE_IN + GATE_OUT) / 2, GW * 2, 24 - GH, GATE_OUT - GATE_IN);
  F.add(M.stoneWhite, extrudeXY(archInfillPts(GW * 2, 7.3, 5.5, GH), GATE_OUT - GATE_IN), mat4(0, 0, (GATE_IN + GATE_OUT) / 2));
  for (const z of [GATE_IN - 0.25, GATE_OUT + 0.25]) F.add(M.stoneTrim, extrudeXY(archRingPts(GW * 2, 7.3, 5.5, 1.1), 0.7), mat4(0, 0, z));
  for (let x = -4; x <= 4.01; x += 0.8) F.box(M.iron, x, 11.4, GATE_OUT - 1.2, 0.16, 1.6, 0.16, { collide: false }); // 收起的闸门齿
  F.box(M.iron, 0, 11.3, GATE_OUT - 1.2, 9, 0.2, 0.2, { collide: false });
  F.box(M.stoneTrim, 0, 21.6, (GATE_IN + GATE_OUT) / 2, GW * 2, 1.0, GATE_OUT - GATE_IN + 1.2, { collide: false });
  parapet(F, M, -GW, GW, GATE_IN + 0.3, 24);
  parapet(F, M, -GW, GW, GATE_OUT - 0.3, 24);
  // 门楣纹章
  const crest = new THREE.PlaneGeometry(4.4, 4.4);
  F.add(M.banner, crest, mat4(0, 17.6, GATE_OUT + 0.62));
  for (const [x, y, w, h] of [[0, 19.85, 4.9, 0.25], [0, 15.1, 4.9, 0.25], [-2.35, 15.35, 0.25, 4.5], [2.35, 15.35, 0.25, 4.5]]) {
    F.box(M.gold, x, y, GATE_OUT + 0.6, w, h, 0.15, { collide: false });
  }

  // 门塔
  for (const s of [-1, 1]) {
    const cx = s * (GW + 6);
    const cz = (GATE_IN + GATE_OUT) / 2;
    const tw = 12;
    const td = GATE_OUT - GATE_IN;
    F.box(M.stoneWhite, cx, FLOOR, cz, tw, 30 - FLOOR, td);
    F.box(M.stoneGrey, cx, -1, (GZ + GATE_OUT + 0.5) / 2, tw + 1, 1.8, GATE_OUT + 0.5 - GZ); // 勒脚只在城外一侧
    for (const y of [13, 21]) F.box(M.stoneTrim, cx, y, cz, tw + 0.4, 0.35, td + 0.4, { collide: false });
    F.box(M.stoneTrim, cx, 26.8, cz, tw + 0.7, 1.2, td + 0.7, { collide: false });
    F.box(M.stoneTrim, cx, 28, cz, tw + 1.3, 2, td + 1.3, { collide: false });
    for (const zc of [GATE_IN, GATE_OUT]) F.box(M.stoneTrim, s * (GW + 12), zc === GATE_IN ? FLOOR : -1, zc, 1.5, zc === GATE_IN ? 27 - FLOOR : 28, 1.5);
    F.add(M.roofBlue, pyramidGeo(tw + 1.9, td + 1.9, 16), mat4(cx, 30, cz));
    F.box(M.roofBlue, cx, 29.96, cz, tw + 1.9, 0.04, td + 1.9, { collide: false });
    F.add(M.gold, new THREE.SphereGeometry(0.7, 12, 8), mat4(cx, 46.2, cz));
    F.add(M.gold, coneGeo(0.28, 3.2, 8), mat4(cx, 46.6, cz));
    // 角上的小望楼
    for (const zc of [GATE_IN - 0.3, GATE_OUT + 0.3]) {
      const bx = s * (GW + 12.3);
      F.add(M.stoneTrim, cylGeo(0.3, 2.2, 14, 1.5), mat4(bx, 18, zc));
      F.add(M.stoneWhite, cylGeo(1.5, 8.6, 14), mat4(bx, 20.2, zc));
      F.add(M.stoneTrim, cylGeo(1.75, 0.4, 14), mat4(bx, 28.8, zc));
      F.add(M.roofBlue, coneGeo(2.0, 4.6, 14), mat4(bx, 29.2, zc));
      F.add(M.gold, coneGeo(0.12, 1.4, 6), mat4(bx, 33.6, zc));
      F.box(M.iron, bx + s * 1.45, 23.5, zc, 0.3, 1.6, 0.5, { collide: false });
    }
    // 窗
    for (const y of [5, 14.6, 22.4]) {
      for (const [wx, wz, ry] of [[cx, GATE_OUT + 0.06, 0], [cx, GATE_IN - 0.06, 0], [s * (GW + 12.06), cz, Math.PI / 2]]) {
        if (ry === 0 && y > 6) continue; // 正面上部被旗帜挡住
        F.box(M.iron, wx, y, wz, 1.2, 2.6, 0.2, { ry, collide: false });
        F.box(M.stoneTrim, wx, y - 0.25, wz, 1.7, 0.25, 0.35, { ry, collide: false });
      }
    }
    // 旗帜（外侧 + 内侧）
    for (const [zc, ry] of [[GATE_OUT + 0.3, 0], [GATE_IN - 0.3, Math.PI]]) {
      F.add(M.banner, bannerGeo(5, 11.5), mat4(cx, 26.2, zc, ry));
      const rod = new THREE.CylinderGeometry(0.14, 0.14, 6.2, 8).rotateZ(Math.PI / 2);
      F.add(M.gold, rod, mat4(cx, 26.3, zc));
      for (const e of [-1, 1]) F.add(M.gold, new THREE.SphereGeometry(0.28, 8, 6), mat4(cx + e * 3.15, 26.3, zc));
    }
  }

  // ---------- 城门外入口前庭：半椭圆石铺 + 沉降一圈的边石 + 散落石板，收进草地 ----------
  // 土路由地形模块在地面着色里画（coords.roadDistance），这里不再重复铺路，只把中轴石板收窄到路宽。
  const PZ0 = GATE_OUT;
  const flat = (pts, top, d = 0.6) => extrudeXY(pts, d).rotateX(Math.PI / 2).translate(0, top - d / 2, 0);
  const halfEllipse = (rx, rz, n = 28) => {
    const pts = [[-rx, PZ0]];
    for (let i = 1; i < n; i++) {
      const a = Math.PI - (i / n) * Math.PI;
      pts.push([rx * Math.cos(a), PZ0 + rz * Math.sin(a)]);
    }
    pts.push([rx, PZ0]);
    return pts;
  };
  const AX = 22.5;
  const AZ = 24;
  FG.add(M.stoneGrey, flat(halfEllipse(AX + 1.6, AZ + 1.8), 0.05));
  FG.add(M.cobble, flat(halfEllipse(AX, AZ), 0.12));
  const RH = C.ROAD ? C.ROAD.halfWidth : 3.6;
  FG.add(M.plaza, flat([[-BW, PZ0], [BW, PZ0], [RH, PZ0 + AZ + 1.2], [-RH, PZ0 + AZ + 1.2]], 0.15));
  // 前庭碰撞：按行切成薄板（顶面 0.12，人走上去不下陷）
  for (let z = PZ0; z < PZ0 + AZ - 1; z += 2) {
    const t = (z + 1 - PZ0) / AZ;
    F.collider(0, -0.4, z + 1, 2 * AX * Math.sqrt(Math.max(0, 1 - t * t)), 0.52, 2);
  }
  // 边缘散落的石板：打碎硬边，让石铺"长"进草地
  const rng = ctx.rng('walls:apron');
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI;
    const k = 1.08 + rng() * 0.28;
    const lx = Math.cos(a) * AX * k;
    const lz = PZ0 + Math.sin(a) * AZ * k;
    if (Math.abs(lx) < RH + 1.5 && lz > PZ0 + AZ - 2) continue; // 路口留给地形的土路
    if (lz < PZ0 + 1.5) continue;
    const w = 0.7 + rng() * 1.1;
    const d = 0.6 + rng() * 0.9;
    F.box(rng() < 0.5 ? M.stoneGrey : M.cobble, lx, -0.2, lz, w, 0.24 + rng() * 0.03, d, { ry: rng() * Math.PI, collide: false });
  }
  const lamps = [];
  for (const lz of [PZ0 + 6, PZ0 + 16]) {
    for (const s of [-1, 1]) {
      lamps.push({ lx: s * 11, lz });
      F.collider(s * 11, 0.12, lz, 1.4, 1.05, 1.4);
    }
  }

  // ---------- 实例化的贴地物件（悬浮检测）----------
  const inst = (geo, mat, list, y, name) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), VL.yaw);
    list.forEach((p, i) => {
      const [wx, wz] = C.valleyToWorld(p.lx, p.lz);
      im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(wx, y, wz), q, new THREE.Vector3(1, 1, 1)));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.userData.grounded = true;
    im.name = name;
    ctx.scene.add(im);
    return im;
  };
  inst(boxGeo(6, 0.45, 6).translate(0, 0.225, 0), baseDark, bases, 0, 'walls:statue-bases');
  inst(boxGeo(1.4, 1.0, 1.4).translate(0, 0.5, 0), M.stoneTrim, lamps, 0.12, 'walls:lamp-bases');

  return { lamps: lamps.map((p) => C.valleyToWorld(p.lx, p.lz)) };
}

function scaleUVPlane(g, w, d) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  return g;
}
