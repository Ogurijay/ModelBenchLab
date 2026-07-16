# 改动记录

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
