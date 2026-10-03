// 简单 WebAudio 音效：马达呜鸣（音高随车速）、倒计时、冲出、必杀技。首次用户点击后解锁。
export class Sound {
  constructor(enabled = true) { this.enabled = enabled; this.ctx = null; this.motorNode = null; }
  unlock() {
    if (this.ctx || !this.enabled) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.25; this.master.connect(this.ctx.destination); } catch { this.ctx = null; }
  }
  setEnabled(v) { this.enabled = v; if (!v) { this.stopMotor(); if (this.master) this.master.gain.value = 0; } else { this.unlock(); if (this.master) this.master.gain.value = 0.25; } }
  tone(freq, dur = 0.12, type = 'square', vol = 0.3, slide = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  click() { this.tone(1200, 0.04, 'square', 0.08); }
  beep() { this.tone(660, 0.14, 'square', 0.2); }
  countdown() { this.unlock(); }
  go() { this.tone(1320, 0.35, 'square', 0.22); }
  crash() { this.tone(220, 0.35, 'sawtooth', 0.25, -160); }
  special() { this.tone(500, 0.5, 'sawtooth', 0.2, 900); }
  startMotor() {
    if (!this.enabled || !this.ctx || this.motorNode) return;
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 7;
    f.type = 'bandpass'; f.Q.value = 2.5; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
    o.start(); o2.start();
    this.motorNode = { o, o2, f, g };
  }
  motor(speed, running) {
    const m = this.motorNode; if (!m || !this.ctx) return;
    const t = this.ctx.currentTime, f = 120 + speed * 95;
    m.o.frequency.setTargetAtTime(f, t, 0.05); m.o2.frequency.setTargetAtTime(f * 2.01, t, 0.05); m.f.frequency.setTargetAtTime(f * 3, t, 0.05);
    m.g.gain.setTargetAtTime(running ? Math.min(0.12, 0.03 + speed * 0.012) : 0, t, 0.08);
  }
  stopMotor() { const m = this.motorNode; if (!m) return; try { m.o.stop(); m.o2.stop(); } catch { /* 已停止 */ } this.motorNode = null; }
}
