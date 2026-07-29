import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GameFlowController,
  InvalidFlowTransitionError,
} from '../src/app/GameFlowController.js';
import {
  MemoryStorage,
  SaveService,
  SAVE_VERSION,
} from '../src/services/SaveService.js';
import {
  SettingsService,
  SETTINGS_VERSION,
} from '../src/services/SettingsService.js';
import {
  CHARACTERS,
  CUP_ROUTE,
  DIFFICULTIES,
  ITEMS,
} from '../src/data/gameData.js';

function createServices(prefix = 'test') {
  const storage = new MemoryStorage();
  const saveService = new SaveService({ storage, key: `${prefix}.save`, now: () => 1234 });
  const settingsService = new SettingsService({ storage, key: `${prefix}.settings`, now: () => 1234 });
  return { storage, saveService, settingsService };
}

function reachMenu(flow) {
  assert.equal(flow.getState().screen, 'boot');
  flow.completeBoot();
  assert.equal(flow.getState().screen, 'title');
  flow.pressStart();
  assert.equal(flow.getState().screen, 'menu');
}

test('SaveService uses a versioned envelope and restores unlocks and records', () => {
  const { storage, saveService } = createServices('save-roundtrip');
  assert.equal(saveService.storageKind, 'memory');
  assert.equal(saveService.isCharacterUnlocked('renamon'), true);
  assert.equal(saveService.isCharacterUnlocked('tentomon'), true);

  saveService.unlockCharacter('diaboromon');
  saveService.unlockStage('volcano');
  saveService.addData(800);
  saveService.recordMatch({ mode: 'free', outcome: 'win', characterId: 'renamon', maxCombo: 7, durationSeconds: 82 });

  const envelope = JSON.parse(storage.getItem('save-roundtrip.save'));
  assert.equal(envelope.version, SAVE_VERSION);
  assert.equal(envelope.savedAt, 1234);

  const restored = new SaveService({ storage, key: 'save-roundtrip.save' });
  const data = restored.getData();
  assert.equal(data.profile.data, 800);
  assert.ok(data.profile.unlockedCharacters.includes('diaboromon'));
  assert.ok(data.profile.unlockedStages.includes('volcano'));
  assert.equal(data.records.matches, 1);
  assert.equal(data.records.wins, 1);
  assert.equal(data.records.bestCombo, 7);
  assert.equal(data.records.byCharacter.renamon.wins, 1);
});

test('SaveService migrates an unversioned legacy save without a browser', () => {
  const storage = new MemoryStorage({
    legacy: JSON.stringify({
      currency: 321,
      unlockedCharacters: ['agumon', 'diaboromon'],
      cupRound: 2,
      stats: { wins: 4, matches: 5 },
    }),
  });
  const save = new SaveService({ storage, key: 'legacy' });
  const data = save.getData();
  assert.equal(data.profile.data, 321);
  assert.deepEqual(data.profile.unlockedCharacters, ['agumon', 'diaboromon']);
  assert.equal(data.cup.currentRound, 2);
  assert.equal(data.records.wins, 4);
  assert.equal(JSON.parse(storage.getItem('legacy')).version, SAVE_VERSION);
});

test('SettingsService validates, persists, and migrates settings', () => {
  const storage = new MemoryStorage();
  const settings = new SettingsService({ storage, key: 'settings', now: () => 99 });
  settings.update({
    difficulty: 'veteran',
    masterVolume: 4,
    cameraShake: -2,
    battleTime: 500,
    freeEvolutionCheat: false,
  });
  settings.setControl('attack', 'Numpad1');

  const current = settings.getAll();
  assert.equal(current.difficulty, 'veteran');
  assert.equal(current.masterVolume, 1);
  assert.equal(current.cameraShake, 0);
  assert.equal(current.battleTime, 300);
  assert.equal(current.freeEvolutionCheat, false);
  assert.equal(current.controls.attack, 'Numpad1');
  assert.equal(JSON.parse(storage.getItem('settings')).version, SETTINGS_VERSION);

  storage.setItem('legacy-settings', JSON.stringify({ volume: 50, screenShake: false, timeLimit: 120 }));
  const migrated = new SettingsService({ storage, key: 'legacy-settings' }).getAll();
  assert.equal(migrated.masterVolume, 0.5);
  assert.equal(migrated.cameraShake, 0);
  assert.equal(migrated.battleTime, 120);
  assert.equal(migrated.freeEvolutionCheat, true);
});

test('six cup victories advance every round, unlock rewards, and reach the ending', () => {
  const { saveService, settingsService } = createServices('cup');
  const flow = new GameFlowController({ saveService, settingsService });
  reachMenu(flow);

  flow.openLab();
  assert.equal(flow.getState().screen, 'lab');
  flow.closeOverlay();
  flow.openOptions();
  assert.equal(flow.getState().screen, 'options');
  flow.closeOverlay();
  assert.equal(flow.getState().screen, 'menu');

  flow.openModeSelect();
  flow.selectMode('cup');
  assert.equal(flow.getState().screen, 'character');
  flow.selectCharacter('agumon');
  assert.equal(flow.getState().screen, 'cup');

  for (let round = 0; round < 6; round += 1) {
    const battle = flow.startBattle().context.match;
    assert.equal(flow.getState().screen, 'battle');
    assert.equal(battle.cupRound, round);
    if (round === 0) {
      flow.pause();
      assert.equal(flow.getState().screen, 'pause');
      flow.resume();
      assert.equal(flow.getState().screen, 'battle');
    }
    const result = flow.finishBattle({ winner: 'player', maxCombo: round + 2, durationSeconds: 40 });
    assert.equal(result.screen, 'result');
    assert.equal(result.context.result.outcome, 'win');
    flow.continueFromResult();
    assert.equal(flow.getState().screen, round === 5 ? 'ending' : 'cup');
  }

  const saved = saveService.getData();
  assert.equal(saved.cup.active, false);
  assert.equal(saved.cup.completions, 1);
  assert.equal(saved.cup.highestRound, 6);
  assert.equal(saved.records.matches, 6);
  assert.equal(saved.records.wins, 6);
  assert.equal(saved.profile.data, 2000);
  assert.ok(saved.profile.unlockedCharacters.includes('diaboromon'));
  assert.ok(saved.profile.unlockedCharacters.includes('apocalymon'));
  assert.ok(saved.profile.unlockedStages.includes('dark-area'));
  assert.ok(saved.profile.badges.includes('digital-cup-champion'));

  flow.completeEnding();
  assert.equal(flow.getState().screen, 'menu');
});

test('free battle supports stage selection, result retry, and return to setup', () => {
  const { saveService, settingsService } = createServices('free');
  const flow = new GameFlowController({ saveService, settingsService });
  reachMenu(flow);
  flow.openModeSelect();
  flow.selectMode('free');
  flow.selectCharacter('renamon');
  assert.equal(flow.getState().screen, 'stage');
  assert.throws(() => flow.selectStage('dark-area'), /尚未解锁/);
  flow.selectStage('terminal');
  flow.startBattle({ opponents: ['gabumon'], rule: 'timed' });
  assert.equal(flow.getState().context.match.rule, 'timed');
  flow.finishBattle({ outcome: 'loss' });
  flow.retryBattle();
  assert.equal(flow.getState().screen, 'battle');
  flow.finishBattle({ outcome: 'win' });
  flow.continueFromResult();
  assert.equal(flow.getState().screen, 'stage');
  assert.equal(flow.getState().context.stageId, 'terminal');
  assert.equal(saveService.getData().records.matches, 2);
});

test('invalid transitions and locked characters fail explicitly', () => {
  const { saveService, settingsService } = createServices('guards');
  const flow = new GameFlowController({ saveService, settingsService });
  assert.throws(() => flow.startBattle(), InvalidFlowTransitionError);
  reachMenu(flow);
  flow.openModeSelect();
  flow.selectMode('free');
  assert.throws(() => flow.selectCharacter('diaboromon'), /尚未解锁/);
  assert.throws(() => flow.dispatch('NOT_A_REAL_EVENT'), /未知流程事件/);
});

test('default services degrade to shared memory when localStorage is unavailable', () => {
  const save = new SaveService({ key: 'no-browser-save' });
  const settings = new SettingsService({ key: 'no-browser-settings' });
  assert.equal(save.storageKind, 'memory');
  assert.equal(settings.storageKind, 'memory');
  assert.doesNotThrow(() => save.addData(10));
  assert.doesNotThrow(() => settings.set('difficulty', 'rookie'));
});

test('expanded roster, items, difficulties, and cup encounters stay data-consistent', () => {
  const roster = new Map(CHARACTERS.map((character) => [character.id, character]));
  assert.deepEqual(roster.get('renamon').forms.map((form) => form.model), [
    './models/renamon.glb', './models/kyubimon.glb', './models/sakuyamon.glb',
  ]);
  assert.deepEqual(roster.get('tentomon').forms.map((form) => form.model), [
    './models/tentomon.glb', './models/kabuterimon.glb', './models/herculeskabuterimon.glb',
  ]);
  assert.deepEqual(ITEMS.map((item) => item.id), ['evo-orb', 'health', 'power', 'life']);
  assert.deepEqual(ITEMS.map((item) => item.effect), ['energy', 'health', 'power', 'life']);
  assert.equal(ITEMS.find((item) => item.id === 'life').amount, 1);
  assert.deepEqual(DIFFICULTIES.map((difficulty) => difficulty.id), ['rookie', 'normal', 'veteran']);
  assert.ok(CUP_ROUTE[2].opponents.includes('renamon'));
  assert.equal(CUP_ROUTE[2].target, 2);
  assert.ok(CUP_ROUTE[3].opponents.includes('tentomon'));
});
