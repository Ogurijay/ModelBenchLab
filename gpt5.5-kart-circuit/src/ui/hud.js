import { formatRaceTime } from '../simulation/race.js';

export function createHud() {
  return {
    lap: document.querySelector('#lap-value'),
    speed: document.querySelector('#speed-value'),
    time: document.querySelector('#time-value'),
    boost: document.querySelector('#boost-value'),
    prompt: document.querySelector('#prompt')
  };
}

export function updateHud(hud, race, kart, nowMs) {
  hud.lap.textContent = `${race.lap} / ${race.totalLaps}`;
  hud.speed.textContent = `${Math.max(0, Math.round(kart.speed * 3.6))}`;
  hud.time.textContent = race.finished ? 'Finish' : formatRaceTime(nowMs);

  if (race.boostUntilMs > nowMs) {
    hud.boost.textContent = 'Active';
  } else if (kart.driftCharge >= 0.98) {
    hud.boost.textContent = 'Drift';
  } else {
    hud.boost.textContent = 'Ready';
  }

  if (race.finished) {
    hud.prompt.classList.add('visible');
    hud.prompt.querySelector('strong').textContent = 'Finished';
    hud.prompt.querySelector('span').textContent = 'Press R to restart the circuit';
  } else if (nowMs > 4500) {
    hud.prompt.classList.remove('visible');
  }
}

