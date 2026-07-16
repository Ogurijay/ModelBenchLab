# 交接文档 — claudefable5-fire-raymarch(实体火焰 · 体积光线步进)

## 当前状态

- 状态:可运行、可构建、已接入统一门户,浏览器实测通过(见"已验证")。
- 技术栈:Three.js r185(`^0.185.0`)、WebGL2、Vite 8、原生 JavaScript ESM;**除 three 外零运行时依赖**(控制面板为手写 DOM,未用 lil-gui)。
- 评测端口:`3033`(registry 登记);常规经统一门户端口 `3000` 以 `/claudefable5-fire-raymarch/` 访问。
- 外部资产:无。几何、材质、纹理(树皮/年轮/炭红渐变 DataTexture)、噪声、火焰、火星、烟羽、星空均程序生成,布景与粒子用定种 PRNG(mulberry32),多次加载画面一致,便于盲评。

## 实现结构

| 文件 | 职责 |
|------|------|
| `src/main.js` | 装配、主循环、resize(含隐藏标签页 0×0 兜底 1080p)、质量档应用、stepFrame/setView/resetView |
| `src/fireComposite.js` | **核心**:HDR RT(HalfFloat + Float DepthTexture)+ 全屏合成 pass;体积密度场(火/烟)、盒求交、深度截断、IGN 抖动、热浪折射、ACES/sRGB |
| `src/shaders/chunks.js` | GLSL 公共块:hash13 / value noise / fbm2 / fbm3 / IGN / ACES / sRGB |
| `src/scene.js` | 地面(顶点噪声起伏+炭黑圈)、石圈(变形二十面体)、柴堆(树皮/炭红 emissive 端头)、铁三脚架+铜壶(壶底烟熏顶点色)、夜空穹顶(星星/月亮/辉光)、雾与环境光 |
| `src/firelight.js` | 双点光火光:CPU FBM 呼吸曲线(与体积焰/柴堆共享)、位置微漂、cube shadow,质量档控阴影分辨率 |
| `src/sparks.js` | 火星:CPU 模拟(浮力/湍流/风/阻尼,火势控配额)+ GPU 点精灵(HDR 色,画进场景 RT) |
| `src/params.js` | 中央参数状态:setParam 唯一写入口 + 订阅广播;质量档预设(步数/像素比上限/阴影) |
| `src/clock.js` | 可暂停模拟时钟;stepFrame 固定 1/60s 推进 |
| `src/ui.js` | 中文控制面板(玻璃暗底/琥珀点缀/自绘滑条/移动端折叠)+ 性能 HUD |
| `src/bench.js` | `window.__bench` 钩子与错误收集 |

## 渲染管线

1. 主场景(实体 + 火光 + 火星)→ HalfFloat RT(线性 HDR,带 Float 深度)。
2. 全屏三角合成 pass:重建世界 ray → 热浪折射采样场景色 → 体积盒求交 + 深度截断 → `MARCH_STEPS` 步发射-吸收积分(火焰温度 ramp 三层色 + 烟)→ ACES → 暗角 → sRGB。
3. 质量档以 `#define MARCH_STEPS` 重编译注入:低 28 / 中 40 / 高 56 / 极 88 步(单调递增),联动像素比上限(1 / 1.25 / 1.5 / 2)与点光阴影(关 / 512 / 1024 / 2048)。

## 调试钩子(`window.__bench`)

```js
__bench.ready                    // 首帧同步渲染完成即 true(不依赖 rAF,隐藏标签页可用)
__bench.stepFrame(n)             // 固定 1/60s 推进 n 帧并渲染(headless 确定性回放)
__bench.getState()               // { time, paused, fps, params, marchSteps, pixelRatio,
                                 //   sparks, drawCalls, triangles, errors }
__bench.setParam(key, value)     // intensity/turbulence/windAngle/windStrength/quality/paused
__bench.setView(az, elev, dist)  // 环绕取证:方位角/仰角(度)与距离直接摆相机
__bench.resetView()
__bench.snapshot()               // 渲染一帧后返回 PNG dataURL(隐藏标签页截图超时的后备)
```

## 已验证(2026-07-16 浏览器实测)

- `npm run sync:check` 通过(registry / workspaces / 目录 / 门户一致)。
- `npm --prefix claudefable5-fire-raymarch run build` 通过。
- 控制台零报错零警告;`getState().errors` 全程为空。
- `__bench` 全接口实测:ready / stepFrame / getState / setParam / setView / resetView / snapshot。
- 环绕多方位(53°/100°/205°/-52°)截图确认三维体积(各角度形态不同、遮挡正确)。
- 参数极值:火势 0.4 / 1.8、湍流 2.0、风力 0.85(火焰倾斜 + 烟羽横飘)表现正常。
- 质量档步数单调 28→40→56→88;高档 1080p 下 stepFrame×60 仅 ~38ms(60fps 裕量大)。
- 截图取证归档:`tmp/fire-check/`(默认/环绕/大风/小火/大火)。

## 踩坑记录(对后续项目有普适价值)

1. **隐藏标签页 `innerWidth = 0`**:preview 面板隐藏时初始化会建出 0×0 canvas。已兜底:尺寸为 0 时按 1920×1080 建,`visibilitychange` 可见时按真实视口重同步。
2. **相机矩阵懒更新 × 单帧取证**:three 在 `renderer.render` 时才更新 `matrixWorld`;`setView` 后仅 `stepFrame(1)` 时,合成 pass 若直接读矩阵会拿到旧视角 → 体积 ray 与新深度错位,火焰被整体截掉。已修:`FireComposite.update` 开头强制 `camera.updateMatrixWorld()`。实时环绕下一帧自愈,极易漏测。
3. 火星画进主场景 RT(而非合成后叠加):天然获得几何遮挡 + 被火焰体积正确包裹 + 参与统一 tone mapping,省去手动深度测试。

## 后续关注

- 进行固定机位截图与多角度审美盲评(与 gpt5.5-fire-volumetric 同锁对比)。
- 在真实显示器(非隐藏标签页)记录 rAF 帧率与各质量档表现。
- 极档(88 步 × dpr 2)在中端 GPU 的表现,必要时在任务文档记录推荐档位。
