# HANDOVER

## 当前状态

- 项目目录：`E:\Web3dTest\gpt5.5-ocean-webgpu`
- 类型：独立 Vite + Three.js WebGPU demo
- 固定门户端口：`3013`
- 主入口：`index.html`
- 主源码：`src/main.js`
- 样式：`src/styles.css`
- 视觉概念：`assets/concept/ocean-weather-webgpu-concept.png`

## 已完成

- 补齐独立项目配置 `package.json`。
- 实现 WebGPU 海面天气模拟。
- 实现四个天气预设：`Calm`、`Rain`、`Storm`、`Squall`。
- 实现风、浪、雨、闪电、太阳高度控制。
- 实现 FPS、顶点数、wave seed 读数。
- 补齐根门户卡片、根 `package.json` 开发脚本和 `RULES.md` 端口表。

## 验收建议

1. 在 `E:\Web3dTest` 执行 `npm run dev:gpt-webgpu -- --port 3013`。
2. 用新版 Chrome 或 Edge 打开 `http://localhost:3013`。
3. 确认顶部状态为 `WebGPU`，海面动态渲染，天气预设和滑杆能实时改变效果。
4. 若批量对比，执行根目录 `npm run dev`，从门户打开 `:3013` 卡片。

## 当前验证记录

- `npm run build -w gpt5.5-ocean-webgpu` 已通过。
- Chrome headed 模式已验证 WebGPU 路径：顶部状态 `WebGPU`，canvas 全屏渲染，Storm/Squall 交互可用。
- QA 截图：
  - `docs/qa/desktop-ocean-webgpu-final.png`
  - `docs/qa/desktop-squall-final.png`
  - `docs/qa/mobile-ocean-webgpu-final.png`
- 像素检查通过：桌面/移动截图均为非空、非纯色画面。

## 后续可选优化

- 增加 WebGPU compute shader（计算着色器）版 FFT 海浪。
- 增加真实海雾体积云或屏幕空间雨滴。
- 加入 GPU timer query 做更准确的性能分析。
