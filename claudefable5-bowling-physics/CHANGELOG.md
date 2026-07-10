# CHANGELOG — claudefable5-bowling-physics

## 2026-07-10 静态审查修复轮

- 端口修正:`vite.config.js` 3026 → **3027**,与 `benchmark/registry.json` 登记一致(3026 属 claudefable5-domino-rube,原值会端口冲突);README/HANDOVER 同步
- `__bench.ready` 改为 main.js 初始化末尾**同步置位**(先同步渲染首帧再置 true),不再依赖首个 rAF 回调——隐藏标签页下 rAF 停摆时评测轮询 ready 不会超时;rAF 主循环照常启动
- 沟球判定窗口补齐:`physics.js` 由「z > 头瓶前 0.35m」扩展为「z > 瓶台尽头 LANE_END_Z(落坑不判)」,瓶区最后一段才越界的球同样立即置 gutter 并剔除瓶碰撞掩码,严格满足「落沟后不再碰瓶」;浏览器实测三场景(晚越界 / 落坑不误判 / 早段常规洗沟)均符合预期
- 消除 three 0.185 弃用警告:`scene.js` `PCFSoftShadowMap` → `PCFShadowMap`(0.185 中前者已弃用且每次实例化刷 console 警告,违背「无控制台报错」目标)
- 依赖确认就位(主会话根 workspaces 安装,本目录 three@0.185.1);浏览器实测:ready=true、scoreTest 10/10、整局流程走通、fps 60、控制台无 error

## 2026-07-10 初版实现

- 一局完整 3D 保龄球:标准 10 瓶三角摆位、两侧边沟(落沟后碰撞掩码剔除瓶组,保证不再碰瓶)
- 投球三参数:蓄力条振荡定格力度、±9° 左右瞄准、侧旋滑杆(简化 Magnus 每步侧向力,球路实际弯曲 + 弧线预览所见即所得)
- cannon-es 固定 1/120s 步长;瓶为低重心两段圆柱复合刚体(mass 0.7,重心离底 0.14m);球 mass 5;倾角 > 60° 判倒;瓶静定(sleep/低速 + 超时)后才结算
- 计分独立纯函数模块 `src/scoring.js`(rolls → 各轮得分/累计,第 10 轮 strike 补 2、spare 补 1、最多 3 投);`src/scoring-test.js` 内置任务文档 10 组冻结序列,页面「运行计分自测」逐组 pass/fail,node 验证 10/10
- 记分板 HTML 表格:每轮两(三)投明细(X、/、- 记号)+ 累计分,当前轮琥珀高亮,加分未凑齐时留空
- 状态机:瞄准 → 蓄力 → 滚球 → 静定 → 扫瓶机动画(下压/前扫/归位,L4)→ 下一投;一局结束结算弹窗 + 「再来一局」完全重置
- 深夜霓虹球馆视觉:clearcoat 反光枫木球道(canvas 程序化木纹/箭头/引导点)、护墙霓虹光带、霓虹招牌、荧光地毯、邻道陪衬、三段式运镜;大理石纹球 + 随行点光
- WebAudio 程序化音效:滚球隆隆、撞瓶木响(节流)、洗沟闷响、strike/spare/结算旋律;全项目零外部资产
- `window.__bench = { ready, stepFrame(n), getState(), scoreTest() }` 调试钩子
- 文档:README(启动/操作)、HANDOVER(架构/钩子/限制)、CHANGELOG
