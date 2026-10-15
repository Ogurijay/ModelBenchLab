// 美术总监调参面板：lil-gui 滑块 + 「复制设置为 JSON」。
// 用户调好后把 JSON 贴回对话 → 固化成 settings 默认值 → 交付前删掉面板（或仅 ?debug 时创建）。
//
// import GUI from 'lil-gui';
// const settings = { sunElevation: 35, sunAzimuth: 140, exposure: 1, fogColor: '#c9d6e3' };
// createArtDirectorPanel({
//   GUI, settings,
//   schema: [
//     { key: 'sunElevation', label: '太阳高度°', min: 0, max: 90, step: 0.5, folder: '灯光' },
//     { key: 'sunAzimuth', label: '太阳方位°', min: 0, max: 360, step: 1, folder: '灯光' },
//     { key: 'exposure', label: '曝光', min: 0.1, max: 3, step: 0.01, folder: '画面' },
//     { key: 'fogColor', label: '雾颜色', color: true, folder: '画面' },
//     { key: 'preset', label: '时段', options: ['清晨', '正午', '黄昏'] },
//   ],
//   onChange: (key, value, settings) => applySettings(settings),
// });

export function createArtDirectorPanel({ GUI, settings, schema, onChange, title = '美术总监面板' }) {
  for (const s of schema) {
    if (!(s.key in settings)) throw new Error(`settings 里没有 "${s.key}"`);
  }
  const defaults = structuredClone(settings);
  const gui = new GUI({ title });
  const folders = {};

  for (const s of schema) {
    const parent = s.folder ? (folders[s.folder] ??= gui.addFolder(s.folder)) : gui;
    const ctrl = s.color
      ? parent.addColor(settings, s.key)
      : s.options
        ? parent.add(settings, s.key, s.options)
        : parent.add(settings, s.key, s.min, s.max, s.step);
    ctrl.name(s.label ?? s.key).onChange((v) => onChange?.(s.key, v, settings));
  }

  const actions = {
    copy: async () => {
      const json = JSON.stringify(settings, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        flash('已复制，贴回对话即可固化');
      } catch {
        showFallback(json); // 非安全上下文（如局域网 IP 访问）时剪贴板不可用
      }
    },
    reset: () => {
      Object.assign(settings, structuredClone(defaults));
      gui.controllersRecursive().forEach((c) => c.updateDisplay());
      for (const s of schema) onChange?.(s.key, settings[s.key], settings);
    },
  };
  gui.add(actions, 'copy').name('复制设置为 JSON');
  gui.add(actions, 'reset').name('恢复默认');

  function flash(text) {
    const el = document.createElement('div');
    el.dataset.ui = '';
    el.textContent = text;
    el.style.cssText =
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:8px 14px;' +
      'background:#111a;color:#fff;font:13px system-ui;border-radius:6px;z-index:99999';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function showFallback(json) {
    const ta = document.createElement('textarea');
    ta.dataset.ui = '';
    ta.value = json;
    ta.style.cssText =
      'position:fixed;inset:20% 25%;z-index:99999;font:12px monospace;padding:12px;' +
      'background:#111;color:#eee;border:1px solid #555;border-radius:6px';
    ta.addEventListener('blur', () => ta.remove());
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    flash('剪贴板不可用：已选中文本，Ctrl+C 复制');
  }

  return gui;
}
