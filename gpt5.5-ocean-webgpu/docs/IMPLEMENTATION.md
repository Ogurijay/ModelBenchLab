# WebGPU Ocean Lab 实现说明

这个示例用 Three.js 的 `WebGPURenderer`（WebGPU 渲染器）承载实时海面效果，目录命名为 `gpt-webgpu-ocean`。

## 技术结构

- `WebGPU`：浏览器新一代图形 API，用来替代部分 WebGL 场景，适合更现代的 GPU 渲染管线。
- `Three.js`：三维渲染库，负责场景、相机、材质、网格和交互控制。
- `WaterMesh`：Three.js 官方 WebGPU 水面对象，提供反射水面 shader 和水面法线扰动。
- `Normal map`：法线贴图，用颜色编码表面细节方向；本示例复用 Three.js 官方 water 示例的水面法线贴图。
- `Seeded random spectrum`：带种子的随机波谱，按长涌浪、中尺度风浪、短波三层叠加，避免整齐编排的正弦波纹。
- `BufferGeometry`：Three.js 的高性能几何数据结构，示例中逐帧更新顶点高度来形成动态海面。

## 文件说明

- `index.html`：页面入口和参数控制面板。
- `src/main.js`：WebGPU 渲染器、官方 `WaterMesh`、随机波谱、泡沫粒子/线段、天空背景和交互逻辑。
- `src/styles.css`：全屏画布、控制面板、状态条和响应式样式。
- `assets/concept/ocean-lab-concept.png`：实现前生成的视觉概念图。
- `public/water/Water_1_M_Normal.jpg`：运行时使用的官方水面法线贴图。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端输出的本地地址。建议使用新版 Chrome 或 Edge，并确保硬件加速已开启。

## 可调参数

- `Wave Height`：海浪高度。
- `Wind`：风速，影响波浪推进速度。
- `Foam`：泡沫粒子的透明度和尺寸。
- `Pause`：暂停或继续模拟。
- `Reset View`：恢复默认相机角度。
