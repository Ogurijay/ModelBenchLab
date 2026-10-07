// WebAudio 芯片音乐:双方波 + 三角波低音 + 噪声鼓,模仿 GBA 的 PSG 声道。
// 乐谱:每小节 16 个十六分音符;音名如 C5,'-' 延音,'.' 休止。
let ac = null, master, musicBus, sfxBus, noiseBuf;
let muted = false;
let current = null, nextTime = 0, step = 0, timer = null;

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function freq(n) {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  if (!m) return 0;
  const midi = NOTE[m[1]] + (+m[2] + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (current) startLoop();
}

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ac.currentTime, 0.02); }
export const isMuted = () => muted;
export function setMusicVolume(v) { if (musicBus) musicBus.gain.value = 0.32 * v; }

// 窄脉冲波(12.5%/25% 占空比)用傅里叶级数近似,按占空比缓存
const waves = {};
function pulseWave(duty) {
  if (waves[duty]) return waves[duty];
  const n = 24, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return (waves[duty] = ac.createPeriodicWave(re, im));
}
function tone(type, f, t, dur, vol, bus, slideTo, duty) {
  if (!ac || !f) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  if (type === 'pulse' && duty) o.setPeriodicWave(pulseWave(duty));
  else o.type = type === 'pulse' ? 'square' : type;
  o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.04));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(t, dur, vol, hp, bus) {
  if (!ac) return;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t); s.stop(t + dur + 0.02);
}

// ---------------------------------------------------------------- 曲库
const SONGS = {
  title: {
    bpm: 128,
    lead: [
      'E5 - G5 - A5 - G5 E5 C5 - D5 - E5 - - -',
      'F5 - A5 - C6 - A5 F5 G5 - - - . . G5 -',
      'E5 - G5 - A5 - G5 E5 C6 - B5 - A5 - G5 -',
      'F5 - E5 - D5 - G4 - C5 - - - . . . .',
    ],
    harm: [
      'C5 . . . E5 . . . C5 . . . E5 . . .',
      'A4 . . . C5 . . . B4 . . . D5 . . .',
      'C5 . . . E5 . . . E5 . . . C5 . . .',
      'A4 . . . B4 . . . G4 . . . . . . .',
    ],
    bass: [
      'C3 . G3 . C3 . G3 . A2 . E3 . A2 . E3 .',
      'F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 .',
      'C3 . G3 . C3 . G3 . A2 . E3 . A2 . E3 .',
      'F2 . C3 . G2 . D3 . C3 . G2 . C3 . . .',
    ],
    drum: ['k . h . s . h . k . h k s . h .'],
  },
  town: {
    bpm: 118,
    lead: [
      'G4 - C5 - E5 - D5 C5 D5 - - - . . . .',
      'A4 - D5 - F5 - E5 D5 E5 - - - . . . .',
      'G4 - C5 - E5 - G5 - A5 - G5 - E5 - C5 -',
      'D5 - - - E5 - D5 - C5 - - - . . . .',
      'E5 - E5 - F5 - G5 - A5 - - - G5 - - -',
      'F5 - F5 - E5 - D5 - E5 - - - . . . .',
      'C5 - D5 - E5 - G5 - A5 - G5 - E5 - D5 -',
      'C5 - - - G4 - - - C5 - - - . . . .',
    ],
    harm: [
      'E4 . G4 . E4 . G4 . F4 . A4 . F4 . A4 .',
      'F4 . A4 . F4 . A4 . E4 . G4 . E4 . G4 .',
      'E4 . G4 . E4 . G4 . F4 . A4 . F4 . A4 .',
      'F4 . A4 . G4 . B4 . E4 . G4 . E4 . . .',
    ],
    bass: [
      'C3 . . C3 G2 . . . F2 . . F2 C3 . . .',
      'D3 . . D3 A2 . . . G2 . . G2 C3 . . .',
      'C3 . . C3 G2 . . . F2 . . F2 C3 . . .',
      'D3 . . . G2 . . . C3 . G2 . C3 . . .',
    ],
    drum: ['k . h h s . h . k k h . s . h h'],
  },
  home: {
    bpm: 96,
    lead: [
      'A4 - - C5 E5 - - - D5 - C5 - A4 - - -',
      'G4 - - A4 C5 - - - B4 - - - . . . .',
      'A4 - - C5 E5 - - - G5 - E5 - D5 - - -',
      'C5 - - B4 A4 - - - A4 - - - . . . .',
    ],
    harm: [
      'C4 . E4 . C4 . E4 . C4 . E4 . C4 . E4 .',
      'B3 . D4 . B3 . D4 . B3 . D4 . B3 . D4 .',
      'C4 . E4 . C4 . E4 . B3 . D4 . B3 . D4 .',
      'A3 . C4 . E4 . C4 . A3 . C4 . E4 . . .',
    ],
    bass: [
      'F2 - - - . . F2 . A2 - - - . . A2 .',
      'G2 - - - . . G2 . E2 - - - . . E2 .',
      'F2 - - - . . F2 . G2 - - - . . G2 .',
      'D2 - - - . . D2 . A2 - - - . . . .',
    ],
    drum: ['k . . . h . . . s . . . h . . .'],
  },
  night: {
    bpm: 80,
    lead: [
      'E5 - - - D5 - - - C5 - - - G4 - - -',
      'A4 - - - B4 - C5 - D5 - - - . . . .',
      'E5 - - - G5 - - - F5 - E5 - D5 - - -',
      'C5 - - - - - - - . . . . . . . .',
    ],
    harm: ['G4 . . . . . . . E4 . . . . . . .', 'F4 . . . . . . . G4 . . . . . . .'],
    bass: ['C3 - - - - - - - A2 - - - - - - -', 'F2 - - - - - - - G2 - - - - - - -'],
    drum: ['. . . . h . . . . . . . h . . .'],
  },
  shop: {
    bpm: 112,
    lead: [
      'C5 . E5 . G5 . A5 G5 . E5 . C5 D5 - - -',
      'D5 . F5 . A5 . C6 A5 . F5 . D5 E5 - - -',
      'C5 . E5 . G5 . A5 G5 . E5 . C5 A4 - - -',
      'B4 . D5 . F5 . E5 D5 C5 - - - . . . .',
    ],
    harm: ['E4 . . G4 . . E4 . F4 . . A4 . . F4 .', 'D4 . . F4 . . D4 . G4 . . B4 . . G4 .'],
    bass: ['C3 . . . G2 . . . F2 . . . C3 . . .', 'D3 . . . A2 . . . G2 . . . G2 . . .'],
    drum: ['k . h . s . h k . k h . s . h .'],
  },
  work: {
    bpm: 140,
    lead: [
      'E5 . E5 . G5 . E5 . D5 . C5 . D5 . E5 .',
      'A4 . A4 . C5 . A4 . G4 . A4 . C5 - - .',
      'E5 . E5 . G5 . A5 . G5 . E5 . D5 . C5 .',
      'D5 . E5 . D5 . C5 . A4 - - - . . . .',
    ],
    harm: ['A3 . C4 . E4 . C4 . A3 . C4 . E4 . C4 .', 'F3 . A3 . C4 . A3 . G3 . B3 . D4 . B3 .'],
    bass: ['A2 . A2 . A3 . A2 . A2 . A2 . A3 . A2 .', 'F2 . F2 . F3 . F2 . G2 . G2 . G3 . G2 .'],
    drum: ['k . h . s . h . k k h . s . h h'],
  },
  ending: {
    bpm: 100,
    lead: [
      'C5 - - - E5 - G5 - C6 - - - B5 - A5 -',
      'G5 - - - E5 - C5 - D5 - - - . . . .',
      'A5 - - - G5 - F5 - E5 - - - D5 - C5 -',
      'D5 - - - G4 - - - C5 - - - . . . .',
    ],
    harm: ['E4 . G4 . E4 . G4 . E4 . G4 . E4 . G4 .', 'F4 . A4 . F4 . A4 . G4 . B4 . G4 . B4 .'],
    bass: ['C3 - - - G2 - - - A2 - - - E2 - - -', 'F2 - - - C3 - - - G2 - - - G2 - - -'],
    drum: ['k . . . s . . . k . k . s . . .'],
  },
};
for (const s of Object.values(SONGS)) {
  for (const ch of ['lead', 'harm', 'bass', 'drum']) s[ch] = s[ch].map((bar) => bar.trim().split(/\s+/));
}

export function playMusic(name) {
  if (current === name) return;
  current = name;
  step = 0;
  if (ac) startLoop();
}
export const currentMusic = () => current;

function startLoop() {
  if (timer) clearInterval(timer);
  nextTime = ac.currentTime + 0.06;
  timer = setInterval(schedule, 25);
}

function schedule() {
  if (!ac || !current) return;
  const song = SONGS[current];
  if (!song) return;
  const sd = 60 / song.bpm / 4;
  while (nextTime < ac.currentTime + 0.12) {
    playStep(song, step, nextTime, sd);
    nextTime += sd;
    step++;
  }
}
function lenAt(bar, i) { let n = 1; while (bar[i + n] === '-') n++; return n; }
function playStep(song, st, t, sd) {
  const chans = [['lead', 'pulse', 0.16, 0.25], ['harm', 'pulse', 0.06, 0.125], ['bass', 'triangle', 0.28, 0]];
  for (const [ch, type, vol, duty] of chans) {
    const bars = song[ch];
    const bar = bars[Math.floor(st / 16) % bars.length];
    const i = st % 16;
    const n = bar[i];
    if (n && n !== '.' && n !== '-') tone(type, freq(n), t, sd * lenAt(bar, i) * 0.92, vol, musicBus, 0, duty);
  }
  const dbar = song.drum[Math.floor(st / 16) % song.drum.length];
  const d = dbar[st % 16];
  if (d === 'k') tone('sine', 140, t, 0.09, 0.4, musicBus, 45);
  if (d === 's') noise(t, 0.09, 0.22, 1800, musicBus);
  if (d === 'h') noise(t, 0.03, 0.08, 7000, musicBus);
}

// ---------------------------------------------------------------- 音效
export const sfx = {
  cursor() { if (!ac) return; tone('pulse', 1320, ac.currentTime, 0.035, 0.09, sfxBus, 0, 0.25); },
  select() { if (!ac) return; const t = ac.currentTime; tone('pulse', 988, t, 0.05, 0.12, sfxBus); tone('pulse', 1480, t + 0.05, 0.07, 0.12, sfxBus); },
  back() { if (!ac) return; const t = ac.currentTime; tone('pulse', 880, t, 0.05, 0.1, sfxBus); tone('pulse', 587, t + 0.05, 0.07, 0.1, sfxBus); },
  error() { if (!ac) return; const t = ac.currentTime; tone('square', 196, t, 0.09, 0.12, sfxBus); tone('square', 165, t + 0.1, 0.14, 0.12, sfxBus); },
  coin() { if (!ac) return; const t = ac.currentTime; tone('pulse', 1319, t, 0.06, 0.12, sfxBus, 0, 0.5); tone('pulse', 1976, t + 0.06, 0.18, 0.12, sfxBus, 0, 0.5); },
  levelup() {
    if (!ac) return; const t = ac.currentTime;
    ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => tone('pulse', freq(n), t + i * 0.07, 0.12, 0.12, sfxBus, 0, 0.25));
  },
  fanfare() {
    if (!ac) return; const t = ac.currentTime;
    [['C5', 0, 0.12], ['C5', 0.12, 0.08], ['C5', 0.2, 0.08], ['G5', 0.3, 0.3], ['E5', 0.62, 0.12], ['G5', 0.74, 0.12], ['C6', 0.86, 0.5]]
      .forEach(([n, o, d]) => { tone('pulse', freq(n), t + o, d, 0.13, sfxBus, 0, 0.25); tone('triangle', freq(n) / 2, t + o, d, 0.2, sfxBus); });
  },
  door() { if (!ac) return; const t = ac.currentTime; noise(t, 0.06, 0.2, 400, sfxBus); tone('square', 220, t + 0.05, 0.06, 0.08, sfxBus, 110); },
  step() { if (!ac) return; noise(ac.currentTime, 0.02, 0.04, 2500, sfxBus); },
  splash() { if (!ac) return; noise(ac.currentTime, 0.35, 0.18, 900, sfxBus); },
  bell() { if (!ac) return; const t = ac.currentTime; tone('sine', 1568, t, 0.5, 0.14, sfxBus); tone('sine', 2093, t + 0.12, 0.6, 0.1, sfxBus); },
  good() { if (!ac) return; const t = ac.currentTime; tone('pulse', 784, t, 0.07, 0.11, sfxBus); tone('pulse', 1047, t + 0.07, 0.07, 0.11, sfxBus); tone('pulse', 1319, t + 0.14, 0.12, 0.11, sfxBus); },
  bad() { if (!ac) return; const t = ac.currentTime; tone('square', 330, t, 0.1, 0.1, sfxBus, 220); tone('square', 233, t + 0.1, 0.2, 0.1, sfxBus, 150); },
  thud() { if (!ac) return; tone('sine', 120, ac.currentTime, 0.15, 0.4, sfxBus, 40); },
  wrench() { if (!ac) return; const t = ac.currentTime; noise(t, 0.05, 0.16, 3000, sfxBus); tone('square', 660, t, 0.04, 0.06, sfxBus); },
  phone() { if (!ac) return; const t = ac.currentTime; for (let i = 0; i < 4; i++) tone('pulse', i % 2 ? 1200 : 960, t + i * 0.06, 0.05, 0.08, sfxBus); },
  fire() { if (!ac) return; noise(ac.currentTime, 0.4, 0.12, 300, sfxBus); },
  // 模拟语(Simlish):随机音节
  speak(voice = 1, n = 4) {
    if (!ac) return;
    let t = ac.currentTime;
    for (let i = 0; i < n; i++) {
      const f = (260 + Math.random() * 220) * voice;
      const d = 0.05 + Math.random() * 0.06;
      tone('pulse', f, t, d, 0.07, sfxBus, f * (0.85 + Math.random() * 0.4), 0.25);
      t += d + 0.02;
    }
  },
  type(voice = 1) { if (!ac) return; tone('pulse', (520 + Math.random() * 120) * voice, ac.currentTime, 0.022, 0.035, sfxBus, 0, 0.125); },
};
