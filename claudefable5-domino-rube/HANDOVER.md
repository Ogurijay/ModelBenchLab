# HANDOVER — claudefable5-domino-rube

## 项目概况

- **任务**:benchmark mission `domino`(`benchmark/tasks/code-to-3d/domino.md` 冻结 v1),多米诺·鲁布戈德堡机关链,重点考「确定性」轴。
- **实现方式**:Three.js `^0.185.0` + cannon-es `^0.20.0`,JavaScript ESM,Vite `^8.1.2`;纹理全部 canvas 程序化生成,音效全部 WebAudio 合成,零外部资产。
- **端口**:3026(仓库主会话统一登记预留;registry.json / domino.md / 门户 / `.claude/launch.json` 的 `fable-domino` 条目均为 3026)。
- **启动**:`npm install && npm run dev`(依赖已由主会话安装;three 0.185 装在本项目 node_modules,cannon-es/vite 从仓库根 hoisted 解析)。

## 技术架构(文件职责)

| 文件 | 职责 |
|---|---|
| `index.html` | 入口 + 全部中文 HUD(按钮 / 阶段指示 / 状态数字 / 响铃横幅)与样式 |
| `src/config.js` | **单一事实来源**:全部布局坐标、尺寸、物理参数、阶段名称 |
| `src/physicsWorld.js` | 确定性 World 工厂:禁 sleep、固定求解器参数、四种接触材质 |
| `src/machine.js` | 机关链物理(纯 cannon,不依赖 three):刚体、铰链、触发、阶段判定 |
| `src/scenery.js` | 渲染器 / 灯光(暖主光 + 冷补光)/ 渐变背景 / 桌面与高台布景 / 材质库 |
| `src/textures.js` | canvas 程序化纹理:木纹、高台顶面(带弧线镶嵌)、背景渐变 |
| `src/visuals.js` | 机关网格 + 每帧物理同步 + 响铃特效(发光脉冲 / 彩屑 / 摇摆) |
| `src/cameraDirector.js` | 双相机:自动运镜(按阶段跟拍 + 阻尼插值)/ OrbitControls 手动 |
| `src/audio.js` | WebAudio 合成:骨牌哒声 / 木板闷响 / 金属叮当 / 多分音钟声 |
| `src/ui.js` | HUD 绑定、键盘快捷键、阶段芯片刷新 |
| `src/main.js` | 装配、固定步长累加器主循环、复位逻辑、`window.__bench` |

## 核心系统清单

1. **机关链(5 类机关)**:①25 张多米诺(21 张弧线 185° + 4 张直线)→ ②重球被末牌倒平时平推出发、沿斜坡滚落 → 高架直道末端凌空 → ③飞落跷跷板翘起的近端(HingeConstraint),板下摆 26.5° 撞上止挡块急停,远端弹射杯将小球竖直偏 +x 抛出 → ④小球命中铰链单摆锤球左下象限(z 轴铰链 → 摆动锁定在链道竖直面内)→ ⑤锤球撞铃(静态球体,碰撞事件即响)。
2. **确定性**:固定 `1/120` 步长;触发前世界冻结(点击时机不影响结果);触发 = 对第一张骨牌施加冲量并从 tick 0 计时;复位 = **完整重建 World**;`allowSleep=false`;`bellRungAt` 用仿真时间。
3. **防爆闸**:单帧最多追 5 步,超限丢弃积压;`visibilitychange` 重置时钟;rawDt clamp 0.25s。
4. **可靠性设计(链条必通,全部经 headless 实测)**:
   - **骨牌间摩擦 = 0(致命参数)**:>0 时下落骨牌顶边在下一张面上形成摩擦自锁楔,GS 求解器把推力全部耗散,链条准静态蠕变卡死(fric 0.02~0.42 全卡死);置 0 后 25 张 ~2.3s 稳定走通。专用 `domino` 物理材质,对台面仍高摩擦抓地。见 `physicsWorld.js`。
   - 斜坡上沿藏进发球台缘下 1.5cm:避免坡面盒体上坡端延伸段顶角凸出台面形成暗脊(球会被 1.3cm 脊卡住振荡)。
   - 跷跷板止挡块 `stopDeg=10°`:板行程 26.5° 保证弹射能量,近端停低位使大球从近端退场不追小球;无止挡时板翻到 +18.5°,小球倒飞只能擦锤(擦碰余量为 0)。
   - 锤球高度 0.78 对准小球实测弹道(出杯顶点 ~0.68),小球在 y≈0.6 带上升速度结实命中;锤球减重 0.45kg 增大摆幅;铃铛表面间隙 0.06,实测锤球摆到 x≈3.69(接触点 3.68)有明确穿透余量,首个碰锤刚体确认为 smallBall(机制纯净,大球质量 1.0~2.2 全部通过)。
   - 斜坡/直道两侧护栏 + 桌边围栏,全程无刚体掉桌(实测 y 始终 > -1)。
5. **阶段判定**:碰撞事件 + 位置/角度轮询双保险(均在固定步内 → 确定);`currentStage` 单调递增。
6. **相机**:自动模式按 stage 输出目标位/看点,指数阻尼插值;stage1 跟多米诺波前,stage2 跟球,响铃 2.5 s 后拉回全景;`C` 切手动 OrbitControls。
7. **响铃反馈**:合成钟声(hum/基音/小三度/五度/标称音 六分音 + 拍音)+ emissive 脉冲 + 点光闪 + 彩屑粒子 + 「铃·响!」横幅。

## 调试钩子(window.__bench)

```js
__bench.ready          // true
__bench.getState()     // { triggered, currentStage, bellRung, bellRungAt, simTime,
                       //   tick, stageTimes, stageName, cameraMode, slowMotion, fps }
__bench.stepFrame(n)   // 手动推进 n 帧(每帧 1/60 s = 2 个物理步),隐藏标签页可用
__bench.trigger() / __bench.reset()
__bench.probe()        // 物理探针:骨牌倾角(°)、各球位置、板角,定位断链点
```

一致性验证方法:
- 浏览器:`reset() → trigger() → stepFrame(450)`,比对多次 `getState().bellRungAt` 与 `stageTimes`,应逐比特一致(**已实测:同会话 5 次运行完全一致,bellRungAt=6.250s**)。
- headless:`node scripts/verify-chain.mjs`(machine.js 纯 cannon 不依赖 three/DOM),连跑 5 次「重建→触发→步进」断言必响 + 五阶段单调 + 逐比特一致 + 无刚体掉桌,退出码 0/1(**已实测 PASS,Node 下 bellRungAt=6.725s**)。
- 注:Node 与浏览器的 bellRungAt 不同是 V8 版本间 `Math.sin/cos` ULP 级差异被接触混沌放大所致;任务要求的是**同会话内**逐比特一致,两环境各自内部均满足。

## 运行时验证记录(2026-07-10 修复会话)

- 浏览器(vite dev @3026):`__bench` 就绪;5 次「复位→触发→stepFrame」bellRungAt/stageTimes 逐比特一致;复位后无残留(state 全零);HUD 数字/阶段芯片/铃响时刻正确;控制台无 error、无 warning(已修 three 0.185 的 PCFSoftShadowMap 弃用警告);隐藏标签页(RAF 长时间暂停)下 stepFrame 正常、无物理爆炸。
- 性能:物理 2.35ms/帧(Node 实测,链条最繁忙段);隐藏标签页强制逐帧渲染 18.5ms/帧(GPU 被降级调度的悲观值)。场景 ~90 网格 + 单 2048 阴影贴图、无后处理,可见标签页 1080p 60fps 预期达标,但**未在可见标签页实测 fps**(preview 面板限制)。

## 已知限制

- 发球台交接偏慢:末牌平推后必然贴角拖拽 + 台缘慢速交接,球在台缘停留约 2s 才下坡(确定性不受影响,视觉上是「悬念」而非卡死;实测多种参数无法在保持机制纯净下消除)。
- 60fps 未在可见标签页实测(见上);慢动作是实时时间缩放(确定性不受影响),不是录制回放(L4 未做)。
- 多米诺不可用户编辑摆放(L4 未做);机关 5 种未达 8 种(L4 未做)。
- 铃声开始前需一次用户手势解锁 AudioContext(触发按钮已兼职此事)。

## 后续可做

- 拖拽编辑多米诺摆位(L4);录制 tick 流做真回放;机关扩展到 8 种(L4)。
- 可见标签页实测 60fps 补证;缩短发球台交接时间(需重新设计末牌→球的传力几何)。
