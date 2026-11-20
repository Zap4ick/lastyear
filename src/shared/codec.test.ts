import { describe, expect, it } from 'vitest';
import { decodePayload, encodePayload } from './codec.ts';

describe('payload codec', () => {
  it('round-trips unicode, quotes and nesting', async () => {
    const data = {
      u: 'demo123',
      venue: '2KOŁA Pub Motocyklowy',
      t: "Oasis Live '25",
      n: [1, null, { a: '«»' }],
    };
    const enc = await encodePayload(data);
    expect(enc).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(await decodePayload(enc)).toEqual(data);
    expect(await decodePayload('#' + enc)).toEqual(data);
  });

  it('compresses repetitive concert data well', async () => {
    const concerts = Array.from({ length: 50 }, (_, i) => ({
      id: String(4900000 + i),
      title: `Band ${i}`,
      venue: 'Hammersmith Apollo',
      city: 'London',
      country: 'United Kingdom',
      image: `https://lastfm-img.freetls.fastly.net/i/u/ar0/${i.toString(16).padStart(32, '0')}.jpg`,
    }));
    const enc = await encodePayload(concerts);
    expect(enc.length).toBeLessThan(JSON.stringify(concerts).length / 2);
  });

  it('rejects unknown versions', async () => {
    await expect(decodePayload('v9.abc')).rejects.toThrow('Unsupported payload version');
  });
});
