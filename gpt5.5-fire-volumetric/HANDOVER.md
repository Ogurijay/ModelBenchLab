# HANDOVER — gpt5.5-fire-volumetric

## 项目概况

| 项 | 内容 |
|---|---|
| 任务 | benchmark mission `fire`（实体火焰模拟，code-to-3d） |
| 冻结任务书 | `benchmark/tasks/code-to-3d/fire.md` |
| 技术栈 | Three.js `^0.185.0` + Vite `^8.0.0` + JavaScript ESM |
| 外部资产 | 无；场景、纹理、粒子、噪声全部程序化生成 |
| 统一访问 | `http://localhost:3000/gpt5.5-fire-volumetric/` |
| 独立调试 | 端口 `3032`，运行 `npm run dev:one gpt5.5-fire-volumetric` |

## 文件职责

| 文件 | 职责 |
|---|---|
| `index.html` | 中文界面、状态读数与参数控制结构 |
| `src/styles.css` | 暗室标本馆视觉、响应式布局、交互控件 |
| `src/main.js` | Three.js 场景装配、帧循环、交互、性能档位与 `__bench` |
| `src/FireVolume.js` | 体积代理盒、ShaderMaterial、相机局部坐标与参数桥接 |
| `src/shaders/fireShader.js` | 体积相交、三维 FBM 密度场、温度着色、前向积分 |
| `src/ParticleSystems.js` | 火星与烟羽的确定性粒子系统 |
| `src/createStage.js` | 火盆、焦木、石台、程序化材质、测量环与动态灯光 |

## 关键实现说明

1. **实体体积**：fragment shader 先计算相机射线与本地包围盒的进入 / 离开距离，再沿盒内射线采样密度；旋转相机时看到的是同一个三维密度场。
2. **火焰造型**：纵向收尖函数确定基本轮廓，四层 FBM 噪声扭曲密度与中心线；高处额外加入双向位移形成分叉火舌。
3. **温度层次**：按到火焰中心的归一化距离计算温度，从橙红外缘连续过渡到黄白核心；底部高温区域混入蓝焰。
4. **透明合成**：采用预乘颜色的前向体积积分，并用 `ONE / ONE_MINUS_SRC_ALPHA` 自定义混合避免亮边重复乘 alpha。
5. **性能**：单个体积 draw call；质量档位分别为 36 / 54 / 72 步，DPR 上限分别为 1 / 1.25 / 1.5；粒子总量 172。

## 自动化钩子

```js
__bench.ready
__bench.stepFrame(60)
__bench.getState()
__bench.setParameters({ intensity: 1.2, turbulence: 0.9, wind: -0.3, quality: 1 })
__bench.setPaused(true)
__bench.resetView()
```

`getState()` 会返回 Three.js revision、火焰参数、粒子数量、相机位置和 renderer calls / triangles / points。

## 2026-07-15 浏览器验收

- Chrome / Playwright，桌面 `1440×900`：Three.js revision `185`，稳态 `60 FPS`，74 calls、20,532 triangles、172 points，控制台 0 error / 0 warning。
- 移动端视口 `390×844`：稳态 `60 FPS`，控制台 0 error；控制台固定在底部，火焰主体保持可见。
- 交互验证：暂停 / 恢复有效；质量档位从 72 步降到 36 步；拖拽环绕后相机由正侧面移动到反侧面，体积火焰持续可见。
- 截图：`docs/qa/fire-desktop.png`、`docs/qa/fire-mobile.png`。

## 已知限制

- 这是发光参与介质（emissive participating medium）的近似积分，不含体积阴影和多次散射。
- 烟羽使用柔边 point sprite（点精灵）而非独立体积求解；在极近距离观察时可辨认圆形层片。
- 点光源阴影更新占用一定 GPU 时间；低功耗设备建议选择“流畅”质量。

## 后续方向

- 增加离屏场景纹理折射，表现火焰上方空气的真实热浪扭曲。
- 使用蓝噪声抖动替代当前哈希抖动，进一步降低低采样档位的条带。
- 加入 GPU timer query（计时查询）以自动选择质量档位。
