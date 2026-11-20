import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A draggable javascript: link. React refuses javascript: URLs in href (XSS guard), so the href is set
 * on the DOM node directly. The code comes from our own server (/api/bookmarklet), never from user input.
 */
export function BookmarkletLink({ code, children }: { code: string; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (ref.current && code.startsWith('javascript:')) ref.current.setAttribute('href', code);
  }, [code]);
  return (
    <a
      ref={ref}
      className="bookmarklet"
      onClick={(e) => {
        e.preventDefault();
        alert('Drag this button to your bookmarks bar, then click it on your last.fm events page.');
      }}
    >
      {children}
    </a>
  );
}
