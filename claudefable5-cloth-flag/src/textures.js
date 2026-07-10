import * as THREE from 'three';

/**
 * 全部纹理程序化生成(canvas),零外部资产。
 */

/** 旗面图案:「乘风」主题 —— 深海蓝底、金色旭日、波浪饰带、织物经纬纹理 */
export function makeFlagTexture(anisotropy = 4) {
  const w = 1024;
  const h = 684; // 3:2 旗面比例
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');

  // 底色:深靛蓝 → 湛蓝斜向渐变
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#123a63');
  grad.addColorStop(0.55, '#175a86');
  grad.addColorStop(1, '#1c6f96');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 底部三层波浪饰带(白 / 金 / 深)
  drawWaveBand(ctx, w, h, h * 0.76, 18, 2.2, 0.6, 'rgba(233,238,242,0.92)');
  drawWaveBand(ctx, w, h, h * 0.84, 16, 2.6, 2.4, '#e3b04b');
  drawWaveBand(ctx, w, h, h * 0.9, 12, 3.1, 4.6, '#0f3355');

  // 旗首上方的金色旭日
  drawSun(ctx, w * 0.26, h * 0.36, h * 0.16);

  // 「乘风」题字
  ctx.save();
  ctx.font = '600 150px "Noto Serif SC", "STSong", "SimSun", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(8, 28, 46, 0.4)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = 'rgba(248, 246, 238, 0.94)';
  ctx.fillText('乘风', w * 0.64, h * 0.38);
  ctx.restore();

  // 旗首套边(浅色布条 + 缝线)
  ctx.fillStyle = 'rgba(236, 233, 225, 0.95)';
  ctx.fillRect(0, 0, 18, h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(26, h);
  ctx.stroke();
  ctx.restore();

  addFabricWeave(ctx, w, h);

  // 边缘暗角,增加布面体积感
  const vg = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.72);
  vg.addColorStop(0, 'rgba(6, 20, 36, 0)');
  vg.addColorStop(1, 'rgba(6, 20, 36, 0.18)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function drawWaveBand(ctx, w, h, yBase, amp, cycles, phase, color) {
  ctx.beginPath();
  ctx.moveTo(0, yBase);
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const y = yBase + Math.sin((i / n) * Math.PI * 2 * cycles + phase) * amp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSun(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  // 光环
  const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.4);
  glow.addColorStop(0, 'rgba(247, 212, 137, 0.5)');
  glow.addColorStop(1, 'rgba(247, 212, 137, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  // 十二道光芒
  ctx.fillStyle = '#edbf5b';
  for (let k = 0; k < 12; k++) {
    ctx.save();
    ctx.rotate((k / 12) * Math.PI * 2);
    ctx.beginPath();
    ctx.moveTo(r * 1.18, -r * 0.13);
    ctx.lineTo(r * 1.75, 0);
    ctx.lineTo(r * 1.18, r * 0.13);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // 日轮主体
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#f9dc8f');
  body.addColorStop(1, '#e8ae3f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.8)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

/** 织物经纬线 + 噪点,让旗面有布料质感 */
function addFabricWeave(ctx, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
  ctx.fillStyle = '#fff';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.restore();
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,10,20,0.06)';
    ctx.fillRect(x, y, 2, 2);
  }
}

/** 草地纹理:色斑 + 草叶笔触,四方连续(边缘 9 宫格环绕绘制避免接缝) */
export function makeGroundTexture(anisotropy = 4) {
  const s = 512;
  const cv = document.createElement('canvas');
  cv.width = s;
  cv.height = s;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#66854c';
  ctx.fillRect(0, 0, s, s);

  const wraps = [-s, 0, s];
  const patchColors = ['#5d7c45', '#6f8f53', '#587343', '#71935a', '#4f6b3e'];
  // 大块色斑
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const rx = 14 + Math.random() * 52;
    const ry = rx * (0.5 + Math.random() * 0.8);
    const rot = Math.random() * Math.PI;
    ctx.fillStyle = patchColors[(Math.random() * patchColors.length) | 0];
    ctx.globalAlpha = 0.12 + Math.random() * 0.12;
    for (const ox of wraps) {
      for (const oy of wraps) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  // 草叶短笔触
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const len = 3 + Math.random() * 5;
    const dx = (Math.random() - 0.5) * 3;
    const gShade = 100 + (Math.random() * 60) | 0;
    ctx.strokeStyle = `rgba(${gShade - 60}, ${gShade + 20}, ${gShade - 55}, 0.35)`;
    ctx.lineWidth = 1;
    for (const ox of wraps) {
      for (const oy of wraps) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + dx + ox, y - len + oy);
        ctx.stroke();
      }
    }
  }

  // 零星小花点
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(222, 216, 172, 0.55)' : 'rgba(214, 226, 236, 0.45)';
    for (const ox of wraps) {
      for (const oy of wraps) {
        ctx.fillRect(x + ox, y + oy, 2, 2);
      }
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = anisotropy;
  return tex;
}
