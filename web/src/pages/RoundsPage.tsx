import { useEffect, useState } from 'react';
import * as playersApi from '../api/players.js';
import * as roundsApi from '../api/rounds.js';
import * as seasonsApi from '../api/seasons.js';
import type { ExternalOutcome, GameResult, Player, Round, RoundEntry } from '../api/types.js';
import ExternalSection from '../components/ExternalSection.js';
import PlayerAutocomplete from '../components/PlayerAutocomplete.js';
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
  const [openRoundIds, setOpenRoundIds] = useState<Set<number>>(new Set());
  const [adminMode, setAdminMode] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [editingCell, setEditingCell] = useState<{ entryId: number; side: 'white' | 'black' } | null>(null);
  const [assigningByeId, setAssigningByeId] = useState<number | null>(null);

  useEffect(() => {
    if (!season) {
      setLoading(false);
      return;
    }
    // A stale in-flight fetch (React StrictMode's double-invoke, or a fetch
    // from before the visitor/admin toggle was flipped) can resolve after the
    // current one and clobber its result — `cancelled` makes late resolutions
    // of a superseded effect run a no-op.
    let cancelled = false;
    const fetchRounds = isAdmin && adminMode ? seasonsApi.getAdminRounds : seasonsApi.getPublicRounds;
    fetchRounds(season.id)
      .then((data) => {
        if (cancelled) return;
        setRounds(data);
        if (data[0]) setOpenRoundIds((prev) => (prev.size === 0 ? new Set([data[0].id]) : prev));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [season, isAdmin, adminMode]);

  useEffect(() => {
    if (adminMode) playersApi.listPlayers().then(setAllPlayers).catch(() => {});
  }, [adminMode]);

  function toggleRound(id: number) {
    setOpenRoundIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshRounds() {
    if (!season) return;
    const fetchRounds = isAdmin && adminMode ? seasonsApi.getAdminRounds : seasonsApi.getPublicRounds;
    setRounds(await fetchRounds(season.id));
  }

  async function handleAddExternal(round: Round, player: Player) {
    const existing = round.entries.find((e) => e.kind !== 'GAME' && e.soloPlayerId === player.id);
    if (existing) {
      await roundsApi.updateEntry(round.id, existing.id, { kind: 'EXTERNAL_BYE', externalOutcome: null });
    } else {
      await roundsApi.addEntry(round.id, { kind: 'EXTERNAL_BYE', soloPlayerId: player.id });
    }
    await refreshRounds();
  }

  async function handleSetExternalOutcome(round: Round, entry: RoundEntry, outcome: ExternalOutcome) {
    await roundsApi.updateEntry(round.id, entry.id, { externalOutcome: outcome });
    await refreshRounds();
  }

  async function handleRemoveExternal(round: Round, entry: RoundEntry) {
    await roundsApi.deleteEntry(round.id, entry.id);
    await refreshRounds();
  }

  async function handleResultChange(round: Round, entry: RoundEntry, result: GameResult) {
    await roundsApi.updateEntry(round.id, entry.id, { result });
    await refreshRounds();
  }

  async function handleSwapPlayer(round: Round, entry: RoundEntry, side: 'white' | 'black', player: Player) {
    await roundsApi.updateEntry(round.id, entry.id, side === 'white' ? { whitePlayerId: player.id } : { blackPlayerId: player.id });
    setEditingCell(null);
    await refreshRounds();
  }

  async function handleAssignOpponent(round: Round, pairingBye: RoundEntry, opponent: Player) {
    await roundsApi.updateEntry(round.id, pairingBye.id, {
      kind: 'GAME',
      soloPlayerId: null,
      whitePlayerId: pairingBye.soloPlayerId,
      blackPlayerId: opponent.id,
    });
    setAssigningByeId(null);
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
      {isAdmin && (
        <div className="mode-toggle" style={{ marginBottom: 18 }}>
          <button className={!adminMode ? 'on' : ''} onClick={() => setAdminMode(false)}>
            Visitor view
          </button>
          <button className={adminMode ? 'on' : ''} onClick={() => setAdminMode(true)}>
            Admin view
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {rounds.length === 0 && <p style={{ color: 'var(--muted)' }}>No rounds published yet.</p>}

      {rounds.map((round) => {
        const games = [...round.entries]
          .filter((e) => e.kind === 'GAME')
          .sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0));
        const pairingBye = round.entries.find((e) => e.kind === 'PAIRING_BYE');
        const externalEntries = round.entries.filter((e) => e.kind === 'EXTERNAL_BYE').sort((a, b) => a.id - b.id);
        const pairedIds = new Set(games.flatMap((g) => [g.whitePlayerId, g.blackPlayerId]).filter((id): id is number => id != null));
        const externalIds = new Set(externalEntries.map((e) => e.soloPlayerId));
        const externalCandidates = allPlayers.filter((p) => !pairedIds.has(p.id) && !externalIds.has(p.id));
        const open = openRoundIds.has(round.id);
        return (
          <div className={open ? 'round open' : 'round'} key={round.id}>
            <button className="round-head" onClick={() => toggleRound(round.id)}>
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
                            <PlayerAutocomplete
                              players={allPlayers.filter((p) => p.id !== g.blackPlayerId)}
                              onSelect={(p) => handleSwapPlayer(round, g, 'white', p)}
                              inputClassName="editable-name-input"
                              autoFocus
                            />
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
                            <PlayerAutocomplete
                              players={allPlayers.filter((p) => p.id !== g.whitePlayerId)}
                              onSelect={(p) => handleSwapPlayer(round, g, 'black', p)}
                              inputClassName="editable-name-input"
                              autoFocus
                            />
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
                  <>
                    {adminMode && assigningByeId === pairingBye.id ? (
                      <div style={{ marginTop: 8 }}>
                        <PlayerAutocomplete
                          players={allPlayers.filter((p) => p.id !== pairingBye.soloPlayerId && !pairedIds.has(p.id))}
                          onSelect={(p) => handleAssignOpponent(round, pairingBye, p)}
                          inputClassName="editable-name-input"
                          placeholder={`Opponent for ${pairingBye.soloPlayer?.name ?? ''}…`}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <UnpairedCallout
                        playerName={pairingBye.soloPlayer?.name ?? ''}
                        onAssignOpponent={adminMode ? () => setAssigningByeId(pairingBye.id) : undefined}
                      />
                    )}
                  </>
                )}
                {season.countExternalMatches && (
                  <ExternalSection
                    externalEntries={externalEntries}
                    candidatePlayers={externalCandidates}
                    adminMode={adminMode}
                    onAdd={(player) => handleAddExternal(round, player)}
                    onSetOutcome={(entry, outcome) => handleSetExternalOutcome(round, entry, outcome)}
                    onRemove={(entry) => handleRemoveExternal(round, entry)}
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
