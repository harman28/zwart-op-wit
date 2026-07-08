import type { LogContext } from './resolveLogContext.js';

/**
 * Turns a raw (method, path, body) plus pre-resolved names/numbers into a
 * short human-readable label for the action log — e.g.
 * "Set result WHITE_WIN on Round 3, Table 5 (Jan T. vs Frans)" instead of
 * "PATCH /api/admin/rounds/103/entries/450". Falls back to raw IDs for
 * anything not explicitly recognized, or if the lookup came back empty.
 */
export function describeAction(method: string, path: string, body: unknown, ctx: LogContext = {}): string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  if (path === '/api/auth/change-password') return 'Changed the admin password';

  const match = path.match(/^\/api\/admin\/(.+)$/);
  if (!match) return `${method} ${path}`;
  const segs = match[1]!.split('/');

  const roundLabel = ctx.roundNumber != null ? `Round ${ctx.roundNumber}` : `Round #${segs[1]}`;
  const location = ctx.tableNumber != null ? `${roundLabel}, Table ${ctx.tableNumber}` : roundLabel;
  const matchup = [ctx.whiteName, ctx.blackName].filter(Boolean).join(' vs ');

  if (segs[0] === 'players') {
    if (segs.length === 1 && method === 'POST') return `Added player "${String(b.name ?? '')}"`;
    if (segs[1] === 'import') return 'Imported a roster of players';
    if (segs.length === 2 && method === 'PATCH') {
      const who = ctx.playerName ? `"${ctx.playerName}"` : `#${segs[1]}`;
      const parts: string[] = [];
      if (typeof b.name === 'string') parts.push(`renamed to "${b.name}"`);
      if (typeof b.membershipType === 'string') parts.push(`membership set to ${b.membershipType}`);
      if ('notes' in b) parts.push('notes updated');
      return `Updated ${who}${parts.length ? ': ' + parts.join(', ') : ''}`;
    }
  }

  if (segs[0] === 'seasons') {
    if (segs.length === 1 && method === 'POST') return `Started season "${String(b.name ?? '')}"`;
    const seasonLabel = ctx.seasonName ? `"${ctx.seasonName}"` : `#${segs[1]}`;
    if (segs[2] === 'end') return `Ended season ${seasonLabel}`;
    if (segs[2] === 'settings') return `Updated ${seasonLabel} settings`;
    if (segs[2] === 'rounds' && method === 'POST') return `Created Round ${String(b.number ?? '?')}`;
  }

  if (segs[0] === 'rounds') {
    if (segs.length === 2 && method === 'PATCH') return `Updated ${roundLabel}`;
    if (segs.length === 2 && method === 'DELETE') return `Deleted ${roundLabel}`;
    if (segs[2] === 'entries' && segs.length === 3 && method === 'POST') {
      if (b.kind === 'GAME' && ctx.newWhiteName && ctx.newBlackName) {
        return `Added ${ctx.newWhiteName} vs ${ctx.newBlackName} to ${roundLabel}${b.tableNumber != null ? `, Table ${String(b.tableNumber)}` : ''}`;
      }
      if (b.kind === 'EXTERNAL_BYE' && ctx.newSoloName) {
        return `Added an external result slot for ${ctx.newSoloName} on ${roundLabel}`;
      }
      return `Added an entry to ${roundLabel}`;
    }
    if (segs[2] === 'entries' && segs.length === 4) {
      if (method === 'DELETE') {
        const who = ctx.soloName ?? matchup;
        return `Removed ${who ? `${who}'s entry` : 'an entry'} from ${location}`;
      }
      if (method === 'PATCH') {
        if (typeof b.result === 'string') return `Set result ${b.result} on ${location}${matchup ? ` (${matchup})` : ''}`;
        if ('externalOutcome' in b) {
          return `Set external result ${String(b.externalOutcome ?? '(pending)')} for ${ctx.soloName ?? 'a player'} on ${roundLabel}`;
        }
        if (typeof b.whitePlayerId === 'number') {
          return `Swapped ${ctx.whiteName ?? 'the white player'} out for ${ctx.newWhiteName ?? '?'} (White) on ${location}`;
        }
        if (typeof b.blackPlayerId === 'number') {
          return `Swapped ${ctx.blackName ?? 'the black player'} out for ${ctx.newBlackName ?? '?'} (Black) on ${location}`;
        }
        if (b.tableNumber != null) return `Moved a game to Table ${String(b.tableNumber)} on ${roundLabel}`;
        return `Updated an entry on ${location}`;
      }
    }
    if (segs[2] === 'matchups' && method === 'POST') {
      return `Added ${ctx.newPlayerAName ?? '?'} vs ${ctx.newPlayerBName ?? '?'} to ${roundLabel}`;
    }
    if (segs[2] === 'entries' && segs[4] === 'assign-opponent' && method === 'POST') {
      const newOpponent = b.newOpponent as { name?: string } | undefined;
      const opponentName = ctx.newOpponentName ?? newOpponent?.name ?? 'an opponent';
      return `Assigned ${opponentName} to play ${ctx.soloName ?? 'the unpaired player'} on ${roundLabel}`;
    }
    if (segs[2] === 'table-numbers') return `Renumbered tables on ${roundLabel} (starting at ${String(b.startAt)})`;
    if (segs[2] === 'publish') return `Published ${roundLabel}`;
  }

  if (segs[0] === 'backup' && segs[1] === 'import') return 'Replaced a season from a backup file';

  return `${method} ${path}`;
}
