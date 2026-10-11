// 对战界面:体力 / 查克拉(灵力)/ 气槽 / 援助 / 计时 / 连击 / 奥义 cut-in / 回合字幕
import { W, H, MAX_HP, MAX_QI, MAX_CP } from './config.js';
import { drawBust } from './skeleton.js';
import { ASSISTS, CHARS } from './roster.js';
import { clamp } from './util.js';
import { art } from './art.js';

export const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
export const BRUSH = '"STXingkai","华文行楷","KaiTi","STKaiti","楷体",' + FONT;

// 头像缓存(look 对象 → 尺寸 → 离屏画布)
const bustCache = new WeakMap();
export function portrait(look, size, opt = {}) {
  let m = bustCache.get(look);
  if (!m) { m = new Map(); bustCache.set(look, m); }
  const pa = look.id && art('portrait_' + look.id);
  const key = size + (opt.flip ? 'f' : '') + (opt.bg || '') + (pa ? 'A' : '');
  let c = m.get(key);
  if (c) return c;
  if (pa) {
    c = document.createElement('canvas'); c.width = c.height = Math.round(size * 2);
    const g = c.getContext('2d'); g.scale(2, 2);
    const gr = g.createLinearGradient(0, 0, 0, size); gr.addColorStop(0, opt.bg || '#3a2a30'); gr.addColorStop(1, '#100810'); g.fillStyle = gr; g.fillRect(0, 0, size, size);
    if (opt.flip) { g.translate(size, 0); g.scale(-1, 1); }
    g.drawImage(pa, 0, 0, size, size);
    m.set(key, c);
    return c;
  }
  c = document.createElement('canvas');
  const dpr = 2;
  c.width = c.height = size * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  if (opt.bg) { const gr = g.createLinearGradient(0, 0, 0, size); gr.addColorStop(0, opt.bg); gr.addColorStop(1, '#100810'); g.fillStyle = gr; g.fillRect(0, 0, size, size); }
  drawBust(g, look, size * 0.5, size * 0.52, size * 0.86, { flip: opt.flip });
  m.set(key, c);
  return c;
}

export function txt(ctx, s, x, y, o = {}) {
  ctx.font = `${o.weight || 700} ${o.size || 16}px ${o.font || FONT}`;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'alphabetic';
  if (o.stroke !== false) { ctx.lineWidth = o.lw || 4; ctx.strokeStyle = o.stroke || 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
// 平行四边形槽
function bar(ctx, x, y, w, h, k, colA, colB, mirror, skew = 8) {
  const pts = (x0, w0) => mirror
    ? [[x0 + w0, y], [x0 + w0 - skew, y + h], [x0 - skew + (w - w0), y + h], [x0 + (w - w0), y]].map(([a, b]) => [a, b])
    : [[x0 + skew, y], [x0 + w0 + skew, y], [x0 + w0, y + h], [x0, y + h]];
  const path = (p) => { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (const q of p) ctx.lineTo(q[0], q[1]); ctx.closePath(); };
  if (k <= 0) return;
  const ww = w * clamp(k, 0, 1);
  const p = mirror ? [[x + w, y], [x + w - ww, y], [x + w - ww - skew, y + h], [x + w - skew, y + h]] : [[x + skew, y], [x + ww + skew, y], [x + ww, y + h], [x, y + h]];
  path(p);
  if (colB) { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, colA); g.addColorStop(1, colB); ctx.fillStyle = g; } else ctx.fillStyle = colA;
  ctx.fill();
}
function frame(ctx, x, y, w, h, mirror, skew = 8) {
  ctx.beginPath();
  if (mirror) { ctx.moveTo(x + w, y); ctx.lineTo(x, y); ctx.lineTo(x - skew, y + h); ctx.lineTo(x + w - skew, y + h); }
  else { ctx.moveTo(x + skew, y); ctx.lineTo(x + w + skew, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  ctx.closePath();
}

export function drawHud(ctx, B) {
  for (const sd of B.sides) drawSide(ctx, B, sd);
  // 计时
  ctx.fillStyle = 'rgba(10,6,12,0.85)'; ctx.strokeStyle = '#d8b060'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(452, 8); ctx.lineTo(508, 8); ctx.lineTo(516, 30); ctx.lineTo(508, 56); ctx.lineTo(452, 56); ctx.lineTo(444, 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  const tt = B.training ? '∞' : B.timeLimit ? String(B.time) : '∞';
  txt(ctx, tt, 480, 44, { size: 30, weight: 900, align: 'center', color: B.time <= 10 && B.timeLimit && !B.training ? '#ff5a4a' : '#fff4d0' });
  // 回合胜场
  if (B.mode !== 'team' && B.mode !== 'survival' && !B.training) {
    for (const sd of B.sides) for (let i = 0; i < B.winsNeeded; i++) {
      const x = sd.idx === 0 ? 436 - i * 16 : 524 + i * 16;
      ctx.save(); ctx.translate(x, 66); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = i < sd.wins ? '#ffd040' : 'rgba(30,20,20,0.8)'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
      ctx.fillRect(-5, -5, 10, 10); ctx.strokeRect(-5, -5, 10, 10); ctx.restore();
    }
  }
  if (B.mode === 'survival' && B.o.survivalWins !== undefined) txt(ctx, `连胜 ${B.o.survivalWins}`, 480, 80, { size: 14, align: 'center', color: '#ffe0a0' });
  if (B.o.label) txt(ctx, B.o.label, 480, 80, { size: 13, align: 'center', color: '#e8d8b8' });
}

function drawSide(ctx, B, sd) {
  const f = sd.fighter; if (!f) return;
  const m = sd.idx === 1;
  const X = (x, w = 0) => (m ? W - x - w : x);
  const col = m ? '#4a9aff' : '#ff7a3a';
  // 头像
  const px = X(10, 66);
  ctx.fillStyle = 'rgba(10,6,12,0.85)'; ctx.fillRect(px - 2, 6, 70, 70);
  ctx.drawImage(portrait(f.look, 66, { flip: m, bg: f.def.faction === 'ninja' ? '#5a3020' : '#202a50' }), px, 8, 66, 66);
  ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.strokeRect(px - 1, 7, 68, 68);
  // 体力
  const hx = X(82, 350);
  ctx.fillStyle = 'rgba(10,6,12,0.88)'; frame(ctx, hx - 3, 12, 356, 24, m); ctx.fill();
  const low = f.hp < MAX_HP * 0.3 && (B.frame >> 3) % 2;
  bar(ctx, hx, 15, 346, 18, f.hpShow / MAX_HP, '#ff5030', '#a01818', m);
  bar(ctx, hx, 15, 346, 18, f.hp / MAX_HP, low ? '#ff8a6a' : '#ffe45a', low ? '#e02a1a' : '#f09a18', m);
  ctx.strokeStyle = '#e8c070'; ctx.lineWidth = 1.5; frame(ctx, hx - 3, 12, 356, 24, m); ctx.stroke();
  txt(ctx, `${f.def.name}`, m ? W - 86 : 86, 54, { size: 15, align: m ? 'right' : 'left', color: '#fff' });
  // 查克拉 / 灵力
  const cx = X(82, 230);
  ctx.fillStyle = 'rgba(10,6,12,0.85)'; frame(ctx, cx - 2, 60, 234, 10, m, 5); ctx.fill();
  const cpc = f.def.faction === 'ninja' ? ['#7ad0ff', '#2a7ae0'] : ['#d0a0ff', '#7a3ad0'];
  bar(ctx, cx, 62, 228, 6, f.cp / MAX_CP, cpc[0], cpc[1], m, 5);
  txt(ctx, f.def.faction === 'ninja' ? '查克拉' : '灵力', m ? W - 318 : 318, 69, { size: 10, align: m ? 'right' : 'left', color: cpc[0], lw: 3 });
  // 团队成员
  if (sd.chars.length > 1) {
    sd.chars.forEach((id, i) => {
      const x = m ? W - 100 - i * 30 : 86 + i * 30;
      ctx.globalAlpha = sd.out[i] ? 0.3 : 1;
      ctx.drawImage(portrait(CHARS[id].look, 26, { flip: m, bg: '#302028' }), x - (m ? 26 : 0), 76, 26, 26);
      ctx.strokeStyle = i === sd.cur ? col : '#000'; ctx.lineWidth = 1.5; ctx.strokeRect(x - (m ? 26 : 0), 76, 26, 26);
      ctx.globalAlpha = 1;
    });
  }
  // 气
  const qx = X(16, 250), qy = 500;
  const lv = Math.floor(f.qi / 100);
  ctx.fillStyle = 'rgba(10,6,12,0.85)'; frame(ctx, qx, qy, 250, 22, m, 10); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const seg = clamp((f.qi - i * 100) / 100, 0, 1);
    const sx = m ? qx + 250 - 46 - (i + 1) * 64 : qx + 46 + i * 64;
    bar(ctx, sx, qy + 5, 60, 12, seg, seg >= 1 ? ['#ffe060', '#ff9a20', '#ff4a20'][i] : '#a08060', seg >= 1 ? '#c05010' : '#604020', m, 6);
  }
  ctx.strokeStyle = lv >= 3 && (B.frame >> 2) % 2 ? '#fff' : '#e8c070'; ctx.lineWidth = 1.5; frame(ctx, qx, qy, 250, 22, m, 10); ctx.stroke();
  const nx = m ? W - 34 : 34;
  ctx.fillStyle = '#1a0a08'; ctx.beginPath(); ctx.arc(nx, qy + 11, 19, 0, 7); ctx.fill();
  ctx.strokeStyle = lv ? '#ffb030' : '#806040'; ctx.lineWidth = 2.5; ctx.stroke();
  txt(ctx, String(lv), nx, qy + 21, { size: 28, weight: 900, align: 'center', color: lv ? '#ffe070' : '#a08870' });
  txt(ctx, '气', m ? W - 66 : 62, qy - 4, { size: 12, color: '#ffd080', lw: 3 });
  if (f.buff) txt(ctx, `${f.buff.name || '觉醒'} ${Math.ceil(f.buff.t / 60)}s`, m ? W - 66 : 66, qy - 4, { size: 12, align: m ? 'right' : 'left', color: '#ff9a7a', lw: 3 });
  // 援助
  if (sd.assistId) {
    const ax = m ? W - 300 : 300, ay = qy + 11;
    const a = ASSISTS[sd.assistId];
    ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, 18, 0, 7); ctx.clip();
    ctx.drawImage(portrait(a.look, 36, { flip: m, bg: '#283028' }), ax - 18, ay - 18, 36, 36);
    if (sd.assistGauge < 100) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(ax - 18, ay - 18, 36, 36); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(ax, ay, 20, 0, 7); ctx.stroke();
    ctx.strokeStyle = sd.assistGauge >= 100 ? ((B.frame >> 3) % 2 ? '#ffffff' : '#7aff8a') : '#5ab0ff'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(ax, ay, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sd.assistGauge / 100); ctx.stroke();
    if (sd.assistGauge >= 100) txt(ctx, 'O', ax + (m ? -26 : 26), ay + 6, { size: 13, align: 'center', color: '#9aff9a', lw: 3 });
  }
  // 连击(显示在攻击方一侧)
  const opp = B.sides[1 - sd.idx].fighter;
  if (opp && opp.combo.hits >= 2) {
    const cx2 = m ? W - 40 : 40;
    const pulse = 1 + Math.max(0, 6 - (B.frame - opp.lastHurt)) * 0.04;
    ctx.save(); ctx.translate(cx2, 200); ctx.scale(pulse, pulse);
    txt(ctx, String(opp.combo.hits), 0, 0, { size: 46, weight: 900, align: m ? 'right' : 'left', color: '#ffe060', font: FONT, lw: 6, stroke: '#601000' });
    ctx.restore();
    txt(ctx, 'HITS', m ? W - 40 : 40, 222, { size: 16, weight: 900, align: m ? 'right' : 'left', color: '#ff9a40' });
    txt(ctx, `伤害 ${Math.round(opp.combo.dmg)}`, m ? W - 40 : 40, 242, { size: 13, align: m ? 'right' : 'left', color: '#fff' });
  }
}

// ---------------------------------------------------------------- 奥义演出
export function drawCutin(ctx, c) {
  const t = c.t, T = 44;
  const f = c.f, right = f.side === 1;
  const a = t < 6 ? t / 6 : t > T - 8 ? Math.max(0, (T - t) / 8) : 1;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
  // 斜带
  const y0 = 150, y1 = 380, sk = 60;
  ctx.beginPath(); ctx.moveTo(0, y0 + sk); ctx.lineTo(W, y0); ctx.lineTo(W, y1 - sk); ctx.lineTo(0, y1); ctx.closePath();
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  const cols = c.faction === 'ninja' ? ['#ff8a2a', '#8a1a0a'] : ['#5a8aff', '#140a3a'];
  g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // 速度线
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) { const yy = y0 + ((i * 37) % (y1 - y0)), xx = ((i * 211 + t * 48 * (right ? -1 : 1)) % (W + 300)) - 150; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 140, yy - 9); ctx.stroke(); }
  // 头像滑入(优先使用生图 cut-in)
  const slide = (1 - Math.min(1, t / 10)) * 400;
  const ci = art('cutin_' + f.def.id);
  if (ci) {
    const ch = 300, cw = ci.naturalWidth / ci.naturalHeight * ch;
    ctx.save(); ctx.translate(right ? W - cw / 2 - 40 + slide : cw / 2 + 40 - slide, 120 + ch / 2); if (right) ctx.scale(-1, 1);
    ctx.drawImage(ci, -cw / 2, -ch / 2, cw, ch); ctx.restore();
  } else {
    const px = right ? W - 250 + slide : 250 - slide;
    ctx.drawImage(portrait(f.look, 300, { flip: right }), px - 150, 150, 300, 300);
  }
  ctx.restore();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, y0 + sk); ctx.lineTo(W, y0); ctx.moveTo(W, y1 - sk); ctx.lineTo(0, y1); ctx.stroke();
  // 招式名
  const tx = right ? 220 - (1 - Math.min(1, t / 12)) * -300 : W - 220 + (1 - Math.min(1, t / 12)) * 300;
  txt(ctx, c.name, tx, 290, { size: 54, weight: 900, align: 'center', font: BRUSH, color: '#ffffff', stroke: '#200808', lw: 8 });
  txt(ctx, f.def.name, tx, 332, { size: 20, align: 'center', color: '#ffe0a0', lw: 4 });
  ctx.restore();
}

export function drawBanner(ctx, b) {
  const t = b.t;
  const s = t < 8 ? 2.2 - t / 8 * 1.2 : 1;
  const a = t > 58 ? Math.max(0, (70 - t) / 12) : 1;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H / 2 - 20); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-W, -38, W * 2, 64);
  txt(ctx, b.text, 0, 18, { size: 60, weight: 900, align: 'center', color: b.color || '#fff', stroke: '#1a0606', lw: 10, font: FONT });
  ctx.restore();
}
