// Renders the "share this player" preview image shown when a player
// permalink (/players/:id) is posted in WhatsApp/Slack/etc — see
// lib/shareImageKit.ts for the satori/resvg card shell shared with the round
// and external-team preview images. Unlike a round's image, there's no
// publish event to hang regeneration off of (a player's standing can shift
// on any result entry) and the underlying replay is cheap for a club this
// size, so this renders on read with a short TTL cache rather than
// persisting a row anywhere — same tradeoff externalTeams.service.ts makes
// for its own standings.
import { canvas, COLORS, el, kicker, toPng, withTtlCache, type SatoriNode } from '../../lib/shareImageKit.js';
import { getPlayerHistory, getSeason } from './seasons.service.js';

function recordStat(label: string, value: number, color: string): SatoriNode {
  return el('div', { display: 'flex', flexDirection: 'column' }, [
    el('div', { display: 'flex', fontSize: 20, lineHeight: 1.3, color: COLORS.muted, letterSpacing: 1 }, [label.toUpperCase()]),
    el('div', { display: 'flex', fontSize: 72, lineHeight: 1.1, fontWeight: 700, color }, [String(value)]),
  ]);
}

/** Two columns, not the generic kicker/title/subtitle/body `frame` the
 * round and team cards use: the left side is this player's own static
 * identity (who they are, independent of any one season — name, KNSB id,
 * external team), the right side is this-season data (season, rank,
 * record). Grouping by "does this change season to season" rather than by
 * importance reads more logically than interleaving the two, per feedback
 * on an earlier single-column version of this card. */
async function renderPlayerShareImagePng(input: {
  name: string;
  seasonName: string;
  rank: number;
  fieldSize: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** "KNSB NED 8939370" — same format as PlayerProfilePage.tsx's own meta
   * line, built from federation + knsbId. Null if neither is set. */
  knsbLine: string | null;
  /** "Plays for Zwart op Wit 1" — same wording as PlayerProfilePage.tsx's
   * own meta line. Null if not linked to an external team. */
  teamLine: string | null;
}): Promise<Buffer> {
  const identityColumn = el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, width: 460 }, [
    kicker(),
    el('div', { display: 'flex', fontSize: 40, lineHeight: 1.25, fontWeight: 700, color: COLORS.accent, marginTop: 12 }, [input.name]),
    ...(input.knsbLine
      ? [el('div', { display: 'flex', fontSize: 22, lineHeight: 1.4, color: COLORS.muted, marginTop: 18 }, [input.knsbLine])]
      : []),
    ...(input.teamLine
      ? [el('div', { display: 'flex', fontSize: 22, lineHeight: 1.4, color: COLORS.muted, marginTop: input.knsbLine ? 6 : 18 }, [input.teamLine])]
      : []),
  ]);

  const seasonColumn = el('div', { display: 'flex', flexDirection: 'column', flex: 1, marginLeft: 64 }, [
    el('div', { display: 'flex', fontSize: 24, lineHeight: 1.3, color: COLORS.muted }, [
      `${input.seasonName} · Rank #${input.rank} of ${input.fieldSize}`,
    ]),
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end', marginTop: 28 }, [
      recordStat('Win', input.wins, COLORS.win),
      el('div', { display: 'flex', width: 48 }, []),
      recordStat('Draw', input.draws, COLORS.draw),
      el('div', { display: 'flex', width: 48 }, []),
      recordStat('Loss', input.losses, COLORS.loss),
    ]),
    el('div', { display: 'flex', fontSize: 22, lineHeight: 1.3, color: COLORS.muted, marginTop: 20 }, [`${input.played} played`]),
  ]);

  return toPng(canvas([el('div', { display: 'flex', flexDirection: 'row', width: '100%' }, [identityColumn, seasonColumn])]));
}

const cached = withTtlCache<Buffer>(5 * 60 * 1000);

/** Public read: the PNG bytes for a player's current-season standing. Throws
 * (via getPlayerHistory/getSeason) the same 404s the player history endpoint
 * already does for an unknown season/player. */
export async function getPlayerShareImagePng(seasonId: number, playerId: number): Promise<Buffer> {
  return cached(`${seasonId}:${playerId}`, async () => {
    const [season, history] = await Promise.all([getSeason(seasonId), getPlayerHistory(seasonId, playerId)]);
    const knsbLine = history.federation || history.knsbId ? `KNSB ${history.federation ?? '—'} ${history.knsbId ?? '—'}` : null;
    const teamLine = history.externalTeam ? `Plays for ${history.externalTeam.name}` : null;
    return renderPlayerShareImagePng({
      name: history.name,
      seasonName: season.name,
      rank: history.standing.rank,
      fieldSize: history.fieldSize,
      played: history.standing.played,
      wins: history.standing.wins,
      draws: history.standing.draws,
      losses: history.standing.losses,
      knsbLine,
      teamLine,
    });
  });
}
