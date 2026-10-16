# 交接文档

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3023 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3023，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 当前状态

`gpt5.5-ocean-pirate-ship` 是一个 Three.js + Vite 的 WebGL 海面模拟项目，端口为 `3023`。海面渲染参考并复用 `claudefable5-ocean-realistic`，重点新增了海盗船 GLB 模型加载和随浪漂浮。

## 技术方案

- 海面：保留 fable 版 Gerstner（特罗科伊德）波谱、海面 shader、天空 shader、泡沫、菲涅尔反射和距离雾。
- 船体：`public/models/medium_pirate_ship.glb` 来自根目录 `blender/models/medium_pirate_ship.glb`。
- 漂浮：`src/ship/pirateShip.js` 调用 `sampleHeight` 采样海面高度，使用船头/船尾高度差计算俯仰，左右舷高度差计算横摇。
- 光照：`RoomEnvironment` 提供环境反射，方向光、半球光和点光源辅助 PBR（金属/粗糙度）材质表现。

## 已知问题

- 海面本身是自定义 `ShaderMaterial`，视觉上有高光和泡沫，但不是 three.js 标准水体材质；它不会像标准 PBR 材质一样接收船体阴影。
- 船体漂浮是视觉近似，没有做真实刚体、浮力体积或碰撞。

## 后续计划

- 可加入船尾航迹泡沫，让船体与海面互动更强。
- 可把海盗船模型改成可切换资产，用同一海面评估不同模型生成的船只。
- 可增加浏览器自动化截图，用于和 fable 原版海面做并排视觉回归。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/gpt5.5-ocean-pirate-ship/`。
- 独立调试：根目录运行 `npm run dev:one -- gpt5.5-ocean-pirate-ship`，端口 3023。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。

2026-10-01 共享资产迁移：相同 GLB 按 SHA-256 核对后移入 shared/assets，通过 Vite ?url 导入；生产构建会输出资源副本。资源来源与授权限制仍遵守原项目来源文档。
