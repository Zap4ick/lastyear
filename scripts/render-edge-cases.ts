/**
 * Render one template on awkward synthetic data: long two-line names, Cyrillic and Polish letters,
 * a festival, a missing photo, and 1 / 2 / 3 picks. Output: .dev/stories/<template>-edge.png (sheet).
 *
 *   npm run render:edge -- --t=swiss
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import type { StoryConcert, StoryData } from '../src/story/data.ts';
import { templateById } from '../src/story/templates/index.ts';
import { renderStory } from '../src/server/render.ts';

const id = process.argv.find((a) => a.startsWith('--t='))?.slice(4) ?? 'swiss';
const template = templateById(id);
if (!template) throw new Error(`No template "${id}"`);

const IMG = (h: string) => `https://lastfm-img.freetls.fastly.net/i/u/ar0/${h}.jpg`;
const c = (rank: number, o: Partial<StoryConcert>): StoryConcert => ({
  rank,
  name: 'Rome',
  subtitle: null,
  festival: false,
  date: '2025-11-14',
  dateLabel: 'Nov 14',
  venue: 'Hydrozagadka',
  city: 'Warszawa',
  photo: IMG('e52448ade7bcf5581c05f2cbcd628bc9'),
  ...o,
});
const base: Omit<StoryData, 'concerts' | 'picksLabel'> = {
  username: 'demo123',
  year: 2025,
  total: 47,
  totalLabel: '47 concerts',
  festivals: 3,
  facts: [
    { label: 'Artists', value: '104' },
    { label: 'Second home', value: 'Hydrozagadka ×8' },
    { label: 'Genres', value: 'post-rock, post-punk, experimental' },
    { label: 'Busiest months', value: 'February & August' },
  ],
};
const long: StoryConcert[] = [
  c(1, {
    name: 'Ludzie wschodu, Bialoruska zimna fala',
    festival: true,
    venue: 'Klub Chmury',
    dateLabel: 'Jan 17',
    photo: IMG('0f8f6df58e94dc26c929deaa7a24b776'),
  }),
  c(2, {
    name: 'Hania Rani & Ensemble present: Ghosts',
    venue: 'Narodowe Forum Muzyki',
    city: 'Wrocław',
    photo: null,
  }),
  c(3, {
    name: 'Петля Пристрастия',
    venue: '2KOŁA Pub Motocyklowy',
    dateLabel: 'Jan 5',
    photo: IMG('728056fd17e588cb37c81a1bb7b802a1'),
  }),
];
const cases: StoryData[] = [
  { ...base, concerts: long, picksLabel: 'Top gigs of the year' },
  { ...base, concerts: long.slice(0, 2), picksLabel: 'Top gigs of the year' },
  { ...base, concerts: [c(1, {})], picksLabel: 'Gig of the year', facts: base.facts.slice(0, 1) },
];

await mkdir('.dev/stories', { recursive: true });
const w = 360;
const h = 640;
const gap = 20;
const thumbs = await Promise.all(
  cases.map(async (d) =>
    sharp(await renderStory(template, d))
      .resize(w, h)
      .png()
      .toBuffer(),
  ),
);
const out = `.dev/stories/${id}-edge.png`;
await sharp({ create: { width: 3 * w + 4 * gap, height: h + 2 * gap, channels: 3, background: '#808080' } })
  .composite(thumbs.map((input, i) => ({ input, left: gap + i * (w + gap), top: gap })))
  .png()
  .toFile(out);
console.log('→', out);
