import type { Standing } from '../api/types.js';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function rankClass(rank: number): string {
  if (rank === 1) return 'rank-num rank-1';
  if (rank === 2) return 'rank-num rank-2';
  if (rank === 3) return 'rank-num rank-3';
  return 'rank-num';
}

export default function LeaderboardView({
  standings,
  onSelectPlayer,
}: {
  standings: Standing[];
  /** Omit to fall back to plain (non-clickable) names. */
  onSelectPlayer?: (playerId: number) => void;
}) {
  return (
    <>
      <div className="board-wrap">
        <table className="board">
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Points</th>
              <th style={{ textAlign: 'right' }}>Value</th>
              <th style={{ textAlign: 'right' }}>Played</th>
              <th style={{ textAlign: 'right' }}>Win</th>
              <th style={{ textAlign: 'right' }}>Draw</th>
              <th style={{ textAlign: 'right' }}>Loss</th>
              <th style={{ textAlign: 'right' }}>Win%</th>
              <th style={{ textAlign: 'right' }}>Color</th>
              <th style={{ textAlign: 'right' }}>Odd</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.playerId}>
                <td className={rankClass(s.rank)}>{s.rank}</td>
                <td className="player-name">
                  {onSelectPlayer ? (
                    <button className="editable-name" onClick={() => onSelectPlayer(s.playerId)}>
                      {s.name}
                    </button>
                  ) : (
                    s.name
                  )}
                  {s.membershipType === 'GUEST' && <span className="badge">Guest</span>}
                </td>
                <td className="num score-cell">{formatNumber(s.score)}</td>
                <td className="num value-cell">{s.value}</td>
                <td className="num value-cell">{s.played}</td>
                <td className="num value-cell win-count">{s.wins}</td>
                <td className="num value-cell draw-count">{s.draws}</td>
                <td className="num value-cell loss-count">{s.losses}</td>
                <td className="num value-cell">{formatNumber(s.winPercent)}</td>
                <td className="num value-cell">{s.colorNumber}</td>
                <td className="num value-cell">{s.pairingByeUsed ? 1 : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lb-cards">
        {standings.map((s) => (
          <div className="lb-card" key={s.playerId}>
            <div className="lb-card-top">
              <div className="lb-card-left">
                <span className={rankClass(s.rank)}>{s.rank}</span>
                <span className="player-name">
                  {onSelectPlayer ? (
                    <button className="editable-name" onClick={() => onSelectPlayer(s.playerId)}>
                      {s.name}
                    </button>
                  ) : (
                    s.name
                  )}
                </span>
              </div>
              <span className="lb-card-record">
                <span className="rec-w">{s.wins}W</span>
                <span className="rec-sep">/</span>
                <span className="rec-d">{s.draws}D</span>
                <span className="rec-sep">/</span>
                <span className="rec-l">{s.losses}L</span>
              </span>
              <span className="lb-points">{formatNumber(s.score)}</span>
            </div>
            <div className="lb-card-stats">
              Value {s.value} · Played {s.played} · {formatNumber(s.winPercent)}% · Color {s.colorNumber} · Odd{' '}
              {s.pairingByeUsed ? 1 : 0}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
