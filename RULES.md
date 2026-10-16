# ModelBenchLab 项目规则

## 1. 命名与身份

新任务目录使用 `{模型名称}-{任务类型}-{变体描述}`，例如 `gpt6-ocean-observatory`。模型名含版本；Mission 与 Variant 的规范身份以 `benchmark/registry.json` 为准。目录改名必须同步 registry、workspaces、lockfile、文档及源码引用。

已改名项目的旧目录名记录在 `projects[].aliases`，根开发服务将旧地址重定向到新地址；aliases 不是实体目录或额外项目。任务身份由 `task_id + task_version` 定义，不随目录改名改变。

## 2. 根目录与公共内容

根目录只保留登记任务、`RULES.md`、`index.html`、`package.json`、`package-lock.json`、`vite.config.mjs`、`.gitignore`、`scripts/`、`benchmark/`、`shared/`。

允许的本地工具目录：`.git/`、`.agents/`、`.claude/`、`.codex/`、`.playwright-mcp/`、`tmp/`。工具目录中除 Git 外的内容不提交。`node_modules/` 是 npm workspace 自动生成的公共或嵌套依赖目录，`dist/`、`build/` 为忽略的构建产物；不是任务目录。未知根目录由结构校验报错。

项目源码、独有配置和项目文档放在任务目录；公共开发工具依赖由根 package.json 显式声明。公共二进制资源存 `shared/assets/`，建模源文件、生成脚本与报告可作为资产包同置，例如 `shared/assets/blender/`。

## 3. 交接与改动记录

每个任务根目录必须有 `README.md`、`HANDOVER.md`、`CHANGELOG.md`。交接记录当前状态、技术方案、已知问题、下一步；改动记录写明日期、内容和原因。每次改动同步这两份文件。`docs/` 可存设计及验收材料，不能替代根交接文件。

registry 的 `docs` 布尔标记与 `docPaths` 路径须对应真实文件。补建文档必须区分本轮静态核验与历史运行结论；无法恢复的开发历史、原始 prompt 和评测证据写明待补，不推断完成。

## 4. 登记、安装与访问

项目、模型、调试端口与门户信息以 `benchmark/registry.json` 为唯一清单源，门户动态读取它。全部项目都需有 package.json 并纳入 workspaces；纯静态任务使用零运行时依赖 manifest，无需添加构建工具。

门户按“主题大类 → 项目系列 → 模型实现”展示：`portalSections[]` 定义主题，`groups[]` 定义系列，系列的 `missions[]` 引用已有任务。每个 mission 必须且只能归属一个系列，主题与系列 ID 各自唯一。相似玩法可合组展示（如 brawler/digimon），但展示分类不改变能力类别、task_id/task_version 或评测可比范围。物理目录继续平铺，不随门户主题移动项目。

常规预览服务唯一端口为 **3000**：根目录 `npm run dev`；门户 `/`，项目 `/<dir>/`。多个页面或会话复用同一个根服务，启动前检查端口及进程归属；已有本仓库服务时直接复用，不重复启动、抢占端口或自动换端口。`dev:one` 用于独立调试和并行开发隔离：根目录 `npm run dev:one -- <目录、旧别名或登记端口>`。项目配置及当前 README 的调试端口须一致。

新端口递增且不复用。历史待整合项目可以恢复其原已分配端口；删除的端口列入 `retiredPorts`。新增/改名/删除项目需同步 registry、workspaces、lockfile，执行 npm install（结构整理使用 `--offline --ignore-scripts`，保持已解析版本），最后运行 `npm run sync:check`。

各项目 index.html 的本地 src/href 使用相对路径。根 Vite 负责嵌套 public 回落、旧别名跳转与多版本 Three.js 就近解析，不能强制合并 Three.js。公共资产使用相对 `?url` import，生产构建由 Vite 输出；根配置提供 `@shared`，独立项目使用该别名前也须在自己的配置声明。

### 4.1 并行开发与刷新隔离

- 多个子项目同时持续修改源码、生成资源或调整配置时，优先各用 `dev:one` 在登记端口运行，Vite root 必须为各自项目目录。门户预览仍使用 3000；独立调试不得复用根服务的依赖缓存，保留 Vite 按项目生成的 `node_modules/.vite/`。只管理本会话启动且归属明确的进程，不结束其他项目的服务。
- 子目录的 `npm run dev` 与已有 `npm run preview` 也必须使用本项目登记端口并启用 `strictPort`；生产预览与独立开发交替使用该端口，不另占默认或未登记端口。README 必须说明统一预览、并行开发和临时产物位置；纯静态项目可继续只用根目录 `dev:one`，无需添加依赖或启动脚本。
- 共用 3000 时必须保留 `scripts/project-hmr.mjs`。项目 JS、资源引发的全页刷新只发送到所属项目及实际跨项目引用者的 HTML 入口；本项目 CSS HMR、嵌套页面与跨项目依赖更新必须正常。不能用全局关闭 HMR、吞掉所有刷新消息或定时刷新页面处理干扰。
- 根服务使用 `optimizeDeps.noDiscovery: true` 和显式 `include`，在启动时完成必要依赖的预打包，避免新开项目页面触发再次预打包及全局刷新。新增 CommonJS 依赖或需要预打包的深层入口时，同步维护根配置的 `include`；多版本 `three` 继续排除。不能删除缓存或使用 `--force` 作为日常启动流程。
- 构建产物放各项目 `dist/`、`build/`；截图、测试报告、临时 HTML、录制和生成中间产物放 `tmp/`。根服务忽略这些目录及本地工具目录的文件监听。实际运行所需的源码、`public/` 与资源仍需监听，不能把整个兄弟项目或 `shared/` 排除。
- 根配置、公共脚本、依赖安装、lockfile 与共享运行资源的修改可能影响所有页面；并行任务应合并必要变更，安装依赖串行执行，避免反复重启公共服务。新增/改名项目完成登记后统一重启根服务，使路由和隔离清单生效。
- 出现连续刷新时先检查服务归属、Vite 日志及 WebSocket 的 `full-reload`、`path`、`triggeredBy`；区分项目资源变更、依赖重新预打包和公共配置重启。改动公共开发服务后运行 `npm run policy:test`、`npm run sync:check`，验证兄弟项目不被误刷新，同时本项目热更新仍有效。

## 5. 评测与规则优先级

正式评测遵守 `benchmark/methodology.md`；专项类别与 rubric 细化它，具体 task 的版本化专项 rubric 可覆盖通用权重，但必须显式记录 `rubric_profile`。历史项目存在或构建通过不等于已完成正式评测。

`benchmark/tasks/index.json` 关联 mission、题面和结构化测试单元；projects 的 task_id/task_version 必须匹配。公共测试单元在 `benchmark/tasks/public/`；私有题在被忽略的 `benchmark/tasks/private/` 或 `shared/fixtures/**/private/`。输入冻结后禁止原地改题：新建版本并更新索引；旧运行仍引用旧版本。

测试单元区分 `draft` 与 `frozen`。缺少逐字输入、确切环境或评判脚本的历史项目只能是 draft，不进入公平主榜。A 公平固定为主榜必跑；B 各自最优可选，有 B 时并列展示，没跑标为未测。随机生成任务至少三次，报告均值与方差。

`npm run sync:check` 检查结构、清单、文档、任务 schema、资源与配置；`npm run benchmark:check` 检查已归档运行记录；`npm run benchmark:check -- --formal` 还要求登记任务 frozen 且有 A 模式完整采样。结构通过不代表功能、帧率、视觉或正式评测通过。
