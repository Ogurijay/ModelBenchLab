# Claude Realistic Ocean

Claude 完成的 Three.js（Web 3D 图形库）真实海面模拟用例，用于 agent 能力横向对比。

## 实现要点

- **Gerstner（特罗科伊德）波**：波浪不只是上下起伏，水平方向也会向浪尖挤压，形成真实的尖浪谷宽的形态。波谱由风速决定主波长，按几何级数叠加 12 个分量波。
- **CPU/GPU 同源参数**：[src/ocean/waves.js](src/ocean/waves.js) 生成的波参数既供 Vitest 测试（确定性种子、陡度安全约束、高度上界），也直接写入顶点着色器 uniform 数组，两边数学一致。
- **着色细节**：菲涅尔反射 + 程序化天空、太阳盘与高光、浪尖泡沫（挤压量 + 噪声破碎）、高频法线扰动波光、指数距离雾融入天际线。
- **陡度安全**：自动归一化 Σ Q·k·A ≤ 1，任何风速下波形都不会自交打结（有测试覆盖）。

## 运行方式

```powershell
npm install
npm run dev
```

打开终端输出的本地地址（默认 `http://127.0.0.1:5174/`）。

## 验证命令

```powershell
npm test        # 14 个波浪逻辑测试（Vitest）
npm run build   # Vite 生产构建
```

浏览器实测：打开页面确认 canvas 渲染出海面与天空、拖拽旋转和滚轮缩放可用、右上角面板调参实时生效。页面暴露 `window.__ocean.frames` 帧计数器，便于自动化确认渲染循环在跑。

## 交互说明

- 鼠标拖拽：环绕观察；滚轮：缩放（限制不会钻到水下）。
- 右上角 `Ocean Controls`：风速、风向、浪高比例、浪尖锐度、泡沫量、太阳高度/方位、网格质量三档。
- 左下角 HUD（抬头显示）：海况等级（中文描述）、FPS（每秒帧数）、顶点数。

## 文件结构

```text
src/
  main.js              # 场景编排、相机、渲染循环、参数联动
  ocean/
    waves.js           # 波谱生成与采样（纯逻辑，可测试）
    materials.js       # 海面/天空 shader 材质
  ui/
    panel.js           # lil-gui 面板和 HUD
  styles.css           # 布局与响应式样式
tests/
  waves.test.js        # 波浪逻辑测试（14 条）
```
