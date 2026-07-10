// ============================================================
// 虚拟滚动网格:
//   - spacer(.grid-canvas 高度 = 行高 × 行数)撑出真实滚动条比例;
//   - 行节点池复用(≤80 个),绝对定位 translateY(i*rowH);
//   - scroll 监听 {passive:true} 只做调度,rAF 合帧统一渲染;
//   - 行级脏检查:node._vi + node._epoch 相同则跳过重绘;
//   - window resize 经 rAF 节流重算可视行数与节点池;
//   - 表头吸顶(sticky)、列宽拖拽(指示线 + 释放提交)、冻结左二列;
//   - 键盘导航 + 空态插画。
// ============================================================

import { COLUMNS, STATUS_HTML } from './columns.js';
import { clamp, rafThrottle, highlightHtml } from './utils.js';

export const ROW_H = 36;
export const HEADER_H = 40;
const OVERSCAN = 10;       // 可视区上下各预渲染 10 行
const MAX_DOM_ROWS = 80;   // 任务硬约束:DOM 数据行节点 ≤ 80
const MAX_COL_W = 640;

const EMPTY_SVG = `
<svg viewBox="0 0 132 110" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="eg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b8cff"/><stop offset="1" stop-color="#3ddc97"/>
    </linearGradient>
  </defs>
  <rect x="14" y="16" width="86" height="12" rx="6" stroke="#2b3554" stroke-width="2" stroke-dasharray="5 5"/>
  <rect x="14" y="38" width="86" height="12" rx="6" stroke="#2b3554" stroke-width="2" stroke-dasharray="5 5"/>
  <rect x="14" y="60" width="60" height="12" rx="6" stroke="#2b3554" stroke-width="2" stroke-dasharray="5 5"/>
  <circle cx="92" cy="72" r="20" stroke="url(#eg)" stroke-width="3"/>
  <line x1="106" y1="86" x2="120" y2="100" stroke="url(#eg)" stroke-width="4" stroke-linecap="round"/>
  <path d="M84 72c2-6 6-9 8-9" stroke="#3a4a78" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

export function createGrid({ root, store, onClearSearch }) {
  const { state } = store;
  const { rows } = state;

  // ---------------- DOM 骨架 ----------------

  const gridEl = el('div', 'grid');
  const viewport = el('div', 'grid-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'grid');
  viewport.setAttribute('aria-label', '员工数据网格');
  viewport.setAttribute('aria-multiselectable', 'true');

  const headerEl = el('div', 'grid-header');
  headerEl.setAttribute('role', 'row');
  const canvas = el('div', 'grid-canvas');

  const emptyEl = el('div', 'grid-empty');
  emptyEl.hidden = true;
  emptyEl.innerHTML = `${EMPTY_SVG}
    <h2>没有匹配的记录</h2>
    <p class="empty-text"></p>
    <button type="button" class="btn empty-clear">清空搜索</button>`;
  emptyEl.querySelector('.empty-clear').addEventListener('click', () => onClearSearch?.());
  const emptyText = emptyEl.querySelector('.empty-text');

  const guide = el('div', 'col-guide');
  guide.hidden = true;
  guide.innerHTML = '<span></span>';
  const guideLabel = guide.querySelector('span');

  viewport.append(headerEl, canvas);
  gridEl.append(viewport, emptyEl, guide);
  root.appendChild(gridEl);

  // ---------------- 表头 ----------------

  const headerCells = new Map(); // key -> hcell
  const headerPins = [];
  for (const col of COLUMNS) {
    const hc = el('div', 'hcell' + (col.pin ? ' pin' : '') + (col.pinLast ? ' pin-last' : '') + (col.align === 'right' ? ' num' : ''));
    hc.dataset.key = col.key;
    hc.setAttribute('role', 'columnheader');
    hc.setAttribute('aria-sort', 'none');
    hc.style.width = `var(--w-${col.key})`;

    const btn = el('button', 'hbtn');
    btn.type = 'button';
    btn.title = `按${col.label}排序(Shift+点击追加多列排序)`;
    btn.innerHTML = `<span class="hlabel">${col.label}</span><span class="hind">⇅</span><sup class="hbadge"></sup>`;
    btn.addEventListener('click', (e) => {
      store.cycleSort(col.key, e.shiftKey);
    });

    const rz = el('div', 'hresize');
    rz.title = '拖动调整列宽,双击复位';
    hc.append(btn, rz);
    headerEl.appendChild(hc);
    headerCells.set(col.key, hc);
    if (col.pin) headerPins.push(hc);
  }

  // ---------------- 列宽与可见性 ----------------

  // 紧凑模式(≤640px)只收窄列宽,7 列全部保留:
  // 城市是搜索命中列,移动端也必须可见;窄屏靠横向滚动 + 冻结左二列保证可用。
  const compactMql = window.matchMedia('(max-width: 640px)');
  let compact = compactMql.matches;

  function colWidth(col) {
    if (col.userWidth) return col.userWidth;
    return compact ? col.compactWidth : col.width;
  }

  function applyLayout() {
    let totalW = 0;
    for (const col of COLUMNS) {
      const w = colWidth(col);
      gridEl.style.setProperty(`--w-${col.key}`, `${w}px`);
      totalW += w;
    }
    gridEl.style.setProperty('--total-w', `${totalW}px`);
  }

  const onMqlChange = () => {
    compact = compactMql.matches;
    applyLayout();
    store.touch('layout');
  };
  if (compactMql.addEventListener) compactMql.addEventListener('change', onMqlChange);
  else compactMql.addListener(onMqlChange); // 兼容旧 API

  // ---------------- 行节点池 ----------------

  const pool = [];
  let usedCount = 0;
  let viewH = 0;

  function makeRowNode() {
    const node = el('div', 'row');
    node.hidden = true;
    node.setAttribute('role', 'row');
    node._vi = -1;
    node._epoch = -1;
    node._sl = 0;
    node._cells = {};
    node._pins = [];
    for (const col of COLUMNS) {
      const c = el('div',
        'cell c-' + col.key +
        (col.align === 'right' ? ' num' : '') +
        (col.pin ? ' pin' : '') +
        (col.pinLast ? ' pin-last' : ''));
      c.setAttribute('role', 'gridcell');
      c.style.width = `var(--w-${col.key})`;
      node._cells[col.key] = c;
      if (col.pin) node._pins.push(c);
      node.appendChild(c);
    }
    return node;
  }

  function setPoolSize(n) {
    while (pool.length < n) {
      const node = makeRowNode();
      pool.push(node);
      canvas.appendChild(node);
    }
    while (pool.length > n) {
      pool.pop().remove();
    }
  }

  // ---------------- 渲染(rAF 合帧) ----------------

  let rafId = 0;
  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      render();
    });
  }

  let lastTotal = -1;
  let lastSl = -1;

  function setPinOffsets(cells, sl) {
    const t = sl > 0 ? `translate3d(${sl}px,0,0)` : '';
    for (const c of cells) c.style.transform = t;
  }

  function populate(node, vi, sl) {
    const view = state.view;
    const id = view[vi];
    const r = rows[id];
    const selected = state.selection.has(id);

    node._vi = vi;
    node._epoch = state.epoch;
    node.hidden = false;
    node.dataset.vi = vi;
    node.dataset.id = id;
    node.style.transform = `translateY(${vi * ROW_H}px)`;
    node.className =
      'row' + (vi & 1 ? ' odd' : '') + (selected ? ' sel' : '') +
      (vi === state.activeIdx ? ' act' : '');
    node.setAttribute('aria-selected', selected ? 'true' : 'false');
    node.setAttribute('aria-rowindex', vi + 2); // 表头占第 1 行

    const cells = node._cells;
    cells.code.textContent = r.codeText;
    if (state.queryLower) {
      cells.name.innerHTML = highlightHtml(r.name, state.query);
      cells.dept.innerHTML = highlightHtml(r.dept, state.query);
      cells.city.innerHTML = highlightHtml(r.city, state.query);
    } else {
      cells.name.textContent = r.name;
      cells.dept.textContent = r.dept;
      cells.city.textContent = r.city;
    }
    cells.salary.textContent = r.salaryText;
    cells.date.textContent = r.dateText;
    cells.status.innerHTML = STATUS_HTML[r.statusIdx];

    if (node._sl !== sl) {
      setPinOffsets(node._pins, sl);
      node._sl = sl;
    }
  }

  function render() {
    const view = state.view;
    const total = view.length;

    if (lastTotal !== total) {
      canvas.style.height = `${total * ROW_H}px`;
      viewport.setAttribute('aria-rowcount', total + 1);
      const empty = total === 0;
      emptyEl.hidden = !empty;
      if (empty) {
        emptyText.textContent =
          `没有找到与「${state.query}」相关的员工,试试更短的关键字,或检查是否有错别字。`;
      }
      lastTotal = total;
    }

    const sTop = viewport.scrollTop;
    const sl = viewport.scrollLeft;

    let start = Math.floor(sTop / ROW_H) - OVERSCAN;
    start = Math.max(0, Math.min(start, total - pool.length));
    if (start < 0) start = 0;

    let used = 0;
    for (let i = 0; i < pool.length; i++) {
      const node = pool[i];
      const vi = start + i;
      if (vi >= total) {
        if (!node.hidden) {
          node.hidden = true;
          node._vi = -1;
        }
        continue;
      }
      used++;
      if (node._vi === vi && node._epoch === state.epoch) {
        if (node._sl !== sl) {
          setPinOffsets(node._pins, sl);
          node._sl = sl;
        }
        continue;
      }
      populate(node, vi, sl);
    }
    usedCount = used;

    if (sl !== lastSl) {
      setPinOffsets(headerPins, sl);
      gridEl.classList.toggle('x-scrolled', sl > 0);
      lastSl = sl;
    }
  }

  // ---------------- 滚动与 resize ----------------

  // 滚动监听只负责调度,渲染统一收敛到 rAF(合帧)
  viewport.addEventListener('scroll', schedule, { passive: true });

  function measure() {
    viewH = viewport.clientHeight;
    const need = Math.min(
      MAX_DOM_ROWS,
      Math.ceil(Math.max(0, viewH - HEADER_H) / ROW_H) + OVERSCAN * 2 + 1
    );
    setPoolSize(need);
    schedule();
  }

  const handleResize = rafThrottle(() => {
    state.metrics.resizeHandled++; // 实际处理次数(≤ 每帧 1 次)
    measure();
  });
  window.addEventListener('resize', () => {
    state.metrics.resizeEvents++; // 原始事件数(HUD 对照自证节流)
    handleResize();
  });

  // ---------------- 行选择(事件委托) ----------------

  canvas.addEventListener('click', (e) => {
    const rowEl = e.target.closest('.row');
    if (!rowEl || rowEl.hidden) return;
    store.clickRow(+rowEl.dataset.vi, {
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
    });
  });

  // ---------------- 键盘导航 ----------------

  function pageSize() {
    return Math.max(1, Math.floor((viewH - HEADER_H) / ROW_H) - 1);
  }

  function firstVisibleIdx() {
    return clamp(Math.floor(viewport.scrollTop / ROW_H), 0, Math.max(0, state.view.length - 1));
  }

  function ensureVisible(idx) {
    if (idx < 0) return;
    const availH = viewH - HEADER_H;
    const top = idx * ROW_H;
    const sTop = viewport.scrollTop;
    if (top < sTop) viewport.scrollTop = top;
    else if (top + ROW_H > sTop + availH) viewport.scrollTop = top + ROW_H - availH;
  }

  viewport.addEventListener('keydown', (e) => {
    const len = state.view.length;
    if (!len) return;
    const mods = { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    const cur = state.activeIdx;
    const base = cur >= 0 ? cur : firstVisibleIdx();

    switch (e.key) {
      case 'ArrowDown':
        store.moveActive(cur < 0 ? base : base + 1, mods);
        break;
      case 'ArrowUp':
        store.moveActive(cur < 0 ? base : base - 1, mods);
        break;
      case 'PageDown':
        store.moveActive(base + pageSize(), mods);
        break;
      case 'PageUp':
        store.moveActive(base - pageSize(), mods);
        break;
      case 'Home':
        store.moveActive(0, mods);
        break;
      case 'End':
        store.moveActive(len - 1, mods);
        break;
      case ' ':
      case 'Enter':
        store.toggleActive();
        break;
      case 'a':
      case 'A':
        if (!mods.ctrl) return;
        store.selectAllView();
        break;
      case 'Escape':
        store.clearSelection();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // ---------------- 列宽拖拽(指示线 + 释放提交) ----------------

  let drag = null;

  headerEl.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.hresize');
    if (!handle) return;
    const key = handle.parentElement.dataset.key;
    const col = COLUMNS.find((c) => c.key === key);
    if (!col) return;
    e.preventDefault();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // 合成事件没有活动指针时忽略(自动化脚本兼容)
    }

    const cellRect = handle.parentElement.getBoundingClientRect();
    const wrapRect = gridEl.getBoundingClientRect();
    drag = {
      col,
      startX: e.clientX,
      startW: colWidth(col),
      baseLeft: cellRect.left - wrapRect.left,
      w: colWidth(col),
    };
    gridEl.classList.add('resizing');
    guide.hidden = false;
    positionGuide(drag.w);
    // window 级监听:快速拖出表头 / 未获得指针捕获时也不丢事件
    window.addEventListener('pointermove', onWinPointerMove);
    window.addEventListener('pointerup', onWinPointerUp);
    window.addEventListener('pointercancel', onWinPointerCancel);
  });

  function positionGuide(w) {
    guide.style.left = `${drag.baseLeft + w}px`;
    guideLabel.textContent = `${drag.col.label} · ${w}px`;
  }

  // 指示线移动 rAF 节流;宽度值同步记录,释放时以最新值提交
  const moveGuideThrottled = rafThrottle(() => {
    if (drag) positionGuide(drag.w);
  });

  function onWinPointerMove(e) {
    if (!drag) return;
    drag.w = clamp(drag.startW + (e.clientX - drag.startX), drag.col.min, MAX_COL_W);
    moveGuideThrottled();
  }

  function onWinPointerUp() {
    endDrag(true);
  }

  function onWinPointerCancel() {
    endDrag(false);
  }

  function endDrag(commit) {
    window.removeEventListener('pointermove', onWinPointerMove);
    window.removeEventListener('pointerup', onWinPointerUp);
    window.removeEventListener('pointercancel', onWinPointerCancel);
    if (!drag) return;
    if (commit && drag.w !== drag.startW) {
      drag.col.userWidth = drag.w;
      applyLayout();
    }
    drag = null;
    guide.hidden = true;
    gridEl.classList.remove('resizing');
  }

  headerEl.addEventListener('dblclick', (e) => {
    const handle = e.target.closest('.hresize');
    if (!handle) return;
    const col = COLUMNS.find((c) => c.key === handle.parentElement.dataset.key);
    if (col) {
      delete col.userWidth;
      applyLayout();
    }
  });

  // ---------------- 表头排序指示 ----------------

  function updateHeaderSortUI() {
    const multi = state.sorts.length > 1;
    for (const col of COLUMNS) {
      const hc = headerCells.get(col.key);
      const i = state.sorts.findIndex((s) => s.key === col.key);
      const spec = i >= 0 ? state.sorts[i] : null;
      hc.classList.toggle('sorted', !!spec);
      hc.setAttribute('aria-sort', spec ? (spec.dir === 1 ? 'ascending' : 'descending') : 'none');
      hc.querySelector('.hind').textContent = spec ? (spec.dir === 1 ? '↑' : '↓') : '⇅';
      hc.querySelector('.hbadge').textContent = spec && multi ? String(i + 1) : '';
    }
  }

  // ---------------- 订阅状态 ----------------

  store.subscribe((reason) => {
    if (reason === 'sort') updateHeaderSortUI();
    if (reason === 'active') ensureVisible(state.activeIdx);
    schedule();
  });

  // ---------------- 初始化 ----------------

  applyLayout();
  measure();
  render(); // 首帧同步渲染,避免白屏

  // ---------------- 对外 API ----------------

  return {
    /** 当前实际承载数据的 DOM 行节点数(节点池上限 80) */
    getDomRowCount: () => usedCount,
    getPoolSize: () => pool.length,
    /**
     * 把视图中第 i 行滚动到可视区顶部(clamp 到有效范围)。
     * 随后同步渲染一帧:自动化脚本(含隐藏标签页,rAF 停摆)可立即读到正确 DOM。
     */
    scrollToRow(i) {
      const total = state.view.length;
      const target = clamp(Math.trunc(+i || 0), 0, Math.max(0, total - 1));
      viewport.scrollTop = target * ROW_H;
      render();
    },
    /** 强制同步渲染一帧(调试/自动化用,规避隐藏标签页 rAF 停摆) */
    renderNow: () => render(),
    focus: () => viewport.focus({ preventScroll: true }),
    element: gridEl,
    viewport,
  };
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
