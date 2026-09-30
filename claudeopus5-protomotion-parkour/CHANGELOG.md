# CHANGELOG — claudeopus5-protomotion-parkour

## 2026-08-03 初版实现 + 同日核查修复轮

mission `protomotion` 的 Claude Opus 5 作答(variant: parkour)。
被移植对象:`E:/EpicGames/Projects/ProtoMotion_Lab`(UE 5.8,纯 C++,无蓝图),
移植规格与单一事实源:`docs/PORT_SPEC.md`。锚定 **2026-08-03 18:28 的上游移动系统快照**。

### 架构

- **世界沿用 UE 的厘米 + Z-up + X 前 / Y 右 / Z 上,不做任何单位换算。**
  这是全项目最重要的一条决定:一旦换算,40 多个手感常量、17 组关卡坐标、13 组传送点、
  每条断言的期望值都要跟着换,而这类移植最常见的失败模式就是单位/朝向换算,不是算法错。
  代价由渲染层承担(`camera.up=(0,0,1)`、自己算弹簧臂、阴影 bias 按厘米给、雾密度按厘米反解)。
- **身份层与物理层解耦**(`MotionState` × `MOVE_MODE`):滑翔在物理上仍是 `Falling`,
  身份是 `Gliding`;只有贴墙用 `MOVE_Custom` 的三个子模式。照 UE 原文,这是那套系统的核心。
- **引擎替身**(`sim/collision.js` + `sim/body.js`)顶替 `CharacterMovementComponent`:
  Walking / Falling / Custom 三套物理、`CalcVelocity`、StepUp、`FindFloor` + 贴地、
  `SlideAlongSurface`。八处相对 UE 的简化都在 HANDOVER §2.2 列了**失真条件**。
- **碰撞扫掠用保守推进(conservative advancement),不用子步长。** PORT_SPEC §6.1 建议
  "按最小厚度定子步长",没照做:场地最薄的盒 50 cm,而自检里有 6000 cm 自由落体和传送,
  单次查询长度能到上万厘米,按 25 cm 一步要走几百步,慢且仍然只是"大概不穿"。
  保守推进有严格证明(沿分离方向的间隙随位移以恒定速率减小 ⇒ `d/c` 永远落在真正首次接触之前),
  **盒厚薄无关,不需要为薄板调参**。副产物:`closing <= 0` 的盒沿这条射线永不可达可直接剔除,
  于是"贴地水平移动不被地板挡住""已嵌入但正在往外走不算阻挡"是免费的 ——
  `body.js` 不需要写"忽略脚下地面"之类的特例。
- **`sim/movement.js` 是 `EvaluateTransitions` 的逐句移植**:十步顺序不动、每个 `return` 的位置
  不动、每个 `return` 前补齐 UE 有而 PORT_SPEC 漏写的 `UpdateMotionState()`、
  翻滚"先判后减"、`bWasFalling` 的赋值时机、`VaultCooldown` 递减落在"已贴墙 return"之后。
  三条贴墙轨道之间的切换**同帧立即执行**(跑墙掉到交接线那一帧直接调 `physClimb`),照 UE。
- **仿真层零浏览器依赖**,所以自检在 node 与页面上跑的是同一份 `runSelfTest()`
  (`tests/run.mjs` 第 6 节按依赖闭包静态验证)。固定步长 1/120,自检与渲染共用。
- **动画层用 `AnimationMixer` 的两个 `AnimationAction` 顶替 UE 的原生 `FAnimInstanceProxy`**,
  但权重曲线照 UE 公式 `alpha = 1 - remaining/duration` 手算,不用 three 的 `crossFadeTo`
  ——那是 mixer 自己的曲线,会和 UE 对不上。

### 内容

- 十一种能力:走 / 跑 / 冲刺 / 跳 / 滑翔 / 跑墙 / 攀爬 / 墙跳 / 下滑 / 翻滚 / 翻越。
- 17 个关卡结构,坐标逐字段照抄 `Tools/build_test_map.py`。没有一个是装饰。
- 真实角色:`Alex_ProtoMotion.glb`,**118 条动画**,16 个槽位全部存在;
  `meshYaw` 按 UE `import_alex.py` 的同一办法(两只脚脚尖减脚踝取平均)在载入时量出 **+90°**。
- HUD 四行读数 + FPS + 轨迹面板(UE `-ProtoTrace` 等价物,每 0.25 s 一行、列宽同 UE);
  开始 / 暂停 / 自检三块面板;指针锁作为暂停的事实源。
- `window.__bench = { ready, info, state, press, hold, release, teleport, step, selfTest,
  shot, start, pause, restart, trace, internals }`。
- 三套无头测试共 **315 条断言**:`run.mjs` 111 / `collision.test.mjs` 112 / `body.test.mjs` 92。

### 验证

- `node tests/run.mjs` → **13/13 自检通过,111 ok / 0 FAIL,退出码 0**。三次运行 stdout 逐字节一致。
- 关键读数:run 700 / sprint 1500 / 滑翔 1200 与 −261.1 / 下滑 −380.00 /
  墙跳精确 `(620, 0, 800)` / 攀爬段上升 700(= `ClimbUpSpeed` = `RunSpeed`,312 帧)/
  跑墙 43 帧上冲 1238 掉到 713 交接 / 不可攀爬板前停在 0.02 cm 且 0 帧 `Climbing` /
  翻越 `ledgeEvent` 发 1 次最终 x = 2428 / 站立 z 恒 94.02。
- 40 与 80 cm 分水岭:`Low_Step_40cm` 站上 z = 134 并越过;`Low_Step_80cm` 挡在 x = 957.98、
  站立 z 从未超过 94.02。哨兵:恰好 55 cm 迈得上、57 cm 迈不上。
- `collision.js` 的 `time` 与暴力二分求得的真 TOI 逐个比对(8 个用例,误差 < 1e-5 cm 且从不越过);
  160 条随机扫掠的不变量;40000 次含刻意掠射的扫掠里最大迭代 9 次(上限 64)。
- Fuzz(固定种子,8 起点 × 60 s = 57600 步):0 NaN、最低 z 恒 94.02、最大残留穿透 0.000 cm、
  9 种状态全出。`dt = 0 / -1 / NaN`、NaN 输入、零厚盒、零长扫掠、±1e6 cm 位移、1e7 cm 高空、
  传送进墙心、`dt = 10` 巨步全部有限。
- 性能 0.89 µs/仿真步(单帧最坏 8 步 ≈ 0.007 ms)、约 160 B/步;整套 13 项自检 3600 步约 20 ms。
- 页面侧:用 DOM 打桩把 `main.js` 的逐字副本在 node 里真启动过一遍
  (仅 stub `gfx/scene.js` 的 WebGL 部分):启动 / 开始 / 暂停 / 重开 / W 跑动 / 0 步帧按跳不丢 /
  单帧 5 s 只推进 66.7 ms / T 轨迹 / 自检面板 13 行 / `__bench.selfTest` / `shot` /
  rAF 停摆兜底 tick 全通;并打通 fetch + img + self 验证了真实 GLB 路径
  (`degraded=false`、118 条片段、`missingClips` 空、`meshYaw 90`、脚尖在 yaw0 朝 +X、
  yaw 传导 Δ=90.00、脚底恰在胶囊底、按 W 出 `Run` 片段)。
  **真实 WebGL 下的观感仍未目视确认**(见 HANDOVER §1)。

### 实现期修复

- **一次性意图在渲染帧里消费** → 高刷屏上跑 0 仿真步的那一帧会把跳跃吃掉,
  `__bench.step()` 也永远跳不起来。下移到 `applyIntent()`(仿真步内)。
  修前实测「按跳 → `Idling`, vz 0」,修后「`Jumping`, vz 296」。
- `Overlay` 与 `InputState` 抢指针锁(后者默认 `autoPointerLock: true`)→ 构造时关掉,
  改由 Overlay 独家管理(它拿指针锁当暂停的事实源),另加 canvas `pointerdown` 补锁救生路径。
- `rig.js` 不自己 `scene.add` 也没有 `sync`(与伪代码不符)→ `main.js` 自建 `syncCharacter()`:
  `position = 胶囊中心 + (0,0,-94)`、`quaternion = Rz(bodyYaw + meshYaw)·Rx(90°)`。
- 胶囊退化替身做成与 rig 返回值**同构**(原点在脚底、内容按 Y-up 摆),`syncCharacter()` 因此零分支。

### 核查修复轮(同日,多维审查 + 对抗验证)

审查提出 20 余条,以下为确认并已修复的。每条都做了**反事实检验**(把修好的东西改坏,
确认断言真的变红);`tests/run.mjs` 的断言数 73 → **111**。

**正确性**

- `protoCourse.js` 的 `ueRotatorToQuaternion` **pitch/roll 符号反了**,得到一份镜像几何 →
  改成 `Rz(yaw)·Ry(−pitch)·Rx(−roll)`,并用 UE `FRotationMatrix` 三行在 6 组角度 × 3 轴上逐位验证。
  同时删掉 `gfx/scene.js` 里另写的一份 `ueRotatorForward` 三角式、改为过同一个四元数 ——
  **两份同功能实现互相矛盾的根因就是各写一遍**。`collision.test.mjs` 里 6 条写死镜像期望值的
  断言已按 UE 正确值更新(局部 +X 面法线 `(0.8660, 0, +0.5)`、倾斜顶面 `(−0.5, 0, 0.8660)`)。
- `main.js` 的 rAF 循环**没有防抛保护**,且全局 error 处理器用不透明载入层**永久盖住页面**
  (一次瞬时异常 = 页面永久变黑)→ `frame()` 先 `requestAnimationFrame` 再 `try/catch`;
  加 `booted` 标志分流:启动阶段仍走 `#loading` 并锁住(否则"永远转圈"),
  启动完成后改走不挡视线的顶部横幅。
- GLB 取件**无超时**,挂住时载入层不收 → `AbortController` + 按**无字节增长**计时(20 s,
  不是限总时长,慢网不该被误杀,每个 chunk 续命)+ `GLTFLoader` 退路加 60 s 最后期限。
- 自检面板在**后台标签页里锁死**(`await requestAnimationFrame` 永不触发)→
  改成 rAF 与 `setTimeout(200 ms)` 赛跑,`_running` 与按钮禁用一定被 `finally` 放开。
- `tryJump()` 墙跳分支多派生了一次身份 → 删掉,身份回归"由 `ExitWall` 里 `SetMovementMode`
  那一刻的旧 `vz` 派生"(UE 语义)。
- `resetForTeleport` 走 `exitWall` 且注释理由不成立 → 改成无条件 `_setPhysicsMode(Falling)`
  (= UE `BeginStep` 的前两句)。判别式:传送后 `ClimbVertical` 仍保留 1。

**测试诚实性(这一组最重要:它决定"13/13"这四个字值多少)**

- **第 6 项(fall)是空断言** —— 期望的 `Falling` 由传送簿记在第 0 帧就写好了,
  一步物理都不用跑(重力置 0 它仍报通过)。而第 5 节自称"诚实性下限"却恰好漏掉第 1、6 项。
  → 补 5 + 4 条硬断言,全用**字面量**不拿 `ENGINE.Gravity` 反算。反事实:重力置 0 → 4 条红。
- **`getMaxSpeed()` 一条字面值断言都没有** → 补 9 条(WallRun 1470 / Climb **920** /
  WallSlide 600 / Falling 1500 / 滑翔 1200 / Walking 700·260·1500 / 翻滚 1100)。
  反事实:墙面常量退回 320/420/240/300 → 这条 + 第 9 项当场红。
- 第 11 项的守卫**只盯时刻不盯来源**(把贴墙彻底关掉后它靠一次普通地面跳照样绿)→
  加 `beforeJump`/`afterJump` 钩子 + 3 条断言。反事实:`PushIntoWallDot` 改 1.5 → 2 条红。
- 第 5 节多条断言**拿 TUNING 常量校验由同一常量算出的观测值**,自指而免疫 →
  全部补双边字面量。反事实:`SprintSpeed` 改 700 → 3 处红;`GlideMaxDescendSpeed` 改 5000 → 红。
- 第 9 项打印的 `ascent 744` 其实是**翻越弹射**的数不是攀爬的数 → `selftest.js` 新增
  `climbPeakAscent` / `climbFrames`(只统计 `Climbing` 帧),门槛判定改用它,两个数都印。
- 第 7 节纳入上游两套测试时**只看退出码** → 加断言条数下限(collision > 100 / body > 80)。
- 常量对齐检查硬编码 `E:` 盘 → 改 `process.env.PROTOMOTION_UE_HEADER || <默认>`。
- 第 3 节新增三条:实测 `Angle_00/15/30deg` 大面法线全是 `(0,−1,0)`、`|n.z| = 0`,
  断言名里直接写"§4 表的期望值在源几何下就不成立"(见下面「发现」)。

**补齐的 UE 行为**

- `BrakingFrictionFactor = 2.0`(UE 引擎默认,制动时摩擦翻倍)→ 700 cm/s 松手刹停从
  38.1 cm / 0.150 s 变成 **22.77 cm / 0.108 s**(UE 约 27.5 / 0.108)。
- `AirControlBoostMultiplier = 2.0` / `AirControlBoostVelocityThreshold = 25` →
  低速时空中控制翻倍。副作用:自检第 2 项的空中段峰值从 114 变成 **130**,
  **比修前更接近 UE 参考值 125**。
- 朝向改成跟随**加速度(输入)方向**、加速度近零时保持当前朝向,且在 `moveFalling` 里也生效
  (UE `ComputeOrientToMovementRotation` + `PerformMovement` 无条件调 `PhysicsRotation`)。
  这一条是相对 PORT_SPEC §6.2 的**有意偏离**,已记入 HANDOVER §5.2。
- 这四个是 UE **引擎**默认值,不在 PORT_SPEC §1 的手感常量表里,所以放在 `src/sim/body.js`
  而**不是** `protoTypes.js` —— 后者只装"UE 工程作者调过的手感数字"。这个分界要守住。

**文档 / 工程**

- `InputState` 偏离 PORT_SPEC §10 的签名 → 补三个**只读别名**(`yaw` / `jumpPressed` /
  `rollPressed`,只看不消费)+ §10 伪代码里的 `apply(movement)`;`main.js` 改为委托 `input.apply()`。
- `index.html` 的"109 条动画" → 改为 **118**(解析 GLB 的 JSON chunk 复核过)。
- 新增 `README.md` / `HANDOVER.md` / `CHANGELOG.md` —— 仓库 `RULES.md` §3 要求前两份,
  `benchmark/registry.json` 已声明 `docs: {readme, handover, changelog}` 三项俱全(此前是假信息)。

### 核查阶段的发现(不是缺陷,但必须记档)

- **`Angle_15deg` / `Angle_30deg` 的期望值在 UE 侧就不成立。**
  `build_test_map.py:179` 传的是 `FRotator` 的 **Pitch**(绕 Y),而那三块是 `size=(10,1,12)`
  的**沿 Y 薄板**,大面法线本来就朝 ±Y —— 绕 Y 旋转把 ±Y 映射到 ±Y,**法线一动不动**。
  实测三块的大面法线都精确是 `(0, ±1, 0)`、`|n.z| = 0`,照 `WallMaxNormalZ = 0.35` 的判据
  **三块都会被判成可攀爬的墙**,PORT_SPEC §4 表里"`Angle_30deg` 必须拒绝"那一格无法复现。
  想让板面倾斜该传 **Roll**(绕 X)。UE 的 13 项自检没有一步打角度架
  (墙面三项打的是 `Climb_20m`),所以这个错在 UE 侧一直没暴露。
  **本移植照原样移植 Pitch** —— 这是对照实现,不擅自改几何。不影响 13 条断言:
  自检第 12 项用的是带 `unclimbable` 标签的板,拒绝靠标签而不是法线。
  代价是"法线阈值拒绝"这条路径**没有测试覆盖**,想验证请另做一块 `roll=30` 的结构。
- **`WallRun` / `WallTop` 两个动画槽位在本关卡下一次都放不出片段。**
  `WallEnter` 片段 `supersol_loco_air_trans_wall` 实测 0.667 s,而跑墙窗口
  (1250 − 700) / 1500 = 0.367 s(实测 43 帧 = 0.358 s);取消表规定 `WallEnter` 只在
  "已不贴墙"时取消,交接到 `Climb` 时人还在墙上 ⇒ one-shot 全程独占轨道。
  状态层正确(`Wallrunning → Climbing` 都出现)。**UE 现版同样放不出来**,忠实继承。
- **上游在移植期间仍在改动。** `WalkSpeed` 260 → 140 与整张动画表换成 Alex 本人动作
  (参考速度改成量出的原速、playRate 钳到 2.5)是**同一次**改动,mtime 18:49,
  落在本移植的 18:28 快照之后 → 按锚定规则**不跟**。
  `node tests/run.mjs` 会永久亮一条 `⚠ 常量漂移 WalkSpeed:UE 现值 140 vs 本项目 260`,
  **不计入失败、不影响退出码**。它的存在证明这个检查真在盯着上游。
- **`docs/PORT_SPEC.md` 有 5 行伪代码化石**(§2.5 的 640、§3.3 的 300、§3.4 的 320/420/240),
  与同一份文档 §1.6 的表(700/700/500/700)自相矛盾。代码按 §1.6 与 UE 头文件实现,
  正确值已被 9 条 `getMaxSpeed()` 字面值断言钉住。该文件在禁改清单里,
  待办与建议改法列在 HANDOVER §5.1(建议一律写符号名不写字面量 —— 化石正是字面量造成的)。
- **判定为误报**:相机 `ProbeSize 20 vs UE 12`(注释里早已登记理由)、
  `MIN/MAX_FLOOR_DIST` 常态悬空未实现(注释已写明 94.02 vs UE ≈96,只登记不改)、
  "快照被两套标准解释"(动画表与 `WalkSpeed` 是同一次改动,只有一条规则)、
  "墙面常量是未披露的偷改"(`protoTypes.js` 注释原文就写着,且 UE 自检自身的
  `MinPeakAscent = 650` 正是配 `ClimbUpSpeed = 700` 的)。

### 未通过项

无。三套测试当前全绿(111 + 112 + 92 = 315 条断言,0 FAIL)。

### 真实浏览器验证轮(同日,主会话用 Playwright 实机跑)

上一节写的「未验证区」已经关掉:在 `http://localhost:3000/claudeopus5-protomotion-parkour/`
用真实 WebGL 跑过,**控制台 0 错误 0 警告**,133 fps。

实机确认:

- `__bench.info()` → `degraded:false` / `clipCount:118` / `missingClips:[]` / `meshYawDeg:90` / `blocks:17`。
  Alex 正常蒙皮、朝向正确、**没有那条重复手臂**(新 GLB 已删 `prim3`)。
- 冲刺撞墙链路:`Running`(`alex_loco_run_n_3`)→ `Wallrunning` 上冲峰值 **1238** →
  在 `vz = 700` 处交接 `Climbing`。与 node 自检逐位一致。
- 滑翔:水平钳 **1200**、下降钳 **−261**,与 UE README 的参考值一致。
- 翻越:`Running` → `Jumping`(`infect_climb_up_ledge`)于 t=0.61,弹到 z=238,落地后越过 80 cm 砖继续跑。
- 页面上的「运行 13 项自检」→ **13/13**,数值与 `node tests/run.mjs` 相同(页面与 node 共用同一份
  `runSelfTest()`,这是设计目标,现已实证)。

两处实机才暴露、已修:

1. **掉出世界无法恢复**(`src/main.js`)。地板只有 400 × 400 m,冲刺十几秒就跑出边缘,
   之后一直往下掉、永远回不来 —— 实测掉到 **−2176 m** 仍在加速,只能靠暂停菜单手动重开。
   补了 `KILL_Z = -5000` 的自动回出生点,即 UE `WorldSettings.KillZ` + 世界边界检查的等价物。
   验证:传送到地板外自由落体 5 s(z = −24041)→ 下一渲染帧被捞回 `(0, 0, 120)`。
2. **`THREE.PCFSoftShadowMap` 在 three r185 已废弃**(`src/gfx/scene.js`),内部退回
   `PCFShadowMap` 并每次启动打一条警告。直接改用 `PCFShadowMap`,控制台恢复干净。

仍未覆盖:指针锁下的真实鼠标视角往复、长时间游玩的显存/GC 表现、非 Chromium 浏览器。

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。
