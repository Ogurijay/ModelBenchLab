import * as THREE from 'three';

function makeCanvas(size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function finish(canvas, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function brickTexture() {
  const { canvas, ctx } = makeCanvas(64);
  ctx.fillStyle = '#8a3524';
  ctx.fillRect(0, 0, 64, 64);
  const rows = 4;
  const rowH = 64 / rows;
  ctx.strokeStyle = '#421910';
  ctx.lineWidth = 3;
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * rowH);
    ctx.lineTo(64, r * rowH);
    ctx.stroke();
  }
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 16;
    for (let c = -1; c < 3; c++) {
      const x = c * 32 + offset;
      ctx.beginPath();
      ctx.moveTo(x, r * rowH);
      ctx.lineTo(x, (r + 1) * rowH);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 0, 64, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 61, 64, 3);
  return finish(canvas);
}

export function steelTexture() {
  const { canvas, ctx } = makeCanvas(64);
  const grad = ctx.createLinearGradient(0, 0, 64, 64);
  grad.addColorStop(0, '#9aa4b8');
  grad.addColorStop(0.5, '#6b7386');
  grad.addColorStop(1, '#828b9e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(20,22,30,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 60, 60);
  ctx.fillStyle = 'rgba(230,235,245,0.9)';
  const rivets = [[6, 6], [58, 6], [6, 58], [58, 58], [32, 32]];
  for (const [x, y] of rivets) {
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,22,30,0.35)';
    ctx.beginPath();
    ctx.arc(x + 0.6, y + 0.6, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,235,245,0.9)';
  }
  return finish(canvas);
}

export function waterTexture() {
  const { canvas, ctx } = makeCanvas(64);
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#1c5fa8');
  grad.addColorStop(1, '#123f75');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(190,225,255,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = 8 + i * 16;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(16, y - 6, 48, y + 6, 64, y);
    ctx.stroke();
  }
  return finish(canvas);
}

export function iceTexture() {
  const { canvas, ctx } = makeCanvas(64);
  ctx.fillStyle = '#cdeeff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.4;
  const cracks = [[4, 6, 30, 22], [30, 22, 24, 50], [30, 22, 54, 30], [10, 40, 34, 44]];
  for (const [x1, y1, x2, y2] of cracks) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(0, 0, 64, 2);
  return finish(canvas);
}

export function groundTexture() {
  const { canvas, ctx } = makeCanvas(128);
  ctx.fillStyle = '#181b24';
  ctx.fillRect(0, 0, 128, 128);
  const rnd = mulberry32(7);
  for (let i = 0; i < 400; i++) {
    const x = rnd() * 128;
    const y = rnd() * 128;
    const v = rnd();
    ctx.fillStyle = `rgba(${v > 0.5 ? '255,255,255' : '0,0,0'},${(0.02 + v * 0.03).toFixed(3)})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.strokeStyle = 'rgba(90,98,120,0.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 32, 0);
    ctx.lineTo(i * 32, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * 32);
    ctx.lineTo(128, i * 32);
    ctx.stroke();
  }
  return finish(canvas);
}

export function emblemTexture() {
  const { canvas, ctx } = makeCanvas(64);
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = '#ffd84a';
  ctx.translate(32, 32);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a1 = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    const a2 = a1 + Math.PI / 5;
    ctx.lineTo(Math.cos(a1) * 24, Math.sin(a1) * 24);
    ctx.lineTo(Math.cos(a2) * 10, Math.sin(a2) * 10);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
