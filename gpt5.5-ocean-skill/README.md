<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.5-ocean-skill/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.5-ocean-skill`，访问 http://localhost:3004/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# GPTSkill Ocean

Three.js + Vite 的真实感海面模拟。核心效果基于 Gerstner wave（盖斯特纳波）和深水波色散关系，支持风速、风向、浪涌、浪峰、白沫和时间倍率调整。

## 运行

```powershell
npm install
npm run dev
```

## 验证

```powershell
npm run build
$env:OCEAN_URL="http://localhost:3004/"; npm run verify
```

`npm run verify` 会用 Playwright 检查桌面和移动端视口，确认 canvas 非空、画面有动态变化，并验证 OrbitControls（轨道相机控制）能拖动。
验证脚本会自动追加 `?preserveBuffer=1`，只在测试时打开 WebGL 后缓冲读取。

## 物理说明

更完整的模型说明在 [docs/physics-model.md](docs/physics-model.md)。
