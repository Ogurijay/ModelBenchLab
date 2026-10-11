// 粒子与特效(纯视觉,使用 Math.random,不影响逻辑复现)。全部在世界坐标绘制。
import { vr, rgba } from './util.js';

const glowCache = new Map();
export function glow(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.35, rgba(color, 0.55)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}
export function drawGlow(ctx, x, y, r, color, a = 1) {
  if (r <= 0) return;
  const pa = ctx.globalAlpha; ctx.globalAlpha = pa * a;
  ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = pa;
}

// 闪电折线
export function boltPath(x1, y1, x2, y2, jag = 10, n = 8) {
  const pts = [[x1, y1]];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([x1 + (x2 - x1) * t + vr(-jag, jag), y1 + (y2 - y1) * t + vr(-jag, jag)]);
  }
  pts.push([x2, y2]);
  return pts;
}
export function strokeBolt(ctx, pts, color, w) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.strokeStyle = color; ctx.lineWidth = w * 2.6; ctx.globalAlpha *= 0.35; ctx.stroke(); ctx.globalAlpha /= 0.35;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w; ctx.stroke();
}

export class FX {
  constructor() { this.parts = []; this.back = []; this.shakeT = 0; this.shakeMag = 0; this.flashT = 0; this.flashC = '#fff'; this.flashMax = 1; }
  add(p, behind) { p.t = 0; (behind ? this.back : this.parts).push(p); if (this.parts.length > 900) this.parts.splice(0, 100); return p; }
  shake(m, t = 10) { if (m >= this.shakeMag || this.shakeT <= 0) { this.shakeMag = m; this.shakeT = t; } }
  flash(c = '#fff', t = 6) { this.flashC = c; this.flashT = t; this.flashMax = t; }
  update() {
    for (const L of [this.parts, this.back]) {
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.t++;
        if (p.vx !== undefined) { p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; } }
        if (p.spin) p.rot = (p.rot || 0) + p.spin;
        if (p.floor && p.y > 0) { p.y = 0; p.vy *= -0.3; p.vx *= 0.7; }
        if (p.t >= p.life) L.splice(i, 1);
      }
    }
    if (this.shakeT > 0) this.shakeT--;
    if (this.flashT > 0) this.flashT--;
  }
  shakeOffset() { if (this.shakeT <= 0) return [0, 0]; const m = this.shakeMag * (this.shakeT / 10 + 0.3); return [vr(-m, m), vr(-m, m)]; }

  // ---------------------------------------------------------------- 发射器
  spark(x, y, dir, kind = 'hit', big = false) {
    const S = big ? 1.5 : 1;
    const col = { hit: '#ffe9a0', heavy: '#ffd060', blade: '#e8f6ff', fire: '#ff8a2a', elec: '#9ad8ff', ice: '#bff4ff', guard: '#9fd0ff', sand: '#e0c088', water: '#7ac8ff', dark: '#c040ff', petal: '#ffb0d0', wind: '#d0ffe8', gold: '#ffe060' }[kind] || '#fff';
    this.add({ type: 'flare', x, y, r: 26 * S, color: col, life: 7 });
    if (kind === 'blade') {
      const a = vr(-0.6, 0.6) + (dir > 0 ? 0 : Math.PI);
      this.add({ type: 'slashline', x, y, a: a + vr(-0.4, 0.4) + 0.8, len: 70 * S, w: 5 * S, color: '#ffffff', glowc: '#9ad0ff', life: 8 });
      this.add({ type: 'slashline', x, y, a: a - 0.7, len: 50 * S, w: 3 * S, color: '#ffffff', glowc: '#9ad0ff', life: 7 });
    }
    if (kind === 'guard') { this.add({ type: 'hexa', x, y, r: 24, color: col, life: 10, dir }); }
    const n = big ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = vr(0, Math.PI * 2);
      const sp = vr(3, 9) * S;
      this.add({ type: 'streak', x, y, vx: Math.cos(a) * sp + dir * 2, vy: Math.sin(a) * sp, drag: 0.82, len: vr(6, 14) * S, color: col, life: vr(8, 14) | 0 });
    }
    if (kind === 'elec') for (let i = 0; i < 3; i++) this.add({ type: 'bolt', x1: x, y1: y, x2: x + vr(-50, 50), y2: y + vr(-50, 50), color: '#6ab8ff', w: 1.6, life: 6 });
    if (kind === 'fire') this.fireBurst(x, y, 8, 0.8);
    if (kind === 'ice') this.shards(x, y, 6, '#d8fbff');
    if (kind === 'sand') this.burst(x, y, '#d8b878', 10, 5, 'dot', 0.15);
    if (kind === 'dark') this.burst(x, y, '#9a30ff', 8, 5, 'glowdot');
    if (kind === 'petal') this.petals(x, y, 8, 4);
    if (big || kind === 'heavy') this.add({ type: 'ring', x, y, r0: 10, r1: 70 * S, w: 4, color: '#ffffff', life: 10 });
  }
  burst(x, y, color, n = 10, sp = 5, type = 'glowdot', g = 0) {
    for (let i = 0; i < n; i++) { const a = vr(0, 6.283), s = vr(sp * 0.3, sp); this.add({ type, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g, drag: 0.9, r: vr(2, 5), color, life: vr(14, 28) | 0 }); }
  }
  dust(x, y, n = 6, color = '#c8b090', dir = 0) {
    for (let i = 0; i < n; i++) this.add({ type: 'smoke', x: x + vr(-12, 12), y: y - vr(0, 6), vx: vr(-2.2, 2.2) + dir * vr(0, 2), vy: vr(-1.4, -0.2), drag: 0.93, r: vr(6, 13), grow: 0.35, color, a: 0.55, life: vr(18, 30) | 0 }, true);
  }
  smoke(x, y, n = 10, color = '#f2f2f2', size = 1) {
    for (let i = 0; i < n; i++) this.add({ type: 'smoke', x: x + vr(-14, 14) * size, y: y + vr(-30, 10) * size, vx: vr(-2, 2), vy: vr(-2, 0.5), drag: 0.92, r: vr(10, 20) * size, grow: 0.6, color, a: 0.9, life: vr(22, 36) | 0 });
  }
  ring(x, y, r0, r1, color = '#fff', life = 14, w = 4, flat = 1) { this.add({ type: 'ring', x, y, r0, r1, color, life, w, flat }); }
  fireBurst(x, y, n = 14, s = 1) {
    for (let i = 0; i < n; i++) { const a = vr(0, 6.283), sp = vr(1, 6) * s; this.add({ type: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, drag: 0.9, r: vr(8, 18) * s, life: vr(14, 26) | 0 }); }
  }
  explosion(x, y, s = 1, color = '#ff9a3a') {
    this.add({ type: 'flare', x, y, r: 110 * s, color: '#fff2c0', life: 10 });
    this.ring(x, y, 20 * s, 150 * s, '#ffe0a0', 16, 6);
    this.fireBurst(x, y, 22, 1.4 * s);
    this.smoke(x, y - 10, 10, '#5a4a48', 1.3 * s);
    this.shake(9 * s, 14);
  }
  shards(x, y, n, color = '#d8fbff') {
    for (let i = 0; i < n; i++) { const a = vr(0, 6.283), sp = vr(2, 7); this.add({ type: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, g: 0.35, rot: vr(0, 6), spin: vr(-0.3, 0.3), r: vr(3, 7), color, life: vr(20, 34) | 0, floor: true }); }
  }
  petals(x, y, n, sp = 3) {
    for (let i = 0; i < n; i++) { const a = vr(0, 6.283), s = vr(0.5, sp); this.add({ type: 'petal', x: x + vr(-6, 6), y: y + vr(-6, 6), vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.02, drag: 0.96, rot: vr(0, 6), spin: vr(-0.25, 0.25), r: vr(2.5, 4), color: Math.random() < 0.3 ? '#fff0f6' : '#ff9ac4', life: vr(30, 60) | 0 }); }
  }
  feathers(x, y, n) {
    for (let i = 0; i < n; i++) this.add({ type: 'crow', x: x + vr(-20, 20), y: y + vr(-50, 10), vx: vr(-4, 4), vy: vr(-4, -0.5), drag: 0.97, rot: 0, flap: vr(0, 6), s: vr(0.6, 1.1), life: vr(26, 44) | 0 });
  }
  leaves(x, y, n) {
    for (let i = 0; i < n; i++) this.add({ type: 'petal', x: x + vr(-10, 10), y: y + vr(-50, 0), vx: vr(-3, 3), vy: vr(-3, 0), g: 0.06, drag: 0.96, rot: vr(0, 6), spin: vr(-0.2, 0.2), r: vr(3, 5), color: Math.random() < 0.5 ? '#4aa040' : '#7ac050', life: vr(30, 50) | 0 });
  }
  log(x, y) { this.add({ type: 'log', x, y, vx: vr(-1, 1), vy: -3, g: 0.4, rot: 0, spin: vr(-0.15, 0.15), life: 40, floor: true }); }
  text(x, y, str, color = '#fff', size = 22, life = 50) { this.add({ type: 'text', x, y, vy: -0.8, vx: 0, str, color, size, life }); }
  slashArc(x, y, face, r, a0, a1, color = '#ffffff', life = 9, w = 16) { this.add({ type: 'arc', x, y, face, r, a0, a1, color, life, w }); }
  bolt(x1, y1, x2, y2, color = '#8ad0ff', life = 6, w = 2) { this.add({ type: 'bolt', x1, y1, x2, y2, color, life, w }); }
  afterimage(img) { this.add({ type: 'after', ...img, life: img.life || 12 }, true); }
  speedLines(x, y, dir, color = '#ffffff') { for (let i = 0; i < 6; i++) this.add({ type: 'streak', x: x - dir * vr(0, 60), y: y + vr(-50, 10), vx: -dir * vr(4, 10), vy: 0, len: vr(20, 40), color, life: 8 }); }

  // ---------------------------------------------------------------- 绘制
  draw(ctx, behind, drawFigure) {
    const L = behind ? this.back : this.parts;
    for (const p of L) {
      const k = p.t / p.life, a = 1 - k;
      switch (p.type) {
        case 'flare': ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, p.y, p.r * (1 - k * 0.4), p.color, a); ctx.globalCompositeOperation = 'source-over'; break;
        case 'glowdot': ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, p.y, p.r * 3 * a + 2, p.color, a); ctx.globalCompositeOperation = 'source-over'; break;
        case 'dot': ctx.globalAlpha = a; ctx.fillStyle = p.color; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); ctx.globalAlpha = 1; break;
        case 'streak': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.color; ctx.globalAlpha = a; ctx.lineWidth = 2.4 * a + 0.6;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / sp * p.len, p.y - p.vy / sp * p.len); ctx.stroke();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'slashline': {
          const l = p.len * (0.6 + k * 0.6), w = p.w * a;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
          ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, 0, l * 0.6, p.glowc, a * 0.5);
          ctx.fillStyle = p.color; ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(-l, 0); ctx.quadraticCurveTo(0, -w, l, 0); ctx.quadraticCurveTo(0, w, -l, 0); ctx.fill();
          ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'ring': {
          const r = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k));
          ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = p.w * a + 0.5;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * (p.flat || 1), 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; break;
        }
        case 'hexa': {
          ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath();
          for (let i = 0; i <= 6; i++) { const an = i / 6 * 6.283; const r = p.r * (1 + k * 0.4); ctx.lineTo(p.x + Math.cos(an) * r * 0.5, p.y + Math.sin(an) * r); }
          ctx.stroke(); ctx.globalAlpha = 1; break;
        }
        case 'smoke': {
          const r = p.r + p.t * (p.grow || 0);
          ctx.globalAlpha = (p.a || 0.8) * a; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; break;
        }
        case 'fire': {
          ctx.globalCompositeOperation = 'lighter';
          drawGlow(ctx, p.x, p.y, p.r * (1 + k), k < 0.4 ? '#ffd070' : '#ff5a1a', a);
          ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'shard': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2);
          ctx.fillStyle = p.color; ctx.strokeStyle = '#5ab8d8'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(p.r * 0.5, 0); ctx.lineTo(0, p.r); ctx.lineTo(-p.r * 0.5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore(); ctx.globalAlpha = 1; break;
        }
        case 'petal': {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2);
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, 7); ctx.fill();
          ctx.restore(); ctx.globalAlpha = 1; break;
        }
        case 'crow': drawCrow(ctx, p.x, p.y, p.s, p.t * 0.6 + p.flap, p.vx < 0 ? -1 : 1, Math.min(1, a * 2)); break;
        case 'log': {
          ctx.save(); ctx.translate(p.x, p.y - 20); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 3);
          ctx.fillStyle = '#8a5a30'; ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(-9, -26, 18, 52, 6); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#c89a60'; ctx.beginPath(); ctx.ellipse(0, -26, 9, 3.5, 0, 0, 7); ctx.fill(); ctx.stroke();
          ctx.restore(); ctx.globalAlpha = 1; break;
        }
        case 'bolt': {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
          strokeBolt(ctx, p.pts || (p.pts = boltPath(p.x1, p.y1, p.x2, p.y2, 12, 7)), p.color, p.w);
          if (p.t % 2 === 0) p.pts = null;
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'arc': {
          const e = Math.min(1, k * 2.2);
          const a0 = p.a0, a1 = p.a0 + (p.a1 - p.a0) * e;
          ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.face, 1);
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
          ctx.beginPath(); ctx.arc(0, 0, p.r, a0, a1, a1 < a0); ctx.arc(0, 0, p.r - p.w * a, a1, a0, a1 >= a0); ctx.closePath();
          ctx.fillStyle = p.color; ctx.fill();
          ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'text': {
          ctx.globalAlpha = Math.min(1, a * 2.5); ctx.font = `900 ${p.size}px "Microsoft YaHei","PingFang SC",sans-serif`; ctx.textAlign = 'center';
          ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText(p.str, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.str, p.x, p.y);
          ctx.textAlign = 'left'; ctx.globalAlpha = 1; break;
        }
        case 'after': {
          if (drawFigure) drawFigure(ctx, p, a);
          break;
        }
      }
    }
  }
}

export function drawCrow(ctx, x, y, s, ph, dir, a = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s); ctx.globalAlpha = a;
  const f = Math.sin(ph) * 9;
  ctx.fillStyle = '#0c0a10';
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 4, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(-10, -4 - f); ctx.lineTo(4, -2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8, -1); ctx.lineTo(14, 0); ctx.lineTo(8, 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-15, -3); ctx.lineTo(-15, 3); ctx.fill();
  ctx.fillStyle = '#e02030'; ctx.fillRect(6, -2, 1.6, 1.6);
  ctx.restore();
}
