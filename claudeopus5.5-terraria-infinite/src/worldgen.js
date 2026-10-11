// 无限世界生成:每一格都是 (x, y, seed) 的纯函数 —— 任意区块可在任意时刻按需重建,
// 只有被改动过的区块才需要存档。树木、小屋、浮空岛等跨区块结构同样由列/网格哈希确定。
import { CS, CA, SEA, DEEP_Y, HELL_Y, BEDROCK_Y, ISLAND_Y } from './const.js';
import { B, W, TRUNKS, LEAVES } from './blocks.js';
import { hash2, rand2, noise1, fbm1, noise2, fbm2, mulberry32, clamp, lerp, smoothstep } from './rng.js';

export const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, TAIGA: 5, JUNGLE: 6, MOUNTAINS: 7 };
export const BIOME_NAMES = ['海洋', '沙滩', '平原', '森林', '沙漠', '雪原针叶林', '丛林', '山地'];
// 生物群系的基础温度(季节在此基础上叠加)
export const BIOME_TEMP = [0.5, 0.6, 0.55, 0.5, 0.95, -0.4, 0.85, 0.15];

const WATER_FULL = 0x18, LAVA_FULL = 0x28;
const CAMP_CELL = 280;
const pack = (fg, wall = 0, fluid = 0) => fg | (wall << 8) | (fluid << 16);

export class WorldGen {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.S = this.seed;
    this.cols = new Map();
    this.raws = new Map();
    this.fixed = [];     // 固定营地:起始营地(己方)与宿敌营地(敌方),由出生点确定并存入世界存档
  }
  setFixedCamps(list) { this.fixed = (list || []).filter(Boolean); this.cols.clear(); }
  get start() { return this.fixed[0] || null; }
  // 在 x 附近寻找适合建营地的平地
  findCampSite(x0, dir) {
    for (let k = 0; k < 400; k += 4) {
      const x = Math.round(x0 + dir * k), r = this.raw(x);
      if (r.biome === BIOME.OCEAN || r.biome === BIOME.BEACH || r.biome === BIOME.MOUNTAINS || r.s >= -1) continue;
      if (Math.abs(this.raw(x - 8).s - r.s) > 4 || Math.abs(this.raw(x + 8).s - r.s) > 4) continue;
      return x;
    }
    return Math.round(x0);
  }

  // ——————————————————— 营地:每 330 格一个候选,起始营地附近不再生成
  campInfo(ci) {
    const S = this.S, h = hash2(ci, 909, S);
    if (h % 100 >= 80) return null;
    const cx = ci * CAMP_CELL + 50 + ((h >>> 8) % 180);
    if (this.fixed.some(f => Math.abs(cx - f.x) < 230)) return null;
    const r = this.raw(cx);
    if (r.biome === BIOME.OCEAN || r.biome === BIOME.BEACH || r.biome === BIOME.MOUNTAINS || r.s >= -1) return null;
    return { cx, s0: r.s, faction: (h >>> 20) & 1 ? 'alliance' : 'horde' };
  }
  campAt(x) {
    for (let i = 0; i < this.fixed.length; i++) {
      const st = this.fixed[i];
      if (Math.abs(x - st.x) > 13) continue;
      if (st.s0 === undefined) st.s0 = Math.min(this.raw(st.x).s, -1);
      return { cx: st.x, s0: st.s0, faction: st.faction, start: i === 0 };
    }
    const ci = Math.floor(x / CAMP_CELL);
    for (const c of [ci, ci - 1, ci + 1]) {
      const cp = this.campInfo(c);
      if (cp && Math.abs(x - cp.cx) <= 13) return cp;
    }
    return null;
  }

  // ——————————————————— 原始地形(未经营地平整)
  raw(x) {
    let r = this.raws.get(x);
    if (r) return r;
    if (this.raws.size > 16000) this.raws.clear();
    const S = this.S;
    let cont = fbm1(x / 1500, S + 1, 3) * 1.25 + 0.55 * Math.exp(-((x / 700) ** 2));
    const temp = fbm1(x / 1900, S + 2, 2) * 1.3;
    const humid = fbm1(x / 1150, S + 3, 2) * 1.3;
    const mount = fbm1(x / 950, S + 4, 2) * 1.2 - 0.25 * Math.exp(-((x / 240) ** 2));
    let biome;
    if (cont < -0.42) biome = BIOME.OCEAN;
    else if (cont < -0.33) biome = temp < -0.3 ? BIOME.TAIGA : BIOME.BEACH;
    else if (mount > 0.32) biome = BIOME.MOUNTAINS;
    else if (temp < -0.3) biome = BIOME.TAIGA;
    else if (temp > 0.3 && humid < -0.02) biome = BIOME.DESERT;
    else if (temp > 0.08 && humid > 0.16) biome = BIOME.JUNGLE;
    else if (humid > -0.08) biome = BIOME.FOREST;
    else biome = BIOME.PLAINS;

    const rough = biome === BIOME.DESERT ? 0.6 : biome === BIOME.PLAINS ? 0.7 : 1;
    let land = -9 - 7 * fbm1(x / 230, S + 5, 3) * rough - 3 * fbm1(x / 46, S + 6, 2) * rough;
    const oceanT = smoothstep(-0.3, -0.5, cont);
    let h = lerp(land, 20 + 10 * fbm1(x / 90, S + 7, 2), oceanT);
    const mt = smoothstep(0.2, 0.55, mount) * (1 - oceanT);
    const ridge = 1 - Math.abs(fbm1(x / 110, S + 8, 3));
    h -= mt * (22 + 60 * ridge * ridge);
    r = { cont, temp, humid, biome, s: Math.round(h) };
    this.raws.set(x, r);
    return r;
  }

  // ——————————————————— 列信息(地表高度、群系、土层……)
  column(x) {
    let c = this.cols.get(x);
    if (c) return c;
    if (this.cols.size > 12000) this.cols.clear();
    const S = this.S;
    const { cont, temp, humid, biome } = this.raw(x);
    let s = this.raw(x).s;
    const camp = this.campAt(x);
    if (camp) {
      const dx = Math.abs(x - camp.cx);
      s = dx <= 10 ? camp.s0 : Math.round(lerp(camp.s0, s, (dx - 10) / 3));
    }

    const cold = biome === BIOME.TAIGA || (biome === BIOME.MOUNTAINS && s < -60);
    let top = B.grass, sub = B.dirt, subWall = W.dirt, soil = 3 + Math.round(1.5 + 1.5 * noise1(x / 13, S + 9));
    switch (biome) {
      case BIOME.OCEAN: top = B.sand; sub = B.sand; subWall = W.sandstone; soil = 3; if (noise1(x / 30, S + 10) > 0.4) { top = B.gravel; sub = B.gravel; } else if (noise1(x / 25, S + 11) > 0.45) { top = sub = B.clay; } break;
      case BIOME.BEACH: top = B.sand; sub = B.sand; subWall = W.sandstone; soil = 4; break;
      case BIOME.DESERT: top = B.sand; sub = B.sand; subWall = W.sandstone; soil = 6 + Math.round(2 * noise1(x / 20, S + 12)); break;
      case BIOME.TAIGA: top = B.snow_grass; break;
      case BIOME.JUNGLE: top = B.jungle_grass; sub = B.mud; subWall = W.mud; soil = 6; break;
      case BIOME.MOUNTAINS:
        if (s < -62) { top = B.snow; sub = B.stone; subWall = W.stone; soil = 2; }
        else if (s < -42) { top = B.stone; sub = B.stone; subWall = W.stone; soil = 1; }
        break;
    }
    if (biome !== BIOME.OCEAN && biome !== BIOME.BEACH && s >= -1 && top === B.grass) { top = B.sand; sub = B.sand; } // 低地水岸
    const wallStart = 2 + (hash2(x, 3, S) % 2);
    c = {
      x, s, biome, cont, temp, humid, cold, top, sub, subWall, soil, wallStart,
      deepOff: Math.round(8 * noise1(x / 24, S + 13)),
      hellOff: Math.round(6 * noise1(x / 18, S + 14)),
      entrance: noise1(x / 42, S + 15) > 0.62,
      hellMid: 652 + 10 * noise1(x / 60, S + 16), hellHalf: 24 + 9 * noise1(x / 90, S + 17),
      isl: this.island(x), camp,
    };
    if (camp && Math.abs(x - camp.cx) <= 10) { c.entrance = false; if (c.top === B.sand && biome !== BIOME.DESERT) { c.top = B.grass; c.sub = B.dirt; } }
    this.cols.set(x, c);
    return c;
  }

  island(x) {
    const S = this.S, cell = Math.floor(x / 420), h = hash2(cell, 77, S);
    if (h % 10 >= 6) return null;
    const cx = cell * 420 + 80 + ((h >>> 4) % 260), hw = 12 + ((h >>> 12) % 12), cy = ISLAND_Y + ((h >>> 16) % 40) - 20;
    const dx = x - cx;
    if (Math.abs(dx) > hw) return null;
    const f = 1 - (dx / hw) ** 2;
    return { cx, cy, hw, top: cy - Math.round(1 + 2 * f), bot: cy + Math.round(1 + 8 * Math.sqrt(f) + noise1(x / 3, S + 18)), cell };
  }

  // ——————————————————— 单格基础地形(不含树木 / 结构 / 装饰)
  base(x, y, c) {
    const S = this.S;
    if (y >= BEDROCK_Y) {
      if (y >= BEDROCK_Y + 4 || hash2(x, y, S) % 4 <= y - BEDROCK_Y) return pack(B.bedrock);
    }
    const s = c.s;
    if (y < s) {
      if (c.isl && y >= c.isl.top && y <= c.isl.bot) {
        const d = y - c.isl.top;
        if (y > c.isl.bot - 2 - (hash2(x, 5, S) % 2)) return pack(B.cloud);
        if (d === 0) return pack(B.grass);
        return pack(d > 3 && noise2(x / 6, y / 6, S + 19) > 0.3 ? B.stone : B.dirt, d > 1 ? W.dirt : 0);
      }
      if (y >= SEA) return y === SEA && c.cold ? pack(B.ice) : pack(B.air, 0, WATER_FULL);
      return 0;
    }
    const d = y - s;
    if (y >= HELL_Y + c.hellOff) return this.hell(x, y, c);

    // 洞穴
    let cave = false, big = false;
    if (!(s >= SEA && d < 10)) {
      const tw = 0.038 + 0.034 * Math.min(1, d / 220);
      if (d > 5 || (c.entrance && d >= 0)) {
        const n1 = noise2(x / 58, y / 30, S + 40);
        if (n1 < tw && n1 > -tw) cave = true;
      }
      if (!cave && d > 14) {
        const n2 = noise2(x / 34, y / 54, S + 41);
        if (n2 < tw * 0.8 && n2 > -tw * 0.8) cave = true;
      }
      if (!cave && y > 45) {
        const cv = fbm2(x / 95, y / 50, S + 42, 2);
        const th = 0.5 - 0.13 * Math.min(1, (y - 45) / 400);
        if (cv > th) { cave = true; big = cv > th + 0.09; }
      }
    }
    // 材质与天然背景墙
    let m, w;
    if (d < c.soil) { m = d === 0 ? c.top : c.sub; w = d >= c.wallStart ? c.subWall : 0; }
    else if (c.biome === BIOME.DESERT && d < c.soil + 8) { m = B.sandstone; w = W.sandstone; }
    else if (y > DEEP_Y + c.deepOff) { m = B.deepslate; w = W.deepslate; }
    else { m = B.stone; w = W.stone; }
    if (cave) return pack(B.air, big ? 0 : (d < c.wallStart ? 0 : w), this.aquifer(x, y));
    if (m === B.stone || m === B.deepslate) {
      const deep = m === B.deepslate;
      // 土块 / 沙砾 / 黏土团
      const pk = noise2(x / 11, y / 11, S + 20);
      if (pk > 0.6) return pack(y < 140 ? B.dirt : B.gravel, w);
      if (pk < -0.62 && y < 200) return pack(B.clay, w);
      // 矿脉(网格散布,种类按深度加权)
      const ore = this.oreAt(x, y);
      if (ore) return pack(ore, w);
      if (deep && noise2(x / 9, y / 9, S + 35) > 0.6) return pack(B.cobbled_deepslate, w);
    }
    return pack(m, w);
  }

  hell(x, y, c) {
    const S = this.S;
    if (y < HELL_Y + 12 + c.hellOff) {
      return pack(hash2(x, y, S) % 12 < y - HELL_Y - c.hellOff ? B.ash : B.deepslate, W.deepslate);
    }
    const open = Math.abs(y - c.hellMid) < c.hellHalf + 9 * fbm2(x / 30, y / 18, S + 71, 2);
    if (open) return y > 678 ? pack(B.air, 0, LAVA_FULL) : 0;
    if (y > 615 && noise2(x / 4, y / 4, S + 72) > 0.58) return pack(B.hellstone_ore, W.ash);
    if (noise2(x / 12, y / 12, S + 73) > 0.62) return pack(B.obsidian, W.ash);
    return pack(B.ash, W.ash);
  }

  // 矿脉:6×6 网格,每格一定概率生成一团矿;种类由该深度的权重表抽取
  oreAt(x, y) {
    const S = this.S, gx = Math.floor(x / 6), gy = Math.floor(y / 6);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx, cy = gy + dy, h = hash2(cx, cy, S + 90);
      if ((h & 1023) > 330) continue;
      const depth = cy * 6 + 3;
      const kind = pickOre(depth, (h >>> 10) & 1023);
      if (!kind) continue;
      const ox = cx * 6 + 1 + ((h >>> 20) & 3) + 0.5, oy = cy * 6 + 1 + ((h >>> 22) & 3) + 0.5;
      const r = 0.85 + ((h >>> 24) & 7) / 7 * (kind === B.diamond_ore ? 0.5 : 1.0);
      const ddx = x + 0.5 - ox, ddy = y + 0.5 - oy;
      if (ddx * ddx + ddy * ddy < r * r * (0.75 + (hash2(x, y, S + 91) & 255) / 512)) return kind;
    }
    return 0;
  }

  aquifer(x, y) {
    if (y < 35) return 0;
    const ax = Math.floor(x / 52), ay = Math.floor(y / 36), h = hash2(ax, ay, this.S + 60);
    if ((h & 3) !== 0) return 0;
    const level = ay * 36 + 12 + ((h >>> 8) % 20);
    if (y < level) return 0;
    if (y > 600) return 0;
    return y > 380 && ((h >>> 4) & 1) ? LAVA_FULL : WATER_FULL;
  }

  fgAt(x, y) { return this.base(x, y, this.column(x)) & 255; }

  // ——————————————————— 区块生成
  genChunk(cx, cy) {
    const S = this.S, x0 = cx * CS, y0 = cy * CS;
    const fg = new Uint8Array(CA), wall = new Uint8Array(CA), fluid = new Uint8Array(CA), meta = new Uint8Array(CA);
    const out = { fg, wall, fluid, meta, te: new Map(), spawns: [] };
    if (y0 >= BEDROCK_Y + 4) { fg.fill(B.bedrock); return out; }
    if (y0 + CS < ISLAND_Y - 60) return out; // 高空:纯空气

    // 基础地形(含 1 格外圈,供装饰判断邻居)
    const G = 34, grid = new Int32Array(G * G);
    for (let gx = 0; gx < G; gx++) {
      const x = x0 + gx - 1, col = this.column(x);
      for (let gy = 0; gy < G; gy++) grid[gy * G + gx] = this.base(x, y0 + gy - 1, col);
    }
    const g = (lx, ly) => grid[(ly + 1) * G + lx + 1];
    for (let ly = 0; ly < CS; ly++) for (let lx = 0; lx < CS; lx++) {
      const v = g(lx, ly), i = ly * CS + lx;
      fg[i] = v & 255; wall[i] = (v >> 8) & 255; fluid[i] = (v >> 16) & 255;
    }
    const inC = (x, y) => x >= x0 && x < x0 + CS && y >= y0 && y < y0 + CS;
    const idx = (x, y) => (y - y0) * CS + (x - x0);
    const put = (x, y, id, m = 0, force = false) => {
      if (!inC(x, y)) return;
      const i = idx(x, y);
      if (!force && fg[i] !== B.air) return;
      if (!force && fluid[i] && !(id === B.vine)) return;
      fg[i] = id; meta[i] = m;
    };

    // 地下装饰:发光蘑菇洞、普通蘑菇、地狱荧石
    for (let ly = 0; ly < CS; ly++) for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, y = y0 + ly, i = ly * CS + lx;
      const v = g(lx, ly), f = v & 255, above = g(lx, ly - 1), below = g(lx, ly + 1);
      if (y > 70 && y < 470 && (f === B.stone || f === B.deepslate) && (above & 255) === 0 && !(above >> 16)) {
        if (fbm2(x / 150, y / 100, S + 50, 2) > 0.42) fg[i] = B.mushroom_grass;
      }
      if (f === 0 && !(v >> 16) && y > 20) {
        const bf = below & 255;
        if ((bf === B.stone || bf === B.deepslate) && y > 70 && y < 470 && fbm2(x / 150, (y + 1) / 100, S + 50, 2) > 0.42) {
          if (hash2(x, y, S + 51) % 100 < 28) { fg[i] = B.glow_mushroom; }
        } else if ((bf === B.stone || bf === B.dirt) && hash2(x, y, S + 52) % 100 < 2) { fg[i] = B.mushroom; meta[i] = hash2(x, y, S) & 1; }
        if (y > HELL_Y && (above & 255) === B.ash && hash2(x, y, S + 53) % 100 < 7) fg[i] = B.glowstone;
      }
    }

    // 地表:树木与植被(遍历本区块及左右余量的列)
    for (let x = x0 - 7; x < x0 + CS + 7; x++) {
      const c = this.column(x), s = c.s;
      if (s - 26 > y0 + CS || s < y0 - 1) continue;
      if (c.camp && Math.abs(x - c.camp.cx) <= 12) continue;
      if (s < SEA || c.biome === BIOME.OCEAN) {
        const topId = this.base(x, s, c) & 255, airAbove = (this.base(x, s - 1, c) & 0xff00ff) === 0;
        if (airAbove && (topId === c.top)) this.surfaceFeatures(x, c, put);
      }
    }
    // 阵营营地
    const seenCamp = new Set();
    for (let x = x0 - 14; x < x0 + CS + 14; x++) {
      const cp = this.column(x).camp;
      if (!cp || seenCamp.has(cp.cx)) continue;
      seenCamp.add(cp.cx);
      if (cp.s0 - 12 > y0 + CS || cp.s0 + 2 < y0) continue;
      this.buildCamp(cp, put, out, inC, idx, fg, wall, fluid);
    }
    // 浮空岛
    for (let x = x0 - 12; x < x0 + CS + 12; x++) {
      const c = this.column(x);
      if (!c.isl || x !== c.isl.cx) continue;
      if (c.isl.top - 12 > y0 + CS || c.isl.top < y0 - 2) continue;
      this.islandHouse(x, c, put, out, inC, idx, fg, wall);
    }
    // 地下小屋
    this.cabins(x0, y0, put, out, inC, idx, fg, wall, fluid);

    // 地表动物
    let surfaceHere = false;
    const sc = this.column(x0 + 16);
    if (sc.s >= y0 && sc.s < y0 + CS) surfaceHere = true;
    if (surfaceHere && sc.biome !== BIOME.OCEAN && sc.biome !== BIOME.DESERT && hash2(cx, 991, S) % 100 < 38) {
      const kinds = sc.biome === BIOME.TAIGA ? ['sheep', 'sheep', 'cow'] : ['pig', 'cow', 'sheep', 'chicken'];
      const kind = kinds[hash2(cx, 992, S) % kinds.length];
      const n = 2 + (hash2(cx, 993, S) % 2);
      for (let k = 0; k < n; k++) {
        const x = x0 + 4 + ((hash2(cx, 994 + k, S) % 24));
        out.spawns.push({ kind, x: x + 0.5, y: this.column(x).s - 0.05 });
      }
    }
    return out;
  }

  surfaceFeatures(x, c, put) {
    const S = this.S, s = c.s, b = c.biome;
    const tree = this.treeAt(x, c);
    if (tree >= 0) {
      const rnd = mulberry32(hash2(x, 4242, S));
      treeShape(tree, x, s - 1, rnd, (tx, ty, id, m) => put(tx, ty, id, m || 0));
      return;
    }
    const h = hash2(x, 17, S) % 1000;
    if (c.top === B.grass) {
      if (b === BIOME.PLAINS || b === BIOME.FOREST || b === BIOME.MOUNTAINS || b === BIOME.BEACH) {
        if (h < 420) put(x, s - 1, B.tall_grass, 0);
        else if (h < 500) put(x, s - 1, B.flower, hash2(x, 18, S) % 3);
        else if (h < 512 && b === BIOME.FOREST) put(x, s - 1, B.mushroom, hash2(x, 19, S) & 1);
        else if (h < 528 && b !== BIOME.BEACH) put(x, s - 1, B.berry_bush, 3);
      }
    } else if (c.top === B.jungle_grass) {
      if (h < 600) put(x, s - 1, B.tall_grass, 0);
      else if (h < 640) put(x, s - 1, B.flower, 2);
    } else if (c.top === B.snow_grass) {
      if (h < 650) put(x, s - 1, B.snow_layer, 0);
      else if (h < 690) put(x, s - 1, B.berry_bush, 3);
    } else if (c.top === B.sand && b === BIOME.DESERT) {
      if (h < 45) put(x, s - 1, B.dead_bush, 0);
    } else if (c.top === B.snow) {
      if (h < 700) put(x, s - 1, B.snow_layer, 0);
    }
  }

  // 返回树种(-1 无)。按格子抖动分布,保证相邻两列不会同时长树。
  treeAt(x, c) {
    const b = c.biome;
    let cell = 5, dens = 0, species = 0;
    const S = this.S;
    switch (b) {
      case BIOME.FOREST: cell = 4; dens = 0.78; species = hash2(x, 21, S) % 10 < 3 ? 1 : 0; break;
      case BIOME.PLAINS: cell = 7; dens = 0.18; break;
      case BIOME.TAIGA: cell = 4; dens = 0.62; species = 2; break;
      case BIOME.JUNGLE: cell = 4; dens = 0.85; species = 3; break;
      case BIOME.BEACH: cell = 9; dens = 0.3; species = 4; break;
      case BIOME.MOUNTAINS: cell = 5; dens = c.top === B.grass ? 0.45 : 0; species = c.s < -30 ? 2 : 0; break;
      case BIOME.DESERT: cell = 9; dens = 0.45; species = 5; break;
      default: return -1;
    }
    if (c.top !== B.grass && c.top !== B.snow_grass && c.top !== B.jungle_grass && !(b === BIOME.DESERT && c.top === B.sand) && !(b === BIOME.BEACH && c.top === B.sand)) return -1;
    const ci = Math.floor(x / cell), h = hash2(ci, 23, S);
    if ((h % 1000) / 1000 >= dens) return -1;
    const px = ci * cell + 1 + ((h >>> 10) % (cell - 2));
    return px === x ? species : -1;
  }

  islandHouse(x, c, put, out, inC, idx, fg, wall) {
    const S = this.S, isl = c.isl, top = isl.top, rnd = mulberry32(hash2(isl.cell, 501, S));
    // 小木屋:7 宽 5 高
    const hx = x - 3, floorY = top - 1;
    for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) {
      const tx = hx + i, ty = floorY - j;
      const edge = i === 0 || i === 6 || j === 4;
      if (!inC(tx, ty)) continue;
      const k = idx(tx, ty);
      if (edge) { if (!(i === 0 && j <= 2)) { fg[k] = B.planks; } else fg[k] = B.air; }
      else fg[k] = B.air;
      wall[k] = W.planks;
    }
    put(hx, floorY, B.door, 4, true); put(hx, floorY - 1, B.door, 12, true); put(hx, floorY - 2, B.door, 5, true);
    put(hx + 4, floorY, B.chest, 0, true);
    put(hx + 2, floorY - 3, B.torch, 0, true);
    if (inC(hx + 4, floorY)) out.te.set(idx(hx + 4, floorY), { type: 'chest', items: loot('island', rnd) });
    // 岛上一棵树
    const tx = x + 7 + ((hash2(isl.cell, 502, S) % 3));
    const tc = this.column(tx);
    if (tc.isl) treeShape(0, tx, tc.isl.top - 1, mulberry32(hash2(isl.cell, 503, S)), (a, b2, id, m) => put(a, b2, id, m || 0));
  }

  cabins(x0, y0, put, out, inC, idx, fg, wall, fluid) {
    const S = this.S, CW = 150, CH = 110;
    for (let gx = Math.floor((x0 - 20) / CW); gx <= Math.floor((x0 + CS + 20) / CW); gx++) {
      for (let gy = Math.floor((y0 - 12) / CH); gy <= Math.floor((y0 + CS + 12) / CH); gy++) {
        const h = hash2(gx, gy, S + 500);
        if (h % 100 >= 45) continue;
        const bx = gx * CW + 10 + ((h >>> 7) % (CW - 30)), by = gy * CH + 10 + ((h >>> 15) % (CH - 25));
        const col = this.column(bx);
        if (by < col.s + 40 || by > HELL_Y - 30) continue;
        const w = 9 + ((h >>> 3) % 5), hgt = 6, deep = by > DEEP_Y;
        const mat = deep ? B.stone_bricks : B.planks, wmat = deep ? W.stone_brick : W.planks;
        if (by + hgt < y0 || by - 1 > y0 + CS || bx + w < x0 || bx - 1 > x0 + CS) continue;
        const rnd = mulberry32(h);
        for (let i = 0; i < w; i++) for (let j = 0; j < hgt; j++) {
          const tx = bx + i, ty = by + j;
          if (!inC(tx, ty)) continue;
          const k = idx(tx, ty), edge = i === 0 || i === w - 1 || j === 0 || j === hgt - 1;
          fluid[k] = 0;
          if (edge) fg[k] = (i === 0 || i === w - 1) && j >= hgt - 4 && j < hgt - 1 ? B.air : mat;
          else fg[k] = B.air;
          wall[k] = wmat;
        }
        const chestX = bx + 2 + ((h >>> 20) % (w - 4)), floor = by + hgt - 2;
        put(chestX, floor, B.chest, 0, true);
        if (inC(chestX, floor)) out.te.set(idx(chestX, floor), { type: 'chest', items: loot(deep ? 'deep' : 'cabin', rnd) });
        put(bx + (w >> 1), by + 1, B.lantern, 0, true);
        if ((h >>> 25) & 1) put(chestX === bx + 2 ? bx + w - 3 : bx + 2, floor, (h >>> 26) & 1 ? B.furnace : B.crafting_table, 0, true);
      }
    }
  }

  // 营地建筑:联盟为石砖房,部落为尖顶硬木屋;屋内插阵营旗帜(营地数据挂在旗帜的方块实体上)
  buildCamp(cp, put, out, inC, idx, fg, wall, fluid) {
    const { cx, s0, faction } = cp, A = faction === 'alliance';
    const mat = A ? B.alliance_bricks : B.horde_wood, wmat = A ? W.stone_brick : W.planks, floor = A ? B.stone_bricks : B.planks;
    const set = (x, y, id, m = 0, w = -1) => {
      if (!inC(x, y)) return;
      const k = idx(x, y);
      fg[k] = id; meta(k, m); fluid[k] = 0;
      if (w >= 0) wall[k] = w;
    };
    const meta = (k, m) => { out.meta[k] = m; };
    // 地基与清场
    for (let x = cx - 9; x <= cx + 9; x++) {
      set(x, s0, x >= cx - 6 && x <= cx + 6 ? floor : this.column(x).top);
      for (let y = s0 - 11; y < s0; y++) set(x, y, B.air, 0, 0);
    }
    // 房屋 13×7
    for (let x = cx - 6; x <= cx + 6; x++) for (let y = s0 - 7; y <= s0 - 1; y++) {
      const edge = x === cx - 6 || x === cx + 6 || y === s0 - 7;
      set(x, y, edge ? mat : B.air, 0, wmat);
    }
    if (!A) { for (let x = cx - 4; x <= cx + 4; x++) set(x, s0 - 8, mat); for (let x = cx - 2; x <= cx + 2; x++) set(x, s0 - 9, mat); set(cx, s0 - 10, B.horde_wood); }
    else { for (const x of [cx - 6, cx - 4, cx - 2, cx, cx + 2, cx + 4, cx + 6]) set(x, s0 - 8, mat); }
    // 两侧门
    set(cx - 6, s0 - 1, B.door, 4); set(cx - 6, s0 - 2, B.door, 12); set(cx - 6, s0 - 3, B.door, 5);
    set(cx + 6, s0 - 1, B.door, 0); set(cx + 6, s0 - 2, B.door, 8); set(cx + 6, s0 - 3, B.door, 1);
    // 旗帜(营地核心)、火盆、提灯
    const banner = A ? B.alliance_banner : B.horde_banner;
    set(cx, s0 - 1, banner);
    if (inC(cx, s0 - 1)) out.te.set(idx(cx, s0 - 1), { type: 'camp', faction, start: !!cp.start, roster: 'camp' });
    set(cx - 3, s0 - 1, B.brazier); set(cx + 3, s0 - 1, B.brazier);
    set(cx, s0 - 5, B.lantern);
    set(cx + 4, s0 - 1, B.chest);
    if (inC(cx + 4, s0 - 1)) out.te.set(idx(cx + 4, s0 - 1), { type: 'chest', items: loot(cp.start ? 'start' : 'camp', mulberry32(cx * 31 + 7)) });
    set(cx - 4, s0 - 1, B.crafting_table);
    // 屋外:联盟灯柱 / 部落尖木桩
    for (const sx of [-1, 1]) {
      const px = cx + sx * 9;
      if (A) { set(px, s0 - 1, B.stone_bricks); set(px, s0 - 2, B.stone_bricks); set(px, s0 - 3, B.lantern); }
      else { set(px, s0 - 1, B.horde_wood); set(px, s0 - 2, B.horde_wood); set(px, s0 - 3, B.horde_wood); set(cx + sx * 11, s0 - 1, B.horde_wood); set(cx + sx * 11, s0 - 2, B.horde_wood); set(cx + sx * 8, s0 - 1, B.brazier); }
    }
  }

  // 出生点:按种族偏好的群系寻找;天裔出生在浮空岛上
  findSpawnFor(pref) {
    if (pref === 'island') {
      for (let r = 0; r < 12; r++) for (const cell of [r, -r - 1]) {
        for (let x = cell * 420; x < cell * 420 + 420; x += 2) {
          const c = this.raw(x), isl = this.island(x);
          if (isl && isl.cx === x) {
            const below = this.raw(x);
            if (below.biome === BIOME.OCEAN || below.s >= -1) break;
            return { x: x - 7.5, y: this.column(x - 8).isl ? this.column(x - 8).isl.top : isl.top, island: true, groundX: x };
          }
        }
      }
      return this.findSpawn();
    }
    if (Array.isArray(pref)) {
      for (let r = 0; r < 9000; r += 5) for (const x of [r, -r]) {
        const c = this.raw(x);
        if (!pref.includes(c.biome) || c.s >= -1) continue;
        const c2 = this.raw(x + 16);
        if (c2.biome === BIOME.OCEAN || c2.biome === BIOME.BEACH || c2.s >= -1) continue;
        if (Math.abs(this.raw(x + 3).s - c.s) > 2) continue;
        return { x: x + 0.5, y: c.s };
      }
    }
    return this.findSpawn();
  }

  findSpawn() {
    for (let r = 0; r < 4000; r += 3) for (const x of [r, -r]) {
      const c = this.column(x);
      if (c.biome === BIOME.OCEAN || c.biome === BIOME.BEACH || c.s >= -1) continue;
      if (this.treeAt(x, c) >= 0 || this.treeAt(x - 1, c) >= 0 || this.treeAt(x + 1, c) >= 0) continue;
      return { x: x + 0.5, y: c.s };
    }
    return { x: 0.5, y: this.column(0).s };
  }
}

// 各矿种的深度权重
const ORE_TABLE = [
  [B.coal_ore, -110, 260, 6], [B.copper_ore, -40, 330, 4.5], [B.iron_ore, 20, 540, 4],
  [B.gold_ore, 150, 660, 2.4], [B.diamond_ore, 380, 700, 1.4],
];
function pickOre(depth, r1024) {
  let tot = 0;
  const ws = ORE_TABLE.map(([id, a, b, w]) => { const k = depth < a || depth > b ? 0 : w * Math.min(1, (depth - a) / 40, (b - depth) / 40 + 0.3); tot += k; return k; });
  if (tot <= 0) return 0;
  let r = r1024 / 1024 * tot;
  for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return ORE_TABLE[i][0]; }
  return 0;
}

// ———————————————————— 树形(世界生成与树苗生长共用)
export function treeShape(sp, x, base, rnd, put) {
  if (sp === 5) { // 仙人掌
    const h = 2 + (rnd() * 3 | 0);
    for (let i = 0; i < h; i++) put(x, base - i, B.cactus);
    return;
  }
  const T = TRUNKS[sp], L = LEAVES[sp];
  if (sp === 0) {
    const h = 5 + (rnd() * 4 | 0);
    for (let i = 0; i < h; i++) put(x, base - i, T);
    const cy = base - h, r = 2.4 + rnd() * 0.9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy * 1.15);
      if (d < r + (rnd() - 0.5) * 0.6) put(x + dx, cy + dy, L);
    }
    for (let i = 0; i < 3; i++) put(x, cy + i, T); // 树干穿入树冠
    if (h > 6 && rnd() < 0.6) { const side = rnd() < 0.5 ? -1 : 1, by = base - 3 - (rnd() * 2 | 0); put(x + side, by, L); }
  } else if (sp === 1) {
    const h = 6 + (rnd() * 4 | 0);
    for (let i = 0; i < h; i++) put(x, base - i, T);
    const cy = base - h;
    for (let dy = -3; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) === 2 && (dy <= -3 || dy >= 2)) continue;
      if (Math.abs(dx) === 2 && rnd() < 0.3) continue;
      put(x + dx, cy + dy, L);
    }
    put(x, cy - 4, L);
    for (let i = 0; i < 2; i++) put(x, cy + i, T);
  } else if (sp === 2) {
    const h = 7 + (rnd() * 6 | 0);
    for (let i = 0; i < h; i++) put(x, base - i, T);
    const top = base - h - 1;
    put(x, top, L); put(x, top + 1, L);
    let w = 1;
    for (let y = top + 2; y <= base - 3; y++) {
      const ww = ((y - top) % 3 === 0) ? Math.max(1, w - 1) : w;
      for (let dx = -ww; dx <= ww; dx++) if (dx) put(x + dx, y, L);
      if ((y - top) % 3 === 2 && w < 3) w++;
    }
  } else if (sp === 3) {
    const h = 10 + (rnd() * 7 | 0);
    for (let i = 0; i < h; i++) put(x, base - i, T);
    const cy = base - h;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (Math.hypot(dx / 1.6, dy) < 2.4 + (rnd() - 0.5) * 0.5) put(x + dx, cy + dy, L);
    }
    put(x, cy, T); put(x, cy + 1, T);
    for (const dx of [-4, -3, 3, 4]) if (rnd() < 0.7) { const len = 1 + (rnd() * 4 | 0); for (let k = 1; k <= len; k++) put(x + dx, cy + 1 + k, B.vine); }
    if (rnd() < 0.7) { const side = rnd() < 0.5 ? -1 : 1, by = base - 4 - (rnd() * 3 | 0); put(x + side, by, L); put(x + side * 2, by, L); put(x + side, by - 1, L); }
  } else if (sp === 4) {
    const h = 5 + (rnd() * 4 | 0), lean = rnd() < 0.5 ? -1 : 1;
    let tx = x;
    for (let i = 0; i < h; i++) { if (i === h - 2) tx += lean; put(tx, base - i, T); }
    const cy = base - h;
    put(tx, cy, L);
    for (const d of [-1, 1]) {
      put(tx + d, cy, L); put(tx + d * 2, cy, L); put(tx + d * 3, cy + 1, L); put(tx + d * 4, cy + 2, L);
      put(tx + d, cy - 1, L);
    }
  }
}

// ———————————————————— 宝箱战利品
export function loot(kind, rnd) {
  const items = new Array(27).fill(null);
  const add = (key, n, p = 1) => {
    if (rnd() > p) return;
    let slot = rnd() * 27 | 0;
    for (let k = 0; k < 27 && items[slot]; k++) slot = (slot + 1) % 27;
    if (!items[slot]) items[slot] = { id: key, n };
  };
  const ri = (a, b) => a + (rnd() * (b - a + 1) | 0);
  if (kind === 'start') {
    add('bread', ri(3, 5)); add('torch', ri(10, 16)); add('apple', ri(2, 4)); add('copper_ingot', ri(2, 4), 0.8); add('bed', 1, 1);
    return items;
  }
  if (kind === 'camp') {
    add('bread', ri(1, 4), 0.6); add('torch', ri(4, 12), 0.7); add('iron_ingot', ri(1, 4), 0.5); add('gold_ingot', ri(1, 3), 0.25);
    add('coin_silver', ri(1, 5), 0.7); add('linen_cloth', ri(1, 4), 0.4); add('wool_cloth', ri(1, 4), 0.4); add('almanac', 1, 0.06); add('copper_watch', 1, 0.08);
    return items;
  }
  if (kind === 'island') {
    add('gold_watch', 1, 0.35); add('almanac', 1, 0.35); add('barometer', 1, 0.3);
    add('diamond', ri(1, 3), 0.35); add('golden_apple', 1, 0.25); add('gold_ingot', ri(2, 6), 0.6);
    add('glowstone', ri(4, 10), 0.4); add('cloud', ri(10, 30), 0.5); add('lantern', ri(1, 3), 0.5); add('bread', ri(2, 5), 0.6);
    add('sapling_birch', ri(1, 3), 0.5);
  } else {
    const deep = kind === 'deep';
    add('torch', ri(6, 18), 0.85); add('bread', ri(1, 4), 0.5); add('apple', ri(1, 3), 0.4);
    add('copper_ingot', ri(2, 6), 0.45); add('iron_ingot', ri(1, deep ? 7 : 4), 0.4); add('gold_ingot', ri(1, 4), deep ? 0.4 : 0.15);
    add('diamond', ri(1, 2), deep ? 0.18 : 0.05); add('arrow', ri(5, 15), 0.35); add('string', ri(1, 4), 0.3); add('bone', ri(1, 5), 0.35);
    add('bucket', 1, 0.15); add('copper_watch', 1, 0.14); add('almanac', 1, 0.08); add('barometer', 1, 0.08);
    add(deep ? 'iron_pickaxe' : 'copper_pickaxe', 1, 0.14); add('bow', 1, 0.1); add('golden_apple', 1, deep ? 0.08 : 0.03);
    add('seeds', ri(2, 6), 0.25); add('rotten_flesh', ri(1, 4), 0.3); add('gunpowder', ri(1, 3), 0.2);
  }
  return items;
}
