# 交接文档 — claudeopus5.5-stormwind-replica

最后更新：2026-10-15 · 状态：可运行，冻结题面主体功能完成；美术迭代经 5 轮独立 Critic 评审（见 §6）

## 1. 项目目标与差异化角度

冻结题面 `code3d-stormwind-001` v1：一座可辨认的奇幻人类王都，建筑内部也能走进去看。和同题兄弟实现 `claudeopus5-stormwind-interiors`（Opus 5，通用八边形王都）拉开距离的方式是**忠实还原《魔兽世界》暴风城的地标与相对方位**（用户 2026-10-15 选定）；技术栈常规 WebGL。风格：WoW 手绘风格化（暖白石墙、钴蓝瓦、金饰）。原创规则：未阅读兄弟实现源码。

本项目同时是全局 skill `3d-scene-builder` 的第一次端到端实战，流程产物（灰盒、平面图、PLAN、各轮 Critic 截图）和对 skill 的反馈在 `PLAN.md`、`docs/SKILL-FEEDBACK.md`。

## 2. 三条贯穿全局的约定（改代码前必须知道）

### 2.1 唯一坐标数据源 `src/world/coords.js`

布局、地块（`LOTS` 216 个）、桥、路灯、地标位置、城墙多边形、地形高度（`regionAt` / `groundHeight` / `terrainHeight` 含海岸线）全部在这里，**纯数据 + 纯函数，不 import three**。`tools/floorplan.mjs` 用同一份数据生成 `plan/floorplan.svg`。北 = -Z，东 = +X，原点 = 贸易区喷泉，单位米。英雄谷是 45° 斜轴的局部坐标（`valleyToWorld` / `worldToValley`）。玩家站立高度 = max(地形高度, 碰撞盒顶)，所以**可视地形必须和 `regionAt` 一致**（海岸函数就是为此从地形模块搬回 coords 的）。

### 2.2 渲染与碰撞同源：`Builder.box()`

`src/core/builder.js`：`box(mat, x, yBottom, z, w, h, d, {ry, collide})` 同时生成几何和 OBB 碰撞盒（只绕 Y 旋转）。墙用 `geom.wallPieces()` 按门窗洞口切成实体段，**洞口处没有碰撞盒**——"看得见就挡得住、门洞就走得过"由此保证。静态几何按「材质 × 120 m 分区」合批。新增墙体请走这套，不要另拼 BoxGeometry 再手写碰撞。

### 2.3 UV 以米计

`core/geom.js` 的 `boxGeo / prismGeo / cylGeo / coneGeo / metersUV` 生成的 UV 都是世界米，材质 `repeat = 1 / 贴图代表的米数`（见 `core/materials.js` 的 `canvasTex(name, meters, …)`）。贴图密度天然一致：卵石 2 m/张（单块约 0.2 m），石砌 4 m/张（每皮约 0.33 m）。

## 3. 模块与装配

`main.js` 按 terrain → walls → houses → landmarks → atmosphere 顺序装配（`import.meta.glob` 懒加载），模块只通过 `ctx` 交互（材质库、Builder、碰撞、光源登记 `ctx.lights`、室内 LOD `ctx.interiors`、烟雾点 `ctx.fx.smoke`、昼夜 `ctx.env`、参数 `ctx.settings`）。`?only=a,b` 只装配指定模块（缺地形/大气时有兜底地面与灯光），并行开发时互不干扰。

| 模块 | 要点 |
| --- | --- |
| terrain | 一整张水面（挖掉英雄谷）同时是运河与海；岛挤出 + 驳岸 + 0.9 m 护栏（桥头 / 登城栈桥留口）；城外地形 128 m 分块按误差选 8–64 m 网格；9 座运河桥；港口码头 |
| walls | 外城墙（马道可走、14 座角楼可穿行）、4 处登城阶梯、北墙港口隧道、城门楼；英雄谷峡谷、盆地、连拱主桥、镂空栏杆（碰撞 1.8 m 实心）、8 尊程序化英雄像 |
| houses | 216 栋真空心：洞口墙（转角互相搭接防漏缝）、楼板开井、直跑楼梯、双坡屋顶、半木构饰件、窗板、室内灰泥 + 护墙板；按业态布置家具（室内 LOD 30 m）；15 栋命名建筑带 Canvas 中文招牌 |
| landmarks | 光明大教堂（中殿可进：肋拱、束柱、彩窗、体积光、祭坛聚光）、暴风要塞（40 级大台阶、内外院、兵营、图书馆、王座厅可进）、巫师圣所、两座喷泉、大熔炉、矿道地铁口、纪念碑、旧城广场 |
| atmosphere | 天穹着色器、昼夜、跟随阴影（第一人称 ±80 m）、16 盏光源池（室内灯带 `room` 范围：相机不在该房间时白天不派，防穿墙漏光）、179 盏路灯、BatchedMesh 树林（3 级 LOD）、市集、帆船、港口仓库与吊车、软粒子烟雾 |

## 4. 性能结构

| 手段 | 说明 |
| --- | --- |
| 合批 | Builder 按材质 × 120 m 分区合并；民居外壳全城约 35 个网格 |
| 室内 LOD | 每栋家具一个 Group，相机 30 m 内才显示 |
| 光源池 | 900+ 处登记光源只用 16 盏 PointLight，每 0.2 s 按距离 + 优先级改派 |
| 树木 | BatchedMesh 逐棵剔除 + 3 级 LOD，远景不投影 |
| 地形 | 分块按屏幕误差选网格密度；水面 64 m 规则格 |
| 后处理 | GTAO 半分辨率计算（`?noao` 可关） |

实测（2026-10-15，1920×1080，RTX 4060，冻结构建）：街面 / 夜景 / 俯瞰约 60 fps（vsync 上限，首帧需约 2 s 着色器预热）；俯瞰约 340 drawcall（含阴影与 AO 法线 pass）；全城装配约 6.5 s（民居约 5 s）；碰撞盒约 2.8 万。

**注意**：r155+ 点光源是坎德拉单位、1/d² 衰减；光源登记里的 `intensity` 是相对值，统一增益在大气模块光源池里。

## 5. 调试接口

```js
__bench.getState()                 // 位置、区域、室内、时刻、可进入建筑数、碰撞盒、光源、drawcall
__bench.teleport(x, y, z, yaw, pitch)
__bench.key('KeyW', 帧数)           // 模拟按键推进（隐藏 tab 下 rAF 停摆时用）
__bench.stepFrame(n) / setHour(h) / setMode('walk'|'overview'|'tour') / probe(x, z) / lights() / setSize(w, h)
__bench.setView(name) / setWireframe / setUI / renderNow / checkGrounding()   // 截图钩子（3d-scene-builder）
__ctx.houses.walk(id) / walkAll() / wallTest(id)   // 民居走路回归：216/216 可从门外走到顶层
```

评审截图：`node ~/.claude/skills/3d-scene-builder/scripts/capture_views.mjs --serve dist --hook __bench --label <名> --views overview,closeup,low,gate,cathedral,keep,nave,interior,nightStreet,overview:wire`（先 `npx vite build --base=./`）。页面内验证：`node tools/probe.mjs "<url>" "<表达式>"`。

## 6. 评审记录与已知问题

6 轮独立 Critic（每轮新开子代理，只看成品截图与约束）：

| 轮 | 绝对分 | 不封顶 | 盲比（新:旧:平） | 主题 |
| --- | --- | --- | --- | --- |
| R1 | 6.5 | — | — | 卵石、AO、彩窗、雕像、圣所、森林 |
| R2 | 6.9 | — | — | 卵石尺度、室内光穿墙、雾、要塞空、港口 |
| R3 | 6.3 | — | — | 石砌尺度、暗部冷紫、运河色、要塞形制 |
| R4 | 6.0 | 6.9 | 4:1:0 | 阻断：民居转角 1 px 漏缝 |
| R5 | 6.0 | 7.1 | 4:3:0 | 阻断：构件穿插；3 处回退 |
| R6 | **7.3** | 7.3 | 5:0:3 | 无阻断；剩材质旧化 |

分数在不同评审员之间有约 ±0.5 噪声，进展以缺陷收敛与盲比为准。

已知问题 / 后续可做（R6 Critic 的主要缺陷）：
- 材质平铺偏均匀、偏新：卵石 / 砌块 / 瓦缺逐块明度抖动、世界坐标大尺度色差和旧化（墙根、檐下、驳岸青苔）；WoW 手绘质感主要靠 Canvas 贴图，没有手绘法线/AO 贴图。
- 俯瞰机位里城市只占约 30% 画面，城外丘陵与海湾面积过大；海岸沙带宽度均匀。
- 要塞高台仍偏空，挡土墙暗色石与白墙明度跳跃大；高台（y = 12）与城墙马道（y = 14）高差小。
- 城墙内侧是平板，缺扶壁 / 盲拱，正好落在街道视线尽头。
- 半木构梁的米制 UV 让木纹看起来像"木头砌的砖"，梁柱宜用顺长轴的整木贴图。
- 中殿交叉部的拱壳衔接不连续（宜设凯旋拱）；英雄雕像仍偏"基本体堆叠"，底座近黑。
- 民居生成约 5 s，超过模块自定的 4 s 预算（总装配仍在 8 s 内）。
- 没有 NPC 和声音（仓库规则禁止外部音频，程序化音效未做）。
- 交叉塔尖顶从大教堂广场机位看仍在右钟楼尖顶后方（已收细缓解）。

## 7. 仓库结构整理

- 常规入口：`http://localhost:3000/claudeopus5.5-stormwind-replica/`。
- 独立调试：根目录 `npm run dev:one -- claudeopus5.5-stormwind-replica`，端口 3067。
- 测试单元 `code3d-stormwind-001` 目前为 draft；结构校验通过不代表正式评测完成。
- `progress/`（评审截图，约 300 MB）与 `plan/*.png` 不入库，见项目 `.gitignore`。
