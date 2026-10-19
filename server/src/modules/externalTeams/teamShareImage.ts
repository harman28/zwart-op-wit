// Renders the "share this team" preview image shown when one of our own
// external-team permalinks (/external-teams/:id) is posted in
// WhatsApp/Slack/etc — see lib/shareImageKit.ts for the satori/resvg card
// shell shared with the round and player preview images. Reuses the same
// cached division-standings fetch getExternalDivisionStandings() already
// does for the standings page, rather than re-scraping the team's own page
// (which getTeamDetails does, for its roster/results — not needed here).
import { prisma } from '../../db/client.js';
import { COLORS, el, frame, toPng, withTtlCache, type SatoriNode } from '../../lib/shareImageKit.js';
import { getExternalDivisionStandings } from './externalTeams.service.js';

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
  const body: SatoriNode[] = [
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end' }, [
      stat('MP', formatNumber(input.matchPoints), { big: true }),
      el('div', { display: 'flex', width: 56 }, []),
      stat('BP', formatNumber(input.boardPoints)),
    ]),
    el('div', { display: 'flex', fontSize: 24, lineHeight: 1.3, color: COLORS.muted, marginTop: 36 }, [
      `${input.played} played · ${input.wins}W ${input.draws}D ${input.losses}L`,
    ]),
  ];

  return toPng(frame(input.teamName, `${input.divisionName} · Rank #${input.rank} of ${input.teamCount}`, body));
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
