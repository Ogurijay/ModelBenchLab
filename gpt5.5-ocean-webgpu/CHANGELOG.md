# CHANGELOG

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3013 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3013，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 2026-06-29

- 新增 `gpt5.5-ocean-webgpu` 独立项目源码。
- 使用 Three.js `WebGPURenderer` 和 TSL 节点材质实现程序化海面。
- 增加天气预设、雨线、云层、雾、闪电、浮标和控制面板。
- 增加 `README.md`、`HANDOVER.md`、`docs/IMPLEMENTATION.md`。
- 将视觉概念图保存到 `assets/concept/ocean-weather-webgpu-concept.png`。
- 同步根门户、根开发脚本和端口表，固定门户端口为 `3013`。
- 增加 final QA 截图，并通过 Chrome WebGPU 路径与像素非空检查。

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。
