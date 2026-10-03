// 蜘蛛王 Beak Spider（钢地 / Kai）— 田宫 ITEM 19439 Premium，Super-II 底盘（红色）
// 依据：官方主图 19439_1（三张 Super-II 照片联合标定，RMS 2.2 px）、说明书与包装。
// 对称三角测量锚点（毫米，+x 车头、+y 上、+z 右）：
//   尾部阶梯翼端板：前上角 (-30.6, 43.0, ±14.1)、后上角 (-59.1, 38.8, ±16.9)
//   前缘红色獠牙灯 (60.2, 11.2, ±20.5)；中线：BS 金色徽标 (32.7, 19.7)、鼻前缘 (58.3, 6.2)
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, curve, lerp, smoothstep, extrude, merge, mirrorZ, roundBox } from '../geo.js';
import { paintMaterial, fillPath, strokePath, text, path } from '../paint.js';
import { plastic } from '../mats.js';

const BLACK = 0x17191e, WEB = '#2f8cf0', WEB_CORE = '#e9f3ff', RED = '#e3262f', GOLD = 0x9c8550;

const smax = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (a - b) / k)); return b + (a - b) * h + k * h * (1 - h); };

export default {
  id: 'spider',
  name: '蜘蛛王',
  jp: 'ビークスパイダー',
  en: 'BEAK SPIDER',
  owner: '钢地（Kai）',
  kit: 'ITEM 19439 · Premium',
  chassis: 'Super-II',
  refViews: {
    ref: { az: 32.62, el: 20.91, dist: 294.6, fov: 25.76, t: [0, 12, 0], roll: 2.19, shift: [-30.1, 21.4], size: [900, 640] },
  },
  chassisColors: { tub: 0xe3242f, tubFinish: 'plain', aParts: 0x1b1c20, roller: 0x1d1e22, gearCover: 0x1b1c20, stay: 0x1b1c20, bumper: 0xe3242f },
  wheels: { tire: 'narrow24', design: 'spoke3', color: 0x16171a, tireColor: 0xeeeeea },
  buildBody(ctx) {
    const { livery, wingLivery, step } = ctx;
    paintLivery(livery, wingLivery);
    const mat = paintMaterial({ color: BLACK, livery, metalness: 0.2, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.1, decalMetal: 0.3, decalRough: 0.25 });
    const body = new THREE.Group();
    const parts = [];

    // ---------- 前部：宽平长鼻 + 两侧鼓起前轮罩 + 中央棱脊（俯视前缘近乎平直） ----------
    const halfW = curve([[6, 34.0], [16, 36.5], [30, 38.0], [46, 37.6], [54, 35.0], [58.5, 31.0], [60.5, 24.0], [61.2, 10.0]]);
    const hRidge = curve([[6, 24.5], [18, 23.6], [30, 20.6], [42, 16.6], [52, 12.4], [61, 8.4]]);
    const hFender = curve([[6, 22.0], [16, 26.4], [28, 28.6], [40, 27.6], [50, 22.6], [56, 17.2], [61, 10.0]]);
    const front = loftX(stations(6, 61.2, step), x => {
      const W = halfW(x), b = Math.min(10.5, hRidge(x) - 2.5), zs = [];
      for (let i = 0; i <= 26; i++) zs.push(-W + 2 * W * i / 26);
      const top = z => {
        const a = Math.abs(z);
        const ridge = hRidge(x) - 0.35 * a;                                         // 中央棱脊（截面为 ^ 形）
        const tf = (a - 27) / 13.0, fender = tf * tf < 1 ? lerp(b + 1, hFender(x), Math.pow(1 - tf * tf, 0.3)) : b + 1;
        const flat = hRidge(x) - 4.0 - 0.05 * a;                                     // 宽平鼻面
        return Math.max(b + 1.2, smax(smax(ridge, flat, 1.5), fender, 2.5));
      };
      return fillet([[-W + 0.2, b], ...zs.map(z => [z, top(z)]), [W - 0.2, b]], [0, 1.2, ...new Array(25).fill(0), 1.2, 0], { seg: 2 });
    });
    parts.push(front);

    // ---------- 中后段：侧舱 + 后轮罩（外缘高耸，黑红折线） ----------
    const rW = curve([[-64, 30.0], [-60, 36.0], [-50, 38.6], [-30, 38.6], [-10, 37.4], [6, 34.0]]);
    const rTop = curve([[-64, 22.0], [-58, 27.0], [-46, 30.4], [-30, 30.0], [-16, 27.0], [-4, 24.5], [6, 22.0]]);
    const rIn = curve([[-64, 14], [-30, 13.5], [6, 13.0]]);
    const rear = loftX(stations(-64, 6, step), x => {
      const W = rW(x), zi = rIn(x), yt = rTop(x);
      const sec = fillet([[-W, 11], [-W, yt - 6], [-W + 4, yt], [-zi - 2, yt - 3.5], [-zi, 18.0], [zi, 18.0], [zi + 2, yt - 3.5], [W - 4, yt], [W, yt - 6], [W, 11]], [0, 1.5, 1.5, 1.0, 0.8, 0.8, 1.0, 1.5, 1.5, 0], { seg: 2 });
      return sec;
    });
    parts.push(rear);

    // ---------- 中央脊鳍：座舱后方升起，贯穿阶梯翼（喙） ----------
    const spine = loftX(stations(-62, -14, 1.5), x => {
      const yt = curve([[-62, 30.0], [-52, 33.0], [-40, 37.5], [-30, 38.5], [-22, 34.0], [-14, 26.0]])(x), w = 1.6;
      return fillet([[-w, 17], [-w, yt - 1.2], [0, yt], [w, yt - 1.2], [w, 17]], [0, 0.6, 0.8, 0.6, 0], { seg: 2 });
    });
    parts.push(spine);

    // ---------- 阶梯翼端板（黑色、外缘白边） ----------
    for (const s of [-1, 1]) {
      const shape = [[-27, 30.0], [-30.6, 43.0], [-59.1, 38.8], [-61.6, 33.0], [-56, 33.0], [-34, 37.0], [-31, 30.0]];
      const e = extrude(fillet(shape, [1.2, 1.0, 1.0, 1.5, 1.5, 1.5, 1.2], { seg: 3 }), 1.8, { plane: 'xy', bevel: 0.35 });
      e.translate(0, 0, s * 15.5);
      parts.push(e);
    }
    for (const s of [-1, 1]) parts.push(roundBox(-52, -40, s * 15.5 - 1.0, s * 15.5 + 1.0, 22, 35.5, 0.4));
    const bodyMesh = new THREE.Mesh(merge(parts), mat);
    bodyMesh.name = 'body-shell';
    body.add(bodyMesh);

    // ---------- 金棕色多面座舱（棱面） ----------
    const cHalf = curve([[-26, 8.5], [-16, 11.0], [0, 11.6], [12, 10.0], [22, 6.0], [27, 1.5]]);
    const cTop = curve([[-26, 31.0], [-16, 33.0], [-2, 33.0], [10, 30.4], [20, 25.6], [27, 22.0]]);
    const canopy = loftX(stations(-26, 27, 2), x => {
      const h = cHalf(x), yt = cTop(x), yb = 21.0;
      return [[-h, yb], [-h, yt - 4.0], [-h * 0.45, yt], [h * 0.45, yt], [h, yt - 4.0], [h, yb]];
    });
    canopy.computeVertexNormals();
    const canopyMesh = new THREE.Mesh(canopy.toNonIndexed(), new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 0.7, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, flatShading: true }));
    canopyMesh.geometry.computeVertexNormals();
    canopyMesh.name = 'canopy'; body.add(canopyMesh);

    // ---------- 前缘镀铬饰边 ----------
    const edge = [];
    const xe = z => curve([[0, 61.4], [10, 61.2], [24, 60.4], [31, 58.6], [35, 54.0], [37.6, 46.0], [38.0, 30.0]])(Math.abs(z));
    for (let i = 0; i < 48; i++) {
      const z0 = -38 + 76 * i / 48, z1 = -38 + 76 * (i + 1) / 48;
      const a = new THREE.Vector3(xe(z0), 10.6, z0), b = new THREE.Vector3(xe(z1), 10.6, z1);
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const g = new THREE.CylinderGeometry(0.75, 0.75, len + 0.1, 8);
      g.rotateZ(Math.PI / 2); g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x)); g.translate(mid.x, mid.y, mid.z);
      edge.push(g);
    }
    const em = new THREE.Mesh(merge(edge), new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.15 }));
    em.name = 'chrome-edge'; body.add(em);

    // ---------- 三层阶梯翼片（前高后低，前缘白边），独立贴纸层 ----------
    const steps = [];
    for (const [x0, y0] of [[-32.0, 40.8], [-41.5, 39.4], [-51.0, 38.0]]) {
      steps.push(loftZ(stations(-14.6, 14.6, 2), () => [[x0, y0], [x0 - 0.6, y0 + 0.9], [x0 - 6.2, y0 + 0.5], [x0 - 6.6, y0 - 0.3], [x0 - 1.6, y0 - 0.8]]));
    }
    const wing = new THREE.Group();
    const wm = new THREE.Mesh(merge(steps), paintMaterial({ color: BLACK, livery: wingLivery, roughness: 0.32, clearcoat: 0.9, decalMetal: 0.2, decalRough: 0.3 }));
    wm.name = 'wing-steps'; wing.add(wm);
    return { body, wing };
  },
};

function paintLivery(L, W) {
  // 蜘蛛网格：纵向线（随车身外扩、前端收拢）+ 横向弧线，蓝色描边白芯
  const grid = (c, x0, x1, zMax, nz, dx) => {
    const draw = (w, col) => {
      c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
      for (let k = -nz; k <= nz; k++) {
        c.beginPath();
        for (let i = 0; i <= 30; i++) { const x = lerp(x1, x0, i / 30), spread = 0.72 + 0.28 * smoothstep(x1, x1 - 30, x); const z = (k / nz) * zMax * spread + Math.sin(x * 0.19 + k) * 0.8; i ? c.lineTo(x, z) : c.moveTo(x, z); }
        c.stroke();
      }
      for (let x = x1 - 3; x > x0; x -= dx) {
        c.beginPath();
        for (let i = 0; i <= 30; i++) { const z = lerp(-zMax, zMax, i / 30), xx = x - 0.004 * z * z * (x > 0 ? -1 : 1) + Math.sin(z * 0.3 + x) * 0.6; i ? c.lineTo(xx, z) : c.moveTo(xx, z); }
        c.stroke();
      }
    };
    draw(1.9, WEB); draw(0.6, WEB_CORE);
  };
  const web = (c, cx, cz, rings, rays, a0, a1) => {
    const draw = (w, col) => {
      c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
      for (const r of rings) { c.beginPath(); for (let i = 0; i <= 40; i++) { const a = lerp(a0, a1, i / 40); const x = cx - Math.cos(a) * r, z = cz + Math.sin(a) * r; i ? c.lineTo(x, z) : c.moveTo(x, z); } c.stroke(); }
      for (let k = 0; k <= rays; k++) { const a = lerp(a0, a1, k / rays); c.beginPath(); c.moveTo(cx - Math.cos(a) * rings[0] * 0.6, cz + Math.sin(a) * rings[0] * 0.6); c.lineTo(cx - Math.cos(a) * 140, cz + Math.sin(a) * 140); c.stroke(); }
    };
    draw(1.9, WEB); draw(0.6, WEB_CORE);
  };
  L.top((c) => {
    c.save(); c.beginPath(); c.rect(-20, -40, 84, 80); c.clip();
    grid(c, -20, 63, 40, 5, 9.5);
    c.restore();
    // 后段网格（侧舱 / 后轮罩顶）
    c.save(); c.beginPath(); c.rect(-66, -40, 46, 80); c.clip();
    for (const s of [-1, 1]) {
      // 红色折线
      fillPath(c, [[-14, s * 30], [-28, s * 37], [-44, s * 33], [-58, s * 38.6], [-58, s * 34.6], [-46, s * 29], [-30, s * 33], [-18, s * 27]], RED);
    }
    c.restore();
    // BS 金色徽标
    fillPath(c, [[36, -4.2], [36, 4.2], [30, 3.0], [27.5, 0], [30, -3.0]], '#d9b54a');
    text(c, 'BS', 32.4, 0, { dir: [0, -1], up: [-1, 0], size: 4.2, color: '#2a2108', font: 'italic 900 {s}px "Arial Black", sans-serif' });
  });
  // 尾翼层：阶梯翼白色前缘 + BEAK SPIDER
  W.top((c) => {
    for (const x0 of [-32.0, -41.5, -51.0]) fillPath(c, [[x0 + 0.4, -14.6], [x0 + 0.4, 14.6], [x0 - 1.4, 14.6], [x0 - 1.4, -14.6]], '#f2f2f2');
    text(c, 'BEAK', -36.0, 7.0, { dir: [0, -1], up: [-1, 0], size: 2.8, color: '#ffffff', font: 'italic 900 {s}px "Arial Black", sans-serif' });
    text(c, 'SPIDER', -45.6, -5.0, { dir: [0, -1], up: [-1, 0], size: 2.8, color: '#ffffff', font: 'italic 900 {s}px "Arial Black", sans-serif' });
  });
  L.side((c, s) => {
    c.save(); c.beginPath(); c.rect(4, 0, 60, 40); c.clip();
    web(c, 70, 12, [14, 24, 34, 46], 8, -1.4, 1.4);
    c.restore();
    // 后轮罩外侧红色锯齿
    fillPath(c, [[-8, 14], [-20, 24], [-30, 18], [-46, 28], [-58, 22], [-58, 18], [-46, 23], [-30, 13], [-20, 19], [-12, 12]], RED);
    // 阶梯翼端板白边
    strokePath(c, [[-30, 42.4], [-58.6, 38.2], [-62, 31]], '#f0f0f0', 1.0);
  });
  L.front((c) => {
    // 前缘红色獠牙灯（贴纸）
    for (const s of [-1, 1]) {
      fillPath(c, [[s * 15, 7.6], [s * 26, 7.6], [s * 27, 12.8], [s * 14, 13.6]], RED);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s * (17.5 + i * 3.2), 10.4, 1.1, 0, Math.PI * 2); c.strokeStyle = '#5a0b10'; c.lineWidth = 0.4; c.stroke(); }
    }
  });
}
