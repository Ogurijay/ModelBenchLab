/**
 * Everything here is synthesized noise — no audio assets. Wind and rain are
 * continuous filtered-noise beds whose gain/cutoff track the live weather
 * state; thunder is a one-shot lowpass-swept noise burst scheduled at
 * real speed-of-sound delay (distance / 340 m/s) after the flash, so a
 * storm cell that is still a kilometre out reads as a silent flash on the
 * horizon followed by a rumble several seconds later.
 */
export class AmbientAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.master = null;
    this.windGain = null;
    this.rainGain = null;
    this.windFilter = null;
    this._noiseBuffer = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      this.enabled = true;
      if (this.master) this.master.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.4);
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this._noiseBuffer = this._makeNoiseBuffer(2.0);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this._noiseBuffer;
    windSrc.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    windSrc.connect(this.windFilter).connect(this.windGain).connect(this.master);
    windSrc.start();

    const rainSrc = this.ctx.createBufferSource();
    rainSrc.buffer = this._noiseBuffer;
    rainSrc.loop = true;
    const rainFilter = this.ctx.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 2600;
    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = 0;
    rainSrc.connect(rainFilter).connect(this.rainGain).connect(this.master);
    rainSrc.start();

    this.enabled = true;
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(v ? 0.55 : 0, this.ctx.currentTime, 0.4);
    }
  }

  _makeNoiseBuffer(duration) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.floor(rate * duration), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  updateWeather(weather) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const windLevel = Math.min(1, weather.windSpeed / 26) * 0.5;
    const rainLevel = weather.rainIntensity * 0.6;
    this.windGain.gain.setTargetAtTime(windLevel, t, 0.6);
    this.rainGain.gain.setTargetAtTime(rainLevel, t, 0.6);
    this.windFilter.frequency.setTargetAtTime(380 + weather.windSpeed * 22, t, 0.8);
  }

  triggerThunder(distanceMeters) {
    if (!this.ctx || !this.enabled) return;
    const delay = Math.min(distanceMeters / 340, 6.5);
    const t0 = this.ctx.currentTime + delay;

    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1100, t0);
    filter.frequency.exponentialRampToValueAtTime(90, t0 + 1.8);

    const env = this.ctx.createGain();
    const proximity = Math.max(0.15, 1 - distanceMeters / 1400);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(0.9 * proximity, t0 + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + 2.6);

    src.connect(filter).connect(env).connect(this.master);
    src.start(t0);
    src.stop(t0 + 2.7);
  }
}
