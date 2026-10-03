# 门户分类整理与项目移除记录

日期：2026-10-03。按用户要求先移除 Dev World，再移除数据网格，并将门户统一为“主题大类 → 项目系列 → 模型实现”。

## 分类清单

活动项目由整理开始时的 55 个，经移除 Dev World 后的 54 个，调整为 53 个。当前分为 6 个主题、19 个系列；20 个 mission 各归属一个系列，brawler/digimon 合组展示。数据网格移除后，“界面工程”主题为空，已一并清理。

| 主题 | 同层级项目系列 | 模型实现数量 |
| --- | --- | ---: |
| 自然与特效 | 海洋模拟、火焰与体积特效 | 19 |
| 城市与空间场景 | 曼哈顿城市复现、奇幻王都、世界杯球场、美术馆布光、中国历史沙盘 | 7 |
| 物理模拟 | 粒子物理沙盒、布料与旗帜、多米诺机关、保龄球 | 9 |
| 赛车与竞速 | 卡丁车赛道、头文字 D 剧情漂移赛车、迷你四驱车 | 6 |
| 动作与解谜 | 数码宝贝竞技格斗、坦克大战、传送门解谜 | 7 |
| 生活与经营 | 像素生活模拟、像素商业大亨 | 5 |

分类由 `benchmark/registry.json` 的 `portalSections[].groups[]` 维护。主题使用二级标题，系列使用三级标题，各模型实现用卡片并列展示；新增主题导航及数量标记。

这是展示层的整理。其余项目的目录、端口、别名、能力类别和 task_id/task_version 均保留。brawler/digimon 的正式任务身份仍独立，未恢复原始输入前不直接横向排名。kart/initiald/mini4wd 作为不同系列列于竞速主题下。实体目录继续按模型实现平铺。

## 移除范围

- 活动项目目录：`grok4.7-dev-world/`。
- registry 项目与 devworld mission；任务索引中的 devworld 映射。
- 草案题面 `benchmark/tasks/code-to-3d/devworld.md` 与单元 `benchmark/tasks/public/code3d-devworld-001.v1.json`。
- 根 npm workspace、lockfile 中该项目及其独有嵌套 Three.js、workspace 链接。
- 调试端口 3052 加入 retiredPorts，不复用。

追加移除数据网格：活动目录 `claudefable5-datagrid-virtual/`、datagrid 项目/mission/任务索引、题面 `benchmark/tasks/code-to-ui/datagrid.md`、单元 `benchmark/tasks/public/codeui-datagrid-001.v1.json`，以及对应 workspace 和 lockfile 条目。端口 3031 加入 retiredPorts；清理类别文档的失效任务链接。通用 UI 能力规则和 rubric 保留，生活/经营任务继续使用独立游戏 rubric。

移除前的原文件和本轮编辑文件快照保存在忽略目录 `tmp/removed-devworld-2026-10-03-portal/`，供本机恢复。Dev World 独立开发进程树占用目录，已在核实归属后停止；根服务与其他项目进程保留。2026-10-01 的历史审计报告保留当时记录。

数据网格原文件和追加移除前的清单快照保存在 `tmp/removed-datagrid-2026-10-03/`，不提交。

本轮开始前已存在的 ProtoMotion 删除、五个海洋/头文字 D 项目新增及其配套登记继续保留，不归为本轮新增或删除。

## 规则与验证

RULES.md 和任务索引说明同步展示分类约定。结构校验增加：主题/系列 ID 唯一、mission 完整且唯一归类、未知 mission 报错、空分组报错、删除 workspace 的锁文件残留报错。

- `npm install --offline --ignore-scripts`：完成；其余已解析依赖版本保持一致。
- `npm run policy:test`：8 项通过，含分组重复/遗漏/未知引用以及 workspace 锁文件残留回归检查。
- `npm run sync:check`：53 项目完整结构通过。
- `npm run benchmark:check`：运行记录结构通过，当前 0 条正式运行记录。
- Chrome 门户验证：1365×900、390×844；53 张唯一卡片、6 个主题、19 个系列、6 个导航入口；数码宝贝两实现同组，竞速主题共 6 实现；分类跳转正常，无脚本异常或横向溢出。
- Dev World 与数据网格原地址：HTTP 404。
- 两次移除均与各自移除前的快照对比：其余项目记录、任务映射与依赖条目保持一致。

剩余 20 个任务仍为 draft，分类与结构检查不代表项目功能验收或正式评测完成。本轮没有重新验证各项目的场景或玩法运行。
