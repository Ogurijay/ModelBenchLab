// 左上角运行时统计。
export function createHud(el) {
  const rows = [
    ['fps', 'FPS'], ['draw', 'DRAW'], ['tri', 'TRIS'],
    ['int', '室内组'], ['pos', '坐标'], ['mode', '视角'],
  ];
  el.innerHTML = rows.map(([k, label]) =>
    `<div><span class="k">${label}</span><span class="v" id="hud-${k}">—</span></div>`).join('');
  const ref = {};
  for (const [k] of rows) ref[k] = el.querySelector('#hud-' + k);

  let frames = 0, acc = 0, fps = 0;
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));

  return {
    update(dt, renderer, pos, modeText, interiors) {
      frames++; acc += dt;
      if (acc < 0.35) return;
      fps = frames / acc; frames = 0; acc = 0;
      const info = renderer.info.render;
      ref.fps.textContent = fps.toFixed(0);
      ref.fps.className = 'v' + (fps < 30 ? ' warn' : '');
      ref.draw.textContent = info.calls;
      ref.tri.textContent = fmt(info.triangles);
      ref.int.textContent = interiors;
      ref.pos.textContent = `${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}`;
      ref.mode.textContent = modeText;
    },
    get fps() { return fps; },
  };
}
