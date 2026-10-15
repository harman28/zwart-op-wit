import { useEffect, type ReactNode } from 'react';

/**
 * The site's one modal pattern — anything that needs "click to reveal a form,
 * with everything else out of the way" should reuse this rather than growing
 * its own bespoke overlay. Closes on Escape or a backdrop click.
 */
export default function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** The default 460px panel is a cramped fit for a chart with a readable
   * hover tooltip — pass true (e.g. while the Graph tab is active) for more
   * room. Still capped and still centers/scrolls the same way. */
  wide?: boolean;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={wide ? 'modal-panel modal-panel-wide' : 'modal-panel'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
