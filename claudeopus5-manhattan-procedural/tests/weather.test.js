/**
 * @file tests/weather.test.js
 * @description
 * 天气状态机测试（契约 §6.3 / §10）。只测纯逻辑，不涉及 three 与 WebGL。
 *
 * 覆盖点：
 *  1. WEATHER_PRESETS 六键齐全、字段完整、值域合法；WEATHER_LABELS 中文标签；
 *  2. set 后参数**单调**逼近目标，5 s 完成大半、20 s 基本到位；
 *  3. 任意时刻（含随机步长切换途中）所有参数不越界、无 NaN；
 *  4. 雨停切 clear 后 wetness **单调下降**且 60 s 后显著降低（τ≈60 s）；
 *  5. 雪天 snowCover 单调累积（τ≈90 s）、雪后融化缓慢（τ≈150 s）且**融雪期 wetness 上升**；
 *  6. immediate=true 瞬间到位；
 *  7. 阵风与用户风基准；帧率无关性；同种子确定性。
 */

import { describe, it, expect } from 'vitest';
import {
  createWeather,
  WEATHER_PRESETS,
  WEATHER_LABELS,
  WEATHER_NAMES,
  PARAM_RANGES
} from '../src/weather/weather.js';

/** 预设必须具备的全部字段（契约 §6.3 WeatherParams）。 */
const REQUIRED_KEYS = [
  'cloudCover',
  'cloudDarkness',
  'cloudHeight',
  'fogDensity',
  'fogColor',
  'skyTurbidity',
  'sunDim',
  'ambientBoost',
  'rainIntensity',
  'snowIntensity',
  'wetnessTarget',
  'snowCoverTarget',
  'lightningPerMinute',
  'windSpeed',
  'windGust'
];

/**
 * 推进天气系统若干秒。
 * @param {Object} w 天气系统
 * @param {number} seconds 总时长（秒）
 * @param {number} [dt=1/60] 步长
 * @param {Object} [ctx] 帧上下文
 * @param {(w:Object, t:number) => void} [onStep] 每步回调
 * @returns {void}
 */
function advance(w, seconds, dt = 1 / 60, ctx, onStep) {
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i++) {
    w.update(dt, ctx);
    if (onStep) onStep(w, (i + 1) * dt);
  }
}

/**
 * 校验参数对象合法：全部有限、0..1 类字段不越界。
 * @param {Object} p params
 * @returns {void}
 */
function expectParamsValid(p) {
  for (const key of Object.keys(PARAM_RANGES)) {
    const v = p[key];
    expect(Number.isFinite(v), `${key} 应为有限数，实为 ${v}`).toBe(true);
    expect(v).toBeGreaterThanOrEqual(PARAM_RANGES[key][0]);
    expect(v).toBeLessThanOrEqual(PARAM_RANGES[key][1]);
  }
  for (let i = 0; i < 3; i++) {
    expect(Number.isFinite(p.fogColor[i])).toBe(true);
    expect(p.fogColor[i]).toBeGreaterThanOrEqual(0);
    expect(p.fogColor[i]).toBeLessThanOrEqual(1);
  }
  for (const key of ['wetness', 'snowCover', 'wetnessGoal', 'snowCoverGoal']) {
    expect(Number.isFinite(p[key]), `${key} 应为有限数`).toBe(true);
    expect(p[key]).toBeGreaterThanOrEqual(0);
    expect(p[key]).toBeLessThanOrEqual(1);
  }
  expect(Number.isFinite(p.windSpeedActual)).toBe(true);
  expect(p.windSpeedActual).toBeGreaterThanOrEqual(0);
  expect(Number.isFinite(p.windDirActual)).toBe(true);
  expect(p.windDirActual).toBeGreaterThanOrEqual(0);
  expect(p.windDirActual).toBeLessThan(360);
}

describe('WEATHER_PRESETS / WEATHER_LABELS', () => {
  it('六个预设键齐全且字段完整', () => {
    expect(Object.keys(WEATHER_PRESETS).sort()).toEqual(
      ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'].sort()
    );
    expect([...WEATHER_NAMES].sort()).toEqual(Object.keys(WEATHER_PRESETS).sort());

    for (const name of WEATHER_NAMES) {
      const p = WEATHER_PRESETS[name];
      for (const key of REQUIRED_KEYS) {
        expect(p[key], `${name}.${key} 缺失`).toBeDefined();
      }
      expect(Array.isArray(p.fogColor)).toBe(true);
      expect(p.fogColor).toHaveLength(3);
      for (const c of p.fogColor) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
      expectParamsValid({
        ...p,
        wetness: p.wetnessTarget,
        snowCover: p.snowCoverTarget,
        wetnessGoal: p.wetnessTarget,
        snowCoverGoal: p.snowCoverTarget,
        windSpeedActual: p.windSpeed,
        windDirActual: 0
      });
    }
  });

  it('预设数值符合物理直觉（晴通透 / 雾浓 / 雷暴狂暴）', () => {
    const { clear, cloudy, fog, rain, storm, snow } = WEATHER_PRESETS;

    expect(clear.fogDensity).toBeCloseTo(0.00016, 8);
    expect(clear.sunDim).toBe(0);
    expect(clear.cloudCover).toBeLessThan(0.2);

    // 云量递增：晴 < 多云 < 雪 < 雨 < 雷暴
    expect(clear.cloudCover).toBeLessThan(cloudy.cloudCover);
    expect(cloudy.cloudCover).toBeLessThan(snow.cloudCover);
    expect(snow.cloudCover).toBeLessThan(rain.cloudCover);
    expect(rain.cloudCover).toBeLessThan(storm.cloudCover);

    // 雾：最浓的雾密度、灰白雾色（三通道接近且偏亮）
    expect(fog.fogDensity).toBeGreaterThan(rain.fogDensity);
    expect(fog.fogDensity).toBeCloseTo(0.0035, 6);
    expect(Math.max(...fog.fogColor) - Math.min(...fog.fogColor)).toBeLessThan(0.08);
    expect(Math.min(...fog.fogColor)).toBeGreaterThan(0.7);

    // 雨：全湿、无雷
    expect(rain.wetnessTarget).toBe(1);
    expect(rain.rainIntensity).toBeGreaterThan(0.5);
    expect(rain.lightningPerMinute).toBe(0);

    // 雷暴：在雨之上更强更暗更狂，且落雷 ≈14 次/分（契约 §6.3）
    expect(storm.rainIntensity).toBeGreaterThan(rain.rainIntensity);
    expect(storm.cloudDarkness).toBeGreaterThan(rain.cloudDarkness);
    expect(storm.windSpeed).toBeGreaterThan(rain.windSpeed);
    expect(storm.windGust).toBeGreaterThan(rain.windGust);
    expect(storm.lightningPerMinute).toBe(14);

    // 雪：积雪目标满、雪色亮灰、无雨
    expect(snow.snowCoverTarget).toBe(1);
    expect(snow.snowIntensity).toBeGreaterThan(0.5);
    expect(snow.rainIntensity).toBe(0);
    expect(Math.min(...snow.fogColor)).toBeGreaterThan(0.8);
    expect(snow.ambientBoost).toBeGreaterThan(rain.ambientBoost);
  });

  it('WEATHER_LABELS 提供六个中文标签', () => {
    expect(WEATHER_LABELS).toEqual({
      clear: '晴',
      cloudy: '多云',
      fog: '雾',
      rain: '雨',
      storm: '雷暴',
      snow: '雪'
    });
  });

  it('预设对象被冻结，防止其他模块误改', () => {
    expect(Object.isFrozen(WEATHER_PRESETS)).toBe(true);
    expect(Object.isFrozen(WEATHER_PRESETS.storm)).toBe(true);
  });
});

describe('createWeather 基本形状', () => {
  it('返回契约 §6.3 规定的句柄', () => {
    const w = createWeather({ seed: 'test' });
    expect(w.object3D).toBe(null);
    expect(w.current).toBe('clear');
    expect(w.target).toBe('clear');
    expect(w.transition).toBe(1);
    expect(typeof w.set).toBe('function');
    expect(typeof w.update).toBe('function');
    expect(typeof w.dispose).toBe('function');
    expectParamsValid(w.params);
  });

  it('未知天气名被忽略，不抛异常', () => {
    const w = createWeather({ seed: 'test' });
    w.set('typhoon');
    expect(w.target).toBe('clear');
    w.set(null);
    w.set(undefined);
    expect(w.target).toBe('clear');
    advance(w, 1);
    expectParamsValid(w.params);
  });

  it('dt 非法（NaN/负数）时安全空转', () => {
    const w = createWeather({ seed: 'test' });
    w.set('storm');
    const before = w.params.cloudCover;
    w.update(Number.NaN);
    w.update(-1);
    w.update(undefined);
    expect(w.params.cloudCover).toBe(before);
    expectParamsValid(w.params);
  });
});

describe('平滑过渡', () => {
  it('set 后参数单调逼近目标，5s 完成大半、20s 基本到位', () => {
    const w = createWeather({ seed: 'trans' });
    const from = { ...w.params };
    w.set('rain');
    expect(w.transition).toBe(0);

    let prevCloud = w.params.cloudCover;
    let prevFog = w.params.fogDensity;
    advance(w, 5, 1 / 60, undefined, () => {
      // 单调递增逼近（rain 的云量/雾密度都高于 clear）
      expect(w.params.cloudCover).toBeGreaterThanOrEqual(prevCloud - 1e-12);
      expect(w.params.fogDensity).toBeGreaterThanOrEqual(prevFog - 1e-15);
      prevCloud = w.params.cloudCover;
      prevFog = w.params.fogDensity;
      expectParamsValid(w.params);
    });

    const target = WEATHER_PRESETS.rain;
    const gap0 = target.cloudCover - from.cloudCover;
    const gap5 = target.cloudCover - w.params.cloudCover;
    // τ=4.5s ⇒ 5s 后剩余 e^(-5/4.5)=32.9%
    expect(gap5 / gap0).toBeLessThan(0.4);
    expect(gap5 / gap0).toBeGreaterThan(0.25);
    expect(w.transition).toBeGreaterThan(0.6);

    advance(w, 15);
    // 20s ⇒ 剩余 e^(-20/4.5) = 1.13%
    const gap20 = Math.abs(target.cloudCover - w.params.cloudCover);
    expect(gap20 / gap0).toBeLessThan(0.02);
    expect(Math.abs(w.params.sunDim - target.sunDim)).toBeLessThan(0.02 * target.sunDim);
    expect(Math.abs(w.params.skyTurbidity - target.skyTurbidity)).toBeLessThan(0.1);
    expect(w.transition).toBeGreaterThan(0.98);
  });

  it('禁止硬切：切换后的第一帧不会直接等于目标', () => {
    const w = createWeather({ seed: 'nohardcut' });
    w.set('storm');
    w.update(1 / 60);
    expect(w.params.cloudCover).toBeLessThan(WEATHER_PRESETS.storm.cloudCover * 0.5);
    expect(w.params.cloudCover).toBeGreaterThan(WEATHER_PRESETS.clear.cloudCover);
  });

  it('雾色逐通道插值到目标', () => {
    const w = createWeather({ seed: 'fogcolor' });
    w.set('storm');
    advance(w, 10);
    // 过渡途中：三通道都落在 clear 与 storm 之间（逐通道插值，未硬切）
    for (let i = 0; i < 3; i++) {
      const lo = Math.min(WEATHER_PRESETS.clear.fogColor[i], WEATHER_PRESETS.storm.fogColor[i]);
      const hi = Math.max(WEATHER_PRESETS.clear.fogColor[i], WEATHER_PRESETS.storm.fogColor[i]);
      expect(w.params.fogColor[i]).toBeGreaterThan(lo);
      expect(w.params.fogColor[i]).toBeLessThan(hi);
    }
    advance(w, 50);
    for (let i = 0; i < 3; i++) {
      expect(w.params.fogColor[i]).toBeCloseTo(WEATHER_PRESETS.storm.fogColor[i], 4);
    }
  });

  it('immediate=true 瞬间到位', () => {
    const w = createWeather({ seed: 'imm' });
    w.set('storm', true);
    const s = WEATHER_PRESETS.storm;
    expect(w.current).toBe('storm');
    expect(w.transition).toBe(1);
    expect(w.params.cloudCover).toBe(s.cloudCover);
    expect(w.params.cloudDarkness).toBe(s.cloudDarkness);
    expect(w.params.cloudHeight).toBe(s.cloudHeight);
    expect(w.params.fogDensity).toBe(s.fogDensity);
    expect(w.params.skyTurbidity).toBe(s.skyTurbidity);
    expect(w.params.sunDim).toBe(s.sunDim);
    expect(w.params.rainIntensity).toBe(s.rainIntensity);
    expect(w.params.lightningPerMinute).toBe(s.lightningPerMinute);
    expect(w.params.windSpeed).toBe(s.windSpeed);
    expect(w.params.windGust).toBe(s.windGust);
    expect(w.params.fogColor).toEqual([...s.fogColor]);
    expect(w.params.wetness).toBe(s.wetnessTarget);
    expect(w.params.snowCover).toBe(s.snowCoverTarget);

    w.set('snow', true);
    expect(w.params.snowCover).toBe(1);
    expect(w.params.wetness).toBe(WEATHER_PRESETS.snow.wetnessTarget);
    expectParamsValid(w.params);
  });

  it('连续快速切换全部天气时不越界、不出现 NaN', () => {
    const w = createWeather({ seed: 'chaos' });
    // 确定性 LCG（禁止 Math.random）
    let s = 12345;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const ctx = { wind: { dirDeg: 215, speed: 6 } };
    for (let k = 0; k < 60; k++) {
      w.set(WEATHER_NAMES[Math.floor(rand() * WEATHER_NAMES.length)]);
      const steps = 1 + Math.floor(rand() * 40);
      for (let i = 0; i < steps; i++) {
        w.update(0.004 + rand() * 0.09, ctx);
        expectParamsValid(w.params);
        expect(w.transition).toBeGreaterThanOrEqual(0);
        expect(w.transition).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('湿度记忆', () => {
  it('下雨时 wetness 以约 12s 时间常数上升', () => {
    const w = createWeather({ seed: 'wet' });
    w.set('rain');
    advance(w, 12);
    // 目标本身还在爬升，故略低于 1-e^-1=0.632，但应已过半
    expect(w.params.wetness).toBeGreaterThan(0.45);
    expect(w.params.wetness).toBeLessThan(0.75);
    advance(w, 48);
    expect(w.params.wetness).toBeGreaterThan(0.97);
  });

  it('雨停切 clear 后 wetness 单调下降，60s 后显著降低（τ≈60s）', () => {
    const w = createWeather({ seed: 'dry' });
    w.set('rain');
    advance(w, 240);
    expect(w.params.wetness).toBeGreaterThan(0.99);

    w.set('clear');
    let prev = w.params.wetness;
    let maxRise = 0;
    advance(w, 60, 1 / 60, undefined, () => {
      maxRise = Math.max(maxRise, w.params.wetness - prev);
      prev = w.params.wetness;
    });
    // 单调下降（起点处目标尚未跌破当前值，允许 1e-6 级别的抖动）
    expect(maxRise).toBeLessThan(1e-6);
    // e^-1 ≈ 0.368，加上目标衰减的滞后贡献约 0.03
    expect(w.params.wetness).toBeLessThan(0.5);
    expect(w.params.wetness).toBeGreaterThan(0.28);
    // 但绝不会像 4.5s 过渡那样立刻干透
    advance(w, 180);
    expect(w.params.wetness).toBeLessThan(0.06);
  });

  it('wetness 与名义目标 wetnessGoal 不同步（记忆效应）', () => {
    const w = createWeather({ seed: 'memory' });
    w.set('rain');
    advance(w, 240);
    w.set('clear');
    advance(w, 20);
    // 名义目标已经归零，实际湿度仍然很高
    expect(w.params.wetnessGoal).toBeLessThan(0.02);
    expect(w.params.wetness).toBeGreaterThan(0.6);
    // shaderpatch 取用的字段承载生效值
    expect(w.params.wetnessTarget).toBe(w.params.wetness);
    expect(w.params.snowCoverTarget).toBe(w.params.snowCover);
  });
});

describe('积雪记忆', () => {
  it('雪天 snowCover 单调累积（τ≈90s）', () => {
    const w = createWeather({ seed: 'snow' });
    w.set('snow');
    let prev = w.params.snowCover;
    advance(w, 90, 1 / 60, undefined, () => {
      expect(w.params.snowCover).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = w.params.snowCover;
    });
    expect(w.params.snowCover).toBeGreaterThan(0.5);
    expect(w.params.snowCover).toBeLessThan(0.72);
    advance(w, 210);
    expect(w.params.snowCover).toBeGreaterThan(0.9);
  });

  it('雪后转晴：积雪缓慢融化（τ≈150s）且融雪期 wetness 短暂上升', () => {
    const w = createWeather({ seed: 'melt' });
    w.set('snow');
    advance(w, 300);
    const snow0 = w.params.snowCover;
    const wet0 = w.params.wetness;
    expect(snow0).toBeGreaterThan(0.9);

    w.set('clear');
    advance(w, 20);
    // 融雪变湿：湿度不降反升
    expect(w.params.wetness).toBeGreaterThan(wet0 + 0.05);
    // 积雪仍在，远未化完
    expect(w.params.snowCover).toBeGreaterThan(0.8);

    advance(w, 40);
    expect(w.params.snowCover).toBeLessThan(snow0);
    expect(w.params.snowCover).toBeGreaterThan(0.5);

    // 长时间后雪化尽、地面也终于干了
    advance(w, 900);
    expect(w.params.snowCover).toBeLessThan(0.05);
    expect(w.params.wetness).toBeLessThan(0.15);
  });
});

describe('风', () => {
  it('阵风围绕预设基准波动，幅度不超过 windGust', () => {
    const w = createWeather({ seed: 'wind' });
    w.set('storm', true);
    const s = WEATHER_PRESETS.storm;
    let min = Infinity;
    let max = -Infinity;
    let dirMin = Infinity;
    let dirMax = -Infinity;
    advance(w, 300, 1 / 30, undefined, () => {
      min = Math.min(min, w.params.windSpeedActual);
      max = Math.max(max, w.params.windSpeedActual);
      dirMin = Math.min(dirMin, w.params.windDirActual);
      dirMax = Math.max(dirMax, w.params.windDirActual);
    });
    expect(min).toBeGreaterThanOrEqual(s.windSpeed - s.windGust - 1e-6);
    expect(max).toBeLessThanOrEqual(s.windSpeed + s.windGust + 1e-6);
    // 阵风确实在起伏（不是常数）
    expect(max - min).toBeGreaterThan(s.windGust * 0.3);
    // 风向摆动限制在 ±12°
    expect(dirMax - dirMin).toBeGreaterThan(1);
    expect(dirMax - dirMin).toBeLessThanOrEqual(24 + 1e-6);
  });

  it('用户从 UI 设定风速后以用户值为基准再叠阵风', () => {
    const w = createWeather({ seed: 'userwind' });
    const ctx = { wind: { dirDeg: 215, speed: 6 } };
    advance(w, 2, 1 / 60, ctx); // 建立基线（面板默认值，不算用户改动）
    expect(w.params.windSpeed).toBeCloseTo(WEATHER_PRESETS.clear.windSpeed, 1);

    ctx.wind.speed = 20;
    ctx.wind.dirDeg = 90;
    advance(w, 40, 1 / 60, ctx);
    expect(w.params.windSpeed).toBeCloseTo(20, 1);
    const gust = WEATHER_PRESETS.clear.windGust;
    expect(Math.abs(w.params.windSpeedActual - 20)).toBeLessThanOrEqual(gust + 1e-6);
    // 风向以用户值为基准 ±12°
    const delta = ((w.params.windDirActual - 90 + 540) % 360) - 180;
    expect(Math.abs(delta)).toBeLessThanOrEqual(12 + 1e-6);
  });

  it('ctx0.getUserWind 也可作为用户风来源', () => {
    let speed = 6;
    const w = createWeather({ seed: 'getwind', getUserWind: () => ({ dirDeg: 0, speed }) });
    advance(w, 2);
    speed = 25;
    advance(w, 40);
    expect(w.params.windSpeed).toBeCloseTo(25, 1);
  });
});

describe('数值稳健性', () => {
  it('帧率无关：固定目标的参数在 0.01s×600 与 0.5s×12 下完全一致', () => {
    const a = createWeather({ seed: 'fr' });
    const b = createWeather({ seed: 'fr' });
    a.set('storm');
    b.set('storm');
    advance(a, 6, 0.01);
    advance(b, 6, 0.5);
    // damp 的误差按 e^(−λΔt) 相乘，目标恒定时步长拆分不影响结果
    expect(a.params.cloudCover).toBeCloseTo(b.params.cloudCover, 9);
    expect(a.params.fogDensity).toBeCloseTo(b.params.fogDensity, 12);
    expect(a.params.windSpeed).toBeCloseTo(b.params.windSpeed, 9);
    expect(a.transition).toBeCloseTo(b.transition, 9);
  });

  it('帧率无关：追随移动目标的 wetness/snowCover 在常见帧率间差异极小', () => {
    // wetness 追的是同样在演化的 wetnessGoal（移动目标），
    // 步长拆分只能做到 O(Δt) 一致，故用 30fps 与 120fps 对比。
    const a = createWeather({ seed: 'fr2' });
    const b = createWeather({ seed: 'fr2' });
    a.set('snow');
    b.set('snow');
    advance(a, 30, 1 / 30);
    advance(b, 30, 1 / 120);
    expect(Math.abs(a.params.wetness - b.params.wetness)).toBeLessThan(2e-3);
    expect(Math.abs(a.params.snowCover - b.params.snowCover)).toBeLessThan(2e-3);
  });

  it('同种子确定性：相同输入序列得到完全相同的参数', () => {
    const make = () => {
      const w = createWeather({ seed: 'deterministic-1337' });
      w.set('snow');
      advance(w, 30, 1 / 60);
      w.set('storm');
      advance(w, 30, 1 / 60);
      return JSON.stringify(w.params);
    };
    expect(make()).toBe(make());
  });

  it('dispose 后 update/set 安全空转', () => {
    const w = createWeather({ seed: 'disp' });
    w.set('storm');
    advance(w, 5);
    const snapshot = JSON.stringify(w.params);
    w.dispose();
    w.set('snow');
    advance(w, 30);
    expect(JSON.stringify(w.params)).toBe(snapshot);
  });
});
