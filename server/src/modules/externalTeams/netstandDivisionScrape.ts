import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 8000;

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`netstand fetch failed: ${res.status} ${url}`);
  return res.text();
}

export interface DivisionTeamStanding {
  rank: number;
  name: string;
  teamUrl: string;
  /** "MP" on netstand — 2 per match won, 1 per drawn, 0 per lost. */
  matchPoints: number;
  /** "BP" on netstand — the sum of individual board results across all of
   * this team's played matches (e.g. 4½ out of 8 boards in one match). */
  boardPoints: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface DivisionStandings {
  divisionName: string;
  teams: DivisionTeamStanding[];
}

/** "3½" -> 3.5, "4" -> 4 — netstand's own notation for a half point. */
function parseScoreText(text: string): number {
  return parseFloat(text.trim().replace('½', '.5'));
}

/**
 * Parses a netstand division page's own cross-table (every team in the
 * division against every other) into a ranked standings list. The page also
 * has a simpler "Teams" summary table lower down with the same MP/BP, but it
 * doesn't carry per-match results, so win/draw/loss couldn't be derived from
 * it — the cross-table is the only source for that, and it alone already has
 * everything this needs (team, MP, BP, and the per-match score grid).
 *
 * Win/draw/loss per team isn't readable from a single cell: a played cell
 * only shows *that* team's own score for the match (e.g. the ZOW1 row shows
 * "3½" for a match it actually lost 3½-4½). Each match's pairing ID appears
 * in exactly two rows (both teams playing it, since the whole table is one
 * division), so this reads every played cell once, then looks up the other
 * side's score for the same pairing ID to compare the two and decide the
 * result — robust regardless of board count or how many rounds have been
 * played so far this season.
 *
 * `pageUrl` resolves relative team-page hrefs, same reasoning as
 * findPairingUrlInTeamPageHtml in netstandScrape.ts: the live site serves
 * them relative, only a browser-saved copy has already rewritten them
 * absolute.
 */
export function parseDivisionStandingsHtml(html: string, pageUrl: string): DivisionStandings {
  const $ = cheerio.load(html);
  const divisionName = $('h1').first().text().trim();

  const rows = $('.card .card-body table tbody tr').toArray();

  interface RawRow {
    name: string;
    teamUrl: string;
    matchPoints: number;
    boardPoints: number;
    playedCells: { pairingId: string; ownScore: number }[];
  }

  const rawRows: RawRow[] = rows.map((row) => {
    const cells = $(row).find('td');
    const nameLink = $(cells.get(0)).find('a').first();
    const name = nameLink.text().trim();
    const href = nameLink.attr('href') ?? '';
    const teamUrl = href ? new URL(href, pageUrl).href : '';
    const matchPoints = parseScoreText($(cells.get(1)).text());
    const boardPoints = parseScoreText($(cells.get(2)).text());

    const playedCells: { pairingId: string; ownScore: number }[] = [];
    for (let i = 3; i < cells.length; i++) {
      const cell = $(cells.get(i));
      const bold = cell.find('b');
      if (bold.length === 0) continue; // unplayed ("-") or the diagonal self-cell ("☓")
      const pairingId = cell.find('a').attr('href')?.match(/\/pairings\/view\/(\d+)/)?.[1];
      if (!pairingId) continue;
      playedCells.push({ pairingId, ownScore: parseScoreText(bold.text()) });
    }
    return { name, teamUrl, matchPoints, boardPoints, playedCells };
  });

  // pairingId -> every score recorded for it (one per side, so summing and
  // subtracting the "own" one gives the opponent's, even when it's a draw).
  const pairingTotals = new Map<string, number>();
  for (const row of rawRows) {
    for (const cell of row.playedCells) {
      pairingTotals.set(cell.pairingId, (pairingTotals.get(cell.pairingId) ?? 0) + cell.ownScore);
    }
  }

  const teams: DivisionTeamStanding[] = rawRows.map((row, idx) => {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    for (const cell of row.playedCells) {
      const opponentScore = (pairingTotals.get(cell.pairingId) ?? cell.ownScore * 2) - cell.ownScore;
      if (cell.ownScore > opponentScore) wins++;
      else if (cell.ownScore === opponentScore) draws++;
      else losses++;
    }
    return {
      rank: idx + 1,
      name: row.name,
      teamUrl: row.teamUrl,
      matchPoints: row.matchPoints,
      boardPoints: row.boardPoints,
      played: row.playedCells.length,
      wins,
      draws,
      losses,
    };
  });

  return { divisionName, teams };
}

export async function fetchDivisionStandings(divisionUrl: string): Promise<DivisionStandings> {
  const html = await fetchHtml(divisionUrl);
  return parseDivisionStandingsHtml(html, divisionUrl);
}
