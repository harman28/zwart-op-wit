import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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
      <div className="site-nav">
        <div className="links">
          <Link to="/" className="link">
            Rounds
          </Link>
          <Link to="/leaderboard" className="link current">
            Leaderboard
          </Link>
        </div>
      </div>
      <h1 className="page-title">Standings — {season.name}</h1>
      {error && <div className="error-banner">{error}</div>}
      {leaderboard && <LeaderboardView standings={leaderboard.standings} />}
    </div>
  );
}
