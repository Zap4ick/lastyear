import type { Concert } from './types.ts';

/**
 * Who headlined: the first performer on the event page. Festivals have no headliner (their line-up is
 * alphabetical), and without event details the title is our best guess.
 */
export function headliner(c: Concert): string | null {
  if (c.kind === 'festival') return null;
  return c.details?.performers[0]?.name ?? c.title;
}

/** The other acts, for display. */
export function supportActs(c: Concert): string[] {
  const names = c.details?.performers.map((p) => p.name) ?? c.lineup;
  const head = headliner(c);
  return names.filter((n) => n !== head);
}

/** Best last.fm photo we have: the headliner's own image, else the event header image. */
export function lastfmPhoto(c: Concert): string | null {
  const first = c.kind === 'festival' ? null : c.details?.performers[0]?.imageUrl;
  return first ?? c.details?.headerImageUrl ?? null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function calendar(date: string) {
  const [, m, d] = date.split('-').map(Number);
  return { month: MONTHS[(m ?? 1) - 1]!, day: d ?? 1 };
}

export function monthName(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleString('en', { month: 'long' });
}

export interface PhotoOption {
  url: string;
  label: string;
}

/**
 * Photos available for a concert: every performer's last.fm image (headliner first), the event header
 * image, then a fallback found elsewhere (Deezer) for the headliner. Deduplicated.
 */
export function photoOptions(c: Concert, fallback?: string | null): PhotoOption[] {
  const out: PhotoOption[] = [];
  const add = (url: string | null | undefined, label: string) => {
    if (url && !out.some((o) => o.url === url)) out.push({ url, label });
  };
  for (const p of c.details?.performers ?? []) add(p.imageUrl, p.name);
  add(c.details?.headerImageUrl, c.kind === 'festival' ? c.title : 'Event image');
  add(fallback, `${headliner(c) ?? c.title} · Deezer`);
  return out;
}

/** The photo that will actually be used: the chosen one if still available, else the first option. */
export function resolvePhoto(pick: { photo: string | null }, options: PhotoOption[]): string | null {
  if (pick.photo && options.some((o) => o.url === pick.photo)) return pick.photo;
  return options[0]?.url ?? null;
}
