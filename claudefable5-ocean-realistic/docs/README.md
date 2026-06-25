# 验证证据

- `browser-verification.jpeg`：2026-06-11 通过 Playwright 实测 dev 服务器的截图（默认参数：风速 12 m/s、太阳方位 270°）。
- 自动化检查：渲染循环 1 秒内推进 165 帧、WebGL context 正常、HUD 显示海况/FPS/顶点数；模拟 pointer 拖拽与滚轮后相机视角变化，确认 OrbitControls 可用。
