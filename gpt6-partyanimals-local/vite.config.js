import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { host: '127.0.0.1', port: 3069, strictPort: true }, preview: { host: '127.0.0.1', port: 3069, strictPort: true }, build: { target: 'es2022', chunkSizeWarningLimit: 2200 }, optimizeDeps: { exclude: ['three', '@dimforge/rapier3d-compat'] } });
