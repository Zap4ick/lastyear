import { useEffect, useRef } from 'react';
import type { PhotoOption } from '../picks.ts';

/** Modal with every photo we have for one concert. Native <dialog>: Esc and focus trapping for free. */
export function PhotoPicker({
  title,
  options,
  current,
  onPick,
  onClose,
}: {
  title: string;
  options: PhotoOption[];
  current: string | null;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // No close() in a cleanup: it fires the dialog's "close" event, and React StrictMode's
    // mount-unmount-mount in dev would call onClose right after opening. Unmounting removes it anyway.
  }, []);

  return (
    <dialog
      ref={ref}
      className="photo-picker"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // click on the backdrop
    >
      <header>
        <h2>Photo for {title}</h2>
        <button type="button" className="link" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <ul>
        {options.map((o) => (
          <li key={o.url}>
            <button
              type="button"
              className={o.url === current ? 'chosen' : ''}
              aria-pressed={o.url === current}
              onClick={() => {
                onPick(o.url);
                onClose();
              }}
            >
              <img src={o.url} alt="" loading="lazy" />
              <span>{o.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
