// 街机漂移模型（不做真实轮胎物理）。
//
// 核心：车头朝向 heading 与运动方向 phi 分开积分，二者夹角 beta 即漂移角。
//   · 抓地模式：方向盘决定横摆角速度，受前轮抓地上限约束（四驱入急弯推头）；
//     速度方向以后轮抓地允许的速率追随车头，追不上时 beta 增大 → 进入漂移。
//   · 漂移模式：beta 向"目标漂移角"收敛，目标由方向盘（往里打加大 / 反打减小）
//     与油门（松油门收角）共同决定；速度方向按滑动摩擦绕弯，角越大越紧、越掉速。
//   · 手刹、重心转移（快速左右甩）、刹车+转向会降低后轮抓地；松开后抓地逐渐恢复。
// 固定步长调用（见 SIM_DT），状态只依赖输入序列，可跨帧率精确回放。
import { clamp, wrapAngle, approach, lerp, DEG, rng } from '../core/math.js';
import { deriveParams } from './specs.js';

export const SIM_HZ = 120;
export const SIM_DT = 1 / SIM_HZ;
const G = 9.81;
const RAIL = 0.55; // 护栏距路缘

export class CarSim {
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.p = deriveParams(spec);
    this.id = opts.id || spec.id;
    this.luck = opts.luck || 0; // 护身符贴纸：运气 +1%
    this.rand = rng(opts.seed ?? 86);
    this.boost = { accel: 1, grip: 1 };
    this.events = [];
    this.q = {};
    this.reset();
  }

  reset() {
    this.x = 0; this.z = 0; this.y = 0;
    this.heading = 0; this.phi = 0; this.speed = 0; this.rev = 0;
    this.yawRate = 0; this.steer = 0; this.rearGrip = 1;
    this.drifting = false; this.driftDir = 0; this.beta = 0;
    this.spin = 0; this.engineBlown = false;
    this.hint = -1; this.s = 0; this.lat = 0; this.grade = 0;
    this.inDitch = false; this.ditchBump = 0; this.ditchTime = 0;
    this.wallHits = 0; this.lastWall = -9; this.time = 0;
    this.lastSteerSide = 0; this.lastSteerTime = -9;
    this.drift = null; this.combo = 0; this.lastDriftEnd = -9;
    this.rpm = 900; this.gear = 1; this.throttle = 0; this.brake = 0; this.handbrake = false;
    this.latAcc = 0; this.lonAcc = 0; this.steps = 0;
    this.understeer = 0;
  }

  /** 放到赛道弧长 s、横向偏移 lat，朝向 dir（+1 沿主路线，-1 逆向） */
  place(track, s, lat = 0, dir = 1) {
    this.reset();
    const q = track.sample(s, {});
    this.x = q.x + q.nx * lat; this.z = q.z + q.nz * lat; this.y = q.y;
    this.heading = Math.atan2(-q.tz * dir, q.tx * dir);
    this.phi = this.heading;
    this.hint = q.i; this.s = s; this.lat = lat;
  }

  get kmh() { return this.speed * 3.6; }
  get driftAngle() { return this.drifting ? Math.abs(this.beta) : Math.abs(this.beta) * (this.speed > 3 ? 1 : 0); }

  emit(type, data = {}) { this.events.push({ type, t: this.time, ...data }); }

  /**
   * 推进一个固定步长。
   * inp: { throttle 0..1, brake 0..1, steer -1..1（+左）, handbrake bool, analog bool }
   * env: { mu, recover, ditchEnabled, money }
   */
  step(dt, inp, track, env = {}) {
    const p = this.p;
    this.time += dt; this.steps++;
    const muEnv = (env.mu ?? 1) * this.boost.grip;
    const mu = p.mu * muEnv;
    const throttle = this.engineBlown ? 0 : clamp(inp.throttle || 0, 0, 1);
    const brake = clamp(inp.brake || 0, 0, 1);
    const hb = !!inp.handbrake;
    this.throttle = throttle; this.brake = brake; this.handbrake = hb;

    // —— 方向盘平滑（键盘：回正比打舵快；模拟量输入更跟手）
    const target = clamp(inp.steer || 0, -1, 1);
    const toCenter = Math.abs(target) < Math.abs(this.steer) || Math.sign(target) !== Math.sign(this.steer);
    const rate = inp.analog ? 9 : toCenter ? 7.5 : 4.2;
    this.steer = approach(this.steer, target, rate * dt);

    // —— 赛道查询
    const q = track.project(this.x, this.z, this.hint, this.q);
    this.hint = q.idx; this.s = q.s; this.lat = q.lat;
    const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
    const tdot = fx * q.tx + fz * q.tz; // 车头与主路线切线夹角余弦
    this.grade = q.grade;

    // 重心转移（快速甩方向）检测
    if (Math.abs(target) > 0.7) {
      const side = Math.sign(target);
      if (side !== this.lastSteerSide) {
        if (this.lastSteerSide !== 0 && this.time - this.lastSteerTime < 0.45 && this.speed > 15 && !this.drifting && this.rev === 0) {
          this.heading += side * 0.15;
          this.rearGrip = Math.min(this.rearGrip, 0.45);
          this.emit('feint', { side });
        }
        this.lastSteerSide = side;
      }
      this.lastSteerTime = this.time;
    }

    // 后轮抓地恢复（雨天更慢）
    if (!this.drifting) this.rearGrip = approach(this.rearGrip, 1, p.gripRecover * (env.recover ?? 1) * dt); // 松开后逐渐恢复
    if (hb && this.speed > 3) this.rearGrip = Math.min(this.rearGrip, 0.3);

    // —— 倒车（停稳后按刹车）
    if (this.rev > 0 || (this.speed < 0.6 && brake > 0.5 && throttle < 0.1)) {
      this._reverse(dt, brake, throttle, track);
      return;
    }

    const phi0 = this.phi;
    let V = this.speed;
    let beta = V > 1.5 ? wrapAngle(this.heading - this.phi) : 0;
    const maxSteer = lerp(0.58, 0.13, clamp(V / 52, 0, 1));
    const delta = this.steer * maxSteer;
    const Vc = Math.max(V, 3);
    let scrub = 0;

    // —— 排水渠：内侧轮落入合法窄区间（以弯心一侧为准，与行驶方向无关）
    // 进入窗口 ±0.36 米；卡入后带滞回锁定，直到渠结束、反向猛打或速度超出沟槽承受力
    let ditchRail = false;
    this.ditchBump = Math.max(0, this.ditchBump - dt);
    if (q.ditch !== 0) {
      const latIn = q.lat * q.ditch;
      const targetLat = track.halfWidth - 0.32 - 0.74;
      const err = Math.abs(latIn - targetLat);
      const ok = V > 7 && Math.abs(beta) < 0.42 && !this.drifting;
      if (this.inDitch) {
        const outward = -this.steer * q.ditch * Math.sign(Math.cos(this.phi) * q.tx - Math.sin(this.phi) * q.tz);
        const kIn = Math.abs(q.curv) / Math.max(0.2, 1 - Math.abs(q.curv) * targetLat);
        const overload = V * V * kIn > mu * 2.25 * G;
        ditchRail = err < 0.9 && V > 5 && outward < 0.85 && !overload;
        if (overload) { this.ditchBump = 0.4; this.emit('ditchPop', { speed: V }); }
      } else if (err < 0.36 && ok && this.ditchBump <= 0) {
        if (env.ditchEnabled) ditchRail = true;
        else if (this.ditchBump <= 0) { this.ditchBump = 0.35; this.speed *= 0.93; V = this.speed; this.emit('ditchBump'); }
      }
    }
    if (ditchRail && !this.inDitch) this.emit('ditchIn', { speed: V });
    if (!ditchRail && this.inDitch) this.emit('ditchOut', { speed: V, time: this.ditchTime });
    this.inDitch = ditchRail;
    this.ditchTime = ditchRail ? this.ditchTime + dt : 0;

    if (this.spin > 0) {
      // 打转：失控滑行，1 秒后恢复
      this.spin -= dt;
      this.heading += this.yawRate * dt;
      this.yawRate *= Math.exp(-2.5 * dt);
      this.speed = Math.max(0, V - 7 * dt);
      if (this.spin <= 0) { this.phi = this.heading; this.rearGrip = 0.6; this.beta = 0; }
    } else if (!this.drifting) {
      // ===== 抓地模式 =====
      let omegaT = V * Math.tan(delta) / p.wheelbase;
      // 推头：大打舵（急弯低速）时前轮先饱和；四驱带油更明显
      const tight = Math.min(1, Math.max(0, (Math.abs(this.steer) - 0.35) / 0.45));
      let frontMu = mu * lerp(1, p.push, tight);
      if (p.drive !== 'FR' && throttle > 0.3) frontMu *= lerp(1, lerp(1, p.push, tight), throttle);
      if (ditchRail) frontMu = Math.max(frontMu, mu * 2.1);
      const maxOmega = frontMu * G / Vc;
      this.understeer = Math.max(0, Math.abs(omegaT) - maxOmega) * Vc / G;
      if (Math.abs(omegaT) > maxOmega) {
        scrub += (Math.abs(omegaT) - maxOmega) * Vc * 0.35;
        omegaT = Math.sign(omegaT) * maxOmega;
      }
      this.yawRate += (omegaT - this.yawRate) * Math.min(1, 12 * dt);
      if (hb && V > 7 && Math.abs(this.steer) > 0.15) this.yawRate += this.steer * 9 * dt; // 手刹甩尾
      this.heading += this.yawRate * dt;

      // 后轮侧向容量：油门（摩擦圆）、刹车转向（荷重前移）、手刹都会削弱
      const powerRatio = clamp(p.accel0 * this.boost.accel / (p.mu * G) * (1 - V / p.vmax), 0, 0.95);
      const throttleLoad = throttle * powerRatio * (p.drive === 'FR' ? 1.35 : 0.45);
      const brakeShift = brake > 0.6 && Math.abs(this.steer) > 0.6 && V > 16 ? 0.3 * brake : 0; // 重刹+大打舵 = 荷重前移
      let rearMu = mu * this.rearGrip * Math.sqrt(Math.max(0.04, 1 - throttleLoad * throttleLoad)) * (1 - brakeShift);
      if (ditchRail) rearMu = Math.max(rearMu, mu * 2.1);
      const capRate = rearMu * G / Vc;
      beta = wrapAngle(this.heading - this.phi);
      this.phi += clamp(beta * 9, -capRate, capRate) * dt;
      beta = wrapAngle(this.heading - this.phi);
      if (ditchRail) this._railAlign(dt, q, track);
      beta = wrapAngle(this.heading - this.phi);
      if (Math.abs(beta) > 8 * DEG && V > 8 && !ditchRail && this.time - this.lastWall > 0.35) this._enterDrift(Math.sign(beta), V);
      this.beta = beta;
    } else {
      // ===== 漂移模式 =====
      const d = this.driftDir;
      const u = this.steer * d; // >0 往弯里打，<0 反打
      let bt;
      if (env.assist !== false) bt = u >= 0 ? p.betaHold + u * (p.betaMax - p.betaHold) : p.betaHold * (1 + u * 1.35);
      else bt = u >= 0 ? p.betaMax * (0.85 + 0.15 * u) : p.betaMax * (1 + u * 1.3);
      if (p.drive === 'FR') bt *= lerp(0.1, 1, Math.pow(throttle, 0.7)) + (throttle > 0.9 && u > 0.5 ? 0.08 : 0);
      else if (p.drive === 'AWD') bt *= lerp(0.8, 0.6, throttle);
      else bt *= 0.6;
      if (hb) bt = Math.max(bt, p.betaHold + 10 * DEG);
      bt = clamp(bt, -0.12, p.betaMax + 0.15);
      const prev = this.heading;
      let b = beta * d;
      this.rearGrip = Math.min(this.rearGrip, 0.6 - 0.3 * clamp(b / 0.8, 0, 1)); // 滑动中的后轮 // 当前角（漂移方向为正）
      const db = clamp((bt - b) * p.kBeta, -2.6, 2.6);
      b += db * dt;
      // 绕弯：角越大越紧（滑动摩擦给的侧向加速度）
      const aSlide = mu * p.slideMu * G * (0.5 + 0.65 * clamp(b / 0.55, 0, 1));
      this.phi += d * aSlide / Math.max(V, 4) * dt;
      this.heading = this.phi + d * b;
      this.yawRate = wrapAngle(this.heading - prev) / dt;
      scrub += mu * G * p.scrub * Math.sin(b) ** 2 * 1.1;
      this._driftAccum(dt, b, V, Math.abs(q.curv));
      beta = d * b;
      this.beta = beta;
      if (b < 7 * DEG && bt < 7 * DEG) this._exitDrift(V); // 收角到位：回到抓地
      else if (b > 82 * DEG) this._spinOut(V);
    }

    // —— 纵向
    V = this.speed;
    const cosB = Math.cos(beta);
    const vmax = p.vmax * (1 + (this.boost.accel - 1) * 0.5);
    let thrust = throttle * p.accel0 * this.boost.accel * Math.max(0, 1 - Math.pow(V / vmax, 2.2));
    if (p.drive === 'AWD') thrust *= 1 + (V < 20 ? 0.08 : 0) + clamp(-q.grade * Math.sign(Math.cos(this.phi) * q.tx - Math.sin(this.phi) * q.tz) * 3, 0, 0.25); // 四驱上坡牵引优势
    const brakeA = brake * p.brake * Math.sqrt(muEnv);
    const drag = p.drag * V * V + 0.12;
    const hbA = hb && V > 1 ? 3.2 : 0;
    // 重力：沿运动方向的坡度分量（下坡为正）
    const vt = Math.cos(this.phi) * q.tx - Math.sin(this.phi) * q.tz;
    let gA = G * q.grade * vt;
    if (gA > 0) gA *= p.downhill;
    let a = thrust * Math.max(0, cosB) + gA - drag - scrub - hbA;
    if (this.engineBlown) a -= 2.6;
    if (ditchRail) a = Math.max(a, gA * 0.5 + thrust * 0.6 - drag);
    const dec = brakeA;
    let nv = V + a * dt;
    nv = nv > 0 ? Math.max(0, nv - dec * dt) : 0;
    this.lonAcc = (nv - V) / dt;
    this.speed = nv;
    this.latAcc = this.speed * wrapAngle(this.phi - phi0) / dt;

    // —— 积分位置
    const vx = Math.cos(this.phi) * this.speed, vz = -Math.sin(this.phi) * this.speed;
    this.x += vx * dt; this.z += vz * dt;

    this._walls(track, env);
    const q2 = track.project(this.x, this.z, this.hint, this.q);
    this.hint = q2.idx; this.s = q2.s; this.lat = q2.lat; this.y = q2.y;
    this._engine();
  }

  _enterDrift(dir, V) {
    this.drifting = true;
    this.driftDir = dir;
    this.drift = { t0: this.time, dur: 0, sum: 0, sum2: 0, n: 0, v0: V, wall: false, maxB: 0, kMax: 0 };
    this.emit('driftStart', { dir, speed: V });
  }

  _driftAccum(dt, b, V, k) {
    const d = this.drift; if (!d) return;
    d.dur += dt; d.maxB = Math.max(d.maxB, b); d.kMax = Math.max(d.kMax, k);
    if (b > 12 * DEG) { d.n++; d.sum += b; d.sum2 += b * b; } // 只统计保持段，起漂/收角不算抖动
  }

  _exitDrift(V) {
    const d = this.drift;
    this.drifting = false; this.driftDir = 0;
    this.phi = this.heading - this.beta; // 保持连续
    this.rearGrip = Math.min(this.rearGrip, 0.55);
    if (!d) return;
    const mean = d.n ? d.sum / d.n : 0;
    const std = d.n ? Math.sqrt(Math.max(0, d.sum2 / d.n - mean * mean)) : 0;
    // 出弯速度与该弯抓地极限速度之比：>1 说明漂移比抓地跑得更快
    const vRef = Math.sqrt(this.p.mu * G / Math.max(d.kMax, 1 / 400));
    const ratio = V / Math.max(1, Math.min(vRef, d.v0));
    const hold = d.n * SIM_DT;
    const perfect = d.dur > 0.8 && hold > 0.5 && mean > 16 * DEG && mean < 52 * DEG && std < 6 * DEG && ratio > 0.93 && !d.wall;
    // 分数：角度稳定 × 时长 × 出弯速度
    const stability = clamp(1 - std / (12 * DEG), 0, 1);
    const score = Math.round(d.dur * (mean / DEG) * (0.4 + stability) * (0.3 + ratio) * 6);
    if (this.time - this.lastDriftEnd < 3.5 && !d.wall) this.combo++; else this.combo = 1;
    if (d.wall) this.combo = 0;
    this.lastDriftEnd = this.time;
    this.emit('driftEnd', { dur: d.dur, mean, std, ratio, perfect, score: score * Math.max(1, this.combo), combo: this.combo, exitSpeed: V });
    this.drift = null;
  }

  _spinOut(V) {
    if (this.drift) this.drift.wall = true;
    this.drifting = false; this.drift = null; this.combo = 0;
    this.spin = 1.1;
    this.yawRate = this.driftDir * 3.5;
    this.driftDir = 0;
    this.emit('spin', { speed: V });
  }

  _railAlign(dt, q, track) {
    // 卡在沟里：速度方向被沟槽锁定为切线，横向吸到沟线，车头跟随（"卡进去"的手感）
    const dir = Math.sign(Math.cos(this.phi) * q.tx - Math.sin(this.phi) * q.tz) || 1;
    const th = Math.atan2(-q.tz * dir, q.tx * dir);
    this.phi += wrapAngle(th - this.phi) * Math.min(1, 25 * dt);
    this.heading += wrapAngle(th - this.heading) * Math.min(1, 10 * dt);
    this.yawRate = q.curv * dir * this.speed;
    const targetLat = (track.halfWidth - 0.32 - 0.74) * q.ditch;
    const pull = (targetLat - q.lat) * Math.min(1, 12 * dt);
    this.x += q.nx * pull; this.z += q.nz * pull;
  }

  _reverse(dt, brake, throttle, track) {
    const p = this.p;
    if (throttle > 0.2 || brake < 0.1) {
      this.rev = Math.max(0, this.rev - 12 * dt);
      if (this.rev === 0) { this.phi = this.heading; this.speed = 0; }
    } else this.rev = Math.min(6, this.rev + 3 * brake * dt);
    const delta = this.steer * 0.5;
    this.heading -= this.rev * Math.tan(delta) / p.wheelbase * dt;
    this.phi = this.heading;
    this.x -= Math.cos(this.heading) * this.rev * dt;
    this.z += Math.sin(this.heading) * this.rev * dt;
    this.speed = 0; this.beta = 0; this.drifting = false;
    this._walls(track, {});
    const q = track.project(this.x, this.z, this.hint, this.q);
    this.hint = q.idx; this.s = q.s; this.lat = q.lat; this.y = q.y;
    this.rpm = 1500 + this.rev * 300; this.gear = -1;
  }

  _walls(track, env) {
    const q = track.project(this.x, this.z, this.hint, this.q);
    const limit = track.halfWidth + RAIL - this.p.halfWidth - 0.15;
    if (Math.abs(q.lat) <= limit) return;
    const side = Math.sign(q.lat);
    const nx = q.nx * side, nz = q.nz * side; // 指向护栏
    const pen = Math.abs(q.lat) - limit;
    this.x -= nx * pen; this.z -= nz * pen;
    let vx = Math.cos(this.phi) * this.speed, vz = -Math.sin(this.phi) * this.speed;
    const vn = vx * nx + vz * nz;
    if (vn <= 0) return;
    vx -= nx * vn * 1.25; vz -= nz * vn * 1.25;
    let sp = Math.hypot(vx, vz);
    const money = this.p.wallLoss === 0;
    let loss = clamp(0.04 + vn * 0.04, 0, 0.5);
    const lucky = this.luck > 0 && this.rand() < this.luck;
    if (money || lucky) loss = 0;
    sp *= 1 - loss;
    if (money) sp = Math.max(sp, this.speed);
    this.phi = Math.atan2(-vz, vx);
    // 车头被护栏推向切线方向
    const dir = Math.sign(Math.cos(this.heading) * q.tx - Math.sin(this.heading) * q.tz) || 1;
    const th = Math.atan2(-q.tz * dir, q.tx * dir);
    this.heading += wrapAngle(th - this.heading) * clamp(vn * 0.08, 0.05, 0.5);
    if (!this.drifting) this.phi += wrapAngle(this.heading - this.phi) * 0.6; // 擦墙不凭空起漂
    this.speed = sp;
    if (this.drift) this.drift.wall = true;
    if (vn > 5 && this.drifting) { this.drifting = false; this.driftDir = 0; this.drift = null; this.combo = 0; this.phi = this.heading; }
    if (this.time - this.lastWall > 0.4) { this.wallHits++; this.emit('wall', { severity: vn, lucky, money }); }
    this.lastWall = this.time;
  }

  _engine() {
    const r = this.speed / this.p.vmax;
    const edges = [0, 0.2, 0.36, 0.53, 0.72, 1.02];
    let g = 1;
    while (g < 5 && r > edges[g]) g++;
    const lo = edges[g - 1], hi = edges[g];
    const f = clamp((r - lo) / (hi - lo), 0, 1);
    const target = this.engineBlown ? 0 : (g === 1 ? 900 + f * 7200 : 4300 + f * 3900) + (this.drifting ? 600 * this.throttle : 0);
    this.gear = g;
    this.rpm += (Math.max(target, this.throttle > 0.05 ? 1200 : 900) - this.rpm) * 0.25;
  }

  /** 验收用：可读状态快照 */
  snapshot() {
    return {
      x: +this.x.toFixed(3), z: +this.z.toFixed(3), heading: +this.heading.toFixed(4),
      vel: [+(Math.cos(this.phi) * this.speed).toFixed(3), +(-Math.sin(this.phi) * this.speed).toFixed(3)],
      driftAngleDeg: +(Math.abs(this.beta) * 180 / Math.PI).toFixed(2), drifting: this.drifting,
      rearGrip: +this.rearGrip.toFixed(3), kmh: +this.kmh.toFixed(1), combo: this.combo,
      wallHits: this.wallHits, s: +this.s.toFixed(2), lat: +this.lat.toFixed(2), inDitch: this.inDitch,
      steps: this.steps, fixedDt: SIM_DT
    };
  }
}
