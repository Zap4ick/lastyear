import { describe, expect, it } from 'vitest';
import type { StoryConcert, StoryData } from '../data.ts';
import { SAFE_BOTTOM, W } from '../template.ts';
import { bandsLayout } from './bands.tsx';

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
const MID = 'Ludzie wschodu, Bialoruska zimna fala';

describe('bandsLayout', () => {
  it.each([
    ['three short', ['Rome', 'Kwoon', 'Ditz'], 4],
    ['three long', [MID, LONG, LONG], 4],
    ['two long', [MID, LONG], 4],
    ['one', ['Rome'], 1],
    ['no facts', ['Rome', 'Kwoon'], 0],
  ])('%s: facts end above Instagram’s bottom UI, names fit their band', (_label, names, facts) => {
    const l = bandsLayout(story(names, facts));
    expect(l.contentBottom).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(l.bandH).toBeGreaterThanOrEqual(240);
    for (const r of l.rows) expect(r.textH).toBeLessThanOrEqual(l.bandH);
  });

  it('crops photos taller than the band so faces above the strip survive', () => {
    const l = bandsLayout(story(['Rome', 'Kwoon', 'Ditz']));
    expect(l.photoH).toBeGreaterThan(l.bandH * 2);
    expect(l.photoH).toBeLessThanOrEqual(W);
    expect(l.photoTop).toBeLessThanOrEqual(0);
    expect(l.photoTop + l.photoH).toBeGreaterThanOrEqual(l.bandH);
  });

  it('long names go to two smaller lines, short ones stay big', () => {
    const l = bandsLayout(story(['Rome', MID, LONG]));
    expect(l.rows.map((r) => r.fontSize)).toEqual([64, 52, 52]);
    expect(l.rows.map((r) => r.lines)).toEqual([1, 2, 2]);
  });

  it('fewer picks get taller bands', () => {
    const one = bandsLayout(story(['Rome'], 1)).bandH;
    const two = bandsLayout(story(['Rome', 'Kwoon'])).bandH;
    const three = bandsLayout(story(['Rome', 'Kwoon', 'Ditz'])).bandH;
    expect(one).toBeGreaterThan(two * 2);
    expect(two).toBeGreaterThan(three * 1.4);
  });
});
