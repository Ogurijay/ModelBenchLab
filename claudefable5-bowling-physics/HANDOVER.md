<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# HANDOVER — claudefable5-bowling-physics

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3030 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3030，端口被占用时报错，不自动换号。
- 独立 Vite 配置补齐登记端口/strictPort，直接启动也遵守端口约定。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 项目概况

| 项 | 内容 |
|---|---|
| 任务 | benchmark mission `bowling`(冻结文档:`benchmark/tasks/code-to-3d/bowling.md`) |
| 实现方式 | Three.js `^0.185.0` + cannon-es `^0.20.0`,JavaScript ESM,Vite `^8.1.2`,纹理/音效全程序化 |
| 作答模型 | Claude Fable 5(variant: physics) |
| 调试端口 | 3030（registry 当前登记；常规服务使用3000） |
| 启动 | 仓库根统一安装依赖后 `npm run dev`(本目录),或根 `scripts/dev-all.mjs` 走 registry |

## 技术架构(文件职责)

| 文件 | 职责 |
|---|---|
| `index.html` | 中文 UI 骨架:记分板 / 三参数控制条 / 自测面板 / 结算弹窗 / 加载页 |
| `src/styles.css` | 深夜霓虹主题(pink/cyan/amber 三色霓虹 + 玻璃拟态面板) |
| `src/main.js` | 装配各子系统、RAF 主循环、FPS 统计、`window.__bench` 钩子 |
| `src/scoring.js` | **计分纯函数**:`score(rolls) -> {frames:[{rolls,score,cumulative}],total}`;`isGameOver` / `tenthFrameMaxRolls`。无任何 DOM/物理依赖 |
| `src/scoring-test.js` | 10 组冻结序列数据表 + `runScoreTests()`(页面按钮与 `__bench.scoreTest()` 共用) |
| `src/physics.js` | cannon-es 世界:固定 1/120s 步长、球道/边沟/挡墙/落坑静态体、低重心复合瓶体、简化 Magnus 侧旋力、沟球锁定、倒瓶(倾角>60°)/静定/球完成判定;`predictPath` 瞄准弧线预积分 |
| `src/scene.js` | three 场景:PBR 球道(clearcoat 反光)、半管边沟、护墙霓虹光带、瓶(LatheGeometry)、大理石纹球、扫瓶机、瞄准弧线、三段式运镜(瞄准/跟球/瓶台特写) |
| `src/game.js` | 状态机:AIMING → POWER(蓄力振荡)→ ROLLING → SETTLING(等瓶静定)→ SWEEP(扫瓶动画)→ 下一投 / GAME_OVER;rolls 数组是唯一事实源,计分全部委托 scoring.js |
| `src/ui.js` | 记分板渲染(X / / / - 记号 + 当前轮高亮)、参数读数、横幅、自测面板、结算弹窗、键盘绑定 |
| `src/audio.js` | WebAudio 合成:滚球隆隆(噪声环)、撞瓶木响(45ms 节流)、洗沟闷响、strike/spare 旋律 |
| `src/textures.js` | canvas 程序化纹理:39 块枫木板球道(箭头/引导点/瓶位点)、瓶身红颈环、大理石球、霓虹招牌、荧光地毯 |

## 核心系统清单

1. **计分(客观判分项)**:纯函数,第 10 轮 strike 补 2 / spare 补 1、最多 3 投;顺延加分未凑齐时该轮 cumulative 为 null(记分板留空)。10 组自测本地 node 已验证 **10/10**。
2. **物理**:瓶 mass 0.7、两段圆柱复合 shape 上移使重心离底 0.14m(重心偏下,L4);球 mass 5 / r 0.108;球道摩擦 0.05(上油);SAP broadphase + sleep。
3. **沟球**:球心 |x| > 半道宽、贴地、且在球道/瓶台范围内(z > LANE_END_Z,落坑不判)→ 置 gutter 标记、碰撞掩码剔除瓶组(**保证不再碰瓶**)、伺服锁定沟中心线直行;判定窗口覆盖到瓶台尽头,瓶区最后一段越界同样生效;物理沟底 -0.06m 与视觉半管一致。
4. **侧旋**:出手给 y 轴自转 + 每物理子步施加与旋量/速度相关的侧向力(简化 Magnus,满旋 ≈0.24 m/s²,全程横移 0.4~0.6m);瞄准弧线用同一常量预积分,所见即所得。
5. **判定链**:球完成(入坑/停球/沟底)→ 瓶静定(全部 sleep 或低速,含 6s 超时)→ 结算(站立掩码锁存,只计新倒)→ 扫瓶机动画(下压/前扫移除倒瓶/抬起归位)→ 摆瓶(满架或保留站立瓶原地)。
6. **UI**:蓄力条 1.7 次/秒三角波振荡空格定格;记分板当前轮琥珀色高亮;strike/spare/洗沟横幅;结算弹窗含评语。

## 调试钩子(window.__bench)

```js
__bench.ready          // true = 初始化完成(main.js 末尾同步置位,不依赖 rAF;隐藏标签页下轮询不会超时)
__bench.stepFrame(n)   // 推进 n 帧(1/60s/帧)并渲染,返回 getState();隐藏标签页(RAF 停摆)时用它驱动
__bench.getState()     // { phase, frame, rollInFrame, rolls, total, standing, gutter, ball:{x,y,z,speed}, aim, fps }
__bench.scoreTest()    // { passed, total } — 期望 {passed:10, total:10}
```

自动化投球示例(控制台):`__bench.getState().phase==='aiming'` 时依次触发两次空格事件即可蓄力/出手;或直接调用页面按钮。

## 已知限制

- 依赖已就位(主会话根 workspaces 安装:本目录 `node_modules/three@0.185.1`,cannon-es 0.20.0 / vite 8.1.2 由根 hoisted 提供)。浏览器端已实测:ready 同步置位、`scoreTest()` 10/10、整局投球流程可走通、fps 60、控制台无 error/警告。
- 沟球采用"锁定沟中心直行"的简化模型(任务提示允许),不模拟沟内弹跳。
- 侧旋为简化 Magnus(常系数侧向力),非真实油膜/rev 模型;强旋满力可拉出 0.5m 级弧线。
- 单人模式;多人轮流(L4 可选项)未做。
- 扫瓶机为视觉动画(倒瓶在扫杆经过瞬间移除),不做扫杆刚体接触。

## 后续可做

- 多人轮流模式(rolls 按玩家分组即可,scoring.js 无需改动)。
- 球指孔贴图 + 球体拖尾光效;strike 粒子彩带。
- 移动端触控(目前按钮可点但未做手势蓄力)。
- 把 `runScoreTests` 接入 vitest 做 CI 化(当前为页面按钮 + node 手跑)。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/claudefable5-bowling-physics/`。
- 独立调试：根目录运行 `npm run dev:one -- claudefable5-bowling-physics`，端口 3030。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
