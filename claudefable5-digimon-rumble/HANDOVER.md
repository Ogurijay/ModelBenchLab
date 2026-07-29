# claudefable5-digimon-rumble 交接文档

## 项目概述

用 three.js 复刻 PS2《数码宝贝大乱斗2》(Digimon Rumble Arena 2) 的 2.5D 平台格斗游戏。
侧视角 3D 渲染、平台跳跃、三局两胜、战斗中数码进化(成长期 → 究极体)。

- 访问:`http://localhost:3000/claudefable5-digimon-rumble/`(根 `npm run dev`)
- 技术:three 0.185 / 原生 ESM / 无打包依赖;UI 为 DOM+CSS(PS2 风格),音效 WebAudio 程序化合成(无音频文件)

## 资源来源

`public/models/*.glb` 共 20 个,来自 `E:/xhub/Resource/Digimon/美术资源/查看器/models/`
(Digimon Story Cyber Sleuth 提取转换,内嵌贴图与骨骼动画)。

动画命名(DSCS 规范,代码按短名引用,加载时去掉 `chrXXX_` 前缀):
`bn01` 战斗待机 / `br01` 跑 / `ba01,ba02` 攻击 / `bs01` 必杀 / `bd01` 轻受击 /
`bd02` 重受击(击飞用) / `bd03` 倒地 / `bg01` 防御 / `bv01` 胜利 / `fe01` 场景待机

## 阵容(config.js ROSTER)

9 名搭档(可进化)+ 2 隐藏究极体(奥米加兽 / 超恶魔兽,无进化、数值重):
亚古→战暴、加布→金加鲁、V仔→帝皇龙甲FM、基尔→红莲、巴达→炽天使、
迪路→圣龙、比丘→伽楼达、大耳→撒多格杜、妖狐→沙古牙。

## 模块结构(src/)

| 文件 | 职责 |
|---|---|
| `main.js` | 全局状态机 title/select/loading/battle/victory、渲染器、输入分发、主循环 |
| `config.js` | 阵容与平衡数值、连段表 COMBO、全局规则 RULES、P1 键位 |
| `assets.js` | GLTF 加载缓存、SkeletonUtils 克隆、按身高归一化(脚底对齐 y=0)、离屏头像渲染 |
| `fighter.js` | 角色状态机(idle/run/air/attack/special/guard/hitstun/launched/down/evolve/victory/ko)+ 平台物理 + 双形态切换 |
| `battle.js` | 回合流程(intro→fight→evolve→ko慢镜头→roundEnd)、近战/弹体命中解算、镜头、计时 |
| `ai.js` | CPU 状态机(approach/zone/retreat + 防御反应 + 台边保命) |
| `arena.js` | 悬浮遗迹舞台:主台 + 2 单向浮台(PLATFORMS 导出供物理)、程序化天空/云/远山/灯光 |
| `fx.js` | 粒子池:命中火花/防御盾/爆炸/进化光柱/KO爆发/尘土/弹体拖尾 |
| `ui.js` | DOM HUD(血条双层缓冲/能量/进化槽/回合星/计时)、播报、伤害飘字、选人网格 |
| `audio.js` | WebAudio 合成音效 + 琶音 BGM |

## 关键机制

- **进化槽**:命中 +7 / 受击 +5.5,满 100 后按 I 进化(演出 2.3s 全场定身);
  究极体持续 26s(受击 -1.2s),到时退化。进化替换模型实例(双实例常驻,切 visible)。
- **连段**:J×3 三段,第三段击飞;攻击动画 1.35× 加速;命中窗为动画归一化进度区间(config COMBO.win)。
- **场外**:掉下台扣 12% 最大血并从空中回场(2s 无敌),不是即死。
- **KO**:全局 timeScale 0.22 慢镜头 1.6s(演出计时用真实 dt)。
- **模型朝向**:`fighter._syncTransform` 假设模型原面向 +Z,rotation.y=±π/2 侧向。

## 调试接口

`window.__DIGIMON__` 暴露 `{ mode, fighters, battle }`,可直接读写(如 `fighters[0].evo = 100`
后按 I 立即进化、`battle.timeScale = 0.02` 慢镜头定格),Playwright 自动化测试即用此接口。

## 已验证(2026-07-17,Playwright 实测)

标题→选人(11 缩略图+3D 转台)→加载→intro"FIGHT!"→近战三连命中掉血→必杀弹体命中(盖亚之力 62 伤)
→数码进化演出(亚古兽→战斗暴龙兽,2.3s 定身,属性×1.55,26s 后自动退化)→防无限连挣脱
→RING OUT 罚血回场→KO 慢镜头→回合重置(血量/形态复位)→三局两胜→WINNER 环绕镜头。

## 踩坑记录(改代码前必读)

- **蒙皮包围盒**:部分模型(V仔兽等)顶点绑定数据挤在原点、靠骨骼展开,普通
  `Box3.setFromObject` 失真,必须用 `getVertexPosition`(蒙皮感知)逐顶点测,见 assets.js `skinnedBox`。
- **模型朝向为 +Z**(选人正对镜头);战斗中 `rotation.y = facing * π/2`。
- **材质**:DSCS 导出 metalness 偏高(无 envMap 渲黑)、部分带 BLEND 透明标志(整体幽灵化),
  加载时统一压 metalness ≤0.25、强制不透明 + alphaTest。
- **共享 dev server**:vite 对任何 html 变更全局广播 full-reload,并行会话工作时页面会随机重载。

## 已知问题 / 后续计划

- 双人本地对战未做(输入层已按控制器抽象,加 KEYMAP_P2 即可)。
- 帧率保护:dt 上限 1/20s;低端机粒子量可能需要下调。
- 舞台仅 1 张;可按 RA2 增加多舞台选择。
- BGM/音效为 WebAudio 合成,仅逻辑验证,音色未经人耳调校。
