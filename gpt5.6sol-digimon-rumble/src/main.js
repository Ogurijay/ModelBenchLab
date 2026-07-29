import * as THREE from 'three';
import { GameFlowController, FLOW_STATES } from './app/GameFlowController.js';
import { buildMatchConfig, summarizeBattle } from './app/MatchFactory.js';
import { AudioSystem } from './audio/AudioSystem.js';
import {
  ALL_CHARACTERS, ARENAS, BOSSES, CHARACTERS, CUP_ROUTE, DIFFICULTIES,
  GAME_MODES, ITEMS, RULES, getArena,
} from './data/gameData.js';
import { BattleSimulation } from './game/BattleSimulation.js';
import { InputController } from './game/InputController.js';
import { Arena } from './render/Arena.js';
import { EffectSystem } from './render/EffectSystem.js';
import { FighterView } from './render/FighterView.js';
import { AssetManager } from './services/AssetManager.js';
import { SaveService } from './services/SaveService.js';
import { SettingsService } from './services/SettingsService.js';
import { GameUI } from './ui/GameUI.js';

const FIXED_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.1;
const MAX_FIXED_STEPS = 8;
const FIGHTER_IDS = Object.freeze(['p1', 'p2', 'p3', 'p4']);
const FIGHTER_COLORS = Object.freeze([0xff9a24, 0x5de8ff, 0xd46bff, 0x7dff79]);
const EDGE_ACTIONS = Object.freeze(['attack', 'ranged', 'skill', 'jump', 'evolve', 'overdrive', 'pause']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const characterById = (id) => ALL_CHARACTERS.find((character) => character.id === id) ?? null;
const formatTime = (seconds) => {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
const colorHex = (value, fallback) => {
  try { return new THREE.Color(value ?? fallback).getHex(); }
  catch { return fallback; }
};
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const saveService = new SaveService();
const settingsService = new SettingsService();
const flow = new GameFlowController({ saveService, settingsService });
const ui = new GameUI({ root: document.querySelector('#productUI') });
const assetManager = new AssetManager();
const input = new InputController();
const audio = new AudioSystem();
const gameRoot = document.querySelector('#game');
if (!gameRoot) throw new Error('缺少 #game scene mount');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  ui.render(flow.getState(), { loading: { progress: 0, label: 'Graphics core failed' } });
  ui.fatal('Unable to start 3D arena', error.message);
  window.__bench = { ready: false, error, screen: FLOW_STATES.BOOT, state: flow.getState() };
  throw error;
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', 'Digimon 3D rumble arena');
gameRoot.replaceChildren(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030814);
scene.fog = new THREE.FogExp2(0x04101e, 0.026);
const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 140);
camera.position.set(0, 7.2, 18.5);
camera.lookAt(0, 1, 0);

const hemisphereLight = new THREE.HemisphereLight(0x8fdcff, 0x160b22, 1.6);
const keyLight = new THREE.DirectionalLight(0xffe2b6, 3.2);
keyLight.position.set(-8, 15, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -15;
keyLight.shadow.camera.right = 15;
keyLight.shadow.camera.top = 15;
keyLight.shadow.camera.bottom = -15;
keyLight.shadow.bias = -0.0008;
const rimLight = new THREE.PointLight(0x19cfff, 40, 35, 2);
rimLight.position.set(8, 7, -9);
const warmLight = new THREE.PointLight(0xff4e18, 32, 30, 2);
warmLight.position.set(-10, 5, 5);
scene.add(hemisphereLight, keyLight, rimLight, warmLight);

const arena = new Arena(scene, getArena('terminal'));
let effects = new EffectSystem(scene);
let activeArenaId = 'terminal';
let currentFlowState = flow.getState();
const selections = {
  rule: 'stock', localPlayers: 1, cpuCount: 1,
  difficulty: currentFlowState.settings.difficulty ?? 'normal',
  previewCharacterId: null, previewStageId: null,
};
const runtime = {
  ready: false, status: 'boot', simulation: null, definition: null,
  fighterViews: new Map(), characterByFighter: new Map(),
  loading: { progress: 0, label: 'Initializing battle core...', detail: '' },
  loadController: null, loadPromise: null, loadSerial: 0,
  accumulator: 0, pendingInput: {}, elapsed: 0, lastFrame: performance.now(),
  lastSnapshot: null, lastResult: null, finishTimer: null, finishPending: false,
  cameraShake: 0, damageDealt: 0, error: null,
};

function ensureArena(id) {
  const definition = getArena(id);
  if (activeArenaId !== definition.id) {
    arena.setArena(definition);
    activeArenaId = definition.id;
  }
  return definition;
}

function createRuntimeDefinition(flowState) {
  const config = buildMatchConfig(flowState, {
    localPlayers: selections.localPlayers,
    cpuCount: selections.cpuCount,
    difficulty: selections.difficulty,
    rule: selections.rule,
    battleTime: settingsService.get('battleTime'),
  });
  const stage = ensureArena(config.arena.id);
  const characters = config.roster.map((fighter) => characterById(fighter.characterId));
  if (characters.some((character) => !character)) throw new Error('Match roster contains an unknown character');
  return {
    match: config.meta.match,
    mode: config.meta.mode,
    stage,
    characters,
    fighters: config.roster,
    humanIds: config.humanIds,
    localPlayers: config.meta.localPlayers,
    cpuCount: config.meta.cpuCount,
    simulationOptions: {
      ...config.simulation,
      platform: { ...arena.getPlatformBounds(), fallY: -4 },
    },
  };
}
function fighterDisplay(fighter) {
  const character = runtime.characterByFighter.get(fighter.id);
  const form = character?.forms?.[fighter.formIndex] ?? character?.forms?.at(-1);
  return {
    ...fighter,
    name: form?.name ?? character?.name ?? fighter.name,
    en: form?.en ?? character?.en ?? fighter.id.toUpperCase(),
    human: fighter.controller === 'human', color: character?.color,
  };
}

function hudFighters(snapshot = runtime.lastSnapshot) {
  const source = snapshot?.fighters?.map(fighterDisplay) ?? [];
  return FIGHTER_IDS.map((id, index) => source[index] ?? {
    id, name: '-', en: 'NO LINK', hp: 0, energy: 0, stocks: 0,
    human: false, eliminated: true,
  });
}

function battleObjective(rule) {
  return {
    stock: 'Protect the last stock', timed: 'Score the most KOs before time expires',
    race: 'Complete the evolution cycle first', training: 'Practice movement, combos and evolution',
  }[rule] ?? 'Defeat every opponent';
}

function buildViewModel() {
  const snapshot = runtime.simulation?.getState() ?? runtime.lastSnapshot;
  const battle = snapshot ? {
    ...snapshot,
    status: runtime.status === 'loading' ? 'LINKING'
      : snapshot.phase === 'ready' ? 'STANDBY' : snapshot.phase === 'ended' ? 'COMPLETE' : 'BATTLE',
    objective: battleObjective(snapshot.rule),
  } : {
    time: settingsService.get('battleTime'),
    status: runtime.status === 'loading' ? 'LINKING' : 'STANDBY',
    objective: battleObjective(currentFlowState.context?.match?.rule ?? selections.rule),
  };
  return {
    settings: settingsService.getAll(),
    characters: CHARACTERS, bosses: BOSSES, allCharacters: ALL_CHARACTERS,
    stages: ARENAS, rules: RULES, cupRoute: CUP_ROUTE, modes: GAME_MODES,
    difficulties: DIFFICULTIES, items: ITEMS,
    rule: currentFlowState.context?.mode === 'training' ? 'training' : selections.rule,
    localPlayers: selections.localPlayers, cpuCount: selections.cpuCount,
    difficulty: selections.difficulty,
    previewCharacterId: selections.previewCharacterId,
    previewStageId: selections.previewStageId,
    fighters: hudFighters(snapshot), battle, loading: runtime.loading,
  };
}

function updateBattleHUD(snapshot) {
  const meta = {
    round: (currentFlowState.context?.match?.cupRound ?? 0) + 1,
    status: snapshot.phase === 'ready' ? 'STANDBY' : snapshot.phase === 'ended' ? 'COMPLETE' : 'BATTLE',
  };
  if (Number.isFinite(snapshot.time)) meta.time = snapshot.time;
  ui.setBattleHUD(hudFighters(snapshot), meta);
  document.body.classList.toggle('player-burst', snapshot.fighters.some(
    (fighter) => fighter.controller === 'human' && fighter.overdrive > 0,
  ));
}

function renderCurrent() {
  ui.render(currentFlowState, buildViewModel());
  if ([FLOW_STATES.BATTLE, FLOW_STATES.PAUSE].includes(currentFlowState.screen) && runtime.lastSnapshot) {
    updateBattleHUD(runtime.lastSnapshot);
  }
}

function applySettings(settings = settingsService.getAll()) {
  audio.setVolume(settings.masterVolume * settings.sfxVolume);
  const quality = settings.graphicsQuality ?? 'high';
  const pixelCap = quality === 'low' ? 1 : quality === 'medium' ? 1.35 : 1.75;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const shadowSize = quality === 'high' ? 2048 : 1024;
  if (keyLight.shadow.mapSize.x !== shadowSize) {
    keyLight.shadow.mapSize.set(shadowSize, shadowSize);
    keyLight.shadow.map?.dispose();
    keyLight.shadow.map = null;
  }
  renderer.toneMappingExposure = quality === 'low' ? 0.96 : 1.05;
  document.body.dataset.graphics = quality;
  document.body.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
}

function resizeRenderer() {
  const width = Math.max(1, gameRoot.clientWidth || window.innerWidth);
  const height = Math.max(1, gameRoot.clientHeight || window.innerHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  applySettings();
}

function resetEffects() {
  effects.dispose();
  effects = new EffectSystem(scene);
  if (runtime.definition) {
    effects.setFighterColors(runtime.definition.characters.map((character, index) => ({
      id: FIGHTER_IDS[index], color: colorHex(character.color, FIGHTER_COLORS[index]),
    })));
  }
}

function disposeCurrentMatch({ evict = true, keepDefinition = false, keepSnapshot = true } = {}) {
  clearTimeout(runtime.finishTimer);
  runtime.finishTimer = null;
  runtime.finishPending = false;
  runtime.loadSerial += 1;
  runtime.loadController?.abort();
  runtime.loadController = null;
  runtime.loadPromise = null;
  for (const view of runtime.fighterViews.values()) view.dispose();
  runtime.fighterViews.clear();
  runtime.characterByFighter.clear();
  runtime.simulation = null;
  runtime.pendingInput = {};
  runtime.accumulator = 0;
  runtime.cameraShake = 0;
  runtime.damageDealt = 0;
  if (!keepSnapshot) runtime.lastSnapshot = null;
  if (!keepDefinition) runtime.definition = null;
  resetEffects();
  if (evict) assetManager.evictUnused();
  document.body.classList.remove('battle-active', 'player-burst');
}

function createSimulation(definition) {
  runtime.simulation = new BattleSimulation(definition.simulationOptions);
  if (definition.mode === 'training') {
    for (const fighter of runtime.simulation.fighters) fighter.energy = 100;
  }
  runtime.status = 'active';
  runtime.error = null;
  runtime.damageDealt = 0;
  runtime.pendingInput = {};
  runtime.accumulator = 0;
  runtime.finishPending = false;
  runtime.lastSnapshot = runtime.simulation.getState();
  for (const view of runtime.fighterViews.values()) {
    view.setForm(0, { force: true });
    view.root.visible = true;
  }
  input.clearActions();
  document.body.classList.add('battle-active');
  renderCurrent();
  processEvents(runtime.simulation.drainEvents());
}

async function loadCurrentMatch() {
  const match = currentFlowState.context?.match;
  if (!match || currentFlowState.screen !== FLOW_STATES.BATTLE) throw new Error('No match configuration is ready');
  disposeCurrentMatch({ evict: true, keepSnapshot: false });
  const serial = ++runtime.loadSerial;
  const controller = new AbortController();
  runtime.loadController = controller;
  const definition = createRuntimeDefinition(currentFlowState);
  runtime.definition = definition;
  runtime.status = 'loading';
  runtime.error = null;
  runtime.loading = { progress: 0, label: 'Loading match Digimon data...', detail: '' };
  ui.fatal('', '');
  renderCurrent();
  ui.announce('CONNECTING', { kicker: 'MATCH DATA', duration: 900 });

  const task = (async () => {
    const created = [];
    try {
      await assetManager.loadMatch(definition.characters, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (serial !== runtime.loadSerial) return;
          runtime.loading = {
            progress: progress.progress, label: 'Loading match Digimon data...',
            detail: `${progress.completed ?? 0} / ${progress.totalAssets ?? 0}`,
          };
          ui.setLoading(runtime.loading);
        },
      });
      for (let index = 0; index < definition.characters.length; index += 1) {
        const character = definition.characters[index];
        const view = await FighterView.create(assetManager, character, {
          signal: controller.signal,
          accent: colorHex(character.accent, FIGHTER_COLORS[index]),
          player: definition.fighters[index].controller === 'human',
          targetHeight: character.forms[0]?.height ?? 2.5,
          transitionDuration: settingsService.get('reducedMotion') ? 0 : 0.1,
        });
        created.push(view);
      }
      if (serial !== runtime.loadSerial || controller.signal.aborted) {
        created.forEach((view) => view.dispose());
        return null;
      }
      created.forEach((view, index) => {
        const id = FIGHTER_IDS[index];
        runtime.fighterViews.set(id, view);
        runtime.characterByFighter.set(id, definition.characters[index]);
        scene.add(view.root);
      });
      effects.setFighterColors(definition.characters.map((character, index) => ({
        id: FIGHTER_IDS[index], color: colorHex(character.color, FIGHTER_COLORS[index]),
      })));
      runtime.loading = { progress: 1, label: 'Match data ready', detail: created.length + ' FIGHTERS' };
      runtime.loadController = null;
      ui.setLoading(runtime.loading);
      createSimulation(definition);
      return runtime.lastSnapshot;
    } catch (error) {
      created.forEach((view) => view.dispose());
      if (serial !== runtime.loadSerial || error?.name === 'AbortError') return null;
      runtime.status = 'error';
      runtime.error = error;
      runtime.loadController = null;
      ui.fatal('Match resources failed to load', error.message + '. Press R to retry or Esc for main menu.');
      ui.toast('Load failed. Press R to retry this match.', { tone: 'error', duration: 0 });
      console.error('Match load failed', error);
      return null;
    } finally {
      if (serial === runtime.loadSerial) runtime.loadPromise = null;
    }
  })();
  runtime.loadPromise = task;
  return task;
}

function vibrate(strength = 0.35, duration = 80) {
  const amount = clamp(settingsService.get('cameraShake'), 0, 1) * strength;
  if (amount <= 0) return;
  try {
    for (const pad of navigator.getGamepads?.() ?? []) {
      const actuator = pad?.vibrationActuator;
      actuator?.playEffect?.('dual-rumble', {
        duration, startDelay: 0, weakMagnitude: Math.min(1, amount * 0.65), strongMagnitude: Math.min(1, amount),
      })?.catch?.(() => {});
    }
    navigator.vibrate?.(Math.min(160, duration));
  } catch { /* Vibration is optional. */ }
}

function fighterLabel(id) {
  const fighter = runtime.lastSnapshot?.fighters?.find((item) => item.id === id);
  return fighterDisplay(fighter ?? { id, name: id, formIndex: 0 }).name;
}

function processEvents(events = []) {
  const humanIds = new Set(runtime.definition?.fighters.filter((fighter) => fighter.controller === 'human').map((fighter) => fighter.id));
  for (const event of events) {
    const duplicateEvolutionAlias = event.type === 'overdrive' && ['evolution', 'ultra'].includes(event.mode);
    if (!duplicateEvolutionAlias) {
      audio.play(event);
      effects.handle(event);
    }
    if (event.type === 'energyPickup') {
      const alias = { ...event, type: 'itemPickup', y: 0.8 };
      audio.play(alias);
      effects.handle(alias);
    }
    if (event.type === 'announce') ui.announce(event.text, { duration: event.text === 'READY' ? 1100 : 900 });
    if (event.type === 'hit') {
      runtime.cameraShake = Math.min(0.9, runtime.cameraShake + event.damage * 0.012);
      if (humanIds.has(event.attacker)) runtime.damageDealt += event.damage;
      vibrate(Math.min(0.8, event.damage / 25), 75);
    }
    if (event.type === 'evolution') {
      ui.announce((event.form || fighterLabel(event.fighter)) + ' EVOLUTION', { kicker: event.forced ? 'CHEAT // FORM +' : 'DIGIVOLUTION', tone: 'gold', duration: 1300 });
      runtime.cameraShake = Math.max(runtime.cameraShake, 0.34);
      vibrate(0.55, 260);
    }
    if (event.type === 'devolution') {
      ui.announce((event.form || fighterLabel(event.fighter)) + ' DE-EVOLUTION', { kicker: 'CHEAT // FORM −', duration: 1150 });
      runtime.cameraShake = Math.max(runtime.cameraShake, 0.22);
      vibrate(0.35, 160);
    }
    if (event.type === 'ultra') {
      ui.announce('ULTIMATE BURST', { kicker: fighterLabel(event.fighter), tone: 'gold', duration: 1350 });
      runtime.cameraShake = Math.max(runtime.cameraShake, 0.7);
      vibrate(0.9, 420);
    }
    if (event.type === 'ko') {
      ui.announce(`${fighterLabel(event.fighter)} K.O.`, { kicker: 'DATA BREAK', tone: 'red', duration: 1000 });
      runtime.cameraShake = Math.max(runtime.cameraShake, 0.65);
      vibrate(0.8, 260);
    }
    if (event.type === 'respawn') ui.announce(`${fighterLabel(event.fighter)} RE:LINK`, { duration: 750 });
    if (event.type === 'itemSpawn') ui.toast('Item data spawned', { tone: 'info', duration: 1200 });
    if (event.type === 'itemPickup') ui.toast(fighterLabel(event.fighter) + ' GET ' + event.itemType.toUpperCase(), { duration: 1100 });
    if (event.type === 'hazard') {
      runtime.cameraShake = Math.max(runtime.cameraShake, 0.25);
      vibrate(0.35, 130);
    }
    if (event.type === 'ended') queueBattleFinish();
  }
}

function summarizeResult(snapshot) {
  const humanIds = runtime.definition?.humanIds ?? [];
  const summary = summarizeBattle({ ...snapshot, damageDealt: runtime.damageDealt }, humanIds);
  const human = snapshot.fighters.find((fighter) => humanIds.includes(fighter.id))
    ?? snapshot.fighters.find((fighter) => fighter.controller === 'human')
    ?? snapshot.fighters[0];
  const hp = Math.round((human.hp / Math.max(1, human.maxHp)) * 100);
  return {
    ...summary,
    hp,
    player: { ...human, hp },
    timeText: formatTime(summary.durationSeconds),
    damageDealt: Math.round(summary.damageDealt),
    ranking: snapshot.ranking,
  };
}
function finalizeBattle() {
  clearTimeout(runtime.finishTimer);
  runtime.finishTimer = null;
  if (!runtime.simulation || currentFlowState.screen !== FLOW_STATES.BATTLE) return null;
  const snapshot = runtime.simulation.getState();
  if (snapshot.phase !== 'ended') return null;
  const result = summarizeResult(snapshot);
  runtime.lastSnapshot = snapshot;
  runtime.lastResult = result;
  runtime.status = 'result';
  flow.finishBattle(result);
  disposeCurrentMatch({ evict: true, keepSnapshot: true });
  return result;
}

function queueBattleFinish() {
  if (runtime.finishPending) return;
  runtime.finishPending = true;
  runtime.finishTimer = setTimeout(finalizeBattle, settingsService.get('reducedMotion') ? 180 : 850);
}

function syncVisuals(snapshot, dt) {
  runtime.lastSnapshot = snapshot;
  for (const fighter of snapshot.fighters) {
    const view = runtime.fighterViews.get(fighter.id);
    if (!view) continue;
    view.root.visible = !fighter.eliminated && !fighter.knockedOut;
    view.sync(fighter, dt, runtime.elapsed, snapshot.phase === 'ended' ? snapshot.winner : null);
  }
  effects.syncProjectiles(snapshot.projectiles);
  effects.syncPickup(snapshot.pickup, runtime.elapsed);
  updateBattleHUD(snapshot);
}

function updateCamera(snapshot, dt) {
  const settings = settingsService.getAll();
  const fighters = snapshot?.fighters?.filter((fighter) => !fighter.eliminated && !fighter.knockedOut) ?? [];
  let centerX = 0;
  let spanX = 0;
  let maxY = 0;
  if (fighters.length) {
    const xs = fighters.map((fighter) => fighter.x);
    centerX = (Math.min(...xs) + Math.max(...xs)) * 0.5;
    spanX = Math.max(...xs) - Math.min(...xs);
    maxY = Math.max(...fighters.map((fighter) => fighter.y));
  }
  const distance = fighters.length ? clamp(13.5 + spanX * 0.52, 14.5, 26) : 18.5;
  const desired = new THREE.Vector3(centerX, 6.2 + spanX * 0.045, distance);
  const smoothing = settings.reducedMotion ? 1 : 1 - Math.exp(-dt * 4.2);
  camera.position.lerp(desired, smoothing);
  runtime.cameraShake = Math.max(0, runtime.cameraShake - dt * 2.8);
  const shake = settings.reducedMotion ? 0 : runtime.cameraShake * settings.cameraShake;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.55;
  }
  camera.lookAt(centerX, 1.15 + maxY * 0.2, 0);
}

function hazardWarning(snapshot) {
  const hazards = snapshot?.hazards ?? [];
  if (!hazards.length) return { active: false, progress: 0 };
  const hazard = [...hazards].sort((a, b) => (a.clock / a.interval) - (b.clock / b.interval))[0];
  const progress = 1 - clamp(hazard.clock / Math.max(0.1, hazard.interval), 0, 1);
  return { active: hazard.clock <= 0.8, progress, type: hazard.type };
}

function mergePendingInput(sample) {
  for (const [id, command] of Object.entries(sample)) {
    const previous = runtime.pendingInput[id] ?? {};
    const merged = { ...previous, ...command, moveX: command.moveX ?? 0, moveZ: 0 };
    for (const action of EDGE_ACTIONS) merged[action] = Boolean(previous[action] || command[action]);
    runtime.pendingInput[id] = merged;
  }
}

function consumeStepInput() {
  const result = {};
  for (const [id, command] of Object.entries(runtime.pendingInput)) {
    result[id] = { ...command };
    runtime.pendingInput[id] = { moveX: command.moveX ?? 0, moveZ: 0 };
  }
  return result;
}

function stepSimulation(dt = FIXED_STEP, suppliedInput = null) {
  const simulation = runtime.simulation;
  if (!simulation || simulation.phase === 'ended') return runtime.lastSnapshot;
  if (runtime.definition?.mode === 'training') {
    for (const fighter of simulation.fighters) fighter.energy = 100;
  }
  simulation.step(dt, { fighters: suppliedInput ?? consumeStepInput() });
  if (runtime.definition?.mode === 'training') {
    for (const fighter of simulation.fighters) fighter.energy = 100;
  }
  processEvents(simulation.drainEvents());
  runtime.lastSnapshot = simulation.getState();
  return runtime.lastSnapshot;
}

function pauseBattle() {
  if (currentFlowState.screen !== FLOW_STATES.BATTLE) return currentFlowState;
  runtime.simulation?.pause();
  processEvents(runtime.simulation?.drainEvents());
  input.clearActions();
  return flow.pause();
}

function resumeBattle() {
  if (currentFlowState.screen !== FLOW_STATES.PAUSE) return currentFlowState;
  runtime.simulation?.resume();
  processEvents(runtime.simulation?.drainEvents());
  input.clearActions();
  return flow.resume();
}

async function restartBattle() {
  if (currentFlowState.screen === FLOW_STATES.RESULT) flow.retryBattle();
  else if (currentFlowState.screen === FLOW_STATES.PAUSE) flow.resume();
  if (runtime.definition && runtime.fighterViews.size) {
    resetEffects();
    createSimulation(runtime.definition);
    return runtime.lastSnapshot;
  }
  return loadCurrentMatch();
}

async function beginBattle(payload = {}) {
  if (runtime.status === 'loading') return runtime.loadPromise;
  if (currentFlowState.screen === FLOW_STATES.STAGE && payload.stageId
      && payload.stageId !== currentFlowState.context.stageId) flow.selectStage(payload.stageId);
  const mode = currentFlowState.context.mode;
  const overrides = {
    rule: mode === 'training' ? 'training' : selections.rule,
    localPlayers: mode === 'free' ? selections.localPlayers : 1,
    cpuCount: mode === 'free' ? selections.cpuCount : undefined,
    difficulty: selections.difficulty,
    ...payload,
  };
  flow.startBattle(overrides);
  return loadCurrentMatch();
}

function exitToMenu() {
  disposeCurrentMatch({ evict: true, keepSnapshot: false });
  runtime.status = 'menu';
  input.clearActions();
  return flow.exitToMenu();
}

function changeCharacterFromResult() {
  const completed = currentFlowState.context.result?.cupCompleted;
  if (completed) {
    flow.exitToMenu();
    flow.openModeSelect();
    flow.selectMode('cup');
    return flow.getState();
  }
  flow.continueFromResult();
  if ([FLOW_STATES.CUP, FLOW_STATES.STAGE].includes(flow.screen)) flow.back();
  return flow.getState();
}

function shiftCheatForm(direction, fighterId = null) {
  if (!settingsService.get('freeEvolutionCheat')) {
    ui.toast('请先在系统设定中开启自由进化作弊', { tone: 'error', duration: 1800 });
    return false;
  }
  const simulation = runtime.simulation;
  if (!simulation || ![FLOW_STATES.BATTLE, FLOW_STATES.PAUSE].includes(currentFlowState.screen)) return false;
  const target = simulation.fighters.find((fighter) => fighter.id === fighterId)
    ?? simulation.fighters.find((fighter) => fighter.controller === 'human')
    ?? simulation.fighters[0];
  const event = simulation.forceForm(target?.id, direction);
  if (!event) {
    ui.toast(direction > 0 ? '已经是最终形态' : '已经是初始形态', { duration: 1100 });
    return false;
  }
  processEvents(simulation.drainEvents());
  const snapshot = simulation.getState();
  syncVisuals(snapshot, FIXED_STEP);
  return event;
}

async function handleAction(action, payload = {}) {
  audio.unlock();
  switch (action) {
    case 'press-start': return flow.pressStart();
    case 'open-mode': return flow.openModeSelect();
    case 'resume-cup': {
      const cup = saveService.getData().cup;
      flow.openModeSelect();
      flow.selectMode('cup');
      return flow.selectCharacter(cup.characterId ?? CHARACTERS[0].id, { resumeCup: true });
    }
    case 'open-lab': return flow.openLab();
    case 'open-options': return flow.openOptions();
    case 'select-mode':
      selections.rule = payload.mode === 'training' ? 'training' : 'stock';
      selections.localPlayers = 1;
      selections.cpuCount = 1;
      return flow.selectMode(payload.mode);
    case 'select-character':
      selections.previewCharacterId = payload.characterId;
      return flow.selectCharacter(payload.characterId, payload);
    case 'select-stage':
      selections.previewStageId = payload.stageId;
      ensureArena(payload.stageId);
      return flow.selectStage(payload.stageId);
    case 'set-rule':
      selections.rule = currentFlowState.context.mode === 'training' ? 'training' : payload.rule;
      renderCurrent(); return currentFlowState;
    case 'set-local-players':
      selections.localPlayers = clamp(Math.floor(payload.localPlayers ?? payload.count), 1, 4);
      selections.cpuCount = clamp(selections.cpuCount, 0, 4 - selections.localPlayers);
      if (selections.localPlayers + selections.cpuCount < 2) selections.cpuCount = 1;
      renderCurrent(); return currentFlowState;
    case 'set-cpu-count':
      selections.cpuCount = clamp(Math.floor(payload.cpuCount), 0, 4 - selections.localPlayers);
      if (selections.localPlayers + selections.cpuCount < 2) selections.cpuCount = 1;
      renderCurrent(); return currentFlowState;
    case 'set-difficulty':
      selections.difficulty = payload.difficulty;
      renderCurrent(); return currentFlowState;
    case 'start-battle': return beginBattle(payload);
    case 'pause': return pauseBattle();
    case 'resume': return resumeBattle();
    case 'restart-battle': return restartBattle();
    case 'cheat-evolve': return shiftCheatForm(1, payload.fighterId);
    case 'cheat-devolve': return shiftCheatForm(-1, payload.fighterId);
    case 'retry': return restartBattle();
    case 'continue':
      disposeCurrentMatch({ evict: true, keepSnapshot: false });
      return flow.continueFromResult();
    case 'change-character': return changeCharacterFromResult();
    case 'exit-to-menu': return exitToMenu();
    case 'complete-ending': return flow.completeEnding();
    case 'lab-select':
      selections.previewCharacterId = payload.characterId;
      renderCurrent(); return currentFlowState;
    case 'setting-change': {
      const settings = settingsService.set(payload.name, payload.value);
      if (payload.name === 'difficulty') selections.difficulty = settings.difficulty;
      applySettings(settings);
      renderCurrent(); return settings;
    }
    case 'reset-settings': {
      const settings = settingsService.reset();
      selections.difficulty = settings.difficulty;
      applySettings(settings);
      renderCurrent();
      ui.toast('Settings restored to defaults');
      return settings;
    }
    case 'close-overlay': return flow.closeOverlay();
    case 'back':
      if (currentFlowState.screen === FLOW_STATES.BATTLE) return pauseBattle();
      if (currentFlowState.screen === FLOW_STATES.PAUSE) return resumeBattle();
      return flow.back();
    default: throw new RangeError(`Unknown UI action: ${action}`);
  }
}

function reportActionError(error) {
  console.error(error);
  ui.toast(error.message || 'Action failed', { tone: 'error', duration: 2600 });
}

ui.setActionHandler((action, payload) => {
  Promise.resolve(handleAction(action, payload)).catch(reportActionError);
});

flow.subscribe((state) => {
  currentFlowState = state;
  if (state.screen === FLOW_STATES.CUP) {
    const round = CUP_ROUTE[state.context.cupRound ?? state.save.cup.currentRound ?? 0];
    if (round) ensureArena(round.arena);
  } else if (state.screen === FLOW_STATES.STAGE && state.context.stageId) ensureArena(state.context.stageId);
  renderCurrent();
}, { immediate: true });

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(MAX_FRAME_DELTA, Math.max(0, (now - runtime.lastFrame) / 1000));
  runtime.lastFrame = now;
  runtime.elapsed += dt;
  const simulation = runtime.simulation;
  let snapshot = simulation?.getState() ?? null;

  if (simulation && runtime.status === 'active' && currentFlowState.screen === FLOW_STATES.BATTLE && simulation.phase !== 'ended') {
    const sampled = input.readAll(simulation.fighters, 0);
    if (Object.values(sampled).some((command) => command.pause)) {
      pauseBattle();
    } else {
      mergePendingInput(sampled);
      runtime.accumulator += dt;
      let steps = 0;
      while (runtime.accumulator >= FIXED_STEP && steps < MAX_FIXED_STEPS) {
        snapshot = stepSimulation(FIXED_STEP);
        runtime.accumulator -= FIXED_STEP;
        steps += 1;
        if (snapshot?.phase === 'ended') break;
      }
      if (steps === MAX_FIXED_STEPS) runtime.accumulator = 0;
    }
  }

  snapshot = runtime.simulation?.getState() ?? snapshot;
  if (snapshot) syncVisuals(snapshot, dt);
  updateCamera(snapshot, dt);
  arena.update(runtime.elapsed, snapshot ? hazardWarning(snapshot) : { active: false, progress: 0 });
  effects.update(dt);
  renderer.render(scene, camera);
}

function availableCharacter(id) {
  const unlocked = saveService.getData().profile.unlockedCharacters;
  return unlocked.includes(id) ? characterById(id) : characterById(unlocked[0]) ?? CHARACTERS[0];
}

function availableStage(id) {
  const unlocked = saveService.getData().profile.unlockedStages;
  return unlocked.includes(id) ? getArena(id) : getArena(unlocked[0] ?? 'terminal');
}

async function startQuickMatch(options = {}) {
  disposeCurrentMatch({ evict: true, keepSnapshot: false });
  if (flow.screen === FLOW_STATES.BOOT) flow.completeBoot();
  if (flow.screen === FLOW_STATES.TITLE) flow.pressStart();
  else if (flow.screen !== FLOW_STATES.MENU) flow.exitToMenu();
  const mode = ['cup', 'free', 'training'].includes(options.mode) ? options.mode : 'free';
  const ids = Array.isArray(options.characterIds) ? options.characterIds : [];
  const primary = availableCharacter(options.characterId ?? ids[0] ?? 'agumon');
  flow.openModeSelect();
  flow.selectMode(mode);
  flow.selectCharacter(primary.id, { resumeCup: options.resumeCup !== false });
  if (mode !== 'cup') {
    const stage = availableStage(options.stageId ?? 'terminal');
    flow.selectStage(stage.id);
    selections.rule = mode === 'training' ? 'training' : (options.rule ?? 'stock');
    selections.localPlayers = mode === 'free' ? clamp(options.localPlayers ?? 1, 1, 4) : 1;
    selections.cpuCount = mode === 'free'
      ? clamp(options.cpuCount ?? (Math.max(0, ids.length - selections.localPlayers) || 1), 0, 4 - selections.localPlayers)
      : 1;
    if (selections.localPlayers + selections.cpuCount < 2) selections.cpuCount = 1;
    selections.difficulty = options.difficulty ?? selections.difficulty;
    return beginBattle({
      stageId: stage.id, rule: selections.rule,
      localPlayers: selections.localPlayers, cpuCount: selections.cpuCount,
      difficulty: selections.difficulty, opponents: ids.slice(1),
    });
  }
  return beginBattle({ difficulty: options.difficulty ?? selections.difficulty });
}

function finishCurrentMatch(winner = 'player') {
  const simulation = runtime.simulation;
  if (!simulation) return null;
  const human = simulation.fighters.find((fighter) => fighter.controller === 'human') ?? simulation.fighters[0];
  const enemy = simulation.fighters.find((fighter) => fighter.controller === 'cpu')
    ?? simulation.fighters.find((fighter) => fighter !== human);
  const winnerId = winner === 'player' ? human?.id : winner === 'enemy' || winner === 'cpu' ? enemy?.id : winner;
  simulation.finish(winnerId ?? 'draw', 'automation');
  processEvents(simulation.drainEvents());
  return finalizeBattle();
}

function benchState() {
  return {
    ...flow.getState(), runtime: {
      ready: runtime.ready, status: runtime.status, loading: { ...runtime.loading },
      battle: runtime.simulation?.getState() ?? runtime.lastSnapshot,
      result: runtime.lastResult, error: runtime.error?.message ?? null,
      assets: assetManager.stats,
    },
  };
}

const bench = {
  getState: benchState,
  dispatch: (action, payload) => handleAction(action, payload),
  startQuickMatch,
  startBattle: (payload) => beginBattle(payload),
  finishCurrentMatch,
  retryCurrentMatch: () => restartBattle(),
  pause: () => pauseBattle(),
  resume: () => resumeBattle(),
  retry: () => restartBattle(),
  cheatEvolve: (fighterId) => shiftCheatForm(1, fighterId),
  cheatDevolve: (fighterId) => shiftCheatForm(-1, fighterId),
  next: () => handleAction('continue'),
  exitToMenu,
  stepFrame(frames = 1, commands = {}) {
    for (let index = 0; index < Math.max(0, Math.floor(frames)); index += 1) stepSimulation(FIXED_STEP, commands.fighters ?? commands);
    const snapshot = runtime.simulation?.getState() ?? runtime.lastSnapshot;
    if (snapshot && runtime.simulation) syncVisuals(snapshot, FIXED_STEP);
    return snapshot;
  },
  waitForMatch: () => runtime.loadPromise ?? Promise.resolve(runtime.lastSnapshot),
  assetStats: () => ({ ...assetManager.stats }),
};
Object.defineProperties(bench, {
  ready: { enumerable: true, get: () => runtime.ready },
  screen: { enumerable: true, get: () => flow.screen },
  state: { enumerable: true, get: benchState },
});
window.__bench = bench;

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && runtime.status === 'error'
      && flow.canTransition(FLOW_STATES.MENU)) {
    event.preventDefault();
    event.stopPropagation();
    runtime.error = null;
    ui.fatal('', '');
    Promise.resolve()
      .then(exitToMenu)
      .then(() => ui.toast('Returned to main menu', { duration: 1200 }))
      .catch(reportActionError);
  } else if (event.code === 'KeyR' && runtime.status === 'error') {
    event.preventDefault();
    restartBattle().catch(reportActionError);
  } else if (event.code === 'KeyR' && currentFlowState.screen === FLOW_STATES.RESULT) {
    event.preventDefault();
    restartBattle().catch(reportActionError);
  } else if (event.code === 'Enter' && currentFlowState.screen === FLOW_STATES.TITLE
      && !event.target.closest?.('button, input, select')) {
    event.preventDefault();
    handleAction('press-start').catch(reportActionError);
  }
}, { capture: true });
window.addEventListener('resize', resizeRenderer);
document.addEventListener('visibilitychange', () => {
  runtime.lastFrame = performance.now();
  runtime.accumulator = 0;
  if (document.hidden && currentFlowState.screen === FLOW_STATES.BATTLE) pauseBattle();
});
window.addEventListener('beforeunload', () => {
  disposeCurrentMatch({ evict: true, keepSnapshot: false });
  input.dispose();
  audio.dispose();
  effects.dispose();
  arena.dispose();
  renderer.dispose();
}, { once: true });

async function boot() {
  runtime.status = 'boot';
  runtime.loading = { progress: 0.2, label: 'Initializing graphics core...', detail: 'WEBGL' };
  renderCurrent();
  ui.setLoading(runtime.loading);
  resizeRenderer();
  await nextFrame();
  runtime.loading = { progress: 0.72, label: 'Calibrating input and save data...', detail: 'LOCAL' };
  ui.setLoading(runtime.loading);
  await nextFrame();
  runtime.loading = { progress: 1, label: 'Battle core ready', detail: 'READY' };
  ui.setLoading(runtime.loading);
  runtime.ready = true;
  runtime.status = 'title';
  flow.completeBoot();
}

applySettings();
resizeRenderer();
requestAnimationFrame(frame);
boot().catch((error) => {
  runtime.error = error;
  runtime.status = 'error';
  ui.fatal('Boot flow failed', error.message);
  console.error(error);
});
