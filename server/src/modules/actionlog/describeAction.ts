/**
 * Turns a raw (method, path, body) into a short human-readable label for the
 * action log — e.g. "Set result WHITE_WIN on Round #12" instead of
 * "PATCH /api/admin/rounds/12/entries/45". Falls back to the raw request for
 * anything not explicitly recognized rather than guessing.
 */
export function describeAction(method: string, path: string, body: unknown): string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  if (path === '/api/auth/change-password') return 'Changed the admin password';

  const match = path.match(/^\/api\/admin\/(.+)$/);
  if (!match) return `${method} ${path}`;
  const segs = match[1]!.split('/');

  if (segs[0] === 'players') {
    if (segs.length === 1 && method === 'POST') return `Added player "${String(b.name ?? '')}"`;
    if (segs[1] === 'import') return 'Imported a roster of players';
    if (segs.length === 2 && method === 'PATCH') {
      const parts: string[] = [];
      if (typeof b.name === 'string') parts.push(`renamed to "${b.name}"`);
      if (typeof b.membershipType === 'string') parts.push(`membership set to ${b.membershipType}`);
      if ('notes' in b) parts.push('notes updated');
      return `Updated player #${segs[1]}${parts.length ? ': ' + parts.join(', ') : ''}`;
    }
  }

  if (segs[0] === 'seasons') {
    if (segs.length === 1 && method === 'POST') return `Started season "${String(b.name ?? '')}"`;
    if (segs[2] === 'end') return `Ended season #${segs[1]}`;
    if (segs[2] === 'settings') return `Updated season #${segs[1]} settings`;
    if (segs[2] === 'rounds' && method === 'POST') return `Created Round ${String(b.number ?? '?')}`;
  }

  if (segs[0] === 'rounds') {
    const roundId = segs[1];
    if (segs.length === 2 && method === 'PATCH') return `Updated Round #${roundId}`;
    if (segs.length === 2 && method === 'DELETE') return `Deleted Round #${roundId}`;
    if (segs[2] === 'entries' && segs.length === 3 && method === 'POST') return `Added an entry to Round #${roundId}`;
    if (segs[2] === 'entries' && segs.length === 4) {
      const entryId = segs[3];
      if (method === 'DELETE') return `Removed entry #${entryId} from Round #${roundId}`;
      if (method === 'PATCH') {
        if (typeof b.result === 'string') return `Set result ${b.result} on Round #${roundId}`;
        if ('externalOutcome' in b) return `Set external result ${String(b.externalOutcome ?? '(pending)')} on Round #${roundId}`;
        if (b.kind === 'GAME' && (b.whitePlayerId != null || b.blackPlayerId != null)) {
          return `Assigned an opponent on Round #${roundId}`;
        }
        if (b.whitePlayerId != null || b.blackPlayerId != null) return `Swapped a player on Round #${roundId}`;
        if (b.tableNumber != null) return `Changed a table number on Round #${roundId}`;
        return `Updated an entry on Round #${roundId}`;
      }
    }
    if (segs[2] === 'table-numbers') return `Renumbered tables on Round #${roundId} (starting at ${String(b.startAt)})`;
    if (segs[2] === 'publish') return `Published Round #${roundId}`;
  }

  if (segs[0] === 'backup' && segs[1] === 'import') return 'Replaced a season from a backup file';

  return `${method} ${path}`;
}
