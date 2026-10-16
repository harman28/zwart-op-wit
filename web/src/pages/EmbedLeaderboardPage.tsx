import { useEffect, useState } from 'react';
import * as seasonsApi from '../api/seasons.js';
import type { Leaderboard } from '../api/types.js';
import CustomSelect from '../components/CustomSelect.js';
import LeaderboardView from '../components/LeaderboardView.js';
import PlayerHistoryModal from '../components/PlayerHistoryModal.js';
import { useLatestSeason } from '../hooks/useSeason.js';
import { errorMessage } from '../lib/format.js';

const CURRENT = 'current';

/**
 * A bare leaderboard, meant to be iframed into the club's own site (e.g.
 * zwartopwit.org) — no masthead, no nav tabs, no admin affordances, just the
 * standings. Deliberately ignores admin login state entirely (not just
 * hiding admin buttons): an embed showing "Log out" / "+ New Round" because
 * whoever copied the iframe URL happened to be logged in elsewhere is
 * exactly the bug this page exists to avoid. App.tsx skips <NavBar/> for
 * every /embed/* route.
 */
export default function EmbedLeaderboardPage() {
  const { season, loading: seasonLoading } = useLatestSeason();
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [asOfRound, setAsOfRound] = useState<string>(CURRENT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

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

  useEffect(() => {
    setAsOfRound(CURRENT);
    setSearch('');
  }, [season?.id]);

  if (seasonLoading || (loading && !leaderboard)) {
    return (
      <div className="app embed-app">
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }
  if (!season) {
    return (
      <div className="app embed-app">
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

  const query = search.trim().toLowerCase();
  const visibleStandings = query ? (leaderboard?.standings ?? []).filter((s) => s.name.toLowerCase().includes(query)) : leaderboard?.standings;

  return (
    <div className="app embed-app">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          className="leaderboard-search"
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search players"
          style={{ flex: '1 1 200px', margin: 0 }}
        />
        {roundOptions.length > 1 && (
          <CustomSelect value={asOfRound} options={roundOptions} onChange={setAsOfRound} triggerClassName="roster-select" />
        )}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {leaderboard &&
        (visibleStandings && visibleStandings.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No players match "{search.trim()}".</p>
        ) : (
          <LeaderboardView standings={visibleStandings ?? []} onSelectPlayer={setSelectedPlayerId} />
        ))}
      {selectedPlayerId != null && (
        <PlayerHistoryModal
          seasonId={season.id}
          playerId={selectedPlayerId}
          afterRound={asOfRound === CURRENT ? undefined : Number(asOfRound)}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </div>
  );
}
