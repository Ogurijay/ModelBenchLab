<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# 改动记录

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3033 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3033，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 2026-07-16

- 浏览器实测与视觉调优:火焰完整度(顶部衰减推迟到 h≈0.88)、撕裂感(细节噪声/域扭曲加幅)、烟羽浓度回调、火星尺寸收敛、白热核心收窄。
- 布景:柴架放矮让火舌探出,铜壶抬至火尖上缘(火舔壶底),链缩短,备柴归位;夜空地平线压暗,火光/环境光增强,初始构图拉近。
- 修复:隐藏标签页 `innerWidth=0` 导致 0×0 canvas(兜底 1080p + visibilitychange 重同步)。
- 修复:`setView` 后单帧步进时合成 pass 读到旧相机矩阵,体积 ray 与场景深度错位、火焰被整体截断(`FireComposite.update` 强制 `updateMatrixWorld`)。
- `__bench` 增加 `setView(az, elev, dist)` 环绕取证与 `snapshot()` 截图后备;弃用的 PCFSoftShadowMap 改 PCFShadowMap,控制台零警告。
- 更新 README / HANDOVER(架构表、管线说明、实测清单、踩坑记录),重新构建 dist。

## 2026-07-15

- 建立 Claude Fable 5 的实体火焰评测项目。
- 完成体积光线步进、三层焰色、热浪折射、火光、火星和烟羽效果。
- 增加中文实时控制和 `window.__bench` 评测接口。
- 接入 ModelBenchLab 统一 registry、workspace 和门户。
- 补齐 README、交接文档与改动记录。

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。
