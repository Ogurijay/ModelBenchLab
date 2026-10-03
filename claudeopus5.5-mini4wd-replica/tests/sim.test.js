// 逻辑单元测试（node --test）：赛道闭合、车道换道、改装换算、比赛确定性与调校效果。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, LAYOUTS, solveClosure, LANE_W } from '../src/game/track.js';
import { Race } from '../src/game/sim.js';
import { PARTS, SLOTS, normalizeBuild, getSetup, getStats } from '../src/game/parts.js';
import { CARS } from '../src/model/cars/index.js';

const run = (layout, build, { seed = 1, lanes = 5, cars = CARS.slice(0, lanes), mode = 'real', input = {} } = {}) => {
  const race = new Race({ track: new Track(layout, lanes), entries: cars.map((car, i) => ({ car, build: i === 0 ? build : {}, player: i === 0 })), seed, mode });
  race.start();
  for (let t = 0; race.state !== 'finished' && t < 400; t += 1 / 60) race.update(1 / 60, input);
  return race;
};

test('三种赛道在 3/5 车道下都能闭合，且各车道一圈总长相同（每圈换道）', () => {
  for (const L of LAYOUTS) for (const n of [3, 5]) {
    const t = new Track(L, n);
    assert.ok(t.closure < 1e-3, `${L.id} 闭合误差 ${t.closure}`);
    const sum = t.laneLength.reduce((a, b) => a + b, 0);
    assert.ok(sum > t.length * n * 0.99 && sum < t.length * n * 1.01);
    assert.ok(t.lc, `${L.id} 有换道桥`);
  }
});

test('自动直道求解拒绝无法闭合的布局', () => {
  assert.throws(() => solveClosure([{ type: 'S', len: 'auto' }, { type: 'C', angle: 90, r: 1 }, { type: 'S', len: 'auto' }, { type: 'C', angle: 90, r: 1 }, { type: 'S', len: 'auto' }]));
});

test('换道桥：最外道抬升跨越到最内道，其余车道外移一道', () => {
  const t = new Track(LAYOUTS[0], 5), lc = t.lc, mid = (lc.s0 + lc.s1) / 2;
  const outer = t.pose(mid, 4);
  assert.ok(outer.lift > 0.08 && outer.bridge);
  assert.equal(t.nextLane(4), 0);
  assert.equal(t.nextLane(1), 2);
  const a = t.laneShape(lc.s1, 1).offset, b = t.laneShape(lc.s1 + 0.01, 2).offset;
  assert.ok(Math.abs(a - b) < 1e-6, '换道结束时位置连续');
  assert.ok(Math.abs(t.laneShape(lc.s0 - 0.01, 0).offset - (-2 * LANE_W)) < 1e-9);
});

test('改装数据规范化：非法值回落原厂', () => {
  const b = normalizeBuild({ motor: 99, gear: -1, tire: 'x', roller: 1.5, battery: 2 });
  assert.deepEqual(Object.keys(b), SLOTS);
  assert.equal(b.motor, 0); assert.equal(b.gear, 0); assert.equal(b.tire, 0); assert.equal(b.roller, 0); assert.equal(b.battery, 2);
});

test('高转速马达提高极速，扭矩齿轮降低极速', () => {
  const c = CARS[0];
  const base = getSetup(c, {}), fast = getSetup(c, { motor: 4 }), torque = getSetup(c, { gear: 5 });
  assert.ok(fast.freeSpeed > base.freeSpeed * 1.6);
  assert.ok(torque.freeSpeed < base.freeSpeed && torque.wheelForce > base.wheelForce);
  for (const car of CARS) for (const v of getStats(car, {}).values) assert.ok(v >= 5 && v <= 100);
});

test('原厂车在三条赛道上都能完赛', () => {
  for (const L of LAYOUTS) {
    const r = run(L, {});
    assert.equal(r.state, 'finished');
    assert.ok(r.racers.every(x => x.status === 'finished'), `${L.id}: ${r.racers.map(x => x.status + ':' + x.reason).join(',')}`);
  }
});

test('同一种子结果完全一致（确定性）', () => {
  const a = run(LAYOUTS[0], { motor: 4, gear: 1 }, { seed: 7 }), b = run(LAYOUTS[0], { motor: 4, gear: 1 }, { seed: 7 });
  assert.deepEqual(a.racers.map(r => [r.status, r.finish, r.lap]), b.racers.map(r => [r.status, r.finish, r.lap]));
});

test('只换高速马达容易冲出；加刹车 / 配重 / 宽导轮后能稳定完赛', () => {
  const fastOuts = [1, 2, 3, 4, 5].map(seed => run(LAYOUTS[2], { motor: 4, gear: 1 }, { seed, cars: [CARS[0]] }).racers[0].status === 'out').filter(Boolean).length;
  const tunedOuts = [1, 2, 3, 4, 5].map(seed => run(LAYOUTS[2], { motor: 4, gear: 1, brake: 2, roller: 2, damper: 2, battery: 1 }, { seed, cars: [CARS[0]] }).racers[0].status === 'out').filter(Boolean).length;
  assert.ok(fastOuts >= 3, `高速裸车冲出 ${fastOuts}/5`);
  assert.equal(tunedOuts, 0);
});

test('调校得当的高速车比原厂车更快', () => {
  const stock = run(LAYOUTS[0], {}, { cars: [CARS[0]] }).racers[0];
  const tuned = run(LAYOUTS[0], { motor: 3, roller: 1, brake: 1, damper: 1 }, { cars: [CARS[0]] }).racers[0];
  assert.equal(tuned.status, 'finished');
  assert.ok(tuned.finish < stock.finish * 0.85, `${tuned.finish} vs ${stock.finish}`);
});

test('动画模式：加油与必杀技让玩家更快，并消耗更多电量', () => {
  const plain = run(LAYOUTS[0], {}, { cars: [CARS[0]], mode: 'anime' }).racers[0];
  const boosted = run(LAYOUTS[0], {}, { cars: [CARS[0]], mode: 'anime', input: { boost: true, special: true } }).racers[0];
  assert.ok(boosted.finish < plain.finish);
  assert.ok(boosted.used > plain.used);
  assert.equal(boosted.specialLeft, 0);
});

test('零件目录：每个槽至少 3 个选项，名称不重复', () => {
  for (const slot of SLOTS) {
    const names = PARTS[slot].options.map(o => o.name);
    assert.ok(names.length >= 3);
    assert.equal(new Set(names).size, names.length);
  }
});
