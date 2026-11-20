/** The user's top-3 concerts: order matters (#1 first), each with an optional chosen photo. */
import type { Concert } from '../shared/types.ts';

export interface Pick {
  /** `${kind}:${id}`, stable across re-imports. */
  key: string;
  /** Photo the user chose; null = automatic (first available option). */
  photo: string | null;
}

export const MAX_PICKS = 3;
export const concertKey = (c: Pick | Concert) => ('kind' in c ? `${c.kind}:${c.id}` : c.key);

/** Tap a concert: picks it into the next free slot, or unpicks it. When all slots are full, nothing changes. */
export function togglePick(picks: Pick[], key: string, max = MAX_PICKS): { picks: Pick[]; full: boolean } {
  if (picks.some((p) => p.key === key)) return { picks: picks.filter((p) => p.key !== key), full: false };
  if (picks.length >= max) return { picks, full: true };
  return { picks: [...picks, { key, photo: null }], full: false };
}

export function movePick(picks: Pick[], from: number, to: number): Pick[] {
  if (from === to || from < 0 || to < 0 || from >= picks.length || to >= picks.length) return picks;
  const next = [...picks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function setPhoto(picks: Pick[], key: string, photo: string | null): Pick[] {
  return picks.map((p) => (p.key === key ? { ...p, photo } : p));
}

export { photoOptions, resolvePhoto, type PhotoOption } from '../shared/concert.ts';

/** Drop picks whose concerts are gone (e.g. after a re-import), keep order, cap at max. */
export function sanitizePicks(raw: unknown, validKeys: Set<string>, max = MAX_PICKS): Pick[] {
  if (!Array.isArray(raw)) return [];
  const out: Pick[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const { key, photo } = p as Record<string, unknown>;
    if (typeof key !== 'string' || !validKeys.has(key) || out.some((o) => o.key === key)) continue;
    out.push({ key, photo: typeof photo === 'string' && photo.startsWith('https://') ? photo : null });
    if (out.length >= max) break;
  }
  return out;
}

const storageKey = (resultId: string) => `lastyear:picks:${resultId}`;

/**
 * This browser's picks for a result. With nothing saved yet and no more concerts than slots, every concert
 * is pre-picked (in list order); once the user changes anything, their saved choice wins, even an empty one.
 */
export function loadPicks(resultId: string, validKeys: Set<string>, max = MAX_PICKS): Pick[] {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(storageKey(resultId));
  } catch {
    /* storage unavailable */
  }
  if (saved === null) {
    return validKeys.size <= max ? [...validKeys].map((key) => ({ key, photo: null })) : [];
  }
  try {
    return sanitizePicks(JSON.parse(saved), validKeys, max);
  } catch {
    return [];
  }
}

export function savePicks(resultId: string, picks: Pick[]) {
  try {
    localStorage.setItem(storageKey(resultId), JSON.stringify(picks));
  } catch {
    /* storage unavailable: picks live only in memory */
  }
}
