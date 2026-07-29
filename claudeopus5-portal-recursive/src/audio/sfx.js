// WebAudio 程序化音效 —— 零外部资产,全部由振荡器与噪声即时合成。
let ctx = null;
let master = null;
let muted = false;
let ambient = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}
export const isMuted = () => muted;

export function unlock() {
  if (!ensure() || ambient) return;
  const g = ctx.createGain();
  g.gain.value = 0.045;
  const a = ctx.createOscillator();
  a.type = 'sine'; a.frequency.value = 52;
  const b = ctx.createOscillator();
  b.type = 'sine'; b.frequency.value = 67;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.11;
  const lg = ctx.createGain();
  lg.gain.value = 0.018;
  lfo.connect(lg).connect(g.gain);
  a.connect(g); b.connect(g); g.connect(master);
  a.start(); b.start(); lfo.start();
  ambient = [a, b, lfo];
}

function tone(f0, f1, dur, type = 'sine', peak = 0.2, delay = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, f0, q, peak = 0.25, f1 = null) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.ceil(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(f0, t);
  if (f1) filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t);
}

export const SFX = {
  shot: (color) => { tone(color === 'blue' ? 980 : 760, 240, 0.15, 'sawtooth', 0.16); noise(0.07, 3000, 2, 0.07); },
  portal: () => { noise(0.34, 480, 1.2, 0.2, 2600); tone(320, 900, 0.28, 'sine', 0.1); },
  deny: () => tone(220, 92, 0.17, 'square', 0.12),
  teleport: () => { noise(0.26, 1900, 0.8, 0.26, 320); tone(620, 200, 0.2, 'sine', 0.13); },
  pickup: () => tone(430, 660, 0.09, 'triangle', 0.13),
  drop: () => tone(520, 300, 0.09, 'triangle', 0.1),
  buttonOn: () => { tone(540, 800, 0.11, 'sine', 0.18); tone(800, 800, 0.16, 'sine', 0.09, 0.09); },
  buttonOff: () => tone(660, 380, 0.13, 'sine', 0.12),
  doorOpen: () => noise(0.3, 900, 1.4, 0.15, 1900),
  doorClose: () => noise(0.26, 1500, 1.4, 0.13, 480),
  fizzle: () => noise(0.4, 2600, 0.7, 0.22, 900),
  dissolve: () => { noise(0.45, 1100, 0.8, 0.18, 4200); tone(820, 1700, 0.35, 'sine', 0.07); },
  respawn: () => { tone(300, 150, 0.3, 'sine', 0.16); noise(0.2, 400, 1, 0.1); },
  exit: () => { tone(523, 523, 0.15, 'sine', 0.17); tone(784, 784, 0.26, 'sine', 0.17, 0.13); },
  complete: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.34, 'sine', 0.15, i * 0.16)),
  land: (speed) => { if (speed > 6) noise(0.11, 260, 1.2, Math.min(0.28, speed * 0.014)); },
};
