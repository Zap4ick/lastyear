import { describe, expect, it } from 'vitest';
import type { StoryConcert, StoryData } from '../data.ts';
import { SAFE_BOTTOM } from '../template.ts';
import { lineCount, posterLayout } from './poster.tsx';

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
  picksLabel: names.length === 1 ? 'Gig of the year' : 'Top gigs of the year',
  concerts: names.map((n, i) => concert(i + 1, n)),
  facts: Array.from({ length: facts }, (_, i) => ({ label: `L${i}`, value: 'v' })),
});
const LONG = 'Hania Rani & Ensemble present: Ghosts, live with strings and choir';
const CAPS = 'GODSPEED YOU! BLACK EMPEROR & FRIENDS';

describe('posterLayout', () => {
  it.each([
    ['three short', ['Rome', 'Kwoon', 'Ditz']],
    ['three very long', [LONG, LONG, LONG]],
    ['all caps', [CAPS, 'Kwoon', 'Ditz']],
    ['cyrillic', ['Петля Пристрастия и друзья на большой сцене', 'Kwoon']],
    ['two long', [LONG, LONG]],
    ['one', ['Rome']],
    ['one long', [LONG]],
  ])('%s: ends above Instagram’s bottom UI and never runs into the header', (_label, names) => {
    const l = posterLayout(story(names));
    expect(l.blockBottom).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(l.blockTop).toBeGreaterThanOrEqual(l.headerBottom + 40);
    expect(l.name.lines).toBeLessThanOrEqual(2);
  });

  it('keeps short #1 names big, bigger still when it is the only pick', () => {
    expect(posterLayout(story(['Rome', 'Kwoon'])).name).toEqual({ fontSize: 112, lines: 1 });
    expect(posterLayout(story(['Rome'])).name).toEqual({ fontSize: 132, lines: 1 });
  });

  it('shrinks long #1 names until they fit two lines', () => {
    const name = 'Hania Rani & Ensemble present: Ghosts';
    const l = posterLayout(story([name, 'Kwoon']));
    expect(l.name.fontSize).toBeLessThan(112);
    expect(lineCount(name, l.name.fontSize, 936, -Math.round(l.name.fontSize * 0.03))).toBe(2);
  });

  it('clamps absurdly long #1 names to two lines at the smallest size', () => {
    expect(posterLayout(story([LONG, 'Kwoon'])).name).toEqual({ fontSize: 64, lines: 2 });
  });

  it('fewer picks leave more of the photo visible', () => {
    expect(posterLayout(story(['Rome'], 1)).blockTop).toBeGreaterThan(
      posterLayout(story(['Rome', 'Kwoon', 'Ditz'])).blockTop + 300,
    );
  });
});

describe('lineCount', () => {
  it('matches what Satori renders for the edge-case names', () => {
    // Rendered at 96 px across 936 px: two lines.
    expect(lineCount('Ludzie wschodu, Bialoruska zimna fala', 96, 936, -3)).toBe(2);
    expect(lineCount('Rome', 132, 936, -4)).toBe(1);
  });
});
