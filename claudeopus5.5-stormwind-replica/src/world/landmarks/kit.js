// 地标模块公共工具：拱洞墙（几何 + 同源碰撞）、圆塔环墙、垛口女儿墙、三角山墙、拱券线脚、
// 现画贴图（招牌 / 花坛 / 书脊 / 水面）。F 参数既可以是 Builder，也可以是 Builder.frame() 返回的局部帧。
import * as THREE from 'three';
import { wallPieces, scaleUV, boxGeo } from '../../core/geom.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

// 统一取子帧（Builder 用 frame，Frame 用 sub）
export function sub(F, x = 0, y = 0, z = 0, ry = 0) {
  return F.sub ? F.sub(x, y, z, ry) : F.frame(x, y, z, ry);
}

// 平移 / 旋转 / 缩放矩阵
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

// 拱形洞口轮廓点（局部 2D：x 横向、y 向上；洞口中心 x=0，洞底 y0，拱脚 spring）
// kind：'pointed' 等边尖拱（拱顶 = spring + 0.866w）、'round' 半圆拱（拱顶 = spring + w/2）、'rect' 平过梁
export function archPts(w, y0, spring, kind = 'pointed', seg = 6) {
  const hw = w / 2;
  const pts = [[-hw, y0], [-hw, spring]];
  if (kind === 'pointed') {
    for (let i = 1; i <= seg; i++) {
      const a = Math.PI - (Math.PI / 3) * (i / seg);
      pts.push([hw + w * Math.cos(a), spring + w * Math.sin(a)]);
    }
    for (let i = 1; i <= seg; i++) {
      const a = Math.PI / 3 - (Math.PI / 3) * (i / seg);
      pts.push([-hw + w * Math.cos(a), spring + w * Math.sin(a)]);
    }
  } else if (kind === 'round') {
    for (let i = 1; i < seg * 2; i++) {
      const a = Math.PI - Math.PI * (i / (seg * 2));
      pts.push([hw * Math.cos(a), spring + hw * Math.sin(a)]);
    }
    pts.push([hw, spring]);
  } else {
    pts.push([hw, spring]);
  }
  pts.push([hw, y0]);
  return pts;
}
export const archApex = (o) => (o.kind === 'round' ? o.spring + o.w / 2 : o.kind === 'rect' ? o.spring : o.spring + 0.866 * o.w);

// 拱形 / 圆形平面（玻璃、门扇、暗色百叶）：XY 平面、面朝 +Z，UV 以米计
export function archPaneGeo(w, y0, spring, kind = 'pointed') {
  const g = new THREE.ShapeGeometry(new THREE.Shape(archPts(w, y0, spring, kind).map(([a, b]) => V2(a, b))), 4);
  return g;
}
export function discGeo(r, y0, seg = 24) {
  const g = new THREE.CircleGeometry(r, seg);
  scaleUV(g, r * 2, r * 2);
  g.translate(0, y0, 0);
  return g;
}

/**
 * 带洞口的墙板：ExtrudeGeometry 一次成形，碰撞用 core/geom 的 wallPieces 按同一组洞口参数切分。
 * 墙沿局部 +X 展开，中心 (x, z)，底边 y，厚度 T 沿局部 Z，绕 Y 旋转 ry。
 * openings: [{ x(相对墙中心), y0(洞底；0 = 落地门洞), w, spring, kind:'pointed'|'round'|'rect'|'circle', r(圆窗半径，y0 为圆心高), glass }]
 * 落地门洞做进外轮廓（门槛处开口），其余做成内洞；窗洞高于可达高度，碰撞仍按实墙（只切门洞）。
 */
export function archWall(F, mat, x, y, z, ry, W, H, T, openings = [], { glass = null, glassOut = null, outside = 1, collide = true, glassInset = 0 } = {}) {
  const fr = sub(F, x, y, z, ry);
  const hw = W / 2;
  const doors = openings.filter((o) => o.kind !== 'circle' && o.y0 <= 1e-3).sort((a, b) => a.x - b.x);
  const holes = openings.filter((o) => !doors.includes(o));
  const outline = [[-hw, 0]];
  for (const o of doors) for (const [px, py] of archPts(o.w, 0, o.spring, o.kind)) outline.push([px + o.x, py]);
  outline.push([hw, 0], [hw, H], [-hw, H]);
  const shape = new THREE.Shape(outline.map(([a, b]) => V2(a, b)));
  for (const o of holes) {
    const path = new THREE.Path();
    if (o.kind === 'circle') path.absarc(o.x, o.y0, o.r, 0, Math.PI * 2, false);
    else path.setFromPoints(archPts(o.w, o.y0, o.spring, o.kind).map(([a, b]) => V2(a + o.x, b)));
    shape.holes.push(path);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -T / 2);
  fr.add(mat, g);
  if (collide) {
    const ops = doors.map((o) => ({ x: o.x + hw, y: 0, w: o.w, h: o.spring }));
    for (const p of wallPieces(W, H, ops)) {
      fr.collider((p.x0 + p.x1) / 2 - hw, p.y0, 0, p.x1 - p.x0, p.y1 - p.y0, T);
    }
  }
  if (glass) {
    for (const o of holes) {
      if (o.glass === false) continue;
      const mk = () => (o.kind === 'circle' ? discGeo(o.r, o.y0) : archPaneGeo(o.w, o.y0, o.spring, o.kind));
      // 两层玻璃：室内层（stained，双面）居中；室外层（glassOut，单面朝外）外移 3 cm，白天偏暗带反射
      const inner = mk();
      inner.translate(o.x, 0, glassInset - outside * 0.02);
      fr.add(glass, inner);
      if (glassOut) {
        const outer = mk();
        if (outside < 0) outer.rotateY(Math.PI);
        outer.translate(outside < 0 ? o.x : o.x, 0, outside * 0.03);
        fr.add(glassOut, outer);
      }
    }
  }
  return fr;
}

// 拱券线脚（U 形带）：外拱宽 wo、内拱宽 wi、拱脚同高，向 +Z 挤出 depth
export function archBandGeo(wo, wi, spring, kind = 'pointed', depth = 0.4) {
  const o = archPts(wo, 0, spring, kind);
  const i = archPts(wi, 0, spring, kind).reverse();
  const g = new THREE.ExtrudeGeometry(new THREE.Shape([...o, ...i].map(([a, b]) => V2(a, b))), { depth, bevelEnabled: false });
  return g;
}

// 双坡屋顶（屋脊沿 X，檐口 y=0，脊高 rise，出檐 over）。
// 注：core/geom.js 的 gableRoofGeo 两块坡板旋转符号反了（得到 V 形屋面），本模块用这份。
export function gableRoof(w, d, rise, over = 0.6, thick = 0.3) {
  const ang = Math.atan2(rise, d / 2);
  const L = Math.hypot(d / 2, rise) + over; // 屋脊 → 檐口再外挑 over
  const base = boxGeo(w + over * 2, thick, L);
  // 坡板中心 = 屋脊点 (0, rise) 与外挑端 (±(d/2 + over·cos), -over·sin) 的中点
  const cz = (d / 2 + over * Math.cos(ang)) / 2;
  const cy = (rise - over * Math.sin(ang)) / 2;
  const m = new THREE.Matrix4();
  const a = base.clone().applyMatrix4(m.makeRotationX(-ang)).translate(0, cy, -cz); // 北坡：z 增大→升高
  const b = base.clone().applyMatrix4(m.makeRotationX(ang)).translate(0, cy, cz); // 南坡
  return [a, b];
}

// 三角山墙：XY 平面，底宽 w、高 rise，厚度 t 居中
export function triGeo(w, rise, t) {
  const s = new THREE.Shape([V2(-w / 2, 0), V2(w / 2, 0), V2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}

/**
 * 圆塔环墙：segs 段盒子围成（方位角 θ：位置 = (cx + r·sinθ, cz + r·cosθ)，θ=0 朝 +Z（南），θ=π/2 朝 +X（东））。
 * gaps: [{ a: 方位角, n: 段数, lintel: 门楣底高 }]，门洞段只在门楣以上出墙。θ 范围可用 a0/a1 限制成弧墙。
 */
export function ringWall(F, mat, cx, y, cz, r, T, H, segs, { gaps = [], collide = true, a0 = 0, a1 = Math.PI * 2 } = {}) {
  const span = a1 - a0;
  const d = span / segs;
  const len = 2 * (r + T / 2) * Math.sin(d / 2) + 0.04;
  for (let i = 0; i < segs; i++) {
    const t = a0 + (i + 0.5) * d;
    const gap = gaps.find((g) => Math.abs(Math.atan2(Math.sin(t - g.a), Math.cos(t - g.a))) < (g.n * d) / 2);
    const px = cx + r * Math.sin(t);
    const pz = cz + r * Math.cos(t);
    if (gap) {
      if (gap.lintel < H) F.box(mat, px, y + gap.lintel, pz, len, H - gap.lintel, T, { ry: t, collide });
    } else {
      F.box(mat, px, y, pz, len, H, T, { ry: t, collide });
    }
  }
}

// 圆环上一圈小盒子（垛口 / 符文 / 石墩），朝向沿切线
export function ringOfBoxes(F, mat, cx, y, cz, r, n, w, h, d, { collide = false, phase = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const t = phase + (i / n) * Math.PI * 2;
    F.box(mat, cx + r * Math.sin(t), y, cz + r * Math.cos(t), w, h, d, { ry: t, collide });
  }
}

/**
 * 垛口女儿墙：沿 (ax,az)→(bx,bz)，墙身 h（带碰撞），墙顶一排垛齿（无碰撞，墙身已挡人）。
 * side = +1/-1 把墙中心线向线段左/右法线方向偏移 off 米（用于贴着岛边内缩）。
 */
export function parapet(F, mat, ax, az, bx, bz, y, { h = 1.15, t = 0.7, mh = 0.6, mw = 0.9, pitch = 2.2, off = 0, nx = 0, nz = 0, capMat = null } = {}) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const ry = Math.atan2(-dz, dx);
  const cx = (ax + bx) / 2 + nx * off;
  const cz = (az + bz) / 2 + nz * off;
  F.box(mat, cx, y, cz, len, h, t, { ry });
  if (capMat) F.box(capMat, cx, y + h, cz, len, 0.12, t + 0.12, { ry, collide: false });
  const n = Math.max(1, Math.floor(len / pitch));
  for (let k = 0; k < n; k++) {
    const s = (k + 0.5) / n - 0.5;
    F.box(mat, cx + ux * s * len, y + h + (capMat ? 0.12 : 0), cz + uz * s * len, mw, mh, t, { ry, collide: false });
  }
}

// 卧狮雕像（头朝局部 +Z）：白石身 + 金鬃，s = 缩放（1 ≈ 身长 3.5 m）
export function lionStatue(F, M, x, y, z, ry = 0, s = 1, maneMat = M.gold) {
  const f = sub(F, x, y, z, ry);
  f.add(M.statue, new THREE.CapsuleGeometry(0.75 * s, 1.8 * s, 4, 10).rotateX(Math.PI / 2), trs(0, 0.8 * s, -0.2 * s));
  f.add(maneMat, new THREE.SphereGeometry(0.85 * s, 12, 8), trs(0, 1.45 * s, 1.05 * s, 0, 0, 0, 1.05, 1.1, 0.75));
  f.add(M.statue, new THREE.SphereGeometry(0.52 * s, 10, 8), trs(0, 1.55 * s, 1.62 * s));
  f.add(M.statue, new THREE.BoxGeometry(0.46 * s, 0.34 * s, 0.5 * s), trs(0, 1.36 * s, 2.02 * s));
  for (const sx of [-1, 1]) {
    f.add(M.statue, new THREE.CapsuleGeometry(0.2 * s, 1.0 * s, 3, 6).rotateX(Math.PI / 2), trs(sx * 0.42 * s, 0.22 * s, 1.55 * s));
    f.add(M.statue, new THREE.SphereGeometry(0.48 * s, 8, 6), trs(sx * 0.5 * s, 0.55 * s, -1.0 * s));
    f.add(M.statue, new THREE.SphereGeometry(0.14 * s, 6, 4), trs(sx * 0.32 * s, 1.98 * s, 1.5 * s)); // 耳朵
  }
  f.add(M.statue, new THREE.CylinderGeometry(0.07 * s, 0.1 * s, 1.5 * s, 5).rotateX(1.25), trs(0.45 * s, 0.38 * s, -2.3 * s));
  f.add(maneMat, new THREE.SphereGeometry(0.18 * s, 6, 4), trs(0.45 * s, 0.12 * s, -2.95 * s));
}

// 旗帜：banner 贴图一张（盾徽）+ 燕尾（fabricBlue），挂杆金色。平面朝局部 +Z，顶边在 y
export function hangBanner(F, M, x, y, z, ry, w = 3, h = 4.5, tail = 1.6) {
  const f = sub(F, x, y, z, ry);
  f.add(M.banner, new THREE.PlaneGeometry(w, h), trs(0, -h / 2, 0));
  const s = new THREE.Shape([V2(-w / 2, 0), V2(w / 2, 0), V2(w / 2, -tail), V2(0, -tail * 0.45), V2(-w / 2, -tail)]);
  const tg = new THREE.ShapeGeometry(s);
  f.add(M.fabricBlue, tg, trs(0, -h, 0));
  f.add(M.gold, new THREE.CylinderGeometry(0.07, 0.07, w + 0.6, 6).rotateZ(Math.PI / 2), trs(0, 0.05, 0.02));
  for (const sx of [-1, 1]) f.add(M.gold, new THREE.SphereGeometry(0.13, 6, 4), trs(sx * (w / 2 + 0.3), 0.05, 0.02));
}

// 火盆：铁架 + 碗 + 火焰；返回火焰中心高度
export function brazier(F, M, x, y, z, { fireMat = M.fire, collide = true, scale = 1 } = {}) {
  const s = scale;
  F.add(M.iron, new THREE.CylinderGeometry(0.1 * s, 0.22 * s, 1.0 * s, 6).translate(0, 0.5 * s, 0), trs(x, y, z));
  F.add(M.iron, new THREE.CylinderGeometry(0.5 * s, 0.08 * s, 0.12 * s, 8).translate(0, 0.06 * s, 0), trs(x, y, z));
  F.add(M.iron, new THREE.CylinderGeometry(0.72 * s, 0.3 * s, 0.45 * s, 10).translate(0, 0.225 * s, 0), trs(x, y + 1.0 * s, z));
  F.add(fireMat, new THREE.ConeGeometry(0.55 * s, 1.1 * s, 7).translate(0, 0.55 * s, 0), trs(x, y + 1.3 * s, z));
  F.add(M.lampGlow, new THREE.ConeGeometry(0.3 * s, 0.7 * s, 6).translate(0, 0.35 * s, 0), trs(x, y + 1.32 * s, z, 0, 0.5));
  if (collide) F.collider(x, y, z, 1.3 * s, 1.6 * s, 1.3 * s);
  return y + 1.8 * s;
}

// 横向拉伸的盒子：两点之间（XZ 平面）的一根梁 / 一段墙
export function beam(F, mat, ax, az, bx, bz, y, h, t, opts = {}) {
  const dx = bx - ax;
  const dz = bz - az;
  F.box(mat, (ax + bx) / 2, y, (az + bz) / 2, Math.hypot(dx, dz), h, t, { ...opts, ry: Math.atan2(-dz, dx) });
}

// 水平地毯：宽 w、长 len（沿 Z），一张贴图横向铺满（花边对齐两侧），UV 以米计
export function carpetGeo(w, len, tileW = 2) {
  const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
  scaleUV(g, tileW, len);
  return g;
}

// ---------- 现画贴图 ----------
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 招牌：深色铁框木牌 + 金字（中文）
export function signTexture(text, { w = 1024, h = 256, sub: subText = '' } = {}) {
  return canvas(w, h, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#3b2a1c');
    grd.addColorStop(1, '#22170f');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6d6f73';
    g.lineWidth = 18;
    g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = '#9a9ca0';
    for (const [x, y] of [[28, 28], [w - 28, 28], [28, h - 28], [w - 28, h - 28]]) {
      g.beginPath();
      g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill();
    }
    // 齿轮纹饰
    for (const cx of [110, w - 110]) {
      g.save();
      g.translate(cx, h / 2);
      g.fillStyle = '#c99a3a';
      for (let i = 0; i < 10; i++) {
        g.rotate(Math.PI / 5);
        g.fillRect(-9, -62, 18, 20);
      }
      g.beginPath();
      g.arc(0, 0, 46, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a1d13';
      g.beginPath();
      g.arc(0, 0, 18, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.font = `bold ${Math.round(h * 0.5)}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC","SimHei",sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#1a120b';
    g.strokeText(text, w / 2, h * (subText ? 0.44 : 0.52));
    const tg = g.createLinearGradient(0, h * 0.25, 0, h * 0.75);
    tg.addColorStop(0, '#ffe7a0');
    tg.addColorStop(1, '#d19a2e');
    g.fillStyle = tg;
    g.fillText(text, w / 2, h * (subText ? 0.44 : 0.52));
    if (subText) {
      g.font = `${Math.round(h * 0.14)}px "Microsoft YaHei",sans-serif`;
      g.fillStyle = '#c9a868';
      g.fillText(subText, w / 2, h * 0.82);
    }
  });
}

// 花坛顶面：绿底 + 彩色花点（米 UV，2 m 一张）
export function flowerTexture(rng) {
  const t = canvas(256, 256, (g, S) => {
    g.fillStyle = '#3f6e2c';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `hsl(${95 + rng() * 30},45%,${24 + rng() * 18}%)`;
      g.beginPath();
      g.arc(rng() * S, rng() * S, 4 + rng() * 9, 0, Math.PI * 2);
      g.fill();
    }
    const cols = ['#e8434f', '#f2c230', '#ffffff', '#b066e0', '#ff8a3c', '#5a8cff'];
    for (let i = 0; i < 520; i++) {
      const x = rng() * S;
      const y = rng() * S;
      g.fillStyle = cols[Math.floor(rng() * cols.length)];
      g.beginPath();
      g.arc(x, y, 2 + rng() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.5, 0.5);
  return t;
}

// 书架正面：多层书脊（贴图覆盖 2.4 m 宽 × 3 m 高的一面书架）
export function booksTexture(rng) {
  return canvas(512, 640, (g, W, H) => {
    g.fillStyle = '#3a2416';
    g.fillRect(0, 0, W, H);
    const rows = 5;
    const rh = H / rows;
    for (let r = 0; r < rows; r++) {
      let x = 14;
      const y1 = (r + 1) * rh - 14;
      while (x < W - 30) {
        const bw = 10 + rng() * 18;
        const bh = rh * (0.6 + rng() * 0.3);
        g.fillStyle = `hsl(${[0, 25, 45, 120, 215, 275][Math.floor(rng() * 6)]},${40 + rng() * 30}%,${22 + rng() * 22}%)`;
        g.fillRect(x, y1 - bh, bw, bh);
        g.fillStyle = 'rgba(230,190,90,0.7)';
        g.fillRect(x + 2, y1 - bh + 8, bw - 4, 3);
        x += bw + 1 + (rng() < 0.08 ? 14 : 0);
      }
      g.fillStyle = '#5b3a22';
      g.fillRect(0, y1, W, 14);
    }
    g.fillStyle = '#5b3a22';
    g.fillRect(0, 0, 14, H);
    g.fillRect(W - 14, 0, 14, H);
  });
}

// 地铁口尽头的渐暗：从透明到全黑（竖直方向沿 Z 不用，靠多层叠加）
export function fadeMaterial(opacity) {
  return new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
}

// 水面材质（独立克隆法线贴图，偏移动画不影响运河）
export function waterMaterial(baseNormal) {
  const n = baseNormal.clone();
  n.wrapS = n.wrapT = THREE.RepeatWrapping;
  n.repeat.set(0.35, 0.35);
  n.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({
    color: 0x3fb3c4,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.82,
    normalMap: n,
    normalScale: new THREE.Vector2(0.6, 0.6),
    depthWrite: false,
  });
  m.userData.noShadow = true;
  return m;
}

// Builder.finish 后的标记：不投影的材质关掉 castShadow；铺装 / 楼地面打 ground 标记
export function finishInto(B, { noShadow = [], ground = [] } = {}) {
  const meshes = B.finish();
  for (const m of meshes) {
    if (noShadow.includes(m.material)) m.castShadow = false;
    if (ground.includes(m.material)) m.userData.ground = true;
  }
  return meshes;
}

// ---------- 喷泉水柱：沿抛物线的十字交叉带状网格 + 滚动 alpha 贴图 ----------
// arcs: [{ x,y,z, vx,vy,vz, floor }]，返回合并后的 BufferGeometry（世界坐标，UV.v 沿流向以米计）
export function waterJetGeometry(arcs, { g = 9.8, seg = 14, w0 = 0.14, w1 = 0.3 } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const a of arcs) {
    // 飞行时间：y0 + vy t - g t²/2 = floor
    const A = -g / 2;
    const Bq = a.vy;
    const Cq = a.y - a.floor;
    const T = (-Bq - Math.sqrt(Bq * Bq - 4 * A * Cq)) / (2 * A);
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const t = (T * i) / seg;
      pts.push(new THREE.Vector3(a.x + a.vx * t, a.y + a.vy * t + A * t * t, a.z + a.vz * t));
    }
    const side = new THREE.Vector3(a.vx, 0, a.vz);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().cross(up).normalize();
    for (const mode of [0, 1]) {
      const base = pos.length / 3;
      let len = 0;
      for (let i = 0; i <= seg; i++) {
        const p = pts[i];
        const tan = (i < seg ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
        const off = mode === 0 ? side.clone() : side.clone().cross(tan).normalize();
        const w = (w0 + (w1 - w0) * (i / seg)) / 2;
        if (i > 0) len += p.distanceTo(pts[i - 1]);
        pos.push(p.x - off.x * w, p.y - off.y * w, p.z - off.z * w, p.x + off.x * w, p.y + off.y * w, p.z + off.z * w);
        uv.push(0, len, 1, len);
        if (i < seg) {
          const k = base + i * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// 水柱 alpha：横向两边羽化、纵向一段段的水团（RepeatWrapping，滚动 offset.y 就是水在流）
export function waterJetMaterial() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(32, 128);
  for (let y = 0; y < 128; y++) {
    const v = 0.55 + 0.45 * Math.sin((y / 128) * Math.PI * 6) * Math.sin((y / 128) * Math.PI * 2 + 1);
    for (let x = 0; x < 32; x++) {
      const e = Math.sin((x / 31) * Math.PI);
      const a = Math.max(0, Math.min(1, e * e * (0.35 + 0.65 * v)));
      const i = (y * 32 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 0.8);
  // 受光的半透明水（不自发光）：夜里随环境变暗，不会像霓虹灯管
  return new THREE.MeshStandardMaterial({ color: 0xcfeaf2, alphaMap: t, transparent: true, opacity: 0.85, roughness: 0.12, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide, name: 'lmWaterJet' });
}
