# 车辆建模 v2 · 2026-10-03

这是同日此前建模一轮的历史记录。当前灯组/车身为[v3](vehicle-details.md)，碰撞与地形已在后续[地图修复](map-repair.md)中调整；下文未改物理的描述仅适用于当时一轮。

本轮范围为本实现的八辆程序化车模与对应显示代码。仍采用低多边形、三阶卡通材质和黑色轮廓线；没有导入外部模型或图片。驾驶参数、剧情数据、存档与 Three.js 依赖沿用原版。

## 查看

游戏入口：http://localhost:3000/gpt6.1sol-initiald-story-racing/。自由赛/车库中的“360° 赏车”可查看全部车型。也可直接进入 ?models=1，或 ?models=1&car=fc。

拖动旋转、滚轮缩放，手机双指缩放。预设视角包括车头、侧面、车尾与三分之四；可切换翻灯和自动旋转。赏车不会解锁车辆或写入主线存档。构建产物也包含此入口。

## 改动

| 车辆 | 轮廓与细节 |
|---|---|
| AE86 Trueno | 独立轴距/前后悬、斜背尾门、熊猫侧裙、翻灯、八辐深色轮圈、透明底豆腐店字样 |
| AE85 | 与86同家族轮廓，采用固定式头灯、窄胎、钢制轮圈及85标记；这组外观仍是本作选择 |
| R32 GT-R | 三厢双门座舱、较宽轮距、四圆尾灯、五辐轮圈、后扰流板 |
| RX-7 FC | 更低的鼻端/车顶、较长发动机盖、翻灯、进气口、五辐浅色轮圈、短尾翼 |
| EVO / EVO III | 四门窗框、盖板进气孔、雾灯与高尾翼，III增加尾翼端板及更大的雾灯 |
| 奔驰 | 更长的轴距与三厢车身、镀铬窗边/格栅/门把手、立标及宽辐轮圈；不指定原片型号 |
| 五菱宏光 | 较窄高车身、分段侧窗、钢制轮圈、纵向尾灯、补漏广告与虚构电话 |

轮拱由侧壳的实际开口形成，轮胎不再穿过完整车身方块。轮胎有弧形胎肩、轮圈唇、辐条、轮毂、螺栓、刹车盘和固定卡钳。方向转动和轮胎自转各用独立节点；车身侧倾与贴标/后排剪影挂在车身节点。

翻灯的封盖贴合发动机盖坡度，灯片在关闭时隐藏。夜间道路光源从前部灯位投向前方。尾灯采用红色/琥珀色灯组，剧情光轨颜色继续单独计算。

vehicle-model.js集中保存视觉参数和模型工厂。静态网格先烘焙颜色，再按共用材质合并；纹理、玻璃、描线和可动部件分别保留。轮组几何与材质复用；模型克隆通过 WeakMap 重绑动画节点，Object3D 引用不放进可序列化 userData。

## 比例与来源边界

- R32的长4.545米、宽1.755米、高1.340米、轴距2.615米与[日产1989年BNR32馆藏资料](https://www.nissan.co.jp/HERITAGE/DETAIL/210.html)一致。
- 丰田家族结构参考[丰田1983年车型谱系资料](https://www.toyota-global.com/company/history_of_toyota/75years/vehicle_lineage/car/id60003763/index.html)；FC的宽肩与斜背方向参考[马自达FC发展史](https://www.mazda.com/ja/about/history/greatcar/rx-7/02/)。其他尺寸是程序化外观参数，不作为逐项原厂数据核对结果。
- EVO代次、奔驰型号和原片改装细节仍以题面为准，未宣称逐帧复刻。车牌、宏光电话与85标记为装饰。碰撞包络继续采用原街机实现，视觉车长不参与碰撞判定。
- 2026-10-02更新检查确认安装0.185.1、官方稳定r186，继续遵守用户已确认的固定版本选择。采用r185的LatheGeometry、ExtrudeGeometry、BufferGeometryUtils.mergeGeometries、顶点颜色材质与OrbitControls；无API升级迁移。[官方发布](https://github.com/mrdoob/three.js/releases/tag/r186)、[迁移指南](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186)、[r185合并几何](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/utils/BufferGeometryUtils.js)、[r185轨道控制器](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/controls/OrbitControls.js)。

## 验证与预算

- 14项物理/规则测试通过，Vite构建通过。
- Chrome154.0.8037.58：源码模型6项、构建模型5项检查通过，均无console错误。八车型各拍摄车头/侧面/车尾/三分之四视角，共32张；另外有翻灯、手机、游戏首页与重复车型比赛截图。
- 源码检查还验证：全部网格坐标有限；四个轮拱位置无车身遮挡；克隆车轮和挂件状态互相独立；后轮不跟随转向，自转不污染转向节点。
- 模型总预算（包括隐藏挂件/灯片）：9,820–10,444三角面、21–31个网格/线绘制批次。透明双面材质在渲染器中可能产生额外pass，此数不是整场比赛的GPU绘制次数，也不是手机FPS结论。
- 完整14段主线、FC赛、奔驰终章、八车混战、键盘/暂停/手刹与390px布局回归：源码与构建各21项通过。源码完整回归在顶点颜色合并前通过，构建完整回归在合并后通过；合并后还重跑了源码与构建模型/同车型比赛检查。
- physics.js、data.js、项目package.json的SHA256与改动前相同。没有修改性能平衡、解锁或剧情规则。
- 构建共享车辆/Three.js块约602kB，仍有Vite的500kB分块提示。赏车模块按需加载；没有为消除提示调整其他项目或依赖。

证据：docs/qa/models/model-smoke.json、geometry.json、production/model-smoke.json、gameplay/browser-smoke.json、gameplay-production/browser-smoke.json及同目录PNG。before-menu.png保留旧模型画面。

复跑：

1. 在根目录启动已有3000服务。
2. 设置BENCH_PLAYWRIGHT_MODULE为可用的Playwright包路径，执行node gpt6.1sol-initiald-story-racing/tests/model-smoke.mjs。
3. 构建后设置BENCH_URL=http://localhost:3000/gpt6.1sol-initiald-story-racing/dist/、BENCH_QA_LABEL=production，复跑同一脚本。
