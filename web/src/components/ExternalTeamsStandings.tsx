import { useEffect, useState } from 'react';
import * as externalTeamsApi from '../api/externalTeams.js';
import type { ExternalDivisionStandings } from '../api/types.js';
import { errorMessage } from '../lib/format.js';
import ExternalDivisionTable from './ExternalDivisionTable.js';

/**
 * Both external-team divisions, fetched and rendered — shared by the full
 * site page (/external-teams, with the usual masthead/nav) and the bare
 * iframe embed (/embed/external-teams), which differ only in their wrapper
 * and heading style, not in what they show or how they load it.
 */
export default function ExternalTeamsStandings() {
  const [divisions, setDivisions] = useState<ExternalDivisionStandings[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    externalTeamsApi
      .getExternalDivisionStandings()
      .then(setDivisions)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  return (
    <>
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
    </>
  );
}
