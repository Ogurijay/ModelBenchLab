import { defineConfig } from 'vite';

// 端口 3034 与 benchmark/registry.json 登记一致(仅 `npm run dev:one` 单独调试用;
// 常规开发走根目录单端口 :3000,经 /claudefable5-portal-chambers/ 访问)
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3034,
  },
});
