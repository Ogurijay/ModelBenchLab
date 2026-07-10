// ============================================================
// textures.js — 全程序化 canvas 纹理(零外部资产)
// ============================================================
import * as THREE from 'three';
import { MESA, DOMINO, deg } from './config.js';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// 简易确定性伪随机(纹理专用,不影响物理)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 木纹纹理(暖色桌面) */
export function woodTexture({ size = 512, base = '#8a5a33', dark = '#5f3b1e', light = '#a97748', rings = 22, seed = 7 } = {}) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // 纵向木纹条
  for (let i = 0; i < rings; i++) {
    const x = (i / rings) * size + (rnd() - 0.5) * 26;
    const w = 3 + rnd() * 14;
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    const col = rnd() > 0.5 ? dark : light;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.16 + rnd() * 0.2;
    ctx.fillStyle = g;
    // 波浪形条纹
    ctx.beginPath();
    ctx.moveTo(x - w, 0);
    for (let y = 0; y <= size; y += 16) {
      ctx.lineTo(x - w + Math.sin(y * 0.02 + i) * 6, y);
    }
    ctx.lineTo(x + w + Math.sin(size * 0.02 + i) * 6, size);
    for (let y = size; y >= 0; y -= 16) {
      ctx.lineTo(x + w + Math.sin(y * 0.02 + i) * 6, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  // 细颗粒
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#000' : '#fff';
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1 + rnd() * 3);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** 高台顶面纹理:木纹 + 沿多米诺弧线绘制镶嵌引导线(设计感细节) */
export function mesaTopTexture(size = 1024) {
  const tex = woodTexture({ size, base: '#7d5230', dark: '#553517', light: '#9c6f42', rings: 30, seed: 21 });
  const c = tex.image;
  const ctx = c.getContext('2d');

  // 世界坐标 → 顶盖像素。three CylinderGeometry 顶盖 UV:u=0.5+0.5*(z/r),v=0.5+0.5*(x/r)
  // CanvasTexture flipY=true → py = size*(1-v)
  const R = MESA.radius;
  const toPx = (wx, wz) => [
    (size / 2) * (1 + (wz - MESA.cz) / R),
    (size / 2) * (1 - (wx - MESA.cx) / R),
  ];
  const scale = size / (R * 2);

  // 弧线引导槽(黄铜镶嵌感)
  ctx.lineCap = 'round';
  const drawArc = (r0, width, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    const a0 = deg(DOMINO.arcEndDeg), a1 = deg(DOMINO.arcStartDeg);
    for (let i = 0; i <= 72; i++) {
      const a = a0 + (a1 - a0) * (i / 72);
      const [px, py] = toPx(MESA.cx + r0 * Math.cos(a), MESA.cz + r0 * Math.sin(a));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };
  drawArc(DOMINO.arcRadius, 14, '#3a2410', 0.55);
  drawArc(DOMINO.arcRadius, 5, '#d9a45b', 0.5);

  // 中心装饰同心圆
  const [ccx, ccy] = toPx(MESA.cx, MESA.cz);
  for (const [rr, w, col, al] of [[0.55, 4, '#d9a45b', 0.35], [0.75, 2, '#3a2410', 0.4], [1.35, 2, '#3a2410', 0.25]]) {
    ctx.globalAlpha = al;
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(ccx, ccy, rr * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  tex.needsUpdate = true;
  return tex;
}

/** 背景渐变(深蓝紫夜空 → 暖色地平线) */
export function backgroundTexture() {
  const c = makeCanvas(512);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#171528');
  g.addColorStop(0.45, '#241d33');
  g.addColorStop(0.75, '#3d2b35');
  g.addColorStop(1.0, '#54382f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // 轻微噪点防色带
  const rnd = mulberry32(99);
  ctx.globalAlpha = 0.03;
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#fff' : '#000';
    ctx.fillRect(rnd() * 512, rnd() * 512, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

/** 拉丝金属粗糙度贴图 */
export function brushedRoughness(size = 256, seed = 5) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 500; i++) {
    const y = rnd() * size;
    ctx.strokeStyle = rnd() > 0.5 ? '#aaa' : '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rnd() - 0.5) * 4);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
