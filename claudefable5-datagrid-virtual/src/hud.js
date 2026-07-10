// ============================================================
// 性能 HUD(右下角常驻,自证性能):
//   FPS(rAF 帧计数) / DOM 行节点数 / 总行数与过滤后行数 /
//   最近一次过滤与排序耗时 / 过滤执行次数 / resize 处理与事件计数
// ============================================================

import { formatMs, formatThousands } from './utils.js';

export function createHud({ store, grid }) {
  const el = document.createElement('aside');
  el.className = 'hud';
  el.setAttribute('aria-label', '性能监控面板');
  el.innerHTML = `
    <div class="hud-head">
      <span>性能 HUD</span>
      <button type="button" class="hud-toggle" title="折叠 / 展开">−</button>
    </div>
    <div class="hud-fps">
      <span class="v" data-k="fps">--</span><span class="u">FPS</span>
      <span class="hud-bar"><i data-k="fpsbar"></i></span>
    </div>
    <dl>
      <dt>DOM 行节点</dt><dd><span data-k="dom">0</span> <em>/ 池 <span data-k="pool">0</span> · 上限 80</em></dd>
      <dt>总行数</dt><dd data-k="total">0</dd>
      <dt>过滤后</dt><dd data-k="filtered">0</dd>
      <dt>过滤耗时</dt><dd data-k="filterMs">—</dd>
      <dt>排序耗时</dt><dd data-k="sortMs">—</dd>
      <dt>过滤执行次数</dt><dd data-k="filterRuns">0</dd>
      <dt>resize 处理/事件</dt><dd data-k="resize">0 / 0</dd>
    </dl>`;
  document.body.appendChild(el);

  const $ = (k) => el.querySelector(`[data-k="${k}"]`);
  const refs = {
    fps: $('fps'), fpsbar: $('fpsbar'), dom: $('dom'), pool: $('pool'),
    total: $('total'), filtered: $('filtered'),
    filterMs: $('filterMs'), sortMs: $('sortMs'),
    filterRuns: $('filterRuns'), resize: $('resize'),
  };

  el.querySelector('.hud-toggle').addEventListener('click', (e) => {
    const collapsed = el.classList.toggle('collapsed');
    e.target.textContent = collapsed ? '+' : '−';
  });

  let frames = 0;
  let lastT = performance.now();
  let fps = 0;

  function paint() {
    const { state } = store;
    const m = state.metrics;

    refs.fps.textContent = fps || '--';
    const cls = fps >= 50 ? '' : fps >= 30 ? 'warn' : 'bad';
    refs.fps.className = 'v' + (cls ? ' ' + cls : '');
    refs.fpsbar.className = cls;
    refs.fpsbar.style.transform = `scaleX(${Math.min(1, fps / 60)})`;

    refs.dom.textContent = grid.getDomRowCount();
    refs.pool.textContent = grid.getPoolSize();
    refs.total.textContent = formatThousands(state.rows.length);
    refs.filtered.textContent = formatThousands(state.view.length);
    refs.filterMs.textContent = formatMs(m.lastFilterMs);
    refs.sortMs.textContent = formatMs(m.lastSortMs);
    refs.filterRuns.textContent = m.filterRuns;
    refs.resize.textContent = `${m.resizeHandled} / ${m.resizeEvents}`;
  }

  function loop(t) {
    frames++;
    const dt = t - lastT;
    if (dt >= 500) {
      fps = Math.round((frames * 1000) / dt);
      frames = 0;
      lastT = t;
      paint();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // 状态变更时立即刷新(rAF 循环之外的兜底,隐藏标签页下也保持准确)
  store.subscribe(() => paint());
  paint();

  return { element: el };
}
