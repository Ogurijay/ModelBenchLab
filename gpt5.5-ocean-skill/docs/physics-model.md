# GPTSkill Ocean 物理模型

这个 demo 用的是 Gerstner wave（盖斯特纳波）叠加模型。它不是简单把顶点上下抖动，而是同时计算水平位移、垂直位移和法线，所以浪峰会向前卷，浮标也能按海面法线倾斜。

## 关键公式

- `k = 2π / wavelength`：波数，表示单位距离内相位变化速度。
- `omega = sqrt(g * k)`：深水波色散关系，表示长波跑得更快、短波跑得更慢。
- `phase = k * dot(direction, position) - omega * time + phaseOffset`：每个波分量的相位。
- `height = amplitude * sin(phase)`：垂直高度。
- `horizontal = q * amplitude * direction * cos(phase)`：水平位移，用来形成更尖锐的浪峰。

`q` 是 steepness（陡峭度）的稳定化结果，代码里会按波数、振幅和波数量做约束，避免波面自交。

## 波谱

`src/game/simulation/waveSpectrum.ts` 会根据风速生成 12 个波分量。峰值频率参考 Pierson-Moskowitz spectrum（皮尔逊-莫斯科维茨波谱，常用于充分发展海况），再把波长、方向、振幅和相位分散到多个分量里。

## 浮标

`src/game/simulation/buoyancy.ts` 复用同一套 CPU 采样公式获取海面高度和法线。浮标的垂直运动使用 spring-damper（弹簧阻尼）模型，表现为有惯性的漂浮，而不是硬贴在波面上。

## 文件边界

- `src/game/simulation/`：物理状态、波谱、采样、浮力。
- `src/render/`：Three.js 场景、相机、材质和网格。
- `src/ui/`：DOM 控制面板。
- `scripts/verify-ocean.mjs`：Playwright 截图、像素和交互验证。
