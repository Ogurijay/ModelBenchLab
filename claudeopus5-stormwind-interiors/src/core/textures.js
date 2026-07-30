// 全部贴图在浏览器里用 Canvas2D 现画 —— 仓库规则:禁止外部二进制资产。
// 每张图都是"可平铺"的:边缘绘制做了环绕补画,repeat 后不出现接缝亮线。
import * as THREE from 'three';
import { mulberry32 } from './prng.js';

const cache = new Map();

function newCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const r = Array.isArray(repeat) ? repeat : [repeat, repeat];
  t.repeat.set(r[0], r[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** 环绕绘制:把超出边界的图形补画到对面,保证平铺无缝。 */
function wrapDraw(ctx, size, fn) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      ctx.save();
      ctx.translate(dx * size, dy * size);
      fn(ctx);
      ctx.restore();
    }
  }
}

/** 椒盐噪点,给平面加颗粒感。 */
function speckle(ctx, size, count, alpha, spread = 24, rnd = Math.random) {
  for (let i = 0; i < count; i++) {
    const g = Math.floor(rnd() * spread * 2 - spread);
    ctx.fillStyle = `rgba(${128 + g},${128 + g},${126 + g},${alpha})`;
    const s = 1 + rnd() * 2.4;
    ctx.fillRect(rnd() * size, rnd() * size, s, s);
  }
}

function hexShift(hex, d) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, d);
  return `#${c.getHexString()}`;
}

/* ------------------------------------------------------------------ *
 *  砌石 / 地面
 * ------------------------------------------------------------------ */

/** 方琢石墙:错缝砌筑 + 灰缝 + 风化斑。 */
function stoneWall(size = 512, base = '#9a978d', rows = 8, seed = 7) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = hexShift(base, -0.14);
  x.fillRect(0, 0, size, size);
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 4 + (r % 2);
    const cw = size / cols;
    const off = (r % 2) * cw * 0.5;
    for (let i = -1; i < cols + 1; i++) {
      const bx = i * cw + off + 1.6, by = r * rh + 1.6;
      const bw = cw - 3.2, bh = rh - 3.2;
      const l = (rnd() - 0.5) * 0.14;
      const col = new THREE.Color(base); col.offsetHSL((rnd() - 0.5) * 0.02, 0, l);
      x.fillStyle = `#${col.getHexString()}`;
      x.fillRect(bx, by, bw, bh);
      // 高光边 + 阴影边,做出倒角
      x.fillStyle = 'rgba(255,255,255,.13)';
      x.fillRect(bx, by, bw, 1.8);
      x.fillStyle = 'rgba(0,0,0,.20)';
      x.fillRect(bx, by + bh - 2.2, bw, 2.2);
      // 风化斑
      for (let k = 0; k < 5; k++) {
        x.fillStyle = `rgba(${60 + rnd() * 60},${60 + rnd() * 60},${55 + rnd() * 50},${0.05 + rnd() * 0.07})`;
        x.beginPath();
        x.ellipse(bx + rnd() * bw, by + rnd() * bh, 3 + rnd() * 10, 2 + rnd() * 7, rnd() * 3, 0, 6.283);
        x.fill();
      }
    }
  }
  speckle(x, size, size * 3, 0.06, 30, rnd);
  return c;
}

/** 鹅卵石路面。 */
function cobble(size = 512, seed = 11) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#3b3934';
  x.fillRect(0, 0, size, size);
  const n = 620;
  for (let i = 0; i < n; i++) {
    const px = rnd() * size, py = rnd() * size;
    const rx = 5 + rnd() * 7, ry = 4 + rnd() * 6;
    const g = 88 + rnd() * 62;
    wrapDraw(x, size, (ctx) => {
      ctx.fillStyle = `rgb(${g},${g - 3},${g - 10})`;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, rnd() * 3.14, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,18,16,.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
  }
  speckle(x, size, 2600, 0.08, 26, rnd);
  return c;
}

/** 石板铺装(广场/教堂地面)。 */
function flagstone(size = 512, base = '#b9b3a4', seed = 23) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#6d675c';
  x.fillRect(0, 0, size, size);
  const g = 4, cell = size / g;
  for (let i = 0; i < g; i++) {
    for (let j = 0; j < g; j++) {
      const col = new THREE.Color(base);
      col.offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.11);
      x.fillStyle = `#${col.getHexString()}`;
      x.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
      for (let k = 0; k < 8; k++) {
        x.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.04})`;
        x.beginPath();
        x.ellipse(i * cell + rnd() * cell, j * cell + rnd() * cell, 4 + rnd() * 14, 3 + rnd() * 9, rnd() * 3, 0, 6.283);
        x.fill();
      }
    }
  }
  speckle(x, size, 2000, 0.05, 22, rnd);
  return c;
}

/* ------------------------------------------------------------------ *
 *  抹灰 / 木材 / 屋瓦
 * ------------------------------------------------------------------ */

/** 灰泥墙(半木结构的填充面)。 */
function plaster(size = 256, base = '#ddd2b8', seed = 31) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    x.fillStyle = `rgba(${100 + rnd() * 90},${95 + rnd() * 80},${80 + rnd() * 70},${0.03 + rnd() * 0.05})`;
    x.beginPath();
    x.ellipse(rnd() * size, rnd() * size, 6 + rnd() * 26, 5 + rnd() * 20, rnd() * 3, 0, 6.283);
    x.fill();
  }
  // 裂纹
  x.strokeStyle = 'rgba(90,80,66,.20)';
  for (let i = 0; i < 7; i++) {
    x.lineWidth = 0.7 + rnd() * 0.8;
    x.beginPath();
    let px = rnd() * size, py = rnd() * size;
    x.moveTo(px, py);
    for (let s = 0; s < 6; s++) { px += (rnd() - 0.5) * 34; py += (rnd() - 0.5) * 34; x.lineTo(px, py); }
    x.stroke();
  }
  speckle(x, size, 900, 0.05, 20, rnd);
  return c;
}

/** 木板(可指定纹路方向)。 */
function planks(size = 256, base = '#7a5433', vertical = false, seed = 41) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = hexShift(base, -0.1);
  x.fillRect(0, 0, size, size);
  const n = 6, pw = size / n;
  x.save();
  if (vertical) { x.translate(size, 0); x.rotate(Math.PI / 2); }
  for (let i = 0; i < n; i++) {
    const col = new THREE.Color(base);
    col.offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.09);
    x.fillStyle = `#${col.getHexString()}`;
    x.fillRect(0, i * pw + 1, size, pw - 2);
    // 木纹
    x.strokeStyle = 'rgba(40,26,14,.20)';
    for (let k = 0; k < 9; k++) {
      x.lineWidth = 0.5 + rnd();
      x.beginPath();
      const y0 = i * pw + 2 + rnd() * (pw - 4);
      x.moveTo(0, y0);
      for (let s = 1; s <= 8; s++) x.lineTo((s / 8) * size, y0 + Math.sin(s * 1.7 + rnd() * 3) * 1.6);
      x.stroke();
    }
    // 木节
    if (rnd() < 0.55) {
      const kx = rnd() * size, ky = i * pw + pw * 0.5;
      x.strokeStyle = 'rgba(45,28,14,.4)';
      for (let r = 1.5; r < 6; r += 1.4) {
        x.lineWidth = 0.8; x.beginPath();
        x.ellipse(kx, ky, r * 1.6, r, 0, 0, 6.283); x.stroke();
      }
    }
    x.fillStyle = 'rgba(0,0,0,.28)';
    x.fillRect(0, i * pw + pw - 2, size, 2);
  }
  x.restore();
  speckle(x, size, 600, 0.04, 18, rnd);
  return c;
}

/** 石板瓦屋面 —— 王都标志性的青蓝色鱼鳞瓦。 */
function roofTiles(size = 256, base = '#3f6f9e', seed = 53) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = hexShift(base, -0.16);
  x.fillRect(0, 0, size, size);
  const rows = 7, rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 8, cw = size / cols;
    const off = (r % 2) * cw * 0.5;
    for (let i = -1; i <= cols; i++) {
      const bx = i * cw + off, by = r * rh;
      const col = new THREE.Color(base);
      col.offsetHSL((rnd() - 0.5) * 0.035, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.13);
      x.fillStyle = `#${col.getHexString()}`;
      x.beginPath();
      x.moveTo(bx + 1, by);
      x.lineTo(bx + cw - 1, by);
      x.lineTo(bx + cw - 1, by + rh * 0.62);
      x.quadraticCurveTo(bx + cw * 0.5, by + rh * 1.12, bx + 1, by + rh * 0.62);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(10,20,32,.45)';
      x.lineWidth = 1.1;
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,.09)';
      x.fillRect(bx + 1.5, by + 1, cw - 3, 1.6);
    }
  }
  speckle(x, size, 1100, 0.05, 20, rnd);
  return c;
}

/** 茅草 / 干草。 */
function thatch(size = 256, seed = 61) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#8a6f3c';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 2200; i++) {
    const px = rnd() * size, py = rnd() * size, len = 8 + rnd() * 20;
    x.strokeStyle = `rgba(${140 + rnd() * 70},${110 + rnd() * 60},${50 + rnd() * 40},${0.25 + rnd() * 0.4})`;
    x.lineWidth = 0.7 + rnd() * 1.2;
    wrapDraw(x, size, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (rnd() - 0.5) * 4, py + len);
      ctx.stroke();
    });
  }
  return c;
}

/** 草地。 */
function grass(size = 512, seed = 71) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#3f5a2c';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 340; i++) {
    x.fillStyle = `rgba(${40 + rnd() * 70},${70 + rnd() * 80},${28 + rnd() * 50},${0.22 + rnd() * 0.3})`;
    x.beginPath();
    x.ellipse(rnd() * size, rnd() * size, 16 + rnd() * 60, 12 + rnd() * 48, rnd() * 3, 0, 6.283);
    x.fill();
  }
  for (let i = 0; i < 5200; i++) {
    const px = rnd() * size, py = rnd() * size;
    x.strokeStyle = `rgba(${48 + rnd() * 80},${88 + rnd() * 85},${34 + rnd() * 45},${0.3 + rnd() * 0.5})`;
    x.lineWidth = 0.7 + rnd() * 0.9;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (rnd() - 0.5) * 5, py - 3 - rnd() * 7);
    x.stroke();
  }
  return c;
}

/** 泥土 / 沙地。 */
function dirt(size = 256, seed = 83) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.fillStyle = '#6b5a44';
  x.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i++) {
    x.fillStyle = `rgba(${90 + rnd() * 70},${74 + rnd() * 60},${52 + rnd() * 46},${0.1 + rnd() * 0.25})`;
    x.beginPath();
    x.ellipse(rnd() * size, rnd() * size, 4 + rnd() * 22, 3 + rnd() * 16, rnd() * 3, 0, 6.283);
    x.fill();
  }
  speckle(x, size, 2200, 0.09, 30, rnd);
  return c;
}

/* ------------------------------------------------------------------ *
 *  彩窗 / 旗帜 / 招牌 / 精灵
 * ------------------------------------------------------------------ */

/** 教堂彩色玻璃:铅条网格 + 尖拱构图 + 玫瑰窗。 */
function stainedGlass(size = 512, seed = 97, rose = false) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  const palette = ['#c8342e', '#2f5fb0', '#e0b23a', '#2e8a58', '#7a3fa0', '#d86a25', '#dcdcdc'];
  x.fillStyle = '#16202f';
  x.fillRect(0, 0, size, size);

  if (rose) {
    const cx = size / 2, cy = size / 2;
    const rings = 4;
    for (let r = rings; r >= 1; r--) {
      const rad = (r / rings) * size * 0.48;
      const seg = r * 6;
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * 6.283, a1 = ((s + 1) / seg) * 6.283;
        x.fillStyle = palette[Math.floor(rnd() * palette.length)];
        x.beginPath();
        x.moveTo(cx, cy);
        x.arc(cx, cy, rad, a0, a1);
        x.closePath();
        x.fill();
        x.strokeStyle = '#101722'; x.lineWidth = 3; x.stroke();
      }
    }
    x.fillStyle = '#f2e2a8';
    x.beginPath(); x.arc(cx, cy, size * 0.07, 0, 6.283); x.fill();
    x.strokeStyle = '#101722'; x.lineWidth = 4; x.stroke();
  } else {
    // 尖拱分格
    const cols = 3, rows = 6;
    const cw = size / cols, rh = size / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        x.fillStyle = palette[Math.floor(rnd() * palette.length)];
        x.beginPath();
        if (j === 0) {
          x.moveTo(i * cw + 3, rh);
          x.lineTo(i * cw + cw / 2, 4);
          x.lineTo(i * cw + cw - 3, rh);
        } else {
          x.rect(i * cw + 3, j * rh + 3, cw - 6, rh - 6);
        }
        x.closePath();
        x.fill();
        // 玻璃内部再切小块
        for (let k = 0; k < 3; k++) {
          x.fillStyle = palette[Math.floor(rnd() * palette.length)] + 'cc';
          x.fillRect(i * cw + 6 + rnd() * (cw - 24), j * rh + 6 + rnd() * (rh - 24), 8 + rnd() * 16, 8 + rnd() * 16);
        }
        x.strokeStyle = '#0e1520'; x.lineWidth = 4; x.stroke();
      }
    }
    // 中央圣像剪影
    x.fillStyle = 'rgba(245,228,170,.9)';
    x.beginPath();
    x.arc(size / 2, size * 0.42, size * 0.075, 0, 6.283);
    x.fill();
    x.beginPath();
    x.moveTo(size / 2 - size * 0.1, size * 0.78);
    x.quadraticCurveTo(size / 2, size * 0.46, size / 2 + size * 0.1, size * 0.78);
    x.fill();
  }
  // 铅条格网
  x.strokeStyle = 'rgba(14,20,30,.85)';
  x.lineWidth = 2.2;
  for (let i = 1; i < 10; i++) {
    x.beginPath(); x.moveTo((i / 10) * size, 0); x.lineTo((i / 10) * size, size); x.stroke();
    x.beginPath(); x.moveTo(0, (i / 10) * size); x.lineTo(size, (i / 10) * size); x.stroke();
  }
  return c;
}

/** 王家旗帜:蓝底金狮纹章(原创纹样)。 */
function banner(w = 256, h = 384, field = '#28508f', crest = '#e2c169') {
  const c = newCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = field;
  x.fillRect(0, 0, w, h);
  // 织物竖向明暗
  for (let i = 0; i < w; i += 4) {
    x.fillStyle = `rgba(255,255,255,${0.02 + 0.03 * Math.abs(Math.sin(i * 0.09))})`;
    x.fillRect(i, 0, 2, h);
  }
  x.strokeStyle = crest; x.lineWidth = 7;
  x.strokeRect(11, 11, w - 22, h - 22);
  // 盾牌
  const cx = w / 2, cy = h * 0.42, sw = w * 0.44, sh = h * 0.3;
  x.fillStyle = 'rgba(255,255,255,.10)';
  x.beginPath();
  x.moveTo(cx - sw, cy - sh);
  x.lineTo(cx + sw, cy - sh);
  x.lineTo(cx + sw, cy + sh * 0.35);
  x.quadraticCurveTo(cx, cy + sh * 1.5, cx - sw, cy + sh * 0.35);
  x.closePath(); x.fill();
  x.strokeStyle = crest; x.lineWidth = 5; x.stroke();
  // 狮鹫剪影(原创几何构形)
  x.fillStyle = crest;
  x.beginPath();
  x.moveTo(cx - 6, cy + sh * 0.5);
  x.lineTo(cx - 26, cy + sh * 0.1);
  x.lineTo(cx - 16, cy - sh * 0.1);
  x.lineTo(cx - 30, cy - sh * 0.42);
  x.lineTo(cx - 6, cy - sh * 0.3);
  x.lineTo(cx + 2, cy - sh * 0.62);
  x.lineTo(cx + 16, cy - sh * 0.3);
  x.lineTo(cx + 34, cy - sh * 0.44);
  x.lineTo(cx + 22, cy - sh * 0.02);
  x.lineTo(cx + 34, cy + sh * 0.22);
  x.lineTo(cx + 8, cy + sh * 0.5);
  x.closePath();
  x.fill();
  // 底部锯齿边
  x.fillStyle = field;
  const teeth = 5;
  x.beginPath();
  x.moveTo(0, h);
  for (let i = 0; i <= teeth; i++) {
    x.lineTo((i / teeth) * w, h - (i % 2 === 0 ? 0 : h * 0.09));
  }
  x.lineTo(w, h); x.closePath();
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < teeth; i++) {
    x.beginPath();
    x.moveTo((i / teeth) * w, h);
    x.lineTo(((i + 0.5) / teeth) * w, h - h * 0.085);
    x.lineTo(((i + 1) / teeth) * w, h);
    x.closePath(); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  return c;
}

/** 店铺招牌:一个符号 + 边框。 */
function signboard(symbol = 'mug', seed = 5) {
  const w = 256, h = 192;
  const c = newCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#4a331d'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#5d4527'; x.fillRect(6, 6, w - 12, h - 12);
  x.strokeStyle = '#d9b978'; x.lineWidth = 4; x.strokeRect(14, 14, w - 28, h - 28);
  x.fillStyle = '#e6cf9a';
  const cx = w / 2, cy = h / 2;
  x.lineWidth = 9; x.strokeStyle = '#e6cf9a'; x.lineCap = 'round'; x.lineJoin = 'round';
  if (symbol === 'mug') {
    x.beginPath(); x.rect(cx - 40, cy - 34, 62, 74); x.stroke();
    x.beginPath(); x.arc(cx + 34, cy, 20, -1.2, 1.2); x.stroke();
    x.beginPath(); x.moveTo(cx - 46, cy - 44); x.lineTo(cx + 28, cy - 44); x.stroke();
  } else if (symbol === 'hammer') {
    x.beginPath(); x.moveTo(cx - 44, cy + 44); x.lineTo(cx + 18, cy - 18); x.stroke();
    x.beginPath(); x.rect(cx + 6, cy - 52, 52, 30); x.stroke();
  } else if (symbol === 'bread') {
    x.beginPath(); x.ellipse(cx, cy, 52, 34, 0, 0, 6.283); x.stroke();
    x.beginPath(); x.moveTo(cx - 26, cy - 12); x.lineTo(cx - 14, cy + 12); x.stroke();
    x.beginPath(); x.moveTo(cx + 2, cy - 16); x.lineTo(cx + 14, cy + 10); x.stroke();
  } else if (symbol === 'sword') {
    x.beginPath(); x.moveTo(cx, cy - 54); x.lineTo(cx, cy + 30); x.stroke();
    x.beginPath(); x.moveTo(cx - 26, cy + 30); x.lineTo(cx + 26, cy + 30); x.stroke();
    x.beginPath(); x.moveTo(cx, cy + 34); x.lineTo(cx, cy + 52); x.stroke();
  } else if (symbol === 'herb') {
    x.beginPath(); x.moveTo(cx, cy + 48); x.lineTo(cx, cy - 40); x.stroke();
    for (const s of [-1, 1]) {
      x.beginPath(); x.moveTo(cx, cy - 6); x.quadraticCurveTo(cx + s * 44, cy - 26, cx + s * 12, cy - 46); x.stroke();
    }
  } else {
    x.beginPath(); x.arc(cx, cy, 40, 0, 6.283); x.stroke();
  }
  return c;
}

/** 径向渐变精灵(火焰 / 烟 / 光晕通用)。 */
function radialSprite(size = 128, inner = 'rgba(255,240,190,1)', outer = 'rgba(255,150,40,0)', power = 1) {
  const c = newCanvas(size), x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    g.addColorStop(t, i === 0 ? inner : mixCss(inner, outer, Math.pow(t, power)));
  }
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

function mixCss(a, b, t) {
  const pa = a.match(/[\d.]+/g).map(Number);
  const pb = b.match(/[\d.]+/g).map(Number);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  const al = (pa[3] ?? 1) + ((pb[3] ?? 1) - (pa[3] ?? 1)) * t;
  return `rgba(${r},${g},${bl},${al})`;
}

/** 树叶团 alpha(用于灌木/树冠的细节遮罩)。 */
function leafAlpha(size = 128, seed = 3) {
  const rnd = mulberry32(seed);
  const c = newCanvas(size), x = c.getContext('2d');
  x.clearRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(255,255,255,${0.5 + rnd() * 0.5})`;
    x.beginPath();
    x.ellipse(rnd() * size, rnd() * size, 5 + rnd() * 12, 3 + rnd() * 8, rnd() * 3, 0, 6.283);
    x.fill();
  }
  return c;
}

/* ------------------------------------------------------------------ *
 *  导出:懒加载 + 缓存
 * ------------------------------------------------------------------ */

function lazy(key, make, opts) {
  if (!cache.has(key)) cache.set(key, toTexture(make(), opts));
  return cache.get(key);
}

export const TEX = {
  stone: () => lazy('stone', () => stoneWall(512, '#9a978d', 8, 7), { repeat: 1 }),
  stoneDark: () => lazy('stoneDark', () => stoneWall(512, '#7e7a70', 6, 19), { repeat: 1 }),
  stoneWarm: () => lazy('stoneWarm', () => stoneWall(512, '#b0a58c', 10, 29), { repeat: 1 }),
  cobble: () => lazy('cobble', () => cobble(512), { repeat: 1 }),
  flagstone: () => lazy('flag', () => flagstone(512), { repeat: 1 }),
  flagstoneDark: () => lazy('flagD', () => flagstone(512, '#8b8577', 37), { repeat: 1 }),
  plaster: () => lazy('plaster', () => plaster(256, '#ddd2b8'), { repeat: 1 }),
  plasterWarm: () => lazy('plasterW', () => plaster(256, '#e3cfa6', 33), { repeat: 1 }),
  plasterPale: () => lazy('plasterP', () => plaster(256, '#e8e2d0', 35), { repeat: 1 }),
  plasterRose: () => lazy('plasterR', () => plaster(256, '#dcc3b0', 39), { repeat: 1 }),
  planks: () => lazy('planks', () => planks(256, '#7a5433', false), { repeat: 1 }),
  planksV: () => lazy('planksV', () => planks(256, '#7a5433', true), { repeat: 1 }),
  planksDark: () => lazy('planksD', () => planks(256, '#4c3320', false, 43), { repeat: 1 }),
  planksLight: () => lazy('planksL', () => planks(256, '#a3805a', false, 45), { repeat: 1 }),
  roofBlue: () => lazy('roofB', () => roofTiles(256, '#3f6f9e'), { repeat: 1 }),
  roofTeal: () => lazy('roofT', () => roofTiles(256, '#2f6f78', 57), { repeat: 1 }),
  roofSlate: () => lazy('roofS', () => roofTiles(256, '#4a5570', 59), { repeat: 1 }),
  thatch: () => lazy('thatch', () => thatch(256), { repeat: 1 }),
  grass: () => lazy('grass', () => grass(512), { repeat: 1 }),
  dirt: () => lazy('dirt', () => dirt(256), { repeat: 1 }),
  stainedLancet: () => lazy('sgL', () => stainedGlass(512, 97, false), { repeat: 1 }),
  stainedRose: () => lazy('sgR', () => stainedGlass(512, 101, true), { repeat: 1 }),
  banner: (field, crest, key) => lazy('ban' + (key || field), () => banner(256, 384, field, crest), { repeat: 1 }),
  sign: (sym) => lazy('sign' + sym, () => signboard(sym), { repeat: 1 }),
  flame: () => lazy('flame', () => radialSprite(128, 'rgba(255,244,200,1)', 'rgba(255,110,20,0)', 1.5), { repeat: 1 }),
  smoke: () => lazy('smoke', () => radialSprite(128, 'rgba(190,190,190,0.75)', 'rgba(150,150,150,0)', 1.2), { repeat: 1 }),
  glow: () => lazy('glow', () => radialSprite(128, 'rgba(255,214,140,0.95)', 'rgba(255,150,50,0)', 2.2), { repeat: 1 }),
  leaf: () => lazy('leaf', () => leafAlpha(128), { repeat: 1, srgb: false }),
};

/** 让同一张 canvas 生成的贴图能有不同 repeat —— 克隆而非重复生成。 */
export function repeated(tex, rx, ry = rx) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
