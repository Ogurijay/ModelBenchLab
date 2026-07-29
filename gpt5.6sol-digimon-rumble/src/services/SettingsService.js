import { MemoryStorage, resolveStorage } from './SaveService.js';

export const SETTINGS_SCHEMA = 'digi-rumble-settings';
export const SETTINGS_VERSION = 1;
export const DEFAULT_SETTINGS_KEY = 'digi-rumble.settings';

const DIFFICULTIES = new Set(['rookie', 'normal', 'veteran']);
const GRAPHICS_QUALITIES = new Set(['low', 'medium', 'high']);
const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value))
  ? Math.max(min, Math.min(max, Number(value)))
  : fallback;

export function createDefaultSettings() {
  return {
    difficulty: 'normal',
    masterVolume: 0.8,
    musicVolume: 0.65,
    sfxVolume: 0.8,
    cameraShake: 0.75,
    battleTime: 90,
    graphicsQuality: 'high',
    reducedMotion: false,
    highContrast: false,
    showControlHints: true,
    freeEvolutionCheat: true,
    language: 'zh-CN',
    controls: {
      moveLeft: 'KeyA',
      moveRight: 'KeyD',
      attack: 'KeyJ',
      ranged: 'KeyK',
      jump: 'Space',
      overdrive: 'KeyE',
      pause: 'Escape',
    },
  };
}

export function normalizeSettings(value) {
  const defaults = createDefaultSettings();
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const controls = source.controls && typeof source.controls === 'object' && !Array.isArray(source.controls)
    ? source.controls
    : {};
  const normalizedControls = {};
  for (const [action, defaultCode] of Object.entries(defaults.controls)) {
    normalizedControls[action] = typeof controls[action] === 'string' && controls[action]
      ? controls[action]
      : defaultCode;
  }

  return {
    difficulty: DIFFICULTIES.has(source.difficulty) ? source.difficulty : defaults.difficulty,
    masterVolume: clamp(source.masterVolume, 0, 1, defaults.masterVolume),
    musicVolume: clamp(source.musicVolume, 0, 1, defaults.musicVolume),
    sfxVolume: clamp(source.sfxVolume, 0, 1, defaults.sfxVolume),
    cameraShake: clamp(source.cameraShake, 0, 1, defaults.cameraShake),
    battleTime: Math.round(clamp(source.battleTime, 30, 300, defaults.battleTime)),
    graphicsQuality: GRAPHICS_QUALITIES.has(source.graphicsQuality)
      ? source.graphicsQuality
      : defaults.graphicsQuality,
    reducedMotion: Boolean(source.reducedMotion),
    highContrast: Boolean(source.highContrast),
    showControlHints: source.showControlHints === undefined
      ? defaults.showControlHints
      : Boolean(source.showControlHints),
    freeEvolutionCheat: source.freeEvolutionCheat === undefined
      ? defaults.freeEvolutionCheat
      : Boolean(source.freeEvolutionCheat),
    language: typeof source.language === 'string' && source.language ? source.language : defaults.language,
    controls: normalizedControls,
  };
}

function normalizeLegacyVolume(value, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Number(value) > 1 ? Number(value) / 100 : Number(value);
}

function migrateLegacySettings(parsed) {
  const source = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const defaults = createDefaultSettings();
  return {
    ...source,
    masterVolume: normalizeLegacyVolume(source.masterVolume ?? source.volume, defaults.masterVolume),
    musicVolume: normalizeLegacyVolume(source.musicVolume, defaults.musicVolume),
    sfxVolume: normalizeLegacyVolume(source.sfxVolume, defaults.sfxVolume),
    cameraShake: source.cameraShake ?? (source.screenShake === false ? 0 : defaults.cameraShake),
    battleTime: source.battleTime ?? source.timeLimit ?? defaults.battleTime,
  };
}

export class UnsupportedSettingsVersionError extends Error {
  constructor(version) {
    super(`设置版本 ${version} 高于当前支持版本 ${SETTINGS_VERSION}`);
    this.name = 'UnsupportedSettingsVersionError';
    this.version = version;
  }
}

export class SettingsService {
  constructor({ storage, key = DEFAULT_SETTINGS_KEY, now = () => Date.now() } = {}) {
    const backend = resolveStorage(storage);
    this.storage = backend.storage;
    this.storageKind = backend.kind;
    this.key = key;
    this.now = now;
    this.listeners = new Set();
    this.lastError = null;
    this.settings = createDefaultSettings();
    this.load();
  }

  get persistent() { return this.storageKind === 'localStorage'; }

  getAll() { return clone(this.settings); }

  get(name) { return clone(this.settings[name]); }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('设置订阅器必须是函数');
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
      this.settings = createDefaultSettings();
      return this.getAll();
    }

    try {
      const parsed = JSON.parse(raw);
      const version = Number.isInteger(parsed?.version) ? parsed.version : 0;
      if (version > SETTINGS_VERSION) throw new UnsupportedSettingsVersionError(version);
      this.settings = normalizeSettings(version === 0 ? migrateLegacySettings(parsed) : parsed.data);
      if (version < SETTINGS_VERSION) this.save();
    } catch (error) {
      this.lastError = error;
      this.settings = createDefaultSettings();
    }
    return this.getAll();
  }

  save(nextSettings = this.settings) {
    this.settings = normalizeSettings(nextSettings);
    const envelope = JSON.stringify({
      schema: SETTINGS_SCHEMA,
      version: SETTINGS_VERSION,
      savedAt: this.now(),
      data: this.settings,
    });
    try {
      this.storage.setItem(this.key, envelope);
      this.lastError = null;
    } catch (error) {
      this.#fallBackToMemory(error);
      this.storage.setItem(this.key, envelope);
    }
    this.#emit();
    return this.getAll();
  }

  set(name, value) {
    if (!Object.hasOwn(this.settings, name)) throw new RangeError(`未知设置项：${name}`);
    return this.update({ [name]: value });
  }

  setControl(action, code) {
    if (!Object.hasOwn(this.settings.controls, action)) throw new RangeError(`未知控制动作：${action}`);
    if (typeof code !== 'string' || !code) throw new TypeError('按键代码必须是非空字符串');
    return this.update({ controls: { ...this.settings.controls, [action]: code } });
  }

  update(patchOrUpdater) {
    const draft = this.getAll();
    let next;
    if (typeof patchOrUpdater === 'function') {
      const returned = patchOrUpdater(draft);
      next = returned === undefined ? draft : returned;
    } else if (patchOrUpdater && typeof patchOrUpdater === 'object') {
      next = {
        ...draft,
        ...patchOrUpdater,
        controls: patchOrUpdater.controls
          ? { ...draft.controls, ...patchOrUpdater.controls }
          : draft.controls,
      };
    } else {
      throw new TypeError('设置更新必须是对象或函数');
    }
    return this.save(next);
  }

  reset() { return this.save(createDefaultSettings()); }

  #fallBackToMemory(error) {
    this.lastError = error;
    this.storage = new MemoryStorage();
    this.storageKind = 'memory';
  }

  #emit() {
    const snapshot = this.getAll();
    for (const listener of this.listeners) listener(snapshot);
  }
}
