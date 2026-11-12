# 改动记录 — gemini4-fire-raymarch

## 2026-11-10 · 初始实现与门户接入

- **新建项目 `gemini4-fire-raymarch`（登记端口 `3074`）**：
  - 完成 `fire`（`code3d-fire-001` v1）任务的 Gemini 4 三维体积光线步进实现。
  - 实现双阶段 HDR 渲染管线（`HalfFloatType` 颜色 + `FloatType` 深度截断），支持三股交织螺旋火舌、双级 FBM 域扭曲、元胞侵蚀收尖、高温核心/明亮主焰/橙红外焰三层温度场、火与烟同场积分及背景热浪折射。
  - 程序化构建玄武岩祭坛石圈与四方符文石柱、镂空锻铁火盆笼与三脚架青铜鼎釜、松木柴堆与白热炭床、黑曜砂砾地面及星夜冷月天穹，全程零外部二进制资产。
  - 实现受热流浮力、三维旋度湍流与风向量共同驱动的火星粒子与高空烟羽系统，以及“添柴鼓风”交互爆发。
  - 提供全中文实时控制面板、遥测 HUD、`window.__bench` 评测钩子及 Node 单元测试 `tests/fire.test.mjs`。
- **仓库同步**：
  - 登记至 `benchmark/registry.json`、根 `package.json` `workspaces` 与 `package-lock.json`，通过 `npm run sync:check`。
