// 敌人：感知（视锥 + 视线 + 警觉累积 + 听觉）、导航寻路、四种行为（步兵/猎犬/无人机/重装）、命中盒、死亡解体。

import * as THREE from 'three';
import { BUILDERS, createRobotMaterials, disposeInstanceMats } from './robots.js';
import { SIGHT, MOVE } from '../world/collision.js';
import { clamp, damp, angleDiff, rayCapsule, raySphere, DEG, Spring, lerp, wrapAngle } from '../core/util.js';

export const TYPES = {
  sentinel: { name: '哨兵', hp: 110, radius: 0.36, height: 1.9, speed: 3.5, eye: 1.76, score: 100, behavior: 'soldier', drop: 0.5 },
  hound: { name: '猎犬', hp: 65, radius: 0.4, height: 0.95, speed: 7.6, eye: 0.78, score: 80, behavior: 'hound', drop: 0.3 },
  drone: { name: '黄蜂', hp: 55, radius: 0.45, height: 0.5, speed: 7.0, eye: 0, score: 90, behavior: 'drone', drop: 0.35, flying: true },
  heavy: { name: '主宰者', hp: 1300, radius: 0.72, height: 2.75, speed: 2.3, eye: 2.62, score: 600, behavior: 'heavy', drop: 1 },
};

// 命中盒（局部坐标，+z 为前）
const HITBOX = {
  sentinel: [
    { part: 'head', s: [0, 1.79, 0.03], r: 0.15 },
    { part: 'body', a: [0, 1.06, 0], b: [0, 1.56, 0], r: 0.27 },
    { part: 'legs', a: [0, 0.12, 0], b: [0, 1.0, 0], r: 0.2 },
  ],
  hound: [
    { part: 'head', s: [0, 0.76, 0.62], r: 0.17 },
    { part: 'body', a: [0, 0.64, -0.4], b: [0, 0.64, 0.42], r: 0.24 },
    { part: 'legs', a: [0, 0.3, -0.34], b: [0, 0.3, 0.34], r: 0.17 },
  ],
  drone: [{ part: 'body', s: [0, 0, 0], r: 0.44 }],
  heavy: [
    { part: 'head', s: [0, 2.66, 0.14], r: 0.21 },
    { part: 'body', a: [0, 1.6, 0], b: [0, 2.3, 0], r: 0.6 },
    { part: 'legs', a: [0, 0.2, 0], b: [0, 1.4, 0], r: 0.36 },
    { part: 'arm', a: [-0.66, 2.3, 0], b: [-0.66, 1.55, 0.45], r: 0.24 },
  ],
};
const PART_MUL = {
  sentinel: { body: 1, legs: 0.8, arm: 0.6 },
  hound: { body: 1, legs: 0.85, head: 1.6 },
  drone: { body: 1 },
  heavy: { body: 0.7, legs: 0.6, arm: 0.55 },
};

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

let NEXT_ID = 1;

export class Enemy {
  constructor(mgr, type, x, y, z, opts = {}) {
    this.mgr = mgr;
    this.G = mgr.G;
    this.id = NEXT_ID++;
    this.type = type;
    this.def = TYPES[type];
    const D = mgr.diff;
    this.model = BUILDERS[type](mgr.mats);
    this.model.root.position.set(x, y, z);
    mgr.group.add(this.model.root);
    this.body = {
      pos: this.model.root.position,
      vel: new THREE.Vector3(),
      radius: this.def.radius,
      height: Math.min(this.def.height, 1.8),
      step: 0.5,
      snap: 0.45,
      grounded: true,
      ground: null,
    };
    this.radius = this.def.radius;
    this.maxHp = this.def.hp * D.hpMul * (opts.hpMul ?? 1);
    this.hp = this.maxHp;
    this.alive = true;
    this.yaw = opts.yaw ?? mgr.rng.next() * Math.PI * 2;
    this.aimYaw = this.yaw;
    this.aimPitch = 0;
    this.alerted = !!opts.alerted;
    this.awareness = this.alerted ? 1 : 0;
    this.seen = false;
    this.seenTime = 0;
    this.lastSeen = new THREE.Vector3(x, y, z);
    this.lastSeenT = -100;
    this.knowsPlayer = this.alerted;
    this.reaction = D.reaction * (0.8 + mgr.rng.next() * 0.5);
    this.path = null;
    this.pathI = 0;
    this.nextPathT = 0;
    this.moveGoal = null;
    this.thinkT = mgr.rng.next() * 0.5;
    this.perceiveT = mgr.rng.next() * 0.2;
    this.time = 0;
    this.cd = 0.6 + mgr.rng.next();
    this.burst = 0;
    this.burstT = 0;
    this.telegraph = 0;
    this.phase = mgr.rng.next() * 6;
    this.walkK = 0;
    this.flinch = new Spring(160, 12);
    this.flash = 0;
    this.stepAcc = 0;
    this.patrol = opts.patrol || null;
    this.patrolI = 0;
    this.waitT = 0;
    this.guard = opts.guard ?? false;
    this.home = new THREE.Vector3(x, y, z);
    this.stuckT = 0;
    this.stuckRef = new THREE.Vector3(x, y, z);
    this.strafe = mgr.rng.next() < 0.5 ? -1 : 1;
    this.tag = opts.tag || null;
    this.searchT = 0;
    this.spawnFx = opts.spawnFx ?? true;
    this.spin = 0;
    this.spinSnd = null;
    this.gunT = 0;
    this.rocketCd = 4 + mgr.rng.next() * 3;
    this.stagger = 0;
    this.staggerAcc = 0;
    this.attackT = 0;
    this.attackHit = false;
    this.orbit = mgr.rng.next() * Math.PI * 2;
    this.falling = false;
    this.hover = 0;
    this.loopSnd = null;
    if (this.def.flying) {
      this.body.pos.y = y + (opts.dropIn ? 10 : 3.2);
      this.hover = this.body.pos.y;
      this.loopSnd = this.G.audio.play('drone_loop', { pos: this.body.pos, loop: true, volume: 0.35, ref: 3, rateVar: 0.1 });
    }
    this.applyPose(0);
  }

  center(out) {
    const h = this.def.flying ? 0 : this.def.height * 0.55;
    return out.set(this.body.pos.x, this.body.pos.y + h, this.body.pos.z);
  }
  eye(out) {
    return out.set(this.body.pos.x, this.body.pos.y + (this.def.flying ? 0 : this.def.eye), this.body.pos.z);
  }

  /** 局部点 → 世界 */
  _toWorld(l, out) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(this.body.pos.x + l[0] * c + l[2] * s, this.body.pos.y + l[1], this.body.pos.z - l[0] * s + l[2] * c);
  }

  raycast(o, d, maxT) {
    const p = this.body.pos;
    // 包围球快速剔除
    const cy = p.y + (this.def.flying ? 0 : this.def.height / 2);
    const br = (this.def.flying ? 0.6 : this.def.height / 2) + this.radius + 0.4;
    const tb = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, cy, p.z, br);
    if (tb < 0 || tb > maxT + br * 2) return null;
    let best = Infinity, part = null;
    for (const hb of HITBOX[this.type]) {
      let t;
      if (hb.s) {
        this._toWorld(hb.s, _a);
        t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, _a.x, _a.y, _a.z, hb.r);
      } else {
        this._toWorld(hb.a, _a);
        this._toWorld(hb.b, _b);
        t = rayCapsule(o.x, o.y, o.z, d.x, d.y, d.z, _a.x, _a.y, _a.z, _b.x, _b.y, _b.z, hb.r);
      }
      if (t >= 0 && t < best && t <= maxT) {
        best = t;
        part = hb.part;
      }
    }
    if (!part) return null;
    return { enemy: this, t: best, part, point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best) };
  }

  /** 受伤。info: {part, dir, point, weapon, headMul, knock, source} */
  damage(amount, info = {}) {
    if (!this.alive) return { killed: false, damage: 0 };
    const part = info.part || 'body';
    let mul = part === 'head' ? (info.headMul ?? 2) * (PART_MUL[this.type].head ?? 1) : PART_MUL[this.type][part] ?? 1;
    if (info.explosive && this.type === 'heavy') mul = 0.85;
    const dmg = amount * mul;
    this.hp -= dmg;
    this.flash = 0.09;
    this.flinch.impulse(Math.min(8, dmg * 0.12) * (this.type === 'heavy' ? 0.3 : 1));
    if (info.knock && info.dir && !this.def.flying) {
      this.body.vel.x += info.dir.x * info.knock;
      this.body.vel.z += info.dir.z * info.knock;
    }
    if (info.source === 'player') {
      this.alerted = true;
      this.knowsPlayer = true;
      this.awareness = 1;
      this.lastSeen.copy(this.G.player.body.pos);
      this.lastSeenT = this.time;
      this.reaction = Math.min(this.reaction, 0.25);
    }
    if (this.type === 'heavy') {
      this.staggerAcc += dmg;
      if (part === 'head' && this.staggerAcc > 220 && this.stagger <= 0) {
        this.stagger = 1.1;
        this.staggerAcc = 0;
        this.spin = 0;
        this.gunT = 0;
      }
    }
    let killed = false;
    if (this.hp <= 0) {
      killed = true;
      this.die(info);
    }
    return { killed, damage: dmg, headshot: part === 'head' && this.type !== 'drone', part };
  }

  die(info) {
    this.alive = false;
    this.hp = 0;
    if (this.loopSnd) {
      this.loopSnd.stop(0.1);
      this.loopSnd = null;
    }
    if (this.spinSnd) {
      this.spinSnd.stop(0.05);
      this.spinSnd = null;
    }
    if (this.def.flying && !info.explosive) {
      // 无人机：失控坠落，触地爆炸
      this.falling = true;
      this.fallSpin = (this.mgr.rng.next() - 0.5) * 14;
      this.body.vel.set((info.dir?.x ?? 0) * 4, 1.5, (info.dir?.z ?? 0) * 4);
      this.G.effects.electric(this.body.pos.x, this.body.pos.y, this.body.pos.z, 14);
      this.G.audio.play('servo', { pos: this.body.pos, volume: 0.8, rate: 0.6 });
      this.mgr.onKilled(this, info);
      return;
    }
    this.mgr.onKilled(this, info);
    this.breakApart(info);
  }

  breakApart(info) {
    const G = this.G;
    const c = this.center(new THREE.Vector3());
    const big = this.type === 'heavy';
    G.effects.explosion(c.x, c.y - (big ? 0.6 : 0.2), c.z, big ? 1.6 : this.type === 'hound' ? 0.45 : 0.55, { chunks: big ? 8 : 2 });
    G.audio.play(big ? 'explosion' : 'explosion_small', { pos: c, volume: big ? 1 : 0.8, ref: big ? 8 : 4 });
    if (big) G.explode(c.x, c.y - 0.6, c.z, 5, 60, 'heavy', true);
    // 部件飞散
    const root = this.model.root;
    root.updateMatrixWorld(true);
    const meshes = [];
    root.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });
    const R = this.mgr.rng;
    const dir = info.dir || new THREE.Vector3();
    let pending = 0;
    const done = () => {
      pending--;
      if (pending === 0) disposeInstanceMats(this.model);
    };
    for (const m of meshes) {
      // 小零件直接丢弃，节省物理
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (g.boundingSphere.radius < 0.04 && R.next() < 0.6) continue;
      pending++;
      m.userData.dispose = done;
      const wp = m.getWorldPosition(_v);
      const sp = (big ? 5 : 3.5) + R.next() * 4;
      const ox = wp.x - c.x, oz = wp.z - c.z;
      G.effects.debris.add(
        m,
        ox * sp * 0.8 + dir.x * 3 + (R.next() - 0.5) * 2,
        2 + R.next() * 4 + (wp.y - c.y) * 2,
        oz * sp * 0.8 + dir.z * 3 + (R.next() - 0.5) * 2,
        4 + R.next() * 3,
        Math.max(0.05, Math.min(0.3, g.boundingSphere.radius * 0.7)),
        (R.next() - 0.5) * 14, (R.next() - 0.5) * 14, (R.next() - 0.5) * 14,
      );
    }
    if (pending === 0) disposeInstanceMats(this.model);
    this.mgr.group.remove(root);
    this.removed = true;
  }

  // ───────── 感知 ─────────
  perceive(dt) {
    const G = this.G, p = G.player;
    if (!p.alive) {
      this.seen = false;
      return;
    }
    const eye = this.eye(_a);
    const pe = p.eyePos(_b);
    const dx = pe.x - eye.x, dy = pe.y - eye.y, dz = pe.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    let see = false;
    if (dist < 70) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const cos = (fx * dx + fz * dz) / Math.max(0.001, Math.hypot(dx, dz));
      const inCone = this.alerted || this.def.flying || cos > 0.3 || dist < 3.5;
      if (inCone) {
        see = G.world.segmentClear(eye.x, eye.y, eye.z, pe.x, pe.y, pe.z, SIGHT);
        if (!see) {
          p.chestPos(_w);
          see = G.world.segmentClear(eye.x, eye.y, eye.z, _w.x, _w.y, _w.z, SIGHT);
        }
      }
    }
    this.dist = dist;
    if (see) {
      if (!this.alerted) {
        const rate = (dist < 8 ? 3.5 : dist < 20 ? 1.6 : 0.8) * p.stealth() * this.mgr.diff.awareRate;
        this.awareness += rate * dt;
        if (this.awareness >= 1) this.becomeAlert(true);
      }
      if (this.alerted) {
        this.seenTime += dt;
        this.lastSeen.copy(p.body.pos);
        this.lastSeenT = this.time;
        this.knowsPlayer = true;
      }
    } else {
      this.seenTime = 0;
      if (!this.alerted) this.awareness = Math.max(0, this.awareness - dt * 0.15);
    }
    this.seen = see && this.alerted;
  }

  becomeAlert(byVision = false) {
    if (this.alerted) return;
    this.alerted = true;
    this.awareness = 1;
    this.knowsPlayer = true;
    this.lastSeen.copy(this.G.player.body.pos);
    this.lastSeenT = this.time;
    this.G.audio.play(this.type === 'hound' ? 'hound_screech' : 'alert', { pos: this.eye(new THREE.Vector3()), volume: 0.7, ref: 4 });
    this.mgr.propagateAlert(this);
    if (byVision) this.reaction = Math.max(this.reaction, this.mgr.diff.reaction);
  }

  /** 听到声音（枪声、爆炸） */
  hear(x, y, z, loud) {
    if (!this.alive) return;
    if (!this.alerted) {
      this.alerted = true;
      this.awareness = 1;
      this.G.audio.play('alert', { pos: this.eye(new THREE.Vector3()), volume: 0.6, ref: 4 });
      this.reaction = Math.max(this.reaction, 0.4);
    }
    this.knowsPlayer = true;
    if (!this.seen) {
      this.lastSeen.set(x, y, z);
      this.lastSeenT = this.time - (loud ? 0 : 0.5);
    }
  }

  // ───────── 移动 ─────────
  requestPath(tx, ty, tz) {
    if (this.time < this.nextPathT || this.mgr.pathBudget <= 0) return false;
    this.mgr.pathBudget--;
    this.nextPathT = this.time + 0.6 + this.mgr.rng.next() * 0.5;
    const p = this.body.pos;
    const path = this.G.nav.findPath(p.x, p.y, p.z, tx, ty, tz, 6000);
    this.path = path && path.length ? path : null;
    this.pathI = 0;
    return !!this.path;
  }

  /** 沿路径行进，返回期望速度向量写入 out；到达返回 false */
  followPath(speed, out) {
    if (!this.path || this.pathI >= this.path.length) {
      out.set(0, 0, 0);
      return false;
    }
    const p = this.body.pos;
    let wp = this.path[this.pathI];
    let dx = wp.x - p.x, dz = wp.z - p.z;
    let d = Math.hypot(dx, dz);
    const last = this.pathI === this.path.length - 1;
    if (d < (last ? 0.4 : 0.7)) {
      this.pathI++;
      if (this.pathI >= this.path.length) {
        out.set(0, 0, 0);
        return false;
      }
      wp = this.path[this.pathI];
      dx = wp.x - p.x;
      dz = wp.z - p.z;
      d = Math.hypot(dx, dz);
    }
    const k = last ? Math.min(1, d / 1.2) : 1;
    out.set((dx / d) * speed * k, 0, (dz / d) * speed * k);
    return true;
  }

  steer(desired, dt, accel = 14) {
    const v = this.body.vel;
    // 同伴分离
    const p = this.body.pos;
    for (const o of this.mgr.list) {
      if (o === this || !o.alive || o.def.flying !== this.def.flying) continue;
      const dx = p.x - o.body.pos.x, dz = p.z - o.body.pos.z;
      const rr = this.radius + o.radius + 0.35;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6 && Math.abs(p.y - o.body.pos.y) < 1.5) {
        const d = Math.sqrt(d2);
        const k = ((rr - d) / rr) * 5;
        desired.x += (dx / d) * k;
        desired.z += (dz / d) * k;
      }
    }
    let dx = desired.x - v.x, dz = desired.z - v.z;
    const dl = Math.hypot(dx, dz);
    const a = accel * dt;
    if (dl > a) {
      dx *= a / dl;
      dz *= a / dl;
    }
    v.x += dx;
    v.z += dz;
  }

  faceTowards(tx, tz, rate, dt) {
    const want = Math.atan2(tx - this.body.pos.x, tz - this.body.pos.z);
    const d = angleDiff(this.yaw, want);
    this.yaw = wrapAngle(this.yaw + clamp(d, -rate * dt, rate * dt));
  }

  // ───────── 主更新 ─────────
  update(dt) {
    if (this.removed) return;
    this.time += dt;
    this.flash -= dt;
    if (this.falling) return this.updateFalling(dt);
    if (!this.alive) return;
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) {
      const step = 0.18;
      this.perceive(step);
      this.perceiveT += step;
    }
    if (this.reaction > 0 && this.seen) this.reaction -= dt;
    this.cd -= dt;
    const beh = this.def.behavior;
    if (beh === 'soldier') this.updateSoldier(dt);
    else if (beh === 'hound') this.updateHound(dt);
    else if (beh === 'drone') this.updateDrone(dt);
    else this.updateHeavy(dt);

    // 卡住检测
    if (!this.def.flying) {
      this.stuckT += dt;
      if (this.stuckT > 1.6) {
        const moved = this.stuckRef.distanceTo(this.body.pos);
        if (moved < 0.35 && this.wantsMove) {
          this.path = null;
          this.nextPathT = 0;
          this.body.vel.x += (this.mgr.rng.next() - 0.5) * 4;
          this.body.vel.z += (this.mgr.rng.next() - 0.5) * 4;
        }
        this.stuckRef.copy(this.body.pos);
        this.stuckT = 0;
      }
    }
    this.flinch.update(dt);
    this.applyPose(dt);
    const fl = this.flash > 0;
    for (const m of this.model.flashMats) m.emissive.setRGB(fl ? 1.4 : 0, fl ? 1.2 : 0, fl ? 1.0 : 0);
  }

  moveGround(dt, desired, accel) {
    this.steer(desired, dt, accel);
    const sp0 = Math.hypot(this.body.vel.x, this.body.vel.z);
    this.G.world.moveBody(this.body, dt, 20);
    this.wantsMove = Math.hypot(desired.x, desired.z) > 0.3;
    const sp = Math.hypot(this.body.vel.x, this.body.vel.z);
    this.walkK = damp(this.walkK, clamp(sp / this.def.speed, 0, 1.3), 8, dt);
    // 机器人脚步声（近处）
    const pd = this.G.player.body.pos.distanceTo(this.body.pos);
    this.stepAcc += sp * dt;
    const stride = this.type === 'hound' ? 1.6 : this.type === 'heavy' ? 1.9 : 1.4;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      if (pd < (this.type === 'heavy' ? 45 : 18)) {
        this.G.audio.play(this.type === 'heavy' ? 'jugg_step' : 'robot_step', { pos: this.body.pos, volume: this.type === 'heavy' ? 1 : this.type === 'hound' ? 0.3 : 0.45, ref: this.type === 'heavy' ? 6 : 2.5 });
        if (this.type === 'heavy' && pd < 14) this.G.player.addTrauma(0.08);
      }
    }
    return sp0;
  }

  // —— 步兵 ——
  updateSoldier(dt) {
    const G = this.G, p = G.player, R = this.mgr.rng;
    const desired = _w.set(0, 0, 0);
    const pp = p.body.pos;
    let speed = this.def.speed;
    let faceX = null, faceZ = null;
    if (!this.alerted) {
      // 巡逻 / 站岗
      if (this.patrol && this.patrol.length) {
        const wp = this.patrol[this.patrolI];
        if (this.waitT > 0) this.waitT -= dt;
        else if (!this.path) this.requestPath(wp.x, wp.y ?? 0, wp.z);
        const moving = this.followPath(1.6, desired);
        if (!moving && this.path) {
          this.path = null;
          this.waitT = 1.5 + R.next() * 2;
          this.patrolI = (this.patrolI + 1) % this.patrol.length;
        }
      } else {
        this.idleLook = (this.idleLook ?? this.yaw) + Math.sin(this.time * 0.4 + this.id) * 0.3 * dt;
        this.yaw = damp(this.yaw, this.idleLook, 1, dt);
      }
      if (desired.lengthSq() > 0.1) {
        faceX = this.body.pos.x + desired.x;
        faceZ = this.body.pos.z + desired.z;
      }
    } else {
      // 战斗：持续思考移动目标
      this.thinkT -= dt;
      const sinceSeen = this.time - this.lastSeenT;
      const dist = this.dist ?? 30;
      if (this.thinkT <= 0) {
        this.thinkT = 0.9 + R.next() * 1.1;
        if (this.seen) {
          // 调整站位：太近后撤、太远推进，否则横向机动
          const k = G.nav.randomNodeNear(this.body.pos.x, this.body.pos.y, this.body.pos.z, 2.5, 7, R, 10);
          let pick = -1;
          let bestScore = -Infinity;
          for (let i = 0; i < 6; i++) {
            const n = i === 0 ? k : G.nav.randomNodeNear(this.body.pos.x, this.body.pos.y, this.body.pos.z, 2.5, 7, R, 6);
            if (n < 0) continue;
            const nx = G.nav.x[n], ny = G.nav.y[n], nz = G.nav.z[n];
            const dPl = Math.hypot(nx - pp.x, nz - pp.z);
            let score = -Math.abs(dPl - this.mgr.diff.prefRange) * 0.4 + R.next() * 2;
            if (G.world.segmentClear(nx, ny + 1.6, nz, pp.x, pp.y + 1.3, pp.z, SIGHT)) score += 4;
            // 与同伴拉开
            for (const o of this.mgr.list) if (o !== this && o.alive && Math.hypot(o.body.pos.x - nx, o.body.pos.z - nz) < 2.5) score -= 3;
            if (score > bestScore) {
              bestScore = score;
              pick = n;
            }
          }
          if (pick >= 0 && R.next() < 0.75) {
            this.path = null;
            this.nextPathT = 0;
            this.requestPath(G.nav.x[pick], G.nav.y[pick], G.nav.z[pick]);
          } else {
            this.path = null;
          }
        } else if (this.knowsPlayer) {
          // 追向最后目击位置；长时间丢失则直接逼近玩家（据点内有监控）
          const tgt = sinceSeen > 6 || this.mgr.huntMode ? pp : this.lastSeen;
          this.nextPathT = 0;
          this.requestPath(tgt.x, tgt.y, tgt.z);
        }
      }
      if (this.burst > 0 || this.telegraph > 0) speed *= 0.45;
      else if (this.seen) speed *= 0.7;
      const moving = this.followPath(speed, desired);
      if (!moving && this.seen && this.burst <= 0) {
        // 原地横移
        const ang = Math.atan2(pp.x - this.body.pos.x, pp.z - this.body.pos.z) + (Math.PI / 2) * this.strafe;
        desired.set(Math.sin(ang) * 1.3, 0, Math.cos(ang) * 1.3);
        if (R.next() < dt * 0.6) this.strafe *= -1;
      }
      // 朝向：看见玩家时转身对准
      if (this.seen || sinceSeen < 1.5) {
        faceX = this.lastSeen.x;
        faceZ = this.lastSeen.z;
      } else if (desired.lengthSq() > 0.1) {
        faceX = this.body.pos.x + desired.x;
        faceZ = this.body.pos.z + desired.z;
      }
      this.updateSoldierFire(dt, dist);
    }
    if (faceX !== null) this.faceTowards(faceX, faceZ, this.alerted ? 5 : 2.5, dt);
    this.moveGround(dt, desired, 12);
    // 上半身瞄准
    const pe = p.chestPos(_b);
    const eye = this.eye(_a);
    const wantYaw = Math.atan2(pe.x - eye.x, pe.z - eye.z);
    const wantPitch = Math.atan2(pe.y - eye.y, Math.hypot(pe.x - eye.x, pe.z - eye.z));
    const aimOn = this.alerted && (this.seen || this.burst > 0 || this.telegraph > 0);
    this.aimYaw = aimOn ? clamp(angleDiff(this.yaw, wantYaw), -1.2, 1.2) : damp(this.aimYaw, 0, 4, dt);
    this.aimPitch = aimOn ? clamp(wantPitch, -0.9, 0.9) : damp(this.aimPitch, 0, 4, dt);
    this.aimK = damp(this.aimK ?? 0, this.alerted ? 1 : 0, 5, dt);
  }

  updateSoldierFire(dt, dist) {
    const G = this.G, D = this.mgr.diff;
    if (this.telegraph > 0) {
      this.telegraph -= dt;
      if (this.telegraph <= 0) {
        this.burst = 3 + Math.floor(this.mgr.rng.next() * D.burstExtra);
        this.burstT = 0;
      }
    }
    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.shoot('bolt');
        this.burst--;
        this.burstT = 0.11;
        if (this.burst <= 0) this.cd = (1.4 + this.mgr.rng.next() * 1.2) / D.fireRate;
      }
      return;
    }
    if (this.seen && this.reaction <= 0 && this.cd <= 0 && dist < 55 && this.mgr.canShoot(this)) {
      this.telegraph = 0.3;
      this.G.audio.play('servo', { pos: this.body.pos, volume: 0.25, ref: 2 });
    }
  }

  /** 发射一枚弹丸，带误差与部分提前量 */
  shoot(kind) {
    const G = this.G, p = G.player, D = this.mgr.diff, R = this.mgr.rng;
    const m = this.model.J.muzzle || this.model.J.podMuzzle;
    this.model.root.updateMatrixWorld(true);
    const from = (kind === 'rocket' ? this.model.J.podMuzzle : m).getWorldPosition(new THREE.Vector3());
    const tgt = p.chestPos(new THREE.Vector3());
    const useSeen = this.seen ? tgt : this.lastSeen.clone().add(new THREE.Vector3(0, 1.1, 0));
    const speed = kind === 'bolt' ? 62 : kind === 'plasma' ? 30 : kind === 'minigun' ? 70 : 24;
    const dist = from.distanceTo(useSeen);
    const lead = D.lead * (dist / speed);
    if (this.seen) {
      useSeen.x += p.body.vel.x * lead;
      useSeen.z += p.body.vel.z * lead;
    }
    const dir = useSeen.sub(from).normalize();
    // 误差（度）：基础 × 难度 × 目标移动 × 初见惩罚
    const pspd = Math.hypot(p.body.vel.x, p.body.vel.z);
    let err = (kind === 'minigun' ? 3.2 : kind === 'rocket' ? 1.2 : 2.4) * D.accMul * (1 + (pspd / 5) * 0.5) * (this.seenTime < 0.8 ? 1.5 : 1);
    if (p.crouching) err *= 1.15;
    const e = err * DEG * Math.sqrt(R.next());
    const th = R.next() * Math.PI * 2;
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const rgt = new THREE.Vector3().crossVectors(dir, up).normalize();
    const u2 = new THREE.Vector3().crossVectors(rgt, dir);
    dir.addScaledVector(rgt, Math.cos(th) * Math.tan(e)).addScaledVector(u2, Math.sin(th) * Math.tan(e)).normalize();
    const dmg = { bolt: 7, plasma: 12, minigun: 5, rocket: 45 }[kind] * D.dmgMul;
    G.projectiles.spawn(kind, from, dir.multiplyScalar(speed), dmg, this);
    const snd = { bolt: 'shot_enemy', plasma: 'shot_drone', minigun: 'shot_minigun', rocket: 'rocket_launch' }[kind];
    G.audio.play(snd, { pos: from, volume: kind === 'minigun' ? 0.45 : 0.7, ref: kind === 'minigun' ? 4 : 5, occluded: !this.seen });
    G.effects.flashes.flash(from.x, from.y, from.z, kind === 'plasma' ? 0xff40ff : 0xff7a3a, kind === 'minigun' ? 10 : 16, 6, 0.06);
  }

  // —— 猎犬 ——
  updateHound(dt) {
    const G = this.G, p = G.player, R = this.mgr.rng;
    const desired = _w.set(0, 0, 0);
    const pp = p.body.pos;
    if (!this.alerted) {
      if (this.patrol) this.updateSoldier(dt);
      else this.moveGround(dt, desired, 10);
      return;
    }
    const dx = pp.x - this.body.pos.x, dz = pp.z - this.body.pos.z;
    const dist = Math.hypot(dx, dz);
    const dy = Math.abs(pp.y - this.body.pos.y);
    if (this.attackT > 0) {
      // 扑咬
      this.attackT -= dt;
      const u = 1 - this.attackT / 0.45;
      if (!this.attackHit && u > 0.45) {
        this.attackHit = true;
        if (dist < 2.1 && dy < 1.4 && p.alive) {
          const dmg = 14 * this.mgr.diff.dmgMul;
          G.damagePlayer(dmg, this.body.pos.x, this.body.pos.z, 'bite');
          p.body.vel.x += (dx / dist) * 4;
          p.body.vel.z += (dz / dist) * 4;
          G.audio.play('melee_hit', { pos: this.body.pos, volume: 0.8 });
        }
      }
      desired.set(0, 0, 0);
      this.moveGround(dt, desired, 6);
      if (this.attackT <= 0) this.cd = 0.7;
      return;
    }
    const direct = this.seen && dist < 9 && dy < 1.2 && G.nav.lineWalkable(this.body.pos.x, this.body.pos.y, this.body.pos.z, pp.x, pp.y, pp.z);
    if (direct) {
      // 之字冲锋
      const zig = Math.sin(this.time * 6 + this.id) * (dist > 3 ? 0.6 : 0);
      const ang = Math.atan2(dx, dz) + zig;
      const sp = this.def.speed * 1.12;
      desired.set(Math.sin(ang) * sp, 0, Math.cos(ang) * sp);
      this.path = null;
    } else {
      if (!this.path || this.pathI >= this.path.length || this.time > this.nextPathT) {
        const tgt = this.seen || this.mgr.huntMode || this.time - this.lastSeenT > 4 ? pp : this.lastSeen;
        this.requestPath(tgt.x, tgt.y, tgt.z);
      }
      this.followPath(this.def.speed, desired);
    }
    if (dist < 1.9 && dy < 1.2 && this.cd <= 0 && p.alive) {
      this.attackT = 0.45;
      this.attackHit = false;
      G.audio.play('hound_screech', { pos: this.body.pos, volume: 0.6, rate: 1.3 });
      this.body.vel.x += (dx / dist) * 5;
      this.body.vel.z += (dz / dist) * 5;
    }
    if (desired.lengthSq() > 0.1) this.faceTowards(this.body.pos.x + desired.x, this.body.pos.z + desired.z, 9, dt);
    else this.faceTowards(pp.x, pp.z, 9, dt);
    this.moveGround(dt, desired, 22);
  }

  // —— 无人机 ——
  updateDrone(dt) {
    const G = this.G, p = G.player, R = this.mgr.rng;
    const pos = this.body.pos;
    const pp = p.body.pos;
    const v = this.body.vel;
    let tx = this.home.x, ty = this.home.y + 3.5, tz = this.home.z;
    if (this.alerted) {
      this.orbit += dt * 0.35 * (this.id % 2 ? 1 : -1);
      const r = 10 + Math.sin(this.time * 0.3 + this.id) * 3;
      const tgt = this.seen || this.mgr.huntMode || this.time - this.lastSeenT > 3 ? pp : this.lastSeen;
      tx = tgt.x + Math.cos(this.orbit) * r;
      tz = tgt.z + Math.sin(this.orbit) * r;
      ty = tgt.y + 3.8 + Math.sin(this.time * 0.9 + this.id) * 1.2;
      // 室内限高
      const ceil = G.world.ceilingAt(tgt.x, tgt.z, 0.3, tgt.y + 1.9);
      if (ceil < ty + 1) ty = Math.max(tgt.y + 1.6, ceil - 1);
      // 若目标点不可视，向玩家拉近
      if (!this.seen && this.time - this.lastSeenT > 1.5) {
        tx = lerp(tx, tgt.x, 0.6);
        tz = lerp(tz, tgt.z, 0.6);
      }
    } else {
      tx = this.home.x + Math.cos(this.time * 0.4 + this.id) * 4;
      tz = this.home.z + Math.sin(this.time * 0.4 + this.id) * 4;
    }
    let ax = tx - pos.x, ay = ty - pos.y, az = tz - pos.z;
    const al = Math.hypot(ax, ay, az);
    const sp = this.alerted ? this.def.speed : 2.5;
    if (al > 0.01) {
      const k = Math.min(1, al / 3);
      ax = (ax / al) * sp * k;
      ay = (ay / al) * sp * k;
      az = (az / al) * sp * k;
    }
    // 同伴分离
    for (const o of this.mgr.list) {
      if (o === this || !o.alive || !o.def.flying) continue;
      const dx = pos.x - o.body.pos.x, dy = pos.y - o.body.pos.y, dz = pos.z - o.body.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 4 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        ax += (dx / d) * 3;
        ay += (dy / d) * 1.5;
        az += (dz / d) * 3;
      }
    }
    const acc = 6 * dt;
    v.x += clamp(ax - v.x, -acc, acc);
    v.y += clamp(ay - v.y, -acc, acc);
    v.z += clamp(az - v.z, -acc, acc);
    pos.addScaledVector(v, dt);
    const n = { x: 0, y: 0, z: 0 };
    const pen = G.world.sphereCollide(pos, 0.5, n, MOVE);
    if (pen > 0) {
      const vn = v.x * n.x + v.y * n.y + v.z * n.z;
      if (vn < 0) {
        v.x -= vn * n.x;
        v.y -= vn * n.y;
        v.z -= vn * n.z;
      }
    }
    if (pos.y < 0.8) pos.y = 0.8;
    // 朝向玩家
    if (this.alerted) this.faceTowards(pp.x, pp.z, 4, dt);
    else if (Math.hypot(v.x, v.z) > 0.3) this.faceTowards(pos.x + v.x, pos.z + v.z, 2, dt);
    if (this.loopSnd) this.loopSnd.setPos(pos.x, pos.y, pos.z);
    // 射击
    if (this.alerted && this.seen && this.reaction <= 0 && this.cd <= 0 && this.mgr.canShoot(this)) {
      if (!this.charge) {
        this.charge = 0.35;
        G.audio.play('servo', { pos, volume: 0.25, rate: 1.6, ref: 2 });
      }
    }
    if (this.charge) {
      this.charge -= dt;
      if (this.charge <= 0) {
        this.charge = 0;
        this.shoot('plasma');
        this.cd = (1.7 + R.next() * 1.0) / this.mgr.diff.fireRate;
      }
    }
  }

  updateFalling(dt) {
    const G = this.G;
    const pos = this.body.pos, v = this.body.vel;
    v.y -= 16 * dt;
    pos.addScaledVector(v, dt);
    this.yaw += this.fallSpin * dt;
    this.model.root.rotation.set(Math.sin(this.time * 9) * 0.6, this.yaw, Math.cos(this.time * 7) * 0.6);
    if (Math.random() < 0.6) G.effects.trail(pos.x, pos.y, pos.z, [3, 1.2, 3]);
    const n = { x: 0, y: 0, z: 0 };
    const pen = G.world.sphereCollide(pos, 0.4, n, MOVE);
    this.fallT = (this.fallT ?? 0) + dt;
    if (pen > 0 || this.fallT > 4) {
      this.falling = false;
      G.explode(pos.x, pos.y, pos.z, 3.2, 35, 'drone', true);
      this.breakApart({ dir: v.clone().normalize() });
    }
    this.model.J.rotors.forEach((r) => (r.rotation.y += dt * 20));
  }

  // —— 重装 ——
  updateHeavy(dt) {
    const G = this.G, p = G.player, R = this.mgr.rng, D = this.mgr.diff;
    const desired = _w.set(0, 0, 0);
    const pp = p.body.pos;
    if (this.stagger > 0) {
      this.stagger -= dt;
      this.moveGround(dt, desired, 6);
      if (this.spinSnd) {
        this.spinSnd.stop(0.1);
        this.spinSnd = null;
      }
      this.aimPitch = damp(this.aimPitch, -0.4, 4, dt);
      return;
    }
    if (!this.alerted) {
      this.moveGround(dt, desired, 6);
      return;
    }
    const dist = this.dist ?? 20;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 1.2;
      const tgt = this.seen && dist < 9 ? null : this.seen || this.mgr.huntMode || this.time - this.lastSeenT > 3 ? pp : this.lastSeen;
      if (tgt) {
        this.nextPathT = 0;
        this.requestPath(tgt.x, tgt.y, tgt.z);
      } else this.path = null;
    }
    const firing = this.gunT > 0;
    this.followPath(this.def.speed * (firing ? 0.45 : 1), desired);
    this.faceTowards(this.lastSeen.x, this.lastSeen.z, firing ? 1.3 : 2.2, dt);
    this.moveGround(dt, desired, 6);

    // 转管机枪：预热 → 扫射 → 冷却
    if (this.gunT > 0) {
      this.gunT -= dt;
      this.spin = Math.min(1, this.spin + dt * 3);
      this.mgFire = (this.mgFire ?? 0) - dt;
      if (this.mgFire <= 0 && this.spin > 0.95) {
        this.shoot('minigun');
        this.mgFire = 1 / (11 * D.fireRate);
      }
      if (this.gunT <= 0) this.cd = 2.2 / D.fireRate;
    } else if (this.windup > 0) {
      this.windup -= dt;
      this.spin = Math.min(1, this.spin + dt * 1.2);
      if (this.windup <= 0) this.gunT = 2.6;
    } else {
      this.spin = Math.max(0, this.spin - dt * 0.8);
      if (this.seen && this.cd <= 0 && this.reaction <= 0 && dist < 45) {
        this.windup = 0.85;
        if (!this.spinSnd) this.spinSnd = G.audio.play('minigun_spin', { pos: this.body.pos, loop: true, volume: 0.5, ref: 5, rateVar: 0 });
      }
    }
    if (this.spinSnd) {
      this.spinSnd.setPos(this.body.pos.x, this.body.pos.y + 2, this.body.pos.z);
      this.spinSnd.setRate(0.5 + this.spin * 0.7);
      if (this.spin <= 0.02) {
        this.spinSnd.stop(0.1);
        this.spinSnd = null;
      }
    }
    // 火箭
    this.rocketCd -= dt;
    if (this.rocketCd <= 0 && this.seen && dist > 9 && this.gunT <= 0) {
      this.shoot('rocket');
      this.rocketCd = (6 + R.next() * 3) / D.fireRate;
    }
    const pe = p.chestPos(_b);
    const eye = this.eye(_a);
    this.aimPitch = damp(this.aimPitch, clamp(Math.atan2(pe.y - eye.y + 0.8, Math.hypot(pe.x - eye.x, pe.z - eye.z)), -0.6, 0.6), 4, dt);
    this.aimYaw = 0;
  }

  // ───────── 姿态动画 ─────────
  applyPose(dt) {
    const J = this.model.J, root = this.model.root;
    root.rotation.y = this.yaw;
    const fl = this.flinch.value;
    const t = this.time;
    if (this.type === 'sentinel') {
      this.phase += dt * (2 + this.walkK * 7);
      const w = this.walkK;
      const s = Math.sin(this.phase);
      J.hipL.rotation.x = -s * 0.65 * w;
      J.hipR.rotation.x = s * 0.65 * w;
      J.kneeL.rotation.x = Math.max(0, Math.sin(this.phase + 1.2)) * 0.9 * w;
      J.kneeR.rotation.x = Math.max(0, -Math.sin(this.phase + 1.2)) * 0.9 * w;
      J.pelvis.position.y = 1.0 + Math.abs(Math.cos(this.phase)) * 0.04 * w - 0.02 * w;
      const aimK = this.aimK ?? 0;
      J.torso.rotation.y = this.aimYaw * 0.9 + Math.sin(this.phase) * 0.06 * w * (1 - aimK);
      J.torso.rotation.x = -this.aimPitch * 0.5 * aimK + 0.08 * w - fl * 0.08;
      J.torso.rotation.z = fl * 0.05;
      J.head.rotation.x = -this.aimPitch * 0.4 * aimK;
      // 手臂：持枪姿态在“低姿戒备”与“抵肩瞄准”之间混合
      const lowR = -0.55, lowEl = -0.95;
      const aimR = -1.45 - this.aimPitch * 0.5, aimEl = -0.18;
      J.shR.rotation.x = lerp(lowR + s * 0.1 * w, aimR, aimK);
      J.elR.rotation.x = lerp(lowEl, aimEl, aimK);
      J.shR.rotation.z = lerp(0.1, -0.05, aimK);
      J.shL.rotation.x = lerp(-0.7 - s * 0.1 * w, -1.25 - this.aimPitch * 0.5, aimK);
      J.elL.rotation.x = lerp(-1.0, -0.55, aimK);
      J.shL.rotation.z = lerp(-0.1, -0.55, aimK);
      J.shL.rotation.y = lerp(0, -0.4, aimK);
      J.gun.rotation.x = Math.PI / 2;
      J.gun.rotation.y = lerp(0, 0.3, aimK);
      // 预警：面罩充能闪烁
      const tg = this.telegraph > 0 || this.burst > 0;
      this.model.eyeMat.color.setRGB(tg ? 8 : 5, tg ? 3 : 1.8, tg ? 0.8 : 0.3);
    } else if (this.type === 'hound') {
      this.phase += dt * (3 + this.walkK * 12);
      const w = Math.min(1, this.walkK);
      for (const L of J.legs) {
        const ph = this.phase + (L.front ? 0 : Math.PI) + (L.side > 0 ? 0.3 : 0);
        L.hip.rotation.x = -Math.sin(ph) * 0.8 * w;
        L.knee.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.sin(ph + 1)) * 0.9 * w + (L.front ? -0.2 : 0.3);
      }
      J.body.position.y = 0.62 + Math.abs(Math.sin(this.phase)) * 0.06 * w;
      J.body.rotation.x = Math.sin(this.phase * 2) * 0.05 * w - fl * 0.05;
      const atk = this.attackT > 0 ? Math.sin((1 - this.attackT / 0.45) * Math.PI) : 0;
      J.body.rotation.x += -atk * 0.25;
      J.jaw.rotation.x = 0.1 + atk * 0.7 + (this.alerted ? Math.abs(Math.sin(t * 9)) * 0.1 : 0);
      J.head.rotation.x = -atk * 0.3;
      J.tail.rotation.y = Math.sin(t * 8) * 0.3;
    } else if (this.type === 'drone') {
      for (const r of J.rotors) r.rotation.y += dt * 40;
      const v = this.body.vel;
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      const fwd = v.x * s + v.z * c, side = v.x * c - v.z * s;
      J.body.rotation.x = clamp(fwd * 0.06, -0.35, 0.35) + fl * 0.1;
      J.body.rotation.z = clamp(-side * 0.06, -0.35, 0.35);
      J.body.position.y = Math.sin(t * 2.3 + this.id) * 0.06;
      const ch = this.charge > 0;
      this.model.eyeMat.color.setRGB(ch ? 8 : 4.5, ch ? 2 : 0.6, ch ? 7 : 4);
    } else {
      this.phase += dt * (1.5 + this.walkK * 4);
      const w = this.walkK;
      const s = Math.sin(this.phase);
      J.hipL.rotation.x = -s * 0.45 * w;
      J.hipR.rotation.x = s * 0.45 * w;
      J.kneeL.rotation.x = Math.max(0, Math.sin(this.phase + 1.2)) * 0.6 * w;
      J.kneeR.rotation.x = Math.max(0, -Math.sin(this.phase + 1.2)) * 0.6 * w;
      J.pelvis.position.y = 1.32 + Math.abs(Math.cos(this.phase)) * 0.05 * w;
      J.torso.rotation.y = s * 0.05 * w;
      J.torso.rotation.x = 0.05 * w + (this.stagger > 0 ? 0.35 : 0) - fl * 0.03;
      J.shR.rotation.x = -0.15 - this.aimPitch * 0.6;
      J.elR.rotation.x = -this.aimPitch * 0.4;
      J.shL.rotation.x = s * 0.25 * w - 0.1;
      J.barrels.rotation.z += dt * this.spin * 30;
      const hot = this.gunT > 0 || this.windup > 0;
      this.model.eyeMat.color.setRGB(hot ? 8 : 5, hot ? 1.2 : 0.6, 0.25);
    }
  }

  dispose() {
    if (!this.removed) {
      this.mgr.group.remove(this.model.root);
      disposeInstanceMats(this.model);
      this.removed = true;
    }
    if (this.loopSnd) this.loopSnd.stop(0.05);
    if (this.spinSnd) this.spinSnd.stop(0.05);
  }
}

export class EnemyManager {
  constructor(G, T) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.name = 'enemies';
    G.scene.add(this.group);
    this.mats = createRobotMaterials(T);
    this.list = [];
    this.rng = G.rng;
    this.pathBudget = 3;
    this.huntMode = false;
    this.setDifficulty('normal');
    this.onKilledCb = null;
    this.shootTokens = 0;
  }

  setDifficulty(level) {
    const P = {
      easy: { hpMul: 0.85, dmgMul: 0.55, accMul: 1.45, reaction: 0.9, fireRate: 0.8, lead: 0.15, burstExtra: 1, awareRate: 0.75, prefRange: 16, maxShooters: 3 },
      normal: { hpMul: 1, dmgMul: 1, accMul: 1, reaction: 0.6, fireRate: 1, lead: 0.35, burstExtra: 2, awareRate: 1, prefRange: 14, maxShooters: 4 },
      hard: { hpMul: 1.2, dmgMul: 1.4, accMul: 0.72, reaction: 0.38, fireRate: 1.2, lead: 0.55, burstExtra: 3, awareRate: 1.35, prefRange: 12, maxShooters: 6 },
    };
    this.diff = P[level] || P.normal;
    this.level = level;
  }

  spawn(type, x, y, z, opts = {}) {
    const e = new Enemy(this, type, x, y, z, opts);
    this.list.push(e);
    if (opts.spawnFx !== false) {
      const c = e.center(new THREE.Vector3());
      this.G.effects.electric(c.x, c.y, c.z, 8);
    }
    return e;
  }

  get alive() {
    let n = 0;
    for (const e of this.list) if (e.alive) n++;
    return n;
  }

  /** 同时开火人数上限：避免多人同帧齐射造成不可躲避的伤害 */
  canShoot(e) {
    if (this.shootTokens >= this.diff.maxShooters) return false;
    this.shootTokens++;
    return true;
  }

  update(dt) {
    this.pathBudget = 3;
    // 统计当前正在开火的敌人
    let shooting = 0;
    for (const e of this.list) if (e.alive && (e.burst > 0 || e.telegraph > 0 || e.gunT > 0 || e.charge > 0)) shooting++;
    this.shootTokens = shooting;
    for (const e of this.list) e.update(dt);
    // 清理已解体
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.removed && !e.falling) this.list.splice(i, 1);
    }
  }

  raycast(o, d, maxT) {
    const hits = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      const h = e.raycast(o, d, maxT);
      if (h) hits.push(h);
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  propagateAlert(src) {
    for (const e of this.list) {
      if (e === src || !e.alive || e.alerted) continue;
      if (e.body.pos.distanceTo(src.body.pos) < 16) {
        e.alerted = true;
        e.awareness = 1;
        e.knowsPlayer = true;
        e.lastSeen.copy(src.lastSeen);
        e.lastSeenT = e.time;
        e.reaction = Math.max(e.reaction, 0.5);
      }
    }
  }

  noise(x, y, z, radius, loud = true) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.body.pos.x - x, e.body.pos.z - z);
      if (d < radius) e.hear(x, y, z, loud);
    }
  }

  alertAll() {
    for (const e of this.list) if (e.alive) e.hear(this.G.player.body.pos.x, 0, this.G.player.body.pos.z, true);
  }

  onKilled(e, info) {
    if (this.onKilledCb) this.onKilledCb(e, info);
  }

  /** 爆炸伤害（含视线遮挡） */
  explosionDamage(x, y, z, radius, damage, source) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const c = e.center(_v);
      const d = Math.hypot(c.x - x, c.y - y, c.z - z);
      if (d > radius + e.radius) continue;
      if (!this.G.world.segmentClear(x, y + 0.3, z, c.x, c.y, c.z, SIGHT)) continue;
      const k = 1 - Math.max(0, d - e.radius) / radius;
      const dir = new THREE.Vector3(c.x - x, 0, c.z - z).normalize();
      const res = e.damage(damage * k * k, { part: 'body', dir, point: c.clone(), weapon: 'explosive', source, explosive: true, knock: 9 * k });
      if (source === 'player' || source === 'barrel-player') this.G.onEnemyHit(e, res, { point: c.clone() }, true);
    }
  }

  clear() {
    for (const e of this.list) e.dispose();
    this.list.length = 0;
  }
}
