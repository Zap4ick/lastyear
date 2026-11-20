import { describe, expect, it } from 'vitest';
import type { StoryConcert, StoryData } from '../data.ts';
import { SAFE_BOTTOM } from '../template.ts';
import { columnsLayout, lineCount } from './columns.tsx';

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
const story = (names: string[], facts = 4, venue?: string): StoryData => ({
  username: 'demo123',
  year: 2025,
  total: 47,
  totalLabel: '47 concerts',
  festivals: 0,
  picksLabel: 'Top gigs of the year',
  concerts: names.map((n, i) => concert(i + 1, n, venue)),
  facts: Array.from({ length: facts }, (_, i) => ({ label: `L${i}`, value: 'v' })),
});
const LONG = 'Hania Rani & Ensemble present: Ghosts, live with strings and choir';
const LONG_VENUE = 'Narodowe Forum Muzyki im. Witolda Lutosławskiego';

describe('columnsLayout', () => {
  it.each([
    ['three short', ['Rome', 'Kwoon', 'Ditz']],
    ['three very long', [LONG, LONG, LONG]],
    ['two long', [LONG, LONG]],
    ['one long', [LONG]],
    ['one', ['Rome']],
  ])('%s: facts end above Instagram’s bottom UI, columns stay tall', (_label, names) => {
    for (const venue of ['Hydrozagadka', LONG_VENUE]) {
      const l = columnsLayout(story(names, 4, venue));
      expect(l.contentBottom).toBeLessThanOrEqual(SAFE_BOTTOM);
      expect(l.colH).toBeGreaterThanOrEqual(420);
    }
  });

  it('shows at most three facts', () => {
    expect(columnsLayout(story(['Rome'], 4)).facts).toHaveLength(3);
  });

  it('keeps one name size per row and shrinks it only when a name needs a third line', () => {
    const short = columnsLayout(story(['Rome', 'Kwoon', 'Ditz']));
    const mixed = columnsLayout(story(['Rome', 'Kwoon', LONG]));
    expect(short.nameFs).toBeGreaterThan(mixed.nameFs);
    expect(mixed.captions.map((c) => c.nameLines)).toEqual([1, 1, 3]);
  });

  it('fewer picks get wider columns and bigger names', () => {
    const one = columnsLayout(story(['Rome'], 1));
    const three = columnsLayout(story(['Rome', 'Kwoon', 'Ditz']));
    expect(one.w).toBeGreaterThan(three.w * 2.5);
    expect(one.nameFs).toBeGreaterThan(three.nameFs);
  });
});

describe('lineCount', () => {
  it('wraps on words; a word wider than the column stays whole (Satori overflows it, see measure.test.ts)', () => {
    expect(lineCount('Rome', 38, 310)).toBe(1);
    expect(lineCount('Pink Turns Blue', 38, 310)).toBe(1);
    expect(lineCount('Hania Rani & Ensemble', 38, 310)).toBe(2);
    expect(lineCount('Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 38, 310)).toBe(1);
  });
});
