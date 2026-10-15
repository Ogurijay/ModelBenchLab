// 贸易区市集：喷泉外一圈 12 个摊位（木架 + 条纹布篷 + 货物），以及港口码头上的木箱 / 酒桶堆。
// 全部走 Builder 合并；布篷、水果、布匹、篮子共用一张 canvas 图集 → 一个材质一个批次。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxGeo, cylGeo, gableRoofGeo, gableEndGeo } from '../../core/geom.js';

// ---------- 图集：上半 4 条布篷条纹带，下半 8×4 色块 ----------
const AWNINGS = [
  ['#b8282c', '#f1e6cc'], // 红白
  ['#24489a', '#f1e6cc'], // 蓝白
  ['#2f7a4a', '#efe2c0'], // 绿白
  ['#6a2f86', '#e8b83a'], // 紫金
];
const SWATCH = {
  apple: [0, 0], orange: [1, 0], lemon: [2, 0], pear: [3, 0], grape: [4, 0], wicker: [5, 0], bread: [6, 0], cheese: [7, 0],
  clothRed: [0, 1], clothBlue: [1, 1], clothTeal: [2, 1], clothGold: [3, 1], clothPurple: [4, 1], clothCream: [5, 1], pot: [6, 1], potDark: [7, 1],
  potion: [0, 2], potionG: [1, 2], fish: [2, 2], meat: [3, 2], sack: [4, 2], metal: [5, 2], leather: [6, 2], rope: [7, 2],
};
const SW_COL = {
  apple: '#c8302a', orange: '#ec8a22', lemon: '#f0d040', pear: '#9ac040', grape: '#6a3290', wicker: '#a8783c', bread: '#c88a48', cheese: '#f0c850',
  clothRed: '#a82434', clothBlue: '#2a4a9a', clothTeal: '#2a8a88', clothGold: '#d4a030', clothPurple: '#6a3a8a', clothCream: '#efe4c8', pot: '#b8643a', potDark: '#7a4a32',
  potion: '#3a7ae0', potionG: '#40c070', fish: '#a8b4bc', meat: '#a84a40', sack: '#c8b088', metal: '#8a8e96', leather: '#7a4a28', rope: '#b89a68',
};

function atlasTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // 条纹带：每带 128 px 高，16 条竖纹
  AWNINGS.forEach(([a, b], k) => {
    const y0 = k * 128;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(i * 64, y0, 64, 128);
    }
    // 手绘感：上亮下暗 + 布纹
    const grd = g.createLinearGradient(0, y0, 0, y0 + 128);
    grd.addColorStop(0, 'rgba(255,255,255,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = grd;
    g.fillRect(0, y0, S, 128);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = y0; y < y0 + 128; y += 4) g.fillRect(0, y, S, 1);
  });
  // 色块
  for (const [name, [i, j]] of Object.entries(SWATCH)) {
    const x = i * 128;
    const y = 512 + j * 128;
    g.fillStyle = SW_COL[name];
    g.fillRect(x, y, 128, 128);
    const grd = g.createRadialGradient(x + 44, y + 44, 4, x + 64, y + 64, 90);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = grd;
    g.fillRect(x, y, 128, 128);
    if (name === 'wicker' || name === 'sack' || name === 'rope') {
      g.strokeStyle = 'rgba(60,35,10,0.45)';
      g.lineWidth = 3;
      for (let k = 0; k < 128; k += 12) {
        g.beginPath(); g.moveTo(x, y + k); g.lineTo(x + 128, y + k + 6); g.stroke();
        g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + 6, y + 128); g.stroke();
      }
    }
    if (name.startsWith('cloth')) {
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let k = 0; k < 128; k += 6) g.fillRect(x, y + k, 128, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 把几何原 UV（0..1）压到图集某个矩形里（v 轴：canvas 上方 = v 1）
function remapUV(g, px0, py0, px1, py1) {
  const uv = g.attributes.uv;
  const u0 = px0 / 1024;
  const u1 = px1 / 1024;
  const v0 = 1 - py1 / 1024;
  const v1 = 1 - py0 / 1024;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + (u1 - u0) * THREE.MathUtils.clamp(uv.getX(i), 0, 1), v0 + (v1 - v0) * THREE.MathUtils.clamp(uv.getY(i), 0, 1));
  }
  return g;
}
const swatchUV = (g, name) => {
  const [i, j] = SWATCH[name];
  return remapUV(g, i * 128 + 16, 512 + j * 128 + 16, i * 128 + 112, 512 + j * 128 + 112);
};

// 布篷：带弧度的斜面（沿深度方向分段，中间略下垂），u 沿宽度 → 条纹
function awningGeo(w, d, drop, sag, band, stripes) {
  const g = new THREE.PlaneGeometry(w, d, 1, 6);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getZ(i) + d / 2) / d; // 0 后 → 1 前
    p.setY(i, -drop * t - Math.sin(t * Math.PI) * sag);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (stripes / 16));
  return remapUV(g, 0, band * 128 + 4, 1024, band * 128 + 124);
}
// 前沿的扇贝形垂帘
function valanceGeo(w, h, band, stripes) {
  const shape = new THREE.Shape();
  const n = stripes;
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, -h * 0.6);
  for (let i = n - 1; i >= 0; i--) {
    const xa = -w / 2 + ((i + 1) / n) * w;
    const xb = -w / 2 + (i / n) * w;
    shape.quadraticCurveTo((xa + xb) / 2, -h * 1.25, xb, -h * 0.6);
  }
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape, 4);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, ((p.getX(i) + w / 2) / w) * (stripes / 16), 0.5 + p.getY(i) / h * 0.4);
  return remapUV(g, 0, band * 128 + 4, 1024, band * 128 + 124);
}

export function buildMarket(ctx, group) {
  const C = ctx.coords;
  const rng = ctx.rng('atmo:market');
  const atlasMat = new THREE.MeshStandardMaterial({ map: atlasTexture(), roughness: 0.85, side: THREE.DoubleSide, name: 'atmo-market-atlas' });
  const { planks, timber, iron } = ctx.mat;
  const b = ctx.builder({ parent: group, tag: 'market', chunk: 2000 });

  const [px0, pz0, px1, pz1] = C.DISTRICTS.trade.plaza.rect;
  const [fx, fz] = C.LANDMARKS.fountain.center;
  const R = Math.min(px1 - px0, pz1 - pz0) / 2 - 6; // 广场半深 22 → 半径 16
  const angles = [];
  for (let q = 0; q < 4; q++) for (const off of [-21, 0, 21]) angles.push(THREE.MathUtils.degToRad(45 + q * 90 + off));

  const kinds = ['fruit', 'cloth', 'goods', 'pottery', 'fruit', 'bakery'];
  angles.forEach((a, i) => {
    const x = fx + Math.cos(a) * R;
    const z = fz + Math.sin(a) * R;
    const ry = Math.atan2(-Math.cos(a), -Math.sin(a)); // 本地 +Z 朝喷泉
    const f = b.frame(x, 0, z, ry);
    const band = i % 4;
    stall(f, band, kinds[i % kinds.length]);
  });

  function stall(f, band, kind) {
    const W = 3.4;
    const D = 2.4;
    // 立柱：前低后高
    for (const sx of [-1, 1]) {
      f.box(timber, sx * (W / 2 - 0.08), 0, D / 2 - 0.1, 0.14, 2.45, 0.14);
      f.box(timber, sx * (W / 2 - 0.08), 0, -D / 2 + 0.1, 0.14, 2.95, 0.14);
    }
    // 柜台（有碰撞）+ 台面
    f.box(planks, 0, 0, D / 2 - 0.55, W - 0.3, 0.92, 0.75);
    f.box(timber, 0, 0.92, D / 2 - 0.55, W - 0.15, 0.08, 0.9);
    // 后架两层
    f.box(planks, 0, 0, -D / 2 + 0.3, W - 0.4, 0.08, 0.45, { collide: false });
    f.box(planks, 0, 1.15, -D / 2 + 0.3, W - 0.4, 0.06, 0.45, { collide: false });
    f.collider(0, 0, -D / 2 + 0.3, W - 0.4, 1.3, 0.45);
    f.box(planks, 0, 0, -D / 2 + 0.06, W - 0.3, 1.25, 0.06, { collide: false }); // 背板用浅色木板：夜里月光 / 天光下不至于成纯黑剪影
    // 顶梁
    f.box(timber, 0, 2.38, D / 2 - 0.1, W, 0.1, 0.12, { collide: false });
    f.box(timber, 0, 2.88, -D / 2 + 0.1, W, 0.1, 0.12, { collide: false });
    // 布篷 + 垂帘
    const m = new THREE.Matrix4().makeTranslation(0, 3.0, -0.15);
    f.add(atlasMat, awningGeo(W + 0.5, D + 0.9, 0.62, 0.12, band, 9), m);
    f.add(atlasMat, valanceGeo(W + 0.5, 0.36, band, 9), new THREE.Matrix4().makeTranslation(0, 2.38, D / 2 + 0.3));

    // 前梁下挂一盏小灯笼（夜里由光源池点亮）
    // 灯笼挂在布篷前沿（柜台外侧），夜里正面照亮柜台和货物，不再是纯黑剪影
    const lz = D / 2 + 0.25;
    f.add(iron, new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4), new THREE.Matrix4().makeTranslation(0.9, 2.2, lz));
    f.add(ctx.mat.lampGlow, boxGeo(0.2, 0.28, 0.2), new THREE.Matrix4().makeTranslation(0.9, 1.92, lz));
    f.add(iron, new THREE.ConeGeometry(0.16, 0.12, 4).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(0.9, 2.12, lz));
    const lp = f.toWorld(0.9, 1.9, lz + 0.15);
    ctx.lights.add({ x: lp.x, y: lp.y, z: lp.z, kind: 'candle', nightOnly: true, intensity: 2.2, color: 0xffb860, range: 8, flicker: true, prio: 1.9 });
    // 棚下补光：低强度、无闪烁，照亮摊体本身
    const lc = f.toWorld(0, 2.2, -0.2);
    ctx.lights.add({ x: lc.x, y: lc.y, z: lc.z, kind: 'candle', nightOnly: true, intensity: 1.0, color: 0xffc888, range: 6, flicker: false, prio: 1.3 });

    // 货物：放在台面（y = 1.0）和后架
    const top = 1.0;
    const zc = D / 2 - 0.55;
    const goods = (name, n, r, y, z, spread) => {
      for (let k = 0; k < n; k++) {
        const g = swatchUV(new THREE.SphereGeometry(r * (0.85 + rng() * 0.3), 5, 4), name);
        f.add(atlasMat, g, new THREE.Matrix4().makeTranslation((rng() - 0.5) * spread, y + r * 0.8, z + (rng() - 0.5) * 0.25));
      }
    };
    const basket = (x, z, fruit) => {
      const g = swatchUV(cylGeo(0.26, 0.2, 10, 0.3), 'wicker');
      f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(x, top, z));
      for (let k = 0; k < 7; k++) {
        const a = rng() * Math.PI * 2;
        const rr = rng() * 0.18;
        const s = swatchUV(new THREE.SphereGeometry(0.075, 5, 4), fruit);
        f.add(atlasMat, s, new THREE.Matrix4().makeTranslation(x + Math.cos(a) * rr, top + 0.2 + rng() * 0.07, z + Math.sin(a) * rr));
      }
    };
    const crate = (x, y, z, s, ry = 0) => f.add(planks, boxGeo(s, s * 0.8, s), new THREE.Matrix4().compose(new THREE.Vector3(x, y + s * 0.4, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)));
    const bolt = (x, y, z, name, len = 0.9) => {
      const g = swatchUV(new THREE.CylinderGeometry(0.11, 0.11, len, 10), name).rotateZ(Math.PI / 2);
      f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(x, y + 0.11, z));
    };
    if (kind === 'fruit') {
      const fr = ['apple', 'orange', 'lemon', 'pear', 'grape'];
      [-1.1, -0.4, 0.35, 1.05].forEach((x) => basket(x, zc, fr[Math.floor(rng() * fr.length)]));
      crate(-1.0, 0, D / 2 + 0.45, 0.55, 0.2);
      goods('apple', 6, 0.08, 0.44, D / 2 + 0.45, 0.4);
      for (const x of [-0.9, 0, 0.9]) basket(x, -D / 2 + 0.3, fr[Math.floor(rng() * fr.length)]);
    } else if (kind === 'cloth') {
      const cs = ['clothRed', 'clothBlue', 'clothTeal', 'clothGold', 'clothPurple', 'clothCream'];
      for (let k = 0; k < 6; k++) bolt(-1.1 + (k % 3) * 1.1, top + Math.floor(k / 3) * 0.22, zc - 0.15 + (k % 2) * 0.25, cs[Math.floor(rng() * cs.length)], 0.8);
      for (let k = 0; k < 5; k++) bolt(-1.2 + k * 0.6, 0.08, -D / 2 + 0.3, cs[k % cs.length], 0.5);
      // 挂布：从后梁垂下的布匹
      for (const x of [-1, 0, 1]) {
        const g = swatchUV(new THREE.PlaneGeometry(0.7, 1.4), cs[Math.floor(rng() * cs.length)]);
        f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(x, 2.15, -D / 2 + 0.14));
      }
    } else if (kind === 'pottery') {
      for (let k = 0; k < 5; k++) {
        const r = 0.12 + rng() * 0.08;
        const g = swatchUV(new THREE.LatheGeometry([0, 0.6, 1, 0.95, 0.6, 0.65, 0.7].map((t, j) => new THREE.Vector2(r * t, (j / 6) * r * 3.2)), 9), rng() < 0.5 ? 'pot' : 'potDark');
        f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(-1.2 + k * 0.6, top, zc));
      }
      for (let k = 0; k < 6; k++) {
        const g = swatchUV(cylGeo(0.05, 0.16, 7, 0.03), rng() < 0.5 ? 'potion' : 'potionG');
        f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(-1.2 + k * 0.48, 1.21, -D / 2 + 0.3));
      }
    } else if (kind === 'bakery') {
      for (let k = 0; k < 7; k++) {
        const g = swatchUV(new THREE.SphereGeometry(0.14, 8, 5).scale(1.4, 0.6, 1), 'bread');
        f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(-1.2 + k * 0.4, top + 0.06, zc + (rng() - 0.5) * 0.3));
      }
      for (let k = 0; k < 3; k++) {
        const g = swatchUV(cylGeo(0.18, 0.14, 12), 'cheese');
        f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(-0.8 + k * 0.8, 1.21, -D / 2 + 0.3));
      }
      for (const x of [-1.3, 1.3]) {
        const g = swatchUV(cylGeo(0.25, 0.5, 9, 0.2), 'sack');
        f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(x, 0, D / 2 + 0.4));
      }
    } else {
      // 杂货：木箱、皮革、金属器具
      crate(-0.9, top, zc, 0.45, 0.1);
      crate(0.1, top, zc, 0.38, -0.2);
      const g = swatchUV(new THREE.BoxGeometry(0.5, 0.06, 0.35), 'leather');
      f.add(atlasMat, g, new THREE.Matrix4().makeTranslation(0.95, top + 0.03, zc));
      for (let k = 0; k < 4; k++) f.add(iron, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.9, 1.25 + k * 0.001, -D / 2 + 0.2 + k * 0.08));
      crate(1.2, 0, D / 2 + 0.5, 0.6, 0.3);
      crate(1.2, 0.48, D / 2 + 0.5, 0.45, -0.2);
      for (const x of [-1.0, -0.2]) {
        const s = swatchUV(cylGeo(0.22, 0.45, 9, 0.18), 'sack');
        f.add(atlasMat, s, new THREE.Matrix4().makeTranslation(x, 0.08, -D / 2 + 0.3));
      }
    }
  }

  // ---------- 港口码头：木箱 / 酒桶堆 ----------
  const H = C.DISTRICTS.harbor;
  const hTop = H.top;
  const tunnelX = C.HARBOR_TUNNEL.x;
  const barrelGeo = () => {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector2(0.3 + 0.07 * Math.sin(t * Math.PI), t * 0.9));
    }
    const g = new THREE.LatheGeometry(pts, 12);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 0.9);
    return g;
  };
  const crateAt = (x, y, z, s, ry) => b.box(planks, x, y, z, s, s, s, { ry });
  const barrelAt = (x, y, z) => {
    b.add(timber, barrelGeo(), new THREE.Matrix4().makeTranslation(x, y, z));
    for (const hy of [0.15, 0.75]) b.add(iron, new THREE.CylinderGeometry(0.335, 0.335, 0.05, 12, 1, true), new THREE.Matrix4().makeTranslation(x, y + hy, z));
    b.collider(x, y, z, 0.7, 0.9, 0.7);
  };
  for (const pier of H.piers) {
    for (const side of [-1, 1]) {
      const cx = pier.x + side * (pier.w / 2 + 6 + rng() * 4);
      if (Math.abs(cx - tunnelX) < 18) continue;
      const cz = -292 + rng() * 6;
      // 一堆：2×2 木箱 + 顶上一只 + 几只酒桶
      const ry = (rng() - 0.5) * 0.3;
      crateAt(cx, hTop, cz, 1.1, ry);
      crateAt(cx + 1.2, hTop, cz + 0.1, 1.1, ry + 0.1);
      crateAt(cx + 0.1, hTop, cz - 1.2, 1.0, ry - 0.1);
      crateAt(cx + 0.5, hTop + 1.1, cz - 0.4, 0.9, ry + 0.4);
      for (let k = 0; k < 3; k++) barrelAt(cx - 1.5 - k * 0.8, hTop, cz + (rng() - 0.5) * 0.8);
      barrelAt(cx - 2.0, hTop, cz - 1.3);
    }
  }
  // ---------- 码头仓库（不可进入的实心体块，有碰撞）+ 木吊车 ----------
  const { stoneGrey, plaster, roofBlue, roofRed } = ctx.mat;
  const warehouse = (cx, cz, w, d, wallH, roof) => {
    b.box(stoneGrey, cx, hTop, cz, w, 1.4, d); // 石砌勒脚
    b.box(plaster, cx, hTop + 1.4, cz, w - 0.2, wallH - 1.4, d - 0.2);
    // 半木构：转角立柱 + 腰梁 + 檐口梁
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(timber, cx + sx * (w / 2 - 0.15), hTop + 1.4, cz + sz * (d / 2 - 0.15), 0.4, wallH - 1.4, 0.4, { collide: false });
    for (const y of [hTop + 1.4, hTop + wallH - 0.3]) {
      b.box(timber, cx, y, cz - d / 2 + 0.02, w, 0.3, 0.12, { collide: false });
      b.box(timber, cx, y, cz + d / 2 - 0.02, w, 0.3, 0.12, { collide: false });
    }
    for (let x = -w / 2 + 3.5; x < w / 2 - 2; x += 3.5) {
      for (const sz of [-1, 1]) b.box(timber, cx + x, hTop + 1.4, cz + sz * (d / 2 - 0.02), 0.25, wallH - 1.6, 0.12, { collide: false });
    }
    // 朝海一面的两扇大货门 + 门楣上的吊货梁
    for (const dx of [-w / 4, w / 4]) {
      b.box(planks, cx + dx, hTop, cz - d / 2 - 0.08, 3.4, 4.2, 0.16, { collide: false });
      b.box(timber, cx + dx, hTop + 4.2, cz - d / 2 - 0.15, 3.8, 0.3, 0.3, { collide: false });
      b.box(timber, cx + dx, hTop + wallH + 0.2, cz - d / 2 - 0.9, 0.3, 0.3, 2.0, { collide: false });
    }
    // 坡屋顶（屋脊沿 X）+ 山墙
    const rise = d * 0.42;
    const roofM = new THREE.Matrix4().makeTranslation(cx, hTop + wallH, cz);
    for (const g of gableRoofGeo(w, d, rise, 0.7, 0.3)) b.add(roof, g, roofM);
    for (const sx of [-1, 1]) b.add(plaster, gableEndGeo(d - 0.2, rise - 0.1, 0.3), new THREE.Matrix4().makeTranslation(cx + sx * (w / 2 - 0.25), hTop + wallH, cz));
  };
  warehouse(-205, -280, 24, 12, 7.5, roofBlue);
  warehouse(-20, -280, 22, 11, 7, roofRed);
  warehouse(92, -280, 26, 12, 8, roofBlue);
  // 仓库门口的货堆
  for (const [x, z] of [[-214, -291], [-197, -292], [-27, -291], [-12, -292], [84, -291], [100, -292]]) {
    crateAt(x, hTop, z, 1.2, rng() * 0.4);
    crateAt(x + 1.3, hTop, z + 0.2, 1.0, rng() * 0.4);
    crateAt(x + 0.6, hTop + 1.0, z, 0.9, rng() * 0.6);
    barrelAt(x - 1.4, hTop, z + 0.4);
    barrelAt(x - 1.6, hTop, z - 0.6);
  }

  // 木吊车：立在 -60 号栈桥上，吊臂伸向西侧泊着的船
  {
    const px = -56.5;
    const pz = -318;
    const py = hTop + 0.3; // 栈桥桥面
    b.box(timber, px, py, pz, 3.2, 0.7, 3.2); // 底座
    b.box(stoneGrey, px + 1.2, py + 0.7, pz, 1.4, 1.2, 1.6); // 配重
    b.box(timber, px, py + 0.7, pz, 0.55, 11, 0.55); // 立柱
    for (const sz of [-1, 1]) b.box(timber, px, py + 0.7, pz + sz * 1.2, 0.25, 4.2, 0.25, { rx: -sz * 0.28, collide: false }); // 斜撑
    const ang = 0.44; // 吊臂仰角
    const L = 13;
    const jx = px - (Math.cos(ang) * L) / 2;
    const jy = py + 11.4 + (Math.sin(ang) * L) / 2;
    b.box(timber, jx, jy - 0.2, pz, L, 0.4, 0.4, { rz: -ang, collide: false });
    const tipX = px - Math.cos(ang) * L;
    const tipY = py + 11.4 + Math.sin(ang) * L;
    b.add(iron, new THREE.CylinderGeometry(0.03, 0.03, tipY - (py + 5), 4).translate(tipX, (tipY + py + 5) / 2, pz)); // 吊索
    b.box(planks, tipX, py + 3.6, pz, 1.2, 1.2, 1.2, { collide: false }); // 吊着的货箱
    // 吊臂拉索：立柱顶 → 吊臂尖
    const top = new THREE.Vector3(px, py + 11.7, pz);
    const tip = new THREE.Vector3(tipX, tipY, pz);
    const len = top.distanceTo(tip);
    const rope = new THREE.CylinderGeometry(0.025, 0.025, len, 4);
    rope.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(top).normalize()));
    rope.translate((top.x + tip.x) / 2, (top.y + tip.y) / 2, pz);
    b.add(iron, rope);
  }

  // Builder 按「材质 × 分区」出网格，分区键用 floor(x / chunk)，广场跨原点会被切成 4 块；
  // 这里把同材质的网格再并一次（市集 + 码头道具总共只有几万三角形），每种材质只剩 1 个批次。
  // 市集与港口分开合并（相距 300 m，分开后各自能被视锥剔除）
  const byMat = new Map();
  for (const mesh of b.finish()) {
    mesh.geometry.computeBoundingSphere();
    const key = `${mesh.material.uuid}|${mesh.geometry.boundingSphere.center.z < -200 ? 'harbor' : 'market'}`;
    if (!byMat.has(key)) byMat.set(key, { mat: mesh.material, list: [] });
    byMat.get(key).list.push(mesh);
  }
  const meshes = [];
  for (const { mat, list } of byMat.values()) {
    if (list.length === 1) {
      meshes.push(list[0]);
      continue;
    }
    const merged = mergeGeometries(list.map((m) => m.geometry));
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `atmo-props-${mat.name || mat.uuid.slice(0, 6)}`;
    mesh.castShadow = list[0].castShadow && mat !== ctx.mat.lampGlow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    for (const m of list) {
      group.remove(m);
      m.geometry.dispose();
    }
    group.add(mesh);
    meshes.push(mesh);
  }
  return { meshes };
}
