<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# 交接 · PELAGIC 海洋观测站

## 2026-10-13 并行开发规则同步

- 测试和截图脚本的新产物改写入 tmp/，避免覆盖历史证据或触发开发服务监听；原有归档不移动。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


更新日期：2026-09-05。

## 权限与范围

用户要求“根据仓库的规则 实现一个海洋模拟网页”，授权实现、依赖登记和本地验证。遵守根 `RULES.md`、`benchmark/methodology.md` 与 ocean 公共核心要求。

新增 `gpt6-ocean-observatory/`；公共文件仅追加根 workspaces、registry 项目与对应 lockfile 记录。开始时根 `package.json`、`package-lock.json`、`benchmark/registry.json` 已修改，`claudeopus5-protomotion-parkour/` 已存在未跟踪内容；保留这些既有工作。未提交或推送 Git。

## 技术基线

- Three.js **0.185.1**，证据为根 lockfile 和已安装包；新 workspace 固定此版本。
- Vite **8.1.2**，npm workspaces，原生 JavaScript/CSS，WebGL 2。
- 2026-09-05 运行 `check-threejs-updates/scripts/detect-threejs-version.ps1`；仓库存在多版本，使用根最新基线，保持其他任务原依赖。
- 官方 [最新发布](https://github.com/mrdoob/three.js/releases/latest) 指向 [r185](https://github.com/mrdoob/three.js/releases/tag/r185)，无版本升级和 API 迁移。[迁移指南](https://github.com/mrdoob/three.js/wiki/Migration-Guide) 中 185→186 是开发迁移信息，不能作为稳定版已发布的证据。
- 核对 [ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)、[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)、[OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)、[BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html)、[MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)、[DirectionalLight](https://threejs.org/docs/pages/DirectionalLight.html)、[HemisphereLight](https://threejs.org/docs/pages/HemisphereLight.html)。使用 `three/addons/controls/OrbitControls.js`，自定义材质包含色调映射与输出色彩空间转换。
- 应用技能：frontend-design、check-threejs-updates、threejs-fundamentals/geometry/interaction/materials/lighting/shaders、web-access。CDP 前置检查未连接，公开官方信息经 web 工具核对。

## 模块

- `src/waves.js`：种子相位、预设、CPU Gerstner 采样和严格最大高度界限。有效波高按 `4 sqrt(sum(a² / 2))` 归一化。
- `src/shaders.js`：GPU 波面、解析法线、经过像素覆盖范围过滤的细浪、近似泡沫与天空散射。
- `src/ocean.js`：以相机为中心的指数半径网格、灯光/浮标、相机安全界限、画质和资源释放。
- `src/main.js`：UI、平滑参数过渡、模拟时钟、遥测图、截图、可访问性、上下文丢失提示。
- `src/audio.js`：用户手势后初始化本地海浪声；页面隐藏或模拟暂停时静音。
- `window.__oceanObservatory.snapshot()`：只读诊断快照，用于工程验证，未放入产品界面。

## 当前状态与验证

实现已完成，通过以下工程验证：

- `npm install --ignore-scripts --no-audit --no-fund --prefer-offline`：根目录成功，仅新增 1 个 workspace 链接，未升级已解析依赖。
- `npm run sync:check`：45 个项目，registry / workspaces / 目录 / 门户一致。
- `npm run test --workspace=gpt6-ocean-observatory`：5 项通过，覆盖确定性种子、有效波高归一化、3 组种子下的极端海面高度/法线、法线有限差分和风速周期。
- `npm run build --workspace=gpt6-ocean-observatory`：生产构建成功。引擎主包约 568 kB、gzip 约 145 kB，存在 Vite >500 kB 分块提示，不影响构建或运行。
- `node gpt6-ocean-observatory/tests/browser-smoke.mjs`：17 项通过，包含真实波浪相位暂停、预设、极端相机、浮标、画质、完整重置、纯净观海、说明对话框、音效开关、PNG 下载、全屏、快捷键、门户卡片、390×844 布局和减少动态效果。主页面无控制台异常、无失败网络请求。
- 已查看默认、平静、风暴和手机面板截图；调整天空明暗与文字对比，手机初始浮标放在可见画幅内。
- 性能：Windows / 无头 Chrome / ANGLE D3D11 / NVIDIA RTX 5070 Ti，1920×1080、DPR 1、均衡档、seed 71、远海涌浪、连续 30 秒，4951 个帧间隔，均值 **6.0605 ms（约 165 FPS）**、P95 **6.20 ms**，11 次绘制、137288 个三角形。观测的是 rAF 帧间隔，并非独立 GPU 时间或正式 A/B 性能评分。
- 截图与原始报告：`artifacts/desktop-default.png`、`desktop-calm.png`、`desktop-squall.png`、`desktop-1080p.png`、`mobile-default.png`、`mobile-controls.png`、`exported-ocean.png`、`browser-report.json`。
- 既存门户问题：根首页请求 `/favicon.ico` 返回 404，项目卡片正常；海洋子页使用自己的 `mark.svg`，无此错误。浏览器测试为门户开独立页面并记录 `portalWarnings`，避免把既存门户错误误算为子项目错误。
- 初次 Playwright 启动缺少 bundled headless shell，改用本机已安装 Chrome 成功，未下载或安装其他浏览器。
- 最终 `tests/final-smoke.mjs` 对源码入口和通过同一 3000 端口提供的 `dist/` 生产产物分别验证固定 seed/time、连续 H 往返、预设与原生滑块步长一致性、重置及控制台；两者均通过。详情见 `artifacts/final-report.json`，最终桌面截图为 `artifacts/desktop-final.png`。

工程测试不声称满足任意设备 60 FPS，也不代替用户视觉验收或正式模型评分。

## 接手顺序与局限

1. 在根目录 `npm run dev`，打开 http://localhost:3000/gpt6-ocean-observatory/。
2. 先看默认海况，再检查三种预设、最大波高、相机极限、手机布局和纯净观海。
3. 重跑 README 的校验命令；截图与报告位于本任务 `artifacts/`，不写入其他模型目录。
4. 如继续提高物理可信度，可独立增加波谱和动态浮力。已知的艺术近似和功能边界见 README。

尚未完成用户主观视觉验收、真实移动硬件运行及正式固定条件性能评分。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/gpt6-ocean-observatory/`。
- 独立调试：根目录运行 `npm run dev:one -- gpt6-ocean-observatory`，端口 3049。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
