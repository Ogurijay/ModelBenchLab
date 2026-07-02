# GPT 5.5 Ocean WebGPU

实时海面天气模拟 demo，使用 Three.js `WebGPURenderer`（WebGPU 渲染器）和 TSL（Three.js Shader Language，节点式着色语言）生成程序化海面，并叠加雨、云、雾、闪电和浮标响应。

## 运行

```bash
npm run dev:gpt-webgpu
```

门户批量启动时固定端口为 `3013`：

```bash
npm run dev
```

单独启动时 Vite 会使用默认端口，可在浏览器访问终端提示的地址。

## 技术点

- WebGPU：通过 Three.js `WebGPURenderer` 运行。
- TSL：把 Gerstner 波位移、法线、泡沫和水体颜色放进 GPU 节点材质。
- Weather FX：雨线、云层、雾幕、闪电和浮标为实时 Three.js 对象。
- UI：HTML/CSS 覆盖层控制风、浪、雨、闪电和太阳高度。

## 浏览器要求

需要新版 Chrome 或 Edge，并开启硬件加速。若浏览器没有 WebGPU 能力，页面会显示 WebGPU 不可用提示。
