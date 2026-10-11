// 生物:被动动物、敌对怪物、宠物基础。立场 side:A = 玩家一方(玩家/宠物/友方 NPC),B = 敌对,N = 中立动物。
// 等级随区域缩放生命与伤害;支持昏迷、减速、定身、恐惧与持续伤害。
import { Entity } from './entities.js';
import { BLOCKS, B } from './blocks.js';

export const MOBS = {
  zombie: { name: '天灾僵尸', hp: 20, w: 0.85, h: 2.6, speed: 3.3, dmg: 3, hostile: true, burn: true, undead: true, drops: [['rotten_flesh', 0, 2], ['coin_copper', 0, 6]] },
  skeleton: { name: '骷髅射手', hp: 20, w: 0.8, h: 2.6, speed: 3.4, dmg: 2, hostile: true, burn: true, ranged: true, undead: true, drops: [['bone', 0, 2], ['arrow', 0, 2], ['coin_copper', 0, 6]] },
  creeper: { name: '苦力怕', hp: 20, w: 0.85, h: 2.6, speed: 3.0, dmg: 0, hostile: true, drops: [['gunpowder', 0, 2]] },
  spider: { name: '洞穴蛛', hp: 16, w: 1.7, h: 0.9, speed: 4.6, dmg: 2, hostile: true, climb: true, neutralDay: true, beast: true, drops: [['string', 0, 2]] },
  slime: { name: '史莱姆', hp: 12, w: 1.15, h: 0.95, speed: 4.2, dmg: 2, hostile: true, hop: true, drops: [['gel', 1, 3]] },
  lava_slime: { name: '熔岩史莱姆', hp: 18, w: 1.15, h: 0.95, speed: 4.8, dmg: 4, hostile: true, hop: true, fire: true, fireImmune: true, drops: [['gel', 1, 3]] },
  demon_eye: { name: '恶魔眼', hp: 14, w: 1.0, h: 0.8, speed: 7, dmg: 3, hostile: true, fly: true, drops: [['lens', 0, 1]] },
  bat: { name: '洞穴蝙蝠', hp: 6, w: 0.9, h: 0.6, speed: 6, dmg: 1, hostile: true, fly: true, erratic: true, beast: true, drops: [] },
  pig: { name: '猪', hp: 10, w: 1.3, h: 0.95, speed: 2.2, beast: true, drops: [['raw_pork', 1, 3]] },
  cow: { name: '牛', hp: 10, w: 1.5, h: 1.3, speed: 2.0, beast: true, drops: [['raw_beef', 1, 3], ['leather', 0, 2]] },
  sheep: { name: '羊', hp: 8, w: 1.3, h: 1.1, speed: 2.1, beast: true, drops: [['raw_mutton', 1, 2]] },
  chicken: { name: '鸡', hp: 4, w: 0.7, h: 0.9, speed: 2.0, beast: true, drops: [['raw_chicken', 1, 1], ['feather', 0, 2]], flutter: true },
  wolf: { name: '狼伙伴', hp: 16, w: 1.3, h: 1.0, speed: 6.5, dmg: 3, drops: [] },
  imp: { name: '小鬼', hp: 10, w: 0.8, h: 1.3, speed: 6, dmg: 2, drops: [] },
};

export class Mob extends Entity {
  constructor(game, kind, x, y, level = 1, def = null) {
    const d = def || MOBS[kind];
    super(game, x, y, d.w, d.h);
    this.type = 'mob'; this.kind = kind; this.def = d;
    this.level = Math.max(1, level | 0);
    const hpK = 1 + (this.level - 1) * 0.3, dmgK = 1 + (this.level - 1) * 0.15;
    this.maxHp = this.hp = Math.round(d.hp * hpK);
    this.dmg = (d.dmg || 0) * dmgK;
    this.hostile = !!d.hostile; this.side = d.hostile ? 'B' : 'N';
    this.stepUp = !d.fly && !d.hop; this.dir = Math.random() < 0.5 ? -1 : 1; this.facing = this.dir;
    this.think = 0; this.walking = false; this.attackCd = 0; this.invuln = 0; this.flash = 0; this.panic = 0;
    this.fuse = 0; this.shootCd = 1.5 + Math.random(); this.hopCd = 1 + Math.random(); this.anim = 0;
    this.fireT = 0; this.provoked = 0; this.eggT = 200 + Math.random() * 300; this.sheared = false; this.regrow = 0;
    this.stunT = 0; this.slowT = 0; this.rootT = 0; this.fearT = 0; this.dots = [];
    this.flying = !!d.fly;
    if (d.fly) { this.grav = 0; this.vx = (Math.random() - 0.5) * 2; }
    this.blood = false;
  }
  get displayName() { return this.def.name; }

  // 状态效果:返回 true 表示本帧由状态接管行动
  statusTick(dt) {
    const g = this.game;
    if (this.dots.length) {
      for (const d of this.dots) {
        d.acc = (d.acc || 0) + dt; d.t -= dt;
        if (d.acc >= 1) { d.acc -= 1; this.hurt(Math.max(1, Math.round(d.dps)), 0, 0, d.src, false, true); if (d.col && Math.random() < 0.8) g.fx.sparkle(this.x, this.cy, d.col); }
      }
      this.dots = this.dots.filter(d => d.t > 0);
      if (this.dead) return true;
    }
    this.stunT = Math.max(0, this.stunT - dt); this.slowT = Math.max(0, this.slowT - dt);
    this.rootT = Math.max(0, this.rootT - dt); this.fearT = Math.max(0, this.fearT - dt);
    if (this.stunT > 0) {
      this.vx *= Math.pow(0.02, dt);
      if (this.flying) this.vy *= Math.pow(0.05, dt);
      if (Math.random() < dt * 5) g.fx.add({ x: this.x + (Math.random() - 0.5) * 0.6, y: this.y - this.h - 0.2, vx: (Math.random() - 0.5) * 2, vy: -0.5, life: 0.5, color: [255, 240, 120], size: 2, grav: 0, kind: 'glow' });
      return true;
    }
    if (this.fearT > 0) {
      const p = g.player;
      const dir = Math.sign(this.x - p.x) || 1;
      this.vx += (dir * this.def.speed * 1.1 - this.vx) * Math.min(1, dt * 6);
      this.facing = dir;
      if (this.hitWall && this.onGround) this.vy = -13;
      if (this.flying) this.vy += (-3 - this.vy) * dt;
      return true;
    }
    return false;
  }
  speedK() { return this.slowT > 0 ? 0.5 : 1; }

  // 敌对生物的目标:最近的“玩家一方”实体(潜行的玩家只在贴身时被发现)
  findTarget(range) {
    const g = this.game, p = g.player;
    let best = null, bd = range;
    for (const e of g.alliesOfPlayer()) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (e === p) {
        if (p.creative || p.dead) continue;
        if (p.rpg?.buffs.stealth && d > 1.8) continue;
      }
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  update(dt) {
    const g = this.game, p = g.player, d = this.def;
    this.age += dt; this.attackCd -= dt; this.invuln -= dt; this.flash -= dt; this.panic -= dt; this.provoked -= dt;
    const pd = p ? Math.hypot(p.x - this.x, p.y - this.y) : 999;
    if (this.hostile && !this.campKey && (pd > 90 || (pd > 44 && Math.random() < dt / 30))) { this.dead = true; this.despawned = true; return; }
    if (this.hostile && g.difficulty === 0) { this.dead = true; this.despawned = true; return; }
    const day = g.clock.sunFactor() > 0.5;
    let target = this.hostile ? this.findTarget(this.blood ? 40 : 28) : null;
    if (target && d.neutralDay && day && this.provoked <= 0 && g.light.at(this.x, this.y - 0.5) > 0.5) target = null;

    if (!this.statusTick(dt)) {
      if (d.fly) this.flyAI(dt, target);
      else if (d.hop) this.hopAI(dt, target);
      else this.walkAI(dt, target);
      if (this.rootT > 0) { this.vx = 0; if (this.flying) this.vy = 0; }
    }
    if (this.dead) return;
    this.physics(dt);
    if (this.inWater && !d.fly) { this.vy = Math.max(this.vy - 40 * dt, -4); }
    if (Math.abs(this.vx) > 0.1) this.anim += Math.abs(this.vx) * dt;

    // 接触伤害
    if (target && this.dmg && this.attackCd <= 0 && !d.ranged && this.kind !== 'creeper' && this.stunT <= 0 && this.fearT <= 0) this.tryMelee(target, 0.1);
    // 阳光灼烧
    if (d.burn && day && g.clock.weather === 'clear' && !this.inWater && this.age > 1) {
      if (g.world.skyAt(Math.floor(this.x), Math.floor(this.y - this.h + 0.2))) this.fireT = Math.max(this.fireT, 1.2);
    }
    this.envTick(dt);
    if (this.kind === 'chicken') { this.eggT -= dt; if (this.eggT <= 0) { this.eggT = 300 + Math.random() * 300; g.dropItem(this.x, this.y - 0.3, 'egg', 1); g.sfx('pop', this.x, this.y); } }
    if (this.kind === 'sheep' && this.sheared) { this.regrow -= dt; if (this.regrow <= 0) this.sheared = false; }
  }
  envTick(dt) {
    const g = this.game, d = this.def;
    if (this.inLava && !d.fireImmune) { this.fireT = 5; if (this.invuln <= 0) this.hurt(Math.max(4, Math.round(this.maxHp * 0.15)), 0, -2, null); }
    if (this.fireT > 0 && !d.fireImmune) {
      this.fireT -= dt;
      if (this.inWater) this.fireT = 0;
      if ((this.fireT * 1.2 | 0) !== ((this.fireT + dt) * 1.2 | 0)) this.hurt(Math.max(1, Math.round(this.maxHp * 0.05)), 0, 0, null, false, true);
      if (Math.random() < dt * 14) g.fx.flame(this.x + (Math.random() - 0.5) * this.w, this.y - Math.random() * this.h);
    }
    if (this.y > 760) this.dead = true;
  }
  tryMelee(t, pad) {
    if (Math.abs(t.x - this.x) < (t.w + this.w) / 2 + pad && t.y > this.y - this.h - 0.1 && t.y - t.h < this.y + 0.1) {
      const dmg = this.dmg * (this.blood ? 1.5 : 1);
      const kx = Math.sign(t.x - this.x || 1) * 7;
      if (t.type === 'player') t.hurt(dmg, kx, -6, this, 'mob'); else t.hurt(Math.max(1, Math.round(dmg)), kx * 0.6, -4, this);
      if (this.def.fire && t.type === 'player') t.fireT = Math.max(t.fireT, 3);
      this.attackCd = 0.8;
      return true;
    }
    return false;
  }

  walkAI(dt, target) {
    const g = this.game, w = g.world, d = this.def;
    let want = 0, speed = d.speed * this.speedK();
    if (target) {
      const dx = target.x - this.x;
      const td = Math.hypot(dx, target.y - this.y);
      if (d.ranged) {
        const dist = Math.abs(dx);
        want = dist < 6 ? -Math.sign(dx) : dist > 13 ? Math.sign(dx) : 0;
        this.facing = Math.sign(dx) || 1;
        this.shootCd -= dt;
        if (this.shootCd <= 0 && td < 22) { this.shootCd = 2 + Math.random() * 0.8; this.shoot(target); }
      } else if (this.kind === 'creeper') {
        const dist = Math.hypot(dx, target.cy - this.cy);
        if (dist < 2.6) { this.fuse += dt; want = 0; if (this.fuse > 0.05 && this.fuse - dt <= 0.05) g.sfx('fuse', this.x, this.y); }
        else { this.fuse = Math.max(0, this.fuse - dt * 0.7); want = Math.sign(dx); }
        if (this.fuse >= 1.5) { this.dead = true; g.explode(this.x, this.y - 1.2, (this.blood ? 3.8 : 3.2), this, this.level); return; }
      } else want = Math.abs(dx) > 0.3 ? Math.sign(dx) : 0;
      if (this.blood) speed *= 1.25;
    } else {
      if (this.kind === 'creeper') this.fuse = Math.max(0, this.fuse - dt);
      this.think -= dt;
      if (this.panic > 0) { want = this.dir; speed *= 2.2; }
      else {
        if (this.think <= 0) { this.think = 1.5 + Math.random() * 4; this.walking = Math.random() < 0.55; this.dir = Math.random() < 0.5 ? -1 : 1; }
        want = this.walking ? this.dir : 0;
      }
      if (want && this.onGround && !this.hostile) {
        const ax = Math.floor(this.x + want * (this.w / 2 + 0.3));
        let drop = 0;
        for (let k = 0; k < 4; k++) if (!w.solidSafe(ax, Math.floor(this.y) + k)) drop++; else break;
        if (drop >= 3 || w.fluid(ax, Math.floor(this.y))) { this.dir = -this.dir; want = 0; this.think = 0.5; }
      }
    }
    if (want) this.facing = want;
    const acc = this.onGround ? 30 : 12;
    this.vx += (want * speed - this.vx) * Math.min(1, acc * dt / Math.max(1, speed));
    if (this.hitWall && want) {
      if (d.climb) this.vy = -5;
      else if (this.onGround) this.vy = -13.5;
    }
    if (target && this.onGround && target.y < this.y - 2.5 && Math.abs(target.x - this.x) < 3 && Math.random() < dt * 2) this.vy = -13.5;
    if (this.kind === 'chicken' && !this.onGround && this.vy > 2) this.vy = 2;
  }

  hopAI(dt, target) {
    const d = this.def;
    if (this.onGround) {
      this.vx *= Math.pow(0.001, dt);
      this.hopCd -= dt;
      if (this.hopCd <= 0) {
        this.hopCd = target ? 0.8 + Math.random() * 0.7 : 2 + Math.random() * 3;
        const dir = target ? Math.sign(target.x - this.x) || 1 : Math.random() < 0.5 ? -1 : 1;
        this.facing = dir;
        const big = target && Math.random() < 0.4;
        this.vy = big ? -16 : -10.5; this.vx = dir * d.speed * (big ? 0.8 : 1) * this.speedK();
      }
    } else if (this.hitWall) this.vx = -this.vx * 0.5;
  }

  flyAI(dt, target) {
    const g = this.game, d = this.def;
    const pd = target ? Math.hypot(target.x - this.x, target.y - this.y) : 99;
    let ax = 0, ay = 0;
    if (d.erratic) {
      this.think -= dt;
      if (this.think <= 0) { this.think = 0.3 + Math.random() * 0.8; this.wx = (Math.random() - 0.5) * 2; this.wy = (Math.random() - 0.5) * 2; }
      ax = this.wx * 14; ay = this.wy * 14;
      if (target && pd < 14) { ax += Math.sign(target.x - this.x) * 8; ay += Math.sign(target.cy - this.cy) * 8; }
    } else if (target) {
      const dx = target.x - this.x, dy = target.cy - this.cy, dl = Math.hypot(dx, dy) || 1;
      ax = dx / dl * 9; ay = dy / dl * 9;
      if (g.clock.sunFactor() > 0.6) { ay = -10; ax = Math.sign(this.vx || 1) * 6; }
    } else { ax = Math.sign(this.vx || 1) * 4; ay = Math.sin(this.age * 1.3) * 4; }
    this.vx += ax * dt; this.vy += ay * dt;
    const sp = Math.hypot(this.vx, this.vy), max = d.speed * (this.blood ? 1.3 : 1) * this.speedK();
    if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
    if (this.hitWall) this.vx = -this.vx * 0.8;
    if (this.bumped) { this.vy = Math.abs(this.vy) * 0.8; this.bumped = false; }
    if (this.onGround) this.vy = -Math.abs(this.vy) - 2;
    if (Math.abs(this.vx) > 0.2) this.facing = Math.sign(this.vx);
    if (this.kind === 'demon_eye' && g.clock.sunFactor() > 0.7 && Math.hypot(g.player.x - this.x, g.player.y - this.y) > 30) { this.dead = true; this.despawned = true; }
  }

  shoot(t, dmg) {
    const g = this.game;
    const sx = this.x, sy = this.y - this.h * 0.62;
    const tx = t.x + (t.vx || 0) * 0.3, ty = t.y - t.h * 0.55;
    const dx = tx - sx, dist = Math.abs(dx) || 1;
    const sp = 20, time = dist / (sp * 0.9);
    const vx = dx / time, vy = (ty - sy) / time - 0.5 * 26 * time;
    g.spawnArrow(sx + Math.sign(dx) * 0.5, sy, vx + (Math.random() - 0.5) * 1.5, vy + (Math.random() - 0.5) * 1.5, this, Math.max(2, Math.round(dmg ?? this.dmg * 1.3)));
    g.sfx('bow', this.x, this.y);
  }

  hurt(dmg, kx = 0, ky = 0, src = null, crit = false, ignoreInvuln = false) {
    const g = this.game;
    if (this.dead || (this.invuln > 0 && !ignoreInvuln)) return;
    this.hp -= dmg;
    if (!ignoreInvuln) this.invuln = 0.22;
    this.flash = 0.2;
    if ((kx || ky) && !this.def.heavy) { this.vx = kx * (this.def.fly ? 0.8 : 1); this.vy = ky; }
    g.fx.text(this.x, this.y - this.h - 0.2, String(dmg), crit ? '#ffd040' : this.side === 'A' ? '#ff9090' : '#fff', crit);
    g.fx.blood(this.x, this.cy, this.kind);
    g.sfx(this.hostile || this.npc ? 'mobHurt' : 'animalHurt', this.x, this.y, this.kind);
    if (this.side === 'N') { this.panic = 4; this.dir = Math.sign(this.x - (src?.x ?? this.x - 1)) || 1; }
    const owner = src?.type === 'player' ? src : src?.owner?.type === 'player' ? src.owner : null;
    if (owner) { this.provoked = 10; this.lastHitBy = owner; g.lastTarget = this; g.lastTargetT = 6; }
    if (this.hp <= 0) this.die(src);
  }

  die(src) {
    const g = this.game;
    this.dead = true;
    for (const [id, a, b] of this.def.drops) {
      const n = a + Math.floor(Math.random() * (b - a + 1));
      if (n > 0) g.dropItem(this.x, this.y - this.h / 2, this.fireT > 0 && COOKED[id] ? COOKED[id] : id, n);
    }
    if (this.kind === 'sheep' && !this.sheared) g.dropItem(this.x, this.y - 0.5, 'wool', 1);
    g.fx.poof(this.x, this.cy, this.w, this.h);
    g.sfx('mobDie', this.x, this.y, this.kind);
    g.onKill?.(this, src);
  }

  save() { return { t: 'mob', kind: this.kind, x: this.x, y: this.y, hp: this.hp, sheared: this.sheared, level: this.level }; }
}
const COOKED = { raw_pork: 'cooked_pork', raw_beef: 'steak', raw_chicken: 'cooked_chicken', raw_mutton: 'cooked_mutton' };
