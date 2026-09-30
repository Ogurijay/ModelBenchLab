# HANDOVER — claudeopus5-protomotion-parkour

最后更新:**2026-08-03**
被移植对象:`E:/EpicGames/Projects/ProtoMotion_Lab`(UE 5.8,纯 C++,无蓝图)
移植规格(单一事实源):[`docs/PORT_SPEC.md`](./docs/PORT_SPEC.md)

---

## 1. 当前状态

### 能跑的

| 项 | 状态 | 证据 |
|----|------|------|
| 13 项自检(无头) | **13/13** | `node tests/run.mjs` → 111 ok / 0 FAIL / exit 0 |
| 13 项自检(页面) | 能跑 | 「运行 13 项自检」按钮调的是同一个 `runSelfTest()`(`main.js` 注入 `overlay.onRunSelfTest`) |
| 碰撞世界 | **112 ok / 0 FAIL** | `node tests/collision.test.mjs` |
| 引擎替身物理 | **92 ok / 0 FAIL** | `node tests/body.test.mjs` |
| 十一种能力 | 走 / 跑 / 冲刺 / 跳 / 滑翔 / 跑墙 / 攀爬 / 墙跳 / 下滑 / 翻滚 / 翻越 | 自检 13 项逐条覆盖 |
| 三条贴墙轨道互切 | 同帧立即执行,无空帧 | 跑墙交接那一帧 `wallRunV` 恰好 700、`vz` 同帧变 700 |
| GLB 角色 + 118 条动画 | 载入、缩放、朝向、蒙皮、mixer 驱动都验过 | `__bench.info()` → `degraded:false` / `clipCount:118` / `missingClips:[]` / `meshYawDeg:90` |
| 载入失败退化 | 退化成胶囊替身,移动与自检照常 | HUD 出现横幅;`__bench.info().degraded === true` |
| 可复现性 | 三次运行 stdout 逐字节一致 | 固定步长 1/120,自检与渲染共用 |
| 稳健性 | 0 NaN、0 穿透、最低 z 恒 94.02 | 8 起点 × 60 s fuzz(57600 步)+ 200 组随机压力 |

### 不能跑 / 没验证的

- **浏览器里的观感没有人目视确认过。** 所有页面级验证都是在 node 里给 `document`/`fetch`/`img`
  打桩、把 `gfx/scene.js` 的 WebGL 部分换成 stub、跑 `main.js` 的逐字副本做的。
  真实 WebGL 下的阴影、雾、材质单双面、指针锁往复,都还是纸面结论。
  优先目视三件事:①`rig.js` 把材质从 doubleSided 改成 `FrontSide`,头发/衣摆若是单面片会露洞;
  ②4096² 阴影图 + `normalBias 15` 在厘米尺度下有没有 peter-panning(60 m 塔底最可能);
  ③雾密度 `3.2e-5` 在 400 m 对角处有没有如设计般把地板边缘藏进天空。
- **`src/anim/rig.js` 进不了 `node tests/run.mjs`** —— `GLTFLoader` 需要 DOM。
  它的正确性只能靠页面回归,或按当初的办法临时打桩 `document.createElementNS`。
- **GLB 取件路径(fetch → Blob → objectURL)只在 node 里验过。** 若单端口服务对 `.glb`
  做了压缩/改写 MIME、或子路径下 `new URL('../../models/…', import.meta.url)` 解出的地址
  与实际路由不一致,会静默走两级退化最后落到胶囊(多请求一次 5 MB)。
- **`WallRun` / `WallTop` 两个动画槽位在本关卡下放不出片段**(见 §3.5)。状态层正确,动画层缺画面。
- 战斗 / 抓取 / 吞噬、UE 自检的后 5 步:**范围外**,没做。

---

## 2. 技术方案

### 2.1 为什么沿用 UE 的厘米 + Z-up

Three.js 生态默认米制 Y-up,换过去在渲染上更顺。**没换,是刻意的。**

这次任务是对照实现,承重的东西是"数字能不能直接比"。一旦换算,PORT_SPEC 第 1 节的 40 多个常量、
第 4 节的 17 组关卡坐标、第 7 节的 13 组传送点、以及每一条断言的期望值,全都要跟着换,
而每一次换算都是一个可能引入 100 倍或 ±90° 错误的地方,还会让"实测 700 对不对"这种问题
变成"实测 7.0 换回去是 700 吗"。这类移植最常见的失败模式就是单位/朝向换算,不是算法错。

代价与对应做法:

- `camera.up.set(0, 0, 1)`;不用 `OrbitControls` 之类的 Y-up 假设,弹簧臂自己算。
- 阴影相机 `up` 也要设成 `(0,0,1)`,否则光源正对 ±Z 时会翻转甚至退化。
- 阴影 `bias` / `normalBias` **按厘米给**(−0.0004 / 15)。照米制习惯给 0.02 会让 60 m
  塔的侧面自己长出条纹。
- glTF 是 Y-up 米制,所以角色要包两层(见 §2.3)。
- 雾:UE `ExponentialHeightFog density=0.004` 与 three 的 `FogExp2` 不是同一个模型,
  厘米距离下直接用会在 10 m 外全白。按目标反解:200 m 处约三成雾 → `FOG_DENSITY = 3.2e-5`。
  副产物 100 m ≈ 10%、400 m(场地对角)≈ 80%。
- 太阳强度:UE 的 `intensity 6` 是 lux,three 不是同一套单位,只借量级
  (`6 × 0.45 = 2.7` + `HemisphereLight 0.85` + ACES 曝光 1.0)。**外观不是对齐项。**

### 2.2 引擎替身:`CharacterMovementComponent` 在浏览器里没有对等物

这是全项目最难的部分。`src/sim/collision.js` + `src/sim/body.js` 一起顶替 UE 的移动组件。
每一处简化都写清了失真条件 —— 因为"简化"如果没有失真条件就是"猜"。

**碰撞扫掠:保守推进(conservative advancement),不用子步长。**
PORT_SPEC §6.1 建议"按最小厚度定子步长",没照做。理由:场地最薄的盒 50 cm,而自检里有传送和
6000 cm 高空自由落体,单次查询长度能到上万厘米 —— 按 25 cm 一步要走几百步,慢,而且仍然只是
"大概不穿"。保守推进有严格证明:当前间隙 `d > 0`、最近点对给出单位分离方向 `n` 时,
沿 `n` 的分离量随位移以**恒定速率** `c = dot(dir, -n)` 减小,故接触必须至少前进 `d / c`;
"前进 `d/c`"永远落在真正首次接触之前,单调逼近而绝不越过。**盒厚薄无关,不需要为薄板调参。**

顺带得到两个免费的正确行为:`c <= 0` 时那条分离轴对所有后续位移永久有效 ⇒ 该盒沿这条射线
永不可达,直接剔除。所以"贴地水平移动"不会被地板挡住、"已嵌入但正在往外走"不算阻挡 ——
`body.js` **不需要**写"忽略脚下地面"之类的特例。40000 次含刻意掠射的扫掠里最大迭代 9 次
(上限 64),单次查询约 0.4 µs。

几何全部归约成「线段 + 半径」(胶囊轴恒沿世界 Z,探针球是零长线段),OBB 只是把线段变换到盒局部
空间,旋转盒不需要第二套代码。线段-盒最近点用**精确解**而非迭代 —— 没有收敛容差,
也就没有"法线在容差里抖"。命中面时法线取该轴精确值不做归一化,`|normal.z|` 判定不会有浮点脏值。

**八处相对 UE 的简化,以及各自的失真条件:**

| # | 简化 | 失真条件 / 后果 |
|---|------|----------------|
| 1 | **StepUp 第三步换实现**:UE 是「上抬→前推→下探扫掠,下探到不可走面就回滚」,这里改成在障碍另一侧打一条向下的线检测量顶面高度 | 可迈物顶面窄于 `STEP_PROBE_IN`(2 cm)或顶面与侧面之间有倒角时可能误判。本关卡最薄的可迈物是 400 cm 见方,不受影响。**这一处直接决定 40/80 cm 分水岭**(见 §3.4) |
| 2 | 迈台阶时有约 0.05 s 的"腾空"帧 | 此时 `velocity.z = 0`,身份是 `Falling` 而**不是** `Jumping`,不污染自检 13 的推理 |
| 3 | **贴地不留悬空**:UE 用 `MIN/MAX_FLOOR_DIST`(1.9/2.4)让胶囊常态悬空 ≈2 cm,这里贴到 0(留 0.02 cm skin) | 站立高度 **94.02** vs UE ≈96;`heightAboveFloor()` 站立时返回 0.02 而 UE ≈2 |
| 4 | 贴地窗口取 UE 的 2.4 cm,**不是** PORT_SPEC §6.2 建议的「`MaxStepHeight` 量级」 | 取 55 会在刚迈上台阶边缘、中心线检测还量到远处地面时把角色拽回台阶下,台阶就永远迈不上去。走缓坡不弹起靠的是位移沿地面平面走(`ComputeGroundMovementDelta`),不是靠大窗口 —— UE 也是这么分工的。代价:走下 ≤55 cm 矮台会有短暂 `Falling`(与 UE 一致) |
| 5 | `SlideAlongSurface` 只做投影 + 最多 4 次迭代,没有 `TwoWallAdjust` 的凹角特例 | 走廊内角贴滑手感与 UE 略不同 |
| 6 | `_calcVelocity` 只在水平面里算(竖直交给重力/地面平面) | 与 UE 把 `Velocity.Z` 摘出去再 `CalcVelocity` 一致,无失真 |
| 7 | 撞墙掉速照 UE `PhysWalking` 末尾把速度改写成「实际位移/dt」;唯一例外是迈台阶那一帧(位移含 40 cm 竖直抬升,换算成速度是假的 4800 cm/s)跳过改写 | UE 靠 `bJustTeleported` 做同一件事 |
| 8 | 相机弹簧臂探针半径 **20**,UE `SpringArm` 默认 `ProbeSize = 12`;滞后从 UE 的 `VInterpTo`(帧率相关)换成同时间常数的 `1-e^(-12·dt)` | 探针放宽是因为 `CollisionWorld` 只有盒,细探针容易顺着两块墙的接缝钻出去。收臂沿用 UE 默认的**瞬时**回退,宁可突然拉近也不要有一帧看见关卡背面 |

**UE 引擎默认值的落点。** `BrakingFrictionFactor`(2.0)、`AirControlBoostMultiplier`(2.0)、
`AirControlBoostVelocityThreshold`(25)、`MAX_FLOOR_DIST`(2.4)这四个是 UE **引擎**默认值,
不在 PORT_SPEC §1 的手感常量表里,所以放在 `src/sim/body.js` 顶部而**不是** `protoTypes.js` ——
后者只装"UE 工程作者调过的手感数字"。这个分界要守住,否则下次有人为了"集中管理"把引擎默认值
搬进 `protoTypes.js`,常量对齐检查就会开始报假漂移。

### 2.3 动画层:`AnimationMixer` 顶替 UE 的原生动画代理

UE 侧是 `FAnimInstanceProxy::Evaluate()` 手动采样两条 `UAnimSequence` 并交叉淡化
(不是动画蓝图 —— 那个工程要能无头生成)。等价做法:

- `src/anim/animInstance.js` 只负责**槽位状态机**:选槽 → one-shot 触发/取消 → playRate → 淡入。
  它不知道 `AnimationMixer` 之外的任何东西,`update(dt, movement)` 就是 UE 的
  `NativeUpdateAnimation` + `Evaluate` 的合体。
- 交叉淡化用两个 `AnimationAction`,权重曲线**照 UE 的公式** `alpha = 1 - remaining/duration`,
  而不是 three 的 `crossFadeTo`(那是 mixer 自己的曲线,会和 UE 对不上)。
  实测 20000 帧随机状态下"权重和恒为 1、同时最多两条轨道"。
- one-shot 用 `LoopOnce + clampWhenFinished`。
- 三段连切时更早那条被显式 `stop()`,否则残留 action 会在 mixer 里累积权重。

**刻意保留的四条 UE 行为(别当 bug 修):**

1. 取消表在触发的**同一帧**就生效 —— `Idling` 下收到 ledge 事件,`ClimbLedge` 当帧就被取消
   (UE 的顺序是先触发再走衰减)。
2. 同一个 one-shot 播放中再次触发只重置计时、不重置片段时间(片段停在 clamp 住的末帧)。
3. `dt <= 0` 直接 return,连事件都不消费。
4. `WallTop` 槽位没有任何触发点(UE 侧也没有)。

**`meshYaw` 是量出来的,不是猜的 —— 而且量法有个坑。**
照 `Tools/import_alex.py`:`meshRoot` 先只上 `Rx(+90°)` 立成 Z-up,在那个坐标系里读
`Ball_L − Ankle_L` 与 `Ball_R − Ankle_R` 求平均、去掉 z、`atan2(y,x)` 得正面 yaw = **−90°**
(残差 0.000°),`meshYaw = −forwardYaw = **+90°**`。侧影(厚 0.394 vs 臂展 1.136)与眼睛探针
两条独立交叉检查都一致。UE 侧量到 −90,差的 180° 正是 glTF→UE 的左右手翻转,不是谁量错。

**坑:** GLB 根节点 `AlexRoot` 带 `R[0,1,0,0]`(绕 Y 180°),而 `inverseBindMatrices`
**没有**把它算进去 —— 两份"绑定姿势"整整差 180°。顶点最终位置是 `boneWorld · IBM · p`,
蒙皮跟着骨头走,所以必须读**节点层级**的世界变换(含 `AlexRoot`);读 `skeleton.boneInverses`
反推会得到 −90,角色会**倒着跑**。`rig.js` 里写了注释,别"优化"掉。

**顺手量出的第二件事:GLB 是 glTF 米制,必须缩放。** 网格包围盒高 1.8867(glTF 单位),
不缩放 Alex 只有 1.9 cm 高。用与 `import_alex.py` 同一条公式 `ALEX_HEIGHT_CM(188.5) / height`
算出 **99.908**,乘 `CHARACTER.MeshUniformScale`。缩放挂在**内层** `gltf.scene` 上,
`meshRoot` 的 position/quaternion/scale 整个留给渲染层。原点在**脚底**,所以
`meshRoot.position = 胶囊中心 + (0, 0, −94)`。

### 2.4 定时:仿真时间轴只由 accumulator 决定

固定步长 **1/120 s**,单渲染帧最多追 8 步(PORT_SPEC §6.5)。三条不能省的规矩:

- `accumulator = min(accumulator + rawDt, budget)` —— **先钳上限再花**。丢时间远好过卡死。
  budget 在渲染帧里是 `FixedStep × 8 = 66.7 ms`,在后台兜底 tick 里放宽到 0.5 s
  (它不是渲染帧,不受"单帧 8 步"约束;隐藏标签页里定时器被节流到约 1 s 一次)。
- 帧内次序 **施加意图(含 `tryJump`)→ 采样 → `world.step(dt)`**,照 UE 自检。一次性意图
  (跳/翻滚)必须在**仿真步内**消费,不能在渲染帧里 —— 否则高刷屏上跑 0 仿真步的那一帧
  会把跳跃吃掉,`__bench.step()` 也永远跳不起来。(这是实现期查出的真 bug,已修。)
- `anim.update(steps × FixedStep, movement)` —— 按**仿真时间**推进,不是墙上时钟。
  欠账被钳掉时世界在慢放,脚步才不会比位移快。
- 渲染插值 `alpha = accumulator / FixedStep`,位置 `lerpVectors`、yaw 走最短弧;
  单步位移 > 300 cm 判为传送并吸附。相机跟渲染帧(不用固定步长),`targetPos` 传**胶囊中心** ——
  那 90 cm 抬升是 `SocketOffset.z` 的活儿,抬两次相机会飘高。

---

## 3. 与 UE 侧的差异与发现

**这一节是本文档的重点。** 前面的都是"怎么做的",这一节是"和被对照的东西差在哪、为什么"。

### 3.1 `Angle_15deg` / `Angle_30deg`:Pitch/Roll 用错了 —— 而且是 UE 侧就用错了

PORT_SPEC §4 的表(第 319/320 行)写着:

| label | size (m) | 旋转 | 期望 |
|-------|----------|------|------|
| `Angle_00deg` | (10, **1**, 12) | pitch 0 | \|n.z\|=0.00 → 应贴住 |
| `Angle_15deg` | (10, **1**, 12) | pitch 15 | \|n.z\|=0.26 → 应贴住 |
| `Angle_30deg` | (10, **1**, 12) | pitch 30 | \|n.z\|=0.50 > 0.35 → **必须拒绝** |

**最后一格在 UE 侧也不成立。** 源头在 `Tools/build_test_map.py:179-180`:

```python
box("Angle_%02ddeg" % int(tilt), (x, 42.0, 6.0), (10.0, 1.0, 12.0), "angle",
    rotation=(tilt, 0.0, 0.0), ...)      # FRotator(Pitch, Yaw, Roll) → 传的是 Pitch
```

`size = (10, 1, 12)` 是**沿 Y 薄的板**,大面法线本来就朝 **±Y**。
`Pitch` 是**绕 Y 轴**旋转,而绕 Y 旋转把 ±Y 映射到 ±Y —— **法线一动不动**。
所以三块板的大面法线都精确是 `(0, ±1, 0)`,`|n.z| = 0`,
照 `WallMaxNormalZ = 0.35` 的判据 **三块都会被判成可攀爬的墙**。

想让板面倾斜,该传的是 **`Roll`**(绕 X 轴),那才会把 ±Y 法线抬进 Z。

`tests/run.mjs` 第 3 节把这条实测钉住了(断言名里直接写"§4 表的期望值在源几何下就不成立"):

```
ok  Angle_00deg 的大面 |n.z| = 0 < WallMaxNormalZ ⇒ 照 UE 原样会被当成墙 — n = (0.000, -1.000, 0.000)
ok  Angle_15deg 同上 — n = (0.000, -1.000, 0.000)
ok  Angle_30deg 同上 — n = (0.000, -1.000, 0.000)
```

**本移植照原样移植 `Pitch`** —— 这是对照实现,不擅自改几何。UE 侧的 13 项自检没有一步打角度架
(自检的墙面三项打的是 `Climb_20m`),所以这个错在 UE 侧一直没暴露。

**这不影响 13 条断言。** 法线阈值的拒绝逻辑本身是有效的 —— 自检第 12 项用的是带
`unclimbable` 标签的 `Unclimbable_Slab`(那块板 `|n.z|` 同样是 0,拒绝靠的是标签而不是法线)。
所以"标签拒绝"有覆盖,"法线阈值拒绝"**没有覆盖**。想验证阈值请另做一个结构:
同样的板改传 `roll=30`,或者做一块沿 Z 薄、绕 Y 转 60° 的板。

### 3.2 快照锚定:上游在移植期间还在改,只跟到 18:28 那一版

被移植的 UE 工程正在它自己的会话里继续开发。本移植锚定 **2026-08-03 18:28 那一版上游**,
只有**一条**规则,不是两套标准。18:28 之后上游的改动一律不跟:

| 上游改动 | 时刻 | 本移植 |
|---------|------|-------|
| `WallRunHandoffSpeed` 300 → 700、`ClimbUpSpeed` 320 → 700、`ClimbDownSpeed` 420 → 700、`ClimbLateralSpeed` 240 → 500 | 快照**之前** | **跟了**。`protoTypes.js` 与 PORT_SPEC §1.6 都是 700/700/500/700 |
| `WalkSpeed` 260 → 140 | `ProtoMovementComponent.h` mtime **18:49:59** | 不跟。`⚠` 常量漂移,不计失败 |
| `SlotClipNames` 整张表换成 Alex 本人的动作、参考速度改成量出的原速(walk 139 / run 572 / sprint 1033 / wallrun 683)、playRate 钳到 **0.6–2.5** | `ProtoAnimInstance.cpp` mtime **18:49:55** | 不跟。`SLOT_CLIP_NAMES` 是快照那一刻的混合表(Idle/Run/Sprint 已是 `alex_`,墙面/跳跃还是 supersol_/brawler_/infect_);`SLOT_REFERENCE_SPEED` 仍是 260/700/1500,`PLAY_RATE_RANGE` 仍是 [0.6, 2.0] |
| `ClimbUp` / `WallRun` 也加参考速度并用 `\|verticalSpeed\|` 驱动 playRate | 同上 | 不跟。爬墙/跑墙片段固定 1 倍速,观感偏慢 |
| `TraceWallAt` 增加 `grabbable` 与"正在模拟物理的组件"两条拒绝 | 同上 | 不跟(本关卡没有 `grabbable` 结构) |
| `UpdateMotionState` / `GetMaxSpeed` 里的 `CombatOverride` | 同上 | 不跟(战斗范围外) |
| 自检换成 20 m 墙 + `MinPeakAscent`、测试场 17 → 21 块 | 快照之前 | **跟了**(墙面三项打 `Climb_20m`、`MinPeakAscent = 650`);21 块里多出的 4 块是战斗靶子,范围外 |

`WalkSpeed 140` 那条会**永久**在 `node tests/run.mjs` 里亮一条 `⚠`。这是设计如此:
第 2 节从 UE 头文件正则抠出 31 个 `UPROPERTY` 默认值逐条比对,有差异就列出来但**不计入失败**。
要跟进的话,**改 `protoTypes.js` 必须同时改 PORT_SPEC §1 的表和 §2.5/§3.3/§3.4 的伪代码** ——
只改表不改伪代码就是上一次留下 640/300/320/420/240 那批化石的原因(见 §5.1)。

UE 头文件路径可用环境变量 `PROTOMOTION_UE_HEADER` 覆盖;读不到就打 `skip` 并写出路径,
不影响退出码。**唯一的硬断言是"抠到 > 20 个"** —— 上游若改写法(比如换 `constexpr`)
会让比对表变空,那样静默零比对比漂移更危险。

### 3.3 13 项自检的数值与 UE 参考值逐项对比

UE 参考值来自 UE 侧 `README.md` §6 的自检输出与 PORT_SPEC §7 末尾。
PORT_SPEC 明确"**数值不要求逐位一致**,必须一致的是 13 条状态断言"。

| # | 项 | UE 参考 | 本实现 | 差异来源 |
|---|----|--------|-------|---------|
| 1 | idle | 出现 `Idling` | ok,峰值水平速度 **0.000000**(精确) | — |
| 2 | walk | 峰值 **125** | 峰值 **130** | 峰值出在传送后的**空中段**,不是地面。地面稳态 **91 = 260 × 0.35**(`AnalogInputModifier`)与 UE 同。空中段差 5 是 `AirControlBoost` 前几帧的离散化(1/120 步长下要 3 帧才越过 25 cm/s 阈值)。补上 `AirControlBoost` 之前这个数是 114,**比 UE 更远** |
| 3 | run | **700** | **700** | 一致(= `RunSpeed`) |
| 4 | sprint | **1500** | **1500** | 一致(= `SprintSpeed`) |
| 5 | jump | 出现 `Jumping` | ok,峰值下降 −880 | 峰值水平速度 1500 是空中段:跳起后模式是 `Falling`,`getMaxSpeed()` 给 1500,空中控制把 700 一路推到钳制线 |
| 6 | fall | 出现 `Falling` | ok,下降 **−3365**,落地 t = **1.725 s** | 3000 cm 落到 94.02 的解析解是 1.723 s;差 0.002 s = 约 1/4 帧 |
| 7 | glide | 水平 **1200** / 下降钳 **−261** | 水平 **1200** / 下降 **−261.1** | 一致。−261 而不是 −260 是因为钳制在积分之后:单帧还能再掉 `137.2/120 = 1.14` |
| 8 | wall run | 观察到 `Wallrunning → Climbing` 交接 | ok。跑墙 **43 帧 = 0.358 s**,上冲峰值 **1238**,掉到 **713** 交接 | 1238 = 进入初速 1250 减一帧减速 `1500/120 = 12.5`;713 是"跨过交接线 700 的那一帧"的值 |
| 9 | climb | 上升 **756**(要求 ≥ 650) | **攀爬段 700** / 整步 744(要求 ≥ 650) | UE 印的是整步 `PeakAscent`(含墙顶翻越的 760 弹射);本实现另算 `climbPeakAscent` 只统计 `Climbing` 帧,门槛判定用它。**这是加强不是放宽**(见 §5.2 偏离 2)。700 恰好等于 `ClimbUpSpeed` = `RunSpeed`,这才是这一项的本意 |
| 10 | wall slide | 下滑 **−380** | 下滑 **−380.00**,首次出现 t = **1.600 s** | 一致。1.600 = 松手 1.0 + `WallSlideDelay` 0.6,不早也不晚 |
| 11 | wall jump | 蹬离 **620** | 蹬墙后速度**精确** `(620, 0, 800)`,`Jumping` 出现在 t = **1.000 s** | 一致 |
| 12 | unclimbable | must NOT reach `Climbing` | ok,**0 帧** `Climbing`,胶囊贴到板面 **0.02 cm** | 一致 |
| 13 | vault | 出现 `Jumping` | ok,`ledgeEvent` 发 1 次,最终 x = **2428** | 一致(冷却 0.4 s 生效,没连发) |

**帧内次序是承重的,不是照抄传闻。** 第 11 项在两种次序下都会"见到 `Jumping`",但来源完全不同,
实测过首次出现的帧号:

- **意图 → 采样 → step(UE 原序,已采用)**:首次 `Jumping` 在**帧 120 / t = 1.000**,
  正是 `JumpAfter` 那一帧,即墙跳本身。
- step → 采样:首次 `Jumping` 在**帧 335 / t = 2.792** —— 蹬墙后下一帧就被
  `pushing && falling → EnterWall(Climb)` 抓回墙上,那个 `Jumping` 其实是 20 m 墙顶的翻越弹射。
  断言过了,但测的不是墙跳。

这条已在 `tests/run.mjs` 第 5 节钉成断言(要求首次 `Jumping` 落在 `jumpAfter ± dt` 内,
且按下跳那一帧 `isOnWall()` 为 true、探针法线为 `(1,0,0)`、蹬墙后速度精确 `(620,0,800)`)。

### 3.4 棱命中给径向法线 —— 上游不是 bug,但下游必须知道

`collision.js` 给的是几何上正确的**径向**接触法线。胶囊落到盒顶棱上时 `|n.z|` 可能只有 0.5
(40 cm 那块砖实测边缘法线 `(-0.857, 0, 0.514)`)。UE/PhysX 对盒扫掠报的是**面**法线,语义不同。

**谁把棱法线直接喂给 `WalkableFloorZ` 判定,都会得到"站在任何台面边缘就掉下去 / 台阶迈不上去"。**
`body.js` 的化解办法是照 UE `ComputeFloorDist` 的后路(`bLineTrace`):
**扫掠法线不可走 → 退回中心线检测取面法线**。判据因此变干净:顶面可走 且 抬升量 ≤ `MaxStepHeight`。
这一处直接决定 40/80 cm 分水岭:

```
Low_Step_40cm  → 站上 z = 134,一路走到 x = 1396,越过后 x 达 2192
Low_Step_80cm  → 挡在 x = 957.98,站立 z 从未超过 94.02,速度归零
哨兵:恰好 55 cm 迈得上、57 cm 迈不上
```

`movement.js` 的探针法线判定(`|n.z| > 0.35` 拒绝)理论上也会被棱命中影响 —— 好在探针是**球**扫掠
且打在大立面中段,实测都是精确 `(±1, 0, 0)`。

另一条相关约定:`capsuleSweep` 的 `time` 是真 TOI 的**下界**,且**接触恰好落在终点时按无阻挡返回
`null`**。所以落地事件最多晚一帧;6000 cm 落体实测落地时刻只比解析值晚 0.003 s(≈ 1/3 帧)。

### 3.5 `WallRun` / `WallTop` 两个动画槽位放不出片段

实测冲刺撞墙的槽位序列(用 GLB 里的真实片段时长跑了一遍):

```
状态:Falling → Running → Wallrunning → Climbing
槽位:Fall    → Sprint  → WallEnter   → ClimbUp
```

`WallRun` 一次都没出现。原因是算术上的:

- `WallEnter` 片段 `supersol_loco_air_trans_wall` 实测 **0.667 s**;
- 跑墙窗口 = (`WallRunUpSpeed` 1250 − `WallRunHandoffSpeed` 700) / `WallRunDeceleration` 1500
  = **0.367 s**,实测 43 帧 = 0.358 s;
- PORT_SPEC §5.3 的取消表规定 `WallEnter` **只在"已不贴墙"时取消**,而交接到 `Climb` 时人还在墙上;
- one-shot 独占轨道 ⇒ 跑墙全程被 `WallEnter` 盖住。

**状态层是对的**(`Wallrunning` 与 `Climbing` 都出现,自检第 8 项测的是状态)。
**UE 现版的 handoff 也是 700、取消表也一样,所以 UE 同样放不出来** —— 忠实继承,不是接线错误。
`WallTop` 更彻底:`SelectSlot` 里根本没有选中它的分支(UE 侧亦然)。

想让跑墙动画看得见,有三条路(都属于"改上游语义",本移植不做):
① 把 `WallEnter` 的取消条件加一条「状态 == Wallrunning 且已过 0.15 s」;
② 把 `WallRunHandoffSpeed` 退回 300(窗口回到 0.633 s,但那是快照之前的值);
③ 换一条更短的 `WallEnter` 片段。

### 3.6 其它逐条差异

**a) 空中也转朝向,且转向加速度(输入)方向。** PORT_SPEC §6.2 写的是"yaw 转向**水平速度**方向"
且只在 Walking 里转。实际按 UE 原文改成了转向**加速度**方向、加速度近零时保持当前朝向
(`ComputeOrientToMovementRotation`),并在 `moveFalling` 末尾也调一次
(`PerformMovement` 无条件调 `PhysicsRotation`)。可观测差异:空中转身跟手了;
地面被墙挡住(速度被改写成 0)时仍会朝输入方向转。13 条断言不受影响
(每一步的输入方向与初始 yaw 同向,贴墙时朝向跟随本就关掉)。

**b) 墙跳的身份派生。** 曾经在写完速度**之后**又派生了一次身份,让"墙跳 ⇒ Jumping"变成确定的。
已改回 UE 语义:身份由 `ExitWall` 里 `SetMovementMode` 那一刻的**旧** `vz` 派生 ——
攀爬上升起跳 ⇒ `Jumping`,下滑起跳 ⇒ `Falling`。自检第 11 项是从攀爬起跳,所以不受影响,
且 `run.mjs` 加了一条断言把这件事钉住。

**c) 加速度的一帧滞后未复现。** UE 是"本帧输入按**上一帧**的 `IsOnWall()` 决定要不要喂",
这里按本帧(转移后)的模式决定。差别只在离墙那一帧多吃了 `0.45 × 3000 × dt ≈ 11 cm/s`。

**d) `BrakingFrictionFactor` 实现前后。** UE 引擎默认 2.0(制动时摩擦翻倍)。
补上之后 700 cm/s 松手刹停从 38.1 cm / 0.150 s 变成 **22.77 cm / 0.108 s**
(解析解 27.5 cm,离散必然更短;UE 约 27.5 / 0.108)。只影响刹车利落程度,不改变任何状态判定。
UE 把制动切成 ≤1/33 s 子步,本工程固定步长 1/120 恒小于它,无差别。

**e) 贴墙时贴着墙爬不下来**(只要输入还朝墙):条件图第 7(b) 的必然结果,UE 同款。
想离墙得松开或往外拨。

**f) `wallProbe.normal/point` 是复用向量**,每帧被覆写;跨帧留着必须 `clone()`。
命中结果里的 `tags` 是盒内部的数组本体,别就地改。

**g) 鼠标灵敏度 0.15 度/像素是表外参数**(UE 侧无可照抄的等价值),构造参数可调,不作为对齐项。
斜向输入**不归一化**(W+D = (1,1),模长 1.414),与 UE 的 Axis2D 累加一致;
Alt 轻推斜向 0.495 仍 < 0.55 判走。

### 3.7 核查阶段发现并修掉的问题

代码/测试侧全部已修,`node tests/run.mjs` 的断言数从 73 → **111**。
每一条都做了**反事实检验**(把修好的东西改坏,确认断言真的变红):

| 问题 | 处置 | 反事实 |
|------|------|-------|
| `protoCourse.js` 的 `ueRotatorToQuaternion` 把 **pitch/roll 符号搞反**,得到一份镜像几何 | 改成 `Rz(yaw)·Ry(−pitch)·Rx(−roll)`,并让 `gfx/scene.js` 的 `ueRotatorForward` 删掉自己那份三角式、改为把 (1,0,0) 过同一个四元数(两份同功能实现互相矛盾的**根因**就是各写一遍) | 符号改回 → 3 条断言红。`collision.test.mjs` 里 6 条写死镜像期望值的断言已按 UE 正确值更新 |
| 自检**第 6 项(fall)是空断言** —— 期望的 `Falling` 由传送簿记在第 0 帧就写好了,一步物理都不用跑;而 `run.mjs` 第 5 节自称"诚实性下限"却恰好漏掉第 1、6 项 | 补 (0) 小节:第 6 项要 `peakDescent ∈ (−3500, −3000)`(**字面量**,不拿 `ENGINE.Gravity` 反算)、`Falling ≥ 150` 帧、落地时刻 ∈ (1.6, 1.9) s、末位置 z = 94.02;第 1 项要 Idling 占多数帧 + 水平速度**精确为 0** | 重力置 0 → 第 6 项 5 条里 4 条红(此前整套仍全绿) |
| **`getMaxSpeed()` 一条字面值断言都没有**,墙面常量调参的下游影响无人复验 | 补 9 条字面值断言(WallRun 1470 / Climb **920** / WallSlide 600 / Falling 1500 / 滑翔 1200 / Walking 700·260·1500 / 翻滚 1100)。Climb 那条的 extra 直接印出"注意 PORT_SPEC §2.5 的伪代码仍写 640" | 墙面常量退回 320/420/240/300 → 这条 + 第 9 项当场红 |
| 第 11 项的守卫**只盯时刻不盯来源**(把贴墙彻底关掉后它靠一次普通地面跳照样绿) | 加 `beforeJump`/`afterJump` 钩子 + 3 条断言(跳前 `isOnWall()`、探针法线、跳后速度精确值) | `PushIntoWallDot` 改 1.5(墙系统整体失效)→ 2 条红(此前照样绿) |
| 第 5 节多条断言**拿 TUNING 常量校验由同一常量算出的观测值**,自指而免疫 | 全部补双边字面量:glide `peakDescent ∈ [−300, −250]`、sprint `> 1400` 且 `> run × 1.9`、run `∈ (650, 750)`、walk `< 200`、板标签改成字面串 `'unclimbable'` | `SprintSpeed` 改 700 → 3 处红;`GlideMaxDescendSpeed` 改 5000 → glide 双边界红(此前全绿) |
| 第 9 项打印的 `ascent 744` 其实是**翻越弹射**的数不是攀爬的数(歧义窗约 45 cm/s) | `selftest.js` 新增 `climbPeakAscent`/`climbFrames`,门槛判定改用它,报告行两个数都印 | — |
| `main.js` 的 rAF 循环**没有防抛保护**,且全局 error 处理器会用不透明载入层**永久盖住页面**(一次瞬时异常 = 页面永久变黑) | `frame()` **先** `requestAnimationFrame` 再 `try/catch`;加 `booted` 标志:启动阶段异常仍走 `#loading` 并锁住(否则"永远转圈"),启动完成后改走不挡视线的顶部横幅 | node 打桩实测:人为抛一次 → 循环仍在推进(world.time 0.033 → 0.408);启动后派发 error → `#loading` 保持 `none`、横幅出现、连抛两次只有一条 |
| GLB 取件**无超时**,挂住时载入层不收 | `AbortController` + 按**无字节增长**计时(20 s;不是限总时长,慢网不该被误杀,每个 chunk 续命)+ `GLTFLoader` 直取那条退路加 60 s 最后期限 | 用"永不 resolve 但尊重 signal"的 fetch 验过:readyPromise 会 settle、退化为胶囊、`#loading` 收起 |
| 自检面板在**后台标签页里锁死**(`await requestAnimationFrame` 永不触发) | 改成 rAF 与 `setTimeout(200 ms)` 赛跑,`_running` 与按钮禁用一定会被 `finally` 放开 | — |
| 常量对齐检查**硬编码 `E:` 盘路径** | `process.env.PROTOMOTION_UE_HEADER \|\| <默认>`,skip 行提示环境变量名 | — |
| `InputState` 偏离 PORT_SPEC §10 的签名(§10 写的是 `jumpPressed`/`rollPressed`/`yaw` 三个裸字段) | 补三个**只读别名**(只看不消费)+ §10 伪代码里的 `apply(movement)`;`main.js` 改为委托 `input.apply(movement)` | — |
| 第 7 节纳入上游两套测试时**只看退出码、不断言断言条数非零** | 加 `passed > 100`(collision)/ `passed > 80`(body) | — |
| `index.html` 写"109 条动画" | 改为 **118**(解析 GLB 的 JSON chunk 复核过) | — |
| `BrakingFrictionFactor` / `AirControlBoost` 未实现 | 都补上,常量放 `body.js`(见 §2.2 末) | `body.test.mjs` 新增 §6b 钉住空中前两帧横向 Δv = 22.5、第 3 帧回落到 11.25 |
| `resetForTeleport` 走 `exitWall`、注释理由不成立 | 改成无条件 `_setPhysicsMode(Falling)`(= UE `BeginStep` 的前两句) | 新增 5 条,其中"传送后 `ClimbVertical` 仍保留 1"正是"没有多走一趟 `exitWall`"的判别式 |

### 3.8 判定为误报 / 已登记的

- **"相机 `ProbeSize` 20 vs UE 12 未登记"** —— `camera.js:22-26` 的注释原文早就写着理由。代码未改。
- **"`MIN/MAX_FLOOR_DIST` 常态悬空未实现"** —— `body.js` 的 `_snapToFloor` 注释已写明
  "94.02 vs UE 的 ~96"。改它要动落地 / StepUp / `heightAboveFloor` 三条链,收益是 2 cm 读数,
  风险不成比例。**只登记不改。**
- **"快照被两套标准解释"** —— 不是两套。`ProtoAnimInstance.cpp`(18:49:55)与
  `ProtoMovementComponent.h`(18:49:59)是**同一次**改动:换动画表 **和** `WalkSpeed` 260→140
  都发生在 18:28 快照之后。快照那一刻墙面常量已经是 700/700/500/700、动画表还是混合表。
  只有一条规则:锚定 18:28 那一版。规则写进了 `tests/run.mjs` 第 2 节的注释。
- **"墙面常量 320/420/240/300 是未披露的偷改"** —— `protoTypes.js` 里 `ClimbUpSpeed` 上方的注释
  原文就写着"UE 侧 2026-08-03 从 320/420/240 调到 700/700/500;本项目跟到当前值",
  UE 头文件也带设计意图注释(`Matching ClimbUpSpeed makes the handoff continuous`),
  且 UE 自己的 `ProtoSelfTest.cpp:100` 就是 `MinPeakAscent = 650.f` 配 `ClimbUpSpeed = 700`。
  **退回 320/420/240/300 会同时违背 UE 头文件、PORT_SPEC §1.6 的表、和 UE 自检自身的阈值。**
  真正需要改的是 PORT_SPEC 剩下的 5 行伪代码化石(见 §5.1),而那个文件在禁改清单里。
- **`_tmp_` 残留脚本** —— 现在项目根只有 `docs/ index.html models/ package.json src/ tests/
  vite.config.js` + 三份文档。`find . -name "_tmp*"` 零命中。

---

## 4. 已知问题与后续计划

### 4.1 明确没做的(与 UE 侧一致,不是本移植的缺口)

- **手脚贴面 IK**(交接文档 4.3 的 `SupportingLimb`)。UE 侧也没做,要贴得准需要 IK Rig / Control Rig。
- **斜向 / 横向跑墙**。原始拆包数据里 `alex_wall_run_diagonal_*` 那些片段是空壳
  (UE 侧后来解开池化编码后拿到了 43 条跑墙,但那是快照之后的事)。
- **Root Motion / Motion Warping**。翻越是固定初速的抛物线、翻滚是短轨定速位移,落点不对齐。
- **动画同步组 / 距离匹配**。快慢跑靠 playRate 缩放,极端速度滑步。
  攀爬跑 700 而 `infect_climb_up` 原速远低于此,手脚滑动明显。
- 战斗 / 抓取 / 吞噬(UE 的 9 个战斗槽位、`IsCombatScrubbed` 相位擦洗、自检后 5 步)。
- 联网、存档。

### 4.2 本移植特有的、值得下一轮做的

1. **浏览器目视回归。** §1 列的三件事(FrontSide 露洞 / peter-panning / 雾密度)+ 指针锁往复。
   这是当前最大的未知区。
2. **PORT_SPEC 的 5 行伪代码化石**(见 §5.1)。文件在禁改清单里,需要有权限的人改。
   建议一律写符号名不写字面量 —— 这次的化石正是字面量造成的。
3. **给法线阈值拒绝补一个真正的结构。** §3.1 说明了 `Angle_*` 三块覆盖不到它。
   加一块 `roll=30` 的板(别改现有三块,那是照抄的),然后加一条自检。
4. **`registry.json` 的 `desc` 里"109 条动画"要改成 118。** 文件在仓库根、禁改清单里。
5. **`WallRun` 动画槽位**(§3.5)。如果决定要让它看得见,那是一次**改上游语义**的决定,
   应该先在 UE 侧改、再同步过来,否则两边就不再可比。
6. **常量对齐检查目前只覆盖 `ProtoMovementComponent.h`。** 动画表、自检步骤表、关卡坐标
   都是人工比对的,没有自动化。上游一改就会静默失效。

### 4.3 会一直亮着的东西(不是待修)

- `node tests/run.mjs` 的 `⚠ 常量漂移 WalkSpeed:UE 现值 140 vs 本项目 260`。见 §3.2。
- `⚠` 不计入失败,退出码仍是 0。如果哪天它消失了,说明有人动了 `protoTypes.js` 或上游回滚了。

---

## 5. 引入的 PORT_SPEC 偏离与文档待办

### 5.1 PORT_SPEC 里的 5 行伪代码化石(需要有权限的人改)

`docs/PORT_SPEC.md` §1.6 的表已经是新值(700/700/500/700),但伪代码没跟着改,
于是同一份文档自相矛盾。**代码按 §1.6 的表实现**(也就是按 UE 头文件),
`tests/run.mjs` 的 9 条 `getMaxSpeed()` 字面值断言把正确值钉住了。

| 行 | 现在写的 | 应为 |
|----|---------|------|
| 204 | `max(1250, 240) + 220 = 1470` | `max(WallRunUpSpeed, ClimbLateralSpeed) + WallStickForce = 1470`(结果不变,操数错) |
| 205 | `max(320,420,240) + 220 = 640` | `max3(ClimbUpSpeed, ClimbDownSpeed, ClimbLateralSpeed) + WallStickForce = 920` |
| 250 | `若 WallRunVerticalSpeed <= 300:` | `<= WallRunHandoffSpeed(700)` |
| 264 | `vertical = x >= 0 ? x * 320 : x * 420` | `? x * ClimbUpSpeed : x * ClimbDownSpeed` |
| 268 | `wallRight * (RawMoveInput.y * 240)` | `* ClimbLateralSpeed` |

另建议:§4 表第 319/320 行加脚注指向本文 §3.1;§6.2 与 §10 按下面的偏离更新;
顶部加一条变更日志(谁在什么时刻把哪四个数改了)。

### 5.2 代码相对 PORT_SPEC 的偏离(有意为之,都是往 UE 原文靠)

1. **§6.2「转向水平速度方向」→ 转向加速度(输入)方向,且在 Falling 里也生效。**
   依据 UE `ComputeOrientToMovementRotation` 用 `Acceleration`、`PerformMovement` 无条件调
   `PhysicsRotation`。见 §3.6(a)。
2. **§7 第 9 项的 `MinPeakAscent` 判定改用 `climbPeakAscent`(只统计 `Climbing` 帧)。**
   UE 用整步 `PeakAscent`,无对应字段 —— 这是**加强**,不是放宽(650 门槛未动,
   UE 原文 `ProtoSelfTest.cpp:100` 同为 650)。
3. **§10 的 `InputState` 契约**现在是「`consume*()` 为推荐用法 + 三个只读别名 + `apply(movement)`」
   的超集,并多一个 `pitchDeg`(正 = 抬头,与 `gfx/camera.js` 的约定一致)。
4. **§6.1 的「按最小厚度定子步长」没照做**,改用保守推进。见 §2.2 —— 这一条是**更强**的保证。
5. UE 引擎默认值 `BrakingFrictionFactor` / `AirControlBoostMultiplier` /
   `AirControlBoostVelocityThreshold` / `MAX_FLOOR_DIST` 落在 `src/sim/body.js` 而不是
   `protoTypes.js`,PORT_SPEC §1.2 未列。见 §2.2 末。

### 5.3 §10 签名之外的加法(都是加法,没改任何既有签名)

- `collision.js`:sweep 返回额外带 `distance` / `startPenetrating` / `depth`;
  `lineTraceDown` / `overlapCapsule` 带 `tags`。入参接受 `[x,y,z]` 或任何有 `.x/.y/.z` 的东西。
- `body.js`:`moveWalking` 返回加 `steppedUp`;`safeMove` 返回 `{ blocked, hit, delta }`
  且 `targetQuat` 也接受**数字**(目标 yaw 度数);公开字段 `floorNormal / floorId / floorDist /
  hasFloor / lastDelta / lastHit / orientToMovement`,方法 `findFloor(snapDist?)`。
- `movement.js`:`resetForTeleport() / getCustomMove() / updateMotionState() / probeWall() /
  traceWallAt() / physWallRun|Climb|WallSlide() / enterWall / exitWall / mantleLedge /
  startGlide / stopGlide`;字段 `ledgeAhead / ledgeNormal / wallRunVerticalSpeed /
  noClimbInputTime / vaultCooldown / gravityScale / airControl / rawMoveInput / controlYaw /
  wasFalling` + 四个事件标志。
- `world.js`:`time`、`reset()`。
- `selftest.js`:`cases[i]` 额外带 `peakAscent` / `climbPeakAscent` / `climbFrames` /
  `minPeakAscent`;另导出 `SELF_TEST_STEPS`。

### 5.4 三条 `body.js` 的行为约定(调用方必须知道)

1. body 初始 `mode = 'falling'`(自检传送语义如此,默认 walking 会凭空多一个 `Idling` 帧)。
2. `moveWalking` 在脚下没有可走地面时**自己切 falling**、`moveFalling` 落地时**自己切 walking**
   —— 调用后请重读 `body.mode`。
3. `safeMove` **不动 mode**,贴墙轨道的进出全归 `movement.js`。

---

## 6. 文件地图

### 仿真层(纯 JS + THREE 数学类,node 里能跑,零浏览器依赖)

| 文件 | 行 | 负责 |
|------|----|------|
| `src/sim/protoTypes.js` | 289 | **所有常量的唯一来源**:MOTION_STATE / MOVE_MODE / CUSTOM_MOVE / ANIM_SLOT / TAGS / ENGINE / CHARACTER / TUNING(31 个手感常量)/ DERIVED(散在 UE 代码里的硬编码值)/ 槽位表 / 淡入表 / 参考速度。**别在别处硬编码手感数字** |
| `src/sim/collision.js` | 597 | `CollisionWorld`:17 个盒(含 2 个 OBB)+ 保守推进扫掠。`addBox` / `capsuleSweep` / `sphereSweep` / `lineTraceDown` / `overlapCapsule`。几何归约成「线段 + 半径」,线段-盒最近点用精确解 |
| `src/sim/body.js` | 653 | `KinematicBody` = **UE `CharacterMovementComponent` 的替身**:Walking / Falling / Custom 三套物理、`CalcVelocity`、StepUp、`FindFloor` + 贴地、`SlideAlongSurface`、朝向插值 |
| `src/sim/movement.js` | 866 | `ProtoMovement` = `EvaluateTransitions` 的逐句移植 + 两段式墙探针 + 三条贴墙轨道(`PhysWallRun` / `PhysClimb` / `PhysWallSlide`)+ `TickWallShared` + 进入/离开/翻越/跳/翻滚 + `UpdateMotionState` + `GetMaxSpeed`。**系统的骨架在这里** |
| `src/sim/world.js` | 76 | `ProtoWorld`:把关卡 + 胶囊 + 条件图拼成一个能自己往前走的世界。`step(dt)` / `teleport` / `reset`。存在的理由是**自检和渲染必须跑同一份仿真** |
| `src/sim/input.js` | 290 | `InputState`:键鼠 → 意图。**住在 `sim/` 但是唯一碰 DOM 的文件** —— window/document 只在 `attach()` 之后的回调里访问,模块顶层与构造函数一个都不碰,所以 node 里 `import` 它安全 |
| `src/levels/protoCourse.js` | 233 | 17 个结构的坐标(照抄 `build_test_map.py`)+ `PLAYER_START` + `PALETTE` + `LIGHTING` + `ueRotatorToQuaternion`(UE FRotator → 四元数,**pitch/roll 取反**,见 §3.7) |
| `src/core/selftest.js` | 317 | 13 项自检的步骤表(逐字段对着 `ProtoSelfTest.cpp::BuildSteps()` 比过)+ 驱动器 + `runSelfTest()`。**页面按钮和 `node tests/run.mjs` 跑的是这同一份** |

### 表现层

| 文件 | 行 | 负责 |
|------|----|------|
| `src/anim/rig.js` | 221 | GLB 载入、Z-up 双层包装、`meshYaw` 量测(脚尖法)、米→厘米缩放、`AnimationMixer` 建立、材质口味。导出 `loadAlexRig(url)` / `ALEX_GLB_URL`。**进不了 node 测试**(GLTFLoader 要 DOM) |
| `src/anim/animInstance.js` | 321 | `ProtoAnimInstance`:16 槽位选择表 + one-shot 触发/取消 + 双轨交叉淡化(权重曲线照 UE 公式)+ playRate 钳制。`activeSlot` / `activeClipName` / `missingClips` |
| `src/gfx/scene.js` | 271 | `createRenderer` / `createScene` / `configureRenderer` / `ueRotatorForward`。17 个盒(7 份共享材质)、太阳 + 阴影、半球光、自定 shader 天空球(跟随相机,否则跑到场地角上天穹会被 far 切掉)、`FogExp2`、棱线、地面网格 |
| `src/gfx/camera.js` | 159 | `SpringArmCamera`(臂长 420、`SocketOffset (0,40,90)`、lag 12、球探针避墙)+ `createCamera`(near 1 / far 60000 / `up=(0,0,1)`)+ `setCameraAspect`(保持水平 90° FOV,别直接改 `camera.aspect`) |
| `src/ui/hud.js` | 220 | `Hud`:UE 四行读数(`MotionState` / `Clip` / `Speed` / `Wall`)+ FPS + 轨迹(每 0.25 s 一行,列宽同 UE 的 `%-11s/%-34s/%6.0f/%7.0f/%7.0f`)。`KEY_HINTS` / `AUTO_HINTS` 是操作表的**唯一来源** |
| `src/ui/overlay.js` | 322 | `Overlay`:开始 / 暂停 / 自检面板 + 指针锁管理(丢锁 → 自动暂停,以指针锁为暂停的事实源)。挂点 `onStart / onResume / onPause / onRestart / onRunSelfTest / onToggleTrace` |
| `src/main.js` | 862 | 装配一切 + 主循环(accumulator / 固定步长 / 渲染插值 / 后台兜底 tick)+ 输入接线 + GLB 取件与两级退化 + 全局异常横幅 + `window.__bench` 调试口 |
| `src/styles.css` | 171 | HUD / 面板 / 载入层样式 |
| `index.html` | 79 | DOM 骨架。资源引用一律**相对路径**(单端口模式的要求) |

### 测试

| 文件 | 行 | 断言 | 负责 |
|------|----|------|------|
| `tests/run.mjs` | 728 | **111** | 七节:①13 项自检 ②31 个 UE 常量逐条对齐(+ 5 条 ENGINE/DERIVED 自洽)③关卡几何审计 + rotator 对照 `FRotationMatrix` ④13 个传送点合法性 ⑤**诚实性下限**(独立写的驱动器,与 `selftest.js` 互相印证)⑥纯仿真依赖闭包静态扫描 ⑦整体纳入下面两套 |
| `tests/collision.test.mjs` | 391 | **112** | 六个轴对齐面的解析值、OBB 面法线、大位移不穿透、`lineTraceDown` / `overlapCapsule`、17 结构审计,外加 160 条随机扫掠的不变量与 8 个用例的 `time` 对暴力二分求得的真 TOI(误差 < 1e-5 cm 且从不越过) |
| `tests/body.test.mjs` | 529 | **92** | 站立高度 / 加速时间 / 轻推稳态 / 转向速率 / 40 与 80 cm 分水岭(含 55·57 哨兵)/ 6000 cm 落体 / `safeMove` 贴墙上滑 / 30° 与 60° 斜面 / 刹停复算 / `AirControlBoost` / 200 组随机压力 |

`docs/PORT_SPEC.md`(666 行)是移植规格与单一事实源,**禁改**。
`models/Alex_ProtoMotion.glb` 是角色资源(118 条动画,3 个蒙皮 primitive)。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/claudeopus5-protomotion-parkour/`。
- 独立调试：根目录运行 `npm run dev:one -- claudeopus5-protomotion-parkour`，端口 3048。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
