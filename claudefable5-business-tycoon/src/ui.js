// ============================================================
// 像素大亨 — UI 层：顶栏 / 城区页签 / 7 个面板 / 弹窗 / 飘字提示
// 全部事件走 #tabContent 委托（data-act），动作执行后局部刷新。
// ============================================================
import {
  TYPES, TYPE_BY_ID, INDUSTRIES, IND_IDS, DISTRICTS, DIST_BY_ID, TECHS, TECH_BRANCHES,
  MARKETING, STOCKS, RIVALS, GOALS, ACHIEVEMENTS, MECHANICS, SUPPLY_PLANS, WAGE_PLANS,
  DIGITAL_PLANS, LEVEL_XP, LEVEL_PERKS, GOODS, SEASONS, SEASON_ICONS, IND_ICONS, EVENTS,
} from './data.js';
import {
  calDate, techEff, staffReq, hireCost, upgradeCost, landPrice, netWorth, loanMax,
  loanDailyRate, ownedProducers, supplyDisc, countSynergies, resolveChoice,
} from './sim.js';
import * as game from './game.js';

const $ = (s) => document.querySelector(s);
export const fmt = (n) => {
  const neg = n < 0 ? '-' : '';
  n = Math.abs(Math.round(n));
  if (n >= 1e8) return `${neg}¥${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `${neg}¥${(n / 1e4).toFixed(n >= 1e6 ? 0 : 1)}万`;
  return `${neg}¥${n.toLocaleString()}`;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 行业图标 → dataURL（一次生成）
const iconCache = {};
function iconURL(ind, color = '#fff', bg = null) {
  const key = ind + color + bg;
  if (iconCache[key]) return iconCache[key];
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 8;
  const c = cv.getContext('2d');
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, 8, 8); }
  c.fillStyle = color;
  const rows = IND_ICONS[ind];
  for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
    if (rows[r] & (0x80 >> col)) c.fillRect(col, r, 1, 1);
  }
  return (iconCache[key] = cv.toDataURL());
}
const indImg = (ind, cls = 'ico') => `<img class="${cls}" src="${iconURL(ind, INDUSTRIES[ind].pal.s)}" alt="">`;

export class UI {
  constructor(hooks) {
    this.hooks = hooks;           // {getState, refreshAll, onSpeed, onNewGame, save, renderer, selectPlot}
    this.tab = 'manage';
    this.sel = null;              // 当前选中地块下标（当前城区内）
    this.catInd = 'all';
    this.catQ = '';
    this.lastContentAt = 0;
    this._bind();
  }

  get state() { return this.hooks.getState(); }
  get dist() { return this.hooks.renderer.dist; }
  get selPlot() {
    if (this.sel === null) return null;
    return this.state.plots[this.dist][this.sel];
  }

  // ---------- 全量/节流刷新 ----------
  refresh(force = false) {
    this.topbar();
    this.distTabs();
    const now = performance.now();
    const typing = document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName);
    if (force || (now - this.lastContentAt > 900 && !typing && !this._dragging)) {
      this.content();
      this.lastContentAt = now;
    }
  }

  toast(msg, ok = true) {
    if (!msg) return;
    const el = document.createElement('div');
    el.className = `toast ${ok ? '' : 'bad'}`;
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.classList.add('out'), 2300);
    setTimeout(() => el.remove(), 2700);
  }

  act(fn, ...args) { // 动作包装：执行→提示→强刷
    const r = fn(this.state, ...args);
    if (r && r.msg) this.toast(r.msg, r.ok);
    this.hooks.save();
    this.refresh(true);
    return r;
  }

  // ---------- 顶栏 ----------
  topbar() {
    const s = this.state;
    const { y, m, d, season } = calDate(s.day);
    $('#cash').textContent = fmt(s.cash);
    $('#cash').className = `chipv ${s.cash < 0 ? 'red' : ''}`;
    $('#worth').textContent = fmt(s.stats.worth);
    $('#date').textContent = `${y}年${m}月${d}日 ${SEASON_ICONS[season]}`;
    const eco = ['衰退', '平稳', '繁荣'][s.econ.phase];
    const el = $('#econ');
    el.textContent = `${eco} ${s.econ.idx.toFixed(2)}`;
    el.className = `chipv ${s.econ.phase === 0 ? 'red' : s.econ.phase === 2 ? 'green' : ''}`;
    $('#brand').textContent = Math.round(s.brand);
    $('#lvl').textContent = `Lv${s.level}`;
    const next = LEVEL_XP[s.level] || Infinity;
    const prev = LEVEL_XP[s.level - 1] || 0;
    $('#xpbar').style.width = `${next === Infinity ? 100 : Math.min(100, ((s.xp - prev) / (next - prev)) * 100)}%`;
    $('#xpbar').parentElement.title = `XP ${Math.floor(s.xp)} / ${next === Infinity ? 'MAX' : next}`;
  }

  // ---------- 城区页签 ----------
  distTabs() {
    const s = this.state;
    const host = $('#distTabs');
    if (!host.dataset.built) {
      host.innerHTML = DISTRICTS.map((d) => `
        <button class="dtab" data-dist="${d.id}">
          <span class="dname">${d.name}</span>
          <span class="dsub" id="dsub-${d.id}"></span>
        </button>`).join('');
      host.dataset.built = '1';
      host.addEventListener('click', (e) => {
        const b = e.target.closest('.dtab'); if (!b) return;
        const d = DIST_BY_ID[b.dataset.dist];
        if (d.unlock > this.state.level) { this.toast(`【${d.name}】需要大亨等级 Lv${d.unlock}`, false); return; }
        this.hooks.renderer.setView(d.id);
        this.sel = null;
        this.refresh(true);
      });
    }
    for (const d of DISTRICTS) {
      const btn = host.querySelector(`[data-dist="${d.id}"]`);
      const locked = d.unlock > s.level;
      btn.classList.toggle('locked', locked);
      btn.classList.toggle('on', this.dist === d.id);
      $(`#dsub-${d.id}`).textContent = locked ? `🔒 Lv${d.unlock}` : `客流${'★'.repeat(Math.round(d.traffic * 2))} 地价${fmt(landPrice(s, d.id))}`;
    }
  }

  // ---------- 面板路由 ----------
  content() {
    const tabs = ['manage', 'cat', 'tech', 'fin', 'mkt', 'ledger', 'goal'];
    for (const t of tabs) $(`#tab-${t}`).classList.toggle('on', this.tab === t);
    const s = this.state;
    const host = $('#tabContent');
    const html = {
      manage: () => this.rManage(s), cat: () => this.rCatalog(s), tech: () => this.rTech(s),
      fin: () => this.rFin(s), mkt: () => this.rMkt(s), ledger: () => this.rLedger(s), goal: () => this.rGoal(s),
    }[this.tab]();
    host.innerHTML = html;
    // 事后绘制迷你图
    host.querySelectorAll('canvas.spark').forEach((cv) => drawSpark(cv));
    host.querySelectorAll('canvas.bars').forEach((cv) => drawBars(cv));
  }

  // ========== 面板一：经营 ==========
  rManage(s) {
    const p = this.selPlot;
    const d = DIST_BY_ID[this.dist];
    if (!p) { // 未选中：公司速览
      const today = s.ledger[s.ledger.length - 1];
      const rows = s.biz.map((b, bi) => {
        const t = TYPE_BY_ID[b.type];
        const pr = b.today ? b.today.profit : 0;
        return `<div class="row click" data-act="goto" data-bi="${bi}">
          ${indImg(t.ind)}<b>${t.name}</b><span class="dim">${DIST_BY_ID[b.dist].name} Lv${b.level}</span>
          <span class="right ${pr >= 0 ? 'green' : 'red'}">${fmt(pr)}/日</span></div>`;
      }).join('') || '<div class="dim pad">还没有门店 —— 点击街景中带「售」牌的空地买地开店！</div>';
      return `
      <div class="card"><h3>📋 公司速览</h3>
        <div class="kv"><span>门店</span><b>${s.biz.length} 家</b><span>员工</span><b>${s.stats.totalStaff} 人</b></div>
        <div class="kv"><span>昨日净利</span><b class="${today && today.profit >= 0 ? 'green' : 'red'}">${today ? fmt(today.profit) : '—'}</b>
          <span>供应链协同</span><b>${countSynergies(s)} 条</b></div>
      </div>
      <div class="card"><h3>🏪 门店列表</h3>${rows}</div>
      <div class="card dim small">提示：点击街景中的地块查看详情；页签可切换六大城区。</div>`;
    }
    if (p.o === null) { // 可购买
      const price = landPrice(s, this.dist);
      const affs = Object.entries(d.aff || {}).map(([k, v]) => `${INDUSTRIES[k].name}+${Math.round((v - 1) * 100)}%`).join('、');
      return `
      <div class="card"><h3>🗺️ ${d.name} · ${this.sel + 1} 号地块（在售）</h3>
        <div class="kv"><span>地价</span><b>${fmt(price)}</b><span>日物业</span><b>¥${d.upkeep}</b></div>
        <div class="kv"><span>基础客流</span><b>×${d.traffic.toFixed(2)}</b><span>开发度</span><b>${s.plots[this.dist].filter((x) => x.b !== null || x.rb).length}/10</b></div>
        <div class="small dim">行业亲和：${affs || '无'}</div>
        <button class="btn gold big" data-act="buyplot" ${s.cash < price ? 'disabled' : ''}>买下这块地（${fmt(price)}）</button>
        <div class="small dim">地价随城区开发度上涨，早买早划算。</div>
      </div>`;
    }
    if (typeof p.o === 'number') { // 对手门店
      const rb = p.rb, t = TYPE_BY_ID[rb.type], rv = RIVALS[p.o];
      const price = game.rivalPrice(p);
      return `
      <div class="card"><h3>⚔️ 对手门店</h3>
        <div class="row">${indImg(t.ind)}<b>${t.name}</b><span class="dim">Lv${rb.level}</span></div>
        <div class="kv"><span>所属</span><b style="color:${rv.color}">${rv.name}</b><span>风格</span><b>${rv.desc}</b></div>
        <div class="small dim">同城区同行业的对手会瓜分你的市场份额。收购可直接接管门店。</div>
        <button class="btn gold big" data-act="acquire" ${s.cash < price ? 'disabled' : ''}>溢价收购（${fmt(price)}）</button>
      </div>`;
    }
    if (p.b === null) { // 自有空地
      return `
      <div class="card"><h3>🏗️ ${d.name} · ${this.sel + 1} 号地块（已购）</h3>
        <div class="small dim">这块地已是你的资产，挑一门生意开起来吧！</div>
        <button class="btn gold big" data-act="gocat">📖 打开业态图鉴选生意</button>
        <button class="btn" data-act="sellplot">出售地块（${fmt(Math.round(landPrice(s, this.dist) * 0.8))}）</button>
      </div>`;
    }
    // 自有门店控制台
    const b = s.biz[p.b], t = TYPE_BY_ID[b.type], indu = INDUSTRIES[t.ind];
    const eff = techEff(s);
    const req = staffReq(t, b.level);
    const td = b.today;
    const upCost = b.level < 5 ? upgradeCost(t, b.level) : 0;
    const prod = ownedProducers(s);
    const disc = supplyDisc(s, t, eff, prod);
    const factorChips = td && td.f ? [
      ['客流', td.f.distT * td.f.aff], ['季节', td.f.sea], ['价格', td.f.qPrice], ['声望', td.f.repM],
      ['人效', td.f.staffM * td.f.skillM * td.f.moraleM], ['份额', td.share], ['宏观', td.f.econM],
    ].map(([k, v]) => `<span class="fchip ${v >= 1 ? 'up' : 'dn'}">${k}×${v.toFixed(2)}</span>`).join('') : '';
    return `
    <div class="card"><h3>${indImg(t.ind)} ${t.name} <span class="lv">Lv${b.level}</span>
      ${b.closedUntil > s.day ? '<span class="red">（停业中）</span>' : ''}</h3>
      <div class="small dim">${d.name} · 开业 ${s.day - b.openDay} 天 · ${indu.name}${t.mk ? ` · 产出【${GOODS[t.mk]}】` : ''}${t.nd ? ` · 需【${t.nd.map((g) => GOODS[g]).join('/')}】${disc < 1 ? `<b class="green">协同降本${Math.round((1 - disc) * 100)}%</b>` : ''}` : ''}</div>
      ${td ? `<table class="pl"><tr><td>营收</td><td class="right">${fmt(td.rev)}</td><td>材料</td><td class="right red">-${fmt(td.mat)}</td></tr>
      <tr><td>工资</td><td class="right red">-${fmt(td.wage)}</td><td>物业</td><td class="right red">-${fmt(td.up)}</td></tr>
      ${td.comm ? `<tr><td>平台佣金</td><td class="right red">-${fmt(td.comm)}</td><td></td><td></td></tr>` : ''}
      <tr class="sum"><td>今日净利</td><td class="right ${td.profit >= 0 ? 'green' : 'red'}" colspan="3">${fmt(td.profit)}${td.qty >= td.cap - 0.01 ? ' ⚠️满负荷' : ''}</td></tr></table>
      <div class="fchips">${factorChips}</div>` : '<div class="dim small pad">明日起产生经营数据</div>'}
      <canvas class="spark" data-vals="${b.hist.join(',')}" width="150" height="26"></canvas><span class="small dim"> 近${b.hist.length}日利润</span>
    </div>
    <div class="card"><h3>🎛️ 经营策略</h3>
      <div class="srow"><span>定价 <b id="priceLab">${Math.round(b.price * 100)}%</b></span>
        <input type="range" id="priceSlide" min="60" max="160" step="5" value="${Math.round(b.price * 100)}">
      </div>
      <div class="small dim">弹性 ${indu.elast}：提价增毛利但流失客量${indu.elast > 1.2 ? '（本行业对价格敏感）' : indu.elast < 0.9 ? '（本行业客户不差钱）' : ''}</div>
      <div class="srow"><span>供应</span><div class="seg">${SUPPLY_PLANS.map((sp, i) =>
        `<button class="${b.supply === i ? 'on' : ''}" data-act="supply" data-i="${i}" title="材料成本×${sp.mat} 声望${sp.rep >= 0 ? '+' : ''}${sp.rep}/日">${sp.name}</button>`).join('')}</div></div>
      <div class="srow"><span>薪酬</span><div class="seg">${WAGE_PLANS.map((wp, i) =>
        `<button class="${b.wage === i ? 'on' : ''}" data-act="wage" data-i="${i}" title="工资×${wp.mul} 士气${wp.morale >= 0 ? '+' : ''}${wp.morale}/日">${wp.name}</button>`).join('')}</div></div>
      <div class="srow"><span>数字化</span><div class="seg">${DIGITAL_PLANS.map((dp, i) => {
        const locked = dp.tech && eff.digital < i;
        return `<button class="${b.digital === i ? 'on' : ''} ${locked ? 'lock' : ''}" data-act="digital" data-i="${i}" title="${dp.desc}${locked ? `（需研发【${TECHS[dp.tech].name}】）` : ''}">${dp.name}</button>`;
      }).join('')}</div></div>
      <button class="btn" data-act="promo" ${b.promoUntil > s.day ? 'disabled' : ''}>
        ${b.promoUntil > s.day ? `促销中（剩 ${b.promoUntil - s.day} 天）` : '🎉 门店促销：7 天客量 +30%（¥1,200）'}</button>
    </div>
    <div class="card"><h3>👥 团队（${b.staff}/${req}${b.staff < req ? ' <span class="red">缺人!</span>' : ''}）</h3>
      <div class="srow"><span>员工</span>
        <button class="btn sm" data-act="hire">+1 招聘 ¥${hireCost(s, t)}</button>
        <button class="btn sm" data-act="fire">-1 辞退</button></div>
      <div class="srow"><span>技能 <b>${b.skill.toFixed(1)}</b>/${eff.trainMax}</span>
        <button class="btn sm" data-act="train">📚 培训 ¥${Math.round(800 * b.skill * b.staff * eff.trainCostMul).toLocaleString()}</button></div>
      <div class="meter"><span>士气</span><div class="bar"><i style="width:${b.morale}%;background:${b.morale > 60 ? '#5fc46a' : b.morale > 30 ? '#e8b93f' : '#e05555'}"></i></div><b>${Math.round(b.morale)}</b></div>
      <div class="meter"><span>声望</span><div class="bar"><i style="width:${b.rep}%;background:#5fb3ff"></i></div><b>${Math.round(b.rep)}</b></div>
    </div>
    <div class="card">
      ${b.level < 5 ? `<button class="btn gold big" data-act="upgrade" ${s.cash < upCost ? 'disabled' : ''}>⬆️ 升级 Lv${b.level + 1}（${fmt(upCost)}）容量+32% 品质+7%</button>`
        : '<div class="small green">已满级 Lv5 ⭐⭐⭐⭐⭐</div>'}
      <button class="btn danger" data-act="sellbiz">转让门店（回收 ${fmt(Math.round(b.invested * 0.5 + b.rep * 100))}）</button>
    </div>`;
  }

  // ========== 面板二：图鉴 ==========
  rCatalog(s) {
    const eff = techEff(s);
    const unlockedN = game.unlockedCount(s);
    const openedN = Object.keys(s.stats.openedTypes).length;
    const chips = ['all', ...IND_IDS].map((k) => {
      const locked = k !== 'all' && !eff.inds.has(k);
      return `<button class="chip ${this.catInd === k ? 'on' : ''} ${locked ? 'lock' : ''}" data-act="catind" data-i="${k}">
        ${k === 'all' ? '全部' : INDUSTRIES[k].name}${locked ? '🔒' : ''}</button>`;
    }).join('');
    const q = this.catQ.trim();
    const list = TYPES.filter((t) => (this.catInd === 'all' || t.ind === this.catInd) && (!q || t.name.includes(q)));
    const selOk = this.selPlot && this.selPlot.o === 'me' && this.selPlot.b === null;
    const prod = ownedProducers(s);
    const rows = list.map((t) => {
      const lock = game.typeLock(s, t);
      const indu = INDUSTRIES[t.ind];
      const owned = s.biz.filter((b) => b.type === t.id).length;
      const cost = Math.round(t.cost * (owned > 0 ? eff.openSameMul : 1));
      // 粗估日利润（标准策略、雇满、老城区）
      const est = t.rev * 0.92 * (1 - indu.mat * supplyDisc(s, t, eff, prod)) - staffReq(t, 1) * indu.wage - 35;
      const pb = est > 0 ? Math.ceil(cost / est) : '∞';
      const seaPeak = (t.sea || indu.sea).indexOf(Math.max(...(t.sea || indu.sea)));
      const tags = [
        t.mk ? `<span class="tag mk">产${GOODS[t.mk]}</span>` : '',
        t.nd ? `<span class="tag nd">需${t.nd.map((g) => GOODS[g]).join('·')}</span>` : '',
        Math.max(...(t.sea || indu.sea)) > 1.15 ? `<span class="tag">旺季${SEASONS[seaPeak]}</span>` : '',
      ].join('');
      return `<div class="trow ${lock ? 'locked' : ''}">
        ${indImg(t.ind)}
        <div class="tmain"><b>${t.name}</b><span class="stars">${'★'.repeat(t.tier)}</span>${owned ? `<span class="own">在营${owned}</span>` : ''}
          <div class="small dim">${indu.name} · 成本${fmt(cost)} · 基准${fmt(t.rev)}/日 · ${t.staff}人 · 回本约${pb}天</div>
          <div>${tags}</div></div>
        ${lock ? `<span class="lockwhy">${lock}</span>`
          : `<button class="btn sm gold" data-act="open" data-t="${t.id}" ${!selOk || s.cash < cost ? 'disabled' : ''}
              title="${!selOk ? '先在街景选中一块自己的空地' : s.cash < cost ? '现金不足' : ''}">开店</button>`}
      </div>`;
    }).join('');
    return `
    <div class="card sticky"><h3>📖 业态图鉴 <span class="dim small">已解锁 ${unlockedN}/${TYPES.length} · 经营过 ${openedN} 种</span></h3>
      <div class="chips">${chips}</div>
      <input id="catQ" placeholder="🔍 搜索业态名…" value="${esc(this.catQ)}">
      ${!selOk ? '<div class="small warn">⚠️ 开店前请先在街景中选中一块「已购空地」（蓝色招商围挡）</div>' : `<div class="small green">✅ 已选中 ${DIST_BY_ID[this.dist].name} ${this.sel + 1} 号空地，点击业态即可开店</div>`}
    </div>
    <div class="tlist">${rows}</div>`;
  }

  // ========== 面板三：科技 ==========
  rTech(s) {
    const r = s.research;
    const head = r ? `<div class="card"><h3>🔬 研发中：${TECHS[r.id].name}</h3>
      <div class="bar big"><i style="width:${((r.total - r.left) / r.total) * 100}%"></i></div>
      <div class="small dim">剩余 ${r.left} 天</div></div>`
      : '<div class="card dim small">同时只能研发一项科技。选择下方项目开始研发。</div>';
    const branches = Object.entries(TECH_BRANCHES).map(([bid, bname]) => {
      const cards = Object.entries(TECHS).filter(([, t]) => t.branch === bid).map(([id, t]) => {
        const done = s.techsDone.includes(id);
        const researching = r && r.id === id;
        const reqMiss = (t.req || []).filter((x) => !s.techsDone.includes(x));
        const cls = done ? 'done' : researching ? 'doing' : reqMiss.length ? 'locked' : '';
        return `<div class="tech ${cls}">
          <b>${t.name}</b><span class="right">${done ? '✅' : researching ? '⏳' : `${fmt(t.cost)}·${t.days}天`}</span>
          <div class="small dim">${t.desc}${reqMiss.length ? `<br>前置：${reqMiss.map((x) => TECHS[x].name).join('、')}` : ''}</div>
          ${!done && !researching && !reqMiss.length ? `<button class="btn sm" data-act="research" data-t="${id}" ${s.cash < t.cost || r ? 'disabled' : ''}>研发</button>` : ''}
        </div>`;
      }).join('');
      return `<div class="card"><h3>${bname}</h3><div class="techgrid">${cards}</div></div>`;
    }).join('');
    return head + branches;
  }

  // ========== 面板四：金融 ==========
  rFin(s) {
    const eff = techEff(s);
    const rate = (loanDailyRate(s, eff) * 30 * 100).toFixed(2);
    const max = loanMax(s);
    const stockRows = eff.stocks ? s.stocks.map((st, i) => {
      const def = STOCKS[i];
      const prev = st.hist.length > 1 ? st.hist[st.hist.length - 2] : st.p;
      const chg = ((st.p - prev) / prev) * 100;
      const pl = st.sh ? st.sh * st.p - st.cost : 0;
      return `<div class="srow stock">
        <div class="tmain"><b>${def.name}</b> <span class="${chg >= 0 ? 'green' : 'red'}">¥${st.p.toFixed(2)} ${chg >= 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(1)}%</span>
          <canvas class="spark" data-vals="${st.hist.join(',')}" data-line="1" width="90" height="18"></canvas>
          ${st.sh ? `<div class="small dim">持仓${st.sh} 浮盈<span class="${pl >= 0 ? 'green' : 'red'}">${fmt(pl)}</span></div>` : ''}</div>
        <div class="seg"><button data-act="stock" data-i="${i}" data-q="10">买10</button><button data-act="stock" data-i="${i}" data-q="100">买100</button>
        <button data-act="stock" data-i="${i}" data-q="-100">卖100</button><button data-act="stock" data-i="${i}" data-q="-999999">清仓</button></div>
      </div>`;
    }).join('') : `<div class="dim pad small">🔒 股票市场需研发【金融牌照】（产业与金融分支）</div>`;
    const totalPl = s.stocks.reduce((a, st) => a + (st.sh ? st.sh * st.p - st.cost : 0), 0);
    return `
    <div class="card"><h3>🏦 银行信贷</h3>
      <div class="kv"><span>信用分</span><b>${s.loan.credit}</b><span>月息</span><b>${rate}%</b></div>
      <div class="kv"><span>贷款余额</span><b class="${s.loan.bal ? 'red' : ''}">${fmt(s.loan.bal)}</b><span>可贷额度</span><b>${fmt(max)}</b></div>
      <div class="seg wide">
        <button data-act="loan" data-q="10000">借¥1万</button><button data-act="loan" data-q="50000">借¥5万</button>
        <button data-act="loan" data-q="${max}">借上限</button>
        <button data-act="repay" data-q="10000">还¥1万</button><button data-act="repay" data-q="999999999">还清</button>
      </div>
      <div class="small dim">额度随净资产增长；月内现金不透支信用分+8，透支-25。信用影响利率。</div>
    </div>
    <div class="card"><h3>📈 股票市场 ${eff.stocks ? `<span class="small dim">手续费${(eff.stockFee * 100).toFixed(1)}% · 季度分红</span>` : ''}</h3>
      ${eff.stocks ? `<div class="kv"><span>持仓浮盈</span><b class="${totalPl >= 0 ? 'green' : 'red'}">${fmt(totalPl)}</b><span>已实现</span><b class="${s.stats.stockRealized >= 0 ? 'green' : 'red'}">${fmt(s.stats.stockRealized)}</b></div>` : ''}
      ${stockRows}
    </div>`;
  }

  // ========== 面板五：营销 ==========
  rMkt(s) {
    const eff = techEff(s);
    const selBiz = this.selPlot && this.selPlot.b !== null ? s.biz[this.selPlot.b] : null;
    const active = s.fx.filter((f) => f.mkt).map((f) => `<span class="tag">${f.label}·剩${f.until - s.day}天</span>`).join('') || '<span class="dim small">暂无进行中的活动</span>';
    const cards = MARKETING.map((m) => {
      const cd = (s.mktCd[m.id] || 0) - s.day;
      const needBiz = m.scope === 'biz' && !selBiz;
      return `<div class="card mk"><b>${m.name}</b><span class="right">${fmt(m.cost)}</span>
        <div class="small dim">${m.desc}${eff.mktEff ? `（广告学加成 +${Math.round(eff.mktEff * 100)}%）` : ''}</div>
        <button class="btn sm ${cd > 0 ? '' : 'gold'}" data-act="mkt" data-i="${m.id}" ${cd > 0 || s.cash < m.cost || needBiz ? 'disabled' : ''}>
          ${cd > 0 ? `冷却 ${cd} 天` : needBiz ? '先选中自家门店' : '投放'}</button>
      </div>`;
    }).join('');
    return `
    <div class="card"><h3>📣 品牌 <b>${Math.round(s.brand)}</b>/100</h3>
      <div class="bar big"><i style="width:${s.brand}%;background:#e8a52f"></i></div>
      <div class="small dim">品牌放大全城需求（×${(1 + s.brand / 250).toFixed(2)}）。活动期间品牌上涨，闲置时缓慢衰减。</div>
      <div class="small">进行中：${active}</div>
    </div>${cards}`;
  }

  // ========== 面板六：账本 ==========
  rLedger(s) {
    const { m } = calDate(s.day);
    const today = s.ledger[s.ledger.length - 1];
    const mtd = s.ledger.filter((e) => calDate(e.day).m === m && e.day > s.day - 31);
    const sum = (k) => mtd.reduce((a, e) => a + e[k], 0);
    const byInd = {};
    for (const b of s.biz) {
      if (!b.today) continue;
      const ind = TYPE_BY_ID[b.type].ind;
      byInd[ind] = (byInd[ind] || 0) + b.today.rev;
    }
    const maxRev = Math.max(1, ...Object.values(byInd));
    const indBars = Object.entries(byInd).sort((a, z) => z[1] - a[1]).map(([ind, v]) => `
      <div class="meter"><span>${INDUSTRIES[ind].name}</span><div class="bar"><i style="width:${(v / maxRev) * 100}%;background:${INDUSTRIES[ind].pal.s}"></i></div><b>${fmt(v)}</b></div>`).join('')
      || '<div class="dim small">暂无营收</div>';
    const logs = [...s.log].reverse().slice(0, 60).map((l) => {
      const dt = calDate(l.day);
      return `<div class="logln ${l.cls || ''}"><span class="dim">${dt.y}/${dt.m}/${dt.d}</span> ${l.txt}</div>`;
    }).join('');
    const T = (label, v, neg) => `<tr><td>${label}</td><td class="right ${neg ? 'red' : ''}">${neg && v > 0 ? '-' : ''}${fmt(v)}</td></tr>`;
    return `
    <div class="card"><h3>📒 今日账目</h3>
      ${today ? `<table class="pl">${T('营业收入', today.rev)}${T('材料成本', today.mat, 1)}${T('人力工资', today.wage, 1)}${T('物业维护', today.up, 1)}${today.comm ? T('平台佣金', today.comm, 1) : ''}${today.int ? T('贷款利息', today.int, 1) : ''}
      <tr class="sum"><td>净利润</td><td class="right ${today.profit >= 0 ? 'green' : 'red'}">${fmt(today.profit)}</td></tr></table>` : '<div class="dim small">尚无数据</div>'}
    </div>
    <div class="card"><h3>📅 本月累计（${m}月）</h3>
      <div class="kv"><span>收入</span><b>${fmt(sum('rev'))}</b><span>净利</span><b class="${sum('profit') >= 0 ? 'green' : 'red'}">${fmt(sum('profit'))}</b></div>
      <div class="kv"><span>上月净利</span><b>${fmt(s.stats.lastMonthProfit)}</b><span>累计净利</span><b>${fmt(s.stats.cumProfit)}</b></div>
      <canvas class="bars" data-vals="${s.ledger.slice(-30).map((e) => Math.round(e.profit)).join(',')}" width="300" height="46"></canvas>
      <div class="small dim">近 ${Math.min(30, s.ledger.length)} 日利润</div>
    </div>
    <div class="card"><h3>💼 净资产 ${fmt(s.stats.worth)}</h3>
      <canvas class="spark" data-vals="${s.worthHist.join(',')}" data-line="1" width="300" height="34"></canvas>
      <h3 class="mt">🏭 今日行业营收</h3>${indBars}
    </div>
    <div class="card"><h3>📜 经营日志</h3><div class="loglist">${logs}</div></div>`;
  }

  // ========== 面板七：目标 ==========
  rGoal(s) {
    const g = GOALS[s.goalIdx];
    const doneList = GOALS.slice(0, s.goalIdx).map((x) => `<div class="row dim">✅ ${x.name}</div>`).join('');
    const nexts = GOALS.slice(s.goalIdx + 1, s.goalIdx + 3).map((x) => `<div class="row dim">🔒 ${x.name}</div>`).join('');
    const achs = ACHIEVEMENTS.map((a) => {
      const done = s.achDone.includes(a.id);
      return `<div class="ach ${done ? 'done' : ''}" title="${a.desc}"><b>${done ? '🏆' : '🔒'} ${a.name}</b><div class="small dim">${a.desc}</div></div>`;
    }).join('');
    const perks = LEVEL_PERKS.slice(1).map((p, i) => `<div class="row ${s.level > i ? '' : 'dim'}">Lv${i + 1} ${p}${s.level > i ? ' ✓' : ''}</div>`).join('');
    return `
    <div class="card gold-b"><h3>🎯 当前目标${s.goalIdx >= GOALS.length ? '（已全部完成！）' : `（${s.goalIdx + 1}/${GOALS.length}）`}</h3>
      ${g ? `<b class="big">${g.name}</b><div>${g.desc}</div><div class="small green">奖励：${g.cash ? fmt(g.cash) + ' + ' : ''}${g.xp} XP</div>` : '<div class="green">恭喜通关！继续经营你的商业帝国吧。</div>'}
      ${nexts}
    </div>
    <div class="card"><h3>📈 大亨等级 Lv${s.level} <span class="small dim">XP ${Math.floor(s.xp)}</span></h3>${perks}</div>
    <div class="card"><h3>🏆 成就（${s.achDone.length}/${ACHIEVEMENTS.length}）</h3><div class="achgrid">${achs}</div></div>
    ${doneList ? `<div class="card"><h3>✅ 已完成目标</h3>${doneList}</div>` : ''}
    <div class="card"><button class="btn" data-act="help">📕 玩法说明（15 项商业机制）</button></div>`;
  }

  // ---------- 弹窗 ----------
  modal(html, noClose = false) {
    $('#modal').classList.add('show');
    $('#modalBox').innerHTML = html + (noClose ? '' : '<button class="btn" data-act="closemodal">关闭</button>');
  }
  closeModal() { $('#modal').classList.remove('show'); }

  showChoice(s) {
    const ev = EVENTS.find((e) => e.id === s.pending.id);
    this.modal(`
      <h2>❗ ${ev.name}</h2><p>${ev.desc}</p>
      <button class="btn gold big" data-act="choice" data-k="a">${ev.choice.a.label}<span class="small block dim">${ev.choice.a.note}</span></button>
      <button class="btn big" data-act="choice" data-k="b">${ev.choice.b.label}<span class="small block dim">${ev.choice.b.note}</span></button>
    `, true);
  }
  showHelp() {
    const mech = MECHANICS.map((m, i) => `<div class="row"><b>${i + 1}. ${m.n}</b><div class="small dim">${m.d}</div></div>`).join('');
    this.modal(`<h2>📕 玩法说明</h2>
      <p class="small">买地 → 开店 → 雇人 → 调策略 → 逐日结算盈亏 → 研发/营销/融资 → 扩张连锁，直至净资产 ¥1000 万。</p>
      <p class="small dim">快捷键：空格暂停/继续，1/2/3 调速。每月自动存档，也可点顶栏 💾。</p>
      <h3>15 项进入结算的商业机制</h3>${mech}`);
  }
  showOver(win) {
    this.modal(win
      ? `<h2>🏆 城市传奇！</h2><p>净资产突破 ¥1000 万，你已是名副其实的像素大亨！游戏进入无尽模式，继续书写商业传奇。</p>`
      : `<h2>💥 破产清算</h2><p>现金长期严重透支，银行接管了你的资产……</p>
         <button class="btn gold big" data-act="newgame">重新开始</button>`, !win);
  }

  // ---------- 事件绑定 ----------
  _bind() {
    // 面板页签
    document.querySelectorAll('.ptab').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab;
      this.content();
      document.querySelectorAll('.ptab').forEach((x) => x.classList.toggle('on', x === b));
    }));
    // 内容区委托
    $('#tabContent').addEventListener('click', (e) => this._dispatch(e));
    $('#modalBox').addEventListener('click', (e) => this._dispatch(e));
    $('#tabContent').addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'priceSlide') {
        this._dragging = true;
        const p = this.selPlot;
        if (p && p.b !== null) {
          game.setPrice(this.state, this.state.biz[p.b], +t.value / 100);
          $('#priceLab').textContent = `${t.value}%`;
        }
      } else if (t.id === 'catQ') {
        this.catQ = t.value;
        clearTimeout(this._qT);
        this._qT = setTimeout(() => { const el = $('#catQ'); const pos = el.selectionStart; this.content(); const el2 = $('#catQ'); el2.focus(); el2.setSelectionRange(pos, pos); }, 250);
      }
    });
    $('#tabContent').addEventListener('change', () => { this._dragging = false; this.hooks.save(); });
    $('#tabContent').addEventListener('pointerup', () => { this._dragging = false; });
  }

  _dispatch(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const s = this.state;
    const act = el.dataset.act;
    const p = this.selPlot;
    const b = p && p.b !== null ? s.biz[p.b] : null;
    switch (act) {
      case 'buyplot': this.act(game.buyPlot, this.dist, this.sel); break;
      case 'sellplot': this.act(game.sellPlot, this.dist, this.sel); break;
      case 'gocat': this.tab = 'cat'; this.content(); this._syncTabBtns(); break;
      case 'open': this.act(game.openBiz, this.dist, this.sel, el.dataset.t); break;
      case 'sellbiz': if (b) { this.act(game.sellBiz, b); } break;
      case 'upgrade': if (b) this.act(game.upgradeBiz, b); break;
      case 'supply': if (b) this.act(game.setSupply, b, +el.dataset.i); break;
      case 'wage': if (b) this.act(game.setWage, b, +el.dataset.i); break;
      case 'digital': if (b) this.act(game.setDigital, b, +el.dataset.i); break;
      case 'promo': if (b) this.act(game.promoBiz, b); break;
      case 'hire': if (b) this.act(game.hire, b); break;
      case 'fire': if (b) this.act(game.fire, b); break;
      case 'train': if (b) this.act(game.train, b); break;
      case 'research': this.act(game.startResearch, el.dataset.t); break;
      case 'mkt': this.act(game.startCampaign, el.dataset.i, b); break;
      case 'loan': this.act(game.takeLoan, +el.dataset.q); break;
      case 'repay': this.act(game.repayLoan, +el.dataset.q); break;
      case 'stock': this.act(game.tradeStock, +el.dataset.i, +el.dataset.q); break;
      case 'acquire': this.act(game.acquireRival, this.dist, this.sel); break;
      case 'catind': this.catInd = el.dataset.i; this.content(); break;
      case 'goto': {
        const bz = s.biz[+el.dataset.bi];
        if (bz) { this.hooks.renderer.setView(bz.dist); this.sel = bz.plot; this.tab = 'manage'; this._syncTabBtns(); this.refresh(true); }
        break;
      }
      case 'choice': resolveChoice(s, el.dataset.k); this.closeModal(); this.hooks.onChoiceDone(); this.refresh(true); break;
      case 'help': this.showHelp(); break;
      case 'closemodal': this.closeModal(); break;
      case 'newgame': this.closeModal(); this.hooks.onNewGame(); break;
    }
  }
  _syncTabBtns() {
    document.querySelectorAll('.ptab').forEach((x) => x.classList.toggle('on', x.dataset.tab === this.tab));
  }

  selectPlot(i) {
    this.sel = i;
    if (this.tab !== 'manage' && this.tab !== 'cat') { this.tab = 'manage'; this._syncTabBtns(); }
    this.refresh(true);
  }

  tooltip(i, ev) {
    const tip = $('#tip');
    if (i < 0 || i === null) { tip.style.display = 'none'; return; }
    const s = this.state;
    const p = s.plots[this.dist][i];
    let html;
    if (p.b !== null && s.biz[p.b]) {
      const b = s.biz[p.b], t = TYPE_BY_ID[b.type];
      html = `<b>${t.name}</b> Lv${b.level}<br>今日 ${b.today ? fmt(b.today.profit) : '—'} · 声望 ${Math.round(b.rep)}`;
    } else if (p.rb) {
      html = `<b style="color:${RIVALS[p.o].color}">${RIVALS[p.o].name}</b><br>${TYPE_BY_ID[p.rb.type].name} Lv${p.rb.level}（可收购）`;
    } else if (p.o === 'me') html = '<b>自有空地</b><br>点击后去图鉴开店';
    else html = `<b>在售地块</b><br>地价 ${fmt(landPrice(s, this.dist))}`;
    tip.innerHTML = html;
    tip.style.display = 'block';
    const wrap = $('#canvasWrap').getBoundingClientRect();
    tip.style.left = `${Math.min(ev.clientX - wrap.left + 14, wrap.width - 150)}px`;
    tip.style.top = `${ev.clientY - wrap.top + 10}px`;
  }
}

// ---------- 迷你图 ----------
function drawSpark(cv) {
  const vals = (cv.dataset.vals || '').split(',').map(Number).filter((v) => !Number.isNaN(v));
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  if (vals.length < 2) return;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  c.strokeStyle = vals[vals.length - 1] >= vals[0] ? '#5fc46a' : '#e05555';
  c.lineWidth = 1;
  c.beginPath();
  vals.forEach((v, i) => {
    const x = (i / (vals.length - 1)) * (cv.width - 2) + 1;
    const y = cv.height - 2 - ((v - min) / span) * (cv.height - 4);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  });
  c.stroke();
}
function drawBars(cv) {
  const vals = (cv.dataset.vals || '').split(',').map(Number).filter((v) => !Number.isNaN(v));
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  if (!vals.length) return;
  const max = Math.max(1, ...vals.map(Math.abs));
  const w = Math.max(2, Math.floor(cv.width / vals.length) - 1);
  const mid = cv.height / 2;
  vals.forEach((v, i) => {
    const h = Math.max(1, (Math.abs(v) / max) * (mid - 2));
    c.fillStyle = v >= 0 ? '#5fc46a' : '#e05555';
    c.fillRect(i * (w + 1), v >= 0 ? mid - h : mid, w, h);
  });
  c.strokeStyle = 'rgba(255,255,255,.25)';
  c.beginPath(); c.moveTo(0, mid); c.lineTo(cv.width, mid); c.stroke();
}
