// 全部音频由 WebAudio 实时合成，不加载任何外部音频：
// 引擎、轮胎尖啸、风噪、Eurobeat 风格原创循环（速度随名次与连击变化）、钢琴独奏、海浪、雨声、音效。
// 静音也是配乐：mute('music') 只留引擎与环境声。

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() { this.ctx = null; this.vol = { master: 0.8, music: 0.55, sfx: 0.8 }; this.musicOn = false; this.mode = 'none'; }

  /** 首次用户手势时调用 */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master; this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.vol.sfx; this.sfxBus.connect(this.master);
    this.envBus = ctx.createGain(); this.envBus.gain.value = 0.9; this.envBus.connect(this.master);
    // 噪声源
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // 引擎：锯齿 + 方波 → 失真 → 低通
    this.eng = {};
    const e = this.eng;
    e.o1 = ctx.createOscillator(); e.o1.type = 'sawtooth';
    e.o2 = ctx.createOscillator(); e.o2.type = 'square';
    e.sub = ctx.createOscillator(); e.sub.type = 'sine';
    e.mix = ctx.createGain(); e.mix.gain.value = 0;
    const shaper = ctx.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    shaper.curve = curve;
    e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 900; e.lp.Q.value = 3;
    const g1 = ctx.createGain(); g1.gain.value = 0.35; const g2 = ctx.createGain(); g2.gain.value = 0.18; const g3 = ctx.createGain(); g3.gain.value = 0.5;
    e.o1.connect(g1).connect(shaper); e.o2.connect(g2).connect(shaper); e.sub.connect(g3).connect(e.lp);
    shaper.connect(e.lp).connect(e.mix).connect(this.envBus);
    e.o1.start(); e.o2.start(); e.sub.start();
    // 轮胎尖啸 / 风噪 / 雨 / 海浪
    this.squeal = this._noiseVoice('bandpass', 1800, 6, this.envBus);
    this.wind = this._noiseVoice('lowpass', 500, 0.7, this.envBus);
    this.rainV = this._noiseVoice('highpass', 2500, 0.5, this.envBus);
    this.waves = this._noiseVoice('lowpass', 420, 0.5, this.envBus);
    this.music = new Sequencer(this);
  }

  _noiseVoice(type, freq, q, out) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(out); src.start();
    return { f, g };
  }

  set(param, v, t = 0.08) { if (!this.ctx) return; param.setTargetAtTime(v, this.ctx.currentTime, t); }

  /** 每帧：引擎与轮胎 */
  car(sim, on = true) {
    if (!this.ctx) return;
    const e = this.eng;
    const rpm = Math.max(800, sim.rpm || 800);
    const f = rpm / 60 * 2; // 四缸点火频率
    this.set(e.o1.frequency, f, 0.03); this.set(e.o2.frequency, f * 0.5, 0.03); this.set(e.sub.frequency, f * 0.5, 0.03);
    this.set(e.lp.frequency, 500 + (sim.throttle || 0) * 1800 + rpm * 0.12, 0.05);
    this.set(e.mix.gain, on ? (sim.engineBlown ? 0.02 : 0.1 + (sim.throttle || 0) * 0.12) : 0, 0.1);
    const slip = sim.drifting ? Math.min(1, Math.abs(sim.beta) * 1.6) : sim.handbrake && sim.speed > 3 ? 0.6 : 0;
    this.set(this.squeal.g.gain, on ? slip * 0.12 * Math.min(1, sim.speed / 10) : 0, 0.05);
    this.set(this.squeal.f.frequency, 1500 + slip * 900, 0.1);
    this.set(this.wind.g.gain, on ? Math.min(0.2, sim.speed / 300) : 0, 0.2);
  }
  engineOff() { if (this.ctx) { this.set(this.eng.mix.gain, 0); this.set(this.squeal.g.gain, 0); this.set(this.wind.g.gain, 0); } }
  ambience({ rain = 0, waves = 0 } = {}) {
    if (!this.ctx) return;
    this.set(this.rainV.g.gain, rain * 0.1, 0.5);
    this.set(this.waves.g.gain, waves * 0.22, 0.8);
    this.wavesOn = waves;
  }
  tick(dt) {
    if (!this.ctx) return;
    if (this.wavesOn) { this.wt = (this.wt || 0) + dt; this.waves.g.gain.value = this.wavesOn * (0.08 + 0.14 * Math.pow(Math.sin(this.wt * 0.45) * 0.5 + 0.5, 2)); }
    this.music.tick();
  }

  /** 音乐：'race' | 'piano' | 'none'（静音也是配乐） */
  setMusic(mode, opts = {}) {
    if (!this.ctx) { this.mode = mode; return; }
    this.mode = mode;
    this.music.setMode(mode, opts);
    this.set(this.musicBus.gain, mode === 'none' ? 0 : this.vol.music, mode === 'none' ? 0.25 : 0.6);
  }
  intensity(v) { if (this.music) this.music.intensity = v; }

  // —— 音效
  _env(g, a, d, peak) { const t = this.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  blip(freq = 880, dur = 0.12, type = 'square', vol = 0.15, out) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g).connect(out || this.sfxBus);
    this._env(g, 0.005, dur, vol); o.start(); o.stop(this.ctx.currentTime + dur + 0.05);
  }
  noiseHit(freq = 200, dur = 0.3, vol = 0.5, type = 'lowpass') {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    s.connect(f).connect(g).connect(this.sfxBus); this._env(g, 0.004, dur, vol);
    s.start(); s.stop(this.ctx.currentTime + dur + 0.1);
  }
  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'count': this.blip(660, 0.18, 'square', 0.12); break;
      case 'go': this.blip(1320, 0.45, 'square', 0.14); break;
      case 'perfect': [1568, 2093, 2637].forEach((f, i) => setTimeout(() => this.blip(f, 0.5, 'triangle', 0.12), i * 60)); break;
      case 'wall': this.noiseHit(260, 0.25, 0.6); this.blip(90, 0.2, 'sine', 0.3); break;
      case 'ditch': this.noiseHit(900, 0.12, 0.25, 'bandpass'); this.blip(140, 0.08, 'square', 0.1); break;
      case 'blow': this.noiseHit(120, 1.4, 1.0); this.noiseHit(1800, 0.4, 0.4, 'highpass'); this.blip(55, 0.8, 'sawtooth', 0.4); break;
      case 'overtake': this.blip(988, 0.08, 'square', 0.1); setTimeout(() => this.blip(1319, 0.14, 'square', 0.1), 70); break;
      case 'text': this.blip(1200 + Math.random() * 200, 0.02, 'square', 0.025); break;
      case 'qteOk': this.blip(1047, 0.1, 'square', 0.12); break;
      case 'qteBad': this.blip(180, 0.2, 'sawtooth', 0.12); break;
      case 'shutter': this.noiseHit(3000, 0.06, 0.3, 'highpass'); break;
      case 'piano': this.music.pianoNote(64, 2.5, 0.25); break;
    }
  }
}

/** 简易步进音序器：Eurobeat（底鼓四拍 + 反拍八度贝斯 + 琶音主旋律）与钢琴独奏 */
class Sequencer {
  constructor(a) {
    this.a = a; this.mode = 'none'; this.step = 0; this.next = 0; this.intensity = 0;
    // A 小调走向：Am F G Em（原创走向）
    this.prog = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
    this.lead = [0, 2, 1, 2, 0, 2, 1, 3, 2, 1, 0, 1, 2, 3, 2, 1];
    this.pianoMel = [76, 74, 72, 71, 72, 74, 69, -1, 72, 71, 69, 67, 69, 71, 64, -1];
  }
  setMode(mode, opts) { this.mode = mode; this.step = 0; this.next = this.a.ctx.currentTime + 0.1; this.opts = opts; }
  tick() {
    const ctx = this.a.ctx;
    if (this.mode === 'none') return;
    const bpm = this.mode === 'race' ? 152 + this.intensity * 18 : 66;
    const sixteenth = 60 / bpm / 4;
    while (this.next < ctx.currentTime + 0.12) {
      this.schedule(this.step, this.next, sixteenth);
      this.next += this.mode === 'race' ? sixteenth : sixteenth * 2;
      this.step++;
    }
  }
  osc(type, freq, t, dur, vol, dest, attack = 0.005) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.a.musicBus); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  schedule(st, t, sx) {
    const bar = Math.floor(st / 16) % 4, s = st % 16;
    if (this.mode === 'race') {
      const chord = this.prog[bar];
      if (s % 4 === 0) { const o = this.osc('sine', 150, t, 0.22, 0.9); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); }
      if (s % 4 === 2) this.osc('sawtooth', NOTE(chord[0] - 12), t, sx * 1.6, 0.22);
      if (s % 4 === 0) this.osc('sawtooth', NOTE(chord[0] - 24), t, sx * 1.2, 0.16);
      if (s % 2 === 1) this.hat(t, 0.06);
      if (s === 4 || s === 12) this.snare(t);
      const li = this.lead[s];
      const note = chord[li % 3] + (li === 3 ? 12 : 12);
      this.osc('square', NOTE(note), t, sx * 0.9, 0.05 + this.intensity * 0.03);
      if (this.intensity > 0.5 && s % 8 === 0) for (const n of chord) this.osc('sawtooth', NOTE(n + 12), t, sx * 3, 0.035);
    } else if (this.mode === 'piano') {
      const m = this.pianoMel[st % 16];
      if (st % 4 === 0) for (const n of this.prog[Math.floor(st / 4) % 4]) this.pianoNote(n - 12, 3.2, 0.08, t);
      if (m > 0) this.pianoNote(m, 2.4, 0.13, t);
    }
  }
  pianoNote(n, dur, vol, t = this.a.ctx.currentTime) {
    const f = NOTE(n);
    this.osc('triangle', f, t, dur, vol, undefined, 0.004);
    this.osc('sine', f * 2, t, dur * 0.6, vol * 0.35, undefined, 0.004);
    this.osc('sine', f * 3, t, dur * 0.3, vol * 0.12, undefined, 0.004);
  }
  hat(t, vol) {
    const ctx = this.a.ctx, s = ctx.createBufferSource(); s.buffer = this.a.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f).connect(g).connect(this.a.musicBus); s.start(t); s.stop(t + 0.06);
  }
  snare(t) {
    const ctx = this.a.ctx, s = ctx.createBufferSource(); s.buffer = this.a.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    s.connect(f).connect(g).connect(this.a.musicBus); s.start(t); s.stop(t + 0.2);
  }
}
