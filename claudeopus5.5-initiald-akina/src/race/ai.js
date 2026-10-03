// AI 车手：与玩家共用同一套 CarSim 物理，只负责"产生输入"。
// 个性参数决定失误类型：六叔 GT-R 急弯带速过高 → 四驱推头；刘教练冲动 → 撞墙；陈老师贴极限 → 漂移过发夹。
import { clamp, wrapAngle, rng } from '../core/math.js';

const G = 9.81;

/** 赛道几何决定的走线（左正右负），与方向无关：内侧 = 弯心侧 */
export function buildRacingLine(track) {
  if (track._line) return track._line;
  const n = track.n, raw = new Float32Array(n), line = new Float32Array(n);
  const w = track.halfWidth - 1.5;
  for (let i = 0; i < n; i++) raw[i] = clamp(track.curv[i] * 55, -1, 1) * w;
  const R = 14;
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -R; k <= R; k++) { const j = i + k; if (j >= 0 && j < n) { s += raw[j]; c++; } }
    line[i] = s / c;
  }
  track._line = line;
  return line;
}

export const PERSONAS = {
  default: { pace: 0.95, tightOver: 1.0, pushAware: 1, crashy: 0, hairpinDrift: false, look: 1 },
  ae86: { pace: 0.97, tightOver: 1.0, crashy: 0, hairpinDrift: true, look: 1 },
  ae85: { pace: 0.94, tightOver: 1.0, crashy: 0, hairpinDrift: false, look: 1 },
  wuling: { pace: 0.96, tightOver: 1.0, crashy: 0, hairpinDrift: false, look: 1 },
  r32: { pace: 0.97, tightOver: 1.0, pushAware: 0.45, crashy: 0, hairpinDrift: false, look: 1 }, // 入急弯推头
  evo: { pace: 0.97, tightOver: 1.0, crashy: 0.45, crashOver: 1.24, hairpinDrift: false, look: 0.9 }, // 冲动
  evo3: { pace: 0.985, tightOver: 1.0, crashy: 0, hairpinDrift: false, look: 1.05 },
  fc: { pace: 0.99, tightOver: 1.0, crashy: 0, hairpinDrift: true, look: 1.1 },
  benz: { pace: 0.9, tightOver: 1.0, crashy: 0, hairpinDrift: false, look: 1 }
};

export class AIDriver {
  constructor(car, track, course, persona = {}, seed = 7) {
    this.car = car; this.track = track; this.course = course;
    this.pp = { ...PERSONAS.default, ...persona };
    this.line = buildRacingLine(track);
    this.rand = rng(seed);
    this.over = new Map(); // 每个急弯（段号）是否冲动超速
    this.stuck = 0; this.hbTimer = 0;
    this.laneBias = 0; // 混战时错开走线
    this.paceMul = 1;
    this.inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, analog: true };
    this.smp = {};
  }

  /** 沿课程方向前方 d 米的弧长 */
  ahead(d) { return this.car.s + d * this.course.dir; }

  update(dt, env = {}, racers = null) {
    const car = this.car, tr = this.track, pp = this.pp, dir = this.course.dir;
    const V = car.speed;
    // 前方有车：从空间更大的一侧绕行；贴太近则收油跟车
    let follow = Infinity;
    if (racers) {
      let bias = 0;
      for (const r of racers) {
        const o = r.sim;
        if (o === car || (r.route && o.staged)) continue;
        const ahead = (o.s - car.s) * dir;
        if (ahead > 0 && ahead < 28) {
          const dl = o.lat - car.lat;
          if (Math.abs(dl) < 2.4) {
            const side = o.lat > 0 ? -1 : 1;
            bias = side * 2.6;
            if (ahead < 9 && Math.abs(dl) < 1.8) follow = Math.min(follow, o.speed);
          }
        }
      }
      this.laneBias += (bias - this.laneBias) * Math.min(1, dt * 2.5);
    }
    const mu = car.p.mu * (env.mu ?? 1) * car.boost.grip;
    // —— 目标速度：前方 160 米每点的过弯极限 + 制动距离
    let vt = car.p.vmax * 1.2;
    const brakeA = car.p.brake * 0.72 * Math.sqrt(env.mu ?? 1);
    for (let d = 0; d <= 160; d += 2) {
      const i = tr.idx(this.ahead(d));
      let k = Math.abs(tr.curv[i]);
      if (k < 1e-4) continue;
      let m = mu * pp.pace * this.paceMul;
      if (pp.useDitch && env.ditchEnabled && tr.ditch[i] !== 0) { k = k / Math.max(0.3, 1 - k * 3.54); m *= 2.1; } // 排水渠过弯（内侧半径）
      if (k > 1 / 32) {
        m *= pp.tightOver * Math.pow(car.p.push, pp.pushAware); // 六叔不信四驱会推头

        if (pp.crashy > 0) {
          const key = tr.seg[i];
          if (!this.over.has(key)) this.over.set(key, this.rand() < pp.crashy);
          if (this.over.get(key)) m *= pp.crashOver;
        }
      }
      const vc = Math.sqrt(m * G / k);
      const gr = tr.grade[i] * dir; // 下坡减弱制动
      const ba = Math.max(2.5, brakeA - G * gr * 0.8);
      const va = Math.sqrt(vc * vc + 2 * ba * d);
      if (va < vt) vt = va;
    }
    this.vTarget = vt;

    // —— 纯追踪转向
    const Ld = (6 + V * 0.42) * pp.look;
    const sa = this.ahead(Ld);
    const q = tr.sample(sa, this.smp);
    let lat = clamp(this.line[q.i] + this.laneBias, -tr.halfWidth + 1.3, tr.halfWidth - 1.3);
    if (pp.useDitch && env.ditchEnabled && tr.ditch[q.i] !== 0) lat = tr.ditch[q.i] * (tr.halfWidth - 1.06);
    const px = q.x + q.nx * lat, pz = q.z + q.nz * lat;
    const ang = Math.atan2(-(pz - car.z), px - car.x);
    const alpha = wrapAngle(ang - car.heading);
    const maxSteer = 0.58 - (0.45 * Math.min(1, V / 52));
    const kDes = 2 * Math.sin(alpha) / Math.max(4, Ld);
    let steer = clamp(kDes * car.p.wheelbase / Math.tan(Math.max(0.1, maxSteer)), -1, 1);
    // 漂移中：目标在速度方向内侧 → 往里打加角收紧；在外侧 → 反打放宽
    if (car.drifting) {
      const d = car.driftDir, b = Math.abs(car.beta);
      const aSlide = mu * car.p.slideMu * G * (0.5 + 0.65 * Math.min(1, b / 0.55));
      const kCur = aSlide / Math.max(16, V * V);
      const kWant = 2 * Math.sin(wrapAngle(ang - car.phi)) / Math.max(4, Ld) * d;
      steer = clamp(2 * (kWant / kCur - 1), -1, 1) * d;
    }

    let throttle = 0, brake = 0;
    if (follow < V + 0.5) vt = Math.min(vt, follow + 0.3);
    if (V < vt - 1) throttle = 1;
    else if (V > vt + 0.4) brake = clamp((V - vt) / 0.8, 0.35, 1);
    else throttle = 0.5;
    if (car.drifting) { throttle = Math.max(throttle, 0.75); brake = 0; }
    if (Math.abs(steer) > 0.55) brake = Math.min(brake, 0.55); // 弯中不重刹

    // 发夹弯手刹入弯（会漂移的车手）
    let hb = false;
    if (pp.hairpinDrift && !car.drifting && V > 11) {
      const i = tr.idx(this.ahead(8));
      if (Math.abs(tr.curv[i]) > 1 / 21 && this.hbTimer <= 0) this.hbTimer = 0.18;
    }
    if (this.hbTimer > 0) { this.hbTimer -= dt; hb = this.hbTimer > 0; steer = Math.sign(tr.curv[tr.idx(this.ahead(8))]) * dir || steer; }

    // 卡住：倒车脱困，过久则复位
    if (V < 1.5 && throttle > 0.5) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 3) { this.respawn(); this.stuck = 0; }

    const o = this.inp;
    o.throttle = throttle; o.brake = brake; o.steer = steer; o.handbrake = hb;
    return o;
  }

  respawn() {
    const car = this.car;
    const s = this.ahead(-4);
    car.place(this.track, s, this.line[this.track.idx(s)], this.course.dir);
    car.speed = 6;
  }
}
