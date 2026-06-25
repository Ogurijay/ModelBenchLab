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
http://127.0.0.1:5173/
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

