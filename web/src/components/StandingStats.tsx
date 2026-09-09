import type { Standing } from '../api/types.js';

/** Color is a status (which piece color you've played more of), not a
 * performance judgment — represented with the actual white/black piece
 * colors already used for game results, not win/loss green/red.
 * colorNumber > 0 means more games as White, < 0 means more as Black (see
 * server/src/engine/standings.ts). Balanced (0) gets no swatch. */
export function ColorSwatch({ n }: { n: number }) {
  if (n === 0) return null;
  return <span className={`lb-color-swatch ${n > 0 ? 'lb-color-swatch-white' : 'lb-color-swatch-black'}`} />;
}

/** The W/D/L record — shared by the leaderboard's mobile card and the
 * player-history modal's summary, so both read the same at a glance. */
export function RecordLine({ standing }: { standing: Standing }) {
  return (
    <span className="lb-card-record">
      <span className="rec-w">{standing.wins}W</span>
      <span className="rec-sep">/</span>
      <span className="rec-d">{standing.draws}D</span>
      <span className="rec-sep">/</span>
      <span className="rec-l">{standing.losses}L</span>
    </span>
  );
}

/** Played / Win% (as a tiny bar) / Color (as a swatch) / Odd — the
 * secondary attributes, shared by the leaderboard's mobile card and the
 * player-history modal's summary. */
export function SecondaryStatsLine({ standing }: { standing: Standing }) {
  return (
    <div className="lb-card-stats">
      <span>Played {standing.played}</span>
      <span className="lb-card-stats-sep">·</span>
      <span className="lb-card-winbar">
        Win
        <span className="lb-card-tiny-bar">
          <span className="lb-card-tiny-bar-fill" style={{ width: `${standing.winPercent}%` }} />
        </span>
      </span>
      <span className="lb-card-stats-sep">·</span>
      <span>
        <ColorSwatch n={standing.colorNumber} /> Color {standing.colorNumber}
      </span>
      <span className="lb-card-stats-sep">·</span>
      <span>Odd {standing.pairingByeUsed ? 1 : 0}</span>
    </div>
  );
}
