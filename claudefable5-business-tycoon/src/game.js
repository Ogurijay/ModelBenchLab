// ============================================================
// 像素大亨 — 玩家操作层：所有 UI 动作经此改写 state，并返回 {ok,msg}
// 另含图鉴解锁判定与 localStorage 存档。
// ============================================================
import {
  TYPES, TYPE_BY_ID, INDUSTRIES, DIST_BY_ID, TECHS, MARKETING, STOCKS,
  SUPPLY_PLANS, WAGE_PLANS, DIGITAL_PLANS, RIVALS, DISTRICTS,
} from './data.js';
import {
  techEff, addLog, addXp, staffReq, hireCost, upgradeCost, landPrice, bizName, loanMax,
} from './sim.js';

export const SAVE_KEY = 'cf5-biztycoon-v1';
let _nextBizId = 1;

const no = (msg) => ({ ok: false, msg });
const yes = (msg) => ({ ok: true, msg });
const touchStrat = (state, k) => { state.stats.strat[k] = 1; };

// ---------- 图鉴解锁 ----------
export function typeLock(state, t) { // 返回 null(可开) 或锁定原因
  const eff = techEff(state);
  if (!eff.inds.has(t.ind)) {
    const tech = Object.entries(TECHS).find(([, v]) => v.eff.unlockInd === t.ind);
    return `需研发【${tech ? tech[1].name : '?'}】`;
  }
  if (t.tier > eff.tier) {
    const need = { 2: 'lic2', 3: 'lic3', 4: 'group' }[t.tier];
    return `需研发【${TECHS[need].name}】`;
  }
  return null;
}
export function unlockedCount(state) {
  return TYPES.filter((t) => !typeLock(state, t)).length;
}

// ---------- 地块 ----------
export function buyPlot(state, dId, i) {
  const d = DIST_BY_ID[dId];
  if (d.unlock > state.level) return no(`【${d.name}】需要大亨等级 Lv${d.unlock}`);
  const p = state.plots[dId][i];
  if (p.o !== null) return no('这块地已有主人');
  const price = landPrice(state, dId);
  if (state.cash < price) return no(`现金不足（地价 ¥${price.toLocaleString()}）`);
  state.cash -= price;
  p.o = 'me';
  addLog(state, `购入${d.name}地块 #${i + 1}（¥${price.toLocaleString()}）`);
  return yes('地块到手！去图鉴挑一门生意吧');
}

export function sellPlot(state, dId, i) {
  const p = state.plots[dId][i];
  if (p.o !== 'me' || p.b !== null) return no('只能出售自己的空地');
  const price = Math.round(landPrice(state, dId) * 0.8);
  p.o = null;
  state.cash += price;
  addLog(state, `出售${DIST_BY_ID[dId].name}空地，回笼 ¥${price.toLocaleString()}`);
  return yes('已出售');
}

// ---------- 开店 / 关店 ----------
export function openBiz(state, dId, i, typeId) {
  const t = TYPE_BY_ID[typeId];
  if (!t) return no('未知业态');
  const p = state.plots[dId][i];
  if (p.o !== 'me') return no('先购买这块地');
  if (p.b !== null) return no('这块地上已有门店');
  const lock = typeLock(state, t);
  if (lock) return no(lock);
  const eff = techEff(state);
  const sameCnt = state.biz.filter((b) => b.type === typeId).length;
  const cost = Math.round(t.cost * (sameCnt > 0 ? eff.openSameMul : 1));
  if (state.cash < cost) return no(`开店成本 ¥${cost.toLocaleString()}，现金不足`);
  state.cash -= cost;
  const b = {
    id: _nextBizId++, type: typeId, dist: dId, plot: i,
    level: 1, price: 1, supply: 1, wage: 1, digital: 0,
    staff: Math.min(2, t.staff), skill: 1, morale: 70, rep: 40,
    invested: cost, openDay: state.day, promoUntil: 0, closedUntil: 0,
    hist: [], today: null,
  };
  state.biz.push(b);
  p.b = state.biz.length - 1;
  state.stats.openedTypes[typeId] = 1;
  addXp(state, 12);
  addLog(state, `🎊 新店开业：${DIST_BY_ID[dId].name}「${t.name}」（¥${cost.toLocaleString()}）`, 'good');
  return yes(`「${t.name}」开业大吉！记得雇满员工`);
}

export function sellBiz(state, b) {
  const refund = Math.round(b.invested * 0.5 + b.rep * 100);
  state.cash += refund;
  const p = state.plots[b.dist][b.plot];
  const idx = state.biz.indexOf(b);
  state.biz.splice(idx, 1);
  // 重建 plot→biz 下标
  for (const d of DISTRICTS) for (const pp of state.plots[d.id]) {
    if (pp.b !== null && pp.b > idx) pp.b--;
  }
  p.b = null;
  addLog(state, `转让「${bizName(b)}」，回笼 ¥${refund.toLocaleString()}`);
  return yes('门店已转让（地块保留）');
}

export function upgradeBiz(state, b) {
  if (b.level >= 5) return no('已是满级 Lv5');
  const t = TYPE_BY_ID[b.type];
  const cost = upgradeCost(t, b.level);
  if (state.cash < cost) return no(`升级需 ¥${cost.toLocaleString()}`);
  state.cash -= cost;
  b.level++;
  b.invested += cost;
  addXp(state, 6);
  addLog(state, `「${t.name}」升级至 Lv${b.level}（¥${cost.toLocaleString()}）`, 'good');
  return yes(`升级成功！容量与品质提升，注意补充人手`);
}

// ---------- 门店策略 ----------
export function setPrice(state, b, v) {
  b.price = Math.min(1.6, Math.max(0.6, v));
  touchStrat(state, 'price');
  return yes('');
}
export function setSupply(state, b, i) {
  b.supply = i; touchStrat(state, 'supply');
  return yes(`供应方案：${SUPPLY_PLANS[i].name}`);
}
export function setWage(state, b, i) {
  b.wage = i; touchStrat(state, 'wage');
  return yes(`薪酬政策：${WAGE_PLANS[i].name}`);
}
export function setDigital(state, b, i) {
  const plan = DIGITAL_PLANS[i];
  const eff = techEff(state);
  if (plan.tech && eff.digital < i) return no(`需研发【${TECHS[plan.tech].name}】`);
  b.digital = i; touchStrat(state, 'digital');
  return yes(`数字化方案：${plan.name}`);
}
export function promoBiz(state, b) {
  if (b.promoUntil > state.day) return no('促销进行中');
  const cost = 1200;
  if (state.cash < cost) return no('现金不足');
  state.cash -= cost;
  b.promoUntil = state.day + 7;
  touchStrat(state, 'promo');
  addLog(state, `「${bizName(b)}」门店促销 7 天（¥${cost}）`);
  return yes('促销开始：7 天客量 +30%');
}

// ---------- 用工 ----------
export function hire(state, b) {
  const t = TYPE_BY_ID[b.type];
  const cost = hireCost(state, t);
  if (state.cash < cost) return no(`招聘费 ¥${cost} 不足`);
  state.cash -= cost;
  b.staff++;
  return yes(`+1 员工（招聘费 ¥${cost}）`);
}
export function fire(state, b) {
  if (b.staff <= 0) return no('没有员工可辞退');
  const t = TYPE_BY_ID[b.type];
  const sev = Math.round(INDUSTRIES[t.ind].wage * 3);
  state.cash -= sev;
  b.staff--;
  b.morale = Math.max(0, b.morale - 5);
  return yes(`-1 员工（遣散费 ¥${sev}，士气小降）`);
}
export function train(state, b) {
  const eff = techEff(state);
  if (b.skill >= eff.trainMax) return no(`技能已达上限 ${eff.trainMax}（研发员工培训体系可提升）`);
  const cost = Math.round(800 * b.skill * b.staff * eff.trainCostMul);
  if (state.cash < cost) return no(`培训费 ¥${cost.toLocaleString()} 不足`);
  state.cash -= cost;
  b.skill = Math.min(eff.trainMax, +(b.skill + 0.5).toFixed(1));
  b.morale = Math.min(100, b.morale + 3);
  return yes(`团队技能 → ${b.skill}（¥${cost.toLocaleString()}）`);
}

// ---------- 科技 ----------
export function startResearch(state, techId) {
  if (state.research) return no(`【${TECHS[state.research.id].name}】研发中，同时只能研发一项`);
  const t = TECHS[techId];
  if (!t) return no('未知科技');
  if (state.techsDone.includes(techId)) return no('已研发完成');
  for (const r of t.req || []) {
    if (!state.techsDone.includes(r)) return no(`需先研发【${TECHS[r].name}】`);
  }
  if (state.cash < t.cost) return no(`研发费 ¥${t.cost.toLocaleString()} 不足`);
  state.cash -= t.cost;
  state.research = { id: techId, left: t.days, total: t.days };
  addLog(state, `🔬 开始研发【${t.name}】（${t.days} 天）`);
  return yes(`研发启动，预计 ${t.days} 天`);
}

// ---------- 营销 ----------
export function startCampaign(state, mkId, targetBiz) {
  const mk = MARKETING.find((m) => m.id === mkId);
  const eff = techEff(state);
  if ((state.mktCd[mkId] || 0) > state.day) return no(`冷却中（还需 ${state.mktCd[mkId] - state.day} 天）`);
  if (state.cash < mk.cost) return no(`费用 ¥${mk.cost.toLocaleString()} 不足`);
  const boost = 1 + eff.mktEff;
  if (mk.scope === 'biz' && !targetBiz) return no('请先在街景中选中一家自己的门店');
  state.cash -= mk.cost;
  state.mktCd[mkId] = state.day + mk.cd;
  state.stats.spentMkt += mk.cost;
  touchStrat(state, 'promo');
  const until = state.day + mk.days;
  switch (mk.id) {
    case 'flyer': {
      const dId = targetBiz ? targetBiz.dist : (state.biz[0] ? state.biz[0].dist : 'old');
      state.fx.push({ k: 'dist', d: dId, m: 1 + 0.15 * boost, until, mkt: 1, label: '传单派发' });
      addLog(state, `📣 在${DIST_BY_ID[dId].name}派发传单（7 天）`);
      return yes(`${DIST_BY_ID[dId].name}客流上升！`);
    }
    case 'radio':
      state.fx.push({ k: 'rev', m: 1 + 0.10 * boost, until, mkt: 1, label: '电台广告' });
      addLog(state, '📻 电台广告投放全城（14 天）');
      return yes('全城需求上升！');
    case 'kol':
      state.fx.push({ k: 'biz', bizId: targetBiz.id, m: 1 + 0.5 * boost, until, mkt: 1, label: '网红探店' });
      targetBiz.rep = Math.min(100, targetBiz.rep + 5);
      addLog(state, `📱 网红探店「${bizName(targetBiz)}」（10 天）`);
      return yes('探店视频火了！');
    case 'sale':
      state.fx.push({ k: 'rev', m: (1 + 0.35 * boost) * 0.9, until, mkt: 1, label: '全城大促' });
      addLog(state, '🛍️ 全城大促开启（7 天）');
      return yes('客流暴涨（让利 10%）');
    case 'billboard':
      state.brand = Math.min(100, state.brand + 15 * boost);
      addLog(state, '🪧 广告牌投放，品牌大幅提升');
      return yes(`品牌 +${Math.round(15 * boost)}`);
  }
  return no('未知活动');
}

// ---------- 金融 ----------
export function takeLoan(state, amt) {
  const max = loanMax(state);
  if (amt <= 0) return no('金额无效');
  if (amt > max) return no(`超出可贷额度 ¥${max.toLocaleString()}`);
  state.loan.bal += amt;
  state.cash += amt;
  state.stats.loanUsed = true;
  addLog(state, `🏦 贷款 ¥${amt.toLocaleString()}（余额 ¥${state.loan.bal.toLocaleString()}）`);
  return yes('贷款到账');
}
export function repayLoan(state, amt) {
  amt = Math.min(amt, state.loan.bal, Math.max(0, state.cash));
  if (amt <= 0) return no('无可还款项（或现金不足）');
  state.loan.bal -= amt;
  state.cash -= amt;
  addLog(state, `🏦 还款 ¥${amt.toLocaleString()}（余额 ¥${state.loan.bal.toLocaleString()}）`);
  return yes('还款成功');
}

export function tradeStock(state, stockIdx, qty) { // qty>0 买入 <0 卖出
  const eff = techEff(state);
  if (!eff.stocks) return no('需先研发【金融牌照】');
  const s = state.stocks[stockIdx];
  if (qty > 0) {
    const cost = s.p * qty * (1 + eff.stockFee);
    if (state.cash < cost) return no(`买入需 ¥${Math.ceil(cost).toLocaleString()}`);
    state.cash -= cost;
    s.cost += s.p * qty;
    s.sh += qty;
    state.stats.boughtStock = true;
    return yes(`买入 ${STOCKS[stockIdx].name} ×${qty}`);
  } else {
    const n = Math.min(-qty, s.sh);
    if (n <= 0) return no('没有持仓');
    const gain = s.p * n * (1 - eff.stockFee);
    const costPart = (s.cost / s.sh) * n;
    state.stats.stockRealized += gain - costPart;
    s.cost -= costPart;
    s.sh -= n;
    state.cash += gain;
    return yes(`卖出 ${STOCKS[stockIdx].name} ×${n}（¥${Math.round(gain).toLocaleString()}）`);
  }
}

// ---------- 收购对手 ----------
export function acquireRival(state, dId, i) {
  const p = state.plots[dId][i];
  if (typeof p.o !== 'number' || !p.rb) return no('这不是对手的门店');
  const t = TYPE_BY_ID[p.rb.type];
  const price = Math.round(t.cost * 1.5 * (1 + 0.55 * (p.rb.level - 1)));
  if (state.cash < price) return no(`收购报价 ¥${price.toLocaleString()}，现金不足`);
  const lock = typeLock(state, t);
  if (lock) return no(`无法运营该业态：${lock}`);
  const rv = state.rivals[p.o];
  rv.biz.splice(rv.biz.indexOf(p.rb), 1);
  rv.cash += price;
  state.cash -= price;
  const b = {
    id: _nextBizId++, type: p.rb.type, dist: dId, plot: i,
    level: p.rb.level, price: 1, supply: 1, wage: 1, digital: 0,
    staff: staffReq(t, p.rb.level), skill: 1.5, morale: 60, rep: 45,
    invested: price, openDay: state.day, promoUntil: 0, closedUntil: 0,
    hist: [], today: null,
  };
  state.biz.push(b);
  state.plots[dId][i] = { o: 'me', b: state.biz.length - 1, rb: null };
  state.stats.openedTypes[p.rb.type] = 1;
  state.stats.acquired++;
  addXp(state, 20);
  addLog(state, `🤝 溢价收购 ${RIVALS[p.o].name} 的「${t.name}」（¥${price.toLocaleString()}）`, 'good');
  return yes('收购完成，门店归入麾下！');
}
export function rivalPrice(p) {
  const t = TYPE_BY_ID[p.rb.type];
  return Math.round(t.cost * 1.5 * (1 + 0.55 * (p.rb.level - 1)));
}

// ---------- 存档 ----------
export function save(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, _nextBizId }));
    return true;
  } catch { return false; }
}
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.v !== 1) return null;
    _nextBizId = s._nextBizId || (Math.max(0, ...s.biz.map((b) => b.id)) + 1);
    delete s._nextBizId;
    // plots 中的 rb 是对手门店的引用副本，反序列化后需重新指回 rivals
    for (const d of Object.keys(s.plots)) {
      for (const p of s.plots[d]) {
        if (typeof p.o === 'number' && p.rb) {
          const rv = s.rivals[p.o];
          const match = rv.biz.find((rb) => rb.dist === d && rb.plot === s.plots[d].indexOf(p));
          p.rb = match || p.rb;
        }
      }
    }
    return s;
  } catch { return null; }
}
export function wipeSave() { localStorage.removeItem(SAVE_KEY); }
