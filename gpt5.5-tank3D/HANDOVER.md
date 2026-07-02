# GPT Tank 3D 交接文档

## 当前状态

- 已实现 3D 网页版坦克大战，目录：`E:\Web3dTest\gpt5.5-tank3D`。
- 已包含前 10 关关卡数据，关卡尺寸沿用经典 26 x 26 网格。
- 已实现玩家坦克、敌方坦克、子弹、砖墙破坏、钢墙阻挡、水域、树林、冰面、基地失败、生命失败、过关推进。
- 已提供键盘和触屏控制，HUD 使用 DOM 低遮挡布局。

## 技术结构

- `src/game/content/levels.ts`：10 关地图和敌人队列。
- `src/game/simulation/GameSimulation.ts`：规则仿真，包括移动、碰撞、AI、胜负和进度。
- `src/render/adapters/RenderBridge.ts`：把仿真快照同步为 Three.js 3D 画面。
- `src/game/input/InputController.ts`：键盘/触屏输入映射。
- `src/ui/hud.ts`：关卡、生命、基地、敌人余量和菜单提示。
- `tests/simulation.test.ts`：关卡尺寸、路径可达性和 10 关进度 smoke test。

## 调试入口

浏览器控制台可访问：

```js
window.__tankGame.snapshot()
window.__tankGame.forceWin()
window.__tankGame.loadLevel(9)
```

这些接口只用于测试和验收，不在玩家界面显示。

## 已知限制

- 3D 模型为程序化几何体，不依赖外部 GLB 模型资源。
- 敌方 AI 是轻量规则 AI，不是寻路算法；它会朝玩家或基地推进，并用子弹清理砖墙。
- 未实现经典版道具系统、双人模式和分数榜持久化。

## 后续建议

- 若继续增强，可以加入道具：星级火力、暂停敌人、基地加钢墙。
- 若关卡难度要更贴近原版，可把敌方总数提升到 20 并加入更密集的装甲敌人。
- 若要提升观感，可以替换为 GLB 坦克模型，但仍建议保持当前仿真/渲染分层。
