import { detectProblem, type PageProblem } from '../shared/parse/common.ts';
import { parseEventPage } from '../shared/parse/event.ts';
import { parseYearPage } from '../shared/parse/year.ts';
import { detailsMatchRow, eventKey } from '../shared/sharedEvents.ts';
import type { Concert, EventDetails, ImportPayload, YearPage } from '../shared/types.ts';

export type Progress =
  | { phase: 'year'; page: number }
  | { phase: 'events'; done: number; total: number; current: string }
  | {
      phase: 'waiting';
      problem: 'unavailable' | 'rate-limited';
      retryInSec: number;
      attempt: number;
      of: number;
    };

export interface CollectDeps {
  /** Same-origin fetch on last.fm. Status 600 is how last.fm's "Temporarily unavailable" page arrives. */
  fetchPage: (path: string) => Promise<{ status: number; html: string }>;
  parseHtml: (html: string) => Document;
  sleep: (ms: number) => Promise<void>;
  onProgress?: (p: Progress) => void;
  /** Raw HTML of every fetched page, for the debug download. */
  rawPages?: Map<string, string>;
  /** Parsed pages from an earlier, interrupted run: lets "Retry" resume instead of starting over. */
  cache?: Map<string, YearPage | EventDetails>;
  /**
   * Event details other users' imports already read (keyed by `eventKey`), from our server. Optional
   * and best-effort: anything missing, wrong or failing is simply read from last.fm.
   */
  lookupShared?: (keys: string[]) => Promise<Record<string, EventDetails>>;
  signal?: AbortSignal;
}

export interface CollectOptions {
  username: string;
  year: number;
  /** "YYYY-MM-DD"; concerts after this date are upcoming and left out. */
  today: string;
  /**
   * Pause between successful requests, plus random jitter. last.fm's firewall answers bursts with
   * 406 "Your request was blocked". It tripped in our first end-to-end run with 300 ms pauses
   * (from a browser that had already made many requests that day).
   */
  pauseMs?: number;
  jitterMs?: number;
}

export class CollectError extends Error {
  constructor(
    public readonly code:
      'user-not-found' | 'challenge' | 'unavailable' | 'blocked' | 'aborted' | 'unexpected',
    message: string,
  ) {
    super(message);
  }
}

/** Seconds to wait before each retry. Year pages get a longer schedule: without them there is no result. */
const YEAR_RETRY_DELAYS = [3, 6, 10, 15, 20, 30, 30];
const EVENT_RETRY_DELAYS = [2, 4, 8];

export async function collect(opts: CollectOptions, deps: CollectDeps): Promise<ImportPayload> {
  const { username, year, today } = opts;
  const pause = () => deps.sleep((opts.pauseMs ?? 1200) + Math.random() * (opts.jitterMs ?? 400));
  const cache = deps.cache ?? new Map();
  const warnings: string[] = [];

  // 1. Year pages (30 events per page).
  const rows: YearPage['events'] = [];
  let wentTo: number | null = null;
  let path: string | null = `/user/${encodeURIComponent(username)}/events/${year}`;
  for (let pageNo = 1; path; pageNo++) {
    deps.onProgress?.({ phase: 'year', page: pageNo });
    let page = cache.get(path) as YearPage | undefined;
    if (!page) {
      const doc = await fetchDoc(path, YEAR_RETRY_DELAYS, deps);
      page = parseYearPage(doc, username, year);
      cache.set(path, page);
      await pause();
    }
    wentTo ??= page.wentTo;
    rows.push(...page.events);
    path = page.nextPageUrl;
    if (pageNo >= 20) break; // 600 concerts; something is off
  }

  // Dedupe (in case pages shift while we read them), drop upcoming and anything marked "interested".
  const seen = new Set<string>();
  const past = rows.filter((e) => {
    const key = `${e.kind}:${e.id}`;
    if (seen.has(key) || !e.date || e.date > today || /interested/i.test(e.status)) return false;
    seen.add(key);
    return true;
  });
  past.sort((a, b) => a.date.localeCompare(b.date));
  if (wentTo !== null && rows.length < wentTo) {
    warnings.push(`last.fm says ${wentTo} concerts, but only ${rows.length} were listed.`);
  }

  // 2. Event pages: headliner, performers with photos, venue address.
  //    Optional enrichment: the year page already has date, title, lineup and venue. If last.fm's firewall
  //    blocks us midway, stop asking and hand over what we have.
  //    Pages other users have already read come from our server instead, when they match this user's row.
  let shared: Record<string, EventDetails> = {};
  const unread = past.filter((r) => !cache.has(r.url)).map(eventKey);
  if (deps.lookupShared && unread.length) {
    deps.onProgress?.({ phase: 'events', done: 0, total: past.length, current: '' });
    try {
      shared = await deps.lookupShared(unread);
    } catch {
      // Our server is unreachable from here: read every page from last.fm, as before.
    }
  }
  const concerts: Concert[] = [];
  let blocked = false;
  for (const [i, row] of past.entries()) {
    if (deps.signal?.aborted) throw new CollectError('aborted', 'Stopped.');
    deps.onProgress?.({ phase: 'events', done: i, total: past.length, current: row.title });
    let details = (cache.get(row.url) as EventDetails | undefined) ?? null;
    const key = eventKey(row);
    const fromOthers = !details && Object.hasOwn(shared, key) ? shared[key] : undefined;
    if (fromOthers && matches(fromOthers, row)) {
      concerts.push({ ...row, details: fromOthers, sharedDetails: true });
      continue;
    }
    if (!details && !blocked) {
      try {
        details = parseEventPage(await fetchDoc(row.url, EVENT_RETRY_DELAYS, deps));
        cache.set(row.url, details);
        await pause();
      } catch (e) {
        if (e instanceof CollectError && (e.code === 'aborted' || e.code === 'challenge')) throw e;
        if (e instanceof CollectError && e.code === 'blocked') blocked = true;
        else warnings.push(`Could not load details for "${row.title}" (${row.date}).`);
      }
    }
    concerts.push({ ...row, details });
  }
  const missing = concerts.filter((c) => !c.details).length;
  if (blocked) {
    warnings.push(
      `last.fm paused our requests, so photos and line-ups are missing for ${missing} of ${concerts.length} concerts. ` +
        'Run the button again in about 15 minutes to fill them in.',
    );
  }
  deps.onProgress?.({ phase: 'events', done: past.length, total: past.length, current: '' });

  return { v: 1, username, year, collectedAt: new Date().toISOString(), wentTo, concerts, warnings };
}

/** detailsMatchRow, tolerant of anything malformed coming back from the network. */
function matches(d: EventDetails, row: YearPage['events'][number]): boolean {
  try {
    return detailsMatchRow(d, row);
  } catch {
    return false;
  }
}

async function fetchDoc(path: string, delays: number[], deps: CollectDeps): Promise<Document> {
  for (let attempt = 0; ; attempt++) {
    if (deps.signal?.aborted) throw new CollectError('aborted', 'Stopped.');
    let status = 0;
    let html = '';
    try {
      ({ status, html } = await deps.fetchPage(path));
    } catch {
      // Network error: status stays 0 and is retried like "unavailable".
    }
    const doc = html ? deps.parseHtml(html) : null;
    const problem: PageProblem | null = doc ? detectProblem(doc) : null;
    if (html) deps.rawPages?.set(path + (status === 200 ? '' : ` [${status} #${attempt + 1}]`), html);

    if (status === 200 && doc && !problem) return doc;
    if (status === 404 || problem === 'not-found') {
      throw new CollectError('user-not-found', `last.fm returned "not found" for ${path}.`);
    }
    if (status === 406) {
      // Firewall block ("Your request was blocked"). Retrying soon only makes it worse.
      throw new CollectError(
        'blocked',
        'last.fm paused our requests for a while. Wait about 15 minutes, then tap the button again.',
      );
    }
    if (problem === 'challenge') {
      throw new CollectError(
        'challenge',
        'last.fm wants to check your browser. Reload the page, then tap the button again.',
      );
    }
    const delay = delays[attempt];
    if (delay === undefined) {
      throw new CollectError(
        'unavailable',
        'last.fm is not responding right now. Try again in a few minutes.',
      );
    }
    const rateLimited = status === 429 || problem === 'rate-limited';
    const wait = rateLimited ? delay * 2 : delay;
    for (let s = wait; s > 0; s--) {
      if (deps.signal?.aborted) throw new CollectError('aborted', 'Stopped.');
      deps.onProgress?.({
        phase: 'waiting',
        problem: rateLimited ? 'rate-limited' : 'unavailable',
        retryInSec: s,
        attempt: attempt + 1,
        of: delays.length,
      });
      await deps.sleep(1000);
    }
  }
}
