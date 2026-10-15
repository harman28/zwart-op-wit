import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';
import type { GameResult, PlayerHistory, PlayerHistoryEntry } from '../api/types.js';
import { errorMessage } from '../lib/format.js';
import { RecordLine, SecondaryStatsLine } from './StandingStats.js';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/** Win/draw/loss from this player's own side of the board — the shared
 * white/black-perspective resultLabel in lib/format.ts isn't what you want
 * when you're looking at one player's personal history. */
function outcomeFor(entry: PlayerHistoryEntry): 'W' | 'D' | 'L' | null {
  if (entry.kind === 'GAME' && entry.result) {
    if (entry.result === 'DRAW') return 'D';
    const whiteWon: GameResult[] = ['WHITE_WIN', 'WHITE_WIN_FORFEIT'];
    const playerWon = whiteWon.includes(entry.result) === (entry.color === 'WHITE');
    return playerWon ? 'W' : 'L';
  }
  if (entry.kind === 'EXTERNAL_BYE' && entry.externalOutcome) {
    return entry.externalOutcome === 'WIN' ? 'W' : entry.externalOutcome === 'LOSS' ? 'L' : 'D';
  }
  return null;
}

function describeEntry(entry: PlayerHistoryEntry): string {
  switch (entry.kind) {
    case 'GAME':
      return entry.opponentName ? `vs ${entry.opponentName}` : 'vs —';
    case 'PAIRING_BYE':
      return 'Pairing bye';
    case 'REGULAR_BYE':
      return 'Regular bye (absent)';
    case 'EXTERNAL_BYE':
      return 'External result';
  }
}

const OUTCOME_CLASS: Record<'W' | 'D' | 'L', string> = { W: 'win', D: 'draw', L: 'loss' };

/**
 * One player's round-by-round results for a season, plus the same
 * record/Played/Win/Color/Odd summary the Leaderboard shows — the single
 * "click a name, see their results" view used everywhere a name is
 * clickable (Leaderboard, Rounds, Players admin), so it looks and behaves
 * identically no matter which page it was opened from. The summary always
 * comes from this same fetch (PlayerHistory.standing) rather than being
 * passed in by the caller, so there's no way for one caller to show it and
 * another to forget to.
 */
export default function PlayerHistoryPanel({
  seasonId,
  playerId,
  afterRound,
  onNameLoaded,
}: {
  seasonId: number;
  playerId: number;
  /** Rebase the history under standings as they stood right after this
   * published round, instead of the season's current state — matches
   * whatever round the leaderboard this panel was opened from is showing.
   * Omit (or leave undefined) to show the full season to date. */
  afterRound?: number;
  /** Fired once the player's name comes back from the history fetch — for a
   * caller (PlayerHistoryModal) that titles its own chrome from it instead
   * of already knowing the name. */
  onNameLoaded?: (name: string) => void;
}) {
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(null);
    setError(null);
    seasonsApi
      .getPlayerHistory(seasonId, playerId, afterRound)
      .then((h) => {
        setHistory(h);
        onNameLoaded?.(h.name);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
    // onNameLoaded intentionally excluded — callers pass a fresh setState
    // closure each render, which would otherwise re-fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId, playerId, afterRound]);

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {!history && !error && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {history && (
        <>
          <div className="modal-player-summary">
            <RecordLine standing={history.standing} />
            <SecondaryStatsLine standing={history.standing} />
          </div>
          {history.entries.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No published rounds played yet this season.</p>
          ) : (
            <div className="board-wrap">
              <table className="board">
                <thead>
                  <tr>
                    <th style={{ width: 22 }}>Rnd</th>
                    <th>Opponent</th>
                    <th style={{ textAlign: 'center' }}>Res</th>
                    <th style={{ textAlign: 'right' }}>Pts</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td colSpan={2} className="num score-cell" style={{ whiteSpace: 'nowrap' }}>
                      <span className="modal-starting-value-label">Starting value</span>{' '}
                      {formatNumber(history.startingValue)}
                    </td>
                  </tr>
                  {(() => {
                    let running = history.startingValue;
                    return history.entries.map((entry, idx) => {
                      running += entry.points;
                      const outcome = outcomeFor(entry);
                      return (
                        <tr key={idx}>
                          <td className="rank-num">{entry.roundNumber}</td>
                          <td className="player-name">{describeEntry(entry)}</td>
                          <td style={{ textAlign: 'center' }}>
                            {outcome ? (
                              <span className={`outcome-pill ${OUTCOME_CLASS[outcome]}`}>{outcome}</span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>–</span>
                            )}
                          </td>
                          <td className="num value-cell">
                            {entry.points > 0 ? '+' : ''}
                            {formatNumber(entry.points)}
                          </td>
                          <td className="num score-cell">{formatNumber(running)}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
