# 参考资料

2026-10-15 由主代理通过内置浏览器读取：

- [Stormwind City](https://warcraft.wiki.gg/wiki/Stormwind_City)：城区说明及地标图像，用于核对英雄谷、贸易区、法师区、教堂广场、矮人区、旧城区、要塞、狮眠之地和港口的关系。
- [现代暴风城地图文件页](https://warcraft.wiki.gg/wiki/File:WorldMap-StormwindCity.jpg)：实际查看 1002×668 地图；文件页当前记录为 2023-10-05。包含港口、狮眠之地、大使馆及北湖。此地图作为现代布局参考，不保证覆盖所有最新任务阶段变化。
- [Three.js r186](https://github.com/mrdoob/three.js/releases/tag/r186) 与 [185→186 迁移指南](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186)：依赖版本核对资料，实际稳定包固定为 0.186.1。

## 用户批准的概念方向

- [英雄谷入口概念](../../shared/assets/stormwind-modern/concepts/heroes-gate.png)
- [运河与教堂概念](../../shared/assets/stormwind-modern/concepts/canal-cathedral.png)

两图由本轮内置 ImageGen 生成并经用户确认，只提供材质、光照与构图目标。入口概念图的远景塔群有艺术化夸张，实施时以游戏地图及地标识别为优先。它们不是原作截图、运行资产或项目验收截图。


## 同机位材质目标

[教堂近景材质目标](../../shared/assets/stormwind-modern/concepts/cathedral-material-target.png) 由内置 ImageGen 基于第二轮实机 closeup 截图生成，用于对照天空、石材、窗框与植被。它是后续美术调校参考，未作为天空、背景或任何运行贴图使用；运行天空、纹理与模型继续由代码生成。
