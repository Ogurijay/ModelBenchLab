<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# CHANGELOG

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3027 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3027，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 2026-07-10 静态审查修复 + 运行时实测

- 依赖:本目录本地 `npm install`(three 0.185.1 / vite 8.1.4,均满足参数锁 ^0.185.0 / ^8.1.2),消除根 hoisted three@0.160 无 `Timer` 导出导致的启动即崩;项目现可独立运行(根 workspaces 登记仍由主会话统一完成)。
- UI:`#skyBtn` 从 `#hud` 内提升为独立 fixed 层(z-index 25 > overlay 20),进入前与 ESC 暂停时鼠标均可点击开关天光(此前被全屏 overlay 遮挡永远不可达);锁定态仍用 L 键。已实测:overlay 可见时 `elementFromPoint` 命中按钮、点击切换状态与文案同步。
- 碰撞:补上画作 AABB 碰撞体(含画框外扩 0.1m 与壁挂说明牌 0.68m,局部盒角点经 rotY 旋转取包围盒),`exhibits.boxColliders` 不再是空数组;数值核验隔断画作(id3/id6)碰撞盒不侵入任何通道。
- 渲染:`PCFSoftShadowMap` → `PCFShadowMap`(three 0.185 已弃用前者并回退 PCF,消除启动 deprecation 告警,视觉无变化)。
- 实测(1920×855 @dpr1,Chrome):rAF FPS 连续 4s 采样全 60;稳态帧耗时 0.24–3.4ms(含后台节流态),165 draw calls / 2 万三角形;干净重载后控制台零 error 零 warning。

## 2026-07-10 初版实现

- 展厅建筑:26×14×5m 单层展厅,双隔断构成 S 形观展动线;吊顶中部开 12.4×3m 天窗(井壁 + 金属分格条)。
- 地面反射:examples/jsm `Reflector` 实时镜面 + 半透明磨石(terrazzo)覆层 + 粗糙度贴图,兼顾真实反射与材质质感。
- 展品:5 幅程序化画作(mist / waves / grid / pulse / gold 五种构图,种子驱动幅幅不同)+ 3 件雕塑(抛光黄铜扭结 · 噪声位移花岗岩 · 车削胡桃木器),每件配中文说明牌(画作壁挂式、雕塑斜面立牌)。
- 布光:每件展品一盏 SpotLight(penumbra 0.5–0.62,仅 3 盏雕塑灯 + 1 盏阳光投影,控性能);2 条檐口 RectAreaLight 洗墙补光 + 1 面天窗 RectArea;DirectionalLight 阳光经天窗分格条投影;HemisphereLight 环境层次;入口主题墙独立洗光。
- 昼夜联动:天光开关驱动 smoothstep 过渡(1.6s):阳光/天窗面光强度、半球光色温、环境贴图强度、tone mapping 曝光、天穹面板颜色整体渐变。
- 材质:PBR 金属 / 花岗岩 / 胡桃木 / 灰泥 / 混凝土 / 磨石地面,全部 canvas 程序化纹理;PMREM 程序化室内环境贴图;接触阴影贴片做烘焙感 AO。
- 漫游:PointerLockControls + WASD + Shift 快走,指数平滑加减速;房间 AABB 夹紧 + 隔断/长凳 AABB 推出 + 展台圆柱径向推挤。
- 工程:Vite 入口 `index.html`,中文 UI(进入界面 / HUD / 天光按钮 / 展品说明浮层 / FPS);`window.__bench = { ready, stepFrame(n), getState(), setSkylight(on) }` 调试钩子;ACESFilmic + PCFSoft 阴影;渲染器创建失败时展示 WebGL2 不支持提示。
- 文档:README / HANDOVER / CHANGELOG。

## 2026-10-01 · 结构与文档同步

- 同步统一入口、registry 文档路径与中央任务索引；保持现有 Three.js 版本。
