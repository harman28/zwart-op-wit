import { useEffect, useState } from 'react';
import * as playersApi from '../api/players.js';
import type { Gender, MembershipType, Player } from '../api/types.js';
import CustomSelect from '../components/CustomSelect.js';
import Modal from '../components/Modal.js';
import { errorMessage } from '../lib/format.js';
import { MEMBERSHIP_OPTIONS } from '../lib/membership.js';

// KNSB reporting fields — gender left unset ('') until an admin sets it, since
// it's not something to guess. Values match the KNSB submission format exactly.
const GENDER_OPTIONS = [
  { value: '', label: '—' },
  { value: 'M', label: 'M' },
  { value: 'V', label: 'V' },
  { value: 'X', label: 'X' },
];

const MEMBERSHIP_BADGE_CLASS: Record<MembershipType, string> = {
  FULL: 'pill full',
  INTERNAL_ONLY: 'pill internal',
  GUEST: 'pill guest',
};
const MEMBERSHIP_SHORT: Record<MembershipType, string> = {
  FULL: 'Full',
  INTERNAL_ONLY: 'Internal',
  GUEST: 'Guest',
};

function PlayerListTable({ list, onSelect }: { list: Player[]; onSelect: (p: Player) => void }) {
  return (
    <>
      <div className="card players-table-wrap">
        <table className="roster">
          <thead>
            <tr>
              <th>Name</th>
              <th>Membership</th>
              <th>Notes</th>
              <th>Federation</th>
              <th>KNSB ID</th>
              <th>Gender</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="player-row" onClick={() => onSelect(p)}>
                <td>{p.name}</td>
                <td>
                  <span className={MEMBERSHIP_BADGE_CLASS[p.membershipType]}>{MEMBERSHIP_SHORT[p.membershipType]}</span>
                </td>
                <td className="note-cell">
                  {p.notes || <span style={{ color: 'var(--muted)' }}>—</span>}
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
                <td className="note-cell">{p.federation ?? '—'}</td>
                <td className="note-cell">{p.knsbId ?? '—'}</td>
                <td className="note-cell">{p.gender ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="player-cards">
        {list.map((p) => (
          <div key={p.id} className={`player-card ${p.membershipType.toLowerCase()}`} onClick={() => onSelect(p)}>
            <div className="player-card-top">
              <span className="player-card-name">{p.name}</span>
              <span className={MEMBERSHIP_BADGE_CLASS[p.membershipType]}>{MEMBERSHIP_SHORT[p.membershipType]}</span>
            </div>
            {p.notes && <div className="player-card-notes">{p.notes}</div>}
            <div className="player-card-meta">
              Fed {p.federation ?? '—'} · KNSB {p.knsbId ?? '—'} · Gender {p.gender ?? '—'}
            </div>
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
          </div>
        ))}
      </div>
    </>
  );
}

interface EditDraft {
  name: string;
  membershipType: MembershipType;
  notes: string;
  federation: string;
  knsbId: string;
  gender: string;
}

function draftFor(p: Player): EditDraft {
  return {
    name: p.name,
    membershipType: p.membershipType,
    notes: p.notes ?? '',
    federation: p.federation ?? '',
    knsbId: p.knsbId ?? '',
    gender: p.gender ?? '',
  };
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newMembership, setNewMembership] = useState<MembershipType>('FULL');
  const [importText, setImportText] = useState('');

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  function load() {
    setLoading(true);
    playersApi
      .listPlayers()
      .then(setPlayers)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const query = search.trim().toLowerCase();
  const matching = query ? players.filter((p) => p.name.toLowerCase().includes(query)) : players;
  const filteredPlayers = matching.filter((p) => !p.archivedAt);
  const archivedPlayers = matching.filter((p) => p.archivedAt);

  async function handleAdd() {
    if (!newName.trim()) return;
    setError(null);
    try {
      const player = await playersApi.createPlayer(newName.trim(), newMembership);
      setPlayers((prev) => [...prev, player].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setNewMembership('FULL');
      setShowAdd(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleImport() {
    const entries = importText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, membership, federation, knsbId, gender] = line.split(',').map((s) => s.trim());
        const membershipType: MembershipType =
          membership === 'INTERNAL_ONLY' || membership === 'GUEST' ? membership : 'FULL';
        return {
          name: name!,
          membershipType,
          federation: federation ? federation.toUpperCase() : undefined,
          knsbId: knsbId || undefined,
          gender: gender === 'M' || gender === 'V' || gender === 'X' ? (gender as Gender) : undefined,
        };
      });
    if (entries.length === 0) return;
    setError(null);
    try {
      const created = await playersApi.importPlayers(entries);
      setPlayers((prev) => [...prev, ...created].sort((a, b) => a.name.localeCompare(b.name)));
      setImportText('');
      setShowImport(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function openEdit(player: Player) {
    setEditingPlayer(player);
    setDraft(draftFor(player));
  }

  function closeEdit() {
    setEditingPlayer(null);
    setDraft(null);
  }

  async function handleToggleArchive() {
    if (!editingPlayer) return;
    setArchiving(true);
    setError(null);
    try {
      const updated = editingPlayer.archivedAt
        ? await playersApi.unarchivePlayer(editingPlayer.id)
        : await playersApi.archivePlayer(editingPlayer.id);
      setPlayers((prev) => [...prev.filter((p) => p.id !== updated.id), updated].sort((a, b) => a.name.localeCompare(b.name)));
      closeEdit();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setArchiving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingPlayer || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await playersApi.updatePlayer(editingPlayer.id, {
        name: draft.name.trim() || editingPlayer.name,
        membershipType: draft.membershipType,
        notes: draft.notes.trim() || null,
        federation: draft.federation.trim() ? draft.federation.trim().toUpperCase() : undefined,
        knsbId: draft.knsbId.trim() || null,
        gender: (draft.gender || null) as Gender | null,
      });
      setPlayers((prev) => [...prev.filter((p) => p.id !== updated.id), updated].sort((a, b) => a.name.localeCompare(b.name)));
      closeEdit();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <h1 className="page-title">Admin · Players</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="players-toolbar">
        <input
          className="players-search"
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search players"
        />
        <div className="players-toolbar-actions">
          <button className="btn btn-ghost" onClick={() => setShowImport((v) => !v)}>
            Import roster (CSV/paste)
          </button>
          <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
            + Add player
          </button>
        </div>
      </div>

      {showImport && (
        <div className="card">
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="import">
              One player per line: Name, Membership (optional, defaults to Full), Federation (optional), KNSB ID
              (optional), Gender (optional: M/V/X)
            </label>
            <textarea
              id="import"
              rows={6}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'Joppe, FULL, NED, 8938402, M\nBodhi, INTERNAL_ONLY'}
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
              <CustomSelect
                value={newMembership}
                options={MEMBERSHIP_OPTIONS}
                onChange={(v) => setNewMembership(v as MembershipType)}
                triggerClassName="roster-select"
              />
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
        <>
          <PlayerListTable list={filteredPlayers} onSelect={openEdit} />

          {filteredPlayers.length === 0 && (
            <p style={{ color: 'var(--muted)' }}>No active players match "{search.trim()}".</p>
          )}

          {archivedPlayers.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived}
              >
                {showArchived ? '▾' : '▸'} Archived ({archivedPlayers.length})
              </button>
              {showArchived && (
                <div style={{ marginTop: 12, opacity: 0.75 }}>
                  <PlayerListTable list={archivedPlayers} onSelect={openEdit} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editingPlayer && draft && (
        <Modal title="Edit player" onClose={closeEdit}>
          <div className="field">
            <label htmlFor="edit-name">Name</label>
            <input id="edit-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Membership</label>
            <CustomSelect
              value={draft.membershipType}
              options={MEMBERSHIP_OPTIONS}
              onChange={(v) => setDraft({ ...draft, membershipType: v as MembershipType })}
              triggerClassName="roster-select"
            />
          </div>
          <div className="field">
            <label htmlFor="edit-notes">Notes</label>
            <input id="edit-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <div className="field-row" style={{ marginBottom: 0 }}>
            <div className="field">
              <label htmlFor="edit-federation">Federation</label>
              <input
                id="edit-federation"
                style={{ width: 80 }}
                value={draft.federation}
                placeholder="unset"
                onChange={(e) => setDraft({ ...draft, federation: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-knsb-id">KNSB ID</label>
              <input
                id="edit-knsb-id"
                value={draft.knsbId}
                placeholder="unknown"
                onChange={(e) => setDraft({ ...draft, knsbId: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Gender</label>
              <CustomSelect
                value={draft.gender}
                options={GENDER_OPTIONS}
                onChange={(v) => setDraft({ ...draft, gender: v })}
                triggerClassName="roster-select"
              />
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 4, justifyContent: 'space-between' }}>
            <button className="btn btn-ghost" onClick={handleToggleArchive} disabled={archiving}>
              {archiving ? 'Saving…' : editingPlayer.archivedAt ? 'Restore player' : 'Archive player'}
            </button>
            <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
