// @vitest-environment node
import { Window } from 'happy-dom';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildFixturePayload } from '../shared/parse/fixture-payload.ts';
import type { ImportPayload } from '../shared/types.ts';
import { TEMPLATES } from '../story/templates/index.ts';
import { buildApp } from './app.ts';
import { openDb } from './db.ts';
import { createDeezer, pickPhoto } from './deezer.ts';
import { cleanTags, createLastfm } from './lastfm.ts';

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

async function setup({ noKey = false } = {}) {
  const db = openDb(':memory:');
  const upstream = fakeFetch();
  const app = await buildApp({
    db,
    lastfm: createLastfm({ apiKey: noKey ? undefined : 'test-key', db, fetch: upstream.fn }),
    deezer: createDeezer({ db, fetch: upstream.fn }),
    appUrl: 'http://localhost:5173',
    fetch: upstream.fn,
  });
  return { app, db, upstream };
}

let payload: ImportPayload;
beforeEach(async () => {
  payload = await buildFixturePayload(2026, parseHtml);
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
    expect(dl.headers['content-disposition']).toBe(
      'attachment; filename="lastfmyear-demo123-2026-index.png"',
    );
  });

  it('rejects bad input', async () => {
    const { app } = await setup();
    const { id } = (await app.inject({ method: 'POST', url: '/api/results', payload: { payload } })).json();
    expect((await app.inject({ url: `/api/story/${id}.png?t=nope&k=event:1` })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/story/${id}.png?t=index&k=<script>` })).statusCode).toBe(400);
    expect((await app.inject({ url: `/api/story/${id}.png?t=index` })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/story/AAAAAAAAAA.png?t=index&k=event:1' })).statusCode).toBe(404);
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
