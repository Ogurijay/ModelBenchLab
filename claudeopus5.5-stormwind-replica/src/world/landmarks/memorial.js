// 雄狮安息地纪念碑：三层台基 + 方尖碑（金尖）+ 台基上的两尊金鬃石狮 + 四角火盆 + 环形铺地与花坛。
import * as THREE from 'three';
import { cylGeo, coneGeo } from '../../core/geom.js';
import { lionStatue, brazier, trs, finishInto } from './kit.js';

export function buildMemorial(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const [cx, cz] = C.LANDMARKS.lionsMemorial.center;
  const B = shared.B; // 外观几何并入模块级合批 Builder（index.js 统一 finish）

  // 环形铺地
  const disc = new THREE.CircleGeometry(12.5, 48).rotateX(-Math.PI / 2);
  const p = disc.attributes.position;
  for (let i = 0; i < p.count; i++) disc.attributes.uv.setXY(i, p.getX(i), p.getZ(i));
  B.add(M.plaza, disc, trs(cx, 0.02, cz));
  B.add(M.stoneTrim, new THREE.RingGeometry(12.5, 13.1, 48).rotateX(-Math.PI / 2), trs(cx, 0.04, cz));
  // 三层台基（每层 0.4，可直接走上去）
  [14, 11, 8].forEach((w, i) => B.box(M.stoneTrim, cx, 0.4 * i, cz, w, 0.4, w));
  // 碑座 + 檐口 + 金铭牌
  B.box(M.stoneWhite, cx, 1.2, cz, 4.6, 2.6, 4.6);
  B.box(M.stoneTrim, cx, 3.8, cz, 5.2, 0.45, 5.2, { collide: false });
  B.box(M.stoneTrim, cx, 1.2, cz, 5.0, 0.35, 5.0, { collide: false });
  B.box(M.gold, cx, 1.9, cz + 2.31, 2.4, 1.2, 0.05, { collide: false });
  // 方尖碑
  const ob = new THREE.CylinderGeometry(1.25, 2.0, 20, 4, 1).rotateY(Math.PI / 4).translate(0, 10, 0);
  B.add(M.stoneWhite, ob, trs(cx, 4.25, cz));
  for (const y of [4.6, 12.0]) {
    const r = 2.0 - (0.75 * (y - 4.25)) / 20 + 0.08;
    B.add(M.gold, new THREE.CylinderGeometry(r, r, 0.35, 4).rotateY(Math.PI / 4), trs(cx, y + 0.18, cz));
  }
  B.add(M.gold, coneGeo(1.32, 2.6, 4).rotateY(Math.PI / 4), trs(cx, 24.25, cz));
  // 碑身四面的金色狮纹章（简化：金环 + 金球）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const r = 2.0 - (0.75 * 12) / 20;
    const f = B.frame(cx + Math.sin(a) * (r * Math.SQRT1_2 + 0.02), 16.25, cz + Math.cos(a) * (r * Math.SQRT1_2 + 0.02), a);
    f.add(M.gold, new THREE.BoxGeometry(0.16, 3.2, 0.05), trs(0, -0.6, 0)); // 剑身
    f.add(M.gold, new THREE.BoxGeometry(1.1, 0.16, 0.06), trs(0, 0.55, 0)); // 护手
    f.add(M.gold, new THREE.BoxGeometry(0.12, 0.6, 0.06), trs(0, 0.95, 0)); // 握柄
    f.add(M.gold, new THREE.SphereGeometry(0.13, 6, 4), trs(0, 1.3, 0));
  }
  // 台基上的两尊卧狮（面朝南，护在碑前）
  for (const s of [-1, 1]) {
    B.box(M.stoneWhite, cx + s * 4.2, 0.4, cz + 4.4, 2.4, 1.1, 4.6);
    B.box(M.stoneTrim, cx + s * 4.2, 1.5, cz + 4.4, 2.7, 0.2, 4.9, { collide: false });
    lionStatue(B, M, cx + s * 4.2, 1.7, cz + 4.2, 0, 1.0);
  }
  // 四角火盆
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * 6.4;
    const z = cz + sz * 6.4;
    const y = brazier(B, M, x, 0.4, z, { scale: 0.8 });
    if (sz < 0) ctx.lights.add({ x, y, z, color: 0xff9a40, intensity: 0.9, range: 13, kind: 'fire', flicker: true });
  }
  // 花坛：北、南两条弧形（东西两侧留作入口路）
  for (const base of [0, Math.PI]) {
    for (let k = -3; k <= 3; k++) {
      const a = base + k * 0.16;
      const r = 14.8;
      B.box(M.stoneTrim, cx + Math.sin(a) * (r + 1.1), 0, cz + Math.cos(a) * (r + 1.1), 2.5, 0.4, 0.3, { ry: a });
      B.box(M.stoneTrim, cx + Math.sin(a) * (r - 1.1), 0, cz + Math.cos(a) * (r - 1.1), 2.2, 0.4, 0.3, { ry: a });
      B.box(shared.flowers, cx + Math.sin(a) * r, 0, cz + Math.cos(a) * r, 2.45, 0.32, 1.9, { ry: a, collide: false });
      if (k % 2 === 0) B.add(M.leaves, new THREE.IcosahedronGeometry(0.75, 1), trs(cx + Math.sin(a) * r, 0.9, cz + Math.cos(a) * r, 0, 0, 0, 1, 1.2, 1));
    }
  }
  // 东西两条入口石路
  for (const s of [-1, 1]) B.box(M.plaza, cx + s * 19, 0, cz, 13, 0.03, 4, { collide: false });
}
