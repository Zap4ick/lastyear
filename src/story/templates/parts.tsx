import type { CSSProperties } from 'react';
import type { StoryConcert } from '../data.ts';

export const RED = '#d51007';

/** A photo, or a flat block when there is none. */
export function Photo({
  src,
  width,
  height,
  style,
  empty = '#262626',
}: {
  src: string | null;
  width: number;
  height: number;
  style?: CSSProperties;
  empty?: string;
}) {
  return src ? (
    <img src={src} width={width} height={height} style={{ width, height, objectFit: 'cover', ...style }} />
  ) : (
    <div style={{ display: 'flex', width, height, background: empty, ...style }} />
  );
}

/** "Mar 23 · Hydrozagadka, Warszawa" */
export const meta = (c: StoryConcert) => `${c.dateLabel} · ${c.venue}${c.city ? `, ${c.city}` : ''}`;

/** One line, cut with an ellipsis. */
export const oneLine: CSSProperties = {
  display: 'block',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/** Up to n lines, cut with an ellipsis. */
export const clamp = (n: number): CSSProperties => ({ display: 'block', lineClamp: n, overflow: 'hidden' });

export const pad2 = (n: number) => String(n).padStart(2, '0');
