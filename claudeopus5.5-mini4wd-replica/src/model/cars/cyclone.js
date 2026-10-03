// 旋风冲锋 Cyclone Magnum（星马豪）— 田宫 ITEM 19440 Premium，AR 底盘
// 外形锚点：官方主图 19440_1 + 展示会照片两机位光束法平差（导轮/轮毂 + 对称特征，RMS 2.1 px）后三角测量，
// 单位毫米（+x 车头、+y 上、+z 右）：
//   鼻尖 (62.1, 15.0, 0)；座舱罩前尖 (14.1, 25.7, 0)；进气盒顶前沿 (-34.1, 33.9, 0)
//   尾翼：前缘角 (-50.9, 32.9, ±30.5)、后缘角 (-62.7, 37.1, ±28.8)；端板顶后尖 (-71.7, 39.7, ±31.7)
//   前轮罩斜面：内上 (46.0, 22.5, ±19.7) 外上 (39.8, 25.0, ±35.2) 外下 (51.1, 11.5, ±37.6) 内下 (58.8, 10.2, ±16.9)
//   AR 导轮螺丝顶：前 (67.7, 14.1, ±42)、后上 (-63.4, 26.0, ±42)
// 其余形体按两机位叠图迭代校正，过程见 docs/MODELING.md。
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, curve, lerp, smoothstep, extrude, merge, mirrorZ, roundBox } from '../geo.js';
import { paintMaterial, fillPath, strokePath, text, boltPoly } from '../paint.js';
import { plastic } from '../mats.js';

const WHITE = 0xf4f5f2, BLUE = '#2b3fc6', BLUE_D = '#1c2a8f', RED = '#e2283b', YELLOW = '#f3d33a', GOLD = '#d7a823', ORANGE = '#ef8a1f';

export default {
  id: 'cyclone',
  name: '旋风冲锋',
  jp: 'サイクロンマグナム',
  en: 'CYCLONE MAGNUM',
  owner: '星马豪',
  kit: 'ITEM 19440 · Premium',
  chassis: 'AR',
  refViews: {
    // 双照片光束法平差（导轮/轮毂/对称特征 + 前轮罩四角，导轮 x/y 为未知量，RMS 2.5 px）：ref=官方主图 19440_1，ref2=展示会照片
    ref: { az: 34.52, el: 23.42, dist: 295.9, fov: 25.92, t: [0, 12, 0], roll: 2.26, shift: [-35.4, 15.2], size: [900, 640] },
    ref2: { az: 34.39, el: 44.42, dist: 468.0, fov: 18.58, t: [0, 12, 0], roll: 19.15, shift: [-38.5, 22.7], size: [800, 627] },
  },


  chassisColors: { tub: 0x3b3d42, aParts: 0x2747c9, roller: 0x2f52d6, gearCover: 0x2747c9 },
  wheels: { tire: 'low26', design: 'turbine5', color: 0x2fd768 },
  buildBody(ctx) {
    const { livery, wingLivery, step } = ctx;
    paintLivery(livery, wingLivery);
    const mat = paintMaterial({ color: WHITE, livery, roughness: 0.34, clearcoat: 0.8, decalMetal: 0.35, decalRough: 0.28 });
    const blueMat = paintMaterial({ color: 0x2b3fc6, livery, roughness: 0.3, clearcoat: 0.8, decalMetal: 0.35, decalRough: 0.28, mask: [1, 1, 1] });
    const body = new THREE.Group();
    const parts = [];

    // ---------- 中央车体：鼻锥 → 座舱领口 → 后甲板 ----------
    const hw = curve([[-60, 14.5], [-40, 15.5], [-20, 15.0], [0, 15.0], [10, 16.4], [20, 16.0], [30, 14.0], [40, 11.2], [48, 8.4], [55, 5.4], [60, 2.8], [62.1, 1.2]]);
    const yc = curve([[-60, 28.6], [-44, 29.4], [-30, 29.0], [-10, 28.0], [4, 26.8], [14, 25.2], [28, 22.2], [44, 18.6], [54, 16.6], [62.1, 15.0]]);
    const drop = curve([[-60, 0.8], [-20, 0.8], [8, 2.0], [30, 2.6], [50, 2.0], [61, 1.0]]);
    const yb = curve([[-60, 12], [0, 12], [40, 10.0], [62, 11.0]]);
    const center = loftX(stations(-60, 62.1, step), x => {
      const h = hw(x), y0 = yc(x), d = drop(x), b = Math.min(yb(x), y0 - 2.5);
      const n = 12, top = [];
      for (let i = 0; i <= n; i++) { const z = -h + 2 * h * i / n, t = Math.abs(z) / h; top.push([z, y0 - d * Math.pow(t, 1.6)]); }
      return fillet([[-h + 0.4, b], ...top, [h - 0.4, b]], [0, 0.8, ...new Array(n - 1).fill(0), 0.8, 0], { seg: 2 });
    }, { capStart: true, capEnd: true });
    parts.push(center);

    // ---------- 侧舱（前轮后方肩部），顶面向外下斜 ----------
    const podOut = curve([[-4, 34.0], [6, 33.4], [14, 31.4], [21, 28.2], [27, 23.5]]);
    const podTopIn = curve([[-4, 27.2], [8, 26.6], [18, 25.0], [27, 22.8]]);
    const podTopOut = curve([[-4, 23.4], [8, 23.0], [18, 21.8], [27, 20.2]]);
    const pod = loftX(stations(-4, 27, step), x => {
      const zo = -podOut(x), zi = -hw(x) + 1.5;
      return fillet([[zo, 12.5], [zo, podTopOut(x)], [zi, podTopIn(x)], [zi, 13]], [0, 0.9, 0, 0], { seg: 2 });
    });
    parts.push(pod, mirrorZ(pod));

    // ---------- 后轮罩：前高后低的楔形刀锋，前脊峰 (-13.6, 33.3)，外侧面竖直 z≈41 ----------
    const rfOut = curve([[-60, 37.0], [-54, 40.0], [-40, 41.0], [-22, 41.0], [-12, 39.6], [-6, 37.0], [-2, 34.6]]);
    const rfIn = curve([[-60, 15.0], [-30, 14.6], [-2, 15.0]]);
    const rfRidge = curve([[-60, 26.6], [-48, 28.2], [-36, 30.0], [-24, 31.6], [-16, 32.6], [-10, 31.0], [-5, 28.0], [-2, 26.6]]);
    const rfRidgeZ = curve([[-60, 30.0], [-36, 29.8], [-14, 29.6], [-2, 28.6]]);
    const rf = loftX(stations(-60, -2, step), x => {
      const zo = -rfOut(x), zi = -rfIn(x), yr = rfRidge(x), zr = -rfRidgeZ(x);
      const yo = yr - 4.2 * Math.min(1, (rfOut(x) - rfRidgeZ(x)) / 10);
      const yi = Math.min(yr, yc(x) + 0.2);
      return fillet([[zo, 11.0], [zo, yo], [zr, yr], [zi, yi], [zi, 13]], [0, 0.8, 0.9, 0, 0], { seg: 2 });
    });
    parts.push(rf, mirrorZ(rf));

    // ---------- 进气盒（座舱后方） ----------
    parts.push(loftX(stations(-43, -31, 1.2), x => {
      const k = smoothstep(-31, -33.5, x), y = lerp(30.0, 34.4, k), h = 7.0;
      return fillet([[-h, 27.5], [-h, y], [h, y], [h, 27.5]], [0, 1.2, 1.2, 0], { seg: 2 });
    }));

    const bodyMesh = new THREE.Mesh(merge(parts), mat);
    bodyMesh.name = 'body-shell';
    body.add(bodyMesh);

    // 进气口黑色内腔
    const hole = new THREE.Mesh(roundBox(-33.8, -30.9, -4.4, 4.4, 29.4, 33.2, 0.4), plastic(0x0d0e10, { rough: 0.9 }));
    hole.name = 'intake-grille'; body.add(hole);

    // ---------- 座舱罩：细长水滴形，前尖后圆（深灰碳纹贴纸） ----------
    const cHalf = curve([[-32, 6.0], [-28, 10.6], [-18, 12.2], [-8, 11.6], [2, 9.0], [8, 5.8], [12, 2.8], [14.1, 0.6]]);
    const cTop = curve([[-32, 31.6], [-24, 33.6], [-12, 33.6], [0, 31.6], [6, 29.6], [11, 27.4], [14.1, 25.8]]);
    const canopy = loftX(stations(-32, 14.1, step * 0.7), x => {
      const h = cHalf(x), yt = cTop(x), yb = yc(x) - 1.2;
      const pts = [];
      const n = 18;
      for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; pts.push([-Math.cos(a) * h, yb + Math.max(0.3, yt - yb) * Math.pow(Math.sin(a), 0.5)]); }
      return pts;
    });
    const canopyMesh = new THREE.Mesh(canopy, carbonMaterial());
    canopyMesh.name = 'canopy'; body.add(canopyMesh);

    // ---------- 前轮罩（独立蓝色件，楔形） ----------
    const ff = new THREE.Mesh(frontFender(), blueMat); ff.name = 'front-fender-l';
    const ffr = new THREE.Mesh(mirrorZ(frontFender()), blueMat); ffr.name = 'front-fender-r';
    body.add(ff, ffr);

    // ---------- 尾翼 ----------
    const wing = buildWing(paintMaterial({ color: WHITE, livery: wingLivery, roughness: 0.34, clearcoat: 0.8, decalMetal: 0.35, decalRough: 0.28 }));
    return { body, wing };
  },
};

// 座舱罩贴纸：深灰金属碳纹
let carbonTex = null;
function carbonMaterial() {
  if (!carbonTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#44474d'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) {
      const o = ((x + y) / 8) % 2;
      g.fillStyle = o ? '#55595f' : '#383b40'; g.fillRect(x, y, 8, 4); g.fillStyle = o ? '#383b40' : '#55595f'; g.fillRect(x, y + 4, 8, 4);
    }
    carbonTex = new THREE.CanvasTexture(c); carbonTex.wrapS = carbonTex.wrapT = THREE.RepeatWrapping; carbonTex.repeat.set(10, 3); carbonTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbonTex, metalness: 0.65, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
}

// 前轮罩（左侧 z<0）：沿 z 放样，截面为 (x,y) 楔形：前下 → 斜面顶 → 顶面后缘 → 后下
function frontFender() {
  // 斜面四角：内上 IT、外上 OT、外下 OB、内下 IB（左侧 z<0）；顶面向后延伸 7 mm，内外侧壁竖直
  const IT = [46.0, 22.5, -19.7], OT = [39.8, 25.0, -35.2], OB = [51.1, 11.5, -37.6], IB = [58.8, 10.2, -16.9];
  const zi = -16.9, zo = -37.6;
  return loftZ(stations(zo, zi, 1.0), z => {
    const t = (z - zi) / (zo - zi); // 0 内 → 1 外
    const bot = [lerp(IB[0], OB[0], t), lerp(IB[1], OB[1], t)];
    const tt = clamp01((z - IT[2]) / (OT[2] - IT[2]));
    const top = [lerp(IT[0], OT[0], tt), lerp(IT[1], OT[1], tt)];
    const back = [top[0] - 7.0, top[1] - 0.8];
    return fillet([[bot[0] - 0.8, bot[1] - 2.4], bot, top, back, [back[0] + 1, 13.0]], [0, 0.6, 1.0, 0.8, 0], { seg: 2 });
  });
}
const clamp01 = v => Math.max(0, Math.min(1, v));

function buildWing(mat) {
  const g = new THREE.Group();
  // 主翼截面（侧视）：白色前缘面 → 蓝色上表面（前缘角 (-50.9, 32.9) → 后缘 (-63.6, 37.4)），展向 ±31.4
  const plane = loftZ(stations(-31.4, 31.4, 3), () => [
    [-48.6, 30.4], [-48.8, 32.6], [-50.9, 33.1], [-63.6, 37.5], [-64.4, 36.7], [-63.4, 35.4], [-52.0, 30.4],
  ]);
  const wingMesh = new THREE.Mesh(plane, mat); wingMesh.name = 'wing-plane'; g.add(wingMesh);
  // 端板：后掠刀形（侧视），根部落在后轮罩顶面，顶后尖 (-71.7, 39.7)
  const ep = [];
  for (const s of [-1, 1]) {
    const shape = [[-43.0, 27.6], [-50.0, 32.6], [-60.5, 37.6], [-71.9, 40.0], [-70.6, 36.4], [-67.0, 30.4], [-59.0, 26.6]];
    const e = extrude(fillet(shape, [1.5, 2, 3, 0.7, 2, 2, 1.5], { seg: 3 }), 1.6, { plane: 'xy', bevel: 0.35 });
    e.translate(0, 0, s * 32.0);
    ep.push(e);
  }
  const epMesh = new THREE.Mesh(merge(ep), mat); epMesh.name = 'wing-endplates'; g.add(epMesh);
  // 黑色尾翼支柱
  const stays = [];
  for (const s of [-1, 1]) stays.push(roundBox(-60, -52, s * 12 - 2.4, s * 12 + 2.4, 27.5, 32.0, 0.8));
  const st = new THREE.Mesh(merge(stays), plastic(0x1c1d20, { rough: 0.55 }));
  st.name = 'wing-stays'; g.add(st);
  return g;
}

// ---------- 涂装（依贴纸图与说明书 STEP 2 贴纸位置） ----------
// 贴纸为金属调：蓝色 Y 形鼻锥贴纸（G 标 + 豪）、红色细条、后轮罩红色爪痕（白描边、蓝底）、黑色 G.SEIBA、翼面 CYCLONE MAGNUM。
function paintLivery(L, W) {
  L.top((c) => {
    // 鼻锥红色细条（贴纸 1/5 两侧）
    for (const s of [-1, 1]) {
      fillPath(c, [[58.5, s * 3.4], [44, s * 9.6], [30, s * 14.4], [22, s * 16.8], [21, s * 15.6], [30, s * 12.6], [44, s * 8.2]], RED);
    }
    // 蓝色 Y 形鼻锥贴纸：杆身到鼻尖，双臂环抱座舱前端
    const yHalf = [[61.6, 0.6], [58, 2.0], [46, 3.6], [34, 4.6], [26, 5.6], [18, 8.6], [10, 11.8], [2, 14.2], [-8, 15.4], [-12, 15.4], [-12, 11.6], [-2, 11.0], [6, 8.6], [12, 5.0], [16, 0]];
    fillPath(c, [...yHalf, ...yHalf.slice(0, -1).reverse().map(([x, z]) => [x, -z])], BLUE);
    // G 标：橙色圆弧 G + 黄色描边 + 白色 MAGNUM
    c.save(); c.translate(43.5, 0);
    c.beginPath(); c.arc(0, 0, 3.6, Math.PI * 0.15, Math.PI * 1.75); c.lineWidth = 1.6; c.strokeStyle = YELLOW; c.stroke();
    c.beginPath(); c.arc(0, 0, 3.6, Math.PI * 0.15, Math.PI * 1.75); c.lineWidth = 0.8; c.strokeStyle = ORANGE; c.stroke();
    c.restore();
    text(c, 'MAGNUM', 40.2, 0, { dir: [0, -1], up: [-1, 0], size: 2.0, color: '#ffffff', stroke: BLUE_D, strokeWidth: 0.4 });
    text(c, '豪', 33.2, 0, { dir: [0, -1], up: [-1, 0], size: 6.6, font: '900 {s}px "Yu Gothic", "Microsoft YaHei", sans-serif', color: GOLD, stroke: '#3a2a07', strokeWidth: 0.4 });
    for (const s of [-1, 1]) {
      // 侧舱蓝带（贴纸 2/4）
      fillPath(c, [[27, s * 20.5], [16, s * 29.5], [4, s * 33.2], [-2, s * 33.2], [-2, s * 29.4], [10, s * 26.0], [20, s * 19.0]], BLUE);
      // 后轮罩顶面：白底，外缘蓝边，三道蓝描边红色火焰爪（贴纸 8/9/10/11），爪尖朝前
      fillPath(c, [[-2, s * 36.5], [-14, s * 41.2], [-54, s * 41.2], [-60, s * 38.4], [-60, s * 35.8], [-14, s * 37.8], [-2, s * 33.6]], BLUE);
      for (let k = 0; k < 3; k++) {
        const x0 = -10 - k * 13;
        const flame = [[x0 + 9, s * 21], [x0 + 1, s * 26], [x0 + 6, s * 30.5], [x0 - 3, s * 33], [x0 - 9, s * 39.5], [x0 - 4, s * 33.8], [x0 - 2, s * 27.5], [x0 - 6, s * 24]];
        fillPath(c, flame, BLUE);
        fillPath(c, flame.map(([x, z]) => [x * 0.94 + x0 * 0.06 - 0.6, s * (Math.abs(z) * 0.94 + 29 * 0.06)]), RED);
      }
    }
    // 座舱后横梁（蓝）与后甲板
    fillPath(c, [[-31, -12], [-31, 12], [-60, 14], [-60, -14]], BLUE);
  });
  // 尾翼层：翼面蓝底黄字 CYCLONE MAGNUM（贴纸 3）；端板外侧蓝色 + 黄色 C 标
  W.top((c) => {
    fillPath(c, [[-50.6, -30.6], [-50.6, 30.6], [-64.0, 30.6], [-64.0, -30.6]], BLUE);
    text(c, 'MAGNUM', -58.6, -2.0, { dir: [0, -1], up: [-1, 0], size: 8.6, color: YELLOW, stroke: '#141a4d', strokeWidth: 0.7, skew: 0.18, stretch: 1.35 });
    text(c, 'CYCLONE', -52.6, 17, { dir: [0, -1], up: [-1, 0], size: 2.6, color: '#ffffff', stroke: '#141a4d', strokeWidth: 0.3, skew: 0.18 });
  });
  W.side((c) => {
    fillPath(c, [[-43.5, 27.8], [-50, 32.4], [-60.5, 37.4], [-71.5, 39.8], [-70.4, 36.4], [-67, 30.6], [-59, 26.8]], BLUE);
    c.beginPath(); c.arc(-62.5, 33.6, 2.8, 0.7, Math.PI * 1.75); c.lineWidth = 1.2; c.strokeStyle = YELLOW; c.stroke();
    c.beginPath(); c.arc(-62.5, 33.6, 2.8, 0.7, Math.PI * 1.75); c.lineWidth = 0.5; c.strokeStyle = ORANGE; c.stroke();
  });
  L.side((c, s) => {
    // 后轮罩外侧：蓝底 + 白描边红色爪痕
    fillPath(c, [[-2, 11], [-2, 22], [-10, 33], [-60, 33], [-60, 11]], BLUE);
    for (let k = 0; k < 3; k++) {
      const x0 = -8 - k * 14;
      const claw = [[x0 + 3, 28], [x0 - 4, 20], [x0 - 11, 11], [x0 - 6, 11], [x0 - 1, 17], [x0 + 1, 11], [x0 + 5, 11], [x0 + 5, 20]];
      fillPath(c, claw, '#ffffff');
      fillPath(c, claw.map(([x, y]) => [x + (y > 25 ? -0.8 : 0), y + (y > 25 ? -1.2 : 0.9)]), RED);
    }
    // 侧舱蓝带外侧
    fillPath(c, [[27, 12], [27, 20], [4, 22], [4, 12]], BLUE);
    // 尾翼端板外侧：黄色 C 标（CYCLONE）
    // 鼻锥侧缘红线
    strokePath(c, [[58, 12.6], [44, 15.4], [28, 19.6]], RED, 0.7);
    // 座舱侧车手名（贴纸 16/17，黑底白字）
    fillPath(c, [[6, 26.2], [-24, 28.6], [-30, 28.0], [2, 25.2]], '#151618');
    text(c, 'G.SEIBA', -10, 27.0, { size: 1.5, color: '#ffffff', dir: [s, 0] });
  });
  L.front((c) => {
    // 前轮罩斜面头灯（贴纸 23/24）：金色三角眼，底边在内下角，尖端指向外上角，底部卷纹
    for (const s of [-1, 1]) {
      fillPath(c, [[s * 21.6, 13.0], [s * 36.4, 26.2], [s * 37.4, 25.0], [s * 31.6, 12.6]], YELLOW);
      fillPath(c, [[s * 24.5, 15.6], [s * 35.2, 24.6], [s * 29.6, 15.2]], ORANGE);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s * (23.6 + i * 2.6), 14.2, 1.0, 0, Math.PI * 2); c.lineWidth = 0.4; c.strokeStyle = '#3a2a07'; c.stroke(); }
    }
  });
}
