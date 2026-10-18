import { useEffect, useState } from 'react';
import * as externalTeamsApi from '../api/externalTeams.js';
import type { ExternalDivisionStandings } from '../api/types.js';
import ExternalDivisionTable from '../components/ExternalDivisionTable.js';
import { errorMessage } from '../lib/format.js';

/**
 * A bare standings page for Zwart op Wit's two SGA external teams, meant to
 * be iframed into the club's own site the same way /embed/leaderboard is —
 * no masthead, no nav, no admin affordances. Unlike the internal leaderboard
 * this reads nothing from our own database: the backend scrapes each team's
 * own division page on sga.netstand.nl (see netstandDivisionScrape.ts) and
 * caches it for a few minutes, so this page is really just a styled view
 * onto someone else's standings table, formatted to match our own.
 */
export default function EmbedExternalTeamsPage() {
  const [divisions, setDivisions] = useState<ExternalDivisionStandings[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    externalTeamsApi
      .getExternalDivisionStandings()
      .then(setDivisions)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  return (
    <div className="app embed-app">
      <h1 className="embed-title">External Teams</h1>
      {error && <div className="error-banner">{error}</div>}
      {!error && !divisions && <p style={{ color: 'var(--muted)' }}>Loading…</p>}
      {divisions?.map((division, i) => (
        <div key={division.ourTeamName} style={{ marginTop: i === 0 ? 0 : 32 }}>
          <h2 className="profile-name" style={{ fontSize: 20, margin: 0 }}>
            {division.ourTeamName}
          </h2>
          <div className="profile-meta" style={{ marginBottom: 14 }}>
            {division.divisionName}
          </div>
          <ExternalDivisionTable division={division} />
        </div>
      ))}
    </div>
  );
}
