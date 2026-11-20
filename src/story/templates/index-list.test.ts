import { describe, expect, it } from 'vitest';
import type { StoryConcert, StoryData } from '../data.ts';
import { SAFE_BOTTOM } from '../template.ts';
import { indexLayout, nameLines } from './index-list.tsx';

const concert = (rank: number, name: string): StoryConcert => ({
  rank,
  name,
  subtitle: null,
  festival: false,
  date: '2025-01-01',
  dateLabel: 'Jan 1',
  venue: 'Hydrozagadka',
  city: 'Warszawa',
  photo: null,
});
const story = (names: string[], facts = 4): StoryData => ({
  username: 'demo123',
  year: 2025,
  total: 47,
  totalLabel: '47 concerts',
  festivals: 0,
  picksLabel: 'Top gigs of the year',
  concerts: names.map((n, i) => concert(i + 1, n)),
  facts: Array.from({ length: facts }, (_, i) => ({ label: `L${i}`, value: 'v' })),
});
const LONG = 'Hania Rani & Ensemble present: Ghosts, live with strings and choir';

describe('indexLayout', () => {
  it.each([
    ['three short', ['Rome', 'Kwoon', 'Ditz'], 4],
    ['three very long', [LONG, LONG, LONG], 4],
    ['three, one fact', ['Rome', 'Kwoon', 'Ditz'], 1],
    ['two long', [LONG, LONG], 4],
    ['one', ['Rome'], 1],
    ['one long, four facts', [LONG], 4],
  ])('%s: everything ends above Instagram’s bottom UI, photos stay big', (_label, names, facts) => {
    const l = indexLayout(story(names, facts));
    expect(l.contentBottom).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(l.photoH).toBeGreaterThanOrEqual(220);
    expect(l.photoW).toBeGreaterThanOrEqual(300);
    expect(l.lines).toBeLessThanOrEqual(3);
  });

  it('one size for all names: short lists stay big, long names shrink', () => {
    expect(indexLayout(story(['Rome', 'Kwoon', 'Ditz'])).fontSize).toBe(64);
    expect(indexLayout(story(['Rome', LONG, 'Ditz'])).fontSize).toBeLessThan(50);
  });

  it('fewer picks get bigger photos', () => {
    const three = indexLayout(story(['Rome', 'Kwoon', 'Ditz']));
    const two = indexLayout(story(['Rome', 'Kwoon']));
    const one = indexLayout(story(['Rome']));
    expect(two.photoH).toBeGreaterThan(three.photoH);
    expect(one.single).toBe(true);
    expect(one.photoW * one.photoH).toBeGreaterThan(5 * three.photoW * three.photoH);
  });
});

describe('nameLines', () => {
  it('wraps by words and is a little pessimistic', () => {
    // Measured with Satori: "Pink Turns Blue" is 9.7 em, "Петля Пристрастия" 12.87 em.
    expect(nameLines('Pink Turns Blue', 50, 540)).toBe(1);
    expect(nameLines('Pink Turns Blue', 64, 564)).toBe(2);
    expect(nameLines('Петля Пристрастия', 50, 600)).toBe(2);
    expect(nameLines('Петля Пристрастия', 40, 600)).toBe(1);
  });
});
