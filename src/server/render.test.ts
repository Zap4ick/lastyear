import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildStoryData } from '../story/data.ts';
import { TEMPLATES } from '../story/templates/index.ts';
import { photoUrls, storyPage } from './render.ts';
import { computeStats } from '../shared/stats.ts';
import type { ImportPayload } from '../shared/types.ts';

const payload: ImportPayload = {
  username: 'demo123',
  year: 2026,
  concerts: [],
} as unknown as ImportPayload;

describe('photoUrls', () => {
  const hash = '39761baf0ce815f94dafacd59ea41cc6';
  it('lists the other addresses of a last.fm image, the original first', () => {
    expect(photoUrls(`https://lastfm-img.freetls.fastly.net/i/u/ar0/${hash}.jpg`)).toEqual([
      `https://lastfm-img.freetls.fastly.net/i/u/ar0/${hash}.jpg`,
      `https://lastfm.freetls.fastly.net/i/u/ar0/${hash}.jpg`,
      `https://lastfm.freetls.fastly.net/i/u/770x0/${hash}.jpg`,
      `https://lastfm.freetls.fastly.net/i/u/ar0/${hash}`,
    ]);
    expect(photoUrls(`https://lastfm.freetls.fastly.net/i/u/ar0/${hash}`)).toEqual([
      `https://lastfm.freetls.fastly.net/i/u/ar0/${hash}`,
      `https://lastfm-img.freetls.fastly.net/i/u/ar0/${hash}`,
      `https://lastfm.freetls.fastly.net/i/u/770x0/${hash}`,
    ]);
  });
  it('leaves other photos alone', () => {
    const dz = 'https://cdn-images.dzcdn.net/images/artist/abc/1000x1000.jpg';
    expect(photoUrls(dz)).toEqual([dz]);
  });
});

describe('storyPage', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s carries the "made with" credit', (_id, t) => {
    const data = buildStoryData(payload, [], computeStats(payload, {}));
    const html = renderToStaticMarkup(storyPage(t, data, [], 'example.test'));
    expect(html.toLowerCase()).toContain('made with example.test');
  });
});
