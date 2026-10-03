// 比赛会话：固定步长推进所有车，判定赛制胜负，把事件转给表现层（弹幕/音效/镜头/HUD）。
// 无表现层时（Node 测试）也能完整运行。
import { CarSim, SIM_DT } from '../car/physics.js';
import { CARS, wulingBonus } from '../car/specs.js';
import { AIDriver, PERSONAS } from './ai.js';
import { BenzRoute } from './benz.js';
import { WaterCup } from './cup.js';
import { clamp, rng } from '../core/math.js';

export class RaceSession {
  /**
   * cfg: { course, rain, mode, player:{car,sticker,passengers,tofu}, opponents:[{car,persona,paceMul}],
   *        cup:'off'|'show'|'fatal', ditch:bool, assist:bool, chaseRole:'chaser'|'leader', script, seed, story }
   */
  constructor(track, cfg, hooks = {}) {
    this.track = track; this.cfg = cfg; this.hooks = hooks;
    this.course = track.course(cfg.course);
    this.env = { mu: cfg.rain ? 0.72 : 1, recover: cfg.rain ? 0.7 : 1, ditchEnabled: !!cfg.ditch, assist: cfg.assist !== false };
    this.rand = rng(cfg.seed ?? 1986);
    this.time = 0; this.raceTime = 0; this.acc = 0; this.timeScale = 1; this.slowmo = 0;
    this.state = 'countdown'; this.countdown = cfg.countdown ?? 3;
    this.result = null; this.racers = []; this.events = [];
    this.inputLocked = false; this.autoInput = null; this.cupEnabled = cfg.cup && cfg.cup !== 'off';
    this.cup = this.cupEnabled ? new WaterCup() : null;
    this.chase = null; this.flags = {};
    this.speedoGlitch = 0;
    this._setup();
    this.script = cfg.script || null;
    this.script?.start?.(this);
  }

  _setup() {
    const c = this.course, cfg = this.cfg;
    const dir = c.dir;
    const opps = (cfg.opponents || []).map((o) => CARS[o.car]);
    const pspec = CARS[cfg.player.car];
    const mk = (spec, opts) => new CarSim(spec, { seed: (cfg.seed ?? 1) + this.racers.length * 31, ...opts });
    const player = { id: 'player', isPlayer: true, spec: pspec, sim: mk(pspec, { luck: cfg.player.sticker ? 0.01 : 0 }), name: cfg.player.name || '你' };
    // 五菱宏光：遇强则强（隐藏加成可读）+ 乘客小加成
    if (pspec.id === 'wuling') {
      const b = wulingBonus(opps);
      const pass = cfg.player.passengers ? 0.03 : 0;
      player.wuling = { bonus: b, passengers: pass };
      player.sim.boost.accel = 1 + b + pass;
      player.sim.boost.grip = 1 + b * 0.5 + pass * 0.5;
    }
    this.player = player;
    this.racers.push(player);
    const L = 1.9;
    (cfg.opponents || []).forEach((o, k) => {
      const spec = CARS[o.car];
      if (o.route) { // 固定路线（终章奔驰）
        const route = new BenzRoute(this.track, c, { startProg: o.startProg ?? 45, ...o.routeOpts });
        this.racers.push({ id: 'opp' + k, spec, sim: route, route: true, name: o.name || spec.owner });
        return;
      }
      const sim = mk(spec, {});
      const base = PERSONAS[typeof o.persona === 'string' ? o.persona : spec.id] || PERSONAS.default;
      const ai = new AIDriver(sim, this.track, c, { ...base, ...(typeof o.persona === 'object' ? o.persona : {}) }, (cfg.seed ?? 5) + k * 17);
      ai.paceMul = o.paceMul ?? 1;
      this.racers.push({ id: 'opp' + k, spec, sim, ai, name: o.name || spec.owner, persona: o.persona });
    });
    // 发车位置
    const n = this.racers.length;
    const mode = cfg.mode;
    const startProg = cfg.startProg ?? 0;
    this.racers.forEach((r, k) => {
      if (r.route) return;
      let prog = startProg, lat = 0;
      if (mode === 'chase') {
        const chaserIsPlayer = (cfg.chaseRole || 'chaser') === 'chaser';
        const behind = (r.isPlayer && chaserIsPlayer) || (!r.isPlayer && !chaserIsPlayer);
        prog = startProg + (behind ? 0 : (cfg.chaseGap ?? 22));
        lat = 0;
      } else if (n === 1) lat = 0;
      else if (n === 2) lat = (k === 0 ? 1 : -1) * L;
      else { prog = startProg - Math.floor(k / 2) * 9; lat = (k % 2 ? -1 : 1) * L; }
      const s = c.s0 + prog * dir;
      r.sim.place(this.track, s, lat * dir, dir);
      if (cfg.rolling) r.sim.speed = cfg.rolling;
      if (cfg.rollingOpp && !r.isPlayer) r.sim.speed = cfg.rollingOpp;
    });
    if (mode === 'chase') this.chase = { leader: (cfg.chaseRole || 'chaser') === 'chaser' ? this.racers[1] : this.player, chaser: (cfg.chaseRole || 'chaser') === 'chaser' ? this.player : this.racers[1], passT: 0, gapWin: cfg.gapWin ?? 150 };
    for (const r of this.racers) { r.prog = this.progOf(r); r.finished = false; r.finishTime = null; r.rank = 0; }
    this._rank(true);
  }

  progOf(r) { return r.route ? r.sim.prog : (r.sim.s - this.course.s0) * this.course.dir; }
  emit(type, data = {}) { this.events.push({ type, ...data }); this.hooks.onEvent?.(type, data, this); }

  /** 现实时间推进；返回本帧执行的固定步数 */
  update(realDt, input) {
    realDt = Math.min(realDt, 0.1);
    if (this.slowmo > 0) { this.slowmo -= realDt; }
    const ts = this.slowmo > 0 ? Math.min(this.timeScale, 0.32) : this.timeScale;
    this.acc += realDt * ts;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 24) {
      this.acc -= SIM_DT; steps++;
      this.step(SIM_DT, input);
    }
    if (steps >= 24) this.acc = 0;
    return steps;
  }

  step(dt, input) {
    this.time += dt;
    this.script?.step?.(this, dt);
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) this.emit('count', { n: Math.ceil(this.countdown) });
      if (this.countdown <= 0) { this.state = 'race'; this.emit('go'); }
      for (const r of this.racers) if (r.route) r.sim.place();
      return;
    }
    if (this.state === 'done') {
      // 结束后继续滑行（AI 缓刹）
      for (const r of this.racers) if (!r.route) r.sim.step(dt, { throttle: 0, brake: 0.25, steer: 0 }, this.track, this.env);
      return;
    }
    this.raceTime += dt;
    for (const r of this.racers) {
      if (r.route) { r.sim.step(dt); continue; }
      let inp;
      if (r.isPlayer) inp = this.autoInput ? this.autoInput(this, dt) : this.inputLocked ? { throttle: 0, brake: 0, steer: 0 } : input;
      else inp = r.ai.update(dt, this.env, this.racers);
      if (r.finished && !r.isPlayer) inp = { throttle: 0.2, brake: 0, steer: inp.steer };
      r.sim.step(dt, inp, this.track, this.env);
      for (const e of r.sim.events) this._carEvent(r, e);
      r.sim.events.length = 0;
    }
    this._collide();
    // 水杯
    if (this.cup) {
      const p = this.player.sim;
      const was = this.cup.empty;
      this.cup.update(dt, p.latAcc, p.lonAcc);
      if (this.cup.spillRate > 0.02 && !this.flags.spillMsg) { this.flags.spillMsg = true; this.emit('spill'); }
      if (this.cup.spillRate === 0) this.flags.spillMsg = false;
      if (!was && this.cup.empty && this.cfg.cup === 'fatal') this._end('fail', '水洒光了');
    }
    // 进度、排名、完赛
    for (const r of this.racers) {
      r.prog = this.progOf(r);
      if (!r.finished && r.prog >= this.course.length) {
        r.finished = true; r.finishTime = this.raceTime;
        this.emit('finishLine', { racer: r.id, isPlayer: !!r.isPlayer });
      }
    }
    this._rank(false);
    this._rules(dt);
  }

  /** 车与车碰撞：每车前后两个圆，互相推开并交换法向速度 */
  _collide() {
    const cars = this.racers.filter((r) => !r.route || !r.sim.staged);
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i].sim, b = cars[j].sim;
      const dx0 = b.x - a.x, dz0 = b.z - a.z;
      if (dx0 * dx0 + dz0 * dz0 > 36) continue;
      for (const oa of [-1.05, 1.05]) for (const ob of [-1.05, 1.05]) {
        const ax = a.x + Math.cos(a.heading) * oa, az = a.z - Math.sin(a.heading) * oa;
        const bx = b.x + Math.cos(b.heading) * ob, bz = b.z - Math.sin(b.heading) * ob;
        let dx = bx - ax, dz = bz - az;
        const d = Math.hypot(dx, dz), R = 1.7;
        if (d >= R || d < 1e-4) continue;
        dx /= d; dz /= d;
        const pen = (R - d) / 2;
        const aRoute = !!cars[i].route, bRoute = !!cars[j].route;
        if (!aRoute) { a.x -= dx * pen * (bRoute ? 2 : 1); a.z -= dz * pen * (bRoute ? 2 : 1); }
        if (!bRoute) { b.x += dx * pen * (aRoute ? 2 : 1); b.z += dz * pen * (aRoute ? 2 : 1); }
        // 法向相对速度
        const avx = Math.cos(a.phi) * a.speed, avz = -Math.sin(a.phi) * a.speed;
        const bvx = Math.cos(b.phi) * b.speed, bvz = -Math.sin(b.phi) * b.speed;
        const rel = (bvx - avx) * dx + (bvz - avz) * dz;
        if (rel < 0) {
          const imp = -rel * 0.55;
          const nav = [avx - dx * imp * (bRoute ? 2 : 1), avz - dz * imp * (bRoute ? 2 : 1)];
          const nbv = [bvx + dx * imp * (aRoute ? 2 : 1), bvz + dz * imp * (aRoute ? 2 : 1)];
          if (!aRoute) { a.speed = Math.hypot(nav[0], nav[1]); a.phi = Math.atan2(-nav[1], nav[0]); if (!a.drifting) a.heading += Math.atan2(Math.sin(a.phi - a.heading), Math.cos(a.phi - a.heading)) * 0.3; }
          if (!bRoute) { b.speed = Math.hypot(nbv[0], nbv[1]); b.phi = Math.atan2(-nbv[1], nbv[0]); if (!b.drifting) b.heading += Math.atan2(Math.sin(b.phi - b.heading), Math.cos(b.phi - b.heading)) * 0.3; }
          if (-rel > 1.5 && (cars[i].isPlayer || cars[j].isPlayer) && this.time - (this.flags.lastBump || -9) > 0.6) { this.flags.lastBump = this.time; this.emit('bump', { severity: -rel }); }
        }
      }
    }
  }

  _carEvent(r, e) {
    if (r.isPlayer) {
      if (e.type === 'driftEnd' && e.perfect) { this.slowmo = 0.5; this.emit('perfect', e); }
      else if (e.type === 'driftEnd') this.emit('driftEnd', e);
      else this.emit(e.type, e);
    } else if (e.type === 'wall') this.emit('oppWall', { racer: r.id, ...e });
  }

  _rank(init) {
    const sorted = [...this.racers].sort((a, b) => (a.finished && b.finished ? a.finishTime - b.finishTime : b.prog - a.prog));
    sorted.forEach((r, i) => {
      const prev = r.rank;
      r.rank = i + 1;
      if (!init && r.isPlayer && prev && r.rank !== prev && this.state === 'race') {
        if (r.rank < prev) this.emit('overtake', { victim: sorted[i + 1]?.id, rank: r.rank, victimRacer: sorted[i + 1] });
        else this.emit('overtaken', { by: sorted[i - 1]?.id, rank: r.rank, byRacer: sorted[i - 1] });
      }
    });
    this.sorted = sorted;
  }

  _rules() {
    if (this.state !== 'race') return;
    const p = this.player, mode = this.cfg.mode;
    if (this.script?.rules?.(this)) return; // 剧情脚本自定义胜负
    if (mode === 'chase' && this.chase) {
      const { leader, chaser } = this.chase;
      const gap = leader.prog - chaser.prog;
      this.chase.gap = gap;
      if (gap < -2) this.chase.passT += SIM_DT; else this.chase.passT = 0;
      if (this.chase.passT > 0.6) return this._end(chaser === p ? 'win' : 'lose', chaser === p ? '超车成功' : '被超车');
      if (gap > this.chase.gapWin) return this._end(leader === p ? 'win' : 'lose', leader === p ? `拉开 ${this.chase.gapWin} 米` : '被甩开');
      if (leader.finished || chaser.finished) { const w = leader.finished ? leader : chaser; return this._end(w === p ? 'win' : 'lose', '先到终点'); }
      return;
    }
    if (mode === 'time' || mode === 'tofu') {
      if (p.finished) this._end('win', mode === 'tofu' ? `剩余水量 ${Math.round(this.cup.level * 100)}%` : '完成');
      return;
    }
    // 单挑 / 混战：玩家完赛或任一对手先完赛时判定
    if (p.finished) return this._end(p.rank === 1 ? 'win' : 'lose', `第 ${p.rank} 名`);
    if (this.racers.length > 1 && this.racers.every((r) => r.isPlayer || r.finished)) return this._end('lose', '最后一名');
    if (mode !== 'melee') {
      const other = this.racers.find((r) => !r.isPlayer && r.finished);
      if (other) return this._end('lose', '对手先到终点');
    }
  }

  _end(result, reason) {
    if (this.result) return;
    this.state = 'done';
    const p = this.player;
    this.result = {
      result, reason, time: p.finishTime ?? this.raceTime, rank: p.rank, total: this.racers.length,
      water: this.cup ? this.cup.level : null, walls: p.sim.wallHits,
      score: this.cfg.mode === 'tofu' && this.cup ? +(this.raceTime + (1 - this.cup.level) * 60).toFixed(2) : null
    };
    this.emit('end', this.result);
  }

  /** 玩家复位到赛道中心 */
  resetPlayer() {
    const p = this.player.sim;
    const s = p.s;
    p.place(this.track, s, 0, this.course.dir);
    this.emit('reset');
  }

  snapshot() {
    const p = this.player;
    return {
      state: this.state, raceTime: +this.raceTime.toFixed(3), mode: this.cfg.mode, course: this.cfg.course,
      progress: +p.prog.toFixed(1), length: +this.course.length.toFixed(1), rank: p.rank, total: this.racers.length,
      player: p.sim.snapshot(), water: this.cup ? +this.cup.level.toFixed(3) : null,
      wuling: p.wuling || null, chaseGap: this.chase?.gap ?? null, result: this.result,
      opponents: this.racers.filter((r) => !r.isPlayer).map((r) => ({ id: r.id, car: r.spec.id, prog: +r.prog.toFixed(1), kmh: +r.sim.kmh.toFixed(1), finished: r.finished }))
    };
  }
}
