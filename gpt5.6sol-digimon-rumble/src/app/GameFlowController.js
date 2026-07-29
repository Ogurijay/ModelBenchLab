import { ALL_CHARACTERS, ARENAS, CUP_ROUTE } from '../data/gameData.js';
import { SaveService } from '../services/SaveService.js';
import { SettingsService } from '../services/SettingsService.js';

export const FLOW_STATES = Object.freeze({
  BOOT: 'boot',
  TITLE: 'title',
  MENU: 'menu',
  MODE: 'mode',
  CHARACTER: 'character',
  STAGE: 'stage',
  CUP: 'cup',
  BATTLE: 'battle',
  PAUSE: 'pause',
  RESULT: 'result',
  ENDING: 'ending',
  LAB: 'lab',
  OPTIONS: 'options',
});

export const FLOW_TRANSITIONS = Object.freeze({
  boot: Object.freeze(['title']),
  title: Object.freeze(['menu']),
  menu: Object.freeze(['title', 'mode', 'lab', 'options']),
  mode: Object.freeze(['menu', 'character', 'lab', 'options']),
  character: Object.freeze(['mode', 'stage', 'cup', 'menu']),
  stage: Object.freeze(['character', 'battle', 'menu']),
  cup: Object.freeze(['character', 'battle', 'menu']),
  battle: Object.freeze(['pause', 'result', 'menu']),
  pause: Object.freeze(['battle', 'menu']),
  result: Object.freeze(['battle', 'cup', 'stage', 'ending', 'menu']),
  ending: Object.freeze(['menu', 'title']),
  lab: Object.freeze(['menu', 'mode']),
  options: Object.freeze(['menu', 'mode']),
});

export const BATTLE_MODES = Object.freeze(['cup', 'free', 'training']);

export const DEFAULT_CUP_REWARDS = Object.freeze([
  Object.freeze({ unlockStages: ['volcano'] }),
  Object.freeze({ data: 800, unlockStages: ['jungle'] }),
  Object.freeze({ unlockStages: ['factory'] }),
  Object.freeze({ data: 1200 }),
  Object.freeze({ unlockCharacters: ['diaboromon'] }),
  Object.freeze({ unlockCharacters: ['apocalymon'], unlockStages: ['dark-area'], badges: ['digital-cup-champion'] }),
]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function normalizedOutcome(result = {}) {
  if (['win', 'loss', 'draw'].includes(result.outcome)) return result.outcome;
  if (result.winner === 'player') return 'win';
  if (result.winner === 'enemy' || result.winner === 'cpu') return 'loss';
  return 'draw';
}

export class InvalidFlowTransitionError extends Error {
  constructor(from, to, reason = '') {
    super(`不能从 ${from} 进入 ${to}${reason ? `：${reason}` : ''}`);
    this.name = 'InvalidFlowTransitionError';
    this.from = from;
    this.to = to;
    this.reason = reason;
  }
}

export class GameFlowController {
  constructor({
    saveService = new SaveService(),
    settingsService = new SettingsService(),
    cupRoute = CUP_ROUTE,
    cupRewards = DEFAULT_CUP_REWARDS,
    characters = ALL_CHARACTERS,
    stages = ARENAS,
  } = {}) {
    if (!Array.isArray(cupRoute) || cupRoute.length !== 6) {
      throw new RangeError('数码杯路线必须恰好包含 6 关');
    }
    this.saveService = saveService;
    this.settingsService = settingsService;
    this.cupRoute = clone(cupRoute);
    this.cupRewards = clone(cupRewards);
    this.characterIds = new Set(characters.map((item) => item.id));
    this.stageIds = new Set(stages.map((item) => item.id));
    this.listeners = new Set();
    this.screen = FLOW_STATES.BOOT;
    this.revision = 0;
    this.context = {
      mode: null,
      characterId: null,
      stageId: null,
      cupRound: null,
      match: null,
      result: null,
      overlayReturn: null,
    };
  }

  getState() {
    return {
      screen: this.screen,
      revision: this.revision,
      context: clone(this.context),
      save: this.saveService.getData(),
      settings: this.settingsService.getAll(),
      canGoBack: this.canGoBack(),
    };
  }

  subscribe(listener, { immediate = false } = {}) {
    if (typeof listener !== 'function') throw new TypeError('流程订阅器必须是函数');
    this.listeners.add(listener);
    if (immediate) listener(this.getState(), { from: null, to: this.screen, reason: 'subscribe' });
    return () => this.listeners.delete(listener);
  }

  canTransition(to) {
    return Boolean(FLOW_TRANSITIONS[this.screen]?.includes(to));
  }

  canGoBack() {
    return ![FLOW_STATES.BOOT, FLOW_STATES.TITLE, FLOW_STATES.BATTLE].includes(this.screen);
  }

  completeBoot() {
    this.#move(FLOW_STATES.TITLE, {}, 'boot-ready');
    return this.getState();
  }

  pressStart() {
    this.#move(FLOW_STATES.MENU, {}, 'press-start');
    return this.getState();
  }

  openModeSelect() {
    this.#move(FLOW_STATES.MODE, {}, 'open-mode-select');
    return this.getState();
  }

  selectMode(mode) {
    if (!BATTLE_MODES.includes(mode)) throw new RangeError(`未知战斗模式：${mode}`);
    this.#move(FLOW_STATES.CHARACTER, {
      mode,
      characterId: null,
      stageId: null,
      cupRound: null,
      match: null,
      result: null,
    }, `select-mode:${mode}`);
    return this.getState();
  }

  selectCharacter(characterId, { resumeCup = true } = {}) {
    this.#assertScreen(FLOW_STATES.CHARACTER);
    if (!this.characterIds.has(characterId)) throw new RangeError(`未知角色：${characterId}`);
    if (!this.saveService.isCharacterUnlocked(characterId)) throw new RangeError(`角色尚未解锁：${characterId}`);
    if (!this.context.mode) throw new Error('选择角色前必须先选择模式');

    if (this.context.mode === 'cup') {
      const cup = this.saveService.beginCup(characterId, { resume: resumeCup });
      this.#move(FLOW_STATES.CUP, {
        characterId,
        stageId: null,
        cupRound: cup.currentRound,
        match: null,
        result: null,
      }, `select-character:${characterId}`);
    } else {
      this.#move(FLOW_STATES.STAGE, {
        characterId,
        stageId: null,
        cupRound: null,
        match: null,
        result: null,
      }, `select-character:${characterId}`);
    }
    return this.getState();
  }

  selectStage(stageId) {
    this.#assertScreen(FLOW_STATES.STAGE);
    if (!this.stageIds.has(stageId)) throw new RangeError(`未知场地：${stageId}`);
    if (!this.saveService.isStageUnlocked(stageId)) throw new RangeError(`场地尚未解锁：${stageId}`);
    this.context.stageId = stageId;
    this.context.match = null;
    this.context.result = null;
    this.#touch(`select-stage:${stageId}`);
    return this.getState();
  }

  startBattle(overrides = {}) {
    if (![FLOW_STATES.STAGE, FLOW_STATES.CUP].includes(this.screen)) {
      throw new InvalidFlowTransitionError(this.screen, FLOW_STATES.BATTLE, '只能从场地或杯赛界面开始战斗');
    }
    if (!this.context.characterId) throw new Error('开始战斗前必须选择角色');

    let match;
    if (this.screen === FLOW_STATES.CUP) {
      const cup = this.saveService.getData().cup;
      const roundIndex = Math.min(this.cupRoute.length - 1, cup.currentRound);
      const round = this.cupRoute[roundIndex];
      match = {
        ...clone(round),
        ...clone(overrides),
        id: `cup-${round.id}`,
        mode: 'cup',
        characterId: this.context.characterId,
        stageId: round.arena,
        rule: overrides.rule ?? round.rule,
        opponents: clone(overrides.opponents ?? round.opponents ?? []),
        cupRound: roundIndex,
        cupRoundId: round.id,
      };
    } else {
      if (!this.context.stageId) throw new Error('开始战斗前必须选择场地');
      match = {
        ...clone(overrides),
        id: `${this.context.mode}-${this.context.characterId}-${this.context.stageId}`,
        mode: this.context.mode,
        characterId: this.context.characterId,
        stageId: this.context.stageId,
        rule: this.context.mode === 'training' ? 'training' : (overrides.rule ?? 'stock'),
        opponents: clone(overrides.opponents ?? []),
      };
    }

    this.#move(FLOW_STATES.BATTLE, {
      stageId: match.stageId,
      cupRound: match.cupRound ?? null,
      match,
      result: null,
    }, 'start-battle');
    return this.getState();
  }

  pause() {
    this.#move(FLOW_STATES.PAUSE, {}, 'pause');
    return this.getState();
  }

  resume() {
    this.#move(FLOW_STATES.BATTLE, {}, 'resume');
    return this.getState();
  }

  finishBattle(result = {}) {
    this.#assertScreen(FLOW_STATES.BATTLE);
    const outcome = normalizedOutcome(result);
    const match = clone(this.context.match);
    const normalizedResult = {
      ...clone(result),
      outcome,
      mode: match.mode,
      characterId: match.characterId,
      stageId: match.stageId,
      cupRound: match.cupRound ?? null,
      cupCompleted: false,
      reward: null,
    };

    this.saveService.recordMatch({
      mode: match.mode,
      outcome,
      characterId: match.characterId,
      maxCombo: result.maxCombo ?? result.player?.maxCombo ?? 0,
      durationSeconds: result.durationSeconds ?? 0,
      damageDealt: result.damageDealt ?? 0,
    });

    if (match.mode === 'cup') {
      if (outcome === 'win') {
        const progress = this.saveService.advanceCup(this.cupRoute.length);
        normalizedResult.cupCompleted = progress.completed;
        normalizedResult.nextCupRound = progress.nextRound;
        normalizedResult.reward = this.#applyCupReward(match.cupRound);
      } else if (outcome === 'loss') {
        this.saveService.recordCupLoss();
        normalizedResult.nextCupRound = match.cupRound;
      } else {
        normalizedResult.nextCupRound = match.cupRound;
      }
    }

    this.#move(FLOW_STATES.RESULT, { result: normalizedResult }, 'finish-battle');
    return this.getState();
  }

  continueFromResult() {
    this.#assertScreen(FLOW_STATES.RESULT);
    const result = this.context.result;
    if (result.mode === 'cup') {
      if (result.cupCompleted) {
        this.#move(FLOW_STATES.ENDING, { cupRound: 5, match: null }, 'cup-ending');
      } else {
        const cup = this.saveService.getData().cup;
        this.#move(FLOW_STATES.CUP, {
          cupRound: cup.currentRound,
          stageId: null,
          match: null,
          result: null,
        }, 'continue-cup');
      }
    } else {
      this.#move(FLOW_STATES.STAGE, { match: null, result: null }, 'continue-to-stage-select');
    }
    return this.getState();
  }

  retryBattle() {
    this.#assertScreen(FLOW_STATES.RESULT);
    if (this.context.result?.mode === 'cup' && this.context.result?.outcome === 'win') {
      throw new InvalidFlowTransitionError(FLOW_STATES.RESULT, FLOW_STATES.BATTLE, '杯赛胜利后必须进入下一关');
    }
    this.#move(FLOW_STATES.BATTLE, { result: null }, 'retry-battle');
    return this.getState();
  }

  openLab() {
    const returnTo = this.screen;
    this.#move(FLOW_STATES.LAB, { overlayReturn: returnTo }, 'open-lab');
    return this.getState();
  }

  openOptions() {
    const returnTo = this.screen;
    this.#move(FLOW_STATES.OPTIONS, { overlayReturn: returnTo }, 'open-options');
    return this.getState();
  }

  closeOverlay() {
    if (![FLOW_STATES.LAB, FLOW_STATES.OPTIONS].includes(this.screen)) {
      throw new InvalidFlowTransitionError(this.screen, FLOW_STATES.MENU, '当前没有打开实验室或设置');
    }
    const target = [FLOW_STATES.MENU, FLOW_STATES.MODE].includes(this.context.overlayReturn)
      ? this.context.overlayReturn
      : FLOW_STATES.MENU;
    this.#move(target, { overlayReturn: null }, 'close-overlay');
    return this.getState();
  }

  completeEnding() {
    this.#move(FLOW_STATES.MENU, {
      mode: null,
      characterId: null,
      stageId: null,
      cupRound: null,
      match: null,
      result: null,
    }, 'complete-ending');
    return this.getState();
  }

  exitToMenu({ abandonCup = false } = {}) {
    if (this.screen === FLOW_STATES.BOOT) {
      throw new InvalidFlowTransitionError(this.screen, FLOW_STATES.MENU);
    }
    if (abandonCup && this.saveService.getData().cup.active) this.saveService.abandonCup();
    this.#move(FLOW_STATES.MENU, {
      mode: null,
      characterId: null,
      stageId: null,
      cupRound: null,
      match: null,
      result: null,
      overlayReturn: null,
    }, 'exit-to-menu');
    return this.getState();
  }

  resetCup() {
    this.saveService.abandonCup();
    this.context.cupRound = null;
    this.context.match = null;
    this.context.result = null;
    this.#touch('reset-cup');
    return this.getState();
  }

  back() {
    switch (this.screen) {
      case FLOW_STATES.TITLE: return this.getState();
      case FLOW_STATES.MENU:
        this.#move(FLOW_STATES.TITLE, {}, 'back'); break;
      case FLOW_STATES.MODE:
        this.#move(FLOW_STATES.MENU, {}, 'back'); break;
      case FLOW_STATES.CHARACTER:
        this.#move(FLOW_STATES.MODE, { characterId: null }, 'back'); break;
      case FLOW_STATES.STAGE:
      case FLOW_STATES.CUP:
        this.#move(FLOW_STATES.CHARACTER, { stageId: null, cupRound: null, match: null }, 'back'); break;
      case FLOW_STATES.PAUSE:
        this.#move(FLOW_STATES.BATTLE, {}, 'back'); break;
      case FLOW_STATES.RESULT:
        return this.continueFromResult();
      case FLOW_STATES.ENDING:
        return this.completeEnding();
      case FLOW_STATES.LAB:
      case FLOW_STATES.OPTIONS:
        return this.closeOverlay();
      default:
        throw new InvalidFlowTransitionError(this.screen, 'back');
    }
    return this.getState();
  }

  dispatch(event, payload = {}) {
    const actions = {
      BOOT_READY: () => this.completeBoot(),
      PRESS_START: () => this.pressStart(),
      OPEN_MODE: () => this.openModeSelect(),
      SELECT_MODE: () => this.selectMode(payload.mode ?? payload),
      SELECT_CHARACTER: () => this.selectCharacter(payload.characterId ?? payload.id ?? payload, payload),
      SELECT_STAGE: () => this.selectStage(payload.stageId ?? payload.id ?? payload),
      START_BATTLE: () => this.startBattle(payload),
      PAUSE: () => this.pause(),
      RESUME: () => this.resume(),
      FINISH_BATTLE: () => this.finishBattle(payload),
      CONTINUE: () => this.continueFromResult(),
      RETRY: () => this.retryBattle(),
      OPEN_LAB: () => this.openLab(),
      OPEN_OPTIONS: () => this.openOptions(),
      CLOSE_OVERLAY: () => this.closeOverlay(),
      COMPLETE_ENDING: () => this.completeEnding(),
      EXIT_TO_MENU: () => this.exitToMenu(payload),
      BACK: () => this.back(),
      RESET_CUP: () => this.resetCup(),
    };
    if (!actions[event]) throw new RangeError(`未知流程事件：${event}`);
    return actions[event]();
  }

  #assertScreen(expected) {
    if (this.screen !== expected) throw new InvalidFlowTransitionError(this.screen, expected);
  }

  #move(to, patch = {}, reason = '') {
    if (!this.canTransition(to)) throw new InvalidFlowTransitionError(this.screen, to, reason);
    const from = this.screen;
    this.screen = to;
    Object.assign(this.context, clone(patch));
    this.revision += 1;
    this.#emit({ from, to, reason });
  }

  #touch(reason) {
    this.revision += 1;
    this.#emit({ from: this.screen, to: this.screen, reason });
  }

  #emit(change) {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot, change);
  }

  #applyCupReward(roundIndex) {
    const reward = this.cupRewards[roundIndex] ?? {};
    for (const id of reward.unlockCharacters ?? []) this.saveService.unlockCharacter(id);
    for (const id of reward.unlockStages ?? []) this.saveService.unlockStage(id);
    for (const id of reward.badges ?? []) this.saveService.addBadge(id);
    if (reward.data) this.saveService.addData(reward.data);
    return clone(reward);
  }
}
