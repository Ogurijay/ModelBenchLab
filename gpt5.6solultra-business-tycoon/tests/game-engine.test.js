import test from 'node:test';
import assert from 'node:assert/strict';
import { BUSINESS_MODELS, MECHANISMS } from '../src/game-data.js';
import { borrow, createInitialState, openStore, simulateDay, updateStorePlan } from '../src/game-engine.js';

test('商业模式由 12 行业 × 4 客群 × 3 渠道生成', () => {
  assert.equal(BUSINESS_MODELS.length, 144);
  assert.equal(new Set(BUSINESS_MODELS.map((model) => model.id)).size, 144);
  assert.ok(MECHANISMS.length >= 10);
});

test('玩家可以开店并完成确定性的逐日结算', () => {
  const initial = createInitialState();
  const opened = openStore(initial, BUSINESS_MODELS[0].id, 2);
  assert.equal(opened.ok, true);
  const random = () => 0.5;
  const next = simulateDay(opened.state, random);
  assert.equal(next.day, 2);
  assert.equal(next.stores.length, 1);
  assert.ok(Number.isFinite(next.stores[0].revenue));
  assert.ok(Number.isFinite(next.stores[0].profit));
  assert.equal(next.ledger.length, 1);
});

test('经营策略和贷款会进入状态', () => {
  const opened = openStore(createInitialState(), BUSINESS_MODELS[0].id, 0);
  const storeId = opened.store.id;
  const changed = updateStorePlan(opened.state, storeId, 'marketingPlan', 'ads');
  assert.equal(changed.ok, true);
  assert.equal(changed.state.stores[0].marketingPlan, 'ads');
  const financed = borrow(changed.state);
  assert.equal(financed.ok, true);
  assert.equal(financed.state.loan, 30000);
  assert.equal(financed.state.cash, changed.state.cash + 30000);
});

test('不能在同一地块重复开店', () => {
  const first = openStore(createInitialState(), BUSINESS_MODELS[0].id, 0);
  const second = openStore(first.state, BUSINESS_MODELS[1].id, 0);
  assert.equal(second.ok, false);
});
