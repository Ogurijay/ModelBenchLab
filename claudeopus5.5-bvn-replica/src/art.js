// 生图美术资源:立绘 full_* / 头像 portrait_* / 奥义 cutin_* / 战斗精灵 sp_<id>_<帧>(由 Codex CLI image_generation 生成,见 docs/art.md)。
// 精灵帧按姿势类型归一化尺寸、以脚底为锚点;另预烘焙白色闪光 / 纯色残影 / 2P 换色版本。
import spriteMeta from '../assets/art/sprites.json';

const URLS = import.meta.glob('../assets/art/*.webp', { eager: true, query: '?url', import: 'default' });
const imgs = {};
let total = 0, loaded = 0;
for (const [path, url] of Object.entries(URLS)) {
  const name = path.split('/').pop().replace('.webp', '');
  const im = new Image();
  total++;
  im.onload = () => { loaded++; };
  im.onerror = () => { loaded++; im._bad = true; };
  im.src = url;
  imgs[name] = im;
}
export const artProgress = () => (total ? loaded / total : 1);
export function art(name) { const im = imgs[name]; return im && im.complete && im.naturalWidth && !im._bad ? im : null; }

// ---------------------------------------------------------------- 精灵帧尺寸归一化
// 生图每帧尺度不一:以 idle 帧包围盒高定基准(持武器角色乘武器系数),
// 其他帧按不透明像素面积之比的平方根缩放(身体面积与姿势基本无关),并限制在 0.72–1.25 倍。
const AIR = new Set(['jump', 'fall', 'knock', 'airatk']);
const WEAPON = { souga: 1.32, hyorin: 1.16, hizakura: 1.16, kyouken: 1.2, genshu: 1.14 };
const ADJ = {}; // 个别帧人工修正 { id: { frame: 系数 } }
export const STAND_H = 124;

export function hasSprites(id) { return !!spriteMeta[id]?.idle; }
export function spriteInfo(id, frame) {
  const all = spriteMeta[id], m = all?.[frame];
  if (!m) return null;
  if (m._k === undefined) {
    const idle = all.idle;
    const k0 = (WEAPON[id] || 1) * STAND_H / idle.bh;
    const r = frame === 'idle' ? 1 : Math.sqrt(idle.area / Math.max(1, m.area));
    m._k = k0 * Math.min(1.25, Math.max(0.72, r * (ADJ[id]?.[frame] || 1)));   // 世界单位 / 精灵像素
  }
  return m;
}

// 变体烘焙:'white' 白闪 / '#rrggbb' 纯色剪影 / 'alt' 色相换色
const variants = new Map();
export function spriteImg(id, frame, variant) {
  const base = art(`sp_${id}_${frame}`);
  if (!base || !variant) return base;
  const key = id + frame + variant;
  let c = variants.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = base.naturalWidth; c.height = base.naturalHeight;
  const g = c.getContext('2d');
  if (variant === 'alt') { g.filter = 'hue-rotate(150deg) saturate(1.1)'; g.drawImage(base, 0, 0); }
  else { g.drawImage(base, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = variant === 'white' ? '#ffffff' : variant; g.fillRect(0, 0, c.width, c.height); }
  variants.set(key, c);
  return c;
}

// 在世界坐标绘制精灵帧;x,y 为脚底;返回是否绘制成功
export function drawSprite(ctx, id, frame, x, y, face, scale, o = {}) {
  const m = spriteInfo(id, frame);
  const im = m && spriteImg(id, frame, o.variant);
  if (!im) return false;
  const k = m._k * scale * (o.k || 1);
  const w = m.w * k, h = m.h * k;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (AIR.has(frame) && !o.feet) {
    // 空中帧以包围盒中心对准身体中心
    ctx.translate(x, y - 58 * scale);
    if (o.rot) ctx.rotate(o.rot * face);
    ctx.scale(face, o.sy || 1);
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
  } else {
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot * face);
    ctx.scale(face * (o.sx || 1), o.sy || 1);
    ctx.drawImage(im, -m.fx * k, -h + 4 * k, w, h);
  }
  ctx.restore();
  return true;
}

// 姿势名 → 精灵帧
const POSE_FRAME = {
  stand: 'idle', stand_w: 'idle', stand_big: 'idle', stand_calm: 'idle', stand_cool: 'idle', cross: 'idle', sword_side: 'idle', slash_back: 'idle', knee: 'idle',
  run: 'run', dash: 'run', backdash: 'jump', jump: 'jump', fall: 'fall', crouch: 'crouch', getup: 'crouch', ball: 'jump', iai: 'crouch', cast_down: 'crouch',
  guard: 'guard', guard_w: 'guard', hit_h: 'hit', hit_b: 'hit', dizzy: 'hit', airhit: 'knock', knock: 'knock', down: 'down', victory: 'victory',
  seal: 'cast', cast: 'cast', cast_one: 'cast', point: 'cast', hold_sphere: 'charge', charge: 'charge', cast_up: 'charge', raise_sword: 'charge', throw_ready: 'charge', slash_up: 'charge',
  jab: 'attack1', straight: 'attack1', slash_thru: 'attack1', throw: 'attack1',
  kick_mid: 'attack2', kick_high: 'attack2', kick_back: 'attack2', slash_down: 'attack2', heavy_chop: 'attack2',
  upper: 'launch', rise_kick: 'launch', slash_rise: 'launch', axe_up: 'launch',
  sweep: 'sweep', slash_low: 'sweep',
  air_kick: 'airatk', air_kick2: 'airatk', dive_kick: 'airatk', air_slash: 'airatk', air_slash_up: 'airatk', air_slash_down: 'airatk', axe_down: 'airatk',
  dash_punch: 'lunge', thrust: 'lunge', palm: 'lunge',
};
export function frameForPose(name) { return POSE_FRAME[name] || null; }
