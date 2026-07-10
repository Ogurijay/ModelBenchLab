# 交接文档

## 当前状态

`gpt5.5-ocean-pirate-ship` 是一个 Three.js + Vite 的 WebGL 海面模拟项目，端口为 `3023`。海面渲染参考并复用 `claudefable5-ocean-realistic`，重点新增了海盗船 GLB 模型加载和随浪漂浮。

## 技术方案

- 海面：保留 fable 版 Gerstner（特罗科伊德）波谱、海面 shader、天空 shader、泡沫、菲涅尔反射和距离雾。
- 船体：`public/models/medium_pirate_ship.glb` 来自根目录 `blender/models/medium_pirate_ship.glb`。
- 漂浮：`src/ship/pirateShip.js` 调用 `sampleHeight` 采样海面高度，使用船头/船尾高度差计算俯仰，左右舷高度差计算横摇。
- 光照：`RoomEnvironment` 提供环境反射，方向光、半球光和点光源辅助 PBR（金属/粗糙度）材质表现。

## 已知问题

- 海面本身是自定义 `ShaderMaterial`，视觉上有高光和泡沫，但不是 three.js 标准水体材质；它不会像标准 PBR 材质一样接收船体阴影。
- 船体漂浮是视觉近似，没有做真实刚体、浮力体积或碰撞。

## 后续计划

- 可加入船尾航迹泡沫，让船体与海面互动更强。
- 可把海盗船模型改成可切换资产，用同一海面评估不同模型生成的船只。
- 可增加浏览器自动化截图，用于和 fable 原版海面做并排视觉回归。
