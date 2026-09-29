import { useState } from 'react';
import type { ExternalOutcome, Player, RoundEntry } from '../api/types.js';
import ExternalOutcomeToggle from './ExternalOutcomeToggle.js';
import PlayerAutocomplete from './PlayerAutocomplete.js';

// Same W/D/L convention as PlayerHistoryModal's own outcome-pill — one glance,
// no "Played external" boilerplate repeated on every row.
const OUTCOME_LETTER: Record<ExternalOutcome, string> = { WIN: 'W', DRAW: 'D', LOSS: 'L' };
const OUTCOME_CLASS: Record<ExternalOutcome, string> = { WIN: 'win', DRAW: 'draw', LOSS: 'loss' };

/**
 * Players who played an external (rated) match instead of an internal pairing
 * this round. Never lists the whole "everyone who isn't playing" roster —
 * just the ones actually marked external. Adding one is hidden behind a
 * "+ Add external game" link so the section stays quiet until used, then
 * reveals the same autocomplete used for "Who's playing?" / "Assign opponent".
 */
export default function ExternalSection({
  externalEntries,
  candidatePlayers,
  adminMode,
  onAdd,
  onSetOutcome,
  onRemove,
}: {
  externalEntries: RoundEntry[];
  candidatePlayers: Player[];
  adminMode: boolean;
  onAdd: (player: Player) => void;
  onSetOutcome: (entry: RoundEntry, outcome: ExternalOutcome) => void;
  onRemove: (entry: RoundEntry) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  if (!adminMode && externalEntries.length === 0) return null;

  // Read view: a compact W/D/L pill, same convention PlayerHistoryModal
  // already uses — no per-row "Played external" sentence repeated 7 times.
  // Admin view keeps the full toggle/edit affordance instead of the pill.
  function outcomeIndicator(entry: RoundEntry) {
    if (adminMode && editingId === entry.id) {
      return (
        <>
          <ExternalOutcomeToggle
            value={entry.externalOutcome}
            onChange={(outcome) => {
              onSetOutcome(entry, outcome);
              setEditingId(null);
            }}
          />
          <button className="link-add" onClick={() => setEditingId(null)}>
            Cancel
          </button>
        </>
      );
    }
    if (entry.externalOutcome) {
      return adminMode ? (
        <button className={`outcome-pill-btn ${OUTCOME_CLASS[entry.externalOutcome]}`} onClick={() => setEditingId(entry.id)}>
          {OUTCOME_LETTER[entry.externalOutcome]}
        </button>
      ) : (
        <span className={`outcome-pill ${OUTCOME_CLASS[entry.externalOutcome]}`}>{OUTCOME_LETTER[entry.externalOutcome]}</span>
      );
    }
    return adminMode ? (
      <button className="outcome-pill-btn pending" onClick={() => setEditingId(entry.id)}>
        …
      </button>
    ) : (
      <span className="outcome-pill pending">…</span>
    );
  }

  return (
    <div className="external-section">
      <div className="external-results-label">External Results</div>
      <div className={adminMode ? undefined : 'external-grid'}>
        {externalEntries.map((entry) => (
          <div className="external-row" key={entry.id}>
            <span className="txt">{entry.soloPlayer?.name}</span>
            {outcomeIndicator(entry)}
            {adminMode && editingId !== entry.id && (
              <button className="x external-remove" onClick={() => onRemove(entry)} aria-label="Remove">
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {adminMode &&
        (adding ? (
          <div style={{ marginTop: externalEntries.length ? 10 : 0 }}>
            <PlayerAutocomplete
              players={candidatePlayers}
              onSelect={(player) => {
                onAdd(player);
                setAdding(false);
              }}
              inputClassName="editable-name-input"
              placeholder="Who played externally?"
              autoFocus
            />
          </div>
        ) : (
          <button className="link-add" style={{ marginTop: externalEntries.length ? 10 : 0 }} onClick={() => setAdding(true)}>
            + Add external game
          </button>
        ))}
    </div>
  );
}
