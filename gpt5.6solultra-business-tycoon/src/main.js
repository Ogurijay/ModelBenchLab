import {
  BUSINESS_MODELS, CHANNELS, INDUSTRIES, MARKETING_PLANS, MECHANISMS,
  PRICE_PLANS, STAFF_PLANS, SUPPLY_PLANS, TECH_PLANS,
} from './game-data.js';
import {
  borrow, createInitialState, getAchievements, openStore, repay, simulateDay, updateStorePlan,
} from './game-engine.js';

const STORAGE_KEY = 'pixel-borough-save-v1';
const LOTS = 9;
const money = (value) => `${value < 0 ? '-' : ''}¥${Math.abs(Math.round(value)).toLocaleString('zh-CN')}`;
const percent = (value) => `${Math.round(value)}%`;
const modelById = (id) => BUSINESS_MODELS.find((model) => model.id === id);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.stores) && Number.isFinite(saved.cash)) return saved;
  } catch { /* 新存档将覆盖损坏数据 */ }
  return createInitialState();
}

let state = loadState();
let running = false;
let speed = 1;
let modal = null;
let activeStoreId = null;
let selectedLot = 0;
let selectedModelId = BUSINESS_MODELS[0].id;
let catalogSearch = '';
let catalogIndustry = 'all';
let toastTimer;

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const emptyLots = () => Array.from({ length: LOTS }, (_, i) => i).filter((i) => !state.stores.some((store) => store.lotIndex === i));
const lastDay = () => state.ledger[0] || { revenue: 0, profit: 0 };

function notify(message, tone = 'info') {
  clearTimeout(toastTimer);
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.append(toast);
  }
  toast.dataset.tone = tone;
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function renderTopbar() {
  const day = lastDay();
  return `
    <header class="topbar">
      <div class="brand-block">
        <div class="brand-chip" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div><p class="eyebrow">PIXEL BOROUGH / 街区经营局</p><h1>街区大亨</h1></div>
      </div>
      <div class="metric-strip">
        <div class="metric"><span>可用资金</span><strong class="${state.cash < 0 ? 'negative' : ''}">${money(state.cash)}</strong><small>峰值 ${money(state.peakCash)}</small></div>
        <div class="metric"><span>昨日营收</span><strong>${money(day.revenue)}</strong><small class="${day.profit < 0 ? 'negative' : 'positive'}">净利 ${money(day.profit)}</small></div>
        <div class="metric"><span>品牌声誉</span><strong>${percent(state.reputation)}</strong><div class="mini-bar"><i style="width:${state.reputation}%"></i></div></div>
        <div class="metric"><span>城市热度</span><strong>${percent(state.cityHeat)}</strong><small>${state.cityHeat > 65 ? '消费升温' : state.cityHeat < 40 ? '市场偏冷' : '供需平稳'}</small></div>
      </div>
      <div class="clock-block">
        <div class="calendar"><b>第 ${state.day} 天</b><span>${running ? `营业中 · ${speed}×` : '已暂停 · 可规划'}</span></div>
        <button class="pixel-btn control" data-action="toggle-run" aria-label="${running ? '暂停自动经营' : '开始自动经营'}">${running ? 'Ⅱ 暂停' : '▶ 营业'}</button>
        <button class="pixel-btn control muted" data-action="speed">速度 ${speed}×</button>
        <button class="pixel-btn accent" data-action="next-day">结算一天 →</button>
      </div>
    </header>`;
}

function renderGoals() {
  const goals = getAchievements(state);
  const done = goals.filter((goal) => goal.done).length;
  return `
    <section class="panel goals-panel">
      <div class="panel-title"><span>成长里程碑</span><b>${done}/${goals.length}</b></div>
      <div class="goal-list">
        ${goals.map((goal) => `<div class="goal ${goal.done ? 'done' : ''}"><i>${goal.done ? '✓' : '·'}</i><p><b>${goal.name}</b><span>${goal.detail}</span></p></div>`).join('')}
      </div>
    </section>`;
}

function renderLedger() {
  const items = state.ledger.slice(0, 5);
  return `
    <section class="panel ledger-panel">
      <div class="panel-title"><span>经营账本</span><b>近 5 日</b></div>
      ${items.length ? `<div class="ledger-head"><span>日期</span><span>营收</span><span>净利</span></div>${items.map((row) => `
        <div class="ledger-row"><span>D${row.day}</span><span>${money(row.revenue)}</span><span class="${row.profit >= 0 ? 'positive' : 'negative'}">${money(row.profit)}</span></div>`).join('')}` : '<div class="empty-small">尚无结算记录<br>开店后点击「结算一天」</div>'}
      <div class="finance-box">
        <div><span>商业贷款</span><b>${money(state.loan)}</b></div>
        <div class="finance-actions"><button data-action="borrow">借入 3万</button><button data-action="repay" ${state.loan <= 0 ? 'disabled' : ''}>偿还</button></div>
      </div>
    </section>`;
}

function renderGuideMini() {
  return `
    <section class="panel guide-panel">
      <div class="panel-title"><span>经营机制</span><b>12 类</b></div>
      <div class="mechanism-mini">${MECHANISMS.slice(0, 6).map(([n, name]) => `<span><i>${n}</i>${name}</span>`).join('')}</div>
      <button class="text-btn" data-action="open-guide">查看完整经营手册 →</button>
    </section>`;
}

function buildingMarkup(store) {
  const model = modelById(store.modelId);
  const floors = store.lifetimeProfit > 30000 ? 3 : store.lifetimeProfit > 0 ? 2 : 1;
  return `
    <button class="building floors-${floors}" data-action="select-store" data-store="${store.id}" style="--shop:${model.industry.color}" aria-label="查看${store.name}">
      <span class="roof"><i></i><i></i><i></i></span>
      <span class="facade">
        <span class="sign">${model.industry.mark}</span>
        <span class="windows"><i></i><i></i><i></i><i></i></span>
        <span class="door"></span>
      </span>
      <span class="shop-label"><b>${store.name}</b><em class="${store.profit >= 0 ? 'positive' : 'negative'}">${money(store.profit)}/日</em></span>
    </button>`;
}

function renderCity() {
  const districtLevel = state.stores.length >= 7 ? '繁华商圈' : state.stores.length >= 4 ? '成长街区' : '新兴街区';
  return `
    <section class="city-panel">
      <div class="city-heading">
        <div><p class="eyebrow">BOROUGH 07 / 模拟沙盘</p><h2>${districtLevel}</h2></div>
        <div class="city-status"><span><i class="dot green"></i> ${state.stores.length} 家营业</span><span><i class="dot amber"></i> ${emptyLots().length} 块空地</span></div>
      </div>
      ${state.activeEvent ? `<div class="event-banner ${state.activeEvent.tone}"><span>城市快讯</span><b>${state.activeEvent.title}</b><p>${state.activeEvent.text}</p><em>剩余 ${state.eventDays} 天</em></div>` : ''}
      <div class="city-map" aria-label="像素城市商业地图">
        <div class="road road-h one"><span>BUS 17</span></div><div class="road road-h two"></div>
        <div class="road road-v one"></div><div class="road road-v two"></div>
        <div class="park"><i></i><i></i><i></i><b>社区公园</b></div>
        <div class="tower-bg"><i></i><i></i><i></i><i></i></div>
        ${Array.from({ length: LOTS }, (_, lot) => {
          const store = state.stores.find((item) => item.lotIndex === lot);
          return `<div class="lot lot-${lot}">${store ? buildingMarkup(store) : `<button class="empty-lot" data-action="open-library" data-lot="${lot}"><span>＋</span><b>招租地块 ${lot + 1}</b><em>点击开店</em></button>`}</div>`;
        }).join('')}
        <div class="map-people"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="map-footer"><span>小贴士：点击建筑可调整经营策略</span><button data-action="open-library" ${emptyLots().length ? '' : 'disabled'}>＋ 新开一家店</button></div>
    </section>`;
}

function renderPortfolio() {
  return `
    <section class="panel portfolio-panel">
      <div class="panel-title"><span>我的商业版图</span><b>${state.stores.length}/${LOTS}</b></div>
      <div class="portfolio-scroll">
        ${state.stores.length ? state.stores.map((store) => {
          const model = modelById(store.modelId);
          return `<button class="store-card" data-action="select-store" data-store="${store.id}">
            <span class="store-mark" style="--shop:${model.industry.color}">${model.industry.mark}</span>
            <span class="store-copy"><b>${store.name}</b><em>${model.tagline}</em><small>${store.customers} 位顾客 · 已营 D${state.day - store.openedDay}</small></span>
            <span class="store-money ${store.profit >= 0 ? 'positive' : 'negative'}">${money(store.profit)}</span>
          </button>`;
        }).join('') : `<div class="portfolio-empty"><div class="empty-shop"><i></i><i></i><i></i></div><b>你的街区还没有店铺</b><p>从 144 种商业模式中挑选第一门生意。</p><button class="pixel-btn accent" data-action="open-library">选择商业模式</button></div>`}
      </div>
      ${state.stores.length ? `<button class="wide-dashed" data-action="open-library" ${emptyLots().length ? '' : 'disabled'}>＋ 扩张商业版图</button>` : ''}
    </section>
    <section class="panel pulse-panel">
      <div class="panel-title"><span>资产概览</span><b>LIVE</b></div>
      <div class="asset-grid"><div><span>累计营收</span><b>${money(state.totalRevenue)}</b></div><div><span>累计净利</span><b class="${state.totalProfit >= 0 ? 'positive' : 'negative'}">${money(state.totalProfit)}</b></div><div><span>店均产出</span><b>${money(state.stores.length ? lastDay().revenue / state.stores.length : 0)}</b></div><div><span>模式库存</span><b>144</b></div></div>
    </section>`;
}

function renderTicker() {
  const profitable = state.stores.filter((store) => store.profit > 0).length;
  return `<footer class="ticker"><span class="ticker-label">经营雷达</span><div><i></i> 当前 ${profitable}/${state.stores.length || 0} 家门店盈利　·　贷款日息 0.08%　·　商业模式库已收录 ${BUSINESS_MODELS.length} 种可玩组合</div><button data-action="reset">重开存档</button></footer>`;
}

function filteredModels() {
  const query = catalogSearch.trim().toLowerCase();
  return BUSINESS_MODELS.filter((model) => (catalogIndustry === 'all' || model.industry.id === catalogIndustry) &&
    (!query || `${model.name}${model.tagline}${model.industry.name}`.toLowerCase().includes(query)));
}

function renderCatalog() {
  const models = filteredModels();
  const chosen = modelById(selectedModelId);
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <section class="modal catalog-modal" role="dialog" aria-modal="true" aria-label="商业模式图鉴">
      <header class="modal-head"><div><p class="eyebrow">BUSINESS MODEL ATLAS</p><h2>商业模式图鉴 <span>${BUSINESS_MODELS.length}</span></h2><p>行业 × 核心客群 × 经营渠道，每一种都拥有独立的收益结构。</p></div><button class="icon-btn" data-action="close-modal" aria-label="关闭">×</button></header>
      <div class="catalog-toolbar">
        <label class="search-box"><span>⌕</span><input id="catalog-search" value="${catalogSearch.replaceAll('"', '&quot;')}" placeholder="搜索行业、客群或模式名称…" /></label>
        <div class="industry-tabs"><button class="${catalogIndustry === 'all' ? 'active' : ''}" data-industry="all">全部 ${BUSINESS_MODELS.length}</button>${INDUSTRIES.map((item) => `<button class="${catalogIndustry === item.id ? 'active' : ''}" data-industry="${item.id}">${item.mark} ${item.name}</button>`).join('')}</div>
      </div>
      <div class="catalog-body">
        <div class="model-grid">${models.map((model) => `<button class="model-card ${selectedModelId === model.id ? 'selected' : ''}" data-action="pick-model" data-model="${model.id}">
          <span class="model-icon" style="--shop:${model.industry.color}">${model.industry.mark}</span>
          <span class="model-copy"><b>${model.name}</b><em>${model.tagline}</em><small>${model.industry.desc}</small></span>
          <span class="model-price"><small>启动资金</small><b>${money(model.setupCost)}</b></span>
        </button>`).join('') || '<div class="no-result">没有匹配的商业模式，换个关键词试试。</div>'}</div>
        <aside class="model-preview">
          <span class="preview-mark" style="--shop:${chosen.industry.color}">${chosen.industry.mark}</span><p class="eyebrow">当前方案</p><h3>${chosen.name}</h3><p>${chosen.industry.desc}</p>
          <dl><div><dt>目标客群</dt><dd>${chosen.segment.name}</dd></div><div><dt>核心渠道</dt><dd>${chosen.channel.name}</dd></div><div><dt>基础客单</dt><dd>${money(chosen.industry.ticket * chosen.segment.ticket)}</dd></div><div><dt>基础毛利</dt><dd>${Math.round(chosen.industry.margin * 100)}%</dd></div><div><dt>选定地块</dt><dd>#${selectedLot + 1}</dd></div></dl>
          <div class="capital-check ${state.cash >= chosen.setupCost ? 'ok' : 'bad'}"><span>资金检查</span><b>${money(state.cash)} / ${money(chosen.setupCost)}</b></div>
          <button class="pixel-btn accent confirm-open" data-action="confirm-open" ${state.cash < chosen.setupCost ? 'disabled' : ''}>挂牌开业 · ${money(chosen.setupCost)}</button>
          <small class="risk-note">预计值会受城市热度、定价、营销、人员与随机事件共同影响。</small>
        </aside>
      </div>
    </section>`;
}

const options = (list, selected) => list.map((item) => `<option value="${item.id}" ${selected === item.id ? 'selected' : ''}>${item.name}</option>`).join('');

function renderStoreDrawer() {
  const store = state.stores.find((item) => item.id === activeStoreId);
  if (!store) return '';
  const model = modelById(store.modelId);
  return `
    <div class="modal-backdrop" data-action="close-store"></div>
    <aside class="store-drawer" role="dialog" aria-modal="true" aria-label="门店经营设置">
      <header><span class="store-mark big" style="--shop:${model.industry.color}">${model.industry.mark}</span><div><p class="eyebrow">STORE CONTROL / #${store.lotIndex + 1}</p><h2>${store.name}</h2><span>${model.tagline} · 开业第 ${state.day - store.openedDay} 天</span></div><button class="icon-btn" data-action="close-store">×</button></header>
      <div class="store-kpis"><div><span>今日顾客</span><b>${store.customers}</b></div><div><span>今日营收</span><b>${money(store.revenue)}</b></div><div><span>今日净利</span><b class="${store.profit >= 0 ? 'positive' : 'negative'}">${money(store.profit)}</b></div><div><span>生命周期利润</span><b class="${store.lifetimeProfit >= 0 ? 'positive' : 'negative'}">${money(store.lifetimeProfit)}</b></div></div>
      <div class="strategy-title"><b>经营策略台</b><span>调整后从下一日生效</span></div>
      <div class="strategy-list">
        <label><span><i>04</i><b>价格策略</b><small>平衡客单价与成交量</small></span><select data-plan="pricePlan" data-store="${store.id}">${options(PRICE_PLANS, store.pricePlan)}</select></label>
        <label><span><i>05</i><b>供应方案</b><small>影响成本、品质与风险</small></span><select data-plan="supplyPlan" data-store="${store.id}">${options(SUPPLY_PLANS, store.supplyPlan)}</select></label>
        <label><span><i>06</i><b>人员配置</b><small>控制产能与服务水平</small></span><select data-plan="staffPlan" data-store="${store.id}">${options(STAFF_PLANS, store.staffPlan)}</select></label>
        <label><span><i>07</i><b>营销预算</b><small>付费换取更高客流</small></span><select data-plan="marketingPlan" data-store="${store.id}">${options(MARKETING_PLANS, store.marketingPlan)}</select></label>
        <label><span><i>08</i><b>数字系统</b><small>一次投入，提升效率</small></span><select data-plan="techPlan" data-store="${store.id}">${options(TECH_PLANS, store.techPlan)}</select></label>
      </div>
      <div class="drawer-tip"><b>经营诊断</b><p>${store.profit < 0 ? '门店正在亏损。可以先尝试标准价、精简排班，或降低营销预算。' : store.streak >= 3 ? `已经连续盈利 ${store.streak} 天，可以考虑复制该模式扩张。` : '当前门店已盈利，继续观察 3 天以确认模式稳定性。'}</p></div>
      <button class="pixel-btn accent drawer-next" data-action="next-day">应用策略并结算一天 →</button>
    </aside>`;
}

function renderGuide() {
  return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal guide-modal" role="dialog" aria-modal="true"><header class="modal-head"><div><p class="eyebrow">OPERATOR'S HANDBOOK</p><h2>经营机制手册 <span>12</span></h2><p>每一项机制都会进入逐日结算公式，而非仅作展示。</p></div><button class="icon-btn" data-action="close-modal">×</button></header><div class="mechanism-grid">${MECHANISMS.map(([n, name, desc]) => `<article><i>${n}</i><div><b>${name}</b><p>${desc}</p></div></article>`).join('')}</div><div class="formula-card"><span>每日净利</span><b>客流 × 客单价 − 进货 − 抽佣 − 租金 − 工资 − 营销 − 利息</b><p>声誉、热度、成熟度、事件和随机波动会继续修正客流。你需要用组合，而不是单一数值获胜。</p></div></section>`;
}


function render() {
  document.querySelector('#app').innerHTML = `${renderTopbar()}<main class="game-layout"><aside class="left-rail">${renderGoals()}${renderLedger()}${renderGuideMini()}</aside>${renderCity()}<aside class="right-rail">${renderPortfolio()}</aside></main>${renderTicker()}${modal === 'catalog' ? renderCatalog() : ''}${modal === 'guide' ? renderGuide() : ''}${activeStoreId ? renderStoreDrawer() : ''}`;
}

function advance(days = 1) {
  for (let i = 0; i < days; i += 1) state = simulateDay(state);
  save();
  render();
  if (state.cash < 0) notify('资金已经转负，请及时贷款或调整亏损门店', 'bad');
}

document.addEventListener('click', (event) => {
  const industry = event.target.closest('[data-industry]');
  if (industry) {
    catalogIndustry = industry.dataset.industry;
    render();
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'next-day') { advance(); return; }
  if (action === 'toggle-run') { running = !running; render(); return; }
  if (action === 'speed') { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; render(); return; }
  if (action === 'open-library') {
    const available = emptyLots();
    if (!available.length) { notify('当前街区没有空余地块', 'bad'); return; }
    selectedLot = target.dataset.lot == null ? available[0] : Number(target.dataset.lot);
    modal = 'catalog'; activeStoreId = null; render(); return;
  }
  if (action === 'open-guide') { modal = 'guide'; render(); return; }
  if (action === 'close-modal') { modal = null; render(); return; }
  if (action === 'pick-model') { selectedModelId = target.dataset.model; render(); return; }
  if (action === 'confirm-open') {
    const result = openStore(state, selectedModelId, selectedLot);
    if (!result.ok) { notify(result.reason, 'bad'); return; }
    state = result.state; modal = null; save(); render(); notify(`${result.store.name} 已挂牌开业`, 'good'); return;
  }
  if (action === 'select-store') { activeStoreId = target.dataset.store; modal = null; render(); return; }
  if (action === 'close-store') { activeStoreId = null; render(); return; }
  if (action === 'borrow' || action === 'repay') {
    const result = action === 'borrow' ? borrow(state) : repay(state);
    if (!result.ok) { notify(result.reason, 'bad'); return; }
    state = result.state; save(); render(); notify(action === 'borrow' ? '贷款到账：请留意每日利息' : '已完成一笔还款', 'good'); return;
  }
  if (action === 'reset' && window.confirm('确定清空当前存档并重新创业吗？')) {
    state = createInitialState(); running = false; modal = null; activeStoreId = null; save(); render(); notify('新存档已建立');
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id !== 'catalog-search') return;
  catalogSearch = event.target.value;
  render();
  const input = document.querySelector('#catalog-search');
  input?.focus();
  input?.setSelectionRange(catalogSearch.length, catalogSearch.length);
});

document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-plan]');
  if (!select) return;
  const result = updateStorePlan(state, select.dataset.store, select.dataset.plan, select.value);
  if (!result.ok) { notify(result.reason, 'bad'); render(); return; }
  state = result.state; save(); render(); notify('经营策略已更新', 'good');
});

setInterval(() => { if (running) advance(speed); }, 2200);
render();

window.__TYCOON__ = {
  getState: () => structuredClone(state),
  getModelCount: () => BUSINESS_MODELS.length,
  simulate: (days = 1) => advance(days),
};
