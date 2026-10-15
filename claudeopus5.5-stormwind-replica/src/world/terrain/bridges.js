// 9 座运河桥：桥面 y = 0（石板铺装顶 +0.06，与岛沿压顶石齐平），两侧实心石栏杆（带碰撞），
// 下部为挤出的拱桥身（椭圆拱腹，跨度 > 22 m 改双拱 + 分水尖），拱券石环 + 拱心石 + 檐口腰线。
// 桥面长度 = 两岸间距再各伸进岸上 2 m；cathedral-harbor 北端只做到北城墙内侧面 z = -258（隧道由 B 模块做）。
import * as THREE from 'three';
import { BRIDGES, CANAL_BED_Y, WATER_Y } from '../coords.js';

const SPRING_Y = -3.2; // 起拱线（略低于水面，露出水面的拱更扁更宽）
const RISE = 2.1; // 拱高 → 拱顶 -1.1
const BODY_TOP = -0.1;
const BED = CANAL_BED_Y - 0.3;

function ringShape(sc, a, t) {
  const s = new THREE.Shape();
  s.moveTo(sc + a + t, SPRING_Y);
  s.absellipse(sc, SPRING_Y, a + t, RISE + t, 0, Math.PI, false);
  s.lineTo(sc - a, SPRING_Y);
  s.absellipse(sc, SPRING_Y, a, RISE, Math.PI, 0, true);
  s.lineTo(sc + a + t, SPRING_Y);
  return s;
}

const WALL_OF = {
  'trade-mage': 'stoneWhite',
  'trade-old': 'stoneWhite',
  'trade-cathedral': 'stoneWhite',
  'cathedral-dwarven': 'stoneGrey',
  'old-dwarven': 'stoneGrey',
  'old-keep': 'stoneWhite',
  'cathedral-lion': 'stoneWhite',
  'lion-mage': 'stoneWhite',
  'cathedral-harbor': 'stoneGrey',
};

export function buildBridges(ctx, F, S, under, GM) {
  const M = ctx.mat;
  const m4 = new THREE.Matrix4();
  for (const b of BRIDGES) {
    const [ax, az] = b.a;
    const [bx, bz] = b.b;
    const span = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / span;
    const uz = (bz - az) / span;
    const ry = Math.atan2(-uz, ux);
    const toWall = b.id === 'cathedral-harbor';
    const sA = -2;
    const sB = toWall ? span : span + 2;
    const w = b.w;
    const wall = M[WALL_OF[b.id] || 'stoneWhite'];
    // 局部帧：原点 = a 端岸线，X 沿桥，Z 横向
    const fS = S.frame(ax, 0, az, ry);
    const fF = F.frame(ax, 0, az, ry);

    // ---- 拱桥身（挤出：截面在 s-y 平面，沿 Z 挤出桥宽）----
    const n = span > 22 ? 2 : 1;
    const pier = 2.6;
    const m0 = 0.3;
    const cw = (span - 2 * m0 - (n - 1) * pier) / n;
    // 水上桥身：外轮廓直接沿拱腹走（不用洞，底边 = 水下 0.6 m）；水下只剩桥台 / 桥墩（暗色湿石）
    const bodyEnd = toWall ? span + 0.5 : span + 0.6;
    const yb = WATER_Y - 0.6;
    const th0 = Math.asin((yb - SPRING_Y) / RISE);
    const a = cw / 2;
    const arches = [];
    for (let i = 0; i < n; i++) arches.push(m0 + a + i * (cw + pier));
    const pts = [[-0.6, yb], [-0.6, BODY_TOP], [bodyEnd, BODY_TOP], [bodyEnd, yb]];
    for (let i = n - 1; i >= 0; i--) {
      const sc = arches[i];
      const K = 18;
      for (let k = 0; k <= K; k++) {
        const th = th0 + ((Math.PI - 2 * th0) * k) / K;
        pts.push([sc + a * Math.cos(th), SPRING_Y + RISE * Math.sin(th)]);
      }
    }
    const body = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: w - 0.02, bevelEnabled: false });
    bodyGeo.translate(0, 0, -(w - 0.02) / 2);
    fS.add(wall, bodyGeo);
    // 水下桥台 + 桥墩
    fS.box(under, (-0.6 + m0) / 2, BED, 0, m0 + 0.6, yb - BED, w - 0.02, { collide: false });
    fS.box(under, (span - m0 + bodyEnd) / 2, BED, 0, bodyEnd - span + m0, yb - BED, w - 0.02, { collide: false });
    for (let i = 0; i < n - 1; i++) fS.box(under, arches[i] + a + pier / 2, BED, 0, pier, yb - BED, w - 0.02, { collide: false });

    // 拱券石环（两面各凸出 0.14）+ 拱心石
    for (const sc of arches) {
      const ring = new THREE.ExtrudeGeometry(ringShape(sc, cw / 2, 0.55), { depth: 0.14, bevelEnabled: false, curveSegments: 14 });
      fS.add(M.stoneTrim, ring, m4.makeTranslation(0, 0, w / 2 - 0.02));
      fS.add(M.stoneTrim, ring, m4.makeTranslation(0, 0, -w / 2 - 0.12));
      fS.box(M.stoneTrim, sc, SPRING_Y + RISE - 0.3, 0, 0.8, 1.0, w + 0.36, { collide: false });
    }
    // 双拱：中间桥墩两面的分水尖
    for (let i = 0; i < n - 1; i++) {
      const sp = m0 + (i + 1) * cw + i * pier + pier / 2;
      for (const sz of [-1, 1]) {
        fS.box(M.stoneGrey, sp, BED, sz * (w / 2), pier / Math.SQRT2, SPRING_Y + 1.5 - BED, pier / Math.SQRT2, { ry: Math.PI / 4, collide: false });
        fS.box(M.stoneTrim, sp, SPRING_Y + 1.5, sz * (w / 2), pier / Math.SQRT2 + 0.2, 0.2, pier / Math.SQRT2 + 0.2, { ry: Math.PI / 4, collide: false });
      }
    }
    // 檐口腰线（桥面下沿）
    for (const sz of [-1, 1]) fS.box(M.stoneTrim, (-0.5 + bodyEnd - 0.1) / 2, -0.5, sz * (w / 2 + 0.06), bodyEnd - 0.1 + 0.5, 0.4, 0.26, { collide: false });

    // ---- 桥面石板（碰撞，顶 +0.06）----
    fF.box(GM.plaza, (sA + sB) / 2, -0.14, 0, sB - sA, 0.2, w);

    // ---- 石栏杆 + 端柱 ----
    const p0 = -0.7;
    const p1 = toWall ? span : span + 0.7;
    for (const sz of [-1, 1]) {
      const z = sz * (w / 2 - 0.25);
      fS.box(wall, (p0 + p1) / 2, 0.06, z, p1 - p0, 0.95, 0.5);
      fS.box(M.stoneTrim, (p0 + p1) / 2, 1.01, z, p1 - p0, 0.16, 0.64, { collide: false });
      const ends = toWall ? [p0] : [p0, p1];
      for (const s of ends) {
        fS.box(M.stoneTrim, s, 0.06, z, 0.78, 1.3, 0.78, { collide: false });
        fS.box(M.stoneWhite, s, 1.36, z, 0.92, 0.14, 0.92, { collide: false });
      }
      // 栏杆中段的装饰小柱（每 3 m 外凸）
      const k = Math.max(1, Math.round(span / 3));
      for (let i = 1; i < k; i++) fS.box(wall, (span * i) / k, 0.06, sz * (w / 2 - 0.2), 0.42, 1.0, 0.6, { collide: false });
    }
  }
}
