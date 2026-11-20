/**
 * Fallback artist photos from Deezer's public search API (no key). Used when last.fm gave us no
 * photo: an event page that could not be loaded, or an artist with last.fm's placeholder image.
 */
import type { Db } from './db.ts';

const DAY = 24 * 60 * 60 * 1000;

interface DeezerArtist {
  name: string;
  nb_fan?: number;
  picture_xl?: string;
}

/** Deezer returns ".../images/artist//1000x1000-..." (empty hash) for artists without a photo. */
const hasPhoto = (a: DeezerArtist) => !!a.picture_xl && !a.picture_xl.includes('/artist//');

const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Only accept an exact (normalized) name match; among those, the most popular one with a photo. */
export function pickPhoto(artist: string, candidates: DeezerArtist[]): string | null {
  const want = normalize(artist);
  const matches = candidates.filter((c) => normalize(c.name) === want && hasPhoto(c));
  matches.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0));
  return matches[0]?.picture_xl ?? null;
}

export function createDeezer(opts: { db: Db; fetch?: typeof fetch }) {
  const doFetch = opts.fetch ?? fetch;
  return {
    async getPhoto(artist: string): Promise<string | null> {
      const key = `deezer:photo:${artist.toLowerCase()}`;
      const cached = opts.db.cacheGet<{ url: string | null }>(key);
      if (cached) return cached.url;
      const url = new URL('https://api.deezer.com/search/artist');
      url.searchParams.set('q', artist);
      url.searchParams.set('limit', '10');
      const res = await doFetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Deezer HTTP ${res.status}`);
      const body = (await res.json()) as { data?: DeezerArtist[]; error?: unknown };
      if (body.error) throw new Error('Deezer error');
      const photo = pickPhoto(artist, body.data ?? []);
      opts.db.cacheSet(key, { url: photo }, (photo ? 30 : 7) * DAY);
      return photo;
    },
  };
}

export type Deezer = ReturnType<typeof createDeezer>;
