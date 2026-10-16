import {defineConfig} from 'vite';
export default defineConfig({
  base: './',
  server: {port: 3068, strictPort: true},
  assetsInclude: ['**/*.bin', '**/*.gz', '**/*.wasm', '**/*.data', '**/*.lua'],
  build: {assetsInlineLimit: 0, target: 'es2022'}
});
