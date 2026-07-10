// ============================================================
// window.__bench 调试钩子(评测工程要求):
//   { ready, getState(), scrollToRow(i), search(text) }
//   getState() -> { domRowCount, totalRows, filteredRows, filterRuns, selectedCount }
// ============================================================

export function installBench({ store, grid, onSearch }) {
  const bench = {
    ready: false,
    getState() {
      const { state } = store;
      return {
        domRowCount: grid.getDomRowCount(),
        totalRows: state.rows.length,
        filteredRows: state.filtered.length,
        filterRuns: state.metrics.filterRuns,
        selectedCount: state.selection.size,
      };
    },
    scrollToRow(i) {
      grid.scrollToRow(i); // 内部会同步渲染一帧
    },
    /** 同步执行搜索(绕过输入防抖,filterRuns 恰好 +1),并同步输入框 UI 与渲染 */
    search(text) {
      onSearch(String(text ?? ''));
      grid.renderNow();
    },
    /** 强制同步渲染一帧(隐藏标签页 rAF 停摆时自动化可用) */
    renderNow() {
      grid.renderNow();
    },
  };

  window.__bench = bench;

  // 网格在 createGrid 内已完成首次同步渲染;
  // setTimeout(0) 兜底保证隐藏标签页(rAF 停摆)下 ready 也能置位。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bench.ready = true;
    });
  });
  setTimeout(() => {
    bench.ready = true;
  }, 0);

  return bench;
}
