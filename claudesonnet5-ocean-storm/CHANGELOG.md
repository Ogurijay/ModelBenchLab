<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# CHANGELOG — claudesonnet5-ocean-storm

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3015 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3015，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 2026-07-01

- 初始实现：移动风暴单元系统（`StormSystem`）、双层 Gerstner 海洋（`Ocean`）、跟随相机的云层天空穹顶（`SkyDome`）、GPU 驱动实例化降雨（`RainField`）、程序化分形闪电（`LightningSystem`）、WebAudio 合成风/雨/雷环境音（`AmbientAudio`）、lil-gui 控制台与 HUD/罗盘（`ControlPanel` + `main.js`）。
- 修复：`SkyDome.js` 片元着色器中局部变量命名为 `patch`，与 GLSL 保留字冲突导致着色器编译失败（天空黑屏），改名为 `cellPatch`。
- 修复：`main.js` 引入 `three/examples/jsm/misc/Timer.js` 替换已弃用的 `THREE.Clock`，但该路径在 three@0.185 中不存在（`Timer` 已内置为核心导出）；改为直接使用 `THREE.Timer`。
- 修复：控制台自定义的"开启声音"按钮与 lil-gui 面板默认停靠位置（右上角）重叠，导致按钮不可点击；将按钮移至左上角。
- 接入根目录门户（`index.html` 新增卡片）与开发服务编排（`package.json` workspaces / dev 脚本，端口 3015），补全 `RULES.md` 端口分配表（含此前遗漏的 3014）。

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。
