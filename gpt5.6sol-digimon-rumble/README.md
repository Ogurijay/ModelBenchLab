<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
本项目已显式使用 PCFShadowMap；效果与 r186 原先的自动回退结果一致。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.6sol-digimon-rumble/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.6sol-digimon-rumble`，访问 http://localhost:3039/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# DIGI-RUMBLE / 数码兽大乱斗

使用 Three.js 制作的本地同屏 2.5D 平台格斗游戏。当前内容包括 8 条三段进化谱系、2 名单形态 Boss、5 个危险场地、4 种规则、1–4 人/CPU 对战与六战数码杯。

这是受 PS2《Digimon Rumble Arena 2》核心玩法启发的**完整可玩精选复刻**：具备从标题、选人到战斗、结算和解锁的产品闭环，但不是官方项目，也不是原作全部角色、场地和模式的 1:1 移植。

## 当前内容

- 生命制、限时制、进化竞速与训练四种规则；
- 战斗严格锁定在 X/Y 平面，只有普通攻击和远程攻击两种攻击方式；
- 争夺能量并自然进化，也可在设置中启用自由进化作弊按钮；
- 三段真实模型进化，最终形态满槽释放 Ultra（究极技）；
- 网络终端、熔岩核心、齿轮工厂、遗迹丛林与黑暗区域五个场地；
- Rookie（新手）、Normal（标准）、Veteran（老练）三档 CPU；
- 双键盘布局及最多四个标准手柄；
- 杯赛逐轮解锁场地、DATA、两名 Boss 与冠军徽章；
- 浏览器版本化存档、设置、资料库、暂停和结算流程。

## 运行要求

- Node.js 20.19+，或 Node.js 22.12+；
- 支持 WebGL 2、ES Modules（JavaScript 模块）与 Gamepad API（手柄接口）的现代浏览器；
- 首次安装依赖时需要 npm 网络访问。

## 启动

### 方式一：在本项目中独立启动

```powershell
cd D:\Administartor\Study\WorkStation\ModelBenchLab\gpt5.6sol-digimon-rumble
npm install
npm run dev
```

打开终端中 Vite 输出的本地地址，默认通常为 `http://localhost:3039/`；端口被占用时以实际输出为准。

### 方式二：从 ModelBenchLab 工作区启动

```powershell
cd D:\Administartor\Study\WorkStation\ModelBenchLab
npm install
npm run dev:one -- gpt5.6sol-digimon-rumble
```

单项目登记端口为 `3039`，该命令把子项目本身作为 Vite 根目录，访问：

`http://localhost:3039/`

若已运行工作区总入口 `npm run dev`，则通常从：

`http://localhost:3000/gpt5.6sol-digimon-rumble/`

进入。

## 验证与构建

```powershell
npm test
npm run build
npm run preview
```

`npm test` 验证战斗、输入、流程、存档和本局配置；`npm run build` 生成生产构建；`npm run preview` 仅用于本地检查该构建。

## 操作

### 键盘

| 动作 | P1 | P2 |
| --- | --- | --- |
| 左右移动 | `A` / `D` | `←` / `→` |
| 普攻 | `J` | `N` / 小键盘 `1` |
| 远程攻击 | `K` | `M` / 小键盘 `2` |
| 跳跃 | `W` / `Space` | `↑` / `Enter` / 小键盘 `0` |
| 进化 / Ultra | `E` | `/` / 小键盘 `Enter` |
| 暂停 | `Esc` | `Backspace` |

### 标准手柄

| 动作 | Xbox 风格 | PlayStation 风格 |
| --- | --- | --- |
| 左右移动 | 左摇杆 / 十字键 | 左摇杆 / 方向键 |
| 跳跃 | A | × |
| 普攻 | X | □ |
| 远程攻击 | Y | △ |
| 进化 / Ultra | RT | R2 |
| 暂停 | Start | Options |

手柄按浏览器报告顺序映射到参战槽位，最多读取四个。开始比赛前请确认设备顺序；当前版本不会持久化断线后的槽位绑定。

## 怎么玩

1. 从标题进入主菜单，选择数码杯、自由乱斗或训练。
2. 选择角色与参战者；自由乱斗再选择场地和规则。
3. 所有人物、投射物、道具和机关判定都锁定在同一个 2.5D 战斗平面；左右走位、跳跃，再用普通攻击或远程攻击压制对手。
4. 命中会让对手掉落能量；拾满 100 点可自然进化，最终形态或单形态 Boss 满槽时释放 Ultra。
5. 设置页默认开启“自由进化作弊”；战斗右下角可点击“退化 / 进化”，立即切换主玩家真实形态且不消耗能量。
6. HP 归零或越界都会 KO；生命制看剩余生命，限时制看击倒排名，竞速制看谁先达到进化目标。

新存档默认开放八条常规谱系和网络终端。完成数码杯六轮可依次解锁其余场地、DATA、Diaboromon、Apocalymon 与冠军徽章。进度保存在当前浏览器的 `localStorage`；清理站点数据会删除存档。

## 文档

- [完整产品与规则设计](docs/GAME_DESIGN.md)
- [26 个 GLB 的来源、SHA256 与发布边界](docs/ASSET_PROVENANCE.md)
- [开发交接、模块/API 与风险](HANDOVER.md)
- [版本变更记录](CHANGELOG.md)

## 3D 资源与授权

当前 `public/models` 包含 26 个从本机资源库整理的 Digimon 角色 GLB，用于本地学习和功能验证。源/目标文件映射和哈希见 [ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md)；核对结果没有发现任何允许公开再分发或商业使用这些美术资产的许可证。本地持有文件不等于拥有再分发权。

公开仓库、在线部署或商业使用前，必须确认每个模型、贴图和动画的来源、作者、许可证、署名要求及可再分发性；无法证明授权的资源请替换为原创或明确许可素材。Digimon 名称、角色和原作设定归各自权利人，本项目不代表官方合作或授权。
