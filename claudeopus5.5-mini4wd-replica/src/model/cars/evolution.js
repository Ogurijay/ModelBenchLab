// 进化者 Proto-Saber Evolution（J）— 田宫 ITEM 19448 Premium，AR 底盘
// 依据：官方主图 19448_1（AR 导轮/轮毂标定 RMS 3.4 px）、展示会照片、包装与说明书底盘图。
// 对称三角测量锚点（毫米，+x 车头、+y 上、+z 右）：
//   尾部高端板顶尖 (-49.3, 41.4, ±30.5)；前轮罩头灯中心 (55.2, 21.5, ±24.4)；前轮罩前下尖角 (64.1, 16.3, ±18.0)
//   中线：J 标 (20.2, 27.1)；座舱罩前尖（紫色眉罩）(16.7, 35.5)；座舱后顶 (-22.9, 34.1)
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, curve, lerp, smoothstep, extrude, merge, mirrorZ, roundBox } from '../geo.js';
import { paintMaterial, fillPath, strokePath, text, path } from '../paint.js';
import { plastic } from '../mats.js';

const PURPLE = 0x5b45b4, DARK = '#2b2e3a', RED = '#d8262f', ORANGE = '#f08a24', YELLOW = '#f3cf3a', SILVER = 0xc9ced6;

export default {
  id: 'evolution',
  name: '进化者',
  jp: 'プロトセイバー エボリューション',
  en: 'PROTO-SABER EVOLUTION',
  owner: 'J',
  kit: 'ITEM 19448 · Premium',
  chassis: 'AR',
  refViews: {
    ref: { az: 37.94, el: 20.72, dist: 289.4, fov: 25.13, t: [0, 12, 0], roll: 0.68, shift: [-40.7, 8.8], size: [900, 640] },
  },
  chassisColors: { tub: 0x3b3d42, aParts: 0x9c86e6, roller: 0xa995ef, gearCover: 0x9c86e6 },
  wheels: { tire: 'low26', design: 'ySpoke5', color: 0xb9bec6 },
  buildBody(ctx) {
    const { livery, wingLivery, step } = ctx;
    paintLivery(livery, wingLivery);
    const mat = paintMaterial({ color: PURPLE, livery, metalness: 0.25, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.1, decalMetal: 0.35, decalRough: 0.3 });
    const body = new THREE.Group();
    const parts = [];

    // ---------- 前轮罩：鼓起的圆罩，前缘陡降到内下尖角；外侧下缘抬高露出车轮 ----------
    const fc = curve([[66.5, 19.5], [63, 22.5], [58, 25.0], [50, 27.5], [40, 28.4], [30, 28.4], [20, 27.6], [14, 27.0]]);   // 罩中心 |z|
    const fhw = curve([[66.5, 2.5], [64, 7.0], [60, 10.5], [54, 12.8], [44, 13.8], [32, 13.6], [22, 12.6], [14, 11.6]]);   // 半宽
    const ftop = curve([[66.5, 15.6], [64, 19.0], [60, 22.6], [56, 25.4], [50, 28.0], [42, 29.6], [34, 29.8], [26, 29.0], [18, 27.8], [14, 27.2]]);
    const fbotOut = curve([[66, 13.5], [56, 16.0], [50, 19.0], [40, 20.5], [30, 19.0], [22, 16.0], [14, 13.0]]);
    const fender = loftX(stations(14, 66.5, step), x => {
      const c = -fc(x), h = fhw(x), yt = ftop(x), ybo = fbotOut(x), ybi = 12.5;
      const pts = [];
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * i / n; // 外 → 内
        const zz = c - Math.cos(a) * h;
        const yb = lerp(ybo, ybi, i / n);
        pts.push([zz, yb + (yt - yb) * Math.pow(Math.sin(a), 0.5)]);
      }
      return pts;
    });
    parts.push(fender, mirrorZ(fender));

    // ---------- 中央鼻部：两罩之间的低脊，后段抬升到 J 标面 ----------
    const nhw = curve([[64, 3.0], [58, 6.5], [46, 10.0], [34, 12.5], [22, 14.0], [14, 14.0]]);
    const ntop = curve([[64, 14.5], [58, 16.6], [46, 19.6], [34, 22.6], [24, 25.6], [18, 27.2]]);
    const nose = loftX(stations(14, 64, step), x => {
      const h = nhw(x), yt = ntop(x);
      return fillet([[-h, 12], [-h, yt - 2.4], [0, yt], [h, yt - 2.4], [h, 12]], [0, 1.2, 1.4, 1.2, 0], { seg: 2 });
    });
    parts.push(nose);

    // ---------- 车身中后段：侧舱 + 后轮罩，外侧在后段升起成高端板 ----------
    const bOut = curve([[-62, 34.0], [-52, 38.6], [-36, 40.0], [-16, 39.6], [0, 38.0], [12, 35.5], [18, 33.0]]);
    const bTop = curve([[-62, 24.0], [-50, 27.6], [-34, 28.6], [-16, 28.0], [0, 27.4], [12, 26.6], [18, 26.2]]);
    const side = loftX(stations(-62, 18, step), x => {
      const zo = -bOut(x), zi = -11.5, yt = bTop(x);
      return fillet([[zo, 11.0], [zo, yt - 4.5], [lerp(zo, zi, 0.4), yt], [zi, yt + 1.0], [zi, 13]], [0, 2.0, 2.4, 0, 0], { seg: 3 });
    });
    parts.push(side, mirrorZ(side));
    // 中央座舱台
    const deck = loftX(stations(-62, 20, step), x => {
      const h = x > 10 ? lerp(12, 13.5, (x - 10) / 10) : 12, y = x < -40 ? lerp(24.0, 29.0, smoothstep(-62, -40, x)) : 29.0;
      return fillet([[-h, 13], [-h, y], [h, y], [h, 13]], [0, 1.0, 1.0, 0], { seg: 2 });
    });
    parts.push(deck);

    // ---------- 高端板（尾翼侧板）：自侧舱升起，顶尖 (-49.3, 41.4)，与侧面连续 ----------
    const plate = [];
    for (const s of [-1, 1]) {
      const shape = [[-6, 24.5], [-22, 30.5], [-36, 36.0], [-46.5, 41.2], [-50.5, 41.6], [-54.5, 37.0], [-60.5, 26.0], [-60, 22.0], [-30, 22.0]];
      const e = extrude(fillet(shape, [2, 4, 4, 1.5, 1.0, 3, 2, 1, 2], { seg: 3 }), 3.2, { plane: 'xy', bevel: 0.6 });
      e.translate(0, 0, s * 31.0);
      plate.push(e);
    }
    parts.push(...plate);

    const bodyMesh = new THREE.Mesh(merge(parts), mat);
    bodyMesh.name = 'body-shell';
    body.add(bodyMesh);

    // ---------- 座舱罩：银色金属罩（贴纸），前端被紫色尖眉罩覆盖 ----------
    const cHalf = curve([[-30, 6], [-24, 11.0], [-10, 12.8], [4, 11.6], [12, 8.0], [17, 3.0]]);
    const cTop = curve([[-30, 32.0], [-22, 35.6], [-8, 37.0], [4, 36.6], [12, 35.2], [17, 33.0]]);
    const canopy = loftX(stations(-30, 17, step * 0.8), x => {
      const h = cHalf(x), yt = cTop(x), yb = 28.0, pts = [], n = 16;
      for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; pts.push([-Math.cos(a) * h, yb + Math.max(0.3, yt - yb) * Math.pow(Math.sin(a), 0.6)]); }
      return pts;
    });
    const canopyMesh = new THREE.Mesh(canopy, new THREE.MeshPhysicalMaterial({ color: SILVER, metalness: 0.95, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }));
    canopyMesh.name = 'canopy'; body.add(canopyMesh);
    // 紫色尖眉罩：座舱前缘向前伸出的尖顶（中线 (16.7, 35.5)）
    const brow = loftX(stations(4, 20, 1.0), x => {
      const k = (x - 4) / 16, h = lerp(11.0, 0.8, Math.pow(k, 0.9)), yt = lerp(36.2, 35.0, k), yb = lerp(31.5, 33.6, k);
      return [[-h, yb], [-h * 0.6, yt], [h * 0.6, yt], [h, yb]];
    });
    const browMesh = new THREE.Mesh(brow, mat); browMesh.name = 'canopy-brow'; body.add(browMesh);

    // ---------- 前脸机械饰件：银色横饰 + 齿状格栅（中央） ----------
    const jaw = new THREE.Mesh(merge([
      roundBox(24, 30, -7.5, 7.5, 25.0, 26.6, 0.5),
      ...[-1, 1].flatMap(sg => [0, 1, 2, 3].map(i => roundBox(25 + i * 1.4, 26 + i * 1.4, sg * 9 - 2.2, sg * 9 + 2.2, 23.0 + i * 0.4, 25.2 + i * 0.6, 0.2))),
    ]), plastic(SILVER, { rough: 0.25, metal: 0.9, clearcoat: 0.6 }));
    jaw.name = 'nose-jaw'; body.add(jaw);

    // ---------- 侧面银色竖向进气格栅（前轮后方） ----------
    const slats = [];
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = 14 - i * 3.2;
      slats.push(roundBox(x - 0.8, x + 0.8, s > 0 ? 33.6 : -36.6, s > 0 ? 36.6 : -33.6, 14.5, 23.0 - i * 0.4, 0.3));
    }
    const slatMesh = new THREE.Mesh(merge(slats), plastic(SILVER, { rough: 0.25, metal: 0.9 })); slatMesh.name = 'side-slats'; body.add(slatMesh);

    // ---------- 尾翼：黑色翼面，夹在两端板之间 ----------
    const wing = new THREE.Group();
    const wp = loftZ(stations(-29.6, 29.6, 2), () => [[-34.5, 35.4], [-35.5, 36.6], [-50, 40.2], [-51.2, 39.8], [-50.5, 38.6], [-36, 34.6]]);
    const wingMat = paintMaterial({ color: 0x1d1e22, livery: wingLivery, roughness: 0.4, clearcoat: 0.5, decalMetal: 0.3, decalRough: 0.35 });
    const wm = new THREE.Mesh(wp, wingMat); wm.name = 'wing-plane'; wing.add(wm);
    const stay = new THREE.Mesh(merge([roundBox(-44, -38, -9, -5, 28.5, 37.0, 0.8), roundBox(-44, -38, 5, 9, 28.5, 37.0, 0.8)]), plastic(0x5b45b4, { rough: 0.35, clearcoat: 0.6 }));
    stay.name = 'wing-stays'; wing.add(stay);
    return { body, wing };
  },
};

function paintLivery(L, W) {
  L.top((c) => {
    // 前轮罩内缘深灰斜带（自前下尖角向后外）
    for (const s of [-1, 1]) {
      fillPath(c, [[66, s * 16.5], [56, s * 15.0], [30, s * 14.6], [16, s * 15.8], [16, s * 13.2], [30, s * 12.4], [56, s * 13.0], [66, s * 14.5]], DARK);
    }
    // 远侧（右，+z）前轮罩顶面红色火焰
    flame(c, [42, 28], 1.5, 1);
    flame(c, [42, -28], 1.5, -1);
    // J 标（黄色）在中央前脸
    text(c, 'J', 21.5, 0, { dir: [0, -1], up: [-1, 0], size: 6, font: 'italic 900 {s}px "Arial Black", sans-serif', color: YELLOW, stroke: '#2a2000', strokeWidth: 0.4 });
    // 后轮罩顶面三个黑色小进气孔
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) fillPath(c, [[-6 - i * 2.6, s * 21], [-6 - i * 2.6, s * 26], [-7.6 - i * 2.6, s * 26], [-7.6 - i * 2.6, s * 21]], '#141518');
  });
  // 尾翼层
  W.top((c) => {
    // 尾翼：橙黄字 Proto Saber EVO
    text(c, 'Proto', -46.2, 9, { dir: [0, -1], up: [-1, 0], size: 5.2, font: 'italic 900 {s}px "Arial Black", sans-serif', color: ORANGE, stroke: '#3a1500', strokeWidth: 0.5, skew: 0.15 });
    text(c, 'Saber EVO.', -40.0, -2, { dir: [0, -1], up: [-1, 0], size: 6.0, font: 'italic 900 {s}px "Arial Black", sans-serif', color: '#f6b52a', stroke: '#3a1500', strokeWidth: 0.5, skew: 0.15 });
  });
  L.side((c, s) => {
    // 端板外侧红色火焰（自下向上蹿升）
    const pts = [[-14, 14], [-20, 20], [-24, 18], [-28, 26], [-32, 24], [-37, 32], [-41, 30], [-45, 37.5], [-46, 33], [-50, 28], [-46, 24], [-44, 20], [-40, 22], [-38, 16], [-32, 19], [-28, 13]];
    fillPath(c, pts, RED);
    fillPath(c, pts.map(([x, y]) => [x - 0.8 + (y - 20) * 0.04, y * 0.92 + 1.6]), '#a8141d');
    // 侧面银色竖格栅区域背景（深色）
    fillPath(c, [[16, 13.5], [16, 24], [-1, 23], [-1, 13.5]], '#2b2d33');
    // 前轮罩侧面头灯延伸细线
    strokePath(c, [[60, 18.5], [44, 21.5], [30, 22.5]], DARK, 1.0);
  });
  L.front((c) => {
    // 前轮罩前斜面头灯：黄框、双圆灯
    for (const s of [-1, 1]) {
      c.save(); c.translate(s * 24.4, 21.0); c.rotate(-s * 0.12);
      fillPath(c, [[-6.2, -2.4], [6.0, -2.8], [6.6, 2.4], [-5.4, 2.8]], '#151515');
      fillPath(c, [[-5.6, -1.8], [5.4, -2.2], [5.9, 1.8], [-4.9, 2.2]], YELLOW);
      for (const dx of [-2.2, 2.2]) { c.beginPath(); c.arc(dx, 0, 1.6, 0, Math.PI * 2); c.fillStyle = '#d9dde2'; c.fill(); c.lineWidth = 0.35; c.strokeStyle = '#1b1b1b'; c.stroke(); }
      c.restore();
    }
    // 中央鼻部深灰带
    fillPath(c, [[-3, 13], [3, 13], [3, 17], [-3, 17]], DARK);
  });
}

// 火焰贴纸（俯视）：中心 cx,cz，scale，s=±1 镜像
function flame(c, [cx, cz], k, s) {
  const pts = [[14, 0], [8, 3], [10, 6], [2, 5], [4, 9], [-4, 7], [-2, 11], [-10, 6], [-14, 8], [-12, 2], [-16, -1], [-8, -2], [-12, -6], [-2, -4], [0, -8], [6, -3]];
  fillPath(c, pts.map(([a, b]) => [cx + a * k, cz + s * b * k * 0.9]), RED);
}
