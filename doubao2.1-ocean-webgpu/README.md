<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/doubao2.1-ocean-webgpu/ 。
并行开发（仓库根目录）：`npm run dev:one -- doubao2.1-ocean-webgpu`，访问 http://localhost:3003/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# Doubao 2.1 WebGPU Ocean

一个基于 `WebGPU`（浏览器现代 GPU 图形接口）和 `Three.js`（三维渲染库）的实时海面模拟示例。

## 运行

```bash
npm install
npm run dev
```

## 入口

- 示例目录：`doubao2.1-ocean-webgpu`
- 实现说明：`doubao2.1-ocean-webgpu`
- 主代码：`doubao2.1-ocean-webgpu`

## 浏览器要求

需要支持 WebGPU 的浏览器。推荐新版 Chrome 或 Edge，并开启硬件加速。
