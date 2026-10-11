import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 3061,
    strictPort: true
  },
  build: {
    chunkSizeWarningLimit: 1500
  }
});
