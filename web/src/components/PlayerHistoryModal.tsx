import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';
import type { GameResult, PlayerHistory, PlayerHistoryEntry } from '../api/types.js';
import { errorMessage } from '../lib/format.js';
import Modal from './Modal.js';

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

export default function PlayerHistoryModal({
  seasonId,
  playerId,
  onClose,
}: {
  seasonId: number;
  playerId: number;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seasonsApi
      .getPlayerHistory(seasonId, playerId)
      .then(setHistory)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [seasonId, playerId]);

  const title = history ? history.name : 'Player history';

  return (
    <Modal title={title} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      {!history && !error && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {history && (
        <>
          {history.entries.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>No published rounds played yet this season.</p>
          ) : (
            <div className="board-wrap">
              <table className="board">
                <thead>
                  <tr>
                    <th style={{ width: 26 }}>Rnd</th>
                    <th>Opponent</th>
                    <th style={{ textAlign: 'center' }}>Result</th>
                    <th style={{ textAlign: 'right' }}>Points</th>
                    <th style={{ textAlign: 'right' }}>Running total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="rank-num" colSpan={2}>
                      Starting value
                    </td>
                    <td></td>
                    <td className="num value-cell"></td>
                    <td className="num score-cell">{formatNumber(history.startingValue)}</td>
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
    </Modal>
  );
}
