/**
 * @file src/weather/weather.js
 * @module weather/weather
 * @description
 * 天气状态机（契约 §6.3）——**全场景天气参数的唯一权威**。
 * main.js 每帧先 `weather.update(dt, ctx)`，再把 `weather.params` 挂到 `ctx.weather.params`，
 * 之后 `render/shaderpatch.js#updateEnvUniforms` 把其中的湿润/积雪/雾色/风写进共享 uniforms。
 *
 * 本模块**不含任何可视对象**（`object3D === null`），只做数值演化：
 *
 *  1. **六种预设**（clear/cloudy/fog/rain/storm/snow），数值按物理直觉给定
 *     （雾密度按 THREE.FogExp2 的平方指数衰减 `1 − e^(−(ρ·d)²)` 标定，能见度 V ≈ 1.978/ρ，
 *      详见 `WEATHER_PRESETS` 的注释）。
 *  2. **平滑过渡**：所有标量与雾色分量用 `core/mathx.js` 的 `damp`（一阶指数逼近
 *     `x ← x + (t − x)(1 − e^(−λΔt))`，λ = 1/4.5 s⁻¹）逼近目标，**禁止硬切**；
 *     `immediate = true` 时才瞬间到位。`transition = 1 − e^(−t/τ)` 恰是该阻尼的收敛比例。
 *  3. **湿度/积雪记忆**（一阶蓄水池模型，时间常数各异且**升降不对称**）：
 *     - 湿润：降水时 τ = 12 s 迅速上升，雨停后 τ = 60 s 缓慢蒸发变干；
 *     - 积雪：雪天 τ = 90 s 累积，非雪天 τ = 150 s 融化；
 *     - **融雪变湿**：融化速率 dS/dt = S/τ_melt，按累积时间常数折算为湿润度贡献
 *       `0.6·S`（= 90/150·S），故雪后转晴时地面会先"湿一阵"再慢慢干。
 *  4. **风**：预设基准风速上叠加低频 fBm 阵风（幅度 = `windGust`），风向缓慢摆动 ±12°。
 *
 * ### 相对契约 §6.3 的字段补充（本模块新增，已在此写明）
 *
 * | 字段 | 含义 |
 * |---|---|
 * | `params.wetness`   | **当前实际生效**的地面湿润度 0..1（记忆模型输出） |
 * | `params.snowCover` | **当前实际生效**的积雪覆盖度 0..1（记忆模型输出） |
 * | `params.wetnessGoal` / `params.snowCoverGoal` | 记忆模型正在追逐的**名义目标**（预设值经 4.5 s 阻尼后的结果） |
 * | `params.windSpeedActual` / `params.windDirActual` | 叠加阵风/摆动后的**瞬时**风速(m/s)与风向(度) |
 *
 * **契约缺陷说明**：契约把 `wetnessTarget` / `snowCoverTarget` 同时用作"预设目标"与
 * "params 中的已插值当前值"两种语义；而既有的 `render/shaderpatch.js#updateEnvUniforms`
 * 明确把 `params.wetnessTarget → uWetness`、`params.snowCoverTarget → uSnowCover`
 * 并注释为"weather 已插值好的当前值"。为了让 §6.3 要求的记忆模型真正作用到渲染，
 * 本模块在 **`params` 中令 `wetnessTarget === wetness`、`snowCoverTarget === snowCover`**
 * （即承载生效值），而把名义目标另置于 `wetnessGoal` / `snowCoverGoal`；
 * **`WEATHER_PRESETS` 中的 `wetnessTarget` / `snowCoverTarget` 仍是契约原义的"预设目标"**。
 * 未修改任何他人文件。
 *
 * 依赖：仅 `core/mathx.js` 与 `core/noise.js`（不 import three，可在 node 下直接测试）。
 */

import { clamp, damp, mod } from '../core/mathx.js';
import { makeNoise2D, fbm2D } from '../core/noise.js';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 天气切换的过渡时间常数（秒）。λ = 1/τ 用于 damp。 @type {number} */
const TRANSITION_TAU = 4.5;

/** 过渡阻尼速率（1/秒）。 @type {number} */
const TRANSITION_LAMBDA = 1 / TRANSITION_TAU;

/** 湿润度**上升**时间常数（秒）：降水润湿路面很快。 @type {number} */
const WETNESS_RISE_TAU = 12;

/** 湿润度**下降**时间常数（秒）：蒸发变干很慢（契约 §6.3 要求 ≈60 s）。 @type {number} */
const WETNESS_DRY_TAU = 60;

/**
 * 积雪**累积**时间常数（秒），遵循契约 §6.3。
 * @type {number}
 */
const SNOW_ACCUM_TAU = 90;

/** 积雪**融化**时间常数（秒），遵循契约 §6.3。 @type {number} */
const SNOW_MELT_TAU = 150;

/**
 * 融雪产生的湿润度增益：融化速率 dS/dt = S/τ_melt，
 * 按累积时间常数折算 ⇒ 增益 = τ_accum/τ_melt = 90/150 = 0.6。
 * @type {number}
 */
const MELT_WETNESS_GAIN = SNOW_ACCUM_TAU / SNOW_MELT_TAU;

/** 融雪湿润度贡献上限（不会比真正下雨还湿）。 @type {number} */
const MELT_WETNESS_MAX = 0.9;

/** 阵风噪声的时间频率（1/秒）：约 16 s 一个主周期的低频起伏。 @type {number} */
const GUST_TIME_FREQ = 0.062;

/** 风向摆动的时间频率（1/秒）：约 28 s 一个主周期。 @type {number} */
const SWING_TIME_FREQ = 0.036;

/** 风向摆动幅度（度）。 @type {number} */
const WIND_SWING_DEG = 12;

/**
 * 默认风矢量指向角（度）。与 main.js 的换算一致：
 * `vector = (sin(dir), 0, −cos(dir)) · speed`，即 0° 指向北(−Z)、90° 指向东(+X)。
 * 215° ≈ 指向西南，对应纽约常见的东北来风。
 * @type {number}
 */
const DEFAULT_WIND_DIR_DEG = 215;

/** 单帧允许推进的最大秒数（防止页面切回时的巨大 dt 把模型推飞）。 @type {number} */
const MAX_STEP = 5;

/* ------------------------------------------------------------------ *
 * 预设
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} WeatherParams 契约 §6.3
 * @property {number} cloudCover        云量 0..1
 * @property {number} cloudDarkness     云底压暗 0..1
 * @property {number} cloudHeight       云底高度（米）
 * @property {number} fogDensity        指数雾密度（1/米）
 * @property {number[]} fogColor        雾色 [r,g,b]，0..1 线性
 * @property {number} skyTurbidity      大气浑浊度 1..12
 * @property {number} sunDim            直射光衰减 0..1
 * @property {number} ambientBoost      环境光补偿 0..1
 * @property {number} rainIntensity     雨强 0..1
 * @property {number} snowIntensity     雪强 0..1
 * @property {number} wetnessTarget     湿润度（预设中=目标；params 中=生效值，见文件头）
 * @property {number} snowCoverTarget   积雪覆盖（同上）
 * @property {number} lightningPerMinute 每分钟落雷次数
 * @property {number} windSpeed         基准风速（m/s）
 * @property {number} windGust          阵风幅度（m/s）
 */

/**
 * 六种天气预设（契约 §6.3）。**冻结**以防被其他模块误改。
 *
 * 数值取值依据：
 * - `fogDensity` 供 THREE.FogExp2 使用，其衰减为 `1 − exp(−(ρ·d)²)`（**平方**指数，
 *   不是 Beer–Lambert 的 `exp(−ρ·d)`）。按 2% 对比阈解 (ρ·V)² = 3.912 得 **V ≈ 1.978/ρ**：
 *   晴 0.00016 → V ≈ 12 km；多云 0.00028 → V ≈ 7 km；雨 0.00055 → V ≈ 3.6 km；
 *   雪 0.00078 → V ≈ 2.5 km；雷暴 0.00072 → V ≈ 2.7 km；浓雾 0.0035 → V ≈ 0.6 km。
 *   （早期版本按 Beer–Lambert 取值，导致浓雾实际能见度仅 ~0.5 km，整座城市不可见。）
 * - `windSpeed` 按蒲福风级：晴 4.2 m/s（3 级轻风）、雨 8 m/s（5 级清劲风）、
 *   雷暴 15 m/s + 9 m/s 阵风（≈8 级大风）。
 * - `lightningPerMinute` 14 次/分为强雷暴单体的典型闪电率。
 *
 * @type {Readonly<Record<'clear'|'cloudy'|'fog'|'rain'|'storm'|'snow', Readonly<WeatherParams>>>}
 */
export const WEATHER_PRESETS = Object.freeze({
  /** 晴：通透蓝天，少量点缀积云 */
  clear: Object.freeze({
    cloudCover: 0.12,
    cloudDarkness: 0.06,
    cloudHeight: 1750,
    fogDensity: 0.00016,
    fogColor: Object.freeze([0.62, 0.72, 0.86]),
    skyTurbidity: 2.2,
    sunDim: 0,
    ambientBoost: 0,
    rainIntensity: 0,
    snowIntensity: 0,
    wetnessTarget: 0,
    snowCoverTarget: 0,
    lightningPerMinute: 0,
    windSpeed: 4.2,
    windGust: 1.6
  }),

  /** 多云：层积云铺开，阳光被削弱但仍有方向感 */
  cloudy: Object.freeze({
    cloudCover: 0.62,
    cloudDarkness: 0.22,
    cloudHeight: 1400,
    fogDensity: 0.00028,
    fogColor: Object.freeze([0.66, 0.7, 0.77]),
    skyTurbidity: 4.2,
    sunDim: 0.3,
    ambientBoost: 0.18,
    rainIntensity: 0,
    snowIntensity: 0,
    wetnessTarget: 0.08,
    snowCoverTarget: 0,
    lightningPerMinute: 0,
    windSpeed: 6,
    windGust: 2.6
  }),

  /** 雾：低层平流雾，天地一色的灰白，风极小 */
  fog: Object.freeze({
    cloudCover: 0.32,
    cloudDarkness: 0.18,
    cloudHeight: 1400,
    fogDensity: 0.0035,
    fogColor: Object.freeze([0.8, 0.815, 0.83]),
    skyTurbidity: 7.5,
    sunDim: 0.55,
    ambientBoost: 0.42,
    rainIntensity: 0,
    snowIntensity: 0,
    wetnessTarget: 0.28,
    snowCoverTarget: 0,
    lightningPerMinute: 0,
    windSpeed: 1.8,
    windGust: 0.8
  }),

  /** 雨：雨层云满天，路面全湿 */
  rain: Object.freeze({
    cloudCover: 0.92,
    cloudDarkness: 0.55,
    cloudHeight: 1050,
    fogDensity: 0.00055,
    fogColor: Object.freeze([0.5, 0.54, 0.6]),
    skyTurbidity: 6.5,
    sunDim: 0.72,
    ambientBoost: 0.3,
    rainIntensity: 0.72,
    snowIntensity: 0,
    wetnessTarget: 1,
    snowCoverTarget: 0,
    lightningPerMinute: 0,
    windSpeed: 8,
    windGust: 3.5
  }),

  /** 雷暴：积雨云压城，狂风暴雨 + 密集落雷 */
  storm: Object.freeze({
    cloudCover: 0.98,
    cloudDarkness: 0.85,
    cloudHeight: 950,
    fogDensity: 0.00072,
    fogColor: Object.freeze([0.3, 0.32, 0.38]),
    skyTurbidity: 8.5,
    sunDim: 0.86,
    ambientBoost: 0.22,
    rainIntensity: 0.95,
    snowIntensity: 0,
    wetnessTarget: 1,
    snowCoverTarget: 0,
    lightningPerMinute: 14,
    windSpeed: 15,
    windGust: 9
  }),

  /** 雪：亮灰天幕，雪粒反照率高故环境光反而抬升 */
  snow: Object.freeze({
    cloudCover: 0.85,
    cloudDarkness: 0.32,
    cloudHeight: 1150,
    fogDensity: 0.00078,
    fogColor: Object.freeze([0.86, 0.88, 0.92]),
    skyTurbidity: 5.5,
    sunDim: 0.6,
    ambientBoost: 0.5,
    rainIntensity: 0,
    snowIntensity: 0.7,
    wetnessTarget: 0.3,
    snowCoverTarget: 1,
    lightningPerMinute: 0,
    windSpeed: 6.5,
    windGust: 4
  })
});

/**
 * 天气名 → 中文短标签（HUD / 面板用）。
 * @type {Readonly<Record<string, string>>}
 */
export const WEATHER_LABELS = Object.freeze({
  clear: '晴',
  cloudy: '多云',
  fog: '雾',
  rain: '雨',
  storm: '雷暴',
  snow: '雪'
});

/**
 * 预设名顺序（与面板按钮顺序一致）。
 * @type {ReadonlyArray<string>}
 */
export const WEATHER_NAMES = Object.freeze(['clear', 'cloudy', 'fog', 'rain', 'storm', 'snow']);

/**
 * 每个标量参数的合法值域，用于**每帧夹紧**，保证任何时刻都不越界（也是 NaN 的兜底闸门）。
 * @type {Readonly<Record<string, [number, number]>>}
 */
export const PARAM_RANGES = Object.freeze({
  cloudCover: Object.freeze([0, 1]),
  cloudDarkness: Object.freeze([0, 1]),
  cloudHeight: Object.freeze([60, 4000]),
  fogDensity: Object.freeze([0, 0.02]),
  skyTurbidity: Object.freeze([1, 12]),
  sunDim: Object.freeze([0, 1]),
  ambientBoost: Object.freeze([0, 1]),
  rainIntensity: Object.freeze([0, 1]),
  snowIntensity: Object.freeze([0, 1]),
  wetnessTarget: Object.freeze([0, 1]),
  snowCoverTarget: Object.freeze([0, 1]),
  lightningPerMinute: Object.freeze([0, 120]),
  windSpeed: Object.freeze([0, 60]),
  windGust: Object.freeze([0, 40])
});

/**
 * 走通用阻尼的标量键（`windSpeed` 因需支持用户覆盖而单独处理；
 * `wetnessTarget`/`snowCoverTarget` 由记忆模型产出，也单独处理）。
 * @type {ReadonlyArray<string>}
 */
const DAMPED_KEYS = Object.freeze([
  'cloudCover',
  'cloudDarkness',
  'cloudHeight',
  'fogDensity',
  'skyTurbidity',
  'sunDim',
  'ambientBoost',
  'rainIntensity',
  'snowIntensity',
  'lightningPerMinute',
  'windGust'
]);

/* ------------------------------------------------------------------ *
 * 内部工具
 * ------------------------------------------------------------------ */

/**
 * 按值域夹紧并过滤非有限值。
 * @param {number} v 输入
 * @param {string} key 参数名（用于取值域）
 * @param {number} fallback v 非有限时的回退值
 * @returns {number} 合法值
 */
function clampParam(v, key, fallback) {
  const range = PARAM_RANGES[key];
  const raw = Number.isFinite(v) ? v : fallback;
  if (!range) return Number.isFinite(raw) ? raw : 0;
  return clamp(raw, range[0], range[1]);
}

/**
 * 由预设生成一份可变的实时参数对象（含本模块新增的实际值字段）。
 * @param {WeatherParams} preset 预设
 * @param {number} windDirDeg 初始风向（度）
 * @returns {WeatherParams & {wetness:number, snowCover:number, wetnessGoal:number, snowCoverGoal:number, windSpeedActual:number, windDirActual:number}}
 */
function makeLiveParams(preset, windDirDeg) {
  return {
    cloudCover: preset.cloudCover,
    cloudDarkness: preset.cloudDarkness,
    cloudHeight: preset.cloudHeight,
    fogDensity: preset.fogDensity,
    fogColor: [preset.fogColor[0], preset.fogColor[1], preset.fogColor[2]],
    skyTurbidity: preset.skyTurbidity,
    sunDim: preset.sunDim,
    ambientBoost: preset.ambientBoost,
    rainIntensity: preset.rainIntensity,
    snowIntensity: preset.snowIntensity,
    // 记忆模型：实际值 + 名义目标（见文件头字段说明）
    wetness: preset.wetnessTarget,
    snowCover: preset.snowCoverTarget,
    wetnessGoal: preset.wetnessTarget,
    snowCoverGoal: preset.snowCoverTarget,
    wetnessTarget: preset.wetnessTarget,
    snowCoverTarget: preset.snowCoverTarget,
    lightningPerMinute: preset.lightningPerMinute,
    windSpeed: preset.windSpeed,
    windGust: preset.windGust,
    windSpeedActual: preset.windSpeed,
    windDirActual: mod(windDirDeg, 360)
  };
}

/**
 * 从帧上下文（或 ctx0.getUserWind()）读取"用户设定风"。
 * main.js 每帧在调用 `weather.update` **之前**把 `ctx.wind` 复位成面板上的用户值，
 * 因此这里读到的就是纯净的用户基准。
 *
 * @param {Object|null} ctx FrameContext
 * @param {(() => {dirDeg?:number, speed?:number})|null} getUserWind 构建期注入的取风回调
 * @returns {{dirDeg:number|null, speed:number|null}|null} 读不到时返回 null
 */
function readUserWind(ctx, getUserWind) {
  let src = null;
  if (getUserWind) {
    try {
      src = getUserWind();
    } catch (err) {
      void err;
      src = null;
    }
  }
  if (!src && ctx && ctx.wind) src = ctx.wind;
  if (!src) return null;
  const speed = Number.isFinite(src.speed) ? src.speed : null;
  const dirDeg = Number.isFinite(src.dirDeg) ? src.dirDeg : null;
  if (speed === null && dirDeg === null) return null;
  return { dirDeg, speed };
}

/* ------------------------------------------------------------------ *
 * 工厂
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} WeatherSystem
 * @property {null} object3D 无可视对象
 * @property {string} current 当前生效天气名（`set` 后立即更新，契约 §2 的 `ctx.weather.current`）
 * @property {string} target 目标天气名（与 `current` 同步）
 * @property {string} from 本次过渡的起点天气名
 * @property {number} transition 过渡进度 0..1（= 1 − e^(−t/4.5)）
 * @property {WeatherParams} params 已插值的当前参数
 * @property {(name:string, immediate?:boolean) => void} set 切换天气
 * @property {(dt:number, ctx?:Object) => void} update 推进状态机
 * @property {() => void} dispose 释放（本模块无 GPU 资源，仅置位）
 */

/**
 * 创建天气状态机（契约 §6.3）。
 *
 * @param {{rng?:Object, seed?:string|number, weather?:string, wind?:{dirDeg?:number,speed?:number},
 *          getUserWind?:() => {dirDeg?:number, speed?:number}}} [ctx0] 构建期上下文（契约 §5）
 * @returns {WeatherSystem} 天气系统句柄
 */
export function createWeather(ctx0) {
  const opts = ctx0 || {};

  // 阵风噪声种子：优先由根 RNG 派生子流（保证同种子同阵风），否则退回 seed 字符串
  const windRng = opts.rng && typeof opts.rng.fork === 'function' ? opts.rng.fork('weather') : null;
  const noiseSeed =
    windRng && Number.isFinite(windRng.seed)
      ? windRng.seed
      : `${opts.seed === undefined || opts.seed === null ? 'manhattan' : opts.seed}|weather-wind`;
  const gustNoise = makeNoise2D(noiseSeed);

  const getUserWind = typeof opts.getUserWind === 'function' ? opts.getUserWind : null;

  const initialName = WEATHER_PRESETS[opts.weather] ? opts.weather : 'clear';

  // 用户风基准：初值取 ctx0.wind（若有），否则默认西南向 215°
  let baseDirDeg =
    opts.wind && Number.isFinite(opts.wind.dirDeg) ? opts.wind.dirDeg : DEFAULT_WIND_DIR_DEG;
  /** 上一次观测到的用户风速；null 表示尚未观测 */
  let observedUserSpeed = opts.wind && Number.isFinite(opts.wind.speed) ? opts.wind.speed : null;
  /**
   * 用户是否显式改过风速。
   * main.js 每帧都会把面板默认值写进 `ctx.wind.speed`，无法直接区分"默认值"与"用户设定"，
   * 故用**变化检测**：首帧记录基线，之后一旦数值变化即认为用户接管，从此以用户值为基准。
   */
  let userSpeedOverride = false;

  const params = makeLiveParams(WEATHER_PRESETS[initialName], baseDirDeg);

  /** 记忆模型的实际状态（与 params.wetness / params.snowCover 同步） */
  let wetness = params.wetness;
  let snowCover = params.snowCover;

  /** 自启动累计秒数（阵风噪声的时间轴） */
  let timeSec = 0;
  /** 自上次 set 起的秒数（过渡进度） */
  let sinceSet = TRANSITION_TAU * 20;
  let disposed = false;

  /** @type {WeatherSystem} */
  const system = {
    object3D: null,
    current: initialName,
    target: initialName,
    from: initialName,
    transition: 1,
    params,

    /**
     * 切换天气。默认 4.5 s 平滑过渡；`immediate` 时所有参数（含湿度/积雪记忆）瞬间到位。
     * 未知名字将被忽略（保持当前天气），不抛异常、不打日志。
     *
     * @param {string} name 'clear'|'cloudy'|'fog'|'rain'|'storm'|'snow'
     * @param {boolean} [immediate=false] 是否瞬间到位
     * @returns {void}
     */
    set(name, immediate = false) {
      if (disposed) return;
      const preset = WEATHER_PRESETS[name];
      if (!preset) return;
      if (name === system.target && !immediate) return;

      system.from = system.target;
      system.target = name;
      system.current = name;

      if (immediate) {
        for (const key of DAMPED_KEYS) params[key] = preset[key];
        params.fogColor[0] = preset.fogColor[0];
        params.fogColor[1] = preset.fogColor[1];
        params.fogColor[2] = preset.fogColor[2];
        params.windSpeed = userSpeedOverride && observedUserSpeed !== null
          ? observedUserSpeed
          : preset.windSpeed;
        params.wetnessGoal = preset.wetnessTarget;
        params.snowCoverGoal = preset.snowCoverTarget;
        wetness = preset.wetnessTarget;
        snowCover = preset.snowCoverTarget;
        params.wetness = wetness;
        params.snowCover = snowCover;
        params.wetnessTarget = wetness;
        params.snowCoverTarget = snowCover;
        params.windSpeedActual = params.windSpeed;
        params.windDirActual = mod(baseDirDeg, 360);
        system.from = name;
        sinceSet = TRANSITION_TAU * 20;
        system.transition = 1;
      } else {
        sinceSet = 0;
        system.transition = 0;
      }
    },

    /**
     * 推进一帧。
     *
     * @param {number} dt 本帧秒数
     * @param {Object} [ctx] FrameContext（读取 `ctx.wind` 作为用户风基准）
     * @returns {void}
     */
    update(dt, ctx) {
      if (disposed) return;
      const step = Number.isFinite(dt) ? clamp(dt, 0, MAX_STEP) : 0;
      const preset = WEATHER_PRESETS[system.target] || WEATHER_PRESETS.clear;

      timeSec += step;
      sinceSet += step;

      // —— 过渡进度：与 damp 的收敛比例完全一致 ——
      const progress = 1 - Math.exp(-sinceSet / TRANSITION_TAU);
      system.transition = progress > 0.999 ? 1 : clamp(progress, 0, 1);

      // —— 用户风基准（变化检测，见上方注释）——
      const user = readUserWind(ctx, getUserWind);
      if (user) {
        if (user.speed !== null) {
          if (observedUserSpeed === null) {
            observedUserSpeed = user.speed;
          } else if (Math.abs(user.speed - observedUserSpeed) > 1e-4) {
            observedUserSpeed = user.speed;
            userSpeedOverride = true;
          }
        }
        if (user.dirDeg !== null) baseDirDeg = user.dirDeg;
      }

      // —— 标量参数平滑逼近 ——
      for (const key of DAMPED_KEYS) {
        params[key] = clampParam(
          damp(params[key], preset[key], TRANSITION_LAMBDA, step),
          key,
          preset[key]
        );
      }

      // 基准风速：用户接管时以用户值为目标，否则用预设
      const speedTarget =
        userSpeedOverride && observedUserSpeed !== null ? observedUserSpeed : preset.windSpeed;
      params.windSpeed = clampParam(
        damp(params.windSpeed, speedTarget, TRANSITION_LAMBDA, step),
        'windSpeed',
        speedTarget
      );

      // —— 雾色逐通道插值 ——
      for (let i = 0; i < 3; i++) {
        const c = damp(params.fogColor[i], preset.fogColor[i], TRANSITION_LAMBDA, step);
        params.fogColor[i] = clamp(Number.isFinite(c) ? c : preset.fogColor[i], 0, 1);
      }

      // —— 名义目标（预设值经同一阻尼）——
      params.wetnessGoal = clamp(
        damp(params.wetnessGoal, preset.wetnessTarget, TRANSITION_LAMBDA, step),
        0,
        1
      );
      params.snowCoverGoal = clamp(
        damp(params.snowCoverGoal, preset.snowCoverTarget, TRANSITION_LAMBDA, step),
        0,
        1
      );

      // —— 积雪记忆：累积快、融化慢 ——
      const snowRising = params.snowCoverGoal > snowCover;
      const snowLambda = 1 / (snowRising ? SNOW_ACCUM_TAU : SNOW_MELT_TAU);
      const nextSnow = damp(snowCover, params.snowCoverGoal, snowLambda, step);
      snowCover = clamp(Number.isFinite(nextSnow) ? nextSnow : params.snowCoverGoal, 0, 1);

      // —— 融雪变湿：融化中的雪按 dS/dt·Δτ 折算为额外湿润度 ——
      const melting = snowCover - params.snowCoverGoal > 1e-4;
      const meltWetness = melting
        ? clamp(snowCover * MELT_WETNESS_GAIN, 0, MELT_WETNESS_MAX)
        : 0;

      // —— 湿润记忆：润湿快、变干慢 ——
      const wetnessGoalEff = Math.max(params.wetnessGoal, meltWetness);
      const wetLambda = 1 / (wetnessGoalEff > wetness ? WETNESS_RISE_TAU : WETNESS_DRY_TAU);
      const nextWet = damp(wetness, wetnessGoalEff, wetLambda, step);
      wetness = clamp(Number.isFinite(nextWet) ? nextWet : wetnessGoalEff, 0, 1);

      params.wetness = wetness;
      params.snowCover = snowCover;
      // 供 shaderpatch 的 updateEnvUniforms 取用（见文件头"契约缺陷说明"）
      params.wetnessTarget = wetness;
      params.snowCoverTarget = snowCover;

      // —— 风：基准 + 低频 fBm 阵风；风向缓慢摆动 ±12° ——
      const gust = fbm2D(gustNoise, timeSec * GUST_TIME_FREQ, 11.7, {
        octaves: 3,
        gain: 0.55,
        lacunarity: 2.1
      });
      params.windSpeedActual = clamp(params.windSpeed + gust * params.windGust, 0, 70);

      const swing = fbm2D(gustNoise, 37.4, timeSec * SWING_TIME_FREQ, {
        octaves: 2,
        gain: 0.5
      });
      params.windDirActual = mod(baseDirDeg + swing * WIND_SWING_DEG, 360);
    },

    /**
     * 释放。本模块不持有 geometry/material/texture，只切断更新并复位状态。
     * @returns {void}
     */
    dispose() {
      disposed = true;
      system.transition = 1;
    }
  };

  return system;
}
