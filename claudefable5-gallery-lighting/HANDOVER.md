<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# HANDOVER — claudefable5-gallery-lighting

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3027 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3027，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


## 项目概况

| 项 | 内容 |
|---|---|
| 任务 | benchmark mission `gallery`(美术馆布光,code-to-3d),冻结任务书见 `benchmark/tasks/code-to-3d/gallery.md` |
| 实现方式 | Three.js ^0.185 + Vite ^8.1.2,JavaScript ESM,零外部资产(纹理全部 canvas 程序化) |
| 调试端口 | 3027（registry 当前登记；常规服务使用3000） |
| 启动 | `npm run dev -- --port 3027 --strictPort`;依赖由仓库根 workspaces 统一安装(three 0.185.1 从根解析),项目内不要单独 `npm install` |

## 技术架构(文件职责)

| 文件 | 职责 |
|---|---|
| `index.html` | Vite 入口;中文 UI 结构与全部样式(进入界面 / HUD / 天光按钮 / 说明浮层 / WebGL2 fallback) |
| `src/main.js` | 装配:渲染器(ACESFilmic / PCF 阴影 / PMREM)、模块编排、帧循环(THREE.Timer)、说明浮层触发、`getState` 组装 |
| `src/textures.js` | 全部程序化纹理:磨石地面、灰泥、混凝土、花岗岩、胡桃木(θ 环形嵌入横向可平铺)、5 种画作构图、说明牌文字、入口墙字、PMREM 环境图、接触阴影 AO |
| `src/room.js` | 展厅建筑:Reflector 反射地面 + 磨石覆层、四墙 / 踢脚、S 形隔断、天窗(井壁 / 分格条 / 天穹面板)、檐口灯带、入口门、长凳;输出 AABB 碰撞体与 `skyPanelMat` |
| `src/exhibits.js` | 8 件展品数据与建造:画作(画框 / 卡纸 / 画芯 / 壁挂说明牌)、雕塑(展台 / 本体 / 斜面立牌 / AO);输出射灯参数、展台圆柱碰撞体、画作 AABB 碰撞体、金属件自转动画 |
| `src/lighting.js` | 三类光源:9 盏 SpotLight(8 展品 + 入口墙)、3 面 RectAreaLight(2 檐口 + 1 天窗)、DirectionalLight 阳光 + HemisphereLight;昼夜状态机与全场氛围联动 |
| `src/controls.js` | PointerLockControls + WASD/Shift;碰撞(边界夹紧 / AABB 推出 / 圆柱推挤) |
| `src/ui.js` | 中文 UI 逻辑:指针锁定流转、天光按钮与 L 键、FPS、展品说明浮层。`#skyBtn` 为独立 fixed 层(z-index 25 > overlay 20),进入前 / ESC 暂停时鼠标可点;锁定后无光标,用 L 键 |
| `src/bench.js` | `window.__bench` 调试钩子 |

## 核心系统清单

1. **布光**:每件展品一盏 SpotLight(penumbra 0.5–0.62,色温 0xffd9a8);投影仅 3 盏雕塑射灯 + 1 盏阳光(2048)控性能。RectAreaLightUniformsLib 在 `setupLighting` 内一次性 init。
2. **可开关天光**:`value∈[0,1]` 状态机,1.6s smoothstep 过渡,联动:阳光强度、天窗面光、半球光强度与色温、`scene.environmentIntensity`、`toneMappingExposure`、射灯收敛(白昼 -32%)、天穹面板 HDR 颜色。夜=射灯剧场感,昼=天光通透。
3. **地面反射**:Reflector(1024 RTT)镜面 + 上层 0.8 透明度磨石 PBR 层(roughnessMap 让分缝反射粗化),PMREM 环境贴图补高光层次。
4. **PBR 三质感**:金属(黄铜扭结 metalness 1 / roughness 0.16)、粗糙石材(噪声位移 Icosahedron + 花岗岩 bump)、木质(LatheGeometry 车削件 + 画框 / 长凳 / 隔断压顶胡桃木纹)。
5. **碰撞**:房间边界 clamp + 隔断/长凳/画作(含画框与壁挂说明牌的 AABB)Box3 最小穿透轴推出 + 展台圆柱径向推挤,玩家半径 0.42m。
6. **动线**:编号 01→08 与双隔断 S 形路径一致;入口主题墙洗光为第一视觉锚点,尽端 3m 宽《金色回响》为终点。

## 调试钩子(window.__bench)

```js
__bench.ready            // 首帧渲染完成后 true
__bench.stepFrame(60)    // 手动推进 n 帧(1/60s 固定步长,逐帧渲染;隐藏标签页可用)
__bench.getState()       // { ready, time, fps, player{x,y,z,dir,locked},
                         //   skylight{on,value}, lights{spot,rectArea,...},
                         //   exhibitCount, exhibits[], renderInfo{calls,triangles} }
__bench.setSkylight(false) // 额外钩子:自动化切换昼夜(同步 UI 按钮)
```

截图建议:`__bench.setSkylight(true); __bench.stepFrame(120);` 等过渡完成后再取帧。

## 已知限制

- Reflector 为纯镜面,粗糙模糊靠覆层纹理近似,非 SSR 模糊反射。
- RectAreaLight 不投影(three 限制),隔断两侧洗墙光会轻微互透,视觉影响小。
- ~~根 hoisted three@0.160 无 `Timer` 导出~~ 已解决:本目录本地安装 three 0.185.1(`THREE.Timer` 实测为函数),模块解析就近命中本地 `node_modules`,与根 hoisted 版本无关;根 workspaces 登记仍由主会话统一完成。
- Windows/ANGLE 首次编译 shader 可能打一条 X4122 精度 info-log(WARNING 级,非 error,驱动层输出,应用侧不可消除;shader cache 命中后不再出现)。
- 画作 / 说明牌文字依赖系统字体(Microsoft YaHei / PingFang SC),Linux 无中文字体时文字纹理会退化为默认字体。

## 后续可做

- 天光增加太阳角度随时间缓慢移动(光斑扫过地面)。
- WebAudio 程序化环境声(脚步 / 展厅低频氛围)。
- 用 SSR(examples/jsm SSRPass)替换 Reflector 获得粗糙度感知反射。
- 说明牌增加注视高亮描边(OutlinePass 或 shader)。

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/claudefable5-gallery-lighting/`。
- 独立调试：根目录运行 `npm run dev:one -- claudefable5-gallery-lighting`，端口 3027。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
