// Renders the "share this team" preview image shown when one of our own
// external-team permalinks (/external-teams/:id) is posted in
// WhatsApp/Slack/etc — see lib/shareImageKit.ts for the satori/resvg card
// shell shared with the round and player preview images. Reuses the same
// cached division-standings fetch getExternalDivisionStandings() already
// does for the standings page, rather than re-scraping the team's own page
// (which getTeamDetails does, for its roster/results — not needed here).
import { prisma } from '../../db/client.js';
import { COLORS, el, kicker, statGap, statTile, toPng, twoColumnCard, withTtlCache } from '../../lib/shareImageKit.js';
import { getExternalDivisionStandings } from './externalTeams.service.js';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Same two-column shape as the player card: left is this team's own static
 * identity (just its name — a team has no other season-independent field
 * the way a player has a KNSB id), right is this-division data (division,
 * rank, MP/BP, W/D/L record). */
async function renderTeamShareImagePng(input: {
  teamName: string;
  divisionName: string;
  rank: number;
  teamCount: number;
  matchPoints: number;
  boardPoints: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}): Promise<Buffer> {
  const left = [
    kicker(),
    el('div', { display: 'flex', fontSize: 40, lineHeight: 1.25, fontWeight: 700, color: COLORS.accent, marginTop: 12 }, [input.teamName]),
  ];

  const right = [
    el('div', { display: 'flex', fontSize: 24, lineHeight: 1.3, color: COLORS.muted }, [
      `${input.divisionName} · Rank #${input.rank} of ${input.teamCount}`,
    ]),
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end', marginTop: 28 }, [
      statTile('MP', formatNumber(input.matchPoints), COLORS.accent),
      statGap(),
      statTile('BP', formatNumber(input.boardPoints), COLORS.text),
    ]),
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end', marginTop: 24 }, [
      statTile('Win', String(input.wins), COLORS.win),
      statGap(),
      statTile('Draw', String(input.draws), COLORS.draw),
      statGap(),
      statTile('Loss', String(input.losses), COLORS.loss),
    ]),
    el('div', { display: 'flex', fontSize: 22, lineHeight: 1.3, color: COLORS.muted, marginTop: 20 }, [`${input.played} played`]),
  ];

  return toPng(twoColumnCard(left, right));
}

const cached = withTtlCache<Buffer | null>(5 * 60 * 1000);

/** Public read: the PNG bytes for one of our own external teams' current
 * division standing. Null if the team id doesn't exist, or (rare — would
 * mean EXTERNAL_DIVISIONS and the ExternalTeam table have drifted apart,
 * see externalTeams.service.ts's own comment on ourTeamId) its division
 * standing can't be resolved. */
export async function getTeamShareImagePng(teamId: number): Promise<Buffer | null> {
  return cached(String(teamId), async () => {
    const team = await prisma.externalTeam.findUnique({ where: { id: teamId } });
    if (!team) return null;

    const divisions = await getExternalDivisionStandings();
    const division = divisions.find((d) => d.ourTeamId === teamId);
    const standing = division?.teams.find((t) => t.name === team.name);
    if (!division || !standing) return null;

    return renderTeamShareImagePng({
      teamName: team.name,
      divisionName: division.divisionName,
      rank: standing.rank,
      teamCount: division.teams.length,
      matchPoints: standing.matchPoints,
      boardPoints: standing.boardPoints,
      played: standing.played,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
    });
  });
}
