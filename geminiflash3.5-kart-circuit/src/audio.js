// 赛博气垫赛车纯代码音频合成引擎
let audioCtx = null;

// 引擎振荡器和增益节点
let oscSaw = null;
let oscTri = null;
let engineGain = null;
let engineFilter = null;

// 漂移摩擦音（白噪声）
let driftNoiseNode = null;
let driftGain = null;
let driftFilter = null;

// 缓存的白噪声 Buffer
let noiseBuffer = null;

function createNoiseBuffer() {
  if (noiseBuffer) return noiseBuffer;
  
  const bufferSize = 2 * 44100; // 2秒白噪声
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return noiseBuffer;
}

/**
 * 用户点击“START”时由主线程手势触发解锁 AudioContext
 */
export function initAudio() {
  if (audioCtx) return;
  
  // 兼容性创建
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();
  
  // 确保在被暂停状态下恢复 (部分浏览器安全策略)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // 1. 构筑引擎声合成电路
  // oscSaw (粗糙锯齿波) + oscTri (沉厚三角波) -> filter (低通) -> gain -> destination
  oscSaw = audioCtx.createOscillator();
  oscSaw.type = 'sawtooth';
  
  oscTri = audioCtx.createOscillator();
  oscTri.type = 'triangle';
  
  engineFilter = audioCtx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 280; // 截断高频刺耳噪音

  engineGain = audioCtx.createGain();
  engineGain.gain.value = 0.0; // 初始静音

  // 串联引擎电路
  oscSaw.connect(engineFilter);
  oscTri.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(audioCtx.destination);

  // 启动振荡器
  oscSaw.start(0);
  oscTri.start(0);

  // 渐入引擎声
  const now = audioCtx.currentTime;
  engineGain.gain.setValueAtTime(0, now);
  engineGain.gain.linearRampToValueAtTime(0.22, now + 0.5);

  // 2. 构筑漂移能量摩擦声电路
  // NoiseSource -> BandpassFilter -> Gain -> Destination
  const buffer = createNoiseBuffer();
  driftNoiseNode = audioCtx.createBufferSource();
  driftNoiseNode.buffer = buffer;
  driftNoiseNode.loop = true;

  driftFilter = audioCtx.createBiquadFilter();
  driftFilter.type = 'bandpass';
  driftFilter.frequency.value = 850; // 中频摩擦声
  driftFilter.Q.value = 3.0;

  driftGain = audioCtx.createGain();
  driftGain.gain.value = 0.0;

  driftNoiseNode.connect(driftFilter);
  driftFilter.connect(driftGain);
  driftGain.connect(audioCtx.destination);
  
  driftNoiseNode.start(0);
}

/**
 * 实时同步更新引擎声的频率与音量
 */
export function updateEngineAudio(speed, throttle, boostActive) {
  if (!audioCtx || audioCtx.state === 'suspended') return;

  const now = audioCtx.currentTime;
  const absSpeed = Math.abs(speed);

  // 根据当前车速和油门解算基础引擎音调 (赫兹)
  const baseFreq = 42.0;
  // 速度越快音调越高，踩油门音调高，小喷时音调极高
  const targetFreq = baseFreq + absSpeed * 2.8 + throttle * 12.0 + (boostActive ? 32.0 : 0.0);

  // 平滑滑音过渡 (防止断音爆音)
  oscSaw.frequency.setTargetAtTime(targetFreq, now, 0.12);
  oscTri.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.12); // 三角波作为亚八度低音

  // 随着速度增快，气流低通截止频率略微上升，声音变得更亮
  const targetFilterFreq = 260 + absSpeed * 6.5 + (boostActive ? 150 : 0);
  engineFilter.frequency.setTargetAtTime(targetFilterFreq, now, 0.15);

  // 动态音量：踩油门音量变大
  const targetVolume = 0.08 + (throttle * 0.1) + (boostActive ? 0.08 : 0);
  engineGain.gain.setTargetAtTime(targetVolume, now, 0.1);
}

/**
 * 播放漂移能量磨砂胎噪
 */
export function setDriftAudioActive(isActive) {
  if (!audioCtx || !driftGain) return;
  const now = audioCtx.currentTime;
  const targetVol = isActive ? 0.15 : 0.0;
  driftGain.gain.setTargetAtTime(targetVol, now, 0.08); // 快速渐变
}

/**
 * 播放小喷喷气音效 (白噪声爆裂 + 指数衰减)
 */
export function playBoostSound(intensity = 1.0) {
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;

  // 1. 创建临时的白噪声源
  const noise = audioCtx.createBufferSource();
  noise.buffer = createNoiseBuffer();

  // 2. 高通滤波，做出“嘶嘶”的空气爆裂声
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1400; // 高频

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.42 * intensity, now);
  // 在 1.2 秒内呈指数衰减拉回零
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.25);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  // 3. 伴随一个小频段震荡低音炮，营造推进爆发冲击力
  const subOsc = audioCtx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(100, now);
  subOsc.frequency.exponentialRampToValueAtTime(40, now + 0.4);

  const subGain = audioCtx.createGain();
  subGain.gain.setValueAtTime(0.3 * intensity, now);
  subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

  subOsc.connect(subGain);
  subGain.connect(audioCtx.destination);

  noise.start(now);
  noise.stop(now + 1.3);

  subOsc.start(now);
  subOsc.stop(now + 0.5);
}

/**
 * 播放通过大门/检查点音效 (清脆的高音电子叮咚声)
 */
export function playGateSound() {
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  // 滑音：从 580Hz 瞬间滑频到 980Hz，非常有马里奥赛车金币声质感
  osc.frequency.setValueAtTime(580, now);
  osc.frequency.setValueAtTime(980, now + 0.08);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.22, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.25);
}

/**
 * 播放完赛胜利欢庆音效 (和声小曲)
 */
export function playFinishSound() {
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const playNote = (freq, startTime, duration, vol = 0.15) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  };

  // 播放大三和弦简短小节
  playNote(261.63, now, 0.15);        // C4
  playNote(329.63, now + 0.15, 0.15); // E4
  playNote(392.00, now + 0.30, 0.15); // G4
  playNote(523.25, now + 0.45, 0.55, 0.2); // C5 (长音高亢)
}
