// 角色实体:LF2 式状态机。每 TU:输入 → 帧计时 → 物理。交互(命中/抓取)在 world.js 统一结算。
// 规则取自原版 v2.0a:走路帧 4 TU、斜向移动 x 速度 ×5/7(跑步 ×5/6)、地面摩擦 1/TU、fall/bdefend 点数每 TU 衰减 1。
import { GRAVITY } from './config.js';
import { ST, END, DEL } from './frames.js';
import { clamp, approach, sign, rnd } from './util.js';

let UID = 1;
export const nextUid = () => UID++;

export class Fighter {
  constructor(world, def, o = {}) {
    this.uid = nextUid();
    this.kind = 'char';
    this.world = world;
    this.def = def;
    this.baseDef = def;
    this.x = o.x ?? 400; this.y = 0; this.z = o.z ?? 440;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.facing = o.facing ?? 1;
    this.team = o.team ?? 0;            // 结算用队伍号(独立玩家会被分配唯一号)
    this.teamShown = o.teamShown ?? 0;   // 显示用 0..4
    this.ctrl = o.ctrl;
    this.ai = o.ai || null;
    this.human = !!o.human;
    this.playerIdx = o.playerIdx ?? -1;
    this.name = o.name || def.name;
    this.maxHp = o.maxHp ?? def.hp ?? 500;
    this.hp = this.maxHp; this.darkHp = this.maxHp;
    this.maxMp = def.mp ?? 500;
    this.mp = o.mp ?? 200;
    this.fall = 0; this.bdef = 0; this.hurtT = 0;
    this.holding = null; this.catching = null; this.caughtBy = null;
    this.catchTimer = 0; this.catchPunches = 0;
    this.hitStop = 0; this.shake = 0;
    this.vrest = new Map();     // 攻击者 uid → 剩余 TU(该攻击者无法再命中我)
    this.arest = 0;             // 我命中后,自身攻击冷却
    this.hitSet = new Set();    // 本帧 itr 已命中的对象(每次进帧清空)
    this.invuln = o.invuln ?? 0;
    this.invisible = 0;
    this.healT = 0;
    this.dead = false; this.removed = false;
    this.deadTimer = 0;
    this.walkCount = 0;
    this.lastHitBy = null;
    this.punchAlt = 0;
    this.stats = { kills: 0, attack: 0, hpLost: 0, mpUsage: 0, picking: 0 };
    this.lastEnemyDef = null;
    this.setFrame(0);
  }

  get frame() { return this.fr; }
  get state() { return this.fr.state; }
  get alive() { return !this.dead && !this.removed; }
  get heavy() { return !!(this.holding && this.holding.def.wtype === 'heavy'); }

  // ---------------------------------------------------------------- 帧切换
  setFrame(id, opt = {}) {
    if (id === END) { this.toDefault(); return; }
    if (id === DEL) { this.removed = true; return; }
    if (id < 0) { id = -id; this.facing = -this.facing; }
    const fr = this.def.frames[id];
    if (!fr) { this.toDefault(); return; }
    this.frameId = id; this.fr = fr;
    this.wait = fr.wait;
    this.hitSet.clear();
    if (opt.silent) return;
    const w = this.world;
    if (fr.mp) { const c = Math.min(this.mp, fr.mp); this.mp -= c; this.stats.mpUsage += c; }
    if (fr.hp) { this.hp = Math.max(1, this.hp - fr.hp); }
    if (fr.stop) { this.vx = 0; this.vz = 0; }
    // dvx 是最低速度:空中或当前速度不足时才设定(原版语义)
    if (fr.dvx) { const air = this.y < -1; if (air || Math.abs(this.vx) < Math.abs(fr.dvx) || sign(this.vx) !== this.facing) this.vx = fr.dvx * this.facing; }
    if (fr.dvy) this.vy = fr.dvy;
    if (fr.dvz !== undefined) this.vz = fr.dvz * (this.ctrl ? this.ctrl.dirZ() : 0);
    if (fr.sound) w.sfx(fr.sound, this);
    if (fr.opoint) for (const op of fr.opoint) w.spawnOpoint(this, op);
    if (fr.throwWeapon) this.throwWeapon();
    if (fr.throwVictim) this.throwVictim();
    if (fr.drink && this.holding) this.holding.drinkBy(this, fr.wait);
    if (fr.thaw) { this.frozen = false; w.fx.shards(this.x, this.z, '#cdf3ff', this.y - 40, 6); w.sfx('shatter', this, 0.6); }
    if (fr.onEnter) fr.onEnter(this, w);
  }

  toDefault() {
    if (this.y < -1) { this.setFrame(212, { silent: true }); return; }
    if (this.heavy) { this.setFrame(19); return; }
    this.setFrame(0);
  }

  goNext() {
    const fr = this.fr;
    if (this.frameId === 210) this.takeOff();
    if (fr.state === ST.LYING) {
      if (this.hp <= 0) { this.wait = 9999; return; }
      this.invuln = Math.max(this.invuln, 18);   // 起身后闪烁无敌
    }
    let next = fr.next;
    if (typeof next === 'function') next = next(this);
    this.setFrame(next);
  }

  takeOff() {
    const st = this.def.stats, c = this.ctrl;
    const dx = c ? c.dirX() : 0, dz = c ? c.dirZ() : 0;
    if (dx) this.facing = dx;
    this.vx = dx * st.jump_distance;
    this.vz = dz * st.jump_distancez;
    this.vy = st.jump_height;
    this.world.sfx('jump', this, 0.5);
  }

  // ---------------------------------------------------------------- 每 TU 更新
  update() {
    const w = this.world;
    if (this.removed) return;
    for (const [k, v] of this.vrest) { if (v <= 1) this.vrest.delete(k); else this.vrest.set(k, v - 1); }
    if (this.arest > 0) this.arest--;
    if (this.invuln > 0) this.invuln--;
    if (this.invisible > 0) this.invisible--;
    if (this.shake > 0) this.shake--;
    if (this.hitStop > 0) { this.hitStop--; return; }
    if (this.caughtBy) { this.updateCaught(); return; }

    // fall / 防御点数衰减(受击后 2 TU 内不衰减)
    if (this.hurtT > 0) this.hurtT--;
    else { this.fall = Math.max(0, this.fall - 1); this.bdef = Math.max(0, this.bdef - 1); }
    if (!this.dead && this.hp > 0) {
      if (this.hp < this.darkHp && w.tick % 12 === 0) this.hp = Math.min(this.darkHp, this.hp + 1);
      // 治疗:每 8 TU +8,只回到暗红上限
      if (this.healT > 0) { this.healT--; if (this.healT % 8 === 0) this.hp = Math.min(Math.max(this.hp, this.darkHp), this.hp + 8); }
      // MP:每 3 TU 回复 1 + floor((500 - HP) / 100),残血回得快;隐身 / 闪烁时不回复
      if (w.tick % 3 === 0 && this.invisible <= 0 && this.invuln <= 0) {
        const h = Math.min(500, this.def.fastMp ? this.hp / 2 : this.hp);
        this.mp = Math.min(this.mpCap ?? this.maxMp, this.mp + (1 + Math.floor((500 - h) / 100)) * w.mpRate);
      }
    }
    if (this.def.passive) this.def.passive(this, w);
    if (this.lifeT > 0 && --this.lifeT === 0) { this.hp = 0; this.dead = true; this.removed = true; w.fx.smoke(this.x, this.y - 40, this.z); w.fx.smoke(this.x, this.y - 20, this.z); }
    if (this.fr.burnt && w.tick % 2 === 0) w.fx.flame(this.x + (rnd() - 0.5) * 20, this.y - 30 - rnd() * 30, this.z + 1, 0.8);

    if (!this.dead) this.handleInput();
    if (--this.wait <= 0) this.goNext();
    this.physics();
    if (this.catching) this.updateCatching();
  }

  // ---------------------------------------------------------------- 输入
  canAfford(fid) {
    const fr = this.def.frames[fid];
    if (!fr) return false;
    if (fr.mp && this.mp < fr.mp) return false;
    if (fr.hp && this.hp <= fr.hp) return false;
    if (fr.cond && !fr.cond(this, this.world)) return false;
    return true;
  }

  tryCombo(fromAir) {
    const c = this.ctrl;
    if (!c || !c.combo) return false;
    const fr = this.fr;
    const { type, dirX } = c.combo;
    let target = fr['hit_' + type];
    if (target === undefined) {
      const mv = this.def.moves;
      if (mv) {
        if (fromAir) target = mv['air' + type];
        else if (fr.state === ST.STAND || fr.state === ST.WALK || fr.state === ST.DEFEND) target = mv[type];
        else if (fr.state === ST.RUN) target = mv['run' + type];
      }
    }
    if (target === undefined) return false;
    const oldFacing = this.facing;
    if (type[0] === 'F' && dirX) this.facing = dirX;
    if (typeof target === 'function') target = target(this);
    if (target == null || !this.canAfford(target)) { this.facing = oldFacing; return false; }   // MP 不足:指令保留到失效
    c.takeCombo();
    this.setFrame(target);
    return true;
  }

  frameKey(k, field) {
    const fr = this.fr;
    if (fr[field] === undefined || !this.ctrl.bp(k, 4)) return false;
    const t = typeof fr[field] === 'function' ? fr[field](this) : fr[field];
    if (t != null && (t === END || this.canAfford(t))) { this.setFrame(t); return true; }
    return false;
  }

  handleInput() {
    const c = this.ctrl;
    if (!c) return;
    const fr = this.fr, st = fr.state, S = ST;
    // 帧内按键跳转(连击、连发、中止持续技等)
    if (this.frameKey('A', 'hit_a') || this.frameKey('J', 'hit_j') || this.frameKey('D', 'hit_d')) return;
    // 攻击帧内接招(hit_Ua 等)
    if (c.combo && fr['hit_' + c.combo.type] !== undefined && st !== S.STAND && st !== S.WALK && st !== S.DEFEND && st !== S.RUN && st !== S.JUMP && st !== S.DASH) { if (this.tryCombo(false)) return; }
    if (fr.steer) {
      const dx = c.dirX();
      if (fr.steer.turn && dx) this.facing = dx;
      if (fr.steer.z) this.vz = c.dirZ() * fr.steer.z;
      if (fr.steer.x) this.vx = (dx || 0) * fr.steer.x;
    }
    const heavy = this.heavy;
    const item = this.holding;
    const s = this.def.stats;

    if (st === S.STAND || st === S.WALK) {
      if (!heavy && this.tryCombo(false)) return;
      const run = c.takeRun();
      if (run) { this.facing = run.dir; this.walkCount = 0; this.setFrame(heavy ? 16 : 9); return; }
      if (c.bp('A', 4)) {
        const pick = !item && this.world.findPickable(this);
        if (pick) { this.pickUp(pick); return; }
        const dx = c.dirX();
        if (heavy) { this.setFrame(50); return; }
        if (item) {
          if (item.def.drink) { this.setFrame(55); return; }                       // 站立 A = 喝
          if (item.def.throwOnly || (dx && item.def.throwStand)) { if (dx) this.facing = dx; this.setFrame(45); return; } // 小刀/回旋镖:方向+A 投掷
          this.setFrame(rnd() < 0.5 ? 25 : 20); return;
        }
        if (this.world.findDizzyFront(this, 58, true)) { this.setFrame(70); return; }
        if (this.def.normalAttack) { this.setFrame(this.def.normalAttack(this)); return; }
        this.setFrame(rnd() < 0.5 ? 60 : 65); return;
      }
      if (!heavy && c.bp('J', 3)) { this.setFrame(210); return; }
      if (!heavy && c.bp('D', 3)) { this.setFrame(110); return; }
      // 行走(斜向时 x 速度 ×5/7)
      const dx = c.dirX(), dz = c.dirZ();
      if (dx || dz) {
        if (dx) this.facing = dx;
        const diag = dx && dz ? 5 / 7 : 1;
        this.vx = dx * (heavy ? s.heavy_walking_speed : s.walking_speed) * diag;
        this.vz = dz * (heavy ? s.heavy_walking_speedz : s.walking_speedz);
        if (st !== S.WALK) { this.setFrame(heavy ? 12 : 5, { silent: true }); this.walkCount = 0; }
        this.walkCount++;
        const k = Math.floor(this.walkCount / (s.walking_frame_rate + 1)) % 6;
        const base = heavy ? 12 : 5;
        const nid = base + [0, 1, 2, 3, 2, 1][k];
        if (this.frameId !== nid) { this.frameId = nid; this.fr = this.def.frames[nid]; }
        this.wait = 99;
      } else if (st === S.WALK) {
        this.vx = 0; this.vz = 0;
        this.toDefault();
      }
      return;
    }

    if (st === S.RUN) {
      if (!heavy && this.tryCombo(false)) return;
      const dx = c.dirX(), dz = c.dirZ();
      if (dx === -this.facing) { this.setFrame(heavy ? 18 : 218); return; }
      if (c.bp('A', 2)) {
        if (heavy) { this.setFrame(50); return; }
        if (item) { this.setFrame(dx === this.facing || item.def.throwOnly ? 45 : (item.def.drink ? 45 : 35)); return; }   // 方向+A 投掷
        const ra = typeof this.def.runAttack === 'function' ? this.def.runAttack(this) : this.def.runAttack;
        this.setFrame(ra ?? 85); return;
      }
      if (!heavy && c.bp('J', 2)) {
        this.vx = this.facing * s.dash_distance;
        this.vy = s.dash_height;
        this.vz = dz * s.dash_distancez;
        this.setFrame(213);
        this.world.sfx('dash', this, 0.6);
        return;
      }
      if (!heavy && c.bp('D', 2)) { this.setFrame(102); return; }
      const diag = dz ? 5 / 6 : 1;
      this.vx = this.facing * (heavy ? s.heavy_running_speed : s.running_speed) * diag;
      this.vz = dz * (heavy ? s.heavy_running_speedz : s.running_speedz);
      this.walkCount++;
      const k = Math.floor(this.walkCount / (s.running_frame_rate + 1)) % 4;
      const base = heavy ? 16 : 9;
      const idx = heavy ? (k & 1) : [0, 1, 2, 1][k];
      if (this.frameId !== base + idx) { this.frameId = base + idx; this.fr = this.def.frames[base + idx]; if (idx === 0 || idx === 2) this.world.sfx('step', this, 0.25); }
      this.wait = 99;
      return;
    }

    if (st === S.JUMP) {
      const dx = c.dirX();
      if (this.frameId === 210) return;
      if (dx) this.facing = dx;
      if (this.tryCombo(true)) return;
      if (c.bp('A', 2)) {
        if (item) { if (item.def.drink || item.def.throwOnly || dx) { this.setFrame(52); return; } this.setFrame(30); return; }
        const ja = typeof this.def.jumpAttack === 'function' ? this.def.jumpAttack(this) : this.def.jumpAttack;
        this.setFrame(ja ?? 80); return;
      }
      return;
    }

    if (st === S.DASH) {
      const dx = c.dirX();
      if (dx && dx !== this.facing) { this.facing = dx; this.setFrame(this.frameId === 213 ? 214 : 213, { silent: true }); }
      if (this.tryCombo(true)) return;
      if (this.frameId === 213 && c.bp('A', 2)) {
        if (item) { if (item.def.drink || item.def.throwOnly || dx) { this.setFrame(52); return; } this.setFrame(40); return; }
        const da = typeof this.def.dashAttack === 'function' ? this.def.dashAttack(this) : this.def.dashAttack;
        this.setFrame(da ?? 90); return;
      }
      return;
    }

    if (st === S.DEFEND) {
      if (this.tryCombo(false)) return;
      const dx = c.dirX();
      if (dx && this.frameId === 110) this.facing = dx;   // 防御中可转身
      return;
    }

    if (st === S.FALLING) {
      // 被击飞下落时按跳 = 空翻卸力(rowing),落地前无敌
      if (c.pressed.J && this.hp > 0 && this.vy > 0 && this.y < -8 && !fr.burnt && !this.thrownBy && !this.noRow) {
        const back = this.frameId < 186;
        this.vx = (back ? -1 : 1) * this.facing * s.rowing_distance;
        this.vy = s.rowing_height;
        this.setFrame(back ? 100 : 108);
        this.world.sfx('roll', this, 0.5);
      }
      return;
    }

    if (st === S.CATCHING && this.frameId === 120) {
      // 抓住时也可出部分招式(原版 Davis/Dennis 的 D^A、DvA,Rudolf 的抓取变身等)
      if (c.combo && this.def.catchMoves && this.def.catchMoves[c.combo.type] !== undefined) {
        const { type, dirX } = c.combo;
        let t = this.def.catchMoves[type];
        if (typeof t === 'function') t = t(this);
        if (t != null && this.canAfford(t)) {
          c.takeCombo();
          if (type[0] === 'F' && dirX) this.facing = dirX;
          const v = this.catching;
          if (!this.def.frames[t].keepCatch) { this.releaseCatch(); if (v) v.setFrame(222); }
          this.setFrame(t);
          return;
        }
      }
      if (c.bp('A', 2)) {
        const dx = c.dirX(), dz = c.dirZ();
        if (dx || dz) { if (dx !== this.facing) this.facing = -this.facing; this.setFrame(124); }  // 任意方向+A 摔:除非按住前方,否则向后摔
        else { this.setFrame(121); this.catchPunches++; this.catchTimer += 4; }
        return;
      }
    }
  }

  // ---------------------------------------------------------------- 物理
  physics() {
    const w = this.world, fr = this.fr;
    if (this.caughtBy) return;
    this.x += this.vx; this.z += this.vz;
    const air = this.y < 0 || this.vy < 0;
    if (air) {
      this.y += this.vy;
      if (!fr.noGravity) this.vy += GRAVITY * (fr.gravityK ?? 1);
      else this.vy *= 0.85;
      if (this.y >= 0) { this.y = 0; const vy = this.vy; this.vy = 0; this.onLand(vy); }
      else if (fr.state === ST.FALLING || fr.state === ST.BURNING) this.pickFallPic();
    } else {
      this.y = 0;
      const st = fr.state;
      if (st !== ST.WALK && st !== ST.RUN && !fr.keepVel) {
        const f = fr.friction ?? 1;
        this.vx = approach(this.vx, 0, f);
        this.vz = approach(this.vz, 0, f);
      }
    }
    const b = w.bounds(this);
    if (this.z < b.zMin) { this.z = b.zMin; if (this.vz < 0) this.vz = 0; }
    if (this.z > b.zMax) { this.z = b.zMax; if (this.vz > 0) this.vz = 0; }
    if (this.x < b.xMin) { this.x = b.xMin; if (this.vx < 0) this.vx = 0; }
    if (this.x > b.xMax) { this.x = b.xMax; if (this.vx > 0) this.vx = 0; }
  }

  // 下落帧按竖直速度选择(原版:≤-10 / >-10 / >0 / >6)
  pickFallPic() {
    const id = this.frameId;
    let base;
    if (id >= 180 && id <= 185) base = 180; else if (id >= 186 && id <= 191) base = 186; else if (id >= 203 && id <= 206) base = 203; else return;
    const vy = this.vy;
    const i = vy <= -10 ? 0 : vy <= 0 ? 1 : vy <= 6 ? 2 : 3;
    const nid = base + i;
    if (nid !== id) { this.frameId = nid; this.fr = this.def.frames[nid]; }
    this.wait = 99;
  }

  onLand(vy) {
    const fr = this.fr, st = fr.state, w = this.world;
    if (fr.landTo !== undefined) { this.setFrame(fr.landTo); if (fr.landStop !== false) { this.vx = 0; this.vz = 0; } w.sfx('land', this, 0.3); return; }
    if (this.thrownBy) {   // 被摔落地:摔伤同时扣除可恢复上限
      this.thrownBy = null;
      const inj = 30;
      this.hp = Math.max(0, this.hp - inj); this.darkHp -= inj; this.stats.hpLost += inj;
      w.fx.dust(this.x, this.z, 2); w.sfx('fall_ground', this); w.shakeCam(3);
    }
    if (st === ST.FALLING || st === ST.BURNING) {
      const bounce = (vy > 11 || Math.abs(this.vx) > 13.4 || st === ST.BURNING) && !this.bounced;
      if (bounce) {
        this.bounced = true;
        this.vy = -4.25; this.y = -0.1;
        this.vx *= 0.6;
        const base = this.frameId >= 186 && this.frameId <= 191 ? 186 : 180;
        this.setFrame(base + 4, { silent: true });
        this.wait = 99;
        w.fx.dust(this.x, this.z, 1.5); w.sfx('fall_ground', this, 0.8); w.shakeCam(2);
        return;
      }
      this.bounced = false;
      const faceUp = !(this.frameId >= 186 && this.frameId <= 191);
      this.vx *= 0.5;
      this.setFrame(faceUp ? 230 : 231);
      w.fx.dust(this.x, this.z, 1);
      w.sfx('fall_ground', this, 0.5);
      if (this.hp <= 0) this.die();
      return;
    }
    if (st === ST.FROZEN) { // 冰块落地碎裂:10 点伤害并倒地
      this.frozen = false;
      this.hp = Math.max(0, this.hp - 10); this.darkHp -= 3;
      w.fx.shards(this.x, this.z, '#cdf3ff', this.y - 30, 12); w.sfx('shatter', this);
      this.setFrame(230);
      if (this.hp <= 0) this.die();
      return;
    }
    if (st === ST.JUMP || st === ST.ROW || st === ST.DASH || fr.air) {
      if (st === ST.DASH) { this.vx *= 0.3; } else this.vx = 0;
      this.vz = 0;
      this.setFrame(215);
      w.sfx('land', this, 0.4);
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.wait = 9999;
    this.dropWeapon();
    if (this.catching) this.releaseCatch();
    this.world.onDeath(this);
  }

  // ---------------------------------------------------------------- 武器
  pickUp(item) {
    const heavy = item.def.wtype === 'heavy';
    this.setFrame(heavy ? 116 : 115);
    item.attach(this);
    this.holding = item;
    this.stats.picking++;
    this.world.sfx('pick', this);
  }
  dropWeapon() {
    if (!this.holding) return;
    const it = this.holding;
    this.holding = null;
    it.detach(this.vx * 0.5, -3, this.vz * 0.5);
  }
  // 投掷速度取原版 wpoint:轻武器 dvx 19 / dvy -4 / dvz 3,重物 13 / -5 / 2
  throwWeapon() {
    if (!this.holding) return;
    const it = this.holding;
    this.holding = null;
    const c = this.ctrl;
    const heavy = it.def.wtype === 'heavy';
    const dz = c ? c.dirZ() : 0;
    const air = this.y < -1;
    it.throwFrom(this, this.facing * (heavy ? 13 : 19), air ? 0 : (heavy ? -5 : -4), dz * (heavy ? 2 : 3));
  }

  // ---------------------------------------------------------------- 抓取
  startCatch(victim) {
    if (this.heavy) return;
    this.catching = victim;
    victim.caughtBy = this;
    victim.vx = victim.vy = victim.vz = 0;
    victim.setFrame(130, { silent: true });
    this.catchTimer = 45;
    this.catchPunches = 0;
    this.vx = 0; this.vz = 0;
    this.setFrame(120);
    this.world.sfx('pick', this, 0.6);
  }
  updateCatching() {
    const v = this.catching;
    if (!v || v.removed || this.fr.state !== ST.CATCHING) { this.releaseCatch(); return; }
    if (this.frameId === 120) this.catchTimer--;
    const cp = this.fr.cpoint || { x: 26, y: -2 };
    v.x = this.x + cp.x * this.facing;
    v.z = this.z + 0.5;
    v.y = this.y + (cp.y || 0) + 2;
    v.facing = -this.facing;
    if (cp.victimPic && v.frameId !== 131) v.setFrame(131, { silent: true });
    if (this.catchTimer <= 0 && this.frameId === 120) {
      const vv = v;
      this.releaseCatch();
      vv.fall = 0;
      vv.setFrame(222);
      this.setFrame(0);
    }
  }
  releaseCatch() {
    const v = this.catching;
    this.catching = null;
    if (v) { v.caughtBy = null; if (v.y < 0) v.vy = 0; }
  }
  // 摔出:throwvx 13 / throwvy -7 / throwvz 3,被摔者飞行中会砸伤碰到的任何人
  throwVictim() {
    const v = this.catching;
    if (!v) return;
    this.releaseCatch();
    v.thrownBy = this;
    v.x = this.x + this.facing * 22;
    v.y = Math.min(v.y, -40);
    v.vx = this.facing * 13;
    v.vy = -7;
    v.vz = (this.ctrl ? this.ctrl.dirZ() : 0) * 3;
    v.fall = 0;
    v.lastHitBy = this;
    v.setFrame(v.facing === this.facing ? 187 : 181, { silent: true });
    v.wait = 99;
    this.world.fx.dust(this.x, this.z, 1);
  }
  updateCaught() {
    const c = this.caughtBy;
    if (!c || c.removed || c.catching !== this) { this.caughtBy = null; this.setFrame(this.y < -2 ? 180 : 0); return; }
    if (--this.wait <= 0) this.goNext();
  }
}

export { clamp, sign };
