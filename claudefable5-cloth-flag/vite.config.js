import { defineConfig } from 'vite';

// 端口 3025 由仓库根 registry 统一预留(mission=cloth / Claude Fable 5)
export default defineConfig({
  server: { port: 3025 },
  preview: { port: 3025 },
});
