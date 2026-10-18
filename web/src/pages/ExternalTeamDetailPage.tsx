import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import * as externalTeamsApi from '../api/externalTeams.js';
import type { TeamDetails, TeamMatch } from '../api/types.js';
import { errorMessage, formatNumber } from '../lib/format.js';

const OUTCOME_LETTER: Record<NonNullable<TeamMatch['outcome']>, string> = { WIN: 'W', DRAW: 'D', LOSS: 'L' };
const OUTCOME_CLASS: Record<NonNullable<TeamMatch['outcome']>, string> = { WIN: 'win', DRAW: 'draw', LOSS: 'loss' };

/** Our own external team's own page — schedule/results and roster, scraped
 * from its netstand team page (see netstandTeamScrape.ts). Only our own two
 * teams get one of these; every other team in a division links straight out
 * to its own netstand page instead (see ExternalDivisionTable). */
export default function ExternalTeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const teamId = id ? Number(id) : null;
  const [details, setDetails] = useState<TeamDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamId == null) return;
    externalTeamsApi
      .getTeamDetails(teamId)
      .then(setDetails)
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [teamId]);

  if (error) {
    return (
      <div className="app">
        <Link to="/external-teams" className="link-add">
          ← External Teams
        </Link>
        <div className="error-banner" style={{ marginTop: 14 }}>
          {error}
        </div>
      </div>
    );
  }
  if (!details) {
    return (
      <div className="app">
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Link to="/external-teams" className="link-add">
        ← External Teams
      </Link>

      <h1 className="profile-name">{details.teamName}</h1>
      <div className="profile-meta">
        {details.divisionName} · MP {formatNumber(details.matchPoints)} · BP {formatNumber(details.boardPoints)}
      </div>

      <div className="profile-body">
        <h2 style={{ fontSize: 16, marginTop: 28, marginBottom: 12 }}>Results</h2>
        <div className="board-wrap">
          <table className="board">
            <thead>
              <tr>
                <th style={{ width: 30 }}>Rnd</th>
                <th>Opponent</th>
                <th style={{ textAlign: 'center' }}>Res</th>
                <th style={{ textAlign: 'right' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {details.matches.map((m) => {
                const opponent = m.isHome ? m.awayTeam : m.homeTeam;
                const opponentUrl = m.isHome ? m.awayTeamUrl : m.homeTeamUrl;
                return (
                  <tr key={m.round}>
                    <td className="rank-num">{m.round}</td>
                    <td className="player-name">
                      {m.isHome ? '' : '@ '}
                      <a href={opponentUrl} target="_blank" rel="noopener noreferrer">
                        {opponent}
                      </a>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {m.outcome ? (
                        <span className={`outcome-pill ${OUTCOME_CLASS[m.outcome]}`}>{OUTCOME_LETTER[m.outcome]}</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>–</span>
                      )}
                    </td>
                    <td className="num value-cell" style={{ textAlign: 'right' }}>
                      {m.ownScore != null && m.opponentScore != null
                        ? `${formatNumber(m.ownScore)}–${formatNumber(m.opponentScore)}`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: 16, marginTop: 28, marginBottom: 12 }}>Players</h2>
        <div className="board-wrap">
          <table className="board">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ textAlign: 'right' }}>Rating</th>
                <th style={{ textAlign: 'right' }}>Played</th>
                <th style={{ textAlign: 'right' }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {details.roster.map((p) => (
                <tr key={p.playerUrl || p.name}>
                  <td className="player-name">
                    <a href={p.playerUrl} target="_blank" rel="noopener noreferrer">
                      {p.name}
                    </a>
                  </td>
                  <td className="num value-cell">{p.rating}</td>
                  <td className="num value-cell">{p.played}</td>
                  <td className="num score-cell">{formatNumber(p.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
