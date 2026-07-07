import type { GameResult } from '../api/types.js';

export function resultLabel(result: GameResult): string {
  switch (result) {
    case 'WHITE_WIN':
    case 'WHITE_WIN_FORFEIT':
      return '1–0';
    case 'BLACK_WIN':
    case 'BLACK_WIN_FORFEIT':
      return '0–1';
    case 'DRAW':
      return '½–½';
  }
}

export function resultClass(result: GameResult): 'win' | 'loss' | 'draw' {
  switch (result) {
    case 'WHITE_WIN':
    case 'WHITE_WIN_FORFEIT':
      return 'win';
    case 'BLACK_WIN':
    case 'BLACK_WIN_FORFEIT':
      return 'loss';
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
