# Web3dTest 项目规则

## 1. 命名规范

所有任务目录统一使用 `LLM-Mission-Other` 格式命名：

```
{模型名称}-{任务类型}-{变体描述}
```

示例：
- `claudeopus4.8-ocean-webgpu` — Claude Opus 4.8 生成的海洋模拟，WebGPU 方案
- `gpt-ocean-skill` — GPT Skill 模式生成的海洋模拟
- `doubao2.1-ocean-webgpu` — 豆包 2.1 生成的海洋模拟，WebGPU 方案

规则说明：
- **LLM**：模型名称 + 版本号，如 `claudeopus4.8`、`gpt`、`doubao2.1`
- **Mission**：任务类型，如 `ocean`（海洋模拟）、`terrain`（地形渲染）等
- **Other**：变体描述，说明该版本的区分特征，如 `webgpu`、`weather`、`skill`、`normal`
- 同一任务 + 同一模型允许存在多个版本（命名不同即可）

## 2. 根目录结构

根目录仅存放以下内容：

- 各任务目录（按上述命名规范）
- 本规则文档（`RULES.md`）
- 统一资源管理文件与目录：
  - `index.html`（门户）、`package.json` / `package-lock.json`
  - `scripts/`（启动与校验脚本:`dev-all.mjs` / `sync-check.mjs`）
  - `benchmark/`（评测体系与单一事实源 `registry.json`）
  - `shared/`（公用资源库:assets / fixtures / rubrics / schema）

其他所有内容（源码、配置、文档、依赖等）一律放在各自的任务目录下。

## 3. 交接文档与改动记录

每个任务目录下必须维护：

- **交接文档**（`HANDOVER.md`）：记录当前项目状态、技术方案、已知问题、后续计划，供接手者快速了解
- **历史改动清单**（`CHANGELOG.md`）：记录每次调整和改动的内容、时间、原因

每次对任务进行调整或改动时，必须同步更新这两个文件。

## 4. 门户与端口规范

**单一事实源:`benchmark/registry.json`。** 项目清单、模型归属、端口、门户卡片信息全部记录于此。`index.html`（门户）、`package.json`（workspaces）、本文件端口表都以它为准；`npm run dev` 直接读取它启动全部服务，不再手工维护 `concurrently` 字符串与 `-n/-c` 数组。

端口分配原则：

- `3000` 保留给门户首页（`index.html`）
- `3001` 起按任务目录依次分配，**递增且不复用**（删除目录后其端口号留空，不要回收给新目录）

**每次新增 / 改名 / 删除任务目录，按以下步骤（缺一不可）：**

1. **改 registry**：在 `benchmark/registry.json` 的 `projects` 增删改一条（含 `dir` / `port` / `model` / `mission` / `api` / `lang` / `title` / `desc` 等）。
2. **改 workspaces**：在 `package.json` 的 `workspaces` 同步增删目录名。
3. **加门户卡片**：在 `index.html` 对应分区新增卡片（模型徽章、API 徽章：`WebGPU` 用 `badge-api`，`WebGL` / `Canvas` 用 `badge-api webgl`；标题、一句话描述、技术栈、端口号）。
4. **校验**：运行 `npm run sync:check`，确认 registry / package.json / index.html / RULES 四方一致。
5. **更新下方端口表**。

启动方式：

- `npm run dev` — 门户 + 全部项目
- `npm run dev:one -- <目录名或端口>` — 只启动单个项目

当前端口分配表：

| 端口 | 任务目录 |
|------|----------|
| 3000 | （门户首页 index.html） |
| 3001 | claudeopus4.8-ocean-webgpu |
| 3002 | gpt5.5-ocean-weather |
| 3003 | doubao2.1-ocean-webgpu |
| 3004 | gpt5.5-ocean-skill |
| 3005 | claudefable5-ocean-realistic |
| 3006 | geminiflash3.5-ocean-realistic |
| 3007 | gpt5.5-ocean-realistic |
| 3008 | grok4.3-ocean-realistic |
| 3009 | claudefable5-kart-circuit |
| 3010 | geminiflash3.5-kart-circuit |
| 3011 | gpt5.5-kart-circuit |
| 3012 | geminiflash3.5-ocean-storm |
| 3013 | gpt5.5-ocean-webgpu |
| 3014 | claudeopus4.8-gsapthreetest |
| 3015 | claudesonnet5-ocean-storm |
| 3016 | gpt5.5-tank3D |
| 3017 | claudesonnet5-tank3D |
| 3018 | gpt5.5-powdergame |
| 3019 | mimov2.5-powdergame |
| 3020 | claudefable5-powdergame |
| 3021 | doubao2.1pro-powdergame |
| 3022 | geminiflash3.5-powdergame |
| 3023 | gpt5.5-ocean-pirate-ship |
| 3024 | gpt5.6sol-ocean |
| 3025 | claudefable5-manhattan-procedural |
| 3026 | gpt5.6sol-powdergame |
| 3027 | claudefable5-gallery-lighting |
| 3028 | claudefable5-cloth-flag |
| 3029 | claudefable5-domino-rube |
| 3030 | claudefable5-bowling-physics |
| 3031 | claudefable5-datagrid-virtual |

## 5. 测试方法论(评测基础规则)

本仓库不只是场景合集，更是一套模型能力测试体系。**所有测试以 [`benchmark/methodology.md`](benchmark/methodology.md) 为基础规则**：

- **三层变量锁定**（输入锁 / 参数锁 / 评判锁）—— 每次只让被测模型变化。
- **两种模式**：A 公平固定（主榜）/ B 各自最优（能力上限）。
- **抗随机 + 抗污染**：每题跑 n≥3 记方差；任务库分 `public` / `private`，`private` 季度轮换、建议 gitignore。
- **通用六轴 + 各类别专项**：评分卡见 [`shared/rubrics/`](shared/rubrics/)，各类别规则见 [`benchmark/categories/`](benchmark/categories/)。
- **可复现**：测试单元 / 运行记录 schema 见 [`shared/schema/`](shared/schema/)，产物归档 `benchmark/runs/`。

能力类别：`code-to-3d`（现役）· `code-to-ui`（现役）· `vlm-aesthetic` ★ · `agent-tooluse` ★ · `llm` · `text-to-image` · `text-to-video` · `text-to-3d`。
