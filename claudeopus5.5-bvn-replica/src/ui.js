// 菜单通用绘制:背景、面板、选项列表、点击区域
import { W, H } from './config.js';
import { txt, FONT, BRUSH } from './hud.js';

export const regions = [];
export function clearRegions() { regions.length = 0; }
export function region(x, y, w, h, act) { regions.push({ x, y, w, h, act }); }

const motes = Array.from({ length: 46 }, (_, i) => ({ x: (i * 197) % W, y: (i * 89) % H, s: 0.4 + (i % 5) * 0.25, r: (i * 13) % 7, leaf: i % 2 }));
export function menuBg(ctx, t, tone = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const c = [['#2a0c10', '#0a0408'], ['#0a1430', '#04040c'], ['#1a1010', '#050304']][tone];
  g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 斜向光带
  ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = '#ffd8a0';
  for (let i = 0; i < 5; i++) { const x = ((i * 260 + t * 0.4) % (W + 400)) - 200; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x - 110, H); ctx.lineTo(x - 200, H); ctx.fill(); }
  ctx.restore();
  // 飘落的叶与花瓣
  for (const m of motes) {
    const x = (m.x + t * m.s * 0.6) % (W + 20) - 10, y = (m.y + t * m.s) % (H + 20) - 10;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.02 * m.s + m.r);
    ctx.fillStyle = m.leaf ? 'rgba(255,150,80,0.55)' : 'rgba(255,170,210,0.5)';
    ctx.beginPath(); ctx.ellipse(0, 0, 4 + m.r * 0.3, 2, 0, 0, 7); ctx.fill(); ctx.restore();
  }
}
export function panel(ctx, x, y, w, h, a = 0.75) {
  ctx.fillStyle = `rgba(8,4,8,${a})`; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(232,192,112,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
export function menuList(ctx, items, sel, x, y, o = {}) {
  const lh = o.lh || 40, w = o.w || 260;
  items.forEach((it, i) => {
    const yy = y + i * lh;
    const on = i === sel;
    if (on) {
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(0.5, 'rgba(255,120,40,0.55)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x - w / 2, yy - lh * 0.62, w, lh * 0.82);
    }
    const label = typeof it === 'string' ? it : it.label;
    txt(ctx, label, x, yy, { size: o.size || 22, weight: on ? 900 : 600, align: 'center', color: on ? '#fff2c0' : (it.dim ? '#7a6a60' : '#c8b8a8') });
    if (o.onClick) region(x - w / 2, yy - lh * 0.65, w, lh * 0.85, () => o.onClick(i));
  });
}
export function title(ctx, s, x, y, size = 30) { txt(ctx, s, x, y, { size, weight: 900, align: 'center', font: BRUSH, color: '#ffe8b0', stroke: '#200606', lw: 7 }); }
export { txt, FONT, BRUSH };
