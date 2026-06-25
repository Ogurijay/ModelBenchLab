# Grok Realistic Ocean

Grok（xAI）实现的 Three.js 真实海面模拟测试用例，用于 agent 能力横向对比。

## 核心特点

- **Gerstner 波模型**：完整的 12 波叠加特罗科伊德波，水平位移 + 法线计算。波谱由风速/风向驱动，几何级数递减形成自然海浪谱。
- **CPU / GPU 同源**：`src/ocean/waves.js` 纯数学模块（无 Three.js 依赖）同时服务：
  - Vitest 自动化测试（确定性、陡度安全约束、采样边界）
  - 主程序中浮标（buoy）的实时姿态更新（高度 + 倾斜）
  - 顶点着色器使用完全相同的数学公式写入 uniform 数组
- **高质量着色**：Fresnel 反射 + 程序天空/太阳盘/光晕、浪尖泡沫（crest + 噪声）、高频法线扰动、次表面散射近似、平方指数雾。
- **陡度安全**：运行时强制 Σ Q·k·A ≤ 1，任意参数都不会出现波形自交打结（测试覆盖）。
- **轻交互演示**：4 个彩色浮标随真实波浪上下漂浮并倾斜，证明 CPU 采样与视觉一致。

## 运行方法

```powershell
cd grok4.3-ocean-realistic
npm install
npm run dev
```

浏览器访问 `http://127.0.0.1:5176/` （端口避开其他 agent 项目）。

## 验证命令

```powershell
npm test          # 运行 14+ 条波浪逻辑单元测试
npm run build     # Vite 生产构建（输出 dist/）
npm run preview   # 预览构建产物
```

**浏览器实测要点**：
- 海面有明显起伏与浪尖白沫
- 拖拽鼠标环绕观察、滚轮缩放（不会钻入水下）
- 右上 lil-gui 面板实时生效（风速/浪尖/太阳等）
- 左下 HUD 显示海况等级、FPS、顶点数
- 4 个彩色浮标 + 1 艘演示船随真实波浪（高度 + 法线）自然浮动并倾斜
- **新增大量物理效果**：
  - 点击海面投放可交互物体（立方体/球/圆柱/圆锥）
  - 真实重力自由落体 + 入水飞溅（环 + 重力粒子）
  - 浮力 + 水阻尼 + 波面法线对齐（物体随浪起伏并倾侧）
  - 左上“最近落体测试”面板显示下落高度、入水时间、速度与理论值对比
  - GUI “🧊 物理效果” 可调形状、尺寸、投放高度、重力、船速、自动落雨、批量投放
  - 最多 ~48 个动态物体，性能友好
- 控制台可读取 `window.__grokOcean.frames` / `.elapsed` / `.spawn(...)` 便于验证与调试

## 验证证据
- `docs/browser-verification.jpeg`：Playwright MCP 实测截图（canvas + 4 浮标 + GUI + HUD 全部可见，FPS ~165，顶点 5.8 万）。
- 详见 `docs/README.md`（包含 evaluate 返回的 frames=1207+、waveCount=12、海况文本等证据）。

## 文件结构

```
grok4.3-ocean-realistic/
├── index.html
├── package.json
├── src/
│   ├── main.js            # 场景、渲染循环、浮标演示、参数联动
│   ├── ocean/
│   │   ├── waves.js       # 波谱生成 + CPU 采样（纯逻辑，可测试）
│   │   └── materials.js   # 海面/天空 ShaderMaterial + applyWaves
│   ├── ui/
│   │   └── panel.js       # lil-gui + HUD
│   └── styles.css
├── tests/
│   └── waves.test.js      # 波浪核心逻辑的 Vitest 测试
├── docs/                  # 验证截图与说明（可选）
└── README.md
```

## 与其他 agent 对比维度（参考 AGENT_README）

- 工程结构是否模块化清晰（ocean / ui 分离）
- 波浪数学是否正确且有测试守护（陡度安全、确定性、边界）
- 视觉是否真实（浪形、泡沫、反射、雾）
- 是否提供 CPU 采样用于潜在物理/交互
- 文档 + 运行/验证说明是否完整

## 许可与说明

本项目仅用于 agent 能力测试对比。代码采用现代 ES 模块 + Vite 构建。
