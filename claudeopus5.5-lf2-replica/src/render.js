// 战场绘制:背景 → 地面特效 → 影子 → 按深度排序的角色/物件/飞行道具 → 顶层特效 → 前景 → 名牌。
import { W, H, TEAM_COLORS } from './config.js';
import { renderSprite, ORX, ORY, hardenAlpha } from './skeleton.js';
import { POSES } from './poses.js';
import { ST } from './frames.js';
import { drawProj, drawProjShadow } from './fx.js';
import { makeCanvas, DEG, shade } from './util.js';

const cache = new Map();
export function spriteFor(def, pic, variant = '') {
  const key = def.lookId + '|' + pic + '|' + variant;
  let s = cache.get(key);
  if (s) return s;
  const pose = POSES[pic];
  s = renderSprite(def.look, pose || POSES.stand0);
  if (variant === 'burnt') {
    const g = s.canvas.getContext('2d');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(24,12,4,0.82)';
    g.fillRect(0, 0, s.canvas.width, s.canvas.height);
    g.globalCompositeOperation = 'source-over';
  } else if (variant === 'flash') {
    const g = s.canvas.getContext('2d');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(0, 0, s.canvas.width, s.canvas.height);
    g.globalCompositeOperation = 'source-over';
  }
  cache.set(key, s);
  return s;
}
export function clearSpriteCache() { cache.clear(); }

// 预热:把一个角色的全部帧姿势渲染进缓存(选人后、开战前调用,避免战斗中卡顿)
export function warmSprites(def) {
  const seen = new Set();
  for (const id in def.frames) { const p = def.frames[id].pic; if (!seen.has(p)) { seen.add(p); spriteFor(def, p); } }
}

// ---------------------------------------------------------------- 物品贴图
const itemCache = new Map();
function itemSprite(id) {
  let c = itemCache.get(id);
  if (c) return c;
  c = makeCanvas(48, 40);
  const g = c.getContext('2d');
  g.translate(8, 20);
  const OUT = '#0a0a10';
  const L = (x1, y1, x2, y2, w, col) => { g.lineCap = 'round'; g.strokeStyle = OUT; g.lineWidth = w + 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  switch (id) {
    case 'bat': L(0, 0, 30, 0, 3, '#b07a3a'); L(14, 0, 30, 0, 5.5, '#c88a44'); g.strokeStyle = '#e8b070'; g.lineWidth = 1; g.beginPath(); g.moveTo(15, -1.5); g.lineTo(29, -1.5); g.stroke(); L(-1, 0, 3, 0, 4, '#222'); break;
    case 'knife': L(0, 0, 6, 0, 3.5, '#4a2a1a'); g.fillStyle = OUT; g.beginPath(); g.moveTo(5, -3.5); g.lineTo(19, -1); g.lineTo(5, 2.5); g.fill(); g.fillStyle = '#dfe6ee'; g.beginPath(); g.moveTo(6, -2.5); g.lineTo(17, -0.8); g.lineTo(6, 1.5); g.fill(); L(5, -4, 5, 4, 1.5, '#888'); break;
    case 'iceSword': L(0, 0, 6, 0, 3, '#5a8ab0'); g.fillStyle = OUT; g.beginPath(); g.moveTo(5, -4.5); g.lineTo(36, 0); g.lineTo(5, 4.5); g.fill(); g.fillStyle = '#bff0ff'; g.beginPath(); g.moveTo(6, -3.3); g.lineTo(34, 0); g.lineTo(6, 3.3); g.fill(); g.fillStyle = '#ffffff'; g.fillRect(8, -1, 20, 1.2); L(5, -6, 5, 6, 2, '#8ad8ff'); break;
    case 'boomerang': g.lineJoin = 'round'; g.strokeStyle = OUT; g.lineWidth = 6; g.beginPath(); g.moveTo(0, -8); g.lineTo(9, 0); g.lineTo(0, 8); g.stroke(); g.strokeStyle = '#c87a2a'; g.lineWidth = 4; g.stroke(); break;
    case 'hoe': L(0, 0, 30, 0, 3, '#9a6a32'); g.fillStyle = OUT; g.beginPath(); g.moveTo(26, -2); g.lineTo(34, -2); g.lineTo(34, 9); g.lineTo(28, 7); g.closePath(); g.fill(); g.fillStyle = '#c8ccd4'; g.beginPath(); g.moveTo(27, -1); g.lineTo(33, -1); g.lineTo(33, 7.5); g.lineTo(28.5, 6); g.closePath(); g.fill(); break;
    case 'baseball': g.fillStyle = '#f4f2ea'; g.strokeStyle = OUT; g.lineWidth = 2; g.beginPath(); g.arc(5, 0, 5, 0, 6.3); g.fill(); g.stroke(); g.strokeStyle = '#d03030'; g.lineWidth = 1; g.beginPath(); g.arc(1, 0, 4, -1, 1); g.stroke(); g.beginPath(); g.arc(9, 0, 4, 2.1, 4.2); g.stroke(); break;
    case 'armorPiece': g.fillStyle = '#d8b850'; g.strokeStyle = OUT; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 6); g.lineTo(2, -8); g.lineTo(12, -12); g.lineTo(22, -8); g.lineTo(24, 6); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#f8e090'; g.fillRect(5, -8, 4, 10); g.fillStyle = '#8a7020'; g.fillRect(15, -6, 5, 9); break;
    case 'stone': g.fillStyle = '#7d7a74'; g.strokeStyle = OUT; g.lineWidth = 2; g.beginPath(); g.moveTo(2, 6); g.lineTo(0, -4); g.lineTo(8, -12); g.lineTo(20, -11); g.lineTo(25, -2); g.lineTo(22, 7); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#a19d96'; g.beginPath(); g.moveTo(6, -6); g.lineTo(10, -10); g.lineTo(17, -9); g.lineTo(13, -4); g.fill(); g.fillStyle = '#5a5852'; g.fillRect(14, 1, 7, 3); break;
    case 'box': g.fillStyle = '#b07838'; g.strokeStyle = OUT; g.lineWidth = 2; g.fillRect(0, -16, 26, 24); g.strokeRect(0, -16, 26, 24); g.strokeStyle = '#7a4e20'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -16); g.lineTo(26, 8); g.moveTo(26, -16); g.lineTo(0, 8); g.stroke(); g.strokeStyle = '#d8a060'; g.lineWidth = 1; g.strokeRect(2, -14, 22, 20); break;
    case 'milk': case 'beer': {
      const col = id === 'milk' ? '#f4f4f0' : '#8a4a10';
      g.fillStyle = col; g.strokeStyle = OUT; g.lineWidth = 2;
      g.beginPath(); g.moveTo(1, 6); g.lineTo(1, -4); g.lineTo(4, -8); g.lineTo(4, -13); g.lineTo(8, -13); g.lineTo(8, -8); g.lineTo(11, -4); g.lineTo(11, 6); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = id === 'milk' ? '#3a70d0' : '#f0d040'; g.fillRect(2, -2, 8, 5);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(3, -6, 1.5, 10);
      break;
    }
  }
  hardenAlpha(g, 48, 40);
  itemCache.set(id, c);
  return c;
}
function drawItemAt(ctx, id, x, y, rot, flip = 1, alpha = 1) {
  const c = itemSprite(id);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip < 0) ctx.scale(-1, 1);
  if (rot) ctx.rotate(rot);
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(c, -8, -20);
  ctx.restore();
}
export { itemSprite };

// ---------------------------------------------------------------- 主绘制
export function renderWorld(ctx, world, opt = {}) {
  const shake = world.camShake > 0 ? (world.tick % 2 ? 2 : -2) : 0;
  const camX = Math.round(world.camX) + shake;
  world.bg.draw(ctx, camX, world.tick);
  world.fx.draw(ctx, camX, 'ground');
  const ents = world.entities;
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  for (const e of ents) {
    if (e.kind === 'proj') { drawProjShadow(ctx, e, camX); continue; }
    if (e.kind === 'char' && (e.invisible > 0 || e.caughtBy)) continue;
    if (e.kind === 'item' && e.state === 'held') continue;
    const sx = e.x - camX;
    const s = e.kind === 'char' ? 20 * (e.def.look.size || 1) : 10;
    const k = Math.max(0.4, 1 + e.y / 300);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(sx, e.z, s * k, s * 0.3 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 深度排序
  const list = ents.filter((e) => !(e.kind === 'item' && e.state === 'held'));
  list.sort((a, b) => (a.z - b.z) || ((a.kind === 'proj') - (b.kind === 'proj')));
  for (const e of list) {
    if (e.kind === 'char') drawFighter(ctx, e, camX, world);
    else if (e.kind === 'item') drawItemAt(ctx, e.id, e.x - camX - (e.def.wtype === 'heavy' ? 12 : 8), e.z + e.y - (e.def.wtype === 'heavy' ? 2 : 3), e.rot, 1, e.age < 0 ? 0.5 : 1);
    else if (e.kind === 'proj') drawProj(ctx, e, camX);
  }
  world.fx.draw(ctx, camX, 'top');
  if (world.bg.drawFront) world.bg.drawFront(ctx, camX, world.tick);
  // 名牌
  if (!opt.noNames) {
    ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
    for (const e of ents) {
      if (e.kind !== 'char' || e.removed || (e.invisible > 0 && !e.human) || e.hideName) continue;
      if (e.dead && world.tick % 20 < 10 && e.deadBlink) continue;
      const sx = Math.round(e.x - camX), sy = Math.round(e.z + 13);
      const label = e.tag || e.name;
      ctx.fillStyle = '#000'; ctx.fillText(label, sx + 1, sy + 1);
      ctx.fillStyle = TEAM_COLORS[e.teamShown] || '#fff'; ctx.fillText(label, sx, sy);
    }
    ctx.textAlign = 'left';
  }
}

function drawFighter(ctx, f, camX, world) {
  if (f.removed) return;
  if (f.invuln > 0 && f.invuln % 4 < 2 && !f.dead) return;
  if (f.dead && f.deadBlink && world.tick % 6 < 3) return;
  const fr = f.fr;
  let variant = '';
  if (fr.burnt) variant = 'burnt';
  const spr = spriteFor(f.def, fr.pic, variant);
  let sx = Math.round(f.x - camX), sy = Math.round(f.z + f.y);
  if (f.shake > 0) sx += f.shake % 2 ? 2 : -2;
  const alpha = f.invisible > 0 ? (f.human ? 0.25 : 0.08) : f.fadeAlpha ?? 1;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(sx, sy);
  if (f.facing < 0) ctx.scale(-1, 1);
  const k = f.def.drawScale || 1;
  if (k !== 1) ctx.scale(k, k);
  // 手持武器(后层:重物在头顶)
  const it = f.holding;
  if (it && it.def.wtype === 'heavy') {
    const hx = (spr.hand[0] + spr.handB[0]) / 2, hy = Math.min(spr.hand[1], spr.handB[1]);
    ctx.drawImage(itemSprite(it.id), hx - 20, hy - 26);
  }
  ctx.drawImage(spr.canvas, -ORX, -ORY);
  if (it && it.def.wtype !== 'heavy') {
    const a = spr.handAng + (it.def.drink ? 90 : 40);
    const rot = Math.atan2(Math.cos(a * DEG), Math.sin(a * DEG));
    ctx.save();
    ctx.translate(spr.hand[0], spr.hand[1]);
    ctx.rotate(it.def.drink ? rot - Math.PI / 2 : rot);
    ctx.drawImage(itemSprite(it.id), -8 - (it.def.drink ? 6 : 2), -20);
    ctx.restore();
  }
  if (fr.prop) drawProp(ctx, fr.prop, spr);
  if (f.def.drawExtra) f.def.drawExtra(ctx, f, spr, world);
  if (fr.state === ST.FROZEN || f.frozen) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#a8e8ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-26, -40); ctx.lineTo(-16, -84); ctx.lineTo(14, -88); ctx.lineTo(26, -50); ctx.lineTo(22, 0); ctx.closePath();
    ctx.fill(); ctx.globalAlpha = 0.9; ctx.stroke();
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#fff'; ctx.fillRect(-14, -76, 4, 30); ctx.fillRect(8, -70, 3, 14);
  }
  ctx.restore();
}

// 招式道具:剑 / 弓 / 笛子(画在前手上)
function drawProp(ctx, prop, spr) {
  const [hx, hy] = spr.hand;
  const ang = spr.handAng;
  const OUT = '#0a0a10';
  ctx.save();
  ctx.translate(hx, hy);
  ctx.lineCap = 'round';
  if (prop === 'sword') {
    const a = ang + 40;
    ctx.rotate(Math.atan2(Math.cos(a * DEG), Math.sin(a * DEG)));
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(40, 0); ctx.stroke();
    ctx.strokeStyle = '#e8eef8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(40, 0); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6, -1); ctx.lineTo(37, -1); ctx.stroke();
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(3, 0); ctx.stroke();
    ctx.strokeStyle = '#d8b040'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(3, -4); ctx.lineTo(3, 4); ctx.stroke();
  } else if (prop === 'bow' || prop === 'bowDraw' || prop === 'bowUp') {
    // 弓身垂直于前臂
    const a = ang;
    ctx.rotate(Math.atan2(Math.cos(a * DEG), Math.sin(a * DEG)));
    const pull = prop === 'bowDraw' ? 14 : 3;
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(-3, -20); ctx.quadraticCurveTo(10, 0, -3, 20); ctx.stroke();
    ctx.strokeStyle = '#9a6a30'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-3, -20); ctx.quadraticCurveTo(10, 0, -3, 20); ctx.stroke();
    ctx.strokeStyle = '#f0f0e0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3, -20); ctx.lineTo(-pull, 0); ctx.lineTo(-3, 20); ctx.stroke();
    if (prop === 'bowDraw') { ctx.strokeStyle = '#c89a50'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-pull, 0); ctx.lineTo(12, 0); ctx.stroke(); ctx.fillStyle = '#d0d8e0'; ctx.fillRect(11, -1.5, 4, 3); }
  } else if (prop === 'staff') {
    const a = ang + 70;
    ctx.rotate(Math.atan2(Math.cos(a * DEG), Math.sin(a * DEG)));
    ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(20, 0); ctx.stroke();
    ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(20, 0); ctx.stroke();
    ctx.fillStyle = OUT; ctx.beginPath(); ctx.arc(22, 0, 4.5, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#e070ff'; ctx.beginPath(); ctx.arc(22, 0, 3.2, 0, 6.3); ctx.fill();
  } else if (prop === 'trident') {
    const a = ang + 20;
    ctx.rotate(Math.atan2(Math.cos(a * DEG), Math.sin(a * DEG)));
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(34, 0); ctx.stroke();
    ctx.strokeStyle = '#9ad8ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(34, 0); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, -5); ctx.lineTo(40, -5); ctx.moveTo(30, 5); ctx.lineTo(40, 5); ctx.moveTo(30, -5); ctx.lineTo(30, 5); ctx.stroke();
    ctx.fillStyle = '#ff3030'; ctx.fillRect(27, -2, 3, 4);
  } else if (prop === 'flute') {
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(16, -6); ctx.stroke();
    ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(16, -6); ctx.stroke();
  }
  ctx.restore();
}
