<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/grok4.7-ocean-realistic/ 。
并行开发（仓库根目录）：`npm run dev:one -- grok4.7-ocean-realistic`，访问 http://localhost:3056/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 潮镜 · 解析海浪（Grok 4.7）

ModelBenchLab 海洋任务的写实变体。海面用风区经验峰周期上的 JONSWAP 谱形离散成 18 个 Gerstner 分量，再归一化到目标有效波高，并叠一组交叉涌浪。CPU 与顶点着色器用同一套位移和导数，浮体读的就是画面上的那片水。

任务：`code3d-ocean-001` v1（mission `ocean`，variant `realistic`），题面见 [`benchmark/tasks/code-to-3d/ocean.md`](../benchmark/tasks/code-to-3d/ocean.md)。

## 内容

- **海面**：相机跟随的三层网格（近 / 中 / 远），接缝处用圆孔和多边形偏移叠合。解析法线、雅可比泡沫、船迹和岛周泡沫，距离上加宽的太阳光路，菲涅尔反射同一套天空。
- **天空**：与雾色共用的大气梯度、太阳盘、米氏辉光、程序云、夜间月亮。云和太阳进入海面反射。
- **浮体**：渔船、红绿航标、木箱、油桶。多点浸没浮力、线性水阻力、扶正力矩。渔船和航标有松弛系泊。
- **灯塔岛**：程序化礁石和灯塔。入夜灯塔按节闪光。
- **交互**：五档海况平滑过渡；lil-gui 调风速、涌浪、时刻、云、泡沫；点击投放，拖拽抛出。相机被托在当地波面之上。

## 操作

| 操作 | 说明 |
|---|---|
| 拖拽 / 滚轮 / 右键 | 旋转 / 缩放 / 平移 |
| 点击海面 | 投放面板里选中的浮体 |
| 拖住浮体 | 提起，松手抛出 |
| `1`–`5` | 镜海 / 信风 / 金潮 / 长浪 / 烈风 |
| `F` | 镜头跟随渔船 |
| `C` | 清掉投放的浮体 |
| `空格` | 暂停 |
| `H` | 隐藏界面 |

默认打开「金潮」。窄屏会收起参数面板，预设仍在底部。

## 目录

```
src/main.js         场景、循环、交互、HUD、window.__bench
src/waves.js        谱离散、Gerstner 求值、水平位移反求
src/water.js        三层海面与着色器
src/atmosphere.js   海天共用的梯度与太阳方向
src/sky.js          天空穹与星点
src/buoyancy.js     多点浮力
src/props.js        渔船、航标、木箱、油桶、灯塔岛
src/presets.js      五档海况
src/gui.js          lil-gui
tests/waves.test.js 谱、法线、浮力沉降
```

## 验证

```bash
npm test --workspace grok4.7-ocean-realistic
npm run build --workspace grok4.7-ocean-realistic
```

无头状态可读 `window.__bench.getState()`，其中 `cameraAboveWater` 表示相机高于采样波面。
