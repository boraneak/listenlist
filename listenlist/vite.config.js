import { defineConfig } from 'vite';

// Cross-origin isolation lets the voice engine use several CPU threads (much faster).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  build: { target: 'es2020' },
  server: { headers: isolation },
  preview: { headers: isolation },
});
