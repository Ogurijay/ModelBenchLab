/**
 * @file src/core/audio.js
 * @description 程序化 WebAudio 音频总线（契约 §3.6）。全部音效由代码合成，
 *              不加载任何外部音频文件；AudioContext 惰性创建（首次 `enable()` 才 new），
 *              以规避浏览器自动播放策略报错，并保证本模块在 Node 环境被 import 不出错。
 *
 * 契约说明（§0 依赖方向）：`core/*` 不 import 本项目其他模块，因此本文件**不**引用
 * `core/rng.js`，而是内联一份同族的 mulberry32 种子 RNG（固定种子、确定性、
 * 绝不使用 Math.random），用于生成噪声 AudioBuffer 与音效的细微随机化。
 *
 * 声学公式来源：
 * - 声速 343 m/s（20 °C 干燥空气），雷声延迟 t = d / c。
 * - 球面扩散衰减 A ∝ 1/r（此处用 1/(1+r/r0) 的软化形式避免近距离爆音）。
 * - 大气对高频的吸收随距离近似指数衰减（ISO 9613-1 的工程化简化），
 *   体现为低通截止 fc = f0 · exp(−d/D)，故远雷沉闷、近雷尖锐。
 * - 粉噪声滤波器组：Paul Kellet «refined» pink noise filter（−3 dB/oct 近似）。
 * - 棕噪声：白噪声一阶泄漏积分（−6 dB/oct）。
 * - 伪随机数：Mulberry32（Tommy Ettinger / bryc 公开域实现）。
 */

/** 声速（20 °C 干燥空气，m/s）——雷声延迟基准 */
const SPEED_OF_SOUND = 343;

/** 主输出默认音量 */
const DEFAULT_MASTER_VOLUME = 0.35;

/** 噪声缓冲区固定种子（确定性合成，禁止 Math.random） */
const AUDIO_SEED = 0x4d616e68; // 'Manh'

/** 指数包络的最小非零值（exponentialRampToValueAtTime 不接受 0） */
const EPS_GAIN = 1e-4;

/** 同时存活的一次性音声上限，防止 update 未被调用时无限增长 */
const MAX_VOICES = 48;

/* -------------------------------------------------------------------------- */
/* 内联工具：种子 RNG 与数学                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Mulberry32 种子伪随机数发生器。
 * @param {number} seed uint32 种子
 * @returns {() => number} [0,1) 随机数发生器
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 数值钳制。
 * @param {number} v 输入
 * @param {number} min 下界
 * @param {number} max 上界
 * @returns {number}
 */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * 安全地把任意输入转成 [0,1] 的强度值。
 * @param {number} v 输入
 * @returns {number}
 */
function level01(v) {
  return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

/**
 * 帧率无关的指数逼近（与 core/mathx.js 的 damp 同式，此处内联以免跨模块依赖）。
 * current + (target − current) · (1 − e^(−λ·dt))
 * @param {number} current 当前值
 * @param {number} target 目标值
 * @param {number} lambda 时间常数倒数
 * @param {number} dt 秒
 * @returns {number}
 */
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/* -------------------------------------------------------------------------- */
/* 噪声缓冲区生成                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 生成白噪声（能量谱平坦）。
 * @param {Float32Array} data 目标数组
 * @param {() => number} rnd 种子随机源
 */
function fillWhite(data, rnd) {
  for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
}

/**
 * 生成粉噪声（−3 dB/oct）。Paul Kellet 精化滤波器组，雨声底噪的基材。
 * @param {Float32Array} data 目标数组
 * @param {() => number} rnd 种子随机源
 */
function fillPink(data, rnd) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    data[i] = clamp((b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11, -1, 1);
    b6 = w * 0.115926;
  }
}

/**
 * 生成棕噪声（−6 dB/oct，白噪声的泄漏积分）。雷声轰隆与城市底噪的基材。
 * @param {Float32Array} data 目标数组
 * @param {() => number} rnd 种子随机源
 */
function fillBrown(data, rnd) {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = rnd() * 2 - 1;
    last = (last + 0.022 * w) / 1.022;
    data[i] = clamp(last * 3.6, -1, 1);
  }
}

/**
 * 生成程序化混响冲激响应：指数衰减的噪声 + 一阶低通（越远越暗）。
 * @param {Float32Array} data 目标数组
 * @param {() => number} rnd 种子随机源
 * @param {number} decayPow 衰减指数（越大衰减越快）
 * @param {number} damping 一阶低通系数 0..1（越大越暗）
 */
function fillImpulse(data, rnd, decayPow, damping) {
  const n = data.length;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const env = Math.pow(1 - i / n, decayPow);
    const w = (rnd() * 2 - 1) * env;
    lp = lp * damping + w * (1 - damping);
    data[i] = lp;
  }
}

/* -------------------------------------------------------------------------- */
/* 环境探测                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 解析当前环境可用的 AudioContext 构造器（Node 环境返回 null）。
 * 顶层不访问，只在 enable() 时调用，保证本模块可被 Node 直接 import。
 * @returns {Function|null}
 */
function resolveAudioContextCtor() {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis;
  return g.AudioContext || g.webkitAudioContext || null;
}

/* -------------------------------------------------------------------------- */
/* 主工厂                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 创建程序化音频总线。返回对象在 `enable()` 之前不持有任何 AudioContext。
 *
 * @returns {{
 *   enabled: boolean,
 *   enable: () => Promise<void>,
 *   disable: () => void,
 *   thunder: (distanceMeters: number, strength: number) => void,
 *   rainLevel: (level: number) => void,
 *   windLevel: (level: number) => void,
 *   cityAmbience: (level: number) => void,
 *   boatHorn: () => void,
 *   update: (dt: number) => void,
 *   dispose: () => void
 * }} AudioBus
 */
export function createAudioBus() {
  /** @type {AudioContext|null} 惰性创建 */
  let actx = null;
  /** @type {boolean} 是否已构建节点图 */
  let built = false;
  /** @type {boolean} 已释放 */
  let destroyed = false;
  /** @type {number|undefined} 挂起定时器句柄 */
  let suspendTimer;

  const rnd = mulberry32(AUDIO_SEED);

  // ---- 总线节点 ----
  let masterGain = null;
  let compressor = null;
  let sfxGain = null; // 一次性音效（雷、汽笛）汇总
  let ambientGain = null; // 循环底噪汇总
  let revShortIn = null; // 短混响送出
  let revLongIn = null; // 长混响送出

  // ---- 雨 ----
  let rainGain = null;
  let rainHissGain = null;
  let rainBodyGain = null;
  let rainHissBP = null;
  let rainBodyBP = null;

  // ---- 风 ----
  let windGain = null;
  let windBP = null;
  let windGustGain = null;

  // ---- 城市 ----
  let cityGain = null;
  let citySwellGain = null;

  /** @type {AudioScheduledSourceNode[]} 循环底噪与 LFO 源 */
  const loopSources = [];
  /** @type {Array<{until:number, nodes:AudioNode[], sources:AudioScheduledSourceNode[]}>} */
  const voices = [];

  /** @type {AudioBuffer|null} */
  let bufWhite = null;
  /** @type {AudioBuffer|null} */
  let bufPink = null;
  /** @type {AudioBuffer|null} */
  let bufBrown = null;

  // 平滑状态：目标值 + 当前值（全部在 update 里按 damp 逼近，杜绝突变）
  const state = {
    rain: { target: 0, value: 0, lambda: 1.5 },
    wind: { target: 0, value: 0, lambda: 1.1 },
    city: { target: 0, value: 0, lambda: 0.8 }
  };
  const applied = { rain: -1, wind: -1, city: -1 };

  const bus = {
    enabled: false,
    enable,
    disable,
    thunder,
    rainLevel,
    windLevel,
    cityAmbience,
    boatHorn,
    update,
    dispose
  };

  /* ------------------------------------------------------------------ */
  /* 构建                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * 创建一段程序化噪声 AudioBuffer。
   * @param {number} seconds 时长（秒）
   * @param {'white'|'pink'|'brown'} kind 噪声种类
   * @returns {AudioBuffer}
   */
  function makeNoiseBuffer(seconds, kind) {
    const len = Math.max(1, Math.floor(actx.sampleRate * seconds));
    const buffer = actx.createBuffer(1, len, actx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'white') fillWhite(data, rnd);
    else if (kind === 'pink') fillPink(data, rnd);
    else fillBrown(data, rnd);
    return buffer;
  }

  /**
   * 创建程序化混响冲激响应缓冲。
   * @param {number} seconds 拖尾长度
   * @param {number} decayPow 衰减指数
   * @param {number} damping 高频阻尼 0..1
   * @returns {AudioBuffer}
   */
  function makeImpulseBuffer(seconds, decayPow, damping) {
    const len = Math.max(1, Math.floor(actx.sampleRate * seconds));
    const buffer = actx.createBuffer(1, len, actx.sampleRate);
    fillImpulse(buffer.getChannelData(0), rnd, decayPow, damping);
    return buffer;
  }

  /**
   * 启动一个循环噪声源。
   * @param {AudioBuffer} buffer 噪声缓冲
   * @param {number} rate playbackRate（调节噪声"音高"/粗细）
   * @param {AudioNode} dest 目标节点
   * @returns {AudioBufferSourceNode}
   */
  function startLoop(buffer, rate, dest) {
    const src = actx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    src.connect(dest);
    // 随机起始偏移让多层噪声去相关，避免梳状干涉
    src.start(actx.currentTime, rnd() * buffer.duration);
    loopSources.push(src);
    return src;
  }

  /**
   * 构建全部常驻节点图（只在首次 enable 时执行一次）。
   */
  function buildGraph() {
    // --- 总输出：ambient/sfx -> masterGain -> compressor -> destination ---
    masterGain = actx.createGain();
    masterGain.gain.value = EPS_GAIN;

    compressor = actx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.28;

    masterGain.connect(compressor);
    compressor.connect(actx.destination);

    sfxGain = actx.createGain();
    sfxGain.gain.value = 1;
    sfxGain.connect(masterGain);

    ambientGain = actx.createGain();
    ambientGain.gain.value = 1;
    ambientGain.connect(masterGain);

    // --- 程序化混响：短（近处空间感）/ 长（远雷滚动拖尾）---
    const convShort = actx.createConvolver();
    convShort.normalize = true;
    convShort.buffer = makeImpulseBuffer(1.3, 2.4, 0.35);
    revShortIn = actx.createGain();
    revShortIn.gain.value = 0;
    revShortIn.connect(convShort);
    convShort.connect(masterGain);

    const convLong = actx.createConvolver();
    convLong.normalize = true;
    convLong.buffer = makeImpulseBuffer(5.2, 2.0, 0.72);
    revLongIn = actx.createGain();
    revLongIn.gain.value = 0;
    revLongIn.connect(convLong);
    convLong.connect(masterGain);

    // --- 噪声素材 ---
    bufWhite = makeNoiseBuffer(2.5, 'white');
    bufPink = makeNoiseBuffer(4.0, 'pink');
    bufBrown = makeNoiseBuffer(5.0, 'brown');

    buildRain();
    buildWind();
    buildCity();
  }

  /**
   * 雨声：两层粉噪声（高频雨丝 hiss + 低频雨幕 body）分别带通，
   * 强度越大低频层越突出、hiss 中心频率越低（大雨更"闷厚"）。
   */
  function buildRain() {
    rainGain = actx.createGain();
    rainGain.gain.value = 0;
    rainGain.connect(ambientGain);

    rainHissBP = actx.createBiquadFilter();
    rainHissBP.type = 'bandpass';
    rainHissBP.frequency.value = 2600;
    rainHissBP.Q.value = 0.55;
    rainHissGain = actx.createGain();
    rainHissGain.gain.value = 0.85;
    rainHissBP.connect(rainHissGain);
    rainHissGain.connect(rainGain);
    startLoop(bufPink, 1.0, rainHissBP);

    rainBodyBP = actx.createBiquadFilter();
    rainBodyBP.type = 'bandpass';
    rainBodyBP.frequency.value = 560;
    rainBodyBP.Q.value = 0.8;
    rainBodyGain = actx.createGain();
    rainBodyGain.gain.value = 0;
    rainBodyBP.connect(rainBodyGain);
    rainBodyGain.connect(rainGain);
    startLoop(bufPink, 0.47, rainBodyBP);

    // 少量长混响，模拟雨落在街谷里的漫反射
    const send = actx.createGain();
    send.gain.value = 0.12;
    rainGain.connect(send);
    send.connect(revLongIn);
  }

  /**
   * 风声：棕噪声带通 + 极低频 LFO 阵风调制（两个不可通约频率叠加，
   * 使阵风节奏不周期化）。
   */
  function buildWind() {
    windGain = actx.createGain();
    windGain.gain.value = 0;
    windGain.connect(ambientGain);

    windGustGain = actx.createGain();
    windGustGain.gain.value = 0.72;
    windGustGain.connect(windGain);

    windBP = actx.createBiquadFilter();
    windBP.type = 'bandpass';
    windBP.frequency.value = 420;
    windBP.Q.value = 1.15;
    windBP.connect(windGustGain);
    startLoop(bufBrown, 0.9, windBP);

    // 高频"呼啸"层，只在大风时才明显
    const whistle = actx.createBiquadFilter();
    whistle.type = 'bandpass';
    whistle.frequency.value = 1450;
    whistle.Q.value = 3.2;
    const whistleGain = actx.createGain();
    whistleGain.gain.value = 0.18;
    whistle.connect(whistleGain);
    whistleGain.connect(windGustGain);
    startLoop(bufPink, 1.35, whistle);

    addLfo(0.063, 0.26, windGustGain.gain);
    addLfo(0.019, 0.15, windGustGain.gain);
    addLfo(0.047, 170, windBP.frequency);
  }

  /**
   * 城市底噪：极低频棕噪声（远处交通的连续轰鸣）+ 缓慢起伏的中频层，
   * 起伏由两个极低频 LFO 叠加产生"偶发车流经过"的听感。
   */
  function buildCity() {
    cityGain = actx.createGain();
    cityGain.gain.value = 0;
    cityGain.connect(ambientGain);

    const lowLP = actx.createBiquadFilter();
    lowLP.type = 'lowpass';
    lowLP.frequency.value = 190;
    lowLP.Q.value = 0.7;
    const lowGain = actx.createGain();
    lowGain.gain.value = 0.9;
    lowLP.connect(lowGain);
    lowGain.connect(cityGain);
    startLoop(bufBrown, 0.42, lowLP);

    citySwellGain = actx.createGain();
    citySwellGain.gain.value = 0.3;
    citySwellGain.connect(cityGain);

    const swellBP = actx.createBiquadFilter();
    swellBP.type = 'bandpass';
    swellBP.frequency.value = 400;
    swellBP.Q.value = 0.85;
    swellBP.connect(citySwellGain);
    startLoop(bufPink, 0.72, swellBP);

    addLfo(0.037, 0.26, citySwellGain.gain);
    addLfo(0.0083, 0.16, citySwellGain.gain);
    addLfo(0.029, 150, swellBP.frequency);

    const send = actx.createGain();
    send.gain.value = 0.16;
    cityGain.connect(send);
    send.connect(revLongIn);
  }

  /**
   * 给某个 AudioParam 叠加一个正弦 LFO（加性调制，不覆盖其基值）。
   * @param {number} freq LFO 频率（Hz）
   * @param {number} depth 调制深度（与被调参数同单位）
   * @param {AudioParam} param 目标参数
   */
  function addLfo(freq, depth, param) {
    const osc = actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = actx.createGain();
    g.gain.value = depth;
    osc.connect(g);
    g.connect(param);
    osc.start(actx.currentTime + rnd() * 2);
    loopSources.push(osc);
  }

  /* ------------------------------------------------------------------ */
  /* 一次性音声管理                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * 登记一次性音声，到期后由 update() 统一断开释放。
   * @param {AudioNode[]} nodes 参与的节点
   * @param {AudioScheduledSourceNode[]} sources 需要 stop 的源
   * @param {number} until 释放时刻（AudioContext 时间轴，秒）
   */
  function trackVoice(nodes, sources, until) {
    voices.push({ nodes, sources, until });
    while (voices.length > MAX_VOICES) releaseVoice(voices.shift());
  }

  /**
   * 立即断开并释放一个音声。
   * @param {{nodes:AudioNode[], sources:AudioScheduledSourceNode[]}} v 音声记录
   */
  function releaseVoice(v) {
    if (!v) return;
    for (let i = 0; i < v.sources.length; i++) {
      try {
        v.sources[i].stop();
      } catch (err) {
        /* 已停止的源再次 stop 会抛错，忽略 */
      }
    }
    for (let i = 0; i < v.nodes.length; i++) {
      try {
        v.nodes[i].disconnect();
      } catch (err) {
        /* 已断开，忽略 */
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 公开接口                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 用户手势后调用：惰性创建/恢复 AudioContext 并淡入主输出。
   * 在无 WebAudio 的环境（Node/SSR）安全空转且不抛错。
   * @returns {Promise<void>}
   */
  function enable() {
    if (destroyed) return Promise.resolve();
    if (!actx) {
      const Ctor = resolveAudioContextCtor();
      if (!Ctor) return Promise.resolve();
      try {
        actx = new Ctor();
      } catch (err) {
        actx = null;
        return Promise.resolve();
      }
    }
    if (!built) {
      buildGraph();
      built = true;
    }
    if (suspendTimer !== undefined && typeof clearTimeout !== 'undefined') {
      clearTimeout(suspendTimer);
      suspendTimer = undefined;
    }
    bus.enabled = true;
    const now = actx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(EPS_GAIN, masterGain.gain.value), now);
    masterGain.gain.exponentialRampToValueAtTime(DEFAULT_MASTER_VOLUME, now + 0.6);
    const resumed = actx.resume ? actx.resume() : null;
    return resumed && typeof resumed.then === 'function' ? resumed.catch(() => {}) : Promise.resolve();
  }

  /**
   * 关闭输出：淡出主增益并挂起 AudioContext（不销毁，可再次 enable）。
   */
  function disable() {
    bus.enabled = false;
    if (!actx || !built) return;
    const now = actx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(Math.max(EPS_GAIN, masterGain.gain.value), now);
    masterGain.gain.exponentialRampToValueAtTime(EPS_GAIN, now + 0.35);
    if (typeof setTimeout !== 'undefined') {
      if (suspendTimer !== undefined && typeof clearTimeout !== 'undefined') clearTimeout(suspendTimer);
      suspendTimer = setTimeout(() => {
        suspendTimer = undefined;
        if (!bus.enabled && actx && actx.state === 'running' && actx.suspend) {
          const p = actx.suspend();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      }, 450);
    }
  }

  /**
   * 合成并播放雷声。
   *
   * 传播模型：
   * - 延迟 t = d / 343（声速），故远处闪电"先见光后听声"；
   * - 幅度 A = strength / (1 + d/620)，球面扩散的软化形式；
   * - 高频吸收 fc = 9000·e^(−d/2100) Hz（下限 110 Hz），远雷只剩低频滚动；
   * - 拖尾 tail = 0.9 + d/780 秒，并按距离把混响送出从短混响转到长混响，
   *   实现"越远拖尾越长"。
   * 近距离（< 2 km）额外叠加一层高通白噪声爆裂（撕裂感），随距离线性消失。
   *
   * @param {number} distanceMeters 打击点到听者的距离（米）
   * @param {number} strength 强度 0..1
   */
  function thunder(distanceMeters, strength) {
    if (!bus.enabled || !actx || !built) return;
    const dist = clamp(Number.isFinite(distanceMeters) ? distanceMeters : 1200, 30, 25000);
    const str = level01(Number.isFinite(strength) ? strength : 1) || 0.6;

    const t0 = actx.currentTime + dist / SPEED_OF_SOUND;
    const amp = str * clamp(1 / (1 + dist / 620), 0.04, 1);
    const cutoff = clamp(9000 * Math.exp(-dist / 2100), 110, 9000);
    const tail = clamp(0.9 + dist / 780, 0.9, 14);
    const far01 = clamp(dist / 6000, 0, 1);

    // 输出汇合点：干声 + 两路混响送出
    const out = actx.createGain();
    out.gain.value = 1;
    out.connect(sfxGain);
    const sendShort = actx.createGain();
    sendShort.gain.value = 0.3 * (1 - far01);
    out.connect(sendShort);
    sendShort.connect(revShortIn);
    const sendLong = actx.createGain();
    sendLong.gain.value = 0.18 + 0.75 * far01;
    out.connect(sendLong);
    sendLong.connect(revLongIn);

    /** @type {AudioNode[]} */
    const nodes = [out, sendShort, sendLong];
    /** @type {AudioScheduledSourceNode[]} */
    const sources = [];

    // --- 低频轰隆：3 段错开的滚雷颗粒，形成起伏的"隆隆"滚动 ---
    const grainCount = 3;
    for (let i = 0; i < grainCount; i++) {
      const startAt = t0 + tail * (i === 0 ? 0 : 0.18 * i + rnd() * 0.12);
      const grainLen = tail * (i === 0 ? 1 : 0.75 - 0.18 * i) + 0.4;
      const grainAmp = amp * (i === 0 ? 1 : 0.5 / i);
      const atk = 0.014 + Math.min(0.42, dist / 9000) + i * 0.05;

      const src = actx.createBufferSource();
      src.buffer = bufBrown;
      src.loop = true;
      src.playbackRate.value = 0.55 + rnd() * 0.35 - far01 * 0.18;
      src.start(startAt, rnd() * bufBrown.duration);
      src.stop(startAt + grainLen + 0.25);

      const lp = actx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff * (i === 0 ? 1 : 0.65);
      lp.Q.value = 0.7;
      // 拖尾期间截止频率继续下滑，模拟远端高频被持续吸收
      lp.frequency.setValueAtTime(lp.frequency.value, startAt);
      lp.frequency.exponentialRampToValueAtTime(
        Math.max(80, lp.frequency.value * 0.35),
        startAt + grainLen
      );

      const boom = actx.createBiquadFilter();
      boom.type = 'peaking';
      boom.frequency.value = 48 + rnd() * 26;
      boom.Q.value = 1.1;
      boom.gain.value = 9;

      const g = actx.createGain();
      g.gain.setValueAtTime(EPS_GAIN, startAt);
      g.gain.exponentialRampToValueAtTime(Math.max(EPS_GAIN, grainAmp), startAt + atk);
      g.gain.exponentialRampToValueAtTime(EPS_GAIN, startAt + grainLen);

      src.connect(lp);
      lp.connect(boom);
      boom.connect(g);
      g.connect(out);

      nodes.push(lp, boom, g);
      sources.push(src);
    }

    // --- 近处尖锐爆裂：高通白噪声，扫频下滑模拟撕裂 ---
    if (dist < 2000) {
      const crack = amp * (1 - dist / 2000);
      const src = actx.createBufferSource();
      src.buffer = bufWhite;
      src.playbackRate.value = 0.9 + rnd() * 0.3;
      src.start(t0, rnd() * (bufWhite.duration - 0.6));
      src.stop(t0 + 0.6);

      const hp = actx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(clamp(cutoff * 0.35, 300, 2600), t0);
      hp.frequency.exponentialRampToValueAtTime(220, t0 + 0.32);
      hp.Q.value = 0.9;

      const g = actx.createGain();
      g.gain.setValueAtTime(EPS_GAIN, t0);
      g.gain.linearRampToValueAtTime(Math.max(EPS_GAIN, crack * 0.9), t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(EPS_GAIN, t0 + 0.42);

      src.connect(hp);
      hp.connect(g);
      g.connect(out);
      nodes.push(hp, g);
      sources.push(src);
    }

    trackVoice(nodes, sources, t0 + tail + 6.5);
  }

  /**
   * 设置雨声强度目标（在 update 中平滑逼近，不会突变）。
   * @param {number} v 0..1
   */
  function rainLevel(v) {
    state.rain.target = level01(v);
  }

  /**
   * 设置风声强度目标。
   * @param {number} v 0..1
   */
  function windLevel(v) {
    state.wind.target = level01(v);
  }

  /**
   * 设置城市底噪强度目标。
   * @param {number} v 0..1
   */
  function cityAmbience(v) {
    state.city.target = level01(v);
  }

  /**
   * 播放一次船只鸣笛：两声短鸣。
   * 音色 = 两个失谐锯齿（基频 ≈ 118 Hz）+ 一个方波次谐波，经低通与轻微降调，
   * 接近真实汽笛的浑厚低频与收尾滑落。
   */
  function boatHorn() {
    if (!bus.enabled || !actx || !built) return;
    const base = actx.currentTime + 0.05;
    hornBlast(base, 0.85);
    hornBlast(base + 1.15, 0.7);
  }

  /**
   * 单声汽笛。
   * @param {number} at 起始时刻（AudioContext 时间）
   * @param {number} dur 持续秒数
   */
  function hornBlast(at, dur) {
    const out = actx.createGain();
    out.gain.setValueAtTime(EPS_GAIN, at);
    out.gain.exponentialRampToValueAtTime(0.5, at + 0.09);
    out.gain.setValueAtTime(0.5, at + dur);
    out.gain.exponentialRampToValueAtTime(EPS_GAIN, at + dur + 0.45);

    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1050;
    lp.Q.value = 0.8;
    lp.connect(out);
    out.connect(sfxGain);

    const send = actx.createGain();
    send.gain.value = 0.4;
    out.connect(send);
    send.connect(revLongIn);

    /** @type {AudioNode[]} */
    const nodes = [out, lp, send];
    /** @type {AudioScheduledSourceNode[]} */
    const sources = [];

    const partials = [
      { type: 'sawtooth', freq: 117.5, gain: 0.55 },
      { type: 'sawtooth', freq: 119.9, gain: 0.45 },
      { type: 'square', freq: 58.9, gain: 0.35 },
      { type: 'sawtooth', freq: 176.2, gain: 0.16 }
    ];
    for (let i = 0; i < partials.length; i++) {
      const p = partials[i];
      const osc = actx.createOscillator();
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.freq, at);
      // 收尾时基频轻微下滑（多普勒/气压衰减带来的自然滑落）
      osc.frequency.exponentialRampToValueAtTime(p.freq * 0.965, at + dur + 0.45);
      const g = actx.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(lp);
      osc.start(at);
      osc.stop(at + dur + 0.55);
      nodes.push(g);
      sources.push(osc);
    }

    trackVoice(nodes, sources, at + dur + 1.2);
  }

  /**
   * 每帧调用：平滑逼近底噪音量、回收到期的一次性音声。
   * 不分配新对象、不重建节点。
   * @param {number} dt 本帧秒数
   */
  function update(dt) {
    if (!actx || !built) return;
    const step = clamp(Number.isFinite(dt) ? dt : 0.016, 0, 0.25);

    state.rain.value = damp(state.rain.value, state.rain.target, state.rain.lambda, step);
    state.wind.value = damp(state.wind.value, state.wind.target, state.wind.lambda, step);
    state.city.value = damp(state.city.value, state.city.target, state.city.lambda, step);

    const r = state.rain.value;
    if (Math.abs(r - applied.rain) > 1e-4) {
      applied.rain = r;
      rainGain.gain.value = 0.85 * Math.pow(r, 0.75);
      rainBodyGain.gain.value = 0.95 * r * r;
      // 雨越大，hiss 中心频率越低、雨幕层越靠下，听感更厚重
      rainHissBP.frequency.value = 2900 - 1100 * r;
      rainBodyBP.frequency.value = 620 - 140 * r;
    }

    const w = state.wind.value;
    if (Math.abs(w - applied.wind) > 1e-4) {
      applied.wind = w;
      windGain.gain.value = 0.6 * Math.pow(w, 0.9);
      windBP.frequency.value = 340 + 520 * w;
    }

    const c = state.city.value;
    if (Math.abs(c - applied.city) > 1e-4) {
      applied.city = c;
      cityGain.gain.value = 0.55 * c;
    }

    const now = actx.currentTime;
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].until <= now) {
        releaseVoice(voices[i]);
        voices.splice(i, 1);
      }
    }
  }

  /**
   * 释放全部资源并关闭 AudioContext。调用后本总线不再可用。
   */
  function dispose() {
    destroyed = true;
    bus.enabled = false;
    if (suspendTimer !== undefined && typeof clearTimeout !== 'undefined') {
      clearTimeout(suspendTimer);
      suspendTimer = undefined;
    }
    for (let i = 0; i < voices.length; i++) releaseVoice(voices[i]);
    voices.length = 0;
    for (let i = 0; i < loopSources.length; i++) {
      try {
        loopSources[i].stop();
      } catch (err) {
        /* 已停止，忽略 */
      }
      try {
        loopSources[i].disconnect();
      } catch (err) {
        /* 已断开，忽略 */
      }
    }
    loopSources.length = 0;
    bufWhite = null;
    bufPink = null;
    bufBrown = null;
    if (actx) {
      const closing = actx.close ? actx.close() : null;
      if (closing && typeof closing.catch === 'function') closing.catch(() => {});
    }
    actx = null;
    built = false;
    masterGain = null;
    compressor = null;
    sfxGain = null;
    ambientGain = null;
    revShortIn = null;
    revLongIn = null;
    rainGain = null;
    rainHissGain = null;
    rainBodyGain = null;
    rainHissBP = null;
    rainBodyBP = null;
    windGain = null;
    windBP = null;
    windGustGain = null;
    cityGain = null;
    citySwellGain = null;
  }

  return bus;
}
