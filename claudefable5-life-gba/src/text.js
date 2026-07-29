// text.js — 像素化中文文字渲染 + GBA 式窗口
// 物理画布 480×320 = 2× GBA 逻辑分辨率(240×160)。本模块一切坐标用"游戏像素"(240×160 空间),
// 内部 ×2 落到物理画布。中文先以小号字(默认 12px 宋体位图字形)画到暂存画布,
// 再关闭平滑 ×2 放大 blit —— 任何字体都会被强制像素化,得到 GBA 汉化卡带观感。

const FONT_STACK = '"Zpix","SimSun","MS Song","NSimSun",monospace';

const _measCanvas = document.createElement('canvas');
const _measCtx = _measCanvas.getContext('2d');

const _cache = new Map(); // key → {img, w, h}
const CACHE_MAX = 600;

function rasterize(str, size, color, outline) {
  const key = `${size}|${color}|${outline || ''}|${str}`;
  const hit = _cache.get(key);
  if (hit) return hit;

  _measCtx.font = `${size}px ${FONT_STACK}`;
  const pad = outline ? 1 : 0;
  const w = Math.ceil(_measCtx.measureText(str).width) + pad * 2 + 1;
  const h = size + 3 + pad * 2;

  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, w);
  tmp.height = h;
  const tc = tmp.getContext('2d');
  tc.font = `${size}px ${FONT_STACK}`;
  tc.textBaseline = 'top';
  if (outline) {
    tc.fillStyle = outline;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      tc.fillText(str, pad + ox, pad + 1 + oy);
    }
  }
  tc.fillStyle = color;
  tc.fillText(str, pad, pad + 1);

  // ×2 最近邻放大 → 强制像素化
  const out = document.createElement('canvas');
  out.width = tmp.width * 2;
  out.height = tmp.height * 2;
  const oc = out.getContext('2d');
  oc.imageSmoothingEnabled = false;
  oc.drawImage(tmp, 0, 0, out.width, out.height);

  const entry = { img: out, w: tmp.width, h: tmp.height };
  if (_cache.size > CACHE_MAX) _cache.clear();
  _cache.set(key, entry);
  return entry;
}

export function measureText(str, size = 12) {
  _measCtx.font = `${size}px ${FONT_STACK}`;
  return Math.ceil(_measCtx.measureText(str).width);
}

// 绘制像素文字。返回文字宽度(游戏像素)。
export function ptext(ctx, str, x, y, opt = {}) {
  if (!str) return 0;
  const { size = 12, color = '#f8f8f8', outline = null, align = 'left', alpha = 1 } = opt;
  const e = rasterize(String(str), size, color, outline);
  let dx = x;
  if (align === 'center') dx = x - Math.floor(e.w / 2);
  else if (align === 'right') dx = x - e.w;
  if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
  ctx.drawImage(e.img, Math.round(dx) * 2, Math.round(y) * 2);
  if (alpha < 1) ctx.restore();
  return e.w;
}

// CJK 逐字换行(混排英文数字按词元近似)。返回行数组。
export function wrapText(str, size, maxW) {
  const lines = [];
  let cur = '';
  for (const ch of String(str)) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    const test = cur + ch;
    if (measureText(test, size) > maxW && cur) { lines.push(cur); cur = ch; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

// GBA 式窗口:奶白底 + 深色描边 + 紫蓝内衬,右下 1px 阴影。坐标游戏像素。
export function drawWindow(ctx, x, y, w, h, opt = {}) {
  const { fill = '#f8f4e8', border = '#2e2e48', accent = '#8078d0', alpha = 1 } = opt;
  const X = x * 2, Y = y * 2, W = w * 2, H = h * 2;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  // 阴影
  ctx.fillStyle = 'rgba(10,10,26,0.45)';
  ctx.fillRect(X + 4, Y + 4, W, H);
  // 外框
  ctx.fillStyle = border;
  ctx.fillRect(X, Y, W, H);
  // 内衬
  ctx.fillStyle = accent;
  ctx.fillRect(X + 2, Y + 2, W - 4, H - 4);
  // 底
  ctx.fillStyle = fill;
  ctx.fillRect(X + 4, Y + 4, W - 8, H - 8);
  // 四角圆润化(抠掉外框四角 1px)
  ctx.clearRect ? null : null;
  ctx.restore();
}

// 深色面板(HUD 用):半透明夜蓝底 + 浅描边
export function drawPanel(ctx, x, y, w, h, opt = {}) {
  const { alpha = 0.82 } = opt;
  const X = x * 2, Y = y * 2, W = w * 2, H = h * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#161632';
  ctx.fillRect(X, Y, W, H);
  ctx.globalAlpha = Math.min(1, alpha + 0.1);
  ctx.strokeStyle = '#6b64b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(X + 1, Y + 1, W - 2, H - 2);
  ctx.restore();
}

// 小色块进度条(游戏像素)。value 0..1。
export function drawBar(ctx, x, y, w, h, value, colFull, opt = {}) {
  const { back = '#26264a', border = '#0e0e20', warn = true } = opt;
  const X = x * 2, Y = y * 2, W = w * 2, H = h * 2;
  const v = Math.max(0, Math.min(1, value));
  ctx.fillStyle = border;
  ctx.fillRect(X - 2, Y - 2, W + 4, H + 4);
  ctx.fillStyle = back;
  ctx.fillRect(X, Y, W, H);
  let col = colFull;
  if (warn) {
    if (v < 0.25) col = '#e04848';
    else if (v < 0.5) col = '#e8a030';
  }
  ctx.fillStyle = col;
  ctx.fillRect(X, Y, Math.round(W * v), H);
}
