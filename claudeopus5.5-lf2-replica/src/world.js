// 战场:实体管理、命中结算(itr × bdy)、伤害/防御/冰火/倒地规则、抓取、镜头、空投道具。
// 规则按原版 v2.0a:fall 点数分档(≤20 轻受击 / ≤40 重受击 / ≤60 晕眩 / >60 倒地,进档时向上取整到 20 的倍数);
// 防御计数 ≤30 格挡(伤害 10%)、>30 破防,未防御挨打时计数置 45;bdefend>60 无视防御,100 连盔甲也无视;
// 命中硬直:攻击方 3、受击方 3、格挡方 5 TU。
import { W, HUD_H } from './config.js';
import { ST } from './frames.js';
import { Fighter } from './fighter.js';
import { Item, Proj, DROP_TABLE, PROJ } from './objects.js';
import { Fx } from './fx.js';
import { clamp, sign, rnd, pick, rndInt } from './util.js';
import audio from './audio.js';

const boxHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// 盔甲阈值:防御计数不超过该值时才生效
const ARMOR_TH = { 1: 1, 2: 15 };

export class World {
  constructor(bg, o = {}) {
    this.bg = bg;
    this.entities = [];
    this.tick = 0;
    this.camX = o.camX ?? 0;
    this.camShake = 0;
    this.fx = new Fx(this);
    this.mpRate = 1;
    this.dropItems = o.dropItems ?? true;
    this.dropTimer = 150;
    this.lock = null;           // 闯关:镜头/活动范围锁 {xMin,xMax}
    this.difficulty = o.difficulty ?? 1;
    this.listeners = { death: [] };
    this.silent = !!o.silent;
    this.unlimitedMp = false;
  }
  get fighters() { return this.entities.filter((e) => e.kind === 'char'); }

  bounds() {
    const b = this.bg;
    const xMin = this.lock ? this.lock.xMin : 0;
    const xMax = this.lock ? this.lock.xMax : b.width;
    return { xMin: xMin + 8, xMax: xMax - 8, zMin: b.zMin, zMax: b.zMax };
  }

  addFighter(def, o) { const f = new Fighter(this, def, o); this.entities.push(f); return f; }
  addItem(id, o) { const it = new Item(this, id, o); this.entities.push(it); return it; }
  addProj(id, owner, o) { const p = new Proj(this, id, owner, o); this.entities.push(p); return p; }

  spawnOpoint(owner, op) {
    const n = op.count || 1;
    for (let i = 0; i < n; i++) {
      const fz = op.facing === -1 ? -owner.facing : owner.facing;
      const dz = owner.ctrl ? owner.ctrl.dirZ() : 0;
      const zOff = (op.spreadZ ? (i - (n - 1) / 2) * op.spreadZ : 0);
      const o = {
        x: owner.x + (op.x || 0) * owner.facing + (op.spreadX ? i * op.spreadX * owner.facing : 0),
        y: owner.y + (op.y ?? -40),
        z: owner.z + zOff + (op.z || 0),
        facing: fz,
        data: op.data,
        scale: op.scale,
      };
      if (op.dvx !== undefined) o.vx = op.dvx * fz;
      if (op.dvy !== undefined) o.vy = op.dvy + (op.spreadY ? (i - (n - 1) / 2) * op.spreadY : 0);
      if (op.dvz !== undefined || op.zFromInput) o.vz = (op.dvz || 0) + (op.zFromInput ? dz * op.zFromInput : 0);
      if (op.life) o.life = op.life;
      if (op.item) { this.addItem(op.item, { x: o.x, y: o.y, z: o.z }); continue; }
      const p = this.addProj(op.oid, owner, o);
      if (op.delay || op.delayStep) p.t = -((op.delay || 0) + (op.delayStep || 0) * i);
    }
  }

  sfx(name, ent, vol = 1) {
    if (this.silent) return;
    const pan = ent ? clamp(((ent.x - this.camX) / W) * 2 - 1, -1, 1) * 0.6 : 0;
    audio.sfx(name, { vol, pan });
  }
  shakeCam(n) { this.camShake = Math.max(this.camShake, n); }

  findPickable(f) {
    let best = null, bd = 1e9;
    for (const e of this.entities) {
      if (e.kind !== 'item' || e.state !== 'ground' || e.removed) continue;
      const dx = (e.x - f.x) * f.facing, dz = Math.abs(e.z - f.z);
      if (dx > -14 && dx < 34 && dz < 14) { const d = Math.abs(dx) + dz; if (d < bd) { bd = d; best = e; } }
    }
    return best;
  }
  // 前方的晕眩敌人(重拳判定时也包括破防中的敌人)
  findDizzyFront(f, range, inclBroken = false) {
    for (const e of this.entities) {
      if (e.kind !== 'char' || e === f || e.team === f.team || e.removed || e.dead) continue;
      if (!(e.state === ST.DIZZY || (inclBroken && e.state === ST.BROKEN)) || e.caughtBy) continue;
      const dx = (e.x - f.x) * f.facing;
      if (dx > -4 && dx < range && Math.abs(e.z - f.z) < 14) return e;
    }
    return null;
  }
  nearestEnemy(src, range = 9999, opts = {}) {
    let best = null, bd = range;
    for (const e of this.entities) {
      if (e.kind !== 'char' || e.removed || e.dead || e.team === src.team) continue;
      if (opts.notLying && e.state === ST.LYING) continue;
      const d = Math.abs(e.x - src.x) + Math.abs(e.z - src.z) * 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  alliesOf(f) { return this.entities.filter((e) => e.kind === 'char' && e.team === f.team && !e.dead && !e.removed); }
  enemiesOf(f) { return this.entities.filter((e) => e.kind === 'char' && e.team !== f.team && !e.dead && !e.removed); }

  // ---------------------------------------------------------------- 主循环
  step() {
    this.tick++;
    const ents = this.entities;
    for (const e of ents) if (e.kind === 'char' && e.ai && !e.dead) e.ai.think(this);
    for (const e of ents) if (e.kind === 'char' && e.ctrl && e.ctrlFeed) e.ctrlFeed();
    for (const e of ents) if (!e.removed) e.update();
    if (this.unlimitedMp) for (const e of ents) if (e.kind === 'char') e.mp = e.maxMp;
    this.interact();
    this.catchCheck();
    for (let i = ents.length - 1; i >= 0; i--) if (ents[i].removed) { const e = ents[i]; ents.splice(i, 1); if (e.kind === 'char' && e.holding) e.holding.holder = null; }
    this.fx.update();
    this.updateCamera();
    if (this.dropItems) this.dropLoop();
    if (this.camShake > 0) this.camShake--;
  }

  // 空投:场上(含手持)武器少于 4 件时,隔一段时间从天而降
  dropLoop() {
    if (--this.dropTimer > 0) return;
    this.dropTimer = rndInt(90, 300);
    const items = this.entities.filter((e) => e.kind === 'item').length;
    if (items >= 4) return;
    this.dropRandom();
  }
  dropRandom(id) {
    const b = this.bounds();
    const x = clamp(this.camX + rndInt(80, W - 80), b.xMin + 20, b.xMax - 20);
    const z = rndInt(b.zMin + 8, b.zMax - 8);
    return this.addItem(id || pick(DROP_TABLE), { x, y: -500, z });
  }

  updateCamera() {
    const b = this.bg;
    const fs = this.fighters.filter((f) => !f.dead);
    let focus = fs.filter((f) => f.human);
    if (!focus.length) focus = fs;
    if (!focus.length) return;
    let sx = 0;
    for (const f of focus) sx += f.x;
    let target = sx / focus.length - W / 2;
    const lo = this.lock ? this.lock.xMin : 0, hi = (this.lock ? this.lock.xMax : b.width) - W;
    target = clamp(target, lo, Math.max(lo, hi));
    this.camX += clamp((target - this.camX) * 0.12, -24, 24);
    this.camX = clamp(this.camX, 0, Math.max(0, b.width - W));
  }

  // ---------------------------------------------------------------- 碰撞框
  fBdy(f) {
    if (f.dead || f.invuln > 0 || f.removed) return null;
    if (f.hp <= 0 && (f.state === ST.FALLING || f.state === ST.BURNING)) return null; // 已被击倒致死:落地前不再被追打
    if (f.state === ST.LYING) return null;
    const g = f.def.geo[f.frameId];
    if (!g || !g.bdy) return null;
    const b = g.bdy;
    return { x: f.x + (f.facing > 0 ? b.x : -b.x - b.w), y: f.y + b.y, w: b.w, h: b.h };
  }
  fItrs(f) {
    if (f.dead || f.caughtBy) return null;
    const g = f.def.geo[f.frameId];
    const out = [];
    if (g && g.itrs.length) {
      for (const it of g.itrs) {
        const b = it.box;
        out.push({ box: { x: f.x + (f.facing > 0 ? b.x : -b.x - b.w), y: f.y + b.y, w: b.w, h: b.h }, z: f.z, itr: it.itr });
      }
    }
    // 手持轻武器:按武器强度表(normal/jump/run/dash)
    if (f.fr.witr && f.holding && f.holding.def.atk) {
      const a = f.holding.def.atk[f.fr.witr] || f.holding.def.atk.normal;
      const reach = (f.holding.def.reach || 20) + 12;
      const hb = g?.handF || [16, -40];
      const bx = { x: Math.min(hb[0] - 6, 0), y: hb[1] - 26, w: Math.max(reach + hb[0], 30), h: 46 };
      out.push({ box: { x: f.x + (f.facing > 0 ? bx.x : -bx.x - bx.w), y: f.y + bx.y, w: bx.w, h: bx.h }, z: f.z, itr: { kind: 0, ...a, sound: f.holding.def.sound, weapon: f.holding } });
    }
    // 被摔飞的身体会砸到任何人(原版 itr kind 4)
    if (f.thrownBy && f.state === ST.FALLING) {
      out.push({ box: { x: f.x - 20, y: f.y - 50, w: 40, h: 50 }, z: f.z, itr: { kind: 0, dvx: 2, fall: 70, vrest: 20, bdefend: 10, injury: 30, anyTeam: true, notThrower: true } });
    }
    return out.length ? out : null;
  }
  itrsOf(e) { return e.kind === 'char' ? this.fItrs(e) : e.getItrs(); }
  bdyOf(e) { return e.kind === 'char' ? this.fBdy(e) : e.getBdy(); }

  interact() {
    const ents = this.entities;
    for (const a of ents) {
      if (a.removed || (a.kind === 'char' && (a.hitStop > 0 || a.arest > 0))) continue;
      const itrs = this.itrsOf(a);
      if (!itrs) continue;
      for (const v of ents) {
        if (v === a || v.removed) continue;
        if (a.hitSet.has(v.uid)) continue;
        if (v.vrest && v.vrest.has(a.uid)) continue;
        const vb = this.bdyOf(v);
        if (!vb) continue;
        for (const h of itrs) {
          if (Math.abs(h.z - v.z) > (h.itr.zw ?? 14)) continue;
          if (!boxHit(h.box, vb)) continue;
          if (this.resolve(a, v, h.itr, h.box, vb)) break;
        }
        if (a.removed || (a.kind === 'proj' && a.state !== 'fly')) break;
      }
    }
  }

  // 返回 true 表示本次 itr 已作用
  resolve(a, v, itr, ab, vb) {
    const kind = itr.kind || 0;
    const sameTeam = a.team === v.team && a.team !== -1;
    // 治疗(原版:每 8 TU 回 8,持续约 100 TU,只回到暗红上限)
    if (kind === 8) {
      if ((!sameTeam && !itr.anyTeam) || v.kind !== 'char' || v.dead) return false;
      a.hitSet.add(v.uid);
      v.vrest.set(a.uid, itr.vrest ?? 20);
      v.healT = Math.max(v.healT, 104);
      this.fx.sparkle(v.x, v.y - 50, v.z, '#a0ffa0');
      this.sfx('heal', v, 0.5);
      if (a.kind === 'proj' && !a.def.pierce) a.explode();
      return true;
    }
    if (itr.notThrower && v === a.thrownBy) return false;
    // 冰冻的同伴也能被打(碎冰)
    const frozenMate = sameTeam && v.kind === 'char' && v.state === ST.FROZEN && a.kind === 'char';
    if (sameTeam && !itr.anyTeam && !frozenMate) return false;
    if (itr.caughtHit && v.caughtBy !== a) return false;
    if (!itr.caughtHit && v.kind === 'char' && v.caughtBy === a) return false;

    // ---- 对飞行道具
    if (v.kind === 'proj') {
      if (sameTeam) return false;
      if (a.kind === 'proj') {
        if (!a.def.clash || !v.def.clash) return false;
        a.hitSet.add(v.uid); v.hitSet.add(a.uid);
        const pa = a.def.power, pv = v.def.power;
        if (pa <= pv) a.explode();
        if (pv <= pa) v.explode();
        this.fx.spark(v.x, v.y, v.z, 'blast');
        this.sfx('ball_hit', v);
        return true;
      }
      if (a.kind === 'char' || a.kind === 'item') {
        a.hitSet.add(v.uid);
        if (v.def.reflect && a.kind === 'char') {
          v.rebound(a); this.fx.spark(v.x, v.y, v.z, 'hit'); a.hitStop = 2;
          if (a.def.reboundAs && PROJ[a.def.reboundAs]) { v.def = PROJ[a.def.reboundAs]; v.id = a.def.reboundAs; v.vx = Math.sign(v.vx) * v.def.speed; }
        } else if (v.def.clash && v.def.power <= 1) v.explode();
        return true;
      }
      return false;
    }
    // ---- 对地上 / 空中的物品:击飞
    if (v.kind === 'item') {
      if (a.kind === 'proj' || a === v.thrower || v.state === 'held') return false;
      a.hitSet.add(v.uid);
      const dir = this.hitDir(a, v);
      if ((itr.fall ?? 20) >= 70 || v.def.wtype !== 'heavy') {
        v.vx = dir * (Math.abs(itr.dvx || 4) + 4);
        v.vy = -6 - rnd() * 3;
        v.state = 'air';
        v.spin = 0.4 * dir;
      }
      v.hp -= (itr.bdefend ?? 0) >= 100 ? 9999 : (itr.injury || 10) * 0.5;
      this.sfx('item_drop', v, 0.6);
      return true;
    }
    if (v.kind !== 'char' || v.dead) return false;
    if (itr.notBurning && v.state === ST.BURNING) return false;

    // ---- 抓取类
    if (kind === 1 || kind === 3) {
      if (a.kind !== 'char' || v.caughtBy || v.catching) return false;
      if (kind === 1 && v.state !== ST.DIZZY) return false;
      if (v.state === ST.FALLING || v.state === ST.LYING) return false;
      a.hitSet.add(v.uid);
      if (itr.catchTo !== undefined) { // 招式抓取(如回旋摔)
        a.catching = v; v.caughtBy = a; v.setFrame(130, { silent: true });
        v.dropWeapon();
        a.catchTimer = 999;
        a.setFrame(itr.catchTo);
      } else a.startCatch(v);
      return true;
    }
    // ---- 旋风(卷起)/ 冰旋风 / 魔笛
    if (kind === 15 || kind === 16) {
      a.hitSet.add(v.uid);
      v.vrest.set(a.uid, itr.vrest ?? 6);
      if (kind === 16 && v.state !== ST.FROZEN && rnd() < 0.35) { this.damage(v, a, { ...itr, effect: 3, injury: 20 }); return true; }
      v.vy = Math.min(v.vy, -(itr.lift ?? 6)); v.y = Math.min(v.y, -2);
      v.vx = (a.x - v.x) * 0.08;
      if (v.state !== ST.FALLING) { v.dropWeapon(); v.setFrame(180, { silent: true }); }
      v.noRow = true;
      v.wait = 99;
      v.hp = Math.max(0, v.hp - (itr.injury || 2)); v.darkHp -= (itr.injury || 2) / 3;
      return true;
    }
    // ---- 倒地中的身体只会被 fall>40 的攻击打中
    if ((v.state === ST.FALLING || v.state === ST.BURNING) && (itr.fall ?? 20) <= 40) return false;
    // ---- 盾牌反弹:防御中的持盾角色正面挡下飞行道具时将其反弹
    if (a.kind === 'proj' && v.def.shield && (v.state === ST.DEFEND || v.fr.defendState) && this.hitDir(a, v) === -v.facing && a.def.reflect !== false && (itr.bdefend ?? 0) <= 60) {
      a.hitSet.add(v.uid); a.rebound(v); this.fx.spark(a.x, a.y, a.z, 'block'); this.sfx('block', v);
      return true;
    }
    // ---- 普通伤害
    a.hitSet.add(v.uid);
    v.vrest.set(a.uid, itr.vrest ?? (a.kind === 'proj' && a.def.pierce ? 10 : 7));
    const res = this.damage(v, a, itr);
    if (a.kind === 'char') {
      a.arest = itr.arest ?? 0;
      a.hitStop = 3;
      if (itr.weapon) { itr.weapon.hp -= 15; if (itr.weapon.hp <= 0) { a.holding = null; itr.weapon.breakApart(); } }
      if (a.def.onHit) a.def.onHit(a, v, this);
    } else if (a.kind === 'proj') {
      a.hits++;
      if (a.def.onHit) a.def.onHit(a, v, this);
      if (!a.def.pierce || (a.def.maxHits && a.hits >= a.def.maxHits)) a.explode();
    } else if (a.kind === 'item') {
      a.hp -= 30;
      a.vx = -a.vx * 0.25; a.vy = -4; a.state = 'air';
      if (a.def.breakOnLand) a.breakApart();
    }
    void res;
    return true;
  }

  hitDir(a, v) {
    if (a.kind === 'char') return a.thrownBy ? (sign(a.vx) || a.facing) : a.facing;
    if (a.kind === 'proj') { if (a.def.radial) return sign(v.x - a.x) || 1; return sign(a.vx) || a.facing; }
    return sign(a.vx) || sign(v.x - a.x) || 1;
  }

  damage(v, a, itr, opt = {}) {
    const owner = a.kind === 'char' ? (a.thrownBy || a) : (a.owner || a.thrower || a);
    const dir = opt.dir ?? this.hitDir(a, v);
    const fromFront = dir === -v.facing;
    const effect = itr.effect || 0;
    const bdefend = itr.bdefend ?? 0;
    const scale = (owner && owner.dmgScale) || 1;
    let injury = Math.round((itr.injury || 0) * scale * (v.def.defenseK || 1) / (v.handicap || 1));
    const px = v.x - dir * 6, py = v.y - 48, pz = v.z;
    v.hurtT = 2;
    // ---- 防御(只挡正面;bdefend>60 无视防御)
    const defending = v.state === ST.DEFEND || v.fr.defendState;
    if (!itr.noReact && defending && (fromFront || (itr.dvx || 0) < 0) && bdefend <= 60) {
      v.bdef += bdefend;
      if (v.bdef <= 30 || v.fr.defendState) {
        injury = Math.floor(injury * 0.1);
        v.hp = Math.max(0, v.hp - injury); v.darkHp -= injury / 3;
        v.stats.hpLost += injury;
        if (owner && owner.stats) owner.stats.attack += injury;
        v.vx = dir * Math.max(0, (itr.dvx || 2) - 1) * 0.6;
        if (!v.fr.defendState) v.setFrame(111);
        this.sfx('block', v); this.fx.spark(px, py, pz, 'block');
        v.hitStop = 5;
        if (v.hp <= 0) this.knockDown(v, dir, true, -6, itr);
        return 'blocked';
      }
      // 计数超过 30:破防(仍承受本次伤害)
      this.sfx('break_defend', v); this.fx.spark(px, py, pz, 'break');
      v.bdef = 45;
      v.hp = Math.max(0, v.hp - injury); v.darkHp -= Math.floor(injury / 3);
      v.stats.hpLost += injury;
      if (owner && owner.stats) owner.stats.attack += injury;
      v.vx = dir * (itr.dvx || 2);
      v.hitStop = 3; v.shake = 4;
      if (v.hp <= 0 || v.y < -2) this.knockDown(v, dir, fromFront, itr.dvy ?? -6, itr); else v.setFrame(112);
      return 'broken';
    }
    // ---- 盔甲:防御计数不超过阈值时硬吃攻击不硬直
    const armored = !itr.noReact && v.hp > injury && this.armorAbsorbs(v, itr, effect, bdefend);
    v.hp -= injury;
    v.darkHp -= Math.floor(injury / 3);
    v.stats.hpLost += injury;
    if (owner && owner.stats && owner !== v) owner.stats.attack += injury;
    v.lastHitBy = owner;
    if (owner && owner.kind === 'char' && owner !== v) owner.lastEnemyDef = v.baseDef;
    if (v.catching) v.releaseCatch();
    if (!itr.noReact) {
      const snd = itr.sound || (effect === 1 ? 'hit_sharp' : effect === 2 ? 'burn' : effect === 3 ? 'freeze' : injury >= 35 ? 'hit_heavy' : 'hit_light');
      this.sfx(snd, v);
      this.fx.spark(px, py, pz, effect === 1 ? 'sharp' : effect === 2 ? 'fire' : effect === 3 ? 'ice' : injury >= 35 ? 'heavy' : 'hit');
      if (effect === 1) this.fx.blood(px, py, pz, dir);
      v.shake = 4; v.hitStop = 3;
    }
    if (v.caughtBy && v.caughtBy !== a && !itr.caughtHit) v.caughtBy.releaseCatch();
    if (v.hp <= 0) v.hp = 0;
    if (itr.noReact) return 'hit';
    if (itr.caughtHit && v.caughtBy) { v.setFrame(131); return 'hit'; }   // 抓打不改变 fall
    if (armored) { v.bdef += Math.max(bdefend, 16) * 2; return 'hit'; }
    v.bdef = 45;   // 未防御挨打:防御计数置 45

    if (v.heavy) v.dropWeapon();
    // ---- 冰冻
    if (effect === 3) {
      if (v.state === ST.FROZEN) { // 冰块被打碎
        this.sfx('shatter', v); this.fx.shards(v.x, v.z, '#bfeaff', v.y - 40);
        v.frozen = false;
        this.knockDown(v, dir, fromFront, itr.dvy ?? -8, itr);
        return 'hit';
      }
      v.frozen = true;
      v.dropWeapon();
      v.vx = dir * (itr.dvx || 2) * 0.5;
      if (v.y < -2) { v.setFrame(199); v.vy = Math.min(v.vy, itr.dvy || -2); } else { v.setFrame(200); v.vy = 0; }
      v.fall = 0;
      if (v.hp <= 0) { v.frozen = false; this.knockDown(v, dir, fromFront, -6, itr); }
      return 'hit';
    }
    if (v.state === ST.FROZEN) { // 冰冻中挨打:碎冰倒地
      this.sfx('shatter', v); this.fx.shards(v.x, v.z, '#bfeaff', v.y - 40);
      v.frozen = false;
      this.knockDown(v, dir, fromFront, itr.dvy ?? -7, itr);
      return 'hit';
    }
    // ---- 燃烧
    if (effect === 2) {
      v.vx = dir * Math.abs(itr.dvx || 6);
      v.vy = itr.dvy ?? -9;
      v.y = Math.min(v.y, -1);
      v.fall = 0;
      v.dropWeapon();
      v.setFrame(203);
      v.wait = 99;
      return 'hit';
    }
    // ---- fall 点数分档
    const fallAdd = itr.fall === undefined || itr.fall === 0 ? 20 : itr.fall;
    v.fall += fallAdd;
    v.vx = dir * Math.abs(itr.dvx || 0);
    const air = v.y < -2;
    if (v.fall > 60 || v.hp <= 0 || (air && v.fall > 20) || v.state === ST.FALLING) {
      this.knockDown(v, dir, fromFront, itr.dvy ?? (air ? -3 : -6.9), itr);
    } else {
      v.fall = Math.ceil(v.fall / 20) * 20;   // 进档时取整到 20 的倍数
      if (v.fall > 40) v.setFrame(226);
      else if (v.fall > 20 || air) v.setFrame(fromFront ? 222 : 224);
      else v.setFrame(220);
    }
    return 'hit';
  }

  // 盔甲:Gallant(1 级)防御计数 ≤1、Sentinel/Malakar(2 级)≤15 时生效;火冰与破甲技无效(魔铠可挡冰火)
  armorAbsorbs(v, itr, effect, bdefend) {
    const d = v.def;
    if (d.armor) return d.armor(v, itr);
    const lv = d.armorLevel || 0;
    if (!lv || itr.pierceArmor || bdefend >= 100) return false;
    if ((effect === 2 || effect === 3) && !d.armorFireIce) return false;
    const st = v.state;
    if ([ST.BROKEN, ST.INJURED, ST.FALLING, ST.FROZEN, ST.LYING, ST.DIZZY, ST.BURNING, ST.CAUGHT].includes(st)) return false;
    if (lv === 1 && !(v.frameId <= 19 || st === ST.JUMP || st === ST.DASH || st === ST.DEFEND)) return false;
    if (v.bdef > ARMOR_TH[lv]) return false;
    this.fx.spark(v.x, v.y - 50, v.z, 'block');
    return true;
  }

  knockDown(v, dir, fromFront, dvy, itr) {
    v.fall = 0;
    v.vx = dir * Math.max(Math.abs(itr?.dvx || 0), 3);
    v.vy = Math.min(dvy, -2);
    v.y = Math.min(v.y, -1);
    v.dropWeapon();
    v.noRow = false;
    if (v.catching) v.releaseCatch();
    v.setFrame(fromFront ? 180 : 186, { silent: true });
    v.wait = 99;
  }

  // 走路撞上晕眩的敌人 → 抓住(原版 itr kind 1 只在行走帧)
  catchCheck() {
    for (const f of this.entities) {
      if (f.kind !== 'char' || f.dead || f.catching || f.caughtBy) continue;
      if (f.def.fuse && f.state === ST.RUN && f.def.fuse(f, this)) continue;   // 冰火合体:残血同伴相撞
      if (f.state !== ST.WALK || f.heavy) continue;
      const v = this.findDizzyFront(f, 30);
      if (v && v.y > -2) f.startCatch(v);
    }
  }

  onDeath(f) {
    const k = f.lastHitBy;
    if (k && k !== f && k.stats) k.stats.kills++;
    for (const cb of this.listeners.death) cb(f);
    this.sfx('ko', f, 0.7);
  }
}

export { HUD_H };
