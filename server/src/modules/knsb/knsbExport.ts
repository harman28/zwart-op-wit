/**
 * Fixed-width KNSB rating-list submission format ("Bijlage inzenden
 * resultaten voor de KNSB ratinglijst"). Every column position below was
 * verified character-by-character against a real Jim-submitted export
 * (S7.1.txt), not just the spec PDF — see knsbExport.test.ts's golden-master
 * case, which asserts the exact real line byte-for-byte.
 *
 * Not cumulative: each submission covers one reporting batch (Jim submits
 * monthly, ~4 rounds at a time), not the whole season to date.
 */

export interface KnsbRoundResult {
  /** This player's opponent's lotingsnummer for this round, or null if
   * unpaired (bye, forfeit, external, or not yet enrolled) — forfeits are
   * deliberately excluded per the spec's "forfeit results ... don't count". */
  opponentLotingsnummer: number | null;
  color: 'w' | 'b' | null;
  result: '1' | '=' | '0' | null;
}

export interface KnsbPlayerRow {
  lotingsnummer: number;
  gender: 'M' | 'V' | 'X' | null;
  name: string;
  knsbRating: number;
  federation: string;
  /** null renders as "0", matching real practice for an unknown ID. */
  knsbId: string | null;
  /** Sum of this batch's own results only (1/0.5/0 per game) — not the Keizer value. */
  totalScore: number;
  /** Real practice just mirrors lotingsnummer; KNSB marks this field optional. */
  finalRanking: number;
  rounds: KnsbRoundResult[];
}

export interface KnsbExportInput {
  tournamentName: string;
  place: string;
  country: string;
  startDate: Date;
  endDate: Date;
  arbiterName: string;
  arbiterEmail: string;
  timeControl: string;
  pairingMethod: string;
  /** One per round included in this batch, same length/order as each player's `rounds`. */
  roundDates: Date[];
  players: KnsbPlayerRow[];
}

const ROUND_BLOCK_WIDTH = 10;
const FIRST_ROUND_START = 92; // 1-indexed spec position

function padRight(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : ' '.repeat(width - value.length) + value;
}

function formatDateSlashes(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** e.g. 2025-09-01 -> "25.09.01", matching the round-date header line's format. */
function formatDateDots(d: Date): string {
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
}

function headerLine(code: string, value: string): string {
  return `${code} ${value}`;
}

function formatScore(score: number): string {
  // Real values are always X.X or X.0 (halves only) — one decimal place, right-aligned to 4.
  return padLeft(score.toFixed(1), 4);
}

function formatRoundDatesLine(roundDates: Date[]): string {
  // Position 1: the "132" line has no leading code+space like the others —
  // it's blank-padded from column 1 all the way to each round's own column.
  let line = '132';
  for (let i = 0; i < roundDates.length; i++) {
    const colStart = FIRST_ROUND_START + i * ROUND_BLOCK_WIDTH; // 1-indexed
    const target = colStart - 1; // 0-indexed
    while (line.length < target) line += ' ';
    line += formatDateDots(roundDates[i]!);
  }
  return line + '  ';
}

function formatPlayerLine(player: KnsbPlayerRow): string {
  let line = '001';
  line += ' '.repeat(1); // col 4
  line += padLeft(String(player.lotingsnummer), 4); // 5-8
  line += ' '; // 9
  line += player.gender ?? ' '; // 10
  line += '   '; // 11-13 title, always blank
  line += ' '; // 14
  line += padRight(player.name, 33); // 15-47
  line += ' '; // 48
  line += padLeft(String(player.knsbRating), 4); // 49-52
  line += ' '; // 53
  line += padRight(player.federation, 3); // 54-56
  line += ' '; // 57
  line += padRight(player.knsbId ?? '0', 11); // 58-68
  line += ' '; // 69
  line += '1900.01.01'; // 70-79, dummy DOB — real practice, nobody enters a real one
  line += ' '; // 80
  line += formatScore(player.totalScore); // 81-84
  line += ' '; // 85
  line += padLeft(String(player.finalRanking), 4); // 86-89

  for (const round of player.rounds) {
    line += '  '; // 2-char gap before this round's block
    if (round.opponentLotingsnummer != null && round.color != null && round.result != null) {
      line += padLeft(String(round.opponentLotingsnummer), 4);
      line += ' ';
      line += round.color;
      line += ' ';
      line += round.result;
    } else {
      line += '0000';
      line += ' ';
      line += '-';
      line += ' ';
      line += ' ';
    }
  }
  return line;
}

export function generateKnsbExport(input: KnsbExportInput): string {
  const lines = [
    headerLine('012', input.tournamentName),
    headerLine('022', input.place),
    headerLine('032', input.country),
    headerLine('042', formatDateSlashes(input.startDate)),
    headerLine('052', formatDateSlashes(input.endDate)),
    headerLine('062', String(input.players.length)),
    headerLine('072', ''),
    headerLine('082', '0'),
    headerLine('092', input.pairingMethod),
    headerLine('102', `${input.arbiterName} ${input.arbiterEmail}`),
    headerLine('112', ''),
    headerLine('122', input.timeControl),
    formatRoundDatesLine(input.roundDates),
    ...input.players.map(formatPlayerLine),
  ];
  return lines.join('\n') + '\n';
}
