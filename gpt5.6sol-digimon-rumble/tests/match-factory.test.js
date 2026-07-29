import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchConfig, summarizeBattle } from '../src/app/MatchFactory.js';
import { BattleSimulation } from '../src/game/BattleSimulation.js';
import { CHARACTERS } from '../src/data/gameData.js';

function flowState(match, overrides = {}) {
  return {
    screen: 'battle',
    context: { mode: match.mode, characterId: match.characterId, stageId: match.stageId, match },
    settings: { difficulty: 'normal', battleTime: 90, ...(overrides.settings ?? {}) },
    save: {
      profile: {
        unlockedCharacters: CHARACTERS.map((character) => character.id),
        ...(overrides.profile ?? {}),
      },
    },
  };
}

test('cup round keeps its fixed three opponents and creates a four-fighter simulation', () => {
  const config = buildMatchConfig(flowState({
    mode: 'cup',
    characterId: 'agumon',
    cupRound: 3,
    stageId: 'factory',
    opponents: ['apocalymon'],
  }));

  assert.deepEqual(config.roster.map((fighter) => fighter.characterId), [
    'agumon', 'veemon', 'gabumon', 'tentomon',
  ]);
  assert.deepEqual(config.humanIds, ['p1']);
  assert.equal(config.meta.localPlayers, 1);
  assert.equal(config.meta.cpuCount, 3);
  assert.equal(config.meta.totalFighters, 4);
  assert.deepEqual(config.simulation.hazards, ['laser']);
  assert.deepEqual(config.simulation.itemTypes, ['energy', 'health', 'power', 'life']);
  assert.deepEqual(config.simulation.fighters.map((fighter) => fighter.controller), [
    'human', 'cpu', 'cpu', 'cpu',
  ]);

  const battle = new BattleSimulation({ ...config.simulation, readyTime: 0 });
  assert.equal(battle.fighters.length, 4);
});

test('cup boss keeps its real single form and boss metadata', () => {
  const config = buildMatchConfig(flowState({
    mode: 'cup',
    characterId: 'renamon',
    cupRound: 4,
    stageId: 'terminal',
  }));
  const boss = config.roster.find((fighter) => fighter.characterId === 'diaboromon');

  assert.ok(boss);
  assert.equal(boss.boss, true);
  assert.equal(boss.forms.length, 1);
  assert.equal(boss.forms[0].en, 'DIABOROMON');
  assert.deepEqual(boss.stats, { speed: 4, power: 5, range: 5, guard: 4 });

  const battle = new BattleSimulation({ ...config.simulation, readyTime: 0 });
  assert.equal(battle.fighters.find((fighter) => fighter.id === boss.id).forms.length, 1);
});

test('free battle supports four local players and clamps the total to four unique characters', () => {
  const state = flowState({
    mode: 'free',
    characterId: 'renamon',
    stageId: 'terminal',
    opponents: ['gabumon'],
  });
  const config = buildMatchConfig(state, {
    localPlayers: 4,
    cpuCount: 3,
    rule: 'timed',
    difficulty: 'veteran',
    battleTime: 120,
  });

  assert.equal(config.roster.length, 4);
  assert.equal(new Set(config.roster.map((fighter) => fighter.characterId)).size, 4);
  assert.deepEqual(config.humanIds, ['p1', 'p2', 'p3', 'p4']);
  assert.equal(config.meta.localPlayers, 4);
  assert.equal(config.meta.cpuCount, 0);
  assert.equal(config.simulation.rule, 'timed');
  assert.equal(config.simulation.duration, 120);
  assert.equal(config.simulation.time, 120);
  assert.ok(config.roster.every((fighter) => fighter.controller === 'human'));
  assert.ok(config.roster.every((fighter) => fighter.difficulty === 'veteran'));
  assert.ok(config.roster.every((fighter) => fighter.forms.length === 3));

  const minimum = buildMatchConfig(state, { localPlayers: 1, cpuCount: 0 });
  assert.equal(minimum.meta.cpuCount, 1);
  assert.equal(minimum.meta.totalFighters, 2);
});

test('training always uses one local fighter, one CPU, infinite time, and training energy', () => {
  const config = buildMatchConfig(flowState({
    mode: 'training',
    characterId: 'tentomon',
    stageId: 'jungle',
    localPlayers: 4,
    cpuCount: 0,
  }), {
    localPlayers: 4,
    cpuCount: 0,
    rule: 'race',
    battleTime: 60,
  });

  assert.equal(config.meta.localPlayers, 1);
  assert.equal(config.meta.cpuCount, 1);
  assert.equal(config.meta.totalFighters, 2);
  assert.equal(config.simulation.rule, 'training');
  assert.equal(config.simulation.duration, Infinity);
  assert.equal(config.simulation.time, Infinity);
  assert.deepEqual(config.humanIds, ['p1']);
  assert.deepEqual(config.roster.map((fighter) => fighter.controller), ['human', 'cpu']);
  assert.ok(config.roster.every((fighter) => fighter.energy === 100));
  assert.deepEqual(config.simulation.hazards, ['rocks']);
});

test('battle summaries normalize multiplayer wins, losses, draws, combo, damage, and elapsed time', () => {
  const state = {
    phase: 'ended',
    winner: 'p2',
    elapsed: 42.5,
    fighters: [
      { id: 'p1', controller: 'human', maxCombo: 4 },
      { id: 'p2', controller: 'human', maxCombo: 7 },
      { id: 'p3', controller: 'cpu', maxCombo: 12 },
    ],
    events: [
      { type: 'hit', attacker: 'p1', damage: 8 },
      { type: 'hit', attacker: 'p2', damage: 12.5 },
      { type: 'hit', attacker: 'p3', damage: 99 },
    ],
  };
  const humanIds = ['p1', 'p2'];
  const win = summarizeBattle(state, humanIds);

  assert.equal(win.outcome, 'win');
  assert.equal(win.winner, 'p2');
  assert.equal(win.maxCombo, 7);
  assert.equal(win.damage, 20.5);
  assert.equal(win.damageDealt, 20.5);
  assert.equal(win.elapsed, 42.5);
  assert.equal(win.durationSeconds, 42.5);

  assert.equal(summarizeBattle({ ...state, winner: 'p3' }, humanIds).outcome, 'loss');
  assert.equal(summarizeBattle({ ...state, winner: 'draw' }, humanIds).outcome, 'draw');
  assert.equal(summarizeBattle({ ...state, winner: 'p2', outcome: 'loss' }, humanIds).outcome, 'loss');
});
