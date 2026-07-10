// ============================================================
// 列定义:宽度 / 紧凑宽度 / 冻结 / 对齐 / 可搜索标记
// 7 列在所有断点下全部可见(任务①):≤640px 仅启用 compactWidth
// 收窄列宽,配合冻结左二列 + 横向滚动保证 390px 可用(任务⑩)。
// ============================================================

export const COLUMNS = [
  { key: 'code',   label: '工号',     width: 96,  compactWidth: 74, min: 64,  pin: true,  align: 'left'  },
  { key: 'name',   label: '姓名',     width: 118, compactWidth: 92, min: 80,  pin: true, pinLast: true, search: true },
  { key: 'dept',   label: '部门',     width: 108, compactWidth: 84, min: 76,  search: true },
  { key: 'city',   label: '城市',     width: 96,  compactWidth: 80, min: 72,  search: true },
  { key: 'salary', label: '薪资',     width: 112, compactWidth: 82, min: 80,  align: 'right' },
  { key: 'date',   label: '入职日期', width: 124, compactWidth: 98, min: 96 },
  { key: 'status', label: '状态',     width: 100, compactWidth: 82, min: 76 },
];

export const STATUS = ['在职', '试用', '休假', '离职'];

/** 状态徽章 HTML(预生成常量,渲染热路径直接引用) */
export const STATUS_HTML = STATUS.map(
  (label, i) => `<span class="st st-${i}"><i></i>${label}</span>`
);
