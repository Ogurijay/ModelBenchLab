# CHANGELOG — claudesonnet5-ocean-storm

## 2026-07-01

- 初始实现：移动风暴单元系统（`StormSystem`）、双层 Gerstner 海洋（`Ocean`）、跟随相机的云层天空穹顶（`SkyDome`）、GPU 驱动实例化降雨（`RainField`）、程序化分形闪电（`LightningSystem`）、WebAudio 合成风/雨/雷环境音（`AmbientAudio`）、lil-gui 控制台与 HUD/罗盘（`ControlPanel` + `main.js`）。
- 修复：`SkyDome.js` 片元着色器中局部变量命名为 `patch`，与 GLSL 保留字冲突导致着色器编译失败（天空黑屏），改名为 `cellPatch`。
- 修复：`main.js` 引入 `three/examples/jsm/misc/Timer.js` 替换已弃用的 `THREE.Clock`，但该路径在 three@0.185 中不存在（`Timer` 已内置为核心导出）；改为直接使用 `THREE.Timer`。
- 修复：控制台自定义的"开启声音"按钮与 lil-gui 面板默认停靠位置（右上角）重叠，导致按钮不可点击；将按钮移至左上角。
- 接入根目录门户（`index.html` 新增卡片）与开发服务编排（`package.json` workspaces / dev 脚本，端口 3015），补全 `RULES.md` 端口分配表（含此前遗漏的 3014）。
