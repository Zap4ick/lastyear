import { describe, expect, it } from 'vitest';
import type { Concert } from '../shared/types.ts';
import {
  concertKey,
  loadPicks,
  movePick,
  photoOptions,
  resolvePhoto,
  sanitizePicks,
  savePicks,
  setPhoto,
  togglePick,
  type Pick,
} from './picks.ts';

const img = (h: string) => `https://lastfm.freetls.fastly.net/i/u/ar0/${h.repeat(32).slice(0, 32)}.jpg`;
const p = (key: string, photo: string | null = null): Pick => ({ key, photo });

const concert = (over: Partial<Concert> = {}): Concert => ({
  id: '1',
  kind: 'event',
  url: '/event/1',
  date: '2026-03-23',
  title: 'ist ist',
  lineup: ['Grandmono'],
  venue: 'Hydrozagadka',
  city: 'Warszawa',
  country: 'Poland',
  status: '',
  details: {
    title: 'ist ist',
    date: '2026-03-23',
    performers: [
      { name: 'ist ist', url: '/music/ist+ist', imageUrl: img('a') },
      { name: 'Grandmono', url: '/music/Grandmono', imageUrl: null },
      { name: 'Third', url: '/music/Third', imageUrl: img('b') },
    ],
    lineupTotal: 3,
    headerImageUrl: img('c'),
    venue: null,
  },
  ...over,
});

describe('togglePick', () => {
  it('fills slots in order and unpicks on a second tap', () => {
    let picks: Pick[] = [];
    for (const k of ['a', 'b', 'c']) picks = togglePick(picks, k).picks;
    expect(picks.map((x) => x.key)).toEqual(['a', 'b', 'c']);
    picks = togglePick(picks, 'b').picks;
    expect(picks.map((x) => x.key)).toEqual(['a', 'c']);
  });

  it('refuses a fourth pick and says so', () => {
    const full = [p('a'), p('b'), p('c')];
    expect(togglePick(full, 'd')).toEqual({ picks: full, full: true });
  });

  it('respects a smaller max (fewer than 3 concerts)', () => {
    expect(togglePick([p('a')], 'b', 1).full).toBe(true);
  });
});

describe('movePick', () => {
  it('reorders, ignoring out-of-range moves', () => {
    const picks = [p('a'), p('b'), p('c')];
    expect(movePick(picks, 2, 0).map((x) => x.key)).toEqual(['c', 'a', 'b']);
    expect(movePick(picks, 0, 1).map((x) => x.key)).toEqual(['b', 'a', 'c']);
    expect(movePick(picks, 0, 5)).toBe(picks);
  });
});

describe('photos', () => {
  it('lists performer images, header image and the fallback, without duplicates or placeholders', () => {
    const opts = photoOptions(concert(), 'https://cdn-images.dzcdn.net/images/artist/x/1000x1000.jpg');
    expect(opts.map((o) => o.label)).toEqual(['ist ist', 'Third', 'Event image', 'ist ist · Deezer']);
    expect(photoOptions(concert(), img('a'))).toHaveLength(3); // fallback equal to an existing one
  });

  it('works without event details (only the fallback)', () => {
    const c = concert({ details: null, title: 'NYOS' });
    expect(photoOptions(c)).toEqual([]);
    expect(photoOptions(c, 'https://x/y.jpg')).toEqual([{ url: 'https://x/y.jpg', label: 'NYOS · Deezer' }]);
  });

  it('events: the headliner stays the default, the poster comes right after', () => {
    const c = concert();
    c.details!.posterUrl = img('d');
    expect(photoOptions(c).map((o) => o.label)).toEqual(['ist ist', 'Poster', 'Third', 'Event image']);
    c.details!.performers[0]!.imageUrl = null; // headliner without a photo: the poster beats a support act
    expect(photoOptions(c).map((o) => o.label)).toEqual(['Poster', 'Third', 'Event image']);
  });

  it('festival: poster, then the website picture, before any performer', () => {
    const site = '/api/site-image/0123456789abcdef0123456789abcdef.jpg';
    const c = concert({ kind: 'festival', title: 'Grauzone Festival 2026' });
    expect(photoOptions(c, null, site).map((o) => o.label)).toEqual([
      'Festival website',
      'ist ist',
      'Third',
      'Event image',
    ]);
    c.details!.posterUrl = img('d');
    expect(photoOptions(c, null, site)[0]).toEqual({ url: img('d'), label: 'Poster' });
    // Events never take a website picture.
    expect(photoOptions(concert(), null, site).some((o) => o.url === site)).toBe(false);
  });

  it('resolvePhoto: chosen if still offered, else the first option', () => {
    const opts = photoOptions(concert());
    expect(resolvePhoto(p('k', img('b')), opts)).toBe(img('b'));
    expect(resolvePhoto(p('k', 'https://gone/x.jpg'), opts)).toBe(img('a'));
    expect(resolvePhoto(p('k'), [])).toBeNull();
    expect(setPhoto([p('k'), p('j')], 'k', img('b'))).toEqual([p('k', img('b')), p('j')]);
  });
});

describe('persistence', () => {
  it('sanitizes stored picks: unknown keys, duplicates, junk, non-https photos, over max', () => {
    const valid = new Set(['event:1', 'event:2', 'festival:3', 'event:4']);
    const raw = [
      { key: 'event:1', photo: 'javascript:alert(1)' },
      { key: 'event:9' },
      'junk',
      { key: 'event:1' },
      { key: 'festival:3', photo: img('a') },
      { key: 'event:2' },
      { key: 'event:4' },
    ];
    expect(sanitizePicks(raw, valid)).toEqual([p('event:1'), p('festival:3', img('a')), p('event:2')]);
    expect(sanitizePicks({ not: 'an array' }, valid)).toEqual([]);
  });

  it('round-trips through localStorage per result', () => {
    const valid = new Set(['event:1', 'event:2']);
    savePicks('R1', [p('event:2'), p('event:1', img('a'))]);
    expect(loadPicks('R1', valid)).toEqual([p('event:2'), p('event:1', img('a'))]);
    expect(loadPicks('R2', new Set(['event:1', 'event:2', 'event:3', 'event:4']))).toEqual([]);
  });

  it('pre-picks every concert when there are no more than the slots and nothing is saved', () => {
    const valid = new Set(['event:5', 'festival:6']);
    expect(loadPicks('R3', valid)).toEqual([p('event:5'), p('festival:6')]);
    savePicks('R3', []);
    expect(loadPicks('R3', valid)).toEqual([]); // the user's own choice, even empty, wins
  });

  it('concertKey', () => {
    expect(concertKey(concert({ kind: 'festival', id: '42' }))).toBe('festival:42');
    expect(concertKey(p('event:7'))).toBe('event:7');
  });
});
