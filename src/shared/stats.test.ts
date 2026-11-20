import { describe, expect, it } from 'vitest';
import { buildFixturePayload } from './parse/fixture-payload.ts';
import { parseHtml } from './parse/test-utils.ts';
import { artistsForTags, computeStats, nameKey, performersOf, type ScrobbleChart } from './stats.ts';
import type { Concert, ImportPayload } from './types.ts';

let seq = 0;
function gig(
  date: string,
  performers: string[],
  where: [venue: string, city: string, country?: string],
  opts: { festival?: boolean; noDetails?: boolean; title?: string } = {},
): Concert {
  const [venue, city, country = 'Poland'] = where;
  return {
    id: String(++seq),
    kind: opts.festival ? 'festival' : 'event',
    url: `/event/${seq}`,
    date,
    title: opts.title ?? performers[0]!,
    lineup: performers.slice(1),
    venue,
    city,
    country,
    status: '',
    details: opts.noDetails
      ? null
      : {
          title: opts.title ?? performers[0]!,
          date,
          performers: performers.map((name) => ({
            name,
            url: `/music/${encodeURIComponent(name)}`,
            imageUrl: null,
          })),
          lineupTotal: performers.length,
          headerImageUrl: null,
          venue: { name: venue, street: null, city, country },
        },
  };
}

const payload = (concerts: Concert[]): ImportPayload => ({
  v: 1,
  username: 'tester',
  year: 2026,
  collectedAt: '2026-11-19T00:00:00.000Z',
  wentTo: concerts.length,
  concerts,
  warnings: [],
});

const year = payload([
  gig('2026-01-16', ['Anchoress', 'Flower and Pines'], ['2KOŁA Pub Motocyklowy', 'Warszawa']),
  gig('2026-02-06', ['Alessandro Adriani', 'Budgie', 'Anchoress'], ['Paard', 'Den Haag', 'Netherlands'], {
    festival: true,
    title: 'Grauzone Festival 2026',
  }),
  gig('2026-03-23', ['ist ist', 'Anchoress'], ['Hydrozagadka', 'Warszawa']),
  gig('2026-03-29', ['Ist Ist'], ['hydrozagadka', 'warszawa']), // same band and venue, different spelling
  gig('2026-05-10', ['The Murder Capital'], ['Proxima', 'Warszawa']),
  gig('2026-06-01', ['Murder Capital', 'Flower and Pines'], ['Lucerna', 'Praha', 'Czechia']),
  gig('2026-09-12', ["Oasis Live '25"], ['Hydrozagadka', 'Warszawa'], {
    noDetails: true,
    title: "Oasis Live '25",
  }),
]);

describe('computeStats', () => {
  const s = computeStats(year);

  it('counts concerts and festivals', () => {
    expect(s.concerts).toBe(7);
    expect(s.festivals).toBe(1);
    expect(s.missingDetails).toBe(1);
    expect(s.first).toEqual({ date: '2026-01-16', title: 'Anchoress' });
    expect(s.last).toEqual({ date: '2026-09-12', title: "Oasis Live '25" });
  });

  it('finds repeats across spellings, without festival line-ups', () => {
    // Same count: whoever headlined more comes first.
    expect(s.repeats.map((r) => [r.name, r.count, r.asHeadliner])).toEqual([
      ['ist ist', 2, 2],
      ['The Murder Capital', 2, 2], // "The Murder Capital" = "Murder Capital"
      ['Anchoress', 2, 1], // headlined once, supported once; the festival does not count
      ['Flower and Pines', 2, 0],
    ]);
    expect(s.repeats[0]!.dates).toEqual(['2026-03-23', '2026-03-29']);
  });

  it('counts distinct artists (festival line-up excluded)', () => {
    // Anchoress, Flower and Pines, ist ist, The Murder Capital, Oasis Live '25 (title guess)
    expect(s.artistsSeen).toBe(5);
    expect(s.headlinersSeen).toBe(4);
  });

  it('merges venue spellings and picks the top venue', () => {
    expect(s.topVenue).toEqual({ name: 'Hydrozagadka', city: 'Warszawa', count: 3 });
    expect(s.venues).toHaveLength(5);
  });

  it('finds the home city and away concerts', () => {
    expect(s.homeCity).toBe('Warszawa');
    expect(s.cities.map((c) => [c.name, c.count])).toEqual([
      ['Warszawa', 5],
      ['Den Haag', 1],
      ['Praha', 1],
    ]);
    expect(s.awayConcerts).toBe(2);
    expect(s.countries.map((c) => c.name)).toEqual(['Poland', 'Netherlands', 'Czechia']);
  });

  it('busiest month', () => {
    expect(s.months).toEqual([1, 1, 2, 0, 1, 1, 0, 0, 1, 0, 0, 0]);
    expect(s.busiestMonth).toEqual({ months: [3], count: 2 });
  });

  it('busiest month ties list every month', () => {
    const p = payload([gig('2026-02-01', ['A'], ['X', 'Y']), gig('2026-08-01', ['B'], ['X', 'Y'])]);
    expect(computeStats(p).busiestMonth).toEqual({ months: [2, 8], count: 1 });
  });

  it('no top venue when every venue appears once', () => {
    const one = computeStats(
      payload([gig('2026-01-01', ['A'], ['X', 'Y']), gig('2026-01-02', ['B'], ['Z', 'Y'])]),
    );
    expect(one.topVenue).toBeNull();
    expect(one.repeats).toEqual([]);
  });

  it('handles an empty year', () => {
    const empty = computeStats(payload([]));
    expect(empty).toMatchObject({
      concerts: 0,
      homeCity: null,
      busiestMonth: null,
      first: null,
      topVenue: null,
    });
  });
});

describe('genres', () => {
  it('weights headliners fully and support acts half; merges spellings', () => {
    const s = computeStats(year, {
      tags: {
        'ist ist': [
          { name: 'post-punk', count: 100 },
          { name: 'new wave', count: 26 },
        ],
        'The Murder Capital': [{ name: 'Post Punk', count: 100 }],
        Anchoress: [{ name: 'hardcore', count: 100 }],
        'flower and pines': [{ name: 'shoegaze', count: 100 }], // support only → 0.5; key matched case-insensitively
        Budgie: [{ name: 'hard rock', count: 100 }], // festival only → ignored
      },
    });
    expect(s.genres).toEqual([
      { name: 'post-punk', score: 2 },
      { name: 'hardcore', score: 1 },
      { name: 'shoegaze', score: 0.5 },
      { name: 'new wave', score: 0.26 },
    ]);
  });
});

describe('scrobbles', () => {
  const chart: ScrobbleChart = {
    capped: false,
    artists: [
      { name: 'Dropkick Murphys', playcount: 630 },
      { name: 'Ist Ist', playcount: 140 },
      { name: 'Murder Capital', playcount: 90 },
      { name: 'Anchoress', playcount: 31 },
      { name: 'Flower and Pines', playcount: 2 },
    ],
  };

  it('top artists seen live, most played seen, surprise headliner', () => {
    const s = computeStats(year, { chart, topN: 3 }).scrobbles!;
    expect(s.topSeen).toEqual([
      { rank: 2, name: 'Ist Ist', playcount: 140 },
      { rank: 3, name: 'Murder Capital', playcount: 90 },
    ]);
    expect(s.mostPlayedSeen).toEqual({ name: 'ist ist', playcount: 140 });
    // "Oasis Live '25" headlined (title guess) and has 0 plays.
    expect(s.surprise).toEqual({ name: "Oasis Live '25", playcount: 0, date: '2026-09-12' });
  });

  it('with a capped chart, a missing headliner has unknown (few) plays', () => {
    const s = computeStats(year, { chart: { ...chart, capped: true } }).scrobbles!;
    expect(s.surprise).toEqual({ name: "Oasis Live '25", playcount: null, date: '2026-09-12' });
  });

  it('no surprise when every headliner was played a lot', () => {
    const p = payload([gig('2026-01-01', ['Ist Ist'], ['X', 'Y'])]);
    expect(computeStats(p, { chart }).scrobbles!.surprise).toBeNull();
  });
});

describe('helpers', () => {
  it('nameKey', () => {
    expect(nameKey('The Murder Capital')).toBe(nameKey('murder capital'));
    expect(nameKey('Róisín Murphy')).toBe(nameKey('Roisin Murphy'));
    expect(nameKey('Simon & Garfunkel')).toBe(nameKey('Simon and Garfunkel'));
    expect(nameKey('Hydrozagadka')).not.toBe(nameKey('Proxima'));
  });

  it('performersOf: headliner first, festivals empty, falls back to the year-page row', () => {
    expect(performersOf(year.concerts[0]!)).toEqual([
      { name: 'Anchoress', headliner: true },
      { name: 'Flower and Pines', headliner: false },
    ]);
    expect(performersOf(year.concerts[1]!)).toEqual([]);
    expect(performersOf(year.concerts[6]!)).toEqual([{ name: "Oasis Live '25", headliner: true }]);
  });

  it('artistsForTags: headliners first, no duplicates, no festival acts', () => {
    expect(artistsForTags(year)).toEqual([
      'Anchoress',
      'ist ist',
      'The Murder Capital',
      "Oasis Live '25",
      'Flower and Pines',
    ]);
  });
});

describe('on real fixtures', () => {
  it('computes without surprises for demo123 2025', async () => {
    const p = await buildFixturePayload(2025, parseHtml);
    const s = computeStats(p);
    expect(s.concerts).toBe(47);
    expect(s.festivals).toBe(3);
    expect(s.homeCity).toBe('Warszawa');
    expect(s.months.reduce((a, b) => a + b, 0)).toBe(47);
    expect(s.topVenue!.count).toBeGreaterThan(1);
  });
});
