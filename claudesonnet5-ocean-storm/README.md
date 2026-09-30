<!-- modelbenchlab-access -->
统一访问：在仓库根目录运行 `npm run dev`，打开 `http://localhost:3000/claudesonnet5-ocean-storm/`。
独立调试：根目录运行 `npm run dev:one -- claudesonnet5-ocean-storm`，打开 `http://localhost:3015/`。下文子目录启动说明仅用于独立开发。

# 海洋模拟 — 移动风暴单元

风暴以独立单元在世界空间生成、漂移、消散，天气由距离风暴中心的远近实时驱动；程序化雷电与 WebAudio 合成雷声（按真实声速延迟）
