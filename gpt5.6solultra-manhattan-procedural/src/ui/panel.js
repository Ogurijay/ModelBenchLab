import { WEATHER_KINDS, WEATHER_LABELS } from '../config.js';

const q = (root, selector) => root.querySelector(selector);
const qa = (root, selector) => [...root.querySelectorAll(selector)];
const formatNumber = (value) => Number.isFinite(value) ? Math.round(value).toLocaleString('zh-CN') : '—';

export function createInterface(callbacks = {}) {
  const root = document.querySelector('#interface');
  const weatherButtons = WEATHER_KINDS.map((kind) => `
    <button class="weather-button" type="button" data-weather="${kind}" aria-pressed="false">
      <span class="weather-icon" aria-hidden="true"></span>
      ${WEATHER_LABELS[kind]}
    </button>
  `).join('');

  root.innerHTML = `
    <div class="grain" aria-hidden="true"></div>
    <header class="masthead">
      <div class="monogram" aria-hidden="true"><span>M</span></div>
      <div class="title-lockup">
        <p class="eyebrow">40.7128° N · 74.0060° W</p>
        <h1>曼哈顿<span>风暴换班</span></h1>
      </div>
      <div class="benchmark-stamp">
        <span>CODE → 3D</span>
        <strong>综合能力基准</strong>
        <small>GPT 5.6 SOL ULTRA</small>
      </div>
    </header>

    <section class="control-deck" aria-label="场景控制台">
      <div class="deck-heading">
        <span>气象台 / WEATHER</span>
        <output id="weather-status">晴朗</output>
      </div>
      <div class="weather-grid">${weatherButtons}</div>

      <div class="timeline-block">
        <div class="row-label">
          <label for="time-slider">纽约时刻 / SOLAR TIME</label>
          <output id="clock-output">08:00</output>
        </div>
        <input id="time-slider" type="range" min="0" max="24" step="0.05" value="8" />
        <div class="ticks" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      </div>

      <div class="switch-row">
        <label class="switch"><input id="auto-time" type="checkbox" checked /><span></span>昼夜循环</label>
        <label class="switch"><input id="auto-weather" type="checkbox" checked /><span></span>风暴编排</label>
      </div>

      <div class="wind-row">
        <label for="wind-slider">风速 <small>WIND</small></label>
        <input id="wind-slider" type="range" min="0" max="18" step="0.5" value="6" />
        <output id="wind-output">6.0 m/s</output>
      </div>

      <form id="seed-form" class="seed-form">
        <label for="seed-input">城市种子 <small>DETERMINISTIC SEED</small></label>
        <div><input id="seed-input" inputmode="numeric" maxlength="10" value="2026" /><button type="submit">重建</button></div>
      </form>

      <div class="camera-row" role="group" aria-label="相机模式">
        <button type="button" class="camera-button is-active" data-camera="tour">自动环游</button>
        <button type="button" class="camera-button" data-camera="orbit">自由轨道</button>
      </div>
    </section>

    <aside class="telemetry" aria-label="实时运行统计">
      <div class="telemetry-heading"><span class="live-dot"></span> LIVE TELEMETRY</div>
      <dl>
        <div><dt>帧率 <small>FPS</small></dt><dd id="metric-fps">—</dd></div>
        <div><dt>绘制调用 <small>DRAW</small></dt><dd id="metric-draw">—</dd></div>
        <div><dt>三角面 <small>TRIS</small></dt><dd id="metric-tris">—</dd></div>
        <div><dt>实例 <small>INST</small></dt><dd id="metric-instances">—</dd></div>
        <div><dt>车辆 <small>CARS</small></dt><dd id="metric-cars">—</dd></div>
        <div><dt>太阳高度 <small>ALT</small></dt><dd id="metric-solar">—</dd></div>
      </dl>
      <div class="hash-line"><span>城市指纹</span><code id="city-hash">等待生成</code></div>
    </aside>

    <div class="capability-rail" aria-label="受测能力">
      <span>01 建模</span><span>02 雕刻</span><span>03 动画</span><span>04 天气</span><span>05 计算</span>
    </div>

    <div class="view-hint"><span class="mouse-glyph" aria-hidden="true"></span><span id="view-hint-text">自动环游中 · 点击“自由轨道”接管镜头</span></div>
    <button id="audio-button" class="audio-button" type="button" title="启用程序化雷声"><span></span>启用雷声</button>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  `;

  qa(root, '.weather-button').forEach((button) => {
    button.addEventListener('click', () => callbacks.onWeather?.(button.dataset.weather));
  });
  q(root, '#time-slider').addEventListener('input', (event) => callbacks.onTime?.(Number(event.target.value)));
  q(root, '#auto-time').addEventListener('change', (event) => callbacks.onAutoTime?.(event.target.checked));
  q(root, '#auto-weather').addEventListener('change', (event) => callbacks.onAutoWeather?.(event.target.checked));
  q(root, '#wind-slider').addEventListener('input', (event) => {
    const value = Number(event.target.value);
    q(root, '#wind-output').textContent = `${value.toFixed(1)} m/s`;
    callbacks.onWind?.(value);
  });
  q(root, '#seed-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = Number.parseInt(q(root, '#seed-input').value, 10);
    callbacks.onSeed?.(Number.isFinite(raw) ? Math.abs(raw) : 2026);
  });
  qa(root, '.camera-button').forEach((button) => {
    button.addEventListener('click', () => callbacks.onCamera?.(button.dataset.camera));
  });
  q(root, '#audio-button').addEventListener('click', () => callbacks.onAudio?.());

  let toastTimer = 0;
  const api = {
    setReady() {
      document.querySelector('#loading')?.classList.add('is-hidden');
      root.classList.add('is-ready');
    },
    setWeather(kind) {
      qa(root, '.weather-button').forEach((button) => {
        const active = button.dataset.weather === kind;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      q(root, '#weather-status').textContent = WEATHER_LABELS[kind] ?? kind;
    },
    setCamera(mode) {
      qa(root, '.camera-button').forEach((button) => button.classList.toggle('is-active', button.dataset.camera === mode));
      q(root, '#view-hint-text').textContent = mode === 'tour'
        ? '自动环游中 · 点击“自由轨道”接管镜头'
        : '拖拽旋转 · 滚轮缩放 · 右键平移';
    },
    setAudioEnabled(enabled) {
      const button = q(root, '#audio-button');
      button.classList.toggle('is-active', enabled);
      button.lastChild.textContent = enabled ? ' 雷声已启用' : '启用雷声';
    },
    update(state) {
      const hours = ((state.timeHours ?? 0) + 24) % 24;
      const minutes = Math.floor((hours % 1) * 60);
      q(root, '#clock-output').textContent = `${String(Math.floor(hours)).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      if (!state.draggingTime) q(root, '#time-slider').value = String(hours);
      q(root, '#metric-fps').textContent = Number.isFinite(state.fps) ? state.fps.toFixed(0) : '—';
      q(root, '#metric-draw').textContent = formatNumber(state.drawCalls);
      q(root, '#metric-tris').textContent = formatNumber(state.triangles);
      q(root, '#metric-instances').textContent = formatNumber(state.instances);
      q(root, '#metric-cars').textContent = formatNumber(state.cars);
      q(root, '#metric-solar').textContent = Number.isFinite(state.solarAltitude) ? `${state.solarAltitude.toFixed(1)}°` : '—';
      if (state.cityHash) q(root, '#city-hash').textContent = state.cityHash;
    },
    setSeed(seed) { q(root, '#seed-input').value = String(seed); },
    toast(message) {
      const node = q(root, '#toast');
      node.textContent = message;
      node.classList.add('is-visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2800);
    },
    destroy() { root.replaceChildren(); },
  };
  api.setWeather('clear');
  return api;
}
