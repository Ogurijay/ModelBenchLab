// 世界:区块存取、方块更新、流体、随机刻(作物 / 草 / 树苗 / 积雪)、熔炉、跨时间补算与存档序列化。
import { CS, CSH, CM, CA, ckey, tkey, SEA, HELL_Y, DAY_TICKS } from './const.js';
import { BLOCKS, B, W, WALLS, solidOf, SOIL, GRASSY, TRUNKS, LEAVES } from './blocks.js';
import { SMELT, SMELT_TICKS, fuelOf, resolveDrop, maxStack } from './items.js';
import { treeShape, BIOME_TEMP } from './worldgen.js';

export const F_NOUPDATE = 1, F_NOMOD = 2;
const WASH = new Set(['torch', 'soil', 'farmland', 'floor']);
const TREE_TRUNK = new Set([...TRUNKS, B.cactus]);
const TREEISH = new Set([...TRUNKS, ...LEAVES, B.cactus, B.vine]);

export class Chunk {
  constructor(cx, cy, d) {
    this.cx = cx; this.cy = cy; this.key = ckey(cx, cy);
    this.fg = d.fg; this.wall = d.wall; this.fluid = d.fluid; this.meta = d.meta;
    this.te = d.te || new Map();
    this.modified = false;      // 需要写入存档记录
    this.blocksModified = false;
    this.teModified = false;
    this.dirtySave = false;
    this.rdirty = true;         // 渲染缓存失效
    this.mdirty = true;         // 地图缓存失效
    this.spawned = false;
    this.lastTick = 0;
  }
}

// —— 存档压缩:游程编码(Uint8Array 成对 [长度-1, 值])
export function rle(a) {
  const out = [];
  for (let i = 0; i < a.length;) {
    const v = a[i]; let n = 1;
    while (i + n < a.length && a[i + n] === v && n < 256) n++;
    out.push(n - 1, v); i += n;
  }
  return Uint8Array.from(out);
}
export function unrle(r, len = CA) {
  const a = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < r.length; i += 2) { const n = r[i] + 1; a.fill(r[i + 1], p, p + n); p += n; }
  return a;
}

export class World {
  constructor(gen, clock, store, hooks) {
    this.gen = gen; this.clock = clock; this.store = store; this.hooks = hooks;
    this.chunks = new Map();
    this.lc = null;
    this.updates = [];
    this.fluidList = []; this.fluidSet = new Set(); this.fluidTick = 0;
    this.furnaces = new Set();
    this.rtAcc = 0;
    this.creative = false;
  }

  // ———————————————— 区块
  peek(cx, cy) { return this.chunks.get(ckey(cx, cy)) || null; }
  chunk(cx, cy) { return this.chunks.get(ckey(cx, cy)) || this.load(cx, cy); }
  _c(x, y) {
    const cx = x >> CSH, cy = y >> CSH, lc = this.lc;
    if (lc && lc.cx === cx && lc.cy === cy) return lc;
    return (this.lc = this.chunk(cx, cy));
  }
  isLoaded(x, y) { return this.chunks.has(ckey(x >> CSH, y >> CSH)); }

  load(cx, cy) {
    const key = ckey(cx, cy), rec = this.store.get(key);
    let data;
    if (rec && rec.b) data = { fg: unrle(rec.b[0]), wall: unrle(rec.b[1]), fluid: unrle(rec.b[2]), meta: unrle(rec.b[3]), te: new Map(), spawns: [] };
    else data = this.gen.genChunk(cx, cy);
    const c = new Chunk(cx, cy, data);
    const now = this.clock.tick;
    if (rec) {
      if (rec.te) c.te = new Map(rec.te.map(([i, o]) => [i, structuredClone(o)]));
      c.spawned = !!rec.sp; c.lastTick = rec.t ?? now;
      c.blocksModified = !!rec.b; c.teModified = !!rec.te; c.modified = true;
    } else c.lastTick = now;
    this.chunks.set(key, c);
    for (const [i, o] of c.te) if (o.type === 'furnace') this.furnaces.add(tkey(cx * CS + (i & CM), cy * CS + (i >> CSH)));
    if (!c.spawned && data.spawns && data.spawns.length) { c.spawned = true; c.modified = true; this.hooks.spawnAnimals?.(data.spawns); }
    if (rec?.ents?.length) this.hooks.restoreEnts?.(rec.ents);
    // 激活与空气相邻的生成流体(含水层边缘),让它们自然沉降
    if (!rec || rec.b) for (let i = 0; i < CA; i++) {
      if (!c.fluid[i]) continue;
      const lx = i & CM, ly = i >> CSH;
      const open = (j) => j >= 0 && j < CA && !c.fluid[j] && !BLOCKS[c.fg[j]].solid;
      if ((ly < CM && open(i + CS)) || (lx > 0 && open(i - 1)) || (lx < CM && open(i + 1))) this.addFluid(cx * CS + lx, cy * CS + ly);
    }
    if (rec && now - c.lastTick > 100) this.catchUp(c, now - c.lastTick);
    c.lastTick = now;
    this.hooks.chunkLoaded?.(c);
    return c;
  }

  record(c) {
    const rec = { t: this.clock.tick, sp: c.spawned ? 1 : 0 };
    if (c.blocksModified) rec.b = [rle(c.fg), rle(c.wall), rle(c.fluid), rle(c.meta)];
    if (c.teModified || (c.blocksModified && c.te.size)) rec.te = [...c.te].map(([i, o]) => [i, structuredClone(o)]);
    return rec;
  }

  unload(c) {
    const ents = this.hooks.collectEnts?.(c) || [];
    if (c.modified || ents.length) {
      const rec = this.record(c);
      if (ents.length) rec.ents = ents;
      this.store.put(c.key, rec);
    }
    for (const [i] of c.te) this.furnaces.delete(tkey(c.cx * CS + (i & CM), c.cy * CS + (i >> CSH)));
    this.chunks.delete(c.key);
    if (this.lc === c) this.lc = null;
    this.hooks.chunkUnloaded?.(c);
  }

  // 保持玩家周围区块加载;远处区块卸载(写入存档缓存)
  manage(x0, y0, x1, y1, budget = 2) {
    const cx0 = (x0 >> CSH) - 1, cx1 = (x1 >> CSH) + 1, cy0 = (y0 >> CSH) - 1, cy1 = (y1 >> CSH) + 1;
    // 视野内同步生成
    for (let cy = cy0 + 1; cy <= cy1 - 1; cy++) for (let cx = cx0 + 1; cx <= cx1 - 1; cx++) this.chunk(cx, cy);
    // 预加载外圈(按预算)
    let n = 0;
    for (let cy = cy0; cy <= cy1 && n < budget; cy++) for (let cx = cx0; cx <= cx1 && n < budget; cx++) {
      if (!this.chunks.has(ckey(cx, cy))) { this.load(cx, cy); n++; }
    }
    // 卸载
    let u = 0;
    for (const c of this.chunks.values()) {
      if (c.cx < cx0 - 3 || c.cx > cx1 + 3 || c.cy < cy0 - 2 || c.cy > cy1 + 2) { this.unload(c); if (++u >= 4) break; }
    }
  }

  // 自动存档:把所有已改动区块写入存档(不卸载)
  flush() {
    for (const c of this.chunks.values()) {
      if (c.dirtySave || (c.modified && !this.store.has(c.key))) {
        const rec = this.record(c);
        this.store.put(c.key, rec);
        c.dirtySave = false;
      }
    }
  }

  // ———————————————— 方块读写
  fg(x, y) { return this._c(x, y).fg[((y & CM) << CSH) | (x & CM)]; }
  wall(x, y) { return this._c(x, y).wall[((y & CM) << CSH) | (x & CM)]; }
  fluid(x, y) { return this._c(x, y).fluid[((y & CM) << CSH) | (x & CM)]; }
  meta(x, y) { return this._c(x, y).meta[((y & CM) << CSH) | (x & CM)]; }
  solid(x, y) { const c = this._c(x, y), i = ((y & CM) << CSH) | (x & CM); return solidOf(c.fg[i], c.meta[i]); }
  platform(x, y) { return BLOCKS[this.fg(x, y)].platform; }
  // 未加载区域视为实心(防止实体掉出世界)
  solidSafe(x, y) {
    const c = this.chunks.get(ckey(x >> CSH, y >> CSH));
    if (!c) return true;
    const i = ((y & CM) << CSH) | (x & CM);
    return solidOf(c.fg[i], c.meta[i]);
  }

  touched(c, x, y, blocks = true) {
    c.modified = true; c.dirtySave = true; c.rdirty = true; c.mdirty = true;
    if (blocks) c.blocksModified = true;
    const lx = x & CM, ly = y & CM;
    if (lx === 0) this.markR(c.cx - 1, c.cy); else if (lx === CM) this.markR(c.cx + 1, c.cy);
    if (ly === 0) this.markR(c.cx, c.cy - 1); else if (ly === CM) this.markR(c.cx, c.cy + 1);
  }
  markR(cx, cy) { const c = this.peek(cx, cy); if (c) c.rdirty = true; }

  set(x, y, id, meta = 0, flags = 0) {
    const c = this._c(x, y), i = ((y & CM) << CSH) | (x & CM);
    const old = c.fg[i];
    if (old === id && c.meta[i] === meta) return;
    let o = null;
    if (old !== id && c.te.has(i)) {
      o = c.te.get(i);
      c.te.delete(i); c.teModified = true;
      if (o.type === 'furnace') this.furnaces.delete(tkey(x, y));
    }
    c.fg[i] = id; c.meta[i] = meta;
    if (id !== B.air && c.fluid[i] && BLOCKS[id].solid) c.fluid[i] = 0;
    this.touched(c, x, y);
    if (!(flags & F_NOUPDATE)) this.notify(x, y);
    this.hooks.changed?.(x, y, old, id, o);
  }
  setMeta(x, y, m) {
    const c = this._c(x, y), i = ((y & CM) << CSH) | (x & CM);
    if (c.meta[i] === m) return;
    c.meta[i] = m; this.touched(c, x, y);
  }
  setWall(x, y, w) {
    const c = this._c(x, y), i = ((y & CM) << CSH) | (x & CM);
    if (c.wall[i] === w) return;
    c.wall[i] = w; this.touched(c, x, y);
    this.notify(x, y);
  }
  setFluid(x, y, v) {
    const c = this._c(x, y), i = ((y & CM) << CSH) | (x & CM);
    if (c.fluid[i] === v) return;
    c.fluid[i] = v;
    c.modified = c.blocksModified = c.dirtySave = c.mdirty = true;
  }
  getTe(x, y) { const c = this._c(x, y); return c.te.get(((y & CM) << CSH) | (x & CM)) || null; }
  setTe(x, y, o) {
    const c = this._c(x, y), i = ((y & CM) << CSH) | (x & CM);
    if (o) c.te.set(i, o); else c.te.delete(i);
    c.teModified = true; c.modified = true; c.dirtySave = true;
    if (o?.type === 'furnace') this.furnaces.add(tkey(x, y));
  }
  teChanged(x, y) { const c = this._c(x, y); c.teModified = true; c.modified = true; c.dirtySave = true; }

  // 天空暴露(用于光照与刷怪):无背景墙、不透明块之上、接近天然地表
  skyAt(x, y) {
    const w = this.wall(x, y);
    if (w && !WALLS[w].transparent) return false;
    return y < this.gen.column(x).s + 7;
  }
  temperature(x, y) {
    const col = this.gen.column(x);
    if (y > col.s + 12) return 0.5;
    let t = BIOME_TEMP[col.biome] + this.clock.seasonTemp();
    if (y < -40) t -= (-40 - y) * 0.012;
    return t;
  }

  // ———————————————— 方块更新
  notify(x, y) {
    this.updates.push(x, y, x - 1, y, x + 1, y, x, y - 1, x, y + 1);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (this.isLoaded(x + dx, y + dy) && this.fluid(x + dx, y + dy)) this.addFluid(x + dx, y + dy);
    }
  }
  processUpdates(limit = 4000) {
    let n = 0;
    while (this.updates.length && n++ < limit) {
      const y = this.updates.pop(), x = this.updates.pop();
      if (!this.isLoaded(x, y)) continue;
      this.blockUpdate(x, y);
    }
  }
  blockUpdate(x, y) {
    const id = this.fg(x, y);
    if (!id) return;
    const b = BLOCKS[id];
    if (b.gravity) {
      const below = this.fg(x, y + 1);
      if (this.isLoaded(x, y + 1) && !solidOf(below, this.meta(x, y + 1)) && !BLOCKS[below].platform) {
        this.set(x, y, B.air, 0, F_NOUPDATE);
        this.notify(x, y);
        this.hooks.fall?.(x, y, id);
        return;
      }
    }
    if (b.support && !this.supported(x, y, id)) { this.breakBlock(x, y, { drop: true }); return; }
    if (id === B.door) {
      const ys = this.doorColumn(x, y), bottom = Math.max(...ys);
      if (ys.length < 2 || !(this.solid(x, bottom + 1) || this.platform(x, bottom + 1))) this.breakBlock(x, y, { drop: true });
    } else if (id === B.bed) {
      const m = this.meta(x, y), foot = m & 1, left = m & 2;
      const dx = (foot ? -1 : 1) * (left ? 1 : -1);
      if (this.fg(x + dx, y) !== B.bed) this.set(x, y, B.air);
      else if (!this.solid(x, y + 1) && !this.platform(x, y + 1)) this.breakBlock(x, y, { drop: true });
    } else if (id === B.grass || id === B.snow_grass || id === B.jungle_grass) {
      // 被方块盖住的草立刻变泥土
    } else if (id === B.farmland) {
      const a = this.fg(x, y - 1);
      if (a && BLOCKS[a].solid) this.set(x, y, B.dirt);
    }
  }
  supported(x, y, id) {
    const b = BLOCKS[id], below = this.fg(x, y + 1);
    switch (b.support) {
      case 'soil': return SOIL.has(below) && (id !== B.dead_bush || below === B.sand || SOIL.has(below));
      case 'farmland': return below === B.farmland;
      case 'floor': return this.solid(x, y + 1) || BLOCKS[below].platform;
      case 'cactus': return below === B.sand || below === B.cactus;
      case 'torch': return this.wall(x, y) > 0 || this.solid(x - 1, y) || this.solid(x + 1, y) || this.solid(x, y + 1);
      case 'hang': { const a = this.fg(x, y - 1); return this.solid(x, y - 1) || a === id || LEAVES.includes(a); }
      case 'any': {
        if (this.wall(x, y) || this.solid(x - 1, y) || this.solid(x + 1, y) || this.solid(x, y + 1) || this.solid(x, y - 1)) return true;
        return this.fg(x, y - 1) === id || this.fg(x, y + 1) === id;
      }
    }
    return true;
  }

  // 与 (x,y) 竖直相连的门格(最多 3 格)
  doorColumn(x, y) {
    const ys = [y];
    for (let k = 1; k < 3 && this.fg(x, y - k) === B.door; k++) ys.push(y - k);
    for (let k = 1; k < 3 && this.fg(x, y + k) === B.door; k++) ys.push(y + k);
    return ys;
  }

  // 破坏方块并掉落;返回是否成功
  breakBlock(x, y, o = {}) {
    const id = this.fg(x, y);
    if (!id) return false;
    const b = BLOCKS[id], m = this.meta(x, y), drop = o.drop !== false;
    const drops = [];
    const add = (k, n = 1) => { if (k && n > 0) drops.push([k, n]); };
    if (o.player && TREE_TRUNK.has(id)) return this.fellTree(x, y);
    if (id === B.door) {
      for (const dy of this.doorColumn(x, y)) if (dy !== y) this.set(x, dy, B.air, 0, F_NOUPDATE);
      add('door');
    } else if (id === B.bed) {
      const dx = (m & 1 ? -1 : 1) * (m & 2 ? 1 : -1);
      if (this.fg(x + dx, y) === B.bed) this.set(x + dx, y, B.air, 0, F_NOUPDATE);
      add('bed');
    } else if (id === B.wheat) {
      if (m >= 7) { add('wheat_item', 1); add('seeds', 1 + (Math.random() * 3 | 0)); } else add('seeds', 1);
    } else if (id === B.sapling) add('sapling_' + ['oak', 'birch', 'spruce', 'jungle', 'palm'][m] || 'sapling_oak');
    else if (id === B.berry_bush) { if (m >= 3) add('berries', 2 + (Math.random() * 2 | 0)); else if (m === 2) add('berries', 1); }
    else if (LEAVES.includes(id)) this.leafDrops(b.species, add);
    else if (id === B.ice) { if (y < HELL_Y && this.fg(x, y + 1) !== B.air || this.fluid(x, y + 1)) { this.set(x, y, B.air); this.setFluid(x, y, 0x18); this.addFluid(x, y); this.hooks.broke?.(x, y, id); return true; } }
    else if (id === B.flower) add('flower');
    else if (id === B.mushroom) add('mushroom');
    else if (o.tool !== false && b.drop) {
      const d = resolveDrop(b.drop, Math.random());
      if (d) add(d[0], d[1]);
    }
    const te = this.getTe(x, y);
    if (te?.items) for (const s of te.items) if (s) add(s.id, s.n);
    if (te?.type === 'furnace') for (const k of ['in', 'fuel', 'out']) if (te[k]) add(te[k].id, te[k].n);
    this.set(x, y, B.air);
    this.hooks.broke?.(x, y, id);
    if (drop) for (const [k, n] of drops) this.hooks.drop?.(x + 0.5, y + 0.5, k, n);
    return true;
  }
  leafDrops(sp, add) {
    const r = Math.random();
    if (r < 0.06) add('sapling_' + ['oak', 'birch', 'spruce', 'jungle', 'palm'][sp]);
    else if (sp === 0 && r < 0.09) add('apple');
    else if (r < 0.11) add('stick');
  }

  // 砍树:砍断处以上相连的整棵树倒下
  fellTree(x, y) {
    const seen = new Set(), list = [], q = [[x, y, true]];
    seen.add(tkey(x, y));
    while (q.length && list.length < 500) {
      const [cx, cy, viaTrunk] = q.shift();
      const id = this.fg(cx, cy);
      list.push([cx, cy, id]);
      const isTrunk = TREE_TRUNK.has(id);
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (ny > y || Math.abs(nx - x) > 5) continue;
        const k = tkey(nx, ny);
        if (seen.has(k)) continue;
        const nid = this.fg(nx, ny);
        if (!TREEISH.has(nid)) continue;
        if (TREE_TRUNK.has(nid) && !isTrunk) continue;            // 树干只能从树干到达(避免连带邻树)
        if (TREE_TRUNK.has(nid) && (dx && dy)) continue;
        if (!isTrunk && LEAVES.includes(id) && nid === B.vine && dy < 0) continue;
        // 树叶若紧挨着别的树的树干(不在本树干列上),视为邻树的树冠
        if (LEAVES.includes(nid) && this.nearOtherTrunk(nx, ny, x)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const drops = new Map();
    const add = (k, n = 1) => drops.set(k, (drops.get(k) || 0) + n);
    for (const [tx, ty, id] of list) {
      if (TRUNKS.includes(id)) add('log');
      else if (id === B.cactus) add('cactus');
      else if (LEAVES.includes(id)) this.leafDrops(BLOCKS[id].species, add);
      this.set(tx, ty, B.air, 0, F_NOUPDATE);
    }
    for (const [tx, ty] of list) this.notify(tx, ty);
    this.hooks.felled?.(list);
    for (const [k, n] of drops) this.hooks.drop?.(x + 0.5, y + 0.2, k, n);
    return true;
  }

  nearOtherTrunk(lx, ly, treeX) {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) {
      const tx = lx + dx;
      if (Math.abs(tx - treeX) <= 1) continue;
      if (Math.abs(tx - treeX) < Math.abs(lx - treeX) + 0 && Math.abs(dx) > 1) continue;
      const id = this.fg(tx, ly + dy);
      if (TRUNKS.includes(id) && Math.abs(tx - lx) < Math.abs(lx - treeX)) return true;
    }
    return false;
  }

  // 树苗长成大树(检查树干空间)
  growTree(x, y, sp) {
    const tiles = [];
    treeShape(sp, x, y, Math.random, (tx, ty, id) => tiles.push([tx, ty, id]));
    for (const [tx, ty, id] of tiles) {
      if (TRUNKS.includes(id) || id === B.cactus) {
        const f = this.fg(tx, ty);
        if (!(f === B.air || (tx === x && ty === y && f === B.sapling) || BLOCKS[f].replace) || this.fluid(tx, ty)) return false;
      }
    }
    for (const [tx, ty, id] of tiles) {
      const f = this.fg(tx, ty);
      if (f === B.air || BLOCKS[f].replace || (tx === x && ty === y)) { if (!this.fluid(tx, ty)) this.set(tx, ty, id, 0, F_NOUPDATE); }
    }
    this.hooks.grew?.(x, y);
    return true;
  }

  // ———————————————— 流体
  addFluid(x, y) {
    const k = tkey(x, y);
    if (this.fluidSet.has(k)) return;
    this.fluidSet.add(k); this.fluidList.push(x, y);
  }
  stepFluids(limit = 2500) {
    this.fluidTick++;
    const lavaTick = this.fluidTick % 4 === 0;
    const list = this.fluidList;
    this.fluidList = []; this.fluidSet.clear();
    let n = 0;
    for (let i = 0; i < list.length; i += 2) {
      if (n++ > limit) { for (let j = i; j < list.length; j += 2) this.addFluid(list[j], list[j + 1]); break; }
      this.flow(list[i], list[i + 1], lavaTick);
    }
  }
  flow(x, y, lavaTick) {
    if (!this.isLoaded(x, y)) return;
    let f = this.fluid(x, y);
    if (!f) return;
    const t = f >> 4;
    let L = f & 15;
    if (t === 2 && !lavaTick) { this.addFluid(x, y); return; }
    if (t === 1 && y > HELL_Y) { this.setFluid(x, y, 0); this.hooks.steam?.(x, y); return; }
    // 岩浆遇水:岩浆源 → 黑曜石,流动岩浆 → 圆石
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      if (!this.isLoaded(x + dx, y + dy)) continue;
      const nf = this.fluid(x + dx, y + dy);
      if (nf && (nf >> 4) !== t) {
        if (t === 2) { this.setFluid(x, y, 0); this.set(x, y, L >= 7 ? B.obsidian : B.cobblestone); this.hooks.fizz?.(x, y); return; }
        if (dy === 1) { this.setFluid(x, y + 1, 0); this.set(x, y + 1, (nf & 15) >= 7 ? B.obsidian : B.cobblestone); this.hooks.fizz?.(x, y + 1); }
      }
    }
    let changed = false;
    // 向下
    if (this.isLoaded(x, y + 1) && !this.solid(x, y + 1)) {
      const bf = this.fluid(x, y + 1);
      if (!bf || (bf >> 4) === t) {
        const bl = bf & 15, mv = Math.min(L, 8 - bl);
        if (mv > 0) {
          this.wash(x, y + 1, t);
          this.setFluid(x, y + 1, (t << 4) | (bl + mv)); L -= mv; changed = true;
          this.addFluid(x, y + 1);
        }
      }
    }
    // 向两侧均分
    if (L > 0) {
      const sides = Math.random() < 0.5 ? [-1, 1] : [1, -1];
      const part = [];
      for (const d of sides) {
        const nx = x + d;
        if (!this.isLoaded(nx, y) || this.solid(nx, y)) continue;
        const nf = this.fluid(nx, y);
        if (nf && (nf >> 4) !== t) continue;
        const nl = nf & 15;
        if (nl < L - (L === 1 ? 1 : 0) && nl < L) part.push([nx, nl]);
      }
      if (part.length) {
        let total = L; for (const p of part) total += p[1];
        const k = part.length + 1, each = Math.floor(total / k);
        let rem = total - each * k;
        const mine = each + (rem > 0 ? 1 : 0); if (rem > 0) rem--;
        if (mine !== L) {
          for (const p of part) {
            const nv = each + (rem > 0 ? 1 : 0); if (rem > 0) rem--;
            if (nv !== p[1]) { this.wash(p[0], y, t); this.setFluid(p[0], y, nv ? (t << 4) | nv : 0); this.addFluid(p[0], y); }
          }
          L = mine; changed = true;
        }
      }
    }
    if (changed) {
      this.setFluid(x, y, L ? (t << 4) | L : 0);
      this.addFluid(x, y);
      if (this.isLoaded(x, y - 1) && this.fluid(x, y - 1)) this.addFluid(x, y - 1);
      for (const d of [-1, 1]) if (this.isLoaded(x + d, y) && this.fluid(x + d, y)) this.addFluid(x + d, y);
    }
  }
  // 流体冲走火把、植物等
  wash(x, y, t) {
    const id = this.fg(x, y);
    if (!id) return;
    const b = BLOCKS[id];
    if (!b.solid && id !== B.bed && (b.replace || WASH.has(b.support))) this.breakBlock(x, y, { drop: t === 1 });
  }

  // ———————————————— 随机刻与天气
  tickWorld(dt, dtFurnace = dt) {
    const growth = this.clock.growthMult();
    this.rtAcc += 3 * dt;
    const n = Math.floor(this.rtAcc);
    this.rtAcc -= n;
    for (const c of this.chunks.values()) {
      for (let k = 0; k < n; k++) this.randomTick(c, (Math.random() * CA) | 0, growth);
      if (Math.random() < 0.35 * dt) this.weatherColumn(c);
    }
    // 熔炉
    for (const k of this.furnaces) {
      const x = Math.floor(k / 0x8000) - 0x4000000, y = (k % 0x8000) - 0x4000;
      const te = this.getTe(x, y);
      if (!te || te.type !== 'furnace') { this.furnaces.delete(k); continue; }
      const before = te.burn > 0;
      if (furnaceRun(te, dtFurnace)) this.teChanged(x, y);
      const lit = te.burn > 0;
      if (before !== lit) this.setMeta(x, y, lit ? 1 : 0);
    }
  }

  randomTick(c, i, growth) {
    const id = c.fg[i];
    if (!id) return;
    const x = c.cx * CS + (i & CM), y = c.cy * CS + (i >> CSH);
    switch (id) {
      case B.grass: case B.snow_grass: case B.jungle_grass: case B.mushroom_grass: {
        const above = this.fg(x, y - 1);
        if (BLOCKS[above].solid && BLOCKS[above].opaque) { this.set(x, y, id === B.grass || id === B.snow_grass ? B.dirt : B.mud); return; }
        const nx = x + ((Math.random() * 3) | 0) - 1, ny = y + ((Math.random() * 5) | 0) - 2;
        if (!this.isLoaded(nx, ny)) return;
        const t = this.fg(nx, ny), want = id === B.grass || id === B.snow_grass ? B.dirt : B.mud;
        if (t === want && !this.fg(nx, ny - 1) && !this.fluid(nx, ny - 1) && (id === B.mushroom_grass || this.skyAt(nx, ny - 1))) {
          this.set(nx, ny, id === B.grass && this.temperature(nx, ny) < -0.1 && this.gen.column(nx).cold ? B.snow_grass : id);
        }
        if (id !== B.mushroom_grass && !above && growth > 0.5 && Math.random() < 0.012 * growth) this.set(x, y - 1, Math.random() < 0.85 ? B.tall_grass : B.flower, (Math.random() * 3) | 0);
        if (id === B.mushroom_grass && !above && Math.random() < 0.02) this.set(x, y - 1, B.glow_mushroom);
        break;
      }
      case B.sapling:
        if (Math.random() < 0.14 * growth && this.light01(x, y) > 0.3) this.growTree(x, y, c.meta[i]);
        break;
      case B.wheat: {
        const m = c.meta[i];
        if (m < 7) {
          const hyd = this.fg(x, y + 1) === B.farmland && (this.meta(x, y + 1) & 1) ? 1 : 0.45;
          if (Math.random() < 0.33 * hyd * growth) this.setMeta(x, y, m + 1);
        }
        break;
      }
      case B.farmland: {
        const wet = this.waterNear(x, y) || (this.clock.weather !== 'clear' && this.skyAt(x, y - 1));
        const m = c.meta[i];
        if (wet && !(m & 1)) this.setMeta(x, y, m | 1);
        else if (!wet && (m & 1)) this.setMeta(x, y, m & ~1);
        else if (!wet && !this.fg(x, y - 1) && Math.random() < 0.12) this.set(x, y, B.dirt);
        break;
      }
      case B.berry_bush:
        if (c.meta[i] < 3 && Math.random() < 0.2 * growth) this.setMeta(x, y, c.meta[i] + 1);
        break;
      case B.cactus:
        if (!this.fg(x, y - 1) && this.fg(x, y + 2) !== B.cactus && Math.random() < 0.08 * growth) this.set(x, y - 1, B.cactus);
        break;
      case B.snow_layer: case B.ice:
        if (this.temperature(x, y) > 0.18 && Math.random() < 0.25) {
          if (id === B.ice) { this.set(x, y, B.air); this.setFluid(x, y, 0x18); this.addFluid(x, y); }
          else this.set(x, y, B.air);
        }
        break;
    }
  }
  waterNear(x, y) {
    for (let dy = -1; dy <= 0; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (!this.isLoaded(x + dx, y + dy)) continue;
      const f = this.fluid(x + dx, y + dy);
      if (f && (f >> 4) === 1) return true;
    }
    return false;
  }
  // 粗略光照(刷怪 / 树苗用):天光 + 附近光源
  light01(x, y) {
    let v = 0;
    if (this.skyAt(x, y) && !BLOCKS[this.fg(x, y)].opaque) v = this.clock.sunFactor() * (this.clock.weather === 'clear' ? 1 : 0.7) + 0.25 * (1 - this.clock.sunFactor());
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      if (!this.isLoaded(x + dx, y + dy)) continue;
      const id = this.fg(x + dx, y + dy), b = BLOCKS[id];
      let L = b.light;
      if (id === B.furnace) L = this.meta(x + dx, y + dy) & 1 ? [0.9, 0.5, 0.2] : null;
      const fl = this.fluid(x + dx, y + dy);
      if (fl >> 4 === 2) L = [1, 0.5, 0.2];
      if (L) v = Math.max(v, Math.max(L[0], L[1], L[2]) * Math.pow(0.86, Math.abs(dx) + Math.abs(dy)));
    }
    return v;
  }

  // 天气对地表的影响:降雪积雪、水面结冰、回暖融化、雨水润湿耕地
  weatherColumn(c) {
    const lx = (Math.random() * CS) | 0, x = c.cx * CS + lx;
    let ty = -1;
    for (let ly = 0; ly < CS; ly++) { const i = (ly << CSH) | lx; if (c.fg[i] || c.fluid[i]) { ty = ly; break; } }
    if (ty < 0) return;
    if (ty === 0) {
      const up = this.peek(c.cx, c.cy - 1);
      if (up) for (let ly = 0; ly < CS; ly++) { const i = (ly << CSH) | lx; if (up.fg[i] || up.fluid[i]) return; }
    }
    const y = c.cy * CS + ty;
    if (y > this.gen.column(x).s + 3 || (ty > 0 && c.wall[((ty - 1) << CSH) | lx])) return;
    const i = (ty << CSH) | lx, top = c.fg[i], fl = c.fluid[i];
    const temp = this.temperature(x, y), precip = this.clock.weather !== 'clear';
    if (temp < 0.15) {
      if (!top && fl === 0x18 && (precip || Math.random() < 0.35)) { this.setFluid(x, y, 0); this.set(x, y, B.ice, 0, F_NOUPDATE); }
      else if (precip && top && BLOCKS[top].solid && BLOCKS[top].opaque && top !== B.ice && Math.random() < 0.5) this.set(x, y - 1, B.snow_layer, 0, F_NOUPDATE);
      else if (precip && (top === B.tall_grass || top === B.flower) && Math.random() < 0.3) this.set(x, y, B.snow_layer, 0, F_NOUPDATE);
    } else {
      if (top === B.snow_layer && Math.random() < 0.55) this.set(x, y, B.air);
      else if (top === B.ice && !this.gen.column(x).cold && Math.random() < 0.4) { this.set(x, y, B.air); this.setFluid(x, y, 0x18); this.addFluid(x, y); }
      else if (precip && top === B.farmland) this.setMeta(x, y, c.meta[i] | 1);
    }
  }

  // ———————————————— 离线补算:区块重新加载时,按流逝的世界时间推进作物、树苗、熔炉与积雪
  catchUp(c, E, o = {}) {
    const growth = this.clock.growthMult();
    const hits = E * 3 / CA;              // 每格期望受到的随机刻次数
    let changed = 0;
    const saps = [];
    for (let i = 0; i < CA; i++) {
      const id = c.fg[i];
      if (id === B.wheat && c.meta[i] < 7) {
        const x = c.cx * CS + (i & CM), y = c.cy * CS + (i >> CSH);
        const ly = i >> CSH;
        const below = ly < CM ? c.fg[i + CS] : B.farmland, wet = ly < CM ? (c.meta[i + CS] & 1) : 1;
        const p = 0.33 * (below === B.farmland && wet ? 1 : 0.45) * growth;
        const inc = Math.floor(hits * p + Math.random());
        if (inc > 0) { c.meta[i] = Math.min(7, c.meta[i] + inc); changed++; }
      } else if (id === B.berry_bush && c.meta[i] < 3) {
        const inc = Math.floor(hits * 0.2 * growth + Math.random());
        if (inc > 0) { c.meta[i] = Math.min(3, c.meta[i] + inc); changed++; }
      } else if (id === B.sapling) {
        const p = 1 - Math.pow(1 - 0.14 * growth, hits);
        if (Math.random() < p) saps.push(i);
      }
    }
    if (o.furnaces !== false) for (const [i, te] of c.te) if (te.type === 'furnace' && furnaceRun(te, E)) { changed++; c.meta[i] = te.burn > 0 ? 1 : 0; c.teModified = true; }
    if (changed) { c.modified = c.blocksModified = c.dirtySave = true; c.rdirty = c.mdirty = true; }
    for (const i of saps) this.growTree(c.cx * CS + (i & CM), c.cy * CS + (i >> CSH), c.meta[i]);
    // 季节性的积雪 / 融雪 / 结冰
    const n = Math.min(80, Math.floor(E / 300));
    for (let k = 0; k < n; k++) this.weatherColumn(c);
    if (!o.quiet && (changed || saps.length)) this.hooks.caughtUp?.(c, E, changed + saps.length);
  }
}

// 熔炉推进 E 刻;返回是否有变化(正常运转与离线补算共用,精确计算燃料与成品)
export function furnaceRun(te, E) {
  let changed = false;
  const canSmelt = () => {
    if (!te.in || !SMELT[te.in.id]) return false;
    const r = SMELT[te.in.id];
    return !te.out || (te.out.id === r && te.out.n < maxStack(r));
  };
  let guard = 0;
  while (E > 1e-6 && guard++ < 4096) {
    if (!(te.burn > 0)) {
      if (canSmelt() && te.fuel && fuelOf(te.fuel.id) > 0) {
        te.burn = te.burnMax = fuelOf(te.fuel.id);
        if (te.fuel.id === 'lava_bucket') te.fuel = { id: 'bucket', n: 1 };
        else if (--te.fuel.n <= 0) te.fuel = null;
        changed = true;
      } else { if (te.cook > 0) { te.cook = Math.max(0, te.cook - E * 2); changed = true; } break; }
    }
    const smelting = canSmelt();
    const step = Math.min(E, te.burn, smelting ? SMELT_TICKS - (te.cook || 0) : te.burn);
    te.burn -= step; E -= step; changed = true;
    if (smelting) {
      te.cook = (te.cook || 0) + step;
      if (te.cook >= SMELT_TICKS - 1e-6) {
        te.cook = 0;
        const r = SMELT[te.in.id];
        if (--te.in.n <= 0) te.in = null;
        te.out = te.out ? { id: r, n: te.out.n + 1 } : { id: r, n: 1 };
      }
    } else te.cook = 0;
  }
  return changed;
}
