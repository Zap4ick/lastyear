import { describe, expect, it } from 'vitest';
import type { StoryConcert, StoryData } from '../data.ts';
import { SAFE_BOTTOM, W } from '../template.ts';
import { bauhausLayout } from './bauhaus.tsx';

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
const MID = 'Ludzie wschodu, Bialoruska zimna fala';
/** Needs three lines at full size (measured with the real font), so it must shrink. */
const LONGER = 'Hania Rani & Ensemble present: Ghosts, live at Narodowe Forum Muzyki with strings and choir';

describe('bauhausLayout', () => {
  it.each([
    ['three short', ['Rome', 'Kwoon', 'Ditz']],
    ['three two-line', [MID, MID, MID]],
    ['three very long', [LONG, LONG, LONG]],
    ['two long', [LONG, LONG]],
    ['one long', [LONG]],
    ['one', ['Rome']],
  ])('%s: everything ends above Instagram’s bottom UI, shapes stay usable', (_label, names) => {
    const l = bauhausLayout(story(names));
    expect(l.contentBottom).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(l.shapes).toHaveLength(names.length);
    for (const b of l.shapes) {
      expect(b.size).toBeGreaterThanOrEqual(220);
      expect(b.left + b.size).toBeLessThanOrEqual(W);
    }
  });

  it('wraps long names to two lines and shrinks only those that would need three', () => {
    const l = bauhausLayout(story(['Rome', LONG, LONGER]));
    expect(l.rows.map((r) => r.lines)).toEqual([1, 2, 2]);
    expect(l.rows.map((r) => r.fontSize)).toEqual([46, 46, 38]);
  });

  it('fewer picks get bigger shapes, so no slot stays empty', () => {
    const one = bauhausLayout(story(['Rome'], 1));
    const two = bauhausLayout(story(['Rome', 'Kwoon']));
    const three = bauhausLayout(story(['Rome', 'Kwoon', 'Ditz']));
    expect(one.disc.size).toBeGreaterThan(two.disc.size);
    expect(one.shapes[0]!.size).toBeGreaterThan(three.shapes[0]!.size);
    expect(two.shapes[1]!.size).toBeGreaterThan(three.shapes[1]!.size);
  });
});
