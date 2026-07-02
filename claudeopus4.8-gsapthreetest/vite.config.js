import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 子项目独立可运行；根门户用 `vite --port 3014 claudeopus4.8-gsapthreetest`
// 以本目录为 root 启动，会自动加载这份配置（插件从本目录 node_modules 解析）。
export default defineConfig({
  plugins: [react()],
  server: { port: 3014, host: true, open: false },
})
