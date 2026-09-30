import './style.css';
import { Ocean } from './ocean.js';
import { SurfAudio } from './audio.js';
import { PRESETS, periodForWind } from './waves.js';

const $ = selector => document.querySelector(selector);
const app = $('#app');
const paths = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  'sound-off': '<path d="M11 5 6 9H3v6h3l5 4ZM16 9l6 6m0-6-6 6"/>',
  'sound-on': '<path d="M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3Z"/><circle cx="12" cy="13" r="4"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>',
};
function icon(element, name) {
  element.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}
document.querySelectorAll('[data-icon]').forEach(element => icon(element, element.dataset.icon));

const params = new URLSearchParams(location.search);
const boundedNumber = (key, fallback, min, max) => {
  const raw = params.get(key); const value = raw === null ? fallback : Number(raw);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
};
const state = { ...PRESETS.swell, buoy: true, quality: 'balanced' };
const rendered = { ...state };
let preset = 'swell';
let paused = params.get('paused') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
let elapsed = boundedNumber('time', 0, 0, 36000);
let ocean;
let animation;
let disposed = false;
let toastTimer;
let frames = 0, frameWindow = performance.now(), fps = 0;
let previous = performance.now(), lastSample = -1;
const trace = [];
const audio = new SurfAudio();
const events = new AbortController();
const listen = (element, event, handler) => element.addEventListener(event, handler, { signal: events.signal });

function toast(message) {
  $('#toast').textContent = message; $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2700);
}

function syncFields() {
  for (const key of ['wind', 'height', 'direction', 'sun']) {
    const input = $(`#${key}`);
    input.value = state[key];
    input.style.setProperty('--fill', `${(state[key] - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
    const digits = ['wind', 'height'].includes(key) ? 1 : 0;
    const units = { wind: 'm/s', height: 'm', direction: '°', sun: '°' };
    $(`#${key}-value`).innerHTML = `${state[key].toFixed(digits)} <small>${units[key]}</small>`;
  }
  document.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === preset)));
  $('#scene-number').textContent = preset ? PRESETS[preset].number : '↗';
  $('#scene-title').textContent = preset ? PRESETS[preset].title : '自定义海况';
  $('#scene-description').textContent = preset ? PRESETS[preset].description : '此刻的海，由你来定义。';
  $('#buoy').checked = state.buoy;
  $('#quality').value = state.quality;
}

function syncPlayback() {
  icon($('#pause'), paused ? 'play' : 'pause');
  $('#pause').setAttribute('aria-label', paused ? '继续模拟' : '暂停模拟');
  $('#live-label').textContent = paused ? '模拟已暂停' : '实时模拟';
  $('.live-status i').style.opacity = paused ? '0.4' : '1';
}

function togglePlayback() { paused = !paused; syncPlayback(); }

function reset() {
  Object.assign(state, PRESETS.swell, { buoy: true, quality: 'balanced' });
  Object.assign(rendered, state);
  preset = 'swell'; paused = false; elapsed = 0; trace.length = 0; lastSample = -1;
  ocean.time = 0; ocean.setQuality('balanced'); ocean.resetCamera();
  syncFields(); syncPlayback(); toast('已恢复默认海况与视角');
}

function setImmersed(immersed) {
  app.classList.toggle('immersed', immersed);
  document.querySelectorAll('.ui').forEach(element => { element.inert = immersed; });
  $('#restore-ui').hidden = !immersed;
  if (immersed) $('#restore-ui').focus(); else $('#immerse').focus();
}

function setPanel(open) {
  app.classList.toggle('panel-closed', !open);
  $('#controls').inert = !open;
  $('#panel-toggle').setAttribute('aria-expanded', String(open));
  $('#panel-toggle').setAttribute('aria-label', open ? '收起海况控制' : '展开海况控制');
}

function drawTrace() {
  const canvas = $('#wave-trace'), ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(184, 211, 201, 0.16)';
  ctx.setLineDash([5, 7]);
  for (const y of [h * 0.2, h * 0.5, h * 0.8]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.setLineDash([]);
  if (trace.length < 2) return;
  ctx.beginPath(); ctx.strokeStyle = '#b4d4bf'; ctx.lineWidth = 1.7;
  trace.forEach((sample, i) => {
    const x = w * (1 - (elapsed - sample.time) / 30);
    // Fixed +/- 3 m chart scale so changing wave height stays visually meaningful.
    const y = h / 2 - sample.height / 3 * h * 0.43;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  const last = trace.at(-1);
  ctx.beginPath();ctx.arc(w - 3, h / 2 - last.height / 3 * h * 0.43, 3, 0, Math.PI * 2);ctx.fillStyle = '#d0e4c4';ctx.fill();
}

function updateReadings() {
  $('#stat-height').innerHTML = `${rendered.height.toFixed(1)}<small> m</small>`;
  $('#stat-wind').innerHTML = `${rendered.wind.toFixed(1)}<small> m/s</small>`;
  $('#stat-period').innerHTML = `${periodForWind(rendered.wind, ocean.waves).toFixed(1)}<small> s</small>`;
  $('#elapsed').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
  $('#fps').textContent = `${Math.round(fps)} FPS`;
  drawTrace();
}

function fail(message) {
  $('#failure-message').textContent = message;
  $('#failure').hidden = false;
  $('#loading').hidden = true;
}

function frame(now) {
  if (disposed) return;
  const dt = Math.min(Math.max((now - previous) / 1000, 0), 0.05);
  previous = now;
  if (!document.hidden && $('#failure').hidden) {
    const delta = paused ? 0 : dt;
    elapsed += delta;
    const smoothing = 1 - Math.exp(-dt * 5);
    for (const key of ['wind', 'height', 'direction', 'sun', 'cloud']) {
      rendered[key] += (state[key] - rendered[key]) * smoothing;
    }
    rendered.buoy = state.buoy;
    ocean.render(delta, rendered);
    if (!paused && elapsed - lastSample >= 0.1) {
      trace.push({ time: elapsed, height: ocean.surfaceHeight });
      while (trace.length && trace[0].time < elapsed - 30) trace.shift();
      lastSample = elapsed;
    }
    frames++;
    if (now - frameWindow >= 500) {
      fps = frames * 1000 / (now - frameWindow);
      frames = 0; frameWindow = now;
      updateReadings();
    }
    audio.update(ocean.time, state.wind, paused);
  }
  animation = requestAnimationFrame(frame);
}

async function capture() {
  const button = $('#capture');
  button.disabled = true;
  try {
    ocean.render(0, rendered);
    const blob = await new Promise(resolve => $('#ocean').toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('截图生成失败，请重试');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `pelagic-${preset || 'custom'}-${Math.floor(elapsed)}s.png`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('海面截图已保存');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
}

function initialize() {
  try {
    ocean = new Ocean($('#ocean'), { seed: boundedNumber('seed', 71, 0, 4294967295), time: elapsed });
    window.__oceanObservatory = Object.freeze({ snapshot: () => ({ ...ocean.snapshot(), paused, elapsed, fps, preset, parameters: { ...state }, audioEnabled: audio.enabled, sampleCount: trace.length }) });
    if (window.innerWidth <= 760) { state.quality = 'performance'; ocean.setQuality('performance'); }
    syncFields(); syncPlayback(); setPanel(window.innerWidth > 760);
    listen($('#reset'), 'click', reset);
    listen($('#pause'), 'click', togglePlayback);
    listen($('#capture'), 'click', capture);
    listen($('#immerse'), 'click', () => setImmersed(true));
    listen($('#restore-ui'), 'click', () => setImmersed(false));
    listen($('#panel-toggle'), 'click', () => setPanel(app.classList.contains('panel-closed')));
    document.querySelectorAll('[data-preset]').forEach(button => listen(button, 'click', () => {
      preset = button.dataset.preset; Object.assign(state, PRESETS[preset]); syncFields();
    }));
    for (const key of ['wind', 'height', 'direction', 'sun']) {
      listen($(`#${key}`), 'input', event => { state[key] = Number(event.target.value); preset = null; syncFields(); });
    }
    listen($('#buoy'), 'change', event => { state.buoy = event.target.checked; });
    listen($('#quality'), 'change', event => { state.quality = event.target.value; ocean.setQuality(state.quality); toast(`已切换到${event.target.selectedOptions[0].text}画质`); });
    listen($('#sound'), 'click', async () => {
      const button = $('#sound'); button.disabled = true;
      try {
        const enabled = await audio.toggle(); icon(button, enabled ? 'sound-on' : 'sound-off');
        button.setAttribute('aria-pressed', String(enabled)); button.setAttribute('aria-label', enabled ? '关闭海浪声' : '开启海浪声');
        button.title = enabled ? '关闭海浪声' : '开启海浪声';
        toast(enabled ? '海浪声已开启' : '海浪声已关闭');
      } catch (error) { toast(error.message); }
      finally { button.disabled = false; }
    });
    listen($('#fullscreen'), 'click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (app.requestFullscreen) await app.requestFullscreen();
        else throw new Error('此浏览器暂不支持全屏，可使用纯净观海');
      } catch (error) { toast(error.message || '无法进入全屏'); }
    });
    listen(document, 'fullscreenchange', () => {
      $('#fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏');
      $('#fullscreen').title = document.fullscreenElement ? '退出全屏' : '进入全屏';
    });
    listen(document, 'visibilitychange', () => { previous = performance.now(); frames = 0; frameWindow = previous; audio.update(ocean.time, state.wind, document.hidden || paused); });
    listen(document, 'keydown', event => {
      if ($('#about-dialog').open || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.target.closest('input,select,textarea,[contenteditable=true]')) return;
      if (event.code === 'Space' && event.target.closest('button,a')) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
      if (event.code === 'KeyH') setImmersed(!app.classList.contains('immersed'));
      if (event.code === 'KeyR') reset();
      if (event.code === 'Escape') setImmersed(false);
    });
    listen($('#ocean'), 'webglcontextlost', event => { event.preventDefault(); fail('图形设备连接已中断，请重新加载海面。'); audio.update(ocean.time, state.wind, true); });
    app.classList.add('ready');
    updateReadings();
    previous = performance.now(); frameWindow = previous;
    animation = requestAnimationFrame(frame);
  } catch (error) {
    console.error('Ocean initialization failed:', error);
    fail('无法启动 WebGL 2。请确认浏览器已启用硬件加速，或尝试更新浏览器后重新加载。');
  }
}

listen($('#about'), 'click', () => $('#about-dialog').showModal());
listen($('#close-about'), 'click', () => $('#about-dialog').close());
listen($('#about-dialog'), 'click', event => { if (event.target === $('#about-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
listen($('#retry'), 'click', () => location.reload());
initialize();

function dispose() {
  disposed = true; cancelAnimationFrame(animation); clearTimeout(toastTimer);
  events.abort(); audio.dispose(); ocean?.dispose(); delete window.__oceanObservatory;
}
if (import.meta.hot) import.meta.hot.dispose(dispose);
