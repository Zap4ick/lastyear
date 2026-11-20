/**
 * Concert statistics for one user and year. Pure functions: the payload plus optional extras
 * (artist tags from Last.fm, the user's scrobble chart for the year) in, numbers out.
 */
import type { Concert, ImportPayload } from './types.ts';

export interface Tag {
  name: string;
  /** 0–100, relative to the artist's top tag. */
  count: number;
}

export interface ScrobbleChart {
  /** Artists the user played during the year, most played first. */
  artists: { name: string; playcount: number }[];
  /** Last.fm caps the chart at 1000 artists: anyone missing may still have a few plays. */
  capped: boolean;
}

export interface RepeatArtist {
  name: string;
  count: number;
  /** How many of those times they headlined. */
  asHeadliner: number;
  dates: string[];
}

export interface Place {
  name: string;
  city: string;
  count: number;
}

export interface Stats {
  concerts: number;
  festivals: number;
  /** Distinct artists seen at non-festival concerts (headliners and support). */
  artistsSeen: number;
  headlinersSeen: number;
  /** Artists seen more than once, most often first. Festival line-ups are not counted. */
  repeats: RepeatArtist[];
  venues: Place[];
  topVenue: Place | null;
  cities: { name: string; country: string; count: number }[];
  countries: { name: string; count: number }[];
  /** The city with most concerts; "away" concerts are everywhere else. */
  homeCity: string | null;
  awayConcerts: number;
  /** Concerts per month, January first. */
  months: number[];
  /** Month(s) with most concerts, 1-based; several on a tie. */
  busiestMonth: { months: number[]; count: number } | null;
  /** Top genres by summed tag weight of the artists seen; empty without tags. */
  genres: { name: string; score: number }[];
  first: { date: string; title: string } | null;
  last: { date: string; title: string } | null;
  /** Concerts whose event page could not be read (headliner guessed from the title, no photo). */
  missingDetails: number;
  scrobbles: ScrobbleStats | null;
}

export interface ScrobbleStats {
  topN: number;
  /** Which of the user's top-N artists of the year they saw live, with chart rank (1-based). */
  topSeen: { rank: number; name: string; playcount: number }[];
  /** Seen artist the user played most this year. */
  mostPlayedSeen: { name: string; playcount: number } | null;
  /** Headliner the user barely listened to this year. playcount null = below the chart's cut-off. */
  surprise: { name: string; playcount: number | null; date: string } | null;
}

/** Name key for matching artists across pages, tags and charts: case, accents, "the", punctuation. */
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^\s*the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Genre key: "Post Punk", "post-punk", "postpunk" are the same genre. */
const genreKey = (g: string) => g.toLowerCase().replace(/[\s_-]+/g, '');

/** Performers of one concert, headliner first. Festivals: none (nobody sees a whole festival). */
export function performersOf(c: Concert): { name: string; headliner: boolean }[] {
  if (c.kind === 'festival') return [];
  const names = c.details?.performers.length
    ? c.details.performers.map((p) => p.name)
    : [c.title, ...c.lineup];
  const seen = new Set<string>();
  const out: { name: string; headliner: boolean }[] = [];
  for (const [i, name] of names.entries()) {
    const k = nameKey(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name, headliner: i === 0 });
  }
  return out;
}

/** Distinct artists worth fetching tags for (headliners first, then support). */
export function artistsForTags(payload: ImportPayload): string[] {
  const head = new Map<string, string>();
  const rest = new Map<string, string>();
  for (const c of payload.concerts) {
    for (const p of performersOf(c)) {
      const k = nameKey(p.name);
      if (p.headliner) head.set(k, head.get(k) ?? p.name);
      else if (!head.has(k)) rest.set(k, rest.get(k) ?? p.name);
    }
  }
  for (const k of head.keys()) rest.delete(k);
  return [...head.values(), ...rest.values()];
}

export function computeStats(
  payload: ImportPayload,
  extras: { tags?: Record<string, Tag[]>; chart?: ScrobbleChart; topN?: number } = {},
): Stats {
  const concerts = [...payload.concerts].sort((a, b) => a.date.localeCompare(b.date));

  // --- artists ---
  const artists = new Map<string, RepeatArtist>();
  for (const c of concerts) {
    for (const p of performersOf(c)) {
      const k = nameKey(p.name);
      const a = artists.get(k) ?? { name: p.name, count: 0, asHeadliner: 0, dates: [] };
      if (a.dates.includes(c.date)) continue; // same artist twice on one bill
      a.count++;
      if (p.headliner) a.asHeadliner++;
      a.dates.push(c.date);
      artists.set(k, a);
    }
  }
  const repeats = [...artists.values()]
    .filter((a) => a.count > 1)
    .sort((a, b) => b.count - a.count || b.asHeadliner - a.asHeadliner || a.name.localeCompare(b.name));

  // --- places ---
  const venues = rank(
    concerts,
    (c) => `${nameKey(c.venue)}|${nameKey(c.city)}`,
    (group) => ({ name: mostCommon(group.map((c) => c.venue)), city: mostCommon(group.map((c) => c.city)) }),
  );
  const cities = rank(
    concerts.filter((c) => c.city),
    (c) => nameKey(c.city),
    (group) => ({
      name: mostCommon(group.map((c) => c.city)),
      country: mostCommon(group.map((c) => c.country)),
    }),
  );
  const countries = rank(
    concerts.filter((c) => c.country),
    (c) => nameKey(c.country),
    (group) => ({ name: mostCommon(group.map((c) => c.country)) }),
  );
  const homeCity = cities[0]?.name ?? null;

  // --- time ---
  const months = Array.from({ length: 12 }, () => 0);
  for (const c of concerts) months[Number(c.date.slice(5, 7)) - 1]!++;
  const peak = Math.max(0, ...months);
  const busiestMonth =
    peak > 0 ? { months: months.flatMap((n, i) => (n === peak ? [i + 1] : [])), count: peak } : null;

  const firstC = concerts[0];
  const lastC = concerts.at(-1);

  return {
    concerts: concerts.length,
    festivals: concerts.filter((c) => c.kind === 'festival').length,
    artistsSeen: artists.size,
    headlinersSeen: [...artists.values()].filter((a) => a.asHeadliner > 0).length,
    repeats,
    venues,
    topVenue: venues[0] && venues[0].count > 1 ? venues[0] : null,
    cities,
    countries,
    homeCity,
    awayConcerts: homeCity ? concerts.filter((c) => nameKey(c.city) !== nameKey(homeCity)).length : 0,
    months,
    busiestMonth,
    genres: extras.tags ? topGenres(artists, extras.tags) : [],
    first: firstC ? { date: firstC.date, title: firstC.title } : null,
    last: lastC ? { date: lastC.date, title: lastC.title } : null,
    missingDetails: concerts.filter((c) => !c.details).length,
    scrobbles: extras.chart ? scrobbleStats(concerts, artists, extras.chart, extras.topN ?? 20) : null,
  };
}

/**
 * Genres: each artist's tags weighted by tag strength; headliners count fully, support acts half.
 * Tags are looked up by the artist's name as sent to /api/tags, so match keys, not exact strings.
 */
function topGenres(artists: Map<string, RepeatArtist>, tags: Record<string, Tag[]>) {
  const byKey = new Map(Object.entries(tags).map(([name, t]) => [nameKey(name), t]));
  const scores = new Map<string, { name: string; score: number }>();
  for (const [k, a] of artists) {
    const weight = a.asHeadliner > 0 ? 1 : 0.5;
    for (const t of byKey.get(k) ?? []) {
      const gk = genreKey(t.name);
      const g = scores.get(gk) ?? { name: t.name.toLowerCase(), score: 0 };
      g.score += (weight * t.count) / 100;
      // Prefer the hyphenated spelling for display ("post-punk" over "post punk").
      if (t.name.includes('-') && !g.name.includes('-')) g.name = t.name.toLowerCase();
      scores.set(gk, g);
    }
  }
  return [...scores.values()]
    .map((g) => ({ name: g.name, score: Math.round(g.score * 100) / 100 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function scrobbleStats(
  concerts: Concert[],
  artists: Map<string, RepeatArtist>,
  chart: ScrobbleChart,
  topN: number,
): ScrobbleStats {
  const plays = new Map(chart.artists.map((a) => [nameKey(a.name), a.playcount]));
  const topSeen = chart.artists
    .slice(0, topN)
    .map((a, i) => ({ rank: i + 1, name: a.name, playcount: a.playcount }))
    .filter((a) => artists.has(nameKey(a.name)));

  let mostPlayedSeen: ScrobbleStats['mostPlayedSeen'] = null;
  for (const [k, a] of artists) {
    const p = plays.get(k) ?? 0;
    if (p > 0 && (!mostPlayedSeen || p > mostPlayedSeen.playcount))
      mostPlayedSeen = { name: a.name, playcount: p };
  }

  // Surprise: a headliner (not a festival) the user hardly played this year.
  let surprise: ScrobbleStats['surprise'] = null;
  for (const c of concerts) {
    const head = performersOf(c)[0];
    if (!head?.headliner) continue;
    const known = plays.get(nameKey(head.name));
    const p = known ?? (chart.capped ? null : 0);
    const score = p ?? -1; // below the cut-off: unknown but certainly few
    const best = surprise ? (surprise.playcount ?? -1) : Infinity;
    if (score < best && (p === null || p <= 5)) surprise = { name: head.name, playcount: p, date: c.date };
  }

  return { topN, topSeen, mostPlayedSeen, surprise };
}

/** Group, count, sort by count (desc) then by first appearance. */
function rank<T, R extends object>(items: T[], key: (t: T) => string, describe: (group: T[]) => R) {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  return [...groups.values()]
    .map((g, order) => ({ ...describe(g), count: g.length, order }))
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ order: _order, ...rest }) => rest as R & { count: number });
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}
