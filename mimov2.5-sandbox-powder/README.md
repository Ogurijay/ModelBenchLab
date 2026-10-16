<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/mimov2.5-sandbox-powder/ 。
并行开发（仓库根目录）：`npm run dev:one -- mimov2.5-sandbox-powder`，访问 http://localhost:3019/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 粉末物理沙盒 — 全中文 100+ 元素

The Powder Toy 复刻版，100+ 元素含中文符号，温度/压力/热传导物理，12+ 种化学反应，相变系统，全中文 UI
