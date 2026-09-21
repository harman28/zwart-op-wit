// Renders the "share this round" preview image shown when a round permalink
// is posted in WhatsApp/Slack/etc — see regenerateShareImageIfPublished for
// when this runs and RoundShareImage in schema.prisma for where the result
// is kept. Satori lays out a small subset of flexbox CSS into SVG; resvg
// then rasterizes that to a PNG — no headless browser needed for either step.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Player, Round, RoundEntry, Season } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/modules/rounds -> dist -> server, then into the uncompiled assets/
// dir that sits alongside src/ and dist/ (see tsconfig's rootDir/outDir).
const fontRegular = fs.readFileSync(path.join(__dirname, '../../../assets/fonts/Roboto-Regular.ttf'));
const fontBold = fs.readFileSync(path.join(__dirname, '../../../assets/fonts/Roboto-Bold.ttf'));

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

// Same palette as web/src/styles/tokens.css's dark theme (:root) — this
// renders with no access to any viewer's light/dark preference, so it
// always uses the site's default theme.
const COLORS = {
  bg: '#09080a',
  border: '#3a3018',
  accent: '#d4a853',
  muted: '#b89b6c',
  text: '#f8f0dd',
};

type SatoriNode = { type: string; props: { style: Record<string, unknown>; children?: unknown } };

function el(type: string, style: Record<string, unknown>, children?: unknown): SatoriNode {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } };
}

function resultLabel(result: RoundEntry['result']): string {
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

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Truncated manually (not via CSS text-overflow) so it always keeps the
// start of the name and cuts the end — with the White column right-aligned,
// satori's own ellipsis handling truncates from an unpredictable point
// instead. Real names are all well under this in practice; this only
// matters for the pathological case (nobody in this club has an 18+
// character name today, but nothing stops one from joining).
function truncateName(name: string): string {
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

type EntryWithPlayers = RoundEntry & { whitePlayer: Player | null; blackPlayer: Player | null; soloPlayer: Player | null };

function pairingRow(entry: EntryWithPlayers): SatoriNode {
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
        { display: 'flex', flexShrink: 0, width: 60, justifyContent: 'center', color: COLORS.muted, fontSize: 16, lineHeight: 1.3 },
        [resultLabel(entry.result)],
      ),
      el('div', NAME_STYLE, [truncateName(entry.blackPlayer?.name ?? '—')]),
    ],
  );
}

/** Splits pairing rows left-then-right (first half in column 1, rest in
 * column 2) rather than interleaving — reads the same way a printed pairing
 * sheet split into two columns would. */
function twoColumnGrid(rows: SatoriNode[]): SatoriNode {
  const mid = Math.ceil(rows.length / 2);
  return el('div', { display: 'flex', flexDirection: 'row', flexShrink: 0, width: '100%' }, [
    el('div', { display: 'flex', flexDirection: 'column', flex: 1 }, rows.slice(0, mid)),
    el('div', { display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 40 }, rows.slice(mid)),
  ]);
}

/** "Round N" is deliberately small (40px, not a hero title) — the pairings
 * are why someone opens the image, so the title shouldn't out-rank them. */
function frame(title: string, subtitle: string, body: SatoriNode[]): SatoriNode {
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
        { display: 'flex', flexShrink: 0, fontSize: 20, lineHeight: 1.3, letterSpacing: 3, color: COLORS.accent, fontWeight: 700 },
        ['ZWART OP WIT'],
      ),
      el('div', { display: 'flex', flexShrink: 0, fontSize: 40, lineHeight: 1.25, fontWeight: 700, color: COLORS.accent, marginTop: 12 }, [
        title,
      ]),
      el('div', { display: 'flex', flexShrink: 0, fontSize: 20, lineHeight: 1.3, color: COLORS.muted, marginTop: 6 }, [subtitle]),
      el('div', { display: 'flex', flexShrink: 0, flexDirection: 'column', width: '100%', marginTop: 22 }, body),
    ],
  );
}

async function toPng(tree: SatoriNode): Promise<Buffer> {
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

type RoundForImage = Round & { season: Season; entries: EntryWithPlayers[] };

/** Only GAME entries get a row, in two columns (the pairings are the point
 * of this image, so they get almost the whole frame). Byes get one small
 * summary line instead of a row each, and anything past MAX_ROWS (rare —
 * see its comment) collapses into a "+N more" line so a big round never
 * overflows the fixed-height image. */
export async function renderShareImagePng(round: RoundForImage): Promise<Buffer> {
  const games = round.entries.filter((e) => e.kind === 'GAME').sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0));
  const byes = round.entries.filter((e) => e.kind === 'PAIRING_BYE' || e.kind === 'EXTERNAL_BYE');

  const shown = games.slice(0, MAX_ROWS);
  const overflow = games.length - shown.length;

  const body: SatoriNode[] = [
    twoColumnGrid(shown.map(pairingRow)),
    ...(overflow > 0
      ? [el('div', { display: 'flex', flexShrink: 0, marginTop: 10, fontSize: 20, lineHeight: 1.3, color: COLORS.muted }, [`+${overflow} more`])]
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

  return toPng(frame(`Round ${round.number}`, [round.season.name, formatDate(round.date)].filter(Boolean).join(' · '), body));
}

/** Re-renders and persists this round's share image if it's currently
 * published — a no-op for a draft round (nothing to share yet). Called
 * after every mutation that could change what the image shows: publishing,
 * any entry edit/add/delete, table renumbering, or the round's own
 * date/number changing. Failure here never fails the caller's mutation —
 * this is a nice-to-have preview image, not core round data. */
export async function regenerateShareImageIfPublished(roundId: number): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: true, entries: { include: { whitePlayer: true, blackPlayer: true, soloPlayer: true } } },
  });
  if (!round || !round.isPublished) return;

  try {
    // Prisma's Bytes field wants Uint8Array<ArrayBuffer> specifically —
    // Buffer's backing store is typed as the wider ArrayBufferLike, so it
    // doesn't satisfy that on its own even though it is one at runtime.
    const data = new Uint8Array(await renderShareImagePng(round));
    await prisma.roundShareImage.upsert({
      where: { roundId },
      create: { roundId, data },
      update: { data, generatedAt: new Date() },
    });
  } catch (err) {
    console.error(`Failed to regenerate share image for round ${roundId}:`, err);
  }
}

/** Public read: the PNG bytes for a published round's permalink. 404s for a
 * round that doesn't exist, isn't published, or — for a round published
 * before this feature existed and whose regeneration has since failed every
 * time — still has no image despite the generate-on-read fallback below. */
export async function getShareImagePng(seasonId: number, roundNumber: number): Promise<Buffer> {
  const round = await prisma.round.findUnique({
    where: { seasonId_number: { seasonId, number: roundNumber } },
    include: { shareImage: true },
  });
  if (!round || !round.isPublished) {
    throw new HttpError(404, `No published round ${roundNumber} in season ${seasonId}`);
  }
  if (round.shareImage) return Buffer.from(round.shareImage.data);

  // Not generated yet (published before this feature existed) — generate
  // and store it now rather than permanently serving nothing.
  await regenerateShareImageIfPublished(round.id);
  const withImage = await prisma.round.findUnique({ where: { id: round.id }, include: { shareImage: true } });
  if (!withImage?.shareImage) throw new HttpError(404, `Could not generate a share image for round ${roundNumber}`);
  return Buffer.from(withImage.shareImage.data);
}
