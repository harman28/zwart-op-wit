import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';
import type { Leaderboard } from '../api/types.js';
import LeaderboardView from '../components/LeaderboardView.js';
import { useLatestSeason } from '../hooks/useSeason.js';
import { errorMessage } from '../lib/format.js';

export default function LeaderboardPage() {
  const { season, loading: seasonLoading } = useLatestSeason();
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!season) {
      setLoading(false);
      return;
    }
    seasonsApi
      .getLeaderboard(season.id)
      .then(setLeaderboard)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [season]);

  if (seasonLoading || loading) {
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

  return (
    <div className="app">
      <h1 className="page-title">Standings — {season.name}</h1>
      {error && <div className="error-banner">{error}</div>}
      {leaderboard && <LeaderboardView standings={leaderboard.standings} />}
    </div>
  );
}
