# 交接文档 — claudeopus4.8-ocean-webgpu

## 项目定位

Claude Opus 4.8 生成的实时海面模拟，**WebGL 方案**：用 Three.js `WebGLRenderer` + GLSL
`ShaderMaterial`，把波形位移、逐像素解析法线、海水着色全部写进着色器在 GPU 运行；海面上
漂着一艘自建海盗船（PBR + 环境反射）。区别于「波形仍在 CPU 逐顶点循环」的常见做法。
端口 **3001**（见根目录 `RULES.md`）。

> 目录名仍叫 `…-ocean-webgpu`（端口/门户/workspace 绑定，未改名）；早期为 WebGPU/TSL 实现，
> 2026-06-27 应需求改回 WebGL/GLSL（详见 `CHANGELOG.md`）。

## 当前状态（2026-06-27）

可用。当日经历两轮：先做物理化升级与海盗船，后应需求把渲染器从 WebGPU/TSL 改回 WebGL/GLSL
并给船加物理反射（详见 `CHANGELOG.md`）。浏览器实测 0 报错、165 FPS、103k 顶点；全部参数
实时生效。

## 技术方案

- **渲染**：`WebGLRenderer` + 两个 GLSL `ShaderMaterial`（海面、天空）。海面顶点着色器算位移，
  片元着色器逐像素重算「位移 + 解析法线 + 浪尖挤压量」。
- **波形**：`N_WAVES = 16` 个 Gerstner 波。谱由 `rebuildWaves()` 在 JS 端按风速/风向/种子生成，
  写入 `vec4[16]` uniform 数组（`uWaveA=(dirX,dirZ,k,omega)`、`uWaveB=(amp,phase,baseQ,_)`）。
  深水色散 `ω=√(g·k)`，随机相位打破整齐。
- **抗规整**：宽方向散布(±66°,三次方权重)＋次涌浪交叉、波长对数非谐波分布、低频域扭曲
  (`uWarp`,GLSL 值噪声揉弯波峰)——避免“一排排平行波”。
- **波参数走 uniform 数组**：材质只构建一次，调参/重生成只改数值（ShaderMaterial 每帧上传
  uniform），不重编译着色器。
- **陡度预算** `Σ baseQ·k·A = 1`，实时 `uChop∈[0,1]` 缩放，保证不自交。
- **法线**：片元内用 GPU Gems 解析公式逐像素求 Gerstner 法线（含全部谱波），再叠加随距离
  淡出的 GLSL 值噪声微法线。
- **着色**：菲涅尔(Schlick) + 共用 `skyColor()` 的天空/太阳反射（反射压平地平线）+ 次表面散射
  近似 + crest/高度/陡坡驱动的湍流泡沫 + 距离雾。海面/天空末尾手动 sRGB，与标准材质的船色彩一致。
- **时间**：自管理 `uTime` uniform（可暂停）。
- **海盗船 + 物理反射**：`GLTFLoader` 加载 `assets/pirate-ship.glb`（Blender 自建）。开场用天空
  生成 **PMREM 环境贴图** 赋给 `scene.environment`，标准 PBR 材质据此做物理反射（金属反射天空、
  船身镜面高光）。方向光**开启投影**（`shadowMap` PCFSoft、shadow camera 聚焦船、`normalBias`
  缓解低模粉刺）→ 帆/桅杆/船身自投影；船底 `makeShadowBlob()` 椭圆接触阴影随浪起伏；方向光 +
  半球光跟随日照。浮力在 `updateShip()`：CPU 用 `sampleWaveY()` 复算
  Gerstner 垂直位移，船首/尾/左/右四点采样 → 均值定浮沉、叉积定姿态。`SHIP_*` 常量控制位置/
  朝向/吃水/缩放。`window.__ocean` 暴露 scene/renderer/ship 供调试。

## 文件结构

```
claudeopus4.8-ocean-webgpu/
├── index.html        # 页面骨架 + 控制面板（7 滑块 + 暂停/重置/🎲 + 海况读数）
├── src/
│   ├── main.js       # 渲染器、GLSL 海面/天空着色器、波谱生成、海盗船浮力、UI 绑定（全部逻辑在此）
│   └── styles.css    # 玻璃拟态 UI
├── assets/           # 海盗船资源（全部自建，随项目保存）
│   ├── build_pirate_ship.py   # Blender 建模脚本（可复跑）
│   ├── pirate-ship.glb        # 运行时模型（src/main.js 用 ?url 导入）
│   └── pirate-ship.blend      # 可再编辑工程
├── docs/IMPLEMENTATION.md
├── README.md / CHANGELOG.md / HANDOVER.md
└── package.json      # three ^0.184，vite
```

## 运行

```bash
npm run dev:claude          # 根目录，单独启动本项目
# 或根目录 npm run dev 一并启动门户与全部项目；本项目端口 3001
npx vite build claudeopus4.8-ocean-webgpu   # 生产构建
```

需要支持 WebGL2 的浏览器（几乎都支持）；不支持时显示降级提示卡片。

## 已知问题 / 注意

- **GLSL 编译只在运行时发生**：`vite build` 不会捕获 GLSL 编译错误，改完务必用浏览器实跑
  （开发服打开 3001，看控制台与画面）。注意 GLSL 保留字（`patch`/`input`/`output`/`active` 等）
  不能用作变量名。调试技巧：`renderer.info.programs` 里查 `LINK_STATUS` + `getShaderInfoLog`。
- 片元侧 16 波解析法线 + 域扭曲/微法线/泡沫共多次值噪声采样，开销随波数线性增长；集显偏卡
  可调小 `N_WAVES` 或降 `setPixelRatio`。
- 高风速时主波长按物理被夹到 320m，900m 平面上只有 2–3 个长涌浪，画面偏舒缓（符合真实
  长涌浪），细节由短波补足。
- **PMREM 环境贴图是开场静态生成的**（基于初始日照方向）：大幅改变日照方位后，船反射的
  「天空太阳」位置不跟随（太阳高光由方向光动态提供）。如需跟随可在 `updateSun` 里节流重建 env。
- 浏览器表单值在 reload 后可能被 Chromium 恢复，偶尔滑块不回默认值；全新会话正常。
- 反复多次 reload 后可能掉帧（浏览器侧 GL 上下文累积），**开新标签即恢复**（全新会话稳定 165 FPS）。
- 重新生成海盗船模型：编辑 `assets/build_pirate_ship.py` 后
  `blender --background --python assets/build_pirate_ship.py` 重导出 GLB（本机 Blender 在
  `E:\SteamLibrary\steamapps\common\Blender\blender.exe`，5.1.2）。

## 后续可做

- 质量档位（低/中/高网格分段，参考 Fable 的 `gridForQuality`）。
- 日照变化时节流重建 PMREM 环境贴图，让船反射的太阳跟随日照方位。
- FFT/Tessendorf 谱替代叠加 Gerstner，获得更真实的海浪统计特性。
