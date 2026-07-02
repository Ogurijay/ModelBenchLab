# Implementation Notes

## 目标

`gpt5.5-ocean-webgpu` 是一个独立的海面天气模拟项目。第一屏即为可交互的实时 3D 场景，不做营销页或静态截图包装。

## 渲染方案

- `WebGPURenderer`：Three.js 的 WebGPU 渲染器，负责主渲染管线。
- TSL 节点材质：海面网格使用 `MeshBasicNodeMaterial`，在 GPU 中计算 Gerstner 波位移、解析法线、菲涅尔反射、浪尖泡沫和距离雾。
- 程序化波谱：`createWaveBank()` 使用固定 seed 生成多尺度波组，`New Sea` 会重新生成 seed 并重建材质。
- 天气层：雨、云、雾、闪电和浮标通过 Three.js 对象叠加，参数由同一组 UI 状态驱动。

## UI 结构

- 左侧 `control-rail`：天气预设和参数滑杆。
- 右上 `readout-panel`：性能、顶点数、wave seed。
- 底部 `weather-strip`：风、雨、风暴强度条。
- 顶部状态：WebGPU、天气状态、FPS。

## 已知边界

- WebGPU 不可用时不降级为 WebGL，以便保持该目录的 WebGPU 对比属性。
- 云层与雨线为程序化视觉层，不参与真实流体求解。
- 浮标使用同一波谱的 CPU 采样近似跟随海面，视觉上与 GPU 海面同步。
