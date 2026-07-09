# GPT 5.6 SOL Ocean 交接文档

更新时间：2026-07-10

## 当前状态

- Three.js 0.184 + WebGL ShaderMaterial 写实海面已完成。
- 12 组固定种子风驱 Gerstner 波已完成，CPU 采样与 GPU 参数同源。
- 正午、晨光、阴天三套环境预设及按钮平滑切换已完成。
- 轨道相机、水面高度保护、响应式 HUD、自适应像素比和诊断对象已完成。
- Vitest 测试、Vite 生产构建和 ModelBenchLab 接线均纳入验证流程。

## 关键入口

- `src/ocean/spectrum.js`：先从这里调整波谱；不要在 Shader 中另建一套波参数。
- `src/ocean/material.js`：海面位移、微法线、反射、太阳光路和泡沫。
- `src/environment/presets.js`：光照预设的单一事实源。
- `src/environment/sky.js`：天空、太阳盘和云层。
- `src/main.js`：场景装配、质量策略、相机和运行时诊断。

## 已知限制

- 当前是确定性 Gerstner 波谱，不是 FFT 海洋；近景真实感优先，极远洋统计精度不是目标。
- 程序化云层是天空着色的一部分，不具备体积云自遮挡。
- 自适应质量只降低像素比，不会在运行中重建几何网格，以避免模式切换时卡顿。
- 无船只、浮标、海岸、海底或天气粒子，这是为了保持纯海面评测范围。

## 后续建议

1. 如需性能分档，新增 `medium` 几何配置并通过 URL 查询参数显式选择，避免改变默认基准。
2. 如需物理对照，可新增 FFT 变体目录，不要替换本项目的 Gerstner 基线。
3. 视觉调整后必须重新保存三套桌面预设截图和一张移动端截图。

## 验证命令

```powershell
npm test --workspace gpt5.6sol-ocean
npm run build --workspace gpt5.6sol-ocean
npm run sync:check
```

浏览器验证时检查 `window.__ocean.ready`、`frames`、`activePreset`、`quality`、`webgl` 和 `fps`，并确认控制台没有错误。
