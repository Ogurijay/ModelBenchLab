// 新三角剑 Neo-Tridagger ZMC（鹰羽辽）— 田宫 ITEM 19409，Super-1 底盘
// 依据：官方主图 19409_1（灰底旧版照片；前导轮/轮毂 + 尾翼两端对称点标定，RMS 0.4 px）、包装与说明书。
// 锚点（毫米，+x 车头、+y 上、+z 右）：尾翼两端上翘尖 (-41.5, 46.5, ±32.5)；Super-1 前导轮螺丝 (66.5, 18.7, ±38.5)、
// 侧置后导轮螺丝 (-13.6, 19.5, ±41.6)（与包装侧面底盘插图一致：后导轮在后轴前约 25 mm）
// 造型要点：低平中央鼻 + 两侧后掠尖角前轮罩（三尖头），前后轮外侧外露；金棕色分割座舱；单柱高架黑色尾翼。
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, curve, lerp, smoothstep, extrude, merge, mirrorZ, roundBox } from '../geo.js';
import { paintMaterial, fillPath, strokePath, text } from '../paint.js';
import { plastic } from '../mats.js';

const GUN = 0x4b4d53, RED = '#e3322d', ORANGE = '#f2862a', YELLOW = '#f6d23e';

export default {
  id: 'tridagger',
  name: '新三角剑',
  jp: 'ネオトライダガーZMC',
  en: 'NEO-TRIDAGGER ZMC',
  owner: '鹰羽辽',
  kit: 'ITEM 19409',
  chassis: 'Super-1',
  refViews: {
    // 官方主图（灰底旧版照片，900×640）：四颗导轮螺丝 + 近侧轮毂 + 尾翼两端联合标定，RMS 0.3 px（长焦，约 8.4°）
    ref: { az: 43.44, el: 19.02, dist: 714.4, fov: 9.28, t: [0, 12, 0], roll: -1.41, shift: [-58.4, -29.8], size: [900, 640] },
  },
  refBackground: 'gray',
  chassisColors: { tub: 0x2b2d32, tubFinish: 'plain', aParts: 0x2849c9, roller: 0x2b4fd4, rollerRear: 0x16a3a0, gearCover: 0x2849c9, stay: 0x2b2d32, bumper: 0x2b2d32 },
  wheels: { tire: 'low26', design: 'dish', color: 0xd3272c, frontCover: true, coverColor: 0x8b8e94, ringColor: 0xd3272c },
  buildBody(ctx) {
    const { livery, wingLivery, step } = ctx;
    paintLivery(livery, wingLivery);
    const mat = paintMaterial({ color: GUN, livery, metalness: 0.45, roughness: 0.4, clearcoat: 0.9, clearcoatRoughness: 0.12, decalMetal: 0.25, decalRough: 0.32 });
    const body = new THREE.Group();
    const parts = [];

    // ---------- 中央鼻：低平、前端钝尖 (58.4, 14.5)，后段升到 Z 标平台 (18.8, 24.1) ----------
    const nW = curve([[12, 15.0], [24, 14.0], [36, 12.0], [46, 10.0], [54, 7.0], [58.6, 3.5]]);
    const nY = curve([[12, 24.6], [20, 24.0], [30, 21.0], [40, 18.4], [50, 16.0], [58.6, 14.4]]);
    parts.push(loftX(stations(12, 58.6, step), x => {
      const w = nW(x), y = nY(x);
      return fillet([[-w, 8.5], [-w, y - 2.4], [-w * 0.55, y], [w * 0.55, y], [w, y - 2.4], [w, 8.5]], [0, 1.0, 1.4, 1.4, 1.0, 0], { seg: 2 });
    }));
    // 鼻下黑色进气块（前脸中央）
    const chin = new THREE.Mesh(roundBox(50, 59.5, -9, 9, 7.5, 11.5, 0.8), plastic(0x16171a, { rough: 0.6 }));
    chin.name = 'nose-chin'; body.add(chin);

    // ---------- 前轮罩（三尖头的两侧尖）：楔形刃，罩住车轮顶部；顶脊在内侧，外侧面向下斜 ----------
    const crest = curve([[16, 33.0], [24, 34.0], [32, 32.6], [40, 30.0], [48, 25.4], [55, 19.0], [60, 14.4], [62.5, 11.8]]);
    const zIn = curve([[16, 17.0], [40, 18.5], [52, 20.5], [62.5, 23.5]]);
    const zOut = curve([[16, 31.0], [24, 34.5], [34, 37.0], [44, 37.8], [52, 37.2], [58, 35.6], [62.5, 34.0]]);
    const fBot = curve([[16, 14.0], [22, 22.0], [27, 26.6], [52, 26.6], [56, 21.0], [59.5, 14.0], [62.5, 9.6]]);   // 外侧下缘（轮胎顶 26 mm 之上）
    const fender = loftX(stations(16, 62.5, step), x => {
      // 外侧下缘保持在轮胎顶（y≈26）之上，车轮侧面完整外露
      const zi = -zIn(x), zo = -zOut(x), yt = crest(x), yb = fBot(x), yo = Math.max(yb + 1.2, yt - 5.5);
      return fillet([[zo, yb], [zo, yo], [zi - 2.2, yt], [zi, yt - 0.8], [zi, 10]], [0, 0.6, 0.6, 0.4, 0], { seg: 2 });
    });
    parts.push(fender, mirrorZ(fender));

    // ---------- 侧舱（前后轮之间）：窄而高，顶面外斜 ----------
    const sW = curve([[-26, 31.0], [-10, 30.0], [8, 28.6], [24, 26.0]]);
    const sY = curve([[-26, 26.0], [-10, 24.6], [8, 24.0], [24, 25.0]]);
    const pod = loftX(stations(-26, 24, step), x => {
      const W = sW(x), y = sY(x);
      return fillet([[-W, 10], [-W, y - 5.5], [-W + 6, y], [-12, y + 0.6], [-12, 12]], [0, 1.0, 1.2, 0, 0], { seg: 2 });
    });
    parts.push(pod, mirrorZ(pod));

    // ---------- 后轮罩：圆鼓的拱形罩，车轮外侧外露 ----------
    const rc = curve([[-62, 26.0], [-54, 28.5], [-40, 29.5], [-28, 28.5], [-22, 27.0]]);       // 罩中心 |z|
    const rh = curve([[-62, 6.0], [-54, 9.5], [-40, 11.0], [-28, 10.0], [-22, 8.0]]);          // 半宽
    const ry = curve([[-62, 21.0], [-54, 28.0], [-44, 31.0], [-34, 30.4], [-26, 28.0], [-22, 26.0]]);
    const rear = loftX(stations(-62, -22, step), x => {
      const c = -rc(x), h = rh(x), yt = ry(x), yb = 10.5, pts = [], n = 14;
      for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; pts.push([c - Math.cos(a) * h, yb + (yt - yb) * Math.pow(Math.sin(a), 0.4)]); }
      return pts;
    });
    parts.push(rear, mirrorZ(rear));
    // 后部中央低甲板（翼柱落座处）
    parts.push(loftX(stations(-62, -12, step), x => {
      const w = 18, y = lerp(19.0, 24.0, smoothstep(-62, -40, x));
      return fillet([[-w, 10], [-w, y], [w, y], [w, 10]], [0, 1.2, 1.2, 0], { seg: 2 });
    }));

    const bodyMesh = new THREE.Mesh(merge(parts), mat);
    bodyMesh.name = 'body-shell';
    body.add(bodyMesh);

    // ---------- 金棕色座舱：大面积多边形顶面（前低后高），银色窗框，中央纵向分割线 ----------
    const cHalf = curve([[-31, 9.0], [-26, 12.0], [-12, 13.4], [0, 13.0], [8, 10.0], [13, 5.0], [15, 1.0]]);
    const cTop = curve([[-31, 33.6], [-24, 35.2], [-12, 34.0], [0, 32.0], [8, 30.0], [15, 27.6]]);
    const canopy = loftX(stations(-31, 15, 1.0), x => {
      const h = cHalf(x), yt = cTop(x), yb = 22.0, sh = Math.max(0.5, h * 0.72);
      return [[-h, yb], [-h, Math.max(yb + 0.4, yt - 4.2)], [-sh, yt], [sh, yt], [h, Math.max(yb + 0.4, yt - 4.2)], [h, yb]];
    });
    const canopyMesh = new THREE.Mesh(canopy.toNonIndexed(), new THREE.MeshPhysicalMaterial({ color: 0xa88a52, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, flatShading: true }));
    canopyMesh.geometry.computeVertexNormals();
    canopyMesh.name = 'canopy'; body.add(canopyMesh);
    const frameGeo = [];
    for (const sg of [-1, 1]) {
      const path = [];
      for (let x = 15; x >= -31; x -= 1.5) path.push(new THREE.Vector3(x, cTop(x) + 0.05, sg * cHalf(x) * 0.72));
      frameGeo.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 40, 0.45, 6, false));
    }
    const frame = new THREE.Mesh(merge(frameGeo), new THREE.MeshStandardMaterial({ color: 0xd5d8dc, metalness: 1, roughness: 0.25 }));
    frame.name = 'canopy-frame'; body.add(frame);
    const split = new THREE.Mesh(loftX(stations(-30, 14, 2), x => { const yt = cTop(x) + 0.12; return [[-0.45, yt - 0.5], [-0.45, yt], [0.45, yt], [0.45, yt - 0.5]]; }), plastic(0x2a2622, { rough: 0.6 }));
    split.name = 'canopy-split'; body.add(split);

    // ---------- 青绿色侧进气件（座舱两侧后段） ----------
    const teal = [];
    for (const s of [-1, 1]) teal.push(roundBox(-24, -14, s * 17 - 3.2, s * 17 + 3.2, 24.0, 28.0, 1.0));
    const tm = new THREE.Mesh(merge(teal), plastic(0x17a5a1, { rough: 0.3, clearcoat: 0.6 })); tm.name = 'teal-intakes'; body.add(tm);

    // ---------- 尾翼：单柱高架黑翼（柱顶 (-19.4, 37.7)），翼尖上翘 (-43.6, 43.8, ±32) ----------
    const wing = new THREE.Group();
    const wmat = paintMaterial({ color: 0x2c2d31, livery: wingLivery, metalness: 0.3, roughness: 0.4, clearcoat: 0.6, decalMetal: 0.2, decalRough: 0.3, mask: [1, 0, 0] });
    const yW = z => { const a = Math.abs(z); return 41.6 + 4.6 * smoothstep(24, 32.5, a); };
    const blade = loftZ(stations(-32.5, 32.5, 1.2), z => {
      const y = yW(z), sw = 0.32 * Math.abs(z);
      return [[-17 - sw, y - 0.6], [-17.8 - sw, y + 0.7], [-29 - sw, y + 1.4], [-30.2 - sw, y + 0.7], [-28.5 - sw, y - 0.4]];
    });
    const wb = new THREE.Mesh(blade, wmat); wb.name = 'wing-plane'; wing.add(wb);
    wmat.side = THREE.DoubleSide;
    const pylon = extrude(fillet([[-12, 22], [-16, 41.8], [-24, 42.4], [-24, 30], [-20, 22]], [1, 1, 1, 2, 1], { seg: 2 }), 6.0, { plane: 'xy', bevel: 0.6 });
    const pm = new THREE.Mesh(pylon, plastic(0x2c2e33, { rough: 0.45, metal: 0.3 })); pm.name = 'wing-pylon'; wing.add(pm);
    const cap = new THREE.Mesh(roundBox(-24, -15, -4.2, 4.2, 39.8, 42.8, 0.6), plastic(0x9da1a8, { rough: 0.35, metal: 0.7 })); cap.name = 'wing-mount'; wing.add(cap);
    return { body, wing };
  },
};

function paintLivery(L, W) {
  // 红橙黄三层火焰（自前向后）
  const flame = (c, pts, s) => {
    fillPath(c, pts.map(([x, z]) => [x, s * z]), RED);
    fillPath(c, pts.map(([x, z]) => [x - 1.5, s * (z * 0.92 + 1.2)]).slice(1, -1), ORANGE);
    fillPath(c, pts.map(([x, z]) => [x - 3, s * (z * 0.85 + 2.2)]).slice(2, -2), YELLOW);
  };
  L.top((c) => {
    for (const s of [-1, 1]) {
      flame(c, [[58, 16], [48, 22], [42, 18], [32, 26], [26, 20], [18, 25], [12, 21], [20, 18], [30, 20], [40, 16], [50, 15]], s);
      flame(c, [[-10, 22], [-18, 28], [-26, 24], [-34, 30], [-44, 27], [-52, 31], [-60, 26], [-50, 24], [-40, 25], [-28, 21], [-18, 21]], s);
      // 前轮罩刃面红色顶边
      strokePath(c, [[58.5, s * 13.5], [44, s * 18.5], [30, s * 19.0], [16, s * 18.2]], RED, 1.6);
    }
    // 鼻部红色 V 形饰线与 Z 标
    strokePath(c, [[58, -6], [46, -10], [36, -12]], RED, 1.0); strokePath(c, [[58, 6], [46, 10], [36, 12]], RED, 1.0);
    fillPath(c, [[40, -5], [40, 5], [31, 5], [31, -5]], '#f0f0ee');
    text(c, 'Z', 35.5, 0, { dir: [0, -1], up: [-1, 0], size: 8, color: '#d4262b', font: '900 {s}px "Arial Black", sans-serif' });
  });
  // 尾翼层：白字 TRIDAGGER / ZMC
  W.top((c) => {
    text(c, 'TRIDAGGER', -24.6, 12, { dir: [0, -1], up: [-1, 0], size: 4.2, color: '#ffffff', font: 'italic 900 {s}px "Arial Black", sans-serif', skew: 0.2 });
    text(c, 'ZMC', -27.6, -16, { dir: [0, -1], up: [-1, 0], size: 5.2, color: '#ffffff', font: 'italic 900 {s}px "Arial Black", sans-serif', skew: 0.2 });
  });
  L.side((c, s) => {
    const pts = [[56, 14], [44, 18.5], [36, 15.5], [26, 20], [16, 16], [6, 20], [-6, 17], [-18, 22], [-30, 18], [-44, 22], [-58, 18], [-46, 14], [-30, 15], [-14, 13], [0, 14], [20, 12.5], [40, 12]];
    fillPath(c, pts, RED);
    fillPath(c, pts.map(([x, y]) => [x - 2, y - 1.2]).slice(2, 12), ORANGE);
    fillPath(c, pts.map(([x, y]) => [x - 4, y - 2.2]).slice(4, 10), YELLOW);
    text(c, 'R.TAKABA', -8, 21.6, { size: 1.6, color: '#1a1a1a', dir: [s, 0] });
  });
}
