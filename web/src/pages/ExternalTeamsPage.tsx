import ExternalTeamsStandings from '../components/ExternalTeamsStandings.js';

/** The full-site counterpart to /embed/external-teams — same data and
 * styling, just with the normal masthead/nav instead of being bare for an
 * iframe. */
export default function ExternalTeamsPage() {
  return (
    <div className="app">
      <h1 className="page-title">External Teams</h1>
      <ExternalTeamsStandings />
    </div>
  );
}
