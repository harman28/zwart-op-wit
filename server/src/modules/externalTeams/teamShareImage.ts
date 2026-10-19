// Renders the "share this team" preview image shown when one of our own
// external-team permalinks (/external-teams/:id) is posted in
// WhatsApp/Slack/etc — see lib/shareImageKit.ts for the satori/resvg card
// shell shared with the round and player preview images. Reuses the same
// cached division-standings fetch getExternalDivisionStandings() already
// does for the standings page (for this team's own rank/MP/BP/record), plus
// getTeamDetails() (for its roster) — both already cached independently, so
// this doesn't add a second live netstand fetch of its own.
import { prisma } from '../../db/client.js';
import { canvas, COLORS, el, kicker, statGap, statTile, toPng, truncateText, withTtlCache, type SatoriNode } from '../../lib/shareImageKit.js';
import { getExternalDivisionStandings, getTeamDetails } from './externalTeams.service.js';

// Two columns of 10 — comfortably covers this club's own two team rosters
// (6-8 players today); the "+N more" line is a rare safety net, not the
// normal case, same reasoning as rounds/shareImage.ts's own MAX_ROWS.
const MAX_ROSTER_ROWS = 20;

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function rosterRow(p: { name: string; rating: number }): SatoriNode {
  return el(
    'div',
    {
      display: 'flex',
      flexShrink: 0,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '3px 0',
      borderBottom: `1px solid ${COLORS.border}`,
      fontSize: 20,
      lineHeight: 1.3,
    },
    [
      // 18 (truncateText's default) was tuned for the round card's tighter
      // two-name-per-row pairing layout — this row has only one name
      // sharing the width with a short rating number, so it can afford more.
      el('div', { display: 'flex', color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden' }, [truncateText(p.name, 28)]),
      el('div', { display: 'flex', color: COLORS.muted, fontSize: 16, marginLeft: 12 }, [String(p.rating)]),
    ],
  );
}

/** Splits roster rows left-then-right (first half in column 1, rest in
 * column 2), same as rounds/shareImage.ts's own twoColumnGrid. */
function twoColumnRoster(rows: SatoriNode[]): SatoriNode {
  const mid = Math.ceil(rows.length / 2);
  return el('div', { display: 'flex', flexDirection: 'row', flexShrink: 0, width: '100%' }, [
    el('div', { display: 'flex', flexDirection: 'column', width: 460 }, rows.slice(0, mid)),
    el('div', { display: 'flex', flexDirection: 'column', width: 460, marginLeft: 72 }, rows.slice(mid)),
  ]);
}

/** Identity (left) / division standing (right) header, same grouping logic
 * as the player card, then a roster list below spanning both columns — the
 * actual point of this card per user feedback on an earlier stats-only
 * version. The stat rows are sized down from the player card's own 72px
 * (via statTile's fontSize param) to leave room for the roster under them;
 * the now-redundant "X played" line (played = wins+draws+losses) was
 * dropped for the same reason. */
async function renderTeamShareImagePng(input: {
  teamName: string;
  divisionName: string;
  rank: number;
  teamCount: number;
  matchPoints: number;
  boardPoints: number;
  wins: number;
  draws: number;
  losses: number;
  roster: { name: string; rating: number }[];
}): Promise<Buffer> {
  const identityColumn = el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, width: 460 }, [
    kicker(),
    el('div', { display: 'flex', fontSize: 40, lineHeight: 1.25, fontWeight: 700, color: COLORS.accent, marginTop: 12 }, [input.teamName]),
  ]);

  const standingColumn = el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, width: 460, marginLeft: 72 }, [
    el('div', { display: 'flex', fontSize: 24, lineHeight: 1.3, color: COLORS.muted }, [
      `${input.divisionName} · Rank #${input.rank} of ${input.teamCount}`,
    ]),
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end', marginTop: 18 }, [
      statTile('MP', formatNumber(input.matchPoints), COLORS.accent, 56),
      statGap(36),
      statTile('BP', formatNumber(input.boardPoints), COLORS.text, 56),
    ]),
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 }, [
      statTile('Win', String(input.wins), COLORS.win, 56),
      statGap(36),
      statTile('Draw', String(input.draws), COLORS.draw, 56),
      statGap(36),
      statTile('Loss', String(input.losses), COLORS.loss, 56),
    ]),
  ]);

  const header = el('div', { display: 'flex', flexDirection: 'row' }, [identityColumn, standingColumn]);

  const shownRoster = input.roster.slice(0, MAX_ROSTER_ROWS);
  const rosterOverflow = input.roster.length - shownRoster.length;
  const rosterBody: SatoriNode[] =
    shownRoster.length > 0
      ? [
          el('div', { display: 'flex', fontSize: 18, lineHeight: 1.3, color: COLORS.muted, letterSpacing: 1, marginTop: 28 }, ['PLAYERS']),
          el('div', { display: 'flex', flexDirection: 'column', width: '100%', marginTop: 10 }, [
            twoColumnRoster(shownRoster.map(rosterRow)),
            ...(rosterOverflow > 0
              ? [el('div', { display: 'flex', marginTop: 8, fontSize: 18, lineHeight: 1.3, color: COLORS.muted }, [`+${rosterOverflow} more`])]
              : []),
          ]),
        ]
      : [];

  return toPng(canvas([el('div', { display: 'flex', flexDirection: 'column', width: '100%' }, [header, ...rosterBody])]));
}

const cached = withTtlCache<Buffer | null>(5 * 60 * 1000);

/** Public read: the PNG bytes for one of our own external teams' current
 * division standing plus roster. Null if the team id doesn't exist, or
 * (rare — would mean EXTERNAL_DIVISIONS and the ExternalTeam table have
 * drifted apart, see externalTeams.service.ts's own comment on ourTeamId)
 * its division standing can't be resolved. */
export async function getTeamShareImagePng(teamId: number): Promise<Buffer | null> {
  return cached(String(teamId), async () => {
    const team = await prisma.externalTeam.findUnique({ where: { id: teamId } });
    if (!team) return null;

    const [divisions, details] = await Promise.all([getExternalDivisionStandings(), getTeamDetails(teamId)]);
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
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      roster: details?.roster.map((p) => ({ name: p.name, rating: p.rating })) ?? [],
    });
  });
}
