<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.5-ocean-realistic/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.5-ocean-realistic`，访问 http://localhost:3007/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# GPT Realistic Ocean

这是一个用于 agent 能力边界测试的 Three.js（Web 3D 图形库）真实海面模拟用例。它重点测试三类能力：

- WebGL shader（着色器）材质：用 GPU 计算海浪高度、泡沫和高光。
- 可维护工程结构：把波浪数学、材质、UI 面板和场景编排分开。
- 可验证交付：用 Vitest（JavaScript 测试框架）测纯逻辑，用浏览器检查真实 canvas 渲染。

## 运行方式

```powershell
npm install
npm run dev
```

然后打开终端输出的本地地址，默认类似：

```text
http://localhost:3007/
```

## 验证命令

```powershell
npm test
npm run build
```

## 交互说明

- 鼠标拖拽：旋转观察角度。
- 滚轮：缩放相机。
- 右上角 `Ocean Controls`：调节风速、风向、浪高、浪尖锐度和泡沫量。
- 左下角 HUD（抬头显示）展示海况、FPS（每秒帧数）和顶点数。

## 文件结构

```text
src/
  main.js              # Three.js 场景、相机、渲染循环
  ocean/
    materials.js       # 海面和天空 shader 材质
    waves.js           # 可测试的波浪数学逻辑
  ui/
    panel.js           # 参数面板和 HUD 更新
  styles.css           # 页面样式和响应式布局
tests/
  waves.test.js        # 波浪逻辑测试
```

