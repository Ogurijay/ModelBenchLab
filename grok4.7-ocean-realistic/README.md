<!-- modelbenchlab-access -->
统一访问：在仓库根目录运行 `npm run dev`，打开 `http://localhost:3000/grok4.7-ocean-realistic/`。
独立调试：根目录运行 `npm run dev:one -- grok4.7-ocean-realistic`，打开 `http://localhost:3056/`。下文子目录启动说明仅用于独立开发。

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
