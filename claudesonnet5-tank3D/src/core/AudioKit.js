// 纯 WebAudio 程序化音效，不依赖任何音频素材文件。
// 受浏览器自动播放策略限制，AudioContext 需要在用户手势（点击开始）后 resume()。
export class AudioKit {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._noiseBuffer = null;
  }

  _ensureCtx() {
    if (this.ctx) return this.ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this._noiseBuffer = this._buildNoiseBuffer();
    } catch (e) {
      this.ctx = null;
    }
    return this.ctx;
  }

  unlock() {
    const ctx = this._ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  _buildNoiseBuffer() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone({ freq = 440, freqEnd = null, duration = 0.12, type = 'square', peak = 0.15, delay = 0 }) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noise({ duration = 0.15, peak = 0.25, filterFreq = 1200, delay = 0 }) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  shoot() {
    this._tone({ freq: 620, freqEnd: 240, duration: 0.09, type: 'square', peak: 0.12 });
  }

  brickHit() {
    this._noise({ duration: 0.1, peak: 0.22, filterFreq: 2200 });
  }

  steelClink() {
    this._tone({ freq: 1400, freqEnd: 900, duration: 0.06, type: 'triangle', peak: 0.1 });
  }

  explosionSmall() {
    this._noise({ duration: 0.22, peak: 0.3, filterFreq: 1600 });
    this._tone({ freq: 160, freqEnd: 40, duration: 0.2, type: 'sawtooth', peak: 0.12 });
  }

  explosionBig() {
    this._noise({ duration: 0.4, peak: 0.35, filterFreq: 1100 });
    this._tone({ freq: 110, freqEnd: 30, duration: 0.4, type: 'sawtooth', peak: 0.18 });
  }

  powerupSpawn() {
    this._tone({ freq: 500, freqEnd: 900, duration: 0.18, type: 'triangle', peak: 0.12 });
  }

  powerupPick() {
    this._tone({ freq: 660, duration: 0.08, type: 'square', peak: 0.14 });
    this._tone({ freq: 990, duration: 0.12, type: 'square', peak: 0.14, delay: 0.07 });
  }

  playerHit() {
    this._noise({ duration: 0.35, peak: 0.32, filterFreq: 900 });
    this._tone({ freq: 200, freqEnd: 40, duration: 0.35, type: 'sawtooth', peak: 0.2 });
  }

  stageClear() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone({ freq: f, duration: 0.22, type: 'square', peak: 0.14, delay: i * 0.14 }));
  }

  gameOver() {
    [392, 349, 294, 220].forEach((f, i) => this._tone({ freq: f, duration: 0.35, type: 'sawtooth', peak: 0.16, delay: i * 0.22 }));
  }

  victory() {
    [523, 659, 784, 988, 1319].forEach((f, i) => this._tone({ freq: f, duration: 0.28, type: 'square', peak: 0.16, delay: i * 0.16 }));
  }
}
