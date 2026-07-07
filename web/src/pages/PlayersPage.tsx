import { useEffect, useState } from 'react';
import * as playersApi from '../api/players.js';
import type { MembershipType, Player } from '../api/types.js';
import { errorMessage } from '../lib/format.js';

const MEMBERSHIP_LABEL: Record<MembershipType, string> = {
  FULL: 'Full member',
  INTERNAL_ONLY: 'Internal only',
  GUEST: 'Guest',
};
const MEMBERSHIP_PILL_CLASS: Record<MembershipType, string> = {
  FULL: 'full',
  INTERNAL_ONLY: 'internal',
  GUEST: 'guest',
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
              <input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
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
        <div className="card" style={{ padding: '0 22px' }}>
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
                    <span className={`pill ${MEMBERSHIP_PILL_CLASS[p.membershipType]}`}>
                      {MEMBERSHIP_LABEL[p.membershipType]}
                    </span>
                  </td>
                  <td className="note-cell">
                    {p.membershipType === 'GUEST' ? `${p.roundsThisSeason ?? 0} round(s) played this season` : '—'}
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
