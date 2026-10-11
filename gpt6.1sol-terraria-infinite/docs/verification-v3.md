# v3 验证记录 · HUD / 迷雾 / 制作专业

日期：2026-10-11。与历史 v1/v2 验证分开记录；本轮未使用 Computer Use，也没有浏览器 UI 交互或截图验收。

## 当前实现

- 头像改为近景圆形肖像，独立等级徽记；生命/法力、饱食与经验分别显示。
- 时间盘以独立世界时钟驱动，指示晨光/白昼/黄昏/夜幕及下次日出/日落。打开面板时提示时间暂停。
- 四个技能槽提供 24 张职业技能图标、冷却遮罩/秒数、低法力状态、等级锁和悬浮/键盘焦点提示。更新状态不重建按钮节点。
- 迷雾与区块生成完全分离，使用角色视线记录逐格地形；障碍遮挡，昼夜/地表地下视距不同。已探索但不在当前视野的区域变暗。勘探目镜增加探索距离。
- 八专业：锻造、制皮、裁缝、工程、炼金、木工、烹饪、附魔。基础与进阶分支、独立熟练度、配方门槛、跨专业材料实际接入。
- 共 161 物品、129 配方、11 制作站。新增鞣皮架、工程台。旧配方不新增熟练度限制。

## 自动化结果

`npm test -w gpt6.1sol-terraria-infinite`：45/45 通过。

`npm run build -w gpt6.1sol-terraria-infinite`：通过。仓库检查 `npm run policy:test`（8/8）、`npm run sync:check` 与 `npm run benchmark:check` 均通过；正式评测记录仍为 0，不构成正式评测验收。

新增覆盖：

1. 生成远处区块不会开图。
2. 实体阻挡地下矿石视野，挖开通路才会被记录。
3. 负坐标区块与历史探索存读档保留。
4. v2 升级不从 visited 推断探索，损坏迷雾压缩数据在分配前拒绝。
5. 所有八种专业都有入门配方，配方和阶级数据完整。
6. 熟练度或设施不足时不扣料、不加熟练度。
7. 实际制作达到 40 熟练度后升级，经验上限 300。
8. 皮甲远程、布甲法力、附魔技能加成和工程视距实际生效。
9. 专业、装备和新设施在 v3 保存后恢复。
10. 炸弹消耗一次并受冷却约束，保护高级矿石和箱内物品。
11. 抓钩需要实体锚点且不穿墙。
12. 时间盘在午夜、黎明和黄昏的换算。

原有回归包括全部配方材料/制作站依赖可达性；旧存档、战斗、建造、住房、平台和多格设施。

## 离屏渲染

使用 bundled `@napi-rs/canvas` 执行项目实际 `Renderer` / `assets.js`，没有浏览器自动化。命令：

```powershell
$env:CODEX_NODE_MODULES='C:/Users/OguriJay/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node gpt6.1sol-terraria-infinite/scripts/render-smoke.mjs
```

结果：初始探索 470 格，移动后 813 格，存档恢复后仍为 813 格；24 技能图标和 161 物品图集可绘制。人工查看离屏迷雾图、技能图集与头像；修复了记忆区域半透明瓦片重叠的网格接缝。

证据（相对仓库根目录）：

- `tmp/azeroth-sol-qa/v3/render-check.json`
- `tmp/azeroth-sol-qa/v3/fog-start.png`
- `tmp/azeroth-sol-qa/v3/fog-explored.png`
- `tmp/azeroth-sol-qa/v3/fog-reloaded.png`
- `tmp/azeroth-sol-qa/v3/portrait.png`
- `tmp/azeroth-sol-qa/v3/skills.png`
- `tmp/azeroth-sol-qa/v3/world.png`
- `shared/assets/azeroth-sol/item-atlas-v3.png`

本检查验证绘制函数和数据连接，不证明浏览器内 CSS 排版、实际点击或不同屏幕的交互。HUD 响应布局已编码，但尚待浏览器实测。没有正式帧率或 benchmark 结论。
