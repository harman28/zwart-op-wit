import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDivisionStandingsHtml } from '../netstandDivisionScrape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');

const DIVISION_82_URL = 'https://sga.netstand.nl/divisions/view/82';
const DIVISION_83_URL = 'https://sga.netstand.nl/divisions/view/83';

describe('parseDivisionStandingsHtml (real "2e Klasse B" division page — includes Zwart op Wit 1)', () => {
  const standings = parseDivisionStandingsHtml(fixture('division-82.html'), DIVISION_82_URL);

  it('reads the division name from the page title', () => {
    expect(standings.divisionName).toBe('2e Klasse B');
  });

  it('lists all 8 teams in rank order, exactly as the page itself ranks them', () => {
    expect(standings.teams.map((t) => t.name)).toEqual([
      'Oosten-Toren 2',
      'VAS 4',
      'De Raadsheer 2',
      'De Volewijckers 2',
      'Zwart op Wit 1',
      'De Wachter 1',
      'Almere 2',
      'Chaturanga 2',
    ]);
  });

  it('derives win/draw/loss for Zwart op Wit 1 by comparing its score against the mirrored opponent cell', () => {
    // ZOW1 scored 3½ of 8 against De Volewijckers 2, who scored 4½ — a loss,
    // matching the match points (0) already shown for it on the page.
    const zow1 = standings.teams.find((t) => t.name === 'Zwart op Wit 1')!;
    expect(zow1).toMatchObject({
      rank: 5,
      teamUrl: 'https://sga.netstand.nl/teams/view/752',
      matchPoints: 0,
      boardPoints: 3.5,
      played: 1,
      wins: 0,
      draws: 0,
      losses: 1,
    });
  });

  it('derives a win the same way for the table leader', () => {
    // Oosten-Toren 2 scored 5 of 8 against Chaturanga 2's 3.
    const leader = standings.teams[0]!;
    expect(leader).toMatchObject({
      name: 'Oosten-Toren 2',
      matchPoints: 2,
      boardPoints: 5,
      played: 1,
      wins: 1,
      draws: 0,
      losses: 0,
    });
  });
});

describe('parseDivisionStandingsHtml (real "3e Klasse A" division page — includes Zwart op Wit 2)', () => {
  const standings = parseDivisionStandingsHtml(fixture('division-83.html'), DIVISION_83_URL);

  it('reads the division name from the page title', () => {
    expect(standings.divisionName).toBe('3e Klasse A');
  });

  it('lists all 7 teams in rank order', () => {
    expect(standings.teams.map((t) => t.name)).toEqual([
      'Laurierboom-Gambiet 2',
      'Pegasus Amstelveen 2',
      'Zwart op Wit 2',
      'VAS 7',
      'De Raadsheer 3',
      'Amsterdam West 8',
      'Caissa 5',
    ]);
  });

  it('derives a draw when both sides scored the same (not just win/loss)', () => {
    // ZOW2 and VAS 7 both scored 4 of 8 against each other.
    const zow2 = standings.teams.find((t) => t.name === 'Zwart op Wit 2')!;
    expect(zow2).toMatchObject({
      rank: 3,
      teamUrl: 'https://sga.netstand.nl/teams/view/761',
      matchPoints: 1,
      boardPoints: 4,
      played: 1,
      wins: 0,
      draws: 1,
      losses: 0,
    });
  });

  it('handles a team with no matches played yet (bottom of a 7-team division, odd one out in round 1)', () => {
    const caissa = standings.teams.find((t) => t.name === 'Caissa 5')!;
    expect(caissa).toMatchObject({
      matchPoints: 0,
      boardPoints: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    });
  });
});
