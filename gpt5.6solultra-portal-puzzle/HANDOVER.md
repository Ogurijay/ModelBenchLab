# HANDOVER — 折跃实验场

## 当前状态

- 项目目录：`gpt5.6solultra-portal-puzzle`
- 模型：GPT 5.6 SOL Ultra
- mission：`portal`
- variant：`puzzle`
- 独立调试端口：`3035`（Fire 使用 `3032/3033`，Claude Portal 使用 `3034`）
- 技术栈：Vanilla JavaScript、Three.js 0.185、Vite 8
- 资源策略：全部程序化，无外部纹理、模型、字体文件或音频文件

当前实现是一间完整的原创工业试验舱，玩法链为：

`部署双锚点 → 通过玻璃瞄准密封舱授权面 → 折跃进入 → 搬出相位立方体 → 压住压力平台 → 出口开门 → 通关`

## 架构

| 模块 | 职责 |
|---|---|
| `src/main.js` | 渲染器、固定时间步循环、输入事件和 `window.__bench` 装配 |
| `src/game/GameSimulation.js` | 玩家 / 立方体运动、碰撞、机关状态、目标推进与传送自测 |
| `src/game/portalMath.js` | 可单测的位置、向量、越面检测和面板约束纯逻辑 |
| `src/render/PortalSystem.js` | 双门放置、实时渲染目标、虚拟相机和传送触发 |
| `src/world/Facility.js` | 程序化试验舱、授权面、密封舱、压力平台、门禁和立方体外观 |
| `src/input/InputController.js` | Pointer Lock（指针锁定）、WASD、一次性按键动作和视角 |
| `src/ui/UIController.js` | 中文进入页、HUD、目标、交互提示和通关界面 |
| `src/audio/AudioSystem.js` | Web Audio 合成射门、折跃、机关和通关提示音 |

## 核心约定

- 门局部坐标的 `right / up / normal` 必须保持正交单位向量。
- 位置、朝向和线速度都使用同一翻转规则：入口局部 `(x, y, z)` 映射为出口局部 `(-x, y, -z)`。
- 玩家采用中心点 + `halfExtents = (0.34, 0.9, 0.34)` 的运动学 AABB。
- 传送触发使用“上一状态在门前、本步支撑点越过门面、中心在椭圆孔内”三条件，并有 `0.18s` 冷却。
- 渲染时间和仿真时间分离；`FIXED_DT = 1 / 120`，后台恢复会清空累加器和输入。
- 根目录入口必须使用相对路径，保证 `/gpt5.6solultra-portal-puzzle/` 子路径可运行。

## 自动化接口

`window.__bench` 提供：

- `ready: true`
- `stepFrame(n)`：以固定时间步推进并返回状态
- `getState()`：返回玩家、立方体、双门、按钮、出口和通关状态
- `resetLevel()`：清除双门并完整复位所有动态状态
- `teleportTest()`：返回 5 组运行时边界断言；`portalTest()`：返回冻结题面的 10 组标准断言

## 已知限制

- 门内视图采用一层实时渲染，不做无限递归，避免帧率随“门中门”指数下降。
- 碰撞系统是确定性的运动学 AABB，不模拟立方体旋转惯量。
- 视觉门洞通过穿越前触发实现，墙体网格本身没有做布尔切洞；从门背面不能穿越。
- 当前交付是一间完整谜题，不包含五个独立房间；若要严格追随仓库中并发建立的五室 Portal 冻结题面，可在保持数学与渲染模块不变的前提下扩展 `Facility` 和目标状态机。

## 建议后续

1. 为实时门视图加入 oblique clipping（斜近裁剪），进一步消除极端角度下出口墙面穿帮。
2. 扩展为五个独立试验室，并加入动量飞跃专用高台。
3. 加入可脚本化的放门 / 设位姿 bench 方法，自动跑完整解谜路线。
4. 在真实移动设备上补充触控双摇杆；当前 UI 仅对窄屏做布局降级。
