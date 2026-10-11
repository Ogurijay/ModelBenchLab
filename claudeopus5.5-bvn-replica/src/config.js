// 全局常量与持久化设置。逻辑 60 帧/秒,画面 960×540。
export const W = 960, H = 540, FPS = 60;
export const STAGE_W = 1600, WALL_L = 40, WALL_R = STAGE_W - 40;
export const MAX_SEP = 960;          // 两名角色最大横向距离(保证同屏)
export const GRAV = 0.55;
export const MAX_HP = 1000, MAX_QI = 300, MAX_CP = 100;
export const CP_REGEN = 0.2;         // 查克拉 / 灵力每帧回复(12/秒),消耗后 30 帧开始回
export const ASSIST_FILL = 100 / (11 * 60); // 援助槽约 11 秒充满
export const SUB_COST = 50;          // 替身术消耗查克拉
export const AIRDASH_COST = 10;
export const STUN_LIMIT = 230;       // 连击硬直累积上限,超过强制倒地
export const GUARD_MAX = 240;        // 连续格挡伤害累积超过即破防

export const DIFF_NAMES = ['简单', '普通', '困难', '地狱'];

const DEFAULT_KEYS = {
  p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', J: 'KeyJ', K: 'KeyK', L: 'KeyL', U: 'KeyU', I: 'KeyI', O: 'KeyO' },
  p2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', J: 'Numpad1', K: 'Numpad2', L: 'Numpad3', U: 'Numpad4', I: 'Numpad5', O: 'Numpad6' },
};
// 无小键盘的备用键位(与主键位同时生效)
export const ALT_KEYS = {
  p1: {},
  p2: { J: 'Comma', K: 'Period', L: 'Slash', U: 'KeyM', I: 'Semicolon', O: 'Quote' },
};

const DEFAULTS = {
  difficulty: 1,      // 0..3
  winsNeeded: 2,      // 每局胜场(1/2/3)
  time: 99,           // 0 = 无限
  startQi: 0,         // 开局气(0/100/300)
  master: 0.9, bgm: 0.6, sfx: 0.9,
  showFps: false,
  keys: DEFAULT_KEYS,
};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem('bvn-replica-settings') || '{}');
    const keys = { p1: { ...DEFAULT_KEYS.p1, ...(s.keys?.p1 || {}) }, p2: { ...DEFAULT_KEYS.p2, ...(s.keys?.p2 || {}) } };
    return { ...DEFAULTS, ...s, keys };
  } catch { return structuredClone(DEFAULTS); }
}
export const settings = load();
export function saveSettings() {
  try { localStorage.setItem('bvn-replica-settings', JSON.stringify(settings)); } catch { /* 隐私模式 */ }
}
export function resetKeys(p) { settings.keys[p] = { ...DEFAULT_KEYS[p] }; saveSettings(); }
export const BUTTONS = ['up', 'down', 'left', 'right', 'J', 'K', 'L', 'U', 'I', 'O'];
export const BTN_LABEL = { up: '上', down: '下', left: '左', right: '右', J: '攻击 J', K: '跳跃 K', L: '冲刺 L', U: '技能 U', I: '必杀 I', O: '援助 O' };
