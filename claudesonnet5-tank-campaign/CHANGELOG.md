<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# CHANGELOG — claudesonnet5-tank-campaign

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3017 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3017，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 2026-07-01

- 初始实现：完整的 3D 坦克大战重制版，前 10 关全部实现。
  - 核心：26×26 子格网格系统（`Grid.js`）、四向移动与整数轴对齐（`Tank.js`）、子弹子步进碰撞（`GameEngine._advanceBullet`）。
  - 关卡：10 关地形数据（`levelData.js`，矩形特征 + 对称辅助函数），难度曲线覆盖砖墙/钢墙/河流/树林/冰面全部经典地形，敌军数量 10→20，第 10 关末尾为血量 10 的 Boss。
  - 实体：`PlayerTank`（4 级火力）、`EnemyTank`（4 种类型 + Boss，简单目标追踪 AI，连续受阻强制换向防卡死）。
  - 道具：炸弹/头盔/铁锹/闹钟/坦克/五角星/手枪 7 种经典道具全部实现。
  - 渲染：正交摄像机自适应取景（`CameraRig.js`）、InstancedMesh 地形、Canvas2D 程序化贴图（`TextureFactory.js`）、WebAudio 程序化音效（`AudioKit.js`）。
  - UI：经典机台式侧边栏 HUD + 开始/关卡提示/暂停/失败/通关 5 个覆盖层。
- 修复（测试中发现的唯一严重 bug）：子弹命中砖墙时只摧毁精确落点所在的单个子格，而坦克宽度等于 2 个子格、其中轴线正好落在子格边界上，导致笔直射击永远只能打穿通道一侧、另一侧永远打不到，部分关卡会因此实质卡死。改为 `Grid.hitLane()`：命中时摧毁与坦克宽度对齐、跨越行进轴垂直方向的一整对子格。同时把敌方坦克（装甲/Boss）的碰撞半宽统一收回到与普通坦克一致（视觉模型仍按 `scale` 放大），避免大体积敌人卡在标准 2 格宽通道里。
- 修复：`renderer.shadowMap.type` 使用了 three@0.185 中已弃用的 `PCFSoftShadowMap`（会在控制台打印弃用警告并自动回退），改为直接使用 `PCFShadowMap`。
- 验证：由于自动化预览环境的浏览器标签页 `document.hidden` 恒为 `true`，导致 rAF 被浏览器挂起、`preview_screenshot` 持续超时，为此增加了仅 `?debug=1` 时挂载的 `window.__tank` 调试接口（手动逐帧驱动、跳关、精确构造战斗场景、读取内部状态），用它跑通了：10 关地图全部无异常加载、关卡 1→10 顺序通关直至通关画面、玩家/敌方子弹的真实碰撞（含记分与装甲坦克 4 段血量）、钢墙抗普通火力但被满级火力摧毁、7 种道具效果、基地被摧毁与生命耗尽两种失败结算、暂停/恢复。另通过 WebGL 画布像素采样间接确认渲染画面配色符合预期。
- 接入根目录门户（`index.html` 新增"Game"分区卡片）与开发服务编排（`package.json` workspaces / dev 脚本，端口 3017）、`RULES.md` 端口分配表、`.claude/launch.json` 预览配置。

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。
- 目录由 `claudesonnet5-tank3D` 调整为 `claudesonnet5-tank-campaign`；根服务保留旧地址跳转。
