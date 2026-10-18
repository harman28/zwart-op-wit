import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTeamPageHtml } from '../netstandTeamScrape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');

const TEAM_752_URL = 'https://sga.netstand.nl/teams/view/752';
const TEAM_761_URL = 'https://sga.netstand.nl/teams/view/761';

// Both fixtures are the *raw* page source netstand actually serves — copied
// verbatim from "View Page Source", not a browser-saved "complete webpage".
// That distinction matters: a browser-saved copy captures the DOM *after*
// DataTables.js has hydrated it (added its own `dataTable` class, wrapped
// tables in extra divs) — this backend's plain fetch() never runs that JS,
// so a fixture built from a hydrated save tests a shape this code will
// never actually see in production. That exact mistake shipped a bug
// (#120) where the "Spelers"/"Persoonlijke Resultaten" tables leaked into
// the Results table and the roster came back empty — caught only once a
// real netstand page was compared against this parser's live output.

describe('parseTeamPageHtml (real Zwart op Wit 1 team page)', () => {
  const details = parseTeamPageHtml(fixture('team-752.html'), TEAM_752_URL);

  it('reads the team name and its division standing', () => {
    expect(details.teamName).toBe('Zwart op Wit 1');
    expect(details.matchPoints).toBe(0);
    expect(details.boardPoints).toBe(3.5);
    expect(details.divisionName).toBe('2e Klasse B');
    expect(details.divisionUrl).toBe('https://sga.netstand.nl/divisions/view/82');
  });

  it('lists exactly the 7 scheduled matches — no extra rows leaked in from the roster tables', () => {
    expect(details.matches).toHaveLength(7);
    expect(details.matches.map((m) => m.round)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('derives a loss from the one played match, played at home', () => {
    const played = details.matches[0]!;
    expect(played).toMatchObject({
      round: 1,
      date: '28-09-2026',
      homeTeam: 'Zwart op Wit 1',
      awayTeam: 'De Volewijckers 2',
      isHome: true,
      ownScore: 3.5,
      opponentScore: 4.5,
      outcome: 'LOSS',
      pairingUrl: 'https://sga.netstand.nl/pairings/view/2557',
    });
  });

  it('leaves unplayed matches with null scores and no outcome', () => {
    const unplayed = details.matches[1]!;
    expect(unplayed).toMatchObject({
      round: 2,
      awayTeam: 'VAS 4',
      ownScore: null,
      opponentScore: null,
      outcome: null,
    });
  });

  it('correctly reads isHome=false for an away fixture', () => {
    const away = details.matches[2]!;
    expect(away).toMatchObject({
      round: 3,
      homeTeam: 'Chaturanga 2',
      awayTeam: 'Zwart op Wit 1',
      isHome: false,
    });
  });

  it('lists all 8 roster players with rating/played/points — not the empty array the pre-fix sibling-vs-descendant bug produced', () => {
    expect(details.roster).toHaveLength(8);
    const joppe = details.roster.find((p) => p.name.includes('Joppe'))!;
    expect(joppe).toMatchObject({
      name: 'Bolderman, J. (Joppe)',
      playerUrl: 'https://sga.netstand.nl/players/view/534674',
      rating: 1941,
      played: 1,
      points: 0,
    });
    // Jim drew his one board (½ point) — exercises the half-point parsing
    // on the roster table too, not just match scores.
    const jim = details.roster.find((p) => p.name.includes('Jim'))!;
    expect(jim.points).toBe(0.5);
  });
});

describe('parseTeamPageHtml (real Zwart op Wit 2 team page — a 6-row schedule, a draw, and a bye round)', () => {
  const details = parseTeamPageHtml(fixture('team-761.html'), TEAM_761_URL);

  it('reads the team name and its division standing', () => {
    expect(details.teamName).toBe('Zwart op Wit 2');
    expect(details.matchPoints).toBe(1);
    expect(details.boardPoints).toBe(4);
    expect(details.divisionName).toBe('3e Klasse A');
  });

  it('lists exactly the 6 scheduled matches — round 3 is a genuine bye, not a parsing gap', () => {
    expect(details.matches).toHaveLength(6);
    expect(details.matches.map((m) => m.round)).toEqual([1, 2, 4, 5, 6, 7]);
  });

  it('derives a draw when both sides scored the same', () => {
    const drawn = details.matches[0]!;
    expect(drawn).toMatchObject({
      round: 1,
      homeTeam: 'Zwart op Wit 2',
      awayTeam: 'VAS 7',
      isHome: true,
      ownScore: 4,
      opponentScore: 4,
      outcome: 'DRAW',
    });
  });

  it('lists all 8 roster players — this exact page is what first came back with 0 before the sibling-table fix', () => {
    expect(details.roster).toHaveLength(8);
    expect(details.roster.map((p) => p.rating)).toEqual([1628, 1553, 1858, 1784, 0, 1754, 0, 0]);
  });
});
