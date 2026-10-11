// stages.js — 对战场景背景(全程序化绘制,零依赖)
// 坐标约定:世界 x∈[0,1600],地面 y=0,向上为负;镜头 cam={x,y,zoom},世界点(cam.x,cam.y)位于屏幕(480,270)。
// 分层:天空/远景/中景(视差 p 模型)→ 地面(透视扇形空间 + 剪切变换)→ 地面远沿物件(edge 模型)→ 后处理动画。
// 静态层在 createStage 时预渲染到离屏 canvas,每帧只做 drawImage 与少量动画。

export const STAGE_W = 1600;

export const STAGES = [
  { id: 'leaf_village', name: '叶隐村', sub: '晴日', bgm: 'stage_leaf' },
  { id: 'valley_end', name: '终末之谷', sub: '黄昏', bgm: 'stage_valley' },
  { id: 'death_forest', name: '幽森', sub: '巨树林', bgm: 'stage_forest' },
  { id: 'soul_court', name: '白壁庭', sub: '正午', bgm: 'stage_soul' },
  { id: 'hueco_desert', name: '虚白沙海', sub: '永夜', bgm: 'stage_desert' },
  { id: 'karakura_town', name: '黄昏街', sub: '都市屋顶', bgm: 'stage_town' },
  { id: 'exam_arena', name: '试炼场', sub: '石砌竞技场', bgm: 'stage_arena' },
  { id: 'execution_hill', name: '双刑之丘', sub: '决战', bgm: 'boss' },
];

// ---------- 常量 ----------
const REF_X = 800, REF_Y = -200;          // 视差层的参考镜头位置
const FAN = 0.0015;                        // 地面透视系数:深度行 y 处横向缩放 1+FAN*y
const Z0 = 0.85, Z1 = 1.3, CY0 = -430, CY1 = -120;
const FLOOR_X0 = -300, FLOOR_X1 = 1900, FLOOR_Y1 = 236;
const TAU = Math.PI * 2;

// ---------- 基础工具 ----------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(R) {
  const n = 512, v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = R();
  const f1 = (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    const a = v[((i % n) + n) % n], b = v[(((i + 1) % n) + n) % n];
    return a + (b - a) * u;
  };
  f1.fbm = (x, oct = 4) => {
    let s = 0, a = 0.5, fr = 1, tot = 0;
    for (let o = 0; o < oct; o++) { s += a * f1(x * fr + o * 31.7); tot += a; a *= 0.5; fr *= 2.03; }
    return s / tot;
  };
  return f1;
}
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (v, a, span) => a + ((((v - a) % span) + span) % span);
function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return '#' + [0, 1, 2].map(i => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
}
function rgba(h, a) { const A = rgb(h); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) gr.addColorStop(clamp(o, 0, 1), c);
  return gr;
}
// 按绝对 y 给渐变色标
function ygrad(g, y0, y1, stops) {
  return vgrad(g, y0, y1, stops.map(([y, c]) => [(y - y0) / (y1 - y0), c]));
}
const fanF = (y) => 1 + FAN * y;
const fan = (X, y) => 800 + (X - 800) * fanF(y);

// ---------- 覆盖范围计算 ----------
function zoomSamples() { const a = []; for (let z = Z0; z <= Z1 + 1e-6; z += 0.05) a.push(z); a.push(Z1); return a; }
const _rc = new Map();
function parRange(p) {
  const key = 'p' + p;
  if (_rc.has(key)) return _rc.get(key);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const z of zoomSamples()) for (const cx of [480 / z, 1600 - 480 / z]) for (const cy of [CY0, CY1]) {
    const s = 1 + (z - 1) * p;
    for (const sx of [0, 960]) { const lx = REF_X + (cx - REF_X) * p + (sx - 480) / s; x0 = Math.min(x0, lx); x1 = Math.max(x1, lx); }
    for (const sy of [0, 540]) { const ly = REF_Y + (cy - REF_Y) * p + (sy - 270) / s; y0 = Math.min(y0, ly); y1 = Math.max(y1, ly); }
  }
  const r = { x0: Math.floor(x0 - 8), x1: Math.ceil(x1 + 8), y0: Math.floor(y0 - 8), y1: Math.ceil(y1 + 8) };
  _rc.set(key, r);
  return r;
}
function edgeRange(yd) {
  const f = fanF(yd);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const z of zoomSamples()) for (const cx of [480 / z, 1600 - 480 / z]) for (const cy of [CY0, CY1]) {
    for (const sx of [0, 960]) { const X = cx + (sx - 480) / (z * f); x0 = Math.min(x0, X); x1 = Math.max(x1, X); }
    for (const sy of [0, 540]) { const h = (sy - 270 - z * (yd - cy)) / (z * f); y0 = Math.min(y0, h); y1 = Math.max(y1, h); }
  }
  return { x0: Math.floor(x0 - 8), x1: Math.ceil(x1 + 8), y0: Math.floor(y0 - 8), y1: Math.ceil(y1 + 8) };
}

// ---------- 镜头变换 ----------
function parT(ctx, cam, p) {
  const s = 1 + (cam.zoom - 1) * p;
  ctx.transform(s, 0, 0, s, 480 - (REF_X + (cam.x - REF_X) * p) * s, 270 - (REF_Y + (cam.y - REF_Y) * p) * s);
  return s;
}
function edgeT(ctx, cam, yd) {
  const k = cam.zoom * fanF(yd);
  ctx.transform(k, 0, 0, k, 480 - cam.x * k, 270 + cam.zoom * (yd - cam.y));
}
function floorT(ctx, cam) {
  const z = cam.zoom;
  ctx.transform(z, 0, z * FAN * (800 - cam.x), z, 480 - cam.x * z, 270 - cam.y * z);
}
// 世界点 → 屏幕
const wsx = (cam, wx) => 480 + (wx - cam.x) * cam.zoom;
const wsy = (cam, wy) => 270 + (wy - cam.y) * cam.zoom;
// 视差层点 → 屏幕
function psx(cam, p, lx) { const s = 1 + (cam.zoom - 1) * p; return 480 + (lx - REF_X - (cam.x - REF_X) * p) * s; }
function psy(cam, p, ly) { const s = 1 + (cam.zoom - 1) * p; return 270 + (ly - REF_Y - (cam.y - REF_Y) * p) * s; }

// ---------- 层构建 ----------
function buildPar(spec) {
  const rg = spec.edge != null ? edgeRange(spec.edge) : parRange(spec.p);
  const x0 = rg.x0, x1 = rg.x1;
  const y0 = spec.y0 != null ? Math.max(spec.y0, rg.y0) : rg.y0;
  const y1 = spec.y1 != null ? Math.min(spec.y1, rg.y1) : rg.y1;
  const res = spec.res || 2;
  const cv = mkCanvas((x1 - x0) * res, (y1 - y0) * res);
  const g = cv.getContext('2d');
  g.scale(res, res); g.translate(-x0, -y0);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const L = { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
  spec.draw(g, L);
  if (spec.below) {
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = spec.below; g.fillRect(x0, y1 - 4, x1 - x0, 4);
    g.globalCompositeOperation = 'source-over';
  }
  return { type: spec.edge != null ? 'edge' : 'par', p: spec.p, yd: spec.edge, cv, ...L, below: spec.below, belowTo: rg.y1 + 20, anim: spec.anim };
}
function buildFloor(spec) {
  const y0 = spec.top, y1 = FLOOR_Y1, x0 = FLOOR_X0, x1 = FLOOR_X1, res = spec.res || 2;
  const cv = mkCanvas((x1 - x0) * res, (y1 - y0) * res);
  const g = cv.getContext('2d');
  g.scale(res, res); g.translate(-x0, -y0);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const F = { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
  spec.draw(g, F);
  // 远沿柔化,与后方中景衔接
  const fade = spec.fade ?? 10;
  if (fade > 0) {
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = vgrad(g, y0, y0 + fade, [[0, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x0, y0, x1 - x0, fade);
    g.globalCompositeOperation = 'source-over';
  }
  return { type: 'floor', cv, ...F, anim: spec.anim };
}

function drawItem(ctx, cam, t, L) {
  if (L.type === 'fn') { L.fn(ctx, cam, t); return; }
  ctx.save();
  if (L.type === 'par') {
    parT(ctx, cam, L.p);
    ctx.drawImage(L.cv, L.x0, L.y0, L.w, L.h);
    if (L.below) { ctx.fillStyle = L.below; ctx.fillRect(L.x0, L.y1 - 1, L.w, L.belowTo - L.y1 + 1); }
  } else if (L.type === 'edge') {
    edgeT(ctx, cam, L.yd);
    ctx.drawImage(L.cv, L.x0, L.y0, L.w, L.h);
  } else {
    floorT(ctx, cam);
    ctx.drawImage(L.cv, L.x0, L.y0, L.w, L.h);
  }
  if (L.anim) L.anim(ctx, t, cam);
  ctx.restore();
}

// ---------- 通用美术元件 ----------
function ridgePath(g, x0, x1, step, yFn, bottom) {
  g.beginPath(); g.moveTo(x0 - step, bottom);
  for (let x = x0 - step; x <= x1 + step; x += step) g.lineTo(x, yFn(x));
  g.lineTo(x1 + step, bottom); g.closePath();
}
// 动漫积云:扁平底 + 两级明暗
function cumulus(g, R, cx, by, w, h, c) {
  const puffs = [], n = 4 + Math.floor(w / 45);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, hf = Math.pow(Math.sin(Math.PI * u), 0.8);
    const r = h * (0.28 + 0.42 * hf) * (0.8 + R() * 0.4);
    puffs.push([cx - w / 2 + w * u + (R() - 0.5) * w / n * 0.5, by - r * 0.55 - h * 0.35 * hf * R(), r]);
  }
  const top = Math.floor(n / 2);
  for (let i = 0; i < 2; i++) {
    const r = h * (0.3 + R() * 0.15);
    puffs.push([cx + (R() - 0.5) * w * 0.35, by - h * 0.55 - r * 0.3, r]);
  }
  g.save();
  g.beginPath(); g.rect(cx - w, by - h * 3, w * 2, h * 3); g.clip();
  g.fillStyle = c.sh;
  g.beginPath(); for (const [x, y, r] of puffs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); } g.fill();
  g.fillStyle = c.body;
  g.beginPath(); for (const [x, y, r] of puffs) { const rr = r * 0.9; g.moveTo(x - r * 0.08 + rr, y - r * 0.2); g.arc(x - r * 0.08, y - r * 0.2, rr, 0, TAU); } g.fill();
  if (c.hi) {
    g.fillStyle = c.hi;
    g.beginPath(); for (const [x, y, r] of puffs) { const rr = r * 0.55; g.moveTo(x - r * 0.25 + rr, y - r * 0.42); g.arc(x - r * 0.25, y - r * 0.42, rr, 0, TAU); } g.fill();
  }
  g.restore();
  void top;
}
// 层状云(长条,多段错落、两端收尖)
function stratus(g, R, cx, cy, w, h, cTop, cBot) {
  g.save();
  g.fillStyle = vgrad(g, cy - h, cy + h * 0.5, [[0, cTop], [1, cBot]]);
  g.beginPath();
  const n = 4 + Math.floor(w / 60);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, k = Math.sin(Math.PI * u);
    const x = cx - w / 2 + w * u + (R() - 0.5) * 20;
    const ww = w / n * (0.8 + R() * 0.9), hh = h * (0.25 + 0.75 * k) * (0.6 + R() * 0.5);
    const yy = cy - hh * 0.5 + (R() - 0.5) * h * 0.5 * k;
    g.moveTo(x + ww, yy); g.ellipse(x, yy, ww, hh * 0.5, 0, 0, TAU);
  }
  g.fill();
  g.restore();
}
function cloudSprite(R, w, h, c) {
  const res = 1.5, cv = mkCanvas(w * res, h * res), g = cv.getContext('2d');
  g.scale(res, res);
  cumulus(g, R, w / 2, h - 2, w * 0.8, h * 0.62, c);
  return { cv, w, h };
}
function glowSprite(col, size = 128) {
  const cv = mkCanvas(size, size), g = cv.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.35, rgba(col, 0.45)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return cv;
}
// 光柱贴图:顶窄底宽、纵向渐隐、横向柔边
function beamSprite(col) {
  const W = 64, H = 256, cv = mkCanvas(W, H), g = cv.getContext('2d');
  for (let y = 0; y < H; y++) {
    const v = y / H, half = W * (0.22 + 0.28 * v), a = Math.pow(1 - v, 1.3) * Math.min(1, v * 6 + 0.2);
    const gr = g.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
    gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(W / 2 - half, y, half * 2, 1);
  }
  return cv;
}
function wire(g, x0, y0, x1, y1, sag) {
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); g.stroke();
}
// 透视地面:矩形 (X0..X1, y0..y1) 在扇形空间的四边形路径
function fanQuad(g, X0, X1, y0, y1) {
  g.moveTo(fan(X0, y0), y0); g.lineTo(fan(X1, y0), y0); g.lineTo(fan(X1, y1), y1); g.lineTo(fan(X0, y1), y1); g.closePath();
}
// 越近越宽的行边界
function rowsBetween(y0, y1, n, grow = 1.25) {
  const out = [y0]; let tot = 0, w = 1;
  for (let i = 0; i < n; i++) { tot += w; w *= grow; }
  let acc = 0; w = 1;
  for (let i = 0; i < n; i++) { acc += w; w *= grow; out.push(y0 + (y1 - y0) * acc / tot); }
  return out;
}
// 地面通用:铺砖
function tileFloor(g, R, o) {
  const rows = o.rows;
  for (let r = 0; r < rows.length - 1; r++) {
    const ya = rows[r], yb = rows[r + 1];
    let X = -700 + (o.stagger ? (r % 2) * o.tw * 0.5 : 0) + (o.jitter ? R() * o.tw : 0);
    while (X < 2300) {
      const w = o.tw * (o.wvar ? 0.7 + R() * o.wvar : 1);
      if (!o.skip || R() > o.skip) {
        g.beginPath(); fanQuad(g, X + o.gap, X + w - o.gap, ya + o.gap * 0.5, yb - o.gap * 0.5);
        g.fillStyle = o.color(R, r, X); g.fill();
        if (o.hiTop) { g.strokeStyle = o.hiTop; g.lineWidth = 0.8; g.beginPath(); g.moveTo(fan(X + o.gap + 1, ya + o.gap * 0.5 + 0.6), ya + o.gap * 0.5 + 0.6); g.lineTo(fan(X + w - o.gap - 1, ya + o.gap * 0.5 + 0.6), ya + o.gap * 0.5 + 0.6); g.stroke(); }
        if (o.after) o.after(g, R, X, w, ya, yb);
      }
      X += w;
    }
  }
}
function pebbles(g, R, n, y0, y1, cols, rmax = 4) {
  for (let i = 0; i < n; i++) {
    const y = y0 + Math.pow(R(), 0.8) * (y1 - y0), X = -500 + R() * 2600, f = fanF(y), r = (1 + R() * rmax) * f;
    const x = fan(X, y);
    g.fillStyle = cols[0]; g.beginPath(); g.ellipse(x, y + r * 0.25, r, r * 0.5, 0, 0, TAU); g.fill();
    g.fillStyle = cols[1]; g.beginPath(); g.ellipse(x - r * 0.15, y, r * 0.8, r * 0.38, 0, 0, TAU); g.fill();
  }
}
// 地面景深压暗(近处略暗,远处略亮)
function floorShade(g, F, near = 0.18, col = '#000000') {
  g.fillStyle = vgrad(g, F.y0, F.y1, [[0, rgba(col, 0)], [0.35, rgba(col, 0)], [1, rgba(col, near)]]);
  g.fillRect(F.x0, F.y0, F.w, F.h);
}
// 用 source-atop 叠一层雾色,制造空气透视
function hazeOver(g, L, cTop, aTop, cBot, aBot, yA = L.y0, yB = L.y1) {
  g.save(); g.globalCompositeOperation = 'source-atop';
  g.fillStyle = vgrad(g, yA, yB, [[0, rgba(cTop, aTop)], [1, rgba(cBot, aBot)]]);
  g.fillRect(L.x0, L.y0, L.w, L.h);
  g.restore();
}
function treeCrowns(g, R, x0, x1, base, hmin, hmax, c, step = 26, depth = 30) {
  // 一排圆形树冠:暗底 + 亮顶
  const pts = [];
  for (let x = x0 - 20; x < x1 + 20; x += step * (0.6 + R() * 0.7)) pts.push([x, base - hmin - R() * (hmax - hmin), step * (0.7 + R() * 0.6)]);
  g.fillStyle = c.sh; g.beginPath();
  for (const [x, y, r] of pts) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
  g.rect(x0 - 40, base - hmin * 0.6, x1 - x0 + 80, hmin * 0.6 + depth); g.fill();
  g.fillStyle = c.body; g.beginPath();
  for (const [x, y, r] of pts) { g.moveTo(x - 3 + r * 0.82, y - 4); g.arc(x - 3, y - 4, r * 0.82, 0, TAU); } g.fill();
  if (c.hi) {
    g.fillStyle = c.hi; g.beginPath();
    for (const [x, y, r] of pts) { g.moveTo(x - r * 0.3 + r * 0.4, y - r * 0.45); g.arc(x - r * 0.3, y - r * 0.45, r * 0.4, 0, TAU); } g.fill();
  }
}

// 日式坡顶
function hipRoof(g, x, y, w, h, c) {
  const ov = Math.min(14, w * 0.12), t0 = x + w * 0.2, t1 = x + w * 0.8;
  g.fillStyle = c.roof; g.strokeStyle = c.line; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x - ov, y + 2);
  g.quadraticCurveTo(x + w * 0.02, y - h * 0.15, t0, y - h); g.lineTo(t1, y - h);
  g.quadraticCurveTo(x + w * 0.98, y - h * 0.15, x + w + ov, y + 2); g.closePath(); g.fill(); g.stroke();
  // 瓦垄
  g.strokeStyle = c.roofSh; g.lineWidth = 0.8; g.beginPath();
  const n = Math.max(3, Math.floor(w / 7));
  for (let i = 1; i < n; i++) { const u = i / n; g.moveTo(t0 + (t1 - t0) * u, y - h + 1); g.lineTo(x - ov + (w + ov * 2) * u, y + 1); }
  g.stroke();
  g.fillStyle = c.roofSh; g.fillRect(x - ov, y - 1, w + ov * 2, 3);
  g.fillStyle = c.line; g.fillRect(t0 - 3, y - h - 2.5, t1 - t0 + 6, 3);
}

// ====================================================================
// 场景 1:叶隐村 · 晴日
// ====================================================================
function stLeaf(R) {
  const N = makeNoise(R);
  const sky = '#cfe6f5';
  const clouds = [0, 1, 2, 3].map(() => cloudSprite(R, 180 + R() * 120, 90 + R() * 40, { sh: '#bcd5ea', body: '#f2f8fd', hi: '#ffffff' }));
  const items = [];
  // 天空
  items.push({
    p: 0.03, res: 1, draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-480, '#2c79cf'], [-340, '#4a98df'], [-210, '#86c3ee'], [-120, '#c6e5f7'], [80, '#e9f6fc']]);
      g.fillRect(L.x0, L.y0, L.w, L.h);
      // 高空薄云
      g.globalAlpha = 0.5;
      for (let i = 0; i < 6; i++) stratus(g, R, L.x0 + R() * L.w, -440 + R() * 120, 120 + R() * 140, 14, '#ffffff', '#d7ebf8');
      g.globalAlpha = 1;
      // 地平线积云墙
      for (let i = 0; i < 8; i++) {
        const x = L.x0 + (i + 0.2 + R() * 0.6) * L.w / 8;
        cumulus(g, R, x, -130 - R() * 30, 150 + R() * 140, 80 + R() * 70, { sh: '#b5d0e6', body: '#eef6fc', hi: '#ffffff' });
      }
    },
    anim(ctx, t) {
      const L = parRange(0.03);
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i], span = L.x1 - L.x0 + 400;
        const x = wrap(L.x0 + i * span / clouds.length + t * (4 + i * 1.5), L.x0 - 300, span);
        ctx.drawImage(c.cv, x, -430 + i * 55 + (i % 2) * 20, c.w, c.h);
      }
    },
  });
  // 远山
  items.push({
    p: 0.12, res: 1.5, y0: -330, y1: -90, below: '#9ec3d4', draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-300, '#7fabc6'], [-120, '#a3c8d8']]);
      ridgePath(g, L.x0, L.x1, 6, x => -170 - N.fbm(x * 0.004 + 3) * 140 + 40, L.y1); g.fill();
      g.fillStyle = '#93bccf';
      ridgePath(g, L.x0, L.x1, 6, x => -140 - N.fbm(x * 0.007 + 9) * 70 + 20, L.y1); g.fill();
    },
  });
  // 巨岩山崖 + 叶纹
  items.push({
    p: 0.22, res: 1.5, y0: -480, y1: -90, below: '#86ad73', draw(g, L) {
      const top = (x) => -420 + N.fbm(x * 0.01 + 50) * 30 - 10;
      const lx = 400, rx = 1200;
      // 两侧森林丘陵
      g.fillStyle = '#7fac6c';
      ridgePath(g, L.x0, L.x1, 5, x => -160 - Math.max(0, 1 - Math.abs(x - 800) / 700) * 0 - N.fbm(x * 0.012 + 20) * 60, L.y1); g.fill();
      // 岩体
      g.beginPath(); g.moveTo(lx - 30, -100);
      for (let y = -100; y >= -400; y -= 10) g.lineTo(lx + 10 + N(y * 0.05 + 1) * 26 + (y < -330 ? (y + 330) * -0.3 : 0), y);
      for (let x = lx + 40; x <= rx - 40; x += 8) g.lineTo(x, top(x));
      for (let y = -400; y <= -100; y += 10) g.lineTo(rx - 10 - N(y * 0.05 + 7) * 26 - (y < -330 ? (y + 330) * -0.3 : 0), y);
      g.lineTo(rx + 30, -100); g.closePath();
      g.save(); g.clip();
      g.fillStyle = ygrad(g, -440, -100, [[-440, '#dcc29b'], [-200, '#cbab83'], [-100, '#b8986f']]);
      g.fillRect(lx - 60, -460, rx - lx + 120, 380);
      // 竖向阴影面
      for (let i = 0; i < 26; i++) {
        const x = lx + R() * (rx - lx), w = 10 + R() * 40;
        g.fillStyle = rgba('#94755a', 0.18 + R() * 0.2);
        g.beginPath(); g.moveTo(x, -440); g.lineTo(x + w, -440); g.lineTo(x + w * 0.6 + R() * 20, -90); g.lineTo(x - 10 + R() * 10, -90); g.fill();
      }
      // 右侧整体阴影
      g.fillStyle = vgrad(g, 0, 0, [[0, 'rgba(0,0,0,0)']]);
      const sh = g.createLinearGradient(lx, 0, rx, 0); sh.addColorStop(0, 'rgba(120,90,70,0)'); sh.addColorStop(0.65, 'rgba(120,90,70,0)'); sh.addColorStop(1, 'rgba(120,90,70,0.35)');
      g.fillStyle = sh; g.fillRect(lx - 60, -460, rx - lx + 120, 380);
      // 岩层
      g.strokeStyle = rgba('#8f6f52', 0.45); g.lineWidth = 1.2;
      for (let k = 0; k < 9; k++) {
        const y = -390 + k * 32 + R() * 10; g.beginPath();
        for (let x = lx - 40; x < rx + 40; x += 12) g.lineTo(x, y + N(x * 0.02 + k * 13) * 8);
        g.stroke();
      }
      // 裂缝
      g.strokeStyle = rgba('#6f5440', 0.55); g.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        let x = lx + R() * (rx - lx), y = -420 + R() * 200; g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < 6; j++) { x += (R() - 0.5) * 12; y += 10 + R() * 18; g.lineTo(x, y); }
        g.stroke();
      }
      g.restore();
      // 岩顶植被
      treeCrowns(g, R, lx + 40, rx - 40, -400, 0, 14, { sh: '#467b3c', body: '#5f9a4c', hi: '#7fb85d' }, 16, 6);
      // 刻纹:原创叶纹(叶片 + 漩涡柄)
      leafEmblem(g, 800, -282, 66);
      // 山脚树林
      treeCrowns(g, R, L.x0, L.x1, -105, 10, 40, { sh: '#4f7f45', body: '#6a9d55', hi: '#86b866' }, 22, 60);
      hazeOver(g, L, sky, 0.28, sky, 0.38);
    },
  });
  // 近处树林带
  items.push({
    p: 0.36, res: 2, y0: -220, y1: -60, below: '#5a8b4c', draw(g, L) {
      treeCrowns(g, R, L.x0, L.x1, -110, 20, 70, { sh: '#4a7c42', body: '#5f9550', hi: '#7db362' }, 28, 60);
      hazeOver(g, L, sky, 0.2, sky, 0.1);
    },
  });
  const pal = {
    wall: ['#f1e5cb', '#f3d9b4', '#e8cba3', '#e6e9dc', '#f6ecd9', '#ead8bf'],
    roof: ['#4f6c86', '#5d8090', '#b05a3e', '#8d6b4b', '#3f5c72', '#6f8b6a'],
  };
  function house(g, x, base, w, h, hz, hzc) {
    const H = (c) => mix(c, hzc, hz);
    const wall = H(pal.wall[Math.floor(R() * pal.wall.length)]);
    const roofC = H(pal.roof[Math.floor(R() * pal.roof.length)]);
    const line = H('#4a3e3a'), wood = H('#8b5d3c');
    const c = { roof: roofC, roofSh: mix(roofC, '#1a2028', 0.3), line };
    g.fillStyle = wall; g.strokeStyle = line; g.lineWidth = 1.1;
    g.fillRect(x, base - h, w, h); g.strokeRect(x, base - h, w, h);
    g.fillStyle = mix(wall, '#6a5a50', 0.18); g.fillRect(x + w * 0.8, base - h, w * 0.2, h);
    // 楼层分隔与窗
    const floors = Math.max(1, Math.round(h / 42));
    for (let f = 0; f < floors; f++) {
      const fy = base - h + f * (h / floors);
      if (f > 0) { g.fillStyle = wood; g.fillRect(x, fy - 1.5, w, 3); }
      const nw = Math.max(1, Math.floor(w / 34));
      for (let i = 0; i < nw; i++) {
        if (R() < 0.18) continue;
        const ww = 12 + R() * 6, wx = x + (i + 0.5) * w / nw - ww / 2, wy = fy + h / floors * 0.32;
        g.fillStyle = H('#3d4a5a'); g.fillRect(wx, wy, ww, 13);
        g.fillStyle = H('#7fa6c4'); g.fillRect(wx + 1.5, wy + 1.5, ww - 3, 4);
        g.strokeStyle = wood; g.lineWidth = 1; g.strokeRect(wx, wy, ww, 13);
      }
    }
    // 雨棚 / 幡
    if (R() < 0.35) {
      g.fillStyle = H(['#c4503a', '#3f7fa8', '#d99a3a'][Math.floor(R() * 3)]);
      g.beginPath(); g.moveTo(x + 4, base - 34); g.lineTo(x + w - 4, base - 34); g.lineTo(x + w + 2, base - 24); g.lineTo(x - 2, base - 24); g.fill();
    }
    if (R() < 0.3) {
      const bx = x + w * (0.15 + R() * 0.6);
      g.fillStyle = H('#f6f0e2'); g.fillRect(bx, base - h + 8, 9, 34);
      g.strokeStyle = H('#b8483a'); g.lineWidth = 1.6; g.beginPath(); g.arc(bx + 4.5, base - h + 20, 3, 0, TAU); g.stroke();
    }
    const kind = R();
    if (kind < 0.68) hipRoof(g, x, base - h, w, 16 + w * 0.12, c);
    else {
      g.fillStyle = c.roofSh; g.fillRect(x - 3, base - h - 5, w + 6, 6);
      g.strokeStyle = line; g.lineWidth = 1; g.strokeRect(x - 3, base - h - 5, w + 6, 6);
      // 屋顶水箱
      const tx = x + w * (0.2 + R() * 0.4), tw = 18 + R() * 10, th = 16 + R() * 8;
      g.fillStyle = H('#d9d2c2'); g.fillRect(tx, base - h - 5 - th, tw, th);
      g.fillStyle = H('#b4ab98'); g.fillRect(tx + tw * 0.7, base - h - 5 - th, tw * 0.3, th);
      g.beginPath(); g.ellipse(tx + tw / 2, base - h - 5 - th, tw / 2, 3, 0, 0, TAU); g.fillStyle = H('#efe9dc'); g.fill();
      g.strokeStyle = line; g.lineWidth = 0.9; g.strokeRect(tx, base - h - 5 - th, tw, th);
    }
  }
  // 后排村落
  items.push({
    p: 0.52, res: 2, y0: -330, y1: 20, below: '#c4ad86', draw(g, L) {
      g.fillStyle = ygrad(g, -120, 20, [[-120, '#bea984'], [20, '#c8b18a']]); g.fillRect(L.x0, -110, L.w, 140);
      // 圆楼(远处地标)
      const cx = 1010, base = -108;
      g.fillStyle = mix('#efe2c6', sky, 0.3); g.fillRect(cx - 55, base - 120, 110, 120);
      g.fillStyle = mix('#c4583e', sky, 0.3); g.fillRect(cx - 55, base - 92, 110, 10); g.fillRect(cx - 55, base - 50, 110, 8);
      g.fillStyle = mix('#cdbfa3', sky, 0.3); g.fillRect(cx + 25, base - 120, 30, 120);
      g.fillStyle = mix('#b8553c', sky, 0.3); g.beginPath(); g.moveTo(cx - 70, base - 118); g.quadraticCurveTo(cx, base - 160, cx + 70, base - 118); g.closePath(); g.fill();
      g.fillStyle = mix('#3d4a5a', sky, 0.3); for (let i = 0; i < 5; i++) g.fillRect(cx - 45 + i * 20, base - 74, 10, 14);
      let x = L.x0 - 20;
      while (x < L.x1) {
        const w = 60 + R() * 70, h = 50 + R() * 70;
        if (Math.abs(x + w / 2 - cx) > 90 || h < 70) house(g, x, -104 - R() * 6, w, h, 0.32, sky);
        x += w + R() * 12 - 4;
      }
      treeCrowns(g, R, L.x0, L.x1, -96, 0, 12, { sh: mix('#4f8545', sky, 0.3), body: mix('#66a052', sky, 0.3) }, 16);
    },
  });
  // 前排村落
  items.push({
    p: 0.72, res: 2, y0: -330, y1: 40, below: '#c8ab80', draw(g, L) {
      g.fillStyle = ygrad(g, -100, 40, [[-100, '#c6a87c'], [40, '#cdb086']]); g.fillRect(L.x0, -100, L.w, 140);
      let x = L.x0 - 30;
      const tops = [];
      while (x < L.x1) {
        const w = 80 + R() * 80, h = 70 + R() * 90;
        if (R() < 0.18) { treeCrowns(g, R, x, x + w * 0.7, -84, 30, 80, { sh: '#467b3c', body: '#5c9449', hi: '#7cb35c' }, 22, 18); x += w * 0.7; continue; }
        house(g, x, -82, w, h, 0.08, sky);
        tops.push([x, x + w, -82 - h]);
        x += w + R() * 18;
      }
      // 晾衣绳与布
      g.strokeStyle = '#5a4a40'; g.lineWidth = 0.8;
      for (let i = 0; i < tops.length - 1; i++) {
        if (R() < 0.5) continue;
        const a = tops[i], b = tops[i + 1], y = Math.max(a[2], b[2]) + 30 + R() * 30;
        if (y > -100) continue;
        wire(g, a[1] - 4, y, b[0] + 4, y, 6);
        for (let k = 0; k < 4; k++) {
          const u = (k + 0.7) / 4.4, cx = a[1] + (b[0] - a[1]) * u, cy = y + 4 * Math.sin(Math.PI * u) * 2;
          g.fillStyle = ['#e9e4d6', '#c4503a', '#5a86b0', '#e8c25a'][Math.floor(R() * 4)];
          g.fillRect(cx - 5, cy, 10, 10 + R() * 8);
        }
      }
      // 地面石砌矮墙
      g.fillStyle = '#a99a84'; g.fillRect(L.x0, -84, L.w, 10);
      g.strokeStyle = '#7d6f5e'; g.lineWidth = 0.8;
      for (let xx = L.x0; xx < L.x1; xx += 22) { g.beginPath(); g.moveTo(xx, -84); g.lineTo(xx, -74); g.stroke(); }
      g.beginPath(); g.moveTo(L.x0, -79); g.lineTo(L.x1, -79); g.stroke();
    },
  });
  // 地面:土路 + 石板带
  items.push({
    floor: {
      top: -66, draw(g, F) {
        g.fillStyle = ygrad(g, F.y0, F.y1, [[-66, '#d2b487'], [0, '#ccab7c'], [236, '#b99467']]);
        g.fillRect(F.x0, F.y0, F.w, F.h);
        // 土色斑驳
        for (let i = 0; i < 260; i++) {
          const y = F.y0 + R() * F.h, X = -500 + R() * 2600, f = fanF(y), r = (10 + R() * 40) * f;
          g.fillStyle = rgba(R() < 0.5 ? '#b08a5c' : '#dcc196', 0.18); g.beginPath(); g.ellipse(fan(X, y), y, r, r * 0.3, 0, 0, TAU); g.fill();
        }
        // 远沿草边
        g.fillStyle = '#86a85c'; g.fillRect(F.x0, F.y0, F.w, 10);
        g.fillStyle = '#6f9450';
        for (let i = 0; i < 500; i++) { const X = -500 + R() * 2600, y = -58 + R() * 6, x = fan(X, y), h = 3 + R() * 5; g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + (R() - 0.5) * 3, y - h * 0.4 + 6 - h); g.lineTo(x + 2, y); g.fill(); }
        // 石板路带
        tileFloor(g, R, {
          rows: [-38, -16, 10, 42], tw: 70, wvar: 0.6, gap: 1.6, stagger: true, jitter: true, skip: 0.06,
          color: (R) => mix('#c9bda8', '#a99c88', R() * 0.6), hiTop: 'rgba(255,248,230,0.55)',
          after(g, R, X, w, ya, yb) {
            if (R() < 0.25) { g.strokeStyle = 'rgba(90,75,60,0.5)'; g.lineWidth = 0.7; g.beginPath(); const xx = X + w * R(); g.moveTo(fan(xx, ya + 2), ya + 2); g.lineTo(fan(xx + 8, (ya + yb) / 2), (ya + yb) / 2); g.lineTo(fan(xx + 2, yb - 2), yb - 2); g.stroke(); }
          },
        });
        g.strokeStyle = 'rgba(110,88,62,0.6)'; g.lineWidth = 1.2;
        for (const y of [-38, 42]) { g.beginPath(); g.moveTo(F.x0, y); g.lineTo(F.x1, y); g.stroke(); }
        // 车辙/踩痕
        g.strokeStyle = 'rgba(150,115,78,0.35)';
        for (const [y, w] of [[78, 3], [92, 4], [150, 5], [172, 6]]) {
          g.lineWidth = w; g.beginPath();
          for (let x = F.x0; x <= F.x1; x += 20) g.lineTo(x, y + N(x * 0.01 + y) * 8);
          g.stroke();
        }
        pebbles(g, R, 380, -30, 236, ['#8f7353', '#cdb48e']);
        // 杂草丛
        for (let i = 0; i < 60; i++) {
          const y = 60 + R() * 170, X = -500 + R() * 2600, f = fanF(y), x = fan(X, y);
          g.fillStyle = R() < 0.5 ? '#7c9b52' : '#93ad62';
          for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x - 3 * f + k * 1.5 * f, y); g.lineTo(x + (k - 2) * 2.5 * f, y - (6 + R() * 6) * f); g.lineTo(x - 1 * f + k * 1.5 * f, y); g.fill(); }
        }
        floorShade(g, F, 0.16, '#3a2a1a');
      },
    },
  });
  // 远沿:木栅栏 + 电线杆 + 晾布
  const ER = edgeRange(-62);
  const poles = []; for (let X = ER.x0 + 140; X < ER.x1; X += 560) poles.push(X);
  items.push({
    edge: -62, res: 2, y0: -360, y1: 6, draw(g, L) {
      // 栅栏
      for (let X = L.x0; X < L.x1; X += 30) {
        if (R() < 0.08) continue;
        g.fillStyle = '#9a6d47'; g.fillRect(X, -30, 5, 31);
        g.fillStyle = '#6e4b30'; g.fillRect(X + 3.5, -30, 1.5, 31);
        g.strokeStyle = '#4a3020'; g.lineWidth = 0.8; g.strokeRect(X, -30, 5, 31);
      }
      for (const y of [-25, -12]) { g.fillStyle = '#a77a52'; g.fillRect(L.x0, y, L.w, 3.5); g.fillStyle = '#6e4b30'; g.fillRect(L.x0, y + 2.5, L.w, 1); }
      // 电线杆
      for (const X of poles) {
        g.fillStyle = '#7d5a40'; g.beginPath(); g.moveTo(X - 5, 2); g.lineTo(X + 5, 2); g.lineTo(X + 3, -330); g.lineTo(X - 3, -330); g.fill();
        g.fillStyle = '#5a3f2c'; g.fillRect(X + 1.5, -330, 2, 332);
        g.strokeStyle = '#3a281c'; g.lineWidth = 0.9; g.strokeRect(X - 3, -330, 6, 332);
        for (const [y, w] of [[-312, 34], [-292, 26]]) {
          g.fillStyle = '#6e4e36'; g.fillRect(X - w, y, w * 2, 4); g.strokeRect(X - w, y, w * 2, 4);
          g.fillStyle = '#e8e2d2'; for (const dx of [-w + 4, -w / 3, w / 3, w - 4]) g.fillRect(X + dx - 1.5, y - 5, 3, 5);
        }
      }
      g.strokeStyle = 'rgba(40,36,40,0.85)'; g.lineWidth = 1;
      for (let i = 0; i < poles.length - 1; i++) {
        const a = poles[i], b = poles[i + 1];
        for (const [y, w, s] of [[-317, 34, 16], [-317, -34, 18], [-297, 26, 22], [-297, -26, 25]]) wire(g, a + w, y, b + w, y, s);
        g.strokeStyle = '#3a3030'; g.lineWidth = 1.6; wire(g, a + 3, -180, b - 3, -180, 14); g.lineWidth = 1; g.strokeStyle = 'rgba(40,36,40,0.85)';
      }
      wire(g, L.x0, -317, poles[0] - 34, -317, 12); wire(g, poles[poles.length - 1] + 34, -317, L.x1, -317, 12);
    },
    anim(ctx, t) {
      // 晾布随风摆动
      const cols = ['#f3efe4', '#c44d3a', '#4f7fae', '#e8c357', '#f3efe4', '#6aa060'];
      for (let i = 0; i < poles.length - 1; i++) {
        const a = poles[i], b = poles[i + 1];
        for (let k = 0; k < 6; k++) {
          const u = (k + 1) / 7, x = a + (b - a) * u, y = -180 + 4 * 14 * u * (1 - u) - 1;
          const sw = Math.sin(t * 2.2 + k * 1.3 + i) * 4, w = 14, h = 18 + (k % 3) * 5;
          ctx.fillStyle = cols[(k + i) % cols.length];
          ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2 + sw, y + h); ctx.lineTo(x - w / 2 + sw * 0.8, y + h - 1); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(60,50,45,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
    },
  });
  // 前景:飘落树叶
  const leaves = mkParticles(R, 14);
  return {
    floor: 'dirt', dust: '#c9a97c', items,
    front(ctx, cam, t) {
      drawParticles(ctx, cam, t, 1.08, leaves, (ctx, x, y, r, t) => {
        const a = t * (1 + r[3]) + r[4] * 6;
        ctx.save(); ctx.translate(x + Math.sin(a) * 20, y); ctx.rotate(Math.sin(a * 0.7) * 1.4); ctx.scale(1, Math.cos(a));
        ctx.fillStyle = r[5] < 0.5 ? '#6fa04e' : '#9cbf5a';
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }, 18, 40);
    },
  };
}
function leafEmblem(g, cx, cy, s) {
  // 原创叶纹:叶身 + 叶脉 + 漩涡叶柄
  const path = () => {
    g.beginPath();
    g.moveTo(cx + s * 0.55, cy - s * 0.85);
    g.bezierCurveTo(cx + s * 0.75, cy - s * 0.2, cx + s * 0.35, cy + s * 0.45, cx - s * 0.1, cy + s * 0.5);
    g.bezierCurveTo(cx - s * 0.6, cy + s * 0.5, cx - s * 0.7, cy - s * 0.05, cx - s * 0.35, cy - s * 0.35);
    g.bezierCurveTo(cx - s * 0.05, cy - s * 0.65, cx + s * 0.3, cy - s * 0.6, cx + s * 0.55, cy - s * 0.85);
    g.moveTo(cx + s * 0.4, cy - s * 0.6);
    g.quadraticCurveTo(cx + s * 0.05, cy - s * 0.1, cx - s * 0.2, cy + s * 0.3);
    // 漩涡柄
    g.moveTo(cx - s * 0.2, cy + s * 0.3);
    for (let a = 0; a <= 4.4; a += 0.2) {
      const r = s * 0.42 * (1 - a / 5.2);
      g.lineTo(cx - s * 0.32 + Math.cos(Math.PI * 0.25 + a) * r * 0.9 * -1, cy + s * 0.62 + Math.sin(Math.PI * 0.25 + a) * r * 0.9 * -1);
    }
  };
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  g.translate(1.8, 2.2); path(); g.strokeStyle = 'rgba(255,240,215,0.65)'; g.lineWidth = 4.2; g.stroke();
  g.translate(-1.8, -2.2); path(); g.strokeStyle = '#7a5d42'; g.lineWidth = 4.6; g.stroke();
  path(); g.strokeStyle = '#94735a'; g.lineWidth = 1.6; g.stroke();
  g.restore();
}

// ---------- 粒子(确定性,无状态) ----------
function mkParticles(R, n) { const a = []; for (let i = 0; i < n; i++) a.push([R(), R(), R(), R(), R(), R()]); return a; }
function drawParticles(ctx, cam, t, p, arr, fn, vx, vy) {
  const rg = parRange(p), W = rg.x1 - rg.x0 + 80, H = rg.y1 - rg.y0 + 80;
  ctx.save(); parT(ctx, cam, p);
  for (const r of arr) {
    const sp = 0.6 + r[2] * 0.8;
    const x = wrap(rg.x0 + r[0] * W + vx * sp * t, rg.x0 - 40, W);
    const y = wrap(rg.y0 + r[1] * H + vy * sp * t, rg.y0 - 40, H);
    fn(ctx, x, y, r, t);
  }
  ctx.restore();
}

// ====================================================================
// 场景 2:终末之谷 · 黄昏
// ====================================================================
function stValley(R) {
  const N = makeNoise(R);
  const WF = { x0: 668, x1: 932, top: -300, bot: -112 };
  const glow = glowSprite('#ffd9a8'), mistG = glowSprite('#f4e6f0');
  // 瀑布水流纹理(竖向条纹,纵向平铺)
  const streak = (() => {
    const w = WF.x1 - WF.x0, h = 160, res = 2, cv = mkCanvas(w * res, h * res), g = cv.getContext('2d');
    g.scale(res, res);
    for (let i = 0; i < 90; i++) {
      const x = R() * w, len = 20 + R() * 80, y = R() * h, ww = 1 + R() * 3;
      g.fillStyle = `rgba(255,${235 + R() * 20 | 0},${225 + R() * 30 | 0},${0.12 + R() * 0.4})`;
      for (const dy of [-h, 0, h]) g.fillRect(x, y + dy, ww, len);
    }
    return { cv, w, h };
  })();
  const items = [];
  items.push({
    p: 0.03, res: 1, draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-480, '#211b48'], [-380, '#3e2d64'], [-300, '#7a3f74'], [-230, '#c95c74'], [-170, '#f08c5c'], [-120, '#ffbe72'], [80, '#ffd99a']]);
      g.fillRect(L.x0, L.y0, L.w, L.h);
      // 夕阳
      g.drawImage(glow, 800 - 260, -330 - 260, 520, 520);
      g.fillStyle = '#fff1c8'; g.beginPath(); g.arc(800, -330, 34, 0, TAU); g.fill();
      // 层云
      for (let i = 0; i < 14; i++) {
        const y = -460 + R() * 230, x = L.x0 + R() * L.w;
        stratus(g, R, x, y, 140 + R() * 220, 16 + R() * 14, '#4b2f5e', y < -350 ? '#a2486a' : '#f0866a');
      }
    },
  });
  items.push({
    p: 0.12, res: 1.5, y0: -330, y1: -90, below: '#7d4a74', draw(g, L) {
      g.fillStyle = '#a65d80';
      ridgePath(g, L.x0, L.x1, 5, x => -250 - N.fbm(x * 0.008 + 2) * 70 + 20, L.y1); g.fill();
      g.fillStyle = '#8a4e78';
      ridgePath(g, L.x0, L.x1, 5, x => -200 - N.fbm(x * 0.012 + 8) * 40, L.y1); g.fill();
    },
  });
  // 峡谷崖壁 + 瀑布(静态底)
  items.push({
    p: 0.25, res: 1.5, y0: -560, y1: -60, below: '#3a2a4c', draw(g, L) {
      const edgeL = (y) => 560 + (y + 560) * 0.32 + (N(y * 0.04) - 0.5) * 30;
      const edgeR = (y) => 1040 - (y + 560) * 0.32 + (N(y * 0.04 + 40) - 0.5) * 30;
      // 瀑布后的岩壁
      g.fillStyle = '#3c2a4a'; g.fillRect(600, WF.top - 6, 400, 260);
      // 左右崖
      const cliff = (side) => {
        g.beginPath();
        if (side < 0) {
          g.moveTo(L.x0, -60); g.lineTo(L.x0, -560);
          for (let y = -560; y <= -60; y += 8) g.lineTo(Math.min(edgeL(y), 700), y);
        } else {
          g.moveTo(L.x1, -60); g.lineTo(L.x1, -560);
          for (let y = -560; y <= -60; y += 8) g.lineTo(Math.max(edgeR(y), 900), y);
        }
        g.closePath();
      };
      for (const side of [-1, 1]) {
        cliff(side);
        g.save(); g.clip();
        const gx = side < 0 ? g.createLinearGradient(L.x0, 0, 720, 0) : g.createLinearGradient(L.x1, 0, 880, 0);
        gx.addColorStop(0, '#2a1f3c'); gx.addColorStop(0.7, '#4a3256'); gx.addColorStop(1, '#8a4a5e');
        g.fillStyle = gx; g.fillRect(L.x0, -580, L.w, 540);
        g.strokeStyle = rgba('#1e1630', 0.5); g.lineWidth = 1.4;
        for (let k = 0; k < 14; k++) { const y = -540 + k * 36 + R() * 12; g.beginPath(); for (let x = L.x0; x < L.x1; x += 14) g.lineTo(x, y + N(x * 0.03 + k * 7) * 10 + (x - 800) * 0.04 * side); g.stroke(); }
        g.restore();
        // 内缘逆光
        g.strokeStyle = '#ef9a6a'; g.lineWidth = 2.4; g.beginPath();
        for (let y = -560; y <= -100; y += 8) { const x = side < 0 ? Math.min(edgeL(y), 700) : Math.max(edgeR(y), 900); y === -560 ? g.moveTo(x, y) : g.lineTo(x, y); }
        g.stroke();
      }
      // 瀑布顶崖唇
      g.fillStyle = '#4a3054'; g.fillRect(620, WF.top - 10, 360, 12);
      g.fillStyle = '#e4906c'; g.fillRect(620, WF.top - 11, 360, 2);
      // 瀑布底色
      const wf = g.createLinearGradient(WF.x0, 0, WF.x1, 0);
      wf.addColorStop(0, '#8d7aa8'); wf.addColorStop(0.5, '#e8d4e0'); wf.addColorStop(1, '#8d7aa8');
      g.fillStyle = wf; g.fillRect(WF.x0, WF.top, WF.x1 - WF.x0, WF.bot - WF.top + 4);
      // 潭水
      g.fillStyle = ygrad(g, WF.bot, -60, [[WF.bot, '#c9a0b8'], [-60, '#8a5a82']]); g.fillRect(L.x0, WF.bot, L.w, 60);
      hazeOver(g, L, '#ffb98a', 0.0, '#c47a8a', 0.3, -300, -60);
    },
    anim(ctx, t) {
      ctx.save();
      ctx.beginPath(); ctx.rect(WF.x0, WF.top, WF.x1 - WF.x0, WF.bot - WF.top); ctx.clip();
      for (const [sp, a] of [[110, 0.9], [70, 0.6]]) {
        ctx.globalAlpha = a;
        const off = (t * sp) % streak.h;
        for (let y = WF.top - streak.h + off; y < WF.bot; y += streak.h) ctx.drawImage(streak.cv, WF.x0, y, streak.w, streak.h);
      }
      ctx.restore();
      // 唇口白浪
      ctx.fillStyle = 'rgba(255,240,235,0.85)';
      for (let i = 0; i < 12; i++) { const x = WF.x0 + i * 22 + 6, y = WF.top + 2 + Math.sin(t * 3 + i) * 1.5; ctx.beginPath(); ctx.ellipse(x, y, 13, 4, 0, 0, TAU); ctx.fill(); }
      // 水雾
      for (let i = 0; i < 9; i++) {
        const ph = t * 0.35 + i * 0.7, k = ph % 1;
        const x = WF.x0 - 40 + ((i * 47) % 350) + Math.sin(ph * 2) * 12, y = WF.bot + 6 - k * 70, r = 60 + k * 70;
        ctx.globalAlpha = 0.5 * Math.sin(Math.PI * k);
        ctx.drawImage(mistG, x - r, y - r * 0.6, r * 2, r * 1.2);
      }
      ctx.globalAlpha = 1;
    },
  });
  // 两尊对峙巨像
  items.push({
    p: 0.5, res: 2, y0: -580, y1: 0, below: '#4a3a66', draw(g, L) {
      // 河面
      g.fillStyle = ygrad(g, -150, 0, [[-150, '#a06a8e'], [-60, '#6d4a7c'], [0, '#5a4272']]); g.fillRect(L.x0, -150, L.w, 150);
      g.fillStyle = 'rgba(255,190,150,0.35)';
      for (let i = 0; i < 40; i++) { const y = -146 + R() * 120, x = 600 + R() * 400; g.fillRect(x, y, 10 + R() * 40, 1.2); }
      statue(g, 455, -150, 1, R);
      statue(g, 1145, -150, -1, R);
    },
  });
  // 两岸乱石
  items.push({
    p: 0.74, res: 2, y0: -220, y1: 10, below: '#4c3a66', draw(g, L) {
      const rock = (x, y, w, h) => {
        g.fillStyle = '#3c2c4a'; g.strokeStyle = '#1c1428'; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(x - w / 2, y);
        g.lineTo(x - w * 0.45, y - h * 0.6); g.lineTo(x - w * 0.2, y - h); g.lineTo(x + w * 0.25, y - h * 0.92); g.lineTo(x + w * 0.5, y - h * 0.4); g.lineTo(x + w / 2, y); g.closePath(); g.fill(); g.stroke();
        const rim = x < 800 ? 1 : -1;
        g.strokeStyle = '#e88e6a'; g.lineWidth = 1.6; g.beginPath();
        if (rim > 0) { g.moveTo(x + w * 0.25, y - h * 0.92); g.lineTo(x + w * 0.5, y - h * 0.4); }
        else { g.moveTo(x - w * 0.2, y - h); g.lineTo(x - w * 0.45, y - h * 0.6); }
        g.stroke();
        g.fillStyle = 'rgba(255,170,150,0.25)'; g.fillRect(x - w / 2, y + 2, w, 2);
      };
      for (let i = 0; i < 7; i++) rock(L.x0 + 20 + i * 45 + R() * 30, -64 + R() * 8, 60 + R() * 70, 40 + R() * 90 - i * 6);
      for (let i = 0; i < 7; i++) rock(L.x1 - 20 - i * 45 - R() * 30, -64 + R() * 8, 60 + R() * 70, 40 + R() * 90 - i * 6);
    },
  });
  // 水面地面
  const ripple = (() => {
    const w = 640, y0 = -62, h = FLOOR_Y1 - y0, res = 1.5, cv = mkCanvas(w * res, h * res), g = cv.getContext('2d');
    g.scale(res, res); g.translate(0, -y0);
    for (let i = 0; i < 260; i++) {
      const y = y0 + Math.pow(R(), 0.7) * h, f = fanF(y), x = R() * w, len = (8 + R() * 30) * f;
      g.fillStyle = R() < 0.7 ? `rgba(255,${190 + R() * 50 | 0},${170 + R() * 40 | 0},${0.25 + R() * 0.3})` : 'rgba(40,30,70,0.35)';
      g.fillRect(x, y, len, 1 + f * 0.8); g.fillRect(x - w, y, len, 1 + f * 0.8);
    }
    return { cv, w, y0, h };
  })();
  items.push({
    floor: {
      top: -60, fade: 14, draw(g, F) {
        g.fillStyle = ygrad(g, F.y0, F.y1, [[-60, '#a26c8c'], [-10, '#7a5384'], [80, '#4f3d72'], [236, '#2e2850']]);
        g.fillRect(F.x0, F.y0, F.w, F.h);
        // 岸边倒影暗带
        g.strokeStyle = 'rgba(255,200,170,0.18)'; g.lineWidth = 1;
        for (const y of rowsBetween(-55, 230, 18, 1.12)) { g.beginPath(); g.moveTo(F.x0, y); g.lineTo(F.x1, y); g.stroke(); }
      },
      anim(ctx, t) {
        for (const [dir, a] of [[1, 0.9], [-1, 0.6]]) {
          ctx.globalAlpha = a;
          const off = wrap(dir * t * 14, 0, ripple.w);
          for (let x = FLOOR_X0 - ripple.w + off; x < FLOOR_X1; x += ripple.w) ctx.drawImage(ripple.cv, x, ripple.y0 + (dir > 0 ? 0 : 3), ripple.w, ripple.h);
        }
        ctx.globalAlpha = 1;
      },
    },
  });
  // 夕阳/瀑布在水面的倒影光柱
  items.push({
    fn(ctx, cam, t) {
      const fy = wsy(cam, -60); if (fy > 540) return;
      const cx = psx(cam, 0.25, 800), s = cam.zoom;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const k = i / 26, y = fy + 6 + Math.pow(k, 1.4) * (560 - fy), w = (20 + k * 90) * s * (0.6 + 0.4 * Math.sin(t * 2.3 + i * 1.7));
        ctx.fillStyle = `rgba(255,170,110,${0.16 * (1 - k)})`;
        ctx.fillRect(cx - w / 2 + Math.sin(t * 1.5 + i) * 6 * s, y, w, (1.5 + k * 3) * s);
      }
      ctx.restore();
    },
  });
  const mist = mkParticles(R, 18);
  return {
    floor: 'water', dust: '#d8e6ef', items,
    front(ctx, cam, t) {
      drawParticles(ctx, cam, t, 1.05, mist, (ctx, x, y, r, t) => {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + r[4] * 6);
        ctx.fillStyle = '#fff0e6';
        ctx.beginPath(); ctx.arc(x, y, 1 + r[5] * 1.6, 0, TAU); ctx.fill();
      }, 14, -10);
      ctx.globalAlpha = 1;
    },
  };
}
// 原创无名武士巨像(dir=1 面朝右)
function statue(g, cx, base, dir, R) {
  g.save(); g.translate(cx, base); g.scale(dir * 1.12, 1.12);
  const lit = g.createLinearGradient(-110, 0, 90, 0);
  lit.addColorStop(0, '#4a3a52'); lit.addColorStop(0.45, '#7a6274'); lit.addColorStop(0.8, '#a8828a'); lit.addColorStop(1, '#f0a67e');
  const line = '#1b1426';
  g.lineWidth = 1.6; g.strokeStyle = line;
  // 石柱基座
  g.fillStyle = lit;
  g.beginPath(); g.moveTo(-120, 30); g.lineTo(-100, -8); g.lineTo(-90, -20); g.lineTo(95, -20); g.lineTo(108, -6); g.lineTo(125, 30); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.rect(-85, -34, 170, 14); g.fill(); g.stroke();
  if (dir > 0) {
    // 斗笠武士:披风长袍,双手按剑
    g.beginPath(); g.moveTo(-60, -230); g.bezierCurveTo(-110, -160, -120, -80, -95, -34); g.lineTo(-30, -34); g.lineTo(-40, -200); g.closePath(); g.fill(); g.stroke(); // 后飘披风
    g.beginPath(); g.moveTo(-48, -240); g.lineTo(46, -240); g.lineTo(62, -34); g.lineTo(-66, -34); g.closePath(); g.fill(); g.stroke(); // 长袍
    g.beginPath(); g.moveTo(-6, -236); g.lineTo(18, -34); g.stroke(); // 衣襟
    for (const x of [-40, -22, 30, 46]) { g.beginPath(); g.moveTo(x * 0.8, -170); g.lineTo(x, -40); g.strokeStyle = 'rgba(20,14,30,0.5)'; g.stroke(); }
    g.strokeStyle = line;
    // 剑
    g.fillStyle = '#6a5470'; g.fillRect(14, -150, 8, 112); g.strokeRect(14, -150, 8, 112);
    g.fillStyle = lit; g.fillRect(2, -158, 32, 8); g.strokeRect(2, -158, 32, 8);
    // 双臂与手
    g.fillStyle = lit;
    g.beginPath(); g.moveTo(-44, -236); g.quadraticCurveTo(-30, -180, 4, -164); g.lineTo(30, -160); g.lineTo(36, -178); g.quadraticCurveTo(20, -200, 4, -236); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(20, -168, 14, 11, 0, 0, TAU); g.fill(); g.stroke();
    // 肩甲
    g.beginPath(); g.moveTo(-58, -238); g.quadraticCurveTo(-60, -258, -30, -262); g.lineTo(40, -262); g.quadraticCurveTo(62, -256, 58, -236); g.closePath(); g.fill(); g.stroke();
    // 头与斗笠
    g.beginPath(); g.rect(-12, -282, 26, 22); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-70, -278); g.lineTo(76, -278); g.lineTo(6, -318); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-70, -278); g.lineTo(76, -278); g.lineTo(70, -274); g.lineTo(-64, -274); g.closePath(); g.fillStyle = '#2a2034'; g.fill();
  } else {
    // 角盔武将:宽肩铠甲,外侧立长戟
    // 戟
    g.fillStyle = '#5a4864';
    g.fillRect(-92, -330, 7, 300); g.strokeRect(-92, -330, 7, 300);
    g.fillStyle = lit; g.beginPath(); g.moveTo(-88.5, -372); g.lineTo(-80, -334); g.lineTo(-97, -334); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-85, -340); g.quadraticCurveTo(-60, -336, -56, -312); g.quadraticCurveTo(-70, -322, -85, -322); g.closePath(); g.fill(); g.stroke();
    // 下摆裙甲
    g.fillStyle = lit;
    g.beginPath(); g.moveTo(-50, -150); g.lineTo(50, -150); g.lineTo(70, -34); g.lineTo(-72, -34); g.closePath(); g.fill(); g.stroke();
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-56 - i * 3, -128 + i * 22); g.lineTo(58 + i * 3, -128 + i * 22); g.stroke(); }
    // 躯干胸甲
    g.beginPath(); g.moveTo(-46, -244); g.lineTo(46, -244); g.lineTo(52, -150); g.lineTo(-52, -150); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, -240); g.lineTo(0, -156); g.moveTo(-40, -200); g.quadraticCurveTo(0, -186, 40, -200); g.stroke();
    // 手臂:一手握戟,一手结印于胸前
    g.beginPath(); g.moveTo(-50, -236); g.lineTo(-74, -170); g.lineTo(-86, -168); g.lineTo(-88, -150); g.lineTo(-70, -146); g.lineTo(-56, -168); g.lineTo(-38, -220); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(40, -236); g.quadraticCurveTo(52, -196, 20, -196); g.lineTo(8, -206); g.lineTo(10, -226); g.lineTo(22, -214); g.quadraticCurveTo(30, -216, 28, -236); g.closePath(); g.fill(); g.stroke();
    g.fillRect(4, -232, 7, 26); g.strokeRect(4, -232, 7, 26);
    // 大肩甲
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 30, -250); g.quadraticCurveTo(s * 76, -258, s * 72, -224); g.lineTo(s * 40, -228); g.closePath(); g.fill(); g.stroke(); }
    // 头盔与双角
    g.beginPath(); g.moveTo(-18, -248); g.lineTo(-20, -286); g.quadraticCurveTo(0, -300, 20, -286); g.lineTo(18, -248); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-14, -286); g.quadraticCurveTo(-46, -300, -40, -334); g.quadraticCurveTo(-30, -306, -6, -294); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(14, -286); g.quadraticCurveTo(46, -300, 40, -334); g.quadraticCurveTo(30, -306, 6, -294); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#21182c'; g.fillRect(-14, -270, 28, 6);
  }
  // 风化斑纹
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,15,40,${0.04 + R() * 0.06})`; g.beginPath(); g.ellipse(-100 + R() * 200, -320 + R() * 330, 2 + R() * 6, 4 + R() * 16, 0, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(120,70,110,0.18)'; g.fillRect(-130, -60, 260, 100);
  g.restore();
}

// ====================================================================
// 场景 3:幽森 · 巨树林
// ====================================================================
function stForest(R) {
  const N = makeNoise(R);
  const fog = '#9fbf8c';
  const beam = beamSprite('#f2f0b4');
  const items = [];
  items.push({
    p: 0.03, res: 1, draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-480, '#0b1d18'], [-330, '#1c3f33'], [-220, '#4b7a5c'], [-140, '#9dbd8a'], [80, '#c2d69e']]);
      g.fillRect(L.x0, L.y0, L.w, L.h);
      // 树冠缝隙透光
      for (let i = 0; i < 16; i++) { g.fillStyle = rgba('#dfeaa8', 0.08 + R() * 0.1); g.beginPath(); g.ellipse(L.x0 + R() * L.w, -440 + R() * 80, 20 + R() * 50, 8 + R() * 14, 0, 0, TAU); g.fill(); }
    },
  });
  const trunks = (g, L, n, wmin, wmax, col, rim, top, base, canopy) => {
    for (let i = 0; i < n; i++) {
      const x = L.x0 + (i + R() * 0.8) * L.w / n, w = wmin + R() * (wmax - wmin), lean = (R() - 0.5) * 20;
      g.fillStyle = col; g.beginPath();
      g.moveTo(x - w * 0.9, base); g.quadraticCurveTo(x - w * 0.5, base - 30, x - w / 2 + lean, base - 80);
      g.lineTo(x - w * 0.42 + lean * 2, top); g.lineTo(x + w * 0.42 + lean * 2, top); g.lineTo(x + w / 2 + lean, base - 80);
      g.quadraticCurveTo(x + w * 0.5, base - 30, x + w * 0.9, base); g.closePath(); g.fill();
      if (rim) { g.fillStyle = rim; g.beginPath(); g.moveTo(x - w / 2 + lean, base - 80); g.lineTo(x - w * 0.42 + lean * 2, top); g.lineTo(x - w * 0.3 + lean * 2, top); g.lineTo(x - w * 0.36 + lean, base - 80); g.fill(); }
    }
    if (canopy) {
      g.fillStyle = canopy; g.beginPath();
      for (let x = L.x0 - 40; x < L.x1 + 40; x += 30 + R() * 30) { const r = 40 + R() * 60, y = top + 20 + R() * 50; g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
      g.rect(L.x0 - 50, L.y0 - 10, L.w + 100, top - L.y0 + 30); g.fill();
    }
  };
  items.push({
    p: 0.18, res: 1.5, y0: -560, y1: -60, below: '#86a982', draw(g, L) {
      trunks(g, L, 16, 18, 40, '#79a17a', null, -560, -110, '#3f6a52');
      g.fillStyle = '#88ad80'; ridgePath(g, L.x0, L.x1, 6, x => -112 - N.fbm(x * 0.02) * 20, L.y1); g.fill();
      hazeOver(g, L, fog, 0.1, fog, 0.55, -500, -100);
    },
  });
  items.push({
    p: 0.4, res: 2, y0: -600, y1: -40, below: '#5a7f56', draw(g, L) {
      trunks(g, L, 11, 34, 70, '#41654c', '#7e9f6c', -600, -96, '#203d2e');
      g.fillStyle = '#56794f'; ridgePath(g, L.x0, L.x1, 6, x => -98 - N.fbm(x * 0.03 + 5) * 16, L.y1); g.fill();
      hazeOver(g, L, fog, 0.0, fog, 0.4, -400, -90);
    },
  });
  // 参天巨树
  items.push({
    p: 0.68, res: 2, y0: -680, y1: 20, below: '#3d5a32', draw(g, L) {
      g.fillStyle = ygrad(g, -110, 20, [[-110, '#4e6e3e'], [20, '#3f5c33']]); g.fillRect(L.x0, -100, L.w, 120);
      const xs = [L.x0 + 160, 560, 1010, L.x1 - 150];
      for (let i = 0; i < xs.length; i++) bigTree(g, R, N, xs[i], -82, 80 + R() * 40, L.y0);
      hazeOver(g, L, fog, 0.05, fog, 0.3, -500, -80);
      // 顶部树冠
      g.fillStyle = '#122a20'; g.beginPath();
      for (let x = L.x0 - 40; x < L.x1 + 40; x += 40 + R() * 40) { const r = 50 + R() * 50, y = -640 + R() * 70; g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
      g.rect(L.x0, L.y0 - 10, L.w, 50); g.fill();
      // 藤蔓
      g.strokeStyle = '#2a4a2c'; g.lineWidth = 2;
      for (let i = 0; i < 14; i++) { const x = L.x0 + R() * L.w, len = 80 + R() * 200; g.beginPath(); g.moveTo(x, -660); g.quadraticCurveTo(x + 14, -660 + len / 2, x + (R() - 0.5) * 20, -620 + len); g.stroke(); }
    },
  });
  items.push({
    floor: {
      top: -72, fade: 14, draw(g, F) {
        g.fillStyle = ygrad(g, F.y0, F.y1, [[-72, '#59783f'], [0, '#4d6a36'], [236, '#36502a']]);
        g.fillRect(F.x0, F.y0, F.w, F.h);
        // 苔藓斑块
        for (let i = 0; i < 300; i++) {
          const y = F.y0 + R() * F.h, X = -500 + R() * 2600, f = fanF(y), r = (8 + R() * 36) * f;
          g.fillStyle = rgba(R() < 0.55 ? '#6f9147' : '#3a5328', 0.3); g.beginPath(); g.ellipse(fan(X, y), y, r, r * 0.32, 0, 0, TAU); g.fill();
        }
        // 斑驳光斑
        for (let i = 0; i < 40; i++) {
          const y = -50 + R() * 250, X = -300 + R() * 2200, f = fanF(y), r = (14 + R() * 30) * f;
          g.fillStyle = 'rgba(230,240,160,0.13)'; g.beginPath(); g.ellipse(fan(X, y), y, r, r * 0.28, 0, 0, TAU); g.fill();
        }
        // 小蘑菇与草
        for (let i = 0; i < 70; i++) {
          const y = -40 + R() * 270, X = -400 + R() * 2400, f = fanF(y), x = fan(X, y);
          if (R() < 0.3) { g.fillStyle = '#e8dcc0'; g.fillRect(x - f, y - 4 * f, 2 * f, 4 * f); g.fillStyle = R() < 0.5 ? '#c45a3e' : '#d9b46a'; g.beginPath(); g.ellipse(x, y - 4 * f, 4 * f, 2.4 * f, 0, Math.PI, TAU); g.fill(); }
          else { g.fillStyle = '#7da352'; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x + (k - 2) * 1.6 * f, y); g.lineTo(x + (k - 1.5) * 3 * f, y - (6 + R() * 6) * f); g.lineTo(x + (k - 1) * 1.6 * f, y); g.fill(); } }
        }
        floorShade(g, F, 0.3, '#0f1a0c');
      },
    },
  });
  // 参天巨树(立于地面远沿,根系与地面透视一致)
  items.push({
    edge: -70, res: 1.5, y0: -800, y1: 24, draw(g, L) {
      for (const [X, w] of [[60, 190], [760, 150], [1520, 200]]) bigTree(g, R, N, X, 0, w, L.y0);
      g.fillStyle = '#0f241b'; g.beginPath();
      for (let x = L.x0 - 40; x < L.x1 + 40; x += 50 + R() * 40) { const r = 60 + R() * 60, y = -720 + R() * 60; g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
      g.rect(L.x0 - 40, L.y0 - 10, L.w + 80, -720 - L.y0 + 10); g.fill();
      g.strokeStyle = '#1f3a24'; g.lineWidth = 2.4;
      for (let i = 0; i < 16; i++) { const x = L.x0 + R() * L.w, len = 100 + R() * 240; g.beginPath(); g.moveTo(x, -720); g.quadraticCurveTo(x + 16, -720 + len / 2, x + (R() - 0.5) * 24, -690 + len); g.stroke(); }
    },
  });
  // 斜射光柱(缓慢摇曳)
  const beams = [0, 1, 2, 3, 4].map(i => ({ x: 380 + i * 240 + R() * 80, w: 70 + R() * 70, a: 0.35 + R() * 0.25, ph: R() * 6 }));
  items.push({
    fn(ctx, cam, t) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const b of beams) {
        const top = psy(cam, 0.6, -640), bot = wsy(cam, 40), x = psx(cam, 0.6, b.x), s = 1 + (cam.zoom - 1) * 0.6;
        const sway = Math.sin(t * 0.25 + b.ph) * 0.12;
        ctx.globalAlpha = b.a * (0.75 + 0.25 * Math.sin(t * 0.6 + b.ph * 2));
        ctx.save(); ctx.transform(b.w * s / 64, 0, (0.42 + sway) * (bot - top) / 256, (bot - top) / 256, x, top);
        ctx.drawImage(beam, -32, 0); ctx.restore();
      }
      ctx.restore();
    },
  });
  const spores = mkParticles(R, 46);
  const sporeG = glowSprite('#e6ff9a', 32);
  return {
    floor: 'grass', dust: '#7f9a5a', items,
    front(ctx, cam, t) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      drawParticles(ctx, cam, t, 0.95, spores, (ctx, x, y, r, t) => {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.8 + r[3]) + r[4] * 6));
        ctx.globalAlpha = tw * 0.8; const sz = 6 + r[5] * 8;
        ctx.drawImage(sporeG, x + Math.sin(t * 0.7 + r[4] * 9) * 14 - sz / 2, y - sz / 2, sz, sz);
      }, 3, -9);
      ctx.restore();
    },
  };
}
function bigTree(g, R, N, x, base, w, top) {
  const bark = '#3a3026', barkLit = '#5d5038', rim = '#a9b36e', line = '#1a150f';
  // 根
  for (let k = 0; k < 5; k++) {
    const s = k < 2.5 ? -1 : 1, spread = (60 + R() * 90) * s, rx = x + (k - 2) * w * 0.18;
    g.fillStyle = k % 2 ? barkLit : bark; g.strokeStyle = line; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(rx - 22, base - 60); g.quadraticCurveTo(rx + spread * 0.3, base - 12, rx + spread, base + 6 + R() * 10);
    g.lineTo(rx + spread * 0.9 + 10 * s, base + 14); g.quadraticCurveTo(rx + spread * 0.2, base + 4, rx + 22, base - 40); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#5d7f3c'; g.beginPath(); g.ellipse(rx + spread * 0.45, base - 6, 18, 5, s * 0.3, 0, TAU); g.fill();
  }
  // 树干
  const lean = (R() - 0.5) * 30;
  const tr = new Path2D();
  tr.moveTo(x - w * 0.62, base); tr.quadraticCurveTo(x - w * 0.5, base - 60, x - w / 2 + lean * 0.3, base - 140);
  tr.lineTo(x - w * 0.42 + lean, top); tr.lineTo(x + w * 0.42 + lean, top); tr.lineTo(x + w / 2 + lean * 0.3, base - 140);
  tr.quadraticCurveTo(x + w * 0.5, base - 60, x + w * 0.62, base); tr.closePath();
  const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, '#6b6440'); gr.addColorStop(0.12, barkLit); gr.addColorStop(0.5, bark); gr.addColorStop(1, '#221c16');
  g.fillStyle = gr; g.fill(tr);
  g.save(); g.clip(tr);
  // 树皮纹
  g.strokeStyle = 'rgba(20,15,10,0.55)'; g.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const u = (i + 0.5) / 16; g.beginPath();
    for (let y = base; y > top; y -= 20) g.lineTo(x - w / 2 + w * u + (N(y * 0.02 + i * 5) - 0.5) * 14 + lean * (base - y) / (base - top), y);
    g.stroke();
  }
  // 苔藓
  for (let i = 0; i < 9; i++) {
    const mx = x - w * 0.45 + R() * w * 0.5, my = base - 20 - R() * 300, mw = 10 + R() * 18, mh = 30 + R() * 70;
    g.fillStyle = rgba('#557d38', 0.55); g.beginPath(); g.moveTo(mx - mw, my);
    g.quadraticCurveTo(mx, my - mh * 0.4, mx + mw, my); g.lineTo(mx + mw * 0.4, my + mh * 0.5); g.lineTo(mx, my + mh * 0.2); g.lineTo(mx - mw * 0.5, my + mh * 0.6); g.closePath(); g.fill();
  }
  // 树洞
  if (R() < 0.6) { g.fillStyle = '#120e0a'; g.beginPath(); g.ellipse(x + (R() - 0.5) * w * 0.3, base - 160 - R() * 120, w * 0.1, w * 0.17, 0, 0, TAU); g.fill(); }
  g.restore();
  g.strokeStyle = line; g.lineWidth = 1.6; g.stroke(tr);
  // 左侧逆光描边
  g.strokeStyle = rgba(rim, 0.8); g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - w / 2 + lean * 0.3 + 2, base - 140); g.lineTo(x - w * 0.42 + lean + 2, top); g.stroke();
}

// ====================================================================
// 场景 4:白壁庭 · 正午
// ====================================================================
function stSoul(R) {
  const N = makeNoise(R);
  const sky = '#d6ecf8';
  const items = [];
  items.push({
    p: 0.03, res: 1, draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-480, '#2a74cc'], [-330, '#4e9ce2'], [-200, '#93caf0'], [-110, '#d8eefa'], [80, '#eef8fd']]);
      g.fillRect(L.x0, L.y0, L.w, L.h);
      g.globalAlpha = 0.55;
      for (let i = 0; i < 10; i++) stratus(g, R, L.x0 + R() * L.w, -450 + R() * 200, 160 + R() * 200, 10 + R() * 8, '#ffffff', '#e2f0fa');
      g.globalAlpha = 1;
      for (let i = 0; i < 5; i++) cumulus(g, R, L.x0 + R() * L.w, -120, 120 + R() * 120, 50 + R() * 40, { sh: '#c2d9ea', body: '#f2f8fc', hi: '#ffffff' });
    },
  });
  // 远方白塔
  items.push({
    p: 0.1, res: 1.5, y0: -500, y1: -90, below: '#cfdbe6', draw(g, L) {
      // 远处屋脊群
      for (let k = 0; k < 3; k++) {
        const base = -120 - k * 12;
        g.fillStyle = mix('#eef0f0', sky, 0.55 - k * 0.1); g.fillRect(L.x0, base - 16, L.w, 40);
        g.fillStyle = mix('#5b6573', sky, 0.6 - k * 0.1);
        for (let x = L.x0; x < L.x1; x += 40 + R() * 60) { const w = 30 + R() * 50; g.beginPath(); g.moveTo(x - 4, base - 16); g.lineTo(x + w * 0.2, base - 24 - R() * 6); g.lineTo(x + w * 0.8, base - 24 - R() * 6); g.lineTo(x + w + 4, base - 16); g.fill(); }
      }
      whiteTower(g, 960, -118, R);
      hazeOver(g, L, sky, 0.25, sky, 0.35);
    },
  });
  // 中景:成排白壁楼阁
  items.push({
    p: 0.42, res: 2, y0: -330, y1: -40, below: '#cfd2d6', draw(g, L) {
      for (let row = 0; row < 2; row++) {
        const base = -120 + row * 22, hz = 0.35 - row * 0.15;
        let x = L.x0 - 40;
        while (x < L.x1) {
          const w = 70 + R() * 110, h = (row ? 50 : 90) + R() * 90;
          const wall = mix('#f4f2ec', sky, hz), sh = mix('#cfd3dc', sky, hz), roof = mix('#4a5464', sky, hz), line = mix('#2e3540', sky, hz);
          g.fillStyle = wall; g.fillRect(x, base - h, w, h);
          g.fillStyle = sh; g.fillRect(x + w * 0.72, base - h, w * 0.28, h);
          g.fillStyle = mix('#b8bcc4', sky, hz); g.fillRect(x, base - 8, w, 8);
          g.fillStyle = mix('#3a4250', sky, hz);
          for (let i = 0; i < Math.floor(w / 26); i++) if (R() < 0.6) g.fillRect(x + 8 + i * 26, base - h + 14, 8, 6);
          hipRoof(g, x, base - h, w, 12 + w * 0.1, { roof, roofSh: mix(roof, '#10141a', 0.35), line });
          x += w + 6 + R() * 30;
        }
      }
    },
  });
  // 近景高墙 + 巷道开口
  const gaps = [[540, 640], [1140, 1220]];
  items.push({
    p: 0.78, res: 2, y0: -300, y1: 30, below: '#d7d3c8', draw(g, L) {
      const top = -196, base = -66, d = 22, inTop = -150, inBase = -84;
      g.fillStyle = '#d9d5ca'; g.fillRect(L.x0, base, L.w, 100);
      // 巷道纵深:两侧墙透视收向内,尽头一道矮墙
      for (const [a, b] of gaps) {
        g.fillStyle = '#c9c6bc'; g.beginPath(); g.moveTo(a, base); g.lineTo(a + d, inBase); g.lineTo(b - d, inBase); g.lineTo(b, base); g.fill();
        g.fillStyle = '#eceae4'; g.fillRect(a + d - 1, inTop, b - a - 2 * d + 2, inBase - inTop);
        g.fillStyle = '#c0bbb0'; g.fillRect(a + d - 1, inBase - 10, b - a - 2 * d + 2, 10);
        g.fillStyle = '#4a5362'; g.fillRect(a + d - 4, inTop - 8, b - a - 2 * d + 8, 8);
        g.fillStyle = '#2f3540'; g.fillRect(a + d - 4, inTop - 11, b - a - 2 * d + 8, 3);
        // 左侧墙(受光)与右侧墙(背光)
        g.fillStyle = '#f0efe9'; g.beginPath(); g.moveTo(a, top); g.lineTo(a + d, inTop); g.lineTo(a + d, inBase); g.lineTo(a, base); g.fill();
        g.fillStyle = '#c3cad6'; g.beginPath(); g.moveTo(b, top); g.lineTo(b - d, inTop); g.lineTo(b - d, inBase); g.lineTo(b, base); g.fill();
        // 侧墙瓦顶
        g.strokeStyle = '#3a424f'; g.lineWidth = 6; g.lineCap = 'butt';
        g.beginPath(); g.moveTo(a - 2, top - 8); g.lineTo(a + d, inTop - 7); g.moveTo(b + 2, top - 8); g.lineTo(b - d, inTop - 7); g.stroke();
        g.lineCap = 'round';
        g.fillStyle = 'rgba(90,100,120,0.18)'; g.beginPath(); g.moveTo(a + d, inBase); g.lineTo(b - d, inBase); g.lineTo(b - d - 10, inBase + 4); g.lineTo(a + d, inBase + 4); g.fill();
      }
      // 主墙
      g.save();
      g.beginPath(); g.rect(L.x0, top, L.w, base - top + 2);
      for (const [a, b] of gaps) g.rect(b, top, a - b, base - top + 2);
      g.clip('evenodd');
      g.fillStyle = ygrad(g, top, base, [[top, '#e3e5e9'], [top + 26, '#f4f3ee'], [base - 30, '#f2f0e8'], [base, '#e6e2d6']]);
      g.fillRect(L.x0, top, L.w, base - top + 2);
      // 墙板接缝与水渍
      g.strokeStyle = 'rgba(150,150,140,0.35)'; g.lineWidth = 1;
      for (let x = L.x0 + 20; x < L.x1; x += 90 + R() * 30) { g.beginPath(); g.moveTo(x, top + 20); g.lineTo(x, base - 22); g.stroke(); }
      for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(170,165,150,0.12)'; g.fillRect(L.x0 + R() * L.w, top + 22, 2 + R() * 10, 20 + R() * 80); }
      // 石砌墙脚
      g.fillStyle = '#c0bbb0'; g.fillRect(L.x0, base - 22, L.w, 22);
      g.strokeStyle = 'rgba(110,105,95,0.55)';
      for (let r = 0; r < 2; r++) for (let x = L.x0 + r * 18; x < L.x1; x += 36) { g.strokeRect(x, base - 22 + r * 11, 36, 11); }
      g.restore();
      // 墙头瓦顶
      g.fillStyle = '#434c5a'; g.strokeStyle = '#262c36'; g.lineWidth = 1.2;
      const capSeg = [[L.x0, gaps[0][0]], [gaps[0][1], gaps[1][0]], [gaps[1][1], L.x1]];
      for (const [a, b] of capSeg) {
        g.fillStyle = '#434c5a';
        g.beginPath(); g.moveTo(a - 8, top + 2); g.lineTo(b + 8, top + 2); g.lineTo(b + 2, top - 14); g.lineTo(a - 2, top - 14); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = '#5f6878'; g.lineWidth = 1;
        for (let x = a; x < b; x += 6) { g.beginPath(); g.moveTo(x, top - 13); g.lineTo(x - 1, top + 1); g.stroke(); }
        g.fillStyle = '#2f3540'; g.fillRect(a - 3, top - 19, b - a + 6, 6);
        g.fillStyle = '#6c7585'; g.fillRect(a - 3, top - 19, b - a + 6, 1.6);
        g.fillStyle = '#353c48'; for (let x = a - 6; x < b + 6; x += 7) { g.beginPath(); g.arc(x, top + 2, 2.6, 0, Math.PI); g.fill(); }
        g.strokeStyle = '#262c36'; g.lineWidth = 1.2;
        // 檐下阴影
        g.fillStyle = 'rgba(80,95,120,0.22)'; g.fillRect(a, top + 2, b - a, 12);
      }
    },
  });
  items.push({
    floor: {
      top: -68, draw(g, F) {
        g.fillStyle = '#d9d6cc'; g.fillRect(F.x0, F.y0, F.w, F.h);
        tileFloor(g, R, {
          rows: rowsBetween(-68, 236, 9, 1.2), tw: 92, gap: 1.2, stagger: true,
          color: (R) => mix('#eceae2', '#d6d3c8', R()), hiTop: 'rgba(255,255,255,0.7)',
          after(g, R, X, w, ya, yb) {
            if (R() < 0.15) { g.fillStyle = 'rgba(160,155,140,0.18)'; g.beginPath(); fanQuad(g, X + w * 0.3, X + w * 0.7, ya + (yb - ya) * 0.3, yb - (yb - ya) * 0.2); g.fill(); }
          },
        });
        // 墙脚阴影
        g.fillStyle = vgrad(g, -68, -30, [[0, 'rgba(90,100,120,0.35)'], [1, 'rgba(90,100,120,0)']]); g.fillRect(F.x0, -68, F.w, 38);
        floorShade(g, F, 0.14, '#4a4a55');
      },
    },
  });
  // 地狱蝶
  const flies = [0, 1, 2, 3].map(() => ({ x: R() * 1600, y: -160 - R() * 220, ph: R() * 10, sp: 18 + R() * 16, p: 0.7 + R() * 0.25 }));
  items.push({
    fn(ctx, cam, t) {
      for (const b of flies) {
        const p = b.p, rg = parRange(p);
        const lx = wrap(b.x + t * b.sp + Math.sin(t * 0.5 + b.ph) * 60, rg.x0 - 30, rg.x1 - rg.x0 + 60);
        const ly = b.y + Math.sin(t * 0.9 + b.ph) * 30 + Math.sin(t * 2.3 + b.ph) * 8;
        const sx = psx(cam, p, lx), sy = psy(cam, p, ly), s = (1 + (cam.zoom - 1) * p) * (0.8 + p * 0.4);
        butterfly(ctx, sx, sy, s, t * 9 + b.ph, 1);
      }
    },
  });
  return { floor: 'stone', dust: '#d8d4c8', items, front() {} };
}
function whiteTower(g, cx, base, R) {
  const wall = '#f2f2ee', sh = '#c4cbd6', roof = '#465060', line = '#59606e';
  g.lineWidth = 1; g.strokeStyle = line;
  // 台基
  g.fillStyle = wall; g.beginPath(); g.moveTo(cx - 80, base); g.lineTo(cx - 60, base - 40); g.lineTo(cx + 60, base - 40); g.lineTo(cx + 80, base); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = sh; g.beginPath(); g.moveTo(cx + 30, base - 40); g.lineTo(cx + 60, base - 40); g.lineTo(cx + 80, base); g.lineTo(cx + 40, base); g.fill();
  // 塔身(收分)
  const levels = 7; let y = base - 40, w = 42;
  for (let i = 0; i < levels; i++) {
    const h = 50 - i * 3, w2 = w * 0.9;
    g.fillStyle = wall; g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx - w2, y - h); g.lineTo(cx + w2, y - h); g.lineTo(cx + w, y); g.fill(); g.stroke();
    g.fillStyle = sh; g.beginPath(); g.moveTo(cx + w * 0.35, y); g.lineTo(cx + w2 * 0.35, y - h); g.lineTo(cx + w2, y - h); g.lineTo(cx + w, y); g.fill();
    g.fillStyle = '#39404c'; g.fillRect(cx - 4, y - h * 0.7, 8, h * 0.35);
    // 层檐
    g.fillStyle = roof; g.beginPath(); g.moveTo(cx - w2 - 12, y - h + 4); g.quadraticCurveTo(cx - w2, y - h - 2, cx - w2 + 6, y - h - 9); g.lineTo(cx + w2 - 6, y - h - 9); g.quadraticCurveTo(cx + w2, y - h - 2, cx + w2 + 12, y - h + 4); g.closePath(); g.fill();
    y -= h + 9; w = w2 * 0.92;
  }
  // 尖顶
  g.fillStyle = roof; g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx, y - 46); g.lineTo(cx + w, y); g.fill();
  g.strokeStyle = '#8a8f9a'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, y - 40); g.lineTo(cx, y - 80); g.stroke();
  void R;
}
function butterfly(ctx, x, y, s, ph, dir) {
  const open = 0.2 + 0.8 * Math.abs(Math.cos(ph));
  ctx.save(); ctx.translate(x, y); ctx.scale(s * dir, s); ctx.rotate(-0.2 + Math.sin(ph * 0.13) * 0.15);
  ctx.fillStyle = '#100a14'; ctx.strokeStyle = 'rgba(140,90,170,0.7)'; ctx.lineWidth = 0.7;
  for (const sd of [-1, 1]) {
    ctx.save(); ctx.scale(sd * open, 1);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(3, -10, 13, -11, 12, -3); ctx.bezierCurveTo(11, 0, 5, 1, 0, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.bezierCurveTo(6, 2, 9, 7, 6, 10); ctx.bezierCurveTo(3, 11, 1, 6, 0, 1); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#100a14'; ctx.fillRect(-0.8, -3, 1.6, 9);
  ctx.restore();
}

// ====================================================================
// 场景 5:虚白沙海 · 永夜
// ====================================================================
function stDesert(R) {
  const N = makeNoise(R);
  const items = [];
  const moon = { x: 1010, y: -372, r: 74 };
  items.push({
    p: 0.02, res: 1.5, draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-480, '#010207'], [-260, '#060912'], [-150, '#111628'], [-100, '#1a2035'], [80, '#232a40']]);
      g.fillRect(L.x0, L.y0, L.w, L.h);
      for (let i = 0; i < 320; i++) {
        const x = L.x0 + R() * L.w, y = L.y0 + Math.pow(R(), 1.3) * 380, a = 0.2 + R() * 0.7, r = R() < 0.92 ? 0.6 : 1.2;
        g.fillStyle = `rgba(230,236,255,${a})`; g.fillRect(x, y, r, r);
      }
      // 月晕 + 新月
      const gr = g.createRadialGradient(moon.x, moon.y, moon.r * 0.8, moon.x, moon.y, moon.r * 3.2);
      gr.addColorStop(0, 'rgba(210,220,255,0.22)'); gr.addColorStop(1, 'rgba(210,220,255,0)');
      g.fillStyle = gr; g.fillRect(moon.x - 300, moon.y - 300, 600, 600);
      const mc = mkCanvas(200 * 1.5, 200 * 1.5), m = mc.getContext('2d');
      m.scale(1.5, 1.5);
      m.fillStyle = '#f6f6ef'; m.beginPath(); m.arc(100, 100, moon.r, 0, TAU); m.fill();
      m.globalCompositeOperation = 'destination-out';
      m.beginPath(); m.arc(100 + 30, 100 - 16, moon.r * 0.96, 0, TAU); m.fill();
      g.drawImage(mc, moon.x - 100, moon.y - 100, 200, 200);
    },
    anim(ctx, t) {
      // 少量星闪
      for (let i = 0; i < 10; i++) {
        const a = Math.max(0, Math.sin(t * (0.7 + i * 0.13) + i * 2.1));
        ctx.fillStyle = `rgba(240,244,255,${a * 0.9})`;
        const x = 340 + ((i * 271) % 900), y = -470 + ((i * 97) % 280);
        ctx.fillRect(x - 0.5, y - 2.5, 1, 5); ctx.fillRect(x - 2.5, y - 0.5, 5, 1);
      }
    },
  });
  // 远方穹顶宫殿
  items.push({
    p: 0.1, res: 1.5, y0: -330, y1: -90, below: '#3b4157', draw(g, L) {
      const cx = 640, base = -132;
      const lit = '#b4b9c8', sh = '#6f7690';
      for (const [dx, h, w] of [[-260, 150, 7], [-200, 110, 6], [210, 170, 7], [270, 120, 6], [-120, 90, 5], [140, 100, 5]]) {
        g.fillStyle = lit; g.fillRect(cx + dx - w / 2, base - h, w, h);
        g.fillStyle = sh; g.fillRect(cx + dx, base - h, w / 2, h);
        g.fillStyle = lit; g.beginPath(); g.arc(cx + dx, base - h, w * 0.9, Math.PI, TAU); g.fill();
      }
      g.fillStyle = lit; g.fillRect(cx - 230, base - 40, 460, 40);
      g.fillStyle = sh; g.fillRect(cx + 40, base - 40, 190, 40);
      const dg = g.createLinearGradient(cx - 200, 0, cx + 200, 0); dg.addColorStop(0, '#c6cad6'); dg.addColorStop(0.5, '#a9aec0'); dg.addColorStop(1, '#5f667f');
      g.fillStyle = dg; g.beginPath(); g.ellipse(cx, base - 40, 200, 96, 0, Math.PI, TAU); g.fill();
      g.strokeStyle = 'rgba(80,86,110,0.6)'; g.lineWidth = 1;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(cx, base - 40, 200 * k / 4, 96, 0, Math.PI, TAU); g.stroke(); }
      // 远丘
      g.fillStyle = '#4a5068'; ridgePath(g, L.x0, L.x1, 6, x => -122 - N.fbm(x * 0.006 + 4) * 30, L.y1); g.fill();
      hazeOver(g, L, '#1a2035', 0.35, '#2a3048', 0.35);
    },
  });
  // 沙丘:不对称山包,背月一侧(左)落入阴影,脊线高光
  const dunes = (g, L, base, amp, lit, sh, crest) => {
    g.fillStyle = lit; g.fillRect(L.x0, base, L.w, L.y1 - base);
    const list = [];
    for (let x = L.x0 - 200; x < L.x1 + 200; x += 120 + R() * 160) list.push([x, base + (R() - 0.3) * amp * 0.35, 140 + R() * 220, amp * (0.45 + R() * 0.55)]);
    list.sort((p, q) => p[1] - q[1]);
    for (const [xc, b0, W, H] of list) {
      const cy = b0 - H, lx = xc - W, rx = xc + W * 0.75;
      g.fillStyle = lit; g.beginPath(); g.moveTo(lx, b0 + 30);
      g.bezierCurveTo(lx + W * 0.5, b0, xc - W * 0.35, cy, xc, cy);
      g.bezierCurveTo(xc + W * 0.2, cy, rx - W * 0.3, b0, rx, b0 + 30); g.closePath(); g.fill();
      // 阴影面
      g.fillStyle = sh; g.beginPath(); g.moveTo(lx, b0 + 30);
      g.bezierCurveTo(lx + W * 0.5, b0, xc - W * 0.35, cy, xc, cy);
      g.bezierCurveTo(xc - W * 0.05, cy + H * 0.45, xc - W * 0.25, b0 + 10, xc - W * 0.15, b0 + 30); g.closePath(); g.fill();
      g.strokeStyle = crest; g.lineWidth = 1.3; g.beginPath(); g.moveTo(xc - W * 0.5, cy + H * 0.42);
      g.bezierCurveTo(xc - W * 0.3, cy + H * 0.1, xc - W * 0.15, cy, xc, cy); g.stroke();
    }
  };
  items.push({
    p: 0.3, res: 1.5, y0: -250, y1: -60, below: '#9aa2b8', draw(g, L) {
      dunes(g, L, -110, 70, '#c9cedb', '#8b93aa', '#e8ebf2');
      hazeOver(g, L, '#3a4058', 0.3, '#3a4058', 0.05);
    },
  });
  items.push({
    p: 0.52, res: 2, y0: -260, y1: -30, below: '#b5bbcb', draw(g, L) {
      dunes(g, L, -86, 90, '#d6dae4', '#99a1b6', '#f2f4f8');
      hazeOver(g, L, '#3a4058', 0.15, '#3a4058', 0.0);
    },
  });
  // 石英枯树
  items.push({
    p: 0.76, res: 2, y0: -440, y1: 20, below: '#c8ccd8', draw(g, L) {
      g.fillStyle = ygrad(g, -100, 20, [[-100, '#d7dbe5'], [20, '#cbcfdb']]);
      ridgePath(g, L.x0, L.x1, 5, x => -74 - N.fbm(x * 0.008 + 60) * 26, 30); g.fill();
      for (const [x, s] of [[L.x0 + 110, 1.05], [520, 0.7], [1180, 0.95], [L.x1 - 90, 0.8]]) quartzTree(g, R, x, -72, s);
      // 白色晶石碎块
      for (let i = 0; i < 18; i++) {
        const x = L.x0 + R() * L.w, y = -70 + R() * 10, h = 6 + R() * 18, w = 4 + R() * 6;
        g.fillStyle = '#eef0f6'; g.strokeStyle = '#5e6680'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x - w, y); g.lineTo(x - w * 0.4, y - h); g.lineTo(x + w * 0.5, y - h * 0.8); g.lineTo(x + w, y); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#a3aac0'; g.beginPath(); g.moveTo(x - w * 0.4, y - h); g.lineTo(x - w * 0.2, y); g.lineTo(x - w, y); g.fill();
      }
    },
  });
  // 沙地
  const drift = (() => {
    const w = 700, y0 = -60, h = FLOOR_Y1 - y0, res = 1, cv = mkCanvas(w * res, h * res), g = cv.getContext('2d');
    g.translate(0, -y0);
    for (let i = 0; i < 70; i++) {
      const y = y0 + 10 + R() * (h - 10), f = fanF(y), x = R() * w, len = (60 + R() * 160) * f;
      const gr = g.createLinearGradient(x, 0, x + len, 0);
      gr.addColorStop(0, 'rgba(250,252,255,0)'); gr.addColorStop(0.5, `rgba(250,252,255,${0.25 + R() * 0.3})`); gr.addColorStop(1, 'rgba(250,252,255,0)');
      g.fillStyle = gr;
      for (const dx of [0, -w]) { g.beginPath(); g.ellipse(x + dx + len / 2, y, len / 2, 1.2 * f, 0, 0, TAU); g.fill(); }
    }
    return { cv, w, y0, h };
  })();
  items.push({
    floor: {
      top: -62, fade: 12, draw(g, F) {
        g.fillStyle = ygrad(g, F.y0, F.y1, [[-62, '#dfe2ea'], [40, '#d2d6e0'], [236, '#bcc1ce']]);
        g.fillRect(F.x0, F.y0, F.w, F.h);
        // 沙纹
        const rows = rowsBetween(-54, 236, 30, 1.07);
        for (let i = 0; i < rows.length; i++) {
          const y = rows[i], f = fanF(y), ph = R() * 100;
          for (const [dy, c, lw] of [[0, 'rgba(150,158,180,0.45)', 1.3], [1.6 * f, 'rgba(250,251,255,0.7)', 1]]) {
            g.strokeStyle = c; g.lineWidth = lw * f; g.beginPath();
            for (let x = F.x0; x <= F.x1; x += 14) g.lineTo(x, y + dy + Math.sin(x * 0.012 / f + ph) * 3 * f + (N(x * 0.01 + ph) - 0.5) * 5 * f);
            g.stroke();
          }
        }
        pebbles(g, R, 120, -50, 236, ['#6c7490', '#aab1c6'], 2.5);
        floorShade(g, F, 0.22, '#2a3048');
      },
      anim(ctx, t) {
        ctx.globalAlpha = 0.8;
        const off = wrap(t * 60, 0, drift.w);
        for (let x = FLOOR_X0 - drift.w + off; x < FLOOR_X1; x += drift.w) ctx.drawImage(drift.cv, x, drift.y0, drift.w, drift.h);
        ctx.globalAlpha = 1;
      },
    },
  });
  const sand = mkParticles(R, 90);
  return {
    floor: 'sand', dust: '#e4e6ee', items,
    front(ctx, cam, t) {
      drawParticles(ctx, cam, t, 1.1, sand, (ctx, x, y, r, t) => {
        if (y < -150) return;
        ctx.fillStyle = `rgba(240,242,250,${0.25 + r[5] * 0.45})`;
        ctx.fillRect(x, y + Math.sin(t * 3 + r[4] * 9) * 3, 6 + r[3] * 16, 1.2);
      }, 160, 6);
    },
  };
}
function quartzTree(g, R, x, base, s) {
  const lit = '#f4f6fb', sh = '#a6adc2', line = '#545c78';
  const seg = (x0, y0, ang, len, w, depth) => {
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len, w1 = w * 0.62;
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    // 棱面:亮面 + 暗面
    g.fillStyle = lit; g.strokeStyle = line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0 + nx * w, y0 + ny * w); g.lineTo(x1 + nx * w1, y1 + ny * w1); g.lineTo(x1 - nx * w1, y1 - ny * w1); g.lineTo(x0 - nx * w, y0 - ny * w); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = sh; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1 - nx * w1, y1 - ny * w1); g.lineTo(x0 - nx * w, y0 - ny * w); g.closePath(); g.fill();
    if (depth <= 0 || len < 8) {
      g.fillStyle = lit; g.beginPath(); g.moveTo(x1 + nx * w1, y1 + ny * w1); g.lineTo(x1 + Math.cos(ang) * w1 * 3, y1 + Math.sin(ang) * w1 * 3); g.lineTo(x1 - nx * w1, y1 - ny * w1); g.closePath(); g.fill(); g.stroke();
      return;
    }
    const n = depth > 2 ? 2 : 1 + (R() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = ang + (i === 0 ? -1 : 1) * (0.3 + R() * 0.5) + (R() - 0.5) * 0.2;
      seg(x1, y1, a, len * (0.62 + R() * 0.2), w1, depth - 1);
    }
  };
  g.save(); g.translate(x, base); g.scale(s, s);
  seg(0, 4, -Math.PI / 2 + (R() - 0.5) * 0.3, 110, 12, 4);
  g.restore();
}

// ====================================================================
// 场景 6:黄昏街 · 都市屋顶
// ====================================================================
function stTown(R) {
  const N = makeNoise(R);
  const glow = glowSprite('#ffcf8a');
  const items = [];
  const sun = { x: 880, y: -162, r: 50 };
  items.push({
    p: 0.03, res: 1, draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-480, '#221d46'], [-370, '#47305f'], [-270, '#9c4c6c'], [-200, '#e2775c'], [-150, '#ffb062'], [-110, '#ffd48a'], [80, '#ffe6b2']]);
      g.fillRect(L.x0, L.y0, L.w, L.h);
      g.drawImage(glow, sun.x - 300, sun.y - 300, 600, 600);
      g.fillStyle = '#fff3d2'; g.beginPath(); g.arc(sun.x, sun.y, sun.r, 0, TAU); g.fill();
      for (let i = 0; i < 16; i++) {
        const y = -470 + R() * 260, x = L.x0 + R() * L.w;
        stratus(g, R, x, y, 160 + R() * 240, 12 + R() * 12, y < -380 ? '#3a2a58' : '#6a3a62', y < -380 ? '#8a4a6c' : '#ff9a6a');
      }
    },
  });
  items.push({
    p: 0.15, res: 1.5, y0: -320, y1: -90, below: '#a05c74', draw(g, L) {
      g.fillStyle = '#b26878';
      let x = L.x0;
      while (x < L.x1) { const w = 20 + R() * 50, h = 30 + R() * 130; g.fillRect(x, -110 - h, w, h + 40); if (R() < 0.3) g.fillRect(x + w / 2 - 1, -110 - h - 20, 2, 20); x += w + R() * 6; }
      g.fillStyle = '#a05c74'; g.fillRect(L.x0, -120, L.w, 40);
      hazeOver(g, L, '#ffb98a', 0.15, '#c66a72', 0.3);
    },
  });
  const blink = [];
  items.push({
    p: 0.38, res: 2, y0: -470, y1: -50, below: '#3a2b4a', draw(g, L) {
      let x = L.x0 - 20;
      while (x < L.x1) {
        const w = 50 + R() * 100, h = 90 + R() * 290, top = -96 - h;
        const nearSun = Math.abs(x + w / 2 - sun.x) < 200;
        if (nearSun && h > 200) { x += 30; continue; }
        const body = R() < 0.5 ? '#3c2e50' : '#45344f';
        g.fillStyle = body; g.fillRect(x, top, w, h + 60);
        // 朝阳一侧的轮廓光
        const rimLeft = x + w / 2 > sun.x;
        g.fillStyle = 'rgba(240,130,100,0.65)'; g.fillRect(rimLeft ? x : x + w - 2.5, top, 2.5, h);
        g.fillStyle = 'rgba(255,160,120,0.5)'; g.fillRect(x, top, w, 2);
        // 窗
        const cols = Math.floor(w / 12), rows = Math.floor(h / 15);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const lit = R() < 0.28;
          g.fillStyle = lit ? (R() < 0.7 ? '#ffd27a' : '#fff0b8') : 'rgba(25,18,40,0.6)';
          g.fillRect(x + 4 + c * 12, top + 8 + r * 15, 6, 8);
        }
        if (R() < 0.45) {
          g.fillStyle = body; g.fillRect(x + w * 0.3, top - 12, w * 0.3, 12);
          g.strokeStyle = '#2a2038'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + w * 0.45, top - 12); g.lineTo(x + w * 0.45, top - 40); g.stroke();
          blink.push([x + w * 0.45, top - 40]);
        }
        x += w + R() * 10;
      }
    },
    anim(ctx, t) {
      for (let i = 0; i < blink.length; i++) {
        const on = Math.sin(t * 2.5 + i * 1.7) > 0.3;
        ctx.fillStyle = on ? '#ff4a3a' : '#5a2030';
        ctx.beginPath(); ctx.arc(blink[i][0], blink[i][1], on ? 2.4 : 1.6, 0, TAU); ctx.fill();
      }
    },
  });
  // 近处矮楼屋顶 + 水塔 + 电线杆
  items.push({
    p: 0.66, res: 2, y0: -420, y1: 20, below: '#2c2236', draw(g, L) {
      let x = L.x0 - 20; const roofs = [];
      while (x < L.x1) {
        const w = 120 + R() * 150, top = -110 - R() * 90;
        g.fillStyle = '#4a3a58'; g.fillRect(x, top, w, 160);
        g.fillStyle = '#5c4766'; g.fillRect(x - 2, top - 6, w + 4, 6);
        g.fillStyle = 'rgba(255,150,110,0.55)'; g.fillRect(x - 2, top - 6, w + 4, 1.6);
        g.fillStyle = 'rgba(20,14,30,0.45)'; g.fillRect(x + w * 0.85, top, w * 0.15, 160);
        for (let r = 0; r < 4; r++) for (let c = 0; c < Math.floor(w / 26); c++) {
          g.fillStyle = R() < 0.25 ? '#ffcf78' : '#2c2140'; g.fillRect(x + 10 + c * 26, top + 16 + r * 26, 12, 12);
        }
        roofs.push([x, w, top]);
        x += w + 8 + R() * 30;
      }
      // 空调外机、广告牌
      for (const [rx, w, top] of roofs) {
        if (R() < 0.5) { g.fillStyle = '#6a5a70'; g.fillRect(rx + w * 0.2, top - 20, 26, 14); g.strokeStyle = '#2a2034'; g.lineWidth = 1; g.strokeRect(rx + w * 0.2, top - 20, 26, 14); g.beginPath(); g.arc(rx + w * 0.2 + 9, top - 13, 4.5, 0, TAU); g.stroke(); }
        if (R() < 0.3) {
          const bx = rx + w * 0.5, bw = 70, bh = 34;
          g.strokeStyle = '#2a2034'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx + 10, top - 6); g.lineTo(bx + 10, top - 30); g.moveTo(bx + bw - 10, top - 6); g.lineTo(bx + bw - 10, top - 30); g.stroke();
          g.fillStyle = '#e8dccc'; g.fillRect(bx, top - 30 - bh, bw, bh);
          g.fillStyle = '#d0603e'; g.fillRect(bx + 6, top - 24 - bh, bw * 0.4, bh - 12);
          g.fillStyle = '#4a7aa0'; g.beginPath(); g.arc(bx + bw * 0.72, top - 30 - bh / 2, 9, 0, TAU); g.fill();
          g.strokeStyle = '#2a2034'; g.lineWidth = 1.2; g.strokeRect(bx, top - 30 - bh, bw, bh);
        }
      }
      // 水塔
      const tx = 1270, tb = -140;
      g.strokeStyle = '#2c2236'; g.lineWidth = 3;
      for (const dx of [-26, -9, 9, 26]) { g.beginPath(); g.moveTo(tx + dx, tb + 40); g.lineTo(tx + dx * 0.8, tb - 60); g.stroke(); }
      g.lineWidth = 1.5; g.beginPath(); g.moveTo(tx - 24, tb); g.lineTo(tx + 24, tb - 50); g.moveTo(tx + 24, tb); g.lineTo(tx - 24, tb - 50); g.stroke();
      g.fillStyle = '#5a4560'; g.fillRect(tx - 34, tb - 140, 68, 80);
      g.fillStyle = 'rgba(255,150,110,0.55)'; g.fillRect(tx - 34, tb - 140, 6, 80);
      g.strokeStyle = '#2a2034'; g.lineWidth = 1.2; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(tx - 34, tb - 140 + k * 20); g.lineTo(tx + 34, tb - 140 + k * 20); g.stroke(); }
      g.strokeRect(tx - 34, tb - 140, 68, 80);
      g.fillStyle = '#4a3852'; g.beginPath(); g.moveTo(tx - 38, tb - 140); g.lineTo(tx, tb - 168); g.lineTo(tx + 38, tb - 140); g.closePath(); g.fill(); g.stroke();
      // 电线杆与电线
      const px = [L.x0 + 60, 640, L.x1 - 140];
      for (const x0 of px) {
        g.fillStyle = '#2a2034'; g.fillRect(x0 - 4, -400, 8, 420);
        g.fillRect(x0 - 40, -380, 80, 5); g.fillRect(x0 - 30, -356, 60, 4);
        g.fillStyle = '#3a2e44'; g.fillRect(x0 + 6, -330, 16, 26); g.strokeStyle = '#1a1424'; g.lineWidth = 1; g.strokeRect(x0 + 6, -330, 16, 26);
      }
      g.strokeStyle = '#1e1828'; g.lineWidth = 1.2;
      for (let i = 0; i < px.length - 1; i++) for (const [dx, y, s] of [[-38, -378, 30], [38, -378, 26], [-28, -354, 36], [28, -354, 40]]) wire(g, px[i] + dx, y, px[i + 1] + dx, y, s);
      // 线上停着的乌鸦
      g.fillStyle = '#120c18';
      for (let k = 0; k < 4; k++) {
        const u = 0.25 + k * 0.13, a = px[0] - 28, b = px[1] - 28, xx = a + (b - a) * u, yy = -354 + 4 * 36 * u * (1 - u);
        g.beginPath(); g.ellipse(xx, yy - 6, 4, 6, 0.2, 0, TAU); g.fill(); g.beginPath(); g.arc(xx + 2, yy - 13, 3, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(xx - 2, yy - 2); g.lineTo(xx - 6, yy + 4); g.lineTo(xx, yy); g.fill();
      }
    },
  });
  items.push({
    floor: {
      top: -60, draw(g, F) {
        g.fillStyle = ygrad(g, F.y0, F.y1, [[-60, '#b59a92'], [0, '#a28c8c'], [236, '#7a6878']]);
        g.fillRect(F.x0, F.y0, F.w, F.h);
        // 污渍
        for (let i = 0; i < 160; i++) {
          const y = F.y0 + R() * F.h, X = -500 + R() * 2600, f = fanF(y), r = (10 + R() * 50) * f;
          g.fillStyle = rgba(R() < 0.6 ? '#6a5868' : '#c4aca0', 0.12); g.beginPath(); g.ellipse(fan(X, y), y, r, r * 0.3, 0, 0, TAU); g.fill();
        }
        // 接缝网格
        g.strokeStyle = 'rgba(70,55,70,0.45)'; g.lineWidth = 1.2;
        for (const y of rowsBetween(-60, 236, 6, 1.3).slice(1)) { g.beginPath(); g.moveTo(F.x0, y); g.lineTo(F.x1, y); g.stroke(); }
        for (let X = -600; X < 2300; X += 130) { g.beginPath(); g.moveTo(fan(X, -60), -60); g.lineTo(fan(X, 236), 236); g.stroke(); }
        g.strokeStyle = 'rgba(230,200,180,0.25)'; g.lineWidth = 0.8;
        for (let X = -600; X < 2300; X += 130) { g.beginPath(); g.moveTo(fan(X + 2, -60), -60); g.lineTo(fan(X + 2, 236), 236); g.stroke(); }
        // 栏杆投影(夕阳在后方,影子朝向观者)
        for (let X = -600; X < 2300; X += 60) {
          const gr = g.createLinearGradient(0, -58, 0, 20); gr.addColorStop(0, 'rgba(50,30,60,0.2)'); gr.addColorStop(1, 'rgba(50,30,60,0)');
          g.fillStyle = gr; g.beginPath(); g.moveTo(fan(X, -58), -58); g.lineTo(fan(X + 4, -58), -58); g.lineTo(fan(X - 4, 20), 20); g.lineTo(fan(X - 10, 20), 20); g.fill();
        }
        g.fillStyle = 'rgba(50,30,60,0.18)'; g.beginPath(); fanQuad(g, -600, 2300, -58, -46); g.fill();
        // 排水口与裂缝
        for (let i = 0; i < 3; i++) { const X = 200 + i * 600 + R() * 100, y = 120 + R() * 60; g.fillStyle = '#4a3e4a'; g.beginPath(); fanQuad(g, X, X + 40, y, y + 14); g.fill(); g.strokeStyle = '#2a2230'; g.lineWidth = 1; for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(fan(X + k * 6.6, y), y); g.lineTo(fan(X + k * 6.6, y + 14), y + 14); g.stroke(); } }
        g.strokeStyle = 'rgba(50,38,52,0.5)'; g.lineWidth = 1;
        for (let i = 0; i < 16; i++) { let X = -300 + R() * 2200, y = -50 + R() * 250; g.beginPath(); g.moveTo(fan(X, y), y); for (let k = 0; k < 5; k++) { X += (R() - 0.5) * 50; y += (R() - 0.3) * 12; g.lineTo(fan(X, y), y); } g.stroke(); }
        floorShade(g, F, 0.25, '#20142a');
      },
    },
  });
  // 楼顶栏杆(地面远沿)
  items.push({
    edge: -58, res: 2, y0: -60, y1: 4, draw(g, L) {
      g.fillStyle = '#6a5a68'; g.fillRect(L.x0, -8, L.w, 9);
      g.fillStyle = '#c99080'; g.fillRect(L.x0, -8, L.w, 1.5);
      for (let X = L.x0; X < L.x1; X += 60) { g.fillStyle = '#4a3e52'; g.fillRect(X, -50, 4, 44); g.fillStyle = '#d59a80'; g.fillRect(X, -50, 1.2, 44); }
      for (let X = L.x0; X < L.x1; X += 12) { g.fillStyle = 'rgba(60,48,70,0.9)'; g.fillRect(X, -46, 1.6, 38); }
      for (const y of [-52, -28]) { g.fillStyle = '#54465e'; g.fillRect(L.x0, y, L.w, 4); g.fillStyle = '#e4a684'; g.fillRect(L.x0, y, L.w, 1.3); }
    },
  });
  // 乌鸦飞过
  const crows = [0, 1, 2].map(i => ({ off: R() * 30, y: -330 + R() * 120, sp: 50 + R() * 30, p: 0.5 + i * 0.12 }));
  items.push({
    fn(ctx, cam, t) {
      for (const c of crows) {
        const rg = parRange(c.p), span = rg.x1 - rg.x0 + 600;
        const lx = wrap(rg.x0 - 300 + (t + c.off) * c.sp, rg.x0 - 300, span);
        const sx = psx(cam, c.p, lx), sy = psy(cam, c.p, c.y + Math.sin(t * 0.8 + c.off) * 14), s = (1 + (cam.zoom - 1) * c.p) * (0.7 + c.p * 0.5);
        crow(ctx, sx, sy, s, t * 8 + c.off);
      }
    },
  });
  const motes = mkParticles(R, 16);
  return {
    floor: 'concrete', dust: '#a8948e', items,
    front(ctx, cam, t) {
      drawParticles(ctx, cam, t, 1.05, motes, (ctx, x, y, r, t) => {
        ctx.fillStyle = `rgba(255,210,150,${0.2 + 0.3 * Math.sin(t + r[4] * 6) ** 2})`;
        ctx.beginPath(); ctx.arc(x, y, 1 + r[5] * 1.5, 0, TAU); ctx.fill();
      }, 8, -4);
    },
  };
}
function crow(ctx, x, y, s, ph) {
  const up = Math.sin(ph);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#120c18';
  ctx.beginPath(); ctx.moveTo(-14, -up * 7); ctx.quadraticCurveTo(-6, -3 - up * 2, 0, 0); ctx.quadraticCurveTo(6, -3 - up * 2, 14, -up * 7);
  ctx.quadraticCurveTo(6, 1, 0, 3); ctx.quadraticCurveTo(-6, 1, -14, -up * 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(1, 1.5, 4.5, 2.2, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// ====================================================================
// 场景 7:试炼场
// ====================================================================
function stArena(R) {
  const N = makeNoise(R);
  const beam = beamSprite('#fff2cc');
  const fireG = glowSprite('#ff9a3a');
  const items = [];
  items.push({
    p: 0.03, res: 1, draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-480, '#9fc4e0'], [-300, '#d6e6ee'], [80, '#f2ead6']]);
      g.fillRect(L.x0, L.y0, L.w, L.h);
      for (let i = 0; i < 6; i++) cumulus(g, R, L.x0 + R() * L.w, -380 + R() * 60, 140 + R() * 100, 50 + R() * 30, { sh: '#cfdbe6', body: '#f6f8fa', hi: '#ffffff' });
    },
  });
  const wins = [];
  // 远壁:巨石墙 + 高窗 + 顶部梁架
  items.push({
    p: 0.28, res: 1.5, y0: -560, y1: -60, below: '#6e6458', draw(g, L) {
      const top = -470, base = -90;
      g.fillStyle = ygrad(g, top, base, [[top, '#6e6358'], [base, '#8c7f6c']]); g.fillRect(L.x0, top, L.w, base - top + 40);
      // 石块砌纹
      g.strokeStyle = 'rgba(50,42,36,0.35)'; g.lineWidth = 1;
      for (let y = top, r = 0; y < base; y += 22, r++) {
        g.beginPath(); g.moveTo(L.x0, y); g.lineTo(L.x1, y); g.stroke();
        for (let x = L.x0 + (r % 2) * 24; x < L.x1; x += 48 + R() * 10) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 22); g.stroke(); }
      }
      // 高窗
      for (let x = L.x0 + 90; x < L.x1 - 40; x += 170) {
        const w = 56, y0 = -440, y1 = -290; wins.push(x);
        g.fillStyle = '#4a4038'; g.fillRect(x - w / 2 - 8, y0 - 8, w + 16, y1 - y0 + 16);
        const gw = g.createLinearGradient(0, y0, 0, y1); gw.addColorStop(0, '#fffbe8'); gw.addColorStop(1, '#f6dca2');
        g.fillStyle = gw; g.beginPath(); g.moveTo(x - w / 2, y1); g.lineTo(x - w / 2, y0 + w / 2); g.arc(x, y0 + w / 2, w / 2, Math.PI, TAU); g.lineTo(x + w / 2, y1); g.closePath(); g.fill();
        g.strokeStyle = '#3a3029'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.moveTo(x - w / 2, y0 + 70); g.lineTo(x + w / 2, y0 + 70); g.stroke();
      }
      // 梁架
      g.fillStyle = '#3c2f26'; g.fillRect(L.x0, -560, L.w, 70);
      g.fillStyle = '#5a4636'; g.fillRect(L.x0, -496, L.w, 10);
      for (let x = L.x0; x < L.x1; x += 85) { g.fillStyle = '#4a392c'; g.fillRect(x, -560, 14, 80); }
      // 中央纹章
      g.fillStyle = '#5e5348'; g.beginPath(); g.arc(800, -230, 54, 0, TAU); g.fill();
      g.strokeStyle = '#a89878'; g.lineWidth = 3; g.beginPath(); g.arc(800, -230, 46, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(800, -270); g.lineTo(830, -214); g.lineTo(770, -214); g.closePath(); g.stroke();
      g.beginPath(); g.arc(800, -232, 10, 0, TAU); g.stroke();
      hazeOver(g, L, '#f6e6c0', 0.12, '#d8c8a8', 0.18);
    },
  });
  // 看台
  items.push({
    p: 0.44, res: 2, y0: -270, y1: -40, below: '#7a6c5c', draw(g, L) {
      const tiers = [[-250, -214], [-214, -176], [-176, -136], [-136, -96]];
      tiers.forEach(([a, b], i) => {
        g.fillStyle = mix('#a49580', '#7d705f', i * 0.15); g.fillRect(L.x0, a, L.w, b - a);
        g.fillStyle = mix('#c5b7a0', '#a49580', i * 0.2); g.fillRect(L.x0, a, L.w, 5);
        g.fillStyle = 'rgba(40,32,26,0.35)'; g.fillRect(L.x0, b - 5, L.w, 5);
        g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 1;
        for (let x = L.x0 + R() * 40; x < L.x1; x += 60 + R() * 20) { g.beginPath(); g.moveTo(x, a + 5); g.lineTo(x, b - 5); g.stroke(); }
      });
      // 通道台阶
      for (let x = L.x0 + 120; x < L.x1; x += 260) {
        g.fillStyle = '#8a7c68'; g.fillRect(x, -250, 30, 154);
        g.strokeStyle = 'rgba(50,40,32,0.5)'; for (let y = -250; y < -96; y += 8) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y); g.stroke(); }
      }
      // 观礼台
      g.fillStyle = '#6a5a4a'; g.fillRect(700, -300, 200, 60);
      g.fillStyle = '#3a3029'; g.fillRect(714, -292, 172, 44);
      g.fillStyle = '#8c3a32'; g.fillRect(690, -246, 220, 14);
      g.fillStyle = '#b0503f'; g.fillRect(690, -246, 220, 3);
      for (const x of [720, 760, 800, 840, 880]) { g.fillStyle = '#c49a4a'; g.beginPath(); g.arc(x, -239, 3, 0, TAU); g.fill(); }
      g.fillStyle = '#4a3c30'; g.beginPath(); g.moveTo(690, -300); g.lineTo(910, -300); g.lineTo(898, -318); g.lineTo(702, -318); g.closePath(); g.fill();
      // 看台前护墙
      g.fillStyle = '#8f8270'; g.fillRect(L.x0, -100, L.w, 60);
      g.fillStyle = '#b4a690'; g.fillRect(L.x0, -100, L.w, 4);
      // 垂幕
      for (let x = L.x0 + 60; x < L.x1; x += 200) {
        g.fillStyle = R() < 0.5 ? '#7a2e2a' : '#2e4a6a'; g.beginPath(); g.moveTo(x, -98); g.lineTo(x + 40, -98); g.lineTo(x + 40, -50); g.lineTo(x + 20, -58); g.lineTo(x, -50); g.closePath(); g.fill();
        g.strokeStyle = '#d8b25a'; g.lineWidth = 1.5; g.beginPath(); g.arc(x + 20, -80, 7, 0, TAU); g.stroke();
      }
    },
  });
  // 两侧合十巨手石雕 + 立柱
  items.push({
    p: 0.6, res: 2, y0: -520, y1: 0, below: '#7a6c5c', draw(g, L) {
      prayerHands(g, 330, -86, 1, R);
      prayerHands(g, 1270, -86, -1, R);
    },
  });
  items.push({
    floor: {
      top: -82, draw(g, F) {
        g.fillStyle = '#a69882'; g.fillRect(F.x0, F.y0, F.w, F.h);
        tileFloor(g, R, {
          rows: rowsBetween(-82, 236, 7, 1.22), tw: 110, gap: 1.6,
          color: (R) => mix('#bfb29b', '#a29480', R()), hiTop: 'rgba(240,228,200,0.6)',
          after(g, R, X, w, ya, yb) {
            if (R() < 0.3) { g.strokeStyle = 'rgba(70,58,44,0.55)'; g.lineWidth = 0.8; g.beginPath(); let xx = X + w * R(), yy = ya + 2; g.moveTo(fan(xx, yy), yy); for (let k = 0; k < 4; k++) { xx += (R() - 0.5) * 30; yy += (yb - ya) / 4; g.lineTo(fan(xx, yy), yy); } g.stroke(); }
            if (R() < 0.2) { g.fillStyle = 'rgba(80,66,50,0.15)'; g.beginPath(); fanQuad(g, X + 6, X + w - 6, ya + 3, yb - 3); g.fill(); }
          },
        });
        // 中央对战场界线
        g.strokeStyle = 'rgba(120,40,34,0.55)'; g.lineWidth = 4;
        for (const y of [-40, 70]) { g.beginPath(); g.moveTo(F.x0, y); g.lineTo(F.x1, y); g.stroke(); }
        // 高窗光斑
        for (let i = 0; i < 6; i++) {
          const X = 150 + i * 280, y = -40 + (i % 2) * 40;
          g.fillStyle = 'rgba(255,240,200,0.14)'; g.beginPath(); fanQuad(g, X, X + 70, y, y + 60); g.fill();
        }
        floorShade(g, F, 0.25, '#2a2018');
      },
    },
  });
  // 火把(地面远沿)
  const torchX = [240, 620, 980, 1360];
  items.push({
    edge: -80, res: 2, y0: -140, y1: 4, draw(g) {
      for (const X of torchX) {
        g.fillStyle = '#3a2e26'; g.fillRect(X - 3, -104, 6, 106);
        g.fillStyle = '#5a4a3a'; g.fillRect(X - 8, -6, 16, 7);
        g.fillStyle = '#2e241e'; g.beginPath(); g.moveTo(X - 15, -112); g.lineTo(X + 15, -112); g.lineTo(X + 9, -100); g.lineTo(X - 9, -100); g.closePath(); g.fill();
        g.fillStyle = '#8a6a3a'; g.fillRect(X - 15, -113, 30, 2);
      }
    },
    anim(ctx, t) {
      for (let i = 0; i < torchX.length; i++) {
        const X = torchX[i], fl = Math.sin(t * 11 + i * 2) * 0.12 + Math.sin(t * 17 + i) * 0.08;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + fl; ctx.drawImage(fireG, X - 70, -190, 140, 140);
        ctx.restore();
        flame(ctx, X, -112, 1 + fl, t * 9 + i);
      }
    },
  });
  // 高窗光柱
  items.push({
    fn(ctx, cam, t) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const s = 1 + (cam.zoom - 1) * 0.28;
      for (let i = 0; i < wins.length; i++) {
        if (i % 2) continue;
        const x = psx(cam, 0.28, wins[i]), top = psy(cam, 0.28, -400), bot = wsy(cam, 60);
        ctx.globalAlpha = 0.2 + 0.05 * Math.sin(t * 0.5 + i);
        ctx.save(); ctx.transform(90 * s / 64, 0, 0.35 * (bot - top) / 256, (bot - top) / 256, x, top); ctx.drawImage(beam, -32, 0); ctx.restore();
      }
      ctx.restore();
    },
  });
  const dust = mkParticles(R, 30);
  return {
    floor: 'stone', dust: '#b5a78e', items,
    front(ctx, cam, t) {
      drawParticles(ctx, cam, t, 1.0, dust, (ctx, x, y, r, t) => {
        ctx.fillStyle = `rgba(255,236,200,${0.15 + 0.35 * Math.sin(t * 0.8 + r[4] * 6) ** 2})`;
        ctx.fillRect(x + Math.sin(t * 0.6 + r[3] * 9) * 10, y, 1.6, 1.6);
      }, 4, -6);
    },
  };
}
function flame(ctx, x, y, k, ph) {
  const layers = [['#e2501e', 15, 34], ['#ff9a2a', 11, 26], ['#ffe08a', 6, 16]];
  for (let i = 0; i < layers.length; i++) {
    const [c, w, h] = layers[i], hh = h * k * (1 + Math.sin(ph + i) * 0.1), sw = Math.sin(ph * 1.3 + i) * 3;
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - w * 0.6, y);
    ctx.quadraticCurveTo(x - w * 0.7, y - hh * 0.45, x + sw, y - hh);
    ctx.quadraticCurveTo(x + w * 0.7, y - hh * 0.45, x + w * 0.6, y); ctx.closePath(); ctx.fill();
  }
}
// 原创合十巨手:双掌相合,手腕缠绳
function prayerHands(g, cx, base, dir, R) {
  g.save(); g.translate(cx, base); g.scale(dir, 1);
  const lit = g.createLinearGradient(-90, 0, 90, 0);
  lit.addColorStop(0, '#6a5f52'); lit.addColorStop(0.45, '#a89a84'); lit.addColorStop(0.55, '#b9ab94'); lit.addColorStop(1, '#7a6e60');
  const line = '#3a322a';
  g.lineWidth = 1.8; g.strokeStyle = line;
  // 基座
  g.fillStyle = '#8a7e6c'; g.fillRect(-100, -40, 200, 40); g.strokeRect(-100, -40, 200, 40);
  g.fillStyle = '#9d907c'; g.fillRect(-110, -58, 220, 18); g.strokeRect(-110, -58, 220, 18);
  // 前臂
  g.fillStyle = lit;
  g.beginPath(); g.moveTo(-78, -58); g.lineTo(-62, -200); g.lineTo(62, -200); g.lineTo(78, -58); g.closePath(); g.fill(); g.stroke();
  // 双掌:每只手四指成柱,中指最高,指尖圆润
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + r); g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, Math.PI * 1.5, TAU); g.lineTo(x + w, y + h); g.closePath(); };
  // 掌背
  g.beginPath(); g.moveTo(-64, -200); g.quadraticCurveTo(-74, -260, -60, -318); g.lineTo(60, -318); g.quadraticCurveTo(74, -260, 64, -200); g.closePath(); g.fill(); g.stroke();
  const fingers = [[1, -446, 17], [18, -432, 16], [34, -414, 15], [49, -386, 13]];
  for (const s of [-1, 1]) {
    for (let i = fingers.length - 1; i >= 0; i--) {
      const [x, top, w] = fingers[i], fx = s > 0 ? x : -x - w;
      rr(fx, top, w, -300 - top, w / 2); g.fill(); g.stroke();
      // 指节褶
      const k1 = top + (-300 - top) * 0.33, k2 = top + (-300 - top) * 0.62;
      g.beginPath(); g.moveTo(fx + 3, k1); g.quadraticCurveTo(fx + w / 2, k1 + 3, fx + w - 3, k1); g.moveTo(fx + 3, k2); g.quadraticCurveTo(fx + w / 2, k2 + 3, fx + w - 3, k2); g.stroke();
    }
  }
  // 拇指:前方相抵
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 2, -332); g.quadraticCurveTo(s * 26, -330, s * 30, -292); g.quadraticCurveTo(s * 32, -250, s * 14, -238); g.lineTo(s * 2, -240); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(s * 6, -326); g.quadraticCurveTo(s * 16, -322, s * 18, -312); g.stroke();
  }
  g.beginPath(); g.moveTo(0, -446); g.lineTo(0, -332); g.stroke();
  // 手腕注连绳
  g.fillStyle = '#c9b48a'; g.strokeStyle = '#6a5636'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-70, -206); g.quadraticCurveTo(0, -186, 70, -206); g.lineTo(70, -194); g.quadraticCurveTo(0, -174, -70, -194); g.closePath(); g.fill(); g.stroke();
  for (let k = -60; k <= 60; k += 12) { g.beginPath(); g.moveTo(k, -200 + Math.abs(k) * 0.12 + 6); g.lineTo(k + 6, -190 + Math.abs(k) * 0.12 + 6); g.stroke(); }
  for (const k of [-36, 0, 36]) {
    g.fillStyle = '#f4f0e4'; g.beginPath(); g.moveTo(k - 5, -180); g.lineTo(k + 5, -180); g.lineTo(k + 2, -166); g.lineTo(k + 6, -166); g.lineTo(k + 1, -150); g.lineTo(k - 5, -150); g.closePath(); g.fill(); g.strokeStyle = '#8a826c'; g.stroke();
  }
  // 风化
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(60,50,40,${0.05 + R() * 0.1})`; g.beginPath(); g.ellipse(-80 + R() * 160, -440 + R() * 400, 3 + R() * 9, 2 + R() * 6, 0, 0, TAU); g.fill(); }
  g.restore();
}

// ====================================================================
// 场景 8:双刑之丘 · 决战
// ====================================================================
function stHill(R) {
  const N = makeNoise(R);
  const items = [];
  items.push({
    p: 0.03, res: 1, draw(g, L) {
      g.fillStyle = ygrad(g, L.y0, L.y1, [[-480, '#140a1e'], [-360, '#33163a'], [-260, '#682646'], [-190, '#a4425a'], [-130, '#cf7466'], [80, '#e39c7c']]);
      g.fillRect(L.x0, L.y0, L.w, L.h);
      // 厚重云团
      for (let i = 0; i < 12; i++) {
        const y = -470 + R() * 200;
        stratus(g, R, L.x0 + R() * L.w, y, 200 + R() * 260, 26 + R() * 24, '#1e0e26', y < -380 ? '#5a2240' : '#a0405a');
      }
    },
    anim(ctx, t) { lightning(ctx, t, R.seedBolt); },
  });
  // 云海 + 远峰
  items.push({
    p: 0.14, res: 1.5, y0: -330, y1: -80, below: '#8a4862', draw(g, L) {
      g.fillStyle = '#3a1e36';
      for (const [x, w, h] of [[360, 50, 170], [430, 30, 110], [1180, 60, 190], [1250, 34, 120], [900, 26, 90]]) {
        g.beginPath(); g.moveTo(x - w, -150); g.lineTo(x - w * 0.2, -150 - h); g.lineTo(x + w * 0.1, -150 - h * 0.92); g.lineTo(x + w, -150); g.fill();
        g.fillStyle = 'rgba(230,120,120,0.5)'; g.beginPath(); g.moveTo(x - w * 0.2, -150 - h); g.lineTo(x - w * 0.1, -150); g.lineTo(x - w * 0.4, -150); g.fill(); g.fillStyle = '#3a1e36';
      }
      for (let row = 0; row < 3; row++) {
        const base = -150 + row * 24;
        const c = [['#c47884', '#e2a09e', '#9a5068'], ['#ad6478', '#cf8a92', '#8a4862'], ['#965468', '#bb7480', '#7a3e58']][row];
        const pts = []; for (let x = L.x0 - 60; x < L.x1 + 60; x += 50 + R() * 70) pts.push([x, base - R() * 10, 26 + R() * 30]);
        const blob = (dx, dy, k) => { g.beginPath(); for (const [x, y, r] of pts) { g.moveTo(x + dx * r + r * 1.9 * k, y + dy * r); g.ellipse(x + dx * r, y + dy * r, r * 1.9 * k, r * 0.75 * k, 0, 0, TAU); } };
        g.fillStyle = c[2]; blob(0, 0, 1); g.rect(L.x0 - 40, base, L.w + 80, 200); g.fill();
        g.fillStyle = c[0]; blob(-0.1, -0.12, 0.85); g.fill();
        g.fillStyle = c[1]; blob(-0.35, -0.35, 0.42); g.fill();
      }
    },
  });
  // 远崖与处刑台
  items.push({
    p: 0.3, res: 2, y0: -560, y1: -60, below: '#5a2c46', draw(g, L) {
      // 远崖
      g.fillStyle = '#3e2238';
      g.beginPath(); g.moveTo(780, -60);
      for (let y = -60; y >= -190; y -= 10) g.lineTo(800 + N(y * 0.05) * 30 - (y + 190) * 0.1, y);
      for (let x = 820; x <= 1260; x += 10) g.lineTo(x, -196 + N(x * 0.04 + 9) * 10);
      for (let y = -190; y <= -60; y += 10) g.lineTo(1280 - N(y * 0.05 + 3) * 30 + (y + 190) * 0.12, y);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(230,130,120,0.6)'; g.lineWidth = 1.6; g.beginPath(); for (let x = 820; x <= 1260; x += 10) g.lineTo(x, -196 + N(x * 0.04 + 9) * 10); g.stroke();
      // 处刑台:两根巨柱 + 出头横梁(门架式)+ 底部斜撑,中间悬巨戟
      const cx = 1040, base = -192, wood = '#2a1622', woodLit = '#4a2a36', rim = '#e07a74';
      const post = (x0, y0, x1, y1, w) => {
        const nx = (y1 - y0), ny = -(x1 - x0), l = Math.hypot(nx, ny), ox = nx / l * w / 2, oy = ny / l * w / 2;
        g.fillStyle = wood; g.beginPath(); g.moveTo(x0 - ox, y0 - oy); g.lineTo(x1 - ox, y1 - oy); g.lineTo(x1 + ox, y1 + oy); g.lineTo(x0 + ox, y0 + oy); g.closePath(); g.fill();
        g.strokeStyle = rim; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x0 - ox, y0 - oy); g.lineTo(x1 - ox, y1 - oy); g.stroke();
      };
      // 台座(石阶)
      g.fillStyle = '#3a2232'; g.fillRect(cx - 150, base - 18, 300, 22); g.fillStyle = '#4a2c3e'; g.fillRect(cx - 120, base - 34, 240, 18);
      g.fillStyle = rim; g.fillRect(cx - 150, base - 18, 300, 1.2); g.fillRect(cx - 120, base - 34, 240, 1.2);
      post(cx - 132, base - 34, cx - 92, -300, 9); post(cx + 132, base - 34, cx + 92, -300, 9);
      post(cx - 96, base - 34, cx - 90, -470, 20); post(cx + 96, base - 34, cx + 90, -470, 20);
      // 横梁(两端上翘出头)
      for (const [y, h, ext] of [[-470, 16, 46], [-432, 10, 30]]) {
        g.fillStyle = wood; g.beginPath(); g.moveTo(cx - 100 - ext, y + h); g.lineTo(cx - 100 - ext - 6, y - 4); g.quadraticCurveTo(cx, y + 4, cx + 100 + ext + 6, y - 4); g.lineTo(cx + 100 + ext, y + h); g.closePath(); g.fill();
        g.strokeStyle = rim; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - 100 - ext - 6, y - 4); g.quadraticCurveTo(cx, y + 4, cx + 100 + ext + 6, y - 4); g.stroke();
      }
      g.fillStyle = woodLit; g.fillRect(cx - 10, -456, 20, 26);
      // 绳索
      g.strokeStyle = '#7a5048'; g.lineWidth = 1.6;
      for (const dx of [-70, 70]) wire(g, cx + dx, -424, cx, -400, 10);
      // 巨戟
      g.fillStyle = '#3a2430'; g.fillRect(cx - 5, -404, 10, 200);
      g.fillStyle = rim; g.fillRect(cx - 5, -404, 1.6, 200);
      g.fillStyle = '#c99a5a'; for (const y of [-404, -330, -214]) g.fillRect(cx - 7, y, 14, 6);
      const blade = '#e6d8dc', bladeSh = '#9a8490', bl = '#2a1622';
      g.lineWidth = 1.4; g.strokeStyle = bl;
      g.fillStyle = blade; g.beginPath(); g.moveTo(cx, -404); g.lineTo(cx + 13, -416); g.lineTo(cx + 9, -468); g.lineTo(cx, -510); g.lineTo(cx - 9, -468); g.lineTo(cx - 13, -416); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = bladeSh; g.beginPath(); g.moveTo(cx, -404); g.lineTo(cx + 13, -416); g.lineTo(cx + 9, -468); g.lineTo(cx, -510); g.closePath(); g.fill();
      for (const sd of [-1, 1]) {
        g.fillStyle = blade; g.beginPath(); g.moveTo(cx + sd * 10, -428); g.quadraticCurveTo(cx + sd * 58, -432, cx + sd * 66, -476); g.quadraticCurveTo(cx + sd * 56, -446, cx + sd * 12, -414); g.closePath(); g.fill(); g.stroke();
      }
      g.fillStyle = '#c99a5a'; g.beginPath(); g.arc(cx, -410, 9, 0, TAU); g.fill(); g.stroke();
      // 戟缨
      g.fillStyle = '#b02a3a'; g.beginPath(); g.moveTo(cx - 4, -400); g.quadraticCurveTo(cx - 22, -370, cx - 14, -330); g.lineTo(cx - 2, -356); g.lineTo(cx + 4, -334); g.quadraticCurveTo(cx + 10, -370, cx + 4, -400); g.closePath(); g.fill();
      // 崖脚云团遮掩
      g.fillStyle = '#9a5068'; g.beginPath();
      for (let x = 740; x < 1340; x += 40) { g.moveTo(x + 50, -78); g.ellipse(x, -82 - R() * 10, 50, 18, 0, 0, TAU); } g.fill();
      g.fillStyle = '#c47884'; g.beginPath();
      for (let x = 760; x < 1320; x += 55) { g.moveTo(x + 36, -92); g.ellipse(x, -92 - R() * 6, 36, 12, 0, 0, TAU); } g.fill();
      hazeOver(g, L, '#b04a64', 0.05, '#b04a64', 0.3, -560, -60);
    },
  });
  // 近景嶙峋岩石
  items.push({
    p: 0.62, res: 2, y0: -340, y1: 10, below: '#4a3644', draw(g, L) {
      g.fillStyle = ygrad(g, -100, 10, [[-100, '#5e4a58'], [10, '#4e3c4c']]); g.fillRect(L.x0, -96, L.w, 110);
      const crag = (x, w, h) => {
        const pts = [[x - w / 2, -86]]; const n = 7;
        for (let i = 1; i < n; i++) { const u = i / n; pts.push([x - w / 2 + w * u + (R() - 0.5) * w * 0.1, -86 - h * Math.sin(Math.PI * u) * (0.6 + R() * 0.5)]); }
        pts.push([x + w / 2, -86]);
        g.fillStyle = '#3a2836'; g.strokeStyle = '#180e18'; g.lineWidth = 1.5;
        g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.fill(); g.stroke();
        // 受光面
        g.fillStyle = '#6a4656';
        for (let i = 1; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; if (by > ay) { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx - 8, -86); g.lineTo(ax - 6, -86); g.closePath(); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; } }
        g.strokeStyle = '#d07a76'; g.lineWidth = 1.4; g.beginPath(); pts.slice(0, Math.ceil(n / 2) + 1).forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
      };
      crag(L.x0 + 120, 260, 230); crag(L.x0 + 300, 160, 120); crag(L.x1 - 140, 280, 250); crag(L.x1 - 330, 150, 110); crag(640, 90, 40); crag(980, 120, 50);
      // 枯草
      g.strokeStyle = '#7a5a5a'; g.lineWidth = 1;
      for (let i = 0; i < 120; i++) { const x = L.x0 + R() * L.w, y = -86 + R() * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 6, y - 4 - R() * 8); g.stroke(); }
    },
  });
  items.push({
    floor: {
      top: -64, draw(g, F) {
        g.fillStyle = ygrad(g, F.y0, F.y1, [[-64, '#7e6674'], [0, '#6e5866'], [236, '#4c3a4a']]);
        g.fillRect(F.x0, F.y0, F.w, F.h);
        // 岩板(Voronoi 风格的多边形裂纹,扇形透视)
        const rows = rowsBetween(-64, 236, 7, 1.25);
        for (let r = 0; r < rows.length - 1; r++) {
          let X = -700 + R() * 80;
          while (X < 2300) {
            const w = 90 + R() * 110, ya = rows[r], yb = rows[r + 1], inset = 2.5;
            const jit = () => (R() - 0.5) * 12;
            const pts = [[X + inset + jit(), ya + inset], [X + w * 0.5 + jit(), ya + inset + R() * 3], [X + w - inset + jit(), ya + inset], [X + w - inset + jit(), yb - inset], [X + w * 0.5 + jit(), yb - inset - R() * 3], [X + inset + jit(), yb - inset]];
            g.fillStyle = mix('#8a7280', '#6a5462', R()); g.beginPath();
            pts.forEach(([px, py], i) => i ? g.lineTo(fan(px, py), py) : g.moveTo(fan(px, py), py)); g.closePath(); g.fill();
            g.strokeStyle = 'rgba(220,150,150,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(fan(pts[0][0], pts[0][1]), pts[0][1]); g.lineTo(fan(pts[1][0], pts[1][1]), pts[1][1]); g.lineTo(fan(pts[2][0], pts[2][1]), pts[2][1]); g.stroke();
            X += w;
          }
        }
        pebbles(g, R, 220, -50, 236, ['#3a2a36', '#8a7482'], 3.5);
        floorShade(g, F, 0.3, '#1a0e1a');
      },
    },
  });
  // 闪电照亮
  items.push({
    fn(ctx, cam, t) {
      const f = flashAmt(t);
      if (f > 0) { ctx.fillStyle = `rgba(230,200,255,${f * 0.22})`; ctx.fillRect(0, 0, 960, 540); }
    },
  });
  const embers = mkParticles(R, 28);
  return {
    floor: 'stone', dust: '#8a7682', items,
    front(ctx, cam, t) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      drawParticles(ctx, cam, t, 1.08, embers, (ctx, x, y, r, t) => {
        ctx.fillStyle = `rgba(255,${120 + r[5] * 80 | 0},90,${0.3 + 0.5 * Math.abs(Math.sin(t * 2 + r[4] * 7))})`;
        ctx.fillRect(x + Math.sin(t + r[3] * 9) * 12, y, 2, 2);
      }, 12, -22);
      ctx.restore();
    },
  };
}
// 闪电时间表:每个 6.2s 周期里有概率出现一次(确定性)
function boltAt(t) {
  const P = 6.2, k = Math.floor(t / P), r = mulberry(k * 7919 + 13);
  if (r() < 0.25) return null;
  const at = k * P + 1 + r() * 3.5, dt = t - at;
  if (dt < 0 || dt > 0.45) return null;
  return { k, dt, r };
}
function flashAmt(t) {
  const b = boltAt(t); if (!b) return 0;
  const d = b.dt;
  return d < 0.08 ? 1 : d < 0.14 ? 0.3 : d < 0.22 ? 0.8 : Math.max(0, 1 - (d - 0.22) / 0.23) * 0.5;
}
function lightning(ctx, t) {
  const b = boltAt(t); if (!b) return;
  const r = mulberry(b.k * 31 + 7), x0 = 380 + r() * 840, a = flashAmt(t);
  const pts = [[x0, -470]]; let x = x0, y = -470;
  while (y < -170) { x += (r() - 0.5) * 40; y += 14 + r() * 18; pts.push([x, y]); }
  ctx.save(); ctx.lineJoin = 'round';
  for (const [w, c] of [[7, `rgba(200,150,255,${0.3 * a})`], [2, `rgba(250,240,255,${a})`]]) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
  }
  // 分叉
  const j = 2 + Math.floor(r() * (pts.length - 4));
  ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(240,220,255,${a * 0.8})`; ctx.beginPath(); ctx.moveTo(pts[j][0], pts[j][1]);
  let bx = pts[j][0], by = pts[j][1]; for (let k = 0; k < 4; k++) { bx += 8 + r() * 16; by += 10 + r() * 12; ctx.lineTo(bx, by); }
  ctx.stroke(); ctx.restore();
}

// ====================================================================
// 组装与导出
// ====================================================================
const BUILDERS = {
  leaf_village: stLeaf, valley_end: stValley, death_forest: stForest, soul_court: stSoul,
  hueco_desert: stDesert, karakura_town: stTown, exam_arena: stArena, execution_hill: stHill,
};
const _cache = new Map();   // 最近使用的少量场景(LRU)

export function createStage(id) {
  if (!BUILDERS[id]) id = STAGES[0].id;
  if (_cache.has(id)) { const s = _cache.get(id); _cache.delete(id); _cache.set(id, s); return s; }
  const R = mulberry(hashStr(id));
  const def = BUILDERS[id](R);
  const items = def.items.map(it => {
    if (it.fn) return { type: 'fn', fn: it.fn };
    if (it.floor) return buildFloor(it.floor);
    return buildPar(it);
  });
  const meta = STAGES.find(s => s.id === id);
  const stage = {
    id, name: meta.name, sub: meta.sub, bgm: meta.bgm, width: STAGE_W,
    floor: def.floor, dustColor: def.dust,
    drawBack(ctx, cam, t) {
      for (const it of items) drawItem(ctx, cam, t, it);
    },
    drawFront(ctx, cam, t) {
      if (def.front) def.front(ctx, cam, t);
    },
  };
  _cache.set(id, stage);
  while (_cache.size > 2) _cache.delete(_cache.keys().next().value);
  return stage;
}

const _thumbs = new Map();
export function renderThumb(id, w, h) {
  const key = id + ':' + w + 'x' + h;
  if (_thumbs.has(key)) {
    const src = _thumbs.get(key), c = mkCanvas(w, h);
    c.getContext('2d').drawImage(src, 0, 0); return c;
  }
  const had = _cache.has(id);
  const st = createStage(id);
  const big = mkCanvas(960, 540), g = big.getContext('2d');
  const cam = { x: 800, y: -200, zoom: 0.85 };
  st.drawBack(g, cam, 1.5); st.drawFront(g, cam, 1.5);
  if (!had) _cache.delete(id);   // 缩略图不占用场景缓存
  // 逐级缩小,避免锯齿
  let src = big, sw = 960, sh = 540;
  while (sw / 2 >= w && sh / 2 >= h) {
    const half = mkCanvas(sw / 2, sh / 2), hg = half.getContext('2d');
    hg.imageSmoothingQuality = 'high'; hg.drawImage(src, 0, 0, sw / 2, sh / 2);
    src = half; sw /= 2; sh /= 2;
  }
  const out = mkCanvas(w, h), og = out.getContext('2d');
  og.imageSmoothingQuality = 'high'; og.drawImage(src, 0, 0, sw, sh, 0, 0, w, h);
  _thumbs.set(key, out);
  const c = mkCanvas(w, h); c.getContext('2d').drawImage(out, 0, 0);
  return c;
}
