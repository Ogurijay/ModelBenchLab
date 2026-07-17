// WebAudio 程序化音效 — 零外部资产
let ctx = null;
let master = null;
let muted = false;
let humNodes = null;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.55;
}
export function isMuted() { return muted; }

// 环境低鸣(实验室通风)
export function startAmbient() {
  ensure();
  if (humNodes) return;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = 48;
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 61;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.02;
  lfo.connect(lfoG).connect(g.gain);
  o1.connect(g); o2.connect(g);
  g.connect(master);
  o1.start(); o2.start(); lfo.start();
  humNodes = [o1, o2, lfo];
}

function env(node, t0, a, peak, d) {
  node.gain.setValueAtTime(0, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + a);
  node.gain.exponentialRampToValueAtTime(0.001, t0 + a + d);
}

function blip(freq0, freq1, dur, type = 'sawtooth', peak = 0.25) {
  ensure();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t + dur);
  const g = ctx.createGain();
  env(g, t, 0.005, peak, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseBurst(dur, freq, q, peak = 0.3, rampTo = null) {
  ensure();
  const t = ctx.currentTime;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  if (rampTo) f.frequency.exponentialRampToValueAtTime(rampTo, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.01, peak, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  shoot(color) {
    blip(color === 'blue' ? 950 : 750, 240, 0.16, 'sawtooth', 0.18);
    noiseBurst(0.08, 3200, 2, 0.08);
  },
  deny() {
    blip(220, 90, 0.18, 'square', 0.14);
  },
  portalOpen() {
    noiseBurst(0.35, 500, 1.2, 0.22, 2400);
    blip(300, 900, 0.3, 'sine', 0.12);
  },
  teleport() {
    noiseBurst(0.28, 1800, 0.8, 0.3, 300);
    blip(600, 180, 0.22, 'sine', 0.16);
  },
  pickup() { blip(420, 660, 0.1, 'triangle', 0.14); },
  drop() { blip(500, 300, 0.09, 'triangle', 0.12); },
  buttonOn() { blip(520, 780, 0.12, 'sine', 0.2); blip(780, 780, 0.18, 'sine', 0.1); },
  buttonOff() { blip(640, 380, 0.14, 'sine', 0.14); },
  doorOpen() { noiseBurst(0.3, 900, 1.5, 0.16, 1800); },
  doorClose() { noiseBurst(0.25, 1400, 1.5, 0.14, 500); },
  fizzle() { noiseBurst(0.4, 2600, 0.7, 0.24, 900); },
  dissolve() { noiseBurst(0.5, 1200, 0.8, 0.2, 4000); blip(800, 1600, 0.4, 'sine', 0.08); },
  elevator() {
    blip(523, 523, 0.16, 'sine', 0.18);
    setTimeout(() => blip(784, 784, 0.28, 'sine', 0.18), 140);
  },
  land(speed) {
    if (speed > 3) noiseBurst(0.12, 300, 1.2, Math.min(0.3, speed * 0.02));
  },
  jump() { noiseBurst(0.07, 700, 1.5, 0.06); },
  complete() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, f, 0.35, 'sine', 0.16), i * 160));
  },
};

export function unlockAudio() {
  ensure();
  startAmbient();
}
