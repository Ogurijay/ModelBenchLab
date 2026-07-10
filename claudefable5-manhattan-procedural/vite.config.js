import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 3025,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 4025,
    strictPort: true
  },
  build: {
    chunkSizeWarningLimit: 900
  }
});
