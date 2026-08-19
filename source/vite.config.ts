import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server MUST set cross-origin isolation headers so the Play! core
// (which uses SharedArrayBuffer for pthreads) can actually instantiate.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    headers: isolationHeaders,
    port: 5000,
    host: true,
  },
  preview: {
    headers: isolationHeaders,
    port: 5000,
    host: true,
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
});
