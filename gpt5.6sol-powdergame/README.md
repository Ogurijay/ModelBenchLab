# 物质实验场 100.0-CN

`gpt5.6sol-powdergame` 是一个受 The Powder Toy 启发、从零实现的中文浏览器粒子物理沙盒。它使用 TypeScript（类型化 JavaScript）与 Canvas 2D（二维画布）运行逐格元胞自动机，不复制原游戏源码、界面或素材。

## 运行

```powershell
npm --prefix E:\ModelBenchLab\gpt5.6sol-powdergame run dev -- --port 3023
```

也可以从根工作区按目录启动：

```powershell
npm run dev:one -- gpt5.6sol-powdergame
```

## 设计重点

- 全中文实验台；每个元素同时显示中文名、The Powder Toy 风格符号和化学式，例如 `水 · WATR · H2O`。
- 确定性模拟内核；相同种子与相同操作可重放，便于单元测试和模型横向评测。
- 粉末、液体、气体、固体与能量粒子使用不同运动模型，并按密度发生置换。
- 温度、热容量、热传导、相变、环境热对流、压力、空气速度与涡量共同作用。
- 覆盖燃烧爆炸、酸碱中和、溶解与析盐、熔岩淬火、电路传导、核裂变和植物生长。
- 常规、热量、压力、空气、电路共五种观测视图，右侧探针实时读取格点数据。
- 本地保存/读取、撤销/重做、截图导出、预设实验和桌面/触控绘制。

## 参考口径

2026-07-10 核对时，The Powder Toy 官网提供 `100.0` Beta，GitHub 最新发布为 `v100.0.399`。本项目吸收该版本中 `BASE`（碱）、`SEED`（种子）、环境气压/速度、涡量约束和动态热显示等方向，再按浏览器性能预算重新设计。

- 官网：https://powdertoy.co.uk/
- 最新发布：https://github.com/The-Powder-Toy/The-Powder-Toy/releases/tag/v100.0.399

## 目录

```text
src/
  simulation/   元素数据、空气场、粒子状态与反应规则
  render/       Canvas 像素渲染与观测视图
  input/        鼠标、触控和画笔轨迹
  ui/           中文界面、元素抽屉和实时探针
  presets/      可复现实验场景
  diagnostics/  window.__powderLab 调试桥
tests/          模拟规则单元测试
```

## 验证

```powershell
npm --prefix E:\ModelBenchLab\gpt5.6sol-powdergame run test
npm --prefix E:\ModelBenchLab\gpt5.6sol-powdergame run build
```

