# 变更日志 (CHANGELOG.md) — antigravity-ocean-storm

## [1.0.0] - 2026-06-25

### 新增 (Added)
- 初始化 `antigravity-ocean-storm` 项目目录。
- 引入了 8 重 Gerstner 物理海洋波谱算法，支持顶点着色器位移与 CPU 浮力采样。
- 新增暴风雨（物理雨滴粒子）、雷电闪烁（分叉折线几何体）、龙卷风（阿基米德旋转上升与空间扭曲粒子）三大极端天气特效。
- 新增基于 CPU 物理高度与法线采样的浮力小船，支持在暴风雨中起伏摇摆及龙卷风引力拉扯。
- 新增现代毛玻璃样式（Glassmorphism）的中文交互控制面板。
- 在中文控制面板中新增“场景光源亮度 (Brightness)”滑块控制，支持以 0.2x ~ 4.0x 全局系数等比调节所有天气下的灯光强度。
- 注册新任务卡片到 Portal 主页，并整合多服务启动脚本。

### 修复 (Fixed)
- 修复了 `WeatherSystem` 克隆预设时因 `JSON.parse(JSON.stringify)` 导致 `THREE.Color` 实例方法丢失，进而在动画更新时抛出 `fogColor.clone is not a function` 异常引起白屏的 BUG。
- 修复了海面着色器（ShaderMaterial）光照环境与亮度参数未同步更新的 BUG：先前由于 `uAmbientLightColor`、`uLightColor`、`uLightDirection` 以及 `uFogColor` 等 Uniforms 从未在渲染循环中动态更新，导致海面无法感知场景光照强度、环境雾效以及闪电雷击的变化，海面呈现近乎全黑的质感。现已通过渲染循环在每帧对这些 Uniform 字段进行全局灯光同步。

