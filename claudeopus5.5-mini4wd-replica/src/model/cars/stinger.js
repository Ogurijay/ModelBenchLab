// 魔鬼司令 Ray Stinger（土方令）— 田宫 ITEM 19438 Premium，Super-II 底盘（深蓝）
// 依据：官方主图 19438_1（三张 Super-II 照片联合标定，RMS 2.2 px）与说明书。
// 锚点（毫米，+x 车头、+y 上、+z 右；对称点残差较大处标为约值）：
//   中线：毒针鼻尖 (53.0, 12.3)、座舱罩前缘 (18.9, 26.2)、尾鳍根 (-14.6, 35.4)、尾鳍尖 (-46.5, 38.0)
//   金色双喷口组 ≈ (-16, 29, ±22)；红色肋条唇 ≈ (50, 12, ±7)；前轮罩刃尖 ≈ (39, 29, ±24)
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, curve, lerp, smoothstep, extrude, merge, mirrorZ, roundBox, cyl, sweep } from '../geo.js';
import { paintMaterial, fillPath, strokePath, text } from '../paint.js';
import { plastic } from '../mats.js';

const SILVER = 0xc6cad1, BLACK = '#1c1d22', RED = '#b5121f';

export default {
  id: 'stinger',
  name: '魔鬼司令',
  jp: 'レイスティンガー',
  en: 'RAY STINGER',
  owner: '土方令',
  kit: 'ITEM 19438 · Premium',
  chassis: 'Super-II',
  refViews: {
    ref: { az: 35.03, el: 19.52, dist: 289.1, fov: 25.54, t: [0, 12, 0], roll: 1.80, shift: [-25.6, 35.4], size: [900, 640] },
  },
  chassisColors: { tub: 0x1f2b6e, tubFinish: 'plain', aParts: 0x9aa0a8, roller: 0xa8adb5, gearCover: 0x1f2b6e, stay: 0x8e949c, stayMetal: true, bumper: 0x1f2b6e },
  wheels: { tire: 'low26', design: 'turbine5', color: 0xf3f3f0 },
  buildBody(ctx) {
    const { livery, step } = ctx;
    paintLivery(livery);
    const mat = paintMaterial({ color: SILVER, livery, metalness: 0.75, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12, decalMetal: 0.2, decalRough: 0.4 });
    const body = new THREE.Group();
    const parts = [];

    // ---------- 中央毒针：自鼻尖升到座舱前的尖脊 ----------
    const spineW = curve([[19, 9.0], [30, 7.0], [42, 5.0], [52, 3.0], [58, 1.0]]);
    const spineY = curve([[19, 26.4], [30, 22.6], [42, 18.4], [52, 14.4], [58, 11.6]]);
    parts.push(loftX(stations(14, 58.5, step), x => {
      const w = spineW(Math.max(19, x)), y = spineY(Math.max(19, x));
      return fillet([[-w, 9.5], [-w, y - 3.0], [0, y], [w, y - 3.0], [w, 9.5]], [0, 0.8, 0.4, 0.8, 0], { seg: 2 });
    }));

    // ---------- 前轮罩：内侧竖刃 + 外侧斜面，前端收成尖角（三叉戟两侧） ----------
    const fTop = curve([[8, 22.0], [18, 24.4], [30, 26.6], [40, 29.0], [47, 32.4], [52, 31.0], [56, 24.0], [60, 14.0]]);
    const fIn = curve([[8, 13.0], [30, 13.0], [50, 14.0], [60, 17.0]]);
    const fOut = curve([[8, 36.0], [20, 37.8], [36, 38.4], [48, 36.0], [56, 30.0], [60, 22.0]]);
    const fender = loftX(stations(8, 60, step), x => {
      const zi = -fIn(x), zo = -fOut(x), yt = fTop(x), ridge = lerp(zi, zo, 0.22);
      return fillet([[zo, 11.0], [zo, yt - 12.0], [ridge, yt], [zi, yt - 1.6], [zi, 11.5]], [0, 1.5, 0.3, 0.4, 0], { seg: 2 });
    });
    parts.push(fender, mirrorZ(fender));

    // ---------- 中段侧舱与后轮罩（前脸竖直，嵌两个金色喷口） ----------
    const rTop = curve([[-62, 24.0], [-56, 28.0], [-40, 31.0], [-24, 31.4], [-16, 31.0]]);
    const rOut = curve([[-62, 33.0], [-56, 37.6], [-40, 38.6], [-24, 38.4], [-16, 37.0]]);
    const pod = loftX(stations(-62, -16, step), x => {
      const zo = -rOut(x), zi = -15.0, yt = rTop(x);
      return fillet([[zo, 11.0], [zo, yt - 2.4], [zo + 3, yt], [zi - 1.5, yt], [zi, yt - 2], [zi, 12]], [0, 1.6, 1.0, 1.0, 0.8, 0], { seg: 2 });
    });
    parts.push(pod, mirrorZ(pod));
    // 腰部（前后轮罩之间、侧管下方）
    parts.push(loftX(stations(-18, 10, step), x => fillet([[-30, 11], [-30, 17], [-10, 21.5], [10, 21.5], [30, 17], [30, 11]], [0, 2, 2, 2, 2, 0], { seg: 2 })));
    // 中央甲板（座舱下与后部）
    parts.push(loftX(stations(-62, 16, step), x => {
      const y = x > -50 ? 25.0 : lerp(21.0, 25.0, smoothstep(-62, -50, x)), w = 14.5;
      return fillet([[-w, 12], [-w, y], [w, y], [w, 12]], [0, 1.2, 1.2, 0], { seg: 2 });
    }));
    // 尾鳍：中央单片竖鳍，向后升起
    const fin = extrude(fillet([[-12, 26.0], [-15, 35.2], [-30, 36.8], [-47.4, 38.6], [-44, 33.0], [-34, 27.5]], [1, 1.5, 3, 0.6, 2, 1], { seg: 3 }), 2.6, { plane: 'xy', bevel: 0.5 });
    parts.push(fin);

    const bodyMesh = new THREE.Mesh(merge(parts), mat);
    bodyMesh.name = 'body-shell';
    body.add(bodyMesh);

    // ---------- 黑灰长座舱 ----------
    const cHalf = curve([[-26, 6.0], [-18, 9.6], [-4, 10.4], [8, 8.6], [15, 5.2], [19, 1.0]]);
    const cTop = curve([[-26, 31.0], [-18, 33.4], [-4, 33.8], [8, 31.8], [15, 29.0], [19, 26.4]]);
    const canopy = loftX(stations(-26, 19, step * 0.8), x => {
      const h = cHalf(x), yt = cTop(x), yb = 24.4, pts = [], n = 16;
      for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; pts.push([-Math.cos(a) * h, yb + Math.max(0.3, yt - yb) * Math.pow(Math.sin(a), 0.6)]); }
      return pts;
    });
    const canopyMesh = new THREE.Mesh(canopy, new THREE.MeshPhysicalMaterial({ color: 0x3a3e46, metalness: 0.5, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }));
    canopyMesh.name = 'canopy'; body.add(canopyMesh);

    // ---------- 红色肋条唇（鼻尖两侧） ----------
    const lips = [];
    for (const s of [-1, 1]) {
      const g = new THREE.CapsuleGeometry(3.0, 7, 6, 16); g.rotateZ(Math.PI / 2); g.rotateY(-s * 0.35); g.translate(50, 12.5, s * 8.0);
      lips.push(g);
    }
    const lipMesh = new THREE.Mesh(merge(lips), stripeMaterial()); lipMesh.name = 'red-lips'; body.add(lipMesh);

    // ---------- 金色双喷口（后轮罩前脸，各两只） ----------
    const nozzles = [];
    for (const s of [-1, 1]) for (const zc of [19.5, 28.0]) {
      nozzles.push(new THREE.CylinderGeometry(3.3, 3.6, 3.0, 24, 1, true).rotateZ(Math.PI / 2).translate(-14.6, 27.4, s * zc));
      nozzles.push(new THREE.TorusGeometry(3.3, 0.55, 8, 24).rotateY(Math.PI / 2).translate(-13.1, 27.4, s * zc));
    }
    const nozMat = new THREE.MeshStandardMaterial({ color: 0xd2a347, metalness: 1, roughness: 0.25, side: THREE.DoubleSide });
    const nm = new THREE.Mesh(merge(nozzles), nozMat); nm.name = 'gold-nozzles'; body.add(nm);
    const cups = [];
    for (const s of [-1, 1]) for (const zc of [19.5, 28.0]) cups.push(new THREE.CircleGeometry(3.0, 20).rotateY(Math.PI / 2).translate(-15.8, 27.4, s * zc));
    const cm = new THREE.Mesh(merge(cups), plastic(0x181512, { rough: 0.6 })); cm.name = 'nozzle-throats'; body.add(cm);
    // 喷口所在的黑色前脸
    const faces = [];
    for (const s of [-1, 1]) faces.push(roundBox(-16.2, -15.6, s > 0 ? 15.5 : -32.5, s > 0 ? 32.5 : -15.5, 22.5, 32.0, 0.3));
    const fm = new THREE.Mesh(merge(faces), plastic(0x2a2b30, { rough: 0.5 })); fm.name = 'nozzle-panels'; body.add(fm);

    // ---------- 侧面灰色分节弯管 ----------
    const hoses = [];
    for (const s of [-1, 1]) {
      const path = new THREE.CatmullRomCurve3([new THREE.Vector3(10, 16, s * 31), new THREE.Vector3(0, 18.5, s * 33.5), new THREE.Vector3(-10, 19.5, s * 33), new THREE.Vector3(-16, 22, s * 30)]);
      hoses.push(sweep(path, t => 2.3 + 0.35 * Math.cos(t * Math.PI * 2 * 7) ** 2, { segments: 70, radial: 12 }));
    }
    const hm = new THREE.Mesh(merge(hoses), new THREE.MeshStandardMaterial({ color: 0x7c8088, metalness: 0.7, roughness: 0.35 })); hm.name = 'side-hoses'; body.add(hm);

    return { body };
  },
};

let stripeTex = null;
function stripeMaterial() {
  if (!stripeTex) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#c4161f'; g.fillRect(0, 0, 64, 16);
    g.fillStyle = '#3a0a0e'; for (let i = 0; i < 8; i++) g.fillRect(i * 8 + 5, 0, 2, 16);
    stripeTex = new THREE.CanvasTexture(c); stripeTex.colorSpace = THREE.SRGBColorSpace; stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  }
  return new THREE.MeshPhysicalMaterial({ map: stripeTex, metalness: 0.4, roughness: 0.3, clearcoat: 1 });
}

function paintLivery(L) {
  // 黑色虎纹（前轮罩刃面）：数道细长后掠锯齿
  const tiger = (c, x0, y0, s) => {
    for (let i = 0; i < 7; i++) {
      const xs = x0 - i * 2.8, ys = y0 + (i % 2 ? 1.6 : -0.6);
      fillPath(c, [[xs, ys], [xs - 10, ys + s * 4.2], [xs - 14, ys + s * 3.4], [xs - 6, ys - s * 0.2], [xs - 3, ys - s * 1.2]], BLACK);
    }
  };
  L.top((c) => {
    for (const s of [-1, 1]) {
      tiger(c, 52, s * 20, s); tiger(c, 44, s * 27, s);
      // 后轮罩红色裂纹
      c.strokeStyle = RED; c.lineWidth = 0.55; c.lineJoin = 'round';
      for (let k = 0; k < 5; k++) {
        c.beginPath(); let x = -20 - k * 7, z = s * (18 + (k % 3) * 6); c.moveTo(x, z);
        for (let j = 0; j < 6; j++) { x -= 2.5 + (j % 2); z += s * ((j % 2 ? 2.4 : -1.6)); c.lineTo(x, z); }
        c.stroke();
      }
    }
    // 毒针中线灰带
    fillPath(c, [[58, -0.8], [58, 0.8], [19, 1.8], [19, -1.8]], '#6e737b');
  });
  L.side((c, s) => {
    tiger(c, 54, 22, 1); tiger(c, 40, 25, 1);
    c.strokeStyle = RED; c.lineWidth = 0.6;
    for (let k = 0; k < 4; k++) { c.beginPath(); let x = -22 - k * 9, y = 29 - (k % 2) * 4; c.moveTo(x, y); for (let j = 0; j < 5; j++) { x -= 2.4; y -= (j % 2 ? -1.8 : 2.6); c.lineTo(x, y); } c.stroke(); }
    text(c, 'R.HIJIKATA', -4, 26.0, { size: 1.5, color: '#2a2b30', dir: [s, 0] });
  });
}
