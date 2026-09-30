// Locally synthesized surf. Audio is created only after an explicit user gesture.
export class SurfAudio {
  constructor() { this.context = null; this.enabled = false; this.nodes = []; }

  async toggle() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error('当前浏览器不支持海浪声');
      this.context = new AudioContext();
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 8, this.context.sampleRate);
      const samples = buffer.getChannelData(0);
      let brown = 0, seed = 71;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        brown = (brown + (seed / 2147483648 - 1) * 0.02) / 1.02;
        samples[i] = brown * 3.5;
      }
      const source = this.context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1200;
      this.gain = this.context.createGain(); this.gain.gain.value = 0;
      source.connect(filter).connect(this.gain).connect(this.context.destination);
      source.start(); this.nodes = [source, filter, this.gain];
    }
    await this.context.resume();
    this.enabled = !this.enabled;
    this.gain.gain.setTargetAtTime(this.enabled ? 0.16 : 0, this.context.currentTime, 0.15);
    return this.enabled;
  }

  update(time, wind, suspended) {
    if (!this.context || !this.enabled) return;
    const swell = 0.68 + Math.sin(time * 0.43) * 0.24 + Math.sin(time * 0.17) * 0.08;
    const volume = suspended ? 0 : (0.10 + wind * 0.007) * swell;
    this.gain.gain.setTargetAtTime(volume, this.context.currentTime, 0.2);
  }

  dispose() {
    this.nodes.forEach(node => node.disconnect());
    if (this.context) void this.context.close();
  }
}
