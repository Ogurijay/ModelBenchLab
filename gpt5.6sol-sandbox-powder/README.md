<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.6sol-sandbox-powder/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.6sol-sandbox-powder`，访问 http://localhost:3026/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 物质实验场 100.0-CN

`gpt5.6sol-sandbox-powder` 是一个受 The Powder Toy 启发、从零实现的中文浏览器粒子物理沙盒。它使用 TypeScript（类型化 JavaScript）与 Canvas 2D（二维画布）运行逐格元胞自动机，不复制原游戏源码、界面或素材。

## 运行

```powershell
npm --prefix gpt5.6sol-sandbox-powder run dev -- --port 3026
```

也可以从根工作区按目录启动：

```powershell
npm run dev:one -- gpt5.6sol-sandbox-powder
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
npm --prefix gpt5.6sol-sandbox-powder run test
npm --prefix gpt5.6sol-sandbox-powder run build
```

