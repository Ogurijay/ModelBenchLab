import { formatTime } from '../sim/race.js';

// DOM HUD：圈数 / 排名 / 计时 / 速度 / 道具槽 / 漂移蓄力条 / 中央消息层。

const ORDINALS = ['第 1 名', '第 2 名', '第 3 名', '第 4 名'];

export function createHud(container) {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud-top-left">
      <div class="hud-lap" data-role="lap">LAP 1/3</div>
      <div class="hud-pos" data-role="pos">第 4 名</div>
    </div>
    <div class="hud-top-center">
      <div class="hud-time" data-role="time">0:00.00</div>
      <div class="hud-best" data-role="best"></div>
    </div>
    <div class="hud-bottom-left">
      <div class="hud-speed"><span data-role="speed">0</span><small> km/h</small></div>
    </div>
    <div class="hud-bottom-center">
      <div class="hud-items">
        <div class="hud-item" data-role="item0">—</div>
        <div class="hud-item" data-role="item1">—</div>
      </div>
      <div class="hud-drift"><div class="hud-drift-fill" data-role="drift"></div></div>
    </div>
    <div class="hud-message" data-role="message"></div>
    <div class="hud-results hidden" data-role="results"></div>
    <div class="hud-help">W/S 油门刹车 · A/D 转向 · Space 漂移 · Shift/E 用道具 · R 重开</div>
  `;
  container.appendChild(root);

  const el = (role) => root.querySelector(`[data-role="${role}"]`);
  const refs = {
    lap: el('lap'),
    pos: el('pos'),
    time: el('time'),
    best: el('best'),
    speed: el('speed'),
    items: [el('item0'), el('item1')],
    drift: el('drift'),
    message: el('message'),
    results: el('results'),
  };

  return {
    update({ kart, race, position }) {
      refs.lap.textContent = `LAP ${Math.min(race.lap, race.laps)}/${race.laps}`;
      refs.pos.textContent = ORDINALS[position] ?? `第 ${position + 1} 名`;
      refs.time.textContent = formatTime(race.time);
      refs.best.textContent = race.bestLap === null ? '' : `最快单圈 ${formatTime(race.bestLap)}`;
      refs.speed.textContent = String(Math.round(Math.abs(kart.speed) * 3.6));
      refs.items.forEach((slot, i) => {
        slot.textContent = kart.items[i] === 'mushroom' ? '🍄' : '—';
        slot.classList.toggle('hud-item-ready', !!kart.items[i]);
      });

      const ratio = kart.drifting
        ? Math.min(kart.driftCharge / kart.miniTurbo[1].charge, 1)
        : 0;
      refs.drift.style.width = `${Math.round(ratio * 100)}%`;
      refs.drift.dataset.tier = kart.driftCharge >= kart.miniTurbo[1].charge
        ? '2'
        : kart.driftCharge >= kart.miniTurbo[0].charge ? '1' : '0';
    },
    showMessage(text) {
      refs.message.textContent = text;
      refs.message.classList.toggle('hidden', !text);
    },
    showResults({ race, position }) {
      const laps = race.lapTimes
        .map((t, i) => `<div>第 ${i + 1} 圈　${formatTime(t)}</div>`)
        .join('');
      refs.results.innerHTML = `
        <h2>${ORDINALS[position] ?? `第 ${position + 1} 名`}</h2>
        <div class="hud-results-total">总用时 ${formatTime(race.time)}</div>
        ${laps}
        <div class="hud-results-hint">按 R 重新开始</div>
      `;
      refs.results.classList.remove('hidden');
    },
    hideResults() {
      refs.results.classList.add('hidden');
    },
  };
}
