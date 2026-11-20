import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderStory } from '../../server/render.ts';
import type { StoryConcert, StoryData } from '../data.ts';
import { SAFE_BOTTOM, SAFE_TOP, W } from '../template.ts';
import { swiss, swissLayout } from './swiss.tsx';

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
const story = (names: string[], facts = 4, year = 2025): StoryData => ({
  username: 'demo123',
  year,
  total: 47,
  totalLabel: '47 concerts',
  festivals: 0,
  picksLabel: 'Top gigs of the year',
  concerts: names.map((n, i) => concert(i + 1, n)),
  facts: Array.from({ length: facts }, (_, i) => ({
    label: `Label ${i}`,
    value: 'post-rock, post-punk, experimental',
  })),
});
const LONG = 'Hania Rani & Ensemble present: Ghosts, live with strings and choir';
/** Needs three lines at full size (measured with the real font), so it must shrink. */
const LONGER = 'Hania Rani & Ensemble present: Ghosts, live at Narodowe Forum Muzyki with strings and choir';

describe('swissLayout', () => {
  it.each([
    ['three short', ['Rome', 'Kwoon', 'Ditz']],
    ['three very long', [LONG, LONG, LONG]],
    ['two long', [LONG, LONG]],
    ['one', ['Rome']],
    ['one very long', [LONG]],
  ])('%s: everything ends above Instagram’s bottom UI, photos stay usable', (_label, names) => {
    const l = swissLayout(story(names));
    expect(l.contentBottom).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(l.photoH).toBeGreaterThanOrEqual(180);
  });

  it('shrinks very long names and keeps short ones big', () => {
    const l = swissLayout(story(['Rome', LONGER]));
    expect(l.rows.map((r) => r.fontSize)).toEqual([52, 44]);
    expect(l.rows.map((r) => r.lines)).toEqual([1, 2]);
  });

  it('fewer picks get bigger photos', () => {
    const one = swissLayout(story(['Rome'], 1));
    const three = swissLayout(story(['Rome', 'Kwoon', 'Ditz']));
    expect(one.photoW).toBeGreaterThan(three.photoW * 2);
    expect(one.photoH).toBeGreaterThan(three.photoH);
  });

  it('sets the year across the full measure when there is room, smaller when the list runs long', () => {
    const short = swissLayout(story(['Rome', 'Kwoon', 'Ditz']));
    const long = swissLayout(story([LONG, LONG, LONG]));
    expect(short.yearFs).toBeGreaterThan(450);
    expect(long.yearFs).toBeLessThan(short.yearFs);
    expect(long.yearFs).toBeGreaterThanOrEqual(320);
  });

  it('keeps numerals at the row’s base size when a name shrinks', () => {
    const l = swissLayout(story(['Rome', LONG]));
    expect(l.rows.map((r) => r.numFs)).toEqual([52, 52]);
    expect(swissLayout(story(['Rome'])).rows[0]!.fontSize).toBe(68);
  });
});

/** Rows and columns that hold any ink (anything darker than near-white). */
async function inkBounds(png: Buffer) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  let top = info.height,
    bottom = 0,
    left = info.width,
    right = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[y * info.width + x]! < 240) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
  return { top, bottom, left, right };
}

describe('swiss render', () => {
  // The layout above is an estimate; this checks the real pixels, so a mismatch between the estimate
  // and Satori's box model (e.g. padding added to fixed sizes) can't push text under Instagram's UI.
  it.each([
    ['three very long, 4 facts', story([LONG, LONG, LONG])],
    ['one very long, 4 facts', story([LONG])],
    ['three short, year 2008', story(['Rome', 'Kwoon', 'Ditz'], 4, 2008)],
  ])('%s: all ink inside the safe area and the side margins', async (_label, d) => {
    const ink = await inkBounds(await renderStory(swiss, d));
    expect(ink.top).toBeGreaterThanOrEqual(SAFE_TOP);
    expect(ink.bottom).toBeLessThanOrEqual(SAFE_BOTTOM);
    expect(ink.left).toBeGreaterThanOrEqual(72 - 2);
    expect(ink.right).toBeLessThanOrEqual(W - 72 + 2);
  });
});
