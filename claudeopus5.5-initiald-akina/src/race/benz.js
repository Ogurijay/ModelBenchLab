// 终章奔驰：不做 AI 对抗。沿固定路线、按赛道区间定义的速度剖面行驶，
// 不读取玩家状态，不闪灯，不看后视镜。弯道略低于 86 的抓地上限，直道远超 86 极速。
import { CARS, deriveParams } from '../car/specs.js';
import { clamp } from '../core/math.js';

const G = 9.81;

export function benzProfile(track, course, opts = {}) {
  const mu86 = deriveParams(CARS.ae86).mu;
  const corner = opts.cornerFactor ?? 0.98;     // 弯道：略低于 86 的极限
  const vStraight = opts.vStraight ?? 78;       // 直道：281 km/h，远超 86 极速（约 184 km/h）
  const vMountain = opts.vMountain ?? 34;       // 山路直线段：豪华轿车也不会在山路狂奔
  const lane = opts.lane ?? 1.9;
  const hp = track.hairpin(6);
  const n = Math.ceil(course.length) + 1;
  const v = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const s = course.s0 + p * course.dir;
    const i = track.idx(s);
    const k = Math.abs(track.curv[i]);
    // 车道偏移后的半径（内侧车道更紧）
    const inner = Math.sign(track.curv[i]) * lane * course.dir;
    const kl = k / Math.max(0.3, 1 - k * inner);
    let vc = k > 1e-4 ? corner * Math.sqrt(mu86 * G / kl) : 99;
    const nat = track.national[i];
    vc = Math.min(vc, nat ? vStraight : vMountain);
    if (hp && s > hp.s0 - 10 && s < hp.s1 + 5) vc = Math.min(vc, (opts.hairpinFactor ?? 0.62) * Math.sqrt(mu86 * G / kl)); // 最后一个发夹弯：豪车慢慢转
    v[p] = vc;
  }
  // 加减速限制（前向/反向两遍），区间内近似匀速
  const acc = opts.accel ?? 3.2, dec = opts.decel ?? 5.5;
  const accN = opts.accelNational ?? 6.5; // 出山后大排量轻松加速
  for (let p = 1; p < n; p++) {
    const nat = track.national[track.idx(course.s0 + p * course.dir)];
    v[p] = Math.min(v[p], Math.sqrt(v[p - 1] ** 2 + 2 * (nat ? accN : acc)));
  }
  for (let p = n - 2; p >= 0; p--) v[p] = Math.min(v[p], Math.sqrt(v[p + 1] ** 2 + 2 * dec));
  return { v, lane };
}

export class BenzRoute {
  constructor(track, course, opts = {}) {
    this.track = track; this.course = course;
    this.prof = benzProfile(track, course, opts);
    this.spec = CARS.benz;
    this.prog = opts.startProg ?? 0;
    this.lat = this.prof.lane * course.dir; // 左侧车道（相对行驶方向）
    this.speed = this.vAt(this.prog);
    this.x = 0; this.y = 0; this.z = 0; this.heading = 0; this.phi = 0;
    this.beta = 0; this.drifting = false; this.driftDir = 0; this.steer = 0; this.brake = 0; this.handbrake = false;
    this.latAcc = 0; this.lonAcc = 0; this.inDitch = false; this.ditchBump = 0; this.time = 0;
    this.staged = false; this.events = []; this.rpm = 2200; this.gear = 4; this.throttle = 0.4;
    this._smp = {};
    this.place();
  }
  get kmh() { return this.speed * 3.6; }
  get s() { return this.course.s0 + this.prog * this.course.dir; }
  vAt(p) { const v = this.prof.v; return v[clamp(Math.floor(p), 0, v.length - 1)]; }
  step(dt) {
    this.time += dt;
    if (this.staged) return; // 导演接管（并排镜头期间）
    const v0 = this.speed;
    this.speed = this.vAt(this.prog);
    this.lonAcc = (this.speed - v0) / dt;
    this.brake = this.lonAcc < -1 ? 0.6 : 0;
    this.prog += this.speed * dt;
    this.place();
  }
  place() {
    const q = this.track.sample(this.s, this._smp);
    const h0 = this.heading;
    this.x = q.x + q.nx * this.lat; this.z = q.z + q.nz * this.lat; this.y = q.y;
    this.heading = Math.atan2(-q.tz * this.course.dir, q.tx * this.course.dir);
    this.phi = this.heading;
    this.latAcc = this.speed * this.speed * q.curv * this.course.dir * 0.5;
    if (Math.abs(this.heading - h0) > 1) this.latAcc = 0;
  }
  snapshot() { return { prog: +this.prog.toFixed(1), kmh: +this.kmh.toFixed(1), staged: this.staged }; }
}
