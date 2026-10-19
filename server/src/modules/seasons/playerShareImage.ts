// Renders the "share this player" preview image shown when a player
// permalink (/players/:id) is posted in WhatsApp/Slack/etc — see
// lib/shareImageKit.ts for the satori/resvg card shell shared with the round
// and external-team preview images. Unlike a round's image, there's no
// publish event to hang regeneration off of (a player's standing can shift
// on any result entry) and the underlying replay is cheap for a club this
// size, so this renders on read with a short TTL cache rather than
// persisting a row anywhere — same tradeoff externalTeams.service.ts makes
// for its own standings.
import { COLORS, el, frame, toPng, withTtlCache, type SatoriNode } from '../../lib/shareImageKit.js';
import { getPlayerHistory, getSeason } from './seasons.service.js';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function stat(label: string, value: string, opts: { big?: boolean } = {}): SatoriNode {
  return el('div', { display: 'flex', flexDirection: 'column' }, [
    el('div', { display: 'flex', fontSize: 20, lineHeight: 1.3, color: COLORS.muted, letterSpacing: 1 }, [label.toUpperCase()]),
    el(
      'div',
      { display: 'flex', fontSize: opts.big ? 110 : 54, lineHeight: 1.1, fontWeight: 700, color: opts.big ? COLORS.accent : COLORS.text, marginTop: 6 },
      [value],
    ),
  ]);
}

async function renderPlayerShareImagePng(input: {
  name: string;
  seasonName: string;
  rank: number;
  fieldSize: number;
  value: number;
  score: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}): Promise<Buffer> {
  const body: SatoriNode[] = [
    // Points leads (big/accent) and Value trails, matching the leaderboard's
    // own column order and emphasis — Points is the primary sort metric
    // there, Value the quieter companion number (see LeaderboardView.tsx).
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end' }, [
      stat('Points', formatNumber(input.score), { big: true }),
      el('div', { display: 'flex', width: 56 }, []),
      stat('Value', formatNumber(input.value)),
    ]),
    el('div', { display: 'flex', fontSize: 24, lineHeight: 1.3, color: COLORS.muted, marginTop: 36 }, [
      `${input.played} played · ${input.wins}W ${input.draws}D ${input.losses}L`,
    ]),
  ];

  return toPng(frame(input.name, `${input.seasonName} · Rank #${input.rank} of ${input.fieldSize}`, body));
}

const cached = withTtlCache<Buffer>(5 * 60 * 1000);

/** Public read: the PNG bytes for a player's current-season standing. Throws
 * (via getPlayerHistory/getSeason) the same 404s the player history endpoint
 * already does for an unknown season/player. */
export async function getPlayerShareImagePng(seasonId: number, playerId: number): Promise<Buffer> {
  return cached(`${seasonId}:${playerId}`, async () => {
    const [season, history] = await Promise.all([getSeason(seasonId), getPlayerHistory(seasonId, playerId)]);
    return renderPlayerShareImagePng({
      name: history.name,
      seasonName: season.name,
      rank: history.standing.rank,
      fieldSize: history.fieldSize,
      value: history.standing.value,
      score: history.standing.score,
      played: history.standing.played,
      wins: history.standing.wins,
      draws: history.standing.draws,
      losses: history.standing.losses,
    });
  });
}
