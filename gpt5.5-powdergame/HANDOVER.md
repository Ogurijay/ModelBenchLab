# gpt5.5-powdergame 交接文档

## 当前状态

- 目录：`E:\ModelBenchLab\gpt5.5-powdergame`
- 端口：`3018`
- 技术栈：Vite 8 + TypeScript + Canvas 2D
- 入口：`src/main.ts`
- 默认场景：`garden`，展示水、沙、种子和植物生长。

## 架构说明

- `src/simulation/PowderSimulation.ts` 是唯一模拟真源，持有元素 ID、温度、压力、速度、生命值和原始导体类型。
- `src/render/ParticleRenderer.ts` 只读取模拟数组并绘制像素，不写玩法状态。
- `src/ui/AppUi.ts` 负责中文元素面板、环境滑条、视图模式和保存/读取。
- `src/input/PointerPainter.ts` 把 pointer 坐标转换成网格坐标，并调用模拟层画笔。
- `src/diagnostics/debugBridge.ts` 暴露 `window.__powderGame`，用于浏览器验收和自动化测试。

## 已实现物理规则

- 粉末重力、液体流动、气体浮升、密度交换。
- 热传导、热容量、相变、环境热对流。
- 压力扩散、局部风场、真空/压力工具、涡量扰动。
- 酸碱中和、酸腐蚀、盐水、熔岩遇水、液氮冷却。
- 燃烧、氢氧爆炸、氧气助燃、烟雾消散。
- 电池、导线、金属、半导体、火花传播。
- 种子遇水生长、植物继续蔓延。
- 铀/中子反应、光子、等离子、黑洞吸收。

## 验证命令

```powershell
npm --prefix E:\ModelBenchLab\gpt5.5-powdergame run test
npm --prefix E:\ModelBenchLab\gpt5.5-powdergame run build
```

2026-07-03 已通过：

- Vitest：6 个模拟规则测试通过。
- Vite build：生产构建通过。
- Playwright：`http://127.0.0.1:3018/` 首屏无浏览器报错，画布非空，绘制有效，反应堆预设有效，移动端无横向溢出。
- 截图：`test-artifacts/desktop.png`、`test-artifacts/mobile.png`。

## 后续建议

- 若要更接近桌面版，可以增加印章系统、可搜索存档、更多电子元件和可配置边界条件。
- 若要提升性能，可以把压力/温度扩散拆到 Web Worker，或把像素更新迁到 WebGL texture。
- 若要加入音效，建议只给爆炸、电火花、液体沸腾做短音效，避免持续噪声影响实验体验。
