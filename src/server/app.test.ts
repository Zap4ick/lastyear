// @vitest-environment node
import { Window } from 'happy-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildFixturePayload } from '../shared/parse/fixture-payload.ts';
import { detailsFor } from '../shared/parse/test-utils.ts';
import { detailsMatchRow, eventKey } from '../shared/sharedEvents.ts';
import type { ImportPayload } from '../shared/types.ts';
import { TEMPLATES } from '../story/templates/index.ts';
import { buildApp } from './app.ts';
import { openDb } from './db.ts';
import { createDeezer, pickPhoto } from './deezer.ts';
import { cleanTags, createLastfm } from './lastfm.ts';
import type { SafeGet } from './safeFetch.ts';
import { createSiteImages } from './siteImages.ts';

const win = new Window({ settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
const parseHtml = (html: string) =>
  new win.DOMParser().parseFromString(html, 'text/html') as unknown as Document;
afterAll(() => win.happyDOM.close());

/** Fake upstream: records calls, answers like Last.fm / Deezer. */
function fakeFetch() {
  const calls: string[] = [];
  const fn = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push(url.hostname + url.search);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.hostname === 'ws.audioscrobbler.com') {
      const method = url.searchParams.get('method');
      if (method === 'user.getinfo') {
        if (url.searchParams.get('user') === 'nobody')
          return json({ error: 6, message: 'User not found' }, 404);
        return json({
          user: {
            name: 'demo123',
            url: 'https://www.last.fm/user/demo123',
            playcount: '123456',
            image: [
              { size: 'small', '#text': 'https://lastfm.freetls.fastly.net/i/u/34s/a.png' },
              { size: 'extralarge', '#text': 'https://lastfm.freetls.fastly.net/i/u/300x300/a.png' },
            ],
            registered: { unixtime: '1200000000' },
          },
        });
      }
      if (method === 'user.getweeklyartistchart') {
        return json({
          weeklyartistchart: {
            artist: [
              { name: 'Dropkick Murphys', playcount: '630' },
              { name: 'ist ist', playcount: '140' },
            ],
            '@attr': { from: url.searchParams.get('from'), to: url.searchParams.get('to') },
          },
        });
      }
      if (method === 'artist.gettoptags') {
        return json({
          toptags: {
            tag: [
              { name: 'Post-Punk', count: 100 },
              { name: 'seen live', count: 80 },
              { name: 'darkwave', count: 40 },
              { name: '80s', count: 30 },
              { name: 'rare', count: 2 },
            ],
          },
        });
      }
    }
    if (url.hostname === 'api.deezer.com') {
      return json({
        data: [
          {
            name: 'Anchoress',
            nb_fan: 90,
            picture_xl: 'https://cdn-images.dzcdn.net/images/artist/abc/1000x1000.jpg',
          },
        ],
      });
    }
    return json({}, 500);
  }) as typeof fetch;
  return { fn, calls };
}

/** Fake websites for safeGet: url → [content type, body]. Anything else fails like an unreachable host. */
function fakeSites(pages: Record<string, [string, string | Buffer]> = {}) {
  const calls: string[] = [];
  const get: SafeGet = async (url) => {
    calls.push(url);
    const page = pages[url];
    if (!page) throw new Error('unreachable');
    return { url, contentType: page[0], body: Buffer.from(page[1]) };
  };
  return { get, calls };
}

async function setup({
  noKey = false,
  wrapFetch = (fn: typeof fetch) => fn,
  sites = fakeSites(),
}: {
  noKey?: boolean;
  wrapFetch?: (fn: typeof fetch) => typeof fetch;
  sites?: ReturnType<typeof fakeSites>;
} = {}) {
  const db = openDb(':memory:');
  const upstream = fakeFetch();
  const fetchFn = wrapFetch(upstream.fn);
  const app = await buildApp({
    db,
    lastfm: createLastfm({ apiKey: noKey ? undefined : 'test-key', db, fetch: fetchFn }),
    deezer: createDeezer({ db, fetch: fetchFn }),
    siteImages: createSiteImages({ db, safeGet: sites.get }),
    appUrl: 'http://localhost:5173',
    fetch: fetchFn,
  });
  return { app, db, upstream, sites };
}

// Parsed once: every happy-dom parse stays in `win`'s memory (~200 MB per run of the fixtures).
let fixture: ImportPayload;
let payload: ImportPayload;
beforeAll(async () => {
  fixture = await buildFixturePayload(2026, parseHtml);
});
beforeEach(() => {
  payload = structuredClone(fixture);
});

describe('results API', () => {
  it('stores an import and serves it back', async () => {
    const { app } = await setup();
    const post = await app.inject({ method: 'POST', url: '/api/results', payload: { payload } });
    expect(post.statusCode).toBe(201);
    const { id, token } = post.json();
    expect(id).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(token.length).toBeGreaterThan(20);

    const get = await app.inject({ method: 'GET', url: `/api/results/${id}` });
    expect(get.statusCode).toBe(200);
    expect(get.json().payload).toEqual(payload);
    expect(get.body).not.toContain(token);
  });

  it('rejects invalid payloads', async () => {
    const { app } = await setup();
    const bad = { ...payload, username: '<script>' };
    const res = await app.inject({ method: 'POST', url: '/api/results', payload: { payload: bad } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid-payload');
  });

  it('merges a re-run into the same result when the token matches', async () => {
    const { app } = await setup();
    const partial = {
      ...payload,
      concerts: payload.concerts.map((c, i) => (i < 10 ? c : { ...c, details: null })),
    };
    const first = (
      await app.inject({ method: 'POST', url: '/api/results', payload: { payload: partial } })
    ).json();

    const rerun = {
      ...payload,
      concerts: payload.concerts.map((c, i) => (i < 10 ? { ...c, details: null } : c)),
    };
    const second = await app.inject({
      method: 'POST',
      url: '/api/results',
      payload: { payload: rerun, mergeInto: { id: first.id, token: first.token } },
    });
    expect(second.json()).toMatchObject({ id: first.id, merged: true });
    const stored = (await app.inject({ url: `/api/results/${first.id}` })).json().payload as ImportPayload;
    expect(stored.concerts.every((c) => c.details)).toBe(true);
  });

  it('does not merge with a wrong token: creates a new result instead', async () => {
    const { app } = await setup();
    const first = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    const res = await app.inject({
      method: 'POST',
      url: '/api/results',
      payload: { payload, mergeInto: { id: first.id, token: 'guess' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).not.toBe(first.id);
  });

  it('404s unknown and malformed ids', async () => {
    const { app } = await setup();
    expect((await app.inject({ url: '/api/results/AAAAAAAAAA' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/results/..%2Fetc' })).statusCode).toBe(404);
  });
});

describe('deleting a result', () => {
  it('only with the owner token', async () => {
    const { app } = await setup();
    const { id, token } = (
      await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })
    ).json();
    const del = (t?: string) =>
      app.inject({ method: 'DELETE', url: `/api/results/${id}`, headers: t ? { 'x-result-token': t } : {} });
    expect((await del()).statusCode).toBe(403);
    expect((await del('guess')).statusCode).toBe(403);
    expect((await del(token)).statusCode).toBe(204);
    expect((await app.inject({ url: `/api/results/${id}` })).statusCode).toBe(404);
    expect((await del(token)).statusCode).toBe(404);
  });

  it('old results are purged after the retention period', async () => {
    const { app, db } = await setup();
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    db.raw.prepare('UPDATE results SET updated_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', id);
    expect(db.purgeOldResults(400)).toBe(1);
    expect(db.getResult(id)).toBeUndefined();
  });
});

describe('shared event details', () => {
  /** An import whose event details match its rows, as a real run would produce. */
  const consistent = (username: string, imageHash?: string): ImportPayload => ({
    ...payload,
    username,
    concerts: payload.concerts.map((c) => ({ ...c, details: detailsFor(c, imageHash) })),
  });
  const post = (app: Awaited<ReturnType<typeof setup>>['app'], p: ImportPayload) =>
    app.inject({ method: 'POST', url: '/api/results', payload: { payload: p } }).then((r) => r.json());
  const lookup = async (
    app: Awaited<ReturnType<typeof setup>>['app'],
    keys = payload.concerts.map(eventKey),
  ) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/events/lookup',
        headers: { origin: 'https://www.last.fm' },
        payload: { events: keys },
      })
    ).json().details as Record<string, unknown>;

  it('serves details once two different users read them identically', async () => {
    const { app } = await setup();
    await post(app, consistent('demo123'));
    await post(app, consistent('DEMO123')); // the same user again is not a second opinion
    expect(await lookup(app)).toEqual({});
    await post(app, consistent('otheruser01'));
    const got = await lookup(app);
    expect(Object.keys(got)).toHaveLength(payload.concerts.length);
    const first = payload.concerts[0]!;
    expect(got[eventKey(first)]).toEqual(detailsFor(first));
  });

  it('the version most users read wins; a tie gives nothing', async () => {
    const { app } = await setup();
    const other = 'f'.repeat(32);
    await post(app, consistent('user-a'));
    await post(app, consistent('user-b'));
    await post(app, consistent('user-c', other));
    await post(app, consistent('user-d', other));
    expect(await lookup(app)).toEqual({});
    await post(app, consistent('user-e', other));
    const first = payload.concerts[0]!;
    expect((await lookup(app))[eventKey(first)]).toEqual(detailsFor(first, other));
  });

  it('details that do not match their row, or came from the shared pool, are no vote', async () => {
    const { app } = await setup();
    // Fixture details rotate through a few real event pages, so most belong to other events.
    await post(app, { ...payload, username: 'user-a' });
    await post(app, { ...payload, username: 'user-b' });
    const genuine = payload.concerts.filter((c) => c.details && detailsMatchRow(c.details, c));
    expect(genuine.length).toBeLessThan(payload.concerts.length / 2);
    expect(Object.keys(await lookup(app)).sort()).toEqual(genuine.map(eventKey).sort());

    const fresh = (await setup()).app;
    const shared = (u: string) => ({
      ...consistent(u),
      concerts: consistent(u).concerts.map((c) => ({ ...c, sharedDetails: true })),
    });
    await post(fresh, shared('user-c'));
    await post(fresh, shared('user-d'));
    expect(await lookup(fresh)).toEqual({});
  });

  it('votes go with their results: deleted, forgotten, merged', async () => {
    const { app, db } = await setup();
    const a = await post(app, consistent('user-a'));
    await post(app, consistent('user-b'));
    expect(Object.keys(await lookup(app)).length).toBeGreaterThan(0);

    db.forgetUser('user-b');
    expect(await lookup(app)).toEqual({});
    db.purgeExpired();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM event_details').get()).toEqual({
      n: payload.concerts.length,
    });

    await post(app, consistent('user-b'));
    await app.inject({
      method: 'POST',
      url: '/api/results',
      payload: { payload: { ...consistent('user-a'), concerts: [] }, mergeInto: a },
    });
    expect(await lookup(app)).toEqual({}); // user-a's re-import lists no concerts any more

    db.forgetUser('user-a');
    db.forgetUser('user-b');
    db.purgeExpired();
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM event_details').get()).toEqual({ n: 0 });
  });

  it('CORS for last.fm pages only; bad input is refused', async () => {
    const { app } = await setup();
    const pre = await app.inject({
      method: 'OPTIONS',
      url: '/api/events/lookup',
      headers: { origin: 'https://www.last.fm', 'access-control-request-method': 'POST' },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-origin']).toBe('https://www.last.fm');
    expect(pre.headers['access-control-allow-headers']).toBe('content-type');
    const evil = await app.inject({
      method: 'POST',
      url: '/api/events/lookup',
      headers: { origin: 'https://notlast.fm.example' },
      payload: { events: ['event:1'] },
    });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    const bad = await app.inject({
      method: 'POST',
      url: '/api/events/lookup',
      payload: { events: ['event:1', '../etc'] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('results stored before the upgrade vote too', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lastyear-'));
    try {
      const path = join(dir, 'old.db');
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE results (id TEXT PRIMARY KEY, username TEXT NOT NULL, year INTEGER NOT NULL,
                  payload TEXT NOT NULL, token_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
                PRAGMA user_version = 1;`);
      const add = old.prepare('INSERT INTO results VALUES (?, ?, 2026, ?, ?, ?, ?)');
      const now = new Date().toISOString();
      add.run('aaaaaa', 'user-a', JSON.stringify(consistent('user-a')), 'x', now, now);
      add.run('bbbbbb', 'user-b', JSON.stringify(consistent('user-b')), 'x', now, now);
      add.run('cccccc', 'user-c', '{}', 'x', now, now);
      old.close();
      const db = openDb(path);
      expect(Object.keys(db.sharedEventDetails(payload.concerts.map(eventKey)))).toHaveLength(
        payload.concerts.length,
      );
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('headers', () => {
  it('security headers everywhere, noindex on results and API', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/api/results/AAAAAAAAAA' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-robots-tag']).toBe('noindex');
    const js = await app.inject({ url: '/b.js' });
    expect(js.headers['cross-origin-resource-policy']).toBeUndefined(); // last.fm must load it
  });
});

describe('lookups', () => {
  it('user info, cached', async () => {
    const { app, upstream } = await setup();
    const a = await app.inject({ url: '/api/user/demo123' });
    expect(a.json()).toMatchObject({
      name: 'demo123',
      playcount: 123456,
      image: 'https://lastfm.freetls.fastly.net/i/u/300x300/a.png',
    });
    await app.inject({ url: '/api/user/DEMO123' });
    expect(upstream.calls.filter((c) => c.includes('user.getinfo'))).toHaveLength(1);
    expect((await app.inject({ url: '/api/user/nobody' })).statusCode).toBe(404);
  });

  it('503 with a clear error when the Last.fm key is missing', async () => {
    const { app } = await setup({ noKey: true });
    const res = await app.inject({ url: '/api/user/demo123' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'lastfm-key-missing' });
  });

  it('tags for several artists, cleaned and cached', async () => {
    const { app, upstream } = await setup();
    const res = await app.inject({ url: '/api/tags?artist=Anchoress&artist=NYOS&artist=Anchoress' });
    expect(res.json().tags).toEqual({
      Anchoress: [
        { name: 'post-punk', count: 100 },
        { name: 'darkwave', count: 40 },
      ],
      NYOS: [
        { name: 'post-punk', count: 100 },
        { name: 'darkwave', count: 40 },
      ],
    });
    await app.inject({ url: '/api/tags?artist=Anchoress' });
    expect(upstream.calls.filter((c) => c.includes('gettoptags'))).toHaveLength(2);
  });

  it('year scrobble chart: one request for the whole year, cached', async () => {
    const { app, upstream } = await setup();
    const res = await app.inject({ url: '/api/scrobbles/demo123/2025' });
    expect(res.json()).toEqual({
      artists: [
        { name: 'Dropkick Murphys', playcount: 630 },
        { name: 'ist ist', playcount: 140 },
      ],
      capped: false,
    });
    const call = upstream.calls.find((c) => c.includes('getweeklyartistchart'))!;
    expect(call).toContain(`from=${Date.UTC(2025, 0, 1) / 1000}`);
    expect(call).toContain(`to=${Date.UTC(2026, 0, 1) / 1000 - 1}`);
    await app.inject({ url: '/api/scrobbles/DEMO123/2025' });
    expect(upstream.calls.filter((c) => c.includes('getweeklyartistchart'))).toHaveLength(1);
    expect((await app.inject({ url: '/api/scrobbles/demo123/1999' })).statusCode).toBe(400);
  });

  it('photos from Deezer, exact name only', async () => {
    const { app } = await setup();
    const res = await app.inject({ url: '/api/photos?artist=Anchoress&artist=Someone+Else' });
    expect(res.json().photos).toEqual({
      Anchoress: 'https://cdn-images.dzcdn.net/images/artist/abc/1000x1000.jpg',
      'Someone Else': null,
    });
  });
});

describe('story image', () => {
  it('renders a PNG for every template, with or without photos', { timeout: 60_000 }, async () => {
    const { app } = await setup();
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    const keys = payload.concerts.slice(0, 3).map((c) => `k=${encodeURIComponent(`${c.kind}:${c.id}`)}`);
    for (const t of TEMPLATES.map((x) => x.id)) {
      const res = await app.inject({ url: `/api/story/${id}.png?t=${t}&${keys.join('&')}` });
      expect(res.statusCode, t).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.rawPayload.subarray(1, 4).toString()).toBe('PNG');
    }
    const dl = await app.inject({ url: `/api/story/${id}.png?t=index&${keys[0]}&download=1` });
    expect(dl.headers['content-disposition']).toBe('attachment; filename="lastyear-demo123-2026-index.png"');
  });

  it('rejects bad input', async () => {
    const { app } = await setup();
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    expect((await app.inject({ url: `/api/story/${id}.png?t=nope&k=event:1` })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/story/${id}.png?t=index&k=<script>` })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/story/${id}.png?t=index` })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/story/AAAAAAAAAA.png?t=index&k=event:1' })).statusCode).toBe(404);
  });

  it('does not cache a story whose photo failed to load, and retries the photo next time', async () => {
    const photo = 'https://lastfm-img.freetls.fastly.net/i/u/ar0/0123456789abcdef0123456789abcdef.jpg';
    const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#808080' } })
      .jpeg()
      .toBuffer();
    let cdnUp = false;
    const { app } = await setup({
      wrapFetch: (fn) =>
        (async (input: string | URL, init?: RequestInit) =>
          String(input) !== photo
            ? fn(input, init)
            : cdnUp
              ? new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } })
              : new Response('busy', { status: 503 })) as typeof fetch,
    });
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    const k = `${payload.concerts[0]!.kind}:${payload.concerts[0]!.id}`;
    const url = `/api/story/${id}.png?t=poster&k=${k}&ph=${encodeURIComponent(photo)}`;

    const down = await app.inject({ url });
    expect(down.statusCode).toBe(200);
    expect(down.headers['cache-control']).toBe('no-store');

    cdnUp = true;
    const up = await app.inject({ url });
    expect(up.headers['cache-control']).toBe('public, max-age=600');
    expect(up.rawPayload.equals(down.rawPayload)).toBe(false);
  });

  it('finds a photo at its other CDN address when one edge answers 404', async () => {
    const hash = 'abcdef0123456789abcdef0123456789';
    const photo = `https://lastfm-img.freetls.fastly.net/i/u/ar0/${hash}.jpg`;
    const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#808080' } })
      .jpeg()
      .toBuffer();
    const asked: string[] = [];
    const { app } = await setup({
      wrapFetch: (fn) =>
        (async (input: string | URL, init?: RequestInit) => {
          const u = String(input);
          if (!u.includes(hash)) return fn(input, init);
          asked.push(u);
          return u.startsWith('https://lastfm.freetls')
            ? new Response(new Uint8Array(jpeg), { headers: { 'content-type': 'image/jpeg' } })
            : new Response('not found', { status: 404 });
        }) as typeof fetch,
    });
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    const k = `${payload.concerts[0]!.kind}:${payload.concerts[0]!.id}`;
    const res = await app.inject({
      url: `/api/story/${id}.png?t=poster&k=${k}&ph=${encodeURIComponent(photo)}`,
    });
    expect(res.headers['cache-control']).toBe('public, max-age=600');
    expect(asked).toEqual([photo, photo.replace('lastfm-img.', 'lastfm.')]);
  });

  it('never fetches photos from hosts outside the allowlist', async () => {
    const { app, upstream } = await setup();
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    const k = `${payload.concerts[0]!.kind}:${payload.concerts[0]!.id}`;
    const res = await app.inject({
      url: `/api/story/${id}.png?t=index&k=${k}&ph=${encodeURIComponent('https://evil.example/x.jpg')}`,
    });
    expect(res.statusCode).toBe(200);
    expect(upstream.calls.some((c) => c.includes('evil'))).toBe(false);
  });
});

describe('festival website pictures', () => {
  const SITE = 'https://www.grauzonefestival.nl/';
  const OG = 'https://images.example.org/poster.jpg';
  const grauzone = async () => {
    const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#335' } })
      .jpeg()
      .toBuffer();
    return fakeSites({
      [SITE]: [
        'text/html; charset=utf-8',
        `<html><head><meta property="og:image" content="${OG}"></head></html>`,
      ],
      [OG]: ['image/jpeg', jpeg],
    });
  };

  it('are fetched once per website, for festivals of a stored result, and served from our origin', async () => {
    const sites = await grauzone();
    const { app } = await setup({ sites });
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    const res = await app.inject({ url: `/api/results/${id}/site-images` });
    expect(res.statusCode).toBe(200);
    const path = res.json().images[SITE] as string;
    expect(path).toMatch(/^\/api\/site-image\/[0-9a-f]{32}\.jpg$/);
    expect(sites.calls).toEqual([SITE, OG]);

    const img = await app.inject({ url: path });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    expect((await sharp(img.rawPayload).metadata()).height).toBe(1000);

    await app.inject({ url: `/api/results/${id}/site-images` });
    expect(sites.calls).toHaveLength(2); // cached
    expect(
      (await app.inject({ url: '/api/site-image/0123456789abcdef0123456789abcdef.jpg' })).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: '/api/results/AAAAAAAAAA/site-images' })).statusCode).toBe(404);
  });

  it('a site without a usable picture gives null', async () => {
    const tiny = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    const sites = fakeSites({
      [SITE]: ['text/html', `<meta name="twitter:image" content="/icon.png">`],
      'https://www.grauzonefestival.nl/icon.png': ['image/png', tiny],
    });
    const { app } = await setup({ sites });
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    expect((await app.inject({ url: `/api/results/${id}/site-images` })).json().images).toEqual({
      [SITE]: null,
    });
    expect(sites.calls).toEqual([SITE, 'https://www.grauzonefestival.nl/icon.png']);
  });

  it(
    'the story uses the website picture for a festival, chosen or automatic',
    { timeout: 30_000 },
    async () => {
      const sites = await grauzone();
      const { app } = await setup({ sites });
      const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
      const fest = payload.concerts.find((c) => c.kind === 'festival' && c.details?.website)!;
      const k = `k=${encodeURIComponent(`festival:${fest.id}`)}`;
      const auto = await app.inject({ url: `/api/story/${id}.png?t=poster&${k}` });
      expect(auto.statusCode).toBe(200);
      expect(auto.headers['cache-control']).toBe('public, max-age=600'); // the photo loaded
      expect(sites.calls).toEqual([SITE, OG]);

      const path = (await app.inject({ url: `/api/results/${id}/site-images` })).json().images[
        SITE
      ] as string;
      const chosen = await app.inject({
        url: `/api/story/${id}.png?t=index&${k}&ph=${encodeURIComponent(path)}`,
      });
      expect(chosen.headers['cache-control']).toBe('public, max-age=600');

      // Another concert cannot borrow it, and an unknown site path is ignored rather than rendered.
      const ev = payload.concerts.find((c) => c.kind === 'event')!;
      const other = await app.inject({
        url: `/api/story/${id}.png?t=index&k=${encodeURIComponent(`event:${ev.id}`)}&ph=${encodeURIComponent(path)}`,
      });
      expect(other.statusCode).toBe(200);
    },
  );
});

describe('bookmarklet', () => {
  it('serves the standalone and loader bookmarklets for the app url', async () => {
    const { app } = await setup();
    const res = (await app.inject({ url: '/api/bookmarklet' })).json();
    expect(res.standalone).toMatch(/^javascript:/);
    expect(decodeURIComponent(res.standalone)).toContain('http://localhost:5173/import#');
    expect(decodeURIComponent(res.loader)).toContain('http://localhost:5173/b.js?');
    const js = await app.inject({ url: '/b.js' });
    expect(js.headers['content-type']).toContain('javascript');
  });
});

describe('helpers', () => {
  it('cleanTags drops personal, decade and low-weight tags', () => {
    expect(
      cleanTags(
        [
          { name: 'Shoegaze', count: 100 },
          { name: 'seen live', count: 90 },
          { name: '90s', count: 50 },
          { name: 'slowdive', count: 40 },
          { name: 'dream pop', count: 30 },
          { name: 'meh', count: 3 },
        ],
        'Slowdive',
      ),
    ).toEqual([
      { name: 'shoegaze', count: 100 },
      { name: 'dream pop', count: 30 },
    ]);
  });

  it('pickPhoto matches names loosely but exactly, skips missing photos, prefers popular', () => {
    const xl = (h: string) => `https://cdn-images.dzcdn.net/images/artist/${h}/1000x1000.jpg`;
    expect(
      pickPhoto('The Kooks', [
        { name: 'Kooks Tribute', nb_fan: 999, picture_xl: xl('t') },
        {
          name: 'Kooks',
          nb_fan: 10,
          picture_xl: 'https://cdn-images.dzcdn.net/images/artist//1000x1000.jpg',
        },
        { name: 'The Kooks', nb_fan: 500, picture_xl: xl('k') },
      ]),
    ).toBe(xl('k'));
    expect(pickPhoto('Róisín Murphy', [{ name: 'Roisin Murphy', picture_xl: xl('r') }])).toBe(xl('r'));
    expect(pickPhoto('Nobody', [{ name: 'Somebody', picture_xl: xl('s') }])).toBeNull();
  });
});
