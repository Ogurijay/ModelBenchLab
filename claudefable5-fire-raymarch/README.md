# Claude Fable 5 实体火焰 — 夜营篝火 · 体积光线步进

本项目是 `fire`(实体火焰)任务的 Claude Fable 5 实现(`benchmark/tasks/code-to-3d/fire.md`,冻结 v1 · 2026-07-15),使用 Three.js r185 与 WebGL2 构建可环绕观察的体积火焰场景。零外部资产,除 three 外无运行时依赖。

## 场景

深夜荒野篝火:石圈围着锥形柴堆,火焰从柴架中升起,舔着铁三脚架吊下的铜壶壶底;火星随热流升腾,烟羽在火尖上方被风吹散;火光摇曳,石头影子在沙地上晃动;天顶星光,冷月轻描轮廓——暖火与冷夜的对比构成画面的色彩骨架。

## 核心能力

- **真·体积光线步进**:全屏合成 pass 逐像素与体积包围盒求交,沿视线在三维密度场中积分发射-吸收(非切片、非 billboard);用场景深度截断步进区间,火焰被柴堆/铜壶正确遮挡;IGN 抖动消分层带,透射率 < 0.6% 提前终止。
- **域扭曲**(domain warping):双通道 FBM 扭曲采样空间,火舌自然卷曲、分叉、收尖;核心/主焰/外焰三层温度色由连续温度 ramp 给出。
- **火与烟同场积分**:一次 march 同时累积火焰发射与烟羽吸收,烟底承接火光染橙;热浪折射按视线到火焰轴的距离扭曲背景。
- **动态照明**:双点光与体积焰、柴堆炭红共享同一 CPU FBM 呼吸曲线,cube shadow 摇曳,照亮岩石/木柴/金属/沙土四类材质。
- **火星**:CPU 模拟(定种可复现)+ GPU 点精灵,浮力/湍流/风力/阻尼;画进 HDR 场景 RT,天然被几何与火焰体积遮挡。
- **HDR 管线**:场景渲染进 HalfFloat RT(线性),合成 pass 手动 ACES + 精确 sRGB。
- 中文控制面板:火势/湍流/风向/风力滑条、渲染质量四档(步进数单调递增)、暂停与视角重置;左下性能 HUD。
- `window.__bench` 评测钩子:固定步长回放、状态读取、脚本化调参、环绕取证、快照后备。

## 运行方式

仓库根目录单端口开发(推荐):

```powershell
npm run dev
# 访问 http://localhost:3000/claudefable5-fire-raymarch/
```

或单项目模式:

```powershell
npm run dev:one claudefable5-fire-raymarch
```

独立构建:

```powershell
npm --prefix claudefable5-fire-raymarch run build
```

正式任务要求以仓库内 `fire` 任务文档和 `code-to-3d` 评分规则为准。
