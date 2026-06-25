# GPT Kart Circuit

这是一个 Three.js（Web 3D 图形库）街机卡丁车游戏测试用例。它借鉴“轻松、夸张、可漂移”的卡丁车竞速类型，但不使用任何 Mario / Nintendo 的角色、名称或素材。

这一版按 `game-studio:three-webgl-game` 的边界重做：simulation（模拟状态）不藏在 Three.js mesh（网格对象）里，render graph（渲染图）只负责表现，HUD（抬头显示）留在 DOM，追车相机和赛道边界都有明确模块。

## 玩法

- `W` / `ArrowUp`：加速。
- `S` / `ArrowDown`：刹车或倒车。
- `A` / `D` 或左右方向键：转向。
- `Space`：漂移。
- `R`：重置比赛。

目标是在 3 圈内沿着赛道依次穿过检查点门，并收集发光 boost（加速）环。开出赛道会撞上边界并掉速；漂移蓄满后松开会触发 mini-turbo（小喷）。

## 技术点

- Three.js 低多边形 3D 赛道、连续护栏、路肩、方向箭头、树、检查点门和卡丁车。
- Chase camera（追车相机）：相机跟随车辆并看向车头前方。
- DOM HUD（抬头显示）：展示圈数、速度、时间和 boost 状态。
- Simulation（模拟逻辑）与 Render（渲染逻辑）分离：车辆、边界碰撞、漂移小喷、检查点和道具逻辑可用 Vitest 单独测试。

## 运行

```powershell
npm install
npm run dev
```

默认地址类似：

```text
http://127.0.0.1:5173/
```

如需避免端口冲突，可以指定端口：

```powershell
npm run dev -- --port 5174
```

## 验证

```powershell
npm test
npm run build
```

## 结构

```text
src/
  main.js              # 游戏启动、输入、循环和状态连接
  simulation/
    kart.js            # 车辆控制、漂移、越界减速
    race.js            # 检查点、圈数、boost 道具
  render/
    scene.js           # renderer、camera、lights、ground
    track.js           # 赛道、检查点门、道具和装饰
    kartModel.js       # 代码原生卡丁车模型
  ui/
    hud.js             # HUD 更新
  styles.css           # 全屏画布和响应式 HUD
tests/
  kart.test.js
  race.test.js
```
