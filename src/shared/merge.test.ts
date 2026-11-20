import { describe, expect, it } from 'vitest';
import { mergePayloads } from './merge.ts';
import { buildFixturePayload } from './parse/fixture-payload.ts';
import { parseHtml } from './parse/test-utils.ts';
import type { ImportPayload } from './types.ts';

const PAUSED = (n: number, of: number) =>
  `last.fm paused our requests, so photos and line-ups are missing for ${n} of ${of} concerts. Run the button again in about 15 minutes to fill them in.`;

function withoutDetails(p: ImportPayload, from: number, to: number): ImportPayload {
  const concerts = p.concerts.map((c, i) => (i >= from && i < to ? { ...c, details: null } : c));
  const missing = concerts.filter((c) => !c.details).length;
  return { ...p, concerts, warnings: [PAUSED(missing, concerts.length)] };
}

describe('mergePayloads', () => {
  it('fills details missing in the new run from the old one', async () => {
    const full = await buildFixturePayload(2026, parseHtml);
    const first = withoutDetails(full, 10, 25); // blocked after 10
    const second = withoutDetails(full, 0, 5); // second run blocked early, but on different concerts
    const merged = mergePayloads(first, second);
    expect(merged.concerts.every((c) => c.details)).toBe(true);
    expect(merged.warnings).toEqual([]);
  });

  it('keeps an updated warning when gaps remain', async () => {
    const full = await buildFixturePayload(2026, parseHtml);
    const merged = mergePayloads(withoutDetails(full, 10, 25), withoutDetails(full, 20, 25));
    expect(merged.concerts.filter((c) => !c.details)).toHaveLength(5);
    expect(merged.warnings).toEqual([PAUSED(5, 25)]);
  });

  it('takes the new concert list as the truth', async () => {
    const full = await buildFixturePayload(2026, parseHtml);
    const fewer = { ...full, concerts: full.concerts.slice(0, 20) };
    expect(mergePayloads(full, fewer).concerts).toHaveLength(20);
  });

  it('refuses to mix users or years', async () => {
    const a = await buildFixturePayload(2026, parseHtml);
    expect(() => mergePayloads(a, { ...a, username: 'someone' })).toThrow();
    expect(() => mergePayloads(a, { ...a, year: 2025 })).toThrow();
  });

  it('keeps the "shared" mark on details filled in from the old run', async () => {
    const full = await buildFixturePayload(2026, parseHtml);
    const first = {
      ...full,
      concerts: full.concerts.map((c, i) => (i < 3 ? { ...c, sharedDetails: true } : c)),
    };
    const merged = mergePayloads(first, withoutDetails(full, 0, 5));
    expect(merged.concerts.map((c) => c.sharedDetails ?? false).slice(0, 6)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
