import { defineConfig } from 'vite';

// 端口 3028 由仓库根 registry 统一预留(mission=cloth / Claude Fable 5)
export default defineConfig({
  server: { strictPort: true, port: 3028 },
  preview: { port: 3028 },
});
