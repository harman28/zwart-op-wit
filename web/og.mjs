// Renders the OG preview image used for shared round permalinks (and the
// site's generic fallback), and the HTML <meta> tags that point to it.
// Satori lays out a small subset of flexbox CSS into SVG; resvg then
// rasterizes that to a PNG — no headless browser needed for either step.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fontRegular = fs.readFileSync(path.join(__dirname, 'assets/fonts/Roboto-Regular.ttf'));
const fontBold = fs.readFileSync(path.join(__dirname, 'assets/fonts/Roboto-Bold.ttf'));

const WIDTH = 1200;
const HEIGHT = 630;
// Two columns of 7 — comfortably covers every round this club has actually
// run (9-14 games); the "+N more" line is a rare safety net, not the normal
// case. Deliberately conservative beyond that: satori/flexbox will silently
// squash (not wrap or scroll) any child that doesn't fit a fixed-height
// container, so this has to cover the worst case (MAX_ROWS rows across both
// columns + the "+N more" line + a bye line), not just the typical one.
// Verified by eye at that worst case; if the frame's paddings/font sizes
// change, recheck it.
const MAX_ROWS = 14;

// Same palette as web/src/styles/tokens.css's dark theme (:root) — the
// image is generated server-side with no access to the visitor's own
// light/dark preference, so it always renders in the site's default theme.
const COLORS = {
  bg: '#09080a',
  border: '#3a3018',
  accent: '#d4a853',
  muted: '#b89b6c',
  text: '#f8f0dd',
};

function el(type, style, children) {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

function resultLabel(result) {
  switch (result) {
    case 'WHITE_WIN':
      return '1–0';
    case 'WHITE_WIN_FORFEIT':
      return '1–0R';
    case 'BLACK_WIN':
      return '0–1';
    case 'BLACK_WIN_FORFEIT':
      return '0–1R';
    case 'DRAW':
      return '½–½';
    default:
      return 'vs';
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Truncated manually (not via CSS text-overflow) so it always keeps the
// start of the name and cuts the end — with the White column right-aligned,
// satori's own ellipsis handling truncates from an unpredictable point
// instead. Real names are all well under this in practice; this only
// matters for the pathological case (nobody in this club has an 18+
// character name today, but nothing stops one from joining).
function truncateName(name) {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

// nowrap + overflow:hidden as a fallback only — truncateName above is what's
// meant to keep a row single-line; this just clips cleanly if that's ever
// wrong, same reasoning as the frame's own overflow:hidden.
const NAME_STYLE = {
  display: 'flex',
  flex: 1,
  color: COLORS.text,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
};

function pairingRow(entry) {
  return el(
    'div',
    {
      display: 'flex',
      flexShrink: 0,
      width: '100%',
      alignItems: 'center',
      padding: '5px 0',
      borderBottom: `1px solid ${COLORS.border}`,
      fontSize: 22,
      lineHeight: 1.3,
    },
    [
      el('div', { ...NAME_STYLE, justifyContent: 'flex-end', textAlign: 'right' }, [
        truncateName(entry.whitePlayer?.name ?? '—'),
      ]),
      el(
        'div',
        {
          display: 'flex',
          flexShrink: 0,
          width: 60,
          justifyContent: 'center',
          color: COLORS.muted,
          fontSize: 16,
          lineHeight: 1.3,
        },
        [resultLabel(entry.result)],
      ),
      el('div', NAME_STYLE, [truncateName(entry.blackPlayer?.name ?? '—')]),
    ],
  );
}

/** Splits pairing rows left-then-right (first half in column 1, rest in
 * column 2) rather than interleaving — reads the same way a printed pairing
 * sheet split into two columns would. */
function twoColumnGrid(rows) {
  const mid = Math.ceil(rows.length / 2);
  return el('div', { display: 'flex', flexDirection: 'row', flexShrink: 0, width: '100%' }, [
    el('div', { display: 'flex', flexDirection: 'column', flex: 1 }, rows.slice(0, mid)),
    el('div', { display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 40 }, rows.slice(mid)),
  ]);
}

/** The shared frame every OG image uses — a title/subtitle block, optional
 * body content, and the club wordmark pinned to the bottom. `titleSize`
 * defaults to a large brand treatment (the title IS the content on the
 * brand-only fallback); round images pass a much smaller one — the round
 * number is the least useful thing on that image, the pairings are why
 * someone opens it, so the title shouldn't out-rank them. */
function frame({ eyebrow, title, titleSize = 68, subtitle, body }) {
  return el(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: WIDTH,
      height: HEIGHT,
      // Safety net, not the primary control — MAX_ROWS below is what's
      // meant to keep content within HEIGHT. This just makes sure that if
      // that math is ever off, content gets clipped cleanly instead of
      // flexbox squashing/overlapping earlier siblings to make room.
      overflow: 'hidden',
      background: COLORS.bg,
      padding: '56px 64px',
      fontFamily: 'Roboto',
    },
    [
      el(
        'div',
        {
          display: 'flex',
          flexShrink: 0,
          fontSize: 20,
          lineHeight: 1.3,
          letterSpacing: 3,
          color: COLORS.accent,
          fontWeight: 700,
        },
        [(eyebrow ?? 'ZWART OP WIT').toUpperCase()],
      ),
      el(
        'div',
        {
          display: 'flex',
          flexShrink: 0,
          fontSize: titleSize,
          lineHeight: 1.25,
          fontWeight: 700,
          color: COLORS.accent,
          marginTop: titleSize > 40 ? 20 : 12,
        },
        [title],
      ),
      ...(subtitle
        ? [
            el(
              'div',
              {
                display: 'flex',
                flexShrink: 0,
                fontSize: titleSize > 40 ? 24 : 20,
                lineHeight: 1.3,
                color: COLORS.muted,
                marginTop: titleSize > 40 ? 14 : 6,
              },
              [subtitle],
            ),
          ]
        : []),
      ...(body
        ? [el('div', { display: 'flex', flexShrink: 0, flexDirection: 'column', width: '100%', marginTop: 22 }, body)]
        : [
            // Only the brand-only fallback (no pairings) gets this — a round
            // image is already dense enough that the eyebrow above is
            // branding enough, and the vertical space matters more there.
            el(
              'div',
              { display: 'flex', flexShrink: 0, marginTop: 'auto', fontSize: 18, lineHeight: 1.3, color: COLORS.muted },
              ['Internal Competition'],
            ),
          ]),
    ],
  );
}

async function toPng(tree) {
  const svg = await satori(tree, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'Roboto', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Roboto', data: fontBold, weight: 700, style: 'normal' },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } });
  return resvg.render().asPng();
}

/** The generic fallback used for the homepage and any round that can't be
 * found (a stale/typo'd link) — same frame, no pairings. */
export function renderBrandImage({ title = 'Zwart op Wit', subtitle } = {}) {
  return toPng(frame({ title, subtitle }));
}

/** `round` is a Round from GET /api/seasons/:id/rounds (see web/src/api/types.ts) —
 * only its GAME entries are shown, in two columns (the pairings are the
 * point of this image, so they get almost the whole frame). Byes get one
 * small summary line instead of a row each, and anything past MAX_ROWS
 * (rare — see its comment) collapses into a "+N more" line so a big round
 * never overflows the fixed-height image. */
export function renderRoundImage(round, seasonName) {
  const games = round.entries.filter((e) => e.kind === 'GAME').sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0));
  const byes = round.entries.filter((e) => e.kind === 'PAIRING_BYE' || e.kind === 'EXTERNAL_BYE');

  const shown = games.slice(0, MAX_ROWS);
  const overflow = games.length - shown.length;

  const body = [
    twoColumnGrid(shown.map(pairingRow)),
    ...(overflow > 0
      ? [
          el(
            'div',
            { display: 'flex', flexShrink: 0, marginTop: 10, fontSize: 20, lineHeight: 1.3, color: COLORS.muted },
            [`+${overflow} more`],
          ),
        ]
      : []),
    ...(byes.length > 0
      ? [
          el(
            'div',
            { display: 'flex', flexShrink: 0, marginTop: 14, fontSize: 18, lineHeight: 1.3, color: COLORS.muted },
            [`Bye: ${byes.map((b) => b.soloPlayer?.name ?? '—').join(', ')}`],
          ),
        ]
      : []),
  ];

  return toPng(
    frame({
      title: `Round ${round.number}`,
      titleSize: 40,
      subtitle: [seasonName, formatDate(round.date)].filter(Boolean).join(' · '),
      body,
    }),
  );
}

export function roundMetaTags({ round, seasonName, imageUrl, pageUrl }) {
  const gameCount = round.entries.filter((e) => e.kind === 'GAME').length;
  const title = `Round ${round.number} — ${seasonName}`;
  const description = `${gameCount} pairing${gameCount === 1 ? '' : 's'} · ${formatDate(round.date)} — Zwart op Wit internal competition.`;
  return { title, description, imageUrl, pageUrl };
}
