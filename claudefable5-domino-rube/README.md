<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/claudefable5-domino-rube/ 。
并行开发（仓库根目录）：`npm run dev:one -- claudefable5-domino-rube`，访问 http://localhost:3029/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 多米诺·鲁布戈德堡机关(claudefable5-domino-rube)

Claude Fable 5 对 benchmark mission **domino**(code-to-3d)的作答:
Three.js + cannon-es 实现的五连锁鲁布戈德堡机关,固定 timestep 确定性物理,
「触发 → 复位」可无限重复且每次结果逐比特一致。

## 机关链

**多米诺骨牌弧线(25 张)→ 重球沿斜坡滚落 → 高架直道飞落跷跷板(带止挡块的杠杆)→ 弹射杯抛出小球 → 摆锤(铰链单摆)→ 终点铃铛**(合成钟声 + 发光脉冲 + 彩屑)

链条已经 headless + 浏览器双端实测:同会话内连续「触发→复位」多次,`bellRungAt` 与各阶段时刻逐比特一致;
一键回归:`node scripts/verify-chain.mjs`。

## 启动

```bash
npm install     # 依赖由仓库主会话统一安装
npm run dev     # Vite 开发服务器(本项目登记端口 3029)
```

打开浏览器访问终端输出的地址即可。

## 操作

| 操作 | 按键 / 按钮 |
|---|---|
| 触发机关 | `空格` 或「▶ 触发机关」 |
| 复位(完全重建物理世界) | `R` 或「↺ 复位」 |
| 切换相机(自动运镜 ⇄ 手动轨道) | `C` 或「📷 相机」按钮 |
| 慢动作 | `S` 或「🐢 慢动作」按钮 |
| 手动相机 | 左键旋转 / 右键平移 / 滚轮缩放 |

## 调试钩子

```js
window.__bench.getState()   // { triggered, currentStage, bellRung, bellRungAt, simTime, ... }
window.__bench.stepFrame(n) // 手动推进 n 个渲染帧(RAF 暂停时也可用)
window.__bench.trigger()    // 等价点击触发
window.__bench.reset()      // 等价点击复位
```

## 确定性说明

- 物理固定步长 `1/120 s`,累加器与渲染帧率完全解耦;
- 触发前物理世界冻结,触发即从 tick 0 开始步进 → 与点击时机无关;
- 复位 = 丢弃并完整重建整个 `CANNON.World`(含全部刚体/约束),禁用 sleep;
- `bellRungAt` 以仿真时间计,多次运行严格一致。

全部纹理为 canvas 程序化生成,全部音效为 WebAudio 合成,零外部资产。
