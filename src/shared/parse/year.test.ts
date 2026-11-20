import { describe, expect, it } from 'vitest';
import { detectProblem } from './common.ts';
import { loadFixture } from './test-utils.ts';
import { parseYearPage, splitLineup } from './year.ts';

describe('parseYearPage', () => {
  it('parses demo123 2026 (25 concerts, incl. a festival)', () => {
    const page = parseYearPage(loadFixture('year-demo123-2026.html'), 'demo123', 2026);
    expect(page.wentTo).toBe(25);
    expect(page.events).toHaveLength(25);
    expect(page.events[0]).toEqual({
      id: '4981761',
      kind: 'event',
      url: '/event/4981761+Anchoress+at+2KO%C5%81A+Pub+Motocyklowy+on+16+January+2026',
      date: '2026-01-16',
      title: 'Anchoress',
      lineup: ['Bartek Mieżyński', 'Flower and Pines'],
      venue: '2KOŁA Pub Motocyklowy',
      city: 'Warszawa',
      country: 'Poland',
      status: '',
    });
    const fest = page.events.find((e) => e.kind === 'festival');
    expect(fest).toMatchObject({ id: '4935597', title: 'Grauzone Festival 2026', date: '2026-02-06' });
    expect(fest!.lineup.length).toBeGreaterThan(5);
  });

  it('keeps every row in date order and every row has the basics', () => {
    const { events } = parseYearPage(loadFixture('year-demo123-2026.html'), 'demo123', 2026);
    const dates = events.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    for (const e of events) {
      expect(e.date).toMatch(/^2026-\d\d-\d\d$/);
      expect(e.title).not.toBe('');
      expect(e.venue).not.toBe('');
    }
  });

  it('parses paper-planes 2025: tour titles, empty lineups, apostrophes', () => {
    const page = parseYearPage(loadFixture('year-otheruser01-2025.html'), 'paper-planes', 2025);
    expect(page.wentTo).toBe(16);
    expect(page.events).toHaveLength(16);
    const robbie = page.events.find((e) => e.title === 'Robbie Williams');
    expect(robbie?.lineup).toEqual(['Five', 'Lulu', "Rag 'N' Bone Man", 'The Lottery Winners']);
    const oasis = page.events.find((e) => e.title === "Oasis Live '25");
    expect(oasis?.lineup).toEqual(['Oasis', 'Cast', 'Richard Ashcroft']);
    expect(page.events.find((e) => e.title === 'Radiohead')?.lineup).toEqual([]);
  });

  it('detects pagination: 46 concerts, 30 on the first page', () => {
    const page = parseYearPage(loadFixture('year-demo123-2025.html'), 'demo123', 2025);
    expect(page.wentTo).toBe(46);
    expect(page.events).toHaveLength(30);
    expect(page.nextPageUrl).toBe('/user/demo123/events/2025?page=2');
    expect(page.events.filter((e) => e.kind === 'festival').map((e) => e.title)).toEqual([
      'Ludzie wschodu, Bialoruska zimna fala',
      'Santander Letnie Brzmienia 2025',
    ]);
  });

  it('has no next page when everything fits', () => {
    expect(parseYearPage(loadFixture('year-demo123-2026.html'), 'demo123', 2026).nextPageUrl).toBeNull();
    expect(
      parseYearPage(loadFixture('year-otheruser01-2025.html'), 'paper-planes', 2025).nextPageUrl,
    ).toBeNull();
  });

  it('parses the last page of a paginated year', () => {
    const page = parseYearPage(loadFixture('year-demo123-2025-p2.html'), 'demo123', 2025);
    expect(page.events).toHaveLength(17);
    expect(page.nextPageUrl).toBeNull();
    expect(page.events[0]).toMatchObject({ date: '2025-08-17', title: 'Jobi Riccio' });
    // Note: last.fm's counter says 46 while the two pages list 30 + 17 = 47 distinct events.
    expect(page.wentTo).toBe(46);
  });

  it('parses a year with no concerts', () => {
    const page = parseYearPage(loadFixture('year-empty.html'), 'RJ', 2024);
    expect(page).toMatchObject({ events: [], nextPageUrl: null, wentTo: null });
  });

  it('returns no events for an error page', () => {
    const doc = loadFixture('error-unavailable.html');
    expect(detectProblem(doc)).toBe('unavailable');
    expect(parseYearPage(doc, 'x', 2025).events).toEqual([]);
  });
});

describe('splitLineup', () => {
  it('splits on comma+newline only, so commas inside names survive', () => {
    expect(splitLineup('\n  Crosby, Stills, Nash & Young, \n  Neil Young\n')).toEqual([
      'Crosby, Stills, Nash & Young',
      'Neil Young',
    ]);
  });
  it('handles single-line input and empties', () => {
    expect(splitLineup('A, B')).toEqual(['A', 'B']);
    expect(splitLineup('   ')).toEqual([]);
    expect(splitLineup(null)).toEqual([]);
  });
});
