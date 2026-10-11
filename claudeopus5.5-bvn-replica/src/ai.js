// 电脑对手:只通过虚拟手柄操作。难度决定反应间隔、防御 / 替身 / 受身概率与连段执行率。
import { rand, chance, pick } from './util.js';
import { SUB_COST } from './config.js';

const LV = [
  { react: 24, guard: 0.22, sub: 0.02, tech: 0.2, combo: 0.35, special: 0.3, aggro: 0.45, err: 0.25 },
  { react: 14, guard: 0.5, sub: 0.05, tech: 0.5, combo: 0.65, special: 0.45, aggro: 0.6, err: 0.12 },
  { react: 8, guard: 0.72, sub: 0.1, tech: 0.8, combo: 0.85, special: 0.55, aggro: 0.7, err: 0.05 },
  { react: 4, guard: 0.88, sub: 0.18, tech: 0.95, combo: 0.97, special: 0.65, aggro: 0.8, err: 0.01 },
];
const SPECIAL_KEYS = ['U', 'WU', 'SU', 'I', 'WI', 'SI'];
const AIR_KEYS = ['aU', 'aI'];

export class CpuBrain {
  constructor(B, f, pad, diff = 1) {
    this.B = B; this.f = f; this.pad = pad;
    this.L = LV[Math.max(0, Math.min(3, diff))];
    this.wait = 30; this.hold = null; this.route = null;
  }
  think() {
    const { f, pad, B, L } = this;
    const o = f.opp;
    pad.release();
    if (!o || f.state === 'ko' || f.state === 'win' || f.state === 'intro') return;
    const dx = o.x - f.x, adx = Math.abs(dx), dir = dx >= 0 ? 1 : -1;
    const fwd = dir > 0 ? 'right' : 'left', back = dir > 0 ? 'left' : 'right';
    const dy = o.y - f.y;

    // 受击中:替身 / 受身
    if (f.isHurt()) {
      if (f.cp >= SUB_COST && f.combo.hits >= 3 && chance(L.sub)) pad.tap('L');
      if ((f.state === 'airhit' || f.state === 'knock') && f.st > 12 && chance(L.tech * 0.15)) pad.tap('K');
      this.route = null;
      return;
    }
    if (f.state === 'down') { if (chance(0.04 * (1 + L.combo))) pad.tap('K'); return; }

    // 招式中:连段续接
    if (f.state === 'move') { this.continueCombo(f, o, adx); return; }

    // 空中
    if (!f.grounded || f.state === 'air') {
      if (adx < 100 && Math.abs(dy) < 90 && chance(0.5)) { if (dy > 30 && chance(0.4)) pad.set('down', true); pad.tap('J'); }
      else if (this.route === 'airchain' && adx < 140) pad.tap('J');
      else if (chance(0.02 * L.special)) this.tryAir(f, adx);
      return;
    }

    // 识破地面陷阱 / 天降攻击的预兆:冲刺或跳开
    if (f.isFree()) {
      const trap = B.projs.find((p) => p.side !== f.side && p.delay > 0 && p.delay < 30 && Math.abs(p.x - f.x) < p.w / 2 + 50);
      if (trap && !trap.seen?.[f.side]) {
        trap.seen = trap.seen || {}; trap.seen[f.side] = true;
        if (chance(L.guard * 0.85)) { const away = trap.x > f.x ? 'left' : 'right'; pad.set(away, true); if (chance(0.5)) pad.tap('L'); else pad.tap('K'); this.hold = { kind: 'walk', dir: away, t: 10 }; return; }
      }
    }
    // 防御判断(每帧都看,受反应速度限制)
    const threat = this.threat(f, o, adx);
    if (threat && this.hold?.kind !== 'guard' && chance(L.guard * 0.35)) {
      this.hold = { kind: 'guard', t: 14 + Math.floor(rand() * 16) };
    }
    if (this.hold) {
      this.hold.t--;
      if (this.hold.kind === 'guard') pad.set('down', true);
      if (this.hold.kind === 'walk') pad.set(this.hold.dir, true);
      if (this.hold.kind === 'back') pad.set(back, true);
      if (this.hold.t <= 0) this.hold = null;
      if (this.hold?.kind === 'guard') return;
    }
    if (--this.wait > 0) return;
    this.wait = L.react + Math.floor(rand() * L.react);
    if (chance(L.err)) return;

    const sd = B.sides[f.side];
    // 援助
    if (sd.assistGauge >= 100 && adx < 500 && chance(0.25)) { pad.tap('O'); return; }
    // 必杀 / 技能
    if (chance(L.special) && this.trySpecial(f, o, adx, threat)) return;
    // 近身
    if (adx < 105 && Math.abs(dy) < 60) {
      if (o.state === 'down' || o.state === 'getup') { this.hold = { kind: 'back', t: 10 }; return; }
      const r = rand();
      if (r < 0.55) { pad.tap('J'); this.route = chance(L.combo) ? 'chain' : null; }
      else if (r < 0.7) { pad.set('up', true); pad.tap('J'); this.route = 'launch'; }
      else if (r < 0.82) { pad.set('down', true); pad.tap('J'); }
      else if (r < 0.92) { this.hold = { kind: 'guard', t: 12 }; }
      else { pad.set(back, true); pad.tap('L'); }
      return;
    }
    // 对空
    if (o.y < -40 && adx < 180 && chance(0.6)) { pad.set('up', true); pad.tap('J'); return; }
    // 中远距离
    const r = rand();
    if (r < L.aggro * 0.5) { pad.set(fwd, true); pad.tap('L'); }
    else if (r < L.aggro * 0.75) { this.hold = { kind: 'walk', dir: fwd, t: 20 + Math.floor(rand() * 30) }; }
    else if (r < L.aggro * 0.9 && adx < 300) { pad.set(fwd, true); pad.tap('K'); this.route = 'airchain'; }
    else if (r < 0.92) { this.hold = { kind: 'walk', dir: chance(0.6) ? fwd : back, t: 16 }; }
    else this.hold = { kind: 'guard', t: 18 };
  }
  threat(f, o, adx) {
    if (o.state === 'move' && !o.mv.connected) {
      const m = o.mv.m;
      if (m.cat === 'N' && adx < 160) return true;
      if (m.cat !== 'N' && adx < 340) return true;
    }
    for (const p of this.B.projs) if (p.side !== f.side && p.active && !p.nohit && Math.abs(p.x - f.x) < 240 && Math.sign(f.x - p.x) === Math.sign(p.vx || p.dir)) return true;
    return false;
  }
  continueCombo(f, o, adx) {
    const { pad, L } = this;
    const mv = f.mv, m = mv.m;
    if (m.cat === 'N' && mv.connected === true) {
      if (m.jc && this.route === 'launch' && mv.f >= (m.cf ?? 6) && chance(L.combo)) { pad.tap('K'); this.route = 'airchain'; return; }
      // 命中确认取消必杀
      if (!m.next && mv.f >= (m.cf ?? 6) && f.qi >= 100 && chance(L.combo * 0.5)) { pad.tap('I'); return; }
      if (!m.next && mv.f >= (m.cf ?? 6) && f.cp >= 25 && chance(L.combo * 0.4)) { pad.tap('U'); return; }
      if (m.next && mv.f >= m.nf) {
        if (mv.key === 'J3' && chance(0.35 * L.combo)) { pad.set('up', true); pad.tap('J'); this.route = 'launch'; return; }
        if (chance(L.combo)) pad.tap('J');
      }
    } else if (m.cat === 'N' && m.next && mv.f >= m.nf && this.route === 'chain' && adx < 120 && chance(0.4)) pad.tap('J');
  }
  trySpecial(f, o, adx, threat) {
    const moves = f.def.moves, B = this.B;
    const cand = [];
    for (const k of SPECIAL_KEYS) {
      const m = moves[k]; if (!m || !m.ai) continue;
      if ((m.qi || 0) > f.qi || (m.cp || 0) > f.cp) continue;
      if (m.cond && !m.cond(f, B)) continue;
      const [lo, hi] = m.ai.r;
      if (adx < lo || adx > hi) continue;
      let w = m.ai.w || 1;
      switch (m.ai.type) {
        case 'anti': if (o.y > -30) continue; w *= 2; break;
        case 'buff': if (f.buff || f.qi < 300) continue; w *= 0.8; break;
        case 'counter': if (!(o.state === 'move' || (o.state === 'dash' && adx < 200))) continue; w *= 2; break;
        case 'escape': if (f.hp > f.maxHp * 0.5 && !threat) continue; break;
        case 'shield': if (!threat) continue; w *= 2; break;
        case 'rush': case 'close': if (o.state === 'down' || o.inv > 0) continue; break;
        case 'trap': if (o.state === 'down' || o.inv > 0) w *= 0.2; break;
      }
      if (m.qi) w *= f.qi >= 300 ? 1.6 : 0.8;
      if (m.qi && o.hp < m.qi * 1.2) w *= 2;
      cand.push([k, w]);
    }
    if (!cand.length) return false;
    let tot = cand.reduce((a, c) => a + c[1], 0), r = rand() * tot;
    let pickK = cand[0][0];
    for (const [k, w] of cand) { r -= w; if (r <= 0) { pickK = k; break; } }
    this.press(pickK);
    return true;
  }
  tryAir(f, adx) {
    for (const k of AIR_KEYS) {
      const m = f.def.moves[k]; if (!m || !m.ai) continue;
      if ((m.qi || 0) > f.qi || (m.cp || 0) > f.cp) continue;
      if (adx < m.ai.r[0] || adx > m.ai.r[1]) continue;
      this.pad.tap(k[1]); return true;
    }
    return false;
  }
  press(k) {
    const pad = this.pad;
    if (k[0] === 'W') pad.set('up', true);
    if (k[0] === 'S') pad.set('down', true);
    pad.tap(k[k.length - 1]);
  }
}
