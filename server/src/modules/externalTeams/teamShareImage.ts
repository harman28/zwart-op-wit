// Renders the "share this team" preview image shown when one of our own
// external-team permalinks (/external-teams/:id) is posted in
// WhatsApp/Slack/etc — see lib/shareImageKit.ts for the satori/resvg card
// shell shared with the round and player preview images. Reuses the same
// cached division-standings fetch getExternalDivisionStandings() already
// does for the standings page (for this team's own rank/MP/BP/record), plus
// getTeamDetails() (for its roster) — both already cached independently, so
// this doesn't add a second live netstand fetch of its own.
import { prisma } from '../../db/client.js';
import {
  canvas,
  COLORS,
  el,
  kicker,
  statGap,
  statTile,
  toPng,
  truncateText,
  twoColumnGrid,
  withTtlCache,
  type SatoriNode,
} from '../../lib/shareImageKit.js';
import { getExternalDivisionStandings, getTeamDetails } from './externalTeams.service.js';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Comfortably covers this club's own two team rosters (6-8 players today)
// across two columns; the "+N more" line is a rare safety net, not the
// normal case, same reasoning as rounds/shareImage.ts's own MAX_ROWS.
const MAX_ROSTER_ROWS = 24;

function rosterRow(p: { name: string; rating: number }): SatoriNode {
  return el(
    'div',
    {
      display: 'flex',
      flexShrink: 0,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 0',
      borderBottom: `1px solid ${COLORS.border}`,
      fontSize: 20,
      lineHeight: 1.3,
    },
    [
      // 18 (truncateText's default) was tuned for the round card's tighter
      // two-name-per-row pairing layout — one name sharing a full-width
      // column with a short rating number can afford more.
      el('div', { display: 'flex', color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden' }, [truncateText(p.name, 30)]),
      el('div', { display: 'flex', color: COLORS.muted, fontSize: 16, marginLeft: 12 }, [String(p.rating)]),
    ],
  );
}

/** Top area: identity (left — kicker, team name, division/rank, the only
 * season-independent block) beside the division standing (right — the
 * MP/BP/W/D/L stat tiles, the same size/style the player card's own record
 * row uses). Below that, the roster spans the card's *full* width, not
 * confined under either column — it's this card's actual point, the same
 * way a round's pairing grid is, so it gets the most room rather than
 * being squeezed into a half-width column like an earlier version did. */
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
    el('div', { display: 'flex', fontSize: 24, lineHeight: 1.3, color: COLORS.muted, marginTop: 6 }, [
      `${input.divisionName} · Rank #${input.rank} of ${input.teamCount}`,
    ]),
  ]);

  const standingColumn = el('div', { display: 'flex', flexDirection: 'column', flexShrink: 0, width: 460, marginLeft: 72, marginTop: 24 }, [
    // Match result (MP/BP) and game record (W/D/L) on separate lines — a
    // same-row separation (wider gap, or a divider) read as too subtle at
    // thumbnail size; two rows is unambiguous.
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end' }, [
      statTile('MP', formatNumber(input.matchPoints), COLORS.accent, 56),
      statGap(28),
      statTile('BP', formatNumber(input.boardPoints), COLORS.text, 56),
    ]),
    el('div', { display: 'flex', flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 }, [
      statTile('W', String(input.wins), COLORS.win, 56),
      statGap(20),
      statTile('D', String(input.draws), COLORS.draw, 56),
      statGap(20),
      statTile('L', String(input.losses), COLORS.loss, 56),
    ]),
  ]);

  const header = el('div', { display: 'flex', flexDirection: 'row' }, [identityColumn, standingColumn]);

  const shownRoster = input.roster.slice(0, MAX_ROSTER_ROWS);
  const rosterOverflow = input.roster.length - shownRoster.length;

  const rosterSection: SatoriNode[] =
    shownRoster.length > 0
      ? [
          el('div', { display: 'flex', fontSize: 18, lineHeight: 1.3, color: COLORS.muted, letterSpacing: 1, marginTop: 26 }, [
            'PLAYERS',
          ]),
          el('div', { display: 'flex', flexDirection: 'column', width: '100%', marginTop: 10 }, [
            twoColumnGrid(shownRoster.map(rosterRow)),
            ...(rosterOverflow > 0
              ? [
                  el('div', { display: 'flex', marginTop: 8, fontSize: 18, lineHeight: 1.3, color: COLORS.muted }, [
                    `+${rosterOverflow} more`,
                  ]),
                ]
              : []),
          ]),
        ]
      : [];

  return toPng(canvas([el('div', { display: 'flex', flexDirection: 'column', width: '100%' }, [header, ...rosterSection])]));
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
