import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findPairingUrlInTeamPageHtml, parseBoardNumbersFromPairingHtml } from '../netstandScrape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');

const TEAM_752_URL = 'https://sga.netstand.nl/teams/view/752';

describe('findPairingUrlInTeamPageHtml (real Zwart op Wit 1 team page)', () => {
  const teamHtml = fixture('team-752.html');

  it('finds the pairing URL for a round played on the matching date', () => {
    const url = findPairingUrlInTeamPageHtml(teamHtml, new Date('2026-09-28T00:00:00Z'), TEAM_752_URL);
    expect(url).toBe('https://sga.netstand.nl/pairings/view/2557');
  });

  it('finds a different round by its own date', () => {
    const url = findPairingUrlInTeamPageHtml(teamHtml, new Date('2026-10-26T00:00:00Z'), TEAM_752_URL);
    expect(url).toBe('https://sga.netstand.nl/pairings/view/2564');
  });

  it('returns null for a date with no scheduled match', () => {
    const url = findPairingUrlInTeamPageHtml(teamHtml, new Date('2026-01-01T00:00:00Z'), TEAM_752_URL);
    expect(url).toBeNull();
  });

  it("doesn't get confused by the roster tables below the schedule (same classes minus dataTable)", () => {
    // Regression check for the selector itself — if it started matching the
    // wrong table, cell[1]/cell[4] would be nonsense and every lookup above
    // would silently return null instead of a real URL.
    const url = findPairingUrlInTeamPageHtml(teamHtml, new Date('2026-09-28T00:00:00Z'), TEAM_752_URL);
    expect(url).not.toBeNull();
  });
});

describe('findPairingUrlInTeamPageHtml (relative hrefs — the real live site, not a browser-saved copy)', () => {
  // The saved fixture above has hrefs already rewritten to absolute by
  // Chrome's "Save As" — it can never catch this. The real server serves
  // relative hrefs ("/pairings/view/2557"), confirmed by fetching it live:
  // fetch() rejects a relative URL outright with no base to resolve
  // against, which is exactly what broke the very first live attempt at
  // this feature.
  const html = `
    <table class="table table-striped table-bordered">
      <tbody>
        <tr>
          <td><a href="/rounds/view/565">Ronde 1</a></td>
          <td>28-09-2026</td>
          <td><a href="/teams/view/752">Zwart op Wit 1</a></td>
          <td><a href="/teams/view/759">De Volewijckers 2</a></td>
          <td><a href="/pairings/view/2557"><b>3½</b> - 4½</a></td>
        </tr>
      </tbody>
    </table>
  `;

  it('resolves a relative href against the team page URL passed in', () => {
    const url = findPairingUrlInTeamPageHtml(html, new Date('2026-09-28T00:00:00Z'), TEAM_752_URL);
    expect(url).toBe('https://sga.netstand.nl/pairings/view/2557');
  });
});

describe('parseBoardNumbersFromPairingHtml (real Round 1 pairing, ZoW 1 as home/"Thuis")', () => {
  const pairingHtml = fixture('pairing-2557.html');
  const teamUrl = 'https://sga.netstand.nl/teams/view/752';

  it('reads board numbers off the table row order for the home side', () => {
    const boards = parseBoardNumbersFromPairingHtml(pairingHtml, teamUrl);
    expect(boards.get('wiebe')).toBe(1);
    expect(boards.get('joppe')).toBe(2);
    expect(boards.get('pau')).toBe(3);
    expect(boards.get('wouter')).toBe(4);
    expect(boards.get('jim')).toBe(5);
    expect(boards.get('freerk')).toBe(6);
    expect(boards.get('sam')).toBe(7);
    expect(boards.get('maurice')).toBe(8);
  });

  it('matching is case-insensitive', () => {
    const boards = parseBoardNumbersFromPairingHtml(pairingHtml, teamUrl);
    expect(boards.get('JOPPE'.toLowerCase())).toBe(2);
  });

  it("never returns the opponent's players", () => {
    const boards = parseBoardNumbersFromPairingHtml(pairingHtml, teamUrl);
    expect(boards.has('martin')).toBe(false);
    expect(boards.has('eric')).toBe(false);
  });
});

describe('parseBoardNumbersFromPairingHtml (our team as the away/"Uit" side)', () => {
  // A minimal synthetic pairing page in the same shape netstand actually
  // produces, for the case none of the real captured pages happen to cover:
  // our team listed second (away) rather than first (home).
  const html = `
    <table>
      <thead>
        <tr>
          <th></th>
          <th><a href="https://sga.netstand.nl/teams/view/759">De Volewijckers 2</a></th>
          <th>Rating</th>
          <th></th>
          <th><a href="https://sga.netstand.nl/teams/view/752">Zwart op Wit 1</a></th>
          <th>Rating</th>
          <th>Ronde 1</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td></td><td><a href="/players/view/1">Away, X. (Opponent)</a></td><td>1900</td>
          <td></td><td><a href="/players/view/2">Bolderman, J. (Joppe)</a></td><td>1941</td>
          <td>0 - 1</td>
        </tr>
        <tr>
          <td></td><td><a href="/players/view/3">Away, Y. (Second)</a></td><td>1850</td>
          <td></td><td><a href="/players/view/4">Reitsma, F. (Freerk)</a></td><td>1809</td>
          <td>1 - 0</td>
        </tr>
      </tbody>
    </table>
  `;

  it('reads board numbers off the away-side column when our team is listed second', () => {
    const boards = parseBoardNumbersFromPairingHtml(html, 'https://sga.netstand.nl/teams/view/752');
    expect(boards.get('joppe')).toBe(1);
    expect(boards.get('freerk')).toBe(2);
    expect(boards.has('opponent')).toBe(false);
    expect(boards.has('second')).toBe(false);
  });
});
