// 英雄谷雕像：8 尊程序化英雄像（约 12 m）。
// 造型靠「放样管」（沿路径的椭圆截面环 + 每环形状函数）做躯干 / 四肢 / 袍摆 / 头盔，
// 披风是自定义的外撇锥形曲面（带褶皱，双面）；肩甲为三层外扩甲片。只返回几何，由 Builder 合并。
// 人像局部坐标：脚底 y=0（底座顶面），面朝 +Z，x>0 为人像左手侧。每尊三角形约 6–10k。
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = v(0, 1, 0);

// ---------- 基础几何 ----------
// 放样管：pts = [{ p, rx, rz?, f?(θ) }]，截面椭圆 rx 沿 a 轴、rz 沿 b 轴（b ≈ hint 方向）
function tube(pts, { seg = 16, hint = v(0, 0, 1), caps = true } = {}) {
  const n = pts.length;
  const pos = [];
  const idx = [];
  const frames = pts.map((q, i) => {
    const t = new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)].p, pts[Math.max(0, i - 1)].p).normalize();
    let a = new THREE.Vector3().crossVectors(t, hint);
    if (a.lengthSq() < 1e-4) a = new THREE.Vector3().crossVectors(t, v(1, 0, 0));
    a.normalize();
    const b = new THREE.Vector3().crossVectors(a, t).normalize();
    return { a, b, t };
  });
  for (let i = 0; i < n; i++) {
    const { p, rx, rz = rx, f } = pts[i];
    const { a, b } = frames[i];
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const k = f ? f(th) : 1;
      const c = Math.cos(th) * rx * k;
      const s = Math.sin(th) * rz * k;
      pos.push(p.x + a.x * c + b.x * s, p.y + a.y * c + b.y * s, p.z + a.z * c + b.z * s);
    }
  }
  const R = seg + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const v00 = i * R + j;
      const v10 = (i + 1) * R + j;
      const v01 = i * R + j + 1;
      const v11 = (i + 1) * R + j + 1;
      idx.push(v00, v10, v01, v01, v10, v11);
    }
  }
  if (caps) {
    for (const [ri, top] of [[0, false], [n - 1, true]]) {
      const c = pos.length / 3;
      pos.push(pts[ri].p.x, pts[ri].p.y, pts[ri].p.z);
      for (let j = 0; j < seg; j++) {
        const a = ri * R + j;
        const b = ri * R + j + 1;
        if (top) idx.push(c, b, a);
        else idx.push(c, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 竖直放样（躯干、袍摆）：rings = [[y, rx, rz, cz?], ...]
const vtube = (rings, f, seg = 20, x = 0) => tube(rings.map(([y, rx, rz, cz = 0]) => ({ p: v(x, y, cz), rx, rz, f })), { seg });

// 外撇锥形披风：φ = π 为正后方，自肩到脚，半径随高度外扩，带竖向褶皱；外壁 + 内壁
function capeGeo({ yTop = 8.95, yBot = 0.25, rTop = 1.35, rBot = 2.75, halfTop = 1.8, halfBot = 1.55, cz = -0.25, sz = 0.9, folds = 7, rows = 16, cols = 44 }) {
  const out = [];
  for (const inner of [false, true]) {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const y = yTop - (yTop - yBot) * t;
      const half = halfTop + (halfBot - halfTop) * t;
      const r0 = rTop + (rBot - rTop) * Math.pow(t, 0.8);
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const ph = Math.PI - half + 2 * half * u;
        const edge = Math.abs(u - 0.5) * 2;
        let r = r0 * (1 + (0.04 + 0.13 * t) * Math.sin(folds * ph * 2)) - (inner ? 0.1 : 0);
        r *= 1 - 0.06 * edge * edge * (1 - t); // 肩部收拢
        const yy = y + 0.45 * t * edge * edge + 0.22 * t * t * Math.sin(folds * ph * 2 + 1.2); // 下摆两侧略提 + 波浪
        pos.push(r * Math.sin(ph), yy, cz + r * Math.cos(ph) * sz);
      }
    }
    const C = cols + 1;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = i * C + j;
        const b = (i + 1) * C + j;
        if (inner) idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

function kit() {
  const parts = [];
  const k = {
    parts,
    push: (g) => parts.push(g),
    // 两点间的锥台
    limb(a, b, r0, r1 = r0, seg = 12) {
      k.push(tube([{ p: a, rx: r0 }, { p: b, rx: r1 }], { seg }));
    },
    // 折线放样：[[x,y,z,r], ...]
    path(list, seg = 12, flat = 1) {
      k.push(tube(list.map(([x, y, z, r]) => ({ p: v(x, y, z), rx: r, rz: r * flat })), { seg }));
    },
    cone(a, b, r, seg = 10) {
      k.push(tube([{ p: a, rx: r }, { p: b, rx: 0.001 }], { seg }));
    },
    ball(c, r, sx = 1, sy = 1, sz = 1, seg = 16) {
      const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7)));
      g.scale(sx, sy, sz).translate(c.x, c.y, c.z);
      k.push(g);
    },
    box(w, h, d, c, rx = 0, ry = 0, rz = 0) {
      const g = new THREE.BoxGeometry(w, h, d);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
      g.translate(c.x, c.y, c.z);
      k.push(g);
    },
    // 平板（XY 平面，厚 t，带圆角倒边）
    plate(pts, t, m, bevel = 0.06) {
      const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
      g.translate(0, 0, -t / 2);
      if (m) g.applyMatrix4(m);
      k.push(g);
    },
    // 球壳片（外壁 + 内壁），θ 自顶向下，φ 绕竖轴
    shell(c, r, sc, th0, th1, ph0, phl, rotZ = 0, seg = 20) {
      for (const inner of [false, true]) {
        const g = new THREE.SphereGeometry(inner ? r * 0.9 : r, seg, 6, ph0, phl, th0, th1 - th0);
        if (inner) {
          const ix = g.index.array;
          for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
          const nn = g.attributes.normal.array;
          for (let i = 0; i < nn.length; i++) nn[i] = -nn[i];
        }
        g.scale(...sc).rotateZ(rotZ).translate(c.x, c.y, c.z);
        k.push(g);
      }
    },
    torus(R, r, c, rot = [0, 0, 0], arc = Math.PI * 2, seg = 28) {
      const g = new THREE.TorusGeometry(R, r, 8, seg, arc);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)));
      g.translate(c.x, c.y, c.z);
      k.push(g);
    },
  };
  return k;
}

const M4 = (p, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v(1, 1, 1));

// ---------- 身体 ----------
// 胸甲前凸 + 背部略平
const chestF = (th) => 1 + 0.1 * Math.max(0, Math.sin(th)) - 0.04 * Math.max(0, -Math.sin(th));
const pleat = (n, a) => (th) => 1 + a * Math.sin(n * th);

function torso(k, o) {
  const sl = o.slim || 1;
  const w = o.armor ? 1 : 0.94;
  k.push(vtube([
    [5.45, 1.05 * sl, 0.78],
    [6.2, 1.08 * sl, 0.8],
    [7.1, 1.3 * w * sl, 0.9, 0.04],
    [7.95, 1.5 * w * sl, 0.96, 0.06],
    [8.55, 1.48 * w * sl, 0.86, 0.02],
    [8.95, 1.05 * sl, 0.7],
    [9.1, 0.5, 0.45],
  ], chestF));
  // 腰带 + 带扣
  k.push(vtube([[5.45, 1.13 * sl, 0.85], [5.6, 1.17 * sl, 0.88], [5.95, 1.17 * sl, 0.88], [6.1, 1.1 * sl, 0.82]], null, 22));
  k.box(0.6, 0.5, 0.2, v(0, 5.52, 0.9));
  if (o.armor) {
    // 胸甲中脊 + 腹甲分节
    k.box(0.14, 1.9, 0.16, v(0, 7.5, 1.0), 0.12);
    for (const y of [6.35, 6.75]) k.push(vtube([[y, 1.12 * sl, 0.84], [y + 0.12, 1.15 * sl, 0.86], [y + 0.24, 1.12 * sl, 0.84]], chestF, 20));
  }
}

function legs(k, o) {
  const sl = o.slim || 1;
  for (const s of [-1, 1]) {
    const st = o.stance || 0;
    k.path([[s * 0.6 * sl, 5.6, 0, 0.66], [s * (0.66 * sl + st * 0.3), 4.3, 0.06, 0.55], [s * (0.72 * sl + st * 0.55), 3.1, 0.14, 0.42], [s * (0.76 * sl + st * 0.75), 2.2, 0.1, 0.46], [s * (0.78 * sl + st), 0.75, 0.04, 0.31]], 14);
    // 护膝
    k.ball(v(s * (0.72 * sl + st * 0.55), 3.15, 0.38), 0.38, 1.0, 1.15, 0.7, 12);
    // 战靴：靴筒 + 靴面
    const fx = s * (0.8 * sl + st);
    k.path([[fx - s * 0.03, 1.6, 0.04, 0.42], [fx, 0.55, 0.08, 0.46], [fx, 0.3, 0.3, 0.44], [fx + s * 0.02, 0.24, 0.95, 0.28]], 14, 0.75);
    k.box(0.9, 0.24, 1.7, v(fx, 0.12, 0.38));
  }
  // 甲裙（前后开衩的锥形）
  k.push(vtube([[5.95, 1.18 * sl, 0.88], [5.0, 1.38 * sl, 1.02], [3.85, 1.58 * sl, 1.2]], pleat(8, 0.04), 24));
}

function robe(k, o) {
  const sl = o.slim || 1;
  k.push(vtube([
    [0.05, 2.05 * sl, 1.75],
    [0.35, 2.0 * sl, 1.7],
    [1.6, 1.72 * sl, 1.4],
    [3.6, 1.38 * sl, 1.12],
    [5.0, 1.18 * sl, 0.95],
    [5.95, 1.1 * sl, 0.86],
  ], pleat(11, 0.05), 32));
  k.push(vtube([[0.0, 2.12 * sl, 1.82], [0.3, 2.12 * sl, 1.82]], pleat(11, 0.05), 32)); // 袍摆滚边
  for (const s of [-1, 1]) k.box(0.9, 0.22, 1.3, v(s * 0.7, 0.11, 1.3)); // 露出的鞋尖
}

// 三层外扩肩甲
function pauldrons(k, sc = 1, sl = 1) {
  // 三片叠瓦板甲：每片是实心的外撇钟形（尖锐下缘），自上而下、自内而外错开，整体绕肩点向外下倾
  const bells = [
    // [x 外移, y, 截面环 [[dy, r], ...]]
    [0.0, 8.8, [[0.42, 0.2], [0.3, 0.7], [0.02, 0.98], [-0.1, 1.02], [-0.16, 0.9]]],
    [0.16, 8.5, [[0.1, 0.85], [-0.22, 1.1], [-0.34, 1.14], [-0.4, 1.0]]],
    [0.3, 8.18, [[0.1, 0.85], [-0.24, 1.18], [-0.36, 1.22], [-0.42, 1.06]]],
  ];
  for (const s of [-1, 1]) {
    const x = s * 1.55 * sl;
    const piv = v(x, 8.6, 0);
    const rot = new THREE.Matrix4().makeRotationZ(-s * 0.3);
    for (const [dx, y, rings] of bells) {
      const pts = rings.map(([dy, r]) => ({ p: v(x + s * dx * sc, y + dy * sc, 0), rx: r * sc * 1.12, rz: r * sc * 1.02 }));
      const g = tube(pts, { seg: 20 });
      g.translate(-piv.x, -piv.y, -piv.z).applyMatrix4(rot).translate(piv.x, piv.y, piv.z);
      k.push(g);
    }
    k.ball(v(x + s * 0.05, 9.28, 0), 0.3 * sc, 1, 0.8, 1, 10); // 护肩立领
  }
}

// 布质披肩（法袍类）
function mantle(k, sl = 1) {
  k.push(vtube([[7.6, 1.85 * sl, 1.15], [8.4, 1.75 * sl, 1.08], [8.9, 1.45 * sl, 0.95], [9.15, 0.75, 0.6]], pleat(9, 0.05), 28));
}

// 护颈（所有头盔都带）
function gorget(k) {
  k.push(vtube([[8.8, 0.9, 0.72], [9.1, 0.7, 0.6], [9.45, 0.52, 0.5]], null, 18));
}

function head(k, z = 0.08) {
  k.ball(v(0, 10.15, z), 0.6, 1, 1.15, 1.05, 18);
  k.box(0.18, 0.4, 0.28, v(0, 10.05, z + 0.62), -0.2); // 鼻
  k.ball(v(0, 9.72, z + 0.32), 0.38, 1.1, 0.7, 0.9, 12); // 下颌
}

// 手臂：肩 → 肘 → 腕 → 拳；带护臂外撇
function arm(k, s, elbow, hand, { sl = 1, plate = true } = {}) {
  const sh = v(s * 1.6 * sl, 8.45, 0);
  const wrist = elbow.clone().lerp(hand, 0.82);
  k.push(tube([{ p: sh, rx: 0.54 }, { p: sh.clone().lerp(elbow, 0.45), rx: 0.46 }, { p: elbow, rx: 0.36 }], { seg: 14 }));
  k.ball(elbow, plate ? 0.42 : 0.37, 1, 1, 1, 12);
  k.push(tube([{ p: elbow, rx: 0.36 }, { p: elbow.clone().lerp(wrist, 0.35), rx: 0.38 }, { p: wrist, rx: 0.25 }], { seg: 14 }));
  if (plate) k.push(tube([{ p: elbow.clone().lerp(wrist, 0.6), rx: 0.36 }, { p: wrist, rx: 0.44 }, { p: wrist.clone().lerp(hand, 0.4), rx: 0.46 }], { seg: 14 })); // 护手外撇
  k.ball(hand, 0.4, 1, 1.05, 1.1, 12);
}

// ---------- 头盔 ----------
const helms = {
  great(k, crest = true) {
    k.push(vtube([[9.35, 0.66, 0.72, 0.06], [9.55, 0.82, 0.88, 0.06], [9.75, 0.76, 0.82, 0.06], [10.6, 0.76, 0.82, 0.06], [10.95, 0.66, 0.72, 0.04], [11.2, 0.4, 0.45, 0.02], [11.32, 0.05, 0.05, 0]], null, 20));
    k.box(1.25, 0.14, 0.22, v(0, 10.25, 0.86)); // 目缝上缘
    k.box(0.16, 0.95, 0.2, v(0, 9.95, 0.88)); // 护鼻条
    if (crest) k.path([[0, 11.2, 0.55, 0.2], [0, 11.6, 0.1, 0.28], [0, 11.55, -0.6, 0.24], [0, 11.0, -1.15, 0.12]], 10, 0.6);
  },
  hood(k) {
    k.push(vtube([[9.15, 1.0, 0.95, -0.1], [9.9, 0.88, 0.88, -0.08], [10.6, 0.78, 0.82, -0.12], [11.05, 0.5, 0.6, -0.3], [11.25, 0.12, 0.16, -0.65]], (th) => 1 - 0.18 * Math.max(0, Math.sin(th)) ** 3, 20));
  },
  crown(k) {
    k.push(vtube([[10.55, 0.68, 0.72, 0.06], [10.62, 0.72, 0.76, 0.06], [10.95, 0.75, 0.79, 0.06], [11.02, 0.7, 0.74, 0.06]], null, 24));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = v(Math.sin(a) * 0.72, 10.95, 0.06 + Math.cos(a) * 0.76);
      k.cone(p, v(p.x * 1.08, 11.5 + (i % 2) * 0.25, 0.06 + (p.z - 0.06) * 1.08), 0.14, 6);
    }
  },
  horned(k) {
    k.push(vtube([[9.85, 0.78, 0.82, 0.02], [10.05, 0.8, 0.84, 0.02], [10.55, 0.75, 0.8], [10.95, 0.5, 0.55], [11.08, 0.05, 0.05]], null, 20));
    k.box(0.15, 0.55, 0.22, v(0, 9.85, 0.84)); // 护鼻
    for (const s of [-1, 1]) {
      k.push(tube([
        { p: v(s * 0.65, 10.5, 0), rx: 0.26 },
        { p: v(s * 1.15, 10.75, 0.05), rx: 0.22 },
        { p: v(s * 1.5, 11.25, 0.15), rx: 0.16 },
        { p: v(s * 1.55, 11.85, 0.3), rx: 0.09 },
        { p: v(s * 1.4, 12.2, 0.4), rx: 0.02 },
      ], { seg: 10 }));
    }
  },
  winged(k) {
    k.push(vtube([[9.85, 0.76, 0.82, 0.02], [10.6, 0.75, 0.8], [11.0, 0.45, 0.5], [11.1, 0.05, 0.05]], null, 20));
    k.box(0.15, 0.55, 0.22, v(0, 9.85, 0.84));
    const feather = [[0, 0], [0.5, 0.15], [1.25, 0.9], [1.5, 1.75], [1.0, 1.3], [0.8, 1.55], [0.55, 1.05], [0.3, 1.1], [0.15, 0.6]];
    for (const s of [-1, 1]) {
      k.plate(feather.map(([x, y]) => [x * s, y]), 0.08, M4(v(s * 0.7, 10.35, -0.1), 0, s * 0.5, 0), 0.03);
    }
  },
  mitre(k) {
    k.push(vtube([[10.4, 0.66, 0.68], [11.0, 0.74, 0.62], [11.7, 0.62, 0.42], [12.35, 0.25, 0.16], [12.5, 0.02, 0.02]], null, 20));
    k.box(0.14, 2.0, 0.12, v(0, 10.45, 0.66), -0.12);
    k.push(vtube([[10.45, 0.7, 0.72], [10.6, 0.72, 0.74]], null, 20));
  },
  elf(k) {
    k.push(vtube([[9.7, 0.66, 0.66, -0.12], [10.3, 0.7, 0.72, -0.1], [10.75, 0.55, 0.6, -0.12], [10.9, 0.1, 0.1, -0.15]], (th) => 1 - 0.12 * Math.max(0, Math.sin(th)) ** 4, 18));
    k.path([[0, 10.3, -0.6, 0.32], [0, 9.6, -0.95, 0.3], [0, 8.4, -1.05, 0.24], [0, 7.3, -0.95, 0.08]], 10); // 长马尾
    for (const s of [-1, 1]) k.cone(v(s * 0.55, 10.2, 0.05), v(s * 1.2, 10.7, -0.2), 0.13, 6); // 尖耳
  },
};

// 头部（含头盔）以颈根为轴放大 15%：远看比例更"英雄"
function bigHead(k, fn, f = 1.15) {
  const n0 = k.parts.length;
  fn();
  for (let i = n0; i < k.parts.length; i++) k.parts[i].translate(0, -9.4, -0.05).scale(f, f, f).translate(0, 9.4, 0.05);
}

// ---------- 兵器 ----------
function sword(k, grip, dir, len, { guard = 1.15, wide = 0.3 } = {}) {
  const d = dir.clone().normalize();
  const g0 = grip.clone().addScaledVector(d, 0.55);
  const tip = grip.clone().addScaledVector(d, 0.55 + len);
  const pommel = grip.clone().addScaledVector(d, -0.75);
  k.limb(pommel, g0, 0.14, 0.14, 8);
  k.ball(pommel, 0.27, 1, 1, 1, 10);
  let side = new THREE.Vector3().crossVectors(d, v(0, 0, 1));
  if (side.lengthSq() < 1e-3) side = v(1, 0, 0);
  side.normalize();
  k.path([[...g0.clone().addScaledVector(side, -guard).toArray(), 0.12], [...g0.toArray(), 0.2], [...g0.clone().addScaledVector(side, guard).toArray(), 0.12]], 8);
  // 剑身：菱形截面，近尖收窄
  const nrm = new THREE.Vector3().crossVectors(d, side).normalize();
  const pts = [0, 0.55, 0.85, 1].map((t) => ({ p: g0.clone().lerp(tip, t), rx: t === 1 ? 0.01 : wide * (1 - 0.25 * t), rz: 0.07 }));
  k.push(tube(pts, { seg: 4, hint: nrm }));
}

// ---------- 8 种英雄 ----------
const HEROES = [
  // 0 骑士：双手拄剑，剑尖立地，长披风
  (k) => {
    legs(k, {}); torso(k, { armor: true }); pauldrons(k, 1.12); gorget(k); bigHead(k, () => { head(k); helms.great(k); });
    k.push(...capeGeo({}));
    arm(k, 1, v(1.45, 7.05, 0.85), v(0.38, 6.85, 1.55));
    arm(k, -1, v(-1.45, 7.05, 0.85), v(-0.38, 6.85, 1.55));
    sword(k, v(0, 6.85, 1.62), v(0, -1, 0.03), 5.75, { guard: 1.3, wide: 0.34 });
  },
  // 1 大法师：兜帽长袍，右手新月长杖，左手托起法球
  (k) => {
    robe(k, {}); torso(k, {}); mantle(k); bigHead(k, () => { head(k, 0.12); helms.hood(k); });
    k.push(tube([{ p: v(0, 9.65, 0.55), rx: 0.55, rz: 0.3 }, { p: v(0, 8.7, 0.85), rx: 0.5, rz: 0.28 }, { p: v(0, 7.6, 0.95), rx: 0.3, rz: 0.18 }, { p: v(0, 6.9, 0.9), rx: 0.04 }], { seg: 12 })); // 长须
    k.push(...capeGeo({ rBot: 2.6, halfBot: 1.6, folds: 9 }));
    arm(k, -1, v(-2.0, 7.3, 0.25), v(-2.05, 7.75, 0.95), { plate: false });
    k.limb(v(-2.05, 0.1, 1.0), v(-2.05, 13.0, 1.0), 0.15, 0.12, 10);
    k.torus(0.85, 0.12, v(-2.05, 13.75, 1.0), [0, 0, Math.PI * 0.825], Math.PI * 1.35, 20); // 新月
    k.ball(v(-2.05, 13.6, 1.0), 0.42, 1, 1, 1, 14);
    arm(k, 1, v(1.75, 7.6, 1.0), v(1.3, 9.1, 1.85), { plate: false });
    k.ball(v(1.3, 9.75, 1.95), 0.55, 1, 1, 1, 16);
    k.torus(0.75, 0.06, v(1.3, 9.75, 1.95), [0.6, 0.3, 0], Math.PI * 2, 24); // 法球环
  },
  // 2 圣骑士：右手高举战锤，左臂鸢盾，盔顶冠饰
  (k) => {
    legs(k, {}); torso(k, { armor: true }); pauldrons(k, 1.3); gorget(k); bigHead(k, () => { head(k); helms.great(k); });
    k.push(...capeGeo({ rBot: 2.5, halfBot: 1.35 }));
    arm(k, -1, v(-2.1, 10.15, 0.15), v(-1.7, 11.95, 0.4));
    k.limb(v(-1.7, 10.4, 0.4), v(-1.7, 14.6, 0.4), 0.15, 0.15, 10);
    k.box(2.1, 1.15, 1.15, v(-1.7, 14.7, 0.4));
    k.box(2.3, 0.3, 1.3, v(-1.7, 14.7, 0.4));
    k.cone(v(-1.7, 15.25, 0.4), v(-1.7, 16.0, 0.4), 0.3, 6);
    arm(k, 1, v(1.9, 7.0, 0.85), v(1.1, 7.05, 1.65));
    const kite = [[-1.3, 1.6], [1.3, 1.6], [1.25, 0.2], [0, -2.4], [-1.25, 0.2]];
    k.plate(kite, 0.22, M4(v(1.0, 7.0, 2.1), -0.06, 0.28, 0), 0.1);
    k.plate([[-0.18, 1.3], [0.18, 1.3], [0.18, -1.9], [-0.18, -1.9]], 0.06, M4(v(1.03, 7.0, 2.27), -0.06, 0.28, 0), 0.03); // 盾面十字
    k.plate([[-1.0, 0.45], [1.0, 0.45], [1.0, 0.1], [-1.0, 0.1]], 0.06, M4(v(1.03, 7.0, 2.27), -0.06, 0.28, 0), 0.03);
  },
  // 3 矮人：粗短身形、编结大胡子、弯角盔、双手斜握战斧（整体压扁加宽）
  (k) => {
    legs(k, {}); torso(k, { armor: true }); pauldrons(k, 1.35); gorget(k); bigHead(k, () => { head(k); helms.horned(k); });
    k.push(new THREE.CylinderGeometry(1.5, 1.5, 0.25, 24).rotateX(Math.PI / 2).translate(0, 7.3, -1.2)); // 背负圆盾
    k.push(tube([{ p: v(0, 9.75, 0.5), rx: 0.68, rz: 0.36 }, { p: v(0, 8.9, 0.86), rx: 0.82, rz: 0.4 }, { p: v(0, 7.8, 1.0), rx: 0.66, rz: 0.34 }, { p: v(0, 6.9, 0.98), rx: 0.32, rz: 0.2 }, { p: v(0, 6.4, 0.9), rx: 0.06 }], { seg: 14 }));
    for (const s of [-1, 1]) k.path([[s * 0.15, 9.85, 0.78, 0.17], [s * 0.6, 9.75, 0.75, 0.15], [s * 0.85, 9.35, 0.7, 0.08]], 8); // 八字胡
    arm(k, -1, v(-1.75, 6.6, 0.85), v(-0.95, 5.7, 1.65));
    arm(k, 1, v(1.8, 7.4, 0.85), v(1.05, 7.6, 1.7));
    const a = v(-1.95, 4.2, 1.75);
    const b = v(2.7, 9.7, 1.65);
    k.limb(a, b, 0.16, 0.16, 10);
    k.ball(a, 0.24, 1, 1, 1, 8);
    const hd = b.clone().lerp(a, 0.1);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    for (const s of [-1, 1]) {
      k.plate([[0, -0.35], [0.7, -0.55], [1.15, -1.0], [1.4, 0], [1.15, 1.0], [0.7, 0.55], [0, 0.35]], 0.12, M4(hd, 0, 0, ang + (s > 0 ? 0 : Math.PI)), 0.05);
    }
    k.cone(b, b.clone().add(v(0.4, 0.48, 0)), 0.16, 6);
  },
  // 4 游侠：兜帽长发，左手前伸持弓、右手拉弦到腮边，背负箭袋
  (k) => {
    legs(k, { slim: 0.9 }); torso(k, { slim: 0.9 }); gorget(k); bigHead(k, () => { head(k); helms.elf(k); });
    pauldrons(k, 0.75, 0.9);
    k.push(...capeGeo({ rTop: 1.25, rBot: 2.0, halfBot: 1.5, yBot: 4.4, folds: 6 }));
    const grip = v(1.1, 9.15, 3.0);
    const draw = v(-0.4, 9.5, 0.9);
    arm(k, 1, v(1.5, 8.85, 1.5), grip, { sl: 0.9, plate: false });
    arm(k, -1, v(-1.85, 9.0, 0.35), draw, { sl: 0.9, plate: false });
    const R = 3.0;
    const A = 1.15;
    const d = v(grip.x - draw.x, 0, grip.z - draw.z).normalize();
    const c = grip.clone().addScaledVector(d, -R);
    const bowG = new THREE.TorusGeometry(R, 0.13, 8, 24, 2 * A);
    bowG.rotateZ(-A).rotateY(Math.atan2(-d.z, d.x)).translate(c.x, c.y, c.z);
    k.push(bowG);
    const top = c.clone().addScaledVector(d, R * Math.cos(A)).add(v(0, R * Math.sin(A), 0));
    const bot = c.clone().addScaledVector(d, R * Math.cos(A)).add(v(0, -R * Math.sin(A), 0));
    k.limb(top, draw, 0.04, 0.04, 4);
    k.limb(bot, draw, 0.04, 0.04, 4);
    const tipA = grip.clone().lerp(draw, -0.28);
    k.limb(draw, tipA, 0.06, 0.06, 6);
    k.cone(tipA, tipA.clone().addScaledVector(d, 0.5), 0.12, 4);
    k.path([[-0.75, 6.4, -1.15, 0.36], [-0.95, 8.9, -1.0, 0.4]], 10); // 箭袋
    for (let i = 0; i < 4; i++) k.limb(v(-0.95 + i * 0.12 - 0.18, 8.9, -1.0), v(-1.1 + i * 0.15 - 0.2, 9.9, -1.05), 0.05, 0.05, 4);
  },
  // 5 国王：右手高举长剑，左手按剑柄于腰，王冠、长披风
  (k) => {
    legs(k, {}); torso(k, { armor: true }); pauldrons(k, 1.2); gorget(k); bigHead(k, () => { head(k); helms.crown(k); });
    k.ball(v(0, 9.62, 0.45), 0.5, 1.05, 0.75, 0.6, 12); // 短须
    k.push(...capeGeo({ rBot: 3.0, halfBot: 1.7, yBot: 0.05, folds: 8 }));
    k.push(vtube([[8.35, 1.9, 1.2], [8.75, 1.85, 1.18], [9.1, 1.4, 1.0], [9.25, 0.8, 0.7]], pleat(14, 0.07), 32)); // 毛皮披肩
    arm(k, -1, v(-2.0, 10.25, 0.5), v(-1.35, 12.0, 0.95));
    sword(k, v(-1.35, 12.0, 0.95), v(0.07, 1, 0.12), 4.4, { guard: 1.1 });
    arm(k, 1, v(2.2, 6.95, -0.1), v(1.3, 5.85, 0.7));
    k.limb(v(1.4, 5.6, 0.5), v(1.9, 2.0, -0.2), 0.16, 0.12, 8); // 佩剑鞘
  },
  // 6 大主教：尖帽长袍，左手捧书，右手赐福；脑后光环
  (k) => {
    robe(k, {}); torso(k, {}); mantle(k); gorget(k); bigHead(k, () => { head(k, 0.1); helms.mitre(k); });
    k.push(...capeGeo({ rBot: 2.5, halfBot: 1.55, folds: 10 }));
    k.box(1.1, 5.6, 0.14, v(0, 3.15, 1.3), -0.1); // 圣带
    k.box(1.3, 0.14, 0.16, v(0, 4.9, 1.12), -0.1);
    arm(k, 1, v(1.75, 7.0, 0.85), v(0.85, 7.55, 1.75), { plate: false });
    k.box(1.2, 0.14, 1.55, v(0.8, 7.85, 1.95), 0.5, 0, 0.22);
    k.box(1.2, 0.14, 1.55, v(0.8, 7.85, 1.95), 0.5, 0, -0.22);
    arm(k, -1, v(-1.95, 8.5, 0.7), v(-1.45, 10.15, 1.4), { plate: false });
    k.box(0.22, 0.85, 0.32, v(-1.45, 10.7, 1.45));
    k.torus(1.1, 0.11, v(0, 10.7, -0.9), [0, 0, 0], Math.PI * 2, 32);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.limb(v(Math.cos(a) * 1.2, 10.7 + Math.sin(a) * 1.2, -0.9), v(Math.cos(a) * 1.55, 10.7 + Math.sin(a) * 1.55, -0.9), 0.06, 0.02, 4);
    }
  },
  // 7 枪兵：右手立长枪，左臂圆盾，翼盔
  (k) => {
    legs(k, { stance: 0.45 }); torso(k, { armor: true }); pauldrons(k, 1.2); gorget(k); bigHead(k, () => { head(k); helms.winged(k); });
    k.box(1.5, 3.4, 0.12, v(0, 4.9, 1.02), -0.06); // 罩袍前片
    k.box(1.5, 3.4, 0.12, v(0, 4.9, -0.98), 0.06);
    arm(k, -1, v(-2.05, 7.3, 0.0), v(-2.05, 7.55, 0.8));
    k.limb(v(-2.05, 0.1, 0.85), v(-2.05, 13.8, 0.85), 0.14, 0.12, 10);
    k.path([[-2.65, 13.8, 0.85, 0.1], [-2.05, 13.8, 0.85, 0.16], [-1.45, 13.8, 0.85, 0.1]], 6);
    k.push(tube([{ p: v(-2.05, 13.8, 0.85), rx: 0.38, rz: 0.08 }, { p: v(-2.05, 14.6, 0.85), rx: 0.3, rz: 0.08 }, { p: v(-2.05, 15.6, 0.85), rx: 0.01, rz: 0.01 }], { seg: 4, hint: v(0, 0, 1) }));
    arm(k, 1, v(1.95, 7.2, 0.6), v(1.55, 7.6, 1.55));
    const q = new THREE.Euler(Math.PI / 2, 0.45, 0, 'YXZ');
    const sh = new THREE.CylinderGeometry(1.85, 1.85, 0.26, 28);
    sh.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(q)).translate(1.85, 7.4, 1.85);
    k.push(sh);
    k.torus(1.85, 0.14, v(1.85, 7.4, 1.85), [0, 0.45, 0], Math.PI * 2, 32);
    k.torus(1.1, 0.07, v(1.92, 7.4, 1.98), [0, 0.45, 0], Math.PI * 2, 28);
    k.ball(v(1.95, 7.4, 2.02), 0.42, 1, 1, 0.65, 12);
  },
];

// 每尊的整体比例（矮人压扁加宽）
const SCALE = [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1.24, 0.84, 1.14], [1, 1.02, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]];

export const HERO_NAMES = ['持剑骑士', '大法师', '圣骑士', '矮人勇士', '游侠', '国王', '大主教', '枪兵'];

export function heroGeometries(i) {
  const k = kit();
  HEROES[i % HEROES.length](k);
  const [sx, sy, sz] = SCALE[i % SCALE.length];
  for (const g of k.parts) g.scale(sx, sy, sz);
  return k.parts;
}
