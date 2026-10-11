// 跨场景的对局设置(选人结果、模式、场景、难度)与少量持久化。
const LS = 'lf2r.session.v1';
export const session = {
  humans: [0, 1, 2, 3].map(() => ({ active: false, charId: null, team: 0 })),
  coms: [],
  mode: 'vs',
  bg: 'random',
  difficulty: 1,
  stage: 1,
  unlocked: false,
  lastResult: null,
};
try {
  const s = JSON.parse(localStorage.getItem(LS));
  if (s) { session.difficulty = s.difficulty ?? 1; session.unlocked = !!s.unlocked; session.mode = s.mode || 'vs'; session.bg = s.bg || 'random'; }
} catch { /* ignore */ }
export function saveSession() {
  try { localStorage.setItem(LS, JSON.stringify({ difficulty: session.difficulty, unlocked: session.unlocked, mode: session.mode, bg: session.bg })); } catch { /* ignore */ }
}
export const MODES = [
  { id: 'vs', name: 'VS Mode', cn: '对战模式' },
  { id: 'stage', name: 'Stage Mode', cn: '闯关模式' },
  { id: 'champ', name: 'Championship', cn: '锦标赛' },
  { id: 'battle', name: 'Battle Mode', cn: '军团战' },
  { id: 'demo', name: 'Demo', cn: '演示' },
];
