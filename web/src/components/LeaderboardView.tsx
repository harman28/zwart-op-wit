import type { Standing } from '../api/types.js';

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

export default function LeaderboardView({ standings }: { standings: Standing[] }) {
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
                <td className={s.rank === 1 ? 'rank-num rank-1' : 'rank-num'}>{s.rank}</td>
                <td className="player-name">
                  {s.name}
                  {s.membershipType === 'GUEST' && <span className="badge">Guest</span>}
                </td>
                <td className="num score-cell">{formatNumber(s.score)}</td>
                <td className="num value-cell">{s.value}</td>
                <td className="num value-cell">{s.played}</td>
                <td className="num value-cell">{s.wins}</td>
                <td className="num value-cell">{s.draws}</td>
                <td className="num value-cell">{s.losses}</td>
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
                <span className={s.rank === 1 ? 'rank-num rank-1' : 'rank-num'}>{s.rank}</span>
                <span className="player-name">{s.name}</span>
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
