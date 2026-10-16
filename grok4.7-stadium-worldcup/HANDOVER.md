<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
本项目已显式使用 PCFShadowMap；效果与 r186 原先的自动回退结果一致。
<!-- /three-r186-migration -->

# 交接

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3047 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 状态

可运行。入口 `index.html`，逻辑在 `src/`。座位、踏步、C 值和楼梯位置只从 `src/bowlMath.js` 的 `buildProgram()` 来，界面上的 85,682 是这次运行的实际落位数，不是写死的。

## 结构

- `bowlMath.js`：圆角矩形、踏步、径向布座、包厢、楼梯锚点
- `buildBowl.js`：踏步壳体、看台座椅、斜梁
- `buildRoof.js`：桁架、膜屋面、桅柱、灯位
- `buildFacade.js`：鳍片、腰梁、玻璃、基座
- `buildInterior.js`：环廊、楼梯、包厢、通道、更衣室、发布厅，以及漫游用的地面
- `buildPitch.js` / `buildSite.js`：场地与周边
- `walk.js` / `main.js`：漫游、视图、昼夜

## 已知限制

- 剖切是裁剪面，断面没有封口，壳体在剖面上会看成两层皮
- 上层看台挑在俱乐部层之上，净空在计算里核对过，但斜梁仍然比较示意
- 夜景用 8 盏聚光灯照场地，不是逐盏真实灯具配光
- 第一人称靠地面采样，不是完整墙体碰撞；宽台阶可以走，窄门洞靠地面是否连通

## 核对

`npm run audit` 打印座位数、C 值、疏散时间和俱乐部 / 上层的竖向净空。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/grok4.7-stadium-worldcup/`。
- 独立调试：根目录运行 `npm run dev:one -- grok4.7-stadium-worldcup`，端口 3047。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
