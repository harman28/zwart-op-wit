import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  colorClassName?: string;
}

/**
 * A native <select>'s closed state can be styled freely, but its open popup
 * is drawn by the OS and can't be — no border-radius, no custom colors, no
 * hover states. This renders both states ourselves (reusing the same
 * ".autocomplete" dropdown look used everywhere else) so a select genuinely
 * matches the rest of the site instead of just looking right until clicked.
 */
export default function CustomSelect({
  value,
  options,
  onChange,
  triggerClassName = '',
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  // Measures the menu's *actual* rendered height (not an estimate from
  // options.length, which can be wrong if the caller's options list is still
  // loading in asynchronously at the moment this opens) and flips it upward
  // if there isn't room below — runs before paint, so there's no visible jump.
  useLayoutEffect(() => {
    if (!open || !ref.current || !menuRef.current) return;
    const triggerRect = ref.current.getBoundingClientRect();
    const menuHeight = menuRef.current.getBoundingClientRect().height;
    const roomBelow = window.innerHeight - triggerRect.bottom;
    setOpenUpward(roomBelow < menuHeight && triggerRect.top > menuHeight);
  }, [open, options.length]);

  return (
    <div className="custom-select" ref={ref}>
      <button
        type="button"
        className={`custom-select-trigger ${triggerClassName} ${current?.colorClassName ?? ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.label ?? value}
      </button>
      {open && (
        <div ref={menuRef} className={`autocomplete custom-select-menu${openUpward ? ' open-upward' : ''}`}>
          {options.map((o) => (
            <div
              key={o.value}
              className={`${o.colorClassName ?? ''} ${o.value === value ? 'sel' : ''}`}
              onMouseDown={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
