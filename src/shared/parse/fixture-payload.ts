/**
 * Build a realistic ImportPayload from the saved fixtures, with no requests to last.fm.
 * Used by tests and by `npm run fixture:payload`.
 *
 * details: 'rotate' (default) serves the event fixtures in rotation (festivals get the festival page):
 *   photos and line-ups are real but do not match the titles. Good for photo-heavy UI work.
 * details: 'none' leaves every concert without event details, as after a firewall block: artists come
 *   from the year-page rows, so names, repeats, genres and scrobble matches are the real ones.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collect } from '../../bookmarklet/collect.ts';
import type { ImportPayload } from '../types.ts';

const DIR = join(import.meta.dirname, '__fixtures__');
const read = (f: string) =>
  readFileSync(join(DIR, f), 'utf8').replace(/<script\b[\s\S]*?<\/script>|<iframe\b[\s\S]*?<\/iframe>/gi, '');

export async function buildFixturePayload(
  year: 2025 | 2026,
  parseHtml: (html: string) => Document,
  opts: { details?: 'rotate' | 'none' } = {},
): Promise<ImportPayload> {
  const yearPages: Record<string, string> = {
    '/user/demo123/events/2025': read('year-demo123-2025.html'),
    '/user/demo123/events/2025?page=2': read('year-demo123-2025-p2.html'),
    '/user/demo123/events/2026': read('year-demo123-2026.html'),
  };
  const events = ['event-small-club.html', 'event-title-is-headliner.html', 'event-tour-title.html'].map(
    read,
  );
  const festival = read('event-festival.html');
  let n = 0;
  const payload = await collect(
    { username: 'demo123', year, today: '2026-11-19', pauseMs: 0, jitterMs: 0 },
    {
      fetchPage: async (path) => {
        if (yearPages[path]) return { status: 200, html: yearPages[path] };
        if (opts.details === 'none') return { status: 406, html: '<title>Last.fm - Rate Limited</title>' };
        return { status: 200, html: path.startsWith('/festival/') ? festival : events[n++ % events.length]! };
      },
      parseHtml,
      sleep: async () => {},
    },
  );
  return opts.details === 'none' ? { ...payload, warnings: [] } : payload;
}
