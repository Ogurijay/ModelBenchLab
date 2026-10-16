# 历史改动清单

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3023 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3023，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 2026-06-27

- 新建 `gpt5.5-ocean-pirate-ship` 任务目录。
- 复制并保留 `claudefable5-ocean-realistic` 的海面波谱、shader、面板和波浪测试。
- 加入 `public/models/medium_pirate_ship.glb` 海盗船模型。
- 新增 `src/ship/pirateShip.js`，实现 GLB 加载、PBR 光照适配和随浪漂浮。
- 更新页面标题、HUD 船体加载状态和项目说明。

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。

2026-10-01 共享资产迁移：相同 GLB 按 SHA-256 核对后移入 shared/assets，通过 Vite ?url 导入；生产构建会输出资源副本。资源来源与授权限制仍遵守原项目来源文档。
