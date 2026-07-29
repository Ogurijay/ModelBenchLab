/**
 * @file src/core/textures.js
 * @description 全程序化贴图库（契约 §3.5）。所有贴图由 Canvas 2D / DataTexture 现场绘制，
 *              零外部资产、零 Math.random（随机数全部来自传入的种子 RNG）。
 *
 * 契约说明与兜底：
 * 1. 按 §0「依赖方向」，`core/*` 不 import 本项目其他模块，因此本文件不 import `core/rng.js`，
 *    而是使用调用方传入的 `Rng`；若传入对象缺少 `fork`/`next`，退化为内置 mulberry32
 *    （同样是确定性种子 RNG，绝不使用 Math.random）。
 * 2. 契约要求统一 `generateMipmaps = true`；但 4 张动画广告牌每次重绘都会重建 mipmap 链，
 *    属于每秒 12 次的无谓开销，故广告牌纹理显式关闭 mipmap（其余属性仍按契约设置）。
 * 3. 本模块在无 DOM 的 Node 环境下 import 不报错：顶层不触碰 document，
 *    Canvas 只在 createTextureLib() 调用时创建。
 *
 * 颜色贴图一律 `colorSpace = THREE.SRGBColorSpace`；数据类贴图（粗糙度/噪声）保持 NoColorSpace。
 */

import * as THREE from 'three';

/** 圆周率两倍 */
const TAU = Math.PI * 2;

/** 中文优先字体栈（系统字体，不加载任何字体文件） */
const CJK_FONT = '"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
/** 等宽字体栈（行情/数字用） */
const MONO_FONT = '"Consolas","DejaVu Sans Mono","Menlo","Courier New",monospace';

/* ============================================================================
 * 一、基础设施：Canvas / 确定性随机 / 贴图收尾
 * ==========================================================================*/

/**
 * 创建离屏画布。优先 document.createElement，其次 OffscreenCanvas。
 * @param {number} w 宽（像素）
 * @param {number} h 高（像素）
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function createCanvas(w, h) {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  throw new Error('createTextureLib 需要 Canvas 环境（document 或 OffscreenCanvas）');
}

/**
 * 取 2D 上下文。
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas 画布
 * @returns {CanvasRenderingContext2D}
 */
function get2d(canvas) {
  const g = canvas.getContext('2d');
  if (!g) throw new Error('无法获取 Canvas 2D 上下文');
  return g;
}

/**
 * 释放画布占用的显存/内存：缩到 1×1。
 * @param {HTMLCanvasElement|OffscreenCanvas|null} canvas 画布
 */
function shrinkCanvas(canvas) {
  if (!canvas) return;
  try {
    canvas.width = 1;
    canvas.height = 1;
  } catch (_) {
    /* 某些环境下画布尺寸只读，忽略 */
  }
}

/**
 * 字符串 → uint32 哈希（FNV-1a 变体），与 core/rng.js 的 hashString 语义一致但本地实现，
 * 以满足「core 模块互不依赖」的契约约束。
 * @param {string|number} str 输入
 * @returns {number} uint32
 */
function hashStringLocal(str) {
  const s = String(str);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32 伪随机数发生器（Tommy Ettinger, 2017），周期 2^32，确定性。
 * @param {number} seed uint32 种子
 * @returns {() => number} [0,1) 生成器
 */
function mulberry32Local(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 把「取 [0,1) 的函数」包装成带常用便捷方法的取数器。
 * @param {() => number} next 基础生成器
 * @returns {{next:()=>number, range:(a:number,b:number)=>number, int:(a:number,b:number)=>number, bool:(p?:number)=>boolean, pick:(arr:any[])=>any, gauss:(m?:number,s?:number)=>number}}
 */
function rngKit(next) {
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    bool: (p = 0.5) => next() < p,
    pick: (arr) => (arr.length ? arr[Math.floor(next() * arr.length) % arr.length] : undefined),
    /** Box-Muller 正态分布 */
    gauss: (m = 0, s = 1) => {
      const u = Math.max(1e-9, next());
      const v = next();
      return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
    }
  };
}

/**
 * 由外部 Rng 派生「每张贴图一条独立随机流」的工厂：
 * 保证任意贴图的内容与生成顺序无关，同种子必然一致。
 * @param {Object|null|undefined} rng 契约 §3.1 的 Rng（可为空）
 * @returns {(name: string) => ReturnType<typeof rngKit>}
 */
function makeStreamFactory(rng) {
  if (rng && typeof rng.fork === 'function') {
    return (name) => {
      const child = rng.fork(`textures.${name}`);
      return rngKit(() => child.next());
    };
  }
  let base = 0x9e3779b9;
  if (rng && typeof rng.seed === 'number') base = rng.seed >>> 0;
  else if (rng && typeof rng.next === 'function') base = (rng.next() * 4294967296) >>> 0;
  return (name) => rngKit(mulberry32Local((hashStringLocal(`textures.${name}`) ^ base) >>> 0));
}

/**
 * 统一贴图收尾：重复包裹、各向异性、mipmap、颜色空间。
 * @param {THREE.Texture} tex 贴图
 * @param {{color?: boolean, aniso?: number, mipmaps?: boolean}} [o] 选项
 * @returns {THREE.Texture}
 */
function finishTexture(tex, o = {}) {
  const { color = true, aniso = 4, mipmaps = true } = o;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  tex.generateMipmaps = mipmaps;
  tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 以 3×3 平移重复绘制，使跨越边界的图元在贴图另一侧接续，得到可无缝平铺的结果。
 * 传入的绘制函数必须是「纯绘制」（特征参数需事先用 RNG 算好），否则 9 次调用会打乱随机流。
 * @param {CanvasRenderingContext2D} g 上下文
 * @param {number} w 画布宽
 * @param {number} h 画布高
 * @param {(g: CanvasRenderingContext2D) => void} fn 绘制函数
 */
function tileDraw(g, w, h, fn) {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      g.save();
      g.translate(ox * w, oy * h);
      fn(g);
      g.restore();
    }
  }
}

/**
 * 生成灰度噪点小图（用作 pattern 叠加，避免对大图逐像素循环）。
 * @param {() => number} next 随机源
 * @param {number} size 尺寸（建议 64/128）
 * @param {number} contrast 噪点振幅（0..127）
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeGrainTile(next, size, contrast) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = 128 + (next() * 2 - 1) * contrast;
    v = v < 0 ? 0 : v > 255 ? 255 : v | 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * 用噪点 pattern 叠加颗粒感（原生合成，速度远快于逐像素 JS 循环）。
 * @param {CanvasRenderingContext2D} g 上下文
 * @param {number} w 宽
 * @param {number} h 高
 * @param {HTMLCanvasElement|OffscreenCanvas} tile 噪点图
 * @param {number} alpha 强度 0..1
 * @param {GlobalCompositeOperation} [mode] 合成模式
 */
function overlayGrain(g, w, h, tile, alpha, mode = 'overlay') {
  const pat = g.createPattern(tile, 'repeat');
  if (!pat) return;
  g.save();
  g.globalAlpha = alpha;
  g.globalCompositeOperation = mode;
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}

/**
 * 圆角矩形路径（不依赖 CanvasRenderingContext2D.roundRect，兼容性更稳）。
 * @param {CanvasRenderingContext2D} g 上下文
 * @param {number} x 左
 * @param {number} y 上
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} r 圆角半径
 */
function roundRectPath(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y);
  g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr);
  g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr);
  g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

/**
 * 灰度值 → CSS 颜色串。
 * @param {number} v 0..255
 * @param {number} [a] 透明度
 * @returns {string}
 */
function gray(v, a = 1) {
  const c = Math.max(0, Math.min(255, Math.round(v)));
  return a >= 1 ? `rgb(${c},${c},${c})` : `rgba(${c},${c},${c},${a})`;
}

/**
 * RGB → CSS 颜色串。
 * @param {number} r 红 0..255
 * @param {number} gg 绿 0..255
 * @param {number} b 蓝 0..255
 * @param {number} [a] 透明度
 * @returns {string}
 */
function rgba(r, gg, b, a = 1) {
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgba(${cl(r)},${cl(gg)},${cl(b)},${a})`;
}

/**
 * 生成一条抖动折线（裂纹/闪痕），返回顶点数组。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} x0 起点 x
 * @param {number} y0 起点 y
 * @param {number} angle 初始角度（弧度）
 * @param {number} steps 段数
 * @param {number} step 单段长度
 * @param {number} wobble 每段角度抖动
 * @returns {number[][]} [[x,y], ...]
 */
function jaggedPath(rk, x0, y0, angle, steps, step, wobble) {
  const pts = [[x0, y0]];
  let x = x0;
  let y = y0;
  let a = angle;
  for (let i = 0; i < steps; i++) {
    a += rk.range(-wobble, wobble);
    x += Math.cos(a) * step * rk.range(0.6, 1.4);
    y += Math.sin(a) * step * rk.range(0.6, 1.4);
    pts.push([x, y]);
  }
  return pts;
}

/**
 * 描一条折线。
 * @param {CanvasRenderingContext2D} g 上下文
 * @param {number[][]} pts 顶点
 */
function strokePath(g, pts) {
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

/**
 * 生成一个不规则闭合多边形（补丁/斑块）。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} cx 中心 x
 * @param {number} cy 中心 y
 * @param {number} radius 平均半径
 * @param {number} sides 边数
 * @param {number} irregular 不规则度 0..1
 * @returns {number[][]}
 */
function blobPolygon(rk, cx, cy, radius, sides, irregular) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU + rk.range(-0.15, 0.15);
    const r = radius * (1 - irregular + rk.next() * irregular * 2);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * 填充闭合多边形。
 * @param {CanvasRenderingContext2D} g 上下文
 * @param {number[][]} pts 顶点
 */
function fillPolygon(g, pts) {
  if (pts.length < 3) return;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
}

/* ============================================================================
 * 二、路面与地面贴图
 * ==========================================================================*/

/**
 * 沥青路面：颜色图 + 粗糙度图成对生成（两图共享同一套裂纹/补丁/油渍特征，保证物理一致）。
 * 骨料颗粒用大量 1~3px 小方块堆出，裂纹用带分叉的抖动折线，补丁用不规则多边形。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainFine 细噪点图
 * @returns {{color: HTMLCanvasElement|OffscreenCanvas, rough: HTMLCanvasElement|OffscreenCanvas}}
 */
function makeAsphaltPair(rk, size, grainFine) {
  const cc = createCanvas(size, size);
  const cr = createCanvas(size, size);
  const gc = get2d(cc);
  const gr = get2d(cr);

  // ---- 预生成特征（先算好参数，之后才能安全地做 3×3 无缝重绘）----
  const blobs = [];
  for (let i = 0; i < 16; i++) {
    blobs.push({
      x: rk.range(0, size), y: rk.range(0, size),
      r: rk.range(size * 0.12, size * 0.42),
      v: rk.range(-14, 12), a: rk.range(0.12, 0.3)
    });
  }
  const patches = [];
  for (let i = 0; i < 9; i++) {
    const cx = rk.range(0, size);
    const cy = rk.range(0, size);
    const rad = rk.range(size * 0.05, size * 0.16);
    patches.push({
      poly: blobPolygon(rk, cx, cy, rad, rk.int(7, 11), 0.34),
      v: rk.range(-18, 16),
      a: rk.range(0.35, 0.7)
    });
  }
  const stains = [];
  for (let i = 0; i < 10; i++) {
    stains.push({
      x: rk.range(0, size), y: rk.range(0, size),
      r: rk.range(size * 0.03, size * 0.1),
      sx: rk.range(0.6, 2.1), a: rk.range(0.18, 0.42)
    });
  }
  const cracks = [];
  for (let i = 0; i < 13; i++) {
    const x0 = rk.range(0, size);
    const y0 = rk.range(0, size);
    const a0 = rk.range(0, TAU);
    const main = jaggedPath(rk, x0, y0, a0, rk.int(8, 16), size * 0.035, 0.55);
    const branches = [];
    const bn = rk.int(1, 3);
    for (let b = 0; b < bn; b++) {
      const at = main[rk.int(1, main.length - 2)];
      branches.push(jaggedPath(rk, at[0], at[1], a0 + rk.range(-1.4, 1.4), rk.int(3, 7), size * 0.028, 0.7));
    }
    cracks.push({ main, branches, w: rk.range(0.7, 1.9) });
  }

  // ---- 颜色图 ----
  gc.fillStyle = '#3a3b3d';
  gc.fillRect(0, 0, size, size);
  tileDraw(gc, size, size, (g) => {
    for (const b of blobs) {
      const grd = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grd.addColorStop(0, gray(58 + b.v, b.a));
      grd.addColorStop(1, gray(58 + b.v, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, TAU);
      g.fill();
    }
    for (const p of patches) {
      g.fillStyle = gray(58 + p.v, p.a);
      fillPolygon(g, p.poly);
    }
  });

  // 骨料颗粒（小石子反光）
  for (let i = 0; i < 2600; i++) {
    const v = rk.int(34, 118);
    gc.fillStyle = gray(v, rk.range(0.12, 0.5));
    const s = rk.range(0.8, 2.6);
    gc.fillRect(rk.range(0, size), rk.range(0, size), s, s);
  }

  // 油渍（深色椭圆软斑）
  tileDraw(gc, size, size, (g) => {
    for (const s of stains) {
      g.save();
      g.translate(s.x, s.y);
      g.scale(s.sx, 1 / s.sx);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, s.r);
      grd.addColorStop(0, rgba(12, 12, 14, s.a));
      grd.addColorStop(0.6, rgba(16, 16, 18, s.a * 0.45));
      grd.addColorStop(1, rgba(16, 16, 18, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, s.r, 0, TAU);
      g.fill();
      g.restore();
    }
  });

  // 裂纹：先描一条浅色「翻边」再描深色缝隙，形成立体感
  tileDraw(gc, size, size, (g) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const c of cracks) {
      g.strokeStyle = gray(96, 0.28);
      g.lineWidth = c.w + 1.6;
      strokePath(g, c.main);
      for (const b of c.branches) strokePath(g, b);
      g.strokeStyle = gray(18, 0.85);
      g.lineWidth = c.w;
      strokePath(g, c.main);
      g.lineWidth = c.w * 0.7;
      for (const b of c.branches) strokePath(g, b);
    }
  });

  overlayGrain(gc, size, size, grainFine, 0.5);

  // ---- 粗糙度图（数据贴图：亮=粗糙）----
  gr.fillStyle = gray(214);
  gr.fillRect(0, 0, size, size);
  tileDraw(gr, size, size, (g) => {
    for (const p of patches) {
      // 新铺补丁更平滑
      g.fillStyle = gray(178, p.a * 0.85);
      fillPolygon(g, p.poly);
    }
    for (const s of stains) {
      g.save();
      g.translate(s.x, s.y);
      g.scale(s.sx, 1 / s.sx);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, s.r);
      grd.addColorStop(0, gray(96, s.a * 1.4));
      grd.addColorStop(1, gray(96, 0));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, s.r, 0, TAU);
      g.fill();
      g.restore();
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const c of cracks) {
      // 裂缝存水 → 更光滑
      g.strokeStyle = gray(120, 0.8);
      g.lineWidth = c.w;
      strokePath(g, c.main);
      for (const b of c.branches) strokePath(g, b);
    }
  });
  for (let i = 0; i < 1400; i++) {
    gr.fillStyle = gray(rk.int(196, 250), rk.range(0.2, 0.55));
    gr.fillRect(rk.range(0, size), rk.range(0, size), rk.range(1, 3), rk.range(1, 3));
  }
  overlayGrain(gr, size, size, grainFine, 0.35);

  return { color: cc, rough: cr };
}

/**
 * 人行道：4×4 方形板块 + 接缝 + 磨损/口香糖污点 + 角部崩缺。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainFine 细噪点图
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeSidewalk(rk, size, grainFine) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  const n = 4;
  const cell = size / n;

  g.fillStyle = '#8e8b84';
  g.fillRect(0, 0, size, size);

  // 每块板：底色抖动 + 内部斑驳 + 细骨料
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = ix * cell;
      const y = iy * cell;
      const base = rk.range(132, 156);
      const warm = rk.range(-4, 6);
      g.fillStyle = rgba(base + warm, base + warm * 0.6, base - 2, 1);
      g.fillRect(x, y, cell, cell);

      // 板内低频斑驳
      for (let k = 0; k < 5; k++) {
        const bx = x + rk.range(0, cell);
        const by = y + rk.range(0, cell);
        const br = rk.range(cell * 0.12, cell * 0.42);
        const grd = g.createRadialGradient(bx, by, 0, bx, by, br);
        const v = base + rk.range(-16, 14);
        grd.addColorStop(0, gray(v, 0.5));
        grd.addColorStop(1, gray(v, 0));
        g.save();
        g.beginPath();
        g.rect(x, y, cell, cell);
        g.clip();
        g.fillStyle = grd;
        g.fillRect(x, y, cell, cell);
        g.restore();
      }

      // 角部崩缺
      if (rk.bool(0.45)) {
        const cxn = x + (rk.bool() ? 2 : cell - 2);
        const cyn = y + (rk.bool() ? 2 : cell - 2);
        g.fillStyle = gray(112, 0.55);
        fillPolygon(g, blobPolygon(rk, cxn, cyn, rk.range(2.5, 6.5), 6, 0.5));
      }
    }
  }

  // 抹平方向的细刷纹（防滑刷面）
  g.save();
  g.globalAlpha = 0.12;
  for (let i = 0; i < size; i += 3) {
    g.strokeStyle = gray(rk.int(110, 190));
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, i + rk.range(-0.6, 0.6));
    g.lineTo(size, i + rk.range(-0.6, 0.6));
    g.stroke();
  }
  g.restore();

  // 接缝（十字沟槽，带高光下沿）
  g.strokeStyle = gray(96, 0.85);
  g.lineWidth = Math.max(2, size / 170);
  for (let i = 0; i <= n; i++) {
    const p = i * cell;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }
  g.strokeStyle = gray(176, 0.4);
  g.lineWidth = 1;
  for (let i = 0; i <= n; i++) {
    const p = i * cell + Math.max(2, size / 170) * 0.7;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, size);
    g.moveTo(0, p);
    g.lineTo(size, p);
    g.stroke();
  }

  // 口香糖黑点 / 污渍
  for (let i = 0; i < 26; i++) {
    g.fillStyle = gray(rk.int(58, 96), rk.range(0.35, 0.7));
    g.beginPath();
    g.arc(rk.range(0, size), rk.range(0, size), rk.range(1.2, 3.4), 0, TAU);
    g.fill();
  }
  // 磨损亮斑（人流踩踏路径）
  for (let i = 0; i < 6; i++) {
    const x = rk.range(0, size);
    const y = rk.range(0, size);
    const r = rk.range(size * 0.08, size * 0.22);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, gray(190, 0.22));
    grd.addColorStop(1, gray(190, 0));
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  overlayGrain(g, size, size, grainFine, 0.42);
  return c;
}

/**
 * 混凝土：中性灰基底 + 低频斑驳 + 模板缝 + 气孔 + 发丝裂纹。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainFine 细噪点图
 * @param {HTMLCanvasElement|OffscreenCanvas} grainCoarse 粗噪点图
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeConcrete(rk, size, grainFine, grainCoarse) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  g.fillStyle = '#8c8983';
  g.fillRect(0, 0, size, size);

  const blobs = [];
  for (let i = 0; i < 30; i++) {
    blobs.push({
      x: rk.range(0, size), y: rk.range(0, size),
      r: rk.range(size * 0.07, size * 0.36),
      v: rk.range(-26, 22), a: rk.range(0.14, 0.4)
    });
  }
  const cracks = [];
  for (let i = 0; i < 7; i++) {
    cracks.push(jaggedPath(rk, rk.range(0, size), rk.range(0, size), rk.range(0, TAU), rk.int(6, 14), size * 0.04, 0.6));
  }

  tileDraw(g, size, size, (gg) => {
    for (const b of blobs) {
      const grd = gg.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grd.addColorStop(0, gray(140 + b.v, b.a));
      grd.addColorStop(1, gray(140 + b.v, 0));
      gg.fillStyle = grd;
      gg.beginPath();
      gg.arc(b.x, b.y, b.r, 0, TAU);
      gg.fill();
    }
    gg.lineCap = 'round';
    gg.strokeStyle = gray(96, 0.35);
    gg.lineWidth = 1;
    for (const p of cracks) strokePath(gg, p);
  });

  // 模板拼缝（水平横线，浇筑分层）
  g.strokeStyle = gray(112, 0.28);
  g.lineWidth = 1.4;
  for (let i = 1; i < 4; i++) {
    const y = (size / 4) * i;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(size, y);
    g.stroke();
  }
  // 气孔
  for (let i = 0; i < 420; i++) {
    g.fillStyle = gray(rk.int(74, 118), rk.range(0.2, 0.55));
    g.beginPath();
    g.arc(rk.range(0, size), rk.range(0, size), rk.range(0.5, 1.8), 0, TAU);
    g.fill();
  }

  overlayGrain(g, size, size, grainCoarse, 0.3);
  overlayGrain(g, size, size, grainFine, 0.45);
  return c;
}

/**
 * 石灰岩：暖米色基底 + 层理条带 + 矿物色斑 + 细密颗粒 + 极淡的方石接缝。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainFine 细噪点图
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeLimestone(rk, size, grainFine) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  g.fillStyle = '#cdc3ae';
  g.fillRect(0, 0, size, size);

  // 沉积层理：断续的短条带（分段绘制并柔化边缘，避免出现"木纹板条"的规则感）
  let y = 0;
  while (y < size) {
    const h = rk.range(size * 0.01, size * 0.045);
    let x = 0;
    while (x < size) {
      const w = rk.range(size * 0.15, size * 0.6);
      const v = rk.range(-11, 9);
      const grd = g.createLinearGradient(0, y, 0, y + h);
      const col = [205 + v, 196 + v * 0.9, 176 + v * 0.7];
      grd.addColorStop(0, rgba(col[0], col[1], col[2], 0));
      grd.addColorStop(0.5, rgba(col[0], col[1], col[2], rk.range(0.06, 0.2)));
      grd.addColorStop(1, rgba(col[0], col[1], col[2], 0));
      g.fillStyle = grd;
      g.fillRect(x, y, Math.min(w, size - x), h);
      x += w * rk.range(0.75, 1.15);
    }
    y += h * rk.range(1, 2.2);
  }

  // 矿物色斑（软椭圆）
  const spots = [];
  for (let i = 0; i < 86; i++) {
    spots.push({
      x: rk.range(0, size), y: rk.range(0, size),
      r: rk.range(size * 0.012, size * 0.085),
      sx: rk.range(0.8, 2.4),
      warm: rk.range(-1, 1), a: rk.range(0.16, 0.42)
    });
  }
  tileDraw(g, size, size, (gg) => {
    for (const s of spots) {
      gg.save();
      gg.translate(s.x, s.y);
      gg.scale(s.sx, 1 / s.sx);
      const grd = gg.createRadialGradient(0, 0, 0, 0, 0, s.r);
      const base = s.warm > 0 ? [176, 162, 136] : [222, 214, 196];
      grd.addColorStop(0, rgba(base[0], base[1], base[2], s.a));
      grd.addColorStop(1, rgba(base[0], base[1], base[2], 0));
      gg.fillStyle = grd;
      gg.beginPath();
      gg.arc(0, 0, s.r, 0, TAU);
      gg.fill();
      gg.restore();
    }
  });

  // 细颗粒（钙质结核）
  for (let i = 0; i < 1800; i++) {
    const v = rk.int(150, 232);
    g.fillStyle = rgba(v, v - 6, v - 20, rk.range(0.1, 0.4));
    g.fillRect(rk.range(0, size), rk.range(0, size), rk.range(0.7, 2.1), rk.range(0.7, 2.1));
  }

  // 方石砌筑（ashlar）接缝：4 皮 × 2 块，隔皮错半块；深缝 + 下沿受光，读起来像砌块而非木纹
  const courses = 4;
  const ch = size / courses;
  const bwStone = size / 2;
  const jw = Math.max(1, size / 300);
  for (let r = 0; r < courses; r++) {
    const yTop = r * ch;
    // 水平通缝
    g.fillStyle = rgba(150, 140, 120, 0.55);
    g.fillRect(0, yTop - jw / 2, size, jw);
    g.fillStyle = rgba(238, 232, 216, 0.4);
    g.fillRect(0, yTop + jw / 2, size, jw * 0.8);
    // 竖缝（隔皮错开半块，跨边界处补画保证平铺）
    const off = (r % 2) * (bwStone / 2);
    for (let k = -1; k <= 2; k++) {
      const px = k * bwStone + off;
      if (px < -jw || px > size + jw) continue;
      g.fillStyle = rgba(150, 140, 120, 0.5);
      g.fillRect(px - jw / 2, yTop, jw, ch);
      g.fillStyle = rgba(238, 232, 216, 0.32);
      g.fillRect(px + jw / 2, yTop, jw * 0.8, ch);
    }
  }

  overlayGrain(g, size, size, grainFine, 0.4);
  return c;
}

/**
 * 砖墙：错缝（running bond）砌法，砖块 8 列 × 16 行，隔行错半砖；
 * 每块砖独立色差（含少量深色过火砖），灰缝带阴影与噪点。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainFine 细噪点图
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeBrick(rk, size, grainFine) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  const cols = 8;
  const rows = 16;
  const bw = size / cols;
  const bh = size / rows;
  const mortar = Math.max(2, size / 128);

  // 灰缝底
  g.fillStyle = '#a8a49a';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = gray(rk.int(130, 200), rk.range(0.1, 0.35));
    g.fillRect(rk.range(0, size), rk.range(0, size), 1.4, 1.4);
  }

  /** 砖色调色板：红砖 / 深红 / 棕褐 / 过火深灰 */
  const palette = [
    [148, 68, 52], [162, 78, 58], [131, 58, 46],
    [175, 96, 70], [120, 62, 54], [96, 58, 56], [138, 84, 66]
  ];

  /**
   * 画一块砖（含跨边界补画，保证水平方向无缝）。
   * @param {number} x 左上 x
   * @param {number} y 左上 y
   * @param {number[]} col 砖色
   * @param {number} light 明暗偏移
   * @param {number} seedA 斑点种子偏移
   */
  const drawBrick = (x, y, col, light, seedA) => {
    const w = bw - mortar;
    const h = bh - mortar;
    const paint = (px) => {
      g.fillStyle = rgba(col[0] + light, col[1] + light, col[2] + light, 1);
      g.fillRect(px, y, w, h);
      // 顶部受光、底部落影
      const grd = g.createLinearGradient(px, y, px, y + h);
      grd.addColorStop(0, 'rgba(255,255,255,0.10)');
      grd.addColorStop(0.55, 'rgba(255,255,255,0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.16)');
      g.fillStyle = grd;
      g.fillRect(px, y, w, h);
      // 砖面斑驳
      const sr = mulberry32Local((seedA ^ Math.round(px * 7 + y * 13)) >>> 0);
      for (let k = 0; k < 26; k++) {
        const v = (sr() * 2 - 1) * 26;
        g.fillStyle = rgba(col[0] + light + v, col[1] + light + v * 0.8, col[2] + light + v * 0.7, 0.35);
        g.fillRect(px + sr() * w, y + sr() * h, 1 + sr() * 3, 1 + sr() * 2.4);
      }
    };
    paint(x);
    if (x < 0) paint(x + size);
    if (x + w > size) paint(x - size);
  };

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw / 2);
    for (let cIdx = -1; cIdx < cols; cIdx++) {
      const x = cIdx * bw + offset + mortar / 2;
      const y = r * bh + mortar / 2;
      const col = palette[rk.int(0, palette.length - 1)];
      drawBrick(x, y, col, rk.range(-16, 16), (hashStringLocal(`b${r}_${cIdx}`) ^ 0x5bf03635) >>> 0);
    }
  }

  // 整墙的雨痕/污渍（自上而下）
  for (let i = 0; i < 10; i++) {
    const x = rk.range(0, size);
    const w = rk.range(size * 0.02, size * 0.09);
    const grd = g.createLinearGradient(0, 0, 0, size);
    grd.addColorStop(0, 'rgba(40,32,28,0.20)');
    grd.addColorStop(1, 'rgba(40,32,28,0)');
    g.fillStyle = grd;
    g.fillRect(x, 0, w, size * rk.range(0.3, 0.9));
  }

  overlayGrain(g, size, size, grainFine, 0.32);
  return c;
}

/* ============================================================================
 * 三、建筑立面贴图
 * ==========================================================================*/

/**
 * 玻璃幕墙：8×8 玻璃单元（含横梁 transom / 竖挺 mullion 铝框），
 * 每格天空反射渐变 + 随机色差（蓝绿灰）+ 少量拉百叶的实体板，
 * 另有斜向高光条模拟环境反射。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长（1024）
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeGlassCurtain(rk, size) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  const n = 8;
  const cell = size / n;
  const frame = Math.max(3, size / 150);

  g.fillStyle = '#2b3f4d';
  g.fillRect(0, 0, size, size);

  /** 玻璃色系：冷蓝 / 蓝绿 / 深灰蓝 / 淡青 */
  const tints = [
    [58, 92, 118], [46, 96, 96], [40, 60, 78],
    [72, 110, 132], [34, 52, 66], [86, 124, 140]
  ];

  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = ix * cell;
      const y = iy * cell;
      const t = tints[rk.int(0, tints.length - 1)];
      const dark = rk.range(-16, 18);
      // 天空反射：上亮下暗
      const grd = g.createLinearGradient(x, y, x + cell * 0.25, y + cell);
      grd.addColorStop(0, rgba(t[0] + 52 + dark, t[1] + 58 + dark, t[2] + 62 + dark, 1));
      grd.addColorStop(0.45, rgba(t[0] + dark, t[1] + dark, t[2] + dark, 1));
      grd.addColorStop(1, rgba(t[0] * 0.62 + dark, t[1] * 0.62 + dark, t[2] * 0.7 + dark, 1));
      g.fillStyle = grd;
      g.fillRect(x, y, cell, cell);

      // 斜向高光条（相邻建筑倒影）
      if (rk.bool(0.45)) {
        g.save();
        g.beginPath();
        g.rect(x, y, cell, cell);
        g.clip();
        g.globalAlpha = rk.range(0.06, 0.18);
        g.fillStyle = '#dff0ff';
        g.translate(x + cell * 0.5, y + cell * 0.5);
        g.rotate(rk.range(-0.5, -0.2));
        g.fillRect(-cell, -cell * rk.range(0.05, 0.16), cell * 2, cell * rk.range(0.08, 0.22));
        g.restore();
      }

      // 少量实体墙板（spandrel）与百叶
      if (rk.bool(0.14)) {
        g.fillStyle = rgba(30 + dark, 38 + dark, 46 + dark, 0.92);
        g.fillRect(x + frame, y + frame, cell - frame * 2, cell - frame * 2);
      } else if (rk.bool(0.18)) {
        g.save();
        g.globalAlpha = 0.32;
        g.fillStyle = '#c9d4dc';
        const bh = Math.max(2, cell / 22);
        for (let by = y + frame; by < y + cell - frame; by += bh * 2) {
          g.fillRect(x + frame, by, cell - frame * 2, bh);
        }
        g.restore();
      }

      // 玻璃内侧边缘暗角
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 1.5;
      g.strokeRect(x + frame * 0.6, y + frame * 0.6, cell - frame * 1.2, cell - frame * 1.2);
    }
  }

  // 铝框：竖挺 + 横梁（带高光/落影双线）
  for (let i = 0; i <= n; i++) {
    const p = i * cell;
    g.fillStyle = '#7e8894';
    g.fillRect(p - frame / 2, 0, frame, size);
    g.fillRect(0, p - frame / 2, size, frame);
    g.fillStyle = 'rgba(226,236,246,0.55)';
    g.fillRect(p - frame / 2, 0, frame * 0.28, size);
    g.fillRect(0, p - frame / 2, size, frame * 0.28);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(p + frame * 0.22, 0, frame * 0.28, size);
    g.fillRect(0, p + frame * 0.22, size, frame * 0.28);
  }

  return c;
}

/**
 * 窗格阵列（契约 §3.5 的 facadeWindows）：一张贴图 = 8 窗宽 × 8 层高。
 * 建筑模块按「窗宽 2.6m × 层高 3.5m」换算 repeat：repeat.x = W/(2.6*8)、repeat.y = H/(3.5*8)。
 * 三张图逐像素对齐：
 *  - map          白天：墙体 + 带框深色玻璃
 *  - emissiveMap  夜间：约 55% 窗户点亮（暖色为主，亮度不一）
 *  - roughnessMap 玻璃(暗=光滑) 与墙体(亮=粗糙) 的粗糙度差异
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainFine 细噪点图
 * @returns {{map: any, emissive: any, rough: any}}
 */
function makeFacadeWindows(rk, size, grainFine) {
  const n = 8;
  const cell = size / n;
  const margin = cell * 0.16;
  const winW = cell - margin * 2;
  const winH = cell - margin * 2.1;
  const frame = Math.max(2, cell * 0.07);

  const cMap = createCanvas(size, size);
  const cEmi = createCanvas(size, size);
  const cRough = createCanvas(size, size);
  const gm = get2d(cMap);
  const ge = get2d(cEmi);
  const gr = get2d(cRough);

  /** 夜间灯色：暖白 / 琥珀 / 冷白 / 电视蓝 / 荧光青 */
  const lampColors = [
    [255, 214, 152], [255, 196, 122], [255, 232, 196],
    [246, 246, 238], [176, 202, 255], [186, 240, 220]
  ];

  // 预生成每格状态，保证三图一致
  const cells = [];
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      cells.push({
        ix, iy,
        lit: rk.bool(0.55),
        color: lampColors[rk.int(0, lampColors.length - 1)],
        bright: rk.range(0.34, 1),
        blind: rk.bool(0.3) ? rk.range(0.18, 0.62) : 0,
        wall: rk.range(-8, 8),
        glass: rk.range(-10, 10)
      });
    }
  }

  // ---------- map：白天 ----------
  gm.fillStyle = '#96918a';
  gm.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    gm.fillStyle = gray(rk.int(120, 176), rk.range(0.1, 0.3));
    gm.fillRect(rk.range(0, size), rk.range(0, size), rk.range(1, 4), rk.range(1, 3));
  }
  for (const cl of cells) {
    const x = cl.ix * cell + margin;
    const y = cl.iy * cell + margin;
    // 窗套（浅色石材线脚）
    gm.fillStyle = gray(178 + cl.wall);
    gm.fillRect(x - frame, y - frame, winW + frame * 2, winH + frame * 2);
    // 玻璃：斜向天空反射
    const grd = gm.createLinearGradient(x, y, x + winW * 0.6, y + winH);
    grd.addColorStop(0, rgba(78 + cl.glass, 96 + cl.glass, 114 + cl.glass, 1));
    grd.addColorStop(0.5, rgba(42 + cl.glass, 54 + cl.glass, 68 + cl.glass, 1));
    grd.addColorStop(1, rgba(26 + cl.glass, 33 + cl.glass, 42 + cl.glass, 1));
    gm.fillStyle = grd;
    gm.fillRect(x, y, winW, winH);
    // 白天也能看到的百叶
    if (cl.blind > 0) {
      gm.fillStyle = 'rgba(214,214,206,0.5)';
      gm.fillRect(x, y, winW, winH * cl.blind);
    }
    // 中挺
    gm.fillStyle = gray(150 + cl.wall, 0.9);
    gm.fillRect(x + winW * 0.5 - frame * 0.25, y, frame * 0.5, winH);
    // 窗台落影
    gm.fillStyle = 'rgba(0,0,0,0.28)';
    gm.fillRect(x - frame, y + winH + frame, winW + frame * 2, frame * 0.9);
  }
  overlayGrain(gm, size, size, grainFine, 0.3);

  // ---------- emissiveMap：夜间 ----------
  ge.fillStyle = '#000000';
  ge.fillRect(0, 0, size, size);
  for (const cl of cells) {
    if (!cl.lit) continue;
    const x = cl.ix * cell + margin;
    const y = cl.iy * cell + margin;
    const [r, gg2, b] = cl.color;
    const k = cl.bright;
    // 室内光：靠窗顶更亮
    const grd = ge.createLinearGradient(x, y, x, y + winH);
    grd.addColorStop(0, rgba(r * k, gg2 * k, b * k, 1));
    grd.addColorStop(0.7, rgba(r * k * 0.82, gg2 * k * 0.8, b * k * 0.78, 1));
    grd.addColorStop(1, rgba(r * k * 0.5, gg2 * k * 0.48, b * k * 0.46, 1));
    ge.fillStyle = grd;
    ge.fillRect(x, y, winW, winH);
    // 百叶遮挡（下半段压暗）
    if (cl.blind > 0) {
      ge.fillStyle = rgba(0, 0, 0, 0.55);
      ge.fillRect(x, y + winH * (1 - cl.blind), winW, winH * cl.blind);
    }
    // 中挺压暗
    ge.fillStyle = 'rgba(0,0,0,0.75)';
    ge.fillRect(x + winW * 0.5 - frame * 0.25, y, frame * 0.5, winH);
    // 溢出到窗套的微弱辉光
    ge.save();
    ge.globalAlpha = 0.22 * k;
    ge.shadowColor = rgba(r, gg2, b, 1);
    ge.shadowBlur = frame * 3;
    ge.fillStyle = rgba(r * 0.5, gg2 * 0.5, b * 0.5, 1);
    ge.fillRect(x + winW * 0.2, y + winH * 0.2, winW * 0.6, winH * 0.6);
    ge.restore();
  }

  // ---------- roughnessMap ----------
  gr.fillStyle = gray(224); // 墙体粗糙
  gr.fillRect(0, 0, size, size);
  for (const cl of cells) {
    const x = cl.ix * cell + margin;
    const y = cl.iy * cell + margin;
    gr.fillStyle = gray(142); // 窗套：半光滑
    gr.fillRect(x - frame, y - frame, winW + frame * 2, winH + frame * 2);
    gr.fillStyle = gray(26); // 玻璃：很光滑
    gr.fillRect(x, y, winW, winH);
    if (cl.blind > 0) {
      gr.fillStyle = gray(96, 0.6);
      gr.fillRect(x, y, winW, winH * cl.blind);
    }
    gr.fillStyle = gray(150);
    gr.fillRect(x + winW * 0.5 - frame * 0.25, y, frame * 0.5, winH);
  }
  overlayGrain(gr, size, size, grainFine, 0.2);

  return { map: cMap, emissive: cEmi, rough: cRough };
}

/* ============================================================================
 * 四、路面标线（带 alpha）
 * ==========================================================================*/

/**
 * 斑马线：U 方向两组白条（各占 1/4），可沿路宽方向无缝重复；带磨损与轮胎污渍。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeCrosswalk(rk, size) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  const bar = size / 4;

  g.clearRect(0, 0, size, size);
  for (let i = 0; i < 2; i++) {
    const x = i * bar * 2;
    g.fillStyle = 'rgba(236,236,228,0.95)';
    g.fillRect(x, 0, bar, size);
    // 条纹内部明暗不均
    for (let k = 0; k < 60; k++) {
      g.fillStyle = gray(rk.int(196, 255), rk.range(0.06, 0.22));
      g.fillRect(x + rk.range(0, bar), rk.range(0, size), rk.range(2, 12), rk.range(2, 9));
    }
    // 边缘毛刺
    g.fillStyle = 'rgba(232,232,224,0.55)';
    for (let k = 0; k < 26; k++) {
      const yy = rk.range(0, size);
      g.fillRect(x - rk.range(0, 2.5), yy, 2.5, rk.range(3, 11));
      g.fillRect(x + bar, yy, rk.range(0, 2.5), rk.range(3, 11));
    }
  }

  // 磨损：destination-out 挖掉软斑，露出沥青
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 34; i++) {
    const x = rk.range(0, size);
    const y = rk.range(0, size);
    const r = rk.range(size * 0.015, size * 0.075);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(0,0,0,${rk.range(0.3, 0.85)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();

  // 轮胎压痕（横向脏污）
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 6; i++) {
    const y = rk.range(0, size);
    g.fillStyle = gray(90, rk.range(0.08, 0.2));
    g.fillRect(0, y, size, rk.range(4, 16));
  }
  g.restore();

  return c;
}

/**
 * 车道标线合集（一张图三种标线，消费方用 uv 偏移选取）：
 *  - u ∈ [0.00, 0.33)  双黄线（沿 V 连续，任意重复长度均可）
 *  - u ∈ [0.33, 0.66)  白色虚线（V 方向 60% 实 / 40% 空，一个重复 = 一段 dash）
 *  - u ∈ [0.66, 1.00]  白色实线（含轻微磨损）
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeLaneMarking(rk, size) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  const third = size / 3;
  g.clearRect(0, 0, size, size);

  const YELLOW = 'rgba(238,190,42,0.95)';
  const WHITE = 'rgba(238,238,230,0.95)';

  // ① 双黄线
  const lw = third * 0.22;
  g.fillStyle = YELLOW;
  g.fillRect(third * 0.24, 0, lw, size);
  g.fillRect(third * 0.62, 0, lw, size);

  // ② 白色虚线（60% 实）
  g.fillStyle = WHITE;
  g.fillRect(third + third * 0.38, 0, third * 0.24, size * 0.6);

  // ③ 白色实线
  g.fillStyle = WHITE;
  g.fillRect(third * 2 + third * 0.38, 0, third * 0.24, size);

  // 涂料颗粒感（反光玻璃微珠）
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 900; i++) {
    g.fillStyle = gray(rk.int(190, 255), rk.range(0.08, 0.3));
    g.fillRect(rk.range(0, size), rk.range(0, size), rk.range(1, 3), rk.range(1, 3));
  }
  g.restore();

  // 磨损缺口
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 40; i++) {
    const x = rk.range(0, size);
    const y = rk.range(0, size);
    const r = rk.range(1.5, size * 0.03);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(0,0,0,${rk.range(0.35, 0.9)})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();

  return c;
}

/* ============================================================================
 * 五、屋面 / 水面 / 雪 / 云 / 星空
 * ==========================================================================*/

/**
 * 屋面砾石（美式平屋顶的沥青卷材压砾）：深灰底 + 大量碎石 + 沥青补丁 + 接缝搭接。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainCoarse 粗噪点图
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeRoofGravel(rk, size, grainCoarse) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  g.fillStyle = '#4a463f';
  g.fillRect(0, 0, size, size);

  // 卷材搭接缝
  g.strokeStyle = 'rgba(28,26,24,0.55)';
  g.lineWidth = Math.max(2, size / 128);
  for (let i = 1; i < 3; i++) {
    const y = (size / 3) * i;
    g.beginPath();
    g.moveTo(0, y + 0.5);
    g.lineTo(size, y + 0.5);
    g.stroke();
  }

  // 碎石：方块为主，少量圆粒带高光
  for (let i = 0; i < 1500; i++) {
    const v = rk.int(58, 152);
    const warm = rk.range(-6, 16);
    g.fillStyle = rgba(v + warm, v + warm * 0.6, v - 4, rk.range(0.5, 1));
    g.fillRect(rk.range(0, size), rk.range(0, size), rk.range(1.4, 4.2), rk.range(1.4, 3.6));
  }
  for (let i = 0; i < 380; i++) {
    const x = rk.range(0, size);
    const y = rk.range(0, size);
    const r = rk.range(1, 2.8);
    g.fillStyle = gray(rk.int(120, 186), 0.85);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.fillStyle = gray(232, 0.3);
    g.beginPath();
    g.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU);
    g.fill();
  }

  // 沥青补丁 / 积水痕
  const patches = [];
  for (let i = 0; i < 7; i++) {
    patches.push({
      poly: blobPolygon(rk, rk.range(0, size), rk.range(0, size), rk.range(size * 0.05, size * 0.16), rk.int(7, 11), 0.4),
      a: rk.range(0.25, 0.6)
    });
  }
  tileDraw(g, size, size, (gg) => {
    for (const p of patches) {
      gg.fillStyle = rgba(26, 24, 22, p.a);
      fillPolygon(gg, p.poly);
    }
  });

  overlayGrain(g, size, size, grainCoarse, 0.35);
  return c;
}

/**
 * 水面基色：深青蓝 + 长条状波纹 + 泡沫细点。配合材质的 uv 滚动即可产生流动感。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainFine 细噪点图
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeWater(rk, size, grainFine) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  const grdBase = g.createLinearGradient(0, 0, 0, size);
  grdBase.addColorStop(0, '#1d3a48');
  grdBase.addColorStop(1, '#24485a');
  g.fillStyle = grdBase;
  g.fillRect(0, 0, size, size);

  // 长条波纹（不同频率、不同方向的细长软条）
  const waves = [];
  for (let i = 0; i < 130; i++) {
    waves.push({
      x: rk.range(0, size), y: rk.range(0, size),
      w: rk.range(size * 0.08, size * 0.5),
      h: rk.range(1, 3.6),
      a: rk.range(0.05, 0.22),
      rot: rk.range(-0.22, 0.22),
      light: rk.bool(0.62)
    });
  }
  tileDraw(g, size, size, (gg) => {
    for (const w of waves) {
      gg.save();
      gg.translate(w.x, w.y);
      gg.rotate(w.rot);
      const grd = gg.createLinearGradient(-w.w / 2, 0, w.w / 2, 0);
      const col = w.light ? [126, 176, 190] : [16, 34, 46];
      grd.addColorStop(0, rgba(col[0], col[1], col[2], 0));
      grd.addColorStop(0.5, rgba(col[0], col[1], col[2], w.a));
      grd.addColorStop(1, rgba(col[0], col[1], col[2], 0));
      gg.fillStyle = grd;
      gg.fillRect(-w.w / 2, -w.h / 2, w.w, w.h);
      gg.restore();
    }
  });

  // 泡沫/浪尖白点
  for (let i = 0; i < 620; i++) {
    g.fillStyle = rgba(214, 232, 238, rk.range(0.05, 0.28));
    g.fillRect(rk.range(0, size), rk.range(0, size), rk.range(1, 2.6), 1.2);
  }

  overlayGrain(g, size, size, grainFine, 0.25);
  return c;
}

/**
 * 雪面颗粒：近白基底 + 冷色阴影凹凸 + 冰晶闪点（十字星）。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @param {HTMLCanvasElement|OffscreenCanvas} grainFine 细噪点图
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeSnowGrain(rk, size, grainFine) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  g.fillStyle = '#f2f5fa';
  g.fillRect(0, 0, size, size);

  // 起伏阴影（吹雪形成的浅凹凸）
  const dunes = [];
  for (let i = 0; i < 26; i++) {
    dunes.push({
      x: rk.range(0, size), y: rk.range(0, size),
      r: rk.range(size * 0.06, size * 0.28),
      sx: rk.range(1, 2.6),
      cool: rk.bool(0.55), a: rk.range(0.08, 0.24)
    });
  }
  tileDraw(g, size, size, (gg) => {
    for (const d of dunes) {
      gg.save();
      gg.translate(d.x, d.y);
      gg.scale(d.sx, 1 / d.sx);
      const grd = gg.createRadialGradient(0, 0, 0, 0, 0, d.r);
      const col = d.cool ? [186, 202, 226] : [255, 255, 255];
      grd.addColorStop(0, rgba(col[0], col[1], col[2], d.a));
      grd.addColorStop(1, rgba(col[0], col[1], col[2], 0));
      gg.fillStyle = grd;
      gg.beginPath();
      gg.arc(0, 0, d.r, 0, TAU);
      gg.fill();
      gg.restore();
    }
  });

  // 颗粒
  for (let i = 0; i < 2000; i++) {
    const v = rk.int(226, 255);
    g.fillStyle = rgba(v - 6, v - 2, v, rk.range(0.15, 0.5));
    g.fillRect(rk.range(0, size), rk.range(0, size), rk.range(0.8, 2.2), rk.range(0.8, 2.2));
  }
  // 冰晶闪点
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    const x = rk.range(0, size);
    const y = rk.range(0, size);
    const r = rk.range(1.5, 4);
    g.beginPath();
    g.moveTo(x - r, y);
    g.lineTo(x + r, y);
    g.moveTo(x, y - r);
    g.lineTo(x, y + r);
    g.stroke();
  }

  overlayGrain(g, size, size, grainFine, 0.22);
  return c;
}

/**
 * 云朵精灵：径向渐变 alpha（中心不透明 → 边缘全透明），叠加数团蓬松鼓包；
 * 最后用 destination-in 的径向遮罩强制边缘 alpha 归零，保证 billboard 无硬边。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeCloudSprite(rk, size) {
  const c = createCanvas(size, size);
  const g = get2d(c);
  const half = size / 2;
  g.clearRect(0, 0, size, size);

  // 主体
  const core = g.createRadialGradient(half, half, 0, half, half, half * 0.92);
  core.addColorStop(0, 'rgba(255,255,255,0.98)');
  core.addColorStop(0.42, 'rgba(252,253,255,0.72)');
  core.addColorStop(0.75, 'rgba(248,250,255,0.24)');
  core.addColorStop(1, 'rgba(246,248,255,0)');
  g.fillStyle = core;
  g.fillRect(0, 0, size, size);

  // 蓬松鼓包
  for (let i = 0; i < 14; i++) {
    const a = rk.range(0, TAU);
    const d = rk.range(0, half * 0.5);
    const x = half + Math.cos(a) * d;
    const y = half + Math.sin(a) * d * 0.8;
    const r = rk.range(size * 0.08, size * 0.24);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const k = rk.range(0.16, 0.4);
    grd.addColorStop(0, `rgba(255,255,255,${k})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 边缘强制归零
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(half, half, 0, half, half, half);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.72, 'rgba(0,0,0,0.95)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'source-over';

  return c;
}

/**
 * 星空（等距圆柱投影 512×256，透明底 + 亮星）：
 * 纬度按 acos 反变换分布，避免极区星点堆积；含银河带与少量亮星辉光。
 * 背景全透明，可直接叠加在天空球上或用加法混合。
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} w 宽
 * @param {number} h 高
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeStarfield(rk, w, h) {
  const c = createCanvas(w, h);
  const g = get2d(c);
  g.clearRect(0, 0, w, h);

  // 银河带：沿正弦曲线的弥散光 + 密集暗星
  for (let i = 0; i < 900; i++) {
    const x = rk.range(0, w);
    const yBand = h * 0.5 + Math.sin((x / w) * TAU * 0.85 + 1.1) * h * 0.22;
    const y = yBand + rk.gauss(0, h * 0.055);
    if (y < 0 || y > h) continue;
    g.fillStyle = rgba(210, 216, 246, rk.range(0.03, 0.16));
    g.fillRect(x, y, rk.range(1, 3.2), rk.range(1, 2.4));
  }

  /** 恒星色温：蓝白 / 白 / 黄白 / 橙 / 红 */
  const starColors = [
    [190, 210, 255], [235, 240, 255], [255, 250, 226],
    [255, 226, 178], [255, 190, 160]
  ];

  const count = 1900;
  for (let i = 0; i < count; i++) {
    // 均匀球面分布：v = acos(1-2u)/π
    const u = rk.next();
    const y = (Math.acos(1 - 2 * u) / Math.PI) * h;
    const x = rk.range(0, w);
    const col = starColors[rk.int(0, starColors.length - 1)];
    const mag = rk.next();
    const r = 0.35 + mag * mag * 1.25;
    const a = 0.28 + mag * 0.72;
    g.fillStyle = rgba(col[0], col[1], col[2], a);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    // 亮星辉光
    if (mag > 0.965) {
      const grd = g.createRadialGradient(x, y, 0, x, y, r * 6);
      grd.addColorStop(0, rgba(col[0], col[1], col[2], 0.5));
      grd.addColorStop(1, rgba(col[0], col[1], col[2], 0));
      g.fillStyle = grd;
      g.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
    }
  }
  return c;
}

/**
 * 可平铺的值噪声（周期化格点 + smoothstep 插值）。
 * @param {() => number} next 随机源
 * @param {number} period 格点周期（须整除采样分辨率以保证平铺）
 * @returns {(u: number, v: number) => number} u,v ∈ [0,1) → [0,1]
 */
function tileableValueNoise(next, period) {
  const v = new Float32Array(period * period);
  for (let i = 0; i < v.length; i++) v[i] = next();
  return (u, w) => {
    const fx = u * period;
    const fy = w * period;
    const x0 = Math.floor(fx) % period;
    const y0 = Math.floor(fy) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = v[y0 * period + x0];
    const b = v[y0 * period + x1];
    const cc = v[y1 * period + x0];
    const d = v[y1 * period + x1];
    const top = a + (b - a) * sx;
    const bot = cc + (d - cc) * sx;
    return top + (bot - top) * sy;
  };
}

/**
 * 噪声 DataTexture（128×128 RGBA，NoColorSpace）：
 *  R = 4 倍频 fbm（供 shader 打散边缘）
 *  G = 低频平滑噪声（水洼/积雪斑块）
 *  B = 高频白噪（颗粒/抖动）
 *  A = 255
 * @param {ReturnType<typeof rngKit>} rk 随机流
 * @param {number} size 边长（须为 2 的幂）
 * @returns {THREE.DataTexture}
 */
function makeNoiseDataTexture(rk, size) {
  const octaves = [4, 8, 16, 32].map((p) => tileableValueNoise(rk.next, p));
  const low = tileableValueNoise(rk.next, 4);
  const data = new Uint8Array(size * size * 4);
  const gains = [0.5, 0.25, 0.15, 0.1];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w = y / size;
      let f = 0;
      for (let o = 0; o < octaves.length; o++) f += octaves[o](u, w) * gains[o];
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, (f * 255) | 0));
      data[i + 1] = Math.max(0, Math.min(255, (low(u, w) * 255) | 0));
      data[i + 2] = (rk.next() * 255) | 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  return tex;
}

/* ============================================================================
 * 六、动画广告牌（时代广场）
 * ==========================================================================*/

/**
 * 广告牌工厂：封装节流重绘（默认 12fps）与纹理上传。
 * 动画贴图每次重绘都会重建 mipmap 链，故此处显式关闭 mipmap（见文件头「契约说明」）。
 * @param {{name:string, width:number, height:number, fps:number, phase:number, aniso:number,
 *          draw:(g: CanvasRenderingContext2D, t: number) => void}} o 配置
 * @returns {{name:string, texture:THREE.CanvasTexture, canvas:any, aspect:number,
 *           update:(timeSec:number)=>void, _kill:()=>void}}
 */
function makeBillboard(o) {
  const canvas = createCanvas(o.width, o.height);
  const g = get2d(canvas);
  g.textBaseline = 'alphabetic';
  o.draw(g, o.phase);

  const texture = new THREE.CanvasTexture(canvas);
  finishTexture(texture, { color: true, aniso: o.aniso, mipmaps: false });

  const interval = 1 / Math.max(1, o.fps);
  let last = -1e9;
  let dead = false;

  return {
    name: o.name,
    texture,
    canvas,
    aspect: o.width / o.height,
    /**
     * 推进动画（由持有者每帧调用；内部节流到 fps）。
     * @param {number} timeSec 当前时间（秒）
     */
    update(timeSec) {
      if (dead) return;
      const t = typeof timeSec === 'number' && Number.isFinite(timeSec) ? timeSec : 0;
      if (t < last) last = t - interval; // 时间回拨（重置/换种子）时立即重绘
      if (t - last < interval) return;
      last = t;
      o.draw(g, t + o.phase);
      texture.needsUpdate = true;
    },
    _kill() {
      dead = true;
    }
  };
}

/**
 * 生成 LED 点阵遮罩小图（黑色细网格），以 pattern 平铺叠在广告牌上模拟像素灯板。
 * @param {number} pitch 点距（像素）
 * @returns {HTMLCanvasElement|OffscreenCanvas}
 */
function makeLedMaskTile(pitch) {
  const c = createCanvas(pitch, pitch);
  const g = get2d(c);
  g.clearRect(0, 0, pitch, pitch);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, pitch, 1);
  g.fillRect(0, 0, 1, pitch);
  return c;
}

/**
 * 构造 4 块动画广告牌：滚动字幕 / 霓虹渐变 / 股票行情 / 跑马灯。
 * 全部纯代码绘制，内容含中英文字符。
 * @param {(name:string)=>ReturnType<typeof rngKit>} stream 随机流工厂
 * @param {number} aniso 各向异性
 * @param {number} fps 重绘帧率
 * @returns {Array<ReturnType<typeof makeBillboard>>}
 */
function makeBillboards(stream, aniso, fps) {
  const list = [];

  /* ---------- ① LED 滚动字幕 ---------- */
  {
    const rk = stream('billboard.ticker');
    const W = 512;
    const H = 256;
    const led = makeLedMaskTile(4);
    let ledPat = null;
    const TEXT = '欢迎来到纽约 · 时代广场 ★ WELCOME TO NEW YORK ★ 百老汇今夜有戏 · BROADWAY TONIGHT ★ ';
    const hueBase = rk.range(0, 360);
    let textW = 0;

    list.push(makeBillboard({
      name: 'ticker',
      width: W, height: H, fps, aniso, phase: rk.range(0, 40),
      draw: (g, t) => {
        if (!ledPat) ledPat = g.createPattern(led, 'repeat');
        g.fillStyle = '#08070c';
        g.fillRect(0, 0, W, H);

        // 顶部彩条
        const bar = g.createLinearGradient(0, 0, W, 0);
        for (let i = 0; i <= 6; i++) {
          bar.addColorStop(i / 6, `hsl(${(hueBase + t * 40 + i * 60) % 360},92%,58%)`);
        }
        g.fillStyle = bar;
        g.fillRect(0, 0, W, 22);
        g.fillRect(0, H - 22, W, 22);

        // 滚动主字幕
        g.save();
        g.beginPath();
        g.rect(0, 30, W, H - 60);
        g.clip();
        g.font = `bold 62px ${CJK_FONT}`;
        if (!textW) textW = g.measureText(TEXT).width;
        const off = -((t * 120) % textW);
        g.shadowColor = 'rgba(255,190,60,0.9)';
        g.shadowBlur = 16;
        g.fillStyle = '#ffcf4d';
        g.fillText(TEXT, off, 108);
        g.fillText(TEXT, off + textW, 108);

        // 第二行：反向滚动的英文小字
        g.shadowBlur = 8;
        g.shadowColor = 'rgba(80,220,255,0.8)';
        g.fillStyle = '#7fe6ff';
        g.font = `bold 34px ${MONO_FONT}`;
        const sub = 'LIVE · 24H · MANHATTAN · NY 10036   ';
        const subW = g.measureText(sub).width;
        const off2 = (t * 70) % subW;
        g.fillText(sub, off2 - subW, 170);
        g.fillText(sub, off2, 170);
        g.fillText(sub, off2 + subW, 170);
        g.restore();

        // 闪烁计数灯
        for (let i = 0; i < 8; i++) {
          const on = (Math.floor(t * 6) + i) % 8 < 4;
          g.fillStyle = on ? '#ff4d6d' : '#3a1020';
          g.beginPath();
          g.arc(28 + i * 20, 210, 5, 0, TAU);
          g.fill();
        }

        // LED 点阵
        if (ledPat) {
          g.fillStyle = ledPat;
          g.fillRect(0, 0, W, H);
        }
      }
    }));
  }

  /* ---------- ② 霓虹渐变 ---------- */
  {
    const rk = stream('billboard.neon');
    const W = 256;
    const H = 256;
    const hue0 = rk.range(0, 360);
    const rays = [];
    for (let i = 0; i < 12; i++) rays.push(rk.range(0, TAU));

    list.push(makeBillboard({
      name: 'neon',
      width: W, height: H, fps, aniso, phase: rk.range(0, 40),
      draw: (g, t) => {
        // 渐变底
        const grd = g.createLinearGradient(0, 0, W, H);
        grd.addColorStop(0, `hsl(${(hue0 + t * 22) % 360},78%,26%)`);
        grd.addColorStop(0.5, `hsl(${(hue0 + 90 + t * 22) % 360},82%,34%)`);
        grd.addColorStop(1, `hsl(${(hue0 + 210 + t * 22) % 360},80%,22%)`);
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);

        // 旋转射线
        g.save();
        g.translate(W / 2, H / 2);
        g.rotate(t * 0.5);
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < rays.length; i++) {
          g.rotate(TAU / rays.length);
          g.fillStyle = `hsla(${(hue0 + i * 30 + t * 60) % 360},95%,60%,0.13)`;
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(W, -12);
          g.lineTo(W, 12);
          g.closePath();
          g.fill();
        }
        g.restore();

        // 脉动圆环
        for (let i = 0; i < 3; i++) {
          const p = ((t * 0.6 + i / 3) % 1);
          g.strokeStyle = `hsla(${(hue0 + 40 + t * 50) % 360},98%,68%,${(1 - p) * 0.7})`;
          g.lineWidth = 3 + (1 - p) * 5;
          g.beginPath();
          g.arc(W / 2, H / 2, 18 + p * 116, 0, TAU);
          g.stroke();
        }

        // 霓虹文字
        const pulse = 0.72 + 0.28 * Math.sin(t * 3.4);
        g.textAlign = 'center';
        g.shadowColor = `hsla(${(hue0 + 150) % 360},100%,66%,${pulse})`;
        g.shadowBlur = 26 * pulse;
        g.fillStyle = '#fff6ff';
        g.font = `bold 54px ${CJK_FONT}`;
        g.fillText('纽约', W / 2, H / 2 - 4);
        g.font = `bold 26px ${MONO_FONT}`;
        g.fillText('NEW YORK', W / 2, H / 2 + 34);
        g.shadowBlur = 0;
        g.textAlign = 'left';

        // 边框霓虹管
        g.strokeStyle = `hsla(${(hue0 + 300 + t * 30) % 360},98%,62%,0.9)`;
        g.lineWidth = 5;
        roundRectPath(g, 8, 8, W - 16, H - 16, 14);
        g.stroke();
      }
    }));
  }

  /* ---------- ③ 股票行情条 ---------- */
  {
    const rk = stream('billboard.stocks');
    const W = 512;
    const H = 256;
    const SYMS = ['AAPL', 'MSFT', 'NVDA', 'JPM', 'KO', 'DIS', 'GS', 'XOM'];
    const rows = [];
    for (let i = 0; i < 5; i++) {
      rows.push({
        sym: SYMS[rk.int(0, SYMS.length - 1)],
        base: rk.range(38, 420),
        k1: rk.range(0.18, 0.55),
        k2: rk.range(0.9, 2.3),
        p1: rk.range(0, TAU),
        p2: rk.range(0, TAU)
      });
    }
    /**
     * 行情价格（确定性正弦叠加，模拟波动）。
     * @param {{base:number,k1:number,k2:number,p1:number,p2:number}} r 行
     * @param {number} t 时间
     * @returns {number}
     */
    const priceOf = (r, t) => r.base * (1 + 0.022 * Math.sin(t * r.k1 + r.p1) + 0.008 * Math.sin(t * r.k2 + r.p2));

    list.push(makeBillboard({
      name: 'stocks',
      width: W, height: H, fps, aniso, phase: rk.range(0, 40),
      draw: (g, t) => {
        g.fillStyle = '#050a14';
        g.fillRect(0, 0, W, H);
        // 标题栏
        g.fillStyle = '#0e1c33';
        g.fillRect(0, 0, W, 34);
        g.fillStyle = '#8fd4ff';
        g.font = `bold 22px ${CJK_FONT}`;
        g.fillText('纽约证券交易所 · 实时行情', 12, 25);
        g.fillStyle = (Math.floor(t * 2) % 2) ? '#ff5566' : '#3a1622';
        g.beginPath();
        g.arc(W - 24, 17, 7, 0, TAU);
        g.fill();

        const rowH = 36;
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const y = 42 + i * rowH;
          const p = priceOf(r, t);
          const prev = priceOf(r, t - 1.2);
          const up = p >= prev;
          const pct = ((p - prev) / prev) * 100;
          g.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
          g.fillRect(0, y - 24, W, rowH - 4);
          g.font = `bold 24px ${MONO_FONT}`;
          g.fillStyle = '#e6eefc';
          g.fillText(r.sym, 12, y);
          g.fillStyle = up ? '#3ddc84' : '#ff5b5b';
          g.fillText(p.toFixed(2).padStart(8, ' '), 108, y);
          g.fillText(`${up ? '▲' : '▼'}${Math.abs(pct).toFixed(2)}%`, 232, y);

          // 迷你走势线
          g.strokeStyle = up ? 'rgba(61,220,132,0.85)' : 'rgba(255,91,91,0.85)';
          g.lineWidth = 2;
          g.beginPath();
          for (let k = 0; k < 26; k++) {
            const tt = t - (25 - k) * 0.32;
            const v = priceOf(r, tt);
            const x = 360 + k * 5.4;
            const yy = y - 8 - ((v / r.base) - 1) * 420;
            if (k === 0) g.moveTo(x, yy);
            else g.lineTo(x, yy);
          }
          g.stroke();
        }

        // 底部滚动条
        g.fillStyle = '#0b1526';
        g.fillRect(0, H - 30, W, 30);
        g.save();
        g.beginPath();
        g.rect(0, H - 30, W, 30);
        g.clip();
        g.font = `bold 20px ${MONO_FONT}`;
        const tape = rows.map((r) => `${r.sym} ${priceOf(r, t).toFixed(2)}`).join('   |   ') + '   |   ';
        const tw = g.measureText(tape).width;
        const off = -((t * 60) % tw);
        g.fillStyle = '#ffd166';
        g.fillText(tape, off, H - 9);
        g.fillText(tape, off + tw, H - 9);
        g.restore();
      }
    }));
  }

  /* ---------- ④ 跑马灯灯泡广告 ---------- */
  {
    const rk = stream('billboard.marquee');
    const W = 512;
    const H = 256;
    const SLOGANS = [
      ['热咖啡 · 24 小时', 'FRESH COFFEE'],
      ['今夜百老汇', 'SHOW TONIGHT'],
      ['第五大道折扣季', '50% OFF'],
      ['地铁直达', 'SUBWAY 7 AVE']
    ];
    const hue0 = rk.range(0, 360);
    const bulbs = [];
    {
      const step = 26;
      for (let x = 16; x < W - 10; x += step) {
        bulbs.push([x, 16]);
        bulbs.push([x, H - 16]);
      }
      for (let y = 16 + step; y < H - 16; y += step) {
        bulbs.push([16, y]);
        bulbs.push([W - 16, y]);
      }
    }

    list.push(makeBillboard({
      name: 'marquee',
      width: W, height: H, fps, aniso, phase: rk.range(0, 40),
      draw: (g, t) => {
        g.fillStyle = '#12060e';
        g.fillRect(0, 0, W, H);
        const inner = g.createLinearGradient(0, 30, 0, H - 30);
        inner.addColorStop(0, `hsl(${(hue0 + t * 12) % 360},62%,26%)`);
        inner.addColorStop(1, `hsl(${(hue0 + 55 + t * 12) % 360},68%,14%)`);
        g.fillStyle = inner;
        g.fillRect(30, 30, W - 60, H - 60);

        // 主体图形：热饮杯（纯代码绘制）
        g.save();
        g.translate(96, H / 2 + 12);
        g.fillStyle = '#f4e9d8';
        g.beginPath();
        g.moveTo(-30, -26);
        g.lineTo(30, -26);
        g.lineTo(22, 34);
        g.lineTo(-22, 34);
        g.closePath();
        g.fill();
        g.fillStyle = '#7a4a2a';
        g.fillRect(-27, -26, 54, 9);
        g.strokeStyle = '#f4e9d8';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(36, -2, 14, -1.1, 1.1);
        g.stroke();
        // 热气（随时间飘动）
        g.strokeStyle = 'rgba(255,255,255,0.5)';
        g.lineWidth = 3;
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          for (let k = 0; k <= 8; k++) {
            const yy = -34 - k * 5;
            const xx = i * 16 + Math.sin(t * 2.4 + k * 0.6 + i) * 5;
            if (k === 0) g.moveTo(xx, yy);
            else g.lineTo(xx, yy);
          }
          g.stroke();
        }
        g.restore();

        // 轮播标语
        const idx = Math.floor(t / 3.2) % SLOGANS.length;
        const local = (t / 3.2) % 1;
        const fade = Math.min(1, Math.min(local, 1 - local) * 8);
        g.save();
        g.globalAlpha = Math.max(0.05, fade);
        g.fillStyle = '#fff2d0';
        g.font = `bold 42px ${CJK_FONT}`;
        g.fillText(SLOGANS[idx][0], 170, H / 2 - 2);
        g.fillStyle = `hsl(${(hue0 + 180) % 360},92%,70%)`;
        g.font = `bold 26px ${MONO_FONT}`;
        g.fillText(SLOGANS[idx][1], 170, H / 2 + 34);
        g.restore();

        // 跑马灯灯泡（4 拍追光）
        const phase = Math.floor(t * 8);
        for (let i = 0; i < bulbs.length; i++) {
          const on = (i + phase) % 4 === 0;
          const b = bulbs[i];
          if (on) {
            const grd = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], 13);
            grd.addColorStop(0, 'rgba(255,240,190,0.95)');
            grd.addColorStop(1, 'rgba(255,200,90,0)');
            g.fillStyle = grd;
            g.fillRect(b[0] - 13, b[1] - 13, 26, 26);
          }
          g.fillStyle = on ? '#fff4c8' : '#4a3418';
          g.beginPath();
          g.arc(b[0], b[1], 4.2, 0, TAU);
          g.fill();
        }
      }
    }));
  }

  return list;
}

/* ============================================================================
 * 七、对外接口
 * ==========================================================================*/

/**
 * 创建全场景共享的程序化贴图库（契约 §3.5）。
 * 所有贴图在本函数内一次性生成（同步、无 IO），典型耗时 < 150ms。
 *
 * @param {Object} [rng] 契约 §3.1 的 Rng（用 fork 派生每张贴图的独立子流）；
 *                       缺省时退化为内置确定性 mulberry32（绝不使用 Math.random）
 * @param {Object} [opts] 选项
 * @param {number} [opts.anisotropy=4] 各向异性过滤级别
 * @param {'high'|'medium'|'low'} [opts.quality='high'] 画质：low 时贴图边长减半
 * @param {number} [opts.billboardFps=12] 广告牌重绘帧率（节流，避免拖慢主循环）
 * @returns {Object} TextureLib
 */
export function createTextureLib(rng, opts = {}) {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  const aniso = Math.max(1, opts.anisotropy || 4);
  const quality = opts.quality || 'high';
  const billboardFps = Math.max(1, opts.billboardFps || 12);
  const half = quality === 'low';
  /**
   * 按画质缩放贴图边长（只做 1/2 缩放，保证网格类贴图仍能整除对齐）。
   * @param {number} n 基准边长
   * @returns {number}
   */
  const S = (n) => (half ? Math.max(64, n >> 1) : n);

  const stream = makeStreamFactory(rng);
  /** @type {THREE.Texture[]} */
  const all = [];
  /**
   * 建 CanvasTexture 并登记到 all。
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas 画布
   * @param {boolean} isColor 是否颜色贴图
   * @returns {THREE.CanvasTexture}
   */
  const reg = (canvas, isColor) => {
    const tex = new THREE.CanvasTexture(canvas);
    finishTexture(tex, { color: isColor, aniso, mipmaps: true });
    all.push(tex);
    return tex;
  };

  // 共用噪点小图（避免对大图做逐像素 JS 循环）
  const grainFine = makeGrainTile(stream('grain.fine').next, 128, 26);
  const grainCoarse = makeGrainTile(stream('grain.coarse').next, 64, 34);

  // --- 路面与地面 ---
  const asphaltPair = makeAsphaltPair(stream('asphalt'), S(512), grainFine);
  const asphalt = reg(asphaltPair.color, true);
  const asphaltRough = reg(asphaltPair.rough, false);
  const sidewalk = reg(makeSidewalk(stream('sidewalk'), S(512), grainFine), true);

  // --- 建筑基材 ---
  const concrete = reg(makeConcrete(stream('concrete'), S(512), grainFine, grainCoarse), true);
  const limestone = reg(makeLimestone(stream('limestone'), S(512), grainFine), true);
  const brick = reg(makeBrick(stream('brick'), S(512), grainFine), true);
  const glassCurtain = reg(makeGlassCurtain(stream('glass'), half ? 512 : 1024), true);

  // --- 窗格阵列 ---
  const fw = makeFacadeWindows(stream('windows'), S(512), grainFine);
  const facadeWindows = {
    map: reg(fw.map, true),
    emissiveMap: reg(fw.emissive, true),
    roughnessMap: reg(fw.rough, false)
  };

  // --- 标线 ---
  const crosswalk = reg(makeCrosswalk(stream('crosswalk'), S(256)), true);
  const laneMarking = reg(makeLaneMarking(stream('lane'), S(256)), true);

  // --- 屋面 / 水 / 雪 / 云 / 星空 ---
  const roofGravel = reg(makeRoofGravel(stream('roof'), S(256), grainCoarse), true);
  const water = reg(makeWater(stream('water'), S(256), grainFine), true);
  const snowGrain = reg(makeSnowGrain(stream('snow'), S(256), grainFine), true);
  const cloudSprite = reg(makeCloudSprite(stream('cloud'), S(256)), true);
  const starfield = reg(makeStarfield(stream('stars'), S(512), S(256)), true);

  // --- 噪声 DataTexture（数据类，保持 NoColorSpace）---
  const noise = makeNoiseDataTexture(stream('noise'), 128);
  finishTexture(noise, { color: false, aniso, mipmaps: true });
  all.push(noise);

  // --- 动画广告牌 ---
  const billboards = makeBillboards(stream, aniso, billboardFps);
  for (const b of billboards) all.push(b.texture);

  // 噪点临时画布用完即弃
  shrinkCanvas(grainFine);
  shrinkCanvas(grainCoarse);

  const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

  return {
    asphalt,
    asphaltRough,
    sidewalk,
    concrete,
    limestone,
    brick,
    glassCurtain,
    facadeWindows,
    crosswalk,
    laneMarking,
    roofGravel,
    water,
    snowGrain,
    billboards,
    cloudSprite,
    starfield,
    noise,
    all,
    /** 生成统计（调试用） */
    stats: { textures: all.length, billboards: billboards.length, buildMs: +(t1 - t0).toFixed(2) },
    disposed: false
  };
}

/**
 * 释放贴图库：逐个 dispose，并让广告牌 update 变为安全空转、画布缩到 1×1 回收内存。
 * 可重复调用（幂等）。
 * @param {Object|null|undefined} lib createTextureLib 的返回值
 */
export function disposeTextureLib(lib) {
  if (!lib || lib.disposed) return;
  if (Array.isArray(lib.billboards)) {
    for (const b of lib.billboards) {
      if (b && typeof b._kill === 'function') b._kill();
      if (b) shrinkCanvas(b.canvas);
    }
  }
  if (Array.isArray(lib.all)) {
    for (const tex of lib.all) {
      if (tex && typeof tex.dispose === 'function') tex.dispose();
      if (tex && tex.image && tex.image.width !== undefined && !(tex instanceof THREE.DataTexture)) {
        shrinkCanvas(tex.image);
      }
    }
    lib.all.length = 0;
  }
  lib.disposed = true;
}
