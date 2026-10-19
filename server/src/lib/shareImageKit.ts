// Shared scaffolding for every "share this page" preview image (rounds,
// players, external teams — see each module's own shareImage.ts). Satori
// lays out a small subset of flexbox CSS into SVG; resvg then rasterizes
// that to a PNG — no headless browser needed for either step. Factored out
// once a third image needed the exact same card shell as the first two.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/lib -> dist -> server, then into the uncompiled assets/ dir that sits
// alongside src/ and dist/ (see tsconfig's rootDir/outDir).
const fontRegular = fs.readFileSync(path.join(__dirname, '../../assets/fonts/Roboto-Regular.ttf'));
const fontBold = fs.readFileSync(path.join(__dirname, '../../assets/fonts/Roboto-Bold.ttf'));

export const WIDTH = 1200;
export const HEIGHT = 630;

// Same palette as web/src/styles/tokens.css's dark theme (:root) — this
// renders with no access to any viewer's light/dark preference, so it
// always uses the site's default theme.
export const COLORS = {
  bg: '#09080a',
  border: '#3a3018',
  accent: '#d4a853',
  muted: '#b89b6c',
  text: '#f8f0dd',
  // Same --win/--loss/--draw dark-theme values as tokens.css's :root —
  // generic status colors (not the chess-result white/black colors, which
  // are fixed regardless of theme and don't apply to a player's own record).
  win: '#7c9a6b',
  loss: '#b0524a',
  draw: '#a89566',
};

export type SatoriNode = { type: string; props: { style: Record<string, unknown>; children?: unknown } };

export function el(type: string, style: Record<string, unknown>, children?: unknown): SatoriNode {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

/** A labeled number — "WIN" over a big colored "4" — used identically by
 * the player card's Win/Draw/Loss row and the team card's MP/BP/Win/Draw/
 * Loss rows. `fontSize` defaults to the player card's size; the team card
 * uses a smaller one to leave room for its roster list below. */
export function statTile(label: string, value: string, color: string, fontSize = 72): SatoriNode {
  return el('div', { display: 'flex', flexDirection: 'column' }, [
    el('div', { display: 'flex', fontSize: 20, lineHeight: 1.3, color: COLORS.muted, letterSpacing: 1 }, [label.toUpperCase()]),
    el('div', { display: 'flex', fontSize, lineHeight: 1.1, fontWeight: 700, color }, [value]),
  ]);
}

/** A fixed-width horizontal gap between stat tiles in a row. */
export function statGap(width = 48): SatoriNode {
  return el('div', { display: 'flex', width }, []);
}

/** Truncated manually (not via CSS text-overflow) so it always keeps the
 * start of the text and cuts the end — satori's own ellipsis handling
 * truncates from an unpredictable point when the container is
 * right-aligned or has siblings, which several of these cards' rows do. */
export function truncateText(text: string, maxLength = 18): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** The fixed WIDTH/HEIGHT canvas every card shares — background, padding,
 * and vertical centering of whatever `children` it's given. Without the
 * centering, a card with only a few short lines (the player/team cards)
 * stacks flush against the top, leaving the bottom half of the canvas empty
 * and everything crammed into one corner. The round card's own dense
 * pairing grid already nearly fills the frame, so this has little visible
 * effect there. Exposed directly (not just through `frame` below) for a
 * card whose content isn't a simple kicker/title/subtitle/body column —
 * see playerShareImage.ts's two-column identity/season layout. */
export function canvas(children: SatoriNode[]): SatoriNode {
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: WIDTH,
      height: HEIGHT,
      justifyContent: 'center',
      // Safety net, not the primary control — each caller's own row-count
      // limit is what's meant to keep content within HEIGHT. This just makes
      // sure that if that math is ever off, content gets clipped cleanly
      // instead of flexbox squashing/overlapping earlier siblings to make room.
      overflow: 'hidden',
      background: COLORS.bg,
      padding: '56px 64px',
      fontFamily: 'Roboto',
    },
    children,
  );
}

export function kicker(): SatoriNode {
  return el(
    'div',
    { display: 'flex', flexShrink: 0, fontSize: 20, lineHeight: 1.3, letterSpacing: 3, color: COLORS.accent, fontWeight: 700 },
    ['ZWART OP WIT'],
  );
}

/** Two fixed-width columns, centered as one block within the canvas — used
 * by the player and team cards to separate "static identity" (left: name,
 * and whatever else doesn't change from one season/division to the next)
 * from "current standing" (right: season/division, rank, record). A fixed
 * width rather than flex:1 for the right column matters here: a flexed box
 * stretches to fill the remaining row space, but its *content* (a few short
 * lines) stays left-aligned within that box regardless, so flexing it just
 * hides unused space inside the box instead of removing it — a matching
 * fixed width keeps the row's actual visible content close to the left
 * column's own width, which centering the row then balances against the
 * canvas as a whole. */
export function twoColumnCard(left: SatoriNode[], right: SatoriNode[]): SatoriNode {
  const COLUMN_WIDTH = 460;
  const leftColumn = el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, width: COLUMN_WIDTH }, left);
  const rightColumn = el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, width: COLUMN_WIDTH, marginLeft: 72 }, right);
  const row = el('div', { display: 'flex', flexDirection: 'row' }, [leftColumn, rightColumn]);
  return canvas([el('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }, [row])]);
}

/** "<Title>" is deliberately small (40px, not a hero title) — whatever the
 * card's own body highlights is why someone opens the image, so the title
 * shouldn't out-rank it. */
export function frame(title: string, subtitle: string, body: SatoriNode[]): SatoriNode {
  return canvas([
    kicker(),
    el('div', { display: 'flex', flexShrink: 0, fontSize: 40, lineHeight: 1.25, fontWeight: 700, color: COLORS.accent, marginTop: 12 }, [
      title,
    ]),
    el('div', { display: 'flex', flexShrink: 0, fontSize: 20, lineHeight: 1.3, color: COLORS.muted, marginTop: 6 }, [subtitle]),
    el('div', { display: 'flex', flexShrink: 0, flexDirection: 'column', width: '100%', marginTop: 22 }, body),
  ]);
}

export async function toPng(tree: SatoriNode): Promise<Buffer> {
  const svg = await satori(tree as never, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Roboto', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Roboto', data: fontBold, weight: 700, style: 'normal' },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
  return Buffer.from(resvg.render().asPng());
}

/** A short TTL absorbs a burst of near-simultaneous fetches from the same
 * share (WhatsApp/Slack/Twitter's crawlers commonly fetch a link 2-3 times
 * while building their own preview) without needing anything fancier, and
 * spares re-running satori/resvg on every single crawler hit. Same pattern
 * as externalTeams.service.ts's own small TTL caches. */
export function withTtlCache<V>(ttlMs: number) {
  const cache = new Map<string, { expires: number; value: V }>();
  return async (key: string, compute: () => Promise<V>): Promise<V> => {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await compute();
    cache.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  };
}
