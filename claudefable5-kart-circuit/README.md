<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/claudefable5-kart-circuit/ 。
并行开发（仓库根目录）：`npm run dev:one -- claudefable5-kart-circuit`，访问 http://localhost:3009/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# Claude Kart Circuit

这是一个 Three.js（Web 3D 图形库）街机卡丁车竞速游戏测试用例，玩法借鉴「轻松、夸张、可漂移」的卡丁车竞速类型（马里奥赛车风格），但全部为原创实现，不使用任何 Mario / Nintendo 的角色、名称或素材。

## 玩法

- `W` / `↑`：加速；`S` / `↓`：刹车或倒车。
- `A` / `D` 或左右方向键：转向。
- `Space`（按住）：漂移蓄力，松开释放迷你涡轮（mini-turbo，两档：橙色 / 蓝色火花）。
- `Shift` / `E`：使用道具（道具箱中拾取的蘑菇 = 瞬时加速，最多可攒 2 个，先拾先用）。
- `R`：重新开始。

倒计时结束后与 3 个 AI（人工智能）对手比赛 3 圈：按顺序穿过检查点门，踩橙色加速带，拾取金色道具箱。HUD（抬头显示）展示圈数、实时排名、计时、速度、道具槽和漂移蓄力条，右上角有实时小地图。冲出赛道会陷入草地大幅减速，红白围栏是硬边界。

## 运行

```powershell
npm install
npm run dev
```

默认地址类似 `http://localhost:3009/`；端口被占用时先核对服务归属，不自动换号。

## 验证

```powershell
npm test        # 31 个 Vitest 单元测试（赛道 / 车辆 / 比赛 / 道具 / AI）
npm run build   # Vite 生产构建
```

浏览器实测项：canvas（画布）渲染出赛道与车辆而非空白；倒计时后按 `W` 速度表上升、车辆前进；漂移出火花并在松开后获得加速；过检查点圈数与排名更新。

## 结构

模拟逻辑（`src/sim/`）不依赖 three.js，可被 Vitest 直接测试；渲染（`src/render/`）与 UI（`src/ui/`）是适配层。

```text
src/
  main.js              # 启动、输入、游戏循环、倒计时/比赛/结算状态机
  sim/
    track.js           # Catmull-Rom 闭合样条采样、最近点、在赛道判定
    kart.js            # 加速、刹车、转向、漂移蓄力与迷你涡轮、草地减速
    race.js            # 检查点、圈数、单圈计时、排名比较器
    items.js           # 加速带、道具箱（蘑菇）
    ai.js              # 前瞻点转向的 AI 驾驶控制器
  render/
    scene.js           # renderer、灯光、地面、追车相机
    trackMesh.js       # 路面带状网格、起点线、围栏、检查点门、道具、树木
    kartModel.js       # 代码原生卡丁车模型（转向前轮、漂移侧倾）
    effects.js         # 漂移火花粒子（按蓄力档位变色）
  ui/
    hud.js             # HUD 与结算面板
    minimap.js         # Canvas 小地图
  styles.css           # 全屏画布与响应式 HUD
tests/                 # track / kart / race / items / ai 单元测试
```

## 设计说明

- 赛道由 13 个控制点的闭合 Catmull-Rom 样条采样为 182 个点，路面、围栏、小地图、检查点和 AI 寻路全部复用同一份采样数据。
- 排名按「累计通过检查点数」降序、再按「到下一检查点距离」升序比较，避免里程回绕的边界问题。
- 程序化 canvas 贴图（沥青、红白围栏、棋盘格起点线、加速带箭头），无外部资源依赖。
