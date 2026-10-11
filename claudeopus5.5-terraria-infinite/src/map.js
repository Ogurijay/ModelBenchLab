// 地图:每个区块缓存一张 32×32 的颜色图(每格 1 像素),用于小地图与全屏世界地图。
// 已探索区块的键会写入存档;旧会话探索过、当前未加载的区块按需由生成器 + 存档记录重建。
import { CS, CSH, CM, CA, ckey, ckeyX, ckeyY, TS } from './const.js';
import { BLOCKS, WALLS } from './blocks.js';
import { hex } from './art.js';
import { unrle } from './world.js';

const fgCol = BLOCKS.map(b => (b.map ? hex(b.map) : null));
const wallCol = WALLS.map(w => (w.id ? hex(w.map).map(v => v * 0.75) : null));

export class WorldMap {
  constructor(game) {
    this.game = game;
    this.imgs = new Map();
    this.explored = new Set();
    this.queue = [];
  }
  load(list) { this.explored = new Set(list || []); }
  save() { return [...this.explored]; }

  markExplored(c) { if (!this.explored.has(c.key)) this.explored.add(c.key); }

  build(key, data) {
    const cx = ckeyX(key), cy = ckeyY(key);
    let e = this.imgs.get(key);
    if (!e) {
      const cv = document.createElement('canvas'); cv.width = CS; cv.height = CS;
      e = { cv, ctx: cv.getContext('2d') }; e.img = e.ctx.createImageData(CS, CS);
      this.imgs.set(key, e);
    }
    const d = e.img.data, gen = this.game.world.gen;
    for (let lx = 0; lx < CS; lx++) {
      const s = gen.column(cx * CS + lx).s;
      for (let ly = 0; ly < CS; ly++) {
        const i = (ly << CSH) | lx, o = i * 4, y = cy * CS + ly;
        let c = null;
        const f = data.fg[i];
        if (f && fgCol[f]) c = fgCol[f];
        else if (data.fluid[i]) c = (data.fluid[i] >> 4) === 1 ? [46, 104, 214] : [232, 96, 26];
        else if (data.wall[i]) c = wallCol[data.wall[i]];
        else c = y < s + 3 ? [138, 184, 232] : [26, 20, 16];
        // 深度微暗
        const k = y > s + 4 ? 0.85 : 1;
        d[o] = c[0] * k; d[o + 1] = c[1] * k; d[o + 2] = c[2] * k; d[o + 3] = 255;
      }
    }
    e.ctx.putImageData(e.img, 0, 0);
    return e;
  }

  // 每帧:刷新已加载且有变化的区块;按预算重建旧探索区块
  update(budget = 2) {
    for (const c of this.game.world.chunks.values()) {
      if (!this.explored.has(c.key)) continue;
      if (c.mdirty || !this.imgs.has(c.key)) { this.build(c.key, c); c.mdirty = false; }
    }
    while (budget > 0 && this.queue.length) {
      const k = this.queue.shift();
      if (this.imgs.has(k)) continue;
      const rec = this.game.store.get(k);
      const data = rec?.b ? { fg: unrle(rec.b[0]), wall: unrle(rec.b[1]), fluid: unrle(rec.b[2]) } : this.game.world.gen.genChunk(ckeyX(k), ckeyY(k));
      this.build(k, data);
      budget--;
    }
  }
  requestAll() {
    this.queue = [...this.explored].filter(k => !this.imgs.has(k));
  }

  // 绘制:中心 (wx, wy) 格,每格 ppt 像素
  draw(ctx, W, H, wx, wy, ppt, markers = []) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0d14'; ctx.fillRect(0, 0, W, H);
    const tx0 = wx - W / 2 / ppt, ty0 = wy - H / 2 / ppt;
    const cx0 = Math.floor(tx0 / CS), cx1 = Math.floor((tx0 + W / ppt) / CS), cy0 = Math.floor(ty0 / CS), cy1 = Math.floor((ty0 + H / ppt) / CS);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = ckey(cx, cy);
      const e = this.imgs.get(k);
      if (!e) { if (this.explored.has(k) && !this.queue.includes(k)) this.queue.push(k); continue; }
      ctx.drawImage(e.cv, Math.floor((cx * CS - tx0) * ppt), Math.floor((cy * CS - ty0) * ppt), Math.ceil(CS * ppt), Math.ceil(CS * ppt));
    }
    for (const m of markers) {
      const sx = (m.x - tx0) * ppt, sy = (m.y - ty0) * ppt;
      if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
      ctx.fillStyle = '#000'; ctx.fillRect(sx - m.r - 1, sy - m.r - 1, m.r * 2 + 2, m.r * 2 + 2);
      ctx.fillStyle = m.color; ctx.fillRect(sx - m.r, sy - m.r, m.r * 2, m.r * 2);
      if (m.label && ppt >= 1) { ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(m.label, sx + m.r + 3, sy + 4); }
    }
  }
}
