// 实体基类(格坐标:x 为中心,y 为脚底)、掉落物、箭矢、下落方块、点燃的 TNT。
import { BLOCKS, B } from './blocks.js';
import { ITEMS, maxStack } from './items.js';

const EPS = 1e-4;

export class Entity {
  constructor(game, x, y, w, h) {
    this.game = game; this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.onGround = false; this.hitWall = 0; this.inWater = false; this.inLava = false; this.headInWater = false;
    this.dead = false; this.age = 0; this.fallStart = y; this.dropDown = false; this.climbing = false;
    this.grav = 52; this.maxFall = 30; this.stepUp = false; this.noClip = false;
    this.stepAnim = 0;
  }
  get left() { return this.x - this.w / 2; }
  get top() { return this.y - this.h; }
  get cx() { return this.x; }
  get cy() { return this.y - this.h / 2; }

  boxHits(l, t, r, b) {
    const w = this.game.world;
    const x0 = Math.floor(l + EPS), x1 = Math.floor(r - EPS), y0 = Math.floor(t + EPS), y1 = Math.floor(b - EPS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (w.solidSafe(tx, ty)) return true;
    return false;
  }
  overlapsSolid() { return this.boxHits(this.x - this.w / 2, this.y - this.h, this.x + this.w / 2, this.y); }

  senseFluids() {
    const w = this.game.world;
    const probe = (px, py) => {
      const tx = Math.floor(px), ty = Math.floor(py);
      if (!w.isLoaded(tx, ty)) return 0;
      const f = w.fluid(tx, ty);
      if (!f) return 0;
      const lv = (f & 15) / 8, frac = py - ty;
      return frac >= 1 - lv - 0.05 ? f >> 4 : 0;
    };
    const feet = probe(this.x, this.y - 0.15), mid = probe(this.x, this.y - this.h * 0.5), head = probe(this.x, this.y - this.h + 0.2);
    this.inWater = feet === 1 || mid === 1;
    this.inLava = feet === 2 || mid === 2;
    this.headInWater = head === 1;
    this.headInLava = head === 2;
    this.deepWater = mid === 1;
  }

  // 物理:重力、流体阻力与轴分离碰撞
  physics(dt) {
    this.senseFluids();
    let g = this.grav, maxF = this.maxFall;
    if (this.inWater) { g *= 0.3; maxF = 5; this.vx *= Math.pow(0.15, dt); }
    if (this.inLava) { g *= 0.25; maxF = 3; this.vx *= Math.pow(0.05, dt); }
    if (!this.climbing && !this.flying) this.vy = Math.min(this.vy + g * dt, maxF);
    if (this.noClip) { this.x += this.vx * dt; this.y += this.vy * dt; return; }
    const wasGround = this.onGround;
    this.onGround = false; this.hitWall = 0;
    // X
    let dx = this.vx * dt;
    const stepsX = Math.max(1, Math.ceil(Math.abs(dx) / 0.4));
    for (let s = 0; s < stepsX; s++) if (!this.moveX(dx / stepsX, wasGround)) break;
    // Y
    let dy = this.vy * dt;
    const stepsY = Math.max(1, Math.ceil(Math.abs(dy) / 0.4));
    for (let s = 0; s < stepsY; s++) if (!this.moveY(dy / stepsY)) break;
    if (this.onGround && !wasGround) this.landed?.(this.fallStart);
    if (this.onGround || this.inWater || this.climbing || this.flying) this.fallStart = this.y;
    else if (this.vy < 0) this.fallStart = Math.min(this.fallStart, this.y);
  }
  moveX(dx, grounded) {
    const nx = this.x + dx, hw = this.w / 2;
    if (!this.boxHits(nx - hw, this.y - this.h, nx + hw, this.y)) { this.x = nx; return true; }
    // 自动上台阶(泰拉瑞亚式:地面上遇 1 格高的台阶直接走上去)
    if (this.stepUp && (grounded || this.inWater) && this.boxHits(nx - hw, this.y - 1, nx + hw, this.y)) {
      const ny = Math.floor(this.y - EPS);   // 台阶顶面
      if (this.y - ny <= 1.01 && !this.boxHits(nx - hw, ny - this.h, nx + hw, ny)) {
        this.stepAnim += this.y - ny;
        this.y = ny; this.x = nx; this.onGround = true;
        return true;
      }
    }
    if (dx > 0) this.x = Math.floor(nx + hw - EPS) - hw - EPS * 2; else this.x = Math.ceil(nx - hw + EPS) + hw + EPS * 2;
    this.hitWall = dx > 0 ? 1 : -1;
    this.vx = 0;
    return false;
  }
  moveY(dy) {
    const ny = this.y + dy, hw = this.w / 2, w = this.game.world;
    if (dy > 0) {
      // 平台:只在下落且原本位于平台之上时承托
      if (!this.dropDown) {
        const row = Math.floor(this.y + EPS);
        if (ny > row && this.y <= row + EPS) {
          for (let tx = Math.floor(this.x - hw + EPS); tx <= Math.floor(this.x + hw - EPS); tx++) {
            if (w.isLoaded(tx, row) && w.platform(tx, row)) { this.y = row; this.vy = 0; this.onGround = true; return false; }
          }
        }
      }
      if (this.boxHits(this.x - hw, ny - this.h, this.x + hw, ny)) {
        this.y = Math.floor(ny - EPS); this.vy = 0; this.onGround = true; return false;
      }
    } else if (this.boxHits(this.x - hw, ny - this.h, this.x + hw, ny)) {
      this.y = Math.ceil(ny - this.h + EPS) + this.h; this.vy = 0; this.bumped = true; return false;
    }
    this.y = ny;
    return true;
  }
  dist2(o) { const dx = o.x - this.x, dy = o.cy - this.cy; return dx * dx + dy * dy; }
}

// ———————————————— 掉落物
export class ItemEntity extends Entity {
  constructor(game, x, y, id, n, extra = {}) {
    super(game, x, y, 0.5, 0.5);
    this.type = 'item'; this.id = id; this.n = n; this.dur = extra.dur;
    this.vx = extra.vx ?? (Math.random() - 0.5) * 4; this.vy = extra.vy ?? -4 - Math.random() * 3;
    this.pickDelay = extra.pickDelay ?? 0.4; this.life = 300; this.bob = Math.random() * 6;
    this.grav = 30; this.maxFall = 16;
  }
  update(dt) {
    this.age += dt; this.pickDelay -= dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const p = this.game.player;
    if (p && !p.dead && this.pickDelay <= 0) {
      const dx = p.x - this.x, dy = p.cy - this.cy, d = Math.hypot(dx, dy);
      const coin = ITEMS[this.id]?.coin;
      if (d < 3.4 && (coin || p.inv.canAccept(this.id, this.n))) {
        if (d < 0.9 && coin) { this.game.addMoney(coin * this.n); this.game.onPickup(this.id, this.n); this.dead = true; return; }
        if (d < 0.9) {
          const left = p.inv.add(this.id, this.n, this.dur);
          if (left < this.n) this.game.onPickup(this.id, this.n - left);
          this.n = left;
          if (!this.n) { this.dead = true; return; }
        } else {
          const k = 26 / Math.max(0.6, d);
          this.vx += (dx / d) * k * dt * 2; this.vy += (dy / d) * k * dt * 2 - this.grav * dt * 0.8;
          this.vx *= 0.92; this.vy *= 0.92;
        }
      }
    }
    if (this.onGround) this.vx *= Math.pow(0.02, dt);
    this.physics(dt);
    if (this.inWater) this.vy -= 18 * dt;
    if (this.inLava && this.age > 0.5) { this.dead = true; this.game.fx.burst(this.x, this.y - 0.2, [255, 120, 40], 6); }
    if ((this.age * 60 | 0) % 60 === 0) this.tryMerge();
  }
  tryMerge() {
    for (const e of this.game.entities) {
      if (e === this || e.type !== 'item' || e.dead || e.id !== this.id || e.dur !== undefined || this.dur !== undefined) continue;
      if (Math.abs(e.x - this.x) < 1.2 && Math.abs(e.y - this.y) < 1.2 && this.n + e.n <= maxStack(this.id)) {
        this.n += e.n; e.dead = true; this.life = Math.max(this.life, e.life);
      }
    }
  }
  save() { return { t: 'item', x: this.x, y: this.y, id: this.id, n: this.n, dur: this.dur, life: this.life }; }
}

// ———————————————— 箭矢
export class Arrow extends Entity {
  constructor(game, x, y, vx, vy, owner, dmg) {
    super(game, x, y, 0.25, 0.25);
    this.type = 'arrow'; this.vx = vx; this.vy = vy; this.owner = owner; this.dmg = dmg;
    this.stuck = false; this.life = 60; this.grav = 26;
  }
  update(dt) {
    this.age += dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const g = this.game, w = g.world;
    if (this.stuck) {
      if (!w.solidSafe(Math.floor(this.sx), Math.floor(this.sy))) { this.stuck = false; this.vx = 0; this.vy = 0; }
      else {
        if (this.owner === g.player && !this.noPickup && g.player && Math.hypot(g.player.x - this.x, g.player.cy - this.y) < 1.2 && !g.player.creative && g.player.inv.canAccept('arrow', 1)) {
          g.player.inv.add('arrow', 1); g.onPickup('arrow', 1); this.dead = true;
        }
        return;
      }
    }
    this.vy = Math.min(this.vy + this.grav * dt, 40);
    if (g.world.isLoaded(Math.floor(this.x), Math.floor(this.y)) && w.fluid(Math.floor(this.x), Math.floor(this.y))) { this.vx *= Math.pow(0.1, dt); this.vy *= Math.pow(0.1, dt); }
    const steps = Math.ceil(Math.hypot(this.vx, this.vy) * dt / 0.2) || 1;
    for (let s = 0; s < steps; s++) {
      const nx = this.x + this.vx * dt / steps, ny = this.y + this.vy * dt / steps;
      if (w.solidSafe(Math.floor(nx), Math.floor(ny))) {
        this.stuck = true; this.sx = nx; this.sy = ny; this.x = nx; this.y = ny; this.life = Math.min(this.life, 30);
        g.sfx('arrowHit', this.x, this.y);
        return;
      }
      this.x = nx; this.y = ny;
      // 命中实体
      const targets = g.enemiesOf(this.owner || { side: 'B' });
      for (const m of targets) {
        if (!m || m.dead || m === this.owner) continue;
        if (Math.abs(m.x - this.x) < m.w / 2 + 0.1 && this.y > m.y - m.h - 0.1 && this.y < m.y + 0.1) {
          const sp = Math.hypot(this.vx, this.vy);
          const dmg = Math.max(1, Math.round(this.dmg * Math.min(1.4, sp / 22)));
          if (this.owner?.rpg && m.type !== 'player') this.owner.rpg.hit(m, dmg, Math.sign(this.vx) * 6, -4);
          else if (m.type === 'player') m.hurt(dmg, Math.sign(this.vx) * 6, -4, this.owner, 'arrow');
          else m.hurt(dmg, Math.sign(this.vx) * 6, -4, this.owner);
          if (this.slow && m.type !== 'player') m.slowT = Math.max(m.slowT || 0, this.slow);
          this.dead = true;
          return;
        }
      }
    }
  }
  get angle() { return Math.atan2(this.vy, this.vx); }
}

// ———————————————— 下落方块(沙子 / 沙砾)
export class FallingBlock extends Entity {
  constructor(game, x, y, id) {
    super(game, x + 0.5, y + 1, 0.96, 0.96);
    this.type = 'falling'; this.id = id; this.grav = 40;
  }
  update(dt) {
    this.age += dt;
    this.physics(dt);
    if (this.onGround || this.age > 20) {
      const w = this.game.world, tx = Math.floor(this.x), ty = Math.floor(this.y - 0.5);
      const cur = w.fg(tx, ty);
      if (!cur || BLOCKS[cur].replace) {
        if (cur) w.breakBlock(tx, ty, { drop: true });
        w.setFluid(tx, ty, 0);
        w.set(tx, ty, this.id);
      } else this.game.dropItem(this.x, this.y - 0.5, BLOCKS[this.id].key, 1);
      this.dead = true;
    }
    // 压到生物
    if (this.vy > 4) for (const m of [this.game.player, ...this.game.mobs()]) {
      if (m && !m.dead && Math.abs(m.x - this.x) < (m.w + this.w) / 2 && Math.abs(m.cy - this.cy) < (m.h + this.h) / 2) m.hurt?.(1, 0, 0, null, 'suffocate');
    }
  }
}

// ———————————————— 点燃的 TNT
export class PrimedTNT extends Entity {
  constructor(game, x, y, fuse = 3.2) {
    super(game, x + 0.5, y + 1, 0.96, 0.96);
    this.type = 'tnt'; this.fuse = fuse; this.vy = -5; this.vx = (Math.random() - 0.5) * 2; this.grav = 30;
  }
  update(dt) {
    this.age += dt; this.fuse -= dt;
    if (this.onGround) this.vx *= Math.pow(0.05, dt);
    this.physics(dt);
    if (Math.random() < 0.5) this.game.fx.spark(this.x, this.y - this.h - 0.1);
    if (this.fuse <= 0) { this.dead = true; this.game.explode(this.x, this.y - 0.5, 4.2, this); }
  }
}

export function newItemStackOk(id) { return !!ITEMS[id]; }
