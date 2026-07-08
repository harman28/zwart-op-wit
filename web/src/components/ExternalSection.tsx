import { useState } from 'react';
import type { ExternalOutcome, Player, RoundEntry } from '../api/types.js';
import ExternalOutcomeToggle from './ExternalOutcomeToggle.js';
import PlayerAutocomplete from './PlayerAutocomplete.js';

const OUTCOME_LABEL: Record<ExternalOutcome, string> = { WIN: 'Won', DRAW: 'Drew', LOSS: 'Lost' };

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

  return (
    <div className="external-section">
      <div className="not-playing-label">External</div>
      {externalEntries.map((entry) => (
        <div className="external-row" key={entry.id}>
          <span className="txt">{entry.soloPlayer?.name}</span>
          {adminMode && editingId === entry.id ? (
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
          ) : entry.externalOutcome ? (
            adminMode ? (
              <button
                className={`external-tag-btn ${entry.externalOutcome.toLowerCase()}`}
                onClick={() => setEditingId(entry.id)}
              >
                Played external — {OUTCOME_LABEL[entry.externalOutcome]}
              </button>
            ) : (
              <span className={`external-tag ${entry.externalOutcome.toLowerCase()}`}>
                Played external — {OUTCOME_LABEL[entry.externalOutcome]}
              </span>
            )
          ) : adminMode ? (
            <button className="external-tag-btn pending" onClick={() => setEditingId(entry.id)}>
              Result pending…
            </button>
          ) : (
            <span className="external-tag pending">Playing external — result pending</span>
          )}
          {adminMode && editingId !== entry.id && (
            <button className="x external-remove" onClick={() => onRemove(entry)} aria-label="Remove">
              ✕
            </button>
          )}
        </div>
      ))}
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
