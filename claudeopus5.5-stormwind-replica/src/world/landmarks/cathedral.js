// 光明大教堂：哥特式巴西利卡。局部坐标以 LANDMARKS.cathedral.center 为原点，+z = 南（南立面外皮 z=+33）。
// 结构（局部 z 由南向北）：门前台阶 36→33 ｜ 双塔 + 门廊 33→24 ｜ 中殿 + 侧廊 24→-7（5 跨，跨距 6.2）
// ｜ 耳堂（总宽 46）-7→-21，十字交叉上方中央尖塔 ｜ 唱诗席 -21→-26 ｜ 半圆后殿（祭坛）。
// 墙体全部是带真实洞口的 archWall：门洞 / 拱廊洞口与碰撞同源，窗洞装彩窗（stained）。
import * as THREE from 'three';
import { cylGeo, coneGeo, boxGeo } from '../../core/geom.js';
import { archWall, archBandGeo, archPaneGeo, triGeo, ringWall, carpetGeo, gableRoof, trs, finishInto } from './kit.js';

const FL = 0.9; // 室内地坪（三级台阶）
const S = 33; // 南立面外皮
const BAYS = [20.9, 14.7, 8.5, 2.3, -3.9]; // 中殿五跨中心
const PIERS = [17.8, 11.6, 5.4, -0.8]; // 拱廊墩柱
const NAVE_ROOF_Y = 22;
const RIDGE = 12;
const ROSE_Y = 17.3; // 玫瑰窗圆心高

export function buildCathedral(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const L = C.LANDMARKS.cathedral;
  const [cx, cz] = L.center;

  const B = shared.B; // 外观几何并入模块级合批 Builder（index.js 统一 finish）
  const F = B.frame(cx, 0, cz, 0);
  // 彩窗两层：室内 stained（双面），室外 stainedOutside（白天偏暗带反射，夜里透光）
  const glass = { glass: shared.glassIn || M.stained, glassOut: M.stainedOutside || M.stained };

  // ---------- 地坪与门前台阶 ----------
  // 地坪：碰撞在这里登记（常驻）；可见的地面在室内 LOD 组里（暗色石板）
  F.collider(0, -0.3, 13, 30, FL + 0.3, 40); // 门廊 + 中殿 + 侧廊
  F.collider(0, -0.3, -14, 46, FL + 0.3, 14); // 耳堂
  F.collider(0, 0, -23.5, 16.4, FL, 5); // 唱诗席
  F.collider(0, 0, -29.5, 11.6, FL, 7); // 后殿地坪（半圆的盒子近似）
  F.collider(0, 0, -32, 6, FL, 3);
  for (let i = 0; i < 3; i++) F.box(M.stoneTrim, 0, 0, S + 2.5 - i, 30 - i * 0.6, 0.3 * (i + 1), 1);

  // ---------- 南立面：门洞 + 玫瑰窗 + 山墙 ----------
  archWall(F, M.stoneWhite, 0, 0, S - 0.6, 0, 13, NAVE_ROOF_Y, 1.2, [
    { x: 0, y0: 0, w: 5, spring: 6.5 + FL, kind: 'pointed' },
    { x: 0, y0: ROSE_Y, r: 3.2, kind: 'circle' },
  ], glass);
  // 层层退进的尖拱门洞：三圈拱券由内向外逐圈加宽、逐圈外凸，门洞总进深 1.2 + 1.5 m
  const SPR = 6.5 + FL;
  for (let k = 0; k < 3; k++) {
    const wi = 5.0 + 0.6 * k;
    const dep = 0.5 * (k + 1);
    F.add(k % 2 ? M.stoneWhite : M.stoneTrim, archBandGeo(wi + 0.6, wi, SPR, 'pointed', dep), trs(0, 0, S));
    for (const s of [-1, 1]) {
      F.collider(s * (wi / 2 + 0.3), 0, S + dep / 2, 0.6, SPR, dep);
      // 门侧细束柱 + 金柱头
      F.add(M.stoneWhite, cylGeo(0.17, SPR - FL, 8), trs(s * (wi / 2 + 0.3), FL, S + dep - 0.22));
      F.add(M.gold, cylGeo(0.26, 0.28, 8), trs(s * (wi / 2 + 0.3), SPR - 0.28, S + dep - 0.22));
    }
  }
  F.add(M.gold, archBandGeo(6.9, 6.75, SPR, 'pointed', 1.56), trs(0, 0, S));
  F.add(M.gold, coneGeo(0.25, 1.4, 6), trs(0, SPR + 0.866 * 6.8 + 0.2, S + 1.2));
  // 立面扶壁：三级退台 + 尖顶（夹住门廊两侧）
  for (const s of [-1, 1]) {
    const x = s * 5.0;
    F.box(M.stoneWhite, x, 0, S + 0.8, 1.0, 9, 1.6);
    F.box(M.stoneWhite, x, 9, S + 0.55, 0.9, 6, 1.1, { collide: false });
    F.box(M.stoneWhite, x, 15, S + 0.3, 0.8, 5, 0.6, { collide: false });
    for (const [y, z] of [[9, S + 1.6], [15, S + 1.1]]) F.box(M.stoneTrim, x, y - 0.25, z, 1.1, 0.25, 0.25, { collide: false });
    F.add(M.stoneTrim, coneGeo(0.5, 3.2, 4).rotateY(Math.PI / 4), trs(x, 20, S + 0.3));
    F.add(M.gold, new THREE.SphereGeometry(0.16, 6, 4), trs(x, 23.3, S + 0.3));
  }
  // 门扇：向内推开贴着门洞两侧
  for (const s of [-1, 1]) F.box(M.planks, s * 2.42, FL, S - 2.6, 0.16, 6.2, 2.4);
  // 玫瑰窗花格
  F.add(M.stoneTrim, new THREE.TorusGeometry(3.25, 0.26, 6, 32), trs(0, ROSE_Y, S - 0.05));
  F.add(M.gold, new THREE.TorusGeometry(3.6, 0.12, 5, 32), trs(0, ROSE_Y, S + 0.05));
  F.add(M.stoneTrim, new THREE.TorusGeometry(1.0, 0.16, 5, 16), trs(0, ROSE_Y, S - 0.6));
  for (let i = 0; i < 6; i++) F.box(M.stoneTrim, 0, ROSE_Y - 0.1, S - 0.6, 6.4, 0.2, 0.25, { rz: (i * Math.PI) / 6, collide: false });
  F.box(M.stoneTrim, 0, NAVE_ROOF_Y - 0.3, S - 0.6, 14, 0.7, 1.8, { collide: false }); // 立面檐口
  // 山墙比屋面轮廓略大一圈，在屋顶上露出压顶
  F.add(M.stoneWhite, triGeo(18, RIDGE + 1.2, 1.2), trs(0, NAVE_ROOF_Y, S - 0.6));
  // 山墙上的小圆窗 + 金色圣光徽
  F.add(M.stainedOutside || M.stained, discGeoXY(1.1), trs(0, NAVE_ROOF_Y + 5, S + 0.02));
  F.add(M.gold, new THREE.TorusGeometry(1.2, 0.12, 5, 20), trs(0, NAVE_ROOF_Y + 5, S + 0.05));
  sunFinial(F, M, 0, NAVE_ROOF_Y + RIDGE + 1.3, S - 0.6, 1.4);

  // ---------- 双塔（约 52 m） ----------
  for (const s of [-1, 1]) tower(F, M, s * 11, S - 4.5);

  // ---------- 侧廊外墙（高侧窗下层彩窗）+ 扶壁 + 飞扶壁 ----------
  for (const s of [-1, 1]) {
    archWall(F, M.stoneWhite, s * 14.4, 0, 8.5, Math.PI / 2, 31, 11, 1.2,
      BAYS.map((z) => ({ x: 8.5 - z, y0: 3.6, w: 2.4, spring: 7.2, kind: 'pointed' })), { ...glass, outside: s });
    F.box(M.stoneTrim, s * 14.5, 11, 8.5, 1.8, 0.5, 31.6, { collide: false });
    // 侧廊单坡屋顶：从高侧墙脚 (8.2, 14.6) 斜落到外墙 (15.6, 11)
    F.box(M.roofBlue, s * 11.9, 12.65, 8.5, 8.4, 0.3, 32, { rz: s * -0.4528, collide: false });
    for (const z of PIERS) {
      F.box(M.stoneWhite, s * 16.2, 0, z, 2.4, 9.5, 1.5);
      F.box(M.stoneWhite, s * 15.8, 9.5, z, 1.6, 3.5, 1.3, { collide: false });
      F.add(M.stoneTrim, coneGeo(0.62, 3.6, 4).rotateY(Math.PI / 4), trs(s * 15.8, 13, z));
      F.add(M.gold, new THREE.SphereGeometry(0.22, 6, 4), trs(s * 15.8, 16.7, z));
      // 飞扶壁：扶壁顶 (16, 12.5) → 高侧墙 (8.2, 19)
      F.box(M.stoneWhite, s * 12.1, 15.35, z, 10.2, 0.8, 0.9, { rz: -s * 0.6947, collide: false });
    }
  }

  // ---------- 中殿拱廊（每跨一片尖拱墙）+ 高侧窗墙 ----------
  for (const s of [-1, 1]) {
    for (const z of BAYS) {
      archWall(F, M.stoneWhite, s * 7.6, 0, z, Math.PI / 2, 6.2, 11, 1.2, [{ x: 0, y0: 0, w: 4.6, spring: 6 + FL, kind: 'pointed' }]);
    }
    archWall(F, M.stoneWhite, s * 7.6, 11, 8.5, Math.PI / 2, 31, NAVE_ROOF_Y - 11, 1.2,
      BAYS.map((z) => ({ x: 8.5 - z, y0: 1.8, w: 2.2, spring: 6.4, kind: 'pointed' })), { ...glass, outside: s, collide: false });
    F.box(M.stoneTrim, s * 7.6, NAVE_ROOF_Y - 0.2, 13, 2.0, 0.6, 40.4, { collide: false });
    for (const z of [24, ...PIERS, -7]) {
      F.add(M.stoneTrim, coneGeo(0.5, 3, 4).rotateY(Math.PI / 4), trs(s * 8.4, NAVE_ROOF_Y + 0.4, z));
      F.add(M.gold, new THREE.SphereGeometry(0.18, 6, 4), trs(s * 8.4, NAVE_ROOF_Y + 3.4, z));
    }
    // 侧廊顶棚（室内天花，同时作为"室内"判定的顶）
    F.box(M.stoneTrim, s * 11, 11, 8.5, 5.6, 0.4, 31);
  }

  // ---------- 耳堂 ----------
  for (const s of [-1, 1]) {
    archWall(F, M.stoneWhite, s * 19, 0, -7.6, 0, 8, NAVE_ROOF_Y, 1.2, [{ x: 0, y0: 5, w: 2.6, spring: 11, kind: 'pointed' }], glass);
    F.box(M.stoneWhite, s * 11.6, 11, -7.6, 6.8, NAVE_ROOF_Y - 11, 1.2, { collide: false });
    archWall(F, M.stoneWhite, s * 15.6, 0, -20.4, 0, 14.8, NAVE_ROOF_Y, 1.2, [{ x: 0, y0: 5, w: 2.6, spring: 11, kind: 'pointed' }], { ...glass, outside: -1 });
    archWall(F, M.stoneWhite, s * 22.4, 0, -14, Math.PI / 2, 14, NAVE_ROOF_Y, 1.2, [
      { x: 0, y0: 4, w: 4.4, spring: 12.5, kind: 'pointed' },
      { x: 0, y0: 19.4, r: 1.5, kind: 'circle' },
    ], { ...glass, outside: s });
    F.add(M.stoneWhite, triGeo(14.6, RIDGE, 1.2), trs(s * 22.4, NAVE_ROOF_Y, -14, 0, Math.PI / 2));
    F.box(M.stoneTrim, s * 22.4, NAVE_ROOF_Y - 0.3, -14, 1.8, 0.6, 15.2, { collide: false });
    sunFinial(F, M, s * 22.4, NAVE_ROOF_Y + RIDGE + 0.2, -14, 1.0, Math.PI / 2);
    // 耳堂转角扶壁
    for (const z of [-7, -21]) {
      F.box(M.stoneWhite, s * 23.6, 0, z, 2.6, 16, 2.6);
      F.add(M.stoneTrim, coneGeo(1.0, 6, 4).rotateY(Math.PI / 4), trs(s * 23.6, 16, z));
      F.add(M.gold, new THREE.SphereGeometry(0.28, 6, 4), trs(s * 23.6, 22.1, z));
    }
  }
  // 十字交叉的四根大墩柱
  for (const s of [-1, 1]) for (const z of [-7, -21]) F.box(M.stoneTrim, s * 7.6, 0, z, 2.4, NAVE_ROOF_Y, 2.4);

  // ---------- 唱诗席 + 半圆后殿 ----------
  for (const s of [-1, 1]) F.box(M.stoneWhite, s * 7.6, 0, -23.5, 1.2, NAVE_ROOF_Y, 5);
  ringWall(F, M.stoneWhite, 0, 0, -26, 7.6, 1.2, NAVE_ROOF_Y, 7, { a0: Math.PI / 2, a1: Math.PI * 1.5 });
  {
    const d = Math.PI / 7;
    for (let i = 0; i < 7; i++) {
      const t = Math.PI / 2 + (i + 0.5) * d;
      for (const [r, ry, m] of [[7.0 - 0.04, t + Math.PI, shared.glassIn || M.stained], [8.2 + 0.04, t, M.stainedOutside || M.stained]]) {
        F.add(m, archPaneGeo(1.5, 6, 13, 'pointed'), trs(r * Math.sin(t), 0, -26 + r * Math.cos(t), 0, ry));
      }
      if (i > 0) {
        const tj = Math.PI / 2 + i * d;
        F.box(M.stoneWhite, 9.4 * Math.sin(tj), 0, -26 + 9.4 * Math.cos(tj), 1.1, 15, 2.6, { ry: tj });
        F.add(M.stoneTrim, coneGeo(0.6, 4, 4).rotateY(Math.PI / 4), trs(9.6 * Math.sin(tj), 15, -26 + 9.6 * Math.cos(tj)));
      }
    }
  }
  F.box(M.stoneTrim, 0, NAVE_ROOF_Y - 0.3, -23.5, 17, 0.6, 5, { collide: false });

  // ---------- 屋顶（陡坡钴蓝瓦）----------
  const roof = (w, d, ry, x, z) => {
    for (const g of gableRoof(w, d, RIDGE, 0.7, 0.35)) F.add(M.roofBlue, g, trs(x, NAVE_ROOF_Y, z, 0, ry));
  };
  // 屋顶在十字交叉处断开（交叉处上方由 29.5 m 起的中央塔身封顶），否则坡屋面会压进相贯的肋拱顶；
  // 耳堂屋面与中殿同宽 16.4，保证拱脚附近屋面仍高于拱面
  roof(36.8, 16.4, Math.PI / 2, 0, 13.3); // 中殿：南山墙 → 塔身南面（z = -5.8）
  for (const s of [-1, 1]) roof(14.0, 16.4, 0, s * 15.9, -14); // 耳堂两臂：塔身侧面（x = ±8.2）→ 端山墙
  roof(3.0, 16.4, Math.PI / 2, 0, -24.4); // 唱诗席：塔身北面（z = -22.2）→ 后殿
  {
    const g = new THREE.ConeGeometry(8.9, RIDGE, 8, 1, true, Math.PI / 2, Math.PI);
    g.translate(0, RIDGE / 2, 0);
    F.add(M.roofBlue, g, trs(0, NAVE_ROOF_Y, -26));
  }
  F.box(M.gold, 0, NAVE_ROOF_Y + RIDGE - 0.1, 13, 0.35, 0.55, 40, { collide: false }); // 屋脊金饰
  F.box(M.gold, 0, NAVE_ROOF_Y + RIDGE - 0.1, -14, 46, 0.55, 0.35, { collide: false });

  // ---------- 十字交叉中央尖塔（顶高 96 m ≈ 周围民居屋脊的 6–7 倍、本体屋脊的近 3 倍）----------
  {
    const y0 = NAVE_ROOF_Y;
    const top = 54;
    const SPIRE = 84; // 收细降低，避免在正面视角与钟楼尖顶叠成一团
    // 塔身从拱顶之上（29.5）起，屋顶以下部分被屋面遮住，室内只看到十字拱
    F.box(M.stoneWhite, 0, 29.5, -14, 16.4, top - 29.5, 16.4, { collide: false });
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const f = F.sub(0, 0, -14, ry);
      for (const x of [-3.2, 3.2]) {
        f.add(M.stainedOutside || M.stained, archPaneGeo(2, 35.5, 40.5, 'pointed'), trs(x, 0, 8.22));
        f.add(M.stainedOutside || M.stained, archPaneGeo(2, 45, 50, 'pointed'), trs(x, 0, 8.22));
      }
      f.box(M.stoneTrim, 0, 43.4, 8.3, 16.8, 0.5, 0.4, { collide: false });
    }
    F.box(M.stoneTrim, 0, top, -14, 17.6, 0.9, 17.6, { collide: false });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      F.box(M.stoneWhite, sx * 8.4, y0, -14 + sz * 8.4, 1.8, top - y0 + 1.5, 1.8, { collide: false });
      F.add(M.roofBlue, coneGeo(1.1, 7, 4).rotateY(Math.PI / 4), trs(sx * 8.4, top + 1.5, -14 + sz * 8.4));
      F.add(M.gold, new THREE.SphereGeometry(0.3, 6, 4), trs(sx * 8.4, top + 8.6, -14 + sz * 8.4));
    }
    F.add(M.roofBlue, coneGeo(5.8, SPIRE - top - 0.9, 8).rotateY(Math.PI / 8), trs(0, top + 0.9, -14));
    for (const y of [64]) {
      const r = 5.8 * (1 - (y - top - 0.9) / (SPIRE - top - 0.9)) + 0.05;
      F.add(M.gold, new THREE.CylinderGeometry(r, r + 0.08, 0.35, 8).rotateY(Math.PI / 8), trs(0, y, -14));
    }
    F.add(M.gold, new THREE.SphereGeometry(0.8, 8, 6), trs(0, SPIRE + 0.3, -14));
    F.add(M.gold, coneGeo(0.22, 5, 6), trs(0, SPIRE + 0.8, -14));
  }

  // 室内判定用的顶（看不见的碰撞层，高于可达高度）
  F.collider(0, NAVE_ROOF_Y, 13, 30, 0.4, 40);
  F.collider(0, NAVE_ROOF_Y, -14, 46, 0.4, 14);
  F.collider(0, NAVE_ROOF_Y, -27, 16.4, 0.4, 13);


  const upd = buildNaveInterior(ctx, cx, cz);
  ctx.hollowCount += 1;
  return upd;
}

// 双塔之一：三段塔身逐层收分（9 → 8.2 → 7.4）+ 钟楼（尖拱外框百叶）+ 八角蓝锥尖顶
const STAGES = [[0, 12, 9.0], [12, 22, 8.2], [22, 30, 7.4]]; // [y0, y1, 边长]
function tower(F, M, tx, tz) {
  const glassOut = M.stainedOutside || M.stained;
  for (const [y0, y1, w] of STAGES) {
    F.box(M.stoneWhite, tx, y0, tz, w, y1 - y0, w, { collide: y0 === 0 });
    F.box(M.stoneTrim, tx, y1 - 0.15, tz, w + 0.5, 0.5, w + 0.5, { collide: false }); // 层间腰线
    // 斜面过渡（下一段收进的那一圈）
  }
  // 转角扶壁：两级退台，顶上小尖塔
  for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    F.box(M.stoneWhite, tx + bx * 4.3, 0, tz + bz * 4.3, 1.7, 14, 1.7);
    F.box(M.stoneWhite, tx + bx * 3.95, 14, tz + bz * 3.95, 1.4, 10, 1.4, { collide: false });
    F.box(M.stoneWhite, tx + bx * 3.55, 24, tz + bz * 3.55, 1.1, 6.6, 1.1, { collide: false });
    F.add(M.stoneTrim, coneGeo(0.55, 2.8, 4).rotateY(Math.PI / 4), trs(tx + bx * 3.55, 30.6, tz + bz * 3.55));
  }
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const f = F.sub(tx, 0, tz, ry);
    for (const x of [-1.3, 1.3]) {
      f.add(glassOut, archPaneGeo(1.5, 14, 18.2, 'pointed'), trs(x, 0, 4.12));
      f.add(M.stoneTrim, archBandGeo(1.9, 1.5, 18.2 - 14, 'pointed', 0.18).translate(0, 14, 0), trs(x, 0, 4.1));
      f.add(glassOut, archPaneGeo(1.4, 23.5, 26.8, 'pointed'), trs(x, 0, 3.72));
      f.add(M.stoneTrim, archBandGeo(1.8, 1.4, 26.8 - 23.5, 'pointed', 0.18).translate(0, 23.5, 0), trs(x, 0, 3.7));
      // 钟楼开口：暗色百叶 + 尖拱外框 + 拱顶滴水线
      f.add(M.iron, archPaneGeo(1.3, 31.6, 34.2, 'pointed'), trs(x, 0, 3.32));
      f.add(M.stoneTrim, archBandGeo(1.85, 1.3, 34.2 - 31.6, 'pointed', 0.3).translate(0, 31.6, 0), trs(x, 0, 3.3));
      f.box(M.stoneTrim, x, 31.3, 3.45, 1.9, 0.3, 0.3, { collide: false });
    }
  }
  F.box(M.stoneTrim, tx, 30, tz, 8.2, 0.8, 8.2, { collide: false });
  F.box(M.stoneWhite, tx, 30.8, tz, 6.6, 6, 6.6, { collide: false });
  F.box(M.gold, tx, 36.8, tz, 7.2, 0.35, 7.2, { collide: false });
  F.add(M.roofBlue, coneGeo(3.9, 22, 8).rotateY(Math.PI / 8), trs(tx, 37.15, tz));
  for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    F.add(M.roofBlue, coneGeo(0.6, 4.2, 4).rotateY(Math.PI / 4), trs(tx + bx * 3.1, 37.15, tz + bz * 3.1));
    F.add(M.gold, new THREE.SphereGeometry(0.18, 6, 4), trs(tx + bx * 3.1, 41.4, tz + bz * 3.1));
  }
  F.add(M.gold, new THREE.SphereGeometry(0.5, 8, 6), trs(tx, 59.3, tz));
  F.add(M.gold, coneGeo(0.15, 3, 6), trs(tx, 59.7, tz));
}

// 圣光徽（山墙顶）：金色光环 + 放射线
function sunFinial(F, M, x, y, z, r, ry = 0) {
  const f = F.sub(x, y, z, ry);
  f.add(M.gold, new THREE.TorusGeometry(r, 0.13, 5, 18), trs(0, r + 0.4, 0));
  for (let i = 0; i < 8; i++) f.box(M.gold, 0, r + 0.4 - 0.06, 0, r * 2.8, 0.12, 0.12, { rz: (i * Math.PI) / 8, collide: false });
  f.add(M.gold, new THREE.SphereGeometry(r * 0.35, 8, 6), trs(0, r + 0.4, 0));
}

function cylFloor(r, h) {
  const g = new THREE.CylinderGeometry(r, r, h, 12, 1, false, Math.PI / 2, Math.PI);
  g.translate(0, h / 2, 0);
  // 顶面 UV 改成米（平面投影）
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}

function discGeoXY(r) {
  const g = new THREE.CircleGeometry(r, 18);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
  return g;
}

// ---------- 室内（距离 LOD）：柱身、拱顶、长椅、红地毯、祭坛、吊灯 ----------
function buildNaveInterior(ctx, cx, cz) {
  const { mat: M } = ctx;
  const gi = new THREE.Group();
  gi.name = '光明大教堂·室内';
  ctx.scene.add(gi);
  const B = ctx.builder({ parent: gi, tag: 'cathedral-interior', chunk: 1000 });
  const F = B.frame(cx, 0, cz, 0);
  // 室内材质：比外墙暗 25–40%（白天顶光 + 补光会把室内冲平，压暗后彩窗和祭坛灯才有层次）
  const web = M.stoneTrim.clone();
  web.color.multiplyScalar(0.46); // 拱顶压暗，让视线落到彩窗和祭坛
  web.side = THREE.DoubleSide;
  web.name = 'lmNaveWeb';
  const rib = M.stoneWhite.clone();
  rib.color.multiplyScalar(0.85);
  rib.name = 'lmNaveRib';
  const col = M.stoneWhite.clone();
  col.color.multiplyScalar(0.72);
  col.name = 'lmNaveStone';
  const floor = M.plaza.clone();
  floor.color.multiplyScalar(0.6);
  floor.name = 'lmNaveFloor';
  const mats = { web, rib };
  M_GOLD.m = M.gold;
  // 室内地坪（碰撞在外观里登记）
  F.box(floor, 0, FL - 0.05, 13, 29, 0.06, 40, { collide: false });
  F.box(floor, 0, FL - 0.05, -14, 44.8, 0.06, 11.6, { collide: false });
  F.box(floor, 0, FL - 0.05, -23.5, 14, 0.06, 5, { collide: false });
  F.add(floor, cylFloor(7.0, 0.06), trs(0, FL - 0.05, -26));

  // 拱廊柱：圆柱 + 柱础 + 金色柱头，上方细束柱一直升到拱顶
  for (const s of [-1, 1]) {
    for (const z of PIERS) {
      F.add(M.stoneTrim, BASE_GEO, trs(s * 7.6, FL, z));
      F.add(col, cylGeo(0.74, 6 + FL - 0.95 - (FL + 0.62), 20), trs(s * 7.6, FL + 0.62, z));
      F.add(rib, CAP_GEO, trs(s * 7.6, 6 + FL - 0.95, z));
      F.add(M.gold, cylGeo(0.79, 0.08, 20), trs(s * 7.6, 6 + FL - 0.9, z)); // 柱颈细金环
      // 束柱：从柱头顶面一直升到拱脚，不再悬空截断
      F.add(rib, cylGeo(0.3, NAVE_ROOF_Y - 1 - (6 + FL) + 0.2, 12), trs(s * 6.75, 6 + FL, z));
    }
  }
  // 肋拱尖拱筒形顶：中殿（沿 z，半跨 7）与耳堂（沿 x，半跨 5.8）两条尖拱筒相贯；
  // 每跨一道横肋 + 两道对角肋 + 金色拱心石，后殿是 7 道放射肋的半穹顶
  const rise = 7.5;
  const VSPR = NAVE_ROOF_Y - 1; // 起拱高
  vaultBarrel(F, mats, 'z', 0, 7, rise, [33, 24, ...PIERS, -7, -21, -26], VSPR); // 中殿筒拱贯穿交叉处直到后殿，与耳堂筒拱相贯
  vaultBarrel(F, mats, 'x', -14, 7, rise, [-21.8, -15, -7.6, 7.6, 15, 21.8], VSPR); // 与中殿同剖面，交叉处相贯成十字拱
  {
    const dome = new THREE.SphereGeometry(7.05, 18, 8, Math.PI, Math.PI, 0, Math.PI / 2); // φ∈[π,2π] → z<0（北半）
    dome.scale(1, rise / 7.05, 1);
    F.add(mats.web, dome, trs(0, VSPR, -26));
    for (let i = 0; i <= 7; i++) {
      const t = Math.PI / 2 + (i / 7) * Math.PI;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const ph = (k / 8) * (Math.PI / 2);
        const rr = 7.05 * Math.cos(ph) - 0.15;
        pts.push([rr * Math.sin(t), VSPR + rise * Math.sin(ph) - 0.15, -26 + rr * Math.cos(t)]);
      }
      for (let k = 0; k < 8; k++) strut(F, mats.rib, pts[k], pts[k + 1], 0.4, 0.4);
    }
    F.add(M.gold, new THREE.SphereGeometry(0.55, 10, 8), trs(0, VSPR + rise - 0.3, -26));
  }
  // 交叉处横梁 → 改为交叉拱的金色拱心石
  F.add(M.gold, new THREE.SphereGeometry(0.7, 10, 8), trs(0, VSPR + rise - 0.6, -14));

  // 彩窗投在地上的淡彩光斑：加色混合的透明贴片（斜向拉长，模拟午后斜射）
  const spotMat = new THREE.MeshBasicMaterial({
    map: M.stained.map, color: 0xffffff, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false, name: 'lmGlassSpots',
  });
  for (const s of [-1, 1]) {
    for (const z of BAYS) {
      const g = new THREE.PlaneGeometry(2.0, 3.6).rotateX(-Math.PI / 2);
      // 侧廊窗 → 侧廊地面；高侧窗 → 中殿地面（靠近柱列）
      F.add(spotMat, g, trs(s * 11.2, FL + 0.02, z - 0.6, 0, s * 0.35));
      F.add(spotMat, new THREE.PlaneGeometry(1.6, 4.2).rotateX(-Math.PI / 2), trs(s * 5.2, FL + 0.025, z + 0.8, 0, -s * 0.3));
    }
  }
  // 体积光：从西侧高侧窗斜射到中殿地面的三道光柱（加色透明，十字交叉两片，越往下越淡）
  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0xffe9bf, alphaMap: shaftAlpha(), transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, name: 'lmLightShaft',
  });
  for (const z of [14.7, 8.5, 2.3]) lightShaft(F, shaftMat, [-7.2, 17.2, z], [1.8, FL + 0.05, z - 2.2], 2.0);
  // 红地毯中轴：门口 → 祭坛台阶
  F.add(M.carpet, carpetGeo(2.4, 58, 2), trs(0, FL + 0.015, 3.5));
  // 长椅：两侧各 11 排，面朝北
  for (let i = 0; i < 11; i++) {
    const z = 21.5 - i * 1.8;
    for (const s of [-1, 1]) {
      const x = s * 3.6;
      F.box(M.planks, x, FL + 0.42, z, 4.2, 0.09, 0.52, { collide: false });
      F.box(M.planks, x, FL + 0.5, z + 0.27, 4.2, 0.55, 0.07, { collide: false });
      F.box(M.timber, x - 2.1, FL, z + 0.02, 0.09, 0.98, 0.62, { collide: false });
      F.box(M.timber, x + 2.1, FL, z + 0.02, 0.09, 0.98, 0.62, { collide: false });
      F.collider(x, FL, z + 0.02, 4.3, 1.0, 0.62);
    }
  }
  // 祭坛：两级台阶 + 祭台 + 金色背屏
  F.box(M.stoneTrim, 0, FL, -28, 12, 0.3, 6.4);
  F.box(M.stoneTrim, 0, FL + 0.3, -28.6, 9, 0.3, 4.8);
  F.add(M.fabricRed, carpetGeo(2.4, 1.6, 2), trs(0, FL + 0.31, -25.6));
  const altarY = FL + 0.6;
  F.box(M.stoneWhite, 0, altarY, -29.2, 3.8, 1.05, 1.4);
  F.box(M.gold, 0, altarY + 1.05, -29.2, 4.0, 0.1, 1.55, { collide: false });
  F.box(M.fabricBlue, 0, altarY + 0.2, -28.47, 2.6, 0.82, 0.02, { collide: false });
  F.add(M.gold, new THREE.TorusGeometry(2.4, 0.16, 6, 28), trs(0, altarY + 6, -31.4));
  F.add(M.gold, new THREE.SphereGeometry(0.8, 12, 8), trs(0, altarY + 6, -31.4));
  for (let i = 0; i < 12; i++) F.box(M.gold, 0, altarY + 6 - 0.06, -31.45, 6.4, 0.12, 0.08, { rz: (i * Math.PI) / 12, collide: false });
  F.box(M.stoneTrim, 0, altarY, -31.6, 1.2, 5.2, 0.6, { collide: false });
  for (const s of [-1, 1]) {
    // 金烛台
    F.add(M.gold, cylGeo(0.07, 1.5, 6), trs(s * 2.6, altarY, -28.6));
    F.add(M.gold, cylGeo(0.3, 0.12, 8), trs(s * 2.6, altarY, -28.6));
    F.add(M.lampGlow, cylGeo(0.06, 0.3, 6), trs(s * 2.6, altarY + 1.5, -28.6));
    F.add(M.fire, coneGeo(0.05, 0.14, 5), trs(s * 2.6, altarY + 1.8, -28.6));
    F.collider(s * 2.6, altarY, -28.6, 0.6, 1.8, 0.6);
    ctx.lights.add({ x: cx + s * 2.6, y: altarY + 2, z: cz - 28.6, color: 0xffc77a, intensity: 1.5, range: 10, kind: 'candle', flicker: true });
  }
  // 吊灯：铁环 + 蜡烛，铁链挂到拱顶
  for (const z of [17, 5, -14]) {
    const y = 14.5;
    F.add(M.iron, cylGeo(0.05, NAVE_ROOF_Y + rise - 1 - y, 4), trs(0, y, z));
    F.add(M.iron, new THREE.TorusGeometry(1.8, 0.08, 5, 20), trs(0, y, z, Math.PI / 2));
    F.add(M.iron, new THREE.TorusGeometry(0.9, 0.06, 5, 14), trs(0, y + 0.8, z, Math.PI / 2));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      F.add(M.lampGlow, cylGeo(0.07, 0.35, 5), trs(Math.cos(a) * 1.8, y + 0.06, z + Math.sin(a) * 1.8));
      F.add(M.fire, coneGeo(0.06, 0.16, 5), trs(Math.cos(a) * 1.8, y + 0.42, z + Math.sin(a) * 1.8));
    }
    ctx.lights.add({ x: cx, y: y - 0.3, z: cz + z, color: 0xffc77a, intensity: 7, range: 26, kind: 'candle', flicker: true });
  }
  // 门内两侧的圣水盆
  for (const s of [-1, 1]) {
    F.add(M.stoneTrim, cylGeo(0.18, 0.9, 8), trs(s * 4.5, FL, 29));
    F.add(M.stoneTrim, cylGeo(0.25, 0.25, 10, 0.55), trs(s * 4.5, FL + 0.9, 29));
    F.collider(s * 4.5, FL, 29, 1.0, 1.15, 1.0);
  }
  for (const m of finishInto(B, { noShadow: [M.gold, M.carpet, M.fire, M.lampGlow, M.fabricRed, M.fabricBlue, M.iron] })) {
    // 加色光片不参与 GTAO：GTAOPass 的法线/深度预渲染会画进透明面片，在光柱边缘压出一道深色硬边；
    // 它只跳过 isPoints / isLine / isLine2 的对象，所以给这两张网格打上 isLine2 标记（渲染器本身不读这个标记）
    if (m.material.name === 'lmLightShaft' || m.material.name === 'lmGlassSpots') {
      m.isLine2 = true;
      m.castShadow = false;
      m.receiveShadow = false;
      m.renderOrder = 3;
    }
  }
  ctx.interiors.add(gi, cx, cz, 72);

  // 祭坛上方暖色聚光（不投影）：入口偏暗 → 祭坛最亮的引导。灯常驻场景（灯数不变，不触发重编译），
  // 离开大教堂附近时强度归零。
  const spot = new THREE.SpotLight(0xffd59a, 0, 34, 0.42, 0.65, 2);
  spot.position.set(cx, 26, cz - 21);
  spot.target.position.set(cx, FL, cz - 28.5);
  spot.castShadow = false;
  spot.name = '大教堂祭坛聚光';
  ctx.scene.add(spot, spot.target);
  return (dt, t, c) => {
    const p = c.camera.position;
    const near = Math.hypot(p.x - cx, p.z - cz) < 75 && p.y < 60;
    spot.intensity += ((near ? 1400 : 0) - spot.intensity) * Math.min(1, dt * 4 + (near ? 0 : 1));
  };
}

// 柱础与柱头：LatheGeometry 车削出的线脚轮廓（[半径, 高]，自下而上）
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const BASE_GEO = lathe([[0.001, 0], [1.02, 0], [1.02, 0.16], [0.92, 0.2], [0.98, 0.3], [0.86, 0.42], [0.78, 0.5], [0.76, 0.64]]);
// 钟形柱头：细颈 → 环形线脚 → 外翻钟口 → 方冠板下的圆台
const CAP_GEO = lathe([[0.74, 0], [0.78, 0.05], [0.74, 0.1], [0.75, 0.3], [0.8, 0.58], [0.86, 0.76], [0.88, 0.82], [0.84, 0.86], [0.87, 0.95], [0.001, 0.95]]); // 收敛的钟形线脚

// 光柱 alpha：长度方向从窗口（v=1）到地面（v=0）渐隐，宽度方向两侧羽化
function shaftAlpha() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) {
    const along = 0.25 + 0.75 * (1 - y / 127);
    for (let x = 0; x < 64; x++) {
      const dx = (x - 31.5) / 31.5;
      const e = Math.exp(-(dx * dx) / (2 * 0.32 * 0.32)) * (1 - dx * dx); // 横向高斯，两端严格归零
      const v = Math.round(255 * Math.max(0, e) * along);
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// 一道光柱：p0（窗）→ p1（地面），两片互相垂直的面片
function lightShaft(F, mat, p0, p1, w) {
  const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = dir.length();
  dir.normalize();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize();
  for (const k of [0, 1]) {
    const n = k ? new THREE.Vector3().crossVectors(side, dir).normalize() : side.clone();
    const zAx = new THREE.Vector3().crossVectors(n, dir).normalize();
    const m = new THREE.Matrix4().makeBasis(n, dir.clone().negate(), zAx);
    m.setPosition((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
    F.add(mat, new THREE.PlaneGeometry(w, len), m);
  }
}

// 尖拱剖面：半跨 a、矢高 h 的两段圆弧（u ∈ [-a, a]）
function pointedY(u, a, h) {
  const d = (h * h - a * a) / (2 * a);
  const r = a + d;
  const c = u <= 0 ? d : -d;
  return Math.sqrt(Math.max(0, r * r - (u - c) * (u - c)));
}

// 任意方向的一根杆件（盒子）：从 p0 到 p1，截面 w × h
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
function strut(F, mat, p0, p1, w, h) {
  _x.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = _x.length();
  _x.normalize();
  _z.crossVectors(_x, _up);
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
  _z.normalize();
  _y.crossVectors(_z, _x);
  const m = new THREE.Matrix4().makeBasis(_x, _y, _z).setPosition((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2);
  F.add(mat, boxGeo(len + 0.04, h, w), m);
}

/**
 * 尖拱筒形肋拱顶。axis = 'z'（沿 z 延伸，横向 u = x）或 'x'（沿 x 延伸，横向 u = z - c0）。
 * c0 = 横向中心；a = 半跨；h = 矢高；stations = 沿轴各道横肋位置（相邻两道之间为一跨，画对角肋）；y0 = 起拱高
 */
function vaultBarrel(F, mats, axis, c0, a, h, stations, y0, { diag = true } = {}) {
  const N = 10;
  const prof = [];
  for (let i = 0; i <= N; i++) {
    const u = -a + (2 * a * i) / N;
    prof.push([u, y0 + pointedY(u, a, h)]);
  }
  const P = (u, y, s) => (axis === 'z' ? [c0 + u, y, s] : [s, y, c0 + u]);
  const s0 = Math.min(...stations);
  const s1 = Math.max(...stations);
  // 拱面（薄板，沿轴贯通）
  for (let i = 0; i < N; i++) {
    const [u0, ya] = prof[i];
    const [u1, yb] = prof[i + 1];
    const du = u1 - u0;
    const dy = yb - ya;
    const len = Math.hypot(du, dy) + 0.05;
    const mid = P((u0 + u1) / 2, (ya + yb) / 2 + 0.12, (s0 + s1) / 2);
    const g = boxGeo(len, 0.22, s1 - s0);
    const m = new THREE.Matrix4();
    if (axis === 'z') m.makeRotationZ(Math.atan2(dy, du));
    else m.makeRotationY(-Math.PI / 2).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(dy, du)));
    m.setPosition(...mid);
    F.add(mats.web, g, m);
  }
  // 横肋
  for (const s of stations) {
    for (let i = 0; i < N; i++) strut(F, mats.rib, P(prof[i][0], prof[i][1] - 0.2, s), P(prof[i + 1][0], prof[i + 1][1] - 0.2, s), 0.45, 0.42);
  }
  if (!diag) return;
  // 对角肋 + 拱心石
  const sorted = [...stations].sort((p, q) => p - q);
  for (let k = 0; k < sorted.length - 1; k++) {
    const sa = sorted[k];
    const sb = sorted[k + 1];
    for (const dir of [1, -1]) {
      let prev = null;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const u = dir * (-a + 2 * a * t);
        const p = P(u, y0 + pointedY(u, a, h) - 0.25, sa + (sb - sa) * t);
        if (prev) strut(F, mats.rib, prev, p, 0.32, 0.32);
        prev = p;
      }
    }
    F.add(M_GOLD.m, new THREE.SphereGeometry(0.35, 8, 6), trs(...P(0, y0 + h - 0.35, (sa + sb) / 2)));
  }
}
const M_GOLD = { m: null };
