// 海洋门面：参数 → 波谱 → h0，同时驱动 GPU FFT 与 CPU 低频副本，统一时间与过渡。

import {
  CASCADE_LAYOUT, DEFAULT_SEA, OMEGA_LOOP_PERIOD, buildOmegaTable, buildSpectrumModel, generateH0
} from './spectrum.js';
import { OceanGPU } from './oceanGPU.js';
import { OceanCPU } from './oceanCPU.js';

// 改变“重建波谱”的参数（chop/泡沫只改 uniform，不重建）
const SPECTRUM_KEYS = [
  'windSpeed', 'windDir', 'fetch', 'gamma', 'directionality', 'swellHeight', 'swellPeriod', 'swellDir', 'shortWaveDamping'
];

export class Ocean {
  constructor(renderer, { N = 256, seed = 20261002, sea = {}, cpuOnly = false } = {}) {
    this.N = N;
    this.seed = seed;
    this.layout = CASCADE_LAYOUT;
    this.sea = { ...DEFAULT_SEA, ...sea };
    this.foam = { decay: 0.9, bias: 0.8, gain: 1.0 };
    this.time = 0;
    this.timeScale = 1;
    this.transition = { elapsed: 1, duration: 3 };
    this.pendingSince = -1;
    this.dirty = false;

    const omegaTables = this.layout.map((c) => buildOmegaTable(N, c.L));
    this.gpu = cpuOnly ? null : new OceanGPU(renderer, { N, layout: this.layout, omegaTables });
    this.cpu = new OceanCPU({ layout: this.layout, N, M: 64, cascades: 2 });
    this._rebuild(true);
  }

  get blend() {
    const t = Math.min(this.transition.elapsed / this.transition.duration, 1);
    return t * t * (3 - 2 * t);
  }

  get loopTime() {
    return ((this.time % OMEGA_LOOP_PERIOD) + OMEGA_LOOP_PERIOD) % OMEGA_LOOP_PERIOD;
  }

  _rebuild(immediate) {
    this.model = buildSpectrumModel(this.sea);
    const h0 = this.layout.map((c, i) => generateH0(this.model, c, this.N, this.seed + i * 7919));
    const blend = this.blend;
    if (this.gpu) this.gpu.setTarget(h0, blend, immediate);
    this.cpu.blend = blend;
    this.cpu.setTarget(h0, immediate);
    this.transition.elapsed = immediate ? this.transition.duration : 0;
    this.dirty = false;
  }

  // 拖动滑块时连续触发，合并后再重建（重建一次约数十毫秒）
  setSea(partial, { immediate = false, duration = 3 } = {}) {
    let spectrumChanged = false;
    for (const [k, v] of Object.entries(partial)) {
      if (this.sea[k] === v) continue;
      this.sea[k] = v;
      if (SPECTRUM_KEYS.includes(k)) spectrumChanged = true;
    }
    if (!spectrumChanged) return;
    this.transition.duration = duration;
    if (immediate) this._rebuild(true);
    else {
      this.dirty = true;
      this.pendingSince = performance.now();
    }
  }

  update(dt) {
    if (this.dirty && performance.now() - this.pendingSince > 120) this._rebuild(false);
    const step = dt * this.timeScale;
    this.time += step;
    this.transition.elapsed += dt;
    const blend = this.blend;
    const t = this.loopTime;
    const chop = this.sea.choppiness;
    if (this.gpu) {
      this.gpu.update({
        time: t,
        dt: Math.max(step, 0),
        blend,
        chop,
        foamDecay: this.foam.decay,
        foamBias: this.foam.bias,
        foamGain: this.foam.gain
      });
    }
    this.cpu.update(t, Math.max(step, 1e-4), blend, chop);
  }

  heightAt(x, z) {
    return this.cpu.heightAt(x, z);
  }

  query(x, z, out) {
    return this.cpu.query(x, z, out);
  }

  stats() {
    return {
      hs: this.model.significantHeight,
      tp: this.model.peakPeriod,
      lp: this.model.peakWavelength
    };
  }
}
