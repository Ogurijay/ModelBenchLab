/**
 * Canvas 程序化纹理 — 无任何外部图片资源。
 * 木纹球道(含箭头/圆点/瓶位点)、球瓶条纹、大理石花纹球、霓虹招牌、地毯。
 */
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// 简单可复现伪随机
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 球道纹理:v=0 → 犯规线端,v=1 → 瓶台端。
 * laneLength 用于按真实比例摆放箭头(4.6m)/引导点(2.1m)/瓶位点。
 */
export function makeLaneTexture(laneLength = 18.3, pinSpots = []) {
  const W = 1024;
  const H = 4096;
  const [c, ctx] = makeCanvas(W, H);
  const rand = mulberry32(20260710);

  // 39 块枫木板
  const boards = 39;
  const bw = W / boards;
  for (let b = 0; b < boards; b++) {
    const base = 200 + rand() * 26;
    ctx.fillStyle = `rgb(${base + 16}, ${base * 0.72}, ${base * 0.42})`;
    ctx.fillRect(b * bw, 0, bw + 1, H);
    // 纵向木纹
    for (let g = 0; g < 26; g++) {
      const x = b * bw + rand() * bw;
      const y0 = rand() * H;
      const len = 220 + rand() * 900;
      ctx.strokeStyle = `rgba(${110 + rand() * 60}, ${60 + rand() * 40}, 25, ${0.05 + rand() * 0.1})`;
      ctx.lineWidth = 0.8 + rand() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.bezierCurveTo(x + rand() * 5 - 2.5, y0 + len * 0.3, x - rand() * 5 + 2.5, y0 + len * 0.7, x + rand() * 4 - 2, y0 + len);
      ctx.stroke();
    }
    // 板缝
    ctx.fillStyle = 'rgba(90, 52, 22, 0.55)';
    ctx.fillRect(b * bw - 0.7, 0, 1.4, H);
  }

  const yOf = (meters) => H - (meters / laneLength) * H; // 犯规线在画布底

  // 引导点(2.1m,5 点)
  ctx.fillStyle = 'rgba(40, 24, 12, 0.9)';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(W / 2 + i * (W / 8), yOf(2.1), 7, 0, Math.PI * 2);
    ctx.fill();
  }

  // 7 支瞄准箭头(4.0~5.2m,人字形)
  for (let i = -3; i <= 3; i++) {
    const x = W / 2 + i * (W / 8.6);
    const y = yOf(4.6) + Math.abs(i) * 130;
    ctx.fillStyle = 'rgba(150, 30, 30, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y - 60);
    ctx.lineTo(x + 16, y + 22);
    ctx.lineTo(x, y - 4);
    ctx.lineTo(x - 16, y + 22);
    ctx.closePath();
    ctx.fill();
  }

  // 瓶台区域加深 + 瓶位圆点
  const deckY = yOf(15.8);
  const grad = ctx.createLinearGradient(0, deckY, 0, 0);
  grad.addColorStop(0, 'rgba(30, 18, 10, 0)');
  grad.addColorStop(0.35, 'rgba(30, 18, 10, 0.35)');
  grad.addColorStop(1, 'rgba(24, 14, 8, 0.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, deckY);
  ctx.fillStyle = 'rgba(20, 12, 6, 0.9)';
  for (const s of pinSpots) {
    const px = W / 2 + (s.x / 1.05) * W;
    const py = yOf(-s.z);
    ctx.beginPath();
    ctx.arc(px, py, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // 上油光泽:中部淡高光带
  const oil = ctx.createLinearGradient(0, H, 0, yOf(12));
  oil.addColorStop(0, 'rgba(255, 244, 214, 0.10)');
  oil.addColorStop(1, 'rgba(255, 244, 214, 0)');
  ctx.fillStyle = oil;
  ctx.fillRect(0, yOf(12), W, H - yOf(12));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 球瓶纹理:白瓶身 + 两道红颈环(v 与 LatheGeometry 剖面点对应) */
export function makePinTexture(stripeV = [0.62, 0.7]) {
  const W = 128;
  const H = 512;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#f7f4ee';
  ctx.fillRect(0, 0, W, H);
  // 轻微瓷面渐变
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(190, 188, 196, 0.25)');
  g.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  g.addColorStop(1, 'rgba(190, 188, 196, 0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 两道红环(画布 y = (1-v)*H)
  ctx.fillStyle = '#c8232e';
  for (const v of stripeV) {
    const y = (1 - v) * H;
    ctx.fillRect(0, y - 11, W, 22);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 保龄球大理石花纹 */
export function makeBallTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const rand = mulberry32(5150);
  ctx.fillStyle = '#251448';
  ctx.fillRect(0, 0, S, S);
  const palette = ['#4b2a8f', '#7a3bd1', '#ff2d95', '#2ad4ff', '#180b30'];
  for (let i = 0; i < 90; i++) {
    const col = palette[Math.floor(rand() * palette.length)];
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.08 + rand() * 0.2;
    ctx.lineWidth = 4 + rand() * 26;
    ctx.beginPath();
    const x = rand() * S;
    const y = rand() * S;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + rand() * 240 - 120, y + rand() * 240 - 120,
      x + rand() * 240 - 120, y + rand() * 240 - 120,
      x + rand() * 300 - 150, y + rand() * 300 - 150
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 霓虹文字招牌 */
export function makeNeonSignTexture(text, color = '#ff2d95', sub = '') {
  const W = 1024;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 118px "Microsoft YaHei", sans-serif';
  ctx.shadowColor = color;
  for (const blur of [42, 22, 8]) {
    ctx.shadowBlur = blur;
    ctx.fillStyle = blur === 8 ? '#fff' : color;
    ctx.fillText(text, W / 2, sub ? H / 2 - 24 : H / 2);
  }
  if (sub) {
    ctx.font = '400 40px "Microsoft YaHei", sans-serif';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#9be8ff';
    ctx.shadowColor = '#23e5ff';
    ctx.fillText(sub, W / 2, H / 2 + 70);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 球馆地毯(荧光几何纹) */
export function makeCarpetTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const rand = mulberry32(777);
  ctx.fillStyle = '#0d0a1e';
  ctx.fillRect(0, 0, S, S);
  const cols = ['#1c1440', '#241a52', '#141030'];
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = cols[Math.floor(rand() * cols.length)];
    const x = rand() * S;
    const y = rand() * S;
    const r = 6 + rand() * 22;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rand() * Math.PI);
    ctx.fillRect(-r, -r / 3, r * 2, r / 1.5);
    ctx.restore();
  }
  // 荧光斑点
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,45,149,0.5)' : 'rgba(35,229,255,0.5)';
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, 1.5 + rand() * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
