// 物件:武器 / 饮料(Item)与飞行道具(Proj)。武器有 4 态:地上、手持、空中、被投掷;
// 飞行道具按参数化行为运动(直线 / 追踪 / 回旋 / 原地 / 抛物线),可被近身攻击反弹、互相抵消。
import { GRAVITY } from './config.js';
import { approach, sign, clamp, rnd } from './util.js';
import { nextUid } from './fighter.js';

// ---------------------------------------------------------------- 武器定义(数值取原版 v2.0a weapon*.dat)
// wtype: light 轻武器(挥砍/投掷)、heavy 重物(举起投掷)、throw 投掷物(A 直接扔)、light+drink 饮料(站立 A 喝)
// atk:normal / jump / run / dash 四种攻击的强度表;thrown:投出后的判定;throwStand:站立时方向+A 即投出
export const ITEMS = {
  bat: { name: 'Baseball Bat', wtype: 'light', hp: 200, len: 30, w: 30, h: 12, reach: 28, sound: 'hit_blunt',
    atk: { normal: { injury: 40, fall: 40, dvx: 2, bdefend: 16, vrest: 10 }, jump: { injury: 40, fall: 70, dvx: 7, bdefend: 16 }, run: { injury: 50, fall: 70, dvx: 10, bdefend: 16 }, dash: { injury: 50, fall: 70, dvx: 12, bdefend: 60, vrest: 20 } },
    thrown: { injury: 50, fall: 70, dvx: 8, bdefend: 16 } },
  hoe: { name: 'Hoe', wtype: 'light', hp: 200, len: 30, w: 30, h: 12, reach: 28, sound: 'hit_sharp',
    atk: { normal: { injury: 45, fall: 70, dvx: 4, bdefend: 60, effect: 1 }, jump: { injury: 45, fall: 70, dvx: 6, bdefend: 60, effect: 1 }, run: { injury: 55, fall: 70, dvx: 8, bdefend: 60, effect: 1 }, dash: { injury: 55, fall: 70, dvx: 10, bdefend: 60, effect: 1 } },
    thrown: { injury: 55, fall: 70, dvx: 8, bdefend: 60, effect: 1, vrest: 10 } },
  knife: { name: 'Knife', wtype: 'light', hp: 200, len: 16, w: 18, h: 8, reach: 18, sound: 'hit_sharp', throwStand: true,
    atk: { normal: { injury: 45, fall: 40, dvx: 3, bdefend: 16, effect: 1 }, jump: { injury: 45, fall: 70, dvx: 6, bdefend: 16, effect: 1 }, run: { injury: 55, fall: 70, dvx: 8, bdefend: 16, effect: 1 }, dash: { injury: 55, fall: 70, dvx: 10, bdefend: 16, effect: 1 } },
    thrown: { injury: 55, fall: 70, dvx: 8, bdefend: 16, effect: 1 } },
  iceSword: { name: 'Ice Sword', wtype: 'light', hp: 200, len: 34, w: 34, h: 10, reach: 32, sound: 'hit_sharp',
    atk: { normal: { injury: 30, fall: 40, dvx: 3, bdefend: 16, effect: 3 }, jump: { injury: 30, fall: 70, dvx: 6, bdefend: 16, effect: 3 }, run: { injury: 40, fall: 70, dvx: 8, bdefend: 16, effect: 3 }, dash: { injury: 40, fall: 70, dvx: 10, bdefend: 16, effect: 3 } },
    thrown: { injury: 40, fall: 70, dvx: 8, bdefend: 16, effect: 3 } },
  boomerang: { name: 'Boomerang', wtype: 'light', hp: 100, len: 18, w: 20, h: 10, reach: 18, sound: 'hit_sharp', throwStand: true, returns: true,
    atk: { normal: { injury: 45, fall: 40, dvx: 3, bdefend: 16, effect: 1 }, jump: { injury: 45, fall: 70, dvx: 6, bdefend: 16, effect: 1 }, run: { injury: 55, fall: 70, dvx: 8, bdefend: 16, effect: 1 }, dash: { injury: 55, fall: 70, dvx: 10, bdefend: 16, effect: 1 } },
    thrown: { injury: 55, fall: 70, dvx: 8, bdefend: 16, effect: 1 } },
  baseball: { name: 'Baseball', wtype: 'light', throwOnly: true, hp: 750, len: 6, w: 10, h: 10, reach: 8,
    atk: { normal: { injury: 10, fall: 20, dvx: 2, bdefend: 16 } },
    thrown: { injury: 35, fall: 60, dvx: 8, bdefend: 16 } },
  stone: { name: 'Stone', wtype: 'heavy', hp: 800, len: 0, w: 24, h: 20,
    thrown: { injury: 60, fall: 70, dvx: 5, dvy: -7, bdefend: 30, vrest: 17 } },
  box: { name: 'Box', wtype: 'heavy', hp: 400, len: 0, w: 28, h: 26, breakOnLand: true,
    thrown: { injury: 60, fall: 70, dvx: 5, dvy: -7, bdefend: 30, vrest: 17 } },
  armorPiece: { name: 'Armor', wtype: 'heavy', hp: 1200, len: 0, w: 24, h: 16,
    thrown: { injury: 60, fall: 70, dvx: 5, dvy: -7, bdefend: 30, vrest: 17 } },
  // 牛奶:约 100 TU 喝完,共回 160 HP(暗红上限 +80)与少量 MP;啤酒:约 125 TU,共回 750 MP
  milk: { name: 'Milk', wtype: 'light', drink: 'hp', volume: 100, hp: 450, len: 10, w: 12, h: 16, reach: 12,
    atk: { normal: { injury: 15, fall: 20, dvx: 2, bdefend: 16 } },
    thrown: { injury: 30, fall: 60, dvx: 6, bdefend: 16 } },
  beer: { name: 'Beer', wtype: 'light', drink: 'mp', volume: 125, hp: 450, len: 10, w: 12, h: 16, reach: 12,
    atk: { normal: { injury: 15, fall: 20, dvx: 2, bdefend: 16 } },
    thrown: { injury: 30, fall: 60, dvx: 6, bdefend: 16 } },
};
export const DROP_TABLE = ['bat', 'bat', 'hoe', 'knife', 'knife', 'baseball', 'stone', 'box', 'box', 'milk', 'beer', 'boomerang'];

export class Item {
  constructor(world, id, o = {}) {
    this.uid = nextUid();
    this.kind = 'item';
    this.world = world;
    this.id = id;
    this.def = ITEMS[id];
    this.x = o.x ?? 400; this.y = o.y ?? 0; this.z = o.z ?? 440;
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0; this.vz = 0;
    this.hp = this.def.hp;
    this.holder = null; this.thrower = null;
    this.state = this.y < 0 ? 'air' : 'ground';
    this.team = -1;
    this.facing = 1;
    this.rot = 0; this.spin = 0;
    this.removed = false;
    this.volume = this.def.volume || 0;
    this.hitSet = new Set();
    this.vrest = new Map();
    this.age = 0;
    this.blink = 0;
    this.thrownT = 0;
  }
  attach(f) { this.holder = f; this.state = 'held'; this.thrower = null; this.team = f.team; this.vx = this.vy = this.vz = 0; }
  detach(vx, vy, vz) {
    const f = this.holder;
    this.holder = null;
    if (f) { this.x = f.x + f.facing * 10; this.y = Math.min(-30, f.y - 30); this.z = f.z; }
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.state = 'air';
    this.spin = 0.3 * (rnd() < 0.5 ? -1 : 1);
  }
  throwFrom(f, vx, vy, vz) {
    this.holder = null;
    this.x = f.x + f.facing * 18; this.y = f.y - (this.def.wtype === 'heavy' ? 70 : 46); this.z = f.z;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.facing = f.facing;
    this.state = 'thrown';
    this.thrower = f; this.team = f.team;
    this.spin = this.def.wtype === 'heavy' ? 0.15 * f.facing : 0.55 * f.facing;
    this.hitSet.clear();
    this.thrownT = 0;
    if (this.def.returns) { this.boomerangHome = f; this.spin = 0.9 * f.facing; }
  }
  // 每喝一帧(tu 个 TU)按原版速率回复:牛奶 HP 1.6/TU、暗红 0.8/TU、MP 2/TU;啤酒 MP 6/TU
  drinkBy(f, tu = 4) {
    if (this.volume <= 0) return;
    const t = Math.min(this.volume, tu);
    this.volume -= t;
    if (this.def.drink === 'hp') {
      f.darkHp = Math.min(f.maxHp, f.darkHp + 0.8 * t);
      f.hp = Math.min(f.darkHp, f.hp + 1.6 * t);
      f.mp = Math.min(f.maxMp, f.mp + 2 * t);
    } else f.mp = Math.min(f.maxMp, f.mp + 6 * t);
    if (this.world.tick % 8 < 4) this.world.sfx('drink', f, 0.5);
    this.world.fx.sparkle(f.x + f.facing * 6, f.y - 66, f.z, this.def.drink === 'hp' ? '#ff8080' : '#80b0ff');
    if (this.volume <= 0) { // 喝空:空瓶扔掉后碎掉
      f.holding = null;
      this.holder = null;
      this.x = f.x + f.facing * 12; this.y = -40; this.z = f.z;
      this.vx = f.facing * 3; this.vy = -5;
      this.state = 'air';
      this.empty = true;
    }
  }
  update() {
    const w = this.world;
    this.age++;
    for (const [k, v] of this.vrest) { if (v <= 1) this.vrest.delete(k); else this.vrest.set(k, v - 1); }
    if (this.state === 'held') {
      const f = this.holder;
      if (!f || f.removed || f.holding !== this) { this.detach(0, -3, 0); return; }
      this.x = f.x + f.facing * 14; this.y = f.y - 40; this.z = f.z; this.facing = f.facing;
      return;
    }
    // 回旋镖:飞出一段后飞回投掷者
    if (this.state === 'thrown' && this.boomerangHome) {
      this.thrownT++;
      const home = this.boomerangHome;
      if (this.thrownT > 14 && !home.removed) {
        const dx = home.x - this.x, dz = home.z - this.z, dy = (home.y - 40) - this.y;
        this.vx = approach(this.vx, clamp(dx * 0.2, -14, 14), 1.4);
        this.vz = approach(this.vz, clamp(dz * 0.2, -4, 4), 0.6);
        this.vy = clamp(dy * 0.2, -6, 6);
        if (Math.abs(dx) < 16 && Math.abs(dz) < 12 && this.thrownT > 20) {
          if (!home.holding && !home.dead && home.state <= 1) { home.holding = this; this.attach(home); this.boomerangHome = null; return; }
          this.boomerangHome = null; this.state = 'air';
        }
      } else this.vy += 0.15;
      if (this.thrownT > 80) { this.boomerangHome = null; this.state = 'air'; }
      this.x += this.vx; this.y += this.vy; this.z += this.vz;
      this.rot += this.spin;
      if (this.y > 0) this.y = 0;
      return;
    }
    // 物理
    this.x += this.vx; this.z += this.vz;
    this.rot += this.spin;
    if (this.y < 0 || this.vy < 0) {
      this.y += this.vy;
      this.vy += GRAVITY * (this.state === 'thrown' && this.def.wtype !== 'heavy' ? 0.45 : 1);
      if (this.y >= 0) {
        this.y = 0;
        if (this.empty) { w.fx.shards(this.x, this.z, '#ddeeff'); w.sfx('box_break', this, 0.5); this.removed = true; return; }
        if (this.def.breakOnLand && this.state === 'thrown') { this.breakApart(); return; }
        if (Math.abs(this.vy) > 6) { this.vy = -this.vy * 0.35; this.vx *= 0.6; this.y = -0.1; w.sfx(this.def.wtype === 'heavy' ? 'stone_hit' : 'item_drop', this, 0.5); }
        else { this.vy = 0; this.state = 'ground'; this.spin = 0; this.rot = this.def.wtype === 'heavy' ? 0 : (this.rot > 0 ? 0 : Math.PI); this.thrower = null; this.team = -1; }
      }
    } else {
      this.vx = approach(this.vx, 0, 0.8); this.vz = approach(this.vz, 0, 0.5);
      if (this.state === 'thrown') this.state = 'ground';
    }
    const b = w.bounds(this);
    this.z = clamp(this.z, b.zMin, b.zMax);
    if (this.x < b.xMin || this.x > b.xMax) { this.x = clamp(this.x, b.xMin, b.xMax); this.vx = -this.vx * 0.3; }
    if (this.hp <= 0) this.breakApart();
  }
  breakApart() {
    const w = this.world;
    w.fx.debris(this.x, this.y, this.z, this.id);
    w.sfx(this.id === 'box' ? 'box_break' : 'stone_hit', this, 0.8);
    if (this.holder) this.holder.holding = null;
    this.removed = true;
  }
  // 当前攻击框(被投掷且速度够快时)
  getItrs() {
    if (this.state !== 'thrown' && !(this.state === 'air' && Math.abs(this.vx) > 6)) return null;
    if (Math.abs(this.vx) + Math.abs(this.vy) < 3) return null;
    const d = this.def;
    return [{ box: { x: this.x - d.w / 2 - 4, y: this.y - d.h - 4, w: d.w + 8, h: d.h + 8 }, z: this.z, itr: { ...d.thrown, kind: 0, zw: 14 } }];
  }
  getBdy() {
    if (this.state === 'held') return null;
    const d = this.def;
    return { x: this.x - d.w / 2, y: this.y - d.h, w: d.w, h: d.h };
  }
}

// ---------------------------------------------------------------- 飞行道具
// 参数:render 绘制类型、speed、life、size(碰撞半宽)、itr 伤害、move 运动方式、pierce 穿透、reflect 可反弹、power 对消强度
export const PROJ = {};
export function defProj(id, o) { PROJ[id] = { id, life: 90, size: 10, speed: 12, power: 1, reflect: true, clash: true, move: 'straight', ...o }; }

export class Proj {
  constructor(world, id, owner, o = {}) {
    this.uid = nextUid();
    this.kind = 'proj';
    this.world = world;
    this.def = PROJ[id];
    if (!this.def) throw new Error('unknown proj ' + id);
    const d = this.def;
    this.id = id;
    this.owner = owner;
    this.team = owner ? owner.team : -1;
    this.facing = o.facing ?? (owner ? owner.facing : 1);
    this.x = o.x; this.y = o.y; this.z = o.z;
    this.vx = o.vx ?? this.facing * d.speed;
    this.vy = o.vy ?? (d.vy || 0);
    this.vz = o.vz ?? 0;
    this.life = o.life ?? d.life;
    this.t = 0;
    this.state = 'fly';
    this.hitT = 0;
    this.removed = false;
    this.hitSet = new Set();
    this.vrest = new Map();
    this.hits = 0;
    this.hp = d.hp ?? 1;
    this.target = null;
    this.data = o.data || {};
    this.scale = o.scale ?? 1;
    if (d.onSpawn) d.onSpawn(this, world);
  }
  get alive() { return !this.removed; }
  update() {
    const w = this.world, d = this.def;
    this.t++;
    if (this.t <= 0) { if (this.t === 0 && d.onAppear) d.onAppear(this, w); return; }
    for (const [k, v] of this.vrest) { if (v <= 1) this.vrest.delete(k); else this.vrest.set(k, v - 1); }
    if (this.state === 'hit') {
      this.hitT++;
      if (this.hitT >= (d.hitTime ?? 10)) this.removed = true;
      return;
    }
    if (d.update) d.update(this, w);
    if (this.removed) return;
    // 运动
    if (d.move === 'chase') {
      if (!this.target || this.target.dead || this.target.removed || this.t % 10 === 0) this.target = w.nearestEnemy(this, 600);
      const tg = this.target;
      const sp = d.speed;
      if (tg && this.t > (d.chaseDelay ?? 4)) {
        const dx = tg.x - this.x, dz = tg.z - this.z, dy = (tg.y - 40) - this.y;
        const k = d.turn ?? 0.9;
        this.vx = approach(this.vx, clamp(dx, -1, 1) * sp, k);
        this.vz = approach(this.vz, clamp(dz * 0.1, -sp * 0.4, sp * 0.4), k * 0.4);
        this.vy = approach(this.vy, clamp(dy * 0.1, -3, 3), 0.4);
        this.facing = sign(this.vx) || this.facing;
      }
    } else if (d.move === 'arc') {
      this.vy += d.gravity ?? 0.6;
    } else if (d.move === 'still') {
      if (d.follow && this.owner && !this.owner.removed) { this.x = this.owner.x + (d.followX || 0) * this.owner.facing; this.z = this.owner.z; this.y = this.owner.y + (d.followY || 0); this.facing = this.owner.facing; }
    }
    if (d.accel) this.vx += this.facing * d.accel;
    if (d.maxSpeed) this.vx = clamp(this.vx, -d.maxSpeed, d.maxSpeed);
    this.x += this.vx; this.y += this.vy; this.z += this.vz;
    if (d.ground && this.y > 0) this.y = 0;
    if (this.y >= 0 && d.move === 'arc') {
      this.y = 0;
      if (d.onGround) d.onGround(this, w); else this.explode();
      return;
    }
    if (d.trail && this.t % (d.trailEvery || 2) === 0) w.fx.trail(this);
    const b = w.bounds(this);
    if (this.x < b.xMin - 300 || this.x > b.xMax + 300) this.removed = true;
    if (!d.ignoreZ) this.z = clamp(this.z, b.zMin, b.zMax);
    if (--this.life <= 0) { if (d.onExpire) d.onExpire(this, w); if (d.expireExplode) this.explode(); else this.removed = true; }
  }
  explode() {
    if (this.state === 'hit') return;
    this.state = 'hit';
    this.hitT = 0;
    this.vx = this.vy = this.vz = 0;
    const d = this.def;
    if (d.hitSound) this.world.sfx(d.hitSound, this);
    if (d.onExplode) d.onExplode(this, this.world);
  }
  rebound(by) {
    this.owner = by;
    this.team = by.team;
    this.facing = -this.facing;
    this.vx = -this.vx * 1.15;
    this.vz = -this.vz;
    this.hitSet.clear();
    this.target = null;
    this.life = Math.max(this.life, 40);
    this.world.sfx('ball_hit', this, 0.6);
  }
  getItrs() {
    const d = this.def;
    if (this.t <= 0 || this.state !== 'fly' || !d.itr) return null;
    if (d.itrDelay && this.t < d.itrDelay) return null;
    const s = d.size * this.scale, h = (d.h ?? d.size * 2) * this.scale;
    return [{ box: { x: this.x - s, y: this.y - h / 2 - (d.yOff || 0), w: s * 2, h }, z: this.z, itr: { kind: 0, zw: d.zw ?? 16, ...d.itr } }];
  }
  getBdy() {
    const d = this.def;
    if (this.t <= 0 || this.state !== 'fly' || d.noBdy) return null;
    const s = d.size * this.scale, h = (d.h ?? d.size * 2) * this.scale;
    return { x: this.x - s, y: this.y - h / 2 - (d.yOff || 0), w: s * 2, h };
  }
}
