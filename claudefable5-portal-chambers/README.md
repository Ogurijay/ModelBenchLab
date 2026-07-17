# 传送门 · 五间实验室 — Claude Fable 5

参照 Valve《Portal》(PC)核心玩法的网页复刻:第一人称双色传送门、透过门实时看到另一侧、
动量守恒飞跃(speedy thing goes in, speedy thing comes out)、方块/按钮/滑门/消解栅/电梯,
5 间递进式测试室。冻结任务文档:[`benchmark/tasks/code-to-3d/portal.md`](../benchmark/tasks/code-to-3d/portal.md)。

## 启动

仓库根目录统一方式(单端口):

```bash
npm run dev          # 门户 :3000,本项目经 http://localhost:3000/claudefable5-portal-chambers/
npm run dev:one claudefable5-portal-chambers   # 或用登记端口 3034 单独调试
```

## 操作

| 键位 | 功能 |
|---|---|
| WASD / 方向键 | 移动 |
| 鼠标 | 视角(点击开始后锁定) |
| 空格 | 跳跃 |
| 左键 / 右键 | 发射蓝色 / 橙色传送门(仅白色面板可附着) |
| E | 拾取 / 放下方块 |
| R | 重置本测试室 |
| Esc | 暂停菜单(继续 / 重置 / 自测 / 选关) |

## 五间测试室

1. **苏醒** — 固定门教学:走进蓝门,从橙门出来
2. **单色传送** — 只有蓝色发射器,橙门固定挂在高台上
3. **方块与按钮** — 用双门把高台上的方块带下来压按钮开门
4. **动量守恒** — 一扇门打深坑底、一扇打身后高墙,跳坑飞跃 3.5m 裂谷
5. **综合测验** — 飞跃取方块,走高架桥回程,压按钮通关

跌落检修区会自动重新部署(不软锁);出口走廊的消解栅会清除玩家放置的门并溶解携带的方块。

## 客观自测

页面「传送逻辑自测」按钮(开始/暂停面板)运行 10 组冻结用例
(见任务文档,判定容差 1e-6),期望 **10/10 全过**。
传送变换是独立纯函数模块 `src/portal-math.js`(零依赖,不引 three/DOM)。

## 调试钩子

```js
__bench.ready          // true = 初始化完成(同步置位)
__bench.stepFrame(n)   // 推进 n 帧(1/60s)并渲染,返回 getState();隐藏标签页时用它驱动
__bench.getState()     // { chamber, pos, vel, portals, carrying, buttons, doors, atExit, stats, fps }
__bench.portalTest()   // { passed: 10, total: 10 }
```

## 技术要点

- three.js `^0.185`,JavaScript ESM,Vite `^8`;物理自写(AABB + 固定 1/120s 步长),零物理库、零外部资产(纹理/音效全程序化)
- 门内透视:每扇门一张全屏 RenderTarget,虚拟相机 = 主相机经穿越变换(M = M_B·Flip·M_A⁻¹·M_cam),Lengyel 斜近裁剪面剔除出口门背后的几何,门面按屏幕空间 UV 采样
- 穿越保动量:位置/方向/速度统一走 `portal-math.js` 纯函数;贴近门面时门盘朝观察者挤出,规避近裁剪面穿帮
