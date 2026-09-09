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

/** Color is a status (which piece color you've played more of), not a
 * performance judgment — so it's represented with the actual white/black
 * piece colors already used for game results, not win/loss green/red.
 * colorNumber > 0 means more games as White, < 0 means more as Black (see
 * engine/standings.ts). Balanced (0) gets no swatch — there's no color to
 * show. */
function ColorSwatch({ n }: { n: number }) {
  if (n === 0) return null;
  return <span className={`lb-color-swatch ${n > 0 ? 'lb-color-swatch-white' : 'lb-color-swatch-black'}`} />;
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
                <td className="num value-cell">
                  <ColorSwatch n={s.colorNumber} /> {s.colorNumber}
                </td>
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
              <div className="lb-card-right">
                <span className="lb-points">{formatNumber(s.score)}</span>
                <span className="lb-card-value">({s.value})</span>
              </div>
            </div>
            <div className="lb-card-stats">
              <span>Played {s.played}</span>
              <span className="lb-card-stats-sep">·</span>
              <span className="lb-card-winbar">
                Win
                <span className="lb-card-tiny-bar">
                  <span className="lb-card-tiny-bar-fill" style={{ width: `${s.winPercent}%` }} />
                </span>
              </span>
              <span className="lb-card-stats-sep">·</span>
              <span>
                <ColorSwatch n={s.colorNumber} /> Color {s.colorNumber}
              </span>
              <span className="lb-card-stats-sep">·</span>
              <span>Odd {s.pairingByeUsed ? 1 : 0}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
