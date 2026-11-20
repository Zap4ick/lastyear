import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildStoryData } from '../story/data.ts';
import { TEMPLATES } from '../story/templates/index.ts';
import { storyPage } from './render.ts';
import { computeStats } from '../shared/stats.ts';
import type { ImportPayload } from '../shared/types.ts';

const payload: ImportPayload = {
  username: 'demo123',
  year: 2026,
  concerts: [],
} as unknown as ImportPayload;

describe('storyPage', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s carries the "made with" credit', (_id, t) => {
    const data = buildStoryData(payload, [], computeStats(payload, {}));
    const html = renderToStaticMarkup(storyPage(t, data, [], 'example.test'));
    expect(html.toLowerCase()).toContain('made with example.test');
  });
});
