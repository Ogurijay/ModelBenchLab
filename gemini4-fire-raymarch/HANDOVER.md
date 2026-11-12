# 交接文档 — gemini4-fire-raymarch (炽渊 · 三维体积光线步进实体火焰模拟)

## 当前状态

- **状态**：已完成开发、单测、生产构建与浏览器实测验证，已登记至 `benchmark/registry.json` 并接入统一门户。
- **任务身份**：`task_id: "code3d-fire-001"`，`task_version: 1`，mission `fire`，variant `raymarch`。
- **技术栈**：Three.js `0.186.1`、WebGL2 GLSL3、Vite 8、原生 JavaScript ESM；**除 `three` 外零运行时依赖，零外部二进制资产**。
- **访问与端口**：
  - 统一门户预览：仓库根目录运行 `npm run dev`，访问 `http://localhost:3000/gemini4-fire-raymarch/`
  - 独立并行调试：仓库根目录运行 `npm run dev:one -- gemini4-fire-raymarch`，登记端口 `3074`（`strictPort`）。

## 模块架构

| 文件路径 | 核心职责 |
|---|---|
| `index.html` | 相对路径入口，全屏画布与暗色基底样式 |
| `src/main.js` | 渲染器初始化、相机与 `OrbitControls`、质量档与 DPR/阴影联动、主循环与 45 帧预热 |
| `src/fireComposite.js` | **核心**：HalfFloat HDR RT + Float 深度纹理；全屏合成 GLSL3 三维体积光线步进（三股螺旋火舌、双级域扭曲、元胞侵蚀、三层黑体焰色、同场烟羽内散射、背景热浪折射、ACES + sRGB） |
| `src/shaders/chunks.js` | GLSL3 公共函数：3D C2 Value Noise、旋转矩阵 FBM、元胞侵蚀、IGN 抖动、四档火焰光谱与 ACES/sRGB |
| `src/scene.js` | 100% 程序化祭坛篝火场景：黑曜砂砾炭灰地面、内圈火塘石 + 外围四座青铜箍环玄武岩石柱、锥形松木柴堆 + 白热炭床、镂空锻铁火盆肋笼 + 三脚架 + 青铜鼎釜、星空冷月天穹 |
| `src/firelight.js` | 双点光源火光系统（主火源 `PCFShadowMap` 投影 + 炭床余烬补光），位置与亮度随 CPU FBM 呼吸曲线及风向实时摇曳 |
| `src/particles.js` | 伴随现象：`SparksSystem`（280 颗旋度浮力火星，支持添柴喷发）与 `SmokePlumeSystem`（72 团受风偏转的高空柔光烟团） |
| `src/params.js` | 响应式中央参数仓库（火势、湍流、风向、风力、四档质量、光谱、暂停、自动环绕） |
| `src/ui.js` | 中文毛玻璃实时控制面板与左下角性能/焰温遥测 HUD |
| `src/bench.js` | `window.__bench` 自动化评测与取证接口（同时兼容 `claudefable5` 与 `gpt5.5` 状态字段） |
| `tests/fire.test.mjs` | Node 单元测试（验证质量档步进单调性、参数钳制、风向量与确定性噪声/呼吸曲线） |

## 已知问题与注意事项

- 极高档位（`ultra`：104 步光线步进 + DPR 上限 2.0 + 2048 阴影贴图）在集成显卡或超高清屏上开销较高，默认档位设为 `high`（68 步，DPR 上限 1.5，1024 阴影），在 1080p 下稳定保持 60fps。
- 隐藏标签页下 `window.innerWidth` 可能为 0，`src/main.js` 已内置 `1920×1080` 回退并在 `visibilitychange` 时自动重同步。

## 下一步计划

- 配合后续 `code3d-fire-001` 正式评测冻结流程，执行多角度盲评截图归档与三模型（`gpt5.5` / `claudefable5` / `gemini4`）同锁横向对比。
