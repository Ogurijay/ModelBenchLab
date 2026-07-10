# HANDOVER — claudefable5-manhattan-procedural

> 交接文档:当前状态 / 技术方案 / 已知问题 / 后续计划。改动请同步更新本文件与 CHANGELOG.md。

## 当前状态(2026-07-10)

- **可运行、可评分**。`npm run dev` → 127.0.0.1:3025;20 个单测全绿;控制台 0 错误 0 警告。
- 实测(桌面 1080p):~165fps · ~110 draw call · ~213k 三角形 · 城市生成 ~60ms。
- 对照 [`benchmark/tasks/code-to-3d/manhattan.md`](../benchmark/tasks/code-to-3d/manhattan.md) 五能力清单逐条已实现,QA 截图在 `docs/qa/`。

## 架构

```
src/
├─ core/    prng(mulberry32+fork) · noise(值噪声/fBm) · solar(太阳方位) · catenary(悬链线) · shaderpatch(积雪/树摇/立面UV 全局补丁)
├─ city/    plan(纯数学规划,可单测) → ground(画布路网贴图+水面) · buildings(5套立面实例化+楔形楼) · landmarks(四地标) · park(雕刻地形) · statue(自由女神) · bridge(大桥) · props(路灯/红绿灯/蒸汽/广告牌)
├─ sky/     着色器天穹(太阳/月/星/云幕/闪光) + 平行光/半球光联动
├─ weather/ weather(6预设+指数过渡+体积云) · precip(雨雪实例粒子) · lightning(闪电+WebAudio雷声)
├─ sim/     traffic(车道图+信号+跟车) · agents(鸟/直升机/船)
└─ ui/      panel(中文控制面板) · hud(统计面板)
```

关键设计:

1. **城市 = f(种子)**:`plan.js` 纯数学无 three 依赖;`Rng.fork(tag)` 派生独立子流,增删某系统的随机调用不影响其他系统。重建 = 整组 dispose 后重生成(disposables 数组统一登记)。
2. **全局 shader 补丁**(`core/shaderpatch.js`):积雪(按世界朝上法线混白)、树摇(实例位置取相位)、立面 UV(实例属性 aRep 控制窗格重复),经 `onBeforeCompile` 链式注入,`globalUniforms` 单例被天气系统直接驱动。
3. **实例矩阵复用**:车身/车顶/刹车灯/大灯光池四个 InstancedMesh 共享同一矩阵(局部偏移烘进几何),每帧只算一次位姿。
4. **信号可视与仿真分离**:traffic 计算相位,仅在状态变化时调 props.setNodeState 写 instanceColor。
5. 天空调色板在 JS 算好传 uniform(雾色=地平线色),保证雾/天空/光照三者一致。

## 已知问题 / 边界

- 街道路面夜间偏暗(有意保留;路灯光池 + 车灯光池提供照明感)。
- 路口转向为直线插值过桥,极少数情况下两车在路口内视觉重叠(轻量仿真的通病,未做路口冲突消解)。
- 雨/雪以相机-观察点混合位置为中心循环,极远观察时近相机处无粒子(半径 135m)。
- 广告牌只面向大道/百老汇方向,沿街正视才可读(时代广场设定如此)。
- D3D/ANGLE 环境下 three 内部 shader 有一次性 X4122 精度 warning?——已在当前版本消除(控制台干净);若换 GPU 档位复现,属驱动噪声无功能影响。
- `plan.test.js` 的 `JSON.stringify` 全量对比较重(~10ms),够用;若规划扩容可换哈希。

## 后续计划(可选)

- [ ] 移动端档位:按 devicePixelRatio 降 shadow map(4096→2048)、雨雪减半。
- [ ] 路口冲突消解(转向让直行)。
- [ ] 中央公园水塘结冰(雪天 wet→ice 材质切换)。
- [ ] 环境立方体贴图按时段重生成(现为静态渐变,夜间玻璃反射偏亮)。
- [ ] Battery 公园加渡轮码头,渡轮航线靠泊。

## 评测提示

- 种子固定集 {1337, 2026, 42};`__manhattan.stats()` 可取生成统计做确定性对拍;`__manhattan.strike()` 强制闪电。
- 完整昼夜:自动昼夜 240× 下 6 分钟一天;720× 下 2 分钟。
- 积雪/湿地面过渡各约 6s/4s,切天气后稍等再截图。
