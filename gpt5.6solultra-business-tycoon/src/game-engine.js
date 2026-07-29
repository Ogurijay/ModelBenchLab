import {
  BUSINESS_MODELS, CITY_EVENTS, MARKETING_PLANS, PRICE_PLANS,
  STAFF_PLANS, SUPPLY_PLANS, TECH_PLANS, byId,
} from './game-data.js';

const round = (value) => Math.round(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createInitialState() {
  return {
    day: 1,
    cash: 72000,
    loan: 0,
    reputation: 50,
    cityHeat: 58,
    stores: [],
    ledger: [],
    activeEvent: null,
    eventDays: 0,
    totalRevenue: 0,
    totalProfit: 0,
    peakCash: 72000,
  };
}

export function openStore(state, modelId, lotIndex = 0) {
  const model = BUSINESS_MODELS.find((item) => item.id === modelId);
  if (!model) return { ok: false, reason: '没有找到该商业模式' };
  if (state.cash < model.setupCost) return { ok: false, reason: '启动资金不足' };
  if (state.stores.some((store) => store.lotIndex === lotIndex)) return { ok: false, reason: '这个地块已有门店' };
  const store = {
    id: `store-${state.day}-${lotIndex}-${state.stores.length}`,
    modelId,
    lotIndex,
    name: model.name,
    openedDay: state.day,
    pricePlan: 'fair',
    supplyPlan: 'agile',
    marketingPlan: 'none',
    staffPlan: 'standard',
    techPlan: 'basic',
    revenue: 0,
    profit: 0,
    customers: 0,
    lifetimeProfit: -model.setupCost,
    streak: 0,
  };
  return {
    ok: true,
    state: { ...state, cash: state.cash - model.setupCost, stores: [...state.stores, store] },
    store,
  };
}

export function updateStorePlan(state, storeId, key, value) {
  let extraCost = 0;
  if (key === 'techPlan') {
    const next = byId(TECH_PLANS, value);
    const current = byId(TECH_PLANS, state.stores.find((s) => s.id === storeId)?.techPlan);
    extraCost = Math.max(0, (next?.cost || 0) - (current?.cost || 0));
  }
  if (extraCost > state.cash) return { ok: false, reason: '升级资金不足' };
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - extraCost,
      stores: state.stores.map((store) => store.id === storeId ? { ...store, [key]: value } : store),
    },
  };
}

function maybeEvent(state, random) {
  if (state.eventDays > 1) return { activeEvent: state.activeEvent, eventDays: state.eventDays - 1 };
  if (state.eventDays === 1) return { activeEvent: null, eventDays: 0 };
  if (state.day > 2 && random() < .18) {
    const event = CITY_EVENTS[Math.floor(random() * CITY_EVENTS.length)];
    return { activeEvent: event, eventDays: event.days };
  }
  return { activeEvent: null, eventDays: 0 };
}

export function simulateDay(state, random = Math.random) {
  const eventState = maybeEvent(state, random);
  const event = eventState.activeEvent;
  let dayRevenue = 0;
  let dayProfit = 0;
  let qualitySum = 0;

  const stores = state.stores.map((store) => {
    const model = BUSINESS_MODELS.find((item) => item.id === store.modelId);
    const price = byId(PRICE_PLANS, store.pricePlan);
    const supply = byId(SUPPLY_PLANS, store.supplyPlan);
    const marketing = byId(MARKETING_PLANS, store.marketingPlan);
    const staff = byId(STAFF_PLANS, store.staffPlan);
    const tech = byId(TECH_PLANS, store.techPlan);
    const eventDemand = (event?.demand || 1) * (model.channel.id === 'delivery' ? (event?.delivery || 1) : 1) *
      (['food', 'music'].includes(model.industry.id) ? (event?.night || 1) : 1);
    const maturity = clamp(.72 + (state.day - store.openedDay) * .025, .72, 1.16);
    const noise = .88 + random() * .24;
    const demand = model.industry.demand * model.segment.demand * model.channel.demand * price.demand *
      marketing.demand * tech.demand * staff.capacity * eventDemand * maturity *
      (.72 + state.reputation / 175) * (.82 + state.cityHeat / 300) * noise;
    const customers = Math.max(0, round(demand));
    const ticket = model.industry.ticket * model.segment.ticket * price.multiplier * (event?.ticket || 1);
    const revenue = round(customers * ticket);
    const cogs = revenue * (1 - model.industry.margin) * supply.cost * (event?.cost || 1) * tech.efficiency;
    const channelFee = revenue * model.channel.fee;
    const rent = model.industry.rent;
    const interestShare = state.stores.length ? state.loan * .0008 / state.stores.length : 0;
    const profit = round(revenue - cogs - channelFee - rent - staff.daily - marketing.daily - interestShare);
    const quality = supply.quality * staff.quality * (tech.id === 'ai' ? 1.04 : 1);
    qualitySum += quality;
    dayRevenue += revenue;
    dayProfit += profit;
    return {
      ...store,
      customers,
      revenue,
      profit,
      lifetimeProfit: store.lifetimeProfit + profit,
      streak: profit >= 0 ? store.streak + 1 : 0,
    };
  });

  const avgQuality = stores.length ? qualitySum / stores.length : 1;
  const reputationDelta = stores.length ? (avgQuality - 1) * 2.1 + (dayProfit >= 0 ? .18 : -.12) : 0;
  const reputation = clamp(state.reputation + reputationDelta, 10, 100);
  const cityHeat = clamp(state.cityHeat + (random() - .48) * 3, 25, 95);
  const cash = state.cash + dayProfit;
  const ledgerEntry = { day: state.day, revenue: dayRevenue, profit: dayProfit, cash };

  return {
    ...state,
    day: state.day + 1,
    cash,
    reputation,
    cityHeat,
    stores,
    ledger: [ledgerEntry, ...state.ledger].slice(0, 14),
    activeEvent: eventState.activeEvent,
    eventDays: eventState.eventDays,
    totalRevenue: state.totalRevenue + dayRevenue,
    totalProfit: state.totalProfit + dayProfit,
    peakCash: Math.max(state.peakCash, cash),
  };
}

export function borrow(state) {
  if (state.loan >= 90000) return { ok: false, reason: '信用额度已用尽' };
  return { ok: true, state: { ...state, cash: state.cash + 30000, loan: state.loan + 30000 } };
}

export function repay(state) {
  const amount = Math.min(30000, state.loan, Math.max(0, state.cash));
  if (!amount) return { ok: false, reason: '当前没有可偿还贷款' };
  return { ok: true, state: { ...state, cash: state.cash - amount, loan: state.loan - amount } };
}

export function getAchievements(state) {
  return [
    { name: '第一块招牌', detail: '开出首家门店', done: state.stores.length >= 1 },
    { name: '街区连锁', detail: '同时经营 3 家门店', done: state.stores.length >= 3 },
    { name: '跨界玩家', detail: '布局 3 个不同业态', done: new Set(state.stores.map((s) => s.modelId.split('-')[0])).size >= 3 },
    { name: '百万流水', detail: '累计营收达到 ¥1,000,000', done: state.totalRevenue >= 1000000 },
    { name: '口碑名片', detail: '品牌声誉达到 80', done: state.reputation >= 80 },
  ];
}
