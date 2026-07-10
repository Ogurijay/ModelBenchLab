/**
 * 自写轻量参数面板(无 lil-gui / dat.gui):
 * 固定点模式切换、8 个滑杆、撕裂开关、重置按钮、运行统计。
 * 滑杆直接写入 params 对象,物理端每子步读取 → 实时生效。
 */
export function buildPanel({ root, params, segYFor, onRebuild, onPinMode, onReset }) {
  const el = document.createElement('div');
  el.className = 'panel';
  el.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">参数面板</span>
      <button class="panel-toggle" type="button">收起</button>
    </div>
    <div class="panel-body"></div>
  `;
  root.appendChild(el);
  const body = el.querySelector('.panel-body');

  const toggle = el.querySelector('.panel-toggle');
  toggle.addEventListener('click', () => {
    el.classList.toggle('collapsed');
    toggle.textContent = el.classList.contains('collapsed') ? '展开' : '收起';
  });

  function section(label) {
    const s = document.createElement('div');
    s.className = 'section-label';
    s.textContent = label;
    body.appendChild(s);
  }

  function slider({ key, label, min, max, step, fmt, onCommit }) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.innerHTML = `
      <div class="slider-label"><span>${label}</span><span class="slider-value"></span></div>
      <input type="range" min="${min}" max="${max}" step="${step}" />
    `;
    const input = row.querySelector('input');
    const valEl = row.querySelector('.slider-value');
    const format = fmt || ((v) => String(v));
    input.value = params[key];
    valEl.textContent = format(params[key]);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      params[key] = v;
      valEl.textContent = format(v);
    });
    if (onCommit) input.addEventListener('change', onCommit);
    body.appendChild(row);
  }

  // ---- 固定点模式 ----
  section('固定点模式');
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.innerHTML = `
    <button type="button" class="seg-btn" data-mode="edge">整边固定 · 旗帜</button>
    <button type="button" class="seg-btn" data-mode="corners">两角固定 · 晾布</button>
  `;
  body.appendChild(seg);
  const segBtns = Array.from(seg.querySelectorAll('.seg-btn'));
  function markMode(mode) {
    segBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  }
  markMode(params.pinMode);
  segBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === params.pinMode) return;
      params.pinMode = btn.dataset.mode;
      markMode(params.pinMode);
      onPinMode(params.pinMode);
    })
  );

  // ---- 布料与求解 ----
  section('布料与求解');
  slider({
    key: 'segX',
    label: '布料分辨率(重建)',
    min: 12,
    max: 48,
    step: 2,
    fmt: (v) => `${Math.round(v)} × ${segYFor(Math.round(v))}`,
    onCommit: () => onRebuild(),
  });
  slider({
    key: 'iterations',
    label: '约束迭代次数(刚度)',
    min: 1,
    max: 15,
    step: 1,
    fmt: (v) => `${Math.round(v)} 次`,
  });

  // ---- 物理 ----
  section('物理');
  slider({ key: 'gravity', label: '重力 (m/s²)', min: 0, max: 20, step: 0.1, fmt: (v) => v.toFixed(1) });
  slider({ key: 'damping', label: '阻尼', min: 0, max: 0.08, step: 0.002, fmt: (v) => v.toFixed(3) });

  // ---- 风场 ----
  section('风场');
  slider({ key: 'windDirection', label: '风向', min: 0, max: 360, step: 1, fmt: (v) => `${Math.round(v)}°` });
  slider({ key: 'windStrength', label: '风力 (m/s)', min: 0, max: 15, step: 0.1, fmt: (v) => v.toFixed(1) });
  slider({ key: 'gust', label: '阵风强度', min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) });

  // ---- 撕裂(L4) ----
  section('撕裂 · L4');
  const check = document.createElement('label');
  check.className = 'check-row';
  check.innerHTML = `<input type="checkbox" /> 启用撕裂(超应力断开约束)`;
  const checkbox = check.querySelector('input');
  checkbox.checked = params.tearEnabled;
  checkbox.addEventListener('change', () => {
    params.tearEnabled = checkbox.checked;
  });
  body.appendChild(check);
  slider({
    key: 'tearThreshold',
    label: '撕裂阈值(应变比)',
    min: 1.2,
    max: 3,
    step: 0.05,
    fmt: (v) => `×${v.toFixed(2)}`,
  });

  // ---- 操作 ----
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn-reset';
  resetBtn.textContent = '重置布料';
  resetBtn.addEventListener('click', () => onReset());
  body.appendChild(resetBtn);

  const stats = document.createElement('div');
  stats.className = 'stats';
  body.appendChild(stats);

  return {
    setStats({ fps, particles, structural, shear, torn }) {
      stats.innerHTML =
        `FPS <b>${fps}</b> · 粒子 ${particles}<br>` +
        `约束 ${structural + shear}(结构 ${structural} / 剪切 ${shear})<br>` +
        `撕裂断开 ${torn}`;
    },
  };
}
