<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/gpt5.6solultra-portal-puzzle/ 。
并行开发（仓库根目录）：`npm run dev:one -- gpt5.6solultra-portal-puzzle`，访问 http://localhost:3035/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
本项目的 `npm run preview` 在构建后使用同一登记端口；先停止自己启动的独立开发服务再切换，端口占用时不会自动换号。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 折跃实验场 — 第一人称空间解谜

`gpt5.6solultra-portal-puzzle` 是 ModelBenchLab 的 `portal`（双门空间谜题）测试项目，由 GPT 5.6 SOL Ultra 生成。项目只借鉴“双入口连接空间、动量继续”的通用玩法机制，场景、美术、叙事、图标和音效均为原创或程序化生成。

## 玩法目标

1. 用鼠标左键在白色授权面放置冷色“主锚点”。
2. 用鼠标右键放置暖色“副锚点”。
3. 两个锚点连接后，穿入一端会从另一端离开；位置、视线与速度会一起变换。
4. 透过玻璃观察密封取样舱，把一个锚点部署到舱内墙面，再进入取出“相位立方体”。
5. 把立方体放到红色压力平台，等待北侧出口打开后离开试验舱。

## 操作

| 输入 | 功能 |
|---|---|
| `WASD` | 移动 |
| 鼠标 | 第一人称视角 |
| 鼠标左键 / 右键 | 放置主 / 副空间锚点 |
| `Space` | 跳跃 |
| `E` | 拾取 / 放下相位立方体 |
| `Shift` | 持续冲刺；3 秒内由 `6.4` 平滑提升至 `12.8`，中断后蓄速清零 |
| `R` | 完整重置谜题 |
| `Esc` | 释放鼠标并暂停 |

## 技术实现

- Three.js `0.185` + Vite `8`
- 两个 `WebGLRenderTarget`（WebGL 渲染目标）和虚拟相机生成门内实时出口视图
- 入口局部坐标 → 180° 翻转 → 出口世界坐标的统一位置 / 朝向 / 速度映射
- 自写运动学 AABB（轴对齐包围盒）玩家与立方体碰撞
- `1 / 120s` fixed timestep（固定时间步），单帧最多补算 7 步
- 独立冲刺状态机：只有 `Shift + 有效移动` 才累计 3 秒蓄速，松键、停步、失焦、退出指针锁定或完整重置都会立即清零
- 程序化材质、标识、微粒与 Web Audio（网页音频）合成提示音，零外部素材

## 运行与验证

从仓库根目录运行：

```powershell
npm run dev
# http://localhost:3000/gpt5.6solultra-portal-puzzle/

npm run dev:one -- gpt5.6solultra-portal-puzzle
# http://localhost:3035/

npm --workspace gpt5.6solultra-portal-puzzle test
npm --workspace gpt5.6solultra-portal-puzzle run build
```

自动验收接口：

```js
window.__bench.ready
window.__bench.getState()
window.__bench.stepFrame(120)
window.__bench.resetLevel()
window.__bench.teleportTest()
window.__bench.portalTest()
```

`teleportTest()` 验证运行时边界；`portalTest()` 则按冻结题面执行 10 组标准空间变换断言。
