// audio.js — WebAudio 程序化芯片音乐:音效 + 昼/夜/标题三首 BGM(零音频资产)
// 首次用户输入后 unlock();游戏循环每帧调 update() 做 BGM 前瞻调度。

let ctx = null;
let master = null, sfxBus = null, musBus = null;
let noiseBuf = null;

const state = {
  muted: false,
  song: null,        // 当前歌名
  songDef: null,
  nextStep: 0,       // 下一个待调度的 16 分音符步
  stepTime: 0,       // 该步的绝对时间
  loops: new Map(),  // 持续音效(淋浴等)
};

function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

function makeNoise() {
  const len = ctx.sampleRate * 1;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ---- 简易发声原语 ----
function tone({ wave = 'square', f0 = 440, f1 = null, t = 0, dur = 0.1, vol = 0.2, bus = null, slideT = null }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = wave;
  const start = ctx.currentTime + t;
  o.frequency.setValueAtTime(f0, start);
  if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + (slideT ?? dur));
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.connect(g).connect(bus || sfxBus);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noiseHit({ t = 0, dur = 0.08, vol = 0.15, freq = 3000, type = 'highpass', bus = null }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = freq;
  const g = ctx.createGain();
  const start = ctx.currentTime + t;
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.connect(fl).connect(g).connect(bus || sfxBus);
  src.start(start);
  src.stop(start + dur + 0.02);
}

// ---- BGM 曲谱 ----
// 音轨:{wave, vol, notes:[[step, midi, lenSteps]...]};鼓:hat/kick 步列表。stepsTotal 循环长度。
function bass(prog, patt, base) {
  // prog: 每小节根音 midi;patt: 小节内 [step, degreeOffset, len]
  const notes = [];
  prog.forEach((root, bar) => {
    patt.forEach(([s, off, l]) => notes.push([bar * 16 + s, root + off, l]));
  });
  return notes;
}

const SONGS = {
  day: {
    bpm: 118, stepsTotal: 64,
    tracks: [
      { wave: 'square', vol: 0.10, notes: [
        [0, 72, 2], [2, 76, 2], [4, 79, 2], [6, 76, 2], [8, 81, 3], [12, 79, 3],
        [16, 77, 2], [18, 76, 2], [20, 74, 2], [22, 76, 2], [24, 72, 5],
        [32, 69, 2], [34, 72, 2], [36, 76, 2], [38, 72, 2], [40, 77, 3], [44, 76, 3],
        [48, 74, 2], [50, 76, 2], [52, 74, 2], [54, 71, 2], [56, 72, 5],
      ] },
      { wave: 'square', vol: 0.05, notes: [
        [0, 64, 2], [4, 67, 2], [8, 69, 2], [12, 67, 2],
        [16, 65, 2], [20, 64, 2], [24, 64, 4],
        [32, 60, 2], [36, 64, 2], [40, 65, 2], [44, 64, 2],
        [48, 62, 2], [52, 59, 2], [56, 60, 4],
      ] },
      { wave: 'triangle', vol: 0.16, notes: bass([48, 45, 41, 43], [[0, 0, 2], [4, 7, 2], [8, 0, 2], [12, 7, 2]], 0) },
    ],
    hat: (() => { const a = []; for (let i = 0; i < 64; i += 4) a.push(i); return a; })(),
    kick: (() => { const a = []; for (let i = 0; i < 64; i += 8) a.push(i); return a; })(),
  },
  night: {
    bpm: 84, stepsTotal: 64,
    tracks: [
      { wave: 'triangle', vol: 0.14, notes: [
        [0, 76, 4], [4, 74, 4], [8, 72, 6], [16, 69, 4], [20, 72, 4], [24, 71, 6],
        [32, 76, 4], [36, 79, 4], [40, 77, 6], [48, 74, 4], [52, 71, 4], [56, 72, 6],
      ] },
      { wave: 'sine', vol: 0.08, notes: [
        [0, 57, 8], [8, 57, 8], [16, 53, 8], [24, 55, 8],
        [32, 57, 8], [40, 53, 8], [48, 55, 8], [56, 48, 8],
      ] },
    ],
    hat: [], kick: [0, 16, 32, 48],
  },
  title: {
    bpm: 108, stepsTotal: 32,
    tracks: [
      { wave: 'square', vol: 0.09, notes: [
        [0, 67, 2], [2, 72, 2], [4, 76, 4], [8, 74, 2], [10, 72, 2], [12, 74, 4],
        [16, 67, 2], [18, 71, 2], [20, 74, 4], [24, 72, 6],
      ] },
      { wave: 'triangle', vol: 0.15, notes: bass([48, 43], [[0, 0, 3], [4, 0, 3], [8, 5, 3], [12, 7, 3]], 0) },
    ],
    hat: [0, 4, 8, 12, 16, 20, 24, 28], kick: [],
  },
};

function scheduleStep(def, step, when) {
  for (const tr of def.tracks) {
    for (const [s, m, len] of tr.notes) {
      if (s === step) {
        const spb = 60 / def.bpm / 4;
        tone({ wave: tr.wave, f0: midi(m), t: when - ctx.currentTime, dur: len * spb * 0.92, vol: tr.vol, bus: musBus });
      }
    }
  }
  if (def.hat.includes(step)) noiseHit({ t: when - ctx.currentTime, dur: 0.03, vol: 0.035, freq: 6000, bus: musBus });
  if (def.kick.includes(step)) tone({ wave: 'sine', f0: 120, f1: 45, t: when - ctx.currentTime, dur: 0.1, vol: 0.22, bus: musBus });
}

export const Audio = {
  get muted() { return state.muted; },

  unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = state.muted ? 0 : 0.9;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.gain.value = 0.9; musBus.connect(master);
    noiseBuf = makeNoise();
    if (state.song) this.bgm(state.song, true);
  },

  setMuted(m) {
    state.muted = m;
    if (master) master.gain.value = m ? 0 : 0.9;
  },
  toggleMuted() { this.setMuted(!state.muted); return state.muted; },

  bgm(name, force = false) {
    if (!force && state.song === name) return;
    state.song = name;
    state.songDef = name ? SONGS[name] : null;
    state.nextStep = 0;
    state.stepTime = ctx ? ctx.currentTime + 0.08 : 0;
  },

  // 每帧调用:前瞻 0.15s 调度 BGM
  update() {
    if (!ctx || !state.songDef) return;
    const def = state.songDef;
    const spb = 60 / def.bpm / 4;
    while (state.stepTime < ctx.currentTime + 0.15) {
      scheduleStep(def, state.nextStep % def.stepsTotal, Math.max(state.stepTime, ctx.currentTime));
      state.nextStep++;
      state.stepTime += spb;
    }
  },

  sfx(name) {
    if (!ctx) return;
    switch (name) {
      case 'blip': tone({ f0: 900, f1: 720, dur: 0.05, vol: 0.12 }); break;
      case 'ok': tone({ f0: 660, dur: 0.06, vol: 0.14 }); tone({ f0: 990, t: 0.06, dur: 0.09, vol: 0.14 }); break;
      case 'cancel': tone({ f0: 500, f1: 240, dur: 0.09, vol: 0.13 }); break;
      case 'error': tone({ wave: 'sawtooth', f0: 200, dur: 0.09, vol: 0.14 }); tone({ wave: 'sawtooth', f0: 160, t: 0.1, dur: 0.14, vol: 0.14 }); break;
      case 'coin': [880, 1174, 1568].forEach((f, i) => tone({ wave: 'triangle', f0: f, t: i * 0.05, dur: 0.09, vol: 0.16 })); break;
      case 'pay': tone({ wave: 'triangle', f0: 1568, dur: 0.06, vol: 0.15 }); tone({ wave: 'triangle', f0: 1046, t: 0.07, dur: 0.1, vol: 0.15 }); break;
      case 'doorbell': tone({ wave: 'triangle', f0: 988, dur: 0.35, vol: 0.2 }); tone({ wave: 'triangle', f0: 784, t: 0.28, dur: 0.5, vol: 0.2 }); break;
      case 'door': noiseHit({ dur: 0.09, vol: 0.1, freq: 900, type: 'bandpass' }); tone({ wave: 'square', f0: 180, dur: 0.05, vol: 0.06, t: 0.02 }); break;
      case 'eat': [0, 0.14, 0.28].forEach((t) => noiseHit({ t, dur: 0.07, vol: 0.13, freq: 1200, type: 'bandpass' })); break;
      case 'flush': noiseHit({ dur: 0.7, vol: 0.16, freq: 800, type: 'bandpass' }); tone({ wave: 'sine', f0: 300, f1: 90, dur: 0.7, vol: 0.08 }); break;
      case 'sleep': tone({ wave: 'triangle', f0: 520, f1: 260, dur: 0.5, vol: 0.1 }); break;
      case 'wake': [523, 659, 784].forEach((f, i) => tone({ wave: 'square', f0: f, t: i * 0.09, dur: 0.12, vol: 0.1 })); break;
      case 'jingle': [72, 76, 79, 84, 88].forEach((m, i) => tone({ f0: midi(m), t: i * 0.09, dur: i === 4 ? 0.4 : 0.11, vol: 0.13 })); break;
      case 'sad': [64, 60, 55].forEach((m, i) => tone({ wave: 'triangle', f0: midi(m), t: i * 0.16, dur: 0.2, vol: 0.13 })); break;
      case 'horn': [0, 0.5].forEach((t) => { tone({ wave: 'sawtooth', f0: 220, t, dur: 0.28, vol: 0.1 }); tone({ wave: 'sawtooth', f0: 277, t, dur: 0.28, vol: 0.1 }); }); break;
      case 'meow': tone({ wave: 'square', f0: 1100, f1: 500, dur: 0.28, vol: 0.08, slideT: 0.25 }); break;
      case 'splash': noiseHit({ dur: 0.25, vol: 0.15, freq: 1500, type: 'lowpass' }); break;
      case 'knock': [0, 0.18].forEach((t) => noiseHit({ t, dur: 0.05, vol: 0.2, freq: 350, type: 'bandpass' })); break;
      case 'boot': tone({ wave: 'sine', f0: 1046, dur: 0.5, vol: 0.16 }); tone({ wave: 'sine', f0: 1318, t: 0.06, dur: 0.6, vol: 0.12 }); break;
      case 'mail': tone({ wave: 'triangle', f0: 740, dur: 0.08, vol: 0.14 }); tone({ wave: 'triangle', f0: 988, t: 0.09, dur: 0.14, vol: 0.14 }); break;
      case 'powercut': tone({ wave: 'sawtooth', f0: 300, f1: 60, dur: 0.8, vol: 0.14 }); break;
      case 'tv': tone({ wave: 'square', f0: 440, dur: 0.04, vol: 0.06 }); break;
    }
  },

  // 持续循环音效(淋浴水声等)
  startLoop(name) {
    if (!ctx || state.loops.has(name)) return;
    if (name === 'shower') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 2400; fl.Q.value = 0.6;
      const g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(fl).connect(g).connect(sfxBus);
      src.start();
      state.loops.set(name, { src, g });
    }
  },
  stopLoop(name) {
    const l = state.loops.get(name);
    if (!l) return;
    try { l.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); l.src.stop(ctx.currentTime + 0.2); } catch { /* noop */ }
    state.loops.delete(name);
  },
  stopAllLoops() { [...state.loops.keys()].forEach((k) => this.stopLoop(k)); },
};
