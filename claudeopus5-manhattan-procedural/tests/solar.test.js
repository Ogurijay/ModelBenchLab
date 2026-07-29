/**
 * @file tests/solar.test.js
 * @description core/solar.js 的单元测试（契约 §3.4 / §10）。
 * 参考真值：纽约 40.7128°N / −74.0060°E / UTC−5（EST，不含夏令时）。
 */

import { describe, it, expect } from 'vitest';
import {
  NYC,
  solarPosition,
  sunDirection,
  sunriseSunset,
  moonPhase,
  moonPosition
} from '../src/core/solar.js';

/** 夏至（约 6 月 21 日） */
const SUMMER_SOLSTICE = 172;
/** 冬至（约 12 月 21 日） */
const WINTER_SOLSTICE = 355;
/** 春分（约 3 月 21 日） */
const VERNAL_EQUINOX = 80;

describe('NYC 常量', () => {
  it('经纬度与时区符合契约', () => {
    expect(NYC.lat).toBeCloseTo(40.7128, 4);
    expect(NYC.lon).toBeCloseTo(-74.006, 4);
    expect(NYC.tzOffsetHours).toBe(-5);
  });
});

describe('solarPosition —— NOAA 太阳位置', () => {
  it('夏至正午高度角在 71~74°（理论值 90−(φ−δ) ≈ 72.7°）', () => {
    const s = solarPosition(SUMMER_SOLSTICE, 12);
    expect(s.elevationDeg).toBeGreaterThan(71);
    expect(s.elevationDeg).toBeLessThan(74);
  });

  it('冬至正午高度角在 24.5~27.5°（理论值 90−(φ+|δ|) ≈ 25.9°）', () => {
    const s = solarPosition(WINTER_SOLSTICE, 12);
    expect(s.elevationDeg).toBeGreaterThan(24.5);
    expect(s.elevationDeg).toBeLessThan(27.5);
  });

  it('正午方位角接近正南（约 180°）', () => {
    for (const day of [SUMMER_SOLSTICE, VERNAL_EQUINOX, WINTER_SOLSTICE]) {
      const s = solarPosition(day, 12);
      expect(Math.abs(s.azimuthDeg - 180)).toBeLessThan(3);
    }
  });

  it('日出前（凌晨 3 点）高度角为负', () => {
    expect(solarPosition(SUMMER_SOLSTICE, 3).elevationDeg).toBeLessThan(0);
    expect(solarPosition(WINTER_SOLSTICE, 3).elevationDeg).toBeLessThan(0);
    expect(solarPosition(VERNAL_EQUINOX, 3).elevationDeg).toBeLessThan(0);
    // 深夜 0 点也必须在地平线下
    expect(solarPosition(SUMMER_SOLSTICE, 0).elevationDeg).toBeLessThan(0);
  });

  it('均时差量级在 ±17 分钟内，且全年振幅足够（非常数近似）', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let d = 1; d <= 365; d++) {
      const eot = solarPosition(d, 12).equationOfTimeMin;
      expect(Number.isFinite(eot)).toBe(true);
      expect(Math.abs(eot)).toBeLessThan(17);
      min = Math.min(min, eot);
      max = Math.max(max, eot);
    }
    // 真实极值约 −14.2 / +16.4 分钟
    expect(min).toBeLessThan(-13);
    expect(max).toBeGreaterThan(15);
  });

  it('赤纬全年落在 ±23.44° 附近，且至日取到极值', () => {
    for (let d = 1; d <= 365; d++) {
      const dec = solarPosition(d, 12).declinationDeg;
      expect(Math.abs(dec)).toBeLessThanOrEqual(23.6);
    }
    expect(solarPosition(SUMMER_SOLSTICE, 12).declinationDeg).toBeGreaterThan(23.2);
    expect(solarPosition(WINTER_SOLSTICE, 12).declinationDeg).toBeLessThan(-23.2);
    expect(Math.abs(solarPosition(VERNAL_EQUINOX, 12).declinationDeg)).toBeLessThan(1);
  });

  it('时角在正午为 0 附近，且每小时推进 15°', () => {
    const noon = solarPosition(SUMMER_SOLSTICE, 12);
    expect(Math.abs(noon.hourAngleDeg)).toBeLessThan(3);
    const h13 = solarPosition(SUMMER_SOLSTICE, 13).hourAngleDeg;
    expect(h13 - noon.hourAngleDeg).toBeCloseTo(15, 1);
  });

  it('天顶角 = 90 − 高度角', () => {
    const s = solarPosition(200, 9.5);
    expect(s.zenithDeg).toBeCloseTo(90 - s.elevationDeg, 10);
  });

  it('方位角在白昼时段单调递增（东→南→西）', () => {
    let prev = -Infinity;
    for (let h = 6; h <= 18; h += 0.5) {
      const az = solarPosition(SUMMER_SOLSTICE, h).azimuthDeg;
      expect(az).toBeGreaterThan(prev);
      prev = az;
    }
    expect(solarPosition(SUMMER_SOLSTICE, 6).azimuthDeg).toBeLessThan(100); // 清晨偏东
    expect(solarPosition(SUMMER_SOLSTICE, 18).azimuthDeg).toBeGreaterThan(260); // 傍晚偏西
  });

  it('结果确定性：同输入必得同输出', () => {
    const a = solarPosition(123, 15.25);
    const b = solarPosition(123, 15.25);
    expect(a).toEqual(b);
  });

  it('支持任意站点：赤道春分正午近乎天顶', () => {
    const s = solarPosition(VERNAL_EQUINOX, 12, 0, 0, 0);
    expect(s.elevationDeg).toBeGreaterThan(88);
  });
});

describe('sunDirection —— 方位角到向量', () => {
  it('方位角 0° 指向正北 −Z，90° 指向正东 +X', () => {
    const north = sunDirection(0, 0);
    expect(north.x).toBeCloseTo(0, 10);
    expect(north.y).toBeCloseTo(0, 10);
    expect(north.z).toBeCloseTo(-1, 10);

    const east = sunDirection(0, 90);
    expect(east.x).toBeCloseTo(1, 10);
    expect(east.z).toBeCloseTo(0, 10);

    const south = sunDirection(0, 180);
    expect(south.z).toBeCloseTo(1, 10);

    const west = sunDirection(0, 270);
    expect(west.x).toBeCloseTo(-1, 10);
  });

  it('y 分量 = sin(高度角)，且始终是单位向量', () => {
    for (let el = -90; el <= 90; el += 7.5) {
      for (let az = 0; az < 360; az += 23) {
        const v = sunDirection(el, az);
        expect(v.y).toBeCloseTo(Math.sin((el * Math.PI) / 180), 10);
        expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 10);
      }
    }
  });

  it('天顶时方向朝上', () => {
    const v = sunDirection(90, 0);
    expect(v.y).toBeCloseTo(1, 10);
  });
});

describe('sunriseSunset —— −0.833° 折射修正', () => {
  it('春分昼长在 11.7~12.3 小时', () => {
    const r = sunriseSunset(VERNAL_EQUINOX, NYC.lat, NYC.lon, NYC.tzOffsetHours);
    expect(r.dayLengthHours).toBeGreaterThan(11.7);
    expect(r.dayLengthHours).toBeLessThan(12.3);
  });

  it('纽约夏至昼长约 15.1h、冬至约 9.2h', () => {
    const summer = sunriseSunset(SUMMER_SOLSTICE);
    const winter = sunriseSunset(WINTER_SOLSTICE);
    expect(summer.dayLengthHours).toBeGreaterThan(14.8);
    expect(summer.dayLengthHours).toBeLessThan(15.4);
    expect(winter.dayLengthHours).toBeGreaterThan(8.9);
    expect(winter.dayLengthHours).toBeLessThan(9.6);
    expect(summer.dayLengthHours).toBeGreaterThan(winter.dayLengthHours);
  });

  it('日出/日落时刻与实测相符（EST，夏至 ≈ 4:25 / 19:30）', () => {
    const summer = sunriseSunset(SUMMER_SOLSTICE);
    expect(summer.sunriseHours).toBeGreaterThan(4.2);
    expect(summer.sunriseHours).toBeLessThan(4.7);
    expect(summer.sunsetHours).toBeGreaterThan(19.3);
    expect(summer.sunsetHours).toBeLessThan(19.8);
    // 昼长与日出日落自洽
    expect(summer.sunsetHours - summer.sunriseHours).toBeCloseTo(summer.dayLengthHours, 1);
  });

  it('日出时刻的太阳高度角接近 −0.833°', () => {
    for (const day of [VERNAL_EQUINOX, SUMMER_SOLSTICE, WINTER_SOLSTICE]) {
      const { sunriseHours, sunsetHours } = sunriseSunset(day);
      expect(solarPosition(day, sunriseHours).elevationDeg).toBeCloseTo(-0.833, 0);
      expect(solarPosition(day, sunsetHours).elevationDeg).toBeCloseTo(-0.833, 0);
    }
  });

  it('极区退化：北极圈内夏至极昼、冬至极夜', () => {
    const polarDay = sunriseSunset(SUMMER_SOLSTICE, 78, 15, 1);
    expect(polarDay.dayLengthHours).toBe(24);
    const polarNight = sunriseSunset(WINTER_SOLSTICE, 78, 15, 1);
    expect(polarNight.dayLengthHours).toBe(0);
    expect(Number.isFinite(polarNight.sunriseHours)).toBe(true);
  });

  it('全年日出日落时刻均落在 [0,24)', () => {
    for (let d = 1; d <= 365; d++) {
      const r = sunriseSunset(d);
      expect(r.sunriseHours).toBeGreaterThanOrEqual(0);
      expect(r.sunriseHours).toBeLessThan(24);
      expect(r.sunsetHours).toBeGreaterThanOrEqual(0);
      expect(r.sunsetHours).toBeLessThan(24);
    }
  });
});

describe('moonPhase —— 朔望月 29.530588 天', () => {
  const SYNODIC = 29.530588;

  it('phase01 / illumination / ageDays 值域合法', () => {
    for (let d = 1; d <= 365; d += 1) {
      const p = moonPhase(d, 12);
      expect(p.phase01).toBeGreaterThanOrEqual(0);
      expect(p.phase01).toBeLessThan(1);
      expect(p.illumination).toBeGreaterThanOrEqual(0);
      expect(p.illumination).toBeLessThanOrEqual(1);
      expect(p.ageDays).toBeGreaterThanOrEqual(0);
      expect(p.ageDays).toBeLessThan(SYNODIC);
    }
  });

  it('新月 illumination ≈ 0，满月 ≈ 1', () => {
    let newMoonDay = -1;
    for (let d = 1; d <= 60; d += 0.02) {
      if (moonPhase(d, 0).ageDays < 0.02) {
        newMoonDay = d;
        break;
      }
    }
    expect(newMoonDay).toBeGreaterThan(0);
    expect(moonPhase(newMoonDay, 0).illumination).toBeLessThan(0.01);
    const full = moonPhase(newMoonDay + SYNODIC / 2, 0);
    expect(full.illumination).toBeGreaterThan(0.99);
    expect(full.phase01).toBeCloseTo(0.5, 3);
    // 上弦 / 下弦 半照（newMoonDay 由步进扫描得到，本身带 ≤0.02 天残差）
    expect(moonPhase(newMoonDay + SYNODIC / 4, 0).illumination).toBeCloseTo(0.5, 2);
    expect(moonPhase(newMoonDay + (SYNODIC * 3) / 4, 0).illumination).toBeCloseTo(0.5, 2);
  });

  it('相位以 29.530588 天为周期', () => {
    const a = moonPhase(100, 6);
    const b = moonPhase(100 + SYNODIC, 6);
    expect(b.phase01).toBeCloseTo(a.phase01, 9);
    expect(b.illumination).toBeCloseTo(a.illumination, 9);
  });

  it('月龄随时间单调推进（同一朔望月内）', () => {
    const a = moonPhase(100, 0).ageDays;
    const b = moonPhase(100, 12).ageDays;
    expect(b - a).toBeCloseTo(0.5, 6);
  });
});

describe('moonPosition —— 简化天球模型', () => {
  it('返回有限的高度角/方位角且值域合法', () => {
    for (let d = 1; d <= 365; d += 7) {
      for (let h = 0; h < 24; h += 3) {
        const p = moonPosition(d, h);
        expect(Number.isFinite(p.elevationDeg)).toBe(true);
        expect(p.elevationDeg).toBeGreaterThanOrEqual(-90);
        expect(p.elevationDeg).toBeLessThanOrEqual(90);
        expect(p.azimuthDeg).toBeGreaterThanOrEqual(0);
        expect(p.azimuthDeg).toBeLessThan(360);
      }
    }
  });

  it('满月时月亮与太阳大致相对（高度角符号相反）', () => {
    // 找到一个接近满月的时刻
    let fullDay = -1;
    for (let d = 1; d <= 60; d += 0.01) {
      if (Math.abs(moonPhase(d, 12).phase01 - 0.5) < 0.002) {
        fullDay = d;
        break;
      }
    }
    expect(fullDay).toBeGreaterThan(0);
    const sun = solarPosition(fullDay, 12);
    const moon = moonPosition(fullDay, 12);
    // 满月正午：太阳在天上，月亮应在地平线下
    expect(sun.elevationDeg).toBeGreaterThan(0);
    expect(moon.elevationDeg).toBeLessThan(0);
  });

  it('新月时月亮与太阳位置接近（同升同落）', () => {
    let newDay = -1;
    for (let d = 1; d <= 60; d += 0.01) {
      if (moonPhase(d, 12).phase01 < 0.002) {
        newDay = d;
        break;
      }
    }
    expect(newDay).toBeGreaterThan(0);
    const sun = solarPosition(newDay, 12);
    const moon = moonPosition(newDay, 12);
    expect(Math.abs(moon.elevationDeg - sun.elevationDeg)).toBeLessThan(5);
    expect(Math.abs(moon.azimuthDeg - sun.azimuthDeg)).toBeLessThan(5);
  });

  it('确定性：同输入同输出', () => {
    expect(moonPosition(210, 21.5)).toEqual(moonPosition(210, 21.5));
  });
});
