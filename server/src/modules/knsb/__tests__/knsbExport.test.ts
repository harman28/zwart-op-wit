import { describe, expect, it } from 'vitest';
import { generateKnsbExport } from '../knsbExport.js';

// Real lines from a Jim-submitted export (S7.1.txt, Season 7, rounds 1-4).
// Used two ways below: (1) a single-player golden-master case asserting the
// exact byte layout, and (2) a full round-trip across all 29 real players —
// parse every real line back into structured input, regenerate, and assert
// the output is byte-for-byte identical to the original file.
const REAL_HEADER_LINES = [
  "012 Zwart op Wit interne competitie S7",
  "022 Amsterdam",
  "032 NED",
  "042 01/09/2025",
  "052 31/12/2025",
  "062 40",
  "072 ",
  "082 0",
  "092 Individual: Keizer system",
  "102 Jim van der Valk Bouman jgrvandervalkbouman@gmail.com",
  "112 ",
  "122 25+10",
  "132                                                                                        25.09.01  25.09.08  25.09.15  25.09.22  ",
];
const REAL_PLAYER_LINES = [
  "001    1 M    Joppe                                0 NED 8938402     1900.01.01  1.0    1    11 b 0  0000 -    0000 -      21 b 1",
  "001    2 M    Pau                                  0 ESP 9035136     1900.01.01  1.0    2     4 b 0  0000 -      26 w 0    24 w 1",
  "001    3 M    Jim                                  0 NED 8939370     1900.01.01  2.5    3    12 w 0    17 b 1    14 w =     7 w 1",
  "001    4 M    Sam                                  0 NED 8972766     1900.01.01  2.5    4     2 w 1     6 b 1  0000 -      23 w =",
  "001    5 M    Maurice                              0 NED 8288181     1900.01.01  0.5    5    13 b =  0000 -      29 w 0    10 w 0",
  "001    6 M    Ahmed W.                             0 NED 9063483     1900.01.01  2.0    6    21 b 1     4 w 0    11 b 0    15 w 1",
  "001    7 M    Harman                               0 NED 9029889     1900.01.01  1.5    7    10 w =    13 b 1  0000 -       3 b 0",
  "001    8 M    Kamil                                0 NED 9059490     1900.01.01  0.0    8    14 b 0  0000 -    0000 -    0000 -  ",
  "001    9 M    Gal                                  0 NED 8977452     1900.01.01  0.0    9    16 b 0    20 w 0  0000 -    0000 -  ",
  "001   10 M    Lennart                              0 NED 8938523     1900.01.01  1.5   10     7 b =    19 w 0  0000 -       5 b 1",
  "001   11 M    Charles                              0 NED 9086363     1900.01.01  2.0   11     1 w 1  0000 -       6 w 1    18 b 0",
  "001   12 M    Freddy                               0 NED 8141144     1900.01.01  1.0   12     3 b 1  0000 -    0000 -    0000 -  ",
  "001   13 M    Robbert                              0 NED 8935036     1900.01.01  0.5   13     5 w =     7 w 0  0000 -    0000 -  ",
  "001   14 M    Marjolein                            0 NED 8538442     1900.01.01  1.5   14     8 w 1    26 b 0     3 b =    22 w 0",
  "001   15 M    Bodhi                                0 NED 9004908     1900.01.01  1.0   15  0000 -      22 w 0    25 b 1     6 b 0",
  "001   16 M    Mario                                0 NED 9042242     1900.01.01  1.0   16     9 w 1  0000 -    0000 -    0000 -  ",
  "001   17 M    Jan T.                               0 NED 8436835     1900.01.01  0.0   17  0000 -       3 w 0  0000 -    0000 -  ",
  "001   18 M    Dwight                               0 NED 9078586     1900.01.01  2.0   18    20 w 1  0000 -    0000 -      11 w 1",
  "001   19 M    Casper                               0 NED 8756704     1900.01.01  2.0   19  0000 -      10 b 1    22 b 1  0000 -  ",
  "001   20 M    Abel                                 0 NED 9093260     1900.01.01  1.0   20    18 b 0     9 b 1    21 w 0  0000 -  ",
  "001   21 M    Sebastiaan G.                        0 NED 9078597     1900.01.01  1.0   21     6 w 0  0000 -      20 b 1     1 w 0",
  "001   22 M    Akos                                 0 HUN 9069511     1900.01.01  2.0   22  0000 -      15 b 1    19 w 0    14 b 1",
  "001   23 V    Maaike                               0 NED 0           1900.01.01  1.5   23  0000 -      24 b 1  0000 -       4 b =",
  "001   24 V    Sofia                                0 NED 0           1900.01.01  0.0   24  0000 -      23 w 0  0000 -       2 b 0",
  "001   25 M    Tomas                                0 NED 0           1900.01.01  0.0   25  0000 -    0000 -      15 w 0  0000 -  ",
  "001   26 M    Egecan                               0 NED 8960017     1900.01.01  2.0   26  0000 -      14 w 1     2 b 1  0000 -  ",
  "001   27 M    Paul W.                              0 NED 8979718     1900.01.01  1.0   27  0000 -    0000 -      28 w 1  0000 -  ",
  "001   28 M    Willy                                0 NED 8777241     1900.01.01  0.0   28  0000 -    0000 -      27 b 0  0000 -  ",
  "001   29 M    Robert H.                            0 NED 0           1900.01.01  1.0   29  0000 -    0000 -       5 b 1  0000 -  ",
];

/** Inverse of the real fixed-width format — parses a real line back into
 * plain fields, purely to drive the round-trip test below. Not production code. */
function parsePlayerLine(line: string, roundCount: number) {
  const rounds = [];
  for (let i = 0; i < roundCount; i++) {
    const blockStart = 91 + i * 10; // 0-indexed
    const chunk = line.slice(blockStart, blockStart + 10);
    const opp = chunk.slice(0, 4).trim();
    const color = chunk[5];
    const result = chunk[7];
    if (opp === '0000' && color === '-') {
      rounds.push({ opponentLotingsnummer: null, color: null, result: null });
    } else {
      rounds.push({
        opponentLotingsnummer: Number(opp),
        color: color as 'w' | 'b',
        result: result as '1' | '=' | '0',
      });
    }
  }
  return {
    lotingsnummer: Number(line.slice(4, 8).trim()),
    gender: (line[9]?.trim() || null) as 'M' | 'V' | 'X' | null,
    name: line.slice(14, 47).trim(),
    knsbRating: Number(line.slice(48, 52).trim()),
    federation: line.slice(53, 56).trim(),
    knsbId: line.slice(57, 68).trim(),
    totalScore: Number(line.slice(80, 84).trim()),
    finalRanking: Number(line.slice(85, 89).trim()),
    rounds,
  };
}

describe('generateKnsbExport', () => {
  it('reproduces a real single player line exactly (golden master: Joppe, S7.1.txt)', () => {
    const line = generateKnsbExport({
      tournamentName: 'x',
      place: 'x',
      country: 'x',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2025-12-31'),
      arbiterName: 'x',
      arbiterEmail: 'x',
      timeControl: 'x',
      pairingMethod: 'x',
      roundDates: [new Date('2025-09-01'), new Date('2025-09-08'), new Date('2025-09-15'), new Date('2025-09-22')],
      players: [
        {
          lotingsnummer: 1,
          gender: 'M',
          name: 'Joppe',
          knsbRating: 0,
          federation: 'NED',
          knsbId: '8938402',
          totalScore: 1.0,
          finalRanking: 1,
          rounds: [
            { opponentLotingsnummer: 11, color: 'b', result: '0' },
            { opponentLotingsnummer: null, color: null, result: null },
            { opponentLotingsnummer: null, color: null, result: null },
            { opponentLotingsnummer: 21, color: 'b', result: '1' },
          ],
        },
      ],
    }).split('\n');
    // Player line is the 14th line (13 header lines before it).
    expect(line[13]).toBe(
      '001    1 M    Joppe                                0 NED 8938402     1900.01.01  1.0    1    11 b 0  0000 -    0000 -      21 b 1',
    );
  });

  it('round-trips the full real S7.1.txt file (all 29 players) byte-for-byte', () => {
    const roundDates = [new Date('2025-09-01'), new Date('2025-09-08'), new Date('2025-09-15'), new Date('2025-09-22')];
    const players = REAL_PLAYER_LINES.map((line) => parsePlayerLine(line, roundDates.length));

    const output = generateKnsbExport({
      tournamentName: 'Zwart op Wit interne competitie S7',
      place: 'Amsterdam',
      country: 'NED',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2025-12-31'),
      arbiterName: 'Jim van der Valk Bouman',
      arbiterEmail: 'jgrvandervalkbouman@gmail.com',
      timeControl: '25+10',
      pairingMethod: 'Individual: Keizer system',
      roundDates,
      players,
    });
    const outputLines = output.split('\n');

    // Every header line matches exactly except "062" (participant count) —
    // the real file says 40 (the season's eventual full roster), but this
    // batch only lists the 29 players who'd played by round 4. That's Jim's
    // own data being stale/inconsistent, not something to reproduce; we
    // assert our line reflects the actual input instead.
    for (let i = 0; i < REAL_HEADER_LINES.length; i++) {
      if (i === 5) {
        expect(outputLines[i]).toBe('062 29');
        continue;
      }
      expect(outputLines[i]).toBe(REAL_HEADER_LINES[i]);
    }

    for (let i = 0; i < REAL_PLAYER_LINES.length; i++) {
      expect(outputLines[13 + i]).toBe(REAL_PLAYER_LINES[i]);
    }
  });
});
