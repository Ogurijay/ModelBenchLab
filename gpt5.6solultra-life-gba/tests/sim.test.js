import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInteraction, createInitialState, distanceToRect, formatTime, tickState } from '../src/sim.js';

test('时间会跨天并正确格式化', () => {
  const state = createInitialState();
  state.minute = 1435;
  const next = tickState(state, 10);
  assert.equal(next.day, 2);
  assert.equal(formatTime(next.minute), '00:05');
});

test('互动会恢复需求、扣除金钱并限制在 0-100', () => {
  const state = createInitialState();
  const next = applyInteraction(state, { id: 'meal', minutes: 20, money: -12, needs: { hunger: 60 } });
  assert.equal(next.needs.hunger, 100);
  assert.equal(next.money, 116);
  assert.deepEqual(next.completed, ['meal']);
});

test('需求随游戏时间衰减', () => {
  const state = createInitialState();
  const next = tickState(state, 60);
  assert.ok(next.needs.energy < state.needs.energy);
  assert.ok(next.needs.hygiene < state.needs.hygiene);
});

test('大型家具按边缘距离触发，不受中心点过远影响', () => {
  const bed = { x: 15, y: 34, w: 39, h: 25 };
  assert.equal(distanceToRect(35, 66, bed), 7);
  assert.ok(Math.hypot(35 - 34.5, 66 - 46.5) > 12);
});
