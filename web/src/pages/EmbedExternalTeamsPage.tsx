import ExternalTeamsStandings from '../components/ExternalTeamsStandings.js';

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
  return (
    <div className="app embed-app">
      <h1 className="embed-title">External Teams</h1>
      <ExternalTeamsStandings />
    </div>
  );
}
