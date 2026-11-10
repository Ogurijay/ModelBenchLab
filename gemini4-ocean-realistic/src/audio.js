// 纯本地 Web Audio API 程序化声景合成器（海浪呼吸、狂风呼啸、降雨、闪电炸雷、浮体入水声）

export function createOceanAudio() {
  let ctx = null;
  let enabled = false;
  let masterGain = null;
  let surfFilter = null;
  let surfGain = null;
  let windFilter = null;
  let windGain = null;
  let rainGain = null;

  function initContext() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.0;
    masterGain.connect(ctx.destination);

    // 创建 4 秒循环粉红/白噪声缓冲
    const bufferSize = ctx.sampleRate * 4;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    // 1. 海浪低频涌动通道
    const surfSrc = ctx.createBufferSource();
    surfSrc.buffer = noiseBuffer;
    surfSrc.loop = true;
    surfFilter = ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 260;
    surfGain = ctx.createGain();
    surfGain.gain.value = 0.28;
    surfSrc.connect(surfFilter).connect(surfGain).connect(masterGain);
    surfSrc.start();

    // 2. 强风带通呼啸通道
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 520;
    windFilter.Q.value = 3.2;
    windGain = ctx.createGain();
    windGain.gain.value = 0.04;
    windSrc.connect(windFilter).connect(windGain).connect(masterGain);
    windSrc.start();

    // 3. 降雨高通细密雨声通道
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuffer;
    rainSrc.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1800;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0.0;
    rainSrc.connect(rainFilter).connect(rainGain).connect(masterGain);
    rainSrc.start();
  }

  function toggle() {
    initContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    enabled = !enabled;
    const now = ctx.currentTime;
    masterGain.gain.setTargetAtTime(enabled ? 0.65 : 0.0, now, 0.25);
    return enabled;
  }

  function update(time, params) {
    if (!ctx || !enabled) return;
    const now = ctx.currentTime;
    // 海浪呼吸周期调制
    const waveCycle = 0.5 + 0.5 * Math.sin(time * 0.85) * Math.cos(time * 0.37);
    const hsFactor = Math.min(1.6, Math.max(0.25, params.hs / 2.2));
    surfFilter.frequency.setTargetAtTime(160 + waveCycle * 260 * hsFactor, now, 0.12);
    surfGain.gain.setTargetAtTime((0.18 + waveCycle * 0.24) * hsFactor, now, 0.12);

    // 狂风呼啸随风速与龙卷增强
    const spoutBoost = params.waterspout ? 0.22 : 0.0;
    const windLevel = Math.min(1.0, Math.max(0.0, (params.windSpeed - 3.0) / 22.0));
    windFilter.frequency.setTargetAtTime(360 + windLevel * 480 + Math.sin(time * 1.3) * 90, now, 0.15);
    windGain.gain.setTargetAtTime(windLevel * 0.22 + spoutBoost, now, 0.15);

    // 暴雨声量
    rainGain.gain.setTargetAtTime((params.rainIntensity || 0) * 0.28, now, 0.15);
  }

  // 合成闪电雷鸣：高频裂帛声 + 低频滚雷轰鸣
  function playThunder(distance = 220) {
    if (!ctx || !enabled) return;
    const delaySec = Math.min(1.2, Math.max(0.05, distance / 340.0 * 0.45));
    const startAt = ctx.currentTime + delaySec;
    const duration = 2.8;

    const bufLen = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 1.45) * (0.65 + 0.35 * Math.sin(t * 19.0));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.setValueAtTime(420, startAt);
    lowFilter.frequency.exponentialRampToValueAtTime(95, startAt + duration);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.85, startAt);
    g.gain.exponentialRampToValueAtTime(0.01, startAt + duration);

    src.connect(lowFilter).connect(g).connect(masterGain);
    src.start(startAt);
  }

  // 浮体入水水花声
  function playSplash(strength = 1.0) {
    if (!ctx || !enabled) return;
    const now = ctx.currentTime;
    const duration = 0.32;
    const bufLen = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      const t = i / ctx.sampleRate;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 12.0);
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(680, now);
    bp.frequency.exponentialRampToValueAtTime(240, now + duration);

    const g = ctx.createGain();
    g.gain.value = Math.min(0.45, Math.max(0.12, strength * 0.08));
    src.connect(bp).connect(g).connect(masterGain);
    src.start(now);
  }

  return {
    toggle,
    update,
    playThunder,
    playSplash,
    isEnabled: () => enabled
  };
}
