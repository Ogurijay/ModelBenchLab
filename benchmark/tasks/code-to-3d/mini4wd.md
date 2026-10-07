# Mission: mini4wd — 迷你四驱车模拟器

## 草案状态

本文件于 2026-10-01 补建为历史项目索引，不是当时原始提示词。原始 prompt、统一参数、评分细则与验收脚本尚待恢复并冻结；当前项目不得据此进入公平主榜。

## 现有实现

- `gpt6-mini4wd-room-racing`：疾风俱乐部 - 迷你四驱车模拟器
- `claudeopus5.5-mini4wd-replica`：四驱兄弟 · 原型复刻赛（2026-10-03 按用户要求以本系列为参照新建，重点为车型贴近《四驱兄弟》田宫原型）
- `gpt6astra-mini4wd-aerial-racing`：ASTRA · 四驱实验室（2026-10-07 独立变体；经典八车参考、长立体赛道、双 360° 环与近距离随车镜头。此项是实现索引补充，没有改变或冻结 draft 测试单元。）

## 正式评测前待补

- 逐字原始 prompt 与版本。
- 任务核心要求、难度、同 variant 的可比范围。
- 固定 seed 集、确切浏览器/设备/库版本、观察脚本。
- 专项 rubric、匿名评判流程与至少三次运行记录。

## 测试单元与项目索引

测试单元：`benchmark/tasks/public/code3d-mini4wd-001.v1.json`（draft，待核对输入与冻结参数）。参与项目、调试端口与变体以 `benchmark/registry.json` 为准，不在本题面重复维护清单。
