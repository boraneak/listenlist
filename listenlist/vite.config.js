import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { exclude: ['@diffusionstudio/vits-web'] },
  worker: { format: 'es' },
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
