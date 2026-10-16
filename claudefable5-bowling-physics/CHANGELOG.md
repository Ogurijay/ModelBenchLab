<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# CHANGELOG — claudefable5-bowling-physics

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3030 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3030，端口被占用时报错，不自动换号。
- 独立 Vite 配置补齐登记端口/strictPort，直接启动也遵守端口约定。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


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

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。
