// 主动布娃娃动物:6 个刚体(躯干/头/双臂/双腿)+ 球关节。
// 控制全部采用"速度伺服":躯干/头按目标姿态施加角冲量,手脚末端按目标点施加冲量;
// 躯干由向下射线的悬浮弹簧托住(腿只做步态表演),这样站姿稳定、受击时又软绵绵地晃。
import * as THREE from 'three';
import { RAPIER, GROUPS, G, groups, GRAVITY } from './physics.js';
import { DIM, STAND_H, buildVisual, speciesById } from './animals.js';

const UP = new THREE.Vector3(0, 1, 0);
const RAY_GROUPS = groups(G.BODY, G.ENV | G.PROP | G.BODY);
const HIT_GROUPS = groups(G.BODY, G.BODY | G.LEG | G.PROP);
const GRAB_GROUPS = groups(G.BODY, G.ENV | G.BODY | G.LEG | G.PROP);
const PARTS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
const SIDE = { L: 1, R: -1 }; // 面朝 +Z 时左手在 +X

const v = () => new THREE.Vector3();
const _a = v(), _b = v(), _c = v(), _d = v(), _e = v(), _f = v();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qYaw = new THREE.Quaternion(), _qRoll = new THREE.Quaternion();
const AX_Z = new THREE.Vector3(0, 0, 1);
const AX_X = new THREE.Vector3(1, 0, 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const clampLen = (vec, m) => { const l = vec.length(); if (l > m) vec.multiplyScalar(m / l); return vec; };
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const arr3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

const LOCAL = {
  armTip: arr3(DIM.arm.tip), legTip: arr3(DIM.leg.tip),
  shoulderL: new THREE.Vector3(DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]),
  shoulderR: new THREE.Vector3(-DIM.shoulder[0], DIM.shoulder[1], DIM.shoulder[2]),
  hipL: new THREE.Vector3(DIM.hip[0], DIM.hip[1], DIM.hip[2]),
  hipR: new THREE.Vector3(-DIM.hip[0], DIM.hip[1], DIM.hip[2]),
};

export const MOVE = { walk: 3.5, sprint: 5.9, accel: 30, airAccel: 7, iceAccel: 11, jump: 5.7 };

function newState() { return { p: v(), q: new THREE.Quaternion(), v: v(), w: v() }; }
function readBody(b, st) {
  const t = b.translation(); st.p.set(t.x, t.y, t.z);
  const r = b.rotation(); st.q.set(r.x, r.y, r.z, r.w);
  const l = b.linvel(); st.v.set(l.x, l.y, l.z);
  const a = b.angvel(); st.w.set(a.x, a.y, a.z);
}
const toWorld = (st, local, out) => out.copy(local).applyQuaternion(st.q).add(st.p);
const pointVel = (st, pt, out) => out.subVectors(pt, st.p).crossVectors(st.w, out).add(st.v);

export function emptyIntent() {
  return { moveX: 0, moveZ: 0, sprint: false, jump: false, grab: false, punch: false, kick: false,
    headbutt: false, drop: false, aimPitch: 0, faceYaw: null, mash: 0, emote: false, grabOnly: null };
}

export class Creature {
  constructor(game, opts) {
    this.game = game;
    this.phys = game.phys;
    this.id = opts.id;
    this.name = opts.name || '动物';
    this.species = opts.species;
    this.sp = speciesById[opts.species];
    this.palette = opts.palette || 0;
    this.team = opts.team ?? opts.id;
    this.isPlayer = !!opts.isPlayer;
    this.color = opts.color || '#ffffff';
    this.intent = emptyIntent();
    this.alive = true;
    this.consc = 100;      // 意识值:被打到 0 就晕倒
    this.ko = false; this.koT = 0; this.koCount = 0;
    this.lastHitT = -10;
    this.ragT = 0;         // 软瘫计时(被重击/被扔/飞踢落地)
    this.rise = 1;         // 起身力度渐入
    this.frozen = 0; this.freezeJoints = [];
    this.grip = 100; this.gripLock = 0;
    this.facing = opts.yaw || 0;
    this.phase = 0;
    this.action = null;
    this.punchSide = 'L';
    this.charge = 0; this.charging = false;
    this.jumpLock = 0; this.jumpCD = 0;
    this.grabHold = 0;     // 抓取键按住时长
    this.hands = { L: { joint: null, tgt: null, t: 0 }, R: { joint: null, tgt: null, t: 0 } };
    this.weapon = null;
    this.lifting = false; this.liftT = 0;
    this.heldBy = new Set();
    this.ground = null; this.groundDist = 99; this.grounded = false; this.onIce = false;
    this.faceT = 0; this.faceKind = 'open'; this.blinkT = 2 + Math.random() * 3;
    this.stats = { hits: 0, kos: 0, throws: 0, dmg: 0 };
    this.lastAttacker = null; this.lastAttackerT = -10;
    this.fallT = 0; this.prevTorsoV = v(); this.dvGrace = 0;
    this.eliminatedT = -1;
    this.st = {}; this.prev = {};
    for (const p of PARTS) { this.st[p] = newState(); this.prev[p] = { p: v(), q: new THREE.Quaternion() }; }
    this.buildBodies(opts.pos, this.facing);
    this.vis = buildVisual(this.species, this.palette);
    this.root = new THREE.Group();
    for (const p of PARTS) this.root.add(this.vis[p]);
    game.scene.add(this.root);
    this.readAll();
    for (const p of PARTS) { this.prev[p].p.copy(this.st[p].p); this.prev[p].q.copy(this.st[p].q); }
  }

  // ---------------- 刚体构建 ----------------
  buildBodies(pos, yaw) {
    const W = this.phys.world;
    const qy = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const base = new THREE.Vector3(pos.x, pos.y + STAND_H, pos.z);
    const at = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(qy).add(base);
    const rot = { x: qy.x, y: qy.y, z: qy.z, w: qy.w };
    const mk = (part, p, desc, damp = 0.4) => {
      const b = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(rot)
        .setLinearDamping(0.05).setAngularDamping(damp).setCcdEnabled(part === 'torso' || part === 'head'));
      const c = W.createCollider(desc.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS), b);
      this.phys.owner.set(b.handle, this.id);
      this.phys.setInfo(c, { kind: 'creature', creature: this, part });
      return { b, c };
    };
    const T = DIM.torso, H = DIM.head, A = DIM.arm, L = DIM.leg;
    const torso = mk('torso', base, RAPIER.ColliderDesc.capsule(T.hh, T.r).setMass(T.mass).setFriction(0.5).setRestitution(0.1).setCollisionGroups(GROUPS.body), 0.8);
    const head = mk('head', at(0, DIM.neck.torso[1] - DIM.neck.head[1], 0), RAPIER.ColliderDesc.ball(H.r).setMass(H.mass).setFriction(0.5).setRestitution(0.15).setCollisionGroups(GROUPS.body), 0.8);
    this.B = { torso: torso.b, head: head.b };
    this.Cl = { torso: torso.c, head: head.c };
    this.joints = [];
    const J = (b1, a1, b2, a2) => {
      const j = W.createImpulseJoint(RAPIER.JointData.spherical({ x: a1[0], y: a1[1], z: a1[2] }, { x: a2[0], y: a2[1], z: a2[2] }), b1, b2, true);
      j.setContactsEnabled(false);
      this.joints.push(j);
      return j;
    };
    J(torso.b, DIM.neck.torso, head.b, DIM.neck.head);
    for (const s of ['L', 'R']) {
      const sx = SIDE[s];
      const sh = [DIM.shoulder[0] * sx, DIM.shoulder[1], DIM.shoulder[2]];
      const arm = mk('arm' + s, at(sh[0], sh[1] - A.anchor[1], sh[2]), RAPIER.ColliderDesc.capsule(A.hh, A.r).setMass(A.mass).setFriction(0.9).setCollisionGroups(GROUPS.body), 1.2);
      this.B['arm' + s] = arm.b; this.Cl['arm' + s] = arm.c;
      J(torso.b, sh, arm.b, A.anchor);
      const hp = [DIM.hip[0] * sx, DIM.hip[1], DIM.hip[2]];
      const leg = mk('leg' + s, at(hp[0], hp[1] - L.anchor[1], hp[2]), RAPIER.ColliderDesc.capsule(L.hh, L.r).setMass(L.mass).setFriction(0.9).setCollisionGroups(GROUPS.legStand), 1.2);
      this.B['leg' + s] = leg.b; this.Cl['leg' + s] = leg.c;
      J(torso.b, hp, leg.b, L.anchor);
    }
    this.totalMass = T.mass + H.mass + 2 * A.mass + 2 * L.mass;
    this.legsRag = false;
  }

  readAll() { for (const p of PARTS) readBody(this.B[p], this.st[p]); }

  get pos() { return this.st.torso.p; }
  get headPos() { return this.st.head.p; }
  get dizzy() { return !this.ko && this.consc < 28; }
  get busy() { return this.ko || this.frozen > 0; }

  forward(out) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  aimDir(out) {
    const p = clamp(this.intent.aimPitch, -1.0, 1.1);
    return out.set(Math.sin(this.facing) * Math.cos(p), Math.sin(p), Math.cos(this.facing) * Math.cos(p));
  }

  setLegsRag(on) {
    if (on === this.legsRag) return;
    this.legsRag = on;
    for (const s of ['L', 'R']) this.Cl['leg' + s].setCollisionGroups(on ? GROUPS.legRag : GROUPS.legStand);
  }

  // 给全身加速度变化(跳跃、抛掷、爆炸)
  addVel(x, y, z, scale = 1) {
    for (const p of PARTS) {
      const b = this.B[p], m = b.mass() * scale;
      b.applyImpulse({ x: x * m, y: y * m, z: z * m }, true);
    }
  }
  setVel(x, y, z) { for (const p of PARTS) this.B[p].setLinvel({ x, y, z }, true); }

  // ---------------- 每物理步:控制 ----------------
  preStep(dt, now) {
    if (!this.alive) return;
    this.readAll();
    const it = this.intent;
    const T = this.st.torso;

    // 计时器
    this.ragT = Math.max(0, this.ragT - dt);
    this.jumpLock = Math.max(0, this.jumpLock - dt);
    this.jumpCD = Math.max(0, this.jumpCD - dt);
    this.gripLock = Math.max(0, this.gripLock - dt);
    this.dvGrace = Math.max(0, this.dvGrace - dt);
    this.knockT = Math.max(0, (this.knockT || 0) - dt);
    if (this.climbT > 0) {
      this.climbT -= dt;
      if (!this.climbPushed && this.st.torso.p.y > this.climbY + 0.15) {
        this.climbPushed = true;
        const f = this.forward(_a);
        this.addVel(f.x * 3.2, 0.5, f.z * 3.2);
      }
    }
    this.faceT = Math.max(0, this.faceT - dt);

    // 冰冻
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (it.mash) this.frozen -= it.mash * 0.12;
      if (this.frozen <= 0) this.unfreeze();
      this.consumeEdges();
      return;
    }

    // 晕倒
    if (this.ko) {
      this.koT -= dt;
      if (it.mash) this.koT -= it.mash * 0.16;
      if (this.koT <= 0) this.wake();
      this.limpPose(dt);
      this.consumeEdges();
      return;
    }

    // 意识回复
    if (now - this.lastHitT > 1.6) this.consc = Math.min(100, this.consc + 13 * dt);

    // 被抓时挣扎
    if (it.mash && this.heldBy.size) for (const h of this.heldBy) h.grip -= it.mash * 4;

    this.rise = Math.min(1, this.rise + dt * 1.6);
    let ctrl = this.ragT > 0 ? 0.06 : (this.dizzy ? 0.75 : 1) * (0.35 + 0.65 * this.rise);
    if (this.action?.type === 'dropkick') ctrl = 0.5;
    if (this.knockT > 0 && this.ragT <= 0) ctrl *= 0.55;

    // 朝向
    const mx = it.moveX, mz = it.moveZ;
    const mag = Math.min(1, Math.hypot(mx, mz));
    let want = this.facing;
    const aiming = (this.grabHold > 0.15 || this.weapon || this.charging || (this.action && this.action.type !== 'dropkick')) && it.faceYaw !== null;
    if (aiming) want = it.faceYaw;
    else if (mag > 0.15) want = Math.atan2(mx, mz);
    const dy = wrapAngle(want - this.facing);
    const turn = (this.ragT > 0 ? 2 : 11) * dt;
    this.facing = wrapAngle(this.facing + clamp(dy, -turn, turn));

    // 地面探测
    this.probeGround();
    const envHang = this.hangingEnv();
    const supported = this.ground && this.groundDist < STAND_H + 0.3 && this.jumpLock <= 0 && !envHang && ctrl > 0.2;
    this.grounded = !!(this.ground && this.groundDist < STAND_H + 0.16);

    // 悬浮 + 移动
    let speed = 0;
    if (supported) {
      const gv = this.groundVel(_a);
      let tgtH = STAND_H;
      if (this.charging) tgtH -= 0.05;
      const vyRel = T.v.y - gv.y;
      const vyDes = clamp((tgtH - this.groundDist) * 9, -3, 4);
      let jy = this.totalMass * ((vyDes - vyRel) * 0.3 + -GRAVITY * dt);
      jy = clamp(jy, 0, this.totalMass * 3.2 * -GRAVITY * dt);
      this.B.torso.applyImpulse({ x: 0, y: jy, z: 0 }, true);
      // 对动态地面施加反作用(浮冰、吊桥会被压得倾斜)
      const gb = this.ground.body;
      if (gb && gb.isDynamic()) gb.applyImpulseAtPoint({ x: 0, y: -jy * 0.8, z: 0 }, this.ground.point, true);
      this.moveOnGround(dt, mag, gv, ctrl);
    } else if (ctrl > 0.2) {
      // 空中微调
      const max = (this.sprintSpeed()) * mag;
      _b.set(mx, 0, mz); if (mag > 0) _b.normalize().multiplyScalar(max);
      _c.set(T.v.x, 0, T.v.z);
      _b.sub(_c);
      clampLen(_b, MOVE.airAccel * dt);
      if (mag > 0.05) this.B.torso.applyImpulse({ x: _b.x * this.totalMass * 0.6, y: 0, z: _b.z * this.totalMass * 0.6 }, true);
    }
    speed = Math.hypot(T.v.x, T.v.z);
    this.speed = speed;

    // 输入:动作
    this.handleActions(dt, now, supported, envHang);

    // 姿态目标
    this.drivePose(dt, now, ctrl, speed, supported);

    this.setLegsRag(ctrl < 0.2 || !supported && this.ragT > 0);
    this.prevTorsoV.copy(T.v);
  }

  sprintSpeed() { return this.intent.sprint ? MOVE.sprint : MOVE.walk; }

  probeGround() {
    const T = this.st.torso;
    const o = { x: T.p.x, y: T.p.y, z: T.p.z };
    const ray = this.phys.castRay(o, { x: 0, y: -1, z: 0 }, STAND_H + 0.7, RAY_GROUPS, this.id);
    // 射线落空(脚下是窄缝/边缘)时用小球扫掠兜底,相当于两只脚的支撑面
    const hit = ray ? { collider: ray.collider, dist: ray.toi, ny: ray.normal.y } : (() => {
      const s = this.phys.castBallDown(o, 0.17, STAND_H + 0.5, RAY_GROUPS, this.id);
      return s ? { collider: s.collider, dist: s.dist, ny: 1 } : null;
    })();
    if (hit && hit.ny > 0.5) {
      const col = hit.collider;
      const info = this.phys.info(col);
      this.ground = { collider: col, body: col.parent(), point: { x: T.p.x, y: T.p.y - hit.dist, z: T.p.z }, info };
      this.groundDist = hit.dist;
      this.onIce = !!(info && (info.slippery || info.ice));
    } else {
      this.ground = null; this.groundDist = 99; this.onIce = false;
    }
  }

  groundVel(out) {
    out.set(0, 0, 0);
    const b = this.ground?.body;
    if (!b || b.isFixed()) return out;
    const lv = b.linvel(), av = b.angvel(), t = b.translation(), pt = this.ground.point;
    const rx = pt.x - t.x, ry = pt.y - t.y, rz = pt.z - t.z;
    out.set(lv.x + av.y * rz - av.z * ry, lv.y + av.z * rx - av.x * rz, lv.z + av.x * ry - av.y * rx);
    return out;
  }

  moveOnGround(dt, mag, gv, ctrl) {
    const it = this.intent, T = this.st.torso;
    let max = this.sprintSpeed();
    if (this.dizzy) max *= 0.6;
    if (this.charging) max *= 0.4;
    if (this.lifting) max *= 0.75;
    if (this.action && (this.action.type === 'kick' || this.action.type === 'heavy')) max *= 0.5;
    _b.set(it.moveX, 0, it.moveZ);
    if (mag > 0.01) _b.normalize().multiplyScalar(max * mag);
    if (this.knockT > 0) {
      // 滑退:不听输入,只有很小的减速
      _c.set(T.v.x - gv.x, 0, T.v.z - gv.z).multiplyScalar(-1);
      clampLen(_c, 4.5 * dt);
      this.B.torso.applyImpulse({ x: _c.x * this.totalMass, y: 0, z: _c.z * this.totalMass }, true);
      return;
    }
    _c.set(T.v.x - gv.x, 0, T.v.z - gv.z);
    _b.sub(_c);
    const acc = (this.onIce ? MOVE.iceAccel : MOVE.accel) * (mag > 0.05 || !this.onIce ? 1 : 0.5);
    clampLen(_b, acc * dt * ctrl);
    this.B.torso.applyImpulse({ x: _b.x * this.totalMass, y: 0, z: _b.z * this.totalMass }, true);
  }

  consumeEdges() {
    const it = this.intent;
    it.jump = it.punch = it.kick = it.drop = false; it.mash = 0;
  }

  // ---------------- 动作 ----------------
  handleActions(dt, now, supported, envHang) {
    const it = this.intent;
    const act = this.action;
    if (act) {
      act.t += dt;
      if (act.t >= act.dur || (act.type === 'dropkick' && act.t > 0.3 && this.grounded)) {
        if (act.type === 'dropkick') { this.ragT = Math.max(this.ragT, 0.45); this.rise = 0.2; }
        this.action = null;
      }
    }
    // 抓取键
    if (it.grab && this.gripLock <= 0) this.grabHold += dt; else this.grabHold = 0;
    const grabbing = this.grabHold > 0.12;
    if (!grabbing) { this.releaseHands(); this.lifting = false; this.liftT = 0; }
    const holding = this.heldTarget();
    if (holding && !holding.env) {
      this.liftT += dt;
      const canLift = holding.creature ? (holding.creature.ko || holding.creature.frozen > 0) : (holding.mass < 40);
      this.lifting = canLift && this.liftT > 0.3;
    } else { this.lifting = false; this.liftT = 0; }

    // 握力
    if (holding) {
      let drain = 0;
      if (holding.env && !this.grounded) drain = 7;
      else if (holding.creature && !holding.creature.ko && !holding.creature.frozen) drain = 9;
      else if (holding.creature) drain = 2.5;
      this.grip -= drain * dt;
      if (this.grip <= 0) { this.releaseHands(); this.gripLock = 1.3; this.grip = 0; this.game.emit('gripfail', { c: this }); }
    } else this.grip = Math.min(100, this.grip + 28 * dt);

    // 跳跃 / 攀爬
    if (it.jump) {
      if (envHang || (holding && holding.env)) this.climb();
      else if (this.grounded && this.jumpCD <= 0 && this.ragT <= 0) this.jump();
    }
    if (it.drop && this.weapon) this.dropWeapon(true);

    const free = !this.action || (this.action.type === 'punch' && this.action.t > 0.16);
    if (this.ragT > 0.15) { this.consumeEdges(); this.charging = false; this.charge = 0; return; }

    if ((it.punch || it.kick) && holding && !holding.env) {
      this.throwHeld();
    } else if (it.punch && free) {
      if (this.weapon) this.weapon.use(this);
      else this.startPunch(it.sprint && this.speed > 3.5 && this.grounded);
    } else if (it.kick && this.weapon?.def.throwable) {
      this.weapon.use(this);
    } else if (it.kick && (!this.action || this.action.t > 0.25)) {
      if (!this.grounded && this.ground === null || (!this.grounded && this.groundDist > STAND_H + 0.35)) this.startDropkick();
      else if (!this.action) {
        this.startAction('kick', 0.42, { side: this.punchSide === 'L' ? 'R' : 'L' });
        const f = this.forward(_a);
        this.B.torso.applyImpulse({ x: f.x * this.totalMass * 1.6, y: 0, z: f.z * this.totalMass * 1.6 }, true);
        this.game.emit('swing', { c: this, kind: 'kick' });
      }
    }
    // 头槌:按住蓄力,松开出击
    if (it.headbutt && !this.action) { this.charging = true; this.charge = Math.min(1, this.charge + dt / 0.7); }
    else if (this.charging) {
      this.charging = false;
      this.startAction('headbutt', 0.5, { charge: this.charge });
      const f = this.forward(_a);
      const sp = 3 + this.charge * 4.5;
      this.addVel(f.x * sp, 0.6 + this.charge, f.z * sp, 1);
      this.game.emit('swing', { c: this, kind: 'headbutt' });
      this.charge = 0;
    }
    it.jump = it.punch = it.kick = it.drop = false; it.mash = 0;
  }

  startAction(type, dur, extra = {}) {
    this.action = { type, t: 0, dur, hit: new Set(), ...extra };
    this.dvGrace = Math.max(this.dvGrace, 0.2);
    return this.action;
  }

  startPunch(heavy) {
    this.punchSide = this.punchSide === 'L' ? 'R' : 'L';
    if (this.weapon) this.punchSide = 'R';
    const f = this.forward(_a);
    if (heavy) {
      this.startAction('heavy', 0.55, { side: this.punchSide });
      this.addVel(f.x * 2.2, 0.4, f.z * 2.2);
    } else {
      this.startAction('punch', 0.3, { side: this.punchSide });
      if (this.grounded) this.B.torso.applyImpulse({ x: f.x * this.totalMass * 1.1, y: 0, z: f.z * this.totalMass * 1.1 }, true);
    }
    this.game.emit('swing', { c: this, kind: heavy ? 'heavy' : 'punch' });
  }

  startDropkick() {
    this.startAction('dropkick', 1.0);
    const f = this.forward(_a);
    this.addVel(f.x * 4.2, 2.2, f.z * 4.2);
    this.game.emit('swing', { c: this, kind: 'dropkick' });
  }

  jump() {
    const T = this.st.torso;
    const gv = this.groundVel(_a);
    for (const p of PARTS) {
      const b = this.B[p], m = b.mass(), vy = this.st[p].v.y;
      b.applyImpulse({ x: 0, y: m * (MOVE.jump + Math.max(0, gv.y) - Math.min(vy, 0) * 0.5), z: 0 }, true);
    }
    this.jumpLock = 0.28; this.jumpCD = 0.4;
    this.game.emit('jump', { c: this });
  }

  climb() {
    // 两段式攀爬:先往上翻,身体高过抓点后再往前送
    let gy = this.pos.y;
    for (const s of ['L', 'R']) if (this.hands[s].joint) gy = Math.max(gy, toWorld(this.st['arm' + s], LOCAL.armTip, _b).y);
    const f = this.forward(_a);
    this.releaseHands(true);
    this.setVel(0, 0, 0);
    this.addVel(-f.x * 0.4, 8.2, -f.z * 0.4);
    this.climbT = 0.6; this.climbY = gy; this.climbPushed = false;
    this.jumpLock = 0.3; this.gripLock = 0.35;
    this.game.emit('jump', { c: this, climb: true });
  }

  // ---------------- 姿态驱动 ----------------
  drivePose(dt, now, ctrl, speed, supported) {
    const T = this.st.torso, H = this.st.head;
    const act = this.action;
    const qYaw = _qYaw.setFromAxisAngle(UP, this.facing);
    // 躯干俯仰
    let lean = clamp(speed / MOVE.sprint, 0, 1) * 0.18;
    if (this.charging) lean = -0.35 * this.charge;
    if (act) {
      const k = act.t / act.dur;
      if (act.type === 'headbutt') lean = act.t < 0.3 ? 1.0 : 0.4;
      else if (act.type === 'kick') lean = -0.25;
      else if (act.type === 'dropkick') lean = -1.35;
      else if (act.type === 'heavy') lean = act.t < 0.2 ? -0.3 : 0.45;
      else if (act.type === 'punch') lean = 0.12;
      else if (act.type === 'throw') lean = k < 0.4 ? -0.2 : 0.35;
      else if (act.type === 'swing') lean = act.t < act.wind ? -0.15 : 0.3;
    }
    if (this.grabHold > 0.12 && !this.lifting) lean = Math.max(lean, -clamp(this.intent.aimPitch, -1, 0) * 0.55);
    if (this.lifting) lean = -0.08;
    if (this.hangingEnv()) lean = 0.2;
    const qT = _q2.setFromAxisAngle(AX_X, lean).premultiply(qYaw);
    const torsoGain = ctrl * (supported || act?.type === 'dropkick' ? 1 : 0.55);
    this.servoRot('torso', qT, 12, 14, 0.32, 0.4 * torsoGain);

    // 头:跟随朝向 + 抬头看准星
    const look = -clamp(this.intent.aimPitch, -0.6, 1.0) * 0.45;
    let hp = look + (act?.type === 'headbutt' && act.t < 0.3 ? 0.5 : 0);
    const bob = Math.sin(now * 7 + this.id) * 0.03;
    const qH = _q3.setFromAxisAngle(AX_X, hp + bob).premultiply(qYaw);
    qH.multiply(_qRoll.setFromAxisAngle(AX_Z, Math.sin(now * 2.3 + this.id) * 0.04));
    this.servoRot('head', qH, 14, 16, 0.14, 0.45 * ctrl, T.w);

    // 腿
    this.driveLegs(dt, ctrl, speed, supported);
    // 手臂
    this.driveArms(dt, now, ctrl, speed);

    // 尾巴/耳朵 只是表演
  }

  servoRot(part, qTarget, k, wmax, I, gain, refW) {
    if (gain <= 0.001) return;
    const st = this.st[part];
    _q.copy(st.q).invert().premultiply(qTarget);
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const s = Math.sqrt(Math.max(0, 1 - _q.w * _q.w));
    _d.set(0, 0, 0);
    if (s > 1e-5) { const ang = 2 * Math.acos(clamp(_q.w, -1, 1)); _d.set(_q.x / s * ang, _q.y / s * ang, _q.z / s * ang); }
    _d.multiplyScalar(k);
    clampLen(_d, wmax);
    if (refW) _d.addScaledVector(refW, 0.6);
    _d.sub(st.w).multiplyScalar(I * gain);
    this.B[part].applyTorqueImpulse({ x: _d.x, y: _d.y, z: _d.z }, true);
  }

  // 末端(手/脚)朝目标点的速度伺服
  servoTip(part, localTip, target, k, vmax, m, gain, jmax = 4, react = 0.25) {
    if (gain <= 0.001) return null;
    const st = this.st[part];
    const tip = toWorld(st, localTip, _e);
    const vt = pointVel(st, tip, _f);
    _d.subVectors(target, tip).multiplyScalar(k);
    clampLen(_d, vmax);
    _d.add(this.st.torso.v);
    _d.sub(vt).multiplyScalar(m * gain);
    clampLen(_d, jmax);
    this.B[part].applyImpulseAtPoint({ x: _d.x, y: _d.y, z: _d.z }, { x: tip.x, y: tip.y, z: tip.z }, true);
    // 反作用给躯干:空手时只给一部分(手感更利落),抓住东西时全部返还,保证动量守恒(否则两只互抓会一起飘起来)
    this.B.torso.applyImpulse({ x: -_d.x * react, y: -_d.y * (react < 1 ? react * 0.6 : 1), z: -_d.z * react }, true);
    return _d;
  }

  driveLegs(dt, ctrl, speed, supported) {
    const T = this.st.torso;
    const fwd = this.forward(_a);
    const amp = clamp(speed / 3.2, 0, 1.2);
    this.phase += dt * (4 + speed * 2.3);
    const act = this.action;
    for (const s of ['L', 'R']) {
      const hip = toWorld(T, s === 'L' ? LOCAL.hipL : LOCAL.hipR, _b);
      const ph = this.phase + (s === 'L' ? 0 : Math.PI);
      const tgt = _c.copy(hip);
      let k = 16, vmax = 6, gain = 0.5 * ctrl;
      if (act && (act.type === 'dropkick' || (act.type === 'kick' && act.side === s))) {
        const strike = act.type === 'dropkick' || act.t > 0.07;
        // 腿向前踢出(沿身体前方而非世界水平)
        const fwdB = _d.set(0, 0, 1).applyQuaternion(T.q);
        const downB = _e.set(0, -1, 0).applyQuaternion(T.q);
        if (strike && act.t < act.dur * 0.75) tgt.addScaledVector(fwdB, 0.33).addScaledVector(downB, 0.06);
        else tgt.addScaledVector(fwdB, -0.08).addScaledVector(downB, 0.2);
        k = 30; vmax = 11; gain = 0.7;
      } else if (!supported) {
        tgt.y -= 0.22; tgt.addScaledVector(fwd, 0.06 * (s === 'L' ? 1 : -0.4));
        gain *= 0.6;
      } else {
        const sw = Math.sin(ph) * amp;
        const lift = Math.max(0, Math.cos(ph)) * 0.11 * Math.min(1, amp);
        tgt.y -= 0.28 - lift;
        tgt.addScaledVector(fwd, sw * 0.17);
      }
      this.servoTip('leg' + s, LOCAL.legTip, tgt, k, vmax, 0.5, gain, 5);
    }
  }

  driveArms(dt, now, ctrl, speed) {
    const T = this.st.torso;
    const fwd = this.forward(_a);
    const aim = this.aimDir(new THREE.Vector3());
    const act = this.action;
    const amp = clamp(speed / 3.2, 0, 1);
    const grabbing = this.grabHold > 0.12;
    for (const s of ['L', 'R']) {
      const side = SIDE[s];
      const sh = toWorld(T, s === 'L' ? LOCAL.shoulderL : LOCAL.shoulderR, new THREE.Vector3());
      const right = _b.set(Math.cos(this.facing), 0, -Math.sin(this.facing)).multiplyScalar(side); // 指向该侧外侧
      const tgt = new THREE.Vector3().copy(sh);
      let k = 10, vmax = 5, gain = 0.35 * ctrl, jmax = 2.5;
      const hand = this.hands[s];
      const weaponArm = this.weapon && s === 'R';
      if (act && (act.type === 'punch' || act.type === 'heavy') && act.side === s) {
        const wind = act.type === 'heavy' ? 0.2 : 0.06;
        if (act.t < wind) tgt.addScaledVector(fwd, -0.12).addScaledVector(right, 0.06).y -= 0.08;
        else if (act.t < wind + 0.14) tgt.addScaledVector(aim, act.type === 'heavy' ? 0.68 : 0.6).addScaledVector(right, -0.13);
        else tgt.addScaledVector(fwd, 0.15).y -= 0.15;
        k = 40; vmax = act.type === 'heavy' ? 15 : 13; gain = 0.75; jmax = act.type === 'heavy' ? 6 : 4.5;
      } else if (act && act.type === 'swing' && weaponArm) {
        const w = act.wind;
        if (act.t < w) tgt.addScaledVector(fwd, -0.1).addScaledVector(right, 0.1).y += 0.38;
        else if (act.t < w + act.strike) tgt.addScaledVector(aim, 0.5).addScaledVector(right, -0.15).y -= 0.12;
        else tgt.addScaledVector(fwd, 0.2).y -= 0.1;
        k = 40; vmax = act.heavy ? 11 : 15; gain = 0.8; jmax = act.heavy ? 8 : 6;
      } else if (act && act.type === 'throw') {
        if (act.t < 0.1) tgt.y += 0.4; else tgt.addScaledVector(aim, 0.6).y += 0.1;
        k = 30; vmax = 12; gain = 0.7; jmax = 5;
      } else if (this.lifting) {
        tgt.addScaledVector(fwd, 0.08).addScaledVector(right, -0.1).y += 0.46;
        k = 18; vmax = 6; gain = 0.6; jmax = 5;
      } else if (grabbing && !weaponArm) {
        tgt.addScaledVector(aim, 0.46).addScaledVector(right, -0.1);
        k = 18; vmax = 8; gain = hand.joint ? 0.55 : 0.6; jmax = hand.joint ? 5 : 3.5;
      } else if (weaponArm && this.weapon.def.gun) {
        tgt.addScaledVector(aim, 0.5).addScaledVector(right, -0.06);
        k = 22; vmax = 8; gain = 0.6; jmax = 4;
      } else if (weaponArm) {
        tgt.addScaledVector(fwd, 0.28).addScaledVector(right, 0.02).y -= 0.12;
        k = 16; vmax = 7; gain = 0.55; jmax = 4;
      } else if (this.charging) {
        tgt.addScaledVector(fwd, -0.1).addScaledVector(right, 0.12).y -= 0.18;
      } else {
        // 自然下垂 + 走路摆臂
        const sw = Math.sin(this.phase + (s === 'L' ? Math.PI : 0)) * amp;
        tgt.addScaledVector(fwd, 0.04 + sw * 0.14).addScaledVector(right, 0.05).y -= 0.26;
        if (!this.grounded) tgt.addScaledVector(right, 0.12).y += 0.18; // 空中张开手臂
        gain = 0.22 * ctrl;
      }
      this.servoTip('arm' + s, LOCAL.armTip, tgt, k, vmax, 0.36, gain, jmax, hand.joint || weaponArm ? 1 : 0.25);
    }
  }

  limpPose(dt) {
    // 晕倒时保留极弱的姿态,避免关节完全乱转
    this.setLegsRag(true);
    this.charging = false; this.charge = 0;
    this.action = null;
    this.grabHold = 0;
  }

  // ---------------- 每物理步之后:命中、抓取、冲击 ----------------
  postStep(dt, now) {
    if (!this.alive) return;
    for (const p of PARTS) { this.prev[p].p.copy(this.st[p].p); this.prev[p].q.copy(this.st[p].q); }
    this.readAll();
    const T = this.st.torso;
    // 冲击伤害(被扔撞墙、高处摔落)
    const dv = _a.subVectors(T.v, this.prevTorsoV).length();
    if (dv > 10 && this.dvGrace <= 0) {
      const dmg = (dv - 10) * 3.2;
      this.dvGrace = 0.25;
      this.damage(dmg, null, 'impact');
      this.game.emit('impact', { c: this, dv, p: T.p.clone() });
    }
    this.prevTorsoV.copy(T.v);
    if (this.busy) return;
    this.resolveHits(now);
    if (this.grabHold > 0.12 && this.gripLock <= 0) this.tryAttach();
    this.updateHeld(dt);
  }

  attackPoints(out) {
    const a = this.action;
    if (!a) return out;
    const tip = (part, local) => toWorld(this.st[part], local, new THREE.Vector3());
    switch (a.type) {
      case 'punch': if (a.t > 0.05 && a.t < 0.22) out.push({ p: tip('arm' + a.side, LOCAL.armTip), part: 'arm' + a.side, r: 0.15, dmg: 10, imp: 22, minRel: 1.8, rag: 0 }); break;
      case 'heavy': if (a.t > 0.19 && a.t < 0.38) out.push({ p: tip('arm' + a.side, LOCAL.armTip), part: 'arm' + a.side, r: 0.17, dmg: 21, imp: 40, minRel: 2, rag: 0.6 }); break;
      case 'kick': if (a.t > 0.07 && a.t < 0.28) out.push({ p: tip('leg' + a.side, LOCAL.legTip), part: 'leg' + a.side, r: 0.22, dmg: 13, imp: 24, minRel: 1.6, rag: 0.3 }); break;
      case 'dropkick': if (a.t > 0.06 && a.t < 0.7) for (const s of ['L', 'R']) out.push({ p: tip('leg' + s, LOCAL.legTip), part: 'leg' + s, r: 0.2, dmg: 24, imp: 60, minRel: 2, rag: 1.0 }); break;
      case 'headbutt': if (a.t > 0.03 && a.t < 0.32) {
        const h = this.st.head;
        out.push({ p: this.forward(new THREE.Vector3()).multiplyScalar(0.27).add(h.p), part: 'head', r: 0.2, dmg: 11 + 20 * a.charge, imp: 20 + 38 * a.charge, minRel: 1.5, rag: 0.3 + 0.6 * a.charge });
      } break;
      case 'swing': if (this.weapon && a.t > a.wind && a.t < a.wind + a.strike + 0.04) {
        for (const p of this.weapon.hitPoints()) out.push({ p, part: 'weapon', r: this.weapon.def.hitR, dmg: this.weapon.def.dmg, imp: this.weapon.def.imp, minRel: 2, rag: this.weapon.def.rag, weapon: this.weapon });
      } break;
    }
    return out;
  }

  resolveHits(now) {
    const pts = this.attackPoints([]);
    if (!pts.length) return;
    const a = this.action;
    for (const ap of pts) {
      const srcSt = ap.part === 'weapon' ? null : this.st[ap.part];
      this.phys.overlapBall(ap.p, ap.r, HIT_GROUPS, (col) => {
        const info = this.phys.info(col);
        if (!info) return;
        if (info.kind === 'creature') {
          const vic = info.creature;
          if (vic === this || a.hit.has(vic) || !vic.alive) return;
          if (vic.team === this.team && this.game.friendlyFire === false) return;
          // 相对速度
          const va = srcSt ? pointVel(srcSt, ap.p, new THREE.Vector3()) : (ap.weapon ? ap.weapon.pointVel(ap.p, new THREE.Vector3()) : this.st.torso.v.clone());
          const vb = vic.st[info.part].v;
          const rel = va.clone().sub(vb);
          const relSpeed = rel.length();
          if (relSpeed < ap.minRel) return;
          a.hit.add(vic);
          const dir = rel.normalize();
          const f = this.forward(new THREE.Vector3());
          dir.lerp(f, 0.5).normalize();
          dir.y = Math.max(dir.y, 0.15);
          const sf = clamp(relSpeed / 7, 0.65, 1.35);
          vic.receiveHit({ attacker: this, part: info.part, dmg: ap.dmg * sf, imp: ap.imp * sf, dir, point: ap.p, rag: ap.rag, kind: a.type, weapon: ap.weapon });
          if (ap.weapon) ap.weapon.onHit(vic);
        } else if (info.kind === 'item') {
          const it = info.item;
          if (a.hit.has(it) || it.holder === this) return;
          a.hit.add(it);
          const f = this.forward(new THREE.Vector3());
          const m = it.body.mass();
          const imp = ap.imp * 0.8;
          it.body.applyImpulse({ x: f.x * imp, y: imp * 0.35, z: f.z * imp }, true);
          this.game.emit('hitprop', { c: this, item: it, p: ap.p.clone(), m });
        }
      });
    }
  }

  receiveHit(h) {
    if (!this.alive) return;
    const mult = h.part === 'head' ? 1.3 : h.part === 'torso' ? 1 : 0.7;
    const dmg = h.dmg * mult;
    const body = this.B[h.part] || this.B.torso;
    const I = h.imp * (this.consc < 35 ? 1.2 : 1);
    const dy = Math.max(h.dir.y, 0.22);
    // 被打中的部位先猛地一甩(头被打歪),再给全身一个击退速度
    body.applyImpulseAtPoint({ x: h.dir.x * I * 0.4, y: dy * I * 0.4, z: h.dir.z * I * 0.4 }, { x: h.point.x, y: h.point.y, z: h.point.z }, true);
    const dv = I * 1.7 / this.totalMass;
    this.addVel(h.dir.x * dv, dy * dv * 0.5, h.dir.z * dv);
    // 受击滑退:一段时间内不受移动输入控制、只靠很小的摩擦停下,姿态也放软会晃;重击直接软瘫
    this.knockT = Math.max(this.knockT || 0, 0.22 + I / 110);
    if (h.rag) this.ragT = Math.max(this.ragT, h.rag * (this.consc < 40 ? 1.5 : 1));
    this.jiggle = { part: h.part, t: 0, amp: Math.min(0.38, 0.12 + I / 120) };
    this.dvGrace = 0.3;
    this.lastAttacker = h.attacker; this.lastAttackerT = this.game.time;
    if (h.attacker) { h.attacker.stats.hits++; h.attacker.stats.dmg += dmg; }
    this.damage(dmg, h.attacker, h.kind);
    this.game.emit('hit', { c: this, attacker: h.attacker, dmg, part: h.part, p: h.point.clone(), kind: h.kind, weapon: h.weapon });
    // 被打时松手
    if (dmg > 14 && Math.random() < 0.5) this.releaseHands();
    if (this.weapon && dmg > 18 && Math.random() < 0.35) this.dropWeapon(false);
  }

  damage(d, attacker, kind) {
    if (!this.alive) return;
    this.lastHitT = this.game.time;
    this.faceT = 0.35;
    if (this.ko) { this.koT = Math.min(this.koT + d * 0.025, 10); return; }
    if (this.frozen > 0) return;
    this.consc -= d;
    if (this.consc <= 0) this.knockOut(attacker);
  }

  knockOut(by) {
    if (this.ko || !this.alive) return;
    this.ko = true;
    this.koT = Math.min(5.2 + this.koCount * 1.4, 10);
    this.koCount++;
    this.consc = 0;
    this.releaseHands();
    if (this.weapon) this.dropWeapon(false);
    this.setLegsRag(true);
    const att = by || (this.game.time - this.lastAttackerT < 4 ? this.lastAttacker : null);
    if (att && att !== this) att.stats.kos++;
    this.game.emit('ko', { c: this, by: att });
  }

  wake() {
    this.ko = false;
    this.consc = 42;
    this.rise = 0;
    this.ragT = 0.2;
    this.game.emit('wake', { c: this });
  }

  // ---------------- 抓取 ----------------
  heldTarget() {
    for (const s of ['L', 'R']) { const h = this.hands[s]; if (h.joint && h.tgt) return h.tgt; }
    return null;
  }
  hangingEnv() {
    for (const s of ['L', 'R']) { const h = this.hands[s]; if (h.joint && h.tgt?.env) return !this.grounded || this.ragT > 0; }
    return false;
  }

  tryAttach() {
    // 宽松拾取:脚前地上的武器直接拿起
    if (!this.weapon && !this.heldTarget()) {
      const only = this.intent.grabOnly;
      const f = this.forward(_a);
      const c = new THREE.Vector3(this.pos.x + f.x * 0.45, this.pos.y - 0.25, this.pos.z + f.z * 0.45);
      let best = null, bd = 9;
      this.phys.overlapBall(c, 0.5, GRAB_GROUPS, (col) => {
        const info = this.phys.info(col);
        if (info?.kind !== 'item' || !(info.item.def.weapon || info.item.def.throwable) || info.item.holder || (only && only !== info.item)) return;
        const d = info.item.curP.distanceTo(c);
        if (d < bd) { bd = d; best = info.item; }
      });
      if (best) { if (this.hands.R.joint) this.detachHand('R'); best.equip(this); return; }
    }
    for (const s of ['L', 'R']) {
      const hand = this.hands[s];
      if (hand.joint) continue;
      if (this.weapon && s === 'R') continue;
      const tip = toWorld(this.st['arm' + s], LOCAL.armTip, new THREE.Vector3());
      let best = null, bestScore = -1;
      this.phys.overlapBall(tip, 0.13, GRAB_GROUPS, (col) => {
        const info = this.phys.info(col);
        if (!info) return;
        let score = 0;
        const only = this.intent.grabOnly;
        if (only && info.creature !== only && info.item !== only && !(only === 'env' && info.kind === 'env')) return;
        if (info.kind === 'creature') { if (info.creature === this || !info.creature.alive) return; score = 3; }
        else if (info.kind === 'item') { if (info.item.holder && info.item.holder !== this) score = 1; else score = info.item.def.weapon ? 4 : 2; }
        else if (info.kind === 'env') { if (info.noGrab) return; score = 1; }
        else return;
        if (score > bestScore) { bestScore = score; best = { col, info }; }
      });
      if (!best) continue;
      const { col, info } = best;
      if (info.kind === 'item' && (info.item.def.weapon || info.item.def.throwable) && !this.weapon && !info.item.holder) {
        if (this.hands.R.joint) this.detachHand('R');
        info.item.equip(this);
        continue;
      }
      const body = col.parent();
      if (!body) continue;
      this.attachHand(s, body, tip, info);
    }
  }

  attachHand(s, body, worldPt, info) {
    const t = body.translation(), r = body.rotation();
    const qi = _q.set(r.x, r.y, r.z, r.w).invert();
    const local = _a.set(worldPt.x - t.x, worldPt.y - t.y, worldPt.z - t.z).applyQuaternion(qi);
    const tip = LOCAL.armTip;
    const j = this.phys.world.createImpulseJoint(
      RAPIER.JointData.spherical({ x: tip.x, y: tip.y, z: tip.z }, { x: local.x, y: local.y, z: local.z }),
      this.B['arm' + s], body, true);
    j.setContactsEnabled(false);
    const tgt = { body, env: info.kind === 'env', creature: info.kind === 'creature' ? info.creature : null, item: info.kind === 'item' ? info.item : null, mass: body.mass() };
    if (tgt.creature) { tgt.creature.heldBy.add(this); tgt.mass = tgt.creature.totalMass; }
    if (tgt.item) tgt.item.onGrab?.(this);
    this.hands[s] = { joint: j, tgt, t: 0 };
    this.game.emit('grab', { c: this, tgt });
  }

  detachHand(s) {
    const h = this.hands[s];
    if (h.joint) {
      try { this.phys.world.removeImpulseJoint(h.joint, true); } catch (e) { /* 已随刚体移除 */ }
      if (h.tgt?.creature) {
        const other = h.tgt.creature;
        const still = ['L', 'R'].some((k) => k !== s && this.hands[k].tgt?.creature === other);
        if (!still) other.heldBy.delete(this);
      }
    }
    this.hands[s] = { joint: null, tgt: null, t: 0 };
  }

  releaseHands(silent) {
    let had = false;
    for (const s of ['L', 'R']) if (this.hands[s].joint) { had = true; this.detachHand(s); }
    this.lifting = false;
    if (had && !silent) this.game.emit('release', { c: this });
  }

  // 举起时辅助把目标托到头顶
  updateHeld(dt) {
    const held = this.heldTarget();
    if (!held || held.env) return;
    for (const s of ['L', 'R']) this.hands[s].t += dt;
    const H = this.st.head;
    if (this.lifting) {
      const tb = held.creature ? held.creature.B.torso : held.body;
      const mass = held.creature ? held.creature.totalMass : held.mass;
      const p = tb.translation(), vv = tb.linvel();
      const goal = _a.copy(H.p).addScaledVector(this.forward(_b), 0.05);
      goal.y += 0.62;
      const dvx = clamp((goal.x - p.x) * 7, -5, 5) + this.st.torso.v.x - vv.x;
      const dvy = clamp((goal.y - p.y) * 7, -5, 5) + this.st.torso.v.y - vv.y;
      const dvz = clamp((goal.z - p.z) * 7, -5, 5) + this.st.torso.v.z - vv.z;
      const g = -GRAVITY * dt;
      const jx = mass * dvx * 0.25, jy = mass * (dvy * 0.25 + g), jz = mass * dvz * 0.25;
      tb.applyImpulse({ x: jx, y: jy, z: jz }, true);
      // 反作用全部压回举起者(由悬浮弹簧承重),否则两者会一起被"举"上天
      this.B.torso.applyImpulse({ x: -jx * 0.5, y: -jy, z: -jz * 0.5 }, true);
    } else if (held.creature) {
      // 拖拽:轻微把对方拉向自己正前方
      const tb = held.creature.B.torso;
      const p = tb.translation();
      const goal = _a.copy(this.st.torso.p).addScaledVector(this.forward(_b), 0.75);
      const m = held.creature.totalMass;
      tb.applyImpulse({ x: (goal.x - p.x) * m * 0.04, y: 0, z: (goal.z - p.z) * m * 0.04 }, true);
    }
  }

  throwHeld() {
    const held = this.heldTarget();
    if (!held) return;
    this.releaseHands(true);
    const f = this.aimDir(new THREE.Vector3());
    f.y = Math.max(f.y, 0) * 0.6;
    f.normalize();
    const lifted = this.lifting;
    let sp = lifted ? 9.5 : 6.5;
    let up = lifted ? 4.8 : 3.2;
    if (held.creature) {
      const c = held.creature;
      // 清醒的对手会挣扎,甩不远
      const helpless = c.ko || c.frozen > 0;
      if (!helpless) { sp = 3.6; up = 2.2; }
      c.setVel(this.st.torso.v.x * 0.5, 0, this.st.torso.v.z * 0.5);
      c.addVel(f.x * sp, up + f.y * sp, f.z * sp);
      c.ragT = Math.max(c.ragT, helpless ? 1.1 : 0.45);
      c.lastAttacker = this; c.lastAttackerT = this.game.time;
      c.dvGrace = 0.2;
      this.stats.throws++;
    } else if (held.body) {
      const m = held.body.mass();
      const s = clamp(Math.sqrt(8 / Math.max(m, 0.5)), 0.35, 1.6);
      held.body.setLinvel({ x: f.x * sp * s, y: (up + f.y * sp) * s, z: f.z * sp * s }, true);
      held.item?.onThrow?.(this);
    }
    this.lifting = false;
    this.grabHold = 0;
    this.gripLock = 0.35;
    this.startAction('throw', 0.32);
    this.game.emit('throw', { c: this, tgt: held });
  }

  dropWeapon(placed) {
    if (!this.weapon) return;
    const w = this.weapon;
    w.unequip(placed);
  }

  // ---------------- 冰冻 ----------------
  freeze(sec) {
    if (!this.alive || this.ko) return;
    if (this.frozen > 0) { this.frozen = Math.max(this.frozen, sec); return; }
    this.frozen = sec;
    this.releaseHands();
    if (this.weapon) this.dropWeapon(false);
    const W = this.phys.world;
    const T = this.B.torso, tp = T.translation(), tr = T.rotation();
    const qT = new THREE.Quaternion(tr.x, tr.y, tr.z, tr.w), qTi = qT.clone().invert();
    for (const p of PARTS) {
      if (p === 'torso') continue;
      const b = this.B[p], bp = b.translation(), br = b.rotation();
      const rel = new THREE.Vector3(bp.x - tp.x, bp.y - tp.y, bp.z - tp.z).applyQuaternion(qTi);
      const qr = qTi.clone().multiply(new THREE.Quaternion(br.x, br.y, br.z, br.w));
      const j = W.createImpulseJoint(RAPIER.JointData.fixed({ x: rel.x, y: rel.y, z: rel.z }, { x: qr.x, y: qr.y, z: qr.z, w: qr.w }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), T, b, true);
      j.setContactsEnabled(false);
      this.freezeJoints.push(j);
    }
    for (const p of PARTS) this.Cl[p].setFriction(0.02);
    this.setLegsRag(true);
    this.game.emit('freeze', { c: this });
  }
  unfreeze() {
    this.frozen = 0;
    for (const j of this.freezeJoints) { try { this.phys.world.removeImpulseJoint(j, true); } catch (e) { /* ignore */ } }
    this.freezeJoints = [];
    for (const p of PARTS) this.Cl[p].setFriction(p.startsWith('arm') || p.startsWith('leg') ? 0.9 : 0.5);
    this.rise = 0.3;
    this.game.emit('thaw', { c: this });
  }

  // ---------------- 淘汰 ----------------
  eliminate(reason) {
    if (!this.alive) return;
    this.alive = false;
    this.ko = false;
    this.releaseHands(true);
    for (const h of [...this.heldBy]) {
      for (const s of ['L', 'R']) if (h.hands[s].tgt?.creature === this) h.detachHand(s);
    }
    this.heldBy.clear();
    if (this.weapon) this.dropWeapon(false);
    if (this.frozen) this.unfreeze();
    this.eliminatedT = this.game.time;
    this.elimReason = reason;
    this.game.emit('eliminate', { c: this, reason, by: this.game.time - this.lastAttackerT < 8 ? this.lastAttacker : null });
  }

  disablePhysics() {
    for (const p of PARTS) this.B[p].setEnabled(false);
  }

  destroy() {
    const W = this.phys.world;
    this.releaseHands(true);
    if (this.weapon) this.dropWeapon(false);
    for (const p of PARTS) { this.phys.owner.delete(this.B[p].handle); this.phys.colliderInfo.delete(this.Cl[p].handle); W.removeRigidBody(this.B[p]); }
    this.game.scene.remove(this.root);
  }

  // ---------------- 渲染同步 ----------------
  render(alpha, now, dt) {
    if (!this.root.visible) return;
    for (const p of PARTS) {
      const g = this.vis[p], a = this.prev[p], b = this.st[p];
      g.position.lerpVectors(a.p, b.p, alpha);
      g.quaternion.slerpQuaternions(a.q, b.q, alpha);
    }
    // 受击挤压弹跳
    if (this.jiggle) {
      const j = this.jiggle; j.t += dt;
      const g = this.vis[j.part] || this.vis.torso;
      const k = j.t / 0.32;
      if (k >= 1) { g.scale.setScalar(1); if (j.part !== 'head') this.vis.head.scale.setScalar(1); this.jiggle = null; }
      else {
        const a = j.amp * Math.sin(k * Math.PI * 3) * (1 - k);
        g.scale.set(1 + a, 1 - a, 1 + a);
        if (j.part !== 'head') this.vis.head.scale.set(1 + a * 0.4, 1 - a * 0.4, 1 + a * 0.4);
      }
    }
    // 表情
    let face = 'open';
    if (this.ko) face = 'ko';
    else if (this.frozen > 0) face = 'hurt';
    else if (this.faceT > 0) face = 'hurt';
    else if (this.game.winnerFace?.has(this)) face = 'happy';
    else if (this.action || this.charging) face = 'angry';
    else {
      this.blinkT -= dt;
      if (this.blinkT < 0) { face = 'blink'; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3.5; }
    }
    this.vis.setFace(face);
    if (this.vis.tail) {
      const wag = this.ko ? 0 : Math.sin(now * (this.speed > 1 ? 14 : 6) + this.id) * (this.speed > 1 ? 0.45 : 0.18);
      this.vis.tail.rotation.y = wag;
    }
  }
}
