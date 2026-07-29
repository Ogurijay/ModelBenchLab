# 传送门 · 递归门景 — Claude Opus 5

参照 Valve《Portal》(PC) 核心玩法的网页复刻。冻结任务文档:
[`benchmark/tasks/code-to-3d/portal.md`](../benchmark/tasks/code-to-3d/portal.md)。

与同题其它作答的区别在两处架构选择:

- **门是真的洞**:放门时把门口那块矩形棱柱从墙体里做布尔减法减掉,碰撞世界与可通行区域天然一致;
  门口以外的墙面任何时刻都是实心的,门背面另有一块「只对身处背面者生效」的背板封住。
- **两层递归门景**:门里看到的画面里还有一扇门,再往里还有一层(RT 链 + Lengyel 斜近裁剪面)。

## 启动

```bash
npm run dev          # 仓库根单端口 :3000,本项目在 /claudeopus5-portal-recursive/
npm run dev:one claudeopus5-portal-recursive   # 或用登记端口 3045 单独调试
```

无头回归测试(在本目录下,不需要浏览器):

```bash
npm test
```

## 操作

| 键位 | 功能 |
|---|---|
| WASD / 方向键 | 移动 |
| 鼠标 | 视角(点击开始后锁定指针) |
| 空格 | 跳跃 |
| 左键 / 右键 | 发射蓝色 / 橙色传送门(只有白色面板能附着) |
| E | 拾取 / 放下储物方块 |
| R | 重置本测试室 |
| Esc | 暂停菜单(继续 / 重置 / 自测 / 门中门层数 / 选关) |

## 五间测试室

1. **苏醒** — 两扇固定门挂在同一面墙的两端,断崖对面就是出口:先理解「两扇门是同一个洞的两面」
2. **单色发射器** — 只有蓝枪;橙门固定在 3.4m 高台上方,自己找一面白墙开路
3. **方块与按钮** — 方块在 3m 深坑里,坑壁与房间墙都是白的:开一对门把它带上来压住按钮
4. **动量守恒** — 门打在地面白板与发射墙上,从 7.5m 高台冲下去落进地面门,横越 10m 深渊
5. **综合测验** — 飞到对岸取回方块,压住按钮开门,穿过消解栅进电梯

跌入检修区会自动重新部署;消解栅会清除玩家放置的门并溶解手上的方块。

## 客观自测

开始 / 暂停面板上的「传送逻辑自测」按钮运行任务文档冻结的 10 组用例(容差 1e-6),期望 **10/10**。
传送变换是零依赖纯函数模块 [`src/core/transform.js`](src/core/transform.js),
第 2 组用例额外交叉校验「4×4 矩阵路径(渲染用)与纯函数路径(物理用)结果一致」。

## 调试钩子

```js
__bench.ready          // 初始化完成(同步置位)
__bench.stepFrame(n)   // 推进 n 帧(1/60s)并渲染,返回 getState()
__bench.getState()     // { chamber, pos, vel, speed, onGround, portals, carrying, cubes,
                       //   buttons, doors, stats, fps, portalDepth, drawCalls }
__bench.portalTest()   // { passed: 10, total: 10 }
__bench.game           // Game 实例,可编程驱动(load / shoot / interact / player.keys)
```

## 技术要点

- three.js `^0.185` + Vite `^8`,JavaScript ESM;物理自写(AABB + 固定 1/120s 步长),零物理库、零外部资产
- 关卡几何、门洞、窗洞、传送门开口全部由同一套盒布尔减法生成,渲染与碰撞共用一份数据
- 每种材质合并成一个 BufferGeometry(每帧 5 遍场景渲染,主通道只有 6~27 次 draw call)
- 掉帧时自动把门中门降到 1 层;也可在菜单里手动切换
