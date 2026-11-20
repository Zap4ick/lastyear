import { describe, expect, it } from 'vitest';
import { buildFixturePayload } from '../shared/parse/fixture-payload.ts';
import { parseHtml } from '../shared/parse/test-utils.ts';
import { computeStats } from '../shared/stats.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildStoryData, storyFacts } from './data.ts';

describe('buildStoryData', () => {
  it('keeps pick order, ranks from 1, skips unknown keys', async () => {
    const p = await buildFixturePayload(2026, parseHtml);
    const [a, b, c] = [p.concerts[5]!, p.concerts[0]!, p.concerts.find((x) => x.kind === 'festival')!];
    const d = buildStoryData(
      p,
      [
        { key: `${a.kind}:${a.id}`, photo: 'https://x/1.jpg' },
        { key: 'event:999999', photo: null },
        { key: `${b.kind}:${b.id}`, photo: null },
        { key: `${c.kind}:${c.id}`, photo: null },
      ],
      computeStats(p),
    );
    expect(d.concerts.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(d.concerts[0]).toMatchObject({ date: a.date, venue: a.venue, photo: 'https://x/1.jpg' });
    expect(d.concerts[1]).toMatchObject({ dateLabel: 'Jan 16', city: 'Warszawa' });
    expect(d.concerts[2]).toMatchObject({ festival: true, name: 'Grauzone Festival 2026', subtitle: null });
    expect(d).toMatchObject({ username: 'demo123', year: 2026, total: 25, festivals: 2 });
    expect(d.picksLabel).toBe('Top gigs of the year');
    expect(d.totalLabel).toBe('25 concerts');
    const one = buildStoryData(
      { ...p, concerts: [b] },
      [{ key: `${b.kind}:${b.id}`, photo: null }],
      computeStats(p),
    );
    expect(one.totalLabel).toBe('1 concert');
  });
});

describe('storyFacts', () => {
  it('only facts with something to say, at most 4', async () => {
    const p = await buildFixturePayload(2025, parseHtml, { details: 'none' });
    const facts = storyFacts(computeStats(p, { tags: { Rome: [{ name: 'neofolk', count: 100 }] } }));
    expect(facts.map((f) => f.label)).toEqual(['Artists', 'Second home', 'Genres', 'Busiest months']);
    expect(facts[1]!.value).toBe('Hydrozagadka ×8');
    expect(facts[3]!.value).toBe('February & August');
  });

  it('drops empty facts', async () => {
    const p = await buildFixturePayload(2025, parseHtml, { details: 'none' });
    const one = { ...p, concerts: p.concerts.slice(0, 1) };
    expect(storyFacts(computeStats(one)).map((f) => f.label)).toEqual(['Artists']);
  });
});

describe('templates', () => {
  it('never build the concert count themselves ("1 concerts"): they use totalLabel', () => {
    const dir = join(import.meta.dirname, 'templates');
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /\bd\.total\b(?!Label)/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
