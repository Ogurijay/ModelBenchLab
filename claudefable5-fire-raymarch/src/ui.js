// 中文控制面板 + 性能 HUD。原生 DOM,零依赖(参数锁:除 three 外无运行时依赖)。
// 面板只调 setParam(),回显走 onParamChange 订阅 —— UI 与 __bench.setParam 改动同源同步。

import { params, setParam, onParamChange, QUALITY_PRESETS } from './params.js';

const CSS = /* css */ `
#fireui { position: fixed; top: 14px; right: 14px; width: 252px; z-index: 10;
  background: rgba(10, 13, 20, 0.78); border: 1px solid rgba(255, 176, 96, 0.16);
  border-radius: 12px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  padding: 14px 16px 12px; user-select: none;
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.45); }
#fireui h1 { font-size: 14px; font-weight: 600; letter-spacing: 0.04em; color: #ffc98c; margin: 0 0 2px; }
#fireui .sub { font-size: 11px; color: #8d8778; margin-bottom: 10px; }
#fireui .row { margin: 9px 0; }
#fireui .lab { display: flex; justify-content: space-between; font-size: 12px; color: #cfc8b8; margin-bottom: 4px; }
#fireui .lab b { font-weight: 500; color: #ffb45e; font-variant-numeric: tabular-nums; }
#fireui input[type=range] { width: 100%; height: 18px; appearance: none; -webkit-appearance: none; background: transparent; cursor: pointer; }
#fireui input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 2px;
  background: linear-gradient(90deg, rgba(255, 150, 60, 0.55), rgba(255, 150, 60, 0.18)); }
#fireui input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px;
  border-radius: 50%; background: #ffb45e; margin-top: -5px; border: 2px solid #3a2c1a;
  box-shadow: 0 0 8px rgba(255, 160, 70, 0.5); }
#fireui input[type=range]::-moz-range-track { height: 4px; border-radius: 2px; background: rgba(255, 150, 60, 0.3); }
#fireui input[type=range]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%;
  background: #ffb45e; border: 2px solid #3a2c1a; }
#fireui .seg { display: flex; gap: 4px; }
#fireui .seg button { flex: 1; font: inherit; font-size: 12px; padding: 5px 0; color: #b6ae9c;
  background: rgba(255, 255, 255, 0.05); border: 1px solid transparent; border-radius: 7px; cursor: pointer; }
#fireui .seg button.on { color: #1c1108; background: #ffb45e; font-weight: 600; }
#fireui .btns { display: flex; gap: 8px; margin-top: 12px; }
#fireui .btns button { flex: 1; font: inherit; font-size: 12.5px; padding: 7px 0; border-radius: 8px;
  cursor: pointer; color: #e8e2d6; background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 176, 96, 0.25); }
#fireui .btns button:hover { background: rgba(255, 176, 96, 0.18); }
#firehud { position: fixed; left: 14px; bottom: 12px; z-index: 10; font-size: 11px; line-height: 1.75;
  color: #9d9686; background: rgba(8, 10, 16, 0.6); border-radius: 9px; padding: 7px 12px;
  backdrop-filter: blur(6px); font-variant-numeric: tabular-nums; pointer-events: none; }
#firehud b { color: #ffc98c; font-weight: 600; }
#firetitle { position: fixed; left: 16px; top: 14px; z-index: 10; pointer-events: none; }
#firetitle .t { font-size: 15px; font-weight: 600; letter-spacing: 0.06em; color: #efe7d6;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.8); }
#firetitle .s { font-size: 11px; color: #93876f; margin-top: 2px; }
#firefold { display: none; position: fixed; top: 14px; right: 14px; z-index: 11; font: inherit;
  font-size: 13px; color: #ffc98c; background: rgba(10, 13, 20, 0.8); cursor: pointer;
  border: 1px solid rgba(255, 176, 96, 0.25); border-radius: 10px; padding: 8px 13px; }
@media (max-width: 720px) {
  #firefold { display: block; }
  #fireui { display: none; top: 56px; }
  #fireui.open { display: block; }
}
`;

function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (html) e.innerHTML = html;
  return e;
}

export function buildUI({ onTogglePause, onResetView, getStats }) {
  const style = el('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // 左上标题
  document.body.appendChild(el('div', { id: 'firetitle' },
    '<div class="t">实体火焰 · 体积光线步进</div>' +
    '<div class="s">Claude Fable 5 — three.js r185 / 程序化生成 · 拖拽环绕 · 滚轮缩放</div>'));

  // 控制面板
  const panel = el('div', { id: 'fireui' });
  panel.appendChild(el('h1', {}, '篝火控制台'));
  panel.appendChild(el('div', { className: 'sub' }, '火 / 烟 / 火星全程序化实时模拟'));

  const sliders = {};
  const addSlider = (key, label, min, max, step, fmt) => {
    const row = el('div', { className: 'row' });
    const lab = el('div', { className: 'lab' }, `<span>${label}</span><b></b>`);
    const input = el('input', { type: 'range', min, max, step, value: params[key] });
    const badge = lab.querySelector('b');
    const show = (v) => { badge.textContent = fmt(v); };
    input.addEventListener('input', () => setParam(key, parseFloat(input.value)));
    row.append(lab, input);
    panel.appendChild(row);
    sliders[key] = { input, show };
    show(params[key]);
  };

  addSlider('intensity', '火势', 0.3, 1.8, 0.01, (v) => v.toFixed(2));
  addSlider('turbulence', '湍流', 0, 2, 0.01, (v) => v.toFixed(2));
  addSlider('windAngle', '风向', -180, 180, 1, (v) => `${Math.round(v)}°`);
  addSlider('windStrength', '风力', 0, 1, 0.01, (v) => v.toFixed(2));

  // 质量分段
  const qRow = el('div', { className: 'row' });
  qRow.appendChild(el('div', { className: 'lab' }, '<span>渲染质量</span><b id="fireq"></b>'));
  const seg = el('div', { className: 'seg' });
  const qBtns = {};
  for (const [k, p] of Object.entries(QUALITY_PRESETS)) {
    const b = el('button', {}, p.label);
    b.addEventListener('click', () => setParam('quality', k));
    qBtns[k] = b;
    seg.appendChild(b);
  }
  qRow.appendChild(seg);
  panel.appendChild(qRow);

  // 暂停 / 重置视角
  const btns = el('div', { className: 'btns' });
  const pauseBtn = el('button', {}, '⏸ 暂停');
  pauseBtn.addEventListener('click', onTogglePause);
  const resetBtn = el('button', {}, '⟳ 重置视角');
  resetBtn.addEventListener('click', onResetView);
  btns.append(pauseBtn, resetBtn);
  panel.appendChild(btns);
  document.body.appendChild(panel);

  // 移动端折叠钮
  const fold = el('button', { id: 'firefold' }, '⚙ 控制');
  fold.addEventListener('click', () => panel.classList.toggle('open'));
  document.body.appendChild(fold);

  // HUD
  const hud = el('div', { id: 'firehud' });
  document.body.appendChild(hud);
  setInterval(() => {
    const s = getStats();
    hud.innerHTML =
      `帧率 <b>${s.fps.toFixed(0)}</b> fps · 分辨率 <b>${s.width}×${s.height}</b><br>` +
      `体积步进 <b>${s.steps}</b> 步 · 火星 <b>${s.sparks}</b> 粒 · 绘制 <b>${s.drawCalls}</b> 次`;
  }, 500);

  // 参数回显(含 __bench.setParam 触发的变更)
  const refresh = () => {
    for (const [k, s] of Object.entries(sliders)) {
      s.input.value = params[k];
      s.show(params[k]);
    }
    for (const [k, b] of Object.entries(qBtns)) b.classList.toggle('on', params.quality === k);
    document.getElementById('fireq').textContent = QUALITY_PRESETS[params.quality].label;
    pauseBtn.textContent = params.paused ? '▶ 继续' : '⏸ 暂停';
  };
  onParamChange(refresh);
  refresh();
}
