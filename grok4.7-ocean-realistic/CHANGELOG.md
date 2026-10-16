<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# 变更

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3056 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 2026-10-02

- 新建 `grok4.7-ocean-realistic`（潮镜）。按海洋任务写实变体做 JONSWAP 离散 Gerstner 海面、联动天空、lil-gui 和多点浮力。
- 登记端口 3056，补 README / HANDOVER / CHANGELOG，并加入根 workspace。
- 航标、木箱、油桶的扶正力矩按浸没采样的水线刚度提高，采样点跟随网格缩放，默认镜头前保持正浮。
