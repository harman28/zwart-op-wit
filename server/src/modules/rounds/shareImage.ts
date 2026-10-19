// Renders the "share this round" preview image shown when a round permalink
// is posted in WhatsApp/Slack/etc — see regenerateShareImageIfPublished for
// when this runs and RoundShareImage in schema.prisma for where the result
// is kept. See lib/shareImageKit.ts for the satori/resvg card shell shared
// with the player and external-team preview images.
import type { Player, Round, RoundEntry, Season } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import { COLORS, el, frame, toPng, truncateText, twoColumnGrid, type SatoriNode } from '../../lib/shareImageKit.js';

// Two columns of 7 — comfortably covers every round this club has actually
// run (9-14 games); the "+N more" line is a rare safety net, not the normal
// case. Deliberately conservative beyond that: satori/flexbox will silently
// squash (not wrap or scroll) any child that doesn't fit a fixed-height
// container, so this has to cover the worst case (MAX_ROWS rows across both
// columns + the "+N more" line + a bye line), not just the typical one.
// Verified by eye at that worst case; if the frame's paddings/font sizes
// change, recheck it.
const MAX_ROWS = 14;

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

// nowrap + overflow:hidden as a fallback only — truncateText (shareImageKit)
// is what's meant to keep a row single-line; this just clips cleanly if
// that's ever wrong, same reasoning as the frame's own overflow:hidden.
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
      el(
        'div',
        { display: 'flex', flexShrink: 0, width: 30, color: COLORS.muted, fontSize: 16, lineHeight: 1.3 },
        [String(entry.tableNumber ?? '')],
      ),
      el('div', { ...NAME_STYLE, justifyContent: 'flex-end', textAlign: 'right' }, [
        truncateText(entry.whitePlayer?.name ?? '—'),
      ]),
      el(
        'div',
        { display: 'flex', flexShrink: 0, width: 60, justifyContent: 'center', color: COLORS.muted, fontSize: 16, lineHeight: 1.3 },
        [resultLabel(entry.result)],
      ),
      el('div', NAME_STYLE, [truncateText(entry.blackPlayer?.name ?? '—')]),
    ],
  );
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
