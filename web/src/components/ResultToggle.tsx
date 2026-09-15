import { useEffect, useRef, useState } from 'react';
import type { GameResult } from '../api/types.js';
import { resultClass, resultLabel } from '../lib/format.js';

const OPTIONS: GameResult[] = ['WHITE_WIN', 'DRAW', 'BLACK_WIN'];

/** The forfeit ("reglementary loss" / no-show) variant of a win, and back. */
const FORFEIT_OF: Partial<Record<GameResult, GameResult>> = {
  WHITE_WIN: 'WHITE_WIN_FORFEIT',
  BLACK_WIN: 'BLACK_WIN_FORFEIT',
};
const BASE_OF: Partial<Record<GameResult, GameResult>> = {
  WHITE_WIN_FORFEIT: 'WHITE_WIN',
  BLACK_WIN_FORFEIT: 'BLACK_WIN',
};

/**
 * Desktop shows all three options as always-visible buttons (room enough,
 * and it's the fastest way to enter results one after another). Mobile
 * swaps to a single pill that opens a small menu of the same options on
 * tap — three always-visible buttons don't fit next to long names. Both
 * layouts render at once; CSS picks which is shown per viewport. Clicking
 * the option that's already selected unsets the result, in both layouts.
 *
 * A no-show is entered as a normal win/loss plus the "R" (reglementary)
 * toggle — same points as a regular forfeit win, just flagged for display
 * (resultLabel shows "1–0R"/"0–1R") — rather than as separate buttons,
 * since it only ever applies on top of a side that's already picked.
 */
export default function ResultToggle({
  value,
  onChange,
}: {
  value: GameResult | null;
  onChange: (result: GameResult | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const baseValue = value ? (BASE_OF[value] ?? value) : null;
  const isForfeit = value != null && BASE_OF[value] != null;

  function pick(option: GameResult) {
    onChange(option === baseValue ? null : option);
    setOpen(false);
  }

  function toggleForfeit() {
    if (!baseValue) return;
    onChange(isForfeit ? baseValue : (FORFEIT_OF[baseValue] ?? baseValue));
  }

  const forfeitBtn = (
    <button
      type="button"
      className={`result-forfeit-btn${isForfeit ? ' sel' : ''}`}
      disabled={!baseValue}
      onClick={toggleForfeit}
      title="Reglementary loss (opponent didn't show up)"
    >
      R
    </button>
  );

  return (
    <>
      <div className="result-toggle-desktop">
        {OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`result-toggle-btn${option === baseValue ? ` sel ${resultClass(option)}` : ''}`}
            onClick={() => pick(option)}
          >
            {resultLabel(option)}
          </button>
        ))}
        {forfeitBtn}
      </div>
      <div className="result-picker" ref={containerRef}>
        <button
          type="button"
          className={`result-cycle-btn${value ? ` ${resultClass(value)}` : ''}`}
          onClick={() => setOpen((o) => !o)}
        >
          {value ? resultLabel(value) : '–'}
        </button>
        {open && (
          <div className="result-picker-menu">
            {OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`result-cycle-btn${option === baseValue ? ` ${resultClass(option)}` : ''}`}
                onClick={() => pick(option)}
              >
                {resultLabel(option)}
              </button>
            ))}
            {forfeitBtn}
          </div>
        )}
      </div>
    </>
  );
}
