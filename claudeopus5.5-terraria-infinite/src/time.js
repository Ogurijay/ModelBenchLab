// 世界历法:与现实时钟无关的“独立时间观”。
// · 世界时间以“世界刻”计,一天 24000 刻(00:00 → 24:00);每个世界刻推进量 = 世界日长换算的倍率 × 加速倍率。
// · 一年四季,每季若干天;昼长随年相连续变化(夏长冬短),日出日落时刻每天都不同。
// · 月相 8 天一轮;满月之夜有概率血月。天气按季节概率切换,并可被气压计提前预报。
// · 作物、树苗、熔炉、积雪/结冰全部以世界时间计,离开的区块再加载时按流逝的世界时间补算。
import { DAY_TICKS, SEASONS, SEASON_NAMES, MOON_NAMES } from './const.js';
import { mulberry32, clamp, smoothstep, lerp } from './rng.js';

export const WEATHER_NAMES = { clear: '晴', rain: '雨', thunder: '雷暴' };

export class Clock {
  constructor(o = {}) {
    this.dayMinutes = o.dayMinutes || 20;     // 现实中一整天的分钟数
    this.seasonDays = o.seasonDays || 5;      // 每季天数
    this.tick = o.tick ?? 8.5 * 1000;          // 从第 1 天 08:30 开始
    this.scale = o.scale || 1;                 // 指令设置的时间流速
    this.weather = o.weather || 'clear';
    this.weatherLeft = o.weatherLeft ?? 9000;
    this.nextWeather = o.nextWeather || null;
    this.blood = !!o.blood;
    this.rngState = o.rngState || 12345;
    this.lastDay = this.day;
    this.lastSeason = this.season;
    this.lastPhase = this.phase();
    this.playSeconds = o.playSeconds || 0;
    if (!this.nextWeather) this.nextWeather = this.rollWeather();
  }
  save() {
    const { dayMinutes, seasonDays, tick, scale, weather, weatherLeft, nextWeather, blood, rngState, playSeconds } = this;
    return { dayMinutes, seasonDays, tick, scale, weather, weatherLeft, nextWeather, blood, rngState, playSeconds };
  }
  rand() { this.rngState = (this.rngState * 1103515245 + 12345) >>> 0; return (this.rngState >>> 8) / 16777216; }

  get rate() { return 20 / this.dayMinutes; }            // 每个世界刻对应的时间推进
  get day() { return Math.floor(this.tick / DAY_TICKS); }  // 0 起
  get tod() { return this.tick - this.day * DAY_TICKS; }   // 0..24000
  get hours() { return this.tod / 1000; }
  get season() { return Math.floor(this.day / this.seasonDays) % 4; }
  get dayOfSeason() { return this.day % this.seasonDays; }
  get year() { return Math.floor(this.day / (this.seasonDays * 4)); }
  get moon() { return this.day % 8; }
  get yearPhase() { return ((this.tick / DAY_TICKS) / (this.seasonDays * 4)) % 1; }

  // 昼长:夏至(夏季中段)最长约 15.6 小时,冬至最短约 8.4 小时
  daylight(phase = this.yearPhase) { return 12 + 3.6 * Math.sin(2 * Math.PI * (phase - 0.125)); }
  sunTimes() { const d = this.daylight(); return [12 - d / 2, 12 + d / 2]; }
  // 太阳高度 0..1(白天) / 夜晚为 0
  sunFactor(h = this.hours) {
    const [rise, set] = this.sunTimes();
    return smoothstep(rise - 0.6, rise + 0.9, h) * (1 - smoothstep(set - 0.9, set + 0.6, h));
  }
  isNight() { return this.sunFactor() < 0.2; }
  moonBright() { return 0.5 + 0.5 * Math.cos(2 * Math.PI * this.moon / 8); }
  phase() { const f = this.sunFactor(); return f > 0.5 ? 'day' : 'night'; }

  // 天光颜色(乘到光照上的天空光源)
  skyLight() {
    const f = this.sunFactor(), h = this.hours;
    const [rise, set] = this.sunTimes();
    const nightLv = 0.1 + 0.14 * this.moonBright();
    let night = [nightLv * 0.6, nightLv * 0.72, nightLv * 1.15];
    if (this.blood) night = [nightLv * 1.5 + 0.06, nightLv * 0.35, nightLv * 0.35];
    // 晨昏暖色
    const warm = Math.max(1 - Math.abs(h - rise) / 1.4, 1 - Math.abs(h - set) / 1.4, 0);
    const day = [1, 1 - 0.18 * warm, 1 - 0.38 * warm];
    let c = [lerp(night[0], day[0], f), lerp(night[1], day[1], f), lerp(night[2], day[2], f)];
    const dim = this.weather === 'thunder' ? 0.55 : this.weather === 'rain' ? 0.72 : 1;
    if (dim < 1) { const k = lerp(0.6 + 0.4 * dim, dim, f); c = c.map(v => v * k); }
    return c;
  }

  // 季节温度偏移(群系基础温度 + 季节)
  seasonTemp() { return [0.0, 0.28, -0.08, -0.62][this.season]; }
  growthMult() { return [1.0, 1.35, 0.8, 0.12][this.season]; }

  rollWeather() {
    const s = this.season, r = this.rand();
    const pRain = [0.4, 0.28, 0.42, 0.45][s], pThunder = [0.1, 0.18, 0.08, 0.04][s];
    const kind = r < pThunder ? 'thunder' : r < pThunder + pRain ? 'rain' : 'clear';
    const len = kind === 'clear' ? 6000 + this.rand() * 18000 : 3000 + this.rand() * 9000;
    return { kind, len: Math.round(len) };
  }

  // 推进 dt 个“世界刻当量”,返回事件列表
  advance(dt) {
    const events = [];
    this.tick += dt;
    this.weatherLeft -= dt;
    if (this.weatherLeft <= 0) {
      const prev = this.weather;
      this.weather = this.nextWeather.kind;
      this.weatherLeft = this.nextWeather.len;
      this.nextWeather = this.rollWeather();
      if (prev !== this.weather) events.push({ type: 'weather', from: prev, to: this.weather });
    }
    const d = this.day;
    if (d !== this.lastDay) {
      this.lastDay = d;
      events.push({ type: 'day', day: d });
      const s = this.season;
      if (s !== this.lastSeason) { this.lastSeason = s; events.push({ type: 'season', season: s }); }
    }
    const ph = this.phase();
    if (ph !== this.lastPhase) {
      this.lastPhase = ph;
      if (ph === 'night') {
        this.blood = this.moon === 0 && d >= 2 && this.rand() < 0.4;
        events.push({ type: 'dusk', blood: this.blood });
      } else {
        if (this.blood) events.push({ type: 'bloodEnd' });
        this.blood = false;
        events.push({ type: 'dawn' });
      }
    }
    return events;
  }

  // 跳到下一个清晨(睡觉)
  ticksUntilMorning() {
    const [rise] = this.sunTimes();
    let target = this.day * DAY_TICKS + rise * 1000 + 300;
    if (target <= this.tick) target += DAY_TICKS;
    return target - this.tick;
  }

  fmtTime(prec = 'minute') {
    const h = Math.floor(this.hours), m = Math.floor((this.hours - h) * 60);
    if (prec === 'hour') return String(h).padStart(2, '0') + ':00';
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  fmtDate() {
    return `第 ${this.year + 1} 年 · ${SEASON_NAMES[this.season]}第 ${this.dayOfSeason + 1} 天`;
  }
  moonName() { return MOON_NAMES[this.moon]; }
  seasonChar() { return SEASONS[this.season]; }
}
