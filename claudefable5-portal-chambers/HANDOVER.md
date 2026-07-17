# HANDOVER — claudefable5-portal-chambers

## 项目概况

| 项 | 内容 |
|---|---|
| 任务 | benchmark mission `portal`(冻结文档:`benchmark/tasks/code-to-3d/portal.md`) |
| 实现方式 | Three.js `^0.185` + 自写 AABB 物理(零物理库),JavaScript ESM,Vite `^8`,纹理/音效全程序化 |
| 作答模型 | Claude Fable 5(variant: chambers) |
| 端口 | **3034**(`vite.config.js` 固定,与 `benchmark/registry.json` 登记一致) |
| 启动 | 根目录 `npm run dev`(:3000 经 `/claudefable5-portal-chambers/`),或 `npm run dev:one claudefable5-portal-chambers` |

## 技术架构(文件职责)

| 文件 | 职责 |
|---|---|
| `index.html` | 中文 UI 骨架:HUD(准星/横幅/提示)/ 开始/暂停/通关遮罩 / 自测弹窗 / 过场标题卡 |
| `src/styles.css` | 光圈实验室深色主题(蓝橙双色强调) |
| `src/portal-math.js` | **传送变换纯函数**(零依赖):框架 P/N/U、X=U×N、local 翻转 (x,y,z)→(−x,y,−z)、transformPoint/Dir。冻结口径与任务文档一致 |
| `src/portal-test.js` | 10 组冻结用例 + `runPortalTests()`(页面按钮与 `__bench.portalTest()` 共用),容差 1e-6 |
| `src/physics.js` | 常量(g=16、走速 5、跳速 4.8)/ 射线-AABB / 逐轴移动碰撞(4 次迭代 + 台阶助爬 0.55,**仅着地状态**)/ 门洞穿透白名单 portalIgnoreSet(墙面门纵向按身高收紧、**方向敏感**:背侧窗口仅限 v·N<0 穿越中,防背面穿墙)/ 穿越判定 shouldTeleport(玩家用眼睛探针:水平门阈值 0.15、墙面门 0)/ 传送后脱困 depenetrate / 子步前最小平移轴脱嵌 expelFromSolids |
| `src/portals.js` | 传送门系统:放置校验(白面/尺寸钳制/同面重叠/消解栅挡弹)、门面 shader(漩涡占位/RT 透视 + 近距挤出)、**RT 虚拟相机渲染**(M=M_B·Flip·M_A⁻¹·M_cam + Lengyel 斜近裁剪),弹道 tracer |
| `src/levels.js` | 五间测试室数据(轴对齐盒 min/max/mat),含弹道与防作弊口算备注 |
| `src/world.js` | 关卡静态几何构建(按尺寸克隆贴图调 repeat)、灯光/灯板、编号招牌;disposeGroup 释放 |
| `src/objects.js` | Door(双扇滑门,关闭时挡人挡弹)/ Button(玩家或未携带方块压下)/ CubeObj(可搬运,溶解重生)/ Fizzler(过栅清门/溶方块)/ Elevator(出口区域) |
| `src/player.js` | 第一人称控制器(地面指数逼近 + 空中 Quake 式加速不吞动量、跳跃缓冲/土狼时间)、穿门姿态重定向(yaw/pitch 由变换后前向矢量反解)、发射器视图模型 |
| `src/game.js` | 主控:关卡装载/物理 1/120 固定步进/玩家与方块穿越(传送后脱困)/搬运(弹簧跟手 + 0.3s 脱手宽限)/按钮门链路/消解栅/跌落重生/电梯过场/`getState()` |
| `src/audio.js` | WebAudio 合成:双色射击、开门/关门、传送、按钮、消解、溶解、电梯、通关旋律、环境低鸣 |
| `src/ui.js` | HUD 状态(双色准星指示)/横幅/提示/过场/选关 chips(localStorage 解锁)/自测弹窗 |
| `src/main.js` | 装配:渲染器/输入(指针锁 + 失败回退)/尺寸每帧同步(嵌入式 0×0 窗格防护)/主循环(先渲染两张门 RT 再渲染主场景,门视野里隐藏枪模)/`__bench` |

## 核心机制备忘

1. **穿越语义(冻结)**:门正面 local z>0;A 背面 ↔ B 正面;速度模长不变。玩家穿越用**眼睛**做探针:水平门(地/顶)在眼睛距门面 0.15 时提前传送(防相机穿地),墙面门在过面瞬间传送(门盘近距挤出规避近裁剪)。
2. **门洞穿透**:双门激活时,实体处于门椭圆窗口内则宿主盒对它免碰撞;墙面门纵向窗口按身高收紧(门底高于脚 → 被墙挡,需跳入,与原作一致)。
3. **传送后脱困**:出口可能贴着高台/地板,沿出口 U/N/−U 方向 0.05 步进推出(≤1.25m);携带方块随玩家穿门时直接吸附回手上再脱困。
4. **搬运**:目标点 = 眼 + 前向 1.4(射线遇墙收短);弹簧速度 ≤13;距离超限有 0.3s 宽限(快速甩视角不脱手),自动脱手时速度截到 ±2 防甩飞。
5. **飞跃数值**:g=16,走入深坑眼睛下落 ≈6.5m → 门面处 ≈14.4 m/s;高墙门中心 y∈[5.6,7.8] 落点 z −3.0~−5.1,全面板带越过 **4.5m** 裂谷。防作弊口径:普通跳有效距离 = 中心跳距 3.0 + AABB 半宽 0.64 + 土狼 0.4 ≈ 4.04m < 4.5m,且台阶助爬只在着地时生效(空中无落点救援)。C5 背墙白板只开右半(x −0.5..4),飞行路径避开高架桥。
6. **消解栅**:玩家过栅清除**玩家放置**的门(固定门保留),携带方块溶解 0.45s 后回出生点;同一物理步内清门后,穿越循环有 `placed` 防护(防空引用)。

## 调试钩子(window.__bench)

```js
__bench.ready          // 初始化末尾同步置位
__bench.stepFrame(n)   // 推进 n 帧(1/60s)+ 渲染一次,返回 getState();隐藏标签页(rAF 停摆)用它驱动
__bench.getState()     // { chamber, name, mode, pos, vel, onGround, yaw, pitch, gun,
                       //   portals:{blue,orange}, carrying, buttons, doors, atExit, stats, fps }
__bench.portalTest()   // { passed, total } — 期望 {passed:10, total:10}
__bench.game           // Game 实例(loadChamber/shoot/interact/player 全可编程驱动)
```

自动化示例:`game.player.yaw/pitch` 直接设定瞄准 → `game.shoot(0|2)` → `game.player.keys.KeyW=true` + `stepFrame(n)` 走路。浏览器实测记录见 CHANGELOG(五关全通、12 连飞跃零异常、自测 10/10)。

## 已知限制

- 门只放在轴对齐面上(本仓关卡无斜面);门内递归只做一层(门中门显示漩涡占位,任务 L4 项部分满足)。
- 方块视觉恒轴对齐(无翻滚旋转);玩家推不动地上的方块(可拾取/可站上去)。
- 指针锁在无头自动化环境不可用(属环境限制),游戏可全程用 `__bench` 编程驱动;真实浏览器正常。
- 嵌入式浏览器窗格以 0×0 初始化时依赖每帧 `syncSize()` 恢复(已处理,勿删)。

## 后续可做

- 门中门真递归(2-3 层 RT 链)、穿门瞬间视角滚转插值。
- 高能弹球/激光转向方块等更多 Portal 元素;第 6+ 间测试室。
- 方块刚体旋转(穿门时角动量同样变换)。
- GLaDOS 风格旁白字幕系统(现有横幅可扩展)。
