# 交接文档 — claudefable5-datagrid-virtual(十万行虚拟数据网格)

## 项目概况

- **任务**:`benchmark/tasks/code-to-ui/datagrid.md`(冻结 v1 · 2026-07-10)——原生 JS 十万行数据网格:虚拟滚动、防抖搜索、rAF resize、三态排序、列宽拖拽、键盘导航、多模式选择、性能 HUD 自证、中文暗色 UI、390px 可用。
- **实现方式**:完全原创,纯原生 JavaScript ESM(禁框架/组件库),**零运行时依赖**,仅 `vite ^8.1.2` 作 devDependency。无任何外部资产(图标/插画均为内联 SVG)。
- **端口**:`3028`(根 RULES.md registry 登记;`vite.config.js` 已设 `port:3028, strictPort:true`,单独 `npm run dev` 与根 launch 配置行为一致;3027 属于兄弟项目 bowling-physics)。
- **启动**:本目录 `npm run dev`;依赖由主会话在仓库根统一安装,本目录**不要**单独 `npm install`。

## 技术架构

| 文件 | 职责 |
|------|------|
| `index.html` | 入口:顶栏(品牌/搜索框/统计 chips/导出按钮)+ 状态行 + 网格挂载点,全中文 |
| `src/styles.css` | 暗色主题 CSS 变量体系、网格/表头/行/徽章/HUD/空态/指示线样式、640px 与 900px 断点 |
| `src/data.js` | mulberry32(seed=42) PRNG;姓/名/部门/城市池(拼音序);100k 行生成 + 全列数值排序键(typed array)+ 搜索干草堆 `hay` |
| `src/columns.js` | 7 列声明式定义(宽度/紧凑宽度/最小宽/冻结/对齐/可搜索)+ 状态徽章 HTML 常量 |
| `src/store.js` | 中央状态仓库(单向数据流):filtered/view 为行 id 的 Uint32Array;过滤/排序/选择/活动行动作;epoch 渲染纪元;metrics 计量 |
| `src/grid.js` | 虚拟滚动渲染器:行节点池(≤80)、rAF 合帧、行级脏检查、表头吸顶与排序指示、列宽拖拽指示线、冻结列 translateX、键盘导航、空态插画 |
| `src/hud.js` | 右下角性能 HUD:rAF FPS 环 + 各项指标,可折叠 |
| `src/bench.js` | `window.__bench` 调试钩子 |
| `src/utils.js` | debounce / rafThrottle / clamp / escapeHtml / highlightHtml / 格式化 |
| `src/main.js` | 装配:数据→store→grid→HUD→bench;搜索防抖接线;工具栏;CSV 导出 |

## 核心系统清单

1. **虚拟化**:`.grid-canvas` 高度 = 36px × 行数撑滚动条;行绝对定位 `translateY(vi*36)`;池大小 = `min(80, 可视行 + 2×10 overscan + 1)`;scroll 只调度、渲染收敛到单个 rAF;节点复用时 `_vi === vi && _epoch === epoch` 则跳过重绘,纯滚动帧只写少数新进入窗口的行。
2. **数据与排序**:所有列都有 id 索引的数值键(姓名 = 拼音序池下标组合、枚举 = 池下标、日期 = 天数),排序即 `Uint32Array.slice().sort((a,b)=>key[a]-key[b])` + id 兜底(稳定);100k 行约 20–60ms,耗时进 HUD 与状态行。多列排序:Shift+点击追加,表头显示序号徽章。
3. **搜索**:`debounce(fn,300)`(闭包,含 `cancel()`);执行时 `filterRuns++`、`lastFilterMs` 计时;`hay = name+dept+city`(`` 分隔)小写 `includes`;命中列用 `highlightHtml`(全部转义 + `<mark>`)。清空按钮 / Enter / `__bench.search` 走 `searchNow`:先 `cancel()` 再同步执行。
4. **选择**:`Set<行id>` + `anchorId`;视图无关,过滤/排序天然保持;范围选择在**当前视图顺序**上计算(符合直觉)。
5. **键盘**:视口 `tabindex=0`;`ensureVisible` 依据 `viewH - HEADER_H` 计算滚动跟随;PageUp/Down 步长 = 可视行数 − 1。
6. **resize**:原始事件计 `resizeEvents`,rAF 节流处理计 `resizeHandled`(HUD 双计数自证);处理时重算池大小。`matchMedia(max-width:640px)` 触发紧凑模式:**7 列全部保留**(城市是搜索命中列,移动端必须可见),仅启用 compactWidth 收窄列宽(总宽 592px),390px 下靠横向滚动 + 冻结左二列保证可用。列宽拖拽:`pointerdown` 后挂 **window 级** move/up 监听(快速拖出表头不丢事件),`setPointerCapture` 包 try/catch(合成事件兼容),指示线 rAF 节流、释放提交。
7. **冻结列**:工号+姓名 `.pin`,横向滚动时 JS 对 pin 单元格 `translate3d(scrollLeft,0,0)`(绕开 transform 祖先里 sticky 的兼容性风险),`background:inherit` 承接斑马纹/hover/选中底色,`x-scrolled` 时右缘阴影。

## 调试钩子(`window.__bench`)

```js
__bench.ready            // 初始化完成即 true(双 rAF + setTimeout(0) 双保险,隐藏标签页也能置位)
__bench.getState()       // { domRowCount, totalRows, filteredRows, filterRuns, selectedCount }
__bench.scrollToRow(i)   // 视图第 i 行滚到顶(自动 clamp),内部同步渲染一帧
__bench.search('张伟')   // 同步过滤(绕过防抖,filterRuns 恰 +1),输入框 UI 与渲染同步
__bench.renderNow()      // 额外:强制同步渲染一帧(隐藏标签页 rAF 停摆时自动化脚本可用)
```

> `scrollToRow` / `search` 之后**无需等帧**即可读 `getState()`——两者内部都做了同步渲染,headless / 后台标签页(rAF 停摆)下自动化脚本依然可靠。

验收陷阱对照:逐字输入期间 `filterRuns` 不增、停 300ms 后 +1(输入走 debounce);拖滚动条到 50000 行 `getState().domRowCount` ≤ 80;排序后 Shift 范围选择再过滤,选中 id 集合不变。

## 已知限制

- **L4 加分项四选二**:已取「列固定(冻结工号/姓名)」与「导出 CSV」两项;「动态行高虚拟化」「Web Worker 排序」未取,理由见下两条。
- 行高固定 36px(未做动态行高虚拟化;L4 可选项未取)。
- 排序在主线程同步执行(数值键让 100k 行仅数十毫秒,满足「UI 不失响应」,未上 Web Worker)。
- 姓名排序按「姓/名池的拼音序下标」,与逐字 Intl.Collator 结果可能有极小差异(换取零运行时排序开销)。
- 列宽拖拽为「释放提交」式(指示线预览),非实时回流式——这是刻意的性能取舍。
- CSV 导出 100k 行约几 MB,同步构建,低端机可能有短暂停顿。

## 后续可做

- Web Worker 排序 + 可中断过滤(超大数据集);动态行高(测量 + 前缀和索引);列拖拽重排/显隐面板;行详情侧栏;滚动条 minimap;导出 xlsx。
