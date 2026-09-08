import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import * as roundsApi from '../api/rounds.js';
import * as seasonsApi from '../api/seasons.js';
import type { MembershipType, Player } from '../api/types.js';
import CustomSelect from '../components/CustomSelect.js';
import PlayerAutocomplete from '../components/PlayerAutocomplete.js';
import { errorMessage } from '../lib/format.js';
import { MEMBERSHIP_OPTIONS } from '../lib/membership.js';

interface NewPlayerDraft {
  name: string;
  membershipType: MembershipType;
  startingValue: number;
}

interface Draft {
  date: string;
  signedUpIds: number[];
  newPlayers: NewPlayerDraft[];
}

function draftKey(seasonId: number) {
  return `zow:new-round-draft:${seasonId}`;
}

function loadDraft(seasonId: number): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(seasonId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

// The nearest Monday from today (today itself, if today is a Monday) —
// club nights are always Mondays, and admin usually sets the round up same-day.
// Built entirely from local getters — mixing these with toISOString() (UTC)
// shifts the date by a day whenever local time is near a UTC day boundary.
function nextMonday(): string {
  const d = new Date();
  const daysUntilMonday = (1 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function NewRoundPage() {
  const navigate = useNavigate();
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [existingDraft, setExistingDraft] = useState<{ id: number; number: number } | null>(null);
  const [discardingDraft, setDiscardingDraft] = useState(false);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [date, setDate] = useState(nextMonday);
  const [signedUpIds, setSignedUpIds] = useState<number[]>([]);
  const [newPlayers, setNewPlayers] = useState<NewPlayerDraft[]>([]);
  const [showAddUnregistered, setShowAddUnregistered] = useState(false);
  const [unregName, setUnregName] = useState('');
  const [unregMembership, setUnregMembership] = useState<MembershipType>('GUEST');
  const [unregValue, setUnregValue] = useState('100');
  const [defaultStartingValue, setDefaultStartingValue] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState(false);
  // Guards the save-effect below from firing (and clobbering the very draft
  // we're about to restore) before restoration has actually run once.
  const restoredRef = useRef(false);

  useEffect(() => {
    seasonsApi
      .getCurrentSeason()
      .then(async (s) => {
        const { number, existingDraft: draftRound } = await seasonsApi.getNextRoundNumber(s.id);
        setRoundNumber(number);
        setExistingDraft(draftRound);
        const draft = loadDraft(s.id);
        if (draft) {
          setDate(draft.date);
          setSignedUpIds(draft.signedUpIds);
          setNewPlayers(draft.newPlayers);
          if (draft.signedUpIds.length > 0 || draft.newPlayers.length > 0) setRestoredNotice(true);
        }
        restoredRef.current = true;
        setSeasonId(s.id); // set last — triggers the save-effect only once restoration is done

        seasonsApi.getEnrolledPlayers(s.id).then(setAllPlayers).catch(() => {});

        // A sensible starting value for a brand-new player: the midpoint of
        // the current spread of values, not a one-size-fits-all constant —
        // a season valuing its top player at 200 shouldn't default newcomers to 100.
        try {
          const { standings } = await seasonsApi.getLeaderboard(s.id);
          if (standings.length > 0) {
            const values = standings.map((st) => st.value);
            setDefaultStartingValue(Math.round((Math.max(...values) + Math.min(...values)) / 2));
          } else {
            setDefaultStartingValue(s.topValue);
          }
        } catch {
          // leave the fallback default in place
        }
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    setUnregValue(String(defaultStartingValue));
  }, [defaultStartingValue]);

  // Persist the in-progress draft so navigating away and back doesn't lose it.
  useEffect(() => {
    if (!seasonId || !restoredRef.current) return;
    localStorage.setItem(draftKey(seasonId), JSON.stringify({ date, signedUpIds, newPlayers }));
  }, [seasonId, date, signedUpIds, newPlayers]);

  function addSignup(player: Player) {
    setSignedUpIds((ids) => [...ids, player.id]);
  }
  function removeSignup(playerId: number) {
    setSignedUpIds((ids) => ids.filter((id) => id !== playerId));
  }
  function addUnregistered() {
    if (!unregName.trim()) return;
    setNewPlayers((list) => [
      ...list,
      { name: unregName.trim(), membershipType: unregMembership, startingValue: Number(unregValue) || 0 },
    ]);
    setUnregName('');
    setUnregMembership('GUEST');
    setUnregValue(String(defaultStartingValue));
    setShowAddUnregistered(false);
  }
  function removeUnregistered(name: string) {
    setNewPlayers((list) => list.filter((p) => p.name !== name));
  }

  async function handleDiscardDraft() {
    if (!existingDraft || !seasonId) return;
    if (!window.confirm(`Discard the unpublished Round ${existingDraft.number} draft? This can't be undone.`)) return;
    setDiscardingDraft(true);
    try {
      await roundsApi.deleteRound(existingDraft.id);
      const { number, existingDraft: stillDraft } = await seasonsApi.getNextRoundNumber(seasonId);
      setRoundNumber(number);
      setExistingDraft(stillDraft);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDiscardingDraft(false);
    }
  }

  async function handleGenerate() {
    if (!seasonId || roundNumber == null) return;
    setError(null);
    setSubmitting(true);
    try {
      const round = await roundsApi.createRound(seasonId, {
        number: roundNumber,
        date,
        signedUpPlayerIds: signedUpIds,
        newPlayers: newPlayers.length ? newPlayers : undefined,
      });
      localStorage.removeItem(draftKey(seasonId));
      navigate(`/admin/rounds/${round.id}/review`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const playerName = (id: number) => allPlayers.find((p) => p.id === id)?.name ?? `#${id}`;
  const totalCount = signedUpIds.length + newPlayers.length;
  const isOdd = totalCount > 0 && totalCount % 2 === 1;
  const eligiblePlayers = allPlayers.filter((p) => !signedUpIds.includes(p.id));

  return (
    <div className="app">
      <h1 className="page-title">Admin · Create round</h1>

      {error && <div className="error-banner">{error}</div>}

      {existingDraft ? (
        <div className="card">
          <div className="label">You have an unfinished Round {existingDraft.number} draft</div>
          <div className="help">It was never published, and its round number is still in use.</div>
          <div className="btn-row" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => navigate(`/admin/rounds/${existingDraft.id}/review`)}>
              Resume it →
            </button>
            <button className="btn btn-ghost" onClick={handleDiscardDraft} disabled={discardingDraft}>
              Discard it
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="field-row">
            <div className="field">
              <label>Round</label>
              <div style={{ padding: '9px 0', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                {roundNumber ?? '…'}
              </div>
            </div>
            <div className="field">
              <label htmlFor="date">Date</label>
              <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {restoredNotice && (
            <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>Restored your in-progress list from last time.</p>
          )}

        <div className="whos-playing">
          <div className="prompt">Who&apos;s playing?</div>
          <PlayerAutocomplete
            players={eligiblePlayers}
            onSelect={addSignup}
            showFrequentBubbles
            frequentLimit={eligiblePlayers.length}
            autoFocus
          />

          {totalCount > 0 && (
            <p
              style={{ fontSize: 13, fontWeight: 700, color: isOdd ? 'var(--accent)' : 'var(--muted)', marginTop: 12 }}
              title={isOdd ? 'Odd number — someone will sit out' : 'Even number'}
            >
              {totalCount} {totalCount === 1 ? 'player' : 'players'}
            </p>
          )}

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
                <input
                  id="unreg-name"
                  value={unregName}
                  onChange={(e) => setUnregName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addUnregistered()}
                  autoFocus
                />
              </div>
              <div className="field">
                <label>Membership</label>
                <CustomSelect
                  value={unregMembership}
                  options={MEMBERSHIP_OPTIONS}
                  onChange={(v) => setUnregMembership(v as MembershipType)}
                  triggerClassName="roster-select"
                />
              </div>
              <div className="field">
                <label htmlFor="unreg-value">Estimated starting value</label>
                <input
                  id="unreg-value"
                  type="text"
                  inputMode="numeric"
                  style={{ minWidth: 90 }}
                  value={unregValue}
                  onChange={(e) => setUnregValue(e.target.value.replace(/[^0-9]/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && addUnregistered()}
                />
              </div>
              <button className="btn btn-ghost" onClick={addUnregistered}>
                Add
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => setShowAddUnregistered(true)}>
              + Add an unregistered player
            </button>
          )}

          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={submitting || roundNumber == null || (signedUpIds.length === 0 && newPlayers.length === 0)}
            >
              Generate pairings →
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
