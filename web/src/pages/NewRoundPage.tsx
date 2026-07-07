import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import * as playersApi from '../api/players.js';
import * as roundsApi from '../api/rounds.js';
import * as seasonsApi from '../api/seasons.js';
import type { Player } from '../api/types.js';
import { errorMessage } from '../lib/format.js';

interface NewPlayerDraft {
  name: string;
  startingValue: number;
}

export default function NewRoundPage() {
  const navigate = useNavigate();
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [number, setNumber] = useState(1);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState('');
  const [signedUpIds, setSignedUpIds] = useState<number[]>([]);
  const [newPlayers, setNewPlayers] = useState<NewPlayerDraft[]>([]);
  const [showAddUnregistered, setShowAddUnregistered] = useState(false);
  const [unregName, setUnregName] = useState('');
  const [unregValue, setUnregValue] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    seasonsApi.getCurrentSeason().then((s) => setSeasonId(s.id)).catch((err: unknown) => setError(errorMessage(err)));
    playersApi.listPlayers().then(setAllPlayers).catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return allPlayers.filter((p) => !signedUpIds.includes(p.id) && p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, allPlayers, signedUpIds]);

  function addSignup(playerId: number) {
    setSignedUpIds((ids) => [...ids, playerId]);
    setQuery('');
  }
  function removeSignup(playerId: number) {
    setSignedUpIds((ids) => ids.filter((id) => id !== playerId));
  }
  function addUnregistered() {
    if (!unregName.trim()) return;
    setNewPlayers((list) => [...list, { name: unregName.trim(), startingValue: unregValue }]);
    setUnregName('');
    setShowAddUnregistered(false);
  }
  function removeUnregistered(name: string) {
    setNewPlayers((list) => list.filter((p) => p.name !== name));
  }

  async function handleGenerate() {
    if (!seasonId) return;
    setError(null);
    setSubmitting(true);
    try {
      const round = await roundsApi.createRound(seasonId, {
        number,
        date,
        signedUpPlayerIds: signedUpIds,
        newPlayers: newPlayers.length ? newPlayers : undefined,
      });
      navigate(`/admin/rounds/${round.id}/review`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const playerName = (id: number) => allPlayers.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <div className="app">
      <h1 className="page-title">Admin · Create round</h1>
      <div className="card">
        <div className="field-row">
          <div className="field">
            <label htmlFor="number">Round</label>
            <input id="number" type="number" style={{ minWidth: 70 }} value={number} onChange={(e) => setNumber(Number(e.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="whos-playing">
          <div className="prompt">Who&apos;s playing?</div>
          <div className="name-input-wrap">
            <input
              className="name-input"
              placeholder="Type a name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="autocomplete">
                {suggestions.map((p) => (
                  <div key={p.id} onClick={() => addSignup(p.id)}>
                    {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="chips">
            {signedUpIds.map((id) => (
              <span className="chip" key={id}>
                {playerName(id)}
                <button className="x" onClick={() => removeSignup(id)}>
                  ✕
                </button>
              </span>
            ))}
            {newPlayers.map((p) => (
              <span className="chip unreg" key={p.name}>
                {p.name} (new)
                <button className="x" onClick={() => removeUnregistered(p.name)}>
                  ✕
                </button>
              </span>
            ))}
          </div>

          {showAddUnregistered ? (
            <div className="field-row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <div className="field">
                <label htmlFor="unreg-name">Name</label>
                <input id="unreg-name" value={unregName} onChange={(e) => setUnregName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="unreg-value">Estimated starting value</label>
                <input
                  id="unreg-value"
                  type="number"
                  style={{ minWidth: 90 }}
                  value={unregValue}
                  onChange={(e) => setUnregValue(Number(e.target.value))}
                />
              </div>
              <button className="btn btn-ghost" onClick={addUnregistered}>
                Add
              </button>
            </div>
          ) : (
            <button className="link-add" onClick={() => setShowAddUnregistered(true)}>
              + Add an unregistered player
            </button>
          )}

          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={submitting || (signedUpIds.length === 0 && newPlayers.length === 0)}
            >
              Generate pairings →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
