import { useMemo } from 'react';
import type { Concert } from '../../shared/types.ts';
import { calendar, headliner, monthName, supportActs } from '../../shared/concert.ts';
import { concertKey } from '../picks.ts';

/** All concerts by month, Last.fm-style rows. Tapping a row picks or unpicks it. */
export function ConcertList({
  concerts,
  photoFor,
  rankOf,
  onToggle,
}: {
  concerts: Concert[];
  photoFor: (c: Concert) => string | null;
  rankOf: (key: string) => number | null;
  onToggle: (key: string) => void;
}) {
  const byMonth = useMemo(() => {
    const groups = new Map<string, Concert[]>();
    for (const c of concerts) groups.set(c.date.slice(0, 7), [...(groups.get(c.date.slice(0, 7)) ?? []), c]);
    return [...groups.entries()];
  }, [concerts]);

  return (
    <>
      {byMonth.map(([month, list]) => (
        <section key={month} className="month">
          <h2>{monthName(list[0]!.date)}</h2>
          <ul className="events">
            {list.map((c) => {
              const key = concertKey(c);
              const rank = rankOf(key);
              const { month: mon, day } = calendar(c.date);
              const head = headliner(c);
              const photo = photoFor(c);
              const support = supportActs(c);
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`event${rank ? ' picked' : ''}`}
                    aria-pressed={!!rank}
                    onClick={() => onToggle(key)}
                  >
                    <time className="cal" dateTime={c.date}>
                      <span>{mon}</span>
                      <b>{day}</b>
                    </time>
                    <div className="thumb" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
                      {rank && <span className="rank">#{rank}</span>}
                    </div>
                    <div className="what">
                      <span className="title">{c.title}</span>
                      {head && head !== c.title && <div className="headliner">{head}</div>}
                      {support.length > 0 && (
                        <div className="support">
                          {c.kind === 'festival'
                            ? `Festival · ${c.details?.lineupTotal ?? support.length} artists`
                            : `with ${support.slice(0, 4).join(', ')}${support.length > 4 ? ` +${support.length - 4}` : ''}`}
                        </div>
                      )}
                    </div>
                    <div className="where">
                      <div>{c.venue}</div>
                      <div className="muted">{c.city}</div>
                    </div>
                  </button>
                  <a
                    className="ext"
                    href={`https://www.last.fm${c.url}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${c.title} on last.fm`}
                    title="Open on last.fm"
                  >
                    ↗
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
