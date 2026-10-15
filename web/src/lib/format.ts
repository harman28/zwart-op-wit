import type { GameResult } from '../api/types.js';

/** Drops a trailing .00/.50 → whole numbers print plain, halves/quarters (from
 * draws, byes, rebasing) keep exactly the precision they need and no more. */
export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

export function resultLabel(result: GameResult): string {
  switch (result) {
    case 'WHITE_WIN':
      return '1–0';
    case 'WHITE_WIN_FORFEIT':
      return '1–0R';
    case 'BLACK_WIN':
      return '0–1';
    case 'BLACK_WIN_FORFEIT':
      return '0–1R';
    case 'DRAW':
      return '½–½';
  }
}

// Named after which piece color won, never "win/loss" — black winning isn't a bad outcome.
export function resultClass(result: GameResult): 'white-win' | 'black-win' | 'draw' {
  switch (result) {
    case 'WHITE_WIN':
    case 'WHITE_WIN_FORFEIT':
      return 'white-win';
    case 'BLACK_WIN':
    case 'BLACK_WIN_FORFEIT':
      return 'black-win';
    case 'DRAW':
      return 'draw';
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}
