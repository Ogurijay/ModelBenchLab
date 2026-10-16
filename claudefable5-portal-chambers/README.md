<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/claudefable5-portal-chambers/ 。
并行开发（仓库根目录）：`npm run dev:one -- claudefable5-portal-chambers`，访问 http://localhost:3034/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 传送门 · 五间实验室 — Claude Fable 5

参照 Valve《Portal》(PC)核心玩法的网页复刻:第一人称双色传送门、透过门实时看到另一侧、
动量守恒飞跃(speedy thing goes in, speedy thing comes out)、方块/按钮/滑门/消解栅/电梯,
5 间递进式测试室。冻结任务文档:[`benchmark/tasks/code-to-3d/portal.md`](../benchmark/tasks/code-to-3d/portal.md)。

## 启动

仓库根目录统一方式(单端口):

```bash
npm run dev          # 门户 :3000,本项目经 http://localhost:3000/claudefable5-portal-chambers/
npm run dev:one -- claudefable5-portal-chambers   # 或用登记端口 3034 单独调试
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
