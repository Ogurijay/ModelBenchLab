// 房屋外壳：洞口墙 / 楼板（开井）/ 楼梯 / 栏杆 / 壁炉与烟囱 / 双坡屋顶 / 半木构与石作饰件。
// 结构件一律 Frame.box（默认 collide:true）——渲染与碰撞同一组参数，洞口处天然没有碰撞盒。
// 饰件（木梁、窗台、窗棂、隅石……）collide:false，只是贴在墙面外的薄片。
import * as THREE from 'three';
import { wallPieces, gableEndGeo, boxGeo, coneGeo } from '../../core/geom.js';
import { FLOOR_H, SLAB, STEP0, STAIR, WIN } from './styles.js';

const NC = { collide: false };
const PI = Math.PI;
const planeGlass = new THREE.PlaneGeometry(WIN.w, WIN.h);

// 十字窗棂：一块平面十字（正反两面共 8 个三角形），比两根盒子省 2/3
const mullionGeo = (() => {
  // 洞口净宽 = WIN.w − 2×1 cm（墙段搭接）；窗棂两端各让出 5 cm 框料，不插进洞口侧壁
  const cw = WIN.w - 0.02 - 0.1;
  const ch = WIN.h - 0.02 - 0.1;
  const a = new THREE.PlaneGeometry(0.06, ch).translate(0, 0.06 + ch / 2, 0);
  const b = new THREE.PlaneGeometry(cw, 0.06).translate(0, WIN.h * 0.62, 0);
  const parts = [a, b, a.clone().rotateY(Math.PI), b.clone().rotateY(Math.PI)].map((g) => g.toNonIndexed());
  const pos = [];
  const nor = [];
  const uv = [];
  for (const g of parts) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
})();

// 贴墙饰件：盒子去掉朝墙的背面（局部 -Z）→ 10 个三角形。y 为底面，rz 为墙面内旋转（斜撑）
export function dbox(F, mat, x, y, z, w, h, d, rz = 0) {
  const g = boxGeo(w, h, d);
  g.setIndex(Array.from(g.index.array.subarray(0, 30)));
  F.add(mat, g, mat4(x, y + h / 2, z, 0, 0, rz));
}

export function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

// 双坡屋顶（自建几何：core/geom.js 的 gableRoofGeo 两片坡面方向反了，见报告）。
// 局部：屋脊沿 X，檐口线 z = ±d/2、y = 0，脊高 rise；屋面下皮正好压在墙顶外沿上，出檐沿坡面延伸。
export function addGableRoof(F, mat, w, d, rise, overX, overZ, th, capMat) {
  const t = rise / (d / 2);
  const hz = d / 2 + overZ;
  const drop = overZ * t;
  const len = Math.hypot(hz, rise + drop);
  const ang = Math.atan2(rise + drop, hz);
  const L = w + overX * 2;
  const geo = boxGeo(L, th, len);
  for (const s of [-1, 1]) {
    const ny = Math.cos(ang);
    const nz = s * Math.sin(ang);
    const cy = (rise - drop) / 2 + (ny * th) / 2;
    const cz = (s * hz) / 2 + (nz * th) / 2;
    F.add(mat, geo, mat4(0, cy, cz, s * ang, 0, 0));
  }
  if (capMat) F.add(capMat, boxGeo(L + 0.04, 0.2, 0.34), mat4(0, rise + th / Math.cos(ang) - 0.06, 0));
}

// 墙面坐标系：沿墙 x ∈ [-L/2, L/2]，+z 朝外，y = 世界高度
export function wallsOf(p, S, k) {
  const { W, D, T } = p;
  const zf = p.zf(k);
  const sideL = zf + D / 2 - 2 * T;
  const sideC = (zf - D / 2) / 2;
  // 转角搭接（防 1px 漏缝）：前后墙两端各外伸 1 cm 盖住转角棱；侧墙两端各伸进前后墙半个墙厚
  return [
    { name: 'front', F: S.sub(0, 0, zf - T / 2, 0), L: W + 0.02, toL: (a) => a },
    { name: 'back', F: S.sub(0, 0, -D / 2 + T / 2, PI), L: W + 0.02, toL: (a) => -a },
    { name: 'right', F: S.sub(W / 2 - T / 2, 0, sideC, PI / 2), L: sideL + T, toL: (a) => -(a - sideC) },
    { name: 'left', F: S.sub(-W / 2 + T / 2, 0, sideC, -PI / 2), L: sideL + T, toL: (a) => a - sideC },
  ];
}

// 一块矩形楼板减去一个矩形井口 → 至多 4 块
function slabMinusHole(x0, z0, x1, z1, hole) {
  if (!hole) return [[x0, z0, x1, z1]];
  const [hx0, hz0, hx1, hz1] = hole;
  const out = [];
  if (hz0 > z0 + 1e-3) out.push([x0, z0, x1, hz0]);
  if (hz1 < z1 - 1e-3) out.push([x0, hz1, x1, z1]);
  if (hx0 > x0 + 1e-3) out.push([x0, hz0, hx0, hz1]);
  if (hx1 < x1 - 1e-3) out.push([hx1, hz0, x1, hz1]);
  return out;
}

// 栏杆：沿 (ax,az)→(bx,bz) 的一段，木扶手 + 立柱（视觉无碰撞）+ 一整块同尺寸碰撞盒
function railing(S, M, ax, az, bx, bz, y) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.2) return;
  const ry = Math.atan2(-(bz - az), bx - ax);
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  S.box(M.timber, mx, y + 0.92, mz, len, 0.08, 0.09, { ry, collide: false });
  const n = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    S.box(M.timber, ax + (bx - ax) * t, y, az + (bz - az) * t, 0.07, 0.92, 0.07, { ry, collide: false });
  }
  S.collider(mx, y, mz, len, 1.0, 0.08, ry);
}

// ---------- 窗饰 ----------
// 每扇窗从 windowGlowSet 里确定性地挑一块（暖光 / 更暖 / 半掩窗帘 / 不亮），夜里不再像写字楼
export function glowFor(p, M, idx, warm = false) {
  const set = M.windowGlowSet;
  if (!set || !set.length || warm) return M.windowGlow;
  const r = p.rng(`${p.id}#${idx}`)();
  return set[Math.floor(r * set.length) % set.length];
}

function windowDecor(p, M, w, lx, yb, upper, glow, k, idx, gaps = { left: 0, right: 0 }) {
  const wall = w.name;
  const { T, st } = p;
  const F = w.F;
  // 发光玻璃（室内侧；白天是淡暗玻璃，仍可透视）
  F.add(glow, planeGlass, mat4(lx, yb + WIN.h / 2, -T / 2 + 0.07));
  // 十字窗棂
  F.add(M.timber, mullionGeo, mat4(lx, yb, -T / 2 + 0.11));
  const timberFace = p.halfTimber && upper;
  if (!timberFace) {
    // 窗台（半木构立面上由木框的窗下横梁代替）
    dbox(F, st.heavyLintel ? M.stoneGrey : M.stoneTrim, lx, yb - 0.09, T / 2 - 0.05, WIN.w + 0.3, 0.09, 0.24);
    // 石作过梁
    if (st.heavyLintel) dbox(F, M.stoneGrey, lx, yb + WIN.h, T / 2 + 0.06, WIN.w + 0.6, 0.38, 0.14);
    else dbox(F, M.stoneTrim, lx, yb + WIN.h, T / 2 + 0.03, WIN.w + 0.32, 0.2, 0.08);
    if (st.surrounds) {
      for (const s of [-1, 1]) dbox(F, M.stoneTrim, lx + s * (WIN.w / 2 + 0.08), yb, T / 2 + 0.02, 0.16, WIN.h, 0.06);
      dbox(F, M.stoneTrim, lx, yb + WIN.h + 0.2, T / 2 + 0.05, 0.3, 0.3, 0.08); // 拱心石
    }
  }
  if (p.shutters && upper) {
    // 木窗板：约 30% 的窗不装；装的要么关上（0°），要么推开贴墙（180°，离墙 10 cm，躲开木框与窗楣）。
    // 推开前查这一侧的墙面空档：放不下整扇就关着；与邻窗共用的空档只给左边那扇窗的右叶（gaps 由调用方算好）
    const r = p.rng(`${p.id}#sh${idx}`);
    if (r() >= 0.3) {
      const closed = r() < 0.25;
      const mat = M.shutterMats ? M.shutterMats[p.shutterTone ?? 0] : M.planks;
      const lw = WIN.w / 2 - 0.02;
      const hz = T / 2 + 0.1;
      for (const s of [-1, 1]) {
        const room = s < 0 ? gaps.left : gaps.right;
        const open = !closed && room >= lw + 0.08;
        const th = open ? (s < 0 ? PI : 0) : s < 0 ? 0 : PI; // 叶片朝向：开 = 背离窗洞，关 = 指向窗洞中心
        const hx = lx + s * (WIN.w / 2 + 0.02);
        F.box(mat, hx + (Math.cos(th) * lw) / 2, yb + 0.03, hz, lw, WIN.h - 0.06, 0.045, { collide: false, ry: -th });
        for (const y of [yb + 0.25, yb + WIN.h - 0.35]) F.box(M.iron, hx, y, hz - 0.03, 0.05, 0.08, 0.08, NC);
      }
    }
  }
  // 大教堂区：二层以上正面部分窗做成凸窗（oriel）或小阳台
  if (st.oriels && wall === 'front' && k > 0) {
    const r = p.rng(`${p.id}#or${idx}`)();
    if (r < 0.16) oriel(p, M, F, lx, yb, glow);
    else if (r < 0.3) balcony(p, M, F, lx, yb);
  }
  if (st.arcane) {
    dbox(F, M.stoneTrim, lx, yb + WIN.h + 0.16, T / 2 + 0.04, 0.26, 0.26, 0.08); // 拱心石
    dbox(F, M.arcaneDot || M.arcane, lx, yb + WIN.h + 0.24, T / 2 + 0.09, 0.09, 0.09, 0.03); // 嵌在拱心石上的奥术符文
  }
}

// 凸窗：石托 + 两侧墙板 + 外层玻璃 + 小坡顶，内部与真实窗洞相通（纯装饰、无碰撞）
function oriel(p, M, F, lx, yb, glow) {
  const { T } = p;
  const wall = M.tone(p.upperMat, p.tone);
  const dep = 0.6;
  const w = WIN.w + 0.5;
  dbox(F, M.stoneTrim, lx, yb - 0.5, T / 2 + 0.25, w - 0.3, 0.4, 0.5);
  dbox(F, M.stoneTrim, lx, yb - 0.12, T / 2 + dep / 2, w + 0.1, 0.12, dep);
  for (const s of [-1, 1]) dbox(F, wall, lx + s * (w / 2 - 0.05), yb, T / 2 + dep / 2, 0.1, WIN.h + 0.1, dep);
  F.add(glow, new THREE.PlaneGeometry(w - 0.2, WIN.h), mat4(lx, yb + WIN.h / 2, T / 2 + dep - 0.04));
  F.add(M.timber, mullionGeo, mat4(lx, yb, T / 2 + dep - 0.02));
  dbox(F, M.stoneTrim, lx, yb + WIN.h + 0.1, T / 2 + dep / 2, w + 0.1, 0.1, dep + 0.05);
  F.add(M.tone(p.roofMat, p.roofTone), boxGeo(w + 0.2, 0.1, dep + 0.25), mat4(lx, yb + WIN.h + 0.35, T / 2 + dep / 2 + 0.05, 0.45, 0, 0));
}
// 小阳台：石板 + 两个托座 + 铁栏杆
function balcony(p, M, F, lx, yb) {
  const { T } = p;
  const w = WIN.w + 0.9;
  const dep = 0.7;
  const y = yb - 0.75;
  dbox(F, M.stoneTrim, lx, y, T / 2 + dep / 2, w, 0.12, dep);
  for (const s of [-1, 1]) dbox(F, M.stoneTrim, lx + s * (w / 2 - 0.2), y - 0.35, T / 2 + 0.2, 0.18, 0.35, 0.4);
  const yr = y + 0.12;
  F.box(M.iron, lx, yr + 0.85, T / 2 + dep - 0.04, w, 0.05, 0.05, NC);
  for (const s of [-1, 1]) F.box(M.iron, lx + s * (w / 2 - 0.03), yr + 0.85, T / 2 + dep / 2, 0.05, 0.05, dep, NC);
  for (let i = 0; i <= 8; i++) F.box(M.iron, lx - w / 2 + 0.05 + (i * (w - 0.1)) / 8, yr, T / 2 + dep - 0.04, 0.03, 0.85, 0.03, NC);
}

// 墙根脏迹：外墙面外 1 cm 的透明薄板（向上渐隐），门洞处断开；UV 横向按米平铺
function dirtBand(p, M, w, base, ops) {
  if (!M.wallGrime) return;
  const L = w.L;
  const h = 0.55;
  const cuts = ops.filter((o) => o.y < 0.01).map((o) => [o.x - o.w / 2, o.x + o.w / 2]).sort((a, b) => a[0] - b[0]);
  let a = 0;
  const segs = [];
  for (const [c0, c1] of cuts) {
    if (c0 > a + 0.05) segs.push([a, c0]);
    a = Math.max(a, c1);
  }
  if (L > a + 0.05) segs.push([a, L]);
  for (const [s0, s1] of segs) {
    const g = new THREE.PlaneGeometry(s1 - s0, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (s0 + uv.getX(i) * (s1 - s0)) / 2.5);
    w.F.add(M.wallGrime, g, mat4((s0 + s1) / 2 - L / 2, base + h / 2, p.T / 2 + 0.012));
  }
}

// ---------- 半木构：上层外立面的木框 ----------
function timberFrame(p, M, w, y0, h, wins, wyb, door) {
  const F = w.F;
  const z = p.T / 2 + 0.03;
  const tw = 0.18;
  const L = w.L;
  // 地梁（门洞处断开）
  if (door) {
    const a = door.lx - door.w / 2 - 0.2;
    const b = door.lx + door.w / 2 + 0.2;
    if (a > -L / 2) dbox(F, M.timber, (-L / 2 + a) / 2, y0, z, a + L / 2, 0.2, 0.06);
    if (b < L / 2) dbox(F, M.timber, (b + L / 2) / 2, y0, z, L / 2 - b, 0.2, 0.06);
  } else dbox(F, M.timber, 0, y0, z, L, 0.2, 0.06);
  dbox(F, M.timber, 0, y0 + h - 0.12, z, L, 0.4, 0.07); // 顶梁（盖住楼板边）
  const posts = [-L / 2 + tw / 2, L / 2 - tw / 2];
  for (const lx of wins) posts.push(lx - WIN.w / 2 - tw / 2, lx + WIN.w / 2 + tw / 2);
  if (door) {
    posts.push(door.lx - door.w / 2 - 0.2 - tw / 2, door.lx + door.w / 2 + 0.2 + tw / 2);
  }
  posts.sort((a, b) => a - b);
  const ys = y0 + 0.2;
  const yt = y0 + h - 0.12;
  for (const x of posts) dbox(F, M.timber, x, ys, z, tw, yt - ys, 0.06);
  for (const lx of wins) {
    dbox(F, M.timber, lx, wyb + WIN.h, z, WIN.w, 0.15, 0.06);
    dbox(F, M.timber, lx, wyb - 0.15, z, WIN.w, 0.15, 0.06);
  }
  if (door) wins = [...wins, door.lx]; // 门所在板块不画斜撑
  // 板块：相邻立柱之间（不含窗）
  const pat = p.timberPattern;
  for (let i = 0; i < posts.length - 1; i++) {
    const a = posts[i] + tw / 2;
    const b = posts[i + 1] - tw / 2;
    const pw = b - a;
    if (pw < 0.5) continue;
    const isWin = wins.some((lx) => lx > a && lx < b);
    if (w.name !== 'front') continue; // 侧墙 / 后墙多半夹在邻屋之间：只留梁柱，不画斜撑
    // 有窗板的房子：紧挨窗洞的板块留给窗板，不画斜撑
    if (p.shutters && wins.some((lx) => Math.abs(lx + WIN.w / 2 + tw - a) < 0.05 || Math.abs(lx - WIN.w / 2 - tw - b) < 0.05)) continue;
    if (isWin) {
      // 窗下小交叉
      if (pat === 'cross' && w.name === 'front') diag(F, M, a, ys, b, wyb - 0.15, z, true);
      continue;
    }
    const segs = pw > 2.6 ? Math.ceil(pw / 2.2) : 1;
    const sw = pw / segs;
    for (let s = 0; s < segs; s++) {
      const sa = a + s * sw;
      const sb = sa + sw;
      if (s > 0) dbox(F, M.timber, sa, ys, z, tw * 0.8, yt - ys, 0.06);
      if (pat === 'studs') {
        const n = Math.max(1, Math.floor(sw / 0.7));
        for (let j = 1; j <= n; j++) dbox(F, M.timber, sa + (sw * j) / (n + 1), ys, z, 0.12, yt - ys, 0.06);
        dbox(F, M.timber, (sa + sb) / 2, (ys + yt) / 2 - 0.07, z, sw, 0.14, 0.06);
      } else if (pat === 'cross') {
        diag(F, M, sa, ys, sb, yt, z, true);
      } else if (pat === 'chevron') {
        const mid = (sa + sb) / 2;
        diag(F, M, sa, ys, mid, yt, z, false);
        diag(F, M, mid, yt, sb, ys, z, false, true);
      } else {
        // 'brace'：成对斜撑，方向随板块交替
        if ((i + s) % 2) diag(F, M, sa, ys, sb, yt, z, false);
        else diag(F, M, sa, yt, sb, ys, z, false, true);
      }
    }
  }
}

// 斜撑：从 (xa,ya) 到 (xb,yb)；both = 画成 X
function diag(F, M, xa, ya, xb, yb, z, both, down) {
  const dx = xb - xa;
  const dy = yb - ya;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const cx = (xa + xb) / 2;
  const cy = (ya + yb) / 2;
  dbox(F, M.timber, cx, cy - 0.07, z, len, 0.14, 0.055, ang);
  if (both) dbox(F, M.timber, cx, cy - 0.07, z, len, 0.14, 0.055, -ang);
  void down;
}

// 隅石：墙两端交替长短的白石块
function quoins(F, M, L, y0, y1, z) {
  let i = 0;
  for (let y = y0; y < y1 - 0.3; y += 0.56, i++) {
    const bw = i % 2 ? 0.38 : 0.62;
    const h = Math.min(0.5, y1 - y);
    for (const s of [-1, 1]) dbox(F, M.stoneTrim, s * (L / 2 - bw / 2 + 0.03), y, z, bw, h, 0.06);
  }
}

// ======================================================================
export function buildShell(p, B, X, M, extras) {
  const { W, D, T, F, base, st } = p;
  const S = B.frame(p.cx, 0, p.cz, p.ry);
  p.S = S;
  const wallMat = (k) => M.tone(k === 0 ? p.groundMat : p.upperMat, p.tone);

  // ---- 底层地板（贴地：底面 = 街面）----
  S.box(M.planks, 0, base, 0, W - 0.04, STEP0, D - 0.04);

  let winIdx = 0;
  for (let k = 0; k < F; k++) {
    const y0 = k === 0 ? base : p.top(k);
    const y1 = p.top(k + 1) - SLAB;
    const h = y1 - y0;
    const mat = wallMat(k);
    const wy = k === 0 ? STEP0 : 0;
    const upper = k > 0 || p.groundMat === 'plaster';
    for (const w of wallsOf(p, S, k)) {
      const wins = p.win[k][w.name].map((a) => w.toL(a));
      const ops = wins.map((lx) => ({ x: lx + w.L / 2, y: wy + WIN.sill, w: WIN.w, h: WIN.h }));
      if (k === 0 && w.name === 'front') ops.push({ x: p.dx + w.L / 2, y: 0, w: p.dw, h: STEP0 + p.dh });
      // 墙段四边各外扩 1 cm：同墙相邻段、上下层墙与楼板之间互相搭接，消掉 T 形接缝的漏缝
      for (const q of wallPieces(w.L, h, ops)) {
        const x0 = q.x0 - 0.01;
        const x1 = q.x1 + 0.01;
        const yb = y0 + q.y0 - 0.01;
        const yt = y0 + q.y1 + 0.01;
        w.F.box(mat, (x0 + x1) / 2 - w.L / 2, yb, 0, x1 - x0, yt - yb, T);
      }
      if (k === 0) dirtBand(p, M, w, base, ops);
      const wyb = y0 + wy + WIN.sill;
      // 每扇窗两侧可供窗板贴墙的空档（共用空档只分给左窗的右叶）
      const sorted = [...wins].sort((a, b) => a - b);
      const half = WIN.w / 2 + 0.05;
      const gapsOf = (lx) => {
        const i = sorted.indexOf(lx);
        const lEdge = i > 0 ? sorted[i - 1] + half : -w.L / 2 + 0.25;
        const rEdge = i < sorted.length - 1 ? sorted[i + 1] - half : w.L / 2 - 0.25;
        const lRaw = lx - half - lEdge;
        const rRaw = rEdge - (lx + half);
        const lw2 = WIN.w - 0.04 + 0.16;
        return {
          left: i > 0 && lRaw < lw2 ? 0 : lRaw, // 左侧与邻窗共用且放不下两扇 → 让给邻窗的右叶
          right: rRaw,
        };
      };
      for (const lx of wins) {
        const idx = winIdx++;
        windowDecor(p, M, w, lx, wyb, upper, glowFor(p, M, idx, k === 0 && (p.biz === 'tavern' || p.fire.wall === w.name)), k, idx, gapsOf(lx));
      }
      const door = k === 0 && w.name === 'front' ? { lx: p.dx, w: p.dw } : null;
      if (p.halfTimber && upper) timberFrame(p, M, w, y0, h, wins, wyb, door);
      if (st.quoins && w.name === 'front') quoins(w.F, M, w.L, y0, y1 + SLAB, T / 2 + 0.02);
      // 石作区每层楼板处一圈腰线
      if ((st.cornice || st.quoins || (!p.halfTimber && k > 0)) && !st.heavyLintel) {
        const ext = w.name === 'front' || w.name === 'back' ? 0.16 : T + 0.16; // 侧墙腰线包过转角
        dbox(w.F, M.stoneTrim, 0, y1 - 0.05, T / 2 + 0.04, w.L + ext, 0.36, 0.1);
      }
      if (st.heavyLintel) dbox(w.F, M.stoneGrey, 0, y1 - 0.02, T / 2 + 0.06, w.L + (w.name === 'front' || w.name === 'back' ? 0.24 : 0), 0.32, 0.14);
    }

    // ---- 楼板（k ≥ 1），楼梯上方开井 ----
    if (k > 0) {
      const ks = k - 1; // 下面那部楼梯
      let hole = null;
      if (p.stair) {
        const lane = p.stair.lanes[ks % 2];
        hole = [p.stair.x0, lane[0], p.stair.x1, lane[1]];
      }
      const yS = p.top(k) - SLAB;
      for (const [a, b, c, d] of slabMinusHole(-W / 2 + 0.005, -D / 2 + 0.005, W / 2 - 0.005, p.zf(k) - 0.005, hole)) {
        S.box(M.planks, (a + c) / 2, yS, (b + d) / 2, c - a, SLAB, d - b);
      }
      if (hole) wellRails(p, S, M, ks, p.top(k));
    }
  }

  // ---- 天花板（顶层上方，之后才是屋顶）----
  const zfT = p.zf(F - 1);
  S.box(M.planks, 0, p.top(F) - SLAB, (zfT - D / 2) / 2, W - 0.01, SLAB, zfT + D / 2 - 0.01);

  // ---- 楼梯：每级踏步都是带碰撞的实心块 ----
  if (p.stair) {
    const s = p.stair;
    for (let k = 0; k < F - 1; k++) {
      const lane = s.lanes[k % 2];
      const zc = (lane[0] + lane[1]) / 2;
      const dir = k % 2 === 0 ? 1 : -1;
      for (let i = 0; i < STAIR.steps; i++) {
        const u = dir > 0 ? s.ua + (i + 0.5) * STAIR.run : s.ua + s.L - (i + 0.5) * STAIR.run;
        S.box(M.planks, p.sx * u, p.top(k), zc, STAIR.run, (i + 1) * STAIR.rise, STAIR.width);
        // 踏步前缘木条
        dbox(S, M.timber, p.sx * (u - dir * (STAIR.run / 2 - 0.03)), p.top(k) + (i + 1) * STAIR.rise - 0.05, zc, 0.06, 0.06, STAIR.width + 0.02);
      }
    }
  }

  fireplaceAndChimneys(p, S, M);
  doorway(p, S, M);
  if (p.jetty) jettyBrackets(p, S, M);
  if (st.buttress) buttresses(p, S, M);
  roof(p, S, M);
  if (p.nm) namedFacade(p, X.frame(p.cx, 0, p.cz, p.ry), M, extras);
}

// 井口栏杆：楼梯 k 的井开在第 k+1 层。到达端敞开，其余边（后墙除外）围栏杆。
function wellRails(p, S, M, k, y) {
  const s = p.stair;
  const lane = s.lanes[k % 2];
  const dir = k % 2 === 0 ? 1 : -1;
  const x0 = s.x0;
  const x1 = s.x1;
  // 长边：靠前一侧总有；靠后一侧只在不是后墙时
  railing(S, M, x0, lane[1] - 0.04, x1, lane[1] - 0.04, y);
  if (lane[0] > p.iz0 + 0.01) railing(S, M, x0, lane[0] + 0.04, x1, lane[0] + 0.04, y);
  // 起步端（到达端的对面）
  const uStart = dir > 0 ? s.ua : s.ua + s.L;
  const xs = p.sx * uStart + p.sx * dir * 0.04;
  railing(S, M, xs, lane[0] + 0.02, xs, lane[1] - 0.02, y);
}

function fireplaceAndChimneys(p, S, M) {
  const { F, st } = p;
  const f = p.fire;
  const stone = st.heavyLintel ? M.stoneDark : p.groundMat === 'plaster' ? M.stoneGrey : M[p.groundMat];
  const ry = f.side < 0 ? PI / 2 : -PI / 2; // 面向室内
  const Fr = S.sub(f.xFace, 0, f.z, ry);
  const y0 = p.top(0);
  const oh = f.big ? 1.3 : 1.0;
  const ceil = p.top(1) - SLAB;
  // 两侧炉颊、炉膛后壁、炉腔上方的烟道胸墙、壁炉台
  for (const s of [-1, 1]) Fr.box(stone, s * (f.w / 2 - 0.15), y0, f.d / 2, 0.3, oh, f.d);
  Fr.box(M.stoneDark, 0, y0, 0.08, f.w - 0.6, oh, 0.16);
  Fr.box(stone, 0, y0 + oh, f.d / 2 - 0.02, f.w, ceil - y0 - oh, f.d - 0.04);
  dbox(Fr, M.stoneTrim, 0, y0 + oh, f.d / 2 + 0.06, f.w + 0.24, 0.12, f.d + 0.12);
  dbox(Fr, M.stoneDark, 0, y0, f.d + 0.25, f.w + 0.3, 0.03, 0.5);
  // 上层：烟道柱
  for (let k = 1; k < F; k++) {
    Fr.box(stone, 0, p.top(k), 0.3, Math.min(f.w, 1.3), p.top(k + 1) - SLAB - p.top(k), 0.6);
  }
  // 屋面以上的烟囱
  p.smoke = [];
  for (const c of p.chimneys) {
    const top = p.roof.y + p.roofH(c.x, c.z) + c.extra;
    const mat = st.bigChimney ? M.stoneDark : stone;
    S.box(mat, c.x, p.roof.y - 0.2, c.z, c.w, top - p.roof.y + 0.2, c.w, NC);
    S.box(st.bigChimney ? M.stoneGrey : M.stoneTrim, c.x, top, c.z, c.w + 0.2, 0.18, c.w + 0.2, NC);
    if (st.bigChimney) S.box(M.iron, c.x, top + 0.18, c.z, c.w * 0.5, 0.35, c.w * 0.5, NC);
    p.smoke.push(S.toWorld(c.x, top + (st.bigChimney ? 0.6 : 0.3), c.z));
  }
}

function doorway(p, S, M) {
  const { T, dx, dw, dh } = p;
  const zf = p.zf(0);
  const y0 = p.base;
  const frameMat = p.halfTimber || p.groundMat === 'plaster' ? M.timber : p.st.heavyLintel ? M.stoneGrey : M.stoneTrim;
  for (const s of [-1, 1]) dbox(S, frameMat, dx + s * (dw / 2 + 0.1), y0, zf + 0.04, 0.2, STEP0 + dh + 0.05, 0.1);
  dbox(S, frameMat, dx, y0 + STEP0 + dh, zf + 0.05, dw + 0.5, 0.26, 0.12);
  // 门扇：向内推开 90°
  const zi = zf - T;
  const leaves = dw > 1.7 ? [[-1, dw / 2], [1, dw / 2]] : [[-1, dw]];
  for (const [s, lw] of leaves) {
    const hx = dx + s * (dw / 2 - 0.06);
    S.box(M.planks, hx, y0 + STEP0, zi - lw / 2, 0.07, dh - 0.04, lw - 0.04, NC);
    S.box(M.iron, hx + -s * 0.04, y0 + STEP0 + 0.4, zi - lw / 2, 0.02, 0.06, lw - 0.1, NC);
    S.box(M.iron, hx + -s * 0.04, y0 + STEP0 + dh - 0.5, zi - lw / 2, 0.02, 0.06, lw - 0.1, NC);
  }
  // 门前石阶
  dbox(S, p.st.heavyLintel ? M.stoneGrey : M.stoneTrim, dx, y0, zf + 0.3, dw + 0.5, 0.08, 0.6);
}

function jettyBrackets(p, S, M) {
  const { W } = p;
  const zf = p.zf(0);
  const y = p.top(1) - SLAB;
  const n = Math.max(2, Math.round(W / 1.8));
  // 放置前冲突检查：牛腿 x 落在底层正面任何窗 / 门洞（含窗楣、门框）±0.3 m 内就跳过
  const holes = [...p.win[0].front.map((a) => [a - WIN.w / 2 - 0.16, a + WIN.w / 2 + 0.16]), [p.dx - p.dw / 2 - 0.35, p.dx + p.dw / 2 + 0.35]];
  for (let i = 0; i <= n; i++) {
    const x = -W / 2 + 0.12 + ((W - 0.24) * i) / n;
    if (holes.some(([a, b]) => x + 0.08 > a - 0.3 && x - 0.08 < b + 0.3)) continue;
    dbox(S, M.timber, x, y - 0.5, zf + 0.22, 0.16, 0.5, 0.44);
  }
  // 出挑楼板外缘的封檐木
  dbox(S, M.timber, 0, y - 0.04, p.zf(1) + 0.02, W + 0.04, SLAB + 0.08, 0.06);
}

function buttresses(p, S, M) {
  const { W } = p;
  const zf = p.zf(0);
  const H = p.top(Math.min(p.F, 1)) - p.base - 0.2;
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.35);
    S.box(M.stoneDark, x, p.base, zf + 0.25, 0.7, H * 0.55, 0.5);
    S.box(M.stoneDark, x, p.base + H * 0.55, zf + 0.15, 0.55, H * 0.35, 0.3);
    dbox(S, M.stoneGrey, x, p.base + H * 0.55 - 0.12, zf + 0.25, 0.78, 0.14, 0.58);
  }
}

function roof(p, S, M) {
  const r = p.roof;
  const { W, D, T, st } = p;
  const RF = S.sub(0, r.y, r.cz, r.ridgeX ? 0 : PI / 2);
  const w = r.length;
  const d = r.span;
  const roofMat = M.tone(p.roofMat, p.roofTone);
  const capMat = st.heavyLintel ? M.stoneGrey : p.roofMat === 'roofPurple' ? M.stoneTrim : M.timber;
  addGableRoof(RF, roofMat, w, d, r.rise, r.over * 0.7, r.over, r.th, capMat);
  // 山墙
  const gableMat = M.tone(p.upperMat, p.tone);
  const g = gableEndGeo(d, r.rise, T);
  for (const s of [-1, 1]) {
    RF.add(gableMat, g, mat4(s * (w / 2 - T / 2), 0, 0));
    const zOut = T / 2 + 0.03;
    // 山墙在 RF 的 x 端；在它朝外的面上贴饰件。用一个朝外的子帧：
    const GF = RF.sub(s * (w / 2 - T / 2), 0, 0, s > 0 ? PI / 2 : -PI / 2);
    if (p.halfTimber) {
      dbox(GF, M.timber, 0, 0, zOut, 0.2, r.rise * 0.92, 0.06); // 中柱
      const yb = r.rise * 0.45;
      const half = (d / 2) * (1 - yb / r.rise);
      dbox(GF, M.timber, 0, yb, zOut, half * 2, 0.18, 0.06); // 系梁
      diag(GF, M, -half * 0.95, yb + 0.1, 0, r.rise * 0.85, zOut, false);
      diag(GF, M, 0, r.rise * 0.85, half * 0.95, yb + 0.1, zOut, false);
    }
    // 山墙小通风窗（透出阁楼的暗光）
    if (r.rise > 2.2) {
      const gw = 0.6;
      GF.add(glowFor(p, M, 900 + s), new THREE.PlaneGeometry(gw, 0.8), mat4(0, r.rise * 0.42, zOut + 0.02));
      dbox(GF, p.halfTimber ? M.timber : M.stoneTrim, 0, r.rise * 0.42 - 0.5, zOut + 0.01, gw + 0.2, 0.1, 0.08);
    }
    if (st.finials) {
      const cone = coneGeo(0.22, 1.2, 8);
      RF.add(M.roofPurple, cone, mat4(s * (w / 2 + r.over * 0.7 - 0.2), r.rise + 0.15, 0));
      RF.add(M.arcane, new THREE.SphereGeometry(0.14, 8, 6), mat4(s * (w / 2 + r.over * 0.7 - 0.2), r.rise + 1.4, 0));
    }
  }
  // 老虎窗：前坡上的小屋 + 小双坡顶 + 窗
  for (const dm of p.dormers) {
    const dwid = 1.7;
    const zFront = (d / 2) * 0.42;
    const yBase = r.rise * (1 - zFront / (d / 2)) - 0.15;
    const hgt = 1.35;
    const depth = 2.2;
    const wall = M.tone(p.upperMat, p.tone);
    dbox(RF, wall, dm.x, yBase, zFront - depth / 2, dwid, hgt, depth);
    RF.add(glowFor(p, M, 950 + p.dormers.indexOf(dm)), new THREE.PlaneGeometry(0.8, 0.85), mat4(dm.x, yBase + 0.6, zFront + 0.02));
    dbox(RF, M.timber, dm.x, yBase + 0.15, zFront + 0.01, 1.0, 0.08, 0.06);
    dbox(RF, M.timber, dm.x, yBase + 1.05, zFront + 0.01, 1.0, 0.08, 0.06);
    const DF = RF.sub(dm.x, yBase + hgt, zFront - depth / 2, PI / 2);
    addGableRoof(DF, roofMat, depth, dwid, 0.75, 0.15, 0.2, 0.14, null);
    DF.add(wall, gableEndGeo(dwid, 0.75, 0.1), mat4(-depth / 2 + 0.05, 0, 0));
  }
  void D;
}

// 命名建筑的门面：刀形招牌、旗帜、门柱
function namedFacade(p, XF, M, extras) {
  const { dx, dw, dh } = p;
  const zf = p.zf(0);
  const y0 = p.base;
  // 刀形招牌：从墙面挑出的木臂 + 吊牌（两面都有字）
  const bannerOff = p.nm.columns ? 1.4 : 0.75;
  const bladeOff = p.nm.banners ? bannerOff + 0.85 : 0.75;
  const side = dx + dw / 2 + bladeOff < p.W / 2 - 0.4 ? 1 : -1;
  const sx = dx + side * (dw / 2 + bladeOff);
  const armY = Math.min(y0 + STEP0 + dh + 0.25, p.top(1) - SLAB - 0.2);
  dbox(XF, M.timber, sx, armY, zf + 0.875, 0.1, 0.1, 1.75);
  dbox(XF, M.timber, sx, armY - 0.32, zf + 0.12, 0.08, 0.42, 0.08);
  dbox(XF, M.iron, sx, armY - 0.42, zf + 0.5, 0.02, 0.42, 0.02);
  dbox(XF, M.iron, sx, armY - 0.42, zf + 1.4, 0.02, 0.42, 0.02);
  const bw = 1.3;
  const bh = 0.5;
  const by = armY - 0.42 - bh;
  dbox(XF, M.timber, sx, by - 0.04, zf + 0.95, 0.05, bh + 0.08, bw + 0.08);
  const geo = extras.signGeo(p.name, bw, bh);
  XF.add(extras.signMat, geo, mat4(sx + 0.03, by + bh / 2, zf + 0.95, 0, PI / 2, 0));
  XF.add(extras.signMat, geo, mat4(sx - 0.03, by + bh / 2, zf + 0.95, 0, -PI / 2, 0));
  if (p.nm.banners) {
    for (const s of [-1, 1]) {
      const bx = dx + s * (dw / 2 + bannerOff);
      dbox(XF, M.gold, bx, y0 + 3.0, zf + 0.12, 1.0, 0.06, 0.06);
      XF.add(M.banner, new THREE.PlaneGeometry(0.85, 2.0), mat4(bx, y0 + 2.0, zf + 0.1));
    }
  }
  if (p.nm.columns) {
    for (const s of [-1, 1]) {
      const cx = dx + s * (dw / 2 + 0.5);
      XF.box(M.stoneTrim, cx, y0, zf + 0.35, 0.6, 0.3, 0.6);
      XF.add(M.stoneWhite, new THREE.CylinderGeometry(0.22, 0.25, 2.6, 12), mat4(cx, y0 + 0.3 + 1.3, zf + 0.35));
      dbox(XF, M.stoneTrim, cx, y0 + 2.9, zf + 0.35, 0.6, 0.25, 0.6);
      dbox(XF, M.gold, cx, y0 + 3.15, zf + 0.35, 0.35, 0.08, 0.35);
    }
    dbox(XF, M.stoneTrim, dx, y0 + 3.15, zf + 0.4, dw + 1.8, 0.2, 0.7);
  }
}

export { FLOOR_H };
