import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import * as playersApi from '../api/players.js';
import * as roundsApi from '../api/rounds.js';
import * as seasonsApi from '../api/seasons.js';
import type { ExternalOutcome, Player, RoundAdmin, RoundEntry } from '../api/types.js';
import ExternalSection from '../components/ExternalSection.js';
import PlayerAutocomplete from '../components/PlayerAutocomplete.js';
import TableStepper from '../components/TableStepper.js';
import UnpairedCallout from '../components/UnpairedCallout.js';
import { errorMessage } from '../lib/format.js';

export default function ReviewPairingsPage() {
  const { id } = useParams<{ id: string }>();
  const roundId = Number(id);
  const navigate = useNavigate();

  const [round, setRound] = useState<RoundAdmin | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [countExternalMatches, setCountExternalMatches] = useState(false);
  const [startAtDraft, setStartAtDraft] = useState('1');
  const [editingCell, setEditingCell] = useState<{ entryId: number; side: 'white' | 'black' } | null>(null);
  const [assigningBye, setAssigningBye] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  function load() {
    roundsApi
      .getRoundAdmin(roundId)
      .then((r) => {
        setRound(r);
        const firstTable = [...r.entries]
          .filter((e) => e.kind === 'GAME')
          .sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0))[0]?.tableNumber;
        if (firstTable != null) setStartAtDraft(String(firstTable));
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(() => {
    load();
    playersApi.listPlayers().then(setAllPlayers).catch(() => {});
    seasonsApi
      .getCurrentSeason()
      .then((s) => setCountExternalMatches(s.countExternalMatches))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  async function handleApplyStartAt() {
    const value = Number(startAtDraft);
    if (!Number.isFinite(value)) return;
    await roundsApi.renumberTables(roundId, value);
    load();
  }

  async function handleTableChange(entryId: number, tableNumber: number) {
    await roundsApi.updateEntry(roundId, entryId, { tableNumber });
    load();
  }

  async function handleSwapPlayer(entry: RoundEntry, side: 'white' | 'black', player: Player) {
    await roundsApi.updateEntry(roundId, entry.id, side === 'white' ? { whitePlayerId: player.id } : { blackPlayerId: player.id });
    setEditingCell(null);
    load();
  }

  async function handleAssignOpponent(pairingBye: RoundEntry, opponent: Player) {
    await roundsApi.updateEntry(roundId, pairingBye.id, {
      kind: 'GAME',
      soloPlayerId: null,
      whitePlayerId: pairingBye.soloPlayerId,
      blackPlayerId: opponent.id,
      tableNumber: Number(startAtDraft) || 1,
    });
    setAssigningBye(false);
    load();
  }

  async function handleAddExternal(player: Player) {
    if (!round) return;
    const existing = round.entries.find((e) => e.kind !== 'GAME' && e.soloPlayerId === player.id);
    if (existing) {
      await roundsApi.updateEntry(roundId, existing.id, { kind: 'EXTERNAL_BYE', externalOutcome: null });
    } else {
      await roundsApi.addEntry(roundId, { kind: 'EXTERNAL_BYE', soloPlayerId: player.id });
    }
    load();
  }

  async function handleSetExternalOutcome(entry: RoundEntry, outcome: ExternalOutcome) {
    await roundsApi.updateEntry(roundId, entry.id, { externalOutcome: outcome });
    load();
  }

  async function handleRemoveExternal(entry: RoundEntry) {
    await roundsApi.deleteEntry(roundId, entry.id);
    load();
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await roundsApi.publishRound(roundId);
      navigate('/');
    } catch (err) {
      setError(errorMessage(err));
      setPublishing(false);
    }
  }

  if (error) {
    return (
      <div className="app">
        <div className="error-banner">{error}</div>
      </div>
    );
  }
  if (!round) {
    return (
      <div className="app">
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  }

  const games = [...round.entries]
    .filter((e) => e.kind === 'GAME')
    .sort((a, b) => (a.tableNumber ?? 0) - (b.tableNumber ?? 0));
  const pairingBye = round.entries.find((e) => e.kind === 'PAIRING_BYE');
  const externalEntries = round.entries.filter((e) => e.kind === 'EXTERNAL_BYE').sort((a, b) => a.id - b.id);
  const pairedIds = new Set(games.flatMap((g) => [g.whitePlayerId, g.blackPlayerId]).filter((v): v is number => v != null));
  const externalIds = new Set(externalEntries.map((e) => e.soloPlayerId));
  const externalCandidates = allPlayers.filter((p) => !pairedIds.has(p.id) && !externalIds.has(p.id));

  function renderNameCell(entry: RoundEntry, side: 'white' | 'black') {
    const player = side === 'white' ? entry.whitePlayer : entry.blackPlayer;
    const otherId = side === 'white' ? entry.blackPlayerId : entry.whitePlayerId;
    if (editingCell?.entryId === entry.id && editingCell.side === side) {
      return (
        <PlayerAutocomplete
          players={allPlayers.filter((p) => p.id !== otherId)}
          onSelect={(p) => handleSwapPlayer(entry, side, p)}
          inputClassName="editable-name-input"
          autoFocus
        />
      );
    }
    return (
      <button className="editable-name" onClick={() => setEditingCell({ entryId: entry.id, side })}>
        {player?.name}
      </button>
    );
  }

  return (
    <div className="app">
      <h1 className="page-title">Admin · Review round {round.number} pairings</h1>
      <div className="card">
        <div className="field-row" style={{ marginBottom: 14 }}>
          <div className="field">
            <label htmlFor="start-at">Tables start at</label>
            <input
              id="start-at"
              className="settings-num"
              type="text"
              inputMode="numeric"
              value={startAtDraft}
              onChange={(e) => setStartAtDraft(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyStartAt()}
            />
          </div>
          <button className="btn btn-ghost" onClick={handleApplyStartAt}>
            Apply
          </button>
        </div>

        <table className="pairings">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Table</th>
              <th>White</th>
              <th style={{ width: 30 }}></th>
              <th>Black</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>
                  <TableStepper value={g.tableNumber} onChange={(n) => handleTableChange(g.id, n)} />
                </td>
                <td>{renderNameCell(g, 'white')}</td>
                <td style={{ textAlign: 'center', color: 'var(--muted)' }}>–</td>
                <td>{renderNameCell(g, 'black')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {pairingBye &&
          (assigningBye ? (
            <div style={{ marginTop: 8 }}>
              <PlayerAutocomplete
                players={allPlayers.filter((p) => p.id !== pairingBye.soloPlayerId && !pairedIds.has(p.id))}
                onSelect={(p) => handleAssignOpponent(pairingBye, p)}
                inputClassName="editable-name-input"
                placeholder={`Opponent for ${pairingBye.soloPlayer?.name ?? ''}…`}
                autoFocus
              />
            </div>
          ) : (
            <UnpairedCallout playerName={pairingBye.soloPlayer?.name ?? ''} onAssignOpponent={() => setAssigningBye(true)} />
          ))}

        {countExternalMatches && (
          <ExternalSection
            externalEntries={externalEntries}
            candidatePlayers={externalCandidates}
            adminMode
            onAdd={handleAddExternal}
            onSetOutcome={handleSetExternalOutcome}
            onRemove={handleRemoveExternal}
          />
        )}

        <div className="btn-row">
          <button className="btn btn-primary" onClick={handlePublish} disabled={publishing}>
            Publish round →
          </button>
        </div>
      </div>
    </div>
  );
}
