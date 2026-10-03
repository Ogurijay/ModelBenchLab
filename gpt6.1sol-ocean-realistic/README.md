# 潮汐 · TIDELINE — GPT 6.1 SOL

独立新版海洋模拟，项目目录 `gpt6.1sol-ocean-realistic`。Three.js 锁定 `0.185.1`，Vite `8.1.2`。

在仓库根目录运行 `npm run dev`，访问 **http://localhost:3000/gpt6.1sol-ocean-realistic/**。项目门户自动读取 registry。

独立调试：根目录 `npm run dev:one -- gpt6.1sol-ocean-realistic`，访问 `http://localhost:3057/`。

## 操作

- 四种海况：玻璃海、远洋涌浪、日落航行、风暴边缘。参数变化约一秒内平滑响应。
- 风速、有效波高、波向、太阳高度、太阳方位与云量分别可调。
- 拖动旋转视角，滚轮缩放；移动端单指旋转、双指缩放。海平线、随船、俯瞰三种初始视角。
- 木箱、救生圈投放，最多 16 个；可清除。船、浮标与投放物可统一隐藏。
- 点击船只或浮标查看其说明；浮标局部海面高度记录最近 30 个模拟秒。
- 暂停、0.5× / 1× / 2× 速度、海面 PNG 下载、用户手动开启的合成海浪声。
- `Space` 暂停，`H` 纯净观海，`R` 重置，`Esc` 退出纯净观海。表单与按钮保留原生键盘行为。
- 移动端默认流畅档、折叠控制台；减少动态效果偏好默认暂停。

## 技术与边界

24 组确定性定向 Gerstner 分量，幅度依据 JONSWAP 形状的离散波谱加低频涌浪归一化，满足 `Hs = 4√(Σa²/2)`。水平位移导数受限以避免波面折叠。CPU 求水平位移逆映射，船与浮体四点采样、临界阻尼弹簧升沉与平滑倾斜。GPU 使用跟随相机的指数径向网格，远处过滤短浪；片元细浪按屏幕导数过滤。

天空与海面共享太阳方向、云量与时间；水面有菲涅尔天空反射、GGX 太阳高光、近似浪尖散射、雅可比压缩泡沫、程序尾流与距离雾。所有图形、音频为本地程序生成，无远程字体、贴图、模型或音频。

这是视觉模拟，**不是数值海洋预报或完整流体求解器**。未实现 FFT、Navier–Stokes、真实破碎浪、体积水、物体镜面反射、船只操纵、质量与刚体碰撞。船固定在观察区域；尾流仅作视觉近似。风暴预设为强风阴云，不含雷雨。浮力简化为浪面目标的弹簧阻尼响应，能产生有限滞后与偶发水线误差。云层为二维噪声投影。

有效波高与周期是生成波谱参数；曲线为局部采样，不是观测数据，也不是从这条曲线反算的有效波高。

URL 支持 `?seed=61&time=12&paused=1&preset=sunset` 复现固定海况，参数有有限数值校验。

## 验证

```powershell
npm run test --workspace=gpt6.1sol-ocean-realistic
npm run build --workspace=gpt6.1sol-ocean-realistic
npm run test:browser --workspace=gpt6.1sol-ocean-realistic
npm run sync:check
```

计算测试 6/6、完整浏览器检查 20/20、生产构建运行检查 4/4 通过。本机 RTX 5070 Ti / Chrome 在 1920×1080 均衡档 30 秒采样平均约 165 FPS；移动端只验证了 390px 浏览器布局与交互，未做真机验收。

浏览器检查使用本机 Chrome 和仓库已有 Playwright，默认连接统一入口；`OCEAN_URL` 可指定构建预览 URL。证据位于 `docs/qa/`。运行验收结果见 [HANDOVER.md](./HANDOVER.md)，改动见 [CHANGELOG.md](./CHANGELOG.md)。工程验证不属于正式模型评测；沿用的海洋题目前为 draft。

2026-10-02 已检查 [官方 r186 发布](https://github.com/mrdoob/three.js/releases/tag/r186) 与 [迁移说明](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186)，本项目沿用现有 0.185.1，使用对应 r185 的 ShaderMaterial、WebGLRenderer 与 OrbitControls 接口，无 API 迁移。
