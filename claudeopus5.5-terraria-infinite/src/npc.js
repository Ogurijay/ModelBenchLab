// 阵营 NPC:与玩家同阵营者友好(任务官/商人/卫兵,卫兵会迎击敌人);敌对阵营者即为怪物(近战/射手/施法者/精英),掉落敌方徽记与装备。
import { Mob } from './mobs.js';
import { NPC_TYPES, RACES, FACTION_DROPS, HAIR_COLORS, randomName } from './wow.js';
import { SpellBolt } from './rpg.js';
import { mulberry32 } from './rng.js';

const H = { small: 2.0, stocky: 2.2, huge: 2.9 };
const Wd = { small: 0.75, huge: 1.0, broad: 0.95, stocky: 0.95 };

export class Npc extends Mob {
  constructor(game, typeId, x, y, level, o = {}) {
    const t = NPC_TYPES[typeId], race = RACES[t.race];
    const def = {
      name: t.name, hp: t.hp, w: Wd[race.body] || 0.85, h: H[race.body] || 2.6, speed: t.role === 'elite' ? 3.2 : 3.7,
      dmg: t.dmg, hostile: false, drops: [], ranged: t.role === 'ranged', heavy: t.role === 'elite',
    };
    super(game, typeId, x, y, level + (t.role === 'elite' ? 2 : 0), def);
    this.npc = true; this.typeId = typeId; this.t = t; this.faction = t.faction; this.role = t.role;
    this.friendly = t.faction === game.faction();
    this.side = this.friendly ? 'A' : 'B'; this.hostile = !this.friendly;
    this.home = o.home ?? x; this.campKey = o.campKey; this.slot = o.slot; this.patrol = !!o.patrol;
    const rnd = mulberry32(o.seed ?? (Math.random() * 1e9) | 0);
    this.personal = randomName(t.race, rnd);
    this.look = buildLook(t, race, rnd);
    this.castCd = 1 + rnd() * 1.5;
    this.talkT = 0;
  }
  get displayName() { return this.role === 'quest' || this.role === 'vendor' ? `${this.t.name} ${this.personal[0]}` : this.t.name; }

  update(dt) {
    const g = this.game;
    this.age += dt; this.attackCd -= dt; this.invuln -= dt; this.flash -= dt; this.castCd -= dt; this.provoked -= dt; this.talkT -= dt;
    if (this.patrol && Math.hypot(g.player.x - this.x, g.player.y - this.y) > 90) { this.dead = true; this.despawned = true; return; }
    if (!this.statusTick(dt)) { if (this.friendly) this.friendlyAI(dt); else this.hostileAI(dt); }
    if (this.rootT > 0) this.vx = 0;
    if (this.dead) return;
    this.physics(dt);
    if (this.inWater) this.vy = Math.max(this.vy - 40 * dt, -4);
    if (Math.abs(this.vx) > 0.1) this.anim += Math.abs(this.vx) * dt;
    this.envTick(dt);
  }

  combatRole() { return this.role === 'quest' || this.role === 'vendor' ? 'guard' : this.role; }

  engage(dt, target) {
    const g = this.game, role = this.combatRole();
    const dx = target.x - this.x, dist = Math.abs(dx);
    let want = 0;
    if (role === 'ranged' || role === 'caster') {
      want = dist < 5 ? -Math.sign(dx) : dist > 12 ? Math.sign(dx) : 0;
      this.facing = Math.sign(dx) || 1;
      if (this.castCd <= 0 && dist < 20) {
        if (role === 'ranged') { this.castCd = 1.8 + Math.random() * 0.6; this.shoot(target, this.dmg * 1.3); }
        else {
          this.castCd = 2.4 + Math.random() * 0.8;
          const a = Math.atan2(target.cy - this.cy, target.x - this.x), frost = this.t.spell === 'frostbolt';
          g.entities.push(new SpellBolt(g, this.x + Math.cos(a) * 0.6, this.cy - 0.3, Math.cos(a) * 20, Math.sin(a) * 20, this, { dmg: this.dmg * 1.5, fx: frost ? 'frost' : 'lightning', slow: frost ? 3 : 0 }));
          g.sfx('bow', this.x, this.y);
        }
      }
    } else {
      want = dist > 0.6 ? Math.sign(dx) : 0;
      if (this.attackCd <= 0 && this.tryMelee(target, 0.25)) { this.attackCd = this.role === 'elite' ? 1.2 : 0.9; if (this.role === 'elite' && target.type === 'player') { target.vx += Math.sign(dx) * 6; } }
    }
    this.move(dt, want, this.def.speed * this.speedK());
    if (this.onGround && target.y < this.y - 2.5 && dist < 3 && Math.random() < dt * 2) this.vy = -13.5;
  }
  move(dt, want, speed) {
    if (want) this.facing = want;
    const acc = this.onGround ? 30 : 12;
    this.vx += (want * speed - this.vx) * Math.min(1, acc * dt / Math.max(1, speed));
    if (this.hitWall && want && this.onGround) this.vy = -13.5;
  }
  wander(dt, range = 7) {
    this.think -= dt;
    if (this.think <= 0) { this.think = 2 + Math.random() * 4; this.walking = Math.random() < 0.45; this.dir = Math.random() < 0.5 ? -1 : 1; }
    let want = this.walking ? this.dir : 0;
    if (Math.abs(this.x - this.home) > range) want = Math.sign(this.home - this.x);
    this.move(dt, want, 2.2);
  }

  friendlyAI(dt) {
    const g = this.game, p = g.player;
    if (this.role !== 'quest' && this.role !== 'vendor') {
      const foe = g.hostilesNear(this.x, this.cy, 14).filter(e => Math.abs(e.x - this.home) < 30)[0];
      if (foe) { this.engage(dt, foe); return; }
    }
    if (this.role === 'quest' || this.role === 'vendor') {
      const pd = Math.hypot(p.x - this.x, p.y - this.y);
      if (pd < 4) { this.vx *= 0.8; this.facing = Math.sign(p.x - this.x) || 1; return; }
    }
    this.wander(dt, this.role === 'guard' ? 9 : 4);
  }
  hostileAI(dt) {
    let target = this.findTarget(22);
    if (target && this.campKey && Math.abs(this.x - this.home) > 36) target = null;
    if (target) { this.engage(dt, target); return; }
    const g = this.game;
    if (this.patrol) { const dx = g.player.x - this.x; this.move(dt, Math.abs(dx) > 6 ? Math.sign(dx) : 0, 2.6); return; }
    if (Math.abs(this.x - this.home) > 3 && Math.abs(this.x - this.home) > 8) { this.move(dt, Math.sign(this.home - this.x), 3); return; }
    this.wander(dt, 8);
  }

  die(src) {
    const g = this.game;
    this.dead = true;
    if (!this.friendly) {
      for (const [id, a, b, p] of FACTION_DROPS[this.faction]) if (Math.random() < p) g.dropItem(this.x, this.y - 1, id, a + Math.floor(Math.random() * (b - a + 1)));
      const copper = Math.round((20 + this.level * 12) * (this.role === 'elite' ? 3 : 1) * (0.6 + Math.random() * 0.8));
      if (copper >= 100) g.dropItem(this.x, this.y - 1, 'coin_silver', Math.floor(copper / 100));
      if (copper % 100) g.dropItem(this.x, this.y - 1, 'coin_copper', copper % 100);
    } else g.msg(`${this.displayName}倒下了……`, '#f99');
    g.fx.poof(this.x, this.cy, this.w, this.h);
    g.sfx('mobDie', this.x, this.y, 'zombie');
    g.onNpcDeath?.(this);
    g.onKill?.(this, src);
  }
  save() { return null; }
}

function buildLook(t, race, rnd) {
  const pick = a => a[(rnd() * a.length) | 0];
  const gender = t.race === 'tauren' || t.race === 'dwarf' ? (rnd() < 0.2 ? 'f' : 'm') : rnd() < 0.4 ? 'f' : 'm';
  const fighter = ['guard', 'elite', 'ranged'].includes(t.role);
  return {
    race: t.race, body: race.body, ears: race.ears, tusks: race.tusks, horns: race.horns, undead: race.undead, glowEyes: race.glowEyes, gender,
    skin: pick(race.skins), eye: pick(race.eyes), hair: pick(HAIR_COLORS.slice(0, 7)),
    hairStyle: race.undead ? pick([0, 1, 4]) : gender === 'f' ? pick([1, 2, 5, 9]) : pick([0, 3, 4, 6, 8]),
    beard: gender === 'm' ? (t.race === 'dwarf' ? 2 : rnd() < 0.3 ? 1 + ((rnd() * 3) | 0) : 0) : 0,
    shirt: t.outfit[0], pants: t.outfit[1], shoes: '#3a2a1a',
    tabard: fighter ? t.faction : null, armorTint: t.armor || null, helm: t.role === 'elite' ? t.armor : null,
  };
}
