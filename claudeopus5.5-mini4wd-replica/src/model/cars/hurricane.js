// 飓风音速号 Hurricane Sonic（星马烈）— 田宫 ITEM 19441 Premium，AR 底盘
// 依据：官方主图 19441_1、展示会照片、说明书 STEP 1/2（车身 TS-45 珍珠白；前翼 D2 枪灰 X-10；鼻下 D4 半光黑；尾翼 D1 独立件）。
// 坐标毫米（+x 车头、+y 上、+z 右）。相机由 AR 底盘导轮/轮毂标定（官方主图 RMS 1.5 px），对称三角测量锚点：
//   前轮罩内侧尖角 (40.7, 27.4, ±19.9)、前下内角 (61.7, 12.0, ±14.8)
//   尾翼端板顶后角 (-60.8, 38.7, ±36.3)、端板前下角 (-34.0, 30.6, ±37.1)
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, curve, lerp, smoothstep, extrude, merge, mirrorZ, roundBox } from '../geo.js';
import { paintMaterial, fillPath, strokePath, text } from '../paint.js';
import { plastic } from '../mats.js';

const WHITE = 0xf5f4ef, RED = '#e5333b', RED_D = '#c21f2a', GREEN = '#127a5f', YELLOW = '#f2c731', BLUE = '#2346b8', SILVER = 0x8d9096;

export default {
  id: 'hurricane',
  name: '飓风音速号',
  jp: 'ハリケーンソニック',
  en: 'HURRICANE SONIC',
  owner: '星马烈',
  kit: 'ITEM 19441 · Premium',
  chassis: 'AR',
  refViews: {
    ref: { az: 35.02, el: 23.08, dist: 296.2, fov: 25.82, t: [0, 12, 0], roll: 1.58, shift: [-40.9, 11.7], size: [900, 640] },
    ref2: { az: 83.97, el: 48.36, dist: 668.4, fov: 9.53, t: [0, 12, 0], roll: 7.23, shift: [-6.4, -19.5], size: [800, 513] },
  },
  chassisColors: { tub: 0x3b3d42, aParts: 0xe0323a, roller: 0xe8433f, gearCover: 0xe0323a },
  wheels: { tire: 'low26', design: 'spoke5', color: 0xf0c22c },
  buildBody(ctx) {
    const { livery, wingLivery, step } = ctx;
    paintLivery(livery, wingLivery);
    const mat = paintMaterial({ color: WHITE, livery, roughness: 0.3, clearcoat: 0.85, decalMetal: 0.3, decalRough: 0.3 });
    const body = new THREE.Group();
    const parts = [];

    // ---------- 中央：鼻锥（高拱，SONIC 贴纸在脊上）→ 座舱 → 红色后甲板 ----------
    const hw = curve([[-60, 14], [-40, 14.5], [-20, 14.5], [0, 14.5], [16, 14.5], [28, 13.0], [38, 10.6], [46, 7.6], [53, 4.0]]);
    const yc = curve([[-60, 26.0], [-40, 27.0], [-24, 27.6], [-6, 28.0], [10, 27.6], [22, 26.6], [32, 24.6], [42, 21.4], [48, 19.4], [53, 17.6]]);
    const center = loftX(stations(-60, 53, step), x => {
      const h = hw(x), y0 = yc(x), b = 11.5;
      const n = 10, top = [];
      for (let i = 0; i <= n; i++) { const z = -h + 2 * h * i / n, t = Math.abs(z) / h; top.push([z, y0 - 2.2 * t * t]); }
      return fillet([[-h + 0.4, b], ...top, [h - 0.4, b]], [0, 0.8, ...new Array(n - 1).fill(0), 0.8, 0], { seg: 2 });
    });
    parts.push(center);

    // ---------- 前轮罩：前脸近乎竖直（罩住前轮前半），内侧顶缘后段起尖角 ----------
    const ff = loftZ(stations(-38.5, -14.8, 1), z => {
      const t = (z + 14.8) / (-38.5 + 14.8); // 0 内 → 1 外
      const xFB = lerp(61.7, 58.0, t), yFB = lerp(9.0, 8.6, t);
      const xFT = lerp(52.0, 50.0, t), yFT = lerp(23.6, 22.4, t);
      const horn = Math.max(0, 1 - Math.abs(z + 19.9) / 4.5);               // 内侧尖角
      const xTop = lerp(45.0, 44.0, t), yTop = lerp(25.4, 23.8, t) + horn * 2.6;
      const xBack = lerp(38.4, 41.0, t) - horn * 1.2, yBack = lerp(24.6, 21.0, t) + horn * 2.8;
      return fillet([[xFB, yFB], [xFB + 0.8, 13.0], [xFT, yFT], [xTop, yTop], [xBack, yBack], [xBack + 1.0, 14.5]], [0, 4.0, 2.2, 1.0, 0.6, 0], { seg: 3 });
    });
    const fenderMat = paintMaterial({ color: WHITE, livery, roughness: 0.3, clearcoat: 0.85, decalMetal: 0.3, decalRough: 0.3, mask: [1, 1, 3] });
    const ffMesh = new THREE.Mesh(merge([ff, mirrorZ(ff)]), fenderMat); ffMesh.name = 'front-fenders'; body.add(ffMesh);
    // 前翼 D2 的竖直部分：两前轮罩内壁（枪灰）
    const innerWall = loftZ([-14.9, -14.3], () => [[61.0, 10.0], [52.0, 23.0], [45.0, 27.2], [40.2, 29.6], [38.6, 26.0], [38.6, 13.0]]);
    const iw = new THREE.Mesh(merge([innerWall, mirrorZ(innerWall)]), plastic(SILVER, { rough: 0.4, metal: 0.7, clearcoat: 0.5 })); iw.name = 'front-wing-walls'; body.add(iw);

    // ---------- 侧舱：楔形斜坡舱，前低后高，后端升到尾翼支撑处；顶面前段为三角网格进气口 ----------
    const podOut = curve([[-50, 37.4], [-34, 37.0], [-14, 35.2], [6, 32.4], [18, 28.6], [28, 23.5]]);
    const podIn = curve([[-50, 12.5], [0, 12.0], [28, 12.5]]);
    const podTop = curve([[-50, 30.0], [-36, 30.6], [-22, 29.4], [-6, 26.8], [10, 23.8], [22, 21.6], [28, 20.4]]);
    const pod = loftX(stations(-50, 28, step), x => {
      const zo = -podOut(x), zi = -podIn(x), yt = podTop(x), ridge = lerp(zo, zi, 0.35);
      return fillet([[zo, 11.0], [zo, yt - 6.0], [ridge, yt], [zi, yt - 1.0], [zi, 12]], [0, 1.2, 1.0, 0.6, 0], { seg: 2 });
    });
    parts.push(pod, mirrorZ(pod));

    // ---------- 后轮罩：外侧竖直，顶面低于侧舱 ----------
    const rfOut = curve([[-64, 38.0], [-58, 40.6], [-44, 41.0], [-26, 40.6], [-18, 38.0]]);
    const rfTop = curve([[-64, 23.4], [-56, 25.4], [-44, 26.0], [-26, 25.6], [-18, 24.0]]);
    const rf = loftX(stations(-64, -18, step), x => {
      const zo = -rfOut(x), zi = -16, yt = rfTop(x);
      return fillet([[zo, 10.8], [zo, yt - 2.6], [lerp(zo, zi, 0.25), yt], [zi, yt + 0.4], [zi, 12]], [0, 1.2, 1.4, 0, 0], { seg: 2 });
    });
    parts.push(rf, mirrorZ(rf));

    const bodyMesh = new THREE.Mesh(merge(parts), mat);
    bodyMesh.name = 'body-shell';
    body.add(bodyMesh);

    // ---------- 座舱罩（半光黑涂装，大面积） ----------
    const cHalf = curve([[-34, 6.5], [-28, 9.4], [-14, 10.6], [0, 10.2], [10, 8.0], [17, 4.6], [22, 1.0]]);
    const cTop = curve([[-34, 35.0], [-26, 36.2], [-12, 35.6], [2, 33.4], [12, 30.4], [22, 26.0]]);
    const canopy = loftX(stations(-34, 22, step * 0.8), x => {
      const h = cHalf(x), yt = cTop(x), yb = yc(x) - 1.4, pts = [], n = 16;
      for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; pts.push([-Math.cos(a) * h, yb + Math.max(0.3, yt - yb) * Math.pow(Math.sin(a), 0.6)]); }
      return pts;
    });
    const canopyMesh = new THREE.Mesh(canopy, new THREE.MeshPhysicalMaterial({ color: 0x55585e, roughness: 0.3, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.1 }));
    canopyMesh.name = 'canopy'; body.add(canopyMesh);
    // 座舱后方白色 U 形翼座（D1 的中央支撑拱，贴纸 18）
    const arch = extrude(fillet([[-10.5, 27], [-10.5, 37.5], [10.5, 37.5], [10.5, 27], [7.2, 27], [7.2, 34.2], [-7.2, 34.2], [-7.2, 27]], [0, 2.5, 2.5, 0, 0, 1.2, 1.2, 0], { seg: 3 }), 4.0, { plane: 'zy', bevel: 0.5 });
    arch.translate(-36, 0, 0);
    const archMesh = new THREE.Mesh(arch, plastic(WHITE, { rough: 0.3, clearcoat: 0.6 })); archMesh.name = 'wing-arch'; body.add(archMesh);

    // ---------- 前翼 D2（枪灰）：两前轮罩之间的马鞍形翼板，两端沿罩内壁升高，中央前缘 V 形缺口 ----------
    const fw = loftZ(stations(-14.4, 14.4, 1.0), z => {
      const a = Math.abs(z) / 14.4, rise = 3.0 * Math.pow(a, 3.0);
      const notch = Math.max(0, 1 - Math.abs(z) / 5.5) * 3.0;
      const xf = 61.0 - notch, xb = 43.5;
      return [[xf, 12.0], [xf - 0.6, 15.6 + rise], [lerp(xf, xb, 0.5), 17.8 + rise], [xb, 19.4 + rise], [xb, 12.0], [lerp(xf, xb, 0.5), 11.6]];
    });
    const fwMesh = new THREE.Mesh(fw, paintMaterial({ color: SILVER, livery, metalness: 0.75, roughness: 0.38, clearcoat: 0.6, decalMetal: 0.2, decalRough: 0.4, mask: [1, 0, 1] }));
    fwMesh.name = 'front-wing'; body.add(fwMesh);
    // 鼻下黑色件 D4
    const d4 = new THREE.Mesh(roundBox(42, 52, -6, 6, 9.5, 13.5, 0.8), plastic(0x1b1c1f, { rough: 0.5 }));
    d4.name = 'nose-grille'; body.add(d4);

    // ---------- 侧舱网格进气口（灰色金属网） ----------
    const meshMat = new THREE.MeshStandardMaterial({ color: 0x6f737a, roughness: 0.55, metalness: 0.6 });
    const intakes = [];
    for (const s of [-1, 1]) {
      // 三角网格：贴在侧舱前段顶面（脊线外侧），前尖后宽
      const tri = loftX(stations(-16, 20, 2), x => {
        const k = (20 - x) / 36, zr = lerp(podIn(x), podOut(x), 0.35) + 0.4, zo = lerp(zr + 0.6, podOut(x) - 1.6, Math.min(1, k * 1.2));
        const y1 = podTop(x) + 0.1, y2 = podTop(x) - 6.0 * (zo - zr) / Math.max(1, podOut(x) - zr) + 0.1;
        return [[zr, y1], [zo, y2], [zo, y2 - 0.3], [zr, y1 - 0.3]];
      });
      intakes.push(s > 0 ? tri : mirrorZ(tri));
    }
    const intakeMesh = new THREE.Mesh(merge(intakes), meshMat); intakeMesh.name = 'pod-intakes'; body.add(intakeMesh);

    // ---------- 尾翼 D1 ----------
    const wing = buildWing(paintMaterial({ color: WHITE, livery: wingLivery, roughness: 0.3, clearcoat: 0.85, decalMetal: 0.3, decalRough: 0.3 }));
    return { body, wing };
  },
};

function buildWing(mat) {
  const g = new THREE.Group();
  // 宽幅鸥翼：中段 ±21 高置（y≈38），外段向端板下折；翼弦 前缘 x -35 → 后缘 x -61
  const yAt = z => { const a = Math.abs(z); return a < 21 ? 0 : -5.0 * smoothstep(21, 36.4, a); };
  const plane = loftZ(stations(-36.4, 36.4, 1.4), z => {
    const d = yAt(z), le = [-35.0, 36.4 + d], te = [-61.0, 38.6 + d * 0.55];
    return [[le[0], le[1] - 0.6], [le[0] - 1.4, le[1] + 0.6], [lerp(le[0], te[0], 0.5), lerp(le[1], te[1], 0.5) + 1.0], [te[0], te[1] + 0.4], [te[0], te[1] - 1.0], [lerp(le[0], te[0], 0.5), lerp(le[1], te[1], 0.5) - 0.9]];
  });
  const m = new THREE.Mesh(plane, mat); m.name = 'wing-plane'; g.add(m);
  // 端板：白色竖板，前下角 (-34, 30.6) → 顶后角 (-60.8, 38.7)
  const ep = [];
  for (const s of [-1, 1]) {
    const shape = [[-32.6, 29.2], [-38, 33.6], [-61.6, 39.0], [-62.4, 31.6], [-50, 28.6]];
    const e = extrude(fillet(shape, [1.5, 2.0, 1.2, 2, 1.5], { seg: 3 }), 1.8, { plane: 'xy', bevel: 0.4 });
    e.translate(0, 0, s * 37.0);
    ep.push(e);
  }
  const em = new THREE.Mesh(merge(ep), mat); em.name = 'wing-endplates'; g.add(em);
  return g;
}

function paintLivery(L, W) {
  L.top((c) => {
    // 鼻锥：SONIC 星形贴纸（黄色放射线 + 白字），烈 字
    for (const s of [-1, 1]) {
      fillPath(c, [[44, s * 1.2], [30, s * 13], [27, s * 12], [40, s * 0.5]], YELLOW);
      fillPath(c, [[30, s * 2], [20, s * 14.5], [18.5, s * 13.5], [27, s * 1.5]], YELLOW);
    }
    fillPath(c, [[36, -5.5], [36, 5.5], [29, 5.5], [29, -5.5]], RED);
    text(c, 'SONIC', 32.5, 0, { dir: [0, -1], up: [-1, 0], size: 3.4, color: '#ffffff', stroke: '#1a1a1a', strokeWidth: 0.4 });
    text(c, '烈', 41.5, 0, { dir: [0, -1], up: [-1, 0], size: 6.2, font: '900 {s}px "Yu Gothic", "Microsoft YaHei", sans-serif', color: YELLOW, stroke: '#3a2a07', strokeWidth: 0.45 });
    // 前翼 D2 顶面贴纸（贴纸 19）
    text(c, 'HURRICANE', 50.4, -7.0, { dir: [0, -1], up: [-1, 0], size: 2.0, color: '#1c1c1e' });
    text(c, 'Sonic', 54.6, -7.0, { dir: [0, -1], up: [-1, 0], size: 4.4, font: 'italic 900 {s}px "Georgia", serif', color: '#1c1c1e', skew: 0.15 });
    // 鼻锥两侧红色侧带
    for (const s of [-1, 1]) fillPath(c, [[57, s * 4.4], [40, s * 10.8], [22, s * 15.2], [22, s * 13], [40, s * 8.6], [56, s * 3.2]], RED);
    // 前轮罩顶面红色
    for (const s of [-1, 1]) fillPath(c, [[56, s * 17], [56, s * 41], [24, s * 41], [24, s * 17]], RED);
    // 侧舱顶面红带（内侧）
    for (const s of [-1, 1]) fillPath(c, [[27, s * 15], [8, s * 18.5], [-14, s * 19.5], [-14, s * 15]], RED);
    // 后轮罩顶面：红色 + 三道白色横纹
    for (const s of [-1, 1]) {
      fillPath(c, [[-10, s * 15], [-10, s * 41], [-62, s * 41], [-62, s * 15]], RED);
    }
    // 尾翼：红色 + 白色三道横纹 + Hurricane Sonic 蓝色草书
  });
  // 尾翼层：红底 + 白色横纹 + 蓝色 Sonic 草书
  W.top((c) => {
    fillPath(c, [[-34, -38], [-34, 38], [-62, 38], [-62, -38]], RED);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const z0 = s * (24.5 + k * 3.6);
      fillPath(c, [[-37, z0 - s * 1.0], [-37, z0 + s * 1.0], [-59, z0 + s * 1.0], [-59, z0 - s * 1.0]], '#ffffff');
    }
    text(c, 'Sonic', -50, -3, { dir: [0, -1], up: [-1, 0], size: 10.5, font: 'italic 900 {s}px "Georgia", "Times New Roman", serif', color: BLUE, stroke: '#ffffff', strokeWidth: 1.0, skew: 0.2 });
    text(c, 'HURRICANE', -40.0, 7, { dir: [0, -1], up: [-1, 0], size: 2.8, color: '#ffffff', stroke: RED_D, strokeWidth: 0.3 });
  });
  W.side((c) => { text(c, 'HURRICANE SONIC', -50, 32.0, { size: 1.8, color: '#c21f2a' }); });
  L.side((c, s) => {
    // 侧面：上红下绿，中间白带
    fillPath(c, [[-62, 9], [-62, 14.5], [-10, 14.5], [-4, 12.4], [28, 12.4], [28, 9]], GREEN);
    fillPath(c, [[-62, 19], [-62, 30], [-10, 30], [-10, 19]], RED);
    // 前轮罩侧面：上红下绿
    fillPath(c, [[24, 9], [24, 13], [56, 13], [56, 9]], GREEN);
    fillPath(c, [[24, 17], [24, 32], [56, 32], [56, 17]], RED);
    // 驾驶员名
    text(c, 'R.SEIBA', -6, 28.8, { size: 1.6, color: '#ffffff', dir: [s, 0] });
  });
  L.front((c) => {
    // 前轮罩正面：红底 + 白绿下缘，椭圆头灯（黑边、白底、黄色上半与斜纹）
    for (const s of [-1, 1]) {
      fillPath(c, [[s * 14.6, 8], [s * 39, 8], [s * 39, 30], [s * 14.6, 30]], RED);
      fillPath(c, [[s * 14.6, 8], [s * 39, 8], [s * 39, 10.6], [s * 14.6, 12.0]], GREEN);
      fillPath(c, [[s * 14.6, 12.0], [s * 39, 10.6], [s * 39, 12.0], [s * 14.6, 13.6]], '#ffffff');
      // 细长斜眼头灯：外低内高，黑描边、白底、上缘黄色，内有斜向格栅细线
      c.save(); c.translate(s * 27.0, 19.0); c.rotate(-s * 0.2);
      c.beginPath(); c.ellipse(0, 0, 8.6, 1.9, 0, 0, Math.PI * 2); c.fillStyle = '#151515'; c.fill();
      c.beginPath(); c.ellipse(0, 0, 8.0, 1.45, 0, 0, Math.PI * 2); c.fillStyle = '#e3e8ea'; c.fill();
      c.save(); c.beginPath(); c.ellipse(0, 0, 8.0, 1.45, 0, 0, Math.PI * 2); c.clip();
      c.fillStyle = YELLOW; c.fillRect(-9, 0.3, 18, 1.4);
      c.strokeStyle = '#333'; c.lineWidth = 0.25;
      for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(i * 2 - 1.2, -2.6); c.lineTo(i * 2 + 1.2, 2.6); c.stroke(); }
      c.restore(); c.restore();
    }
  });
}
