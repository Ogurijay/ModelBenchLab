// 游戏主控:固定步长更新、世界刻(时间/天气/随机刻/流体/刷怪)、睡眠延时、爆炸、死亡与重生、指令、存档。
import { TS, CS, CSH, ckey, SEA, HELL_Y, DAY_TICKS, SEASON_NAMES } from './const.js';
import { BLOCKS, B, W } from './blocks.js';
import { ITEMS, ITEM_LIST, itemName } from './items.js';
import { WorldGen, BIOME, BIOME_NAMES } from './worldgen.js';
import { World } from './world.js';
import { Clock, WEATHER_NAMES } from './time.js';
import { Lighting } from './light.js';
import { FX } from './fx.js';
import { WorldMap } from './map.js';
import { Player } from './player.js';
import { Mob, MOBS } from './mobs.js';
import { ItemEntity, Arrow, FallingBlock, PrimedTNT } from './entities.js';
import { input, hit, key } from './input.js';
import { play, updateAmbient } from './audio.js';
import { putWorld } from './storage.js';
import { seedFromString, hash2 } from './rng.js';
import { tkey } from './const.js';
import { RPG, Pet, Totem, SpellBolt, GroundEffect } from './rpg.js';
import { Npc } from './npc.js';
import { QuestLog } from './quests.js';
import { NPC_TYPES, RACES, FACTIONS, CLASSES, CAMP_ROSTER, OUTPOST_ROSTER, PATROL, SKILL_KEYS, mobXp, zoneName } from './wow.js';
import { Inventory } from './inventory.js';

export class Game {
  constructor({ meta, store, renderer, ui, demo = false }) {
    this.meta = meta; this.store = store; this.renderer = renderer; this.ui = ui; this.demo = demo;
    this.gen = new WorldGen(meta.seed);
    this.clock = new Clock(meta.clock || { dayMinutes: meta.dayMinutes, seasonDays: meta.seasonDays });
    this.difficulty = meta.difficulty ?? 2;
    this.entities = []; this._mobs = [];
    this.fx = new FX(this);
    const g = this;
    this.world = new World(this.gen, this.clock, store, {
      spawnAnimals: list => { for (const s of list) g.addMob(s.kind, s.x, s.y); },
      restoreEnts: list => { for (const e of list) g.restoreEnt(e); },
      collectEnts: c => g.collectEnts(c),
      drop: (x, y, k, n) => g.dropItem(x, y, k, n),
      broke: (x, y, id) => { g.fx.blockBreak(x, y, id); g.sfx('break', x + 0.5, y + 0.5, id); },
      fall: (x, y, id) => g.entities.push(new FallingBlock(g, x, y, id)),
      felled: list => {
        let n = 0;
        for (const [x, y, id] of list) if (BLOCKS[id].render === 'leaves' && n++ < 40) g.fx.blockBreak(x, y, id);
        g.sfx('break', list[0][0], list[0][1], B.trunk_oak);
      },
      steam: (x, y) => g.fx.steam(x, y),
      fizz: (x, y) => { g.fx.steam(x, y); g.sfx('fizz', x, y); },
      chunkLoaded: c => {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.world.markR(c.cx + dx, c.cy + dy);
        g.map.markExplored(c);
        for (const [i, o] of c.te) if (o.type === 'camp') { const x = c.cx * CS + (i & 31), y = c.cy * CS + (i >> 5); g.camps.set(tkey(x, y), { x, y }); }
      },
      chunkUnloaded: c => {
        g.renderer.dropChunk(c.key);
        for (const [k, cp] of g.camps) {
          if ((cp.x >> CSH) !== c.cx || (cp.y >> CSH) !== c.cy) continue;
          g.camps.delete(k);
          for (const e of g.entities) if (e.campKey === k) { e.dead = true; e.despawned = true; }
        }
      },
      changed: (x, y, old, id, oldTe) => { if ((old === B.alliance_banner || old === B.horde_banner) && old !== id) g.onBannerGone(x, y, old, oldTe); },
      caughtUp: (c, E, n) => g.onCaughtUp(E, n),
      grew: (x, y) => { g.fx.sparkle(x + 0.5, y, [140, 255, 140]); },
    });
    this.light = new Lighting(this.world);
    this.map = new WorldMap(this); this.map.load(meta.explored);
    this.camps = new Map();
    // —— 种族决定出生地:按种族偏好群系寻找;天裔出生在浮空岛。出生点旁固定一座己方营地与一座宿敌营地。
    const race = meta.rpg?.race || meta.race || 'human';
    if (!meta.camps) {
      let groundX;
      if (!meta.spawn) {
        const sp0 = this.gen.findSpawnFor(RACES[race].home);
        meta.spawn = { x: sp0.x, y: sp0.y };
        meta.islandSpawn = !!sp0.island;
        groundX = sp0.island ? sp0.groundX : sp0.x + 16;
      } else groundX = meta.spawn.x + 16;
      const fac = RACES[race].faction, enemy = FACTIONS[fac].enemy;
      const startX = this.gen.findCampSite(groundX, 1);
      const dir = (meta.seed & 1) ? 1 : -1;
      meta.camps = [{ x: startX, faction: fac }, { x: this.gen.findCampSite(startX + dir * 240, dir), faction: enemy }];
    }
    this.gen.setFixedCamps(meta.camps.map(c => ({ x: c.x, faction: c.faction })));
    const sp = meta.spawn;
    this.player = new Player(this, sp.x, sp.y);
    this.player.rpg = new RPG(this.player, meta.rpg || { race, cls: meta.cls || RACES[race].classes[0], name: meta.charName, surname: meta.surname, hardcore: meta.ruleset === 'hardcore' });
    this.quests = new QuestLog(this, meta.quests);
    if (meta.player) this.player.load(meta.player);
    else {
      const p = this.player, rpg = p.rpg;
      p.spawn = { ...sp };
      p.creative = meta.mode === 'creative';
      p.look = meta.look || p.look;
      if (!p.creative) {
        for (const k of ['wood_pickaxe', 'wood_axe']) p.inv.add(k, 1);
        const cls = rpg.cls;
        const wpn = cls === 'hunter' ? 'bow' : ['mage', 'priest', 'warlock', 'druid'].includes(cls) ? 'apprentice_staff' : 'wood_sword';
        p.inv.weapon = Inventory.make(wpn, 1);
        if (wpn === 'wood_sword') p.inv.add('wood_sword', 1);
        if (cls === 'hunter') p.inv.add('arrow', 24);
        p.inv.add('bread', 3);
      }
      p.maxHp = rpg.maxHp(); p.hp = p.maxHp;
      rpg.res.mana = rpg.maxRes('mana');
    }
    this.player.maxHp = this.player.rpg.maxHp();
    this.lastDeath = meta.lastDeath || null;
    this.tickAcc = 0; this.ticks = 0; this.frame = 0; this.saveT = 0; this.realT = 0;
    this.sleep = null; this.sleepFade = 0; this.paused = false; this.catchMsgT = -100; this.nightWarned = false;
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    this.renderer.game = this;
    this.renderer.resetCache();
    this.ui.attach?.(this);
    this.renderer.cx = this.player.x * TS; this.renderer.cy = (this.player.y - 1.4) * TS;
    this.renderer.updateCamera(0, true);
    this.ensureLoaded();
  }

  ensureLoaded() {
    const v = this.renderer.viewTiles();
    this.world.manage(v.x0 - 6, v.y0 - 6, v.x1 + 6, v.y1 + 6, 50);
    // 出生/读档时玩家可能嵌在方块里:向上找空位
    const p = this.player;
    for (let k = 0; k < 60 && p.overlapsSolid(); k++) p.y -= 1;
  }

  mobs() { return this._mobs; }
  mouseWorld() { return this.renderer.screenToWorld(input.mx, input.my); }
  msg(t, c) { this.ui.msg(t, c); }
  sfx(name, x, y, idOrKind) {
    const p = this.player;
    const dist = x === undefined ? undefined : Math.hypot(x - p.x, y - p.y);
    play(name, { dist, id: typeof idOrKind === 'number' ? idOrKind : undefined, kind: typeof idOrKind === 'string' ? idOrKind : undefined });
  }

  // ———————————————————————— 实体工具
  addMob(kind, x, y, level) {
    const lv = level ?? (MOBS[kind]?.hostile ? this.zoneLevel(x, y) + Math.floor(Math.random() * 3) - 1 : Math.max(1, this.zoneLevel(x, y) - 2));
    const m = new Mob(this, kind, x, y, lv);
    if (this.clock.blood && m.hostile) m.blood = true;
    this.entities.push(m); return m;
  }
  addNpc(typeId, x, y, level, o) { const n = new Npc(this, typeId, x, y, level, o); this.entities.push(n); return n; }

  // ———————————————————————— 阵营、立场与目标
  faction() { return this.player.rpg?.faction || 'alliance'; }
  alliesOfPlayer() { return [this.player, ...this._mobs.filter(m => m.side === 'A' && !m.dead)]; }
  enemiesOf(o) {
    const side = o.side || 'B';
    if (side === 'A') { const isPlayer = o.type === 'player' || o.owner?.type === 'player' && o.type !== 'mob'; return this._mobs.filter(m => !m.dead && (m.side === 'B' || (m.side === 'N' && (o.type === 'player' || isPlayer)))); }
    return this.alliesOfPlayer().filter(e => !e.dead && !(e.type === 'player' && (e.creative || e.dead)));
  }
  hostilesNear(x, y, r) { return this._mobs.filter(m => !m.dead && m.side === 'B' && Math.hypot(m.x - x, m.cy - y) < r + m.w / 2); }
  enemiesNear(o, x, y, r) { return this.enemiesOf(o).filter(m => Math.hypot(m.x - x, m.cy - y) < r + m.w / 2); }
  addMoney(c) { this.player.rpg.money += c; }

  // 区域等级:离出生点越远、越深,等级越高(1–60)
  zoneLevel(x, y) {
    const sp = this.meta.spawn, col = this.gen.column(Math.floor(x));
    let l = 1 + Math.floor(Math.abs(x - sp.x) / 140) + Math.floor(Math.max(0, y - col.s - 12) / 45);
    if (y > HELL_Y) l += 6;
    return Math.max(1, Math.min(60, l));
  }
  zoneInfo(x, y) {
    const sp = this.meta.spawn, col = this.gen.column(Math.floor(x));
    const lv = this.zoneLevel(x, y);
    let name;
    if (Math.abs(x - sp.x) < 200 && y < col.s + 20) name = RACES[this.player.rpg.race].zone;
    else name = zoneName(col.biome, Math.floor(x / 260), this.meta.seed);
    return { name, level: lv };
  }

  // 击杀:经验、任务进度
  onKill(m, src) {
    const killer = src?.type === 'player' ? src : src?.owner?.type === 'player' ? src.owner : null;
    if (!killer || killer !== this.player) return;
    const p = this.player, rpg = p.rpg;
    p.stats.kills++;
    const base = m.npc ? (m.role === 'elite' ? 3 : 1.4) : m.side === 'N' ? 0.25 : m.pet ? 0 : 1;
    const xp = mobXp(m.level, rpg.level, base);
    if (xp > 0) rpg.gainXp(xp);
    this.quests.event({ type: 'kill', mob: m });
    if (this.lastTarget === m) this.lastTarget = null;
  }
  onNpcDeath(n) {
    if (!n.campKey) return;
    const cp = this.camps.get(n.campKey);
    if (!cp) return;
    const te = this.world.getTe(cp.x, cp.y);
    if (!te || te.type !== 'camp') return;
    te.dead = te.dead || {};
    te.dead[n.slot] = this.clock.tick + (n.role === 'quest' || n.role === 'vendor' ? 2000 : 6000);
    this.world.teChanged(cp.x, cp.y);
  }
  // 营地:按名单补齐 NPC(阵亡者在世界时间流逝后复活)
  campTick() {
    for (const [k, cp] of this.camps) {
      if (!this.world.isLoaded(cp.x, cp.y)) { this.camps.delete(k); continue; }
      const te = this.world.getTe(cp.x, cp.y);
      if (!te || te.type !== 'camp') { this.camps.delete(k); continue; }
      if (te.player && !te.valid) continue;
      const roster = te.player ? OUTPOST_ROSTER[te.faction] : CAMP_ROSTER[te.faction];
      const alive = new Set(this.entities.filter(e => e.campKey === k && !e.dead).map(e => e.slot));
      const level = this.zoneLevel(cp.x, cp.y);
      roster.forEach((typeId, i) => {
        if (alive.has(i)) return;
        if ((te.dead?.[i] || 0) > this.clock.tick) return;
        if (Math.hypot(this.player.x - cp.x, this.player.y - cp.y) < 6 && te.faction !== this.faction() && te.seen) return; // 不在敌人眼前凭空刷出
        // 任务官 / 商人在屋内,战斗单位在屋外两侧站岗
        const role = NPC_TYPES[typeId].role, inside = role === 'quest' || role === 'vendor';
        const side = i % 2 ? 1 : -1;
        const off = inside ? side * 1.5 : side * (8 + Math.floor(i / 2) * 2.2);
        let x = cp.x + 0.5 + off, y = cp.y + 1;
        const gy = this.groundBelow(Math.floor(x), cp.y - 6, 16);
        if (gy !== null) y = gy; else x = cp.x + 0.5;
        const n = this.addNpc(typeId, x, y, level, { home: x, campKey: k, slot: i, seed: hash2(cp.x, i, this.meta.seed) });
        if (te.player && te.announced?.[i] !== true) { te.announced = te.announced || {}; te.announced[i] = true; this.msg(`${n.displayName}入住了你的前哨。`, '#9f9'); }
      });
      te.seen = true;
    }
  }
  // 从 y0 向下找第一个可站立的位置(脚下实心、头顶 3 格空)
  groundBelow(x, y0, range) {
    const w = this.world;
    for (let y = y0; y < y0 + range; y++) {
      if (!w.isLoaded(x, y + 1)) return null;
      if ((w.solid(x, y + 1) || w.platform(x, y + 1)) && !w.solid(x, y) && !w.solid(x, y - 1) && !w.solid(x, y - 2)) return y + 1;
    }
    return null;
  }
  onBannerGone(x, y, old, te) {
    if (!te || te.type !== 'camp') return;
    const k = tkey(x, y);
    this.camps.delete(k);
    for (const e of this.entities) if (e.campKey === k) e.campKey = null;
    const fac = te.faction, name = FACTIONS[fac].name;
    if (fac !== this.faction()) {
      this.msg(`你砍倒了${name}的战旗!这座营地不会再有援军。`, '#ffd76a');
      this.quests.event({ type: 'banner', faction: fac });
      if (this.player.rpg) this.player.rpg.gainXp(60 + this.player.rpg.level * 20);
    } else this.msg(te.player ? '你的前哨旗帜被拆除了,入住的 NPC 将会离开。' : `${name}营地的旗帜倒下了。`, '#f99');
  }
  onBannerInteract(x, y) {
    const te = this.world.getTe(x, y), id = this.world.fg(x, y);
    const fac = id === B.alliance_banner ? 'alliance' : 'horde';
    if (te?.type === 'camp') {
      const roster = te.player ? OUTPOST_ROSTER[te.faction] : CAMP_ROSTER[te.faction];
      const alive = this.entities.filter(e => e.campKey === tkey(x, y) && !e.dead).length;
      this.msg(`${FACTIONS[te.faction].name}${te.player ? '前哨' : '营地'}:驻守 ${alive}/${roster.length} 人${te.player && !te.valid ? '(房屋不合格,无人入住)' : ''}。`, '#cfe');
    } else if (fac === this.faction()) this.checkOutpost(x, y, true);
    else this.msg('一面敌方阵营的旗帜。', '#aab');
  }
  // 前哨判定:旗帜所在房间封闭(墙壁/门/屋顶),有背景墙、门和光源,面积 30–700 格
  checkOutpost(bx, by, announce) {
    const w = this.world, seen = new Set(), q = [[bx, by]];
    seen.add(tkey(bx, by));
    let area = 0, walls = 0, door = false, light = false, open = false;
    while (q.length) {
      const [x, y] = q.pop();
      area++;
      if (area > 700) { open = true; break; }
      if (w.wall(x, y)) walls++;
      const id = w.fg(x, y);
      if (BLOCKS[id].light || id === B.furnace) light = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = tkey(nx, ny);
        if (seen.has(k)) continue;
        const nid = w.fg(nx, ny);
        if (nid === B.door) { door = true; continue; }
        if (BLOCKS[nid].solid || BLOCKS[nid].platform) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    let reason = null;
    if (open) reason = '房间不封闭或太大(需要墙体围起来、面积不超过 700 格)';
    else if (area < 30) reason = `房间太小(${area} 格,至少 30 格)`;
    else if (walls < area * 0.9) reason = '房间缺少背景墙';
    else if (!door) reason = '房间需要一扇门';
    else if (!light) reason = '房间需要光源(火把、提灯、火盆……)';
    if (announce) this.msg(reason ? `无法建立前哨:${reason}。` : '房屋合格!', reason ? '#fc8' : '#9f9');
    return !reason;
  }
  onPlace(x, y, id) {
    this.quests.event({ type: 'place' });
    if (id === B.alliance_banner || id === B.horde_banner) {
      const fac = id === B.alliance_banner ? 'alliance' : 'horde';
      if (fac !== this.faction()) return;
      const ok = this.checkOutpost(x, y, true);
      this.world.setTe(x, y, { type: 'camp', faction: fac, player: true, valid: ok, roster: 'outpost' });
      this.camps.set(tkey(x, y), { x, y });
      if (ok) { this.msg(`你建立了一座${FACTIONS[fac].name}前哨!同阵营的卫兵、商人与任务官将会入住。`, '#9f9'); this.quests.event({ type: 'outpost' }); }
    }
  }
  dropItem(x, y, id, n, opts = {}) { if (!ITEMS[id] || n <= 0) return; this.entities.push(new ItemEntity(this, x, y, id, n, opts)); }
  spawnArrow(x, y, vx, vy, owner, dmg) { this.entities.push(new Arrow(this, x, y, vx, vy, owner, dmg)); }
  primeTnt(tx, ty, fuse) { this.entities.push(new PrimedTNT(this, tx, ty, fuse)); }
  onPickup(id, n) { this.fx.pickup(id, n); this.sfx('pop'); }
  restoreEnt(e) {
    if (e.t === 'mob' && MOBS[e.kind] && !MOBS[e.kind].hostile && e.kind !== 'wolf' && e.kind !== 'imp') { const m = this.addMob(e.kind, e.x, e.y, e.level || 1); m.hp = Math.min(m.maxHp, e.hp ?? m.hp); m.sheared = !!e.sheared; }
    else if (e.t === 'item' && ITEMS[e.id]) { const it = new ItemEntity(this, e.x, e.y, e.id, e.n, { vx: 0, vy: 0, pickDelay: 0, dur: e.dur }); it.life = e.life ?? 300; this.entities.push(it); }
  }
  collectEnts(c) {
    const out = [], x0 = c.cx * CS, y0 = c.cy * CS;
    for (const e of this.entities) {
      if (e.dead) continue;
      if (!(e.type === 'item' || (e.type === 'mob' && !e.hostile && !e.npc && !e.pet))) continue;
      if (e.x < x0 || e.x >= x0 + CS || e.y - 0.01 < y0 || e.y - 0.01 >= y0 + CS) continue;
      out.push(e.save()); e.dead = true;
    }
    return out;
  }

  // ———————————————————————— 主循环(60Hz)
  step(dt) {
    if (this.paused) return;
    const p = this.player;
    this.frame++; this.realT += dt;
    this.clock.playSeconds += dt;
    if (!this.demo) this.handleKeys();
    if (!this.demo && !p.dead) p.update(dt);
    this._mobs = this.entities.filter(e => e.type === 'mob' && !e.dead);
    for (const e of this.entities) {
      if (e.dead) continue;
      if (!this.world.isLoaded(Math.floor(e.x), Math.floor(e.y - 0.1))) continue;
      e.update(dt);
    }
    if (this.frame % 30 === 0 || this.entities.some(e => e.dead)) this.entities = this.entities.filter(e => !e.dead);
    this.world.processUpdates();
    this.tickAcc += dt * 20;
    let n = 0;
    while (this.tickAcc >= 1 && n++ < 5) { this.tickAcc -= 1; this.worldTick(); }
    if (this.tickAcc > 5) this.tickAcc = 0;
    if (this.frame % 6 === 0) {
      const v = this.renderer.viewTiles();
      this.world.manage(v.x0 - 6, v.y0 - 6, v.x1 + 6, v.y1 + 6, 2);
    }
    if (!this.demo && this.frame % 60 === 0) this.campTick();
    if (!this.demo && this.frame % 30 === 0 && !p.dead) this.quests.event({ type: 'reach', y: p.y });
    this.lastTargetT = Math.max(0, (this.lastTargetT || 0) - dt);
    if (this.lastTarget?.dead || this.lastTargetT <= 0) this.lastTarget = null;
    this.fx.update(dt);
    if (this.demo) { this.renderer.cx += dt * 60; this.renderer.updateCamera(dt, true); }
    else this.renderer.updateCamera(dt);
    this.ambientFx(dt);
    this.sleepFade += ((this.sleep ? 1 : 0) - this.sleepFade) * Math.min(1, dt * 2.5);
    if (!this.demo) {
      this.saveT += dt;
      if (this.saveT > 15) { this.saveT = 0; this.save(); }
    }
    if (!this.demo) this.ui.update(dt);
    updateAmbient(dt, this.ambientState());
  }

  handleKeys() {
    const ui = this.ui, p = this.player;
    if (ui.capturesKeys()) return;
    if (hit('KeyE') || (ui.panel && hit('Escape'))) { ui.toggleInventory(); input.pressed.delete('Escape'); }
    for (let i = 0; i < 9; i++) if (hit('Digit' + (i + 1))) { if (!(ui.panel && ui.hotkeySwap(i))) { p.inv.sel = i; } }
    if (input.wheel && ui.mouseFree()) { p.inv.sel = ((p.inv.sel + input.wheel) % 9 + 9) % 9; }
    if (hit('KeyQ') && !ui.panel) {
      const s = p.inv.held;
      if (s) {
        const n = key('ControlLeft') ? s.n : 1;
        this.dropItem(p.x + p.facing * 0.6, p.y - 1.6, s.id, n, { vx: p.facing * 7, vy: -4, pickDelay: 1.5, dur: s.dur });
        p.inv.consumeHeld(n);
      }
    }
    if (hit('KeyM')) ui.toggleMap();
    if (!p.dead) SKILL_KEYS.forEach((k, i) => { if (hit(k)) p.rpg.cast(i); });
    if (hit('KeyG') && !p.dead) p.rpg.castRacial();
    if (hit('KeyK')) ui.togglePanel('skills');
    if (hit('KeyL')) ui.togglePanel('quests');
    if (hit('KeyT') || hit('Enter')) ui.openChat();
    if (hit('Slash')) ui.openChat('/');
    if (hit('Tab')) ui.showMinimap = !ui.showMinimap;
    if (hit('F1')) { ui.hudHidden = !ui.hudHidden; ui.showHud(true); }
    if (hit('F3')) ui.showFps = !ui.showFps;
    if (hit('Equal') || hit('NumpadAdd')) this.zoom(1);
    if (hit('Minus') || hit('NumpadSubtract')) this.zoom(-1);
  }
  zoom(d) {
    const r = this.renderer;
    const cur = r.scale;
    const next = Math.max(1, Math.min(4, cur + d * 0.5));
    r.userScale = next; r.resize();
    this.msg(`画面缩放 ×${next}`, '#9cf');
  }

  // ———————————————————————— 世界刻(20Hz)
  worldTick() {
    const c = this.clock;
    let dT = c.rate * c.scale;
    if (this.sleep) dT = this.sleep.rate;
    const ev = c.advance(dT);
    for (const e of ev) this.onClockEvent(e);
    this.world.tickWorld(Math.min(dT, 3), dT);
    this.ticks++;
    if (this.ticks % 2 === 0) this.world.stepFluids();
    if (this.ticks % 10 === 0 && !this.demo) this.spawnTick();
    if (c.weather === 'thunder' && !this.demo && Math.random() < 1 / 260) this.lightning();
    if (this.sleep) {
      this.sleep.skipped += dT;
      if (c.tick >= this.sleep.target) this.wake(true);
    }
  }

  onClockEvent(e) {
    const c = this.clock, p = this.player;
    if (this.demo) return;
    const cold = this.world.temperature(Math.floor(p.x), Math.floor(p.y)) < 0.15;
    switch (e.type) {
      case 'day':
        this.msg(`—— 第 ${e.day + 1} 天 · ${SEASON_NAMES[c.season]} ——`, '#ffe08a');
        break;
      case 'season': {
        const t = [
          '春天来了:万物复苏,作物恢复生长,积雪开始融化。',
          '夏天到了:白昼最长,作物生长最快,雷暴更频繁。',
          '秋天到了:树叶转为金红,白昼逐渐缩短。',
          '冬天来了:昼短夜长、怪物更多;雪覆大地、水面结冰,作物几乎停止生长。',
        ][e.season];
        this.msg('❖ ' + t, '#9fe0ff');
        this.ui.hint(`<b>${SEASON_NAMES[e.season]}</b> · ${t}`, 7);
        this.renderer.invalidateAll();
        play('chime');
        break;
      }
      case 'weather':
        if (e.to === 'rain') this.msg(cold ? '开始下雪了。' : '开始下雨了。', '#9cf');
        else if (e.to === 'thunder') this.msg(cold ? '暴风雪来袭!' : '雷暴来袭!可以在床上入睡跳过。', '#9cf');
        else this.msg(cold ? '雪停了。' : '雨过天晴。', '#9cf');
        break;
      case 'dusk':
        if (e.blood) { this.msg('血月正在升起……今夜怪物将格外凶猛!', '#ff5a4a'); this.ui.hint('<span style="color:#f66">血月正在升起……</span>', 5); play('blood'); }
        else this.msg('夜幕降临,黑暗中有怪物出没。', '#aab');
        break;
      case 'bloodEnd': this.msg('血月消退了。', '#fcc'); break;
      case 'dawn': if (!this.sleep) this.msg('天亮了。', '#ffd'); break;
    }
  }

  onCaughtUp(E, n) {
    if (this.demo || E < DAY_TICKS / 4 || this.realT - this.catchMsgT < 25 || this.sleep) return;
    this.catchMsgT = this.realT;
    const d = Math.floor(E / DAY_TICKS), h = Math.floor((E % DAY_TICKS) / 1000);
    this.msg(`⧗ 你离开期间,这里流逝了 ${d ? d + ' 天 ' : ''}${h} 小时:作物、树苗与熔炉已按世界时间推进。`, '#c8b0ff');
  }

  // ———————————————————————— 刷怪
  spawnTick() {
    const p = this.player, w = this.world, c = this.clock;
    if (p.dead) return;
    const hostiles = this._mobs.filter(m => m.hostile && !m.campKey).length;
    // 友方营地/前哨 40 格内不刷敌对生物
    const safe = (x, y) => { for (const cp of this.camps.values()) { const te = this.world.getTe(cp.x, cp.y); if (te?.faction === this.faction() && (!te.player || te.valid) && Math.abs(cp.x - x) < 40 && Math.abs(cp.y - y) < 30) return true; } return false; };
    // 敌对阵营巡逻队(白天地表)
    if (!c.blood && this.difficulty > 0 && Math.random() < 0.012 && p.y < this.gen.column(Math.floor(p.x)).s + 4 && !safe(p.x, p.y)) {
      const enemy = FACTIONS[this.faction()].enemy, dir = Math.random() < 0.5 ? -1 : 1;
      const bx = Math.floor(p.x + dir * (this.renderer.W / 2 / TS + 10));
      const col = this.gen.column(bx);
      if (w.isLoaded(bx, col.s) && !w.solid(bx, col.s - 1) && !w.solid(bx, col.s - 2)) {
        const lv = this.zoneLevel(bx, col.s);
        PATROL[enemy].forEach((t, i) => this.addNpc(t, bx + 0.5 + i * dir * 1.4, col.s, lv, { patrol: true }));
        this.msg(`一支${FACTIONS[enemy].name}巡逻队正在靠近!`, '#f99');
      }
    }
    const night = c.sunFactor() < 0.4;
    const cap = this.difficulty === 0 ? 0 : 8 + (night ? 4 : 0) + (c.blood ? 12 : 0) + (c.season === 3 ? 2 : 0);
    const r = this.renderer;
    const halfW = r.W / 2 / TS + 3, halfH = r.H / 2 / TS + 3;
    for (let a = 0; a < (c.blood ? 4 : 2) && hostiles < cap; a++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const x = Math.floor(p.x + dir * (halfW + Math.random() * 22));
      const y0 = Math.floor(p.y + (Math.random() - 0.5) * (halfH * 2 + 20));
      if (!w.isLoaded(x, y0) || !w.isLoaded(x, y0 + 20)) continue;
      let fy = -1;
      for (let k = 0; k < 20; k++) {
        const y = y0 + k;
        if (!w.solid(x, y) && !w.fluid(x, y) && !w.solid(x, y - 1) && !w.solid(x, y - 2) && (w.solid(x, y + 1) || w.platform(x, y + 1))) { fy = y + 1; break; }
      }
      if (fy < 0) continue;
      const col = this.gen.column(x);
      const under = fy > col.s + 6, hell = fy > HELL_Y;
      const light = this.light.at(x, fy - 1);
      let kind = null;
      if (hell) kind = Math.random() < 0.75 ? 'lava_slime' : 'bat';
      else if (light < 0.3) {
        const r2 = Math.random();
        kind = r2 < 0.32 ? 'zombie' : r2 < 0.55 ? 'skeleton' : r2 < 0.72 ? 'creeper' : r2 < 0.86 ? 'spider' : under ? (Math.random() < 0.5 ? 'slime' : 'bat') : 'zombie';
        if (c.blood && Math.random() < 0.4) kind = 'zombie';
      } else if (!under && !night && Math.random() < 0.08 && hostiles < 4) kind = 'slime';
      if (!kind) continue;
      if (safe(x, fy)) continue;
      const m = this.addMob(kind, x + 0.5, kind === 'bat' ? fy - 2 : fy);
      if (m.overlapsSolid()) m.dead = true;
    }
    // 夜晚地表:恶魔眼
    if (night && hostiles < cap && this.difficulty > 0 && Math.random() < (c.blood ? 0.25 : 0.06)) {
      const col = this.gen.column(Math.floor(p.x));
      if (p.y < col.s + 4) {
        const x = p.x + (Math.random() < 0.5 ? -1 : 1) * (halfW + 6), y = p.y - 12 - Math.random() * 10;
        if (w.isLoaded(Math.floor(x), Math.floor(y)) && !w.solid(Math.floor(x), Math.floor(y))) this.addMob('demon_eye', x, y);
      }
    }
    // 补充少量被动动物
    if (!night && Math.random() < 0.02) {
      const passives = this._mobs.filter(m => !m.hostile).length;
      if (passives < 6) {
        const x = Math.floor(p.x + (Math.random() < 0.5 ? -1 : 1) * (halfW + 8 + Math.random() * 12));
        const col = this.gen.column(x);
        if (w.isLoaded(x, col.s) && w.fg(x, col.s) === B.grass && !w.fg(x, col.s - 1) && !w.fg(x, col.s - 2)) this.addMob(['pig', 'cow', 'sheep', 'chicken'][(Math.random() * 4) | 0], x + 0.5, col.s);
      }
    }
  }

  lightning() {
    const p = this.player;
    const x = p.x + (Math.random() - 0.5) * 80;
    const col = this.gen.column(Math.floor(x));
    if (p.y > col.s + 20) { this.sfx('thunder'); return; }
    this.renderer.lightning(x);
    const d = Math.abs(x - p.x);
    setTimeout(() => this.sfx('thunder'), Math.min(2500, d * 30));
    for (const m of this._mobs) if (Math.abs(m.x - x) < 3 && m.y < col.s + 2) { m.hurt(8, 0, -6); m.fireT = 5; }
  }

  // ———————————————————————— 睡眠(延时摄影式跳过夜晚)
  trySleep(tx, ty) {
    const c = this.clock, p = this.player, w = this.world;
    const m = w.meta(tx, ty);
    const headX = m & 1 ? tx + ((m & 2) ? -1 : 1) : tx;
    p.bedSpawn = { x: headX + 0.5, y: ty + 1 };
    if (c.blood) { this.msg('血月当空,你根本无法入睡!', '#f66'); return true; }
    const night = c.sunFactor() < 0.35;
    if (!night && c.weather !== 'thunder') { this.msg('已设置重生点。只能在夜晚或雷暴时入睡。', '#cfc'); return true; }
    if (this._mobs.some(mm => mm.hostile && Math.hypot(mm.x - p.x, mm.y - p.y) < 10)) { this.msg('附近有怪物,现在无法休息!', '#f88'); return true; }
    const until = night ? c.ticksUntilMorning() : Math.min(c.weatherLeft, c.ticksUntilMorning());
    this.sleep = { target: c.tick + until, rate: Math.max(c.rate, until / (4.5 * 20)), skipped: 0, start: c.tick };
    p.sleeping = true; p.vx = p.vy = 0;
    const footX = headX + ((m & 2) ? 1 : -1);
    p.x = Math.min(headX, footX) + 1;
    p.y = ty + 1;
    p.bedDir = (m & 2) ? 1 : -1;
    this.ui.closePanel();
    this.msg('你躺下休息……时间飞速流逝。', '#ccf');
    play('sleep');
    return true;
  }
  wake(natural) {
    const s = this.sleep, p = this.player;
    if (!s) return;
    this.sleep = null; p.sleeping = false;
    p.y -= 0.0; p.vy = -3;
    if (p.overlapsSolid()) p.y -= 1;
    // 睡眠期间按世界时间补算所有已加载区块(与离线区块同一套规则)
    for (const c of this.world.chunks.values()) this.world.catchUp(c, s.skipped, { furnaces: false, quiet: true });
    if (natural) {
      const hrs = Math.round(s.skipped / 1000);
      this.msg(`你一觉睡到了 ${this.clock.fmtTime()}(时光流逝约 ${hrs} 小时)。`, '#cfe');
      p.hunger = Math.max(this.difficulty ? 6 : 20, p.hunger - 2);
    }
  }

  // ———————————————————————— 爆炸
  explode(x, y, power, src, level = 1) {
    const w = this.world, r = power;
    this.fx.explosion(x, y, r);
    this.sfx('explode', x, y);
    this.renderer.shake = Math.min(1.2, this.renderer.shake + power / Math.max(4, Math.hypot(x - this.player.x, y - this.player.y)) * 1.5);
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const tx = Math.floor(x + dx), ty = Math.floor(y + dy);
      if (!w.isLoaded(tx, ty)) continue;
      const id = w.fg(tx, ty);
      if (!id) continue;
      const b = BLOCKS[id];
      const strength = power * (1 - d / (r + 0.5)) * (0.7 + Math.random() * 0.6);
      if (id === B.tnt) { w.set(tx, ty, B.air); this.primeTnt(tx, ty, 0.4 + Math.random() * 0.6); continue; }
      if (b.blast < strength * 4) w.breakBlock(tx, ty, { drop: Math.random() < 0.3 });
    }
    for (const e of [this.player, ...this.entities]) {
      if (!e || e.dead || e === src) continue;
      const dx = e.x - x, dy = (e.y - (e.h || 0.5) / 2) - y, d = Math.hypot(dx, dy);
      if (d > r * 2) continue;
      const k = 1 - d / (r * 2);
      if (e.type === 'item') { e.vx += dx / (d || 1) * 10 * k; e.vy -= 8 * k; continue; }
      if (e.hurt) {
        const dmg = Math.round(k * power * 5.5 * (1 + (level - 1) * 0.15));
        if (e === this.player) e.hurt(dmg, dx / (d || 1) * 14 * k, -10 * k, src, 'explosion', true);
        else e.hurt(dmg, dx / (d || 1) * 14 * k, -10 * k, src, false, true);
      }
    }
  }

  // ———————————————————————— 死亡与重生
  playerDied(src, kind) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true; p.stats.deaths++;
    const name = src?.def?.name || (src?.type === 'player' ? '自己' : null);
    const cause = {
      fall: '你从高处摔落了', drown: '你溺水了', lava: '你试图在岩浆里游泳', fire: '你被烧死了', starve: '你饿死了', cactus: '你被仙人掌扎死了',
      suffocate: '你在方块里窒息了', void: '你掉出了世界', explosion: name ? `你被${name}炸飞了` : '你被炸飞了', arrow: `你被${name || '箭'}射杀了`,
    }[kind] || (name ? `你被${name}杀死了` : '你死了');
    let grave = null;
    if (!p.creative) {
      const items = p.inv.takeAll();
      if (items.length) {
        const w = this.world;
        let gx = Math.floor(p.x), gy = Math.floor(p.y - 0.5);
        outer: for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const x = gx + dx, y = gy + dy;
          if (!w.isLoaded(x, y)) continue;
          const f = w.fg(x, y);
          if ((!f || BLOCKS[f].replace) && !w.fluid(x, y) && y < 740) { gx = x; gy = y; grave = { x, y }; break outer; }
        }
        if (grave) {
          if (w.fg(gx, gy)) w.set(gx, gy, B.air);
          w.set(gx, gy, B.gravestone);
          w.setTe(gx, gy, { type: 'grave', items });
          this.lastDeath = { x: gx + 0.5, y: gy + 0.5 };
        } else for (const s of items) this.dropItem(p.x, p.y - 1, s.id, s.n, { dur: s.dur });
      }
    }
    this.fx.poof(p.x, p.y - 1.2, 1, 2.6);
    this.msg(cause + '。', '#ff7a6a');
    if (p.rpg.hardcore) {
      p.rpg.hardcore = false; this.meta.ruleset = 'normal'; this.meta.hardcoreFallen = { day: this.clock.day + 1, level: p.rpg.level };
      this.msg(`硬核角色 ${p.rpg.fullName} 阵亡于第 ${this.clock.day + 1} 天(${p.rpg.level} 级)。角色已转入普通规则,传奇到此为止。`, '#ff5a4a');
    }
    this.ui.closePanel();
    this.onDeath?.(cause, grave);
  }
  respawn() {
    const p = this.player, w = this.world;
    let at = p.spawn;
    if (p.bedSpawn) {
      const bx = Math.floor(p.bedSpawn.x), by = Math.floor(p.bedSpawn.y - 1);
      w.chunk(bx >> CSH, by >> CSH);
      if (w.fg(bx, by) === B.bed || w.fg(bx - 1, by) === B.bed || w.fg(bx + 1, by) === B.bed) at = p.bedSpawn;
      else { p.bedSpawn = null; this.msg('你的床不见了,只能回到世界出生点。', '#f99'); }
    }
    p.dead = false; p.maxHp = p.rpg.maxHp(); p.hp = p.maxHp; p.hunger = 20;
    p.rpg.form = null; p.rpg.buffs = {}; p.stunT = 0; p.charge = null; p.sat = 5; p.air = 10; p.fireT = 0; p.vx = p.vy = 0; p.invuln = 2;
    p.x = at.x; p.y = at.y; p.fallStart = p.y;
    this.renderer.cx = p.x * TS; this.renderer.cy = (p.y - 1.4) * TS;
    this.renderer.updateCamera(0, true);
    this.ensureLoaded();
  }

  // ———————————————————————— 光源、工作站、环境效果
  extraLights() {
    const L = [], p = this.player;
    if (!p.dead && !this.demo) {
      const h = p.inv.held?.id;
      const light = h && (h === 'torch' ? [1, 0.8, 0.5] : h === 'lantern' ? [1, 0.88, 0.62] : h === 'glowstone' ? [1, 0.85, 0.55] : h === 'glow_mushroom' ? [0.3, 0.5, 1] : h === 'lava_bucket' ? [0.8, 0.4, 0.15] : null);
      if (light) L.push({ x: p.x + p.facing * 0.6, y: p.y - 1.5, r: light[0], g: light[1], b: light[2] });
      if (p.inv.armor[0]?.id === 'mining_helmet') { L.push({ x: p.x, y: p.y - 2.2, r: 0.95, g: 0.92, b: 0.75 }); L.push({ x: p.x + p.facing * 3, y: p.y - 2, r: 0.7, g: 0.68, b: 0.55 }); }
      if (p.fireT > 0) L.push({ x: p.x, y: p.y - 1, r: 0.9, g: 0.5, b: 0.2 });
      L.push({ x: p.x, y: p.y - 1.3, r: 0.12, g: 0.12, b: 0.14 });
    }
    for (const e of this.entities) {
      if (e.type === 'mob' && (e.fireT > 0 || e.kind === 'lava_slime')) L.push({ x: e.x, y: e.y - e.h / 2, r: 0.9, g: 0.45, b: 0.15 });
      if (e.type === 'tnt') L.push({ x: e.x, y: e.y - 0.5, r: 0.6, g: 0.4, b: 0.2 });
      if (e.type === 'spell') L.push({ x: e.x, y: e.y, r: e.col[0] / 300, g: e.col[1] / 300, b: e.col[2] / 300 });
      if (e.type === 'ground') L.push({ x: e.x, y: e.y - 0.5, r: 0.7, g: 0.6, b: 0.3 });
      if (e.type === 'totem') L.push({ x: e.x, y: e.y - 1.5, r: 0.8, g: 0.45, b: 0.2 });
      if (e.type === 'item' && (e.id === 'torch' || e.id === 'glowstone' || e.id === 'lantern')) L.push({ x: e.x, y: e.y - 0.3, r: 0.7, g: 0.55, b: 0.35 });
    }
    return L;
  }
  nearStations() {
    const s = new Set(), p = this.player, w = this.world;
    for (let dy = -4; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = Math.floor(p.x) + dx, y = Math.floor(p.y - 1) + dy;
      if (!w.isLoaded(x, y)) continue;
      const id = w.fg(x, y);
      if (id === B.crafting_table) s.add('table');
      else if (id === B.furnace) s.add('furnace');
    }
    return s;
  }
  ambientFx(dt) {
    const r = this.renderer, v = r.viewTiles(), w = this.world, c = this.clock;
    // 秋季落叶 / 萤火虫
    for (let k = 0; k < 3; k++) {
      const x = v.x0 + Math.floor(Math.random() * (v.x1 - v.x0)), y = v.y0 + Math.floor(Math.random() * (v.y1 - v.y0));
      if (!w.isLoaded(x, y)) continue;
      const id = w.fg(x, y);
      if (BLOCKS[id].render === 'leaves' && !w.fg(x, y + 1) && Math.random() < (c.season === 2 ? 0.25 : 0.03)) {
        const sp = BLOCKS[id].species;
        const col = c.season === 2 ? (sp === 1 ? [240, 190, 50] : [220, 110, 40]) : [70, 150, 60];
        this.fx.leaf(x + Math.random(), y + 1, col);
      }
      if (c.sunFactor() < 0.3 && c.weather === 'clear' && c.season !== 3 && !id && w.skyAt(x, y) && Math.random() < 0.04) {
        const col = this.gen.column(x);
        if ((col.biome === BIOME.FOREST || col.biome === BIOME.PLAINS || col.biome === BIOME.JUNGLE) && y > col.s - 8 && y < col.s) this.fx.firefly(x + Math.random(), y + Math.random());
      }
      if (id === B.torch && Math.random() < 0.05) this.fx.add({ x: x + 0.5, y: y + 0.1, vx: 0, vy: -1, life: 0.6, color: [255, 200, 90], size: 1, grav: -1, kind: 'glow' });
    }
  }
  ambientState() {
    const p = this.player, c = this.clock, col = this.gen.column(Math.floor(p.x));
    return {
      rain: c.weather === 'thunder' ? 1 : c.weather === 'rain' ? 0.6 : 0,
      underground: p.y > col.s + 12, hell: p.y > HELL_Y, night: c.sunFactor() < 0.4, blood: c.blood,
      altitude: p.y < -60,
    };
  }

  debugText() {
    const p = this.player, w = this.world;
    return `FPS ${this.fps.toFixed(0)}  区块 ${w.chunks.size}  存档区块 ${this.store.size}  实体 ${this.entities.length}\nX ${p.x.toFixed(1)} Y ${p.y.toFixed(1)}  光照 ${this.light.at(p.x, p.y - 1).toFixed(2)}  流体活跃 ${w.fluidList.length / 2}\n世界刻 ${Math.floor(this.clock.tick)}  种子 ${this.meta.seed}`;
  }

  // ———————————————————————— 指令
  chat(text) {
    if (!text.startsWith('/')) { this.msg(`<b>&lt;你&gt;</b> ${text.replace(/[<>&]/g, '')}`); return; }
    const [cmd, ...a] = text.slice(1).trim().split(/\s+/);
    const c = this.clock, p = this.player;
    const forward = (ticks, why) => {
      if (ticks <= 0) return;
      c.advance(ticks);
      for (const ch of this.world.chunks.values()) this.world.catchUp(ch, ticks, { quiet: true });
      this.renderer.invalidateAll();
      this.msg(`${why}(时间向前推进 ${(ticks / 1000).toFixed(1)} 小时,已加载区域同步生长)`, '#9cf');
    };
    const toTod = s => ({ day: 7, morning: 7, noon: 12, dusk: 18.5, sunset: 18.5, night: 20, midnight: 0 }[s] ?? (s?.includes(':') ? +s.split(':')[0] + +s.split(':')[1] / 60 : NaN));
    switch ((cmd || '').toLowerCase()) {
      case 'help':
        this.msg('角色指令:/level &lt;等级&gt; · /xp &lt;经验&gt; · /money &lt;铜&gt; · /fusion(解锁职业融合)', '#ddd');
        this.msg('指令:/time set &lt;day|noon|dusk|night|midnight|HH:MM&gt; · /time add &lt;小时&gt; · /time speed &lt;倍率&gt; · /weather &lt;clear|rain|thunder&gt; · /season &lt;next|spring|summer|autumn|winter&gt; · /give &lt;物品&gt; [数量] · /tp &lt;x&gt; [y] · /spawn · /gamemode &lt;survival|creative&gt; · /difficulty &lt;peaceful|easy|normal|hard&gt; · /summon &lt;生物&gt; · /seed · /heal · /kill', '#ddd');
        break;
      case 'time': {
        if (a[0] === 'set') {
          const h = toTod(a[1]);
          if (isNaN(h)) { this.msg('用法:/time set day|noon|dusk|night|midnight|HH:MM', '#f88'); break; }
          let target = c.day * DAY_TICKS + h * 1000;
          if (target <= c.tick) target += DAY_TICKS;
          forward(target - c.tick, `时间设为 ${a[1]}`);
        } else if (a[0] === 'add') {
          const v = parseFloat(a[1]); if (!(v > 0)) { this.msg('用法:/time add &lt;小时&gt;(如 6 或 48)', '#f88'); break; }
          forward(v * 1000, `时间前进 ${v} 小时`);
        } else if (a[0] === 'speed') {
          const v = parseFloat(a[1]); if (!(v > 0 && v <= 100)) { this.msg('用法:/time speed &lt;0.1~100&gt;', '#f88'); break; }
          c.scale = v; this.msg(`世界时间流速设为 ×${v}`, '#9cf');
        } else this.msg(`当前:${c.fmtDate()} ${c.fmtTime()} · 世界刻 ${Math.floor(c.tick)}`, '#9cf');
        break;
      }
      case 'weather': {
        const k = { clear: 'clear', rain: 'rain', thunder: 'thunder', snow: 'rain' }[a[0]];
        if (!k) { this.msg('用法:/weather clear|rain|thunder', '#f88'); break; }
        c.weather = k; c.weatherLeft = 6000 + Math.random() * 6000; c.nextWeather = c.rollWeather();
        this.msg(`天气已设为 ${WEATHER_NAMES[k]}`, '#9cf');
        break;
      }
      case 'season': {
        const idx = { spring: 0, summer: 1, autumn: 2, fall: 2, winter: 3, next: (c.season + 1) % 4 }[a[0]];
        if (idx === undefined) { this.msg('用法:/season next|spring|summer|autumn|winter', '#f88'); break; }
        let d = (idx - c.season + 4) % 4 || 4;
        const startDay = (Math.floor(c.day / c.seasonDays) + d) * c.seasonDays;
        forward(startDay * DAY_TICKS + 10000 - c.tick, `跳到${SEASON_NAMES[idx]}`);
        break;
      }
      case 'give': {
        const q = a[0];
        const it = ITEMS[q] || ITEM_LIST.find(i => i.name === q) || ITEM_LIST.find(i => q && i.name.includes(q));
        if (!it) { this.msg(`没有名为“${(q || '').replace(/[<>&]/g, '')}”的物品`, '#f88'); break; }
        const n = Math.max(1, Math.min(999, parseInt(a[1]) || 1));
        const left = p.inv.add(it.key, n);
        if (left) this.dropItem(p.x, p.y - 1, it.key, left);
        this.msg(`获得 ${it.name} ×${n}`, '#9f9');
        break;
      }
      case 'tp': {
        const x = parseFloat(a[0]);
        if (a[0] === 'spawn' || isNaN(x)) { this.msg('用法:/tp &lt;x&gt; [高度]', '#f88'); break; }
        let y = a[1] !== undefined ? -parseFloat(a[1]) : this.gen.column(Math.floor(x)).s;
        p.x = x + 0.5; p.y = y; p.vx = p.vy = 0; p.fallStart = p.y;
        this.renderer.cx = p.x * TS; this.renderer.cy = (p.y - 1.4) * TS; this.renderer.updateCamera(0, true);
        this.ensureLoaded();
        this.msg(`传送到 X ${Math.floor(p.x)} · 高度 ${-Math.floor(p.y)}`, '#9cf');
        break;
      }
      case 'spawn': p.x = p.spawn.x; p.y = p.spawn.y; p.vx = p.vy = 0; this.renderer.cx = p.x * TS; this.renderer.cy = (p.y - 1.4) * TS; this.renderer.updateCamera(0, true); this.ensureLoaded(); break;
      case 'gamemode': {
        const m = { survival: false, s: false, 0: false, creative: true, c: true, 1: true }[a[0]];
        if (m === undefined) { this.msg('用法:/gamemode survival|creative', '#f88'); break; }
        p.creative = m; if (!m) p.flying = false;
        this.msg(m ? '已切换为创造模式(双击空格飞行,背包中可打开物品库)' : '已切换为生存模式', '#9cf');
        this.ui.barSig = '';
        break;
      }
      case 'difficulty': {
        const d = { peaceful: 0, easy: 1, normal: 2, hard: 3 }[a[0]];
        if (d === undefined) { this.msg('用法:/difficulty peaceful|easy|normal|hard', '#f88'); break; }
        this.difficulty = d; this.meta.difficulty = d; this.msg('难度已设为 ' + ['和平', '简单', '普通', '困难'][d], '#9cf');
        break;
      }
      case 'summon': {
        const k = a[0] in MOBS ? a[0] : Object.keys(MOBS).find(k2 => MOBS[k2].name === a[0]);
        if (!k) { this.msg('可召唤:' + Object.entries(MOBS).map(([k2, v]) => `${k2}(${v.name})`).join(' '), '#f88'); break; }
        const m = this.addMob(k, p.x + p.facing * 4, p.y - (MOBS[k].fly ? 3 : 0.5));
        if (m.overlapsSolid()) m.y -= 2;
        this.msg(`召唤了 ${MOBS[k].name}`, '#9cf');
        break;
      }
      case 'seed': this.msg(`世界种子:${this.meta.seed}`, '#9cf'); break;
      case 'level': {
        const v = Math.max(1, Math.min(60, parseInt(a[0]) || 1)), rpg = p.rpg;
        while (rpg.level < v) { rpg.level++; rpg.levelUp(); }
        if (v < rpg.level) { rpg.level = v; rpg.xp = 0; p.maxHp = rpg.maxHp(); p.hp = p.maxHp; }
        this.msg(`等级设为 ${rpg.level}`, '#9cf'); break;
      }
      case 'xp': p.rpg.gainXp(Math.max(1, parseInt(a[0]) || 100)); break;
      case 'money': p.rpg.money += Math.max(0, parseInt(a[0]) || 10000); this.msg('获得金钱。', '#ffd040'); break;
      case 'fusion': p.rpg.fusionReady = true; this.msg('已解锁职业融合,去任务官处选择第二职业。', '#ffb0ff'); break;
      case 'heal': p.hp = p.maxHp; p.hunger = 20; p.sat = 10; p.air = 10; p.fireT = 0; this.msg('已恢复。', '#9f9'); break;
      case 'kill': p.creative ? this.msg('创造模式下无法死亡。', '#f88') : p.hurt(999, 0, 0, null, 'void', true); break;
      default: this.msg(`未知指令 /${(cmd || '').replace(/[<>&]/g, '')},输入 /help 查看列表。`, '#f88');
    }
  }

  // ———————————————————————— 存档
  async save() {
    if (this.demo) return;
    this.world.flush();
    const m = this.meta;
    m.clock = this.clock.save(); m.player = this.player.save(); m.explored = this.map.save();
    m.rpg = this.player.rpg.save(); m.quests = this.quests.save(); m.race = m.rpg.race; m.cls = m.rpg.cls; m.level = m.rpg.level;
    m.played = Date.now(); m.day = this.clock.day; m.difficulty = this.difficulty; m.lastDeath = this.lastDeath;
    try { await Promise.all([putWorld(m), this.store.flush()]); } catch (e) { console.warn('保存失败', e); }
  }
}
