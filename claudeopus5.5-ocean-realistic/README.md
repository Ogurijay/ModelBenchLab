<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

<!-- modelbenchlab-access -->
统一预览（仓库根目录）：复用已有 3000 服务；未启动时执行 `npm run dev`，访问 http://localhost:3000/claudeopus5.5-ocean-realistic/ 。
并行开发（仓库根目录）：`npm run dev:one -- claudeopus5.5-ocean-realistic`，访问 http://localhost:3055/ 。项目 root 和依赖缓存独立，登记端口占用时先核对进程归属，不自动换号或结束其他会话的服务。
需要安装依赖时，在仓库根目录统一串行执行；不要在多个子项目中同时安装。截图、测试报告及生成中间产物写入项目 `tmp/`，构建产物使用 `dist/` 或 `build/`；保留正常热更新。历史归档证据仍保留原位置。
完整约定见 [公共规则 §4.1](../RULES.md#41-并行开发与刷新隔离)。下文子目录启动说明仅用于独立调试。
<!-- /modelbenchlab-access -->

# 远洋 · FFT 海洋模拟（Claude Opus 5.5）

ModelBenchLab 海洋任务的新版实现。仓库里已有的海洋项目都是 Gerstner 波叠加；本项目改用离线海洋渲染常用的**频谱 + 逆 FFT**：每帧在 GPU 上把真实海浪谱逆变换成海面，再让浮体读取同一片海面做浮力计算。

任务：`code3d-ocean-001` v1（mission `ocean`，variant `realistic`），题面见 [`benchmark/tasks/code-to-3d/ocean.md`](../benchmark/tasks/code-to-3d/ocean.md)。

## 内容

- **GPU FFT 海面**：三级 cascade（500 m / 97 m / 21 m 平铺，波数区间首尾相接、互不重叠），每级每帧做一次频谱演化、2·log₂N 次 Stockham 蝶形、一次合成。8 个实数场两两打包成复数，经 2 路 MRT 一起变换。输出半精度位移、导数贴图，带 mipmap 和各向异性过滤。
- **海浪谱**：风区受限 JONSWAP 风浪 + 按给定 Hs 定标的窄带涌浪，Mitsuyasu 方向分布；越接近充分成长，γ 越退化为 1（即 PM 谱）。同一随机种子下改参数相位不变，海况切换按 3–4 秒平滑插值。ω 量化到 2π/600 s 的整数倍，时间可以无缝取模，长时间运行也不丢 float32 精度。
- **泡沫**：每级用雅可比行列式 J 判断水面翻卷，注入泡沫并按时间指数衰减，在两张输出贴图之间乒乓保留；着色器里再用三级导数之和算一次瞬时 J，最后乘上程序化气泡纹理（周期 Worley × 值噪声）。
- **海面着色**：逐像素导数法线；菲涅尔天空反射；GGX 太阳高光，远处把 mip 平均掉的坡度方差折算成粗糙度，所以日光会自然拉成一条光路；浪尖背光次表面散射；空气透视融入同方向的地平线天空。
- **天空**：单次散射 Sky-View LUT（Rayleigh + Mie + 臭氧，参数取 Hillaire 2020），太阳变化时重算；逐像素绘制太阳盘和程序云层，云随风漂移，带自阴影和银边。同一材质采集反射立方体贴图，再经 PMREM 给浮体提供环境光。
- **CPU 低频副本**：同一份 h0 和 ω，取前两级 cascade 的 64×64 低频子集在 CPU 上做逆 FFT。迭代反求水平位移后，得到画面上那一点的高度和拉格朗日水质点速度。运行时实测与 GPU 读回的差值在半精度误差以内。
- **多点浮力**：每个浮体按体素采样点计算浸没比例，施加阿基米德浮力和相对水流的阻力，力矩让浮体自然摇摆、随浪起伏。浮体有渔船（参数化船壳，重心低于浮心）、航标（红/绿、闪灯）、木箱、油桶（横躺）、救生圈。渔船和航标有系泊锚链。
- **交互**：点击海面投放所选浮体（入水有水花）；拖住浮体可以提起并抛出；按 `F` 镜头跟随渔船。相机按 CPU 海面高度约束，不会穿到水下。
- **五档海况**：平静晨海 / 晴朗和风 / 落日长涌 / 大浪强风 / 风暴（阴云、低能见度、雨幕、泡沫成条）。海、天、雾、曝光一起平滑过渡。
- **lil-gui 面板**：风速、风向、风区、方向集中度、涌浪 Hs/周期/方向、尖浪 λ、时间流速；太阳高度/方位、云量、阴霾、降雨、曝光、泛光、能见度；水色、透光、粗糙度、泡沫参数；投放类型；cascade 开关与法线/泡沫/菲涅尔调试视图、线框。

## 操作

| 操作 | 说明 |
|---|---|
| 鼠标拖拽 / 滚轮 / 右键 | 旋转 / 缩放 / 平移 |
| 点击海面 | 投放所选浮体（面板“浮体”中选择） |
| 拖住浮体 | 提起，松手即抛出 |
| `1`–`5` | 切换海况预设 |
| `F` | 镜头跟随渔船 |
| `C` | 清空投放物 |
| `空格` | 暂停 |
| `H` | 隐藏全部界面（纯净观海） |

画质：桌面默认高画质（N=256、网格 681²、MSAA 4×）；触屏小屏自动用标准画质（N=128）。可用 `?quality=low|high` 强制指定。需要 WebGL2 和 `EXT_color_buffer_float`。

## 目录

```
src/
  main.js              场景装配、主循环、交互、HUD、无头测试接口 window.__bench
  presets.js           五档海况
  ocean/spectrum.js    JONSWAP/涌浪/方向分布、h0 生成、ω 量化、蒲福风级
  ocean/fft.js         Stockham 逆 FFT（与 GPU 着色器同一公式）
  ocean/oceanGPU.js    GPU FFT 管线（频谱演化 / 蝶形 / 合成 + 泡沫乒乓）
  ocean/oceanCPU.js    CPU 低频副本、反求高度、水质点速度
  ocean/ocean.js       门面：参数 → 波谱 → GPU + CPU，统一时间与过渡
  ocean/grid.js        跟随相机的等比网格（中心 0.18 m 格距，铺到 20 km）
  ocean/waterMaterial.js  海面着色器
  ocean/foamTexture.js 可平铺气泡纹理
  sky/atmosphere.js    大气常量、CPU 太阳透射率
  sky/sky.js           Sky-View LUT、天空/云着色器、反射立方体贴图与 PMREM
  physics/buoyancy.js  多点浮力刚体、系泊、抓取、碰撞互斥、入水事件
  objects/floaters.js  程序化浮体模型与采样点
  fx/particles.js      水花与雨幕
  ui/gui.js            lil-gui 面板
tests/                 vitest：FFT、波谱、CPU 副本、浮力
```

## 验证

```bash
npm test --workspace claudeopus5.5-ocean-realistic
```

```bash
npm run build --workspace claudeopus5.5-ocean-realistic
```
