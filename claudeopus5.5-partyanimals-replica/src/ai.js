// 电脑对手:只通过与玩家相同的 intent 操作。思考频率与反应随难度变化。
// 行为优先级:地图机关规避 → 被抓/晕倒挣扎 → 捡武器 → 扛着晕倒的对手走到最近的悬崖边扔下去
//            → 追打清醒对手(对手靠近边缘时抓住推下去)。所有移动都先探测前方地面,避免自己走下去。
import * as THREE from 'three';
import { groups, G } from './physics.js';

const GROUND = groups(G.BODY, G.ENV | G.PROP);
const DIFF = [
  { think: 0.38, punch: 1.0, mash: 3, aim: 0.5, speedy: 0.3, edgeGrab: 0.25 },  // 简单
  { think: 0.22, punch: 1.7, mash: 5.5, aim: 0.8, speedy: 0.6, edgeGrab: 0.6 },  // 普通
  { think: 0.12, punch: 2.4, mash: 9, aim: 1.0, speedy: 0.9, edgeGrab: 1.0 },    // 困难
];
const ang = (x, z) => Math.atan2(x, z);
const DIRS = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return [Math.sin(a), Math.cos(a)]; });

export class Brain {
  constructor(c, game, difficulty = 1) {
    this.c = c; this.game = game; this.d = DIFF[difficulty] || DIFF[1];
    this.t = Math.random() * 0.3;
    this.target = null;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.grabWant = 0; this.charge = 0; this.dropkickT = 0;
    this.mashAcc = 0;
    this.wander = new THREE.Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4);
    this.carryT = 0;
    this.edge = null;
  }

  hasGround(x, z, y, drop = 3.2) {
    return !!this.game.phys.castRay({ x, y: y + 0.6, z }, { x: 0, y: -1, z: 0 }, drop, GROUND);
  }
  // 从 P 沿 (ux,uz) 走 dist 米,途中是否一直有落差不大的地面
  pathClear(P, ux, uz, dist) { return this.gapAt(P, ux, uz, dist) === null; }
  gapAt(P, ux, uz, dist) {
    for (let r = 0.45; r <= dist + 0.01; r += 0.45) if (!this.hasGround(P.x + ux * r, P.z + uz * r, P.y - 0.4, 1.6)) return r;
    return null;
  }

  // 最近的"悬崖方向":沿 12 个方向探测地面,返回最先断掉的方向和距离
  findEdge(P) {
    let best = null;
    for (const [dx, dz] of DIRS) {
      for (const r of [1.2, 2.2, 3.4, 4.8]) {
        if (!this.hasGround(P.x + dx * r, P.z + dz * r, P.y - 0.4)) {
          if (!best || r < best.dist) best = { dir: new THREE.Vector3(dx, 0, dz), dist: r };
          break;
        }
      }
    }
    return best;
  }

  center() { const t = this.game.map.cam.target; return new THREE.Vector3(t[0], 0, t[2]); }

  step(dt) {
    const c = this.c, it = c.intent;
    if (!c.alive) return;
    // 挣扎:晕倒/冰冻/被抓
    if (c.ko || c.frozen > 0 || c.heldBy.size) {
      this.mashAcc += dt * this.d.mash * (0.6 + Math.random() * 0.8);
      if (this.mashAcc >= 1) { it.mash += Math.floor(this.mashAcc); this.mashAcc %= 1; }
      if (c.ko || c.frozen) { it.moveX = it.moveZ = 0; it.grab = false; return; }
    }
    // 挂在边上 → 爬
    if (c.hangingEnv()) { it.grab = true; it.moveX = it.moveZ = 0; if (Math.random() < dt * 2.5) it.jump = true; return; }

    this.t -= dt;
    if (this.t <= 0) { this.t = this.d.think * (0.7 + Math.random() * 0.6); this.think(); }
    this.steer(dt);
  }

  think() {
    const c = this.c, g = this.game;
    const P = c.pos;
    this.hint = g.map.aiHint?.(c) || null;
    this.edge = this.findEdge(P);
    let best = null, bestS = Infinity;
    for (const o of g.creatures) {
      if (o === c || !o.alive || o.team === c.team) continue;
      if (Math.abs(o.pos.y - P.y) > 3) continue;
      const d = o.pos.distanceTo(P);
      let s = d;
      if (o.ko || o.frozen > 0) s -= 3;
      if (o === this.target) s -= 1;
      if (s < bestS) { bestS = s; best = o; }
    }
    this.target = best;
    this.weaponGoal = null;
    if (!c.weapon && !c.heldTarget()) {
      let bw = null, bd = 6;
      for (const item of g.items) {
        if (!item.alive || item.holder || !item.def.weapon) continue;
        const p = item.curP;
        const d = Math.hypot(p.x - P.x, p.z - P.z);
        if (d < bd && Math.abs(p.y - P.y) < 1.2 && this.hasGround(p.x, p.z, p.y)) { bd = d; bw = item; }
      }
      if (bw && (!best || bd < best.pos.distanceTo(P) * 0.8)) this.weaponGoal = bw;
    }
    if (Math.random() < 0.15) this.wander.set((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5);
  }

  steer(dt) {
    const c = this.c, it = c.intent;
    const P = c.pos;
    const C = this.center();
    let gx = P.x, gz = P.z, faceTo = null, fight = false, allowEdge = false;
    it.punch = it.kick = false;
    it.sprint = false;
    it.aimPitch = 0;
    it.grab = false;
    it.grabOnly = null;
    const held = c.heldTarget();
    if (this.hint?.goto) {
      gx = this.hint.goto[0]; gz = this.hint.goto[1];
      const d = Math.hypot(gx - P.x, gz - P.z);
      it.sprint = d > 1.5;
      it.grab = !!this.hint.grab && d < 1.2;
      it.grabOnly = 'env';
      if (held && !held.env) it.grab = false;
    } else if (held && held.creature) {
      const v = held.creature;
      const helpless = v.ko || v.frozen > 0;
      this.carryT += dt;
      it.grab = true;
      it.grabOnly = v;
      const e = this.edge;
      if (e) faceTo = e.dir;
      if (!helpless) {
        // 抓住清醒对手:就在边缘附近就甩出去,否则很快松手
        if (e && e.dist <= 1.5 && this.carryT > 0.6) it.punch = true;
        else if (this.carryT > 1.1) { it.grab = false; this.grabWant = 0; this.carryT = 0; }
        if (e) { gx = P.x + e.dir.x; gz = P.z + e.dir.z; }
      } else if (e) {
        gx = P.x + e.dir.x * 3; gz = P.z + e.dir.z * 3;
        allowEdge = true;
        const atEdge = !this.hasGround(P.x + e.dir.x * 1.0, P.z + e.dir.z * 1.0, P.y - 0.4);
        if (atEdge) { gx = P.x; gz = P.z; if (c.lifting || this.carryT > 2.5) { it.punch = true; this.carryT = 0; } }
        if (this.carryT > 8) it.punch = true;
      } else if (this.carryT > 3) it.punch = true;
    } else if (this.weaponGoal && this.weaponGoal.alive && !this.weaponGoal.holder) {
      const p = this.weaponGoal.curP;
      gx = p.x; gz = p.z;
      const d = Math.hypot(p.x - P.x, p.z - P.z);
      it.grab = d < 1.2;
      it.grabOnly = this.weaponGoal;
      it.aimPitch = -0.55;
      this.carryT = 0;
    } else if (this.target) {
      const T = this.target, tp = T.pos;
      const dist = Math.hypot(tp.x - P.x, tp.z - P.z);
      gx = tp.x; gz = tp.z;
      faceTo = new THREE.Vector3(tp.x - P.x, 0, tp.z - P.z).normalize();
      this.carryT = 0;
      if (T.ko || T.frozen > 0) {
        it.grab = dist < 1.5;
        it.grabOnly = T;
        it.aimPitch = -0.45;
        it.sprint = dist > 3;
      } else {
        it.sprint = dist > 4 && Math.random() < this.d.speedy;
        if (dist < 1.25) {
          fight = true;
          if (Math.random() < this.d.punch * dt) {
            const r = Math.random();
            if (c.weapon) it.punch = true;
            else if (r < 0.62) it.punch = true;
            else if (r < 0.84) it.kick = true;
            else this.charge = 0.3 + Math.random() * 0.4;
          }
          // 对手靠近边缘 → 抓住推下去
          if (this.edge && this.edge.dist < 1.6 && Math.random() < dt * 0.5 * this.d.edgeGrab) this.grabWant = 1.0;
        } else if (dist < 3.2 && dist > 2.2 && c.speed > 3.5 && c.grounded && Math.random() < dt * 0.5 * this.d.aim) {
          it.jump = true; this.dropkickT = 0.18;
        }
        it.aimPitch = (tp.y - P.y) * 0.5;
      }
    } else {
      gx = C.x + this.wander.x; gz = C.z + this.wander.z;
    }
    if (this.grabWant > 0 && !this.hint?.goto) { this.grabWant -= dt; it.grab = true; it.grabOnly = this.target; }
    if (this.dropkickT > 0) { this.dropkickT -= dt; if (this.dropkickT <= 0) it.kick = true; }
    if (this.charge > 0) { this.charge -= dt; it.headbutt = this.charge > 0; } else it.headbutt = false;

    // 移动 + 防坠落
    let mx = gx - P.x, mz = gz - P.z;
    const m = Math.hypot(mx, mz);
    if (fight && m < 0.8) { mx *= 0.2; mz *= 0.2; }
    else if (m > 0.05) { mx /= m; mz /= m; } else { mx = mz = 0; }
    if (!allowEdge && (mx || mz)) {
      const k = Math.hypot(mx, mz);
      const ux = mx / k, uz = mz / k;
      const look = 0.9 + c.speed * (c.onIce ? 0.45 : 0.18);
      const gap = this.gapAt(P, ux, uz, look);
      // 能跳过去的窄缝:缝后 1.3 米内有落脚处
      const jumpable = gap !== null && !held && !!this.hint?.goto && this.hasGround(P.x + ux * (gap + 1.3), P.z + uz * (gap + 1.3), P.y - 0.4, 1.6);
      if (this.backoff > 0) { this.backoff -= dt; mx = -ux; mz = -uz; it.sprint = false; }
      else if (jumpable) {
        it.sprint = true;
        if (gap <= 0.95) {
          if (c.speed > 3.3 && c.grounded) it.jump = true;
          else if (c.speed < 1.2) this.backoff = 0.45;
        }
      } else if (gap !== null) {
        // 前方断崖:停下
          // 主动刹车:朝速度反方向推
          const v = c.st.torso.v, sp = Math.hypot(v.x, v.z);
          if (sp > 1.0) { mx = -v.x / sp; mz = -v.z / sp; } else { mx = mz = 0; }
          if (Math.random() < 0.05) this.wander.set((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
      }
    }
    it.moveX = mx; it.moveZ = mz;
    it.faceYaw = faceTo ? ang(faceTo.x, faceTo.z) : (m > 0.1 ? ang(gx - P.x, gz - P.z) : null);
    // 卡住了就跳
    if (P.distanceTo(this.lastPos) < 0.6 * dt && Math.hypot(mx, mz) > 0.5 && c.grounded) this.stuckT += dt; else this.stuckT = 0;
    this.lastPos.copy(P);
    if (this.stuckT > 0.7) { it.jump = true; this.stuckT = 0; }
  }
}
