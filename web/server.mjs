// Minimal production server: serves the Vite build and proxies /api to the
// backend service over Railway's private network, so the browser only ever
// talks to one origin (no CORS, no cross-site cookie concerns).
//
// It also does one bit of light SSR: /round/:number gets its <meta> tags
// filled in server-side before index.html is sent, with og:image pointing
// at the backend's own pre-rendered share image for that round (generated
// on publish/edit — see server/src/modules/rounds/shareImage.ts — and
// served through the /api proxy above, so this file never renders anything
// itself). This is a plain client-rendered SPA otherwise — link crawlers
// (WhatsApp, Slack, iMessage, ...) don't run JS, so without this a shared
// round permalink would only ever show the site's generic preview.
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import fs from 'node:fs';
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

async function apiGet(path) {
  const res = await fetch(`${apiTarget}/api${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

/** The same "latest season" the frontend follows (useLatestSeason) — round
 * permalinks are scoped to whichever season is current, never a specific one. */
async function getLatestSeason() {
  const seasons = await apiGet('/seasons');
  return seasons[0] ?? null;
}

async function findRound(number) {
  const season = await getLatestSeason();
  if (!season) return null;
  const rounds = await apiGet(`/seasons/${season.id}/rounds`);
  const round = rounds.find((r) => r.number === number);
  return round ? { round, season } : null;
}

/** A short TTL absorbs a burst of near-simultaneous fetches from the same
 * share (WhatsApp/Slack/Twitter's crawlers commonly fetch a link 2-3 times
 * while building their own preview) without needing anything fancier — this
 * is a small club site, not something under sustained crawler load. */
function withCache(ttlMs) {
  const cache = new Map();
  return async (key, compute) => {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await compute();
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  };
}
const cachedRound = withCache(30_000);

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const indexHtmlTemplate = fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf-8');

function renderIndexHtml(req, { title, description, image, url } = {}) {
  const origin = `${req.protocol}://${req.get('host')}`;
  let html = indexHtmlTemplate;
  if (title) html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  if (title) html = html.replace(/(property="og:title" content=").*?(")/, `$1${title}$2`);
  if (description) html = html.replace(/(property="og:description" content=").*?(")/, `$1${description}$2`);
  html = html.replace('__OG_IMAGE__', image ?? `${origin}/og-default.png`);
  html = html.replace('__OG_URL__', url ?? `${origin}${req.originalUrl}`);
  return html;
}

// path-to-regexp v8 (Express 5) dropped inline regex param constraints, so
// non-numeric round numbers are rejected in the handler instead — falling
// through to the SPA catch-all, same as any other unmatched route.
function parseRoundNumber(req, res, next) {
  const number = Number(req.params.number);
  if (!Number.isInteger(number) || number < 1) return next('route');
  req.roundNumber = number;
  next();
}

// Registered ahead of the SPA catch-all below — everything else still falls
// through to it unchanged.
app.get('/round/:number', parseRoundNumber, async (req, res, next) => {
  const number = req.roundNumber;
  try {
    const found = await cachedRound(number, () => findRound(number));
    if (!found) return next();
    const { round, season } = found;
    const origin = `${req.protocol}://${req.get('host')}`;
    const gameCount = round.entries.filter((e) => e.kind === 'GAME').length;
    res.send(
      renderIndexHtml(req, {
        title: `Round ${round.number} — ${season.name}`,
        description: `${gameCount} pairing${gameCount === 1 ? '' : 's'} · ${formatDate(round.date)} — Zwart op Wit internal competition.`,
        image: `${origin}/api/seasons/${season.id}/rounds/${number}/share-image.png`,
        url: `${origin}${req.originalUrl}`,
      }),
    );
  } catch (err) {
    console.error('round meta render failed:', err);
    next();
  }
});

const distDir = path.join(__dirname, 'dist');
// index: false — otherwise express.static serves dist/index.html verbatim
// for '/' (its default directory-index behavior), bypassing renderIndexHtml
// below and leaving the __OG_IMAGE__/__OG_URL__ tokens unreplaced.
app.use(express.static(distDir, { index: false }));
app.get('*splat', (req, res) => {
  res.send(renderIndexHtml(req));
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`web listening on :${port}, proxying /api -> ${apiTarget}`);
});
