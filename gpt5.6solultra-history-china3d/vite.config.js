import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 3043,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4043,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
