/** Last.fm web API (ws.audioscrobbler.com): user info and artist tags. Needs LASTFM_API_KEY. */
import type { ScrobbleChart } from '../shared/stats.ts';
import type { Db } from './db.ts';

export interface LastfmUser {
  name: string;
  realname: string | null;
  url: string;
  image: string | null;
  playcount: number;
  registered: string | null;
}

export interface Tag {
  name: string;
  /** Relative weight, 0–100 (100 = the artist's top tag). */
  count: number;
}

export class LastfmError extends Error {
  constructor(
    public readonly code: 'no-key' | 'not-found' | 'upstream',
    message: string,
  ) {
    super(message);
  }
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Tags that say nothing about genre. Matched after lowercasing; tags that are only years/decades of
 * listening ("2019"), personal ("seen live") or meta ("under 2000 listeners") are dropped.
 */
const TAG_STOPLIST = new Set([
  'seen live',
  'favorites',
  'favourites',
  'favorite',
  'favourite',
  'my favorite',
  'love',
  'awesome',
  'beautiful',
  'albums i own',
  'spotify',
  'check out',
  'under 2000 listeners',
  'all',
  'male vocalists',
  'female vocalists',
  'female vocalist',
  'male vocalist',
  'singer-songwriter',
  'british',
  'american',
  'uk',
  'usa',
  'polish',
  'german',
  'french',
  'swedish',
  'canadian',
  'australian',
  'irish',
  'english',
  'russian',
  'belarusian',
  'ukrainian',
  'dutch',
  'netherlands',
  'australia',
  'poland',
  'polska',
  'germany',
  'deutsch',
]);

export function cleanTags(tags: Tag[], artist: string): Tag[] {
  const a = artist.toLowerCase();
  return tags
    .map((t) => ({ name: t.name.toLowerCase().trim(), count: t.count }))
    .filter(
      (t) =>
        t.name && t.count >= 5 && !TAG_STOPLIST.has(t.name) && t.name !== a && !/^\d{2,4}s?$/.test(t.name),
    )
    .slice(0, 8);
}

export function createLastfm(opts: { apiKey: string | undefined; db: Db; fetch?: typeof fetch }) {
  const doFetch = opts.fetch ?? fetch;

  async function call(params: Record<string, string>): Promise<Record<string, unknown>> {
    if (!opts.apiKey) throw new LastfmError('no-key', 'LASTFM_API_KEY is not set');
    const url = new URL('https://ws.audioscrobbler.com/2.0/');
    for (const [k, v] of Object.entries({ ...params, api_key: opts.apiKey, format: 'json' })) {
      url.searchParams.set(k, v);
    }
    const res = await doFetch(url, {
      headers: { 'User-Agent': 'lastfmyear/0.1' },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // Last.fm reports errors in the body: 6 = not found, 10/26 = bad key, 29 = rate limit.
    if (body.error === 6) throw new LastfmError('not-found', String(body.message ?? 'Not found'));
    if (!res.ok || body.error)
      throw new LastfmError('upstream', String(body.message ?? `HTTP ${res.status}`));
    return body;
  }

  return {
    async getUser(name: string): Promise<LastfmUser> {
      const key = `lastfm:user:${name.toLowerCase()}`;
      const cached = opts.db.cacheGet<LastfmUser>(key);
      if (cached) return cached;
      const body = await call({ method: 'user.getinfo', user: name });
      const u = body.user as {
        name: string;
        realname?: string;
        url: string;
        playcount?: string;
        image?: { '#text': string; size: string }[];
        registered?: { unixtime?: string };
      };
      const image = u.image?.findLast((i) => i['#text'])?.['#text'] || null;
      const user: LastfmUser = {
        name: u.name,
        realname: u.realname || null,
        url: u.url,
        image,
        playcount: Number(u.playcount ?? 0),
        registered: u.registered?.unixtime
          ? new Date(Number(u.registered.unixtime) * 1000).toISOString()
          : null,
      };
      opts.db.cacheSet(key, user, DAY);
      return user;
    },

    async getTags(artist: string): Promise<Tag[]> {
      const key = `lastfm:tags:${artist.toLowerCase()}`;
      const cached = opts.db.cacheGet<Tag[]>(key);
      if (cached) return cached;
      let tags: Tag[] = [];
      try {
        const body = await call({ method: 'artist.gettoptags', artist, autocorrect: '1' });
        const raw = ((body.toptags as { tag?: { name: string; count: number }[] })?.tag ?? []).map((t) => ({
          name: t.name,
          count: Number(t.count),
        }));
        tags = cleanTags(raw, artist);
      } catch (e) {
        if (!(e instanceof LastfmError && e.code === 'not-found')) throw e;
      }
      opts.db.cacheSet(key, tags, 30 * DAY);
      return tags;
    },

    /**
     * Artists the user scrobbled during a calendar year, most played first. One request: the weekly
     * artist chart accepts an arbitrary from/to range. Last.fm caps it at 1000 artists.
     */
    async getYearChart(user: string, year: number): Promise<ScrobbleChart> {
      const key = `lastfm:chart:${user.toLowerCase()}:${year}`;
      const cached = opts.db.cacheGet<ScrobbleChart>(key);
      if (cached) return cached;
      const from = Date.UTC(year, 0, 1) / 1000;
      const yearEnd = Date.UTC(year + 1, 0, 1) / 1000 - 1;
      const to = Math.min(yearEnd, Math.floor(Date.now() / 1000));
      const body = await call({
        method: 'user.getweeklyartistchart',
        user,
        from: String(from),
        to: String(to),
      });
      const raw =
        (body.weeklyartistchart as { artist?: { name: string; playcount: string }[] })?.artist ?? [];
      const chart: ScrobbleChart = {
        artists: raw.map((a) => ({ name: a.name, playcount: Number(a.playcount) })),
        capped: raw.length >= 1000,
      };
      const finished = to === yearEnd;
      opts.db.cacheSet(key, chart, finished ? 30 * DAY : DAY / 4);
      return chart;
    },
  };
}

export type Lastfm = ReturnType<typeof createLastfm>;
