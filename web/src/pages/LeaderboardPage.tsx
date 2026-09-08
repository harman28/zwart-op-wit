import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';
import type { Leaderboard } from '../api/types.js';
import CustomSelect from '../components/CustomSelect.js';
import LeaderboardView from '../components/LeaderboardView.js';
import PlayerHistoryModal from '../components/PlayerHistoryModal.js';
import { useLatestSeason } from '../hooks/useSeason.js';
import { errorMessage } from '../lib/format.js';

const CURRENT = 'current';

export default function LeaderboardPage() {
  const { season, loading: seasonLoading } = useLatestSeason();
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [asOfRound, setAsOfRound] = useState<string>(CURRENT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  useEffect(() => {
    if (!season) {
      setLoading(false);
      return;
    }
    setLoading(true);
    seasonsApi
      .getLeaderboard(season.id, asOfRound === CURRENT ? undefined : Number(asOfRound))
      .then(setLeaderboard)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [season, asOfRound]);

  // A newly-published round can make the previously-selected "current" state
  // stale-looking if left pinned to an old round number — reset to the live
  // view whenever the season itself changes (not on every leaderboard refetch).
  useEffect(() => {
    setAsOfRound(CURRENT);
  }, [season?.id]);

  if (seasonLoading || (loading && !leaderboard)) {
    return (
      <div className="app">
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }
  if (!season) {
    return (
      <div className="app">
        <p style={{ color: 'var(--muted)' }}>No season yet.</p>
      </div>
    );
  }

  const roundOptions = [
    { value: CURRENT, label: 'Current standings' },
    ...(leaderboard?.availableRounds ?? [])
      .slice()
      .reverse()
      .map((n) => ({ value: String(n), label: `After round ${n}` })),
  ];

  return (
    <div className="app">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <h1 className="page-title" style={{ margin: 0 }}>
          Standings — {season.name}
        </h1>
        {roundOptions.length > 1 && (
          <CustomSelect value={asOfRound} options={roundOptions} onChange={setAsOfRound} triggerClassName="roster-select" />
        )}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {leaderboard && <LeaderboardView standings={leaderboard.standings} onSelectPlayer={setSelectedPlayerId} />}
      {selectedPlayerId != null && (
        <PlayerHistoryModal seasonId={season.id} playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
      )}
    </div>
  );
}
