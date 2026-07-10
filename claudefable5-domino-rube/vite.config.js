import { defineConfig } from 'vite';

// 端口 3026 由仓库主会话统一登记预留(registry.json / domino.md / 门户卡片 / launch.json 一致)
export default defineConfig({
  server: { port: 3026 },
  preview: { port: 3026 },
});
