// 全合成音频：启动时用 JS DSP 预渲染全部音效与音乐循环到 AudioBuffer，运行时只做播放与空间化。

import { RNG, clamp } from '../core/util.js';

const TAU = Math.PI * 2;

class Biquad {
  // RBJ 带通/低通/高通，逐样本处理
  constructor(type, f, q, sr) {
    this.type = type;
    this.sr = sr;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(f, q);
  }
  set(f, q) {
    const w = (TAU * Math.min(f, this.sr * 0.45)) / this.sr;
    const cs = Math.cos(w), sn = Math.sin(w);
    const al = sn / (2 * q);
    let b0, b1, b2;
    if (this.type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
    else if (this.type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class OnePole {
  constructor(fc, sr) {
    this.sr = sr;
    this.y = 0;
    this.set(fc);
  }
  set(fc) {
    this.a = 1 - Math.exp((-TAU * fc) / this.sr);
  }
  p(x) {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

function normalize(chs, peak = 0.92) {
  let m = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
  if (m < 1e-9) return;
  const k = peak / m;
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= k;
}

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.buffers = {};
    this.volume = { master: 0.8, sfx: 1, music: 0.5 };
    this.reverbAmount = 0.2;
    this.loops = new Set();
    this.musicIntensity = 0;
    this._musicTarget = 0;
    this.rng = new RNG(1234);
  }

  /** 必须在用户手势中调用 */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.18;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = this.reverbAmount;
    this.reverbIn.connect(this.reverb).connect(this.sfx);
    this.reverb.buffer = this._impulse(2.4);
    this.applyVolume();
    this._generate();
    this.ready = true;
  }

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.sfx.gain.value = this.volume.sfx;
    this.musicBus.gain.value = this.volume.music * 0.55;
    this.ambBus.gain.value = 0.7;
  }

  setReverb(k) {
    this.reverbAmount = k;
    if (this.reverbIn) this.reverbIn.gain.setTargetAtTime(k, this.ctx.currentTime, 0.4);
  }

  _impulse(dur) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(dur * sr);
    const b = ctx.createBuffer(2, n, sr);
    const rng = new RNG(77);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      const lp = new OnePole(6000, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        lp.set(6000 * Math.exp(-t * 1.6) + 500);
        let v = (rng.next() * 2 - 1) * Math.exp(-t * 2.6);
        // 早期反射
        if (i === Math.floor(0.011 * sr * (c + 1)) || i === Math.floor(0.027 * sr) || i === Math.floor(0.043 * sr * (1 + c * 0.2))) v += 0.8;
        d[i] = lp.p(v);
      }
    }
    normalize([b.getChannelData(0), b.getChannelData(1)], 0.5);
    return b;
  }

  // ───────── 合成 ─────────
  _buf(name, dur, fn, { sr = this.ctx.sampleRate, stereo = false, peak = 0.92, variants = 1 } = {}) {
    const list = [];
    for (let v = 0; v < variants; v++) {
      const n = Math.max(1, Math.floor(dur * sr));
      let b = this.ctx.createBuffer(stereo ? 2 : 1, n, sr);
      const L = b.getChannelData(0), R = stereo ? b.getChannelData(1) : null;
      const trim = fn(L, R, sr, n, new RNG(name.length * 977 + v * 131 + 7), v);
      if (trim > 0) {
        // 循环素材：首部已与尾部交叉淡化，截掉尾部得到无缝循环
        const nb = this.ctx.createBuffer(stereo ? 2 : 1, n - trim, sr);
        for (let c = 0; c < nb.numberOfChannels; c++) nb.getChannelData(c).set(b.getChannelData(c).subarray(0, n - trim));
        b = nb;
      }
      const chs = [];
      for (let c = 0; c < b.numberOfChannels; c++) chs.push(b.getChannelData(c));
      normalize(chs, peak);
      list.push(b);
    }
    this.buffers[name] = list;
  }

  _generate() {
    const B = (...a) => this._buf(...a);
    const noise = (r) => r.next() * 2 - 1;

    // —— 枪声 ——
    const gun = (name, p, dur, variants = 3) => B(name, dur, (L, R, sr, n, r) => {
      const hp = new Biquad('hp', p.crackHp, 0.7, sr);
      const lpBody = new Biquad('lp', p.body0, 0.8, sr);
      const lpTail = new OnePole(p.tailFc, sr);
      const lpTail2 = new OnePole(p.tailFc * 0.6, sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = noise(r);
        let v = hp.p(w) * Math.exp(-t / p.crackT) * p.crack;
        lpBody.set(p.body1 + (p.body0 - p.body1) * Math.exp(-t / p.bodySweep), 0.8);
        v += lpBody.p(w) * Math.exp(-t / p.bodyT) * p.body;
        const f = p.th1 + (p.th0 - p.th1) * Math.exp(-t / p.thSweep);
        ph += (TAU * f) / sr;
        v += Math.sin(ph) * Math.exp(-t / p.thT) * p.thump * Math.min(1, t * 3000);
        v += lpTail.p(w) * Math.exp(-t / p.tailT) * p.tail;
        // 回声
        for (const [dt, g] of p.echoes || []) {
          if (t > dt) v += lpTail2.p(w) * Math.exp(-(t - dt) / (p.tailT * 0.7)) * g;
        }
        if (p.mech && t > 0.004 && t < 0.012) v += noise(r) * 0.25 * Math.exp(-(t - 0.004) / 0.002);
        L[i] = Math.tanh(v * p.drive);
      }
    }, { variants });
    gun('shot_pistol', { crackHp: 2200, crackT: 0.0035, crack: 1.0, body0: 5000, body1: 700, bodySweep: 0.02, bodyT: 0.045, body: 0.9, th0: 210, th1: 70, thSweep: 0.02, thT: 0.05, thump: 0.6, tailFc: 1100, tailT: 0.16, tail: 0.18, drive: 1.6, mech: true }, 0.55);
    gun('shot_rifle', { crackHp: 1800, crackT: 0.004, crack: 1.0, body0: 4200, body1: 520, bodySweep: 0.03, bodyT: 0.06, body: 1.0, th0: 160, th1: 52, thSweep: 0.03, thT: 0.08, thump: 0.95, tailFc: 900, tailT: 0.24, tail: 0.24, drive: 1.9, mech: true, echoes: [[0.09, 0.08]] }, 0.75, 4);
    gun('shot_shotgun', { crackHp: 1500, crackT: 0.006, crack: 0.9, body0: 3200, body1: 260, bodySweep: 0.06, bodyT: 0.12, body: 1.2, th0: 120, th1: 38, thSweep: 0.05, thT: 0.16, thump: 1.3, tailFc: 700, tailT: 0.38, tail: 0.35, drive: 2.2, echoes: [[0.12, 0.12], [0.3, 0.06]] }, 1.3);
    gun('shot_sniper', { crackHp: 2600, crackT: 0.006, crack: 1.4, body0: 5200, body1: 300, bodySweep: 0.05, bodyT: 0.09, body: 1.1, th0: 110, th1: 34, thSweep: 0.06, thT: 0.2, thump: 1.4, tailFc: 800, tailT: 0.55, tail: 0.32, drive: 2.4, echoes: [[0.19, 0.2], [0.43, 0.12], [0.8, 0.06]] }, 2.0, 2);

    // —— 敌方武器 ——
    B('shot_enemy', 0.38, (L, R, sr, n, r) => {
      const lp = new Biquad('lp', 4000, 1.2, sr);
      let ph = 0, ph2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const f = 260 + 1500 * Math.exp(-t / 0.05);
        ph += (TAU * f) / sr;
        ph2 += (TAU * f * 1.51) / sr;
        const saw = ((ph / TAU) % 1) * 2 - 1;
        let v = (saw * 0.6 + Math.sin(ph2) * 0.4) * Math.exp(-t / 0.08);
        v += noise(r) * Math.exp(-t / 0.01) * 0.6;
        L[i] = Math.tanh(lp.p(v) * 1.8);
      }
    }, { variants: 3 });
    B('shot_drone', 0.45, (L, R, sr, n, r) => {
      let ph = 0, mp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const f = 180 + 700 * Math.exp(-t / 0.09);
        mp += (TAU * f * 2.01) / sr;
        ph += (TAU * f) / sr + Math.sin(mp) * 0.6 * Math.exp(-t / 0.15);
        L[i] = Math.tanh(Math.sin(ph) * 1.6) * Math.exp(-t / 0.12) + noise(r) * Math.exp(-t / 0.008) * 0.3;
      }
    }, { variants: 2 });
    B('shot_minigun', 0.16, (L, R, sr, n, r) => {
      const bp = new Biquad('bp', 1800, 1.4, sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (TAU * (380 + 900 * Math.exp(-t / 0.025))) / sr;
        L[i] = (Math.sign(Math.sin(ph)) * 0.4 + bp.p(noise(r)) * 2) * Math.exp(-t / 0.035);
      }
    }, { variants: 3 });
    B('rocket_launch', 0.9, (L, R, sr, n, r) => {
      const bp = new Biquad('bp', 400, 0.9, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        bp.set(300 + 2400 * (t / 0.9), 0.9);
        L[i] = bp.p(noise(r)) * Math.min(1, t * 20) * Math.exp(-t / 0.5) * 2 + Math.sin(TAU * 60 * t) * Math.exp(-t / 0.07);
      }
    });
    B('rocket_loop', 1.0, (L, R, sr, n, r) => {
      const bp = new Biquad('bp', 1200, 0.6, sr);
      for (let i = 0; i < n; i++) L[i] = bp.p(noise(r)) * (0.8 + 0.2 * Math.sin((TAU * i * 23) / n));
      return fadeLoop(L, sr, 0.05);
    });

    // —— 爆炸 ——
    B('explosion', 2.8, (L, R, sr, n, r, v) => {
      const lpL = new Biquad('lp', 3000, 0.7, sr), lpR = new Biquad('lp', 3000, 0.7, sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fc = 120 + 3200 * Math.exp(-t / 0.18);
        lpL.set(fc, 0.7);
        lpR.set(fc * 1.05, 0.7);
        const env = Math.min(1, t * 400) * (Math.exp(-t / 0.55) * 0.9 + Math.exp(-t / 0.08) * 0.6);
        ph += (TAU * (30 + 40 * Math.exp(-t / 0.15))) / sr;
        const sub = Math.sin(ph) * Math.exp(-t / 0.5) * 1.2;
        const crackle = r.next() < 0.002 * Math.exp(-t / 0.6) ? noise(r) * 2 : 0;
        L[i] = Math.tanh((lpL.p(noise(r)) * env * 2.2 + sub + crackle) * 1.4);
        R[i] = Math.tanh((lpR.p(noise(r)) * env * 2.2 + sub + crackle) * 1.4);
      }
    }, { stereo: true, variants: 2 });
    B('explosion_small', 1.3, (L, R, sr, n, r) => {
      const lp = new Biquad('lp', 3000, 0.7, sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        lp.set(150 + 4000 * Math.exp(-t / 0.08), 0.7);
        ph += (TAU * (45 + 60 * Math.exp(-t / 0.08))) / sr;
        L[i] = Math.tanh((lp.p(noise(r)) * Math.exp(-t / 0.25) * 2 + Math.sin(ph) * Math.exp(-t / 0.22)) * 1.5);
      }
    }, { variants: 2 });

    // —— 命中 ——
    B('impact_concrete', 0.18, (L, R, sr, n, r) => {
      const bp = new Biquad('bp', 1800 + r.next() * 1500, 1.1, sr);
      const lp = new OnePole(300, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = noise(r);
        L[i] = bp.p(w) * Math.exp(-t / 0.012) * 2 + lp.p(w) * Math.exp(-t / 0.03) * 1.5;
      }
    }, { variants: 4 });
    const metalHit = (name, base, decay, variants) => B(name, decay * 4, (L, R, sr, n, r) => {
      const fs = [base * (1 + r.next() * 0.2), base * (2.03 + r.next() * 0.3), base * (3.17 + r.next() * 0.4), base * (4.6 + r.next() * 0.5)];
      const gs = [1, 0.6, 0.4, 0.25];
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let v = 0;
        for (let k = 0; k < 4; k++) v += Math.sin(TAU * fs[k] * t) * gs[k] * Math.exp(-t / (decay * (1 - k * 0.18)));
        v += noise(r) * Math.exp(-t / 0.004) * 0.8;
        L[i] = v;
      }
    }, { variants });
    metalHit('impact_metal', 1300, 0.07, 4);
    metalHit('hit_robot', 560, 0.09, 4);
    metalHit('casing', 4200, 0.03, 3);
    metalHit('grenade_bounce', 700, 0.05, 2);
    B('impact_dirt', 0.12, (L, R, sr, n, r) => {
      const lp = new OnePole(700, sr);
      for (let i = 0; i < n; i++) L[i] = lp.p(noise(r)) * Math.exp(-(i / sr) / 0.025);
    }, { variants: 3 });
    B('ricochet', 0.4, (L, R, sr, n, r) => {
      let ph = 0;
      const f0 = 2600 + r.next() * 1200;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (TAU * (f0 * (1 - t * 0.9) + Math.sin(t * 90) * 60)) / sr;
        L[i] = Math.sin(ph) * Math.exp(-t / 0.12) * Math.min(1, t * 200) * 0.6 + noise(r) * Math.exp(-t / 0.006) * 0.4;
      }
    }, { variants: 3 });
    B('whizz', 0.32, (L, R, sr, n, r) => {
      const bp = new Biquad('bp', 3000, 3, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        bp.set(3600 - t * 6000, 3);
        const env = Math.sin(Math.PI * Math.min(1, t / 0.3)) ** 2;
        L[i] = bp.p(noise(r)) * env * 3;
      }
    }, { variants: 2 });
    B('hitmarker', 0.06, (L, R, sr, n, r) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = Math.sin(TAU * 2300 * t) * Math.exp(-t / 0.012) + noise(r) * Math.exp(-t / 0.002) * 0.4;
      }
    });
    B('headshot', 0.45, (L, R, sr, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = (Math.sin(TAU * 1650 * t) + Math.sin(TAU * 2480 * t) * 0.5 + Math.sin(TAU * 3300 * t) * 0.2) * Math.exp(-t / 0.11);
      }
    });
    B('kill', 0.22, (L, R, sr, n, r) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (TAU * (90 + 140 * Math.exp(-t / 0.03))) / sr;
        L[i] = Math.sin(ph) * Math.exp(-t / 0.07) + Math.sin(TAU * 1900 * t) * Math.exp(-t / 0.02) * 0.5 + noise(r) * Math.exp(-t / 0.003) * 0.3;
      }
    });

    // —— 机械/换弹 ——
    const foley = (name, events, dur) => B(name, dur, (L, R, sr, n, r) => {
      for (const e of events) {
        const bp = new Biquad('bp', e.f, e.q ?? 2, sr);
        const i0 = Math.floor(e.t * sr);
        const len = Math.floor(e.d * sr);
        for (let i = 0; i < len && i0 + i < n; i++) {
          const t = i / sr;
          if (e.sweep) bp.set(e.f + e.sweep * (t / e.d), e.q ?? 2);
          const env = e.slide ? Math.sin(Math.PI * (i / len)) : Math.exp(-t / (e.d * 0.25));
          L[i0 + i] += bp.p(noise(r)) * env * (e.g ?? 1);
        }
      }
    });
    foley('dryfire', [{ t: 0, f: 3500, d: 0.02, g: 1 }, { t: 0.012, f: 1800, d: 0.02, g: 0.6 }], 0.06);
    foley('mag_out', [{ t: 0, f: 2600, d: 0.03 }, { t: 0.02, f: 900, d: 0.12, slide: true, g: 0.6, sweep: -300 }], 0.2);
    foley('mag_in', [{ t: 0, f: 1100, d: 0.08, slide: true, g: 0.5, sweep: 600 }, { t: 0.07, f: 2200, d: 0.03, g: 1.4 }, { t: 0.085, f: 600, d: 0.05, g: 1 }], 0.18);
    foley('bolt_back', [{ t: 0, f: 3200, d: 0.02 }, { t: 0.015, f: 1500, d: 0.07, slide: true, g: 0.7, sweep: 800 }, { t: 0.08, f: 2600, d: 0.025, g: 1.2 }], 0.14);
    foley('bolt_fwd', [{ t: 0, f: 1800, d: 0.06, slide: true, g: 0.7, sweep: -600 }, { t: 0.055, f: 3000, d: 0.03, g: 1.5 }, { t: 0.06, f: 700, d: 0.05, g: 0.8 }], 0.14);
    foley('pump', [{ t: 0, f: 1400, d: 0.07, slide: true, g: 0.9, sweep: 900 }, { t: 0.07, f: 2600, d: 0.03, g: 1.4 }, { t: 0.16, f: 1600, d: 0.07, slide: true, g: 0.9, sweep: -600 }, { t: 0.23, f: 3000, d: 0.03, g: 1.6 }], 0.3);
    foley('shell_in', [{ t: 0, f: 2400, d: 0.025, g: 1 }, { t: 0.03, f: 900, d: 0.05, slide: true, g: 0.6, sweep: -200 }, { t: 0.08, f: 1500, d: 0.03, g: 0.9 }], 0.13);
    foley('slide_rack', [{ t: 0, f: 2000, d: 0.06, slide: true, g: 0.8, sweep: 1200 }, { t: 0.07, f: 3400, d: 0.03, g: 1.4 }], 0.12);
    foley('raise', [{ t: 0, f: 600, d: 0.15, slide: true, g: 0.4, q: 0.7 }, { t: 0.12, f: 2800, d: 0.025, g: 0.8 }], 0.2);
    foley('grenade_pin', [{ t: 0, f: 3800, d: 0.02, g: 1 }, { t: 0.05, f: 5200, d: 0.05, g: 0.6, q: 8 }], 0.14);
    foley('throw', [{ t: 0, f: 500, d: 0.22, slide: true, g: 0.9, sweep: 900, q: 0.8 }], 0.26);
    foley('melee_swing', [{ t: 0, f: 400, d: 0.2, slide: true, g: 1, sweep: 1400, q: 0.7 }], 0.24);
    foley('ui_click', [{ t: 0, f: 2400, d: 0.03, g: 1, q: 4 }], 0.05);
    B('melee_hit', 0.25, (L, R, sr, n, r) => {
      const lp = new OnePole(500, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = lp.p(noise(r)) * Math.exp(-t / 0.04) * 2 + Math.sin(TAU * 620 * t) * Math.exp(-t / 0.06) * 0.6 + Math.sin(TAU * 1490 * t) * Math.exp(-t / 0.04) * 0.3;
      }
    });

    // —— 脚步 ——
    B('step_concrete', 0.16, (L, R, sr, n, r) => {
      const lp = new Biquad('lp', 900 + r.next() * 400, 0.9, sr);
      const hp = new Biquad('hp', 3000, 0.7, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const w = noise(r);
        L[i] = lp.p(w) * Math.exp(-t / 0.025) * 1.4 + hp.p(w) * Math.exp(-t / 0.01) * 0.25 * (t > 0.02 ? 1 : 0.3);
      }
    }, { variants: 4 });
    B('step_metal', 0.3, (L, R, sr, n, r) => {
      const lp = new Biquad('lp', 1200, 0.9, sr);
      const f = [420 + r.next() * 80, 1130 + r.next() * 120, 2010 + r.next() * 200];
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = lp.p(noise(r)) * Math.exp(-t / 0.02) * 1.2 + (Math.sin(TAU * f[0] * t) * 0.3 + Math.sin(TAU * f[1] * t) * 0.2 + Math.sin(TAU * f[2] * t) * 0.12) * Math.exp(-t / 0.06);
      }
    }, { variants: 4 });
    B('step_dirt', 0.2, (L, R, sr, n, r) => {
      const lp = new Biquad('lp', 1600, 0.6, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const grit = r.next() < 0.03 * Math.exp(-t / 0.05) ? noise(r) * 1.5 : 0;
        L[i] = lp.p(noise(r)) * Math.exp(-t / 0.035) + grit;
      }
    }, { variants: 4 });
    B('land', 0.3, (L, R, sr, n, r) => {
      const lp = new OnePole(380, sr);
      for (let i = 0; i < n; i++) L[i] = lp.p(noise(r)) * Math.exp(-(i / sr) / 0.06) * 2;
    }, { variants: 2 });

    // —— 机器人 ——
    B('robot_step', 0.25, (L, R, sr, n, r) => {
      const lp = new OnePole(260, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = lp.p(noise(r)) * Math.exp(-t / 0.04) * 2 + Math.sin(TAU * (900 + r.next() * 3) * t) * Math.exp(-t / 0.03) * 0.15;
      }
    }, { variants: 3 });
    B('jugg_step', 0.6, (L, R, sr, n, r) => {
      const lp = new OnePole(160, sr);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (TAU * (38 + 30 * Math.exp(-t / 0.05))) / sr;
        L[i] = lp.p(noise(r)) * Math.exp(-t / 0.08) * 2 + Math.sin(ph) * Math.exp(-t / 0.15) * 1.2 + Math.sin(TAU * 610 * t) * Math.exp(-t / 0.08) * 0.15;
      }
    }, { variants: 2 });
    B('servo', 0.35, (L, R, sr, n, r) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (TAU * (520 + 240 * Math.sin(t * 9) + 300 * t)) / sr;
        L[i] = (((ph / TAU) % 1) * 2 - 1) * 0.3 * Math.sin(Math.PI * (t / 0.35));
      }
    }, { variants: 2 });
    B('alert', 0.4, (L, R, sr, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const f = t < 0.14 ? 880 : 1320;
        const env = t < 0.14 ? Math.min(1, t * 200) : Math.exp(-(t - 0.14) / 0.08);
        L[i] = Math.sign(Math.sin(TAU * f * t)) * 0.4 * env;
      }
    });
    B('hound_screech', 0.5, (L, R, sr, n, r) => {
      let ph = 0, mp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        mp += (TAU * 73) / sr;
        ph += (TAU * (900 + 600 * Math.sin(t * 14) + Math.sin(mp) * 300)) / sr;
        L[i] = Math.tanh(Math.sin(ph) * 2) * Math.sin(Math.PI * (t / 0.5)) * 0.6 + noise(r) * 0.08;
      }
    }, { variants: 2 });
    B('drone_loop', 1.0, (L, R, sr, n, r) => {
      const bp = new Biquad('bp', 900, 1.5, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const saw = ((t * 120) % 1) * 2 - 1;
        L[i] = saw * 0.4 * (0.75 + 0.25 * Math.sin(TAU * 37 * t)) + bp.p(noise(r)) * 0.6;
      }
      return fadeLoop(L, sr, 0.03);
    });
    B('minigun_spin', 1.0, (L, R, sr, n, r) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = (Math.sin(TAU * 260 * t) * 0.5 + Math.sin(TAU * 520 * t) * 0.25 + ((t * 52) % 1 < 0.2 ? 0.3 : 0)) * 0.7;
      }
      return fadeLoop(L, sr, 0.02);
    });

    // —— 拾取 / 界面 / 任务 ——
    const tones = (name, notes, dur, wave = 'sine') => B(name, dur, (L, R, sr, n) => {
      for (const [t0, f, d, g] of notes) {
        const i0 = Math.floor(t0 * sr);
        for (let i = 0; i < d * sr && i0 + i < n; i++) {
          const t = i / sr;
          const env = Math.min(1, t * 120) * Math.exp(-t / (d * 0.4));
          const s = wave === 'sine' ? Math.sin(TAU * f * t) + Math.sin(TAU * f * 2 * t) * 0.25 : Math.sign(Math.sin(TAU * f * t)) * 0.5;
          L[i0 + i] += s * env * (g ?? 1);
        }
      }
    });
    tones('pickup', [[0, 880, 0.12], [0.07, 1320, 0.2]], 0.32);
    tones('pickup_health', [[0, 660, 0.25], [0.08, 990, 0.3], [0.16, 1320, 0.35]], 0.55);
    tones('pickup_armor', [[0, 520, 0.2], [0.06, 780, 0.25], [0.12, 1040, 0.3, 0.6]], 0.45);
    tones('objective', [[0, 523, 0.5, 0.8], [0.12, 659, 0.5, 0.8], [0.24, 784, 0.7, 0.9], [0.36, 1046, 0.9, 0.6]], 1.4);
    tones('objective_fail', [[0, 392, 0.5], [0.18, 330, 0.6], [0.36, 262, 0.9]], 1.4);
    tones('countdown', [[0, 1200, 0.12]], 0.15, 'square');
    tones('ui_hover', [[0, 1800, 0.04, 0.4]], 0.06);
    tones('denied', [[0, 220, 0.12], [0.1, 180, 0.15]], 0.28, 'square');
    B('pickup_ammo', 0.25, (L, R, sr, n, r) => {
      for (const t0 of [0, 0.09]) {
        const bp = new Biquad('bp', 2200, 2, sr);
        const i0 = Math.floor(t0 * sr);
        for (let i = 0; i < 0.06 * sr && i0 + i < n; i++) L[i0 + i] += bp.p(noise(r)) * Math.exp(-(i / sr) / 0.012) * 2;
      }
    });
    B('radio', 0.35, (L, R, sr, n, r) => {
      const bp = new Biquad('bp', 1800, 1.2, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let v = t < 0.12 ? bp.p(noise(r)) * 0.8 : 0;
        if (t > 0.14 && t < 0.24) v += Math.sin(TAU * 1450 * t) * 0.4;
        L[i] = v;
      }
    });
    B('alarm', 2.0, (L, R, sr, n) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const f = 620 + 280 * (0.5 - 0.5 * Math.cos((TAU * t) / 1.0));
        ph += (TAU * f) / sr;
        L[i] = Math.tanh(Math.sin(ph) * 2.5) * 0.6;
      }
    });
    B('hack_loop', 1.0, (L, R, sr, n, r) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const step = Math.floor(t * 16);
        const f = 900 + ((step * 7919) % 11) * 140;
        const g = (t * 16) % 1 < 0.45 ? 1 : 0;
        L[i] = Math.sin(TAU * f * t) * 0.25 * g;
      }
      return fadeLoop(L, sr, 0.01);
    });
    B('door', 3.2, (L, R, sr, n, r) => {
      const lp = new OnePole(200, sr);
      const bp = new Biquad('bp', 3000, 1, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const hiss = t < 0.6 ? bp.p(noise(r)) * Math.exp(-t / 0.3) * 0.8 : 0;
        const rumble = lp.p(noise(r)) * 2.2 * Math.min(1, t * 3) * Math.min(1, (3.2 - t) * 2) * (0.8 + 0.2 * Math.sin(t * 40));
        L[i] = hiss + rumble + (t > 2.9 && t < 3.0 ? noise(r) * (3.0 - t) * 8 : 0);
      }
    });
    B('heartbeat', 0.9, (L, R, sr, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let v = 0;
        for (const t0 of [0, 0.22]) if (t > t0) v += Math.sin(TAU * 52 * (t - t0)) * Math.exp(-(t - t0) / 0.06);
        L[i] = v;
      }
    });
    B('beep_warn', 0.3, (L, R, sr, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = Math.sin(TAU * 1760 * t) * (t < 0.08 || (t > 0.14 && t < 0.22) ? 1 : 0) * 0.5;
      }
    });
    B('heli_loop', 1.0, (L, R, sr, n, r) => {
      const lp = new OnePole(300, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const blade = Math.pow(0.5 + 0.5 * Math.sin(TAU * 13 * t), 6);
        L[i] = lp.p(noise(r)) * (0.4 + blade * 2.2) + Math.sin(TAU * 13 * t) * 0.15;
      }
      return fadeLoop(L, sr, 0.01);
    });
    B('shield_break', 0.5, (L, R, sr, n, r) => {
      const hp = new Biquad('hp', 2500, 0.8, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = hp.p(noise(r)) * Math.exp(-t / 0.08) + Math.sin(TAU * (1800 - t * 2400) * t) * Math.exp(-t / 0.1) * 0.4;
      }
    });

    // —— 环境循环（较低采样率） ——
    const LSR = 24000;
    B('amb_wind', 8, (L, R, sr, n, r) => {
      const lpL = new Biquad('lp', 380, 0.7, sr), lpR = new Biquad('lp', 380, 0.7, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const g = 0.6 + 0.25 * Math.sin((TAU * t) / 8 * 2) + 0.15 * Math.sin((TAU * t) / 8 * 5 + 1);
        lpL.set(300 + 200 * g, 0.7);
        lpR.set(320 + 190 * g, 0.7);
        L[i] = lpL.p(noise(r)) * g;
        R[i] = lpR.p(noise(r)) * g;
      }
      fadeLoop(L, sr, 0.5);
      return fadeLoop(R, sr, 0.5);
    }, { sr: LSR, stereo: true });
    B('amb_hum', 4, (L, R, sr, n, r) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        L[i] = Math.sin(TAU * 50 * t) * 0.5 + Math.sin(TAU * 100.5 * t) * 0.3 + Math.sin(TAU * 150 * t) * 0.15 + Math.sin(TAU * 220.25 * t) * 0.08 * (0.5 + 0.5 * Math.sin(TAU * 0.5 * t)) + (r.next() * 2 - 1) * 0.02;
      }
    }, { sr: LSR });
    B('amb_generator', 2, (L, R, sr, n, r) => {
      const lp = new OnePole(220, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const chug = Math.pow(0.5 + 0.5 * Math.sin(TAU * 8 * t), 3);
        L[i] = lp.p(r.next() * 2 - 1) * (0.5 + chug) * 1.5 + Math.sin(TAU * 32 * t) * 0.2;
      }
      return fadeLoop(L, sr, 0.02);
    }, { sr: LSR });

    // —— 音乐 ——
    this._music(LSR);
  }

  _music(sr) {
    const bpm = 96;
    const beat = 60 / bpm;
    const bars = 8;
    const dur = beat * 4 * bars; // 20 秒
    // 和声：Dm - Bb - F - C（小调），每两小节一换
    const chords = [[62, 65, 69], [58, 62, 65], [53, 57, 60], [60, 64, 67]];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // 低强度：铺底与心跳般的脉冲
    this._buf('music_calm', dur, (L, R, s, n, r) => {
      const lpL = new Biquad('lp', 900, 0.8, s), lpR = new Biquad('lp', 900, 0.8, s);
      for (let i = 0; i < n; i++) {
        const t = i / s;
        const ci = Math.floor(t / (beat * 8)) % 4;
        const ch = chords[ci];
        let v = 0, w = 0;
        for (let k = 0; k < 3; k++) {
          const f = mtof(ch[k] - 12);
          v += (((t * f * 1.003) % 1) * 2 - 1) * 0.18;
          w += (((t * f * 0.997) % 1) * 2 - 1) * 0.18;
        }
        const swell = 0.6 + 0.4 * Math.sin((TAU * t) / (beat * 8) - Math.PI / 2);
        lpL.set(500 + 500 * swell, 0.8);
        lpR.set(520 + 480 * swell, 0.8);
        const bt = t % beat;
        const pulse = Math.sin(TAU * mtof(ch[0] - 24) * t) * Math.exp(-bt / 0.25) * 0.5;
        L[i] = lpL.p(v) * swell + pulse;
        R[i] = lpR.p(w) * swell + pulse;
      }
      fadeLoop(L, s, 0.02);
      return fadeLoop(R, s, 0.02);
    }, { sr, stereo: true, peak: 0.7 });
    // 高强度：鼓组 + 贝斯八分音型 + 合成器刺音
    this._buf('music_combat', dur, (L, R, s, n, r) => {
      const hp = new Biquad('hp', 7000, 0.7, s);
      const snBp = new Biquad('bp', 1800, 0.8, s);
      const bassLp = new Biquad('lp', 600, 1.5, s);
      const leadLp = new Biquad('lp', 2400, 1.0, s);
      const eighth = beat / 2, six = beat / 4;
      for (let i = 0; i < n; i++) {
        const t = i / s;
        const ci = Math.floor(t / (beat * 8)) % 4;
        const ch = chords[ci];
        const tb = t % beat;
        const bi = Math.floor(t / beat) % 4;
        // 底鼓：1、2.5、3
        let kick = 0;
        for (const off of [0, 1.5 * beat, 2 * beat]) {
          const tt = (t % (beat * 4)) - off;
          if (tt >= 0 && tt < 0.3) kick += Math.sin(TAU * (50 + 90 * Math.exp(-tt / 0.03)) * tt) * Math.exp(-tt / 0.12);
        }
        // 军鼓：2、4
        let snare = 0;
        if (bi === 1 || bi === 3) snare = snBp.p(r.next() * 2 - 1) * Math.exp(-tb / 0.08) * 0.9 + Math.sin(TAU * 190 * tb) * Math.exp(-tb / 0.05) * 0.3;
        else snBp.p(0);
        // 踩镲：十六分
        const ts = t % six;
        const hat = hp.p(r.next() * 2 - 1) * Math.exp(-ts / 0.018) * 0.35;
        // 贝斯：八分音根音 / 八度
        const te = t % eighth;
        const ei = Math.floor(t / eighth) % 8;
        const bn = ch[0] - 24 + (ei % 4 === 3 ? 12 : 0);
        const bf = mtof(bn);
        const bass = bassLp.p((((t * bf) % 1) * 2 - 1) * Math.exp(-te / 0.18)) * 0.9;
        // 刺音：每小节第 1 拍与 2.75 拍
        let lead = 0;
        const tbar = t % (beat * 4);
        for (const off of [0, 2.75 * beat]) {
          const tt = tbar - off;
          if (tt >= 0 && tt < 0.35) for (let k = 0; k < 3; k++) lead += (((tt * mtof(ch[k])) % 1) * 2 - 1) * Math.exp(-tt / 0.12) * 0.12;
        }
        lead = leadLp.p(lead);
        const mix = kick * 0.9 + snare + hat + bass + lead;
        L[i] = Math.tanh(mix * 1.1) + hat * 0.2;
        R[i] = Math.tanh(mix * 1.1) - hat * 0.2;
      }
      fadeLoop(L, s, 0.005);
      return fadeLoop(R, s, 0.005);
    }, { sr, stereo: true, peak: 0.75 });
  }

  // ───────── 播放 ─────────
  _pick(name) {
    const l = this.buffers[name];
    if (!l) return null;
    return l.length === 1 ? l[0] : l[Math.floor(this.rng.next() * l.length)];
  }

  /**
   * 播放音效。opts: volume, rate, rateVar, pos{x,y,z}, occluded, reverb(默认 true), loop, ref, bus
   */
  play(name, opts = {}) {
    if (!this.ready || !this.ctx) return null;
    const buf = this._pick(name);
    if (!buf) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rv = opts.rateVar ?? 0.06;
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (this.rng.next() * 2 - 1) * rv);
    src.loop = !!opts.loop;
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    let node = src;
    if (opts.occluded) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      node.connect(f);
      node = f;
      g.gain.value *= 0.7;
    }
    node.connect(g);
    let out = g;
    let panner = null;
    if (opts.pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = opts.ref ?? 3;
      panner.maxDistance = 200;
      panner.rolloffFactor = opts.rolloff ?? 1.1;
      panner.positionX.value = opts.pos.x;
      panner.positionY.value = opts.pos.y;
      panner.positionZ.value = opts.pos.z;
      g.connect(panner);
      out = panner;
    }
    const bus = opts.bus === 'amb' ? this.ambBus : opts.bus === 'music' ? this.musicBus : this.sfx;
    out.connect(bus);
    if (opts.reverb !== false && opts.bus !== 'music') {
      const send = ctx.createGain();
      send.gain.value = opts.reverbSend ?? 1;
      out.connect(send).connect(this.reverbIn);
    }
    src.start(ctx.currentTime + (opts.delay ?? 0));
    const h = {
      src, gain: g, panner,
      stop: (fade = 0.05) => {
        try {
          g.gain.setTargetAtTime(0, ctx.currentTime, fade);
          src.stop(ctx.currentTime + fade * 5);
        } catch { /* 已停止 */ }
        this.loops.delete(h);
      },
      setPos: (x, y, z) => {
        if (!panner) return;
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;
      },
      setVolume: (v, tc = 0.05) => g.gain.setTargetAtTime(v, ctx.currentTime, tc),
      setRate: (r) => (src.playbackRate.value = r),
    };
    if (opts.loop) this.loops.add(h);
    return h;
  }

  stopAllLoops() {
    for (const h of [...this.loops]) h.stop(0.1);
    this.loops.clear();
    this.music = null;
  }

  updateListener(cam) {
    if (!this.ready) return;
    const L = this.ctx.listener;
    const e = cam.matrixWorld.elements;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(e[12], t);
      L.positionY.setValueAtTime(e[13], t);
      L.positionZ.setValueAtTime(e[14], t);
      L.forwardX.setValueAtTime(-e[8], t);
      L.forwardY.setValueAtTime(-e[9], t);
      L.forwardZ.setValueAtTime(-e[10], t);
      L.upX.setValueAtTime(e[4], t);
      L.upY.setValueAtTime(e[5], t);
      L.upZ.setValueAtTime(e[6], t);
    } else {
      L.setPosition(e[12], e[13], e[14]);
      L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
  }

  startMusic() {
    if (!this.ready || this.music) return;
    const calm = this.play('music_calm', { loop: true, bus: 'music', volume: 0.0001, rateVar: 0, reverb: false });
    const combat = this.play('music_combat', { loop: true, bus: 'music', volume: 0.0001, rateVar: 0, reverb: false });
    this.music = { calm, combat };
    this.musicIntensity = 0;
  }

  setMusicIntensity(k) {
    this._musicTarget = clamp(k, 0, 1);
  }

  update(dt) {
    if (!this.ready || !this.music) return;
    this.musicIntensity += (this._musicTarget - this.musicIntensity) * Math.min(1, dt * 0.8);
    const k = this.musicIntensity;
    this.music.calm.gain.gain.value = 0.55 * (1 - k * 0.7);
    this.music.combat.gain.gain.value = 0.8 * k;
  }
}

function fadeLoop(ch, sr, sec) {
  // 把尾部 n 个样本交叉淡入开头，返回需截掉的尾长
  const N = ch.length;
  const n = Math.min(Math.floor(sec * sr), Math.floor(N / 4));
  for (let i = 0; i < n; i++) {
    const k = i / n;
    ch[i] = ch[i] * k + ch[N - n + i] * (1 - k);
  }
  return n;
}
