import { useEffect, useState } from 'react';
import * as playersApi from '../api/players.js';
import * as roundsApi from '../api/rounds.js';
import * as seasonsApi from '../api/seasons.js';
import type { ExternalOutcome, GameResult, MembershipType, Player, Round, RoundEntry } from '../api/types.js';
import AddUnregisteredPlayerForm from '../components/AddUnregisteredPlayerForm.js';
import ExternalSection from '../components/ExternalSection.js';
import PlayerAutocomplete from '../components/PlayerAutocomplete.js';
import ResultToggle from '../components/ResultToggle.js';
import UnpairedCallout from '../components/UnpairedCallout.js';
import { useAdmin } from '../context/AdminContext.js';
import { useLatestSeason } from '../hooks/useSeason.js';
import { errorMessage, formatDate, resultClass, resultLabel } from '../lib/format.js';

/** A matchup slot picked while building "+ Add matchup": either an existing
 * enrolled player, or the not-yet-created shape of a brand-new one. */
type MatchupParticipant =
  | { kind: 'existing'; player: Player }
  | { kind: 'new'; name: string; membershipType: MembershipType; startingValue: number };

function matchupParticipantLabel(p: MatchupParticipant): string {
  return p.kind === 'existing' ? p.player.name : p.name;
}

function toMatchupParticipantInput(p: MatchupParticipant): roundsApi.MatchupParticipant {
  return p.kind === 'existing'
    ? { playerId: p.player.id }
    : { newPlayer: { name: p.name, membershipType: p.membershipType, startingValue: p.startingValue } };
}

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
  const [showAddUnregistered, setShowAddUnregistered] = useState(false);
  // key = roundId; value = null while picking the first slot, or the chosen first slot while picking the second.
  const [addMatchupState, setAddMatchupState] = useState<Map<number, MatchupParticipant | null>>(new Map());
  // roundIds where the "+ Add an unregistered player" form is open for whichever slot is currently being picked.
  const [addMatchupUnregisteredFor, setAddMatchupUnregisteredFor] = useState<Set<number>>(new Set());

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
    // Optimistic: this is the highest-frequency click on the page (entering a
    // whole round's results in one sitting), so reflect it immediately rather
    // than waiting on a full round-trip + full rounds refetch. Only refetch
    // (to recover the real state) if the update actually fails.
    setRounds((prev) =>
      prev.map((r) =>
        r.id !== round.id ? r : { ...r, entries: r.entries.map((e) => (e.id === entry.id ? { ...e, result } : e)) },
      ),
    );
    try {
      await roundsApi.updateEntry(round.id, entry.id, { result });
    } catch (err) {
      setError(errorMessage(err));
      await refreshRounds();
    }
  }

  async function handleSwapPlayer(round: Round, entry: RoundEntry, side: 'white' | 'black', player: Player) {
    await roundsApi.updateEntry(round.id, entry.id, side === 'white' ? { whitePlayerId: player.id } : { blackPlayerId: player.id });
    setEditingCell(null);
    await refreshRounds();
  }

  function closeAssignOpponent() {
    setAssigningByeId(null);
    setShowAddUnregistered(false);
  }

  async function handleAssignOpponent(round: Round, pairingBye: RoundEntry, opponent: Player) {
    await roundsApi.assignOpponent(round.id, pairingBye.id, { opponentId: opponent.id });
    closeAssignOpponent();
    await refreshRounds();
  }

  async function handleAssignNewOpponent(
    round: Round,
    pairingBye: RoundEntry,
    newOpponent: { name: string; membershipType: MembershipType; startingValue: number },
  ) {
    try {
      await roundsApi.assignOpponent(round.id, pairingBye.id, { newOpponent });
      closeAssignOpponent();
      await refreshRounds();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteMatchup(round: Round, entry: RoundEntry) {
    if (!window.confirm(`Remove ${entry.whitePlayer?.name ?? '?'} vs ${entry.blackPlayer?.name ?? '?'} from Round ${round.number}?`)) {
      return;
    }
    await roundsApi.deleteEntry(round.id, entry.id);
    await refreshRounds();
  }

  async function handleDeleteRound(round: Round) {
    if (
      !window.confirm(
        `Delete Round ${round.number} entirely? This removes all its pairings and results and can't be undone.`,
      )
    ) {
      return;
    }
    await roundsApi.deleteRound(round.id);
    await refreshRounds();
  }

  function startAddMatchup(roundId: number) {
    setAddMatchupState((prev) => new Map(prev).set(roundId, null));
  }
  function cancelAddMatchup(roundId: number) {
    setAddMatchupState((prev) => {
      const next = new Map(prev);
      next.delete(roundId);
      return next;
    });
    setAddMatchupUnregisteredFor((prev) => {
      const next = new Set(prev);
      next.delete(roundId);
      return next;
    });
  }
  function pickMatchupSlot(roundId: number, participant: MatchupParticipant) {
    setAddMatchupState((prev) => new Map(prev).set(roundId, participant));
    setAddMatchupUnregisteredFor((prev) => {
      const next = new Set(prev);
      next.delete(roundId);
      return next;
    });
  }
  async function finishAddMatchup(round: Round, participantA: MatchupParticipant, participantB: MatchupParticipant) {
    // Colors aren't an admin choice — the server assigns them the same way
    // pairing generation does, off each player's current color balance.
    try {
      await roundsApi.addMatchup(round.id, toMatchupParticipantInput(participantA), toMatchupParticipantInput(participantB));
      cancelAddMatchup(round.id);
      await refreshRounds();
    } catch (err) {
      setError(errorMessage(err));
    }
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
                      {adminMode && <th style={{ width: 24 }} />}
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
                              onCancel={() => setEditingCell(null)}
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
                              onCancel={() => setEditingCell(null)}
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
                        {adminMode && (
                          <td>
                            <button
                              className="external-remove"
                              onClick={() => handleDeleteMatchup(round, g)}
                              aria-label="Remove matchup"
                            >
                              ✕
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {adminMode &&
                  (addMatchupState.has(round.id) ? (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {(() => {
                        const firstSlot = addMatchupState.get(round.id) ?? null;
                        const addingUnregistered = addMatchupUnregisteredFor.has(round.id);
                        if (addingUnregistered) {
                          return (
                            <AddUnregisteredPlayerForm
                              submitLabel={firstSlot == null ? 'Next' : 'Add'}
                              onSubmit={(input) =>
                                firstSlot == null
                                  ? pickMatchupSlot(round.id, { kind: 'new', ...input })
                                  : finishAddMatchup(round, firstSlot, { kind: 'new', ...input })
                              }
                              onCancel={() =>
                                setAddMatchupUnregisteredFor((prev) => {
                                  const next = new Set(prev);
                                  next.delete(round.id);
                                  return next;
                                })
                              }
                            />
                          );
                        }
                        if (firstSlot == null) {
                          return (
                            <PlayerAutocomplete
                              players={allPlayers.filter((p) => !pairedIds.has(p.id))}
                              onSelect={(p) => pickMatchupSlot(round.id, { kind: 'existing', player: p })}
                              inputClassName="editable-name-input"
                              placeholder="First player…"
                              autoFocus
                            />
                          );
                        }
                        return (
                          <>
                            <span className="txt">{matchupParticipantLabel(firstSlot)} vs</span>
                            <PlayerAutocomplete
                              players={allPlayers.filter(
                                (p) => !pairedIds.has(p.id) && !(firstSlot.kind === 'existing' && p.id === firstSlot.player.id),
                              )}
                              onSelect={(p) => finishAddMatchup(round, firstSlot, { kind: 'existing', player: p })}
                              inputClassName="editable-name-input"
                              placeholder="Second player…"
                              autoFocus
                            />
                          </>
                        );
                      })()}
                      {!addMatchupUnregisteredFor.has(round.id) && (
                        <button
                          className="link-add"
                          onClick={() => setAddMatchupUnregisteredFor((prev) => new Set(prev).add(round.id))}
                        >
                          + Add an unregistered player
                        </button>
                      )}
                      <button className="link-add" onClick={() => cancelAddMatchup(round.id)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="link-add" style={{ marginTop: 8 }} onClick={() => startAddMatchup(round.id)}>
                      + Add matchup
                    </button>
                  ))}
                {pairingBye && (
                  <>
                    {adminMode && assigningByeId === pairingBye.id ? (
                      <div style={{ marginTop: 8 }}>
                        {showAddUnregistered ? (
                          <AddUnregisteredPlayerForm
                            onSubmit={(input) => handleAssignNewOpponent(round, pairingBye, input)}
                            onCancel={() => setShowAddUnregistered(false)}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <PlayerAutocomplete
                              players={allPlayers.filter((p) => p.id !== pairingBye.soloPlayerId && !pairedIds.has(p.id))}
                              onSelect={(p) => handleAssignOpponent(round, pairingBye, p)}
                              inputClassName="editable-name-input"
                              placeholder={`Opponent for ${pairingBye.soloPlayer?.name ?? ''}…`}
                              autoFocus
                            />
                            <button className="link-add" onClick={() => setShowAddUnregistered(true)}>
                              + Add an unregistered player
                            </button>
                            <button className="link-add" onClick={closeAssignOpponent}>
                              Cancel
                            </button>
                          </div>
                        )}
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
                {adminMode && (
                  <div className="not-playing" style={{ textAlign: 'right' }}>
                    <button className="link-add" onClick={() => handleDeleteRound(round)}>
                      Delete round
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
