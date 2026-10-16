import { defineConfig } from 'vite';

// 端口 3030 与 benchmark/registry.json 登记一致(3029 属 domino-rube 项目)
export default defineConfig({
  server: {
    strictPort: true,
    host: '127.0.0.1',
    port: 3030,
  },
});
