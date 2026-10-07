# 经典车型参考

用户选择：经典原版 / 动画常见外形。2026-10-07 先收集并目视检查照片，再建立各自的程序模型。主图保存在 `shared/assets/mini4wd-astra/references/`，游戏内“车型档案”与“对照经典参考”可以查看。

| 车辆 | 经典型号 / 来源 | 核对的识别特征 |
| --- | --- | --- |
| 旋风冲锋 | [Tamiya 19412](https://www.tamiya.com/japan/products/19412/index.html) | 白色分叉鼻、独立蓝色前轮罩、黑座舱、红闪电后肩、蓝黄横尾翼、绿轮毂 |
| 飓风音速号 | [Tamiya 19415](https://www.tamiya.com/japan/products/19415/index.html) | 红白绿前罩、黑色下凹桥翼、左右各三片橙色襟翼、宽后肩与红色尾翼 |
| 新三角剑 | [Tamiya 19409](https://www.tamiya.com/japan/products/19409/index.html) | 外露前轮、三级鼻槽、灰黑曲面、金色座舱、红黄火焰、前轮碟盖 |
| 进化者 | 原 19302；[忠实复刻 95568](https://www.tamiya.com/japan/products/95568/index.html) | 紫色三叉鼻、无色透明机械舱、连续座舱框、长侧翼、双圆灯和银轮毂 |
| 极速眼镜蛇 | [Tamiya 19301](https://www.tamiya.com/japan/products/19301/index.html)；[CoroCoro 多视图](https://corocoro-news.jp/special/326291/) | 圆弧前铲、椭圆大灯、银色双列三层进气片、透明舱、窄腰扇形翼、银色轮毂 |
| 蜘蛛王 | [Tamiya 19408](https://www.tamiya.com/japan/products/19408/index.html)；[CoroCoro 多视图](https://corocoro-news.jp/special/305972/) | 宽扁前壳、蓝白双线蛛网、金舱、红色肩纹、中央尾脊和百叶双尾翼 |
| 巨无霸 | [Tamiya 19411](https://www.tamiya.com/japan/products/19411/index.html)；[CoroCoro 多视图](https://corocoro-news.jp/special/314785/) | 厚重红车头、黄色横格栅、外露前置马达、蓝色宽座舱、银色护管、无高横尾翼 |
| 魔鬼司令 | [Tamiya 19413](https://www.tamiya.com/japan/products/19413/index.html)；[CoroCoro 多视图](https://corocoro-news.jp/special/330328/) | 银色尖鼻、弯月轮罩、红眼、四枚朝前金喷口、金色软管与黑裂纹 |

原版进化者和极速眼镜蛇是 Real Mini 4WD 无动力展示模型。本作的马达、传动、比赛导轮与底盘适配属于玩法改编，不能据此推断原型有这些比赛部件。没有用 Premium 的不透明黑舱 / 金轮毂替代经典透明机械舱。

完整研究笔记见 [reference-a.md](reference-a.md)、[reference-b.md](reference-b.md)，网页和图片溯源见 `reference-sources-a.json`、`reference-sources-b.json`。JSON 中部分辅助截图路径位于本机忽略目录 `tmp/`；主要八张参考已有持久副本。参考图仅用于本地研究和对照，不是车身贴图；来源方保留图片权利。

## 模型检查记录

每款均捕获斜前、正前、右侧、正后、左侧、俯视六角度，元数据和五个辅助角度保存在 `reconstruction/<id>/final-review/`。斜前图同时用于游戏预览，仅存一份于 `shared/assets/mini4wd-astra/previews/`，路径记录在 `reference.json`。逐车检查前鼻分叉 / 跨接关系、轮胎露出范围、舱形、翼形与颜色分区；进一步修正了银色进气片被车壳遮挡、巨无霸后舱颜色、车壳薄片感、后轮凹面和光滑舱盖造成的外形误读。

车壳坐标来自照片比例推断，真实卡扣、底面、胎纹、标识字体和一些曲面仍简化；没有将普通参考截图当作可精确测量的 CAD 数据。没有独立人工相似度评级。
