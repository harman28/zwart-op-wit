import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 8000;

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`netstand fetch failed: ${res.status} ${url}`);
  return res.text();
}

function toDutchDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getUTCFullYear()}`;
}

/** "Bolderman, J. (Joppe)" -> "Joppe" — every player link on netstand (team
 * roster and pairing pages alike) uses this "Last, Initials (First)" format;
 * our own Player.name only ever stores the first name. */
export function extractFirstName(linkText: string): string | null {
  const match = linkText.match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim() ?? null;
}

/**
 * Matches each roster entry's netstand name to one of our own Player rows,
 * so a team page can link a name straight to its profile instead of out to
 * netstand. `candidates` is the caller's job to narrow first (e.g. to
 * players already linked to this ExternalTeam) — matching here is by first
 * name alone, which would be far too loose across the whole club, but is
 * safe once scoped to one team's own small roster. A name that still
 * resolves to more than one candidate (two teammates sharing a first name)
 * is left unmatched rather than guessing.
 */
export function matchRosterNamesToPlayers<T extends { name: string }>(
  roster: T[],
  candidates: { id: number; name: string }[],
): (T & { playerId: number | null })[] {
  const byFirstName = new Map<string, number[]>();
  for (const p of candidates) {
    const key = p.name.trim().toLowerCase();
    byFirstName.set(key, [...(byFirstName.get(key) ?? []), p.id]);
  }
  return roster.map((entry) => {
    const firstName = extractFirstName(entry.name)?.toLowerCase();
    const matches = firstName ? (byFirstName.get(firstName) ?? []) : [];
    return { ...entry, playerId: matches.length === 1 ? matches[0]! : null };
  });
}

/**
 * Finds this team's pairing-page URL for a given date, from the "Wedstrijden"
 * schedule table on their team page — the same table the season/round-info
 * comment on ExternalTeam describes. Exported/pure w.r.t. parsing so it's
 * testable against a saved HTML fixture; only the outer fetch is live.
 *
 * `pageUrl` (the team page's own URL) is required to resolve the schedule's
 * hrefs — the live site serves them relative ("/pairings/view/2557"), only a
 * browser-saved copy (like this module's own test fixtures) has already
 * rewritten them to absolute URLs. `fetch()` needs an absolute URL, so this
 * always resolves against it rather than trusting whatever the markup gives.
 */
export function findPairingUrlInTeamPageHtml(html: string, date: Date, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const targetDate = toDutchDate(date);
  let pairingUrl: string | null = null;
  // "Wedstrijden" is the only table with both classes but not also a
  // DataTables-managed one — the roster tables below it get the `dataTable`
  // class and wrapper markup only once DataTables.js hydrates them client
  // side, which this (a plain HTTP fetch, never JS) never sees; on the raw
  // page itself they're already marked with data-toggle="datatable", which
  // is what actually distinguishes them here.
  $('table.table-striped.table-bordered:not([data-toggle="datatable"]) tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    const rowDate = $(cells.get(1)).text().trim();
    if (rowDate === targetDate) {
      const href = $(cells.get(4)).find('a').attr('href');
      if (href) pairingUrl = new URL(href, pageUrl).href;
    }
  });
  return pairingUrl;
}

/**
 * Parses a pairing page's board-by-board table into { firstName -> board
 * number }, board number being the row's plain position (netstand has no
 * explicit board-number column — the table's own row order *is* the board
 * order). netstand team pages can show up as either side of a pairing
 * ("Thuis"/home or "Uit"/away), so this reads the header to work out which
 * column holds our team's players before reading names from it.
 */
export function parseBoardNumbersFromPairingHtml(html: string, teamNetstandUrl: string): Map<string, number> {
  const $ = cheerio.load(html);
  const ourTeamId = teamNetstandUrl.match(/\/teams\/view\/(\d+)/)?.[1];
  const headerTeamLinks = $('table thead th a')
    .map((_, el) => $(el).attr('href'))
    .get();
  const homeTeamId = headerTeamLinks[0]?.match(/\/teams\/view\/(\d+)/)?.[1];
  const isHome = ourTeamId != null && homeTeamId === ourTeamId;

  const boards = new Map<string, number>();
  $('table tbody tr').each((i, row) => {
    const cells = $(row).find('td');
    const nameCell = isHome ? cells.get(1) : cells.get(4);
    const linkText = $(nameCell).find('a').first().text().trim();
    const firstName = extractFirstName(linkText);
    if (firstName) boards.set(firstName.toLowerCase(), i + 1);
  });
  return boards;
}

/**
 * Best-effort board-number lookup for one player on one date — never throws;
 * returns null on any failure (team has no netstand page for that date yet,
 * network hiccup, unrecognized page structure, whatever). Called from
 * updateEntry when an admin sets an external result's outcome; a failure
 * here must never block that action, it's just a nice-to-have.
 */
export async function fetchBoardNumber(teamNetstandUrl: string, roundDate: Date, playerFirstName: string): Promise<number | null> {
  try {
    const teamHtml = await fetchHtml(teamNetstandUrl);
    const pairingUrl = findPairingUrlInTeamPageHtml(teamHtml, roundDate, teamNetstandUrl);
    if (!pairingUrl) return null;
    const pairingHtml = await fetchHtml(pairingUrl);
    const boards = parseBoardNumbersFromPairingHtml(pairingHtml, teamNetstandUrl);
    return boards.get(playerFirstName.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}
