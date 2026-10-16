import { Fragment, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import PlayerHistoryPanel from '../components/PlayerHistoryPanel.js';
import PlayerSnapshot from '../components/PlayerSnapshot.js';
import PlayerValueChart from '../components/PlayerValueChart.js';
import { usePlayerHistory } from '../hooks/usePlayerHistory.js';
import { useLatestSeason } from '../hooks/useSeason.js';
import { errorMessage } from '../lib/format.js';

/** List 193 on ratingviewer.nl is the KNSB's own rating list — e.g.
 * https://ratingviewer.nl/lists/193/players/9029889/statistics. Confirmed
 * against a real club member's profile; not guessed. */
function knsbProfileUrl(knsbId: string): string {
  return `https://ratingviewer.nl/lists/193/players/${knsbId}/statistics`;
}

/**
 * The full dedicated page for one player — reached by clicking their name a
 * second time (once in the small modal, then the modal's own title links
 * here). Scoped to the latest season only, same as every other public view;
 * a career-wide page is a bigger lift the site doesn't do anywhere yet.
 */
export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const playerId = id ? Number(id) : null;
  const { season, loading: seasonLoading } = useLatestSeason();
  const { history, error } = usePlayerHistory(season?.id ?? null, playerId);
  const [tab, setTab] = useState<'results' | 'graph'>('results');

  if (seasonLoading || (!history && !error)) {
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
  if (error || !history) {
    return (
      <div className="app">
        <Link to="/leaderboard" className="link-add">
          ← Leaderboard
        </Link>
        <div className="error-banner" style={{ marginTop: 14 }}>
          {error ?? errorMessage(new Error('Player not found'))}
        </div>
      </div>
    );
  }

  const metaItems: ReactNode[] = [];
  if (history.federation || history.knsbId) {
    metaItems.push(
      <span key="knsb">
        KNSB {history.federation ?? '—'}{' '}
        {history.knsbId ? (
          <a href={knsbProfileUrl(history.knsbId)} target="_blank" rel="noopener noreferrer">
            {history.knsbId}
          </a>
        ) : (
          '—'
        )}
      </span>,
    );
  }
  if (history.externalTeam) {
    metaItems.push(
      <span key="team">
        Plays for{' '}
        <a href={history.externalTeam.netstandUrl} target="_blank" rel="noopener noreferrer">
          {history.externalTeam.name}
        </a>
      </span>,
    );
  }

  return (
    <div className="app">
      <Link to="/leaderboard" className="link-add">
        ← Leaderboard
      </Link>

      <h1 className="profile-name">{history.name}</h1>
      {metaItems.length > 0 && (
        <div className="profile-meta">
          {metaItems.map((item, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              {item}
            </Fragment>
          ))}
        </div>
      )}

      <PlayerSnapshot history={history} />

      <div className="modal-tabs" style={{ marginTop: 20 }}>
        <button className={tab === 'results' ? 'modal-tab current' : 'modal-tab'} onClick={() => setTab('results')}>
          Results
        </button>
        <button className={tab === 'graph' ? 'modal-tab current' : 'modal-tab'} onClick={() => setTab('graph')}>
          Graph
        </button>
      </div>
      <div className="profile-body" style={{ marginTop: 16 }}>
        {tab === 'results' ? <PlayerHistoryPanel history={history} /> : <PlayerValueChart history={history} seasonId={season.id} />}
      </div>
    </div>
  );
}
