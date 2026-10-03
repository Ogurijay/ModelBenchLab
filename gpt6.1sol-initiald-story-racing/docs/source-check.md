# 来源核对 · 2026-10-01

仅记录实际读到的内容；用户题面仍完整保留在共享机器测试单元中。游戏剧情是本作改编，不把网页简介当作逐镜头电影复核。

| 项目 | 实际核对 | 来源 / 边界 |
|---|---|---|
| 电影与主要演员 | 环亚官网将作品记为2005年《Initial D》，主演列周杰伦、铃木杏、陈冠希，简介写父亲的AE86送豆腐 | [环亚电影页](https://www.mediaasia.com/En/Movies/Info/75/) |
| 九名角色与演员 | avex官方电影站的cast列表与用户提供的九组角色/演员相符。阿木在日文名单中的角色名为立花樹；本作对白沿用中文昵称阿木 | [avex电影首页](https://avex.jp/initial-d/index.html)、[角色页](https://avex.jp/initial-d/cast.html)。旧网页部分中文编码损坏，日文名与演员名仍可读 |
| 前段顺序 | 官方梗概支持：加油站挑战/阿木失败→深夜86→约海边/借车交易→击败中里R32→岩城挑战→须藤导致首次失败→父亲调校引擎。校门口两秒、海滩台词、换引擎整夜、尾声镜头是本作具体编排，未用原片逐镜验证 | [avex剧情页](https://avex.jp/initial-d/story.html) |
| 车型 | 官网明确支持AE86与中里R32；FC、EVO代次、车身颜色尚未从以上官方文字全部核实。保留用户设定，不自行指定刘教练EVO代次或奔驰型号 | 同上 |
| 五菱约100匹 | GM官方宏光1.2/1.4配置表分别列63kW与75kW；75kW约102公制马力，支持旧款1.4L“约100匹”，不代表所有宏光都同一动力 | [GM宏光技术参数PDF](https://media.gm.com/content/dam/Media/documents/CN/Vehicle_Spec/Wuling%20Hongguang_SPEC.pdf) |
| 五菱驱动 | 该PDF驱动栏文字为“前置驱动 / Front drive”，表达不明确，不凭此确认后驱。游戏按题面采用FR；真实年款/驱动资料仍待补 | 同上。不得把不明确原文擅自改译为后驱 |
| 网络梗来源 | 追逐BRZ/M2视频、518测速照片、豪车五菱护身符的原始素材尚未核实 | 标记为用户提供的梗设定；不得声称找到了原视频 |
| 星级、被动、乘客、奔驰撞墙能力 | 本作平衡与创作设定 | 与真实汽车技术参数区分 |

Three.js官方检查：根lockfile及实际安装0.185.1，官方稳定版r186。用户选择固定r185。使用r185的MeshToonMaterial.gradientMap、DataTexture、ExtrudeGeometry、CatmullRomCurve3、WebGLRenderer；程序化DataTexture使用NearestFilter。没有使用新r186的Object3D.dispose或TextureSource，也没有使用过时PCFSoftShadowMap。

官方技术来源：[r186发布](https://github.com/mrdoob/three.js/releases/tag/r186)、[迁移指南](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186)、[r185卡通材质](https://github.com/mrdoob/three.js/blob/r185/src/materials/MeshToonMaterial.js)、[r185数据纹理](https://github.com/mrdoob/three.js/blob/r185/src/textures/DataTexture.js)、[r185挤出几何](https://github.com/mrdoob/three.js/blob/r185/src/geometries/ExtrudeGeometry.js)。
