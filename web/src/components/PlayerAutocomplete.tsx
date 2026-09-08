import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Player } from '../api/types.js';

interface Props {
  /** The eligible pool to search — caller filters out anyone who shouldn't be selectable. */
  players: Player[];
  onSelect: (player: Player) => void;
  /** Fires when the input loses focus without a selection having been made —
   * e.g. clicking away to back out of an in-place edit. Never fires after a
   * real select() (the post-select refocus reclaims focus first). */
  onCancel?: () => void;
  placeholder?: string;
  /** Persistent quick-add bubbles for the most-frequently-attending eligible players. */
  showFrequentBubbles?: boolean;
  frequentLimit?: number;
  autoFocus?: boolean;
  inputClassName?: string;
}

/**
 * One autocomplete, used everywhere a player needs picking: "Who's playing?",
 * assigning an opponent, and swapping a paired player. Always shows
 * suggestions (even before typing — alphabetically, so a name's position
 * never shifts as other players get picked and drop out of the list, which
 * matters a lot when you're tapping through a long list on a phone), Enter
 * selects an unambiguous match, and focus returns to the input after a pick
 * so a whole roster can be typed in one unbroken flow.
 */
export default function PlayerAutocomplete({
  players,
  onSelect,
  onCancel,
  placeholder = 'Type a name…',
  showFrequentBubbles = false,
  frequentLimit = 8,
  autoFocus,
  inputClassName = 'name-input',
}: Props) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleFocus() {
    clearTimeout(blurTimeoutRef.current);
    setFocused(true);
  }
  function handleBlur() {
    // Delayed so a click on a dropdown item (which blurs the input first) still registers —
    // but cancelled by handleFocus if focus comes right back (e.g. the post-select refocus),
    // otherwise a stale timeout can hide the dropdown a moment after it should still be open.
    // That same "focus never came back" signal is exactly "blurred without picking anything",
    // which is when onCancel should fire — a real select() always refocuses before this runs.
    blurTimeoutRef.current = setTimeout(() => {
      setFocused(false);
      onCancel?.();
    }, 150);
  }

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // When frequent bubbles are shown, they already cover "nothing typed yet" —
      // showing the dropdown too would visually overlap and duplicate them.
      if (showFrequentBubbles) return [];
      return [...players].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
    }
    return players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, players, showFrequentBubbles]);

  const frequent = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)).slice(0, frequentLimit),
    [players, frequentLimit],
  );

  function select(player: Player) {
    onSelect(player);
    setQuery('');
    // Refocus so the admin can keep typing the next name without reaching for the mouse.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length === 1) {
        select(suggestions[0]!);
        return;
      }
      const exact = suggestions.find((p) => p.name.toLowerCase() === query.trim().toLowerCase());
      if (exact) select(exact);
    } else if (e.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
    }
  }

  return (
    <div>
      <div className="name-input-wrap">
        <input
          ref={inputRef}
          className={inputClassName}
          placeholder={placeholder}
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {focused && suggestions.length > 0 && (
          <div className="autocomplete">
            {suggestions.map((p) => (
              <div key={p.id} onMouseDown={() => select(p)}>
                {p.name}
              </div>
            ))}
          </div>
        )}
      </div>
      {showFrequentBubbles && frequent.length > 0 && (
        <div className="frequent-bubbles">
          {frequent.map((p) => (
            <button key={p.id} type="button" className="frequent-bubble" onClick={() => select(p)}>
              <span>{p.name}</span>
              <span className="plus">+</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
