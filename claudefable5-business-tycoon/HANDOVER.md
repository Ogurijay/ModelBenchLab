# HANDOVER — claudefable5-business-tycoon

## 当前状态（2026-07-17）

功能完整、可通关、自测 16/16 通过。已按单端口规范登记 registry（port 3040 仅供 `dev:one`）、加入 workspaces、`npm run sync:check` 通过。

- 121 种业态 / 15 项结算机制 / 6 城区 / 28 科技 / 28 事件 / 3 对手 AI / 17 步目标链，详见 README。
- 验证记录：任务书 5 步复核路径全部走通（买地开店→3 日结算→五策略调整→贷款扩张→刷新恢复）；街景昼夜/四季/建筑成长截图确认。

## 技术方案要点

- **确定性**：逻辑随机全部走 `state.rngS`（xorshift32，可序列化）。同种子同操作序列 → 结果逐位一致；这是自测 #11（克隆推进 30 天一致）的基础。装饰动画用 `Math.random`，与逻辑隔离。
- **结算单点**：`sim.js/calcBiz()` 是唯一收入公式，15 项机制都以乘数/加项汇入；改平衡只动 `data.js` 数值或 `calcBiz` 因子。
- **持续效果系统**：事件/营销/抉择统一挂 `state.fx[{k,…,m,until}]`，`fxMul(state,k,key)` 查询，`dayTick` 过期清理。新事件只需在 `data.js/EVENTS` 声明。
- **对手门店双写**：`rivals[i].biz[]` 与 `plots[d][i].rb` 指向同一对象；存档 JSON 后引用断裂，`game.js/load()` 里按 (dist,plot) 重新连接——改动存档结构时别丢这段。
- **UI 事件委托**：面板全部走 `#tabContent` 上的 `data-act` 委托（`ui.js/_dispatch`），新增按钮只需写 `data-act` + case。
- **面板节流**：内容区 900ms 节流重绘，输入框聚焦/拖动滑杆时跳过，避免打断输入。

## 环境注意（重要）

- **单端口共享 origin**：全仓库 41 个项目共用 `localhost:3000` 的 localStorage。其他项目若 `localStorage.clear()` 会误删本作存档（key `cf5-biztycoon-v1`）；开发期无解，属已知共存风险。
- **vite 全站热重载**：任何项目文件变动都会刷新所有打开的页面。本作已加 `beforeunload` 落盘，进度不丢。
- **隐藏页 rAF 挂起**：无头/后台环境 rAF 不触发，主循环由 250ms interval 兜底（隐藏时浏览器钳到 1s）；后台现金转负自动暂停。评测复核请用 `__TYCOON__.ff(n)` 同步快进，别依赖真实时钟。
- **截图**：内嵌浏览器截图在本机超时，改用 `canvas.toDataURL` 导出验证过视觉效果。

## 已知问题 / 后续计划

- 招牌仅显示店名前 2 字（40px 宽地块所限）；完整名靠悬停提示。
- 对手 AI 不会主动收购玩家门店（事件 `收购要约` 未做，列为后续）。
- 移动端为响应式降级（面板下移、画布随宽缩放），未做触控专项优化（长按提示等）。
- 平衡性只做了粗调：t1 业态回本 50~90 天、360 天脚本局可达 Lv3+；未做全业态回本曲线扫描。
- 音效未做（可仿 life-gba 用 WebAudio 芯片音，工作量 ~半天）。

## 快速上手

```bash
npm run dev                      # 根目录，单端口 :3000
# http://localhost:3000/claudefable5-business-tycoon/
# http://localhost:3000/claudefable5-business-tycoon/?selftest=1   # 16 项自测
npm run dev:one claudefable5-business-tycoon   # 独立 :3040 调试
```

Console 调试：`__TYCOON__.ff(360)` 快进一年；`.setVt(60)` 正午；`.setDist('cbd')` 切城区。
