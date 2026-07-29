// world.js — 地皮:28×18 瓦片地图、碰撞、昼夜色调与灯光、BFS 寻路
import { TILE } from './art.js';

// 图例:F 栅栏 G/g 草 f 花 P 小径 S 人行道 r/R 马路 E 外墙 I 内墙 V 窗 D 门口 w 木地板 k 厨房砖 b 浴室砖
const MAP = [
  'FFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  'FGgGGGGgGGGGGGGgGGGGGGgGGGGF',
  'FGEEVEEEVEEEEEVEEEEEVEEEEEGF',
  'FGEwwwwwwIwwwwwwwwIkkkkkkEGF',
  'FGEwwwwwwIwwwwwwwwIkkkkkkEGF',
  'FGEwwwwwwwwwwwwwwwIkkkkkkEGF',
  'FGEwwwwwwIwwwwwwwwIkkkkkkEGF',
  'FGEIIIIIIIwwwwwwwwIkkkkkkEGF',
  'FGEbbbbbbIwwwwwwwwkkkkkkkEGF',
  'FGEbbbbbbbwwwwwwwwkkkkkkkEGF',
  'FGEbbbbbbIwwwwwwwwkkkkkkkEGF',
  'FGEbbbbbbIwwwwwwwwIkkkkkkEGF',
  'FGEEVEEEEEEEEDEEEEEEEVEEEEGF',
  'FGGfGGGGGGGGGPGGGGGGGGfGGGGF',
  'FGGGGGGGGGGGGPGGGGGGGGGGGGGF',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  'rrrrrrrrrrrrrrrrrrrrrrrrrrrr',
  'RRRRRRRRRRRRRRRRRRRRRRRRRRRR',
];

const TILE_OF = {
  F: 'fence', G: 'grass', g: 'grass2', f: 'flower', P: 'path', S: 'sidewalk',
  r: 'roadDash', R: 'road', E: 'wallEx', I: 'wallIn', V: 'window', D: 'wallEx',
  w: 'wood', k: 'kitchen', b: 'bath',
};
const SOLID = new Set(['F', 'E', 'I', 'V']);
const INDOOR = new Set(['w', 'k', 'b']);

export function buildWorld(Art) {
  const W = MAP[0].length, H = MAP.length;
  MAP.forEach((r, i) => { if (r.length !== W) console.warn(`[world] 第${i}行宽 ${r.length} ≠ ${W}`); });

  const windows = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (MAP[y][x] === 'V') windows.push({ tx: x, ty: y });

  // 静态地面烘焙
  const ground = document.createElement('canvas');
  ground.width = W * TILE; ground.height = H * TILE;
  const g = ground.getContext('2d');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = Art.tiles[TILE_OF[MAP[y][x]] || 'grass'];
      g.drawImage(t, x * TILE, y * TILE);
    }
  }

  const world = {
    W, H, TILE,
    pxW: W * TILE, pxH: H * TILE,
    ground,
    windows,
    doorTile: { x: 13, y: 12 },
    spawn: { x: 13, y: 9 },          // 客厅中央出生
    insideDoor: { x: 13, y: 11 },
    outsideDoor: { x: 13, y: 13 },
    curb: { x: 13, y: 15 },
    roadEdge: { x: 13, y: 17 },

    at(tx, ty) { return (MAP[ty] && MAP[ty][tx]) || 'F'; },
    solidBase(tx, ty) {
      const ch = this.at(tx, ty);
      return SOLID.has(ch) && !(tx === this.doorTile.x && ty === this.doorTile.y);
    },
    indoor(tx, ty) { return INDOOR.has(this.at(tx, ty)); },
    inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < W && ty < H; },

    // BFS 网格寻路(solidFn 由 game 提供:地形 + 家具)
    bfs(from, to, solidFn) {
      if (from.x === to.x && from.y === to.y) return [];
      const key = (x, y) => y * W + x;
      const prev = new Map();
      const q = [[from.x, from.y]];
      prev.set(key(from.x, from.y), null);
      while (q.length) {
        const [cx, cy] = q.shift();
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!this.inBounds(nx, ny) || prev.has(key(nx, ny))) continue;
          const isTarget = nx === to.x && ny === to.y;
          if (!isTarget && solidFn(nx, ny)) continue;
          prev.set(key(nx, ny), key(cx, cy));
          if (isTarget) {
            const path = [];
            let k = key(nx, ny);
            while (k !== null && k !== key(from.x, from.y)) {
              path.unshift({ x: k % W, y: Math.floor(k / W) });
              k = prev.get(k);
            }
            return path;
          }
          q.push([nx, ny]);
        }
      }
      return null;
    },
  };
  return world;
}

// ---------- 昼夜与灯光 ----------
// 返回 0(白天)..1(深夜) 的黑暗度
export function darkness(minute) {
  const m = minute;
  if (m >= 420 && m < 1050) return 0;               // 07:00-17:30 白天
  if (m >= 1050 && m < 1170) return (m - 1050) / 120; // 17:30-19:30 渐暗
  if (m >= 1170 || m < 300) return 1;               // 19:30-05:00 夜
  if (m >= 300 && m < 420) return 1 - (m - 300) / 120; // 05:00-07:00 渐亮
  return 0;
}

let _glow = null;
function glowSprite() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(48, 48, 4, 48, 48, 46);
  grad.addColorStop(0, 'rgba(255,220,140,0.85)');
  grad.addColorStop(0.5, 'rgba(255,190,90,0.30)');
  grad.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  _glow = c;
  return c;
}

// 在(已缩放 2x 的)ctx 上做夜色叠加与灯光。coords 游戏像素。
// lights: [{x, y, r}] 世界像素中心。
export function applyDayNight(ctx, cam, minute, power, world, Art, lights) {
  const d = darkness(minute);
  const m = minute;
  // 黄昏/清晨暖色
  let warm = 0;
  if (m >= 1020 && m < 1140) warm = 1 - Math.abs(m - 1080) / 60; // 17:00-19:00 峰值 18:00
  if (m >= 330 && m < 450) warm = (1 - Math.abs(m - 390) / 60) * 0.7;

  ctx.save();
  if (warm > 0.02) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = warm * 0.30;
    ctx.fillStyle = '#e8a058';
    ctx.fillRect(0, 0, 240, 160);
  }
  if (d > 0.02) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = d * 0.72;
    ctx.fillStyle = '#4a5aa8';
    ctx.fillRect(0, 0, 240, 160);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = d * 0.35;
    ctx.fillStyle = '#3a3a6a';
    ctx.fillRect(0, 0, 240, 160);

    // 夜窗
    if (power) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, d * 1.4);
      for (const wnd of world.windows) {
        ctx.drawImage(Art.tiles.windowNight, wnd.tx * TILE - cam.x, wnd.ty * TILE - cam.y);
      }
    }
    // 灯光辉光
    ctx.globalCompositeOperation = 'lighter';
    const gs = glowSprite();
    for (const L of lights) {
      ctx.globalAlpha = d * (L.a ?? 0.55);
      const r = L.r ?? 34;
      ctx.drawImage(gs, L.x - cam.x - r, L.y - cam.y - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}
