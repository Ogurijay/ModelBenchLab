# GPT 5.5 Pirate Ship Ocean

基于 `claudefable5-ocean-realistic` 的海面渲染版本，保留 fable 版最强的 Gerstner（特罗科伊德）波、菲涅尔反射、程序化天空、太阳高光、泡沫和远处雾化，并加载本仓库 `blender` 目录生成的中等面数海盗船 GLB 模型。

## 实现要点

- **复用 fable 海面核心**：`src/ocean/waves.js` 和 `src/ocean/materials.js` 基本保持 fable 版方案，确保海面观感一致。
- **GLB 海盗船加载**：`src/ship/pirateShip.js` 使用 `GLTFLoader` 加载 `public/models/medium_pirate_ship.glb`。
- **随浪漂浮**：船体中心、船头、船尾、左右舷分别采样海面高度，驱动上下浮动、俯仰和横摇。
- **PBR（基于物理的渲染）光照**：使用环境贴图、方向光、半球光和点光源，让海盗船金属材质能产生高光。

## 运行方式

```powershell
npm install
npm run dev
```

默认地址：`http://127.0.0.1:3023/`。

## 验证命令

```powershell
npm test
npm run build
```

页面暴露 `window.__ocean.frames` 和 `window.__ocean.shipLoaded`，便于浏览器自动化验证渲染循环和船体模型加载状态。

## 文件结构

```text
public/models/
  medium_pirate_ship.glb       # three.js 加载的海盗船模型
src/
  main.js                      # 场景、相机、光照、海面与船体联动
  ocean/
    waves.js                   # fable 版 Gerstner 波谱生成与采样
    materials.js               # fable 版海面/天空 shader
  ship/
    pirateShip.js              # GLB 加载与随浪漂浮逻辑
  ui/
    panel.js                   # lil-gui 面板和 HUD
tests/
  waves.test.js                # 海浪数学逻辑测试
```
