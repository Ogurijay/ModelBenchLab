// bg.js — 程序化生成的对战背景(全部原创设计,纯 Canvas 2D,无外部素材)
//
// 设计要点:
//  * 每张地图在 createBackground() 时把各视差层一次性预渲染到离屏 canvas;
//    每帧 draw() 只做若干次 drawImage(按可视窗口裁切)+ 少量廉价动画图元。
//  * 种子化 PRNG(mulberry32),同一张图每次载入完全一致。
//  * 90 年代手绘像素风:分段色带 + 4×4 有序抖动过渡、硬边透明(去抗锯齿)、有限调色板。
//  * 坐标:画布 794×550,顶部 0..128 会被 HUD 覆盖;地面带 zMin..zMax 是角色脚底的屏幕 y。

const VW = 794;
const VH = 550;

export const BG_LIST = [
  { id: 'forest', name: 'Pine Valley' },
  { id: 'prison', name: 'Iron Gate Prison' },
  { id: 'wall', name: 'Dragon Wall' },
  { id: 'isle', name: 'Coral Isle' },
  { id: 'spire', name: 'Obsidian Spire' },
  { id: 'arena', name: 'Harbor Arena' },
  { id: 'temple', name: 'Mountain Temple' },
  { id: 'town', name: 'Old Town Street' },
];

// ===================================================================
// 基础工具
// ===================================================================

function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.r = (lo, hi) => lo + (hi - lo) * f();
  f.i = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}

// 无状态整数哈希 → [0,1),用于逐帧确定性的小随机(闪光、闪电等)
function hash01(a, b = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

function mk(w, h) {
  w = Math.max(1, Math.ceil(w));
  h = Math.max(1, Math.ceil(h));
  let c;
  if (typeof document !== 'undefined' && document.createElement) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
  } else if (typeof OffscreenCanvas !== 'undefined') {
    c = new OffscreenCanvas(w, h);
  } else {
    throw new Error('bg.js: no canvas implementation available');
  }
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g, w, h };
}

// 视差层需要的宽度:可视 794 + 可滚动距离 × 系数
const layerW = (f, W) => Math.ceil(VW + Math.max(0, W - VW) * f) + 2;

function rgbOf(c) {
  if (Array.isArray(c)) return c;
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function css(c) {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}
function mixc(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return css([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}

// 4×4 Bayer 阈值
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function normStops(stops) {
  return stops.map((s, i) =>
    Array.isArray(s) ? [s[0], rgbOf(s[1])] : [i / (stops.length - 1), rgbOf(s)]);
}
function sampleStops(st, t) {
  if (t <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++) {
    if (t <= st[i][0]) {
      const a = st[i - 1], b = st[i];
      const k = (t - a[0]) / (b[0] - a[0] || 1);
      return [lerp(a[1][0], b[1][0], k), lerp(a[1][1], b[1][1], k), lerp(a[1][2], b[1][2], k)];
    }
  }
  return st[st.length - 1][1];
}

// 分段色带渐变 + 有序抖动过渡(90 年代 256 色观感)
function ditherGrad(w, h, stops, bands = 8, horiz = false) {
  const L = mk(w, h);
  const st = normStops(stops);
  const n = Math.max(2, bands);
  const pal = [];
  for (let i = 0; i < n; i++) pal.push(sampleStops(st, i / (n - 1)).map(Math.round));
  const img = L.g.createImageData(L.w, L.h);
  const d = img.data;
  const len = Math.max(1, (horiz ? L.w : L.h) - 1);
  let p = 0;
  for (let y = 0; y < L.h; y++) {
    const by = (y & 3) << 2;
    for (let x = 0; x < L.w; x++, p += 4) {
      const tf = ((horiz ? x : y) / len) * (n - 1);
      let i = tf | 0;
      if (tf - i > BAYER[by | (x & 3)]) i++;
      if (i >= n) i = n - 1;
      const c = pal[i];
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255;
    }
  }
  L.g.putImageData(img, 0, 0);
  return L.c;
}

// 抖动图案填充:c1 占比 t,其余为 c2(null = 透明)
const patSrc = new Map();
function dpat(g, c1, c2, t) {
  const key = c1 + '|' + c2 + '|' + Math.round(t * 16);
  let src = patSrc.get(key);
  if (!src) {
    const L = mk(4, 4);
    for (let i = 0; i < 16; i++) {
      const col = BAYER[i] < t ? c1 : c2;
      if (col) {
        L.g.fillStyle = col;
        L.g.fillRect(i & 3, i >> 2, 1, 1);
      }
    }
    src = L.c;
    patSrc.set(key, src);
  }
  return g.createPattern(src, 'repeat');
}

// 透明度二值化:去掉抗锯齿半透明边,得到硬朗像素轮廓
function crisp(L, thr = 120) {
  const img = L.g.getImageData(0, 0, L.w, L.h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= thr ? 255 : 0;
  L.g.putImageData(img, 0, 0);
}

// 一维分形值噪声(每个倍频 [波长px, 幅度])
function fbm(rnd, w, octs) {
  const out = new Float32Array(w);
  for (const [wl, amp] of octs) {
    const cells = Math.ceil(w / wl) + 3;
    const v = new Float32Array(cells + 1);
    for (let i = 0; i <= cells; i++) v[i] = rnd() * 2 - 1;
    const ph = rnd() * wl;
    for (let x = 0; x < w; x++) {
      const f = (x + ph) / wl;
      const i = f | 0;
      const t = f - i;
      const s = t * t * (3 - 2 * t);
      out[x] += (v[i] + (v[i + 1] - v[i]) * s) * amp;
    }
  }
  return out;
}

// 轮廓线:返回每列的 y(落在 top..bottom),pow>1 使山峰更尖
function profile(rnd, w, top, bottom, octs, pow = 1) {
  const n = fbm(rnd, w, octs);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < w; i++) { if (n[i] < lo) lo = n[i]; if (n[i] > hi) hi = n[i]; }
  const span = hi - lo || 1;
  for (let i = 0; i < w; i++) n[i] = bottom - Math.pow((n[i] - lo) / span, pow) * (bottom - top);
  return n;
}

function fillProfile(g, hs, bottom, x0 = 0) {
  g.beginPath();
  g.moveTo(x0, bottom);
  for (let x = 0; x < hs.length; x++) g.lineTo(x0 + x, hs[x]);
  g.lineTo(x0 + hs.length, bottom);
  g.closePath();
  g.fill();
}

function ellipse(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  g.fill();
}
function tri(g, x1, y1, x2, y2, x3, y3) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.closePath();
  g.fill();
}
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}
function rect(g, col, x, y, w, h) {
  g.fillStyle = col;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// 3×5 像素字体(广告牌、招牌用)
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111',
  V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111',
  3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100110101010',
  7: '111001010010010', 8: '010101010101010', 9: '010101011001110', '!': '010010010000010',
  '-': '000000111000000', '.': '000000000000010', ' ': '000000000000000',
};
function pixText(g, str, x, y, s, col) {
  g.fillStyle = col;
  let cx = Math.round(x);
  for (const ch of String(str).toUpperCase()) {
    const gl = FONT[ch];
    if (gl) {
      for (let i = 0; i < 15; i++) {
        if (gl[i] === '1') g.fillRect(cx + (i % 3) * s, Math.round(y) + ((i / 3) | 0) * s, s, s);
      }
    }
    cx += 4 * s;
  }
}
const textW = (str, s) => String(str).length * 4 * s - s;

// ===================================================================
// 通用绘制部件
// ===================================================================

// 积云精灵:平底、左上受光
function cloudSprite(rnd, w, h, light, mid, dark) {
  const L = mk(w, h), g = L.g;
  const n = Math.max(3, Math.round(w / 16));
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const env = Math.sin(Math.PI * t);
    const r = Math.max(2, (h * 0.18 + h * 0.36 * env) * rnd.r(0.75, 1.1));
    puffs.push([w * (0.1 + 0.8 * t) + rnd.r(-4, 4), h - 3 - r * rnd.r(0.55, 0.9), r]);
  }
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h - 2);
  g.clip();
  g.fillStyle = dark;
  for (const [x, y, r] of puffs) ellipse(g, x + 1, y + 2, r, r);
  g.fillStyle = mid;
  for (const [x, y, r] of puffs) ellipse(g, x - 1, y, r * 0.92, r * 0.9);
  g.fillStyle = light;
  for (const [x, y, r] of puffs) ellipse(g, x - r * 0.25, y - r * 0.22, r * 0.62, r * 0.58);
  g.restore();
  crisp(L);
  return L.c;
}

// 漂移云:返回逐帧绘制函数(只做 drawImage)
function cloudDrift(rnd, n, y0, y1, f, cols, w0, w1, sp0, sp1) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const w = Math.round(rnd.r(w0, w1));
    const h = Math.round(w * rnd.r(0.24, 0.34));
    list.push({ img: cloudSprite(rnd, w, h, cols[0], cols[1], cols[2]), x0: rnd.r(0, 2000), y: Math.round(rnd.r(y0, y1)), sp: rnd.r(sp0, sp1) });
  }
  return (ctx, camX, tick) => {
    for (const c of list) {
      const span = VW + c.img.width + 240;
      let x = (c.x0 + tick * c.sp - camX * f) % span;
      if (x < 0) x += span;
      ctx.drawImage(c.img, Math.round(x - c.img.width - 120), c.y);
    }
  };
}

// 山脉:基色填充 + 按(平滑后)坡向的明暗刻面 + 雪顶
function mountains(g, hs, bottom, o) {
  g.fillStyle = o.base;
  fillProfile(g, hs, bottom);
  const w = hs.length;
  const depth = o.depth || 60;
  const facet = o.facet || null;
  const R = o.smooth || 5;
  const sl = new Float32Array(w);
  for (let x = 0; x < w; x++) sl[x] = (hs[Math.min(w - 1, x + R)] - hs[Math.max(0, x - R)]) / (2 * R);
  for (let x = 0; x < w; x++) {
    const s = sl[x];
    const top = Math.round(hs[x]);
    const rel = bottom - top;
    const k = facet ? 0.6 + 0.4 * facet[x] : 1;
    if (s > 0.1 && o.dark) {
      const len = Math.min(rel, Math.round(depth * k * Math.min(1.6, 0.45 + s * 1.3)));
      g.fillStyle = o.dark;
      g.fillRect(x, top, 1, len);
      if (o.dark2 && s > 0.8) {
        g.fillStyle = o.dark2;
        g.fillRect(x, top, 1, Math.round(len * 0.4));
      }
    } else if (s < -0.15 && o.lit) {
      const len = Math.min(rel, Math.round(depth * 0.55 * k * Math.min(1.4, 0.35 - s)));
      g.fillStyle = o.lit;
      g.fillRect(x, top, 1, len);
      if (o.rim) {
        g.fillStyle = o.rim;
        g.fillRect(x, top, 1, 1);
      }
    }
    if (o.snow && top < o.snowY) {
      g.fillStyle = o.snow;
      g.fillRect(x, top, 1, Math.max(1, Math.round((o.snowY - top) * (0.35 + 0.3 * (facet ? facet[x] : 0.5)))));
    }
  }
}

// 薄层云(扁椭圆叠加)
function streakCloud(rnd, w, h, light, mid) {
  const L = mk(w, h), g = L.g;
  const n = Math.max(3, Math.round(w / 24));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const rx = w * rnd.r(0.12, 0.22), ry = h * rnd.r(0.25, 0.45) * Math.sin(Math.PI * t) + 1;
    const x = w * (0.08 + 0.84 * t), y = h * 0.62 + rnd.r(-1, 1);
    g.fillStyle = mid;
    ellipse(g, x, y, rx, ry);
    g.fillStyle = light;
    ellipse(g, x - rx * 0.1, y - ry * 0.35, rx * 0.8, ry * 0.55);
  }
  crisp(L);
  return L.c;
}

// 底部雾霭:从 y 开始往下逐渐抖动成 col
function hazeBand(g, w, y, h, col, steps = 4, maxT = 1) {
  const sh = h / steps;
  for (let i = 0; i < steps; i++) {
    g.fillStyle = dpat(g, col, null, ((i + 1) / steps) * maxT);
    g.fillRect(0, Math.round(y + i * sh), w, Math.ceil(sh));
  }
}

// 针叶树(分层三角 + 锯齿边 + 左亮右暗)
function pine(g, cx, by, h, w, base, lit, dark, trunk) {
  const tiers = Math.max(2, Math.min(8, Math.round(h / Math.max(6, w * 0.42))));
  const trunkH = trunk ? Math.max(2, h * 0.1) : 0;
  const top = by - h;
  const fh = h - trunkH;
  if (trunk) rect(g, trunk, cx - Math.max(1, w * 0.06), by - trunkH - 3, Math.max(2, w * 0.12), trunkH + 3);
  for (let i = 0; i < tiers; i++) {
    const ty = top + fh * (i / tiers) * 0.8;
    const bot = top + fh * ((i + 1) / tiers);
    const hw = (w / 2) * (0.28 + 0.72 * ((i + 1) / tiers));
    g.fillStyle = base;
    tri(g, cx, ty, cx + hw, bot, cx - hw, bot);
    if (hw > 7) {
      // 下缘锯齿针叶
      for (let k = -hw + 2; k < hw - 2; k += 5) tri(g, cx + k, bot - 1, cx + k + 5, bot - 1, cx + k + 2, bot + 3);
    }
    if (dark) {
      g.fillStyle = dark;
      tri(g, cx + 1, ty + 1, cx + hw, bot, cx + hw * 0.18, bot);
      if (hw > 7) for (let k = Math.ceil(hw * 0.2); k < hw - 2; k += 5) tri(g, cx + k, bot - 1, cx + k + 5, bot - 1, cx + k + 2, bot + 3);
    }
    if (lit) {
      g.fillStyle = lit;
      tri(g, cx - 1, ty + (bot - ty) * 0.22, cx - hw * 0.82, bot - 1, cx - hw * 0.3, bot - 2);
    }
  }
}

// 灌木带:顶部凹凸的一排圆团
function bushes(g, w, yTop, yBot, cols, rnd, size = 14) {
  const [dark, mid, lit] = cols;
  g.fillStyle = dark;
  g.fillRect(0, Math.round(yTop + size * 0.7), w, Math.ceil(yBot - yTop));
  for (let x = -size; x < w + size; x += size * rnd.r(0.45, 0.85)) {
    const r = size * rnd.r(0.65, 1.15);
    const y = yTop + rnd.r(0, size * 0.7) + r * 0.35;
    g.fillStyle = dark;
    ellipse(g, x, y + 2, r, r * 0.8);
    g.fillStyle = mid;
    ellipse(g, x - 1, y, r * 0.84, r * 0.66);
    if (lit) {
      g.fillStyle = lit;
      ellipse(g, x - r * 0.35, y - r * 0.3, r * 0.34, r * 0.22);
    }
  }
}

// 卵石
function stone(g, x, y, rx, ry, base, lit, dark) {
  g.fillStyle = dark;
  ellipse(g, x + rx * 0.06, y + ry * 0.1, rx, ry);
  g.fillStyle = base;
  ellipse(g, x - rx * 0.06, y - ry * 0.08, rx * 0.9, ry * 0.82);
  g.fillStyle = lit;
  ellipse(g, x - rx * 0.32, y - ry * 0.38, rx * 0.42, ry * 0.3);
}

// 草簇
function tuft(g, x, y, s, dark, lit) {
  const n = s > 0.7 ? 5 : 3;
  x = Math.round(x);
  y = Math.round(y);
  for (let i = 0; i < n; i++) {
    const off = i - (n - 1) / 2;
    const dx = Math.round(off * 2 * s);
    const hh = Math.max(2, Math.round((i % 2 ? 4 : 6) * s + 1));
    g.fillStyle = i % 2 ? lit : dark;
    g.fillRect(x + dx, y - hh, 1, hh);
    g.fillRect(x + dx + Math.sign(off), y - hh - 1, 1, 1);
  }
}

// 地面横向色带:越靠近镜头越厚(透视压缩)
function floorRows(g, W, top, bottom, cols, h0, grow, rnd) {
  let y = top, k = 0, prev = null;
  while (y < bottom) {
    const h = Math.max(1, Math.round(h0 * Math.pow(grow, k)));
    const c = cols[(k + (rnd() < 0.35 ? 1 : 0)) % cols.length];
    g.fillStyle = c;
    g.fillRect(0, y, W, h);
    if (prev && prev !== c && h > 2) {
      g.fillStyle = dpat(g, prev, null, 0.5);
      g.fillRect(0, y, W, 1);
    }
    prev = c;
    y += h;
    k++;
  }
}

// 地面短笔触纹理(尺寸随深度缩放)
function floorDashes(g, W, top, bottom, n, cols, rnd, l0 = 3, l1 = 12, thick = 1.6) {
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rnd(), 0.8);
    const s = 0.3 + 0.7 * t;
    g.fillStyle = cols[(rnd() * cols.length) | 0];
    g.fillRect(Math.round(rnd() * W), Math.round(top + t * (bottom - top)),
      Math.max(1, Math.round(rnd.r(l0, l1) * s)), Math.max(1, Math.round(thick * s)));
  }
}

// 透视比例:地面 top→bottom 映射到 0.35→1
const perspS = (y, top, bottom) => 0.35 + 0.65 * clamp((y - top) / (bottom - top), 0, 1);

// 透视接缝线(逐帧画:几条直线,汇聚到屏幕中轴上方的灭点)
function fanSeams(spacing, top, bottom, col, vy = -260, off = 0) {
  const k = (top - vy) / (bottom - vy);
  return (ctx, camX) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const cx = VW / 2;
    const first = Math.floor((camX - VW) / spacing) * spacing + off;
    for (let X = first; X < camX + VW * 2; X += spacing) {
      const xb = X - camX;
      const xt = cx + (xb - cx) * k;
      if (Math.max(xb, xt) < -2 || Math.min(xb, xt) > VW + 2) continue;
      ctx.moveTo(Math.round(xt) + 0.5, top);
      ctx.lineTo(Math.round(xb) + 0.5, bottom);
    }
    ctx.stroke();
  };
}

// 火焰帧(外→内多层舌形)
function flameFrames(rnd, w, h, cols, n = 4) {
  const frames = [];
  for (let k = 0; k < n; k++) {
    const L = mk(w, h), g = L.g;
    cols.forEach((c, j) => {
      const sc = 1 - j * 0.28;
      g.fillStyle = c;
      for (let t = 0; t < 3; t++) {
        const cx = w / 2 + (t - 1) * w * 0.17 * sc + rnd.r(-1.2, 1.2);
        const th = h * sc * (t === 1 ? rnd.r(0.8, 1) : rnd.r(0.45, 0.75));
        const bw = w * 0.3 * sc;
        g.beginPath();
        g.moveTo(cx - bw, h);
        g.quadraticCurveTo(cx - bw * 1.05, h - th * 0.45, cx + rnd.r(-2, 2), h - th);
        g.quadraticCurveTo(cx + bw * 1.05, h - th * 0.45, cx + bw, h);
        g.closePath();
        g.fill();
      }
    });
    crisp(L);
    frames.push(L.c);
  }
  return frames;
}

// 世界坐标锚定的小精灵(按层系数换算屏幕 x;仅在可见时绘制)
function drawAt(ctx, img, lx, y, f, camX) {
  const x = Math.round(lx - camX * f);
  if (x > VW || x + img.width < 0) return;
  ctx.drawImage(img, x, Math.round(y));
}

// 层对象
const layer = (L, f, y, extra) => Object.assign({ img: L.c || L, f, y }, extra);

function drawLayer(ctx, Ly, camX, tick) {
  const img = Ly.img;
  const w = img.width, h = img.height;
  const off = Math.round(camX * Ly.f + (Ly.vx ? tick * Ly.vx : 0) - (Ly.x || 0));
  if (Ly.tile) {
    let sx = ((off % w) + w) % w, dx = 0;
    while (dx < VW) {
      const cw = Math.min(w - sx, VW - dx);
      ctx.drawImage(img, sx, 0, cw, h, dx, Ly.y, cw, h);
      dx += cw;
      sx = 0;
    }
  } else {
    let sx = off, dx = 0, cw = VW;
    if (sx < 0) { dx = -sx; cw -= dx; sx = 0; }
    if (sx + cw > w) cw = w - sx;
    if (cw > 0) ctx.drawImage(img, sx, 0, cw, h, dx, Ly.y, cw, h);
  }
}

// 前景小草(drawFront 用,只占画面最底部几像素)
function frontTufts(rnd, W, f, n, dark, lit, hgt = 14) {
  const w = layerW(f, W);
  const L = mk(w, hgt);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const s = rnd.r(1.1, 1.6);
    for (let j = 0; j < 3; j++) tuft(L.g, x + j * 5 * s - 5, hgt, s, dark, lit);
  }
  return layer(L, f, VH - hgt);
}

// ===================================================================
// 1) Pine Valley — 松林溪谷:远山雪峰、松林、林前小溪、草地
// ===================================================================
function buildForest(rnd) {
  const W = 3000, zMin = 362, zMax = 530;
  const steps = [];

  // 天空
  {
    const f = 0.04, w = layerW(f, W), h = 330;
    const L = mk(w, h);
    L.g.drawImage(ditherGrad(w, h, [[0, '#3c6aae'], [0.42, '#6c9cd2'], [0.74, '#a3c8e4'], [1, '#d4e8ea']], 10), 0, 0);
    for (let i = 0; i < 8; i++) {
      const cw = Math.round(rnd.r(50, 150)), ch = Math.round(rnd.r(7, 14));
      L.g.drawImage(streakCloud(rnd, cw, ch, '#eef4f6', '#cddff0'), Math.round(rnd.r(0, w - cw)), Math.round(rnd.r(196, 250)));
    }
    steps.push(layer(L, f, 0));
  }
  steps.push(cloudDrift(rnd, 4, 136, 190, 0.06, ['#ffffff', '#e0eaf4', '#b0c4dc'], 90, 170, 0.04, 0.09));

  // 远山(雪峰)
  {
    const f = 0.12, w = layerW(f, W), y0 = 140, h = 175;
    const L = mk(w, h), g = L.g;
    const facet = profile(rnd, w, 0, 1, [[70, 1], [24, 0.35]]);
    const h1 = profile(rnd, w, 14, 110, [[230, 1], [80, 0.5], [26, 0.18]], 1.5);
    mountains(g, h1, h, { base: '#8ea2c0', dark: '#7a8eae', dark2: '#6f83a4', lit: '#a8bad4', snow: '#e2eaf2', snowY: 58, depth: 80, facet });
    const h2 = profile(rnd, w, 72, 132, [[170, 1], [50, 0.35], [15, 0.1]], 1.2);
    mountains(g, h2, h, { base: '#6e88a6', dark: '#5f7898', lit: '#86a0ba', depth: 44, facet });
    hazeBand(g, w, 124, 51, '#9cb4c8', 4, 0.9);
    steps.push(layer(L, f, y0));
  }

  // 中景松林丘陵
  {
    const f = 0.3, w = layerW(f, W), y0 = 205, h = 150;
    const L = mk(w, h), g = L.g;
    const hs = profile(rnd, w, 34, 84, [[320, 1], [90, 0.3]]);
    g.fillStyle = '#3e5e62';
    fillProfile(g, hs, h);
    const trees = [];
    for (let x = -10; x < w + 10; x += rnd.r(4, 9)) {
      const xi = clamp(Math.round(x), 0, w - 1);
      const ph = rnd.r(16, 38);
      trees.push({ x, by: hs[xi] + rnd.r(2, 36), h: ph });
    }
    trees.sort((a, b) => a.by - b.by);
    for (const t of trees) pine(g, t.x, t.by, t.h, t.h * 0.42, '#3a5a5c', '#4e7070', '#2c484c');
    crisp(L);
    hazeBand(g, w, 96, 54, '#56787a', 3, 0.5);
    steps.push(layer(L, f, y0));
  }

  // 近景大松树 + 林下灌木(溪流对岸)
  {
    const f = 0.65, w = layerW(f, W), y0 = 20, h = 326;
    const L = mk(w, h), g = L.g;
    // 后排小松:成簇分布,留出缝隙看远山
    const back = [];
    for (let x = -40; x < w + 40;) {
      const n = rnd.i(2, 6);
      for (let i = 0; i < n; i++, x += rnd.r(16, 30)) back.push({ x, by: rnd.r(300, 314), h: rnd.r(55, 105), w: rnd.r(30, 46) });
      x += rnd.r(40, 120);
    }
    back.sort((a, b) => a.by - b.by);
    for (const t of back) pine(g, t.x, t.by, t.h, t.w, '#35594c', '#486f60', '#284438', '#3e2c22');
    // 大松树
    for (let x = rnd.r(60, 140); x < w - 20; x += rnd.r(260, 430)) {
      const by = rnd.r(312, 320), th = rnd.r(290, 330), tw = rnd.r(120, 160);
      const trW = Math.round(tw * 0.13);
      const fb = by - 58;
      rect(g, '#4a3020', x - trW / 2, by - 130, trW, 130);
      rect(g, '#6e4a30', x - trW / 2 + 2, by - 130, Math.max(2, trW * 0.3), 130);
      rect(g, '#33200f', x + trW / 2 - 3, by - 130, 3, 130);
      for (let y = by - 125; y < by; y += rnd.r(6, 12)) rect(g, '#3a2414', x - trW / 2 + rnd.r(2, trW - 4), y, 2, rnd.r(3, 6));
      // 根部外张
      tri(g, x - trW / 2 - 6, by, x - trW / 2 + 2, by - 14, x - trW / 2 + 4, by);
      tri(g, x + trW / 2 + 6, by, x + trW / 2 - 2, by - 14, x + trW / 2 - 4, by);
      pine(g, x, fb, th - 58, tw, '#2c5430', '#3e6e3a', '#1d3a22');
      for (let i = 0; i < 46; i++) {
        const yy = fb - rnd.r(10, th - 80);
        const prog = 1 - (fb - yy) / (th - 58);
        rect(g, '#5a8a48', x - rnd.r(4, tw * 0.45 * prog), yy, rnd.r(3, 7), 1);
      }
    }
    bushes(g, w, 290, h, ['#24421f', '#31532a', '#46703a'], rnd, 13);
    crisp(L);
    steps.push(layer(L, f, y0));
  }

  // 地面:对岸 / 溪流 / 卵石岸 / 草地
  const gy = 320;
  {
    const h = VH - gy;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - gy;
    // 溪流
    g.drawImage(ditherGrad(W, 24, ['#2a4c46', '#3c7086', '#5890aa', '#4f88a2', '#447c96'], 6), 0, Y(334));
    for (let i = 0; i < 900; i++) {
      const y = Y(rnd.r(340, 356));
      rect(g, rnd.chance(0.6) ? '#6fa2bc' : '#3a6a84', rnd() * W, y, rnd.r(4, 16), 1);
    }
    // 对岸(不规则顶边 + 不规则水线)
    const farTop = profile(rnd, W, Y(326), Y(333), [[50, 1], [14, 0.5]]);
    const farBot = profile(rnd, W, Y(338), Y(342), [[80, 1], [20, 0.4]]);
    g.fillStyle = '#2f4d28';
    g.beginPath();
    g.moveTo(0, farBot[0]);
    for (let x = 0; x < W; x++) g.lineTo(x, farTop[x]);
    for (let x = W - 1; x >= 0; x--) g.lineTo(x, farBot[x]);
    g.closePath();
    g.fill();
    for (let x = 0; x < W; x += 2) if (rnd.chance(0.35)) rect(g, '#3f6634', x, farTop[x], 2, 2);
    // 倒影
    g.fillStyle = dpat(g, '#25433e', null, 0.5);
    for (let x = 0; x < W; x += 4) g.fillRect(x, Math.round(farBot[x]), 4, 3);
    // 近岸 + 草地底色
    const nearEdge = profile(rnd, W, Y(353), Y(358), [[90, 1], [22, 0.4]]);
    g.fillStyle = '#5c5640';
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x < W; x++) g.lineTo(x, nearEdge[x]);
    g.lineTo(W, h);
    g.closePath();
    g.fill();
    floorRows(g, W, Y(362), h, ['#5a8139', '#5f873d', '#56793a', '#5c843b'], 3, 1.13, rnd);
    floorDashes(g, W, Y(362), h, 5200, ['#6d9546', '#74a04c', '#4d7032', '#527637', '#628c40'], rnd, 3, 12, 1.6);
    // 泥土斑块
    for (let i = 0; i < 9; i++) {
      const y = Y(rnd.r(380, 530)), s = perspS(y + gy, 362, 550);
      const x = rnd() * W, rx = rnd.r(40, 90) * s, ry = rnd.r(6, 12) * s;
      g.fillStyle = dpat(g, '#7d6e4a', null, 0.5);
      ellipse(g, x, y, rx * 1.25, ry * 1.3);
      g.fillStyle = '#7d6e4a';
      ellipse(g, x, y, rx, ry);
      g.fillStyle = '#8c7c54';
      ellipse(g, x - rx * 0.2, y - ry * 0.25, rx * 0.5, ry * 0.4);
    }
    // 草簇、小花
    for (let i = 0; i < 520; i++) {
      const y = Y(rnd.r(366, 548)), s = perspS(y + gy, 362, 550);
      tuft(g, rnd() * W, y, s, '#456a2e', '#79a650');
    }
    for (let i = 0; i < 160; i++) {
      const y = Y(rnd.r(370, 545)), s = perspS(y + gy, 362, 550);
      const c = rnd.pick(['#e8e4c8', '#e8d070', '#d8a0c0']);
      rect(g, c, rnd() * W, y, Math.max(1, Math.round(2 * s)), Math.max(1, Math.round(2 * s)));
    }
    // 岸边阴影 + 卵石
    g.fillStyle = dpat(g, '#3e5a2c', null, 0.5);
    g.fillRect(0, Y(361), W, 4);
    for (let x = -10; x < W + 10; x += rnd.r(9, 20)) {
      const xi = clamp(Math.round(x), 0, W - 1);
      const rx = rnd.r(5, 13), ry = rx * rnd.r(0.45, 0.6);
      const mossy = rnd.chance(0.25);
      stone(g, x, nearEdge[xi] + rnd.r(0, 5), rx, ry, mossy ? '#6e7a50' : '#878474', mossy ? '#8a9a62' : '#a6a292', '#55534a');
    }
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, xi = clamp(Math.round(x), 0, W - 1);
      rect(g, rnd.pick(['#9a9686', '#6a685c', '#b0ac9c']), x, nearEdge[xi] + rnd.r(4, 9), 2, 1);
    }
    steps.push(layer(L, 1, gy));
  }

  // 溪水闪光(随时间向右流动)
  const glints = [];
  for (let i = 0; i < 70; i++) glints.push({ x: rnd() * W, y: Math.round(rnd.r(341, 353)), l: Math.round(rnd.r(3, 9)), p: rnd.i(0, 5) });
  steps.push((ctx, camX, tick) => {
    ctx.fillStyle = '#d2e8ee';
    for (const s of glints) {
      if (((tick >> 3) + s.p) % 6 < 2) continue;
      const x = Math.round(((s.x + tick * 0.55) % W) - camX);
      if (x < -10 || x > VW) continue;
      ctx.fillRect(x, s.y, s.l, 1);
    }
  });

  const front = [frontTufts(rnd, W, 1.18, 70, '#2f4c22', '#4f7a36', 14)];
  return { width: W, zMin, zMax, music: 'battle1', steps, front };
}

// 砖墙(带灰缝、上亮下暗)
function brickWall(g, x0, y0, w, h, bh, bl, cols, mortar, lit, dark, rnd) {
  rect(g, mortar, x0, y0, w, h);
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  for (let r = 0, y = y0; y < y0 + h; r++, y += bh) {
    const off = r % 2 ? bl / 2 : rnd() * 2;
    for (let x = x0 - off; x < x0 + w; x += bl) {
      rect(g, cols[(rnd() * cols.length) | 0], x + 1, y + 1, bl - 1, bh - 1);
      if (lit) rect(g, lit, x + 1, y + 1, bl - 2, 1);
      if (dark && bh > 4) rect(g, dark, x + 1, y + bh - 1, bl - 1, 1);
    }
  }
  g.restore();
}

// 透视铺地砖:行高逐行增长,砖长与行高成比例
function brickFloor(g, W, top, bottom, rnd, o) {
  let y = top, k = 0;
  while (y < bottom) {
    const rh = Math.max(3, Math.round(o.h0 * Math.pow(o.grow, k)));
    const gap = Math.max(1, Math.round(rh / 9));
    rect(g, o.mortar, 0, y, W, rh);
    const blen = rh * o.lenK;
    let x = k % 2 ? -blen / 2 : -rnd() * blen;
    while (x < W) {
      const bl = o.irregular ? blen * rnd.r(0.55, 1.45) : blen;
      const x0 = Math.round(x) + gap, x1 = Math.round(x + bl);
      const c = o.cols[(rnd() * o.cols.length) | 0];
      rect(g, c, x0, y + gap, x1 - x0, rh - gap);
      if (o.lit) rect(g, o.lit, x0, y + gap, x1 - x0, 1);
      if (o.dark && rh > 6) rect(g, o.dark, x0, y + rh - 1, x1 - x0, 1);
      x += bl;
    }
    y += rh;
    k++;
  }
}

// ===================================================================
// 2) Iron Gate Prison — 铁门监狱:黄昏、瞭望塔探照灯、高墙铁网、水泥放风场
// ===================================================================
function buildPrison(rnd) {
  const W = 2400, zMin = 350, zMax = 530;
  const steps = [];

  // 黄昏天空 + 月亮
  {
    const f = 0.04, w = layerW(f, W), h = 300;
    const L = mk(w, h), g = L.g;
    g.drawImage(ditherGrad(w, h, [[0, '#1a1d36'], [0.42, '#323559'], [0.7, '#5c5575'], [0.88, '#8c7283'], [1, '#ae887e']], 10), 0, 0);
    for (let i = 0; i < 70; i++) rect(g, rnd.chance(0.7) ? '#b8b8d4' : '#ffffff', rnd() * w, rnd.r(0, 200), 1, 1);
    const mx = Math.round(w * 0.64), my = 160;
    g.fillStyle = dpat(g, '#6e6a8c', null, 0.25);
    ellipse(g, mx, my, 34, 34);
    g.fillStyle = dpat(g, '#8e88a2', null, 0.5);
    ellipse(g, mx, my, 25, 25);
    g.fillStyle = '#e6dfc4';
    ellipse(g, mx, my, 15, 15);
    g.fillStyle = '#cbc2a2';
    ellipse(g, mx + 4, my - 4, 4, 3);
    ellipse(g, mx - 6, my + 4, 3, 3);
    ellipse(g, mx + 3, my + 8, 2, 2);
    for (let i = 0; i < 9; i++) {
      const cw = Math.round(rnd.r(120, 260)), ch = Math.round(rnd.r(8, 13));
      g.drawImage(streakCloud(rnd, cw, ch, '#8c7088', '#524a6a'), Math.round(rnd.r(-40, w - cw)), Math.round(rnd.r(140, 236)));
    }
    steps.push(layer(L, f, 0));
  }

  // 远处丘陵与城市剪影
  {
    const f = 0.14, w = layerW(f, W), y0 = 176, h = 124;
    const L = mk(w, h), g = L.g;
    const hs = profile(rnd, w, 30, 70, [[260, 1], [70, 0.3]]);
    g.fillStyle = '#34344e';
    fillProfile(g, hs, h);
    for (let x = rnd.r(0, 40); x < w; x += rnd.r(14, 46)) {
      const bw = rnd.r(10, 34), bh = rnd.r(8, 40), base = hs[clamp(Math.round(x), 0, w - 1)] + 6;
      rect(g, '#2b2b45', x, base - bh, bw, bh + 10);
      for (let i = 0; i < bw * bh / 50; i++) if (rnd.chance(0.35)) rect(g, rnd.chance(0.8) ? '#d8c070' : '#a0b0d0', x + 2 + rnd() * (bw - 4), base - bh + 2 + rnd() * (bh - 2), 1, 1);
    }
    steps.push(layer(L, f, y0));
  }

  // 外墙与瞭望塔
  const towers = [];
  {
    const f = 0.45, w = layerW(f, W), y0 = 120, h = 180;
    const L = mk(w, h), g = L.g;
    const Y = (y) => y - y0;
    rect(g, '#5c5864', 0, Y(184), w, h);
    rect(g, '#75717d', 0, Y(184), w, 3);
    for (let x = 0; x < w; x += 46) rect(g, '#4c4854', x, Y(187), 1, h);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = dpat(g, '#4a4652', null, 0.5);
      g.fillRect(Math.round(rnd() * w), Y(188), rnd.i(3, 12), rnd.i(6, 40));
    }
    for (let x = 0; x < w; x += 60) rect(g, '#2a2a32', x, Y(172), 2, 12);
    g.strokeStyle = '#26262e';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x < w; x += 7) {
      g.moveTo(x + 7, Y(177));
      g.arc(x + 3.5, Y(177), 3.5, 0, Math.PI * 2);
    }
    g.stroke();
    for (let x = rnd.r(150, 260); x < w - 60; x += rnd.r(430, 560)) {
      const cx = Math.round(x);
      rect(g, '#54505b', cx - 13, Y(176), 26, h);
      rect(g, '#68646f', cx - 13, Y(176), 5, h);
      rect(g, '#45414b', cx + 9, Y(176), 4, h);
      rect(g, '#4a4650', cx - 30, Y(150), 60, 28);
      rect(g, '#5e5a64', cx - 30, Y(150), 60, 3);
      for (let k = 0; k < 4; k++) rect(g, '#e6c66e', cx - 26 + k * 14, Y(156), 10, 9);
      rect(g, '#2c2830', cx - 33, Y(176), 66, 3);
      for (let k = 0; k < 9; k++) rect(g, '#2c2830', cx - 32 + k * 8, Y(170), 1, 6);
      rect(g, '#2c2830', cx - 33, Y(170), 66, 1);
      g.fillStyle = '#2c282e';
      poly(g, [cx - 37, Y(151), cx + 37, Y(151), cx + 24, Y(141), cx - 24, Y(141)]);
      rect(g, '#1c1a20', cx + 12, Y(135), 12, 7);
      rect(g, '#fff4c0', cx + 22, Y(136), 3, 5);
      towers.push({ lx: cx + 24, y: 138 });
    }
    crisp(L);
    steps.push(layer(L, f, y0));
  }

  // 内墙:铁丝网 + 石块墙 + 铁门
  const GX = 1200;
  {
    const y0 = 146, h = 206;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - y0;
    const fTop = Y(160), fBot = Y(204);
    g.save();
    g.beginPath();
    g.rect(0, fTop, W, fBot - fTop);
    g.clip();
    g.strokeStyle = '#4a4a54';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = -60; x < W + 60; x += 6) {
      g.moveTo(x + 0.5, fTop);
      g.lineTo(x + 44.5, fBot);
      g.moveTo(x + 44.5, fTop);
      g.lineTo(x + 0.5, fBot);
    }
    g.stroke();
    g.restore();
    rect(g, '#3a3a42', 0, fTop, W, 2);
    for (let x = 20; x < W; x += 96) {
      rect(g, '#33333b', x, Y(152), 4, fBot - Y(152));
      g.fillStyle = '#33333b';
      poly(g, [x, Y(154), x + 4, Y(154), x + 16, Y(146), x + 14, Y(144)]);
    }
    for (const yy of [Y(147), Y(151)]) {
      for (let x = 0; x < W; x += 5) rect(g, '#2c2c34', x, yy + (x % 10 ? 0 : -1), 5, 1);
    }
    // 墙体
    const wTop = Y(204), wBot = Y(346);
    brickWall(g, 0, wTop + 10, W, wBot - wTop - 10, 17, 44,
      ['#857d72', '#8b8377', '#7f776c', '#797166', '#837b6f'], '#5c564d', '#968f80', '#6c665b', rnd);
    rect(g, '#9a9488', 0, wTop, W, 8);
    rect(g, '#b2ac9e', 0, wTop, W, 2);
    rect(g, '#6a645a', 0, wTop + 8, W, 2);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = dpat(g, '#5a544a', null, 0.5);
      g.fillRect(Math.round(rnd() * W), wTop + 10, rnd.i(2, 6), Math.round(rnd.r(10, 70)));
    }
    hazeBand(g, W, wBot - 44, 44, '#4c463e', 4, 0.6);
    rect(g, '#686258', 0, wBot - 6, W, 6);
    rect(g, '#7c766a', 0, wBot - 6, W, 1);
    // 牢房小窗
    for (let x = 70; x < W - 40; x += 150) {
      if (Math.abs(x + 13 - GX) < 190) continue;
      const wy = Y(238);
      rect(g, '#6a645a', x - 3, wy - 3, 32, 40);
      rect(g, rnd.chance(0.3) ? '#4a3c26' : '#18181c', x, wy, 26, 34);
      for (let k = 0; k < 4; k++) rect(g, '#8a8a92', x + 3 + k * 6, wy, 2, 34);
      rect(g, '#aaa498', x - 4, wy + 34, 34, 3);
      g.fillStyle = dpat(g, '#5a544a', null, 0.5);
      g.fillRect(x + 2, wy + 37, 22, 22);
    }
    // 壁灯 + 光锥
    for (const lx of [445, 895, 1595, 2045]) {
      rect(g, '#2a2a30', lx - 1, Y(220), 3, 8);
      rect(g, '#2a2a30', lx - 7, Y(226), 15, 5);
      rect(g, '#fff0b0', lx - 5, Y(231), 11, 2);
      g.fillStyle = dpat(g, '#c8bc8c', null, 0.25);
      poly(g, [lx - 5, Y(233), lx + 6, Y(233), lx + 40, Y(340), lx - 39, Y(340)]);
    }
    // 排水管
    for (const px of [610, 1770]) {
      rect(g, '#585c64', px, Y(212), 6, wBot - Y(212));
      rect(g, '#7a7e86', px + 1, Y(212), 1, wBot - Y(212));
      for (let yy = Y(226); yy < wBot; yy += 34) rect(g, '#3e4048', px - 2, yy, 10, 3);
    }
    // 告示纸
    for (const px of [300, 1010, 1690, 2210]) {
      const py = Y(rnd.r(258, 280));
      rect(g, '#cfc7ae', px, py, 18, 24);
      for (let k = 0; k < 5; k++) rect(g, '#6a6454', px + 3, py + 4 + k * 4, rnd.r(6, 12), 1);
      rect(g, '#9a937e', px + 14, py + 20, 4, 4);
    }
    // 大铁门
    for (const px of [GX - 128, GX + 100]) {
      rect(g, '#8a8276', px, Y(178), 28, wBot - Y(178));
      rect(g, '#a09888', px, Y(178), 4, wBot - Y(178));
      rect(g, '#625c52', px + 24, Y(178), 4, wBot - Y(178));
      rect(g, '#aaa294', px - 4, Y(172), 36, 7);
      rect(g, '#6a645a', px - 4, Y(179), 36, 2);
      rect(g, '#2a2a30', px + 9, Y(162), 10, 10);
      rect(g, '#ffe8a0', px + 11, Y(165), 6, 5);
    }
    rect(g, '#7a7468', GX - 100, Y(212), 200, 18);
    rect(g, '#8e887a', GX - 100, Y(212), 200, 2);
    rect(g, '#5a544a', GX - 100, Y(228), 200, 2);
    pixText(g, 'BLOCK 7', GX - textW('BLOCK 7', 2) / 2, Y(216), 2, '#3a362e');
    rect(g, '#262420', GX - 100, Y(230), 200, wBot - Y(230));
    for (const dx of [GX - 96, GX + 2]) {
      rect(g, '#4a4f57', dx, Y(234), 94, wBot - Y(234));
      rect(g, '#5e646e', dx, Y(234), 94, 2);
      for (let yy = Y(252); yy < wBot; yy += 26) {
        rect(g, '#383c44', dx, yy, 94, 4);
        rect(g, '#6a707a', dx, yy, 94, 1);
      }
      for (let yy = Y(240); yy < wBot - 2; yy += 13) {
        rect(g, '#7c828c', dx + 4, yy, 2, 2);
        rect(g, '#7c828c', dx + 88, yy, 2, 2);
      }
      rect(g, '#141418', dx + 32, Y(244), 30, 18);
      for (let k = 0; k < 4; k++) rect(g, '#6a707a', dx + 35 + k * 7, Y(244), 2, 18);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = dpat(g, '#6a4a34', null, 0.5);
        g.fillRect(Math.round(dx + rnd.r(4, 88)), Y(262), 2, rnd.i(10, 60));
      }
    }
    rect(g, '#1e2026', GX - 2, Y(234), 4, wBot - Y(234));
    rect(g, '#9a9a9e', GX - 10, Y(290), 6, 12);
    rect(g, '#9a9a9e', GX + 4, Y(290), 6, 12);
    steps.push(layer(L, 1, y0));
  }

  // 放风场水泥地(顶部透明区放油桶)
  const BARRELS = [520, 1490, 2060];
  const fy = 296;
  {
    const h = VH - fy;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - fy;
    const top = Y(346);
    floorRows(g, W, top, h, ['#7a756b', '#767167', '#7e796e', '#737064'], 3, 1.14, rnd);
    floorDashes(g, W, top, h, 3400, ['#86817a', '#6c675e', '#827d72', '#69655b'], rnd, 3, 14, 1.4);
    for (let yy = 353, gap = 9; yy < 550; gap *= 1.3, yy += gap) {
      rect(g, '#625d54', 0, Y(yy), W, 1);
      rect(g, '#89847a', 0, Y(yy) + 1, W, 1);
    }
    g.fillStyle = dpat(g, '#48443c', null, 0.75);
    g.fillRect(0, top, W, 3);
    g.fillStyle = dpat(g, '#48443c', null, 0.4);
    g.fillRect(0, top + 3, W, 4);
    g.fillStyle = dpat(g, '#a8964e', null, 0.7);
    g.fillRect(0, Y(358), W, 2);
    for (let i = 0; i < 16; i++) {
      const y = Y(rnd.r(372, 540)), s = perspS(y + fy, 346, 550);
      const x = rnd() * W, rx = rnd.r(14, 40) * s, ry = rx * 0.28;
      g.fillStyle = dpat(g, '#5c5850', null, 0.5);
      ellipse(g, x, y, rx * 1.3, ry * 1.4);
      g.fillStyle = '#625e55';
      ellipse(g, x, y, rx, ry);
    }
    g.strokeStyle = '#57524a';
    g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      let x = rnd() * W, y = Y(rnd.r(366, 545));
      const s = perspS(y + fy, 346, 550);
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
      let a = rnd.r(-0.6, 0.6) + (rnd.chance(0.5) ? Math.PI : 0);
      for (let k = 0; k < rnd.i(4, 8); k++) {
        a += rnd.r(-0.7, 0.7);
        x += Math.cos(a) * rnd.r(5, 13) * s;
        y += Math.sin(a) * rnd.r(2, 5) * s;
        g.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
      }
      g.stroke();
    }
    for (const x of [300, 900, 1500, 2100]) {
      const y = Y(468);
      rect(g, '#3a3832', x, y, 44, 10);
      for (let k = 0; k < 6; k++) rect(g, '#59554e', x + 3 + k * 7, y + 2, 3, 6);
    }
    for (const bx of BARRELS) {
      g.fillStyle = dpat(g, '#c88a48', null, 0.25);
      ellipse(g, bx, Y(318), 40, 30);
      g.fillStyle = dpat(g, '#d89a58', null, 0.25);
      ellipse(g, bx, Y(322), 24, 20);
      rect(g, '#6c4128', bx - 11, Y(323), 22, 28);
      rect(g, '#8e5a36', bx - 9, Y(323), 3, 28);
      rect(g, '#4a2c1a', bx + 7, Y(323), 4, 28);
      rect(g, '#3c2616', bx - 11, Y(327), 22, 2);
      rect(g, '#3c2616', bx - 11, Y(342), 22, 2);
      rect(g, '#2a1a10', bx - 10, Y(323), 20, 3);
      rect(g, '#e0702a', bx - 7, Y(323), 14, 1);
      g.fillStyle = dpat(g, '#3c3830', null, 0.5);
      ellipse(g, bx + 4, Y(351), 16, 3);
    }
    steps.push(layer(L, 1, fy));
  }
  steps.push(fanSeams(132, 347, 550, 'rgba(78,73,64,0.6)'));

  const fl = flameFrames(rnd, 22, 28, ['#c8401c', '#f08a24', '#ffd860'], 4);
  steps.push((ctx, camX, tick) => {
    for (let i = 0; i < BARRELS.length; i++) drawAt(ctx, fl[((tick >> 2) + i) & 3], BARRELS[i] - 11, 297, 1, camX);
  });
  // 探照灯光束扫过放风场
  steps.push((ctx, camX, tick) => {
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i];
      const lx = t.lx - camX * 0.45;
      if (lx < -420 || lx > VW + 420) continue;
      const sx = lx + Math.sin(tick * 0.011 + i * 2.1) * 260;
      const sy = 448 + Math.sin(tick * 0.017 + i * 1.3) * 50;
      const rx = 46 + (sy - 380) * 0.25, ry = 12 + (sy - 380) * 0.05;
      ctx.fillStyle = 'rgba(255,244,200,0.085)';
      ctx.beginPath();
      ctx.moveTo(lx, t.y);
      ctx.lineTo(sx - rx, sy);
      ctx.lineTo(sx + rx, sy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,246,214,0.13)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return { width: W, zMin, zMax, music: 'battle2', steps, front: [] };
}

// ===================================================================
// 3) Dragon Wall — 龙脊长城:群山之上的古城墙步道、城楼、雉堞
// ===================================================================
function buildWall(rnd) {
  const W = 2600, zMin = 348, zMax = 528;
  const steps = [];

  {
    const f = 0.03, w = layerW(f, W), h = 330;
    const L = mk(w, h), g = L.g;
    g.drawImage(ditherGrad(w, h, [[0, '#4a7cba'], [0.45, '#84acd4'], [0.76, '#bcd2df'], [1, '#ecdcb6']], 10), 0, 0);
    const sx = Math.round(w * 0.3), sy = 250;
    for (const [r, t] of [[78, 0.2], [56, 0.4], [38, 0.65]]) {
      g.fillStyle = dpat(g, '#f6ecd0', null, t);
      ellipse(g, sx, sy, r, r);
    }
    g.fillStyle = '#fff6dc';
    ellipse(g, sx, sy, 15, 15);
    for (let i = 0; i < 10; i++) {
      const cw = Math.round(rnd.r(60, 180)), ch = Math.round(rnd.r(6, 11));
      g.drawImage(streakCloud(rnd, cw, ch, '#fbf4e6', '#dcdfe4'), Math.round(rnd.r(0, w - cw)), Math.round(rnd.r(150, 240)));
    }
    steps.push(layer(L, f, 0));
  }
  steps.push(cloudDrift(rnd, 3, 134, 176, 0.05, ['#ffffff', '#f0ece6', '#c8d2e0'], 110, 190, 0.03, 0.07));

  // 远山 + 远处城墙细线
  {
    const f = 0.1, w = layerW(f, W), y0 = 166, h = 164;
    const L = mk(w, h), g = L.g;
    const facet = profile(rnd, w, 0, 1, [[60, 1], [20, 0.4]]);
    const h1 = profile(rnd, w, 16, 92, [[200, 1], [60, 0.4], [18, 0.12]], 1.3);
    mountains(g, h1, h, { base: '#a2afc5', dark: '#94a2ba', lit: '#b4c0d2', depth: 50, facet });
    const h2 = profile(rnd, w, 56, 118, [[150, 1], [45, 0.3], [14, 0.06]], 1.1);
    mountains(g, h2, h, { base: '#8898b0', dark: '#7b8ca6', lit: '#98a8be', depth: 40, facet });
    for (let x = 0; x < w; x++) {
      const y = Math.round(h2[x]);
      rect(g, '#b2a892', x, y - 3, 1, 3);
      if (x % 4 < 2) rect(g, '#b2a892', x, y - 4, 1, 1);
    }
    for (let x = rnd.r(10, 60); x < w; x += rnd.r(50, 90)) {
      const y = Math.round(h2[Math.round(x)]);
      rect(g, '#aa9e86', x - 2, y - 8, 5, 6);
    }
    hazeBand(g, w, 118, 46, '#b2c0cc', 4, 0.9);
    steps.push(layer(L, f, y0));
  }

  // 中景山脊 + 蜿蜒城墙与烽火台
  {
    const f = 0.25, w = layerW(f, W), y0 = 170, h = 190;
    const L = mk(w, h), g = L.g;
    const facet = profile(rnd, w, 0, 1, [[50, 1], [16, 0.4]]);
    const hs = profile(rnd, w, 50, 112, [[260, 1], [80, 0.35], [20, 0.08]], 1.2);
    mountains(g, hs, h, { base: '#6a8270', dark: '#5a7262', lit: '#7e967e', depth: 56, facet });
    for (let i = 0; i < 1600; i++) {
      const x = Math.round(rnd() * (w - 1));
      rect(g, rnd.chance(0.6) ? '#4f6a54' : '#5f7c5e', x, hs[x] + rnd.r(5, 90), 2, 2);
    }
    for (let x = 0; x < w; x++) {
      const y = Math.round(hs[x]);
      const sl = (hs[Math.min(w - 1, x + 2)] - hs[Math.max(0, x - 2)]);
      const c = sl > 0.6 ? '#9a8c72' : '#c4b496';
      rect(g, c, x, y - 9, 1, 9);
      if (((x / 4) | 0) % 2 === 0) rect(g, c, x, y - 12, 1, 3);
      rect(g, '#6e6450', x, y, 1, 1);
    }
    for (let x = rnd.r(80, 160); x < w - 20; x += rnd.r(220, 330)) {
      let y = Infinity;
      for (let k = -10; k <= 10; k++) y = Math.min(y, hs[clamp(Math.round(x + k), 0, w - 1)]);
      y = Math.round(y);
      rect(g, '#c8b89a', x - 10, y - 26, 20, 18);
      rect(g, '#9a8c72', x + 6, y - 26, 4, 18);
      rect(g, '#4a4232', x - 2, y - 20, 4, 5);
      for (let k = 0; k < 4; k++) rect(g, '#c8b89a', x - 10 + k * 6, y - 29, 3, 3);
    }
    hazeBand(g, w, 150, 40, '#8aa094', 3, 0.6);
    steps.push(layer(L, f, y0));
  }

  // 近处山坡(从垛口间可见)
  {
    const f = 0.5, w = layerW(f, W), y0 = 228, h = 126;
    const L = mk(w, h), g = L.g;
    const facet = profile(rnd, w, 0, 1, [[40, 1], [12, 0.4]]);
    const hs = profile(rnd, w, 22, 66, [[180, 1], [50, 0.4], [12, 0.1]]);
    mountains(g, hs, h, { base: '#5d6c48', dark: '#4c5a3c', lit: '#74835a', depth: 40, facet });
    const items = [];
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w;
      items.push({ x, y: hs[clamp(Math.round(x), 0, w - 1)] + rnd.r(4, 70), k: rnd() });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.k < 0.35) stone(g, it.x, it.y, rnd.r(4, 9), rnd.r(3, 5), '#7a7666', '#969282', '#57544a');
      else if (it.k < 0.85) {
        const r = rnd.r(4, 8);
        g.fillStyle = '#3c5434';
        ellipse(g, it.x, it.y, r, r * 0.7);
        g.fillStyle = '#56723f';
        ellipse(g, it.x - r * 0.3, it.y - r * 0.3, r * 0.55, r * 0.35);
      }
      else pine(g, it.x, it.y + 2, rnd.r(16, 30), rnd.r(8, 13), '#3a5236', '#4e6a44', '#2c4028');
    }
    crisp(L);
    steps.push(layer(L, f, y0));
  }

  // 城墙内侧护墙(雉堞)+ 城楼
  const TX = 1300;
  const FLAGS = [];
  {
    const y0 = 120, h = 228;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - y0;
    const bcols = ['#a8997b', '#9e9073', '#b0a283', '#968a6e', '#a29478'];
    brickWall(g, 0, Y(286), W, Y(346) - Y(286), 8, 22, bcols, '#7a6e58', '#b8aa8a', '#8a7e64', rnd);
    for (let x = 0; x < W; x += 46) {
      g.clearRect(x + 30, Y(286), 16, 20);
      rect(g, '#c8ba98', x + 30, Y(306), 16, 2);
      rect(g, '#c8ba98', x, Y(286), 30, 2);
      rect(g, '#7a6c54', x + 28, Y(288), 2, 18);
      rect(g, '#3a3226', x + 13, Y(291), 4, 9);
    }
    for (let i = 0; i < 70; i++) {
      g.fillStyle = dpat(g, '#7e7258', null, 0.5);
      ellipse(g, rnd() * W, Y(rnd.r(300, 340)), rnd.r(6, 22), rnd.r(3, 8));
    }
    g.fillStyle = dpat(g, '#6a7a4c', null, 0.5);
    for (let x = 0; x < W; x += rnd.r(20, 80)) g.fillRect(Math.round(x), Y(340), rnd.i(6, 30), 6);
    rect(g, '#857858', 0, Y(342), W, 4);
    // 城楼
    const bx0 = TX - 140, bw = 280;
    brickWall(g, bx0, Y(196), bw, Y(346) - Y(196), 10, 28, ['#a49478', '#9a8c70', '#ac9c7e', '#948666'], '#76694f', '#b8a888', '#86795e', rnd);
    rect(g, '#8a7c60', bx0 + bw - 6, Y(196), 6, Y(346) - Y(196));
    rect(g, '#b8aa8a', bx0, Y(196), 4, Y(346) - Y(196));
    for (let x = bx0; x < bx0 + bw; x += 28) {
      rect(g, '#b4a686', x, Y(184), 18, 12);
      rect(g, '#c8ba98', x, Y(184), 18, 2);
      rect(g, '#86795e', x + 16, Y(186), 2, 10);
    }
    // 拱门
    const dx = TX - 30;
    rect(g, '#bcae8e', dx - 5, Y(262), 70, Y(346) - Y(262));
    g.fillStyle = '#bcae8e';
    ellipse(g, TX, Y(262), 35, 35);
    rect(g, '#28221a', dx, Y(262), 60, Y(346) - Y(262));
    g.fillStyle = '#28221a';
    ellipse(g, TX, Y(262), 30, 30);
    g.fillStyle = dpat(g, '#4a4030', null, 0.5);
    g.fillRect(dx, Y(330), 60, 16);
    for (const wx of [TX - 100, TX + 86]) {
      rect(g, '#2e281e', wx, Y(222), 14, 20);
      g.fillStyle = '#2e281e';
      ellipse(g, wx + 7, Y(222), 7, 7);
    }
    // 城楼上的阁楼与屋顶
    rect(g, '#5a2a1e', TX - 120, Y(160), 240, 24);
    for (let k = 0; k < 6; k++) {
      const px = TX - 116 + k * 46;
      rect(g, '#8a3a28', px, Y(158), 8, 26);
      rect(g, '#a8503a', px, Y(158), 2, 26);
    }
    for (let k = 0; k < 30; k++) rect(g, '#7a3424', TX - 118 + k * 8, Y(176), 2, 8);
    rect(g, '#7a3424', TX - 120, Y(175), 240, 2);
    rect(g, '#6a2e20', TX - 124, Y(183), 248, 3);
    g.save();
    g.beginPath();
    g.moveTo(TX - 168, Y(146));
    g.quadraticCurveTo(TX - 150, Y(160), TX - 120, Y(160));
    g.lineTo(TX + 120, Y(160));
    g.quadraticCurveTo(TX + 150, Y(160), TX + 168, Y(146));
    g.lineTo(TX + 70, Y(132));
    g.lineTo(TX - 70, Y(132));
    g.closePath();
    g.fillStyle = '#46504c';
    g.fill();
    g.clip();
    for (let x = TX - 170; x < TX + 170; x += 6) rect(g, '#363f3b', x, Y(130), 2, 34);
    g.restore();
    rect(g, '#6c7672', TX - 120, Y(158), 240, 2);
    rect(g, '#2e3532', TX - 72, Y(130), 144, 4);
    rect(g, '#2e3532', TX - 78, Y(126), 10, 6);
    rect(g, '#2e3532', TX + 68, Y(126), 10, 6);
    // 旗杆位置
    for (let x = 180; x < W; x += 520) {
      if (Math.abs(x - TX) < 220) continue;
      const fx = Math.floor(x / 46) * 46 + 14;
      rect(g, '#3a3024', fx, Y(232), 2, 56);
      FLAGS.push(fx + 2);
    }
    crisp(L);
    steps.push(layer(L, 1, y0));
  }

  // 城墙步道铺砖
  const gy = 346;
  {
    const h = VH - gy;
    const L = mk(W, h), g = L.g;
    brickFloor(g, W, 0, h, rnd, {
      h0: 6, grow: 1.12, lenK: 2.6,
      cols: ['#9c8e72', '#a49678', '#968a6e', '#a89a7c', '#928668'],
      mortar: '#74684f', lit: '#b2a482', dark: '#85795e',
    });
    for (let i = 0; i < 40; i++) {
      const y = rnd.r(14, h - 10), s = perspS(y + gy, gy, 550);
      g.fillStyle = dpat(g, '#7e7258', null, 0.5);
      ellipse(g, rnd() * W, y, rnd.r(20, 60) * s, rnd.r(4, 9) * s);
    }
    for (let i = 0; i < 120; i++) {
      const y = rnd.r(8, h - 4), s = perspS(y + gy, gy, 550);
      tuft(g, rnd() * W, y, s * 0.8, '#5a6a3c', '#7a8a50');
    }
    g.fillStyle = dpat(g, '#5a503e', null, 0.75);
    g.fillRect(0, 0, W, 3);
    g.fillStyle = dpat(g, '#5a503e', null, 0.35);
    g.fillRect(0, 3, W, 5);
    steps.push(layer(L, 1, gy));
  }

  // 旗帜(3 帧飘动)
  const flagFrames = [];
  for (let k = 0; k < 3; k++) {
    const L = mk(30, 18), g = L.g;
    g.fillStyle = '#b0382a';
    g.beginPath();
    g.moveTo(0, 1);
    for (let x = 0; x <= 26; x += 2) g.lineTo(x, 1 + Math.sin(x * 0.35 + k * 2.1) * 2);
    g.lineTo(28, 7);
    for (let x = 26; x >= 0; x -= 2) g.lineTo(x, 13 + Math.sin(x * 0.35 + k * 2.1) * 2);
    g.closePath();
    g.fill();
    g.fillStyle = '#e0b040';
    ellipse(g, 9, 7 + Math.sin(9 * 0.35 + k * 2.1) * 2, 3, 3);
    crisp(L);
    flagFrames.push(L.c);
  }
  steps.push((ctx, camX, tick) => {
    for (let i = 0; i < FLAGS.length; i++) drawAt(ctx, flagFrames[((tick >> 3) + i) % 3], FLAGS[i], 230, 1, camX);
  });
  // 飞鸟
  steps.push(birdFlock(rnd, 7, 150, 210, 0.2));

  // 前景:外侧矮墙顶(仅最底部 12px)
  const fr = mk(layerW(1, W), 12);
  rect(fr.g, '#8a7c60', 0, 0, fr.w, 12);
  rect(fr.g, '#b8aa8a', 0, 0, fr.w, 2);
  for (let x = 0; x < fr.w; x += 22) rect(fr.g, '#6e6248', x, 4, 1, 8);
  rect(fr.g, '#6e6248', 0, 7, fr.w, 1);
  const front = [layer(fr, 1, VH - 12)];

  return { width: W, zMin, zMax, music: 'battle3', steps, front };
}

// 飞鸟群:翅膀两帧
function birdFlock(rnd, n, y0, y1, f) {
  const birds = [];
  for (let i = 0; i < n; i++) birds.push({ x: rnd.r(0, 160), y: rnd.r(y0, y1), p: rnd.i(0, 7), sp: rnd.r(0.25, 0.4) });
  return (ctx, camX, tick) => {
    ctx.fillStyle = '#3a3a44';
    const span = VW + 600;
    for (const b of birds) {
      let x = (VW + 300 - ((tick * b.sp + b.x * 3) % span)) - camX * f % span;
      x = ((x % span) + span) % span - 300;
      const y = Math.round(b.y + Math.sin(tick * 0.05 + b.p) * 3);
      const up = ((tick >> 3) + b.p) % 2 === 0;
      const xi = Math.round(x);
      ctx.fillRect(xi - 1, y, 3, 1);
      if (up) { ctx.fillRect(xi - 3, y - 2, 2, 1); ctx.fillRect(xi + 2, y - 2, 2, 1); ctx.fillRect(xi - 2, y - 1, 1, 1); ctx.fillRect(xi + 2, y - 1, 1, 1); }
      else { ctx.fillRect(xi - 4, y + 1, 3, 1); ctx.fillRect(xi + 2, y + 1, 3, 1); }
    }
  };
}

// ===================================================================
// 4) Coral Isle — 珊瑚岛:热带海滩、远岛、灯塔、棕榈与高脚草屋、涨落的浪花
// ===================================================================

// 棕榈树:二次曲线树干(环节纹)+ 下垂羽叶
function palm(g, bx, by, h, lean, rnd, P) {
  const tx = bx + lean * h * 0.5, ty = by - h;
  const cx = bx + lean * h * 0.04, cy = by - h * 0.55;
  const n = Math.ceil(h / 4);
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * bx + 2 * u * t * cx + t * t * tx;
    const y = u * u * by + 2 * u * t * cy + t * t * ty;
    const wd = lerp(11, 6, t);
    rect(g, i % 2 ? P.trunk : P.trunk2, x - wd / 2, y - 3, wd, 5);
    rect(g, P.trunkDark, x + wd / 2 - 2, y - 3, 2, 5);
    rect(g, P.trunkLit, x - wd / 2, y - 3, 1, 5);
  }
  const fr = 9;
  for (let k = 0; k < fr; k++) {
    const a = -Math.PI - 0.25 + (k / (fr - 1)) * (Math.PI + 0.5) + rnd.r(-0.12, 0.12);
    frond(g, tx, ty, a, h * rnd.r(0.3, 0.4), rnd.r(0.45, 0.85), P);
  }
  g.fillStyle = P.nut;
  ellipse(g, tx - 3, ty + 4, 3, 3);
  ellipse(g, tx + 3, ty + 5, 3, 3);
  ellipse(g, tx, ty + 7, 3, 3);
}
function frond(g, x, y, a, len, droop, P) {
  const steps = 12;
  const dir = Math.cos(a) >= 0 ? 1 : -1;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([x + Math.cos(a) * len * t, y + Math.sin(a) * len * t + droop * len * t * t]);
  }
  g.lineWidth = 2;
  for (let i = 1; i <= steps; i++) {
    const [qx, qy] = pts[i];
    const t = i / steps;
    const ll = len * 0.3 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 2;
    g.strokeStyle = P.leafDark;
    g.beginPath();
    g.moveTo(qx, qy);
    g.lineTo(qx - ll * 0.3 * dir, qy + ll);
    g.stroke();
    g.strokeStyle = P.leaf;
    g.beginPath();
    g.moveTo(qx, qy);
    g.lineTo(qx + ll * 0.55 * dir, qy + ll * 0.75);
    g.stroke();
  }
  g.strokeStyle = P.leafLit;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.stroke();
}

function hut(g, x, by, rnd) {
  for (const sx of [-40, -14, 14, 40]) {
    rect(g, '#7a5c3a', x + sx - 2, by - 42, 4, 42);
    rect(g, '#9a7a50', x + sx - 2, by - 42, 1, 42);
  }
  rect(g, '#6a4e30', x - 52, by - 46, 104, 6);
  rect(g, '#8a6a44', x - 52, by - 46, 104, 1);
  rect(g, '#b49460', x - 42, by - 86, 84, 40);
  for (let yy = by - 84; yy < by - 46; yy += 4) rect(g, '#9a7c4c', x - 42, yy, 84, 1);
  for (let xx = x - 40; xx < x + 42; xx += 6) rect(g, '#a68654', xx, by - 86, 1, 40);
  rect(g, '#3a2a1a', x - 8, by - 76, 16, 30);
  rect(g, '#3a2a1a', x + 20, by - 76, 14, 10);
  rect(g, '#7a5c3a', x - 9, by - 40, 2, 40);
  rect(g, '#7a5c3a', x + 7, by - 40, 2, 40);
  for (let k = 0; k < 5; k++) rect(g, '#8a6a44', x - 9, by - 36 + k * 8, 18, 2);
  g.fillStyle = '#b8984e';
  poly(g, [x - 64, by - 82, x + 64, by - 82, x + 30, by - 122, x - 30, by - 122]);
  g.fillStyle = '#d0b26a';
  poly(g, [x - 56, by - 86, x - 6, by - 86, x - 18, by - 118, x - 28, by - 118]);
  g.fillStyle = '#c8a860';
  poly(g, [x - 30, by - 122, x + 30, by - 122, x + 12, by - 134, x - 12, by - 134]);
  for (let k = 0; k < 5; k++) rect(g, '#9a7c40', x - 58 + k * 6, by - 90 - k * 8, 116 - k * 12, 1);
  for (let xx = x - 62; xx < x + 62; xx += 3) rect(g, '#9a7c40', xx, by - 82, 1, rnd.i(2, 6));
}

function star5(g, x, y, r, col, lit) {
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.6);
  }
  g.closePath();
  g.fill();
  rect(g, lit, x - 1, y - 1, 2, 1);
}

function buildIsle(rnd) {
  const W = 2400, zMin = 352, zMax = 530;
  const HZ = 262;
  const steps = [];

  {
    const f = 0.03, w = layerW(f, W), h = HZ + 2;
    const L = mk(w, h), g = L.g;
    g.drawImage(ditherGrad(w, h, [[0, '#2870c4'], [0.5, '#549edc'], [0.82, '#8ec8ea'], [1, '#c4e8f2']], 10), 0, 0);
    for (let i = 0; i < 6; i++) {
      const cw = Math.round(rnd.r(70, 170)), ch = Math.round(rnd.r(6, 10));
      g.drawImage(streakCloud(rnd, cw, ch, '#f4fafc', '#cfe4f2'), Math.round(rnd.r(0, w - cw)), Math.round(rnd.r(150, 215)));
    }
    for (let i = 0; i < 7; i++) {
      const cw = Math.round(rnd.r(110, 240)), ch = Math.round(cw * rnd.r(0.3, 0.42));
      g.drawImage(cloudSprite(rnd, cw, ch, '#ffffff', '#e2ecf6', '#b4c8de'), Math.round(rnd.r(-60, w - cw + 60)), HZ - ch + 5);
    }
    steps.push(layer(L, f, 0));
  }
  steps.push(cloudDrift(rnd, 3, 132, 178, 0.05, ['#ffffff', '#e6eef6', '#b8cce0'], 80, 150, 0.05, 0.1));

  // 远岛
  {
    const f = 0.08, w = layerW(f, W), y0 = 196, h = HZ - 196 + 1;
    const L = mk(w, h), g = L.g;
    const hs = new Float32Array(w).fill(h + 1);
    const nz = fbm(rnd, w, [[30, 1], [9, 0.4]]);
    for (const [cx, wid, ht] of [[w * 0.62, 150, 54], [w * 0.2, 60, 14], [w * 0.9, 40, 9]]) {
      for (let x = 0; x < w; x++) {
        const d = (x - cx) / wid;
        const v = Math.exp(-d * d * 3) * ht + Math.exp(-(((x - cx - wid * 0.45) / (wid * 0.3)) ** 2) * 3) * ht * 0.35;
        if (v > 0.6) hs[x] = Math.min(hs[x], h - v - nz[x] * Math.min(3, v * 0.2));
      }
    }
    mountains(g, hs, h + 1, { base: '#5e8c86', dark: '#527e7a', lit: '#76a49a', depth: 26 });
    for (let i = 0; i < 26; i++) {
      const x = Math.round(rnd() * (w - 1));
      if (hs[x] > h - 3 || hs[x] < h - 22) continue;
      const y = hs[x];
      rect(g, '#46706c', x, y - 7, 1, 8);
      rect(g, '#46706c', x - 3, y - 8, 3, 1);
      rect(g, '#46706c', x + 1, y - 8, 3, 1);
      rect(g, '#46706c', x - 4, y - 7, 1, 1);
      rect(g, '#46706c', x + 4, y - 7, 1, 1);
    }
    steps.push(layer(L, f, y0));
  }

  // 海面 + 灯塔小岛
  const seaF = 0.2;
  const sparkles = [];
  {
    const f = seaF, w = layerW(f, W), y0 = 196, h = 148;
    const L = mk(w, h), g = L.g;
    const Y = (y) => y - y0;
    const sh = h - Y(HZ);
    g.drawImage(ditherGrad(w, sh, [[0, '#6ab2d6'], [0.1, '#3c8ec2'], [0.45, '#2a78ae'], [0.78, '#2e8ab2'], [1, '#3ca4b8']], 9), 0, Y(HZ));
    rect(g, '#a6d6e6', 0, Y(HZ), w, 1);
    for (let i = 0; i < 1500; i++) {
      const t = Math.pow(rnd(), 1.25);
      rect(g, rnd.chance(0.62) ? '#6cb8d8' : '#22689a', rnd() * w, Y(HZ) + 2 + t * (sh - 3), Math.max(1, rnd.r(4, 16) * (0.25 + t)), 1);
    }
    const lx = Math.round(w * 0.42);
    for (let k = 0; k < 10; k++) stone(g, lx + rnd.r(-36, 36), Y(HZ + rnd.r(5, 14)), rnd.r(8, 18), rnd.r(4, 8), '#6e6862', '#8e8880', '#4e4a46');
    for (let y = Y(214); y < Y(266); y++) {
      const t = (y - Y(214)) / (Y(266) - Y(214));
      const hw = Math.round(lerp(5, 8, t));
      const band = (((y - Y(214)) / 7) | 0) % 2;
      rect(g, band ? '#c8402e' : '#ece6dc', lx - hw, y, hw * 2, 1);
      rect(g, band ? '#962e22' : '#bcb6ac', lx + hw - 2, y, 2, 1);
    }
    rect(g, '#3a3a40', lx - 8, Y(212), 16, 2);
    rect(g, '#fff2a8', lx - 4, Y(205), 8, 7);
    rect(g, '#3a3a40', lx - 1, Y(205), 1, 7);
    g.fillStyle = '#b03a2a';
    tri(g, lx - 6, Y(205), lx + 6, Y(205), lx, Y(198));
    for (let i = 0; i < 46; i++) sparkles.push({ x: rnd() * w, y: Math.round(HZ + 4 + Math.pow(rnd(), 1.2) * (sh - 10)), l: rnd.i(2, 5), p: rnd.i(0, 9) });
    steps.push(layer(L, f, y0));
  }
  steps.push((ctx, camX, tick) => {
    ctx.fillStyle = '#e8f8fc';
    for (const s of sparkles) {
      if (((tick >> 2) + s.p) % 10 > 2) continue;
      const x = Math.round(s.x - camX * seaF);
      if (x < -6 || x > VW) continue;
      ctx.fillRect(x, s.y, s.l, 1);
    }
  });
  // 远方帆船
  const boat = mk(20, 18);
  rect(boat.g, '#5a3e2a', 2, 14, 16, 3);
  rect(boat.g, '#3a2a1e', 9, 1, 1, 13);
  boat.g.fillStyle = '#f4f0e6';
  tri(boat.g, 10, 1, 10, 13, 18, 13);
  boat.g.fillStyle = '#d8d2c4';
  tri(boat.g, 9, 3, 9, 13, 3, 13);
  steps.push((ctx, camX, tick) => {
    const span = layerW(0.1, W) + 60;
    drawAt(ctx, boat.c, ((260 + tick * 0.03) % span) - 30, HZ - 15, 0.1, camX);
  });

  // 沙滩
  const gy = 336;
  {
    const h = VH - gy;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - gy;
    g.drawImage(ditherGrad(W, 22, ['#9a8460', '#ab946e', '#bca47a'], 5), 0, 0);
    floorRows(g, W, Y(357), h, ['#cbb586', '#cfb98a', '#c6b082', '#d2bc8e'], 3, 1.13, rnd);
    g.fillStyle = dpat(g, '#bca47a', null, 0.5);
    g.fillRect(0, Y(357), W, 2);
    floorDashes(g, W, Y(358), h, 4200, ['#dcc89a', '#e2d0a4', '#b49e72', '#bca67a', '#d6c294'], rnd, 3, 12, 1.4);
    for (let i = 0; i < 320; i++) {
      const y = Y(rnd.r(362, 548)), s = perspS(y + gy, 352, 550);
      const x = rnd() * W, l = rnd.r(10, 26) * s;
      rect(g, '#dccba0', x, y, l, 1);
      rect(g, '#b6a074', x + 2 * s, y + Math.max(1, Math.round(s * 1.5)), l * 0.8, 1);
    }
    for (let i = 0; i < 90; i++) {
      const x = rnd() * W, y = Y(rnd.r(344, 358));
      g.fillStyle = rnd.chance(0.5) ? '#3e5a34' : '#55703e';
      const n = rnd.i(3, 7);
      for (let k = 0; k < n; k++) g.fillRect(Math.round(x + k * 2), Math.round(y + Math.sin(k * 1.3) * 1.5), 2, 1);
    }
    for (let i = 0; i < 120; i++) {
      const y = Y(rnd.r(360, 548)), s = perspS(y + gy, 352, 550), x = rnd() * W;
      rect(g, rnd.pick(['#f2e8dc', '#e8b8a8', '#d8a890', '#f6f0e4']), x, y, Math.max(1, 3 * s), Math.max(1, 2 * s));
      rect(g, '#9a8466', x + Math.round(s), y + Math.max(1, Math.round(2 * s)), Math.max(1, 2 * s), 1);
    }
    for (let i = 0; i < 9; i++) {
      const y = Y(rnd.r(372, 540)), s = perspS(y + gy, 352, 550);
      star5(g, rnd() * W, y, 4 + 5 * s, '#d8783a', '#f0a060');
    }
    for (let i = 0; i < 80; i++) {
      const y = Y(rnd.r(362, 548)), s = perspS(y + gy, 352, 550);
      stone(g, rnd() * W, y, rnd.r(2, 5) * s + 1, rnd.r(1.2, 3) * s + 1, '#a09a8e', '#c4beb2', '#7a756a');
    }
    g.strokeStyle = '#e09484';
    g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const y = Y(rnd.r(372, 540)), s = perspS(y + gy, 352, 550), x = rnd() * W;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI / 2 + rnd.r(-0.9, 0.9);
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 9 * s, y + Math.sin(a) * 9 * s);
      }
      g.stroke();
    }
    for (const dx of [700, 1880]) {
      const y = Y(rnd.r(366, 372));
      rect(g, '#8a6a48', dx, y, 64, 6);
      rect(g, '#a8865e', dx, y, 64, 2);
      rect(g, '#5e4630', dx, y + 5, 64, 1);
      rect(g, '#6e5238', dx + 60, y - 1, 6, 8);
      rect(g, '#8a6a48', dx + 18, y - 6, 3, 6);
      g.fillStyle = dpat(g, '#a48c64', null, 0.5);
      g.fillRect(dx - 2, y + 6, 70, 3);
    }
    let fx = rnd.r(200, 400), fyy = Y(392);
    for (let k = 0; k < 30; k++) {
      fx += 24;
      fyy += Math.sin(k * 0.3) * 2.5;
      const yy = fyy + (k % 2 ? 6 : 0), s = perspS(yy + gy, 352, 550);
      g.fillStyle = '#b8a276';
      ellipse(g, fx, yy, 3 * s, 1.6 * s);
    }
    steps.push(layer(L, 1, gy));
  }

  // 涨落的浪花(浅水条 + 白沫)
  const wash = mk(W, 30);
  wash.g.drawImage(ditherGrad(W, 30, ['#3aa2b6', '#4cb6bc', '#66c6c2', '#7ed2c6'], 5), 0, 0);
  for (let i = 0; i < 700; i++) rect(wash.g, rnd.chance(0.7) ? '#9adcd4' : '#3496ac', rnd() * W, rnd.r(1, 29), rnd.r(4, 14), 1);
  const foam = mk(W, 6);
  for (let x = 0; x < W; x += 2) {
    if (rnd.chance(0.85)) rect(foam.g, '#f4fbfa', x, rnd.i(0, 2), rnd.i(2, 6), rnd.i(2, 3));
    if (rnd.chance(0.3)) rect(foam.g, '#c8e6e8', x, 4, rnd.i(2, 5), 1);
  }
  steps.push((ctx, camX, tick) => {
    const cx = Math.round(camX);
    const hh = 14 + Math.round(Math.sin(tick * 0.035) * 4);
    ctx.drawImage(wash.c, cx, 0, VW, hh, 0, 332, VW, hh);
    ctx.drawImage(foam.c, cx, 0, VW, 6, 0, 332 + hh - 3, VW, 6);
    const y2 = 329 + Math.round(Math.sin(tick * 0.035 + 2.2) * 2);
    ctx.drawImage(foam.c, (cx + 400) % (W - VW), 0, VW, 3, 0, y2, VW, 3);
  });

  // 岸边的棕榈、草屋、礁石
  {
    const y0 = 96, h = 262;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - y0;
    const P = { trunk: '#8a6e4a', trunk2: '#9a7c54', trunkDark: '#5e4a32', trunkLit: '#b89a6a', leaf: '#2f7a3a', leafDark: '#1e5a2c', leafLit: '#4ea04a', nut: '#5a4228' };
    for (const rx of [380, 1460, 2240]) {
      for (let k = 0; k < 7; k++) stone(g, rx + rnd.r(-40, 40), Y(rnd.r(342, 352)), rnd.r(10, 22), rnd.r(7, 12), '#7a746c', '#9a948a', '#55504a');
    }
    hut(g, 960, Y(353), rnd);
    for (const [px, lean, ph] of [[150, 0.35, 200], [560, -0.3, 180], [640, 0.22, 150], [1260, 0.4, 205], [1700, -0.35, 190], [2080, 0.3, 175], [2330, -0.2, 160]]) {
      palm(g, px, Y(352) + rnd.r(-2, 2), ph, lean, rnd, P);
    }
    crisp(L);
    steps.push(layer(L, 1, y0));
  }

  return { width: W, zMin, zMax, music: 'stage', steps, front: [] };
}

// ===================================================================
// 5) Obsidian Spire — 黑曜尖塔大殿:血色风暴天空、尖拱窗、黑曜石柱、魔法阵
// ===================================================================

// 尖拱(等边哥特拱):矩形部分 y..y+h,拱顶高出 0.866w
function archPath(g, x, y, w, h) {
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y);
  g.arc(x + w, y, w, Math.PI, (Math.PI * 4) / 3);
  g.arc(x, y, w, -Math.PI / 3, 0);
  g.lineTo(x + w, y + h);
  g.closePath();
}

function magicCircle(g, cx, cy, rx, ry, col) {
  g.strokeStyle = col;
  const ring = (k, lw) => {
    g.lineWidth = lw;
    g.beginPath();
    g.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2);
    g.stroke();
  };
  ring(1, 2);
  ring(0.85, 2);
  ring(0.55, 1);
  g.fillStyle = col;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx * 0.925, y = cy + Math.sin(a) * ry * 0.925;
    const s = 0.6 + 0.4 * Math.abs(Math.sin(a));
    if (i % 2) g.fillRect(Math.round(x - 3 * s), Math.round(y), Math.max(2, Math.round(6 * s)), 1);
    else { g.fillRect(Math.round(x), Math.round(y - 1), 1, 3); g.fillRect(Math.round(x - 2), Math.round(y), 5, 1); }
  }
  g.lineWidth = 1;
  for (const off of [0, Math.PI / 3]) {
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = off + (k * 2 * Math.PI) / 3 - Math.PI / 2;
      const x = cx + Math.cos(a) * rx * 0.85, y = cy + Math.sin(a) * ry * 0.85;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
}

function buildSpire(rnd) {
  const W = 2400, zMin = 340, zMax = 530;
  const steps = [];

  {
    const f = 0.05, w = layerW(f, W), h = 320;
    const L = mk(w, h), g = L.g;
    g.drawImage(ditherGrad(w, h, [[0, '#0e030a'], [0.42, '#300a16'], [0.66, '#64181c'], [0.86, '#a43e2a'], [1, '#cc7036']], 11), 0, 0);
    const mx = Math.round(w * 0.7), my = 178;
    g.fillStyle = dpat(g, '#8a2a22', null, 0.25);
    ellipse(g, mx, my, 32, 32);
    g.fillStyle = '#d0603a';
    ellipse(g, mx, my, 13, 13);
    g.fillStyle = '#b04a2c';
    ellipse(g, mx - 3, my + 3, 4, 3);
    ellipse(g, mx + 5, my - 4, 3, 2);
    for (let i = 0; i < 26; i++) {
      const cw = Math.round(rnd.r(80, 260)), ch = Math.round(rnd.r(6, 14));
      g.drawImage(streakCloud(rnd, cw, ch, '#5e1c1e', '#24080e'), Math.round(rnd.r(-40, w)), Math.round(rnd.r(130, 290)));
    }
    steps.push(layer(L, f, 0));
  }

  // 远处锯齿黑峰 + 孤塔
  {
    const f = 0.12, w = layerW(f, W), y0 = 170, h = 170;
    const L = mk(w, h), g = L.g;
    const facet = profile(rnd, w, 0, 1, [[50, 1], [16, 0.4]]);
    const hs = profile(rnd, w, 34, 130, [[140, 1], [40, 0.5], [12, 0.2]], 1.8);
    let tx = 0;
    for (let x = 100; x < w - 100; x++) if (hs[x] < hs[tx] || tx < 100) tx = x;
    mountains(g, hs, h, { base: '#1e0c14', dark: '#14080e', lit: '#3a141a', rim: '#8a3024', depth: 40, facet });
    const ty = Math.round(hs[tx]);
    g.fillStyle = '#12060c';
    poly(g, [tx - 7, ty + 4, tx + 7, ty + 4, tx + 3, ty - 40, tx, ty - 58, tx - 3, ty - 40]);
    poly(g, [tx - 10, ty - 30, tx - 2, ty - 34, tx - 2, ty - 30]);
    poly(g, [tx + 10, ty - 22, tx + 2, ty - 26, tx + 2, ty - 22]);
    rect(g, '#ff7a30', tx - 1, ty - 32, 2, 3);
    rect(g, '#ff7a30', tx, ty - 14, 1, 2);
    hazeBand(g, w, 120, 50, '#4a1418', 4, 0.8);
    steps.push(layer(L, f, y0));
  }

  // 闪电(只透过窗户可见)
  steps.push((ctx, camX, tick) => {
    const cyc = Math.floor(tick / 150), ph = tick % 150;
    if (ph > 6 || ph === 2 || ph === 3 || hash01(cyc, 7) < 0.3) return;
    ctx.fillStyle = 'rgba(255,190,214,0.2)';
    ctx.fillRect(0, 128, VW, 200);
    let x = 60 + hash01(cyc, 1) * 670, y = 128;
    ctx.strokeStyle = 'rgba(255,210,240,0.35)';
    ctx.lineWidth = 5;
    const pts = [[x, y]];
    for (let k = 0; y < 300; k++) {
      x += (hash01(cyc, 10 + k) - 0.5) * 36;
      y += 10 + hash01(cyc, 40 + k) * 16;
      pts.push([x, y]);
    }
    ctx.beginPath();
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
    ctx.strokeStyle = '#fff4ff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // 大殿墙体(窗洞透明)
  const WIN = [], SCONCES = [];
  const PX = 1200;
  {
    const y0 = 96, h = 254;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - y0;
    brickWall(g, 0, 0, W, Y(326), 24, 64, ['#2a2330', '#2e2636', '#262030', '#2b2433'], '#17131c', '#3a3146', null, rnd);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = dpat(g, '#0e0b12', null, 0.6 - i * 0.2);
      g.fillRect(0, i * 22, W, 22);
    }
    rect(g, '#1a1520', 0, Y(146), W, 14);
    rect(g, '#3c3248', 0, Y(146), W, 1);
    rect(g, '#0e0b12', 0, Y(160), W, 1);
    for (let x = 6; x < W; x += 22) {
      rect(g, '#3a2c50', x, Y(149), 1, 8);
      rect(g, '#3a2c50', x + 3, Y(152), 5, 1);
      rect(g, '#3a2c50', x + 10, Y(149), 1, 3);
      rect(g, '#3a2c50', x + 10, Y(154), 1, 3);
      rect(g, '#3a2c50', x + 14, Y(150), 3, 3);
    }
    g.strokeStyle = '#141018';
    g.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      let x = rnd() * W, y = Y(rnd.r(170, 300));
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
      for (let k = 0; k < 5; k++) {
        x += rnd.r(-6, 6);
        y += rnd.r(4, 10);
        g.lineTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
      }
      g.stroke();
    }
    rect(g, '#1c1722', 0, Y(318), W, Y(350) - Y(318));
    rect(g, '#3c3248', 0, Y(318), W, 2);
    rect(g, '#2a2232', 0, Y(330), W, 1);
    rect(g, '#352c40', 0, Y(331), W, 1);
    // 尖拱窗
    for (let wx = 200; wx < W; wx += 400) {
      const ww = 84, top = Y(214), bot = Y(304);
      g.fillStyle = '#4a3e58';
      archPath(g, wx - ww / 2 - 7, top, ww + 14, bot - top + 7);
      g.fill();
      g.fillStyle = '#342a40';
      archPath(g, wx - ww / 2 - 3, top + 1, ww + 6, bot - top + 3);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      archPath(g, wx - ww / 2, top + 3, ww, bot - top - 3);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      rect(g, '#342a40', wx - 2, top - 70, 4, bot - top + 70);
      rect(g, '#342a40', wx - ww / 2, Y(258), ww, 3);
      g.strokeStyle = '#342a40';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(wx, top - 26, 13, 0, Math.PI * 2);
      g.stroke();
      rect(g, '#4e425c', wx - ww / 2 - 10, bot, ww + 20, 5);
      rect(g, '#64567a', wx - ww / 2 - 10, bot, ww + 20, 1);
      WIN.push(wx);
    }
    // 中央巨门
    for (let k = 3; k >= 0; k--) {
      const r = 75 + k * 9;
      const c = ['#120e18', '#3a3048', '#2a2234', '#463a58'][k];
      g.fillStyle = c;
      ellipse(g, PX, Y(240), r, r);
      rect(g, c, PX - r, Y(240), r * 2, Y(346) - Y(240));
    }
    g.drawImage(ditherGrad(150, 106, ['#07050a', '#0c070e', '#2a0a12', '#4a1018'], 6), PX - 75, Y(240));
    g.fillStyle = '#07050a';
    g.beginPath();
    g.arc(PX, Y(240), 75, Math.PI, 0);
    g.fill();
    for (let k = 0; k < 15; k++) {
      const a = Math.PI + (k / 14) * Math.PI;
      rect(g, '#6a3a8a', PX + Math.cos(a) * 88 - 1, Y(240) + Math.sin(a) * 88 - 1, 3, 3);
    }
    // 黑曜石柱
    const pillar = (px) => {
      const pw = 54, l = px - pw / 2;
      rect(g, '#16121e', l, 0, pw, Y(326));
      rect(g, '#2a2236', l + 12, 0, 10, Y(326));
      rect(g, '#4e4068', l + 3, 0, 3, Y(326));
      rect(g, '#6a5a8a', l + 10, 0, 1, Y(326));
      rect(g, '#0a080e', l + pw - 7, 0, 7, Y(326));
      for (let k = 0; k < 3; k++) rect(g, '#100c16', px - 6 + k * 9, 0, 1, Y(326));
      rect(g, '#221c2c', l - 8, Y(128), pw + 16, 14);
      rect(g, '#4e4068', l - 8, Y(128), pw + 16, 2);
      rect(g, '#1c1724', l - 10, Y(300), pw + 20, Y(350) - Y(300));
      rect(g, '#4e4068', l - 10, Y(300), pw + 20, 2);
      rect(g, '#2c2438', l - 6, Y(312), pw + 12, 2);
      // 旗幡
      const bw = 32, bt = Y(150), bb = Y(246);
      g.fillStyle = '#6a1020';
      poly(g, [px - bw / 2, bt, px + bw / 2, bt, px + bw / 2, bb, px, bb - 12, px - bw / 2, bb]);
      g.fillStyle = '#4a0a18';
      poly(g, [px + bw / 2 - 8, bt, px + bw / 2, bt, px + bw / 2, bb, px + bw / 2 - 8, bb - 3]);
      rect(g, '#8a2030', px - bw / 2, bt, 2, bb - bt);
      rect(g, '#b08a3a', px - bw / 2 - 3, bt - 3, bw + 6, 4);
      rect(g, '#b08a3a', px - bw / 2 + 3, bt + 4, 1, bb - bt - 14);
      rect(g, '#b08a3a', px + bw / 2 - 4, bt + 4, 1, bb - bt - 14);
      const sy = bt + 40;
      g.fillStyle = '#b08a3a';
      poly(g, [px, sy - 16, px + 11, sy, px, sy + 16, px - 11, sy]);
      g.fillStyle = '#6a1020';
      poly(g, [px, sy - 12, px + 8, sy, px, sy + 12, px - 8, sy]);
      g.fillStyle = '#d8b050';
      ellipse(g, px, sy, 6, 3);
      g.fillStyle = '#1a0408';
      ellipse(g, px, sy, 2, 3);
      // 壁灯
      g.fillStyle = dpat(g, '#5a3a8a', null, 0.25);
      ellipse(g, px, Y(276), 18, 14);
      rect(g, '#2a2430', px - 2, Y(286), 4, 12);
      g.fillStyle = '#3a3240';
      poly(g, [px - 11, Y(282), px + 11, Y(282), px + 6, Y(290), px - 6, Y(290)]);
      rect(g, '#6a5a7a', px - 11, Y(282), 22, 1);
      SCONCES.push(px);
    };
    for (let px = 0; px <= W; px += 400) if (px !== PX) pillar(px);
    pillar(PX - 115);
    pillar(PX + 115);
    steps.push(layer(L, 1, y0));
  }

  // 抛光地砖 + 倒影 + 魔法阵
  const gy = 336;
  {
    const h = VH - gy;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - gy;
    const top = Y(339);
    for (let y = top, k = 0; y < h; k++) {
      const hh = Math.round(4 * Math.pow(1.16, k));
      rect(g, k % 2 ? '#2a2334' : '#30283b', 0, y, W, hh);
      rect(g, '#3e3450', 0, y, W, 1);
      y += hh;
    }
    const streaks = (cx, hw, len, cols, dens) => {
      for (let y = top + 1; y < top + len; y++) {
        const t = (y - top) / len;
        const half = hw * (1 - t * 0.35);
        for (let x = cx - half; x < cx + half;) {
          const l = rnd.r(3, 12);
          if (rnd() < dens * (1 - t)) rect(g, cols[(rnd() * cols.length) | 0], x, y, l, 1);
          x += l + rnd.r(1, 5);
        }
      }
    };
    for (const wx of WIN) streaks(wx, 38, 120, ['#4a1e2c', '#5a2634', '#6a2e36'], 0.55);
    for (const sx of SCONCES) streaks(sx, 7, 50, ['#3e3058', '#4e3a6e'], 0.6);
    g.fillStyle = dpat(g, '#3a0c14', null, 0.5);
    g.fillRect(PX - 70, top, 140, 30);
    floorDashes(g, W, top, h, 1400, ['#3a3146', '#241e2c'], rnd, 2, 8, 1);
    magicCircle(g, PX, Y(446), 230, 56, '#4e3a6e');
    g.fillStyle = '#0c0910';
    g.fillRect(0, 0, W, top);
    g.fillStyle = dpat(g, '#0e0b12', null, 0.6);
    g.fillRect(0, top, W, 4);
    steps.push(layer(L, 1, gy));
  }
  steps.push(fanSeams(110, 340, 550, 'rgba(74,62,98,0.7)'));
  steps.push((ctx, camX, tick) => {
    const x = PX - camX;
    if (x < -260 || x > VW + 260) return;
    const a = 0.14 + 0.1 * Math.sin(tick * 0.07);
    ctx.strokeStyle = `rgba(190,90,255,${a.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, 446, 230, 56, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, 446, 196, 48, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 门洞深处的眼睛(偶尔眨眼)
    if (tick % 230 > 6) {
      ctx.fillStyle = '#ff3a20';
      ctx.fillRect(Math.round(x) - 9, 268, 4, 2);
      ctx.fillRect(Math.round(x) + 5, 268, 4, 2);
    }
  });
  const fl = flameFrames(rnd, 16, 24, ['#5a2a9a', '#9a5ad8', '#e8d0ff'], 4);
  steps.push((ctx, camX, tick) => {
    for (let i = 0; i < SCONCES.length; i++) drawAt(ctx, fl[((tick >> 2) + i * 3) & 3], SCONCES[i] - 8, 259, 1, camX);
  });
  const embers = [];
  for (let i = 0; i < 16; i++) embers.push({ x: rnd() * (VW + 200), sp: rnd.r(0.3, 0.7), ph: rnd() * 600, sw: rnd.r(0.02, 0.05) });
  steps.push((ctx, camX, tick) => {
    ctx.fillStyle = '#ff9a40';
    const span = VW + 200;
    for (const e of embers) {
      if (((tick >> 2) + (e.ph | 0)) % 5 === 0) continue;
      const y = 548 - ((tick * e.sp + e.ph) % 400);
      const x = ((((e.x - camX * 0.9) % span) + span) % span) - 100 + Math.sin(tick * e.sw + e.ph) * 8;
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  });

  return { width: W, zMin, zMax, music: 'boss', steps, front: [] };
}

// ===================================================================
// 6) Harbor Arena — 港湾竞技场:夜景天际线、探照灯塔、欢呼看台、木质擂台
// ===================================================================

// 观众小人:fillRect 像素块
function person(g, x, y, s, P, arms) {
  const u = (v) => Math.max(1, Math.round(v * s));
  x = Math.round(x);
  y = Math.round(y);
  const bw = u(6), bh = u(5), hw = u(4);
  rect(g, P.shirt, x - bw / 2, y - bh, bw, bh);
  rect(g, P.skin, x - hw / 2, y - bh - hw, hw, hw);
  rect(g, P.hair, x - hw / 2, y - bh - hw, hw, Math.max(1, u(1.4)));
  if (arms) {
    rect(g, P.shirt, x - bw / 2 - u(1), y - bh - u(4), u(1), u(5));
    rect(g, P.shirt, x + bw / 2, y - bh - u(4), u(1), u(5));
    rect(g, P.skin, x - bw / 2 - u(1), y - bh - u(5), u(1), u(1));
    rect(g, P.skin, x + bw / 2, y - bh - u(5), u(1), u(1));
  }
}

function buildArena(rnd) {
  const W = 1400, zMin = 346, zMax = 524;
  const steps = [];

  {
    const f = 0.02, w = layerW(f, W), h = 240;
    const L = mk(w, h), g = L.g;
    g.drawImage(ditherGrad(w, h, [[0, '#060918'], [0.5, '#121a3a'], [0.8, '#222e58'], [1, '#3a4470']], 9), 0, 0);
    for (let i = 0; i < 90; i++) rect(g, rnd.chance(0.75) ? '#9aa4d0' : '#ffffff', rnd() * w, rnd.r(0, 200), 1, 1);
    steps.push(layer(L, f, 0));
  }

  // 城市天际线
  {
    const f = 0.1, w = layerW(f, W), y0 = 120, h = 100;
    const L = mk(w, h), g = L.g;
    const tops = [];
    for (let x = -10; x < w; x += rnd.r(12, 40)) {
      const bw = rnd.r(14, 46), bh = rnd.r(22, 78);
      const c = rnd.pick(['#141c38', '#1a2342', '#10182e']);
      rect(g, c, x, h - bh, bw, bh);
      for (let yy = h - bh + 3; yy < h - 2; yy += 5) {
        for (let xx = x + 2; xx < x + bw - 2; xx += 4) {
          if (rnd.chance(0.22)) rect(g, rnd.pick(['#e8d070', '#f0e0a0', '#e8d070', '#80d0e0']), xx, yy, 2, 2);
        }
      }
      if (bh > 60) tops.push([x + bw / 2, h - bh]);
    }
    const nx = Math.round(w * 0.58);
    rect(g, '#182040', nx - 7, h - 92, 14, 92);
    rect(g, '#1e2848', nx - 12, h - 70, 24, 6);
    rect(g, '#182040', nx - 1, h - 100, 2, 8);
    for (let yy = h - 88; yy < h; yy += 6) rect(g, '#80d0e0', nx - 4, yy, 1, 2);
    for (const [tx, ty] of tops) {
      rect(g, '#2a3050', tx, ty - 8, 1, 8);
      rect(g, '#ff4030', tx - 1, ty - 9, 2, 2);
    }
    rect(g, '#ff4030', nx - 1, h - 101, 2, 2);
    hazeBand(g, w, h - 30, 30, '#3a3a6a', 3, 0.55);
    steps.push(layer(L, f, y0));
  }

  // 照明塔
  {
    const f = 0.4, w = layerW(f, W), y0 = 120, h = 120;
    const L = mk(w, h), g = L.g;
    for (const lx of [110, w - 110]) {
      g.fillStyle = dpat(g, '#8890c0', null, 0.12);
      ellipse(g, lx, 22, 78, 56);
      g.fillStyle = dpat(g, '#b8c0ff', null, 0.25);
      ellipse(g, lx, 22, 52, 36);
      rect(g, '#2e323e', lx - 6, 34, 2, h - 34);
      rect(g, '#2e323e', lx + 4, 34, 2, h - 34);
      g.strokeStyle = '#2e323e';
      g.lineWidth = 1;
      g.beginPath();
      for (let yy = 36; yy < h; yy += 8) {
        g.moveTo(lx - 5, yy);
        g.lineTo(lx + 5, yy + 8);
        g.moveTo(lx + 5, yy);
        g.lineTo(lx - 5, yy + 8);
      }
      g.stroke();
      rect(g, '#22262e', lx - 26, 12, 52, 24);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) rect(g, '#fffbe0', lx - 23 + c * 12, 15 + r * 10, 10, 7);
    }
    steps.push(layer(L, f, y0));
  }

  // 看台(两帧:观众挥手交替)
  const SF = 0.7;
  const standFrames = [];
  {
    const w = layerW(SF, W), y0 = 140, h = 188;
    const Y = (y) => y - y0;
    const rows = [];
    for (let y = Y(206), k = 0; y < Y(312); k++) {
      const rh = Math.round(9 + k * 0.6);
      rows.push([y, rh]);
      y += rh;
    }
    const aisles = [];
    for (let x = 130; x < w; x += 270) aisles.push(x);
    const inAisle = (x) => aisles.some((a) => Math.abs(x - a) < 13);
    const crowd = [];
    const skins = ['#e8c09a', '#d8a878', '#b88058', '#f0d0b0', '#c89068'];
    const hairs = ['#2a1a10', '#4a3020', '#1a1a1a', '#8a6030', '#c09050', '#3a2a2a'];
    const shirts = ['#b84040', '#3a60b0', '#d8c040', '#40a060', '#e8e8e8', '#8a50a0', '#e07830', '#3a8ab0', '#c8506a', '#505868'];
    rows.forEach(([ry, rh], k) => {
      const s = rh / 12;
      const dk = 0.5 - 0.32 * (k / (rows.length - 1));
      const dim = (c) => mixc(c, '#101426', dk);
      for (let x = rnd.r(0, 6); x < w; x += 8.5 * s * rnd.r(0.85, 1.15)) {
        if (inAisle(x)) continue;
        crowd.push({ x, y: ry + rh - 1, s, P: { skin: dim(rnd.pick(skins)), hair: dim(rnd.pick(hairs)), shirt: dim(rnd.pick(shirts)) }, r: rnd() });
      }
    });
    const banners = [];
    for (let i = 0; i < 10; i++) {
      const p = crowd[(rnd() * crowd.length) | 0];
      banners.push({ x: p.x, y: p.y - 14 * p.s, c: mixc(rnd.pick(['#d83030', '#f0d030', '#3070d0', '#f0f0f0']), '#101426', 0.25), s: p.s });
    }
    for (let fr = 0; fr < 2; fr++) {
      const L = mk(w, h), g = L.g;
      rect(g, '#262a3c', 0, Y(204), w, Y(326) - Y(204));
      rows.forEach(([ry, rh], k) => {
        rect(g, k % 2 ? '#2c3044' : '#33384e', 0, ry, w, rh);
        rect(g, '#464e68', 0, ry + rh - 1, w, 1);
      });
      for (const a of aisles) {
        rect(g, '#3a4058', a - 12, Y(206), 24, Y(312) - Y(206));
        for (const [ry, rh] of rows) rect(g, '#5a6078', a - 12, ry + rh - 2, 24, 1);
        rect(g, '#7a8098', a - 1, Y(206), 2, Y(312) - Y(206));
      }
      for (const p of crowd) {
        const up = fr === 0 ? p.r < 0.12 : p.r < 0.42;
        person(g, p.x, p.y - (up && fr === 1 ? 1 : 0), p.s, p.P, up);
      }
      for (const b of banners) {
        const wv = fr ? 2 : -2;
        rect(g, '#d8d8d8', b.x, b.y - 14 * b.s, 1, 16 * b.s);
        g.fillStyle = b.c;
        poly(g, [b.x + 1, b.y - 14 * b.s, b.x + 1 + 18 * b.s, b.y - 13 * b.s + wv, b.x + 1 + 18 * b.s, b.y - 5 * b.s + wv, b.x + 1, b.y - 6 * b.s]);
      }
      // 顶棚边缘 + 大屏
      rect(g, '#2a2e3a', 0, Y(196), w, 10);
      rect(g, '#4a4e5a', 0, Y(196), w, 1);
      for (let x = 60; x < w; x += 300) rect(g, '#20242e', x, 0, 6, Y(198));
      const cx = Math.round(w / 2);
      rect(g, '#1a1c24', cx - 78, Y(146), 156, 50);
      rect(g, '#3a3e4a', cx - 78, Y(146), 156, 2);
      rect(g, '#10264a', cx - 72, Y(150), 144, 40);
      g.fillStyle = dpat(g, '#18386a', null, 0.5);
      g.fillRect(cx - 72, Y(150), 144, 40);
      const txt = fr ? 'FIGHT!' : 'ROUND 1';
      pixText(g, txt, cx - textW(txt, 3) / 2, Y(162), 3, fr ? '#f0d040' : '#f0f0f0');
      // 看台前沿
      rect(g, '#1e2232', 0, Y(312), w, Y(328) - Y(312));
      rect(g, '#8a90a0', 0, Y(312), w, 2);
      for (let x = 0; x < w; x += 24) rect(g, '#6a7080', x, Y(314), 1, 8);
      standFrames.push(L.c);
    }
    steps.push((ctx, camX, tick) => drawLayer(ctx, { img: standFrames[(tick >> 3) & 1], f: SF, y: y0 }, camX, tick));
  }
  // 闪光灯
  steps.push((ctx, camX, tick) => {
    const t = tick >> 1;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      if (hash01(t, i) < 0.55) continue;
      const x = Math.round(hash01(t, i + 10) * VW), y = Math.round(212 + hash01(t, i + 20) * 92);
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillRect(x - 4, y, 9, 1);
      ctx.fillRect(x, y - 4, 1, 9);
    }
  });

  // 场边广告围挡
  {
    const y0 = 290, h = 62;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - y0;
    rect(g, '#c8ccd4', 0, Y(296), W, 5);
    rect(g, '#eef0f4', 0, Y(296), W, 1);
    rect(g, '#7a7e88', 0, Y(301), W, 1);
    const ads = [['HARBOR', '#a83030', '#f4f0e8'], ['ARENA', '#2a4a9a', '#f0d040'], ['FIGHT!', '#d8b030', '#2a2a2a'], ['BAY 99', '#2a7a4a', '#f4f0e8'],
      ['KO', '#e0e0e0', '#c83030'], ['NEON', '#3a2a5a', '#ff70c0'], ['TIGER', '#e07830', '#1a1a1a'], ['ROUND', '#1a1a1a', '#e8e8e8']];
    let i = 0;
    for (let x = 0; x < W; x += 175, i++) {
      const [t, bg, fg] = ads[i % ads.length];
      rect(g, bg, x, Y(302), 175, 38);
      rect(g, '#000000', x + 174, Y(302), 1, 38);
      g.fillStyle = dpat(g, '#ffffff', null, 0.12);
      g.fillRect(x, Y(302), 175, 5);
      pixText(g, t, x + (175 - textW(t, 4)) / 2, Y(311), 4, fg);
    }
    rect(g, '#24242c', 0, Y(340), W, 9);
    rect(g, '#3a3a44', 0, Y(340), W, 1);
    steps.push(layer(L, 1, y0));
  }

  // 木质擂台地板
  const gy = 348;
  {
    const h = VH - gy;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - gy;
    brickFloor(g, W, 0, h, rnd, {
      h0: 5, grow: 1.12, lenK: 9,
      cols: ['#8a6c4c', '#93744f', '#866848', '#8e7050', '#977852'],
      mortar: '#5a4430', lit: '#a88a62', dark: '#74583c',
    });
    floorDashes(g, W, 2, h, 2600, ['#7a5e40', '#a08060', '#82654a'], rnd, 8, 30, 1);
    for (const sx of [250, 700, 1150]) {
      g.fillStyle = dpat(g, '#b8986c', null, 0.25);
      ellipse(g, sx, Y(445), 130, 38);
      g.fillStyle = dpat(g, '#c8a878', null, 0.25);
      ellipse(g, sx, Y(445), 80, 24);
    }
    g.strokeStyle = '#c8b088';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(700, Y(446), 160, 40, 0, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(700, Y(446), 140, 34, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#c8b088';
    star5(g, 700, Y(446), 30, '#b89a6a', '#c8b088');
    g.fillStyle = dpat(g, '#ddd4c0', null, 0.75);
    g.fillRect(0, Y(356), W, 2);
    g.fillRect(0, Y(536), W, 3);
    g.fillStyle = dpat(g, '#2a2018', null, 0.6);
    g.fillRect(0, 0, W, 5);
    rect(g, '#3a2a20', 0, Y(541), W, h - Y(541));
    rect(g, '#c8a040', 0, Y(541), W, 1);
    for (let x = 30; x < W; x += 140) rect(g, '#8a7040', x, Y(544), 6, 3);
    steps.push(layer(L, 1, gy));
  }

  return { width: W, zMin, zMax, music: 'battle1', steps, front: [] };
}

// ===================================================================
// 7) Mountain Temple — 山寺:晚霞、石林群峰、红柱大殿、钟亭、樱花与古松
// ===================================================================

// 由若干尖窄的高斯峰取最大值组成石林轮廓
function karst(rnd, w, h, n, wMin, wMax, hMin, hMax) {
  const hs = new Float32Array(w).fill(h);
  const nz = fbm(rnd, w, [[24, 1], [7, 0.5]]);
  for (let k = 0; k < n; k++) {
    const c = rnd() * w, wd = rnd.r(wMin, wMax), ht = rnd.r(hMin, hMax);
    const x0 = Math.max(0, Math.floor(c - wd * 3)), x1 = Math.min(w, Math.ceil(c + wd * 3));
    for (let x = x0; x < x1; x++) {
      const d = (x - c) / wd;
      const v = ht / (1 + d * d * d * d);
      const y = h - v;
      if (y < hs[x]) hs[x] = y;
    }
  }
  for (let x = 0; x < w; x++) hs[x] += nz[x] * 2.5;
  return hs;
}

function roofShape(g, cx, y, halfW, h, lift, col, line, edge) {
  // 飞檐屋顶:下缘两端上翘
  g.save();
  g.beginPath();
  g.moveTo(cx - halfW - lift * 1.4, y - lift);
  g.quadraticCurveTo(cx - halfW * 0.8, y + 2, cx - halfW * 0.5, y);
  g.lineTo(cx + halfW * 0.5, y);
  g.quadraticCurveTo(cx + halfW * 0.8, y + 2, cx + halfW + lift * 1.4, y - lift);
  g.lineTo(cx + halfW * 0.55, y - h);
  g.lineTo(cx - halfW * 0.55, y - h);
  g.closePath();
  g.fillStyle = col;
  g.fill();
  g.clip();
  for (let x = cx - halfW - lift * 2; x < cx + halfW + lift * 2; x += 5) rect(g, line, x, y - h - 2, 2, h + 4);
  g.restore();
  if (edge) {
    g.strokeStyle = edge;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - halfW - lift * 1.4, y - lift);
    g.quadraticCurveTo(cx - halfW * 0.8, y + 2, cx - halfW * 0.5, y);
    g.lineTo(cx + halfW * 0.5, y);
    g.quadraticCurveTo(cx + halfW * 0.8, y + 2, cx + halfW + lift * 1.4, y - lift);
    g.stroke();
  }
}

function buildTemple(rnd) {
  const W = 2000, zMin = 356, zMax = 530;
  const steps = [];

  {
    const f = 0.03, w = layerW(f, W), h = 320;
    const L = mk(w, h), g = L.g;
    g.drawImage(ditherGrad(w, h, [[0, '#3a326c'], [0.36, '#785088'], [0.6, '#c46a6c'], [0.8, '#eaa068'], [1, '#f6d49c']], 11), 0, 0);
    const sx = Math.round(w * 0.42), sy = 262;
    g.fillStyle = dpat(g, '#fbe2b0', null, 0.25);
    ellipse(g, sx, sy, 60, 60);
    g.fillStyle = dpat(g, '#fdecc4', null, 0.5);
    ellipse(g, sx, sy, 38, 38);
    g.fillStyle = '#fff2c8';
    ellipse(g, sx, sy, 26, 26);
    for (let i = 0; i < 12; i++) {
      const cw = Math.round(rnd.r(70, 200)), ch = Math.round(rnd.r(5, 10));
      g.drawImage(streakCloud(rnd, cw, ch, '#f6b4a0', '#b47290'), Math.round(rnd.r(-30, w - cw)), Math.round(rnd.r(140, 250)));
    }
    steps.push(layer(L, f, 0));
  }

  // 远处石林
  {
    const f = 0.1, w = layerW(f, W), y0 = 150, h = 180;
    const L = mk(w, h), g = L.g;
    const hs = karst(rnd, w, h, 26, 10, 26, 40, 140);
    mountains(g, hs, h, { base: '#8a6e9a', dark: '#7a5e8c', lit: '#a084a8', rim: '#eab092', depth: 70, smooth: 3 });
    hazeBand(g, w, 110, 54, '#d8a8a8', 4, 0.9);
    rect(g, '#d8a8a8', 0, 164, w, h - 164);
    steps.push(layer(L, f, y0));
  }
  steps.push(cloudDrift(rnd, 4, 252, 300, 0.15, ['#f6dcd2', '#e8bcbc', '#c89aa8'], 120, 220, 0.03, 0.08));

  // 中景山峰(带松与小塔)
  {
    const f = 0.28, w = layerW(f, W), y0 = 176, h = 184;
    const L = mk(w, h), g = L.g;
    const hs = karst(rnd, w, h, 16, 18, 40, 50, 120);
    mountains(g, hs, h, { base: '#5a4a72', dark: '#4a3c62', lit: '#6e5a84', rim: '#c88a80', depth: 60, smooth: 4 });
    for (let i = 0; i < 70; i++) {
      const x = Math.round(rnd() * (w - 1));
      if (hs[x] > h - 30) continue;
      pine(g, x, hs[x] + rnd.r(3, 14), rnd.r(8, 18), rnd.r(6, 10), '#3a3050', '#4a3e62', '#2c2440');
    }
    let px = 0;
    for (let x = 60; x < w - 60; x++) if (hs[x] < hs[px] || px < 60) px = x;
    const py = Math.round(hs[px]) + 2;
    for (let k = 0; k < 4; k++) {
      const yy = py - k * 7, hw = 8 - k * 1.5;
      rect(g, '#3a2e4a', px - hw + 2, yy - 6, hw * 2 - 4, 6);
      rect(g, '#2a2038', px - hw - 1, yy - 7, hw * 2 + 2, 2);
    }
    rect(g, '#f0b060', px - 1, py - 4, 2, 2);
    crisp(L);
    hazeBand(g, w, 112, 36, '#b88a98', 4, 0.85);
    rect(g, '#b88a98', 0, 148, w, h - 148);
    steps.push(layer(L, f, y0));
  }

  // 庭院:院墙、月洞门、大殿、钟亭、樱花、古松、石灯笼
  const HX = 1000;
  const MOON = 1720;
  const CHERRY = 520;
  const LANTERNS = [700, 1300];
  {
    const y0 = 110, h = 252;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - y0;
    // 院墙
    rect(g, '#d4bfaa', 0, Y(300), W, Y(352) - Y(300));
    g.fillStyle = dpat(g, '#c0a894', null, 0.5);
    g.fillRect(0, Y(300), W, 8);
    g.fillStyle = dpat(g, '#c0a894', null, 0.25);
    g.fillRect(0, Y(308), W, 8);
    brickWall(g, 0, Y(336), W, Y(352) - Y(336), 8, 26, ['#8a8276', '#948c7e', '#82796e'], '#646056', '#a8a092', null, rnd);
    rect(g, '#2f4848', 0, Y(289), W, 12);
    for (let x = 0; x < W; x += 5) rect(g, '#243a3a', x, Y(289), 2, 12);
    rect(g, '#3e5a5a', 0, Y(286), W, 4);
    rect(g, '#1c2c2c', 0, Y(301), W, 2);
    g.fillStyle = dpat(g, '#a08a78', null, 0.5);
    g.fillRect(0, Y(303), W, 3);
    for (let x = 120; x < W; x += 300) {
      if (Math.abs(x - HX) < 280 || Math.abs(x - MOON) < 80) continue;
      rect(g, '#5a3a28', x - 15, Y(312), 30, 22);
      rect(g, '#2a1a12', x - 13, Y(314), 26, 18);
      for (let k = 0; k < 4; k++) rect(g, '#6a4a34', x - 13 + k * 7 + 3, Y(314), 1, 18);
      for (let k = 0; k < 3; k++) rect(g, '#6a4a34', x - 13, Y(318) + k * 5, 26, 1);
    }
    // 月洞门(透出背后山景)
    g.globalCompositeOperation = 'destination-out';
    ellipse(g, MOON, Y(318), 30, 30);
    rect(g, '#000', MOON - 20, Y(318), 40, Y(352) - Y(318));
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#a8927c';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(MOON, Y(318), 32, Math.PI * 0.82, Math.PI * 2.18);
    g.stroke();
    // 钟亭
    {
      const bx = 300;
      brickWall(g, bx - 60, Y(330), 120, Y(352) - Y(330), 7, 24, ['#8e887c', '#9a9488', '#868074'], '#686458', '#b0a898', null, rnd);
      for (const px of [bx - 46, bx + 40]) {
        rect(g, '#a0302a', px, Y(252), 7, Y(330) - Y(252));
        rect(g, '#c04a3a', px, Y(252), 2, Y(330) - Y(252));
      }
      rect(g, '#3a6a6a', bx - 52, Y(246), 104, 8);
      for (let k = 0; k < 8; k++) rect(g, '#c8a040', bx - 48 + k * 13, Y(248), 3, 3);
      roofShape(g, bx, Y(246), 56, 30, 10, '#2f4848', '#243a3a', '#4a6a6a');
      rect(g, '#3e5a5a', bx - 32, Y(218), 64, 3);
      rect(g, '#5a4a2a', bx - 1, Y(254), 2, 8);
      g.fillStyle = '#8a6a3a';
      poly(g, [bx - 9, Y(262), bx + 9, Y(262), bx + 12, Y(292), bx - 12, Y(292)]);
      rect(g, '#a8844a', bx - 6, Y(264), 2, 26);
      rect(g, '#6a4e2a', bx - 13, Y(290), 26, 3);
    }
    // 大殿
    {
      brickWall(g, HX - 220, Y(322), 440, Y(352) - Y(322), 8, 30, ['#8e887c', '#96907f', '#888274'], '#686458', '#b0a898', null, rnd);
      rect(g, '#b4ac9c', HX - 220, Y(322), 440, 2);
      for (let k = 0; k < 3; k++) {
        const sw = 180 - k * 0;
        rect(g, '#a49c8c', HX - sw / 2 - k * 6, Y(334) + k * 6, sw + k * 12, 6);
        rect(g, '#c4bcac', HX - sw / 2 - k * 6, Y(334) + k * 6, sw + k * 12, 1);
      }
      rect(g, '#5a3420', HX - 200, Y(232), 400, Y(322) - Y(232));
      for (let k = 0; k < 6; k++) {
        const px = HX - 200 + k * 78;
        const dw = 70;
        if (k < 5) {
          const open = k === 2;
          rect(g, open ? '#2a1810' : '#6a3a22', px + 8, Y(240), dw - 6, Y(322) - Y(240));
          if (open) {
            for (let j = 0; j < 5; j++) rect(g, '#e8a040', px + 20 + j * 10, Y(300) - (j % 2) * 4, 2, 3);
            g.fillStyle = dpat(g, '#c8803a', null, 0.25);
            g.fillRect(px + 10, Y(280), dw - 10, 40);
          } else {
            for (let yy = Y(244); yy < Y(300); yy += 6) rect(g, '#4a2614', px + 10, yy, dw - 10, 1);
            for (let xx = px + 12; xx < px + dw; xx += 6) rect(g, '#4a2614', xx, Y(244), 1, Y(300) - Y(244));
            rect(g, '#4a2614', px + 10, Y(304), dw - 10, 2);
          }
        }
        rect(g, '#a0302a', px, Y(232), 9, Y(322) - Y(232));
        rect(g, '#c4503e', px, Y(232), 2, Y(322) - Y(232));
        rect(g, '#6a1c18', px + 7, Y(232), 2, Y(322) - Y(232));
        rect(g, '#7a7468', px - 2, Y(316), 13, 6);
      }
      rect(g, '#3a6a6a', HX - 212, Y(216), 424, 16);
      for (let x = HX - 208; x < HX + 208; x += 16) {
        rect(g, '#a0302a', x, Y(220), 8, 8);
        rect(g, '#c8a040', x + 10, Y(222), 3, 3);
      }
      rect(g, '#2a4a4a', HX - 212, Y(230), 424, 2);
      roofShape(g, HX, Y(214), 236, 22, 12, '#2f4848', '#243a3a', '#4a6a6a');
      roofShape(g, HX, Y(194), 150, 40, 8, '#2f4848', '#243a3a', '#4a6a6a');
      rect(g, '#3e5a5a', HX - 90, Y(156), 180, 6);
      for (const sx of [-1, 1]) {
        const ex = HX + sx * 92;
        g.fillStyle = '#3e5a5a';
        poly(g, [ex - 5, Y(150), ex + 5, Y(150), ex + sx * 8, Y(138), ex + sx * 2, Y(142)]);
        rect(g, '#c8a040', ex + sx * 6 - 1, Y(140), 3, 3);
      }
      g.fillStyle = '#c8a040';
      ellipse(g, HX, Y(150), 5, 5);
      rect(g, '#c8a040', HX - 32, Y(196), 64, 18);
      rect(g, '#1e2a4a', HX - 30, Y(198), 60, 14);
      for (let k = 0; k < 3; k++) {
        rect(g, '#c8a040', HX - 22 + k * 17, Y(201), 8, 2);
        rect(g, '#c8a040', HX - 19 + k * 17, Y(201), 2, 9);
        rect(g, '#c8a040', HX - 22 + k * 17, Y(206), 8, 1);
      }
      for (const lx of [HX - 168, HX + 168]) {
        rect(g, '#3a2a1a', lx, Y(232), 1, 8);
        g.fillStyle = '#c83a2a';
        ellipse(g, lx, Y(248), 9, 10);
        g.fillStyle = '#e86040';
        ellipse(g, lx - 3, Y(245), 3, 4);
        rect(g, '#c8a040', lx - 5, Y(237), 10, 2);
        rect(g, '#c8a040', lx - 5, Y(257), 10, 2);
        rect(g, '#c8a040', lx, Y(259), 1, 5);
      }
    }
    // 古松
    {
      const tx = 1480;
      g.fillStyle = '#4a3024';
      poly(g, [tx - 10, Y(352), tx + 12, Y(352), tx + 8, Y(300), tx + 26, Y(250), tx + 18, Y(246), tx - 2, Y(296)]);
      g.fillStyle = '#6a4632';
      poly(g, [tx - 8, Y(352), tx - 2, Y(352), tx + 2, Y(300), tx + 20, Y(250), tx + 18, Y(246), tx - 4, Y(298)]);
      rect(g, '#4a3024', tx + 18, Y(250), 70, 5);
      rect(g, '#4a3024', tx - 60, Y(278), 66, 5);
      rect(g, '#4a3024', tx + 20, Y(222), 4, 30);
      const pads = [[tx + 70, 244, 44, 12], [tx - 50, 272, 40, 11], [tx + 22, 216, 40, 12], [tx - 10, 240, 30, 9], [tx + 100, 256, 26, 8], [tx + 40, 194, 26, 9]];
      for (const [cx, cy, rx, ry] of pads) {
        g.fillStyle = '#243a28';
        ellipse(g, cx, Y(cy) + 2, rx, ry);
        g.fillStyle = '#2e4a32';
        ellipse(g, cx, Y(cy), rx * 0.95, ry * 0.85);
        g.fillStyle = '#4a6a44';
        ellipse(g, cx - rx * 0.15, Y(cy) - ry * 0.4, rx * 0.65, ry * 0.4);
        for (let k = 0; k < rx / 3; k++) rect(g, '#5a7a4c', cx - rx * 0.7 + rnd() * rx * 1.2, Y(cy) - ry * 0.6 + rnd() * ry * 0.4, 2, 1);
      }
    }
    // 樱花树
    {
      const tx = CHERRY;
      g.fillStyle = '#3e2a26';
      poly(g, [tx - 7, Y(352), tx + 7, Y(352), tx + 4, Y(300), tx + 30, Y(250), tx + 24, Y(246), tx, Y(290), tx - 26, Y(254), tx - 30, Y(258), tx - 4, Y(300)]);
      const cols = ['#c87890', '#e8a0b0', '#f2c4cc', '#f8dce0'];
      for (let layerI = 0; layerI < 4; layerI++) {
        g.fillStyle = cols[layerI];
        const n = [26, 30, 22, 12][layerI];
        for (let k = 0; k < n; k++) {
          const a = rnd() * Math.PI * 2, r = rnd() * 64;
          const cx = tx + Math.cos(a) * r * 1.3, cy = Y(232) + Math.sin(a) * r * 0.55 - layerI * 3;
          const rr = [16, 13, 9, 5][layerI] * rnd.r(0.7, 1.2);
          ellipse(g, cx - layerI * 2, cy - layerI * 2, rr, rr * 0.75);
        }
      }
    }
    // 石灯笼
    for (const lx of LANTERNS) {
      rect(g, '#7a7468', lx - 10, Y(346), 20, 6);
      rect(g, '#8a8478', lx - 4, Y(318), 8, 28);
      rect(g, '#9a9488', lx - 4, Y(318), 2, 28);
      rect(g, '#7a7468', lx - 12, Y(314), 24, 4);
      rect(g, '#8a8478', lx - 9, Y(300), 18, 14);
      rect(g, '#f0c060', lx - 5, Y(303), 10, 8);
      g.fillStyle = '#6a6458';
      poly(g, [lx - 15, Y(300), lx + 15, Y(300), lx + 5, Y(290), lx - 5, Y(290)]);
      rect(g, '#6a6458', lx - 2, Y(286), 4, 4);
    }
    crisp(L);
    for (const lx of LANTERNS) {
      g.fillStyle = dpat(g, '#f0c060', null, 0.25);
      ellipse(g, lx, Y(307), 18, 12);
    }
    steps.push(layer(L, 1, y0));
  }

  // 石板地
  const gy = 350;
  {
    const h = VH - gy;
    const L = mk(W, h), g = L.g;
    brickFloor(g, W, 2, h, rnd, {
      h0: 7, grow: 1.13, lenK: 2.3, irregular: true,
      cols: ['#948a80', '#9e9489', '#8a8077', '#a2998d', '#90867c'],
      mortar: '#6a6258', lit: '#b8ab9c', dark: '#7c736a',
    });
    rect(g, '#5a564e', 0, 0, W, 2);
    g.fillStyle = dpat(g, '#4e4a44', null, 0.5);
    g.fillRect(0, 2, W, 4);
    for (let i = 0; i < 30; i++) {
      const y = rnd.r(8, h - 6), s = perspS(y + gy, gy, 550);
      g.fillStyle = dpat(g, '#6a7a50', null, 0.5);
      ellipse(g, rnd() * W, y, rnd.r(10, 30) * s, rnd.r(2, 5) * s);
    }
    for (let i = 0; i < 170; i++) {
      const y = rnd.r(6, h - 2), s = perspS(y + gy, gy, 550);
      rect(g, rnd.pick(['#e8a8b8', '#f2c4cc', '#d88aa0']), rnd() * W, y, Math.max(1, 2 * s), Math.max(1, 1.5 * s));
    }
    steps.push(layer(L, 1, gy));
  }

  // 落樱
  const petals = [];
  for (let i = 0; i < 22; i++) petals.push({ x: rnd.r(-200, 600), y0: rnd() * 420, sp: rnd.r(0.35, 0.7), sw: rnd.r(0.02, 0.05), ph: rnd() * 100, c: rnd.pick(['#f2b8c6', '#e890a8', '#f8d4dc']) });
  steps.push((ctx, camX, tick) => {
    for (const p of petals) {
      const t = (tick * p.sp + p.y0) % 420;
      const wx = CHERRY - 80 + p.x + t * 0.6 + Math.sin(tick * p.sw + p.ph) * 14;
      const x = Math.round(wx - camX), y = Math.round(150 + t);
      if (x < -4 || x > VW) continue;
      ctx.fillStyle = p.c;
      ctx.fillRect(x, y, 2, ((tick >> 3) + (p.ph | 0)) % 2 ? 2 : 1);
    }
  });

  return { width: W, zMin, zMax, music: 'stage', steps, front: [] };
}

// ===================================================================
// 8) Old Town Street — 旧城街道:黄昏高楼、唐楼、霓虹招牌、骑楼商铺、电车轨
// ===================================================================
function buildTown(rnd) {
  const W = 2400, zMin = 352, zMax = 530;
  const steps = [];

  {
    const f = 0.03, w = layerW(f, W), h = 300;
    const L = mk(w, h), g = L.g;
    g.drawImage(ditherGrad(w, h, [[0, '#121030'], [0.4, '#2a2250'], [0.65, '#583264'], [0.86, '#a44e68'], [1, '#de8868']], 10), 0, 0);
    for (let i = 0; i < 40; i++) rect(g, '#c8c0e0', rnd() * w, rnd.r(0, 170), 1, 1);
    for (let i = 0; i < 7; i++) {
      const cw = Math.round(rnd.r(90, 220)), ch = Math.round(rnd.r(6, 11));
      g.drawImage(streakCloud(rnd, cw, ch, '#c8687a', '#6a3a62'), Math.round(rnd.r(0, w - cw)), Math.round(rnd.r(150, 230)));
    }
    steps.push(layer(L, f, 0));
  }

  // 远处高楼(航空障碍灯闪烁)
  const AV = [];
  const farF = 0.12;
  {
    const f = farF, w = layerW(f, W), y0 = 128, h = 150;
    const L = mk(w, h), g = L.g;
    for (let x = -10; x < w; x += rnd.r(20, 50)) {
      const bw = rnd.r(26, 60), bh = rnd.r(50, 135);
      const c = rnd.pick(['#262444', '#2c2a4c', '#221f3c']);
      rect(g, c, x, h - bh, bw, bh);
      if (rnd.chance(0.4)) rect(g, c, x + bw * 0.2, h - bh - 10, bw * 0.6, 10);
      for (let yy = h - bh + 4; yy < h; yy += 6) {
        for (let xx = x + 3; xx < x + bw - 3; xx += 5) if (rnd.chance(0.16)) rect(g, rnd.chance(0.8) ? '#d8b870' : '#90a8d0', xx, yy, 2, 3);
      }
      if (bh > 110) {
        rect(g, '#3a3858', x + bw / 2, h - bh - 22, 1, 22);
        AV.push([x + bw / 2, y0 + h - bh - 23]);
      }
    }
    hazeBand(g, w, h - 40, 40, '#6a3a62', 4, 0.6);
    steps.push(layer(L, f, y0));
  }
  steps.push((ctx, camX, tick) => {
    if ((tick >> 5) % 2) return;
    ctx.fillStyle = '#ff4030';
    for (const [lx, y] of AV) {
      const x = Math.round(lx - camX * farF);
      if (x > -3 && x < VW) ctx.fillRect(x - 1, Math.round(y), 3, 2);
    }
  });

  // 中景唐楼
  {
    const f = 0.4, w = layerW(f, W), y0 = 150, h = 196;
    const L = mk(w, h), g = L.g;
    for (let x = -20; x < w;) {
      const bw = Math.round(rnd.r(90, 180)), top = Math.round(rnd.r(4, 40));
      const c = rnd.pick(['#5e5060', '#525264', '#6a5a52', '#56605e', '#625650']);
      rect(g, c, x, top, bw, h - top);
      rect(g, '#000000', x + bw - 2, top, 2, h - top);
      rect(g, '#7a6e74', x, top, bw, 2);
      if (rnd.chance(0.6)) {
        const tx = x + rnd.r(10, bw - 40);
        rect(g, '#3a3a48', tx, top - 14, 26, 14);
        rect(g, '#4a4a58', tx, top - 16, 26, 3);
        rect(g, '#3a3a48', tx + 4, top - 2, 2, 2);
      }
      if (rnd.chance(0.5)) rect(g, '#2a2a36', x + bw * 0.7, top - 24, 1, 24);
      for (let yy = top + 8; yy < h - 6; yy += 16) {
        for (let xx = x + 6; xx < x + bw - 12; xx += 14) {
          const r = rnd();
          const wc = r < 0.3 ? '#e8c070' : r < 0.36 ? '#6a8ac0' : r < 0.42 ? '#f0d890' : '#2a2a38';
          rect(g, wc, xx, yy, 8, 10);
          rect(g, '#3a3640', xx, yy + 10, 8, 1);
          if (rnd.chance(0.12)) {
            rect(g, '#9a9aa2', xx, yy + 11, 8, 4);
            rect(g, '#6a6a72', xx + 1, yy + 12, 3, 2);
          }
          if (rnd.chance(0.08)) {
            rect(g, '#7a7a80', xx + 8, yy + 2, 16, 1);
            for (let k = 0; k < 3; k++) rect(g, rnd.pick(['#d84040', '#e8e8e8', '#4070d0', '#e8c040']), xx + 9 + k * 5, yy + 3, 3, rnd.i(3, 6));
          }
        }
      }
      if (rnd.chance(0.55)) {
        const sx = x + rnd.r(4, bw - 18), sy = top + rnd.r(20, 70);
        const sc = rnd.pick(['#c83a3a', '#d8a030', '#3a8a5a', '#3a5ab0']);
        rect(g, sc, sx, sy, 14, 46);
        rect(g, '#1a1a1a', sx, sy, 14, 1);
        for (let k = 0; k < 4; k++) {
          rect(g, '#f0f0e0', sx + 3, sy + 4 + k * 10, 8, 2);
          rect(g, '#f0f0e0', sx + 3 + rnd.i(0, 6), sy + 6 + k * 10, 2, 4);
        }
      }
      x += bw + rnd.r(-4, 6);
    }
    hazeBand(g, w, h - 50, 50, '#3a2a40', 4, 0.5);
    steps.push(layer(L, f, y0));
  }

  // 街边骑楼商铺
  const NEON = [];
  const LAMPS = [];
  {
    const y0 = 150, h = 212;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - y0;
    let i = 0;
    for (let x = 0; x < W; i++) {
      const bw = Math.round(rnd.r(200, 280));
      const wall = rnd.pick(['#8a7a68', '#7a8478', '#94806a', '#7c7088', '#86786c', '#8e8a7a']);
      const ft = Y(rnd.r(194, 204));
      rect(g, wall, x, ft, bw, Y(262) - ft);
      rect(g, '#b0a898', x, ft - 4, bw, 4);
      rect(g, '#5a5048', x, ft, bw, 2);
      for (let xx = x + 4; xx < x + bw - 4; xx += 8) rect(g, '#9a9284', xx, ft - 8, 4, 4);
      rect(g, '#b0a898', x, ft - 9, bw, 2);
      g.fillStyle = dpat(g, '#000000', null, 0.25);
      g.fillRect(x, ft + 2, bw, 8);
      rect(g, '#2a2420', x + bw - 2, ft - 9, 2, Y(262) - ft + 9);
      // 二楼窗户与阳台
      const nw = Math.max(2, Math.round(bw / 80));
      for (let k = 0; k < nw; k++) {
        const wx = x + 16 + k * ((bw - 32) / nw), ww = (bw - 32) / nw - 18, wy = Y(210);
        rect(g, '#3a3438', wx, wy, ww, 28);
        rect(g, rnd.chance(0.5) ? '#e0b868' : '#2a2a34', wx + 3, wy + 3, ww - 6, 22);
        rect(g, '#3a3438', wx + ww / 2 - 1, wy, 2, 28);
        rect(g, '#2e2e34', wx - 4, wy + 16, ww + 8, 2);
        for (let xx = wx - 4; xx < wx + ww + 4; xx += 4) rect(g, '#2e2e34', xx, wy + 16, 1, 12);
        rect(g, '#2e2e34', wx - 4, wy + 27, ww + 8, 2);
      }
      // 横招牌(色块“字”,不可读)
      const sbc = rnd.pick([['#c83a2a', '#f0d060'], ['#1e3a7a', '#f0f0f0'], ['#2a6a3a', '#f0e8c0'], ['#e8d8b0', '#b02a2a'], ['#1a1a1a', '#e8c040']]);
      const sbw = Math.min(bw - 40, 150), sbx = x + (bw - sbw) / 2;
      rect(g, '#2a2420', sbx - 2, Y(241), sbw + 4, 18);
      rect(g, sbc[0], sbx, Y(243), sbw, 14);
      for (let k = 0; k < Math.floor((sbw - 8) / 14); k++) {
        const gx = sbx + 6 + k * 14;
        rect(g, sbc[1], gx, Y(245), 9, 2);
        rect(g, sbc[1], gx + rnd.i(1, 6), Y(247), 2, 7);
        rect(g, sbc[1], gx, Y(250), 9, 1);
        if (rnd.chance(0.5)) rect(g, sbc[1], gx + rnd.i(0, 4), Y(252), 5, 2);
      }
      // 骑楼柱
      rect(g, '#9a9080', x, Y(262), 14, Y(344) - Y(262));
      rect(g, '#b0a898', x, Y(262), 3, Y(344) - Y(262));
      rect(g, '#6a6258', x + 12, Y(262), 2, Y(344) - Y(262));
      // 铺面
      const sx = x + 14, sw = bw - 14;
      const type = i % 3 === 1 ? 1 : rnd.chance(0.3) ? 2 : 0;
      if (type === 1) {
        rect(g, '#7a7c84', sx, Y(272), sw, Y(344) - Y(272));
        for (let yy = Y(272); yy < Y(344); yy += 3) rect(g, '#6a6c74', sx, yy, sw, 1);
        rect(g, '#4a4c54', sx, Y(272), sw, 3);
        for (let k = 0; k < 3; k++) {
          g.fillStyle = rnd.pick(['#c84a8a', '#4ab0c8', '#e8c040', '#5ac850']);
          ellipse(g, sx + rnd.r(20, sw - 20), Y(rnd.r(296, 330)), rnd.r(10, 22), rnd.r(5, 9));
        }
      } else {
        g.drawImage(ditherGrad(sw, Y(344) - Y(272), ['#e8b868', '#c88a48', '#8a5a30'], 5), sx, Y(272));
        for (const yy of [Y(288), Y(306)]) {
          rect(g, '#4a3020', sx + 6, yy, sw - 12, 2);
          for (let xx = sx + 8; xx < sx + sw - 10; xx += rnd.r(4, 9)) rect(g, rnd.pick(['#d84040', '#40a060', '#e8e0c0', '#4060c0', '#e8a030']), xx, yy - rnd.i(3, 7), 3, rnd.i(3, 7));
        }
        if (type === 2) {
          for (let k = 0; k < 4; k++) {
            const hx = sx + 20 + k * 22;
            rect(g, '#3a2a1a', hx, Y(274), 1, 6);
            g.fillStyle = '#c86a2a';
            ellipse(g, hx, Y(286), 6, 8);
            g.fillStyle = '#e8963a';
            ellipse(g, hx - 2, Y(284), 2, 4);
          }
        }
        rect(g, '#5a3a24', sx + 4, Y(322), sw - 8, Y(344) - Y(322));
        rect(g, '#7a5a3a', sx + 4, Y(322), sw - 8, 2);
        for (let k = 0; k < 2; k++) {
          rect(g, '#2a2a2a', sx + sw * (0.3 + k * 0.4), Y(272), 1, 10);
          rect(g, '#fff0b0', sx + sw * (0.3 + k * 0.4) - 3, Y(282), 7, 3);
        }
      }
      // 遮阳篷
      const ac = rnd.pick([['#b83a32', '#e8e0d0'], ['#2a7a4a', '#e8e0d0'], ['#2a4a8a', '#e0d8c8'], ['#d89a30', '#f0e8d8']]);
      for (let xx = sx; xx < sx + sw; xx += 10) {
        g.fillStyle = ((xx - sx) / 10) % 2 ? ac[1] : ac[0];
        poly(g, [xx, Y(262), Math.min(xx + 10, sx + sw), Y(262), Math.min(xx + 10, sx + sw) + 2, Y(276), xx + 2, Y(276)]);
      }
      rect(g, '#00000040', sx, Y(276), sw, 1);
      g.fillStyle = dpat(g, '#000000', null, 0.25);
      g.fillRect(sx, Y(277), sw, 3);
      // 霓虹招牌(竖)
      if (rnd.chance(0.8)) {
        const nx = x + rnd.r(30, bw - 50), ny = Y(rnd.r(150, 168));
        const nc = rnd.pick(['#ff4a9a', '#40e0ff', '#ffd040', '#7aff6a', '#ff6a3a']);
        const dim = mixc(nc, '#1a1a22', 0.62);
        rect(g, '#2a2a2e', nx - 10, ny + 10, 10, 2);
        rect(g, '#2a2a2e', nx - 10, ny + 70, 10, 2);
        rect(g, '#1a1a22', nx, ny, 22, 84);
        rect(g, '#3a3a44', nx, ny, 22, 1);
        g.strokeStyle = dim;
        g.lineWidth = 2;
        g.strokeRect(nx + 2, ny + 2, 18, 80);
        for (let k = 0; k < 4; k++) rect(g, dim, nx + 6, ny + 8 + k * 19, 10, 2);
        NEON.push({ x: nx, y: ny + y0, c: nc, seed: rnd.i(0, 99) });
      }
      x += bw;
    }
    // 人行道 + 路缘
    rect(g, '#8a8680', 0, Y(344), W, Y(356) - Y(344));
    for (let x = 0; x < W; x += 24) rect(g, '#6e6a64', x, Y(344), 1, Y(355) - Y(344));
    rect(g, '#6e6a64', 0, Y(350), W, 1);
    g.fillStyle = dpat(g, '#000000', null, 0.25);
    g.fillRect(0, Y(344), W, 3);
    rect(g, '#b0aca2', 0, Y(355), W, 2);
    rect(g, '#5a5852', 0, Y(357), W, 4);
    // 街灯、电话亭、垃圾桶、消防栓
    for (let x = 200; x < W; x += 420) {
      rect(g, '#2a2a30', x, Y(196), 4, Y(356) - Y(196));
      rect(g, '#3a3a42', x + 1, Y(196), 1, Y(356) - Y(196));
      rect(g, '#2a2a30', x, Y(196), 26, 3);
      rect(g, '#2a2a30', x + 20, Y(196), 10, 6);
      rect(g, '#fff0c0', x + 21, Y(202), 8, 2);
      rect(g, '#2a2a30', x - 3, Y(350), 10, 6);
      LAMPS.push(x + 25);
    }
    {
      const px = 1290;
      rect(g, '#a83a2a', px, Y(292), 28, Y(354) - Y(292));
      rect(g, '#c84a3a', px, Y(292), 3, Y(354) - Y(292));
      rect(g, '#8ab0c0', px + 5, Y(302), 18, 34);
      g.fillStyle = dpat(g, '#c8e0e8', null, 0.25);
      g.fillRect(px + 5, Y(302), 18, 34);
      rect(g, '#f0e8d0', px + 4, Y(294), 20, 5);
    }
    for (const bx of [560, 1720]) {
      rect(g, '#3a5a3a', bx, Y(334), 14, 20);
      rect(g, '#4a6a4a', bx, Y(334), 3, 20);
      rect(g, '#2a3a2a', bx - 1, Y(332), 16, 3);
    }
    rect(g, '#c83a2a', 2050, Y(340), 8, 14);
    rect(g, '#e85a40', 2050, Y(340), 2, 14);
    rect(g, '#c83a2a', 2047, Y(345), 14, 3);
    steps.push(layer(L, 1, y0));
  }
  // 霓虹灯(亮/灭闪烁)
  const neonOn = NEON.map((n) => {
    const L = mk(30, 92), g = L.g;
    g.fillStyle = dpat(g, n.c, null, 0.25);
    g.fillRect(0, 0, 30, 92);
    rect(g, '#1a1a22', 4, 4, 22, 84);
    g.strokeStyle = n.c;
    g.lineWidth = 2;
    g.strokeRect(6, 6, 18, 80);
    for (let k = 0; k < 4; k++) {
      const yy = 12 + k * 19;
      rect(g, '#ffffff', 10, yy, 10, 2);
      rect(g, n.c, 10, yy + 3, 10, 2);
      rect(g, '#ffffff', 10 + (k * 3) % 8, yy + 6, 2, 8);
      rect(g, n.c, 18 - (k * 5) % 8, yy + 8, 2, 6);
    }
    return L.c;
  });
  steps.push((ctx, camX, tick) => {
    for (let i = 0; i < NEON.length; i++) {
      const n = NEON[i];
      const ph = ((tick >> 3) + n.seed) % 23;
      if (ph === 0 || ph === 2 || (n.seed % 3 === 0 && ph > 18)) continue;
      drawAt(ctx, neonOn[i], n.x - 4, n.y - 4, 1, camX);
    }
  });

  // 马路:沥青、电车轨、车道线、斑马线、井盖、霓虹倒影
  const gy = 356;
  {
    const h = VH - gy;
    const L = mk(W, h), g = L.g;
    const Y = (y) => y - gy;
    floorRows(g, W, Y(361), h, ['#4c4a52', '#504e56', '#48464e', '#4e4c54'], 3, 1.13, rnd);
    floorDashes(g, W, Y(361), h, 3600, ['#5c5a62', '#3e3c44', '#56545c'], rnd, 2, 9, 1.2);
    rect(g, '#3a3840', 0, Y(361), W, 2);
    for (const ry of [398, 418]) {
      rect(g, '#2e2c32', 0, Y(ry) + 1, W, 2);
      rect(g, '#9a9aa2', 0, Y(ry), W, 1);
      rect(g, '#6a6a72', 0, Y(ry) + 3, W, 1);
    }
    for (const ry of [452, 474]) {
      rect(g, '#2e2c32', 0, Y(ry) + 1, W, 2);
      rect(g, '#9a9aa2', 0, Y(ry), W, 1);
      rect(g, '#6a6a72', 0, Y(ry) + 3, W, 1);
    }
    g.fillStyle = dpat(g, '#c8c4b8', null, 0.75);
    for (let x = 0; x < W; x += 110) g.fillRect(x, Y(506), 60, 4);
    g.fillStyle = dpat(g, '#c8b058', null, 0.6);
    g.fillRect(0, Y(370), W, 2);
    g.fillRect(0, Y(374), W, 2);
    for (let yy = 382, k = 0; yy < 548; k++) {
      const hh = Math.round(4 + k * 1.2);
      g.fillStyle = dpat(g, '#d8d4c8', null, 0.8);
      g.fillRect(1520, Y(yy), 110, hh);
      yy += hh * 2.1;
    }
    for (const [mx, my] of [[420, 440], [980, 500], [1880, 430], [2260, 520]]) {
      const s = perspS(my, 356, 550);
      g.fillStyle = '#3a383e';
      ellipse(g, mx, Y(my), 26 * s, 7 * s);
      g.strokeStyle = '#5e5c64';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(mx, Y(my), 22 * s, 6 * s, 0, 0, Math.PI * 2);
      g.stroke();
      for (let k = -2; k <= 2; k++) rect(g, '#5e5c64', mx - 16 * s, Y(my) + k * 2 * s, 32 * s, 1);
    }
    for (let i = 0; i < 7; i++) {
      const px = rnd.r(100, W - 100), py = rnd.r(430, 535), s = perspS(py, 356, 550);
      g.fillStyle = '#3a3a48';
      ellipse(g, px, Y(py), rnd.r(30, 60) * s, rnd.r(5, 9) * s);
      for (let k = 0; k < 5; k++) {
        g.fillStyle = dpat(g, rnd.pick(['#c0508a', '#40a0b0', '#d0a040']), null, 0.5);
        g.fillRect(Math.round(px + rnd.r(-24, 24) * s), Math.round(Y(py) - 4 * s), Math.max(1, Math.round(3 * s)), Math.round(9 * s));
      }
    }
    for (const lx of LAMPS) {
      g.fillStyle = dpat(g, '#6e6a62', null, 0.25);
      ellipse(g, lx, Y(400), 74, 22);
      g.fillStyle = dpat(g, '#7a766a', null, 0.25);
      ellipse(g, lx, Y(398), 40, 12);
    }
    g.fillStyle = dpat(g, '#000000', null, 0.5);
    g.fillRect(0, Y(361), W, 4);
    steps.push(layer(L, 1, gy));
  }

  return { width: W, zMin, zMax, music: 'battle2', steps, front: [] };
}

// ===================================================================
// 工厂
// ===================================================================
const BUILDERS = {
  forest: buildForest,
  prison: buildPrison,
  wall: buildWall,
  isle: buildIsle,
  spire: buildSpire,
  arena: buildArena,
  temple: buildTemple,
  town: buildTown,
};
const SEEDS = { forest: 1101, prison: 2202, wall: 3303, isle: 4404, spire: 5505, arena: 6606, temple: 7707, town: 8808 };
const cache = new Map();

export function createBackground(id, opts = {}) {
  let bid = id;
  if (bid === 'random' || !BUILDERS[bid]) {
    const ids = BG_LIST.map((b) => b.id).filter((k) => BUILDERS[k]);
    bid = bid === 'random' ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
  }
  const seed = ((opts.seed ?? SEEDS[bid]) >>> 0) || 1;
  const key = bid + ':' + seed;
  let spec = cache.get(key);
  if (!spec) {
    spec = BUILDERS[bid](makeRng(seed));
    cache.set(key, spec);
  }
  const entry = BG_LIST.find((b) => b.id === bid);
  const steps = spec.steps, front = spec.front || [];
  const maxCam = Math.max(0, spec.width - VW);
  const run = (list, ctx, camX, tick) => {
    camX = clamp(+camX || 0, 0, maxCam);
    tick = +tick || 0;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    for (const s of list) {
      if (typeof s === 'function') s(ctx, camX, tick);
      else drawLayer(ctx, s, camX, tick);
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = sm;
  };
  return {
    id: bid,
    name: entry ? entry.name : bid,
    width: spec.width,
    zMin: spec.zMin,
    zMax: spec.zMax,
    music: spec.music,
    draw(ctx, camX, tick) { run(steps, ctx, camX, tick); },
    drawFront(ctx, camX, tick) { if (front.length) run(front, ctx, camX, tick); },
  };
}
