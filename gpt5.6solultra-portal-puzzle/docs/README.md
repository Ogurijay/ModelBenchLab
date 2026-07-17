# 视觉验收产物

- `preview.png`：由 `scripts/smoke.mjs` 在 1440 × 900、Chromium Headless 环境生成的首屏截图。
- `playthrough.png`：`scripts/playthrough-bench.mjs` 自动完成双门、搬运、平台和出口后的通关截图。
- 该脚本同时检查 WebGL canvas、页面错误、`window.__bench`、固定时间步和传送数学自测。

重新生成：

```powershell
npm run dev:one -- gpt5.6solultra-portal-puzzle
node gpt5.6solultra-portal-puzzle/scripts/smoke.mjs
```
