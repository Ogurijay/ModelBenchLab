// 轮胎、轮毂（多种辐条造型）、导轮与螺丝。轮子在本地坐标中以 +z 为外侧面、轴心在原点。
import * as THREE from 'three';
import { lathe, extrude, merge, xf, cyl, loftRings, lerp } from './geo.js';
import { plastic, rubber, metal, PALETTE } from './mats.js';

// 轮胎规格（毫米）：od 外径、id 轮辋外径、w 宽度
export const TIRES = {
  low26: { od: 26, id: 20.6, w: 8.6, shoulder: 1.6, label: '26 mm 低扁平胎' },
  low24: { od: 24, id: 19.2, w: 8.6, shoulder: 1.5, label: '24 mm 小径低扁平胎' },
  narrow24: { od: 24, id: 15.6, w: 7.2, shoulder: 2.2, label: '24 mm 小径窄胎' },
  tread24: { od: 24.4, id: 17.4, w: 8.4, shoulder: 1.8, tread: true, label: '24 mm 刻纹小径胎' },
  slick26: { od: 26, id: 17.2, w: 7.6, shoulder: 2.4, label: '26 mm 窄型光头胎' },
  large31: { od: 31, id: 20.6, w: 9.2, shoulder: 2.4, label: '31 mm 大径胎' },
};

// 轮胎截面旋转体
export function tireGeometry(spec) {
  const R = spec.od / 2, r = spec.id / 2, h = spec.w / 2, s = spec.shoulder;
  const pts = [];
  const arc = (cx, cy, rad, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); } };
  pts.push([r - 0.15, -h + 0.5]);
  pts.push([r + 0.2, -h]);
  pts.push([R - s, -h]);
  arc(R - s, -h + s, s, -Math.PI / 2, 0, 6);
  pts.push([R, h - s]);
  arc(R - s, h - s, s, 0, Math.PI / 2, 6);
  pts.push([r + 0.2, h]);
  pts.push([r - 0.15, h - 0.5]);
  pts.push([r - 0.15, -h + 0.5]);
  // 侧壁略微鼓起
  const prof = pts.map(([rr, a]) => [rr, a]);
  return lathe(prof, { seg: 48 });
}

function tireTreadTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 64);
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 5;
  for (let i = 0; i < 32; i++) {
    const x = i * 16;
    g.beginPath(); g.moveTo(x, 8); g.quadraticCurveTo(x + 8, 32, x, 56); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

let treadTex = null;
export function tireMaterial(spec, color = PALETTE.tire) {
  if (!spec.tread) return rubber(color);
  treadTex ||= tireTreadTexture();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, bumpMap: treadTex, bumpScale: 1.2 });
  return m;
}

// ---------- 轮毂 ----------
// design: turbine5 | spiral6 | ySpoke5 | spoke3 | dish
export function wheelGroup(spec, design, color, { cover = null, coverColor = 0x5c5f66, ringColor = null } = {}) {
  const g = new THREE.Group();
  const r = spec.id / 2, h = spec.w / 2;
  const mat = plastic(color, { rough: 0.42, clearcoat: 0.3, metal: design === 'ySpoke5' || design === 'spoke3' ? 0.55 : 0 });
  const dark = plastic(0x15161a, { rough: 0.7 });
  const parts = [];
  // 轮辋筒 + 外侧唇边
  const rim = lathe([[r - 1.1, -h + 0.4], [r - 0.05, -h + 0.4], [r - 0.05, h + 0.15], [r - 1.0, h + 0.15], [r - 1.25, h - 0.6], [r - 1.0, -h + 0.6], [r - 1.1, -h + 0.4]], { seg: 40 });
  parts.push(rim);
  const face = h - 0.5;     // 辐条外表面位置
  const hubR = 2.2;
  if (design === 'turbine5') {
    // 五片扭转风扇叶片：叶片前缘径向、后缘弧形，叶面向一侧倾斜
    for (let i = 0; i < 5; i++) parts.push(turbineBlade(i * Math.PI * 2 / 5, hubR, r - 1.0, face));
    parts.push(cyl(hubR + 0.6, hubR + 0.9, 2.6, { axis: 'z', at: [0, 0, face - 0.9], seg: 24 }));
  } else if (design === 'spoke5') {
    // 五辐直条轮：辐条宽而扁，由轮辋向轮毂内凹（锥面），辐条间露出深色内腔
    for (let i = 0; i < 5; i++) parts.push(coneSpoke(i * Math.PI * 2 / 5 + Math.PI / 2, hubR + 0.4, r - 0.9, face, 1.9, 1.15));
    parts.push(lathe([[r - 0.95, face + 0.05], [r - 1.6, face - 0.5], [r - 1.6, face - 1.2], [r - 1.0, face - 1.0]], { seg: 40 }));
    parts.push(cyl(hubR + 0.5, hubR + 1.0, 3.0, { axis: 'z', at: [0, 0, face - 2.4], seg: 24 }));
  } else if (design === 'spiral6') {
    for (let i = 0; i < 6; i++) parts.push(spiralSpoke(i * Math.PI / 3, hubR, r - 0.9, face));
    parts.push(cyl(hubR + 0.5, hubR + 0.8, 3.0, { axis: 'z', at: [0, 0, face - 1.4], seg: 24 }));
  } else if (design === 'ySpoke5') {
    for (let i = 0; i < 5; i++) parts.push(...ySpoke(i * Math.PI * 2 / 5, hubR, r - 0.9, face));
    parts.push(cyl(hubR + 0.6, hubR + 0.9, 2.4, { axis: 'z', at: [0, 0, face - 0.8], seg: 24 }));
  } else if (design === 'spoke3') {
    // 深碟三辐：辐条位于碟内，外圈为宽平唇
    parts.push(lathe([[r - 0.95, face + 0.1], [r - 2.6, face - 0.1], [r - 3.0, face - 2.6], [r - 3.6, face - 2.8]], { seg: 40 }));
    for (let i = 0; i < 3; i++) parts.push(straightSpoke(i * Math.PI * 2 / 3 + Math.PI / 2, hubR, r - 3.0, face - 2.4, 2.0));
    parts.push(cyl(hubR + 0.4, hubR + 0.9, 2.2, { axis: 'z', at: [0, 0, face - 2.2], seg: 24 }));
  } else if (design === 'dish') {
    // 轻量深碟轮：内凹碟面 + 中心轮毂
    parts.push(lathe([[r - 0.95, face + 0.1], [r - 1.8, face - 0.4], [hubR + 2.5, face - 3.2], [hubR + 0.4, face - 3.4], [hubR + 0.4, face - 2.2]], { seg: 40 }));
    parts.push(cyl(hubR + 0.4, hubR + 0.8, 2.6, { axis: 'z', at: [0, 0, face - 2.0], seg: 24 }));
  }
  const body = new THREE.Mesh(merge(parts), mat); body.name = 'wheel-hub'; body.castShadow = true;
  g.add(body);
  // 轴孔与内侧暗面
  const inner = new THREE.Mesh(merge([cyl(r - 1.1, r - 1.1, 0.4, { axis: 'z', at: [0, 0, -h + 0.9], seg: 32 }), cyl(0.95, 0.95, 0.2, { axis: 'z', at: [0, 0, face + 0.05], seg: 12 })]), dark);
  inner.name = 'wheel-inner'; g.add(inner);
  if (cover) {
    // 轮盖（新三角剑前轮）：灰色圆盘 + 色环
    const disc = new THREE.Mesh(lathe([[r - 1.0, face - 0.2], [r - 1.0, face + 0.2], [r - 2.2, face + 0.9], [0.01, face + 1.2]], { seg: 40 }), plastic(coverColor, { rough: 0.35, metal: 0.5, clearcoat: 0.4 }).clone());
    disc.material.side = THREE.DoubleSide;
    disc.name = 'wheel-cover'; g.add(disc);
    if (ringColor) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 2.0, 0.35, 6, 40), plastic(ringColor, { rough: 0.4 }));
      ring.position.z = face + 0.95; ring.name = 'wheel-cover-ring'; g.add(ring);
    }
  }
  return g;
}

// 扭转叶片：在 (r, θ) 上定义前后缘，叶面从前缘（凸起）向后缘（下沉）倾斜
function turbineBlade(a0, r0, r1, face) {
  const rings = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const rr = lerp(r0, r1, i / n);
    const span = lerp(0.42, 0.72, i / n);               // 叶片角宽
    const lead = a0 + 0.12 * (i / n);                    // 前缘略后掠
    const trail = lead + span;
    const zHi = face, zLo = face - lerp(1.2, 2.6, i / n); // 叶面倾斜
    const ring = [];
    const m = 6;
    for (let k = 0; k <= m; k++) { const a = lerp(lead, trail, k / m); const z = lerp(zHi, zLo, Math.pow(k / m, 0.8)); ring.push([Math.cos(a) * rr, Math.sin(a) * rr, z]); }
    for (let k = m; k >= 0; k--) { const a = lerp(lead, trail, k / m); ring.push([Math.cos(a) * rr, Math.sin(a) * rr, zLo - 0.6 - (k === 0 ? 0 : 0)]); }
    rings.push(ring);
  }
  return loftRings(rings, { closed: true });
}

function spiralSpoke(a0, r0, r1, face) {
  const rings = [];
  const n = 12, w = 0.75, t = 1.3;
  for (let i = 0; i <= n; i++) {
    const s = i / n, rr = lerp(r0, r1, s), a = a0 + 0.55 * s * s;
    const c = Math.cos(a), sn = Math.sin(a), px = -sn, py = c;
    const ww = lerp(w * 1.25, w * 0.85, s), z = face - 0.4 - s * 0.8;
    const cx = c * rr, cy = sn * rr;
    rings.push([[cx + px * ww, cy + py * ww, z], [cx - px * ww, cy - py * ww, z], [cx - px * ww, cy - py * ww, z - t], [cx + px * ww, cy + py * ww, z - t]]);
  }
  return loftRings(rings, { closed: true });
}

function ySpoke(a0, r0, r1, face) {
  const out = [];
  const mid = lerp(r0, r1, 0.45);
  out.push(straightSpoke(a0, r0, mid, face - 0.3, 1.5, 1.3));
  for (const d of [-0.2, 0.2]) {
    const rings = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const s = i / n, rr = lerp(mid - 0.6, r1, s), a = a0 + d * s * 1.6 + d * 0.15;
      const c = Math.cos(a), sn = Math.sin(a), px = -sn, py = c, ww = 0.55, z = face - 0.3 - s * 0.5;
      rings.push([[c * rr + px * ww, sn * rr + py * ww, z], [c * rr - px * ww, sn * rr - py * ww, z], [c * rr - px * ww, sn * rr - py * ww, z - 1.2], [c * rr + px * ww, sn * rr + py * ww, z - 1.2]]);
    }
    out.push(loftRings(rings, { closed: true }));
  }
  return out;
}

// 锥面辐条：外端在轮面 face，内端下沉 depth，宽度由 w0（轮毂）渐变到 w1（轮辋）
function coneSpoke(a, r0, r1, face, w1, w0 = 1.0, depth = 3.2, t = 1.2) {
  const c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
  const rings = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const k = i / n, rr = lerp(r0, r1, k), ww = lerp(w0, w1, k), z = face - depth * (1 - k) - 0.2;
    const cx = c * rr, cy = s * rr;
    rings.push([[cx + px * ww, cy + py * ww, z], [cx - px * ww, cy - py * ww, z], [cx - px * ww * 0.8, cy - py * ww * 0.8, z - t], [cx + px * ww * 0.8, cy + py * ww * 0.8, z - t]]);
  }
  return loftRings(rings, { closed: true });
}

function straightSpoke(a, r0, r1, z, w, t = 1.4) {
  const c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
  const rings = [];
  for (const [rr, ww] of [[r0, w * 0.6], [r1, w * 0.5]]) {
    const cx = c * rr, cy = s * rr;
    rings.push([[cx + px * ww, cy + py * ww, z], [cx - px * ww, cy - py * ww, z], [cx - px * ww, cy - py * ww, z - t], [cx + px * ww, cy + py * ww, z - t]]);
  }
  return loftRings(rings, { closed: true });
}

// 整轮（轮胎 + 轮毂），返回 Group；side=+1 右侧（外面朝 +z），-1 左侧
export function buildWheel({ tire = 'low26', design = 'turbine5', color = 0xffffff, tireColor = PALETTE.tire, cover = null, coverColor, ringColor } = {}, side = 1) {
  const spec = TIRES[tire] || TIRES.low26;
  const g = new THREE.Group();
  const t = new THREE.Mesh(tireGeometry(spec), tireMaterial(spec, tireColor)); t.name = 'tire'; t.castShadow = true; t.receiveShadow = true;
  g.add(t);
  g.add(wheelGroup(spec, design, color, { cover, coverColor, ringColor }));
  if (side < 0) g.rotation.y = Math.PI;
  g.userData.spec = spec;
  return g;
}

// ---------- 导轮 ----------
export const ROLLER = { d: 13, h: 6.6 };
// 13 mm 塑料导轮（带槽、六孔）+ 圆头螺丝 + 垫片；底面位于 y=0
export function buildRoller(color = 0x2d56d8, { d = 13, h = 6.6, screw = true, bearing = false } = {}) {
  const g = new THREE.Group();
  const R = d / 2;
  const prof = [[1.6, 0], [R - 0.6, 0], [R, 0.6], [R - 0.15, h * 0.5 - 0.6], [R - 0.55, h * 0.5], [R - 0.15, h * 0.5 + 0.6], [R, h - 0.6], [R - 0.6, h], [R - 1.6, h], [R - 2.0, h - 0.7], [2.6, h - 0.7], [2.2, h], [1.6, h], [1.6, 0]];
  const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  const mat = bearing ? metal(color, { rough: 0.3 }) : plastic(color, { rough: 0.45, clearcoat: 0.2 });
  const roller = new THREE.Mesh(geo, mat); roller.name = 'roller'; roller.castShadow = true;
  g.add(roller);
  // 减重孔（顶面暗点）
  const holes = [];
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; holes.push(cyl(0.75, 0.75, 0.3, { at: [Math.cos(a) * (R - 2.6), h - 0.62, Math.sin(a) * (R - 2.6)], seg: 10 })); }
  const hm = new THREE.Mesh(merge(holes), plastic(0x101114, { rough: 0.9 })); hm.name = 'roller-holes'; g.add(hm);
  if (screw) {
    const s = new THREE.Mesh(merge([
      lathe([[0, 1.3], [1.9, 1.0], [2.15, 0.4], [2.15, 0], [0, 0]], { seg: 20 }).rotateX(-Math.PI / 2).translate(0, h + 0.35, 0),
      cyl(2.6, 2.6, 0.35, { at: [0, h + 0.18, 0], seg: 20 }),
    ]), metal(PALETTE.screw, { rough: 0.3 }));
    s.name = 'roller-screw'; g.add(s);
    const slot = new THREE.Mesh(merge([new THREE.BoxGeometry(2.4, 0.5, 0.45).translate(0, h + 1.55, 0), new THREE.BoxGeometry(0.45, 0.5, 2.4).translate(0, h + 1.55, 0)]), plastic(0x2a2b2e, { rough: 0.8 }));
    slot.name = 'roller-screw-slot'; g.add(slot);
  }
  return g;
}

// 双层导轮（上下两只，共用螺丝）
export function buildDoubleRoller(color, opts = {}) {
  const g = new THREE.Group();
  const a = buildRoller(color, { ...opts, screw: false }); g.add(a);
  const b = buildRoller(color, opts); b.position.y = -(opts.h || 6.6) - 6; g.add(b);
  return g;
}
