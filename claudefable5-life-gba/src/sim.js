// sim.js — 模拟核心:六项需求衰减、心情、时钟日历、工作绩效、账单停电、存档
export const NEEDS = [
  { key: 'hunger', label: '饱食', icon: 'hunger', color: '#e8a050' },
  { key: 'energy', label: '精力', icon: 'energy', color: '#f8d820' },
  { key: 'hygiene', label: '卫生', icon: 'hygiene', color: '#58b8f0' },
  { key: 'bladder', label: '膀胱', icon: 'bladder', color: '#98d8c8' },
  { key: 'fun', label: '娱乐', icon: 'fun', color: '#f8c828' },
  { key: 'social', label: '社交', icon: 'social', color: '#f06078' },
];

// 每游戏分钟自然衰减
const DECAY = { hunger: 0.09, energy: 0.062, hygiene: 0.048, bladder: 0.115, fun: 0.075, social: 0.052 };
// 睡觉时的衰减倍率
const SLEEP_MUL = { hunger: 0.35, energy: 0, hygiene: 0.3, bladder: 0.45, fun: 0.1, social: 0.1 };

export const JOB_TITLES = ['送报员', '便利店店员', '写字楼职员', '部门主管', '公司老板'];
export const JOB_PAY = [90, 130, 180, 240, 320];
export const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

const SAVE_KEY = 'cf5-life-gba-v1';

export class Sim {
  constructor() { this.state = null; }

  newGame(charIdx, name) {
    this.state = {
      ver: 1,
      charIdx, name,
      day: 1, weekday: 1, clock: 7 * 60,
      money: 500,
      needs: { hunger: 78, energy: 92, hygiene: 85, bladder: 70, fun: 68, social: 62 },
      job: { level: 1, perf: 0 },
      wentToday: false,
      billsDue: 0, billAgeMin: 0, power: true,
      friendship: 0, visits: 0,
      owned: {},
      stats: { earned: 0, promotions: 0, accidents: 0 },
      muted: false,
      flags: {}, // 边沿触发防重复
    };
    return this.state;
  }

  // ---------- 心情 ----------
  mood() {
    const n = this.state.needs;
    let sum = 0, pen = 0;
    for (const { key } of NEEDS) {
      sum += n[key];
      if (n[key] < 25) pen += 7;
    }
    return Math.max(0, Math.min(100, Math.round(sum / NEEDS.length - pen)));
  }
  moodBand() {
    const m = this.mood();
    return m >= 62 ? 'green' : m >= 35 ? 'yellow' : 'red';
  }

  clockText() {
    const c = Math.floor(this.state.clock);
    const h = Math.floor(c / 60), m = c % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // ---------- 主推进 ----------
  // dtMin 游戏分钟;mode: normal | action | sleep;返回事件数组
  tick(dtMin, mode = 'normal') {
    const S = this.state;
    const ev = [];
    const prev = S.clock;
    S.clock += dtMin;

    // 跨日
    if (S.clock >= 1440) {
      S.clock -= 1440;
      S.day += 1;
      S.weekday = (S.weekday % 7) + 1;
      S.wentToday = false;
      S.flags.missed = false;
      S.flags.workRemind = false;
      S.flags.billToday = false;
      S.flags.visitorToday = false;
      S.flags.sleepy = false;
    }

    // 需求衰减
    const mul = mode === 'sleep' ? SLEEP_MUL : null;
    for (const { key } of NEEDS) {
      const rate = DECAY[key] * (mul ? mul[key] : 1);
      S.needs[key] = Math.max(0, S.needs[key] - rate * dtMin);
    }

    // 账单陈化 → 停电
    if (S.billsDue > 0) {
      S.billAgeMin += dtMin;
      if (S.billAgeMin > 48 * 60 && S.power) {
        S.power = false;
        ev.push({ type: 'powerCut' });
      }
    }

    // 时刻事件(检测跨越)
    const crossed = (mark) => (prev < mark && S.clock >= mark) || (prev > S.clock && S.clock >= mark); // 含跨日回绕后的补触发
    if (S.weekday === 1 && !S.flags.billToday && crossed(8 * 60)) {
      S.flags.billToday = true;
      S.billsDue += 60 + S.job.level * 15;
      if (S.billAgeMin === 0) S.billAgeMin = 1;
      ev.push({ type: 'billArrive', amount: S.billsDue });
    }
    if (S.weekday <= 5 && !S.wentToday && !S.flags.workRemind && crossed(8 * 60 + 30)) {
      S.flags.workRemind = true;
      ev.push({ type: 'workRemind' });
    }
    if (S.weekday <= 5 && !S.wentToday && !S.flags.missed && crossed(9 * 60 + 31)) {
      S.flags.missed = true;
      S.job.perf -= 1;
      const demoted = this._checkDemote();
      ev.push({ type: 'missedWork', demoted });
    }
    if (!S.flags.visitorToday && crossed(16 * 60)) {
      S.flags.visitorToday = true;
      ev.push({ type: 'visitorTime' });
    }
    if (crossed(20 * 60)) ev.push({ type: 'visitorLeave' });
    if (!S.flags.sleepy && mode !== 'sleep' && crossed(23 * 60)) {
      S.flags.sleepy = true;
      ev.push({ type: 'sleepy' });
    }
    if (Math.floor(prev / 60) !== Math.floor(S.clock / 60)) ev.push({ type: 'hourly' });

    // 需求后果(边沿触发)
    const n = S.needs;
    if (n.bladder <= 0 && !S.flags.accident) {
      S.flags.accident = true;
      n.bladder = 45; n.hygiene = Math.max(0, n.hygiene - 25); n.fun = Math.max(0, n.fun - 15);
      S.stats.accidents += 1;
      ev.push({ type: 'accident' });
    }
    if (n.bladder > 20) S.flags.accident = false;

    if (n.energy <= 0 && mode !== 'sleep' && !S.flags.collapse) {
      S.flags.collapse = true;
      ev.push({ type: 'collapse' });
    }
    if (n.energy > 20) S.flags.collapse = false;

    for (const [key, evName] of [['hunger', 'hungry'], ['fun', 'bored'], ['social', 'lonely'], ['hygiene', 'smelly']]) {
      if (n[key] <= 18 && !S.flags[evName]) { S.flags[evName] = true; ev.push({ type: 'lowNeed', need: key }); }
      if (n[key] > 35) S.flags[evName] = false;
    }
    return ev;
  }

  // 交互期间按速率恢复
  applyRates(rates, dtMin) {
    for (const [k, v] of Object.entries(rates)) {
      this.state.needs[k] = Math.max(0, Math.min(100, this.state.needs[k] + v * dtMin));
    }
  }

  // ---------- 工作(解析式结算) ----------
  goToWork() {
    const S = this.state;
    const m0 = this.mood();
    const base = JOB_PAY[S.job.level - 1];
    const pay = Math.round(base * (0.6 + 0.6 * (m0 / 100)));
    S.money += pay;
    S.stats.earned += pay;
    S.wentToday = true;

    let perfDelta = 0;
    if (m0 >= 65) perfDelta = 1;
    else if (m0 < 40) perfDelta = -1;
    S.job.perf += perfDelta;

    let promoted = false, demoted = false;
    if (S.job.perf >= 3 && S.job.level < 5) {
      S.job.level += 1; S.job.perf = 0; promoted = true;
      S.stats.promotions += 1;
    }
    demoted = this._checkDemote();

    const n = S.needs;
    n.hunger = Math.max(5, n.hunger - 38);
    n.energy = Math.max(5, n.energy - 30);
    n.hygiene = Math.max(5, n.hygiene - 18);
    n.bladder = Math.max(8, n.bladder - 32);
    n.fun = Math.max(0, n.fun - 20);
    n.social = Math.min(100, n.social + 16);

    S.clock = 17 * 60;
    S.flags.sleepy = false;
    return { pay, perfDelta, promoted, demoted, mood: m0 };
  }

  _checkDemote() {
    const S = this.state;
    if (S.job.perf <= -3 && S.job.level > 1) {
      S.job.level -= 1; S.job.perf = 0;
      return true;
    }
    if (S.job.perf <= -3) S.job.perf = -2;
    return false;
  }

  // ---------- 睡觉(解析式) ----------
  sleepUntilMorning(quality = 1) {
    const S = this.state;
    let mins = (7 * 60) - S.clock;
    if (mins <= 0) mins += 1440;
    const hours = mins / 60;
    const n = S.needs;
    n.energy = Math.min(100, n.energy + hours * 12.5 * quality);
    n.hunger = Math.max(6, n.hunger - hours * 2.0);
    n.bladder = Math.max(12, n.bladder - hours * 2.6);
    n.hygiene = Math.max(8, n.hygiene - hours * 0.9);
    n.fun = Math.max(10, n.fun - hours * 0.4);
    n.social = Math.max(10, n.social - hours * 0.4);

    S.clock = 7 * 60;
    S.day += 1;
    S.weekday = (S.weekday % 7) + 1;
    S.wentToday = false;
    S.flags = {};
    return { hours: Math.round(hours * 10) / 10 };
  }

  collapseNap() {
    const S = this.state;
    S.clock += 180;
    if (S.clock >= 1440) {
      S.clock -= 1440; S.day += 1; S.weekday = (S.weekday % 7) + 1;
      S.wentToday = false; S.flags = {};
    }
    S.needs.energy = 52;
    S.needs.hygiene = Math.max(0, S.needs.hygiene - 10);
    S.needs.fun = Math.max(0, S.needs.fun - 10);
  }

  payBills() {
    const S = this.state;
    if (S.billsDue <= 0 || S.money < S.billsDue) return false;
    S.money -= S.billsDue;
    S.billsDue = 0;
    S.billAgeMin = 0;
    const wasOff = !S.power;
    S.power = true;
    return { restored: wasOff };
  }

  // ---------- 存档 ----------
  save(extra) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ state: this.state, ...extra, savedAt: Date.now() }));
      return true;
    } catch { return false; }
  }
  static loadRaw() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.state || data.state.ver !== 1) return null;
      return data;
    } catch { return null; }
  }
  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ } }
  loadFrom(data) {
    this.state = data.state;
    // 后果类标志不跨存档持久化(否则中断的事件链会把后续触发永久压制);
    // 日程类标志(billToday/workRemind 等)保留,避免重复计费
    const f = this.state.flags || {};
    for (const k of ['accident', 'collapse', 'hungry', 'bored', 'lonely', 'smelly']) delete f[k];
    this.state.flags = f;
  }
}
