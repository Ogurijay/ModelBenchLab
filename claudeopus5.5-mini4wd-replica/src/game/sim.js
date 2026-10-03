// 固定步长比赛模拟：一维沿车道积分 + 竖直方向腾空（飞台 / 换道桥 / 波浪）、落地弹跳、过弯与落地冲出。
// 纯逻辑，可在 Node 中测试。随机数使用种子（同种子同结果）。
import { getSetup } from './parts.js';
import { WALL_H } from './track.js';

export const STEP = 1 / 240;
const G = 9.81, RHO = 1.2, CDA = 0.0011;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function gauss(rand) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const CLEAR = 0.009;   // 车宽 97 mm 与车道 115 mm 之间单侧余量

export const SPECIALS = {
  cyclone: '旋风龙卷冲刺', hurricane: '飓风音速冲击', tridagger: '三角剑 · ZMC 突击', evolution: '进化斩',
  cobra: '眼镜蛇回旋', spider: '蛛网疾行', gigant: '巨无霸重压冲锋', stinger: '毒针突刺',
};

export class Race {
  // entries: [{ car, build, player }]
  constructor({ track, entries, laps = null, mode = 'real', seed = 1 }) {
    this.track = track; this.mode = mode; this.seed = seed; this.rand = rng(seed);
    this.laps = laps || track.lanes;
    this.time = 0; this.state = 'ready'; this.countdown = 3; this.acc = 0; this.events = [];
    const L = track.length;
    this.racers = entries.slice(0, track.lanes).map((e, i) => {
      const setup = getSetup(e.car, e.build);
      return {
        id: e.car.id, car: e.car, build: e.build, setup, player: !!e.player, index: i,
        lane: i, startLane: i, s: track.start - 0.12, dist: 0, lap: 0, v: 0,
        used: 0, volts: setup.volts, status: 'grid', reason: null,
        air: null, y: 0, vy: 0, airTime: 0, maxAir: 0, bounces: 0, wobble: 0, overload: 0,
        lapStart: 0, lapTimes: [], best: null, finish: null, special: 0, specialLeft: 1, boostHold: false,
        wheelAngle: 0, lastS: track.start - 0.12, L,
      };
    });
    this.player = this.racers.find(r => r.player) || this.racers[0];
  }

  start() { if (this.state !== 'ready') return false; this.state = 'countdown'; this.countdown = 3; return true; }
  pause() {
    if (this.state === 'paused') { this.state = this.resume; return; }
    if (this.state === 'running' || this.state === 'countdown') { this.resume = this.state; this.state = 'paused'; }
  }

  update(dt, input = {}) {
    if (!(dt > 0) || !['countdown', 'running'].includes(this.state)) return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      if (this.state === 'countdown') {
        this.countdown -= STEP;
        if (this.countdown <= 0) { this.state = 'running'; for (const r of this.racers) r.status = 'run'; this.events.push({ type: 'go' }); }
        continue;
      }
      this.time += STEP;
      for (const r of this.racers) if (r.status === 'run' || r.status === 'air') this.stepRacer(r, STEP, r.player ? input : {});
      if (this.racers.every(r => r.status === 'finished' || r.status === 'out')) { this.state = 'finished'; this.events.push({ type: 'finish' }); break; }
      if (this.time > 300) { for (const r of this.racers) if (r.status !== 'finished') this.out(r, '超时'); this.state = 'finished'; break; }
    }
  }

  out(r, reason, fly = null) {
    if (r.status === 'out' || r.status === 'finished') return;
    const p = this.track.pose(r.s, r.lane);
    r.crash = { x: p.x, y: r.y || p.y, z: p.z, h: p.h, v: r.v, vlat: fly ? fly.vlat : 0, vy: fly ? fly.vy : 0, t: this.time };
    r.status = 'out'; r.reason = reason; r.v = 0; r.air = null;
    this.events.push({ type: 'out', id: r.id, player: r.player, reason, lap: r.lap });
  }

  stepRacer(r, dt, input) {
    const T = this.track, S = r.setup, m = S.mass;
    // ---- 电池与电压 ----
    const q = Math.max(0, 1 - r.used / S.capacity);
    let volts = S.volts * (1 - S.sag * (1 - q)) * (0.985 - 0.04 * Math.min(1, r.v / 9));
    let currentMul = 1;
    if (this.mode === 'anime' && r.player) {
      if (input.boost) { volts *= 1.12; currentMul *= 1.5; }
      if (input.special && r.specialLeft > 0 && r.special <= 0) { r.special = 2.2; r.specialLeft--; this.events.push({ type: 'special', id: r.id, name: SPECIALS[r.id] || '必杀冲刺' }); }
    }
    if (r.special > 0) { r.special -= dt; volts *= 1.3; currentMul *= 1.8; }
    if (q <= 0) volts *= 0.4;
    r.volts = volts;
    const vFree = S.freeSpeed * volts / 3;
    const Fm = S.wheelForce * (volts / 3) * Math.max(0, 1 - r.v / Math.max(0.1, vFree));
    r.used += S.current * currentMul * (0.55 + 0.45 * Math.max(0, 1 - r.v / Math.max(0.1, vFree))) * dt / 3.6;   // mAh

    const pose = T.pose(r.s, r.lane);
    const scale = T.laneScale(r.s, r.lane);
    const R = Math.abs(pose.k) > 1e-6 ? scale / Math.abs(pose.k) : Infinity;

    if (r.air) {
      // ---- 腾空：水平沿赛道前进，竖直受重力 ----
      const a = r.air;
      const Fair = 0.5 * RHO * CDA * r.v * r.v;
      r.v = Math.max(0, r.v - Fair / m * dt);
      const dsLane = r.v * dt;
      this.advance(r, dsLane / scale);
      a.vy -= G * dt; a.y += a.vy * dt; r.airTime += dt;
      const ground = T.pose(r.s, r.lane).y;
      r.y = a.y; r.maxAir = Math.max(r.maxAir, a.y - ground);
      // 高于护墙时的横向漂移：超过车道余量即飞出
      if (a.y - ground > WALL_H) { a.drift += Math.abs(a.vlat) * dt; if (a.drift > CLEAR) { this.out(r, '飞台腾空越过护墙', { vlat: a.vlat, vy: a.vy }); return; } }
      if (a.y <= ground) {
        const slope = T.slope(r.s, r.lane);
        const vn = -a.vy + r.v * slope;               // 撞击法向速度（向下为正）
        r.air = null; r.y = ground; r.bounces++;
        // 落地失稳：撞击法向速度越大越容易弹起翻转；导轮 / 配重 / 低重心提高稳定
        const height = Math.max(0, r.maxAir);
        const risk = vn > 1.3 ? ((vn - 1.3) / 1.6) ** 2 / (S.stability * S.stability) : 0;
        if (this.debug) this.debug.push({ id: r.id, s: +T.wrap(r.s).toFixed(2), v: +r.v.toFixed(2), vn: +vn.toFixed(2), h: +height.toFixed(3), risk: +risk.toFixed(2), f: T.featureAt(r.s)?.type || '-' });
        if (this.rand() < Math.min(0.9, risk)) { this.out(r, '落地弹起失稳翻车', { vlat: 0.05, vy: 0.3 }); return; }
        // 刹车海绵触地 + 配重阻尼
        r.v *= 1 - Math.min(0.35, 0.05 + S.brake * 0.09);
        const rebound = vn * S.bounce;
        if (rebound > 0.35) { r.air = { y: ground + 0.001, vy: rebound, vlat: gauss(this.rand) * 0.02 / S.stability, drift: 0 }; r.maxAir = 0; }
        else { r.status = 'run'; }
      }
      return;
    }

    // ---- 着地：沿车道积分 ----
    const slope = T.slope(r.s, r.lane), cos = 1 / Math.sqrt(1 + slope * slope), sin = slope * cos;
    const Froll = S.rolling * m * G * cos;
    const aLat = Number.isFinite(R) ? r.v * r.v / R : 0;
    const Froller = S.rollerMu * m * aLat;
    const Fair = 0.5 * RHO * CDA * r.v * r.v;
    const Fg = m * G * sin;
    const feature = T.featureAt(r.s);
    let Fbrake = 0;
    if (S.brake > 0 && slope < -0.04) Fbrake = S.brake * m * G * (0.10 + Math.abs(sin) * 0.8);
    if (feature && feature.type === 'wave') Fbrake += 0.06 * m * G;
    const aTot = (Fm - Froll - Froller - Fair - Fg - Fbrake) / m;
    const vPrev = r.v;
    r.v = Math.max(0, r.v + aTot * dt);
    // 过弯极限：超出后累积失稳，持续超载即翻出
    const bankBoost = 1 + 1.8 * Math.sin(Math.abs(pose.bank));
    const aMax = G * 8.6 * S.stability * bankBoost;
    r.overload = aLat > aMax ? r.overload + (aLat / aMax - 1) * dt * 12 : Math.max(0, r.overload - dt * 2);
    r.wobble = Math.min(1, aLat / aMax);
    if (r.overload > 0.25 && this.rand() < r.overload * dt * 40) { this.out(r, '高速过弯翻出护墙', { vlat: -Math.sign(pose.k || 1) * 1.2, vy: 0.6 }); return; }
    // 起飞：赛道下坠比重力更快
    const s0 = r.s, y0 = T.pose(s0, r.lane).y;
    const dsLane = (vPrev + r.v) / 2 * dt;
    this.advance(r, dsLane / scale);
    const slope1 = T.slope(r.s, r.lane);
    const sin1 = slope1 / Math.sqrt(1 + slope1 * slope1);
    if (r.v * (sin - sin1) > G * dt * 1.15 && r.v > 1.2) {
      if (S.brake > 0) r.v *= 1 - 0.035 * S.brake;                     // 刹车海绵在顶点擦地
      const sigma = 0.032 * (r.v / 5) ** 2.2 / S.stability;
      r.air = { y: y0 + r.v * sin * dt, vy: r.v * sin, vlat: gauss(this.rand) * sigma, drift: 0 };
      r.maxAir = 0; r.airTime = 0; r.status = 'air';
      if (r.player) this.events.push({ type: 'air', id: r.id });
    }
    r.y = T.pose(r.s, r.lane).y;
  }

  // 沿中心线推进并处理换道 / 计圈
  advance(r, dsCenter) {
    const T = this.track, L = T.length;
    const prev = r.s;
    r.s += dsCenter; r.dist += dsCenter;
    const w0 = T.wrap(prev), w1 = T.wrap(r.s);
    // 换道桥结束：切换车道
    if (T.lc) { const e = T.lc.s1; if ((w0 < e && w1 >= e) || (w0 > w1 && (e > w0 || e <= w1))) r.lane = T.nextLane(r.lane); }
    // 越过起点线
    const st = T.start;
    if ((w0 < st && w1 >= st) || (w0 > w1 && (st > w0 || st <= w1))) {
      if (r.dist > 0.5) {
        const t = this.time;
        r.lap++;
        const lt = t - r.lapStart; r.lapTimes.push(lt); r.best = r.best == null ? lt : Math.min(r.best, lt); r.lapStart = t;
        if (r.player) this.events.push({ type: 'lap', lap: r.lap, time: lt });
        if (r.lap >= this.laps) { r.status = 'finished'; r.finish = t; r.air = null; this.events.push({ type: 'finished', id: r.id, player: r.player, time: t }); }
      } else r.lapStart = this.time;
    }
    r.wheelAngle += dsCenter / (r.setup.diameter / 2);
  }

  get standings() {
    return [...this.racers].sort((a, b) => {
      if (a.finish != null && b.finish != null) return a.finish - b.finish;
      if (a.finish != null) return -1; if (b.finish != null) return 1;
      if (a.status === 'out' && b.status !== 'out') return 1; if (b.status === 'out' && a.status !== 'out') return -1;
      return (b.lap * 1e6 + b.dist) - (a.lap * 1e6 + a.dist);
    });
  }
}
