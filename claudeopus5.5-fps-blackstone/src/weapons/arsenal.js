// 武器逻辑：射击（命中扫描 + 散布 + 衰减 + 穿透）、换弹、泵动/拉栓、切枪、开镜、近战、投弹、曳光。

import * as THREE from 'three';
import { WEAPONS, SLOT_ORDER, GRENADE, MELEE } from './defs.js';
import { SHOT } from '../world/collision.js';
import { clamp, DEG, lerp } from '../core/util.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _m = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class Arsenal {
  constructor(G) {
    this.G = G;
    this.tracers = [];
    this.reset();
  }

  reset(loadout = { pistol: true, rifle: true }, grenades = 2) {
    this.owned = { pistol: false, rifle: false, shotgun: false, sniper: false, ...loadout };
    this.ammo = {};
    for (const id of SLOT_ORDER) {
      const w = WEAPONS[id];
      this.ammo[id] = { mag: w.mag, reserve: w.reserve };
    }
    this.cur = this.owned.rifle ? 'rifle' : 'pistol';
    this.prev = 'pistol';
    this.cool = 0;
    this.reload = null;
    this.cycle = null;
    this.cyclePending = 0;
    this.switching = null;
    this.switchK = 1; // 进场时从下方抬起
    this.raising = true;
    this.melee = 0;
    this.meleeHit = false;
    this.throwK = 0;
    this.thrown = false;
    this.ads = 0;
    this.bloom = 0;
    this.shotIndex = 0;
    this.lastFire = -10;
    this.fireBuffer = 0;
    this.grenades = grenades;
    this.slideLock = false;
    this.autoReload = 0;
    this.sprintRecover = 1;
    this.time = 0;
    this.tracers.length = 0;
    this.G.vm.setWeapon(this.cur);
    this.G.vm.flashScale = WEAPONS[this.cur].muzzleScale;
  }

  get def() {
    return WEAPONS[this.cur];
  }
  get clip() {
    return this.ammo[this.cur];
  }
  busy() {
    return !!(this.reload || this.switching || this.melee > 0 || this.throwK > 0 || this.raising);
  }

  give(id) {
    const fresh = !this.owned[id];
    this.owned[id] = true;
    const w = WEAPONS[id];
    const a = this.ammo[id];
    if (fresh) {
      a.mag = w.mag;
      a.reserve = w.reserve;
      this.switchTo(id);
    } else {
      a.reserve = Math.min(w.maxReserve, a.reserve + w.mag * 2);
    }
    return fresh;
  }

  /** 补给弹药：fraction 为每把枪补满备弹的比例，返回是否有补充 */
  addAmmo(fraction = 0.35, grenades = 0) {
    let any = false;
    for (const id of SLOT_ORDER) {
      if (!this.owned[id]) continue;
      const w = WEAPONS[id], a = this.ammo[id];
      const add = Math.max(w.mag, Math.round(w.maxReserve * fraction));
      const before = a.reserve;
      a.reserve = Math.min(w.maxReserve, a.reserve + add);
      if (a.reserve > before) any = true;
    }
    if (grenades > 0 && this.grenades < GRENADE.max) {
      this.grenades = Math.min(GRENADE.max, this.grenades + grenades);
      any = true;
    }
    return any;
  }

  needsAmmo() {
    let need = 0, total = 0;
    for (const id of SLOT_ORDER) {
      if (!this.owned[id]) continue;
      const w = WEAPONS[id], a = this.ammo[id];
      need += 1 - (a.reserve + a.mag) / (w.maxReserve + w.mag);
      total++;
    }
    return total ? need / total : 0;
  }

  switchTo(id) {
    if (!this.owned[id]) return;
    if (this.switching) {
      this.switching.target = id;
      return;
    }
    if (id === this.cur && !this.raising) return;
    this.reload = null;
    this.cycle = null;
    this.cyclePending = 0;
    this.melee = 0;
    this.switching = { target: id, phase: 'out' };
  }

  cycleWeapon(dir) {
    const owned = SLOT_ORDER.filter((id) => this.owned[id]);
    const target = this.switching ? this.switching.target : this.cur;
    let i = owned.indexOf(target);
    i = (i + dir + owned.length) % owned.length;
    this.switchTo(owned[i]);
  }

  startReload() {
    const w = this.def, a = this.clip;
    if (this.reload || this.switching || this.melee > 0 || this.throwK > 0) return;
    if (a.mag >= w.mag || a.reserve <= 0) return;
    const empty = a.mag === 0;
    if (w.action === 'pump') {
      this.reload = { kind: 'shells', phase: 'start', t: 0, empty, tilt: 0, shell: 0 };
    } else {
      this.reload = { kind: 'mag', u: 0, dur: empty ? w.reloadEmpty : w.reload, empty, fired: new Set(), credited: false };
    }
    this.cycle = null;
    this.G.audio.play('raise', { volume: 0.35 });
  }

  currentSpread() {
    const w = this.def, p = this.G.player;
    const s = w.spread;
    const speed = Math.hypot(p.body.vel.x, p.body.vel.z);
    let spr = lerp(s.hip, s.ads, this.ads);
    spr += s.move * clamp(speed / 5, 0, 1.4) * (1 - this.ads * 0.6);
    if (!p.body.grounded) spr += s.air;
    if (p.crouching && p.body.grounded) spr *= s.crouch;
    spr += this.bloom * (1 - this.ads * 0.5);
    return spr;
  }

  update(dt, input, active) {
    const G = this.G, p = G.player, w = this.def;
    this.time += dt;
    this.cool -= dt;
    this.fireBuffer -= dt;
    this.bloom = Math.max(0, this.bloom - w.bloomRecover * dt);
    if (this.time - this.lastFire > 0.35) this.shotIndex = 0;
    this.sprintRecover = p.sprinting ? 0 : this.sprintRecover + dt;
    if (this.autoReload > 0) {
      this.autoReload -= dt;
      if (this.autoReload <= 0 && this.clip.mag === 0 && !this.reload && !this.switching) this.startReload();
    }

    if (active && p.alive) {
      // 切枪输入
      for (let i = 0; i < 4; i++) if (input.pressed('weapon' + (i + 1))) this.switchTo(SLOT_ORDER[i]);
      if (input.pressed('swap') && this.owned[this.prev] && this.prev !== this.cur) this.switchTo(this.prev);
      const wh = input.consumeWheel();
      if (wh) this.cycleWeapon(wh > 0 ? 1 : -1);
      if (input.pressed('reload')) this.startReload();
      if (input.pressed('melee') && !this.switching && this.melee <= 0 && this.throwK <= 0) this.startMelee();
      if (input.pressed('grenade') && !this.switching && this.melee <= 0 && this.throwK <= 0) this.startThrow();
    }

    // 切枪进度
    if (this.switching) {
      const sw = this.switching;
      if (sw.phase === 'out') {
        this.switchK += dt / WEAPONS[this.cur].switchOut;
        this.ads = Math.max(0, this.ads - dt * 8);
        if (this.switchK >= 1) {
          this.switchK = 1;
          if (sw.target !== this.cur) this.prev = this.cur;
          this.cur = sw.target;
          G.vm.setWeapon(this.cur);
          G.vm.flashScale = WEAPONS[this.cur].muzzleScale;
          this.slideLock = this.cur === 'pistol' && this.clip.mag === 0;
          sw.phase = 'in';
          G.audio.play('raise', { volume: 0.5 });
        }
      } else {
        this.switchK -= dt / WEAPONS[this.cur].switchIn;
        if (this.switchK <= 0) {
          this.switchK = 0;
          this.switching = null;
        }
      }
    } else if (this.raising) {
      this.switchK -= dt / w.switchIn;
      if (this.switchK <= 0) {
        this.switchK = 0;
        this.raising = false;
      }
    }

    // 换弹进度
    if (this.reload) this.updateReload(dt, input, active);

    // 泵动 / 拉栓
    if (this.cyclePending > 0) {
      this.cyclePending -= dt;
      if (this.cyclePending <= 0) {
        this.cycle = { u: 0, kind: w.cycleSound, dur: w.cycleTime * 0.78 };
        this.G.audio.play(w.cycleSound === 'pump' ? 'pump' : 'bolt_back', { volume: 0.6 });
        if (w.cycleSound === 'bolt') this.G.audio.play('bolt_fwd', { volume: 0.6, delay: w.cycleTime * 0.4 });
        this.ejectShell(w.shell);
      }
    }
    if (this.cycle) {
      this.cycle.u += dt / this.cycle.dur;
      if (this.cycle.u >= 1) this.cycle = null;
    }

    // 近战 / 投掷
    if (this.melee > 0) this.updateMelee(dt);
    if (this.throwK > 0) this.updateThrow(dt);

    // 开镜
    const wantAds = active && p.alive && input.isDown('ads') && !p.sprinting && !this.switching && !this.raising && !(this.reload && this.reload.kind === 'mag') && this.melee <= 0 && this.throwK <= 0 && !(this.cycle && w.scope);
    this.ads = clamp(this.ads + (wantAds ? 1 : -1.4) * (dt / w.adsTime), 0, 1);
    p.adsK = this.ads;
    p.adsMoveMul = w.adsMove;

    // 开火
    if (active && p.alive) {
      const trig = w.action === 'auto' ? input.isDown('fire') : input.pressed('fire');
      if (input.pressed('fire')) this.fireBuffer = 0.12;
      const want = trig || (w.action !== 'auto' && this.fireBuffer > 0);
      if (want) this.tryFire(input);
    }

    // 曳光推进
    this.updateTracers(dt);
  }

  canFire() {
    return !this.switching && !this.raising && this.melee <= 0 && this.throwK <= 0 && this.cool <= 0 && !this.cycle && this.cyclePending <= 0 && this.sprintRecover > 0.1;
  }

  tryFire() {
    const w = this.def, a = this.clip;
    if (this.reload) {
      // 霰弹逐发装填可被开火打断
      if (this.reload.kind === 'shells' && a.mag > 0 && this.reload.phase === 'shell') {
        this.reload.phase = 'end';
        this.reload.t = 0;
        this.reload.quick = true;
      }
      return;
    }
    if (!this.canFire()) return;
    if (a.mag <= 0) {
      if (this.G.input.pressed('fire')) this.G.audio.play('dryfire', { volume: 0.6 });
      this.fireBuffer = 0;
      if (a.reserve > 0) this.startReload();
      this.cool = 0.25;
      return;
    }
    this.fire();
  }

  fire() {
    const G = this.G, w = this.def, a = this.clip, p = G.player;
    a.mag--;
    this.fireBuffer = 0;
    this.cool = 60 / w.rpm;
    this.lastFire = this.time;
    G.stats.shots++;
    const cam = G.camera;
    _o.copy(cam.position);
    p.aimDir(_d);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const spread = this.currentSpread();
    let anyHit = false;
    const muzzle = G.vm.viewToWorld(G.vm.cur.parts.muzzle, cam, _m);
    for (let i = 0; i < w.pellets; i++) {
      let ang, th;
      if (w.spread.cone) {
        ang = spread * DEG * Math.sqrt(G.rng.next()) * (i === 0 ? 0.3 : 1);
      } else {
        ang = spread * DEG * Math.sqrt(G.rng.next()) * 0.5;
      }
      th = G.rng.next() * Math.PI * 2;
      _tmp.copy(_d).addScaledVector(_r, Math.cos(th) * Math.tan(ang)).addScaledVector(_u, Math.sin(th) * Math.tan(ang)).normalize();
      if (this.hitscan(_o, _tmp, w, muzzle, i)) anyHit = true;
    }
    if (anyHit) G.stats.hits++;

    // 后坐
    const crouchK = p.crouching ? 0.8 : 1;
    const adsK = 1 - this.ads * 0.3;
    const pat = Math.sin(this.shotIndex * 0.9) * 0.6 + (G.rng.next() - 0.5) * 0.8;
    p.addRecoil(w.recoil.pitch * crouchK * adsK * (this.shotIndex < 2 ? 1.2 : 1), w.recoil.yaw * pat * crouchK);
    this.shotIndex++;
    this.bloom = Math.min(w.bloomMax, this.bloom + w.bloom);
    G.vm.kick(w.id === 'shotgun' || w.id === 'sniper' ? 1.8 : w.id === 'pistol' ? 0.9 : 0.75, (G.rng.next() - 0.5) * 2);
    p.addTrauma(w.id === 'sniper' ? 0.22 : w.id === 'shotgun' ? 0.2 : 0.03);

    // 声光
    G.audio.play(w.sound, { volume: w.volume, rateVar: 0.05, reverbSend: 1.2 });
    G.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, 0xffb060, w.id === 'pistol' ? 18 : 36);
    if (w.id === 'shotgun' || w.id === 'sniper') G.effects.smokePuff(muzzle.x, muzzle.y, muzzle.z, 0.25, 0.25);
    G.onPlayerNoise(w.id === 'pistol' ? 34 : 48);

    if (w.action === 'pump' || w.action === 'bolt') {
      if (a.mag > 0 || w.action === 'bolt') this.cyclePending = 0.16;
    } else {
      this.ejectShell(w.shell);
    }
    if (w.id === 'pistol' && a.mag === 0) this.slideLock = true;
    if (a.mag === 0 && a.reserve > 0 && w.action !== 'pump') this.autoReload = 0.26; // 打空稍作停顿后自动换弹
  }

  ejectShell(kind) {
    const G = this.G;
    const P = G.vm.cur.parts;
    const pos = G.vm.viewToWorld(P.eject, G.camera, _tmp.clone());
    const cam = G.camera;
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const pv = G.player.body.vel;
    const sp = 2.2 + G.rng.next();
    G.effects.casings.spawn(pos.x, pos.y, pos.z,
      _r.x * sp + _u.x * 1.6 + pv.x, _r.y * sp + _u.y * 1.6 + 1.2 + pv.y * 0.5, _r.z * sp + _u.z * 1.6 + pv.z, kind === 'shell');
  }

  /** 单发命中扫描。返回是否命中敌人 */
  hitscan(o, d, w, muzzle, pellet) {
    const G = this.G;
    const world = G.world;
    let wh = null;
    if (world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, w.range, SHOT)) wh = { ...world.hit };
    const tWorld = wh ? wh.t : w.range;
    const hits = G.enemies.raycast(o, d, tWorld);
    let pen = w.penetration || 0;
    let endT = tWorld;
    let hitEnemy = false;
    let dmgScale = 1;
    for (const h of hits) {
      const dist = h.t;
      const [f0, f1, fm] = w.falloff;
      const fall = dist <= f0 ? 1 : dist >= f1 ? fm : lerp(1, fm, (dist - f0) / (f1 - f0));
      const dmg = w.damage * fall * dmgScale;
      const res = h.enemy.damage(dmg, { part: h.part, dir: d, point: h.point, weapon: w.id, headMul: w.headMul, source: 'player' });
      hitEnemy = true;
      G.onEnemyHit(h.enemy, res, h);
      if (pen-- <= 0) {
        endT = h.t;
        break;
      }
      dmgScale *= 0.7;
    }
    if (endT >= tWorld - 1e-4 && wh) {
      const c = wh.collider;
      const surface = c.surface || (c.id === -1 ? world.groundSurface(wh.x, wh.z) : 'concrete');
      const ent = c.entity;
      G.effects.impact(wh.x, wh.y, wh.z, wh.nx, wh.ny, wh.nz, surface, !ent);
      if (pellet === 0 || G.rng.next() < 0.35) {
        const snd = surface === 'metal' ? 'impact_metal' : surface === 'dirt' || surface === 'ground' ? 'impact_dirt' : 'impact_concrete';
        G.audio.play(snd, { pos: { x: wh.x, y: wh.y, z: wh.z }, volume: 0.5, ref: 4 });
        if (surface === 'metal' && G.rng.next() < 0.18) G.audio.play('ricochet', { pos: { x: wh.x, y: wh.y, z: wh.z }, volume: 0.35 });
      }
      if (ent && ent.onShot) ent.onShot(w.damage * (w.pellets > 1 ? 1 : 1), wh);
    }
    // 曳光
    if (pellet === 0 ? G.rng.next() < w.tracerChance : G.rng.next() < 0.18) {
      const ex = o.x + d.x * endT, ey = o.y + d.y * endT, ez = o.z + d.z * endT;
      this.tracers.push({ ax: muzzle.x, ay: muzzle.y, az: muzzle.z, bx: ex, by: ey, bz: ez, len: Math.hypot(ex - muzzle.x, ey - muzzle.y, ez - muzzle.z), s: 0, w: w.id === 'sniper' ? 0.05 : 0.026 });
    }
    return hitEnemy;
  }

  updateTracers(dt) {
    const S = this.G.effects.streaks;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.s += dt * 420;
      const head = Math.min(t.s, t.len);
      const tail = Math.max(0, t.s - 7);
      if (tail >= t.len) {
        this.tracers.splice(i, 1);
        continue;
      }
      const k0 = tail / t.len, k1 = head / t.len;
      S.push(
        t.ax + (t.bx - t.ax) * k1, t.ay + (t.by - t.ay) * k1, t.az + (t.bz - t.az) * k1,
        t.ax + (t.bx - t.ax) * k0, t.ay + (t.by - t.ay) * k0, t.az + (t.bz - t.az) * k0,
        2.6, 1.9, 1.1, 0.9, t.w,
      );
    }
  }

  updateReload(dt, input) {
    const r = this.reload, w = this.def, a = this.clip, G = this.G;
    if (r.kind === 'mag') {
      r.u += dt / r.dur;
      for (const [t, snd, credit, emptyOnly] of w.reloadEvents) {
        if (r.u >= t && !r.fired.has(t)) {
          r.fired.add(t);
          if (emptyOnly && !r.empty) continue;
          G.audio.play(snd, { volume: 0.7 });
          if (credit && !r.credited) {
            const need = w.mag - a.mag;
            const take = Math.min(need, a.reserve);
            a.mag += take;
            a.reserve -= take;
            r.credited = true;
            if (w.id === 'pistol' && !r.empty) this.slideLock = false;
          }
          if (snd === 'slide_rack') this.slideLock = false;
        }
      }
      if (r.u >= 1) {
        if (w.id === 'pistol') this.slideLock = false;
        this.reload = null;
      }
      return;
    }
    // 霰弹逐发
    r.t += dt;
    if (r.phase === 'start') {
      r.tilt = Math.min(1, r.t / w.reloadStart);
      if (r.t >= w.reloadStart) {
        r.phase = 'shell';
        r.t = 0;
      }
    } else if (r.phase === 'shell') {
      r.tilt = 1;
      r.shell = r.t / w.shellTime;
      if (!r.loaded && r.shell >= 0.55) {
        r.loaded = true;
        if (a.reserve > 0 && a.mag < w.mag) {
          a.mag++;
          a.reserve--;
          G.audio.play('shell_in', { volume: 0.7 });
        }
      }
      if (r.t >= w.shellTime) {
        r.t = 0;
        r.loaded = false;
        r.shell = 0;
        if (a.mag >= w.mag || a.reserve <= 0) {
          r.phase = 'end';
        }
      }
    } else {
      const dur = r.quick ? 0.18 : w.reloadEnd;
      r.tilt = 1 - Math.min(1, r.t / dur);
      r.shell = 0;
      if (r.empty && !r.pumped && r.t > 0.02) {
        r.pumped = true;
        this.cycle = { u: 0, kind: 'pump', dur: 0.45 };
        G.audio.play('pump', { volume: 0.6 });
      }
      if (r.t >= dur) this.reload = null;
    }
  }

  startMelee() {
    this.melee = 0.0001;
    this.meleeHit = false;
    this.reload = null;
    this.ads = 0;
    this.G.audio.play('melee_swing', { volume: 0.7 });
  }

  updateMelee(dt) {
    const G = this.G;
    this.melee += dt / MELEE.time;
    if (!this.meleeHit && this.melee >= MELEE.hitAt / MELEE.time) {
      this.meleeHit = true;
      const p = G.player;
      const eye = p.eyePos(_tmp.clone());
      const fwd = p.forward(new THREE.Vector3());
      let best = null, bd = Infinity;
      for (const e of G.enemies.list) {
        if (!e.alive) continue;
        const c = e.center(new THREE.Vector3());
        const to = c.sub(eye);
        const dist = to.length();
        if (dist > MELEE.range + e.radius) continue;
        to.normalize();
        if (to.dot(fwd) < MELEE.cone && dist > e.radius + 0.4) continue;
        if (dist < bd) {
          bd = dist;
          best = e;
        }
      }
      if (best) {
        const res = best.damage(MELEE.damage, { part: 'body', dir: fwd, point: best.center(new THREE.Vector3()), weapon: 'melee', source: 'player', knock: 6 });
        G.onEnemyHit(best, res, { point: best.center(new THREE.Vector3()), normal: fwd.clone().negate() });
        G.audio.play('melee_hit', { volume: 0.9 });
        p.addTrauma(0.25);
      } else if (G.world.raycast(eye.x, eye.y, eye.z, fwd.x, fwd.y, fwd.z, 1.6, SHOT)) {
        const h = G.world.hit;
        G.effects.impact(h.x, h.y, h.z, h.nx, h.ny, h.nz, h.collider.surface || 'concrete', false);
        G.audio.play('impact_concrete', { volume: 0.7 });
        p.addTrauma(0.15);
      }
    }
    if (this.melee >= 1) this.melee = 0;
  }

  startThrow() {
    if (this.grenades <= 0) {
      this.G.audio.play('denied', { volume: 0.5 });
      this.G.hud.flashMessage('没有手雷了', 1.2);
      return;
    }
    this.throwK = 0.0001;
    this.thrown = false;
    this.reload = null;
    this.ads = 0;
    this.G.audio.play('grenade_pin', { volume: 0.7 });
  }

  updateThrow(dt) {
    const G = this.G;
    this.throwK += dt / 0.65;
    if (!this.thrown && this.throwK > 0.32) {
      this.thrown = true;
      this.grenades--;
      const p = G.player;
      const cam = G.camera;
      const dir = p.aimDir(new THREE.Vector3());
      _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const pos = cam.position.clone().addScaledVector(dir, 0.45).addScaledVector(_r, 0.12).add(new THREE.Vector3(0, -0.1, 0));
      const vel = dir.multiplyScalar(GRENADE.throwSpeed).add(new THREE.Vector3(0, 3.2, 0)).addScaledVector(p.body.vel, 0.6);
      G.grenades.spawn(pos, vel, 'player');
      G.audio.play('throw', { volume: 0.6 });
    }
    if (this.throwK >= 1) this.throwK = 0;
  }

  /** 给 HUD / 视图模型的状态 */
  viewState() {
    const r = this.reload;
    let reload = null;
    if (r) {
      if (r.kind === 'mag') reload = { kind: 'mag', u: r.u, empty: r.empty };
      else reload = { kind: 'shells', tilt: r.tilt, shell: r.shell };
    }
    return {
      reload,
      switchK: this.switchK,
      melee: this.melee,
      throwK: this.throwK,
      cycle: this.cycle ? { u: this.cycle.u, kind: this.cycle.kind } : null,
      slideLock: this.slideLock,
    };
  }

  reloadProgress() {
    const r = this.reload;
    if (!r) return -1;
    if (r.kind === 'mag') return r.u;
    const w = this.def;
    return clamp(this.clip.mag / w.mag, 0, 1);
  }
}
