import { defineConfig } from 'vite';

// 端口 3028 由仓库根 RULES.md registry 登记给本项目(claudefable5-datagrid-virtual);
// 3027 属于兄弟项目 claudefable5-bowling-physics,勿混用。
// strictPort:被占用时直接报错而非自动挪端口,保证与登记表一致。
export default defineConfig({
  server: { port: 3028, strictPort: true },
  preview: { port: 3028, strictPort: true },
});
