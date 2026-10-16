<!-- three-r186-migration -->
## 2026-10-15 · Three.js r186 升级

按用户本轮授权，当前 Three.js 依赖已从 0.185.x 升级并固定为 **0.186.1**。历史条目中的旧版本与验收结果保留原记录；它们不代表 r186 的运行验收。
已核对官方迁移指南和安装版源码：r186 的 WebGLShadowMap 也已移除 PCFSoftShadowMap，遇到旧值会警告并自动回退 PCFShadowMap。六个旧项目已显式改用 PCFShadowMap，消除该警告；其他已扫描的迁移项未发现需调整的使用。
构建、已有单元测试、仓库检查和运行抽查结果统一记录在仓库临时报告 `tmp/three186-migration/report.json`；未进行全部场景的视觉与性能回归。
<!-- /three-r186-migration -->

# HANDOVER — gpt5.5-fire-volumetric

## 2026-10-13 并行开发规则同步

- 生产预览也固定登记端口 3032 并启用 strictPort，与本项目独立开发服务交替使用；先停止自己启动的旧服务再切换。

- 修正子目录 `npm run dev`：固定登记端口 3032，端口被占用时报错，不自动换号。
- 同步统一预览、并行独立调试、服务复用与依赖安装串行约定。
- 本轮范围为开发服务和产物路径；不新增玩法、画面或正式评测结论。核验明细见 [批量检查记录](../benchmark/reports/parallel-development-2026-10-13.json)。


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

## 2026-10-01 仓库结构整理

- 常规入口：`http://localhost:3000/gpt5.5-fire-volumetric/`。
- 独立调试：根目录运行 `npm run dev:one -- gpt5.5-fire-volumetric`，端口 3032。
- 交接与改动记录以根目录文件为准。测试单元目前为 draft；结构校验通过不代表正式评测完成。
