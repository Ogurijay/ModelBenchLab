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
npm run dev      # vite,默认端口 3027(见 vite.config.js)
```

浏览器打开 `http://127.0.0.1:3027/`。

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
