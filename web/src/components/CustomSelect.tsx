import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  colorClassName?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

/**
 * A native <select>'s closed state can be styled freely, but its open popup
 * is drawn by the OS and can't be — no border-radius, no custom colors, no
 * hover states. This renders both states ourselves (reusing the same
 * ".autocomplete" dropdown look used everywhere else) so a select genuinely
 * matches the rest of the site instead of just looking right until clicked.
 *
 * The open menu is rendered into a portal at document.body with fixed
 * positioning computed from the trigger's own screen position — not as a
 * normal absolutely-positioned child — so it's never clipped by an
 * ancestor's overflow (e.g. a scrollable modal panel).
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
  const [pos, setPos] = useState<MenuPosition | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
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
  const computePosition = useCallback(() => {
    if (!ref.current || !menuRef.current) return;
    const triggerRect = ref.current.getBoundingClientRect();
    const menuHeight = menuRef.current.getBoundingClientRect().height;
    const roomBelow = window.innerHeight - triggerRect.bottom;
    const openUpward = roomBelow < menuHeight && triggerRect.top > menuHeight;
    setPos({
      top: openUpward ? triggerRect.top - menuHeight - 6 : triggerRect.bottom + 6,
      left: triggerRect.left,
      width: triggerRect.width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    computePosition();
  }, [open, options.length, computePosition]);

  // Keeps the menu glued to its trigger if the page (or a scrollable
  // ancestor, e.g. a modal panel) scrolls or the window resizes while open.
  useEffect(() => {
    if (!open) return;
    document.addEventListener('scroll', computePosition, true);
    window.addEventListener('resize', computePosition);
    return () => {
      document.removeEventListener('scroll', computePosition, true);
      window.removeEventListener('resize', computePosition);
    };
  }, [open, computePosition]);

  return (
    <div className="custom-select" ref={ref}>
      <button
        type="button"
        className={`custom-select-trigger ${triggerClassName} ${current?.colorClassName ?? ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        {current?.label ?? value}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="autocomplete custom-select-menu"
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: pos?.width,
              zIndex: 1000,
            }}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
