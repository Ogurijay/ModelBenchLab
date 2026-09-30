// 仅供本目录单独调试(`npm run dev:one claudeopus5-protomotion-parkour`)。
// 常规访问走仓库根的单端口服务:http://localhost:3000/claudeopus5-protomotion-parkour/
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 3048, strictPort: true },
  // three 是纯 ESM,排除预打包以避免与仓库内其他 three 版本坍缩成同一副本。
  optimizeDeps: { exclude: ['three'] },
  assetsInclude: ['**/*.glb'],
});
