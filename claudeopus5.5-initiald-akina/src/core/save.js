// 本地存档：主线进度、章节结果、车库解锁、最佳成绩、设置。
const KEY = 'initiald-akina-save-v1';

export const DEFAULT_SAVE = () => ({
  version: 1,
  unlockedChapter: 0,          // 可进入的最大章节
  chapters: {},                // id → 'done' | 'won' | 'lost'
  ditch: false,                // 排水渠过弯（第 6 章解锁）
  cars: ['ae86', 'ae85', 'wuling'],
  best: {},                    // `${mode}:${course}:${car}` → 秒 / 分
  settings: { danmaku: true, assist: true, volume: 0.8, music: 0.55, quality: 'high' },
  stats: { races: 0, wins: 0, perfect: 0 }
});

export class Save {
  constructor() { this.data = this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULT_SAVE();
      const d = JSON.parse(raw);
      const def = DEFAULT_SAVE();
      return { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) }, stats: { ...def.stats, ...(d.stats || {}) } };
    } catch { return DEFAULT_SAVE(); }
  }
  write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* 隐私模式 */ } }
  reset() { const s = this.data.settings; this.data = DEFAULT_SAVE(); this.data.settings = s; this.write(); }
  get hasProgress() { return this.data.unlockedChapter > 0 || Object.keys(this.data.chapters).length > 0; }

  /** 章节完成：回看已完成章节不会改写已获得的真实成绩（只升级，不降级） */
  completeChapter(id, result) {
    const d = this.data;
    const prev = d.chapters[id];
    if (!(prev === 'won' && result !== 'won')) d.chapters[id] = result;
    d.unlockedChapter = Math.max(d.unlockedChapter, id + 1);
    this.write();
  }
  unlockCar(id) { if (!this.data.cars.includes(id)) { this.data.cars.push(id); this.write(); return true; } return false; }
  best(key, v, lowerBetter = true) {
    const b = this.data.best[key];
    if (b == null || (lowerBetter ? v < b : v > b)) { this.data.best[key] = v; this.write(); return true; }
    return false;
  }
}
