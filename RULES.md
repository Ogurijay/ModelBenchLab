# Web3dTest 项目规则

## 1. 命名规范

所有任务目录统一使用 `LLM-Mission-Other` 格式命名：

```
{模型名称}-{任务类型}-{变体描述}
```

示例：
- `claudeopus4.8-ocean-webgpu` — Claude Opus 4.8 生成的海洋模拟，WebGPU 方案
- `gpt-ocean-skill` — GPT Skill 模式生成的海洋模拟
- `doubao2.1-ocean-weather` — 豆包 2.1 生成的海洋模拟，含天气系统

规则说明：
- **LLM**：模型名称 + 版本号，如 `claudeopus4.8`、`gpt`、`doubao2.1`
- **Mission**：任务类型，如 `ocean`（海洋模拟）、`terrain`（地形渲染）等
- **Other**：变体描述，说明该版本的区分特征，如 `webgpu`、`weather`、`skill`、`normal`
- 同一任务 + 同一模型允许存在多个版本（命名不同即可）

## 2. 根目录结构

根目录仅存放以下内容：

- 各任务目录（按上述命名规范）
- 本规则文档（`RULES.md`）
- 后续可能新建的统一资源管理文件

其他所有内容（源码、配置、文档、依赖等）一律放在各自的任务目录下。

## 3. 交接文档与改动记录

每个任务目录下必须维护：

- **交接文档**（`HANDOVER.md`）：记录当前项目状态、技术方案、已知问题、后续计划，供接手者快速了解
- **历史改动清单**（`CHANGELOG.md`）：记录每次调整和改动的内容、时间、原因

每次对任务进行调整或改动时，必须同步更新这两个文件。

## 4. 门户与端口规范

根目录的 `index.html`（统一门户首页）与 `package.json`（开发服务编排）属于「统一资源管理文件」。每个任务目录绑定一个固定端口，门户卡片链接到该端口启动的本地服务。

端口分配原则：

- `3000` 保留给门户首页（`index.html`）
- `3001` 起按任务目录依次分配，**递增且不复用**（删除目录后其端口号留空，不要回收给新目录）

**每次新增一个任务目录，必须同步完成以下两步（缺一不可）：**

1. **门户卡片**：在 `index.html` 对应分区（海洋 / 卡丁车 / …）新增一张卡片，包含：模型徽章、API 徽章（`WebGL` 用 `badge-api webgl`，`WebGPU` 用 `badge-api`）、标题、一句话描述、技术栈（Three.js / Vite 版本 + JS/TS）、端口号。
2. **端口配置**：在 `package.json` 中
   - 向 `dev` 脚本（`concurrently`）追加一条 `"vite --port <port> <目录名>"`，并在 `-n`（名称）与 `-c`（颜色）参数中补上对应项；
   - 增加一条 `"dev:<key>": "vite <目录名>"` 单独启动脚本。

当前端口分配表：

| 端口 | 任务目录 |
|------|----------|
| 3000 | （门户首页 index.html） |
| 3001 | claudeopus4.8-ocean-webgpu |
| 3002 | doubao2.1-ocean-weather |
| 3003 | gpt5.5-ocean-webgpu |
| 3004 | gpt5.5-ocean-skill |
| 3005 | claudefable5-ocean-realistic |
| 3006 | geminiflash3.5-ocean-realistic |
| 3007 | gpt5.5-ocean-realistic |
| 3008 | grok4.3-ocean-realistic |
| 3009 | claudefable5-kart-circuit |
| 3010 | geminiflash3.5-kart-circuit |
| 3011 | gpt5.5-kart-circuit |
