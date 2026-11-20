import { describe, expect, it } from 'vitest';
import type { StoryConcert, StoryData } from '../data.ts';
import { SAFE_BOTTOM, W } from '../template.ts';
import { balance, collage, collageLayout, textWidth } from './collage.tsx';

const concert = (rank: number, name: string, venue = 'Hydrozagadka'): StoryConcert => ({
  rank,
  name,
  subtitle: null,
  festival: false,
  date: '2025-01-01',
  dateLabel: 'Jan 1',
  venue,
  city: 'Warszawa',
  photo: null,
});
const story = (names: string[], facts = 4): StoryData => ({
  username: 'demo123',
  year: 2025,
  total: 47,
  totalLabel: '47 concerts',
  festivals: 0,
  picksLabel: names.length === 1 ? 'Gig of the year' : 'Top gigs of the year',
  concerts: names.map((n, i) => concert(i + 1, n, 'Narodowe Forum Muzyki')),
  facts: [
    { label: 'Artists', value: '104' },
    { label: 'Second home', value: 'Hydrozagadka ×8' },
    { label: 'Genres', value: 'post-rock, post-punk, experimental' },
    { label: 'Busiest months', value: 'February & August' },
  ].slice(0, facts),
});
const LONG = 'Hania Rani & Ensemble present: Ghosts, live with strings and choir';

describe('textWidth', () => {
  // Widths at 100 px measured with Satori on the bundled fonts; estimates may only err a little wide.
  it.each([
    ['Ludzie wschodu, Bialoruska zimna fala', 'display', 2475],
    ['Rome', 'display', 359],
    ['ПЕТЛЯ ПРИСТРАСТИЯ', 'display', 1439],
    ['KWOON', 'display', 515],
    ['HANIA RANI & ENSEMBLE PRESENT: GHOSTS', 'grotesk', 2240],
    ['ПЕТЛЯ ПРИСТРАСТИЯ', 'grotesk', 1110],
    ['Wrocław Łódź żółć', 'mono', 1019],
  ] as const)('%s (%s)', (s, face, measured) => {
    const est = textWidth(s, face, 100);
    expect(est).toBeGreaterThanOrEqual(measured * 0.99);
    expect(est).toBeLessThanOrEqual(measured * 1.12);
  });
});

describe('collageLayout', () => {
  it.each([
    ['three short', ['Rome', 'Pink Turns Blue', 'Kwoon']],
    ['three long', ['Ludzie wschodu, Bialoruska zimna fala', LONG, 'Петля Пристрастия']],
    ['three very long', [LONG, LONG, LONG]],
    ['two long', [LONG, LONG]],
    ['one', ['Rome']],
    ['one long', [LONG]],
  ])('%s: text ends above Instagram’s bottom UI, prints keep room', (_l, names) => {
    for (const facts of [4, 1, 0]) {
      const l = collageLayout(story(names, facts));
      const factsH = l.facts.length * 43 + Math.max(0, l.facts.length - 1) * 10;
      expect(l.factsTop + factsH).toBeLessThanOrEqual(SAFE_BOTTOM);
      expect(l.zone).toBeGreaterThanOrEqual(380);
      expect(l.prints).toHaveLength(names.length);
      for (const p of l.prints) expect(p.h).toBeGreaterThanOrEqual(180);
      for (const b of l.names) {
        expect(b.lines.length).toBeLessThanOrEqual(3);
        expect(b.fontSize).toBeGreaterThanOrEqual(32);
      }
    }
  });

  it('keeps short names big and never cuts a long one that fits in two lines', () => {
    const l = collageLayout(story(['Rome', 'Ludzie wschodu, Bialoruska zimna fala', 'Kwoon']));
    expect(l.names[0]!.fontSize).toBe(64);
    expect(l.names[1]!.lines.join(' ')).toBe('Ludzie wschodu, Bialoruska zimna fala');
    for (const line of l.names[1]!.lines)
      expect(textWidth(line, 'mono', l.names[1]!.fontSize)).toBeLessThan(W - 128 - 72 - 32);
  });

  it('packs facts into rows without dropping any', () => {
    const l = collageLayout(story(['Rome', 'Kwoon']));
    expect(l.facts.flat().map((f) => f.label)).toEqual([
      'ARTISTS',
      'SECOND HOME',
      'GENRES',
      'BUSIEST MONTHS',
    ]);
    expect(l.facts.length).toBeLessThanOrEqual(3);
  });

  it('asks for photos the size the prints are drawn at', () => {
    const d = story(['Rome', 'Kwoon', 'Ditz']);
    const l = collageLayout(d);
    d.concerts.forEach((c, i) => {
      const spec = collage.photo(c.rank, d);
      expect([spec.width, spec.height]).toEqual([l.prints[i]!.w, l.prints[i]!.h]);
    });
    expect(collage.photo(3, d).mode).toBe('red');
  });
});

describe('balance', () => {
  it('leaves no lone last word', () => {
    expect(balance('Hania Rani & Ensemble present: Ghosts', 'mono', 50)).toEqual([
      'Hania Rani & Ensemble',
      'present: Ghosts',
    ]);
  });
});
