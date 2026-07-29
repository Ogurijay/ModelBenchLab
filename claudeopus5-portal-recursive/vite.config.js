import { defineConfig } from 'vite';

// 端口 3045 与 benchmark/registry.json 登记一致(仅供 `npm run dev:one` 单独调试;
// 常规开发走仓库根单端口 :3000,经 /claudeopus5-portal-recursive/ 访问)。
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3045,
  },
});
