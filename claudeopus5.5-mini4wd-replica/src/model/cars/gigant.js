// 巨无霸 Brocken Gigant（近藤源）— 田宫 ITEM 19452 Premium，FM-A 底盘（前置马达）
// 依据：官方主图 19452_1（FM-A 导轮/轮毂 + 对称特征联合标定，RMS 1.1 px）、说明书与包装。
// 对称三角测量锚点（毫米，+x 车头、+y 上、+z 右）：
//   车头黄色窄灯 (56.7, 9.3, ±18.4)；侧舱银色铆钉板 (18.4, 19.5, ±25.1)
//   中线：G 徽标 (46.0, 14.3)；车头银色保险杠管 (58.9, 5.7)；马达罩顶 ≈ (43, 28.8)
// 结构特征：轮胎夹在内侧车身与外侧护板之间（顶部外露），两侧银色管架，前部横置肋片马达罩，宽大蓝色多面座舱。
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, curve, lerp, smoothstep, extrude, merge, mirrorZ, roundBox, cyl } from '../geo.js';
import { paintMaterial, fillPath, text } from '../paint.js';
import { plastic } from '../mats.js';

const RED = 0xdc2330, BLACK = '#1b1414', YELLOW = '#f0d64a';

export default {
  id: 'gigant',
  name: '巨无霸',
  jp: 'ブロッケンギガント',
  en: 'BROCKEN GIGANT',
  owner: '近藤源',
  kit: 'ITEM 19452 · Premium',
  chassis: 'FM-A',
  refViews: {
    ref: { az: 37.31, el: 22.89, dist: 280.7, fov: 25.62, t: [0, 12, 0], roll: -3.99, shift: [-34.2, 55.0], size: [900, 640] },
  },
  chassisColors: { tub: 0x232428, tubFinish: 'plain', aParts: 0xe0302f, roller: 0xe8392f, gearCover: 0xe0302f, stay: 0xe0302f, bumper: 0x232428 },
  wheels: { tire: 'low26', design: 'spoke5', color: 0xe3b627 },
  buildBody(ctx) {
    const { livery, step } = ctx;
    paintLivery(livery);
    const mat = paintMaterial({ color: RED, livery, roughness: 0.34, clearcoat: 0.8, decalMetal: 0.2, decalRough: 0.35 });
    const body = new THREE.Group();
    const parts = [];

    // ---------- 车头块：中央低鼻 + 两侧内护翼（车轮内侧），前脸竖直 ----------
    const nose = loftX(stations(28, 60.5, step), x => {
      const k = smoothstep(60.5, 44, x);
      const yc = lerp(11.2, 18.0, smoothstep(50.5, 44.5, x)), ys = lerp(23.0, 28.5, k);       // 中央（低陷，嵌 G 徽标）/ 两侧前块顶（前块高大）
      const zs = 26.5;
      return fillet([[-zs, 5.5], [-zs, ys - 1], [-zs + 4, ys], [-12.5, ys], [-11.5, yc], [11.5, yc], [12.5, ys], [zs - 4, ys], [zs, ys - 1], [zs, 5.5]], [0, 1.2, 1.5, 0.8, 0.8, 0.8, 0.8, 1.5, 1.2, 0], { seg: 2 });
    });
    parts.push(nose);

    // ---------- 侧舱（前轮后方，较低）与后段车身 ----------
    const sideTop = curve([[-64, 22.0], [-56, 25.6], [-40, 27.0], [-24, 26.4], [-12, 24.0], [0, 21.0], [14, 19.6], [28, 20.4]]);
    const sideW = curve([[-64, 22], [-56, 26.0], [-40, 26.5], [-14, 26.0], [0, 27.0], [14, 28.0], [28, 25.0]]);
    const rearBody = loftX(stations(-64, 28, step), x => {
      const W = sideW(x), y = sideTop(x);
      return fillet([[-W, 9.5], [-W, y - 2], [-W + 3, y], [W - 3, y], [W, y - 2], [W, 9.5]], [0, 1.2, 1.2, 1.2, 1.2, 0], { seg: 2 });
    });
    parts.push(rearBody);

    // ---------- 外侧护板（夹住车轮）：前后各一，竖直板 + 顶部内折 ----------
    for (const s of [-1, 1]) for (const xc of [40, -40]) {
      const plate = loftX(stations(xc - 15, xc + 15, 1.5), x => {
        const t = (x - xc) / 15, top = 19.5 - 3.0 * t * t, z0 = 37.0, z1 = 39.0;
        return [[z0, 8.5], [z0, top], [z1, top - 0.6], [z1, 8.5]];
      });
      parts.push(s > 0 ? plate : mirrorZ(plate));
    }

    // ---------- 尾部：低矮红色平尾板（中央开孔）+ 两侧短端板；由银管斜撑（官方主图右后方） ----------
    parts.push(extrude(fillet([[-50, -22], [-50, 22], [-58, 24], [-64, 19], [-64, -19], [-58, -24]], [2, 2, 2, 2, 2, 2], { seg: 2 }), 2.0, { plane: 'xz', bevel: 0.4 }).translate(0, 30.4, 0));
    for (const s of [-1, 1]) parts.push(roundBox(-64, -52, s * 23 - 1.3, s * 23 + 1.3, 22, 32.4, 0.7));

    const bodyMesh = new THREE.Mesh(merge(parts), mat);
    bodyMesh.name = 'body-shell';
    body.add(bodyMesh);

    // ---------- 前置马达罩：纵向半圆筒 + 环形肋片 ----------
    const motorMat = paintMaterial({ color: RED, livery, roughness: 0.3, clearcoat: 0.8, mask: [0, 0, 0] });
    const ribs = [];
    ribs.push(cyl(8.6, 8.6, 18, { axis: 'x', at: [35, 19.5, 0], seg: 32 }));
    for (let i = 0; i < 7; i++) ribs.push(cyl(10.2, 10.2, 1.4, { axis: 'x', at: [27.5 + i * 2.5, 19.5, 0], seg: 32 }));
    const mc = new THREE.Mesh(merge(ribs), motorMat); mc.name = 'motor-cover'; body.add(mc);

    // ---------- 蓝色多面座舱 ----------
    const cab = loftX(stations(-34, 18, 2), x => {
      const k = smoothstep(18, 6, x), kb = smoothstep(-34, -24, x);
      const h = lerp(8, 13.0, Math.min(k, kb + 0.6)), yt = lerp(24, 33.0, Math.min(k, 1)) - (1 - kb) * 4;
      return [[-h, 19], [-h, yt - 5], [-h * 0.55, yt], [h * 0.55, yt], [h, yt - 5], [h, 19]];
    });
    const cabMesh = new THREE.Mesh(cab.toNonIndexed(), new THREE.MeshPhysicalMaterial({ color: 0x2e63d8, metalness: 0.5, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, flatShading: true }));
    cabMesh.geometry.computeVertexNormals();
    cabMesh.name = 'canopy'; body.add(cabMesh);

    // ---------- 银色件：侧管架、车头保险杠管、侧舱铆钉板、车尾天线 ----------
    const silver = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.2 });
    const pipes = [];
    for (const s of [-1, 1]) {
      pipes.push(cyl(1.3, 1.3, 104, { axis: 'x', at: [0, 13.5, s * 40.3], seg: 12 }));
      for (const x of [52, 28, -28, -52]) pipes.push(cyl(1.0, 1.0, 3.0, { axis: 'z', at: [x, 13.5, s * 38.8], seg: 10 }));
      // 尾板银色斜撑管：自车身侧舱升到尾板下方
      const a = new THREE.Vector3(-20, 22.5, s * 14), b = new THREE.Vector3(-52, 30.4, s * 15);
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      const g = new THREE.CylinderGeometry(1.15, 1.15, len, 12);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())); g.translate(mid.x, mid.y, mid.z);
      pipes.push(g);
    }
    pipes.push(cyl(1.3, 1.3, 26, { axis: 'z', at: [61.2, 5.8, 0], seg: 12 }));
    const pm = new THREE.Mesh(merge(pipes), silver); pm.name = 'side-pipes'; body.add(pm);
    const plates = [];
    for (const s of [-1, 1]) plates.push(roundBox(12, 25, s * 25.1 - 6, s * 25.1 + 6, 19.4, 20.4, 0.4));
    const plm = new THREE.Mesh(merge(plates), new THREE.MeshStandardMaterial({ color: 0x8f949b, metalness: 0.8, roughness: 0.35 })); plm.name = 'rivet-plates'; body.add(plm);

    // ---------- G 徽标板（六角形，车头斜面） ----------
    const gPlate = extrude(fillet([[-7.5, -5.5], [7.5, -5.5], [8.8, 0], [7.5, 5.5], [-7.5, 5.5], [-8.8, 0]], 0.8, { seg: 2 }), 1.4, { plane: 'zy', bevel: 0.3 });
    gPlate.rotateZ(0.62); gPlate.translate(47.6, 16.6, 0);
    const gMesh = new THREE.Mesh(gPlate, new THREE.MeshPhysicalMaterial({ map: emblemTexture(), metalness: 0.55, roughness: 0.3, clearcoat: 0.8 })); gMesh.name = 'g-emblem'; body.add(gMesh);

    return { body };
  },
};

function paintLivery(L) {
  // 黑色撕裂爪痕（自前向后的锯齿条），俯视 + 侧视
  // 黑色撕裂虎纹：宽 3–5 mm 的斜向锯齿带（自外缘向内上方撕开）
  const tear = (c, x0, z0, dx, dz, len, w, s) => {
    const n = 7, L = [], R = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + dx * len * t, z = z0 + dz * len * t, ww = w * (1 - 0.85 * t) * (i % 2 ? 0.65 : 1.0);
      L.push([x - dz * ww, s * (z + dx * ww)]); R.push([x + dz * ww, s * (z - dx * ww)]);
    }
    fillPath(c, [...L, ...R.reverse()], BLACK);
  };
  L.top((c) => {
    for (const s of [-1, 1]) {
      // 前块顶面：三道自外侧斜向内后的宽纹
      for (const [x0, w] of [[58, 2.6], [50, 2.4], [42, 2.2]]) tear(c, x0, 27.5, -0.55, -0.83, 16, w, s);
      // 侧舱与后段：长条撕裂纹
      for (const [x0, z0, w] of [[18, 27, 2.4], [4, 26, 2.8], [-12, 26, 2.6], [-28, 26, 2.8], [-44, 25, 2.4]]) tear(c, x0, z0, -0.62, -0.78, 18, w, s);
    }
    // 尾部中央黑条
    fillPath(c, [[-30, -4], [-30, 4], [-64, 6], [-64, -6]], BLACK);
  });
  L.side((c, s) => {
    for (const [x0, y0] of [[60, 9], [50, 9], [24, 10], [8, 10], [-10, 10], [-28, 10], [-46, 10]]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push([x0 - i * 2.2, y0 + i * 2.6 + (i % 2 ? 1.2 : 0)]);
      for (let i = 6; i >= 0; i--) pts.push([x0 - i * 2.2 - 3.2 + i * 0.3, y0 + i * 2.6 - (i % 2 ? 0.8 : 0)]);
      fillPath(c, pts, BLACK);
    }
    text(c, 'K.GEN', -4, 23.0, { size: 1.6, color: '#ffffff', dir: [s, 0] });
  });
  L.front((c) => {
    // 黄色窄灯（车头两侧，黑色眼纹）
    for (const s of [-1, 1]) {
      fillPath(c, [[s * 12.5, 7.4], [s * 24, 7.4], [s * 24, 11.4], [s * 12.5, 11.4]], '#151515');
      fillPath(c, [[s * 13.0, 7.9], [s * 23.5, 7.9], [s * 23.5, 10.9], [s * 13.0, 10.9]], YELLOW);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(s * (15 + i * 3.4), 9.4, 1.1, 0, Math.PI * 2); c.strokeStyle = '#3a2a07'; c.lineWidth = 0.4; c.stroke(); }
    }
  });
}

// G 徽标贴图（金色底、黑色粗体 G、白色 BROCKEN）
let emblemTex = null;
function emblemTexture() {
  if (emblemTex) return emblemTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#f1d27a'); gr.addColorStop(1, '#b88a2f');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#141414'; g.font = '900 120px "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('G', 128, 66);
  g.fillStyle = '#141414'; g.fillRect(0, 118, 256, 42);
  g.fillStyle = '#ffffff'; g.font = '900 30px "Arial Black", sans-serif'; g.fillText('BROCKEN', 128, 140);
  emblemTex = new THREE.CanvasTexture(c); emblemTex.colorSpace = THREE.SRGBColorSpace;
  // 挤出件的 UV 即形状坐标（毫米）：映射到 [0,1]，并水平翻转使正面文字不镜像
  emblemTex.repeat.set(-1 / 17.6, 1 / 11); emblemTex.offset.set(0.5, 0.5);
  return emblemTex;
}
