/**
 * @file src/ui/panel.js
 * @description 右侧控制面板（契约 §7.2）。
 *
 * 本模块**只负责把 index.html 中已存在的 DOM 接上回调**，不创建任何面板结构、
 * 不修改 index.html / styles.css。所有 DOM 查询均容错：元素缺失时静默跳过而不抛错。
 *
 * 依赖方向：仅依赖 `core/rng.js`（用于"随机种子"生成，全局禁用 Math.random）。
 *
 * 契约备注：`handlers.onRandomSeed()` 在契约中无参数；本实现额外把生成的种子字符串
 * 作为第一个实参传出（多余实参对无参回调无害），方便集成方按需使用。
 */

import { hashString } from '../core/rng.js';

/** 启动后多少毫秒隐藏底部操作提示（契约 §7.2：8 秒） */
const HINT_HIDE_DELAY_MS = 8000;

/** "随机种子"按钮的调用计数，保证同一毫秒内连点也能得到不同种子 */
let randomSeedCounter = 0;

/**
 * 安全取元素（document 不存在或元素缺失时返回 null）。
 * @param {string} id 元素 id（不含 #）
 * @returns {HTMLElement|null}
 */
function byId(id) {
  if (typeof document === 'undefined' || !document.getElementById) return null;
  return document.getElementById(id);
}

/**
 * 安全取元素列表。
 * @param {string} selector CSS 选择器
 * @returns {HTMLElement[]}
 */
function queryAll(selector) {
  if (typeof document === 'undefined' || !document.querySelectorAll) return [];
  return Array.prototype.slice.call(document.querySelectorAll(selector));
}

/**
 * 把分钟数格式化为 `HH:MM`（自动对 1440 取模，负数亦安全）。
 * @param {number} minutes 0..1440 的当地时间分钟数
 * @returns {string}
 */
function formatClock(minutes) {
  const raw = Number.isFinite(minutes) ? Math.floor(minutes) : 0;
  const m = ((raw % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
}

/**
 * 时间流速文本：0 显示"暂停"，否则显示如 `120×`。
 * @param {number} scale 倍速
 * @returns {string}
 */
function formatTimeScale(scale) {
  const v = Number.isFinite(scale) ? scale : 0;
  return v <= 0 ? '暂停' : `${Math.round(v)}×`;
}

/**
 * 生成一个随机种子字符串（8 位十进制）。
 * 不使用 Math.random：以 `Date.now()` + `performance.now()` + 自增计数拼串，
 * 交给 core/rng.js 的 FNV-1a 风格 `hashString` 混淆后取模。
 * @returns {string}
 */
function makeRandomSeed() {
  randomSeedCounter += 1;
  const wall = Date.now();
  const hi = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? Math.floor(performance.now() * 1000)
    : 0;
  const h = hashString(`seed|${wall}|${hi}|${randomSeedCounter}`) >>> 0;
  return String(10000000 + (h % 90000000));
}

/**
 * 创建控制面板句柄。
 * @param {Object} [handlers] 回调集合（全部可选，缺失时安全空转）
 * @param {(name:string)=>void} [handlers.onWeather] 天气切换
 * @param {(minutes:number)=>void} [handlers.onTime] 时刻（分钟 0..1439）
 * @param {(x:number)=>void} [handlers.onTimeScale] 时间流速倍数
 * @param {(dayOfYear:number)=>void} [handlers.onSeason] 季节（年积日）
 * @param {(seed:string)=>void} [handlers.onSeed] 提交种子（重建城市）
 * @param {(seed?:string)=>void} [handlers.onRandomSeed] 点击"随机种子"
 * @param {(mode:string)=>void} [handlers.onCameraMode] 相机模式
 * @param {(name:string)=>void} [handlers.onCameraPreset] 相机预设点位
 * @param {(w:{dirDeg:number, speed:number})=>void} [handlers.onWind] 风向/风速
 * @param {(on:boolean)=>void} [handlers.onAudioToggle] 音效开关
 * @param {(on:boolean)=>void} [handlers.onHudToggle] HUD 开关
 * @param {(level:string)=>void} [handlers.onQuality] 画质档位
 * @returns {{
 *   setWeather:(name:string)=>void,
 *   setTime:(minutes:number)=>void,
 *   setSeed:(s:string|number)=>void,
 *   setCameraMode:(m:string)=>void,
 *   setLoading:(visible:boolean, text?:string, progress01?:number)=>void,
 *   dispose:()=>void
 * }}
 */
export function createPanel(handlers = {}) {
  const h = handlers || {};

  /** 已注册监听器，dispose 时逐个移除 */
  const bound = [];
  /** 提示自动隐藏定时器 */
  let hintTimer = 0;
  let disposed = false;

  /**
   * 注册事件监听（元素为空时跳过）。
   * @param {EventTarget|null} el
   * @param {string} type
   * @param {(ev:Event)=>void} fn
   */
  const on = (el, type, fn) => {
    if (!el || typeof el.addEventListener !== 'function') return;
    el.addEventListener(type, fn);
    bound.push({ el, type, fn });
  };

  /**
   * 调用回调（不存在则空转）。
   * @param {Function|undefined} fn
   * @param {...*} args
   */
  const call = (fn, ...args) => {
    if (typeof fn === 'function') fn(...args);
  };

  /* ------------------------------ DOM 句柄 ------------------------------ */
  const panelEl = byId('panel');
  const panelToggle = byId('panel-toggle');
  const weatherBtns = queryAll('#weather-buttons [data-weather]');
  const windDir = /** @type {HTMLInputElement|null} */ (byId('wind-dir'));
  const windSpeed = /** @type {HTMLInputElement|null} */ (byId('wind-speed'));
  const windDirValue = byId('wind-dir-value');
  const windSpeedValue = byId('wind-speed-value');
  const timeSlider = /** @type {HTMLInputElement|null} */ (byId('time-slider'));
  const timeValue = byId('time-value');
  const timescaleSlider = /** @type {HTMLInputElement|null} */ (byId('timescale-slider'));
  const timescaleValue = byId('timescale-value');
  const seasonSel = /** @type {HTMLSelectElement|null} */ (byId('season'));
  const seedInput = /** @type {HTMLInputElement|null} */ (byId('seed-input'));
  const seedApply = byId('seed-apply');
  const seedRandom = byId('seed-random');
  const cameraMode = /** @type {HTMLSelectElement|null} */ (byId('camera-mode'));
  const cameraPresets = queryAll('[data-camera-preset]');
  const toggleAudio = /** @type {HTMLInputElement|null} */ (byId('toggle-audio'));
  const toggleHud = /** @type {HTMLInputElement|null} */ (byId('toggle-hud'));
  const qualitySel = /** @type {HTMLSelectElement|null} */ (byId('quality'));
  const loadingEl = byId('loading');
  const loadingFill = byId('loading-fill');
  const loadingText = byId('loading-text');
  const hintEl = byId('hint');

  /* ------------------------------ 天气按钮 ------------------------------ */
  /**
   * 高亮当前天气按钮。
   * @param {string} name 天气名
   */
  const highlightWeather = (name) => {
    for (const btn of weatherBtns) {
      const isOn = btn.dataset && btn.dataset.weather === name;
      btn.classList.toggle('is-active', !!isOn);
    }
  };

  for (const btn of weatherBtns) {
    on(btn, 'click', () => {
      const name = btn.dataset ? btn.dataset.weather : '';
      if (!name) return;
      highlightWeather(name);
      call(h.onWeather, name);
    });
  }

  /* -------------------------------- 风 --------------------------------- */
  /** 读取当前风参数 @returns {{dirDeg:number, speed:number}} */
  const readWind = () => ({
    dirDeg: windDir ? Number(windDir.value) || 0 : 0,
    speed: windSpeed ? Number(windSpeed.value) || 0 : 0
  });

  /** 刷新风向/风速数值文本 */
  const refreshWindLabels = () => {
    const w = readWind();
    if (windDirValue) windDirValue.textContent = `${Math.round(w.dirDeg)}°`;
    if (windSpeedValue) windSpeedValue.textContent = `${w.speed.toFixed(1)} m/s`;
  };

  const onWindInput = () => {
    refreshWindLabels();
    call(h.onWind, readWind());
  };
  // 滑块用 input 事件：拖动过程中即实时回调（不等 change）
  on(windDir, 'input', onWindInput);
  on(windSpeed, 'input', onWindInput);

  /* ------------------------------- 时间 --------------------------------- */
  /** 上一次写入的整数分钟，避免主循环每帧重复写 DOM */
  let lastMinuteWritten = -1;

  on(timeSlider, 'input', () => {
    const minutes = timeSlider ? Number(timeSlider.value) || 0 : 0;
    lastMinuteWritten = Math.floor(minutes);
    if (timeValue) timeValue.textContent = formatClock(minutes);
    call(h.onTime, minutes);
  });

  on(timescaleSlider, 'input', () => {
    const x = timescaleSlider ? Number(timescaleSlider.value) || 0 : 0;
    if (timescaleValue) timescaleValue.textContent = formatTimeScale(x);
    call(h.onTimeScale, x);
  });

  on(seasonSel, 'change', () => {
    const day = seasonSel ? Number(seasonSel.value) || 172 : 172;
    call(h.onSeason, day);
  });

  /* ------------------------------- 城市种子 ------------------------------ */
  /** 提交种子输入框内容（等价于点击"重建城市"） */
  const submitSeed = () => {
    const raw = seedInput ? String(seedInput.value).trim() : '';
    const seed = raw.length ? raw : makeRandomSeed();
    if (seedInput) seedInput.value = seed;
    call(h.onSeed, seed);
  };

  on(seedApply, 'click', submitSeed);

  on(seedRandom, 'click', () => {
    const seed = makeRandomSeed();
    if (seedInput) seedInput.value = seed;
    call(h.onRandomSeed, seed);
  });

  // 回车提交等价于点击 #seed-apply
  on(seedInput, 'keydown', (ev) => {
    const key = /** @type {KeyboardEvent} */ (ev).key;
    if (key !== 'Enter') return;
    ev.preventDefault();
    if (seedApply && typeof seedApply.click === 'function') seedApply.click();
    else submitSeed();
  });

  /* -------------------------------- 相机 -------------------------------- */
  on(cameraMode, 'change', () => {
    const mode = cameraMode ? cameraMode.value : 'orbit';
    call(h.onCameraMode, mode);
  });

  for (const btn of cameraPresets) {
    on(btn, 'click', () => {
      const name = btn.dataset ? btn.dataset.cameraPreset : '';
      if (name) call(h.onCameraPreset, name);
    });
  }

  /* -------------------------------- 显示 -------------------------------- */
  on(toggleAudio, 'change', () => {
    call(h.onAudioToggle, toggleAudio ? !!toggleAudio.checked : false);
  });

  on(toggleHud, 'change', () => {
    call(h.onHudToggle, toggleHud ? !!toggleHud.checked : false);
  });

  on(qualitySel, 'change', () => {
    call(h.onQuality, qualitySel ? qualitySel.value : 'high');
  });

  /* ------------------------------ 面板折叠 ------------------------------ */
  on(panelToggle, 'click', () => {
    if (!panelEl) return;
    const collapsed = panelEl.classList.toggle('collapsed');
    panelToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });

  /* --------------------------- 启动提示自动淡出 --------------------------- */
  if (hintEl && typeof setTimeout === 'function') {
    hintTimer = setTimeout(() => {
      hintTimer = 0;
      hintEl.classList.add('hidden');
    }, HINT_HIDE_DELAY_MS);
  }

  // 初始化数值文本，使显示与 index.html 中的初值严格一致（不触发任何回调）
  refreshWindLabels();
  if (timeSlider && timeValue) {
    lastMinuteWritten = Math.floor(Number(timeSlider.value) || 0);
    timeValue.textContent = formatClock(lastMinuteWritten);
  }
  if (timescaleSlider && timescaleValue) {
    timescaleValue.textContent = formatTimeScale(Number(timescaleSlider.value) || 0);
  }

  /* ------------------------------ 对外句柄 ------------------------------ */
  return {
    /**
     * 外部同步天气高亮（不会回调 onWeather）。
     * @param {string} name
     */
    setWeather(name) {
      if (disposed) return;
      highlightWeather(name);
    },

    /**
     * 外部同步时刻显示（主循环每帧调用，故按整数分钟去重后才写 DOM）。
     * @param {number} minutes 0..1440
     */
    setTime(minutes) {
      if (disposed) return;
      const raw = Number.isFinite(minutes) ? Math.floor(minutes) : 0;
      const m = ((raw % 1440) + 1440) % 1440;
      if (m === lastMinuteWritten) return;
      lastMinuteWritten = m;
      if (timeSlider) timeSlider.value = String(m);
      if (timeValue) timeValue.textContent = formatClock(m);
    },

    /**
     * 外部同步种子输入框。
     * @param {string|number} s
     */
    setSeed(s) {
      if (disposed || !seedInput) return;
      const text = s === undefined || s === null ? '' : String(s);
      if (seedInput.value !== text) seedInput.value = text;
    },

    /**
     * 外部同步相机模式下拉框。
     * @param {string} m 'orbit'|'tour'|'street'
     */
    setCameraMode(m) {
      if (disposed || !cameraMode || !m) return;
      if (cameraMode.value !== m) cameraMode.value = m;
    },

    /**
     * 控制加载遮罩。
     * @param {boolean} visible 是否显示遮罩
     * @param {string} [text] 进度文案（写入 #loading-text）
     * @param {number} [progress01] 进度 0..1（写入 #loading-fill 宽度）
     */
    setLoading(visible, text, progress01) {
      if (disposed) return;
      if (loadingEl) loadingEl.classList.toggle('hidden', !visible);
      if (loadingText && typeof text === 'string') loadingText.textContent = text;
      if (loadingFill && Number.isFinite(progress01)) {
        const p = Math.max(0, Math.min(1, progress01));
        loadingFill.style.width = `${(p * 100).toFixed(1)}%`;
      }
    },

    /** 移除所有事件监听与定时器 */
    dispose() {
      if (disposed) return;
      disposed = true;
      if (hintTimer) {
        clearTimeout(hintTimer);
        hintTimer = 0;
      }
      for (const { el, type, fn } of bound) {
        if (el && typeof el.removeEventListener === 'function') el.removeEventListener(type, fn);
      }
      bound.length = 0;
    }
  };
}
