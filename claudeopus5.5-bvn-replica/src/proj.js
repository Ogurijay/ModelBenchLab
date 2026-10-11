// 飞行道具 / 场地陷阱 / 召唤物。逻辑字段 + 按 kind 分派的绘制函数(世界坐标)。
import { STAGE_W } from './config.js';
import { drawGlow, boltPath, strokeBolt, drawCrow } from './fx.js';
import { drawFigure } from './skeleton.js';
import { POSES, runPose } from './poses.js';
import { vr } from './util.js';
import { drawSprite } from './art.js';

let pid = 1;
export class Proj {
  constructor(owner, o) {
    this.id = pid++;
    this.owner = owner; this.side = owner.side;
    this.x = 0; this.y = -60; this.vx = 0; this.vy = 0; this.ax = 0; this.ay = 0;
    this.w = 30; this.h = 30; this.life = 60; this.delay = 0; this.t = 0;
    this.hits = 1; this.every = 8; this.power = 1; this.clash = true; this.pierce = false;
    this.dir = owner.face; this.kind = 'fireball'; this.color = '#ff8a2a'; this.size = 1;
    this.hit = { dmg: 30 };
    this.cool = new Map();
    this.dead = false;
    this.trail = [];
    Object.assign(this, o);
    if (o.hit) this.hit = { proj: true, ...o.hit };
  }
  get active() { return this.delay <= 0 && !this.dead && (!this.act || (this.t >= this.act[0] && this.t <= this.act[1])); }
  box() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  update(B) {
    if (this.delay > 0) { this.delay--; if (this.tele) this.tele(B, this); return; }
    this.t++;
    if (this.follow) { const f = this.follow; this.x = f.x + (this.fx || 0) * f.face; this.y = f.y + (this.fy || 0); this.dir = f.face; }
    this.vx += this.ax; this.vy += this.ay;
    this.x += this.vx; this.y += this.vy;
    if (this.tick) this.tick(B, this);
    if (this.ground && this.y > 0) { if (this.onGround) this.onGround(B, this); else this.y = 0; }
    for (const [k, v] of this.cool) { if (v <= 1) this.cool.delete(k); else this.cool.set(k, v - 1); }
    if (this.keepTrail) { this.trail.unshift([this.x, this.y]); if (this.trail.length > this.keepTrail) this.trail.pop(); }
    if (--this.life <= 0 || this.x < -200 || this.x > STAGE_W + 200 || this.y > 300) this.kill(B, true);
  }
  kill(B, natural) {
    if (this.dead) return;
    this.dead = true;
    if (this.onEnd) this.onEnd(B, this, natural);
  }
  draw(ctx, B) {
    if (this.delay > 0) { if (this.drawTele) this.drawTele(ctx, this, B); return; }
    const fn = DRAW[this.kind];
    if (fn) fn(ctx, this, B);
  }
}

// ---------------------------------------------------------------- 绘制
const TAU = Math.PI * 2;
function ellipseGlow(ctx, x, y, rx, ry, color, a = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); drawGlow(ctx, 0, 0, rx, color, a); ctx.restore();
}
export const DRAW = {
  shuriken(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * 0.6);
    ctx.fillStyle = '#9aa2b0'; ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * TAU / 4; ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(Math.cos(a + 0.785) * 3, Math.sin(a + 0.785) * 3); } ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  },
  kunai(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-8, 0); ctx.stroke();
    ctx.fillStyle = '#b8c0cc'; ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(0, -3.4); ctx.lineTo(0, 3.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a3040'; ctx.fillRect(-7, -1.3, 7, 2.6); ctx.beginPath(); ctx.arc(-9, 0, 2, 0, TAU); ctx.stroke();
    ctx.restore();
  },
  fireball(ctx, p) {
    const s = p.size;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) drawGlow(ctx, p.x - p.dir * i * 9 * s + vr(-3, 3), p.y + vr(-3, 3), (30 - i * 4) * s, i < 2 ? '#ffb040' : '#ff4a10', 0.6);
    drawGlow(ctx, p.x, p.y, 22 * s, '#fff0b0', 0.9);
    ctx.globalCompositeOperation = 'source-over';
  },
  blackfire(ctx, p) {
    const s = p.size;
    for (let i = 0; i < 9; i++) {
      const a = (p.t * 0.2 + i * 0.7), r = (16 + 8 * Math.sin(a * 1.7)) * s;
      ctx.fillStyle = i % 3 ? '#0a0610' : '#3a0a40';
      ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * 14 * s, p.y - 10 * s + Math.sin(a) * 18 * s - i * 3, r * 0.6, r, 0, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, p.y - 20 * s, 50 * s, '#6a10a0', 0.35); ctx.globalCompositeOperation = 'source-over';
  },
  wave(ctx, p) {
    // 月牙形剑气:p.h 为高度,color 主色,core 芯色
    const H = p.h * 0.55, d = p.dir;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(d, 1); if (p.tilt) ctx.rotate(p.tilt);
    ctx.globalCompositeOperation = 'lighter';
    ellipseGlow(ctx, -8, 0, H * 0.9, H, p.color, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    const bo = Math.max(26, H * 0.62), bi = Math.max(6, H * 0.2);
    if (p.edge) { ctx.globalCompositeOperation = 'lighter'; ellipseGlow(ctx, 0, 0, H * 0.7, H * 1.05, p.edge, 0.45); ctx.globalCompositeOperation = 'source-over'; }
    for (const [sc, col, al] of [[1.0, p.color, 0.9], [0.72, p.core || '#ffffff', 1]]) {
      ctx.globalAlpha = al; ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(-10 * sc, -H * sc);
      ctx.quadraticCurveTo(bo * sc, 0, -10 * sc, H * sc);
      ctx.quadraticCurveTo(bi * sc, 0, -10 * sc, -H * sc); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (p.edge) { ctx.strokeStyle = p.edge; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, -H); ctx.quadraticCurveTo(bo, 0, -10, H); ctx.stroke(); }
    ctx.restore();
  },
  dragon(ctx, p) {
    const tr = p.trail;
    const c = p.color, c2 = p.core || '#ffffff';
    for (let i = tr.length - 1; i >= 1; i--) {
      const [x, y] = tr[i]; const r = 16 * p.size * (1 - i / tr.length * 0.7);
      ctx.fillStyle = i % 2 ? c : c2; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(x, y + Math.sin(i * 0.8 + p.t * 0.3) * 6, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.dir * p.size, p.size);
    ctx.fillStyle = c; ctx.strokeStyle = '#0a2a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(18, -8); ctx.lineTo(30, 0); ctx.lineTo(18, 6); ctx.lineTo(24, 14); ctx.lineTo(4, 12); ctx.lineTo(-14, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(-22, -26); ctx.lineTo(-2, -14); ctx.moveTo(4, -11); ctx.lineTo(-6, -28); ctx.lineTo(10, -10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(10, -4, 2.6, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, p.y, 40 * p.size, c, 0.4); ctx.globalCompositeOperation = 'source-over';
  },
  petals(ctx, p) {
    ctx.globalCompositeOperation = 'lighter'; ellipseGlow(ctx, p.x, p.y, p.w * 0.6, p.h * 0.5, '#ff70b0', 0.3); ctx.globalCompositeOperation = 'source-over';
    const n = p.n || 40;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + p.t * 0.25, r = Math.sqrt(i / n);
      const x = p.x + Math.cos(a) * r * p.w * 0.55 + Math.sin(p.t * 0.2 + i) * 3, y = p.y + Math.sin(a * 1.3) * r * p.h * 0.5;
      ctx.fillStyle = i % 4 ? '#ff8ec0' : '#fff2f8';
      ctx.save(); ctx.translate(x, y); ctx.rotate(a * 2 + p.t * 0.3); ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 1.6, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  },
  sand(ctx, p) {
    const n = p.n || 26;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + p.t * 0.3, r = Math.sqrt(i / n);
      ctx.fillStyle = i % 3 ? '#d4b47a' : '#a88850';
      ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * r * p.w * 0.5, p.y + Math.sin(a) * r * p.h * 0.5, 3.4 - r * 1.5, 0, TAU); ctx.fill();
    }
  },
  beam(ctx, p) {
    // 光束:从 (x,y) 向 dir 延伸 len
    const len = p.len, H = p.h * (p.t < 4 ? p.t / 4 : 1) * (p.life < 6 ? p.life / 6 : 1);
    ctx.save(); ctx.translate(p.x - p.dir * p.w / 2, p.y); ctx.scale(p.dir, 1);
    ctx.globalCompositeOperation = 'lighter';
    if (p.style === 'bolt') {
      for (let i = 0; i < 3; i++) strokeBolt(ctx, boltPath(0, 0, len, vr(-6, 6), H * 0.4, 12), p.color, 2.2);
      drawGlow(ctx, len, 0, 30, p.color, 0.8);
    } else {
      const g = ctx.createLinearGradient(0, -H, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, p.color); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.7, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, -H, len, H * 2);
      drawGlow(ctx, 0, 0, H * 2.2, p.color, 0.9);
    }
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  },
  sphere(ctx, p) {
    // 螺旋查克拉球
    const r = 18 * p.size;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, p.x, p.y, r * 2.4, p.color, 0.7);
    ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(p.x, p.y, r * (0.4 + i * 0.18), p.t * 0.5 + i, p.t * 0.5 + i + 3.6); ctx.stroke(); }
    drawGlow(ctx, p.x, p.y, r, '#ffffff', 0.9);
    ctx.globalCompositeOperation = 'source-over';
  },
  rasenshuriken(ctx, p) {
    const s = p.size;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * 0.5);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, 0, 70 * s, '#9ad8ff', 0.5);
    ctx.fillStyle = 'rgba(220,245,255,0.75)';
    for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.beginPath(); ctx.moveTo(0, -8 * s); ctx.quadraticCurveTo(40 * s, -26 * s, 58 * s, -4 * s); ctx.quadraticCurveTo(30 * s, -2 * s, 0, 8 * s); ctx.fill(); }
    drawGlow(ctx, 0, 0, 22 * s, '#ffffff', 1);
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  },
  clone(ctx, p, B) {
    const ph = p.t * 22;
    if (p.cid && drawSprite(ctx, p.cid, p.frame || 'run', p.x, p.y + (p.footOff || 0), p.dir, p.look.scale || 1, { variant: p.alt ? 'alt' : undefined, alpha: 0.92 })) return;
    drawFigure(ctx, p.x, p.y + (p.footOff || 0), p.dir, p.look, p.pose ? { ...POSES[p.pose] } : runPose(POSES.run, ph), { grounded: p.y >= -1, expr: 'angry', rs: p.rs || (p.rs = { chains: {} }) });
  },
  hound(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.dir * p.size, p.size);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, -10, 60, '#7ac8ff', 0.6);
    const legs = Math.sin(p.t * 0.8) * 10;
    ctx.strokeStyle = '#e8f8ff'; ctx.lineWidth = 3;
    const body = [[-40, -14], [-20, -20], [10, -22], [30, -30], [44, -24], [50, -18], [36, -14], [20, -10], [-20, -8], [-40, -14]];
    strokeBolt(ctx, body.map(([x, y]) => [x + vr(-2, 2), y + vr(-2, 2)]), '#7ac8ff', 2.4);
    for (const [x, d] of [[-24, 1], [-14, -1], [18, 1], [28, -1]]) strokeBolt(ctx, [[x, -10], [x + legs * d, 6]], '#7ac8ff', 2);
    strokeBolt(ctx, [[-40, -14], [-60, -26 + vr(-6, 6)]], '#7ac8ff', 2);
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  },
  arrows(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, 0, 22, '#6ac0ff', 0.7);
    ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(12, 0); ctx.stroke();
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  },
  crows(ctx, p) {
    const n = p.n || 14;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39 + p.t * 0.12;
      drawCrow(ctx, p.x + Math.cos(a) * p.w * 0.45 * Math.sqrt(i / n), p.y + Math.sin(a) * p.h * 0.45 * Math.sqrt(i / n), 1, p.t * 0.7 + i, p.dir);
    }
  },
  pillar(ctx, p) {
    // 地刺:冰 / 砂 / 岩,自地面升起
    const grow = Math.min(1, p.t / 5) * (p.life < 10 ? p.life / 10 : 1);
    const H = p.h * grow, W = p.w;
    const col = { ice: ['#d8f8ff', '#6ac8e8'], sand: ['#d8b878', '#8a6a3a'], rock: ['#a09080', '#4a3a30'] }[p.mat || 'ice'];
    ctx.fillStyle = col[0]; ctx.strokeStyle = col[1]; ctx.lineWidth = 2;
    for (const [dx, sc] of [[-W * 0.3, 0.6], [W * 0.28, 0.72], [0, 1]]) {
      ctx.beginPath(); ctx.moveTo(p.x + dx - W * 0.3 * sc, 0); ctx.lineTo(p.x + dx + vr(-1, 1), -H * sc); ctx.lineTo(p.x + dx + W * 0.3 * sc, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (p.mat === 'ice') { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, -H * 0.5, H * 0.6, '#7ad8ff', 0.3); ctx.globalCompositeOperation = 'source-over'; }
  },
  sandhand(ctx, p) {
    const k = Math.min(1, p.t / 8);
    ctx.save(); ctx.translate(p.x, 0); ctx.scale(p.dir, 1);
    ctx.fillStyle = '#c8a46a'; ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-28, 0); ctx.quadraticCurveTo(-34, -60 * k, -18, -100 * k);
    for (let i = 0; i < 4; i++) { ctx.lineTo(-18 + i * 10, -128 * k + Math.abs(i - 1.5) * 8); ctx.lineTo(-13 + i * 10, -100 * k); }
    ctx.quadraticCurveTo(30, -60 * k, 26, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 4; i++) ctx.fillRect(p.x + vr(-30, 30), vr(-110, 0) * k, 2, 2);
  },
  coffin(ctx, p) {
    // 砂之棺:包裹目标的砂茧
    const k = Math.min(1, p.t / 10);
    ctx.fillStyle = '#c8a46a'; ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 34 * k + 4, 62 * k + 4, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(p.x, p.y, 34 * k, 62 * k, 0.3 + i * 0.6 + p.t * 0.05, 0.3, 2.2); ctx.stroke(); }
  },
  blackbox(ctx, p) {
    const k = Math.min(1, p.t / 14);
    const W = 112, H = 164;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(8,4,14,0.92)'; ctx.strokeStyle = '#8a40ff'; ctx.lineWidth = 2;
    ctx.fillRect(-W / 2, -H / 2, W, H * k); ctx.fillRect(-W / 2, H / 2 - H * k, W, H * k);
    ctx.strokeRect(-W / 2, -H / 2, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const y = -H / 2 + ((i * 29 + p.t * 3) % H); ctx.fillStyle = 'rgba(160,80,255,0.4)'; ctx.fillRect(-W / 2, y, W, 2); }
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  },
  iceprison(ctx, p) {
    const k = Math.min(1, p.t / 10);
    ctx.fillStyle = 'rgba(200,245,255,0.75)'; ctx.strokeStyle = '#5ab8d8'; ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      const x = p.x + i * 16, h = (150 - Math.abs(i) * 18) * k;
      ctx.beginPath(); ctx.moveTo(x - 10, 0); ctx.lineTo(x, -h); ctx.lineTo(x + 10, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  },
  genjutsu(ctx, p) {
    // 月读:红黑十字架幻象
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#1a0004'; ctx.fillRect(-4, -90, 8, 120); ctx.fillRect(-36, -70, 72, 8);
    ctx.restore();
  },
  vortex(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { ctx.strokeStyle = `rgba(150,110,255,${0.5 - i * 0.08})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 14 + i * 12, p.t * 0.3 + i, p.t * 0.3 + i + 4); ctx.stroke(); }
    drawGlow(ctx, 0, 0, 40, '#4a20a0', 0.8);
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  },
  strike(ctx, p) {
    // 天降雷击
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) strokeBolt(ctx, boltPath(p.x + vr(-30, 30), -700, p.x + vr(-8, 8), 0, 30, 14), p.color, 4 - i);
    drawGlow(ctx, p.x, -10, 120, p.color, 0.9);
    ctx.globalCompositeOperation = 'source-over';
  },
  teleStrike(ctx, p) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, -20, 40 + Math.sin(p.t) * 6, p.color, 0.6); ctx.globalCompositeOperation = 'source-over'; },
  shock(ctx, p) {
    ctx.globalCompositeOperation = 'lighter';
    ellipseGlow(ctx, p.x, p.y, p.w * 0.6, p.h * 0.5, p.color, 0.7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.w * 0.5, p.h * 0.4, 0, 0, TAU); ctx.stroke();
  },
  tsunami(ctx, p) {
    ctx.save(); ctx.translate(p.x, 0); ctx.scale(p.dir, 1);
    ctx.fillStyle = '#c8a46a'; ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3;
    const H = p.h;
    ctx.beginPath(); ctx.moveTo(-p.w, 0); ctx.quadraticCurveTo(-p.w * 0.6, -H * 0.9, 0, -H); ctx.quadraticCurveTo(p.w * 0.35, -H * 0.9, p.w * 0.25, -H * 0.55);
    ctx.quadraticCurveTo(p.w * 0.5, -H * 0.3, p.w * 0.5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a88850'; for (let i = 0; i < 18; i++) ctx.fillRect(vr(-p.w, p.w * 0.4), vr(-H, 0), 3, 3);
    ctx.restore();
  },
  meteor(ctx, p) {
    ctx.fillStyle = '#b89460'; ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 26 * p.size, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(200,170,110,0.5)'; ctx.beginPath(); ctx.moveTo(p.x - 20, p.y - 10); ctx.lineTo(p.x - p.vx * 6, p.y - p.vy * 6); ctx.lineTo(p.x + 20, p.y - 10); ctx.fill();
  },
  swords(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2);
    ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, 0, 30, '#ffb0d0', 0.5); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#eef2f8'; ctx.strokeStyle = '#3a3040'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(4, -6); ctx.lineTo(-4, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c8a040'; ctx.fillRect(-7, -6, 14, 3); ctx.fillStyle = '#3a2040'; ctx.fillRect(-2, -3, 4, 12);
    ctx.restore();
  },
  ghost(ctx, p) {
    // 骸神:半透明骨甲巨人 + 巨剑横扫(p.ang 当前剑角)
    ctx.save(); ctx.translate(p.x - p.dir * (p.gx || 0), 0); ctx.scale(p.dir, 1);
    const a = Math.min(1, p.t / 12) * (p.life < 12 ? p.life / 12 : 1);
    ctx.globalAlpha = a * 0.75; ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, -130, 160, p.color, 0.5);
    ctx.strokeStyle = p.color; ctx.lineWidth = 6;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(0, -110 - i * 22, 46 - i * 3, 10, 0, 0, Math.PI); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -230); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -255, 26, 0, TAU); ctx.stroke();
    const sa = p.ang || 0;
    ctx.save(); ctx.translate(30, -190); ctx.rotate(sa);
    ctx.fillStyle = p.color; ctx.fillRect(0, -9, 240, 18);
    ctx.restore();
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  toad(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = '#c85a2a'; ctx.strokeStyle = '#2a120a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -60, 90, 64, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8c890'; ctx.beginPath(); ctx.ellipse(10, -30, 60, 30, 0, 0, TAU); ctx.fill();
    for (const x of [-40, 40]) { ctx.fillStyle = '#f0e0a0'; ctx.beginPath(); ctx.arc(x, -112, 18, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1a0a0a'; ctx.fillRect(x - 10, -114, 20, 5); }
    ctx.fillStyle = '#3a2a5a'; ctx.beginPath(); ctx.ellipse(0, -128, 50, 12, 0, 0, TAU); ctx.fill();
    ctx.restore();
  },
  barrier(ctx, p) {
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,220,120,0.22)'; ctx.strokeStyle = 'rgba(255,240,180,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -p.h / 2); ctx.lineTo(p.w / 2, p.h / 2); ctx.lineTo(-p.w / 2, p.h / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  },
  sandwall(ctx, p) {
    ctx.fillStyle = '#c8a46a'; ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2.5;
    const H = p.h * Math.min(1, p.t / 5);
    ctx.beginPath(); ctx.moveTo(p.x - p.w / 2, 0); ctx.quadraticCurveTo(p.x - p.w / 2 - 6, -H, p.x, -H - 6); ctx.quadraticCurveTo(p.x + p.w / 2 + 6, -H, p.x + p.w / 2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  snow(ctx, p) {
    ctx.fillStyle = '#eafcff';
    for (let i = 0; i < 40; i++) { const x = p.x + ((i * 53) % p.w) - p.w / 2, y = -300 + ((i * 97 + p.t * 7) % 320); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter'; ellipseGlow(ctx, p.x, -140, p.w * 0.6, 160, '#7ad8ff', 0.18); ctx.globalCompositeOperation = 'source-over';
  },
  ring(ctx, p) {
    ctx.globalCompositeOperation = 'lighter';
    const r = p.w / 2;
    ctx.strokeStyle = p.color; ctx.lineWidth = 8; ctx.globalAlpha = Math.min(1, p.life / 10);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.8, 0, 0, TAU); ctx.stroke();
    drawGlow(ctx, p.x, p.y, r, p.color, 0.35);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
  dogs(ctx, p) {
    // 通灵犬群自地面跃出咬住目标
    const k = Math.min(1, p.t / 6);
    for (const [dx, s] of [[-30, 1], [26, -1], [0, 1]]) {
      ctx.save(); ctx.translate(p.x + dx, -10 - 40 * k + Math.abs(dx) * 0.4); ctx.scale(s, 1);
      ctx.fillStyle = '#7a5a3a'; ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 11, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(24, -2); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1e2a48'; ctx.fillRect(-10, -12, 14, 5);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -4, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
  },
  rods(ctx, p) {
    // 六杖光牢:六道光板从四方钉入
    const k = Math.min(1, p.t / 8);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU, r = 140 * (1 - k) + 18;
      ctx.save(); ctx.translate(Math.cos(a) * r * 0.6, Math.sin(a) * r); ctx.rotate(a);
      ctx.fillStyle = 'rgba(255,240,170,0.85)'; ctx.fillRect(-26, -5, 52, 10);
      ctx.restore();
    }
    drawGlow(ctx, 0, 0, 60, '#ffe080', 0.35);
    ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  },
  none() {},
};
