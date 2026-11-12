// 中文实时控制面板与遥测 HUD (ui.js)
// 纯原生 DOM 构建，零外部 UI 库依赖；与 params.js 双向同步。

import {
  params,
  setParam,
  onParamChange,
  QUALITY_PRESETS,
  QUALITY_ORDER,
  SPECTRUM_PRESETS,
  getCoreTemperatureCelsius,
} from './params.js';

const UI_STYLES = `
.g4-panel {
  position: fixed;
  top: 16px;
  right: 16px;
  width: 286px;
  padding: 15px 17px 14px;
  background: rgba(11, 13, 19, 0.78);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 166, 84, 0.22);
  border-radius: 14px;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.58), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  color: #f3eae0;
  font-size: 12.5px;
  z-index: 20;
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.g4-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
  padding-bottom: 9px;
  border-bottom: 1px solid rgba(255, 180, 110, 0.14);
}
.g4-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.g4-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #ffd5a8;
  display: flex;
  align-items: center;
  gap: 7px;
}
.g4-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, #fff5d6 10%, #ff8b28 65%, #d93800 100%);
  box-shadow: 0 0 10px #ff7b1c;
}
.g4-sub {
  font-size: 10.5px;
  color: rgba(240, 224, 206, 0.54);
  letter-spacing: 0.03em;
}
.g4-collapse-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 200, 150, 0.16);
  color: #e4d4c3;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
}
.g4-collapse-btn:hover {
  border-color: rgba(255, 165, 82, 0.45);
  color: #fff;
}
.g4-body.collapsed {
  display: none;
}
.g4-row {
  margin-bottom: 9px;
}
.g4-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  color: rgba(244, 232, 218, 0.86);
}
.g4-val {
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 11.5px;
  color: #ffb366;
}
.g4-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  outline: none;
  cursor: pointer;
}
.g4-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #ff9838;
  border: 2px solid #fff3e0;
  box-shadow: 0 0 8px rgba(255, 132, 24, 0.75);
  cursor: pointer;
}
.g4-seg-label {
  margin: 10px 0 5px;
  color: rgba(244, 232, 218, 0.84);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.g4-seg {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
  margin-bottom: 9px;
}
.g4-seg button, .g4-actions button {
  padding: 6px 4px;
  border-radius: 7px;
  border: 1px solid rgba(255, 200, 150, 0.15);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(244, 232, 218, 0.85);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.14s ease;
}
.g4-seg button:hover, .g4-actions button:hover {
  background: rgba(255, 152, 56, 0.14);
  border-color: rgba(255, 165, 82, 0.42);
  color: #fff;
}
.g4-seg button.active, .g4-actions button.active {
  background: linear-gradient(180deg, rgba(255, 148, 48, 0.34), rgba(214, 78, 12, 0.28));
  border-color: rgba(255, 168, 76, 0.78);
  color: #ffe3c2;
  font-weight: 600;
}
.g4-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 10px;
}
.g4-hint {
  margin-top: 9px;
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 10.5px;
  color: rgba(235, 220, 205, 0.48);
  line-height: 1.45;
}
.g4-hud {
  position: fixed;
  left: 16px;
  bottom: 14px;
  padding: 8px 13px;
  background: rgba(10, 12, 18, 0.72);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 175, 100, 0.18);
  border-radius: 10px;
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 11.5px;
  color: rgba(245, 232, 216, 0.84);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 20;
  pointer-events: none;
}
.g4-hud b {
  color: #ffb668;
  font-weight: 600;
}
@media (max-width: 640px) {
  .g4-panel { width: 244px; top: 10px; right: 10px; padding: 11px 13px; }
  .g4-hud { left: 10px; bottom: 10px; font-size: 10.5px; gap: 8px; flex-wrap: wrap; }
}
`;

export function mountFireUI({ onResetView, onStokeFire }) {
  const styleEl = document.createElement('style');
  styleEl.textContent = UI_STYLES;
  document.head.appendChild(styleEl);

  const panel = document.createElement('aside');
  panel.className = 'g4-panel';
  panel.setAttribute('aria-label', '实体火焰控制面板');
  panel.innerHTML = `
    <div class="g4-header">
      <div class="g4-title-wrap">
        <div class="g4-title"><span class="g4-dot"></span>炽渊 · 实体火焰控制</div>
        <div class="g4-sub">三维体积光线步进 · 域扭曲 · 热浪折射</div>
      </div>
      <button type="button" class="g4-collapse-btn" data-role="collapse" title="收起/展开面板">收起</button>
    </div>
    <div class="g4-body" data-role="body">
      <div class="g4-row">
        <div class="g4-label"><span>火势强度</span><span class="g4-val" data-val="intensity"></span></div>
        <input class="g4-slider" type="range" min="0.30" max="1.80" step="0.01" data-key="intensity" />
      </div>
      <div class="g4-row">
        <div class="g4-label"><span>湍流卷曲</span><span class="g4-val" data-val="turbulence"></span></div>
        <input class="g4-slider" type="range" min="0.00" max="2.00" step="0.01" data-key="turbulence" />
      </div>
      <div class="g4-row">
        <div class="g4-label"><span>风向角度</span><span class="g4-val" data-val="windAngle"></span></div>
        <input class="g4-slider" type="range" min="-180" max="180" step="1" data-key="windAngle" />
      </div>
      <div class="g4-row">
        <div class="g4-label"><span>风力大小</span><span class="g4-val" data-val="windStrength"></span></div>
        <input class="g4-slider" type="range" min="0.00" max="1.00" step="0.01" data-key="windStrength" />
      </div>

      <div class="g4-seg-label"><span>渲染质量 (步进采样)</span><span class="g4-val" data-val="steps"></span></div>
      <div class="g4-seg" data-role="quality">
        ${QUALITY_ORDER.map((k) => `<button type="button" data-q="${k}">${QUALITY_PRESETS[k].label.split(' ')[0]}</button>`).join('')}
      </div>

      <div class="g4-seg-label"><span>焰色光谱</span><span class="g4-val" data-val="spectrumName"></span></div>
      <div class="g4-seg" data-role="spectrum">
        ${SPECTRUM_PRESETS.map((s) => `<button type="button" data-s="${s.id}" title="${s.desc}">${s.label.slice(2)}</button>`).join('')}
      </div>

      <div class="g4-actions">
        <button type="button" data-act="pause">暂停模拟</button>
        <button type="button" data-act="reset">重置视角</button>
        <button type="button" data-act="stoke">添柴鼓风</button>
        <button type="button" data-act="orbit">自动环绕</button>
      </div>

      <div class="g4-hint">
        左键拖拽 360° 环绕观察三维火焰体积 · 滚轮缩放 · 空格暂停 · R 复位视角 · B 添柴爆火星
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const hud = document.createElement('div');
  hud.className = 'g4-hud';
  hud.innerHTML = `
    <span><b data-hud="fps">--</b> FPS</span>
    <span>焰心 <b data-hud="temp">1412°C</b></span>
    <span>步进 <b data-hud="steps">68</b></span>
    <span>火星 <b data-hud="sparks">0</b></span>
  `;
  document.body.appendChild(hud);

  const fmt = {
    intensity: (v) => `${Math.round(v * 100)}%`,
    turbulence: (v) => v.toFixed(2),
    windAngle: (v) => `${Math.round(v)}°`,
    windStrength: (v) => `${Math.round(v * 100)}%`,
  };

  const sliders = {};
  const valEls = {};
  for (const key of Object.keys(fmt)) {
    const input = panel.querySelector(`input[data-key="${key}"]`);
    const valEl = panel.querySelector(`[data-val="${key}"]`);
    sliders[key] = input;
    valEls[key] = valEl;
    input.addEventListener('input', () => {
      setParam(key, Number(input.value));
    });
  }

  const qualityBtns = [...panel.querySelectorAll('[data-q]')];
  for (const btn of qualityBtns) {
    btn.addEventListener('click', () => setParam('quality', btn.dataset.q));
  }

  const spectrumBtns = [...panel.querySelectorAll('[data-s]')];
  for (const btn of spectrumBtns) {
    btn.addEventListener('click', () => setParam('spectrum', Number(btn.dataset.s)));
  }

  const pauseBtn = panel.querySelector('[data-act="pause"]');
  const resetBtn = panel.querySelector('[data-act="reset"]');
  const stokeBtn = panel.querySelector('[data-act="stoke"]');
  const orbitBtn = panel.querySelector('[data-act="orbit"]');
  const collapseBtn = panel.querySelector('[data-role="collapse"]');
  const bodyEl = panel.querySelector('[data-role="body"]');

  pauseBtn.addEventListener('click', () => setParam('paused', !params.paused));
  resetBtn.addEventListener('click', () => onResetView());
  stokeBtn.addEventListener('click', () => onStokeFire());
  orbitBtn.addEventListener('click', () => setParam('autoOrbit', !params.autoOrbit));

  collapseBtn.addEventListener('click', () => {
    const collapsed = bodyEl.classList.toggle('collapsed');
    collapseBtn.textContent = collapsed ? '展开' : '收起';
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setParam('paused', !params.paused);
    } else if (e.code === 'KeyR') {
      onResetView();
    } else if (e.code === 'KeyB') {
      onStokeFire();
    } else if (e.code === 'KeyO') {
      setParam('autoOrbit', !params.autoOrbit);
    }
  });

  const stepsValEl = panel.querySelector('[data-val="steps"]');
  const specNameEl = panel.querySelector('[data-val="spectrumName"]');

  function syncUI() {
    for (const key of Object.keys(fmt)) {
      sliders[key].value = String(params[key]);
      valEls[key].textContent = fmt[key](params[key]);
    }
    for (const btn of qualityBtns) {
      btn.classList.toggle('active', btn.dataset.q === params.quality);
    }
    for (const btn of spectrumBtns) {
      btn.classList.toggle('active', Number(btn.dataset.s) === params.spectrum);
    }
    const qPreset = QUALITY_PRESETS[params.quality] || QUALITY_PRESETS.high;
    stepsValEl.textContent = `${qPreset.steps} 步`;
    const sPreset = SPECTRUM_PRESETS[params.spectrum] || SPECTRUM_PRESETS[0];
    specNameEl.textContent = sPreset.label;

    pauseBtn.textContent = params.paused ? '继续模拟' : '暂停模拟';
    pauseBtn.classList.toggle('active', params.paused);
    orbitBtn.classList.toggle('active', params.autoOrbit);
  }

  syncUI();
  onParamChange(syncUI);

  const hudFps = hud.querySelector('[data-hud="fps"]');
  const hudTemp = hud.querySelector('[data-hud="temp"]');
  const hudSteps = hud.querySelector('[data-hud="steps"]');
  const hudSparks = hud.querySelector('[data-hud="sparks"]');

  return {
    updateHUD({ fps, steps, sparks, stokeBoost = 0 }) {
      hudFps.textContent = fps > 0 ? String(Math.round(fps)) : '--';
      hudTemp.textContent = `${getCoreTemperatureCelsius(stokeBoost)}°C`;
      hudSteps.textContent = String(steps);
      hudSparks.textContent = String(sparks);
    },
  };
}
