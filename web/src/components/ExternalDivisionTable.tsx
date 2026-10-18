import type { DivisionTeamStanding, ExternalDivisionStandings } from '../api/types.js';
import { formatNumber } from '../lib/format.js';

function rankClass(rank: number): string {
  if (rank === 1) return 'rank-num rank-1';
  if (rank === 2) return 'rank-num rank-2';
  if (rank === 3) return 'rank-num rank-3';
  return 'rank-num';
}

/** Match points (MP) is this division's "Points" — board points (BP) is the
 * quieter companion number, same relationship Value has to Points on our own
 * leaderboard. Win/draw/loss and Played are derived server-side from the
 * division's own cross-table (see netstandDivisionScrape.ts) since netstand
 * doesn't publish them directly. */
export default function ExternalDivisionTable({ division }: { division: ExternalDivisionStandings }) {
  const isOurs = (t: DivisionTeamStanding) => t.name === division.ourTeamName;

  return (
    <>
      <div className="board-wrap">
        <table className="board">
          <thead>
            <tr>
              <th style={{ width: 26 }}>#</th>
              <th>Team</th>
              <th style={{ textAlign: 'right' }}>MP</th>
              <th style={{ textAlign: 'right' }}>BP</th>
              <th style={{ textAlign: 'right' }}>Played</th>
              <th style={{ textAlign: 'right' }}>Win</th>
              <th style={{ textAlign: 'right' }}>Draw</th>
              <th style={{ textAlign: 'right' }}>Loss</th>
            </tr>
          </thead>
          <tbody>
            {division.teams.map((t) => (
              <tr key={t.teamUrl || t.name} style={isOurs(t) ? { outline: '1px solid var(--accent)', outlineOffset: -1 } : undefined}>
                <td className={rankClass(t.rank)}>{t.rank}</td>
                <td className="player-name">{t.name}</td>
                <td className="num score-cell">{formatNumber(t.matchPoints)}</td>
                <td className="num value-cell">{formatNumber(t.boardPoints)}</td>
                <td className="num value-cell">{t.played}</td>
                <td className="num value-cell win-count">{t.wins}</td>
                <td className="num value-cell draw-count">{t.draws}</td>
                <td className="num value-cell loss-count">{t.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="lb-cards">
        {division.teams.map((t) => (
          <div className="lb-card" key={t.teamUrl || t.name} style={isOurs(t) ? { outline: '1px solid var(--accent)' } : undefined}>
            <div className="lb-card-top">
              <div className="lb-card-left">
                <span className={rankClass(t.rank)}>{t.rank}</span>
                {/* .player-name truncates with an ellipsis by default — sized
                    for short player first names. Team names ("De Volewijckers
                    2", and our own "Zwart op Wit 1/2") routinely run longer,
                    so this lets them wrap onto a second line instead of
                    cutting off — including our own team's name, which would
                    otherwise be the one thing on this page most likely to get
                    clipped. */}
                <span className="player-name" style={{ whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>
                  {t.name}
                </span>
              </div>
              <span className="lb-card-record">
                <span className="rec-w">{t.wins}W</span>
                <span className="rec-sep">/</span>
                <span className="rec-d">{t.draws}D</span>
                <span className="rec-sep">/</span>
                <span className="rec-l">{t.losses}L</span>
              </span>
              <div className="lb-card-right">
                <span className="lb-points">{formatNumber(t.matchPoints)}</span>
                <span className="lb-card-value">({formatNumber(t.boardPoints)})</span>
              </div>
            </div>
            <div className="lb-card-stats">
              <span>Played {t.played}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
