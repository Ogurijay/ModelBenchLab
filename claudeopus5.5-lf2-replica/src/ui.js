// 界面绘制小工具:描边文字、面板、菜单项。
import { W, H } from './config.js';

export function text(ctx, s, x, y, o = {}) {
  ctx.font = `${o.bold === false ? '' : 'bold '}${o.size || 14}px ${o.font || 'Arial, Helvetica, sans-serif'}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'alphabetic';
  if (o.shadow !== false) { ctx.fillStyle = o.shadowCol || '#000'; ctx.fillText(s, x + (o.sh ?? 2), y + (o.sh ?? 2)); }
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.strokeW || 3; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

export function panel(ctx, x, y, w, h, o = {}) {
  ctx.fillStyle = o.fill || 'rgba(6,12,48,0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = o.border || '#5f78d8'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
}

export function menuItem(ctx, label, x, y, sel, o = {}) {
  const w = o.w || 300;
  if (sel) {
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, 'rgba(255,200,40,0)'); g.addColorStop(0.5, 'rgba(255,200,40,0.35)'); g.addColorStop(1, 'rgba(255,200,40,0)');
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - (o.size || 18) - 2, w, (o.size || 18) + 10);
  }
  text(ctx, label, x, y, { align: 'center', size: o.size || 18, color: o.disabled ? '#667' : sel ? '#ffe060' : '#dfe6ff' });
}

export function dimScreen(ctx, a = 0.55) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); }
