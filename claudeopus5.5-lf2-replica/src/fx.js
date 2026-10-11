// 特效:命中火花、血、尘土、碎片、闪光粒子,以及所有飞行道具的程序化绘制。
import { makeCanvas, shade, rnd, clamp } from './util.js';

const glowCache = new Map();
export function glow(color, r, core = '#ffffff') {
  const key = color + r + core;
  let c = glowCache.get(key);
  if (c) return c;
  c = makeCanvas(r * 2, r * 2);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, core);
  gr.addColorStop(0.25, core);
  gr.addColorStop(0.45, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, r * 2, r * 2);
  glowCache.set(key, c);
  return c;
}

export class Fx {
  constructor(world) { this.world = world; this.parts = []; }
  add(p) { p.t = 0; this.parts.push(p); if (this.parts.length > 600) this.parts.shift(); return p; }
  update() {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t++;
      if (p.vx) p.x += p.vx;
      if (p.vy) p.y += p.vy;
      if (p.vz) p.z += p.vz;
      if (p.g) p.vy += p.g;
      if (p.fr) { p.vx *= p.fr; p.vy *= p.fr; }
      if (p.floor && p.y > 0) { p.y = 0; p.vy = -p.vy * 0.3; p.vx *= 0.6; }
      if (p.t >= p.life) ps.splice(i, 1);
    }
  }
  spark(x, y, z, type) {
    this.add({ type: 'spark', kind: type, x, y, z, life: type === 'blast' ? 10 : type === 'heavy' ? 8 : 6, rot: rnd() * 6 });
    if (type === 'fire') for (let i = 0; i < 6; i++) this.flame(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16, z, 1);
    if (type === 'ice') this.shards(x, z, '#cdf3ff', y, 5);
    if (type === 'heavy' || type === 'break') for (let i = 0; i < 4; i++) this.add({ type: 'streak', x, y, z, vx: (rnd() - 0.5) * 10, vy: (rnd() - 0.8) * 8, life: 6, col: '#fff6c0' });
  }
  blood(x, y, z, dir) {
    for (let i = 0; i < 5; i++) this.add({ type: 'drop', x, y, z, vx: dir * (1 + rnd() * 3), vy: -2 - rnd() * 3, g: 0.6, life: 14, col: '#b00000', floor: false });
  }
  dust(x, z, s = 1) {
    for (let i = 0; i < 6 * s; i++) this.add({ type: 'dust', x: x + (rnd() - 0.5) * 30 * s, y: -2, z: z + (rnd() - 0.5) * 6, vx: (rnd() - 0.5) * 3 * s, vy: -rnd() * 1.2, life: 14 + rnd() * 10, r: 4 + rnd() * 5 * s });
  }
  sparkle(x, y, z, col) {
    for (let i = 0; i < 8; i++) this.add({ type: 'sparkle', x: x + (rnd() - 0.5) * 26, y: y + (rnd() - 0.5) * 30, z, vy: -0.8 - rnd(), life: 16 + rnd() * 10, col });
  }
  shards(x, z, col, y = -30, n = 10) {
    for (let i = 0; i < n; i++) this.add({ type: 'shard', x, y: y + (rnd() - 0.5) * 30, z, vx: (rnd() - 0.5) * 9, vy: -3 - rnd() * 6, g: 0.7, life: 20, col, rot: rnd() * 6, floor: true });
  }
  debris(x, y, z, id) {
    const col = id === 'box' ? '#9a6a34' : id === 'stone' ? '#8a8a8a' : '#c8b080';
    for (let i = 0; i < 10; i++) this.add({ type: 'chip', x, y: y - 10, z, vx: (rnd() - 0.5) * 10, vy: -3 - rnd() * 6, g: 0.8, life: 22, col, rot: rnd() * 6, floor: true });
    this.dust(x, z, 1);
  }
  flame(x, y, z, s = 1) {
    this.add({ type: 'flame', x, y, z, vx: (rnd() - 0.5) * 1.5, vy: -1 - rnd() * 1.5, life: 10 + rnd() * 8, r: (4 + rnd() * 4) * s });
  }
  smoke(x, y, z) { this.add({ type: 'smoke', x, y, z, vx: (rnd() - 0.5), vy: -0.8 - rnd() * 0.6, life: 24, r: 5 + rnd() * 4 }); }
  ring(x, y, z, col, r = 30) { this.add({ type: 'ring', x, y, z, life: 12, col, r }); }
  text(x, y, z, str, col = '#fff') { this.add({ type: 'text', x, y, z, vy: -0.6, life: 40, str, col }); }
  afterimage(f, sprite) { this.add({ type: 'ghost', x: f.x, y: f.y, z: f.z, life: 8, sprite, facing: f.facing }); }
  trail(p) {
    const d = p.def;
    const t = d.trail;
    if (t === 'fire') this.flame(p.x - p.vx * 0.5, p.y + (rnd() - 0.5) * 8, p.z, 0.8);
    else if (t === 'smoke') this.smoke(p.x, p.y, p.z);
    else this.add({ type: 'sparkle', x: p.x - p.vx * 0.6, y: p.y + (rnd() - 0.5) * 6, z: p.z, life: 8, col: t, vy: 0 });
  }

  // 画:layer 'ground'(人物之前)或 'top'(人物之后)
  draw(ctx, camX, layer) {
    for (const p of this.parts) {
      const ground = p.type === 'dust' || p.type === 'shadowfx';
      if ((layer === 'ground') !== ground) continue;
      const sx = p.x - camX, sy = p.z + p.y;
      const k = p.t / p.life;
      switch (p.type) {
        case 'spark': drawSpark(ctx, p, sx, sy, k); break;
        case 'streak':
          ctx.strokeStyle = p.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - p.vx * 1.5, sy - p.vy * 1.5); ctx.stroke(); break;
        case 'drop': ctx.fillStyle = p.col; ctx.fillRect(sx - 1, sy - 1, 3, 3); break;
        case 'dust':
          ctx.globalAlpha = 0.45 * (1 - k); ctx.fillStyle = '#d8cfb8';
          ctx.beginPath(); ctx.arc(sx, sy, p.r * (0.6 + k), 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'sparkle': {
          ctx.globalAlpha = 1 - k; ctx.fillStyle = p.col;
          const s = 3 * (1 - k) + 1;
          ctx.fillRect(sx - s, sy - 0.5, s * 2, 1.5); ctx.fillRect(sx - 0.5, sy - s, 1.5, s * 2);
          ctx.globalAlpha = 1; break;
        }
        case 'shard': case 'chip':
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot + p.t * 0.3);
          ctx.fillStyle = p.col; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(3, -1); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore(); break;
        case 'flame': {
          const r = p.r * (1 - k * 0.6);
          ctx.globalAlpha = 1 - k * 0.7;
          ctx.drawImage(glow(k < 0.4 ? '#ffb020' : '#ff4010', 16, '#fff2a0'), sx - r * 1.4, sy - r * 1.4, r * 2.8, r * 2.8);
          ctx.globalAlpha = 1; break;
        }
        case 'smoke':
          ctx.globalAlpha = 0.35 * (1 - k); ctx.fillStyle = '#555';
          ctx.beginPath(); ctx.arc(sx, sy, p.r * (1 + k), 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'ring':
          ctx.globalAlpha = 1 - k; ctx.strokeStyle = p.col; ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.beginPath(); ctx.ellipse(sx, sy, p.r * (0.3 + k), p.r * (0.3 + k) * 0.5, 0, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1; break;
        case 'text':
          ctx.globalAlpha = 1 - k * k; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
          ctx.fillStyle = '#000'; ctx.fillText(p.str, sx + 1, sy + 1); ctx.fillStyle = p.col; ctx.fillText(p.str, sx, sy);
          ctx.globalAlpha = 1; ctx.textAlign = 'left'; break;
        case 'ghost':
          if (p.sprite) {
            ctx.globalAlpha = 0.4 * (1 - k);
            ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); if (p.facing < 0) ctx.scale(-1, 1);
            ctx.drawImage(p.sprite.canvas, -72, -124); ctx.restore(); ctx.globalAlpha = 1;
          }
          break;
      }
    }
  }
}

function star(ctx, x, y, r1, r2, n, rot) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i & 1 ? r2 : r1, a = rot + (i * Math.PI) / n;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function drawSpark(ctx, p, sx, sy, k) {
  const kind = p.kind;
  if (kind === 'sharp') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath(); ctx.moveTo(sx - 14, sy - 10); ctx.lineTo(sx + 14, sy + 10); ctx.stroke();
    ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx - 12, sy - 8); ctx.lineTo(sx + 12, sy + 8); ctx.moveTo(sx - 10, sy + 6); ctx.lineTo(sx + 8, sy - 8); ctx.stroke();
    return;
  }
  if (kind === 'block') {
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 6 + k * 14, -1.2, 1.2); ctx.stroke(); ctx.globalAlpha = 1;
    return;
  }
  if (kind === 'blast') {
    const r = 10 + k * 26;
    ctx.globalAlpha = 1 - k;
    ctx.drawImage(glow('#ffd060', 32, '#ffffff'), sx - r, sy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    return;
  }
  const big = kind === 'heavy' || kind === 'break';
  const r1 = (big ? 18 : 12) * (k < 0.3 ? k / 0.3 : 1 - (k - 0.3) * 0.8);
  const col = kind === 'fire' ? '#ffb030' : kind === 'ice' ? '#b8f0ff' : kind === 'break' ? '#9fd8ff' : '#fffbe0';
  ctx.fillStyle = '#000';
  star(ctx, sx, sy, r1 + 2, r1 * 0.35 + 1, 8, p.rot); ctx.fill();
  ctx.fillStyle = col;
  star(ctx, sx, sy, r1, r1 * 0.35, 8, p.rot); ctx.fill();
  ctx.fillStyle = '#fff';
  star(ctx, sx, sy, r1 * 0.5, r1 * 0.2, 8, p.rot + 0.2); ctx.fill();
}

// ---------------------------------------------------------------- 飞行道具绘制
export function drawProj(ctx, p, camX) {
  const d = p.def;
  if (p.t <= 0) return;
  const sx = Math.round(p.x - camX), sy = Math.round(p.z + p.y - (d.yOff || 0));
  const R = PR[d.render];
  if (p.state === 'hit') {
    if (d.hitRender && PR[d.hitRender]) PR[d.hitRender](ctx, p, sx, sy, p.hitT / (d.hitTime ?? 10));
    else PR.burst(ctx, p, sx, sy, p.hitT / (d.hitTime ?? 10));
    return;
  }
  if (R) R(ctx, p, sx, sy);
}
// 影子
export function drawProjShadow(ctx, p, camX) {
  const d = p.def;
  if (d.noShadow || p.t <= 0 || p.state !== 'fly') return;
  const sx = p.x - camX, sy = p.z;
  const s = clamp(1 + p.y / 200, 0.3, 1) * (d.size || 10);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(sx, sy, s, s * 0.35, 0, 0, 6.3); ctx.fill();
}

const PR = {
  ball(ctx, p, x, y) {
    const d = p.def, r = (d.r || 11) * p.scale;
    const c = d.color || '#3aa0ff';
    const wob = Math.sin(p.t * 1.3) * 1.5;
    // 尾焰
    ctx.globalAlpha = 0.5;
    ctx.drawImage(glow(c, 24, shade(c, 0.5)), x - p.facing * r * 1.6 - r, y - r * 0.7, r * 2, r * 1.4);
    ctx.globalAlpha = 0.3;
    ctx.drawImage(glow(c, 24, shade(c, 0.5)), x - p.facing * r * 2.8 - r * 0.7, y - r * 0.5, r * 1.4, r);
    ctx.globalAlpha = 1;
    ctx.drawImage(glow(c, 32, '#ffffff'), x - r * 1.6 - wob, y - r * 1.6 - wob, (r * 1.6 + wob) * 2, (r * 1.6 + wob) * 2);
  },
  fireball(ctx, p, x, y) {
    const r = (p.def.r || 12) * p.scale;
    for (let i = 3; i >= 0; i--) {
      const ox = -p.facing * i * r * 0.55, oy = Math.sin(p.t * 0.9 + i) * 2;
      const rr = r * (1 - i * 0.18);
      ctx.drawImage(glow(i ? '#ff5010' : '#ffa020', 24, i ? '#ffb040' : '#fff6c0'), x + ox - rr * 1.4, y + oy - rr * 1.4, rr * 2.8, rr * 2.8);
    }
  },
  iceball(ctx, p, x, y) {
    const r = (p.def.r || 11) * p.scale;
    ctx.drawImage(glow('#60c8ff', 24, '#e8fbff'), x - r * 1.7, y - r * 1.7, r * 3.4, r * 3.4);
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.t * 0.25);
    ctx.fillStyle = '#e8fbff'; ctx.strokeStyle = '#2a7ab0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.lineTo(Math.cos(a + 0.5) * r * 0.3, Math.sin(a + 0.5) * r * 0.3); } ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
  },
  disk(ctx, p, x, y) {
    const r = (p.def.r || 12) * p.scale, c = p.def.color || '#c060ff';
    ctx.drawImage(glow(c, 24, '#ffffff'), x - r * 1.6, y - r * 0.9, r * 3.2, r * 1.8);
    ctx.fillStyle = shade(c, 0.4); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.38, 0, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff';
    const a = p.t * 0.8;
    ctx.fillRect(x + Math.cos(a) * r * 0.7 - 1, y + Math.sin(a) * r * 0.25 - 1, 3, 2);
    ctx.fillRect(x - Math.cos(a) * r * 0.7 - 1, y - Math.sin(a) * r * 0.25 - 1, 3, 2);
  },
  arrow(ctx, p, x, y) {
    const ang = Math.atan2(p.vy, p.vx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.strokeStyle = p.def.color || '#c89a50'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.fillStyle = '#d0d8e0'; ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(8, -3); ctx.lineTo(8, 3); ctx.fill();
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(-17, -3, 5, 2); ctx.fillRect(-17, 1, 5, 2);
    if (p.def.glowArrow) ctx.drawImage(glow(p.def.glowArrow, 16), -18, -9, 36, 18);
    ctx.restore();
  },
  shuriken(ctx, p, x, y) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.t * 0.9);
    ctx.fillStyle = '#c8d0d8'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
    star(ctx, 0, 0, 6, 2, 4, 0); ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  blade(ctx, p, x, y) {
    const c = p.def.color || '#9ff0ff', r = (p.def.r || 16) * p.scale;
    ctx.save(); ctx.translate(x, y); ctx.scale(p.facing, 1);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(glow(c, 24, '#ffffff'), -r * 0.6, -r * 1.3, r * 1.4, r * 2.6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 1.2); ctx.quadraticCurveTo(r * 0.9, 0, -r * 0.2, r * 1.2); ctx.quadraticCurveTo(r * 0.35, 0, -r * 0.2, -r * 1.2); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
  },
  icicle(ctx, p, x, y) {
    const life = p.def.life, t = p.t;
    const grow = clamp(t / 4, 0, 1) * (t > life - 6 ? (life - t) / 6 : 1);
    const h = (p.def.h || 46) * grow * p.scale, w = 9 * p.scale;
    const gy = p.z;
    ctx.fillStyle = '#cdf3ff'; ctx.strokeStyle = '#2a6a9a'; ctx.lineWidth = 1.5;
    for (const [ox, k] of [[-7, 0.6], [6, 0.75], [0, 1]]) {
      ctx.beginPath(); ctx.moveTo(x + ox - w * 0.6, gy); ctx.lineTo(x + ox, gy - h * k); ctx.lineTo(x + ox + w * 0.6, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, gy - h * 0.8, 2, h * 0.5);
  },
  flame(ctx, p, x, y) {
    const k = p.t / p.def.life, r = (8 + k * 14) * p.scale;
    ctx.globalAlpha = 1 - k * 0.5;
    ctx.drawImage(glow(k < 0.5 ? '#ff9010' : '#ff3000', 24, '#fff4b0'), x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
    ctx.globalAlpha = 1;
  },
  firepatch(ctx, p, x, y) {
    const k = p.t / p.def.life;
    for (let i = 0; i < 3; i++) {
      const fx = x + (i - 1) * 8, fh = 10 + Math.sin(p.t * 0.7 + i * 2) * 5;
      ctx.globalAlpha = 0.9 * (1 - k * 0.6);
      ctx.drawImage(glow('#ff5010', 16, '#ffd060'), fx - 8, p.z - fh - 8, 16, fh + 10);
    }
    ctx.globalAlpha = 1;
  },
  explosion(ctx, p, x, y) {
    const k = p.t / p.def.life, r = (p.def.r || 50) * (0.3 + k * 0.9) * p.scale;
    ctx.globalAlpha = 1 - k * 0.7;
    ctx.drawImage(glow('#ff6010', 48, '#fff8c0'), x - r, y - r, r * 2, r * 2);
    ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, p.z, r * 1.1, r * 0.4, 0, 0, 6.3); ctx.stroke();
    ctx.globalAlpha = 1;
  },
  tornado(ctx, p, x, y) {
    const c = p.def.color || '#d8f4ff', h = (p.def.h || 90) * p.scale;
    const gy = p.z + p.y;
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < 12; i++) {
      const yy = gy - (i / 12) * h;
      const w = 8 + i * 2.6;
      const off = Math.sin(p.t * 0.6 + i * 0.7) * 6;
      ctx.strokeStyle = i % 2 ? c : shade(c, -0.25); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x + off, yy, w, w * 0.25, 0, (p.t * 0.5 + i) % 6.3, (p.t * 0.5 + i) % 6.3 + 4.2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  shield(ctx, p, x, y) {
    const k = Math.min(1, p.t / 4) * (p.life < 8 ? p.life / 8 : 1);
    const h = 70 * k, w = 22;
    const gy = p.z + p.y;
    ctx.globalAlpha = 0.45 + Math.sin(p.t * 0.5) * 0.1;
    ctx.fillStyle = p.def.color || '#80c0ff';
    ctx.beginPath(); ctx.ellipse(x, gy - h / 2, w * 0.5, h / 2, 0, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, gy - h / 2, w * 0.5, h / 2, 0, -1.5, 1.5); ctx.stroke();
    ctx.globalAlpha = 1;
  },
  heal(ctx, p, x, y) {
    const r = 9;
    ctx.drawImage(glow('#40ff60', 24, '#f0fff0'), x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 5, 3, 11); ctx.fillRect(x - 5, y - 1, 11, 3);
  },
  bolt(ctx, p, x, y) {
    const k = p.t / p.def.life;
    const gy = p.z;
    ctx.strokeStyle = '#fffff0'; ctx.lineWidth = 3;
    ctx.globalAlpha = 1 - k * 0.5;
    ctx.beginPath(); let yy = gy - 300, xx = x;
    ctx.moveTo(xx, yy);
    while (yy < gy) { yy += 18; xx = x + (rnd() - 0.5) * 18; ctx.lineTo(xx, yy); }
    ctx.stroke();
    ctx.strokeStyle = '#80b0ff'; ctx.lineWidth = 7; ctx.globalAlpha = 0.3; ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.drawImage(glow('#80b0ff', 24, '#ffffff'), x - 24, gy - 16, 48, 24);
  },
  skull(ctx, p, x, y) {
    const r = 10 * p.scale;
    ctx.drawImage(glow('#9040ff', 24, '#e0c0ff'), x - r * 2, y - r * 2, r * 4, r * 4);
    ctx.fillStyle = '#f0f0f0'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y - 1, r * 0.8, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - r * 0.45, y + r * 0.4, r * 0.9, r * 0.5);
    ctx.fillStyle = '#300050'; ctx.fillRect(x - r * 0.45, y - r * 0.4, r * 0.3, r * 0.35); ctx.fillRect(x + r * 0.15, y - r * 0.4, r * 0.3, r * 0.35);
  },
  bat(ctx, p, x, y) {
    const f = Math.sin(p.t * 1.2) > 0;
    ctx.fillStyle = '#1a1020'; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y, 4, 3, 0, 0, 6.3); ctx.fill();
    ctx.beginPath();
    if (f) { ctx.moveTo(x, y); ctx.lineTo(x - 12, y - 7); ctx.lineTo(x - 8, y + 1); ctx.moveTo(x, y); ctx.lineTo(x + 12, y - 7); ctx.lineTo(x + 8, y + 1); }
    else { ctx.moveTo(x, y); ctx.lineTo(x - 12, y + 5); ctx.lineTo(x - 6, y - 1); ctx.moveTo(x, y); ctx.lineTo(x + 12, y + 5); ctx.lineTo(x + 6, y - 1); }
    ctx.fill();
    ctx.fillStyle = '#ff2020'; ctx.fillRect(x + p.facing * 2 - 1, y - 1, 2, 1);
  },
  rock(ctx, p, x, y) {
    const r = (p.def.r || 12) * p.scale;
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.t * 0.2);
    ctx.fillStyle = '#8a7a6a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); for (let i = 0; i < 7; i++) { const a = i * 0.9; ctx.lineTo(Math.cos(a) * r * (0.8 + (i % 2) * 0.25), Math.sin(a) * r * (0.8 + (i % 3) * 0.12)); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a89888'; ctx.fillRect(-r * 0.4, -r * 0.5, r * 0.4, r * 0.3);
    ctx.restore();
  },
  wave(ctx, p, x, y) { // 地面冲击波
    const c = p.def.color || '#ffe080';
    const gy = p.z;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 3; i++) {
      const h = 14 + Math.sin(p.t * 0.8 + i) * 6 + i * 6;
      ctx.drawImage(glow(c, 16, '#ffffff'), x - p.facing * i * 10 - 9, gy - h, 18, h + 4);
    }
    ctx.globalAlpha = 1;
  },
  palm(ctx, p, x, y) {
    const r = (p.def.r || 16) * p.scale;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(glow(p.def.color || '#ffd040', 32, '#ffffff'), x - r * 1.5, y - r * 1.5, r * 3, r * 3);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - p.facing * 4, y, r * 0.9, p.facing > 0 ? -1.2 : 1.9, p.facing > 0 ? 1.2 : 4.3); ctx.stroke();
    ctx.globalAlpha = 1;
  },
  invisible() {},
  burst(ctx, p, x, y, k) {
    const c = p.def.color || '#ffd060';
    const r = ((p.def.r || 10) + 6 + k * 18) * p.scale;
    ctx.globalAlpha = 1 - k;
    ctx.drawImage(glow(c, 32, '#ffffff'), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  },
  shatter(ctx, p, x, y, k) {
    ctx.globalAlpha = 1 - k; ctx.fillStyle = '#e8fbff';
    for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.fillRect(x + Math.cos(a) * k * 20 - 2, p.z - 10 - Math.sin(a) * k * 20 - 2, 4, 4); }
    ctx.globalAlpha = 1;
  },
};
export const PROJ_RENDERERS = PR;
