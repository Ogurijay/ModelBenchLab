/**
 * WebAudio 程序化音效 — 无任何外部音频资源。
 * 滚球隆隆声(噪声循环)、撞瓶木响、洗沟闷响、UI 音、strike/spare 小旋律。
 */
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.rollGain = null;
    this.rollFilter = null;
  }

  /** 必须在用户手势后调用 */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this._buildRollLoop();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  _noiseBuffer(seconds = 1.2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _buildRollLoop() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(2);
    src.loop = true;
    this.rollFilter = this.ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass';
    this.rollFilter.frequency.value = 120;
    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    src.start();
  }

  /** 每帧调用:speed 为球速 m/s,0 = 静音 */
  updateRolling(speed) {
    if (!this.ctx || !this.rollGain) return;
    const t = this.ctx.currentTime;
    const k = Math.min(speed / 10, 1);
    this.rollGain.gain.setTargetAtTime(k * 0.5, t, 0.08);
    this.rollFilter.frequency.setTargetAtTime(90 + k * 260, t, 0.1);
  }

  _blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  click() {
    this._blip(880, 0.07, 'triangle', 0.12);
  }

  throwWhoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.5);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  /** intensity 0~1:撞瓶木响(噪声爆 + 短促木音),45ms 节流防连锁碰撞爆音 */
  pinHit(intensity = 0.6) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    if (this._lastPinT && t - this._lastPinT < 0.045) return;
    this._lastPinT = t;
    const v = 0.1 + intensity * 0.4;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.15);
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    this._blip(210 + Math.random() * 120, 0.1, 'triangle', v * 0.7);
  }

  gutterThud() {
    this._blip(90, 0.3, 'sine', 0.3);
  }

  pitDrop() {
    this._blip(70, 0.4, 'sine', 0.25);
  }

  strikeFanfare() {
    const seq = [523, 659, 784, 1047];
    seq.forEach((f, i) => this._blip(f, 0.22, 'square', 0.1, i * 0.09));
    this._blip(1319, 0.5, 'triangle', 0.14, seq.length * 0.09);
  }

  spareJingle() {
    [659, 880].forEach((f, i) => this._blip(f, 0.2, 'triangle', 0.13, i * 0.11));
  }

  gameOverTune() {
    [523, 587, 659, 784, 1047].forEach((f, i) => this._blip(f, 0.3, 'triangle', 0.12, i * 0.14));
  }
}
