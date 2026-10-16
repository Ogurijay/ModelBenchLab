<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# Claude Opus 5 Manhattan Procedural 交接

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3044 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 测试和截图脚本的新产物改写入 tmp/，避免覆盖历史证据或触发开发服务监听；原有归档不移动。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 当前状态

- 状态：可构建，单元测试通过后可纳入主仓。
- 独立调试端口：`3044`。
- 技术栈：Vite、Three.js、Vitest。
- 任务合同：`docs/CONTRACT.md`。

## 验证

```powershell
npm test
npm run build
```

## 注意事项

- 交通车辆数和天气时间常数属于冻结评测参数，不应脱离合同单独调整。
- Three.js 当前依赖范围为 `^0.185.1`。
- 构建时可能出现大于 500 kB 的 chunk（代码块）提示，后续可单独做代码分割。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/claudeopus5-manhattan-procedural/`。
- 独立调试：根目录运行 `npm run dev:one -- claudeopus5-manhattan-procedural`，端口 3044。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
