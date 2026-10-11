// 角色状态机:移动 / 跳跃(二段跳)/ 冲刺(瞬步)/ 防御 / 招式执行 / 受击 / 倒地 / 受身 / 替身。
import { GRAV, MAX_HP, MAX_QI, MAX_CP, CP_REGEN, SUB_COST, AIRDASH_COST, WALL_L, WALL_R } from './config.js';
import { POSES, idlePose, walkPose, runPose } from './poses.js';
import { POSE_KEYS, BASE_POSE } from './skeleton.js';
import { clamp, lerp } from './util.js';

let fid = 1;
const FREE = new Set(['stand', 'walk', 'guard', 'land']);
const AIRFREE = new Set(['air']);
const HURT = new Set(['hit', 'airhit', 'knock', 'gstun', 'gbreak', 'locked']);

export class Fighter {
  constructor(def, side, B, o = {}) {
    this.id = fid++;
    this.def = def; this.side = side; this.B = B;
    this.look = def.look; this.scale = def.look.scale || 1;
    this.x = o.x ?? 600; this.y = 0; this.vx = 0; this.vy = 0; this.face = o.face ?? 1;
    this.maxHp = MAX_HP; this.hp = o.hp ?? MAX_HP; this.hpShow = this.hp;
    this.qi = o.qi ?? 0; this.cp = MAX_CP; this.cpDelay = 0;
    this.state = 'stand'; this.st = 0; this.mv = null;
    this.hitstop = 0; this.inv = 0; this.flashT = 0; this.hurtT = 0;
    this.airJumps = 1; this.airDash = 1;
    this.combo = { hits: 0, dmg: 0, stun: 0, air: 0, limit: false };
    this.guardDmg = 0; this.guardT = 0;
    this.buff = null; this.status = { burn: 0, freeze: 0, bind: 0, burnBy: null };
    this.stats = { dealt: 0, maxCombo: 0, supers: 0, subs: 0 };
    this.rs = { chains: {}, disp: { ...POSES.stand }, sway: 0 };
    this.pad = o.pad || null;
    this.isAssist = !!o.assist;
    this.walkPh = 0; this.spinR = 0;
    this.lockBy = null; this.lockOff = [40, 0];
    this.alive = true;
    this.lastLanded = -999;
    this.poseOv = null;
    this.lastHurt = -999;
  }
  get opp() { return this.B.opponentOf(this); }
  get grounded() { return this.y >= 0; }
  get dmgMul() { return (this.buff?.dmg || 1) * (this.def.power || 1); }
  get spdMul() { return this.buff?.spd || 1; }
  isFree() { return FREE.has(this.state) || (this.state === 'dash' && this.st > 5); }
  isHurt() { return HURT.has(this.state); }
  hittable() { return this.alive && !this.isAssist && this.inv <= 0 && !['down', 'getup', 'tech', 'ko', 'win', 'intro', 'out'].includes(this.state) && !(this.state === 'dash' && !this.dashBack && this.st >= 2 && this.st <= (this.def.dash === 'run' ? 6 : 8)); }
  isGuarding() {
    if (!this.grounded) return false;
    if (this.state === 'guard' || this.state === 'gstun') return true;
    return (this.state === 'stand' || this.state === 'walk' || this.state === 'land') && this.pad && this.pad.held.down;
  }
  hurt() {
    const s = this.scale;
    if (this.state === 'down') return { x: this.x - 50, y: -22, w: 100, h: 22 };
    if (['airhit', 'knock', 'tech', 'locked'].includes(this.state) || (!this.grounded && this.state !== 'move')) return { x: this.x - 22 * s, y: this.y - 85 * s, w: 44 * s, h: 70 * s };
    const hh = (this.mv?.m.low ? 74 : 112) * s;
    return { x: this.x - 20 * s, y: this.y - hh, w: 40 * s, h: hh };
  }
  setState(s) { this.state = s; this.st = 0; if (s !== 'move') { this.mv = null; this.poseOv = null; } }
  faceOpp() { const o = this.opp; if (o && Math.abs(o.x - this.x) > 2) this.face = o.x > this.x ? 1 : -1; }
  resetCombo() { if (this.combo.hits) this.combo = { hits: 0, dmg: 0, stun: 0, air: 0, limit: false }; }
  useCp(n) { this.cp -= n; this.cpDelay = 30; }

  // ---------------------------------------------------------------- 每帧
  update() {
    const B = this.B;
    if (this.flashT > 0) this.flashT--;
    if (this.hitstop > 0) { this.hitstop--; return; }
    this.st++;
    if (this.inv > 0) this.inv--;
    if (this.guardT > 0) this.guardT--; else this.guardDmg = Math.max(0, this.guardDmg - 2);
    if (this.cpDelay > 0) this.cpDelay--; else this.cp = Math.min(MAX_CP, this.cp + CP_REGEN * (this.buff?.cpRegen || 1));
    if (B.infinite?.[this.side]) { this.cp = MAX_CP; this.qi = MAX_QI; }
    this.qi = clamp(this.qi, 0, MAX_QI);
    if (this.buff && --this.buff.t <= 0) { this.buff.onEnd?.(); this.buff = null; B.fx.smoke(this.x, this.y - 50, 8, '#ffffff', 0.8); }
    if (this.buff?.regen && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + this.buff.regen);
    this.tickStatus();
    this.hpShow = this.hpShow > this.hp ? Math.max(this.hp, this.hpShow - (this.isHurt() ? 0 : 6)) : this.hp;

    const fn = this['st_' + this.state];
    if (fn) fn.call(this);
    this.physics();
    this.updatePose();
  }

  tickStatus() {
    const s = this.status;
    if (s.burn > 0) { s.burn--; if (s.burn % 12 === 0 && this.hp > 1) { this.hp = Math.max(1, this.hp - 4); this.B.fx.fireBurst(this.x, this.y - 50, 3, 0.6); } }
    if (s.freeze > 0) s.freeze--;
    if (s.bind > 0) s.bind--;
  }

  physics() {
    if (this.state === 'locked') return;
    const air = this.y < 0 || this.vy < 0;
    const floaty = this.mv?.m.float && this.mv.f < this.mv.m.float;
    this.x += this.vx;
    if (air) {
      this.y += this.vy;
      if (!floaty && !(this.state === 'dash' && !this.dashGround)) {
        let g = GRAV;
        if (this.state === 'airhit') g *= 1 + this.combo.air * 0.035;
        if (this.mv?.m.grav !== undefined) g = this.mv.m.grav;
        this.vy += g;
      }
      if (this.y >= 0) { this.y = 0; this.land(); }
    } else {
      this.y = 0;
      const fr = this.state === 'move' ? (this.mv.m.slide ?? 0.82) : (this.state === 'hit' || this.state === 'gstun' ? 0.86 : 0.7);
      if (this.state !== 'walk' && this.state !== 'dash') this.vx *= fr;
    }
    if (!this.isAssist) this.x = clamp(this.x, WALL_L, WALL_R);
    const wv = this.vx;
    this.rs.sway = lerp(this.rs.sway, clamp(wv * 2.2, -14, 14), 0.15);
  }

  land() {
    const s = this.state;
    this.airJumps = 1; this.airDash = 1;
    if (s === 'airhit' || s === 'locked') {
      // 空中受击落地 → 倒地(连段被重力拉下)
      this.B.fx.dust(this.x, 0, 8, this.B.dustColor);
      this.toDown(); return;
    }
    if (s === 'knock' || s === 'ko') {
      if (this.vy > 7 && !this.bounced) { this.vy = -this.vy * 0.35; this.y = -1; this.bounced = true; this.B.fx.dust(this.x, 0, 10, this.B.dustColor); this.B.sfx('bounce'); return; }
      this.B.fx.dust(this.x, 0, 8, this.B.dustColor); this.B.sfx('fall');
      if (s === 'ko') { this.vy = 0; this.vx *= 0.3; this.koLanded = true; return; }
      this.toDown(); return;
    }
    if (s === 'move') {
      const m = this.mv.m;
      if (m.onLand) { m.onLand(this, this.B, this.mv); return; }
      if (m.air && !m.landOk) { this.vy = 0; this.setState('land'); this.landT = 7; return; }
      this.vy = 0; return;
    }
    if (s === 'tech' || s === 'air' || s === 'dash') { this.vy = 0; this.setState('land'); this.landT = 4; this.B.sfx('land', { vol: 0.5 }); this.B.fx.dust(this.x, 0, 4, this.B.dustColor); return; }
    this.vy = 0;
  }
  toDown() {
    this.vy = 0; this.vx *= 0.3; this.bounced = false;
    if (this.hp <= 0) { this.setState('ko'); this.koLanded = true; return; }
    this.setState('down'); this.downT = this.combo.limit ? 46 : 38;
  }

  // ---------------------------------------------------------------- 状态处理
  st_intro() { this.vx = 0; }
  st_win() { this.vx = 0; }
  st_out() { this.vx = 0; }
  st_stand() { this.neutral(); }
  st_walk() { this.neutral(); }
  st_guard() {
    this.vx = 0; this.resetCombo();
    if (this.tryActions(true)) return;
    if (!this.pad?.held.down) this.setState('stand');
  }
  st_land() { this.vx *= 0.6; if (this.st >= (this.landT || 4)) { this.setState('stand'); this.neutral(); } else if (this.st >= 2) this.tryActions(false, true); }
  neutral() {
    this.faceOpp();
    this.resetCombo();
    if (this.tryActions(false)) return;
    const p = this.pad; if (!p) { this.vx = 0; this.setState('stand'); return; }
    if (p.held.down && this.grounded) { this.setState('guard'); this.vx = 0; return; }
    const dir = (p.held.right ? 1 : 0) - (p.held.left ? 1 : 0);
    if (dir) {
      const back = dir !== this.face;
      this.vx = dir * (back ? (this.def.walkBack || 3.0) : (this.def.walk || 3.4)) * this.spdMul;
      if (this.state !== 'walk') this.setState('walk');
      this.walkPh += (back ? -1 : 1) * 9 * this.spdMul;
      if (this.st % 18 === 0) this.B.sfx('step', { vol: 0.3 });
    } else { this.vx = 0; if (this.state !== 'stand') this.setState('stand'); }
  }
  // 返回 true 表示已转入其他状态
  tryActions(guarding, landing) {
    const p = this.pad; if (!p) return false;
    const up = p.held.up, down = p.held.down;
    const pre = up ? 'W' : down ? 'S' : '';
    if (p.take('I') && this.startMove(pre + 'I', 'I')) return true;
    if (p.take('U') && this.startMove(pre + 'U', 'U')) return true;
    if (p.take('J') && this.startMove(pre === '' ? 'J' : pre + 'J', 'J')) return true;
    if (p.take('O')) { this.B.callAssist(this); }
    if (!landing && p.take('L')) { this.startDash(); return true; }
    if (p.take('K')) { this.doJump(); return true; }
    return false;
  }
  doJump() {
    const p = this.pad; const dir = (p.held.right ? 1 : 0) - (p.held.left ? 1 : 0);
    this.setState('air');
    this.vy = -(this.def.jump || 12.2); this.vx = dir * 4.4 * this.spdMul;
    this.y = -0.1; this.airJumps = 1;
    this.B.sfx('jump', { vol: 0.6 }); this.B.fx.dust(this.x, 0, 4, this.B.dustColor);
  }
  st_air() {
    this.resetCombo();
    const p = this.pad; if (!p) return;
    const pre = p.held.down ? 'S' : p.held.up ? 'W' : '';
    if (p.take('I') && this.startMove('a' + pre + 'I', 'aI')) return;
    if (p.take('U') && this.startMove('a' + pre + 'U', 'aU')) return;
    if (p.take('J') && this.startMove('a' + pre + 'J', 'aJ')) return;
    if (p.take('O')) this.B.callAssist(this);
    if (p.take('K') && this.airJumps > 0) {
      this.airJumps--; const dir = (p.held.right ? 1 : 0) - (p.held.left ? 1 : 0);
      this.vy = -10.4; if (dir) this.vx = dir * 4.4; this.spinR = 360;
      this.B.sfx('jump', { vol: 0.5, pitch: 1.2 }); this.B.fx.ring(this.x, this.y, 6, 30, '#ffffff', 10, 2, 0.35);
      return;
    }
    if (p.take('L') && this.airDash > 0 && this.cp >= AIRDASH_COST) { this.useCp(AIRDASH_COST); this.airDash--; this.startDash(true); }
  }
  startDash(air) {
    const p = this.pad;
    const dir = (p?.held.right ? 1 : 0) - (p?.held.left ? 1 : 0);
    if (!air) this.faceOpp();
    const back = dir && dir !== this.face;
    this.setState('dash');
    this.dashBack = back; this.dashGround = !air;
    const sh = this.def.dash === 'shunpo' || this.def.dash === 'sand';
    this.dashLen = back ? 14 : sh ? 12 : 17;
    const d = back ? -this.face : this.face;
    this.vx = d * (back ? 8.5 : sh ? 15 : 10.5) * this.spdMul;
    if (back && !air) { this.vy = -4; this.y = -0.1; }
    if (air) this.vy = 0;
    this.B.sfx(sh ? 'shunpo' : 'dash');
    if (this.def.dash === 'sand') this.B.fx.burst(this.x, this.y - 40, '#d8b878', 14, 4, 'dot');
    else if (!sh) this.B.fx.dust(this.x, this.y, 5, this.B.dustColor, -d);
  }
  st_dash() {
    const sh = this.def.dash === 'shunpo' || this.def.dash === 'sand';
    if (sh && this.st % 2 === 0) this.B.afterimage(this, this.def.dash === 'sand' ? '#d8b878' : '#ffffff');
    if (!sh && this.st % 4 === 0) this.B.fx.speedLines(this.x, this.y - 40, this.vx > 0 ? 1 : -1);
    if (this.st > 4) {
      const p = this.pad;
      if (p && (p.has('J') || p.has('U') || p.has('I'))) {
        const air = !this.grounded;
        const pre = p.held.up ? 'W' : p.held.down ? 'S' : '';
        for (const b of ['I', 'U', 'J']) if (p.take(b) && this.startMove((air ? 'a' : '') + pre + b, (air ? 'a' : '') + b)) return;
      }
      if (p && this.grounded && p.take('K')) { const vx = this.vx; this.doJump(); this.vx = clamp(vx * 0.6, -7, 7); return; }
    }
    if (this.st >= this.dashLen) {
      if (this.grounded && this.y >= 0) { this.vx *= 0.3; this.setState('land'); this.landT = this.dashBack ? 6 : 3; }
      else { this.vx *= 0.5; this.setState('air'); }
    }
  }
  st_hit() { if (this.st >= this.stunT) { this.setState('stand'); } else this.trySub(); }
  st_gstun() { this.vx *= 0.88; if (this.st >= this.stunT) this.setState(this.pad?.held.down ? 'guard' : 'stand'); }
  st_gbreak() { if (this.st >= 46) this.setState('stand'); }
  st_airhit() {
    if (this.status.freeze > 0) return;
    if (this.trySub()) return;
    // 受身(空中按跳)
    if (this.pad && this.st > 12 && !this.combo.limit && !this.noTech && this.pad.take('K')) this.doTech();
  }
  st_knock() {
    if (this.trySub()) return;
    if (this.pad && this.st > 14 && !this.combo.limit && !this.noTech && this.vy > -2 && this.pad.take('K')) this.doTech();
  }
  doTech() {
    this.setState('tech'); this.inv = 18; this.vy = -6; this.vx = -this.face * 2.5; this.spinR = 360;
    this.resetCombo(); this.B.sfx('shunpo', { vol: 0.5 }); this.B.fx.ring(this.x, this.y - 40, 10, 40, '#ffffff', 10, 2);
  }
  st_tech() { if (this.st > 16) this.setState('air'); }
  trySub() {
    // 替身术:受击中按冲刺,消耗查克拉,瞬移到对手身后稍远处
    const p = this.pad;
    if (!p || this.status.freeze > 0 || this.state === 'locked' || this.combo.noSub) return false;
    if (this.cp < SUB_COST || !p.take('L')) return false;
    const o = this.opp; const B = this.B;
    this.useCp(SUB_COST);
    if (this.def.faction === 'ninja') B.fx.log(this.x, this.y); else B.afterimage(this, '#ffffff', 20);
    B.fx.smoke(this.x, this.y - 50, 12);
    B.sfx('smoke');
    const tx = o ? o.x + o.face * -1 * 110 : this.x;
    this.x = clamp(tx, WALL_L + 10, WALL_R - 10); this.y = 0; this.vx = 0; this.vy = 0;
    this.faceOpp();
    this.setState('land'); this.landT = 8; this.inv = 24;
    this.resetCombo();
    this.stats.subs++;
    B.fx.smoke(this.x, -50, 8);
    B.fx.text(this.x, -150, '替身', '#9ad8ff', 22, 40);
    return true;
  }
  st_down() {
    this.vx *= 0.8;
    const quick = this.pad && this.st > 14 && this.pad.take('K');
    if (this.st >= this.downT || quick) { this.setState('getup'); this.inv = 16; this.resetCombo(); }
  }
  st_getup() { if (this.st >= 16) { this.setState('stand'); this.inv = 6; this.faceOpp(); } }
  st_ko() { this.vx *= 0.95; }
  st_locked() {
    const L = this.lockBy;
    const gone = !L || L.dead || (L instanceof Fighter && (L.state !== 'move' || L.mv?.lockT !== this));
    if (gone) { this.lockBy = null; this.state = 'knock'; this.st = 0; this.vy = -5; this.vx = -this.face * 3; this.y = Math.min(this.y, -1); return; }
    const f = L.face ?? L.dir ?? 1;
    this.x = L.x + this.lockOff[0] * f; this.y = Math.min(0, L.y + this.lockOff[1]);
    this.vx = 0; this.vy = 0;
  }

  // ---------------------------------------------------------------- 招式
  startMove(key, fallback) {
    const moves = this.def.moves;
    let m = moves[key];
    if (!m && fallback && key !== fallback) m = moves[fallback];
    if (!m) return false;
    if (m.air && this.grounded && this.y >= 0) return false;
    if (!m.air && !this.grounded) return false;
    if (m.cond && !m.cond(this, this.B)) return false;
    const qi = m.qi || 0, cp = m.cp || 0;
    if (this.qi < qi || this.cp < cp) {
      if (this.pad?.isHuman) this.B.fx.text(this.x, this.y - 140, qi > this.qi ? '气不足' : (this.def.faction === 'ninja' ? '查克拉不足' : '灵力不足'), '#ff9a9a', 16, 30);
      return false;
    }
    this.qi -= qi; if (cp) this.useCp(cp);
    if (!m.air) this.faceOpp();
    this.state = 'move'; this.st = 0;
    this.mv = { m, f: 0, hit: new Set(), data: {}, connected: false, key };
    this.poseOv = null;
    if (m.air && m.hop !== undefined) this.vy = m.hop;
    if (m.stopAir) { this.vx *= 0.3; this.vy = Math.min(this.vy, 0) * 0.2; }
    if (!m.air && !m.keepVx) this.vx *= 0.2;
    if (qi >= 100) this.stats.supers++;
    if (m.cutin) this.B.superFreeze(this, m);
    if (m.start) m.start(this, this.B, this.mv);
    return true;
  }
  st_move() {
    const mv = this.mv, m = mv.m, f = mv.f, B = this.B;
    if (m.vel) for (const v of m.vel) if (v[0] === f) { if (v[1] !== null) this.vx = v[1] * this.face * this.spdMul; if (v.length > 2 && v[2] !== null) { this.vy = v[2]; if (v[2] < 0) this.y = Math.min(this.y, -0.1); } }
    if (m.ev && m.ev[f]) m.ev[f](this, B, mv);
    if (m.tick) m.tick(this, B, mv, f);
    if (this.state !== 'move' || this.mv !== mv) return;
    if (m.armor && f >= m.armor[0] && f <= m.armor[1]) this.armorOn = true; else this.armorOn = false;
    if (m.inv && f >= m.inv[0] && f <= m.inv[1]) this.inv = Math.max(this.inv, 1);
    if (m.hits) for (let i = 0; i < m.hits.length; i++) { const h = m.hits[i]; if (f >= h.at[0] && f <= h.at[1]) B.meleeCheck(this, h, i, mv); }
    if (m.sfx && m.sfx[f]) B.sfx(m.sfx[f]);
    if (m.trail && f === m.trail[0] + 1 && m.hits?.length) B.slashFx(this, m);
    this.checkCancel(mv, m, f);
    if (this.state !== 'move' || this.mv !== mv) return;
    mv.f++;
    if (mv.f >= (mv.dur || m.dur)) this.endMove();
  }
  checkCancel(mv, m, f) {
    const p = this.pad; if (!p) return;
    const air = !!m.air;
    // 普攻连段(空挥也可)
    if (m.next && f >= m.nf && p.has('J')) {
      const pre = p.held.up ? 'W' : p.held.down ? 'S' : '';
      let key = m.next;
      if (pre && !air && this.def.moves[pre + 'J'] && m.cat === 'N') key = pre + 'J';
      if (air && pre === 'S' && this.def.moves.aSJ) key = 'aSJ';
      if (key !== mv.key && this.def.moves[key]) { p.take('J'); this.startMove(key); return; }
    }
    // 命中后取消:普攻 → 技能 / 必杀 / 冲刺 / 跳;技能 → 必杀
    const canHitCancel = mv.connected && f >= (m.cf ?? 6) && !m.noCancel;
    if (!canHitCancel) return;
    const pre = p.held.up ? 'W' : p.held.down ? 'S' : '';
    if (m.cat === 'N' || m.cat === 'U') {
      if (p.has('I')) { const k = (air ? 'a' : '') + pre + 'I'; if (this.def.moves[k] || this.def.moves[air ? 'aI' : 'I']) { p.take('I'); if (this.startMove(k, air ? 'aI' : 'I')) return; } }
    }
    if (m.cat === 'N') {
      if (p.has('U')) { const k = (air ? 'a' : '') + pre + 'U'; p.take('U'); if (this.startMove(k, air ? 'aU' : 'U')) return; }
      if (p.has('L') && !air) { p.take('L'); this.startDash(); return; }
      if (m.jc && p.has('K')) { p.take('K'); this.doJump(); this.vy = -12.8; this.vx = this.face * 2.8; return; }
    }
  }
  endMove() {
    const m = this.mv?.m;
    if (m?.end) m.end(this, this.B, this.mv);
    this.armorOn = false;
    if (this.state !== 'move') return;
    if (!this.grounded) { this.setState('air'); this.airDash = Math.min(this.airDash, m?.air ? 0 : 1); }
    else { this.setState('stand'); this.vx *= 0.5; }
  }

  // ---------------------------------------------------------------- 受击反应
  react(h, dir, dmg) {
    const B = this.B;
    let kind = h.kind || 'normal';
    const kb = h.kb || [3, 0];
    if (this.combo.stun > (h.limit || 230) && kind !== 'lock' && !h.noLimit) { kind = 'knock'; this.combo.limit = true; }
    if (this.armorOn && kind !== 'lock' && !h.unblock) { this.flashT = 4; return; }
    if (this.status.freeze > 0 && kind !== 'lock') kind = 'freezehit';
    this.hurtT = 0;
    if (kind !== 'lock') this.lockBy = null;
    if (this.state === 'move') this.armorOn = false;
    this.mv = null; this.poseOv = null;
    this.noTech = !!h.noTech;
    const grounded = this.grounded && this.state !== 'airhit' && this.state !== 'knock';
    switch (kind) {
      case 'normal':
        if (grounded) { this.state = 'hit'; this.st = 0; this.stunT = h.stun ?? 18; this.vx = dir * kb[0]; this.hitLow = !!h.low; }
        else { this.state = 'airhit'; this.st = 0; this.vy = kb[1] || -3.8; this.vx = dir * Math.max(1.2, kb[0] * 0.6); this.y = Math.min(this.y, -1); this.combo.air++; }
        break;
      case 'launch':
        this.state = 'airhit'; this.st = 0; this.vy = kb[1] || -11; this.vx = dir * kb[0]; this.y = Math.min(this.y, -1); this.combo.air++;
        break;
      case 'knock':
        this.state = 'knock'; this.st = 0; this.vx = dir * (kb[0] || 6); this.vy = kb[1] || -6.5; this.y = Math.min(this.y, -1); this.bounced = false;
        this.spinR = h.spin ? 360 : 0;
        break;
      case 'spike':
        if (grounded) { this.state = 'knock'; this.st = 0; this.vx = dir * 2; this.vy = -3; this.y = -1; }
        else { this.state = 'knock'; this.st = 0; this.vx = dir * (kb[0] || 2); this.vy = kb[1] || 12; this.bounced = false; }
        break;
      case 'freezehit':
        this.state = grounded ? 'hit' : 'airhit'; this.st = 0; this.stunT = Math.max(this.stunT || 0, this.status.freeze); this.vx = dir * kb[0] * 0.5;
        break;
      case 'lock':
        break;
    }
    if (h.freeze) { this.status.freeze = h.freeze; if (this.state === 'hit') this.stunT = Math.max(this.stunT, h.freeze); }
    if (h.burn) this.status.burn = Math.max(this.status.burn, h.burn);
    if (h.dizzy && grounded) { this.state = 'hit'; this.stunT = h.dizzy; }
    if (this.state === 'knock' && this.hp <= 0) this.state = 'ko';
  }
  lockTo(L, off) { this.state = 'locked'; this.st = 0; this.lockBy = L; this.lockOff = off || [42, 0]; this.mv = null; this.vx = 0; this.vy = 0; }

  // ---------------------------------------------------------------- 姿势
  stance() { return POSES[this.def.stance] || (this.look.holdWeapon ? POSES.stand_w : POSES.stand); }
  poseTarget() {
    const s = this.state, d = this.def;
    switch (s) {
      case 'stand': case 'intro': return [d.introPose && s === 'intro' ? POSES[d.introPose] : idlePose(this.stance(), this.B.frame + this.id * 37), 0.25];
      case 'walk': return [walkPose(this.stance(), this.walkPh, this.vx * this.face < 0), 0.35];
      case 'guard': case 'gstun': return [this.look.holdWeapon ? POSES.guard_w : POSES.guard, 0.5];
      case 'land': return [POSES.crouch, 0.5];
      case 'dash': return [this.dashBack ? POSES.backdash : (d.dash === 'run' ? runPose(POSES.run, this.st * 26) : POSES.dash), 0.45];
      case 'air': return [this.vy < 0 ? POSES.jump : POSES.fall, 0.18];
      case 'hit': return [this.status.freeze > 0 ? this.rs.disp : (this.hitLow ? POSES.hit_b : POSES.hit_h), 0.6];
      case 'gbreak': return [POSES.dizzy, 0.3];
      case 'locked': if (this.y >= -1 && !(this.lockBy instanceof Fighter)) return [POSES.hit_b, 0.4]; return [POSES.airhit, 0.4];
      case 'airhit': return [this.status.freeze > 0 ? this.rs.disp : POSES.airhit, 0.4];
      case 'knock': case 'ko': return [this.grounded && (this.koLanded || this.st > 4) && s === 'ko' ? POSES.down : POSES.knock, 0.3];
      case 'down': return [POSES.down, 0.35];
      case 'getup': return [POSES.getup, 0.3];
      case 'tech': return [POSES.ball, 0.5];
      case 'win': return [POSES[d.winPose || 'victory'], 0.15];
      case 'out': return [POSES.stand, 0.2];
      case 'move': {
        if (this.poseOv) return [this.poseOv, this.mv.m.blend || 0.5];
        const ps = this.mv.m.poses; if (!ps) return [this.stance(), 0.3];
        let cur = ps[0];
        for (const p of ps) if (p[0] <= this.mv.f) cur = p;
        const pose = typeof cur[1] === 'string' ? (POSES[cur[1]] || POSES.stand) : cur[1];
        return [pose, cur[2] ?? this.mv.m.blend ?? 0.5];
      }
    }
    return [POSES.stand, 0.3];
  }
  updatePose() {
    const [tgt, k] = this.poseTarget();
    this.poseName = tgt.__n;
    const d = this.rs.disp;
    for (const key of POSE_KEYS) { const v = tgt[key] ?? BASE_POSE[key]; d[key] = d[key] === undefined ? v : d[key] + (v - d[key]) * k; }
    if (this.spinR > 0) { this.spinR = Math.max(0, this.spinR - 24); }
  }
  displayPose() {
    const p = this.rs.disp;
    if (this.spinR > 0) return { ...p, r: (p.r || 0) - (360 - this.spinR) };
    return p;
  }
}
