import { defineConfig } from 'vite';

// 端口 3027 与 benchmark/registry.json 登记一致(3026 属 domino-rube 项目)
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3027,
  },
});
