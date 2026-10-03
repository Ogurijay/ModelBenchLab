// 极速眼镜蛇 Spin Cobra（三国藤吉）— 田宫 ITEM 19450 Premium，Super-II 底盘（白色强化 ABS）
// 依据：官方主图 19450_1（与蜘蛛王/魔鬼司令三张 Super-II 照片联合标定导轮与轮毂，RMS 2.2 px）、包装图与展示会照片。
// 对称三角测量锚点（毫米，+x 车头、+y 上、+z 右）：
//   椭圆头灯中心 (50.3, 17.7, ±20.1)，上沿 (50.1, 25.1)，前下沿 (53.7, 10.2)
//   尾翼双鳍尖 (-63.0, 37.3, ±19.3)，鳍根前端 (-26.1, 33.5, ±16.1)；后罩椭圆进气口中心约 (-18, 25, ±27)
//   中线：鼻前缘 (58.0, 8.3)；SPIN COBRA 铭牌 (56.1, 13.0)；银色鳞甲后端 (23.2, 26.0)
import * as THREE from 'three';
import { loftX, loftZ, fillet, stations, curve, lerp, smoothstep, extrude, merge, mirrorZ, roundBox } from '../geo.js';
import { paintMaterial, fillPath, text, path } from '../paint.js';
import { plastic } from '../mats.js';

const BLUE = 0x1f3fb3, YELLOW = '#f6cb3b', RED = '#e9452d', ORANGE = '#f28a2c';

// 平滑并集（多项式 smooth max）
const smax = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (a - b) / k)); return b + (a - b) * h + k * h * (1 - h); };
// 圆顶函数：中心 c、半宽 w、顶高 h、底高 b
const dome = (z, c, w, h, b) => { const t = (z - c) / w; return t * t >= 1 ? b - 6 : b + (h - b) * Math.pow(1 - t * t, 0.55); };

export default {
  id: 'cobra',
  name: '极速眼镜蛇',
  jp: 'スピンコブラ',
  en: 'SPIN COBRA',
  owner: '三国藤吉',
  kit: 'ITEM 19450 · Premium',
  chassis: 'Super-II',
  refViews: {
    ref: { az: 36.79, el: 19.16, dist: 269.2, fov: 26.12, t: [0, 12, 0], roll: 0.44, shift: [-27.4, 17.4], size: [900, 640] },
  },
  chassisColors: { tub: 0xf1f0ea, tubFinish: 'plain', aParts: 0xaeb3ba, roller: 0xb4b9c0, gearCover: 0x2a62c9, gearCoverMetal: true, stay: 0xaeb3ba, stayMetal: true, bumper: 0xf1f0ea },
  wheels: { tire: 'tread24', design: 'spoke3', color: 0xb98a3a },
  buildBody(ctx) {
    const { livery, step } = ctx;
    paintLivery(livery);
    const mat = paintMaterial({ color: BLUE, livery, metalness: 0.45, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.08, decalMetal: 0.35, decalRough: 0.3 });
    const body = new THREE.Group();
    const parts = [];

    // ---------- 前部整体（鼻 + 两前轮圆罩）：俯视 U 形前缘，截面为中央鳞甲隆起与两侧圆罩的平滑并集 ----------
    const xFront = z => 58 - 0.0118 * z * z;                       // 俯视前缘
    const hC = curve([[14, 24.5], [22, 25.6], [30, 25.0], [40, 22.8], [48, 20.4], [54, 18.0], [58, 15.5]]);
    const hF = curve([[12, 23.0], [20, 28.0], [30, 31.2], [40, 32.0], [48, 30.8], [53, 28.6], [56, 26.0]]);
    const halfW = curve([[12, 34.5], [20, 37.0], [40, 38.0], [44, 37.4], [50, 32.0], [54, 25.5], [57, 15.0], [58, 5.0]]);
    const yBot = curve([[12, 12], [40, 11], [58, 8.4]]);
    const front = loftX(stations(12, 57.9, step), x => {
      const W = halfW(x), b = yBot(x), zs = [];
      for (let i = 0; i <= 24; i++) zs.push(-W + 2 * W * i / 24);
      const top = z => {
        const c = dome(z, 0, 12, hC(x), hC(x) - 3.5), fl = dome(z, -24.5, 14, hF(x), 17), fr = dome(z, 24.5, 14, hF(x), 17);
        return Math.max(b + 1.5, smax(smax(c, fl, 3.0), fr, 3.0));
      };
      return fillet([[-W + 0.3, b], ...zs.map(z => [z, top(z)]), [W - 0.3, b]], [0, 2.0, ...new Array(23).fill(0), 2.0, 0], { seg: 3 });
    });
    parts.push(front);

    // ---------- 中段腰部（座舱两侧，较低）：x -12 → 14 ----------
    const midW = curve([[-14, 33.0], [0, 32.0], [14, 34.5]]);
    const midTop = curve([[-14, 23.0], [0, 22.0], [14, 23.0]]);
    const mid = loftX(stations(-14, 14, step), x => {
      const W = midW(x), y = midTop(x);
      return fillet([[-W, 11.5], [-W, y - 3], [-W + 6, y], [W - 6, y], [W, y - 3], [W, 11.5]], [0, 3, 2, 2, 3, 0], { seg: 3 });
    });
    parts.push(mid);

    // ---------- 后部（两后轮圆罩 + 中央尾部）：x -64 → -10 ----------
    const xRear = z => -63 + 0.006 * z * z;
    const hR = curve([[-63, 21.0], [-58, 25.5], [-50, 29.6], [-38, 31.2], [-26, 30.4], [-16, 27.6], [-10, 24.6]]);
    const hRC = curve([[-63, 20.0], [-50, 24.5], [-36, 26.5], [-20, 25.0], [-10, 23.0]]);
    const rW = curve([[-63.9, 18.0], [-62, 30.0], [-58, 36.0], [-50, 38.0], [-20, 38.0], [-12, 35.0], [-10, 33.6]]);
    const rear = loftX(stations(-63.9, -10, step), x => {
      const W = rW(x), b = 11.0, zs = [];
      for (let i = 0; i <= 24; i++) zs.push(-W + 2 * W * i / 24);
      const top = z => {
        const c = dome(z, 0, 13, hRC(x), hRC(x) - 3), fl = dome(z, -25, 14, hR(x), 17), fr = dome(z, 25, 14, hR(x), 17);
        return Math.max(b + 1.5, smax(smax(c, fl, 3.0), fr, 3.0));
      };
      return fillet([[-W + 0.3, b], ...zs.map(z => [z, top(z)]), [W - 0.3, b]], [0, 2.0, ...new Array(23).fill(0), 2.0, 0], { seg: 3 });
    });
    parts.push(rear);

    const bodyMesh = new THREE.Mesh(merge(parts), mat);
    bodyMesh.name = 'body-shell';
    body.add(bodyMesh);

    // ---------- 座舱罩：大泡形，灰色网纹（贴纸） ----------
    const cHalf = curve([[-40, 6], [-34, 11.5], [-20, 14.5], [-4, 14.5], [8, 12.0], [16, 7.5], [21, 2.0]]);
    const cTop = curve([[-40, 28.0], [-32, 33.0], [-18, 36.4], [-4, 37.0], [8, 35.6], [16, 31.6], [21, 27.4]]);
    const canopy = loftX(stations(-40, 21, step * 0.8), x => {
      const h = cHalf(x), yt = cTop(x), yb = 22.0, pts = [], n = 18;
      for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; pts.push([-Math.cos(a) * h, yb + Math.max(0.3, yt - yb) * Math.pow(Math.sin(a), 0.5)]); }
      return pts;
    });
    const canopyMesh = new THREE.Mesh(canopy, meshMaterial());
    canopyMesh.name = 'canopy'; body.add(canopyMesh);

    // ---------- 后罩椭圆黑色进气口 ----------
    const intakes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.SphereGeometry(1, 24, 12);
      e.scale(9.5, 2.6, 4.0); e.rotateX(s * 0.55); e.translate(-19, 26.6, s * 29.2);
      intakes.push(e);
    }
    const im = new THREE.Mesh(merge(intakes), plastic(0x0b0c10, { rough: 0.6, clearcoat: 0.6 })); im.name = 'rear-intakes'; body.add(im);

    // ---------- 尾翼：两片后掠鳍 + 横向翼板（独立蓝色件） ----------
    const wing = new THREE.Group();
    const wmat = paintMaterial({ color: BLUE, livery: ctx.wingLivery, metalness: 0.45, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.08 });
    const fins = [];
    for (const s of [-1, 1]) {
      const fin = loftX(stations(-64, -24, 2), x => {
        const k = (x + 24) / -40, yTop = lerp(32.5, 37.6, Math.pow(k, 0.8)), yBot = lerp(29.5, 32.0, k), z0 = lerp(16.0, 19.4, k);
        return [[z0 - 1.1, yBot], [z0 - 0.8, yTop], [z0 + 0.8, yTop], [z0 + 1.1, yBot]];
      });
      fins.push(s > 0 ? fin : mirrorZ(fin));
    }
    const plane = loftZ(stations(-17, 17, 2), () => [[-46, 30.2], [-46.5, 31.6], [-60, 33.4], [-60.5, 32.2], [-58, 31.0]]);
    const wm = new THREE.Mesh(merge([...fins, plane]), wmat); wm.name = 'wing-plane'; wing.add(wm);
    return { body, wing };
  },
};

// 座舱罩网纹贴纸：深灰底 + 斜交网格
let meshTex = null;
function meshMaterial() {
  if (!meshTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#4a4e57'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#70757f'; g.lineWidth = 2;
    for (let i = -128; i < 256; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i, 128); g.lineTo(i + 128, 0); g.stroke(); }
    meshTex = new THREE.CanvasTexture(c); meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping; meshTex.repeat.set(6, 3); meshTex.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: meshTex, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.12 });
}

function paintLivery(L) {
  L.top((c) => {
    // 中央银色分节鳞甲（贴纸 2/3）：五节，前窄后宽
    for (let i = 0; i < 5; i++) {
      const x0 = 52 - i * 6.0, x1 = x0 - 5.2, w0 = 5.0 + i * 1.2, w1 = w0 + 1.0;
      fillPath(c, [[x0, -w0], [x0 + 1.4, 0], [x0, w0], [x1, w1], [x1 + 1.4, 0], [x1, -w1]], i % 2 ? '#dfe3e8' : '#b7bec7');
    }
    // 前圆罩火焰（黄红，自前向后上卷）
    for (const s of [-1, 1]) {
      const f = [[54, 15], [46, 18], [44, 13], [36, 17], [34, 12], [26, 16], [22, 13], [16, 18], [24, 24], [20, 30], [30, 27], [34, 34], [40, 28], [48, 32], [50, 26], [56, 26]];
      fillPath(c, f.map(([x, z]) => [x, s * z]), YELLOW);
      const r = [[50, 17.5], [44, 20], [40, 16.5], [32, 20.5], [26, 18.5], [22, 21], [30, 25], [36, 30], [42, 25], [50, 27]];
      fillPath(c, r.map(([x, z]) => [x, s * z]), RED);
      // 后圆罩火焰
      const fr = [[-8, 17], [-16, 21], [-22, 17], [-30, 22], [-38, 18], [-46, 23], [-56, 21], [-48, 29], [-56, 36], [-42, 33], [-34, 37], [-28, 31], [-18, 35], [-12, 28]];
      fillPath(c, fr.map(([x, z]) => [x, s * z]), YELLOW);
      const rr = [[-12, 20], [-20, 23.5], [-30, 25], [-40, 26], [-50, 28], [-40, 30], [-30, 31], [-20, 30]];
      fillPath(c, rr.map(([x, z]) => [x, s * z]), RED);
    }
    // 座舱前缘蓝色眼镜蛇头小标
    text(c, 'M.TOKICHI', 4, 16.5, { dir: [-1, 0], up: [0, 1], size: 1.8, color: '#ffffff' });
  });
  L.side((c, s) => {
    // 侧面火焰延伸
    const f = [[56, 22], [44, 26], [34, 22], [26, 26], [18, 22], [24, 30], [36, 31], [46, 30]];
    fillPath(c, f, YELLOW);
    const fr = [[-12, 22], [-24, 26], [-36, 22], [-48, 27], [-58, 24], [-50, 30], [-36, 31], [-22, 30]];
    fillPath(c, fr, YELLOW);
    fillPath(c, fr.map(([x, y]) => [x - 1, y + 1.2]).slice(0, 5), RED);
  });
  L.front((c) => {
    // 椭圆镀铬头灯（金属调贴纸）：黑框、银色灯碗、内部弧形反光
    for (const s of [-1, 1]) {
      c.save(); c.translate(s * 20.4, 17.6);
      c.beginPath(); c.ellipse(0, 0, 5.6, 8.0, s * 0.12, 0, Math.PI * 2); c.fillStyle = '#0d0e12'; c.fill();
      const g = c.createLinearGradient(-4, 7, 4, -7); g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.5, '#9aa2ad'); g.addColorStop(1, '#e8ecf0');
      c.beginPath(); c.ellipse(0, 0, 4.7, 7.1, s * 0.12, 0, Math.PI * 2); c.fillStyle = g; c.fill();
      c.beginPath(); c.arc(s * -0.6, 2.4, 2.2, 0, Math.PI * 2); c.lineWidth = 0.5; c.strokeStyle = '#3c424b'; c.stroke();
      c.beginPath(); c.moveTo(-3.4, -3.0); c.quadraticCurveTo(0, -5.6, 3.2, -2.2); c.stroke();
      c.restore();
    }
    // SPIN COBRA 铭牌（白字黑底，中央下部）
    fillPath(c, [[-11, 10.6], [11, 10.6], [11, 15.4], [-11, 15.4]], '#0f1c5c');
    text(c, 'SPIN COBRA', 0, 13.0, { dir: [-1, 0], size: 3.6, color: '#ffffff', font: '900 {s}px "Arial Black", sans-serif', stretch: 0.9 });
  });
}
