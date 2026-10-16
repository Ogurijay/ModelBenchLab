// 程序化音频：全部由 WebAudio 实时合成，无音频文件、无依赖。
// 接口：audio.init / ready / setVolumes / play / vocal / music / ambient / setAmbientIntensity

const LOOKAHEAD = 0.12;       // 音乐调度提前量（秒）
const TICK_MS = 25;           // 调度器间隔
const MAX_VOICES = 48;        // SFX 并发上限
const RETRIGGER = 0.035;      // 同名 SFX 最短重触发间隔

let ctx = null;
let failed = false;
let buses = null;
let noiseBuf = null;
let timer = null;
let lastTick = 0;
let tickCount = 0;
const vol = { master: 0.8, music: 0.35, sfx: 0.8, ambient: null };
const lastPlay = new Map();
const voices = [];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- 底层合成工具

function track(v, src, stopT) {
  if (v.srcs) v.srcs.push(src);
  if (stopT > v.end) v.end = stopT;
}

// pts: [[dt, value], ...] 相对 t
function sweep(param, t, pts, exp = true) {
  param.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) {
    const [dt, val] = pts[i];
    if (exp) param.exponentialRampToValueAtTime(Math.max(val, 1e-4), t + dt);
    else param.linearRampToValueAtTime(val, t + dt);
  }
}

function envGain(t, a, g, end, hold) {
  const n = ctx.createGain();
  const pk = Math.max(g, 1e-4);
  n.gain.setValueAtTime(0, t);
  n.gain.linearRampToValueAtTime(pk, t + a);
  if (hold > 0) n.gain.setValueAtTime(pk, t + a + hold);
  n.gain.exponentialRampToValueAtTime(1e-4, t + end);
  return n;
}

function mkFilter(fo, t, dur) {
  const f = ctx.createBiquadFilter();
  f.type = fo.type || 'lowpass';
  f.Q.value = fo.q ?? 1;
  const pts = fo.pts || (fo.f2 != null ? [[0, fo.f], [dur, fo.f2]] : [[0, fo.f]]);
  sweep(f.frequency, t, pts, true);
  return f;
}

// 振荡器音符
function tone(v, o) {
  const t = v.t + (o.t0 || 0);
  const dur = o.dur || 0.2;
  const a = o.a ?? 0.005;
  const hold = o.hold || 0;
  const end = Math.max(dur, a + hold + 0.01);
  const stopT = t + end + 0.05;
  const p = o.abs ? 1 : v.p;
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  if (o.detune) osc.detune.value = o.detune;
  const pts = o.ft || (o.f2 != null ? [[0, o.f], [dur, o.f2]] : [[0, o.f]]);
  sweep(osc.frequency, t, pts.map(([d, f]) => [d, Math.max(1, f * p)]), !o.lin);
  if (o.mod) {
    const m = ctx.createOscillator();
    m.type = o.mod.type || 'sine';
    m.frequency.value = o.mod.rate;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(o.mod.depth * p, t);
    if (o.mod.depth2 != null) mg.gain.linearRampToValueAtTime(o.mod.depth2 * p, t + dur);
    m.connect(mg); mg.connect(osc.frequency);
    m.start(t); m.stop(stopT); track(v, m, stopT);
  }
  let head = osc;
  if (o.filter) { const fl = mkFilter(o.filter, t, dur); head.connect(fl); head = fl; }
  if (o.am) {
    const amg = ctx.createGain();
    amg.gain.value = 1 - o.am.depth;
    const m = ctx.createOscillator();
    m.type = o.am.type || 'sine';
    m.frequency.value = o.am.rate;
    const mg = ctx.createGain(); mg.gain.value = o.am.depth;
    m.connect(mg); mg.connect(amg.gain);
    m.start(t); m.stop(stopT); track(v, m, stopT);
    head.connect(amg); head = amg;
  }
  const g = envGain(t, a, o.g ?? 0.3, end, hold);
  head.connect(g); g.connect(o.dest || v.out);
  osc.start(t); osc.stop(stopT);
  track(v, osc, stopT);
  return osc;
}

// 滤波噪声
function nz(v, o) {
  const t = v.t + (o.t0 || 0);
  const dur = o.dur || 0.2;
  const a = o.a ?? 0.002;
  const hold = o.hold || 0;
  const end = Math.max(dur, a + hold + 0.01);
  const stopT = t + end + 0.05;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  const fl = mkFilter({ type: o.type || 'bandpass', f: o.f || 1000, f2: o.f2, q: o.q ?? 1, pts: o.pts }, t, dur);
  const g = envGain(t, a, o.g ?? 0.3, end, hold);
  src.connect(fl); fl.connect(g); g.connect(o.dest || v.out);
  src.start(t, Math.random() * 1.5); src.stop(stopT);
  track(v, src, stopT);
}

function bell(v, t0, f, dur, g, ratios = [1, 2.76, 5.4], gains = [1, 0.4, 0.18]) {
  ratios.forEach((r, i) => tone(v, { t0, f: f * r, dur: dur / (1 + i * 0.7), a: 0.001, g: g * gains[i] }));
}

function brass(v, t0, midi, dur, g) {
  const f = mtof(midi);
  const o = { t0, dur: dur + 0.12, a: 0.025, hold: Math.max(0, dur - 0.03),
    filter: { type: 'lowpass', pts: [[0, 500], [0.05, 2600], [dur + 0.12, 1100]], q: 1.2 } };
  tone(v, { ...o, type: 'sawtooth', f, detune: -6, g });
  tone(v, { ...o, type: 'sawtooth', f, detune: 7, g: g * 0.8 });
  tone(v, { ...o, type: 'square', f: f * 0.5, g: g * 0.25 });
}

function crowdBurst(v, len, g) {
  [450, 750, 1100, 1600, 2300].forEach((f) => nz(v, {
    t0: Math.random() * 0.05, type: 'bandpass', pts: [[0, f * 0.9], [len * 0.4, f * 1.15], [len, f]],
    q: 2.5, dur: len, a: len * 0.2, hold: len * 0.25, g: 0.14 * g }));
  for (let i = 0; i < 7; i++) {
    const f = rand(260, 580);
    tone(v, { t0: Math.random() * 0.15, type: 'sawtooth', ft: [[0, f], [0.25, f * 1.35], [len * 0.8, f * 1.1]],
      dur: len * 0.8, a: 0.08, hold: len * 0.2, g: 0.025 * g, filter: { type: 'lowpass', f: 1400 },
      mod: { rate: rand(5, 8), depth: f * 0.04 } });
  }
  for (let i = 0; i < 22; i++) nz(v, { t0: Math.random() * len * 0.85, type: 'bandpass', f: rand(1200, 2800), q: 1.2, dur: 0.025, a: 0.001, g: rand(0.05, 0.11) * g });
}

// ---------------------------------------------------------------- SFX

const SFX = {
  punch(v) {
    nz(v, { type: 'lowpass', f: 2400, f2: 300, dur: 0.12, g: 0.7 });
    tone(v, { f: 210, f2: 70, dur: 0.11, g: 0.6 });
    tone(v, { type: 'triangle', f: 700, f2: 320, dur: 0.06, g: 0.15 });
  },
  punchHeavy(v) {
    nz(v, { type: 'lowpass', f: 3200, f2: 150, q: 1.2, dur: 0.28, g: 0.85 });
    tone(v, { f: 170, f2: 40, dur: 0.3, g: 0.95 });
    tone(v, { type: 'square', f: 240, f2: 110, dur: 0.12, g: 0.07, filter: { type: 'lowpass', f: 1200 } });
    tone(v, { t0: 0.03, type: 'triangle', ft: [[0, 500], [0.06, 760], [0.18, 520]], dur: 0.2, g: 0.08 });
  },
  kick(v) {
    nz(v, { type: 'bandpass', f: 1500, q: 2, dur: 0.06, g: 0.1 });
    nz(v, { t0: 0.03, type: 'bandpass', f: 900, f2: 300, dur: 0.12, g: 0.45 });
    tone(v, { t0: 0.03, f: 120, f2: 45, dur: 0.2, g: 0.8 });
  },
  headbutt(v) {
    tone(v, { f: 600, dur: 0.12, a: 0.001, g: 0.35 });
    tone(v, { f: 900, dur: 0.08, a: 0.001, g: 0.15 });
    tone(v, { type: 'triangle', f: 280, f2: 200, dur: 0.2, g: 0.4 });
    nz(v, { type: 'bandpass', f: 1500, q: 2, dur: 0.03, g: 0.3 });
  },
  whoosh(v) {
    nz(v, { type: 'bandpass', pts: [[0, 350], [0.12, 1800], [0.28, 500]], q: 2.5, dur: 0.3, a: 0.08, g: 0.5 });
  },
  grab(v) {
    nz(v, { type: 'bandpass', f: 1800, q: 1.5, dur: 0.06, g: 0.3 });
    tone(v, { f: 320, f2: 520, dur: 0.07, g: 0.2 });
  },
  release(v) {
    tone(v, { f: 520, f2: 300, dur: 0.08, g: 0.18 });
    nz(v, { type: 'highpass', f: 2000, dur: 0.05, g: 0.12 });
  },
  throw(v) {
    nz(v, { type: 'bandpass', pts: [[0, 300], [0.2, 2200], [0.45, 600]], q: 2, dur: 0.45, a: 0.1, g: 0.55 });
    tone(v, { type: 'triangle', f: 300, f2: 800, dur: 0.18, g: 0.15 });
  },
  jump(v) {
    tone(v, { f: 260, f2: 620, dur: 0.14, g: 0.3 });
    tone(v, { type: 'triangle', f: 520, f2: 1240, dur: 0.1, g: 0.06 });
  },
  land(v) {
    nz(v, { type: 'lowpass', f: 700, f2: 200, dur: 0.14, g: 0.55 });
    tone(v, { f: 130, f2: 60, dur: 0.12, g: 0.5 });
  },
  step(v) {
    nz(v, { type: 'lowpass', f: rand(800, 1300), dur: 0.05, g: 0.22, rate: rand(0.8, 1.2) });
    tone(v, { f: rand(80, 100), dur: 0.04, g: 0.12 });
  },
  ko(v) {
    bell(v, 0, 1760, 0.8, 0.25);
    bell(v, 0.42, 2093, 0.6, 0.12);
    tone(v, { type: 'triangle', f: 900, dur: 1.0, a: 0.1, hold: 0.5, g: 0.04, mod: { rate: 8, depth: 120 } });
    [0.1, 0.2, 0.38, 0.48, 0.66, 0.76, 0.92].forEach((t0, i) => {
      const k = i % 2 ? 1.12 : 1;
      tone(v, { t0, ft: [[0, 2700 * k], [0.035, 3900 * k], [0.07, 3100 * k]], dur: 0.08, a: 0.004, g: 0.1 });
    });
  },
  wake(v) {
    tone(v, { ft: [[0, 300], [0.25, 950]], dur: 0.25, g: 0.25 });
    bell(v, 0.18, 1568, 0.4, 0.12);
    bell(v, 0.26, 2093, 0.4, 0.1);
  },
  splash(v) {
    nz(v, { type: 'bandpass', pts: [[0, 600], [0.08, 2400], [0.5, 900]], q: 0.7, dur: 0.55, a: 0.01, g: 0.6 });
    nz(v, { type: 'lowpass', f: 500, f2: 150, dur: 0.3, g: 0.4 });
    for (let i = 0; i < 7; i++) {
      const f = rand(700, 2100);
      tone(v, { t0: rand(0.05, 0.45), ft: [[0, f], [0.05, f * 1.9]], dur: 0.06, a: 0.002, g: 0.12 });
    }
  },
  fallWhistle(v) {
    tone(v, { ft: [[0, 2300], [1.1, 450]], dur: 1.15, a: 0.03, hold: 0.9, g: 0.26, mod: { rate: 6, depth: 25 } });
    nz(v, { type: 'bandpass', pts: [[0, 2300], [1.1, 450]], q: 8, dur: 1.15, a: 0.03, hold: 0.9, g: 0.05 });
  },
  eliminate(v) {
    nz(v, { type: 'lowpass', f: 3500, f2: 250, q: 0.8, dur: 0.4, g: 0.55 });
    tone(v, { type: 'triangle', f: 500, f2: 1400, dur: 0.18, g: 0.12 });
    [392, 370, 349, 330].forEach((f, i) => {
      const last = i === 3, d = last ? 0.7 : 0.2;
      tone(v, { t0: 0.25 + i * 0.2, type: 'sawtooth', f, f2: last ? f * 0.94 : f * 0.99, dur: d, a: 0.02,
        hold: last ? 0.35 : 0.1, g: 0.12, filter: { type: 'lowpass', pts: [[0, 500], [0.08, 1600], [d, 600]], q: 3 },
        mod: last ? { rate: 6, depth: 8 } : null });
    });
  },
  bat(v) {
    tone(v, { f: 1000, dur: 0.06, a: 0.001, g: 0.45 });
    tone(v, { type: 'triangle', f: 480, f2: 440, dur: 0.1, a: 0.001, g: 0.35 });
    nz(v, { type: 'bandpass', f: 2200, q: 3, dur: 0.035, a: 0.001, g: 0.45 });
    tone(v, { f: 180, f2: 120, dur: 0.08, g: 0.3 });
  },
  pan(v) {
    const base = 210;
    const R = [1, 1.47, 2.09, 2.56, 3.12, 4.18, 5.43];
    const G = [0.35, 0.22, 0.18, 0.12, 0.1, 0.07, 0.05];
    R.forEach((r, i) => {
      const f = base * r, d = 2.6 - i * 0.25;
      tone(v, { ft: [[0, f * 1.02], [0.05, f]], dur: d, a: 0.002, g: G[i] });
      tone(v, { f: f * 1.003, dur: d * 0.9, a: 0.002, g: G[i] * 0.6 });
    });
    nz(v, { type: 'lowpass', f: 3000, dur: 0.04, a: 0.001, g: 0.5 });
  },
  hammer(v) {
    tone(v, { f: 200, f2: 55, dur: 0.3, g: 0.9 });
    nz(v, { type: 'lowpass', f: 1500, f2: 200, dur: 0.2, g: 0.6 });
    tone(v, { t0: 0.02, type: 'square', ft: [[0, 1100], [0.05, 1500], [0.12, 1200]], dur: 0.15, g: 0.12,
      filter: { type: 'bandpass', f: 1500, q: 3 } });
  },
  iceShot(v) {
    tone(v, { f: 3000, f2: 900, dur: 0.2, g: 0.25 });
    tone(v, { type: 'triangle', f: 4500, f2: 1800, dur: 0.15, g: 0.1 });
    nz(v, { type: 'highpass', f: 5000, dur: 0.12, g: 0.1 });
  },
  freeze(v) {
    nz(v, { type: 'highpass', pts: [[0, 3000], [0.7, 7000]], dur: 0.7, a: 0.1, g: 0.1 });
    tone(v, { f: 400, f2: 200, dur: 0.4, g: 0.15 });
    const N = [2093, 2349, 2637, 3136, 3520, 4186].sort(() => Math.random() - 0.5);
    N.forEach((f, i) => tone(v, { t0: i * 0.06, f, dur: 0.4, a: 0.002, g: 0.08 }));
  },
  iceBreak(v) {
    nz(v, { type: 'highpass', f: 2500, dur: 0.35, a: 0.001, g: 0.5 });
    tone(v, { f: 300, f2: 120, dur: 0.1, g: 0.3 });
    for (let i = 0; i < 12; i++) {
      tone(v, { t0: rand(0, 0.25), type: Math.random() < 0.5 ? 'sine' : 'triangle', f: rand(2500, 7000),
        dur: rand(0.05, 0.2), a: 0.001, g: rand(0.06, 0.12) });
    }
  },
  zap(v) {
    tone(v, { type: 'sawtooth', f: 700, dur: 0.35, a: 0.003, hold: 0.15, g: 0.2,
      mod: { type: 'square', rate: 47, depth: 500, depth2: 150 }, filter: { type: 'bandpass', f: 2000, q: 0.8 } });
    nz(v, { type: 'bandpass', f: 3500, q: 1, dur: 0.3, g: 0.2 });
    for (let i = 0; i < 5; i++) nz(v, { t0: rand(0, 0.28), type: 'highpass', f: 4000, dur: 0.02, a: 0.001, g: 0.18 });
  },
  bomb(v) {
    tone(v, { f: 130, f2: 32, dur: 0.8, a: 0.003, g: 1 });
    nz(v, { type: 'lowpass', pts: [[0, 4000], [0.15, 1200], [1.3, 90]], q: 0.7, dur: 1.4, a: 0.004, g: 0.95 });
    nz(v, { type: 'bandpass', f: 500, q: 0.6, dur: 0.12, g: 0.6 });
    tone(v, { type: 'triangle', f: 900, f2: 200, dur: 0.15, g: 0.15 });
    for (let i = 0; i < 8; i++) nz(v, { t0: rand(0.1, 0.7), type: 'highpass', f: 2500, dur: 0.03, a: 0.001, g: 0.12 });
  },
  wind(v) {
    const pts = [[0, 250], [0.5, 900], [1.2, 350]];
    nz(v, { type: 'bandpass', pts, q: 1.8, dur: 1.3, a: 0.4, g: 0.5 });
    nz(v, { type: 'bandpass', pts: pts.map(([d, f]) => [d, f * 2]), q: 6, dur: 1.3, a: 0.4, g: 0.08 });
  },
  horn(v) {
    const o = { dur: 2.2, a: 0.15, hold: 1.5, filter: { type: 'lowpass', pts: [[0, 350], [0.2, 900], [2.2, 500]], q: 1.5 } };
    tone(v, { ...o, type: 'sawtooth', f: 87, g: 0.22 });
    tone(v, { ...o, type: 'sawtooth', f: 87.7, g: 0.18 });
    tone(v, { ...o, type: 'sawtooth', f: 130.5, g: 0.12 });
    tone(v, { f: 87, dur: 2.2, a: 0.15, hold: 1.5, g: 0.3 });
  },
  creak(v) {
    const o = { type: 'sawtooth', ft: [[0, 38], [0.25, 62], [0.55, 44], [0.7, 52]], dur: 0.75, a: 0.08, hold: 0.35, lin: true };
    tone(v, { ...o, g: 0.35, filter: { type: 'bandpass', f: 750, q: 5 } });
    tone(v, { ...o, g: 0.2, filter: { type: 'bandpass', f: 1500, q: 7 } });
  },
  crack(v) {
    nz(v, { type: 'bandpass', f: 2800, q: 0.9, dur: 0.04, a: 0.0005, g: 0.8 });
    nz(v, { t0: 0.03, type: 'bandpass', f: 2000, q: 0.9, dur: 0.04, a: 0.0005, g: 0.5 });
    nz(v, { t0: 0.07, type: 'bandpass', f: 3500, q: 0.9, dur: 0.05, a: 0.0005, g: 0.35 });
    tone(v, { f: 160, f2: 70, dur: 0.12, g: 0.4 });
    nz(v, { t0: 0.02, type: 'highpass', f: 4000, dur: 0.2, g: 0.1 });
  },
  beep(v) {
    tone(v, { type: 'square', f: 880, dur: 0.14, a: 0.003, hold: 0.08, g: 0.12, filter: { type: 'lowpass', f: 3000 } });
    tone(v, { f: 880, dur: 0.14, a: 0.003, hold: 0.08, g: 0.2 });
  },
  go(v) {
    tone(v, { type: 'square', f: 1320, dur: 0.5, a: 0.003, hold: 0.3, g: 0.12, filter: { type: 'lowpass', f: 3500 } });
    tone(v, { f: 1760, dur: 0.5, a: 0.003, hold: 0.3, g: 0.12 });
    tone(v, { f: 660, dur: 0.5, a: 0.003, hold: 0.3, g: 0.18 });
    bell(v, 0.08, 2637, 0.5, 0.08);
  },
  roundWin(v) {
    [[0, 72, 0.1], [0.1, 76, 0.1], [0.2, 79, 0.1], [0.3, 84, 0.45]].forEach(([t0, m, d]) => brass(v, t0, m, d, 0.1));
    brass(v, 0.3, 76, 0.45, 0.06); brass(v, 0.3, 79, 0.45, 0.06);
    bell(v, 0.3, 2093, 0.6, 0.06); bell(v, 0.42, 2637, 0.5, 0.05);
  },
  matchWin(v) {
    const seq = [[0, 67, 0.12], [0.12, 67, 0.12], [0.24, 67, 0.12], [0.36, 72, 0.5], [0.9, 71, 0.12], [1.02, 72, 0.12],
      [1.14, 74, 0.12], [1.26, 76, 0.5], [1.8, 79, 0.15], [1.95, 77, 0.15], [2.1, 79, 0.15], [2.25, 84, 1.0]];
    seq.forEach(([t0, m, d]) => brass(v, t0, m, d, 0.1));
    [60, 64, 67, 72].forEach((m) => brass(v, 2.25, m, 1.0, 0.045));
    for (let i = 0; i < 16; i++) nz(v, { t0: 1.75 + i * 0.03, type: 'bandpass', f: 1800, q: 0.8, dur: 0.05, g: 0.04 + i * 0.008 });
    [0, 0.36, 1.26].forEach((t0) => tone(v, { t0, f: 98, f2: 80, dur: 0.4, g: 0.35 }));
    nz(v, { t0: 2.25, type: 'highpass', f: 5000, dur: 1.6, a: 0.002, g: 0.12 });
    bell(v, 2.25, 2093, 1.0, 0.06); bell(v, 2.45, 2637, 0.9, 0.05); bell(v, 2.65, 3136, 0.8, 0.04);
  },
  click(v) {
    tone(v, { f: 2000, dur: 0.03, a: 0.001, g: 0.25 });
    nz(v, { type: 'highpass', f: 4000, dur: 0.015, a: 0.001, g: 0.1 });
  },
  hover(v) {
    tone(v, { f: 1400, f2: 1600, dur: 0.05, a: 0.004, g: 0.08 });
  },
  whistle(v) {
    const blast = (t0, len) => {
      tone(v, { t0, f: 2950, dur: len, a: 0.015, hold: len - 0.06, g: 0.22, mod: { rate: 34, depth: 140 }, am: { rate: 34, depth: 0.35 } });
      nz(v, { t0, type: 'bandpass', f: 2950, q: 6, dur: len, a: 0.015, hold: len - 0.06, g: 0.1 });
    };
    blast(0, 0.12); blast(0.17, 0.45);
  },
  pickup(v) {
    tone(v, { type: 'triangle', f: 880, dur: 0.09, g: 0.25 });
    tone(v, { t0: 0.07, type: 'triangle', f: 1318, dur: 0.15, g: 0.25 });
  },
  drop(v) {
    tone(v, { type: 'triangle', f: 700, f2: 420, dur: 0.12, g: 0.25 });
    nz(v, { t0: 0.06, type: 'lowpass', f: 800, dur: 0.08, g: 0.2 });
    tone(v, { t0: 0.06, f: 140, f2: 80, dur: 0.1, g: 0.25 });
  },
  bounce(v) {
    tone(v, { type: 'triangle', ft: [[0, 160], [0.08, 420], [0.5, 300]], dur: 0.55, a: 0.004, g: 0.35,
      mod: { rate: 16, depth: 60, depth2: 0 } });
  },
  gas(v) {
    nz(v, { type: 'highpass', f: 3500, dur: 0.8, a: 0.04, hold: 0.5, g: 0.3 });
    nz(v, { type: 'bandpass', f: 6000, q: 1, dur: 0.8, a: 0.04, hold: 0.5, g: 0.15 });
  },
  alarm(v) {
    for (let i = 0; i < 4; i++) {
      tone(v, { t0: i * 0.25, type: 'square', f: i % 2 ? 660 : 880, dur: 0.24, a: 0.01, hold: 0.18, g: 0.12,
        filter: { type: 'lowpass', f: 2200 } });
    }
  },
  crowd(v) { crowdBurst(v, 1.1, 1); },
  goal(v) {
    const o = { dur: 1.3, a: 0.04, hold: 0.9, filter: { type: 'lowpass', f: 2200 } };
    [57, 61, 64, 69].forEach((m) => tone(v, { ...o, type: 'sawtooth', f: mtof(m), g: 0.08 }));
    bell(v, 0.1, 2637, 0.6, 0.06); bell(v, 0.25, 3136, 0.6, 0.05);
    crowdBurst(v, 1.6, 1.1);
  },
};

// ---------------------------------------------------------------- 动物叫声（共振峰合成）

const SPECIES = {
  dog:     { f0: 520, wave: 'sawtooth', dur: 0.2, vowel: [[700, 1200, 2600], [850, 1300, 2500], [500, 1000, 2400]], q: [6, 8, 10], amp: [1, 0.7, 0.35], direct: 0.08, burst: 0.5, onset: 0.8, atk: 0.006 },
  cat:     { f0: 640, wave: 'sawtooth', dur: 0.42, vowel: [[350, 2300, 3000], [800, 1500, 2800], [450, 900, 2600]], q: [7, 9, 12], amp: [1, 0.8, 0.35], direct: 0.05, atk: 0.04 },
  duck:    { f0: 330, wave: 'sawtooth', dur: 0.22, vowel: [[900, 1500, 2700], [1000, 1600, 2800], [700, 1300, 2600]], q: [10, 12, 14], amp: [1, 1, 0.6], direct: 0, buzz: { rate: 28, depth: 0.45 }, atk: 0.005 },
  bunny:   { f0: 1300, wave: 'triangle', dur: 0.15, vowel: [[1500, 3000, 4500], [1700, 3200, 4600], [1400, 2800, 4400]], q: [4, 6, 8], amp: [0.5, 0.3, 0.15], direct: 0.7, atk: 0.008 },
  bear:    { f0: 140, wave: 'sawtooth', dur: 0.32, vowel: [[650, 1100, 2400], [700, 1150, 2450], [500, 950, 2300]], q: [5, 7, 9], amp: [1, 0.6, 0.3], direct: 0.12, breath: 0.4, atk: 0.03 },
  panda:   { f0: 200, wave: 'sawtooth', dur: 0.28, vowel: [[280, 900, 2200], [450, 1000, 2300], [260, 800, 2200]], q: [6, 6, 8], amp: [1, 0.5, 0.25], direct: 0.15, puff: 0.3, atk: 0.02 },
  fox:     { f0: 880, wave: 'sawtooth', dur: 0.15, vowel: [[600, 1700, 3000], [900, 1500, 2900], [700, 1300, 2800]], q: [6, 8, 10], amp: [1, 0.7, 0.4], direct: 0.1, burst: 0.3, onset: 0.75, atk: 0.005 },
  penguin: { f0: 420, wave: 'square', dur: 0.3, vowel: [[900, 1700, 3100], [1100, 1900, 3300], [800, 1500, 3000]], q: [8, 10, 12], amp: [1, 0.9, 0.5], direct: 0, buzz: { rate: 42, depth: 0.5 }, atk: 0.008 },
};

const KINDS = {
  hurt:   { dur: 1.0, c: [[0, 1.3], [0.12, 1.5], [1, 0.9]], g: 1, fs: 1.1 },
  effort: { dur: 0.6, c: [[0, 0.95], [0.35, 1.05], [1, 0.8]], g: 0.8, env: 'short' },
  ko:     { dur: 2.0, c: [[0, 1.15], [0.3, 1.0], [1, 0.6]], g: 0.9, vib: { rate: 7, depth: 0.08 }, fs: 0.92 },
  win:    { dur: 1.5, c: [[0, 0.95], [0.5, 1.25], [1, 1.45]], g: 1, vib: { rate: 6, depth: 0.03 }, fs: 1.05 },
  fall:   { dur: 3.0, c: [[0, 1.35], [0.15, 1.5], [1, 0.65]], g: 1, vib: { rate: 5.5, depth: 0.035 } },
  taunt:  { dur: 1.4, c: [[0, 1.1], [0.25, 1.3], [0.5, 1.0], [0.75, 1.3], [1, 1.15]], g: 0.9, env: 'double' },
};

function voiceSynth(v, sp, kind) {
  const S = SPECIES[sp] || SPECIES.dog;
  const K = KINDS[kind] || KINDS.effort;
  const dur = clamp(S.dur * K.dur, 0.15, 0.6);
  const t = v.t;
  const stopT = t + dur + 0.06;
  const f0 = S.f0 * v.p;
  const src = ctx.createOscillator();
  src.type = S.wave;
  const c = K.c;
  if (S.onset) {
    src.frequency.setValueAtTime(f0 * c[0][1] * S.onset, t);
    src.frequency.linearRampToValueAtTime(f0 * c[0][1], t + 0.025);
  } else src.frequency.setValueAtTime(f0 * c[0][1], t);
  for (let i = 1; i < c.length; i++) src.frequency.linearRampToValueAtTime(f0 * c[i][1], t + Math.max(0.03, c[i][0] * dur));
  if (K.vib) {
    const l = ctx.createOscillator(); l.frequency.value = K.vib.rate;
    const lg = ctx.createGain(); lg.gain.value = f0 * K.vib.depth;
    l.connect(lg); lg.connect(src.frequency);
    l.start(t); l.stop(stopT); track(v, l, stopT);
  }
  const mix = ctx.createGain();
  const fs = K.fs || 1, V = S.vowel;
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = S.q[i];
    bp.frequency.setValueAtTime(V[0][i] * fs, t);
    bp.frequency.linearRampToValueAtTime(V[1][i] * fs, t + dur * 0.45);
    bp.frequency.linearRampToValueAtTime(V[2][i] * fs, t + dur);
    const g = ctx.createGain(); g.gain.value = S.amp[i] * 2.2;
    src.connect(bp); bp.connect(g); g.connect(mix);
  }
  if (S.direct) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(16000, f0 * 2.5);
    const g = ctx.createGain(); g.gain.value = S.direct;
    src.connect(lp); lp.connect(g); g.connect(mix);
  }
  let head = mix;
  if (S.buzz) {
    const amg = ctx.createGain(); amg.gain.value = 1 - S.buzz.depth;
    const l = ctx.createOscillator(); l.type = 'square'; l.frequency.value = S.buzz.rate;
    const lg = ctx.createGain(); lg.gain.value = S.buzz.depth;
    l.connect(lg); lg.connect(amg.gain);
    l.start(t); l.stop(stopT); track(v, l, stopT);
    head.connect(amg); head = amg;
  }
  const env = ctx.createGain();
  const pk = 0.55 * (K.g || 1);
  const a = S.atk || 0.015;
  const eg = env.gain;
  eg.setValueAtTime(0, t);
  eg.linearRampToValueAtTime(pk, t + a);
  if (K.env === 'double') {
    eg.linearRampToValueAtTime(pk * 0.8, t + dur * 0.38);
    eg.linearRampToValueAtTime(pk * 0.1, t + dur * 0.48);
    eg.linearRampToValueAtTime(pk, t + dur * 0.56);
    eg.linearRampToValueAtTime(pk * 0.7, t + dur * 0.85);
  } else if (K.env === 'short') {
    eg.linearRampToValueAtTime(pk * 0.7, t + Math.max(a + 0.01, dur * 0.35));
  } else {
    eg.linearRampToValueAtTime(pk * 0.8, t + Math.max(a + 0.01, dur * 0.65));
  }
  eg.linearRampToValueAtTime(0, t + dur);
  head.connect(env); env.connect(v.out);
  src.start(t); src.stop(stopT); track(v, src, stopT);
  // 气声 / 爆破音
  if (S.burst) nz(v, { type: 'bandpass', f: 1500, q: 1, dur: 0.03, a: 0.001, g: S.burst * 0.3 });
  if (S.breath) nz(v, { type: 'bandpass', f: V[0][1], q: 2, dur: 0.12, a: 0.01, g: S.breath * 0.25 });
  if (S.puff) nz(v, { t0: dur * 0.75, type: 'highpass', f: 1500, dur: 0.12, a: 0.005, g: S.puff * 0.3 });
}

// ---------------------------------------------------------------- 音乐乐器

function mKick(v, g) {
  tone(v, { ft: [[0, 150], [0.1, 48]], dur: 0.32, a: 0.002, g });
  nz(v, { type: 'highpass', f: 3000, dur: 0.012, a: 0.001, g: g * 0.2 });
}
function mSnare(v, g) {
  nz(v, { type: 'bandpass', f: 2000, q: 0.8, dur: 0.16, a: 0.001, g });
  tone(v, { type: 'triangle', f: 200, f2: 160, dur: 0.09, g: g * 0.5 });
}
function mClap(v, g) {
  for (let i = 0; i < 3; i++) nz(v, { t0: i * 0.012, type: 'bandpass', f: 1300, q: 1.5, dur: 0.02, a: 0.001, g });
  nz(v, { t0: 0.036, type: 'bandpass', f: 1300, q: 1.5, dur: 0.14, a: 0.001, g: g * 0.7 });
}
function mHat(v, g, open) {
  nz(v, { type: 'highpass', f: 7500, dur: open ? 0.22 : 0.045, a: 0.001, g });
}
function mShaker(v, g) { nz(v, { type: 'highpass', f: 6000, dur: 0.06, a: 0.015, g }); }
function mBlock(v, f, g) { tone(v, { f, dur: 0.05, a: 0.001, g }); tone(v, { f: f * 0.66, dur: 0.04, a: 0.001, g: g * 0.5 }); }
function mBass(v, midi, dur, g, type = 'square') {
  tone(v, { type, f: mtof(midi), dur: dur + 0.05, a: 0.005, hold: dur * 0.6, g,
    filter: { type: 'lowpass', f: 900, f2: 280, q: 4 } });
}
function mMarimba(v, midi, g) {
  const f = mtof(midi);
  tone(v, { f, dur: 0.45, a: 0.002, g });
  tone(v, { f: f * 4, dur: 0.08, a: 0.001, g: g * 0.25 });
}
function mPluck(v, midi, dur, g) {
  tone(v, { type: 'triangle', f: mtof(midi), dur, a: 0.002, g, filter: { type: 'lowpass', f: 3000, f2: 800 } });
}
function mStab(v, notes, dur, g) {
  notes.forEach((m, i) => tone(v, { type: 'sawtooth', f: mtof(m), detune: i % 2 ? 7 : -7, dur: dur + 0.05, a: 0.003,
    hold: dur * 0.3, g, filter: { type: 'lowpass', f: 3200, f2: 700, q: 2 } }));
}
function mLead(v, midi, dur, g) {
  const f = mtof(midi);
  tone(v, { type: 'square', f, dur: dur + 0.08, a: 0.01, hold: dur * 0.7, g, filter: { type: 'lowpass', f: 2800 },
    mod: { rate: 5.5, depth: f * 0.012 } });
  tone(v, { type: 'triangle', f: f * 2, dur: dur + 0.05, a: 0.01, hold: dur * 0.5, g: g * 0.3 });
}
function mCymbal(v, g) { nz(v, { type: 'highpass', f: 5000, dur: 1.5, a: 0.002, g }); }
function mTimp(v, midi, g) { const f = mtof(midi); tone(v, { ft: [[0, f * 1.05], [0.05, f]], dur: 0.6, a: 0.003, g }); }

// 构建 { "bar:step": [midi, lenSteps] }
function phraseMap(list) {
  const m = new Map();
  for (const [b, s, n, l] of list) m.set(b * 16 + s, [n, l]);
  return m;
}

// --- menu: C 大调，弹跳马林巴
const MENU_CH = [
  { b: 36, n: [60, 64, 67] }, { b: 45, n: [57, 60, 64] }, { b: 41, n: [57, 60, 65] }, { b: 43, n: [55, 59, 62] },
  { b: 36, n: [60, 64, 67] }, { b: 40, n: [55, 59, 64] }, { b: 41, n: [57, 60, 65] }, { b: 43, n: [55, 59, 62, 65] },
];
const _ = 0;
const MENU_MEL = [
  [72, _, 76, _, 79, 76, 74, 72], [69, _, 72, _, 76, _, 74, _], [77, _, 76, _, 74, 72, 69, _], [71, _, 74, _, 79, _, _, _],
  [72, _, 76, _, 79, 81, 79, 76], [76, _, 71, _, 79, _, 76, _], [77, 76, 74, 72, 69, _, 72, _], [74, _, 71, _, 67, _, _, _],
];
const MENU_ALT = [
  [84, _, 79, _, 76, _, 79, _], [83, _, 79, _, 76, _, 71, _], [81, _, 77, _, 72, _, 77, 81], [79, 77, 74, 71, 74, _, _, _],
];
const MENU_BASS = { 0: 0, 6: 7, 8: 12, 14: 7 };

// --- battle: A 小调放克
const BAT_CH = [
  { b: 45, n: [57, 60, 64, 67] }, { b: 38, n: [60, 64, 66, 69] }, { b: 45, n: [57, 60, 64, 67] }, { b: 38, n: [60, 64, 66, 69] },
  { b: 41, n: [53, 57, 60, 64] }, { b: 40, n: [56, 59, 62, 64] }, { b: 45, n: [57, 60, 64, 67] }, { b: 40, n: [56, 59, 62, 64] },
];
const BASS_A = { 0: [0, 2], 3: [12, 1], 4: [0, 1], 6: [0, 1], 7: [7, 1], 10: [12, 1], 11: [10, 1], 12: [0, 2], 14: [7, 1], 15: [10, 1] };
const BASS_B = { 0: [0, 3], 4: [12, 1], 6: [0, 1], 8: [0, 2], 10: [7, 1], 11: [12, 1], 13: [10, 1], 14: [7, 1] };
const LEAD_A = phraseMap([
  [0, 0, 81, 2], [0, 3, 79, 1], [0, 4, 76, 2], [0, 8, 74, 1], [0, 10, 76, 2], [0, 14, 72, 2],
  [1, 0, 71, 3], [1, 4, 74, 2], [1, 8, 76, 4], [1, 12, 80, 4],
  [2, 0, 81, 2], [2, 2, 79, 1], [2, 3, 81, 1], [2, 6, 84, 2], [2, 10, 81, 2], [2, 12, 79, 2], [2, 14, 76, 2],
  [3, 0, 74, 2], [3, 2, 76, 2], [3, 4, 80, 4], [3, 8, 83, 6],
]);
const LEAD_B = phraseMap([
  [0, 0, 72, 1], [0, 2, 76, 1], [0, 4, 79, 2], [0, 7, 81, 1], [0, 8, 79, 2], [0, 12, 76, 4],
  [1, 0, 74, 2], [1, 3, 71, 1], [1, 4, 68, 2], [1, 8, 71, 2], [1, 10, 74, 2], [1, 12, 76, 4],
  [2, 0, 76, 1], [2, 1, 79, 1], [2, 2, 81, 2], [2, 6, 81, 1], [2, 7, 84, 2], [2, 10, 81, 2], [2, 12, 79, 1], [2, 13, 76, 3],
  [3, 0, 80, 4], [3, 4, 83, 4], [3, 8, 88, 6],
]);

// --- tense: D 小调，快速
const TEN_CH = [
  { b: 38, n: [62, 65, 69] }, { b: 38, n: [62, 65, 69] }, { b: 34, n: [58, 62, 65] }, { b: 33, n: [57, 61, 64] },
  { b: 38, n: [62, 65, 69] }, { b: 38, n: [62, 65, 69] }, { b: 31, n: [55, 58, 62] }, { b: 33, n: [57, 61, 64, 67] },
];

// --- victory: C 大调号角
const VIC_CH = [
  { b: 36, n: [60, 64, 67] }, { b: 41, n: [57, 60, 65] }, { b: 43, n: [59, 62, 67] }, { b: 36, n: [60, 64, 67] },
  { b: 45, n: [57, 60, 64] }, { b: 41, n: [57, 60, 65] }, { b: 43, n: [59, 62, 67] }, { b: 36, n: [60, 64, 67] },
];
const VIC_LEAD = phraseMap([
  [0, 0, 67, 2], [0, 2, 67, 1], [0, 3, 67, 1], [0, 4, 72, 4], [0, 8, 76, 4], [0, 12, 79, 4],
  [1, 0, 77, 6], [1, 6, 76, 2], [1, 8, 74, 2], [1, 10, 72, 2], [1, 12, 77, 4],
  [2, 0, 79, 6], [2, 6, 77, 2], [2, 8, 76, 2], [2, 10, 74, 2], [2, 12, 71, 4],
  [3, 0, 72, 12],
  [4, 0, 76, 2], [4, 2, 76, 1], [4, 3, 76, 1], [4, 4, 81, 4], [4, 8, 79, 4], [4, 12, 76, 4],
  [5, 0, 77, 4], [5, 4, 81, 4], [5, 8, 84, 6], [5, 14, 81, 2],
  [6, 0, 83, 4], [6, 4, 79, 4], [6, 8, 86, 4], [6, 12, 83, 4],
  [7, 0, 84, 12],
]);

const TRACKS = {
  menu: {
    bpm: 110, bars: 8, swing: 0.1, gain: 1,
    step(v, st, bar, loop, sd) {
      const ch = MENU_CH[bar];
      if (st === 0 || st === 8) mKick(v, 0.3);
      if (st % 4 === 2) mShaker(v, 0.06);
      if (st === 4 || st === 12) { mBlock(v, 1200, 0.07); ch.n.forEach((n) => mPluck(v, n, 0.18, 0.045)); }
      if (st in MENU_BASS) mBass(v, ch.b + MENU_BASS[st], sd * 1.6, 0.22, 'triangle');
      if (st % 2 === 0) {
        const mel = (loop % 2 && bar >= 4) ? MENU_ALT[bar - 4] : MENU_MEL[bar];
        const n = mel[st / 2];
        if (n) mMarimba(v, n + (loop % 4 === 2 ? 12 : 0), 0.18);
      }
    },
  },
  battle: {
    bpm: 128, bars: 8, swing: 0.06, gain: 1,
    step(v, st, bar, loop, sd) {
      const ch = BAT_CH[bar];
      if (st % 4 === 0) mKick(v, 0.55);
      if (bar % 4 === 3 && st === 14) mKick(v, 0.4);
      if (st === 4 || st === 12) { mSnare(v, 0.3); mClap(v, 0.22); }
      if (bar === 7 && st >= 12) mSnare(v, 0.1 + 0.05 * (st - 12));
      if (st % 4 === 2) mHat(v, 0.1, true);
      else mHat(v, st % 2 ? 0.04 : 0.07, false);
      const e = (loop % 2 ? BASS_B : BASS_A)[st];
      if (e) mBass(v, ch.b + e[0], e[1] * sd, 0.26, 'sawtooth');
      const stabs = bar < 4 ? [2, 6, 10, 14] : [3, 6, 10, 13];
      if (stabs.includes(st)) mStab(v, ch.n, sd * 1.1, 0.05);
      if (bar >= 4) {
        const l = (loop % 2 ? LEAD_B : LEAD_A).get((bar - 4) * 16 + st);
        if (l) mLead(v, l[0], l[1] * sd, 0.07);
      } else if (loop % 2 && (st === 0 || st === 3 || st === 6)) {
        mMarimba(v, ch.n[st / 3 | 0] + 12, 0.08);
      }
    },
  },
  tense: {
    bpm: 152, bars: 8, swing: 0, gain: 1,
    step(v, st, bar, loop, sd) {
      const ch = TEN_CH[bar];
      if (st % 4 === 0) mKick(v, 0.55);
      if (bar % 2 && st === 10) mKick(v, 0.4);
      if (st === 4 || st === 12) mSnare(v, 0.3);
      mHat(v, st === 14 ? 0.09 : (st % 2 ? 0.035 : 0.06), st === 14);
      if (st % 2 === 0) mBass(v, ch.b + ((st / 2) % 2 ? 12 : 0), sd * 1.5, 0.26, 'sawtooth');
      else if (st === 15) mBass(v, ch.b + 7, sd * 0.8, 0.18, 'sawtooth');
      const stabs = bar % 2 ? [0, 3, 6, 10, 13] : [0, 3, 6];
      if (stabs.includes(st)) mStab(v, ch.n, sd * 0.9, 0.045);
      if (bar >= 4) {
        const arp = [ch.n[0], ch.n[1], ch.n[2], ch.n[1]];
        const up = (loop % 2 && bar >= 6) ? 24 : 12;
        mLead(v, arp[st % 4] + up, sd * 0.8, 0.035);
      } else if (st % 4 === 0) mBlock(v, 1800, 0.05);
      if (bar === 7 && st === 0) nz(v, { type: 'bandpass', pts: [[0, 400], [16 * sd, 4000]], q: 1.5, dur: 16 * sd, a: 16 * sd * 0.9, g: 0.08 });
    },
  },
  victory: {
    bpm: 116, bars: 8, swing: 0, gain: 1,
    step(v, st, bar, loop, sd) {
      const ch = VIC_CH[bar];
      if (st === 0) {
        ch.n.forEach((n) => brass(v, 0, n, 16 * sd * 0.92, 0.025));
        mTimp(v, ch.b + 12, 0.4);
        if (bar % 4 === 0) mCymbal(v, 0.08);
      }
      if (st === 8) mTimp(v, ch.b + 19, 0.25);
      if (st === 0 || st === 8) mPluck(v, ch.b, sd * 3, 0.22);
      if (st === 12) mPluck(v, ch.b + 7, sd * 2, 0.16);
      if (st === 4 || st === 12) mSnare(v, 0.12);
      if ((bar === 3 || bar === 7) && st >= 12) mTimp(v, ch.b + 12, 0.15 + 0.04 * (st - 12));
      if (st % 2 === 0) mShaker(v, 0.04);
      const l = VIC_LEAD.get(bar * 16 + st);
      if (l) {
        brass(v, 0, l[0], l[1] * sd * 0.9, 0.08);
        if (loop % 2) brass(v, 0, l[0] - 12, l[1] * sd * 0.9, 0.035);
      }
    },
  },
};

// ---------------------------------------------------------------- 音乐调度器（lookahead）

const M = { cur: null, want: null };

function fadeOutNode(out, tc) {
  const now = ctx.currentTime;
  try {
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.setTargetAtTime(0, now, tc);
  } catch (e) { /* ignore */ }
}

function startTrack(name) {
  const now = ctx.currentTime;
  if (M.cur) {
    const old = M.cur;
    fadeOutNode(old.out, 0.35);
    setTimeout(() => { try { old.out.disconnect(); } catch (e) { /* ignore */ } }, 3000);
    M.cur = null;
  }
  const def = name ? TRACKS[name] : null;
  if (!def) return;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(def.gain ?? 1, now + 0.8);
  out.connect(buses.music);
  M.cur = { name, def, out, step: 0, loop: 0, next: now + 0.1, sd: 60 / def.bpm / 4 };
}

function schedMusic() {
  const inst = M.cur;
  if (!inst) return;
  const now = ctx.currentTime;
  if (inst.next < now - 0.1) inst.next = now + 0.05; // 掉帧/后台恢复后重新对齐，不补播
  const total = inst.def.bars * 16;
  let guard = 0;
  while (inst.next < now + LOOKAHEAD && guard++ < 64) {
    const st = inst.step % 16;
    const bar = (inst.step / 16) | 0;
    const swing = st % 2 ? (inst.def.swing || 0) * inst.sd : 0;
    const v = { t: inst.next + swing, out: inst.out, p: 1, srcs: null, end: 0 };
    try { inst.def.step(v, st, bar, inst.loop, inst.sd); } catch (e) { /* ignore */ }
    inst.next += inst.sd;
    if (++inst.step >= total) { inst.step = 0; inst.loop++; }
  }
}

// ---------------------------------------------------------------- 环境音

const A = { cur: null, want: null, intensity: 0.5 };

function ambBase() {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.setTargetAtTime(1, now, 0.6);
  out.connect(buses.amb);
  return { out, srcs: [], tick: null, setI: null };
}
function loopNoise(a, type, f, q, g) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  src.playbackRate.value = rand(0.9, 1.1);
  const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = f; filt.Q.value = q;
  const gain = ctx.createGain(); gain.gain.value = g;
  src.connect(filt); filt.connect(gain); gain.connect(a.out);
  src.start(ctx.currentTime, Math.random() * 1.8);
  a.srcs.push(src);
  return { src, filt, gain };
}
function loopOsc(a, type, f, g, filterF) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filterF;
  const gain = ctx.createGain(); gain.gain.value = g;
  o.connect(fl); fl.connect(gain); gain.connect(a.out);
  o.start(); a.srcs.push(o);
  return { o, gain };
}
function lfo(a, rate, depth, param, type = 'sine') {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = rate;
  const g = ctx.createGain(); g.gain.value = depth;
  o.connect(g); g.connect(param); o.start();
  a.srcs.push(o);
  return g;
}
const setP = (param, val) => param.setTargetAtTime(val, ctx.currentTime, 0.3);
const ev = (a, delay = 0) => ({ t: ctx.currentTime + 0.05 + delay, out: a.out, p: 1, srcs: null, end: 0 });
const chance = (perSec, dt) => Math.random() < perSec * dt;

const AMBIENTS = {
  sea(a) {
    const base = loopNoise(a, 'lowpass', 420, 0.5, 0.35);
    lfo(a, 0.09, 0.2, base.gain.gain);
    const wash = loopNoise(a, 'bandpass', 1400, 0.6, 0.12);
    lfo(a, 0.11, 0.09, wash.gain.gain);
    a.setI = (x) => { setP(base.gain.gain, 0.25 + 0.25 * x); setP(wash.gain.gain, 0.08 + 0.1 * x); };
    a.tick = (now, dt) => {
      if (chance(0.15, dt)) nz(ev(a), { type: 'bandpass', pts: [[0, 500], [0.8, 1800], [2.2, 400]], q: 0.6, dur: 2.2, a: 0.8, g: 0.12 + 0.1 * A.intensity });
      if (chance(0.05, dt)) {
        const v = ev(a), f = rand(1500, 1900);
        for (let i = 0; i < 3; i++) tone(v, { t0: i * 0.18, ft: [[0, f], [0.06, f * 1.15], [0.16, f * 0.85]], dur: 0.16, a: 0.01, g: 0.025, type: 'triangle' });
      }
    };
  },
  storm(a) {
    const rainHi = loopNoise(a, 'highpass', 3000, 0.5, 0.18);
    const rainMid = loopNoise(a, 'bandpass', 1200, 0.7, 0.1);
    const wind = loopNoise(a, 'bandpass', 500, 1.5, 0.25);
    const wf = lfo(a, 0.13, 250, wind.filt.frequency);
    lfo(a, 0.07, 0.12, wind.gain.gain);
    a.setI = (x) => {
      setP(rainHi.gain.gain, 0.1 + 0.25 * x); setP(rainMid.gain.gain, 0.06 + 0.12 * x);
      setP(wind.gain.gain, 0.15 + 0.35 * x); setP(wind.filt.frequency, 400 + 500 * x); setP(wf.gain, 150 + 300 * x);
    };
    a.tick = (now, dt) => {
      if (chance(0.03 + 0.08 * A.intensity, dt)) {
        const v = ev(a, rand(0, 0.3)), d = rand(2.5, 4);
        nz(v, { type: 'highpass', f: 1500, dur: 0.25, a: 0.005, g: 0.15 * A.intensity });
        nz(v, { type: 'lowpass', pts: [[0, 700], [d, 70]], q: 0.7, dur: d, a: 0.05, g: 0.4 + 0.3 * A.intensity });
      }
    };
  },
  wind(a) {
    const w = loopNoise(a, 'bandpass', 450, 1.2, 0.3);
    const wf = lfo(a, 0.1, 200, w.filt.frequency);
    lfo(a, 0.17, 0.1, w.gain.gain);
    const wh = loopNoise(a, 'bandpass', 1300, 12, 0.05);
    lfo(a, 0.07, 300, wh.filt.frequency);
    a.setI = (x) => {
      setP(w.gain.gain, 0.15 + 0.35 * x); setP(w.filt.frequency, 350 + 400 * x);
      setP(wf.gain, 120 + 250 * x); setP(wh.gain.gain, 0.02 + 0.08 * x);
    };
    a.tick = (now, dt) => {
      if (chance(0.1 + 0.3 * A.intensity, dt)) {
        const pts = [[0, 250], [0.6, 700 + 600 * A.intensity], [1.5, 350]];
        nz(ev(a), { type: 'bandpass', pts, q: 1.8, dur: 1.5, a: 0.5, g: 0.15 + 0.3 * A.intensity });
      }
    };
  },
  city(a) {
    const rumble = loopNoise(a, 'lowpass', 180, 0.7, 0.3);
    const hum = loopNoise(a, 'bandpass', 700, 0.8, 0.05);
    lfo(a, 0.05, 0.03, hum.gain.gain);
    a.setI = (x) => { setP(rumble.gain.gain, 0.2 + 0.2 * x); setP(hum.gain.gain, 0.03 + 0.05 * x); };
    a.tick = (now, dt) => {
      if (chance(0.12, dt)) nz(ev(a), { type: 'bandpass', pts: [[0, 300], [1.2, 900], [2.5, 300]], q: 1, dur: 2.5, a: 1.0, g: 0.12 });
      if (chance(0.04, dt)) {
        const v = ev(a), f = rand(380, 460);
        [0, 0.3].forEach((t0) => tone(v, { t0, type: 'square', f, dur: 0.22, a: 0.01, hold: 0.15, g: 0.025, filter: { type: 'lowpass', f: 1800 } }));
        [0, 0.3].forEach((t0) => tone(v, { t0, type: 'square', f: f * 1.25, dur: 0.22, a: 0.01, hold: 0.15, g: 0.02, filter: { type: 'lowpass', f: 1800 } }));
      }
    };
  },
  factory(a) {
    const h1 = loopOsc(a, 'sawtooth', 55, 0.06, 300);
    loopOsc(a, 'sawtooth', 110.4, 0.03, 300);
    const rumble = loopNoise(a, 'lowpass', 300, 0.7, 0.15);
    let nextClank = ctx.currentTime + 0.3, n = 0;
    a.setI = (x) => { setP(rumble.gain.gain, 0.1 + 0.15 * x); setP(h1.gain.gain, 0.04 + 0.05 * x); };
    a.tick = (now, dt) => {
      if (nextClank < now) nextClank = now + 0.05;
      while (nextClank < now + LOOKAHEAD) {
        const v = { t: nextClank, out: a.out, p: 1, srcs: null, end: 0 };
        if (n % 2 === 0) bell(v, 0, 340, 0.3, 0.07, [1, 2.7, 5.1], [1, 0.5, 0.3]);
        else tone(v, { f: 90, f2: 50, dur: 0.2, g: 0.2 });
        nz(v, { type: 'bandpass', f: 2500, q: 2, dur: 0.03, a: 0.001, g: 0.08 });
        nextClank += 60 / 70 / 2; n++;
      }
      if (chance(0.05, dt)) nz(ev(a), { type: 'highpass', f: 4000, dur: 1, a: 0.05, hold: 0.5, g: 0.08 });
    };
  },
  snow(a) {
    const w = loopNoise(a, 'bandpass', 350, 1, 0.12);
    lfo(a, 0.06, 0.06, w.gain.gain);
    const hiss = loopNoise(a, 'highpass', 6000, 0.5, 0.015);
    a.setI = (x) => { setP(w.gain.gain, 0.08 + 0.15 * x); setP(hiss.gain.gain, 0.01 + 0.02 * x); };
    const P = [2093, 2349, 2637, 3136, 3520, 4186];
    a.tick = (now, dt) => {
      if (chance(0.2, dt)) tone(ev(a), { f: P[(Math.random() * P.length) | 0], dur: 1, a: 0.002, g: 0.03 });
    };
  },
};

function startAmbient(name) {
  if (A.cur) {
    const old = A.cur;
    fadeOutNode(old.out, 0.5);
    setTimeout(() => {
      for (const s of old.srcs) { try { s.stop(); } catch (e) { /* ignore */ } }
      try { old.out.disconnect(); } catch (e) { /* ignore */ }
    }, 3000);
    A.cur = null;
  }
  const build = name ? AMBIENTS[name] : null;
  if (!build) return;
  const a = ambBase();
  a.name = name;
  build(a);
  if (a.setI) a.setI(A.intensity);
  A.cur = a;
}

// ---------------------------------------------------------------- 声部管理 / 调度

function pruneVoices(now) {
  for (let i = voices.length - 1; i >= 0; i--) {
    const v = voices[i];
    if (v.end < now - 0.1) {
      try { v.out.disconnect(); if (v.pan) v.pan.disconnect(); } catch (e) { /* ignore */ }
      voices.splice(i, 1);
    }
  }
}

function killVoice(v) {
  const now = ctx.currentTime;
  try {
    v.out.gain.cancelScheduledValues(now);
    v.out.gain.setValueAtTime(v.out.gain.value, now);
    v.out.gain.linearRampToValueAtTime(0, now + 0.02);
  } catch (e) { /* ignore */ }
  for (const s of v.srcs) { try { s.stop(now + 0.03); } catch (e) { /* ignore */ } }
  setTimeout(() => { try { v.out.disconnect(); if (v.pan) v.pan.disconnect(); } catch (e) { /* ignore */ } }, 150);
}

function newVoice(opts) {
  const now = ctx.currentTime;
  pruneVoices(now);
  while (voices.length >= MAX_VOICES) killVoice(voices.shift());
  const out = ctx.createGain();
  out.gain.value = clamp(num(opts.volume, 1), 0, 2);
  let pan = null;
  if (ctx.createStereoPanner) {
    pan = ctx.createStereoPanner();
    pan.pan.value = clamp(num(opts.pan, 0), -1, 1);
    out.connect(pan); pan.connect(buses.sfx);
  } else out.connect(buses.sfx);
  return { t: now + 0.003, out, pan, p: clamp(num(opts.pitch, 1), 0.25, 4), srcs: [], end: now };
}

function canPlay() {
  if (!ctx || !buses) return false;
  if (ctx.state !== 'running') { resume(); return false; }
  return true;
}

function throttled(key) {
  const now = ctx.currentTime;
  const last = lastPlay.get(key);
  if (last !== undefined && now - last < RETRIGGER && now >= last) return true;
  lastPlay.set(key, now);
  return false;
}

function resume() {
  try { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); } catch (e) { /* ignore */ }
}

function tick() {
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (ctx.state !== 'running' || hidden) {
      lastTick = now;
      if (M.cur) M.cur.next = -1; // 恢复后重新对齐
      return;
    }
    schedMusic();
    const dt = clamp(now - lastTick, 0, 0.5);
    lastTick = now;
    if (A.cur && A.cur.tick) { try { A.cur.tick(now, dt); } catch (e) { /* ignore */ } }
    if ((++tickCount & 31) === 0) pruneVoices(now);
  } catch (e) { /* ignore */ }
}

function applyVolumes() {
  if (!ctx || !buses) return;
  const now = ctx.currentTime;
  buses.master.gain.setTargetAtTime(vol.master, now, 0.03);
  buses.music.gain.setTargetAtTime(vol.music, now, 0.03);
  buses.sfx.gain.setTargetAtTime(vol.sfx, now, 0.03);
  buses.amb.gain.setTargetAtTime(vol.ambient != null ? vol.ambient : vol.sfx * 0.7, now, 0.03);
}

function create() {
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  if (!AC) { failed = true; return false; }
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch (e) {
    try { ctx = new AC(); } catch (e2) { ctx = null; failed = true; return false; }
  }
  try {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    const music = ctx.createGain(), sfx = ctx.createGain(), amb = ctx.createGain();
    music.connect(master); sfx.connect(master); amb.connect(master);
    buses = { master, comp, music, sfx, amb };
    master.gain.value = vol.master; music.gain.value = vol.music; sfx.gain.value = vol.sfx;
    amb.gain.value = vol.ambient != null ? vol.ambient : vol.sfx * 0.7;

    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    lastTick = ctx.currentTime;
    timer = setInterval(tick, TICK_MS);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) { resume(); if (M.cur) M.cur.next = -1; }
      });
    }
    if (typeof location !== 'undefined' && String(location.search || '').includes('audiodebug')) {
      window.__audioDebug = { ctx, buses };
    }
  } catch (e) {
    try { ctx.close(); } catch (e2) { /* ignore */ }
    ctx = null; buses = null; failed = true;
    if (timer) { clearInterval(timer); timer = null; }
    return false;
  }
  // init 之前请求的音乐/环境音，在此生效
  if (M.want !== undefined && M.want !== null) startTrack(M.want);
  if (A.want !== undefined && A.want !== null) startAmbient(A.want);
  return true;
}

// ---------------------------------------------------------------- 公共接口

export const audio = {
  init() {
    try {
      if (failed) return false;
      if (!ctx && !create()) return false;
      resume();
      return true;
    } catch (e) { return false; }
  },

  get ready() {
    try { return !!ctx && !!buses && ctx.state === 'running'; } catch (e) { return false; }
  },

  setVolumes(v = {}) {
    try {
      if (!v || typeof v !== 'object') return;
      for (const k of ['master', 'music', 'sfx', 'ambient']) {
        if (typeof v[k] === 'number' && Number.isFinite(v[k])) vol[k] = clamp(v[k], 0, 1);
      }
      applyVolumes();
    } catch (e) { /* ignore */ }
  },

  play(name, opts = {}) {
    try {
      if (!canPlay()) return;
      if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SFX, name)) return;
      if (throttled(name)) return;
      const v = newVoice(opts || {});
      SFX[name](v);
      voices.push(v);
    } catch (e) { /* ignore */ }
  },

  vocal(species, kind, opts = {}) {
    try {
      if (!canPlay()) return;
      const sp = Object.prototype.hasOwnProperty.call(SPECIES, species) ? species : 'dog';
      const k = Object.prototype.hasOwnProperty.call(KINDS, kind) ? kind : 'effort';
      if (throttled('vocal:' + sp)) return;
      const o = opts || {};
      const v = newVoice(o);
      v.p *= 1 + (Math.random() * 2 - 1) * 0.06;
      voiceSynth(v, sp, k);
      voices.push(v);
    } catch (e) { /* ignore */ }
  },

  music(track) {
    try {
      const name = track && Object.prototype.hasOwnProperty.call(TRACKS, track) ? track : null;
      if (track && !name) return; // 未知曲目：忽略
      M.want = name;
      if (!ctx || !buses) return;
      if ((M.cur ? M.cur.name : null) === name) return;
      startTrack(name);
    } catch (e) { /* ignore */ }
  },

  ambient(name) {
    try {
      const n = name && Object.prototype.hasOwnProperty.call(AMBIENTS, name) ? name : null;
      if (name && !n) return;
      A.want = n;
      if (!ctx || !buses) return;
      if ((A.cur ? A.cur.name : null) === n) return;
      startAmbient(n);
    } catch (e) { /* ignore */ }
  },

  setAmbientIntensity(x) {
    try {
      A.intensity = clamp(num(x, 0.5), 0, 1);
      if (ctx && A.cur && A.cur.setI) A.cur.setI(A.intensity);
    } catch (e) { /* ignore */ }
  },
};

export default audio;
