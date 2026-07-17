export class AudioSystem {
  constructor() { this.context = null; this.master = null; }

  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume();
  }

  tone(frequency, endFrequency, duration = 0.16, type = 'sine', volume = 0.14, delay = 0) {
    if (!this.context) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  shoot(kind) {
    this.unlock();
    const cyan = kind === 'cyan';
    this.tone(cyan ? 180 : 145, cyan ? 760 : 560, 0.18, 'sawtooth', 0.1);
    this.tone(cyan ? 610 : 460, cyan ? 330 : 250, 0.28, 'sine', 0.16, 0.035);
  }
  teleport() { this.tone(110, 880, 0.21, 'triangle', 0.18); this.tone(740, 160, 0.33, 'sine', 0.1, 0.08); }
  pickup() { this.unlock(); this.tone(280, 470, 0.1, 'triangle', 0.12); }
  drop() { this.tone(190, 105, 0.12, 'square', 0.08); }
  deny() { this.unlock(); this.tone(130, 92, 0.16, 'square', 0.07); }
  door() { this.tone(74, 48, 0.48, 'sawtooth', 0.12); this.tone(520, 660, 0.18, 'sine', 0.09, 0.12); }
  complete() {
    [[330, 440, 0], [440, 550, 0.12], [660, 880, 0.25]].forEach(([a, b, delay]) => this.tone(a, b, 0.34, 'sine', 0.13, delay));
  }
}
