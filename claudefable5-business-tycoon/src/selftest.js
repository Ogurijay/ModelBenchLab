// ============================================================
// 像素大亨 — 内置确定性自测（?selftest=1）
// 在独立 state 上验证数据完整性与 15 项机制的结算正确性，
// 不触碰玩家存档。结果输出 console.table + 右下角徽章 + window.__SELFTEST__。
// ============================================================
import {
  TYPES, INDUSTRIES, GOODS, MECHANICS, EVENTS, TECHS, DISTRICTS, PLOTS_PER_DIST, GOALS,
} from './data.js';
import {
  newGame, dayTick, calcBiz, techEff, ownedProducers, supplyDisc, resolveChoice, staffReq,
} from './sim.js';
import * as game from './game.js';
import { TYPE_BY_ID } from './data.js';

const results = [];
function check(name, fn) {
  try {
    const info = fn();
    results.push({ 项目: name, 结果: '✅', 详情: info || '' });
  } catch (e) {
    results.push({ 项目: name, 结果: '❌', 详情: e.message });
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

function deepFinite(obj, path = '') {
  if (typeof obj === 'number') { assert(Number.isFinite(obj), `非有限数值 @${path}: ${obj}`); return; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => deepFinite(v, `${path}[${i}]`)); return; }
  if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) {
      if (k === 'inds') continue;
      deepFinite(obj[k], `${path}.${k}`);
    }
  }
}

// 便捷：搭一个已有门店的测试局
function rig(seed = 424242) {
  const s = newGame(seed);
  s.cash = 500000;
  game.buyPlot(s, 'old', 0);
  game.openBiz(s, 'old', 0, 'milktea');
  const b = s.biz[0];
  b.staff = staffReq(TYPE_BY_ID.milktea, 1);
  return s;
}

export function runSelfTest() {
  // 1. 业态数据完整性
  check('数据：121 种业态', () => {
    assert(TYPES.length >= 100, `业态仅 ${TYPES.length} 种，不足 100`);
    const ids = new Set();
    for (const t of TYPES) {
      assert(!ids.has(t.id), `重复 id ${t.id}`); ids.add(t.id);
      assert(INDUSTRIES[t.ind], `行业不存在 ${t.ind}`);
      assert(t.cost > 0 && t.rev > 0 && t.staff >= 1, `数值非法 ${t.id}`);
      for (const g of t.nd || []) assert(GOODS[g], `${t.id} 需求货品非法 ${g}`);
      if (t.mk) assert(GOODS[t.mk], `${t.id} 产出货品非法 ${t.mk}`);
      assert(t.tier >= 1 && t.tier <= 4, `档次非法 ${t.id}`);
    }
    return `共 ${TYPES.length} 种 / 12 行业`;
  });

  // 2. 机制与内容规模
  check('数据：机制/事件/科技规模', () => {
    assert(MECHANICS.length >= 10, `机制仅 ${MECHANICS.length} 项`);
    assert(EVENTS.length >= 20, `事件仅 ${EVENTS.length} 种`);
    assert(Object.keys(TECHS).length >= 20, '科技不足 20');
    assert(DISTRICTS.length === 6 && PLOTS_PER_DIST === 10, '城区规格错误');
    const choices = EVENTS.filter((e) => e.choice).length;
    assert(choices >= 4, '抉择事件不足 4');
    return `${MECHANICS.length} 机制 / ${EVENTS.length} 事件(含${choices}抉择) / ${Object.keys(TECHS).length} 科技`;
  });

  // 3. 买地开店流程
  check('流程：买地→开店→扣款', () => {
    const s = newGame(7);
    const cash0 = s.cash;
    const r1 = game.buyPlot(s, 'old', 0);
    assert(r1.ok, r1.msg);
    const r2 = game.openBiz(s, 'old', 0, 'baozi');
    assert(r2.ok, r2.msg);
    assert(s.biz.length === 1 && s.plots.old[0].b === 0, '门店未挂到地块');
    assert(s.cash < cash0, '未扣款');
    return `扣款 ¥${cash0 - s.cash}`;
  });

  // 4. 连续结算
  check('结算：连续 3 天出账', () => {
    const s = rig();
    for (let i = 0; i < 3; i++) dayTick(s);
    assert(s.ledger.length === 3, '账本条数错误');
    assert(s.biz[0].today && Number.isFinite(s.biz[0].today.profit), '门店无当日数据');
    return `第3日净利 ¥${Math.round(s.ledger[2].profit)}`;
  });

  // 5. 价格弹性
  check('机制：供需定价（弹性单调）', () => {
    const s = rig();
    const eff = techEff(s), prod = ownedProducers(s);
    const b = s.biz[0];
    b.price = 0.7;
    const lo = calcBiz(s, b, eff, prod, { noNoise: true });
    b.price = 1.5;
    const hi = calcBiz(s, b, eff, prod, { noNoise: true });
    assert(lo.qty > hi.qty, `低价客量应更高 lo=${lo.qty} hi=${hi.qty}`);
    return `70%价→客量${lo.qty.toFixed(2)} / 150%价→${hi.qty.toFixed(2)}`;
  });

  // 6. 雇员产能
  check('机制：雇员决定产能', () => {
    const s = rig();
    const eff = techEff(s), prod = ownedProducers(s);
    const b = s.biz[0];
    const full = calcBiz(s, b, eff, prod, { noNoise: true });
    b.staff = 0;
    const none = calcBiz(s, b, eff, prod, { noNoise: true });
    assert(none.qty === 0 && full.qty > 0, '零员工应零客量');
    return `满员客量 ${full.qty.toFixed(2)}，无人 0`;
  });

  // 7. 供应链协同
  check('机制：供应链上游降本', () => {
    const s = rig();
    game.buyPlot(s, 'old', 1);
    game.openBiz(s, 'old', 1, 'fruit'); // 需 crop
    const eff = techEff(s);
    const d0 = supplyDisc(s, TYPE_BY_ID.fruit, eff, ownedProducers(s));
    assert(d0 === 1, '无上游时不应有折扣');
    game.buyPlot(s, 'old', 2);
    game.openBiz(s, 'old', 2, 'veggie'); // 产 crop
    const d1 = supplyDisc(s, TYPE_BY_ID.fruit, eff, ownedProducers(s));
    assert(d1 < 1, '有上游应降本');
    return `材料折扣 ${d0} → ${d1}`;
  });

  // 8. 科技增益
  check('机制：科技研发增益营收', () => {
    const s = rig();
    const prod = ownedProducers(s);
    const b = s.biz[0];
    const before = calcBiz(s, b, techEff(s), prod, { noNoise: true });
    s.techsDone.push('pos'); // 电子收银 +4%
    const after = calcBiz(s, b, techEff(s), prod, { noNoise: true });
    assert(after.rev > before.rev * 1.03, '营收未提升');
    return `营收 ${Math.round(before.rev)} → ${Math.round(after.rev)}`;
  });

  // 9. 数字化方案
  check('机制：数字化方案与佣金', () => {
    const s = rig();
    const b = s.biz[0];
    const r0 = game.setDigital(s, b, 1);
    assert(!r0.ok, '未研发科技不应可用');
    s.techsDone.push('digi1');
    const r1 = game.setDigital(s, b, 1);
    assert(r1.ok, r1.msg);
    const c = calcBiz(s, b, techEff(s), ownedProducers(s), { noNoise: true });
    assert(c.comm > 0, '外卖平台应产生佣金');
    return `佣金 ¥${c.comm.toFixed(0)}/日，触达×1.25`;
  });

  // 10. 信贷利息
  check('机制：贷款到账与日息', () => {
    const s = rig();
    const cash0 = s.cash;
    const r = game.takeLoan(s, 20000);
    assert(r.ok && s.cash === cash0 + 20000 && s.loan.bal === 20000, '贷款未入账');
    dayTick(s);
    const led = s.ledger[s.ledger.length - 1];
    assert(led.int > 0, '未计利息');
    return `¥2万贷款日息 ¥${led.int.toFixed(1)}`;
  });

  // 11. 确定性 & 存读一致
  check('存档：克隆推进 30 天结果一致', () => {
    const a = rig(20260717);
    const b = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 30; i++) { dayTick(a); if (a.pending) resolveChoice(a, 'a'); }
    for (let i = 0; i < 30; i++) { dayTick(b); if (b.pending) resolveChoice(b, 'a'); }
    assert(a.cash === b.cash && a.rngS === b.rngS, `分叉 cash ${a.cash} vs ${b.cash}`);
    assert(a.stocks.every((st, i) => st.p === b.stocks[i].p), '股价分叉');
    return `30 天后现金一致 ¥${Math.round(a.cash)}`;
  });

  // 12. 360 天长跑（含事件/对手/目标/无 NaN）
  check('长跑：脚本化 360 天世界演化', () => {
    const s = rig(99);
    game.buyPlot(s, 'old', 1); game.openBiz(s, 'old', 1, 'veggie');
    game.buyPlot(s, 'old', 2); game.openBiz(s, 'old', 2, 'fruit');
    for (const b of s.biz) b.staff = staffReq(TYPE_BY_ID[b.type], 1);
    game.startResearch(s, 'pos');
    game.takeLoan(s, 30000);
    game.setSupply(s, s.biz[0], 2);
    game.setWage(s, s.biz[0], 2);
    game.setPrice(s, s.biz[0], 1.1);
    let events = 0;
    for (let i = 0; i < 360; i++) {
      dayTick(s);
      if (s.pending) { resolveChoice(s, 'a'); events++; }
      if (i === 120) game.repayLoan(s, 999999);
      if (i === 60 && !s.research) game.startResearch(s, 'lic2');
    }
    deepFinite(s, 'state');
    assert(s.day === 361, '天数错误');
    assert(s.techsDone.includes('pos'), '研发未完成');
    assert(s.log.some((l) => l.txt.includes('事件') || l.txt.includes('抉择')), '360 天无任何事件');
    const rivalN = s.rivals.reduce((a, r) => a + r.biz.length, 0);
    assert(rivalN >= 1, '对手 AI 未开店');
    assert(s.goalIdx >= 4, `目标链推进过慢 ${s.goalIdx}`);
    assert(s.level >= 2, '等级未成长');
    return `净资产 ¥${s.stats.worth.toLocaleString()} / 对手 ${rivalN} 店 / 目标 ${s.goalIdx}/${GOALS.length} / Lv${s.level}`;
  });

  // 13. 竞争与收购
  check('机制：对手分流与收购', () => {
    const s = rig();
    const b = s.biz[0];
    const eff = techEff(s), prod = ownedProducers(s);
    const before = calcBiz(s, b, eff, prod, { noNoise: true });
    // 手动放一家对手同业门店在同城区
    const rb = { dist: 'old', plot: 5, type: 'baozi', level: 1 };
    s.rivals[0].biz.push(rb);
    s.plots.old[5] = { o: 0, b: null, rb };
    const after = calcBiz(s, b, eff, prod, { noNoise: true });
    assert(after.share < 1 && after.qty < before.qty, '对手未分流客量');
    const r = game.acquireRival(s, 'old', 5);
    assert(r.ok, r.msg);
    assert(s.biz.length === 2 && s.rivals[0].biz.length === 0, '收购未转移门店');
    return `份额 ${before.share.toFixed(2)} → ${after.share.toFixed(2)}，收购成功`;
  });

  // 14. 抉择事件效果落地
  check('机制：抉择事件改写结算', () => {
    const s = rig();
    s.pending = { id: 'strike' };
    const fx0 = s.fx.length;
    resolveChoice(s, 'a');
    assert(s.pending === null, '抉择未关闭');
    assert(s.fx.length === fx0 + 1 && s.fx.some((f) => f.k === 'wage' && f.m > 1), '加薪效果未生效');
    return '全员加薪 60 天效果已挂载';
  });

  // 15. 破产判定
  check('机制：破产清算', () => {
    const s = rig();
    s.cash = -60000;
    s.biz[0].staff = 0;
    for (let i = 0; i < 16 && !s.over; i++) { dayTick(s); s.cash = Math.min(s.cash, -60000); if (s.pending) resolveChoice(s, 'b'); }
    assert(s.over, '未触发破产');
    return '连续透支 15 天 → 破产';
  });

  // 16. 声望/品质联动
  check('机制：供应品质驱动声望', () => {
    const s = rig(31);
    const b = s.biz[0];
    game.setSupply(s, b, 2); // 优质直采
    const rep0 = b.rep;
    for (let i = 0; i < 20; i++) { dayTick(s); if (s.pending) resolveChoice(s, 'a'); }
    assert(b.rep > rep0, `优质供应声望应上涨 ${rep0}→${b.rep}`);
    return `20 天声望 ${rep0} → ${b.rep.toFixed(1)}`;
  });

  // ---- 汇总 ----
  const pass = results.filter((r) => r.结果 === '✅').length;
  console.table(results);
  const ok = pass === results.length;
  console.log(`%c像素大亨自测：${pass}/${results.length} 通过`, `color:${ok ? '#5fc46a' : '#e05555'};font-weight:bold;font-size:14px`);
  window.__SELFTEST__ = { pass, total: results.length, ok, results };
  document.title = `${ok ? '✓' : '✗'}${pass}/${results.length} 像素大亨`;
  const badge = document.getElementById('selftestBadge');
  if (badge) {
    badge.style.display = 'block';
    badge.style.background = ok ? '#14231a' : '#2a1416';
    badge.style.color = ok ? '#9df0a5' : '#ffc9c9';
    badge.textContent = `自测 ${pass}/${results.length} ${ok ? '全部通过' : '存在失败'}`;
  }
  return window.__SELFTEST__;
}
