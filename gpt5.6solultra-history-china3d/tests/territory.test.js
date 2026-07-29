import test from 'node:test';
import assert from 'node:assert/strict';
import { ERAS } from '../src/data/eras.js';
import {
  assignFaction,
  createTerritoryGrid,
  territoryAssignments,
  territorySignature,
} from '../src/core/territory.js';

test('全国势力网格具有足够的空间采样', () => {
  const tiles = createTerritoryGrid();
  assert.ok(tiles.length >= 250, `实际地块数 ${tiles.length}`);
  assert.ok(tiles.length <= 700, `实际地块数 ${tiles.length}`);
});

test('每个时代的每块疆域都有势力归属', () => {
  const tiles = createTerritoryGrid();
  for (const era of ERAS) {
    const knownIds = new Set(era.factions.map((faction) => faction.id));
    const assignments = territoryAssignments(era, tiles);
    assert.equal(assignments.length, tiles.length);
    assert.ok(assignments.every((tile) => knownIds.has(tile.factionId)), era.id);
  }
});

test('同一历史截面的势力划分哈希保持确定性', () => {
  for (const era of ERAS) {
    assert.equal(territorySignature(era), territorySignature(era), era.id);
    assert.match(territorySignature(era), /^[0-9a-f]{8}$/);
  }
});

test('战国时期咸阳附近归入秦势力', () => {
  const era = ERAS.find((item) => item.year === -300);
  const faction = assignFaction(era, 108.9, 34.3);
  assert.ok(faction);
  assert.match(faction.name, /秦/);
});
