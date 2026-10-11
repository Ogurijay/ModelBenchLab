/*
 * audio.js — fully procedural sound for the Little Fighter 2 remake.
 *
 * Everything is synthesized at runtime with the Web Audio API: no asset files,
 * no dependencies. Two halves:
 *
 *   1. SFX   — tiny voice builders (oscillators + shared noise buffers + envelopes),
 *              polyphony capped at MAX_VOICES (oldest voice is stolen).
 *   2. Music — original compositions in a 90s PC-MIDI action style, played by a
 *              16th-note step sequencer with a lookahead scheduler
 *              (setInterval 25 ms, notes scheduled ~0.15 s ahead on ctx.currentTime).
 *
 * Graph:  voices ─► sfxBus ─┐
 *         tracks ─► musicBus ┴─► master (mute) ─► compressor ─► soft clip ─► destination
 *
 * Every public call is no-throw. Without an AudioContext (Node, old browsers) the
 * module is inert; while the context is suspended SFX are dropped and the
 * requested music track is remembered and started once the context runs.
 */

// ───────────────────────────────────────────────────────────── state ──
const MAX_VOICES = 24;
const TICK_MS = 25;
const LOOKAHEAD = 0.15;
const LOOKAHEAD_HIDDEN = 1.2; // background tabs throttle timers to ~1 s

let ctx = null;
let master = null, comp = null, musicBus = null, sfxBus = null, clipIn = null, clip = null;
let bufs = null;   // shared noise buffers { w: white, b: brown, c: crackle }
let waves = null;  // shared PeriodicWaves { pulse25, pulse12 }
const curves = Object.create(null);

let musicVol = 0.45, sfxVol = 0.8, muted = false;
let wantTrack = null; // track requested by the game (may be pending until unlock)
let cur = null;       // currently playing track instance
let timer = null;
let hooked = false, primed = false;

const voices = [];
const lastFire = Object.create(null);
const compiled = Object.create(null);

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const running = () => !!ctx && ctx.state === 'running';
const nyq = () => ctx.sampleRate * 0.45;
const OSC_TYPES = { sine: 1, square: 1, sawtooth: 1, triangle: 1 };

function off(n) { try { n.disconnect(); } catch (e) { /* already gone */ } }
function clean(src, nodes) { src.onended = () => { for (const n of nodes) off(n); }; }

// ───────────────────────────────────────────────────────────── setup ──
function getAC() {
  const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null;
  return (g && (g.AudioContext || g.webkitAudioContext)) || null;
}

function initCtx() {
  if (ctx) return ctx;
  const AC = getAC();
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) {
    try { ctx = new AC(); } catch (e2) { ctx = null; return null; }
  }
  try { buildGraph(); } catch (e) {
    try { ctx.close(); } catch (e2) { /* ignore */ }
    ctx = null;
    return null;
  }
  try {
    if (ctx.addEventListener) ctx.addEventListener('statechange', onState);
    else ctx.onstatechange = onState;
  } catch (e) { /* ignore */ }
  hookGestures();
  onState();
  return ctx;
}

function buildGraph() {
  comp = ctx.createDynamicsCompressor();
  const cp = { threshold: -16, knee: 8, ratio: 6, attack: 0.002, release: 0.22 };
  for (const k in cp) { try { comp[k].value = cp[k]; } catch (e) { /* ignore */ } }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  musicBus = ctx.createGain();
  musicBus.gain.value = musicVol;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxVol;
  musicBus.connect(master);
  sfxBus.connect(master);
  // unity below ~-1.4 dBFS, smooth saturation above: a cheap safety limiter
  clipIn = ctx.createGain();
  clipIn.gain.value = 0.5;
  clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  master.connect(comp);
  comp.connect(clipIn);
  clipIn.connect(clip);
  clip.connect(ctx.destination);
  bufs = makeNoise();
  waves = { pulse25: pulseWave(0.25), pulse12: pulseWave(0.125) };
}

function makeNoise() {
  const sr = ctx.sampleRate, n = Math.floor(sr);
  const w = ctx.createBuffer(1, n, sr), b = ctx.createBuffer(1, n, sr), c = ctx.createBuffer(1, n, sr);
  const wd = w.getChannelData(0), bd = b.getChannelData(0), cd = c.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 2 - 1;
    wd[i] = r;
    last = (last + 0.02 * r) / 1.02;
    bd[i] = last * 3.5;
  }
  // crackle: sparse decaying grains (fire, ice, cracks)
  let i = 0;
  while (i < n) {
    i += 40 + Math.floor(Math.random() * 650);
    const len = 15 + Math.floor(Math.random() * 90), amp = 0.25 + Math.random() * 0.75;
    for (let j = 0; j < len && i + j < n; j++) {
      const k = 1 - j / len;
      cd[i + j] = (Math.random() * 2 - 1) * amp * k * k;
    }
  }
  return { w, b, c };
}

function pulseWave(duty) {
  const N = 48, re = new Float32Array(N), im = new Float32Array(N);
  for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(re, im);
}

function setWave(o, w) {
  if (waves && waves[w]) o.setPeriodicWave(waves[w]);
  else o.type = OSC_TYPES[w] ? w : 'square';
}

function driveCurve(k) {
  if (curves[k]) return curves[k];
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return (curves[k] = c);
}

// curve input x spans [-1, 1] = signal [-2, 2] (clipIn halves it); identity up to 0.85
function softClipCurve() {
  const n = 2048, c = new Float32Array(n), K = 0.85, R = 1 - K;
  for (let i = 0; i < n; i++) {
    const u = ((i * 2) / (n - 1) - 1) * 2, a = Math.abs(u);
    c[i] = Math.sign(u) * (a <= K ? a : K + R * Math.tanh((a - K) / R));
  }
  return c;
}

function hookGestures() {
  if (hooked || typeof window === 'undefined' || !window.addEventListener) return;
  hooked = true;
  const h = () => { if (!running()) audio.unlock(); };
  for (const ev of ['pointerdown', 'mousedown', 'keydown', 'touchend']) {
    try { window.addEventListener(ev, h, { capture: true, passive: true }); } catch (e) { /* ignore */ }
  }
}

function onState() {
  if (!running()) return;
  if (wantTrack && (!cur || cur.id !== wantTrack)) startTrack(wantTrack);
  else if (cur) ensureTimer();
}

// ═══════════════════════════════════════════════════════════════ SFX ══
// Voice builders. All times / frequencies are given at pitch = 1 and are scaled
// by the voice's playback-rate multiplier (freq × p, time ÷ p).

function makeVoice(opts, level) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const p = clamp(num(o.pitch, 1), 0.25, 4);
  const vol = clamp(num(o.vol, 1), 0, 2) * level;
  const pan = clamp(num(o.pan, 0), -1, 1);
  const out = ctx.createGain();
  out.gain.value = vol;
  const v = { t0: ctx.currentTime + 0.004, p, ts: 1 / p, out, nodes: [out], srcs: [], end: 0, last: null, done: false };
  if (pan && ctx.createStereoPanner) {
    const pn = ctx.createStereoPanner();
    pn.pan.value = pan;
    out.connect(pn);
    pn.connect(sfxBus);
    v.nodes.push(pn);
  } else out.connect(sfxBus);
  return v;
}

function addSrc(v, s, stopAt) {
  v.srcs.push(s);
  v.nodes.push(s);
  if (stopAt >= v.end) { v.end = stopAt; v.last = s; }
}

// param automation: base is a number or [[t, value], ...] (exp ramps between points)
function setF(param, v, T, base, to, toT, lin, k, lo, hi) {
  if (Array.isArray(base)) {
    for (let i = 0; i < base.length; i++) {
      const x = clamp(base[i][1] * k, lo, hi), at = T + base[i][0] * v.ts;
      if (i === 0) param.setValueAtTime(x, at);
      else param.exponentialRampToValueAtTime(x, at);
    }
  } else {
    param.setValueAtTime(clamp(num(base, 440) * k, lo, hi), T);
    if (typeof to === 'number') {
      const x = clamp(to * k, lo, hi);
      if (lin) param.linearRampToValueAtTime(x, toT);
      else param.exponentialRampToValueAtTime(x, toT);
    }
  }
}

function envG(v, T, D, o) {
  const e = ctx.createGain();
  v.nodes.push(e);
  const g = Math.max(0.0002, num(o.g, 0.3));
  const a = Math.min(num(o.a, 0.002) * v.ts, D * 0.5);
  const h = Math.min(num(o.h, 0) * v.ts, Math.max(0, D - a - 0.005));
  e.gain.setValueAtTime(0.0001, T);
  e.gain.linearRampToValueAtTime(g, T + a);
  if (h > 0) e.gain.setValueAtTime(g, T + a + h);
  e.gain.exponentialRampToValueAtTime(0.0001, T + D);
  return e;
}

function lfo(v, T, D, param, rate, depth, type) {
  const l = ctx.createOscillator();
  l.type = type || 'sine';
  l.frequency.value = rate * v.p;
  const lg = ctx.createGain();
  lg.gain.value = depth;
  l.connect(lg);
  lg.connect(param);
  l.start(T);
  l.stop(T + D + 0.02);
  v.nodes.push(lg);
  addSrc(v, l, T + D + 0.02);
}

function tremolo(v, T, D, trem, dest) {
  const tg = ctx.createGain();
  tg.gain.value = 1 - trem[1] / 2;
  tg.connect(dest);
  v.nodes.push(tg);
  lfo(v, T, D, tg.gain, trem[0], trem[1] / 2);
  return tg;
}

function filt(v, T, o, src) {
  if (!o.ft) return src;
  const f = ctx.createBiquadFilter();
  f.type = o.ft;
  f.Q.value = num(o.fq, o.ft === 'bandpass' ? 1 : 0.7);
  setF(f.frequency, v, T, o.ff == null ? 1000 : o.ff, o.ff2, T + num(o.fd, num(o.d, 0.1)) * v.ts, false, v.p, 20, nyq());
  if (o.flfo) lfo(v, T, num(o.d, 0.1) * v.ts, f.frequency, o.flfo[0], o.flfo[1] * v.p);
  src.connect(f);
  v.nodes.push(f);
  return f;
}

function finishChain(v, T, D, o, node) {
  const e = envG(v, T, D, o);
  node.connect(e);
  const dest = o.to || v.out;
  if (o.trem) e.connect(tremolo(v, T, D, o.trem, dest));
  else e.connect(dest);
}

// oscillator layer
function tone(v, o) {
  const T = v.t0 + num(o.t, 0) * v.ts, D = Math.max(0.01, num(o.d, 0.1) * v.ts);
  const s = ctx.createOscillator();
  setWave(s, o.w);
  setF(s.frequency, v, T, o.f, o.f2, T + num(o.fd, num(o.d, 0.1)) * v.ts, o.lin, v.p, 1, nyq());
  if (o.det) s.detune.value = o.det;
  if (o.vib) lfo(v, T, D, s.detune, o.vib[0], o.vib[1]);
  finishChain(v, T, D, o, filt(v, T, o, s));
  s.start(T);
  s.stop(T + D + 0.02);
  addSrc(v, s, T + D + 0.02);
}

// noise layer (b: 'w' white | 'b' brown | 'c' crackle)
function nz(v, o) {
  const T = v.t0 + num(o.t, 0) * v.ts, D = Math.max(0.01, num(o.d, 0.1) * v.ts);
  const buf = bufs[o.b] || bufs.w;
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.setValueAtTime(clamp(num(o.r, 1) * v.p, 0.05, 16), T);
  if (o.r2) s.playbackRate.exponentialRampToValueAtTime(clamp(o.r2 * v.p, 0.05, 16), T + D);
  finishChain(v, T, D, o, filt(v, T, o, s));
  s.start(T, Math.random() * (buf.duration - 0.1));
  s.stop(T + D + 0.02);
  addSrc(v, s, T + D + 0.02);
}

// soft-clip stage feeding the voice output; layers route into it via { to }
function drive(v, k) {
  const ws = ctx.createWaveShaper();
  ws.curve = driveCurve(k);
  ws.connect(v.out);
  v.nodes.push(ws);
  return ws;
}

// sawtooth through parallel band-passes: a crude vowel ("GO!")
function formant(v, o) {
  const T = v.t0 + num(o.t, 0) * v.ts, D = Math.max(0.05, num(o.d, 0.4) * v.ts);
  const s = ctx.createOscillator();
  s.type = 'sawtooth';
  setF(s.frequency, v, T, o.f, null, 0, false, v.p, 1, nyq());
  if (o.vib) lfo(v, T, D, s.detune, o.vib[0], o.vib[1]);
  const e = envG(v, T, D, o);
  for (const [fs, q, g] of o.fm) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    setF(bp.frequency, v, T, fs, null, 0, false, v.p, 20, nyq());
    const fg = ctx.createGain();
    fg.gain.value = g;
    s.connect(bp);
    bp.connect(fg);
    fg.connect(e);
    v.nodes.push(bp, fg);
  }
  e.connect(o.to || v.out);
  s.start(T);
  s.stop(T + D + 0.02);
  addSrc(v, s, T + D + 0.02);
}

// little melodic phrases for jingles: list of [beat, note, beats, gainMul]
function seq(v, bpm, list, o) {
  const b = 60 / bpm;
  for (const [beat, note, len, gm] of list) {
    const m = typeof note === 'number' ? note : n2m(note);
    if (m == null) continue;
    const d = len * b;
    tone(v, {
      w: o.w, ft: o.ft, ff: o.ff, fq: o.fq, a: o.a == null ? 0.006 : o.a,
      f: mtof(m + (o.tr || 0)), t: beat * b, d: d + (o.rel == null ? 0.09 : o.rel), h: d * 0.75,
      g: num(o.g, 0.15) * num(gm, 1), vib: d > 0.25 ? o.vib : null,
    });
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);

const SFX = {
  // ─── hits ───
  hit_light(v) {
    tone(v, { w: 'sine', f: 190, f2: 55, d: 0.09, g: 0.75 });
    tone(v, { w: 'square', f: 760, f2: 170, d: 0.03, g: 0.16, ft: 'lowpass', ff: 3000 });
    nz(v, { ft: 'bandpass', ff: 1900, fq: 1.1, d: 0.065, g: 0.85 });
    nz(v, { ft: 'highpass', ff: 4200, d: 0.022, g: 0.35 });
  },
  hit_heavy(v) {
    const dr = drive(v, 6);
    tone(v, { w: 'sine', f: 135, f2: 30, d: 0.36, g: 1 });
    tone(v, { w: 'square', f: 190, f2: 42, d: 0.13, g: 0.3, ft: 'lowpass', ff: 1400, to: dr });
    nz(v, { ft: 'lowpass', ff: 3200, ff2: 260, d: 0.17, g: 0.9, to: dr });
    nz(v, { b: 'b', ft: 'lowpass', ff: 650, d: 0.32, g: 0.85 });
    nz(v, { ft: 'highpass', ff: 3500, d: 0.025, g: 0.4 });
  },
  hit_sharp(v) {
    nz(v, { ft: 'bandpass', ff: 7500, ff2: 1800, fq: 2.2, d: 0.11, g: 0.85 });
    nz(v, { ft: 'highpass', ff: 5200, d: 0.03, g: 0.5 });
    tone(v, { w: 'triangle', f: 2630, t: 0.005, d: 0.2, g: 0.12 });
    tone(v, { w: 'square', f: 3710, d: 0.1, g: 0.045, ft: 'highpass', ff: 3000 });
    tone(v, { w: 'sine', f: 210, f2: 80, d: 0.06, g: 0.4 });
  },
  hit_blunt(v) {
    tone(v, { w: 'triangle', f: 560, f2: 430, d: 0.1, g: 0.6 });
    tone(v, { w: 'sine', f: 890, f2: 780, d: 0.06, g: 0.25 });
    tone(v, { w: 'sine', f: 165, f2: 70, d: 0.11, g: 0.6 });
    nz(v, { ft: 'bandpass', ff: 1300, fq: 3, d: 0.045, g: 0.6 });
  },
  block(v) {
    tone(v, { w: 'square', f: 330, f2: 240, d: 0.04, g: 0.22, ft: 'lowpass', ff: 1400 });
    tone(v, { w: 'sine', f: 125, f2: 80, d: 0.05, g: 0.3 });
    nz(v, { ft: 'bandpass', ff: 950, fq: 2, d: 0.03, g: 0.4 });
  },
  break_defend(v) {
    nz(v, { b: 'c', ft: 'highpass', ff: 1500, d: 0.26, g: 0.95 });
    nz(v, { ft: 'bandpass', ff: 3200, ff2: 850, fq: 1.5, d: 0.13, g: 0.6 });
    tone(v, { w: 'square', f: 1450, f2: 190, d: 0.13, g: 0.17, ft: 'lowpass', ff: 4000 });
    tone(v, { w: 'triangle', f: 2150, f2: 1300, t: 0.02, d: 0.2, g: 0.14 });
    tone(v, { w: 'sine', f: 150, f2: 48, d: 0.2, g: 0.6 });
  },

  // ─── movement ───
  swing(v) {
    nz(v, { ft: 'bandpass', fq: 1.4, ff: [[0, 450], [0.08, 2400], [0.17, 700]], d: 0.17, a: 0.05, g: 0.7 });
  },
  swing_heavy(v) {
    nz(v, { ft: 'bandpass', fq: 1.2, ff: [[0, 260], [0.13, 1500], [0.27, 340]], d: 0.28, a: 0.08, g: 0.95 });
    tone(v, { w: 'sine', f: 95, f2: 60, d: 0.25, a: 0.06, g: 0.22 });
  },
  jump(v) {
    nz(v, { ft: 'bandpass', fq: 1, ff: [[0, 800], [0.11, 2300]], d: 0.12, a: 0.02, g: 0.35 });
    tone(v, { w: 'pulse25', f: 260, f2: 580, d: 0.09, g: 0.1, ft: 'lowpass', ff: 2000 });
  },
  land(v) {
    tone(v, { w: 'sine', f: 140, f2: 50, d: 0.1, g: 0.6 });
    nz(v, { ft: 'lowpass', ff: 900, ff2: 200, d: 0.08, g: 0.6 });
  },
  dash(v) {
    nz(v, { ft: 'bandpass', fq: 1.5, ff: [[0, 900], [0.13, 3200]], d: 0.15, a: 0.02, g: 0.6 });
    nz(v, { ft: 'lowpass', ff: 500, d: 0.1, g: 0.3 });
  },
  roll(v) {
    for (let i = 0; i < 3; i++) {
      tone(v, { w: 'sine', f: 120, f2: 60, t: i * 0.09, d: 0.07, g: 0.35 - i * 0.06 });
      nz(v, { ft: 'lowpass', ff: 1200, ff2: 400, t: i * 0.09, d: 0.07, g: 0.3 });
    }
    nz(v, { ft: 'bandpass', ff: 2000, fq: 0.7, d: 0.28, a: 0.05, g: 0.14 });
  },
  fall_ground(v) {
    const dr = drive(v, 3);
    tone(v, { w: 'sine', f: 110, f2: 30, d: 0.36, g: 1 });
    nz(v, { b: 'b', ft: 'lowpass', ff: 900, ff2: 120, d: 0.3, g: 1, to: dr });
    nz(v, { ft: 'bandpass', ff: 700, fq: 1, d: 0.08, g: 0.6 });
    tone(v, { w: 'square', f: 70, f2: 38, d: 0.15, g: 0.15, ft: 'lowpass', ff: 600, to: dr });
  },
  step(v) {
    nz(v, { ft: 'lowpass', ff: 520, d: 0.04, g: 0.12 });
    tone(v, { w: 'sine', f: 95, f2: 60, d: 0.04, g: 0.08 });
  },

  // ─── specials ───
  ball_launch(v) {
    tone(v, { w: 'square', f: 1500, f2: 280, d: 0.16, g: 0.2, ft: 'lowpass', ff: 5000 });
    tone(v, { w: 'sawtooth', f: 820, f2: 140, d: 0.21, g: 0.16, vib: [38, 300] });
    tone(v, { w: 'sine', f: 320, f2: 100, d: 0.11, g: 0.32 });
    nz(v, { ft: 'highpass', ff: 3000, d: 0.05, g: 0.35 });
  },
  ball_hit(v) {
    const dr = drive(v, 3);
    nz(v, { ft: 'lowpass', ff: 4000, ff2: 250, d: 0.32, g: 0.9, to: dr });
    tone(v, { w: 'square', f: 700, f2: 60, d: 0.22, g: 0.18, to: dr });
    tone(v, { w: 'sine', f: 115, f2: 30, d: 0.3, g: 0.8 });
    nz(v, { b: 'c', ft: 'highpass', ff: 2000, d: 0.3, g: 0.45 });
  },
  fire(v) {
    nz(v, { ft: 'bandpass', fq: 0.8, ff: [[0, 500], [0.15, 1800], [0.36, 700]], d: 0.36, a: 0.04, g: 0.75 });
    nz(v, { b: 'c', ft: 'highpass', ff: 1800, d: 0.35, g: 0.65 });
    tone(v, { w: 'sawtooth', f: 90, f2: 70, d: 0.3, g: 0.12, ft: 'lowpass', ff: 400 });
  },
  burn(v) {
    nz(v, { b: 'c', ft: 'highpass', ff: 1200, d: 0.45, a: 0.02, g: 0.85 });
    nz(v, { ft: 'bandpass', fq: 0.9, ff: [[0, 400], [0.3, 1600]], d: 0.3, a: 0.08, g: 0.5 });
    nz(v, { b: 'b', ft: 'lowpass', ff: 700, d: 0.4, a: 0.05, g: 0.4 });
  },
  inferno(v) {
    nz(v, { b: 'b', ft: 'lowpass', ff: 1400, d: 0.66, a: 0.04, h: 0.35, g: 0.9, trem: [13, 0.35] });
    nz(v, { ft: 'bandpass', fq: 0.7, ff: [[0, 600], [0.3, 1400], [0.66, 500]], d: 0.66, a: 0.05, h: 0.3, g: 0.6 });
    nz(v, { b: 'c', ft: 'highpass', ff: 1500, d: 0.66, h: 0.4, g: 0.7 });
    tone(v, { w: 'sawtooth', f: 70, f2: 55, d: 0.6, a: 0.05, h: 0.3, g: 0.14, ft: 'lowpass', ff: 300 });
  },
  ice(v) {
    [1318.5, 1975.5, 2637, 3322.4].forEach((f, i) => tone(v, { w: 'triangle', f, t: i * 0.04, d: 0.38, g: 0.16 }));
    tone(v, { w: 'sine', f: 5274, t: 0.1, d: 0.3, g: 0.05 });
    nz(v, { ft: 'highpass', ff: 6000, d: 0.25, g: 0.28 });
    tone(v, { w: 'sine', f: 400, f2: 180, d: 0.08, g: 0.25 });
  },
  freeze(v) {
    nz(v, { b: 'c', ft: 'highpass', ff: 3000, d: 0.4, g: 0.75 });
    tone(v, { w: 'sine', f: 700, f2: 2600, d: 0.35, g: 0.14 });
    tone(v, { w: 'square', f: 1800, f2: 3200, d: 0.3, g: 0.035, ft: 'highpass', ff: 2000, vib: [30, 100] });
    nz(v, { ft: 'bandpass', ff: 5000, fq: 4, d: 0.36, a: 0.1, g: 0.32 });
  },
  shatter(v) {
    nz(v, { ft: 'highpass', ff: 3500, d: 0.25, g: 0.8 });
    nz(v, { b: 'c', ft: 'highpass', ff: 2500, d: 0.36, g: 0.7 });
    for (let i = 0; i < 7; i++) tone(v, { w: 'sine', f: rnd(2000, 6500), t: rnd(0, 0.13), d: rnd(0.08, 0.2), g: 0.11 });
    tone(v, { w: 'sine', f: 200, f2: 90, d: 0.08, g: 0.35 });
  },
  explosion(v) {
    const dr = drive(v, 5);
    nz(v, { b: 'b', ft: 'lowpass', ff: [[0, 2500], [0.95, 90]], d: 1.0, h: 0.05, g: 1.1, to: dr });
    tone(v, { w: 'sine', f: 95, f2: 24, d: 0.7, g: 1 });
    nz(v, { ft: 'lowpass', ff: 6000, ff2: 800, d: 0.18, g: 0.9 });
    nz(v, { b: 'c', ft: 'bandpass', ff: 1200, fq: 0.5, t: 0.05, d: 0.8, g: 0.5 });
    tone(v, { w: 'square', f: 60, f2: 30, d: 0.4, g: 0.12, ft: 'lowpass', ff: 400, to: dr });
  },
  heal(v) {
    [1046.5, 1318.5, 1568, 2093, 2637, 3136].forEach((f, i) => tone(v, { w: 'triangle', f, t: i * 0.05, d: 0.32, g: 0.13 }));
    tone(v, { w: 'sine', f: 523, f2: 1046, d: 0.45, a: 0.1, g: 0.1, vib: [7, 30] });
    nz(v, { ft: 'highpass', ff: 7000, d: 0.5, a: 0.15, g: 0.12 });
  },
  teleport(v) {
    tone(v, { w: 'square', f: [[0, 180], [0.15, 2200], [0.31, 300]], d: 0.32, g: 0.12, vib: [24, 250], ft: 'lowpass', ff: 4000 });
    tone(v, { w: 'sine', f: [[0, 2400], [0.15, 300], [0.31, 1800]], d: 0.32, g: 0.15 });
    nz(v, { ft: 'bandpass', fq: 6, ff: [[0, 500], [0.3, 6000]], d: 0.3, a: 0.1, g: 0.32 });
  },
  disk(v) {
    tone(v, { w: 'sawtooth', f: 170, f2: 150, d: 0.45, a: 0.03, h: 0.25, g: 0.28, ft: 'bandpass', ff: 900, fq: 2, trem: [22, 0.8] });
    tone(v, { w: 'sine', f: 340, d: 0.45, a: 0.03, h: 0.25, g: 0.1, trem: [22, 0.6] });
    nz(v, { ft: 'bandpass', ff: 2500, fq: 3, d: 0.4, a: 0.05, g: 0.16, trem: [22, 0.7] });
  },
  shield(v) {
    tone(v, { w: 'sine', f: 320, d: 0.5, a: 0.08, h: 0.2, g: 0.22 });
    tone(v, { w: 'sine', f: 323.5, d: 0.5, a: 0.08, h: 0.2, g: 0.22 });
    tone(v, { w: 'triangle', f: 640, d: 0.5, a: 0.08, h: 0.2, g: 0.11, vib: [9, 40] });
    tone(v, { w: 'pulse12', f: 1280, f2: 1600, d: 0.3, g: 0.04 });
    nz(v, { ft: 'bandpass', ff: [[0, 1500], [0.45, 4000]], fq: 5, d: 0.45, a: 0.1, g: 0.28 });
  },
  whirlwind(v) {
    nz(v, { ft: 'bandpass', fq: 3, ff: 900, d: 0.85, a: 0.12, h: 0.45, g: 0.85, flfo: [5, 650] });
    nz(v, { ft: 'bandpass', fq: 2, ff: 2200, d: 0.8, a: 0.15, h: 0.4, g: 0.42, flfo: [7.3, 1000] });
    nz(v, { b: 'b', ft: 'lowpass', ff: 500, d: 0.8, a: 0.1, h: 0.4, g: 0.4 });
  },
  thunder(v) {
    nz(v, { ft: 'highpass', ff: 1800, d: 0.05, g: 1 });
    nz(v, { b: 'c', ft: 'bandpass', ff: 3000, fq: 0.6, d: 0.3, g: 1, trem: [45, 0.9] });
    tone(v, { w: 'sawtooth', f: 55, f2: 45, d: 0.25, g: 0.18, trem: [60, 0.9], ft: 'lowpass', ff: 1500 });
    nz(v, { b: 'b', ft: 'lowpass', ff: 600, ff2: 100, t: 0.03, d: 0.7, g: 0.9 });
    tone(v, { w: 'square', f: 2400, f2: 400, d: 0.08, g: 0.1 });
  },
  arrow(v) {
    tone(v, { w: 'triangle', f: 190, f2: 175, d: 0.18, g: 0.45 });
    tone(v, { w: 'sawtooth', f: 380, f2: 350, d: 0.08, g: 0.1, ft: 'lowpass', ff: 2000 });
    nz(v, { ft: 'bandpass', ff: 2500, fq: 1, d: 0.04, g: 0.3 });
    tone(v, { w: 'sine', f: 2600, f2: 1700, t: 0.03, d: 0.28, a: 0.03, g: 0.09, vib: [14, 40] });
    nz(v, { ft: 'bandpass', ff: [[0, 3000], [0.28, 1800]], fq: 8, t: 0.03, d: 0.28, a: 0.05, g: 0.28 });
  },
  shuriken(v) {
    tone(v, { w: 'square', f: 3300, d: 0.07, g: 0.07, ft: 'highpass', ff: 2500 });
    tone(v, { w: 'sine', f: 4720, d: 0.12, g: 0.12 });
    tone(v, { w: 'sine', f: 6150, t: 0.01, d: 0.09, g: 0.08 });
    nz(v, { ft: 'highpass', ff: 6000, d: 0.03, g: 0.4 });
    nz(v, { ft: 'bandpass', ff: [[0, 4000], [0.15, 6000]], fq: 4, t: 0.02, d: 0.15, a: 0.02, g: 0.22 });
  },
  sword(v) {
    nz(v, { ft: 'bandpass', fq: 1.5, ff: [[0, 700], [0.07, 3500], [0.16, 1200]], d: 0.16, a: 0.03, g: 0.65 });
    tone(v, { w: 'sine', f: 1760, t: 0.04, d: 0.45, a: 0.01, g: 0.1 });
    tone(v, { w: 'sine', f: 2648, t: 0.04, d: 0.38, g: 0.07 });
    tone(v, { w: 'sine', f: 3950, t: 0.04, d: 0.3, g: 0.05 });
    tone(v, { w: 'triangle', f: 1180, t: 0.04, d: 0.35, g: 0.05, vib: [6, 15] });
  },
  charge(v) {
    tone(v, { w: 'sawtooth', f: 110, f2: 880, d: 0.6, a: 0.05, g: 0.17, ft: 'lowpass', ff: [[0, 500], [0.6, 4000]], trem: [16, 0.6] });
    tone(v, { w: 'square', f: 220, f2: 1760, d: 0.6, a: 0.05, g: 0.05, trem: [16, 0.6] });
    nz(v, { ft: 'bandpass', ff: [[0, 400], [0.6, 5000]], fq: 4, d: 0.6, a: 0.2, g: 0.26 });
    tone(v, { w: 'sine', f: 1760, t: 0.52, d: 0.2, g: 0.14 });
  },
  transform(v) {
    tone(v, { w: 'sawtooth', f: [[0, 150], [0.35, 900], [0.72, 260]], d: 0.72, a: 0.05, g: 0.12, vib: [11, 120], ft: 'lowpass', ff: 2500 });
    tone(v, { w: 'sawtooth', f: [[0, 152], [0.35, 912], [0.72, 263]], d: 0.72, a: 0.05, g: 0.12, ft: 'lowpass', ff: 2500 });
    tone(v, { w: 'pulse25', f: [[0, 600], [0.35, 180], [0.72, 1200]], d: 0.72, g: 0.05 });
    nz(v, { ft: 'bandpass', fq: 3, ff: [[0, 300], [0.35, 4000], [0.72, 800]], d: 0.72, a: 0.2, g: 0.32 });
  },
  dragon(v) {
    const dr = drive(v, 2);
    nz(v, { ft: 'bandpass', fq: 0.9, ff: [[0, 200], [0.2, 2600], [0.42, 600]], d: 0.42, a: 0.06, g: 1, to: dr });
    tone(v, { w: 'sawtooth', f: 70, f2: 420, d: 0.35, a: 0.04, g: 0.15, ft: 'lowpass', ff: 1500 });
    tone(v, { w: 'sine', f: 150, f2: 45, d: 0.25, g: 0.6 });
    nz(v, { b: 'c', ft: 'highpass', ff: 2000, t: 0.05, d: 0.4, g: 0.42 });
  },
  kick(v) {
    nz(v, { ft: 'bandpass', fq: 1.3, ff: [[0, 700], [0.08, 2200]], d: 0.09, a: 0.015, g: 0.45 });
    tone(v, { w: 'sine', f: 175, f2: 60, t: 0.03, d: 0.08, g: 0.55 });
    nz(v, { ft: 'bandpass', ff: 1500, fq: 1, t: 0.03, d: 0.035, g: 0.45 });
  },

  // ─── items ───
  pick(v) {
    tone(v, { w: 'pulse25', f: 740, d: 0.05, g: 0.14 });
    tone(v, { w: 'pulse25', f: 1480, t: 0.045, d: 0.09, g: 0.14 });
    nz(v, { ft: 'bandpass', ff: 2000, d: 0.03, g: 0.2 });
  },
  throw(v) {
    nz(v, { ft: 'bandpass', fq: 1.2, ff: [[0, 2400], [0.16, 700]], d: 0.16, a: 0.02, g: 0.65 });
    tone(v, { w: 'triangle', f: 500, f2: 250, d: 0.1, g: 0.12 });
  },
  drink(v) {
    for (let i = 0; i < 3; i++) {
      tone(v, { w: 'sine', f: [[0, 280], [0.035, 620], [0.075, 240]], t: i * 0.12, d: 0.085, a: 0.01, g: 0.42, ft: 'lowpass', ff: 1200 });
      nz(v, { ft: 'lowpass', ff: 500, t: i * 0.12 + 0.01, d: 0.05, g: 0.15 });
    }
  },
  item_drop(v) {
    tone(v, { w: 'sine', f: 210, f2: 90, d: 0.08, g: 0.4 });
    [0, 0.075, 0.13, 0.19, 0.235].forEach((t, i) => {
      const g = 0.32 * Math.pow(0.62, i);
      tone(v, { w: 'triangle', f: rnd(900, 1600), t, d: 0.05, g });
      nz(v, { ft: 'bandpass', ff: 2600, fq: 2, t, d: 0.025, g: g * 1.2 });
    });
  },
  box_break(v) {
    nz(v, { ft: 'bandpass', ff: 900, fq: 1.2, d: 0.18, g: 0.9 });
    nz(v, { b: 'c', ft: 'bandpass', ff: 1600, fq: 0.8, d: 0.3, g: 0.75 });
    [0, 0.05, 0.11, 0.17].forEach((t, i) => {
      const f = rnd(280, 540);
      tone(v, { w: 'triangle', f, f2: f * 0.8, t, d: 0.07, g: 0.26 - i * 0.04 });
    });
    tone(v, { w: 'sine', f: 140, f2: 60, d: 0.12, g: 0.6 });
  },
  stone_hit(v) {
    const dr = drive(v, 3);
    nz(v, { ft: 'lowpass', ff: 1800, ff2: 300, d: 0.12, g: 0.9, to: dr });
    tone(v, { w: 'sine', f: 220, f2: 80, d: 0.12, g: 0.6 });
    tone(v, { w: 'square', f: 130, f2: 90, d: 0.06, g: 0.14, to: dr });
    nz(v, { b: 'c', ft: 'bandpass', ff: 2500, fq: 1, t: 0.01, d: 0.15, g: 0.42 });
  },

  // ─── UI / game ───
  menu_move(v) {
    tone(v, { w: 'pulse25', f: 880, d: 0.045, g: 0.13 });
    tone(v, { w: 'square', f: 1760, d: 0.02, g: 0.03 });
  },
  menu_ok(v) {
    tone(v, { w: 'pulse25', f: 784, d: 0.06, g: 0.14 });
    tone(v, { w: 'pulse25', f: 1175, t: 0.055, d: 0.06, g: 0.14 });
    tone(v, { w: 'pulse25', f: 1568, t: 0.11, d: 0.14, g: 0.14 });
  },
  menu_back(v) {
    tone(v, { w: 'pulse25', f: 784, d: 0.06, g: 0.14 });
    tone(v, { w: 'pulse25', f: 523, t: 0.06, d: 0.11, g: 0.14 });
  },
  ko(v) {
    const dr = drive(v, 4);
    tone(v, { w: 'sine', f: 120, f2: 28, d: 0.55, g: 1 });
    nz(v, { ft: 'lowpass', ff: 5000, ff2: 300, d: 0.3, g: 0.9, to: dr });
    nz(v, { b: 'b', ft: 'lowpass', ff: 800, d: 0.7, g: 0.6 });
    tone(v, { w: 'sawtooth', f: 620, f2: 70, t: 0.06, d: 0.65, a: 0.02, g: 0.12, ft: 'lowpass', ff: 2500 });
    tone(v, { w: 'sine', f: 220, t: 0.08, d: 1.2, g: 0.16 });
    tone(v, { w: 'sine', f: 331, t: 0.08, d: 1.0, g: 0.08 });
    tone(v, { w: 'sine', f: 467, t: 0.08, d: 0.8, g: 0.05 });
  },
  go(v) {
    [79, 84, 88].forEach((m, i) => tone(v, { w: 'pulse25', f: mtof(m), t: i * 0.035, d: 0.07, g: 0.1 }));
    [84, 88, 91].forEach((m) => tone(v, { w: 'pulse25', f: mtof(m), t: 0.11, d: 0.5, h: 0.22, g: 0.07, vib: [6, 14] }));
    tone(v, { w: 'sawtooth', f: mtof(48), t: 0.11, d: 0.5, h: 0.2, g: 0.12, ft: 'lowpass', ff: 1200 });
    nz(v, { ft: 'highpass', ff: 5000, t: 0.11, d: 0.55, g: 0.2 });
    // the "GO!" shout: velar plosive burst + /o/ vowel gliding from the g-pinch
    nz(v, { ft: 'bandpass', ff: 1700, fq: 2, t: 0.05, d: 0.03, g: 0.35 });
    formant(v, {
      f: [[0, 175], [0.12, 160], [0.4, 118]], t: 0.06, d: 0.42, a: 0.015, h: 0.2, g: 0.9, vib: [5, 20],
      fm: [[[[0, 320], [0.07, 520]], 6, 1.8], [[[0, 1500], [0.08, 880]], 9, 1.1], [2600, 10, 0.3]],
    });
  },
  stage_clear(v) {
    seq(v, 150, [[0, 'C5', 0.25], [0.25, 'E5', 0.25], [0.5, 'G5', 0.25], [0.75, 'C6', 0.75], [1.5, 'A5', 0.25], [1.75, 'B5', 0.25], [2, 'C6', 1.25]],
      { w: 'pulse25', g: 0.13, vib: [6, 14] });
    seq(v, 150, [[0.75, 'E5', 0.75], [1.5, 'F5', 0.5], [2, 'G5', 1.25]], { w: 'pulse25', g: 0.07 });
    seq(v, 150, [[0, 'C3', 0.7], [0.75, 'C3', 0.7], [1.5, 'F3', 0.45], [2, 'G3', 0.25], [2.25, 'C3', 1]], { w: 'triangle', g: 0.3 });
    nz(v, { ft: 'highpass', ff: 5000, t: 0.8, d: 1.0, g: 0.2 });
  },
  game_over(v) {
    seq(v, 112, [[0, 'D5', 0.5], [0.5, 'C5', 0.5], [1, 'Bb4', 0.5], [1.5, 'A4', 0.5], [2, 'G4', 2]], { w: 'pulse25', g: 0.12, vib: [5, 18] });
    seq(v, 112, [[0, 'Bb4', 0.5], [0.5, 'A4', 0.5], [1, 'G4', 0.5], [1.5, 'F#4', 0.5], [2, 'D4', 2]], { w: 'triangle', g: 0.13 });
    seq(v, 112, [[0, 'G2', 1], [1, 'D2', 1], [2, 'G2', 2]], { w: 'triangle', g: 0.32 });
    tone(v, { w: 'sine', f: 196, f2: 98, t: 1.1, d: 1.2, a: 0.05, g: 0.12 });
  },
  win(v) {
    const L = [[0, 'D5', 0.25], [0.25, 'G5', 0.25], [0.5, 'A5', 0.25], [0.75, 'D6', 0.75], [1.5, 'C6', 0.25], [1.75, 'D6', 0.25], [2, 'E6', 0.25], [2.25, 'D6', 1.5]];
    seq(v, 150, L, { w: 'sawtooth', g: 0.08, ft: 'lowpass', ff: 3500, vib: [5.5, 16] });
    seq(v, 150, L, { w: 'pulse25', g: 0.06, tr: -12 });
    seq(v, 150, [[0.75, 'F#5', 0.75], [1.5, 'E5', 0.75], [2.25, 'F#5', 1.5], [2.25, 'A5', 1.5, 0.7]], { w: 'pulse25', g: 0.06 });
    seq(v, 150, [[0, 'D3', 0.7], [0.75, 'D3', 0.7], [1.5, 'C3', 0.7], [2.25, 'D3', 1.5]], { w: 'triangle', g: 0.32 });
    for (let i = 0; i < 6; i++) nz(v, { ft: 'highpass', ff: 1200, t: i * 0.05, d: 0.08, g: 0.12 + i * 0.03 });
    nz(v, { ft: 'highpass', ff: 5000, t: 0.3, d: 0.9, g: 0.2 });
    nz(v, { ft: 'highpass', ff: 5000, t: 0.9, d: 1.1, g: 0.2 });
  },
  coin(v) {
    tone(v, { w: 'pulse25', f: mtof(88), d: 0.05, g: 0.12 });
    tone(v, { w: 'pulse25', f: mtof(93), t: 0.05, d: 0.05, g: 0.12 });
    tone(v, { w: 'pulse25', f: mtof(100), t: 0.1, d: 0.3, h: 0.05, g: 0.11 });
    tone(v, { w: 'pulse25', f: mtof(100), t: 0.22, d: 0.2, g: 0.04 });
  },
  count(v) {
    tone(v, { w: 'square', f: 1046.5, d: 0.1, h: 0.03, g: 0.11, ft: 'lowpass', ff: 3500 });
    tone(v, { w: 'sine', f: 2093, d: 0.07, g: 0.05 });
  },
};

// per-sound level trims, balanced from offline renders against the music bed
const LEVEL = {
  hit_light: 1.5, hit_heavy: 1.3, hit_sharp: 1.6, hit_blunt: 1.5, block: 1.3, break_defend: 1.4, kick: 1.3,
  swing: 1.2, jump: 1.8, dash: 1.8, land: 1.3, stone_hit: 1.2, item_drop: 1.2, throw: 1.3, pick: 1.3,
  ball_launch: 1.5, shuriken: 1.5, arrow: 1.3, teleport: 2, menu_move: 2.2, count: 1.3,
  shield: 0.6, drink: 0.65, whirlwind: 0.8, inferno: 0.8,
};

// small random pitch spread on frequently repeated impacts so they don't machine-gun
const JITTER = { hit_light: 1, hit_heavy: 1, hit_sharp: 1, hit_blunt: 1, block: 1, swing: 1, swing_heavy: 1, step: 1, land: 1, kick: 1, stone_hit: 1, fall_ground: 1, item_drop: 1, box_break: 1 };

function releaseVoice(v) {
  if (v.done) return;
  v.done = true;
  for (const n of v.nodes) off(n);
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
}

function stealVoice(v) {
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
  const t = ctx.currentTime;
  try {
    const g = v.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.025);
  } catch (e) { /* ignore */ }
  for (const s of v.srcs) { try { s.stop(t + 0.03); } catch (e) { /* ignore */ } }
  setTimeout(() => releaseVoice(v), 120);
}

function playSfx(name, opts) {
  const def = SFX[name];
  if (!def || !running() || muted || sfxVol <= 0.001) return;
  if (opts != null && typeof opts === 'object' && num(opts.vol, 1) <= 0) return;
  // collapse bursts of the same sound triggered in the same frame
  const t = ctx.currentTime, lf = lastFire[name];
  if (lf && t - lf.t < 0.015) { if (++lf.n > 2) return; } else lastFire[name] = { t, n: 1 };
  // reap voices whose onended never fired, then enforce the polyphony cap
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < t - 0.5) releaseVoice(voices[i]);
  while (voices.length >= MAX_VOICES) stealVoice(voices[0]);

  let o = opts;
  if (JITTER[name]) o = Object.assign({}, opts && typeof opts === 'object' ? opts : null, { pitch: num(opts && opts.pitch, 1) * rnd(0.97, 1.03) });
  const v = makeVoice(o, LEVEL[name] || 1);
  try { def(v); } catch (e) { /* a broken layer must not break the game */ } finally {
    if (!v.last) releaseVoice(v);
    else {
      voices.push(v);
      v.last.onended = () => releaseVoice(v);
    }
  }
}

// ═════════════════════════════════════════════════════════════ MUSIC ══
// Tracks are written per channel as space-separated tokens ('|' is decoration):
//   lead : absolute notes 'E5', 'Bb4'; '-' ties (extends previous note), '.' rest.
//          Each token = `leadDiv` 16th steps (default 2 → eighth notes).
//   bass / arp : chord-relative degrees looped over the bar's chord:
//          1 3 5 7 = chord tones (7 → octave if triad), 8 10 12 = same an octave up,
//          2 4 6 = scale steps, b2/#4/b7 = altered steps, '-5' = fifth an octave down.
//   chords: one token per bar, 'Am', 'F#m7', 'G,E' splits a bar, '_' = tacet.
//   drums : 16-step lanes per pattern letter (k kick, s snare, h hat, t toms, c crash);
//          x hit, X accent, g ghost, o open hat, h/m/l tom pitch.
//          dseq picks a pattern per bar; uppercase = same pattern + crash; '_' = none.
//   misc : bpm, bars, swing (0..0.3), vol (track trim), intro (bars played once),
//          loopVol (level once the intro is over), pad:false, inst overrides.

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function n2m(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return null;
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], aug: [0, 4, 8], 5: [0, 7, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
};
function parseChord(sym) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym || '');
  if (!m || !QUAL[m[3]]) return null;
  return { pc: (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, iv: QUAL[m[3]] };
}

const SCALE = [0, 0, 2, 4, 5, 7, 9, 11];
function degree(ch, tk, low) {
  const m = /^(-?)([b#]?)(\d+)$/.exec(tk);
  if (!m) return null;
  let n = +m[3], oct = m[1] ? -1 : 0;
  if (n < 1) return null;
  while (n > 7) { n -= 7; oct++; }
  let semi;
  if (m[2]) semi = SCALE[n] + (m[2] === 'b' ? -1 : 1);
  else if (n === 1) semi = 0;
  else if (n === 3) semi = ch.iv[1];
  else if (n === 5) semi = ch.iv[2];
  else if (n === 7) semi = ch.iv.length > 3 ? ch.iv[3] : 12;
  else semi = SCALE[n];
  const root = low + ((((ch.pc - low) % 12) + 12) % 12);
  return root + semi + 12 * oct;
}

const toks = (s) => String(s || '').split(/\s+/).filter((t) => t && t !== '|');

// default instrument settings; tracks override per channel via `inst`
const INST = {
  lead: { w: 'pulse25', g: 0.15, a: 0.006, dec: 0.12, sus: 0.7, rel: 0.07, vib: 5.5, vibD: 16, vibDelay: 0.16, oct2: 0, w2: 'sawtooth', g2: 0.45, det2: 5, ff: 0, echo: true },
  bass: { w: 'sawtooth', g: 0.24, ff: 650, fenv: 1600, fdec: 0.06, q: 5, dec: 0.14, sus: 0.55, rel: 0.04 },
  arp: { w: 'pulse12', g: 0.05, dec: 0.16, echo: true },
  pad: { w: 'sawtooth', g: 0.03, ff: 1000, a: 0.3, rel: 0.4, det: 7 },
  dr: { k: 0.6, s: 0.32, h: 0.08, c: 0.18, t: 0.3 },
};

// ─── the compositions (original) ───
const ROCK = {
  a: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  b: { k: 'x.x.....x.x...x.', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.' },
  f: { k: 'x.......x.......', s: '....x.......xxXX', h: 'x.x.x.x.........', t: '........hhmm....' },
};

const TRACKS = {
  // Heroic D-major anthem, 126 BPM.
  title: {
    bpm: 126, bars: 16,
    chords: 'D A Bm G D A G A | Bm G D A Bm G Em A',
    lead: `
      A4 - D5 - F#5 - E5 D5 | E5 - - - C#5 - A4 - | F#5 - E5 D5 E5 - F#5 - | G5 - - - D5 - B4 - |
      A4 - D5 - F#5 - A5 - | G5 - F#5 - E5 - C#5 - | D5 - E5 - F#5 - G5 - | A5 - - - - - . . |
      B5 - A5 - F#5 - D5 - | E5 - D5 - B4 - D5 - | F#5 - A5 - D6 - A5 - | C#6 - B5 - A5 - - - |
      B5 - - D6 C#6 - B5 - | G5 - - B5 A5 - G5 - | E5 - F#5 - G5 - B5 - | A5 - G5 - F#5 - E5 - |`,
    bass: '1 1 8 1 1 1 5 8',
    drums: ROCK,
    dseq: 'Aaaaaaaf Bbbbbbbf',
    inst: { lead: { g: 0.14, oct2: -12, w2: 'sawtooth', g2: 0.4 } },
  },

  // Light, swung city-pop loop for character select, 116 BPM.
  select: {
    bpm: 116, bars: 16, swing: 0.14,
    chords: 'Fmaj7 Em7 Dm7 G Fmaj7 Em7 Am7 Dm7,G | Dm7 Em7 Fmaj7 G Dm7 Em7 Fmaj7 G',
    lead: `
      E5 . G5 . A5 - G5 E5 | G5 - - . E5 D5 E5 - | D5 . F5 . A5 - C6 - | B5 - A5 G5 - - D5 - |
      E5 . G5 . A5 - C6 A5 | B5 - G5 - E5 - D5 E5 | C6 - B5 A5 G5 - E5 - | D5 - E5 - G5 - - . |
      F5 - A5 - C6 - A5 - | G5 - B5 - D6 - B5 - | C6 - - - A5 - E5 - | D5 - G5 - B5 - D6 - |
      C6 - A5 - F5 - D5 - | E5 - G5 - B5 - G5 - | A5 - - - C6 - - - | B5 - - - G5 - D5 - |`,
    bass: '1 . . 1 . . 8 . . 1 . 1 5 . 3 .', bassDiv: 1,
    arp: '1 5 7 10 7 5 3 5', arpDiv: 1,
    drums: {
      a: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.xgx.x.x.xg' },
      f: { k: 'x.....x...x.....', s: '....x.......x.gg', h: 'x.x.x.x.x.x.o...' },
    },
    dseq: 'Aaaaaaaf aaaaaaaf',
    inst: {
      lead: { w: 'square', g: 0.1, ff: 3200 }, bass: { w: 'square', ff: 520, g: 0.2 },
      arp: { g: 0.04 }, pad: { g: 0.02 }, dr: { k: 0.45, s: 0.22, h: 0.06 },
    },
  },

  // Driving A-minor fight theme, 152 BPM.
  battle1: {
    bpm: 152, bars: 16,
    chords: 'Am Am F G Am Am F G,E | F G Em Am F G E E',
    lead: `
      A5 - E5 - A5 G5 E5 D5 | E5 - - - C5 D5 E5 G5 | A5 - - - G5 - F5 E5 | D5 - - - B4 - D5 - |
      A5 - E5 - A5 G5 E5 D5 | E5 - G5 - A5 - C6 - | D6 - C6 - A5 - G5 - | G5 - A5 - B5 - G#5 - |
      A5 - - C6 - - A5 G5 | G5 - - B5 - - D6 - | E6 - - - D6 - B5 - | C6 - B5 - A5 - E5 - |
      F5 - A5 - C6 - F6 - | E6 - D6 - B5 - G5 - | G#5 - B5 - E6 - D6 - | B5 - - - - - G#5 - |`,
    bass: '1 1 8 1 1 1 8 1 1 1 8 1 5 8 5 3',
    arp: '1 5 8 10 12 10 8 5', arpDiv: 1,
    pad: false,
    drums: {
      a: { k: 'x.....x.x.......', s: '....x.......x...', h: 'X.x.X.x.X.x.X.x.' },
      b: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.' },
      f: { k: 'x.......x.......', s: '....x...x.x.xxXX', h: 'x.x.x.x.........' },
    },
    dseq: 'Aaaaaaaf Bbbbbbbf',
    inst: { arp: { g: 0.04 } },
  },

  // Kung-fu flavoured D-minor pentatonic, galloping bass, 164 BPM.
  battle2: {
    bpm: 164, bars: 16, vol: 0.88,
    chords: 'Dm C Bb C Dm C Bb,C Dm | Bb C Am Dm Bb C A A',
    lead: `
      A5 - A5 G5 A5 - C6 - | G5 - - F5 G5 - C5 - | F5 - - D5 F5 - G5 - | G5 - F5 - D5 - C5 - |
      D6 - C6 A5 C6 - D6 - | G5 - A5 - C6 - A5 G5 | F5 - D5 F5 G5 - C6 - | D6 - - - - - . . |
      D6 - - C6 D6 - F6 - | E6 - - D6 C6 - G5 - | A5 - C6 - D6 - E6 - | F6 - E6 D6 C6 - A5 - |
      D6 - - - F5 - G5 - | C6 - - - E5 - G5 - | E6 - C#6 - A5 - E5 - | A5 - - - C#6 - E6 - |`,
    bass: '1 . 1 1 1 . 1 1 8 . 8 8 5 . 3 3', bassDiv: 1,
    drums: {
      a: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.' },
      b: { k: 'x...x...x...x...', s: 'g...x..g..g.x...', h: 'xxoxxxoxxxoxxxox' },
      f: { k: 'x...x...x.......', s: '....x.......XXXX', h: 'x.o.x.o.........', t: '........hhmm....' },
    },
    dseq: 'Aaaaaaaf Bbbbbbbf',
    inst: {
      lead: { w: 'square', g: 0.11, oct2: 12, w2: 'triangle', g2: 0.4, echo: true },
      bass: { w: 'square', ff: 600, g: 0.2 }, pad: { g: 0.028 },
    },
  },

  // Hard-rock E-minor theme with chugging 16th bass, 170 BPM.
  battle3: {
    bpm: 170, bars: 16,
    chords: 'Em C D B Em C D B7 | G D Em C Am B Em B',
    lead: `
      B5 - - - G5 - E5 - | C6 - - - G5 - E5 - | D6 - - - A5 - F#5 - | D#6 - - - B5 - F#5 - |
      E6 - D6 - B5 - G5 A5 | B5 - A5 - G5 - E5 - | F#5 - G5 - A5 - D6 - | B5 - A5 - F#5 - D#5 - |
      G5 - B5 - D6 - - B5 | A5 - - - F#5 - D5 - | E5 - G5 - B5 - E6 - | G6 - - - E6 - C6 - |
      C6 - B5 A5 B5 - C6 - | D#6 - - - F#6 - - - | E6 - B5 - G5 - E5 - | F#5 - G5 - A5 - D#5 - |`,
    bass: '1 1 1 . 1 1 1 . 1 1 8 . 1 1 5 .', bassDiv: 1,
    arp: '1 5 8 5', arpDiv: 1, arpLow: 64,
    drums: {
      a: { k: 'x.xx..x.x.xx..x.', s: '....X.......X...', h: 'XxxxXxxxXxxxXxxx' },
      b: { k: 'x.x.x.x.x.x.x.x.', s: '....X.......X...', h: 'X.x.X.x.X.x.X.x.' },
      f: { k: 'x.x.x.x.x.......', s: '....X.......', t: '........hhmmllll' },
    },
    dseq: 'Aaaaaaaf Bbbbbbbf',
    inst: {
      lead: { w: 'sawtooth', g: 0.1, ff: 2800, oct2: -12, w2: 'square', g2: 0.35 },
      bass: { ff: 800, g: 0.22, dec: 0.08, sus: 0.4 }, arp: { g: 0.03 }, pad: { g: 0.022, ff: 1400 },
      dr: { h: 0.06 },
    },
  },

  // Adventurous G-major march for stage mode, 132 BPM.
  stage: {
    bpm: 132, bars: 16,
    chords: 'G C G D G C Am,D G | Em C G D Em C A D',
    lead: `
      D5 - - G5 B5 - G5 - | E5 - - G5 C6 - B5 A5 | B5 - - G5 D5 - G5 - | A5 - - - - - . . |
      D5 - - G5 B5 - D6 - | E6 - D6 - C6 - B5 A5 | C6 - A5 - F#5 - A5 - | G5 - - - - - D5 - |
      E5 - G5 - B5 - - - | C6 - B5 - G5 - E5 - | D5 - G5 - B5 - D6 - | C6 - B5 - A5 - - - |
      G5 - A5 - B5 - E6 - | E6 - D6 - C6 - G5 - | A5 - C#6 - E6 - C#6 - | D6 - - - C6 - A5 - |`,
    bass: '1 . -5 . 1 . -5 .', bassLow: 40,
    drums: {
      a: { k: 'x.......x.......', s: '..g.x.gx..g.x.xx', h: 'x...x...x...x...' },
      b: { k: 'x...x...x...x...', s: '..g.x.gx..g.x.xx', h: 'x.x.x.x.x.x.x.x.' },
      f: { k: 'x.......x.......', s: 'X.xxX.xxX.xxXXXX' },
    },
    dseq: 'Aaaaaaaf Bbbbbbbf',
    inst: {
      lead: { g: 0.14, oct2: -12, w2: 'triangle', g2: 0.7 },
      bass: { w: 'triangle', g: 0.4, ff: 1200 }, pad: { g: 0.025 },
    },
  },

  // Dark C-minor boss theme with a phrygian bass stab, 148 BPM.
  boss: {
    bpm: 148, bars: 16, vol: 0.9,
    chords: 'Cm Cm Ab Bb Cm Cm Db G | Fm Fm Ab G Fm Db G G',
    lead: `
      C5 - - - - - D5 Eb5 | G5 - - - F5 - Eb5 D5 | Eb5 - - - C5 - Ab4 - | D5 - - - F5 - Bb5 - |
      C6 - - - B5 - C6 D6 | Eb6 - D6 - C6 - G5 - | Ab5 - - - F5 - Db6 - | B5 - D6 - F6 - D6 B5 |
      C6 - - Ab5 F5 - - C5 | F5 - G5 - Ab5 - C6 - | Eb6 - - - C6 - Ab5 - | B5 - - - G5 - D5 - |
      Ab5 - G5 - F5 - Eb5 - | F5 - - - Ab5 - Db6 - | D6 - - - B5 - G5 - | F5 - Eb5 - D5 - B4 - |`,
    bass: '1 1 8 1 1 1 8 1 1 1 8 1 b2 . 1 .', bassDiv: 1,
    arp: '8 5 3 1', arpDiv: 1, arpLow: 60,
    drums: {
      a: { k: 'x.x.x.x.x.x.x.x.', s: '....X.......X...', h: '..x...x...x...x.' },
      b: { k: 'x.xxx.xxx.xxx.xx', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.' },
      f: { k: 'x.x.x.x.x.......', s: '....X.......', t: '........llmmhhhh' },
    },
    dseq: 'Aaaaaaaf Bbbbbbbf',
    inst: {
      lead: { w: 'sawtooth', g: 0.11, ff: 2200, oct2: -12, w2: 'sawtooth', g2: 0.5, det2: 9 },
      bass: { g: 0.26, ff: 520, fenv: 1400 }, arp: { w: 'square', g: 0.028 },
      pad: { g: 0.035, ff: 800 }, dr: { k: 0.65, s: 0.36, t: 0.35 },
    },
  },

  // Calm, warm F-major results loop, 96 BPM.
  results: {
    bpm: 96, bars: 8, vol: 0.78,
    chords: 'F Am Bb C Dm Bb Gm7 C',
    lead: `
      F5 - G5 - A5 - C6 - | E5 - - - C5 - E5 - | D5 - F5 - Bb5 - A5 - | G5 - - - - - . . |
      A5 - G5 - F5 - A5 - | D6 - C6 - Bb5 - A5 - | G5 - A5 - Bb5 - D6 - | C6 - - - E5 - G5 - |`,
    bass: '1 - - 8 5 - 3 -',
    arp: '1 5 8 10 12 10 8 5', arpDiv: 1, arpLow: 60,
    drums: { a: { k: 'x.......x.......', s: '....g.......g...', h: '..g...g...g...g.' } },
    dseq: 'a',
    inst: {
      lead: { w: 'triangle', g: 0.17, vibD: 22, oct2: 12, w2: 'sine', g2: 0.25 },
      bass: { w: 'triangle', g: 0.3, ff: 900, fenv: 400 }, arp: { w: 'pulse25', g: 0.028 },
      pad: { w: 'triangle', g: 0.03, ff: 1500 }, dr: { k: 0.35, s: 0.3, h: 0.07 },
    },
  },

  // 4-bar brass fanfare, then an 8-bar soft loop (track drops to loopVol).
  victory: {
    bpm: 138, bars: 12, intro: 4, loopVol: 0.55,
    chords: 'C F,G C C | C Am F G C Am Dm G',
    lead: `
      G4 . C5 . E5 - G5 - | A5 - - F5 G5 - B5 - | C6 - - - - - - - | G5 - E5 - C5 - . . |
      E5 - - - G5 - - - | A5 - - - E5 - C5 - | F5 - - - A5 - C6 - | B5 - - - - - . . |
      G5 - - - E5 - G5 - | C6 - - - A5 - - - | F5 - A5 - D6 - C6 - | B5 - - - D5 - . . |`,
    bass: '1 - - - 5 - - -',
    arp: '1 5 8 10 8 5', arpDiv: 1,
    drums: {
      a: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      r: { k: 'x.......x.......', s: '....x...x.x.xxXX', h: 'x.x.x.x.........' },
      e: { k: 'x...............' },
      s: { k: 'g.......g.......', h: '..g...g...g...g.' },
    },
    dseq: 'Ar E_ ssss ssss',
    inst: { lead: { w: 'sawtooth', g: 0.11, ff: 3500, oct2: -12, w2: 'pulse25', g2: 0.5 }, arp: { g: 0.035 }, pad: { g: 0.03 } },
  },
};

function warnOnce(msg) { try { console.warn('[audio] ' + msg); } catch (e) { /* ignore */ } }

function compile(id) {
  if (compiled[id]) return compiled[id];
  const def = TRACKS[id];
  const bars = def.bars, S = bars * 16;
  const loopStart = (def.intro || 0) * 16;
  const steps = [];
  for (let i = 0; i < S; i++) steps.push([]);
  const ins = {};
  for (const k in INST) ins[k] = Object.assign({}, INST[k], def.inst && def.inst[k]);

  // chords (+ pad events, merging repeated chords)
  const chordAt = new Array(S).fill(null);
  const ct = toks(def.chords);
  if (ct.length !== bars) warnOnce(`${id}: ${ct.length} chords for ${bars} bars`);
  let prev = null;
  for (let b = 0; b < bars; b++) {
    const parts = (ct[b % ct.length] || '_').split(',');
    parts.forEach((sym, i) => {
      const ch = parseChord(sym);
      const st = b * 16 + Math.round((i * 16) / parts.length), en = b * 16 + Math.round(((i + 1) * 16) / parts.length);
      for (let s = st; s < en; s++) chordAt[s] = ch;
      if (!ch || def.pad === false) { prev = null; return; }
      if (prev && prev.sym === sym && prev.end === st && st !== loopStart) { prev.ev.d += en - st; prev.end = en; return; }
      const ms = [];
      for (const iv of ch.iv) {
        const m = 55 + ((((ch.pc + iv - 55) % 12) + 12) % 12);
        if (ms.indexOf(m) < 0) ms.push(m);
      }
      const ev = { c: 'pad', ms, d: en - st };
      steps[st].push(ev);
      prev = { sym, end: en, ev };
    });
  }

  const melodic = (ch, src, div, low) => {
    if (!src) return;
    const tk = toks(src), n = S / div;
    if (ch === 'lead' && tk.length !== n) warnOnce(`${id}: lead has ${tk.length} tokens, expected ${n}`);
    for (let i = 0; i < n; i++) {
      const t = tk[i % tk.length];
      if (t === '-' || t === '.') continue;
      let len = 1;
      while (i + len < n && tk[(i + len) % tk.length] === '-') len++;
      const step = i * div;
      let m;
      if (/^[A-G]/.test(t)) m = n2m(t);
      else if (chordAt[step]) m = degree(chordAt[step], t, low);
      if (m == null || !isFinite(m)) continue;
      steps[step].push({ c: ch, m, d: len * div });
    }
  };
  melodic('lead', def.lead, def.leadDiv || 2, 0);
  melodic('bass', def.bass, def.bassDiv || 2, def.bassLow || 36);
  melodic('arp', def.arp, def.arpDiv || 1, def.arpLow || 60);

  // drums
  const VEL = { x: 1, X: 1.3, g: 0.4, o: 1 };
  const TOM = { h: 0, m: 1, l: 2 };
  const dseq = String(def.dseq || 'a').replace(/\s+/g, '');
  for (let b = 0; b < bars && def.drums; b++) {
    const key = dseq[b % dseq.length];
    if (!key || key === '_') continue;
    const pat = def.drums[key.toLowerCase()];
    if (key !== key.toLowerCase()) steps[b * 16].push({ c: 'c', v: 1 });
    if (!pat) continue;
    for (const lane of ['k', 's', 'h', 't', 'c']) {
      const str = pat[lane];
      if (!str) continue;
      for (let i = 0; i < 16; i++) {
        const chr = str[i];
        if (!chr || chr === '.') continue;
        if (lane === 't') { if (chr in TOM) steps[b * 16 + i].push({ c: 't', m: TOM[chr] }); continue; }
        const v = VEL[chr];
        if (!v) continue;
        steps[b * 16 + i].push({ c: lane === 'h' && chr === 'o' ? 'o' : lane, v });
      }
    }
  }

  return (compiled[id] = {
    id, S, loopStart, steps, ins, sd: 60 / def.bpm / 4,
    swing: num(def.swing, 0), loopVol: num(def.loopVol, 1), vol: clamp(num(def.vol, 1), 0, 2), echo: 0.22,
  });
}

// ─── synth voices for the sequencer ───
function adsr(param, T, gate, a, d, s, peak, r) {
  param.setValueAtTime(0, T);
  if (gate <= a) {
    param.linearRampToValueAtTime((peak * gate) / a, T + gate);
  } else {
    param.linearRampToValueAtTime(peak, T + a);
    if (gate < a + d) param.linearRampToValueAtTime(peak + (s * peak - peak) * ((gate - a) / d), T + gate);
    else { param.linearRampToValueAtTime(s * peak, T + a + d); param.setValueAtTime(s * peak, T + gate); }
  }
  param.linearRampToValueAtTime(0, T + gate + r);
  return T + gate + r;
}

function noiseSrc(T, dur, loop) {
  const s = ctx.createBufferSource();
  s.buffer = bufs.w;
  s.loop = !!loop;
  s.start(T, loop ? Math.random() * 0.8 : Math.random() * Math.max(0, 0.98 - dur));
  s.stop(T + dur + 0.01);
  return s;
}

function mLead(o, T, ev) {
  const L = o.ins.lead, dur = ev.d * o.sd;
  const gate = Math.max(0.04, dur - Math.min(0.035, dur * 0.2));
  const f = mtof(ev.m);
  const g = ctx.createGain();
  const end = adsr(g.gain, T, gate, L.a, L.dec, L.sus, L.g, L.rel) + 0.02;
  const nodes = [g];
  let dest = g;
  if (L.ff) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = L.ff;
    lp.Q.value = 0.8;
    lp.connect(g);
    dest = lp;
    nodes.push(lp);
  }
  const s1 = ctx.createOscillator();
  setWave(s1, L.w);
  s1.frequency.value = f;
  s1.connect(dest);
  nodes.push(s1);
  let s2 = null;
  if (L.oct2) {
    s2 = ctx.createOscillator();
    setWave(s2, L.w2);
    s2.frequency.value = f * Math.pow(2, L.oct2 / 12);
    s2.detune.value = L.det2;
    const g2 = ctx.createGain();
    g2.gain.value = L.g2;
    s2.connect(g2);
    g2.connect(dest);
    nodes.push(s2, g2);
  }
  let lf = null;
  if (L.vib && dur > 0.22) {
    lf = ctx.createOscillator();
    lf.frequency.value = L.vib;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, T);
    lg.gain.setValueAtTime(0, T + L.vibDelay);
    lg.gain.linearRampToValueAtTime(L.vibD, T + L.vibDelay + 0.15);
    lf.connect(lg);
    lg.connect(s1.detune);
    if (s2) lg.connect(s2.detune);
    nodes.push(lf, lg);
  }
  g.connect(o.out);
  if (L.echo) g.connect(o.echoIn);
  for (const s of [s1, s2, lf]) if (s) { s.start(T); s.stop(end); }
  clean(s1, nodes);
}

function mBass(o, T, ev) {
  const B = o.ins.bass, dur = ev.d * o.sd;
  const gate = Math.max(0.03, dur - Math.min(0.03, dur * 0.25));
  const s = ctx.createOscillator();
  setWave(s, B.w);
  s.frequency.value = mtof(ev.m);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = B.q;
  lp.frequency.setValueAtTime(B.ff + B.fenv, T);
  lp.frequency.exponentialRampToValueAtTime(B.ff, T + Math.min(gate, B.fdec * 3));
  const g = ctx.createGain();
  const end = adsr(g.gain, T, gate, 0.004, B.dec, B.sus, B.g, B.rel) + 0.02;
  s.connect(lp);
  lp.connect(g);
  g.connect(o.out);
  s.start(T);
  s.stop(end);
  clean(s, [s, lp, g]);
}

function mArp(o, T, ev) {
  const A = o.ins.arp;
  const len = Math.max(0.05, Math.min(A.dec, ev.d * o.sd + 0.05));
  const s = ctx.createOscillator();
  setWave(s, A.w);
  s.frequency.value = mtof(ev.m);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, T);
  g.gain.linearRampToValueAtTime(A.g, T + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, T + len);
  s.connect(g);
  g.connect(o.out);
  if (A.echo) g.connect(o.echoIn);
  s.start(T);
  s.stop(T + len + 0.02);
  clean(s, [s, g]);
}

function mPad(o, T, ev) {
  const P = o.ins.pad, dur = ev.d * o.sd;
  const a = Math.min(P.a, dur * 0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = P.ff;
  lp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, T);
  g.gain.linearRampToValueAtTime(P.g, T + a);
  g.gain.setValueAtTime(P.g, T + dur);
  g.gain.linearRampToValueAtTime(0, T + dur + P.rel);
  lp.connect(g);
  g.connect(o.out);
  const nodes = [lp, g];
  let last = null;
  for (const m of ev.ms) {
    for (const det of [-P.det, P.det]) {
      const s = ctx.createOscillator();
      setWave(s, P.w);
      s.frequency.value = mtof(m);
      s.detune.value = det;
      s.connect(lp);
      s.start(T);
      s.stop(T + dur + P.rel + 0.02);
      nodes.push(s);
      last = s;
    }
  }
  if (last) clean(last, nodes);
}

function dKick(o, T, ev) {
  const amp = o.ins.dr.k * ev.v;
  const s = ctx.createOscillator();
  s.type = 'sine';
  s.frequency.setValueAtTime(155, T);
  s.frequency.exponentialRampToValueAtTime(48, T + 0.09);
  s.frequency.exponentialRampToValueAtTime(38, T + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, T);
  g.gain.linearRampToValueAtTime(amp, T + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, T + 0.28);
  s.connect(g);
  g.connect(o.out);
  s.start(T);
  s.stop(T + 0.3);
  clean(s, [s, g]);
  const n = noiseSrc(T, 0.012), ng = ctx.createGain();
  ng.gain.setValueAtTime(amp * 0.25, T);
  ng.gain.exponentialRampToValueAtTime(0.0001, T + 0.012);
  n.connect(ng);
  ng.connect(o.out);
  clean(n, [n, ng]);
}

function dSnare(o, T, ev) {
  const amp = o.ins.dr.s * ev.v, len = ev.v < 0.6 ? 0.08 : 0.18;
  const n = noiseSrc(T, len), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'highpass';
  f.frequency.value = 1100;
  g.gain.setValueAtTime(amp, T);
  g.gain.exponentialRampToValueAtTime(0.0001, T + len);
  n.connect(f);
  f.connect(g);
  g.connect(o.out);
  clean(n, [n, f, g]);
  const s = ctx.createOscillator(), g2 = ctx.createGain();
  s.type = 'triangle';
  s.frequency.setValueAtTime(215, T);
  s.frequency.exponentialRampToValueAtTime(150, T + 0.07);
  g2.gain.setValueAtTime(amp * 0.7, T);
  g2.gain.exponentialRampToValueAtTime(0.0001, T + 0.08);
  s.connect(g2);
  g2.connect(o.out);
  s.start(T);
  s.stop(T + 0.1);
  clean(s, [s, g2]);
}

function dHat(o, T, ev, open) {
  const amp = o.ins.dr.h * ev.v, len = open ? 0.22 : 0.035;
  const n = noiseSrc(T, len), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'highpass';
  f.frequency.value = 7200;
  g.gain.setValueAtTime(amp, T);
  g.gain.exponentialRampToValueAtTime(0.0001, T + len);
  n.connect(f);
  f.connect(g);
  g.connect(o.out);
  clean(n, [n, f, g]);
}

function dCrash(o, T, ev) {
  const amp = o.ins.dr.c * ev.v;
  const n = noiseSrc(T, 1.4, true), f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'highpass';
  f.frequency.value = 4500;
  g.gain.setValueAtTime(amp, T);
  g.gain.exponentialRampToValueAtTime(0.0001, T + 1.4);
  n.connect(f);
  f.connect(g);
  g.connect(o.out);
  clean(n, [n, f, g]);
}

function dTom(o, T, ev) {
  const amp = o.ins.dr.t, f0 = [210, 155, 110][ev.m] || 155;
  const s = ctx.createOscillator(), g = ctx.createGain();
  s.type = 'sine';
  s.frequency.setValueAtTime(f0, T);
  s.frequency.exponentialRampToValueAtTime(f0 * 0.6, T + 0.2);
  g.gain.setValueAtTime(0.0001, T);
  g.gain.linearRampToValueAtTime(amp, T + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, T + 0.3);
  s.connect(g);
  g.connect(o.out);
  s.start(T);
  s.stop(T + 0.32);
  clean(s, [s, g]);
}

const PLAY = {
  lead: mLead, bass: mBass, arp: mArp, pad: mPad,
  k: dKick, s: dSnare, h: (o, T, ev) => dHat(o, T, ev, false), o: (o, T, ev) => dHat(o, T, ev, true),
  c: dCrash, t: dTom,
};

function playStep(o, step, t) {
  const evs = o.trk.steps[step];
  if (!evs.length) return;
  const T = step & 1 ? t + o.trk.swing * o.sd : t;
  for (const ev of evs) {
    try { PLAY[ev.c](o, T, ev); } catch (e) { /* skip a bad note, keep the groove */ }
  }
}

function advance(o) {
  o.step++;
  o.next += o.sd;
  if (o.step >= o.trk.S) o.step = o.trk.loopStart;
  // first time the loop section is reached (end of an intro/fanfare): settle to loopVol
  if (!o.softened && o.step === o.trk.loopStart && o.trk.loopVol < 1) {
    o.softened = true;
    if (!o.dead) {
      try {
        o.out.gain.setValueAtTime(o.trk.vol, o.next);
        o.out.gain.linearRampToValueAtTime(o.trk.vol * o.trk.loopVol, o.next + 1.5);
      } catch (e) { /* ignore */ }
    }
  }
}

function tick() {
  if (!cur) { stopTimer(); return; }
  if (!running()) return;
  const o = cur, now = ctx.currentTime;
  const ahead = typeof document !== 'undefined' && document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
  if (o.next < now - 0.08) {
    // timer was starved (tab throttled / long frame): drop missed steps, stay on the grid
    let n = Math.min(100000, Math.ceil((now - o.next) / o.sd));
    while (n-- > 0) advance(o);
  }
  let guard = 0;
  while (o.next < now + ahead && guard++ < 1024) {
    if (!muted && musicVol > 0.001) playStep(o, o.step, o.next);
    advance(o);
  }
}

function safeTick() { try { tick(); } catch (e) { /* never throw from the timer */ } }
function ensureTimer() { if (!timer) timer = setInterval(safeTick, TICK_MS); }
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

function fadeOutInstance(o, dur) {
  o.dead = true;
  const t = ctx.currentTime;
  try {
    const g = o.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(0, t + dur);
  } catch (e) { /* ignore */ }
  setTimeout(() => { for (const n of [o.out, o.echoIn, o.delay, o.fb, o.wet]) off(n); }, (dur + 2.5) * 1000);
}

function startTrack(id) {
  if (!running() || !TRACKS[id]) return;
  if (cur && cur.id === id) return;
  const trk = compile(id);
  const t = ctx.currentTime;
  const crossing = !!cur;
  if (cur) fadeOutInstance(cur, 0.4);
  const o = { id, trk, ins: trk.ins, sd: trk.sd, step: 0, next: t + (crossing ? 0.12 : 0.06), dead: false, softened: false };
  o.out = ctx.createGain();
  o.out.gain.setValueAtTime(0.0001, t);
  o.out.gain.linearRampToValueAtTime(trk.vol, o.next + (crossing ? 0.25 : 0.01));
  o.out.connect(musicBus);
  // per-track dotted-eighth echo for lead / arp (part of the instance so it fades with it)
  o.echoIn = ctx.createGain();
  o.delay = ctx.createDelay(1);
  o.delay.delayTime.value = clamp(trk.sd * 3, 0.05, 0.95);
  o.fb = ctx.createGain();
  o.fb.gain.value = 0.3;
  o.wet = ctx.createGain();
  o.wet.gain.value = trk.echo;
  o.echoIn.connect(o.delay);
  o.delay.connect(o.fb);
  o.fb.connect(o.delay);
  o.delay.connect(o.wet);
  o.wet.connect(o.out);
  cur = o;
  ensureTimer();
  safeTick();
}

function stopAll(fade) {
  wantTrack = null;
  if (cur && ctx) fadeOutInstance(cur, fade);
  cur = null;
  stopTimer();
}

// ═════════════════════════════════════════════════════════ public API ══
export const audio = {
  init() {
    try { initCtx(); } catch (e) { /* ignore */ }
  },

  unlock() {
    try {
      if (!initCtx()) return;
      if (ctx.state !== 'running' && ctx.resume) {
        const p = ctx.resume();
        if (p && p.then) p.then(onState, () => {});
      }
      if (!primed) {
        // a silent one-sample buffer fully unlocks output on iOS / WebKit
        primed = true;
        const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.onended = () => off(s);
        s.start(0);
      }
      onState();
    } catch (e) { /* ignore */ }
  },

  sfx(name, opts = {}) {
    try { playSfx(name, opts); } catch (e) { /* ignore */ }
  },

  music(trackId) {
    try {
      if (trackId == null) { stopAll(0.5); return; }
      if (!Object.prototype.hasOwnProperty.call(TRACKS, trackId)) return;
      if (wantTrack === trackId && (!running() || (cur && cur.id === trackId))) return;
      wantTrack = trackId;
      if (running()) startTrack(trackId);
    } catch (e) { /* ignore */ }
  },

  stopMusic() {
    try { stopAll(0.35); } catch (e) { /* ignore */ }
  },

  setMusicVolume(v) {
    try {
      musicVol = clamp(num(+v, musicVol), 0, 1);
      if (musicBus) musicBus.gain.setTargetAtTime(musicVol, ctx.currentTime, 0.03);
    } catch (e) { /* ignore */ }
  },

  setSfxVolume(v) {
    try {
      sfxVol = clamp(num(+v, sfxVol), 0, 1);
      if (sfxBus) sfxBus.gain.setTargetAtTime(sfxVol, ctx.currentTime, 0.03);
    } catch (e) { /* ignore */ }
  },

  toggleMute() {
    muted = !muted;
    try { if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02); } catch (e) { /* ignore */ }
    return muted;
  },

  get muted() {
    return muted;
  },
};

export default audio;
