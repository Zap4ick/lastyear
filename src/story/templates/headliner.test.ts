import { describe, expect, it } from 'vitest';
import type { StoryConcert, StoryData } from '../data.ts';
import { SAFE_BOTTOM, SAFE_TOP } from '../template.ts';
import { factLines, headerLabel, headlinerLayout, heroName } from './headliner.tsx';

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
const FACTS = [
  { label: 'Artists', value: '104' },
  { label: 'Second home', value: 'Narodowe Forum Muzyki ×12' },
  { label: 'Genres', value: 'post-rock, post-punk, experimental' },
  { label: 'Busiest months', value: 'February, August & November' },
];
const story = (names: string[], facts = FACTS): StoryData => ({
  username: 'demo123',
  year: 2025,
  total: 47,
  totalLabel: '47 concerts',
  festivals: 0,
  picksLabel: names.length === 1 ? 'Gig of the year' : 'Top gigs of the year',
  concerts: names.map((n, i) => concert(i + 1, n)),
  facts,
});
const LONG = 'Hania Rani & Ensemble present: Ghosts, live with strings and choir';

describe('headlinerLayout', () => {
  it.each([
    ['three short', ['Rome', 'Kwoon', 'Ditz']],
    ['three very long', [LONG, LONG, LONG]],
    ['two long', [LONG, LONG]],
    ['one', ['Rome']],
    ['one very long', [LONG]],
  ])('%s: text ends above Instagram’s bottom UI, #1 stays clear of the header', (_label, names) => {
    const l = headlinerLayout(story(names));
    expect(l.contentBottom).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(l.nameTop).toBeGreaterThan(SAFE_TOP + 200);
    expect(l.facts.length).toBeGreaterThan(0);
  });

  it('fewer picks get a taller poster instead of empty space', () => {
    const [one, two, three] = [['Rome'], ['Rome', 'Kwoon'], ['Rome', 'Kwoon', 'Ditz']].map(
      (n) => headlinerLayout(story(n)).hero,
    );
    expect(one).toBeGreaterThan(two!);
    expect(two).toBeGreaterThan(three!);
    expect(three).toBeGreaterThanOrEqual(1040);
  });
});

describe('heroName', () => {
  it('short names get big, long ones shrink to fit', () => {
    expect(heroName('Rome')).toEqual({ fontSize: 128, lines: 1 });
    expect(heroName('Ludzie wschodu, Bialoruska zimna fala').lines).toBe(2);
    expect(heroName(LONG).fontSize).toBeLessThan(70);
  });
});

describe('factLines', () => {
  it('keeps whole facts, at most the given number of lines', () => {
    const lines = factLines(story(['Rome', 'Kwoon']), 2);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines[0]).toMatch(/^47 concerts {2}· {2}104 artists/);
    for (const l of lines) expect(l).not.toMatch(/^ |·\s*$/);
  });

  it('drops the facts that do not fit', () => {
    expect(factLines(story(['Rome']), 1)).toHaveLength(1);
  });
});

describe('headerLabel', () => {
  it('puts the year into the label', () => {
    expect(headerLabel(story(['Rome', 'Kwoon']))).toBe('Top gigs of 2025');
    expect(headerLabel(story(['Rome']))).toBe('The gig of 2025');
  });
});
