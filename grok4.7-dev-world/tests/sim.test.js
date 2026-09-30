import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDINGS,
  GRID,
  blocked,
  cameraPlan,
  cellCenter,
  cellInfo,
  classify,
  createGame,
  demolish,
  development,
  findStart,
  forEachCell,
  headingName,
  housingOf,
  occupant,
  pack,
  place,
  rankName,
  spawnPoint,
  suggestRot,
  tick,
  unpack,
  watchName,
  whyNot,
} from '../src/sim.js';

const SEED = 20260922;

function find(state, pred) {
  for (let iz = 0; iz < GRID; iz += 1) {
    for (let ix = 0; ix < GRID; ix += 1) {
      if (occupant(state, ix, iz)) continue;
      const info = cellInfo(state, ix, iz);
      if (pred(info, ix, iz)) return { ix, iz, info };
    }
  }
  return null;
}

test('the same seed draws the same island, with coast, grass and forest', () => {
  const counts = { deep: 0, shallow: 0, sand: 0, grass: 0, rock: 0, forest: 0 };
  forEachCell(SEED, (ix, iz, info) => {
    counts[info.kind] += 1;
    if (info.forest) counts.forest += 1;
    assert.deepEqual(info, classify(cellCenter(ix, iz).x, cellCenter(ix, iz).z, SEED));
  });
  assert.ok(counts.grass > 40, JSON.stringify(counts));
  assert.ok(counts.sand > 8, JSON.stringify(counts));
  assert.ok(counts.forest > 6, JSON.stringify(counts));
  assert.ok(counts.deep > 40, JSON.stringify(counts));
  const center = classify(0, 0, SEED);
  assert.ok(center.kind === 'grass' || center.kind === 'rock');
  assert.equal(cellInfo(createGame(SEED), 0, 0).kind, 'deep');
});

test('a new survey starts at a camp and can walk beside the hut', () => {
  const state = createGame(SEED);
  const start = findStart(SEED);
  assert.equal(state.buildings[0].type, 'hut');
  assert.equal(state.buildings[0].free, true);
  assert.equal(cellInfo(state, start.ix, start.iz).kind, 'grass');
  assert.equal(rankName(development(state)), '营地');
  const home = cellCenter(start.ix, start.iz);
  assert.equal(blocked(state, home.x, home.z), true);
  const spawn = spawnPoint(state);
  assert.equal(blocked(state, spawn.x, spawn.z), false);
});

test('placement spends resources and refuses water, forest roads and overlaps', () => {
  const state = createGame(SEED);
  const water = find(state, (info) => info.kind === 'deep');
  assert.ok(water);
  assert.match(whyNot(state, 'hut', water.ix, water.iz), /立不住|水/);
  const forest = find(state, (info) => info.forest);
  assert.ok(forest);
  assert.match(whyNot(state, 'road', forest.ix, forest.iz), /树/);
  const grove = place(state, 'grove', forest.ix, forest.iz, 0);
  assert.equal(grove.ok, true);
  assert.equal(cellInfo(state, forest.ix, forest.iz).forest, false);
  const grass = find(state, (info) => info.kind === 'grass' && !info.forest);
  assert.ok(grass);
  const before = state.resources.timber;
  const hut = place(state, 'hut', grass.ix, grass.iz, 2);
  assert.equal(hut.ok, true);
  assert.equal(state.resources.timber, before - BUILDINGS.hut.cost.timber);
  assert.equal(place(state, 'farm', grass.ix, grass.iz, 0).ok, false);
  assert.equal(housingOf(state), 6);
});

test('a pier must touch water and then pays coin', () => {
  const state = createGame(SEED);
  const spot = find(state, (info, ix, iz) => {
    if (info.kind !== 'sand' && info.kind !== 'shallow') return false;
    return whyNot(state, 'pier', ix, iz) === '';
  });
  assert.ok(spot, 'expected a pier site');
  const rot = suggestRot(state, 'pier', spot.ix, spot.iz);
  assert.ok(rot >= 0 && rot <= 3);
  assert.equal(place(state, 'pier', spot.ix, spot.iz, rot).ok, true);
  state.pop = housingOf(state);
  state.resources.grain = 20;
  const coin = state.resources.coin;
  tick(state);
  assert.equal(state.resources.coin, coin + 2);
});

test('farms cover a meal and empty granaries send people away', () => {
  const fed = createGame(SEED);
  const field = find(fed, (info) => info.kind === 'grass' && !info.forest);
  assert.equal(place(fed, 'farm', field.ix, field.iz, 0).ok, true);
  fed.pop = housingOf(fed);
  fed.resources.grain = 0;
  tick(fed);
  assert.equal(fed.hunger, 0);
  assert.equal(fed.pop, housingOf(fed));

  const hungry = createGame(SEED);
  hungry.pop = housingOf(hungry);
  hungry.resources.grain = 0;
  tick(hungry);
  assert.equal(hungry.hunger, 1);
  tick(hungry);
  assert.equal(hungry.pop, housingOf(hungry) - 1);
});

test('surplus grain houses another person until the roofs are full', () => {
  const state = createGame(SEED);
  state.resources.grain = 10;
  tick(state);
  assert.equal(state.pop, 3);
  assert.equal(state.resources.grain, 5);
  state.resources.grain = 30;
  tick(state);
  assert.equal(state.pop, 3);
  assert.ok(state.resources.grain < 30);
});

test('demolishing returns forty percent and frees the plot', () => {
  const state = createGame(SEED);
  const grass = find(state, (info) => info.kind === 'grass' && !info.forest);
  assert.equal(place(state, 'hut', grass.ix, grass.iz, 0).ok, true);
  const timber = state.resources.timber;
  const result = demolish(state, grass.ix, grass.iz);
  assert.equal(result.ok, true);
  assert.equal(result.refund.timber, 3);
  assert.equal(state.resources.timber, timber + 3);
  assert.equal(occupant(state, grass.ix, grass.iz), null);
  const road = find(state, (info) => info.kind === 'sand' || (info.kind === 'grass' && !info.forest));
  assert.equal(place(state, 'road', road.ix, road.iz, 0).ok, true);
  assert.equal(demolish(state, road.ix, road.iz).refund.clay, 1);
});

test('the ledger round-trips and drops unknown buildings', () => {
  const state = createGame(SEED);
  const grass = find(state, (info) => info.kind === 'grass' && !info.forest);
  place(state, 'well', grass.ix, grass.iz, 1);
  const again = unpack(pack(state));
  assert.equal(again.seed, state.seed);
  assert.equal(again.buildings.length, state.buildings.length);
  assert.equal(development(again), development(state));
  assert.equal(again.buildings.some((b) => b.type === 'well'), true);
  const dirty = unpack({
    v: 1,
    seed: SEED,
    resources: { timber: 3.8, clay: -4, grain: 9999, coin: 2 },
    buildings: [{ type: '<script>', ix: 1, iz: 1 }, { type: 'lamp', ix: 4, iz: 4, rot: 9 }],
  });
  assert.equal(dirty.resources.timber, 3);
  assert.equal(dirty.resources.clay, 0);
  assert.equal(dirty.resources.grain, 999);
  assert.equal(dirty.buildings.some((b) => b.type === '<script>'), false);
});

test('development can cross into an opened island', () => {
  const state = createGame(SEED);
  assert.equal(rankName(development(state)), '营地');
  state.pop = 20;
  state.resources.coin = 30;
  assert.equal(rankName(development(state)), '开洲');
  assert.equal(state.celebrated, false);
});

test('headings follow the surveyor and the day has twelve watches', () => {
  assert.equal(headingName(0), '北');
  assert.equal(headingName(Math.PI / 2), '西');
  assert.equal(headingName(-Math.PI / 2), '东');
  assert.equal(watchName(0), '夜半');
  assert.equal(watchName(0.5), '日中');
  const plan = cameraPlan(0.4);
  assert.ok(Math.abs(plan.fx * plan.rx + plan.fz * plan.rz) < 1e-10);
  assert.ok(Math.abs(Math.hypot(plan.fx, plan.fz) - 1) < 1e-10);
});
