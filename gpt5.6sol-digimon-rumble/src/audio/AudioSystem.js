const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
const PITCHES = { player: 1, enemy: 0.82, p1: 1, p2: 0.86, p3: 1.14, p4: 0.72 };

export class AudioSystem {
  constructor({ volume = 0.22, muted = false } = {}) {
    this.context = null;
    this.master = null;
    this.volume = clamp01(volume);
    this.muted = Boolean(muted);
  }

  unlock() {
    if (this.context) {
      if (this.context.state === 'suspended') this.context.resume?.();
      return true;
    }
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext
      || globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
    if (!AudioContext) return false;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.context.destination);
    return true;
  }

  resume() {
    if (!this.context) return this.unlock();
    this.context.resume?.();
    return true;
  }

  applyVolume() {
    if (!this.master) return;
    const value = this.muted ? 0 : this.volume;
    const now = this.context?.currentTime || 0;
    if (this.master.gain.setTargetAtTime) this.master.gain.setTargetAtTime(value, now, 0.015);
    else this.master.gain.value = value;
  }

  setVolume(value) {
    this.volume = clamp01(value);
    this.applyVolume();
    return this.volume;
  }

  getVolume() { return this.volume; }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this.applyVolume();
    return this.muted;
  }

  toggleMute() { return this.setMuted(!this.muted); }

  tone(freq, duration, type = 'square', volume = 0.18, slide = 1, delay = 0) {
    if (!this.context || !this.master) return null;
    const now = this.context.currentTime + Math.max(0, delay);
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + duration);
    gain.gain.setValueAtTime(Math.max(0.001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now); osc.stop(now + duration + 0.02);
    return osc;
  }

  noise(duration = 0.12, volume = 0.16, delay = 0) {
    if (!this.context || !this.master) return null;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const now = this.context.currentTime + Math.max(0, delay);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.buffer = buffer; source.connect(gain).connect(this.master); source.start(now);
    return source;
  }

  fighterPitch(event) {
    return PITCHES[event.fighter ?? event.owner ?? event.attacker] || 1;
  }

  play(event = {}) {
    if (!this.context) return false;
    const pitch = this.fighterPitch(event);
    switch (event.type) {
      case 'attack': this.tone(125 * pitch, 0.09, 'square', 0.1, 1.7); break;
      case 'hit': this.noise(0.1, 0.22); this.tone(86, 0.16, 'sawtooth', 0.18, 0.5); break;
      case 'skill': this.tone(260 * pitch, 0.32, 'sawtooth', 0.15, 2.1); break;
      case 'projectileHit': this.noise(0.24, 0.25); this.tone(72, 0.28, 'square', 0.2, 0.35); break;
      case 'pickup':
      case 'itemPickup':
        this.tone(420, 0.1, 'sine', 0.12, 1.45); this.tone(680, 0.18, 'sine', 0.1, 1.2, 0.07); break;
      case 'item':
      case 'itemSpawn': this.tone(330, 0.2, 'triangle', 0.08, 1.5); break;
      case 'overdrive':
      case 'evolve':
      case 'evolution':
      case 'devolution':
        this.noise(0.38, 0.14); this.tone(70 * pitch, 0.8, 'sawtooth', 0.2, 5); this.tone(320, 0.35, 'sine', 0.1, 2, 0.25); break;
      case 'ultra':
        this.noise(0.6, 0.24); this.tone(48, 1.05, 'sawtooth', 0.26, 7); this.tone(520 * pitch, 0.55, 'square', 0.14, 0.45, 0.18); break;
      case 'ko':
        this.noise(0.34, 0.24); this.tone(180 * pitch, 0.7, 'sawtooth', 0.18, 0.18); break;
      case 'respawn':
        this.tone(180 * pitch, 0.18, 'sine', 0.11, 1.8); this.tone(360 * pitch, 0.24, 'sine', 0.1, 1.7, 0.14); break;
      case 'hazard': {
        const type = event.hazard || event.hazardType;
        if (type === 'laser') this.tone(760, 0.32, 'sawtooth', 0.13, 0.25);
        else if (type === 'lava') { this.noise(0.42, 0.18); this.tone(52, 0.5, 'square', 0.12, 0.7); }
        else if (type === 'void') this.tone(92, 0.75, 'sine', 0.16, 0.3);
        else this.noise(0.18, 0.12);
        break;
      }
      case 'guard': this.tone(410 * pitch, 0.12, 'square', 0.08, 0.7); break;
      case 'heal': this.tone(360, 0.2, 'sine', 0.1, 1.8); this.tone(620, 0.24, 'sine', 0.08, 1.25, 0.12); break;
      case 'jump': this.tone(150, 0.12, 'triangle', 0.08, 1.55); break;
      case 'dodge': this.noise(0.08, 0.08); break;
      case 'pause': this.tone(220, 0.12, 'square', 0.07, 0.75); break;
      default: return false;
    }
    return true;
  }

  dispose() {
    this.master?.disconnect?.();
    const closing = this.context?.close?.();
    this.context = null;
    this.master = null;
    return closing;
  }
}
