import { prisma } from '../../db/client.js';

export interface LogContext {
  roundNumber?: number;
  tableNumber?: number | null;
  whitePlayerId?: number | null;
  blackPlayerId?: number | null;
  soloPlayerId?: number | null;
  whiteName?: string;
  blackName?: string;
  soloName?: string;
  playerName?: string;
  seasonName?: string;
  /** Filled in later, in the onResponse hook, once the request body is available. */
  newWhiteName?: string;
  newBlackName?: string;
  newSoloName?: string;
  newPlayerAName?: string;
  newPlayerBName?: string;
}

/**
 * Looks up the friendly names/numbers behind the IDs in an admin route's URL
 * — round number, table number, player names — so the action log can say
 * "Round 3, Table 5 (Jan T. vs Frans)" instead of "Round #103". Must run
 * *before* the mutation (an onRequest hook, not onResponse) so a DELETE can
 * still resolve what it's about to remove.
 */
export async function resolveLogContext(path: string): Promise<LogContext> {
  const match = path.match(/^\/api\/admin\/(.+)$/);
  if (!match) return {};
  const segs = match[1]!.split('/');

  try {
    if (segs[0] === 'rounds' && segs[1] && segs[2] === 'entries' && segs[3]) {
      const entry = await prisma.roundEntry.findUnique({
        where: { id: Number(segs[3]) },
        include: { round: true, whitePlayer: true, blackPlayer: true, soloPlayer: true },
      });
      if (entry) {
        return {
          roundNumber: entry.round.number,
          tableNumber: entry.tableNumber,
          whitePlayerId: entry.whitePlayerId,
          blackPlayerId: entry.blackPlayerId,
          soloPlayerId: entry.soloPlayerId,
          whiteName: entry.whitePlayer?.name,
          blackName: entry.blackPlayer?.name,
          soloName: entry.soloPlayer?.name,
        };
      }
    }
    if (segs[0] === 'rounds' && segs[1]) {
      const round = await prisma.round.findUnique({ where: { id: Number(segs[1]) } });
      if (round) return { roundNumber: round.number };
    }
    if (segs[0] === 'players' && segs[1] && segs[1] !== 'import') {
      const player = await prisma.player.findUnique({ where: { id: Number(segs[1]) } });
      if (player) return { playerName: player.name };
    }
    if (segs[0] === 'seasons' && segs[1] && segs[1] !== 'current') {
      const season = await prisma.season.findUnique({ where: { id: Number(segs[1]) } });
      if (season) return { seasonName: season.name };
    }
  } catch {
    // best-effort enrichment only — a lookup failure just falls back to raw IDs
  }
  return {};
}

/** Resolves whichever new whitePlayerId/blackPlayerId/soloPlayerId/playerAId/playerBId
 * the request body is setting (a swap, assign-opponent, add-entry, or add-matchup) into
 * names — runs post-mutation (onResponse), once the body is available, unlike the
 * round/table/old-player lookup above. */
export async function resolveNewPlayerNames(body: unknown): Promise<{
  newWhiteName?: string;
  newBlackName?: string;
  newSoloName?: string;
  newPlayerAName?: string;
  newPlayerBName?: string;
}> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const ids = [b.whitePlayerId, b.blackPlayerId, b.soloPlayerId, b.playerAId, b.playerBId].filter(
    (v): v is number => typeof v === 'number',
  );
  if (ids.length === 0) return {};
  try {
    const players = await prisma.player.findMany({ where: { id: { in: ids } } });
    const byId = new Map(players.map((p) => [p.id, p.name]));
    return {
      newWhiteName: typeof b.whitePlayerId === 'number' ? byId.get(b.whitePlayerId) : undefined,
      newBlackName: typeof b.blackPlayerId === 'number' ? byId.get(b.blackPlayerId) : undefined,
      newSoloName: typeof b.soloPlayerId === 'number' ? byId.get(b.soloPlayerId) : undefined,
      newPlayerAName: typeof b.playerAId === 'number' ? byId.get(b.playerAId) : undefined,
      newPlayerBName: typeof b.playerBId === 'number' ? byId.get(b.playerBId) : undefined,
    };
  } catch {
    return {};
  }
}
