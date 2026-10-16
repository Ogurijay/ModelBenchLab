<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.5-ocean-webgpu/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.5-ocean-webgpu`，访问 http://localhost:3013/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# GPT 5.5 Ocean WebGPU

实时海面天气模拟 demo，使用 Three.js `WebGPURenderer`（WebGPU 渲染器）和 TSL（Three.js Shader Language，节点式着色语言）生成程序化海面，并叠加雨、云、雾、闪电和浮标响应。

## 运行

```bash
npm run dev:one -- gpt5.5-ocean-webgpu
```

独立调试使用 registry 登记端口 `3013`：

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
