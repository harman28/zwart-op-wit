import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTeamPageHtml } from '../netstandTeamScrape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');

const TEAM_752_URL = 'https://sga.netstand.nl/teams/view/752';

describe('parseTeamPageHtml (real Zwart op Wit 1 team page)', () => {
  const details = parseTeamPageHtml(fixture('team-752.html'), TEAM_752_URL);

  it('reads the team name and its division standing', () => {
    expect(details.teamName).toBe('Zwart op Wit 1');
    expect(details.matchPoints).toBe(0);
    expect(details.boardPoints).toBe(3.5);
    expect(details.divisionName).toBe('2e Klasse B');
    expect(details.divisionUrl).toBe('https://sga.netstand.nl/divisions/view/82');
  });

  it('lists all 7 scheduled matches in round order', () => {
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

  it('lists all 8 roster players with rating/played/points', () => {
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
