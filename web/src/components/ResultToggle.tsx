import { useEffect, useRef, useState } from 'react';
import type { GameResult } from '../api/types.js';
import { resultClass, resultLabel } from '../lib/format.js';

const OPTIONS: GameResult[] = ['WHITE_WIN', 'DRAW', 'BLACK_WIN'];

/**
 * Desktop shows all three options as always-visible buttons (room enough,
 * and it's the fastest way to enter results one after another). Mobile
 * swaps to a single pill that opens a small menu of the same three options
 * on tap — three always-visible buttons don't fit next to long names. Both
 * layouts render at once; CSS picks which is shown per viewport. Clicking
 * the option that's already selected unsets the result, in both layouts.
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

  function pick(option: GameResult) {
    onChange(option === value ? null : option);
    setOpen(false);
  }

  return (
    <>
      <div className="result-toggle-desktop">
        {OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`result-toggle-btn${option === value ? ` sel ${resultClass(option)}` : ''}`}
            onClick={() => pick(option)}
          >
            {resultLabel(option)}
          </button>
        ))}
      </div>
      <div className="result-picker" ref={containerRef}>
        <button
          type="button"
          className={`result-cycle-btn${value ? ` ${resultClass(value)}` : ''}`}
          onClick={() => setOpen((o) => !o)}
        >
          {value ? resultLabel(value) : 'Set result'}
        </button>
        {open && (
          <div className="result-picker-menu">
            {OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`result-cycle-btn${option === value ? ` ${resultClass(option)}` : ''}`}
                onClick={() => pick(option)}
              >
                {resultLabel(option)}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
