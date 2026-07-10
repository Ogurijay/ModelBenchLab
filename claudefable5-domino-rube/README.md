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
npm run dev     # Vite 开发服务器(本项目预留端口 3026)
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
