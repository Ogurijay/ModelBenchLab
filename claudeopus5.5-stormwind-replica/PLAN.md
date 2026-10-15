# PLAN — claudeopus5.5-stormwind-replica（暴风城还原）

任务题面：`benchmark/tasks/code-to-3d/stormwind.md`（冻结 v1）。本计划由 3d-scene-builder skill 第 1 步产出，是各模块子代理的**唯一设计约束**。

## 1. 创意方向（已与用户对齐，2026-10-15）

- **差异化角度**：和兄弟实现（Opus 5，通用八边形王都）拉开距离的方式是**忠实还原《魔兽世界》暴风城的地标与相对方位**——英雄谷大桥与雕像、运河分隔的岛状街区、光明大教堂、高台上的暴风要塞、法师区紫塔、矮人区熔炉与地铁口、北墙外的港口。技术栈常规：WebGL（three 0.185）。
- **风格**：WoW 手绘风格化。暖白石墙、钴蓝瓦顶、金饰、蓝底金狮旗；半木构民居（奶白灰泥 + 深木梁，上层出挑）；法师区紫瓦、矮人区暗石红瓦。饱和、明快，体积感靠贴图里画的明暗。
- **概念图**：没有图像生成工具，用灰盒 blockout 代替：`progress/M0-blockout/`（overview / gate / cathedral / keep），以及 `plan/floorplan.svg`。
- **参考**：`refs/README.md`。

## 2. 世界坐标约定（代码见 `src/world/coords.js`，所有模块只从这里取数）

- 单位米，Y 向上，**北 = -Z、东 = +X**，原点 = 贸易区喷泉。
- 街区岛顶面 y = 0（要塞高台 y = 12）；运河水面 y = -2.5，河床 -5.5；英雄谷盆地 y = -14；桥面 y = 0。
- `regionAt(x,z)` → `{ region: island|valley|canal|sea|outside, district?, y }`；`groundHeight(x,z)` = 地形高度。玩家站立高度 = max(地形高度, 碰撞盒顶)。
- 英雄谷用局部坐标：`valleyToWorld(lx, lz)`；three 里 Group 位置 `VALLEY.origin`、`rotation.y = π/4`。
- 地块 `LOTS`（216 个）：`{ id, district, style, r:[x0,z0,x1,z1], face:N|S|E|W（门朝向的街）, floors, named? }`。建筑占地 = 地块四边各内缩 0.6 m。
- 其他数据：`DISTRICTS`（岛多边形 / 广场 / 街块）、`WALL_POLY` / `GATE` / `HARBOR_TUNNEL` / `WALL_STAIRS`、`BRIDGES`、`LANDMARKS`、`LAMPS`（179 盏）、`SPAWN`。

关键尺寸表：

| 构件 | 尺寸 |
| --- | --- |
| 层高 | 3.4 m（楼板 0.25） |
| 门洞 | 宽 1.5 × 高 2.5（地标大门 ≥ 4 × 7） |
| 窗洞 | 宽 1.1 × 高 1.5，窗台 1.0 |
| 外墙厚 | 0.4（地标 1.2） |
| 楼梯 | 踏步高 ≤ 0.3、深 0.32、宽 ≥ 1.1；楼板开井 |
| 城墙 | 厚 8、马道面 y = 14、垛口高 1.6；塔半径 7 |
| 主桥 | 宽 16，桥面 y = 0，雕像 8 尊（底座 + 约 12 m 高） |
| 运河桥 | 宽 8–14，桥面 y = 0 |
| 玩家 | 半径 0.35、身高 1.75、眼高 1.62、自动抬腿 0.5 |

## 3. 共享上下文 ctx（骨架已写好，模块只通过它交互）

```
ctx.THREE / scene / camera / renderer / coords
ctx.mat.<名字>          材质库（src/core/materials.js）：stoneWhite stoneGrey stoneDark stoneTrim plaster timber planks
                         roofBlue roofPurple roofRed roofSlate cobble cobbleDark plaza grass dirt gold iron carpet
                         fabricRed fabricBlue banner statue leaves bark windowGlow lampGlow fire arcane stained
                         （UV 以米计：一律用 core/geom.js 的 boxGeo / prismGeo / cylGeo / coneGeo / metersUV 生成几何）
ctx.builder({parent?, castShadow?, tag?})  → Builder
    .box(mat, x, yBottom, z, w, h, d, {ry, collide=true})  盒子 + 同源碰撞盒（中心 x,z；底面 y）
    .collider(x, y, z, w, h, d, ry)                        只登记碰撞
    .add(mat, geometry, matrix?)                           任意几何（不碰撞）
    .frame(x, y, z, ry) → 局部帧（.box/.add/.collider/.sub 用局部坐标）
    .finish()                                              按 材质 × 120 m 分区合并成网格
ctx.collision            OBB 碰撞世界（groundAt / resolve / probe）
ctx.lights.add({x,y,z,color,intensity,range,kind,nightOnly,flicker})   光源登记，大气模块用光源池消费
ctx.interiors.add(group, x, z, r=42)   室内 LOD：group 默认隐藏，相机进入半径才显示
ctx.fx.smoke.push({x,y,z})             烟囱等发射点，大气模块消费
ctx.hollowCount += n                   可进入建筑计数（HUD 显示）
ctx.onUpdate(fn(dt, t, ctx))           每帧回调
ctx.env {hour, night 0..1, sunDir}     大气模块写，其他只读
ctx.settings / ctx.panelSchema         美术总监参数（lil-gui），模块可追加条目
ctx.rng('名字')                        确定性随机：同种子同城市
```

规则：静态几何一律走 Builder（合并批次 + 同源碰撞）；需要贴地的物体 `userData.grounded = true`（悬浮检测）；地面网格 `userData.ground = true`。

## 4. 模块拆分（第 2 步并行，每个子代理只写自己的目录）

| 模块 | 目录 | 负责范围 |
| --- | --- | --- |
| A 地形与水系 | `src/world/terrain/` | 街区岛（挤出 + 驳岸石墙 + 压顶石）、滨河街 / 广场 / 庭院铺装、运河水面（动态法线 + 菲涅尔）、自然海岸线的海面、城外艾尔文森林地形（挖掉城墙多边形与海面）、港口码头与栈桥、9 座运河桥（拱腹 + 栏杆，桥面碰撞）、要塞高台驳岸 |
| B 城墙与英雄谷 | `src/world/walls/` | 外城墙（垛口、马道可走、角楼蓝锥顶）、4 处登城阶梯、北墙港口隧道、城门楼；英雄谷峡谷（两侧墙高于桥面约 10 m）、盆地草地、主桥（从贸易区登岸点到城门外）、8 尊英雄雕像、盆地上下阶梯、城门外通往森林的道路 |
| C 民居生成器 | `src/world/houses/` | 216 个地块全部生成**真空心**建筑：洞口墙、楼板开井、楼梯、坡屋顶、半木构饰件、烟囱；按业态（住家 / 店铺 / 酒馆 / 工坊 / 法师 / 矮人）布置家具；15 栋命名建筑有特色（银行、拍卖行、猪与哨子酒馆……）；窗洞夜间发光板；室内 LOD 登记；光源登记（壁炉 / 烛台）；烟囱烟雾点 |
| D 地标 | `src/world/landmarks/` | 光明大教堂（可进入中殿：柱列、长椅、祭坛、彩窗、吊灯）、暴风要塞（大台阶、庭院、塔群、可进入的王座厅）、巫师圣所（底层可进入）、大熔炉、矿道地铁入口、雄狮安息地纪念碑、两座喷泉 |
| E 大气与道具 | `src/world/atmosphere/` | 天空穹顶（渐变 + 太阳 / 月亮 + 星空）、昼夜循环（太阳角度 / 天色 / 雾色联动）、阴影相机跟随、光源池（≤16 盏 PointLight 按距离派发 + 火光闪烁）、179 盏路灯（实例化 + 地面光斑）、市集摊位、树木（公园 / 城外 / 盆地，实例化）、港口船只、烟雾粒子、旗帜 |

骨架（主会话已完成）：`main.js` 装配与主循环、`core/`（材质 / 几何 / Builder / 碰撞）、`player/`（第一人称 + 俯瞰 + 巡游）、`ui/hud.js`、`debug/`（截图钩子与调参面板）。

## 5. 里程碑与完成标准

| 里程碑 | 完成标准 |
| --- | --- |
| M0 灰盒 | 已完成：平面图 + 4 机位灰盒截图，用户确认 |
| M1 模块并行 | 5 个模块各自能挂进场景、0 控制台错误；`node --check` 全过 |
| M2 合并 | 全城装配 < 8 s；悬浮检测 0 项（有意为之除外）；可从出生点走到每个区 |
| M3 Critic 循环 | 每轮 4 张评审图 + 独立 Critic；≥ 9/10 或 6 轮封顶，如实记录 |
| M4 交付 | 1080p ≥ 60 fps（实测数据写进 HANDOVER）；HUD 统计；昼夜；文档三件套；registry 登记 + sync:check 绿 |

## 6. 评审机位（`main.js` 的 views）

overview（东南高空 3/4）、closeup（贸易区街面）、low（贴地查悬空）、overview:wire；补充：gate（英雄谷桥上）、cathedral、keep、nave（中殿内）、interior（民居内）、night、nightStreet。

## 7. 有意为之（不算缺陷）

- 城市比例比原作紧凑（约 700 × 600 m），以保证 60 fps 和步行可达。
- 英雄谷盆地比桥面低 14 m，桥下"悬空"是设计。
- 港口海面在北墙外，北墙段只有隧道一个出入口。
- 运河没有护栏的滨河段可以掉进水里，2.5 秒后自动爬上最近的岸（兜底）。
- 屋顶不可攀登（无碰撞）。
- 灯笼、旗帜、吊灯等挂件本来就离地。
