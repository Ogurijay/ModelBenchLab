# 星轨人事 · 十万行虚拟数据网格(claudefable5-datagrid-virtual)

用**原生 JavaScript(零框架、零运行时依赖)**实现的 100,000 行员工数据网格,ModelBenchLab `code-to-ui/datagrid` 评测题作答(模型:Claude Fable 5,variant:virtual,端口 3028)。

## 特性

- **虚拟滚动**:行节点池复用,任意时刻 DOM 数据行 ≤ 80 个;spacer 撑出真实滚动条比例;scroll 监听 `{passive:true}` + rAF 合帧渲染
- **确定性数据**:mulberry32(seed=42) 生成 10 万行 × 7 列(工号/姓名/部门/城市/薪资/入职日期/状态),刷新后完全一致
- **实时搜索**:防抖 300ms,跨姓名/部门/城市,命中 `<mark>` 高亮,过滤耗时与执行次数计入 HUD
- **排序**:表头三态循环(升→降→无),Shift+点击追加多列排序,数值化排序键让 100k 行排序仅数十毫秒,耗时展示
- **列宽拖拽**:表头右缘拖动出指示线,松开提交,双击复位;表头吸顶;左二列冻结(横向滚动时钉住)
- **键盘导航**:↑↓ / PageUp / PageDown / Home / End,活动行自动滚动跟随;Space/Enter 切换选中;Ctrl+A 全选
- **选择**:单击单选、Shift 范围、Ctrl 增删、Ctrl+Shift 追加范围;选中集合按行 id 存储,排序/过滤后不错乱
- **性能 HUD**(右下角常驻):FPS、DOM 行节点数、总行数/过滤后行数、最近过滤/排序耗时、过滤执行次数、resize 处理/事件计数
- **暗色主题** + 斑马纹 + hover/选中/活动行分层高亮,空态插画,1080p 与 390px 移动端均可用(窄屏 7 列全保留:紧凑列宽 + 冻结左二列 + 横向滚动,搜索命中列始终可见)
- **导出 CSV**:导出当前过滤+排序后的全部数据(UTF-8 BOM,Excel 直开)

## 启动

依赖由仓库根统一安装(仅 devDependency `vite ^8.1.2`):

```bash
npm run dev        # 本目录内,默认端口 3028(strictPort,与根 registry 登记一致)
npm run build      # 产物构建
npm run preview    # 预览构建产物
```

## 操作说明

| 操作 | 效果 |
|---|---|
| 输入搜索框 | 停止输入 300ms 后过滤(姓名/部门/城市),命中高亮 |
| 点击表头 | 升序 → 降序 → 取消;Shift+点击 = 追加次级排序键 |
| 拖动表头右缘 | 列宽调整指示线,释放生效;双击复位 |
| 单击 / Shift+单击 / Ctrl+单击 | 单选 / 范围多选 / 增删选 |
| ↑↓ PageUp PageDown Home End | 移动活动行并自动滚动跟随(Shift 扩展范围) |
| Space / Enter | 切换活动行选中;Ctrl+A 全选;Esc 清除选择 |
| `/` | 聚焦搜索框 |

## 调试钩子

```js
window.__bench.ready          // 初始化完成后为 true(后台标签页同样可用)
window.__bench.getState()     // { domRowCount, totalRows, filteredRows, filterRuns, selectedCount }
window.__bench.scrollToRow(i) // 视图第 i 行滚到可视区顶部(内部同步渲染,可立即读状态)
window.__bench.search(text)   // 同步执行搜索(绕过防抖,filterRuns +1)
window.__bench.renderNow()    // 强制同步渲染一帧(自动化脚本辅助)
```
