// ============================================================
// 入口:数据生成 -> 状态仓库 -> 网格 -> HUD -> __bench -> 工具栏接线
// ============================================================

import { generateData } from './data.js';
import { createStore } from './store.js';
import { createGrid } from './grid.js';
import { createHud } from './hud.js';
import { installBench } from './bench.js';
import { debounce, formatMs, formatThousands } from './utils.js';
import { COLUMNS } from './columns.js';

// ---------- 数据与状态 ----------

const data = generateData(); // seed=42,刷新后数据完全一致
const store = createStore(data);
const { state } = store;

// ---------- DOM 引用 ----------

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const chipRows = document.getElementById('chipRows');
const chipSelected = document.getElementById('chipSelected');
const btnClearSel = document.getElementById('btnClearSel');
const btnCsv = document.getElementById('btnCsv');
const opMsg = document.getElementById('opMsg');

// ---------- 搜索(防抖 300ms) ----------

const debouncedFilter = debounce((q) => store.runFilter(q), 300);

searchInput.addEventListener('input', () => {
  searchClear.hidden = searchInput.value === '';
  debouncedFilter(searchInput.value);
});

/** 立即搜索(清空按钮 / __bench.search 使用):取消挂起的防抖调用后同步执行 */
function searchNow(text) {
  debouncedFilter.cancel();
  searchInput.value = text;
  searchClear.hidden = text === '';
  store.runFilter(text);
}

searchClear.addEventListener('click', () => {
  searchNow('');
  searchInput.focus();
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchNow('');
  } else if (e.key === 'Enter') {
    // 回车立刻执行,不等防抖
    debouncedFilter.cancel();
    store.runFilter(searchInput.value);
  }
});

// “/” 快捷聚焦搜索框
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && e.target !== searchInput &&
    !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// ---------- 网格与 HUD ----------

const grid = createGrid({
  root: document.getElementById('gridRoot'),
  store,
  onClearSearch: () => {
    searchNow('');
    searchInput.focus();
  },
});

const hud = createHud({ store, grid });
void hud;

// ---------- 工具栏 ----------

const totalRows = state.rows.length;

function sortDescription() {
  if (!state.sorts.length) return '';
  return state.sorts
    .map((s) => {
      const col = COLUMNS.find((c) => c.key === s.key);
      return `${col ? col.label : s.key}${s.dir === 1 ? '↑' : '↓'}`;
    })
    .join(' · ');
}

function updateToolbar(reason) {
  const filtered = state.view.length;
  chipRows.textContent =
    filtered === totalRows
      ? `共 ${formatThousands(totalRows)} 行`
      : `筛选 ${formatThousands(filtered)} / ${formatThousands(totalRows)}`;

  const selCount = state.selection.size;
  chipSelected.hidden = selCount === 0;
  btnClearSel.hidden = selCount === 0;
  if (selCount > 0) chipSelected.textContent = `已选 ${formatThousands(selCount)}`;

  if (reason === 'filter') {
    const base = `过滤完成:命中 ${formatThousands(filtered)} 行 · ${formatMs(state.metrics.lastFilterMs)}`;
    const sd = sortDescription();
    opMsg.textContent = sd ? `${base}(排序 ${sd})` : base;
  } else if (reason === 'sort') {
    const sd = sortDescription();
    opMsg.textContent = sd
      ? `排序 ${sd} · ${formatMs(state.metrics.lastSortMs)}`
      : '已取消排序';
  }
}

store.subscribe(updateToolbar);
updateToolbar();

btnClearSel.addEventListener('click', () => store.clearSelection());

// ---------- CSV 导出(L4 加分:导出当前过滤 + 排序后的视图) ----------

function csvField(s) {
  const v = String(s);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

btnCsv.addEventListener('click', () => {
  const t0 = performance.now();
  const view = state.view;
  const rows = state.rows;
  const lines = new Array(view.length + 1);
  lines[0] = COLUMNS.map((c) => c.label).join(',');
  for (let i = 0; i < view.length; i++) {
    const r = rows[view[i]];
    lines[i + 1] = [
      r.codeText, csvField(r.name), r.dept, r.city,
      r.salary, r.dateText, r.statusText,
    ].join(',');
  }
  // BOM(U+FEFF)让 Excel 正确识别 UTF-8 中文
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `员工数据_${view.length}行.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  opMsg.textContent = `已导出 ${formatThousands(view.length)} 行 CSV · ${formatMs(performance.now() - t0)}`;
});

// ---------- __bench 调试钩子 ----------

installBench({ store, grid, onSearch: searchNow });

console.info(
  '%c[bench] %cwindow.__bench 就绪:getState() / scrollToRow(i) / search(text)',
  'color:#5b8cff;font-weight:bold', 'color:inherit',
  `\n  数据生成 ${formatMs(state.metrics.generateMs)},共 ${formatThousands(totalRows)} 行(seed=42)`
);

// 初始聚焦网格,键盘导航开箱即用
grid.focus();
