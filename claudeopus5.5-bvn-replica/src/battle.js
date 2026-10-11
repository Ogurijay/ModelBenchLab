// 对战核心:回合 / 团队接力 / 判定 / 飞行道具 / 援助 / 奥义冻结 / 镜头 / 渲染。
import { W, H, STAGE_W, MAX_SEP, MAX_HP, MAX_QI, ASSIST_FILL, GUARD_MAX, settings, WALL_L, WALL_R } from './config.js';
import { Fighter } from './fighter.js';
import { Proj } from './proj.js';
import { FX, drawGlow } from './fx.js';
import { drawFigure } from './skeleton.js';
import { CHARS, ASSISTS } from './roster.js';
import { createStage } from './stages.js';
import { clamp, lerp, rectHit, rand, vr, altLook } from './util.js';
import { drawHud, drawCutin, drawBanner } from './hud.js';
import { CpuBrain } from './ai.js';
import { VirtualPad } from './input.js';
import audio from './audio.js';
import { hasSprites, drawSprite, frameForPose, art, STAND_H } from './art.js';

const ATTACK_FRAMES = new Set(['attack1', 'attack2', 'launch', 'sweep', 'airatk', 'lunge', 'cast']);

const GROUND_STATES = new Set(['stand', 'walk', 'guard', 'gstun', 'land', 'hit', 'gbreak', 'down', 'getup', 'win', 'intro', 'out']);

export class Battle {
  // o: { mode, sides:[{chars, assist, pad, cpu, diff}], stage, winsNeeded, time, training, carry:[{hp,qi}] }
  constructor(o) {
    this.o = o;
    this.mode = o.mode || 'vs';
    this.frame = 0; this.time = 0;
    this.fx = new FX();
    this.projs = []; this.assists = [];
    this.stage = createStage(o.stage || 'leaf_village');
    this.dustColor = this.stage.dustColor || '#c8b090';
    this.winsNeeded = o.winsNeeded ?? settings.winsNeeded;
    this.timeLimit = o.time ?? settings.time;
    this.training = o.training || null;
    this.infinite = [false, false];
    this.sides = o.sides.map((s, i) => ({
      idx: i, chars: s.chars.slice(), cur: 0, assistId: s.assist, assistGauge: s.assistStart ?? 0, wins: 0,
      pad: s.cpu ? new VirtualPad() : s.pad, brain: null, cpu: !!s.cpu, diff: s.diff ?? settings.difficulty,
      fighter: null, teamHp: s.chars.map(() => MAX_HP), out: s.chars.map(() => false), carry: s.carry || null,
    }));
    for (const sd of this.sides) if (sd.pad && !sd.cpu) sd.pad.isHuman = true;
    this.round = 1;
    this.cam = { x: STAGE_W / 2, y: -150, zoom: 1.1 };
    this.freeze = null; this.cutin = null; this.slow = 0; this.darken = 0;
    this.phase = 'intro'; this.pt = 0; this.banner = null;
    this.result = null;  // { winner: side idx | -1 }
    this.log = [];
    this.spawnRound(true);
  }
  sfx(n, o) { audio.sfx(n, o); }

  // ---------------------------------------------------------------- 开局 / 回合
  makeFighter(side, idx, x, face) {
    const sd = this.sides[side];
    const def = CHARS[sd.chars[idx]];
    const qi = sd.fighter ? sd.fighter.qi : (sd.carry?.qi ?? settings.startQi);
    const f = new Fighter(def, side, this, { x, face, pad: sd.pad, qi, hp: sd.teamHp[idx] });
    const other = this.sides[1 - side]?.fighter;
    if (side === 1 && (other ? other.def.id === def.id : this.sides[0].chars[this.sides[0].cur] === def.id)) { f.look = altLook(def.look); f.altLook = true; }
    if (sd.cpu) sd.brain = new CpuBrain(this, f, sd.pad, sd.diff);
    return f;
  }
  spawnRound(first) {
    this.projs = []; this.assists = [];
    for (const sd of this.sides) {
      if (this.mode !== 'team' && this.mode !== 'survival' && !first) sd.teamHp[sd.cur] = MAX_HP;
      if (first && sd.carry?.hp) sd.teamHp[0] = sd.carry.hp;
      const x = sd.idx === 0 ? STAGE_W / 2 - 170 : STAGE_W / 2 + 170;
      sd.fighter = this.makeFighter(sd.idx, sd.cur, x, sd.idx === 0 ? 1 : -1);
      sd.fighter.setState('intro');
    }
    this.cam.x = STAGE_W / 2; this.cam.y = -150; this.cam.zoom = 1.12;
    this.phase = 'intro'; this.pt = 0; this.time = this.timeLimit;
    this.timerF = 0;
    if (this.training) this.phase = 'fight', this.sides.forEach((s) => s.fighter.setState('stand'));
  }
  // 团队模式:某方阵亡后换下一位
  nextMember(sd) {
    sd.teamHp[sd.cur] = 0; sd.out[sd.cur] = true;
    sd.cur++;
    const other = this.sides[1 - sd.idx].fighter;
    const x = clamp(other.x + (sd.idx === 0 ? -260 : 260), WALL_L + 40, WALL_R - 40);
    sd.fighter = this.makeFighter(sd.idx, sd.cur, x, other.x > x ? 1 : -1);
    sd.fighter.setState('intro');
    // 胜者回复少量体力
    const w = other; w.hp = Math.min(MAX_HP, w.hp + (MAX_HP - w.hp) * 0.25); w.hpShow = w.hp;
    w.setState('stand'); w.resetCombo(); w.status = { burn: 0, freeze: 0, bind: 0 };
    this.projs = []; this.assists = [];
    this.phase = 'intro'; this.pt = 30;
    this.time = this.timeLimit; this.timerF = 0; // 每组对决重新计时
  }

  get fighters() { return this.sides.map((s) => s.fighter); }
  opponentOf(f) {
    const sd = this.sides[1 - f.side];
    return sd ? sd.fighter : null;
  }
  enemiesOf(side) { return this.sides[1 - side].fighter ? [this.sides[1 - side].fighter] : []; }

  // ---------------------------------------------------------------- 更新
  update() {
    this.frame++;
    if (this.freeze) {
      this.freeze.t--;
      if (this.cutin) this.cutin.t++;
      this.fx.update();
      if (this.freeze.t <= 0) { this.freeze = null; this.cutin = null; }
      this.updateCamera();
      return;
    }
    if (this.slow > 0) { this.slow--; if (this.slow % 3 !== 0) { this.fx.update(); return; } }
    this.time_tick();
    const fs = this.fighters;
    for (const sd of this.sides) {
      if (sd.brain && this.phase === 'fight') sd.brain.think();
      if (sd.pad) { sd.pad.frozen = sd.fighter.hitstop > 0; sd.pad.update(); }
      if (this.training && sd.idx === 1 && this.training.dummy !== 'cpu') this.trainingDummy(sd);
    }
    if (this.phase === 'fight' || this.phase === 'ko' || this.phase === 'end') {
      for (const sd of this.sides) {
        if (this.phase !== 'fight' && sd.pad) sd.pad.clear();
        sd.assistGauge = Math.min(100, sd.assistGauge + ASSIST_FILL * (this.training ? 4 : 1));
      }
    }
    for (const f of fs) f.update();
    for (const a of this.assists) a.update();
    this.assists = this.assists.filter((a) => {
      if (a.state === 'move') return true;
      this.fx.smoke(a.x, a.y - 50, 10); this.sfx('smoke', { vol: 0.6 });
      return false;
    });
    this.pushApart();
    for (const p of this.projs) p.update(this);
    this.projHits();
    this.projs = this.projs.filter((p) => !p.dead);
    this.fx.update();
    if (this.darken > 0) this.darken--;
    if (this.banner && ++this.banner.t > 70) this.banner = null;
    this.updateCamera();
    this.roundLogic();
  }
  time_tick() {
    if (this.phase !== 'fight' || !this.timeLimit || this.training) return;
    if (++this.timerF >= 60) { this.timerF = 0; this.time = Math.max(0, this.time - 1); if (this.time === 0) this.timeUp(); }
  }
  trainingDummy(sd) {
    const f = sd.fighter, T = this.training;
    const p = sd.pad;
    p.release();
    if (T.dummy === 'guard') p.set('down', true);
    if (T.dummy === 'jump' && f.state === 'stand' && this.frame % 50 === 0) p.tap('K');
    if (T.autoHeal) for (const g of this.fighters) if (!g.isHurt() && g.state !== 'down' && g.combo.hits === 0 && g.hp < MAX_HP && this.frame - g.lastHurt > 70) g.hp = Math.min(MAX_HP, g.hp + 25), g.hpShow = g.hp;
    this.infinite = [!!T.infQi, !!T.infQi];
  }

  pushApart() {
    const [a, b] = this.fighters;
    if (!a || !b) return;
    const solid = (f) => !['down', 'locked', 'ko', 'tech'].includes(f.state) && !(f.state === 'dash' && f.def.dash !== 'run' && f.st > 1) && !f.mv?.m.ghost;
    if (solid(a) && solid(b) && Math.abs(a.y - b.y) < 70) {
      const dx = b.x - a.x, min = 34 * (a.scale + b.scale) / 2;
      if (Math.abs(dx) < min) {
        const push = (min - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
        a.x -= push; b.x += push;
        if (a.x < WALL_L) { b.x += WALL_L - a.x; a.x = WALL_L; } if (b.x < WALL_L) { a.x += WALL_L - b.x; b.x = WALL_L; }
        if (a.x > WALL_R) { b.x -= a.x - WALL_R; a.x = WALL_R; } if (b.x > WALL_R) { a.x -= b.x - WALL_R; b.x = WALL_R; }
      }
    }
    // 两人保持同屏
    if (Math.abs(a.x - b.x) > MAX_SEP) {
      const mover = Math.abs(a.vx) > Math.abs(b.vx) ? a : b, other = mover === a ? b : a;
      mover.x = other.x + Math.sign(mover.x - other.x) * MAX_SEP;
    }
  }

  // ---------------------------------------------------------------- 判定
  hitbox(att, h) {
    const s = att.scale;
    const [fx, fy, w, hh] = h.box;
    const cx = att.x + fx * att.face * s, cy = att.y + fy * s;
    return { x: cx - w * s / 2, y: cy - hh * s / 2, w: w * s, h: hh * s };
  }
  meleeCheck(att, h, idx, mv) {
    const box = this.hitbox(att, h);
    const seq = h.every ? Math.floor((mv.f - h.at[0]) / h.every) : 0;
    for (const t of this.enemiesOf(att.side)) {
      if (!t.hittable() && !(h.otg && t.state === 'down')) continue;
      if (t.state === 'locked' && t.lockBy !== att) continue;
      const key = idx + ':' + seq + ':' + t.id;
      if (mv.hit.has(key)) continue;
      const hb = t.hurt();
      if (!rectHit(box, hb)) continue;
      mv.hit.add(key);
      const px = (Math.max(box.x, hb.x) + Math.min(box.x + box.w, hb.x + hb.w)) / 2;
      const py = (Math.max(box.y, hb.y) + Math.min(box.y + box.h, hb.y + hb.h)) / 2;
      const res = this.applyHit(att, t, h, { dir: att.face, px, py, mv });
      if (res === 'hit' && h.onHit) h.onHit(att, t, this, mv);
    }
  }
  // 锁定连段等:直接对目标结算
  hitDirect(att, t, h, mv) {
    const r = t.hurt();
    return this.applyHit(att, t, { unblock: true, ...h }, { dir: h.dir ?? att.face, px: r.x + r.w / 2, py: r.y + r.h * 0.4, mv, direct: true });
  }
  applyHit(att, t, h, src) {
    if (!t.alive || t.state === 'ko') return 'miss';
    if (!src.direct && !t.hittable() && !(h.otg && t.state === 'down')) return 'miss';
    const owner = att.isAssist ? att : att;
    const dir = src.dir || 1;
    const isSuper = src.mv?.m.qi > 0 || h.super;
    const isSpecial = isSuper || src.mv?.m.cat === 'U' || h.proj;
    t.lastHurt = this.frame;
    // 反击架势(替身反击 / 镜花水月):近身攻击被化解
    const cm = t.state === 'move' && t.mv?.m;
    if (cm && cm.counter && t.mv.f >= cm.counter[0] && t.mv.f <= cm.counter[1] && !h.proj && !src.direct && !h.unblock) {
      if (!att.isAssist) att.hitstop = 8;
      cm.onCounter(t, att, this);
      return 'miss';
    }
    // 防御
    const attackFromFront = t.face === -dir || (h.proj && Math.sign(src.px - t.x) === t.face);
    if (!h.unblock && t.isGuarding() && attackFromFront && t.status.freeze <= 0) {
      const chip = h.dmg * (h.chip ?? (isSpecial ? 0.12 : 0.04));
      if (!this.training || t.hp - chip > 1) t.hp = Math.max(1, t.hp - chip);
      t.state = 'gstun'; t.st = 0; t.stunT = h.gstun ?? Math.round(9 + (h.stun ?? 18) * 0.45);
      t.vx = dir * (h.gpush ?? 3.6); t.mv = null;
      t.guardDmg += h.dmg; t.guardT = 50;
      const hs = h.proj ? 3 : 5;
      if (!h.proj && !att.isAssist) att.hitstop = hs; t.hitstop = hs;
      if (!h.proj && !att.isAssist) att.vx = -dir * 1.5;
      att.qi += 1.5; t.qi += h.dmg * 0.06;
      this.fx.spark(src.px, src.py, dir, 'guard');
      this.sfx('guard');
      if (src.mv) src.mv.connected = 'guard';
      if (t.guardDmg > GUARD_MAX) {
        t.guardDmg = 0; t.state = 'gbreak'; t.st = 0; t.vx = dir * 3;
        this.fx.text(t.x, t.y - 140, '破防!', '#ffcf40', 26, 50); this.fx.shards(src.px, src.py, 10, '#bfe8ff');
        this.sfx('guard_break');
      }
      return 'guard';
    }
    // 命中
    const counter = t.state === 'move' && t.mv && !t.mv.connected && t.mv.f < (t.mv.m.hits?.[0]?.at[0] ?? 8);
    const n = t.combo.hits;
    const scale = n < 3 ? 1 : Math.max(isSuper ? 0.5 : 0.3, 1 - (n - 2) * 0.075);
    let dmg = h.dmg * scale * (att.dmgMul || 1) * (counter ? 1.15 : 1) / (t.def.defense || 1) / (t.buff?.def || 1);
    if (this.training && t.side === 1) dmg = Math.min(dmg, t.hp - 1 + MAX_HP * 0) ;
    t.hp -= dmg;
    if (this.training && t.hp < 1) t.hp = 1;
    t.combo.hits++; t.combo.dmg += dmg; t.combo.stun += h.stunPts ?? (h.dmg * 0.8);
    const real = att.isAssist ? this.sides[att.side].fighter : att;
    if (real) {
      real.stats.dealt += dmg; real.stats.maxCombo = Math.max(real.stats.maxCombo, t.combo.hits);
      if (!isSuper && !att.isAssist) real.qi += dmg * 0.16 + 2;
    }
    t.qi += dmg * 0.2;
    this.sides[t.side].assistGauge = Math.min(100, this.sides[t.side].assistGauge + dmg * 0.04);
    if (counter) this.fx.text(t.x, t.y - 150, 'COUNTER', '#ff6040', 20, 40);
    t.face = -dir;
    if (h.kind === 'lock') {
      t.react({ ...h, kind: 'lock' }, dir, dmg);
      t.lockTo(h.lockBy || src.proj || att, h.lockOff);
      if (att.mv && !src.proj) att.mv.lockT = t;
    } else if (!(h.keepLock && t.state === 'locked')) {
      t.react(h, dir, dmg);
    }
    if (t.state === 'locked' && h.keepLock) { /* 锁定中的连段:不改变状态 */ }
    // 打击停顿
    const hs = h.hs ?? (h.dmg >= 45 ? 9 : h.dmg >= 28 ? 7 : 5);
    if (!h.proj && !att.isAssist && !h.noStopSelf) att.hitstop = hs;
    t.hitstop = hs;
    t.flashT = 3;
    if (src.mv) src.mv.connected = true;
    att.lastLanded = this.frame;
    // 特效
    const sparkKind = h.spark || (att.look.holdWeapon && !h.proj ? 'blade' : (h.dmg >= 40 ? 'heavy' : 'hit'));
    this.fx.spark(src.px, src.py, dir, sparkKind, h.dmg >= 45 || isSuper);
    if (h.dmg >= 45 || h.kind === 'knock' || isSuper) this.fx.shake(isSuper ? 7 : 4, 8);
    this.sfx(h.sfx || (sparkKind === 'blade' ? 'hit_blade' : h.dmg >= 40 ? 'hit_heavy' : h.dmg >= 26 ? 'hit_mid' : 'hit_light'), { pan: clamp((t.x - this.cam.x) / 600, -1, 1) });
    if (t.hp <= 0) this.onKO(t, att);
    return 'hit';
  }

  // 飞行道具碰撞
  projHits() {
    const ps = this.projs;
    for (const p of ps) {
      if (!p.active || p.nohit) continue;
      const pb = p.box();
      for (const t of this.enemiesOf(p.side)) {
        if (p.dead) break;
        if (p.cool.has(t.id)) continue;
        const direct = t.state === 'locked' && t.lockBy === p;
        if (!direct && !t.hittable()) continue;
        if (t.state === 'locked' && t.lockBy !== p && t.lockBy?.side !== p.side) continue;
        if (!rectHit(pb, t.hurt())) continue;
        if (p.targetOnly && p.target !== t) continue;
        const res = this.applyHit(p.owner, t, p.hit, { dir: p.hitDir ?? (Math.sign(p.vx) || p.dir), px: clamp(p.x, t.x - 20, t.x + 20), py: clamp(p.y, t.y - 90, t.y - 20), direct, proj: p });
        if (res === 'miss') continue;
        p.cool.set(t.id, p.every);
        if (res === 'hit' && p.mv && p.owner.mv === p.mv) p.mv.connected = true;
        if (p.onHit) p.onHit(this, p, t, res);
        if (!p.pierce && --p.hits <= 0) p.kill(this, false);
      }
    }
    // 对消 / 结界阻挡
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.side === b.side || !a.active || !b.active || a.dead || b.dead) continue;
      if (!(a.clash || a.blocker) || !(b.clash || b.blocker)) continue;
      if (!rectHit(a.box(), b.box())) continue;
      const pa = a.blocker ? 99 : a.power, pb = b.blocker ? 99 : b.power;
      a.power -= pb; b.power -= pa;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.fx.spark(mx, my, 1, 'heavy', true); this.sfx('explode_small');
      if (a.power <= 0 && !a.blocker) a.kill(this, false);
      if (b.power <= 0 && !b.blocker) b.kill(this, false);
    }
  }

  slashFx(f, m) {
    const h = m.hits.find((x) => x.at[0] >= m.trail[0] - 2) || m.hits[0];
    const b = this.hitbox(f, h);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.max(b.w, b.h) * 0.62;
    const col = m.trailColor || f.def.trailColor || '#ffffff';
    const up = (f.poseName || '').includes('rise') || (f.poseName || '').includes('up');
    this.fx.slashArc(cx - f.face * r * 0.35, cy, f.face, r, up ? 1.5 : -1.5, up ? -1.2 : 1.2, col, 10, Math.min(22, r * 0.35));
    this.fx.slashArc(cx - f.face * r * 0.35, cy, f.face, r * 0.92, up ? 1.5 : -1.5, up ? -1.2 : 1.2, '#ffffff', 7, 4);
  }
  spawn(owner, o) { const p = new Proj(owner, o); if (owner.state === 'move') p.mv = owner.mv; this.projs.push(p); return p; }
  afterimage(f, color = '#ffffff', life = 12) {
    if (hasSprites(f.def.id)) { this.fx.afterimage({ spr: { id: f.def.id, frame: this.spriteFrame(f) }, x: f.x, y: f.y, face: f.face, scale: f.scale, color, life }); return; }
    this.fx.afterimage({ x: f.x, y: f.y, face: f.face, look: f.look, pose: { ...f.displayPose() }, color, grounded: this.isGroundedPose(f), lie: f.state === 'down', life });
  }
  superFreeze(f, m) {
    this.freeze = { f, t: m.cutinT || 44 };
    this.cutin = { f, name: m.name, t: 0, faction: f.def.faction };
    this.darken = (m.cutinT || 44) + (m.darken || 30);
    this.sfx('cutin'); audio.duck(1.2);
    this.fx.flash('#ffffff', 5);
  }
  callAssist(f) {
    const sd = this.sides[f.side];
    if (!sd.assistId || sd.assistGauge < 100 || this.assists.some((a) => a.side === f.side) || f.isHurt() || this.phase !== 'fight') return false;
    const def = ASSISTS[sd.assistId]; if (!def) return false;
    sd.assistGauge = 0;
    const o = this.opponentOf(f);
    const face = o ? (o.x > f.x ? 1 : -1) : f.face;
    const x = clamp(f.x - face * 60, WALL_L, WALL_R);
    const a = new Fighter(def, f.side, this, { x, face, assist: true, pad: null });
    a.y = 0; a.inv = 999;
    this.assists.push(a);
    a.startMove('A');
    this.fx.smoke(x, -50, 12); this.sfx('assist');
    return true;
  }

  onKO(t, att) {
    if (this.phase !== 'fight') return;
    t.hp = 0;
    t.state = 'ko'; t.st = 0; if (t.grounded) { t.vy = -7; t.y = -1; } t.vx = (t.x < att.x ? -1 : 1) * 5; t.koLanded = false;
    t.lockBy = null;
    this.phase = 'ko'; this.pt = 0; this.slow = 70;
    this.koSide = t.side;
    this.fx.flash('#ffffff', 10); this.fx.shake(10, 20);
    this.sfx('ko'); audio.duck(2);
    this.banner = { text: 'K.O.', t: 0, color: '#ff3a3a' };
  }
  timeUp() {
    const [a, b] = this.fighters;
    const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
    this.phase = 'ko'; this.pt = 0;
    this.koSide = ra === rb ? -1 : ra < rb ? 0 : 1;
    this.timeUpFlag = true;
    this.banner = { text: 'TIME UP', t: 0, color: '#ffd040' };
    this.sfx('timeup');
  }

  roundLogic() {
    this.pt++;
    const fs = this.fighters;
    if (this.phase === 'intro') {
      if (this.pt === 1 && !this.training) { this.banner = { text: this.mode === 'team' || this.mode === 'survival' ? 'READY' : (this.round >= this.winsNeeded * 2 - 1 && this.round > 1 ? 'FINAL ROUND' : `ROUND ${this.round}`), t: 0, color: '#ffe8a0' }; this.sfx('round'); }
      if (this.pt === 70) { this.banner = { text: 'FIGHT!', t: 0, color: '#ff8a3a' }; this.sfx('fight'); }
      if (this.pt >= 82) { this.phase = 'fight'; for (const f of fs) if (f.state === 'intro') f.setState('stand'); }
    } else if (this.phase === 'ko') {
      const loser = this.koSide;
      const done = this.pt > 110 && fs.every((f) => f.state !== 'move' || f.mv.m.qi === undefined) && (loser < 0 || this.timeUpFlag || this.sides[loser].fighter.koLanded || this.pt > 240);
      if (!done) return;
      this.timeUpFlag = false;
      if (loser < 0) { this.banner = { text: 'DRAW', t: 0, color: '#c8c8c8' }; this.phase = 'between'; this.pt = 0; this.pendingWinner = -1; return; }
      const winner = 1 - loser;
      const wsd = this.sides[winner], lsd = this.sides[loser];
      if (this.mode === 'team' && lsd.cur < lsd.chars.length - 1) { lsd.fighter.hp = 0; this.nextMember(lsd); return; }
      wsd.wins++;
      this.pendingWinner = winner;
      this.phase = 'between'; this.pt = 0;
      wsd.fighter.setState('win'); wsd.fighter.faceOpp();
      this.banner = { text: (wsd.cpu ? 'CPU' : `${winner + 1}P`) + ' WIN', t: 0, color: winner === 0 ? '#ff7a4a' : '#5aa8ff' };
      this.sfx('victory');
    } else if (this.phase === 'between') {
      if (this.pt < 130) return;
      const w = this.pendingWinner;
      const matchOver = this.mode === 'team' || this.mode === 'survival' || this.mode === 'arcade1' || (w >= 0 && this.sides[w].wins >= this.winsNeeded);
      if (matchOver && w >= 0) { this.phase = 'end'; this.result = { winner: w }; return; }
      this.round++;
      for (const sd of this.sides) sd.teamHp[sd.cur] = MAX_HP;
      this.spawnRound(false);
    }
  }

  // ---------------------------------------------------------------- 镜头
  updateCamera() {
    const fs = this.fighters.filter(Boolean);
    let minX = Infinity, maxX = -Infinity, minY = 0;
    for (const f of fs) { minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x); minY = Math.min(minY, f.y); }
    const sep = maxX - minX;
    let tz = clamp(1.3 - (sep - 160) / 620 * 0.45, 0.85, 1.3);
    let tx = (minX + maxX) / 2, ty = -150 + Math.min(0, minY + 60) * 0.6;
    if (this.freeze) { const f = this.freeze.f; tz = 1.3; tx = f.x; ty = f.y - 150 + 20; }
    const c = this.cam;
    const k = this.freeze ? 0.2 : 0.09;
    c.zoom = lerp(c.zoom, tz, k);
    c.x = lerp(c.x, tx, this.freeze ? 0.2 : 0.14);
    c.y = lerp(c.y, ty, 0.1);
    const half = 480 / c.zoom;
    c.x = clamp(c.x, half, STAGE_W - half);
    c.y = clamp(c.y, -430, -120);
  }

  // ---------------------------------------------------------------- 渲染
  isGroundedPose(f) {
    if (f.state === 'move') return f.y >= 0 && !f.mv.m.air && !f.mv.m.airPose;
    if (f.state === 'dash') return f.y >= 0 && !f.dashBack;
    if (f.state === 'ko') return f.y >= 0 && f.koLanded;
    if (f.state === 'locked') return f.y >= -1 && !(f.lockBy instanceof Fighter);
    return GROUND_STATES.has(f.state) && f.y >= 0;
  }
  draw(ctx) {
    const c = this.cam;
    const t = this.frame / 60;
    const [sx, sy] = this.fx.shakeOffset();
    ctx.save();
    ctx.translate(sx, sy);
    this.stage.drawBack(ctx, c, t);
    if (this.darken > 0) { ctx.fillStyle = `rgba(6,0,10,${Math.min(0.62, this.darken / 20 * 0.62)})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    ctx.save();
    ctx.translate(480, 270); ctx.scale(c.zoom, c.zoom); ctx.translate(-c.x, -c.y);
    // 影子
    for (const f of [...this.fighters, ...this.assists]) {
      if (!f) continue;
      const sc = Math.max(0.35, 1 + f.y / 260);
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(f.x, 2, 28 * sc * f.scale, 6 * sc, 0, 0, 7); ctx.fill();
    }
    const after = (g, p, a) => {
      if (p.spr) drawSprite(g, p.spr.id, p.spr.frame, p.x, p.y, p.face, p.scale, { variant: p.color, alpha: 0.45 * a });
      else drawFigure(g, p.x, p.y, p.face, p.look, p.pose, { tint: p.color, alpha: 0.5 * a, grounded: p.grounded, lie: p.lie });
    };
    this.fx.draw(ctx, true, after);
    for (const p of this.projs) if (p.behind) p.draw(ctx, this);
    // 角色:正在攻击者在上
    const list = [...this.fighters.filter(Boolean)].sort((a, b) => (a.state === 'move' ? 1 : 0) - (b.state === 'move' ? 1 : 0));
    for (const f of list) this.drawFighter(ctx, f);
    for (const a of this.assists) this.drawFighter(ctx, a);
    for (const p of this.projs) if (!p.behind) p.draw(ctx, this);
    this.fx.draw(ctx, false, after);
    if (this.training?.showBoxes) this.drawBoxes(ctx);
    ctx.restore();
    this.stage.drawFront(ctx, c, t);
    if (this.fx.flashT > 0) { ctx.fillStyle = this.fx.flashC; ctx.globalAlpha = this.fx.flashT / this.fx.flashMax * 0.7; ctx.fillRect(-20, -20, W + 40, H + 40); ctx.globalAlpha = 1; }
    ctx.restore();
    drawHud(ctx, this);
    if (this.cutin) drawCutin(ctx, this.cutin);
    if (this.banner) drawBanner(ctx, this.banner);
  }
  drawFighter(ctx, f) {
    const pose = f.displayPose();
    const grounded = this.isGroundedPose(f);
    const lie = (f.state === 'down' || (f.state === 'ko' && f.koLanded)) && grounded;
    const m = f.mv?.m;
    const hurt = f.isHurt() || f.state === 'down' || f.state === 'ko';
    const opt = {
      rs: f.rs, grounded, lie,
      expr: hurt ? 'hurt' : (f.state === 'move' ? 'angry' : f.state === 'win' ? 'normal' : undefined),
      shout: f.state === 'move' && (m.qi || m.shout),
      eyeRed: f.eyeMode ? f.eyeMode() : (m?.eye || f.buff?.eye || 0),
      hollow: f.buff?.hollow,
      weapon: m?.wpn !== undefined ? m.wpn : undefined,
      trail: m?.trail && f.mv.f >= m.trail[0] && f.mv.f <= m.trail[1],
      wscale: m?.wscale,
    };
    // 觉醒气焰
    if (f.buff?.aura) {
      ctx.globalCompositeOperation = 'lighter';
      const fl = Math.sin(this.frame * 0.5) * 6;
      drawGlow(ctx, f.x, f.y - 55 * f.scale, (70 + fl) * f.scale, f.buff.aura, 0.55);
      drawGlow(ctx, f.x, f.y - 90 * f.scale, (40 + fl) * f.scale, f.buff.aura, 0.4);
      ctx.globalCompositeOperation = 'source-over';
      if (this.frame % 3 === 0) this.fx.add({ type: 'glowdot', x: f.x + vr(-24, 24), y: f.y - vr(10, 110), vx: 0, vy: -vr(1, 3), r: vr(2, 4), color: f.buff.aura, life: 22 });
    }
    // 刀光拖尾
    if (opt.trail) { f.trailPts = f.trailPts || []; } else if (f.trailPts?.length) f.trailPts.shift();
    let alpha = 1;
    if (f.state === 'dash' && (f.def.dash === 'shunpo' || f.def.dash === 'sand') && f.st >= 2 && f.st <= 9) alpha = 0.12;
    if (m?.hide && f.mv.f >= m.hide[0] && f.mv.f <= m.hide[1]) alpha = 0;
    if (f.inv > 0 && (f.state === 'getup' || f.state === 'land') && (this.frame >> 2) % 2) alpha *= 0.6;
    if (alpha > 0 && !this.drawSpriteFighter(ctx, f, alpha)) {
      drawFigure(ctx, f.x, f.y, f.face, f.look, pose, { ...opt, alpha });
      if (f.flashT > 0) drawFigure(ctx, f.x, f.y, f.face, f.look, pose, { ...opt, tint: '#ffffff', alpha: 0.55 * alpha, rs: null });
    }
    if (opt.trail && f.rs.tip) { f.trailPts.push(f.rs.tip); if (f.trailPts.length > 6) f.trailPts.shift(); }
    if (f.trailPts && f.trailPts.length > 1) this.drawTrail(ctx, f.trailPts, m?.trailColor || f.def.trailColor || '#ffffff');
    // 状态覆盖
    if (f.status.freeze > 0) {
      ctx.fillStyle = 'rgba(190,240,255,0.55)'; ctx.strokeStyle = '#6ac8e8'; ctx.lineWidth = 2;
      const hb = f.hurt();
      ctx.beginPath(); ctx.moveTo(hb.x - 8, hb.y + hb.h + 4); ctx.lineTo(hb.x - 12, hb.y + 10); ctx.lineTo(hb.x + 6, hb.y - 12); ctx.lineTo(hb.x + hb.w + 10, hb.y - 4); ctx.lineTo(hb.x + hb.w + 12, hb.y + hb.h + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (f.status.bind > 0) {
      ctx.strokeStyle = '#c8a46a'; ctx.lineWidth = 7;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(f.x, f.y - 30 - i * 26, 22, 7, 0.2, 0, 7); ctx.stroke(); }
    }
  }
  // ---------------------------------------------------------------- 精灵渲染
  spriteFrame(f) {
    switch (f.state) {
      case 'intro': return f.st > 8 && f.st < 56 ? 'charge' : 'idle';   // 开场亮相
      case 'stand': case 'out': return 'idle';
      case 'walk': return Math.floor(Math.abs(f.walkPh) / 100) % 2 ? 'walk' : 'idle';
      case 'guard': case 'gstun': return 'guard';
      case 'land': case 'getup': return 'crouch';
      case 'dash': return f.dashBack ? 'jump' : 'run';
      case 'air': case 'tech': return f.vy < 0 ? 'jump' : 'fall';
      case 'hit': case 'gbreak': return 'hit';
      case 'airhit': case 'knock': return 'knock';
      case 'ko': return f.koLanded && f.grounded ? 'down' : 'knock';
      case 'down': return 'down';
      case 'locked': return f.y >= -1 && !(f.lockBy instanceof Fighter) ? 'hit' : 'knock';
      case 'win': return 'victory';
      case 'move': return frameForPose(f.poseName) || (f.grounded ? 'idle' : 'fall');
    }
    return 'idle';
  }
  drawSpriteFighter(ctx, f, alpha) {
    const id = f.def.id;
    if (f.isAssist) {
      // 援助角色使用立绘
      const im = art('full_' + id); if (!im) return false;
      const h = STAND_H * 1.1 * f.scale, w = im.naturalWidth / im.naturalHeight * h;
      const k = f.mv ? Math.min(1, f.mv.f / 6) : 1;
      ctx.save(); ctx.globalAlpha *= alpha * k; ctx.translate(f.x, f.y); ctx.scale(f.face, 1); ctx.drawImage(im, -w / 2, -h, w, h); ctx.restore();
      return true;
    }
    if (!hasSprites(id)) return false;
    const fr = this.spriteFrame(f);
    const rs = f.rs;
    if (rs.sf !== fr) { rs.pf = rs.sf; rs.sf = fr; rs.sfAt = this.frame; }
    const variant = f.altLook ? 'alt' : undefined;
    let x = f.x, sy = 1, rot = 0;
    if (fr === 'idle') sy = 1 + Math.sin((this.frame + f.id * 40) * 0.09) * 0.012;
    if (f.state === 'hit' && f.st < 8) x += Math.sin(f.st * 2.4) * 2.5;
    if (f.spinR > 0) rot = -(360 - f.spinR) * Math.PI / 180;
    if (f.mv?.m.spinSprite && f.poseOv) rot = (f.poseOv.r || 0) * Math.PI / 180;
    if (f.state === 'knock' || f.state === 'airhit') rot = Math.max(-0.5, Math.min(0.5, f.vy * 0.04));
    // 出招瞬间:上一帧淡出残影,增加动作连贯感
    const dt = this.frame - rs.sfAt;
    if (rs.pf && dt < 5 && ATTACK_FRAMES.has(fr)) drawSprite(ctx, id, rs.pf, x - f.face * 6, f.y, f.face, f.scale, { alpha: alpha * 0.35 * (1 - dt / 5), variant });
    const ok = drawSprite(ctx, id, fr, x, f.y, f.face, f.scale, { alpha, sy, rot, variant });
    if (!ok) return false;
    if (f.buff?.tint) drawSprite(ctx, id, fr, x, f.y, f.face, f.scale, { alpha: alpha * (0.22 + Math.sin(this.frame * 0.2) * 0.06), sy, rot, variant: f.buff.tint });
    if (f.flashT > 0) drawSprite(ctx, id, fr, x, f.y, f.face, f.scale, { alpha: alpha * 0.6, sy, rot, variant: 'white' });
    return true;
  }
  drawTrail(ctx, pts, color) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < pts.length; i++) {
      const [t0, b0] = pts[i - 1], [t1, b1] = pts[i];
      ctx.globalAlpha = (i / pts.length) * 0.55;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b0[0], b0[1]); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  drawBoxes(ctx) {
    ctx.lineWidth = 1.5;
    for (const f of [...this.fighters, ...this.assists]) {
      const r = f.hurt(); ctx.strokeStyle = '#3aff6a'; ctx.strokeRect(r.x, r.y, r.w, r.h);
      if (f.state === 'move' && f.mv.m.hits) for (const h of f.mv.m.hits) if (f.mv.f >= h.at[0] && f.mv.f <= h.at[1]) { const b = this.hitbox(f, h); ctx.strokeStyle = '#ff3a3a'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
    }
    for (const p of this.projs) if (p.active) { const b = p.box(); ctx.strokeStyle = '#ffb03a'; ctx.strokeRect(b.x, b.y, b.w, b.h); }
  }
}
