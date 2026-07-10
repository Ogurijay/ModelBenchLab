// ============================================================
// ui.js — 中文 UI:进入界面 / HUD / 天光按钮 / 展品说明浮层
// ============================================================
export function createUI({ controls, onToggleSky }) {
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const hud = document.getElementById('hud');
  const skyBtn = document.getElementById('skyBtn');
  const fpsEl = document.getElementById('fps');
  const captionEl = document.getElementById('caption');
  const lockTip = document.getElementById('lockTip');

  let entered = false;

  function enter() {
    try {
      controls.lock();
    } catch (err) {
      lockTip.classList.remove('hidden');
    }
  }
  overlay.addEventListener('click', enter);

  controls.addEventListener('lock', () => {
    overlay.classList.add('hidden');
    hud.classList.remove('hidden');
    lockTip.classList.add('hidden');
    if (!entered) {
      entered = true;
      startBtn.textContent = '继续参观';
    }
  });
  controls.addEventListener('unlock', () => {
    overlay.classList.remove('hidden');
  });
  document.addEventListener('pointerlockerror', () => {
    lockTip.classList.remove('hidden');
  });

  skyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onToggleSky();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyL') onToggleSky();
  });

  let lastCaptionId = -1;

  return {
    setSky(on) {
      skyBtn.textContent = on ? '天光 · 开' : '天光 · 关';
      skyBtn.classList.toggle('on', on);
    },
    setFps(n) {
      fpsEl.textContent = `${n} FPS`;
    },
    setCaption(ex) {
      const id = ex ? ex.id : -1;
      if (id === lastCaptionId) return;
      lastCaptionId = id;
      if (!ex) {
        captionEl.classList.add('hidden');
        return;
      }
      captionEl.innerHTML =
        `<span class="cap-no">${String(ex.id).padStart(2, '0')}</span>` +
        `<span class="cap-title">《${ex.title}》</span>` +
        `<span class="cap-kind">${ex.kind === 'painting' ? '画作' : '雕塑'} · ${ex.sub}</span>` +
        `<p>${ex.desc}</p>`;
      captionEl.classList.remove('hidden');
    },
  };
}
