import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 8000;

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`netstand fetch failed: ${res.status} ${url}`);
  return res.text();
}

/** "3½" -> 3.5, "4" -> 4 — netstand's own notation for a half point. */
function parseScoreText(text: string): number {
  return parseFloat(text.trim().replace('½', '.5'));
}

export interface TeamMatch {
  round: number;
  date: string;
  homeTeam: string;
  homeTeamUrl: string;
  awayTeam: string;
  awayTeamUrl: string;
  /** Whether *this* team (the one whose page was fetched) played at home. */
  isHome: boolean;
  ownScore: number | null;
  opponentScore: number | null;
  outcome: 'WIN' | 'DRAW' | 'LOSS' | null;
  pairingUrl: string;
}

export interface TeamRosterPlayer {
  name: string;
  playerUrl: string;
  rating: number;
  played: number;
  points: number;
}

export interface TeamDetails {
  teamName: string;
  matchPoints: number;
  boardPoints: number;
  divisionName: string;
  divisionUrl: string;
  matches: TeamMatch[];
  roster: TeamRosterPlayer[];
}

/** Finds the table immediately following a given <h2> heading's exact text —
 * needed because "Spelers" and "Opgegeven Spelers" render two structurally
 * identical tables (same headers, and in practice the same rows too, since a
 * club rarely fields someone who isn't registered); proximity to the right
 * heading is the only way to tell them apart. */
function tableAfterHeading($: cheerio.CheerioAPI, headingText: string) {
  const heading = $('h2')
    .filter((_, el) => $(el).text().trim() === headingText)
    .first();
  if (heading.length === 0) return null;
  const table = heading.nextUntil('h2').find('table').first();
  return table.length > 0 ? table : null;
}

/**
 * Parses a netstand team page (e.g. https://sga.netstand.nl/teams/view/752)
 * into its match schedule/results and player roster — the data behind the
 * team's own "/external-teams/:id" page on our site. `pageUrl` resolves
 * relative hrefs, same reasoning as netstandScrape.ts's own team-page parsing.
 */
export function parseTeamPageHtml(html: string, pageUrl: string): TeamDetails {
  const $ = cheerio.load(html);
  const ourTeamId = pageUrl.match(/\/teams\/view\/(\d+)/)?.[1];

  const teamName = $('h1').first().text().trim();
  const mpText = $('.row > .col-sm-6:contains("MP")').first().text().replace('MP', '').trim();
  const bpText = $('.row > .col-sm-6:contains("BP")').first().text().replace('BP', '').trim();
  const matchPoints = parseScoreText(mpText);
  const boardPoints = parseScoreText(bpText);

  const divisionLink = $('h2:contains("Wedstrijden") a').first();
  const divisionName = divisionLink.text().trim();
  const divisionHref = divisionLink.attr('href') ?? '';
  const divisionUrl = divisionHref ? new URL(divisionHref, pageUrl).href : '';

  const matches: TeamMatch[] = $('table.table-striped.table-bordered:not(.dataTable) tbody tr')
    .toArray()
    .map((row) => {
      const cells = $(row).find('td');
      const round = parseInt($(cells.get(0)).text().replace(/\D/g, ''), 10);
      const date = $(cells.get(1)).text().trim();
      const homeLink = $(cells.get(2)).find('a').first();
      const awayLink = $(cells.get(3)).find('a').first();
      const homeTeam = homeLink.text().trim();
      const homeHref = homeLink.attr('href') ?? '';
      const homeTeamUrl = homeHref ? new URL(homeHref, pageUrl).href : '';
      const awayTeam = awayLink.text().trim();
      const awayHref = awayLink.attr('href') ?? '';
      const awayTeamUrl = awayHref ? new URL(awayHref, pageUrl).href : '';
      const homeTeamId = homeTeamUrl.match(/\/teams\/view\/(\d+)/)?.[1];
      const isHome = ourTeamId != null && homeTeamId === ourTeamId;

      const resultCell = $(cells.get(4));
      const resultLink = resultCell.find('a').first();
      const pairingHref = resultLink.attr('href') ?? '';
      const pairingUrl = pairingHref ? new URL(pairingHref, pageUrl).href : '';
      const resultText = resultLink.text().trim();

      let ownScore: number | null = null;
      let opponentScore: number | null = null;
      let outcome: TeamMatch['outcome'] = null;
      const scoreMatch = resultText.match(/^(.+?)\s*-\s*(.+)$/);
      if (scoreMatch) {
        const homeScore = parseScoreText(scoreMatch[1]!);
        const awayScore = parseScoreText(scoreMatch[2]!);
        ownScore = isHome ? homeScore : awayScore;
        opponentScore = isHome ? awayScore : homeScore;
        outcome = ownScore > opponentScore ? 'WIN' : ownScore === opponentScore ? 'DRAW' : 'LOSS';
      }

      return { round, date, homeTeam, homeTeamUrl, awayTeam, awayTeamUrl, isHome, ownScore, opponentScore, outcome, pairingUrl };
    });

  const rosterTable = tableAfterHeading($, 'Spelers');
  const roster: TeamRosterPlayer[] = rosterTable
    ? rosterTable
        .find('tbody tr')
        .toArray()
        .map((row) => {
          const cells = $(row).find('td');
          const nameLink = $(cells.get(0)).find('a').first();
          const href = nameLink.attr('href') ?? '';
          return {
            name: nameLink.text().trim(),
            playerUrl: href ? new URL(href, pageUrl).href : '',
            rating: parseFloat($(cells.get(1)).text().trim()),
            played: parseInt($(cells.get(2)).text().trim(), 10),
            points: parseScoreText($(cells.get(3)).text()),
          };
        })
    : [];

  return { teamName, matchPoints, boardPoints, divisionName, divisionUrl, matches, roster };
}

export async function fetchTeamDetails(teamUrl: string): Promise<TeamDetails> {
  const html = await fetchHtml(teamUrl);
  return parseTeamPageHtml(html, teamUrl);
}
