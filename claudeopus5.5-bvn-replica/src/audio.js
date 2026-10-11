/*
 * audio.js — 魂叶乱斗 音频模块
 * 全部 WebAudio 实时合成:振荡器 / 噪声缓冲 / 滤波 / 包络 / 失真 / 程序生成冲激响应的卷积混响。
 * 不加载任何音频文件;所有配乐旋律由带种子的乐句生成器原创产生(调式+动机+问答句结构)。
 *
 * 信号图:
 *   sfx 声部 → 声部增益 → 声像 → sfxBus ─┐            (+ 混响发送 → sfxRev → sfxBus)
 *   配乐分轨 → 曲目增益 → bgmTrim → 高通/低架 → duck → bgmBus ┴→ sum → 压缩 → 限幅 → 软削波 → master → 输出
 *
 * 测试导出:renderOffline(kind, name, seconds, {raw}) 把同一套合成图挂到 OfflineAudioContext;
 *          analyzeBuffer(buf) 计算峰值/RMS/有效长度/NaN。
 */

// ───────────────────────────── 基础工具 ─────────────────────────────
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const mod = (a, n) => ((a % n) + n) % n;
const rnd = Math.random;
function rng32(seed) { // mulberry32,确定性旋律生成用
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────────── 共享数据(按采样率缓存) ─────────────────────────────
const dataCache = new Map();
function getData(sr) {
  if (dataCache.has(sr)) return dataCache.get(sr);
  const r = rng32(9001);
  // 白噪声 2s
  const noise = new Float32Array(sr * 2);
  for (let i = 0; i < noise.length; i++) noise[i] = r() * 2 - 1;
  // 噼啪缓冲:稀疏的短促爆裂(火焰/电流/碎屑)
  const crackle = new Float32Array(sr * 2);
  for (let p = 0; p < crackle.length;) {
    const len = Math.floor(sr * (0.0008 + r() * 0.005)), amp = 0.25 + r() * 0.75;
    for (let k = 0; k < len && p + k < crackle.length; k++) crackle[p + k] += (r() * 2 - 1) * amp * Math.exp(-k / (len * 0.3));
    p += Math.floor(sr * (-Math.log(1 - r() * 0.999) / 55)) + len;
  }
  // 颗粒缓冲:密集细小沙粒
  const grains = new Float32Array(sr * 2);
  for (let p = 0; p < grains.length;) {
    const len = Math.floor(sr * (0.001 + r() * 0.003)), amp = 0.15 + r() * 0.85;
    for (let k = 0; k < len && p + k < grains.length; k++) grains[p + k] += (r() * 2 - 1) * amp * Math.sin(Math.PI * k / len);
    p += Math.floor(sr * (r() / 420));
  }
  // 冲激响应:双声道指数衰减噪声,随时间变暗(一阶低通系数递减)
  const mkIR = (secs, pre, bright) => {
    const n = Math.floor(sr * secs), L = new Float32Array(n), R = new Float32Array(n);
    const p0 = Math.floor(sr * pre);
    for (const ch of [L, R]) {
      let y = 0;
      for (let i = p0; i < n; i++) {
        const x = (i - p0) / (n - p0);
        const a = bright * (1 - x) + 0.08;
        y += a * ((r() * 2 - 1) - y);
        ch[i] = y * Math.exp(-6.9 * x);
      }
    }
    return [L, R];
  };
  const d = { noise, crackle, grains, irLong: mkIR(2.6, 0.012, 0.85), irShort: mkIR(1.1, 0.006, 0.9) };
  dataCache.set(sr, d);
  return d;
}

const curveCache = new Map();
function curve(k) { // tanh 失真曲线
  if (curveCache.has(k)) return curveCache.get(k);
  const n = 1024, c = new Float32Array(n), nk = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / nk; }
  curveCache.set(k, c);
  return c;
}
let clipCurve = null;
function softClipCurve() { // |x|<0.8 线性,其上平滑趋近 0.95
  if (clipCurve) return clipCurve;
  const n = 2048; clipCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
    const y = ax < 0.8 ? ax : 0.8 + 0.2 * Math.tanh((ax - 0.8) / 0.2);
    clipCurve[i] = Math.sign(x) * y;
  }
  return clipCurve;
}

// ───────────────────────────── 合成图构建 ─────────────────────────────
function buildGraph(c, raw = false, vols = { master: 1, bgm: 1, sfx: 1 }) {
  const d = getData(c.sampleRate);
  const mkBuf = (chs) => {
    const b = c.createBuffer(chs.length, chs[0].length, c.sampleRate);
    chs.forEach((a, i) => b.copyToChannel(a, i));
    return b;
  };
  const G = { c, raw };
  G.nb = mkBuf([d.noise]);
  G.crackle = mkBuf([d.crackle]);
  G.grains = mkBuf([d.grains]);

  G.sum = c.createGain();
  if (raw) {
    G.sum.connect(c.destination);
  } else {
    // 限幅器:阈值 -3dB、硬拐点、20:1。规范规定压缩器自带补偿增益 (1/curve(1))^0.6,
    // 这里反向抵消,使阈值以下信号保持单位增益(避免短促打击被压扁、持续配乐被抬高)
    const TH = -3, RATIO = 20;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = TH; lim.knee.value = 0; lim.ratio.value = RATIO;
    lim.attack.value = 0.002; lim.release.value = 0.12;
    const fullDb = TH - TH / RATIO; // 0dBFS 输入经曲线后的增益(dB,负值)
    const comp = c.createGain(); comp.gain.value = Math.pow(10, (fullDb * 0.6) / 20);
    const clip = c.createWaveShaper(); clip.curve = softClipCurve(); clip.oversample = '2x';
    G.master = c.createGain(); G.master.gain.value = vols.master;
    G.sum.connect(lim); lim.connect(comp); comp.connect(clip); clip.connect(G.master); G.master.connect(c.destination);
  }
  // 音效总线
  G.sfx = c.createGain(); G.sfx.gain.value = raw ? 1 : vols.sfx;
  const sfxHp = c.createBiquadFilter(); sfxHp.type = 'highpass'; sfxHp.frequency.value = 28;
  G.sfxIn = c.createGain(); G.sfxIn.connect(sfxHp); sfxHp.connect(G.sfx); G.sfx.connect(G.sum);
  G.sfxRev = c.createConvolver(); G.sfxRev.buffer = mkBuf(d.irLong);
  const sfxRevRet = c.createGain(); sfxRevRet.gain.value = 0.55;
  G.sfxRev.connect(sfxRevRet); sfxRevRet.connect(G.sfxIn);
  // 配乐总线:trim → 高通 32Hz → 低架 -4dB@140Hz → duck → bgm 音量
  G.bgm = c.createGain(); G.bgm.gain.value = raw ? 1 : vols.bgm;
  G.duck = c.createGain();
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 34; hp.Q.value = 0.6;
  const ls = c.createBiquadFilter(); ls.type = 'lowshelf'; ls.frequency.value = 140; ls.gain.value = -4;
  G.bgmTrim = c.createGain(); G.bgmTrim.gain.value = 0.42;
  G.bgmTrim.connect(hp); hp.connect(ls); ls.connect(G.duck); G.duck.connect(G.bgm); G.bgm.connect(G.sum);
  G.bgmRev = c.createConvolver(); G.bgmRev.buffer = mkBuf(d.irLong);
  const bgmRevRet = c.createGain(); bgmRevRet.gain.value = 0.7;
  G.bgmRev.connect(bgmRevRet); bgmRevRet.connect(G.bgmTrim);
  return G;
}

// ───────────────────────────── 合成原语 ─────────────────────────────
// S = { c, G, T(起始时刻), o(输出), p(音高倍率) };各原语中的 t 为相对 S.T 的偏移
function env(P, T, a, hold, d, v) {
  P.setValueAtTime(0, T);
  P.linearRampToValueAtTime(v, T + a);
  if (hold > 0) P.setValueAtTime(v, T + a + hold);
  P.exponentialRampToValueAtTime(0.0001, T + a + hold + d);
}
const nyq = (S, f) => clamp(f, 10, S.c.sampleRate * 0.45);

// 振荡器音:f→f1 扫频
function T(S, { t = 0, type = 'sine', f = 440, f1 = 0, sweep = 0, a = 0.002, hold = 0, d = 0.2, v = 0.3, det = 0, lin = false, out } = {}) {
  const c = S.c, T0 = S.T + t, end = T0 + a + hold + d;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; if (det) o.detune.value = det;
  o.frequency.setValueAtTime(nyq(S, f * S.p), T0);
  if (f1) {
    const tt = T0 + (sweep || a + hold + d);
    if (lin) o.frequency.linearRampToValueAtTime(nyq(S, f1 * S.p), tt);
    else o.frequency.exponentialRampToValueAtTime(nyq(S, f1 * S.p), tt);
  }
  env(g.gain, T0, a, hold, d, v);
  o.connect(g); g.connect(out || S.o);
  o.start(T0); o.stop(end + 0.03);
  return { o, g, end };
}

// 缓冲源(噪声/噼啪/颗粒)经滤波 + 包络
function B(S, buf, { t = 0, ft = 'bandpass', f = 1000, f1 = 0, sweep = 0, q = 1, a = 0.002, hold = 0, d = 0.2, v = 0.3, rate = 1, out } = {}) {
  const c = S.c, T0 = S.T + t, end = T0 + a + hold + d;
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  src.playbackRate.value = rate * (buf === S.G.nb ? 1 : S.p);
  const g = c.createGain();
  let flt = null;
  if (ft) {
    flt = c.createBiquadFilter(); flt.type = ft; flt.Q.value = q;
    flt.frequency.setValueAtTime(nyq(S, f * S.p), T0);
    if (f1) flt.frequency.exponentialRampToValueAtTime(nyq(S, f1 * S.p), T0 + (sweep || a + hold + d));
    src.connect(flt); flt.connect(g);
  } else src.connect(g);
  env(g.gain, T0, a, hold, d, v);
  g.connect(out || S.o);
  src.start(T0, rnd() * 1.6); src.stop(end + 0.03);
  return { src, flt, g, end };
}
const N = (S, o) => B(S, S.G.nb, o);        // 白噪声
const CR = (S, o) => B(S, S.G.crackle, { ft: 'highpass', f: 2000, ...o }); // 噼啪
const GR = (S, o) => B(S, S.G.grains, o);   // 颗粒

// FM 金属/钟声
function F(S, { t = 0, f = 440, ratio = 2, idx = 1, a = 0.002, hold = 0, d = 0.3, v = 0.2, out } = {}) {
  const c = S.c, T0 = S.T + t, end = T0 + a + hold + d;
  const car = c.createOscillator(), md = c.createOscillator(), mg = c.createGain(), g = c.createGain();
  const fc = nyq(S, f * S.p);
  car.frequency.value = fc; md.frequency.value = nyq(S, fc * ratio);
  mg.gain.setValueAtTime(idx * fc, T0);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * fc * 0.04), end);
  md.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(out || S.o);
  env(g.gain, T0, a, hold, d, v);
  car.start(T0); md.start(T0); car.stop(end + 0.03); md.stop(end + 0.03);
  return { car, g, end };
}

// 滤波器节点(可扫频),输出接 out
function filt(S, type, f, q = 1, { t = 0, f1 = 0, d = 0.3, out } = {}) {
  const c = S.c, n = c.createBiquadFilter(); n.type = type; n.Q.value = q;
  const T0 = S.T + t;
  n.frequency.setValueAtTime(nyq(S, f * S.p), T0);
  if (f1) n.frequency.exponentialRampToValueAtTime(nyq(S, f1 * S.p), T0 + d);
  n.connect(out || S.o);
  return n;
}
// 失真:输入 → shaper → 输出增益 g → out
function shp(S, k, g = 0.7, out) {
  const c = S.c, s = c.createWaveShaper(); s.curve = curve(k); s.oversample = '2x';
  const og = c.createGain(); og.gain.value = g; s.connect(og); og.connect(out || S.o);
  return s;
}
function gain(S, v, out) { const g = S.c.createGain(); g.gain.value = v; g.connect(out || S.o); return g; }
// 颤音/斩波:返回节点(源接入它)
function trem(S, { t = 0, d = 0.5, f = 8, f1 = 0, depth = 1, type = 'sine', out } = {}) {
  const c = S.c, T0 = S.T + t, g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
  g.gain.value = 1 - depth / 2; lg.gain.value = depth / 2;
  l.type = type; l.frequency.setValueAtTime(f, T0); if (f1) l.frequency.linearRampToValueAtTime(f1, T0 + d);
  l.connect(lg); lg.connect(g.gain); g.connect(out || S.o);
  l.start(T0); l.stop(T0 + d + 0.05);
  return g;
}
// LFO 调制某参数
function lfo(S, param, { t = 0, d = 0.5, f = 5, depth = 10, type = 'sine', delay = 0 } = {}) {
  const c = S.c, T0 = S.T + t, l = c.createOscillator(), lg = c.createGain();
  l.type = type; l.frequency.value = f;
  if (delay) { lg.gain.setValueAtTime(0, T0); lg.gain.linearRampToValueAtTime(depth, T0 + delay); } else lg.gain.value = depth;
  l.connect(lg); lg.connect(param); l.start(T0); l.stop(T0 + d + 0.05);
}
// 一组原始振荡器接到共享包络
function oscs(S, t, end, list, out) {
  const c = S.c, T0 = S.T + t, arr = [];
  for (const [type, f, det = 0] of list) {
    const o = c.createOscillator(); o.type = type; o.frequency.value = nyq(S, f * S.p); o.detune.value = det;
    o.connect(out); o.start(T0); o.stop(S.T + end + 0.03); arr.push(o);
  }
  return arr;
}
function envGain(S, t, a, hold, d, v, out) {
  const g = S.c.createGain(); env(g.gain, S.T + t, a, hold, d, v); g.connect(out || S.o); return g;
}

// ───────────────────────────── 乐器(配乐与部分音效共用) ─────────────────────────────
// 签名 (S, t, f(Hz), dur(秒), v(力度), opt)
const INST = {
  kick(S, t, f, d, v) {
    T(S, { t, f: 155, f1: 44, sweep: 0.07, d: 0.3, v: 0.85 * v });
    T(S, { t, type: 'triangle', f: 1100, f1: 300, d: 0.012, v: 0.18 * v });
  },
  boom(S, t, f, d, v) { // 空旷的深沉低音冲击
    T(S, { t, f: 70, f1: 34, sweep: 0.4, d: 1.6, v: 0.7 * v });
    N(S, { t, ft: 'lowpass', f: 400, f1: 80, d: 0.6, v: 0.25 * v });
  },
  snare(S, t, f, d, v) {
    N(S, { t, ft: 'highpass', f: 1300, d: 0.15, v: 0.4 * v });
    N(S, { t, ft: 'bandpass', f: 2500, q: 1, d: 0.06, v: 0.2 * v });
    T(S, { t, type: 'triangle', f: 220, f1: 170, d: 0.07, v: 0.3 * v });
  },
  hat(S, t, f, d, v) { N(S, { t, ft: 'highpass', f: 8000, d: 0.03, v: 0.2 * v }); },
  ohat(S, t, f, d, v) { N(S, { t, ft: 'highpass', f: 7000, d: 0.2, v: 0.15 * v }); },
  crash(S, t, f, d, v) {
    N(S, { t, ft: 'highpass', f: 4500, d: 1.4, v: 0.17 * v });
    N(S, { t, ft: 'bandpass', f: 3200, q: 0.7, d: 0.5, v: 0.09 * v });
  },
  clap(S, t, f, d, v) {
    for (let i = 0; i < 3; i++) N(S, { t: t + i * 0.012, ft: 'bandpass', f: 1250, q: 1.4, d: i === 2 ? 0.13 : 0.018, v: 0.36 * v });
  },
  taiko(S, t, f, d, v) {
    T(S, { t, f: 115, f1: 58, sweep: 0.14, d: 0.6, v: 0.8 * v });
    T(S, { t, type: 'triangle', f: 210, f1: 95, d: 0.1, v: 0.2 * v });
    N(S, { t, ft: 'lowpass', f: 1100, f1: 200, d: 0.1, v: 0.3 * v });
  },
  shime(S, t, f, d, v) { // 締太鼓:高而紧
    T(S, { t, f: 360, f1: 270, sweep: 0.04, d: 0.11, v: 0.28 * v });
    N(S, { t, ft: 'bandpass', f: 2400, q: 2, d: 0.035, v: 0.26 * v });
  },
  tom(S, t, f, d, v) {
    const F0 = f || 150;
    T(S, { t, f: F0, f1: F0 * 0.62, d: 0.28, v: 0.45 * v });
    N(S, { t, ft: 'lowpass', f: 1500, d: 0.05, v: 0.14 * v });
  },
  wood(S, t, f, d, v) {
    const F0 = f || 1700;
    T(S, { t, f: F0, d: 0.045, v: 0.26 * v });
    T(S, { t, f: F0 * 2.73, d: 0.018, v: 0.09 * v });
  },
  shaker(S, t, f, d, v) { N(S, { t, ft: 'bandpass', f: 6500, q: 1.2, a: 0.012, d: 0.05, v: 0.13 * v }); },
  metal(S, t, f, d, v) { F(S, { t, f: f || 760, ratio: 1.414, idx: 3, d: 0.9, v: 0.07 * v }); },

  bass(S, t, f, d, v) {
    const lp = filt(S, 'lowpass', f * 7, 4, { t, f1: f * 1.6, d: 0.2 });
    const h = Math.max(0, d - 0.06);
    T(S, { t, type: 'sawtooth', f, a: 0.004, hold: h, d: 0.12, v: 0.22 * v, out: lp });
    T(S, { t, f, a: 0.004, hold: h, d: 0.1, v: 0.26 * v });
  },
  bassG(S, t, f, d, v) { // 失真电贝斯
    const lp = filt(S, 'lowpass', 1100, 1);
    const sh = shp(S, 3, 0.12 * v, lp);
    const h = Math.max(0, d - 0.05);
    T(S, { t, type: 'sawtooth', f, a: 0.003, hold: h, d: 0.12, v: 1, out: sh });
    T(S, { t, f, a: 0.003, hold: h, d: 0.1, v: 0.22 * v });
  },
  sub(S, t, f, d, v) {
    T(S, { t, f, a: 0.008, hold: Math.max(0, d - 0.1), d: 0.18, v: 0.34 * v });
    T(S, { t, type: 'triangle', f: f * 2, a: 0.008, d: 0.12, v: 0.06 * v });
  },
  power(S, t, f, d, v, opt = {}) { // 失真吉他强力和弦(根+五+八度)
    const mute = !!opt.mute;
    const lp = filt(S, 'lowpass', mute ? 1300 : 3000, 0.9);
    const sh = shp(S, 8, (mute ? 0.08 : 0.07) * v, lp);
    const end = t + (mute ? 0.13 : Math.max(0.1, d) + 0.22);
    const g = envGain(S, t, 0.003, mute ? 0 : Math.max(0, d - 0.05), mute ? 0.12 : 0.25, 1, sh);
    oscs(S, t, end, [['sawtooth', f, 0], ['sawtooth', f, 11], ['sawtooth', f * 1.4983, -7], ['sawtooth', f * 2, 5]], g);
  },
  lead(S, t, f, d, v) { // 失真主音吉他
    const lp = filt(S, 'lowpass', 3400, 0.8);
    const sh = shp(S, 6, 0.06 * v, lp);
    const end = t + d + 0.18;
    const g = envGain(S, t, 0.01, Math.max(0, d - 0.04), 0.16, 1, sh);
    const os = oscs(S, t, end, [['sawtooth', f, 0], ['sawtooth', f, 9]], g);
    if (d > 0.25) for (const o of os) lfo(S, o.detune, { t, d: d + 0.2, f: 6, depth: 22, delay: 0.2 });
  },
  pluck(S, t, f, d, v) { // 三味线式拨弦
    const lp = filt(S, 'lowpass', 5200, 6, { t, f1: 700, d: 0.16 });
    T(S, { t, type: 'sawtooth', f: f * 1.025, f1: f, sweep: 0.03, a: 0.001, d: 0.32, v: 0.14 * v, out: lp });
    N(S, { t, ft: 'bandpass', f: 3200, q: 1.5, d: 0.018, v: 0.12 * v });
  },
  koto(S, t, f, d, v) { // 筝:三角波+泛音,弹拨后轻微上滑
    const L = Math.min(1.4, 0.5 + d);
    T(S, { t, type: 'triangle', f: f * 0.985, f1: f, sweep: 0.05, a: 0.002, d: L, v: 0.18 * v });
    T(S, { t, f: f * 2, a: 0.002, d: L * 0.5, v: 0.07 * v });
    T(S, { t, f: f * 3.01, a: 0.002, d: L * 0.25, v: 0.035 * v });
    N(S, { t, ft: 'bandpass', f: 4000, q: 2, d: 0.012, v: 0.08 * v });
  },
  flute(S, t, f, d, v) { // 尺八/笛:滑入 + 延迟颤音 + 气声
    const h = Math.max(0, d - 0.1);
    const g = envGain(S, t, 0.05, h, 0.14, 0.17 * v);
    const end = t + 0.05 + h + 0.15;
    const os = oscs(S, t, end, [['sine', f], ['triangle', f, 3]], g);
    for (const o of os) {
      o.frequency.setValueAtTime(f * 0.95 * S.p, S.T + t);
      o.frequency.exponentialRampToValueAtTime(f * S.p, S.T + t + 0.06);
      if (d > 0.3) lfo(S, o.detune, { t, d: d + 0.2, f: 5.4, depth: 18, delay: 0.3 });
    }
    N(S, { t, ft: 'bandpass', f: f * 2, q: 3, a: 0.03, hold: h, d: 0.12, v: 0.05 * v });
  },
  strings(S, t, f, d, v) {
    const lp = filt(S, 'lowpass', 1900, 0.5);
    const a = Math.min(0.25, d * 0.5), h = Math.max(0, d - a);
    const g = envGain(S, t, a, h, 0.45, 0.055 * v, lp);
    oscs(S, t, t + a + h + 0.45, [['sawtooth', f, -11], ['sawtooth', f, 0], ['sawtooth', f, 12]], g);
  },
  stac(S, t, f, d, v) { // 弦乐断奏
    const lp = filt(S, 'lowpass', 2600, 0.7);
    const g = envGain(S, t, 0.006, 0.03, 0.12, 0.07 * v, lp);
    oscs(S, t, t + 0.17, [['sawtooth', f, -8], ['sawtooth', f, 8]], g);
  },
  choir(S, t, f, d, v) { // 合唱垫音:锯齿经三个元音共振峰
    const out = gain(S, 1);
    const fm = [[650, 6, 1], [1100, 7, 0.6], [2500, 9, 0.3]].map(([ff, q, gg]) => {
      const n = S.c.createBiquadFilter(); n.type = 'bandpass'; n.frequency.value = ff; n.Q.value = q;
      const gg2 = gain(S, gg * 2.2, out); n.connect(gg2); return n;
    });
    const a = Math.min(0.35, d * 0.5), h = Math.max(0, d - a);
    const g = envGain(S, t, a, h, 0.6, 0.1 * v, out);
    g.disconnect(); for (const n of fm) g.connect(n);
    const os = oscs(S, t, t + a + h + 0.6, [['sawtooth', f, -7], ['sawtooth', f, 7], ['sawtooth', f * 2, 0]], g);
    for (const o of os) lfo(S, o.detune, { t, d: d + 0.6, f: 4.8, depth: 10 });
  },
  organ(S, t, f, d, v) {
    const h = Math.max(0, d - 0.03);
    const parts = [[f, 0.12], [f * 2, 0.09], [f * 3, 0.04], [f * 4, 0.045]];
    for (const [ff, vv] of parts) T(S, { t, f: ff, a: 0.008, hold: h, d: 0.08, v: vv * v });
    T(S, { t, type: 'square', f: f * 8, d: 0.012, v: 0.02 * v });
  },
  brass(S, t, f, d, v) { // 铜管:滤波包络打开
    const lp = S.c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.connect(S.o);
    const T0 = S.T + t, h = Math.max(0, d - 0.04);
    lp.frequency.setValueAtTime(nyq(S, f * 1.2 * S.p), T0);
    lp.frequency.linearRampToValueAtTime(nyq(S, Math.min(5200, f * 7) * S.p), T0 + 0.06);
    lp.frequency.linearRampToValueAtTime(nyq(S, Math.min(3000, f * 3.5) * S.p), T0 + 0.06 + Math.max(0.05, h));
    const g = envGain(S, t, 0.04, h, 0.12, 0.085 * v, lp);
    oscs(S, t, t + 0.04 + h + 0.12, [['sawtooth', f, -6], ['sawtooth', f, 6]], g);
  },
  bell(S, t, f, d, v) {
    const L = 2.4;
    [[1, 1, 1], [2, 0.45, 0.6], [2.76, 0.3, 0.4], [5.4, 0.16, 0.2]].forEach(([r, vv, dd]) =>
      T(S, { t, f: f * r, a: 0.002, d: L * dd, v: 0.09 * vv * v }));
  },
  piano(S, t, f, d, v) {
    const L = Math.max(0.6, Math.min(2.2, d + 0.8));
    T(S, { t, type: 'triangle', f, a: 0.003, d: L, v: 0.16 * v });
    T(S, { t, f: f * 2, a: 0.003, d: L * 0.45, v: 0.06 * v });
    T(S, { t, f: f * 3, a: 0.002, d: L * 0.2, v: 0.025 * v });
  },
  synth(S, t, f, d, v) {
    const lp = filt(S, 'lowpass', 2600, 3, { t, f1: 900, d: 0.12 });
    T(S, { t, type: 'square', f, a: 0.002, d: 0.12, v: 0.06 * v, out: lp });
  },
  ghost(S, t, f, d, v) { // 阴森长音:轻微拍频
    const h = Math.max(0, d - 0.5);
    T(S, { t, f, a: 0.5, hold: h, d: 0.9, v: 0.08 * v });
    const o = T(S, { t, f: f * 1.007, a: 0.5, hold: h, d: 0.9, v: 0.06 * v });
    lfo(S, o.o.detune, { t, d: d + 1, f: 0.7, depth: 25 });
  },
  drone(S, t, f, d, v) {
    const h = Math.max(0, d - 1.2);
    T(S, { t, f, a: 1.2, hold: h, d: 1.4, v: 0.22 * v });
    T(S, { t, f: f * 1.004, a: 1.2, hold: h, d: 1.4, v: 0.14 * v });
    T(S, { t, type: 'triangle', f: f * 2, a: 1.2, hold: h, d: 1.2, v: 0.05 * v });
  },
  windpad(S, t, f, d, v) {
    const h = Math.max(0, d - 1.5);
    N(S, { t, ft: 'bandpass', f: 500, f1: 1400, q: 5, a: 1.5, hold: h, d: 1.6, v: 0.16 * v });
  },
};

// ───────────────────────────── 音效定义 ─────────────────────────────
// fn(S) 返回时长;rev 混响发送;max 同名复音上限;gap 最小触发间隔;vary 随机音高抖动
const SFX = {
  // ── 打击
  hit_light: { max: 6, gap: 0.02, rev: 0.05, vary: 0.05, fn(S) {
    N(S, { ft: 'bandpass', f: 2600, q: 0.9, d: 0.05, v: 0.7 });
    T(S, { f: 260, f1: 110, d: 0.05, v: 0.45 });
    T(S, { type: 'square', f: 1700, d: 0.012, v: 0.1 });
    return 0.08;
  } },
  hit_mid: { max: 6, gap: 0.025, rev: 0.06, vary: 0.05, fn(S) {
    N(S, { ft: 'bandpass', f: 1500, q: 0.8, d: 0.08, v: 0.72 });
    N(S, { ft: 'lowpass', f: 700, d: 0.1, v: 0.45 });
    T(S, { f: 170, f1: 65, d: 0.13, v: 0.58 });
    return 0.16;
  } },
  hit_heavy: { max: 4, gap: 0.03, rev: 0.12, vary: 0.04, fn(S) {
    T(S, { f: 120, f1: 36, sweep: 0.2, d: 0.38, v: 0.9, out: shp(S, 2.5, 0.6) });
    N(S, { ft: 'lowpass', f: 1600, f1: 180, d: 0.28, v: 0.65 });
    N(S, { ft: 'bandpass', f: 3200, q: 1.2, d: 0.04, v: 0.42 });
    return 0.42;
  } },
  hit_blade: { max: 5, gap: 0.025, rev: 0.1, vary: 0.05, fn(S) {
    F(S, { f: 2100, ratio: 1.41, idx: 2.5, d: 0.22, v: 0.15 });
    T(S, { f: 3400, d: 0.18, v: 0.07 });
    N(S, { ft: 'bandpass', f: 3800, f1: 900, q: 2.2, d: 0.17, v: 0.65 });
    N(S, { ft: 'lowpass', f: 1100, d: 0.07, v: 0.48 });
    T(S, { f: 150, f1: 60, d: 0.1, v: 0.42 });
    return 0.25;
  } },
  hit_burn: { max: 4, gap: 0.03, rev: 0.1, vary: 0.04, fn(S) {
    T(S, { f: 140, f1: 55, d: 0.12, v: 0.5 });
    N(S, { ft: 'lowpass', f: 3500, f1: 500, a: 0.005, d: 0.4, v: 0.5 });
    CR(S, { t: 0.02, d: 0.35, f: 3000, v: 0.55 });
    return 0.45;
  } },
  hit_elec: { max: 4, gap: 0.03, rev: 0.08, vary: 0.04, fn(S) {
    T(S, { f: 150, f1: 60, d: 0.1, v: 0.42 });
    const tg = trem(S, { d: 0.32, f: 38, type: 'square', out: gain(S, 0.55) });
    const bp = filt(S, 'bandpass', 1700, 0.8, { out: tg });
    T(S, { type: 'sawtooth', f: 92, f1: 70, a: 0.002, d: 0.3, v: 0.9, out: shp(S, 5, 0.8, bp) });
    CR(S, { d: 0.3, f: 4000, v: 0.5, rate: 1.3 });
    return 0.35;
  } },
  guard: { max: 4, gap: 0.03, rev: 0.08, vary: 0.03, fn(S) {
    F(S, { f: 480, ratio: 2.31, idx: 1.6, d: 0.2, v: 0.32, out: filt(S, 'lowpass', 2500, 0.7) });
    N(S, { ft: 'bandpass', f: 900, q: 3, d: 0.08, v: 0.5 });
    T(S, { f: 190, f1: 120, d: 0.1, v: 0.35 });
    return 0.24;
  } },
  guard_break: { max: 2, gap: 0.1, rev: 0.25, fn(S) {
    T(S, { f: 95, f1: 38, d: 0.55, v: 0.7, out: shp(S, 2, 0.65) });
    N(S, { ft: 'highpass', f: 4500, d: 0.32, v: 0.42 });
    N(S, { ft: 'bandpass', f: 2400, q: 1.5, d: 0.12, v: 0.4 });
    for (let i = 0; i < 14; i++) T(S, { t: rnd() * 0.25, f: 2600 + rnd() * 5000, d: 0.06 + rnd() * 0.14, v: 0.05 + rnd() * 0.05 });
    return 0.6;
  } },
  // ── 挥空
  swing: { max: 4, gap: 0.03, rev: 0.03, vary: 0.06, fn(S) {
    N(S, { ft: 'bandpass', f: 500, f1: 1700, q: 1.4, a: 0.05, d: 0.1, v: 1.0 });
    return 0.17;
  } },
  slash: { max: 4, gap: 0.03, rev: 0.06, vary: 0.05, fn(S) {
    N(S, { ft: 'bandpass', f: 2200, f1: 6500, q: 3.5, a: 0.025, d: 0.14, v: 0.85 });
    N(S, { ft: 'highpass', f: 7000, a: 0.02, d: 0.08, v: 0.2 });
    T(S, { f: 2800, f1: 5200, a: 0.02, d: 0.1, v: 0.05 });
    return 0.18;
  } },
  slash_heavy: { max: 3, gap: 0.05, rev: 0.1, vary: 0.04, fn(S) {
    N(S, { ft: 'bandpass', f: 320, f1: 1300, q: 1.1, a: 0.09, d: 0.3, v: 0.8 });
    N(S, { ft: 'lowpass', f: 400, a: 0.06, d: 0.3, v: 0.4 });
    T(S, { f: 75, f1: 48, a: 0.06, d: 0.3, v: 0.3 });
    return 0.42;
  } },
  // ── 移动
  jump: { max: 2, gap: 0.05, rev: 0.03, vary: 0.04, fn(S) {
    N(S, { ft: 'bandpass', f: 900, f1: 2600, q: 1.6, a: 0.02, d: 0.09, v: 0.75 });
    T(S, { f: 200, f1: 420, d: 0.08, v: 0.16 });
    return 0.12;
  } },
  land: { max: 3, gap: 0.04, rev: 0.03, vary: 0.05, fn(S) {
    T(S, { f: 130, f1: 50, d: 0.11, v: 0.5 });
    N(S, { ft: 'lowpass', f: 1000, d: 0.09, v: 0.42 });
    N(S, { t: 0.005, ft: 'bandpass', f: 3000, q: 1, d: 0.03, v: 0.12 });
    return 0.13;
  } },
  dash: { max: 2, gap: 0.05, rev: 0.03, vary: 0.04, fn(S) {
    N(S, { ft: 'bandpass', f: 800, f1: 2800, q: 2, a: 0.01, d: 0.11, v: 1.0 });
    N(S, { ft: 'lowpass', f: 600, d: 0.1, v: 0.45 });
    return 0.13;
  } },
  shunpo: { max: 3, gap: 0.04, rev: 0.55, vary: 0.03, fn(S) {
    T(S, { f: 2400, f1: 6200, d: 0.05, v: 0.2 });
    N(S, { ft: 'highpass', f: 6000, a: 0.004, d: 0.045, v: 0.4 });
    T(S, { t: 0.025, f: 4200, f1: 8000, d: 0.04, v: 0.1 });
    return 0.08;
  } },
  step: { max: 2, gap: 0.08, rev: 0, vary: 0.08, fn(S) {
    N(S, { ft: 'lowpass', f: 650, d: 0.035, v: 0.28 });
    T(S, { f: 95, f1: 60, d: 0.03, v: 0.16 });
    return 0.05;
  } },
  bounce: { max: 3, gap: 0.05, rev: 0.05, vary: 0.04, fn(S) {
    T(S, { f: 150, f1: 70, d: 0.1, v: 0.55 }); N(S, { ft: 'lowpass', f: 1100, d: 0.07, v: 0.4 });
    T(S, { t: 0.12, f: 120, f1: 60, d: 0.08, v: 0.3 }); N(S, { t: 0.12, ft: 'lowpass', f: 900, d: 0.05, v: 0.22 });
    return 0.22;
  } },
  fall: { max: 3, gap: 0.06, rev: 0.12, vary: 0.03, fn(S) {
    T(S, { f: 95, f1: 30, sweep: 0.3, d: 0.45, v: 0.85, out: shp(S, 2, 0.6) });
    N(S, { ft: 'lowpass', f: 1800, f1: 160, d: 0.4, v: 0.6 });
    CR(S, { t: 0.04, ft: 'bandpass', f: 1500, q: 0.8, d: 0.3, v: 0.4 });
    return 0.5;
  } },
  // ── 忍术 / 鬼道
  smoke: { max: 4, gap: 0.04, rev: 0.2, vary: 0.04, fn(S) {
    N(S, { ft: 'lowpass', f: 2200, f1: 250, a: 0.004, d: 0.32, v: 0.7 });
    T(S, { f: 200, f1: 70, d: 0.09, v: 0.4 });
    N(S, { t: 0.03, ft: 'bandpass', f: 5000, q: 0.7, a: 0.05, d: 0.3, v: 0.1 });
    return 0.4;
  } },
  kunai: { max: 5, gap: 0.03, rev: 0.06, vary: 0.05, fn(S) {
    F(S, { f: 4300, ratio: 1.7, idx: 1, d: 0.04, v: 0.12 });
    T(S, { f: 3400, f1: 2300, a: 0.01, d: 0.16, v: 0.1 });
    N(S, { ft: 'bandpass', f: 5200, q: 3, a: 0.01, d: 0.13, v: 0.55 });
    return 0.19;
  } },
  spiral: { max: 2, gap: 0.15, rev: 0.15, fn(S) { // 旋转嗡鸣渐强 1s
    const bp = filt(S, 'bandpass', 500, 1.2, { f1: 2600, d: 0.95 });
    const tg = trem(S, { d: 1.05, f: 16, f1: 34, depth: 0.7, out: bp });
    T(S, { type: 'sawtooth', f: 105, f1: 170, a: 0.9, d: 0.12, v: 0.4, out: tg });
    T(S, { type: 'sawtooth', f: 106.5, f1: 172.5, a: 0.9, d: 0.12, v: 0.4, out: tg });
    T(S, { f: 420, f1: 700, a: 0.9, d: 0.12, v: 0.12 });
    N(S, { ft: 'bandpass', f: 800, f1: 4000, q: 2, a: 0.9, d: 0.12, v: 0.35 });
    return 1.05;
  } },
  chidori: { max: 2, gap: 0.15, rev: 0.12, fn(S) { // 密集电流噼啪 + 鸟鸣般啁啾
    CR(S, { f: 2500, a: 0.05, hold: 0.75, d: 0.2, v: 0.8, rate: 1.4 });
    CR(S, { f: 5500, a: 0.05, hold: 0.75, d: 0.2, v: 0.6, rate: 1.9 });
    const tg = trem(S, { d: 1.0, f: 47, type: 'square', out: gain(S, 0.4) });
    T(S, { type: 'sawtooth', f: 120, a: 0.05, hold: 0.75, d: 0.2, v: 0.7, out: shp(S, 6, 0.7, filt(S, 'bandpass', 2600, 1, { out: tg })) });
    const bird = T(S, { f: 3300, a: 0.05, hold: 0.75, d: 0.2, v: 0.07 });
    lfo(S, bird.o.frequency, { d: 1.0, f: 23, depth: 900, type: 'sawtooth' });
    return 1.0;
  } },
  lightning: { max: 2, gap: 0.08, rev: 0.45, fn(S) {
    N(S, { ft: 'highpass', f: 2500, d: 0.06, v: 0.75 });
    CR(S, { f: 1500, d: 0.25, v: 0.6, rate: 0.8 });
    N(S, { t: 0.02, ft: 'lowpass', f: 5000, f1: 250, d: 0.75, v: 0.55 });
    T(S, { f: 70, f1: 28, d: 0.9, v: 0.75, out: shp(S, 2.5, 0.6) });
    return 1.0;
  } },
  fire: { max: 3, gap: 0.06, rev: 0.12, vary: 0.03, fn(S) { // 呼——
    N(S, { ft: 'bandpass', f: 380, f1: 900, q: 0.7, a: 0.08, hold: 0.25, d: 0.4, v: 0.72 });
    N(S, { ft: 'lowpass', f: 250, a: 0.06, hold: 0.2, d: 0.4, v: 0.42 });
    CR(S, { t: 0.05, a: 0.05, hold: 0.3, d: 0.3, f: 2500, v: 0.4 });
    return 0.75;
  } },
  fire_big: { max: 2, gap: 0.1, rev: 0.35, fn(S) {
    T(S, { f: 85, f1: 30, d: 0.8, v: 0.8, out: shp(S, 2.5, 0.6) });
    N(S, { ft: 'lowpass', f: 2600, f1: 180, a: 0.01, d: 1.1, v: 0.75 });
    N(S, { ft: 'bandpass', f: 600, f1: 300, q: 0.8, a: 0.1, hold: 0.2, d: 0.6, v: 0.4 });
    CR(S, { t: 0.1, hold: 0.4, d: 0.6, f: 2000, v: 0.45 });
    return 1.25;
  } },
  water: { max: 3, gap: 0.06, rev: 0.15, vary: 0.04, fn(S) {
    const n = N(S, { ft: 'bandpass', f: 700, q: 2.5, a: 0.02, hold: 0.25, d: 0.35, v: 0.75 });
    lfo(S, n.flt.frequency, { d: 0.62, f: 13, depth: 420 });
    N(S, { ft: 'highpass', f: 2800, a: 0.005, d: 0.3, v: 0.35 });
    T(S, { f: 110, f1: 55, d: 0.18, v: 0.42 });
    N(S, { ft: 'lowpass', f: 500, a: 0.05, hold: 0.2, d: 0.3, v: 0.35 });
    return 0.65;
  } },
  wind: { max: 3, gap: 0.05, rev: 0.15, vary: 0.04, fn(S) {
    N(S, { ft: 'bandpass', f: 1200, f1: 3800, q: 7, a: 0.05, d: 0.35, v: 0.8 });
    N(S, { ft: 'bandpass', f: 5500, f1: 2500, q: 9, a: 0.03, d: 0.25, v: 0.45 });
    N(S, { ft: 'highpass', f: 3000, a: 0.02, d: 0.12, v: 0.2 });
    return 0.45;
  } },
  sand: { max: 3, gap: 0.08, rev: 0.08, fn(S) {
    GR(S, { ft: 'bandpass', f: 4000, q: 0.7, a: 0.12, hold: 0.4, d: 0.35, v: 0.75 });
    GR(S, { ft: 'bandpass', f: 1800, q: 1, a: 0.1, hold: 0.35, d: 0.35, v: 0.45, rate: 0.7 });
    N(S, { ft: 'lowpass', f: 300, a: 0.15, hold: 0.35, d: 0.3, v: 0.25 });
    return 0.9;
  } },
  ice: { max: 3, gap: 0.06, rev: 0.35, vary: 0.03, fn(S) {
    N(S, { ft: 'highpass', f: 3500, d: 0.04, v: 0.55 });
    [2637, 3951, 5274, 7040].forEach((f, i) => T(S, { t: 0.01 + i * 0.03, f: f * (0.97 + rnd() * 0.06), d: 0.3 + i * 0.05, v: 0.08 }));
    N(S, { t: 0.05, ft: 'bandpass', f: 2200, f1: 5000, q: 4, a: 0.2, d: 0.25, v: 0.3 });
    return 0.65;
  } },
  ice_break: { max: 3, gap: 0.06, rev: 0.3, fn(S) {
    N(S, { ft: 'highpass', f: 2800, d: 0.1, v: 0.65 });
    T(S, { f: 140, f1: 60, d: 0.12, v: 0.4 });
    for (let i = 0; i < 18; i++) T(S, { t: rnd() * 0.45, f: 3000 + rnd() * 6500, d: 0.04 + rnd() * 0.12, v: 0.05 + rnd() * 0.06 });
    N(S, { t: 0.05, ft: 'bandpass', f: 6000, q: 1, d: 0.4, v: 0.2 });
    return 0.6;
  } },
  petal: { max: 2, gap: 0.15, rev: 0.4, fn(S) { // 千片花瓣:沙沙 + 金属微音
    N(S, { ft: 'highpass', f: 5500, a: 0.35, hold: 0.4, d: 0.45, v: 0.22 });
    GR(S, { ft: 'bandpass', f: 3500, q: 1.5, a: 0.3, hold: 0.4, d: 0.4, v: 0.4, rate: 1.4 });
    for (let i = 0; i < 22; i++) T(S, { t: rnd() * 1.1, f: 4500 + rnd() * 4500, a: 0.003, d: 0.05 + rnd() * 0.1, v: 0.025 + rnd() * 0.03 });
    return 1.3;
  } },
  crow: { max: 2, gap: 0.15, rev: 0.25, fn(S) { // 振翅 + 两声鸦鸣
    for (let i = 0; i < 7; i++) N(S, { t: i * 0.075 + rnd() * 0.01, ft: 'lowpass', f: 1400, a: 0.015, d: 0.05, v: 0.35 });
    [0.05, 0.38].forEach((t0, j) => {
      const bp = filt(S, 'bandpass', 1300, 3);
      const sh = shp(S, 3, 0.9, bp);
      T(S, { t: t0, type: 'sawtooth', f: 620 - j * 60, f1: 460, a: 0.02, hold: 0.08, d: 0.15, v: 0.6, out: sh });
    });
    return 0.7;
  } },
  dark: { max: 2, gap: 0.15, rev: 0.3, fn(S) {
    const lp = filt(S, 'lowpass', 220, 1);
    const tg = trem(S, { d: 1.3, f: 5, depth: 0.6, out: lp });
    T(S, { type: 'sawtooth', f: 46, a: 0.3, hold: 0.4, d: 0.55, v: 0.4, out: tg });
    T(S, { type: 'sawtooth', f: 48.5, a: 0.3, hold: 0.4, d: 0.55, v: 0.4, out: tg });
    T(S, { f: 36, a: 0.25, hold: 0.4, d: 0.6, v: 0.3 });
    N(S, { ft: 'lowpass', f: 180, a: 0.3, hold: 0.4, d: 0.55, v: 0.5 });
    N(S, { ft: 'bandpass', f: 700, f1: 300, q: 3, a: 0.4, d: 0.8, v: 0.14 });
    return 1.3;
  } },
  beam: { max: 2, gap: 0.15, rev: 0.15, fn(S) { // 持续 1s 光束
    const bp = filt(S, 'bandpass', 1300, 0.8);
    const a = T(S, { type: 'sawtooth', f: 220, a: 0.04, hold: 0.8, d: 0.15, v: 0.32, out: bp });
    const b = T(S, { type: 'sawtooth', f: 331, a: 0.04, hold: 0.8, d: 0.15, v: 0.24, out: bp });
    lfo(S, a.o.detune, { d: 1, f: 28, depth: 30 }); lfo(S, b.o.detune, { d: 1, f: 31, depth: 30 });
    T(S, { f: 880, a: 0.04, hold: 0.8, d: 0.15, v: 0.07 });
    N(S, { ft: 'highpass', f: 5000, a: 0.04, hold: 0.8, d: 0.15, v: 0.16 });
    T(S, { f: 200, f1: 60, d: 0.15, v: 0.4 });
    return 1.0;
  } },
  wave: { max: 3, gap: 0.06, rev: 0.25, fn(S) { // 月牙/剑气波
    N(S, { ft: 'bandpass', f: 900, f1: 4200, q: 1.6, a: 0.02, d: 0.3, v: 0.7 });
    T(S, { type: 'sawtooth', f: 260, f1: 900, a: 0.01, d: 0.32, v: 0.16, out: filt(S, 'lowpass', 2500, 1) });
    T(S, { f: 80, f1: 38, d: 0.3, v: 0.6 });
    N(S, { t: 0.02, ft: 'highpass', f: 6000, d: 0.12, v: 0.25 });
    return 0.4;
  } },
  explode: { max: 3, gap: 0.06, rev: 0.3, fn(S) {
    T(S, { f: 72, f1: 24, sweep: 0.6, d: 1.2, v: 0.85, out: shp(S, 3, 0.45) });
    N(S, { ft: 'lowpass', f: 4200, f1: 140, a: 0.004, d: 1.3, v: 0.7 });
    N(S, { ft: 'highpass', f: 2000, d: 0.06, v: 0.55 });
    CR(S, { t: 0.08, ft: 'bandpass', f: 1200, d: 0.7, v: 0.4, rate: 0.7 });
    return 1.4;
  } },
  explode_small: { max: 4, gap: 0.04, rev: 0.15, vary: 0.05, fn(S) {
    T(S, { f: 130, f1: 40, d: 0.35, v: 0.6 });
    N(S, { ft: 'lowpass', f: 3200, f1: 300, d: 0.4, v: 0.6 });
    N(S, { ft: 'highpass', f: 2500, d: 0.03, v: 0.35 });
    return 0.45;
  } },
  charge: { max: 2, gap: 0.15, rev: 0.12, fn(S) { // 蓄力上升 0.8s
    const lp = filt(S, 'lowpass', 400, 4, { f1: 3500, d: 0.8 });
    const tg = trem(S, { d: 0.85, f: 6, f1: 24, depth: 0.5, out: lp });
    T(S, { type: 'sawtooth', f: 110, f1: 440, a: 0.7, d: 0.1, v: 0.35, out: tg });
    T(S, { type: 'sawtooth', f: 111, f1: 443, a: 0.7, d: 0.1, v: 0.3, out: tg });
    T(S, { f: 440, f1: 1760, a: 0.7, d: 0.1, v: 0.1 });
    N(S, { ft: 'bandpass', f: 600, f1: 5000, q: 3, a: 0.7, d: 0.1, v: 0.25 });
    return 0.82;
  } },
  aura: { max: 2, gap: 0.15, rev: 0.4, fn(S) { // 觉醒:冲击 + 上扬
    T(S, { f: 95, f1: 38, d: 0.5, v: 0.7 });
    N(S, { ft: 'lowpass', f: 3000, f1: 300, d: 0.4, v: 0.5 });
    const lp = filt(S, 'lowpass', 3000, 1);
    T(S, { type: 'sawtooth', f: 180, f1: 720, a: 0.05, d: 0.8, v: 0.12, out: lp });
    T(S, { type: 'sawtooth', f: 182, f1: 727, a: 0.05, d: 0.8, v: 0.12, out: lp });
    T(S, { f: 600, f1: 2400, a: 0.05, d: 0.7, v: 0.08 });
    N(S, { ft: 'bandpass', f: 1500, f1: 6000, q: 2, a: 0.1, d: 0.7, v: 0.3 });
    return 0.9;
  } },
  heal: { max: 2, gap: 0.15, rev: 0.55, fn(S) {
    [1047, 1319, 1568, 2093, 2637].forEach((f, i) => {
      T(S, { t: i * 0.07, type: 'triangle', f, a: 0.02, d: 0.45, v: 0.12 });
      T(S, { t: i * 0.07, f: f * 2, a: 0.02, d: 0.3, v: 0.035 });
    });
    N(S, { ft: 'highpass', f: 7000, a: 0.2, d: 0.5, v: 0.06 });
    return 0.85;
  } },
  barrier: { max: 2, gap: 0.12, rev: 0.4, fn(S) {
    F(S, { f: 880, ratio: 1.5, idx: 1.5, d: 0.5, v: 0.14 });
    T(S, { f: 300, a: 0.04, hold: 0.25, d: 0.35, v: 0.24 });
    T(S, { f: 302.5, a: 0.04, hold: 0.25, d: 0.35, v: 0.2 });
    T(S, { f: 600, a: 0.04, hold: 0.25, d: 0.35, v: 0.1 });
    N(S, { ft: 'bandpass', f: 2000, f1: 6000, q: 4, a: 0.05, d: 0.3, v: 0.2 });
    return 0.7;
  } },
  summon: { max: 2, gap: 0.15, rev: 0.5, fn(S) { // 低沉"嘭"+烟
    T(S, { f: 75, f1: 32, d: 0.7, v: 0.8, out: shp(S, 2, 0.65) });
    N(S, { ft: 'lowpass', f: 1800, f1: 200, a: 0.005, d: 0.8, v: 0.62 });
    N(S, { t: 0.05, ft: 'bandpass', f: 4000, q: 0.7, a: 0.1, d: 0.6, v: 0.14 });
    T(S, { f: 150, f1: 70, d: 0.2, v: 0.3 });
    return 1.0;
  } },
  roar: { max: 2, gap: 0.2, rev: 0.3, fn(S) {
    const out = gain(S, 0.5);
    const f1 = filt(S, 'bandpass', 480, 3, { out }), f2 = filt(S, 'bandpass', 950, 4, { out });
    const sh = S.c.createWaveShaper(); sh.curve = curve(5); sh.connect(f1); sh.connect(f2);
    [[92, 68], [95.5, 70], [138, 100]].forEach(([a, b]) => {
      const o = T(S, { type: 'sawtooth', f: a, f1: b, a: 0.12, hold: 0.55, d: 0.45, v: 0.38, out: sh });
      lfo(S, o.o.frequency, { d: 1.15, f: 31, depth: 7, type: 'square' });
    });
    N(S, { ft: 'lowpass', f: 900, a: 0.1, hold: 0.5, d: 0.5, v: 0.38 });
    return 1.15;
  } },
  seal: { max: 2, gap: 0.1, rev: 0.15, fn(S) { // 结印 咔咔咔
    [0, 0.09, 0.18].forEach((t) => {
      N(S, { t, ft: 'bandpass', f: 3600, q: 5, d: 0.025, v: 0.6 });
      T(S, { t, f: 2300, d: 0.03, v: 0.12 });
      T(S, { t, type: 'triangle', f: 900, d: 0.02, v: 0.14 });
    });
    N(S, { t: 0.3, ft: 'bandpass', f: 1800, q: 3, d: 0.05, v: 0.65 });
    T(S, { t: 0.3, f: 420, f1: 300, d: 0.08, v: 0.3 });
    return 0.4;
  } },
  bind: { max: 2, gap: 0.1, rev: 0.15, fn(S) { // 锁链/沙收紧,逐渐加速
    for (let i = 0; i < 12; i++) {
      const t = 0.42 * (1 - Math.pow(1 - i / 12, 2));
      F(S, { t, f: 2200 + rnd() * 1800, ratio: 1.37, idx: 1.2, d: 0.05, v: 0.1 });
      N(S, { t, ft: 'bandpass', f: 4000, q: 4, d: 0.015, v: 0.25 });
    }
    GR(S, { ft: 'bandpass', f: 2500, q: 1, a: 0.3, d: 0.15, v: 0.4 });
    N(S, { t: 0.44, ft: 'bandpass', f: 1200, q: 2, d: 0.08, v: 0.6 });
    F(S, { t: 0.44, f: 700, ratio: 2.1, idx: 2, d: 0.2, v: 0.22 });
    return 0.66;
  } },
  tele: { max: 3, gap: 0.06, rev: 0.35, fn(S) { // 倒放感:渐强后骤停
    N(S, { ft: 'bandpass', f: 1500, f1: 5000, q: 3, a: 0.32, d: 0.03, v: 0.6 });
    T(S, { f: 200, f1: 1500, a: 0.32, d: 0.03, v: 0.18 });
    T(S, { type: 'sawtooth', f: 100, f1: 400, a: 0.32, d: 0.03, v: 0.1, out: filt(S, 'lowpass', 1200, 1) });
    T(S, { t: 0.34, f: 1800, f1: 600, d: 0.06, v: 0.22 });
    return 0.42;
  } },
  // ── 系统
  cursor: { max: 2, gap: 0.03, rev: 0, fn(S) {
    T(S, { type: 'square', f: 1320, d: 0.055, v: 0.16, out: filt(S, 'lowpass', 4000, 0.7) });
    T(S, { f: 2640, d: 0.03, v: 0.05 });
    return 0.06;
  } },
  select: { max: 2, gap: 0.05, rev: 0.12, fn(S) {
    const lp = filt(S, 'lowpass', 4500, 0.7);
    T(S, { type: 'square', f: 880, d: 0.05, v: 0.09, out: lp });
    T(S, { t: 0.05, type: 'square', f: 1320, d: 0.1, v: 0.09, out: lp });
    T(S, { t: 0.05, f: 2640, d: 0.15, v: 0.05 });
    return 0.2;
  } },
  cancel: { max: 2, gap: 0.05, rev: 0.05, fn(S) {
    T(S, { type: 'square', f: 700, f1: 420, d: 0.12, v: 0.16, out: filt(S, 'lowpass', 3000, 0.7) });
    return 0.14;
  } },
  cutin: { max: 1, gap: 0.3, rev: 0.55, fn(S) { // 锐利"铮"+冲击+混响
    F(S, { f: 1180, ratio: 3.51, idx: 3.5, d: 1.0, v: 0.2 });
    T(S, { f: 2360, d: 0.8, v: 0.07 });
    T(S, { f: 1185, d: 1.0, v: 0.08 });
    T(S, { type: 'sawtooth', f: 1180, d: 0.25, v: 0.06, out: filt(S, 'highpass', 2000, 0.7) });
    N(S, { ft: 'highpass', f: 3000, d: 0.15, v: 0.45 });
    T(S, { f: 85, f1: 32, d: 0.75, v: 0.75, out: shp(S, 2.5, 0.6) });
    N(S, { ft: 'lowpass', f: 2000, f1: 150, d: 0.5, v: 0.45 });
    return 1.2;
  } },
  super_flash: { max: 2, gap: 0.15, rev: 0.4, fn(S) {
    N(S, { ft: 'bandpass', f: 1500, f1: 9000, q: 2, a: 0.01, d: 0.3, v: 0.5 });
    T(S, { f: 700, f1: 3200, d: 0.28, v: 0.14 });
    T(S, { type: 'square', f: 1400, f1: 2800, d: 0.1, v: 0.04 });
    T(S, { f: 110, f1: 50, d: 0.2, v: 0.4 });
    return 0.35;
  } },
  round: { max: 1, gap: 0.3, rev: 0.4, fn(S) { // 太鼓 + 锣
    INST.taiko(S, 0, 0, 0, 1.1);
    [[176, 0.18], [263, 0.11], [389, 0.09], [527, 0.06], [703, 0.045]].forEach(([f, v], i) => {
      T(S, { f, a: 0.01, d: 1.4 - i * 0.15, v });
      T(S, { f: f * 1.006, a: 0.01, d: 1.2 - i * 0.15, v: v * 0.5 });
    });
    N(S, { ft: 'bandpass', f: 1200, q: 0.8, d: 0.15, v: 0.15 });
    return 1.45;
  } },
  fight: { max: 1, gap: 0.3, rev: 0.35, fn(S) { // 太鼓连击 + 钹
    [0, 0.14, 0.28].forEach((t, i) => INST.taiko(S, t, 0, 0, 0.7 + i * 0.08));
    INST.shime(S, 0.4, 0, 0, 0.9); INST.shime(S, 0.45, 0, 0, 1);
    INST.taiko(S, 0.5, 0, 0, 1.1);
    N(S, { t: 0.5, ft: 'highpass', f: 4000, d: 0.95, v: 0.32 });
    N(S, { t: 0.5, ft: 'bandpass', f: 7000, q: 0.5, d: 0.5, v: 0.18 });
    return 1.5;
  } },
  ko: { max: 1, gap: 0.5, rev: 0.7, fn(S) { // 慢放式重低音冲击 + 回响
    T(S, { f: 65, f1: 24, sweep: 1.0, d: 1.4, v: 0.85, out: shp(S, 2.5, 0.6) });
    N(S, { ft: 'lowpass', f: 900, f1: 80, a: 0.01, d: 1.3, v: 0.55 });
    N(S, { ft: 'bandpass', f: 600, f1: 150, q: 1, a: 0.02, d: 1.0, v: 0.35 });
    F(S, { f: 220, ratio: 1.41, idx: 2, d: 1.2, v: 0.1 });
    return 1.5;
  } },
  victory: { max: 1, gap: 0.5, rev: 0.35, fn(S) { // 原创胜利短句(D 大调)
    const ph = [[74, 0, 0.13], [69, 0.15, 0.13], [74, 0.3, 0.13], [78, 0.45, 0.33], [76, 0.84, 0.13], [78, 0.99, 0.13], [81, 1.14, 0.75]];
    ph.forEach(([m, t, d]) => INST.brass(S, t, mtof(m), d, 1.4));
    [62, 66, 69].forEach((m) => INST.brass(S, 1.14, mtof(m), 0.75, 0.8));
    INST.taiko(S, 0, 0, 0, 0.8); INST.taiko(S, 0.45, 0, 0, 0.7); INST.taiko(S, 1.14, 0, 0, 1);
    INST.crash(S, 1.14, 0, 0, 1.2);
    return 2.0;
  } },
  timeup: { max: 1, gap: 0.3, rev: 0.25, fn(S) {
    const lp = filt(S, 'lowpass', 3000, 0.7);
    T(S, { type: 'square', f: 880, a: 0.005, hold: 0.12, d: 0.12, v: 0.1, out: lp });
    T(S, { t: 0.3, type: 'square', f: 587, a: 0.005, hold: 0.2, d: 0.3, v: 0.1, out: lp });
    F(S, { t: 0.3, f: 200, ratio: 1.4, idx: 1.5, d: 1.0, v: 0.2 });
    return 1.3;
  } },
  combo: { max: 2, gap: 0.08, rev: 0.2, fn(S) {
    T(S, { type: 'triangle', f: 1568, d: 0.08, v: 0.14 });
    T(S, { t: 0.06, type: 'triangle', f: 2093, d: 0.2, v: 0.14 });
    T(S, { t: 0.06, f: 4186, d: 0.25, v: 0.05 });
    return 0.3;
  } },
  assist: { max: 2, gap: 0.15, rev: 0.25, fn(S) { // 短号角
    INST.brass(S, 0, mtof(67), 0.1, 1.5);
    INST.brass(S, 0.12, mtof(72), 0.28, 1.6);
    N(S, { ft: 'bandpass', f: 3000, q: 0.8, d: 0.1, v: 0.15 });
    return 0.5;
  } },
  counter: { max: 2, gap: 0.1, rev: 0.4, fn(S) { // 亮"叮"
    T(S, { f: 2637, d: 0.6, v: 0.18 });
    T(S, { f: 5274, d: 0.3, v: 0.05 });
    F(S, { f: 1318, ratio: 3, idx: 1.2, d: 0.4, v: 0.1 });
    N(S, { ft: 'highpass', f: 6000, d: 0.03, v: 0.3 });
    return 0.6;
  } },
  pause: { max: 1, gap: 0.1, rev: 0.1, fn(S) {
    T(S, { type: 'triangle', f: 988, d: 0.06, v: 0.15 });
    T(S, { t: 0.07, type: 'triangle', f: 659, d: 0.12, v: 0.15 });
    return 0.2;
  } },
};
export const SFX_NAMES = Object.keys(SFX);

// ───────────────────────────── 配乐 ─────────────────────────────
// 和声音阶(7 音)与旋律音阶
const AEO = [0, 2, 3, 5, 7, 8, 10], DOR = [0, 2, 3, 5, 7, 9, 10], ION = [0, 2, 4, 5, 7, 9, 11];
const MIX = [0, 2, 4, 5, 7, 9, 10], PHR = [0, 1, 3, 5, 7, 8, 10], HMIN = [0, 2, 3, 5, 7, 8, 11], LOC = [0, 1, 3, 5, 6, 8, 10];
const MPENT = [0, 3, 5, 7, 10], PENT = [0, 2, 4, 7, 9], MIYAKO = [0, 1, 5, 7, 8], YO = [0, 2, 5, 7, 9], HIRA = [0, 2, 3, 7, 8];

// 1 小节节奏型 [起始16分, 长度]
const RH = [
  [[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]],
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
  [[0, 6], [6, 2], [8, 8]],
  [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]],
  [[2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]],
  [[0, 8], [8, 4], [12, 4]],
  [[0, 4], [4, 4], [8, 4], [12, 4]],
  [[0, 2], [2, 4], [6, 2], [8, 2], [10, 6]],
  [[0, 12], [12, 4]],
  [[0, 16]],
  [[4, 4], [8, 8]],
];
const RH_END = [[[0, 4], [4, 4], [8, 8]], [[0, 12]], [[0, 2], [2, 2], [4, 12]], [[0, 6], [6, 10]]];

const crashOn = (Ls) => (bar, b4, si, L) => b4 === 0 && Ls.includes(L);

// 曲目:sec 每字母 = 4 小节;prog[段落] = 4 小节和弦级数;parts:d 鼓 / n 和弦音型 / m 旋律 / f 自定义
// 音型字符:数字=和弦音序号(0根 1三 2五 3八度 4,5 高八度三/五 6 双八度),X=整和弦,m=闷音和弦,-=延音,x/X/o=鼓力度
const SONGS = {
  // 标题:热血日式摇滚 150BPM E 小调五声,失真吉他 + 太鼓 + 笛
  title: {
    bpm: 150, gain: 0.8, root: 40, harm: AEO, mel: MPENT, seed: 1507, sec: 'IAABBCBB', rev: 0.1, rh: [0, 1, 2, 3, 5, 6, 7],
    prog: { I: [0, 0, 5, 6], A: [0, 5, 3, 6], B: [5, 6, 0, 0], C: [3, 3, 5, 6] },
    parts: [
      { k: 'd', i: 'kick', pat: { I: 'x.....x.x.......', A: 'x.....x.x.....x.', B: 'x.x...x.x.x...x.' } },
      { k: 'd', i: 'snare', pat: { I: '....x.......x..x', A: '....x.......x...', B: '....x.......x...' } },
      { k: 'd', i: 'hat', pat: { A: 'x.x.x.x.x.x.x.x.', B: 'x.xxx.x.x.xxx.x.' }, v: 0.9 },
      { k: 'd', i: 'taiko', pat: { I: 'X..x..x.X.......', B: 'X.......X.......', C: 'X..x..X.x.x.X.xx' } },
      { k: 'd', i: 'crash', pat: 'X...............', when: crashOn('IB') },
      { k: 'n', i: 'bass', oct: 0, pat: { A: '0.0.0.0.0.0.0.0.', B: '0.0.0.0.0.0.3.2.', C: '0---------------' } },
      { k: 'n', i: 'power', root: true, oct: 1, pat: { I: 'X-----X-----X---', A: 'm.m.m.m.m.m.X---', B: 'X--.X--.X-X.X---' } },
      { k: 'm', i: 'flute', oct: 2, secs: 'ABC', v: 1.1 },
    ],
  },
  // 选人:紧张期待 132BPM D 多利亚,合成琶音 + 低音固定音型 + 拍手
  select: {
    bpm: 132, gain: 1.0, root: 38, harm: DOR, mel: [0, 2, 3, 7, 9], seed: 2311, sec: 'AABBAABC', rev: 0.08, rh: [1, 4, 7, 3],
    prog: { A: [0, 0, 6, 6], B: [2, 3, 2, 4], C: [0, 6, 3, 4] },
    parts: [
      { k: 'd', i: 'kick', pat: 'x...x...x...x...' },
      { k: 'd', i: 'clap', pat: '....x.......x...', secs: 'BC' },
      { k: 'd', i: 'hat', pat: 'xoxoxoxoxoxoxoxo', v: 0.8 },
      { k: 'd', i: 'shime', pat: '......x.......xx', v: 0.6, secs: 'BC' },
      { k: 'n', i: 'bass', oct: 0, pat: '0.00.00.0.00.0.3' },
      { k: 'n', i: 'synth', oct: 2, pat: '0123012301230123', secs: 'AB', v: 1.6 },
      { k: 'd', i: 'ohat', pat: '..x...x...x...x.', secs: 'BC', v: 0.8 },
      { k: 'n', i: 'brass', oct: 1, pat: 'X-..............', when: (bar) => bar % 2 === 1, secs: 'BC', v: 1.0 },
      { k: 'm', i: 'bell', oct: 3, secs: 'BC', v: 1.5 },
    ],
  },
  // 木叶:明快和风 138BPM A 大调,阳音阶,三味线琶音 + 太鼓
  stage_leaf: {
    bpm: 138, gain: 1.0, root: 45, harm: ION, mel: YO, seed: 4127, sec: 'IAABAABB', rev: 0.12, rh: [0, 1, 2, 3, 5, 6, 7],
    prog: { I: [0, 0, 3, 4], A: [0, 3, 4, 0], B: [5, 3, 0, 4] },
    parts: [
      { k: 'd', i: 'taiko', pat: { I: 'X.......X.......', A: 'X.......x.x.....', B: 'X.....x.X...x...' } },
      { k: 'd', i: 'shime', pat: { A: '..x...x...x.x..x', B: 'x.x.x.x.x.x.xxx.' }, v: 0.8 },
      { k: 'd', i: 'hat', pat: 'x...x...x...x...', v: 0.5, secs: 'AB' },
      { k: 'n', i: 'pluck', oct: 1, pat: { I: '0.2.3.2.0.2.3.2.', A: '0.2.3.2.1.2.3.2.', B: '0.2.3.4.3.2.1.2.' } },
      { k: 'n', i: 'bass', oct: 0, pat: '0...0.2.0...0.2.', secs: 'AB' },
      { k: 'm', i: 'flute', oct: 2, secs: 'AB' },
    ],
  },
  // 终末之谷:悲壮宿命 84BPM D 小调,弦乐垫 + 慢太鼓 → 激烈段
  stage_valley: {
    bpm: 84, gain: 0.85, root: 38, harm: AEO, mel: AEO, seed: 5903, sec: 'IAABCCDD', rev: 0.3, rh: [0, 2, 3, 5, 8, 6],
    prog: { I: [0, 0, 5, 5], A: [0, 5, 2, 6], B: [3, 5, 4, 4], C: [0, 6, 5, 4], D: [3, 6, 0, 0] },
    parts: [
      { k: 'n', i: 'strings', oct: 1, pat: 'X---------------', secs: 'IAB', v: 1.1 },
      { k: 'n', i: 'sub', oct: 0, pat: '0-------0-------', secs: 'IAB', v: 0.8 },
      { k: 'd', i: 'taiko', pat: { I: 'X...............', A: 'X.......x.......', B: 'X.......x...x...', C: 'X.x.x.xxX.x.x.xx', D: 'X.xxX.xxX.xxXxxx' } },
      { k: 'd', i: 'shime', pat: { C: 'x.x.x.x.x.x.x.x.', D: 'xxxxxxxxxxxxxxxx' }, v: 0.55 },
      { k: 'd', i: 'kick', pat: { C: 'x...x...x...x...', D: 'x.x.x.x.x.x.x.x.' } },
      { k: 'd', i: 'crash', pat: 'X...............', when: crashOn('CD') },
      { k: 'n', i: 'stac', oct: 1, pat: '0.0.0.0.1.1.2.2.', secs: 'CD' },
      { k: 'n', i: 'bass', oct: 0, pat: '0.0.0.0.0.0.0.0.', secs: 'CD' },
      { k: 'm', i: 'strings', oct: 2, secs: 'AB', v: 1.6 },
      { k: 'm', i: 'brass', oct: 1, secs: 'CD', v: 1.2 },
      { k: 'n', i: 'choir', oct: 2, pat: 'X---------------', secs: 'D', v: 0.7 },
    ],
  },
  // 死亡森林:阴森紧张 96BPM A 洛克里亚,低音脉冲 + 不协和音簇
  stage_forest: {
    bpm: 96, gain: 1.4, root: 45, harm: LOC, mel: [0, 1, 3, 6, 7], seed: 8317, sec: 'AABBAACC', rev: 0.35, rh: [8, 9, 10, 5, 2],
    prog: { A: [0, 0, 1, 0], B: [0, 4, 1, 0], C: [1, 1, 0, 4] },
    parts: [
      { k: 'n', i: 'sub', oct: -1, pat: '0.0.0.0.0.0.0.0.', v: 0.9 },
      { k: 'd', i: 'kick', pat: 'x..x............', v: 0.7 },
      { k: 'd', i: 'hat', pat: '..x...x...x...xx', v: 0.5, secs: 'BC' },
      { k: 'd', i: 'tom', pat: { C: 'x..x..x...x.x...' }, f: 110, v: 0.8 },
      { k: 'f', fn(S, t, ctx) { // 音簇:根、小二度、三全音
        if (ctx.s !== 0 || ctx.b4 % 2) return;
        const r = ctx.chordMidi(0, 1), dur = ctx.d16 * 32;
        for (const m of [r, r + 1, r + 6]) INST.strings(S, t, mtof(m), dur, 0.9);
      } },
      { k: 'd', i: 'metal', pat: '..........x.....', when: (bar) => bar % 2 === 1, v: 0.9 },
      { k: 'm', i: 'ghost', oct: 2, secs: 'BC', v: 1.2 },
    ],
  },
  // 尸魂界:凛然和风摇滚 164BPM B 弗里几亚,都节调式筝旋律 + 摇滚鼓
  stage_soul: {
    bpm: 164, gain: 1.1, root: 47, harm: PHR, mel: MIYAKO, seed: 9719, sec: 'IAABBACB', rev: 0.15, rh: [0, 1, 2, 3, 5, 6],
    prog: { I: [0, 0, 1, 1], A: [0, 1, 0, 6], B: [5, 6, 0, 0], C: [3, 1, 3, 1] },
    parts: [
      { k: 'd', i: 'kick', pat: { I: 'x...............', A: 'x.....x...x.x...', B: 'x.x...x.x.x...x.', C: 'x.......x.......' } },
      { k: 'd', i: 'snare', pat: { A: '....x.......x...', B: '....x.......x...', C: '........x.......' } },
      { k: 'd', i: 'hat', pat: { A: 'x.x.x.x.x.x.x.x.', B: 'x.x.x.x.x.x.x.x.' } },
      { k: 'd', i: 'ohat', pat: { B: '..x...x...x...x.' }, v: 0.8 },
      { k: 'd', i: 'crash', pat: 'X...............', when: crashOn('IB') },
      { k: 'n', i: 'bass', oct: 0, pat: { A: '0.0.0.0.0.0.0.0.', B: '0.0.0.0.0.0.0.0.', C: '0.......0.......' } },
      { k: 'n', i: 'power', root: true, oct: 0, pat: { I: 'X-------X-------', A: 'm.mm.mm.m.mm.m.m', B: 'X--.X--.X--.X-X-' } },
      { k: 'n', i: 'koto', oct: 1, pat: { I: '0.2.3.4.3.2.1.2.', C: '0..2..3..4..3.2.' } },
      { k: 'm', i: 'koto', oct: 2, secs: 'ABC', v: 1.2 },
    ],
  },
  // 沙漠/虚圈:空旷虚无 70BPM C# 小调,平调子音阶钢琴 + 长混响钟 + 低沉轰鸣
  stage_desert: {
    bpm: 70, gain: 1.05, root: 37, harm: AEO, mel: HIRA, seed: 13109, sec: 'AABBAABB', rev: 0.55, rh: [8, 9, 10, 5, 2],
    prog: { A: [0, 0, 5, 5], B: [3, 3, 0, 4] },
    parts: [
      { k: 'n', i: 'drone', oct: 0, pat: '0-------------------------------', v: 1 },
      { k: 'd', i: 'boom', pat: 'X...............................' },
      { k: 'n', i: 'bell', oct: 3, pat: '0.......2.......3...............', v: 0.8 },
      { k: 'm', i: 'piano', oct: 2, v: 1.1 },
      { k: 'n', i: 'windpad', oct: 2, pat: '0-----------------------------------------------................', v: 1 },
      { k: 'd', i: 'shaker', pat: '........x.......', v: 0.5, secs: 'B' },
    ],
  },
  // 都市:现代摇滚 124BPM G 混合利底亚,失真贝斯 + 切分吉他 + 主音吉他
  stage_town: {
    bpm: 124, gain: 1.3, root: 43, harm: MIX, mel: PENT, seed: 15121, sec: 'IAABAABB', rev: 0.1, rh: [0, 1, 3, 4, 7, 6],
    prog: { I: [0, 0, 6, 6], A: [0, 6, 3, 0], B: [5, 3, 6, 0] },
    parts: [
      { k: 'd', i: 'kick', pat: { I: 'x.......x.......', A: 'x.....x.x.......', B: 'x.....x.x.x.....' } },
      { k: 'd', i: 'snare', pat: { A: '....x.......x...', B: '....x.......x..x' } },
      { k: 'd', i: 'hat', pat: 'x.x.x.x.x.x.x.x.' },
      { k: 'd', i: 'ohat', pat: { B: '..............x.' } },
      { k: 'd', i: 'crash', pat: 'X...............', when: crashOn('B') },
      { k: 'n', i: 'bassG', oct: 0, pat: { I: '0.......0.......', A: '0.0.03.00.0.03.0', B: '0..00..03..33..2' } },
      { k: 'n', i: 'power', root: true, oct: 1, pat: { A: '..m...m...m...m.', B: 'X-.X-.X-X-.X-.X-' } },
      { k: 'm', i: 'synth', oct: 2, secs: 'A', v: 1.3 },
      { k: 'm', i: 'lead', oct: 2, secs: 'B' },
    ],
  },
  // 竞技场:激昂热血 172BPM G 多利亚,快速太鼓 + 号角
  stage_arena: {
    bpm: 172, gain: 0.8, root: 43, harm: DOR, mel: DOR, seed: 17317, sec: 'IAABBCBB', rev: 0.15, rh: [0, 2, 3, 5, 6],
    prog: { I: [0, 0, 6, 6], A: [0, 3, 0, 6], B: [2, 3, 6, 0], C: [4, 2, 3, 3] },
    parts: [
      { k: 'd', i: 'taiko', pat: { I: 'X.......X...X.X.', A: 'X.xxX.x.X.xxX.x.', B: 'X.xxX.xxX.xxX.xx', C: 'X..X..X.X..X..X.' } },
      { k: 'd', i: 'shime', pat: { A: 'x.x.x.x.x.x.x.x.', B: 'xxxxxxxxxxxxxxxx' }, v: 0.5 },
      { k: 'd', i: 'kick', pat: { A: 'x...x...x...x...', B: 'x...x...x...x...' } },
      { k: 'd', i: 'snare', pat: { B: '....x.......x...' } },
      { k: 'd', i: 'crash', pat: 'X...............', when: crashOn('IBC') },
      { k: 'n', i: 'bass', oct: 0, pat: '0.0.0.0.0.0.0.0.', secs: 'ABC' },
      { k: 'n', i: 'brass', oct: 1, pat: { I: 'X--.X--.X-......', B: 'X...............', C: 'X--.X--.X--.X---' }, v: 0.6 },
      { k: 'n', i: 'stac', oct: 1, pat: { A: '0.1.2.1.0.1.2.1.' } },
      { k: 'm', i: 'brass', oct: 2, secs: 'AB', v: 1.3 },
    ],
  },
  // 首领:压迫 180BPM C 和声小调,合唱垫 + 管风琴 + 低音铜管
  boss: {
    bpm: 180, gain: 0.8, root: 36, harm: HMIN, mel: HMIN, seed: 19913, sec: 'AABBCCBB', rev: 0.2, rh: [0, 2, 3, 5, 6],
    prog: { A: [0, 0, 5, 4], B: [0, 3, 5, 4], C: [5, 1, 4, 4] },
    parts: [
      { k: 'd', i: 'kick', pat: { A: 'x.x.x.x.x.x.x.x.', B: 'x.x.x.x.x.x.x.x.', C: 'x...x...x...x...' } },
      { k: 'd', i: 'snare', pat: { A: '....x.......x...', B: '....x.......x...', C: '....x..x....x..x' } },
      { k: 'd', i: 'hat', pat: { B: 'x.x.x.x.x.x.x.x.' } },
      { k: 'd', i: 'crash', pat: 'X...............', when: crashOn('BC') },
      { k: 'n', i: 'choir', oct: 2, pat: 'X---------------', v: 0.9 },
      { k: 'n', i: 'organ', oct: 2, pat: { A: 'X..X..X.........', C: 'X--.X--.X--.X---' }, v: 0.8 },
      { k: 'n', i: 'brass', oct: 0, pat: '0.0.0.0.3.0.2.0.', v: 1.1 },
      { k: 'n', i: 'sub', oct: 0, pat: '0...0...0...0...', v: 0.7 },
      { k: 'm', i: 'organ', oct: 2, secs: 'BC', v: 1.2 },
    ],
  },
  // 结算:平和胜利 96BPM F 大调,钢琴分解和弦 + 钟琴旋律
  results: {
    bpm: 96, gain: 1.3, root: 41, harm: ION, mel: PENT, seed: 21101, sec: 'AABBAABB', rev: 0.3, rh: [0, 2, 5, 6, 3],
    prog: { A: [0, 4, 5, 3], B: [3, 4, 2, 5] },
    parts: [
      { k: 'd', i: 'kick', pat: 'x.......x.......', v: 0.6 },
      { k: 'd', i: 'shaker', pat: 'x.o.x.o.x.o.x.o.', v: 0.9 },
      { k: 'n', i: 'piano', oct: 1, pat: '0.1.2.1.3.1.2.1.', v: 0.8 },
      { k: 'n', i: 'strings', oct: 1, pat: 'X---------------', v: 0.6 },
      { k: 'n', i: 'bass', oct: 0, pat: '0.......2.......', v: 0.7 },
      { k: 'm', i: 'bell', oct: 2, v: 1.2 },
    ],
  },
  // 续关:紧张滴答 120BPM A 和声小调
  continue: {
    bpm: 120, gain: 1.3, root: 45, harm: HMIN, mel: HMIN, seed: 22709, sec: 'AABBAABB', rev: 0.2,
    prog: { A: [0, 0, 5, 4], B: [3, 3, 4, 4] },
    parts: [
      { k: 'd', i: 'wood', pat: 'x.......x.......', f: 2100 },
      { k: 'd', i: 'wood', pat: '....x.......x...', f: 1400 },
      { k: 'd', i: 'kick', pat: { A: 'x..x............', B: 'x..x....x..x....' }, v: 0.6 },
      { k: 'n', i: 'sub', oct: 0, pat: '0...0...0...0...', v: 0.8 },
      { k: 'n', i: 'strings', oct: 1, pat: 'X---------------', v: 0.8 },
      { k: 'n', i: 'synth', oct: 2, pat: '0.0.0.0.0.0.0.0.', secs: 'B', v: 0.8 },
      { k: 'd', i: 'metal', pat: '............x...', when: (bar) => bar % 4 === 3, v: 0.7 },
    ],
  },
};
export const BGM_KEYS = Object.keys(SONGS);

// 和弦音:级数 deg,序号 k → midi
const TONE_STEPS = [0, 2, 4, 7, 9, 11, 14];
function chordMidi(so, deg, k, oct) {
  const st = deg + TONE_STEPS[k];
  return so.root + 12 * oct + so.harm[st % 7] + 12 * Math.floor(st / 7);
}
function chordPcs(so, deg) { return new Set([0, 1, 2].map((k) => mod(chordMidi(so, deg, k, 0) - so.root, 12))); }
const melSemi = (so, i) => so.mel[mod(i, so.mel.length)] + 12 * Math.floor(i / so.mel.length);

// 原创旋律生成:每段落 4 小节乐句 = 动机 / 发展 / 动机模进 / 收束(问句 & 答句两种结尾)
function genPhrase(so, L, rng) {
  const n = so.mel.length, prog = so.prog[L];
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const STEP = [-2, -1, -1, -1, 1, 1, 1, 2, 2, -3, 3, 0];
  const lo = -1, hi = 2 * n;
  const cl = (i) => clamp(i, lo, hi);
  const snap = (idx, b) => {
    const set = chordPcs(so, prog[b]);
    let best = idx, bd = 9;
    for (let k = -2; k <= 2; k++) if (set.has(mod(melSemi(so, idx + k), 12)) && Math.abs(k) < bd) { bd = Math.abs(k); best = idx + k; }
    return cl(best);
  };
  const R = so.rh || [0, 1, 2, 3, 5, 6, 7];
  const r0 = RH[pick(R)], r1 = RH[pick(R)], r3 = pick(RH_END);
  let cur = n + Math.floor(rng() * 3) - 1;
  const bars = [[], [], [], []];
  r0.forEach(([s, len], j) => { cur = j === 0 ? snap(cur, 0) : cl(cur + pick(STEP)); bars[0].push({ s, len, i: cur }); });
  r1.forEach(([s, len]) => { cur = cl(cur + pick(STEP)); if (s === 0 || s === 8) cur = snap(cur, 1); bars[1].push({ s, len, i: cur }); });
  const sh = pick([-2, -1, 1, 2]);
  bars[2] = bars[0].map((nt, j) => ({ ...nt, i: j === 0 ? snap(cl(nt.i + sh), 2) : cl(nt.i + sh) }));
  cur = bars[2][bars[2].length - 1].i;
  const steps = r3.map(() => pick(STEP));
  const ending = (answer) => {
    let c = cur;
    return r3.map(([s, len], j) => {
      if (j < r3.length - 1) { c = cl(c + steps[j]); if (j === 0) c = snap(c, 3); return { s, len, i: c }; }
      // 答句收主音,问句收五度或二度
      let best = c, bd = 99;
      for (let k = -n; k <= n; k++) {
        const pc = mod(melSemi(so, c + k), 12), ok = answer ? pc === 0 : pc === 7 || pc === 2;
        if (ok && Math.abs(k) < bd && c + k >= lo && c + k <= hi) { bd = Math.abs(k); best = c + k; }
      }
      return { s, len, i: best };
    });
  };
  return [[bars[0], bars[1], bars[2], ending(false)], [bars[0], bars[1], bars[2], ending(true)]];
}
function prepSong(so) {
  if (so.ready) return so;
  so.bars = so.sec.length * 4;
  const rng = rng32(so.seed);
  so.melo = {};
  for (const L of [...new Set(so.sec)]) so.melo[L] = genPhrase(so, L, rng);
  for (const p of so.parts) {
    const pats = p.pat == null ? [] : typeof p.pat === 'string' ? [p.pat] : Object.values(p.pat);
    for (const s of pats) if (s.length % 16) console.warn('[audio] 音型长度不是16的倍数', s);
  }
  so.ready = true;
  return so;
}

// 播放器:每首曲目一个实例(交叉淡入时可两首并存)
function makePlayer(G, key, t0) {
  const so = prepSong(SONGS[key]), c = G.c;
  const lvl = c.createGain(); lvl.gain.value = so.gain ?? 1; lvl.connect(G.bgmTrim); // 曲目响度校准
  const out = c.createGain(); out.gain.value = 0; out.connect(lvl);
  const Ss = so.parts.map((p) => {
    const bus = c.createGain(); bus.gain.value = 1; bus.connect(out);
    const rv = p.rev ?? so.rev;
    if (rv) { const s = c.createGain(); s.gain.value = rv; bus.connect(s); s.connect(G.bgmRev); }
    return { c, G, T: 0, o: bus, p: 1 };
  });
  return { key, so, out, Ss, step: 0, next: t0, d16: 60 / so.bpm / 4, stopAt: Infinity };
}
const DRUM_VEL = { x: 0.8, X: 1, o: 0.4 };
function playStep(pl, n, t) {
  const so = pl.so, s = n % 16, bar = Math.floor(n / 16) % so.bars, si = Math.floor(bar / 4), b4 = bar % 4;
  const L = so.sec[si], variant = si > 0 && so.sec[si - 1] === L ? 1 : 0;
  const prog = so.prog[L] || so.prog[Object.keys(so.prog)[0]];
  const deg = prog[b4];
  so.parts.forEach((p, idx) => {
    if (p.secs && !p.secs.includes(L)) return;
    if (p.when && !p.when(bar, b4, si, L)) return;
    const S = pl.Ss[idx], v = p.v ?? 1;
    if (p.k === 'm') {
      const notes = so.melo[L][variant][b4];
      for (const nt of notes) if (nt.s === s) {
        const m = so.root + 12 * (p.oct ?? 2) + melSemi(so, nt.i);
        INST[p.i](S, t, mtof(m), nt.len * pl.d16 * 0.95, v * (s === 0 ? 1 : 0.85));
      }
      return;
    }
    if (p.k === 'f') { p.fn(S, t, { s, b4, bar, L, d16: pl.d16, chordMidi: (k, oct) => chordMidi(so, deg, k, oct) }); return; }
    const pat = typeof p.pat === 'string' ? p.pat : p.pat && p.pat[L];
    if (!pat) return;
    const pos = (bar % (pat.length / 16)) * 16 + s, ch = pat[pos];
    if (!ch || ch === '.' || ch === '-') return;
    if (p.k === 'd') { const dv = DRUM_VEL[ch]; if (dv) INST[p.i](S, t, p.f || 0, 0, dv * v); return; }
    // 和弦/音型
    let len = 1; while (pat[pos + len] === '-') len++;
    const dur = len * pl.d16 * 0.95, oct = p.oct ?? 1;
    if (ch >= '0' && ch <= '6') INST[p.i](S, t, mtof(chordMidi(so, deg, +ch, oct)), dur, v * (s % 4 === 0 ? 1 : 0.85));
    else if (ch === 'X' || ch === 'm') {
      const mute = ch === 'm';
      const ks = p.root ? [0] : [0, 1, 2];
      for (const k of ks) INST[p.i](S, t, mtof(chordMidi(so, deg, k, oct)), dur, v * (mute ? 0.8 : 1), { mute });
    }
  });
}
function scheduleUntil(pl, tEnd) {
  while (pl.next < tEnd && pl.next < pl.stopAt) {
    playStep(pl, pl.step, pl.next);
    pl.next += pl.d16; pl.step++;
  }
}

// ───────────────────────────── 音效发声(限流 / 复音) ─────────────────────────────
const GLOBAL_MAX = 40;
function playSfx(G, name, opts, T0, state) {
  const def = SFX[name];
  if (!def) return;
  const c = G.c;
  let vol = clamp(opts.vol ?? 1, 0, 2);
  let pitch = clamp(opts.pitch ?? 1, 0.25, 4);
  if (state) {
    const rec = state.rec[name] || (state.rec[name] = { last: -1, times: [] });
    if (T0 - rec.last < (def.gap ?? 0.03)) return; // 最小间隔限流
    rec.times = rec.times.filter((x) => T0 - x < 0.3);
    vol /= Math.sqrt(1 + rec.times.length * 0.35); // 密集连发逐步衰减
    rec.last = T0; rec.times.push(T0);
    // 复音上限:同名超过 max 或全局超过上限时淡出最旧声部
    state.voices = state.voices.filter((vc) => vc.end > T0);
    const same = state.voices.filter((vc) => vc.name === name);
    if (same.length >= (def.max ?? 4)) kill(same[0], T0, state);
    if (state.voices.length >= GLOBAL_MAX) kill(state.voices[0], T0, state);
  }
  if (def.vary) pitch *= 1 + (rnd() * 2 - 1) * def.vary;
  const vg = c.createGain(); vg.gain.value = vol;
  const pan = c.createStereoPanner(); pan.pan.value = clamp(opts.pan ?? 0, -1, 1);
  vg.connect(pan); pan.connect(G.sfxIn);
  let rs = null;
  if (def.rev) { rs = c.createGain(); rs.gain.value = def.rev; pan.connect(rs); rs.connect(G.sfxRev); }
  const S = { c, G, T: T0, o: vg, p: pitch };
  const dur = def.fn(S) || 0.5;
  const voice = { name, vg, end: T0 + dur + 0.05 };
  if (state) {
    state.voices.push(voice);
    setTimeout(() => { try { vg.disconnect(); pan.disconnect(); rs && rs.disconnect(); } catch (e) { /* 已断开 */ } }, (dur + 3) * 1000);
  }
  return dur;
}
function kill(vc, now, state) {
  const P = vc.vg.gain;
  P.cancelScheduledValues(now); P.setValueAtTime(P.value, now); P.linearRampToValueAtTime(0, now + 0.03);
  vc.end = now; state.voices = state.voices.filter((x) => x !== vc);
}

// ───────────────────────────── 运行时单例 ─────────────────────────────
let ctx = null, G = null, timer = null;
const vol = { master: 0.8, bgm: 0.6, sfx: 0.9 };
const sstate = { rec: Object.create(null), voices: [] };
let players = [], curKey = null, pendingKey = null;

function tick() {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const pl of players) {
    // 标签页隐藏/卡顿后恢复:跳过错过的步而不补发
    if (pl.next < now - 0.03) {
      const missed = Math.ceil((now - pl.next) / pl.d16);
      pl.step += missed; pl.next += missed * pl.d16;
    }
    scheduleUntil(pl, now + 0.1);
  }
  players = players.filter((pl) => {
    if (now > pl.stopAt + 0.2) { try { pl.out.disconnect(); } catch (e) { /* 忽略 */ } return false; }
    return true;
  });
}

function startBgm(key) {
  const now = ctx.currentTime;
  for (const pl of players) fadeOut(pl, now, 0.8);
  const pl = makePlayer(G, key, now + 0.06);
  pl.out.gain.setValueAtTime(0, now);
  pl.out.gain.linearRampToValueAtTime(1, now + 0.6);
  players.push(pl);
  curKey = key;
  tick();
}
function fadeOut(pl, now, fade) {
  if (pl.stopAt !== Infinity) return;
  const P = pl.out.gain;
  P.cancelScheduledValues(now); P.setValueAtTime(P.value, now); P.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
  pl.stopAt = now + Math.max(0.01, fade);
}

const audio = {
  init() {
    try {
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        ctx = new AC({ latencyHint: 'interactive' });
        G = buildGraph(ctx, false, vol);
        timer = setInterval(tick, 25);
      }
      if (ctx.state === 'suspended') ctx.resume().then(() => {
        if (pendingKey) { const k = pendingKey; pendingKey = null; audio.bgm(k); }
      }).catch(() => {});
      else if (pendingKey) { const k = pendingKey; pendingKey = null; audio.bgm(k); }
    } catch (e) { console.warn('[audio] init 失败', e); }
  },
  sfx(name, opts = {}) {
    if (!ctx || ctx.state !== 'running' || !SFX[name]) return;
    try { playSfx(G, name, opts || {}, ctx.currentTime + 0.005, sstate); } catch (e) { console.warn('[audio] sfx', name, e); }
  },
  bgm(key) {
    if (key == null) { pendingKey = null; audio.stopBgm(); return; }
    if (!SONGS[key]) return;
    if (!ctx || ctx.state !== 'running') { pendingKey = key; return; }
    if (key === curKey && players.some((p) => p.key === key && p.stopAt === Infinity)) return;
    startBgm(key);
  },
  stopBgm(fade = 0.5) {
    curKey = null;
    if (!ctx) { pendingKey = null; return; }
    const now = ctx.currentTime;
    for (const pl of players) fadeOut(pl, now, fade);
  },
  setVolumes({ master, bgm, sfx } = {}) {
    if (master != null) vol.master = clamp(+master || 0, 0, 1);
    if (bgm != null) vol.bgm = clamp(+bgm || 0, 0, 1);
    if (sfx != null) vol.sfx = clamp(+sfx || 0, 0, 1);
    if (G) {
      const now = ctx.currentTime;
      G.master.gain.setTargetAtTime(vol.master, now, 0.02);
      G.bgm.gain.setTargetAtTime(vol.bgm, now, 0.02);
      G.sfx.gain.setTargetAtTime(vol.sfx, now, 0.02);
    }
  },
  get volumes() { return { ...vol }; },
  duck(sec = 1) {
    if (!G) return;
    const now = ctx.currentTime, P = G.duck.gain, low = 0.316; // 约 -10dB
    P.cancelScheduledValues(now); P.setValueAtTime(P.value, now);
    P.linearRampToValueAtTime(low, now + 0.06);
    P.setValueAtTime(low, now + 0.06 + Math.max(0, sec));
    P.linearRampToValueAtTime(1, now + 0.06 + Math.max(0, sec) + 0.5);
  },
  get current() { return curKey; },
  // 调试:当前活动声部与配乐调度状态
  _debug() {
    const now = ctx ? ctx.currentTime : 0;
    return { now, state: ctx && ctx.state, voices: sstate.voices.filter((v) => v.end > now).length, players: players.map((p) => ({ key: p.key, ahead: p.next - now, step: p.step, stopping: p.stopAt !== Infinity })) };
  },
  get ready() { return !!ctx && ctx.state === 'running'; },
  sfxNames: SFX_NAMES,
  bgmKeys: BGM_KEYS,
};
export default audio;

// ───────────────────────────── 测试导出 ─────────────────────────────
// 离线渲染同一套合成图;raw=true 时绕过压缩/限幅/软削波,用于检查真实电平
export async function renderOffline(kind, name, seconds = 2, { raw = false, sr = 44100, opts = {}, at } = {}) {
  // 音效默认在 0.3s 处触发:新建上下文中压缩器检测器有启动瞬态,预热后才代表真实运行状态
  if (at == null) at = kind === 'sfx' ? 0.3 : 0.01;
  const oc = new OfflineAudioContext(2, Math.ceil(sr * (seconds + (kind === 'sfx' ? at : 0))), sr);
  const g = buildGraph(oc, raw, { master: 1, bgm: 1, sfx: 1 });
  if (kind === 'sfx') {
    if (!SFX[name]) throw new Error('未知音效 ' + name);
    playSfx(g, name, opts, at, null);
  } else {
    if (!SONGS[name]) throw new Error('未知配乐 ' + name);
    const pl = makePlayer(g, name, 0.01);
    pl.out.gain.value = 1;
    scheduleUntil(pl, seconds);
  }
  return oc.startRendering();
}
export function analyzeBuffer(buf, floor = 0.001) {
  let peak = 0, sum = 0, nan = 0, last = 0, first = -1;
  const n = buf.length;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const x = d[i];
      if (!Number.isFinite(x)) { nan++; continue; }
      const a = Math.abs(x);
      if (a > peak) peak = a;
      sum += x * x;
      if (a > floor) { if (i > last) last = i; if (first < 0 || i < first) first = i; }
    }
  }
  // rms 只统计首个有声样本之后;len = 首末有声样本跨度
  const span = first < 0 ? 0 : n - first;
  const rms2 = span ? Math.sqrt(sum / (span * buf.numberOfChannels)) : 0;
  return { peak, rms: rms2, peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 20 * Math.log10(rms2 || 1e-9), nan, len: first < 0 ? 0 : (last - first) / buf.sampleRate, start: first / buf.sampleRate };
}
