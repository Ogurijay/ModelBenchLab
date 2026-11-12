<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gemini4-fire-raymarch/ 。
并行开发（仓库根目录）：`npm run dev:one -- gemini4-fire-raymarch`，访问 http://localhost:3074/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口 3074；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 炽渊 · PYRE SANCTUARY — 实体火焰 · 三维体积光线步进模拟 (Gemini 4)

ModelBenchLab 实体火焰任务（`code3d-fire-001` v1，mission `fire`，variant `raymarch`）的 Gemini 4 实现（参考规范 `benchmark/tasks/code-to-3d/fire.md`）。基于 Three.js r186 与 WebGL2 GLSL3 构建全屏双阶段 HDR 体积光线步进（Ray Marching）火焰与烟羽同场积分管线，**100% 程序化几何、材质与纹理生成，零外部资产，除 `three` 外零运行时依赖**。

- **统一门户访问**：仓库根目录运行 `npm run dev`，访问 **http://localhost:3000/gemini4-fire-raymarch/**
- **独立并行调试**：仓库根目录运行 `npm run dev:one -- gemini4-fire-raymarch`（或子目录 `vite --port 3074 --strictPort`），访问 `http://localhost:3074/`

## 核心技术与特性

1. **真·三维体积光线步进（Ray Marching）与场景深度遮挡**：
   - 采用双阶段 HDR 管线：先将三维实体场景与火星渲染至 `HalfFloatType` 线性 HDR RenderTarget（附 `FloatType` 深度缓冲），再在全屏合成阶段逐像素重建世界空间射线，与三维体积包围盒求交并以场景线性深度截断步进终点 `tEnd`。
   - 围绕柴堆的 8 根镂空锻铁火盆肋条、悬吊青铜鼎釜与木柴对三维火焰产生真实前后穿插遮挡；360° 任意水平角度环绕观察均保持立体非对称三维体积（绝非广告牌切片）。
   - 采用 Interleaved Gradient Noise (IGN) 抖动消除步进分层伪影，透射率 `< 0.5%` 时提前终止。
2. **三股螺旋火柱 + 双级域扭曲（Domain Warping）+ 元胞侵蚀**：
   - 密度场由中央火心与三股螺旋上升副火舌交织而成，叠加双级 FBM 域扭曲与伪元胞侵蚀项，自然形成连续上升、翻滚卷曲、分叉火舌与顶部收尖断焰。
   - 连续径向与轴向温度场严格表现 **白炽高温核心（含底部富氧预混微蓝根部）→ 金黄明亮主焰 → 橙红外焰** 三层结构，并提供 4 档焰色光谱（默认 `标准松木`，可选 `锻炉炽焰`、`铜盐青焰`、`幽冥魂火`）。
3. **火与烟同场积分 + 背景热浪折射（Heat Shimmer）**：
   - 一次光线步进同时累积火焰发射与上部风剪切体积烟羽吸收，烟羽底部承接火光暖橙各向异性内散射，顶部受冷月光微光勾边；辅以高空伴随三维柔光烟团粒子。
   - 按视线距火焰热流主轴的最近距离对背景场景 UV 施加上升热浪折射扭曲，并由场景深度掩码保护前景物体不被误扭曲。
4. **动态火光照明四大类周边实体 PBR 材质**：
   - 主火源点光（投射 `PCFShadowMap` 实时阴影）与底部炭床补光共享 CPU 端多频 FBM 呼吸与风偏摇曳曲线，实时照亮：
     - **粗糙石材**：内圈 10 块玄武岩火塘石 + 外围 4 座雕刻符文石柱（镶嵌青铜箍环）；
     - **焦裂木质**：7 根锥形架设松木柴堆（程序化树皮漫反射/粗糙度贴图 + 内端炭红发光贴图）与中心白热炭床；
     - **锻铁与青铜金属**：镂空锻铁火盆笼、三脚铁架、铁链、黄铜束环与底部烟熏黑渐变青铜鼎釜；
     - **黑曜砂砾与炭灰地面**：顶点噪声起伏 + 程序化碎石粗糙度贴图，中圈碎石反射温暖火光高光。
5. **伴随火星与烟羽 + 中文实时控制 + `__bench` 评测钩子**：
   - 确定性种子驱动的 280 颗浮力旋度湍流火星粒子 + 72 团高空伴随烟羽，受热流浮力与风向风力共同驱动；支持点击「添柴鼓风」（或按 `B`）触发火焰暴涨与火星喷发。
   - 中文玻璃拟态控制面板支持火势、湍流、风向、风力、四档渲染质量（32 / 48 / 68 / 104 步单调递增）、焰色光谱、暂停（`Space`）、重置视角（`R`）与自动环绕（`O`）。
   - 完整暴露 `window.__bench = { ready, stepFrame(n), getState(), setParam, setParameters, setView, resetView, snapshot }`。

## 验证命令

```powershell
npm test --workspace=gemini4-fire-raymarch
npm run build --workspace=gemini4-fire-raymarch
npm run sync:check
```
