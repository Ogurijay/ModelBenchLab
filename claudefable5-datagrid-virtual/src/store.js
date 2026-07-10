// ============================================================
// 中央状态仓库(单向数据流):
//   动作(filter/sort/selection/active) -> 变更 state + epoch++ -> notify
//   订阅方(网格/工具栏/HUD)只读 state 并渲染。
//
// 关键设计:
//   - filtered / view 均为「行 id 的 Uint32Array」,行对象永不移动;
//   - 选中集合是 Set<行id>,与视图顺序解耦 => 排序/过滤后选中天然保持;
//   - 排序用预构建的数值键数组,100k 行 sort 只做数字比较。
// ============================================================

import { clamp } from './utils.js';

export function createStore({ rows, keys, generateMs }) {
  const total = rows.length;
  const allIds = new Uint32Array(total);
  for (let i = 0; i < total; i++) allIds[i] = i;

  const state = {
    rows,
    query: '',       // 原文(用于高亮展示)
    queryLower: '',  // 小写(用于匹配)
    sorts: [],       // [{ key, dir: 1 | -1 }, ...] 支持 Shift 多列
    filtered: allIds, // 过滤结果(id 升序)
    view: allIds,     // 过滤 + 排序后的显示顺序
    selection: new Set(), // Set<行id>
    anchorId: -1,     // Shift 范围选择锚点(行 id)
    activeIdx: -1,    // 活动行(view 下标)
    epoch: 0,         // 渲染纪元:任何状态变更 +1,行节点据此判断是否需重绘
    metrics: {
      filterRuns: 0,
      lastFilterMs: -1,
      lastSortMs: -1,
      resizeEvents: 0,
      resizeHandled: 0,
      generateMs,
    },
  };

  const listeners = new Set();

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function notify(reason) {
    state.epoch++;
    for (const fn of listeners) fn(reason);
  }

  // ---------------- 排序 ----------------

  function makeComparator() {
    const specs = state.sorts.map((s) => ({
      arr: s.key === 'code' ? null : keys[s.key], // code 键即 id 本身
      dir: s.dir,
    }));
    const n = specs.length;
    return (a, b) => {
      for (let i = 0; i < n; i++) {
        const { arr, dir } = specs[i];
        const d = arr ? arr[a] - arr[b] : a - b;
        if (d !== 0) return d * dir;
      }
      return a - b; // id 兜底 => 稳定排序
    };
  }

  /** 由 filtered + sorts 重建 view,计排序耗时 */
  function rebuildView() {
    if (state.sorts.length === 0) {
      state.view = state.filtered;
      return;
    }
    const t0 = performance.now();
    state.view = state.filtered.slice().sort(makeComparator());
    state.metrics.lastSortMs = performance.now() - t0;
  }

  function currentActiveId() {
    const { activeIdx, view } = state;
    return activeIdx >= 0 && activeIdx < view.length ? view[activeIdx] : -1;
  }

  function restoreActive(id) {
    state.activeIdx = id < 0 ? -1 : state.view.indexOf(id);
  }

  /**
   * 表头点击:三态循环 升 -> 降 -> 无。
   * additive=true(Shift+点击)时作为次级排序键追加/循环。
   */
  function cycleSort(key, additive = false) {
    const sorts = state.sorts;
    const idx = sorts.findIndex((s) => s.key === key);
    if (additive) {
      if (idx === -1) sorts.push({ key, dir: 1 });
      else if (sorts[idx].dir === 1) sorts[idx].dir = -1;
      else sorts.splice(idx, 1);
    } else if (sorts.length === 1 && idx === 0) {
      if (sorts[0].dir === 1) sorts[0].dir = -1;
      else state.sorts = [];
    } else {
      state.sorts = [{ key, dir: 1 }];
    }
    const aid = currentActiveId();
    rebuildView();
    restoreActive(aid);
    notify('sort');
  }

  // ---------------- 过滤 ----------------

  /** 立即执行过滤(防抖由调用方负责),跨姓名/部门/城市 */
  function runFilter(rawQuery) {
    const q = String(rawQuery ?? '').trim();
    state.query = q;
    state.queryLower = q.toLowerCase();
    const aid = currentActiveId();

    const t0 = performance.now();
    if (!state.queryLower) {
      state.filtered = allIds;
    } else {
      const needle = state.queryLower;
      const out = new Uint32Array(total);
      let n = 0;
      for (let i = 0; i < total; i++) {
        if (rows[i].hay.includes(needle)) out[n++] = i;
      }
      state.filtered = out.subarray(0, n);
    }
    state.metrics.lastFilterMs = performance.now() - t0;
    state.metrics.filterRuns++;

    rebuildView();
    restoreActive(aid);
    notify('filter');
  }

  // ---------------- 选择 ----------------

  /** 行点击:单选 / Shift 范围 / Ctrl 增删 / Ctrl+Shift 追加范围 */
  function clickRow(viewIdx, { shift = false, ctrl = false } = {}) {
    const view = state.view;
    if (viewIdx < 0 || viewIdx >= view.length) return;
    const id = view[viewIdx];
    state.activeIdx = viewIdx;

    if (shift && state.anchorId >= 0) {
      const ai = view.indexOf(state.anchorId);
      if (ai !== -1) {
        const lo = Math.min(ai, viewIdx);
        const hi = Math.max(ai, viewIdx);
        const range = ctrl ? state.selection : new Set();
        for (let i = lo; i <= hi; i++) range.add(view[i]);
        state.selection = range;
        notify('selection');
        return;
      }
      // 锚点被过滤掉了 => 退化为单选
    }
    if (ctrl) {
      if (state.selection.has(id)) state.selection.delete(id);
      else state.selection.add(id);
      state.anchorId = id;
    } else {
      state.selection = new Set([id]);
      state.anchorId = id;
    }
    notify('selection');
  }

  /**
   * 键盘移动活动行:
   *   plain -> 移动 + 单选;shift -> 锚点到新位置的范围选择;ctrl -> 仅移动。
   */
  function moveActive(idx, { shift = false, ctrl = false } = {}) {
    const view = state.view;
    if (!view.length) return;
    idx = clamp(idx, 0, view.length - 1);
    state.activeIdx = idx;
    const id = view[idx];

    if (shift) {
      if (state.anchorId < 0) state.anchorId = id;
      const ai = view.indexOf(state.anchorId);
      if (ai !== -1) {
        const lo = Math.min(ai, idx);
        const hi = Math.max(ai, idx);
        const range = new Set();
        for (let i = lo; i <= hi; i++) range.add(view[i]);
        state.selection = range;
      }
    } else if (!ctrl) {
      state.selection = new Set([id]);
      state.anchorId = id;
    }
    notify('active');
  }

  function toggleActive() {
    const id = currentActiveId();
    if (id < 0) return;
    if (state.selection.has(id)) state.selection.delete(id);
    else state.selection.add(id);
    state.anchorId = id;
    notify('selection');
  }

  function selectAllView() {
    state.selection = new Set(state.view);
    notify('selection');
  }

  function clearSelection() {
    if (!state.selection.size && state.activeIdx < 0) return;
    state.selection = new Set();
    state.anchorId = -1;
    notify('selection');
  }

  /** 布局类外部变更(列可见性等)需要整体重绘时调用 */
  function touch(reason = 'layout') {
    notify(reason);
  }

  return {
    state,
    subscribe,
    cycleSort,
    runFilter,
    clickRow,
    moveActive,
    toggleActive,
    selectAllView,
    clearSelection,
    touch,
  };
}
