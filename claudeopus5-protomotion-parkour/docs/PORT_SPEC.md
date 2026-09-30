# ProtoMotion → Three.js 移植规格（单一事实源）

被移植对象：`E:\EpicGames\Projects\ProtoMotion_Lab`（UE 5.8，纯 C++，无蓝图）。
该工程按 `D:\SinglePlayerGame\Prototype\Prototype角色移动系统_交接文档.md` 的结论，
用 Prototype (2009) 拆包资源还原 **走/跑/冲刺/跳/滑翔/跑墙/攀爬/墙跳/下滑/翻滚/翻越**。

本目录用 Three.js + WebGL 重做**同一套系统**，并跑**同一份 13 项自检**。
所有常量、关卡坐标、状态判定必须与下表逐条对齐 —— 这是一次对照实现，不是自由创作。

> 阅读顺序：先看第 0 节（坐标与单位约定，决定了所有数值能否直接抄），
> 再看第 2 节（状态图，是系统的骨架），其余按需查。

---

## 0. 坐标系与单位：直接沿用 UE

**世界为 Z-up、单位为厘米（cm）、X 前 / Y 右 / Z 上**，与 UE 完全一致。
这样第 1 节的 40 多个常量和第 4 节的关卡坐标可以**原样照抄**，不做任何换算 —— 换算是这类移植最大的错误来源。

Three.js 侧的代价与做法：

- `camera.up.set(0, 0, 1)`；相机与 `OrbitControls` 之类的默认 Y-up 假设一律不用，自己算轨道臂。
- glTF 是 Y-up 的。角色 GLB 挂在一个包装节点 `meshRoot` 下，
  `meshRoot.quaternion = Rz(meshYaw) * Rx(+90°)`，把模型立到 Z-up 世界里。
- `meshYaw` **不要猜**，按 UE `Tools/import_alex.py` 的同一办法在载入时量出来：
  取 `Ball_L - Ankle_L` 与 `Ball_R - Ankle_R` 两个向量（绑定姿势、模型局部空间）求平均，
  该方向即模型的正面；旋转到世界 +X 所需的角度就是 `meshYaw`。
  （不能用肩膀：`_L` / `_R` 命名与视觉左右在拆包数据里已经对不上。脚尖不受影响，两只脚平均掉外八。）
- 渲染尺度：1 cm = 1 three.js 单位。相机 `near=1`、`far=60000` 量级；
  阴影相机范围按场地 ±20000 配。

重力：UE `DefaultGravityZ = -980`，`GravityScale = 2.0` → **实际 -1960 cm/s²**。
滑翔时 `GravityScale = 0.14` → **-137.2 cm/s²**。

---

## 1. 常量表（逐条对齐，勿改）

来源：`Source/ProtoMotion/Public/ProtoMovementComponent.h` 的 `UPROPERTY` 默认值
与构造函数 `UProtoMovementComponent::UProtoMovementComponent()`。

### 1.1 胶囊与角色（`ProtoMotionCharacter.cpp`）

| 名称 | 值 | 说明 |
|------|-----|------|
| `CapsuleRadius` | 42 | Alex 身高 1.885 m,胶囊按他配 |
| `CapsuleHalfHeight` | 94 | 网格相对位置 Z = −94 |
| `CameraArmLength` | 420 | 弹簧臂 |
| `CameraSocketOffset` | (0, 40, 90) | |
| `CameraLagSpeed` | 12 | 指数追随 |
| `MeshUniformScale` | 1.0 | |

### 1.2 引擎级（构造函数里设的 UE 移动组件参数）

| 名称 | 值 |
|------|-----|
| `MaxAcceleration` | 3000 |
| `BrakingDecelerationWalking` | 2400 |
| `GroundFriction` | 8 |
| `GravityScale` | 2.0（重力 −1960） |
| `AirControl` | 0.45 |
| `MaxStepHeight` | 55 |
| `WalkableFloorAngle` | 50°（`normal.z >= cos50° = 0.6428` 才算可走地面） |
| `RotationRate.Yaw` | 720 °/s（`bOrientRotationToMovement`） |

### 1.3 地面

| 名称 | 值 |
|------|-----|
| `WalkSpeed` | 260 |
| `RunSpeed` | 700 |
| `SprintSpeed` | 1500 |
| `WalkInputThreshold` | 0.55 |

### 1.4 跳跃

| 名称 | 值 |
|------|-----|
| `JumpSpeed` | 900 |
| `SprintJumpSpeed` | 1450 |
| `SprintJumpForward` | 700 |

### 1.5 滑翔

| 名称 | 值 |
|------|-----|
| `GlideGravityScale` | 0.14 |
| `GlideMaxDescendSpeed` | 260 |
| `GlideAirControl` | 0.9 |
| `GlideHorizontalSpeed` | 1200 |
| `GlideMinHeight` | 150 |

### 1.6 墙面

| 名称 | 值 |
|------|-----|
| `WallProbeDistance` | 60（探针在胶囊半径之外再伸这么长） |
| `WallMaxNormalZ` | 0.35 |
| `WallStickForce` | 220 |
| `WallRunEnterSpeed` | 900 |
| `WallRunUpSpeed` | 1250 |
| `WallRunDeceleration` | 1500 |
| `WallRunHandoffSpeed` | 700 |
| `ClimbUpSpeed` | 700 |
| `ClimbDownSpeed` | 700 |
| `ClimbLateralSpeed` | 500 |
| `WallSlideSpeed` | 380 |
| `WallSlideDelay` | 0.6 |
| `WallJumpUpSpeed` | 800 |
| `WallJumpAwaySpeed` | 620 |
| `LedgeMantleUpSpeed` | 760 |
| `LedgeMantleForwardSpeed` | 460 |
| `WallOrientSpeed` | 12 |

### 1.7 翻滚

| 名称 | 值 |
|------|-----|
| `RollSpeed` | 1100 |
| `RollDuration` | 0.55 |

### 1.8 其它硬编码数值（散在代码里，一并列出）

| 位置 | 值 | 含义 |
|------|-----|------|
| `ProbeWall` 下探针 | `ZOffset = -HalfHeight * 0.35` = −32.9 | 腰腹高度 |
| `ProbeWall` 上探针 | `ZOffset = +HalfHeight * 0.75` = +70.5 | 胸头高度 |
| `TraceWallAt` 扫掠球半径 | `Radius * 0.6` = 25.2 | |
| `EvaluateTransitions` 贴墙判定 | `dot(Preferred, -Normal) > 0.5` | 「在往墙里推」 |
| 同上 | `SpeedIntoWall > 60` | 低速也能贴（非跑墙分支） |
| `VaultCooldown` | 0.4 s | 翻越冷却 |
| `PhysWallRun` 交接判据 | `RawMoveInput.X > 0.1` | 还推着 → 交给攀爬,否则下滑 |
| `PhysClimb` 无输入判据 | `abs(X) < 0.1 && abs(Y) < 0.1` | |
| `UpdateMotionState` 静止阈值 | 速度 2D < 15 → `Idling` | |
| `UpdateMotionState` 走/跑分界 | 速度 2D ≤ `WalkSpeed * 1.25` = 325 → `Walking` | |
| 跑墙进入初速 | `lerp(WallRunUpSpeed*0.55, WallRunUpSpeed, clamp(SpeedIntoWall/SprintSpeed,0,1))` | 687.5 → 1250 |

---

## 2. 状态图（系统骨架）

### 2.1 身份层 `MotionState`

对应 `proto::MotionState::State` 的移动子集，**与物理模式解耦**（这是交接文档强调的核心点）：

```
NotSet, Idling, Walking, Running, Jumping, Falling,
Wallrunning, Climbing, Gliding, Sliding
```

### 2.2 物理模式

只有贴墙用自定义模式；走/跳用通用的 Walking / Falling；
**滑翔不是自定义模式** —— 它仍是 Falling，只是改了重力和空中控制。

```
Walking | Falling | Custom{ WallRun=1, Climb=2, WallSlide=3 }
```

### 2.3 每帧顺序（`UpdateCharacterStateBeforeMovement` → `EvaluateTransitions`）

严格照这个顺序，优先级就是代码里 `return` 的先后：

```
1. 翻滚计时递减；若在地面上 Velocity = RollDirection * RollSpeed（翻滚独占本帧速度）
2. 落地沿：上一帧 Falling 且本帧 Walking → bLandEvent = true; StopGlide()
3. 记录 bWasFalling
4. 求 Preferred 方向：世界输入方向 → 退化为水平速度方向 → 再退化为角色前向
5. ProbeWall(Preferred)   // 必须在所有条件判断之前
6. 若已贴墙：墙消失且无 ledge → ExitWall()；然后 UpdateMotionState() 并 return
   （贴墙期间由 Phys* 轨道全权接管）
7. 环境争夺（墙）：WallProbe 有效 且 不在翻滚
     SpeedIntoWall = dot(水平速度, -Normal)
     bPushingIntoWall = dot(Preferred, -Normal) > 0.5
     a) bPushingIntoWall && SpeedIntoWall >= 900 → EnterWall(WallRun)
        WallRunVerticalSpeed = lerp(687.5, 1250, clamp(SpeedIntoWall/1500,0,1))
        WallRunLateralSpeed = 0；return
     b) bPushingIntoWall && (物理模式 == Falling || SpeedIntoWall > 60) → EnterWall(Climb)；return
8. 跑酷分支：VaultCooldown 递减；
   若 bLedgeAhead && Walking && 冷却结束 && 不在翻滚 && dot(Preferred, -LedgeNormal) > 0.5
     → VaultCooldown = 0.4; MantleLedge(); return
9. 滑翔：bCanGlide = 按住跳 && Falling && 不在翻滚 && 离地高度 >= 150
     bCanGlide → StartGlide()；否则若在滑翔 → StopGlide()
   在滑翔中：Velocity.z = max(Velocity.z, -260)
10. UpdateMotionState()
```

### 2.4 `MotionState` 派生（`UpdateMotionState`，顺序即优先级）

```
Custom WallRun   → Wallrunning
Custom Climb     → Climbing
Custom WallSlide → Sliding
翻滚中           → Sliding
滑翔中           → Gliding
Falling          → Velocity.z > 0 ? Jumping : Falling
Walking          → 速度2D < 15 ? Idling : (速度2D <= 325 ? Walking : Running)
其它             → NotSet
```

### 2.5 `GetMaxSpeed()`

```
Custom WallRun   → max(1250, 500) + 220 = 1470
Custom Climb     → max(700,700,500) + 220 = 920
Custom WallSlide → 380 + 220 = 600
翻滚中           → 1100
Falling          → 滑翔 ? 1200 : 1500      // 保留冲刺跳的动量,不钳到走速
Walking          → 冲刺 ? 1500 : (RawMoveInput.Size() < 0.55 ? 260 : 700)
```

`IsSprinting()` = 按住 Shift && 输入非零 && 物理模式 == Walking。

---

## 3. 墙面探测与三条贴墙轨道

### 3.1 MagneticBoots 探针（`TraceWallAt` / `ProbeWall`）

`TraceWallAt(zOffset, dir)`：从 `capsuleCenter + (0,0,zOffset)` 出发，
沿 `dir` 扫掠一个半径 25.2 的球，长度 `42 + 60 = 102`。命中后拒绝的情况：

1. `abs(hit.normal.z) > 0.35` —— 不是近垂直面；
2. 命中物带 `unclimbable` 标签。

`ProbeWall(preferred)`：
- 先打**下探针**（z = −32.9）。不中 → 直接返回 false（`bLedgeAhead` 保持 false）。
- 再打**上探针**（z = +70.5）。不中 → `bLedgeAhead = true`，`LedgeNormal = 下探针法线`，返回 false。
  （只有胸口高度有面 = 可翻越的矮障碍，不是可攀爬的墙。）
- 两个都中 → `WallProbe = {valid:true, normal:上探针法线, point:上探针命中点, distance:上探针距离}`。

**两段式探针是整套设计的关键**：它把「膝高台阶」「胸高障碍」「真墙」区分开。

### 3.2 `TickWallShared(dt, desiredVelocity)` —— 三条轨道共用的每帧体

```
Velocity = desiredVelocity - WallProbe.normal * 220     // 恒定向内吸附
delta = Velocity * dt
朝向目标 = 让角色正面朝 -normal（只取 yaw），按 QInterpTo(dt, 12) 插值
SafeMove(delta, 新朝向)；若阻挡命中 → SlideAlongSurface
最后：Velocity = (实际位移) / dt                        // 让动画层看到真实速度
```

### 3.3 `PhysWallRun`

```
墙消失 → bLedgeAhead ? MantleLedge() : ExitWall()，交回常规物理
WallRunVerticalSpeed -= 1500 * dt
ClimbVertical = 1
若 WallRunVerticalSpeed <= 700：      // = ClimbUpSpeed，交接才连续、不会掉一截速度
    RawMoveInput.x > 0.1 → 切 Climb 并立刻执行 PhysClimb
    否则                 → 切 WallSlide 并立刻执行 PhysWallSlide
    return
wallRight = normalize(cross(up, normal))
desired = up * WallRunVerticalSpeed + wallRight * WallRunLateralSpeed
TickWallShared(dt, desired)
```

### 3.4 `PhysClimb`

```
墙消失 → bLedgeAhead ? MantleLedge() : ExitWall()
ClimbVertical = RawMoveInput.x
vertical = RawMoveInput.x >= 0 ? x * 700 : x * 700   // 上下都是 RunSpeed：上墙跟平地跑一样快
若 abs(x) < 0.1 && abs(y) < 0.1：
    NoClimbInputTime += dt；>= 0.6 → 切 WallSlide 并立刻执行；return
否则 NoClimbInputTime = 0
desired = up * vertical + wallRight * (RawMoveInput.y * 500)
TickWallShared(dt, desired)
```

### 3.5 `PhysWallSlide`

```
墙消失 → ExitWall()
有任何攀爬意图（abs(x)>0.1 || abs(y)>0.1）→ NoClimbInputTime=0，切 Climb 并立刻执行；return
ClimbVertical = -1
TickWallShared(dt, up * -380)
```

### 3.6 进入 / 离开 / 翻越

```
EnterWall(mode):  首次贴墙时缓存 bOrientRotationToMovement 并置 bWallEnterEvent
                  关闭朝向跟随；StopGlide()；NoClimbInputTime = 0；切 Custom(mode)
ExitWall():       恢复朝向跟随；跑墙速度归零；ClimbVertical=0；切 Falling
MantleLedge():    bLedgeEvent = true；恢复朝向跟随；ClimbVertical = 0
                  切 Falling；Velocity = up*760 + forward2D*460
TryJump():        贴墙中 → away = 有效probe ? normal : -forward
                            ExitWall()；Velocity = away*620 + up*800；bJumpEvent
                  非 Walking → 返回 false（空中不能二段跳）
                  Walking    → charged = IsSprinting()
                               Velocity.z = charged ? 1450 : 900
                               charged → Velocity += heading2D * 700
                               切 Falling；bJumpEvent
TryRoll():        仅 Walking 且不在翻滚中；方向 = 世界输入方向（退化为前向）
                  RollTimeRemaining = 0.55
StartGlide():     缓存 GravityScale/AirControl → 0.14 / 0.9
StopGlide():      还原
```

---

## 4. 测试场 `Lvl_ProtoMotion`（坐标照抄 `Tools/build_test_map.py`）

单位：**米**（乘 100 变成 cm）。`box(label, centre_m, size_m, materialKey, rotation, tags)`，
`centre_m` 是**盒中心**，`size_m` 是**完整边长**，`rotation` 是 UE `FRotator(Pitch, Yaw, Roll)` 的度数。

| label | centre (m) | size (m) | 材质 | 旋转 | 标签 | 验证什么 |
|-------|-----------|----------|------|------|------|---------|
| `Floor` | (0, 0, −1) | (400, 400, 2) | floor | — | — | 地面，上表面 Z=0 |
| `WallRun_Target` | (42, 0, 20) | (1, 60, 40) | wallrun | — | — | 冲刺撞墙 → Wallrunning → 交接 Climbing |
| `WallRun_Marker_20m` | (41, −31, 10) | (1, 1, 20) | wallrun | — | — | 高度参照 |
| `Climb_03m` | (−32, −30, 1.5) | (1, 10, 3) | climb | — | — | 攀爬 + 顶部翻越 |
| `Climb_06m` | (−32, −16, 3) | (1, 10, 6) | climb | — | — | 同上 |
| `Climb_10m` | (−32, −2, 5) | (1, 10, 10) | climb | — | — | 同上（自检的攀爬目标） |
| `Climb_20m` | (−32, 12, 10) | (1, 10, 20) | climb | — | — | 同上 |
| `Angle_00deg` | (−20, 42, 6) | (10, 1, 12) | angle | pitch 0 | — | \|n.z\|=0.00 → 应贴住 |
| `Angle_15deg` | (−4, 42, 6) | (10, 1, 12) | angle | pitch 15 | — | \|n.z\|=0.26 → 应贴住 |
| `Angle_30deg` | (12, 42, 6) | (10, 1, 12) | angle | pitch 30 | — | \|n.z\|=0.50 > 0.35 → 必须拒绝 |
| `Unclimbable_Slab` | (0, −42, 6) | (16, 1, 12) | unclimbable | — | `unclimbable` | 正面撞也必须拒绝 |
| `Corridor_L` | (−60, 4, 7.5) | (30, 1, 15) | climb | — | — | 4 m 间距，左右墙跳交替上升 |
| `Corridor_R` | (−60, −4, 7.5) | (30, 1, 15) | climb | — | — | 同上 |
| `Glide_Tower` | (−32, 60, 30) | (12, 12, 60) | tower | — | — | 爬 60 m 再滑翔 |
| `Glide_LandingPad` | (30, 60, 0.25) | (20, 20, 0.5) | angle | — | — | 约 62 m 外的落点 |
| `Low_Step_40cm` | (12, −8, 0.2) | (4, 4, 0.4) | low | — | — | 40 cm 应直接迈过（普通台阶） |
| `Low_Step_80cm` | (12, −2, 0.4) | (4, 4, 0.8) | low | — | — | 80 cm 触发翻越（高于 MaxStepHeight、矮于墙） |

出生点：`PlayerStart (0, 0, 120)`，朝向 +X（yaw 0），正前方 42 m 是跑墙墙。

材质色板（`LinearColor`，UE 里是线性空间；three 侧建议按线性色直接给 `MeshStandardMaterial.color`，
`roughness = 0.85`）：

| key | RGB |
|-----|-----|
| floor | 0.16, 0.17, 0.19 |
| climb | 0.22, 0.42, 0.68 |
| wallrun | 0.85, 0.55, 0.15 |
| angle | 0.30, 0.60, 0.35 |
| unclimbable | 0.70, 0.14, 0.14 |
| tower | 0.45, 0.35, 0.60 |
| low | 0.60, 0.60, 0.25 |

灯光/天空（`build_test_map.py` 尾部）：方向光 `rotation (-42, 145, 0)`、`intensity 6`；
天光实时捕获；SkyAtmosphere + VolumetricCloud；指数高度雾 `density 0.004`。
Three 侧等价物：`DirectionalLight` + `HemisphereLight`/环境贴图 + 天空渐变 + `FogExp2`。
**外观求神似即可，不作为对齐项。**

---

## 5. 动画层（`ProtoAnimInstance`）

资源：`./models/Alex_ProtoMotion.glb` —— **118 条动画**，绑定姿势 + 蒙皮网格（3 个 primitive）+ 6 张贴图。
（由 UE 工程的 `Tools/build_alex_source.py` 生成：丢掉 Alex 文件里的空壳片段，
从同骨架的共享库补移动/战斗片段。骨名一致、只有旋转通道，故不需要重定向，天然原地动画。）

> **快照锚定 —— 一条线，只有一条。** 被移植的 UE 工程正在它自己的会话里持续开发，
> 本移植只覆盖**基础移动**，锚定在 **2026-08-03 约 18:30 的 UE 状态**：
> 17 个结构、无战斗、上表所列的 16 个动画槽位。
>
> 锚定线**之前**的改动已同步：墙面四个常量（`WallRunHandoffSpeed` 700、`ClimbUpSpeed` 700、
> `ClimbDownSpeed` 700、`ClimbLateralSpeed` 500）、自检的 `Climb_20m` 目标与 `MinPeakAscent = 650`。
>
> 锚定线**之后**的改动一律不追，已知有两处：
> 1. `WalkSpeed` 260 → 140（UE 18:49）—— `tests/run.mjs` 第 2 节会把它报成 ⚠ 漂移；
> 2. 整张动画槽位表换成 `alex_` 那套、参考速度与 playRate 上限跟着改（UE 18:49，同一次提交）；
> 3. 战斗组件与 `Grabbable_*` 靶子（测试场 17 → 21 块）、`ProbeWall` 新增的
>    `grabbable` / 物理模拟组件两条拒绝、`MotionState` 新增的战斗身份。
>
> 之所以要写死这条线：`WalkSpeed` 和动画表是**同一次提交**里改的，
> 「墙面跟到当前、走速停在旧值」不是两套标准，而是同一时刻的横切面。
> 想整体前移锚定线，请连动画表一起移，并重跑全套自检。

### 5.1 16 个槽位与片段名（`SlotClipNames` 当前值，GLB 里已核对全部存在）

| 槽位 | 片段名 | 循环? | 淡入(s) |
|------|--------|-------|---------|
| `Idle` | `alex_amb_stand` | 循环 | 0.20 |
| `Walk` | `supersol_loco_walk_n` | 循环 | 0.20 |
| `Run` | `alex_loco_run_n_3` | 循环 | 0.20 |
| `Sprint` | `alex_loco_trans_sprint_ndge_n` | 循环 | 0.20 |
| `JumpStart` | `supersol_loco_jump_tact_stand` | 单次 | 0.08 |
| `Fall` | `brawler_loco_jump_fall_cycle` | 循环 | 0.15 |
| `Land` | `brawler_loco_land` | 单次 | 0.15 |
| `Glide` | `alex_grap_air_float_gv` | 循环 | 0.15 |
| `WallEnter` | `supersol_loco_air_trans_wall` | 单次 | 0.08 |
| `WallRun` | `supersol_loco_wallrun_n` | 循环 | 0.08 |
| `WallTop` | `supersol_wall_run_top` | 单次 | 0.20 |
| `ClimbIdle` | `infect_climb_idle` | 循环 | 0.20 |
| `ClimbUp` | `infect_climb_up` | 循环 | 0.20 |
| `ClimbLedge` | `infect_climb_up_ledge` | 单次 | 0.08 |
| `WallSlide` | `supersol_bh_hangoff_side_idle_001` | 循环 | 0.20 |
| `Roll` | `spec_evade_roll_f` | 单次 | 0.08 |

单次片段集合 = `{JumpStart, Land, WallEnter, WallTop, ClimbLedge, Roll}`，其余循环。

### 5.2 槽位选择 `SelectSlot`

```
若有 one-shot 在播 → 用它（one-shot 独占轨道直到播完或被取消）
翻滚剩余时间 > 0   → Roll
Wallrunning        → WallRun
Climbing           → ClimbVertical > 0.1 ? ClimbUp : ClimbIdle
Gliding            → Glide
Jumping / Falling  → Fall
Sliding            → 贴墙 ? WallSlide : Roll
Running            → IsSprinting() ? Sprint : Run
Walking            → Walk
其它               → Idle
```

### 5.3 one-shot 触发与取消

每帧先**全部消费**四个事件标志（顺序：ledge、wallEnter、jump、land），再按此优先级触发一个：

```
bLedge     → ClimbLedge
else bWallEnter → WallEnter
else bJump      → JumpStart
else bLand      → Land
```

`OneShotRemaining -= dt`；取消条件（除了播完）：

| 槽位 | 额外取消条件 |
|------|-------------|
| `Land` | 地面速度 > 260 或 状态 == Falling |
| `JumpStart` | 状态 != Jumping |
| `WallEnter` | 已不贴墙 |
| `ClimbLedge` | 状态 == Idling 或 Running |

### 5.4 播放速率与交叉淡化

```
参考速度：Walk 260 / Run 700 / Sprint 1500，其余 0
playRate = 参考速度 > 0 ? clamp(地面速度 / 参考速度, 0.6, 2.0) : 1.0
换槽时：previous = current，blendDuration = 该槽的淡入时间，blendRemaining = blendDuration
blendAlpha = 1 - blendRemaining / blendDuration      // 新片段权重
```

UE 侧是原生 `FAnimInstanceProxy` 手动采样两条片段做插值。
Three 侧用 `AnimationMixer` 的两个 `AnimationAction` 交叉淡化即可，
但**权重曲线与 playRate 公式要一致**，并且 one-shot 用 `LoopOnce + clampWhenFinished`。

### 5.5 已知观感限制（照实继承，不要试图「修好」）

- **待机 / 走 / 跑 / 冲刺 / 滑翔是 Alex 本人的**（`Run` 与 `Sprint` 选的是通道完整的那两条，
  见 `protoTypes.js` 里 `SLOT_CLIP_NAMES` 的注释）；墙面与跳跃片段借自同骨架的其他角色
  （超级士兵 / Brawler / 感染体），骨长比例与 Alex 有差异，接触点会偏。
  这是拆包数据的客观限制 —— Alex 自己的墙面/跳跃片段在拆包里全是空壳。
- **没有手脚贴面 IK**（交接文档 4.3 的 `SupportingLimb` 未实现）。
- 没有动画同步组 / 距离匹配，快慢跑靠 playRate 缩放，极端速度有滑步。

---

## 6. 需要自己实现的「引擎替身」

UE 的 `CharacterMovementComponent` 在浏览器里没有对等物，这是本次移植**最难也最关键**的部分。
必须提供以下行为，且精度足以让第 7 节 13 项自检全部通过：

### 6.1 碰撞体

- 角色：立式胶囊，`radius 42`、`halfHeight 94`（含两端半球，即总高 188）。
- 关卡：全部是盒。多数轴对齐；`Angle_*` 三块有 pitch 旋转 → **必须支持 OBB**。
- 需要的查询：
  1. `capsuleSweep(from, to, out)` —— 胶囊扫掠，返回最早阻挡命中（法线、时间、点）。
     可用「分步推进 + 每步做穿透解算」近似，但要保证不穿薄墙（`Floor` 厚 200 cm、
     `WallRun_Target` 厚 100 cm，最薄的是 `Climb_*` / `Angle_*` 的 100 cm 与 `Glide_LandingPad` 的 50 cm；
     单帧位移上限约 1500 cm/s × dt，需按最小厚度定子步长）。
  2. `sphereSweep(from, to, radius, out)` —— 墙探针用（半径 25.2）。
  3. `lineTraceDown(from)` —— 离地高度用（`MeasureHeightAboveFloor`，最远 5000）。

### 6.2 Walking 模式

- `CalcVelocity` 近似：
  - 有输入：`Velocity += inputDir * MaxAcceleration * dt`，同时施加与输入方向相关的摩擦制动；
    水平速度钳到 `GetMaxSpeed() * clamp(inputSize, 0, 1)`（UE 的 `AnalogInputModifier`）。
  - 无输入：按 `BrakingDecelerationWalking` 制动，并叠加 `GroundFriction`。
- 台阶：位移受阻且阻挡面不可走时，尝试抬升至多 `MaxStepHeight = 55` 再前进，能站住就接受（Step-Up）。
- 落地判定：脚下 `normal.z >= 0.6428` 才算可走地面；否则转 Falling。
- 贴地：走下缓坡时不要弹起（Floor snapping，容差取 `MaxStepHeight` 量级）。
- 朝向：`bOrientRotationToMovement` 打开时，yaw 以 720 °/s 转向水平速度方向。

### 6.3 Falling 模式

- `Velocity.z -= 1960 * dt`（滑翔时 137.2）。
- 空中控制：输入方向的加速度乘 `AirControl`（0.45，滑翔 0.9）。
- 水平速度钳到 `GetMaxSpeed()`（Falling 分支：1500 / 滑翔 1200）。
- 命中可走地面 → 转 Walking，并触发 `bLandEvent`。

### 6.4 Custom 模式

三条贴墙轨道自己写速度，位移走 `SafeMove` + `SlideAlongSurface`（见 3.2）。
`SlideAlongSurface` 的等价做法：把剩余位移投影到命中面切平面后继续推进。

### 6.5 定时

- 固定步长仿真：**dt = 1/120 s**，渲染帧内追赶（accumulator），单帧最多追 8 步。
  自检必须能在无渲染的 Node 环境里跑同一套仿真 —— 所以仿真层**不得**引用 `window` / `document` /
  `THREE.WebGLRenderer` / GLTF 加载结果。
- 仿真层可以 `import * as THREE from 'three'` 只用其数学类（`Vector3`/`Quaternion`/`Box3` 等），
  这些在 Node 下可用。

---

## 7. 自检：13 项（照抄 `ProtoSelfTest.cpp`）

`StandZ = 150`、`LaneY = 1000`、`ClimbApproach = (-3000, 1200, 150)`、`ClimbApproachYaw = 180°`。

> 墙面三项（9/10/11）打的是 **`Climb_20m`**（面在 x=−3150，Y 跨 7~17 m，所以站 y=1200），
> 不是 10 m 那面。理由是 UE 侧写在注释里的：攀爬现在跑 `RunSpeed`（700），
> 10 m 的墙一秒半就爬到顶、角色翻越走人，下滑和墙跳根本来不及观察。

每步：可选传送（先切 Falling、速度归零、设位置与朝向）→ 每帧重新施加意图 →
收集期间**出现过的所有 MotionState** → 断言期望状态是否出现（或必须不出现）。

| # | 名称 | 时长 | 传送到 | yaw | 输入 | 其它意图 | 断言 |
|---|------|------|--------|-----|------|---------|------|
| 1 | idle | 1.0 | (−2000, 1000, 150) | 0 | (0,0) | — | 出现 `Idling` |
| 2 | walk (light stick) | 1.5 | (−2000, 1000, 150) | 0 | (0.35, 0) | — | 出现 `Walking` |
| 3 | run (full stick) | 1.5 | (−1000, 1000, 150) | 0 | (1, 0) | — | 出现 `Running` |
| 4 | sprint | 2.0 | (0, 1000, 150) | 0 | (1, 0) | sprint | 出现 `Running` |
| 5 | jump | 1.5 | (−2000, 1000, 150) | 0 | (1, 0) | 落地后立刻跳 | 出现 `Jumping` |
| 6 | fall | 2.0 | (0, 0, 3000) | 0 | (0,0) | — | 出现 `Falling` |
| 7 | glide | 3.0 | (0, 0, 6000) | 0 | (1, 0) | 按住跳（滑翔意图） | 出现 `Gliding` |
| 8 | wall run (sprint into wall) | 3.0 | (2500, 0, 150) | 0 | (1, 0) | sprint | 出现 `Wallrunning` |
| 9 | climb at run speed | 3.0 | (−3000, 1200, 150) | 180 | (1, 0) | — | 出现 `Climbing` **且 peakAscent ≥ 650** |
| 10 | wall slide (release input) | 4.0 | (−3000, 1200, 150) | 180 | (1, 0) | 1.0 s 后松开输入 | 出现 `Sliding` |
| 11 | wall jump (off the wall) | 3.0 | (−3000, 1200, 150) | 180 | (1, 0) | 1.0 s 后跳 | 出现 `Jumping` |
| 12 | unclimbable slab is refused | 2.5 | (0, −3900, 150) | −90 | (1, 0) | — | **不得**出现 `Climbing` |
| 13 | vault (chest-high block) | 2.5 | (600, −200, 150) | 0 | (1, 0) | — | 出现 `Jumping`（无跳跃输入 → 只能是翻越） |

> UE 侧的自检现在是 **18 步**：这 13 步移动 + 5 步战斗（strike / air strike / grab / throw / consume）。
> 战斗在本移植范围之外（见 §5 的快照锚定），只做这 13 步。

自检驱动细节（务必照做，否则结论不成立）：

- **帧内次序必须是「施加意图（含 tryJump）→ 采样 motionState → step(dt)」。**
  改成 step 后采样会让第 11 项（墙跳）漏掉 `Jumping`：墙跳后角色仍在往墙里推，
  下一帧条件图的 `pushing && mode == falling → EnterWall(Climb)` 会同帧把它抓回墙上。
  UE 侧同理 —— 它也是在 `TickComponent` 里 `TryJump()` 之后立刻读 `GetMotionState()`。
- 输入意图每帧重新施加（模拟按住）；不贴墙时才把输入喂给「加速度」通道
  （贴墙时轨道全权接管速度，喂输入会打架）。
- 第 5 项的跳跃要等真正站到地面才发（传送后是空中，`TryJump` 在 Falling 下正确地拒绝）。
- 记录 `peakSpeed`（水平）与 `peakDescent`（最小 Velocity.z）用于报告。
- 第 9 项额外有 **`MinPeakAscent = 650`**：光进 `Climbing` 不算过，还要观察到 ≥ 650 cm/s 的上升速度。
  这一条才是它的真正目的 —— 证明攀爬跑的是 `RunSpeed`，不是一档专门的慢速。
- **数值不要求与 UE 逐位一致**（UE 侧参考值：walk 峰值 125、run 700、sprint 1500、
  滑翔水平 1200 / 下降钳在 −261、墙跳蹬离 620、下滑 −380）。
  必须一致的是**13 条状态断言**；数值差异在 HANDOVER 里如实记录。

自检必须两处都能跑：
- `node tests/run.mjs`（无头，CI 用），以及
- 页面上的「自检」按钮，把 13 行结果显示出来。

---

## 8. HUD

照 UE 的四行读数（`ProtoMotionCharacter::Tick`）：

```
MotionState : <状态名>
Clip        : <当前片段名>
Speed       : <水平速度>  (vert <垂直速度>)
Wall        : detected / -
```

再加操作提示（按键表见下）和 FPS。UE 的 `-ProtoTrace` 等价物：页面上可开「轨迹」，
每 0.25 s 打一行 `state / clip / speed / vert / z / wall`。

## 9. 操作

| 按键 | 行为 |
|------|------|
| `W A S D` | 走 / 跑（推杆幅度 < 0.55 走。键盘是 0/1，故按住 `Alt` 或提供「轻推」键给 0.35 —— 见下） |
| 鼠标 | 视角（点击锁定指针） |
| `Shift` | 冲刺 |
| `空格` 点按 | 跳；冲刺中起跳更远；贴墙时为墙跳 |
| `空格` **空中按住** | 滑翔 |
| `Ctrl` | 翻滚 |
| 跑向墙 | 自动贴墙攀爬 |
| 冲刺撞墙 | 跑墙 → 动能耗尽交接攀爬 |
| 贴墙松开方向 | 下滑 |
| 爬到墙顶 | 自动翻越 |

键盘只有 0/1，UE 里 `WalkInputThreshold = 0.55` 的走/跑区分需要一个「轻推」通道：
**按住 `Alt` 时输入幅度取 0.35**（走），否则 1.0（跑）。在 HUD 提示里写清楚。

---

## 10. 模块划分与接口（各模块只写自己的文件，勿越界）

```
src/
  sim/protoTypes.js     MOTION_STATE / CUSTOM_MOVE / ANIM_SLOT / TAGS / TUNING(全部常量)
  sim/collision.js      CollisionWorld：addBox / capsuleSweep / sphereSweep / lineTraceDown
  sim/body.js           KinematicBody：胶囊 + Walking/Falling/Custom 物理(引擎替身,§6)
  sim/movement.js       ProtoMovement：探针 + 条件图 + 三条贴墙轨道(§2/§3)
  sim/world.js          ProtoWorld：装配 CollisionWorld + 角色 + step(dt);纯仿真,无 DOM
  sim/input.js          InputState → { moveInput:{x,y}, sprintHeld, glideHeld, jumpPressed, rollPressed, yaw }
  levels/protoCourse.js STRUCTURES(§4 表格的数据化) + PLAYER_START + PALETTE
  anim/animInstance.js  ProtoAnimInstance：槽位表 + one-shot + 交叉淡化 + playRate(§5)
  anim/rig.js           GLB 载入、Z-up 包装、meshYaw 量测、AnimationMixer 建立
  gfx/scene.js          渲染场景：地形盒、灯光、天空、雾、阴影
  gfx/camera.js         弹簧臂相机(臂长 420、偏移 (0,40,90)、lag 12)
  ui/hud.js             四行读数 + FPS + 轨迹
  ui/overlay.js         开始/暂停/自检面板
  core/selftest.js      13 项自检,纯仿真,可在 Node 跑;导出 runSelfTest()
  main.js               装配一切 + 主循环
tests/run.mjs           node 无头回归:runSelfTest() + 关卡几何审计 + 常量对齐检查
```

关键接口约定（**先定死，各模块照此写，不得擅自更改签名**）：

```js
// sim/collision.js
class CollisionWorld {
  addBox({ id, center, halfSize, quat = null, tags = [] })   // cm, Z-up
  // 所有 sweep 返回 null 或 { time, point, normal, id, tags }
  capsuleSweep(start, end, radius, halfHeight)   // start/end 是胶囊中心
  sphereSweep(start, end, radius)
  lineTraceDown(start, maxDist)                  // 返回 { distance, point, normal, id } 或 null
  overlapCapsule(center, radius, halfHeight)     // 返回最深穿透 { normal, depth, id } 或 null
}

// sim/body.js
class KinematicBody {
  constructor(world, { position, radius, halfHeight })
  position; velocity; yaw; mode;      // mode: 'walking' | 'falling' | 'custom'
  customMode;                         // 0..3
  setMode(mode, customMode = 0)
  moveWalking(dt, accelDir, maxSpeed, opts)     // 返回 { landed, blocked, floorNormal }
  moveFalling(dt, accelDir, maxSpeed, gravity, airControl)
  safeMove(dt, desiredVelocity, targetQuat, orientSpeed)   // Custom 用,§3.2
  isMovingOnGround()
  heightAboveFloor()
}

// sim/movement.js
class ProtoMovement {
  constructor(body, world)
  setMoveInput(x, y); setSprintHeld(b); setGlideHeld(b); setControlYaw(deg)
  tryJump(); tryRoll()
  step(dt)                            // = UpdateCharacterStateBeforeMovement + 物理 + 动画事件
  motionState; wallProbe; climbVertical; rollTimeRemaining
  isOnWall(); isSprinting(); isGliding(); getMaxSpeed()
  consumeWallEnterEvent(); consumeLandEvent(); consumeLedgeEvent(); consumeJumpEvent()
}

// sim/world.js
class ProtoWorld {
  constructor()                       // 内部建 CollisionWorld(levels/protoCourse) + body + movement
  movement; body; collision;
  step(dt)                            // 固定步长,由外部按 1/120 调用
  teleport(position, yawDeg)
}

// core/selftest.js
export function runSelfTest()  // → { total, passed, cases:[{ name, pass, expect, absent, seen[], peakSpeed, peakDescent, detail }] }

// anim/animInstance.js
class ProtoAnimInstance {
  constructor(mixer, clipsByName)     // clipsByName: Map<string, THREE.AnimationClip>
  update(dt, movement)                // 读 movement 的状态与事件,驱动 mixer
  activeSlot; activeClipName;
}
```

---

## 11. 明确不做的事

- 不做手脚贴面 IK / Motion Warping（UE 侧也没做，见 §5.5）。
- 不做斜向 / 横向跑墙（原始拆包数据里那些片段是空壳）。
- 不做联网、不做存档。
- 不「改进」手感常量 —— 这是对照实现，改了就失去比较意义。
  想试新数值请另开变体目录。
