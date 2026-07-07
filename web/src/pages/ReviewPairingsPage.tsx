import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import * as playersApi from '../api/players.js';
import * as roundsApi from '../api/rounds.js';
import type { Player, RoundAdmin, RoundEntry } from '../api/types.js';
import TableStepper from '../components/TableStepper.js';
import UnpairedCallout from '../components/UnpairedCallout.js';
import { errorMessage } from '../lib/format.js';

export default function ReviewPairingsPage() {
  const { id } = useParams<{ id: string }>();
  const roundId = Number(id);
  const navigate = useNavigate();

  const [round, setRound] = useState<RoundAdmin | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [startAt, setStartAt] = useState(1);
  const [editingCell, setEditingCell] = useState<{ entryId: number; side: 'white' | 'black' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  function load() {
    roundsApi
      .getRoundAdmin(roundId)
      .then((r) => {
        setRound(r);
        const firstTable = r.entries.find((e) => e.kind === 'GAME')?.tableNumber;
        if (firstTable != null) setStartAt(firstTable);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(() => {
    load();
    playersApi.listPlayers().then(setAllPlayers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  async function handleApplyStartAt() {
    await roundsApi.renumberTables(roundId, startAt);
    load();
  }

  async function handleTableChange(entryId: number, tableNumber: number) {
    await roundsApi.updateEntry(roundId, entryId, { tableNumber });
    load();
  }

  async function handleSwapPlayer(entry: RoundEntry, side: 'white' | 'black', playerId: number) {
    await roundsApi.updateEntry(roundId, entry.id, side === 'white' ? { whitePlayerId: playerId } : { blackPlayerId: playerId });
    setEditingCell(null);
    load();
  }

  async function handleAssignOpponent(pairingBye: RoundEntry) {
    const opponentName = window.prompt(`Assign an opponent for ${pairingBye.soloPlayer?.name}. Type their name:`);
    const opponent = allPlayers.find((p) => p.name.toLowerCase() === opponentName?.trim().toLowerCase());
    if (!opponent) return;
    await roundsApi.updateEntry(roundId, pairingBye.id, {
      kind: 'GAME',
      soloPlayerId: null,
      whitePlayerId: pairingBye.soloPlayerId,
      blackPlayerId: opponent.id,
      tableNumber: startAt,
    });
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

  const games = round.entries.filter((e) => e.kind === 'GAME');
  const pairingBye = round.entries.find((e) => e.kind === 'PAIRING_BYE');

  function renderNameCell(entry: RoundEntry, side: 'white' | 'black') {
    const player = side === 'white' ? entry.whitePlayer : entry.blackPlayer;
    if (editingCell?.entryId === entry.id && editingCell.side === side) {
      return (
        <select
          autoFocus
          defaultValue=""
          onBlur={() => setEditingCell(null)}
          onChange={(e) => handleSwapPlayer(entry, side, Number(e.target.value))}
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
            <input id="start-at" className="settings-num" type="number" value={startAt} onChange={(e) => setStartAt(Number(e.target.value))} />
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

        {pairingBye && (
          <UnpairedCallout
            playerName={pairingBye.soloPlayer?.name ?? ''}
            onAssignOpponent={() => handleAssignOpponent(pairingBye)}
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
