# Claude Fable 5 实体火焰

本项目是 `fire`（实体火焰）任务的 Claude Fable 5 实现，使用 Three.js r185 与 WebGL（网页图形接口）构建可环绕观察的体积火焰场景。

## 核心能力

- 使用 ray marching（光线步进）在三维密度场中合成火焰，不依赖平面贴图。
- 表现高温核心、明亮主焰和橙红外焰，并提供热浪折射效果。
- 火光、火星和烟羽会随火势、湍流与风向变化。
- 提供中文控制面板，支持质量档位、暂停和视角重置。
- 暴露 `window.__bench` 评测钩子，支持固定步长回放和状态读取。

## 运行方式

在仓库根目录运行：

```powershell
npm run dev:one claudefable5-fire-raymarch
```

独立构建：

```powershell
npm --prefix claudefable5-fire-raymarch run build
```

正式任务要求以仓库内 `fire` 任务文档和 `code-to-3d` 评分规则为准。
