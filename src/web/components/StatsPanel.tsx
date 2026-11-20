import type { ReactNode } from 'react';
import type { Stats } from '../../shared/stats.ts';

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
  xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' });

/**
 * The year in a plain list. Design rules (PLAN.md): no cards; a row with nothing to say is not shown at all
 * (also while its data is still loading); no numbers nobody needs.
 */
export function StatsPanel({ stats: s }: { stats: Stats }) {
  const rows: [label: string, value: ReactNode][] = [];

  // The concert count is already the page heading.
  if (s.artistsSeen) rows.push(['Artists seen', s.artistsSeen]);
  if (s.topVenue)
    rows.push(['Most visited venue', `${s.topVenue.name}, ${plural(s.topVenue.count, 'time')}`]);
  if (s.cities.length > 1 && s.homeCity) {
    rows.push(['Cities', `${s.cities.length}, ${plural(s.awayConcerts, 'concert')} away from ${s.homeCity}`]);
  }
  if (s.busiestMonth && s.concerts > 1) {
    rows.push([
      s.busiestMonth.months.length > 1 ? 'Busiest months' : 'Busiest month',
      listJoin(s.busiestMonth.months.map((m) => MONTHS[m - 1]!)),
    ]);
  }
  if (s.repeats.length) {
    rows.push([
      'Seen more than once',
      <ul className="inline">
        {s.repeats.slice(0, 6).map((r) => (
          <li key={r.name} title={r.dates.map(fmtDate).join(' · ')}>
            {r.name} <span className="muted">×{r.count}</span>
          </li>
        ))}
      </ul>,
    ]);
  }
  if (s.genres.length)
    rows.push([
      'Top genres',
      s.genres
        .slice(0, 5)
        .map((g) => g.name)
        .join(', '),
    ]);

  const sc = s.scrobbles;
  if (sc?.topSeen.length) {
    rows.push([`Your top ${sc.topN} seen live`, sc.topSeen.map((a) => `${a.name} (#${a.rank})`).join(', ')]);
  }
  if (sc?.mostPlayedSeen) {
    rows.push([
      'Most played of those you saw',
      `${sc.mostPlayedSeen.name}, ${plural(sc.mostPlayedSeen.playcount, 'scrobble')}`,
    ]);
  }
  if (sc?.surprise) {
    const plays =
      sc.surprise.playcount === null || sc.surprise.playcount === 0
        ? 'barely scrobbled'
        : plural(sc.surprise.playcount, 'scrobble');
    rows.push(['Wildcard', `${sc.surprise.name}, ${fmtDate(sc.surprise.date)} (${plays} this year)`]);
  }

  return (
    <section className="stats" aria-label="Your year in numbers">
      <dl className="facts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {s.missingDetails > 0 && (
        <p className="muted small">
          {plural(s.missingDetails, 'concert')} without event details: headliners guessed from titles.
        </p>
      )}
    </section>
  );
}
