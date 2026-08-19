// server.js — production server for the PS2 Web app.
// Sets cross-origin isolation (COOP/COEP) so the Play! core (SharedArrayBuffer
// for pthreads) can actually instantiate. Serves the built Vite bundle + the
// wasm core with the correct MIME type.

import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;
const dist = path.join(root, 'dist');

if (!fs.existsSync(dist)) {
  console.error('Build not found. Run "npm run build" first.');
  process.exit(1);
}

const app = express();

// Cross-origin isolation — required for SharedArrayBuffer (Play! pthreads).
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// Strict MIME for wasm/JS.
app.use(express.static(dist, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  },
}));

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`\n  PS2 Web running at  http://localhost:${port}\n  crossOriginIsolated = required headers set\n`);
});
