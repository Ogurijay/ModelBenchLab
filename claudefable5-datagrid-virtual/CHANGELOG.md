# CHANGELOG — claudefable5-datagrid-virtual

## 2026-07-10 静态审查修复

- **端口纠正**:`vite.config.js` 端口 3027 → **3028**(根 RULES.md registry:3027=bowling-physics,3028=本项目),并加 `strictPort:true`——在项目目录直接 `npm run dev` 也与登记端口一致,不再依赖根 launch 的 CLI 参数兜底,亦不会挤占兄弟项目端口
- **移动端保留全部 7 列**:移除 `minor` 列隐藏机制(原 ≤640px 隐藏城市/入职日期/状态)。紧凑模式现仅收窄列宽(compactWidth,总宽 592px),390px 下靠横向滚动 + 冻结工号/姓名列保证可用;搜索字段「城市」的命中高亮在移动端始终可见,任务①的 7 列在所有断点完整展示。相应清理 `colVisible`/`visibleColumns` 死代码与 `.cell[hidden]`/`.hcell[hidden]` 死样式
- 验证:改动文件 `node --check` 通过;`vite build` 通过(gzip 后 JS ≈ 8.75KB);`vite preview` 实际监听 3028
- 文档同步:README / HANDOVER 端口与移动端策略描述更新(下方初版记录中的“隐藏次要列 / 总宽 332px / 端口 3027”表述已被本条目取代)

## 2026-07-10 初版实现

- mulberry32(seed=42) 确定性生成 100,000 行 × 7 列员工数据;姓名/枚举池按拼音序排列,预构建全列数值型排序键(typed array)
- 虚拟滚动:spacer 撑滚动条 + 绝对定位行 translateY + 行节点池复用(池上限 80,行级 `_vi/_epoch` 脏检查),scroll `{passive:true}` + rAF 合帧
- 搜索:闭包 debounce(300ms),跨姓名/部门/城市(`` 分隔防跨字段误命中),`<mark>` 高亮,filterRuns / 耗时计量
- 排序:表头三态循环 + Shift 多列追加(序号徽章),Uint32Array 索引排序 + id 兜底稳定,performance.now 计耗时
- 列宽拖拽:pointer capture + rAF 节流指示线,释放提交,双击复位;表头 sticky 吸顶;左二列 JS translateX 冻结
- 选择:Set<行id> + anchor,单击/Shift 范围/Ctrl 增删/Ctrl+Shift 追加范围/Ctrl+A 全选,排序过滤后按 id 保持
- 键盘导航:↑↓/PageUp/PageDown/Home/End + Shift 扩展,活动行滚动跟随;Space/Enter 切换选中;`/` 聚焦搜索
- 性能 HUD:rAF FPS + DOM 行节点 + 总/过滤行数 + 过滤/排序耗时 + 过滤执行次数 + resize 处理/事件双计数(自证节流)
- window resize:rAF 合帧重算可视行数与节点池;640px 断点隐藏次要列(城市/入职日期/状态)并收窄列宽
- 视觉:暗色主题 CSS 变量体系、斑马纹/hover/选中/活动行分层、状态徽章、空态内联 SVG 插画、自绘滚动条、玻璃拟态 HUD
- L4 加分:冻结左列(工号+姓名)、导出 CSV(UTF-8 BOM、当前过滤+排序视图)
- 工程:`window.__bench = { ready, getState, scrollToRow, search, renderNow }` 调试钩子(scrollToRow/search 内部同步渲染,headless/后台标签页自动化无需等帧);零运行时依赖(仅 vite devDependency);README / HANDOVER / CHANGELOG 齐备
- 浏览器实测通过:滚动到第 50000 行 DOM 行节点 41(≤80)、scrollHeight 3,600,040 比例正确;突发输入 filterRuns 0、停顿后恰 +1;三态与多列排序(100k 行 54ms);Shift 范围选择过滤后 id 集合不变;键盘导航/Ctrl+A/Esc;列宽拖拽指示线与双击复位;冻结列横向滚动钉住;390px 紧凑模式(隐藏次要列,总宽 332px);`vite build` 通过(gzip 后 JS ≈ 8.8KB)
