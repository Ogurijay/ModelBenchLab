// ============================================================
// textures.js — 全部程序化 canvas 纹理(零外部资产)
//   地面磨石 / 墙面灰泥 / 混凝土 / 花岗岩 / 木纹 / 画作 / 说明牌 /
//   环境贴图(PMREM 输入)/ 接触阴影(烘焙感 AO)
// ============================================================
import * as THREE from 'three';

// ---------- 随机与噪声 ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(xi, yi, seed) {
  const s = Math.sin(xi * 127.1 + yi * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}
function sstep(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = sstep(xf), v = sstep(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
export function fbm(x, y, seed, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { v += amp * vnoise(x * f, y * f, seed + o * 17.3); amp *= 0.5; f *= 2.03; }
  return v;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ---------- 灰度 fbm 噪声画布 ----------
function noiseCanvas(size, seed, scale = 6, oct = 4) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const g = clamp255(fbm((x / size) * scale, (y / size) * scale, seed, oct) * 255);
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- 地面:深色磨石(terrazzo) ----------
function floorCanvases() {
  const S = 1024;
  const map = makeCanvas(S, S);
  const ctx = map.getContext('2d');
  ctx.fillStyle = '#37342f';
  ctx.fillRect(0, 0, S, S);

  // 大尺度云状明暗(低分辨率噪声放大 → 柔和)
  const n = noiseCanvas(256, 11.3, 5, 4);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.28;
  ctx.drawImage(n, 0, 0, S, S);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.07;
  ctx.drawImage(n, -80, -60, S + 160, S + 120);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  // 磨石骨料斑点
  const rnd = mulberry32(20260710);
  const chips = ['#575049', '#6b645c', '#2a2724', '#8a8378', '#4c463f', '#5e564c', '#7d6a4a'];
  for (let i = 0; i < 8200; i++) {
    ctx.fillStyle = chips[(rnd() * chips.length) | 0];
    ctx.globalAlpha = 0.35 + rnd() * 0.5;
    const s = 1 + rnd() * rnd() * 3.4;
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 大板分缝(4 × 4)
  ctx.strokeStyle = '#1c1a18';
  ctx.lineWidth = 5;
  for (let i = 0; i <= 4; i++) {
    const p = (i * S) / 4;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(150,142,128,0.16)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) {
    const p = (i * S) / 4 + 4;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
  }

  // 粗糙度贴图:整体高光泽,分缝与斑点略糙
  const R = 512;
  const rough = makeCanvas(R, R);
  const rctx = rough.getContext('2d');
  rctx.fillStyle = 'rgb(64,64,64)'; // roughness ≈ 0.25
  rctx.fillRect(0, 0, R, R);
  const rn = noiseCanvas(128, 7.7, 4, 3);
  rctx.globalAlpha = 0.4;
  rctx.drawImage(rn, 0, 0, R, R);
  rctx.globalAlpha = 1;
  rctx.strokeStyle = 'rgb(215,215,215)';
  rctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = (i * R) / 4;
    rctx.beginPath(); rctx.moveTo(p, 0); rctx.lineTo(p, R); rctx.stroke();
    rctx.beginPath(); rctx.moveTo(0, p); rctx.lineTo(R, p); rctx.stroke();
  }
  return { map, rough };
}

// ---------- 墙面灰泥(低对比,重复不显缝) ----------
function plasterCanvases() {
  const S = 512;
  const map = makeCanvas(S, S);
  const ctx = map.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = fbm((x / S) * 9, (y / S) * 9, 31.7, 3);
      const g = (n - 0.5) * 14;
      const i = (y * S + x) * 4;
      d[i] = clamp255(238 + g);
      d[i + 1] = clamp255(232 + g);
      d[i + 2] = clamp255(221 + g);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const bump = noiseCanvas(256, 31.7, 12, 3);
  return { map, bump };
}

// ---------- 横向可平铺噪声(θ 环形嵌入,用于柱体 UV 包裹) ----------
function ringFbm(u, v, scale, seed, oct) {
  const th = u * Math.PI * 2;
  return fbm(Math.cos(th) * scale + 11.17, Math.sin(th) * scale + v, seed, oct);
}

// ---------- 混凝土展台 ----------
function concreteCanvases() {
  const S = 256;
  const map = makeCanvas(S, S);
  const ctx = map.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const n = ringFbm(u, v * 4, 1.6, 51.3, 4);
      const spk = hash2(x, y, 8.8);
      let g = 168 + (n - 0.5) * 30;
      if (spk > 0.96) g -= 22;
      if (spk < 0.03) g += 14;
      // 模板浇筑横纹
      if (Math.abs(((y + 42) % 128) - 64) < 1.5) g -= 10;
      const i = (y * S + x) * 4;
      d[i] = clamp255(g * 1.01);
      d[i + 1] = clamp255(g * 0.99);
      d[i + 2] = clamp255(g * 0.95);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map };
}

// ---------- 粗粝花岗岩(雕塑用) ----------
function stoneCanvases() {
  const S = 512;
  const map = makeCanvas(S, S);
  const bump = makeCanvas(S, S);
  const mctx = map.getContext('2d');
  const bctx = bump.getContext('2d');
  const mimg = mctx.createImageData(S, S);
  const bimg = bctx.createImageData(S, S);
  const md = mimg.data, bd = bimg.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const n1 = ringFbm(u, v * 4.2, 2.1, 71.9, 5);   // 大块矿物斑
      const pit = ringFbm(u, v * 9.5, 4.6, 90.2, 3);   // 蚀坑
      const spk = hash2(x, y, 17.4);                   // 细晶粒
      let g = 122 + (n1 - 0.5) * 74;
      if (spk > 0.93) g -= 40;
      if (spk < 0.05) g += 30;
      let bumpV = n1 * 200;
      if (pit < 0.34) { g *= 0.7; bumpV -= 70; }
      const i = (y * S + x) * 4;
      md[i] = clamp255(g * 1.04);
      md[i + 1] = clamp255(g);
      md[i + 2] = clamp255(g * 0.93);
      md[i + 3] = 255;
      const bv = clamp255(bumpV + spk * 24);
      bd[i] = bd[i + 1] = bd[i + 2] = bv; bd[i + 3] = 255;
    }
  }
  mctx.putImageData(mimg, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  return { map, bump };
}

// ---------- 胡桃木纹(横向可平铺,车削件/画框/长凳共用) ----------
function woodCanvas() {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const dark = [52, 33, 20], mid = [96, 64, 38], light = [141, 102, 62];
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const broad = ringFbm(u, v * 2.2, 1.3, 40.5, 3);
      const fine = ringFbm(u, v * 30, 5.2, 63.1, 3);
      const band = 0.5 + 0.5 * Math.sin(broad * 24 + v * 5.2);
      let t = 0.44 * band + 0.36 * fine + 0.2 * broad;
      t = Math.max(0, Math.min(1, t));
      const col = t < 0.5 ? lerp3(dark, mid, t * 2) : lerp3(mid, light, (t - 0.5) * 2);
      const i = (y * S + x) * 4;
      d[i] = clamp255(col[0]); d[i + 1] = clamp255(col[1]); d[i + 2] = clamp255(col[2]);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ============================================================
// 画作:五种风格,种子驱动,幅幅不同
// ============================================================
function shadeHex(hex, amt) {
  const v = parseInt(hex.slice(1), 16);
  const r = clamp255(((v >> 16) & 255) + amt);
  const g = clamp255(((v >> 8) & 255) + amt);
  const b = clamp255((v & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

function paintMist(ctx, w, h, rnd) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#e8dfc8');
  sky.addColorStop(0.5, '#c9c3b4');
  sky.addColorStop(1, '#8e8f8c');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  const sun = ctx.createRadialGradient(w * 0.68, h * 0.28, 4, w * 0.68, h * 0.28, w * 0.3);
  sun.addColorStop(0, 'rgba(240,214,150,0.9)');
  sun.addColorStop(1, 'rgba(240,214,150,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const base = h * (0.36 + t * 0.56);
    const amp = 26 + rnd() * 60;
    const seed = rnd() * 100;
    const col = lerp3([176, 180, 176], [40, 52, 64], t);
    ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${0.7 + t * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const ridge = Math.abs(fbm((x / w) * 3 + seed, seed, seed, 4) - 0.5) * 2 * amp
        + fbm((x / w) * 9 + seed, 3.3, seed + 5, 3) * amp * 0.5;
      ctx.lineTo(x, base - ridge);
    }
    ctx.lineTo(w, h);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(232,226,208,${Math.max(0.04, 0.16 - t * 0.1)})`;
    ctx.fillRect(0, base + 6, w, 24 + rnd() * 18);
  }
}

function paintWaves(ctx, w, h, rnd) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#20343a'); bg.addColorStop(0.55, '#2e4a50'); bg.addColorStop(1, '#1a2a30');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const palette = ['#7fb2a8', '#c8b98a', '#4f7d7c', '#e4d9b8', '#35595e'];
  for (let i = 0; i < 26; i++) {
    const yBase = ((i + 0.5) / 26) * h;
    const amp = 4 + rnd() * 14;
    const freq = 2 + rnd() * 4;
    const ph = rnd() * Math.PI * 2;
    ctx.strokeStyle = palette[(rnd() * palette.length) | 0];
    ctx.globalAlpha = 0.25 + rnd() * 0.5;
    ctx.lineWidth = 1 + rnd() * 5;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = yBase + Math.sin((x / w) * Math.PI * 2 * freq + ph) * amp
        + Math.sin((x / w) * Math.PI * 2 * freq * 2.7 + ph * 1.7) * amp * 0.3;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(228,217,184,0.85)';
  ctx.beginPath();
  ctx.arc(w * (0.24 + rnd() * 0.2), h * 0.28, 20 + rnd() * 12, 0, Math.PI * 2);
  ctx.fill();
}

function paintGrid(ctx, w, h, rnd) {
  ctx.fillStyle = '#e9e0cd'; ctx.fillRect(0, 0, w, h);
  const colors = ['#b95c38', '#d9a441', '#5b6472', '#efe6d5', '#8a3b2e', '#33383f', '#c9a45c'];
  const rects = [];
  (function split(x, y, ww, hh, depth) {
    if (depth <= 0 || (ww < 90 && hh < 90) || rnd() < 0.16) { rects.push([x, y, ww, hh]); return; }
    if (ww > hh) {
      const cut = ww * (0.3 + rnd() * 0.4);
      split(x, y, cut, hh, depth - 1); split(x + cut, y, ww - cut, hh, depth - 1);
    } else {
      const cut = hh * (0.3 + rnd() * 0.4);
      split(x, y, ww, cut, depth - 1); split(x, y + cut, ww, hh - cut, depth - 1);
    }
  })(0, 0, w, h, 5);
  for (const [x, y, ww, hh] of rects) {
    const col = colors[(rnd() * colors.length) | 0];
    if (rnd() < 0.78) {
      const g = ctx.createLinearGradient(x, y, x, y + hh);
      g.addColorStop(0, col); g.addColorStop(1, shadeHex(col, -16));
      ctx.fillStyle = g; ctx.fillRect(x, y, ww, hh);
    }
    if (rnd() < 0.2) {
      ctx.fillStyle = 'rgba(40,42,48,0.85)';
      ctx.beginPath();
      ctx.arc(x + ww / 2, y + hh / 2, Math.min(ww, hh) * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = '#26262a'; ctx.lineWidth = 9;
  for (const [x, y, ww, hh] of rects) ctx.strokeRect(x, y, ww, hh);
  ctx.strokeRect(4, 4, w - 8, h - 8);
}

function paintPulse(ctx, w, h, rnd) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#101318'); bg.addColorStop(1, '#1c1a20');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const base = h * 0.78;
  const cols = ['#f0a840', '#e2674a', '#e8d5a8', '#9a5a3a'];
  for (let i = 0; i < 30; i++) {
    const x = rnd() * w, bw = 6 + rnd() * 30, bh = 30 + rnd() * h * 0.55;
    ctx.fillStyle = cols[(rnd() * cols.length) | 0];
    ctx.globalAlpha = 0.16 + rnd() * 0.5;
    ctx.fillRect(x, base - bh, bw, bh);
    if (rnd() < 0.5) {
      ctx.fillStyle = '#fce9c0'; ctx.globalAlpha = 0.9;
      ctx.fillRect(x, base - bh, bw, 3);
    }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffd27d'; ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(255,190,90,0.9)'; ctx.shadowBlur = 14;
  ctx.beginPath();
  const yLine = h * 0.3;
  ctx.moveTo(0, yLine);
  let x = 0;
  while (x < w) {
    x += 14 + rnd() * 30;
    if (rnd() < 0.28) {
      ctx.lineTo(x, yLine - (20 + rnd() * 60));
      x += 8 + rnd() * 10;
      ctx.lineTo(x, yLine + (12 + rnd() * 30));
      x += 8;
      ctx.lineTo(x, yLine);
    } else {
      ctx.lineTo(x, yLine + (rnd() - 0.5) * 10);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(240,168,64,0.08)';
  ctx.fillRect(0, base, w, h - base);
}

function paintGold(ctx, w, h, rnd) {
  const bg = ctx.createRadialGradient(w / 2, h * 0.55, 10, w / 2, h * 0.55, h * 0.75);
  bg.addColorStop(0, '#4a3822'); bg.addColorStop(1, '#241a10');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.54;
  const golds = ['#d9b256', '#f2d488', '#a87b2f', '#8a6a3a', '#f7e6b8'];
  for (let i = 0; i < 46; i++) {
    const r = 14 + i * ((h * 0.55) / 46) + rnd() * 8;
    const a0 = rnd() * Math.PI * 2, a1 = a0 + Math.PI * (0.4 + rnd() * 1.5);
    ctx.strokeStyle = golds[(rnd() * golds.length) | 0];
    ctx.globalAlpha = 0.2 + rnd() * 0.6;
    ctx.lineWidth = 1.5 + rnd() * 11;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const core = ctx.createRadialGradient(cx, cy, 2, cx, cy, 46);
  core.addColorStop(0, '#fbeecb'); core.addColorStop(1, 'rgba(217,178,86,0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = golds[(rnd() * golds.length) | 0];
    ctx.globalAlpha = 0.25 + rnd() * 0.6;
    const rr = rnd() * rnd() * h * 0.5;
    const an = rnd() * Math.PI * 2;
    ctx.fillRect(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr, 2, 2);
  }
  ctx.globalAlpha = 1;
}

const PAINTERS = { mist: paintMist, waves: paintWaves, grid: paintGrid, pulse: paintPulse, gold: paintGold };

function finishCanvasArt(ctx, w, h, rnd) {
  // 织物颗粒
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(rnd() * w, rnd() * h, 1.5, 1.5);
  }
  // 签名
  ctx.fillStyle = 'rgba(240,232,210,0.5)';
  ctx.font = 'italic 15px Georgia, serif';
  ctx.fillText('CF · 2026', w - 82, h - 14);
}

// ---------- 说明牌 ----------
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (line && ctx.measureText(line + ch).width > maxWidth) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function plaqueCanvas(no, title, sub, desc) {
  const W = 512, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#27241f'); bg.addColorStop(1, '#181613');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // 拉丝质感
  ctx.fillStyle = 'rgba(255,255,255,0.022)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.strokeStyle = 'rgba(201,164,92,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(9, 9, W - 18, H - 18);

  ctx.fillStyle = '#c9a45c';
  ctx.font = '600 38px Georgia, serif';
  ctx.fillText(String(no).padStart(2, '0'), 34, 62);
  ctx.strokeStyle = 'rgba(201,164,92,0.4)';
  ctx.beginPath(); ctx.moveTo(104, 48); ctx.lineTo(W - 34, 48); ctx.stroke();

  ctx.fillStyle = '#ece2ce';
  ctx.font = 'bold 47px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.fillText(`《${title}》`, 28, 126);
  ctx.fillStyle = '#a09681';
  ctx.font = '23px "Microsoft YaHei", sans-serif';
  ctx.fillText(sub, 34, 164);

  ctx.fillStyle = '#8f887a';
  ctx.font = '24px "Microsoft YaHei", sans-serif';
  const lines = wrapText(ctx, desc, W - 70);
  lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 34, 204 + i * 33));
  return c;
}

// ---------- 入口墙面主题字 ----------
function wallTitleCanvas() {
  const W = 1024, H = 512;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#37332b';
  ctx.font = '600 150px Georgia, "STZhongsong", "SimSun", serif';
  ctx.fillText('回 声 画 廊', 62, 170);
  ctx.fillStyle = '#8f7a4e';
  ctx.font = '600 44px Georgia, serif';
  ctx.fillText('E C H O   G A L L E R Y', 68, 246);
  ctx.fillStyle = '#55503f';
  ctx.font = '30px "Microsoft YaHei", sans-serif';
  const intro = ['光是展厅里最早到场的观众。', '八件作品沿一条动线依次亮起,', '请随灯光行走,直到金色的回响。'];
  intro.forEach((ln, i) => ctx.fillText(ln, 70, 330 + i * 52));
  return c;
}

// ---------- 环境贴图(PMREM 输入,室内明暗渐变) ----------
function envCanvas() {
  const W = 512, H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#313a48');
  g.addColorStop(0.42, '#5d5142');
  g.addColorStop(0.58, '#403528');
  g.addColorStop(1, '#0d0c0a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 顶部天窗亮带
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(213,228,255,${0.5 - i * 0.11})`;
    ctx.fillRect(W * 0.24 - i * 14, 10 - i * 2, W * 0.52 + i * 28, 30 + i * 8);
  }
  // 中部暖色射灯光斑
  const rnd = mulberry32(88);
  for (let i = 0; i < 9; i++) {
    const x = rnd() * W, y = H * (0.36 + rnd() * 0.14), r = 14 + rnd() * 30;
    const sp = ctx.createRadialGradient(x, y, 1, x, y, r);
    sp.addColorStop(0, 'rgba(255,214,150,0.75)');
    sp.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = sp;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 画作微光
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(226,205,168,0.16)';
    ctx.fillRect(rnd() * W, H * 0.44, 26 + rnd() * 40, 40);
  }
  return c;
}

// ---------- 接触阴影(烘焙感 AO) ----------
function aoCanvas() {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

// ============================================================
// 汇总出口
// ============================================================
export function createTextures(maxAniso = 4) {
  const aniso = Math.min(8, Math.max(1, maxAniso || 4));

  function toTex(canvas, { srgb = true, wrap = false, repeat = null } = {}) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.needsUpdate = true;
    return t;
  }

  const fl = floorCanvases();
  const pl = plasterCanvases();
  const co = concreteCanvases();
  const st = stoneCanvases();

  const envTex = new THREE.CanvasTexture(envCanvas());
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;

  return {
    envMap: envTex,
    floor: {
      map: toTex(fl.map),
      roughnessMap: toTex(fl.rough, { srgb: false }),
    },
    plaster: {
      map: toTex(pl.map, { wrap: true, repeat: [5, 1.6] }),
      bumpMap: toTex(pl.bump, { srgb: false, wrap: true, repeat: [5, 1.6] }),
    },
    concrete: { map: toTex(co.map, { wrap: true }) },
    stone: {
      map: toTex(st.map, { wrap: true, repeat: [2, 1] }),
      bumpMap: toTex(st.bump, { srgb: false, wrap: true, repeat: [2, 1] }),
    },
    wood: { map: toTex(woodCanvas(), { wrap: true }) },
    ao: toTex(aoCanvas()),
    wallTitle: toTex(wallTitleCanvas()),
    painting(style, seed, aspect = 0.75) {
      const w = 512, h = Math.round(512 * aspect);
      const c = makeCanvas(w, h);
      const ctx = c.getContext('2d');
      const rnd = mulberry32(seed);
      (PAINTERS[style] || paintMist)(ctx, w, h, rnd);
      finishCanvasArt(ctx, w, h, rnd);
      return toTex(c);
    },
    plaque(no, title, sub, desc) {
      return toTex(plaqueCanvas(no, title, sub, desc));
    },
  };
}
