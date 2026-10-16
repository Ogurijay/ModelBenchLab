<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# HANDOVER

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3036 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 测试和截图脚本的新产物改写入 tmp/，避免覆盖历史证据或触发开发服务监听；原有归档不移动。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 当前状态

`Manhattan Storm Shift` 是冻结 `manhattan / procedural` 任务的 GPT 5.6 SOL Ultra 实现。项目位于独立 workspace，常规从仓库单端口入口访问：

`http://localhost:3000/gpt5.6solultra-manhattan-procedural/`

独立调试端口为 3036。所有可视资产均在运行时由代码生成。

## 技术方案

- Three.js WebGLRenderer（WebGL 渲染器），程序化 `BufferGeometry` 与 `InstancedMesh`（实例化网格）。
- 种子驱动城市规划；太阳位置、悬链线、双峰高度场为独立可测纯函数。
- 交通和天气使用固定步长更新；浏览器自动动画与 `__BENCH__.step()` 共用同一仿真入口。
- UI 采用原生 HTML/CSS，视觉方向为纽约 Art Deco 市政控制台。
- 雷声由 WebAudio 程序合成，首次播放必须经用户手势解锁，这是浏览器安全策略要求。

## 验证入口

```powershell
npm --workspace gpt5.6solultra-manhattan-procedural test
npm --workspace gpt5.6solultra-manhattan-procedural run build
npm run sync:check
npm run dev:one -- 3036
```

视觉验收固定为 1920×1080，分别重建种子 1337、2026、42，覆盖六种天气、一个完整昼夜和自动/自由两种相机模式。浏览器控制台必须无错误。
## 2026-07-17 验收结果

- Vitest：5 个文件、32/32 测试通过；Vite 生产构建通过；根 `sync:check` 为 33/33 项目一致。
- 1920×1080、DPR 1 的 Chrome QA：全部 18 项断言通过，控制台错误 0、外网请求 0。
- 默认种子生成 382 个楼宇地块、5 个地标语义位、3600 个实例；同种子指纹完全一致，异种子不同。
- 固定步长快进 60 秒：144 辆车、114 次完成转向、红灯违规 0、碰撞 0、最小车距 1.8 m。
- 雷暴命中 One WTC 最高避雷点，端点误差 0；雷声延迟按 343 m/s 得到 1.189 s。
- 本机无头 Chrome 样本约 144 FPS、222k 三角形；draw call 采样 427，已满足帧率目标，但仍是后续合批优化重点。该数据只作本机回归证据，不代替固定 GPU 的正式榜单成绩。


## 维护注意

- 不得引入 GLB、贴图、HDRI、音频等二进制资产，否则违反冻结题面的硬约束。
- 重建城市时必须清理旧几何、材质与音频节点；性能回归应同时观察 FPS、draw call（绘制调用）、三角形和实例数。
- 修改场景能力或交互后，同步更新本文件与 `CHANGELOG.md`。
- 公平横评只与同 mission、同 `procedural` 变体比较；不要为单个模型修改冻结 prompt。

## 已知边界

- 这是可辨认的程序化曼哈顿语义复现，不是 GIS（地理信息系统）测绘级数字孪生。
- 程序化雷声需先点击“启用雷声”；未解锁时雷电仍正常显示，评测接口不会因此抛错。
- 性能目标以桌面 1920×1080、DPR 1 为基准；低端移动设备会自动受浏览器/GPU 能力限制。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/gpt5.6solultra-manhattan-procedural/`。
- 独立调试：根目录运行 `npm run dev:one -- gpt5.6solultra-manhattan-procedural`，端口 3036。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
