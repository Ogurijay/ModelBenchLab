<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/claudefable5-fire-raymarch/ 。
并行开发（仓库根目录）：`npm run dev:one -- claudefable5-fire-raymarch`，访问 http://localhost:3033/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

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
npm run dev:one -- claudefable5-fire-raymarch
```

独立构建:

```powershell
npm --prefix claudefable5-fire-raymarch run build
```

正式任务要求以仓库内 `fire` 任务文档和 `code-to-3d` 评分规则为准。
