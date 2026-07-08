import { useEffect, useState } from 'react';
import * as playersApi from '../api/players.js';
import type { MembershipType, Player } from '../api/types.js';
import { errorMessage } from '../lib/format.js';

const MEMBERSHIP_LABEL: Record<MembershipType, string> = {
  FULL: 'Full member',
  INTERNAL_ONLY: 'Internal only',
  GUEST: 'Guest',
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMembership, setNewMembership] = useState<MembershipType>('FULL');
  const [importText, setImportText] = useState('');

  function load() {
    setLoading(true);
    playersApi
      .listPlayers()
      .then(setPlayers)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd() {
    if (!newName.trim()) return;
    await playersApi.createPlayer(newName.trim(), newMembership);
    setNewName('');
    setNewMembership('FULL');
    setShowAdd(false);
    load();
  }

  async function handleImport() {
    const entries = importText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, membership] = line.split(',').map((s) => s.trim());
        const membershipType: MembershipType =
          membership === 'INTERNAL_ONLY' || membership === 'GUEST' ? membership : 'FULL';
        return { name: name!, membershipType };
      });
    if (entries.length === 0) return;
    await playersApi.importPlayers(entries);
    setImportText('');
    setShowImport(false);
    load();
  }

  async function handleMembershipChange(id: number, membershipType: MembershipType) {
    await playersApi.updatePlayer(id, { membershipType });
    load();
  }

  async function handleNotesSave(player: Player, notes: string) {
    if (notes === (player.notes ?? '')) return;
    await playersApi.updatePlayer(player.id, { notes: notes.trim() || null });
    load();
  }

  return (
    <div className="app">
      <h1 className="page-title">Admin · Players</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="players-toolbar">
        <button className="btn btn-ghost" onClick={() => setShowImport((v) => !v)}>
          Import roster (CSV/paste)
        </button>
        <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
          + Add player
        </button>
      </div>

      {showImport && (
        <div className="card">
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="import">One player per line: Name, MembershipType (optional, defaults to Full)</label>
            <textarea
              id="import"
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 7,
                color: 'var(--text)',
                padding: 10,
              }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleImport}>
            Import
          </button>
        </div>
      )}

      {showAdd && (
        <div className="card">
          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="membership">Membership</label>
              <select
                id="membership"
                value={newMembership}
                onChange={(e) => setNewMembership(e.target.value as MembershipType)}
              >
                <option value="FULL">Full member</option>
                <option value="INTERNAL_ONLY">Internal only</option>
                <option value="GUEST">Guest</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleAdd}>
              Add
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <div className="card" style={{ padding: '16px 22px 6px' }}>
          <table className="roster">
            <thead>
              <tr>
                <th>Name</th>
                <th>Membership</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <select
                      className={`roster-select roster-select-${p.membershipType.toLowerCase()}`}
                      value={p.membershipType}
                      onChange={(e) => handleMembershipChange(p.id, e.target.value as MembershipType)}
                    >
                      {(Object.keys(MEMBERSHIP_LABEL) as MembershipType[]).map((mt) => (
                        <option key={mt} value={mt}>
                          {MEMBERSHIP_LABEL[mt]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="note-cell">
                    <input
                      className="notes-input"
                      defaultValue={p.notes ?? ''}
                      onBlur={(e) => handleNotesSave(p, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    />
                    {p.membershipType === 'GUEST' &&
                      (() => {
                        const rounds = p.roundsThisSeason ?? 0;
                        const dueForUpgrade = rounds >= 3;
                        return (
                          <div className={dueForUpgrade ? 'guest-count-hint due' : 'guest-count-hint'}>
                            {rounds} round(s) played this season
                            {dueForUpgrade && ' — consider upgrading'}
                          </div>
                        );
                      })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
