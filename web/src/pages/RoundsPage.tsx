import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import * as playersApi from '../api/players.js';
import * as roundsApi from '../api/rounds.js';
import * as seasonsApi from '../api/seasons.js';
import type { GameResult, Player, Round, RoundEntry } from '../api/types.js';
import ResultToggle from '../components/ResultToggle.js';
import UnpairedCallout from '../components/UnpairedCallout.js';
import { useAdmin } from '../context/AdminContext.js';
import { useLatestSeason } from '../hooks/useSeason.js';
import { errorMessage, formatDate, resultClass, resultLabel } from '../lib/format.js';

export default function RoundsPage() {
  const { season, loading: seasonLoading } = useLatestSeason();
  const { isAdmin } = useAdmin();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRoundId, setOpenRoundId] = useState<number | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [editingCell, setEditingCell] = useState<{ entryId: number; side: 'white' | 'black' } | null>(null);

  useEffect(() => {
    if (!season) {
      setLoading(false);
      return;
    }
    seasonsApi
      .getPublicRounds(season.id)
      .then((data) => {
        setRounds(data);
        if (data[0]) setOpenRoundId(data[0].id);
      })
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [season]);

  useEffect(() => {
    if (adminMode) playersApi.listPlayers().then(setAllPlayers).catch(() => {});
  }, [adminMode]);

  async function refreshRounds() {
    if (!season) return;
    setRounds(await seasonsApi.getPublicRounds(season.id));
  }

  async function handleResultChange(round: Round, entry: RoundEntry, result: GameResult) {
    await roundsApi.updateEntry(round.id, entry.id, { result });
    await refreshRounds();
  }

  async function handleSwapPlayer(round: Round, entry: RoundEntry, side: 'white' | 'black', playerId: number) {
    await roundsApi.updateEntry(round.id, entry.id, side === 'white' ? { whitePlayerId: playerId } : { blackPlayerId: playerId });
    setEditingCell(null);
    await refreshRounds();
  }

  async function handleAssignOpponent(round: Round, pairingBye: RoundEntry) {
    const opponentName = window.prompt(`Assign an opponent for ${pairingBye.soloPlayer?.name}. Type their name:`);
    const opponent = allPlayers.find((p) => p.name.toLowerCase() === opponentName?.trim().toLowerCase());
    if (!opponent) return;
    await roundsApi.updateEntry(round.id, pairingBye.id, {
      kind: 'GAME',
      soloPlayerId: null,
      whitePlayerId: pairingBye.soloPlayerId,
      blackPlayerId: opponent.id,
    });
    await refreshRounds();
  }

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
          <Link to="/" className="link current">
            Rounds
          </Link>
          <Link to="/leaderboard" className="link">
            Leaderboard
          </Link>
        </div>
        {isAdmin && (
          <div className="mode-toggle">
            <button className={!adminMode ? 'on' : ''} onClick={() => setAdminMode(false)}>
              Visitor view
            </button>
            <button className={adminMode ? 'on' : ''} onClick={() => setAdminMode(true)}>
              Admin view
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {rounds.length === 0 && <p style={{ color: 'var(--muted)' }}>No rounds published yet.</p>}

      {rounds.map((round) => {
        const games = round.entries.filter((e) => e.kind === 'GAME');
        const pairingBye = round.entries.find((e) => e.kind === 'PAIRING_BYE');
        const open = openRoundId === round.id;
        return (
          <div className={open ? 'round open' : 'round'} key={round.id}>
            <button className="round-head" onClick={() => setOpenRoundId(open ? null : round.id)}>
              <div className="round-head-left">
                <span className="round-title">Round {round.number}</span>
                <span className="round-date">{formatDate(round.date)}</span>
              </div>
              <span className="chevron">▶</span>
            </button>
            {open && (
              <div className="round-body">
                <table className="pairings">
                  <thead>
                    <tr>
                      <th className="table-no">Table</th>
                      <th>White</th>
                      <th style={{ textAlign: 'center' }}>Result</th>
                      <th>Black</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={g.id}>
                        <td className="table-no">{g.tableNumber}</td>
                        <td>
                          {adminMode && editingCell?.entryId === g.id && editingCell.side === 'white' ? (
                            <select
                              autoFocus
                              defaultValue=""
                              onBlur={() => setEditingCell(null)}
                              onChange={(e) => handleSwapPlayer(round, g, 'white', Number(e.target.value))}
                            >
                              <option value="" disabled>
                                Select…
                              </option>
                              {allPlayers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          ) : adminMode ? (
                            <button className="editable-name" onClick={() => setEditingCell({ entryId: g.id, side: 'white' })}>
                              {g.whitePlayer?.name}
                            </button>
                          ) : (
                            g.whitePlayer?.name
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {adminMode ? (
                            <ResultToggle value={g.result} onChange={(result) => handleResultChange(round, g, result)} />
                          ) : g.result ? (
                            <span className={`result-pill ${resultClass(g.result)}`}>{resultLabel(g.result)}</span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>–</span>
                          )}
                        </td>
                        <td>
                          {adminMode && editingCell?.entryId === g.id && editingCell.side === 'black' ? (
                            <select
                              autoFocus
                              defaultValue=""
                              onBlur={() => setEditingCell(null)}
                              onChange={(e) => handleSwapPlayer(round, g, 'black', Number(e.target.value))}
                            >
                              <option value="" disabled>
                                Select…
                              </option>
                              {allPlayers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          ) : adminMode ? (
                            <button className="editable-name" onClick={() => setEditingCell({ entryId: g.id, side: 'black' })}>
                              {g.blackPlayer?.name}
                            </button>
                          ) : (
                            g.blackPlayer?.name
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pairingBye && (
                  <UnpairedCallout
                    playerName={pairingBye.soloPlayer?.name ?? ''}
                    onAssignOpponent={adminMode ? () => handleAssignOpponent(round, pairingBye) : undefined}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
      {isAdmin && adminMode && (
        <footer className="note" style={{ marginTop: 18 }}>
          Admin view: results and pairings are edited right here — no separate &quot;enter results&quot; page.
        </footer>
      )}
    </div>
  );
}
