import { describe, expect, it } from 'vitest';
import { backgroundImage, fullSizeImage } from './common.ts';
import { parseEventPage } from './event.ts';
import { loadFixture } from './test-utils.ts';

const CDN = 'https://lastfm-img.freetls.fastly.net/i/u';

describe('parseEventPage', () => {
  it('event whose title is a tour name: headliner is the first performer', () => {
    const ev = parseEventPage(loadFixture('event-tour-title.html'));
    expect(ev.title).toBe("Oasis Live '25");
    expect(ev.date).toBe('2025-09-27');
    expect(ev.performers.map((p) => p.name)).toEqual(['Oasis', 'Cast', 'Richard Ashcroft']);
    expect(ev.lineupTotal).toBe(3);
    expect(ev.performers[0]).toEqual({
      name: 'Oasis',
      url: '/music/Oasis',
      imageUrl: `${CDN}/ar0/08300481d8484150c13b769007cac3ef.jpg`,
    });
    expect(ev.headerImageUrl).toBe(`${CDN}/ar0/0f8f6df58e94dc26c929deaa7a24b776.jpg`);
    expect(ev.venue).toEqual({
      name: 'Wembley Stadium',
      street: 'Empire Way',
      city: 'London',
      country: 'United Kingdom',
    });
  });

  it('event whose title is the headliner', () => {
    const ev = parseEventPage(loadFixture('event-title-is-headliner.html'));
    expect(ev.title).toBe('Marilyn Manson');
    expect(ev.date).toBe('2025-02-21');
    expect(ev.performers.map((p) => p.name)).toEqual(['Marilyn Manson', 'The Blackmordia']);
    expect(ev.performers[0]!.imageUrl).toBe(`${CDN}/ar0/6bf57140b2a56d57f1b5739acf1d5201.jpg`);
    expect(ev.headerImageUrl).toBe(`${CDN}/ar0/e52448ade7bcf5581c05f2cbcd628bc9.jpg`);
    expect(ev.venue?.name).toBe('Hammersmith Apollo');
    expect(ev.venue?.city).toBe('London');
  });

  it('small club event: all performers with images, full street address', () => {
    const ev = parseEventPage(loadFixture('event-small-club.html'));
    expect(ev.title).toBe('Anchoress');
    expect(ev.performers.map((p) => p.name)).toEqual(['Anchoress', 'Bartek Mieżyński', 'Flower and Pines']);
    expect(ev.performers.every((p) => p.imageUrl?.includes('/ar0/'))).toBe(true);
    expect(ev.lineupTotal).toBe(3);
    expect(ev.venue).toEqual({
      name: '2KOŁA Pub Motocyklowy',
      street: 'Tunelowa 2B',
      city: 'Warszawa',
      country: 'Poland',
    });
  });

  it('festival: line-up is alphabetical and truncated, some artists have no image', () => {
    const ev = parseEventPage(loadFixture('event-festival.html'));
    expect(ev.title).toBe('Grauzone Festival 2026');
    expect(ev.date).toBe('2026-02-06');
    expect(ev.lineupTotal).toBe(92);
    expect(ev.performers).toHaveLength(8);
    const names = ev.performers.map((p) => p.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    expect(ev.performers.find((p) => p.name === 'Apero')?.imageUrl).toBeNull();
    expect(ev.headerImageUrl).toMatch(/\/ar0\/[0-9a-f]{32}/);
    expect(ev.venue?.city).toBe('Den Haag');
  });

  it('error page yields an empty result instead of throwing', () => {
    const ev = parseEventPage(loadFixture('error-unavailable.html'));
    expect(ev.performers).toEqual([]);
    expect(ev.venue).toBeNull();
  });
});

describe('image helpers', () => {
  it('fullSizeImage rewrites any size to ar0', () => {
    expect(fullSizeImage(`${CDN}/avatar300s/08300481d8484150c13b769007cac3ef.jpg`)).toBe(
      `${CDN}/ar0/08300481d8484150c13b769007cac3ef.jpg`,
    );
    expect(fullSizeImage(`${CDN}/64s/16b59ea52f881000b766df36676e4c86.png`)).toBe(
      `${CDN}/ar0/16b59ea52f881000b766df36676e4c86.png`,
    );
    expect(fullSizeImage(`${CDN}/300x300/0f8f6df58e94dc26c929deaa7a24b776`)).toBe(
      `${CDN}/ar0/0f8f6df58e94dc26c929deaa7a24b776`,
    );
  });

  it('fullSizeImage rejects placeholders and foreign URLs', () => {
    expect(fullSizeImage(`${CDN}/avatar300s/2a96cbd8b46e442fc41c2b86b821562f.png`)).toBeNull();
    expect(fullSizeImage('https://www.last.fm/static/images/lastfm_logo_facebook.png')).toBeNull();
    expect(fullSizeImage(null)).toBeNull();
  });

  it('backgroundImage reads url() with or without quotes', () => {
    expect(backgroundImage('background-image: url(https://a/b.jpg);')).toBe('https://a/b.jpg');
    expect(backgroundImage(`background-image:url('https://a/b.jpg')`)).toBe('https://a/b.jpg');
    expect(backgroundImage('color: red')).toBeNull();
  });
});
