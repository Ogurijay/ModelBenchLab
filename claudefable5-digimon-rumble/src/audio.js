// WebAudio 程序化音效 + 轻量 BGM。无外部音频文件,全部合成。
let ctx = null;
let master = null;
let musicGain = null;
let muted = false;
let bgmTimer = null;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function env(node, t0, a = 0.005, d = 0.15, peak = 1, sustain = 0) {
  node.gain.setValueAtTime(0, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + a);
  node.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d);
}

function osc(type, freq, t0, dur, gain = 0.3, dest = null, glideTo = null) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  env(g, t0, 0.004, dur, gain);
  o.connect(g).connect(dest || master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(t0, dur, gain = 0.3, filterFreq = 2000, q = 1, type = 'lowpass') {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, 0.003, dur, gain);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  select() { ensure(); const t = ctx.currentTime; osc('square', 620, t, 0.06, 0.12); },
  confirm() { ensure(); const t = ctx.currentTime;
    osc('square', 520, t, 0.07, 0.14); osc('square', 780, t + 0.07, 0.12, 0.14); },
  cancel() { ensure(); const t = ctx.currentTime; osc('square', 420, t, 0.1, 0.12, null, 240); },
  jump() { ensure(); const t = ctx.currentTime; osc('sine', 300, t, 0.16, 0.16, null, 620); },
  swing() { ensure(); const t = ctx.currentTime; noise(t, 0.1, 0.1, 1600, 2, 'bandpass'); },
  hit() { ensure(); const t = ctx.currentTime;
    noise(t, 0.12, 0.4, 900, 1); osc('sine', 180, t, 0.12, 0.35, null, 70); },
  hitHeavy() { ensure(); const t = ctx.currentTime;
    noise(t, 0.25, 0.5, 600, 1); osc('sine', 140, t, 0.3, 0.5, null, 45);
    osc('sawtooth', 90, t, 0.25, 0.2, null, 40); },
  guard() { ensure(); const t = ctx.currentTime;
    osc('triangle', 900, t, 0.08, 0.2, null, 500); noise(t, 0.06, 0.12, 4000, 2, 'highpass'); },
  shoot() { ensure(); const t = ctx.currentTime;
    osc('sawtooth', 800, t, 0.18, 0.16, null, 200); noise(t, 0.12, 0.12, 2400, 2, 'bandpass'); },
  beam() { ensure(); const t = ctx.currentTime;
    osc('sawtooth', 120, t, 0.5, 0.22, null, 480); noise(t, 0.4, 0.18, 3000, 3, 'bandpass'); },
  explode() { ensure(); const t = ctx.currentTime;
    noise(t, 0.5, 0.55, 350, 1); osc('sine', 90, t, 0.45, 0.4, null, 35); },
  evolve() { ensure(); const t = ctx.currentTime;
    // 上升琶音 + 光辉长音
    const seq = [392, 494, 587, 784, 988, 1175];
    seq.forEach((f, i) => osc('square', f, t + i * 0.09, 0.22, 0.12));
    osc('sawtooth', 196, t, 1.6, 0.12, null, 392);
    noise(t + 0.5, 1.0, 0.1, 5000, 1, 'highpass'); },
  ko() { ensure(); const t = ctx.currentTime;
    noise(t, 0.8, 0.6, 300, 1); osc('sine', 70, t, 0.8, 0.55, null, 28);
    osc('square', 220, t + 0.05, 0.5, 0.15, null, 55); },
  roundStart() { ensure(); const t = ctx.currentTime;
    osc('square', 494, t, 0.1, 0.16); osc('square', 494, t + 0.14, 0.1, 0.16);
    osc('square', 740, t + 0.3, 0.3, 0.2); },
  victory() { ensure(); const t = ctx.currentTime;
    const seq = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.4]];
    seq.forEach(([f, dt]) => osc('square', f, t + dt, 0.3, 0.15));
    osc('triangle', 262, t, 0.9, 0.18); },
  timeTick() { ensure(); const t = ctx.currentTime; osc('square', 980, t, 0.05, 0.1); },
};

// —— 简易 BGM:两小节战斗琶音循环(方波 + 低音),很 PS2 街机味 ——
const BASS = [110, 110, 130.8, 98];           // A A C G
const ARP = [220, 277, 330, 277, 220, 277, 440, 330];
let bgmStep = 0;

export function startBgm() {
  ensure();
  stopBgm();
  bgmStep = 0;
  const stepDur = 0.152; // ~99 BPM 十六分
  const tick = () => {
    const t = ctx.currentTime + 0.03;
    const bar = Math.floor(bgmStep / 8) % 4;
    const idx = bgmStep % 8;
    // 低音每半小节
    if (idx === 0 || idx === 4) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = BASS[bar];
      env(g, t, 0.005, 0.42, 0.5);
      o.connect(g).connect(musicGain); o.start(t); o.stop(t + 0.5);
    }
    // 琶音
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = ARP[idx] * (bar === 2 ? 1.189 : 1); // 第三小节升三度色彩
    env(g, t, 0.004, 0.11, 0.16);
    o.connect(g).connect(musicGain); o.start(t); o.stop(t + 0.18);
    // 底鼓/军鼓
    if (idx === 0) { const n = noiseNode(t, 0.1, 0.3, 120); }
    if (idx === 4) { noiseNode(t, 0.08, 0.2, 1800, 'bandpass'); }
    bgmStep++;
  };
  function noiseNode(t, dur, gain, freq, type = 'lowpass') {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); env(g, t, 0.002, dur, gain);
    src.connect(f).connect(g).connect(musicGain); src.start(t);
  }
  bgmTimer = setInterval(tick, stepDur * 1000);
}

export function stopBgm() {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
}

export function unlockAudio() { ensure(); }
