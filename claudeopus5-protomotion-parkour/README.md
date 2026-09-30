<!-- modelbenchlab-access -->
统一访问：在仓库根目录运行 `npm run dev`，打开 `http://localhost:3000/claudeopus5-protomotion-parkour/`。
独立调试：根目录运行 `npm run dev:one -- claudeopus5-protomotion-parkour`，打开 `http://localhost:3048/`。下文子目录启动说明仅用于独立开发。

# ProtoMotion · Prototype 移动系统 Web 对照实现

UE 5.8 工程 `E:/EpicGames/Projects/ProtoMotion_Lab` 的**移动系统**用 Three.js + WebGL 重做一遍,
跑**同一份 13 项自检**。

这不是"参考 UE 做一个类似的跑酷 demo"。世界是**厘米、Z-up、X 前 / Y 右 / Z 上**,
和 UE 完全一致,不做任何单位换算;40 多个手感常量、17 个关卡结构的坐标、
条件图里每个 `return` 的位置,都是逐条照抄的。目的是能把两边的行为放在一起比。

角色是同一个 `models/Alex_ProtoMotion.glb`(**118 条动画**),
移动集用其中 16 条,槽位表与 UE 的 `SlotClipNames` 对齐。

覆盖范围:走 / 跑 / 冲刺 / 跳 / 滑翔 / 跑墙 / 攀爬 / 墙跳 / 下滑 / 翻滚 / 翻越。
**不覆盖**战斗、抓取、吞噬 —— UE 侧后来加了这些(自检也从 13 步长到 18 步),
本移植锚定 **2026-08-03 的移动系统快照**,战斗是另一道题。

---

## 1. 怎么跑

三种方式,推荐第一种。

```bash
# 仓库根,单端口 3000,门户 + 全部项目
npm run dev
# → http://localhost:3000/claudeopus5-protomotion-parkour/
```

```bash
# 只调这一个项目(registry 登记的独立端口)
npm run dev:one claudeopus5-protomotion-parkour
# → http://localhost:3048/
```

```bash
# 无头自检,不需要浏览器、不需要 WebGL
cd claudeopus5-protomotion-parkour
node tests/run.mjs               # 13 项自检 + 常量对齐 + 关卡审计 + 诚实性下限,111 条断言
node tests/collision.test.mjs    # 碰撞世界,112 条
node tests/body.test.mjs         # 引擎替身物理,92 条
```

`node tests/run.mjs` 目前 **111 ok / 0 FAIL,退出码 0**,并会附带一条 `⚠` 常量漂移提示
(见 §4,那是预期行为,不是红灯)。三次运行 stdout 逐字节一致 —— 固定步长 1/120,可复现。

页面上的「运行 13 项自检」按钮跑的是**同一个** `runSelfTest()`(`src/core/selftest.js`),
不是另写一份。仿真层没有一个文件碰 `window` / `document` / WebGL,所以两边必然同结果
(`tests/run.mjs` 第 6 节按依赖闭包静态验证了这件事)。

### 两个坑

- **后台标签页里不要点页面上的「自检」按钮。** 面板要等一次 `requestAnimationFrame` 才开始跑,
  隐藏标签页 rAF 不触发。已经加了 200 ms 的 `setTimeout` 兜底,但无头驱动请一律走
  `__bench.selfTest()`(同步返回,不经过 UI)。
- **GLB 载不下来不会白屏。** 会退化成一个胶囊替身,HUD 上出现横幅
  「GLB 缺失,退化为胶囊 · 移动系统与 13 项自检照常」。判据:`__bench.info().degraded === true`。
  移动系统和自检不受影响 —— 只是看不到 Alex。

### 调试口

```js
await __bench.ready;          // GLB 载完(或已确定退化)
__bench.start();              // 等于点「开始」
__bench.hold('w'); __bench.step(2);   // 同步推进 2 s 仿真(后台标签页里唯一可靠的驱动方式)
__bench.state();              // { motionState, clip, pos, vel, onWall, mode, slot, ... }
__bench.teleport([2500, 0, 150], 0);  // 传送(照自检的语义:先切 Falling + 速度归零)
__bench.selfTest();           // 同步跑 13 项,约 20 ms
__bench.shot();               // 截图 dataURL(先渲染再取,别隔任务读)
```

---

## 2. 操作

| 按键 | 行为 |
|------|------|
| `W A S D` | 移动。键盘默认满推 = **跑**(700) |
| **按住 `Alt`** | 轻推 = **走**。把输入幅度压到 0.35,低于 `WalkInputThreshold` 0.55 |
| 鼠标 | 视角(点画面锁定指针) |
| `Shift` | 冲刺(1500);起跳更高更远 |
| `空格` 点按 | 跳(900);冲刺中起跳 1450 + 前冲 700;贴墙时是墙跳 |
| `空格` **空中按住** | 滑翔。离地不足 150 cm 不起滑 |
| `Ctrl` | 翻滚 0.55 s,期间速度由翻滚独占 |
| `T` | 轨迹面板(UE `-ProtoTrace` 的等价物,每 0.25 s 一行) |
| `Esc` | 暂停 |

键盘只有 0/1,而 UE 的走/跑分界在推杆幅度 0.55,所以需要一个"轻推"通道 ——
这就是 `Alt` 的用途。不是快捷键设计偏好,是键盘没有模拟量的必然结果。

**另外半套系统不靠按键,靠环境触发:**

- 跑向墙 → 自动贴墙攀爬
- **冲刺**撞墙(撞墙速度 ≥ 900)→ 跑墙,动能耗尽(掉到 700)后交接攀爬
- 贴墙后松开方向 → 0.6 s 后转下滑
- 爬到墙顶 → 自动翻越
- 撞胸高矮块(80 cm)→ 自动翻越

最后一条是 UE 侧被自检跑出来的死点:80 cm 高于 `MaxStepHeight`(55)上不去,
又矮于两段式探针认定的墙,不加地面翻越角色会被卡死。这里照样实现。

---

## 3. 13 项自检的**实际**结果

`node tests/run.mjs` 第 1 节的原样输出(2026-08-03,固定步长 1/120):

| # | 名称 | 断言 | 结果 | 期间出现过的 MotionState(按首次出现) | 峰值水平速度 | 峰值下降 |
|---|------|------|------|--------------------------------------|-------------|---------|
| 1 | idle | 出现 `Idling` | **ok** | Falling → Idling | 0 | −457 |
| 2 | walk (light stick) | 出现 `Walking` | **ok** | Falling → Walking | **130** | −457 |
| 3 | run (full stick) | 出现 `Running` | **ok** | Falling → Running | **700** | −457 |
| 4 | sprint | 出现 `Running` | **ok** | Falling → Running | **1500** | −457 |
| 5 | jump | 出现 `Jumping` | **ok** | Falling → Jumping → Running | 1500 | −880 |
| 6 | fall | 出现 `Falling` | **ok** | Falling → Idling | 0 | **−3365** |
| 7 | glide | 出现 `Gliding` | **ok** | Falling → Gliding | **1200** | **−261** |
| 8 | wall run (sprint into wall) | 出现 `Wallrunning` | **ok** | Gliding\* → Falling → Running → **Wallrunning → Climbing** | 1500 | −457 |
| 9 | climb at run speed | 出现 `Climbing` 且峰值上升 ≥ 650 | **ok** | Jumping\* → Falling → Climbing | 764 | −327 |
| 10 | wall slide (release input) | 出现 `Sliding` | **ok** | Jumping\* → Falling → Climbing → Sliding | 248 | **−380** |
| 11 | wall jump (off the wall) | 出现 `Jumping` | **ok** | Falling → Climbing → **Jumping** | 764 | −327 |
| 12 | unclimbable slab is refused | **不得**出现 `Climbing` | **ok** | Jumping\* → Falling → Running → Walking → Idling(**0 帧 Climbing**) | 700 | −457 |
| 13 | vault (chest-high block) | 出现 `Jumping` | **ok** | Falling → Running → **Jumping** | 1500 | −743 |

**13/13。** 但"13/13"这四个字本身不说明什么,所以补充几个能证伪的读数:

- 第 8 项:跑墙持续 **43 帧(0.358 s)**,上冲峰值 **1238**(≈`WallRunUpSpeed` 1250 减一帧重力),
  掉速到 **713** 时交接给攀爬(交接线 `WallRunHandoffSpeed` = 700)。
- 第 9 项:**攀爬阶段自身**的上升峰值 **700 = `ClimbUpSpeed` = `RunSpeed`**,持续 312 帧。
  整步峰值 744 是墙顶翻越弹射的数,不是攀爬的数 —— 报告行把两个数分开印,
  门槛判定只认前者。这是本移植比 UE 侧多做的一层(UE 用整步峰值,存在歧义窗)。
- 第 11 项:`Jumping` 出现在 **t = 1.000 s**,正是 `JumpAfter` 那一帧;按下跳的那一帧
  `isOnWall()` 为 true、探针法线 `(1,0,0)`、蹬墙后速度**精确** `(620, 0, 800)`。
  这四条一起排除了"其实是墙顶翻越"和"其实是普通地面跳"。
- 第 12 项:胶囊表面停在离板面 **0.02 cm**,拒绝真的发生在墙前(不是没走到)。
  拒绝靠的是 `unclimbable` 标签 —— 这块板的 `|n.z| = 0`,法线检查根本不参与。
- 第 13 项:全步**没有任何跳跃意图**,`ledgeEvent` 发火 1 次,最终 x = 2428(越过 80 cm 砖)。

\* 每步开头那一帧读到的是上一步的残留身份:UE 的 `BeginStep` 先 `SetMovementMode(MOVE_Falling)`
(模式没真变 ⇒ 不派生新身份)再清速度,本移植同序照抄,所以第一帧的 `Gliding` / `Jumping` 是陈旧值。
刻意保留,不是 bug。

第 1 / 6 项曾经是"空断言"(期望状态在第 0 帧就被传送簿记写好,一步物理都不用跑),
现在各补了 4~5 条硬断言(重力置 0 会让第 6 项 4 条变红)。详见 `tests/run.mjs` 第 5 节。

---

## 4. 与 UE 侧的数值差异

PORT_SPEC §7 明确"**数值不要求与 UE 逐位一致**,必须一致的是 13 条状态断言"。实际差异:

| 项 | UE 参考值 | 本实现 | 说明 |
|----|----------|-------|------|
| walk 峰值 | 125 | **130** | 差异来自空中段的 `AirControlBoost` 离散化;地面稳态是 91 = 260 × 0.35 |
| run 峰值 | 700 | 700 | 一致 |
| sprint 峰值 | 1500 | 1500 | 一致 |
| 滑翔水平 / 下降 | 1200 / −261 | 1200 / −261 | 一致 |
| 攀爬上升 | 756 | **700**(攀爬段) / 744(整步) | UE 印的是整步峰值,本实现两个都印 |
| 下滑 | −380 | −380 | 一致 |
| 墙跳蹬离 | 620 | 620 | 一致 |
| 站立高度 | ≈96 | **94.02** | UE 的 `MIN/MAX_FLOOR_DIST` 常态悬空 2 cm 未实现 |

**还有一条会一直亮着的 `⚠`:** UE 侧 18:49 把 `WalkSpeed` 从 260 改成 **140**
(理由是量出 `alex_loco_walk_n` 的原速是 139 cm/s)。这次改动落在本移植的快照时刻之后,
按锚定规则**不跟**。`tests/run.mjs` 第 2 节会逐条比对 UE 头文件的 31 个手感常量并把这条打成
`⚠ 常量漂移 WalkSpeed:UE 现值 140 vs 本项目 260` —— **不计入失败、不影响退出码**。
它的存在证明这个检查真在盯着上游,而不是一条永远为真的装饰断言。

更完整的差异清单(含 `Angle_15/30deg` 那道**在 UE 侧也不成立**的期望值、
`WallRun` 动画槽位放不出片段的原因、引擎替身的 8 处简化及各自的失真条件)见
[HANDOVER.md](./HANDOVER.md) 的「与 UE 侧的差异与发现」。

---

## 5. 目录

```
src/sim/        纯仿真:碰撞 / 引擎替身物理 / 条件图 / 装配 / 输入。node 里能跑
src/anim/       GLB 载入 + meshYaw 量测 + 槽位状态机(AnimationMixer 版的 UE 原生代理)
src/gfx/        场景 / 灯光 / 天空 / 雾 / 弹簧臂相机
src/ui/         HUD 四行读数 + 轨迹 + 开始/暂停/自检面板
src/core/       13 项自检(纯仿真,页面与 node 共用)
src/levels/     17 个结构的坐标(照抄 build_test_map.py)
tests/          三套无头回归,315 条断言
docs/PORT_SPEC.md   移植规格,单一事实源
```

每个文件负责什么见 [HANDOVER.md](./HANDOVER.md) 的文件地图。

---

## 6. 已知限制

不是选型偏好,是没做或做不到:

- **没有手脚贴面 IK**(UE 侧也没有)。爬墙时手脚不真正吸附墙面。
- **没有斜向 / 横向跑墙**。原始拆包数据里那些片段是空壳。
- **没有 Root Motion / Motion Warping**,翻越与翻滚的落点不精确对齐。
- **没有动画同步组 / 距离匹配**,快慢跑靠 playRate 缩放,极端速度会滑步。
  攀爬跑 700 cm/s 而 `infect_climb_up` 原速远低于此,手脚滑动明显。
- **`WallRun` 与 `WallTop` 两个动画槽位在本关卡下一次都放不出片段。** 状态层是对的
  (`Wallrunning → Climbing` 都出现),动画层看不到跑墙。原因是 `WallEnter` 片段 0.667 s
  长于跑墙窗口 0.358 s,而取消表规定 `WallEnter` 只在"已不贴墙"时取消。
  **UE 现版同样放不出来** —— 忠实继承,不是接线错误。
- 墙面片段与跳跃片段借自同骨架的其他角色(超级士兵 / Brawler / 感染体),
  骨长比例与 Alex 有差异,接触点会偏。UE 侧后来解开了封包里的池化通道编码、换成了
  Alex 本人的动作,那是快照之后的事。
- 自检覆盖状态图的进入条件,**不校验动画观感** —— 那个只能靠眼睛。
