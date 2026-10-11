// 程序化音效与环境音(WebAudio 实时合成,无音频文件)。
import { BLOCKS } from './blocks.js';

let ac = null, master = null, sfxGain = null, musicGain = null, ambGain = null, noiseBuf = null, delay = null;
const state = { sfx: 0.7, music: 0.35, enabled: true, musicOn: true };
const amb = {};

export function audioSettings() { return state; }
export function setVolumes(s, m) {
  if (s !== undefined) state.sfx = s;
  if (m !== undefined) state.music = m;
  if (sfxGain) { sfxGain.gain.value = state.sfx; ambGain.gain.value = state.sfx * 0.8; musicGain.gain.value = state.music; }
}

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; return; }
  master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
  sfxGain = ac.createGain(); sfxGain.gain.value = state.sfx; sfxGain.connect(master);
  ambGain = ac.createGain(); ambGain.gain.value = state.sfx * 0.8; ambGain.connect(master);
  musicGain = ac.createGain(); musicGain.gain.value = state.music; musicGain.connect(master);
  // 音乐用回声
  delay = ac.createDelay(1.5); delay.delayTime.value = 0.42;
  const fb = ac.createGain(); fb.gain.value = 0.38;
  const dl = ac.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
  delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(musicGain);
  const len = ac.sampleRate * 2;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  startAmbient();
}

function env(g, t, a, peak, dec, sus = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t + a + dec);
}
function noise(t, dur, type, freq, q, vol, out = sfxGain, sweepTo) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ac.createGain(); env(g, t, 0.004, vol, dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(t, dur, type, f0, f1, vol, out = sfxGain, attack = 0.005) {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g, t, attack, vol, dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + attack + 0.05);
}

const MAT = {
  stone: [1800, 'bandpass', 2.5], dirt: [500, 'lowpass', 1], wood: [900, 'bandpass', 3], grass: [3200, 'highpass', 0.7],
  sand: [1200, 'lowpass', 0.8], glass: [3000, 'bandpass', 8], snow: [700, 'lowpass', 0.6], cloth: [600, 'lowpass', 0.6], metal: [2400, 'bandpass', 10],
};
let lastDist = 1;
export function play(name, opt = {}) {
  if (!ac || !state.enabled) return;
  const t = ac.currentTime;
  const vol = (opt.vol ?? 1) * (opt.dist !== undefined ? Math.max(0, 1 - opt.dist / 28) : 1);
  if (vol <= 0.01) return;
  const mat = MAT[BLOCKS[opt.id]?.sound || 'stone'] || MAT.stone;
  switch (name) {
    case 'dig': noise(t, 0.07, mat[1], mat[0] * (0.85 + Math.random() * 0.3), mat[2], 0.22 * vol); if (BLOCKS[opt.id]?.sound === 'wood') tone(t, 0.06, 'triangle', 240, 180, 0.12 * vol); break;
    case 'break': noise(t, 0.16, mat[1], mat[0] * 0.8, mat[2], 0.32 * vol, sfxGain, mat[0] * 0.5); if (BLOCKS[opt.id]?.sound === 'glass') { tone(t, 0.2, 'sine', 2600, 2400, 0.12 * vol); tone(t + 0.03, 0.2, 'sine', 3400, 3100, 0.08 * vol); } break;
    case 'place': tone(t, 0.08, 'sine', 160, 90, 0.3 * vol); noise(t, 0.05, mat[1], mat[0], mat[2], 0.16 * vol); break;
    case 'step': noise(t, 0.04, mat[1], mat[0] * 0.8, mat[2], 0.06 * vol); break;
    case 'land': tone(t, 0.1, 'sine', 120, 60, 0.25 * vol); noise(t, 0.08, mat[1], mat[0] * 0.7, mat[2], 0.12 * vol); break;
    case 'jump': noise(t, 0.08, 'bandpass', 900, 1, 0.04 * vol, sfxGain, 1600); break;
    case 'hurt': tone(t, 0.16, 'square', 330, 150, 0.14 * vol); noise(t, 0.08, 'lowpass', 900, 1, 0.12 * vol); break;
    case 'mobHurt': case 'mobDie': case 'animalHurt': mobVoice(t, opt.kind, name === 'mobDie', vol); break;
    case 'explode': noise(t, 1.3, 'lowpass', 1400, 0.7, 0.9 * vol, sfxGain, 60); tone(t, 0.8, 'sine', 70, 30, 0.7 * vol); break;
    case 'fuse': noise(t, 1.4, 'highpass', 2500, 0.8, 0.12 * vol, sfxGain, 5000); break;
    case 'bow': tone(t, 0.18, 'triangle', 200, 120, 0.22 * vol); noise(t, 0.06, 'highpass', 3000, 1, 0.1 * vol); break;
    case 'arrowHit': tone(t, 0.06, 'square', 300, 120, 0.1 * vol); break;
    case 'eat': noise(t, 0.07, 'bandpass', 1400 + Math.random() * 800, 2, 0.18 * vol); break;
    case 'burp': tone(t, 0.25, 'sawtooth', 110, 80, 0.08 * vol); break;
    case 'pop': case 'pickup': tone(t, 0.07, 'sine', 700 + Math.random() * 200, 1400, 0.13 * vol); break;
    case 'toolBreak': noise(t, 0.25, 'bandpass', 2500, 3, 0.35 * vol); tone(t, 0.25, 'square', 900, 300, 0.12 * vol); break;
    case 'doorOpen': case 'doorClose': tone(t, 0.18, 'sawtooth', name === 'doorOpen' ? 140 : 180, name === 'doorOpen' ? 200 : 110, 0.07 * vol); noise(t + 0.12, 0.05, 'bandpass', 700, 3, 0.2 * vol); break;
    case 'chest': tone(t, 0.22, 'sawtooth', 120, 180, 0.06 * vol); noise(t, 0.08, 'bandpass', 800, 3, 0.15 * vol); break;
    case 'splash': case 'bucket': noise(t, 0.3, 'bandpass', 1800, 1.2, 0.25 * vol, sfxGain, 500); break;
    case 'fizz': noise(t, 0.5, 'highpass', 4000, 0.7, 0.2 * vol); break;
    case 'ignite': noise(t, 0.15, 'highpass', 3000, 1, 0.25 * vol); break;
    case 'bonemeal': [0, 0.06, 0.12].forEach((d, i) => tone(t + d, 0.12, 'sine', 900 + i * 300, 1100 + i * 300, 0.08 * vol)); break;
    case 'craft': tone(t, 0.12, 'triangle', 520, 520, 0.12 * vol); tone(t + 0.07, 0.15, 'triangle', 780, 780, 0.1 * vol); break;
    case 'shear': noise(t, 0.05, 'highpass', 5000, 1, 0.2 * vol); noise(t + 0.08, 0.05, 'highpass', 5000, 1, 0.2 * vol); break;
    case 'thunder': noise(t, 2.6, 'lowpass', 380, 0.6, 0.8 * vol, ambGain, 60); noise(t + 0.1, 0.4, 'lowpass', 1600, 0.7, 0.4 * vol, ambGain, 200); break;
    case 'ui': tone(t, 0.03, 'square', 1200, 1200, 0.04); break;
    case 'chime': [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, 0.5, 'sine', f, f, 0.12, musicGain)); break;
    case 'blood': [220, 207, 196, 147].forEach((f, i) => tone(t + i * 0.25, 0.9, 'sawtooth', f, f * 0.98, 0.05, musicGain, 0.05)); break;
    case 'sleep': [392, 330, 262].forEach((f, i) => tone(t + i * 0.3, 0.8, 'sine', f, f, 0.1, musicGain, 0.05)); break;
    case 'pick': tone(t, 0.05, 'triangle', 600, 900, 0.1 * vol); break;
    case 'grow': tone(t, 0.2, 'sine', 400, 800, 0.06 * vol); break;
  }
}
function mobVoice(t, kind, die, vol) {
  const k = die ? 0.75 : 1;
  switch (kind) {
    case 'zombie': tone(t, 0.35, 'sawtooth', 120 * k, 90 * k, 0.12 * vol); break;
    case 'skeleton': for (let i = 0; i < 3; i++) noise(t + i * 0.05, 0.04, 'bandpass', 2200, 4, 0.18 * vol); break;
    case 'creeper': noise(t, 0.2, 'highpass', 2000, 1, 0.12 * vol); break;
    case 'spider': noise(t, 0.25, 'bandpass', 3000, 2, 0.12 * vol, sfxGain, 1500); break;
    case 'slime': case 'lava_slime': tone(t, 0.15, 'sine', 300 * k, 120 * k, 0.2 * vol); break;
    case 'demon_eye': tone(t, 0.15, 'square', 500 * k, 250 * k, 0.08 * vol); break;
    case 'bat': tone(t, 0.08, 'square', 2000, 1500, 0.06 * vol); break;
    case 'pig': tone(t, 0.2, 'sawtooth', 340 * k, 220 * k, 0.1 * vol); break;
    case 'cow': tone(t, 0.45, 'sawtooth', 150 * k, 120 * k, 0.1 * vol); break;
    case 'sheep': { const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = 420 * k; l.frequency.value = 18; lg.gain.value = 30; l.connect(lg); lg.connect(o.frequency); env(g, t, 0.01, 0.07 * vol, 0.4); o.connect(g); g.connect(sfxGain); o.start(t); l.start(t); o.stop(t + 0.45); l.stop(t + 0.45); break; }
    case 'chicken': for (let i = 0; i < 2; i++) tone(t + i * 0.08, 0.05, 'square', 950 * k, 800 * k, 0.06 * vol); break;
    default: tone(t, 0.15, 'square', 300, 200, 0.08 * vol);
  }
}

// —— 环境音:雨、风、夜虫、鸟鸣、洞穴滴水、地狱轰鸣 + 生成式背景音乐
function loopNoise(type, freq, q) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(ambGain); s.start();
  return { g, f };
}
function startAmbient() {
  amb.rain = loopNoise('bandpass', 2400, 0.5);
  amb.wind = loopNoise('lowpass', 400, 0.8);
  amb.hell = loopNoise('lowpass', 120, 1.2);
  amb.next = 0; amb.music = 2;
}
const SCALES = {
  day: [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3],
  night: [220, 261.6, 293.7, 329.6, 392, 440, 523.3],
  cave: [146.8, 174.6, 196, 220, 261.6, 293.7],
  hell: [110, 116.5, 146.8, 155.6, 220],
  blood: [110, 130.8, 155.6, 185, 207.7],
};
export function updateAmbient(dt, s) {
  if (!ac) return;
  const t = ac.currentTime;
  const set = (o, v) => o.g.gain.setTargetAtTime(v, t, 0.6);
  set(amb.rain, s.rain * (s.underground ? 0.1 : 0.22));
  set(amb.wind, (s.underground ? 0.02 : 0.05 + s.rain * 0.08) * (s.altitude ? 1.8 : 1));
  set(amb.hell, s.hell ? 0.3 : 0);
  amb.next -= dt;
  if (amb.next <= 0) {
    amb.next = 0.3 + Math.random() * 1.5;
    if (!s.underground && !s.hell) {
      if (s.night && Math.random() < 0.7) for (let i = 0; i < 3; i++) tone(t + i * 0.06, 0.04, 'sine', 4200 + Math.random() * 300, 4200, 0.012, ambGain);
      else if (!s.night && s.rain < 0.2 && Math.random() < 0.35) { const f = 2000 + Math.random() * 1500; tone(t, 0.09, 'sine', f, f * 1.3, 0.02, ambGain); tone(t + 0.12, 0.08, 'sine', f * 1.1, f * 0.9, 0.018, ambGain); }
    } else if (s.underground && Math.random() < 0.25) { const f = 900 + Math.random() * 900; tone(t, 0.2, 'sine', f, f * 0.8, 0.025, ambGain); }
  }
  // 生成式音乐
  if (!state.musicOn) return;
  amb.music -= dt;
  if (amb.music <= 0) {
    const sc = SCALES[s.blood ? 'blood' : s.hell ? 'hell' : s.underground ? 'cave' : s.night ? 'night' : 'day'];
    amb.music = 1.2 + Math.random() * 2.6;
    const f = sc[(Math.random() * sc.length) | 0] * (Math.random() < 0.2 ? 0.5 : 1);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = s.underground || s.hell ? 'sine' : 'triangle'; o.frequency.value = f;
    env(g, t, 0.08, 0.05, 2.4);
    o.connect(g); g.connect(musicGain); g.connect(delay);
    o.start(t); o.stop(t + 2.6);
    if (Math.random() < 0.4) { const o2 = ac.createOscillator(), g2 = ac.createGain(); o2.type = 'sine'; o2.frequency.value = f * 1.5; env(g2, t + 0.2, 0.1, 0.025, 2); o2.connect(g2); g2.connect(musicGain); g2.connect(delay); o2.start(t + 0.2); o2.stop(t + 2.4); }
  }
}
