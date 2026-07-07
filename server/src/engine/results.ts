import type { ExternalByeEntry, ExternalOutcome, GameEntry, GameOutcome, RoundEntryInput } from './types.js';

const VALID_GAME_OUTCOMES: GameOutcome[] = [
  'WHITE_WIN',
  'BLACK_WIN',
  'DRAW',
  'WHITE_WIN_FORFEIT',
  'BLACK_WIN_FORFEIT',
];
const VALID_EXTERNAL_OUTCOMES: ExternalOutcome[] = ['WIN', 'DRAW', 'LOSS'];

/**
 * All actual point-value math for a result — including forfeits — lives
 * centrally in standings.ts's contributionsFor(). This is just a kind-checked,
 * pure setter: exactly one place in the codebase knows how a result scores.
 */
export function applyGameResult(entry: RoundEntryInput, result: GameOutcome): GameEntry {
  if (entry.kind !== 'GAME') throw new Error('applyGameResult can only be called on a GAME entry');
  if (!VALID_GAME_OUTCOMES.includes(result)) throw new Error(`Invalid game result: ${String(result)}`);
  return { ...entry, result };
}

export function applyExternalOutcome(entry: RoundEntryInput, outcome: ExternalOutcome): ExternalByeEntry {
  if (entry.kind !== 'EXTERNAL_BYE') {
    throw new Error('applyExternalOutcome can only be called on an EXTERNAL_BYE entry');
  }
  if (!VALID_EXTERNAL_OUTCOMES.includes(outcome)) {
    throw new Error(`Invalid external outcome: ${String(outcome)}`);
  }
  return { ...entry, outcome };
}
