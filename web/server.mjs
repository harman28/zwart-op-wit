// Minimal production server: serves the Vite build and proxies /api to the
// backend service over Railway's private network, so the browser only ever
// talks to one origin (no CORS, no cross-site cookie concerns).
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const apiTarget = process.env.API_INTERNAL_URL;
if (!apiTarget) {
  console.error('API_INTERNAL_URL is not set');
  process.exit(1);
}

// Express strips the '/api' mount prefix before this middleware sees the
// path, but the backend's routes are registered with that prefix included —
// so the proxy target itself carries '/api' (http-proxy-middleware's own
// documented pattern for this), putting it back.
app.use('/api', createProxyMiddleware({ target: `${apiTarget}/api`, changeOrigin: true }));

const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*splat', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`web listening on :${port}, proxying /api -> ${apiTarget}`);
});
