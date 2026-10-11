// 电脑玩家:按难度决定反应间隔与各类决策概率,只通过虚拟手柄(Controller)操作角色,与人类同规则。
import { ST } from './frames.js';
import { rnd, sign, clamp } from './util.js';

const REACT = [16, 9, 5, 2];          // 决策间隔(TU)
const DEFEND_P = [0.08, 0.25, 0.45, 0.7];
const SPECIAL_P = [0.25, 0.5, 0.75, 0.95];
const DODGE_P = [0.1, 0.35, 0.6, 0.85];

export class AI {
  constructor(f, level = 1) {
    this.f = f;
    this.level = level;
    this.held = {};
    this.next = 0;
    this.goal = null;      // {type, ...}
    this.cool = {};        // 招式冷却
    this.wander = 0;
    this.holdA = 0;
    this.keepAway = f.def.ai?.keepAway || 0;
  }
  press(k) { this.f.ctrl.virtual[k] = true; }
  feed() { this.f.ctrl.update(this.held); }

  think(w) {
    const f = this.f, c = f.ctrl;
    const h = this.held;
    for (const k in h) h[k] = false;
    if (f.dead || f.caughtBy) return;
    const st = f.state;
    // 被抓时乱按挣扎无效;抓住别人时:打几拳后投掷
    if (st === ST.CATCHING && f.frameId === 120) {
      if (rnd() < 0.25) { if (f.catchPunches >= 2 + (this.level > 1 ? 1 : 0) || rnd() < 0.15) { h[f.facing > 0 ? 'right' : 'left'] = true; this.press('A'); } else this.press('A'); }
      return;
    }
    // 倒地中空翻
    if (st === ST.FALLING && f.vy > 0 && f.y < -14 && rnd() < [0.05, 0.25, 0.5, 0.8][this.level] * 0.4) { this.press('J'); return; }
    // 持续按键(如连发)
    if (this.holdA > 0) { this.holdA--; if (w.tick % 3 === 0) this.press('A'); }
    // 持续耗 MP 的招式(旋风腿、火焰喷射、冰火大炮等)适时按 J 停止
    if (st === ST.ATTACK && typeof f.fr.next === 'function' && f.fr.hit_j !== undefined) {
      this.chanT = (this.chanT || 0) + 1;
      if (this.chanT > 30 + this.level * 10 || (this.chanT > 12 && !this.pickTarget(w))) { this.press('J'); this.chanT = 0; }
    } else this.chanT = 0;
    if (st !== ST.STAND && st !== ST.WALK && st !== ST.RUN && st !== ST.DEFEND && st !== ST.JUMP && st !== ST.DASH) return;

    const tgt = this.pickTarget(w);
    // 闪避飞行道具
    if (st === ST.STAND || st === ST.WALK) {
      const threat = this.incoming(w);
      if (threat && rnd() < DODGE_P[this.level] * 0.5) {
        if (rnd() < 0.55) this.press('D'); else { h[f.z < (w.bg.zMin + w.bg.zMax) / 2 ? 'down' : 'up'] = true; }
        return;
      }
    }
    if (!tgt) { this.idle(w); return; }
    const dx = tgt.x - f.x, dz = tgt.z - f.z, adx = Math.abs(dx), adz = Math.abs(dz);
    const toward = sign(dx) || 1;

    // 跳 / 冲中:接近顶点时出腿
    if (st === ST.JUMP || st === ST.DASH) {
      if (adx < 70 && adz < 16 && f.facing === toward && rnd() < 0.6) this.press('A');
      return;
    }
    // 敌人贴身出招时防御
    const tst = tgt.state;
    if ((st === ST.STAND || st === ST.WALK) && adx < 70 && adz < 16 && (tst === ST.ATTACK || tst === ST.OTHER) && tgt.facing === -toward && rnd() < DEFEND_P[this.level] * 0.6) {
      this.press('D'); return;
    }
    if (w.tick < this.next) { this.continueGoal(w, tgt, dx, dz); return; }
    this.next = w.tick + REACT[this.level] + Math.floor(rnd() * 4);

    // 喝饮料 / 捡东西
    if (f.holding && f.holding.def.drink && (f.hp < f.maxHp * 0.7 || f.holding.def.drink === 'mp')) { this.press('A'); return; }
    if (!f.holding && rnd() < 0.5) {
      const item = this.nearItem(w);
      if (item) { this.goal = { type: 'item', item }; this.continueGoal(w, tgt, dx, dz); return; }
    }
    // 特殊招式
    const sp = this.chooseSpecial(w, tgt, adx, adz, dx);
    if (sp) {
      if (sp.type[0] === 'F') c.forceCombo(sp.type, sp.away ? -toward : toward); else { if (f.facing !== toward && !sp.any) h[toward > 0 ? 'right' : 'left'] = true; c.forceCombo(sp.type, 0); }
      this.cool[sp.type] = w.tick + (sp.cd ?? 40) * (4 - this.level) / 2;
      if (sp.mash) this.holdA = sp.mash;
      return;
    }
    // 晕眩目标:走过去抓 / 重拳
    if (tst === ST.DIZZY && adx < 120) { this.goal = { type: 'catch' }; this.continueGoal(w, tgt, dx, dz); return; }
    // 远程型保持距离
    if (this.keepAway && adx < this.keepAway * 0.6 && rnd() < 0.5) { this.goal = { type: 'away', t: w.tick + 20 }; this.continueGoal(w, tgt, dx, dz); return; }
    // 中距离:跳踢 / 冲刺
    if (adx > 90 && adx < 150 && adz < 14 && rnd() < 0.18 + this.level * 0.05) { h[toward > 0 ? 'right' : 'left'] = true; this.press('J'); return; }
    if (adx > 180 && adx < 420 && rnd() < 0.35 && f.state !== ST.RUN) { c.forceRun(toward); this.goal = { type: 'run', t: w.tick + 40 }; return; }
    this.goal = { type: 'melee' };
    this.continueGoal(w, tgt, dx, dz);
  }

  continueGoal(w, tgt, dx, dz) {
    const f = this.f, h = this.held, c = f.ctrl;
    const g = this.goal || { type: 'melee' };
    const toward = sign(dx) || 1, adx = Math.abs(dx), adz = Math.abs(dz);
    if (f.state === ST.RUN) {
      // 跑动中:接近后跑攻 / 冲跳攻
      if (adz > 6) h[dz > 0 ? 'down' : 'up'] = true;
      if (sign(dx) !== f.facing && adx > 30) { h[f.facing > 0 ? 'left' : 'right'] = true; return; }
      if (adx < 70 && adz < 14) { this.press(rnd() < 0.6 ? 'A' : 'D'); return; }
      if (adx < 150 && adz < 14 && rnd() < 0.12) { this.press('J'); return; }
      return;
    }
    if (g.type === 'item') {
      const it = g.item;
      if (!it || it.removed || it.state !== 'ground') { this.goal = null; return; }
      const ix = it.x - f.x, iz = it.z - f.z;
      if (Math.abs(ix) < 22 && Math.abs(iz) < 10) { if (f.facing !== (sign(ix) || f.facing)) h[ix > 0 ? 'right' : 'left'] = true; else this.press('A'); this.goal = null; return; }
      if (Math.abs(ix) > 8) h[ix > 0 ? 'right' : 'left'] = true;
      if (Math.abs(iz) > 4) h[iz > 0 ? 'down' : 'up'] = true;
      return;
    }
    if (g.type === 'away') {
      if (w.tick > g.t) { this.goal = null; return; }
      h[toward > 0 ? 'left' : 'right'] = true;
      if (adz < 30) h[f.z > (w.bg.zMin + w.bg.zMax) / 2 ? 'up' : 'down'] = true;
      return;
    }
    if (g.type === 'run' && w.tick > g.t) this.goal = null;
    // 近战:先对齐 z,再贴近,面对后出拳
    const range = f.holding && !f.holding.def.drink ? 46 : 38;
    if (adz > 8) h[dz > 0 ? 'down' : 'up'] = true;
    if (adx > range) h[toward > 0 ? 'right' : 'left'] = true;
    else if (adx < 16) h[toward > 0 ? 'left' : 'right'] = true;
    else if (f.facing !== toward) h[toward > 0 ? 'right' : 'left'] = true;
    if (adx <= range + 6 && adz < 12 && f.facing === toward) {
      if (g.type === 'catch' && tgt.state === ST.DIZZY) { h[toward > 0 ? 'right' : 'left'] = true; if (rnd() < 0.4) this.press('A'); return; }
      const cad = [0.25, 0.45, 0.65, 0.85][this.level];
      if (rnd() < cad) this.press('A');
    }
  }

  chooseSpecial(w, tgt, adx, adz, dx) {
    const f = this.f;
    const list = f.def.ai?.specials;
    if (!list || rnd() > SPECIAL_P[this.level] * 0.55) return null;
    const opts = [];
    for (const s of list) {
      if ((this.cool[s.type] || 0) > w.tick) continue;
      const fid = f.def.moves?.[s.type];
      if (fid === undefined) continue;
      const id = typeof fid === 'function' ? fid(f) : fid;
      if (id == null || !f.canAfford(id)) continue;
      if (s.when && !s.when(f, tgt, w)) continue;
      if (adx < (s.min ?? 0) || adx > (s.max ?? 9999) || adz > (s.z ?? 18)) continue;
      opts.push(s);
    }
    if (!opts.length) return null;
    let sum = 0; for (const s of opts) sum += s.w ?? 1;
    let r = rnd() * sum;
    for (const s of opts) { r -= s.w ?? 1; if (r <= 0) return s; }
    return opts[0];
  }

  pickTarget(w) {
    const f = this.f;
    let best = null, bd = 1e9;
    for (const e of w.entities) {
      if (e.kind !== 'char' || e.team === f.team || e.dead || e.removed) continue;
      let d = Math.abs(e.x - f.x) + Math.abs(e.z - f.z) * 2;
      if (e.state === ST.LYING) d += 400;
      if (e.invisible > 0) d += 600;
      if (e === this.lastTarget) d -= 60;
      if (d < bd) { bd = d; best = e; }
    }
    this.lastTarget = best;
    return best;
  }
  incoming(w) {
    const f = this.f;
    for (const e of w.entities) {
      if (e.kind !== 'proj' || e.team === f.team || e.state !== 'fly' || !e.def.itr) continue;
      const dx = f.x - e.x;
      if (Math.abs(dx) < 140 && sign(e.vx) === sign(dx) && Math.abs(e.z - f.z) < 16) return e;
    }
    return null;
  }
  nearItem(w) {
    const f = this.f;
    let best = null, bd = 220;
    for (const e of w.entities) {
      if (e.kind !== 'item' || e.state !== 'ground') continue;
      if (e.def.drink === 'hp' && f.hp > f.maxHp * 0.8) continue;
      if (e.def.drink === 'mp' && f.mp > f.maxMp * 0.6) continue;
      if (e.def.wtype === 'heavy' && rnd() < 0.5) continue;
      const d = Math.abs(e.x - f.x) + Math.abs(e.z - f.z) * 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  idle(w) {
    const h = this.held;
    if (--this.wander <= 0) { this.wander = 20 + Math.floor(rnd() * 40); this.wdir = Math.floor(rnd() * 5); }
    if (this.wdir === 1) h.left = true; else if (this.wdir === 2) h.right = true; else if (this.wdir === 3) h.up = true;
  }
}
