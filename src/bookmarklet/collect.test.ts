import { describe, expect, it } from 'vitest';
import { parseHtml, readFixture } from '../shared/parse/test-utils.ts';
import type { EventDetails, YearPage } from '../shared/types.ts';
import { collect, CollectError, type CollectDeps, type Progress } from './collect.ts';

const Y25 = '/user/demo123/events/2025';
const UNAVAILABLE = readFixture('error-unavailable.html');

/** A fake last.fm: year pages from fixtures, every event page served by the small-club fixture. */
function fakeLastfm(overrides: Record<string, Array<{ status: number; html: string }>> = {}) {
  const pages: Record<string, string> = {
    [Y25]: readFixture('year-demo123-2025.html'),
    [`${Y25}?page=2`]: readFixture('year-demo123-2025-p2.html'),
    '/user/demo123/events/2026': readFixture('year-demo123-2026.html'),
  };
  const eventHtml = readFixture('event-small-club.html');
  const queues = new Map(Object.entries(overrides).map(([k, v]) => [k, [...v]]));
  const requests: string[] = [];
  const progress: Progress[] = [];
  const deps: CollectDeps = {
    fetchPage: async (path) => {
      requests.push(path);
      const queued = queues.get(path)?.shift();
      if (queued) return queued;
      if (pages[path]) return { status: 200, html: pages[path] };
      if (/^\/(event|festival)\//.test(path)) return { status: 200, html: eventHtml };
      return { status: 404, html: '<title>Page Not Found</title>' };
    },
    parseHtml,
    sleep: async () => {},
    onProgress: (p) => progress.push(p),
  };
  return { deps, requests, progress };
}

describe('collect', () => {
  it('walks all year pages, then every event page', async () => {
    const { deps, requests } = fakeLastfm();
    const result = await collect({ username: 'demo123', year: 2025, today: '2026-11-19' }, deps);
    expect(result.concerts).toHaveLength(47);
    expect(result.wentTo).toBe(46);
    expect(result.warnings).toEqual([]);
    expect(requests.slice(0, 2)).toEqual([Y25, `${Y25}?page=2`]);
    expect(requests).toHaveLength(2 + 47);
    expect(result.concerts.every((c) => c.details?.performers.length)).toBe(true);
    const dates = result.concerts.map((c) => c.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('leaves out upcoming concerts', async () => {
    const { deps } = fakeLastfm();
    const result = await collect({ username: 'demo123', year: 2026, today: '2026-06-30' }, deps);
    expect(result.concerts.length).toBeGreaterThan(0);
    expect(result.concerts.length).toBeLessThan(25);
    expect(result.concerts.every((c) => c.date <= '2026-06-30')).toBe(true);
  });

  it('retries a year page through 503s and reports the wait', async () => {
    const down = { status: 600, html: UNAVAILABLE };
    const { deps, progress } = fakeLastfm({ '/user/demo123/events/2026': [down, down] });
    const result = await collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, deps);
    expect(result.concerts).toHaveLength(25);
    const waits = progress.filter((p) => p.phase === 'waiting');
    expect(waits[0]).toEqual({ phase: 'waiting', problem: 'unavailable', retryInSec: 3, attempt: 1, of: 7 });
    expect(waits.some((p) => p.phase === 'waiting' && p.attempt === 2)).toBe(true);
  });

  it('gives up on a year page after the retry schedule', async () => {
    const down = Array.from({ length: 10 }, () => ({ status: 600, html: UNAVAILABLE }));
    const { deps } = fakeLastfm({ '/user/demo123/events/2026': down });
    await expect(
      collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, deps),
    ).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('keeps going when one event page keeps failing, with a warning', async () => {
    const anchoress = '/event/4981761+Anchoress+at+2KO%C5%81A+Pub+Motocyklowy+on+16+January+2026';
    const down = Array.from({ length: 4 }, () => ({ status: 600, html: UNAVAILABLE }));
    const { deps } = fakeLastfm({ [anchoress]: down });
    const result = await collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, deps);
    expect(result.concerts).toHaveLength(25);
    expect(result.concerts[0]).toMatchObject({ title: 'Anchoress', details: null });
    expect(result.warnings).toEqual(['Could not load details for "Anchoress" (2026-01-16).']);
  });

  it('a firewall block (406) on the year page fails at once, without retrying', async () => {
    const blocked = { status: 406, html: '<title>Last.fm - Rate Limited</title>' };
    const { deps, requests } = fakeLastfm({ '/user/demo123/events/2026': [blocked] });
    await expect(
      collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, deps),
    ).rejects.toMatchObject({
      code: 'blocked',
    });
    expect(requests).toHaveLength(1);
  });

  it('a firewall block on event pages stops further requests and returns what we have', async () => {
    const blocked = { status: 406, html: '<title>Last.fm - Rate Limited</title>' };
    let eventRequests = 0;
    const { deps, requests } = fakeLastfm();
    const realFetch = deps.fetchPage;
    deps.fetchPage = async (path) => {
      if (path.startsWith('/event/') || path.startsWith('/festival/')) {
        if (++eventRequests > 5) return blocked;
      }
      return realFetch(path);
    };
    const result = await collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, deps);
    expect(result.concerts).toHaveLength(25);
    expect(result.concerts.filter((c) => c.details)).toHaveLength(5);
    expect(eventRequests).toBe(6); // 5 ok + the blocked one, then no more
    expect(requests).toHaveLength(1 + 5); // fakeLastfm only logs the requests that reached it
    expect(result.warnings).toEqual([
      'last.fm paused our requests, so photos and line-ups are missing for 20 of 25 concerts. Run the button again in about 15 minutes to fill them in.',
    ]);
  });

  it('reports an unknown user', async () => {
    const { deps } = fakeLastfm();
    const run = collect({ username: 'nobody-here', year: 2026, today: '2026-11-19' }, deps);
    await expect(run).rejects.toBeInstanceOf(CollectError);
    await expect(run).rejects.toMatchObject({ code: 'user-not-found' });
  });

  it('stops on the bot challenge instead of retrying', async () => {
    const challenge = { status: 200, html: '<title>Client Challenge</title>' };
    const { deps, requests } = fakeLastfm({ '/user/demo123/events/2026': [challenge] });
    await expect(
      collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, deps),
    ).rejects.toMatchObject({
      code: 'challenge',
    });
    expect(requests).toHaveLength(1);
  });

  it('resumes from cache after an interruption', async () => {
    const cache = new Map<string, YearPage | EventDetails>();
    const controller = new AbortController();
    const first = fakeLastfm();
    first.deps.cache = cache;
    first.deps.signal = controller.signal;
    first.deps.onProgress = (p) => {
      if (p.phase === 'events' && p.done === 10) controller.abort();
    };
    await expect(
      collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, first.deps),
    ).rejects.toMatchObject({
      code: 'aborted',
    });

    const second = fakeLastfm();
    second.deps.cache = cache;
    const result = await collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, second.deps);
    expect(result.concerts).toHaveLength(25);
    expect(second.requests).toHaveLength(25 - 10); // year page and first 10 events came from cache
  });

  it('keeps raw HTML for the debug download, including failed attempts', async () => {
    const rawPages = new Map<string, string>();
    const { deps } = fakeLastfm({ '/user/demo123/events/2026': [{ status: 600, html: UNAVAILABLE }] });
    deps.rawPages = rawPages;
    await collect({ username: 'demo123', year: 2026, today: '2026-11-19' }, deps);
    expect(rawPages.has('/user/demo123/events/2026 [600 #1]')).toBe(true);
    expect(rawPages.has('/user/demo123/events/2026')).toBe(true);
    expect(rawPages.size).toBe(2 + 25);
  });
});
