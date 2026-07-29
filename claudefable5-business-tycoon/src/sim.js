// ============================================================
// 像素大亨 — 核心模拟引擎（纯逻辑，零 DOM，可自测）
// 一切随机数走可序列化的 xorshift32（state.rngS），保证同种子确定性。
// 日结算：calcBiz() 汇集 15 项机制的全部乘数；dayTick() 推进世界。
// ============================================================
import {
  MONTH_DAYS, TYPES, TYPE_BY_ID, INDUSTRIES, DISTRICTS, DIST_BY_ID, PLOTS_PER_DIST,
  SUPPLY_PLANS, WAGE_PLANS, DIGITAL_PLANS, TECHS, START_INDS, EVENTS, STOCKS, RIVALS,
  MARKETING, LEVEL_XP, GOALS, ACHIEVEMENTS,
} from './data.js';

// ---------- 确定性随机 ----------
export function rnd(state) { // xorshift32 → [0,1)
  let x = state.rngS | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rngS = x | 0;
  return ((x >>> 0) % 1e9) / 1e9;
}
const ri = (state, n) => Math.floor(rnd(state) * n);
const pick = (state, arr) => arr[ri(state, arr.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- 日期 ----------
export function calDate(day) {
  const y = Math.floor((day - 1) / (MONTH_DAYS * 12)) + 1;
  const m = Math.floor(((day - 1) % (MONTH_DAYS * 12)) / MONTH_DAYS) + 1;
  const d = ((day - 1) % MONTH_DAYS) + 1;
  const season = m >= 3 && m <= 5 ? 0 : m >= 6 && m <= 8 ? 1 : m >= 9 && m <= 11 ? 2 : 3;
  return { y, m, d, season };
}

// ---------- 新开局 ----------
export function newGame(seed) {
  const state = {
    v: 1, seed, rngS: (seed | 0) || 88888888, day: 1,
    cash: 50000, over: false, won: false,
    econ: { phase: 1, idx: 1.0 }, // 0 衰退 / 1 平稳 / 2 繁荣
    brand: 0, xp: 0, level: 1,
    plots: {},          // distId -> [{o:'me'|数字(对手下标)|null, b:门店下标|null, rb:对手门店引用|null}]
    biz: [],            // 我的门店
    rivals: RIVALS.map(() => ({ cash: 60000, biz: [] })),
    techsDone: [], research: null, // {id,left}
    fx: [],             // 持续效果 [{k,...,m,until,label}]
    mktCd: {},          // 营销冷却 {id: 可再用日}
    stocks: STOCKS.map((s) => ({ id: s.id, p: s.base, sh: 0, cost: 0, hist: [s.base] })),
    loan: { bal: 0, credit: 650 },
    ledger: [],         // 每日 {day,rev,mat,wage,up,comm,mkt,int,profit} 保留 90 天
    worthHist: [],      // 每 5 天净资产采样
    goalIdx: 0, achDone: [],
    pending: null,      // 待抉择事件 {id, day}
    log: [],
    stats: {
      cumProfit: 0, monthProfit: 0, lastMonthProfit: 0, profitStreak: 0,
      strat: {}, openedTypes: {}, minCashMonth: 1e18, insolventDays: 0,
      noDebtDays: 0, stockRealized: 0, acquired: 0, recessions: 0, wasRecession: false,
      totalStaff: 0, worth: 50000, spentMkt: 0, loanUsed: false, boughtStock: false,
    },
  };
  for (const d of DISTRICTS) state.plots[d.id] = Array.from({ length: PLOTS_PER_DIST }, () => ({ o: null, b: null, rb: null }));
  addLog(state, '欢迎来到像素城！用 ¥5 万开创你的商业帝国吧。', 'sys');
  return state;
}

export function addLog(state, txt, cls = '') {
  state.log.push({ day: state.day, txt, cls });
  if (state.log.length > 150) state.log.splice(0, state.log.length - 150);
}

// ---------- 科技聚合 ----------
export function techEff(state) {
  const e = {
    revAll: 0, upkeepMul: 1, openSameMul: 1, trainCostMul: 1, trainMax: 3,
    tier: 1, supplyDeep: 0, mktEff: 0, brandDecayMul: 1, repGainMul: 1, calmNoise: 0,
    digital: 0, wageAllMul: 1, coldchain: 0, mfgWageMul: 1, loanRateMul: 1,
    stockFee: 0.01, divMul: 1, stocks: 0, inds: new Set(START_INDS),
  };
  for (const id of state.techsDone) {
    const t = TECHS[id]; if (!t) continue;
    const f = t.eff;
    if (f.revAll) e.revAll += f.revAll;
    if (f.upkeepMul) e.upkeepMul *= f.upkeepMul;
    if (f.openSameMul) e.openSameMul = f.openSameMul;
    if (f.trainCostMul) e.trainCostMul = f.trainCostMul;
    if (f.trainMax) e.trainMax = f.trainMax;
    if (f.tier) e.tier = Math.max(e.tier, f.tier);
    if (f.supplyDeep) e.supplyDeep = 1;
    if (f.mktEff) e.mktEff += f.mktEff;
    if (f.brandDecayMul) e.brandDecayMul = f.brandDecayMul;
    if (f.repGainMul) e.repGainMul = f.repGainMul;
    if (f.calmNoise) e.calmNoise = 1;
    if (f.digital) e.digital = Math.max(e.digital, f.digital);
    if (f.wageAllMul) e.wageAllMul *= f.wageAllMul;
    if (f.coldchain) e.coldchain = 1;
    if (f.mfgWageMul) e.mfgWageMul = f.mfgWageMul;
    if (f.loanRateMul) e.loanRateMul = f.loanRateMul;
    if (f.stockFee) e.stockFee = f.stockFee;
    if (f.divMul) e.divMul = f.divMul;
    if (f.stocks) e.stocks = 1;
    if (f.unlockInd) e.inds.add(f.unlockInd);
  }
  return e;
}

// ---------- 持续效果查询 ----------
function fxMul(state, k, key) {
  let m = 1;
  for (const f of state.fx) {
    if (f.k !== k) continue;
    if (k === 'ind' && f.ind !== key) continue;
    if (k === 'indmat' && f.ind !== key) continue;
    if (k === 'dist' && f.d !== key) continue;
    if (k === 'biz' && f.bizId !== key) continue;
    m *= f.m;
  }
  return m;
}

// ---------- 供应链 ----------
export function ownedProducers(state) { // good -> 家数
  const map = {};
  for (const b of state.biz) {
    const mk = TYPE_BY_ID[b.type].mk;
    if (mk) map[mk] = (map[mk] || 0) + 1;
  }
  return map;
}
export function supplyDisc(state, type, eff, producers) { // 需求侧材料折扣
  if (!type.nd || !type.nd.length) return 1;
  const deep = eff.supplyDeep;
  let sum = 0;
  for (const g of type.nd) {
    const n = producers[g] || 0;
    sum += n >= 2 ? (deep ? 0.68 : 0.75) : n >= 1 ? (deep ? 0.8 : 0.85) : 1;
  }
  return sum / type.nd.length;
}
export function countSynergies(state) { // 已达成协同的货品数（有产也有销）
  const prod = ownedProducers(state);
  const need = new Set();
  for (const b of state.biz) for (const g of TYPE_BY_ID[b.type].nd || []) need.add(g);
  return Object.keys(prod).filter((g) => need.has(g)).length;
}

// ---------- 用工 ----------
export const staffReq = (type, level) => type.staff + Math.ceil(type.staff * 0.5 * (level - 1));
export const hireCost = (state, type) => Math.round(INDUSTRIES[type.ind].wage * 5 * fxMul(state, 'hirecost'));
export const upgradeCost = (type, level) => Math.round(type.cost * 0.55 * Math.pow(level, 1.25));

// ---------- 单店日结算（15 项机制在此汇流） ----------
export function calcBiz(state, b, eff, producers, opt = {}) {
  const t = TYPE_BY_ID[b.type], indu = INDUSTRIES[t.ind], dObj = DIST_BY_ID[b.dist];
  const { season } = calDate(state.day);

  // 季节（机制:经济周期与四季 / 科技冷链）
  let sea = (t.sea || indu.sea)[season];
  if (eff.coldchain && (t.ind === 'food' || t.ind === 'agri')) sea = 1 + (sea - 1) * 0.5;

  // 城区客流（机制:选址与地价 / 营销 / 事件）
  const devCount = state.plots[b.dist].filter((p) => p.b !== null || p.rb).length;
  const distT = dObj.traffic * (1 + 0.05 * devCount) * (dObj.seaT ? dObj.seaT[season] : 1)
    * fxMul(state, 'dist', b.dist) * fxMul(state, 'traffic');
  const aff = (dObj.aff && dObj.aff[t.ind]) || 1;

  // 定价弹性（机制:供需定价）
  const qPrice = Math.pow(b.price, -indu.elast);

  // 声望/品牌（机制:声望 / 营销品牌）
  const repM = 0.75 + b.rep / 200;
  const brandM = 1 + state.brand / 250;

  // 雇员（机制:雇员养成）
  const req = staffReq(t, b.level);
  const staffM = Math.pow(Math.min(1, b.staff / req), 0.7);
  const skillM = 0.9 + 0.1 * (b.skill - 1);
  const moraleM = 0.75 + b.morale / 200;

  // 数字化（机制:数字化经营）
  const digi = DIGITAL_PLANS[b.digital];
  // 供应品质（机制:供应品质）
  const sup = SUPPLY_PLANS[b.supply];

  // 竞争（机制:竞争对手 AI）
  let rivalCnt = 0;
  for (const rv of state.rivals) for (const rb of rv.biz) {
    if (rb.dist === b.dist && TYPE_BY_ID[rb.type].ind === t.ind) rivalCnt++;
  }
  const w = 1 + 0.22 * (b.level - 1) + 0.08 * (b.skill - 1) + (b.rep - 40) / 150;
  const share = (w * fxMul(state, 'share')) / (w * fxMul(state, 'share') + 0.42 * rivalCnt);

  // 促销 & 事件 & 宏观
  const promo = b.promoUntil > state.day ? 1.3 : 1;
  const indM = fxMul(state, 'ind', t.ind);
  const bizM = fxMul(state, 'biz', b.id);
  const econM = state.econ.idx;
  // 上游有自家销路 → 客量 +10%（机制:供应链协同）
  let chainQ = 1;
  if (t.mk) {
    for (const ob of state.biz) if (ob !== b && (TYPE_BY_ID[ob.type].nd || []).includes(t.mk)) { chainQ = 1.1; break; }
  }

  let noise = 1;
  if (!opt.noNoise) {
    const span = eff.calmNoise ? 0.04 : 0.08;
    noise = 1 - span + rnd(state) * span * 2;
  }

  let qty = distT * aff * sea * econM * qPrice * repM * brandM * staffM * skillM * moraleM
    * digi.reach * sup.qual * promo * indM * bizM * share * chainQ * noise;
  const cap = 1.55 * (1 + 0.32 * (b.level - 1));
  const overCap = qty > cap;
  qty = Math.min(qty, cap);

  const levelQual = 1 + 0.07 * (b.level - 1);
  let rev = t.rev * qty * b.price * levelQual * (1 + eff.revAll) * fxMul(state, 'rev');
  const matRate = indu.mat * sup.mat * supplyDisc(state, t, eff, producers)
    * fxMul(state, 'mat') * fxMul(state, 'indmat', t.ind);
  const mat = t.rev * qty * matRate;
  const wagePlan = WAGE_PLANS[b.wage];
  const wage = b.staff * indu.wage * wagePlan.mul * (1 + 0.15 * (b.skill - 1))
    * digi.wage * eff.wageAllMul * (t.ind === 'mfg' ? eff.mfgWageMul : 1) * fxMul(state, 'wage');
  const up = dObj.upkeep * (1 + 0.4 * (b.level - 1)) * eff.upkeepMul * fxMul(state, 'upkeep');
  const comm = rev * digi.comm;
  const profit = rev - mat - wage - up - comm;
  return { rev, mat, wage, up, comm, profit, qty, cap, overCap, share, rivalCnt, req,
    f: { sea, distT, aff, qPrice, repM, brandM, staffM, skillM, moraleM, econM, promo, chainQ } };
}

// ---------- 事件 ----------
function eventOk(state, ev) {
  const { season, m } = calDate(state.day);
  const c = ev.cond || {};
  if (c.season && !c.season.includes(season)) return false;
  if (c.month && !c.month.includes(m)) return false;
  if (c.biz && !state.biz.length) return false;
  if (c.staff && state.stats.totalStaff < c.staff) return false;
  if (c.indBiz && !state.biz.some((b) => TYPE_BY_ID[b.type].ind === c.indBiz)) return false;
  if (c.worth && state.stats.worth < c.worth) return false;
  if (c.stocks && !techEff(state).stocks) return false;
  if (c.rival && !state.rivals.some((r) => r.biz.length)) return false;
  if (state.fx.some((f) => f.src === ev.id)) return false; // 同款生效中不重复
  return true;
}

function applyInst(state, inst, evName) {
  for (const i of inst || []) {
    switch (i.k) {
      case 'cash': state.cash += i.add; break;
      case 'econ': state.econ.idx = clamp(state.econ.idx + i.add, 0.65, 1.35); break;
      case 'stockAll': for (const s of state.stocks) s.p = Math.max(0.5, s.p * i.m); break;
      case 'brand': state.brand = clamp(state.brand + i.add, 0, 100); break;
      case 'repAll': for (const b of state.biz) b.rep = clamp(b.rep + i.add, 0, 100); break;
      case 'moraleAll': for (const b of state.biz) b.morale = clamp(b.morale + i.add, 0, 100); break;
      case 'repInd': for (const b of state.biz) if (TYPE_BY_ID[b.type].ind === i.ind) b.rep = clamp(b.rep + i.add, 0, 100); break;
      case 'repRand': if (state.biz.length) { const b = pick(state, state.biz); b.rep = clamp(b.rep + i.add, 0, 100); addLog(state, `「${bizName(b)}」声望 +${i.add}`, 'good'); } break;
      case 'cashPerFood': state.cash += i.add * state.biz.filter((b) => TYPE_BY_ID[b.type].ind === 'food').length; break;
      case 'inspectGamble':
        if (rnd(state) < 0.3) {
          for (const b of state.biz) if (TYPE_BY_ID[b.type].ind === 'food') { b.rep = clamp(b.rep - 12, 0, 100); b.closedUntil = state.day + 3; }
          addLog(state, '被查出问题！全部餐饮店通报停业 3 天，声望 -12。', 'bad');
        } else addLog(state, '侥幸过关，检查组没有发现问题。', 'good');
        break;
      case 'taxGamble':
        if (rnd(state) < 0.3) { state.cash -= 25000; addLog(state, '稽查认定申报不实，罚款 ¥25000！', 'bad'); }
        else addLog(state, '资料齐全，税务稽查顺利通过。', 'good');
        break;
    }
  }
}

function applyEvent(state, ev) {
  if (ev.choice) { state.pending = { id: ev.id }; addLog(state, `【抉择】${ev.name}：${ev.desc}`, 'warn'); return; }
  applyInst(state, ev.inst, ev.name);
  for (const mod of ev.mods || []) {
    const f = { ...mod, until: state.day + ev.dur, src: ev.id, label: ev.name };
    if (mod.k === 'bizRand') {
      if (!state.biz.length) continue;
      const b = pick(state, state.biz);
      f.k = 'biz'; f.bizId = b.id;
      addLog(state, `「${bizName(b)}」${ev.desc}`, 'good');
    }
    state.fx.push(f);
  }
  addLog(state, `【事件】${ev.name}：${ev.desc}`, ev.mods && ev.mods.some((m) => m.m < 1) ? 'bad' : 'event');
}

export function resolveChoice(state, key) { // key: 'a' | 'b'
  if (!state.pending) return;
  const ev = EVENTS.find((e) => e.id === state.pending.id);
  const opt = ev.choice[key];
  applyInst(state, opt.inst, ev.name);
  for (const mod of opt.mods || []) state.fx.push({ ...mod, until: state.day + (mod.dur || 0), src: ev.id, label: ev.name });
  addLog(state, `【抉择】${ev.name} → ${opt.label}`, 'event');
  state.pending = null;
}

export function bizName(b) { return TYPE_BY_ID[b.type].name; }

// ---------- 对手 AI ----------
function rivalIncome(state) {
  for (const rv of state.rivals) {
    let inc = 0;
    for (const rb of rv.biz) inc += 350 * rb.level;
    rv.cash += inc;
  }
}

function freePlots(state, distIds) {
  const out = [];
  for (const dId of distIds) {
    state.plots[dId].forEach((p, i) => { if (p.o === null) out.push({ dId, i }); });
  }
  return out;
}

function rivalTurn(state) {
  const unlocked = DISTRICTS.filter((d) => d.unlock <= state.level).map((d) => d.id);
  state.rivals.forEach((rv, ri_) => {
    if (rv.biz.length >= 6) { // 满编则尝试升级
      const rb = pick(state, rv.biz);
      if (rb.level < 4 && rv.cash > 30000) { rb.level++; rv.cash -= 20000; }
      return;
    }
    const spec = RIVALS[ri_];
    const slots = freePlots(state, unlocked);
    if (!slots.length) return;
    let cands;
    if (spec.style === 'spam') cands = TYPES.filter((t) => t.tier === 1);
    else if (spec.style === 'aggressive' && state.biz.length) {
      const counts = {};
      for (const b of state.biz) { const ind = TYPE_BY_ID[b.type].ind; counts[ind] = (counts[ind] || 0) + 1; }
      const topInd = Object.entries(counts).sort((a, z) => z[1] - a[1])[0][0];
      cands = TYPES.filter((t) => t.ind === topInd && t.tier <= 3);
    } else cands = TYPES.filter((t) => t.tier === 2);
    if (!cands || !cands.length) cands = TYPES.filter((t) => t.tier === 1);
    const t = pick(state, cands);
    const cost = t.cost * 0.9; // 对手有渠道折扣
    if (rv.cash < cost || rnd(state) < 0.35) return; // 不是每月都动
    let slot;
    if (spec.style === 'aggressive' && state.biz.length) {
      const myDists = new Set(state.biz.map((b) => b.dist));
      slot = slots.find((s) => myDists.has(s.dId)) || pick(state, slots);
    } else slot = pick(state, slots);
    rv.cash -= cost;
    const rb = { dist: slot.dId, plot: slot.i, type: t.id, level: 1 };
    rv.biz.push(rb);
    state.plots[slot.dId][slot.i] = { o: ri_, b: null, rb };
    addLog(state, `${spec.name} 在${DIST_BY_ID[slot.dId].name}开了一家「${t.name}」！`, 'warn');
  });
}

// ---------- 大亨等级 ----------
export function addXp(state, n) {
  state.xp += n;
  while (state.level < LEVEL_XP.length && state.xp >= LEVEL_XP[state.level]) {
    state.level++;
    const unlocked = DISTRICTS.find((d) => d.unlock === state.level);
    addLog(state, `🎉 大亨等级提升至 Lv${state.level}！${unlocked ? `新城区【${unlocked.name}】开放！` : ''}`, 'good');
  }
}

// ---------- 净资产 ----------
export function netWorth(state) {
  let v = state.cash - state.loan.bal;
  for (const b of state.biz) v += b.invested * 0.7;
  for (const d of DISTRICTS) {
    for (const p of state.plots[d.id]) if (p.o === 'me') v += landPrice(state, d.id) * 0.8;
  }
  for (const s of state.stocks) v += s.sh * s.p;
  return Math.round(v);
}
export function landPrice(state, distId) {
  const d = DIST_BY_ID[distId];
  const owned = state.plots[distId].filter((p) => p.o !== null).length;
  return Math.round(d.land * (1 + 0.12 * owned));
}

// ---------- 目标与成就 ----------
function checkGoal(state) {
  const g = GOALS[state.goalIdx];
  if (!g) return;
  const st = state.stats;
  const done = {
    shop1: () => state.biz.length >= 1,
    staffed: () => state.biz.some((b) => b.staff >= staffReq(TYPE_BY_ID[b.type], b.level)),
    profit3: () => st.profitStreak >= 3,
    strategy: () => Object.keys(st.strat).length >= 3,
    upgrade1: () => state.biz.some((b) => b.level >= 2),
    tech1: () => state.techsDone.length >= 1,
    shop2: () => state.biz.length >= 2,
    brand10: () => state.brand >= 10,
    loan1: () => st.loanUsed,
    chain1: () => countSynergies(state) >= 1,
    month10k: () => st.monthProfit >= 10000 || st.lastMonthProfit >= 10000,
    dist2: () => new Set([...allMyPlots(state)].map((p) => p.dId)).size >= 2,
    ind4: () => new Set(state.biz.map((b) => TYPE_BY_ID[b.type].ind)).size >= 4,
    stock1: () => st.boughtStock,
    worth50: () => st.worth >= 500000,
    shops10: () => state.biz.length >= 10,
    worth1000: () => st.worth >= 10000000,
  }[g.id];
  if (done && done()) {
    state.cash += g.cash;
    addXp(state, g.xp);
    state.goalIdx++;
    addLog(state, `✅ 目标达成【${g.name}】奖励 ¥${g.cash} + ${g.xp}XP`, 'good');
    if (g.id === 'worth1000') state.won = true;
  }
}
function* allMyPlots(state) {
  for (const d of DISTRICTS) {
    for (const p of state.plots[d.id]) if (p.o === 'me') yield { dId: d.id, p };
  }
}
function checkAch(state) {
  const st = state.stats;
  const checks = {
    cash1m: () => state.cash >= 1e6,
    allind: () => new Set(state.biz.map((b) => TYPE_BY_ID[b.type].ind)).size >= 12,
    types30: () => Object.keys(st.openedTypes).length >= 30,
    rep95: () => state.biz.some((b) => b.rep >= 95),
    maxlv5: () => state.biz.filter((b) => b.level >= 5).length >= 5,
    techall: () => state.techsDone.length >= Object.keys(TECHS).length,
    stock100k: () => st.stockRealized + state.stocks.reduce((a, s) => a + s.sh * s.p - s.cost, 0) >= 100000,
    nodebt: () => st.noDebtDays >= 360,
    acquire: () => st.acquired >= 1,
    recession: () => st.recessions >= 1,
    profit1m: () => st.cumProfit >= 1e6,
    staff50: () => st.totalStaff >= 50,
    brand80: () => state.brand >= 80,
  };
  for (const a of ACHIEVEMENTS) {
    if (state.achDone.includes(a.id)) continue;
    if (checks[a.id] && checks[a.id]()) {
      state.achDone.push(a.id);
      addXp(state, 25);
      addLog(state, `🏆 成就解锁【${a.name}】：${a.desc}（+25XP）`, 'good');
    }
  }
}

// ---------- 日推进 ----------
export function dayTick(state) {
  if (state.over) return;
  state.day++;
  const { d: dom, m } = calDate(state.day);
  const eff = techEff(state);
  const producers = ownedProducers(state);

  // 宏观：向阶段目标缓动 + 微噪声
  const target = [0.82, 1.0, 1.2][state.econ.phase];
  state.econ.idx = clamp(state.econ.idx + (target - state.econ.idx) * 0.03 + (rnd(state) - 0.5) * 0.008, 0.65, 1.35);

  // 过期效果
  state.fx = state.fx.filter((f) => f.until > state.day);

  // 事件（有抉择挂起时不再掷新事件）
  if (!state.pending && rnd(state) < 0.045) {
    const pool = EVENTS.filter((e) => eventOk(state, e));
    if (pool.length) {
      const tw = pool.reduce((a, e) => a + e.w, 0);
      let r = rnd(state) * tw;
      for (const e of pool) { r -= e.w; if (r <= 0) { applyEvent(state, e); break; } }
    }
  }

  // 门店结算
  let rev = 0, mat = 0, wage = 0, up = 0, comm = 0, profit = 0;
  state.stats.totalStaff = 0;
  for (const b of state.biz) {
    state.stats.totalStaff += b.staff;
    if (b.closedUntil && b.closedUntil > state.day) { // 停业只烧固定成本
      const r0 = calcBiz(state, b, eff, producers, { noNoise: true });
      const fixed = r0.wage + r0.up;
      b.today = { rev: 0, mat: 0, wage: r0.wage, up: r0.up, comm: 0, profit: -fixed, qty: 0, closed: true };
      profit -= fixed; wage += r0.wage; up += r0.up;
      b.hist.push(-fixed); if (b.hist.length > 30) b.hist.shift();
      continue;
    }
    const r = calcBiz(state, b, eff, producers);
    b.today = r;
    rev += r.rev; mat += r.mat; wage += r.wage; up += r.up; comm += r.comm; profit += r.profit;
    b.hist.push(r.profit); if (b.hist.length > 30) b.hist.shift();

    // 声望漂移（供应品质 + 人效 + 会员体系）
    const sup = SUPPLY_PLANS[b.supply];
    let dRep = sup.rep;
    if (b.staff < r.req) dRep -= 0.25;
    else if (r.f.moraleM > 1.05) dRep += 0.12;
    if (dRep > 0) dRep *= eff.repGainMul;
    b.rep = clamp(b.rep + dRep, 0, 100);

    // 士气漂移（薪酬政策 + 超负荷）
    const wp = WAGE_PLANS[b.wage];
    let dMor = wp.morale;
    if (r.overCap) dMor -= 0.2;
    b.morale = clamp(b.morale + dMor + 0.02 * (70 - b.morale) * 0.1, 0, 100);
  }

  // 贷款日息
  let int_ = 0;
  if (state.loan.bal > 0) {
    const rate = loanDailyRate(state, eff);
    int_ = state.loan.bal * rate;
    state.cash -= int_;
    state.stats.noDebtDays = 0;
  } else state.stats.noDebtDays++;

  state.cash += profit;
  state.stats.cumProfit += Math.max(0, profit);
  state.stats.monthProfit += profit;
  state.stats.profitStreak = profit > 0 ? state.stats.profitStreak + 1 : 0;
  state.stats.minCashMonth = Math.min(state.stats.minCashMonth, state.cash);
  if (profit > 0) addXp(state, profit / 600);

  state.ledger.push({ day: state.day, rev, mat, wage, up, comm, int: int_, profit: profit - int_ });
  if (state.ledger.length > 90) state.ledger.shift();

  // 品牌衰减
  const hasCamp = state.fx.some((f) => f.mkt);
  state.brand = clamp(state.brand + (hasCamp ? 0.35 : -0.15 * eff.brandDecayMul), 0, 100);

  // 股票日行情
  for (let i = 0; i < state.stocks.length; i++) {
    const s = state.stocks[i], def = STOCKS[i];
    const drift = (state.econ.idx - 1) * 0.004 + (rnd(state) - 0.5) * 2 * def.vol;
    s.p = Math.max(0.5, s.p * (1 + drift));
    s.hist.push(+s.p.toFixed(2)); if (s.hist.length > 60) s.hist.shift();
  }

  rivalIncome(state);

  // 研发推进
  if (state.research) {
    state.research.left--;
    if (state.research.left <= 0) {
      state.techsDone.push(state.research.id);
      addLog(state, `🔬 研发完成【${TECHS[state.research.id].name}】`, 'good');
      addXp(state, 15);
      state.research = null;
    }
  }

  // 月结
  if (dom === 1 && state.day > 1) {
    // 信用
    if (state.stats.minCashMonth >= 0) state.loan.credit = clamp(state.loan.credit + 8, 400, 850);
    else state.loan.credit = clamp(state.loan.credit - 25, 400, 850);
    state.stats.minCashMonth = state.cash;
    state.stats.lastMonthProfit = state.stats.monthProfit;
    state.stats.monthProfit = 0;
    // 季度分红
    if ((m - 1) % 3 === 0) {
      let div = 0;
      for (const s of state.stocks) div += s.sh * s.p * 0.008 * eff.divMul;
      if (div > 0.5) { state.cash += div; addLog(state, `💰 收到季度股票分红 ¥${Math.round(div)}`, 'good'); }
    }
    // 宏观阶段马尔可夫
    const r = rnd(state);
    const ph = state.econ.phase;
    if (ph === 1) state.econ.phase = r < 0.16 ? 2 : r < 0.3 ? 0 : 1;
    else if (ph === 2) state.econ.phase = r < 0.3 ? 1 : 2;
    else state.econ.phase = r < 0.35 ? 1 : 0;
    if (ph !== state.econ.phase) {
      const names = ['📉 经济进入衰退期', '➖ 经济回归平稳', '📈 经济进入繁荣期'];
      addLog(state, names[state.econ.phase], state.econ.phase === 0 ? 'bad' : 'good');
      if (ph === 0 && state.econ.phase !== 0) { state.stats.recessions++; }
    }
    rivalTurn(state);
    state.autosave = true; // 由 main 消费
  }

  // 净资产采样
  state.stats.worth = netWorth(state);
  if (state.day % 5 === 0) {
    state.worthHist.push(state.stats.worth);
    if (state.worthHist.length > 120) state.worthHist.shift();
  }

  // 破产判定：现金 < -5 万连续 15 天
  if (state.cash < -50000) {
    state.stats.insolventDays++;
    if (state.stats.insolventDays === 1) addLog(state, '⚠️ 现金严重透支！连续 15 天低于 -¥5 万将破产！', 'bad');
    if (state.stats.insolventDays >= 15) { state.over = true; addLog(state, '💥 资金链断裂，帝国倒塌……', 'bad'); }
  } else state.stats.insolventDays = 0;

  checkGoal(state);
  checkAch(state);
}

export function loanDailyRate(state, eff) {
  const creditMul = 1 + (650 - state.loan.credit) / 400; // 850→0.5, 400→1.62
  return 0.00035 * eff.loanRateMul * clamp(creditMul, 0.5, 1.7);
}
export function loanMax(state) {
  return Math.max(0, Math.round(30000 + 0.6 * state.stats.worth - state.loan.bal));
}
