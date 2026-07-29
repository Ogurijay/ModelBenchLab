export const NEED_KEYS = ['hunger', 'energy', 'hygiene', 'fun', 'social'];

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function distanceToRect(x, y, rect) {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

export function createInitialState() {
  return {
    day: 1,
    minute: 8 * 60,
    money: 128,
    mood: '元气满满',
    needs: { hunger: 78, energy: 82, hygiene: 70, fun: 68, social: 58 },
    completed: [],
    score: 0,
  };
}

export function formatTime(minute) {
  const wrapped = ((Math.floor(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function tickState(state, minutes) {
  const next = structuredClone(state);
  next.minute += minutes;
  while (next.minute >= 1440) {
    next.minute -= 1440;
    next.day += 1;
  }
  const scale = minutes / 60;
  next.needs.hunger = clamp(next.needs.hunger - 4.4 * scale);
  next.needs.energy = clamp(next.needs.energy - 2.6 * scale);
  next.needs.hygiene = clamp(next.needs.hygiene - 2.1 * scale);
  next.needs.fun = clamp(next.needs.fun - 1.8 * scale);
  next.needs.social = clamp(next.needs.social - 1.3 * scale);
  updateMood(next);
  return next;
}

export function applyInteraction(state, interaction) {
  const next = structuredClone(state);
  next.minute += interaction.minutes || 0;
  while (next.minute >= 1440) {
    next.minute -= 1440;
    next.day += 1;
  }
  for (const [key, value] of Object.entries(interaction.needs || {})) {
    if (NEED_KEYS.includes(key)) next.needs[key] = clamp(next.needs[key] + value);
  }
  next.money = Math.max(0, next.money + (interaction.money || 0));
  if (interaction.id && !next.completed.includes(interaction.id)) {
    next.completed.push(interaction.id);
    next.score += 10;
  }
  updateMood(next);
  return next;
}

export function updateMood(state) {
  const values = Object.values(state.needs);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const lowest = Math.min(...values);
  state.mood = lowest < 18 ? '快撑不住了' : average < 42 ? '有点低落' : average < 70 ? '平静自在' : '元气满满';
  return state.mood;
}
