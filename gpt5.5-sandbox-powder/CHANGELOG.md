# gpt5.5-sandbox-powder 改动记录

## 2026-07-03

- 新建 `gpt5.5-sandbox-powder` Vite + TypeScript 项目。
- 实现中文元素表，元素名保留符号：`水(H2O/WATR)`、`碱(BASE)`、`种子(SEED)` 等。
- 实现粒子模拟核心：重力、密度、流体、气体、热传导、相变、压力、风、燃烧、酸碱、电路、生命、高能粒子。
- 实现 Canvas 像素渲染、热量/压力/电路视图、鼠标和触控笔刷。
- 实现保存/读取、场景预设、环境参数控制和 `window.__powderGame` 调试桥。
- 添加 Vitest 测试，覆盖关键物理反应。
- 通过单元测试、生产构建和 Playwright 桌面/移动端烟测。

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。
- 目录由 `gpt5.5-powdergame` 调整为 `gpt5.5-sandbox-powder`；根服务保留旧地址跳转。
