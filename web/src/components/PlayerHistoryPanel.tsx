import type { PlayerHistory } from '../api/types.js';
import { formatNumber } from '../lib/format.js';
import { describeEntry, OUTCOME_CLASS, outcomeFor, valueSeries } from '../lib/playerHistory.js';
import { RecordLine, SecondaryStatsLine } from './StandingStats.js';

/**
 * One player's round-by-round results for a season, plus the same
 * record/Played/Win/Color/Odd summary the Leaderboard shows — the "Results"
 * view of the shared "click a name" experience (Leaderboard, Rounds, Players
 * admin). Takes the already-fetched history rather than fetching its own, so
 * a caller with a Results/Graph tab pair can switch between them with no
 * extra network round-trip.
 */
export default function PlayerHistoryPanel({ history }: { history: PlayerHistory }) {
  const series = valueSeries(history);
  return (
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
                  <span className="modal-starting-value-label">Starting value</span> {formatNumber(history.startingValue)}
                </td>
              </tr>
              {history.entries.map((entry, idx) => {
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
                    <td className="num score-cell">{formatNumber(series[idx + 1]!.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
