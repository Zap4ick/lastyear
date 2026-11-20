/**
 * Render every story template for a stored result, plus a side-by-side contact sheet, into .dev/stories/.
 * Uses the real Last.fm API (genres, scrobbles) and Deezer through the server's cache.
 *
 *   npm run render:stories -- --result=YVnXfDMaQs [--picks=event:1,event:2,event:3] [--t=swiss]
 *
 * With --t, only that template is rendered (to .dev/stories/<t>.png) and the contact sheet is left alone,
 * so several people can work on different templates at once.
 *
 * Without --picks, the three headliners you scrobbled most this year are used.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { lastfmPhoto, photoOptions, resolvePhoto } from '../src/shared/concert.ts';
import { artistsForTags, computeStats, nameKey, performersOf } from '../src/shared/stats.ts';
import type { ImportPayload } from '../src/shared/types.ts';
import { buildStoryData } from '../src/story/data.ts';
import { TEMPLATES } from '../src/story/templates/index.ts';
import { openDb } from '../src/server/db.ts';
import { createDeezer } from '../src/server/deezer.ts';
import { createLastfm } from '../src/server/lastfm.ts';
import { renderStory } from '../src/server/render.ts';

try {
  process.loadEnvFile();
} catch {
  /* no .env */
}
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => a.slice(2).split('=') as [string, string]),
);
const db = openDb(process.env.DB_PATH ?? 'data/lastfmyear.db');
const row = db.getResult(args.result ?? '');
if (!row) throw new Error(`No result "${args.result}". Pass --result=<id from /r/<id>>`);
const payload = JSON.parse(row.payload) as ImportPayload;
const lastfm = createLastfm({ apiKey: process.env.LASTFM_API_KEY, db });
const deezer = createDeezer({ db });

const artists = artistsForTags(payload);
const [tagList, chart] = await Promise.all([
  Promise.all(artists.map((a) => lastfm.getTags(a).catch(() => []))),
  lastfm.getYearChart(payload.username, payload.year).catch(() => undefined),
]);
const tags = Object.fromEntries(artists.map((a, i) => [a, tagList[i]!]));
const stats = computeStats(payload, { tags, chart });

let keys = args.picks?.split(',');
if (!keys) {
  const plays = new Map(chart?.artists.map((a) => [nameKey(a.name), a.playcount]));
  keys = payload.concerts
    .filter((c) => c.kind === 'event')
    .map((c) => ({ c, p: plays.get(nameKey(performersOf(c)[0]?.name ?? '')) ?? 0 }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map(({ c }) => `${c.kind}:${c.id}`);
}

const picks = await Promise.all(
  keys.map(async (key) => {
    const c = payload.concerts.find((x) => `${x.kind}:${x.id}` === key)!;
    const head = performersOf(c)[0]?.name;
    const fallback = !lastfmPhoto(c) && head ? await deezer.getPhoto(head).catch(() => null) : null;
    return { key, photo: resolvePhoto({ photo: null }, photoOptions(c, fallback)) };
  }),
);
const data = buildStoryData(payload, picks, stats);
console.log(data.concerts.map((c) => `#${c.rank} ${c.name} (${c.dateLabel})`).join('\n'));
console.log(data.facts.map((f) => `${f.label}: ${f.value}`).join('\n'));

await mkdir('.dev/stories', { recursive: true });
const pngs: Buffer[] = [];
const only = args.t ? TEMPLATES.filter((t) => t.id === args.t) : TEMPLATES;
if (!only.length) throw new Error(`No template "${args.t}"`);
for (const t of only) {
  const t0 = Date.now();
  const png = await renderStory(t, data);
  await writeFile(`.dev/stories/${t.id}.png`, png);
  pngs.push(png);
  console.log(`${t.id}: ${Math.round(png.length / 1024)} KB, ${Date.now() - t0} ms`);
}

if (args.t) {
  db.close();
  process.exit(0);
}

// Contact sheet: all designs side by side at 1/3 size.
const w = 360;
const h = 640;
const gap = 24;
const thumbs = await Promise.all(pngs.map((p) => sharp(p).resize(w, h).png().toBuffer()));
await sharp({
  create: { width: thumbs.length * (w + gap) + gap, height: h + 2 * gap, channels: 3, background: '#808080' },
})
  .composite(thumbs.map((input, i) => ({ input, left: gap + i * (w + gap), top: gap })))
  .png()
  .toFile('.dev/stories/all.png');
console.log('→ .dev/stories/all.png');
db.close();
