<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/claudefable5-bowling-physics/ 。
并行开发（仓库根目录）：`npm run dev:one -- claudefable5-bowling-physics`，访问 http://localhost:3030/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 霓虹保龄球馆 — claudefable5-bowling-physics

Claude Fable 5 作答的 code-to-3d **bowling** mission:Three.js + cannon-es 实现的一局完整 3D 保龄球,深夜荧光球馆(cosmic bowling)氛围,全中文 UI。

- 标准 10 瓶三角摆位、两侧边沟(落沟后不再碰瓶)
- 力度(蓄力条振荡定格)/ 方向(左右瞄准)/ 侧旋(hook,实际弯曲球路 + 弧线预览)
- cannon-es 固定 1/120s 步长;瓶为低重心复合刚体;倾角 > 60° 判倒
- 十轮计分为独立纯函数模块(`src/scoring.js`),内置 10 组冻结序列自测(300/90/150/133/0/267/200/30/82/101)
- 记分板每轮明细 + 累计分,当前轮高亮;第 10 轮补投特判
- 一局结束结算 + 「再来一局」完全重置;扫瓶机动画
- 纹理 / 音效全部程序化生成(canvas 纹理 + WebAudio 合成),零外部资产

## 启动

依赖由仓库主会话统一安装(workspace,已就位:本目录 `node_modules/three@0.185.1`,cannon-es / vite 由根 hoisted 提供)。端口 **3027** 与 `benchmark/registry.json` 登记一致。

```bash
npm run dev      # vite,登记端口 3030(见 vite.config.js)
```

浏览器打开 `http://localhost:3030/`。

## 操作

| 操作 | 说明 |
|---|---|
| ← / → 或 ◀ ▶ 按钮 | 左右瞄准(±9°) |
| 侧旋滑杆 | 左曲 ↔ 右曲,实际影响球路弧线(瞄准线实时预览) |
| 空格 / 出手按钮 | 第一次:开始蓄力(力度条往返振荡);第二次:定格力度出手 |
| 运行计分自测 | 对 10 组冻结投球序列断言总分,逐组显示 pass / fail |
| 再来一局 | 完全重置对局 |

## 调试钩子

```js
window.__bench.ready        // 初始化完成(同步置位,不依赖 rAF,隐藏标签页下轮询可用)
window.__bench.stepFrame(n) // 手动推进 n 帧(每帧 1/60s,隐藏标签页可用)
window.__bench.getState()   // { phase, frame, rollInFrame, rolls, total, standing, ball, fps... }
window.__bench.scoreTest()  // { passed, total } — 10 组计分自测
```
