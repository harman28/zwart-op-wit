import { Link } from 'react-router';
import type { PlayerHistory } from '../api/types.js';
import { formatNumber } from '../lib/format.js';
import { snapshotStats } from '../lib/playerHistory.js';

function ColorPill({ color, winPercent, played }: { color: 'WHITE' | 'BLACK'; winPercent: number; played: number }) {
  return (
    <span className="profile-snapshot-color-item">
      <span className={`lb-color-swatch lb-color-swatch-${color === 'WHITE' ? 'white' : 'black'}`} />
      {played > 0 ? `${Math.round(winPercent)}%` : '—'}
    </span>
  );
}

/**
 * The "headline stats" panel at the top of a player's profile page, above
 * the full Results/Graph tabs — deliberately only stats that mean something
 * from a handful of games (best win, worst loss, peak rank, win rate by
 * color). No streaks or head-to-head records: this club doesn't have the
 * game volume for those to be meaningful rather than noise.
 */
export default function PlayerSnapshot({ history }: { history: PlayerHistory }) {
  const { bestWin, worstLoss, colorRecord } = snapshotStats(history);
  const { peakRank } = history;

  return (
    <div className="card profile-snapshot">
      <div className="profile-snapshot-grid">
        <div className="profile-snapshot-tile">
          <div className="profile-snapshot-label">Peak rank</div>
          {peakRank ? (
            <>
              <div className="profile-snapshot-value">
                #{peakRank.rank} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>of {peakRank.ofCount}</span>
              </div>
              <div className="profile-snapshot-detail">Round {peakRank.roundNumber}</div>
            </>
          ) : (
            <>
              <div className="profile-snapshot-value muted">—</div>
              <div className="profile-snapshot-detail">No published rounds yet</div>
            </>
          )}
        </div>

        <div className="profile-snapshot-tile">
          <div className="profile-snapshot-label">Best win</div>
          {bestWin ? (
            <>
              <div className="profile-snapshot-value win">
                {bestWin.opponentId ? <Link to={`/players/${bestWin.opponentId}`}>{bestWin.opponentName}</Link> : bestWin.opponentName}
              </div>
              <div className="profile-snapshot-detail">
                Round {bestWin.roundNumber} · +{formatNumber(bestWin.points)}
              </div>
            </>
          ) : (
            <>
              <div className="profile-snapshot-value muted">—</div>
              <div className="profile-snapshot-detail">No wins yet</div>
            </>
          )}
        </div>

        <div className="profile-snapshot-tile">
          <div className="profile-snapshot-label">Worst loss</div>
          {worstLoss ? (
            <>
              <div className="profile-snapshot-value loss">
                {worstLoss.opponentId ? (
                  <Link to={`/players/${worstLoss.opponentId}`}>{worstLoss.opponentName}</Link>
                ) : (
                  worstLoss.opponentName
                )}
              </div>
              <div className="profile-snapshot-detail">
                Round {worstLoss.roundNumber} · ranked #{worstLoss.opponentRank} of {worstLoss.opponentOfCount}
              </div>
            </>
          ) : (
            <>
              <div className="profile-snapshot-value muted">—</div>
              <div className="profile-snapshot-detail">No losses yet</div>
            </>
          )}
        </div>

        <div className="profile-snapshot-tile">
          <div className="profile-snapshot-label">Win rate by color</div>
          <div className="profile-snapshot-color-row">
            <ColorPill color="WHITE" winPercent={colorRecord.WHITE.winPercent} played={colorRecord.WHITE.played} />
            <ColorPill color="BLACK" winPercent={colorRecord.BLACK.winPercent} played={colorRecord.BLACK.played} />
          </div>
          <div className="profile-snapshot-detail">
            {colorRecord.WHITE.played} as White · {colorRecord.BLACK.played} as Black
          </div>
        </div>
      </div>
    </div>
  );
}
