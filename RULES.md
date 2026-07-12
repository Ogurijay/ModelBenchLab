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
  - `index.html`（门户）、`package.json` / `package-lock.json`、`vite.config.mjs`（单端口开发服务配置）
  - `scripts/`（启动与校验脚本:`dev-one.mjs` / `sync-check.mjs`）
  - `benchmark/`（评测体系与单一事实源 `registry.json`）
  - `shared/`（公用资源库:assets / fixtures / rubrics / schema）

其他所有内容（源码、配置、文档、依赖等）一律放在各自的任务目录下。

## 3. 交接文档与改动记录

每个任务目录下必须维护：

- **交接文档**（`HANDOVER.md`）：记录当前项目状态、技术方案、已知问题、后续计划，供接手者快速了解
- **历史改动清单**（`CHANGELOG.md`）：记录每次调整和改动的内容、时间、原因

每次对任务进行调整或改动时，必须同步更新这两个文件。

## 4. 门户与访问规范(单端口)

**单一事实源:`benchmark/registry.json`。** 项目清单、模型归属、门户卡片信息全部记录于此;门户卡片由 `index.html` 在运行时读取 registry **自动生成**,不再手工维护。

**单端口模式:整个仓库只使用一个端口 `3000`。**

- 门户首页:`http://localhost:3000/`
- 各任务项目:`http://localhost:3000/<目录名>/`(如 `/claudefable5-ocean-realistic/`)
- 由根 `vite.config.mjs` 承载:多版本 three 靠 workspaces 嵌套 `node_modules` 就近解析;子项目的 `public/` 资源与根绝对路径引用由内置路由中间件自动回落
- 子项目编写要求:`index.html` 中的资源引用一律用**相对路径**(`./src/main.js`,不要 `/src/main.js`)

**每次新增 / 改名 / 删除任务目录,按以下步骤(缺一不可):**

1. **改 registry**:在 `benchmark/registry.json` 的 `projects` 增删改一条(含 `dir` / `port` / `model` / `mission` / `api` / `lang` / `title` / `desc` 等;新 mission 需同步在 `portalSections` 的 `missions` 里挂到某个分区)。`port` 仅供 `dev:one` 单独调试,仍按递增不复用登记。
2. **改 workspaces**:在 `package.json` 的 `workspaces` 同步增删目录名,并在根目录运行 `npm install`。
3. **校验**:运行 `npm run sync:check`,确认 registry / workspaces / 目录 / 门户一致。门户卡片无需手动添加——registry 登记后自动出现。

启动方式:

- `npm run dev` — 单端口 `:3000`,门户 + 全部项目(唯一常规方式)
- `npm run dev:one <目录名或端口>` — 用 registry 登记的独立端口单独调试某个项目

## 5. 测试方法论(评测基础规则)

本仓库不只是场景合集，更是一套模型能力测试体系。**所有测试以 [`benchmark/methodology.md`](benchmark/methodology.md) 为基础规则**：

- **三层变量锁定**（输入锁 / 参数锁 / 评判锁）—— 每次只让被测模型变化。
- **两种模式**：A 公平固定（主榜）/ B 各自最优（能力上限）。
- **抗随机 + 抗污染**：每题跑 n≥3 记方差；任务库分 `public` / `private`，`private` 季度轮换、建议 gitignore。
- **通用六轴 + 各类别专项**：评分卡见 [`shared/rubrics/`](shared/rubrics/)，各类别规则见 [`benchmark/categories/`](benchmark/categories/)。
- **可复现**：测试单元 / 运行记录 schema 见 [`shared/schema/`](shared/schema/)，产物归档 `benchmark/runs/`。

能力类别：`code-to-3d`（现役）· `code-to-ui`（现役）· `vlm-aesthetic` ★ · `agent-tooluse` ★ · `llm` · `text-to-image` · `text-to-video` · `text-to-3d`。
