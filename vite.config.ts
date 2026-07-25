import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  base: './',
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@cornerstonejs/codec-charls', '@cornerstonejs/codec-openjpeg'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  worker: {
    format: 'es',
  },
});
