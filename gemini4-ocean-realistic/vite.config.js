import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 3073,
    strictPort: true
  },
  preview: {
    port: 3073,
    strictPort: true
  }
});
