// 顶部状态栏:LF2 式 4×2 八格,每格头像 + 红色 HP(暗红为可恢复上限)+ 蓝色 MP。
import { W, HUD_H, TEAM_COLORS } from './config.js';
import { renderPortrait } from './skeleton.js';
import { makeCanvas } from './util.js';

// 头像:优先用 assets/portraits/<角色>.png(Grok Build 生成的正脸像素头像,128×128),
// 未提供或尚未加载完成时退回程序化侧脸头像
const PORTRAIT_URLS = import.meta.glob('../assets/portraits/*.png', { eager: true, query: '?url', import: 'default' });
const portraitImgs = {};
for (const [path, url] of Object.entries(PORTRAIT_URLS)) {
  const id = path.split('/').pop().replace('.png', '');
  const img = new Image();
  img.src = url;
  portraitImgs[id] = img;
}
const portraitCache = new Map();
export function portrait(def, w = 44, h = 48, scale = 2.1) {
  const key = def.lookId + '|' + w + 'x' + h;
  let c = portraitCache.get(key);
  if (c) return c;
  const img = portraitImgs[def.lookId];
  if (img && img.complete && img.naturalWidth) {
    // 裁去底部少量肩部,按“覆盖”方式缩放到目标格
    c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const sw = img.naturalWidth, sh = img.naturalHeight * 0.92;
    const k = Math.max(w / sw, h / sh);
    const dw = sw * k, dh = sh * k;
    g.fillStyle = '#0b1028'; g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, sw, sh, (w - dw) / 2, 0, dw, dh);
    portraitCache.set(key, c);
    return c;
  }
  const proc = renderPortrait(def.look, w, h, scale);
  if (!img) portraitCache.set(key, proc);   // 有图片但还在加载:暂不缓存,加载完后自动换成图片
  return proc;
}

let bgCanvas = null;
function hudBg() {
  if (bgCanvas) return bgCanvas;
  bgCanvas = makeCanvas(W, HUD_H);
  const g = bgCanvas.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, HUD_H);
  gr.addColorStop(0, '#1b2766'); gr.addColorStop(0.5, '#0d1442'); gr.addColorStop(1, '#070b2a');
  g.fillStyle = gr; g.fillRect(0, 0, W, HUD_H);
  // 细纹理
  g.globalAlpha = 0.08; g.fillStyle = '#fff';
  for (let y = 0; y < HUD_H; y += 2) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
  for (let i = 0; i < 8; i++) {
    const x = (i % 4) * (W / 4), y = Math.floor(i / 4) * 64;
    g.strokeStyle = '#3a4ca0'; g.lineWidth = 1;
    g.strokeRect(x + 2.5, y + 2.5, W / 4 - 5, 59);
    g.strokeStyle = '#05081c'; g.strokeRect(x + 3.5, y + 3.5, W / 4 - 7, 57);
  }
  g.fillStyle = '#000'; g.fillRect(0, HUD_H - 2, W, 2);
  return bgCanvas;
}

export function drawHud(ctx, slots, tick, extra) {
  ctx.drawImage(hudBg(), 0, 0);
  for (let i = 0; i < 8; i++) {
    const f = slots[i];
    const x = (i % 4) * (W / 4), y = Math.floor(i / 4) * 64;
    if (!f || f.removed) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 6, y + 6, W / 4 - 12, 52);
      continue;
    }
    // 头像(原版:小头像 40×45 位于 (5,6))
    const tc = TEAM_COLORS[f.teamShown] || '#fff';
    ctx.fillStyle = '#000'; ctx.fillRect(x + 5, y + 6, 44, 49);
    ctx.drawImage(portrait(f.def), x + 5, y + 6);
    ctx.strokeStyle = tc; ctx.lineWidth = 1.5; ctx.strokeRect(x + 5.5, y + 6.5, 43, 48);
    if (f.dead) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + 6, y + 7, 42, 47); }
    // 名字
    ctx.font = 'bold 9px Arial';
    ctx.fillStyle = '#000'; ctx.fillText(f.tag || f.name, x + 58, y + 13);
    ctx.fillStyle = tc; ctx.fillText(f.tag || f.name, x + 57, y + 12);
    if (f.lives !== undefined && f.lives > 0) { ctx.fillStyle = '#ffe070'; ctx.fillText('×' + f.lives, x + 165, y + 12); }
    // HP(原版:(57,16) 125×10,亮红 #FF0000,暗红可恢复段 #6f081f;治疗时闪烁)
    const bw = 125, bx = x + 57;
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, y + 15, bw + 2, 12);
    ctx.fillStyle = '#6f081f'; ctx.fillRect(bx, y + 16, Math.max(0, bw * f.darkHp / f.maxHp), 10);
    ctx.fillStyle = f.healT > 0 && tick % 6 < 3 ? '#ff8888' : '#ff0000';
    ctx.fillRect(bx, y + 16, Math.max(0, bw * f.hp / f.maxHp), 10);
    // MP(原版:(57,36) 125×10,#0000FF,底色 #1f086f)
    ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, y + 35, bw + 2, 12);
    ctx.fillStyle = '#1f086f'; ctx.fillRect(bx, y + 36, bw, 10);
    ctx.fillStyle = '#0000ff'; ctx.fillRect(bx, y + 36, Math.max(0, bw * f.mp / f.maxMp), 10);
    ctx.font = '9px Arial'; ctx.fillStyle = '#c8d0ff';
    ctx.fillText(Math.ceil(f.hp), bx + bw - 18, y + 57);
  }
  if (extra) extra(ctx);
}
