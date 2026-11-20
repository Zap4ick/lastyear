import type { YearPage, YearPageEvent } from '../types.ts';
import { clean, text } from './common.ts';

/** Parse a /user/{username}/events/{year} page. Events are grouped under month headings. */
export function parseYearPage(doc: Document, username: string, year: number): YearPage {
  const root = doc.querySelector('#events-section') ?? doc;
  const events: YearPageEvent[] = [];
  for (const row of root.querySelectorAll('tr.events-list-item')) {
    const event = parseRow(row);
    if (event) events.push(event);
  }
  return {
    username,
    year,
    wentTo: parseWentTo(doc),
    events,
    nextPageUrl: parseNextPage(doc, username, year),
  };
}

/** The "Next" link is a bare query ("?page=2"); resolve it against the year page path. */
function parseNextPage(doc: Document, username: string, year: number): string | null {
  const href = doc.querySelector('.pagination-next a')?.getAttribute('href');
  if (!href) return null;
  if (href.startsWith('/')) return href;
  const base = `/user/${encodeURIComponent(username)}/events/${year}`;
  return href.startsWith('?') ? base + href : `${base}/${href}`;
}

function parseRow(row: Element): YearPageEvent | null {
  const link = row.querySelector('.events-list-item-event--title a');
  const url = link?.getAttribute('href') ?? '';
  const m = url.match(/^\/(event|festival)\/(\d+)/);
  if (!m) return null;
  return {
    id: m[2]!,
    kind: m[1] as 'event' | 'festival',
    url,
    date: (row.querySelector('time[datetime]')?.getAttribute('datetime') ?? '').slice(0, 10),
    title: text(link),
    lineup: splitLineup(row.querySelector('.events-list-item-event--lineup')?.textContent),
    venue: text(row.querySelector('.events-list-item-venue--title')),
    city: text(row.querySelector('.events-list-item-venue--city')),
    country: text(row.querySelector('.events-list-item-venue--country')),
    status: text(row.querySelector('.events-list-item-status')),
  };
}

/**
 * Lineup names are rendered one per line as "Name, \n". Splitting on comma+newline (not on every comma)
 * keeps names like "Crosby, Stills, Nash & Young" intact.
 */
export function splitLineup(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw.includes('\n') ? raw.split(/,\s*\n/) : raw.split(/,\s+/);
  return parts.map(clean).filter(Boolean);
}

function parseWentTo(doc: Document): number | null {
  for (const item of doc.querySelectorAll('.metadata-item')) {
    if (/^went to$/i.test(text(item.querySelector('.metadata-title')))) {
      const n = parseInt(text(item.querySelector('.metadata-display')).replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}
