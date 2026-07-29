export const SAVE_SCHEMA = 'digi-rumble-save';
export const SAVE_VERSION = 1;
export const DEFAULT_SAVE_KEY = 'digi-rumble.save';

export const STARTER_CHARACTERS = Object.freeze([
  'agumon', 'gabumon', 'guilmon', 'patamon', 'gatomon', 'veemon', 'renamon', 'tentomon',
]);

export const STARTER_STAGES = Object.freeze(['terminal']);

const clone = (value) => JSON.parse(JSON.stringify(value));
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asCount = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.max(0, Math.floor(Number(value)))
  : fallback;
const asNumber = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.max(0, Number(value))
  : fallback;

function uniqueStrings(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()))];
}

function createRecordBucket(value = {}) {
  return {
    sessions: asCount(value.sessions),
    matches: asCount(value.matches),
    wins: asCount(value.wins),
    losses: asCount(value.losses),
    draws: asCount(value.draws),
    bestCombo: asCount(value.bestCombo),
    playSeconds: asNumber(value.playSeconds),
    damageDealt: asNumber(value.damageDealt),
  };
}

export function createDefaultSaveData() {
  return {
    profile: {
      data: 0,
      unlockedCharacters: [...STARTER_CHARACTERS],
      unlockedStages: [...STARTER_STAGES],
      badges: [],
    },
    cup: {
      active: false,
      characterId: null,
      currentRound: 0,
      highestRound: 0,
      runWins: 0,
      runLosses: 0,
      completions: 0,
    },
    records: {
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      trainingSessions: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
      bestCombo: 0,
      playSeconds: 0,
      damageDealt: 0,
      byMode: {
        cup: createRecordBucket(),
        free: createRecordBucket(),
        training: createRecordBucket(),
      },
      byCharacter: {},
    },
  };
}

export function normalizeSaveData(value) {
  const defaults = createDefaultSaveData();
  const source = isObject(value) ? value : {};
  const profile = isObject(source.profile) ? source.profile : {};
  const cup = isObject(source.cup) ? source.cup : {};
  const records = isObject(source.records) ? source.records : {};
  const byMode = isObject(records.byMode) ? records.byMode : {};
  const byCharacter = isObject(records.byCharacter) ? records.byCharacter : {};

  const normalizedCharacterRecords = {};
  for (const [id, bucket] of Object.entries(byCharacter)) {
    if (typeof id === 'string' && id.trim() && isObject(bucket)) {
      normalizedCharacterRecords[id] = createRecordBucket(bucket);
    }
  }

  const normalizedModeRecords = {};
  for (const id of new Set([...Object.keys(defaults.records.byMode), ...Object.keys(byMode)])) {
    normalizedModeRecords[id] = createRecordBucket(byMode[id]);
  }

  return {
    profile: {
      data: asCount(profile.data),
      unlockedCharacters: uniqueStrings(profile.unlockedCharacters, defaults.profile.unlockedCharacters),
      unlockedStages: uniqueStrings(profile.unlockedStages, defaults.profile.unlockedStages),
      badges: uniqueStrings(profile.badges),
    },
    cup: {
      active: Boolean(cup.active),
      characterId: typeof cup.characterId === 'string' && cup.characterId ? cup.characterId : null,
      currentRound: Math.min(5, asCount(cup.currentRound)),
      highestRound: Math.min(6, asCount(cup.highestRound)),
      runWins: Math.min(6, asCount(cup.runWins)),
      runLosses: asCount(cup.runLosses),
      completions: asCount(cup.completions),
    },
    records: {
      matches: asCount(records.matches),
      wins: asCount(records.wins),
      losses: asCount(records.losses),
      draws: asCount(records.draws),
      trainingSessions: asCount(records.trainingSessions),
      currentWinStreak: asCount(records.currentWinStreak),
      bestWinStreak: asCount(records.bestWinStreak),
      bestCombo: asCount(records.bestCombo),
      playSeconds: asNumber(records.playSeconds),
      damageDealt: asNumber(records.damageDealt),
      byMode: normalizedModeRecords,
      byCharacter: normalizedCharacterRecords,
    },
  };
}

function migrateLegacySave(value) {
  const source = isObject(value?.data) ? value.data : (isObject(value) ? value : {});
  const legacyStats = isObject(source.stats) ? source.stats : {};
  const legacyCup = isObject(source.cup) ? source.cup : {};
  return {
    profile: {
      data: source.currency ?? source.data ?? 0,
      unlockedCharacters: source.unlockedCharacters,
      unlockedStages: source.unlockedStages,
      badges: source.badges,
    },
    cup: {
      active: legacyCup.active ?? Boolean(source.cupActive),
      characterId: legacyCup.characterId ?? source.cupCharacterId ?? null,
      currentRound: legacyCup.currentRound ?? source.cupRound ?? 0,
      highestRound: legacyCup.highestRound ?? source.highestCupRound ?? 0,
      runWins: legacyCup.runWins ?? 0,
      runLosses: legacyCup.runLosses ?? 0,
      completions: legacyCup.completions ?? source.cupCompletions ?? 0,
    },
    records: {
      ...legacyStats,
      ...(isObject(source.records) ? source.records : {}),
    },
  };
}

export class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  }

  get length() { return this.values.size; }

  key(index) { return [...this.values.keys()][index] ?? null; }

  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }

  setItem(key, value) { this.values.set(String(key), String(value)); }

  removeItem(key) { this.values.delete(String(key)); }

  clear() { this.values.clear(); }
}

const sharedMemoryStorage = new MemoryStorage();

function globalLocalStorage() {
  try {
    return globalThis?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function resolveStorage(preferredStorage) {
  const candidate = preferredStorage ?? globalLocalStorage();
  if (!candidate) return { storage: sharedMemoryStorage, kind: 'memory' };

  try {
    const probeKey = '__digi_rumble_storage_probe__';
    const previous = candidate.getItem(probeKey);
    candidate.setItem(probeKey, '1');
    if (previous === null) candidate.removeItem(probeKey);
    else candidate.setItem(probeKey, previous);
    return { storage: candidate, kind: candidate instanceof MemoryStorage ? 'memory' : 'localStorage' };
  } catch {
    return { storage: sharedMemoryStorage, kind: 'memory' };
  }
}

export class UnsupportedSaveVersionError extends Error {
  constructor(version) {
    super(`存档版本 ${version} 高于当前支持版本 ${SAVE_VERSION}`);
    this.name = 'UnsupportedSaveVersionError';
    this.version = version;
  }
}

export class SaveService {
  constructor({ storage, key = DEFAULT_SAVE_KEY, now = () => Date.now() } = {}) {
    const backend = resolveStorage(storage);
    this.storage = backend.storage;
    this.storageKind = backend.kind;
    this.key = key;
    this.now = now;
    this.listeners = new Set();
    this.lastError = null;
    this.data = createDefaultSaveData();
    this.load();
  }

  get persistent() { return this.storageKind === 'localStorage'; }

  getData() { return clone(this.data); }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('存档订阅器必须是函数');
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  load() {
    this.lastError = null;
    let raw;
    try {
      raw = this.storage.getItem(this.key);
    } catch (error) {
      this.#fallBackToMemory(error);
      raw = this.storage.getItem(this.key);
    }

    if (!raw) {
      this.data = createDefaultSaveData();
      return this.getData();
    }

    try {
      const parsed = JSON.parse(raw);
      const version = Number.isInteger(parsed?.version) ? parsed.version : 0;
      if (version > SAVE_VERSION) throw new UnsupportedSaveVersionError(version);
      const migrated = version === 0 ? migrateLegacySave(parsed) : parsed.data;
      this.data = normalizeSaveData(migrated);
      if (version < SAVE_VERSION) this.save();
    } catch (error) {
      this.lastError = error;
      this.data = createDefaultSaveData();
    }
    return this.getData();
  }

  save(nextData = this.data) {
    this.data = normalizeSaveData(nextData);
    const envelope = JSON.stringify({
      schema: SAVE_SCHEMA,
      version: SAVE_VERSION,
      savedAt: this.now(),
      data: this.data,
    });
    try {
      this.storage.setItem(this.key, envelope);
      this.lastError = null;
    } catch (error) {
      this.#fallBackToMemory(error);
      this.storage.setItem(this.key, envelope);
    }
    this.#emit();
    return this.getData();
  }

  update(updater) {
    if (typeof updater !== 'function') throw new TypeError('存档更新器必须是函数');
    const draft = this.getData();
    const returned = updater(draft);
    return this.save(returned === undefined ? draft : returned);
  }

  reset() {
    return this.save(createDefaultSaveData());
  }

  isCharacterUnlocked(id) { return this.data.profile.unlockedCharacters.includes(id); }

  isStageUnlocked(id) { return this.data.profile.unlockedStages.includes(id); }

  unlockCharacter(id) {
    if (typeof id !== 'string' || !id.trim()) return false;
    if (this.isCharacterUnlocked(id)) return false;
    this.update((draft) => { draft.profile.unlockedCharacters.push(id); });
    return true;
  }

  unlockStage(id) {
    if (typeof id !== 'string' || !id.trim()) return false;
    if (this.isStageUnlocked(id)) return false;
    this.update((draft) => { draft.profile.unlockedStages.push(id); });
    return true;
  }

  addBadge(id) {
    if (typeof id !== 'string' || !id.trim() || this.data.profile.badges.includes(id)) return false;
    this.update((draft) => { draft.profile.badges.push(id); });
    return true;
  }

  addData(amount) {
    const value = asCount(amount);
    if (!value) return this.data.profile.data;
    const next = this.update((draft) => { draft.profile.data += value; });
    return next.profile.data;
  }

  beginCup(characterId, { resume = true } = {}) {
    const id = typeof characterId === 'string' && characterId ? characterId : STARTER_CHARACTERS[0];
    const current = this.data.cup;
    if (resume && current.active && current.characterId === id) return this.getData().cup;
    const next = this.update((draft) => {
      draft.cup.active = true;
      draft.cup.characterId = id;
      draft.cup.currentRound = 0;
      draft.cup.highestRound = Math.max(draft.cup.highestRound, 1);
      draft.cup.runWins = 0;
      draft.cup.runLosses = 0;
    });
    return next.cup;
  }

  recordCupLoss() {
    const next = this.update((draft) => {
      draft.cup.runLosses += 1;
    });
    return next.cup;
  }

  advanceCup(totalRounds = 6) {
    const length = Math.max(1, asCount(totalRounds, 6));
    let progress;
    this.update((draft) => {
      const completedRound = Math.min(length - 1, draft.cup.currentRound);
      draft.cup.runWins += 1;
      if (completedRound >= length - 1) {
        draft.cup.active = false;
        draft.cup.currentRound = length - 1;
        draft.cup.highestRound = Math.max(draft.cup.highestRound, length);
        draft.cup.completions += 1;
        progress = { completed: true, completedRound, nextRound: null };
      } else {
        draft.cup.currentRound = completedRound + 1;
        draft.cup.highestRound = Math.max(draft.cup.highestRound, draft.cup.currentRound + 1);
        progress = { completed: false, completedRound, nextRound: draft.cup.currentRound };
      }
    });
    return { ...progress, cup: this.getData().cup };
  }

  abandonCup() {
    const next = this.update((draft) => {
      draft.cup.active = false;
      draft.cup.characterId = null;
      draft.cup.currentRound = 0;
      draft.cup.runWins = 0;
      draft.cup.runLosses = 0;
    });
    return next.cup;
  }

  recordMatch({
    mode = 'free', outcome = 'draw', characterId = null, maxCombo = 0,
    durationSeconds = 0, damageDealt = 0,
  } = {}) {
    const normalizedMode = typeof mode === 'string' && mode ? mode : 'free';
    const normalizedOutcome = ['win', 'loss', 'draw'].includes(outcome) ? outcome : 'draw';
    const training = normalizedMode === 'training';

    return this.update((draft) => {
      const records = draft.records;
      records.byMode[normalizedMode] ??= createRecordBucket();
      const modeBucket = records.byMode[normalizedMode];
      modeBucket.sessions += 1;
      modeBucket.bestCombo = Math.max(modeBucket.bestCombo, asCount(maxCombo));
      modeBucket.playSeconds += asNumber(durationSeconds);
      modeBucket.damageDealt += asNumber(damageDealt);

      let characterBucket = null;
      if (typeof characterId === 'string' && characterId) {
        records.byCharacter[characterId] ??= createRecordBucket();
        characterBucket = records.byCharacter[characterId];
        characterBucket.sessions += 1;
        characterBucket.bestCombo = Math.max(characterBucket.bestCombo, asCount(maxCombo));
        characterBucket.playSeconds += asNumber(durationSeconds);
        characterBucket.damageDealt += asNumber(damageDealt);
      }

      records.bestCombo = Math.max(records.bestCombo, asCount(maxCombo));
      records.playSeconds += asNumber(durationSeconds);
      records.damageDealt += asNumber(damageDealt);

      if (training) {
        records.trainingSessions += 1;
        return;
      }

      records.matches += 1;
      modeBucket.matches += 1;
      if (characterBucket) characterBucket.matches += 1;
      const field = normalizedOutcome === 'win' ? 'wins' : normalizedOutcome === 'loss' ? 'losses' : 'draws';
      records[field] += 1;
      modeBucket[field] += 1;
      if (characterBucket) characterBucket[field] += 1;

      if (normalizedOutcome === 'win') {
        records.currentWinStreak += 1;
        records.bestWinStreak = Math.max(records.bestWinStreak, records.currentWinStreak);
      } else if (normalizedOutcome === 'loss') {
        records.currentWinStreak = 0;
      }
    });
  }

  #fallBackToMemory(error) {
    this.lastError = error;
    this.storage = new MemoryStorage();
    this.storageKind = 'memory';
  }

  #emit() {
    const snapshot = this.getData();
    for (const listener of this.listeners) listener(snapshot);
  }
}
