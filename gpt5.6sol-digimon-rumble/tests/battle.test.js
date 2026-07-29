import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleSimulation } from '../src/game/BattleSimulation.js';

const FRAME = 1 / 60;

function advance(game, seconds, input = {}) {
  const frames = Math.ceil(seconds / FRAME);
  for (let index = 0; index < frames; index += 1) game.step(FRAME, input);
}

function human(id, x, z = 0, extra = {}) {
  return {
    id,
    name: id,
    controller: 'human',
    x,
    z,
    forms: [`${id}-1`, `${id}-2`, `${id}-3`],
    ...extra,
  };
}

function gameWith(options = {}) {
  return new BattleSimulation({
    readyTime: 0,
    items: false,
    fighters: [human('a', -3), human('b', 3)],
    ...options,
  });
}

test('default construction keeps player/enemy aliases and enters a 2.5D battle', () => {
  const game = new BattleSimulation();
  assert.equal(game.phase, 'ready');
  advance(game, 2.7);
  assert.equal(game.phase, 'battle');
  assert.equal(game.player.id, 'player');
  assert.equal(game.enemy.id, 'enemy');
  assert.deepEqual(game.getState().platform, {
    minX: -11,
    maxX: 11,
    minZ: -3.2,
    maxZ: 3.2,
    fallY: -4,
    laneZ: 0,
  });
  assert.deepEqual(game.getState().combatPlane, { horizontal: 'x', vertical: 'y', lockedDepth: 0 });
  const before = game.time;
  game.step(FRAME);
  assert.ok(game.time < before);
});

test('all movement, fighters, projectiles, pickups, and hazards stay on one locked 2.5D plane', () => {
  const game = gameWith({ fighters: [human('a', -3, -2.5), human('b', 3, 2.5)] });
  game.fighters[0].energy = 50;
  game.step(FRAME, { moveX: 1, moveZ: 1, ranged: true });
  advance(game, 0.1, { moveZ: -1 });
  game.spawnItem('health', 0, 2.7);
  assert.ok(game.fighters.every((fighter) => fighter.z === 0));
  assert.ok(game.projectiles.every((projectile) => projectile.z === 0 && projectile.dz === 0));
  assert.ok(game.items.every((item) => item.z === 0));
});

test('configuration supports four fighters and all CPU difficulty profiles choose opponents', () => {
  const game = gameWith({
    fighters: [
      human('p', 7, 0, { team: 'blue' }),
      { ...human('rookie', -1, 0, { team: 'red' }), controller: 'cpu', difficulty: 'rookie' },
      { ...human('normal', -4, 0, { team: 'red' }), controller: 'cpu', difficulty: 'normal' },
      { ...human('veteran', -7, 0, { team: 'red' }), controller: 'cpu', difficulty: 'veteran' },
    ],
  });
  game.step(FRAME);
  assert.equal(game.fighters.length, 4);
  assert.equal(game.player.id, 'p');
  assert.equal(game.enemy.id, 'rookie');
  for (const id of ['rookie', 'normal', 'veteran']) assert.equal(game.aiStates[id].targetId, 'p');
  assert.throws(() => new BattleSimulation({ fighters: [] }), /between 1 and 4/);
});

test('melee deals HP damage, grants energy, and drops collectible evolution energy', () => {
  const game = gameWith({ fighters: [human('a', -0.7), human('b', 0.7)] });
  game.step(FRAME, { attack: true });
  advance(game, 0.25);
  assert.ok(game.fighters[1].hp < 100);
  assert.ok(game.fighters[0].energy > 0);
  assert.ok(game.energyOrbs.length > 0);
  const events = game.drainEvents();
  assert.ok(events.some((event) => event.type === 'hit' && event.target === 'b'));
  assert.ok(events.some((event) => event.type === 'energyDrop'));
});

test('a projectile can collide with any enemy rather than a fixed player/enemy pair', () => {
  const game = gameWith({
    fighters: [human('shooter', -4), human('interceptor', 0), human('target', 4)],
  });
  game.fighters[0].energy = 50;
  game.step(FRAME, { skill: true, targetId: 'target' });
  assert.equal(game.fighters[0].energy, 25);
  advance(game, 0.55);
  assert.ok(game.fighters[1].hp < 100);
  assert.equal(game.fighters[2].hp, 100);
  assert.ok(game.drainEvents().some((event) => (
    event.type === 'projectileHit' && event.target === 'interceptor'
  )));
});

test('ground guard reduces damage and knockback while heal spends 25 energy', () => {
  const game = gameWith({ fighters: [human('a', -0.7), human('b', 0.7)] });
  const defenderStartX = game.fighters[1].x;
  game.step(FRAME, { fighters: { a: { attack: true }, b: { guard: true } } });
  advance(game, 0.25, { fighters: { b: { guard: true } } });
  assert.ok(game.fighters[1].hp > 96);
  assert.ok(game.fighters[1].x - defenderStartX < 0.5);
  assert.ok(game.drainEvents().some((event) => event.type === 'guard' && event.blocked));

  game.fighters[0].hp = 50;
  game.fighters[0].energy = 25;
  game.step(FRAME, { heal: true });
  assert.equal(game.fighters[0].hp, 78);
  assert.equal(game.fighters[0].energy, 0);
  assert.ok(game.drainEvents().some((event) => event.type === 'heal' && event.cost === 25));
});

test('100 energy advances real forms and a full third form releases Ultra AOE', () => {
  const game = gameWith({
    fighters: [human('a', 0), human('b', 2), human('c', -2)],
  });
  game.fighters[0].energy = 100;
  game.step(FRAME, { evolve: true });
  assert.equal(game.fighters[0].formIndex, 1);
  assert.equal(game.fighters[0].energy, 0);
  game.fighters[0].energy = 100;
  game.step(FRAME, { overdrive: true });
  assert.equal(game.fighters[0].formIndex, 2);
  game.fighters[0].energy = 100;
  game.step(FRAME, { ultra: true });
  assert.equal(game.fighters[0].formIndex, 2);
  assert.ok(game.fighters[1].hp < 100);
  assert.ok(game.fighters[2].hp < 100);
  const ultra = game.drainEvents().find((event) => event.type === 'ultra');
  assert.deepEqual(new Set(ultra.targets), new Set(['b', 'c']));
});

test('cheat form shifting evolves and devolves freely without consuming energy', () => {
  const game = gameWith();
  const fighter = game.fighters[0];
  fighter.energy = 17;
  assert.equal(game.forceForm('a', 1).type, 'evolution');
  assert.equal(fighter.formIndex, 1);
  assert.equal(fighter.energy, 17);
  assert.equal(game.forceForm('a', -1).type, 'devolution');
  assert.equal(fighter.formIndex, 0);
  assert.equal(fighter.energy, 17);
  assert.equal(game.forceForm('a', -1), false);
  const events = game.drainEvents().filter((event) => event.forced);
  assert.deepEqual(events.map((event) => event.type), ['evolution', 'devolution']);
});

test('race mode scores an Ultra, resets form, and ends at the configured target', () => {
  const game = gameWith({ rule: 'race', raceTarget: 1 });
  game.fighters[0].formIndex = 2;
  game.fighters[0].energy = 100;
  game.step(FRAME, { evolve: true });
  assert.equal(game.fighters[0].score, 1);
  assert.equal(game.fighters[0].formIndex, 0);
  assert.equal(game.phase, 'ended');
  assert.equal(game.winner, 'a');
  assert.equal(game.endReason, 'race-target');
});

test('a single-form boss keeps its real form count and uses full energy for Ultra', () => {
  const game = gameWith({
    fighters: [
      human('hero', -2),
      human('boss', 2, 0, { forms: ['BOSS FORM'] }),
    ],
  });
  const boss = game.fighters[1];
  assert.equal(boss.forms.length, 1);
  assert.equal(boss.formIndex, 0);
  boss.energy = 100;
  game.step(FRAME, { fighters: { boss: { evolve: true } } });
  assert.equal(boss.formIndex, 0);
  assert.equal(boss.energy, 0);
  assert.ok(game.drainEvents().some((event) => event.type === 'ultra' && event.fighter === 'boss'));
});

test('stock ring-out removes one life, devolves exactly one form, then respawns', () => {
  const game = gameWith({ rule: 'stock', stocks: 2, respawnDelay: 0.05 });
  const victim = game.fighters[1];
  victim.formIndex = 2;
  victim.x = game.platform.maxX + 0.1;
  victim.lastAttacker = 'a';
  game.step(FRAME);
  assert.equal(victim.stocks, 1);
  assert.equal(victim.formIndex, 1);
  assert.equal(victim.knockedOut, true);
  assert.ok(game.drainEvents().some((event) => event.type === 'ringOut'));
  advance(game, 0.08);
  assert.equal(victim.knockedOut, false);
  assert.equal(victim.hp, victim.maxHp);
  assert.equal(victim.formIndex, 1);
});

test('last stock eliminates a fighter and declares the remaining winner', () => {
  const game = gameWith({ rule: 'stock', stocks: 1 });
  game.fighters[1].hp = 0;
  game.fighters[1].lastAttacker = 'a';
  game.step(FRAME);
  assert.equal(game.fighters[1].eliminated, true);
  assert.equal(game.phase, 'ended');
  assert.equal(game.winner, 'a');
  assert.equal(game.endReason, 'last-stock');
});

test('timed mode scores KOs and resolves the leaderboard when time expires', () => {
  const game = gameWith({ rule: 'timed', duration: 0.08, respawnDelay: 0 });
  game.fighters[1].hp = 0;
  game.fighters[1].lastAttacker = 'a';
  game.step(FRAME);
  assert.equal(game.fighters[0].score, 1);
  game.step(FRAME);
  assert.equal(game.fighters[1].knockedOut, false);
  advance(game, 0.08);
  assert.equal(game.phase, 'ended');
  assert.equal(game.winner, 'a');
  assert.equal(game.endReason, 'time');
});

test('training mode respawns forever and does not consume the timer', () => {
  const game = gameWith({ rule: 'training', duration: 0.01, respawnDelay: 0 });
  game.fighters[1].hp = 0;
  game.step(FRAME);
  game.step(FRAME);
  advance(game, 0.2);
  assert.equal(game.phase, 'battle');
  assert.equal(game.time, 0.01);
  assert.equal(game.fighters[1].hp, 100);
  assert.equal(game.fighters[1].eliminated, false);
});

test('pulse, lava, laser, rocks, and void emit deterministic damage events', () => {
  const options = {
    rule: 'training',
    fighters: [human('center', 0), human('lava', 0, -2.8), human('edge', 10)],
    hazards: [
      { type: 'pulse', delay: 0, interval: 99, force: 0 },
      { type: 'lava', delay: 0, interval: 99 },
      { type: 'laser', delay: 0, interval: 99, positions: [0] },
      { type: 'rocks', delay: 0, interval: 99, force: 0 },
      { type: 'void', delay: 0, interval: 99 },
    ],
  };
  const first = gameWith(options);
  const second = gameWith(options);
  first.drainEvents();
  second.drainEvents();
  first.step(FRAME);
  second.step(FRAME);
  const firstHazards = first.drainEvents().filter((event) => event.type === 'hazard');
  const secondHazards = second.drainEvents().filter((event) => event.type === 'hazard');
  assert.deepEqual(firstHazards, secondHazards);
  assert.deepEqual(firstHazards.map((event) => event.hazard), ['pulse', 'lava', 'laser', 'rocks', 'void']);
  assert.ok(firstHazards.every((event) => event.targets.length > 0));
});

test('four item classes, pause controls, and complete snapshots remain deterministic and DOM-free', () => {
  const game = gameWith({ rule: 'stock', stocks: 2 });
  const fighter = game.fighters[0];
  fighter.hp = 50;
  fighter.energy = 0;
  for (const type of ['energy', 'health', 'power', 'life']) game.spawnItem(type, fighter.x, fighter.z);
  game.step(FRAME);
  assert.equal(fighter.energy, 40);
  assert.equal(fighter.hp, 85);
  assert.ok(fighter.powerBoost > 5.9);
  assert.equal(fighter.stocks, 3);
  const itemTypes = game.drainEvents().filter((event) => event.type === 'itemPickup')
    .map((event) => event.itemType);
  assert.deepEqual(itemTypes, ['energy', 'health', 'power', 'life']);

  const time = game.time;
  game.pause();
  game.step(FRAME, { moveX: 1 });
  assert.equal(game.time, time);
  assert.equal(game.paused, true);
  game.resume();
  const state = game.getState();
  for (const field of ['fighters', 'projectiles', 'energyOrbs', 'items', 'hazards', 'ranking', 'events']) {
    assert.ok(Array.isArray(state[field]), `${field} should be snapshotted`);
  }
  assert.equal(state.player.id, 'a');
  assert.equal(state.enemy.id, 'b');
  assert.notEqual(state.player, game.player);
  assert.equal(globalThis.document, undefined);
});
