// 模拟核心:时间、需求、心情、技能、关系、金钱、账单、邮件、章节、存档。
// 只处理数据与规则,不关心画面;通过 emit() 把事件交给世界层/界面层。
import { MOTIVES, SKILLS, SKILL_XP, SKILL_MAX, CAREERS, SHOP, NPCS, CHAPTERS, DAY_NAMES, shopItem } from './data.js';

export const SAVE_KEY = 'opus55-life-gba-save-v1';
export const BASE_SPEED = 5; // 正常状态:每现实秒流逝的游戏分钟

export let S = null;
const subs = [];
export function on(fn) { subs.push(fn); }
export function emit(type, data = {}) { for (const f of subs) f(type, data); }

export function newGame(name, look) {
  S = {
    ver: 1, name, look,
    money: 300, day: 1, min: 8 * 60,
    motives: { hunger: 70, comfort: 70, hygiene: 55, bladder: 65, energy: 80, fun: 60, social: 45, room: 60 },
    skills: Object.fromEntries(SKILLS.map((s) => [s.id, 0])),
    rels: Object.fromEntries(Object.keys(NPCS).map((id) => [id, { v: 0, met: false, romance: false, crush: false, last: -1, today: 0 }])),
    jobs: { cafe: null, garage: null },
    owned: {},
    inv: { fish: 0, painting: 0, paintProgress: 0 },
    flags: {},
    chapter: 0, ended: false,
    bill: null, billSeq: 0,
    mail: [],
    home: { plates: 0, dirty: 0, puddles: [], fire: false, tvBroken: false, pizzaAt: null, pizzaReady: 0 },
    map: 'town', x: 17 * 16 + 8, y: 13 * 16 + 14, dir: 'left',
    stats: { earned: 0, shifts: 0, fish: 0, paintings: 0, socials: 0 },
    lastHour: 8, lastDay: 1,
    wishes: [],
  };
  addMail('欢迎信', '欢迎入住绿钻镇!小屋已备好:冰箱、灶台、淋浴、电视一应俱全。账单每三天寄到邮箱一次,请按时缴纳。——老杰');
  return S;
}
export function setState(s) { S = s; }

// ---------------------------------------------------------------- 时间
export const absMin = () => (S.day - 1) * 1440 + S.min;
export const hour = () => Math.floor(S.min / 60);
export const dayName = () => DAY_NAMES[(S.day - 1) % 7];
export function clockStr() {
  const h = Math.floor(S.min / 60), m = Math.floor(S.min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function isNight() { const h = S.min / 60; return h >= 20 || h < 6; }
// 0 白天 → 1 深夜 的光照系数
export function darkness() {
  const h = S.min / 60;
  const D = 0.62;
  if (h >= 7 && h < 18) return 0;
  if (h >= 18 && h < 21) return (h - 18) / 3 * D;
  if (h >= 21 || h < 5) return D;
  return D * (1 - (h - 5) / 2);
}

// ---------------------------------------------------------------- 需求与心情
export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export function mood() {
  let sum = 0, w = 0;
  for (const m of MOTIVES) { sum += S.motives[m.id] * m.w; w += m.w; }
  // 最低的那项拖后腿
  const low = Math.min(...MOTIVES.map((m) => S.motives[m.id]));
  return clamp(sum / w * 0.8 + low * 0.2);
}
export function moodColor(v = mood()) {
  if (v >= 62) return '#48d048';
  if (v >= 45) return '#a8d838';
  if (v >= 30) return '#f0c030';
  if (v >= 18) return '#f08830';
  return '#e03838';
}
export function moodWord(v = mood()) {
  if (v >= 75) return '心情超棒';
  if (v >= 60) return '心情不错';
  if (v >= 45) return '还过得去';
  if (v >= 30) return '有点烦躁';
  if (v >= 18) return '很不开心';
  return '濒临崩溃';
}

/**
 * 推进游戏时间。
 * mods: { rates: {motive: 每小时变化}, sleep: bool, skill: [id, xp/h], roomTarget }
 */
export function advance(mins, mods = {}) {
  if (!S) return;
  // 按 ≤10 分钟分片,保证跨越多个整点时每个整点事件都触发
  while (mins > 1e-6) {
    const c = Math.min(mins, 10);
    stepTime(c, mods);
    mins -= c;
  }
}
function stepTime(mins, mods) {
  const h = mins / 60;
  const rates = mods.rates || {};
  for (const m of MOTIVES) {
    if (m.id === 'room') continue;
    let d = -(mods.sleep ? m.sleep : m.decay) * (mods.decayMul?.[m.id] ?? 1);
    if (m.id === 'comfort' && mods.sitting) d = 0;
    if (m.id === 'energy' && mods.sleep) d = 0;
    S.motives[m.id] = clamp(S.motives[m.id] + (d + (rates[m.id] || 0)) * h);
  }
  // 环境需求向场所目标值靠拢
  const tgt = mods.roomTarget ?? 60;
  const r = S.motives.room;
  S.motives.room = clamp(r + Math.sign(tgt - r) * Math.min(Math.abs(tgt - r), 30 * h) + (rates.room || 0) * h);

  if (mods.skill) gainSkill(mods.skill[0], mods.skill[1] * h);

  const prevHour = Math.floor(S.min / 60);
  S.min += mins;
  while (S.min >= 1440) {
    S.min -= 1440; S.day++;
    onNewDay();
  }
  const nh = Math.floor(S.min / 60);
  if (nh !== prevHour) onHour(nh);
  checkMotiveFailures();
}

// 冷却时间存在存档里(换档/回标题后不会残留上一局的时间戳)
function checkMotiveFailures() {
  const now = absMin();
  if ((S.failCd || 0) > now) return;
  const M = S.motives;
  let id = null;
  if (M.bladder <= 0) id = 'bladder';
  else if (M.energy <= 0) id = 'energy';
  else if (M.hunger <= 0) id = 'hunger';
  if (id) { S.failCd = now + 30; emit('fail', { id }); }
}

function onHour(h) {
  // 账单:每三天 9 点寄到
  if (h === 9 && S.day % 3 === 0 && !S.bill) {
    const value = Object.keys(S.owned).reduce((a, id) => a + (shopItem(id)?.special ? 0 : shopItem(id)?.price || 0), 0);
    const amount = 45 + Math.round(value * 0.04);
    S.bill = { amount, day: S.day, warned: false };
    addMail('账单', `水电燃气及房屋维护费共 §${amount}。请在三天内到邮箱缴纳,逾期将由收债员上门收走家具。`);
    emit('mail', {});
  }
  if (S.bill && S.day - S.bill.day >= 3 && h === 10) repo();
  if (S.bill && S.day - S.bill.day === 2 && h === 10 && !S.bill.warned) {
    S.bill.warned = true;
    emit('toast', { text: '账单明天就逾期了!', icon: 'mail' });
  }
  // 披萨送达
  if (S.home.pizzaAt && absMin() >= S.home.pizzaAt) {
    S.home.pizzaAt = null; S.home.pizzaReady = 1;
    emit('pizza', {});
  }
  emit('hour', { h });
}

function onNewDay() {
  emit('day', { day: S.day });
  // 关系自然衰减:今天没互动的,往 0 回落 1 点
  for (const [id, r] of Object.entries(S.rels)) {
    if (r.today === 0 && r.met) r.v += r.v > 25 ? -1 : r.v < -5 ? 1 : 0;
    r.today = 0;
  }
  for (const j of Object.values(S.jobs)) if (j) j.workedToday = false;
}

function repo() {
  const owned = Object.keys(S.owned).filter((id) => !shopItem(id)?.special).sort((a, b) => shopItem(b).price - shopItem(a).price);
  const amount = S.bill.amount;
  if (S.money >= amount) {
    // 先自动扣款,扣不完再收家具
    S.money -= amount; S.bill = null;
    emit('toast', { text: `账单逾期,已自动扣款 §${amount}`, icon: 'money' });
    return;
  }
  if (owned.length) {
    const id = owned[0];
    delete S.owned[id];
    emit('repo', { item: shopItem(id).name });
  } else {
    S.money = 0;
    emit('repo', { item: null });
  }
  S.bill = null;
}

export function payBill() {
  if (!S.bill) return false;
  if (S.money < S.bill.amount) return false;
  S.money -= S.bill.amount;
  S.bill = null;
  return true;
}

export function addMail(title, body) {
  S.mail.unshift({ title, body, day: S.day, read: false });
  if (S.mail.length > 12) S.mail.length = 12;
}

// ---------------------------------------------------------------- 金钱
export function addMoney(n, why = '') {
  S.money = Math.max(0, Math.round(S.money + n));
  if (n > 0) S.stats.earned += n;
  emit('money', { n, why });
}
export function canAfford(n) { return S.money >= n; }

// ---------------------------------------------------------------- 技能
export const skillLv = (id) => Math.min(SKILL_MAX, Math.floor(S.skills[id] / SKILL_XP));
export function gainSkill(id, xp) {
  if (!id) return;
  const before = skillLv(id);
  if (before >= SKILL_MAX) return;
  // 心情差学得慢;等级越高越难
  const m = mood();
  const k = (m < 30 ? 0.4 : m < 50 ? 0.75 : 1) * (1 - before * 0.08);
  S.skills[id] = Math.min(SKILL_MAX * SKILL_XP, S.skills[id] + xp * k);
  const after = skillLv(id);
  if (after > before) emit('skillUp', { id, lv: after, label: SKILLS.find((s) => s.id === id).label });
}

// ---------------------------------------------------------------- 关系
export function changeRel(id, d) {
  const r = S.rels[id];
  const before = r.v;
  r.v = clamp(r.v + d, -100, 100);
  r.met = true; r.today++; r.last = absMin();
  emit('rel', { id, d: r.v - before });
  return r.v - before;
}

// ---------------------------------------------------------------- 职业
export function careerLevel(id) { return S.jobs[id] ? S.jobs[id].lvl : -1; }
export function promoReq(id) {
  const j = S.jobs[id];
  const next = CAREERS[id].levels[j.lvl + 1];
  if (!next) return null;
  return Object.entries(next.req).filter(([k, v]) => skillLv(k) < v).map(([k, v]) => `${SKILLS.find((s) => s.id === k).label}${v}级`);
}

// ---------------------------------------------------------------- 购物
export function ownedValue() { return Object.keys(S.owned).reduce((a, id) => a + (shopItem(id)?.price || 0), 0); }
export const has = (id) => !!S.owned[id];

// ---------------------------------------------------------------- 章节
export const goalAPI = {
  rel: (id) => S.rels[id].v,
  flag: (k) => !!S.flags[k],
  countRel: (min) => Object.values(S.rels).filter((r) => r.v >= min).length,
  skill: (id) => skillLv(id),
  skillTotal: () => SKILLS.reduce((a, s) => a + skillLv(s.id), 0),
  ownedCount: () => Object.keys(S.owned).filter((k) => k !== 'deed').length,
  owned: (id) => !!S.owned[id],
  money: () => S.money,
  bestCareer: () => Math.max(...Object.values(S.jobs).map((j) => (j ? j.lvl + 1 : 0))),
  hasLover: () => Object.values(S.rels).some((r) => r.romance),
};
export function chapterStatus() {
  const ch = CHAPTERS[Math.min(S.chapter, CHAPTERS.length - 1)];
  return { ch, idx: S.chapter, goals: ch.goals.map((g) => ({ text: g.text, done: g.check(goalAPI) })) };
}
export function checkChapter() {
  if (S.chapter >= CHAPTERS.length) return;
  const st = chapterStatus();
  if (st.goals.every((g) => g.done)) {
    const ch = st.ch;
    S.chapter++;
    emit('chapter', { done: ch, next: CHAPTERS[S.chapter] || null });
  }
}

// ---------------------------------------------------------------- 存档
export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); return true; } catch { return false; }
}
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || s.ver !== 1) return false;
    S = s;
    return true;
  } catch { return false; }
}
export function wipeSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* 忽略 */ } }

export { MOTIVES, SKILLS, CAREERS, SHOP, NPCS };
