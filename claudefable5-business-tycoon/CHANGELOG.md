# CHANGELOG — claudefable5-business-tycoon

## 2026-07-17 v1.0.0 首版

- 新建项目：像素风商业模拟养成游戏「像素大亨」，对标任务书 `benchmark/tasks/code-to-ui/business-tycoon.md`。
- 内容规模：12 行业 121 种业态、15 项结算机制、6 城区×10 地块、4 分支 28 项科技、28 种城市事件（含 5 抉择）、5 档营销、8 支股票、3 家对手 AI、17 步目标链、13 项成就。
- 引擎：`sim.js` 纯逻辑日结算（xorshift32 确定性随机，可序列化），`calcBiz()` 单点汇集全部机制乘数。
- 视觉：`render.js` 程序化像素街景（440×280 整数放大）——建筑随等级长高、12 行业配色与 8×8 位图图标、昼夜 120s 循环、四季变装、雨雪、行人车流联动客流、月度盈亏飘字。
- UI：7 面板（经营/图鉴/科技/金融/营销/账本/目标）+ 抉择/帮助/破产/通关弹窗 + toast；≤1020px 响应式。
- 存档：localStorage（动作即存 + 月度自动 + `beforeunload` 落盘）；新局确认弹窗。
- 自测：`?selftest=1` 16 项确定性自测（数据完整性/弹性单调/供应链降本/科技增益/数字化佣金/贷款利息/存读一致/360 天长跑无 NaN/对手分流与收购/抉择落地/破产判定/品质声望联动），全部通过。
- 修复（开发过程中）：
  - render 颜色工具 `mix/shade` 现兼容 `rgb()` 输出嵌套，杜绝 NaN 色值。
  - 隐藏页 rAF 挂起 → 加 250ms interval 兜底模拟；后台现金转负自动暂停。
  - 并行项目触发的 vite 全站重载 → `beforeunload` 即时存档防进度丢失。
- 登记：registry.json 新增条目（mission `business`，port 3040 仅 dev:one 用）、根 package.json workspaces 同步、`npm run sync:check` 通过。
