<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# 接手说明

## 2026-10-13 并行开发规则同步

- 测试和截图脚本的新产物改写入 tmp/，避免覆盖历史证据或触发开发服务监听；原有归档不移动。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 当前状态（2026-10-03）

- 项目：`claudeopus5.5-mini4wd-replica`，mission `mini4wd`，task `code3d-mini4wd-001` v1（draft，未冻结，不进入公平主榜）。
- 入口：`http://localhost:3000/claudeopus5.5-mini4wd-replica/`；独立调试端口 3058（`npm run dev:one -- claudeopus5.5-mini4wd-replica`）。
- 已登记：`benchmark/registry.json`、根 `package.json` workspaces、`package-lock.json`（`npm install --offline --ignore-scripts`）、`benchmark/tasks/code-to-3d/mini4wd.md` 实现列表。没有 Git 提交。
- 来源：用户要求“根据仓库里的四驱车案例做 Opus 5.5 版本，车的建模一定要接近四驱兄弟原型”。参照项目 `gpt6-mini4wd-room-racing` 未被修改（建模期间另有会话在改它）。

## 已交付

- 八台车（旋风冲锋、飓风音速号、新三角剑、进化者、极速眼镜蛇、蜘蛛王、巨无霸、魔鬼司令），四种底盘（AR / Super-II / Super-1 / FM-A），官方主图标定相机 + 三角测量建模，原型档案页列出识别要点。
- 车库：七槽改装且外观随改装变化；拆解结构 + 零件标签 + 点击拾取；缩略图实时生成。
- 比赛：三赛道 × 三场馆、3/5 车道换道桥、竞技 / 动画两种模式、冲出判定（飞台越墙、落地失稳、过弯翻出）、四种镜头、成绩与最佳纪录、本地存档。
- 验证：`node --test tests/*.test.js` 11 项通过；`tests/browser-smoke.mjs` 14 项通过（无控制台错误）；内置浏览器面板真实点击跑完一场 5 圈比赛；`npm run sync:check` 通过。

## 技术方案

- 几何：`src/model/geo.js` 的截面放样（loftX/Y/Z）+ 折线圆角 + 挤出 + 扫掠；单位毫米，场景内整体缩放 0.001。
- 涂装：`src/model/paint.js` 三向投影着色器（onBeforeCompile 注入），俯视 / 侧视 / 前视画布按法线混合；尾翼独立一层。
- 机位：每个车型的 `refViews` 记录标定结果，`?lab=<id>&view=ref` 复现官方照片视角。方法与精度见 `docs/MODELING.md`。
- 模拟：`src/game/sim.js` 固定 1/240 s 步长，沿车道一维积分（马达线性扭矩曲线、滚动 / 导轮摩擦 / 风阻 / 坡度 / 刹车海绵），竖直方向腾空积分；冲出用带种子的随机判定（同种子同结果）。
- 赛道：`src/game/track.js` 由直道 / 弯道件拼接，两段 `auto` 直道解析求闭合；换道桥让最外道跨到最内道，其余外移一道。

## 已知问题与限制

- 车型差异逐条记在 `docs/MODELING.md`：进化者前轮罩偏圆、巨无霸后段偏长偏平、新三角剑鼻部折面简化、贴纸为近似重绘。
- 背面 / 底部来自结构推导；物理参数为估计值，未做实车标定。
- 5 车比赛约 690 次绘制调用（含阴影）；赛车网格未按材质合并，低端设备可能需要优化。
- 未做手机布局；未接入门户以外的发布流程。

## 下一步建议

1. 让用户实际看车，按其指认的不像之处逐车再迭代（实验室页 + `tests/compare.mjs` 对照）。
2. 进化者前轮罩折边、巨无霸尾部高度、新三角剑鼻部 V 形折面是最值得继续修的三处。
3. 赛车按材质合并网格以降低绘制调用；必要时为比赛视图提供低细节车壳。
4. 若要进入正式评测，需先恢复 / 冻结 mini4wd 的原始题面与评判脚本（见任务文档“正式评测前待补”）。

## 检查命令

```powershell
npm run test --workspace claudeopus5.5-mini4wd-replica
npm run build --workspace claudeopus5.5-mini4wd-replica
npm run sync:check
node claudeopus5.5-mini4wd-replica/tests/browser-smoke.mjs   # 需 npm run dev
```
