// 粒子与浮动文字(伤害数字、拾取提示)。
import { BLOCKS, WALLS } from './blocks.js';
import { hex } from './art.js';
import { ITEMS, itemName } from './items.js';
import { TS } from './const.js';

const MOBCOL = { zombie: [120, 30, 30], skeleton: [230, 230, 220], creeper: [80, 180, 80], spider: [60, 20, 20], slime: [80, 140, 240], lava_slime: [255, 110, 40], demon_eye: [150, 20, 20], bat: [90, 60, 90], pig: [200, 40, 40], cow: [200, 40, 40], sheep: [200, 40, 40], chicken: [200, 40, 40] };

export class FX {
  constructor(game) { this.game = game; this.ps = []; this.texts = []; this.glow = []; }
  add(p) {
    if (this.ps.length > 900) this.ps.shift();
    p.max = p.life; p.rot = p.rot || 0; p.vr = p.vr || 0; p.size = p.size || 2; p.grav = p.grav ?? 30;
    this.ps.push(p);
  }
  colorOf(id) { const b = BLOCKS[id]; return hex(b?.map || '#8a8a8a'); }
  burst(x, y, color, n = 8, speed = 6) {
    for (let i = 0; i < n; i++) this.add({ x, y, vx: (Math.random() - 0.5) * speed, vy: -Math.random() * speed, life: 0.4 + Math.random() * 0.5, color, size: 2 });
  }
  chips(tx, ty, id, wall) {
    const c = id ? this.colorOf(id) : hex(WALLS[wall]?.map || '#555');
    for (let i = 0; i < 3; i++) this.add({ x: tx + Math.random(), y: ty + Math.random(), vx: (Math.random() - 0.5) * 5, vy: -2 - Math.random() * 4, life: 0.35 + Math.random() * 0.3, color: shade(c, 0.7 + Math.random() * 0.5), size: 2 });
  }
  blockBreak(tx, ty, id) {
    const c = this.colorOf(id);
    const leafy = BLOCKS[id]?.render === 'leaves';
    for (let i = 0; i < (leafy ? 6 : 10); i++) this.add({ x: tx + Math.random(), y: ty + Math.random(), vx: (Math.random() - 0.5) * 7, vy: -2 - Math.random() * 5, life: 0.5 + Math.random() * 0.5, color: shade(c, 0.7 + Math.random() * 0.5), size: 2 + (Math.random() < 0.3 ? 2 : 0), vr: (Math.random() - 0.5) * 10, kind: leafy ? 'leaf' : 'sq', grav: leafy ? 6 : 30 });
  }
  dust(x, y, id, n) {
    const c = this.colorOf(id);
    for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5), y: y - 0.05, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 2, life: 0.4 + Math.random() * 0.3, color: shade(c, 1.1), size: 2, grav: 6 });
  }
  flame(x, y) { this.add({ x, y, vx: (Math.random() - 0.5), vy: -2 - Math.random() * 2, life: 0.3 + Math.random() * 0.3, color: [255, 160 + Math.random() * 80 | 0, 40], size: 2, grav: -2, kind: 'glow' }); }
  spark(x, y) { this.add({ x, y, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 3, life: 0.25, color: [255, 220, 120], size: 1, grav: 8, kind: 'glow' }); }
  smoke(x, y, n = 1) { for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5), y: y + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 3, vy: -1.5 - Math.random() * 2, life: 0.8 + Math.random() * 0.8, color: [90, 90, 90], size: 4, grav: -1, kind: 'smoke' }); }
  bubble(x, y) { this.add({ x, y, vx: (Math.random() - 0.5) * 0.5, vy: -2.5, life: 0.9, color: [200, 230, 255], size: 2, grav: -1, kind: 'bubble' }); }
  splash(x, y, n = 10) { for (let i = 0; i < n; i++) this.add({ x: x + (Math.random() - 0.5), y, vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 5, life: 0.5, color: [120, 170, 255], size: 2 }); }
  sparkle(x, y, color) { for (let i = 0; i < 10; i++) this.add({ x: x + (Math.random() - 0.5) * 1.6, y: y + (Math.random() - 0.5) * 1.6, vx: 0, vy: -1, life: 0.6 + Math.random() * 0.4, color, size: 2, grav: -1, kind: 'glow' }); }
  poof(x, y, w, h) { for (let i = 0; i < 14; i++) this.add({ x: x + (Math.random() - 0.5) * w, y: y + (Math.random() - 0.5) * h, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2, life: 0.6 + Math.random() * 0.5, color: [235, 235, 235], size: 3, grav: -2, kind: 'smoke' }); }
  blood(x, y, kind) { const c = MOBCOL[kind] || [200, 40, 40]; for (let i = 0; i < 6; i++) this.add({ x, y, vx: (Math.random() - 0.5) * 6, vy: -2 - Math.random() * 4, life: 0.4 + Math.random() * 0.3, color: c, size: 2 }); }
  crumbs(x, y, id) { const c = foodColor(id); for (let i = 0; i < 3; i++) this.add({ x, y, vx: (Math.random() - 0.5) * 3, vy: -1 - Math.random() * 2, life: 0.4, color: c, size: 2 }); }
  steam(x, y) { for (let i = 0; i < 4; i++) this.add({ x: x + Math.random(), y: y + Math.random(), vx: (Math.random() - 0.5) * 2, vy: -3, life: 0.8, color: [230, 230, 240], size: 3, grav: -2, kind: 'smoke' }); }
  explosion(x, y, r) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * r * 4;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 0.5 + Math.random() * 0.6, color: [255, 200 - Math.random() * 120 | 0, 60], size: 3, grav: 2, kind: 'glow' });
    }
    for (let i = 0; i < 26; i++) this.smoke(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2);
  }
  leaf(x, y, color) { this.add({ x, y, vx: 1 + Math.random() * 1.5, vy: 0.8, life: 4 + Math.random() * 3, color, size: 2, grav: 0, kind: 'leaf', vr: 2, sway: Math.random() * 6 }); }
  ring(x, y, r, color) {
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2;
      this.add({ x: x + Math.cos(a) * 0.4, y: y + Math.sin(a) * 0.4, vx: Math.cos(a) * r * 2.6, vy: Math.sin(a) * r * 2.6, life: 0.4, color, size: 2, grav: 0, kind: 'glow' });
    }
  }
  zap(x1, y1, x2, y2, color) {
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.add({ x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * 0.4, y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * 0.4, vx: 0, vy: 0, life: 0.25, color, size: 2, grav: 0, kind: 'glow' });
    }
  }
  firefly(x, y) { this.add({ x, y, vx: 0, vy: 0, life: 3 + Math.random() * 3, color: [190, 255, 120], size: 1, grav: 0, kind: 'firefly', sway: Math.random() * 6 }); }

  text(x, y, str, color = '#fff', big = false) {
    this.texts.push({ x: x + (Math.random() - 0.5) * 0.5, y, str, color, life: 1.0, vy: -3.2, big });
  }
  pickup(id, n) {
    const p = this.game.player;
    const t = this.texts.find(t => t.pick === id && t.life > 0.5);
    if (t) { t.n += n; t.str = `${itemName(id)} (${t.n})`; t.life = 1.6; return; }
    this.texts.push({ x: p.x, y: p.y - p.h - 0.6, str: n > 1 ? `${itemName(id)} (${n})` : itemName(id), color: '#f0f0d0', life: 1.6, vy: -1.4, pick: id, n });
  }

  update(dt) {
    const w = this.game.world;
    for (const p of this.ps) {
      p.life -= dt;
      if (p.kind === 'leaf') { p.vx = 0.8 + Math.sin(p.sway + p.life * 2) * 1.2; }
      if (p.kind === 'firefly') { p.vx = Math.sin(p.sway + p.life * 1.7) * 0.8; p.vy = Math.cos(p.sway * 1.3 + p.life * 1.3) * 0.6; }
      p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if ((p.kind === 'sq' || !p.kind) && p.grav > 0 && w.isLoaded(Math.floor(p.x), Math.floor(p.y)) && w.solid(Math.floor(p.x), Math.floor(p.y))) { p.vy = -p.vy * 0.3; p.vx *= 0.5; p.y = Math.floor(p.y) - 0.01; }
    }
    this.ps = this.ps.filter(p => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= Math.pow(0.12, dt); }
    this.texts = this.texts.filter(t => t.life > 0);
  }

  // lit=true:受光照影响的碎屑;lit=false:自发光粒子
  draw(ctx, camX, camY, lit) {
    for (const p of this.ps) {
      const glow = p.kind === 'glow' || p.kind === 'firefly';
      if (glow === lit) continue;
      const a = Math.min(1, p.life / p.max * 1.5);
      const sx = Math.round(p.x * TS - camX), sy = Math.round(p.y * TS - camY);
      const c = p.color;
      if (p.kind === 'smoke') { ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * 0.5})`; const s = p.size * (1.6 - p.life / p.max); ctx.fillRect(sx - s, sy - s, s * 2, s * 2); continue; }
      if (p.kind === 'bubble') { ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`; ctx.strokeRect(sx - 1.5, sy - 1.5, 3, 3); continue; }
      if (p.kind === 'firefly') { const f = 0.5 + 0.5 * Math.sin(p.life * 6 + p.sway); ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * f})`; ctx.fillRect(sx - 1, sy - 1, 2, 2); ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * f * 0.25})`; ctx.fillRect(sx - 3, sy - 3, 6, 6); continue; }
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      ctx.fillRect(sx - (p.size >> 1), sy - (p.size >> 1), p.size, p.size);
    }
  }
  drawTexts(ctx, camX, camY) {
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      const a = Math.min(1, t.life * 2);
      const sx = Math.round(t.x * TS - camX), sy = Math.round(t.y * TS - camY);
      ctx.font = t.big ? 'bold 14px "Microsoft YaHei", sans-serif' : t.pick ? 'bold 10px "Microsoft YaHei", sans-serif' : 'bold 11px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = `rgba(0,0,0,${a * 0.8})`;
      ctx.fillText(t.str, sx + 1, sy + 1);
      ctx.globalAlpha = a; ctx.fillStyle = t.color; ctx.fillText(t.str, sx, sy); ctx.globalAlpha = 1;
    }
  }
}
function shade(c, k) { return [Math.min(255, c[0] * k) | 0, Math.min(255, c[1] * k) | 0, Math.min(255, c[2] * k) | 0]; }
function foodColor(id) { return { bread: [210, 150, 80], apple: [230, 60, 50], golden_apple: [250, 210, 70], berries: [220, 40, 60] }[id] || [190, 110, 80]; }
