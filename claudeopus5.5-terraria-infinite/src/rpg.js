// RPG 核心:等级与经验、属性、资源(怒气/法力/能量)、增益、技能施放与职业融合,以及法术飞弹、宠物、图腾、地面效果实体。
import { Entity, Arrow } from './entities.js';
import { RACES, CLASSES, SKILLS, RES_INFO, LEVEL_CAP, FUSION_LEVEL, xpForLevel, classSkills } from './wow.js';
import { ITEMS } from './items.js';
import { BLOCKS } from './blocks.js';
import { play } from './audio.js';

const FX_COL = { holy: [255, 230, 120], shadow: [150, 70, 220], fire: [255, 120, 40], frost: [140, 210, 255], lightning: [170, 210, 255], nature: [140, 230, 90], earth: [200, 150, 80], arcane: [230, 160, 255] };

export class RPG {
  constructor(player, o = {}) {
    this.p = player;
    this.race = o.race || 'human';
    this.faction = RACES[this.race]?.faction || 'alliance';
    this.cls = o.cls || 'warrior';
    this.cls2 = o.cls2 || null;
    this.fusion = !!o.fusion; this.fusionReady = !!o.fusionReady;
    this.level = o.level || 1;
    this.xp = o.xp || 0;
    this.money = o.money || 0;
    this.res = o.res || { rage: 0, mana: 9999, energy: 100 };
    this.bar = o.bar || null;
    this.cds = {}; this.gcd = 0; this.racialCd = 0;
    this.buffs = {};
    this.form = null;
    this.combatT = 0; this.glide = 10; this.gliding = false; this.msgT = 0;
    this.name = o.name || '无名'; this.surname = o.surname || '';
    this.hardcore = !!o.hardcore;
    if (!this.bar) this.autoBar();
  }
  save() {
    const { race, cls, cls2, fusion, fusionReady, level, xp, money, res, bar, name, surname, hardcore } = this;
    return { race, cls, cls2, fusion, fusionReady, level, xp, money, res, bar, name, surname, hardcore };
  }
  get raceDef() { return RACES[this.race]; }
  get fullName() { return this.surname ? `${this.name}·${this.surname}` : this.name; }
  classes() { return this.cls2 ? [this.cls, this.cls2] : [this.cls]; }
  resTypes() { const s = new Set(this.classes().map(c => CLASSES[c].res)); if (this.form === 'bear') s.add('rage'); if (this.form === 'cat') s.add('energy'); return [...s]; }
  maxRes(t) { return t === 'mana' ? Math.round((80 + this.level * 6) * (this.race === 'gnome' ? 1.1 : 1)) : RES_INFO[t].max; }
  skillUnlocked(id) {
    const s = SKILLS[id];
    if (!s) return false;
    if (s.cls === this.cls) return this.level >= s.lvl;
    if (s.cls === this.cls2) return this.level >= Math.max(FUSION_LEVEL, s.lvl);
    return false;
  }
  available() { return this.classes().flatMap(c => classSkills(c)).filter(s => this.skillUnlocked(s.id)); }
  autoBar() {
    const list = classSkills(this.cls).map(s => s.id);
    this.bar = [list[0], list[1], list[2], list[3], list[4]].map(x => x || null);
  }

  // —— 属性
  maxHp() {
    let hp = (20 + (this.level - 1) * 4) * CLASSES[this.cls].hp;
    if (this.race === 'tauren') hp *= 1.1;
    if (this.form === 'bear') hp *= 1.4;
    return Math.round(hp);
  }
  weaponStats() {
    const inv = this.p.inv, held = inv.held && ITEMS[inv.held.id], eq = inv.weapon && ITEMS[inv.weapon.id];
    const melee = held?.weapon || held?.tool?.type === 'sword' ? held : eq || held;
    const spell = (eq?.spell || 0) + (held?.spell && held !== eq ? held.spell : 0);
    const bow = held?.kind === 'bow' ? held : eq?.kind === 'bow' ? eq : null;
    return { dmg: melee?.dmg || 1, reach: melee?.reach || 0, spell, bow: bow?.dmg || 0, item: melee };
  }
  lvlMult() { return 1 + (this.level - 1) * 0.1; }
  meleeMult() {
    let m = this.lvlMult() * Math.max(...this.classes().map(c => CLASSES[c].melee));
    if (this.form === 'bear') m *= 1.35; if (this.form === 'cat') m *= 1.25;
    return m * this.dmgBuff();
  }
  spellMult() { return this.lvlMult() * Math.max(...this.classes().map(c => CLASSES[c].spell || 0.6)) * this.dmgBuff(); }
  dmgBuff() { let m = 1; if (this.buffs.blood_fury) m *= 1.3; if (this.buffs.berserking) m *= 1.2; return m; }
  takenMult() {
    let m = 1;
    if (this.race === 'orc') m *= 0.95;
    if (this.buffs.shield_wall) m *= 0.4;
    if (this.buffs.stoneform) m *= 0.4;
    if (this.form === 'bear') m *= 0.7;
    return m;
  }
  speedMult() {
    let m = 1;
    if (this.buffs.sprint) m *= 1.7;
    if (this.buffs.escape_artist) m *= 1.8;
    if (this.buffs.berserking) m *= 1.15;
    if (this.form === 'cat') m *= 1.4;
    if (this.form === 'bear') m *= 0.9;
    if (this.race === 'nightelf' && this.p.game.clock.sunFactor() < 0.4) m *= 1.1;
    if (this.buffs.stealth) m *= 0.75;
    return m;
  }
  canGlide() { return this.race === 'skyborn_a' || this.race === 'skyborn_h'; }
  noFallDamage() { return this.canGlide(); }

  // —— 每帧
  update(dt) {
    const p = this.p;
    for (const k in this.cds) { this.cds[k] -= dt; if (this.cds[k] <= 0) delete this.cds[k]; }
    this.gcd = Math.max(0, this.gcd - dt); this.racialCd = Math.max(0, this.racialCd - dt);
    this.combatT = Math.max(0, this.combatT - dt);
    for (const k in this.buffs) {
      const b = this.buffs[k];
      b.t -= dt;
      if (k === 'rejuv' && b.t > 0) p.heal(b.hps * dt, true);
      if (k === 'cannibalize' && b.t > 0) p.heal(b.hps * dt, true);
      if (b.t <= 0) { delete this.buffs[k]; if (k === 'stealth') p.game.msg('你脱离了潜行。', '#aab'); }
    }
    const types = this.resTypes();
    for (const t of types) {
      const max = this.maxRes(t);
      if (t === 'mana') this.res.mana = Math.min(max, this.res.mana + max * (this.combatT > 0 ? 0.015 : 0.05) * dt);
      if (t === 'energy') this.res.energy = Math.min(max, this.res.energy + 22 * dt);
      if (t === 'rage' && this.combatT <= 0) this.res.rage = Math.max(0, this.res.rage - 4 * dt);
    }
    if (this.res.mana > this.maxRes('mana')) this.res.mana = this.maxRes('mana');
    if (p.onGround || p.inWater || p.climbing) this.glide = Math.min(10, this.glide + dt * 4);
    p.maxHp = this.maxHp();
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  }
  enterCombat() { this.combatT = 5; }
  addRage(n) { if (this.resTypes().includes('rage')) this.res.rage = Math.min(100, this.res.rage + n); }

  gainXp(n, src) {
    if (this.level >= LEVEL_CAP || n <= 0) return;
    if (this.race === 'human') n = Math.round(n * 1.1);
    this.xp += n;
    const g = this.p.game;
    g.fx.text(this.p.x, this.p.y - this.p.h - 0.9, `+${n} 经验`, '#c8a0ff');
    while (this.level < LEVEL_CAP && this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      this.levelUp();
    }
    if (this.level >= LEVEL_CAP) this.xp = 0;
  }
  levelUp() {
    const p = this.p, g = p.game;
    p.maxHp = this.maxHp(); p.hp = p.maxHp;
    this.res.mana = this.maxRes('mana');
    g.msg(`<b>升级!</b>你达到了 ${this.level} 级。`, '#ffd040');
    g.ui.hint(`<span style="color:#ffd040">等级提升:${this.level}</span>`, 3);
    g.fx.sparkle(p.x, p.y - 1.3, [255, 220, 80]); g.fx.sparkle(p.x, p.y - 0.4, [255, 240, 140]);
    play('chime');
    const fresh = this.classes().flatMap(c => classSkills(c)).filter(s => this.skillUnlocked(s.id) && (s.cls === this.cls ? s.lvl === this.level : this.level === Math.max(FUSION_LEVEL, s.lvl)));
    for (const s of fresh) {
      g.msg(`学会了新技能:<b>${s.name}</b>(按 K 打开技能书)`, '#9fd0ff');
      const empty = this.bar.indexOf(null);
      if (empty >= 0) this.bar[empty] = s.id;
    }
    if (this.level === FUSION_LEVEL) g.msg('你已达到 20 级,可以向本阵营的任务官学习“职业融合”。', '#ffb0ff');
    g.quests?.event({ type: 'level', level: this.level });
  }

  // —— 施法
  say(t) { if (this.msgT <= 0) { this.p.game.ui.hint(t, 1.2); this.msgT = 0.6; } }
  cast(i) {
    const id = this.bar[i];
    if (!id) return;
    const s = SKILLS[id], p = this.p, g = p.game;
    if (p.dead || p.sleeping) return;
    if (!this.skillUnlocked(id)) { this.say(`${s.name}:尚未学会`); return; }
    if (this.cds[id] > 0 || this.gcd > 0) { if (this.cds[id] > 0) this.say(`${s.name} 冷却中(${this.cds[id].toFixed(1)} 秒)`); return; }
    if (p.stunT > 0) return;
    const res = CLASSES[s.cls].res;
    if (this.form && s.kind !== 'form' && !['melee', 'aoe', 'buff', 'dash'].includes(s.kind)) { this.say('变形状态下无法施放该技能'); return; }
    const cost = s.cost || 0;
    if (res !== 'rage' || cost) {
      const have = this.res[res] ?? 0;
      if (have < cost) { this.say(`${RES_INFO[res].name}不足`); return; }
    }
    const m = g.mouseWorld();
    const ok = this.perform(id, s, m);
    if (ok === false) return;
    this.res[res] = Math.max(0, (this.res[res] ?? 0) - cost);
    if (s.gain) this.addRage(s.gain);
    let cd = s.cd;
    if (this.buffs.rapid_fire && s.kind === 'arrow') cd *= 0.4;
    this.cds[id] = cd; this.gcd = 0.45;
    if (this.buffs.stealth && id !== 'stealth' && s.kind !== 'buff') delete this.buffs.stealth;
  }
  castRacial() {
    const p = this.p, g = p.game, r = this.raceDef.racial;
    if (p.dead || this.racialCd > 0) { if (this.racialCd > 0) this.say(`${r.name} 冷却中(${this.racialCd.toFixed(0)} 秒)`); return; }
    const m = g.mouseWorld();
    switch (r.id) {
      case 'every_man': p.stunT = 0; p.slowT = 0; p.heal(p.maxHp * 0.2); break;
      case 'stoneform': this.buffs.stoneform = { t: 8 }; break;
      case 'shadowmeld': this.buffs.stealth = { t: 12, meld: true }; break;
      case 'escape_artist': this.buffs.escape_artist = { t: 4 }; p.slowT = 0; break;
      case 'blood_fury': this.buffs.blood_fury = { t: 15 }; break;
      case 'cannibalize': this.buffs.cannibalize = { t: 5, hps: p.maxHp * 0.07 }; break;
      case 'war_stomp':
        for (const e of g.enemiesNear(p, p.x, p.cy, 4)) { e.stunT = 2; }
        g.fx.dust(p.x, p.y, BLOCKS[g.world.fg(Math.floor(p.x), Math.floor(p.y + 0.1))] ? g.world.fg(Math.floor(p.x), Math.floor(p.y + 0.1)) : 2, 20);
        g.renderer.shake = Math.max(g.renderer.shake, 0.6);
        break;
      case 'berserking': this.buffs.berserking = { t: 10 }; break;
      case 'wind_step': {
        const a = Math.atan2(m.y - p.cy, m.x - p.x);
        p.vx = Math.cos(a) * 18; p.vy = Math.min(-6, Math.sin(a) * 18);
        for (let k = 0; k < 10; k++) g.fx.add({ x: p.x, y: p.cy, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, life: 0.5, color: [200, 240, 255], size: 2, grav: 0, kind: 'glow' });
        break;
      }
    }
    this.racialCd = r.cd;
    g.msg(`施放种族技能:${r.name}`, '#cfe');
    play('bonemeal');
  }

  perform(id, s, m) {
    const p = this.p, g = p.game;
    const dir = Math.atan2(m.y - p.cy, m.x - p.x);
    const face = m.x >= p.x ? 1 : -1;
    p.facing = face;
    const w = this.weaponStats();
    const sp = (s.dmg || 0) + w.spell;
    switch (s.kind) {
      case 'melee': {
        p.startSwing('sword');
        const reach = 2.8 + w.reach * 0.5 + (this.form ? 0.4 : 0);
        const targets = g.enemiesNear(p, p.x + face * 1.2, p.cy, reach).filter(e => Math.sign(e.x - p.x || face) === face || Math.abs(e.x - p.x) < 0.8);
        targets.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
        const t = targets[0];
        if (!t) { this.say('附近没有目标'); return false; }
        let dmg = w.dmg * this.meleeMult() * s.mult;
        if (s.execute && t.hp < t.maxHp * 0.3) dmg *= 2.5;
        if (this.buffs.stealth) dmg *= 2;
        this.hit(t, dmg, face * 7, -4);
        if (s.stun) t.stunT = Math.max(t.stunT || 0, s.stun);
        this.addRage(6);
        play('hurt', { vol: 0.4 });
        return true;
      }
      case 'aoe': {
        p.startSwing('sword');
        const list = g.enemiesNear(p, p.x, p.cy, s.radius);
        for (const t of list) {
          if (s.mult) this.hit(t, (s.fx ? sp * this.spellMult() : w.dmg * this.meleeMult()) * s.mult, Math.sign(t.x - p.x || 1) * 6, -4);
          if (s.root) t.rootT = s.root;
          if (s.fear) t.fearT = s.fear;
        }
        g.fx.ring(p.x, p.cy, s.radius, FX_COL[s.fx] || [230, 210, 160]);
        if (!list.length && id !== 'frost_nova' && id !== 'psychic_scream') this.say('附近没有目标');
        return true;
      }
      case 'dash': {
        p.charge = { t: 0.32, dir: Math.cos(dir) >= 0 ? 1 : -1, stun: s.stun, hit: false };
        p.facing = p.charge.dir;
        play('jump');
        return true;
      }
      case 'bolt': {
        const n = 1;
        for (let k = 0; k < n; k++) g.entities.push(new SpellBolt(g, p.x + Math.cos(dir) * 0.6, p.cy - 0.2 + Math.sin(dir) * 0.6, Math.cos(dir) * s.speed, Math.sin(dir) * s.speed, p, {
          dmg: s.dmg ? sp * this.spellMult() : 0, fx: s.fx, slow: s.slow, stun: s.stun, burn: s.burn, dot: s.dot ? s.dot * this.spellMult() : 0, dotDur: s.dotDur, chain: s.chain, fear: s.fear, big: s.big,
        }));
        p.startSwing('bow'); p.aimA = Math.atan2(Math.abs(Math.cos(dir)), Math.sin(dir));
        play(s.fx === 'fire' ? 'ignite' : s.fx === 'lightning' ? 'shear' : 'bow', { vol: 0.6 });
        return true;
      }
      case 'arrow': {
        const cnt = s.count || 1;
        const base = (s.dmg + w.bow * 0.6) * this.lvlMult() * Math.max(...this.classes().map(c => CLASSES[c].ranged || 1));
        for (let k = 0; k < cnt; k++) {
          const a = dir + (k - (cnt - 1) / 2) * 0.12;
          const ar = new Arrow(g, p.x + Math.cos(a) * 0.6, p.cy - 0.3 + Math.sin(a) * 0.6, Math.cos(a) * s.speed, Math.sin(a) * s.speed, p, Math.round(base));
          ar.noPickup = true; ar.slow = s.slow;
          g.entities.push(ar);
        }
        p.startSwing('bow'); p.aimA = Math.atan2(Math.abs(Math.cos(dir)), Math.sin(dir));
        play('bow');
        return true;
      }
      case 'heal': {
        const amt = p.maxHp * s.heal + w.spell * 2 * this.lvlMult();
        p.heal(amt);
        g.fx.sparkle(p.x, p.cy, [180, 255, 160]);
        play('bonemeal');
        return true;
      }
      case 'buff': {
        if (id === 'life_tap') {
          if (p.hp <= p.maxHp * 0.12) { this.say('生命太低'); return false; }
          p.hp -= Math.round(p.maxHp * 0.1); this.res.mana = Math.min(this.maxRes('mana'), this.res.mana + 35);
          g.fx.sparkle(p.x, p.cy, [220, 60, 90]);
          return true;
        }
        if (id === 'stealth' && this.buffs.stealth) { delete this.buffs.stealth; return true; }
        const b = { t: s.dur };
        if (id === 'pw_shield') b.absorb = p.maxHp * 0.4 + w.spell * 3;
        if (id === 'rejuv') b.hps = (p.maxHp * 0.45 + w.spell * 3) / s.dur;
        this.buffs[s.buff] = b;
        if (id === 'stealth') g.msg('你进入了潜行。', '#aab');
        g.fx.sparkle(p.x, p.cy, hexToRgb(s.color));
        play('bonemeal');
        return true;
      }
      case 'blink': {
        const step = 0.25;
        let bx = p.x, by = p.y;
        for (let d = step; d <= s.range; d += step) {
          const nx = p.x + Math.cos(dir) * d, ny = p.y + Math.sin(dir) * d;
          if (p.boxHits(nx - p.w / 2, ny - p.h, nx + p.w / 2, ny)) break;
          bx = nx; by = ny;
        }
        for (let k = 0; k < 14; k++) g.fx.add({ x: p.x + (Math.random() - 0.5), y: p.cy + (Math.random() - 0.5) * 2, vx: 0, vy: -1, life: 0.5, color: [200, 160, 255], size: 2, grav: 0, kind: 'glow' });
        p.x = bx; p.y = by; p.vx *= 0.3; p.vy = Math.min(p.vy, 0); p.fallStart = p.y;
        for (let k = 0; k < 14; k++) g.fx.add({ x: p.x + (Math.random() - 0.5), y: p.cy + (Math.random() - 0.5) * 2, vx: 0, vy: -1, life: 0.5, color: [200, 160, 255], size: 2, grav: 0, kind: 'glow' });
        play('pop');
        return true;
      }
      case 'summon': {
        const existing = g.entities.find(e => e.pet === s.pet && e.owner === p && !e.dead);
        if (existing && s.pet !== 'totem') { existing.dead = true; g.fx.poof(existing.x, existing.cy, 1, 1); g.msg('你召回了伙伴。', '#cfe'); return true; }
        if (existing) existing.dead = true;
        g.entities.push(s.pet === 'totem' ? new Totem(g, p.x + face * 1.2, p.y, p, this) : new Pet(g, s.pet, p.x + face * 1.2, p.y - 0.1, p, this));
        play('bonemeal');
        return true;
      }
      case 'form': {
        this.form = this.form === s.form ? null : s.form;
        p.maxHp = this.maxHp();
        if (this.form === 'bear') { p.hp = Math.round(p.hp * 1.4); this.res.rage = Math.max(this.res.rage, 10); }
        p.hp = Math.min(p.hp, p.maxHp);
        g.fx.poof(p.x, p.cy, 1.2, 2.4);
        g.msg(this.form ? `你变成了${s.form === 'bear' ? '熊' : '猎豹'}。` : '你恢复了人形。', '#ffc080');
        play('grow');
        return true;
      }
      case 'ground': {
        g.entities.push(new GroundEffect(g, p.x, p.y, s, p, sp * this.spellMult() * 0.5 + s.dps * this.lvlMult()));
        play('bonemeal');
        return true;
      }
    }
    return false;
  }

  // 统一的“我方攻击敌方”结算
  hit(t, dmg, kx, ky) {
    const crit = Math.random() < (this.race === 'nightelf' ? 0.1 : 0.06) + (this.buffs.stealth ? 0.3 : 0);
    dmg = Math.max(1, Math.round(dmg * (crit ? 1.8 : 1)));
    t.hurt(dmg, kx, ky, this.p, crit);
    this.enterCombat();
    if (this.buffs.stealth && !this.buffs.stealth.meld) delete this.buffs.stealth;
    if (this.buffs.stealth?.meld) delete this.buffs.stealth;
  }
}

function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

// ———————————————— 法术飞弹
export class SpellBolt extends Entity {
  constructor(game, x, y, vx, vy, owner, o) {
    super(game, x, y, 0.3, 0.3);
    this.type = 'spell'; this.vx = vx; this.vy = vy; this.owner = owner; this.o = o; this.life = 2.2; this.hitSet = new Set();
    this.col = FX_COL[o.fx] || [255, 255, 255];
  }
  update(dt) {
    const g = this.game, w = g.world;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const steps = Math.ceil(Math.hypot(this.vx, this.vy) * dt / 0.25) || 1;
    for (let s = 0; s < steps; s++) {
      this.x += this.vx * dt / steps; this.y += this.vy * dt / steps;
      if (w.solidSafe(Math.floor(this.x), Math.floor(this.y))) { this.burst(); this.dead = true; return; }
      const tg = g.enemiesOf(this.owner).find(e => !e.dead && !this.hitSet.has(e) && Math.abs(e.x - this.x) < e.w / 2 + 0.25 && this.y > e.y - e.h - 0.2 && this.y < e.y + 0.2);
      if (tg) { this.apply(tg); return; }
    }
    if (Math.random() < 0.7) g.fx.add({ x: this.x, y: this.y, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, life: 0.3, color: this.col, size: this.o.big ? 3 : 2, grav: 0, kind: 'glow' });
  }
  apply(t) {
    const o = this.o, g = this.game;
    this.hitSet.add(t);
    if (o.dmg) {
      if (this.owner.rpg) this.owner.rpg.hit(t, o.dmg, Math.sign(this.vx) * 4, -3);
      else t.hurt(Math.max(1, Math.round(o.dmg)), Math.sign(this.vx) * 4, -3, this.owner);
    }
    if (o.slow) t.slowT = Math.max(t.slowT || 0, o.slow);
    if (o.stun) t.stunT = Math.max(t.stunT || 0, o.stun);
    if (o.fear) t.fearT = Math.max(t.fearT || 0, o.fear);
    if (o.burn) t.fireT = Math.max(t.fireT || 0, o.burn);
    if (o.dot) { t.dots = t.dots || []; t.dots.push({ dps: o.dot, t: o.dotDur || 8, src: this.owner, col: this.col }); }
    this.burst();
    if (o.chain > 1) {
      const next = g.enemiesOf(this.owner).filter(e => !e.dead && !this.hitSet.has(e) && Math.hypot(e.x - t.x, e.cy - t.cy) < 7).sort((a, b) => Math.hypot(a.x - t.x, a.cy - t.cy) - Math.hypot(b.x - t.x, b.cy - t.cy))[0];
      if (next) {
        g.fx.zap(t.x, t.cy, next.x, next.cy, this.col);
        this.x = t.x; this.y = t.cy; o.chain--; o.dmg *= 0.75;
        this.apply(next);
        return;
      }
    }
    this.dead = true;
  }
  burst() { for (let i = 0; i < (this.o.big ? 18 : 9); i++) this.game.fx.add({ x: this.x, y: this.y, vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7, life: 0.4, color: this.col, size: 2, grav: 0, kind: 'glow' }); }
}

// ———————————————— 地面效果(奉献)
export class GroundEffect extends Entity {
  constructor(game, x, y, s, owner, dps) {
    super(game, x, y, s.radius * 2, 0.5);
    this.type = 'ground'; this.s = s; this.owner = owner; this.dps = dps; this.life = s.dur; this.tk = 0;
    this.col = FX_COL[s.fx] || [255, 220, 120];
  }
  update(dt) {
    const g = this.game;
    this.life -= dt; this.tk -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.tk <= 0) {
      this.tk = 1;
      for (const e of g.enemiesOf(this.owner)) if (Math.abs(e.x - this.x) < this.s.radius && Math.abs(e.y - this.y) < 2.5) this.owner.rpg.hit(e, this.dps, 0, -1);
    }
    if (Math.random() < 0.8) g.fx.add({ x: this.x + (Math.random() - 0.5) * this.s.radius * 2, y: this.y - 0.1, vx: 0, vy: -1.5, life: 0.6, color: this.col, size: 2, grav: 0, kind: 'glow' });
  }
}

// ———————————————— 宠物(狼 / 小鬼)与图腾
import { Mob } from './mobs.js';
export class Pet extends Mob {
  constructor(game, kind, x, y, owner, rpg) {
    super(game, kind === 'wolf' ? 'wolf' : 'imp', x, y, rpg.level);
    this.pet = kind; this.owner = owner; this.side = 'A'; this.friendly = true; this.hostile = false;
    this.maxHp = this.hp = Math.round((kind === 'wolf' ? 16 : 10) * (1 + (rpg.level - 1) * 0.3));
    this.petDmg = (kind === 'wolf' ? 3 : 4) * (1 + (rpg.level - 1) * 0.1);
    this.shootCd = 1;
  }
  update(dt) {
    const g = this.game, p = this.owner;
    this.age += dt; this.attackCd -= dt; this.invuln -= dt; this.flash -= dt; this.shootCd -= dt;
    if (this.statusTick(dt)) { this.physics(dt); return; }
    if (p.dead) { this.dead = true; return; }
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    if (dist > 40) { this.x = p.x; this.y = p.y - 0.5; this.vx = this.vy = 0; }
    const foe = g.hostilesNear(this.x, this.cy, 11).sort((a, b) => Math.hypot(a.x - this.x, a.cy - this.cy) - Math.hypot(b.x - this.x, b.cy - this.cy))[0];
    let tx = p.x - p.facing * 1.5;
    if (foe) {
      tx = this.pet === 'imp' ? foe.x - Math.sign(foe.x - this.x || 1) * 5 : foe.x;
      if (this.pet === 'imp' && this.shootCd <= 0 && Math.abs(foe.x - this.x) < 11) {
        this.shootCd = 1.6;
        const a = Math.atan2(foe.cy - this.cy, foe.x - this.x);
        g.entities.push(new SpellBolt(g, this.x, this.cy - 0.2, Math.cos(a) * 22, Math.sin(a) * 22, this, { dmg: this.petDmg * 1.3, fx: 'fire', burn: 2 }));
      }
      if (this.pet === 'wolf' && this.attackCd <= 0 && Math.abs(foe.x - this.x) < (foe.w + this.w) / 2 + 0.3 && Math.abs(foe.cy - this.cy) < 1.5) {
        this.attackCd = 0.9;
        foe.hurt(Math.round(this.petDmg), Math.sign(foe.x - this.x) * 4, -3, this);
      }
    }
    const dx = tx - this.x;
    const want = Math.abs(dx) > 0.8 ? Math.sign(dx) : 0;
    const speed = dist > 8 ? 9 : 6.5;
    this.vx += (want * speed - this.vx) * Math.min(1, dt * 8);
    if (want) this.facing = want;
    if (this.hitWall && this.onGround) this.vy = -13.5;
    if (this.onGround && p.y < this.y - 2.5 && Math.abs(p.x - this.x) < 3) this.vy = -13.5;
    this.physics(dt);
    if (Math.abs(this.vx) > 0.1) this.anim += Math.abs(this.vx) * dt;
  }
  die() {
    this.dead = true;
    this.game.fx.poof(this.x, this.cy, this.w, this.h);
    this.game.msg(this.pet === 'wolf' ? '你的狼伙伴倒下了。' : '你的小鬼被击败了。', '#f99');
  }
  save() { return null; }
}

export class Totem extends Entity {
  constructor(game, x, y, owner, rpg) {
    super(game, x, y, 0.7, 1.6);
    this.type = 'totem'; this.pet = 'totem'; this.owner = owner; this.life = 20; this.cd = 0.5;
    this.dmg = 3 * (1 + (rpg.level - 1) * 0.1) + rpg.weaponStats().spell * 0.5;
  }
  update(dt) {
    const g = this.game;
    this.life -= dt; this.cd -= dt;
    if (this.life <= 0) { this.dead = true; g.fx.poof(this.x, this.cy, 0.6, 1.4); return; }
    this.physics(dt);
    if (this.cd <= 0) {
      const foe = g.hostilesNear(this.x, this.cy, 10)[0];
      if (foe) {
        this.cd = 1.1;
        const a = Math.atan2(foe.cy - (this.y - 1.4), foe.x - this.x);
        g.entities.push(new SpellBolt(g, this.x, this.y - 1.4, Math.cos(a) * 24, Math.sin(a) * 24, this.owner, { dmg: this.dmg, fx: 'fire', burn: 1 }));
      }
    }
  }
}
