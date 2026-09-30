import './style.css';
import { WorldView } from './view.js';
import {
  BUILDINGS,
  DAY_SECONDS,
  GRID,
  RESOURCE_NAMES,
  TICK_SECONDS,
  blocked,
  cameraPlan,
  canDemolish,
  cellInfo,
  createGame,
  demolish,
  development,
  headingName,
  housingOf,
  pack,
  place,
  rankName,
  rankProgress,
  spawnPoint,
  suggestRot,
  tick,
  unpack,
  watchName,
  whyNot,
  worldToCell,
} from './sim.js';

const STORAGE = 'kaizhou-dev-world-v1';
const TOOLS = [
  { id: 'demolish', name: '拆', key: '`', blurb: '拆掉，退回四成' },
  ...Object.entries(BUILDINGS).map(([id, spec]) => ({ id, name: spec.name, key: spec.key, blurb: spec.blurb })),
];
const HOTKEYS = {
  Backquote: 'demolish',
  Digit1: 'road',
  Digit2: 'hut',
  Digit3: 'farm',
  Digit4: 'grove',
  Digit5: 'kiln',
  Digit6: 'pier',
  Digit7: 'orchard',
  Digit8: 'well',
  Digit9: 'lamp',
  Digit0: 'hall',
  KeyT: 'tower',
};
const LAND = {
  deep: '#14383e',
  shallow: '#2a756f',
  sand: '#e4c48a',
  grass: '#6e9148',
  rock: '#8d7a6c',
};

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="stage"></div>
  <div class="hud">
    <header class="ledger">
      <div class="seal" aria-hidden="true">开</div>
      <div class="brand">
        <strong>开洲</strong>
        <small>KAIZHOU · 开发世界</small>
      </div>
      <div class="rank-block">
        <span id="rank">营地</span>
        <div class="meter" aria-hidden="true"><i id="meter"></i></div>
        <small id="dev">发展 0</small>
      </div>
      <div class="resources" id="resources"></div>
      <div class="clock-block">
        <span id="watch">平旦</span>
        <small id="heading">北</small>
        <small id="coord">东 0 · 南 0</small>
      </div>
      <div class="ledger-actions">
        <button type="button" data-speed="1" class="text-btn active">1×</button>
        <button type="button" data-speed="2" class="text-btn">2×</button>
        <button type="button" data-speed="4" class="text-btn">4×</button>
        <button type="button" id="pause" class="text-btn">暂停</button>
        <button type="button" id="sound" class="text-btn" aria-pressed="false">声</button>
      </div>
    </header>
    <p id="banner" class="banner" hidden>洲已开</p>
    <aside class="sheet">
      <p id="hint">选一枚印，再点到地上。</p>
      <ol id="log"></ol>
      <label>种子 <input id="seed" type="number" min="1" max="999999999" step="1" value="20260922"></label>
      <div class="sheet-actions">
        <button type="button" id="reseed" class="text-btn">按种子重开</button>
        <small id="save">册子在这台浏览器里</small>
      </div>
    </aside>
    <div class="dock">
      <div class="map-card">
        <canvas id="map" width="144" height="144" aria-label="洲图"></canvas>
        <small>洲图</small>
      </div>
      <div class="stamps" id="stamps" role="toolbar" aria-label="营造印"></div>
    </div>
    <p class="help">拖拽转镜头 · 滚轮远近 · WASD 行走 · 左键落印 · R 转向 · 空格暂停</p>
  </div>
  <section class="title" id="title">
    <div class="spine"><span>淤洲垦务</span><span>册页壹</span></div>
    <div class="title-copy">
      <p class="eyebrow">一块还没人烟的淤泥</p>
      <h1>开洲</h1>
      <p class="latin">DEVELOP THE ISLAND</p>
      <p class="lede">铺路，盖屋，种田，把营地做成有人留下来的地方。木料、陶土、口粮和铜钱都会进同一本册子。</p>
    </div>
    <div class="title-actions">
      <button type="button" id="continue" class="go">回到册上的洲</button>
      <button type="button" id="ashore" class="go go-alt">上岸勘测</button>
      <p>时辰会走。人口吃口粮，屋子决定能留下多少人。</p>
    </div>
  </section>
`;

const stage = document.querySelector('#stage');
let view;
try {
  view = new WorldView(stage);
} catch (error) {
  stage.innerHTML = '<p class="fail">这个浏览器没能启动 WebGL，开洲暂时画不出来。</p>';
  throw error;
}

const resourcesEl = document.querySelector('#resources');
resourcesEl.innerHTML = ['timber', 'clay', 'grain', 'coin'].map((id) => (
  `<div><small>${RESOURCE_NAMES[id]}</small><strong id="res-${id}">0</strong></div>`
)).join('') + '<div><small>人口</small><strong id="pop">0</strong></div>';

const stampsEl = document.querySelector('#stamps');
stampsEl.innerHTML = TOOLS.map((tool) => (
  `<button type="button" class="stamp" data-tool="${tool.id}"><small>${tool.key}</small><strong>${tool.name}</strong></button>`
)).join('');

let saved = null;
try {
  saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
} catch {
  saved = null;
}
const restored = unpack(saved);
const hadSave = Boolean(restored);
let state = restored || createGame(20260922);
let tool = 'road';
let rot = 0;
let rotLock = false;
let hoverKey = '';
let hover = null;
let started = false;
let acc = 0;
let audioOn = false;
let audioCtx = null;
let bannerUntil = 0;
let hint = '选一枚印，再点到地上。';
let saveLabel = hadSave ? '册上还有上次的洲' : '新册，还没记';
const keys = new Set();
const spawn = spawnPoint(state);
view.player.x = spawn.x;
view.player.z = spawn.z;
view.player.face = Math.atan2(spawn.x, spawn.z);
view.yaw = Math.atan2(spawn.x, spawn.z);
view.pitch = 0.62;
view.dist = 18;
view.rebuild(state);
document.querySelector('#seed').value = String(state.seed);
document.querySelector('#continue').hidden = !hadSave;
if (hadSave) document.querySelector('#ashore').textContent = '另开一洲';
else document.querySelector('#ashore').classList.remove('go-alt');

function persist() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(pack(state)));
    saveLabel = '已记入这台浏览器';
  } catch {
    saveLabel = '浏览器没有允许记册，这一局仍可玩';
  }
}

function typing() {
  const el = document.activeElement;
  return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'));
}

function selectTool(id) {
  tool = id;
  rotLock = false;
  hoverKey = '';
  document.querySelectorAll('.stamp').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === id);
  });
  refreshGhost();
  paintHud();
}

function refreshGhost() {
  if (!started || !hover) {
    view.setGhost(state, null, 0, 0, 0, false);
    return;
  }
  const id = `${hover.ix},${hover.iz}`;
  if (id !== hoverKey) {
    hoverKey = id;
    if (!rotLock) rot = suggestRot(state, tool, hover.ix, hover.iz);
  }
  if (tool === 'demolish') {
    const ok = canDemolish(state, hover.ix, hover.iz);
    hint = ok ? '点击拆掉这里。' : '这里没有可拆的东西。';
    view.setGhost(state, 'demolish', hover.ix, hover.iz, 0, ok);
    return;
  }
  const reason = whyNot(state, tool, hover.ix, hover.iz);
  hint = reason || `点击落下${BUILDINGS[tool].name}。${TOOLS.find((item) => item.id === tool).blurb}`;
  view.setGhost(state, tool, hover.ix, hover.iz, rot, !reason);
}

function blip(freq) {
  if (!audioOn) return;
  const ctx = audioCtx || new AudioContext();
  audioCtx = ctx;
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.035, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.09);
}

function celebrate(flag) {
  if (!flag) return;
  bannerUntil = performance.now() + 7200;
  blip(392);
}

function applyBuild(result) {
  if (!result.ok) {
    hint = result.reason;
    blip(120);
    paintHud();
    return;
  }
  view.sync(state);
  celebrate(result.celebrated);
  persist();
  blip(220);
  refreshGhost();
  paintHud();
  paintMap();
}

function act(clientX, clientY) {
  const cell = view.pick(clientX, clientY);
  if (!cell) return;
  hover = cell;
  if (tool === 'demolish') applyBuild(demolish(state, cell.ix, cell.iz));
  else applyBuild(place(state, tool, cell.ix, cell.iz, rot));
}

function readSeed() {
  const value = Number(document.querySelector('#seed').value);
  if (!Number.isInteger(value) || value < 1 || value > 999999999) return state.seed;
  return value;
}

function boot(seed) {
  state = createGame(seed);
  const point = spawnPoint(state);
  view.player.x = point.x;
  view.player.z = point.z;
  view.player.face = Math.atan2(point.x, point.z);
  view.yaw = view.player.face;
  acc = 0;
  hover = null;
  hoverKey = '';
  view.rebuild(state);
  persist();
  paintHud();
  paintMap();
}

function begin(fresh) {
  started = true;
  document.querySelector('#title').hidden = true;
  if (fresh) boot(readSeed());
  else {
    const point = spawnPoint(state);
    view.player.x = point.x;
    view.player.z = point.z;
    view.rebuild(state);
  }
  selectTool(tool);
}

function paintHud() {
  const score = development(state);
  document.querySelector('#rank').textContent = rankName(score);
  document.querySelector('#dev').textContent = `发展 ${score}`;
  document.querySelector('#meter').style.transform = `scaleX(${rankProgress(score)})`;
  document.querySelector('#watch').textContent = watchName(state.time);
  document.querySelector('#heading').textContent = headingName(view.yaw);
  const east = view.player.x >= 0 ? `东 ${view.player.x.toFixed(0)}` : `西 ${(-view.player.x).toFixed(0)}`;
  const south = view.player.z >= 0 ? `南 ${view.player.z.toFixed(0)}` : `北 ${(-view.player.z).toFixed(0)}`;
  document.querySelector('#coord').textContent = `${east} · ${south}`;
  for (const id of ['timber', 'clay', 'grain', 'coin']) {
    document.querySelector(`#res-${id}`).textContent = String(state.resources[id]);
  }
  document.querySelector('#pop').textContent = `${state.pop}/${housingOf(state)}`;
  document.querySelector('#hint').textContent = hint;
  document.querySelector('#save').textContent = saveLabel;
  document.querySelector('#pause').textContent = state.paused ? '继续' : '暂停';
  document.querySelector('#log').textContent = state.log.join('\n');
  document.querySelector('#banner').hidden = performance.now() > bannerUntil;
  document.querySelectorAll('[data-speed]').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.speed) === state.speed);
  });
}

function paintMap() {
  const canvas = document.querySelector('#map');
  const ctx = canvas.getContext('2d');
  const s = canvas.width / GRID;
  for (let iz = 0; iz < GRID; iz += 1) {
    for (let ix = 0; ix < GRID; ix += 1) {
      const info = cellInfo(state, ix, iz);
      ctx.fillStyle = info.forest ? '#3c6236' : LAND[info.kind];
      ctx.fillRect(ix * s, iz * s, s + 0.6, s + 0.6);
    }
  }
  ctx.fillStyle = '#8a5a32';
  for (const road of state.roads) {
    const [ix, iz] = road.split(',').map(Number);
    ctx.fillRect(ix * s + 1, iz * s + 1, Math.max(1, s - 2), Math.max(1, s - 2));
  }
  ctx.fillStyle = '#c23a24';
  for (const building of state.buildings) {
    ctx.fillRect(building.ix * s + 1, building.iz * s + 1, Math.max(1, s - 2), Math.max(1, s - 2));
  }
  const here = worldToCell(view.player.x, view.player.z);
  ctx.fillStyle = '#1c1914';
  ctx.beginPath();
  ctx.arc((here.ix + 0.5) * s, (here.iz + 0.5) * s, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function step(dt) {
  if (!state.paused) {
    state.time = (state.time + (dt * state.speed) / DAY_SECONDS) % 1;
    acc += dt * state.speed;
    let guard = 0;
    while (acc >= TICK_SECONDS && guard < 8) {
      acc -= TICK_SECONDS;
      celebrate(tick(state));
      guard += 1;
    }
  }
  if (typing()) {
    view.player.moving = false;
    return;
  }
  const plan = cameraPlan(view.yaw);
  let mx = 0;
  let mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += plan.fx; mz += plan.fz; }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= plan.fx; mz -= plan.fz; }
  if (keys.has('KeyA') || keys.has('ArrowLeft')) { mx -= plan.rx; mz -= plan.rz; }
  if (keys.has('KeyD') || keys.has('ArrowRight')) { mx += plan.rx; mz += plan.rz; }
  const len = Math.hypot(mx, mz);
  view.player.moving = len > 0;
  if (!len) return;
  const speed = 7.4 * dt;
  const dx = (mx / len) * speed;
  const dz = (mz / len) * speed;
  const nx = view.player.x + dx;
  const nz = view.player.z + dz;
  if (!blocked(state, nx, nz)) {
    view.player.x = nx;
    view.player.z = nz;
  } else if (!blocked(state, nx, view.player.z)) view.player.x = nx;
  else if (!blocked(state, view.player.x, nz)) view.player.z = nz;
  view.player.face = Math.atan2(mx, mz);
}

let drag = null;
let lastMap = 0;
view.dom.addEventListener('pointerdown', (event) => {
  if (!started || event.button > 2) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0, button: event.button };
  view.dom.setPointerCapture(event.pointerId);
});
view.dom.addEventListener('pointermove', (event) => {
  if (drag && drag.id === event.pointerId) {
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    view.yaw -= dx * 0.005;
    view.pitch = Math.max(0.22, Math.min(1.05, view.pitch - dy * 0.0035));
    return;
  }
  if (!started) return;
  hover = view.pick(event.clientX, event.clientY);
  refreshGhost();
});
view.dom.addEventListener('pointerup', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const { moved, button } = drag;
  drag = null;
  if (started && moved < 6 && button === 0) act(event.clientX, event.clientY);
});
view.dom.addEventListener('pointerleave', () => {
  if (drag) return;
  hover = null;
  refreshGhost();
});
view.dom.addEventListener('contextmenu', (event) => event.preventDefault());
view.dom.addEventListener('wheel', (event) => {
  event.preventDefault();
  view.dist = Math.max(6.5, Math.min(24, view.dist + Math.sign(event.deltaY) * 0.85));
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (typing()) return;
  keys.add(event.code);
  if (!started) return;
  if (event.code === 'Space') {
    event.preventDefault();
    state.paused = !state.paused;
  }
  if (event.code === 'KeyR') {
    rot = (rot + 1) % 4;
    rotLock = true;
    refreshGhost();
  }
  if (HOTKEYS[event.code]) selectTool(HOTKEYS[event.code]);
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

document.querySelector('#stamps').addEventListener('click', (event) => {
  const button = event.target.closest('[data-tool]');
  if (button) selectTool(button.dataset.tool);
});
document.querySelector('.ledger-actions').addEventListener('click', (event) => {
  const button = event.target.closest('[data-speed]');
  if (!button) return;
  state.speed = Number(button.dataset.speed);
  persist();
});
document.querySelector('#pause').addEventListener('click', () => {
  state.paused = !state.paused;
  paintHud();
});
document.querySelector('#sound').addEventListener('click', (event) => {
  audioOn = !audioOn;
  event.currentTarget.setAttribute('aria-pressed', String(audioOn));
  event.currentTarget.classList.toggle('active', audioOn);
  blip(330);
});
document.querySelector('#continue').addEventListener('click', () => begin(false));
document.querySelector('#ashore').addEventListener('click', () => begin(hadSave));
document.querySelector('#reseed').addEventListener('click', () => {
  const busy = state.buildings.length > 1 || state.roads.length > 0;
  if (busy && !window.confirm('重开会清掉这本册子上的洲。继续？')) return;
  if (!started) begin(true);
  else boot(readSeed());
});

let last = performance.now();
view.renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (started) step(dt);
  else state.time = (state.time + dt / DAY_SECONDS) % 1;
  view.frame(dt, state);
  paintHud();
  if (now - lastMap > 140) {
    paintMap();
    lastMap = now;
  }
});

selectTool('road');
paintHud();
paintMap();

window.__kaizhou = {
  get state() { return state; },
  get started() { return started; },
  player: view.player,
  begin,
  selectTool,
  placeAt(type, ix, iz) {
    const result = place(state, type, ix, iz, suggestRot(state, type, ix, iz));
    if (result.ok) view.sync(state);
    return result;
  },
};
