import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    strictPort: true,
    host: '0.0.0.0',
    port: 3002
  }
})
