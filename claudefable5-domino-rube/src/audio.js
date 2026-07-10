// ============================================================
// audio.js — WebAudio 全合成音效(零音频资产)
// 骨牌哒声 / 木板闷响 / 金属叮当 / 终点钟声(多分音衰减正弦)
// ============================================================

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.lastPlay = {};        // 节流:每类音效最小间隔
  }

  /** 必须在用户手势后调用 */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // 预生成短噪声缓冲(冲击瞬态用)
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    let s = 9001;
    for (let i = 0; i < len; i++) {
      s = (s * 16807) % 2147483647;
      data[i] = (s / 2147483647) * 2 - 1;
    }
  }

  #throttled(kind, minGapMs) {
    const now = performance.now();
    if (now - (this.lastPlay[kind] || 0) < minGapMs) return true;
    this.lastPlay[kind] = now;
    return false;
  }

  /** 噪声瞬态:freq 带通中心,dur 秒,gain 音量 */
  #burst(freq, q, dur, gain, when = 0) {
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /** 衰减正弦分音 */
  #partial(freq, gain, dur, detune = 0, when = 0) {
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  /** 碰撞音分发 */
  impact({ kind, speed }) {
    if (!this.ctx) return;
    const v = Math.min(speed / 4, 1);
    switch (kind) {
      case 'domino':
        if (this.#throttled('domino', 34)) return;
        this.#burst(1900 + v * 900, 2.2, 0.055, 0.16 + v * 0.2);
        this.#partial(170, 0.05 + v * 0.05, 0.06);
        break;
      case 'wood':
        if (this.#throttled('wood', 70)) return;
        this.#burst(420, 1.4, 0.12, 0.22 + v * 0.28);
        this.#partial(110, 0.12 + v * 0.1, 0.13);
        break;
      case 'ball':
        if (this.#throttled('ball', 60)) return;
        this.#burst(900, 1.8, 0.08, 0.1 + v * 0.22);
        break;
      case 'metal':
        if (this.#throttled('metal', 80)) return;
        this.#burst(3200, 5, 0.09, 0.1 + v * 0.16);
        this.#partial(1240, 0.08 + v * 0.08, 0.35, 6);
        break;
      default:
        break;
    }
  }

  /** 终点钟声:锤击瞬态 + 六分音钟体共鸣(小三度分音 = 教堂钟特征) */
  bell() {
    if (!this.ctx) return;
    const f0 = 740;
    this.#burst(2600, 1.2, 0.05, 0.5);                    // 锤击
    this.#partial(f0 * 0.5, 0.30, 3.8, 0);                // 嗡音
    this.#partial(f0, 0.42, 3.0, 3);                      // 基音
    this.#partial(f0 * 1.2, 0.26, 2.2, -4);               // 小三度
    this.#partial(f0 * 1.5, 0.18, 1.7, 5);                // 五度
    this.#partial(f0 * 2.0, 0.22, 1.3, -3);               // 标称音
    this.#partial(f0 * 2.74, 0.10, 0.8, 7);               // 高位泛音
    // 轻微二次拍音(双正弦叠加的合唱感)
    this.#partial(f0 * 1.005, 0.2, 2.6, 0, 0.012);
  }
}
