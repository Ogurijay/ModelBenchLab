# 暴风城还原（Stormwind Replica）

按《魔兽世界》暴风城的地标与相对方位还原的程序化奇幻王都：英雄谷大桥与八尊英雄像、运河分隔的岛状街区、光明大教堂、高台上的暴风要塞、法师区紫塔、矮人区熔炉与矿道地铁口、北墙外的暴风港。**216 栋民居和 4 处地标都是真空心，每一扇门都能推开走进去、走楼梯上楼。**（Claude Opus 5.5 实现）

- 统一入口：<http://localhost:3000/claudeopus5.5-stormwind-replica/>（仓库根目录 `npm run dev`）
- 单独调试：根目录 `npm run dev:one -- claudeopus5.5-stormwind-replica`（登记端口 3067）
- 技术：Three.js 0.185 / WebGL，Vite；零外部二进制资产，几何与贴图全部程序化生成（Canvas 现画）。
- 任务：mission `stormwind` · variant `replica` · `code3d-stormwind-001` v1（draft）。题面见 `benchmark/tasks/code-to-3d/stormwind.md`。

## 操作

| 按键 | 作用 |
| --- | --- |
| 鼠标点击 | 进入第一人称（锁定鼠标） |
| WASD / 鼠标 | 移动 / 视角 |
| 空格 / Shift | 跳跃 / 奔跑 |
| F | 飞行（空格上升、C 下降） |
| V | 第一人称 ↔ 俯瞰全景 |
| T | 自动巡游（沿各大地标的环城航线） |
| R | 昼夜流转开关 |
| H | 隐藏操作说明 |

URL 参数：`?debug`（展开美术总监参数面板）、`?hour=21.5`（指定时刻）、`?mode=overview`（俯瞰启动）、`?noao`（关闭 GTAO）、`?only=terrain,walls`（只装配指定模块，调试用）、`?blockout`（灰盒版）。

## 城市

| 区域 | 方位 | 内容 |
| --- | --- | --- |
| 英雄谷 | 东南入口 | 城门楼、谷底草地盆地、16 m 宽连拱主桥、8 尊英雄像 |
| 贸易区 | 中心 | 市集广场（喷泉 + 12 个摊位）、银行、拍卖行、金狮旅店 |
| 法师区 | 西南 | 巫师圣所（紫色尖塔，底层可进入）、屠宰之羊酒馆 |
| 旧城区 | 东 | 猪与哨子酒馆、军情七处、勇士大厅 |
| 大教堂广场 | 北 | 光明大教堂（中殿可进入）、市政厅、孤儿院 |
| 矮人区 | 东北 | 大熔炉、矿道地铁入口、工坊 |
| 暴风要塞 | 最东北，12 m 高台 | 40 级大台阶、内外院、王座厅（可进入） |
| 雄狮安息地 | 西北 | 公园与纪念碑 |
| 暴风港 | 北墙外 | 码头、栈桥、帆船、仓库、吊车 |

## 工程结构

```
src/
  main.js            装配流水线 + 主循环 + 后处理（GTAO）+ __bench 调试钩子
  core/              materials（Canvas 程序化贴图）· geom（米制 UV 几何）· builder（按材质×分区合批，盒体与碰撞同源）· collision（OBB 空间哈希）
  player/controls.js 第一人称（重力 / 跳跃 / 自动抬腿 / 落水兜底）· 俯瞰 · 自动巡游
  ui/hud.js          区域名 / 时刻 / 模式 + 运行时统计
  debug/             截图钩子与美术总监面板（来自 3d-scene-builder skill）
  world/coords.js    唯一坐标数据源（布局、地块、桥、路灯、地形高度）
  world/terrain/     街区岛、驳岸、运河与海、城外地形、桥、码头
  world/walls/       外城墙、角楼、登城阶梯、港口隧道、城门、英雄谷与雕像
  world/houses/      216 栋真空心民居生成器（洞口墙、楼梯、楼板开井、家具、招牌）
  world/landmarks/   大教堂、要塞、圣所、喷泉、熔炉、地铁口、纪念碑
  world/atmosphere/  天空、昼夜、阴影、光源池、路灯、树木、市集、船、烟雾
tools/               floorplan.mjs（从 coords 生成平面图）· probe.mjs（页面内表达式验证）
plan/ refs/ docs/    平面图、参考简报、过程文档
```

详细技术方案与已知问题见 [HANDOVER.md](HANDOVER.md)，改动记录见 [CHANGELOG.md](CHANGELOG.md)。
