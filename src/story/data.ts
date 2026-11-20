/**
 * What goes on the story: the picked concerts and a few facts. Pure, shared by server (rendering) and tests.
 * Same rules as the page: no empty facts, no numbers nobody needs.
 */
import { calendar, headliner } from '../shared/concert.ts';
import type { Stats } from '../shared/stats.ts';
import type { ImportPayload } from '../shared/types.ts';

export interface StoryConcert {
  rank: number;
  /** Headliner, or the festival name. */
  name: string;
  /** Event title when it differs from the name (tour names), else null. */
  subtitle: string | null;
  festival: boolean;
  date: string;
  /** "Mar 23" */
  dateLabel: string;
  venue: string;
  city: string;
  /** Source photo URL (last.fm or Deezer CDN); the renderer fetches and processes it. */
  photo: string | null;
}

export interface StoryFact {
  label: string;
  value: string;
}

export interface StoryData {
  username: string;
  year: number;
  total: number;
  /** "1 concert" / "47 concerts": templates show this, never `${total} concerts`. */
  totalLabel: string;
  festivals: number;
  concerts: StoryConcert[];
  /** What the picked concerts are: "Top gigs of the year" (no count: the story shows how many), or "Gig of the year". */
  picksLabel: string;
  /** At most 4, most interesting first. */
  facts: StoryFact[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const listJoin = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} & ${xs.at(-1)}`;

export function storyFacts(s: Stats): StoryFact[] {
  const facts: StoryFact[] = [];
  if (s.artistsSeen) facts.push({ label: 'Artists', value: String(s.artistsSeen) });
  if (s.topVenue) facts.push({ label: 'Second home', value: `${s.topVenue.name} ×${s.topVenue.count}` });
  if (s.genres.length)
    facts.push({
      label: 'Genres',
      value: s.genres
        .slice(0, 3)
        .map((g) => g.name)
        .join(', '),
    });
  if (s.repeats[0]) facts.push({ label: 'Seen again', value: `${s.repeats[0].name} ×${s.repeats[0].count}` });
  if (s.busiestMonth && s.concerts > 1) {
    facts.push({
      label: s.busiestMonth.months.length > 1 ? 'Busiest months' : 'Busiest month',
      value: listJoin(s.busiestMonth.months.map((m) => MONTHS[m - 1]!)),
    });
  }
  return facts.slice(0, 4);
}

export function buildStoryData(
  payload: ImportPayload,
  picks: { key: string; photo: string | null }[],
  stats: Stats,
): StoryData {
  const byKey = new Map(payload.concerts.map((c) => [`${c.kind}:${c.id}`, c]));
  const concerts: StoryConcert[] = [];
  for (const p of picks) {
    const c = byKey.get(p.key);
    if (!c) continue;
    const festival = c.kind === 'festival';
    const name = festival ? c.title : (headliner(c) ?? c.title);
    const { month, day } = calendar(c.date);
    concerts.push({
      rank: concerts.length + 1,
      name,
      subtitle: !festival && c.title !== name ? c.title : null,
      festival,
      date: c.date,
      dateLabel: `${month} ${day}`,
      venue: c.venue,
      city: c.city,
      photo: p.photo,
    });
  }
  return {
    username: payload.username,
    year: payload.year,
    total: payload.concerts.length,
    totalLabel: `${payload.concerts.length} concert${payload.concerts.length === 1 ? '' : 's'}`,
    festivals: stats.festivals,
    concerts,
    picksLabel: concerts.length === 1 ? 'Gig of the year' : 'Top gigs of the year',
    facts: storyFacts(stats),
  };
}
